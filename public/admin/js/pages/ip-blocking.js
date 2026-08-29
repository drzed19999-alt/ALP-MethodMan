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
                <td colspan="7" class="empty-state">No blocked IPs</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style>
        .ip-blocking-page {
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 16px;
        }

        .page-title {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .page-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .ip-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
          margin-bottom: 20px;
        }

        .stat-card-mini {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          padding: 14px;
        }

        .stat-mini-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .stat-mini-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .filter-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .search-box {
          flex: 1;
          position: relative;
        }

        .search-box svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .search-box input {
          width: 100%;
          height: 36px;
          padding: 0 12px 0 38px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
        }

        .search-box input:focus {
          border-color: var(--border-hover);
        }

        .filter-select {
          height: 36px;
          padding: 0 32px 0 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          outline: none;
        }

        .table-container {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          overflow: hidden;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          background: var(--bg-tertiary);
          padding: 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-primary);
        }

        .data-table td {
          padding: 12px;
          font-size: 13px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-primary);
        }

        .data-table tr:last-child td {
          border-bottom: none;
        }

        .data-table tr:hover {
          background: var(--bg-tertiary);
        }

        .ip-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .ip-badge.manual {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .ip-badge.auto {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
        }

        .ip-badge.temporary {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .ip-badge.permanent {
          background: rgba(139, 92, 246, 0.1);
          color: #8b5cf6;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #6366f1;
          color: white;
        }

        .btn-primary:hover {
          background: #4f46e5;
        }

        .btn-small {
          padding: 4px 10px;
          font-size: 12px;
        }

        .btn-danger {
          background: transparent;
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .btn-danger:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: var(--text-muted);
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
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No blocked IPs</td></tr>';
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
      console.log('[IP Blocking] Loading data...');
      const data = await window.ALPApi._get('/api/security/blocked-ips');
      console.log('[IP Blocking] Data loaded:', data);
      
      blockedIPs = data.ips || [];
      renderTable(blockedIPs);
      updateStats(data.stats || {});
    } catch (err) {
      console.error('[IP Blocking] Failed to load blocked IPs:', err);
      
      window.showToast?.('Failed to load blocked IPs: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  function showAddModal() {
    console.log('[IP Blocking] Opening add modal...');
    console.log('[IP Blocking] ALPModal available:', !!window.ALPModal);
    
    if (!window.ALPModal) {
      console.warn('[IP Blocking] Modal component not loaded');
      return;
    }
    
    window.ALPModal.showModal({
      title: 'Block IP Address',
      content: `
        <form id="block-ip-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="form-group">
            <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: var(--text-primary);">IP Address</label>
            <input type="text" name="ip_address" placeholder="192.168.1.100" required 
              style="width: 100%; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-primary); 
              border-radius: 8px; color: var(--text-primary); font-size: 13px; outline: none;" />
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: var(--text-primary);">Type</label>
            <select name="type" 
              style="width: 100%; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-primary); 
              border-radius: 8px; color: var(--text-primary); font-size: 13px; outline: none; cursor: pointer;">
              <option value="manual">Manual Block</option>
              <option value="temporary">Temporary (24h)</option>
              <option value="permanent">Permanent</option>
            </select>
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: var(--text-primary);">Reason</label>
            <textarea name="reason" placeholder="Why are you blocking this IP?" rows="3" 
              style="width: 100%; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-primary); 
              border-radius: 8px; color: var(--text-primary); font-size: 13px; outline: none; resize: vertical; font-family: inherit;"></textarea>
          </div>
        </form>
      `,
      confirmText: 'Block IP',
      cancelText: 'Cancel',
      type: 'danger',
      width: '480px',
      onConfirm: async () => {
        const form = document.getElementById('block-ip-form');
        if (!form) {
          console.error('[IP Blocking] Form not found');
          return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        
        console.log('[IP Blocking] Submitting:', data);
        
        try {
          await window.ALPApi._post('/api/security/blocked-ips', data);
          console.log('[IP Blocking] IP blocked successfully');
          
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

  function unblockIP(id) {
    console.log('[IP Blocking] Confirming unblock for IP:', id);
    window.showModal({
      title: 'Unblock IP Address',
      type: 'warning',
      content: '<p style="margin:0;color:#cbd5e1;">Are you sure you want to unblock this IP? It will regain access immediately.</p>',
      confirmText: 'Unblock',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await window.ALPApi._delete(`/api/security/blocked-ips/${id}`);
          console.log('[IP Blocking] IP unblocked successfully');
          window.showToast?.('IP unblocked successfully', 'success');
          loadData();
        } catch (err) {
          console.error('[IP Blocking] Failed to unblock IP:', err);
          window.showToast?.(err.message || 'Failed to unblock IP', 'error');
          throw err;
        }
      },
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
    console.log('[IP Blocking] Initializing...');
    console.log('[IP Blocking] Components:', {
      ALPApi: !!window.ALPApi,
      ALPModal: !!window.ALPModal,
      ALPToast: !!window.ALPToast
    });
    
    await loadData();
    setupFilters();
    refreshTimer = setInterval(loadData, 30000);
    
    console.log('[IP Blocking] Initialized successfully');
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
