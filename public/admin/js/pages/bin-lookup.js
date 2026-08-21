/**
 * ALP — BIN Lookup Page
 *
 * Interactive card BIN inspector. Enters 6-8 digits (or a full PAN), fetches
 * bank identification metadata (brand, country, bank, level, prepaid, etc.)
 * from the backend cache, renders a live card mock + detail panel, and keeps
 * a local history of recent lookups.
 */
const BinLookupPage = (() => {
  const LS_KEY = 'alp_bin_history';
  const MAX_HISTORY = 40;

  let currentBin  = '';
  let currentData = null;
  let history     = [];

  // ── Utils ───────────────────────────────────────────────────────────────
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      history = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(history)) history = [];
    } catch { history = []; }
  }

  function saveHistory() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch {}
  }

  function pushHistory(entry) {
    history = [entry, ...history.filter(h => h.bin !== entry.bin)].slice(0, MAX_HISTORY);
    saveHistory();
  }

  function brandColor(b) {
    switch ((b || '').toLowerCase()) {
      case 'visa':       return '#1a1f71';
      case 'mastercard': return '#eb001b';
      case 'amex':       return '#2e77bb';
      case 'discover':   return '#ff6000';
      case 'jcb':        return '#0e4c96';
      case 'diners':     return '#0079BE';
      case 'unionpay':   return '#e21836';
      case 'maestro':    return '#0099df';
      default:           return '#4a4a4a';
    }
  }

  function brandLogo(b) {
    const key = (b || '').toLowerCase();
    const style = 'display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.4);';
    if (key === 'visa')       return `<span style="${style}font-style:italic;font-size:22px;font-family:Georgia,serif;">VISA</span>`;
    if (key === 'mastercard') return `<span style="display:inline-flex;align-items:center;"><span style="width:22px;height:22px;background:#eb001b;border-radius:50%;display:inline-block;opacity:.95"></span><span style="width:22px;height:22px;background:#f79e1b;border-radius:50%;display:inline-block;margin-left:-10px;opacity:.95"></span></span>`;
    if (key === 'amex')       return `<span style="${style}font-size:11px;background:#fff;color:#2e77bb;padding:4px 6px;border-radius:3px;">AMEX</span>`;
    if (key === 'discover')   return `<span style="${style}font-size:14px;">DISCOVER</span>`;
    if (key === 'unionpay')   return `<span style="${style}font-size:13px;">UnionPay</span>`;
    if (key === 'jcb')        return `<span style="${style}font-size:15px;">JCB</span>`;
    if (key === 'diners')     return `<span style="${style}font-size:11px;">Diners Club</span>`;
    if (key === 'maestro')    return `<span style="${style}font-size:15px;">Maestro</span>`;
    return `<span style="${style}font-size:12px;opacity:0.7;">CARD</span>`;
  }

  function typeBadge(t) {
    if (!t) return '<span class="bin-badge bin-badge-unknown">Unknown</span>';
    const k = t.toLowerCase();
    if (k.includes('credit')) return '<span class="bin-badge bin-badge-credit">Credit</span>';
    if (k.includes('debit'))  return '<span class="bin-badge bin-badge-debit">Debit</span>';
    if (k.includes('prepaid'))return '<span class="bin-badge bin-badge-prepaid">Prepaid</span>';
    return `<span class="bin-badge bin-badge-unknown">${esc(t)}</span>`;
  }

  function levelBadge(l) {
    if (!l) return '';
    return `<span class="bin-badge bin-badge-level">${esc(l)}</span>`;
  }

  function copyBtn(value, label = 'Copy') {
    const enc = esc(value == null ? '' : String(value));
    return `<button class="bin-copy" data-copy="${enc}" title="${label}" onclick="BinLookupPage.copyValue(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>`;
  }

  function render() {
    return `
      <div class="bin-lookup-page page-enter">
        <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; gap:16px;">
          <div>
            <h1 class="page-title" style="font-size:22px; font-weight:700; color:var(--text-primary); margin:0 0 4px; display:flex; align-items:center; gap:10px;">
              <span style="display:inline-flex; width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg, #D4AF37, #8f7222); align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(212,175,55,0.25);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.4"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5" fill="#0a0a0a"/></svg>
              </span>
              BIN Lookup
            </h1>
            <p class="page-subtitle" style="font-size:13px; color:var(--text-secondary); margin:0;">Enter a 6–8 digit BIN or a full card number to identify issuer, brand, country and card class.</p>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <div class="bin-stat-pill">
              <span class="bin-stat-value" id="bin-stat-total">0</span>
              <span class="bin-stat-label">Lookups</span>
            </div>
            <div class="bin-stat-pill">
              <span class="bin-stat-value" id="bin-stat-unique">0</span>
              <span class="bin-stat-label">Unique BINs</span>
            </div>
          </div>
        </div>

        <!-- Search bar -->
        <div class="bin-search-wrap">
          <div class="bin-search-inner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.6;">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input id="bin-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
                   placeholder="e.g. 411111  or  4111 1111 1111 1111"
                   maxlength="19" />
            <button id="bin-clear" class="bin-icon-btn" title="Clear" aria-label="Clear">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button id="bin-search-btn" class="bin-search-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"/></svg>
              Lookup
            </button>
          </div>
          <div class="bin-hint" id="bin-hint">Try: <button class="bin-suggest" data-bin="411111">411111 (Visa US)</button> · <button class="bin-suggest" data-bin="552877">552877 (Mastercard)</button> · <button class="bin-suggest" data-bin="371449">371449 (Amex)</button> · <button class="bin-suggest" data-bin="601100">601100 (Discover)</button></div>
        </div>

        <!-- Main grid: card visual + details -->
        <div class="bin-main-grid">
          <!-- Card visual -->
          <div class="bin-card-visual" id="bin-card-visual">
            ${renderCardVisual(null, '')}
          </div>

          <!-- Details panel -->
          <div class="bin-details" id="bin-details">
            ${renderDetails(null)}
          </div>
        </div>

        <!-- History -->
        <div class="bin-history-panel">
          <div class="bin-history-header">
            <h3 style="font-size:14px; font-weight:700; margin:0; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">Recent Lookups</h3>
            <button class="bin-btn-ghost" id="bin-clear-history">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Clear
            </button>
          </div>
          <div id="bin-history-list" class="bin-history-list"></div>
        </div>
      </div>

      <style>
        .bin-lookup-page { max-width: 1300px; margin: 0 auto; }
        .bin-lookup-page .page-header { flex-wrap: wrap; }
        .page-title, .page-subtitle, .page-header h1 { padding: 0; }

        .bin-stat-pill {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          min-width:76px; padding:6px 12px; background:var(--bg-secondary);
          border:1px solid var(--border-primary); border-radius:10px;
        }
        .bin-stat-value { font-size:16px; font-weight:800; color:var(--accent-primary); line-height:1; }
        .bin-stat-label { font-size:10px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; margin-top:2px; }

        /* Search */
        .bin-search-wrap {
          background: linear-gradient(180deg, rgba(212,175,55,0.05), transparent);
          border: 1px solid var(--border-gold);
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 20px;
          box-shadow: var(--shadow-md);
        }
        .bin-search-inner {
          display:flex; align-items:center; gap:10px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 6px 6px 6px 16px;
          transition: all 0.2s;
        }
        .bin-search-inner:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-primary-ring);
        }
        #bin-input {
          flex:1; background:transparent; border:none; outline:none;
          font-family: var(--font-mono); font-size: 18px; font-weight:600;
          color: var(--text-primary); padding: 10px 4px; letter-spacing: 2px;
        }
        #bin-input::placeholder { color: var(--text-placeholder); font-weight:400; letter-spacing: 1px; }
        .bin-icon-btn {
          width:32px; height:32px; border-radius:8px; border:none; background:transparent;
          color: var(--text-muted); display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition: all 0.15s;
        }
        .bin-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .bin-search-btn {
          display:flex; align-items:center; gap:6px; padding: 10px 20px;
          background: linear-gradient(135deg, #D4AF37, #8f7222);
          color: #0a0a0a; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;
          border:none; border-radius: 8px; cursor:pointer;
          box-shadow: 0 4px 14px rgba(212, 175, 55, 0.35);
          transition: all 0.15s;
        }
        .bin-search-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,175,55,0.5); }
        .bin-search-btn:active { transform: translateY(0); }
        .bin-search-btn:disabled { opacity: 0.6; cursor: not-allowed; transform:none; box-shadow:none; }
        .bin-hint { margin-top: 10px; font-size:11.5px; color: var(--text-tertiary); }
        .bin-suggest {
          background: rgba(212,175,55,0.08); border:1px dashed var(--border-gold);
          color: var(--accent-primary); padding: 2px 8px; border-radius:6px;
          font-size:11px; font-family: var(--font-mono); cursor:pointer;
          margin: 0 2px; transition: all 0.15s;
        }
        .bin-suggest:hover { background: rgba(212,175,55,0.18); border-style:solid; }

        /* Grid */
        .bin-main-grid {
          display: grid; grid-template-columns: 400px 1fr; gap: 20px; margin-bottom: 24px;
        }
        @media (max-width: 900px) { .bin-main-grid { grid-template-columns: 1fr; } }

        /* Card Visual */
        .bin-card-visual { display:flex; flex-direction:column; gap: 14px; }
        .bin-cc {
          position: relative;
          aspect-ratio: 1.586 / 1;
          border-radius: 16px;
          padding: 22px;
          color: #fff;
          display: flex; flex-direction: column; justify-content: space-between;
          box-shadow: 0 12px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05);
          overflow: hidden;
          transition: transform 0.4s var(--ease-out), box-shadow 0.4s;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
        }
        .bin-cc::before {
          content:''; position:absolute; inset:0;
          background: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.10), transparent 40%),
                      radial-gradient(circle at 80% 80%, rgba(255,255,255,0.06), transparent 45%);
          pointer-events:none;
        }
        .bin-cc::after {
          content:''; position:absolute; top:-40px; right:-40px;
          width:200px; height:200px; border-radius:50%;
          background: radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%);
          pointer-events:none;
        }
        .bin-cc:hover { transform: translateY(-4px) scale(1.01); }
        .bin-cc-top { display:flex; justify-content:space-between; align-items:center; z-index:1; }
        .bin-cc-chip {
          width:44px; height:34px; border-radius:6px;
          background: linear-gradient(135deg, #f0d78a, #b58b3b);
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2), inset 0 -1px 0 rgba(255,255,255,0.3);
          position:relative;
        }
        .bin-cc-chip::before {
          content:''; position:absolute; inset:4px 6px;
          background:
            linear-gradient(180deg, transparent 32%, rgba(0,0,0,0.25) 32% 34%, transparent 34% 62%, rgba(0,0,0,0.25) 62% 64%, transparent 64%);
        }
        .bin-cc-brand { z-index:1; }
        .bin-cc-num {
          font-family: var(--font-mono); font-size: 20px; font-weight: 600;
          letter-spacing: 4px; z-index:1; margin: 8px 0 4px;
          text-shadow: 0 2px 6px rgba(0,0,0,0.35);
        }
        .bin-cc-bottom { display:flex; justify-content:space-between; z-index:1; font-size:11px; }
        .bin-cc-bottom .lab { text-transform:uppercase; opacity:0.65; font-size:9px; letter-spacing:1px; }
        .bin-cc-bottom .val { font-family: var(--font-mono); font-weight:600; letter-spacing:1px; margin-top:2px; font-size:13px; }

        /* Details */
        .bin-details {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 16px;
          padding: 20px;
          min-height: 260px;
          position: relative;
        }
        .bin-details-empty {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          text-align:center; padding:40px 20px; color:var(--text-muted); min-height:220px;
        }
        .bin-details-title {
          display:flex; align-items:center; justify-content:space-between;
          padding-bottom:14px; border-bottom:1px solid var(--border-primary); margin-bottom:14px;
        }
        .bin-details-title h3 {
          font-size:15px; font-weight:700; margin:0; color:var(--text-primary);
          display:flex; align-items:center; gap:10px;
        }
        .bin-badges { display:flex; gap:6px; flex-wrap:wrap; }
        .bin-badge {
          font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px;
          text-transform: uppercase; letter-spacing:0.4px;
        }
        .bin-badge-credit  { background: rgba(59,130,246,0.15); color: var(--color-info); }
        .bin-badge-debit   { background: rgba(34,197,94,0.15); color: var(--color-success); }
        .bin-badge-prepaid { background: rgba(245,158,11,0.15); color: var(--color-warning); }
        .bin-badge-unknown { background: rgba(150,150,150,0.15); color: var(--text-tertiary); }
        .bin-badge-level   { background: rgba(212,175,55,0.15); color: var(--accent-primary); }

        .bin-fields {
          display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px;
        }
        @media (max-width: 700px) { .bin-fields { grid-template-columns: 1fr; } }
        .bin-field {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          padding: 12px;
          display:flex; flex-direction:column; gap:4px;
          transition: all 0.15s;
        }
        .bin-field:hover { border-color: var(--border-primary); transform: translateY(-1px); }
        .bin-field-label {
          font-size:10px; text-transform:uppercase; letter-spacing:0.6px;
          color: var(--text-tertiary); font-weight:700;
        }
        .bin-field-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .bin-field-value {
          font-size:14px; font-weight:600; color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .bin-field-sub {
          font-size:11px; color: var(--text-tertiary); font-weight:500; margin-top:2px;
        }
        .bin-copy {
          width:24px; height:24px; border-radius:6px; border:none; background:transparent;
          color: var(--text-muted); display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition: all 0.15s;
        }
        .bin-copy:hover { background: var(--bg-hover); color: var(--accent-primary); }
        .bin-copy.copied { background: var(--color-success-muted); color: var(--color-success); }

        /* History */
        .bin-history-panel {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 14px;
          padding: 16px 18px;
        }
        .bin-history-header {
          display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;
        }
        .bin-btn-ghost {
          display:inline-flex; align-items:center; gap:5px;
          background: transparent; border: 1px solid var(--border-primary);
          color: var(--text-tertiary); font-size:11px; font-weight:600;
          padding: 5px 10px; border-radius:6px; cursor:pointer;
          transition: all 0.15s;
        }
        .bin-btn-ghost:hover { border-color: var(--color-danger); color: var(--color-danger); }
        .bin-history-list {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 8px;
        }
        .bin-history-item {
          display:flex; align-items:center; gap:10px;
          padding: 10px 12px; background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle); border-radius: 10px;
          cursor:pointer; transition: all 0.15s;
        }
        .bin-history-item:hover {
          border-color: var(--border-gold); background: var(--bg-hover);
          transform: translateX(2px);
        }
        .bin-history-dot {
          width:8px; height:8px; border-radius:50%; flex-shrink:0;
        }
        .bin-history-bin {
          font-family: var(--font-mono); font-weight:700; font-size:13px;
          color: var(--text-primary); letter-spacing:0.5px;
        }
        .bin-history-meta {
          font-size:11px; color: var(--text-tertiary); margin-top:1px;
        }
        .bin-history-empty {
          padding:24px; text-align:center; color:var(--text-muted);
          font-size:12.5px; border:1px dashed var(--border-primary); border-radius:10px;
          grid-column: 1/-1;
        }

        /* ── Mobile ────────────────────────────────────────── */
        @media (max-width: 640px) {
          .bin-lookup-page .page-header { gap: 12px; }
          .bin-lookup-page .page-header > div:last-child {
            flex-wrap: wrap; width: 100%;
          }
          .bin-stat-pill { flex: 1 1 auto; min-width: 0; }

          .bin-search-wrap { padding: 12px; border-radius: 12px; }
          .bin-search-inner {
            flex-wrap: wrap; padding: 8px;
            border-radius: 10px; gap: 6px;
          }
          .bin-search-inner > svg:first-child { display: none; }
          #bin-input {
            font-size: 15px; letter-spacing: 1px; padding: 8px 4px;
            flex: 1 1 100%; width: 100%; order: 1;
          }
          .bin-icon-btn { order: 2; }
          .bin-search-btn {
            order: 3; flex: 1 1 auto; justify-content: center;
            padding: 10px 12px;
          }
          .bin-hint { font-size: 10.5px; line-height: 1.6; }
          .bin-suggest { display: inline-block; margin: 2px; }

          .bin-main-grid { gap: 12px; }
          .bin-cc { padding: 16px; border-radius: 12px; }
          .bin-cc-num { font-size: 16px; letter-spacing: 2px; }
          .bin-details { padding: 14px; border-radius: 12px; }
          .bin-details-title { flex-wrap: wrap; gap: 8px; }

          .bin-history-panel { padding: 12px; }
          .bin-history-list { grid-template-columns: 1fr; }
        }
      </style>
    `;
  }

  function renderCardVisual(data, binInput) {
    const brand   = data?.brand || 'card';
    const bank    = data?.bank?.name || (data ? '—' : 'BANK NAME');
    const country = data?.country?.name || (data ? '—' : 'COUNTRY');
    const bgTop   = brandColor(brand);
    // Darken the second stop
    const bgBot   = shade(bgTop, -35);
    const number  = binInput
      ? formatCardNumber(binInput.padEnd(16, '•'))
      : '•••• •••• •••• ••••';

    return `
      <div class="bin-cc" style="background: linear-gradient(135deg, ${bgTop}, ${bgBot});">
        <div class="bin-cc-top">
          <div class="bin-cc-chip"></div>
          <div class="bin-cc-brand">${brandLogo(brand)}</div>
        </div>
        <div>
          <div class="bin-cc-num">${number}</div>
          <div class="bin-cc-bottom">
            <div>
              <div class="lab">Bank</div>
              <div class="val" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(bank)}</div>
            </div>
            <div style="text-align:right;">
              <div class="lab">Country</div>
              <div class="val">${data?.country?.emoji || ''} ${esc(country)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDetails(data) {
    if (!data) {
      return `
        <div class="bin-details-empty">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="opacity:0.35; margin-bottom:16px;">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/><line x1="6" y1="17" x2="8" y2="17"/>
          </svg>
          <div style="font-size:14px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">No lookup yet</div>
          <div style="font-size:12px; color:var(--text-tertiary); max-width:280px;">
            Enter a 6–8 digit BIN or paste a full card number above to inspect the issuer, brand, card class, country and bank details.
          </div>
        </div>
      `;
    }

    if (data.error && !data.brand) {
      return `
        <div class="bin-details-empty">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="1.6" style="margin-bottom:16px;">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style="font-size:14px; font-weight:600; color:var(--color-danger); margin-bottom:6px;">Lookup failed</div>
          <div style="font-size:12px; color:var(--text-tertiary);">${esc(data.error)}</div>
        </div>
      `;
    }

    const notFound = !data.type && !data.bank?.name && !data.country?.name;

    return `
      <div class="bin-details-title">
        <h3>
          <span>BIN ${esc(data.bin)}</span>
          ${data.cached ? '<span style="font-size:10px;color:var(--text-tertiary);font-weight:500;padding:2px 6px;background:var(--bg-tertiary);border-radius:4px;">cached</span>' : ''}
          ${notFound ? '<span style="font-size:10px;color:var(--color-warning);font-weight:600;padding:2px 6px;background:var(--color-warning-muted);border-radius:4px;">partial data</span>' : ''}
        </h3>
        <div class="bin-badges">
          ${typeBadge(data.type)}
          ${levelBadge(data.level)}
          ${data.prepaid === true ? '<span class="bin-badge bin-badge-prepaid">Prepaid</span>' : ''}
        </div>
      </div>

      <div class="bin-fields">
        ${field('Brand',    (data.scheme || data.brand || '—').toUpperCase(), null)}
        ${field('Card Type',data.type ? data.type.toUpperCase() : 'Unknown', null)}
        ${field('Level',    data.level || '—', null)}
        ${field('Prepaid',  data.prepaid == null ? '—' : (data.prepaid ? 'Yes' : 'No'), null)}
        ${field('Country',  data.country ? `${data.country.emoji || ''} ${data.country.name || '—'}` : '—', data.country?.alpha2 || null)}
        ${field('Currency', data.country?.currency || '—', null)}
        ${field('Bank',     data.bank?.name || '—', data.bank?.city || null, data.bank?.name)}
        ${field('Website',  data.bank?.url  || '—', null, data.bank?.url,  data.bank?.url ? `https://${data.bank.url}` : null)}
        ${field('Phone',    data.bank?.phone || '—', null, data.bank?.phone)}
        ${field('BIN #',    data.bin, null, data.bin)}
      </div>
    `;
  }

  function field(label, value, sub, copyValue, hrefUrl) {
    const val = value == null || value === '' ? '—' : value;
    const showCopy = copyValue && copyValue !== '—';
    let displayed = esc(val);
    if (hrefUrl && val && val !== '—') {
      displayed = `<a href="${esc(hrefUrl)}" target="_blank" rel="noopener" style="color:var(--accent-primary); text-decoration:none;">${esc(val)}</a>`;
    }
    return `
      <div class="bin-field">
        <div class="bin-field-label">${esc(label)}</div>
        <div class="bin-field-row">
          <div class="bin-field-value" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayed}</div>
          ${showCopy ? copyBtn(copyValue) : ''}
        </div>
        ${sub ? `<div class="bin-field-sub">${esc(sub)}</div>` : ''}
      </div>
    `;
  }

  function formatCardNumber(str) {
    const s = String(str || '').replace(/\s+/g, '');
    return s.match(/.{1,4}/g).join(' ').trim();
  }

  // simple hex tinter for gradient
  function shade(hex, pct) {
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c+c).join('') : h, 16);
    let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const t = pct < 0 ? 0 : 255;
    const p = Math.abs(pct) / 100;
    r = Math.round((t - r) * p) + r;
    g = Math.round((t - g) * p) + g;
    b = Math.round((t - b) * p) + b;
    return `#${((1<<24) | (r<<16) | (g<<8) | b).toString(16).slice(1)}`;
  }

  // ── Lookup ──────────────────────────────────────────────────────────────
  async function doLookup(bin) {
    const digits = String(bin).replace(/\D+/g, '').slice(0, 8);
    if (digits.length < 6) {
      window.showToast?.('Enter at least 6 digits', 'warning');
      return;
    }

    currentBin = digits;
    const detailsEl = document.getElementById('bin-details');
    const visualEl  = document.getElementById('bin-card-visual');

    if (detailsEl) {
      detailsEl.innerHTML = `
        <div class="bin-details-empty">
          <div class="spinner" style="width:36px; height:36px; border:3px solid var(--border-primary); border-top-color:var(--accent-primary); border-radius:50%; animation: spin 0.8s linear infinite; margin-bottom:16px;"></div>
          <div style="font-size:13px; color:var(--text-secondary);">Looking up BIN ${esc(digits)}…</div>
        </div>
      `;
    }

    try {
      const data = await window.ALPApi._get(`/api/card-tools/bin/${encodeURIComponent(digits)}`);
      currentData = data;
      if (detailsEl) detailsEl.innerHTML = renderDetails(data);
      if (visualEl)  visualEl.innerHTML  = renderCardVisual(data, digits);

      pushHistory({
        bin: digits,
        brand: data.brand || null,
        bank:  data.bank?.name || null,
        country: data.country?.emoji ? `${data.country.emoji} ${data.country.alpha2 || ''}` : (data.country?.name || null),
        type:  data.type || null,
        at:    Date.now(),
      });
      updateStats();
      renderHistory();
    } catch (err) {
      window.showToast?.(err.message || 'Lookup failed', 'error');
      if (detailsEl) detailsEl.innerHTML = renderDetails({ error: err.message });
    }
  }

  // ── History UI ──────────────────────────────────────────────────────────
  function renderHistory() {
    const el = document.getElementById('bin-history-list');
    if (!el) return;

    if (!history.length) {
      el.innerHTML = `<div class="bin-history-empty">Your BIN lookup history appears here. Nothing yet.</div>`;
      return;
    }

    el.innerHTML = history.map(h => `
      <div class="bin-history-item" data-bin="${esc(h.bin)}">
        <span class="bin-history-dot" style="background:${brandColor(h.brand)}"></span>
        <div style="flex:1; min-width:0;">
          <div class="bin-history-bin">${esc(h.bin)}</div>
          <div class="bin-history-meta">
            ${esc((h.brand || 'card').toUpperCase())}${h.country ? ' · ' + esc(h.country) : ''}${h.bank ? ' · ' + esc(h.bank.slice(0, 24)) : ''}
          </div>
        </div>
        <button class="bin-copy" onclick="event.stopPropagation(); BinLookupPage.copyValue(this)" data-copy="${esc(h.bin)}" title="Copy BIN">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    `).join('');

    el.querySelectorAll('.bin-history-item').forEach(item => {
      item.addEventListener('click', () => {
        const bin = item.getAttribute('data-bin');
        const input = document.getElementById('bin-input');
        if (input) input.value = bin;
        doLookup(bin);
      });
    });
  }

  function updateStats() {
    const total = history.length;
    const uniq  = new Set(history.map(h => h.bin)).size;
    const t = document.getElementById('bin-stat-total');
    const u = document.getElementById('bin-stat-unique');
    if (t) t.textContent = total;
    if (u) u.textContent = uniq;
  }

  // ── Copy helper (exposed) ───────────────────────────────────────────────
  function copyValue(btn) {
    const val = btn.getAttribute('data-copy') || '';
    navigator.clipboard.writeText(val).then(() => {
      btn.classList.add('copied');
      const original = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = original;
      }, 1200);
    }).catch(() => window.showToast?.('Copy failed', 'error'));
  }

  // ── Init ────────────────────────────────────────────────────────────────
  function init() {
    loadHistory();
    updateStats();
    renderHistory();

    const input = document.getElementById('bin-input');
    const btn   = document.getElementById('bin-search-btn');
    const clr   = document.getElementById('bin-clear');
    const clrH  = document.getElementById('bin-clear-history');

    if (input) {
      input.focus();
      input.addEventListener('input', (e) => {
        // Live-preview the card number on the visual while user types.
        const digits = e.target.value.replace(/\D+/g, '');
        const visual = document.getElementById('bin-card-visual');
        if (visual) visual.innerHTML = renderCardVisual(currentData?.bin === digits.slice(0,8) ? currentData : null, digits);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doLookup(input.value); }
      });
    }

    if (btn) btn.addEventListener('click', () => doLookup(input?.value || ''));
    if (clr) clr.addEventListener('click', () => {
      if (input) { input.value = ''; input.focus(); }
      currentBin = ''; currentData = null;
      const v = document.getElementById('bin-card-visual');
      const d = document.getElementById('bin-details');
      if (v) v.innerHTML = renderCardVisual(null, '');
      if (d) d.innerHTML = renderDetails(null);
    });

    if (clrH) clrH.addEventListener('click', () => {
      if (!history.length) return;
      history = []; saveHistory(); updateStats(); renderHistory();
      window.showToast?.('History cleared', 'info');
    });

    document.querySelectorAll('.bin-suggest').forEach(el => {
      el.addEventListener('click', () => {
        const bin = el.getAttribute('data-bin');
        if (input) input.value = bin;
        doLookup(bin);
      });
    });
  }

  function destroy() { /* no timers */ }

  return { render, init, destroy, copyValue };
})();

if (typeof window !== 'undefined') {
  window.BinLookupPage = BinLookupPage;
}
