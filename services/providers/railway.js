/**
 * Railway Hosting Provider
 * Implements the HostingProvider interface:
 *   attachDomain(domain)                  → { domainId, requiredDnsRecords }
 *   getVerificationStatus(railwayDomainId) → { allValid, dnsValid, records }
 *   detachDomain(railwayDomainId)
 *   listDomains()                         → raw Railway domain array
 *
 * Uses Railway GraphQL v2 API (updated for new schema — 2025).
 * Old: dnsRecords { required { type hostlabel value } status }
 * New: dnsRecords { recordType hostlabel requiredValue currentValue status zone }
 *      status values: DNS_RECORD_STATUS_PROPAGATED | DNS_RECORD_STATUS_REQUIRES_UPDATE | …
 */

const https = require('https');

function isDryRun() { return process.env.DOMAIN_DRY_RUN === 'true'; }

function cfg() {
  return {
    token:  process.env.RAILWAY_TOKEN,
    svcId:  process.env.RAILWAY_SERVICE_ID,
    envId:  process.env.RAILWAY_ENVIRONMENT_ID || 'production',
  };
}

function gql(token, query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request(
      {
        hostname: 'backboard.railway.app',
        path:     '/graphql/v2',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          Authorization:    `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':     'railway-cli/3.0.0',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.errors && parsed.errors.length) {
              reject(new Error(parsed.errors.map(e => e.message).join('; ')));
            } else {
              resolve(parsed.data);
            }
          } catch {
            reject(new Error('Invalid Railway API response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

// Strip Railway enum prefix: DNS_RECORD_TYPE_CNAME → CNAME
function cfType(railwayType) {
  return (railwayType || '').replace('DNS_RECORD_TYPE_', '') || 'CNAME';
}

// Map flat Railway dnsRecord to our { type, name, content, fqdn, status }
function mapRecord(r) {
  return {
    type:    cfType(r.recordType),
    name:    r.hostlabel || '@',   // '' or '@' = root domain
    content: r.requiredValue || '',
    zone:    r.zone    || '',
    fqdn:    r.fqdn    || '',
    current: r.currentValue || '',
    status:  r.status  || '',
  };
}

function isRecordPropagated(r) {
  return r.status === 'DNS_RECORD_STATUS_PROPAGATED';
}

// New schema DNS records query fragment
const DNS_RECORDS_FIELDS = `
  recordType hostlabel requiredValue currentValue status fqdn zone
`;

const STATUS_QUERY = `
  query($id: String!) {
    service(id: $id) {
      projectId
      serviceInstances {
        edges {
          node {
            environmentId
            domains {
              serviceDomains { domain }
              customDomains {
                id domain syncStatus
                status {
                  dnsRecords { ${DNS_RECORDS_FIELDS} }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function pickEnvNode(edges, envId) {
  return edges.find(e => e.node.environmentId === envId)?.node || edges[0]?.node;
}

const RailwayProvider = {
  isConfigured() {
    const { token, svcId } = cfg();
    return !!(token && svcId);
  },

  async attachDomain(domain) {
    if (isDryRun()) {
      return {
        domainId: `dry-rd-${Date.now()}`,
        requiredDnsRecords: [
          { type: 'CNAME', name: '@', content: 'dry-run.up.railway.app', fqdn: domain, status: 'DNS_RECORD_STATUS_REQUIRES_UPDATE' },
        ],
      };
    }
    const { token, svcId, envId } = cfg();
    return withRetry(async () => {
      // Resolve actual environment UUID — RAILWAY_ENVIRONMENT_ID may be "production" (name, not UUID)
      const svcData  = await gql(token, STATUS_QUERY, { id: svcId });
      const projectId = svcData?.service?.projectId;
      const edges    = svcData?.service?.serviceInstances?.edges || [];
      const envNode  = pickEnvNode(edges, envId);
      const resolvedEnvId = envNode?.environmentId;
      if (!resolvedEnvId) throw new Error('Could not resolve Railway environment — check RAILWAY_SERVICE_ID');
      if (!projectId) throw new Error('Could not resolve Railway projectId — check RAILWAY_SERVICE_ID');

      // If the domain already exists in Railway, reuse its ID instead of creating a duplicate
      const existing = (envNode?.domains?.customDomains || []).find(d => d.domain === domain);
      if (existing) {
        return {
          domainId:           existing.id,
          requiredDnsRecords: (existing.status?.dnsRecords || []).map(mapRecord),
        };
      }

      const data = await gql(token, `
        mutation($input: CustomDomainCreateInput!) {
          customDomainCreate(input: $input) {
            id domain syncStatus
          }
        }
      `, { input: { domain, serviceId: svcId, environmentId: resolvedEnvId, projectId } });

      const domainId = data.customDomainCreate.id;

      // Fetch DNS records — try direct query first (returns TXT), fall back to service-level
      let dnsRecords = [];
      try {
        const directData = await gql(token, `
          query($id: String!) {
            customDomain(id: $id) {
              id domain syncStatus
              status {
                dnsRecords { ${DNS_RECORDS_FIELDS} }
              }
            }
          }
        `, { id: domainId });
        dnsRecords = directData?.customDomain?.status?.dnsRecords || [];
      } catch {
        const svcData2 = await gql(token, STATUS_QUERY, { id: svcId });
        const edges2   = svcData2?.service?.serviceInstances?.edges || [];
        const envNode2 = pickEnvNode(edges2, resolvedEnvId);
        const created  = (envNode2?.domains?.customDomains || []).find(d => d.id === domainId);
        dnsRecords = created?.status?.dnsRecords || [];
      }

      return {
        domainId,
        requiredDnsRecords: dnsRecords.map(mapRecord),
      };
    });
  },

  async getVerificationStatus(railwayDomainId) {
    if (isDryRun()) {
      return { allValid: true, dnsValid: true, notFound: false, records: [] };
    }
    const { token, svcId, envId } = cfg();
    return withRetry(async () => {
      // Try direct domain query first — returns ALL records including TXT
      let found = null;
      let dnsRecords = [];
      try {
        const directData = await gql(token, `
          query($id: String!) {
            customDomain(id: $id) {
              id domain syncStatus
              status {
                dnsRecords { ${DNS_RECORDS_FIELDS} }
              }
            }
          }
        `, { id: railwayDomainId });
        found = directData?.customDomain;
        dnsRecords = found?.status?.dnsRecords || [];
      } catch {
        // Direct query not supported — fall back to service-level query
      }

      // Fallback: service-level query (may only return CNAME)
      if (!found) {
        const data    = await gql(token, STATUS_QUERY, { id: svcId });
        const edges   = data?.service?.serviceInstances?.edges || [];
        const envNode = pickEnvNode(edges, envId);
        const domains = envNode?.domains?.customDomains || [];
        found = domains.find(d => d.id === railwayDomainId);
        dnsRecords = found?.status?.dnsRecords || [];
      }

      if (!found) return { allValid: false, notFound: true, records: [] };

      const allValid = dnsRecords.length > 0 && dnsRecords.every(isRecordPropagated);

      return {
        allValid,
        dnsValid:  allValid,
        notFound:  false,
        syncStatus: found.syncStatus,
        records:   dnsRecords.map(mapRecord),
      };
    });
  },

  async detachDomain(railwayDomainId) {
    if (isDryRun() || !railwayDomainId || railwayDomainId.startsWith('dry-')) return { alreadyGone: false };
    const { token } = cfg();
    return withRetry(async () => {
      try {
        await gql(token, `mutation($id: String!) { customDomainDelete(id: $id) }`, { id: railwayDomainId });
        return { alreadyGone: false };
      } catch (err) {
        if (/not found|does not exist|problem processing/i.test(err.message)) {
          return { alreadyGone: true };
        }
        throw err;
      }
    });
  },

  async listDomains() {
    const { token, svcId, envId } = cfg();
    const data    = await gql(token, STATUS_QUERY, { id: svcId });
    const edges   = data?.service?.serviceInstances?.edges || [];
    const envNode = pickEnvNode(edges, envId);
    return envNode?.domains?.customDomains || [];
  },

  // Returns the CNAME target for this service (used to pre-seed DNS before domain creation
  // so Railway's first validation check succeeds and SSL issues in minutes, not hours).
  // Prefers the target from an existing custom domain (most accurate); falls back to
  // the service's own Railway domain.
  async getPreSeedCname() {
    if (isDryRun()) return 'dry-run.up.railway.app';
    const { token, svcId, envId } = cfg();
    try {
      const data    = await gql(token, STATUS_QUERY, { id: svcId });
      const edges   = data?.service?.serviceInstances?.edges || [];
      const envNode = pickEnvNode(edges, envId);

      // Prefer CNAME target from an existing validated custom domain on the same service
      for (const cd of (envNode?.domains?.customDomains || [])) {
        const cname = (cd.status?.dnsRecords || []).find(r =>
          r.recordType === 'DNS_RECORD_TYPE_CNAME' && (!r.hostlabel || r.hostlabel === '@')
        );
        if (cname?.requiredValue) return cname.requiredValue;
      }

      // Fall back to the service's own Railway-assigned domain
      const svcDomain = envNode?.domains?.serviceDomains?.[0]?.domain;
      if (svcDomain) return svcDomain;

      return null;
    } catch {
      return null;
    }
  },
};

module.exports = RailwayProvider;
