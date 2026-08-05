/**
 * ALP - VPS Dashboard
 * Shows all configured VPS servers grouped by host, with websites and domains on each.
 */
const VpsPage = (() => {
  let _vpsList = [];
  let _domains = [];
  let _destroyed = false;

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function render() {
    return `
      <div style="max-width:1200px;margin:0 auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:22px;font-weight:800;color:var(--text-primary);margin:0;">VPS Dashboard</h1>
            <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0;">All configured VPS servers and their hosted websites</p>
          </div>
          <button id="vps-refresh-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        <!-- Stats row -->
        <div id="vps-stats-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px;"></div>

        <!-- VPS cards grid -->
        <div id="vps-cards-grid"></div>
      </div>
    `;
  }

  async function init() {
    _destroyed = false;
    document.getElementById('vps-refresh-btn')?.addEventListener('click', loadData);
    await loadData();
  }

  async function loadData() {
    try {
      const [vpsList, domainsResp] = await Promise.all([
        window.ALPApi._request('GET', '/api/website-deploy/vps-list'),
        window.ALPApi._request('GET', '/api/domains'),
      ]);
      if (_destroyed) return;
      _vpsList = Array.isArray(vpsList) ? vpsList : [];
      _domains = (domainsResp && domainsResp.domains) ? domainsResp.domains : [];
      renderStats();
      renderCards();
    } catch (err) {
      if (!_destroyed) window.showToast('Failed to load VPS data: ' + err.message, 'error');
    }
  }

  function renderStats() {
    const el = document.getElementById('vps-stats-row');
    if (!el) return;

    const hosts = new Set(_vpsList.map(v => v.vps_host));
    const totalSites = _vpsList.length;
    const deployed = _vpsList.filter(v => v.deploy_status === 'deployed').length;
    const vpsDomains = _domains.filter(d => d.hosting_provider === 'vps');
    const liveDomains = vpsDomains.filter(d => d.status === 'live').length;

    const stats = [
      { label: 'VPS Servers', value: hosts.size, color: '#14b8a6', icon: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/><circle cx="6" cy="18" r="1.5" fill="currentColor"/>' },
      { label: 'Hosted Sites', value: totalSites, color: '#818cf8', icon: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>' },
      { label: 'Deployed', value: deployed, color: '#10b981', icon: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' },
      { label: 'Live Domains', value: liveDomains, color: '#f59e0b', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
    ];

    el.innerHTML = stats.map(s => `
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px 16px;display:flex;align-items:center;gap:14px;">
        <div style="width:40px;height:40px;border-radius:10px;background:${s.color}15;border:1px solid ${s.color}30;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${s.color}" stroke-width="2">${s.icon}</svg>
        </div>
        <div>
          <div style="font-size:22px;font-weight:800;color:var(--text-primary);">${s.value}</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">${s.label}</div>
        </div>
      </div>
    `).join('');
  }

  function renderCards() {
    const el = document.getElementById('vps-cards-grid');
    if (!el) return;

    if (!_vpsList.length) {
      el.innerHTML = `
        <div style="text-align:center;padding:60px 20px;">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.28)" stroke-width="1" style="margin:0 auto 16px;">
            <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
            <circle cx="6" cy="6" r="1.5"/><circle cx="6" cy="18" r="1.5"/>
          </svg>
          <p style="font-size:15px;font-weight:700;color:var(--text-primary);margin:0 0 6px;">No VPS servers configured</p>
          <p style="font-size:12px;color:var(--text-secondary);margin:0;">Go to <strong style="color:#a5b4fc;">Websites &gt; Host</strong> to configure a VPS for a website.</p>
        </div>`;
      return;
    }

    const grouped = {};
    for (const v of _vpsList) {
      const key = v.vps_host;
      if (!grouped[key]) grouped[key] = { host: key, port: v.vps_ssh_port, user: v.vps_ssh_user, sites: [] };
      const siteDomains = _domains.filter(d => d.website_id === v.id && d.hosting_provider === 'vps');
      grouped[key].sites.push({ ...v, domains: siteDomains });
    }

    const hosts = Object.values(grouped);

    el.innerHTML = hosts.map(h => {
      const totalDomains = h.sites.reduce((n, s) => n + s.domains.length, 0);
      const liveDomains = h.sites.reduce((n, s) => n + s.domains.filter(d => d.status === 'live').length, 0);
      const deployedCount = h.sites.filter(s => s.deploy_status === 'deployed').length;

      return `
        <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.08);border-radius:14px;margin-bottom:20px;overflow:hidden;">
          <!-- VPS header -->
          <div style="padding:18px 20px;background:linear-gradient(135deg,rgba(20,184,166,.06),rgba(59,130,246,.04));border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <div style="width:44px;height:44px;border-radius:12px;background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                <circle cx="6" cy="6" r="1.5" fill="#14b8a6"/><circle cx="6" cy="18" r="1.5" fill="#14b8a6"/>
                <line x1="11" y1="6" x2="18" y2="6"/><line x1="11" y1="18" x2="18" y2="18"/>
              </svg>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:16px;font-weight:800;color:#f1f5f9;font-family:var(--font-mono);letter-spacing:-.02em;">${esc(h.host)}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${esc(h.user)}@${esc(h.host)}:${esc(h.port)}</div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <div style="text-align:center;">
                <div style="font-size:18px;font-weight:800;color:#5eead4;">${h.sites.length}</div>
                <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Sites</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:18px;font-weight:800;color:#818cf8;">${totalDomains}</div>
                <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Domains</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:18px;font-weight:800;color:#10b981;">${liveDomains}</div>
                <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Live</div>
              </div>
            </div>
          </div>

          <!-- Sites table -->
          <div style="padding:12px 16px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
                  <th style="text-align:left;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;">Website</th>
                  <th style="text-align:left;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;">Slug</th>
                  <th style="text-align:left;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;">Deploy Status</th>
                  <th style="text-align:left;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;">Auth</th>
                  <th style="text-align:left;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;">Domains</th>
                </tr>
              </thead>
              <tbody>
                ${h.sites.map(s => {
                  const statusColor = s.deploy_status === 'deployed' ? '#10b981' : s.deploy_status === 'deploying' ? '#f59e0b' : '#64748b';
                  const statusLabel = s.deploy_status === 'deployed' ? 'Deployed' : s.deploy_status === 'deploying' ? 'Deploying' : 'Not deployed';
                  const authLabel = s.has_key ? 'SSH Key' : s.has_pass ? 'Password' : 'None';
                  const authColor = (s.has_key || s.has_pass) ? '#5eead4' : '#f87171';

                  return `
                    <tr style="border-bottom:1px solid rgba(255,255,255,.04);transition:background .15s;" onmouseenter="this.style.background='rgba(255,255,255,.03)'" onmouseleave="this.style.background='transparent'">
                      <td style="padding:10px;font-size:12px;font-weight:700;color:#e2e8f0;">${esc(s.name)}</td>
                      <td style="padding:10px;font-size:11px;font-family:var(--font-mono);color:#818cf8;">${s.demo_slug ? '/demo/' + esc(s.demo_slug) + '/' : '<span style="color:#475569;">—</span>'}</td>
                      <td style="padding:10px;">
                        <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;background:${statusColor}15;color:${statusColor};border:1px solid ${statusColor}30;">
                          <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};${s.deploy_status==='deployed'?'box-shadow:0 0 5px '+statusColor+';':''}"></span>
                          ${statusLabel}
                        </span>
                      </td>
                      <td style="padding:10px;font-size:11px;font-weight:600;color:${authColor};">${authLabel}</td>
                      <td style="padding:10px;">
                        ${s.domains.length ? s.domains.map(d => `
                          <div style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;margin:1px 3px 1px 0;border-radius:5px;font-size:10px;font-family:var(--font-mono);background:${d.status==='live'?'rgba(16,185,129,.1)':'rgba(100,116,139,.08)'};color:${d.status==='live'?'#34d399':'#94a3b8'};border:1px solid ${d.status==='live'?'rgba(16,185,129,.2)':'rgba(100,116,139,.12)'};">
                            <span style="width:4px;height:4px;border-radius:50%;background:${d.status==='live'?'#10b981':'#64748b'};"></span>
                            ${esc(d.domain)}
                          </div>`).join('') : '<span style="font-size:10px;color:#475569;font-style:italic;">None</span>'}
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join('');
  }

  function destroy() {
    _destroyed = true;
  }

  return { render, init, destroy };
})();

window.VpsPage = VpsPage;
