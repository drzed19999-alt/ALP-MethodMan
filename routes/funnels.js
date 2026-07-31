const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireGod } = require('../middleware/auth');
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
      pages = await db.all('SELECT * FROM demo_pages WHERE website_id = ? ORDER BY name ASC', [parseInt(website_id, 10)]);
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
router.post('/demo-pages', async (req, res) => {
  try {
    const db = getAdapter();
    const { url, name, form_type = 'general', fields_schema = [], field_mappings = {}, website_id } = req.body;

    if (!url || !name) {
      return res.status(400).json({ error: 'url and name are required' });
    }

    const schemaStr = typeof fields_schema === 'string' ? fields_schema : JSON.stringify(fields_schema);
    const mappingsStr = typeof field_mappings === 'string' ? field_mappings : JSON.stringify(field_mappings);
    const webId = website_id ? parseInt(website_id, 10) : null;

    const result = await db.run(
      'INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings) VALUES (?, ?, ?, ?, ?, ?)',
      [webId, url.trim(), name.trim(), form_type.trim(), schemaStr, mappingsStr]
    );

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `Created demo page: ${url}`, 'settings', JSON.stringify({ url, name, form_type, website_id: webId }), req.ip]
    );

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
router.put('/demo-pages/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const { id } = req.params;
    const { name, form_type, fields_schema, field_mappings, website_id } = req.body;

    const existing = await db.get('SELECT * FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);
    if (!existing) {
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

    await db.run(
      'UPDATE demo_pages SET name = ?, form_type = ?, fields_schema = ?, field_mappings = ?, website_id = ? WHERE id = ?',
      [newName, newType, newSchema, newMappings, newWebId, parseInt(id, 10)]
    );

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `Updated demo page: ${existing.url}`, 'settings', JSON.stringify({ id, name: newName, form_type: newType, website_id: newWebId }), req.ip]
    );

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
router.delete('/demo-pages/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);
    if (!existing) {
      return res.status(404).json({ error: 'Demo page not found' });
    }

    await db.run('DELETE FROM demo_pages WHERE id = ?', [parseInt(id, 10)]);

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, `Deleted demo page: ${existing.url}`, 'settings', JSON.stringify({ id, url: existing.url }), req.ip]
    );

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

    const funnel = await db.get('SELECT * FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1', [parseInt(website_id, 10)]);

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
router.post('/', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, name = 'Default Funnel', steps = [] } = req.body;

    if (!website_id) {
      return res.status(400).json({ error: 'website_id is required' });
    }

    const stepsStr = typeof steps === 'string' ? steps : JSON.stringify(steps);

    // Check if funnel already exists for the website
    const existing = await db.get('SELECT id FROM funnels WHERE website_id = ? LIMIT 1', [parseInt(website_id, 10)]);

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
      `, [parseInt(website_id, 10), name, stepsStr]);
    }

    // Audit log
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `Updated funnel for website ${website_id}`, 'settings',
      JSON.stringify({ website_id, steps }), req.ip]);

    res.json({ message: 'Funnel configuration saved successfully' });
  } catch (err) {
    console.error('Save funnel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /demo-pages/:websiteId/orphaned ──────────────────────────────────────
router.get('/demo-pages/:websiteId/orphaned', async (req, res) => {
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
router.post('/demo-pages/bulk-delete', async (req, res) => {
  try {
    const db = getAdapter();
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const parsedIds = ids.map(id => parseInt(id, 10));
    const pages = await db.all(`SELECT * FROM demo_pages WHERE id IN (${placeholders})`, parsedIds);
    
    await db.run(`DELETE FROM demo_pages WHERE id IN (${placeholders})`, parsedIds);

    // Audit log
    await db.run(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.user.username, `Bulk deleted ${ids.length} demo pages`, 'settings', 
        JSON.stringify({ deleted: pages.map(p => ({ id: p.id, name: p.name, url: p.url })) }), req.ip]);

    res.json({ message: `${ids.length} pages deleted`, deleted: ids.length });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/bulk-update ─────────────────────────────────────────────
router.post('/demo-pages/bulk-update', async (req, res) => {
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
    values.push(...ids.map(id => parseInt(id, 10)));
    
    await db.run(`UPDATE demo_pages SET ${setStatements.join(', ')} WHERE id IN (${placeholders})`, values);

    // Audit log
    await db.run(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.user.username, `Bulk updated ${ids.length} demo pages`, 'settings', 
        JSON.stringify({ ids, updates }), req.ip]);

    res.json({ message: `${ids.length} pages updated`, updated: ids.length });
  } catch (err) {
    console.error('Bulk update error:', err);
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
