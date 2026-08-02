/**
 * Domain Management API — /api/domains
 *
 * GET    /                 list all managed domains
 * POST   /                 add & start provisioning a new domain
 * POST   /import           bulk add (JSON array of domain strings)
 * GET    /quota            Cloudflare zone quota for this account
 * GET    /:id              domain detail
 * DELETE /:id              delete + cleanup (CF zone + Railway domain)
 * POST   /:id/recheck      force a pipeline recheck now
 * POST   /:id/override     admin manually marks a step as completed
 * GET    /:id/audit        per-domain audit log
 *
 * POST /api/webhooks/cloudflare  (stub — future: CF zone activation webhook)
 * POST /api/webhooks/railway     (stub — future: Railway domain webhook)
 */

const router = require('express').Router();
const { getAdapter }                          = require('../database/adapter');
const { authenticateToken, requireRole }      = require('../middleware/auth');
const { addDomain, deleteDomain, checkDomain, checkUptime, STATUS } = require('../services/domainPipeline');
const CF                                      = require('../services/providers/cloudflare');

router.use(authenticateToken);
router.use(requireRole('admin', 'super_admin'));

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
    const domains = await db.all('SELECT * FROM domains ORDER BY created_at DESC');
    res.json({ domains: domains.map(shape) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add single domain ─────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { domain } = req.body || {};
  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'domain is required' });
  }

  try {
    const websiteId = req.body.website_id ? Number(req.body.website_id) : null;
    const result = await addDomain(domain, { website_id: websiteId });
    res.status(result.resumed ? 200 : 201).json({
      ok:      true,
      domain:  shape(result.domain),
      resumed: result.resumed,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Bulk import ───────────────────────────────────────────────────────────────

router.post('/import', async (req, res) => {
  const { domains } = req.body || {};
  if (!Array.isArray(domains) || !domains.length) {
    return res.status(400).json({ error: 'domains array is required' });
  }

  const results = [];
  for (const raw of domains.slice(0, 50)) {
    const dom = (raw || '').toString().toLowerCase().trim();
    try {
      const r = await addDomain(dom);
      results.push({ domain: dom, ok: true, resumed: r.resumed, id: r.domain.id });
    } catch (err) {
      results.push({ domain: dom, ok: false, error: err.message });
    }
  }

  const ok  = results.filter(r => r.ok).length;
  const bad = results.length - ok;
  res.json({ results, summary: { ok, failed: bad } });
});

// ─── Railway debug ─────────────────────────────────────────────────────────────

router.get('/railway-debug', async (req, res) => {
  const https  = require('https');
  const token  = process.env.RAILWAY_TOKEN;
  const svcId  = process.env.RAILWAY_SERVICE_ID;
  const envId  = process.env.RAILWAY_ENVIRONMENT_ID || '(not set)';
  const result = { token_set: !!token, svc_id: svcId, env_id_env: envId };
  if (!token || !svcId) return res.json({ ...result, error: 'RAILWAY_TOKEN or RAILWAY_SERVICE_ID not set' });

  function gqlRaw(query, variables = {}) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ query, variables });
      const r2 = https.request({
        hostname: 'backboard.railway.app', path: '/graphql/v2', method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'railway-cli/3.0.0' },
      }, (r) => {
        let raw = '';
        r.on('data', c => raw += c);
        r.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); } });
      });
      r2.on('error', reject);
      r2.write(body);
      r2.end();
    });
  }

  try {
    const svcResp = await gqlRaw(`
      query($id: String!) {
        service(id: $id) {
          id name projectId
          serviceInstances { edges { node { environmentId domains { customDomains { id domain } } } } }
        }
      }
    `, { id: svcId });

    result.step1_service_query = svcResp;
    const projectId = svcResp?.data?.service?.projectId || null;
    const edges = svcResp?.data?.service?.serviceInstances?.edges || [];
    const envIds = edges.map(e => e.node.environmentId);
    result.resolved_env_used = envIds[0] || null;
    result.project_id = projectId;
    if (!envIds.length) return res.json({ ...result, error: 'No service instances found' });

    const testDomain = req.query.domain || 'cumberlandsecurity.online';
    // Introspect what fields CustomDomainCreateInput actually accepts
    const schemaResp = await gqlRaw(`
      query {
        __type(name: "CustomDomainCreateInput") {
          name
          inputFields {
            name
            type { name kind ofType { name kind } }
          }
        }
      }
    `);
    result.step2_schema = schemaResp?.data?.__type?.inputFields || schemaResp;

    const mutResp = await gqlRaw(`
      mutation($input: CustomDomainCreateInput!) {
        customDomainCreate(input: $input) { id domain syncStatus }
      }
    `, { input: { domain: testDomain, serviceId: svcId, environmentId: envIds[0], projectId } });

    result.step3_mutation_test = { domain: testDomain, response: mutResp };
  } catch (err) {
    result.exception = err.message;
  }

  res.json(result);
});

// ─── Check all domains ─────────────────────────────────────────────────────────

router.post('/check-all', async (req, res) => {
  try {
    const db      = getAdapter();
    const domains = await db.all(
      `SELECT id, status FROM domains WHERE is_processing = 0 ORDER BY last_checked_at ASC NULLS FIRST`
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

// ─── Cloudflare quota ──────────────────────────────────────────────────────────

router.get('/quota', async (req, res) => {
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

router.get('/:id', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
  try {
    const { notices } = await deleteDomain(req.params.id);
    res.json({ ok: true, notices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Force recheck ─────────────────────────────────────────────────────────────

router.post('/:id/recheck', async (req, res) => {
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
    res.json({ ok: true, message: 'Check started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update linked scam page ──────────────────────────────────────────────────

router.put('/:id/website', async (req, res) => {
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

    await db.run(
      'UPDATE domains SET website_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [websiteId, req.params.id]
    );
    // If domain is already live and a page is being linked, activate it now
    if (websiteId && domain.status === 'live') {
      await db.run(
        'UPDATE websites SET is_active = 1, domain = ?, domain_active = 1 WHERE id = ?',
        [domain.domain, websiteId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Set Railway domain ID manually ───────────────────────────────────────────

router.post('/:id/set-railway-id', async (req, res) => {
  const { railwayDomainId } = req.body || {};
  if (!railwayDomainId || typeof railwayDomainId !== 'string') {
    return res.status(400).json({ error: 'railwayDomainId is required' });
  }
  try {
    const db     = getAdapter();
    const domain = await db.get('SELECT * FROM domains WHERE id = ?', [req.params.id]);
    if (!domain) return res.status(404).json({ error: 'Domain not found' });

    await db.run(
      `UPDATE domains SET railway_domain_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [railwayDomainId.trim(), req.params.id]
    );
    await db.run(
      `INSERT INTO domain_audit_logs (domain_id, domain_name, action, details)
       VALUES (?, ?, 'railway_id_set_manually', ?)`,
      [req.params.id, domain.domain, JSON.stringify({ railwayDomainId })]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Manual override ───────────────────────────────────────────────────────────

router.post('/:id/override', async (req, res) => {
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

router.get('/:id/audit', async (req, res) => {
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
