/**
 * VPS / Self-Hosted Provider
 *
 * Implements a domain-attachment interface used by the domain pipeline. This
 * used to have a Railway sibling; the panel is VPS-only now.
 *
 * For domains, VPS uses an A record (the server IP) instead of a CNAME.
 * Actual DNS zone management / virtual-host creation depends on which control
 * panel is configured (cPanel, Plesk, DirectAdmin, or manual). The stubs
 * below mark where panel-specific API calls will go.
 */

const { getAdapter } = require('../../database/adapter');

// ─── Config ──────────────────────────────────────────────────────────────────

async function getVpsCfg() {
  const db   = getAdapter();
  const rows = await db.all(
    `SELECT key, value FROM settings WHERE key LIKE 'vps_%' OR key = 'hosting_provider'`
  );
  const cfg = {};
  for (const r of rows) cfg[r.key] = r.value;
  return {
    host:       cfg.vps_host       || process.env.VPS_HOST       || '',
    sshPort:    cfg.vps_ssh_port   || process.env.VPS_SSH_PORT   || '22',
    sshUser:    cfg.vps_ssh_user   || process.env.VPS_SSH_USER   || 'root',
    panel:      cfg.vps_panel      || process.env.VPS_PANEL      || 'none',
    panelUrl:   cfg.vps_panel_url  || process.env.VPS_PANEL_URL  || '',
    panelUser:  cfg.vps_panel_user || process.env.VPS_PANEL_USER || '',
    panelPass:  cfg.vps_panel_pass || process.env.VPS_PANEL_PASS || '',
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const VpsProvider = {
  /** True when a host IP / hostname has been configured */
  async isConfigured() {
    const cfg = await getVpsCfg();
    return !!cfg.host;
  },

  /** The A record target (the server's public IP) for DNS seeding */
  async getPreSeedARecord() {
    const cfg = await getVpsCfg();
    return cfg.host || null;
  },

  /**
   * Attach a custom domain to the VPS.
   *
   * Returns the DNS record the user must add:
   *   { type: 'A', name: '@', value: '<server-ip>' }
   *
   * Panel-specific virtual-host creation is stubbed out below.
   */
  async attachDomain(domain) {
    const cfg = await getVpsCfg();
    if (!cfg.host) throw new Error('VPS host is not configured');

    // Panel-specific virtual-host setup
    switch (cfg.panel) {
      case 'cpanel':
        // TODO: cPanel UAPI → Domains::create
        // POST <panelUrl>/execute/Domains/create  { 'domain': domain }
        break;

      case 'plesk':
        // TODO: Plesk XML API → site.add
        break;

      case 'directadmin':
        // TODO: DirectAdmin CMD_DOMAIN → action=create&domain=<domain>
        break;

      case 'none':
      default:
        // Manual / Caddy / nginx — the admin adds the vhost manually.
        break;
    }

    return {
      id:     `vps:${domain}`,
      domain,
      status: 'pending_dns',
      dnsRecord: {
        type:  'A',
        name:  '@',
        value: cfg.host,
      },
    };
  },

  /**
   * Check whether DNS has propagated for a domain.
   * For now this just checks whether the A record resolves to the server IP.
   */
  async getVerificationStatus(domainId) {
    const domain = domainId.replace(/^vps:/, '');
    const cfg    = await getVpsCfg();

    return {
      id:     domainId,
      domain,
      status: 'pending',
      dnsRecord: {
        type:  'A',
        name:  '@',
        value: cfg.host || '',
      },
    };
  },

  /** Remove a domain from the VPS (panel-specific, stubbed) */
  async detachDomain(domainId) {
    const domain = domainId.replace(/^vps:/, '');
    const cfg    = await getVpsCfg();

    switch (cfg.panel) {
      case 'cpanel':
        // TODO: cPanel UAPI → Domains::delete
        break;
      case 'plesk':
        // TODO: Plesk XML API → site.del
        break;
      case 'directadmin':
        // TODO: DirectAdmin CMD_DOMAIN → action=delete
        break;
      default:
        break;
    }

    return { ok: true, domain };
  },

  /** List domains attached to this VPS (panel-specific, stubbed) */
  async listDomains() {
    return [];
  },
};

module.exports = VpsProvider;
