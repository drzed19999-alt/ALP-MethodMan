/**
 * Domain Pipeline — State Machine
 *
 * States: pending_nameservers → nameservers_active → railway_linked → ssl_issued → live
 * Error state can occur at any step; retry logic resumes from the right stage.
 *
 * Business logic only talks through provider interfaces (CloudflareProvider /
 * RailwayProvider). No Cloudflare or Railway SDK is imported here directly.
 */

const https = require('https');
const { getAdapter } = require('../database/adapter');
const CF  = require('./providers/cloudflare');
const RW  = require('./providers/railway');
const VPS = require('./vpsDomain');

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
function checkSafeBrowsing(domain) {
  const key = process.env.GOOGLE_SAFEBROWSING_KEY;
  if (!key) return Promise.resolve(null);

  return new Promise((resolve) => {
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
              const threat = parsed.matches[0].threatType || 'UNKNOWN';
              resolve(`Google Safe Browsing: ${threat}`);
            } else {
              resolve(null);
            }
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    } catch { resolve(null); }
  });
}

const STATUS = {
  PENDING_NS:     'pending_nameservers',
  NS_ACTIVE:      'nameservers_active',
  RAILWAY_LINKED: 'railway_linked',
  VPS_CONFIGURED: 'vps_configured',    // VPS branch: nginx site written + cert (if zone active)
  SSL_ISSUED:     'ssl_issued',
  LIVE:           'live',
  ERROR:          'error',
};

function isValidDomain(d) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(d);
}

function tryParse(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
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

  // ── Provider selection ──────────────────────────────────────────────────
  // Explicit opts.hosting_provider wins. If unset, auto-detect from linked website:
  // if the website has a VPS configured, default to 'vps'; else 'railway'.
  let provider = opts.hosting_provider;
  if (!provider) {
    if (opts.website_id) {
      const w = await db.get(`SELECT vps_host FROM websites WHERE id = ?`, [opts.website_id]);
      provider = (w && w.vps_host) ? 'vps' : 'railway';
    } else {
      provider = 'railway';
    }
  }

  // VPS mode requires a linked website with vps_host configured
  if (provider === 'vps') {
    if (!opts.website_id) throw new Error('VPS hosting requires a linked website (website_id)');
    const w = await db.get(`SELECT id, name, vps_host, vps_ssh_pass, vps_ssh_key FROM websites WHERE id = ?`, [opts.website_id]);
    if (!w)              throw new Error(`Website #${opts.website_id} not found`);
    if (!w.vps_host)     throw new Error(`Website "${w.name}" has no VPS configured — run the Host wizard first`);
    if (!w.vps_ssh_pass && !w.vps_ssh_key) throw new Error(`Website "${w.name}" has no SSH credentials`);
  }

  const { zoneId, nameservers } = await CF.createZone(domain);

  // SSL mode: Railway uses Full (CF→Railway HTTPS); VPS uses Full (Strict) once cert is on origin.
  // For VPS we set the mode explicitly in the VPS_CONFIGURED step (strict if cert, flexible if pending).
  try { await CF.setSslMode(zoneId, provider === 'vps' ? 'flexible' : 'full'); } catch { /* non-fatal */ }

  const result = await db.run(
    `INSERT INTO domains
       (domain, dns_provider, hosting_provider, cf_zone_id, nameservers, status,
        railway_service_id, railway_environment_id, website_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      domain,
      opts.dns_provider     || 'cloudflare',
      provider,
      zoneId,
      JSON.stringify(nameservers),
      STATUS.PENDING_NS,
      provider === 'railway' ? (process.env.RAILWAY_SERVICE_ID     || null) : null,
      provider === 'railway' ? (process.env.RAILWAY_ENVIRONMENT_ID || null) : null,
      opts.website_id                       || null,
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

  // ── Railway cleanup (skip for VPS-provider domains) ──────────────────────
  if (domain.hosting_provider !== 'vps' && domain.railway_domain_id) {
    try {
      const { alreadyGone } = await RW.detachDomain(domain.railway_domain_id) || {};
      if (alreadyGone) {
        notices.push('Railway domain was already removed externally');
      } else {
        await audit(domainId, domain.domain, 'railway_unlinked');
      }
    } catch (err) {
      errors.push(`Railway cleanup: ${err.message}`);
    }
  }

  // ── Cloudflare zone cleanup ──────────────────────────────────────────────
  if (domain.cf_zone_id) {
    try {
      const { alreadyGone } = await CF.deleteZone(domain.cf_zone_id) || {};
      if (alreadyGone) {
        notices.push('Cloudflare zone was already removed externally');
      } else {
        await audit(domainId, domain.domain, 'zone_deleted');
      }
    } catch (err) {
      errors.push(`Cloudflare cleanup: ${err.message}`);
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

  if (errors.length) throw new Error(errors.join('; '));
  return { notices };
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
  const isVps = domain.hosting_provider === 'vps';

  switch (domain.status) {
    case STATUS.PENDING_NS:
      return _checkNameservers(domain);

    case STATUS.NS_ACTIVE:
      return isVps ? _configureVps(domain) : _linkRailway(domain);

    case STATUS.RAILWAY_LINKED:
      return _checkSsl(domain);

    case STATUS.VPS_CONFIGURED:
      return _checkVpsLive(domain);

    case STATUS.SSL_ISSUED:
    case STATUS.LIVE:
      return _checkUptime(domain);

    case STATUS.ERROR:
      return _recover(domain);
  }
}

// Auto-activate the linked website on transition to LIVE. Extracted so both
// the VPS pipeline (_configureVps) and the Railway pipeline (_checkUptime)
// can call it without duplicating the SQL.
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
      if (fresh.hosting_provider === 'vps') {
        await _configureVps(fresh);
      } else {
        await _linkRailway(fresh);
      }
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

// Step 2 — attach domain to Railway, create DNS records in Cloudflare
//
// Key ordering: we pre-seed the CNAME in Cloudflare BEFORE calling Railway's
// customDomainCreate. Railway validates DNS immediately on creation — if the
// CNAME already points at them, they issue SSL within minutes. Without this,
// Railway's first check fails (DNS not yet created) and it retries on its own
// schedule (can be 24h+).
async function _linkRailway(domain) {
  if (!RW.isConfigured()) {
    await dbUpdate(domain.id, {
      status:        STATUS.ERROR,
      error_message: 'Railway not configured — set RAILWAY_TOKEN and RAILWAY_SERVICE_ID',
    });
    return;
  }

  try {
    // Pre-seed: get the CNAME target from an existing domain on the same Railway service
    // (all custom domains on a service share the same CNAME target). This lets Railway's
    // first DNS check succeed so SSL issues in minutes instead of hours.
    const preCname = await RW.getPreSeedCname();
    if (preCname) {
      try {
        await CF.createDNSRecord(domain.cf_zone_id, {
          type:    'CNAME',
          name:    domain.domain,
          content: preCname,
          proxied: false,
          ttl:     60,
        });
        await audit(domain.id, domain.domain, 'dns_pre_seeded', { target: preCname });
      } catch (preErr) {
        // Non-fatal — Railway will still work, just on its own slower retry schedule
        await audit(domain.id, domain.domain, 'dns_pre_seed_failed', {}, preErr.message);
      }
    }

    // Now create the Railway domain — DNS is already in place so first validation passes
    const { domainId: railwayDomainId, requiredDnsRecords } = await RW.attachDomain(domain.domain);
    await audit(domain.id, domain.domain, 'railway_linked', { railwayDomainId, requiredDnsRecords });

    // Reconcile: create/upsert any records Railway requires (handles the pre-seeded CNAME
    // via the upsert path in CF.createDNSRecord, and catches any extra records like TXT)
    const created = [];
    for (const rec of requiredDnsRecords) {
      try {
        const cfName = !rec.name || rec.name === '@' ? domain.domain : `${rec.name}.${domain.domain}`;
        const { recordId } = await CF.createDNSRecord(domain.cf_zone_id, {
          type:    rec.type,
          name:    cfName,
          content: rec.content,
          proxied: false,
          ttl:     60,
        });
        created.push({ ...rec, recordId });
        await audit(domain.id, domain.domain, 'dns_record_created', { type: rec.type, name: cfName, content: rec.content, recordId });
      } catch (err) {
        await audit(domain.id, domain.domain, 'dns_record_error', { rec }, err.message);
      }
    }

    await dbUpdate(domain.id, {
      status:            STATUS.RAILWAY_LINKED,
      railway_domain_id: railwayDomainId,
      dns_records:       JSON.stringify(created),
      error_count:       0,
      error_message:     null,
      last_checked_at:   new Date().toISOString(),
    });
  } catch (err) {
    await _handleError(domain, err, 'railway_link_error');
  }
}

// Step 3 — Two-phase SSL:
//   Phase 1: Wait for Railway to confirm ALL DNS valid (CNAME + TXT) — both are
//            required for Railway to activate routing. CNAME stays unproxied so
//            Railway can verify it. TXT records are healed on every pass.
//   Phase 2: Once allValid, flip CNAME to proxied (Cloudflare handles SSL).
//            Cloudflare Universal SSL activates in ~2-5 min vs Railway's 20+ min.
//            Railway routing persists because it was already configured in phase 1.
async function _checkSsl(domain) {
  try {
    const { notFound, records, syncStatus } = await RW.getVerificationStatus(domain.railway_domain_id);
    const now = new Date().toISOString();

    // Log every record Railway returns so we can see exactly what's happening
    await audit(domain.id, domain.domain, 'railway_dns_check', {
      syncStatus,
      recordCount: (records || []).length,
      records: (records || []).map(r => ({ type: r.type, name: r.name, status: r.status })),
    });

    if (notFound) {
      await dbUpdate(domain.id, {
        status:          STATUS.ERROR,
        error_message:   'Railway domain record not found — it may have been deleted outside this panel',
        last_checked_at: now,
      });
      return;
    }

    // Heal missing/unpropagated DNS records on every pass (keeps TXT fresh for Railway)
    if (records && records.length && domain.cf_zone_id) {
      for (const rec of records.filter(r => r.status !== 'DNS_RECORD_STATUS_PROPAGATED')) {
        try {
          const cfName = !rec.name || rec.name === '@' ? domain.domain : `${rec.name}.${domain.domain}`;
          await CF.createDNSRecord(domain.cf_zone_id, {
            type:    rec.type,
            name:    cfName,
            content: rec.content,
            proxied: false,
            ttl:     60,
          });
          await audit(domain.id, domain.domain, 'dns_record_healed', { type: rec.type, name: cfName, content: rec.content });
        } catch { /* non-fatal — retry next pass */ }
      }
    }

    // Require BOTH CNAME and TXT to be propagated — don't trust allValid or syncStatus.
    // Railway's API sometimes returns only CNAME in records, making every() pass on 1 record.
    const cnameRec = (records || []).find(r => r.type === 'CNAME');
    const txtRec   = (records || []).find(r => r.type === 'TXT');
    const cnameDone = cnameRec && cnameRec.status === 'DNS_RECORD_STATUS_PROPAGATED';
    const txtDone   = txtRec   && txtRec.status   === 'DNS_RECORD_STATUS_PROPAGATED';

    if (!cnameDone || !txtDone) {
      const waiting = [];
      if (!cnameDone) waiting.push('CNAME');
      if (!txtRec)    waiting.push('TXT (not in Railway response yet)');
      else if (!txtDone) waiting.push('TXT');
      await dbUpdate(domain.id, {
        last_checked_at: now,
        error_message:   `Waiting for DNS: ${waiting.join(', ')}`,
      });
      return;
    }

    // Phase 2: Railway has verified the domain — flip CNAME to proxied so
    // Cloudflare handles SSL. Railway routing stays active (already configured).
    const dnsRecs = tryParse(domain.dns_records, []);
    const storedCname = dnsRecs.find(r => r.type === 'CNAME');
    if (storedCname && domain.cf_zone_id) {
      try {
        const cfName = !storedCname.name || storedCname.name === '@' ? domain.domain : `${storedCname.name}.${domain.domain}`;
        await CF.createDNSRecord(domain.cf_zone_id, {
          type:    'CNAME',
          name:    cfName,
          content: storedCname.content,
          proxied: true,
          ttl:     1,
        });
        await audit(domain.id, domain.domain, 'cname_proxied');
      } catch { /* non-fatal */ }
    }

    // Probe HTTPS — Cloudflare SSL activates in ~2-5 min after proxy flip
    const certValid = await _httpsCertCheck(domain.domain);
    if (!certValid) {
      await dbUpdate(domain.id, {
        last_checked_at: now,
        error_message:   'DNS verified — waiting for Cloudflare SSL (~2–5 min)',
      });
      return;
    }

    await dbUpdate(domain.id, {
      status:          STATUS.SSL_ISSUED,
      ssl_status:      'active',
      error_count:     0,
      error_message:   null,
      last_checked_at: now,
    });
    await audit(domain.id, domain.domain, 'ssl_issued');
    await _checkUptime(await dbGet(domain.id));

  } catch (err) {
    await _handleError(domain, err, 'ssl_check_error');
  }
}

// HTTPS cert check with full validation — only resolves true when the cert is
// valid for the domain (what a real browser would accept).
function _httpsCertCheck(hostname) {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        { hostname, path: '/', method: 'GET', timeout: 10000, rejectUnauthorized: true },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve(true));
          res.on('close', () => resolve(true));
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch { resolve(false); }
  });
}

// Step 4 — real HTTP reachability check + flag detection
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
            // Railway's unprovisioned 404 page is not a real site — treat as down
            if (ok && res.statusCode === 404 && /not arrived at the station|railway/i.test(content)) ok = false;
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
  if (!domain.railway_domain_id) {
    return _checkNameservers(domain);
  }
  return _checkSsl(domain);
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
