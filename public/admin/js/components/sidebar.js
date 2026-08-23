/**
 * ALP - Sidebar Component
 * Sidebar navigation with active state tracking and notification subscription.
 * All visual styling lives in layout.css / theme-light.css — no inline styles.
 */
const ALPSidebar = (() => {
  const COLLAPSE_KEY = 'alp_sidebar_collapsed';

  // ── Icon library ───────────────────────────────────────────────
  // stroke="currentColor" everywhere — icons inherit theme text color.
  const ICONS = {
    dashboard: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
    sessions: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
    websites: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
    domains: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>`,
    vps: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/><circle cx="6" cy="18" r="1.5" fill="currentColor"/><line x1="11" y1="6" x2="18" y2="6"/><line x1="11" y1="18" x2="18" y2="18"/></svg>`,
    captured: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    funnel: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    analytics: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    bin: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5"/></svg>`,
    cc: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M7 15h4"/><path d="M15 15l2 2 4-4"/></svg>`,
    ipblock: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    rate: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    firewall: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    logs: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    settings: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    users: `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
    telegram: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.93 7.17-1.7 8.02c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.52.26l.18-2.65 4.74-4.28c.21-.18-.04-.28-.32-.1L7.9 14.38l-2.55-.8c-.55-.17-.56-.55.12-.82l9.95-3.84c.46-.17.86.1.51.75z" fill="currentColor"/></svg>`,
    star: `<svg class="nav-god-star" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,
    // Role glyphs — SVG replaces emoji so Windows renders match Mac/iOS.
    crown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4 4 5-8 5 8 4-4v10H3V8zm0 12h18v2H3v-2z"/></svg>`,
    starPill: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,
    wrench: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14.7 6.3a4 4 0 015.7 5.7l-1.4 1.4-5.7-5.7 1.4-1.4z"/><path d="M13.3 7.7L3 18v3h3l10.3-10.3"/></svg>`,
    chevron: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`,
    logo: `<span class="sidebar-logo-symbol" aria-hidden="true">$</span>`,
  };

  // ── Nav data ───────────────────────────────────────────────────
  // gate: undefined = access-controlled via canAccess only
  //       'god' = god only    'super_admin' = super_admin or god
  const NAV = [
    { group: 'Monitoring' },
    { page: 'dashboard',       label: 'Dashboard',       icon: 'dashboard' },
    { page: 'sessions',        label: 'Live Sessions',   icon: 'sessions',  pulse: true },

    { group: 'Control' },
    { page: 'demo-pages',      label: 'Websites',        icon: 'websites',  gate: 'super_admin' },
    { page: 'domains',         label: 'Domains',         icon: 'domains' },
    { page: 'vps',             label: 'VPSs',            icon: 'vps' },
    { page: 'captured-data',   label: 'Captured Data',   icon: 'captured' },
    { page: 'funnel',          label: 'Funnel Builder',  icon: 'funnel',    gate: 'god' },
    { page: 'analytics',       label: 'Analytics',       icon: 'analytics' },

    { group: 'Card Tools' },
    { page: 'bin-lookup',      label: 'BIN Lookup',      icon: 'bin' },
    { page: 'cc-checker',      label: 'CC Checker',      icon: 'cc' },

    { group: 'Security' },
    { page: 'ip-blocking',     label: 'IP Blocking',     icon: 'ipblock' },
    { page: 'rate-limits',     label: 'Rate Limits',     icon: 'rate' },
    { page: 'firewall-rules',  label: 'Firewall Rules',  icon: 'firewall' },

    { group: 'System' },
    { page: 'logs',            label: 'Audit Logs',      icon: 'logs' },
    { page: 'settings',        label: 'Settings',        icon: 'settings' },
    { page: 'user-management', label: 'User Management', icon: 'users',     gate: 'god' },
  ];

  const ROLE_PILL = {
    god:         { cls: 'sidebar-role-pill-god',        icon: ICONS.crown,    label: 'God Admin'   },
    super_admin: { cls: 'sidebar-role-pill-super-admin', icon: ICONS.starPill, label: 'Super Admin' },
    admin:       { cls: 'sidebar-role-pill-admin',       icon: ICONS.wrench,   label: 'Admin'       },
  };

  // ── Visibility predicate — single source of truth for gating ───
  // Rule: role gate is the outer check. If the user's role satisfies the gate,
  // canAccess() decides for non-god users; god passes canAccess implicitly
  // (matches the original behavior where god-only items skipped canAccess).
  function visibleTo(item) {
    if (!item.page) return true; // group headers always render
    const auth = window.ALPAuth;
    if (!auth) return true;
    const isGod = auth.isGod && auth.isGod();
    const isSuper = auth.isSuperAdmin && auth.isSuperAdmin();
    if (item.gate === 'god'         && !isGod) return false;
    if (item.gate === 'super_admin' && !isGod && !isSuper) return false;
    if (isGod) return true;
    if (auth.canAccess && !auth.canAccess(item.page)) return false;
    return true;
  }

  function _renderItem(item) {
    if (item.group) return `<div class="sidebar-nav-label">${item.group}</div>`;
    const icon  = ICONS[item.icon] || '';
    const pulse = item.pulse ? '<span class="pulse-dot" aria-hidden="true"></span>' : '';
    const star  = item.gate === 'god'
      ? `<span class="nav-god-star-wrap" title="God admin only" aria-hidden="true">${ICONS.star}</span>`
      : '';
    return `<a href="#/${item.page}" class="sidebar-nav-item" data-page="${item.page}">
      ${icon}
      <span class="nav-label">${item.label}</span>
      ${pulse}
      ${star}
    </a>`;
  }

  function _renderRolePill() {
    const u = window.ALPAuth && window.ALPAuth.getUser();
    if (!u) return '';
    const r = ROLE_PILL[u.role];
    if (!r) return '';
    return `<div class="sidebar-role-pill ${r.cls}" role="status">
      <span class="sidebar-role-pill-icon" aria-hidden="true">${r.icon}</span>
      <span class="sidebar-role-pill-name">${u.username}</span>
      <span class="sidebar-role-pill-label">${r.label}</span>
    </div>`;
  }

  function renderSidebar() {
    const items = NAV.filter(visibleTo).map(_renderItem).join('');
    return `
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">${ICONS.logo}</div>
        <div class="sidebar-logo-text-wrap">
          <div class="sidebar-logo-text">OutLaws</div>
        </div>
        <button class="sidebar-collapse-btn" id="sidebar-collapse-btn"
                type="button"
                aria-label="Collapse sidebar"
                aria-controls="sidebar"
                aria-expanded="true">
          ${ICONS.chevron}
        </button>
      </div>

      <nav class="sidebar-nav" aria-label="Primary">
        ${items}
      </nav>

      <div class="sidebar-footer">
        ${_renderRolePill()}
        <a href="https://t.me/itstheoutlaws"
           class="sidebar-telegram-card"
           target="_blank" rel="noopener"
           title="ALP by @itstheoutlaws on Telegram">
          ${ICONS.telegram}
          <div class="sidebar-telegram-body">
            <div class="sidebar-telegram-title">@itstheoutlaws</div>
            <div class="sidebar-telegram-sub">Official Telegram Channel</div>
          </div>
        </a>
      </div>
    `;
  }

  // ── Init: idempotent — tears down previous listeners on re-render ──
  const _teardown = [];
  function _clearListeners() {
    while (_teardown.length) { try { _teardown.pop()(); } catch (_) {} }
  }
  function _on(target, event, handler, opts) {
    target.addEventListener(event, handler, opts);
    _teardown.push(() => target.removeEventListener(event, handler, opts));
  }

  let _tip = null;
  const _hideTip = () => { if (_tip) { _tip.remove(); _tip = null; } };

  function initSidebar() {
    _clearListeners();
    _hideTip();

    // Data-title mirrors the label for CSS/JS tooltips in collapsed rail.
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      const label = item.querySelector('.nav-label');
      const text  = label ? label.textContent.trim() : '';
      if (text) item.setAttribute('data-title', text);

      _on(item, 'mouseenter', () => {
        if (!document.body.classList.contains('sidebar-collapsed')) return;
        if (window.matchMedia('(max-width: 768px)').matches) return;
        if (!text) return;
        _hideTip();
        const rect = item.getBoundingClientRect();
        _tip = document.createElement('div');
        _tip.className = 'alp-nav-tooltip';
        _tip.textContent = text;
        _tip.style.top  = (rect.top + rect.height / 2) + 'px';
        _tip.style.left = (rect.right + 12) + 'px';
        document.body.appendChild(_tip);
        requestAnimationFrame(() => _tip && _tip.classList.add('visible'));
      });
      _on(item, 'mouseleave', _hideTip);
      _on(item, 'click', _hideTip);
    });
    _on(window, 'scroll', _hideTip, true);
    _on(window, 'resize', _hideTip);

    // Collapse toggle — persisted in localStorage. Chevron rotation is CSS.
    const applyCollapsed = (on) => {
      document.body.classList.toggle('sidebar-collapsed', on);
      const btn = document.getElementById('sidebar-collapse-btn');
      if (btn) {
        btn.title = on ? 'Expand sidebar' : 'Collapse sidebar';
        btn.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
        btn.setAttribute('aria-expanded', on ? 'false' : 'true');
      }
    };
    applyCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');

    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
      _on(collapseBtn, 'click', () => {
        const next = !document.body.classList.contains('sidebar-collapsed');
        applyCollapsed(next);
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      });
    }

    // Subscribe to shared notifications store. subscribe() fires immediately
    // with the current count, so no separate initial fetch needed.
    if (window.ALPNotifications) {
      const unsub = window.ALPNotifications.subscribe(_paintBadge);
      _teardown.push(unsub);
    }
  }

  // ── Active-state tracking (prefix match so sub-routes still highlight) ──
  function updateActiveNav(page) {
    const target = String(page || '').split('/')[0];
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      const itemPage = item.getAttribute('data-page');
      const match = itemPage === target;
      item.classList.toggle('active', match);
      if (match) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  // ── Notification badge painter — driven by ALPNotifications store ──
  // Pops when the count transitions from 0 → positive; a bump from n → n+1
  // is silent so it isn't distracting during an active session.
  let _lastBadgeCount = 0;
  function _paintBadge(count) {
    const badge = document.getElementById('sidebar-notification-badge');
    if (!badge) { _lastBadgeCount = count; return; }
    const rose = _lastBadgeCount === 0 && count > 0;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
      if (rose) {
        badge.classList.remove('just-appeared');
        void badge.offsetWidth; // restart animation
        badge.classList.add('just-appeared');
      }
    } else {
      badge.style.display = 'none';
      badge.classList.remove('just-appeared');
    }
    _lastBadgeCount = count;
  }

  // Legacy shim — kept so app.js/notifications.js callsites keep working
  // during rollout. Just triggers the store; every subscriber repaints.
  function updateBadge() {
    if (window.ALPNotifications) return window.ALPNotifications.refresh();
  }

  return { renderSidebar, initSidebar, updateActiveNav, updateBadge, visibleTo, NAV };
})();

window.ALPSidebar = ALPSidebar;
