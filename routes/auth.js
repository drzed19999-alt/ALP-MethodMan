const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');
const { authenticateToken, requireRole } = require('../middleware/auth');

const { writeAudit, writeLoginAttempt, recordLoginFailure, isLoginLocked, clearLoginFailures } = require('../services/audit');
const { createNotification, notifyGods, notifyOwnerAndGods, actorLabel, getIo } = require('../services/notification');

// ─── POST /login ────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const rawIp = (req.ip || '').replace('::ffff:', '');
    if (isLoginLocked(rawIp, username)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    const db = getAdapter();
    let user;
    if (isSupabaseConfigured()) {
      const { data } = await getSupabase()
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
      user = data;
    } else {
      user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    }

    if (!user) {
      recordLoginFailure(rawIp, username);
      await writeLoginAttempt(req, null, username, false, { reason: 'User not found' });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Soft-deleted accounts are gone as far as login is concerned
    if (user.deleted_at) {
      await writeLoginAttempt(req, user.id, user.username, false, { reason: 'Account deleted' });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      recordLoginFailure(rawIp, username);
      await writeLoginAttempt(req, user.id, user.username, false, { reason: 'Invalid password' });

      // Notify gods about a failed login on any real account — helps spot
      // credential-stuffing / targeted attacks before lockout kicks in.
      notifyGods(null, {
        type: 'warning', event: 'failed_login',
        title: 'Failed Login Attempt',
        message: `Failed password for "${username}" from ${rawIp || 'unknown IP'}.`,
        link: '/logs?category=auth',
      });

      return res.status(401).json({ error: 'Invalid username or password' });
    }

    clearLoginFailures(rawIp, username);

    // Suspended check (after password so we don't reveal suspension to unauthenticated attempts)
    const userPerms = (() => { try { const p = user.permissions; if (!p) return {}; if (typeof p === 'object') return p; return JSON.parse(p); } catch { return {}; } })();
    if (userPerms.suspended && user.role !== 'god') {
      return res.status(403).json({ error: 'Your account has been suspended. Contact your administrator.' });
    }

    // Per-user IP allow-list — if set, caller's IP must match one of the CIDRs/IPs.
    // Empty list = no restriction. Uses simple IP-equality or CIDR match.
    try {
      const rawList = user.ip_allowlist;
      const list = Array.isArray(rawList) ? rawList : (rawList ? JSON.parse(rawList) : []);
      if (list.length) {
        const ipMatch = (ip, allowed) => {
          if (allowed === ip) return true;
          if (allowed.includes('/')) {
            // Tiny IPv4 CIDR check — safe for common allow-list use
            const [net, bitsStr] = allowed.split('/');
            const bits = parseInt(bitsStr, 10) || 0;
            const toInt = (a) => a.split('.').reduce((n, o) => (n << 8) + (parseInt(o, 10) || 0), 0) >>> 0;
            const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
            return (toInt(ip) & mask) === (toInt(net) & mask);
          }
          return false;
        };
        if (!list.some(a => ipMatch(rawIp, a))) {
          await writeLoginAttempt(req, user.id, user.username, false, { reason: 'IP not in allow-list', ip: rawIp });
          return res.status(403).json({ error: 'Your IP is not permitted to sign in. Contact your administrator.' });
        }
      }
    } catch (e) { /* malformed allow-list — don't lock user out */ }

    // 2FA challenge — when enabled the user must supply a TOTP code on this
    // same request (or the follow-up request with the tfaChallengeToken).
    if (user.tfa_enabled && user.tfa_secret) {
      const totp = require('../services/totp');
      const supplied = (req.body?.tfa_code || '').replace(/\D/g, '');
      if (!supplied) {
        // Issue a short-lived challenge token so client can prompt for code
        const challenge = jwt.sign(
          { challengeFor: user.id, step: 'tfa' },
          config.jwt.secret,
          { expiresIn: '5m' }
        );
        return res.status(206).json({ tfaRequired: true, challengeToken: challenge });
      }
      if (!totp.verifyToken(user.tfa_secret, supplied)) {
        // Also try backup codes
        let backup = [];
        try { backup = Array.isArray(user.tfa_backup_codes) ? user.tfa_backup_codes : JSON.parse(user.tfa_backup_codes || '[]'); } catch {}
        const idx = backup.indexOf(supplied);
        if (idx < 0) {
          recordLoginFailure(rawIp, username);
          await writeLoginAttempt(req, user.id, user.username, false, { reason: '2FA code invalid' });
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
        // Consume the backup code
        backup.splice(idx, 1);
        await db.run('UPDATE users SET tfa_backup_codes = ? WHERE id = ?',
          [isSupabaseConfigured() ? backup : JSON.stringify(backup), user.id]);
      }
    }

    // Rotate session token on every login so other devices are kicked out.
    // god role is exempt — multiple concurrent sessions allowed.
    const crypto = require('crypto');
    let sessionToken = crypto.randomUUID();

    if (isSupabaseConfigured()) {
      // Use .select() to read back what was actually stored, so the JWT
      // always contains the exact value in the DB — no mismatch possible.
      const { data: updatedUser, error: updateErr } = await getSupabase()
        .from('users')
        .update({ last_login: new Date().toISOString(), session_token: sessionToken })
        .eq('id', user.id)
        .select('session_token')
        .single();

      if (updateErr) {
        console.error('[login] session_token update failed:', updateErr.message);
        sessionToken = null; // enforcement disabled for this token
      } else if (updatedUser?.session_token) {
        sessionToken = updatedUser.session_token; // use exactly what the DB stored
      }
    } else {
      await db.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP, session_token = ? WHERE id = ?',
        [sessionToken, user.id]
      );
    }

    const perms = (() => {
      try {
        const p = user.permissions;
        if (!p) return {};
        if (typeof p === 'object') return p;
        return JSON.parse(p);
      } catch { return {}; }
    })();

    // Ownership is now per-resource (websites.owner_id / domains.owner_id).
    // No pre-computed website list belongs in the JWT anymore.
    const tokenExpiry = rememberMe ? '30d' : config.jwt.expiresIn;
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, sessionToken, permissions: perms },
      config.jwt.secret,
      { expiresIn: tokenExpiry }
    );

    // Enriched audit log (browser / device / geo)
    await writeLoginAttempt(req, user.id, user.username, true);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [user.id, 'auth', '🔐', `${user.username} logged in`, JSON.stringify({ user_id: user.id })]);

    // Notify god of every successful sign-in (except when god themselves signs
    // in — avoid pinging yourself). Non-god actors always broadcast.
    notifyGods(null, {
      type: 'info', event: 'user_login',
      title: 'User Signed In',
      message: `${user.username} signed in from ${rawIp || 'unknown IP'}.`,
      link: `/user-management?open=${user.id}`,
    }, { actorId: user.id });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_color: user.avatar_color,
        avatar_seed:  user.avatar_seed,
        // Client should prompt the user to change their password before doing
        // anything else — god sets this flag when resetting a temp password.
        mustChangePassword: !!user.password_must_change,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ─── GET /status ────────────────────────────────────────────────────────────────
// Public endpoint for admin status check on login page
router.get('/status', async (req, res) => {
  try {
    const db = getAdapter();
    const lastUser = await db.get(`
      SELECT username, last_login, role 
      FROM users 
      WHERE session_token IS NOT NULL AND last_login IS NOT NULL
      ORDER BY last_login DESC 
      LIMIT 1
    `);

    const io = req.app.get('io');
    let connectedAdminsCount = 0;
    if (io) {
      const adminNsp = io.of('/admin');
      if (adminNsp && adminNsp.sockets) {
        connectedAdminsCount = adminNsp.sockets.size;
      }
    }

    res.json({
      online: connectedAdminsCount > 0,
      activeAdmins: connectedAdminsCount,
      lastLoginUser: lastUser ? lastUser.username : null,
      lastLoginTime: lastUser ? lastUser.last_login : null
    });
  } catch (err) {
    console.error('Admin status check error:', err);
    res.json({ online: false, activeAdmins: 0 });
  }
});


// ─── POST /register ─────────────────────────────────────────────────────────────
// First user can register without auth; subsequent users require super_admin
router.post('/register', async (req, res) => {
  try {
    const db = getAdapter();
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const isFirstUser = (userCount ? userCount.count : 0) === 0;

    // If not the first user, require super_admin authentication
    if (!isFirstUser) {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access token required. Only super_admin can create accounts.' });
      }

      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        const requestingUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', [decoded.userId]);

        if (!requestingUser || requestingUser.role !== 'super_admin') {
          return res.status(403).json({ error: 'Only super_admin can create new accounts' });
        }

        req.user = requestingUser;
      } catch (tokenErr) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check for existing username or email
    const existingUser = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const validRoles = ['viewer', 'admin', 'super_admin'];
    const assignedRole = isFirstUser ? 'super_admin' : (validRoles.includes(role) ? role : 'viewer');

    const avatarColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const hash = bcrypt.hashSync(password, 10);

    const result = await db.run(`
      INSERT INTO users (username, email, password_hash, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `, [username, email, hash, assignedRole, avatarColor]);

    // Audit log
    await writeAudit(req, `Created user account: ${username}`, 'auth', { new_user_id: result.lastInsertRowid, role: assignedRole });

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [result.lastInsertRowid, 'auth', '👤', `New user registered: ${username} (${assignedRole})`, JSON.stringify({ user_id: result.lastInsertRowid })]);

    // Every god sees the new account — creator (if any) still gets their own copy.
    if (req.user && req.user.id) {
      createNotification(null, req.user.id, {
        type: 'info', title: 'New User Created',
        message: `${username} registered as ${assignedRole} by ${req.user.username}`,
      }).catch(() => {});
    }
    notifyGods(null, {
      type: 'info', event: 'user_created',
      title: 'New User Created',
      message: req.user && req.user.id
        ? `${req.user.username} created ${username} (${assignedRole}).`
        : `New self-signup: ${username} (${assignedRole}).`,
      link: `/user-management?open=${result.lastInsertRowid}`,
    }, { actorId: req.user && req.user.id });

    createNotification(null, result.lastInsertRowid, {
      type: 'success', title: 'Welcome',
      message: `Your account was created by Outlaws Team — you are signed in as ${assignedRole}`,
    }).catch(() => {});

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: result.lastInsertRowid,
        username,
        email,
        role: assignedRole,
        avatar_color: avatarColor
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /me ────────────────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getAdapter();
    const user = await db.get(`
      SELECT id, username, email, role, avatar_color, avatar_seed, created_at, last_login
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // No pre-computed website list — the frontend just fetches /api/websites
    // and gets exactly what the caller is allowed to see.
    const scoped = { ...user };

    // Also surface the current permissions blob so the client can refresh its
    // canAccess() view when god changes them mid-session (JWT is stale).
    let perms = req.user.permissions;
    if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
    scoped.permissions = perms || {};

    res.json({ user: scoped });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /me ────────────────────────────────────────────────────────────────────
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const db = getAdapter();
    const { email, avatar_color, avatar_seed } = req.body;
    const updates = [];
    const values = [];

    if (email) {
      // Check email uniqueness
      const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      values.push(email);
    }

    if (avatar_color) {
      updates.push('avatar_color = ?');
      values.push(avatar_color);
    }

    // Avatar seed — the string fed into the procedural face generator so
    // users can "reroll" until they like the face. Empty string clears back
    // to the default (username-derived).
    if (avatar_seed !== undefined) {
      updates.push('avatar_seed = ?');
      values.push(avatar_seed ? String(avatar_seed).slice(0, 64) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    // Audit log
    const changedFields = [];
    if (email) changedFields.push('email');
    if (avatar_color) changedFields.push('avatar_color');
    if (avatar_seed !== undefined) changedFields.push('avatar_seed');

    await writeAudit(req, 'Updated profile', 'auth', { fields: changedFields });

    const updatedUser = await db.get(`
      SELECT id, username, email, role, avatar_color, avatar_seed, created_at, last_login
      FROM users WHERE id = ?
    `, [req.user.id]);

    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /users ─────────────────────────────────────────────────────────────────
router.get('/users', authenticateToken, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const users = await db.all(`
      SELECT id, username, email, role, avatar_color, avatar_seed, created_at, last_login
      FROM users ORDER BY created_at DESC
    `);

    res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /users/:id/role ────────────────────────────────────────────────────────
router.put('/users/:id/role', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const { role } = req.body;
    const userId = parseInt(req.params.id, 10);

    const validRoles = ['viewer', 'admin', 'super_admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    // Prevent self-demotion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const targetUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = targetUser.role;
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

    // Audit log
    await writeAudit(req, `Changed role for ${targetUser.username}`, 'auth', { target_user_id: userId, target_username: targetUser.username, old_role: oldRole, new_role: role });

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, 'admin', '🛡️', `${targetUser.username}'s role changed from ${oldRole} to ${role}`,
      JSON.stringify({ user_id: userId })]);

    // The actor keeps their own audit copy; every other god also sees it.
    createNotification(null, req.user.id, {
      type: 'warning', title: 'Role Changed',
      message: `${targetUser.username} role changed: ${oldRole} → ${role}`,
    }).catch(() => {});
    notifyGods(null, {
      type: 'warning', event: 'role_changed',
      title: 'Role Changed',
      message: `${req.user.username} changed ${targetUser.username}: ${oldRole} → ${role}.`,
      link: `/user-management?open=${userId}`,
    }, { actorId: req.user.id });

    if (userId !== req.user.id) {
      createNotification(null, userId, {
        type: 'info', title: 'Your Role Changed',
        message: `Your role was changed from ${oldRole} to ${role} by Outlaws Team`,
      }).catch(() => {});
    }

    res.json({ message: `Role updated to ${role}`, user_id: userId, role });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /users/:id ──────────────────────────────────────────────────────────
router.delete('/users/:id', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const targetUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [userId]);

    // Audit log
    await writeAudit(req, `Deleted user: ${targetUser.username}`, 'auth', { deleted_user_id: userId, deleted_username: targetUser.username, deleted_role: targetUser.role });

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, 'admin', '🗑️', `User deleted: ${targetUser.username}`,
      JSON.stringify({ user_id: userId })]);

    createNotification(null, req.user.id, {
      type: 'warning', title: 'User Deleted',
      message: `${targetUser.username} (${targetUser.role}) removed by ${req.user.username}`,
    }).catch(() => {});
    notifyGods(null, {
      type: 'warning', event: 'user_deleted',
      title: 'User Deleted',
      message: `${req.user.username} deleted ${targetUser.username} (${targetUser.role}).`,
      link: '/user-management',
    }, { actorId: req.user.id });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 2FA enrolment / disable (self-service) ───────────────────────────────
// GET  /tfa/setup     issue a fresh secret (writes to DB — pending activation
//                     until /tfa/confirm succeeds). Returns otpauth:// URL for
//                     the authenticator app to scan.
// POST /tfa/confirm   { token } — verifies the first code and flips tfa_enabled
// POST /tfa/disable   { token } — verifies the current code and unenrolls
router.get('/tfa/setup', authenticateToken, async (req, res) => {
  try {
    const db = getAdapter();
    const totp = require('../services/totp');
    const me = await db.get('SELECT id, username FROM users WHERE id = ?', [req.user.id]);
    if (!me) return res.status(404).json({ error: 'User not found' });
    const secret = totp.generateSecret(20);
    await db.run('UPDATE users SET tfa_secret = ?, tfa_enabled = 0 WHERE id = ?', [secret, me.id]);
    const url = totp.otpauthUrl({ issuer: 'ALP', account: me.username, secret });
    res.json({ ok: true, secret, otpauthUrl: url });
  } catch (err) {
    console.error('[tfa/setup] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/tfa/confirm', authenticateToken, async (req, res) => {
  try {
    const db = getAdapter();
    const totp = require('../services/totp');
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });
    const me = await db.get('SELECT id, tfa_secret FROM users WHERE id = ?', [req.user.id]);
    if (!me || !me.tfa_secret) return res.status(400).json({ error: 'Call /tfa/setup first' });
    if (!totp.verifyToken(me.tfa_secret, token)) return res.status(401).json({ error: 'Invalid code — check the time on your device' });
    // Generate 8 recovery codes
    const crypto = require('crypto');
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    const codesJson = isSupabaseConfigured() ? codes : JSON.stringify(codes);
    await db.run('UPDATE users SET tfa_enabled = 1, tfa_backup_codes = ? WHERE id = ?', [codesJson, me.id]);
    await writeAudit(req, 'Enabled 2FA', 'auth', { user_id: me.id });

    // Security-relevant change on the account — notify god fleet
    const actor = await actorLabel(req.user.id);
    notifyGods(null, {
      type: 'success', event: 'tfa_enabled',
      title: '2FA Enabled',
      message: `${actor} enabled two-factor authentication on their account.`,
      link: `/user-management?open=${req.user.id}`,
    }, { actorId: req.user.id });

    res.json({ ok: true, backup_codes: codes });
  } catch (err) {
    console.error('[tfa/confirm] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/tfa/disable', authenticateToken, async (req, res) => {
  try {
    const db = getAdapter();
    const totp = require('../services/totp');
    const { token } = req.body || {};
    const me = await db.get('SELECT id, tfa_secret, tfa_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!me || !me.tfa_enabled) return res.status(400).json({ error: '2FA is not enabled' });
    if (!token || !totp.verifyToken(me.tfa_secret, token)) {
      return res.status(401).json({ error: 'Invalid code — must supply current 2FA code to disable' });
    }
    await db.run('UPDATE users SET tfa_enabled = 0, tfa_secret = NULL, tfa_backup_codes = ? WHERE id = ?',
      [isSupabaseConfigured() ? [] : '[]', me.id]);
    await writeAudit(req, 'Disabled 2FA', 'auth', { user_id: me.id });

    const actor = await actorLabel(req.user.id);
    notifyGods(null, {
      type: 'warning', event: 'tfa_disabled',
      title: '2FA Disabled',
      message: `${actor} disabled two-factor authentication on their account.`,
      link: `/user-management?open=${req.user.id}`,
    }, { actorId: req.user.id });

    res.json({ ok: true });
  } catch (err) {
    console.error('[tfa/disable] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /reset/:token ────────────────────────────────────────────────────
// Public magic-link password reset. Anyone with the token can set a new
// password for its owner user. Token is single-use — marked `used_at` after.
router.post('/reset/:token', async (req, res) => {
  try {
    const db = getAdapter();
    const { password } = req.body || {};
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const row = await db.get(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?`,
      [req.params.token]
    );
    if (!row) return res.status(404).json({ error: 'Invalid or unknown reset link' });
    if (row.used_at) return res.status(410).json({ error: 'Link already used' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Link expired' });
    }
    const hash = bcrypt.hashSync(password, 10);
    await db.run('UPDATE users SET password_hash = ?, password_must_change = 0 WHERE id = ?', [hash, row.user_id]);
    await db.run('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);

    // Password just changed via magic-link — that's high-signal for god's fleet
    try {
      const target = await getAdapter().get('SELECT username FROM users WHERE id = ?', [row.user_id]);
      notifyGods(null, {
        type: 'warning', event: 'password_reset_used',
        title: 'Password Reset Completed',
        message: `${target?.username || `user #${row.user_id}`} set a new password via a reset link.`,
        link: `/user-management?open=${row.user_id}`,
      });
    } catch {}

    res.json({ ok: true, message: 'Password reset. You can now log in.' });
  } catch (err) {
    console.error('[reset] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /change-password ─────────────────────────────────────────────────
// The authenticated user sets a new password. Used to clear the
// `password_must_change` flag after god issues a temp password.
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const db = getAdapter();
    const me = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!me) return res.status(404).json({ error: 'User not found' });
    // Verify current password unless the account is in force-change state
    const inForceChange = await db.get('SELECT password_must_change FROM users WHERE id = ?', [req.user.id]);
    if (!inForceChange?.password_must_change) {
      if (!current_password) return res.status(400).json({ error: 'current_password is required' });
      if (!bcrypt.compareSync(current_password, me.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    const bcryptHash = bcrypt.hashSync(new_password, 10);
    await db.run('UPDATE users SET password_hash = ?, password_must_change = 0 WHERE id = ?', [bcryptHash, req.user.id]);
    await writeAudit(req, 'Changed own password', 'auth', { user_id: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
