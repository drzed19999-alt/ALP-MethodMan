/**
 * demo-pages-registry.js
 * Registry-tab logic: filter/search/sort, health strip, live capture pulse,
 * per-card orphan chip, duplicate/rescan/test-capture/copy-cURL,
 * mapping visibility, sparkline, import JSON, bulk change form-type,
 * grouping toggle, sticky filter bar, orphan detection.
 */
'use strict';
window.DemoPagesRegistry = (() => {
  function S() { return window.DemoPagesState; }
  function esc(s) { if (!s && s !== 0) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function $(id) { return document.getElementById(id); }
  function getTypeInfo(v) { return window.DemoPagesFields.getTypeInfo(v); }

  // ── State ──────────────────────────────────────────────────────────────────
  let _regSearch    = '';
  let _regFilter    = 'all';    // 'all' | form_type value
  let _regSort      = 'name';   // 'name' | 'views' | 'subs' | 'conversion' | 'recent' | 'type'
  let _regGroupBy   = 'none';   // 'none' | 'type'
  let _healthData   = null;
  let _orphanedIds  = new Set();
  let _socketBound  = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmtAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
    return diff < 60000 ? 'just now' : m < 60 ? `${m}m ago` : h < 24 ? `${h}h ago` : `${d}d ago`;
  }
  function _hexRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function convRate(p) {
    const v = p.views_count || 0, s = p.submissions_count || 0;
    return v > 0 ? (s / v) * 100 : 0;
  }

  // ── Sparkline SVG from analytics endpoint values ──────────────────────────
  function sparklineSvg(values, color) {
    if (!values || !values.length) return '';
    const w = 60, h = 16;
    const max = Math.max(1, ...values);
    const step = w / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function renderFieldPills(fields, opts = {}) {
    if (!Array.isArray(fields) || !fields.length) return '<span style="font-size:11px;color:var(--text-placeholder);">None</span>';
    const max = opts.max || 4;
    return fields.slice(0, max).map(f => `<span class="dp-field-pill">${esc(f.label || f.canonical || f)}</span>`).join('') +
      (fields.length > max ? `<span class="dp-field-pill dp-field-pill--more">+${fields.length - max}</span>` : '');
  }
  function renderMappingPills(mapping) {
    if (!mapping || typeof mapping !== 'object') return '';
    const entries = Object.entries(mapping).filter(([, v]) => v);
    if (!entries.length) return '';
    return entries.slice(0, 3).map(([raw, canon]) =>
      `<span class="dp-map-pill" title="${esc(raw)} → ${esc(canon)}"><span class="dp-map-raw">${esc(raw)}</span><span class="dp-map-arrow">→</span><span class="dp-map-canon">${esc(canon)}</span></span>`
    ).join('') + (entries.length > 3 ? `<span class="dp-field-pill dp-field-pill--more">+${entries.length - 3}</span>` : '');
  }

  // ── Multi-type helpers ───────────────────────────────────────────────────
  function pageHasType(p, t) {
    return String(p.form_type || '').split(',').map(s => s.trim()).includes(t);
  }
  function pageTypes(p) {
    return String(p.form_type || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  // ── Filter / sort / group ─────────────────────────────────────────────────
  function getFilteredPages() {
    let list = [...S().pages];
    if (_regFilter !== 'all')  list = list.filter(p => pageHasType(p, _regFilter));
    if (_regSearch) {
      const q = _regSearch.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.url || '').toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      switch (_regSort) {
        case 'views':      return (b.views_count || 0) - (a.views_count || 0);
        case 'subs':       return (b.submissions_count || 0) - (a.submissions_count || 0);
        case 'conversion': return convRate(b) - convRate(a);
        case 'recent':     return new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0);
        case 'type':       return String(a.form_type).localeCompare(String(b.form_type)) || String(a.name).localeCompare(String(b.name));
        default:           return String(a.name).localeCompare(String(b.name));
      }
    });
    return list;
  }

  // ── Page card ─────────────────────────────────────────────────────────────
  function renderCard(p, idx) {
    const type = getTypeInfo(p.form_type);
    // Support multiple types (comma-separated form_type). Primary drives the
    // card color; secondary badges show alongside so operators know at a
    // glance what a mixed page captures (e.g. login + otp + email_verify).
    const typeList = (window.DemoPagesFields.getTypeInfoList || (() => [type]))(p.form_type);
    const fields = Array.isArray(p.fields_schema) ? p.fields_schema : [];
    const mappings = (p.field_mappings && typeof p.field_mappings === 'object') ? p.field_mappings : {};
    const isSelected = S().selectedPageIds.has(p.id);
    const [cr, cg, cb] = _hexRgb(type.color);
    const cardBg = `linear-gradient(145deg,rgba(${cr},${cg},${cb},.1),rgba(${cr},${cg},${cb},.04))`;
    const cardBorder = `rgba(${cr},${cg},${cb},.28)`;
    const isOrphan = _orphanedIds.has(p.id);

    const views = p.views_count || 0;
    const subs  = p.submissions_count || 0;
    const cr7   = convRate(p);
    const spark = Array.isArray(p._spark) ? p._spark : null;

    const lastActStr = fmtAgo(p.last_activity_at);
    const isLive = p.last_activity_at && (Date.now() - new Date(p.last_activity_at).getTime()) < 60000;

    return `
      <div class="dp-card ${isSelected ? 'dp-card--selected' : ''} ${isLive ? 'dp-card--live' : ''} ${isOrphan ? 'dp-card--orphan' : ''}" data-id="${p.id}"
           style="--dp-accent:${type.color};animation-delay:${Math.min(idx * .05, .35)}s;background:${cardBg};border-color:${isOrphan ? 'rgba(239,68,68,.5)' : cardBorder};">
        <input type="checkbox" class="dp-bulk-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
        <div class="dp-card-head">
          <div class="dp-card-name">${esc(p.name)}</div>
          <div class="dp-type-badge-group">
            ${typeList.slice(0, 3).map(t => `<span class="dp-type-badge" title="${esc(t.value)}" style="background:${t.bg};color:${t.color};">${esc(t.label)}</span>`).join('')}
            ${typeList.length > 3 ? `<span class="dp-type-badge" style="background:rgba(148,163,184,.12);color:#94a3b8;" title="${esc(typeList.slice(3).map(t => t.label).join(', '))}">+${typeList.length - 3}</span>` : ''}
          </div>
        </div>
        ${isOrphan ? `
          <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:6px;margin:6px 0;font-size:10px;font-weight:700;color:#f87171;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            HTML file missing — will 404
          </div>` : ''}
        <div class="dp-url-row">
          <div class="dp-url-path" title="${esc(p.url)}">${esc(p.url)}</div>
          <button class="dp-icon-btn dp-copy-btn" data-url="${esc(p.url)}" title="Copy URL">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <a class="dp-icon-btn" href="${esc(p.url)}" target="_blank" title="Open in tab">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></a>
        </div>
        <div class="dp-card-mini-stats">
          <span class="dp-mini-stat" title="Total views">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span data-stat-views="${p.id}">${views.toLocaleString()}</span>
          </span>
          <span class="dp-mini-stat dp-mini-stat--g" title="Submissions">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span data-stat-subs="${p.id}">${subs.toLocaleString()}</span>
          </span>
          ${views > 0 ? `<span class="dp-mini-stat dp-mini-stat--gold" title="Conversion rate">${cr7.toFixed(0)}%</span>` : `<span class="dp-mini-stat dp-mini-stat--muted">—</span>`}
          ${lastActStr ? `<span class="dp-mini-stat dp-mini-stat--muted" data-stat-last="${p.id}" title="Last activity">${lastActStr}</span>` : ''}
          ${spark ? `<span class="dp-mini-stat dp-mini-stat--muted" title="Last 7 days views">${sparklineSvg(spark, type.color)}</span>` : ''}
        </div>
        <div>
          <div class="dp-fields-label">Captured Fields ${fields.length ? `<span class="dp-field-count">${fields.length}</span>` : ''}</div>
          <div class="dp-fields-row">${renderFieldPills(fields)}</div>
          ${renderMappingPills(mappings) ? `
            <div class="dp-fields-label" style="margin-top:6px;">Mappings</div>
            <div class="dp-fields-row">${renderMappingPills(mappings)}</div>` : ''}
        </div>
        <div class="dp-card-actions">
          <button class="dp-btn dp-btn-preview dp-preview-btn" data-id="${p.id}" data-url="${esc(p.url)}" title="Preview page">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Preview
          </button>
          <button class="dp-btn dp-btn-analytics dp-analytics-btn" data-id="${p.id}" title="View analytics">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>Analytics
          </button>
          <button class="dp-btn dp-btn-testcap dp-testcap-btn" data-id="${p.id}" title="Fire a synthetic capture event to test wiring">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2v6l-4 6h14l-4-6V2"/><line x1="9" y1="2" x2="15" y2="2"/></svg>Test
          </button>
          <button class="dp-btn dp-btn-rescan dp-rescan-btn" data-id="${p.id}" title="Re-scan HTML for form fields">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 116.36 5.64L23 10"/></svg>Rescan
          </button>
          <button class="dp-btn dp-btn-curl dp-curl-btn" data-id="${p.id}" title="Copy as cURL POST">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>cURL
          </button>
          <button class="dp-btn dp-btn-dup dp-dup-btn" data-id="${p.id}" title="Duplicate this page">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="dp-btn dp-btn-edit dp-edit-btn" data-id="${p.id}" title="Edit page">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="dp-btn dp-btn-delete dp-delete-btn" data-id="${p.id}" data-name="${esc(p.name)}" title="Delete page">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>`;
  }

  // ── Health strip + filter/search/sort/group toolbar ───────────────────────
  function renderToolbar() {
    const pages = S().pages || [];
    const total = pages.length;
    const capturing = pages.filter(p => (p.submissions_count || 0) > 0).length;
    const orphaned = _orphanedIds.size;
    const captures = pages.reduce((a, p) => a + (p.submissions_count || 0), 0);
    const capsToday = _healthData?.capturesToday ?? '—';

    // Count each type independently — a multi-type page shows in every chip
    // whose type it carries (e.g. `otp,email_verify` → counted in both OTP
    // and Email Verification chips).
    const typeCounts = pages.reduce((acc, p) => {
      pageTypes(p).forEach(t => { acc[t] = (acc[t] || 0) + 1; });
      return acc;
    }, {});
    const typeList = Object.keys(typeCounts).sort();

    const healthHtml = `
      <div class="dp-reg-health">
        <span class="dp-reg-h-item"><strong>${total}</strong> page${total !== 1 ? 's' : ''}</span>
        <span class="dp-reg-h-item dp-reg-h-item--good"><strong>${capturing}</strong> capturing</span>
        <span class="dp-reg-h-item ${orphaned ? 'dp-reg-h-item--bad' : ''}"><strong>${orphaned}</strong> orphaned</span>
        <span class="dp-reg-h-item"><strong>${captures.toLocaleString()}</strong> total captures</span>
        <span class="dp-reg-h-item dp-reg-h-item--live"><span class="dp-live-dot"></span><strong>${capsToday}</strong> today</span>
      </div>`;

    const filterChips = ['all'].concat(typeList).map(t => {
      const label = t === 'all' ? `All (${total})` : `${getTypeInfo(t).label} (${typeCounts[t]})`;
      return `<button class="dp-reg-chip${_regFilter === t ? ' dp-reg-chip--active' : ''}" data-reg-filter="${esc(t)}">${label}</button>`;
    }).join('');

    return `
      <div class="dp-reg-toolbar">
        ${healthHtml}
        <div class="dp-reg-controls">
          <div class="dp-reg-chips">${filterChips}</div>
          <div style="flex:1;"></div>
          <input id="dp-reg-search" class="dp-reg-search" type="text" placeholder="Search pages…" value="${esc(_regSearch)}">
          <select id="dp-reg-sort" class="dp-sort-select" title="Sort by">
            <option value="name"${_regSort === 'name' ? ' selected' : ''}>Name</option>
            <option value="views"${_regSort === 'views' ? ' selected' : ''}>Views</option>
            <option value="subs"${_regSort === 'subs' ? ' selected' : ''}>Submissions</option>
            <option value="conversion"${_regSort === 'conversion' ? ' selected' : ''}>Conversion</option>
            <option value="recent"${_regSort === 'recent' ? ' selected' : ''}>Recent activity</option>
            <option value="type"${_regSort === 'type' ? ' selected' : ''}>Type</option>
          </select>
          <div class="dp-view-seg" role="tablist" aria-label="Group mode">
            <button data-group="none" class="dp-view-seg-btn${_regGroupBy === 'none' ? ' dp-view-seg-btn--active' : ''}" title="Flat grid">Flat</button>
            <button data-group="type" class="dp-view-seg-btn${_regGroupBy === 'type' ? ' dp-view-seg-btn--active' : ''}" title="Group by type">By type</button>
          </div>
        </div>
      </div>`;
  }

  // ── Grid render ───────────────────────────────────────────────────────────
  function repaintGrid() {
    const grid = $('dp-grid'); if (!grid) return;
    // .dp-grid is a CSS grid by default (columns) — override to block so our
    // toolbar sits above the cards instead of becoming its first column.
    grid.style.display = 'block';
    const countEl = $('dp-tab-reg-count'); if (countEl) countEl.textContent = S().pages.length || '';
    if (!S().pages.length) {
      grid.innerHTML = renderToolbar() + `
        <div class="dp-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
          <p>No pages registered yet.<br><span style="font-size:12px;color:var(--text-muted);">Upload HTML files &mdash; known basenames (login, error, exit, otp…) auto-register with detected fields.</span></p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
            <button class="dp-add-btn" id="dp-empty-add">+ Add Page Entry</button>
            <button class="dp-btn-ghost" onclick="window.DemoPagesPage?.switchTab('files', true)">Go to Upload</button>
            <button class="dp-btn-ghost" id="dp-empty-import">Import JSON</button>
          </div>
        </div>`;
      hideBulkToolbar();
      $('dp-empty-add')?.addEventListener('click', () => window.DemoPagesModals?.openAddModal());
      $('dp-empty-import')?.addEventListener('click', triggerImport);
      wireToolbar();
      return;
    }

    const filtered = getFilteredPages();
    let cardsHtml = '';
    if (_regGroupBy === 'type') {
      const groups = filtered.reduce((acc, p) => {
        // Multi-type pages appear under every group they belong to
        pageTypes(p).forEach(t => { (acc[t] = acc[t] || []).push(p); });
        return acc;
      }, {});
      const order = Object.keys(groups).sort();
      cardsHtml = order.map(t => {
        const info = getTypeInfo(t);
        return `
          <div class="dp-reg-group-header" style="color:${info.color};">
            <span class="dp-reg-group-dot" style="background:${info.color};"></span>
            <span>${info.label}</span>
            <span class="dp-reg-group-count">${groups[t].length}</span>
          </div>
          <div class="dp-reg-grid-inner">${groups[t].map((p, i) => renderCard(p, i)).join('')}</div>`;
      }).join('');
    } else {
      cardsHtml = `<div class="dp-reg-grid-inner">${filtered.map((p, i) => renderCard(p, i)).join('')}</div>`;
      if (!filtered.length) cardsHtml = `<div class="dp-empty"><p>No pages match "<strong>${esc(_regSearch)}</strong>" / filter.</p></div>`;
    }

    grid.innerHTML = renderToolbar() + cardsHtml;
    wireToolbar();
    bindCardEvents();
    updateBulkToolbar();

    // Fetch sparklines lazily (once per session per page)
    _lazyFetchSparklines(filtered);

    // Bind socket for live capture pulse once
    if (!_socketBound) _bindSocket();
  }

  function wireToolbar() {
    document.querySelectorAll('.dp-reg-chip').forEach(b => b.addEventListener('click', () => { _regFilter = b.dataset.regFilter; repaintGrid(); }));
    const search = $('dp-reg-search');
    if (search) {
      search.addEventListener('input', () => { _regSearch = search.value; repaintGrid(); });
      if (_regSearch) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    }
    const sort = $('dp-reg-sort');
    if (sort) sort.addEventListener('change', () => { _regSort = sort.value; repaintGrid(); });
    document.querySelectorAll('.dp-view-seg-btn[data-group]').forEach(b => b.addEventListener('click', () => {
      const g = b.dataset.group;
      if (g === _regGroupBy) return;
      _regGroupBy = g; repaintGrid();
    }));
  }

  function bindCardEvents() {
    document.querySelectorAll('.dp-copy-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      window.copyToClipboard(b.dataset.url, 'URL copied!');
      b.classList.add('copied'); setTimeout(() => b.classList.remove('copied'), 1500);
    }));
    document.querySelectorAll('.dp-preview-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); showPreviewModal(parseInt(b.dataset.id, 10), b.dataset.url);
    }));
    document.querySelectorAll('.dp-analytics-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); showAnalyticsModal(parseInt(b.dataset.id, 10));
    }));
    document.querySelectorAll('.dp-edit-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); window.DemoPagesModals.openEditModal(parseInt(b.dataset.id, 10));
    }));
    document.querySelectorAll('.dp-delete-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); window.DemoPagesModals.openDeleteModal(parseInt(b.dataset.id, 10), b.dataset.name);
    }));
    document.querySelectorAll('.dp-testcap-btn').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(b.dataset.id, 10);
      b.disabled = true; b.style.opacity = '.6';
      try {
        const r = await window.ALPApi.testCapturePage(id);
        window.showToast(`Test capture fired — ${r.count} field${r.count !== 1 ? 's' : ''} logged`, 'success');
        await window.DemoPagesPage.loadPages();
      } catch (err) { window.showToast('Test capture failed: ' + err.message, 'error'); }
      finally { b.disabled = false; b.style.opacity = ''; }
    }));
    document.querySelectorAll('.dp-rescan-btn').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(b.dataset.id, 10);
      b.disabled = true; b.style.opacity = '.6';
      try {
        const r = await window.ALPApi.rescanPageFields(id);
        window.showToast(`Re-scanned — ${r.fields.length} field${r.fields.length !== 1 ? 's' : ''} (${r.strategy})`, 'success');
        await window.DemoPagesPage.loadPages();
      } catch (err) {
        if (err.data?.orphaned) window.showToast('HTML file is missing — page is orphaned', 'error');
        else window.showToast('Rescan failed: ' + err.message, 'error');
      }
      finally { b.disabled = false; b.style.opacity = ''; }
    }));
    document.querySelectorAll('.dp-curl-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); copyAsCurl(parseInt(b.dataset.id, 10));
    }));
    document.querySelectorAll('.dp-dup-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); duplicatePage(parseInt(b.dataset.id, 10));
    }));
    document.querySelectorAll('.dp-bulk-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = parseInt(cb.dataset.id, 10);
        cb.checked ? S().selectedPageIds.add(id) : S().selectedPageIds.delete(id);
        cb.closest('.dp-card')?.classList.toggle('dp-card--selected', cb.checked);
        updateBulkToolbar();
      });
    });
  }

  // ── Duplicate: open Add modal pre-filled from a page ──────────────────────
  function duplicatePage(id) {
    const p = S().pages.find(x => x.id === id); if (!p) return;
    const suffix = ' (copy)';
    const base = String(p.url).split('/').pop().replace(/\.html?$/i, '');
    const newBase = base + '-copy';
    const newUrl = p.url.replace(base, newBase);
    window.DemoPagesModals.openAddModal(null, {
      name: (p.name || '') + suffix,
      url: newUrl,
      form_type: p.form_type,
      fields_schema: JSON.parse(JSON.stringify(p.fields_schema || [])),
      field_mappings: JSON.parse(JSON.stringify(p.field_mappings || {})),
    });
  }

  // ── Copy as cURL ──────────────────────────────────────────────────────────
  function copyAsCurl(id) {
    const p = S().pages.find(x => x.id === id); if (!p) return;
    const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
    const apiKey = site?.api_key || '<API_KEY>';
    let fields = [];
    try { fields = Array.isArray(p.fields_schema) ? p.fields_schema : []; } catch {}
    const payload = { apiKey, sessionId: '<SESSION_ID>', page: p.url, fields: {} };
    for (const f of fields) {
      const raw = typeof f === 'string' ? f : (f.canonical || f.label);
      if (raw) payload.fields[raw] = 'TEST';
    }
    const origin = window.location.origin;
    const curl = `curl -X POST '${origin}/api/tracker/formdata' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`;
    navigator.clipboard.writeText(curl).then(
      () => window.showToast('cURL copied — paste into a terminal to POST a test capture', 'success'),
      () => window.showToast('Copy failed — clipboard blocked', 'error')
    );
  }

  // ── Sparkline lazy fetcher ────────────────────────────────────────────────
  const _sparkCache = new Map(); // pageId -> [values]
  let _sparkFetchInFlight = false;
  async function _lazyFetchSparklines(pages) {
    // Apply cached values immediately (no fetch needed)
    for (const p of pages) if (_sparkCache.has(p.id)) p._spark = _sparkCache.get(p.id);
    if (_sparkFetchInFlight) return;
    // Only fetch top 12 most-active pages missing from the cache
    const toFetch = pages
      .filter(p => !_sparkCache.has(p.id) && (p.views_count || 0) > 0)
      .sort((a, b) => (b.views_count || 0) - (a.views_count || 0))
      .slice(0, 12);
    if (!toFetch.length) return;
    _sparkFetchInFlight = true;
    try {
      await Promise.all(toFetch.map(async p => {
        try {
          const a = await window.ALPApi.getPageAnalytics(p.id);
          const vals = (a.viewsByDay || []).slice(-7).map(d => d.count || 0);
          _sparkCache.set(p.id, vals);
        } catch { _sparkCache.set(p.id, []); }
      }));
    } finally {
      _sparkFetchInFlight = false;
    }
    // Single repaint once every sparkline is in cache
    repaintGrid();
  }

  // ── Socket live-capture pulse + view/submission bumps ─────────────────────
  function _bindSocket() {
    if (!window.ALPSocket || !window.ALPSocket.on) return;
    _socketBound = true;
    window.ALPSocket.on('admin:test-capture', (d) => _pulsePage(d.page_id, +1));
    // Real captures land in activity feed; there isn't a dedicated per-page
    // socket event, so we watch admin:session:update — when metadata.formData
    // arrives, we know a submission happened on that session's current_page.
    window.ALPSocket.on('admin:session:update', (s) => {
      if (!s) return;
      const path = String(s.current_page || '').toLowerCase();
      const page = (S().pages || []).find(p => path.includes((String(p.url).split('/').pop() || '').toLowerCase()));
      if (page && s.metadata && (s.metadata.formData || (typeof s.metadata === 'string' && s.metadata.includes('formData')))) {
        _pulsePage(page.id, +1);
      }
    });
  }
  function _pulsePage(pageId, subsDelta = 0) {
    const p = S().pages.find(x => x.id === pageId);
    if (p && subsDelta) {
      p.submissions_count = (p.submissions_count || 0) + subsDelta;
      p.last_activity_at = new Date().toISOString();
    }
    const card = document.querySelector(`.dp-card[data-id="${pageId}"]`);
    if (!card) return;
    card.classList.remove('dp-card--pulse'); void card.offsetWidth; card.classList.add('dp-card--pulse');
    const subEl = card.querySelector(`[data-stat-subs="${pageId}"]`);
    if (subEl && p) subEl.textContent = (p.submissions_count || 0).toLocaleString();
    const lastEl = card.querySelector(`[data-stat-last="${pageId}"]`);
    if (lastEl) lastEl.textContent = 'just now';
  }

  // ── Bulk toolbar (Delete / Change type / Export / Import) ─────────────────
  function updateBulkToolbar() {
    const count = S().selectedPageIds.size;
    const toolbar = $('dp-bulk-toolbar');
    const selectAllBtn = $('dp-select-all-btn');
    if (count > 0) {
      if (!toolbar) { createBulkToolbar(); }
      else { toolbar.style.display = 'flex'; const cs = toolbar.querySelector('.dp-bulk-count'); if (cs) cs.textContent = count; }
    } else if (toolbar) { toolbar.style.display = 'none'; }
    if (selectAllBtn) {
      const allSelected = S().pages.length > 0 && S().selectedPageIds.size === S().pages.length;
      selectAllBtn.innerHTML = allSelected
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Deselect All'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Select All';
    }
  }
  function createBulkToolbar() {
    const regPanel = $('dp-panel-registry'); if (!regPanel) return;
    const panelInner = regPanel.querySelector('.dp-panel-inner'); if (!panelInner) return;
    if ($('dp-bulk-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'dp-bulk-toolbar'; toolbar.className = 'dp-bulk-toolbar';
    toolbar.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex:1;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        <span style="font-size:13px;font-weight:700;color:var(--text-primary);"><span class="dp-bulk-count">0</span> selected</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <select id="dp-bulk-type-select" class="dp-sort-select" title="Change form type">
          <option value="">Change type to…</option>
          <option value="credentials">Credentials</option>
          <option value="otp">OTP</option>
          <option value="loading">Loading</option>
          <option value="error">Error</option>
          <option value="exit">Exit</option>
          <option value="general">General</option>
        </select>
        <button id="dp-bulk-delete-btn" class="dp-bulk-action-btn dp-bulk-action-btn--danger">Delete</button>
        <button id="dp-bulk-export-btn" class="dp-bulk-action-btn">Export JSON</button>
        <button id="dp-bulk-cancel-btn" class="dp-bulk-action-btn dp-bulk-action-btn--ghost">Cancel</button>
      </div>`;
    const header = panelInner.querySelector('div[style*="display:flex"]');
    panelInner.insertBefore(toolbar, header || panelInner.firstChild);
    $('dp-bulk-delete-btn')?.addEventListener('click', bulkDeletePages);
    $('dp-bulk-export-btn')?.addEventListener('click', bulkExportPages);
    $('dp-bulk-cancel-btn')?.addEventListener('click', clearBulkSelection);
    $('dp-bulk-type-select')?.addEventListener('change', bulkChangeType);
  }
  function hideBulkToolbar() { const t = $('dp-bulk-toolbar'); if (t) t.style.display = 'none'; }
  function clearBulkSelection() {
    S().selectedPageIds.clear();
    document.querySelectorAll('.dp-bulk-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.dp-card--selected').forEach(card => card.classList.remove('dp-card--selected'));
    updateBulkToolbar();
  }
  async function bulkChangeType(e) {
    const sel = e.target;
    const newType = sel.value;
    if (!newType) return;
    const ids = Array.from(S().selectedPageIds);
    sel.value = '';
    if (!ids.length) return;
    try {
      await window.ALPApi.bulkUpdatePages(ids, { form_type: newType });
      window.showToast(`Changed ${ids.length} page(s) to ${newType}`, 'success');
      await window.DemoPagesPage.loadPages();
      clearBulkSelection();
    } catch (err) { window.showToast('Bulk change failed: ' + err.message, 'error'); }
  }
  async function bulkDeletePages() {
    const ids = Array.from(S().selectedPageIds); if (!ids.length) return;
    window.showModal({
      title: 'Delete Multiple Pages', type: 'danger', width: '520px',
      content: `<p style="font-size:14px;color:var(--text-secondary);margin:0 0 14px;">Delete <strong style="color:var(--text-primary);">${ids.length} page${ids.length !== 1 ? 's' : ''}</strong>?</p>
        <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:12px 14px;">
          <div style="font-size:12px;color:var(--text-secondary);">${S().pages.filter(p => ids.includes(p.id)).map(p => `<div>&bull; ${esc(p.name)}</div>`).join('')}</div>
        </div>`,
      confirmText: `Delete ${ids.length} Page${ids.length !== 1 ? 's' : ''}`,
      onConfirm: async () => {
        try {
          await window.ALPApi.bulkDeletePages(ids);
          window.showToast(`Deleted ${ids.length} page${ids.length !== 1 ? 's' : ''}`, 'success');
          S().pages = S().pages.filter(p => !ids.includes(p.id));
          clearBulkSelection(); repaintGrid();
        } catch (err) { window.showToast('Bulk delete failed: ' + err.message, 'error'); }
      }
    });
  }
  async function bulkExportPages() {
    const ids = Array.from(S().selectedPageIds); if (!ids.length) return;
    const selectedPages = S().pages.filter(p => ids.includes(p.id));
    const data = JSON.stringify({
      exported_at: new Date().toISOString(),
      website_id: S().selectedWebsiteId,
      pages: selectedPages.map(p => ({ name: p.name, url: p.url, form_type: p.form_type, fields_schema: p.fields_schema, field_mappings: p.field_mappings }))
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `pages-export-${Date.now()}.json` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    window.showToast(`Exported ${ids.length} page${ids.length !== 1 ? 's' : ''} to JSON`, 'success');
  }

  // ── Import from JSON file ─────────────────────────────────────────────────
  function triggerImport() {
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = 'application/json,.json';
    picker.style.display = 'none';
    document.body.appendChild(picker);
    picker.addEventListener('change', async () => {
      const file = picker.files && picker.files[0];
      document.body.removeChild(picker);
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const pages = Array.isArray(data.pages) ? data.pages : (Array.isArray(data) ? data : []);
        if (!pages.length) { window.showToast('No pages found in file', 'warning'); return; }
        const r = await window.ALPApi.importPages(S().selectedWebsiteId, pages, 'upsert');
        window.showToast(`Import: +${r.created} created, ${r.updated} updated, ${r.skipped} skipped`, 'success');
        await window.DemoPagesPage.loadPages();
      } catch (err) { window.showToast('Import failed: ' + err.message, 'error'); }
    });
    picker.click();
  }

  // ── Preview Modal (with device toggle) ────────────────────────────────────
  function showPreviewModal(pageId, pageUrl) {
    const page = S().pages.find(p => p.id === pageId); if (!page) return;
    const previewUrl = pageUrl + (pageUrl.includes('?') ? '&' : '?') + '_alp_preview=1';
    window.showModal({
      title: `Preview: ${page.name}`, width: '90vw', maxWidth: '1400px',
      content: `
        <div id="dp-preview-controls" style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;">
          <div style="flex:1;display:flex;align-items:center;gap:8px;">
            <button class="dp-preview-size-btn dp-preview-size-btn--active" data-width="100%">Desktop</button>
            <button class="dp-preview-size-btn" data-width="768px">Tablet</button>
            <button class="dp-preview-size-btn" data-width="375px">Mobile</button>
          </div>
          <button id="dp-preview-refresh" class="dp-preview-size-btn">Refresh</button>
          <a href="${esc(previewUrl)}" target="_blank" class="dp-preview-size-btn" style="text-decoration:none;">Open in Tab</a>
        </div>
        <!-- Center-stage: flex parent + max-width on the wrap keeps the
             narrower Tablet/Mobile frames centered instead of left-aligned. -->
        <div style="display:flex;justify-content:center;background:rgba(0,0,0,.2);padding:14px;border-radius:10px;">
          <div id="dp-preview-frame-wrap" style="width:100%;max-width:100%;height:650px;border:1px solid rgba(255,255,255,.12);border-radius:10px;overflow:hidden;background:#fff;transition:width .25s cubic-bezier(.2,.9,.3,1),max-width .25s;box-shadow:0 8px 24px rgba(0,0,0,.4);">
            <iframe id="dp-preview-iframe" src="${esc(previewUrl)}" style="width:100%;height:100%;border:none;background:#fff;"></iframe>
          </div>
        </div>`,
      confirmText: 'Close', hideCancel: true, onConfirm: () => {}
    });
    setTimeout(() => {
      const wrap = $('dp-preview-frame-wrap'); const iframe = $('dp-preview-iframe');
      document.querySelectorAll('.dp-preview-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!btn.dataset.width) return;
          document.querySelectorAll('.dp-preview-size-btn').forEach(b => b.classList.remove('dp-preview-size-btn--active'));
          btn.classList.add('dp-preview-size-btn--active');
          if (wrap) {
            // Setting BOTH width and max-width keeps the wrap centered inside
            // the flex parent no matter which device is picked.
            wrap.style.width = btn.dataset.width;
            wrap.style.maxWidth = btn.dataset.width;
          }
        });
      });
      $('dp-preview-refresh')?.addEventListener('click', () => { if (iframe) iframe.src = iframe.src; });
    }, 100);
  }

  // ── Analytics Modal (unchanged behavior, cleaner render) ──────────────────
  async function showAnalyticsModal(pageId) {
    const page = S().pages.find(p => p.id === pageId); if (!page) return;
    window.showModal({
      title: `Analytics: ${page.name}`, width: '900px',
      content: `<div style="display:flex;align-items:center;justify-content:center;padding:40px;color:var(--text-secondary);">Loading analytics…</div>`,
      confirmText: 'Close', hideCancel: true, onConfirm: () => {}
    });
    try {
      const analytics = await window.ALPApi.getPageAnalytics(pageId);
      const stats = analytics.stats || {};
      const viewsByDay = analytics.viewsByDay || [];
      const labels = viewsByDay.map(d => { const dt = new Date(d.date); return `${dt.getMonth() + 1}/${dt.getDate()}`; });
      const viewData = viewsByDay.map(d => d.count);
      const cr = stats.views > 0 ? ((stats.submissions / stats.views) * 100).toFixed(1) : '0.0';
      let lastStr = 'Never';
      if (stats.lastActivity) lastStr = fmtAgo(stats.lastActivity);
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        const contentDiv = modalContent.querySelector('.modal-body > div');
        if (contentDiv) {
          contentDiv.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
              <div style="padding:14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15);border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Views</div><div style="font-size:24px;font-weight:800;color:#a5b4fc;">${stats.views || 0}</div></div>
              <div style="padding:14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Submissions</div><div style="font-size:24px;font-weight:800;color:#6ee7b7;">${stats.submissions || 0}</div></div>
              <div style="padding:14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.15);border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Conversion</div><div style="font-size:24px;font-weight:800;color:#fcd34d;">${cr}%</div></div>
            </div>
            <div style="padding:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Views (Last 30 Days)</div><canvas id="dp-analytics-chart" width="800" height="230"></canvas></div>
            <div style="display:flex;gap:16px;padding:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;">
              <div style="flex:1;"><div style="font-size:11px;color:var(--text-secondary);">Last Activity</div><div style="font-size:12px;font-weight:600;color:var(--text-primary);">${lastStr}</div></div>
              <div style="flex:1;"><div style="font-size:11px;color:var(--text-secondary);">Created</div><div style="font-size:12px;font-weight:600;color:var(--text-primary);">${stats.createdAt ? new Date(stats.createdAt).toLocaleDateString() : 'Unknown'}</div></div>
            </div>`;
          setTimeout(() => {
            const canvas = $('dp-analytics-chart'); if (!canvas) return;
            const ctx = canvas.getContext('2d'); if (!ctx) return;
            const pad = 40, w = canvas.width - pad * 2, h = canvas.height - pad * 2, max = Math.max(...viewData, 1);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(148,163,184,.15)'; ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) { const y = pad + (h / 5) * i; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(canvas.width - pad, y); ctx.stroke(); }
            if (viewData.length > 0) {
              ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2.5; ctx.beginPath();
              viewData.forEach((val, idx) => { const x = pad + (w / (viewData.length - 1 || 1)) * idx; const y = pad + h - (val / max) * h; idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
              ctx.stroke();
              viewData.forEach((val, idx) => { const x = pad + (w / (viewData.length - 1 || 1)) * idx; const y = pad + h - (val / max) * h; ctx.fillStyle = '#6366f1'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
            }
            ctx.fillStyle = 'rgba(148,163,184,.6)'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
            labels.forEach((label, idx) => { if (idx % Math.max(1, Math.ceil(labels.length / 10)) === 0) { const x = pad + (w / (viewData.length - 1 || 1)) * idx; ctx.fillText(label, x, canvas.height - pad + 16); } });
            ctx.textAlign = 'right';
            for (let i = 0; i <= 5; i++) { const y = pad + (h / 5) * i; ctx.fillText(Math.round((max / 5) * (5 - i)), pad - 10, y + 4); }
          }, 40);
        }
      }
    } catch (err) {
      window.showToast('Failed to load analytics: ' + err.message, 'error');
      document.querySelector('.modal-overlay')?.click();
    }
  }

  // ── Orphan detection ──────────────────────────────────────────────────────
  async function checkOrphanedPages() {
    if (!S().selectedWebsiteId) return;
    try {
      const data = await window.ALPApi.getOrphanedPages(S().selectedWebsiteId);
      _orphanedIds = new Set((data.orphaned || []).map(p => p.id));
      const banner = document.querySelector('.dp-orphaned-banner');
      if (data.count > 0) showOrphanedBanner(data.orphaned);
      else if (banner) banner.remove();
      // Also refresh health strip
      try { _healthData = await window.ALPApi.getRegistryHealth(S().selectedWebsiteId); } catch {}
      repaintGrid();
    } catch (err) { console.error('[DemoPagesRegistry] orphan check failed:', err); }
  }

  function showOrphanedBanner(orphaned) {
    const regPanel = $('dp-panel-registry'); if (!regPanel) return;
    regPanel.querySelector('.dp-orphaned-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'dp-orphaned-banner'; banner.style.cssText = 'margin-bottom:14px;';
    banner.innerHTML = `
      <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:2px;">${orphaned.length} Orphaned Page${orphaned.length !== 1 ? 's' : ''} — HTML files missing</div>
          <div style="font-size:11px;color:var(--text-secondary);">Registered pages that will 404. Delete them or upload the missing files.</div>
        </div>
        <button id="dp-view-orphaned-btn" style="padding:7px 14px;background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;">View &amp; Clean Up</button>
      </div>`;
    regPanel.querySelector('.dp-panel-inner')?.prepend(banner);
    $('dp-view-orphaned-btn')?.addEventListener('click', () => showOrphanedModal(orphaned));
  }

  function showOrphanedModal(orphaned) {
    const listHtml = orphaned.map(p => `
      <div class="dp-orphan-item" style="padding:12px 14px;border-radius:10px;border:1px solid rgba(239,68,68,.12);background:rgba(239,68,68,.02);margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px;">${esc(p.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);margin-bottom:4px;">URL: ${esc(p.url)}</div>
            <div style="font-size:11px;color:#f59e0b;"><span style="font-weight:600;">Missing:</span> <code style="color:#fbbf24;">${esc(p.expectedFile)}</code></div>
          </div>
          <button class="dp-orphan-delete-btn" data-id="${p.id}" style="padding:6px 12px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Remove</button>
        </div>
      </div>`).join('');
    window.showModal({
      title: `Orphaned Pages (${orphaned.length})`, width: '600px',
      content: `<p style="font-size:13px;color:var(--text-secondary);margin:0 0 14px;">These pages are registered but their HTML files don't exist on the server.</p>
        <div style="max-height:400px;overflow-y:auto;">${listHtml}</div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);">
          <button id="dp-cleanup-all-btn" style="padding:9px 18px;background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Delete All Orphaned</button>
        </div>`,
      confirmText: 'Close', hideCancel: true, onConfirm: () => {}
    });
    setTimeout(() => {
      document.querySelectorAll('.dp-orphan-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pageId = parseInt(btn.dataset.id, 10);
          try {
            await window.ALPApi.bulkDeletePages([pageId]);
            btn.closest('.dp-orphan-item').style.opacity = '0.3';
            btn.disabled = true; btn.textContent = 'Removed';
            window.showToast('Page removed from registry', 'success');
            S().pages = S().pages.filter(p => p.id !== pageId); _orphanedIds.delete(pageId); repaintGrid();
          } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
        });
      });
      $('dp-cleanup-all-btn')?.addEventListener('click', async () => {
        const ids = orphaned.map(p => p.id);
        try {
          await window.ALPApi.bulkDeletePages(ids);
          window.showToast(`Removed ${ids.length} orphaned pages`, 'success');
          S().pages = S().pages.filter(p => !ids.includes(p.id)); _orphanedIds.clear();
          repaintGrid(); document.querySelector('.modal-overlay')?.click();
        } catch (err) { window.showToast('Cleanup failed: ' + err.message, 'error'); }
      });
    }, 100);
  }

  return {
    renderCard, repaintGrid, bindCardEvents, updateBulkToolbar, hideBulkToolbar,
    clearBulkSelection, showPreviewModal, showAnalyticsModal,
    checkOrphanedPages, showOrphanedModal, triggerImport
  };
})();
