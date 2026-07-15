const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getDb } = require('../database/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ─── POST /login ────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const tokenExpiry = rememberMe ? '30d' : config.jwt.expiresIn;
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: tokenExpiry }
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, user.username, 'User logged in', 'auth', '{}', req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('auth', '🔐', `${user.username} logged in`, JSON.stringify({ user_id: user.id }));

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

// ─── POST /register ─────────────────────────────────────────────────────────────
// First user can register without auth; subsequent users require super_admin
router.post('/register', (req, res) => {
  try {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const isFirstUser = userCount.count === 0;

    // If not the first user, require super_admin authentication
    if (!isFirstUser) {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access token required. Only super_admin can create accounts.' });
      }

      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        const requestingUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.userId);

        if (!requestingUser || requestingUser.role !== 'super_admin') {
          return res.status(403).json({ error: 'Only super_admin can create new accounts' });
        }

        req.user = requestingUser;
      } catch (tokenErr) {
        return res.status(403).json({ error: 'Invalid or expired token' });
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
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const validRoles = ['viewer', 'admin', 'super_admin'];
    const assignedRole = isFirstUser ? 'super_admin' : (validRoles.includes(role) ? role : 'viewer');

    const avatarColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, email, hash, assignedRole, avatarColor);

    // Audit log
    const auditUserId = req.user ? req.user.id : result.lastInsertRowid;
    const auditUsername = req.user ? req.user.username : username;
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditUserId, auditUsername, `Created user account: ${username}`, 'auth',
      JSON.stringify({ new_user_id: result.lastInsertRowid, role: assignedRole }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('auth', '👤', `New user registered: ${username} (${assignedRole})`, JSON.stringify({ user_id: result.lastInsertRowid }));

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
router.get('/me', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT id, username, email, role, avatar_color, created_at, last_login
      FROM users WHERE id = ?
    `).get(req.user.id);

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
router.put('/me', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const { email, password, avatar_color } = req.body;
    const updates = [];
    const values = [];

    if (email) {
      // Check email uniqueness
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
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
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Audit log
    const changedFields = [];
    if (email) changedFields.push('email');
    if (password) changedFields.push('password');
    if (avatar_color) changedFields.push('avatar_color');

    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Updated profile', 'auth',
      JSON.stringify({ fields: changedFields }), req.ip);

    const updatedUser = db.prepare(`
      SELECT id, username, email, role, avatar_color, created_at, last_login
      FROM users WHERE id = ?
    `).get(req.user.id);

    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /users ─────────────────────────────────────────────────────────────────
router.get('/users', authenticateToken, requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, username, email, role, avatar_color, created_at, last_login
      FROM users ORDER BY created_at DESC
    `).all();

    res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /users/:id/role ────────────────────────────────────────────────────────
router.put('/users/:id/role', authenticateToken, requireRole('super_admin'), (req, res) => {
  try {
    const db = getDb();
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

    const targetUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = targetUser.role;
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Changed role for ${targetUser.username}`, 'auth',
      JSON.stringify({ target_user_id: userId, target_username: targetUser.username, old_role: oldRole, new_role: role }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('admin', '🛡️', `${targetUser.username}'s role changed from ${oldRole} to ${role}`,
      JSON.stringify({ user_id: userId }));

    res.json({ message: `Role updated to ${role}`, user_id: userId, role });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /users/:id ──────────────────────────────────────────────────────────
router.delete('/users/:id', authenticateToken, requireRole('super_admin'), (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.id, 10);

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const targetUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Deleted user: ${targetUser.username}`, 'auth',
      JSON.stringify({ deleted_user_id: userId, deleted_username: targetUser.username, deleted_role: targetUser.role }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('admin', '🗑️', `User deleted: ${targetUser.username}`,
      JSON.stringify({ user_id: userId }));

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
