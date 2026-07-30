'use strict';
const crypto = require('crypto');

// ── Secret (rotate daily; persist with ANTIBOT_SECRET env var) ───────────────
const SECRET = process.env.ANTIBOT_SECRET || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  console.log('[antibot] No ANTIBOT_SECRET set — using ephemeral key (challenges reset on restart)');
  return s;
})();

// ── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_WINDOW_MS   = 60 * 1000;      // 1 minute window
const RATE_MAX_HITS    = 120;            // max HTML page requests per window
const RATE_BLOCK_MS    = 30 * 1000;     // block duration after violation (30s)

const _ipHits    = new Map(); // ip → { count, windowStart }
const _ipBlocked = new Map(); // ip → unblockTimestamp

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of _ipHits)    if (now - e.windowStart > RATE_WINDOW_MS * 2) _ipHits.delete(ip);
  for (const [ip, t] of _ipBlocked) if (now > t) _ipBlocked.delete(ip);
}, 120_000);

function rateLimitPass(ip) {
  const now = Date.now();
  if (_ipBlocked.has(ip)) {
    if (now < _ipBlocked.get(ip)) return false;
    _ipBlocked.delete(ip);
  }
  const e = _ipHits.get(ip);
  if (!e || now - e.windowStart > RATE_WINDOW_MS) {
    _ipHits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  e.count++;
  if (e.count > RATE_MAX_HITS) {
    _ipBlocked.set(ip, now + RATE_BLOCK_MS);
    _ipHits.delete(ip);
    return false;
  }
  return true;
}

// ── Bot UA patterns ───────────────────────────────────────────────────────────
const BOT_UA_PATTERNS = [
  /^$/,
  /\bbot\b/i, /\bcrawler\b/i, /\bspider\b/i, /\bscraper\b/i,
  /curl\//i, /wget\//i, /python-requests/i, /python\//i,
  /java\//i, /go-http-client/i, /libwww-perl/i, /lwp-trivial/i,
  /PhantomJS/i, /HeadlessChrome/i, /SlimerJS/i,
  /[Ss]elenium/i, /webdriver/i, /ChromeDriver/i, /[Pp]laywright/i,
  /Googlebot/i, /Bingbot/i, /Yahoo! Slurp/i, /DuckDuckBot/i,
  /facebookexternalhit/i, /Twitterbot/i, /LinkedInBot/i,
  /WhatsApp\//i, /Slackbot/i, /TelegramBot/i, /Discordbot/i,
  /AhrefsBot/i, /SemrushBot/i, /MJ12bot/i, /DotBot/i, /rogerbot/i,
  /Exabot/i, /zgrab/i, /masscan/i, /nuclei/i, /[Ss]qlmap/i,
  /[Nn]ikto/i, /nmap/i, /dirbuster/i, /gobuster/i, /feroxbuster/i,
  /okhttp\//i, /node-fetch/i, /axios\//i, /^got\//i, /superagent/i,
  /^PostmanRuntime/i, /insomnia/i, /httpie/i,
  /[Cc]heck[-_ ]?[Mm]ark/i, /[Vv]irus[Tt]otal/i, /[Pp]hish[Tt]ank/i,
  /[Oo]pening[Ss]ite/i, /[Ss]afe[Bb]rowsing/i, /[Uu]rl[Ss]can/i,
  /[Aa]buse[Ii][Pp]DB/i, /[Ss]ec/i,
];

function isKnownBot(ua) {
  if (!ua || ua.trim() === '') return true;
  return BOT_UA_PATTERNS.some(p => p.test(ua));
}

// ── IP extraction ─────────────────────────────────────────────────────────────
function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  ).replace(/^::ffff:/, ''); // normalize IPv4-mapped IPv6
}

// ── HMAC token (rotates daily per-IP) ────────────────────────────────────────
function _tokenForDay(ip, offsetDays) {
  const d = new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
  return crypto.createHmac('sha256', SECRET).update(`${ip}:${d}`).digest('hex');
}
function generateToken(ip)          { return _tokenForDay(ip, 0); }
function validateToken(token, ip)   { return token === _tokenForDay(ip, 0) || token === _tokenForDay(ip, 1); }

// ── Cookie ────────────────────────────────────────────────────────────────────
const COOKIE_NAME = '_abpok';

function getCookieValue(req, name) {
  const header = req.headers.cookie || '';
  const pair = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return pair ? pair.slice(name.length + 1) : null;
}

function hasValidChallengeCookie(req) {
  const token = getCookieValue(req, COOKIE_NAME);
  return token ? validateToken(token, getClientIp(req)) : false;
}

function setChallengeCookie(req, res) {
  res.cookie(COOKIE_NAME, generateToken(getClientIp(req)), {
    maxAge: 86_400_000,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
}

// ── Challenge interstitial ────────────────────────────────────────────────────
function buildChallengeHtml(targetUrl) {
  const safeT = JSON.stringify(String(targetUrl).replace(/[<>'"]/g, ''));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Just a moment…</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh;
     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.c{background:#fff;border-radius:12px;padding:48px 40px;text-align:center;
   box-shadow:0 4px 24px rgba(0,0,0,.1);max-width:420px;width:90%}
.ico{font-size:42px;margin-bottom:18px}
h1{font-size:20px;color:#111827;font-weight:600;margin-bottom:8px}
p{color:#6b7280;font-size:14px;line-height:1.6}
.bar{width:100%;height:4px;background:#e5e7eb;border-radius:4px;margin-top:28px;overflow:hidden}
.fill{height:100%;width:0;background:linear-gradient(90deg,#3b82f6,#6366f1);
      border-radius:4px;animation:prog 2s ease forwards}
@keyframes prog{0%{width:0}60%{width:70%}100%{width:100%}}
</style>
</head>
<body>
<div class="c">
  <div class="ico">🔒</div>
  <h1>Checking your browser</h1>
  <p>Verifying you're a human visitor.<br>This process is automatic.</p>
  <div class="bar"><div class="fill"></div></div>
</div>
<script>
!function(){"use strict";
var T=${safeT},R=[];
function c(n,f){try{R.push([n,!!f()])}catch(e){R.push([n,false])}}

/* ── Detection checks ───────────────────────────────────────────────────── */
c("wd",  function(){return navigator.webdriver===true});
c("ph",  function(){return!!(window.callPhantom||window._phantom||window.__phantomas)});
c("nm",  function(){return!!window.__nightmare});
c("sl",  function(){return!!(window.Selenium||window.selenium||window.fxdriver_loaded)});
c("cdc", function(){return Object.getOwnPropertyNames(window).some(function(k){return k.startsWith("cdc_")})});
c("dom", function(){
  // Selenium leaves webdriver property on document
  var d=document;
  return d.documentElement.getAttribute("webdriver")||d.__webdriver_script_fn||d.$wdc_||
         d[Object.keys(d).find(function(k){return/\$[a-z]{3,5}_/.test(k)})||"___"]!==undefined;
});
c("hcl", function(){
  // Headless Chrome: plugins empty + no DevTools notification API + no chrome object
  return navigator.plugins.length===0&&typeof Notification==="undefined"&&!window.chrome;
});
c("lang",function(){return!navigator.languages||navigator.languages.length===0});
c("perm",function(){
  // Real browsers expose Permissions API; many headless environments skip it
  return typeof navigator.permissions==="undefined";
});
c("cv",  function(){
  // Canvas: empty or tiny data URL signals headless renderer
  try{var cv=document.createElement("canvas"),x=cv.getContext("2d");
    x.fillText("test",10,10);return cv.toDataURL().length<50}catch(e){return true}
});

/* ── Build fingerprint ───────────────────────────────────────────────────── */
var fp={};
try{
  var cv2=document.createElement("canvas"),x2=cv2.getContext("2d");
  x2.font="14px sans-serif";x2.fillStyle="#3c4";x2.fillText("¶©test",5,20);
  fp.cv=cv2.toDataURL().slice(-16);
}catch(e){}
fp.ua=navigator.userAgent.slice(0,100);
fp.lang=navigator.language;
try{fp.tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}
fp.sc=screen.width+"x"+screen.height;
fp.cd=screen.colorDepth;
fp.tp=navigator.maxTouchPoints||0;
fp.ts=Date.now();
fp.fl=R;

/* ── Hard block: definitively a bot ─────────────────────────────────────── */
var hardBlock=R.some(function(r){
  return(r[0]==="wd"||r[0]==="ph"||r[0]==="nm"||r[0]==="sl")&&r[1]===true;
});
if(hardBlock){
  document.querySelector(".c").innerHTML=
    "<p style='padding:20px;color:#6b7280'>Access denied. Security check failed.</p>";
  return;
}

/* ── POST fingerprint and get cookie ────────────────────────────────────── */
setTimeout(function(){
  fetch("/api/xpages/challenge",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({fp:fp,t:T}),
    credentials:"same-origin"
  })
  .then(function(r){return r.ok?r.json():Promise.reject(r.status)})
  .then(function(d){
    if(d.ok){window.location.replace(d.r||T)}
    else{document.querySelector(".c").innerHTML=
      "<p style='padding:20px;color:#6b7280'>Verification failed. Please try again.</p>"}
  })
  .catch(function(){window.location.replace(T)});
},1400);
}();
</script>
</body>
</html>`;
}

// ── Main gate ─────────────────────────────────────────────────────────────────
// Returns true if request may proceed.
// Returns false (and sends response) if blocked or challenged.
function checkRequest(req, res) {
  const ua = req.headers['user-agent'] || '';
  if (isKnownBot(ua)) {
    res.status(404).send('Not Found');
    return false;
  }
  const ip = getClientIp(req);
  if (!rateLimitPass(ip)) {
    res.status(429).send('Too Many Requests');
    return false;
  }
  if (hasValidChallengeCookie(req)) return true;
  // No valid cookie — issue the JS challenge
  const target = req.originalUrl || '/';
  res.status(200).type('html').send(buildChallengeHtml(target));
  return false;
}

module.exports = {
  checkRequest,
  hasValidChallengeCookie,
  setChallengeCookie,
  generateToken,
  validateToken,
  getClientIp,
  isKnownBot,
  buildChallengeHtml,
};
