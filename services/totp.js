/**
 * Minimal TOTP (RFC 6238) — no external deps.
 * SHA-1, 6-digit codes, 30-second window, ±1 step tolerance.
 * Compatible with Google Authenticator / Authy / 1Password / Aegis.
 */
'use strict';
const crypto = require('crypto');

// RFC 4648 Base32 (no padding, uppercase). GA/Authy expect this alphabet.
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateSecret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  return base32Encode(buf);
}

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1F];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 0x1F];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let bits = 0, value = 0;
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// HOTP: HMAC-SHA1(secret, counter) → 6-digit code
function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  // Node Buffer doesn't have writeBigUInt64BE on older versions; do it manually
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xFF; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0F;
  const bin = ((hmac[offset] & 0x7F) << 24)
            | ((hmac[offset + 1] & 0xFF) << 16)
            | ((hmac[offset + 2] & 0xFF) << 8)
            |  (hmac[offset + 3] & 0xFF);
  return String(bin % 1000000).padStart(6, '0');
}

// Verify with ±1 step tolerance (clock skew)
function verifyToken(secretBase32, token, { window = 1, step = 30 } = {}) {
  if (!secretBase32 || !token) return false;
  const clean = String(token).replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const secretBuf = base32Decode(secretBase32);
  if (!secretBuf.length) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretBuf, counter + w) === clean) return true;
  }
  return false;
}

// otpauth:// URL for enrolment (scanned or pasted into an authenticator app)
function otpauthUrl({ issuer, account, secret }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, verifyToken, otpauthUrl, hotp, base32Decode, base32Encode };
