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
const { invalidateUserScope } = require('../middleware/scope');
const { writeAudit } = require('../services/audit');
const { createNotification, notifyGods, actorLabel } = require('../services/notification');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');
const { PAGE_ACTIONS } = require('../middleware/permissions-catalog');

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
    // Count each user's owned websites (single aggregate query) so god can see
    // inventory at a glance.
    const ownedByUser = new Map();
    try {
      const rows = await db.all('SELECT owner_id, COUNT(*)::int AS n FROM websites GROUP BY owner_id', []);
      for (const r of rows || []) {
        ownedByUser.set(Number(r.owner_id), Number(r.n));
      }
    } catch (e) {
      // Fallback for SQLite (no ::int) or if the count query errors — non-fatal.
      try {
        const rows = await db.all('SELECT owner_id, COUNT(*) AS n FROM websites GROUP BY owner_id', []);
        for (const r of rows || []) ownedByUser.set(Number(r.owner_id), Number(r.n));
      } catch { /* ignore */ }
    }

    // Strip sensitive fields, parse permissions, attach owned-website count.
    users = users.map(({ password_hash, session_token, ...u }) => ({
      ...u,
      permissions: parsePerms(u.permissions),
      owned_websites: u.role === 'god' ? null : (ownedByUser.get(Number(u.id)) || 0),
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
    const { username, password, role = 'viewer' } = req.body;
    let { email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    // Email is optional from the UI; auto-generate a stable internal one so the
    // NOT NULL / UNIQUE constraint on users.email is satisfied.
    if (!email || !String(email).trim()) {
      email = `${String(username).toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@internal.alp`;
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

    await writeAudit(req, `[god] Created user: ${username}`, 'auth', { new_user_id: newUserId, role });

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
    const { role, permissions, password, forceChange, ip_allowlist } = req.body;

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

    // Normalize IP allow-list if provided — must be array of strings (CIDRs or IPs)
    let ipAllowJson;
    if (ip_allowlist !== undefined) {
      if (!Array.isArray(ip_allowlist)) return res.status(400).json({ error: 'ip_allowlist must be an array' });
      const cleaned = ip_allowlist.map(s => String(s).trim()).filter(Boolean);
      ipAllowJson = isSupabaseConfigured() ? cleaned : JSON.stringify(cleaned);
    }

    if (isSupabaseConfigured()) {
      const updates = {};
      if (role) updates.role = role;
      if (permissions !== undefined) updates.permissions = permissions;
      if (password) {
        updates.password_hash = bcrypt.hashSync(password, 10);
        if (forceChange) updates.password_must_change = 1;
        else if (forceChange === false) updates.password_must_change = 0;
      } else if (forceChange !== undefined) {
        updates.password_must_change = forceChange ? 1 : 0;
      }
      if (ip_allowlist !== undefined) updates.ip_allowlist = ipAllowJson;
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
      if (password) {
        sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(password, 10));
        if (forceChange) { sets.push('password_must_change = ?'); vals.push(1); }
        else if (forceChange === false) { sets.push('password_must_change = ?'); vals.push(0); }
      } else if (forceChange !== undefined) {
        sets.push('password_must_change = ?'); vals.push(forceChange ? 1 : 0);
      }
      if (ip_allowlist !== undefined) { sets.push('ip_allowlist = ?'); vals.push(ipAllowJson); }
      if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(userId);
      await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    }

    const changes = [];
    if (role) changes.push(`role→${role}`);
    if (permissions !== undefined) changes.push('permissions updated');
    if (password) changes.push('password reset');

    await writeAudit(req, `[god] Updated user: ${target.username}`, 'auth', { target_user_id: userId, changes });

    // Live push: if the affected user has an active admin socket, tell them
    // to re-fetch permissions and re-render their sidebar. No re-login needed.
    if (permissions !== undefined || role) {
      const io = req.app.get('io');
      if (io) {
        const adminNsp = io.of('/admin');
        if (adminNsp && adminNsp.sockets) {
          for (const [, sock] of adminNsp.sockets) {
            if (sock.user && Number(sock.user.id) === Number(userId)) {
              sock.emit('admin:permissions-changed', {
                message: 'Your permissions were updated by an administrator.',
                changes,
              });
            }
          }
        }
      }
    }

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
    const hard = req.query.hard === '1';

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const target = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'god') {
      return res.status(403).json({ error: 'Cannot delete another god account' });
    }

    // Soft delete by default — sets deleted_at so we can restore within 7 days.
    // `?hard=1` bypasses and does a real DELETE (for permanent purge).
    if (hard) {
      if (isSupabaseConfigured()) {
        const { error } = await getSupabase().from('users').delete().eq('id', userId);
        if (error) throw error;
      } else {
        await db.run('DELETE FROM users WHERE id = ?', [userId]);
      }
      await writeAudit(req, `[god] HARD-deleted user: ${target.username}`, 'auth', { deleted_user_id: userId, deleted_role: target.role, hard: true });
      return res.json({ message: 'User hard-deleted', hard: true });
    }

    await db.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    await writeAudit(req, `[god] Soft-deleted user: ${target.username}`, 'auth', { deleted_user_id: userId, deleted_role: target.role, soft: true, restore_window_days: 7 });

    const actor = await actorLabel(req.user.id);
    notifyGods(null, {
      type: 'warning', event: 'user_deleted',
      title: 'User Soft-Deleted',
      message: `${actor} soft-deleted ${target.username} (${target.role}). Undo within 10 min or restore within 7 days.`,
      link: `/user-management?open=${userId}`,
      undo: { kind: 'user_delete', params: { user_id: userId } },
    }, { actorId: req.user.id });

    res.json({ message: 'User deleted (soft) — will purge in 7 days if not restored', soft: true, restoreWindowDays: 7 });
  } catch (err) {
    console.error('[god/users] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/god/users/:id/restore ────────────────────────────────────────
// Undo a soft-delete (clears deleted_at). Only works within the 7-day window.
router.post('/users/:id/restore', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const target = await db.get('SELECT id, username, deleted_at FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!target.deleted_at) return res.status(400).json({ error: 'User is not deleted' });
    // Enforce 7-day window (7 * 86400 * 1000 ms)
    const deletedAt = new Date(target.deleted_at).getTime();
    if (Date.now() - deletedAt > 7 * 86400000) {
      return res.status(410).json({ error: 'Restore window expired (>7 days). Purge cron will remove this row.' });
    }
    await db.run('UPDATE users SET deleted_at = NULL WHERE id = ?', [userId]);
    await writeAudit(req, `[god] Restored user: ${target.username}`, 'auth', { user_id: userId });
    res.json({ message: 'User restored', user_id: userId });
  } catch (err) {
    console.error('[god/users] restore error:', err);
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

    await writeAudit(req, `[god] Terminated session: ${target.username}`, 'auth', { target_user_id: userId });

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

    await writeAudit(req, `[god] ${suspended ? 'Suspended' : 'Activated'} user: ${target.username}`, 'auth', { target_user_id: userId, suspended: !!suspended });

    // Tell the target user first (banner on their next load)
    createNotification(null, userId, {
      type: suspended ? 'error' : 'success',
      event: suspended ? 'suspended' : 'reactivated',
      title: suspended ? 'Account Suspended' : 'Account Reactivated',
      message: suspended
        ? 'Your account was suspended. Contact an administrator.'
        : 'Your account has been reactivated. You can sign in normally.',
    });
    // And every other god so the fleet knows
    const actor = await actorLabel(req.user.id);
    notifyGods(null, {
      type: suspended ? 'warning' : 'info',
      event: suspended ? 'user_suspended' : 'user_reactivated',
      title: suspended ? 'User Suspended' : 'User Reactivated',
      message: `${actor} ${suspended ? 'suspended' : 'reactivated'} ${target.username}.`,
      link: `/user-management?open=${userId}`,
    }, { actorId: req.user.id });

    res.json({ message: suspended ? `${target.username} suspended` : `${target.username} activated`, suspended: !!suspended });
  } catch (err) {
    console.error('[god/suspend] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/god/users/:id/websites ────────────────────────────────────────
// Returns the list of website IDs currently assigned to this user.
router.get('/users/:id/websites', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);

    const target = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // god sees everything by definition — return all site IDs for symmetry
    if (target.role === 'god') {
      const all = await db.all('SELECT id FROM websites', []);
      return res.json({ website_ids: (all || []).map(r => Number(r.id)), unrestricted: true });
    }

    let rows;
    try {
      rows = await db.all('SELECT website_id FROM user_websites WHERE user_id = ?', [userId]);
    } catch (tblErr) {
      const msg = (tblErr && tblErr.message || '').toLowerCase();
      if (msg.includes('user_websites') || msg.includes('no such table') || msg.includes('does not exist') || msg.includes('42p01')) {
        return res.status(503).json({
          error: 'user_websites table missing — apply database/migrations/004_user_websites.sql in Supabase, then retry.',
          code: 'MIGRATION_REQUIRED',
        });
      }
      throw tblErr;
    }
    res.json({
      website_ids: (rows || []).map(r => Number(r.website_id)),
      unrestricted: false,
    });
  } catch (err) {
    console.error('[god/users/:id/websites] get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/god/users/:id/websites ────────────────────────────────────────
// Replace-all: body { website_ids: [1, 5, 12] }. god targets are refused.
router.put('/users/:id/websites', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const { website_ids } = req.body || {};

    if (!Array.isArray(website_ids)) {
      return res.status(400).json({ error: 'website_ids must be an array of numbers' });
    }
    const cleaned = [...new Set(website_ids.map(n => parseInt(n, 10)).filter(Number.isFinite))];

    const target = await db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'god') {
      return res.status(400).json({ error: 'god role has unrestricted access — cannot assign a scoped website list' });
    }

    // Validate that every requested website actually exists (avoid dangling rows).
    if (cleaned.length) {
      const placeholders = cleaned.map(() => '?').join(',');
      const found = await db.all(`SELECT id FROM websites WHERE id IN (${placeholders})`, cleaned);
      const foundIds = new Set((found || []).map(r => Number(r.id)));
      const missing = cleaned.filter(id => !foundIds.has(id));
      if (missing.length) {
        return res.status(400).json({ error: `Unknown website_id(s): ${missing.join(', ')}` });
      }
    }

    // Diff against current assignments and issue minimum writes.
    const currentRows = await db.all('SELECT website_id FROM user_websites WHERE user_id = ?', [userId]);
    const currentSet = new Set((currentRows || []).map(r => Number(r.website_id)));
    const nextSet = new Set(cleaned);

    const toAdd    = [...nextSet].filter(id => !currentSet.has(id));
    const toRemove = [...currentSet].filter(id => !nextSet.has(id));

    for (const wid of toAdd) {
      await db.run(
        'INSERT INTO user_websites (user_id, website_id) VALUES (?, ?)',
        [userId, wid]
      );
    }
    if (toRemove.length) {
      const placeholders = toRemove.map(() => '?').join(',');
      await db.run(
        `DELETE FROM user_websites WHERE user_id = ? AND website_id IN (${placeholders})`,
        [userId, ...toRemove]
      );
    }

    // Kill the scope cache immediately so the next request from this user is fresh.
    invalidateUserScope(userId);

    await writeAudit(req, `[god] Updated website assignments for: ${target.username}`, 'auth', { target_user_id: userId, added: toAdd, removed: toRemove, total: cleaned.length });

    res.json({
      message: 'Website assignments updated',
      website_ids: cleaned,
      added: toAdd,
      removed: toRemove,
    });
  } catch (err) {
    console.error('[god/users/:id/websites] put error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/god/permissions/catalog ───────────────────────────────────────
// Returns the shared page/action catalog so the god user-management UI can
// render toggles without duplicating the definitions.
router.get('/permissions/catalog', (req, res) => {
  res.json({ pages: PAGE_ACTIONS });
});

// ─── GET/POST/DELETE /api/god/users/:id/notes ───────────────────────────────
// User notes (free-text ledger visible only to god). Author is tracked so a
// reader can see who wrote what.
router.get('/users/:id/notes', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const notes = await db.all(
      `SELECT n.id, n.note, n.created_at, n.author_id, u.username AS author_name
       FROM user_notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 200`,
      [userId]
    );
    res.json({ notes });
  } catch (err) {
    console.error('[god/notes] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/users/:id/notes', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ error: 'note is required' });
    if (note.length > 2000) return res.status(400).json({ error: 'note too long (max 2000 chars)' });
    await db.run('INSERT INTO user_notes (user_id, author_id, note) VALUES (?, ?, ?)',
      [userId, req.user.id, note]);
    await writeAudit(req, 'Added user note', 'auth', { user_id: userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[god/notes] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.delete('/users/:id/notes/:noteId', async (req, res) => {
  try {
    const db = getAdapter();
    const noteId = parseInt(req.params.noteId, 10);
    await db.run('DELETE FROM user_notes WHERE id = ?', [noteId]);
    await writeAudit(req, 'Deleted user note', 'auth', { user_id: req.params.id, note_id: noteId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[god/notes] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/god/users/:id/activity ────────────────────────────────────────
// Merged timeline: login history + audit_feed actions authored by this user.
// Sorted DESC, capped at 200 rows.
router.get('/users/:id/activity', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Grab login attempts + audit rows in parallel; merge and sort in JS.
    const [logins, audits] = await Promise.all([
      db.all(
        `SELECT id, action, timestamp, ip_address, details FROM audit_logs
         WHERE user_id = ? AND category = 'auth'
         ORDER BY timestamp DESC LIMIT 100`,
        [userId]
      ).catch(() => []),
      db.all(
        `SELECT id, action, timestamp, ip_address, details, category FROM audit_logs
         WHERE user_id = ? AND category != 'auth'
         ORDER BY timestamp DESC LIMIT 200`,
        [userId]
      ).catch(() => []),
    ]);

    const merged = [
      ...(logins || []).map(r => ({ kind: 'auth', ...r })),
      ...(audits || []).map(r => ({ kind: 'action', ...r })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 200);

    res.json({ activity: merged });
  } catch (err) {
    console.error('[god/activity] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET/DELETE /api/god/users/:id/sessions ─────────────────────────────────
// Live session inventory built from admin socket connections. Each entry:
//   { socketId, ip, connectedAt, ua, kind: 'admin' }
router.get('/users/:id/sessions', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const io = req.app.get('io');
    const out = [];
    if (io && io.of) {
      const adminNsp = io.of('/admin');
      if (adminNsp && adminNsp.sockets) {
        for (const [id, sock] of adminNsp.sockets) {
          if (sock.user && Number(sock.user.id) === Number(userId)) {
            out.push({
              socketId: id,
              ip: sock.handshake?.address || '',
              userAgent: sock.handshake?.headers?.['user-agent'] || '',
              connectedAt: sock.handshake?.issued ? new Date(sock.handshake.issued).toISOString() : null,
              kind: 'admin-socket',
            });
          }
        }
      }
    }
    res.json({ sessions: out });
  } catch (err) {
    console.error('[god/sessions] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.delete('/users/:id/sessions/:socketId', async (req, res) => {
  try {
    const io = req.app.get('io');
    if (!io) return res.status(500).json({ error: 'Socket not available' });
    const adminNsp = io.of('/admin');
    const sock = adminNsp?.sockets?.get(req.params.socketId);
    if (!sock) return res.status(404).json({ error: 'Session not found' });
    sock.emit('admin:session-terminated', { message: 'Your session was terminated by an administrator.' });
    setTimeout(() => { try { sock.disconnect(true); } catch {} }, 300);
    await writeAudit(req, 'Terminated one session', 'auth', { user_id: req.params.id, socket_id: req.params.socketId });

    try {
      const userId = parseInt(req.params.id, 10);
      const target = await getAdapter().get('SELECT username FROM users WHERE id = ?', [userId]);
      const actor = await actorLabel(req.user.id);
      notifyGods(null, {
        type: 'warning', event: 'session_killed',
        title: 'Session Terminated',
        message: `${actor} killed a session for ${target?.username || `user #${userId}`}.`,
        link: `/user-management?open=${userId}`,
      }, { actorId: req.user.id });
    } catch {}

    res.json({ ok: true });
  } catch (err) {
    console.error('[god/sessions] kill error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/god/users/:id/reset-link ────────────────────────────────────
// Magic-link password reset. Generates a URL-safe token, writes it into
// password_reset_tokens, and returns the full link. God shares that link with
// the user out-of-band. The `/reset/:token` page (added separately) consumes it.
router.post('/users/:id/reset-link', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    const target = await db.get('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('base64url');
    const ttlHours = Math.min(72, Math.max(1, parseInt(req.body?.ttlHours, 10) || 24));
    const expires = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    await db.run(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at, created_by) VALUES (?, ?, ?, ?)',
      [userId, token, expires, req.user.id]
    );
    await writeAudit(req, `Issued reset link for ${target.username}`, 'auth', { user_id: userId, ttl_hours: ttlHours });
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host  = req.headers.host;
    const link  = `${proto}://${host}/reset/${token}`;

    const actor = await actorLabel(req.user.id);
    notifyGods(null, {
      type: 'info', event: 'reset_link_issued',
      title: 'Password Reset Link Issued',
      message: `${actor} issued a ${ttlHours}h reset link for ${target.username}.`,
      link: `/user-management?open=${userId}`,
    }, { actorId: req.user.id });

    res.json({ ok: true, token, link, expires_at: expires, ttl_hours: ttlHours });
  } catch (err) {
    console.error('[god/reset-link] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 2FA (god-side reset/disable — enrollment is user-side) ────────────────
router.post('/users/:id/tfa/reset', async (req, res) => {
  try {
    const db = getAdapter();
    const userId = parseInt(req.params.id, 10);
    await db.run('UPDATE users SET tfa_secret = NULL, tfa_enabled = 0, tfa_backup_codes = ? WHERE id = ?',
      [isSupabaseConfigured() ? [] : '[]', userId]);
    await writeAudit(req, 'Reset 2FA for user', 'auth', { user_id: userId });

    // Warn the target and every god — 2FA reset is high-signal for security
    try {
      const target = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
      createNotification(null, userId, {
        type: 'warning', event: 'tfa_reset_by_admin',
        title: 'Your 2FA Was Reset',
        message: 'An administrator reset your 2FA. Re-enroll from your account settings on next login.',
      });
      const actor = await actorLabel(req.user.id);
      notifyGods(null, {
        type: 'warning', event: 'tfa_reset',
        title: '2FA Reset by Admin',
        message: `${actor} reset 2FA on ${target?.username || `user #${userId}`}.`,
        link: `/user-management?open=${userId}`,
      }, { actorId: req.user.id });
    } catch {}

    res.json({ ok: true });
  } catch (err) {
    console.error('[god/tfa] reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.get('/users/:id/tfa', async (req, res) => {
  try {
    const db = getAdapter();
    const u = await db.get('SELECT tfa_enabled, tfa_secret IS NOT NULL AS has_secret FROM users WHERE id = ?', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ enabled: !!u.tfa_enabled, hasSecret: !!u.has_secret });
  } catch (err) {
    console.error('[god/tfa] get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
