/**
 * Cloudflare DNS Provider
 * Implements the DNSProvider interface:
 *   createZone(domain)          → { zoneId, nameservers }
 *   getZoneStatus(zoneId)       → status string
 *   createDNSRecord(zoneId, r)  → { recordId }
 *   deleteDNSRecord(zoneId, id)
 *   deleteZone(zoneId)
 *   getZoneCount()              → { count, limit }
 *
 * Set DOMAIN_DRY_RUN=true to simulate all calls without hitting the API.
 */

const https = require('https');

function isDryRun() { return process.env.DOMAIN_DRY_RUN === 'true'; }

function cfRaw(method, path, body = null) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return Promise.reject(new Error('CLOUDFLARE_API_TOKEN not set'));

  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const email = process.env.CLOUDFLARE_API_EMAIL;
    // Support both scoped API token (Bearer) and Global API Key (X-Auth-Key + X-Auth-Email)
    const headers = email
      ? { 'X-Auth-Key': token, 'X-Auth-Email': email, 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(
      { hostname: 'api.cloudflare.com', path: `/client/v4${path}`, method, headers },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (!parsed.success) {
              const msg = (parsed.errors || []).map(e => e.message).join('; ') || 'Cloudflare API error';
              reject(new Error(msg));
            } else {
              resolve(parsed); // full object: { result, result_info, ... }
            }
          } catch {
            reject(new Error('Invalid Cloudflare API response'));
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function cf(method, path, body = null) {
  const resp = await cfRaw(method, path, body);
  return resp.result;
}

// Simple exponential-backoff retry for transient failures
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

const CloudflareProvider = {
  isConfigured() {
    return !!process.env.CLOUDFLARE_API_TOKEN;
  },

  async createZone(domain) {
    if (isDryRun()) {
      return { zoneId: `dry-zone-${domain.replace(/\./g, '-')}`, nameservers: ['ns1.dry-run.cf', 'ns2.dry-run.cf'] };
    }
    return withRetry(async () => {
      try {
        const result = await cf('POST', '/zones', { name: domain, jump_start: false });
        return { zoneId: result.id, nameservers: result.name_servers || [] };
      } catch (err) {
        // Idempotent: if the zone already exists in this CF account, adopt it
        // instead of erroring. Happens when a prior deleteDomain() removed the
        // local row but CF zone cleanup failed (e.g. token missing Zone:Delete).
        if (!/already exists|zone is already/i.test(err.message)) throw err;
        const list = await cf('GET', `/zones?name=${encodeURIComponent(domain)}`);
        const existing = Array.isArray(list) && list.length ? list[0] : null;
        if (!existing) throw err;
        return { zoneId: existing.id, nameservers: existing.name_servers || [] };
      }
    });
  },

  async getZoneStatus(zoneId) {
    if (isDryRun()) return 'active';
    return withRetry(async () => {
      const result = await cf('GET', `/zones/${zoneId}`);
      return result.status; // 'pending' | 'active' | 'moved' | 'deleted'
    });
  },

  // record: { type, name, content, ttl?, proxied? }
  // Upsert: if a conflicting A/AAAA/CNAME record exists with the same name, delete it first.
  async createDNSRecord(zoneId, record) {
    if (isDryRun()) return { recordId: `dry-rec-${Date.now()}` };
    return withRetry(async () => {
      const payload = {
        type:    record.type,
        name:    record.name || '@',
        content: record.content,
        ttl:     record.ttl || 1,
        proxied: record.proxied !== undefined ? record.proxied : false,
      };
      try {
        const result = await cf('POST', `/zones/${zoneId}/dns_records`, payload);
        return { recordId: result.id };
      } catch (err) {
        if (!/already exists/i.test(err.message)) throw err;
        // Remove any conflicting A/AAAA/CNAME with the same name then retry
        const existing = await cf('GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(payload.name)}&per_page=100`);
        for (const rec of (Array.isArray(existing) ? existing : [])) {
          if (['A', 'AAAA', 'CNAME'].includes(rec.type)) {
            await cf('DELETE', `/zones/${zoneId}/dns_records/${rec.id}`);
          }
        }
        const result = await cf('POST', `/zones/${zoneId}/dns_records`, payload);
        return { recordId: result.id };
      }
    });
  },

  async deleteDNSRecord(zoneId, recordId) {
    if (isDryRun() || !recordId || recordId.startsWith('dry-')) return;
    return withRetry(() => cf('DELETE', `/zones/${zoneId}/dns_records/${recordId}`));
  },

  async deleteZone(zoneId) {
    if (isDryRun() || !zoneId || zoneId.startsWith('dry-')) return { alreadyGone: false };
    return withRetry(async () => {
      try {
        await cf('DELETE', `/zones/${zoneId}`);
        return { alreadyGone: false };
      } catch (err) {
        if (/invalid zone identifier|could not route to/i.test(err.message)) {
          return { alreadyGone: true };
        }
        throw err;
      }
    });
  },

  async setSslMode(zoneId, mode = 'full') {
    if (isDryRun()) return;
    return withRetry(() => cf('PATCH', `/zones/${zoneId}/settings/ssl`, { value: mode }));
  },

  /**
   * Turn on Cloudflare's edge bot protections for a zone.
   * Each setting is applied independently — a plan/permission gap on one
   * doesn't prevent the others from applying. Returns a summary of what worked.
   */
  async enableBotProtection(zoneId) {
    if (isDryRun()) return { fight_mode: true, security_level: true, browser_check: true, always_use_https: true };

    const results = { fight_mode: false, security_level: false, browser_check: false, always_use_https: false, errors: [] };

    // 1. Bot Fight Mode (free tier BFM — blocks known bad bots at the edge)
    try {
      await cf('PUT', `/zones/${zoneId}/bot_management`, { fight_mode: true });
      results.fight_mode = true;
    } catch (err) { results.errors.push(`bot_fight_mode: ${err.message}`); }

    // 2. Security level → under_attack (forces 5-second JS challenge on ALL visitors).
    //    New domains are most vulnerable to scanner flagging in the first 48 h
    //    (CT-log monitors find them within minutes of cert issuance). Under Attack
    //    blocks everything at the CF edge. The domain monitor steps it down to
    //    "high" after 48 h — the WAF rules created by createAntiScannerRules()
    //    provide permanent scanner-blocking from that point on.
    try {
      await cf('PATCH', `/zones/${zoneId}/settings/security_level`, { value: 'under_attack' });
      results.security_level = true;
    } catch (err) { results.errors.push(`security_level: ${err.message}`); }

    // 3. Browser Integrity Check (JS challenge on suspicious UA/behaviour)
    try {
      await cf('PATCH', `/zones/${zoneId}/settings/browser_check`, { value: 'on' });
      results.browser_check = true;
    } catch (err) { results.errors.push(`browser_check: ${err.message}`); }

    // 4. Always Use HTTPS
    try {
      await cf('PATCH', `/zones/${zoneId}/settings/always_use_https`, { value: 'on' });
      results.always_use_https = true;
    } catch (err) { results.errors.push(`always_use_https: ${err.message}`); }

    return results;
  },

  /**
   * Create WAF custom rules that permanently block scanner traffic at the edge.
   * Uses 2 of the free plan's 5 custom-rule slots. Idempotent — PUT replaces
   * the ruleset so calling again with the same rules is a no-op.
   */
  async createAntiScannerRules(zoneId) {
    if (isDryRun()) return { ok: true };

    const scannerExpr = [
      '(http.user_agent eq "")',
      '(len(http.user_agent) lt 20)',
      '(lower(http.user_agent) contains "virustotal")',
      '(lower(http.user_agent) contains "phishtank")',
      '(lower(http.user_agent) contains "safebrowsing")',
      '(lower(http.user_agent) contains "urlscan")',
      '(lower(http.user_agent) contains "checkphish")',
      '(lower(http.user_agent) contains "netcraft")',
      '(lower(http.user_agent) contains "shodan")',
      '(lower(http.user_agent) contains "censys")',
      '(lower(http.user_agent) contains "curl/")',
      '(lower(http.user_agent) contains "wget")',
      '(lower(http.user_agent) contains "python-requests")',
      '(lower(http.user_agent) contains "python/")',
      '(lower(http.user_agent) contains "headlesschrome")',
      '(lower(http.user_agent) contains "phantomjs")',
      '(lower(http.user_agent) contains "puppeteer")',
      '(lower(http.user_agent) contains "playwright")',
      '(lower(http.user_agent) contains "selenium")',
      '(lower(http.user_agent) contains "googlebot")',
      '(lower(http.user_agent) contains "bingbot")',
      '(lower(http.user_agent) contains "facebookexternalhit")',
      '(lower(http.user_agent) contains "twitterbot")',
      '(lower(http.user_agent) contains "linkedinbot")',
      '(lower(http.user_agent) contains "discordbot")',
      '(lower(http.user_agent) contains "whatsapp")',
      '(lower(http.user_agent) contains "slackbot")',
      '(lower(http.user_agent) contains "telegrambot")',
      '(lower(http.user_agent) contains "crawl")',
      '(lower(http.user_agent) contains "spider")',
      '(lower(http.user_agent) contains "scraper")',
      '(lower(http.user_agent) contains "ahrefs")',
      '(lower(http.user_agent) contains "semrush")',
      '(lower(http.user_agent) contains "node-fetch")',
      '(lower(http.user_agent) contains "axios/")',
      '(lower(http.user_agent) contains "go-http-client")',
      '(lower(http.user_agent) contains "okhttp")',
      '(lower(http.user_agent) contains "libwww-perl")',
      '(lower(http.user_agent) contains "postmanruntime")',
      '(lower(http.user_agent) contains "nmap")',
      '(lower(http.user_agent) contains "nikto")',
      '(lower(http.user_agent) contains "nuclei")',
      '(lower(http.user_agent) contains "zgrab")',
      '(lower(http.user_agent) contains "masscan")',
      '(lower(http.user_agent) contains "openphish")',
      '(lower(http.user_agent) contains "phishstats")',
    ].join(' or ');

    try {
      await cf('PUT', `/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`, {
        rules: [
          {
            expression: scannerExpr,
            action: 'block',
            description: 'ALP: Block scanners, bots, and security crawlers',
            enabled: true,
          },
          {
            expression: '(cf.threat_score gt 0)',
            action: 'managed_challenge',
            description: 'ALP: Challenge visitors with elevated threat score',
            enabled: true,
          },
        ],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Step down security level from under_attack to high.
   * Called by the domain monitor 48 h after domain creation.
   */
  async stepDownSecurity(zoneId) {
    if (isDryRun()) return;
    return withRetry(() => cf('PATCH', `/zones/${zoneId}/settings/security_level`, { value: 'high' }));
  },

  async getZoneCount() {
    if (isDryRun()) return { count: 3, limit: 50 };
    return withRetry(async () => {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const qs = accountId ? `?account.id=${encodeURIComponent(accountId)}&per_page=1` : '?per_page=1';
      const resp = await cfRaw('GET', `/zones${qs}`);
      return {
        count: resp.result_info?.total_count ?? null,
        limit: null, // plan limit not available via this endpoint
      };
    });
  },
};

module.exports = CloudflareProvider;
