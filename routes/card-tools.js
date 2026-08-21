/**
 * Card Tools — BIN lookup + Luhn / format validation
 *
 * Legitimate card-metadata + format-validation only:
 *   • BIN metadata via binlist.net (public bank identification data)
 *   • Luhn checksum + expiry / format checks on user-supplied strings
 *
 * No live-gateway charging, no auth attempts against real processors.
 */
const router = require('express').Router();
const { authenticateToken, requirePage } = require('../middleware/auth');
const https = require('https');

router.use(authenticateToken);

// ─── BIN cache (in-memory, TTL 24h) ─────────────────────────────────────────
const BIN_CACHE = new Map();
const BIN_TTL_MS = 24 * 60 * 60 * 1000;

// binlist.net asks ~1 req/s; add a per-process token bucket
const RATE_STATE = { lastCall: 0, minSpacingMs: 900 };

function cacheGet(bin) {
  const hit = BIN_CACHE.get(bin);
  if (!hit) return null;
  if (Date.now() - hit.at > BIN_TTL_MS) { BIN_CACHE.delete(bin); return null; }
  return hit.data;
}

function cacheSet(bin, data) {
  BIN_CACHE.set(bin, { at: Date.now(), data });
  if (BIN_CACHE.size > 20000) {
    // trim oldest ~2k when we blow past a soft cap
    const drop = [...BIN_CACHE.entries()]
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, 2000)
      .map(([k]) => k);
    drop.forEach(k => BIN_CACHE.delete(k));
  }
}

function fetchBinlist(bin) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'lookup.binlist.net',
      path: `/${bin}`,
      method: 'GET',
      headers: { 'Accept-Version': '3', 'User-Agent': 'ALP-CardTools/1.0' },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode !== 200) return reject(new Error(`binlist HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('binlist timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function throttleWait() {
  const now = Date.now();
  const wait = Math.max(0, RATE_STATE.lastCall + RATE_STATE.minSpacingMs - now);
  if (wait) await new Promise(r => setTimeout(r, wait));
  RATE_STATE.lastCall = Date.now();
}

function normalizeBin(input) {
  return String(input || '').replace(/\D+/g, '').slice(0, 8);
}

function brandFromNumber(digits) {
  if (!digits) return null;
  if (/^4/.test(digits))                        return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits))          return 'mastercard';
  if (/^3[47]/.test(digits))                    return 'amex';
  if (/^6011|^65|^64[4-9]/.test(digits))        return 'discover';
  if (/^35(2[89]|[3-8][0-9])/.test(digits))     return 'jcb';
  if (/^3(0[0-5]|[68])/.test(digits))           return 'diners';
  if (/^62/.test(digits))                       return 'unionpay';
  if (/^(50|5[6-9]|6)/.test(digits))            return 'maestro';
  return null;
}

/** Normalize a binlist payload into our stable shape. */
function shapeBin(bin, raw) {
  if (!raw) {
    return {
      bin,
      brand:   brandFromNumber(bin),
      scheme:  brandFromNumber(bin),
      type:    null,
      level:   null,
      prepaid: null,
      country: null,
      bank:    null,
      source:  'inferred',
    };
  }
  return {
    bin,
    brand:   (raw.scheme || brandFromNumber(bin) || '').toLowerCase() || null,
    scheme:  raw.scheme || null,
    type:    raw.type   || null,             // debit / credit / prepaid
    level:   raw.brand  || null,             // "gold", "platinum", "world elite"
    prepaid: typeof raw.prepaid === 'boolean' ? raw.prepaid : null,
    country: raw.country ? {
      name:     raw.country.name     || null,
      alpha2:   raw.country.alpha2   || null,
      alpha3:   raw.country.alpha3   || null,
      emoji:    raw.country.emoji    || null,
      currency: raw.country.currency || null,
      numeric:  raw.country.numeric  || null,
    } : null,
    bank: raw.bank ? {
      name:    raw.bank.name    || null,
      url:     raw.bank.url     || null,
      phone:   raw.bank.phone   || null,
      city:    raw.bank.city    || null,
    } : null,
    number: raw.number ? {
      length: raw.number.length || null,
      luhn:   typeof raw.number.luhn === 'boolean' ? raw.number.luhn : null,
    } : null,
    source: 'binlist',
  };
}

/** Look up a single BIN (with cache + throttle). */
async function lookupBin(binRaw) {
  const bin = normalizeBin(binRaw);
  if (bin.length < 6) return { error: 'BIN must be at least 6 digits', bin };

  const key = bin.slice(0, 8);
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  try {
    await throttleWait();
    const raw = await fetchBinlist(key);
    const shaped = shapeBin(key, raw);
    cacheSet(key, shaped);
    return { ...shaped, cached: false };
  } catch (err) {
    // Fall back to brand inference so the UI still shows something
    const fallback = shapeBin(key, null);
    return { ...fallback, cached: false, error: err.message };
  }
}

// ─── Luhn / parsing helpers ─────────────────────────────────────────────────
function luhnCheck(numStr) {
  const s = String(numStr || '').replace(/\D+/g, '');
  if (s.length < 12 || s.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function parseCcLine(line) {
  const t = String(line || '').trim();
  if (!t) return null;

  // Common formats we accept:
  //   4111111111111111|12|29|123
  //   4111111111111111|12/29|123
  //   4111111111111111 12 29 123
  //   4111111111111111,12,2029,123
  //   4111111111111111
  const cleaned = t.replace(/[|,;/\s]+/g, '|').replace(/^\|+|\|+$/g, '');
  const parts = cleaned.split('|').filter(Boolean);
  const raw = { line: t };

  raw.number = (parts[0] || '').replace(/\D+/g, '');
  raw.month  = parts[1] ? parts[1].replace(/\D+/g, '') : '';
  raw.year   = parts[2] ? parts[2].replace(/\D+/g, '') : '';
  raw.cvv    = parts[3] ? parts[3].replace(/\D+/g, '') : '';

  if (raw.month.length > 2)          raw.month = raw.month.slice(0, 2);
  if (raw.year.length  === 4)        raw.year  = raw.year.slice(2);

  return raw;
}

function validateExpiry(mm, yy) {
  if (!mm || !yy) return { ok: null };
  const m = parseInt(mm, 10);
  const y = parseInt(yy, 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return { ok: false, reason: 'bad month' };
  if (!Number.isFinite(y))                    return { ok: false, reason: 'bad year' };
  const fullYear = y < 100 ? 2000 + y : y;
  const now      = new Date();
  const nowM     = now.getMonth() + 1;
  const nowY     = now.getFullYear();
  if (fullYear < nowY || (fullYear === nowY && m < nowM)) return { ok: false, reason: 'expired' };
  return { ok: true };
}

function classifyCard(parsed) {
  const flags = [];
  const number = parsed.number || '';

  // Basic structure
  const lenOk = number.length >= 12 && number.length <= 19;
  const luhn  = lenOk ? luhnCheck(number) : false;
  const brand = brandFromNumber(number);
  const exp   = validateExpiry(parsed.month, parsed.year);
  const cvvLen = (parsed.cvv || '').length;

  if (!lenOk)             flags.push('bad-length');
  if (!luhn)              flags.push('luhn-fail');
  if (!brand)             flags.push('unknown-brand');
  if (exp.ok === false)   flags.push(exp.reason);
  if (cvvLen && (cvvLen < 3 || cvvLen > 4)) flags.push('bad-cvv');

  // Verdict is *format* level only. We deliberately do not label cards
  // as LIVE/DIE — that would imply gateway testing, which this tool does not do.
  let verdict = 'invalid';
  if (luhn && brand && exp.ok !== false) verdict = 'valid-format';
  else if (luhn && brand)                verdict = 'valid-luhn';
  else if (lenOk)                        verdict = 'invalid';
  else                                   verdict = 'malformed';

  return {
    number,
    masked: maskPan(number),
    bin:    number.slice(0, 8),
    month:  parsed.month,
    year:   parsed.year,
    cvv:    parsed.cvv ? '*'.repeat(cvvLen) : '',
    brand,
    lenOk,
    luhn,
    expiry: exp,
    verdict,
    flags,
  };
}

function maskPan(num) {
  const s = String(num || '');
  if (s.length < 8) return s;
  return `${s.slice(0, 6)}${'•'.repeat(Math.max(0, s.length - 10))}${s.slice(-4)}`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/card-tools/bin/:bin
router.get('/bin/:bin', requirePage('bin-lookup'), async (req, res) => {
  const result = await lookupBin(req.params.bin);
  if (result.error && !result.brand) return res.status(400).json(result);
  res.json(result);
});

// POST /api/card-tools/bin-bulk  { bins: ['411111', ...] }
router.post('/bin-bulk', requirePage('bin-lookup'), async (req, res) => {
  const bins = Array.isArray(req.body?.bins) ? req.body.bins : [];
  if (!bins.length)              return res.status(400).json({ error: 'bins[] required' });
  if (bins.length > 50)          return res.status(400).json({ error: 'max 50 per batch' });

  const seen = new Map();
  const order = [];
  for (const b of bins) {
    const k = normalizeBin(b);
    if (k.length >= 6 && !seen.has(k)) { seen.set(k, null); order.push(k); }
  }

  for (const k of order) {
    seen.set(k, await lookupBin(k));
  }

  res.json({ results: order.map(k => seen.get(k)) });
});

// POST /api/card-tools/cc-check  { input: 'raw text', bulk: true }
router.post('/cc-check', requirePage('cc-checker'), async (req, res) => {
  const input = String(req.body?.input || '').trim();
  const wantBin = req.body?.enrich !== false; // default: enrich

  if (!input) return res.status(400).json({ error: 'input required' });

  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length)  return res.status(400).json({ error: 'no card lines found' });
  if (lines.length > 500) return res.status(400).json({ error: 'max 500 cards per batch' });

  const results = [];
  const uniqBins = new Set();

  for (const line of lines) {
    const parsed = parseCcLine(line);
    if (!parsed) continue;
    const classified = classifyCard(parsed);
    results.push(classified);
    if (classified.lenOk) uniqBins.add(classified.bin.slice(0, 8));
  }

  const binMap = {};
  if (wantBin) {
    for (const bin of uniqBins) {
      binMap[bin] = await lookupBin(bin);
    }
    for (const r of results) {
      if (r.lenOk) r.binInfo = binMap[r.bin.slice(0, 8)] || null;
    }
  }

  const summary = {
    total:         results.length,
    valid_format:  results.filter(r => r.verdict === 'valid-format').length,
    valid_luhn:    results.filter(r => r.verdict === 'valid-luhn').length,
    invalid:       results.filter(r => r.verdict === 'invalid').length,
    malformed:     results.filter(r => r.verdict === 'malformed').length,
    by_brand:      results.reduce((acc, r) => {
                     const k = r.brand || 'unknown';
                     acc[k] = (acc[k] || 0) + 1;
                     return acc;
                   }, {}),
  };

  res.json({ results, summary });
});

module.exports = router;
