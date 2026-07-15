/**
 * ALP Tracker Script v1.0.0
 * Lightweight tracking script for websites to integrate with Admin Live Panel.
 * 
 * Usage:
 *   <script src="https://your-alp-server/tracker.js" data-api-key="YOUR_API_KEY"></script>
 */
(function() {
  'use strict';

  // Get config from script tag
  const scriptTag = document.currentScript || document.querySelector('script[data-api-key]');
  if (!scriptTag) {
    console.warn('[ALP] Tracker: No script tag with data-api-key found.');
    return;
  }

  const API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) {
    console.warn('[ALP] Tracker: data-api-key attribute is required.');
    return;
  }

  // Server URL: derive from script src
  const SCRIPT_SRC = scriptTag.src;
  const SERVER_URL = SCRIPT_SRC ? SCRIPT_SRC.replace(/\/tracker\.js.*$/, '') : window.location.origin;

  // Generate or retrieve visitor ID
  function getVisitorId() {
    let id = localStorage.getItem('_alp_vid');
    if (!id) {
      id = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      localStorage.setItem('_alp_vid', id);
    }
    return id;
  }

  // Retrieve session ID from sessionStorage (scoped per API key so
  // different websites on the same origin get separate sessions)
  function getSessionId() {
    return sessionStorage.getItem('_alp_sid_' + API_KEY);
  }

  // Get basic device info
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Desktop';

    // Browser detection
    if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/')) browser = 'Safari';
    else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera';

    // OS detection
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    // Device detection
    if (/Mobi|Android|iPhone|iPod/.test(ua)) device = 'Mobile';
    else if (/Tablet|iPad/.test(ua)) device = 'Tablet';

    return { browser, os, device, userAgent: ua };
  }

  // Track page view duration
  let pageEntryTime = Date.now();
  let currentPage = window.location.pathname + window.location.search;
  let lastActivityTime = Date.now();

  // Load Socket.IO client dynamically
  function loadSocketIO(callback) {
    if (window.io) {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = SERVER_URL + '/socket.io/socket.io.js';
    script.onload = callback;
    script.onerror = function() {
      console.warn('[ALP] Tracker: Could not load Socket.IO client.');
    };
    document.head.appendChild(script);
  }

  loadSocketIO(function() {
    const visitorId = getVisitorId();
    const deviceInfo = getDeviceInfo();
    let isNewPageLoad = true;

    // Connect to tracker namespace
    const socket = io(SERVER_URL + '/tracker', {
      transports: ['websocket', 'polling'],
      auth: {
        apiKey: API_KEY
      },
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socket.on('connect', function() {
      console.log('[ALP] Tracker connected');
      
      // Send init event
      // isNewPageLoad is true on the very first connect and also on any
      // reconnect (e.g. after a network blip) so the server always registers
      // the current page and keeps the session alive.
      socket.emit('tracker:init', {
        visitorId: visitorId,
        sessionId: getSessionId(),
        isNewPageLoad: isNewPageLoad,
        page: window.location.pathname + window.location.search,
        title: document.title,
        referrer: document.referrer,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        device: deviceInfo.device,
        userAgent: deviceInfo.userAgent,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      // After the very first page load flag has been used, subsequent reconnects
      // on the same page should still tell the server "I am on this page"
      // so we keep isNewPageLoad true for reconnects (session already exists,
      // server will just UPDATE rather than INSERT again).
      isNewPageLoad = false;
    });

    // Save session ID received from server (scoped per API key)
    socket.on('tracker:session', function(data) {
      if (data && data.sessionId) {
        sessionStorage.setItem('_alp_sid_' + API_KEY, data.sessionId);
      }
    });

    socket.on('disconnect', function() {
      console.log('[ALP] Tracker disconnected');
    });

    // Listen for redirect commands from admin
    socket.on('tracker:redirect', function(data) {
      if (data && data.url) {
        console.log('[ALP] Redirect command received:', data.url);
        window.location.href = data.url;
      }
    });

    // Listen for maintenance mode
    socket.on('tracker:maintenance', function(data) {
      if (data && data.enabled && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    });

    // Track page navigation (SPA support)
    let lastUrl = window.location.href;
    
    function checkUrlChange() {
      if (window.location.href !== lastUrl) {
        // Send duration of previous page
        const duration = Date.now() - pageEntryTime;
        socket.emit('tracker:pageview', {
          page: window.location.pathname + window.location.search,
          title: document.title,
          previousPage: currentPage,
          duration: duration
        });
        
        lastUrl = window.location.href;
        currentPage = window.location.pathname + window.location.search;
        pageEntryTime = Date.now();
      }
    }

    // Check for URL changes (works with pushState/replaceState and hash changes)
    setInterval(checkUrlChange, 500);
    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);

    // Override pushState and replaceState for SPA tracking
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      setTimeout(checkUrlChange, 50);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      setTimeout(checkUrlChange, 50);
    };

    // Activity tracking (throttled on user events)
    let activityTimeout = null;
    function sendActivity() {
      if (activityTimeout) return;
      activityTimeout = setTimeout(function() {
        socket.emit('tracker:activity', {
          page: window.location.pathname + window.location.search,
          timestamp: Date.now()
        });
        lastActivityTime = Date.now();
        activityTimeout = null;
      }, 5000); // Max once every 5 seconds
    }

    document.addEventListener('mousemove', sendActivity);
    document.addEventListener('scroll', sendActivity);
    document.addEventListener('keypress', sendActivity);
    document.addEventListener('click', sendActivity);
    document.addEventListener('touchstart', sendActivity);

    // Passive heartbeat — keeps session alive even on holding/loading pages
    // where the user has no interaction. Fires every 15 seconds to ensure
    // the session never appears inactive in the admin panel.
    setInterval(function() {
      if (socket.connected) {
        socket.emit('tracker:activity', {
          page: window.location.pathname + window.location.search,
          timestamp: Date.now()
        });
      }
    }, 15000);

    // Form data capture
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.getAttribute('data-alp-ignore')) return;

      const formData = {};
      const inputs = form.querySelectorAll('input, select, textarea');
      
      inputs.forEach(function(input) {
        const name = input.name || input.id;
        if (name && input.type !== 'hidden') {
          formData[name] = input.value;
        }
      });

      if (Object.keys(formData).length > 0) {
        socket.emit('tracker:formdata', {
          page: window.location.pathname + window.location.search,
          formAction: form.action || 'N/A',
          formId: form.id || form.className || 'unnamed',
          data: formData,
          timestamp: Date.now()
        });
      }
    });

    // Send page duration on unload
    window.addEventListener('beforeunload', function() {
      const duration = Date.now() - pageEntryTime;
      socket.emit('tracker:pageview', {
        page: currentPage,
        title: document.title,
        duration: duration,
        isUnload: true
      });
    });

    // Expose ALP tracker API for manual events
    window.ALPTracker = {
      trackEvent: function(name, data) {
        socket.emit('tracker:event', { name: name, data: data });
      },
      trackFormData: function(data) {
        socket.emit('tracker:formdata', {
          page: window.location.pathname,
          formId: 'manual',
          data: data,
          timestamp: Date.now()
        });
      },
      getVisitorId: function() {
        return visitorId;
      }
    };
  });
})();
