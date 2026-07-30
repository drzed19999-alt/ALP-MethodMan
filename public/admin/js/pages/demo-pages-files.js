/**
 * demo-pages-files.js
 * Files-tab logic: load, render (filter + bulk select), download, delete.
 * Depends on: window.DemoPagesState (S()), window.ALPApi, window.DemoPagesModals,
 *             window.showModal, window.showToast, window.DemoPagesPage (switchTab/loadPages).
 */
'use strict';
window.DemoPagesFiles = (() => {
  function S() { return window.DemoPagesState; }
  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function $(id) { return document.getElementById(id); }

  let _siteFiles     = [];
  let _filesFilter   = 'all';    // 'all' | 'linked' | 'unlinked'
  let _filesSearch   = '';
  let _selectedFiles = new Set();
  let _filesTypeFilter = 'all';  // 'all'|'html'|'css'|'js'|'images'|'fonts'|'other'
  let _filesSort     = 'name';   // 'name'|'size'|'type'

  function getFiles() { return _siteFiles; }

  // ── File type detector ─────────────────────────────────────────────────────
  function getFileType(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = {
      html: {label:'HTML',color:'#f97316',bg:'rgba(249,115,22,.12)',group:'html'},
      htm:  {label:'HTML',color:'#f97316',bg:'rgba(249,115,22,.12)',group:'html'},
      css:  {label:'CSS', color:'#38bdf8',bg:'rgba(56,189,248,.12)', group:'css'},
      js:   {label:'JS',  color:'#f59e0b',bg:'rgba(245,158,11,.12)', group:'js'},
      mjs:  {label:'JS',  color:'#f59e0b',bg:'rgba(245,158,11,.12)', group:'js'},
      png:  {label:'PNG', color:'#10b981',bg:'rgba(16,185,129,.12)', group:'images'},
      jpg:  {label:'JPG', color:'#10b981',bg:'rgba(16,185,129,.12)', group:'images'},
      jpeg: {label:'JPG', color:'#10b981',bg:'rgba(16,185,129,.12)', group:'images'},
      gif:  {label:'GIF', color:'#10b981',bg:'rgba(16,185,129,.12)', group:'images'},
      svg:  {label:'SVG', color:'#ec4899',bg:'rgba(236,72,153,.12)', group:'images'},
      webp: {label:'WEBP',color:'#10b981',bg:'rgba(16,185,129,.12)', group:'images'},
      ico:  {label:'ICO', color:'#14b8a6',bg:'rgba(20,184,166,.12)', group:'images'},
      avif: {label:'IMG', color:'#10b981',bg:'rgba(16,185,129,.12)', group:'images'},
      woff: {label:'FONT',color:'#a855f7',bg:'rgba(168,85,247,.12)', group:'fonts'},
      woff2:{label:'FONT',color:'#a855f7',bg:'rgba(168,85,247,.12)', group:'fonts'},
      ttf:  {label:'FONT',color:'#a855f7',bg:'rgba(168,85,247,.12)', group:'fonts'},
      eot:  {label:'FONT',color:'#a855f7',bg:'rgba(168,85,247,.12)', group:'fonts'},
      otf:  {label:'FONT',color:'#a855f7',bg:'rgba(168,85,247,.12)', group:'fonts'},
      json: {label:'JSON',color:'#8b5cf6',bg:'rgba(139,92,246,.12)', group:'other'},
    };
    const t = map[ext];
    return t || {label:(ext.slice(0,5).toUpperCase()||'FILE'),color:'#64748b',bg:'rgba(100,116,139,.1)',group:'other'};
  }

  // ── Size formatter ─────────────────────────────────────────────────────────
  function fmtSize(b) {
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB'
         : b > 1024    ? (b / 1024).toFixed(0) + ' KB'
         : b + ' B';
  }

  // ── Type icon inner HTML ───────────────────────────────────────────────────
  function _typeIconInner(group) {
    switch (group) {
      case 'html':
        return `<span style="font-size:9px;font-weight:900;letter-spacing:-.5px;">&lt;/&gt;</span>`;
      case 'css':
        return `<span style="font-size:14px;font-weight:900;line-height:1;">#</span>`;
      case 'js':
        return `<span style="font-size:10px;font-weight:900;letter-spacing:-.5px;">JS</span>`;
      case 'images':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
      case 'fonts':
        return `<span style="font-size:14px;font-weight:900;font-family:serif;line-height:1;">F</span>`;
      default:
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    }
  }

  // ── isLinked: checks if a filename maps to any registered page ────────────
  function isLinked(fileName) {
    return S().pages.find(p => {
      const url = p.url || '';
      const base = url.split('/').pop().replace(/\.html$/i, '');
      return fileName.replace(/\.html$/i, '') === base || p.source_file === fileName;
    }) || null;
  }

  // ── Load files from API ────────────────────────────────────────────────────
  async function loadFiles(siteId) {
    try {
      const r = await window.ALPApi.getDemoFiles(siteId || S().selectedWebsiteId);
      _siteFiles = r.files || [];
      const countEl = $('dp-tab-files-count');
      if (countEl) countEl.textContent = _siteFiles.length || '';
    } catch (e) { _siteFiles = []; }
  }

  // ── Preview file in iframe modal ──────────────────────────────────────────
  function previewFile(filename) {
    const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
    if (!site) return;
    const url = `/demo/${site.demo_slug}/${filename}`;
    window.showModal({
      title: `Preview — ${filename}`,
      width: '90vw',
      content: `
        <div style="border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.08);">
          <div style="padding:8px 12px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:11px;font-family:monospace;color:#94a3b8;">${esc(url)}</span>
            <a href="${esc(url)}" target="_blank" style="font-size:11px;color:#f59e0b;text-decoration:none;font-weight:600;">Open in tab &#x2197;</a>
          </div>
          <iframe src="${esc(url)}" style="width:100%;height:60vh;border:none;display:block;background:#fff;"></iframe>
        </div>`,
      confirmText: null,
      cancelText: 'Close'
    });
  }

  // ── Copy file URL to clipboard ─────────────────────────────────────────────
  function copyFileUrl(filename) {
    const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
    if (!site) return;
    const url = `${window.location.origin}/demo/${site.demo_slug}/${filename}`;
    navigator.clipboard.writeText(url).then(() => window.showToast('URL copied!', 'success'));
  }

  // ── Render full files list ─────────────────────────────────────────────────
  function renderFilesList() {
    const container = $('dp-files-list');
    if (!container) return;

    if (!_siteFiles.length) {
      _selectedFiles.clear();
      container.innerHTML = `
        <div class="dp-files-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,.3)" stroke-width="1.2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p style="margin:0;font-size:13px;color:var(--text-secondary);">
            No files deployed yet.<br>Go back to <strong style="color:#f59e0b;">Upload</strong> to add files.
          </p>
        </div>`;
      return;
    }

    // Compute type counts and total size from ALL files (pre-filter)
    const typeCounts = { html:0, css:0, js:0, images:0, fonts:0, other:0 };
    let totalSize = 0;
    _siteFiles.forEach(f => {
      const ft = getFileType(f.name);
      typeCounts[ft.group] = (typeCounts[ft.group] || 0) + 1;
      totalSize += (f.size || 0);
    });

    const linked   = _siteFiles.filter(f =>  isLinked(f.name));
    const unlinked = _siteFiles.filter(f => !isLinked(f.name));

    // Apply all filters cumulatively
    let filtered = [..._siteFiles];
    if (_filesFilter === 'linked')   filtered = filtered.filter(f =>  isLinked(f.name));
    if (_filesFilter === 'unlinked') filtered = filtered.filter(f => !isLinked(f.name));
    if (_filesTypeFilter !== 'all')  filtered = filtered.filter(f => getFileType(f.name).group === _filesTypeFilter);
    if (_filesSearch) {
      const q = _filesSearch.toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(q));
    }

    // Apply sort
    const groupOrder = ['html','css','js','images','fonts','other'];
    if (_filesSort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (_filesSort === 'size') {
      filtered.sort((a, b) => (b.size || 0) - (a.size || 0));
    } else if (_filesSort === 'type') {
      filtered.sort((a, b) => {
        const ga = groupOrder.indexOf(getFileType(a.name).group);
        const gb = groupOrder.indexOf(getFileType(b.name).group);
        if (ga !== gb) return ga - gb;
        return a.name.localeCompare(b.name);
      });
    }

    const selCount = _selectedFiles.size;

    // ── 1. Stats bar ───────────────────────────────────────────────────────
    const statsBarHtml = `
      <div class="dp-files-stats-bar">
        <span class="dp-stat-chip dp-stat-chip--total">${_siteFiles.length} File${_siteFiles.length !== 1 ? 's' : ''}</span>
        ${totalSize > 0 ? `<span class="dp-stat-chip dp-stat-chip--total">${fmtSize(totalSize)}</span>` : ''}
        ${typeCounts.html   ? `<span class="dp-stat-chip dp-stat-chip--html">HTML ${typeCounts.html}</span>`         : ''}
        ${typeCounts.css    ? `<span class="dp-stat-chip dp-stat-chip--css">CSS ${typeCounts.css}</span>`           : ''}
        ${typeCounts.js     ? `<span class="dp-stat-chip dp-stat-chip--js">JS ${typeCounts.js}</span>`             : ''}
        ${typeCounts.images ? `<span class="dp-stat-chip dp-stat-chip--images">Images ${typeCounts.images}</span>` : ''}
        ${typeCounts.fonts  ? `<span class="dp-stat-chip dp-stat-chip--fonts">Fonts ${typeCounts.fonts}</span>`     : ''}
        ${typeCounts.other  ? `<span class="dp-stat-chip dp-stat-chip--other">Other ${typeCounts.other}</span>`     : ''}
        <div style="flex:1;"></div>
        <button id="dp-download-all-btn" class="dp-btn-ghost" style="padding:5px 12px;font-size:11px;height:auto;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download All
        </button>
      </div>`;

    // ── 2. Type filter pills ───────────────────────────────────────────────
    const typeFilters = [
      { key:'all',    label:`All (${_siteFiles.length})` },
      ...(typeCounts.html   ? [{ key:'html',   label:`HTML (${typeCounts.html})`   }] : []),
      ...(typeCounts.css    ? [{ key:'css',    label:`CSS (${typeCounts.css})`     }] : []),
      ...(typeCounts.js     ? [{ key:'js',     label:`JS (${typeCounts.js})`       }] : []),
      ...(typeCounts.images ? [{ key:'images', label:`Images (${typeCounts.images})`}] : []),
      ...(typeCounts.fonts  ? [{ key:'fonts',  label:`Fonts (${typeCounts.fonts})` }] : []),
      ...(typeCounts.other  ? [{ key:'other',  label:`Other (${typeCounts.other})` }] : []),
    ];
    const typeFilterBarHtml = `
      <div class="dp-type-filter-bar">
        ${typeFilters.map(f => `<button class="dp-type-pill${_filesTypeFilter === f.key ? ' dp-type-pill--active' : ''}" data-type-filter="${f.key}">${f.label}</button>`).join('')}
      </div>`;

    // ── 3. Controls row (status pills + search + sort) ─────────────────────
    const controlsHtml = `
      <div class="dp-files-controls">
        <div class="dp-files-filter-pills">
          <button class="dp-filter-pill${_filesFilter === 'all'      ? ' dp-filter-pill--active' : ''}" data-filter="all">All (${_siteFiles.length})</button>
          <button class="dp-filter-pill${_filesFilter === 'linked'   ? ' dp-filter-pill--active' : ''}" data-filter="linked"
            style="${_filesFilter !== 'linked'   ? 'color:#10b981;border-color:rgba(16,185,129,.2);' : ''}">&#10003; Linked (${linked.length})</button>
          <button class="dp-filter-pill${_filesFilter === 'unlinked' ? ' dp-filter-pill--active' : ''}" data-filter="unlinked"
            style="${_filesFilter !== 'unlinked' ? 'color:#f87171;border-color:rgba(239,68,68,.2);'  : ''}">&#9888; Unlinked (${unlinked.length})</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <input id="dp-files-search" class="dp-files-search-input" type="text" placeholder="Search files..." value="${esc(_filesSearch)}">
          <select id="dp-files-sort" class="dp-sort-select" title="Sort by">
            <option value="name"${_filesSort === 'name' ? ' selected' : ''}>Name</option>
            <option value="size"${_filesSort === 'size' ? ' selected' : ''}>Size</option>
            <option value="type"${_filesSort === 'type' ? ' selected' : ''}>Type</option>
          </select>
        </div>
      </div>`;

    // ── 4. Bulk action bar ─────────────────────────────────────────────────
    const bulkBarHtml = `
      <div id="dp-files-bulk-bar" class="dp-files-bulk-bar" style="display:${selCount ? 'flex' : 'none'};">
        <div style="display:flex;align-items:center;gap:10px;flex:1;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          <span style="font-size:13px;font-weight:700;color:var(--text-primary);">
            <span id="dp-files-sel-count">${selCount}</span> selected
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="dp-files-bulk-register" class="dp-bulk-action-btn" style="background:rgba(245,158,11,.1);color:#f59e0b;border-color:rgba(245,158,11,.22);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="9" x2="15" y2="9"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
            </svg>
            Register Selected
          </button>
          <button id="dp-files-bulk-delete" class="dp-bulk-action-btn dp-bulk-action-btn--danger">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
            Delete Selected
          </button>
          <button id="dp-files-bulk-cancel" class="dp-bulk-action-btn dp-bulk-action-btn--ghost">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Cancel
          </button>
        </div>
      </div>`;

    // ── 5. File table ──────────────────────────────────────────────────────
    const tableHtml = `
      <div class="dp-files-table" id="dp-files-table-body">
        ${filtered.length
          ? filtered.map(f => _fileRowHtml(f)).join('')
          : '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No files match the current filter.</div>'}
      </div>`;

    // ── 6. Legend ──────────────────────────────────────────────────────────
    const legendHtml = `
      <div style="font-size:11px;color:var(--text-secondary);margin-top:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;"></span> Linked = capturing data
        <span style="display:inline-block;width:8px;height:8px;background:#f87171;border-radius:50%;margin-left:8px;"></span> Unlinked = not capturing
      </div>`;

    container.innerHTML = statsBarHtml + typeFilterBarHtml + controlsHtml + bulkBarHtml + tableHtml + legendHtml;

    _wireEvents(container);
  }

  // ── Premium file row ───────────────────────────────────────────────────────
  function _fileRowHtml(f) {
    const linkedPage = isLinked(f.name);
    const isSel = _selectedFiles.has(f.name);
    const ft = getFileType(f.name);

    // Split path into directory prefix + basename
    const parts = f.name.split('/');
    const basename = parts.pop();
    const dir = parts.length ? parts.join('/') + '/' : '';

    const sizeStr = f.size != null ? fmtSize(f.size) : '';

    return `
      <div class="dp-file-row ${linkedPage ? 'dp-file-row--linked' : 'dp-file-row--unlinked'} ${isSel ? 'dp-file-row--selected' : ''}" data-file="${esc(f.name)}">
        <input type="checkbox" class="dp-file-checkbox" data-file="${esc(f.name)}" ${isSel ? 'checked' : ''} title="Select">

        <div class="dp-file-type-icon" style="background:${ft.bg};color:${ft.color};border-color:${ft.color}22;">
          ${_typeIconInner(ft.group)}
        </div>

        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;">
            <span style="font-family:var(--font-mono);font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${dir ? `<span class="dp-file-dir">${esc(dir)}</span>` : ''}<span class="dp-file-basename">${esc(basename)}</span>
            </span>
            <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:800;background:${ft.bg};color:${ft.color};border:1px solid ${ft.color}22;white-space:nowrap;flex-shrink:0;">${ft.label}</span>
          </div>
          ${linkedPage
            ? `<div style="font-size:11px;color:#10b981;margin-top:2px;">&#10003; Registered as <strong>${esc(linkedPage.name)}</strong></div>`
            : `<div style="font-size:11px;color:#f87171;margin-top:2px;">&#9888; Not registered &mdash; won't capture data</div>`}
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
            ${sizeStr ? `<span style="font-size:10px;color:var(--text-muted);">${esc(sizeStr)}</span>` : ''}
            <button class="dp-file-copy-btn" data-file="${esc(f.name)}" title="Copy URL">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Copy URL
            </button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${ft.group === 'html'
            ? `<button class="dp-file-preview-btn" data-file="${esc(f.name)}" title="Preview">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
               </button>`
            : ''}
          ${linkedPage
            ? `<span class="dp-file-badge dp-file-badge--linked">&#10003; Linked</span>`
            : `<button class="dp-file-add-btn" data-file="${esc(f.name)}" title="Register">+ Register</button>`}
          <button class="dp-file-download-btn" data-file="${esc(f.name)}" title="Download File">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button class="dp-file-delete-btn" data-file="${esc(f.name)}" title="Delete File">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  // ── Wire all events ────────────────────────────────────────────────────────
  function _wireEvents(container) {
    // Status filter pills (existing)
    container.querySelectorAll('.dp-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => { _filesFilter = btn.dataset.filter; renderFilesList(); });
    });

    // Type filter pills (new)
    container.querySelectorAll('.dp-type-pill').forEach(btn => {
      btn.addEventListener('click', () => { _filesTypeFilter = btn.dataset.typeFilter; renderFilesList(); });
    });

    // Search (existing)
    const searchEl = $('dp-files-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => { _filesSearch = searchEl.value; renderFilesList(); });
      if (_filesSearch) { searchEl.focus(); searchEl.setSelectionRange(searchEl.value.length, searchEl.value.length); }
    }

    // Sort select (new)
    const sortEl = $('dp-files-sort');
    if (sortEl) {
      sortEl.addEventListener('change', () => { _filesSort = sortEl.value; renderFilesList(); });
    }

    // Per-file checkboxes (existing)
    container.querySelectorAll('.dp-file-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const file = cb.dataset.file;
        cb.checked ? _selectedFiles.add(file) : _selectedFiles.delete(file);
        cb.closest('.dp-file-row')?.classList.toggle('dp-file-row--selected', cb.checked);
        const bar = $('dp-files-bulk-bar');
        const cnt = $('dp-files-sel-count');
        if (bar) bar.style.display = _selectedFiles.size ? 'flex' : 'none';
        if (cnt) cnt.textContent = _selectedFiles.size;
      });
    });

    // Bulk register (existing)
    $('dp-files-bulk-register')?.addEventListener('click', () => {
      const unlinkedSel = [..._selectedFiles].filter(f => !isLinked(f));
      if (!unlinkedSel.length) { window.showToast('All selected files are already registered.', 'info'); return; }
      window.DemoPagesPage.switchTab('registry', true);
      setTimeout(() => window.DemoPagesModals.openAddModal(unlinkedSel[0]), 280);
      if (unlinkedSel.length > 1) window.showToast(`Registering one at a time — starting with ${unlinkedSel[0]}`, 'info');
    });

    // Bulk delete (existing)
    $('dp-files-bulk-delete')?.addEventListener('click', async () => {
      const files = [..._selectedFiles];
      if (!files.length) return;
      window.showModal({
        title: `Delete ${files.length} File${files.length !== 1 ? 's' : ''}`,
        type: 'danger', width: '480px',
        content: `
          <p style="font-size:14px;color:var(--text-secondary);margin:0 0 12px;">
            Delete <strong style="color:var(--text-primary);">${files.length} file${files.length !== 1 ? 's' : ''}</strong> from the server?
          </p>
          <div style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
            ${files.map(f => `<div style="font-size:12px;font-family:var(--font-mono);color:var(--text-secondary);padding:4px 8px;background:rgba(239,68,68,.05);border-radius:5px;">${esc(f)}</div>`).join('')}
          </div>`,
        confirmText: `Delete ${files.length} File${files.length !== 1 ? 's' : ''}`,
        onConfirm: async () => {
          try {
            for (const file of files) await window.ALPApi.deleteDemoFile(S().selectedWebsiteId, file);
            window.showToast(`Deleted ${files.length} file(s)`, 'success');
            _selectedFiles.clear();
            await loadFiles(S().selectedWebsiteId);
            await window.DemoPagesPage.loadPages();
            renderFilesList();
          } catch (err) { window.showToast('Delete failed: ' + err.message, 'error'); }
        }
      });
    });

    // Bulk cancel (existing)
    $('dp-files-bulk-cancel')?.addEventListener('click', () => { _selectedFiles.clear(); renderFilesList(); });

    // Per-file register button (existing, guard against bulk button)
    container.querySelectorAll('.dp-file-add-btn').forEach(btn => {
      if (!btn.dataset.file) return;
      btn.addEventListener('click', () => {
        window.DemoPagesPage.switchTab('registry', true);
        setTimeout(() => window.DemoPagesModals.openAddModal(btn.dataset.file), 280);
      });
    });

    // Per-file delete button (existing)
    container.querySelectorAll('.dp-file-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => { e.stopPropagation(); await deleteFile(btn.dataset.file); });
    });

    // Per-file download button (existing)
    container.querySelectorAll('.dp-file-download-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); downloadFile(btn.dataset.file); });
    });

    // Download all (existing)
    $('dp-download-all-btn')?.addEventListener('click', downloadAllFiles);

    // Preview button (new — HTML files only)
    container.querySelectorAll('.dp-file-preview-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); previewFile(btn.dataset.file); });
    });

    // Copy URL button (new)
    container.querySelectorAll('.dp-file-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); copyFileUrl(btn.dataset.file); });
    });
  }

  // ── File Download ──────────────────────────────────────────────────────────
  function downloadFile(filename) {
    const siteId = S().selectedWebsiteId;
    if (!siteId) return;
    const site = S().websites.find(w => String(w.id) === String(siteId));
    const a = Object.assign(document.createElement('a'), {
      href: `/demo/${site?.demo_slug || 'unknown'}/${filename}`,
      download: filename, target: '_blank'
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.showToast(`Downloading ${filename}...`, 'info');
  }

  async function downloadAllFiles() {
    const siteId = S().selectedWebsiteId;
    if (!siteId || !_siteFiles.length) return;
    const site = S().websites.find(w => String(w.id) === String(siteId));
    if (!site) return;
    window.showModal({
      title: 'Download Site as ZIP', width: '520px',
      content: `
        <p style="font-size:14px;color:var(--text-secondary);margin:0 0 14px;">
          Download all files for <strong style="color:var(--text-primary);">${esc(site.name)}</strong>?
        </p>
        <div style="padding:14px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:10px;margin-bottom:14px;">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Package includes:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="font-size:12px;"><strong style="color:var(--text-primary);">${_siteFiles.length}</strong> files</div>
            <div style="font-size:12px;"><strong style="color:var(--text-primary);">${S().pages.length}</strong> registry entries</div>
          </div>
        </div>`,
      confirmText: 'Download ZIP',
      onConfirm: async () => {
        try {
          window.showToast('Preparing ZIP file...', 'info');
          const result = await window.ALPApi.downloadSiteZip(siteId);
          const blob = await result.blob();
          const url = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement('a'), {
            href: url, download: `${site.demo_slug || 'site'}-${Date.now()}.zip`
          });
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
          window.showToast('ZIP downloaded successfully', 'success');
        } catch (err) { window.showToast('Download failed: ' + err.message, 'error'); }
      }
    });
  }

  // ── File Deletion ──────────────────────────────────────────────────────────
  async function deleteFile(filename) {
    const linkedPage = isLinked(filename);
    let content = `<p style="color:var(--text-secondary);font-size:14px;margin:0 0 12px;">Delete <strong style="color:var(--text-primary);">${esc(filename)}</strong>?</p>`;
    if (linkedPage) {
      content += `
        <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:12px 14px;margin-top:10px;">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" style="flex-shrink:0;">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <div style="font-size:12px;font-weight:700;color:#f87171;margin-bottom:4px;">Warning: Linked Page</div>
              <div style="font-size:12px;color:var(--text-secondary);">
                Registered as <strong style="color:var(--text-primary);">"${esc(linkedPage.name)}"</strong>.<br>
                URL <code style="color:#6ee7b7;font-size:11px;">${esc(linkedPage.url)}</code> will return 404.
              </div>
            </div>
          </div>
        </div>`;
    }
    window.showModal({
      title: 'Delete File', type: 'danger', width: '480px', content,
      confirmText: 'Delete File',
      onConfirm: async () => {
        try {
          const result = await window.ALPApi.deleteDemoFile(S().selectedWebsiteId, filename);
          window.showToast(`File deleted: ${filename}`, 'success');
          if (result.linkedPages?.length) window.showToast(`${result.linkedPages.length} page(s) may be broken`, 'warning');
          await loadFiles(S().selectedWebsiteId);
          renderFilesList();
          await window.DemoPagesPage.loadPages();
        } catch (err) { window.showToast('Delete failed: ' + err.message, 'error'); }
      }
    });
  }

  return { loadFiles, renderFilesList, downloadFile, downloadAllFiles, deleteFile, getFiles, isLinked };
})();
