const router = require('express').Router();
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// Apply auth to all funnel/demo-page routes
router.use(authenticateToken);

// ─── GET /api/funnels/demo-pages ──────────────────────────────────────────────────
router.get('/demo-pages', (req, res) => {
  try {
    const db = getDb();
    const { website_id } = req.query;
    let pages;
    if (website_id) {
      pages = db.prepare('SELECT * FROM demo_pages WHERE website_id = ? ORDER BY name ASC').all(parseInt(website_id, 10));
    } else {
      pages = []; // Do not leak all pages when website_id is not specified
    }
    const parsed = pages.map(p => {
      try { p.fields_schema = JSON.parse(p.fields_schema || '[]'); } catch { p.fields_schema = []; }
      try { p.field_mappings = JSON.parse(p.field_mappings || '{}'); } catch { p.field_mappings = {}; }
      return p;
    });
    res.json({ pages: parsed });
  } catch (err) {
    console.error('List demo pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/funnels/demo-pages ─────────────────────────────────────────────
router.post('/demo-pages', (req, res) => {
  try {
    const db = getDb();
    const { url, name, form_type = 'general', fields_schema = [], field_mappings = {}, website_id } = req.body;

    if (!url || !name) {
      return res.status(400).json({ error: 'url and name are required' });
    }

    const schemaStr = typeof fields_schema === 'string' ? fields_schema : JSON.stringify(fields_schema);
    const mappingsStr = typeof field_mappings === 'string' ? field_mappings : JSON.stringify(field_mappings);
    const webId = website_id ? parseInt(website_id, 10) : null;

    const result = db.prepare(
      'INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(webId, url.trim(), name.trim(), form_type.trim(), schemaStr, mappingsStr);

    db.prepare(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, req.user.username, `Created demo page: ${url}`, 'settings', JSON.stringify({ url, name, form_type, website_id: webId }), req.ip);

    const page = db.prepare('SELECT * FROM demo_pages WHERE id = ?').get(result.lastInsertRowid);
    try { page.fields_schema = JSON.parse(page.fields_schema || '[]'); } catch { page.fields_schema = []; }
    try { page.field_mappings = JSON.parse(page.field_mappings || '{}'); } catch { page.field_mappings = {}; }

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
router.put('/demo-pages/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, form_type, fields_schema, field_mappings, website_id } = req.body;

    const existing = db.prepare('SELECT * FROM demo_pages WHERE id = ?').get(parseInt(id, 10));
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

    db.prepare(
      'UPDATE demo_pages SET name = ?, form_type = ?, fields_schema = ?, field_mappings = ?, website_id = ? WHERE id = ?'
    ).run(newName, newType, newSchema, newMappings, newWebId, parseInt(id, 10));

    db.prepare(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, req.user.username, `Updated demo page: ${existing.url}`, 'settings', JSON.stringify({ id, name: newName, form_type: newType, website_id: newWebId }), req.ip);

    const page = db.prepare('SELECT * FROM demo_pages WHERE id = ?').get(parseInt(id, 10));
    try { page.fields_schema = JSON.parse(page.fields_schema || '[]'); } catch { page.fields_schema = []; }
    try { page.field_mappings = JSON.parse(page.field_mappings || '{}'); } catch { page.field_mappings = {}; }

    res.json({ page, message: 'Demo page updated' });
  } catch (err) {
    console.error('Update demo page error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/funnels/demo-pages/:id ───────────────────────────────────────
router.delete('/demo-pages/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM demo_pages WHERE id = ?').get(parseInt(id, 10));
    if (!existing) {
      return res.status(404).json({ error: 'Demo page not found' });
    }

    db.prepare('DELETE FROM demo_pages WHERE id = ?').run(parseInt(id, 10));

    db.prepare(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, req.user.username, `Deleted demo page: ${existing.url}`, 'settings', JSON.stringify({ id, url: existing.url }), req.ip);

    res.json({ message: 'Demo page deleted' });
  } catch (err) {
    console.error('Delete demo page error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/funnels ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { website_id } = req.query;

    if (!website_id) {
      return res.status(400).json({ error: 'website_id query parameter is required' });
    }

    const funnel = db.prepare('SELECT * FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1').get(parseInt(website_id, 10));

    if (funnel) {
      try { funnel.steps = JSON.parse(funnel.steps || '[]'); } catch { funnel.steps = []; }
    }

    res.json({ funnel: funnel || null });
  } catch (err) {
    console.error('Get funnel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/funnels ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { website_id, name = 'Default Funnel', steps = [] } = req.body;

    if (!website_id) {
      return res.status(400).json({ error: 'website_id is required' });
    }

    const stepsStr = typeof steps === 'string' ? steps : JSON.stringify(steps);

    // Check if funnel already exists for the website
    const existing = db.prepare('SELECT id FROM funnels WHERE website_id = ? LIMIT 1').get(parseInt(website_id, 10));

    if (existing) {
      db.prepare(`
        UPDATE funnels
        SET name = ?, steps = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, stepsStr, existing.id);
    } else {
      db.prepare(`
        INSERT INTO funnels (website_id, name, steps, is_active)
        VALUES (?, ?, ?, 1)
      `).run(parseInt(website_id, 10), name, stepsStr);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Updated funnel for website ${website_id}`, 'settings',
      JSON.stringify({ website_id, steps }), req.ip);

    res.json({ message: 'Funnel configuration saved successfully' });
  } catch (err) {
    console.error('Save funnel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /demo-pages/:websiteId/orphaned ──────────────────────────────────────
// Returns pages in registry that have no corresponding HTML file on server
router.get('/demo-pages/:websiteId/orphaned', (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.websiteId, 10);
    
    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.json({ orphaned: [] });
    }

    const pages = db.prepare('SELECT * FROM demo_pages WHERE website_id = ?').all(websiteId);
    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    
    const orphaned = [];
    
    for (const page of pages) {
      // Extract filename from URL (e.g., /demo/slug/login -> login.html)
      const urlParts = page.url.split('/').filter(Boolean);
      const pageName = urlParts[urlParts.length - 1];
      const filename = pageName.endsWith('.html') ? pageName : `${pageName}.html`;
      
      const filePath = path.join(siteDir, filename);
      
      if (!fs.existsSync(filePath)) {
        orphaned.push({
          ...page,
          expectedFile: filename,
          fields_schema: JSON.parse(page.fields_schema || '[]'),
          field_mappings: JSON.parse(page.field_mappings || '{}')
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
router.post('/demo-pages/bulk-delete', (req, res) => {
  try {
    const db = getDb();
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const pages = db.prepare(`SELECT * FROM demo_pages WHERE id IN (${placeholders})`).all(...ids.map(id => parseInt(id, 10)));
    
    db.prepare(`DELETE FROM demo_pages WHERE id IN (${placeholders})`).run(...ids.map(id => parseInt(id, 10)));

    // Audit log
    db.prepare(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, req.user.username, `Bulk deleted ${ids.length} demo pages`, 'settings', 
        JSON.stringify({ deleted: pages.map(p => ({ id: p.id, name: p.name, url: p.url })) }), req.ip);

    res.json({ message: `${ids.length} pages deleted`, deleted: ids.length });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /demo-pages/bulk-update ─────────────────────────────────────────────
router.post('/demo-pages/bulk-update', (req, res) => {
  try {
    const db = getDb();
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
    
    db.prepare(`UPDATE demo_pages SET ${setStatements.join(', ')} WHERE id IN (${placeholders})`).run(...values);

    // Audit log
    db.prepare(`INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, req.user.username, `Bulk updated ${ids.length} demo pages`, 'settings', 
        JSON.stringify({ ids, updates }), req.ip);

    res.json({ message: `${ids.length} pages updated`, updated: ids.length });
  } catch (err) {
    console.error('Bulk update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /demo-pages/:id/analytics ────────────────────────────────────────────
router.get('/demo-pages/:id/analytics', (req, res) => {
  try {
    const db = getDb();
    const pageId = parseInt(req.params.id, 10);
    
    const page = db.prepare('SELECT * FROM demo_pages WHERE id = ?').get(pageId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get view and submission counts
    const stats = {
      views: page.views_count || 0,
      submissions: page.submissions_count || 0,
      lastActivity: page.last_activity_at,
      createdAt: page.created_at
    };

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get page views by day
    const viewsByDay = db.prepare(`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM page_views
      WHERE page_url = ? AND timestamp >= ?
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 30
    `).all(page.url, thirtyDaysAgo);

    // Get captured data count
    const capturedData = db.prepare(`
      SELECT COUNT(*) as count
      FROM captured_data
      WHERE page_url = ? AND timestamp >= ?
    `).get(page.url, thirtyDaysAgo);

    res.json({
      pageId,
      pageName: page.name,
      pageUrl: page.url,
      stats,
      viewsByDay,
      recentSubmissions: capturedData?.count || 0,
      conversionRate: stats.views > 0 ? ((stats.submissions / stats.views) * 100).toFixed(2) : 0
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
