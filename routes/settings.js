const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ─── GET /maintenance ───────────────────────────────────────────────────────────
// Public endpoint - no auth required
router.get('/maintenance', async (req, res) => {
  try {
    const db = getAdapter();
    const maintenanceMode = await db.get("SELECT value FROM settings WHERE key = 'maintenance_mode'");
    const maintenanceMessage = await db.get("SELECT value FROM settings WHERE key = 'maintenance_message'");

    res.json({
      maintenance_mode: maintenanceMode ? maintenanceMode.value === '1' : false,
      message: maintenanceMessage ? maintenanceMessage.value : ''
    });
  } catch (err) {
    console.error('Get maintenance status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply auth to remaining routes
router.use(authenticateToken);

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
    const rows = await db.all('SELECT key, value, updated_at FROM settings ORDER BY key');

    const settings = {};
    const meta = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
      meta[row.key] = { updated_at: row.updated_at };
    });

    res.json({ settings, meta });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT / ──────────────────────────────────────────────────────────────────────
router.put('/', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const updatedKeys = [];
    for (const [key, value] of Object.entries(settings)) {
      const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing) {
        await db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [String(value), key]);
      } else {
        await db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, String(value)]);
      }
      updatedKeys.push(key);
    }

    // Audit log
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, 'Updated settings', 'settings',
      JSON.stringify({ keys: updatedKeys, values: settings }), req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['system', '⚙️', `${req.user.username} updated settings: ${updatedKeys.join(', ')}`,
      JSON.stringify({ keys: updatedKeys })]);

    // Re-fetch all settings
    const rows = await db.all('SELECT key, value, updated_at FROM settings ORDER BY key');
    const allSettings = {};
    rows.forEach(row => { allSettings[row.key] = row.value; });

    res.json({ message: 'Settings updated', settings: allSettings });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /reset ────────────────────────────────────────────────────────────────
router.post('/reset', requireRole('super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    await db.run('DELETE FROM settings');
    
    // Re-insert default settings
    const defaultSettings = [
      ['site_name', 'Admin Live Panel'],
      ['session_timeout', '30'],
      ['max_sessions_display', '100'],
      ['data_retention_days', '90'],
      ['enable_geo_tracking', '1'],
      ['enable_activity_feed', '1'],
      ['maintenance_mode', '0'],
      ['maintenance_message', 'We are currently performing scheduled maintenance.'],
      ['notify_new_session', '1'],
      ['notify_form_data', '1'],
      ['notify_sound', '1'],
      ['notify_duration', '8']
    ];

    for (const [k, v] of defaultSettings) {
      await db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [k, v]);
    }

    // Audit log
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, 'Reset settings to defaults', 'system', '{}', req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['system', '⚙️', `${req.user.username} reset settings to defaults`, '{}']);

    res.json({ message: 'Settings reset to defaults successfully' });
  } catch (err) {
    console.error('Reset settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
