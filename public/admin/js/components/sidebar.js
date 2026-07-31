/**
 * ALP - Sidebar Component
 * Sidebar navigation with active state tracking and notification badges
 */
const ALPSidebar = (() => {
  
  function renderSidebar() {
    const isGod = window.ALPAuth && window.ALPAuth.isGod();
    return `
      <div class="sidebar-logo" style="justify-content: flex-start; gap: 12px;">
        <div class="sidebar-logo-icon" style="background: linear-gradient(135deg, #261f0a, #120f04); border: 1px solid #D4AF37; box-shadow: 0 0 15px rgba(212, 175, 55, 0.4), inset 0 0 10px rgba(212, 175, 55, 0.2); font-size: 22px; font-weight: 900; color: #D4AF37; text-shadow: 0 0 8px rgba(212, 175, 55, 0.8);">
          $
        </div>
        <div style="display:flex; flex-direction:column; justify-content:center;">
          <div class="sidebar-logo-text" style="font-size: 16px; letter-spacing: 1px; font-weight: 800; text-transform: uppercase;">OutLaws</div>
          <a href="https://t.me/itstheoutlaws" target="_blank" rel="noopener" style="font-size: 10px; color: #38bdf8; font-weight: 700; letter-spacing: 1px; text-decoration: none;" title="Telegram Channel">@itstheoutlaws</a>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-nav-label">Monitoring</div>
        <a href="#/dashboard" class="sidebar-nav-item" data-page="dashboard">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
            <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
          </svg>
          Dashboard
        </a>
        <a href="#/sessions" class="sidebar-nav-item" data-page="sessions">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Live Sessions
          <span class="pulse-dot" style="margin-left: 6px;"></span>
        </a>

        <div class="sidebar-nav-label">Control</div>
        ${(isGod || window.ALPAuth.isSuperAdmin()) ? `<a href="#/demo-pages" class="sidebar-nav-item" data-page="demo-pages">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          Websites
        </a>` : ''}
        <a href="#/captured-data" class="sidebar-nav-item" data-page="captured-data">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Captured Data
        </a>
        ${isGod ? `<a href="#/funnel" class="sidebar-nav-item" data-page="funnel">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Funnel Builder
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#D4AF37" style="margin-left:auto;flex-shrink:0;" title="God admin only"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
        </a>` : ''}
        <a href="#/analytics" class="sidebar-nav-item" data-page="analytics">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          Analytics
        </a>

        <a href="#/domains" class="sidebar-nav-item" data-page="domains">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
          </svg>
          Domains
        </a>

        <div class="sidebar-nav-label">Card Tools</div>
        <a href="#/bin-lookup" class="sidebar-nav-item" data-page="bin-lookup">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5"/>
          </svg>
          BIN Lookup
        </a>
        <a href="#/cc-checker" class="sidebar-nav-item" data-page="cc-checker">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M7 15h4"/><path d="M15 15l2 2 4-4"/>
          </svg>
          CC Checker
        </a>

        <div class="sidebar-nav-label">Security</div>
        <a href="#/ip-blocking" class="sidebar-nav-item" data-page="ip-blocking">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          IP Blocking
        </a>
        <a href="#/rate-limits" class="sidebar-nav-item" data-page="rate-limits">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Rate Limits
        </a>
        <a href="#/firewall-rules" class="sidebar-nav-item" data-page="firewall-rules">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Firewall Rules
        </a>

        <div class="sidebar-nav-label">System</div>
        <a href="#/notifications" class="sidebar-nav-item" data-page="notifications">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          Notifications
          <span class="nav-badge" id="sidebar-notification-badge" style="display:none;">0</span>
        </a>
        <a href="#/logs" class="sidebar-nav-item" data-page="logs">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          Audit Logs
        </a>
        <a href="#/settings" class="sidebar-nav-item" data-page="settings">
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          Settings
        </a>
      </nav>
      <div class="sidebar-footer" style="padding:12px 14px; border-top:1px solid rgba(255,255,255,0.08); background:rgba(16,16,28,0.95); flex-shrink:0;">
        ${(() => {
          const u = window.ALPAuth && window.ALPAuth.getUser();
          if (!u) return '';
          const roleMap = {
            god:         { cls: 'sidebar-role-pill-god',        icon: '👑', label: 'God Admin'   },
            super_admin: { cls: 'sidebar-role-pill-super-admin', icon: '⭐', label: 'Super Admin' },
            admin:       { cls: 'sidebar-role-pill-admin',       icon: '🔧', label: 'Admin'       }
          };
          const r = roleMap[u.role];
          if (!r) return '';
          return `<div class="sidebar-role-pill ${r.cls}">
            <span style="font-size:13px;">${r.icon}</span>
            <span>${u.username}</span>
            <span style="opacity:0.7;font-size:10px;margin-left:auto;">${r.label}</span>
          </div>`;
        })()}
        <a href="https://t.me/itstheoutlaws" target="_blank" rel="noopener" title="ALP by @itstheoutlaws on Telegram"
           style="display:flex; align-items:center; gap:9px; text-decoration:none; padding:9px 12px; border-radius:8px; background:rgba(0,136,204,0.12); border:1px solid rgba(0,136,204,0.3); transition:all 0.2s;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.93 7.17-1.7 8.02c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.52.26l.18-2.65 4.74-4.28c.21-.18-.04-.28-.32-.1L7.9 14.38l-2.55-.8c-.55-.17-.56-.55.12-.82l9.95-3.84c.46-.17.86.1.51.75z" fill="#0088cc"/>
          </svg>
          <div>
            <div style="font-size:11.5px; font-weight:700; color:#38bdf8; letter-spacing:0.2px;">@itstheoutlaws</div>
            <div style="font-size:9.5px; color:var(--text-secondary); font-weight:500;">Official Telegram Channel</div>
          </div>
        </a>
      </div>
    `;
  }

  function initSidebar() {
    // Load notification counts
    updateBadge();
  }

  function updateActiveNav(page) {
    const items = document.querySelectorAll('.sidebar-nav-item');
    items.forEach(item => {
      const itemPage = item.getAttribute('data-page');
      if (itemPage === page) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  async function updateBadge() {
    const badge = document.getElementById('sidebar-notification-badge');
    if (!badge) return;

    try {
      const resp = await window.ALPApi.getNotifications({ limit: 1 });
      const count = resp.unread_count !== undefined ? resp.unread_count : 0;
      updateNotificationBadge(count);
    } catch (e) {
      // Ignore
    }
  }

  function updateNotificationBadge(count) {
    const badge = document.getElementById('sidebar-notification-badge');
    const headerBell = document.getElementById('header-notification-badge');
    if (!badge) return;

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
      if (headerBell) headerBell.style.display = 'block';
    } else {
      badge.style.display = 'none';
      if (headerBell) headerBell.style.display = 'none';
    }
  }

  return { renderSidebar, initSidebar, updateActiveNav, updateNotificationBadge, updateBadge };
})();

// Export globally
window.ALPSidebar = ALPSidebar;
