/**
 * ALP - Notifications Page Module
 * Polished filter tabs, grouped by date, real-time updates, better empty states
 */
const NotificationsPage = (() => {
  let allNotifications = [];
  let currentFilter = 'all';
  let socketListeners = [];

  function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function formatDate(dateStr) {
    const d = parseDate(dateStr);
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const nd = new Date(d); nd.setHours(0,0,0,0);
    if (nd.getTime() === today.getTime()) return 'Today';
    if (nd.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const typeConfig = {
    info:     { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`, color: 'var(--color-info)', bg: 'var(--color-info-muted)', label: 'Info' },
    warning:  { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`, color: 'var(--color-warning)', bg: 'var(--color-warning-muted)', label: 'Warning' },
    alert:    { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`, color: 'var(--color-danger)', bg: 'var(--color-danger-muted)', label: 'Alert' },
    success:  { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`, color: 'var(--color-success)', bg: 'var(--color-success-muted)', label: 'Success' },
    error:    { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`, color: 'var(--color-danger)', bg: 'var(--color-danger-muted)', label: 'Error' },
    session:  { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, color: 'var(--color-success)', bg: 'var(--color-success-muted)', label: 'Session' },
    redirect: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 004 4h12"/></svg>`, color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)', label: 'Redirect' }
  };

  function getType(t) { return typeConfig[t] || typeConfig.info; }

  function render() {
    return `
      <div class="notifications-page page-enter">
        <div class="notif-page-header">
          <div>
            <div class="ph" style="--ph-accent:#3b82f6;--ph-glow:rgba(59,130,246,0.5)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>ALERTS · SYSTEM</div>
              <h1 class="ph-title"><span class="ph-title-glyph">⚡</span><span class="ph-title-text">Alerts</span></h1>
              <p class="ph-sub">System alerts, session events, and activity updates</p>
            </div>
          </div>
          <div class="notif-header-actions">
            <button class="btn btn-ghost notif-mark-all-btn" id="mark-all-read-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Mark all read
            </button>
          </div>
        </div>

        <!-- Summary strip -->
        <div class="notif-summary-strip" id="notif-summary-strip">
          <div class="summary-chip unread-chip">
            <span class="chip-dot pulsing"></span>
            <span id="unread-count">0</span> unread
          </div>
          <div class="summary-sep"></div>
          <div class="summary-chip"><span id="total-count">0</span> total</div>
        </div>

        <!-- Filter Pills — category + severity (Rev-2) -->
        <div class="notif-filter-bar">
          <div class="notif-pills" id="notif-pills">
            <button class="notif-pill active" data-filter="all">All</button>
            <button class="notif-pill" data-filter="unread">Unread</button>
            <span class="notif-pill-sep"></span>
            <button class="notif-pill" data-filter="cat:security">🛡 Security</button>
            <button class="notif-pill" data-filter="cat:tenant">🏢 Tenant</button>
            <button class="notif-pill" data-filter="cat:system">⚙️ System</button>
            <button class="notif-pill" data-filter="cat:activity">📡 Activity</button>
            <span class="notif-pill-sep"></span>
            <button class="notif-pill" data-filter="sev:critical">🚨 Critical</button>
            <button class="notif-pill" data-filter="sev:high">⚠️ High</button>
            <button class="notif-pill" data-filter="undo">↶ Undoable</button>
          </div>
        </div>

        <!-- Notification List -->
        <div class="notif-list" id="notif-list">
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${[1,2,3].map(() => `
              <div class="alp-skeleton-card" style="flex-direction:row;gap:14px;align-items:center;">
                <div class="alp-skeleton" style="width:38px;height:38px;border-radius:10px;flex-shrink:0;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
                  <div class="alp-skeleton alp-skeleton--line" style="width:55%"></div>
                  <div class="alp-skeleton alp-skeleton--line" style="width:80%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <style>
        .notifications-page { max-width: 820px; margin: 0 auto; }
        .notifications-page .notif-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
        .notifications-page .notif-header-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .notifications-page .notif-mark-all-btn { display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:9px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; border:1px solid var(--border-primary); background:var(--bg-secondary); color:var(--text-secondary); }
        .notifications-page .notif-mark-all-btn:hover { background:var(--accent-primary-muted); border-color:var(--accent-primary); color:var(--accent-primary); }

        /* Summary strip */
        .notifications-page .notif-summary-strip {
          display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 16px;
          background:var(--bg-secondary); border:1px solid var(--border-primary);
          border-radius:10px; margin-bottom:18px;
        }
        .notifications-page .summary-chip { display:flex; align-items:center; gap:7px; font-size:13px; font-weight:500; color:var(--text-secondary); }
        .notifications-page .unread-chip { color:var(--accent-primary); font-weight:600; }
        .notifications-page .chip-dot { width:7px; height:7px; border-radius:50%; background:var(--accent-primary); flex-shrink:0; }
        .notifications-page .chip-dot.pulsing { animation:chipPulse 2s ease-in-out infinite; }
        @keyframes chipPulse { 0%,100%{box-shadow:0 0 0 0 var(--accent-primary-ring);} 50%{box-shadow:0 0 0 4px transparent;} }
        .notifications-page .summary-sep { width:1px; height:16px; background:var(--border-primary); }

        /* Filter pills */
        .notifications-page .notif-filter-bar { margin-bottom:22px; }
        .notifications-page .notif-pills { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .notifications-page .notif-pill {
          padding:7px 14px; font-size:12px; font-weight:600; border-radius:20px;
          border:1px solid var(--border-primary); background:var(--bg-secondary);
          color:var(--text-secondary); cursor:pointer; transition:all 0.15s;
          font-family:inherit; letter-spacing:0.01em;
        }
        .notifications-page .notif-pill:hover { border-color:var(--accent-primary); color:var(--accent-primary); background:var(--accent-primary-muted); }
        .notifications-page .notif-pill.active { background:var(--accent-primary); color:var(--text-inverse); border-color:var(--accent-primary); box-shadow:0 4px 12px var(--accent-primary-ring); font-weight:700; }
        .notifications-page .notif-pill-sep { width:1px; height:20px; background:var(--border-primary); margin:0 2px; display:inline-block; align-self:center; flex-shrink:0; }

        /* Severity coloring on cards */
        .notifications-page .notif-item.sev-critical { border-left:3px solid #ef4444; background: linear-gradient(90deg, rgba(239,68,68,.07), var(--bg-secondary) 40%); }
        .notifications-page .notif-item.sev-high     { border-left:3px solid #f59e0b; background: linear-gradient(90deg, rgba(245,158,11,.06), var(--bg-secondary) 40%); }
        .notifications-page .notif-item.sev-normal   { border-left:3px solid transparent; }
        .notifications-page .notif-item.sev-low      { opacity: 0.82; }

        /* Category chip */
        .notifications-page .notif-cat-chip {
          display:inline-flex; align-items:center; gap:4px;
          font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px;
          text-transform:uppercase; letter-spacing:.5px;
          border:1px solid transparent;
        }
        .notifications-page .cat-security { color:#f87171; background:rgba(239,68,68,.10); border-color:rgba(239,68,68,.25); }
        .notifications-page .cat-tenant   { color:#a78bfa; background:rgba(139,92,246,.10); border-color:rgba(139,92,246,.25); }
        .notifications-page .cat-system   { color:#38bdf8; background:rgba(56,189,248,.10); border-color:rgba(56,189,248,.25); }
        .notifications-page .cat-activity { color:#34d399; background:rgba(16,185,129,.10); border-color:rgba(16,185,129,.25); }

        /* Actor chip */
        .notifications-page .notif-actor-chip {
          display:inline-flex; align-items:center; gap:5px;
          font-size:10.5px; color: var(--text-secondary); background: var(--bg-tertiary);
          border:1px solid var(--border-primary);
          padding:2px 7px 2px 4px; border-radius:20px;
        }
        .notifications-page .notif-actor-avatar {
          width:16px; height:16px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:9px; font-weight:800; color:#fff;
          background: linear-gradient(135deg,#8b5cf6,#6d28d9);
        }
        .notifications-page .notif-item-count-badge {
          font-size:10px; font-weight:700; color:var(--text-inverse);
          background:var(--accent-primary); padding:1px 6px; border-radius:10px;
          margin-left:4px;
        }

        /* Undo button + countdown */
        .notifications-page .notif-undo-btn {
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 10px; border-radius:8px;
          background: rgba(56,189,248,.10); color:#38bdf8;
          border:1px solid rgba(56,189,248,.30);
          font-size:11px; font-weight:700; cursor:pointer;
          font-family:inherit;
          transition: all .15s;
        }
        .notifications-page .notif-undo-btn:hover { background: rgba(56,189,248,.18); }
        .notifications-page .notif-undo-btn[disabled] { opacity:.4; cursor:not-allowed; }
        .notifications-page .notif-undo-countdown { font-variant-numeric: tabular-nums; }
        .notifications-page .notif-undo-expired { color: var(--text-muted); font-size: 10.5px; font-style: italic; }
        .notifications-page .notif-open-link { font-size:11px; font-weight:600; color:var(--color-info); text-decoration:none; }
        .notifications-page .notif-open-link:hover { text-decoration:underline; }

        /* Digest row special */
        .notifications-page .notif-item.is-digest { background: rgba(56,189,248,.05); border-color: rgba(56,189,248,.22); }
        .notifications-page .notif-item.is-digest .notif-title:before { content:'📥 '; }

        /* List */
        .notifications-page .notif-list { display:flex; flex-direction:column; gap:2px; }

        /* Date group */
        .notifications-page .notif-date-group { margin-bottom:4px; }
        .notifications-page .date-group-label {
          font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;
          letter-spacing:0.7px; padding:12px 0 8px; position:sticky; top:var(--header-height, 64px);
          background:var(--bg-primary); z-index:2;
        }

        /* Notification item */
        .notifications-page .notif-item {
          display:flex; align-items:flex-start; gap:14px; padding:16px 18px;
          background:var(--bg-secondary); border:1px solid var(--border-primary);
          border-radius:12px; transition:all 0.18s; position:relative;
          margin-bottom:6px;
          animation:notifItemIn 0.25s ease both;
        }
        .notifications-page .notif-item:hover { border-color:var(--border-hover); background:var(--bg-hover); transform:translateX(2px); }
        .notifications-page .notif-item.is-unread {
          border-left:3px solid var(--accent-primary);
          background:var(--accent-primary-muted);
        }
        .notifications-page .notif-item.is-unread .notif-title { color:var(--text-primary); font-weight:600; }

        /* Inline unread dot indicator (never overlaps delete button) */
        .notifications-page .unread-dot {
          display:inline-block; vertical-align:middle; margin-right:6px;
          width:7px; height:7px; border-radius:50%; background:var(--accent-primary);
          box-shadow:0 0 0 3px var(--accent-primary-ring);
        }

        .notifications-page .notif-icon-wrap {
          width:38px; height:38px; border-radius:10px; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
        }
        .notifications-page .notif-body { flex:1; min-width:0; }
        .notifications-page .notif-title { font-size:14px; font-weight:500; color:var(--text-primary); margin-bottom:4px; line-height:1.4; word-break:break-word; }
        .notifications-page .notif-msg { font-size:13px; color:var(--text-secondary); line-height:1.55; margin-bottom:6px; word-break:break-word; }
        .notifications-page .notif-meta { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; }
        .notifications-page .notif-time { font-size:11px; color:var(--text-muted); }
        .notifications-page .type-pill {
          font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px;
          text-transform:uppercase; letter-spacing:0.5px;
        }

        .notifications-page .notif-item-actions { display:flex; gap:4px; flex-shrink:0; align-self:flex-start; margin-top:2px; opacity:0; transition:opacity 0.15s; }
        .notifications-page .notif-item:hover .notif-item-actions,
        .notifications-page .notif-item:focus-within .notif-item-actions { opacity:1; }
        .notifications-page .notif-action-btn {
          width:28px; height:28px; display:flex; align-items:center; justify-content:center;
          background:none; border:none; border-radius:7px; cursor:pointer;
          color:var(--text-muted); transition:all 0.15s;
        }
        .notifications-page .notif-action-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
        .notifications-page .notif-action-btn.del:hover { color:var(--color-danger); background:var(--color-danger-muted); }

        /* Empty state */
        .notifications-page .notif-empty {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          padding:80px 20px; text-align:center;
        }
        .notifications-page .notif-empty-icon { font-size:3rem; margin-bottom:16px; opacity:0.4; }
        .notifications-page .notif-empty-title { font-size:16px; font-weight:600; color:var(--text-secondary); margin-bottom:6px; }
        .notifications-page .notif-empty-sub { font-size:13px; color:var(--text-muted); }

        /* Light mode semantic contrast overrides */
        [data-theme='light'] .notifications-page .cat-security { color:#dc2626; background:rgba(220,38,38,.09); border-color:rgba(220,38,38,.24); }
        [data-theme='light'] .notifications-page .cat-tenant   { color:#6d28d9; background:rgba(109,40,217,.09); border-color:rgba(109,40,217,.24); }
        [data-theme='light'] .notifications-page .cat-system   { color:#0284c7; background:rgba(2,132,199,.09); border-color:rgba(2,132,199,.24); }
        [data-theme='light'] .notifications-page .cat-activity { color:#059669; background:rgba(5,150,105,.09); border-color:rgba(5,150,105,.24); }
        [data-theme='light'] .notifications-page .notif-undo-btn { color:#0284c7; background:rgba(2,132,199,.08); border-color:rgba(2,132,199,.3); }
        [data-theme='light'] .notifications-page .notif-type-info     { color:#2563eb !important; background:rgba(37,99,235,.10) !important; }
        [data-theme='light'] .notifications-page .notif-type-warning  { color:#b45309 !important; background:rgba(217,119,6,.12) !important; }
        [data-theme='light'] .notifications-page .notif-type-alert,
        [data-theme='light'] .notifications-page .notif-type-error    { color:#dc2626 !important; background:rgba(220,38,38,.10) !important; }
        [data-theme='light'] .notifications-page .notif-type-success,
        [data-theme='light'] .notifications-page .notif-type-session  { color:#059669 !important; background:rgba(5,150,105,.10) !important; }
        [data-theme='light'] .notifications-page .notif-type-redirect { color:#6d28d9 !important; background:rgba(109,40,217,.10) !important; }

        @keyframes notifItemIn { from{opacity:0;transform:translateX(-8px);} to{opacity:1;transform:translateX(0);} }

        /* Touch / tablet: always show item actions */
        @media (hover: none), (pointer: coarse), (max-width: 1024px) {
          .notifications-page .notif-item-actions { opacity:1; }
        }
        @media (max-width: 640px) {
          .notifications-page .notif-pills { flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; padding-bottom:4px; }
          .notifications-page .notif-pills::-webkit-scrollbar { display:none; }
          .notifications-page .notif-pill { flex-shrink:0; white-space:nowrap; }
          .notifications-page .notif-item { padding:12px 14px; gap:10px; }
          .notifications-page .notif-icon-wrap { width:34px; height:34px; }
          .notifications-page .notif-empty { padding:48px 16px; }
        }
      </style>
    `;
  }

  function getFiltered() {
    // New filter syntax:
    //   'all', 'unread'           — legacy
    //   'cat:<category>'          — by category slug
    //   'sev:<severity>'          — by severity slug
    //   'undo'                    — rows with active undo_action still unexpired
    //   legacy type filters       — kept for backwards compat
    if (currentFilter === 'all')    return allNotifications;
    if (currentFilter === 'unread') return allNotifications.filter(n => !n.is_read);
    if (currentFilter === 'undo') {
      const now = Date.now();
      return allNotifications.filter(n =>
        n.undo_action && !n.undone_at &&
        n.expires_at && new Date(n.expires_at).getTime() > now
      );
    }
    if (currentFilter.startsWith('cat:')) {
      const c = currentFilter.slice(4);
      return allNotifications.filter(n => (n.category || 'system') === c);
    }
    if (currentFilter.startsWith('sev:')) {
      const s = currentFilter.slice(4);
      return allNotifications.filter(n => (n.severity || 'normal') === s);
    }
    // Legacy type filter
    return allNotifications.filter(n => n.type === currentFilter);
  }

  function _initials(name) {
    if (!name) return '?';
    return String(name).trim().split(/\s+/).map(s => s[0]).slice(0,2).join('').toUpperCase();
  }

  function renderNotifItem(n, delay = 0) {
    const tc = getType(n.type);
    const severity = n.severity || 'normal';
    const category = n.category || 'system';
    const isDigest = n.event === 'digest';
    // Extract actor name from message if we didn't get one on the row
    // (server prefixes "username added domain …")
    const actorName = n.actor_name || (n.message || '').split(' ')[0];
    const typeKey = typeConfig[n.type] ? n.type : 'info';
    const countBadge = (n.count && n.count > 1) ? `<span class="notif-item-count-badge">×${n.count}</span>` : '';

    // Undo affordance for destructive events within the 10-min window
    let undoHtml = '';
    if (n.undo_action && !n.undone_at && n.expires_at) {
      const msLeft = new Date(n.expires_at).getTime() - Date.now();
      if (msLeft > 0) {
        undoHtml = `<button class="notif-undo-btn" data-undo-id="${n.id}" data-expires="${n.expires_at}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
          Undo <span class="notif-undo-countdown" data-expires="${n.expires_at}">${_fmtCountdown(msLeft)}</span>
        </button>`;
      } else {
        undoHtml = `<span class="notif-undo-expired">Undo window expired</span>`;
      }
    } else if (n.undone_at) {
      undoHtml = `<span class="notif-undo-expired">✓ Undone</span>`;
    }

    return `
      <div class="notif-item ${n.is_read ? '' : 'is-unread'} sev-${severity} ${isDigest ? 'is-digest' : ''}" data-notif-id="${n.id}" style="animation-delay:${delay}ms">
        <div class="notif-icon-wrap notif-type-${typeKey}" style="background:${tc.bg};color:${tc.color};">${tc.icon}</div>
        <div class="notif-body">
          <div class="notif-title">${!n.is_read ? '<span class="unread-dot" aria-label="Unread"></span>' : ''}${escapeHtml(n.title || 'Notification')}${countBadge}</div>
          <div class="notif-msg">${escapeHtml(n.message || '')}</div>
          <div class="notif-meta">
            <span class="notif-time">${timeAgo(n.created_at)}</span>
            <span class="notif-cat-chip cat-${category}">${category}</span>
            <span class="type-pill notif-type-${typeKey}" style="color:${tc.color};background:${tc.bg};">${escapeHtml(severity)}</span>
            ${actorName && n.actor_id ? `
              <span class="notif-actor-chip">
                <span class="notif-actor-avatar">${escapeHtml(_initials(actorName))}</span>
                ${escapeHtml(actorName)}
              </span>` : ''}
            ${undoHtml}
            ${n.link ? `<a class="notif-open-link" href="${escapeHtml(n.link).startsWith('#') ? escapeHtml(n.link) : '#' + escapeHtml(n.link)}">→ Open</a>` : ''}
          </div>
        </div>
        <div class="notif-item-actions">
          ${!n.is_read ? `
            <button class="notif-action-btn mark-read-btn" data-id="${n.id}" title="Mark as read">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          ` : ''}
          <button class="notif-action-btn del notif-delete-btn" data-id="${n.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function _fmtCountdown(ms) {
    if (ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  // Refresh live countdowns once per second — cheap, only touches nodes
  let _countdownTimer = null;
  function _startCountdownTicker() {
    if (_countdownTimer) return;
    _countdownTimer = setInterval(() => {
      document.querySelectorAll('.notif-undo-countdown[data-expires]').forEach(el => {
        const ms = new Date(el.dataset.expires).getTime() - Date.now();
        if (ms <= 0) {
          const btn = el.closest('.notif-undo-btn');
          if (btn) btn.outerHTML = '<span class="notif-undo-expired">Undo window expired</span>';
        } else {
          el.textContent = _fmtCountdown(ms);
        }
      });
    }, 1000);
  }
  function _stopCountdownTicker() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  }

  function renderList() {
    const list = document.getElementById('notif-list');
    const unreadEl = document.getElementById('unread-count');
    const totalEl = document.getElementById('total-count');
    if (!list) return;

    const filtered = getFiltered();
    const unread = allNotifications.filter(n => !n.is_read).length;
    if (unreadEl) unreadEl.textContent = unread;
    if (totalEl) totalEl.textContent = allNotifications.length;

    if (filtered.length === 0) {
      const msgs = {
        unread:  { icon: '✅', title: 'All caught up!', sub: 'No unread notifications right now.' },
        info:    { icon: 'ℹ️', title: 'No info notifications', sub: '' },
        warning: { icon: '⚠️', title: 'No warnings', sub: '' },
        alert:   { icon: '🔕', title: 'No alerts', sub: '' },
        error:   { icon: '🚫', title: 'No errors', sub: '' },
        success: { icon: '🎉', title: 'No success events', sub: '' },
        all:     { icon: '🔔', title: 'No notifications yet', sub: 'Activity and events will appear here.' }
      };
      const m = msgs[currentFilter] || msgs.all;
      list.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">${m.icon}</div>
          <div class="notif-empty-title">${m.title}</div>
          ${m.sub ? `<div class="notif-empty-sub">${m.sub}</div>` : ''}
        </div>
      `;
      return;
    }

    // Group by date
    const groups = {};
    filtered.forEach(n => {
      const label = formatDate(n.created_at);
      if (!groups[label]) groups[label] = [];
      groups[label].push(n);
    });

    let delay = 0;
    let html = '';
    for (const [label, items] of Object.entries(groups)) {
      html += `<div class="notif-date-group"><div class="date-group-label">${label}</div>`;
      items.forEach(n => {
        html += renderNotifItem(n, delay);
        delay += 30;
      });
      html += '</div>';
    }
    list.innerHTML = html;
  }

  async function loadNotifications() {
    try {
      const data = await window.ALPApi.getNotifications();
      allNotifications = data.notifications || data || [];
      renderList();
    } catch (err) {
      const list = document.getElementById('notif-list');
      if (list) list.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">❌</div>
          <div class="notif-empty-title">Failed to load</div>
          <div class="notif-empty-sub">Could not fetch notifications. Check your connection.</div>
        </div>
      `;
    }
  }

  function init() {
    loadNotifications();

    // Filter pills
    const pills = document.getElementById('notif-pills');
    if (pills) {
      pills.addEventListener('click', (e) => {
        const pill = e.target.closest('.notif-pill');
        if (!pill) return;
        pills.querySelectorAll('.notif-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.dataset.filter;
        renderList();
      });
    }

    // Mark all read
    const markAllBtn = document.getElementById('mark-all-read-btn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        try {
          await window.ALPApi.markAllNotificationsRead();
          allNotifications.forEach(n => n.is_read = 1);
          renderList();
          if (window.ALPNotifications) window.ALPNotifications.refresh();
          window.showToast('All notifications marked as read', 'success');
        } catch (err) { window.showToast('Failed to mark as read', 'error'); }
      });
    }

    // Item delegation
    const list = document.getElementById('notif-list');
    if (list) {
      list.addEventListener('click', async (e) => {
        const markBtn = e.target.closest('.mark-read-btn');
        if (markBtn) {
          const id = markBtn.dataset.id;
          try {
            await window.ALPApi.markNotificationRead(id);
            const n = allNotifications.find(n => String(n.id) === id);
            if (n) n.is_read = 1;
            renderList();
            if (window.ALPNotifications) window.ALPNotifications.refresh();
          } catch { window.showToast('Failed', 'error'); }
          return;
        }

        const deleteBtn = e.target.closest('.notif-delete-btn');
        if (deleteBtn) {
          const id = deleteBtn.dataset.id;
          // Animate out
          const item = deleteBtn.closest('.notif-item');
          if (item) { item.style.transition='opacity 0.2s,transform 0.2s'; item.style.opacity='0'; item.style.transform='translateX(20px)'; }
          try {
            await window.ALPApi.deleteNotification(id);
            allNotifications = allNotifications.filter(n => String(n.id) !== id);
            setTimeout(() => {
              renderList();
              if (window.ALPNotifications) window.ALPNotifications.refresh();
            }, 220);
            window.showToast('Notification deleted', 'success');
          } catch { window.showToast('Failed', 'error'); }
          return;
        }

        const undoBtn = e.target.closest('.notif-undo-btn');
        if (undoBtn) {
          const id = undoBtn.dataset.undoId;
          undoBtn.disabled = true;
          undoBtn.textContent = 'Undoing…';
          try {
            const res = await window.ALPApi._post(`/api/notifications/${id}/undo`, {});
            const n = allNotifications.find(n => String(n.id) === id);
            if (n) { n.undone_at = new Date().toISOString(); n.is_read = 1; }
            renderList();
            if (window.ALPNotifications) window.ALPNotifications.refresh();
            window.showToast(`✓ Undone (${res.kind || 'restored'})`, 'success');
          } catch (err) {
            undoBtn.disabled = false;
            window.showToast(err.message || 'Undo failed', 'error');
          }
          return;
        }
      });
    }

    _startCountdownTicker();

    // Socket: real-time
    if (window.ALPSocket) {
      const onNotif = (notif) => {
        allNotifications.unshift(notif);
        renderList();
      };
      window.ALPSocket.on('admin:notification', onNotif);
      socketListeners.push(['admin:notification', onNotif]);

      const onConnect = () => {
        loadNotifications();
      };
      window.ALPSocket.on('connect', onConnect);
      socketListeners.push(['connect', onConnect]);
    }
  }

  function destroy() {
    if (window.ALPSocket) socketListeners.forEach(([ev, fn]) => window.ALPSocket.off(ev, fn));
    socketListeners = [];
    allNotifications = [];
    currentFilter = 'all';
    _stopCountdownTicker();
  }

  return { render, init, destroy, loadNotifications };
})();

if (typeof window !== 'undefined') window.NotificationsPage = NotificationsPage;
