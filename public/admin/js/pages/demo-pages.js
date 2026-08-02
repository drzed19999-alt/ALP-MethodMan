/**
 * ALP - Demo Pages Manager (Core)
 * Workspace uses a 3-tab layout: Upload → Files → Registry
 * Auto-advances to Files tab after upload.
 * Files tab shows linked/unlinked status per file.
 *
 * Modals & field logic → demo-pages-modals.js
 */
const DemoPagesPage = (() => {
  window.DemoPagesState = { selectedWebsiteId: null, websites: [], pages: [], selectedPageIds: new Set() };
  function S() { return window.DemoPagesState; }

  let _currentTab = 'upload';
  let _siteFiles  = [];

  // ─── Utils ────────────────────────────────────────────────────────────────
  function esc(s) { if (!s) return ''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
  function getTypeInfo(v) { return DemoPagesFields.getTypeInfo(v); }
  function renderFieldPills(fields) {
    if (!fields||!fields.length) return '<span style="color:var(--text-tertiary);font-size:11px;font-style:italic;">No fields</span>';
    return fields.map(f=>`<span class="dp-field-pill">${esc(f)}</span>`).join('');
  }
  function parseAltDomains(raw) {
    if (!raw) return [];
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return [{ domain: raw, active: 0 }]; }
  }
  function avatarColor(str) {
    const c=['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
    let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
    return c[Math.abs(h)%c.length];
  }
  function hexRgb(hex) {
    const h=hex.replace('#','');
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }
  function isLinked(fileName) {
    const base = fileName.replace(/\.html$/i,'');
    return S().pages.find(p => { const segs=p.url.split('/'); return segs[segs.length-1]===base; }) || null;
  }

  // ─── Root render ──────────────────────────────────────────────────────────
  function render() {
    return `
      <div class="dp-page" id="demo-pages-root">
        <!-- Card Grid View -->
        <div id="dp-view-cards" class="dp-view dp-view--active">
          <div class="dp-header">
            <div><h1 class="dp-title">Scam Pages</h1><p class="dp-subtitle">Click a site to manage it</p></div>
            <div style="display:flex;gap:10px;align-items:center;">
              <button id="dp-guide-btn" class="dp-btn-ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Guide
              </button>
              <button id="dp-add-website-ai-btn" class="dp-btn-ghost" style="display:none;background:rgba(139,92,246,.15);color:#c084fc;border-color:rgba(139,92,246,.3);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                🤖 Create with AI
              </button>
              <button id="dp-add-website-btn" class="dp-btn-hero">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                + Add Scam Page
              </button>
            </div>
          </div>
          <div class="dp-search-bar-wrap">
            <div class="dp-search-bar-inner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted);"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input id="dp-site-search" type="text" placeholder="Search sites by name…" class="dp-search-input" autocomplete="off" />
              <button id="dp-site-search-clear" class="dp-search-clear" style="display:none;" title="Clear">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <span id="dp-search-count" class="dp-search-count" style="display:none;"></span>
          </div>
          <div id="dp-site-cards"></div>
        </div>

        <!-- Workspace View -->
        <div id="dp-view-workspace" class="dp-view dp-view--hidden">

          <!-- Back nav -->
          <div class="dp-ws-nav">
            <button id="dp-back-btn" class="dp-ws-back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              All Scam Pages
            </button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span id="dp-ws-bc-name" style="font-size:13px;font-weight:600;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;"></span>
          </div>

          <!-- Hero banner -->
          <div id="dp-ws-hero" class="dp-ws-hero">
            <div id="dp-ws-hero-bg" class="dp-ws-hero-bg"></div>
            <div class="dp-ws-hero-body">
              <div id="dp-ws-logo" class="dp-ws-logo"></div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
                  <span id="dp-ws-name" style="font-size:20px;font-weight:800;color:#f1f5f9;letter-spacing:-.3px;"></span>
                  <span id="dp-ws-status"></span>
                </div>
                <div id="dp-ws-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"></div>
              </div>
              <div id="dp-ws-stats" class="dp-ws-stats"></div>
            </div>
          </div>

          <!-- ── Tab bar ──────────────────────────────────────────────────── -->
          <div class="dp-tab-bar">
            <button class="dp-tab dp-tab--active" data-tab="upload">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              Upload
            </button>
            <button class="dp-tab" data-tab="files">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Files on Server
              <span class="dp-tab-pill" id="dp-tab-files-count"></span>
            </button>
            <button class="dp-tab" data-tab="registry">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
              Page Registry
              <span class="dp-tab-pill" id="dp-tab-reg-count"></span>
            </button>
            <button class="dp-tab" data-tab="settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Settings
            </button>
            <div class="dp-tab-bar-line"></div>
          </div>

          <!-- ── Tab panels ─────────────────────────────────────────────── -->
          <div class="dp-panels-wrap">

            <!-- PANEL 1: Upload -->
            <div id="dp-panel-upload" class="dp-panel dp-panel--active">
              <div class="dp-panel-inner">
                <div class="dp-upload-hint">
                  <div class="dp-upload-hint-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                  </div>
                  <div>
                    <div style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:3px;">Upload Scam Page Folder</div>
                    <div style="font-size:12px;color:var(--text-muted);">Select your site folder — all <code>.html</code> files will be deployed to <span id="dp-upload-path" style="color:#a78bfa;font-family:var(--font-mono);"></span></div>
                  </div>
                </div>

                <div class="dp-drop-zone" id="dp-drop-area">
                  <div class="dp-drop-icon-wrap">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <p style="font-size:13px;font-weight:600;color:var(--text-tertiary);margin:0 0 4px;">Drag &amp; drop files here</p>
                  <p style="font-size:11px;color:var(--text-placeholder);margin:0 0 14px;">or choose below — folder or individual .html files</p>
                  <input type="file" id="dp-folder-input" webkitdirectory multiple style="display:none;"/>
                  <input type="file" id="dp-files-input" accept=".html,.htm,.css,.js,.png,.jpg,.jpeg,.gif,.svg,.webp,.ico,.woff,.woff2,.ttf" multiple style="display:none;"/>
                  <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                    <button id="dp-folder-pick-btn" class="dp-pick-btn">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                      Choose Folder
                    </button>
                    <button id="dp-files-pick-btn" class="dp-pick-btn" style="background:rgba(99,102,241,.1);color:#a5b4fc;border-color:rgba(99,102,241,.25);">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      Choose Files
                    </button>
                  </div>
                </div>

                <div id="dp-folder-preview" style="display:none;margin-top:14px;"></div>

                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;">
                  <span style="font-size:11px;color:var(--text-placeholder);">Non-HTML files (CSS, JS, images) are also supported</span>
                  <button id="dp-folder-upload-btn" class="dp-upload-btn" disabled>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload to Server
                  </button>
                </div>
              </div>
            </div>

            <!-- PANEL 2: Files on Server -->
            <div id="dp-panel-files" class="dp-panel">
              <div class="dp-panel-inner">
                <div id="dp-warning-banner"></div>
                <div id="dp-files-list">
                  <div class="dp-loading"><div class="dp-spinner"></div><span>Loading files…</span></div>
                </div>
              </div>
            </div>

            <!-- PANEL 3: Registry -->
            <div id="dp-panel-registry" class="dp-panel">
              <div class="dp-panel-inner">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                  <div>
                    <div style="font-size:13px;font-weight:700;color:#e2e8f0;">Page Registry</div>
                    <div style="font-size:11px;color:var(--text-muted);">Map HTML files to form types &amp; captured fields</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <button class="dp-btn-ghost" id="dp-select-all-btn" style="padding:7px 14px;font-size:12px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                      Select All
                    </button>
                    <button class="dp-add-btn" id="dp-add-btn">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Page Entry
                    </button>
                  </div>
                </div>
                <div class="dp-grid" id="dp-grid">
                  <div class="dp-loading"><div class="dp-spinner"></div><span>Loading…</span></div>
                </div>
              </div>
            </div>

            <!-- PANEL 4: Settings -->
            <div id="dp-panel-settings" class="dp-panel">
              <div class="dp-panel-inner" id="dp-settings-inner">
                <div class="dp-loading"><div class="dp-spinner"></div><span>Loading settings…</span></div>
              </div>
            </div>

          </div><!-- /panels-wrap -->
        </div><!-- /workspace -->
      </div>
    `;
  }

  // ─── View transitions ──────────────────────────────────────────────────────
  function showView(name) {
    const cards = document.getElementById('dp-view-cards');
    const ws    = document.getElementById('dp-view-workspace');
    if (!cards||!ws) return;
    if (name === 'workspace') {
      cards.style.animation = 'dpSL .24s ease forwards';
      setTimeout(() => {
        cards.className='dp-view dp-view--hidden'; cards.style.animation='';
        ws.className='dp-view dp-view--active';
        ws.style.animation='dpSR .24s ease forwards';
        document.getElementById('demo-pages-root')?.scrollIntoView({behavior:'smooth',block:'start'});
      }, 200);
    } else {
      ws.style.animation = 'dpOR .24s ease forwards';
      setTimeout(() => {
        ws.className='dp-view dp-view--hidden'; ws.style.animation='';
        cards.className='dp-view dp-view--active';
        cards.style.animation='dpOL .24s ease forwards';
        document.getElementById('demo-pages-root')?.scrollIntoView({behavior:'smooth',block:'start'});
      }, 200);
    }
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────
  function switchTab(name, fromLeft) {
    if (_currentTab === name) return;
    const prev = _currentTab;
    _currentTab = name;

    // Update tab buttons
    document.querySelectorAll('.dp-tab').forEach(b => {
      b.classList.toggle('dp-tab--active', b.dataset.tab === name);
    });

    // Slide panels
    const outAnim = fromLeft !== false ? 'dpPSL .22s ease forwards' : 'dpPSR .22s ease forwards';
    const inAnim  = fromLeft !== false ? 'dpPIR .22s ease forwards' : 'dpPIL .22s ease forwards';

    const prevPanel = document.getElementById(`dp-panel-${prev}`);
    const nextPanel = document.getElementById(`dp-panel-${name}`);
    if (!prevPanel||!nextPanel) return;

    prevPanel.style.animation = outAnim;
    setTimeout(() => {
      prevPanel.classList.remove('dp-panel--active'); prevPanel.style.animation='';
      nextPanel.classList.add('dp-panel--active');
      nextPanel.style.animation = inAnim;
      setTimeout(() => nextPanel.style.animation='', 240);
      // Load data on demand
      if (name === 'files') {
        const filesModule = window.DemoPagesFiles;
        if (filesModule && typeof filesModule.loadFiles === 'function') {
          filesModule.loadFiles().then(() => filesModule.renderFilesList());
        }
      }
      if (name === 'settings') { initSettingsPanel(S().selectedWebsiteId); }
    }, 180);
  }

  // ─── Site card grid ────────────────────────────────────────────────────────
  function renderSiteCards() {
    const c = document.getElementById('dp-site-cards'); if (!c) return;

    // Search filter
    const searchEl = document.getElementById('dp-site-search');
    const searchQ = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const clearBtn = document.getElementById('dp-site-search-clear');
    const countEl = document.getElementById('dp-search-count');
    const sites = searchQ
      ? S().websites.filter(w => (w.name||'').toLowerCase().includes(searchQ) || (w.demo_slug||'').toLowerCase().includes(searchQ) || (w.domain||'').toLowerCase().includes(searchQ))
      : S().websites;
    if (clearBtn) clearBtn.style.display = searchQ ? 'flex' : 'none';
    if (countEl) { countEl.style.display = searchQ ? 'inline' : 'none'; countEl.textContent = `${sites.length} of ${S().websites.length}`; }

    if (!S().websites.length) {
      c.innerHTML=`<div class="dp-sites-empty"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.28)" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg><p style="font-size:15px;font-weight:700;color:var(--text-primary);margin:0;">No Scam Pages yet</p><p style="font-size:12px;color:var(--text-secondary);margin:0;">Click <strong style="color:#a5b4fc;">+ Add Scam Page</strong> to get started</p></div>`;
      return;
    }
    if (searchQ && !sites.length) {
      c.innerHTML=`<div class="dp-sites-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.28)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:0;">No results for "${esc(searchQ)}"</p><p style="font-size:12px;color:var(--text-secondary);margin:0;">Try a different search term.</p></div>`;
      return;
    }
    const allDomains = (w) => {
      const d = [];
      const seen = new Set();
      const primaryNorm = (w.domain || '').trim().toLowerCase();
      if (primaryNorm && primaryNorm !== 'localhost' && !primaryNorm.startsWith('auto-')) {
        seen.add(primaryNorm);
        d.push({ domain: w.domain, active: w.domain_active !== 0, primary: true });
      }
      parseAltDomains(w.domain_alt).forEach(a => {
        const n = (a.domain || '').trim().toLowerCase();
        if (n && !seen.has(n)) { seen.add(n); d.push({ domain: a.domain, active: !!a.active, primary: false }); }
      });
      return d;
    };
    const activeDomain = (w) => {
      const doms = allDomains(w);
      const on = doms.find(d => d.active);
      return on ? on.domain : null;
    };
    c.innerHTML=`<div class="dp-sites-grid">${sites.map((w,i)=>{
      const col=w.color || avatarColor(w.name||String(w.id));
      const [r,g,b]=hexRgb(col);
      const init=(w.name||'?')[0].toUpperCase();
      const validLogo = (w.logo_url && w.logo_url !== 'null' && w.logo_url !== 'undefined') ? w.logo_url.trim() : null;
      const logo = validLogo ? `<img src="${esc(validLogo)}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none'">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;background:${col};">${esc(init)}</div>`;
      const doms = allDomains(w);
      const liveDom = activeDomain(w);
      const pageCount = (w.pages && w.pages.length) || 0;
      return `
        <div class="dp-site-card ${w.is_active ? '' : 'dp-site-card--disabled'}" data-site-id="${w.id}" style="--sc-r:${r};--sc-g:${g};--sc-b:${b};animation-delay:${Math.min(i*.07,.42)}s;">
          <div class="dp-site-card-glow"></div>
          <div class="dp-site-card-bar"></div>

          <!-- Navbar strip (in document flow, not absolute) -->
          <div class="dp-site-card-nav">
            <span class="dp-site-dot ${w.is_active ? 'on' : 'off'}"></span>
            <span class="dp-nav-lbl ${w.is_active ? 'dp-nav-lbl--on' : 'dp-nav-lbl--off'}">${w.is_active ? 'Active' : 'Disabled'}</span>
            <div style="flex:1;"></div>
            <button class="dp-site-card-toggle ${w.is_active ? 'dp-site-card-toggle--on' : 'dp-site-card-toggle--off'}" data-site-id="${w.id}" title="${w.is_active ? 'Click to Disable website' : 'Click to Enable website'}">
              ${w.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>

          <!-- Card body (flex column, constrained) -->
          <div class="dp-site-card-body">
            <!-- Identity -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;flex-shrink:0;">
              <div style="width:38px;height:38px;border-radius:10px;overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.09);box-shadow:0 3px 10px rgba(0,0,0,.3);">${logo}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:800;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.02em;">${esc(w.name)}</div>
                ${w.demo_slug?`<div style="font-size:9.5px;color:#818cf8;font-family:var(--font-mono);margin-top:1px;">/demo/${esc(w.demo_slug)}/</div>`:`<div style="font-size:9.5px;color:#f87171;margin-top:1px;">No slug</div>`}
              </div>
            </div>

            <!-- Domains section -->
            <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:6px 8px;margin-bottom:7px;flex-shrink:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;">Domains</span>
                <button class="dp-domains-cfg-btn" data-site-id="${w.id}">🌐 Domain Routing</button>
              </div>
              <div class="dp-site-domains-list">
                ${doms.map(d => `
                  <div style="display:flex;align-items:center;gap:5px;padding:2px 0;" title="${esc(d.domain)}">
                    <span style="width:5px;height:5px;border-radius:50%;flex-shrink:0;background:${d.active ? '#10b981' : '#ef4444'};${d.active ? 'box-shadow:0 0 5px rgba(16,185,129,.5);' : ''}"></span>
                    <span style="font-size:9.5px;font-family:var(--font-mono);color:${d.active ? '#e2e8f0' : '#64748b'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${esc(d.domain)}</span>
                    ${d.primary ? '<span style="font-size:7.5px;padding:1px 4px;background:rgba(99,102,241,.12);color:#818cf8;border-radius:6px;font-weight:700;flex-shrink:0;">PRIMARY</span>' : ''}
                  </div>`).join('')}
                ${doms.length === 0 ? '<div style="font-size:10px;color:#475569;font-style:italic;">No domains</div>' : ''}
              </div>
            </div>

            <!-- Pages section -->
            <div style="margin-bottom:7px;flex-shrink:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;">Pages</span>
                <span style="font-size:9.5px;font-weight:700;color:${pageCount > 0 ? '#818cf8' : '#475569'};">${pageCount}</span>
              </div>
              ${pageCount > 0 ? `
                <div class="dp-site-card-pages" style="display:flex;flex-wrap:wrap;gap:3px;max-height:40px;overflow-y:auto;">
                  ${w.pages.map(p => {
                    const type = getTypeInfo(p.form_type);
                    return `<span class="dp-site-page-pill" data-page-id="${p.id}" data-site-id="${w.id}" title="${esc(p.name)} (${esc(p.url)})" style="--sc-r:${r};--sc-g:${g};--sc-b:${b};"><span class="dp-page-pill-dot" style="background:${type.color};"></span>${esc(p.name)}</span>`;
                  }).join('')}
                </div>` : `<div style="font-size:9.5px;color:#475569;font-style:italic;">No registered pages</div>`}
            </div>

            <!-- Stats (pushed to bottom) -->
            <div style="display:flex;gap:5px;margin-top:auto;padding-top:5px;flex-shrink:0;">
              <div class="dp-sc-stat dp-sc-stat--g"><span style="font-size:14px;font-weight:800;">${w.active_sessions||0}</span><span style="font-size:7.5px;color:#6ee7b7;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">Live</span></div>
              <div class="dp-sc-stat"><span style="font-size:14px;font-weight:800;">${w.total_sessions||0}</span><span style="font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">Total</span></div>
              <div class="dp-sc-stat"><span style="font-size:14px;font-weight:800;">${w.page_views_today||0}</span><span style="font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">Today</span></div>
            </div>
          </div>

          <!-- Footer -->
          <div class="dp-site-card-foot" style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span class="dp-site-card-workspace-btn" style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:2px 4px;border-radius:5px;transition:background .15s;" title="Open workspace" onmouseenter="this.style.background='rgba(255,255,255,.06)'" onmouseleave="this.style.background='transparent'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </span>
            ${liveDom ? `
            <button class="dp-open-domain-btn" data-domain="${esc(liveDom)}" title="Open ${esc(liveDom)}" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;border:1px solid rgba(16,185,129,.2);background:rgba(16,185,129,.08);color:#34d399;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;" onmouseenter="this.style.background='rgba(16,185,129,.18)'" onmouseleave="this.style.background='rgba(16,185,129,.08)'">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              ${esc(liveDom.length > 22 ? liveDom.slice(0,20) + '..' : liveDom)}
            </button>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`;
    c.querySelectorAll('.dp-site-card-toggle').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWebsiteActive(btn.dataset.siteId);
    }));
    c.querySelectorAll('.dp-domains-cfg-btn').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDomainConfigModal(btn.dataset.siteId);
    }));
    c.querySelectorAll('.dp-open-domain-btn').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      let domain = btn.dataset.domain || '';
      if (domain && !domain.startsWith('http')) domain = 'https://' + domain;
      if (domain) window.open(domain, '_blank', 'noopener');
    }));
    c.querySelectorAll('.dp-site-card-workspace-btn').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.dp-site-card');
      if (card && card.dataset.siteId) {
        selectSite(card.dataset.siteId);
      }
    }));
    c.querySelectorAll('.dp-site-page-pill').forEach(el=>el.addEventListener('click',e=>{
      e.stopPropagation();
      const siteId = el.dataset.siteId;
      const pageId = parseInt(el.dataset.pageId, 10);
      selectSite(siteId);
      switchTab('registry', true);
      setTimeout(() => {
        const card = document.querySelector(`.dp-card[data-id="${pageId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('dp-card--highlight');
          setTimeout(() => card.classList.remove('dp-card--highlight'), 2000);
        }
      }, 300);
    }));
  }

  // ─── Domain config modal ──────────────────────────────────────────────────
  function openDomainConfigModal(siteId) {
    const site = S().websites.find(w => String(w.id) === String(siteId));
    if (!site) return;

    const primaryDomain = (site.domain || '').trim().toLowerCase();
    const primaryActive = site.domain_active !== 0;
    const altDoms = parseAltDomains(site.domain_alt);

    // Build a deduplicated flat domain list (primary + alts, no duplicates)
    const seen = new Set();
    const allDomsList = [];
    if (primaryDomain && primaryDomain !== 'localhost' && !primaryDomain.startsWith('auto-')) {
      seen.add(primaryDomain);
      allDomsList.push({ domain: primaryDomain, active: primaryActive, isPrimary: true });
    }
    altDoms.forEach(a => {
      const d = (a.domain || '').trim().toLowerCase();
      if (d && !seen.has(d)) {
        seen.add(d);
        allDomsList.push({ domain: d, active: !!a.active, isPrimary: false });
      }
    });

    // Sort: active first
    allDomsList.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));

    function rowHtml(domain, active, isPrimary) {
      return `<div class="dcm-row" data-domain="${esc(domain)}" data-primary="${isPrimary ? '1' : '0'}">
        <span class="dcm-dot" style="background:${active ? '#10b981' : '#ef4444'};${active ? 'box-shadow:0 0 5px rgba(16,185,129,.5);' : ''}transition:background .2s;"></span>
        <span class="dcm-dname">${esc(domain)}</span>
        ${isPrimary ? '<span style="font-size:7.5px;padding:1px 5px;background:rgba(99,102,241,.15);color:#818cf8;border-radius:20px;font-weight:700;flex-shrink:0;">PRIMARY</span>' : ''}
        <label class="dcm-tog" title="${active ? 'Deactivate' : 'Activate'}">
          <input type="checkbox" class="dcm-cb" data-domain="${esc(domain)}" ${active ? 'checked' : ''}>
          <span class="dcm-tog-track"></span>
        </label>
        ${!isPrimary ? `<button class="dcm-rm" data-domain="${esc(domain)}" title="Remove">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
      </div>`;
    }

    const content = `<style>
.dcm-row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:9px;margin-bottom:5px;transition:border-color .2s;}
.dcm-row[data-active="1"]{border-color:rgba(16,185,129,.2);background:rgba(16,185,129,.04);}
.dcm-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:all .2s;}
.dcm-dname{flex:1;font-size:12px;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dcm-tog{position:relative;display:inline-flex;align-items:center;cursor:pointer;flex-shrink:0;}
.dcm-tog input{position:absolute;opacity:0;width:0;height:0;}
.dcm-tog-track{width:28px;height:16px;background:rgba(255,255,255,.08);border-radius:20px;border:1px solid rgba(255,255,255,.1);transition:all .2s;position:relative;}
.dcm-tog-track::after{content:'';position:absolute;left:2px;top:2px;width:10px;height:10px;border-radius:50%;background:#475569;transition:all .2s;}
.dcm-tog input:checked~.dcm-tog-track{background:rgba(16,185,129,.22);border-color:rgba(16,185,129,.4);}
.dcm-tog input:checked~.dcm-tog-track::after{background:#10b981;transform:translateX(12px);}
.dcm-rm{width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.15);border-radius:6px;cursor:pointer;flex-shrink:0;transition:all .15s;}
.dcm-rm:hover{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.3);}
.dcm-section-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;margin-top:12px;}
</style>
<div>
  <div class="dcm-section-lbl" style="color:#10b981;">● Active Domains</div>
  <div id="dcm-active-list">
    ${allDomsList.filter(d => d.active).map(d => rowHtml(d.domain, true, d.isPrimary)).join('') ||
      '<div style="font-size:12px;color:#475569;font-style:italic;padding:4px 0 8px;">No active domains</div>'}
  </div>

  <div class="dcm-section-lbl" style="color:#64748b;">○ Inactive Domains</div>
  <div id="dcm-inactive-list">
    ${allDomsList.filter(d => !d.active).map(d => rowHtml(d.domain, false, d.isPrimary)).join('') ||
      '<div style="font-size:12px;color:#475569;font-style:italic;padding:4px 0;">All domains are active</div>'}
  </div>
  <div style="font-size:10.5px;color:#475569;margin-top:14px;padding:8px 10px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.05);">
    To add a new domain, use the <strong style="color:#94a3b8;">Domain Dashboard</strong>.
  </div>
</div>`;

    window.showModal({
      title: '🌐 Domain Routing',
      content,
      confirmText: 'Save Changes',
      cancelText: 'Cancel',
      width: '520px',
      onConfirm: async () => {
        // Collect all rows from both sections
        const allRows = [...document.querySelectorAll('#dcm-active-list .dcm-row, #dcm-inactive-list .dcm-row')];
        let newPrimaryActive = primaryActive;
        const newAltDoms = [];

        allRows.forEach(row => {
          const domain = row.dataset.domain || '';
          const isPrimary = row.dataset.primary === '1';
          const active = row.querySelector('.dcm-cb')?.checked ? 1 : 0;
          if (isPrimary) {
            newPrimaryActive = !!active;
          } else if (domain) {
            newAltDoms.push({ domain, active });
          }
        });

        await window.ALPApi.updateWebsite(siteId, {
          domain_active: newPrimaryActive ? 1 : 0,
          domain_alt: newAltDoms,
        });
        await loadWebsites();
        window.showToast?.('Domains updated', 'success');
      },
    });

    setTimeout(() => {
      // Toggle dot color + move row between active/inactive sections on change
      function wireCb(cb) {
        cb.addEventListener('change', () => {
          const row = cb.closest('.dcm-row');
          if (!row) return;
          const dot = row.querySelector('.dcm-dot');
          const activeList   = document.getElementById('dcm-active-list');
          const inactiveList = document.getElementById('dcm-inactive-list');
          if (cb.checked) {
            if (dot) { dot.style.background = '#10b981'; dot.style.boxShadow = '0 0 5px rgba(16,185,129,.5)'; }
            row.style.borderColor = 'rgba(16,185,129,.2)';
            row.style.background  = 'rgba(16,185,129,.04)';
            // Remove empty placeholder
            activeList?.querySelectorAll('div:not(.dcm-row)').forEach(el => el.remove());
            activeList?.appendChild(row);
          } else {
            if (dot) { dot.style.background = '#ef4444'; dot.style.boxShadow = ''; }
            row.style.borderColor = '';
            row.style.background  = '';
            inactiveList?.querySelectorAll('div:not(.dcm-row)').forEach(el => el.remove());
            inactiveList?.appendChild(row);
          }
        });
      }

      document.querySelectorAll('.dcm-cb').forEach(wireCb);

      // Remove button
      document.querySelectorAll('.dcm-rm').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.dcm-row')?.remove());
      });

    }, 60);
  }

  // ─── Select site ───────────────────────────────────────────────────────────
  function selectSite(id) {
    S().selectedWebsiteId = id;
    _siteFiles = [];
    _currentTab = 'upload';
    const site = S().websites.find(w=>String(w.id)===String(id));
    const col = (site && site.color) || avatarColor((site&&site.name)||id);
    const [r,g,b] = hexRgb(col);
    const init = (site&&site.name||'?')[0].toUpperCase();

    // Breadcrumb
    const bc=document.getElementById('dp-ws-bc-name'); if(bc) bc.textContent=site?site.name:'';

    // Hero
    const bg=document.getElementById('dp-ws-hero-bg');
    if(bg) bg.style.background=`linear-gradient(135deg,rgba(${r},${g},${b},.18) 0%,rgba(${r},${g},${b},.04) 55%,transparent 100%)`;

    const logoEl=document.getElementById('dp-ws-logo');
    if(logoEl){
      const validHeroLogo = (site && site.logo_url && site.logo_url !== 'null' && site.logo_url !== 'undefined') ? site.logo_url.trim() : null;
      logoEl.style.background = validHeroLogo ? 'transparent' : col;
      logoEl.innerHTML = validHeroLogo
        ? `<img src="${esc(validHeroLogo)}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;" onerror="this.parentElement.style.background='${col}';this.remove()">`
        : `<span style="font-size:24px;font-weight:800;color:#fff;">${esc(init)}</span>`;
    }

    const nameEl=document.getElementById('dp-ws-name'); if(nameEl) nameEl.textContent=site?site.name:'';
    const statusEl=document.getElementById('dp-ws-status');
    if(statusEl) {
      const isActive = site && site.is_active;
      statusEl.innerHTML = isActive
        ? `<button id="dp-toggle-active-btn" class="dp-hero-badge dp-hero-badge--g dp-hero-badge--btn" title="Click to deactivate">● Active</button>`
        : `<button id="dp-toggle-active-btn" class="dp-hero-badge dp-hero-badge--btn dp-hero-badge--off" title="Click to activate">● Inactive</button>`;
      const toggleBtn = document.getElementById('dp-toggle-active-btn');
      if (toggleBtn) toggleBtn.addEventListener('click', () => toggleWebsiteActive(id));
    }

    const metaEl=document.getElementById('dp-ws-meta');
    if(metaEl) metaEl.innerHTML=[
      site&&site.demo_slug?`<code class="dp-hero-code">/demo/${esc(site.demo_slug)}/</code>`:`<span style="color:#ef4444;font-size:11px;">⚠ No slug</span>`,
      site?`<span style="color:var(--text-secondary);font-size:11px;font-family:var(--font-mono);">${esc(site.domain)}</span>`:'',
    ].join('');

    const statsEl=document.getElementById('dp-ws-stats');
    if(statsEl) statsEl.innerHTML=`
      <div class="dp-hero-stat dp-hero-stat--g"><div style="font-size:22px;font-weight:800;color:#10b981;">${site?site.active_sessions||0:0}</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Live</div></div>
      <div class="dp-hero-stat"><div style="font-size:22px;font-weight:800;color:var(--text-secondary);">${site?site.total_sessions||0:0}</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Sessions</div></div>
      <div class="dp-hero-stat"><div style="font-size:22px;font-weight:800;color:#818cf8;">${site?site.page_views_today||0:0}</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Today</div></div>
      <div class="dp-hero-stat"><div style="font-size:22px;font-weight:800;color:#f59e0b;">${site?(site.pages||[]).length:0}</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Pages</div></div>`;

    const pathEl=document.getElementById('dp-upload-path');
    if(pathEl) pathEl.textContent=site&&site.demo_slug?`/demo/${site.demo_slug}/`:'(no slug)';

    // Reset tabs to Upload
    document.querySelectorAll('.dp-tab').forEach(b=>b.classList.toggle('dp-tab--active',b.dataset.tab==='upload'));
    document.querySelectorAll('.dp-panel').forEach(p=>p.classList.toggle('dp-panel--active',p.id==='dp-panel-upload'));

    showView('workspace');
    initUpload(id, site?site.demo_slug:null);
    loadPages();
  }

  // ─── Upload zone ───────────────────────────────────────────────────────────
  function initUpload(siteId, slug) {
    let pending = [];
    const preview    = document.getElementById('dp-folder-preview');
    const dropArea   = document.getElementById('dp-drop-area');
    const $pick      = $('dp-folder-pick-btn');
    const $filesPick = $('dp-files-pick-btn');
    const $up        = $('dp-folder-upload-btn');
    const $in        = $('dp-folder-input');
    const $filesIn   = $('dp-files-input');
    if ($up && $up._dpWired) return;
    if ($up) $up._dpWired = true;
    function setReady(ok){if(!$up)return;$up.disabled=!ok;$up.classList.toggle('dp-upload-btn--on',ok);}
    function showPreview(all){
      pending=all;
      if(!all.length){if(preview){preview.style.display='none';preview.innerHTML='';}setReady(false);return;}
      const htmlFiles=all.filter(f=>f.name.toLowerCase().endsWith('.html'));
      const totalSize=all.reduce((s,f)=>s+f.size,0);
      const sizeMB=(totalSize/1024/1024).toFixed(2);
      setReady(true);
      if(preview){
        preview.style.display='block';
        const label=htmlFiles.length
          ?`<span class="dp-fp-count">\u2713 ${htmlFiles.length} HTML + ${all.length-htmlFiles.length} asset${(all.length-htmlFiles.length)!==1?'s':''} ready</span>`
          :`<span class="dp-fp-count" style="background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.2);color:#fbbf24;">\u2713 ${all.length} asset file${all.length!==1?'s':''} (no HTML) ready</span>`;
        const chips=all.slice(0,12).map(f=>`<span class="dp-fp-chip">${esc(f.name)}</span>`).join('');
        const more=all.length>12?`<span class="dp-fp-chip dp-fp-chip--more">+${all.length-12} more</span>`:'';
        preview.innerHTML=`<div class="dp-fp-header">${label}<span class="dp-fp-skip">${all.length} file${all.length!==1?'s':''} \u2022 ${sizeMB} MB</span></div><div class="dp-fp-chips">${chips}${more}</div>`;
      }
    }
    $pick?.addEventListener('click',()=>$in?.click());
    $filesPick?.addEventListener('click',()=>$filesIn?.click());
    $in?.addEventListener('change',()=>showPreview(Array.from($in.files)));
    $filesIn?.addEventListener('change',()=>showPreview(Array.from($filesIn.files)));
    $up?.addEventListener('click',async()=>{
      if(!pending.length)return;
      if(!slug){window.showToast('Set a slug in Settings first.','warning');return;}
      $up.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:dpSpin 1s linear infinite;"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Uploading...';
      setReady(false);
      try{
        window.showToast(`Uploading ${pending.length} file(s)...`,'info');
        const result=await window.ALPApi.uploadDemoFiles(siteId,pending);
        const stats=result.stats;
        if(stats){
          const sizeMB=(stats.totalSize/1024/1024).toFixed(2);
          window.showToast(`Uploaded ${stats.total} file(s) (${stats.htmlFiles} HTML, ${stats.assets} assets) \u2022 ${sizeMB} MB`,'success');
        }else{window.showToast(`${pending.length} file(s) uploaded!`,'success');}
        pending=[];
        if($in)$in.value='';if($filesIn)$filesIn.value='';
        await window.DemoPagesFiles.loadFiles(siteId);
        switchTab('files', true);
        window.DemoPagesFiles.renderFilesList();
      }catch(err){
        const errMsg=err.data?.errors?err.data.errors.join(', '):err.message;
        window.showToast('Upload failed: '+errMsg,'error');setReady(true);
      }finally{
        $up.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload to Server';
      }
    });
    if(dropArea){
      dropArea.addEventListener('dragover',e=>{e.preventDefault();dropArea.classList.add('dp-drop-zone--over');});
      dropArea.addEventListener('dragleave',()=>dropArea.classList.remove('dp-drop-zone--over'));
      dropArea.addEventListener('drop',e=>{
        e.preventDefault();dropArea.classList.remove('dp-drop-zone--over');
        const dropped=[];
        if(e.dataTransfer?.items){for(const item of e.dataTransfer.items){const f=item.getAsFile();if(f)dropped.push(f);}}
        else if(e.dataTransfer?.files){dropped.push(...Array.from(e.dataTransfer.files));}
        if(dropped.length){showPreview(dropped);}
        else{window.showToast('No files detected. Use "Choose Folder" or "Choose Files".','info');}
      });
    }
  }

  function $(id){return document.getElementById(id);}

  // ─── Bridge Delegates ──────────────────────────────────────────────────────
  async function loadFiles(siteId) {
    return window.DemoPagesFiles.loadFiles(siteId);
  }

  function renderFilesList() {
    return window.DemoPagesFiles.renderFilesList();
  }

  function repaintGrid() {
    return window.DemoPagesRegistry.repaintGrid();
  }

  function checkOrphanedPages() {
    return window.DemoPagesRegistry.checkOrphanedPages();
  }

  function showOrphanedModal(orphaned) {
    return window.DemoPagesRegistry.showOrphanedModal(orphaned);
  }

  function clearBulkSelection() {
    return window.DemoPagesRegistry.clearBulkSelection();
  }


  // ─── Settings Panel ────────────────────────────────────────────────────────
  function initSettingsPanel(siteId) {
    const container = document.getElementById('dp-settings-inner');
    if (!container) return;
    const site = S().websites.find(w => String(w.id) === String(siteId));
    if (!site) { container.innerHTML = '<div style="padding:24px;color:var(--text-muted);">No site selected.</div>'; return; }

    const col = site.color || '#6366f1';
    const validLogo = (site.logo_url && site.logo_url !== 'null' && site.logo_url !== 'undefined') ? site.logo_url.trim() : '';
    const tgUsers = (() => { try { const a = JSON.parse(site.tg_allowed_users || '[]'); return Array.isArray(a) ? a.join(', ') : ''; } catch { return ''; } })();
    const apiKey = site.api_key || '';
    const isGod = window.ALPAuth && window.ALPAuth.isGod ? window.ALPAuth.isGod() : false;

    container.innerHTML = `
      <style>
        .dp-st-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px 22px;margin-bottom:18px;}
        .dp-st-card-hd{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.06);}
        .dp-st-card-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .dp-st-card-title{font-size:14px;font-weight:700;color:var(--text-primary);}
        .dp-st-card-desc{font-size:11px;color:var(--text-muted);margin-top:2px;}
        .dp-st-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .dp-st-field{display:flex;flex-direction:column;gap:5px;}
        .dp-st-field label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);}
        .dp-st-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:9px 12px;color:#f1f5f9;font-size:13px;font-family:'Inter',sans-serif;width:100%;box-sizing:border-box;transition:border-color .15s;}
        .dp-st-input:focus{outline:none;border-color:rgba(99,102,241,.5);box-shadow:0 0 0 3px rgba(99,102,241,.12);}
        .dp-st-input::placeholder{color:var(--text-placeholder);}
        .dp-st-footer{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06);}
        .dp-st-btn{padding:9px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:6px;transition:all .15s;border:none;}
        .dp-st-btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 2px 10px rgba(99,102,241,.3);}
        .dp-st-btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(99,102,241,.45);}
        .dp-st-btn-ghost{background:rgba(255,255,255,.06);color:var(--text-secondary);border:1px solid rgba(255,255,255,.1)!important;}
        .dp-st-btn-ghost:hover{background:rgba(255,255,255,.1);color:var(--text-primary);}
        .dp-st-btn-danger{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2)!important;}
        .dp-st-btn-danger:hover{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.35)!important;}
        .dp-st-key-row{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 14px;}
        .dp-st-key-val{flex:1;font-family:var(--font-mono);font-size:12px;color:#818cf8;word-break:break-all;}
        .dp-st-tog{position:relative;display:inline-flex;align-items:center;cursor:pointer;flex-shrink:0;}
        .dp-st-tog input{position:absolute;opacity:0;width:0;height:0;}
        .dp-st-tog-track{width:36px;height:20px;background:rgba(255,255,255,.1);border-radius:20px;border:1px solid rgba(255,255,255,.15);transition:all .2s;position:relative;}
        .dp-st-tog-track::after{content:'';position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#475569;transition:all .2s;}
        .dp-st-tog input:checked~.dp-st-tog-track{background:rgba(16,185,129,.25);border-color:rgba(16,185,129,.5);}
        .dp-st-tog input:checked~.dp-st-tog-track::after{background:#10b981;transform:translateX(16px);}
        .dp-st-danger-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);}
        .dp-st-danger-row:last-child{border-bottom:none;padding-bottom:0;}
        .dp-st-danger-label{font-size:13px;font-weight:600;color:var(--text-primary);}
        .dp-st-danger-hint{font-size:11px;color:var(--text-muted);margin-top:2px;}
        .dp-st-card--danger{border-color:rgba(239,68,68,.18);background:rgba(239,68,68,.03);}
        .dp-st-tg-status{display:flex;align-items:center;gap:6px;font-size:11px;margin-left:auto;}
      </style>

      <!-- Site Info -->
      <div class="dp-st-card">
        <div class="dp-st-card-hd">
          <div class="dp-st-card-icon" style="background:rgba(99,102,241,.15);color:#818cf8;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          </div>
          <div>
            <div class="dp-st-card-title">Site Info</div>
            <div class="dp-st-card-desc">Basic configuration — name, slug, color, logo</div>
          </div>
        </div>
        <div class="dp-st-grid">
          <div class="dp-st-field">
            <label>Site Name</label>
            <input type="text" id="dp-st-name" class="dp-st-input" value="${esc(site.name||'')}" placeholder="e.g. Chase Bank" />
          </div>
          <div class="dp-st-field">
            <label>Slug <span style="color:var(--text-placeholder);font-weight:400;">/demo/…/</span></label>
            <input type="text" id="dp-st-slug" class="dp-st-input" value="${esc(site.demo_slug||'')}" placeholder="chase" />
          </div>
          <div class="dp-st-field">
            <label>Glow Color</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="color" id="dp-st-color" value="${esc(col)}" style="width:38px;height:38px;padding:2px;background:none;border:1px solid rgba(255,255,255,.12);border-radius:8px;cursor:pointer;flex-shrink:0;" />
              <input type="text" id="dp-st-color-hex" class="dp-st-input" value="${esc(col)}" placeholder="#6366f1" />
            </div>
          </div>
          <div class="dp-st-field">
            <label>Logo URL</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="url" id="dp-st-logo" class="dp-st-input" value="${esc(validLogo)}" placeholder="https://…" style="flex:1;" />
              <div id="dp-st-logo-preview" style="width:36px;height:36px;border-radius:8px;border:1px solid rgba(255,255,255,.1);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                ${validLogo ? `<img src="${esc(validLogo)}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='?'">` : `<span style="font-size:10px;color:var(--text-placeholder);">?</span>`}
              </div>
            </div>
          </div>
        </div>
        <div class="dp-st-footer">
          <button id="dp-st-save-btn" class="dp-st-btn dp-st-btn-primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Save Changes
          </button>
        </div>
      </div>

      <!-- Telegram Bot -->
      <div class="dp-st-card">
        <div class="dp-st-card-hd">
          <div class="dp-st-card-icon" style="background:rgba(56,189,248,.12);color:#38bdf8;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </div>
          <div>
            <div class="dp-st-card-title">Telegram Bot</div>
            <div class="dp-st-card-desc">Per-site bot for data delivery notifications</div>
          </div>
          <div class="dp-st-tg-status">
            <span style="font-size:11px;color:var(--text-secondary);">Active</span>
            <label class="dp-st-tog">
              <input type="checkbox" id="dp-st-tg-active" ${site.tg_bot_active ? 'checked' : ''}>
              <span class="dp-st-tog-track"></span>
            </label>
          </div>
        </div>
        <div class="dp-st-grid">
          <div class="dp-st-field" style="grid-column:1/-1;">
            <label>Bot Token</label>
            <input type="password" id="dp-st-tg-token" class="dp-st-input" value="${esc(site.tg_bot_token||'')}" placeholder="123456789:AAAA…" autocomplete="new-password" />
          </div>
          <div class="dp-st-field">
            <label>Chat ID</label>
            <input type="text" id="dp-st-tg-chatid" class="dp-st-input" value="${esc(site.tg_chat_id||'')}" placeholder="-1001234567890" />
          </div>
          <div class="dp-st-field">
            <label>Allowed Users <span style="color:var(--text-placeholder);font-weight:400;">(comma-sep @names)</span></label>
            <input type="text" id="dp-st-tg-users" class="dp-st-input" value="${esc(tgUsers)}" placeholder="@admin1, @admin2" />
          </div>
        </div>
        <div class="dp-st-footer">
          <button id="dp-st-tg-save-btn" class="dp-st-btn dp-st-btn-primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Save Bot Config
          </button>
          <button id="dp-st-tg-test-btn" class="dp-st-btn dp-st-btn-ghost" style="border:1px solid rgba(56,189,248,.25);color:#38bdf8;background:rgba(56,189,248,.08);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send Test
          </button>
        </div>
      </div>

      <!-- API Key -->
      <div class="dp-st-card">
        <div class="dp-st-card-hd">
          <div class="dp-st-card-icon" style="background:rgba(245,158,11,.12);color:#f59e0b;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <div>
            <div class="dp-st-card-title">API Key</div>
            <div class="dp-st-card-desc">Used by the tracker script embedded into your pages</div>
          </div>
        </div>
        <div class="dp-st-key-row">
          <span class="dp-st-key-val" id="dp-st-key-display" title="${esc(apiKey)}">${apiKey ? apiKey.slice(0,8) + '••••••••••••••••••••' + apiKey.slice(-4) : '—'}</span>
          <button id="dp-st-key-toggle" class="dp-st-btn dp-st-btn-ghost" style="border:1px solid rgba(255,255,255,.1);padding:6px 10px;font-size:11px;">Show</button>
          <button id="dp-st-key-copy" class="dp-st-btn dp-st-btn-ghost" style="border:1px solid rgba(245,158,11,.2);color:#f59e0b;background:rgba(245,158,11,.08);padding:6px 10px;font-size:11px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy
          </button>
          <button id="dp-st-key-regen" class="dp-st-btn dp-st-btn-ghost" style="border:1px solid rgba(239,68,68,.2);color:#f87171;background:rgba(239,68,68,.06);padding:6px 10px;font-size:11px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Regen
          </button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">⚠️ Regenerating replaces the key — existing tracker scripts will stop working until updated.</div>
      </div>

      <!-- Danger Zone -->
      <div class="dp-st-card dp-st-card--danger">
        <div class="dp-st-card-hd">
          <div class="dp-st-card-icon" style="background:rgba(239,68,68,.12);color:#f87171;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <div class="dp-st-card-title" style="color:#f87171;">Danger Zone</div>
            <div class="dp-st-card-desc">Irreversible destructive actions</div>
          </div>
        </div>
        <div class="dp-st-danger-row">
          <div>
            <div class="dp-st-danger-label">Delete All Deployed Files</div>
            <div class="dp-st-danger-hint">Removes every file from <code>/demo/${esc(site.demo_slug||'')}/</code> on the server</div>
          </div>
          <button id="dp-st-del-files-btn" class="dp-st-btn dp-st-btn-danger" ${isGod ? '' : 'disabled title="God access required"'}>
            Delete Files
          </button>
        </div>
        <div class="dp-st-danger-row">
          <div>
            <div class="dp-st-danger-label">Delete This Site</div>
            <div class="dp-st-danger-hint">Permanently removes the site, all pages, and all sessions from the database</div>
          </div>
          <button id="dp-st-del-site-btn" class="dp-st-btn dp-st-btn-danger" ${isGod ? '' : 'disabled title="God access required"'}>
            Delete Site
          </button>
        </div>
      </div>
    `;

    // Wire color sync
    const colInput = document.getElementById('dp-st-color');
    const colHex   = document.getElementById('dp-st-color-hex');
    colInput?.addEventListener('input', () => { if(colHex) colHex.value = colInput.value; });
    colHex?.addEventListener('input', () => { const v=colHex.value.trim(); if(/^#[0-9A-F]{6}$/i.test(v)) colInput.value=v; });

    // Wire logo preview
    document.getElementById('dp-st-logo')?.addEventListener('input', e => {
      const prev = document.getElementById('dp-st-logo-preview');
      if (!prev) return;
      prev.innerHTML = e.target.value.trim()
        ? `<img src="${esc(e.target.value.trim())}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='<span style=\\"font-size:10px;color:var(--text-placeholder)\\">?</span>'">`
        : `<span style="font-size:10px;color:var(--text-placeholder);">?</span>`;
    });

    // Save site info
    document.getElementById('dp-st-save-btn')?.addEventListener('click', async () => {
      const name     = document.getElementById('dp-st-name')?.value.trim();
      const demo_slug = document.getElementById('dp-st-slug')?.value.trim();
      const color    = document.getElementById('dp-st-color-hex')?.value.trim() || col;
      const logo_url = document.getElementById('dp-st-logo')?.value.trim() || null;
      if (!name) { window.showToast('Name is required', 'warning'); return; }
      const btn = document.getElementById('dp-st-save-btn');
      if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
      try {
        const res = await window.ALPApi.updateWebsite(siteId, { name, demo_slug, color, logo_url });
        const idx = S().websites.findIndex(w => String(w.id) === String(siteId));
        if (idx !== -1 && res.website) S().websites[idx] = { ...S().websites[idx], ...res.website };
        window.showToast('Site info saved', 'success');
        renderSiteCards();
      } catch (err) { window.showToast('Save failed: ' + err.message, 'error'); }
      finally { if (btn) { btn.disabled = false; btn.style.opacity = ''; } }
    });

    // Save Telegram config
    document.getElementById('dp-st-tg-save-btn')?.addEventListener('click', async () => {
      const tg_bot_token  = document.getElementById('dp-st-tg-token')?.value.trim() || null;
      const tg_chat_id    = document.getElementById('dp-st-tg-chatid')?.value.trim() || null;
      const rawUsers      = document.getElementById('dp-st-tg-users')?.value || '';
      const tg_allowed_users = rawUsers.split(',').map(u => u.trim()).filter(Boolean);
      const tg_bot_active = document.getElementById('dp-st-tg-active')?.checked ? 1 : 0;
      const btn = document.getElementById('dp-st-tg-save-btn');
      if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
      try {
        await window.ALPApi.saveWebsiteTgConfig(siteId, { tg_bot_token, tg_chat_id, tg_allowed_users, tg_bot_active });
        const idx = S().websites.findIndex(w => String(w.id) === String(siteId));
        if (idx !== -1) S().websites[idx] = { ...S().websites[idx], tg_bot_token, tg_chat_id, tg_allowed_users: JSON.stringify(tg_allowed_users), tg_bot_active };
        window.showToast('Telegram bot config saved', 'success');
      } catch (err) { window.showToast('Save failed: ' + err.message, 'error'); }
      finally { if (btn) { btn.disabled = false; btn.style.opacity = ''; } }
    });

    // Test Telegram bot
    document.getElementById('dp-st-tg-test-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('dp-st-tg-test-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        await window.ALPApi.testWebsiteTgBot(siteId);
        window.showToast('Test message sent! Check your Telegram.', 'success');
      } catch (err) { window.showToast('Test failed: ' + err.message, 'error'); }
      finally { if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Test'; } }
    });

    // API key toggle show/hide
    let _keyVisible = false;
    document.getElementById('dp-st-key-toggle')?.addEventListener('click', () => {
      _keyVisible = !_keyVisible;
      const disp = document.getElementById('dp-st-key-display');
      const btn  = document.getElementById('dp-st-key-toggle');
      if (disp) disp.textContent = _keyVisible ? apiKey : (apiKey ? apiKey.slice(0,8) + '••••••••••••••••••••' + apiKey.slice(-4) : '—');
      if (btn)  btn.textContent = _keyVisible ? 'Hide' : 'Show';
    });

    // API key copy
    document.getElementById('dp-st-key-copy')?.addEventListener('click', () => {
      if (!apiKey) return;
      navigator.clipboard.writeText(apiKey).then(() => window.showToast('API key copied!', 'success'));
    });

    // Regenerate API key
    document.getElementById('dp-st-key-regen')?.addEventListener('click', () => {
      window.showModal({
        title: 'Regenerate API Key', type: 'danger', width: '460px',
        content: `<p style="font-size:14px;color:var(--text-secondary);margin:0 0 12px;">Generate a new API key for <strong style="color:var(--text-primary);">${esc(site.name)}</strong>?</p>
          <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 12px;font-size:12px;color:#f87171;">
            ⚠️ The existing key will stop working immediately. You'll need to re-upload any HTML files that contain the old key.
          </div>`,
        confirmText: 'Regenerate Key',
        onConfirm: async () => {
          try {
            const res = await window.ALPApi.regenerateApiKey(siteId);
            const newKey = res.api_key || res.website?.api_key;
            if (newKey) {
              const idx = S().websites.findIndex(w => String(w.id) === String(siteId));
              if (idx !== -1) S().websites[idx].api_key = newKey;
              window.showToast('API key regenerated', 'success');
              initSettingsPanel(siteId);
            }
          } catch (err) { window.showToast('Regenerate failed: ' + err.message, 'error'); }
        }
      });
    });

    // Delete all files
    document.getElementById('dp-st-del-files-btn')?.addEventListener('click', () => {
      if (!isGod) { window.showToast('God access required', 'warning'); return; }
      window.showModal({
        title: 'Delete All Deployed Files', type: 'danger', width: '480px',
        content: `<p style="font-size:14px;color:var(--text-secondary);margin:0 0 10px;">Remove all files from <code style="color:#f87171;">/demo/${esc(site.demo_slug||'')}/</code>?</p>
          <p style="font-size:12px;color:var(--text-muted);margin:0;">This deletes all HTML, CSS, JS, and asset files. Page registry entries are kept.</p>`,
        confirmText: 'Delete All Files',
        onConfirm: async () => {
          try {
            await window.ALPApi.deleteWebsiteFiles(siteId);
            window.showToast('All files deleted', 'success');
            if (window.DemoPagesFiles) {
              await window.DemoPagesFiles.loadFiles(siteId);
              window.DemoPagesFiles.renderFilesList();
            }
          } catch (err) { window.showToast('Delete failed: ' + err.message, 'error'); }
        }
      });
    });

    // Delete site
    document.getElementById('dp-st-del-site-btn')?.addEventListener('click', () => {
      if (!isGod) { window.showToast('God access required', 'warning'); return; }
      window.showModal({
        title: 'Delete Site', type: 'danger', width: '480px',
        content: `<p style="font-size:14px;color:var(--text-secondary);margin:0 0 10px;">Permanently delete <strong style="color:var(--text-primary);">${esc(site.name)}</strong>?</p>
          <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 12px;font-size:12px;color:#f87171;">
            This will delete the site, all registered pages, and all session data. Files on disk are not removed. This cannot be undone.
          </div>`,
        confirmText: 'Delete Site',
        onConfirm: async () => {
          try {
            await window.ALPApi.deleteWebsite(siteId);
            window.showToast(`Site "${site.name}" deleted`, 'success');
            S().websites = S().websites.filter(w => String(w.id) !== String(siteId));
            S().selectedWebsiteId = null;
            showView('cards');
            renderSiteCards();
          } catch (err) { window.showToast('Delete failed: ' + err.message, 'error'); }
        }
      });
    });
  }

  // ─── Styles ────────────────────────────────────────────────────────────────
  function injectStyles() {
    window.DemoPagesStyles.injectStyles();
  }

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      S().websites = data.websites || data || [];
      renderSiteCards();
    } catch (e) {
      console.error('Load websites failed:', e);
      window.showToast('Failed to load websites: ' + e.message, 'error');
    }
  }

  async function loadPages() {
    if (!S().selectedWebsiteId) return;
    try {
      const data = await window.ALPApi.getDemoPages(S().selectedWebsiteId);
      S().pages = data.pages || data || [];
      repaintGrid();
      checkOrphanedPages();
    } catch (e) {
      console.error('Load pages failed:', e);
      window.showToast('Failed to load pages: ' + e.message, 'error');
    }
  }

  async function refreshAndSelect(siteId) {
    try {
      const data = await window.ALPApi.getWebsites();
      S().websites = data.websites || data || [];
      renderSiteCards();
      if (siteId) {
        selectSite(siteId);
      }
    } catch (e) {
      console.error('Refresh and select failed:', e);
      window.showToast('Failed to refresh: ' + e.message, 'error');
    }
  }


  // ─── Lifecycle ────────────────────────────────────────────────────────────
  function init() {
    S().selectedWebsiteId=null; S().websites=[]; S().pages=[];
    _currentTab='upload'; _siteFiles=[];
    injectStyles();
    loadWebsites();
    $('dp-add-website-btn')?.addEventListener('click',()=>window.DemoPagesModals.showAddScamPageModal());
    $('dp-add-website-ai-btn')?.addEventListener('click',()=>window.DemoPagesModals.showAddScamPageWithAIModal());
    $('dp-guide-btn')?.addEventListener('click',()=>window.DemoPagesModals.openGuideModal());
    $('dp-back-btn')?.addEventListener('click',()=>{S().selectedWebsiteId=null;clearBulkSelection();showView('cards');});
    // Search bar
    document.addEventListener('input', e => {
      if (e.target.id === 'dp-site-search') renderSiteCards();
    });
    document.addEventListener('click', e => {
      if (e.target.closest('#dp-site-search-clear')) {
        const inp = $('dp-site-search');
        if (inp) { inp.value = ''; inp.focus(); }
        renderSiteCards();
      }
    });
    document.addEventListener('click',e=>{if(e.target.closest('#dp-add-btn')) window.DemoPagesModals.openAddModal();});
    // Select All button
    document.addEventListener('click',e=>{
      if(e.target.closest('#dp-select-all-btn')) {
        const allSelected = S().pages.length > 0 && S().selectedPageIds.size === S().pages.length;
        if (allSelected) {
          clearBulkSelection();
        } else {
          S().pages.forEach(p => S().selectedPageIds.add(p.id));
          document.querySelectorAll('.dp-bulk-checkbox').forEach(cb => {
            cb.checked = true;
            cb.closest('.dp-card')?.classList.add('dp-card--selected');
          });
          window.DemoPagesRegistry.updateBulkToolbar();
        }
      }
    });
    // Tab bar delegation
    document.addEventListener('click',e=>{
      const tab=e.target.closest('.dp-tab'); if(!tab||!tab.dataset.tab) return;
      const tabs=['upload','files','registry','settings'];
      const from=tabs.indexOf(_currentTab), to=tabs.indexOf(tab.dataset.tab);
      switchTab(tab.dataset.tab, to>from);
    });
  }

  // ─── Toggle website active/inactive ────────────────────────────────────
  let _togglingActive = false;
  async function toggleWebsiteActive(siteId) {
    if (_togglingActive) return;
    _togglingActive = true;
    const btn = document.getElementById('dp-toggle-active-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    try {
      const result = await window.ALPApi.toggleWebsite(siteId);
      const idx = S().websites.findIndex(w => String(w.id) === String(siteId));
      if (idx !== -1 && result.website) {
        S().websites[idx] = { ...S().websites[idx], ...result.website };
      }
      window.showToast(result.message || 'Website toggled', 'success');
      renderSiteCards();
      if (S().selectedWebsiteId && String(S().selectedWebsiteId) === String(siteId)) {
        selectSite(siteId);
      }
    } catch (err) {
      window.showToast('Toggle failed: ' + err.message, 'error');
    } finally {
      _togglingActive = false;
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
  }

  function destroy(){S().selectedWebsiteId=null;S().websites=[];S().pages=[];_siteFiles=[];}
  return {render,init,destroy,repaintGrid,refreshAndSelect,showOrphanedModal,checkOrphanedPages,switchTab,loadPages};
})();

window.DemoPagesPage = DemoPagesPage;
