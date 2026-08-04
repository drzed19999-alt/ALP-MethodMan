/**
 * ALP Antibot — client-side gate for VPS-served pages.
 *
 * How it works:
 *   1. HTML ships with an inline <style>html{visibility:hidden}</style> in <head>
 *      (injected by the deploy patcher). Page is invisible until this script runs.
 *   2. This script runs the same detection checks as middleware/antibot.js
 *      (webdriver, headless Chrome, canvas fp, missing Permissions API, etc.).
 *   3. On hard-block flags → replace body with denied screen and stay hidden's
 *      inverse (visible denied screen).
 *   4. Otherwise POST fingerprint to <panel>/api/xpages/challenge and wait for
 *      {ok:true} → reveal the page. Any other outcome (network fail, non-200,
 *      {ok:false}, timeout) → deny.
 *
 * Panel URL discovery: read from document.currentScript.src. Deploy patcher
 * rewrites src="/antibot.js" to the absolute panel URL, so the script knows
 * its own origin at runtime.
 *
 * Session cache: once verified, we set sessionStorage['_abv']=1 so subsequent
 * navigations within the same session skip the round-trip.
 */
(function () {
  'use strict';

  // Skip if already verified this session (fast path for internal navigation)
  try {
    if (sessionStorage.getItem('_abv') === '1') { reveal(); return; }
  } catch (_) { /* private mode — carry on */ }

  var TIMEOUT_MS = 5000;
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var panelOrigin = (function () {
    try {
      var u = new URL(script.src);
      return u.origin;
    } catch (_) {
      return '';
    }
  })();

  // Fail-closed: no way to reach the panel → deny.
  if (!panelOrigin || panelOrigin === window.location.origin) {
    // Same-origin means the deploy patcher didn't rewrite the src — treat as
    // a misconfigured deploy and deny to be safe.
    return deny('Antibot misconfigured');
  }

  // ── Detection checks (mirror middleware/antibot.js buildChallengeHtml) ─────
  var flags = [];
  function check(name, fn) {
    try { flags.push([name, !!fn()]); } catch (_) { flags.push([name, false]); }
  }

  check('wd',   function () { return navigator.webdriver === true; });
  check('ph',   function () { return !!(window.callPhantom || window._phantom || window.__phantomas); });
  check('nm',   function () { return !!window.__nightmare; });
  check('sl',   function () { return !!(window.Selenium || window.selenium || window.fxdriver_loaded); });
  check('cdc',  function () {
    return Object.getOwnPropertyNames(window).some(function (k) { return k.indexOf('cdc_') === 0; });
  });
  check('dom',  function () {
    var d = document;
    if (d.documentElement.getAttribute('webdriver')) return true;
    if (d.__webdriver_script_fn || d.$wdc_) return true;
    var oddKey = Object.keys(d).find(function (k) { return /\$[a-z]{3,5}_/.test(k); });
    return !!(oddKey && d[oddKey]);
  });
  check('hcl',  function () {
    return navigator.plugins.length === 0 && typeof Notification === 'undefined' && !window.chrome;
  });
  check('lang', function () { return !navigator.languages || navigator.languages.length === 0; });
  check('perm', function () { return typeof navigator.permissions === 'undefined'; });
  check('cv',   function () {
    try {
      var cv = document.createElement('canvas');
      var x  = cv.getContext('2d');
      x.fillText('test', 10, 10);
      return cv.toDataURL().length < 50;
    } catch (_) { return true; }
  });

  // Definitive-bot hard block — don't even round-trip the panel
  var hardBlock = flags.some(function (r) {
    return (r[0] === 'wd' || r[0] === 'ph' || r[0] === 'nm' || r[0] === 'sl') && r[1] === true;
  });
  if (hardBlock) return deny('Automation detected');

  // ── Build fingerprint (shape matches /api/xpages/challenge expectations) ──
  var fp = { fl: flags };
  try {
    var cv2 = document.createElement('canvas');
    var x2  = cv2.getContext('2d');
    x2.font = '14px sans-serif';
    x2.fillStyle = '#3c4';
    x2.fillText('¶©test', 5, 20);
    fp.cv = cv2.toDataURL().slice(-16);
  } catch (_) { /* skip */ }
  fp.ua = (navigator.userAgent || '').slice(0, 100);
  fp.lang = navigator.language || '';
  try { fp.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
  fp.sc = (screen.width || 0) + 'x' + (screen.height || 0);
  fp.cd = screen.colorDepth || 0;
  fp.tp = navigator.maxTouchPoints || 0;
  fp.ts = Date.now();

  // ── POST to panel with timeout — any failure denies (fail-closed) ─────────
  var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var to = setTimeout(function () { if (ac) ac.abort(); }, TIMEOUT_MS);

  fetch(panelOrigin + '/api/xpages/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fp: fp, t: window.location.pathname + window.location.search }),
    credentials: 'omit',
    signal: ac ? ac.signal : undefined,
  })
    .then(function (r) {
      clearTimeout(to);
      if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
      return r.json();
    })
    .then(function (d) {
      if (!d || d.ok !== true) return deny('Verification refused');
      try { sessionStorage.setItem('_abv', '1'); } catch (_) {}
      reveal();
    })
    .catch(function (err) {
      clearTimeout(to);
      deny('Verification unavailable (' + (err && err.message ? err.message : 'network') + ')');
    });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function reveal() {
    // Remove the hiding style injected by the deploy patcher
    var s = document.getElementById('__ab_hide');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    // Belt-and-suspenders: also unset inline styles some templates might have
    document.documentElement.style.visibility = '';
    if (document.body) document.body.style.visibility = '';
  }

  function deny(reason) {
    // Clear anything and show a clean denied screen; keep it minimal to avoid
    // giving scrapers hooks to fingerprint the block page.
    var html =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f0f2f5;' +
      'padding:24px;text-align:center;">' +
      '<div style="max-width:420px;background:#fff;border-radius:12px;padding:44px 32px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,.08);">' +
      '<div style="font-size:44px;margin-bottom:16px;">🔒</div>' +
      '<div style="font-size:18px;font-weight:600;color:#111827;margin-bottom:8px;">Access denied</div>' +
      '<div style="font-size:13px;color:#6b7280;line-height:1.6;">This request could not be verified.</div>' +
      '</div></div>';
    // Replace <html> content: strip head so any inline scripts don't re-run
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><title>Access denied</title></head><body>' + html + '</body>';
    document.documentElement.style.visibility = '';
    // Silence: don't log reason to console — scrapers scrape console too
    void reason;
  }
})();
