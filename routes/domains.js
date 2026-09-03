/**
 * Domain Management API — /api/domains
 *
 * GET    /                 list all managed domains
 * POST   /                 add & start provisioning a new domain
 * POST   /import           bulk add (JSON array of domain strings)
 * GET    /quota            Cloudflare zone quota for this account
 * GET    /:id              domain detail
 * DELETE /:id              delete + cleanup (CF zone + VPS nginx site)
 * POST   /:id/recheck      force a pipeline recheck now
 * POST   /:id/override     admin manually marks a step as completed
 * GET    /:id/audit        per-domain audit log
 *
 * POST /api/webhooks/cloudflare  (stub — future: CF zone activation webhook)
 */

const router = require('express').Router();
const { getAdapter }                          = require('../database/adapter');
const { authenticateToken, requireRole, requirePage, requireAction } = require('../middleware/auth');
const { scopeSqlClause }                      = require('../middleware/scope');
const { addDomain, deleteDomain, checkDomain, checkUptime, STATUS } = require('../services/domainPipeline');
const CF                                      = require('../services/providers/cloudflare');
const VPS                                     = require('../services/vpsDomain');
const { writeAudit }                          = require('../services/audit');
const { notifyOwnerAndGods, notifyGods, actorLabel } = require('../services/notification');

router.use(authenticateToken);
router.use(requireRole('admin', 'super_admin'));
router.use(requirePage('domains'));

// Guard for /api/domains/:id — 404 unless the caller owns this domain.
// God unrestricted (unless impersonating via ?as_user, in which case they see
// only that user's rows).
async function _guardDomainId(req, res, next) {
  if (!req.params.id) return next();
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const uid = req.effectiveUserId;
  try {
    const db = getAdapter();
    const d  = await db.get('SELECT owner_id FROM domains WHERE id = ?', [parseInt(req.params.id, 10)]);
    if (!d) return res.status(404).json({ error: 'Domain not found' });
    if (uid != null && Number(d.owner_id) !== Number(uid)) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    next();
  } catch (err) {
    console.error('[domains] scope guard error:', err.message);
    res.status(500).json({ error: 'Scope check failed' });
  }
}

function tryParse(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function shape(d) {
  return {
    ...d,
    nameservers:  tryParse(d.nameservers, []),
    dns_records:  tryParse(d.dns_records, []),
    flagged:      d.flagged ? 1 : 0,
    flag_reason:  d.flag_reason || null,
    flag_detected_at: d.flag_detected_at || null,
  };
}

// ─── List ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const db      = getAdapter();
    // Multi-tenant scope — non-god sees only their own domains.
    const scope   = scopeSqlClause(req, 'owner_id');
    const domains = await db.all(
      `SELECT * FROM domains WHERE 1=1${scope.clause} ORDER BY created_at DESC`,
      scope.params
    );
    res.json({ domains: domains.map(shape) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add single domain ─────────────────────────────────────────────────────────

router.post('/', requireAction('domains', 'create'), async (req, res) => {
  const { domain } = req.body || {};
  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'domain is required' });
  }

  try {
    const websiteId = req.body.website_id ? Number(req.body.website_id) : null;
    const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;

    // If attaching to a website, that website must be owned by the same user.
    if (websiteId) {
      const db = getAdapter();
      const w  = await db.get('SELECT owner_id FROM websites WHERE id = ?', [websiteId]);
      if (!w) return res.status(400).json({ error: 'website_id references a website that does not exist' });
      if (Number(w.owner_id) !== Number(ownerId)) {
        return res.status(403).json({ error: 'website_id must reference a website you own' });
      }
    }
    // Panel is VPS-only. hosting_provider is fixed on the server.
    const result = await addDomain(domain, {
      website_id:       websiteId,
      hosting_provider: 'vps',
      owner_id:         ownerId,
    });
    await writeAudit(req, `Added domain: ${domain}`, 'domain', { domain, website_id: websiteId, resumed: result.resumed });

    // Owner + every god get notified — god sees every tenant's new domain.
    const actor = await actorLabel(req.user.id);
    notifyOwnerAndGods(null, ownerId, {
      type: 'info', event: 'domain_added',
      title: result.resumed ? 'Domain Provisioning Resumed' : 'Domain Added',
      message: `${actor} ${result.resumed ? 'resumed provisioning for' : 'added'} ${domain}${websiteId ? ` (linked to website #${websiteId})` : ''}.`,
      link: '/domains',
    }, { actorId: req.user.id });

    res.status(result.resumed ? 200 : 201).json({
      ok:      true,
      domain:  shape(result.domain),
      resumed: result.resumed,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Adopt a legacy website domain into the managed table ────────────────────
// Legacy = domain stored on websites.domain (or websites.domain_alt) but not
// in the domains table. Uses the CF zone info already saved by the deploy
// wizard (websites.cf_zone_id + cf_nameservers), so no CF API round-trip.

router.post('/adopt', requireAction('domains', 'adopt'), async (req, res) => {
  const { website_id, domain } = req.body || {};
  if (!website_id || !domain) {
    return res.status(400).json({ error: 'website_id and domain are required' });
  }
  const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;
  const cleanDomain = String(domain).toLowerCase().trim().replace(/^www\./, '');

  try {
    const db = getAdapter();
    const w  = await db.get('SELECT * FROM websites WHERE id = ?', [Number(website_id)]);
    if (!w) return res.status(404).json({ error: 'Website not found' });
    // Target website must be owned by the effective caller.
    if (Number(w.owner_id) !== Number(ownerId)) {
      return res.status(403).json({ error: 'You do not own this website' });
    }

    // Verify the domain actually belongs to this website (primary or alt)
    const alts = tryParse(w.domain_alt, []);
    const knownDomains = new Set([
      (w.domain || '').toLowerCase().trim(),
      ...alts.map(a => (a?.domain || '').toLowerCase().trim()),
    ].filter(Boolean));
    if (!knownDomains.has(cleanDomain)) {
      return res.status(400).json({ error: `Domain ${cleanDomain} is not attached to website ${w.name}` });
    }

    // Already in managed? — 409 with the existing row so frontend can jump to it
    const existing = await db.get('SELECT * FROM domains WHERE domain = ?', [cleanDomain]);
    if (existing) {
      return res.status(409).json({ error: 'Already in managed table', domain: shape(existing) });
    }

    if (!w.vps_host) {
      return res.status(400).json({ error: `Website "${w.name}" has no VPS configured — adopt requires a VPS host.` });
    }
    const provider = 'vps';
    const nameservers = w.cf_nameservers ? String(w.cf_nameservers).split(',').map(s => s.trim()).filter(Boolean) : [];
    // If we have zone info assume 'live' (site was working under legacy); if not, pending_nameservers.
    const status = w.cf_zone_id ? 'live' : 'pending_nameservers';

    const result = await db.run(
      `INSERT INTO domains
         (domain, dns_provider, hosting_provider, cf_zone_id, nameservers, status,
          website_id, owner_id, uptime_ok, ssl_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanDomain,
        'cloudflare',
        provider,
        w.cf_zone_id || null,
        JSON.stringify(nameservers),
        status,
        w.id,
        ownerId,
        status === 'live' ? 1 : null,
        status === 'live' ? 'active' : null,
      ]
    );

    const newDomain = await db.get('SELECT * FROM domains WHERE id = ?', [result.lastInsertRowid]);
    await db.run(
      `INSERT INTO domain_audit_logs (domain_id, domain_name, action, details)
       VALUES (?, ?, 'adopted_from_legacy', ?)`,
      [newDomain.id, cleanDomain, JSON.stringify({
        website_id: w.id, website_name: w.name, provider,
        cf_zone_id: w.cf_zone_id || null, has_zone: !!w.cf_zone_id,
      })]
    );

    const actor = await actorLabel(req.user.id);
    notifyOwnerAndGods(null, ownerId, {
      type: 'info', event: 'domain_adopted',
      title: 'Domain Adopted',
      message: `${actor} adopted legacy domain ${cleanDomain} into website "${w.name}".`,
      link: '/domains',
    }, { actorId: req.user.id });

    res.status(201).json({ ok: true, domain: shape(newDomain) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Bulk import ───────────────────────────────────────────────────────────────

router.post('/import', requireAction('domains', 'import'), async (req, res) => {
  const { domains } = req.body || {};
  if (!Array.isArray(domains) || !domains.length) {
    return res.status(400).json({ error: 'domains array is required' });
  }

  const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;
  const results = [];
  for (const raw of domains.slice(0, 50)) {
    const dom = (raw || '').toString().toLowerCase().trim();
    try {
      const r = await addDomain(dom, { owner_id: ownerId });
      results.push({ domain: dom, ok: true, resumed: r.resumed, id: r.domain.id });
    } catch (err) {
      results.push({ domain: dom, ok: false, error: err.message });
    }
  }

  const ok  = results.filter(r => r.ok).length;
  const bad = results.length - ok;
  await writeAudit(req, `Bulk imported ${ok} domain(s)`, 'domain', { total: results.length, ok, failed: bad });

  if (ok > 0) {
    const actor = await actorLabel(req.user.id);
    notifyOwnerAndGods(null, ownerId, {
      type: bad > 0 ? 'warning' : 'info', event: 'domain_import',
      title: `Bulk Domain Import — ${ok} added`,
      message: `${actor} imported ${ok} domain${ok === 1 ? '' : 's'}${bad > 0 ? ` (${bad} failed)` : ''}.`,
      link: '/domains',
    }, { actorId: req.user.id });
  }

  res.json({ results, summary: { ok, failed: bad } });
});

// ─── Check all domains ─────────────────────────────────────────────────────────

router.post('/check-all', requireAction('domains', 'recheck'), async (req, res) => {
  try {
    const db      = getAdapter();
    // TENANT SCOPING — non-god must never trigger checks on domains they
    // don't own. Without this a super_admin could ping every one of god's
    // private domains and pollute the panel's own IP-log with rechecks.
    const scope   = scopeSqlClause(req, 'owner_id');
    const domains = await db.all(
      `SELECT id, status FROM domains
        WHERE is_processing = 0${scope.clause}
        ORDER BY last_checked_at ASC NULLS FIRST`,
      scope.params
    );
    let queued = 0;
    for (const d of domains) {
      if (d.status === STATUS.LIVE || d.status === STATUS.SSL_ISSUED) {
        checkUptime(d.id).catch(() => {});
      } else {
        checkDomain(d.id).catch(() => {});
      }
      queued++;
    }
    res.json({ ok: true, queued });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Domain health scan (SSE via deploy stream) ──────────────────────────────

const https = require('https');
const http  = require('http');
const deployRoute = require('./deploy');
const domainSessions = deployRoute._sessions || (deployRoute._sessions = new Map());
const { EventEmitter } = require('events');

function _createScanSession() {
  const id = `domain_scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const emitter = new EventEmitter();
  const session = { id, type: 'domain_scan', status: 'running', startedAt: Date.now(), emitter, logs: [] };
  domainSessions.set(id, session);
  setTimeout(() => domainSessions.delete(id), 10 * 60 * 1000);
  return session;
}
function _scanEmit(s, evt) { s.logs.push(evt); s.emitter.emit('e', evt); }

router.post('/health-scan', requireAction('domains', 'health-scan'), async (req, res) => {
  const session = _createScanSession();
  // Capture the scope at request time — the async worker below runs after
  // res.json has returned, so req.effectiveUserId must be snapshotted here.
  const scope = scopeSqlClause(req, 'owner_id');
  res.json({ session_id: session.id });

  (async () => {
    try {
      const db = getAdapter();
      // TENANT SCOPING — probing every domain in the DB from a client's
      // session would (a) leak the existence of god's private domains via
      // the streamed log and (b) send outbound HTTPS requests from the
      // panel's IP to god's boxes on the client's behalf. Scope to caller.
      const domains = await db.all(
        `SELECT id, domain, status, uptime_ok, flagged FROM domains
          WHERE 1=1${scope.clause}
          ORDER BY status, domain`,
        scope.params
      );
      _scanEmit(session, { type: 'log', message: `Scanning ${domains.length} domain(s)...\n` });

      for (const d of domains) {
        const url = `https://${d.domain}`;
        const start = Date.now();
        try {
          const { statusCode, ms } = await new Promise((resolve, reject) => {
            const req = https.get(url, { timeout: 8000, rejectUnauthorized: false, headers: { 'User-Agent': 'ALP-HealthCheck/1.0' } }, (resp) => {
              resp.resume();
              resolve({ statusCode: resp.statusCode, ms: Date.now() - start });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          });
          const ok = statusCode >= 200 && statusCode < 400;
          const flag = d.flagged ? ' ⚠ FLAGGED' : '';
          _scanEmit(session, { type: 'log', message: `${ok ? '✓' : '✗'} ${d.domain} — HTTP ${statusCode} (${ms}ms) [${d.status}]${flag}` });
        } catch (e) {
          _scanEmit(session, { type: 'log', message: `✗ ${d.domain} — ${e.message} [${d.status}]${d.flagged ? ' ⚠ FLAGGED' : ''}` });
        }
      }

      session.status = 'done';
      _scanEmit(session, { type: 'done', message: 'Domain scan complete.' });
    } catch (e) {
      session.status = 'error';
      _scanEmit(session, { type: 'error', message: e.message });
    }
  })();
});

// ─── Panel Domains ─────────────────────────────────────────────────────────
// Lists the domains the panel ITSELF is hosted on (from settings.panel_domain,
// plus any panel_domain_alt_* keys added for future multi-domain setups).
// God-only — these are operator infrastructure and irrelevant to clients.
// Probes each domain with a HEAD request so the operator can see uptime at
// a glance. Response shape matches the other domain tables the UI already
// knows how to render.
router.get('/panel-domains', async (req, res) => {
  // Non-god (or god impersonating a client) sees nothing here. The UI already
  // hides the section for non-god so this is a defence-in-depth 200-empty.
  if (req.effectiveUserId != null) return res.json({ panel_domains: [] });

  try {
    const db = getAdapter();
    const rows = await db.all(
      `SELECT key, value FROM settings
        WHERE key = 'panel_domain'
           OR key LIKE 'panel_domain_alt_%'`
    );
    const domains = rows
      .filter(r => r.value && String(r.value).trim())
      .map(r => ({
        key:    r.key,
        domain: String(r.value).trim().replace(/^https?:\/\//, '').split('/')[0],
        is_primary: r.key === 'panel_domain',
      }));

    // HEAD-probe each with a short timeout in parallel so the operator sees
    // uptime alongside the domain. Never blocks the render — timeouts return
    // { up: false, status: null }.
    const probe = (host) => new Promise((resolve) => {
      try {
        const start = Date.now();
        const req2 = https.get({ hostname: host, path: '/', method: 'HEAD', timeout: 4000, rejectUnauthorized: false, headers: { 'User-Agent': 'ALP-PanelProbe/1.0' } }, (resp) => {
          resp.resume();
          resolve({ up: resp.statusCode >= 200 && resp.statusCode < 500, status: resp.statusCode, ms: Date.now() - start });
        });
        req2.on('error',   () => resolve({ up: false, status: null, ms: null }));
        req2.on('timeout', () => { req2.destroy(); resolve({ up: false, status: null, ms: null }); });
      } catch { resolve({ up: false, status: null, ms: null }); }
    });

    const probed = await Promise.all(domains.map(async d => ({ ...d, ...(await probe(d.domain)) })));
    res.json({ panel_domains: probed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add a panel domain (god-only) ─────────────────────────────────────────
// Registers a domain the ALP admin panel is served on. Writes to the
// settings table: primary slot 'panel_domain' if empty, else a suffixed
// 'panel_domain_alt_<slug>' key for the additional domain. Never touches
// the domains table — panel infra domains are intentionally separate from
// tenant xPages domains.
router.post('/panel-domain', async (req, res) => {
  if (req.user.role !== 'god' || req.effectiveUserId != null) {
    return res.status(403).json({ error: 'Panel domains are god-only' });
  }
  const raw = req.body && req.body.domain;
  const domain = String(raw || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!domain || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain — expected e.g. panel.example.com' });
  }

  try {
    const db = getAdapter();

    // Duplicate check across every panel_* domain key.
    const existing = await db.all(
      `SELECT key, value FROM settings WHERE key = 'panel_domain' OR key LIKE 'panel_domain_alt_%'`
    );
    for (const row of existing) {
      if (row.value && String(row.value).trim().toLowerCase() === domain) {
        return res.status(409).json({ error: `${domain} is already registered as a panel domain (${row.key})` });
      }
    }

    // Primary slot if it's empty; otherwise a suffixed alt slot. Slug is the
    // domain with dots/dashes normalised so the key stays legal-looking.
    const primaryRow = existing.find(r => r.key === 'panel_domain');
    const primaryEmpty = !primaryRow || !String(primaryRow.value || '').trim();
    const slug = domain.replace(/[^a-z0-9]+/g, '_').slice(0, 48);
    const key  = primaryEmpty ? 'panel_domain' : `panel_domain_alt_${slug}`;

    if (primaryRow) {
      await db.run(
        `UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
        [domain, key]
      );
    } else {
      await db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, domain]
      );
    }

    await writeAudit(req, `Added panel domain ${domain}`, 'settings', { key, domain, role: primaryEmpty ? 'primary' : 'alt' });

    res.json({
      ok: true,
      domain,
      key,
      role: primaryEmpty ? 'primary' : 'alt',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete a panel domain (god-only) ──────────────────────────────────────
router.delete('/panel-domain', async (req, res) => {
  if (req.user.role !== 'god' || req.effectiveUserId != null) {
    return res.status(403).json({ error: 'Panel domains are god-only' });
  }
  const key = req.body && req.body.key;
  if (!key || (key !== 'panel_domain' && !/^panel_domain_alt_[a-z0-9_]+$/.test(key))) {
    return res.status(400).json({ error: 'Invalid panel domain key' });
  }
  try {
    const db = getAdapter();
    // For the primary slot, clear the value rather than delete the row so the
    // key survives as a placeholder that the settings UI can rewrite later.
    if (key === 'panel_domain') {
      await db.run(`UPDATE settings SET value = '', updated_at = CURRENT_TIMESTAMP WHERE key = ?`, [key]);
    } else {
      await db.run(`DELETE FROM settings WHERE key = ?`, [key]);
    }
    await writeAudit(req, `Removed panel domain ${key}`, 'settings', { key });
    res.json({ ok: true, key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cloudflare quota ──────────────────────────────────────────────────────────

router.get('/quota', async (req, res) => {
  // Cloudflare is a SHARED resource today (single god-level token). Exposing
  // the real zone count to non-god callers would leak how many domains god
  // has under management. Until per-user CF tokens land, return a hidden
  // shape for non-god so their UI simply doesn't show the tile.
  if (req.effectiveUserId != null) {
    return res.json({ configured: false, count: null, limit: null, scoped: true });
  }
  if (!CF.isConfigured()) {
    return res.json({ configured: false, count: null, limit: null });
  }
  try {
    const quota = await CF.getZoneCount();
    res.json({ configured: true, ...quota });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Detail ────────────────────────────────────────────────────────────────────

router.get('/:id', _guardDomainId, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Domain not found' });
  try {
    const db     = getAdapter();
    const domain = await db.get('SELECT * FROM domains WHERE id = ?', [req.params.id]);
    if (!domain) return res.status(404).json({ error: 'Domain not found' });
    res.json({ domain: shape(domain) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:id', requireAction('domains', 'delete'), _guardDomainId, async (req, res) => {
  try {
    // deleteDomain now never throws for cleanup-only failures — the row is
    // gone from the DB regardless. `notices` may include CF cleanup hints
    // (e.g. token lacks Zone-Delete). `warnings` reserved for unexpected errors.
    const db = getAdapter();
    const domRow = await db.get('SELECT domain, owner_id FROM domains WHERE id = ?', [req.params.id]);
    const { notices, warnings } = await deleteDomain(req.params.id);
    await writeAudit(req, `Deleted domain: ${domRow?.domain || req.params.id}`, 'domain', { domain_id: req.params.id, domain: domRow?.domain });

    if (domRow?.domain) {
      const actor = await actorLabel(req.user.id);
      notifyOwnerAndGods(null, domRow.owner_id, {
        type: 'warning', event: 'domain_deleted',
        title: 'Domain Deleted',
        message: `${actor} deleted domain ${domRow.domain}.`,
        link: '/domains',
        undo: { kind: 'domain_delete', params: { domain: domRow.domain, owner_id: domRow.owner_id, previous_id: Number(req.params.id) } },
      }, { actorId: req.user.id });
    }

    res.json({ ok: true, notices: notices || [], warnings: warnings || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Force recheck ─────────────────────────────────────────────────────────────

router.post('/:id/recheck', requireAction('domains', 'recheck'), _guardDomainId, async (req, res) => {
  try {
    const db     = getAdapter();
    const domain = await db.get('SELECT * FROM domains WHERE id = ?', [req.params.id]);
    if (!domain) return res.status(404).json({ error: 'Domain not found' });
    if (domain.is_processing) {
      return res.status(409).json({ error: 'A check is already in progress for this domain' });
    }
    // Fire-and-forget — status will update in DB, frontend polls
    checkDomain(req.params.id).catch(err =>
      console.error(`[Domains] recheck error for ${domain.domain}:`, err.message)
    );
    await writeAudit(req, `Rechecked domain: ${domain.domain}`, 'domain', { domain_id: req.params.id, domain: domain.domain });
    res.json({ ok: true, message: 'Check started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Force VPS reconfigure ─────────────────────────────────────────────────
// Re-runs the full attachDomainToVps flow for a VPS-linked domain: resync
// files, rewrite tracker + api key placeholders, refresh antibot.js, and
// re-write the nginx site config. Use when a live domain has stale content
// or missing tracker/antibot but the uptime check says "up" (so auto-heal
// never fires).
router.post('/:id/reconfigure', requireAction('domains', 'reconfigure'), _guardDomainId, async (req, res) => {
  try {
    const db     = getAdapter();
    const domain = await db.get('SELECT * FROM domains WHERE id = ?', [req.params.id]);
    if (!domain) return res.status(404).json({ error: 'Domain not found' });
    if (domain.hosting_provider !== 'vps') {
      return res.status(400).json({ error: 'Reconfigure only applies to VPS-hosted domains' });
    }
    if (!domain.website_id) {
      return res.status(400).json({ error: 'Domain is not linked to a website' });
    }

    const logs = [];
    const result = await VPS.attachDomainToVps({
      websiteId: domain.website_id,
      domain:    domain.domain,
      cfZoneId:  domain.cf_zone_id,
      onStep: (label) => logs.push({ type: 'step', label }),
      onLog:  (line, level) => logs.push({ type: 'log', line, level }),
    });
    await writeAudit(req, `Reconfigured VPS for domain: ${domain.domain}`, 'domain', { domain_id: req.params.id, domain: domain.domain, website_id: domain.website_id });
    res.json({ ok: true, result, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update linked scam page ──────────────────────────────────────────────────

router.put('/:id/website', requireAction('domains', 'assign'), _guardDomainId, async (req, res) => {
  const websiteId = req.body.website_id != null ? Number(req.body.website_id) || null : null;
  try {
    const db     = getAdapter();
    const domain = await db.get('SELECT * FROM domains WHERE id = ?', [req.params.id]);
    if (!domain) return res.status(404).json({ error: 'Domain not found' });

    // Clear domain from the OLD linked website before switching
    if (domain.website_id && domain.website_id !== websiteId) {
      await db.run(
        'UPDATE websites SET domain = NULL, domain_active = 0 WHERE id = ? AND domain = ?',
        [domain.website_id, domain.domain]
      );
    }

    // Panel is VPS-only. Force provider to 'vps' and refuse if the target
    // website has no VPS configured.
    let provider = 'vps';
    if (websiteId) {
      const w = await db.get('SELECT vps_host, owner_id FROM websites WHERE id = ?', [websiteId]);
      if (!w || !w.vps_host) {
        return res.status(400).json({ error: 'Target website has no VPS configured — configure a VPS host first.' });
      }
      // Enforce single-owner: can only reassign a domain to a website with the
      // same owner. Prevents accidental cross-user domain hand-off.
      if (Number(w.owner_id) !== Number(domain.owner_id)) {
        return res.status(403).json({ error: 'Target website is owned by a different user' });
      }
    }

    await db.run(
      'UPDATE domains SET website_id = ?, hosting_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [websiteId, provider, req.params.id]
    );

    // If domain is already live/ssl_issued and linked to a VPS website,
    // trigger VPS configuration (nginx + file sync) so the domain actually
    // serves the linked website instead of showing 403.
    let vpsResult = null;
    if (websiteId && provider === 'vps' && ['live', 'ssl_issued', 'vps_configured'].includes(domain.status)) {
      try {
        const w = await db.get('SELECT vps_host, vps_ssh_pass, vps_ssh_key FROM websites WHERE id = ?', [websiteId]);
        if (w && w.vps_host && (w.vps_ssh_pass || w.vps_ssh_key)) {
          const logs = [];
          vpsResult = await VPS.attachDomainToVps({
            websiteId, domain: domain.domain, cfZoneId: domain.cf_zone_id,
            onStep: (label) => logs.push({ type: 'step', label }),
            onLog:  (line, level) => logs.push({ type: 'log', line, level }),
          });
        }
      } catch (vpsErr) {
        vpsResult = { error: vpsErr.message };
      }
    }

    if (websiteId && domain.status === 'live') {
      await db.run(
        'UPDATE websites SET is_active = 1, domain = ?, domain_active = 1 WHERE id = ?',
        [domain.domain, websiteId]
      );
    }
    await writeAudit(req, `Reassigned domain ${domain.domain} to website ${websiteId || '(none)'}`, 'domain', { domain_id: req.params.id, domain: domain.domain, old_website_id: domain.website_id, new_website_id: websiteId });
    res.json({ ok: true, vps: vpsResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Manual override ───────────────────────────────────────────────────────────

router.post('/:id/override', requireAction('domains', 'override'), _guardDomainId, async (req, res) => {
  const { status, note } = req.body || {};
  const valid = Object.values(STATUS);
  if (!status || !valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  try {
    const db     = getAdapter();
    const domain = await db.get('SELECT * FROM domains WHERE id = ?', [req.params.id]);
    if (!domain) return res.status(404).json({ error: 'Domain not found' });

    await db.run(
      `UPDATE domains SET status = ?, manual_override = 1, manual_override_note = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, note || null, req.params.id]
    );
    await getAdapter().run(
      `INSERT INTO domain_audit_logs (domain_id, domain_name, action, details)
       VALUES (?, ?, 'manual_override', ?)`,
      [req.params.id, domain.domain, JSON.stringify({ status, note })]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Audit log ─────────────────────────────────────────────────────────────────

router.get('/:id/audit', _guardDomainId, async (req, res) => {
  try {
    const db   = getAdapter();
    const logs = await db.all(
      'SELECT * FROM domain_audit_logs WHERE domain_id = ? ORDER BY created_at DESC LIMIT 200',
      [req.params.id]
    );
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
