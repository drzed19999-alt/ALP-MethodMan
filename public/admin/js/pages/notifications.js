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
    info:     { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`, color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', label: 'Info' },
    warning:  { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`, color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', label: 'Warning' },
    alert:    { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`, color: '#f87171', bg: 'rgba(239,68,68,0.12)', label: 'Alert' },
    success:  { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`, color: '#34d399', bg: 'rgba(16,185,129,0.12)', label: 'Success' },
    error:    { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`, color: '#f87171', bg: 'rgba(239,68,68,0.12)', label: 'Error' },
    session:  { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Session' },
    redirect: { icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 004 4h12"/></svg>`, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Redirect' }
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
          <div class="header-actions">
            <button class="btn btn-ghost" id="mark-all-read-btn">
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

        <!-- Filter Pills -->
        <div class="notif-filter-bar">
          <div class="notif-pills" id="notif-pills">
            <button class="notif-pill active" data-filter="all">All</button>
            <button class="notif-pill" data-filter="unread">Unread</button>
            <button class="notif-pill" data-filter="info">Info</button>
            <button class="notif-pill" data-filter="warning">Warning</button>
            <button class="notif-pill" data-filter="alert">Alert</button>
            <button class="notif-pill" data-filter="error">Error</button>
            <button class="notif-pill" data-filter="success">Success</button>
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
        .notif-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
        .page-title { font-size:26px; font-weight:800; color:var(--text-primary); margin:0 0 4px; letter-spacing:-0.4px; }
        .page-subtitle { font-size:13px; color:var(--text-secondary); margin:0; }
        .header-actions { display:flex; gap:10px; align-items:center; }
        .btn-ghost { display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:9px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; font-family:'Inter',sans-serif; border:1px solid var(--border-color); background:rgba(255,255,255,0.03); color:var(--text-secondary); }
        .btn-ghost:hover { background:rgba(212,175,55,0.07); border-color:rgba(212,175,55,0.3); color:#D4AF37; }

        /* Summary strip */
        .notif-summary-strip {
          display:flex; align-items:center; gap:12px; padding:10px 16px;
          background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06);
          border-radius:10px; margin-bottom:18px;
        }
        .summary-chip { display:flex; align-items:center; gap:7px; font-size:13px; font-weight:500; color:var(--text-secondary); }
        .unread-chip { color:#D4AF37; }
        .chip-dot { width:7px; height:7px; border-radius:50%; background:#D4AF37; flex-shrink:0; }
        .chip-dot.pulsing { animation:chipPulse 2s ease-in-out infinite; }
        @keyframes chipPulse { 0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,0.4);} 50%{box-shadow:0 0 0 4px rgba(212,175,55,0);} }
        .summary-sep { width:1px; height:16px; background:rgba(255,255,255,0.08); }

        /* Filter pills */
        .notif-filter-bar { margin-bottom:22px; }
        .notif-pills { display:flex; gap:6px; flex-wrap:wrap; }
        .notif-pill {
          padding:7px 16px; font-size:12px; font-weight:600; border-radius:20px;
          border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03);
          color:var(--text-secondary); cursor:pointer; transition:all 0.15s;
          font-family:'Inter',sans-serif; letter-spacing:0.01em;
        }
        .notif-pill:hover { border-color:rgba(212,175,55,0.4); color:#E8C547; background:rgba(212,175,55,0.06); }
        .notif-pill.active { background:#D4AF37; color:#0a0a0a; border-color:#D4AF37; box-shadow:0 4px 12px rgba(212,175,55,0.3); font-weight:700; }

        /* List */
        .notif-list { display:flex; flex-direction:column; gap:2px; }

        /* Date group */
        .notif-date-group { margin-bottom:4px; }
        .date-group-label {
          font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;
          letter-spacing:0.7px; padding:14px 0 8px; position:sticky; top:0;
          background:var(--bg-primary, #0a0a0f); z-index:1;
        }

        /* Notification item */
        .notif-item {
          display:flex; align-items:flex-start; gap:14px; padding:16px 18px;
          background:var(--card-bg); border:1px solid var(--border-color);
          border-radius:12px; transition:all 0.18s; position:relative;
          margin-bottom:6px;
        }
        .notif-item:hover { border-color:rgba(212,175,55,0.25); background:rgba(212,175,55,0.03); transform:translateX(2px); }
        .notif-item.is-unread {
          border-left:3px solid #D4AF37;
          background:rgba(212,175,55,0.025);
        }
        .notif-item.is-unread .notif-title { color:#e2e8f0; font-weight:600; }

        /* Unread dot indicator */
        .unread-dot {
          position:absolute; top:18px; right:16px;
          width:7px; height:7px; border-radius:50%; background:#D4AF37;
          box-shadow:0 0 0 3px rgba(212,175,55,0.2);
        }

        .notif-icon-wrap {
          width:38px; height:38px; border-radius:10px; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
        }
        .notif-body { flex:1; min-width:0; }
        .notif-title { font-size:14px; font-weight:500; color:var(--text-primary); margin-bottom:4px; line-height:1.4; }
        .notif-msg { font-size:13px; color:var(--text-secondary); line-height:1.55; margin-bottom:6px; }
        .notif-meta { display:flex; align-items:center; gap:10px; }
        .notif-time { font-size:11px; color:var(--text-tertiary); }
        .type-pill {
          font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px;
          text-transform:uppercase; letter-spacing:0.5px;
        }

        .notif-item-actions { display:flex; gap:4px; flex-shrink:0; align-self:flex-start; margin-top:2px; opacity:0; transition:opacity 0.15s; }
        .notif-item:hover .notif-item-actions { opacity:1; }
        .notif-action-btn {
          width:28px; height:28px; display:flex; align-items:center; justify-content:center;
          background:none; border:none; border-radius:7px; cursor:pointer;
          color:var(--text-tertiary); transition:all 0.15s;
        }
        .notif-action-btn:hover { background:rgba(255,255,255,0.07); color:var(--text-primary); }
        .notif-action-btn.del:hover { color:#ef4444; background:rgba(239,68,68,0.08); }

        /* Empty state */
        .notif-empty {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          padding:80px 20px; text-align:center;
        }
        .notif-empty-icon { font-size:3rem; margin-bottom:16px; opacity:0.4; }
        .notif-empty-title { font-size:16px; font-weight:600; color:var(--text-secondary); margin-bottom:6px; }
        .notif-empty-sub { font-size:13px; color:var(--text-tertiary); }


        /* Animations */
        .page-enter { animation:fadeUp 0.3s ease both; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
        .notif-item { animation:itemIn 0.25s ease both; }
        @keyframes itemIn { from{opacity:0;transform:translateX(-8px);} to{opacity:1;transform:translateX(0);} }

        @media (max-width:600px) {
          .notif-item-actions { opacity:1; }
        }
      </style>
    `;
  }

  function getFiltered() {
    switch (currentFilter) {
      case 'unread': return allNotifications.filter(n => !n.is_read);
      case 'info':
      case 'warning':
      case 'alert':
      case 'success':
      case 'error':
        return allNotifications.filter(n => n.type === currentFilter);
      default: return allNotifications;
    }
  }

  function renderNotifItem(n, delay = 0) {
    const tc = getType(n.type);
    return `
      <div class="notif-item ${n.is_read ? '' : 'is-unread'}" data-notif-id="${n.id}" style="animation-delay:${delay}ms">
        <div class="notif-icon-wrap" style="background:${tc.bg};color:${tc.color};">${tc.icon}</div>
        <div class="notif-body">
          <div class="notif-title">${escapeHtml(n.title || 'Notification')}</div>
          <div class="notif-msg">${escapeHtml(n.message || '')}</div>
          <div class="notif-meta">
            <span class="notif-time">${timeAgo(n.created_at)}</span>
            <span class="type-pill" style="color:${tc.color};background:${tc.bg};">${escapeHtml(n.type || 'info')}</span>
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
        ${!n.is_read ? '<div class="unread-dot"></div>' : ''}
      </div>
    `;
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
      });
    }

    // Socket: real-time
    if (window.ALPSocket) {
      const onNotif = (notif) => {
        allNotifications.unshift(notif);
        renderList();
      };
      window.ALPSocket.on('admin:notification', onNotif);
      socketListeners.push(['admin:notification', onNotif]);

      const onConnect = () => {
        console.log('[NotificationsPage] Socket connected/reconnected. Reloading notifications to sync.');
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
  }

  return { render, init, destroy, loadNotifications };
})();

if (typeof window !== 'undefined') window.NotificationsPage = NotificationsPage;
