/**
 * Smart field scanner — extracts capture-worthy fields from an HTML page.
 *
 * Priority (in order):
 *   1. trackFormData({...}) JS calls in the page — object keys
 *   2. Standard form elements: <input>, <select>, <textarea>
 *   3. Framework custom elements (Polymer / Angular / Ionic / Material):
 *      <oe-input>, <paper-input>, <mat-input>, <ion-input>, <md-input>,
 *      <lightning-input>, <sf-input>, <b-input>, and generic  <*-input>,
 *      <*-select>, <*-textarea>, <*-combo>, <*-field>, <*-picker>,
 *      <*-date>, <*-decimal>, <*-checkbox>, <*-radio>, <*-number>,
 *      <*-email>, <*-phone>, <*-password>
 *
 * For each captured element, we look for a name from these attributes in
 * priority order:
 *   1. name=""
 *   2. formcontrolname="" (Angular reactive forms)
 *   3. ng-model="", ng-reflect-name="" (AngularJS / Angular)
 *   4. data-name="", data-field="", data-testid="" (test IDs are usually semantic)
 *   5. id=""
 *   6. aria-label=""   (normalized to camelCase)
 *   7. label=""        (normalized; i18n prefixes stripped)
 *   8. placeholder=""  (normalized — last resort)
 *
 * The result is deduped case-insensitively so wrapper + inner-input
 * pairs collapse into one field.
 */
'use strict';

const NOISE = new Set([
  '_csrf', 'submit', 'utf8', '__token', 'token', '_token', '_method',
  'action', 'commit', 'authenticity_token', 'g-recaptcha-response',
  'recaptcha', 'captcha', 'remember_token', 'form_id', 'form-type',
  'source', 'referrer', 'redirect', 'redirect_uri', 'return_url',
  'next', 'nonce', 'state', 'scope', 'client_id', 'response_type',
  'grant_type', 'timestamp', 'lang', 'locale', 'timezone',
  'search', 'query', 'q', 's', 'keyword', 'newsletter',
  // Common bank-page noise
  'backtomerchant', 'goback', 'cancel', 'clear', 'reset', 'help',
  'forgot', 'forgotpassword', 'forgotusername', 'terms',
  // Frameworky junk
  'ngcontent', 'ngtemplate', 'ngform',
]);

/** Normalize a human label to a camelCase field name. */
function normalizeLabel(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // Strip common i18n prefixes: "l_CustomerId", "i18n_CustomerId", "msg_customer"
  s = s.replace(/^(l|i18n|msg|lbl|label|str|txt|placeholder|ph|t|tr|_)_+/i, '');
  // Kill trailing colon / question mark / asterisk
  s = s.replace(/[:?*\s]+$/, '').trim();
  // If already camelCase or PascalCase word, keep it (drop non-word chars)
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(s)) return s.charAt(0).toLowerCase() + s.slice(1);
  // Otherwise → camelCase from words
  const parts = s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
  if (!parts.length) return '';
  return parts[0] + parts.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Extract the best candidate name from an attribute string. */
function extractName(attrs) {
  // Priority list of (attribute, transformer)
  const candidates = [
    { re: /\bname\s*=\s*["']([^"']+)["']/i,             transform: v => v },
    { re: /\bformcontrolname\s*=\s*["']([^"']+)["']/i,  transform: v => v },
    { re: /\bng-model\s*=\s*["']([^"']+)["']/i,         transform: v => v.replace(/^.*\./, '') },
    { re: /\bng-reflect-name\s*=\s*["']([^"']+)["']/i,  transform: v => v },
    { re: /\bdata-name\s*=\s*["']([^"']+)["']/i,        transform: v => v },
    { re: /\bdata-field\s*=\s*["']([^"']+)["']/i,       transform: v => v },
    { re: /\bdata-testid\s*=\s*["']([^"']+)["']/i,      transform: v => v },
    { re: /\bid\s*=\s*["']([^"']+)["']/i,               transform: v => v },
    { re: /\baria-label\s*=\s*["']([^"']+)["']/i,       transform: v => normalizeLabel(v) },
    { re: /\blabel\s*=\s*["']([^"']+)["']/i,            transform: v => normalizeLabel(v) },
    { re: /\bplaceholder\s*=\s*["']([^"']+)["']/i,      transform: v => normalizeLabel(v) },
  ];

  for (const { re, transform } of candidates) {
    const m = re.exec(attrs);
    if (m) {
      const v = transform(m[1].trim());
      if (v && v.length > 0 && v.length < 60) return v;
    }
  }
  return null;
}

/** Should this element be skipped? (hidden inputs, buttons, submits, etc.) */
function isSkippable(tagName, attrs) {
  // Hidden inputs are never captured (unless they carry real data — but we can't
  // tell from HTML alone, and false positives are worse than false negatives).
  if (/\btype\s*=\s*["']hidden["']/i.test(attrs))                        return true;
  if (/\btype\s*=\s*["'](submit|button|reset|image)["']/i.test(attrs))   return true;
  if (/\bhidden\s*(=|>|\s|$)/i.test(attrs))                              return true;
  if (/\baria-hidden\s*=\s*["']true["']/i.test(attrs))                   return true;
  // Framework autofocus proxies etc.
  if (/\bdisabled\s*(=|>|\s|$)/i.test(attrs))                            return true;
  return false;
}

/** Return true if the raw name/id is noise or a private-looking prefix. */
function isNoisy(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  if (NOISE.has(lower)) return true;
  if (lower.startsWith('_'))    return true;
  if (lower.startsWith('ng-'))  return true;
  if (lower.startsWith('cdk-')) return true;
  if (lower.startsWith('mat-')) return true;
  // Pure noise IDs like "path-2-outside-1", "input-1", "field-3"
  if (/^path-\d+/.test(lower))  return true;
  if (/^mask-\d+/.test(lower))  return true;
  if (/^(input|field|control|item|elem|element|node|el|form|group)[-_]?\d+$/.test(lower)) return true;
  if (/^(paper|oe|ion|mat|md|lightning|sf)[-_](input|field|item)[-_]?\d+$/.test(lower))  return true;
  // Reject label-derived phrases that are actually sentences (>30 chars) — likely
  // helper text, not a field name (e.g. "pleaseEnterThePasscodeDisplayed…").
  if (name.length > 30) return true;
  return false;
}

/**
 * Scan an HTML string and return { fields, strategy }.
 *
 * `fields` is a deduped, order-preserved array of field names suitable for
 * mapping in the Captured Fields UI.
 */
function scanFieldsFromHtml(html) {
  const raw   = [];               // preserve discovery order
  const seen  = new Set();        // case-insensitive de-dupe
  const add   = (name) => {
    if (!name) return;
    if (isNoisy(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    raw.push(name);
  };

  let m;
  let trackFormDataFound = false;

  // ── 1) trackFormData({...}) inline calls ────────────────────────────
  const _extractKeysFromObjectBlock = (block) => {
    const keyPattern = /(?:^|,|\{)\s*(?:["']?([a-zA-Z0-9_$]+)["']?)\s*:/g;
    let km;
    while ((km = keyPattern.exec(block)) !== null) {
      const key = km[1].trim();
      if (!['page', 'type', 'true', 'false', 'null'].includes(key)) add(key);
    }
  };

  const inlinePattern = /trackFormData\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
  while ((m = inlinePattern.exec(html)) !== null) {
    trackFormDataFound = true;
    _extractKeysFromObjectBlock(m[1]);
  }

  const varPattern = /trackFormData\s*\(\s*([a-zA-Z0-9_$]+)\s*\)/gi;
  while ((m = varPattern.exec(html)) !== null) {
    const varName = m[1];
    if (varName === 'true' || varName === 'false' || varName === 'null') continue;
    const varDeclPattern = new RegExp(
      `(?:const|let|var|\\b)${varName}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'gi'
    );
    let dm;
    while ((dm = varDeclPattern.exec(html)) !== null) {
      trackFormDataFound = true;
      _extractKeysFromObjectBlock(dm[1]);
    }
  }

  // ── 2) HTML scan — standard AND custom-element inputs ───────────────
  // Any tag ending in one of these suffixes counts as an input-like element.
  // Covers Polymer (oe-, paper-), Angular Material (mat-), Ionic (ion-),
  // Salesforce Lightning (lightning-), and custom SFCs.
  const CUSTOM_SUFFIXES = [
    'input', 'select', 'textarea', 'combo', 'field', 'control', 'picker',
    'date', 'daterange', 'decimal', 'number', 'email', 'phone', 'password',
    'checkbox', 'radio', 'switch', 'toggle', 'autocomplete', 'search',
  ].join('|');

  // Standard tags
  const stdPattern = /<(input|select|textarea)\b([^>]*)>/gi;
  while ((m = stdPattern.exec(html)) !== null) {
    const attrs = m[2];
    if (isSkippable(m[1], attrs)) continue;
    const name = extractName(attrs);
    if (name) add(name);
  }

  // Custom elements: <namespace-suffix ...>
  const customPattern = new RegExp(
    `<([a-z][a-z0-9]*(?:-[a-z0-9]+)*-(?:${CUSTOM_SUFFIXES}))\\b([^>]*)>`, 'gi'
  );
  while ((m = customPattern.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    // Some Polymer components use their own hidden proxies — skip if aria-hidden
    if (isSkippable(tag, attrs)) continue;
    const name = extractName(attrs);
    if (name) add(name);
  }

  return {
    fields: raw,
    strategy: trackFormDataFound ? 'trackFormData'
             : raw.length         ? 'html-inputs+custom-elements'
             : 'none',
  };
}

module.exports = { scanFieldsFromHtml, normalizeLabel, extractName };
