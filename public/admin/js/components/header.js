/**
 * ALP - Header Component
 * Top navigation bar with page title, search, theme switcher, notification indicator, and user info
 */
const ALPHeader = (() => {

  function renderHeader(title = 'Dashboard', subtitle = '') {
    const user = window.ALPAuth.getUser();
    const username = user ? user.username : 'Admin';
    const role = user ? user.role : 'viewer';
    const avatarColor = user ? (user.avatar_color || '#D4AF37') : '#D4AF37';
    const initials = username.slice(0, 2).toUpperCase();

    // Role badge config
    const roleBadgeMap = {
      god: {
        cls: 'role-badge-god',
        icon: '👑',
        label: 'God',
        avatarRing: '0 0 0 2px #1a1600, 0 0 0 4px #D4AF37, 0 0 12px rgba(212,175,55,0.5)'
      },
      super_admin: {
        cls: 'role-badge-super-admin',
        icon: '⭐',
        label: 'Super Admin',
        avatarRing: '0 0 0 2px #120c1f, 0 0 0 4px #8b5cf6, 0 0 10px rgba(139,92,246,0.4)'
      }
    };
    const badge = roleBadgeMap[role];
    const roleBadgeHtml = badge
      ? `<span class="role-badge ${badge.cls}" title="${badge.label}">${badge.icon} ${badge.label}</span>`
      : '';
    const roleLabel = badge ? badge.label : role.replace(/_/g, ' ');
    const avatarExtraStyle = badge ? `box-shadow: ${badge.avatarRing};` : '';

    return `
      <div class="header-left">
        <button class="mobile-menu-btn" id="mobile-menu-toggle" aria-label="Toggle Sidebar">
          <svg class="icon-menu-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/>
          </svg>
          <svg class="icon-menu-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="header-title-container">
          <span class="header-title" id="header-page-title">${title}</span>
          ${subtitle ? `<span class="header-subtitle" id="header-page-subtitle">${subtitle}</span>` : ''}
        </div>
      </div>


      <div class="header-right">
        <!-- Developer Telegram Badge -->
        <a href="https://t.me/itstheoutlaws" target="_blank" rel="noopener" class="header-telegram-badge" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(0,136,204,0.12);border:1px solid rgba(0,136,204,0.3);border-radius:20px;color:#38bdf8;font-size:11px;font-weight:700;text-decoration:none;transition:all 0.2s;" title="Join Telegram Channel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.93 7.17-1.7 8.02c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.52.26l.18-2.65 4.74-4.28c.21-.18-.04-.28-.32-.1L7.9 14.38l-2.55-.8c-.55-.17-.56-.55.12-.82l9.95-3.84c.46-.17.86.1.51.75z" fill="#0088cc"/></svg>
          <span>@itstheoutlaws</span>
        </a>

        <!-- Live Connection Status -->
        <div id="connection-indicator" class="connection-indicator connection-disconnected hidden">
          <span style="color:var(--color-error);font-size:10px;margin-right:6px">●</span>Disconnected
        </div>

        <!-- Global Smart Search -->
        <div class="header-search" id="header-search-wrapper">
          <svg class="header-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="header-search-input" id="global-search-input" placeholder="Search pages, sites, sessions… ⌘K" autocomplete="off" spellcheck="false" />
        </div>

        <!-- Theme Toggle -->
        <button class="theme-toggle theme-toggle-btn" id="theme-toggle-btn" title="Toggle Theme">
          <!-- Sun Icon (for Light theme) -->
          <svg class="icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <!-- Moon Icon (for Dark theme) -->
          <svg class="icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
        </button>

        <!-- Notification Bell -->
        <button class="header-action" id="header-notifications-btn" onclick="window.location.hash='#/notifications'" title="Notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span class="notification-dot" id="header-notification-badge" style="display:none;"></span>
        </button>

        <!-- Danger Bell — flagged domains + VPS issues -->
        <div class="header-danger-wrap" id="header-danger-wrap">
          <button class="header-action header-action-danger" id="header-danger-btn" title="Threats">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="danger-count-badge" id="header-danger-badge" style="display:none;">0</span>
          </button>
          <div class="danger-dropdown" id="header-danger-dropdown" style="display:none;"></div>
        </div>

        <!-- Settings Button -->
        <button class="header-action" id="header-settings-btn" onclick="window.location.hash='#/settings'" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>

        <!-- User Profile Wrapper -->
        <div class="header-user" id="header-user-profile" onclick="window.location.hash='#/settings'" title="Settings">
          <div class="header-user-avatar" style="background: ${avatarColor}; ${avatarExtraStyle}">${initials}</div>
          <div class="header-user-info">
            <div class="header-user-name" style="display:flex;align-items:center;gap:5px;">
              ${username}
              ${roleBadgeHtml}
            </div>
            <div class="header-user-role">${roleLabel}</div>
          </div>
        </div>

        <!-- Logout Button -->
        <button class="header-action header-logout-btn" id="header-logout-btn" title="Sign Out">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    `;
  }

  function initHeader() {
    // Theme toggle handler
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        window.ALPTheme.toggle();
      });
    }

    // Logout handler
    const logoutBtn = document.getElementById('header-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.ALPAuth.logout();
      });
    }

    // Mobile menu toggle
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (menuToggle && sidebar && overlay) {
      const openIcon = menuToggle.querySelector('.icon-menu-open');
      const closeIcon = menuToggle.querySelector('.icon-menu-close');
      
      const toggleMenu = () => {
        const isOpen = sidebar.classList.toggle('open');
        menuToggle.classList.toggle('active', isOpen);
        overlay.classList.toggle('active', isOpen);
        if (openIcon && closeIcon) {
          openIcon.style.display = isOpen ? 'none' : 'block';
          closeIcon.style.display = isOpen ? 'block' : 'none';
        }
      };

      menuToggle.addEventListener('click', toggleMenu);
      overlay.addEventListener('click', toggleMenu);
    }


    // ⌘K / Ctrl+K focus shortcut
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const inp = document.getElementById('global-search-input');
        if (inp) { inp.focus(); inp.select(); }
      }
    });

    // Smart search
    _initSmartSearch();

    // Danger bell (flagged domains + VPS issues)
    _initDangerBell();

    // Apply theme icons immediately
    const currentTheme = window.ALPTheme.get();
    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
      if (currentTheme === 'dark') {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      }
    }
  }

  // ─── Smart Search ─────────────────────────────────────────────────────────

  function _escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }

  const NAV_ITEMS = [
    { label: 'Dashboard',      hash: '#/dashboard',      icon: 'grid',      kw: 'home stats overview' },
    { label: 'Live Sessions',  hash: '#/sessions',       icon: 'users',     kw: 'visitors active live traffic' },
    { label: 'Captured Data',  hash: '#/captured-data',  icon: 'file-text', kw: 'forms data submissions leads capture' },
    { label: 'Funnel Builder', hash: '#/funnel',         icon: 'filter',    kw: 'funnel steps flow builder' },
    { label: 'Demo Pages',     hash: '#/demo-pages',     icon: 'layout',    kw: 'pages html editor files' },
    { label: 'Analytics',      hash: '#/analytics',      icon: 'bar-chart', kw: 'charts traffic views visitors stats' },
    { label: 'IP Blocking',    hash: '#/ip-blocking',    icon: 'shield-off',kw: 'block ban ip security firewall' },
    { label: 'Rate Limits',    hash: '#/rate-limits',    icon: 'activity',  kw: 'rate limit throttle requests' },
    { label: 'Firewall Rules', hash: '#/firewall-rules', icon: 'shield',    kw: 'firewall rules redirect security' },
    { label: 'Notifications',  hash: '#/notifications',  icon: 'bell',      kw: 'alerts notifications messages' },
    { label: 'Logs',           hash: '#/logs',           icon: 'list',      kw: 'audit logs history events activity' },
    { label: 'Settings',       hash: '#/settings',       icon: 'settings',  kw: 'settings config preferences sound telegram api key' },
    { label: 'Domains',        hash: '#/domains',        icon: 'globe',     kw: 'domains custom domain routing ssl' },
  ];

  const NAV_ICONS = {
    'grid':       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    'users':      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
    'file-text':  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    'filter':     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    'layout':     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
    'bar-chart':  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    'shield-off': `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    'activity':   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    'shield':     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    'bell':       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>`,
    'list':       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    'settings':   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004 16.2a1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 008 4.68V4a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    'globe':      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  };

  function _initSmartSearch() {
    const input = document.getElementById('global-search-input');
    const wrapper = document.getElementById('header-search-wrapper');
    if (!input || !wrapper) return;

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'global-search-dropdown';
    dropdown.style.display = 'none';
    wrapper.appendChild(dropdown);

    let debounceTimer = null;
    let allResults = [];  // [{hash}] indexed same as .gsd-item[data-idx]
    let activeIdx = -1;

    function getToken() {
      return localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token') || '';
    }

    function apiFetch(path) {
      return fetch(`${window.location.origin}${path}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      }).then(r => r.ok ? r.json() : null).catch(() => null);
    }

    function highlight(text, q) {
      if (!q || !text) return text;
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(`(${safe})`, 'gi'), '<mark class="gsd-highlight">$1</mark>');
    }

    function matchNavItems(q) {
      const lq = q.toLowerCase();
      return NAV_ITEMS.filter(n =>
        n.label.toLowerCase().includes(lq) || n.kw.includes(lq)
      ).slice(0, 5);
    }

    function buildDropdown(navItems, websites, sessions, q) {
      const parts = [];
      allResults = [];

      if (navItems.length) {
        parts.push(`<div class="gsd-section-label">Pages</div>`);
        navItems.forEach(item => {
          const idx = allResults.length;
          allResults.push({ hash: item.hash });
          parts.push(`<div class="gsd-item" data-idx="${idx}">
            <span class="gsd-item-icon">${NAV_ICONS[item.icon] || ''}</span>
            <span class="gsd-item-label">${highlight(_escHtml(item.label), q)}</span>
            <span class="gsd-item-shortcut">Go →</span>
          </div>`);
        });
      }

      if (websites && websites.length) {
        parts.push(`<div class="gsd-section-label">Websites</div>`);
        websites.forEach(site => {
          const idx = allResults.length;
          const live = site.is_active === 1 || site.is_active === true;
          allResults.push({ hash: '#/sessions?website=' + site.id });
          parts.push(`<div class="gsd-item" data-idx="${idx}">
            <span class="gsd-item-dot" style="background:${live ? '#10b981' : '#64748b'}"></span>
            <span class="gsd-item-label">${highlight(_escHtml(site.name), q)}</span>
            <span class="gsd-item-meta">${highlight(_escHtml(site.domain || ''), q)}</span>
            <span class="gsd-item-badge" style="color:${live ? '#10b981' : '#64748b'}">${live ? 'Live' : 'Off'}</span>
          </div>`);
        });
      }

      if (sessions && sessions.length) {
        parts.push(`<div class="gsd-section-label">Sessions</div>`);
        sessions.forEach(s => {
          const idx = allResults.length;
          allResults.push({ hash: '#/sessions?id=' + s.id });
          const ip = _escHtml(s.ip_address || 'Unknown');
          const cty = s.country ? _escHtml(s.country) + ' · ' : '';
          const vid = s.visitor_id ? _escHtml(s.visitor_id.slice(0, 8)) : '';
          parts.push(`<div class="gsd-item" data-idx="${idx}">
            <span class="gsd-item-icon" style="color:#3b82f6"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></span>
            <span class="gsd-item-label">${highlight(ip, q)}</span>
            <span class="gsd-item-meta">${cty}${highlight(vid, q)}</span>
            <span class="gsd-item-badge" style="color:${s.is_active ? '#10b981' : '#64748b'}">${s.is_active ? 'Live' : 'Ended'}</span>
          </div>`);
        });
      }

      if (!parts.length) {
        parts.push(`<div class="gsd-empty">No results for "<strong>${_escHtml(q)}</strong>"</div>`);
      }

      dropdown.innerHTML = parts.join('');
      activeIdx = -1;
      dropdown.style.display = 'block';

      // Bind click + hover on items
      dropdown.querySelectorAll('.gsd-item').forEach(el => {
        el.addEventListener('click', () => {
          const r = allResults[parseInt(el.dataset.idx, 10)];
          if (r) window.location.hash = r.hash;
          closeDropdown();
          input.value = '';
          input.blur();
        });
        el.addEventListener('mouseenter', () => {
          clearActive();
          el.classList.add('active');
          activeIdx = parseInt(el.dataset.idx, 10);
        });
      });
    }

    function clearActive() {
      dropdown.querySelectorAll('.gsd-item.active').forEach(e => e.classList.remove('active'));
    }

    function closeDropdown() {
      dropdown.style.display = 'none';
      activeIdx = -1;
    }

    async function runSearch(q) {
      if (!q) { closeDropdown(); return; }

      // Instant nav results
      const navItems = matchNavItems(q);
      buildDropdown(navItems, [], [], q);

      // Async: websites + sessions in parallel (bypass loading bar)
      const [webData, sessData] = await Promise.all([
        apiFetch('/api/websites'),
        apiFetch(`/api/sessions?search=${encodeURIComponent(q)}&limit=5`),
      ]);

      const lq = q.toLowerCase();
      const websites = webData && webData.websites
        ? webData.websites.filter(w =>
            (w.name || '').toLowerCase().includes(lq) ||
            (w.domain || '').toLowerCase().includes(lq)
          ).slice(0, 4)
        : [];

      const sessions = sessData && sessData.sessions
        ? sessData.sessions.slice(0, 4)
        : [];

      buildDropdown(navItems, websites, sessions, q);
    }

    // Input → debounce
    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(debounceTimer);
      if (!q) { closeDropdown(); return; }
      debounceTimer = setTimeout(() => runSearch(q), 280);
      // legacy event
      window.dispatchEvent(new CustomEvent('global-search', { detail: q }));
    });

    // Focus: re-run if there's a pending query
    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (q) runSearch(q);
    });

    // Keyboard nav
    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.gsd-item');
      if (e.key === 'Escape') {
        closeDropdown();
        input.blur();
        return;
      }
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, allResults.length - 1);
        clearActive();
        items[activeIdx]?.classList.add('active');
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        clearActive();
        items[activeIdx]?.classList.add('active');
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && activeIdx >= 0 && allResults[activeIdx]) {
        e.preventDefault();
        window.location.hash = allResults[activeIdx].hash;
        input.value = '';
        closeDropdown();
        input.blur();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) closeDropdown();
    });
  }

  // ─── Danger Bell (flagged domains + VPS issues) ──────────────────────────

  let _dangerPollTimer = null;

  async function _fetchDangerState() {
    try {
      const [dRes, vRes] = await Promise.all([
        window.ALPApi._request('GET', '/api/domains'),
        window.ALPApi._request('GET', '/api/website-deploy/vps-list').catch(() => null),
      ]);
      const domains = (dRes && dRes.domains) || [];
      const vpsRaw = vRes && (vRes.websites || (Array.isArray(vRes) ? vRes : []));
      const vpsList = Array.isArray(vpsRaw) ? vpsRaw : [];

      const flaggedDomains = domains.filter(d => d.flagged);

      // VPS is "flagged" if any of its live domains is flagged, or if any is
      // unreachable (uptime_ok === 0) — group by hosting_provider IP.
      const vpsByHost = {};
      for (const v of vpsList) {
        if (!v.vps_host) continue;
        vpsByHost[v.vps_host] = vpsByHost[v.vps_host] || { host: v.vps_host, sites: [], flaggedDomains: [], downDomains: [] };
        vpsByHost[v.vps_host].sites.push(v.name || v.demo_slug || `#${v.id}`);
      }
      // Attribute domain trouble → VPS by looking at hosting_provider === 'vps'
      // and matching the domain to a website (via website_id → vps_host).
      // For MVP we just group VPS-hosted flagged domains onto their VPS host
      // (fall back to attaching to "unknown" if we can't resolve the host).
      const wsById = {};
      for (const v of vpsList) if (v.id) wsById[v.id] = v;
      for (const d of domains) {
        if (d.hosting_provider !== 'vps') continue;
        const w = d.website_id ? wsById[d.website_id] : null;
        const host = w ? w.vps_host : '(unknown vps)';
        vpsByHost[host] = vpsByHost[host] || { host, sites: [], flaggedDomains: [], downDomains: [] };
        if (d.flagged) vpsByHost[host].flaggedDomains.push(d);
        else if (d.uptime_ok === 0) vpsByHost[host].downDomains.push(d);
      }
      const troubledVps = Object.values(vpsByHost)
        .filter(g => g.flaggedDomains.length || g.downDomains.length);

      return { flaggedDomains, troubledVps };
    } catch (e) {
      return { flaggedDomains: [], troubledVps: [] };
    }
  }

  function _renderDangerDropdown(state) {
    const { flaggedDomains, troubledVps } = state;
    const total = flaggedDomains.length + troubledVps.length;

    if (total === 0) {
      return `
        <div class="danger-dd-header">
          <span class="danger-dd-title">All clear</span>
        </div>
        <div class="danger-dd-empty">
          <div class="danger-dd-empty-icon">✓</div>
          <div>No flagged domains or VPS issues.</div>
        </div>
      `;
    }

    const parts = [];
    parts.push(`
      <div class="danger-dd-header">
        <span class="danger-dd-title">Threats · ${total}</span>
        <a class="danger-dd-viewall" href="#/domains">View all →</a>
      </div>
    `);

    if (flaggedDomains.length) {
      parts.push(`<div class="danger-dd-section-label">Dangerous domain flagged · ${flaggedDomains.length}</div>`);
      for (const d of flaggedDomains.slice(0, 8)) {
        const reason = d.flag_reason || 'flagged by security vendor';
        const detected = d.flag_detected_at ? _dTimeAgo(d.flag_detected_at) : '';
        parts.push(`
          <a class="danger-dd-item" href="#/domains?flagged=1">
            <span class="danger-dd-item-dot"></span>
            <div class="danger-dd-item-body">
              <div class="danger-dd-item-title">${_escHtml(d.domain)}</div>
              <div class="danger-dd-item-meta">${_escHtml(reason)}${detected ? ' · ' + detected : ''}</div>
            </div>
          </a>
        `);
      }
      if (flaggedDomains.length > 8) {
        parts.push(`<div class="danger-dd-more">+${flaggedDomains.length - 8} more flagged</div>`);
      }
    }

    if (troubledVps.length) {
      parts.push(`<div class="danger-dd-section-label">VPS flagged · ${troubledVps.length}</div>`);
      for (const g of troubledVps.slice(0, 6)) {
        const badges = [];
        if (g.flaggedDomains.length) badges.push(`${g.flaggedDomains.length} flagged`);
        if (g.downDomains.length)    badges.push(`${g.downDomains.length} down`);
        const sites = g.sites.slice(0, 2).join(', ') + (g.sites.length > 2 ? ` +${g.sites.length - 2}` : '');
        parts.push(`
          <a class="danger-dd-item" href="#/domains">
            <span class="danger-dd-item-dot"></span>
            <div class="danger-dd-item-body">
              <div class="danger-dd-item-title">${_escHtml(g.host)}</div>
              <div class="danger-dd-item-meta">${_escHtml(badges.join(' · '))}${sites ? ' · ' + _escHtml(sites) : ''}</div>
            </div>
          </a>
        `);
      }
    }
    return parts.join('');
  }

  function _dTimeAgo(dateStr) {
    if (!dateStr) return '';
    const t = new Date(String(dateStr).includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z').getTime();
    if (!t) return '';
    const diff = Math.max(0, Date.now() - t);
    const s = Math.floor(diff / 1000);
    if (s < 60)  return 'just now';
    const m = Math.floor(s / 60);   if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);   if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  async function _refreshDangerBell() {
    const btn      = document.getElementById('header-danger-btn');
    const badge    = document.getElementById('header-danger-badge');
    const dropdown = document.getElementById('header-danger-dropdown');
    if (!btn || !badge || !dropdown) return;

    const state = await _fetchDangerState();
    const total = state.flaggedDomains.length + state.troubledVps.length;

    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = 'inline-flex';
      btn.classList.add('has-danger');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('has-danger');
    }
    // Re-render dropdown content in place (only re-populates; visibility unchanged)
    dropdown.innerHTML = _renderDangerDropdown(state);
  }

  function _initDangerBell() {
    const wrap     = document.getElementById('header-danger-wrap');
    const btn      = document.getElementById('header-danger-btn');
    const dropdown = document.getElementById('header-danger-dropdown');
    if (!wrap || !btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.style.display === 'block';
      if (open) {
        dropdown.style.display = 'none';
      } else {
        dropdown.style.display = 'block';
        _refreshDangerBell();
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) dropdown.style.display = 'none';
    });

    // Initial load + poll every 60s
    _refreshDangerBell();
    if (_dangerPollTimer) clearInterval(_dangerPollTimer);
    _dangerPollTimer = setInterval(_refreshDangerBell, 60_000);
  }

  function setTitle(title, subtitle = '') {
    const titleEl = document.getElementById('header-page-title');
    const subtitleEl = document.getElementById('header-page-subtitle');
    
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) {
      if (subtitle) {
        subtitleEl.textContent = subtitle;
        subtitleEl.style.display = 'inline';
      } else {
        subtitleEl.style.display = 'none';
      }
    }
  }

  return { renderHeader, initHeader, setTitle };
})();

// Export globally
window.ALPHeader = ALPHeader;
