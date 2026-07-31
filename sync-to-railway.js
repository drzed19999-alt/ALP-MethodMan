/**
 * sync-to-railway.js
 * Syncs ALL websites from localhost DB → Railway.
 * - Creates missing websites on Railway
 * - Updates existing ones (name, color, logo, active state)
 * - Links all real domains and activates them
 * - Skips "localhost" as a primary domain (keeps what Railway already has)
 *
 * Usage:
 *   node sync-to-railway.js
 */

require('dotenv').config();
const https  = require('https');
const http   = require('http');
const path   = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const RAILWAY_URL = process.env.RAILWAY_URL || 'https://alp-methodman-production.up.railway.app';
const ADMIN_USER  = process.env.RAILWAY_ADMIN_USER || 'admin';
const ADMIN_PASS  = process.env.RAILWAY_ADMIN_PASS; // set in .env: RAILWAY_ADMIN_PASS=yourpassword
// ─────────────────────────────────────────────────────────────────────────────

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const data   = body ? JSON.stringify(body) : undefined;

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(options.headers || {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function isRealDomain(domain) {
  if (!domain) return false;
  const d = domain.trim().toLowerCase();
  return d !== '' && d !== 'localhost' && d !== '127.0.0.1' && !d.startsWith('auto-');
}

function readLocalWebsites() {
  const { getDb } = require('./database/init');
  const db = getDb();
  return db.prepare(`
    SELECT id, name, demo_slug, domain, domain_active, domain_alt,
           domain_alt_active, is_active, logo_url, color
    FROM websites
    WHERE demo_slug IS NOT NULL AND demo_slug != ''
    ORDER BY id
  `).all();
}

function readLocalPages(websiteId) {
  const { getDb } = require('./database/init');
  const db = getDb();
  return db.prepare(`
    SELECT url, name, form_type, fields_schema, field_mappings
    FROM demo_pages WHERE website_id = ?
  `).all(websiteId);
}

async function main() {
  // 1. Read local DB
  console.log('📦 Reading local database...\n');
  const localSites = readLocalWebsites();

  if (localSites.length === 0) {
    console.log('No websites with slugs found in local DB.');
    return;
  }

  console.log(`Found ${localSites.length} website(s) to sync:\n`);
  localSites.forEach(s => console.log(`  • ${s.name} (${s.demo_slug})`));
  console.log('');

  // 2. Login to Railway
  if (!ADMIN_PASS) {
    console.error('❌  Set RAILWAY_ADMIN_PASS in your .env file. Example: RAILWAY_ADMIN_PASS=admin123');
    process.exit(1);
  }

  console.log('🔐 Logging in to Railway...');
  const login = await request(`${RAILWAY_URL}/api/auth/login`, { method: 'POST' }, {
    username: ADMIN_USER,
    password: ADMIN_PASS
  });

  if (login.status !== 200 || !login.body.token) {
    console.error('❌  Login failed:', login.body);
    process.exit(1);
  }

  const token = login.body.token;
  const auth  = { Authorization: `Bearer ${token}` };
  console.log('✅ Logged in.\n');

  // 3. Get current Railway websites
  const remoteList = await request(`${RAILWAY_URL}/api/websites`, { headers: auth });
  const remoteMap  = new Map(
    (remoteList.body.websites || []).map(w => [w.demo_slug, w])
  );

  // 4. Sync each website
  const results = [];

  for (const site of localSites) {
    console.log(`─────────────────────────────────────`);
    console.log(`🌐 ${site.name} (${site.demo_slug})`);

    const remote   = remoteMap.get(site.demo_slug);
    let websiteId;
    let action;

    if (!remote) {
      // Create on Railway
      const primaryDomain = isRealDomain(site.domain) ? site.domain : `auto-${site.demo_slug}`;

      const create = await request(`${RAILWAY_URL}/api/websites`, { method: 'POST', headers: auth }, {
        name:      site.name,
        domain:    primaryDomain,
        demo_slug: site.demo_slug,
        color:     site.color    || '#6366f1',
        logo_url:  site.logo_url || null,
        is_active: 1
      });

      if (create.status !== 201) {
        console.log(`   ❌ Create failed: ${JSON.stringify(create.body)}`);
        results.push({ name: site.name, status: 'FAILED' });
        continue;
      }

      websiteId = create.body.website.id;
      action    = 'CREATED';
      console.log(`   ✅ Created (id ${websiteId})`);

    } else {
      websiteId = remote.id;
      action    = 'UPDATED';
      console.log(`   ℹ️  Already exists (id ${websiteId}), updating...`);

      // Update name, color, logo only — do NOT touch is_active (managed on Railway)
      await request(`${RAILWAY_URL}/api/websites/${websiteId}`, { method: 'PUT', headers: auth }, {
        name:     site.name,
        color:    site.color    || remote.color    || '#6366f1',
        logo_url: site.logo_url || remote.logo_url || null
      });
    }

    // 5. Set domains
    const domainPayload = {};

    // Primary domain — only update if it's a real domain (not localhost)
    if (isRealDomain(site.domain)) {
      const isActive = site.domain_active !== undefined ? site.domain_active : 1;
      domainPayload.domain        = site.domain.trim().toLowerCase();
      domainPayload.domain_active = isActive;
      console.log(`   🔗 Primary : ${domainPayload.domain} (${isActive ? 'active' : 'inactive'})`);
    } else {
      console.log(`   ⏭️  Primary : skipped (was localhost)`);
    }

    // Alt domains — mirror exact active/inactive state from local DB
    let altDomains = [];
    if (site.domain_alt) {
      try {
        const parsed = JSON.parse(site.domain_alt);
        altDomains   = Array.isArray(parsed) ? parsed : [];
      } catch { /* skip */ }
    }

    const primaryNorm = isRealDomain(site.domain) ? site.domain.trim().toLowerCase() : null;
    const realAlts = altDomains
      .filter(a => isRealDomain(a.domain) && a.domain.trim().toLowerCase() !== primaryNorm)
      .map(a => ({ domain: a.domain.trim().toLowerCase(), active: a.active !== undefined ? a.active : 1 }));

    if (realAlts.length > 0) {
      domainPayload.domain_alt = realAlts;
      realAlts.forEach(a => console.log(`   🔗 Alt     : ${a.domain} (${a.active ? 'active' : 'inactive'})`));
    }

    if (Object.keys(domainPayload).length > 0) {
      const upd = await request(`${RAILWAY_URL}/api/websites/${websiteId}`, { method: 'PUT', headers: auth }, domainPayload);
      if (upd.status !== 200) {
        console.log(`   ⚠️  Domain update warning: ${JSON.stringify(upd.body)}`);
      }
    }

    // 6. Sync registered pages + field mappings
    const localPages = readLocalPages(site.id);
    if (localPages.length > 0) {
      const pagesSync = await request(`${RAILWAY_URL}/api/websites/${websiteId}/pages/sync`, { method: 'POST', headers: auth }, { pages: localPages });
      if (pagesSync.status === 200) {
        console.log(`   📄 Pages: ${pagesSync.body.created} created, ${pagesSync.body.updated} updated`);
      } else {
        console.log(`   ⚠️  Pages sync warning: ${JSON.stringify(pagesSync.body)}`);
      }
    }

    results.push({ name: site.name, slug: site.demo_slug, id: websiteId, status: action });
  }

  // 6. Summary
  console.log(`\n═════════════════════════════════════`);
  console.log(`✅ Sync complete!\n`);
  console.log(`${'Website'.padEnd(25)} ${'Slug'.padEnd(25)} Status`);
  console.log(`${'─'.repeat(65)}`);
  results.forEach(r => {
    console.log(`${r.name.padEnd(25)} ${(r.slug || '').padEnd(25)} ${r.status}`);
  });

  console.log(`\n⚠️  Remember: xPages FILE changes must be pushed via git.`);
  console.log(`   This script only syncs the database records.\n`);
}

main().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
