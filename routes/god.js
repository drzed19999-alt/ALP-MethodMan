/**
 * God-only user management routes
 * Only the `god` role can access any endpoint in this file.
 *
 * POST   /api/god/users          create user (any role)
 * GET    /api/god/users          list all users
 * PUT    /api/god/users/:id      update role, permissions, optional password reset
 * DELETE /api/god/users/:id      delete user (not self, not other gods)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { authenticateToken, requireGod } = require('../middleware/auth');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');

router.use(authenticateToken);
router.use(requireGod);

function parsePerms(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

// ─── GET /api/god/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const db = getAdapter();
    let users;
    if (isSupabaseConfigured()) {
      const { data, error } = await getSupabase()
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      users = data;
    } else {
      users = await db.all('SELECT * FROM users ORDER BY created_at DESC');
    }
    // Strip sensitive fields, parse permissions
    users = users.map(({ password_hash, session_token, ...u }) => ({
      ...u,
      permissions: parsePerms(u.permissions),
    }));
    res.json({ users });
  } catch (err) {
    console.error('[god/users] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/god/users ─────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const db = getAdapter();
    const { username, email, password, role = 'viewer' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const validRoles = ['viewer', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
    }

    const avatarColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'];
    const avatar_color = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    const hash = bcrypt.hashSync(password, 10);

    let newUserId;
    if (isSupabaseConfigured()) {
      const { data: existing } = await getSupabase()
        .from('users').select('id').or(`username.eq.${username},email.eq.${email}`).single();
      if (existing) return res.status(409).json({ error: 'Username or email already exists' });

      // Try with permissions, fall back without it if column doesn't exist yet
      let insertError;
      let insertData;
      ({ data: insertData, error: insertError } = await getSupabase()
        .from('users')
        .insert({ username, email, password_hash: hash, role, avatar_color, permissions: {} })
        .select('id').single());
      if (insertError && insertError.code === '42703') {
        // permissions column not yet added — insert without it
        ({ data: insertData, error: insertError } = await getSupabase()
          .from('users')
          .insert({ username, email, password_hash: hash, role, avatar_color })
          .select('id').single());
      }
      if (insertError) throw insertError;
      newUserId = insertData.id;
    } else {
      const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
      if (existing) return res.status(409).json({ error: 'Username or email already exists' });

      const result = await db.run(
        'INSERT INTO users (username, email, password_hash, role, avatar_color, permissions) VALUES (?, ?, ?, ?, ?, ?)',
        [username, email, hash, role, avatar_color, '{}']
      );
      newUserId = result.lastInsertRowid;
    }

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `[god] Created user: ${username}`, 'auth',
        JSON.stringify({ new_user_id: newUserId, role }), req.ip]
    );

    res.status(201).json({ message: 'User created', user: { id: newUserId, username, email, role, avatar_color } });
  } catch (err) {
    console.error('[god/users] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/god/users/:id ──────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const { role, permissions, password } = req.body;

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot modify your own account via this endpoint. Use Settings → Account.' });
    }

    const target = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'god') {
      return res.status(403).json({ error: 'Cannot modify another god account' });
    }

    const validRoles = ['viewer', 'admin', 'super_admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const permsJson = permissions !== undefined
      ? (isSupabaseConfigured() ? permissions : JSON.stringify(permissions))
      : undefined;

    if (isSupabaseConfigured()) {
      const updates = {};
      if (role) updates.role = role;
      if (permissions !== undefined) updates.permissions = permissions;
      if (password) updates.password_hash = bcrypt.hashSync(password, 10);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

      let { error } = await getSupabase().from('users').update(updates).eq('id', userId);
      if (error && error.code === '42703' && updates.permissions !== undefined) {
        // permissions column not yet added — retry without it
        const { permissions: _p, ...rest } = updates;
        ({ error } = await getSupabase().from('users').update(rest).eq('id', userId));
      }
      if (error) throw error;
    } else {
      const sets = [];
      const vals = [];
      if (role) { sets.push('role = ?'); vals.push(role); }
      if (permissions !== undefined) { sets.push('permissions = ?'); vals.push(permsJson); }
      if (password) { sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(password, 10)); }
      if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(userId);
      await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    }

    const changes = [];
    if (role) changes.push(`role→${role}`);
    if (permissions !== undefined) changes.push('permissions updated');
    if (password) changes.push('password reset');

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `[god] Updated user: ${target.username}`, 'auth',
        JSON.stringify({ target_user_id: userId, changes }), req.ip]
    );

    res.json({ message: 'User updated', changes });
  } catch (err) {
    console.error('[god/users] update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/god/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const target = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'god') {
      return res.status(403).json({ error: 'Cannot delete another god account' });
    }

    if (isSupabaseConfigured()) {
      const { error } = await getSupabase().from('users').delete().eq('id', userId);
      if (error) throw error;
    } else {
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `[god] Deleted user: ${target.username}`, 'auth',
        JSON.stringify({ deleted_user_id: userId, deleted_role: target.role }), req.ip]
    );

    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('[god/users] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/god/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const db = getAdapter();
    const last24h = new Date(Date.now() - 86400000).toISOString();

    const [byRoleRows, recentLoginsRow, failedLoginsRow, activeSessionsRow] = await Promise.all([
      db.all('SELECT role, COUNT(*) as count FROM users GROUP BY role'),
      db.get("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'User logged in' AND timestamp >= ?", [last24h]),
      db.get("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'Login failed' AND timestamp >= ?", [last24h]),
      db.get('SELECT COUNT(*) as count FROM users WHERE session_token IS NOT NULL'),
    ]);

    const byRole = {};
    (byRoleRows || []).forEach(r => { byRole[r.role] = r.count; });

    const io = req.app.get('io');
    let onlineCount = 0;
    const onlineIds = [];
    if (io) {
      const adminNsp = io.of('/admin');
      if (adminNsp && adminNsp.sockets) {
        const seen = new Set();
        for (const [, sock] of adminNsp.sockets) {
          if (sock.user && !seen.has(sock.user.id)) {
            seen.add(sock.user.id);
            onlineIds.push(sock.user.id);
            onlineCount++;
          }
        }
      }
    }

    res.json({
      byRole,
      total: Object.values(byRole).reduce((a, b) => a + b, 0),
      onlineCount,
      onlineIds,
      recentLogins: recentLoginsRow?.count || 0,
      failedLogins: failedLoginsRow?.count || 0,
      activeSessions: activeSessionsRow?.count || 0,
    });
  } catch (err) {
    console.error('[god/stats] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/god/presence ───────────────────────────────────────────────────
router.get('/presence', async (req, res) => {
  try {
    const io = req.app.get('io');
    const online = [];
    if (io) {
      const adminNsp = io.of('/admin');
      if (adminNsp && adminNsp.sockets) {
        const seen = new Set();
        for (const [, sock] of adminNsp.sockets) {
          if (sock.user && !seen.has(sock.user.id)) {
            seen.add(sock.user.id);
            online.push({
              userId: sock.user.id,
              username: sock.user.username,
              role: sock.user.role,
              connectedAt: sock.handshake?.issued ? new Date(sock.handshake.issued).toISOString() : null,
              ip: sock.handshake?.address || null,
            });
          }
        }
      }
    }
    res.json({ online });
  } catch (err) {
    console.error('[god/presence] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/god/users/:id/history ─────────────────────────────────────────
router.get('/users/:id/history', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);

    const target = await db.get('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const rows = await db.all(
      "SELECT * FROM audit_logs WHERE user_id = ? AND action IN ('User logged in', 'Login failed') ORDER BY timestamp DESC LIMIT 100",
      [userId]
    );

    const history = rows.map(r => {
      try { r.details = typeof r.details === 'string' ? JSON.parse(r.details || '{}') : (r.details || {}); } catch { r.details = {}; }
      return r;
    });

    res.json({ history });
  } catch (err) {
    console.error('[god/history] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/god/users/:id/terminate ──────────────────────────────────────
router.post('/users/:id/terminate', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user.id) return res.status(400).json({ error: 'Cannot terminate your own session' });

    const target = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'god') return res.status(403).json({ error: 'Cannot terminate another god session' });

    if (isSupabaseConfigured()) {
      const { error } = await getSupabase().from('users').update({ session_token: null }).eq('id', userId);
      if (error) throw error;
    } else {
      await db.run('UPDATE users SET session_token = NULL WHERE id = ?', [userId]);
    }

    // Also disconnect the socket if connected
    const io = req.app.get('io');
    if (io) {
      const adminNsp = io.of('/admin');
      if (adminNsp && adminNsp.sockets) {
        for (const [, sock] of adminNsp.sockets) {
          if (sock.user && sock.user.id === userId) {
            sock.emit('admin:session-terminated', { message: 'Your session was terminated by an administrator.' });
            sock.disconnect(true);
          }
        }
      }
    }

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `[god] Terminated session: ${target.username}`, 'auth',
        JSON.stringify({ target_user_id: userId }), req.ip]
    );

    res.json({ message: `Session terminated for ${target.username}` });
  } catch (err) {
    console.error('[god/terminate] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/god/users/:id/suspend ───────────────────────────────────────
router.patch('/users/:id/suspend', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const { suspended } = req.body;

    if (userId === req.user.id) return res.status(400).json({ error: 'Cannot suspend your own account' });

    const target = await db.get('SELECT id, username, role, permissions FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'god') return res.status(403).json({ error: 'Cannot suspend another god account' });

    const perms = parsePerms(target.permissions);
    perms.suspended = !!suspended;

    if (isSupabaseConfigured()) {
      const { error } = await getSupabase().from('users').update({ permissions: perms }).eq('id', userId);
      if (error) throw error;
    } else {
      await db.run('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(perms), userId]);
    }

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username,
        `[god] ${suspended ? 'Suspended' : 'Activated'} user: ${target.username}`, 'auth',
        JSON.stringify({ target_user_id: userId, suspended: !!suspended }), req.ip]
    );

    res.json({ message: suspended ? `${target.username} suspended` : `${target.username} activated`, suspended: !!suspended });
  } catch (err) {
    console.error('[god/suspend] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
