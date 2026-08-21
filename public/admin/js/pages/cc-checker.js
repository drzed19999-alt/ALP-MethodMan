/**
 * ALP — CC Checker (Format Validator)
 *
 * Bulk card format validator. Parses lines in common `PAN|MM|YY|CVV` shapes,
 * runs Luhn + length + expiry + CVV length checks, and enriches with BIN
 * metadata via the /api/card-tools backend cache.
 *
 * This is a *format* validator. It never contacts a payment processor and
 * never labels cards LIVE / DIE — those imply gateway testing (fraud). Verdicts
 * here are strictly: valid-format / valid-luhn / invalid / malformed.
 */
const CCCheckerPage = (() => {
  const LS_KEY = 'alp_cc_last_input';

  let lastResults = [];      // full result set from last check
  let lastSummary = null;
  let currentFilter = 'all'; // all | valid-format | valid-luhn | invalid | malformed
  let brandFilter = 'all';

  // ── Utils ───────────────────────────────────────────────────────────────
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
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
      default:           return '#666';
    }
  }

  function verdictColor(v) {
    switch (v) {
      case 'valid-format': return { bg: 'rgba(34,197,94,0.15)', fg: 'var(--color-success)', label: 'Format ✓' };
      case 'valid-luhn':   return { bg: 'rgba(245,158,11,0.15)', fg: 'var(--color-warning)', label: 'Luhn ✓' };
      case 'invalid':      return { bg: 'rgba(239,68,68,0.15)',  fg: 'var(--color-danger)',  label: 'Invalid' };
      case 'malformed':    return { bg: 'rgba(150,150,150,0.15)', fg: 'var(--text-tertiary)', label: 'Malformed' };
      default:             return { bg: 'rgba(150,150,150,0.15)', fg: 'var(--text-tertiary)', label: v };
    }
  }

  function flagLabel(f) {
    return {
      'bad-length':    'Wrong length',
      'luhn-fail':     'Luhn checksum failed',
      'unknown-brand': 'Unknown brand',
      'expired':       'Expired',
      'bad month':     'Invalid month',
      'bad year':      'Invalid year',
      'bad-cvv':       'CVV length',
    }[f] || f;
  }

  function render() {
    return `
      <div class="cc-checker-page page-enter">
        <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; gap:16px; flex-wrap:wrap;">
          <div>
            <h1 class="page-title" style="font-size:22px; font-weight:700; color:var(--text-primary); margin:0 0 4px; display:flex; align-items:center; gap:10px;">
              <span style="display:inline-flex; width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg, #22c55e, #059669); align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(34,197,94,0.25);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.4"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M7 15h4"/><path d="M15 15l2 2 4-4"/></svg>
              </span>
              CC Checker
            </h1>
            <p class="page-subtitle" style="font-size:13px; color:var(--text-secondary); margin:0;">
              Bulk <b style="color:var(--text-primary);">format validator</b> — Luhn checksum, length, expiry, CVV, brand + BIN enrichment.
              <span style="opacity:0.7;">Not a gateway checker.</span>
            </p>
          </div>
        </div>

        <!-- Input + Actions -->
        <div class="cc-input-panel">
          <div class="cc-input-head">
            <div>
              <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); margin-bottom:4px;">Cards to Check</div>
              <div style="font-size:11px; color:var(--text-tertiary);">One per line — <code style="background:var(--bg-tertiary); padding:1px 6px; border-radius:4px; color:var(--accent-primary); font-family:var(--font-mono);">PAN|MM|YY|CVV</code> or just <code style="background:var(--bg-tertiary); padding:1px 6px; border-radius:4px; color:var(--accent-primary); font-family:var(--font-mono);">PAN</code>. Max 500.</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-secondary); cursor:pointer;">
                <input type="checkbox" id="cc-enrich" checked style="accent-color:var(--accent-primary);" />
                Enrich with BIN data
              </label>
              <button class="cc-btn cc-btn-ghost" id="cc-paste">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/></svg>
                Paste
              </button>
              <button class="cc-btn cc-btn-ghost" id="cc-sample">Sample</button>
              <button class="cc-btn cc-btn-ghost" id="cc-clear-input">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear
              </button>
            </div>
          </div>

          <textarea id="cc-input" spellcheck="false"
            placeholder="4111111111111111|12|29|123&#10;5555555555554444|08|30|456&#10;378282246310005|05|28|1234"></textarea>

          <div class="cc-input-foot">
            <div style="display:flex; gap:14px; font-size:11.5px; color:var(--text-tertiary);">
              <span>Lines: <b id="cc-line-count" style="color:var(--text-primary);">0</b></span>
              <span>Chars: <b id="cc-char-count" style="color:var(--text-primary);">0</b></span>
            </div>
            <button class="cc-btn cc-btn-primary" id="cc-check-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>
              Check Cards
            </button>
          </div>
        </div>

        <!-- Progress -->
        <div id="cc-progress" style="display:none; margin: 12px 0;">
          <div style="height:6px; background:var(--bg-secondary); border-radius:99px; overflow:hidden;">
            <div id="cc-progress-bar" style="height:100%; width:0%; background:linear-gradient(90deg, var(--accent-primary), var(--color-success)); transition: width 0.3s;"></div>
          </div>
          <div id="cc-progress-label" style="font-size:11px; color:var(--text-tertiary); margin-top:6px; text-align:center;"></div>
        </div>

        <!-- Summary -->
        <div id="cc-summary" class="cc-summary" style="display:none;"></div>

        <!-- Results Filters -->
        <div id="cc-filter-bar" class="cc-filter-bar" style="display:none;">
          <div class="cc-tabs">
            <button class="cc-tab active" data-filter="all">All</button>
            <button class="cc-tab" data-filter="valid-format">Format ✓</button>
            <button class="cc-tab" data-filter="valid-luhn">Luhn ✓</button>
            <button class="cc-tab" data-filter="invalid">Invalid</button>
            <button class="cc-tab" data-filter="malformed">Malformed</button>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="cc-brand-filter" class="cc-select">
              <option value="all">All brands</option>
            </select>
            <button class="cc-btn cc-btn-ghost" id="cc-copy-visible">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy shown
            </button>
            <button class="cc-btn cc-btn-ghost" id="cc-export-csv">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>

        <!-- Results -->
        <div id="cc-results" class="cc-results"></div>
      </div>

      <style>
        .cc-checker-page { max-width: 1300px; margin: 0 auto; }

        .cc-input-panel {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 14px;
          padding: 16px 18px;
          margin-bottom: 12px;
        }
        .cc-input-head {
          display:flex; justify-content:space-between; align-items:center;
          gap:12px; flex-wrap:wrap; margin-bottom: 12px;
        }
        #cc-input {
          width:100%; min-height: 200px; max-height: 400px;
          padding: 14px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary); border-radius: 10px;
          font-family: var(--font-mono); font-size: 13px; color: var(--text-primary);
          resize: vertical; line-height: 1.55;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        #cc-input::placeholder { color: var(--text-placeholder); }
        #cc-input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-primary-ring);
        }
        .cc-input-foot {
          display:flex; justify-content:space-between; align-items:center; margin-top: 10px;
        }

        .cc-btn {
          display:inline-flex; align-items:center; gap:6px;
          padding: 7px 12px; border-radius:8px; font-size:12px; font-weight:600;
          cursor:pointer; border: 1px solid transparent; transition: all 0.15s;
          font-family: inherit;
        }
        .cc-btn-ghost {
          background: transparent; border-color: var(--border-primary);
          color: var(--text-secondary);
        }
        .cc-btn-ghost:hover { border-color: var(--border-hover); color: var(--text-primary); background: var(--bg-hover); }
        .cc-btn-primary {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #0a0a0a; font-weight: 700; padding: 9px 18px; font-size:13px;
          box-shadow: 0 4px 14px rgba(34,197,94,0.3);
        }
        .cc-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(34,197,94,0.45); }
        .cc-btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; box-shadow:none; }

        /* Summary */
        .cc-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          margin: 12px 0 16px;
        }
        .cc-stat {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 14px 16px;
          position: relative;
          overflow: hidden;
        }
        .cc-stat::before {
          content:''; position:absolute; top:0; left:0; right:0; height:3px;
          background: var(--accent-primary);
        }
        .cc-stat.ok::before  { background: var(--color-success); }
        .cc-stat.warn::before{ background: var(--color-warning); }
        .cc-stat.bad::before { background: var(--color-danger);  }
        .cc-stat.mut::before { background: var(--text-tertiary); }
        .cc-stat-label { font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-tertiary); font-weight:700; margin-bottom:6px; }
        .cc-stat-value { font-size:22px; font-weight:800; color:var(--text-primary); line-height:1; font-family: var(--font-mono); }
        .cc-stat-sub   { font-size:11px; color:var(--text-tertiary); margin-top:4px; }

        /* Filters */
        .cc-filter-bar {
          display:flex; justify-content:space-between; align-items:center;
          padding: 10px 14px; margin-bottom: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary); border-radius: 12px;
          gap: 10px; flex-wrap: wrap;
        }
        .cc-tabs {
          display:flex; background:var(--bg-tertiary); border-radius: 8px; padding: 3px; gap:2px;
          border: 1px solid var(--border-subtle);
        }
        .cc-tab {
          padding: 6px 12px; border-radius: 6px; font-size:12px; font-weight:600;
          border:none; background:transparent; color:var(--text-secondary); cursor:pointer;
          transition: all 0.15s;
        }
        .cc-tab.active { background: var(--accent-primary); color:#0a0a0a; }
        .cc-tab:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
        .cc-select {
          background: var(--bg-tertiary); border:1px solid var(--border-primary);
          color: var(--text-primary); font-size:12px; padding:6px 10px; border-radius:8px;
          font-family: inherit; cursor: pointer;
        }

        /* Results list */
        .cc-results {
          display:flex; flex-direction:column; gap:8px;
        }
        .cc-row {
          background: var(--bg-secondary); border: 1px solid var(--border-primary);
          border-radius: 12px; padding: 14px 16px;
          display:grid; grid-template-columns: 32px 1fr auto; gap: 14px; align-items:center;
          transition: all 0.15s;
        }
        .cc-row:hover { border-color: var(--border-hover); background: var(--bg-hover); }
        .cc-row.v-valid-format { border-left: 3px solid var(--color-success); }
        .cc-row.v-valid-luhn   { border-left: 3px solid var(--color-warning); }
        .cc-row.v-invalid      { border-left: 3px solid var(--color-danger);  }
        .cc-row.v-malformed    { border-left: 3px solid var(--text-tertiary); }

        .cc-row-brand {
          width: 32px; height: 32px; border-radius: 8px;
          display:flex; align-items:center; justify-content:center;
          color:#fff; font-size:10px; font-weight:800; letter-spacing:0.5px;
          text-transform: uppercase; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .cc-row-main {
          display:flex; flex-direction:column; gap:4px; min-width:0;
        }
        .cc-row-top {
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
        }
        .cc-row-pan {
          font-family: var(--font-mono); font-size: 14px; font-weight:700;
          color: var(--text-primary); letter-spacing: 1px;
        }
        .cc-row-exp {
          font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary);
          background: var(--bg-tertiary); padding: 1px 8px; border-radius:5px;
        }
        .cc-row-meta {
          font-size: 11.5px; color: var(--text-tertiary);
          display:flex; gap:8px; flex-wrap:wrap; align-items:center;
        }
        .cc-row-meta .sep { opacity: 0.4; }
        .cc-row-actions {
          display:flex; gap:6px; align-items:center;
        }
        .cc-verdict {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
          padding: 4px 10px; border-radius: 6px; font-family: var(--font-mono);
        }
        .cc-icon-btn {
          width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border-primary);
          background: var(--bg-tertiary); color: var(--text-secondary);
          display:flex; align-items:center; justify-content:center; cursor:pointer;
          transition: all 0.15s;
        }
        .cc-icon-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
        .cc-icon-btn.copied { border-color: var(--color-success); color: var(--color-success); background: var(--color-success-muted); }
        .cc-flag {
          font-size:10.5px; padding:2px 6px; border-radius:4px;
          background: rgba(239,68,68,0.12); color: var(--color-danger); font-weight:600;
        }

        .cc-empty {
          text-align:center; padding: 60px 20px;
          color: var(--text-muted); font-size:13px;
          border: 1px dashed var(--border-primary); border-radius: 12px;
        }

        /* ── Mobile ────────────────────────────────────────── */
        @media (max-width: 640px) {
          .cc-checker-page .page-header { flex-direction: column; align-items: stretch; }

          .cc-input-panel { padding: 12px; border-radius: 12px; }
          .cc-input-head {
            flex-direction: column; align-items: stretch; gap: 10px;
          }
          .cc-input-head > div:last-child {
            flex-wrap: wrap; gap: 6px;
          }
          .cc-input-head .cc-btn { flex: 1 1 auto; justify-content: center; }
          #cc-input { font-size: 12px; min-height: 160px; }
          .cc-input-foot {
            flex-direction: column; gap: 10px; align-items: stretch;
          }
          .cc-input-foot > div:first-child { justify-content: space-between; }
          .cc-btn-primary { width: 100%; justify-content: center; }

          .cc-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .cc-stat { padding: 10px 12px; }
          .cc-stat-value { font-size: 18px; }

          .cc-filter-bar {
            flex-direction: column; align-items: stretch; gap: 8px;
            padding: 10px;
          }
          .cc-tabs { overflow-x: auto; }
          .cc-filter-bar > div:last-child { flex-wrap: wrap; }
          .cc-filter-bar .cc-select { flex: 1 1 auto; }
          .cc-filter-bar .cc-btn { flex: 1 1 auto; justify-content: center; }

          .cc-row {
            grid-template-columns: 28px 1fr;
            padding: 12px;
            gap: 10px;
          }
          .cc-row-actions {
            grid-column: 1 / -1;
            justify-content: space-between;
            border-top: 1px solid var(--border-subtle);
            padding-top: 8px;
            margin-top: 4px;
          }
          .cc-row-pan { font-size: 12.5px; letter-spacing: 0.5px; word-break: break-all; }
          .cc-row-top { gap: 6px; }
        }
      </style>
    `;
  }

  // ── Render helpers ─────────────────────────────────────────────────────
  function renderSummary(sum) {
    if (!sum) return;
    const el = document.getElementById('cc-summary');
    if (!el) return;

    el.style.display = 'grid';
    el.innerHTML = `
      <div class="cc-stat">
        <div class="cc-stat-label">Total</div>
        <div class="cc-stat-value">${sum.total}</div>
      </div>
      <div class="cc-stat ok">
        <div class="cc-stat-label">Format Valid</div>
        <div class="cc-stat-value">${sum.valid_format}</div>
        <div class="cc-stat-sub">Luhn + brand + expiry</div>
      </div>
      <div class="cc-stat warn">
        <div class="cc-stat-label">Luhn Only</div>
        <div class="cc-stat-value">${sum.valid_luhn}</div>
        <div class="cc-stat-sub">Missing / expired date</div>
      </div>
      <div class="cc-stat bad">
        <div class="cc-stat-label">Invalid</div>
        <div class="cc-stat-value">${sum.invalid}</div>
        <div class="cc-stat-sub">Failed Luhn</div>
      </div>
      <div class="cc-stat mut">
        <div class="cc-stat-label">Malformed</div>
        <div class="cc-stat-value">${sum.malformed}</div>
        <div class="cc-stat-sub">Bad length / parse</div>
      </div>
      ${Object.entries(sum.by_brand || {}).sort((a,b) => b[1]-a[1]).slice(0,4).map(([b, n]) => `
        <div class="cc-stat" style="--brand:${brandColor(b)};">
          <div class="cc-stat-label" style="color:${brandColor(b)};">${esc(b)}</div>
          <div class="cc-stat-value">${n}</div>
        </div>
      `).join('')}
    `;
  }

  function renderResults() {
    const el = document.getElementById('cc-results');
    if (!el) return;

    let filtered = lastResults;
    if (currentFilter !== 'all') {
      filtered = filtered.filter(r => r.verdict === currentFilter);
    }
    if (brandFilter !== 'all') {
      filtered = filtered.filter(r => (r.brand || 'unknown') === brandFilter);
    }

    if (!filtered.length) {
      el.innerHTML = `<div class="cc-empty">No cards match the current filter.</div>`;
      return;
    }

    el.innerHTML = filtered.map((r, i) => {
      const brand = r.brand || 'unk';
      const v = verdictColor(r.verdict);
      const bank = r.binInfo?.bank?.name || '';
      const country = r.binInfo?.country
        ? `${r.binInfo.country.emoji || ''} ${r.binInfo.country.alpha2 || ''}`
        : '';
      const type = r.binInfo?.type || '';
      const level = r.binInfo?.level || '';
      const expTxt = (r.month && r.year) ? `${r.month.padStart(2,'0')}/${r.year.padStart(2,'0')}` : '—';
      const rawFull = [r.number, r.month, r.year, r.cvv?.length ? '' : ''].filter(Boolean).join('|');
      const copyStr = [r.number, r.month, r.year].filter(Boolean).join('|');

      return `
        <div class="cc-row v-${r.verdict}" data-idx="${i}">
          <div class="cc-row-brand" style="background:${brandColor(brand)};">${esc(brand.slice(0,4).toUpperCase())}</div>
          <div class="cc-row-main">
            <div class="cc-row-top">
              <span class="cc-row-pan">${esc(r.masked || r.number)}</span>
              <span class="cc-row-exp">${esc(expTxt)}</span>
              ${r.cvv ? `<span class="cc-row-exp">CVV ${esc(r.cvv)}</span>` : ''}
              ${(r.flags || []).map(f => `<span class="cc-flag">${esc(flagLabel(f))}</span>`).join('')}
            </div>
            <div class="cc-row-meta">
              <span>BIN <b style="color:var(--text-secondary); font-family:var(--font-mono);">${esc(r.bin)}</b></span>
              ${bank    ? `<span class="sep">·</span><span>${esc(bank)}</span>` : ''}
              ${country ? `<span class="sep">·</span><span>${country}</span>` : ''}
              ${type    ? `<span class="sep">·</span><span style="text-transform:capitalize;">${esc(type)}</span>` : ''}
              ${level   ? `<span class="sep">·</span><span style="color:var(--accent-primary); font-weight:600;">${esc(level)}</span>` : ''}
            </div>
          </div>
          <div class="cc-row-actions">
            <span class="cc-verdict" style="background:${v.bg}; color:${v.fg};">${v.label}</span>
            <button class="cc-icon-btn" title="Copy full line" data-copy="${esc(copyStr)}" onclick="CCCheckerPage.copyValue(this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function populateBrandFilter() {
    const sel = document.getElementById('cc-brand-filter');
    if (!sel) return;
    const brands = new Set(lastResults.map(r => r.brand || 'unknown'));
    const brandEmoji = {
      visa: '💳', mastercard: '💳', amex: '💳', discover: '💳',
      jcb: '💳', diners: '💳', unionpay: '💳', maestro: '💳', unknown: '❔',
    };
    sel.innerHTML = `<option value="all">🌐 All brands (${lastResults.length})</option>` + [...brands].sort().map(b => {
      const count = lastResults.filter(r => (r.brand || 'unknown') === b).length;
      const em = brandEmoji[b] || '💳';
      return `<option value="${esc(b)}">${em} ${esc(b)} (${count})</option>`;
    }).join('');
  }

  // ── Check flow ──────────────────────────────────────────────────────────
  async function doCheck() {
    const input = document.getElementById('cc-input');
    const enrichEl = document.getElementById('cc-enrich');
    if (!input) return;

    const raw = input.value.trim();
    if (!raw) { window.showToast?.('Paste some cards first', 'warning'); return; }

    const lines = raw.split(/\r?\n/).filter(l => l.trim()).length;
    if (lines > 500) { window.showToast?.('Max 500 lines per batch', 'warning'); return; }

    try { localStorage.setItem(LS_KEY, raw); } catch {}

    const btn = document.getElementById('cc-check-btn');
    const progress = document.getElementById('cc-progress');
    const bar = document.getElementById('cc-progress-bar');
    const label = document.getElementById('cc-progress-label');

    if (btn)      btn.disabled = true;
    if (progress) progress.style.display = 'block';
    if (label)    label.textContent = `Checking ${lines} card${lines === 1 ? '' : 's'}…`;
    if (bar)      bar.style.width = '15%';

    try {
      // Fake mid-flight progress so the bar feels alive during the fetch
      let pct = 15;
      const tick = setInterval(() => {
        pct = Math.min(85, pct + Math.random() * 8);
        if (bar) bar.style.width = pct + '%';
      }, 400);

      const resp = await window.ALPApi._post('/api/card-tools/cc-check', {
        input: raw,
        enrich: enrichEl?.checked !== false,
      });

      clearInterval(tick);
      if (bar) bar.style.width = '100%';

      lastResults = resp.results || [];
      lastSummary = resp.summary || null;
      currentFilter = 'all'; brandFilter = 'all';

      renderSummary(lastSummary);
      populateBrandFilter();

      const bar2 = document.getElementById('cc-filter-bar');
      if (bar2) bar2.style.display = 'flex';

      document.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
      renderResults();

      setTimeout(() => { if (progress) progress.style.display = 'none'; }, 600);
      window.showToast?.(`Checked ${lastResults.length} card${lastResults.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      window.showToast?.(err.message || 'Check failed', 'error');
      if (progress) progress.style.display = 'none';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Exports / clipboard ────────────────────────────────────────────────
  function copyVisible() {
    let filtered = lastResults;
    if (currentFilter !== 'all')  filtered = filtered.filter(r => r.verdict === currentFilter);
    if (brandFilter !== 'all')    filtered = filtered.filter(r => (r.brand || 'unknown') === brandFilter);
    if (!filtered.length) { window.showToast?.('Nothing to copy', 'warning'); return; }
    const text = filtered.map(r => [r.number, r.month, r.year].filter(Boolean).join('|')).join('\n');
    navigator.clipboard.writeText(text).then(
      () => window.showToast?.(`Copied ${filtered.length} line${filtered.length === 1 ? '' : 's'}`, 'success'),
      () => window.showToast?.('Copy failed', 'error'),
    );
  }

  function exportCsv() {
    if (!lastResults.length) { window.showToast?.('Nothing to export', 'warning'); return; }
    const cols = ['bin','number_masked','month','year','brand','verdict','luhn','type','level','bank','country','currency','flags'];
    const rows = lastResults.map(r => [
      r.bin || '',
      r.masked || r.number || '',
      r.month || '',
      r.year || '',
      r.brand || '',
      r.verdict || '',
      r.luhn ? 'true' : 'false',
      r.binInfo?.type || '',
      r.binInfo?.level || '',
      r.binInfo?.bank?.name || '',
      r.binInfo?.country?.name || '',
      r.binInfo?.country?.currency || '',
      (r.flags || []).join(';'),
    ]);
    const csv = [cols, ...rows].map(row =>
      row.map(cell => {
        const s = String(cell == null ? '' : cell);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    a.href = url; a.download = `cc-check-${ts}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyValue(btn) {
    const val = btn.getAttribute('data-copy') || '';
    navigator.clipboard.writeText(val).then(() => {
      btn.classList.add('copied');
      const original = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = original;
      }, 1100);
    }).catch(() => window.showToast?.('Copy failed', 'error'));
  }

  // ── Init ────────────────────────────────────────────────────────────────
  function init() {
    const input = document.getElementById('cc-input');
    const checkBtn = document.getElementById('cc-check-btn');
    const clearBtn = document.getElementById('cc-clear-input');
    const pasteBtn = document.getElementById('cc-paste');
    const sampleBtn = document.getElementById('cc-sample');
    const brandSel = document.getElementById('cc-brand-filter');
    const copyBtn = document.getElementById('cc-copy-visible');
    const csvBtn  = document.getElementById('cc-export-csv');
    const lineC   = document.getElementById('cc-line-count');
    const charC   = document.getElementById('cc-char-count');

    // Restore last input for convenience
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && input) input.value = saved;
    } catch {}

    const updateCounts = () => {
      const t = input?.value || '';
      if (lineC) lineC.textContent = t ? t.split(/\r?\n/).filter(l => l.trim()).length : 0;
      if (charC) charC.textContent = t.length;
    };
    updateCounts();

    if (input) input.addEventListener('input', updateCounts);
    if (checkBtn) checkBtn.addEventListener('click', doCheck);
    if (input) input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doCheck(); }
    });
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (input) { input.value = ''; input.focus(); updateCounts(); }
    });
    if (pasteBtn) pasteBtn.addEventListener('click', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (input) {
          input.value = (input.value ? input.value + '\n' : '') + txt;
          updateCounts();
        }
      } catch { window.showToast?.('Clipboard read denied', 'warning'); }
    });
    if (sampleBtn) sampleBtn.addEventListener('click', () => {
      if (!input) return;
      input.value = [
        '4111111111111111|12|29|123',
        '5555555555554444|08|30|456',
        '378282246310005|05|28|1234',
        '6011111111111117|11|27|999',
        '3530111333300000|07|26|321',
        '1234567890123456|01|20|000',
      ].join('\n');
      updateCounts();
    });

    document.querySelectorAll('.cc-tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.cc-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentFilter = t.dataset.filter;
        renderResults();
      });
    });

    if (brandSel) brandSel.addEventListener('change', () => { brandFilter = brandSel.value; renderResults(); });
    if (copyBtn)  copyBtn.addEventListener('click', copyVisible);
    if (csvBtn)   csvBtn.addEventListener('click', exportCsv);
  }

  function destroy() { /* no timers */ }

  return { render, init, destroy, copyValue };
})();

if (typeof window !== 'undefined') {
  window.CCCheckerPage = CCCheckerPage;
}
