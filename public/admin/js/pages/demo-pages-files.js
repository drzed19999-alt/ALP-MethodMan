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
  let _filesSort     = 'name';   // 'name'|'size'|'type'|'modified'
  let _viewMode      = 'tree';   // 'flat' | 'tree'
  let _quota         = null;     // { used, cap, count }
  let _brokenLinks   = null;     // { file: [refs] } — populated by loadBrokenLinks
  let _collapsedDirs = new Set();
  let _contentSearchResults = null; // grep results { query, matches: [{file, hits: [...]}] }

  function getFiles() { return _siteFiles; }

  // ── Human relative time ────────────────────────────────────────────────────
  function fmtAgo(ms) {
    if (!ms) return '';
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function isRecent(ms) { return ms && (Date.now() - ms) < 60 * 60 * 1000; } // <1h

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
    const id = siteId || S().selectedWebsiteId;
    try {
      const r = await window.ALPApi.getDemoFiles(id);
      _siteFiles = r.files || [];
      const countEl = $('dp-tab-files-count');
      if (countEl) countEl.textContent = _siteFiles.length || '';
    } catch (e) { _siteFiles = []; }
    // Fire-and-forget: quota + broken links refresh in parallel; empty on error
    Promise.all([
      window.ALPApi.getFilesQuota(id).then(q => { _quota = q; }).catch(() => { _quota = null; }),
      window.ALPApi.getBrokenLinks(id).then(b => { _brokenLinks = (b && b.files) || {}; }).catch(() => { _brokenLinks = null; })
    ]).then(() => { if ($('dp-files-list')) renderFilesList(); });
  }

  // ── Preview HTML in iframe modal (with device toggle) ────────────────────
  function previewFile(filename) {
    const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
    if (!site) return;
    // `_alp_preview=1` tells the tracker to skip session-creation (see tracker.js)
    const url = `/demo/${site.demo_slug}/${filename}`;
    const previewUrl = url + (url.includes('?') ? '&' : '?') + '_alp_preview=1';

    window.showModal({
      title: `Preview — ${filename}`,
      width: '90vw', maxWidth: '1400px',
      content: `
        <div id="dpf-preview-controls" style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 12px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:10px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
            <button class="dpf-preview-size-btn dpf-preview-size-btn--active" data-width="100%" title="Desktop view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Desktop
            </button>
            <button class="dpf-preview-size-btn" data-width="768px" title="Tablet view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
              Tablet
            </button>
            <button class="dpf-preview-size-btn" data-width="375px" title="Mobile view">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="1" width="6" height="22" rx="2"/><line x1="11" y1="19" x2="13" y2="19"/></svg>
              Mobile
            </button>
            <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(url)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <button id="dpf-preview-refresh" class="dpf-preview-size-btn">Refresh</button>
            <a href="${esc(url)}" target="_blank" class="dpf-preview-size-btn" style="text-decoration:none;">Open in Tab &#x2197;</a>
          </div>
        </div>
        <!-- Center-stage: iframe wrapper is margin:auto so any narrower device
             frame stays centered instead of hugging the left edge. -->
        <div style="display:flex;justify-content:center;background:rgba(0,0,0,.15);padding:14px;border-radius:10px;">
          <div id="dpf-preview-frame-wrap" style="width:100%;height:70vh;max-width:100%;border:1px solid var(--border-primary);border-radius:10px;overflow:hidden;background:#fff;transition:width .25s cubic-bezier(.2,.9,.3,1),max-width .25s;box-shadow:0 8px 24px rgba(0,0,0,.35);">
            <iframe id="dpf-preview-iframe" src="${esc(previewUrl)}" style="width:100%;height:100%;border:none;display:block;background:#fff;"></iframe>
          </div>
        </div>`,
      confirmText: null,
      cancelText: 'Close'
    });

    setTimeout(() => {
      const wrap = document.getElementById('dpf-preview-frame-wrap');
      const iframe = document.getElementById('dpf-preview-iframe');
      document.querySelectorAll('.dpf-preview-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!btn.dataset.width) return;
          document.querySelectorAll('.dpf-preview-size-btn').forEach(b => b.classList.remove('dpf-preview-size-btn--active'));
          btn.classList.add('dpf-preview-size-btn--active');
          if (wrap) {
            // Setting BOTH width and max-width keeps the wrap centered inside
            // the flex parent no matter which device is picked.
            wrap.style.width = btn.dataset.width;
            wrap.style.maxWidth = btn.dataset.width;
          }
        });
      });
      document.getElementById('dpf-preview-refresh')?.addEventListener('click', () => { if (iframe) iframe.src = iframe.src; });
    }, 80);
  }

  // ── Preview image ─────────────────────────────────────────────────────────
  // Smart-size: preload the image to learn its natural dimensions, then open a
  // modal sized to the image (clamped to the viewport). Small icons open in a
  // small modal; hero shots open in a large one. No checkered background — a
  // subtle theme-aware surface keeps transparent PNGs readable without noise.
  function previewImage(filename) {
    const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
    if (!site) return;
    const url = `/demo/${site.demo_slug}/${filename}`;
    const fileObj = _siteFiles.find(f => f.name === filename);
    const sizeStr = fileObj ? fmtSize(fileObj.size || 0) : '';

    // Header height + padding around image
    const CHROME_W = 40;   // horizontal chrome (modal padding)
    const CHROME_H = 130;  // header + toolbar + close button vertical chrome
    const MAX_VW = 0.92;
    const MAX_VH = 0.88;

    // Toggle state persists across preview opens in this session
    if (typeof previewImage._bgMode === 'undefined') previewImage._bgMode = 'dark';
    const BG_MODES = {
      dark:    { bg: '#1a1a1a', label: '☀ Light', next: 'light',   swatch: '#000' },
      light:   { bg: '#f5f5f5', label: '◐ Checker', next: 'checker', swatch: '#fff' },
      checker: { bg: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 20px 20px', label: '🌑 Dark', next: 'dark', swatch: 'linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%,#e5e7eb) 0 0 / 8px 8px' },
    };

    function open(width, height, natW, natH) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const modalW = Math.min(vw * MAX_VW, Math.max(360, width + CHROME_W));
      const imgMaxH = Math.min(vh * MAX_VH - CHROME_H, height);
      const dimsStr = natW ? `${natW} × ${natH}px` : '';
      const mode = BG_MODES[previewImage._bgMode] || BG_MODES.dark;

      window.showModal({
        title: `Image — ${filename}`,
        width: modalW + 'px',
        content: `
          <div style="border-radius:8px;overflow:hidden;border:1px solid var(--border-primary);background:var(--bg-tertiary);">
            <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${esc(url)}</span>
              <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                <span style="font-size:11px;color:var(--text-secondary);font-variant-numeric:tabular-nums;">${esc(dimsStr)}</span>
                <span style="font-size:11px;color:var(--text-secondary);">${esc(sizeStr)}</span>
                <button id="img-preview-bgtoggle" title="Toggle image background — helpful when the image blends with the surface"
                  style="padding:4px 10px;font-size:11px;font-weight:600;border-radius:5px;background:rgba(255,255,255,.06);color:var(--text-secondary);border:1px solid rgba(255,255,255,.1);cursor:pointer;font-family:'Inter',sans-serif;display:inline-flex;align-items:center;gap:5px;">
                  <span id="img-preview-bglabel">${mode.label}</span>
                </button>
                <a href="${esc(url)}" target="_blank" style="font-size:11px;color:var(--accent-primary);text-decoration:none;font-weight:600;">Open in tab &#x2197;</a>
              </div>
            </div>
            <div id="img-preview-stage" style="display:flex;align-items:center;justify-content:center;padding:20px;background:${mode.bg};transition:background .18s;">
              <img src="${esc(url)}" alt="${esc(filename)}"
                style="display:block;max-width:100%;max-height:${imgMaxH}px;width:auto;height:auto;object-fit:contain;">
            </div>
          </div>`,
        confirmText: null,
        cancelText: 'Close'
      });

      // Wire the bg toggle — cycles dark → light → checker → dark
      setTimeout(() => {
        const btn = document.getElementById('img-preview-bgtoggle');
        const stage = document.getElementById('img-preview-stage');
        const label = document.getElementById('img-preview-bglabel');
        if (!btn || !stage || !label) return;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = BG_MODES[previewImage._bgMode] || BG_MODES.dark;
          previewImage._bgMode = cur.next;
          const next = BG_MODES[previewImage._bgMode];
          stage.style.background = next.bg;
          label.textContent = next.label;
        });
      }, 40);
    }

    // Preload to get natural dimensions before opening the modal
    const probe = new Image();
    probe.onload = () => {
      const natW = probe.naturalWidth || 0;
      const natH = probe.naturalHeight || 0;
      open(natW, natH, natW, natH);
    };
    probe.onerror = () => open(600, 400, 0, 0);
    probe.src = url;
  }

  // ── View source code (text files) with syntax highlighting ────────────────
  async function viewCode(filename) {
    const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
    if (!site) return;
    const url = `/demo/${site.demo_slug}/${filename}`;
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const langLabel = { html:'HTML', htm:'HTML', css:'CSS', js:'JavaScript', mjs:'JavaScript', json:'JSON', svg:'SVG', txt:'Text', md:'Markdown', xml:'XML' }[ext] || ext.toUpperCase();

    window.showModal({
      title: `Source — ${filename}`,
      width: '90vw',
      content: `
        <div style="border-radius:8px;overflow:hidden;border:1px solid var(--border-primary);background:#0e1218;">
          <div style="padding:8px 12px;background:rgba(0,0,0,.4);border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,.15);color:#60a5fa;">${langLabel}</span>
              <span style="font-size:11px;font-family:monospace;color:#94a3b8;">${esc(url)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <button id="code-copy-btn" style="font-size:11px;padding:4px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:4px;color:#e5e7eb;cursor:pointer;">Copy</button>
              <a href="${esc(url)}" target="_blank" style="font-size:11px;color:#f59e0b;text-decoration:none;font-weight:600;">Raw &#x2197;</a>
            </div>
          </div>
          <div id="code-viewer-body" style="max-height:65vh;overflow:auto;">
            <pre style="margin:0;padding:16px;font-family:'JetBrains Mono','Fira Code',Consolas,monospace;font-size:12px;line-height:1.55;color:#cbd5e1;white-space:pre;"><code id="code-viewer-el" style="color:inherit;">Loading…</code></pre>
          </div>
        </div>`,
      confirmText: null,
      cancelText: 'Close'
    });

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const codeEl = document.getElementById('code-viewer-el');
      if (!codeEl) return;
      codeEl.textContent = text;
      const copyBtn = document.getElementById('code-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
          });
        });
      }
    } catch (err) {
      const codeEl = document.getElementById('code-viewer-el');
      if (codeEl) codeEl.textContent = `Failed to load: ${err.message}`;
    }
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

    // Linked/unlinked semantics only apply to HTML files. Static assets
    // (images, css, js, fonts) don't count as unlinked — they're just assets.
    const htmlFiles = _siteFiles.filter(f => getFileType(f.name).group === 'html');
    const linked    = htmlFiles.filter(f =>  isLinked(f.name));
    const unlinked  = htmlFiles.filter(f => !isLinked(f.name));

    // Apply all filters cumulatively
    let filtered = [..._siteFiles];
    if (_filesFilter === 'linked')   filtered = filtered.filter(f => getFileType(f.name).group === 'html' &&  isLinked(f.name));
    if (_filesFilter === 'unlinked') filtered = filtered.filter(f => getFileType(f.name).group === 'html' && !isLinked(f.name));
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
    } else if (_filesSort === 'modified') {
      filtered.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    }

    const selCount = _selectedFiles.size;

    // ── 0. Storage quota bar ───────────────────────────────────────────────
    let quotaBarHtml = '';
    if (_quota && _quota.cap) {
      const pct = Math.min(100, (_quota.used / _quota.cap) * 100);
      const barColor = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : 'var(--accent-primary)';
      quotaBarHtml = `
        <div class="dp-quota-bar-wrap" style="margin-bottom:10px;padding:10px 12px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:11px;color:var(--text-secondary);">
            <span><strong style="color:var(--text-primary);">Storage:</strong> ${fmtSize(_quota.used)} of ${fmtSize(_quota.cap)} used (${_quota.count} file${_quota.count !== 1 ? 's' : ''})</span>
            <span style="color:${barColor};font-weight:700;">${pct.toFixed(1)}%</span>
          </div>
          <div style="height:6px;background:rgba(148,163,184,.15);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};transition:width .4s cubic-bezier(.2,.9,.3,1);"></div>
          </div>
        </div>`;
    }

    // ── 0.5. Full-text content search bar ──────────────────────────────────
    const contentSearchHtml = `
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">
        <input id="dp-content-search" class="dp-files-search-input" type="text"
          placeholder="🔍 Search INSIDE files (grep HTML/CSS/JS content, press Enter)…"
          style="flex:1;font-family:var(--font-mono);font-size:12px;" />
        <button id="dp-content-search-btn" class="dp-btn-ghost" style="padding:6px 12px;font-size:11px;">Search</button>
        ${_contentSearchResults ? `<button id="dp-content-search-clear" class="dp-btn-ghost" style="padding:6px 10px;font-size:11px;">Clear</button>` : ''}
        <div class="dp-view-seg" role="tablist" aria-label="File view">
          <button data-view-mode="flat" class="dp-view-seg-btn${_viewMode === 'flat' ? ' dp-view-seg-btn--active' : ''}" title="Flat file list">📄 Flat</button>
          <button data-view-mode="tree" class="dp-view-seg-btn${_viewMode === 'tree' ? ' dp-view-seg-btn--active' : ''}" title="Folder tree">🗂 Tree</button>
        </div>
      </div>`;

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
        ${_brokenLinks && Object.keys(_brokenLinks).length ? `<span class="dp-stat-chip" style="background:rgba(239,68,68,.12);color:#ef4444;border-color:rgba(239,68,68,.28);">⚠ ${Object.keys(_brokenLinks).length} with broken refs</span>` : ''}
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
            <option value="modified"${_filesSort === 'modified' ? ' selected' : ''}>Modified</option>
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

    // ── 5. File table (grep results OR flat OR tree) ───────────────────────
    let tableHtml;
    if (_contentSearchResults) {
      const r = _contentSearchResults;
      if (!r.matches.length) {
        tableHtml = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No matches for "<strong style="color:var(--text-primary);">${esc(r.query)}</strong>" inside any file.</div>`;
      } else {
        tableHtml = `<div class="dp-files-table" id="dp-files-table-body">` +
          `<div style="padding:8px 12px;font-size:11px;color:var(--text-secondary);background:var(--bg-tertiary);border-radius:6px;margin-bottom:6px;">
            <strong style="color:var(--accent-primary);">${r.totalMatches}${r.truncated ? '+' : ''}</strong> matches for "<strong style="color:var(--text-primary);font-family:var(--font-mono);">${esc(r.query)}</strong>" across <strong style="color:var(--text-primary);">${r.matches.length}</strong> file${r.matches.length !== 1 ? 's' : ''}
          </div>` +
          r.matches.map(fm => {
            const f = _siteFiles.find(x => x.name === fm.file) || { name: fm.file, size: 0 };
            const ft = getFileType(fm.file);
            return `
              <div style="border:1px solid var(--border-primary);border-radius:8px;margin-bottom:8px;overflow:hidden;background:var(--bg-secondary);">
                <div style="padding:8px 12px;background:var(--bg-tertiary);display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:12px;color:var(--text-primary);">
                  <span style="padding:1px 5px;border-radius:3px;background:${ft.bg};color:${ft.color};font-size:9px;font-weight:800;">${ft.label}</span>
                  ${esc(fm.file)}
                  <span style="flex:1"></span>
                  <button class="dp-file-viewcode-btn" data-file="${esc(fm.file)}" style="padding:3px 8px;font-size:10px;">Open</button>
                </div>
                <div style="padding:6px 12px;">
                  ${fm.hits.map(h => {
                    const before = esc(h.snippet.slice(0, h.matchStart));
                    const match  = esc(h.snippet.slice(h.matchStart, h.matchStart + h.matchLen));
                    const after  = esc(h.snippet.slice(h.matchStart + h.matchLen));
                    return `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);padding:3px 0;white-space:pre;overflow:hidden;text-overflow:ellipsis;">
                      <span style="color:var(--text-muted);display:inline-block;min-width:36px;">${h.line}:</span> ${before}<mark style="background:rgba(245,158,11,.3);color:var(--text-primary);padding:0 2px;border-radius:2px;">${match}</mark>${after}
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('') +
          `</div>`;
      }
    } else if (_viewMode === 'tree') {
      tableHtml = `<div class="dp-files-table" id="dp-files-table-body">${_renderTree(filtered)}</div>`;
    } else {
      tableHtml = `
        <div class="dp-files-table" id="dp-files-table-body">
          ${filtered.length
            ? filtered.map(f => _fileRowHtml(f)).join('')
            : '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No files match the current filter.</div>'}
        </div>`;
    }

    // ── 6. Legend ──────────────────────────────────────────────────────────
    const legendHtml = `
      <div style="font-size:11px;color:var(--text-secondary);margin-top:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;"></span> Linked HTML = capturing data
        <span style="display:inline-block;width:8px;height:8px;background:#f87171;border-radius:50%;margin-left:8px;"></span> Unlinked HTML = not capturing
        <span style="color:var(--text-muted);margin-left:8px;">Static assets (images, CSS, JS, fonts) don't need registration.</span>
      </div>`;

    container.innerHTML = quotaBarHtml + contentSearchHtml + statsBarHtml + typeFilterBarHtml + controlsHtml + bulkBarHtml + tableHtml + legendHtml;

    _wireEvents(container);
  }

  // ── Premium file row ───────────────────────────────────────────────────────
  function _fileRowHtml(f) {
    const ft = getFileType(f.name);
    // Register semantics only apply to HTML files. Everything else is a
    // static asset (image / css / js / font / other) served alongside — no
    // registration needed, no "not capturing" warning.
    const isHtml = ft.group === 'html';
    const linkedPage = isHtml ? isLinked(f.name) : null;
    const isSel = _selectedFiles.has(f.name);

    // Split path into directory prefix + basename
    const parts = f.name.split('/');
    const basename = parts.pop();
    const dir = parts.length ? parts.join('/') + '/' : '';

    const sizeStr = f.size != null ? fmtSize(f.size) : '';

    // Status line: only meaningful for HTML files
    let statusLine = '';
    if (isHtml) {
      statusLine = linkedPage
        ? `<div style="font-size:11px;color:#10b981;margin-top:2px;">&#10003; Registered as <strong>${esc(linkedPage.name)}</strong></div>`
        : `<div style="font-size:11px;color:#f87171;margin-top:2px;">&#9888; Not registered &mdash; won't capture data</div>`;
    } else {
      statusLine = `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Static asset &mdash; served with the page</div>`;
    }

    // Row modifier class — only tag linked/unlinked when it applies (HTML)
    const rowClass = isHtml
      ? (linkedPage ? 'dp-file-row--linked' : 'dp-file-row--unlinked')
      : 'dp-file-row--asset';

    // Right-side action buttons per file type
    let actions = '';
    if (isHtml) {
      actions += `<button class="dp-file-preview-btn" data-file="${esc(f.name)}" title="Preview HTML in iframe">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Preview
        </button>`;
      actions += `<button class="dp-file-viewcode-btn" data-file="${esc(f.name)}" title="View source code">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Code
        </button>`;
      actions += linkedPage
        ? `<span class="dp-file-badge dp-file-badge--linked">&#10003; Linked</span>`
        : `<button class="dp-file-add-btn" data-file="${esc(f.name)}" title="Register as a data-capture page">+ Register</button>`;
    } else if (ft.group === 'images') {
      actions += `<button class="dp-file-viewimg-btn" data-file="${esc(f.name)}" title="View image">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          View
        </button>`;
    } else if (ft.group === 'css' || ft.group === 'js' || ext_is_textish(f.name)) {
      actions += `<button class="dp-file-viewcode-btn" data-file="${esc(f.name)}" title="View source code">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Code
        </button>`;
    }

    // Rename + Replace + Download + Delete are universal
    actions += `<button class="dp-file-rename-btn" data-file="${esc(f.name)}" title="Rename file">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>`;
    actions += `<button class="dp-file-replace-btn" data-file="${esc(f.name)}" title="Replace with new file">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
          <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
        </svg>
      </button>`;
    actions += `<button class="dp-file-download-btn" data-file="${esc(f.name)}" title="Download File">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>`;
    actions += `<button class="dp-file-delete-btn" data-file="${esc(f.name)}" title="Delete File">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>`;

    return `
      <div class="dp-file-row ${rowClass} ${isSel ? 'dp-file-row--selected' : ''}" data-file="${esc(f.name)}">
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
          ${statusLine}
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
            ${sizeStr ? `<span style="font-size:10px;color:var(--text-muted);">${esc(sizeStr)}</span>` : ''}
            ${f.mtime ? `<span style="font-size:10px;color:${isRecent(f.mtime) ? '#10b981' : 'var(--text-muted)'};" title="Last modified">${isRecent(f.mtime) ? '● ' : ''}${fmtAgo(f.mtime)}</span>` : ''}
            ${(isHtml && _brokenLinks && _brokenLinks[f.name]) ? `<span style="font-size:10px;color:#ef4444;font-weight:700;" title="${esc(_brokenLinks[f.name].join('\n'))}">⚠ ${_brokenLinks[f.name].length} broken ref${_brokenLinks[f.name].length !== 1 ? 's' : ''}</span>` : ''}
            <button class="dp-file-copy-btn" data-file="${esc(f.name)}" title="Copy URL">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Copy URL
            </button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${actions}
        </div>
      </div>`;
  }

  // Text-ish files that benefit from the Code viewer
  function ext_is_textish(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ['json','svg','txt','md','xml','yml','yaml','csv','log','env'].includes(ext);
  }

  // ── Tree view renderer: group files by directory, collapsible ────────────
  function _renderTree(files) {
    if (!files.length) return '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No files match the current filter.</div>';
    // Build a nested folder map
    const root = { name: '', dirs: new Map(), files: [] };
    for (const f of files) {
      const parts = f.name.split('/');
      const basename = parts.pop();
      let node = root;
      let pathSoFar = '';
      for (const p of parts) {
        pathSoFar = pathSoFar ? `${pathSoFar}/${p}` : p;
        if (!node.dirs.has(p)) node.dirs.set(p, { name: p, path: pathSoFar, dirs: new Map(), files: [] });
        node = node.dirs.get(p);
      }
      node.files.push({ ...f, basename });
    }

    function fileCountRecursive(node) {
      let n = node.files.length;
      for (const d of node.dirs.values()) n += fileCountRecursive(d);
      return n;
    }

    function renderNode(node, depth) {
      let out = '';
      // Sub-directories first, then files
      const dirs = Array.from(node.dirs.values()).sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) {
        const collapsed = _collapsedDirs.has(d.path);
        const count = fileCountRecursive(d);
        out += `
          <div class="dp-tree-dir" data-dir-path="${esc(d.path)}" style="padding:6px 8px;padding-left:${8 + depth * 18}px;cursor:pointer;font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;user-select:none;border-radius:4px;">
            <span style="display:inline-block;width:12px;transform:rotate(${collapsed ? 0 : 90}deg);transition:transform .15s;color:var(--text-muted);">▶</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            <span style="font-family:var(--font-mono);"><strong style="color:var(--text-primary);">${esc(d.name)}</strong>/</span>
            <span style="color:var(--text-muted);font-size:10px;">${count} file${count !== 1 ? 's' : ''}</span>
          </div>`;
        if (!collapsed) out += `<div style="padding-left:${depth * 8}px;">${renderNode(d, depth + 1)}</div>`;
      }
      // Files at this level
      const files = node.files.slice().sort((a, b) => a.basename.localeCompare(b.basename));
      for (const f of files) {
        out += `<div style="padding-left:${(depth + 1) * 12}px;">${_fileRowHtml(f)}</div>`;
      }
      return out;
    }
    return renderNode(root, 0);
  }

  // ── Rename inline ─────────────────────────────────────────────────────────
  async function renameFile(filename) {
    const suggested = filename.split('/').pop();
    window.showModal({
      title: 'Rename file',
      width: '460px',
      content: `
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;">Rename <strong style="color:var(--text-primary);font-family:var(--font-mono);">${esc(filename)}</strong></p>
        <input id="dp-rename-input" class="dp-files-search-input" type="text" value="${esc(suggested)}" style="width:100%;font-family:var(--font-mono);" autofocus>
        <p style="font-size:11px;color:var(--text-muted);margin:8px 0 0;">If this is a registered HTML page, its registry URL will follow the new basename automatically.</p>`,
      confirmText: 'Rename',
      onConfirm: async () => {
        const input = document.getElementById('dp-rename-input');
        const newBase = input ? input.value.trim() : '';
        if (!newBase || newBase === suggested) return;
        // Preserve subdirectory
        const dir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/')) : '';
        const newName = dir ? `${dir}/${newBase}` : newBase;
        try {
          const r = await window.ALPApi.renameDemoFile(S().selectedWebsiteId, filename, newName);
          window.showToast(`Renamed to ${r.newName}${r.rewired ? ` (${r.rewired} registry entry updated)` : ''}`, 'success');
          await loadFiles(S().selectedWebsiteId);
          await window.DemoPagesPage.loadPages();
          renderFilesList();
        } catch (err) { window.showToast('Rename failed: ' + err.message, 'error'); }
      }
    });
    setTimeout(() => {
      const input = document.getElementById('dp-rename-input');
      if (input) {
        const dotIdx = input.value.lastIndexOf('.');
        input.focus();
        if (dotIdx > 0) input.setSelectionRange(0, dotIdx);
      }
    }, 60);
  }

  // ── Replace: pick new file, fetch old for diff, confirm, then upload ─────
  function replaceFile(filename) {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.style.display = 'none';
    document.body.appendChild(picker);
    picker.addEventListener('change', async () => {
      const newFile = picker.files && picker.files[0];
      document.body.removeChild(picker);
      if (!newFile) return;
      await _showReplaceDiff(filename, newFile);
    });
    picker.click();
  }

  async function _showReplaceDiff(oldName, newFile) {
    const isText = ext_is_textish(oldName) || /\.(html?|css|js|mjs)$/i.test(oldName);
    let oldContent = '';
    let diffSummary = '';
    if (isText && newFile.size < 2 * 1024 * 1024) {
      try {
        const oldRes = await window.ALPApi.getFileContent(S().selectedWebsiteId, oldName);
        oldContent = oldRes.content || '';
        const newContent = await newFile.text();
        const oldLines = oldContent.split(/\r?\n/);
        const newLines = newContent.split(/\r?\n/);
        const added   = Math.max(0, newLines.length - oldLines.length);
        const removed = Math.max(0, oldLines.length - newLines.length);
        diffSummary = `<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:12px;margin-bottom:10px;">
          <strong style="color:var(--text-primary);">Line count:</strong> ${oldLines.length} → ${newLines.length}
          ${added   ? `<span style="color:#10b981;margin-left:8px;">+${added}</span>` : ''}
          ${removed ? `<span style="color:#ef4444;margin-left:8px;">−${removed}</span>` : ''}
          <div style="margin-top:6px;color:var(--text-secondary);">Old size: ${fmtSize(oldContent.length)} · New size: ${fmtSize(newFile.size)}</div>
        </div>`;
      } catch (_) { /* fall back to size-only diff */ }
    }
    if (!diffSummary) {
      const site = S().websites.find(w => String(w.id) === String(S().selectedWebsiteId));
      diffSummary = `<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:12px;margin-bottom:10px;">
        <div>Old size unknown or binary — new file: <strong style="color:var(--text-primary);">${fmtSize(newFile.size)}</strong></div>
      </div>`;
    }

    window.showModal({
      title: `Replace ${oldName}`,
      width: '520px',
      content: `
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;">
          Overwrite <strong style="color:var(--text-primary);font-family:var(--font-mono);">${esc(oldName)}</strong> with <strong style="color:var(--text-primary);font-family:var(--font-mono);">${esc(newFile.name)}</strong>?
        </p>
        ${diffSummary}
        <p style="font-size:11px;color:var(--text-muted);margin:0;">The old contents are lost. This runs the same upload path (auto-injects the tracker for HTML).</p>`,
      confirmText: 'Replace',
      type: 'danger',
      onConfirm: async () => {
        try {
          // Preserve subdirectory of the old file by faking webkitRelativePath
          const dir = oldName.includes('/') ? oldName.substring(0, oldName.lastIndexOf('/')) : '';
          const targetName = dir ? `${dir}/${oldName.split('/').pop()}` : oldName.split('/').pop();
          // Wrap with a proxied file so uploader picks up the target path.
          // The upload endpoint reads req.body.paths and drops the first
          // segment, so we prepend a dummy root.
          const proxied = new File([newFile], oldName.split('/').pop(), { type: newFile.type });
          Object.defineProperty(proxied, 'webkitRelativePath', {
            value: `_root/${targetName}`,
            writable: false,
            configurable: true
          });
          await window.ALPApi.uploadDemoFiles(S().selectedWebsiteId, [proxied]);
          window.showToast(`Replaced ${oldName}`, 'success');
          await loadFiles(S().selectedWebsiteId);
          renderFilesList();
        } catch (err) { window.showToast('Replace failed: ' + err.message, 'error'); }
      }
    });
  }

  // ── Content search ────────────────────────────────────────────────────────
  async function runContentSearch(query) {
    query = (query || '').trim();
    if (!query) { _contentSearchResults = null; renderFilesList(); return; }
    try {
      window.showToast('Searching…', 'info');
      const r = await window.ALPApi.searchFileContent(S().selectedWebsiteId, query);
      _contentSearchResults = r;
      renderFilesList();
    } catch (err) {
      window.showToast('Search failed: ' + err.message, 'error');
    }
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

    // Bulk register — HTML files only (static assets don't get registered)
    $('dp-files-bulk-register')?.addEventListener('click', () => {
      const htmlUnlinkedSel = [..._selectedFiles].filter(f => {
        return getFileType(f).group === 'html' && !isLinked(f);
      });
      if (!htmlUnlinkedSel.length) {
        window.showToast('No HTML files to register. Static assets (images, CSS, JS) don\'t need registration.', 'info');
        return;
      }
      // Stay on Files tab — just open the modal in place. The modal is a
      // portal to <body>, so it works regardless of which tab is visible.
      window.DemoPagesModals.openAddModal(htmlUnlinkedSel[0]);
      if (htmlUnlinkedSel.length > 1) window.showToast(`Registering one at a time — starting with ${htmlUnlinkedSel[0]}`, 'info');
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

    // Per-file register button — open the modal inline on the Files tab
    // (modal is a body-level portal, no tab switch needed)
    container.querySelectorAll('.dp-file-add-btn').forEach(btn => {
      if (!btn.dataset.file) return;
      btn.addEventListener('click', () => {
        window.DemoPagesModals.openAddModal(btn.dataset.file);
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

    // Preview button (HTML files only — iframe)
    container.querySelectorAll('.dp-file-preview-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); previewFile(btn.dataset.file); });
    });

    // View image button
    container.querySelectorAll('.dp-file-viewimg-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); previewImage(btn.dataset.file); });
    });

    // View code button (HTML/CSS/JS/JSON/SVG/etc)
    container.querySelectorAll('.dp-file-viewcode-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); viewCode(btn.dataset.file); });
    });

    // Copy URL button
    container.querySelectorAll('.dp-file-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); copyFileUrl(btn.dataset.file); });
    });

    // Rename button
    container.querySelectorAll('.dp-file-rename-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); renameFile(btn.dataset.file); });
    });

    // Replace button
    container.querySelectorAll('.dp-file-replace-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); replaceFile(btn.dataset.file); });
    });

    // Tree view: toggle folder collapse
    container.querySelectorAll('.dp-tree-dir').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const p = el.dataset.dirPath;
        if (_collapsedDirs.has(p)) _collapsedDirs.delete(p);
        else _collapsedDirs.add(p);
        renderFilesList();
      });
    });

    // View mode segmented control (flat / tree)
    container.querySelectorAll('.dp-view-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.viewMode;
        if (!mode || mode === _viewMode) return;
        _viewMode = mode;
        renderFilesList();
      });
    });

    // Content search: Enter in input OR button click
    const csInput = $('dp-content-search');
    if (csInput) {
      csInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); runContentSearch(csInput.value); }
      });
    }
    $('dp-content-search-btn')?.addEventListener('click', () => {
      const v = $('dp-content-search')?.value || '';
      runContentSearch(v);
    });
    $('dp-content-search-clear')?.addEventListener('click', () => {
      _contentSearchResults = null;
      renderFilesList();
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
