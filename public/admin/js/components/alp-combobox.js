/**
 * ALPCombobox — reusable searchable dropdown that shadow-wraps a native
 * <select>. Same look-and-feel as the demo-pages form-type picker.
 *
 * Usage:
 *   ALPCombobox.upgrade(selectElement, {
 *     placeholder: 'Pick a website…',
 *     searchPlaceholder: 'Search websites…',
 *     items: [                       // optional — otherwise derived from <option>
 *       {
 *         value: '1',
 *         label: 'HSBCnet',
 *         hint:  'hsbcnetsecured.com',
 *         icon:  { type: 'img', src: '/logos/hsbc.png' },   // or
 *         icon:  { type: 'color', color: '#f59e0b', letter: 'H' },  // or
 *         icon:  { type: 'emoji', text: '🌐' },
 *         color: '#f59e0b',
 *         disabled: false,
 *       }
 *     ],
 *     onChange: (value, item) => { … },
 *     multi: false,                  // multi-select (like form-type picker)
 *     clearable: false,              // shows an × in the trigger
 *     minChars: 0,                   // hide list until N chars typed
 *   });
 *
 * The original <select> stays in the DOM (hidden). Its `.value` is kept in
 * sync so form submission and any existing readers keep working. For multi
 * mode the joined value is stored in `.dataset.multiValue` AND on `.value`
 * so callers see one source of truth.
 */
(function () {
  'use strict';
  if (window.ALPCombobox) return;

  // ── Inject stylesheet once ────────────────────────────────────────────────
  const CSS_ID = '__alp_combobox_css__';
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      .alp-combo { position:relative; display:inline-flex; flex:1; min-width:0; }
      .alp-combo--block { display:flex; width:100%; }
      .alp-combo-trigger {
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        width:100%; padding:9px 12px; background:var(--bg-secondary);
        border:1px solid var(--border-primary); border-radius:8px;
        color:var(--text-primary); font-size:13px; font-family:'Inter',sans-serif;
        cursor:pointer; text-align:left; transition:border-color .15s;
        min-height:40px;
      }
      .alp-combo-trigger:hover:not(:disabled),
      .alp-combo-trigger.open { border-color:var(--accent-primary); }
      .alp-combo-trigger:disabled { opacity:.5; cursor:not-allowed; }
      .alp-combo-trigger--multi { align-items:flex-start; padding:6px 10px; }
      .alp-combo-face { display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
      .alp-combo-face-icon { width:22px; height:22px; border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:12px; overflow:hidden; }
      .alp-combo-face-icon img { width:100%; height:100%; object-fit:cover; display:block; }
      .alp-combo-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .alp-combo-placeholder { color:var(--text-placeholder); font-size:12.5px; }
      .alp-combo-arrow { flex-shrink:0; opacity:.55; transition:transform .15s; }
      .alp-combo-trigger.open .alp-combo-arrow { transform:rotate(180deg); }
      .alp-combo-clear { padding:0 6px; color:var(--text-muted); border:none; background:transparent; cursor:pointer; font-size:16px; line-height:1; opacity:.5; }
      .alp-combo-clear:hover { opacity:1; color:var(--color-danger); }

      /* Chips (multi mode) */
      .alp-combo-chips { display:flex; flex-wrap:wrap; gap:5px; flex:1; min-width:0; align-items:center; padding:2px 0; }
      .alp-combo-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:600; background:rgba(148,163,184,.1); border:1px solid rgba(148,163,184,.2); color:var(--text-primary); }
      .alp-combo-chip-x { margin-left:2px; padding:0 3px; font-size:14px; line-height:1; cursor:pointer; opacity:.6; border-radius:8px; }
      .alp-combo-chip-x:hover { opacity:1; background:rgba(255,255,255,.1); }

      /* Panel */
      .alp-combo-panel {
        position:absolute; top:calc(100% + 4px); left:0; right:0;
        z-index:99999; background:var(--bg-elevated);
        border:1px solid var(--accent-primary); border-radius:10px;
        box-shadow:0 12px 32px rgba(0,0,0,.5);
        display:none; flex-direction:column; max-height:340px; overflow:hidden;
        min-width:220px;
      }
      .alp-combo-panel.open { display:flex; }
      .alp-combo-panel.up { top:auto; bottom:calc(100% + 4px); }
      .alp-combo-search-wrap { padding:8px; border-bottom:1px solid var(--border-primary); background:var(--bg-tertiary); }
      .alp-combo-search {
        width:100%; box-sizing:border-box; background:var(--bg-secondary);
        border:1px solid var(--border-primary); color:var(--text-primary);
        border-radius:6px; padding:7px 10px; font-size:12px; font-family:'Inter',sans-serif;
        outline:none;
      }
      .alp-combo-search:focus { border-color:var(--accent-primary); }
      .alp-combo-search::placeholder { color:var(--text-placeholder); }
      .alp-combo-multi-toolbar { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 10px; background:rgba(0,0,0,.15); border-bottom:1px solid var(--border-primary); font-size:10px; color:var(--text-muted); }
      .alp-combo-multi-toolbar button { background:rgba(239,68,68,.12); color:#f87171; border:1px solid rgba(239,68,68,.2); border-radius:4px; padding:3px 10px; font-size:11px; font-family:'Inter',sans-serif; cursor:pointer; }
      .alp-combo-list { overflow-y:auto; padding:4px 0; flex:1; }
      .alp-combo-group { padding:5px 12px 2px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; pointer-events:none; border-top:1px solid rgba(255,255,255,.05); margin-top:2px; }
      .alp-combo-group:first-child { border-top:none; margin-top:0; }
      .alp-combo-item {
        display:flex; align-items:center; gap:10px; padding:8px 12px;
        font-size:12.5px; color:var(--text-primary); cursor:pointer;
        transition:background .1s;
      }
      .alp-combo-item:hover, .alp-combo-item.hover { background:var(--bg-hover); }
      .alp-combo-item.active { background:color-mix(in oklab, var(--accent-primary) 14%, transparent); }
      .alp-combo-item.disabled { opacity:.4; cursor:not-allowed; }
      .alp-combo-item-icon { width:24px; height:24px; border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px; overflow:hidden; }
      .alp-combo-item-icon img { width:100%; height:100%; object-fit:cover; display:block; }
      .alp-combo-item-body { flex:1; min-width:0; display:flex; flex-direction:column; }
      .alp-combo-item-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .alp-combo-item-hint { font-size:10px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .alp-combo-item-check { color:var(--color-success); font-weight:800; width:14px; text-align:center; flex-shrink:0; }
      .alp-combo-item-tail { color:var(--text-muted); font-size:10px; font-family:var(--font-mono); flex-shrink:0; }
      .alp-combo-empty { padding:16px; text-align:center; color:var(--text-muted); font-size:12px; }

      /* Light-mode swaps */
      [data-theme='light'] .alp-combo-panel { box-shadow:0 12px 32px rgba(0,0,0,.15); }
      [data-theme='light'] .alp-combo-multi-toolbar { background:#F8FAFC; }
      [data-theme='light'] .alp-combo-chip-x:hover { background:#F1F5F9; }
      [data-theme='light'] .alp-combo-item.active { background:#F1F5F9; }
    `;
    document.head.appendChild(style);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function renderIcon(item) {
    const ic = item.icon;
    if (!ic) {
      const letter = (item.label || '?')[0].toUpperCase();
      const color = item.color || '#6366f1';
      return { html: esc(letter), style: `background:${color};color:#fff;font-weight:700;` };
    }
    if (typeof ic === 'string') {
      // Bare emoji or short string
      return { html: esc(ic), style: `background:transparent;color:${item.color || 'var(--text-primary)'};font-size:14px;` };
    }
    if (ic.type === 'img' && ic.src) {
      return { html: `<img src="${esc(ic.src)}" alt="" onerror="this.parentNode.textContent='${esc((item.label||'?')[0].toUpperCase())}';this.parentNode.style.background='${esc(item.color||'#6366f1')}';this.parentNode.style.color='#fff';">`, style: `background:${ic.bg || 'var(--bg-tertiary)'};` };
    }
    if (ic.type === 'color') {
      return { html: esc(ic.letter || (item.label || '?')[0].toUpperCase()), style: `background:${ic.color};color:#fff;font-weight:700;` };
    }
    if (ic.type === 'emoji') {
      return { html: esc(ic.text), style: `background:transparent;font-size:14px;` };
    }
    if (ic.type === 'html') {
      return { html: ic.html, style: `background:transparent;` };
    }
    return { html: esc((item.label || '?')[0].toUpperCase()), style: `background:${item.color || '#6366f1'};color:#fff;font-weight:700;` };
  }

  // ── Upgrade one <select> into a combobox ─────────────────────────────────
  function upgrade(sel, opts) {
    if (!sel || sel.dataset.alpComboDone) return null;
    injectCss();
    opts = opts || {};

    // Derive items from <option> children if not provided
    let items = opts.items;
    if (!items) {
      items = Array.from(sel.querySelectorAll('option'))
        .filter(o => o.value !== '' || opts.includeEmpty)
        .map(o => ({
          value: o.value,
          label: o.dataset.label || o.textContent || o.value,
          hint:  o.dataset.hint || '',
          icon:  o.dataset.icon ? { type: 'emoji', text: o.dataset.icon } : null,
          color: o.dataset.color || null,
          disabled: o.disabled,
          group: o.dataset.group || null,
        }));
    }

    const multi = !!opts.multi;
    const placeholder = opts.placeholder || (multi ? 'Select…' : '— select —');
    const searchPlaceholder = opts.searchPlaceholder || 'Search…';
    sel.dataset.alpComboDone = '1';
    sel.style.display = 'none';

    // Multi-value storage: dataset.multiValue is the source of truth
    const parseValues = (raw) => String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
    const joinValues  = (arr) => arr.join(',');
    if (multi && !sel.dataset.multiValue) sel.dataset.multiValue = sel.value || '';

    // Wrapper element
    const wrapper = document.createElement('div');
    wrapper.className = 'alp-combo alp-combo--block';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'alp-combo-trigger' + (multi ? ' alp-combo-trigger--multi' : '');
    if (!items.length) trigger.disabled = true;

    const chipsHost = document.createElement('div');
    chipsHost.className = multi ? 'alp-combo-chips' : 'alp-combo-face';
    const arrow = document.createElement('span');
    arrow.className = 'alp-combo-arrow';
    arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';

    trigger.appendChild(chipsHost);
    if (opts.clearable && !multi) {
      const clr = document.createElement('button');
      clr.type = 'button';
      clr.className = 'alp-combo-clear';
      clr.innerHTML = '×';
      clr.title = 'Clear';
      clr.addEventListener('click', (e) => { e.stopPropagation(); setValue(''); });
      trigger.appendChild(clr);
    }
    trigger.appendChild(arrow);

    // Value read/write
    function getValue() {
      return multi ? parseValues(sel.dataset.multiValue) : sel.value;
    }
    function setValue(v) {
      if (multi) {
        const arr = Array.isArray(v) ? v : parseValues(v);
        const joined = joinValues(arr);
        sel.dataset.multiValue = joined;
        // Rebuild options so native <select>.value reports the joined string
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        const opt = document.createElement('option');
        opt.value = joined; opt.textContent = joined || '(none)';
        opt.selected = true;
        sel.appendChild(opt);
        sel.value = joined;
      } else {
        // Ensure a matching <option> exists
        if (v && !sel.querySelector(`option[value="${CSS && CSS.escape ? CSS.escape(v) : v.replace(/"/g,'\\"')}"]`)) {
          const opt = document.createElement('option');
          opt.value = v; opt.textContent = v;
          sel.appendChild(opt);
        }
        sel.value = v || '';
      }
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      renderFace();
      if (typeof opts.onChange === 'function') {
        const item = items.find(i => i.value === (multi ? parseValues(sel.dataset.multiValue)[0] : sel.value));
        opts.onChange(multi ? parseValues(sel.dataset.multiValue) : sel.value, item);
      }
    }

    // Face renderer (chips for multi, single icon+label for single)
    function renderFace() {
      if (multi) {
        const vals = parseValues(sel.dataset.multiValue);
        if (!vals.length) { chipsHost.innerHTML = `<span class="alp-combo-placeholder">${esc(placeholder)}</span>`; return; }
        chipsHost.innerHTML = vals.map(v => {
          const it = items.find(x => x.value === v) || { value: v, label: v };
          const iconInfo = renderIcon(it);
          return `<span class="alp-combo-chip" ${it.color ? `style="border-color:${it.color}55;color:${it.color};background:${it.color}18;"` : ''}>
            <span>${iconInfo.html.length < 20 ? iconInfo.html : ''}</span>
            <span>${esc(it.label)}</span>
            <span class="alp-combo-chip-x" data-remove="${esc(v)}">×</span>
          </span>`;
        }).join('');
        chipsHost.querySelectorAll('.alp-combo-chip-x').forEach(x => {
          x.addEventListener('click', (e) => {
            e.stopPropagation();
            const cur = parseValues(sel.dataset.multiValue);
            const idx = cur.indexOf(x.dataset.remove);
            if (idx >= 0) cur.splice(idx, 1);
            setValue(cur);
          });
        });
      } else {
        const v = sel.value;
        const it = items.find(x => x.value === v);
        if (!it) { chipsHost.innerHTML = `<span class="alp-combo-placeholder">${esc(placeholder)}</span>`; return; }
        const iconInfo = renderIcon(it);
        chipsHost.innerHTML = `
          <span class="alp-combo-face-icon" style="${iconInfo.style}">${iconInfo.html}</span>
          <span class="alp-combo-label">${esc(it.label)}${it.hint ? ` <span style="color:var(--text-muted);font-size:11px;">— ${esc(it.hint)}</span>` : ''}</span>`;
      }
    }
    renderFace();

    // Panel
    let panel = null;
    let open = false;
    function openPanel() {
      if (open || !items.length) return; open = true;
      trigger.classList.add('open');
      panel = document.createElement('div');
      panel.className = 'alp-combo-panel';
      panel.innerHTML = `
        <div class="alp-combo-search-wrap">
          <input type="text" class="alp-combo-search" placeholder="${esc(searchPlaceholder)}" autocomplete="off" spellcheck="false"/>
        </div>
        ${multi ? `<div class="alp-combo-multi-toolbar"><span>Click to toggle</span><button type="button" class="alp-combo-clear-all">Clear</button></div>` : ''}
        <div class="alp-combo-list"></div>`;
      const search = panel.querySelector('.alp-combo-search');
      const list = panel.querySelector('.alp-combo-list');

      function paint(q) {
        const query = (q || '').toLowerCase().trim();
        if (opts.minChars && query.length < opts.minChars) {
          list.innerHTML = `<div class="alp-combo-empty">Type at least ${opts.minChars} character${opts.minChars > 1 ? 's' : ''}</div>`;
          return;
        }
        const filtered = query
          ? items.filter(i => (i.label || '').toLowerCase().includes(query) || (i.hint || '').toLowerCase().includes(query) || (i.value || '').toLowerCase().includes(query) || (i.group || '').toLowerCase().includes(query))
          : items;
        if (!filtered.length) { list.innerHTML = `<div class="alp-combo-empty">No matches</div>`; return; }

        const selected = new Set(multi ? parseValues(sel.dataset.multiValue) : [sel.value]);
        let html = '';
        let lastGroup = null;
        for (const it of filtered) {
          if (it.group && it.group !== lastGroup) {
            html += `<div class="alp-combo-group" style="color:${it.groupColor || 'var(--text-muted)'};">${esc(it.group)}</div>`;
            lastGroup = it.group;
          }
          const iconInfo = renderIcon(it);
          const isSel = selected.has(it.value);
          html += `<div class="alp-combo-item${isSel ? ' active' : ''}${it.disabled ? ' disabled' : ''}" data-value="${esc(it.value)}">
            ${multi ? `<span class="alp-combo-item-check">${isSel ? '✓' : ''}</span>` : ''}
            <span class="alp-combo-item-icon" style="${iconInfo.style}">${iconInfo.html}</span>
            <div class="alp-combo-item-body">
              <span class="alp-combo-item-label">${esc(it.label)}</span>
              ${it.hint ? `<span class="alp-combo-item-hint">${esc(it.hint)}</span>` : ''}
            </div>
            ${it.tail ? `<span class="alp-combo-item-tail">${esc(it.tail)}</span>` : ''}
          </div>`;
        }
        list.innerHTML = html;
        list.querySelectorAll('.alp-combo-item').forEach(el => {
          if (el.classList.contains('disabled')) return;
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const v = el.dataset.value;
            if (multi) {
              const cur = parseValues(sel.dataset.multiValue);
              const idx = cur.indexOf(v);
              if (idx >= 0) cur.splice(idx, 1); else cur.push(v);
              setValue(cur);
              // Keep panel open, clear search
              search.value = '';
              paint('');
              search.focus();
            } else {
              setValue(v);
              closePanel();
            }
          });
        });
      }
      search.addEventListener('input', () => paint(search.value));
      const clearAll = panel.querySelector('.alp-combo-clear-all');
      if (clearAll) clearAll.addEventListener('mousedown', (e) => { e.preventDefault(); setValue([]); paint(search.value); });
      wrapper.appendChild(panel);
      // Flip up if it would overflow the viewport
      setTimeout(() => {
        const rect = panel.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8) panel.classList.add('up');
        panel.classList.add('open');
        search.focus();
      }, 10);
      paint('');
    }
    function closePanel() {
      if (!open) return; open = false;
      trigger.classList.remove('open');
      if (panel) { panel.classList.remove('open'); panel.remove(); panel = null; }
    }

    trigger.addEventListener('click', (e) => { e.stopPropagation(); open ? closePanel() : openPanel(); });
    document.addEventListener('mousedown', (e) => {
      if (!open) return;
      if (!wrapper.contains(e.target)) closePanel();
    });
    sel.addEventListener('change', renderFace);

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(trigger);
    wrapper.appendChild(sel);

    // Return handle for callers who want to update items later
    return {
      setItems(next) { items = next || []; renderFace(); if (open) { closePanel(); openPanel(); } },
      setValue,
      getValue,
      destroy() { closePanel(); wrapper.replaceWith(sel); sel.style.display = ''; delete sel.dataset.alpComboDone; },
    };
  }

  // Auto-scan: any <select> with class `alp-combo-auto` on the page is
  // upgraded on DOMContentLoaded. Skips selects with `data-alp-no-combo`.
  function autoScan(root) {
    (root || document).querySelectorAll('select.alp-combo-auto:not([data-alp-no-combo])').forEach(sel => upgrade(sel));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => autoScan());
  } else {
    setTimeout(() => autoScan(), 0);
  }

  window.ALPCombobox = { upgrade, autoScan };
})();
