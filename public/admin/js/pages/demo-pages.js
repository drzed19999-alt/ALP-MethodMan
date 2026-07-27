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
              <button id="dp-add-website-ai-btn" class="dp-btn-ghost" style="background:rgba(139,92,246,.15);color:#c084fc;border-color:rgba(139,92,246,.3);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                🤖 Create with AI
              </button>
              <button id="dp-add-website-btn" class="dp-btn-hero">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                + Add Scam Page
              </button>
            </div>
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
      if (name === 'files') loadFiles().then(() => renderFilesList());
      if (name === 'registry') { /* already loaded */ }
    }, 180);
  }

  // ─── Site card grid ────────────────────────────────────────────────────────
  function renderSiteCards() {
    const c = document.getElementById('dp-site-cards'); if (!c) return;
    if (!S().websites.length) {
      c.innerHTML=`<div class="dp-sites-empty"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.28)" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg><p style="font-size:15px;font-weight:700;color:var(--text-primary);margin:0;">No Scam Pages yet</p><p style="font-size:12px;color:var(--text-secondary);margin:0;">Click <strong style="color:#a5b4fc;">+ Add Scam Page</strong> to get started</p></div>`;
      return;
    }
    c.innerHTML=`<div class="dp-sites-grid">${S().websites.map((w,i)=>{
      const col=w.color || avatarColor(w.name||String(w.id));
      const [r,g,b]=hexRgb(col);
      const init=(w.name||'?')[0].toUpperCase();
      const logo=w.logo_url?`<img src="${esc(w.logo_url)}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none'">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;background:${col};">${esc(init)}</div>`;
      return `
        <div class="dp-site-card" data-site-id="${w.id}" style="--sc-r:${r};--sc-g:${g};--sc-b:${b};animation-delay:${Math.min(i*.07,.42)}s;">
          <div class="dp-site-card-glow"></div>
          <div class="dp-site-card-bar"></div>
          <span class="dp-site-dot ${w.is_active?'on':'off'}"></span>
          <div style="padding:16px 16px 12px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:11px;">
              <div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.09);">${logo}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(w.name)}</div>
                <div style="font-size:10px;color:var(--text-secondary);font-family:var(--font-mono);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(w.domain)}</div>
              </div>
            </div>
            ${w.demo_slug?`<div class="dp-site-slug">/demo/${esc(w.demo_slug)}/</div>`:`<div class="dp-site-slug dp-site-slug--warn">⚠ No slug set</div>`}
            
            ${w.pages && w.pages.length ? `
              <div style="margin-top:10px;">
                <div style="font-size:9.5px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;">Registered Pages:</div>
                <div class="dp-site-card-pages" style="display:flex;flex-wrap:wrap;gap:4px;max-height:56px;overflow-y:auto;padding-right:2px;">
                  ${w.pages.map(p => {
                    const type = getTypeInfo(p.form_type);
                    return `
                      <span class="dp-site-page-pill" data-page-id="${p.id}" data-site-id="${w.id}" title="${esc(p.name)} (${esc(p.url)})" style="--sc-r:${r};--sc-g:${g};--sc-b:${b};">
                        <span class="dp-page-pill-dot" style="background:${type.color};"></span>
                        ${esc(p.name)}
                      </span>`;
                  }).join('')}
                </div>
              </div>
            ` : `
              <div style="margin-top:10px;font-size:10px;color:var(--text-muted);font-style:italic;">No registered pages</div>
            `}

            <div style="display:flex;gap:6px;margin-top:10px;">
              <div class="dp-sc-stat dp-sc-stat--g"><span style="font-size:15px;font-weight:700;">${w.active_sessions||0}</span><span style="font-size:9px;opacity:.65;text-transform:uppercase;letter-spacing:.5px;">Live</span></div>
              <div class="dp-sc-stat"><span style="font-size:15px;font-weight:700;">${w.total_sessions||0}</span><span style="font-size:9px;opacity:.65;text-transform:uppercase;letter-spacing:.5px;">Total</span></div>
            </div>
          </div>
          <div class="dp-site-card-foot">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            Open workspace
          </div>
        </div>`;
    }).join('')}</div>`;
    c.querySelectorAll('.dp-site-card').forEach(el=>el.addEventListener('click',()=>selectSite(el.dataset.siteId)));
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
      logoEl.style.background = site&&site.logo_url?'transparent':col;
      logoEl.innerHTML = site&&site.logo_url
        ? `<img src="${esc(site.logo_url)}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;" onerror="this.parentElement.style.background='${col}';this.remove()">`
        : `<span style="font-size:24px;font-weight:800;color:#fff;">${esc(init)}</span>`;
    }

    const nameEl=document.getElementById('dp-ws-name'); if(nameEl) nameEl.textContent=site?site.name:'';
    const statusEl=document.getElementById('dp-ws-status');
    if(statusEl) statusEl.innerHTML=site&&site.is_active
      ?`<span class="dp-hero-badge dp-hero-badge--g">● Active</span>`
      :`<span class="dp-hero-badge">● Inactive</span>`;

    const metaEl=document.getElementById('dp-ws-meta');
    if(metaEl) metaEl.innerHTML=[
      site&&site.demo_slug?`<code class="dp-hero-code">/demo/${esc(site.demo_slug)}/</code>`:`<span style="color:#ef4444;font-size:11px;">⚠ No slug</span>`,
      site?`<span style="color:var(--text-secondary);font-size:11px;font-family:var(--font-mono);">${esc(site.domain)}</span>`:'',
    ].join('');

    const statsEl=document.getElementById('dp-ws-stats');
    if(statsEl) statsEl.innerHTML=`
      <div class="dp-hero-stat dp-hero-stat--g"><div style="font-size:22px;font-weight:800;color:#10b981;">${site?site.active_sessions||0:0}</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Live now</div></div>
      <div class="dp-hero-stat"><div style="font-size:22px;font-weight:800;color:var(--text-secondary);">${site?site.total_sessions||0:0}</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Total</div></div>`;

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
        if(preview){preview.style.display='none';preview.innerHTML='';}
        await loadFiles(siteId);switchTab('files',true);
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
      const tabs=['upload','files','registry'];
      const from=tabs.indexOf(_currentTab), to=tabs.indexOf(tab.dataset.tab);
      switchTab(tab.dataset.tab, to>from);
    });
  }

  function destroy(){S().selectedWebsiteId=null;S().websites=[];S().pages=[];_siteFiles=[];}
  return {render,init,destroy,repaintGrid,refreshAndSelect,showOrphanedModal,checkOrphanedPages,switchTab,loadPages};
})();

window.DemoPagesPage = DemoPagesPage;
