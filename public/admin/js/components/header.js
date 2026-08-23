/**
 * ALP - Header Component
 * Top navigation bar with page title, search, theme switcher, notification indicator, and user info
 */
const ALPHeader = (() => {

  function renderHeader(title = 'Dashboard', subtitle = '') {
    const user = window.ALPAuth.getUser();
    const username = user ? user.username : 'Admin';
    const role = user ? user.role : 'viewer';

    // Role badge config — icon + label + optional avatar ring (god / super_admin
    // only, so they visually pop out). Non-privileged roles get a subtle grey.
    const roleBadgeMap = {
      god: {
        cls: 'role-badge-god',
        icon: '👑',
        label: 'God',
        avatarRing: '0 0 0 2px #1a1600, 0 0 0 4px #D4AF37, 0 0 12px rgba(212,175,55,0.5)',
        badgeColor: '#D4AF37'
      },
      super_admin: {
        cls: 'role-badge-super-admin',
        icon: '⭐',
        label: 'Super Admin',
        avatarRing: '0 0 0 2px #120c1f, 0 0 0 4px #8b5cf6, 0 0 10px rgba(139,92,246,0.4)',
        badgeColor: '#8b5cf6'
      },
      admin: { icon: '🛡', label: 'Admin', badgeColor: '#10b981' },
      viewer: { icon: '👁', label: 'Viewer', badgeColor: '#94a3b8' },
    };
    const badge = roleBadgeMap[role];
    const roleBadgeHtml = (badge && badge.cls)
      ? `<span class="role-badge ${badge.cls}" title="${badge.label}">${badge.icon} ${badge.label}</span>`
      : '';
    const roleLabel = badge ? badge.label : role.replace(/_/g, ' ');
    const avatarExtraStyle = (badge && badge.avatarRing) ? `box-shadow: ${badge.avatarRing};` : '';

    // Session-style procedural face for the header avatar. The user's own
    // avatar_color (picked via the profile menu) wins over the role default,
    // so a user who chose e.g. teal keeps that even after a role change.
    const faceColor = (user && user.avatar_color) || (badge && badge.badgeColor) || '#94a3b8';
    // Face is seeded by user.avatar_seed if they've picked one, otherwise
    // by their username so the initial look is stable and identifiable.
    const faceSeed = (user && user.avatar_seed) || username;
    const faceHtml = (window.SessionTemplates && window.SessionTemplates.sessionFaceSvg)
      ? window.SessionTemplates.sessionFaceSvg(faceSeed, faceColor)
      : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:700;color:#fff;">${username.slice(0,2).toUpperCase()}</span>`;
    const faceBadge = badge && badge.icon ? `
      <span title="${badge.label}" style="position:absolute;bottom:-3px;right:-3px;width:16px;height:16px;border-radius:50%;background:${faceColor};color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--bg-primary),0 2px 6px rgba(0,0,0,.5);line-height:1;pointer-events:none;">${badge.icon}</span>` : '';
    const avatarInnerHtml = `
      <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;">${faceHtml}</div>
      ${faceBadge}`;

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

        <!-- Notification Bell (dropdown, mirrors the danger bell pattern) -->
        <div class="header-notif-wrap" id="header-notifications-wrap" style="position:relative;">
          <button class="header-action" id="header-notifications-btn" title="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span class="notif-count-badge" id="header-notification-badge" style="display:none;">0</span>
          </button>
          <div class="notif-dropdown" id="header-notifications-dropdown" style="display:none;"></div>
        </div>

        <!-- View-as-user (god only) — filter the whole panel to one user's data -->
        ${role === 'god' ? `
          <button class="header-action" id="header-view-as-btn" title="View panel as another user" style="position:relative;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>` : ''}

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

        <!-- User Profile Wrapper (click → dropdown menu) -->
        <div class="header-user" id="header-user-profile" title="Account menu" style="position:relative;">
          <div class="header-user-avatar" style="position:relative;overflow:visible;background:transparent;padding:0;${avatarExtraStyle}">${avatarInnerHtml}</div>
          <div class="header-user-info">
            <div class="header-user-name" style="display:flex;align-items:center;gap:5px;">
              ${username}
              ${roleBadgeHtml}
            </div>
            <div class="header-user-role">${roleLabel}</div>
          </div>
          <div id="header-profile-menu" class="header-profile-menu" style="display:none;"></div>
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

  // ── Profile dropdown ──────────────────────────────────────────────────────

  function _renderProfileMenu() {
    const user   = window.ALPAuth.getUser() || {};
    const isGod  = window.ALPAuth.isGod && window.ALPAuth.isGod();
    const isDark = (window.ALPTheme && window.ALPTheme.get && window.ALPTheme.get() === 'dark');
    const soundsOn = (localStorage.getItem('alp_sounds') !== '0');
    const sitesLine = user.role === 'god' ? 'All websites' : 'Your websites';

    return `
      <div class="header-profile-menu-inner">
        <div class="hpm-header">
          <div class="hpm-header-title">Signed in as</div>
          <div class="hpm-username">${_escHtml(user.username || '—')}</div>
          <div class="hpm-meta">${_escHtml(user.email || '')}</div>
          <div class="hpm-meta hpm-scope">${sitesLine}</div>
        </div>

        <button class="hpm-item" data-hpm-action="account">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Account settings</span>
        </button>

        <button class="hpm-item" data-hpm-action="password">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span>Change password</span>
        </button>

        <button class="hpm-item" data-hpm-action="avatar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
          <span>Change avatar</span>
        </button>

        <button class="hpm-item" data-hpm-action="theme">
          ${isDark
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`}
          <span>Switch to ${isDark ? 'light' : 'dark'} theme</span>
        </button>

        <button class="hpm-item" data-hpm-action="sounds">
          ${soundsOn
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M19 5a10 10 0 010 14"/></svg>`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`}
          <span>Notification sounds: ${soundsOn ? 'on' : 'off'}</span>
        </button>

        <div class="hpm-divider"></div>

        ${isGod ? `
          <button class="hpm-item" data-hpm-action="user-management">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <span>User management</span>
          </button>
          <div class="hpm-divider"></div>
        ` : ''}

        <button class="hpm-item hpm-item-danger" data-hpm-action="logout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>Sign out</span>
        </button>
      </div>
    `;
  }

  function _closeProfileMenu() {
    const menu = document.getElementById('header-profile-menu');
    if (menu) menu.style.display = 'none';
    document.removeEventListener('mousedown', _profileOutsideHandler, true);
    document.removeEventListener('keydown', _profileEscHandler);
  }

  function _profileOutsideHandler(e) {
    const wrap = document.getElementById('header-user-profile');
    if (!wrap || wrap.contains(e.target)) return;
    _closeProfileMenu();
  }

  function _profileEscHandler(e) {
    if (e.key === 'Escape') _closeProfileMenu();
  }

  function _openProfileMenu() {
    const menu = document.getElementById('header-profile-menu');
    if (!menu) return;
    menu.innerHTML = _renderProfileMenu();
    menu.style.display = 'block';
    // Delay listener so the opening click itself isn't caught.
    setTimeout(() => {
      document.addEventListener('mousedown', _profileOutsideHandler, true);
      document.addEventListener('keydown', _profileEscHandler);
    }, 0);
  }

  function _handleProfileAction(action) {
    _closeProfileMenu();
    switch (action) {
      case 'account':
        window.location.hash = '#/settings';
        break;
      case 'password':
        _openChangePasswordModal();
        break;
      case 'avatar':
        _openAvatarPickerModal();
        break;
      case 'theme':
        if (window.ALPTheme) window.ALPTheme.toggle();
        break;
      case 'sounds': {
        const cur = localStorage.getItem('alp_sounds') !== '0';
        localStorage.setItem('alp_sounds', cur ? '0' : '1');
        window.showToast && window.showToast(`Notification sounds ${cur ? 'muted' : 'unmuted'}`, 'info');
        break;
      }
      case 'user-management':
        window.location.hash = '#/user-management';
        break;
      case 'logout':
        _confirmLogout();
        break;
    }
  }

  function _confirmLogout() {
    if (!window.showModal) { window.ALPAuth.logout(); return; }
    window.showModal({
      title: 'Sign out?',
      type: 'danger',
      content: '<p style="margin:0;font-size:14px;line-height:1.6;color:var(--text-secondary);">You will be returned to the login screen. Any unsaved edits on the current page will be lost.</p>',
      confirmText: 'Sign out',
      cancelText: 'Stay signed in',
      showCancel: true,
      onConfirm: () => window.ALPAuth.logout(),
    });
  }

  function _openChangePasswordModal() {
    if (!window.showModal) { window.location.hash = '#/settings'; return; }
    const inputCss = 'width:100%;box-sizing:border-box;padding:10px 40px 10px 12px;font-size:13px;background:rgba(255,255,255,.04);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);outline:none;';
    const eyeBtn = (id) => `
      <button type="button" onclick="ALPHeader._togglePassField('${id}')" title="Show password" style="position:absolute;top:50%;right:6px;transform:translateY(-50%);width:28px;height:28px;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:6px;">
        <svg id="${id}-eye-on" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <svg id="${id}-eye-off" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.77 19.77 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.79 19.79 0 01-3.22 4.19M12 12a3 3 0 11-6 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      </button>`;
    window.showModal({
      title: 'Change your password',
      width: '420px',
      content: `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">New password</label>
            <div style="position:relative;">
              <input id="hpm-newpass" type="password" style="${inputCss}" placeholder="Minimum 6 characters" autocomplete="new-password" spellcheck="false">
              ${eyeBtn('hpm-newpass')}
            </div>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Confirm new password</label>
            <div style="position:relative;">
              <input id="hpm-confirmpass" type="password" style="${inputCss}" placeholder="Retype the new password" autocomplete="new-password" spellcheck="false">
              ${eyeBtn('hpm-confirmpass')}
            </div>
          </div>
        </div>`,
      confirmText: 'Update password',
      onConfirm: async () => {
        const p1 = document.getElementById('hpm-newpass')?.value || '';
        const p2 = document.getElementById('hpm-confirmpass')?.value || '';
        if (p1.length < 6) { window.showToast('Password must be at least 6 characters', 'error'); return false; }
        if (p1 !== p2)     { window.showToast('Passwords do not match', 'error');            return false; }
        try {
          await window.ALPApi.updateProfile({ password: p1 });
          window.showToast('Password updated', 'success');
        } catch (err) {
          window.showToast('Update failed: ' + (err.message || 'unknown'), 'error');
          return false;
        }
      },
    });
  }

  // 12 pastel-ish preset colors that read well against the avatar backdrop
  // in both light and dark themes.
  const AVATAR_PALETTE = [
    '#D4AF37', '#f43f5e', '#ec4899', '#8b5cf6',
    '#6366f1', '#3b82f6', '#06b6d4', '#10b981',
    '#84cc16', '#f59e0b', '#ef4444', '#94a3b8',
  ];

  // Generate a batch of random seeds for the face-picker grid.
  function _makeSeeds(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3));
    }
    return out;
  }

  function _renderFacePickerGrid(seeds, color, selectedSeed) {
    if (!window.SessionTemplates || !window.SessionTemplates.sessionFaceSvg) return '';
    return seeds.map(s => `
      <button type="button" class="hpm-face-tile" data-avatar-seed="${s}"
        style="padding:0;border:3px solid ${s===selectedSeed?'#D4AF37':'transparent'};background:transparent;border-radius:50%;cursor:pointer;box-shadow:${s===selectedSeed?'0 0 0 2px rgba(212,175,55,.35)':'none'};transition:transform .1s,border-color .15s;width:64px;height:64px;overflow:hidden;"
        onmouseenter="this.style.transform='scale(1.06)'" onmouseleave="this.style.transform='scale(1)'">
        <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;">${window.SessionTemplates.sessionFaceSvg(s, color)}</div>
      </button>`).join('');
  }

  function _openAvatarPickerModal() {
    if (!window.showModal) { window.location.hash = '#/settings'; return; }
    const user = window.ALPAuth.getUser() || {};
    const currentColor = user.avatar_color || AVATAR_PALETTE[0];
    const currentSeed  = user.avatar_seed  || user.username || 'x';

    // Start the grid with the current seed on top so it's always in view,
    // followed by 8 fresh random faces to pick from.
    let seeds = [currentSeed, ..._makeSeeds(8)];

    const previewFace = (color, seed) => (window.SessionTemplates && window.SessionTemplates.sessionFaceSvg)
      ? window.SessionTemplates.sessionFaceSvg(seed || currentSeed, color)
      : `<div style="width:100%;height:100%;background:${color};border-radius:50%;"></div>`;

    const swatchesHtml = AVATAR_PALETTE.map(c => `
      <button type="button" class="hpm-avatar-swatch" data-avatar-color="${c}"
        style="width:30px;height:30px;border-radius:50%;background:${c};border:2px solid ${c===currentColor?'#fff':'transparent'};box-shadow:0 0 0 2px ${c===currentColor?c:'transparent'};cursor:pointer;padding:0;transition:transform .1s,border-color .15s;"
        onmouseenter="this.style.transform='scale(1.12)'" onmouseleave="this.style.transform='scale(1)'"></button>
    `).join('');

    window.showModal({
      title: 'Change your avatar',
      width: '460px',
      content: `
        <div style="display:flex;flex-direction:column;gap:14px;align-items:center;">
          <div id="hpm-avatar-preview" style="width:90px;height:90px;border-radius:50%;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.4);border:2px solid var(--border-primary);">${previewFace(currentColor, currentSeed)}</div>

          <div style="font-size:11px;color:var(--text-secondary);text-align:center;">Pick a face below, or reroll for a new batch. Accent color at the bottom.</div>

          <div style="display:flex;align-items:center;gap:10px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Face</div>
            <button type="button" id="hpm-reroll-btn" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;font-size:11px;font-weight:600;background:transparent;color:var(--accent-primary);border:1px solid rgba(212,175,55,.35);border-radius:6px;cursor:pointer;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Reroll
            </button>
          </div>

          <div id="hpm-face-grid" style="display:grid;grid-template-columns:repeat(3,64px);gap:12px;justify-content:center;">
            ${_renderFacePickerGrid(seeds, currentColor, currentSeed)}
          </div>

          <div style="width:100%;height:1px;background:var(--border-primary);margin:6px 0 2px;"></div>

          <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Accent color</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:100%;">${swatchesHtml}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:11px;color:var(--text-secondary);">Custom:</label>
            <input type="color" id="hpm-avatar-custom" value="${currentColor}" style="width:38px;height:28px;border:1px solid var(--border-primary);border-radius:6px;background:transparent;cursor:pointer;">
          </div>

          <input type="hidden" id="hpm-avatar-value" value="${currentColor}">
          <input type="hidden" id="hpm-seed-value"   value="${currentSeed}">
        </div>`,
      confirmText: 'Save avatar',
      onConfirm: async () => {
        const color = document.getElementById('hpm-avatar-value')?.value || currentColor;
        const seed  = document.getElementById('hpm-seed-value')?.value  || currentSeed;
        try {
          await window.ALPApi.updateProfile({ avatar_color: color, avatar_seed: seed });
          try {
            const me = await window.ALPApi.getMe();
            if (me && me.user && window.ALPAuth._applyServerPermissions) {
              window.ALPAuth._applyServerPermissions(me.user);
            }
          } catch { /* non-fatal */ }
          refreshHeader();
          window.showToast && window.showToast('Avatar updated', 'success');
        } catch (err) {
          window.showToast && window.showToast('Update failed: ' + (err.message || 'unknown'), 'error');
          return false;
        }
      },
    });

    // Wire up swatch clicks, color input, face-tile clicks, and reroll.
    setTimeout(() => {
      const grid = document.getElementById('hpm-face-grid');

      const rewireTiles = () => {
        document.querySelectorAll('.hpm-face-tile').forEach(btn => {
          btn.addEventListener('click', () => {
            _pickAvatarSeed(btn.getAttribute('data-avatar-seed'));
          });
        });
      };
      rewireTiles();

      document.querySelectorAll('.hpm-avatar-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          _pickAvatarColor(btn.getAttribute('data-avatar-color'));
        });
      });

      const cust = document.getElementById('hpm-avatar-custom');
      if (cust) cust.addEventListener('input', (e) => _pickAvatarColor(e.target.value));

      // Reroll → replace grid with 9 fresh faces (keeping current selection
      // as the first tile so the user doesn't lose it).
      const reroll = document.getElementById('hpm-reroll-btn');
      if (reroll) reroll.addEventListener('click', () => {
        const sel   = document.getElementById('hpm-seed-value')?.value || currentSeed;
        const color = document.getElementById('hpm-avatar-value')?.value || currentColor;
        seeds = [sel, ..._makeSeeds(8)];
        if (grid) {
          grid.innerHTML = _renderFacePickerGrid(seeds, color, sel);
          rewireTiles();
        }
      });
    }, 0);
  }

  function _pickAvatarSeed(seed) {
    const preview = document.getElementById('hpm-avatar-preview');
    const hidden  = document.getElementById('hpm-seed-value');
    const color   = document.getElementById('hpm-avatar-value')?.value || AVATAR_PALETTE[0];
    if (preview && window.SessionTemplates && window.SessionTemplates.sessionFaceSvg) {
      preview.innerHTML = window.SessionTemplates.sessionFaceSvg(seed, color);
    }
    if (hidden) hidden.value = seed;
    document.querySelectorAll('.hpm-face-tile').forEach(b => {
      const active = b.getAttribute('data-avatar-seed') === seed;
      b.style.borderColor = active ? '#D4AF37' : 'transparent';
      b.style.boxShadow   = active ? '0 0 0 2px rgba(212,175,55,.35)' : 'none';
    });
  }

  function _pickAvatarColor(color) {
    const preview = document.getElementById('hpm-avatar-preview');
    const hidden  = document.getElementById('hpm-avatar-value');
    const seed    = document.getElementById('hpm-seed-value')?.value
                    || (window.ALPAuth.getUser() || {}).username || 'x';
    if (preview && window.SessionTemplates && window.SessionTemplates.sessionFaceSvg) {
      preview.innerHTML = window.SessionTemplates.sessionFaceSvg(seed, color);
    }
    if (hidden) hidden.value = color;
    // Recolor every face tile in the grid so the picker matches the choice.
    document.querySelectorAll('.hpm-face-tile').forEach(b => {
      const s = b.getAttribute('data-avatar-seed');
      if (window.SessionTemplates && window.SessionTemplates.sessionFaceSvg) {
        b.querySelector('div').innerHTML = window.SessionTemplates.sessionFaceSvg(s, color);
      }
    });
    // Highlight the matching swatch.
    document.querySelectorAll('.hpm-avatar-swatch').forEach(b => {
      const c = b.getAttribute('data-avatar-color');
      b.style.borderColor = (c === color) ? '#fff' : 'transparent';
      b.style.boxShadow   = (c === color) ? `0 0 0 2px ${c}` : '0 0 0 2px transparent';
    });
    const cust = document.getElementById('hpm-avatar-custom');
    if (cust && cust.value !== color) cust.value = color;
  }

  // Re-render the header in place. Used after avatar/profile changes so the
  // avatar reflects the new value without a page reload. Preserves title.
  function refreshHeader() {
    const el = document.getElementById('page-header');
    if (!el) return;
    const title = (document.getElementById('header-page-title')?.textContent) || '';
    el.innerHTML = renderHeader(title);
    initHeader();
  }

  function _togglePassField(id) {
    const inp = document.getElementById(id);
    const on  = document.getElementById(id + '-eye-on');
    const off = document.getElementById(id + '-eye-off');
    if (!inp) return;
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    if (on)  on.style.display  = showing ? 'block' : 'none';
    if (off) off.style.display = showing ? 'none'  : 'block';
  }

  function initHeader() {
    // View-as-user picker (god only). Non-god never gets the button rendered.
    const viewAsBtn = document.getElementById('header-view-as-btn');
    if (viewAsBtn && window.ALPViewAsUser) {
      viewAsBtn.addEventListener('click', () => window.ALPViewAsUser.openPicker());
      // Re-render banner on init in case the page just reloaded with alp_as_user set.
      window.ALPViewAsUser.renderBanner();
    }

    // Theme toggle handler
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        window.ALPTheme.toggle();
      });
    }

    // Logout handler — route through the confirm modal so a stray tap on the
    // header button doesn't sign the user out with no warning.
    const logoutBtn = document.getElementById('header-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _confirmLogout();
      });
    }

    // Profile dropdown — open on click of the avatar/name area, close on
    // outside click or Esc (handled by _openProfileMenu). Delegated click
    // inside the menu routes to _handleProfileAction.
    const profileWrap = document.getElementById('header-user-profile');
    if (profileWrap) {
      profileWrap.addEventListener('click', (e) => {
        // Ignore clicks that originated inside an already-open menu item —
        // those go through the delegated handler below.
        if (e.target.closest('.header-profile-menu')) return;
        const menu = document.getElementById('header-profile-menu');
        const open = menu && menu.style.display === 'block';
        if (open) _closeProfileMenu(); else _openProfileMenu();
      });
    }
    document.addEventListener('click', (e) => {
      const item = e.target.closest && e.target.closest('[data-hpm-action]');
      if (!item) return;
      e.stopPropagation();
      _handleProfileAction(item.getAttribute('data-hpm-action'));
    });

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

      // Auto-close sidebar on mobile whenever the user picks a nav item —
      // otherwise the drawer stays covering the content they just navigated
      // to. Desktop layout keeps the sidebar visible and unaffected.
      sidebar.addEventListener('click', (e) => {
        const link = e.target.closest && e.target.closest('.sidebar-nav-item');
        if (!link) return;
        if (sidebar.classList.contains('open')) toggleMenu();
      });
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

    // Notification bell (in-panel notifications dropdown)
    _initNotificationBell();

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
    { label: 'Websites',       hash: '#/demo-pages',     icon: 'layout',    kw: 'websites pages html editor files scam vault' },
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
  let _dangerFirstRun  = true;   // suppress alert on the very first poll (page load)

  // Persisted set of flagged-domain IDs we've already alerted on. Comparing
  // by ID (not by count) means we still alert when one flag is resolved AND
  // a different one appears in the same poll.
  const _DANGER_LS_KEY = 'alp_danger_seen_ids';
  function _loadSeenIds() {
    try {
      const raw = localStorage.getItem(_DANGER_LS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) { return new Set(); }
  }
  function _saveSeenIds(set) {
    try { localStorage.setItem(_DANGER_LS_KEY, JSON.stringify([...set])); } catch (_) {}
  }

  // Ask for browser Notification permission once — silently no-op if the
  // user denied it (we won't nag). Called lazily on first alert so we don't
  // prompt at page load.
  function _ensureNotificationPermission() {
    if (typeof Notification === 'undefined')      return Promise.resolve('unsupported');
    if (Notification.permission === 'granted')    return Promise.resolve('granted');
    if (Notification.permission === 'denied')     return Promise.resolve('denied');
    try { return Notification.requestPermission(); }
    catch (_) { return Promise.resolve('default'); }
  }

  /**
   * Fire audio + native notification for newly-flagged domains.
   * Called from _refreshDangerBell after fetching state. Silent on:
   *   - first poll after page load (suppressed to avoid re-alerting on reload)
   *   - domains already in the seen-set
   *   - if the whole flagged list is empty
   */
  async function _alertOnNewFlags(flaggedDomains) {
    const seen = _loadSeenIds();
    const currentIds = new Set(flaggedDomains.map(d => String(d.id)));
    const newlyFlagged = flaggedDomains.filter(d => !seen.has(String(d.id)));

    // Persist the current set even on first run so we don't alert next reload
    // for pre-existing flags.
    _saveSeenIds(currentIds);

    if (_dangerFirstRun) {
      _dangerFirstRun = false;
      return;
    }
    if (!newlyFlagged.length) return;

    // 1. Sound — reuse the existing 'domain_flagged' descending-sawtooth alert
    try {
      if (typeof window.playEventSound === 'function') {
        window.playEventSound('domain_flagged');
      } else if (typeof window.playNotificationSound === 'function') {
        window.playNotificationSound();
      }
    } catch (_) {}

    // 2. Browser Notification — one per newly-flagged domain (max 3 to avoid spam)
    const perm = await _ensureNotificationPermission();
    if (perm === 'granted') {
      for (const d of newlyFlagged.slice(0, 3)) {
        try {
          const n = new Notification('⚠ Domain flagged: ' + d.domain, {
            body: (d.flag_reason || 'flagged by security vendor') + ' — click to review',
            icon: '/admin/favicon.ico',   // best-effort; fine if 404
            tag:  'alp-flag-' + d.id,     // dedupe if fired twice for same domain
            requireInteraction: true,     // stays visible until admin acts
          });
          n.onclick = () => {
            window.focus();
            window.location.hash = '#/domains?flagged=1';
            n.close();
          };
        } catch (_) {}
      }
      if (newlyFlagged.length > 3) {
        try {
          new Notification(`+${newlyFlagged.length - 3} more flagged domains`, {
            body: 'Open the danger bell to review all of them.',
            tag:  'alp-flag-more',
          });
        } catch (_) {}
      }
    }
  }

  async function _fetchDangerState() {
    try {
      // Flagged domains stay independent — they're about the DOMAIN (Safe
      // Browsing hit, provider abuse notice, etc.) and are resolved by
      // rotating the domain, not by touching the VPS.
      //
      // Troubled VPS is now about the SERVER itself: SSH down, nginx down,
      // disk/RAM pressure. This is what an admin actually needs to fix on
      // the box — separate from domain-level alerts.
      const [dRes, metricsRes] = await Promise.all([
        window.ALPApi._request('GET', '/api/domains'),
        window.ALPApi._request('GET', '/api/vps-dashboard/metrics').catch(() => null),
      ]);
      const domains = (dRes && dRes.domains) || [];
      const flaggedDomains = domains.filter(d => d.flagged);

      const hosts = (metricsRes && Array.isArray(metricsRes.vps)) ? metricsRes.vps : [];
      const troubledVps = [];
      for (const h of hosts) {
        const problems = [];
        // Hard failures — the VPS is effectively down.
        if (!h.reachable) problems.push({ kind: 'unreachable', label: 'unreachable' });
        else if (!h.ssh_ok) problems.push({ kind: 'ssh_down', label: 'SSH failed' });
        else if (h.nginx_active === false) problems.push({ kind: 'nginx_down', label: 'nginx down' });
        // Resource pressure — soft alerts, still worth surfacing.
        if (typeof h.disk_percent === 'number' && h.disk_percent >= 95) {
          problems.push({ kind: 'disk_full', label: `disk ${Math.round(h.disk_percent)}%` });
        }
        if (typeof h.mem_percent === 'number' && h.mem_percent >= 95) {
          problems.push({ kind: 'mem_full', label: `RAM ${Math.round(h.mem_percent)}%` });
        }
        if (!problems.length) continue;
        troubledVps.push({
          host:     h.host,
          isPanel:  !!h.is_panel,
          problems,
          sites:    (h.sites || []).map(s => s.name || s.slug || `#${s.id}`),
          error:    h.error || null,
        });
      }

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
          <div class="danger-dd-item">
            <span class="danger-dd-item-dot"></span>
            <a class="danger-dd-item-body" href="#/domains?flagged=1" style="display:block;text-decoration:none;color:inherit;">
              <div class="danger-dd-item-title">${_escHtml(d.domain)}</div>
              <div class="danger-dd-item-meta">${_escHtml(reason)}${detected ? ' · ' + detected : ''}</div>
            </a>
            <button type="button" class="danger-dd-remove-btn" data-remove-domain-id="${_escHtml(d.id)}" data-remove-domain-name="${_escHtml(d.domain)}" title="Remove domain (DB + nginx + Cloudflare zone)">
              🗑 Remove
            </button>
          </div>
        `);
      }
      if (flaggedDomains.length > 8) {
        parts.push(`<div class="danger-dd-more">+${flaggedDomains.length - 8} more flagged</div>`);
      }
    }

    if (troubledVps.length) {
      // These are actual server-level problems (SSH/nginx down, disk/RAM
      // full). Fix by opening the VPS dashboard — or dismiss with "Re-probe"
      // if the failure was transient.
      parts.push(`<div class="danger-dd-section-label">VPS flagged · ${troubledVps.length}</div>`);
      for (const g of troubledVps.slice(0, 6)) {
        const badges = g.problems.map(p => p.label).join(' · ');
        const sites = g.sites.slice(0, 2).join(', ') + (g.sites.length > 2 ? ` +${g.sites.length - 2}` : '');
        const isCritical = g.problems.some(p => p.kind === 'unreachable' || p.kind === 'ssh_down' || p.kind === 'nginx_down');
        const dotColor = isCritical ? '#f87171' : '#fbbf24';
        parts.push(`
          <div class="danger-dd-item" style="align-items:flex-start;">
            <span class="danger-dd-item-dot" style="background:${dotColor};"></span>
            <div class="danger-dd-item-body">
              <div class="danger-dd-item-title">${_escHtml(g.host)}${g.isPanel ? ' <span style="font-size:9px;font-weight:700;color:#D4AF37;letter-spacing:.5px;">PANEL</span>' : ''}</div>
              <div class="danger-dd-item-meta">${_escHtml(badges)}${sites ? ' · ' + _escHtml(sites) : ''}</div>
            </div>
            <button type="button" class="danger-dd-recheck-btn"
              data-reprobe-host="${_escHtml(g.host)}"
              title="Re-run the health probe on this VPS">↻ Re-probe</button>
            <a class="danger-dd-remove-btn" href="#/vps" style="text-decoration:none;" title="Open VPS dashboard">Open →</a>
          </div>
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

    // Alert (sound + browser notification) on NEWLY flagged domains only.
    // Suppressed on first poll after page load — see _alertOnNewFlags.
    _alertOnNewFlags(state.flaggedDomains);
  }

  // ─── Notification Bell (dropdown) ────────────────────────────────────────
  // Count + payload come from ALPNotifications. Header subscribes; it does
  // not run its own timer. Dropdown re-renders from the latest payload.

  let _notifUnsub = null;

  function _typeIcon(type) {
    switch ((type || '').toLowerCase()) {
      case 'success': return '✓';
      case 'error':
      case 'danger':  return '⚠';
      case 'warning': return '⚠';
      case 'alert':   return '🔔';
      case 'info':
      default:        return 'ℹ';
    }
  }
  function _typeAccent(type) {
    switch ((type || '').toLowerCase()) {
      case 'success': return '#22c55e';
      case 'error':
      case 'danger':  return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'alert':   return '#fbbf24';
      case 'info':
      default:        return '#38bdf8';
    }
  }
  function _timeAgo(iso) {
    try {
      const t = new Date(iso).getTime();
      const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
      if (s < 60)      return s + 's ago';
      if (s < 3600)    return Math.floor(s / 60) + 'm ago';
      if (s < 86400)   return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    } catch { return ''; }
  }

  function _renderNotifDropdown(notifs) {
    const unread = notifs.filter(n => !n.is_read).length;
    const items = notifs.slice(0, 30);
    if (!items.length) {
      return `
        <div class="notif-dd-header">
          <span class="notif-dd-title">Notifications</span>
        </div>
        <div class="notif-dd-empty">
          <div class="notif-dd-empty-icon">✓</div>
          <div>You're all caught up.</div>
        </div>`;
    }
    const list = items.map(n => {
      const a = _typeAccent(n.type);
      const cls = n.is_read ? 'notif-dd-item notif-dd-item-read' : 'notif-dd-item';
      const link = n.link ? _escHtml(n.link) : '';
      const cursor = link ? 'cursor:pointer;' : 'cursor:default;';
      return `
        <div class="${cls}" data-notif-id="${n.id}" ${link ? `data-notif-link="${link}"` : ''} style="${cursor}">
          <span class="notif-dd-icon" style="background:${a}22;color:${a};border:1px solid ${a}55;">${_typeIcon(n.type)}</span>
          <div class="notif-dd-body">
            <div class="notif-dd-title-row">
              <span class="notif-dd-msg-title">${_escHtml(n.title || '')}</span>
              <span class="notif-dd-time">${_timeAgo(n.created_at)}</span>
            </div>
            <div class="notif-dd-msg">${_escHtml(n.message || '')}</div>
          </div>
          <button class="notif-dd-dismiss" data-notif-dismiss="${n.id}" title="Dismiss">×</button>
        </div>`;
    }).join('');
    return `
      <div class="notif-dd-header">
        <span class="notif-dd-title">Notifications${unread ? ` · ${unread}` : ''}</span>
        ${unread ? '<button class="notif-dd-mark-all" id="notif-dd-mark-all">Mark all read</button>' : ''}
      </div>
      <div class="notif-dd-list">${list}</div>`;
  }

  let _lastBellCount = 0;
  function _paintBell(unread, payload) {
    const badge = document.getElementById('header-notification-badge');
    const dropdown = document.getElementById('header-notifications-dropdown');
    if (!badge || !dropdown) { _lastBellCount = unread; return; }
    const rose = _lastBellCount === 0 && unread > 0;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = 'inline-flex';
      if (rose) {
        badge.classList.remove('just-appeared');
        void badge.offsetWidth;
        badge.classList.add('just-appeared');
      }
    } else {
      badge.style.display = 'none';
      badge.classList.remove('just-appeared');
    }
    _lastBellCount = unread;
    const notifs = payload && (payload.notifications || (Array.isArray(payload) ? payload : [])) || [];
    dropdown.innerHTML = _renderNotifDropdown(notifs);
  }

  function _refreshNotificationBell() {
    return window.ALPNotifications && window.ALPNotifications.refresh();
  }

  function _initNotificationBell() {
    const wrap     = document.getElementById('header-notifications-wrap');
    const btn      = document.getElementById('header-notifications-btn');
    const dropdown = document.getElementById('header-notifications-dropdown');
    if (!wrap || !btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.style.display === 'block';
      if (open) {
        dropdown.style.display = 'none';
      } else {
        dropdown.style.display = 'block';
        _refreshNotificationBell();
      }
    });

    dropdown.addEventListener('click', async (e) => {
      // Dismiss a single notification
      const dismissBtn = e.target.closest('button[data-notif-dismiss]');
      if (dismissBtn) {
        e.stopPropagation();
        e.preventDefault();
        const id = dismissBtn.dataset.notifDismiss;
        try { await window.ALPApi.deleteNotification(id); } catch {}
        _refreshNotificationBell();
        return;
      }
      // Mark all read
      const markAll = e.target.closest('#notif-dd-mark-all');
      if (markAll) {
        e.stopPropagation();
        e.preventDefault();
        try {
          await window.ALPApi.markAllNotificationsRead();
          if (window.showToast) window.showToast('All notifications marked as read', 'success');
        } catch {
          if (window.showToast) window.showToast('Failed to mark as read', 'error');
        }
        _refreshNotificationBell();
        return;
      }
      // Item click — mark read, follow link if any (fall back to notifications page)
      const item = e.target.closest('.notif-dd-item');
      if (item) {
        e.stopPropagation();
        const id = item.dataset.notifId;
        const link = item.dataset.notifLink || '#/notifications';
        // Fire-and-forget so the nav feels instant.
        try { window.ALPApi.markNotificationRead(id); } catch {}
        dropdown.style.display = 'none';
        // Force re-init when link matches the current hash (identical hash
        // wouldn't fire a hashchange, and the user would see nothing happen).
        if (window.location.hash === link) {
          window.location.hash = '#/dashboard';
          setTimeout(() => { window.location.hash = link; }, 0);
        } else {
          window.location.hash = link;
        }
        setTimeout(_refreshNotificationBell, 400);
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (dropdown.style.display !== 'block') return;
      if (!wrap.contains(e.target)) dropdown.style.display = 'none';
    });

    // Subscribe to shared notifications store — sidebar shares this feed.
    if (_notifUnsub) { try { _notifUnsub(); } catch (_) {} }
    if (window.ALPNotifications) {
      _notifUnsub = window.ALPNotifications.subscribe(_paintBell);
      window.ALPNotifications.startPolling();
    }
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
        // Piggyback on the user gesture to ask for notification permission.
        // Silent requests from a poll timer are blocked by Chrome; this call
        // rides on an explicit click so the prompt actually shows.
        _ensureNotificationPermission();
      }
    });

    // Delegated: ↻ Re-probe button on a troubled VPS row. Bypasses the 15s
    // metrics cache with ?fresh=1 so we get a real answer immediately —
    // useful when the VPS just came back up and the cache still says down.
    dropdown.addEventListener('click', async (e) => {
      const rp = e.target.closest('button[data-reprobe-host]');
      if (!rp) return;
      e.preventDefault();
      e.stopPropagation();
      const host = rp.dataset.reprobeHost;
      if (!host) return;
      const original = rp.innerHTML;
      rp.disabled = true;
      rp.innerHTML = '…';
      try {
        await window.ALPApi._request('GET', '/api/vps-dashboard/metrics?fresh=1');
        if (window.showToast) window.showToast(`Re-probing ${host}…`, 'info');
        setTimeout(() => _refreshDangerBell(), 1500);
      } catch (err) {
        if (window.showToast) window.showToast('Re-probe failed: ' + err.message, 'error');
        rp.disabled = false;
        rp.innerHTML = original;
      }
    });

    // Delegated: 🗑 Remove button on flagged-domain rows.
    // Confirms with AlpConfirm (no type-to-confirm here — admin already saw
    // the flag in the dropdown, this is the deliberate action), then calls
    // the existing atomic-remove endpoint that drops DB row + nginx +
    // Cloudflare zone in one shot.
    dropdown.addEventListener('click', async (e) => {
      const rm = e.target.closest('button[data-remove-domain-id]');
      if (!rm) return;
      e.preventDefault();
      e.stopPropagation();
      const id   = rm.dataset.removeDomainId;
      const name = rm.dataset.removeDomainName;
      if (!id) return;

      const ok = await window.AlpConfirm.danger({
        title: 'Remove ' + name + '?',
        body:  'This deletes the domain row, nginx config on the VPS, and the Cloudflare zone. Cannot be undone.',
        confirmLabel: 'Remove now',
      });
      if (!ok) return;

      const originalText = rm.innerHTML;
      rm.disabled = true;
      rm.innerHTML = '…';
      try {
        const res = await window.ALPApi.deleteManagedDomain(id);
        const notices = (res && res.notices) || [];
        const msg = notices.length
          ? `${name} removed. Note: ${notices.join('; ')}.`
          : `${name} removed`;
        if (window.showToast) window.showToast(msg, 'success');
        await _refreshDangerBell();
      } catch (err) {
        if (window.showToast) window.showToast('Remove failed: ' + err.message, 'error');
        rm.disabled = false;
        rm.innerHTML = originalText;
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

  return { renderHeader, initHeader, setTitle, refreshHeader, _togglePassField };
})();

// Export globally
window.ALPHeader = ALPHeader;
