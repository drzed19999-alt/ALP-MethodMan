const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ─── POST /login ────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
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
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
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

    const tokenExpiry = rememberMe ? '30d' : config.jwt.expiresIn;
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, sessionToken },
      config.jwt.secret,
      { expiresIn: tokenExpiry }
    );

    // Audit log
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [user.id, user.username, 'User logged in', 'auth', '{}', req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['auth', '🔐', `${user.username} logged in`, JSON.stringify({ user_id: user.id })]);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_color: user.avatar_color
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
    const auditUserId = req.user ? req.user.id : result.lastInsertRowid;
    const auditUsername = req.user ? req.user.username : username;
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [auditUserId, auditUsername, `Created user account: ${username}`, 'auth',
      JSON.stringify({ new_user_id: result.lastInsertRowid, role: assignedRole }), req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['auth', '👤', `New user registered: ${username} (${assignedRole})`, JSON.stringify({ user_id: result.lastInsertRowid })]);

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
      SELECT id, username, email, role, avatar_color, created_at, last_login
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /me ────────────────────────────────────────────────────────────────────
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const db = getAdapter();
    const { email, password, avatar_color } = req.body;
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

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      updates.push('password_hash = ?');
      values.push(bcrypt.hashSync(password, 10));
    }

    if (avatar_color) {
      updates.push('avatar_color = ?');
      values.push(avatar_color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    // Audit log
    const changedFields = [];
    if (email) changedFields.push('email');
    if (password) changedFields.push('password');
    if (avatar_color) changedFields.push('avatar_color');

    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, 'Updated profile', 'auth',
      JSON.stringify({ fields: changedFields }), req.ip]);

    const updatedUser = await db.get(`
      SELECT id, username, email, role, avatar_color, created_at, last_login
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
      SELECT id, username, email, role, avatar_color, created_at, last_login
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
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `Changed role for ${targetUser.username}`, 'auth',
      JSON.stringify({ target_user_id: userId, target_username: targetUser.username, old_role: oldRole, new_role: role }), req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['admin', '🛡️', `${targetUser.username}'s role changed from ${oldRole} to ${role}`,
      JSON.stringify({ user_id: userId })]);

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
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `Deleted user: ${targetUser.username}`, 'auth',
      JSON.stringify({ deleted_user_id: userId, deleted_username: targetUser.username, deleted_role: targetUser.role }), req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['admin', '🗑️', `User deleted: ${targetUser.username}`,
      JSON.stringify({ user_id: userId })]);

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
