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

    currentPageName = hash;

    // Destroy previous page module state
    if (currentPageModule && typeof currentPageModule.destroy === 'function') {
      currentPageModule.destroy();
    }

    currentPageModule = pageModule;

    const loginContainer = document.getElementById('login-container');
    const appLayout = document.getElementById('app-layout');

    if (hash === 'login') {
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

      if (pageHeader && !pageHeader.innerHTML) {
        pageHeader.innerHTML = window.ALPHeader.renderHeader(capitalize(hash));
        window.ALPHeader.initHeader();
      }

      // Highlight active nav item
      window.ALPSidebar.updateActiveNav(hash);

      // Set page header title
      window.ALPHeader.setTitle(capitalize(hash.replace('-', ' ')));

      // Render the page module inside page-content
      const pageContent = document.getElementById('page-content');
      
      // Page exit transition
      pageContent.classList.add('fade-out');
      
      setTimeout(() => {
        pageContent.innerHTML = pageModule.render();
        pageContent.className = 'page-content fade-in';
        
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

    window.ALPSocket.on('admin:notification', (notif) => {
      // Show browser alert toast
      window.showToast(notif.message, notif.type || 'info');
      
      // Play nice sound chime if enabled
      if (window.playNotificationSound) {
        window.playNotificationSound();
      }

      // Trigger sidebar badge reload
      window.ALPSidebar.updateBadge();

      // If notifications page is active, reload it
      if (currentPageName === 'notifications' && currentPageModule && typeof currentPageModule.loadNotifications === 'function') {
        currentPageModule.loadNotifications();
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

      if (soundSetting === 'blip') {
        // High quick double-blip
        playChime(1200, 0, 0.08, 0.12, 'triangle');
        playChime(1500, 0.05, 0.08, 0.12, 'triangle');
      } else if (soundSetting === 'ping') {
        // Single elegant high frequency chime with long decay
        playChime(1760, 0, 0.8, 0.15, 'sine');
      } else if (soundSetting === 'retro') {
        // Retro arcade synth arpeggio
        playChime(523.25, 0, 0.1, 0.1, 'square');    // C5
        playChime(659.25, 0.05, 0.1, 0.1, 'square'); // E5
        playChime(783.99, 0.1, 0.1, 0.1, 'square');  // G5
        playChime(1046.50, 0.15, 0.2, 0.1, 'square'); // C6
      } else {
        // Standard Chime (value '1' or others)
        playChime(783.99, 0, 0.4, 0.15, 'sine');
        playChime(1046.50, 0.08, 0.5, 0.12, 'sine');
      }
    } catch (err) {
      console.warn('[ALP] Chime playback failed:', err);
    }
  };

  // --- Bootstrap ---

  async function init() {
    window.addEventListener('hashchange', handleRouting);
    
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
