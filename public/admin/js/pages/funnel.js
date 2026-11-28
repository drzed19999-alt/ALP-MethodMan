/**
 * ALP - Funnel Builder Page Module
 * Manage visitor page navigation flows, ordering, and submit behavior dynamically.
 */
const FunnelPage = (() => {
  let selectedWebsiteId = null;
  let websites = [];
  let demoPages = [];
  let funnelSteps = [];

  function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render() {
    return `
      <div class="funnel-page page-enter">
        <div class="page-header">
          <div>
            <div class="ph" style="--ph-accent:#f59e0b;--ph-glow:rgba(245,158,11,0.5)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>FUNNELS · FLOW ENGINE</div>
              <h1 class="ph-title"><span class="ph-title-glyph">⟁</span><span class="ph-title-text">Funnels</span></h1>
              <p class="ph-sub">Configure the page flow and redirection behavior for website visitors</p>
            </div>
          </div>
          <div class="header-actions">
            <div class="website-select-wrap">
              <label for="funnel-website-select" style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-right:8px;">Active Site:</label>
              <div id="funnel-website-select-container"></div>
            </div>
            <button class="btn btn-primary" id="save-funnel-btn" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save Funnel
            </button>
          </div>
        </div>

        <div class="funnel-container" id="funnel-container">
          <div class="funnel-instructions">
            <div class="info-icon">ℹ️</div>
            <div class="info-text">
              <strong>How it works:</strong> Arrange the sequence of pages you want visitors to experience. 
              When a visitor submits a form on a page:
              <ul>
                <li><strong>Auto-Advance</strong>: They will automatically be redirected to the next step immediately.</li>
                <li><strong>Hold</strong>: They will be redirected to the loading screen, where they will wait until you manually release them from the Live Sessions panel.</li>
              </ul>
            </div>
          </div>

          <div class="funnel-flow-card">
            <div class="flow-card-header">
              <span class="flow-card-title">Funnel Sequence</span>
              <button class="btn btn-sm btn-outline" id="add-step-btn" disabled>
                ➕ Add Step
              </button>
            </div>
            
            <div class="steps-list" id="steps-list">
              <div class="empty-state">
                <div class="empty-icon">🌐</div>
                <p class="empty-title">Select a website to build its funnel</p>
                <p class="empty-sub">Choose a website from the dropdown to configure its path navigation flow.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .funnel-page { max-width: 900px; margin: 0 auto; min-width: 0; }
        .funnel-page .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
        .funnel-page .header-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

        .funnel-page .website-select-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }

        .funnel-page .funnel-instructions {
          display: flex; gap: 12px; padding: 16px 20px; background: color-mix(in oklab, var(--accent-primary) 6%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent-primary) 20%, transparent); border-radius: 12px; margin-bottom: 24px;
        }
        .funnel-page .info-icon { font-size: 18px; margin-top: 2px; flex-shrink: 0; }
        .funnel-page .info-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; min-width: 0; }
        .funnel-page .info-text strong { color: var(--text-primary); }
        .funnel-page .info-text ul { margin: 6px 0 0 18px; padding: 0; }

        .funnel-page .funnel-flow-card { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow-card); }
        .funnel-page .flow-card-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 16px 22px; border-bottom: 1px solid var(--border-subtle); }
        .funnel-page .flow-card-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }

        .funnel-page .steps-list { padding: 20px; display: flex; flex-direction: column; gap: 12px; }

        .funnel-page .step-item-row {
          display: flex; align-items: center; gap: 14px; padding: 14px 16px;
          background: var(--bg-tertiary); border: 1px solid var(--border-primary);
          border-radius: 12px; transition: all 0.2s;
          animation: stepSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .funnel-page .step-item-row:hover { border-color: color-mix(in oklab, var(--accent-primary) 40%, transparent); }
        @keyframes stepSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .funnel-page .step-num-badge {
          width: 28px; height: 28px; border-radius: 50%; background: color-mix(in oklab, var(--accent-primary) 14%, transparent);
          color: var(--accent-primary); font-weight: 700; font-size: 12px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          border: 1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent);
        }

        .funnel-page .step-controls { display: flex; flex: 1; gap: 12px; align-items: center; flex-wrap: wrap; min-width: 0; }
        .funnel-page .step-select-wrap { display: flex; flex-direction: column; gap: 4px; flex: 2; min-width: 180px; }
        .funnel-page .step-behavior-wrap { display: flex; flex-direction: column; gap: 4px; flex: 1.2; min-width: 140px; }
        .funnel-page .step-label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; }

        .funnel-page .step-select,
        .funnel-page .step-behavior-select {
          padding: 9px 12px; background: var(--bg-input); border: 1px solid var(--border-primary);
          border-radius: 8px; color: var(--text-primary); font-size: 13px; font-family: 'Inter', sans-serif;
          outline: none; transition: border-color 0.2s; width: 100%; box-sizing: border-box; cursor: pointer;
        }
        .funnel-page .step-select:focus,
        .funnel-page .step-behavior-select:focus { border-color: var(--accent-primary); }

        .funnel-page .step-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .funnel-page .action-arrow-btn,
        .funnel-page .action-delete-btn {
          width: 34px; height: 34px; border-radius: 8px; background: var(--bg-secondary);
          border: 1px solid var(--border-primary); color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: all 0.15s;
        }
        .funnel-page .action-arrow-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--bg-hover); }
        .funnel-page .action-arrow-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .funnel-page .action-delete-btn:hover { border-color: rgba(239, 68, 68, 0.4); color: var(--color-danger); background: rgba(239, 68, 68, 0.08); }

        .funnel-page .empty-state { text-align: center; padding: 52px 20px; }
        .funnel-page .empty-icon { font-size: 32px; margin-bottom: 12px; }
        .funnel-page .empty-title { font-size: 15px; font-weight: 600; color: var(--text-secondary); margin: 0 0 6px; }
        .funnel-page .empty-sub { font-size: 13px; color: var(--text-tertiary); margin: 0; }

        @media (max-width: 640px) {
          .funnel-page .header-actions { width: 100%; flex-direction: column; align-items: stretch; gap: 10px; }
          .funnel-page .website-select-wrap { flex-direction: column; align-items: stretch; gap: 6px; }
          .funnel-page #funnel-website-select-container,
          .funnel-page #funnel-website-select-container .alp-dropdown { width: 100%; }
          .funnel-page #save-funnel-btn { width: 100%; justify-content: center; }
          .funnel-page .steps-list { padding: 14px; }
          .funnel-page .step-item-row { flex-wrap: wrap; align-items: flex-start; padding: 12px; gap: 10px; }
          .funnel-page .step-controls { flex: 1 1 calc(100% - 42px); flex-direction: column; align-items: stretch; gap: 8px; }
          .funnel-page .step-select-wrap,
          .funnel-page .step-behavior-wrap { min-width: 0; width: 100%; flex: none; }
          .funnel-page .step-actions { width: 100%; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 8px; }
        }
      </style>
    `;
  }

  // --- Step Rendering ---

  function renderSteps() {
    const list = document.getElementById('steps-list');
    if (!list) return;

    if (!selectedWebsiteId) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🌐</div>
          <p class="empty-title">Select a website to build its funnel</p>
          <p class="empty-sub">Choose a website from the dropdown to configure its path navigation flow.</p>
        </div>
      `;
      return;
    }

    if (funnelSteps.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p class="empty-title">Funnel is empty</p>
          <p class="empty-sub">Click "Add Step" to add the first page to the funnel sequence.</p>
        </div>
      `;
      return;
    }

    // Render step list rows
    list.innerHTML = funnelSteps.map((step, idx) => {
      const pageOptions = demoPages.map(dp => 
        `<option value="${dp.url}" ${dp.url === step.url ? 'selected' : ''}>${escapeHtml(dp.name)} (${dp.url})</option>`
      ).join('');

      return `
        <div class="step-item-row" data-index="${idx}">
          <div class="step-num-badge">${idx + 1}</div>
          
          <div class="step-controls">
            <!-- Page Selector -->
            <div class="step-select-wrap">
              <span class="step-label">Visitor Page</span>
              <select class="step-select" data-index="${idx}">
                <option value="">Select page...</option>
                ${pageOptions}
              </select>
            </div>

            <!-- Submit Behavior -->
            <div class="step-behavior-wrap">
              <span class="step-label">Submit Action</span>
              <select class="step-behavior-select" data-index="${idx}">
                <option value="auto" ${step.behavior === 'auto' ? 'selected' : ''}>🚀 Auto-Advance</option>
                <option value="hold" ${step.behavior === 'hold' ? 'selected' : ''}>⏸️ Hold in Loading</option>
              </select>
            </div>
          </div>

          <!-- Reorder & Delete actions -->
          <div class="step-actions">
            <button class="action-arrow-btn step-up-btn" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Up">
              ▲
            </button>
            <button class="action-arrow-btn step-down-btn" data-index="${idx}" ${idx === funnelSteps.length - 1 ? 'disabled' : ''} title="Move Down">
              ▼
            </button>
            <button class="action-delete-btn step-delete-btn" data-index="${idx}" title="Delete Step">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Actions ---

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      websites = data.websites || data || [];
      window.ALPWebsiteSelect.create({
        containerId: 'funnel-website-select-container',
        hiddenInputId: 'funnel-website-select',
        websites: websites,
        placeholder: 'Select website...',
        selectedValue: selectedWebsiteId,
        onChange: (val) => {
          selectedWebsiteId = val;
          loadFunnel(selectedWebsiteId);
        }
      });
    } catch (e) {
      window.showToast('Failed to load websites: ' + e.message, 'error');
    }
  }

  async function loadDemoPages(websiteId) {
    try {
      const data = await window.ALPApi.getDemoPages(websiteId);
      demoPages = data.pages || data || [];
    } catch (e) {
      window.showToast('Failed to load demo pages: ' + e.message, 'error');
    }
  }

  async function loadFunnel(websiteId) {
    if (!websiteId) {
      funnelSteps = [];
      demoPages = [];
      toggleButtons(false);
      renderSteps();
      return;
    }

    try {
      await loadDemoPages(websiteId);
      const data = await window.ALPApi.getFunnel(websiteId);
      const funnel = data.funnel;
      
      if (funnel) {
        funnelSteps = funnel.steps || [];
      } else {
        const activeSite = websites.find(w => String(w.id) === String(websiteId));
        if (activeSite && activeSite.demo_slug === 'demo') {
          funnelSteps = [
            { url: '/demo/login', behavior: 'auto' },
            { url: '/demo/loading', behavior: 'hold' },
            { url: '/demo/cc', behavior: 'auto' },
            { url: '/demo/otp', behavior: 'hold' },
            { url: '/demo/loading', behavior: 'hold' }
          ];
        } else {
          funnelSteps = [];
        }
      }
      
      toggleButtons(true);
      renderSteps();
    } catch (e) {
      window.showToast('Failed to load funnel: ' + e.message, 'error');
    }
  }

  function toggleButtons(enabled) {
    const saveBtn = document.getElementById('save-funnel-btn');
    const addBtn = document.getElementById('add-step-btn');
    if (saveBtn) saveBtn.disabled = !enabled;
    if (addBtn) addBtn.disabled = !enabled;
  }

  async function saveFunnel() {
    if (!selectedWebsiteId) return;

    // Filter out invalid steps
    const cleanSteps = funnelSteps.filter(s => s.url);
    
    try {
      const saveBtn = document.getElementById('save-funnel-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      await window.ALPApi.saveFunnel({
        website_id: parseInt(selectedWebsiteId, 10),
        name: 'Funnel ' + selectedWebsiteId,
        steps: cleanSteps
      });
      
      window.showToast('✅ Funnel configuration saved!', 'success');
      await loadFunnel(selectedWebsiteId);
    } catch (e) {
      window.showToast('Save failed: ' + e.message, 'error');
    } finally {
      const saveBtn = document.getElementById('save-funnel-btn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Funnel`;
      }
    }
  }

  // --- Event Handling Setup ---

  function init() {
    selectedWebsiteId = null;
    funnelSteps = [];
    demoPages = [];
    websites = [];

    (async () => {
      await loadWebsites();
    })();

    // Site selection dropdown listener
    const select = document.getElementById('funnel-website-select');
    if (select) {
      select.addEventListener('change', (e) => {
        selectedWebsiteId = e.target.value;
        loadFunnel(selectedWebsiteId);
      });
    }

    // Save button click
    const saveBtn = document.getElementById('save-funnel-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveFunnel);
    }

    // Add step button click
    const addBtn = document.getElementById('add-step-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        funnelSteps.push({ url: '', behavior: 'auto' });
        renderSteps();
      });
    }

    // Step list interactions
    const list = document.getElementById('steps-list');
    if (list) {
      list.addEventListener('change', (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;

        if (target.classList.contains('step-select')) {
          funnelSteps[index].url = target.value;
        } else if (target.classList.contains('step-behavior-select')) {
          funnelSteps[index].behavior = target.value;
        }
      });

      list.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;

        if (target.classList.contains('step-up-btn')) {
          if (index > 0) {
            const temp = funnelSteps[index];
            funnelSteps[index] = funnelSteps[index - 1];
            funnelSteps[index - 1] = temp;
            renderSteps();
          }
        } else if (target.classList.contains('step-down-btn')) {
          if (index < funnelSteps.length - 1) {
            const temp = funnelSteps[index];
            funnelSteps[index] = funnelSteps[index + 1];
            funnelSteps[index + 1] = temp;
            renderSteps();
          }
        } else if (target.classList.contains('step-delete-btn')) {
          funnelSteps.splice(index, 1);
          renderSteps();
        }
      });
    }
  }

  function destroy() {
    selectedWebsiteId = null;
    websites = [];
    demoPages = [];
    funnelSteps = [];
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') window.FunnelPage = FunnelPage;
