const router = require('express').Router();
const https  = require('https');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireRole('admin', 'super_admin'));

function cfg() {
  return {
    token:  process.env.RAILWAY_TOKEN,
    svcId:  process.env.RAILWAY_SERVICE_ID,
    envId:  process.env.RAILWAY_ENVIRONMENT_ID || 'production',
  };
}

function isConfigured() {
  const c = cfg();
  return !!(c.token && c.svcId);
}

function gql(query, variables = {}) {
  const { token } = cfg();
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'backboard.railway.app',
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.errors && parsed.errors.length) {
            return reject(new Error(parsed.errors.map(e => e.message).join('; ')));
          }
          resolve(parsed.data);
        } catch (e) {
          reject(new Error('Invalid Railway API response'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// GET /api/railway/status
router.get('/status', async (req, res) => {
  if (!isConfigured()) {
    return res.json({ configured: false, domains: [] });
  }

  const { svcId, envId } = cfg();

  try {
    const data = await gql(`
      query($id: String!) {
        service(id: $id) {
          serviceInstances {
            edges {
              node {
                environmentId
                domains {
                  customDomains {
                    id
                    domain
                    createdAt
                    syncStatus
                    status {
                      dnsRecords {
                        recordType
                        hostlabel
                        requiredValue
                        currentValue
                        status
                        fqdn
                        zone
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { id: svcId });

    const edges   = data?.service?.serviceInstances?.edges || [];
    const envNode = edges.find(e => e.node.environmentId === envId)?.node
                 || edges[0]?.node;
    const domains = envNode?.domains?.customDomains || [];

    res.json({ configured: true, domains });
  } catch (err) {
    res.status(500).json({ configured: true, error: err.message, domains: [] });
  }
});

// POST /api/railway/domains   body: { domain }
router.post('/domains', async (req, res) => {
  const { domain } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'domain is required' });

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Railway not configured. Add RAILWAY_TOKEN and RAILWAY_SERVICE_ID to environment variables.'
    });
  }

  const { svcId, envId } = cfg();

  try {
    const data = await gql(`
      mutation($input: CustomDomainCreateInput!) {
        customDomainCreate(input: $input) {
          id
          domain
          syncStatus
          status {
            dnsRecords {
              recordType
              hostlabel
              requiredValue
              currentValue
              status
              fqdn
              zone
            }
          }
        }
      }
    `, { input: { domain, serviceId: svcId, environmentId: envId } });

    res.json({ ok: true, domain: data.customDomainCreate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/railway/domains/:id
router.delete('/domains/:id', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Railway not configured' });
  }

  try {
    await gql(`
      mutation($id: String!) { customDomainDelete(id: $id) }
    `, { id: req.params.id });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
