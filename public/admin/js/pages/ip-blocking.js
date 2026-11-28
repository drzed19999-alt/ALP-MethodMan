/**
 * ALP - IP Blocking Page
 * Manage blocked IPs and security rules
 */
const IPBlockingPage = (() => {
  let blockedIPs = [];
  let refreshTimer = null;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'Never';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.max(0, now - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function render() {
    return `
      <div class="ip-blocking-page">
        <div class="page-header">
          <div>
            <div class="ph" style="--ph-accent:#f97316;--ph-glow:rgba(249,115,22,0.5)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>IP SHIELD · DEFENSE</div>
              <h1 class="ph-title"><span class="ph-title-glyph">⊘</span><span class="ph-title-text">IP Shield</span></h1>
              <p class="ph-sub">Manage blocked IPs and security rules</p>
            </div>
          </div>
          <button class="btn btn-primary" onclick="IPBlockingPage.showAddModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Block IP Address
          </button>
        </div>

        <!-- Stats -->
        <div class="ip-stats-grid">
          <div class="stat-card-mini">
            <div class="stat-mini-label">Blocked IPs</div>
            <div class="stat-mini-value" id="stat-blocked-ips">0</div>
          </div>
          <div class="stat-card-mini">
            <div class="stat-mini-label">Blocked Today</div>
            <div class="stat-mini-value" id="stat-blocked-today">0</div>
          </div>
          <div class="stat-card-mini">
            <div class="stat-mini-label">Requests Blocked</div>
            <div class="stat-mini-value" id="stat-requests-blocked">0</div>
          </div>
          <div class="stat-card-mini">
            <div class="stat-mini-label">Auto-Blocked</div>
            <div class="stat-mini-value" id="stat-auto-blocked">0</div>
          </div>
        </div>

        <!-- Filter & Search -->
        <div class="filter-bar">
          <div class="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" id="ip-search" placeholder="Search IPs..." />
          </div>
          <select id="ip-filter" class="filter-select">
            <option value="all">All IPs</option>
            <option value="manual">Manual Block</option>
            <option value="auto">Auto-Blocked</option>
            <option value="temporary">Temporary</option>
            <option value="permanent">Permanent</option>
          </select>
        </div>

        <!-- Table -->
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Blocked</th>
                <th>Expires</th>
                <th>Requests</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="ip-table-body">
              <tr>
                <td colspan="7" class="ip-empty-cell">No blocked IPs</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style>
        .ip-blocking-page {
          max-width: 1400px;
          margin: 0 auto;
          min-width: 0;
        }

        .ip-blocking-page .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .ip-blocking-page .ip-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 20px;
        }

        .ip-blocking-page .stat-card-mini {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 14px 16px;
          min-width: 0;
        }

        .ip-blocking-page .stat-mini-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .ip-blocking-page .stat-mini-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .ip-blocking-page .filter-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .ip-blocking-page .search-box {
          flex: 1 1 240px;
          min-width: 0;
          position: relative;
        }

        .ip-blocking-page .search-box svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .ip-blocking-page .search-box input {
          width: 100%;
          height: 38px;
          padding: 0 12px 0 38px;
          background: var(--bg-input);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }

        .ip-blocking-page .search-box input:focus {
          border-color: var(--accent-primary);
        }

        .ip-blocking-page .filter-select {
          height: 38px;
          padding: 0 32px 0 12px;
          background: var(--bg-input);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          outline: none;
          min-width: 160px;
        }

        .ip-blocking-page .table-container {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
        }

        .ip-blocking-page .data-table {
          width: 100%;
          min-width: 680px;
          border-collapse: collapse;
        }

        .ip-blocking-page .data-table th {
          background: var(--bg-tertiary);
          padding: 12px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-primary);
          white-space: nowrap;
        }

        .ip-blocking-page .data-table td {
          padding: 12px;
          font-size: 13px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-subtle);
          white-space: nowrap;
        }

        .ip-blocking-page .data-table tr:last-child td {
          border-bottom: none;
        }

        .ip-blocking-page .data-table tbody tr:hover {
          background: var(--bg-hover);
        }

        .ip-blocking-page .ip-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .ip-blocking-page .ip-badge.manual {
          background: rgba(239, 68, 68, 0.12);
          color: var(--color-danger);
        }

        .ip-blocking-page .ip-badge.auto {
          background: rgba(245, 158, 11, 0.14);
          color: var(--color-warning);
        }

        .ip-blocking-page .ip-badge.temporary {
          background: rgba(59, 130, 246, 0.12);
          color: var(--color-info);
        }

        .ip-blocking-page .ip-badge.permanent {
          background: rgba(139, 92, 246, 0.12);
          color: #a78bfa;
        }

        [data-theme='light'] .ip-blocking-page .ip-badge.manual    { background: #FEE2E2; color: #B91C1C; }
        [data-theme='light'] .ip-blocking-page .ip-badge.auto      { background: #FEF3C7; color: #B45309; }
        [data-theme='light'] .ip-blocking-page .ip-badge.temporary { background: #DBEAFE; color: #1D4ED8; }
        [data-theme='light'] .ip-blocking-page .ip-badge.permanent { background: #EDE9FE; color: #6D28D9; }

        .ip-blocking-page .btn-small {
          padding: 5px 10px;
          font-size: 12px;
        }

        .ip-blocking-page .ip-empty-cell {
          text-align: center;
          padding: 40px 16px;
          color: var(--text-muted);
        }

        @media (max-width: 768px) {
          .ip-blocking-page .ip-stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
          .ip-blocking-page .stat-mini-value { font-size: 20px; }
        }

        @media (max-width: 480px) {
          .ip-blocking-page .page-header .btn { width: 100%; justify-content: center; }
          .ip-blocking-page .filter-select { width: 100%; }
          .ip-blocking-page .stat-card-mini { padding: 12px; }
        }
      </style>
    `;
  }

  function renderIPRow(ip) {
    const typeClass = ip.type || 'manual';
    const typeName = {
      manual: 'Manual',
      auto: 'Auto-Block',
      temporary: 'Temporary',
      permanent: 'Permanent'
    }[typeClass] || 'Manual';

    const expires = ip.expires ? timeAgo(ip.expires) : 'Never';
    const blocked = timeAgo(ip.blocked_at || ip.created_at);

    return `
      <tr>
        <td><code>${escapeHtml(ip.ip_address)}</code></td>
        <td><span class="ip-badge ${typeClass}">${typeName}</span></td>
        <td>${escapeHtml(ip.reason || 'No reason provided')}</td>
        <td>${blocked}</td>
        <td>${expires}</td>
        <td>${ip.blocked_requests || 0}</td>
        <td>
          <button class="btn btn-small btn-danger" onclick="IPBlockingPage.unblockIP('${ip.id}')">
            Unblock
          </button>
        </td>
      </tr>
    `;
  }

  function renderTable(ips) {
    const tbody = document.getElementById('ip-table-body');
    if (!tbody) return;

    if (!ips || ips.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="ip-empty-cell">No blocked IPs</td></tr>';
      return;
    }

    tbody.innerHTML = ips.map(renderIPRow).join('');
  }

  function updateStats(stats) {
    const blockedEl = document.getElementById('stat-blocked-ips');
    const todayEl = document.getElementById('stat-blocked-today');
    const requestsEl = document.getElementById('stat-requests-blocked');
    const autoEl = document.getElementById('stat-auto-blocked');

    if (blockedEl) blockedEl.textContent = stats.total || 0;
    if (todayEl) todayEl.textContent = stats.today || 0;
    if (requestsEl) requestsEl.textContent = (stats.blocked_requests || 0).toLocaleString();
    if (autoEl) autoEl.textContent = stats.auto_blocked || 0;
  }

  async function loadData() {
    try {
      const data = await window.ALPApi._get('/api/security/blocked-ips');
      blockedIPs = data.ips || [];
      renderTable(blockedIPs);
      updateStats(data.stats || {});
    } catch (err) {
      console.error('[IP Blocking] Failed to load blocked IPs:', err);
      window.showToast?.('Failed to load blocked IPs: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  function showAddModal() {
    if (!window.ALPModal) return;

    window.ALPModal.showModal({
      title: 'Block IP Address',
      content: `
        <form id="block-ip-form" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="form-group">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">IP Address</label>
            <input type="text" name="ip_address" class="form-input" placeholder="192.168.1.100" required />
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">Type</label>
            <select name="type" class="form-input" style="cursor: pointer;">
              <option value="manual">Manual Block</option>
              <option value="temporary">Temporary (24h)</option>
              <option value="permanent">Permanent</option>
            </select>
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">Reason</label>
            <textarea name="reason" class="form-input" placeholder="Why are you blocking this IP?" rows="3" style="resize: vertical; font-family: inherit;"></textarea>
          </div>
        </form>
      `,
      confirmText: 'Block IP',
      cancelText: 'Cancel',
      type: 'danger',
      width: '480px',
      onConfirm: async () => {
        const form = document.getElementById('block-ip-form');
        if (!form) return;
        const data = Object.fromEntries(new FormData(form));
        try {
          await window.ALPApi._post('/api/security/blocked-ips', data);
          window.showToast?.('IP blocked successfully', 'success');
          loadData();
        } catch (err) {
          console.error('[IP Blocking] Failed to block IP:', err);
          window.showToast?.(err.message || 'Failed to block IP', 'error');
          throw err;
        }
      }
    });
  }

  async function unblockIP(id) {
    const doUnblock = async () => {
      try {
        await window.ALPApi._delete(`/api/security/blocked-ips/${id}`);
        window.showToast?.('IP unblocked successfully', 'success');
        loadData();
      } catch (err) {
        console.error('[IP Blocking] Failed to unblock IP:', err);
        window.showToast?.(err.message || 'Failed to unblock IP', 'error');
      }
    };

    if (window.AlpConfirm) {
      const ok = await window.AlpConfirm({
        title: 'Unblock IP Address',
        message: 'Are you sure you want to unblock this IP? It will regain access immediately.',
        confirmText: 'Unblock',
        tone: 'warning',
      });
      if (ok) await doUnblock();
      return;
    }

    window.showModal({
      title: 'Unblock IP Address',
      type: 'warning',
      content: '<p style="margin:0;color:var(--text-secondary);">Are you sure you want to unblock this IP? It will regain access immediately.</p>',
      confirmText: 'Unblock',
      cancelText: 'Cancel',
      onConfirm: doUnblock,
    });
  }

  function setupFilters() {
    const search = document.getElementById('ip-search');
    const filter = document.getElementById('ip-filter');

    if (search) {
      search.addEventListener('input', () => {
        applyFilters();
      });
    }

    if (filter) {
      filter.addEventListener('change', () => {
        applyFilters();
      });
    }
  }

  function applyFilters() {
    const search = document.getElementById('ip-search')?.value.toLowerCase() || '';
    const filter = document.getElementById('ip-filter')?.value || 'all';

    let filtered = blockedIPs;

    if (search) {
      filtered = filtered.filter(ip => 
        ip.ip_address?.toLowerCase().includes(search) ||
        ip.reason?.toLowerCase().includes(search)
      );
    }

    if (filter !== 'all') {
      filtered = filtered.filter(ip => ip.type === filter);
    }

    renderTable(filtered);
  }

  async function init() {
    await loadData();
    setupFilters();
    refreshTimer = setInterval(loadData, 30000);
  }

  function cleanup() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  return { render, init, cleanup, showAddModal, unblockIP };
})();

window.IPBlockingPage = IPBlockingPage;
