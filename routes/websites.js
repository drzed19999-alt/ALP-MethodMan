const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

// ─── File Upload Configuration & Validation ──────────────────────────────────
const ALLOWED_EXTENSIONS = [
  '.html', '.htm', '.css', '.js', '.json',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.jfif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.txt', '.md', '.xml', '.pdf'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total per upload

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
    
    // Check extension
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`${file.originalname}: File type not allowed (${ext})`);
      continue;
    }

    // Check individual file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.originalname}: File too large (${(file.size / 1024 / 1024).toFixed(2)}MB > 10MB)`);
      continue;
    }

    // Check for path traversal in filename
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      errors.push(`${file.originalname}: Invalid filename (contains path traversal)`);
      continue;
    }

    // Sanitize filename
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    if (sanitized !== file.originalname) {
      file.originalname = sanitized;
    }

    // Calculate hash for duplicate detection
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(file.buffer).digest('hex');
    
    if (fileHashes.has(hash)) {
      errors.push(`${file.originalname}: Duplicate file (same as ${fileHashes.get(hash)})`);
    } else {
      fileHashes.set(hash, file.originalname);
    }

    totalSize += file.size;
  }

  // Check total size
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push(`Total upload size too large: ${(totalSize / 1024 / 1024).toFixed(2)}MB > 50MB`);
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

// Configure multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: MAX_FILE_SIZE,
    files: 100 // Max 100 files per upload
  }
});


// Apply auth to all website routes
router.use(authenticateToken);

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDb();

    const websites = db.prepare(`
      SELECT w.*,
        (SELECT COUNT(*) FROM sessions s WHERE s.website_id = w.id AND s.is_active = 1) as active_sessions,
        (SELECT COUNT(*) FROM sessions s WHERE s.website_id = w.id) as total_sessions,
        (SELECT COUNT(*) FROM page_views pv WHERE pv.website_id = w.id AND pv.timestamp >= date('now', 'start of day')) as page_views_today
      FROM websites w
      ORDER BY w.created_at DESC
    `).all();

    // Fetch registered pages for each website
    const pages = db.prepare('SELECT id, website_id, url, name, form_type FROM demo_pages').all();
    websites.forEach(w => {
      w.pages = pages.filter(p => p.website_id === w.id);
    });

    res.json({ websites });
  } catch (err) {
    console.error('List websites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────────
router.post('/', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const { name, domain, is_active = 1, demo_slug, logo_url, color = '#6366f1' } = req.body;

    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    const trimmedSlug = demo_slug ? demo_slug.trim() : null;
    const finalDomain = domain ? domain.trim() : '';
    const logoUrl = logo_url ? logo_url.trim() : null;

    // Check for duplicate demo slug (slugs must be unique)
    if (trimmedSlug) {
      const existingSlug = db.prepare('SELECT id FROM websites WHERE demo_slug = ?').get(trimmedSlug);
      if (existingSlug) {
        return res.status(409).json({ error: 'A website with this demo slug already exists' });
      }
    }

    const apiKey = uuidv4();

    const result = db.prepare(`
      INSERT INTO websites (name, domain, api_key, is_active, demo_slug, logo_url, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, finalDomain, apiKey, is_active ? 1 : 0, trimmedSlug, logoUrl, color);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Created website: ${name}`, 'website',
      JSON.stringify({ website_id: result.lastInsertRowid, domain: finalDomain, demo_slug: trimmedSlug }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('website', '🌐', `${req.user.username} added website "${name}" (${domain})`,
      JSON.stringify({ website_id: result.lastInsertRowid }), result.lastInsertRowid);

    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ message: 'Website created', website });
  } catch (err) {
    console.error('Create website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /:id ───────────────────────────────────────────────────────────────────
router.put('/:id', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);

    const existing = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    if (!existing) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const { name, domain, is_active, demo_slug, logo_url, color } = req.body;
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
      let finalDomain = domain ? domain.trim() : '';
      if (finalDomain.toLowerCase() === 'auto') {
        const slugVal = demo_slug !== undefined ? (demo_slug ? demo_slug.trim() : null) : existing.demo_slug;
        finalDomain = 'auto-' + (slugVal || uuidv4().slice(0, 8));
      }
      updates.push('domain = ?');
      values.push(finalDomain);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (demo_slug !== undefined) {
      const slugVal = demo_slug ? demo_slug.trim() : null;
      if (slugVal) {
        const dupSlug = db.prepare('SELECT id FROM websites WHERE demo_slug = ? AND id != ?').get(slugVal, websiteId);
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

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(websiteId);
    db.prepare(`UPDATE websites SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Updated website: ${name || existing.name}`, 'website',
      JSON.stringify({ website_id: websiteId }), req.ip);

    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);

    res.json({ message: 'Website updated', website });
  } catch (err) {
    console.error('Update website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);

    const existing = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    if (!existing) {
      return res.status(404).json({ error: 'Website not found' });
    }

    // Delete related data in a transaction
    const deleteAll = db.transaction(() => {
      db.prepare('DELETE FROM page_views WHERE website_id = ?').run(websiteId);
      db.prepare('DELETE FROM redirect_commands WHERE website_id = ?').run(websiteId);
      db.prepare('DELETE FROM redirect_rules WHERE website_id = ?').run(websiteId);
      db.prepare('UPDATE sessions SET is_active = 0 WHERE website_id = ?').run(websiteId);
      db.prepare('DELETE FROM sessions WHERE website_id = ?').run(websiteId);
      db.prepare('DELETE FROM websites WHERE id = ?').run(websiteId);
    });

    deleteAll();

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Deleted website: ${existing.name}`, 'website',
      JSON.stringify({ website_id: websiteId, name: existing.name, domain: existing.domain }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('website', '🗑️', `${req.user.username} deleted website "${existing.name}" (${existing.domain})`,
      JSON.stringify({ website_id: websiteId }));

    res.json({ message: 'Website and all related data deleted' });
  } catch (err) {
    console.error('Delete website error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/regenerate-key ───────────────────────────────────────────────────
router.post('/:id/regenerate-key', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);

    const existing = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    if (!existing) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const newApiKey = uuidv4();
    db.prepare('UPDATE websites SET api_key = ? WHERE id = ?').run(newApiKey, websiteId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Regenerated API key for website: ${existing.name}`, 'website',
      JSON.stringify({ website_id: websiteId, old_key_last4: existing.api_key.slice(-4) }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('website', '🔑', `${req.user.username} regenerated API key for "${existing.name}"`,
      JSON.stringify({ website_id: websiteId }), websiteId);

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
router.get('/:id/files', (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);
    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
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

    const files = fs.readdirSync(siteDir)
      .filter(file => file.endsWith('.html'))
      .map(file => {
        const stat = fs.statSync(path.join(siteDir, file));
        return {
          name: file,
          size: stat.size,
          url: `/demo/${website.demo_slug}/${file}`
        };
      });

    res.json({ files });
  } catch (err) {
    console.error('Get files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/upload ────────────────────────────────────────────────────────────
router.post('/:id/upload', requireRole('admin', 'super_admin'), upload.array('files'), validateFileUpload, (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);
    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
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
      const rawPath = paths[i] || file.originalname;

      // Strip top-level folder name (e.g. "my_folder/css/style.css" -> "css/style.css")
      const parts = rawPath.split(/[/\\]/);
      const relativePath = parts.length > 1 ? parts.slice(1).join('/') : rawPath;

      // Sanitise path segments to prevent directory traversal
      const cleanParts = relativePath.split('/')
        .map(p => p.replace(/[^a-zA-Z0-9.\-_]/g, '_'))
        .filter(p => p && p !== '..' && p !== '.');

      if (cleanParts.length === 0) continue;

      const targetPath = path.join(siteDir, ...cleanParts);
      const relativeName = cleanParts.join('/');

      // Ensure directory for this nested file exists
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      let fileSize = 0;
      if (file.originalname.toLowerCase().endsWith('.html') || rawPath.toLowerCase().endsWith('.html')) {
        // Auto-inject tracker script if missing
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

    // Audit log with detailed file info
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      req.user.username,
      `Uploaded ${savedFiles.length} file(s) to website: ${website.name}`,
      'website',
      JSON.stringify({ 
        website_id: websiteId, 
        files: savedFiles.map(f => ({ name: f.name, size: f.size })),
        totalSize: req.uploadMeta.totalSize,
        htmlFiles: savedFiles.filter(f => f.name.toLowerCase().endsWith('.html')).length
      }),
      req.ip
    );

    res.json({ 
      message: 'Files uploaded successfully', 
      files: savedFiles,
      stats: {
        total: savedFiles.length,
        htmlFiles: savedFiles.filter(f => f.name.toLowerCase().endsWith('.html')).length,
        assets: savedFiles.filter(f => !f.name.toLowerCase().endsWith('.html')).length,
        totalSize: req.uploadMeta.totalSize
      }
    });
  } catch (err) {
    console.error('Upload files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id/files/:filename ───────────────────────────────────────────────
router.delete('/:id/files/:filename(*)', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);
    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    if (!website.demo_slug) {
      return res.status(400).json({ error: 'Website has no demo slug' });
    }

    let { filename } = req.params;
    
    // Security check - prevent path traversal
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename - path traversal not allowed' });
    }

    // Handle nested paths (e.g., css/style.css)
    const filePath = path.join(__dirname, '..', 'xPages', website.demo_slug, filename);
    
    // Ensure the resolved path is still within the website directory
    const siteDir = path.join(__dirname, '..', 'xPages', website.demo_slug);
    if (!filePath.startsWith(siteDir)) {
      return res.status(400).json({ error: 'Invalid filename - outside website directory' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if this file is linked to any pages in the registry
    const fileBasename = path.basename(filename, '.html');
    const linkedPages = db.prepare(`
      SELECT id, name, url FROM demo_pages 
      WHERE website_id = ? AND url LIKE ?
    `).all(websiteId, `%/${fileBasename}`);

    // Delete the file
    const stats = fs.statSync(filePath);
    fs.unlinkSync(filePath);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      req.user.username,
      `Deleted file ${filename} from website: ${website.name}`,
      'website',
      JSON.stringify({ 
        website_id: websiteId, 
        filename,
        size: stats.size,
        linkedPages: linkedPages.map(p => ({ id: p.id, name: p.name, url: p.url }))
      }),
      req.ip
    );

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

// ─── GET /:id/scan-fields ──────────────────────────────────────────────────────
// Reads an HTML file from xPages/<slug>/ and extracts tracked field names.
// Query: ?file=login.html
// Priority: trackFormData() keys (intentional) > HTML input names (fallback)
router.get('/:id/scan-fields', (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);
    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
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
    const fields = new Set();
    let m;

    // ── Strategy 1: trackFormData(...) keys ──────────────────────────────────
    // These are intentionally tracked by the developer — always preferred.
    // We check for:
    //   1. Inline object: trackFormData({ key1: val1, ... })
    //   2. Variable: trackFormData(fields) where fields is defined as fields = { key1: val1, ... }
    let trackFormDataFound = false;

    const _extractKeysFromObjectBlock = (block, fieldSet) => {
      // Matches key names: e.g. key: or 'key': or "key":
      const keyPattern = /(?:^|,|\{)\s*(?:["']?([a-zA-Z0-9_$]+)["']?)\s*:/g;
      let km;
      while ((km = keyPattern.exec(block)) !== null) {
        const key = km[1].trim();
        if (!['page', 'type', 'true', 'false', 'null'].includes(key)) {
          fieldSet.add(key);
        }
      }
    };

    // 1. Check for inline object first
    const inlinePattern = /trackFormData\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
    while ((m = inlinePattern.exec(html)) !== null) {
      trackFormDataFound = true;
      _extractKeysFromObjectBlock(m[1], fields);
    }

    // 2. Check for variable usage: trackFormData(varName)
    const varPattern = /trackFormData\s*\(\s*([a-zA-Z0-9_$]+)\s*\)/gi;
    while ((m = varPattern.exec(html)) !== null) {
      const varName = m[1];
      if (varName === 'true' || varName === 'false' || varName === 'null') continue;

      // Look for variable declaration: const varName = { ... } or var varName = { ... } or varName = { ... }
      const varDeclPattern = new RegExp(`(?:const|let|var|\\b)${varName}\\s*=\\s*\\{([\\s\S]*?)\\}`, 'gi');
      let dm;
      while ((dm = varDeclPattern.exec(html)) !== null) {
        trackFormDataFound = true;
        _extractKeysFromObjectBlock(dm[1], fields);
      }
    }

    // ── Strategy 2 & 3: HTML input scanning (only if no trackFormData found) ───
    // Filters hidden, submit inputs and known system/noise field names.
    if (!trackFormDataFound) {
      const NOISE = new Set([
        '_csrf', 'submit', 'utf8', '__token', 'token', '_token', '_method',
        'action', 'commit', 'authenticity_token', 'g-recaptcha-response',
        'recaptcha', 'captcha', 'remember_token', 'form_id', 'form-type',
        'source', 'referrer', 'redirect', 'redirect_uri', 'return_url',
        'next', 'nonce', 'state', 'scope', 'client_id', 'response_type',
        'grant_type', 'timestamp', 'lang', 'locale', 'timezone',
        'search', 'query', 'q', 's', 'keyword', 'newsletter',
      ]);

      // <input> — skip hidden / submit / button types
      const inputPattern = /<input([^>]+)>/gi;
      while ((m = inputPattern.exec(html)) !== null) {
        const attrs = m[1];
        if (/type\s*=\s*["']hidden["']/i.test(attrs)) continue;
        if (/type\s*=\s*["'](submit|button|reset|image)["']/i.test(attrs)) continue;
        
        let name = null;
        const nm = /name\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (nm) {
          name = nm[1].trim();
        } else {
          const idAttr = /id\s*=\s*["']([^"']+)["']/i.exec(attrs);
          if (idAttr) {
            name = idAttr[1].trim();
          }
        }
        
        if (name && !NOISE.has(name) && !name.startsWith('_') && name.length > 0) {
          fields.add(name);
        }
      }

      // <select> and <textarea>
      const otherPattern = /<(?:select|textarea)([^>]+)>/gi;
      while ((m = otherPattern.exec(html)) !== null) {
        const attrs = m[1];
        let name = null;
        const nm = /name\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (nm) {
          name = nm[1].trim();
        } else {
          const idAttr = /id\s*=\s*["']([^"']+)["']/i.exec(attrs);
          if (idAttr) {
            name = idAttr[1].trim();
          }
        }
        
        if (name && !NOISE.has(name) && !name.startsWith('_') && name.length > 0) {
          fields.add(name);
        }
      }
    }

    res.json({
      fields: Array.from(fields),
      file,
      slug: website.demo_slug,
      strategy: trackFormDataFound ? 'trackFormData' : 'html-inputs',
    });
  } catch (err) {
    console.error('Scan fields error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/download-zip ─────────────────────────────────────────────────────
router.get('/:id/download-zip', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const websiteId = parseInt(req.params.id, 10);
    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    
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

    // Get pages for registry JSON
    const pages = db.prepare('SELECT id, name, url, form_type, fields_schema, created_at FROM demo_pages WHERE website_id = ?').all(websiteId);

    // Try to use archiver if available, fallback to simple JSON export
    try {
      const archiver = require('archiver');
      
      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      // Set response headers
      res.attachment(`${website.demo_slug}-${Date.now()}.zip`);
      res.type('application/zip');
      
      // Pipe archive to response
      archive.pipe(res);

      // Add all files from site directory
      archive.directory(siteDir, false);

      // Add registry configuration as JSON
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
          fields_schema: JSON.parse(p.fields_schema || '[]'),
          created_at: p.created_at
        }))
      };
      
      archive.append(JSON.stringify(registryData, null, 2), { name: 'registry-config.json' });

      // Finalize archive
      archive.finalize();

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        req.user.username,
        `Downloaded ZIP for website: ${website.name}`,
        'website',
        JSON.stringify({ website_id: websiteId, pages_count: pages.length }),
        req.ip
      );

    } catch (archiverError) {
      // Archiver not available - return JSON only
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
          fields_schema: JSON.parse(p.fields_schema || '[]'),
          created_at: p.created_at
        })),
        note: 'Full ZIP export requires archiver package. Install with: npm install archiver'
      };
      
      res.attachment(`${website.demo_slug}-registry-${Date.now()}.json`);
      res.type('application/json');
      res.json(registryData);
      
      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        req.user.username,
        `Downloaded registry JSON for website: ${website.name}`,
        'website',
        JSON.stringify({ website_id: websiteId, pages_count: pages.length, format: 'json-only' }),
        req.ip
      );
    }
    
  } catch (err) {
    console.error('Download ZIP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /upload-logo ────────────────────────────────────────────────────────
router.post('/upload-logo', requireRole('admin', 'super_admin'), upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname) || '.png';
    const filename = `${uuidv4()}${ext}`;
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'logos');
    
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    res.json({ url: `/uploads/logos/${filename}` });
  } catch (err) {
    console.error('Upload logo error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /ai-create ────────────────────────────────────────────────────────────
router.post('/ai-create', requireRole('admin', 'super_admin'), (req, res) => {
  try {
    const db = getDb();
    const { name, domain, demo_slug, logo_url, color = '#6366f1', prompt, template } = req.body;

    if (!name || !domain || !demo_slug || !template) {
      return res.status(400).json({ error: 'Name, domain, slug, and template are required' });
    }

    const trimmedSlug = demo_slug.trim();
    const finalDomain = domain.trim();
    const logoUrl = logo_url ? logo_url.trim() : null;

    // Check for duplicate demo slug
    const existingSlug = db.prepare('SELECT id FROM websites WHERE demo_slug = ?').get(trimmedSlug);
    if (existingSlug) {
      return res.status(409).json({ error: 'A website with this demo slug already exists' });
    }

    const apiKey = uuidv4();

    // Create the website record
    const result = db.prepare(`
      INSERT INTO websites (name, domain, api_key, is_active, demo_slug, logo_url, color)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(name, finalDomain, apiKey, trimmedSlug, logoUrl, color);

    const websiteId = result.lastInsertRowid;

    // Copy template files to the new slug directory
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
            // Read html file to auto-inject tracker script if missing
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

    // Scan target directory html files and register in demo_pages
    if (fs.existsSync(targetDir)) {
      const scanFields = (html) => {
        const fields = new Set();
        let m;
        let trackFormDataFound = false;

        const _extractKeysFromObjectBlock = (block, fieldSet) => {
          const keyPattern = /(?:^|,|\{)\s*(?:["']?([a-zA-Z0-9_$]+)["']?)\s*:/g;
          let km;
          while ((km = keyPattern.exec(block)) !== null) {
            const key = km[1].trim();
            if (!['page', 'type', 'true', 'false', 'null'].includes(key)) {
              fieldSet.add(key);
            }
          }
        };

        const inlinePattern = /trackFormData\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
        while ((m = inlinePattern.exec(html)) !== null) {
          trackFormDataFound = true;
          _extractKeysFromObjectBlock(m[1], fields);
        }

        const varPattern = /trackFormData\s*\(\s*([a-zA-Z0-9_$]+)\s*\)/gi;
        while ((m = varPattern.exec(html)) !== null) {
          const varName = m[1];
          if (varName !== 'true' && varName !== 'false' && varName !== 'null') {
            const varDeclPattern = new RegExp(`(?:const|let|var|\\b)${varName}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'gi');
            let dm;
            while ((dm = varDeclPattern.exec(html)) !== null) {
              trackFormDataFound = true;
              _extractKeysFromObjectBlock(dm[1], fields);
            }
          }
        }

        if (!trackFormDataFound) {
          const NOISE = new Set([
            '_csrf', 'submit', 'utf8', '__token', 'token', '_token', '_method',
            'action', 'commit', 'authenticity_token', 'g-recaptcha-response',
            'recaptcha', 'captcha', 'remember_token', 'form_id', 'form-type',
            'source', 'referrer', 'redirect', 'redirect_uri', 'return_url',
            'next', 'nonce', 'state', 'scope', 'client_id', 'response_type',
            'grant_type', 'timestamp', 'lang', 'locale', 'timezone',
            'search', 'query', 'q', 's', 'keyword', 'newsletter',
          ]);

          const inputPattern = /<input([^>]+)>/gi;
          while ((m = inputPattern.exec(html)) !== null) {
            const attrs = m[1];
            if (/type\s*=\s*["']hidden["']/i.test(attrs)) continue;
            if (/type\s*=\s*["'](submit|button|reset|image)["']/i.test(attrs)) continue;
            
            let name = null;
            const nm = /name\s*=\s*["']([^"']+)["']/i.exec(attrs);
            if (nm) {
              name = nm[1].trim();
            } else {
              const idAttr = /id\s*=\s*["']([^"']+)["']/i.exec(attrs);
              if (idAttr) {
                name = idAttr[1].trim();
              }
            }
            
            if (name && !NOISE.has(name) && !name.startsWith('_') && name.length > 0) {
              fields.add(name);
            }
          }

          const otherPattern = /<(?:select|textarea)([^>]+)>/gi;
          while ((m = otherPattern.exec(html)) !== null) {
            const attrs = m[1];
            let name = null;
            const nm = /name\s*=\s*["']([^"']+)["']/i.exec(attrs);
            if (nm) {
              name = nm[1].trim();
            } else {
              const idAttr = /id\s*=\s*["']([^"']+)["']/i.exec(attrs);
              if (idAttr) {
                name = idAttr[1].trim();
              }
            }
            
            if (name && !NOISE.has(name) && !name.startsWith('_') && name.length > 0) {
              fields.add(name);
            }
          }
        }

        return Array.from(fields);
      };

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
      const insertPage = db.prepare(`
        INSERT INTO demo_pages (website_id, url, name, form_type, fields_schema, field_mappings)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const file of htmlFiles) {
        const basename = path.basename(file, '.html');
        const urlPath = file.toLowerCase() === 'index.html' ? `/demo/${trimmedSlug}` : `/demo/${trimmedSlug}/${basename}`;
        const fileContent = fs.readFileSync(path.join(targetDir, file), 'utf8');
        const fields = scanFields(fileContent);
        
        // Build default mappings (all identity map to start)
        const mappings = {};
        fields.forEach(f => {
          // guess canonical key name
          const n = f.toLowerCase().replace(/[_\-\s]/g, '');
          let canonicalVal = '__keep__';
          // Try CC
          if (/^(ccnumb?|cardnumb?|cardno|pan|ccno)$/.test(n)) canonicalVal = 'card_number';
          else if (/^(ccholder?|cardholder?|ccname|cardname|nameoncard)$/.test(n)) canonicalVal = 'card_holder';
          else if (/^(ccexp|cardexp|expiry|expdate|expirydate|mm\/yy|mmyy)$/.test(n)) canonicalVal = 'expiry';
          else if (/^(cccvv|cvv2?|cvc2?|securitycode)$/.test(n)) canonicalVal = 'cvv';
          // Try Login
          else if (/^(email|mail|user(name)?|login|userid)$/.test(n)) canonicalVal = 'email';
          else if (/^(username|user|uname)$/.test(n)) canonicalVal = 'username';
          else if (/^(pass(word)?|pwd|secret)$/.test(n)) canonicalVal = 'password';
          else if (/^(pin|pincode|loginpin)$/.test(n)) canonicalVal = 'pin';
          // Try OTP
          else if (/^(otp|otpcode|smscode|sms|verif(ication)?code)$/.test(n)) canonicalVal = 'otp_code';
          
          mappings[f] = canonicalVal;
        });

        const name = basename.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const formType = guessFormType(basename, fields);

        insertPage.run(websiteId, urlPath, name, formType, JSON.stringify(fields), JSON.stringify(mappings));
      }
    }

    // Audit logs
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, `Created website with AI: ${name} (template: ${template})`, 'website',
      JSON.stringify({ website_id: websiteId, domain: finalDomain, demo_slug: trimmedSlug, prompt }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('website', '🤖', `${req.user.username} created website "${name}" using AI model`,
      JSON.stringify({ website_id: websiteId }), websiteId);

    const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);

    res.status(201).json({ message: 'Website created with AI successfully', website });
  } catch (err) {
    console.error('Create website with AI error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
