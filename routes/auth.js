const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');
const { authenticateToken, requireRole } = require('../middleware/auth');

const { writeAudit, writeLoginAttempt, recordLoginFailure, isLoginLocked, clearLoginFailures } = require('../services/audit');
const { createNotification, getIo } = require('../services/notification');

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

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      recordLoginFailure(rawIp, username);
      await writeLoginAttempt(req, user.id, user.username, false, { reason: 'Invalid password' });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    clearLoginFailures(rawIp, username);

    // Suspended check (after password so we don't reveal suspension to unauthenticated attempts)
    const userPerms = (() => { try { const p = user.permissions; if (!p) return {}; if (typeof p === 'object') return p; return JSON.parse(p); } catch { return {}; } })();
    if (userPerms.suspended && user.role !== 'god') {
      return res.status(403).json({ error: 'Your account has been suspended. Contact your administrator.' });
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

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_color: user.avatar_color,
        avatar_seed:  user.avatar_seed,
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

    createNotification(null, req.user.id, {
      type: 'info', title: 'New User Created',
      message: `${username} registered as ${assignedRole} by ${req.user.username}`,
    }).catch(() => {});

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

    createNotification(null, req.user.id, {
      type: 'warning', title: 'Role Changed',
      message: `${targetUser.username} role changed: ${oldRole} → ${role}`,
    }).catch(() => {});

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

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
