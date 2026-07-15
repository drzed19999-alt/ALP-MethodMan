const { getDb } = require('../database/init');

/**
 * Check if maintenance mode is currently enabled.
 *
 * @returns {boolean}
 */
function isMaintenanceMode() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();
  return row ? row.value === '1' : false;
}

/**
 * Get the current maintenance message.
 *
 * @returns {string}
 */
function getMaintenanceMessage() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_message'").get();
  return row ? row.value : 'We are currently performing scheduled maintenance. Please check back soon.';
}

/**
 * Enable or disable maintenance mode.
 *
 * @param {boolean} enabled - Whether to enable maintenance mode
 * @param {string} [message] - Optional custom maintenance message
 */
function toggle(enabled, message) {
  const db = getDb();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('maintenance_mode', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(enabled ? '1' : '0');

  if (message !== undefined && message !== null) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES ('maintenance_message', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(message);
  }

  return {
    enabled: !!enabled,
    message: message || getMaintenanceMessage()
  };
}

module.exports = {
  isMaintenanceMode,
  getMaintenanceMessage,
  toggle
};
