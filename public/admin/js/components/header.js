/**
 * ALP - Header Component
 * Top navigation bar with page title, search, theme switcher, notification indicator, and user info
 */
const ALPHeader = (() => {

  function renderHeader(title = 'Dashboard', subtitle = '') {
    const user = window.ALPAuth.getUser();
    const username = user ? user.username : 'Admin';
    const role = user ? user.role : 'Viewer';
    const avatarColor = user ? (user.avatar_color || '#D4AF37') : '#D4AF37';
    const initials = username.slice(0, 2).toUpperCase();

    return `
      <div class="header-left">
        <button class="mobile-menu-btn" id="mobile-menu-toggle" aria-label="Toggle Sidebar">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
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

        <!-- Global Search (handled in page modules if needed) -->
        <div class="header-search">
          <svg class="header-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="header-search-input" id="global-search-input" placeholder="Search sessions or logs..." />
          <span class="header-search-shortcut">⌘K</span>
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

        <!-- Settings Button -->
        <button class="header-action" id="header-settings-btn" onclick="window.location.hash='#/settings'" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>

        <!-- User Profile Wrapper -->
        <div class="header-user" id="header-user-profile" onclick="window.location.hash='#/settings'" title="Settings">
          <div class="header-user-avatar" style="background: ${avatarColor}">${initials}</div>
          <div class="header-user-info">
            <div class="header-user-name">${username}</div>
            <div class="header-user-role">${role.replace('_', ' ')}</div>
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
      const toggleMenu = () => {
        menuToggle.classList.toggle('active');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
      };

      menuToggle.addEventListener('click', toggleMenu);
      overlay.addEventListener('click', toggleMenu);
    }

    // Global Search keyboard shortcuts (Cmd+K or Ctrl+K)
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) searchInput.focus();
      }
    });

    // Global search input handling
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        // Dispatches search event so page modules can listen if they want
        const event = new CustomEvent('global-search', { detail: query });
        window.dispatchEvent(event);
      });
    }

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
