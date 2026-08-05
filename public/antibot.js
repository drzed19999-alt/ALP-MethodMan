/**
 * ALP Antibot — client-side gate for VPS-served pages.
 *
 * How it works:
 *   1. Nginx sub_filter injects an inline <style id="__ab_hide">html{visibility:hidden}</style>
 *      and <script src="/antibot.js"></script> into every HTML response — the page
 *      is invisible until this script runs. Nothing is modified on disk.
 *   2. This script runs client-side bot detection (webdriver, headless Chrome,
 *      canvas fp, Permissions API, etc.).
 *   3. Hard-block flags → replace body with denied screen.
 *   4. Otherwise POST fingerprint + current domain to <panel>/api/xpages/challenge
 *      → wait for {ok:true} → reveal the page.
 *      {ok:false} (including `reason:"inactive"` when the website is deactivated
 *      in the panel) or any network failure → deny.
 *
 * Panel URL: baked in per-VPS at deploy time by services/vpsDomain.js
 * (attachDomainToVps writes a per-website copy of this file to
 * /var/www/<slug>/antibot.js with the placeholder replaced).
 *
 * Session cache: once verified, we set sessionStorage['_abv']=1 so subsequent
 * navigations within the same session skip the round-trip.
 */
(function () {
  'use strict';

  // Panel URL is replaced per-VPS by the deploy pipeline. If the placeholder
  // is still here, we're being served from the panel itself (e.g., devs opening
  // /antibot.js directly) — do nothing.
  var PANEL_URL = '__PANEL_URL__';
  if (PANEL_URL === '__' + 'PANEL_URL__') return;

  // Skip if already verified this session (fast path for internal navigation)
  try {
    if (sessionStorage.getItem('_abv') === '1') { reveal(); return; }
  } catch (_) { /* private mode — carry on */ }

  var TIMEOUT_MS = 5000;

  // ── Detection checks ──────────────────────────────────────────────────────
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

  // ── Build fingerprint ─────────────────────────────────────────────────────
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

  // ── POST to panel with domain + timeout ───────────────────────────────────
  var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var to = setTimeout(function () { if (ac) ac.abort(); }, TIMEOUT_MS);

  fetch(PANEL_URL + '/api/xpages/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fp: fp,
      d:  window.location.hostname,
      t:  window.location.pathname + window.location.search,
    }),
    credentials: 'omit',
    signal: ac ? ac.signal : undefined,
  })
    .then(function (r) {
      clearTimeout(to);
      if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
      return r.json();
    })
    .then(function (d) {
      if (!d || d.ok !== true) {
        // Deactivated website: reason:"inactive". Bot verdict: no reason field.
        return deny(d && d.reason === 'inactive' ? 'This site is currently unavailable' : 'Verification refused');
      }
      try { sessionStorage.setItem('_abv', '1'); } catch (_) {}
      reveal();
    })
    .catch(function (err) {
      clearTimeout(to);
      deny('Verification unavailable (' + (err && err.message ? err.message : 'network') + ')');
    });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function reveal() {
    var s = document.getElementById('__ab_hide');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    document.documentElement.style.visibility = '';
    if (document.body) document.body.style.visibility = '';
  }

  function deny(reason) {
    var msg = String(reason || 'Access denied').replace(/[<>]/g, '');
    var html =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f0f2f5;' +
      'padding:24px;text-align:center;">' +
      '<div style="max-width:420px;background:#fff;border-radius:12px;padding:44px 32px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,.08);">' +
      '<div style="font-size:44px;margin-bottom:16px;">🔒</div>' +
      '<div style="font-size:18px;font-weight:600;color:#111827;margin-bottom:8px;">Access denied</div>' +
      '<div style="font-size:13px;color:#6b7280;line-height:1.6;">' + msg + '</div>' +
      '</div></div>';
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><title>Access denied</title></head><body>' + html + '</body>';
    document.documentElement.style.visibility = '';
  }
})();
