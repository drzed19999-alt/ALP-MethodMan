/**
 * ALP – Domains Management Page
 * Central hub for all website domains + Railway custom domain sync.
 */
const DomainsPage = (() => {

  let _websites = [];
  let _railwayDomains = [];   // [{id, domain, status}]
  let _railwayConfigured = false;
  let _railwayError = null;
  let _destroyed = false;

  // ─── helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function parseAlt(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }

  // flatten all websites → domain rows
  function allDomainRows() {
    const rows = [];
    for (const w of _websites) {
      const primaryActive = w.domain_active !== 0;
      if (w.domain && w.domain !== 'localhost' && !w.domain.startsWith('auto-')) {
        rows.push({ websiteId: w.id, websiteName: w.name, websiteColor: w.color || '#6366f1', domain: w.domain.toLowerCase(), active: primaryActive, isPrimary: true });
      }
      parseAlt(w.domain_alt).forEach(a => {
        const d = (a.domain || '').trim().toLowerCase();
        if (d) rows.push({ websiteId: w.id, websiteName: w.name, websiteColor: w.color || '#6366f1', domain: d, active: !!a.active, isPrimary: false });
      });
    }
    return rows;
  }

  function railwayDomainForHost(host) {
    return _railwayDomains.find(r => r.domain === host || r.domain === `www.${host}`);
  }

  function dnsStatus(rd) {
    if (!rd) return null;
    const records = rd.status?.dnsRecords || [];
    if (!records.length) return 'pending';
    const all = records.every(r => r.status === 'VALID');
    return all ? 'ok' : 'pending';
  }

  // ─── render ─────────────────────────────────────────────────────────────────

  function render() {
    return `
<style>
/* ── Domains Page ─────────────────────────── */
.dom-pg { max-width: 1100px; margin: 0 auto; padding: 0 0 40px; }

.dom-rail-card {
  border-radius: 14px;
  border: 1px solid rgba(99,102,241,.22);
  background: rgba(99,102,241,.05);
  padding: 18px 22px;
  margin-bottom: 22px;
  display: flex; align-items: flex-start; gap: 18px;
}
.dom-rail-card.not-cfg {
  border-color: rgba(245,158,11,.22);
  background: rgba(245,158,11,.04);
}
.dom-rail-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.3);
}
.dom-rail-card.not-cfg .dom-rail-icon {
  background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.3);
}
.dom-rail-body { flex: 1; min-width: 0; }
.dom-rail-title { font-size: 13px; font-weight: 700; color: #a5b4fc; margin-bottom: 4px; }
.dom-rail-card.not-cfg .dom-rail-title { color: #fbbf24; }
.dom-rail-subtitle { font-size: 11.5px; color: var(--text-secondary); line-height: 1.55; }
.dom-rail-domains { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.dom-rail-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
  background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.2); color: #6ee7b7;
}
.dom-rail-chip.pending { background: rgba(245,158,11,.1); border-color: rgba(245,158,11,.2); color: #fbbf24; }
.dom-rail-chip .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.dom-rail-chip .chip-rm {
  width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
  border-radius: 3px; cursor: pointer; opacity: .6; margin-left: 2px;
}
.dom-rail-chip .chip-rm:hover { opacity: 1; background: rgba(239,68,68,.2); color: #f87171; }
.dom-env-tag {
  display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700;
  background: rgba(99,102,241,.15); color: #818cf8; border: 1px solid rgba(99,102,241,.2);
  margin-left: 6px; vertical-align: middle;
}
.dom-env-vars {
  margin-top: 10px; display: flex; flex-direction: column; gap: 5px;
}
.dom-env-var {
  display: flex; align-items: center; gap: 8px;
  font-size: 11.5px; color: var(--text-secondary);
}
.dom-env-var code {
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
  border-radius: 5px; padding: 2px 7px; font-size: 11px; color: #fbbf24; font-family: monospace;
}

/* ── Table ──────────────────────────── */
.dom-toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
}
.dom-search {
  flex: 1; max-width: 300px; padding: 8px 12px 8px 36px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
  border-radius: 9px; color: #f1f5f9; font-size: 12px; font-family: 'Inter', sans-serif;
  transition: border-color .2s;
}
.dom-search:focus { outline: none; border-color: rgba(99,102,241,.5); }
.dom-search-wrap { position: relative; flex: 1; max-width: 300px; }
.dom-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); }
.dom-filter-sel {
  padding: 8px 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
  border-radius: 9px; color: #f1f5f9; font-size: 12px; font-family: 'Inter', sans-serif; cursor: pointer;
}
.dom-filter-sel:focus { outline: none; border-color: rgba(99,102,241,.5); }

.dom-table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid rgba(255,255,255,.07); }
.dom-table {
  width: 100%; border-collapse: collapse; font-size: 12.5px;
}
.dom-table th {
  padding: 10px 14px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: var(--text-tertiary); text-align: left;
  background: rgba(255,255,255,.03); border-bottom: 1px solid rgba(255,255,255,.07);
  white-space: nowrap;
}
.dom-table td {
  padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.04);
  color: var(--text-secondary); vertical-align: middle;
}
.dom-table tr:last-child td { border-bottom: none; }
.dom-table tr:hover td { background: rgba(255,255,255,.025); }

.dom-site-cell { display: flex; align-items: center; gap: 8px; }
.dom-site-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dom-site-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }

.dom-domain-cell { display: flex; align-items: center; gap: 6px; }
.dom-domain-text { font-family: monospace; font-size: 12px; color: #e2e8f0; }
.dom-primary-badge {
  font-size: 8.5px; padding: 1px 6px; border-radius: 20px; font-weight: 700;
  background: rgba(99,102,241,.15); color: #818cf8; border: 1px solid rgba(99,102,241,.2);
  flex-shrink: 0;
}

.dom-status-dot {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
}
.dom-status-dot::before {
  content: ''; display: block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--dot-clr, #475569);
}
.dom-status-dot.active { color: #6ee7b7; --dot-clr: #10b981; }
.dom-status-dot.inactive { color: #94a3b8; --dot-clr: #475569; }

.dom-ry-badge {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600;
  padding: 3px 9px; border-radius: 20px;
}
.dom-ry-badge.added { background: rgba(16,185,129,.1); color: #6ee7b7; border: 1px solid rgba(16,185,129,.2); }
.dom-ry-badge.pending { background: rgba(245,158,11,.1); color: #fbbf24; border: 1px solid rgba(245,158,11,.2); }
.dom-ry-badge.none { background: rgba(255,255,255,.05); color: var(--text-tertiary); border: 1px solid rgba(255,255,255,.08); }

.dom-actions { display: flex; gap: 5px; align-items: center; flex-wrap: nowrap; }
.dom-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 7px; font-size: 11px; font-weight: 600;
  cursor: pointer; border: 1px solid; white-space: nowrap; transition: all .15s;
  font-family: 'Inter', sans-serif;
}
.dom-btn.cfg { background: rgba(99,102,241,.1); color: #a5b4fc; border-color: rgba(99,102,241,.25); }
.dom-btn.cfg:hover { background: rgba(99,102,241,.2); }
.dom-btn.add-ry { background: rgba(16,185,129,.08); color: #6ee7b7; border-color: rgba(16,185,129,.2); }
.dom-btn.add-ry:hover { background: rgba(16,185,129,.16); }
.dom-btn.rm-ry { background: rgba(239,68,68,.07); color: #f87171; border-color: rgba(239,68,68,.18); }
.dom-btn.rm-ry:hover { background: rgba(239,68,68,.14); }
.dom-btn[disabled] { opacity: .4; cursor: not-allowed; pointer-events: none; }

.dom-empty {
  text-align: center; padding: 48px 20px; color: var(--text-tertiary); font-size: 13px;
}
</style>

<div class="dom-pg">

  <!-- Railway banner -->
  <div id="dom-rail-card" class="dom-rail-card not-cfg" style="display:none;"></div>

  <!-- toolbar -->
  <div class="dom-toolbar">
    <div class="dom-search-wrap">
      <svg class="dom-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="dom-search" id="dom-search" type="text" placeholder="Search domain or website…" />
    </div>
    <select class="dom-filter-sel" id="dom-site-filter">
      <option value="">All websites</option>
    </select>
    <div style="flex:1;"></div>
    <button class="dom-btn cfg" id="dom-reload-btn" style="padding:7px 12px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
      Refresh
    </button>
  </div>

  <!-- table -->
  <div class="dom-table-wrap card">
    <table class="dom-table">
      <thead>
        <tr>
          <th>Website</th>
          <th>Domain</th>
          <th>Status</th>
          <th>Railway</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="dom-tbody">
        <tr><td colspan="5" class="dom-empty">Loading…</td></tr>
      </tbody>
    </table>
  </div>

</div>`;
  }

  // ─── Railway banner ──────────────────────────────────────────────────────────

  function renderRailwayBanner() {
    const card = document.getElementById('dom-rail-card');
    if (!card) return;
    card.style.display = 'flex';

    if (!_railwayConfigured) {
      card.className = 'dom-rail-card not-cfg';
      card.innerHTML = `
        <div class="dom-rail-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <div class="dom-rail-body">
          <div class="dom-rail-title">Railway not connected</div>
          <div class="dom-rail-subtitle">Set these environment variables in Railway to enable one-click domain sync from this panel.</div>
          <div class="dom-env-vars">
            <div class="dom-env-var">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              <code>RAILWAY_TOKEN</code> — your Railway personal access token (Account → Tokens)
            </div>
            <div class="dom-env-var">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
              <code>RAILWAY_SERVICE_ID</code> — found in Railway → Service → Settings
            </div>
            <div class="dom-env-var">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <code>RAILWAY_ENVIRONMENT_ID</code> — optional, defaults to <code>production</code>
            </div>
          </div>
        </div>`;
    } else {
      card.className = 'dom-rail-card';
      const domCount = _railwayDomains.length;
      let chipsHtml = '';
      if (_railwayError) {
        chipsHtml = `<span style="font-size:11.5px;color:#f87171;">${esc(_railwayError)}</span>`;
      } else if (!domCount) {
        chipsHtml = `<span style="font-size:11.5px;color:var(--text-tertiary);font-style:italic;">No custom domains added to Railway yet. Use the "+ Add to Railway" buttons below.</span>`;
      } else {
        chipsHtml = _railwayDomains.map(rd => {
          const st = dnsStatus(rd);
          return `<span class="dom-rail-chip ${st === 'ok' ? '' : 'pending'}" data-rdid="${esc(rd.id)}">
            <span class="chip-dot"></span>
            ${esc(rd.domain)}
            <span class="chip-rm" title="Remove from Railway" data-rdid="${esc(rd.id)}" data-domain="${esc(rd.domain)}">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </span>
          </span>`;
        }).join('');
      }
      card.innerHTML = `
        <div class="dom-rail-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <div class="dom-rail-body">
          <div class="dom-rail-title">
            Railway connected
            <span class="dom-env-tag">${domCount} domain${domCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="dom-rail-subtitle">Custom domains added to Railway. Green = DNS verified, Yellow = pending DNS propagation.</div>
          <div class="dom-rail-domains" id="dom-rail-chips">${chipsHtml}</div>
        </div>`;

      // wire remove chips
      card.querySelectorAll('.chip-rm').forEach(btn => {
        btn.addEventListener('click', () => removeFromRailway(btn.dataset.rdid, btn.dataset.domain));
      });
    }
  }

  // ─── Table ──────────────────────────────────────────────────────────────────

  function renderTable(filter = '', siteFilter = '') {
    const tbody = document.getElementById('dom-tbody');
    if (!tbody) return;

    let rows = allDomainRows();

    if (filter) {
      const q = filter.toLowerCase();
      rows = rows.filter(r => r.domain.includes(q) || r.websiteName.toLowerCase().includes(q));
    }
    if (siteFilter) {
      rows = rows.filter(r => String(r.websiteId) === siteFilter);
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="dom-empty">No domains found</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const rd = railwayDomainForHost(row.domain);
      const st = dnsStatus(rd);
      let ryBadge;
      if (!_railwayConfigured) {
        ryBadge = `<span class="dom-ry-badge none">Not set up</span>`;
      } else if (rd) {
        ryBadge = st === 'ok'
          ? `<span class="dom-ry-badge added">✓ Added</span>`
          : `<span class="dom-ry-badge pending">⏳ Pending DNS</span>`;
      } else {
        ryBadge = `<span class="dom-ry-badge none">—</span>`;
      }

      const ryAction = !_railwayConfigured ? '' :
        rd
          ? `<button class="dom-btn rm-ry" data-action="rm-ry" data-rdid="${esc(rd.id)}" data-domain="${esc(row.domain)}" title="Remove from Railway">✕ Railway</button>`
          : `<button class="dom-btn add-ry" data-action="add-ry" data-domain="${esc(row.domain)}" title="Add to Railway">+ Railway</button>`;

      return `<tr>
        <td>
          <div class="dom-site-cell">
            <span class="dom-site-dot" style="background:${esc(row.websiteColor)};box-shadow:0 0 5px ${esc(row.websiteColor)}55;"></span>
            <span class="dom-site-name">${esc(row.websiteName)}</span>
          </div>
        </td>
        <td>
          <div class="dom-domain-cell">
            <span class="dom-domain-text">${esc(row.domain)}</span>
            ${row.isPrimary ? '<span class="dom-primary-badge">PRIMARY</span>' : ''}
          </div>
        </td>
        <td><span class="dom-status-dot ${row.active ? 'active' : 'inactive'}">${row.active ? 'Active' : 'Inactive'}</span></td>
        <td>${ryBadge}</td>
        <td>
          <div class="dom-actions">
            <button class="dom-btn cfg" data-action="cfg" data-site="${esc(row.websiteId)}" title="Configure domains for this website">⚙ Configure</button>
            ${ryAction}
          </div>
        </td>
      </tr>`;
    }).join('');

    // wire actions
    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'cfg')    openConfigModal(btn.dataset.site);
        if (action === 'add-ry') addToRailway(btn.dataset.domain, btn);
        if (action === 'rm-ry')  removeFromRailway(btn.dataset.rdid, btn.dataset.domain);
      });
    });
  }

  // ─── Configure modal (same DCM style as demo-pages.js) ──────────────────────

  function openConfigModal(siteId) {
    const site = _websites.find(w => String(w.id) === String(siteId));
    if (!site) return;

    const primaryDomain  = (site.domain || '').trim().toLowerCase();
    const primaryActive  = site.domain_active !== 0;
    const altDoms        = parseAlt(site.domain_alt);

    const seen = new Set();
    const list = [];
    if (primaryDomain && primaryDomain !== 'localhost' && !primaryDomain.startsWith('auto-')) {
      seen.add(primaryDomain);
      list.push({ domain: primaryDomain, active: primaryActive, isPrimary: true });
    }
    altDoms.forEach(a => {
      const d = (a.domain || '').trim().toLowerCase();
      if (d && !seen.has(d)) { seen.add(d); list.push({ domain: d, active: !!a.active, isPrimary: false }); }
    });
    list.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));

    function rowHtml(domain, active, isPrimary) {
      return `<div class="dcm-row" data-domain="${esc(domain)}" data-primary="${isPrimary ? '1' : '0'}">
        <span class="dcm-dot" style="background:${active ? '#10b981' : '#ef4444'};${active ? 'box-shadow:0 0 5px rgba(16,185,129,.5);' : ''}transition:background .2s;"></span>
        <span class="dcm-dname">${esc(domain)}</span>
        ${isPrimary ? '<span style="font-size:7.5px;padding:1px 5px;background:rgba(99,102,241,.15);color:#818cf8;border-radius:20px;font-weight:700;flex-shrink:0;">PRIMARY</span>' : ''}
        <label class="dcm-tog" title="${active ? 'Deactivate' : 'Activate'}">
          <input type="checkbox" class="dcm-cb" ${active ? 'checked' : ''}>
          <span class="dcm-tog-track"></span>
        </label>
        ${!isPrimary ? `<button class="dcm-rm" title="Remove">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
      </div>`;
    }

    const content = `<style>
.dcm-row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:9px;margin-bottom:5px;transition:border-color .2s;}
.dcm-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:all .2s;}
.dcm-dname{flex:1;font-size:12px;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dcm-tog{position:relative;display:inline-flex;align-items:center;cursor:pointer;flex-shrink:0;}
.dcm-tog input{position:absolute;opacity:0;width:0;height:0;}
.dcm-tog-track{width:28px;height:16px;background:rgba(255,255,255,.08);border-radius:20px;border:1px solid rgba(255,255,255,.1);transition:all .2s;position:relative;}
.dcm-tog-track::after{content:'';position:absolute;left:2px;top:2px;width:10px;height:10px;border-radius:50%;background:#475569;transition:all .2s;}
.dcm-tog input:checked~.dcm-tog-track{background:rgba(16,185,129,.22);border-color:rgba(16,185,129,.4);}
.dcm-tog input:checked~.dcm-tog-track::after{background:#10b981;transform:translateX(12px);}
.dcm-rm{width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.15);border-radius:6px;cursor:pointer;flex-shrink:0;transition:all .15s;}
.dcm-rm:hover{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.3);}
.dcm-section-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;margin-top:12px;}
#dcm-new-input:focus{border-color:rgba(245,158,11,.4)!important;box-shadow:0 0 0 3px rgba(245,158,11,.1)!important;outline:none;}
</style>
<div>
  <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px;">
    Website: <strong style="color:var(--text-primary);">${esc(site.name)}</strong>
  </div>
  <div class="dcm-section-lbl" style="color:#10b981;">● Active Domains</div>
  <div id="dcm-active-list">
    ${list.filter(d => d.active).map(d => rowHtml(d.domain, true, d.isPrimary)).join('') ||
      '<div style="font-size:12px;color:#475569;font-style:italic;padding:4px 0 8px;">No active domains</div>'}
  </div>
  <div class="dcm-section-lbl" style="color:#64748b;">○ Inactive Domains</div>
  <div id="dcm-inactive-list" style="margin-bottom:14px;">
    ${list.filter(d => !d.active).map(d => rowHtml(d.domain, false, d.isPrimary)).join('') ||
      '<div style="font-size:12px;color:#475569;font-style:italic;padding:4px 0;">All domains are active</div>'}
  </div>
  <div style="display:flex;gap:8px;">
    <input type="text" id="dcm-new-input" placeholder="Add domain (e.g. bank-secure.com)" style="flex:1;padding:9px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f1f5f9;font-size:12px;font-family:'Inter',sans-serif;transition:border-color .2s,box-shadow .2s;" />
    <button id="dcm-add-btn" style="padding:9px 16px;background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25);border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;">+ Add</button>
  </div>
</div>`;

    window.showModal({
      title: '⚙ Configure Domains',
      content,
      confirmText: 'Save Changes',
      cancelText: 'Cancel',
      width: '520px',
      onConfirm: async () => {
        const allRows = [...document.querySelectorAll('#dcm-active-list .dcm-row, #dcm-inactive-list .dcm-row')];
        let newPrimaryActive = primaryActive;
        const newAlt = [];
        allRows.forEach(row => {
          const domain    = row.dataset.domain || '';
          const isPrimary = row.dataset.primary === '1';
          const active    = row.querySelector('.dcm-cb')?.checked ? 1 : 0;
          if (isPrimary) { newPrimaryActive = !!active; }
          else if (domain) { newAlt.push({ domain, active }); }
        });
        await window.ALPApi.updateWebsite(siteId, { domain_active: newPrimaryActive ? 1 : 0, domain_alt: newAlt });
        window.showToast('Domains updated', 'success');
        await loadAll();
      },
    });

    setTimeout(() => {
      function wireCb(cb) {
        cb.addEventListener('change', () => {
          const row = cb.closest('.dcm-row');
          if (!row) return;
          const dot = row.querySelector('.dcm-dot');
          const activeList   = document.getElementById('dcm-active-list');
          const inactiveList = document.getElementById('dcm-inactive-list');
          if (cb.checked) {
            if (dot) { dot.style.background = '#10b981'; dot.style.boxShadow = '0 0 5px rgba(16,185,129,.5)'; }
            row.style.borderColor = 'rgba(16,185,129,.2)'; row.style.background = 'rgba(16,185,129,.04)';
            activeList?.querySelectorAll('div:not(.dcm-row)').forEach(el => el.remove());
            activeList?.appendChild(row);
          } else {
            if (dot) { dot.style.background = '#ef4444'; dot.style.boxShadow = ''; }
            row.style.borderColor = ''; row.style.background = '';
            inactiveList?.querySelectorAll('div:not(.dcm-row)').forEach(el => el.remove());
            inactiveList?.appendChild(row);
          }
        });
      }
      document.querySelectorAll('.dcm-cb').forEach(wireCb);
      document.querySelectorAll('.dcm-rm').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.dcm-row')?.remove());
      });
      const addBtn = document.getElementById('dcm-add-btn');
      const newInput = document.getElementById('dcm-new-input');
      function addDomain() {
        const val = (newInput?.value || '').trim().toLowerCase();
        if (!val || !val.includes('.')) { newInput?.focus(); return; }
        if (document.querySelector(`.dcm-row[data-domain="${val}"]`)) { newInput.value = ''; return; }
        const inactiveList = document.getElementById('dcm-inactive-list');
        inactiveList?.querySelectorAll('div:not(.dcm-row)').forEach(el => el.remove());
        const row = document.createElement('div');
        row.className = 'dcm-row'; row.dataset.domain = val; row.dataset.primary = '0';
        row.innerHTML = `
          <span class="dcm-dot" style="background:#ef4444;"></span>
          <span class="dcm-dname">${esc(val)}</span>
          <label class="dcm-tog"><input type="checkbox" class="dcm-cb"><span class="dcm-tog-track"></span></label>
          <button class="dcm-rm" title="Remove">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>`;
        inactiveList?.appendChild(row);
        wireCb(row.querySelector('.dcm-cb'));
        row.querySelector('.dcm-rm')?.addEventListener('click', () => row.remove());
        if (newInput) newInput.value = '';
      }
      addBtn?.addEventListener('click', addDomain);
      newInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } });
    }, 60);
  }

  // ─── Railway actions ─────────────────────────────────────────────────────────

  async function addToRailway(domain, btn) {
    if (btn) btn.disabled = true;
    try {
      const res = await window.ALPApi.addRailwayDomain(domain);
      window.showToast(`${domain} added to Railway`, 'success');
      await loadRailway();
      renderRailwayBanner();
      renderTable(
        document.getElementById('dom-search')?.value || '',
        document.getElementById('dom-site-filter')?.value || ''
      );
    } catch (err) {
      window.showToast('Railway error: ' + err.message, 'error');
      if (btn) btn.disabled = false;
    }
  }

  async function removeFromRailway(id, domain) {
    window.showModal({
      title: 'Remove from Railway',
      type: 'danger',
      content: `<p style="margin:0;color:var(--text-secondary);font-size:13px;">Remove <strong style="color:#f1f5f9;">${esc(domain)}</strong> from Railway?<br><span style="font-size:11.5px;margin-top:6px;display:block;color:var(--text-muted);">The domain stays in your website config — only the Railway entry is deleted.</span></p>`,
      confirmText: 'Remove from Railway',
      onConfirm: async () => {
        try {
          await window.ALPApi.removeRailwayDomain(id);
          window.showToast(`${domain} removed from Railway`, 'success');
          await loadRailway();
          renderRailwayBanner();
          renderTable(
            document.getElementById('dom-search')?.value || '',
            document.getElementById('dom-site-filter')?.value || ''
          );
        } catch (err) {
          window.showToast('Railway error: ' + err.message, 'error');
        }
      },
    });
  }

  // ─── Data loading ────────────────────────────────────────────────────────────

  async function loadRailway() {
    try {
      const data = await window.ALPApi.getRailwayStatus();
      _railwayConfigured = data.configured;
      _railwayDomains    = data.domains || [];
      _railwayError      = data.error || null;
    } catch {
      _railwayConfigured = false;
      _railwayDomains    = [];
    }
  }

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      _websites = Array.isArray(data) ? data : (data.websites || []);
    } catch {
      _websites = [];
    }
  }

  async function loadAll() {
    await Promise.all([loadWebsites(), loadRailway()]);
    if (_destroyed) return;
    renderRailwayBanner();
    populateSiteFilter();
    renderTable(
      document.getElementById('dom-search')?.value || '',
      document.getElementById('dom-site-filter')?.value || ''
    );
  }

  function populateSiteFilter() {
    const sel = document.getElementById('dom-site-filter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All websites</option>' +
      _websites.map(w => `<option value="${esc(w.id)}" ${String(w.id) === cur ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
  }

  // ─── init / destroy ─────────────────────────────────────────────────────────

  function init() {
    _destroyed = false;

    loadAll();

    // search + filter
    let debounce;
    document.getElementById('dom-search')?.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderTable(e.target.value, document.getElementById('dom-site-filter')?.value || ''), 200);
    });
    document.getElementById('dom-site-filter')?.addEventListener('change', e => {
      renderTable(document.getElementById('dom-search')?.value || '', e.target.value);
    });
    document.getElementById('dom-reload-btn')?.addEventListener('click', loadAll);
  }

  function destroy() { _destroyed = true; }

  return { render, init, destroy };
})();

window.DomainsPage = DomainsPage;
