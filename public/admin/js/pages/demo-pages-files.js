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
  let _filesFilter   = 'all';
  let _filesSearch   = '';
  let _selectedFiles = new Set();

  function getFiles() { return _siteFiles; }

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

  // ── Render full files list ─────────────────────────────────────────────────
  function renderFilesList() {
    const container = $('dp-files-list');
    if (!container) return;

    if (!_siteFiles.length) {
      _selectedFiles.clear();
      container.innerHTML = `
        <div class="dp-files-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.3)" stroke-width="1.2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p style="margin:0;font-size:13px;color:var(--text-secondary);">
            No files deployed yet.<br>Go back to <strong style="color:#a5b4fc;">Upload</strong> to add files.
          </p>
        </div>`;
      return;
    }

    const linked   = _siteFiles.filter(f => isLinked(f.name));
    const unlinked = _siteFiles.filter(f => !isLinked(f.name));

    let filtered = _siteFiles;
    if (_filesFilter === 'linked')   filtered = linked;
    if (_filesFilter === 'unlinked') filtered = unlinked;
    if (_filesSearch) {
      const q = _filesSearch.toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(q));
    }

    const selCount = _selectedFiles.size;

    container.innerHTML = `
      <div class="dp-files-header">
        <span style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">
          ${_siteFiles.length} file${_siteFiles.length !== 1 ? 's' : ''} &bull;
          <span style="color:#10b981;">${linked.length} linked</span>
          ${unlinked.length ? ` &bull; <span style="color:#f87171;">${unlinked.length} unlinked</span>` : ''}
        </span>
        <button id="dp-download-all-btn" class="dp-btn-ghost" style="padding:7px 14px;font-size:12px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download All
        </button>
      </div>

      <div class="dp-files-filter-bar">
        <div class="dp-files-filter-pills">
          <button class="dp-filter-pill ${_filesFilter === 'all' ? 'dp-filter-pill--active' : ''}" data-filter="all">All (${_siteFiles.length})</button>
          <button class="dp-filter-pill ${_filesFilter === 'linked' ? 'dp-filter-pill--active' : ''}" data-filter="linked"
            style="${_filesFilter === 'linked' ? '' : 'color:#10b981;border-color:rgba(16,185,129,.2);'}">&#10003; Linked (${linked.length})</button>
          <button class="dp-filter-pill ${_filesFilter === 'unlinked' ? 'dp-filter-pill--active' : ''}" data-filter="unlinked"
            style="${_filesFilter === 'unlinked' ? '' : 'color:#f87171;border-color:rgba(239,68,68,.2);'}">&#9888; Unlinked (${unlinked.length})</button>
        </div>
        <input id="dp-files-search" class="dp-files-search-input" type="text" placeholder="Search files..." value="${esc(_filesSearch)}">
      </div>

      <div id="dp-files-bulk-bar" class="dp-files-bulk-bar" style="display:${selCount ? 'flex' : 'none'};">
        <div style="display:flex;align-items:center;gap:10px;flex:1;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          <span style="font-size:13px;font-weight:700;color:var(--text-primary);">
            <span id="dp-files-sel-count">${selCount}</span> selected
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="dp-files-bulk-register" class="dp-bulk-action-btn">
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
      </div>

      <div class="dp-files-table" id="dp-files-table-body">
        ${filtered.length ? filtered.map(f => _fileRowHtml(f)).join('')
          : '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No files match the current filter.</div>'}
      </div>

      <div style="font-size:11px;color:var(--text-secondary);margin-top:12px;display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;"></span> Linked = capturing data
        <span style="display:inline-block;width:8px;height:8px;background:#f87171;border-radius:50%;margin-left:8px;"></span> Unlinked = not capturing
      </div>`;

    _wireEvents(container);
  }

  function _fileRowHtml(f) {
    const linkedPage = isLinked(f.name);
    const isSel = _selectedFiles.has(f.name);
    return `
      <div class="dp-file-row ${linkedPage ? 'dp-file-row--linked' : 'dp-file-row--unlinked'} ${isSel ? 'dp-file-row--selected' : ''}" data-file="${esc(f.name)}">
        <input type="checkbox" class="dp-file-checkbox" data-file="${esc(f.name)}" ${isSel ? 'checked' : ''} title="Select">
        <div class="dp-file-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;font-family:var(--font-mono);">${esc(f.name)}</div>
          ${linkedPage
            ? `<div style="font-size:11px;color:#10b981;margin-top:2px;">Registered as: <strong>${esc(linkedPage.name)}</strong> &rarr; <code style="font-size:10px;color:#6ee7b7;">${esc(linkedPage.url)}</code></div>`
            : `<div style="font-size:11px;color:#f87171;margin-top:2px;">Not registered &mdash; won't capture data</div>`}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${linkedPage
            ? `<span class="dp-file-badge dp-file-badge--linked">&#10003; Linked</span>`
            : `<span class="dp-file-badge dp-file-badge--unlinked">&#9888; Unlinked</span>
               <button class="dp-file-add-btn" data-file="${esc(f.name)}" title="Register">+ Register</button>`}
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

  function _wireEvents(container) {
    container.querySelectorAll('.dp-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => { _filesFilter = btn.dataset.filter; renderFilesList(); });
    });

    const searchEl = $('dp-files-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => { _filesSearch = searchEl.value; renderFilesList(); });
      if (_filesSearch) { searchEl.focus(); searchEl.setSelectionRange(searchEl.value.length, searchEl.value.length); }
    }

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

    $('dp-files-bulk-register')?.addEventListener('click', () => {
      const unlinkedSel = [..._selectedFiles].filter(f => !isLinked(f));
      if (!unlinkedSel.length) { window.showToast('All selected files are already registered.', 'info'); return; }
      window.DemoPagesPage.switchTab('registry', true);
      setTimeout(() => window.DemoPagesModals.openAddModal(unlinkedSel[0]), 280);
      if (unlinkedSel.length > 1) window.showToast(`Registering one at a time — starting with ${unlinkedSel[0]}`, 'info');
    });

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

    $('dp-files-bulk-cancel')?.addEventListener('click', () => { _selectedFiles.clear(); renderFilesList(); });

    container.querySelectorAll('.dp-file-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.DemoPagesPage.switchTab('registry', true);
        setTimeout(() => window.DemoPagesModals.openAddModal(btn.dataset.file), 280);
      });
    });

    container.querySelectorAll('.dp-file-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => { e.stopPropagation(); await deleteFile(btn.dataset.file); });
    });

    container.querySelectorAll('.dp-file-download-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); downloadFile(btn.dataset.file); });
    });

    $('dp-download-all-btn')?.addEventListener('click', downloadAllFiles);
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
        <div style="padding:14px;background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.15);border-radius:10px;margin-bottom:14px;">
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
