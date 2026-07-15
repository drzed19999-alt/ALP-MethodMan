const router = require('express').Router();
const { getDb } = require('../database/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ─── GET /maintenance ───────────────────────────────────────────────────────────
// Public endpoint - no auth required
router.get('/maintenance', (req, res) => {
  try {
    const db = getDb();
    const maintenanceMode = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();
    const maintenanceMessage = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_message'").get();

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
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all();

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
router.put('/', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    const updatedKeys = [];
    const transaction = db.transaction((entries) => {
      for (const [key, value] of entries) {
        upsert.run(key, String(value));
        updatedKeys.push(key);
      }
    });

    transaction(Object.entries(settings));

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Updated settings', 'settings',
      JSON.stringify({ keys: updatedKeys, values: settings }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('system', '⚙️', `${req.user.username} updated settings: ${updatedKeys.join(', ')}`,
      JSON.stringify({ keys: updatedKeys }));

    // Re-fetch all settings
    const rows = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all();
    const allSettings = {};
    rows.forEach(row => { allSettings[row.key] = row.value; });

    res.json({ message: 'Settings updated', settings: allSettings });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /reset ────────────────────────────────────────────────────────────────
router.post('/reset', requireRole('super_admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM settings').run();
    
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

    const stmt = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
    for (const [k, v] of defaultSettings) {
      stmt.run(k, v);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Reset settings to defaults', 'system', '{}', req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('system', '⚙️', `${req.user.username} reset settings to defaults`, '{}');

    res.json({ message: 'Settings reset to defaults successfully' });
  } catch (err) {
    console.error('Reset settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
