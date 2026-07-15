/**
 * ALP - Audit Logs Page Module
 * Filters, data table, expandable rows, pagination, clear logs
 */
const LogsPage = (() => {
  let logs = [];
  let total = 0;
  let page = 1;
  const perPage = 25;
  let filters = { category: '', user: '', search: '', from: '', to: '' };
  let expandedRow = null;

  function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.includes('+')) {
      return new Date(dateStr.trim().replace(' ', 'T') + 'Z');
    }
    return new Date(dateStr);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = parseDate(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function timeAgo(dateStr) {
    const diff = Math.max(0, Date.now() - parseDate(dateStr).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function categoryColor(cat) {
    const m = {
      auth: '#3b82f6', session: '#10b981', redirect: '#f59e0b',
      settings: '#8b5cf6', user: '#ec4899', system: '#6b7280',
      website: '#14b8a6', notification: '#f97316'
    };
    return m[cat] || '#6b7280';
  }

  function render() {
    const user = window.ALPAuth.getUser();
    const isSuperAdmin = user && user.role === 'super_admin';

    return `
      <div class="logs-page page-enter">
        <div class="page-header">
          <div>
            <h1 class="page-title">Audit Logs</h1>
            <p class="page-subtitle">Track all administrative actions and system events</p>
          </div>
          <div class="header-actions">
            <span class="badge" id="logs-total-badge">0 entries</span>
            ${isSuperAdmin ? `
              <button class="btn btn-danger-outline" id="clear-logs-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                Clear Old Logs
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Filters -->
        <div class="filter-bar">
          <div class="search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="logs-search" placeholder="Search actions, details…" class="search-input" />
          </div>
          <select id="filter-category" class="filter-select">
            <option value="">All Categories</option>
            <option value="auth">Auth</option>
            <option value="session">Session</option>
            <option value="redirect">Redirect</option>
            <option value="settings">Settings</option>
            <option value="user">User</option>
            <option value="website">Website</option>
            <option value="system">System</option>
          </select>
          <select id="filter-user" class="filter-select">
            <option value="">All Users</option>
          </select>
          <input type="date" id="filter-date-from" class="filter-input" title="From date" />
          <input type="date" id="filter-date-to" class="filter-input" title="To date" />
        </div>

        <!-- Table -->
        <div class="card logs-table-card">
          <div class="table-wrap">
            <table class="logs-table" id="logs-table">
              <thead>
                <tr>
                  <th style="width:170px;">Timestamp</th>
                  <th style="width:110px;">User</th>
                  <th>Action</th>
                  <th style="width:100px;">Category</th>
                  <th style="width:120px;">IP Address</th>
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody id="logs-body">
                <tr><td colspan="6" class="table-loading">Loading…</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="pagination" id="pagination"></div>
        </div>

        <p class="export-note">💡 Export to CSV coming soon. Use browser dev tools to copy table data in the meantime.</p>
      </div>

      <style>
        .logs-page { max-width: 1200px; margin: 0 auto; }
        .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
        .page-title { font-size:26px; font-weight:700; color:var(--text-primary); margin:0 0 4px; }
        .page-subtitle { font-size:14px; color:var(--text-secondary); margin:0; }
        .header-actions { display:flex; align-items:center; gap:12px; }
        .badge { background:rgba(99,102,241,0.12); color:#818cf8; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:500; }
        .btn { display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; font-family:'Inter',sans-serif; border:none; }
        .btn-danger-outline { background:transparent; color:#ef4444; border:1px solid rgba(239,68,68,0.3); }
        .btn-danger-outline:hover { background:rgba(239,68,68,0.1); }

        .filter-bar {
          display:flex; align-items:center; gap:12px; margin-bottom:20px;
          padding:14px 18px; background:var(--card-bg); border:1px solid var(--border-color);
          border-radius:14px; flex-wrap:wrap;
        }
        .search-wrap {
          display:flex; align-items:center; gap:8px; flex:1; min-width:200px;
          background:rgba(255,255,255,0.04); border-radius:8px; padding:0 12px;
          border:1px solid transparent; transition:border-color 0.2s;
        }
        .search-wrap:focus-within { border-color:rgba(99,102,241,0.4); }
        .search-wrap svg { color:var(--text-tertiary); flex-shrink:0; }
        .search-input { background:none; border:none; outline:none; color:var(--text-primary); font-size:13px; padding:9px 4px; width:100%; font-family:'Inter',sans-serif; }
        .search-input::placeholder { color:var(--text-tertiary); }
        .filter-select, .filter-input {
          background:rgba(255,255,255,0.04); border:1px solid var(--border-color);
          color:var(--text-secondary); border-radius:8px; padding:9px 14px;
          font-size:13px; font-family:'Inter',sans-serif; cursor:pointer; outline:none;
        }
        .filter-select {
          appearance:none; min-width:130px;
          background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center; padding-right:32px;
        }
        .filter-input { width:140px; }
        .filter-input::-webkit-calendar-picker-indicator { filter: invert(0.5); }

        .card { background:var(--card-bg); border:1px solid var(--border-color); border-radius:14px; padding:0; overflow:hidden; }
        .logs-table-card { animation:fadeUp 0.4s ease both; }
        .table-wrap { overflow-x:auto; }
        .logs-table { width:100%; border-collapse:collapse; min-width:700px; }
        .logs-table th {
          text-align:left; font-size:11px; font-weight:600; color:var(--text-tertiary);
          text-transform:uppercase; letter-spacing:0.5px; padding:14px 16px;
          border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.02);
        }
        .logs-table td { padding:12px 16px; font-size:13px; color:var(--text-primary); border-bottom:1px solid rgba(255,255,255,0.03); }
        .logs-table tbody tr { cursor:pointer; transition:background 0.1s; }
        .logs-table tbody tr:hover { background:rgba(99,102,241,0.04); }
        .table-loading { text-align:center; color:var(--text-tertiary); padding:40px !important; }

        .log-timestamp { font-size:12px; color:var(--text-secondary); }
        .log-timestamp-ago { font-size:11px; color:var(--text-tertiary); display:block; }
        .log-user { font-weight:500; }
        .log-action { font-size:13px; }
        .log-category {
          display:inline-block; padding:3px 10px; border-radius:20px;
          font-size:11px; font-weight:500;
        }
        .expand-btn {
          background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:4px;
          border-radius:4px; transition:all 0.15s; display:flex;
        }
        .expand-btn:hover { color:var(--text-primary); }
        .expand-btn.expanded svg { transform:rotate(180deg); }

        .log-detail-row td { padding:0 !important; border-bottom:1px solid var(--border-color); }
        .log-detail-content {
          padding:16px 24px; background:rgba(99,102,241,0.03);
          font-size:12px; font-family:monospace; white-space:pre-wrap;
          color:var(--text-secondary); max-height:300px; overflow-y:auto;
        }

        .pagination {
          display:flex; align-items:center; justify-content:center; gap:4px;
          padding:16px; border-top:1px solid var(--border-color);
        }
        .page-btn {
          background:transparent; border:1px solid var(--border-color); color:var(--text-secondary);
          padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;
          font-family:'Inter',sans-serif; transition:all 0.15s;
        }
        .page-btn:hover { border-color:#6366f1; color:#818cf8; }
        .page-btn.active { background:#6366f1; color:#fff; border-color:#6366f1; }
        .page-btn:disabled { opacity:0.4; cursor:not-allowed; }

        .export-note { font-size:12px; color:var(--text-tertiary); margin-top:16px; text-align:center; }

        .page-enter { animation:fadeUp 0.3s ease both; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      </style>
    `;
  }

  function renderTable() {
    const tbody = document.getElementById('logs-body');
    const badge = document.getElementById('logs-total-badge');
    if (!tbody) return;

    if (badge) badge.textContent = `${total.toLocaleString()} entries`;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No logs found</td></tr>';
      return;
    }

    let html = '';
    logs.forEach((log, idx) => {
      const catColor = categoryColor(log.category);
      const details = (() => {
        try { return JSON.parse(log.details || '{}'); } catch { return log.details || ''; }
      })();

      html += `
        <tr class="log-row" data-idx="${idx}">
          <td>
            <span class="log-timestamp">${formatDate(log.timestamp)}</span>
            <span class="log-timestamp-ago">${timeAgo(log.timestamp)}</span>
          </td>
          <td><span class="log-user">${escapeHtml(log.username || 'System')}</span></td>
          <td><span class="log-action">${escapeHtml(log.action || '—')}</span></td>
          <td><span class="log-category" style="background:${catColor}20;color:${catColor};">${escapeHtml(log.category || 'general')}</span></td>
          <td style="font-size:12px;color:var(--text-secondary);">${escapeHtml(log.ip_address || '—')}</td>
          <td>
            <button class="expand-btn ${expandedRow === idx ? 'expanded' : ''}" data-idx="${idx}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </td>
        </tr>
        ${expandedRow === idx ? `
          <tr class="log-detail-row">
            <td colspan="6">
              <div class="log-detail-content">${typeof details === 'object' ? escapeHtml(JSON.stringify(details, null, 2)) : escapeHtml(String(details))}</div>
            </td>
          </tr>
        ` : ''}
      `;
    });

    tbody.innerHTML = html;
  }

  function renderPagination() {
    const pag = document.getElementById('pagination');
    if (!pag) return;

    const totalPages = Math.ceil(total / perPage) || 1;
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button>`;

    const maxShow = 5;
    let startP = Math.max(1, page - Math.floor(maxShow / 2));
    let endP = Math.min(totalPages, startP + maxShow - 1);
    if (endP - startP < maxShow - 1) startP = Math.max(1, endP - maxShow + 1);

    if (startP > 1) html += `<button class="page-btn" data-page="1">1</button><span style="color:var(--text-tertiary);padding:0 4px;">…</span>`;
    for (let i = startP; i <= endP; i++) {
      html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (endP < totalPages) html += `<span style="color:var(--text-tertiary);padding:0 4px;">…</span><button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;

    html += `<button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next →</button>`;
    pag.innerHTML = html;
  }

  async function loadLogs() {
    try {
      const params = {
        page,
        limit: perPage,
        category: filters.category || undefined,
        user: filters.user || undefined,
        search: filters.search || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined
      };
      const data = await window.ALPApi.getAuditLogs(params);
      logs = data.logs || data.items || data || [];
      total = data.total || logs.length;
      expandedRow = null;
      renderTable();
      renderPagination();
    } catch (err) {
      console.error('Load logs error:', err);
      const tbody = document.getElementById('logs-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-loading" style="color:#ef4444;">Failed to load logs</td></tr>';
    }
  }

  async function loadUsers() {
    try {
      const data = await window.ALPApi.getUsers();
      const users = data.users || data || [];
      const select = document.getElementById('filter-user');
      if (select) {
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.username;
          opt.textContent = u.username;
          select.appendChild(opt);
        });
      }
    } catch (e) { /* ignore */ }
  }

  function init() {
    loadLogs();
    loadUsers();

    // Search
    const searchInput = document.getElementById('logs-search');
    if (searchInput) {
      let debounce = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { filters.search = searchInput.value; page = 1; loadLogs(); }, 300);
      });
    }

    // Filters
    ['filter-category', 'filter-user'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { filters[id.replace('filter-', '')] = el.value; page = 1; loadLogs(); });
    });

    // Date filters
    const dateFrom = document.getElementById('filter-date-from');
    const dateTo = document.getElementById('filter-date-to');
    if (dateFrom) dateFrom.addEventListener('change', () => { filters.from = dateFrom.value; page = 1; loadLogs(); });
    if (dateTo) dateTo.addEventListener('change', () => { filters.to = dateTo.value; page = 1; loadLogs(); });

    // Table row expand
    const tbody = document.getElementById('logs-body');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const expandBtn = e.target.closest('.expand-btn');
        const row = e.target.closest('.log-row');
        if (expandBtn || row) {
          const idx = parseInt((expandBtn || row).dataset.idx);
          expandedRow = expandedRow === idx ? null : idx;
          renderTable();
        }
      });
    }

    // Pagination
    const pag = document.getElementById('pagination');
    if (pag) {
      pag.addEventListener('click', (e) => {
        const btn = e.target.closest('.page-btn');
        if (btn && !btn.disabled) {
          page = parseInt(btn.dataset.page);
          loadLogs();
        }
      });
    }

    // Clear logs
    const clearBtn = document.getElementById('clear-logs-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.showModal({
          title: 'Clear Old Logs',
          content: `
            <p style="color:var(--text-secondary);font-size:14px;margin:0 0 14px;">This will permanently delete audit logs older than 30 days. This action cannot be undone.</p>
            <p style="color:#ef4444;font-size:13px;margin:0;">⚠️ Proceed with caution.</p>
          `,
          onConfirm: async () => {
            try {
              await window.ALPApi.clearOldLogs();
              window.showToast('Old logs cleared', 'success');
              page = 1;
              await loadLogs();
            } catch (err) { window.showToast('Failed to clear logs', 'error'); }
          }
        });
      });
    }
  }

  function destroy() {
    logs = [];
    total = 0;
    page = 1;
    filters = { category: '', user: '', search: '', from: '', to: '' };
    expandedRow = null;
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') {
  window.LogsPage = LogsPage;
}
