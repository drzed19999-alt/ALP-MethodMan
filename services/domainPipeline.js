/**
 * Domain Pipeline — State Machine (VPS-only)
 *
 * States: pending_nameservers → nameservers_active → vps_configured → live
 * Error state can occur at any step; retry logic resumes from the right stage.
 *
 * Business logic only talks through provider interfaces (CloudflareProvider /
 * VPS). No Cloudflare SDK is imported here directly.
 */

const https = require('https');
const { getAdapter } = require('../database/adapter');
const CF  = require('./providers/cloudflare');
const VPS = require('./vpsDomain');
const { createNotification } = require('./notification');

// ─── Telegram alert (non-blocking, uses DB config) ────────────────────────────
async function sendTgAlert(title, body) {
  try {
    const db  = getAdapter();
    const cfg = await db.get('SELECT * FROM telegram_config WHERE id = 1');
    if (!cfg || !cfg.is_active || !cfg.bot_token || !cfg.chat_id) return;
    const text = `<b>${title}</b>\n\n${body}`;
    const payload = JSON.stringify({ chat_id: cfg.chat_id, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${cfg.bot_token}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch {}
}

// ─── Flag detection keywords ──────────────────────────────────────────────────
const FLAG_PATTERNS = [
  /seized by/i, /has been seized/i, /domain seized/i, /domain has been/i,
  /taken offline/i, /taken down by/i, /court order/i, /forfeiture/i,
  /law enforcement/i, /federal bureau/i, /europol/i,
  /fbi\.gov/i, /dea\.gov/i, /doj\.gov/i, /ice\.gov/i,
  /domain suspended/i, /account suspended/i, /suspended for/i,
  /this site has been blocked/i, /access to this site/i,
];

function detectFlag(content) {
  for (const p of FLAG_PATTERNS) {
    const m = content.match(p);
    if (m) return m[0];
  }
  return null;
}

// ─── Google Safe Browsing check ──────────────────────────────────────────────
// Two-layer check: (1) official Safe Browsing API v4 if key set,
// (2) public transparencyreport API as fallback — no key needed.
//
// Transparency report response shape (after stripping `)]}'` prefix):
//   [["sb.ssr", statusCode, malware, unwanted, socialEng, ..., lastCheckedTs, domain]]
// statusCode meanings observed:
//   1 = safe (has data, no threats)
//   2 = DANGEROUS (any threat type — malware / phishing / unwanted software)
//   4 = safe (no data / trusted major site)
// The timestamp field is "last checked", NOT "last flagged" — do NOT read it as a
// flag indicator. Only statusCode === 2 means the site is blocked in Chrome.
function checkSafeBrowsing(domain) {
  const key = process.env.GOOGLE_SAFEBROWSING_KEY;

  const officialCheck = () => new Promise((resolve) => {
    if (!key) return resolve(null);
    try {
      const body = JSON.stringify({
        client:     { clientId: 'alp-panel', clientVersion: '1.0' },
        threatInfo: {
          threatTypes:      ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes:    ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries:    [{ url: `https://${domain}/` }],
        },
      });
      const req = https.request({
        hostname: 'safebrowsing.googleapis.com',
        path:     `/v4/threatMatches:find?key=${key}`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  8000,
      }, (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.matches && parsed.matches.length) {
              resolve(`Google Safe Browsing: ${parsed.matches[0].threatType || 'UNKNOWN'}`);
            } else { resolve(null); }
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(body); req.end();
    } catch { resolve(null); }
  });

  const publicCheck = () => new Promise((resolve) => {
    try {
      const req = https.request({
        hostname: 'transparencyreport.google.com',
        path:     `/transparencyreport/api/v3/safebrowsing/status?site=${encodeURIComponent(domain)}`,
        method:   'GET',
        headers:  { 'User-Agent': 'Mozilla/5.0' },
        timeout:  8000,
      }, (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try {
            const arr = JSON.parse(raw.replace(/^\)\]\}'/, '').trim())[0];
            const statusCode = arr && arr[1];
            if (statusCode === 2) {
              const malware   = arr[2] === true;
              const unwanted  = arr[3] === true;
              const socialEng = arr[4] === true;
              const kinds = [malware && 'MALWARE', unwanted && 'UNWANTED_SOFTWARE', socialEng && 'SOCIAL_ENGINEERING']
                .filter(Boolean).join('+') || 'THREAT';
              resolve(`Google Safe Browsing: ${kinds}`);
            } else { resolve(null); }
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch { resolve(null); }
  });

  return officialCheck().then(r => r || publicCheck());
}

const STATUS = {
  PENDING_NS:     'pending_nameservers',
  NS_ACTIVE:      'nameservers_active',
  VPS_CONFIGURED: 'vps_configured',    // VPS branch: nginx site written + cert (if zone active)
  SSL_ISSUED:     'ssl_issued',
  LIVE:           'live',
  ERROR:          'error',
};

function isValidDomain(d) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(d);
}

async function dbGet(id) {
  return getAdapter().get('SELECT * FROM domains WHERE id = ?', [id]);
}

async function dbUpdate(id, updates) {
  const db = getAdapter();
  const keys = Object.keys(updates);
  if (!keys.length) return;
  const sql = `UPDATE domains SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await db.run(sql, [...Object.values(updates), id]);
}

async function audit(domainId, domainName, action, details = {}, error = null) {
  try {
    await getAdapter().run(
      `INSERT INTO domain_audit_logs (domain_id, domain_name, action, details, error)
       VALUES (?, ?, ?, ?, ?)`,
      [domainId, domainName, action, JSON.stringify(details), error || null]
    );
  } catch { /* audit failures must never crash the pipeline */ }
}

// ─── Add Domain ────────────────────────────────────────────────────────────────

async function addDomain(rawDomain, opts = {}) {
  const domain = rawDomain.toLowerCase().trim().replace(/^www\./, '');

  if (!isValidDomain(domain)) throw new Error('Invalid domain format');
  if (!CF.isConfigured()) throw new Error('CLOUDFLARE_API_TOKEN is not set');

  const db = getAdapter();

  // Idempotent: resume from current state
  const existing = await db.get('SELECT * FROM domains WHERE domain = ?', [domain]);
  if (existing) {
    return { domain: existing, resumed: true };
  }

  // ── Provider selection — VPS only.
  const provider = 'vps';
  if (!opts.website_id) throw new Error('VPS hosting requires a linked website (website_id)');
  const w = await db.get(`SELECT id, name, owner_id, vps_host, vps_ssh_pass, vps_ssh_key FROM websites WHERE id = ?`, [opts.website_id]);
  if (!w)              throw new Error(`Website #${opts.website_id} not found`);
  if (!w.vps_host)     throw new Error(`Website "${w.name}" has no VPS configured — run the Host wizard first`);
  if (!w.vps_ssh_pass && !w.vps_ssh_key) throw new Error(`Website "${w.name}" has no SSH credentials`);

  // Domain ownership follows the website's owner. If the caller passed an
  // owner_id, it must match — never let a caller silently transfer ownership.
  const ownerId = w.owner_id;
  if (opts.owner_id != null && Number(opts.owner_id) !== Number(ownerId)) {
    throw new Error(`Website "${w.name}" is owned by user #${ownerId}, not #${opts.owner_id}`);
  }

  const { zoneId, nameservers } = await CF.createZone(domain);

  // VPS uses Full (Strict) once cert is issued; start flexible.
  try { await CF.setSslMode(zoneId, 'flexible'); } catch { /* non-fatal */ }

  const result = await db.run(
    `INSERT INTO domains
       (domain, dns_provider, hosting_provider, cf_zone_id, nameservers, status, website_id, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      domain,
      opts.dns_provider     || 'cloudflare',
      provider,
      zoneId,
      JSON.stringify(nameservers),
      STATUS.PENDING_NS,
      opts.website_id                       || null,
      ownerId,
    ]
  );

  const newDomain = await db.get('SELECT * FROM domains WHERE id = ?', [result.lastInsertRowid]);
  await audit(newDomain.id, domain, 'zone_created', { zoneId, nameservers, provider });
  try {
    const bp = await CF.enableBotProtection(zoneId);
    await audit(newDomain.id, domain, 'bot_protection_enabled', bp);
  } catch (err) {
    await audit(newDomain.id, domain, 'bot_protection_failed', {}, err.message);
  }
  try {
    const waf = await CF.createAntiScannerRules(zoneId);
    await audit(newDomain.id, domain, 'waf_rules_created', waf);
  } catch (err) {
    await audit(newDomain.id, domain, 'waf_rules_failed', {}, err.message);
  }
  return { domain: newDomain, resumed: false };
}

// ─── Delete Domain (with cleanup) ─────────────────────────────────────────────

async function deleteDomain(domainId) {
  const domain = await dbGet(domainId);
  if (!domain) throw new Error('Domain not found');

  const errors  = [];
  const notices = [];

  // ── VPS cleanup: remove nginx site file + SSL cert on the linked VPS ─────
  if (domain.hosting_provider === 'vps' && domain.website_id) {
    try {
      const logs = [];
      const result = await VPS.removeDomainFromVps({
        websiteId: domain.website_id,
        domain:    domain.domain,
        onStep: (label) => logs.push({ type: 'step', label }),
        onLog:  (line, level) => logs.push({ type: 'log', line, level }),
      });
      if (result.skipped) notices.push('VPS cleanup skipped — website has no VPS');
      else                await audit(domainId, domain.domain, 'vps_cleaned', { logs });
    } catch (err) {
      // Non-fatal: log the error but keep going with CF + DB cleanup
      errors.push(`VPS cleanup: ${err.message}`);
      await audit(domainId, domain.domain, 'vps_cleanup_error', {}, err.message);
    }
  }

  // ── Cloudflare zone cleanup ──────────────────────────────────────────────
  // Failures here are non-fatal: the DB row is deleted regardless, and stale
  // CF zones can be pruned manually. We downgrade the two common misconfig
  // cases (missing/invalid token) to informational notices so users don't
  // see a scary red toast when the DB delete actually succeeded.
  if (domain.cf_zone_id) {
    try {
      const { alreadyGone } = await CF.deleteZone(domain.cf_zone_id) || {};
      if (alreadyGone) {
        notices.push('Cloudflare zone was already removed externally');
      } else {
        await audit(domainId, domain.domain, 'zone_deleted');
      }
    } catch (err) {
      const msg = String(err && err.message || err);
      const isAuth = /unauthor|forbidden|invalid token|not authorized|401|403/i.test(msg);
      if (isAuth) {
        notices.push(`Cloudflare cleanup skipped — token lacks Zone-Delete permission (${msg}). Remove the zone manually if needed.`);
        await audit(domainId, domain.domain, 'zone_cleanup_skipped_auth', {}, msg);
      } else {
        // Genuine unexpected error — still non-fatal, but surfaced clearly.
        notices.push(`Cloudflare cleanup: ${msg}`);
        await audit(domainId, domain.domain, 'zone_cleanup_error', {}, msg);
      }
    }
  }

  await getAdapter().run('DELETE FROM domains WHERE id = ?', [domainId]);

  // Clear domain reference from ANY website still showing this domain name
  try {
    await getAdapter().run(
      'UPDATE websites SET domain = NULL, domain_active = 0 WHERE domain = ?',
      [domain.domain]
    );
  } catch { /* non-fatal */ }

  // If this domain was the website's primary deploy_domain, clear that binding too
  try {
    await getAdapter().run(
      'UPDATE websites SET deploy_domain = NULL WHERE deploy_domain = ?',
      [domain.domain]
    );
  } catch { /* non-fatal */ }

  // Cleanup issues are informational, not fatal — the DB row is already gone
  // and the caller sees them via `notices` rather than a 500 error.
  return { notices, warnings: errors };
}

// ─── Check / Advance pipeline ─────────────────────────────────────────────────

async function checkDomain(domainId) {
  let domain = await dbGet(domainId);
  if (!domain) return;
  if (domain.is_processing) return; // concurrency lock

  await dbUpdate(domainId, { is_processing: 1 });
  try {
    domain = await dbGet(domainId); // re-fetch after lock
    await _advance(domain);
  } finally {
    await dbUpdate(domainId, { is_processing: 0 });
  }
}

async function _advance(domain) {
  switch (domain.status) {
    case STATUS.PENDING_NS:
      return _checkNameservers(domain);

    case STATUS.NS_ACTIVE:
      return _configureVps(domain);

    case STATUS.VPS_CONFIGURED:
      return _checkVpsLive(domain);

    case STATUS.SSL_ISSUED:
    case STATUS.LIVE:
      return _checkUptime(domain);

    case STATUS.ERROR:
      return _recover(domain);
  }
}

// Auto-activate the linked website on transition to LIVE.
async function _activateLinkedWebsite(domain) {
  if (!domain.website_id) return;
  try {
    const db      = getAdapter();
    const website = await db.get('SELECT id, name FROM websites WHERE id = ?', [domain.website_id]);
    if (!website) return;
    await db.run(
      'UPDATE websites SET is_active = 1, domain = ?, domain_active = 1 WHERE id = ?',
      [domain.domain, domain.website_id]
    );
    await audit(domain.id, domain.domain, 'website_activated', {
      website_id: domain.website_id, website_name: website.name,
    });
  } catch { /* non-fatal */ }
}

// ─── VPS pipeline step: configure nginx + Origin cert on the linked website's VPS
async function _configureVps(domain) {
  try {
    if (!domain.website_id) {
      throw new Error('VPS domain has no linked website — cannot determine target VPS');
    }
    const logs = [];
    const result = await VPS.attachDomainToVps({
      websiteId: domain.website_id,
      domain:    domain.domain,
      cfZoneId:  domain.cf_zone_id,
      onStep: (label) => logs.push({ type: 'step', label }),
      onLog:  (line, level) => logs.push({ type: 'log', line, level }),
    });
    await audit(domain.id, domain.domain, 'vps_configured', { result, logs });
    await dbUpdate(domain.id, {
      status:          result.ssl ? STATUS.LIVE : STATUS.VPS_CONFIGURED,
      error_count:     0,
      error_message:   result.ssl ? null : 'Zone still pending — running HTTP-only until nameservers propagate',
      last_checked_at: new Date().toISOString(),
    });
    // On LIVE transition, activate the linked website. Otherwise _checkUptime's
    // activation branch is skipped because domain.status is already LIVE.
    if (result.ssl) {
      sendTgAlert(
        '🟢 Domain Live',
        `<code>${domain.domain}</code> is now <b>live</b> on VPS!\n\n🔗 https://${domain.domain}`
      );
      await _activateLinkedWebsite({ ...domain, status: STATUS.LIVE });
    }
  } catch (err) {
    await _handleError(domain, err, 'vps_configure_error');
  }
}

// ─── VPS pipeline: retry cert install once the zone becomes active
async function _checkVpsLive(domain) {
  // Same as _configureVps — it's idempotent and will upgrade to SSL once zone is active
  return _configureVps(domain);
}

// Step 1 — poll Cloudflare zone status
async function _checkNameservers(domain) {
  try {
    const status = await CF.getZoneStatus(domain.cf_zone_id);
    const now    = new Date().toISOString();

    if (status === 'active') {
      await dbUpdate(domain.id, { status: STATUS.NS_ACTIVE, last_checked_at: now, error_count: 0, error_message: null });
      await audit(domain.id, domain.domain, 'zone_active');
      const fresh = await dbGet(domain.id);
      await _configureVps(fresh);
      return;
    }

    if (status === 'moved') {
      await dbUpdate(domain.id, {
        status:        STATUS.ERROR,
        error_message: 'Cloudflare zone moved — domain may already exist under another account',
        last_checked_at: now,
      });
      await audit(domain.id, domain.domain, 'zone_error', { status }, 'Zone moved');
      return;
    }

    const hoursWaiting = (Date.now() - new Date(domain.created_at).getTime()) / 3.6e6;
    const msg = hoursWaiting > 24
      ? 'Nameservers not detected after 24 h — please verify your registrar settings'
      : `Waiting for nameserver propagation (CF status: ${status})`;

    await dbUpdate(domain.id, {
      last_checked_at: now,
      error_message:   msg,
      error_count:     (domain.error_count || 0) + 1,
    });
  } catch (err) {
    await _handleError(domain, err, 'nameserver_check_error');
  }
}

// Step 3 — real HTTP reachability check + flag detection
async function _checkUptime(domain) {
  const wasUp = domain.uptime_ok === 1;
  const { ok, statusCode, content } = await _httpGetCheck(domain.domain);
  const now = new Date().toISOString();

  const updates = { uptime_ok: ok ? 1 : 0, last_uptime_check_at: now, last_checked_at: now };

  if (ok) {
    // Flag detection — check response content + Google Safe Browsing
    const flagMatch = detectFlag(content);
    const sbFlag    = !domain.flagged ? await checkSafeBrowsing(domain.domain) : null;
    const flagReason = flagMatch || sbFlag;
    if (flagReason && !domain.flagged) {
      updates.flagged          = 1;
      updates.flag_reason      = flagReason;
      updates.flag_detected_at = now;
      await audit(domain.id, domain.domain, 'domain_flagged', { flag_reason: flagReason });
      sendTgAlert(
        '⚠️ DOMAIN FLAGGED',
        `<code>${domain.domain}</code> may be seized or taken down!\n\nDetected: "<i>${flagReason}</i>"\n\n🚨 <b>Immediate action required!</b>`
      );
      createNotification(null, domain.owner_id, {
        type: 'error', event: 'domain_flagged',
        title: 'Domain Flagged',
        message: `${domain.domain} — ${flagReason}`,
        link: '#/domains',
      }).catch(() => {});
    }

    if (domain.status !== STATUS.LIVE) {
      updates.status        = STATUS.LIVE;
      updates.error_count   = 0;
      updates.error_message = null;
      await audit(domain.id, domain.domain, 'domain_live');
      await _activateLinkedWebsite(domain);

      sendTgAlert(
        '🟢 Domain Live',
        `<code>${domain.domain}</code> is now <b>live</b>!\n\n🔗 https://${domain.domain}`
      );
      createNotification(null, domain.owner_id, {
        type: 'success', event: 'domain_live',
        title: 'Domain Live',
        message: `${domain.domain} is now live!`,
        link: `https://${domain.domain}`,
      }).catch(() => {});
    } else if (!wasUp) {
      sendTgAlert('🟢 Domain Back Online', `<code>${domain.domain}</code> is back online.`);
    }
  } else {
    if (wasUp) {
      await audit(domain.id, domain.domain, 'uptime_check_failed', { statusCode }, 'HTTP check failed');
      sendTgAlert(
        '🔴 Domain Down',
        `<code>${domain.domain}</code> is not responding!\n\nStatus: ${statusCode || 'unreachable'}`
      );
    }
    // Auto-heal for VPS domains: 403/404 from nginx typically means the doc-root
    // is empty (site files never uploaded — happens when a website was created
    // via "copy VPS credentials"). Re-run _configureVps which now uploads
    // xPages/<slug>/ if the remote dir is empty. Idempotent — no-op if healthy.
    if (domain.hosting_provider === 'vps' && domain.website_id && (statusCode === 403 || statusCode === 404)) {
      await audit(domain.id, domain.domain, 'vps_auto_heal_start', { statusCode });
      await dbUpdate(domain.id, updates);
      return _configureVps(domain);
    }
  }

  await dbUpdate(domain.id, updates);
}

// Separate uptime check for already-live domains (called by monitor)
async function checkUptime(domainId) {
  const domain = await dbGet(domainId);
  if (!domain || domain.is_processing) return;
  await dbUpdate(domainId, { is_processing: 1 });
  try { await _checkUptime(domain); }
  finally { await dbUpdate(domainId, { is_processing: 0 }); }
}

function _httpGetCheck(hostname) {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        { hostname, path: '/', method: 'GET', timeout: 10000, rejectUnauthorized: false },
        (res) => {
          let content = '', size = 0;
          res.on('data', chunk => {
            size += chunk.length;
            if (size <= 8192) content += chunk.toString('utf8');
            else res.destroy();
          });
          const _resolve = () => {
            let ok = res.statusCode >= 200 && res.statusCode < 500;
            // Cloudflare Under Attack challenge (503 with cf-ray) — the domain is
            // reachable; CF is just challenging the visitor. Expected during the
            // initial 48 h protection window.
            if (!ok && res.statusCode === 503 && res.headers['cf-ray']) ok = true;
            // Broken nginx origin (403/404 with default nginx page) — doc-root
            // is empty or missing. Treat as down so the pipeline can auto-heal.
            if (ok && (res.statusCode === 403 || res.statusCode === 404) && /nginx\/|nginx \(/i.test(content)) ok = false;
            resolve({ ok, statusCode: res.statusCode, content });
          };
          res.on('end', _resolve);
          res.on('close', _resolve);
        }
      );
      req.on('error', () => resolve({ ok: false, statusCode: 0, content: '' }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, statusCode: 0, content: '' }); });
      req.end();
    } catch { resolve({ ok: false, statusCode: 0, content: '' }); }
  });
}

// Error recovery — resume from the last completed step
async function _recover(domain) {
  // VPS-only pipeline: retry from nameserver check if zone isn't active yet,
  // otherwise re-run the VPS configure step (idempotent).
  if (!domain.cf_zone_id) return _checkNameservers(domain);
  return _configureVps(domain);
}

async function _handleError(domain, err, action) {
  await dbUpdate(domain.id, {
    error_count:     (domain.error_count || 0) + 1,
    error_message:   err.message,
    last_checked_at: new Date().toISOString(),
  });
  await audit(domain.id, domain.domain, action, {}, err.message);
}

module.exports = { addDomain, deleteDomain, checkDomain, checkUptime, sendTgAlert, STATUS };
