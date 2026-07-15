/**
 * ALP - Dashboard Page Module
 * Clean, modern dashboard with stats, charts, and activity feed
 */
const DashboardPage = (() => {
  let refreshTimer = null;
  let statsListeners = [];
  let currentRange = 'today';

  // --- Helpers ---
  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.includes('+')) {
      return new Date(dateStr.trim().replace(' ', 'T') + 'Z');
    }
    return new Date(dateStr);
  }

  function timeAgo(dateStr) {
    const now = Date.now();
    const then = parseDate(dateStr).getTime();
    const diff = Math.max(0, now - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '0s';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  function animateCounter(el, target, suffix = '') {
    const duration = 800;
    const start = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    const diff = target - start;
    if (diff === 0) { el.textContent = target.toLocaleString() + suffix; return; }
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * ease);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function activityIcon(type) {
    const icons = {
      session_start: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><circle cx="12" cy="12" r="10"/></svg>`,
      session_end: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><circle cx="12" cy="12" r="10"/></svg>`,
      page_view: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
      redirect: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
      form_data: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
      error: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
      default: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
    };
    return icons[type] || icons.default;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // --- Render ---
  function render() {
    const user = window.ALPAuth.getUser();
    const name = user ? user.username : 'Admin';
    return `
      <div class="dashboard-page">
        <!-- Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">Welcome back, ${escapeHtml(name)}</h1>
            <p class="page-subtitle">Here's what's happening with your tracked websites</p>
          </div>
          <div class="header-actions">
            <select id="dashboard-range-select" class="range-select">
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <div class="live-indicator">
              <span class="pulse-dot"></span>
              Live
            </div>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">Active Sessions</div>
              <div class="stat-value" id="stat-active-sessions">0</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #6366f1, #4f46e5);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">Page Views</div>
              <div class="stat-value" id="stat-page-views">0</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">Avg. Duration</div>
              <div class="stat-value" id="stat-avg-duration">0s</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">Active Scam Pages</div>
              <div class="stat-value" id="stat-active-websites">0</div>
            </div>
          </div>
        </div>

        <!-- Charts -->
        <div class="charts-row">
          <div class="chart-card large">
            <div class="chart-header">
              <h3>Sessions Over Time</h3>
            </div>
            <div class="chart-body">
              <canvas id="sessions-chart"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <h3>Top Pages</h3>
            </div>
            <div class="chart-body">
              <canvas id="top-pages-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Activity & Sessions -->
        <div class="bottom-row">
          <div class="activity-card">
            <div class="card-header">
              <h3>Live Activity</h3>
              <span class="badge" id="activity-count">0 events</span>
            </div>
            <div class="activity-list" id="activity-feed">
              <div class="empty-state" id="activity-empty">No recent activity</div>
            </div>
          </div>

          <div class="sessions-card">
            <div class="card-header">
              <h3>Recent Sessions</h3>
              <a href="#/sessions" class="view-all">View all →</a>
            </div>
            <div class="sessions-list" id="recent-sessions">
              <div class="empty-state" id="sessions-empty">No recent sessions</div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .dashboard-page {
          max-width: 1400px;
          margin: 0 auto;
        }

        /* Header */
        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 16px;
        }

        .page-title {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 4px;
          letter-spacing: -0.02em;
        }

        .page-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .range-select {
          height: 32px;
          padding: 0 32px 0 10px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          outline: none;
        }

        .range-select:hover {
          border-color: var(--border-hover);
        }

        .live-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 12px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #10b981;
        }

        .pulse-dot {
          width: 5px;
          height: 5px;
          background: #10b981;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .stat-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          transition: all 0.2s;
        }

        .stat-card:hover {
          border-color: var(--border-hover);
          transform: translateY(-2px);
        }

        .stat-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-content {
          flex: 1;
          min-width: 0;
        }

        .stat-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1;
        }

        /* Charts */
        .charts-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 14px;
          margin-bottom: 18px;
        }

        .chart-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          padding: 14px;
          transition: all 0.2s;
        }

        .chart-card:hover {
          border-color: var(--border-hover);
        }

        .chart-header {
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-primary);
        }

        .chart-header h3 {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .chart-body {
          height: 180px;
          position: relative;
        }

        /* Bottom Row */
        .bottom-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .activity-card,
        .sessions-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          padding: 14px;
          min-height: 240px;
        }

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-primary);
        }

        .card-header h3 {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          padding: 3px 8px;
          border-radius: 5px;
        }

        .view-all {
          font-size: 12px;
          font-weight: 600;
          color: #6366f1;
          text-decoration: none;
        }

        .view-all:hover {
          color: #4f46e5;
        }

        .activity-list,
        .sessions-list {
          max-height: 200px;
          overflow-y: auto;
        }

        .activity-list::-webkit-scrollbar,
        .sessions-list::-webkit-scrollbar {
          width: 4px;
        }

        .activity-list::-webkit-scrollbar-thumb,
        .sessions-list::-webkit-scrollbar-thumb {
          background: var(--border-hover);
          border-radius: 2px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 16px;
          color: var(--text-muted);
          font-size: 12px;
        }

        /* Activity Items */
        .activity-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 6px;
          margin-bottom: 6px;
          transition: all 0.2s;
        }

        .activity-item:hover {
          background: var(--bg-tertiary);
        }

        .activity-item-icon {
          flex-shrink: 0;
        }

        .activity-item-content {
          flex: 1;
          min-width: 0;
        }

        .activity-item-title {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .activity-item-meta {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .activity-item-time {
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        /* Session Items */
        .recent-session-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 6px;
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .recent-session-item:hover {
          background: var(--bg-tertiary);
        }

        .session-avatar {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          color: white;
          flex-shrink: 0;
        }

        .session-info {
          flex: 1;
          min-width: 0;
        }

        .session-info-visitor {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .session-info-meta {
          font-size: 11px;
          color: var(--text-secondary);
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .charts-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .bottom-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;
  }

  // --- Render Activity Item ---
  function renderActivityItem(item) {
    const icon = activityIcon(item.event_type);
    const time = timeAgo(item.timestamp || item.created_at);
    let title = item.event_type?.replace(/_/g, ' ') || 'Activity';
    let meta = item.visitor_id || '';
    if (item.page) meta += ` • ${item.page}`;
    return `
      <div class="activity-item">
        <div class="activity-item-icon">${icon}</div>
        <div class="activity-item-content">
          <div class="activity-item-title">${escapeHtml(title)}</div>
          <div class="activity-item-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="activity-item-time">${time}</div>
      </div>
    `;
  }

  // --- Render Activity Feed ---
  function renderActivityFeed(items) {
    const container = document.getElementById('activity-feed');
    const empty = document.getElementById('activity-empty');
    if (!container) return;
    if (!items || items.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = items.map(renderActivityItem).join('');
    const countBadge = document.getElementById('activity-count');
    if (countBadge) countBadge.textContent = `${items.length} events`;
  }

  function addActivityItem(item) {
    const container = document.getElementById('activity-feed');
    const empty = document.getElementById('activity-empty');
    if (!container) return;
    if (empty) empty.style.display = 'none';
    const html = renderActivityItem(item);
    container.insertAdjacentHTML('afterbegin', html);
    const countBadge = document.getElementById('activity-count');
    const count = container.querySelectorAll('.activity-item').length;
    if (countBadge) countBadge.textContent = `${count} events`;
  }

  function sessionAvatarColor(id) {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6'];
    const hash = (id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  function renderRecentSessions(sessions) {
    const container = document.getElementById('recent-sessions');
    const empty = document.getElementById('sessions-empty');
    if (!container) return;
    if (!sessions || sessions.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = sessions.map(s => {
      const color = sessionAvatarColor(s.visitor_id || s.id);
      const initials = (s.visitor_id || s.id || 'U').substring(0, 2).toUpperCase();
      const time = timeAgo(s.created_at || s.first_seen);
      const duration = formatDuration(s.duration);
      return `
        <div class="recent-session-item" onclick="window.location.hash='#/sessions?id=${s.id}'">
          <div class="session-avatar" style="background:${color}">${initials}</div>
          <div class="session-info">
            <div class="session-info-visitor">${escapeHtml(s.visitor_id || s.id || 'Unknown')}</div>
            <div class="session-info-meta">${time} • ${duration}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Load Dashboard Data ---
  async function loadDashboard() {
    try {
      const data = await window.ALPApi.getDashboard({ range: currentRange });
      
      if (data) {
        updateStats(data);
      }
      
      if (data.activityFeed) {
        renderActivityFeed(data.activityFeed);
      }
      
      if (data.recentSessions) {
        renderRecentSessions(data.recentSessions);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }

  function updateStats(data) {
    const stats = data.stats || {};
    const activeSessions = stats.activeSessions || 0;
    const pageViews = stats.pageViewsToday || stats.pageViews || 0;
    const avgDuration = stats.avgDuration || 0;
    const activeWebsites = stats.activeWebsites || 0;

    const sessionsEl = document.getElementById('stat-active-sessions');
    const viewsEl = document.getElementById('stat-page-views');
    const durationEl = document.getElementById('stat-avg-duration');
    const websitesEl = document.getElementById('stat-active-websites');

    if (sessionsEl) animateCounter(sessionsEl, activeSessions);
    if (viewsEl) animateCounter(viewsEl, pageViews);
    if (durationEl) durationEl.textContent = formatDuration(avgDuration);
    if (websitesEl) animateCounter(websitesEl, activeWebsites);

    createCharts(data);
  }

  function createCharts(data) {
    createSessionsChart(data.sessionsChart || data.sessionsOverTime || []);
    createTopPagesChart(data.topPages || []);
  }

  function createSessionsChart(data) {
    const canvas = document.getElementById('sessions-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (window.dashboardSessionsChart) {
      window.dashboardSessionsChart.destroy();
    }

    const labels = data.map(d => d.label || d.time || '');
    const values = data.map(d => d.value || d.count || 0);

    window.dashboardSessionsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Sessions',
          data: values,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function createTopPagesChart(data) {
    const canvas = document.getElementById('top-pages-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (window.dashboardTopPagesChart) {
      window.dashboardTopPagesChart.destroy();
    }

    const labels = data.map(d => d.page || d.label || '').slice(0, 5);
    const values = data.map(d => d.views || d.count || 0).slice(0, 5);

    window.dashboardTopPagesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Page Views',
          data: values,
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // --- Init ---
  async function init() {
    const rangeSelect = document.getElementById('dashboard-range-select');
    if (rangeSelect) {
      rangeSelect.value = currentRange;
      rangeSelect.addEventListener('change', (e) => {
        currentRange = e.target.value;
        loadDashboard();
      });
    }

    await loadDashboard();

    if (window.ALPSocket) {
      window.ALPSocket.on('activity', (data) => {
        addActivityItem(data);
      });
    }

    refreshTimer = setInterval(loadDashboard, 30000);
  }

  function cleanup() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (window.dashboardSessionsChart) {
      window.dashboardSessionsChart.destroy();
      window.dashboardSessionsChart = null;
    }
    if (window.dashboardTopPagesChart) {
      window.dashboardTopPagesChart.destroy();
      window.dashboardTopPagesChart = null;
    }
  }

  return { render, init, cleanup };
})();
