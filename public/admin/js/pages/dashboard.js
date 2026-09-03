/**
 * ALP - Command Center
 * Live ops dashboard: sessions, servers, alerts, captures, funnel, geo, deploys.
 */
const DashboardPage = (() => {
  let refreshTimer = null;
  let vpsTimer = null;
  let currentRange = 'today';
  let socketHandlers = [];

  const COUNTRY_FLAG = (cc) => {
    if (!cc || cc.length !== 2) return '🌐';
    const base = 127397;
    return String.fromCodePoint(...cc.toUpperCase().split('').map(c => c.charCodeAt(0) + base));
  };

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
    const s = Math.floor(diff / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '0s';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  function sessionDurationMs(s) {
    if (!s) return 0;
    const start = parseDate(s.started_at || s.created_at).getTime();
    const end = parseDate(s.last_activity || s.started_at || s.created_at).getTime();
    return Math.max(0, end - start);
  }

  function animateCounter(el, target, suffix = '') {
    if (!el) return;
    const duration = 900;
    const start = parseInt(String(el.textContent).replace(/[^0-9-]/g, ''), 10) || 0;
    const diff = target - start;
    if (diff === 0) { el.textContent = target.toLocaleString() + suffix; return; }
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(start + diff * ease);
      el.textContent = cur.toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
      else {
        el.classList.remove('count-bump');
        void el.offsetWidth;
        el.classList.add('count-bump');
      }
    }
    requestAnimationFrame(step);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  // --- Render ---
  function render() {
    const user = window.ALPAuth && window.ALPAuth.getUser ? window.ALPAuth.getUser() : null;
    const name = user ? user.username : 'Admin';
    return `
      <div class="dashboard-page">
        <div class="page-header cc-fade-in">
          <div>
            <div class="ph" style="--ph-accent:#D4AF37;--ph-glow:rgba(212,175,55,0.6)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>COMMAND CENTER · LIVE</div>
              <h1 class="ph-title"><span class="ph-title-glyph">⌘</span><span class="ph-title-text">Welcome back, ${escapeHtml(name)}</span></h1>
              <p class="ph-sub">Live ops view: sessions, servers, threats and captures</p>
            </div>
          </div>
          <div class="header-actions">
            <select id="dashboard-range-select" class="range-select">
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <div class="live-indicator"><span class="pulse-dot"></span>Live</div>
          </div>
        </div>

        <!-- Server health strip -->
        <div class="server-strip cc-slide-up" id="server-strip">
          <div class="server-strip-label">Servers</div>
          <div class="server-strip-track" id="server-strip-track">
            <div class="server-strip-empty">Loading…</div>
          </div>
          <a href="#/vps" class="server-strip-more">All servers →</a>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
          ${statCard('stat-active-sessions','Active Sessions','#10b981','#059669', iconUsers())}
          ${statCard('stat-page-views','Page Views','#D4AF37','#B8962E', iconEye('#0a0a0a'))}
          ${statCard('stat-avg-duration','Avg. Duration','#f59e0b','#d97706', iconClock())}
          ${statCard('stat-active-websites','Active Scam Pages','#3b82f6','#2563eb', iconGlobe())}
        </div>

        <!-- Infrastructure -->
        <div class="infra-section cc-slide-up">
          <div class="infra-header"><span class="infra-title">Websites &amp; Infrastructure</span></div>
          <div class="infra-grid">
            ${infraTile('infra-live','#10b981','Live Sites')}
            ${infraTile('infra-offline','#ef4444','Offline')}
            ${infraTile('infra-total','#6366f1','Total Sites')}
            ${infraTile('infra-domains','#D4AF37','Active Domains')}
            ${infraTile('infra-pages','#3b82f6','Demo Pages')}
            ${infraTile('infra-bots','#0088cc','Telegram Bots')}
            ${infraTile('infra-vps','#8b5cf6','Total VPS')}
            ${infraTile('infra-vps-attached','#22d3ee','Attached VPS')}
          </div>
        </div>

        <!-- Alerts + Funnel -->
        <div class="ops-row cc-slide-up">
          <div class="alerts-card">
            <div class="card-header"><h3>Needs Attention</h3><span class="badge" id="alerts-badge">0</span></div>
            <div class="alerts-grid" id="alerts-grid"></div>
          </div>
          <div class="funnel-card">
            <div class="card-header"><h3>Today's Funnel</h3><span class="badge" id="funnel-conv">0%</span></div>
            <div class="funnel-bars" id="funnel-bars"></div>
          </div>
        </div>

        <!-- Charts -->
        <div class="charts-row cc-slide-up">
          <div class="chart-card large">
            <div class="chart-header"><h3>Sessions Over Time</h3></div>
            <div class="chart-body"><canvas id="sessions-chart"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><h3>Top Countries Today</h3></div>
            <div class="chart-body chart-body-geo"><div class="geo-list" id="geo-list"></div></div>
          </div>
        </div>

        <!-- Captures + Deploys -->
        <div class="ops-row cc-slide-up">
          <div class="captures-card">
            <div class="card-header">
              <h3>Recent Captures</h3>
              <a href="#/captured-data" class="view-all">View all →</a>
            </div>
            <div class="captures-list" id="captures-list">
              <div class="empty-state">Waiting for captures…</div>
            </div>
          </div>
          <div class="deploys-card">
            <div class="card-header"><h3>Ops Today</h3><span class="badge" id="deploys-badge">0</span></div>
            <div class="ops-stack" id="ops-stack"></div>
          </div>
        </div>

        <!-- Activity & Sessions -->
        <div class="bottom-row cc-slide-up">
          <div class="activity-card">
            <div class="card-header"><h3>Live Activity</h3><span class="badge" id="activity-count">0 events</span></div>
            <div class="activity-list" id="activity-feed">
              <div class="empty-state" id="activity-empty">No recent activity</div>
            </div>
          </div>
          <div class="sessions-card">
            <div class="card-header"><h3>Recent Sessions</h3><a href="#/sessions" class="view-all">View all →</a></div>
            <div class="sessions-list" id="recent-sessions">
              <div class="empty-state" id="sessions-empty">No recent sessions</div>
            </div>
          </div>
        </div>
      </div>

      ${styles()}
    `;
  }

  function statCard(id, label, c1, c2, icon) {
    return `
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg, ${c1}, ${c2});">${icon}</div>
        <div class="stat-content">
          <div class="stat-label">${label}</div>
          <div class="stat-value" id="${id}">0</div>
        </div>
      </div>`;
  }
  function infraTile(id, color, label) {
    return `
      <div class="infra-tile">
        <div class="infra-dot" style="background:${color}"></div>
        <div class="infra-tile-value" id="${id}">—</div>
        <div class="infra-tile-label">${label}</div>
      </div>`;
  }
  function iconUsers()  { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`; }
  function iconEye(c)   { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
  function iconClock()  { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
  function iconGlobe()  { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`; }

  // --- Data loading ---
  async function loadDashboard() {
    try {
      const data = await window.ALPApi.getDashboard({ range: currentRange });
      if (!data) return;
      updateStats(data);
      renderAlerts(data);
      renderFunnel(data.funnel || {});
      renderCountries(data.topCountries || []);
      renderCaptures(data.recentCaptures || []);
      renderOpsToday(data);
      renderActivityFeed(data.activityFeed || []);
      renderRecentSessions(data.recentSessions || []);
    } catch (err) {
      console.error('[CC] loadDashboard failed:', err);
    }
  }

  async function loadServers() {
    try {
      const data = await window.ALPApi._request('GET', '/api/vps-dashboard/metrics');
      renderServerStrip((data && data.vps) || []);
    } catch (err) {
      const track = document.getElementById('server-strip-track');
      if (track) track.innerHTML = `<div class="server-strip-empty">Server metrics unavailable</div>`;
    }
  }

  function updateStats(data) {
    const s = data.stats || {};
    animateCounter(document.getElementById('stat-active-sessions'), s.activeSessions || 0);
    animateCounter(document.getElementById('stat-page-views'),     s.pageViewsToday || 0);
    const dEl = document.getElementById('stat-avg-duration');
    if (dEl) { dEl.textContent = formatDuration(s.avgDuration || 0); dEl.classList.remove('count-bump'); void dEl.offsetWidth; dEl.classList.add('count-bump'); }
    animateCounter(document.getElementById('stat-active-websites'), s.activeWebsites || 0);

    animateCounter(document.getElementById('infra-live'),          s.liveWebsites        || 0);
    animateCounter(document.getElementById('infra-offline'),       s.offlineWebsites     || 0);
    animateCounter(document.getElementById('infra-total'),         s.totalWebsites       || 0);
    animateCounter(document.getElementById('infra-domains'),       s.activeCustomDomains || 0);
    animateCounter(document.getElementById('infra-pages'),         s.totalDemoPages      || 0);
    animateCounter(document.getElementById('infra-bots'),          s.tgBotsCount         || 0);
    animateCounter(document.getElementById('infra-vps'),           s.totalVpses          || 0);
    animateCounter(document.getElementById('infra-vps-attached'),  s.attachedVpses       || 0);

    createSessionsChart(data.sessionsChart || []);
  }

  // --- Server health strip ---
  function serverHealth(v) {
    if (!v.reachable) return { color: '#ef4444', label: 'DOWN' };
    const cpu = Number(v.cpu_percent) || 0;
    const mem = Number(v.mem_percent) || 0;
    const disk = Number(v.disk_percent) || 0;
    const worst = Math.max(cpu, mem, disk);
    if (worst >= 90) return { color: '#ef4444', label: `${Math.round(worst)}%` };
    if (worst >= 75) return { color: '#f59e0b', label: `${Math.round(worst)}%` };
    return { color: '#10b981', label: 'HEALTHY' };
  }
  function renderServerStrip(vpsList) {
    const track = document.getElementById('server-strip-track');
    if (!track) return;
    if (!vpsList.length) { track.innerHTML = `<div class="server-strip-empty">No servers registered</div>`; return; }
    track.innerHTML = vpsList.map((v, idx) => {
      const h = serverHealth(v);
      const name = escapeHtml(v.label || v.host || 'VPS');
      const cpu = Math.round(Number(v.cpu_percent) || 0);
      const mem = Math.round(Number(v.mem_percent) || 0);
      const disk = Math.round(Number(v.disk_percent) || 0);
      const tip = v.reachable
        ? `${name} · CPU ${cpu}% · MEM ${mem}% · DISK ${disk}%`
        : `${name} · unreachable`;
      return `
        <a href="#/vps" class="server-pill" style="--pill-color:${h.color};animation-delay:${idx * 60}ms;" title="${tip}">
          <span class="server-dot" style="background:${h.color};box-shadow:0 0 8px ${h.color}"></span>
          <span class="server-pill-name">${name}</span>
          <span class="server-pill-badge">${h.label}</span>
        </a>`;
    }).join('');
  }

  // --- Alerts ---
  function renderAlerts(data) {
    const grid = document.getElementById('alerts-grid');
    const badge = document.getElementById('alerts-badge');
    if (!grid) return;
    const s = data.stats || {};
    const items = [
      { label: 'Flagged Domains', value: s.flaggedDomains || 0, color: '#ef4444', link: '#/domains' },
      { label: 'Domains Down',    value: s.downDomains    || 0, color: '#f59e0b', link: '#/domains' },
      { label: 'Sites Offline',   value: s.offlineWebsites|| 0, color: '#94a3b8', link: '#/demo-pages' },
      { label: 'Bots Blocked',    value: s.botsBlockedToday|| 0, color: '#8b5cf6', link: '#/firewall-rules' },
    ];
    const total = items.reduce((n, i) => n + (i.value || 0), 0);
    if (badge) { badge.textContent = String(total); badge.classList.toggle('badge-danger', total > 0); }
    grid.innerHTML = items.map((i, idx) => `
      <a href="${i.link}" class="alert-tile ${i.value > 0 ? 'alert-active' : ''}" style="--tile-color:${i.color};animation-delay:${idx * 60}ms">
        <div class="alert-value" data-target="${i.value}">${i.value}</div>
        <div class="alert-label">${i.label}</div>
      </a>`).join('');
    // Animate each value
    grid.querySelectorAll('.alert-value').forEach(el => {
      el.textContent = '0';
      animateCounter(el, parseInt(el.dataset.target || '0', 10));
    });
  }

  // --- Funnel ---
  function renderFunnel(f) {
    const container = document.getElementById('funnel-bars');
    const conv = document.getElementById('funnel-conv');
    if (!container) return;
    const visitors = f.visitors || 0;
    const login    = f.reachedLogin || 0;
    const captured = f.captured || 0;
    const exited   = f.reachedExit || 0;
    const max = Math.max(1, visitors, login, captured, exited);
    const stages = [
      { label: 'Visitors',    n: visitors, color: '#3b82f6' },
      { label: 'On Login',    n: login,    color: '#D4AF37' },
      { label: 'Captured',    n: captured, color: '#10b981' },
      { label: 'Reached Exit',n: exited,   color: '#8b5cf6' },
    ];
    container.innerHTML = stages.map((s, i) => {
      const pct = Math.round((s.n / max) * 100);
      return `
        <div class="funnel-row" style="animation-delay:${i * 80}ms">
          <div class="funnel-label">${s.label}</div>
          <div class="funnel-track"><div class="funnel-fill" style="--f-color:${s.color};width:0" data-w="${pct}%"></div></div>
          <div class="funnel-count" data-n="${s.n}">0</div>
        </div>`;
    }).join('');
    requestAnimationFrame(() => {
      container.querySelectorAll('.funnel-fill').forEach(el => { el.style.width = el.dataset.w; });
      container.querySelectorAll('.funnel-count').forEach(el => { animateCounter(el, parseInt(el.dataset.n || '0', 10)); });
    });
    if (conv) {
      const pct = visitors ? Math.round((captured / visitors) * 100) : 0;
      conv.textContent = `${pct}% conv`;
    }
  }

  // --- Top Countries ---
  function renderCountries(rows) {
    const el = document.getElementById('geo-list');
    if (!el) return;
    if (!rows.length) { el.innerHTML = `<div class="empty-state">No visitors today</div>`; return; }
    const max = Math.max(1, ...rows.map(r => r.count));
    el.innerHTML = rows.map((r, i) => `
      <div class="geo-row" style="animation-delay:${i * 60}ms">
        <div class="geo-flag">${COUNTRY_FLAG(r.country)}</div>
        <div class="geo-cc">${escapeHtml(r.country || '??')}</div>
        <div class="geo-bar-wrap"><div class="geo-bar" style="width:0" data-w="${Math.round((r.count / max) * 100)}%"></div></div>
        <div class="geo-count">${r.count.toLocaleString()}</div>
      </div>`).join('');
    requestAnimationFrame(() => {
      el.querySelectorAll('.geo-bar').forEach(bar => { bar.style.width = bar.dataset.w; });
    });
  }

  // --- Recent captures ---
  function renderCaptures(rows) {
    const list = document.getElementById('captures-list');
    if (!list) return;
    if (!rows.length) { list.innerHTML = `<div class="empty-state">Waiting for captures…</div>`; return; }
    list.innerHTML = rows.map((r, i) => {
      const fields = (r.fields || []).slice(0, 4).map(f => `<span class="capture-field">${escapeHtml(f)}</span>`).join('');
      const more = r.fields && r.fields.length > 4 ? `<span class="capture-field">+${r.fields.length - 4}</span>` : '';
      const color = r.website_color || '#D4AF37';
      const site = escapeHtml(r.website_name || 'Unknown');
      const page = escapeHtml(r.page || '');
      return `
        <a href="#/sessions?id=${r.session_id}" class="capture-row" style="animation-delay:${i * 60}ms">
          <div class="capture-dot" style="background:${color};box-shadow:0 0 10px ${color}"></div>
          <div class="capture-content">
            <div class="capture-title">${site} <span class="capture-page">${page}</span></div>
            <div class="capture-fields">${fields}${more}</div>
          </div>
          <div class="capture-time">${timeAgo(r.timestamp)}</div>
        </a>`;
    }).join('');
  }

  // --- Ops today ---
  function renderOpsToday(data) {
    const stack = document.getElementById('ops-stack');
    const badge = document.getElementById('deploys-badge');
    if (!stack) return;
    const s = data.stats || {};
    const rows = [
      { label: 'Deploys',       n: s.deploysToday   || 0, icon: '🚀', color: '#3b82f6' },
      { label: 'Captures',      n: s.capturesToday  || 0, icon: '📝', color: '#10b981' },
      { label: 'Bots Blocked',  n: s.botsBlockedToday || 0, icon: '🛡️', color: '#8b5cf6' },
      { label: 'Page Views',    n: s.pageViewsToday || 0, icon: '👁', color: '#D4AF37' },
    ];
    const total = rows.reduce((n, r) => n + (r.n || 0), 0);
    if (badge) badge.textContent = String(total);
    stack.innerHTML = rows.map((r, i) => `
      <div class="ops-row-item" style="animation-delay:${i * 60}ms">
        <div class="ops-emoji" style="background:${r.color}22;color:${r.color}">${r.icon}</div>
        <div class="ops-label">${r.label}</div>
        <div class="ops-count" data-n="${r.n}">0</div>
      </div>`).join('');
    stack.querySelectorAll('.ops-count').forEach(el => { animateCounter(el, parseInt(el.dataset.n || '0', 10)); });
  }

  // --- Activity feed (fixed to use real API fields) ---
  function renderActivityItem(item) {
    const icon = item.icon || '•';
    const msg  = item.message || item.type || 'Activity';
    const t    = timeAgo(item.timestamp || item.created_at);
    return `
      <div class="activity-item">
        <div class="activity-item-icon" aria-hidden="true">${escapeHtml(icon)}</div>
        <div class="activity-item-content">
          <div class="activity-item-title">${escapeHtml(msg)}</div>
        </div>
        <div class="activity-item-time">${t}</div>
      </div>`;
  }
  function renderActivityFeed(items) {
    const c = document.getElementById('activity-feed');
    const empty = document.getElementById('activity-empty');
    const badge = document.getElementById('activity-count');
    if (!c) return;
    if (!items || !items.length) {
      if (empty) empty.style.display = 'block';
      if (badge) badge.textContent = '0 events';
      return;
    }
    if (empty) empty.style.display = 'none';
    c.innerHTML = items.map(renderActivityItem).join('');
    if (badge) badge.textContent = `${items.length} events`;
  }
  function addActivityItem(item) {
    const c = document.getElementById('activity-feed');
    const empty = document.getElementById('activity-empty');
    if (!c) return;
    if (empty) empty.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.innerHTML = renderActivityItem(item);
    const el = wrap.firstElementChild;
    if (!el) return;
    el.classList.add('activity-item-new');
    c.insertBefore(el, c.firstChild);
    while (c.querySelectorAll('.activity-item').length > 25) {
      c.removeChild(c.lastElementChild);
    }
    const badge = document.getElementById('activity-count');
    if (badge) badge.textContent = `${c.querySelectorAll('.activity-item').length} events`;
  }

  // --- Recent sessions (fixed field names, computed duration, real meta) ---
  function sessionAvatarColor(seed) {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#22d3ee'];
    const s = String(seed || '');
    const h = s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return colors[h % colors.length];
  }
  function renderRecentSessions(sessions) {
    const c = document.getElementById('recent-sessions');
    const empty = document.getElementById('sessions-empty');
    if (!c) return;
    if (!sessions.length) { if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';
    c.innerHTML = sessions.map((s, i) => {
      const color = sessionAvatarColor(s.visitor_id || s.id);
      const label = (s.ip_address || s.visitor_id || 'Anon').slice(0, 18);
      const site = s.website_name || 'Unknown site';
      const meta = [
        s.country ? `${COUNTRY_FLAG(s.country)} ${s.country}` : '',
        s.browser || '',
        formatDuration(sessionDurationMs(s)),
        timeAgo(s.last_activity || s.started_at)
      ].filter(Boolean).join(' · ');
      const activeDot = s.is_active ? `<span class="live-dot" title="Active now"></span>` : '';
      return `
        <div class="recent-session-item" style="animation-delay:${i * 60}ms" onclick="window.location.hash='#/sessions?id=${s.id}'">
          <div class="session-avatar" style="background:${color}">${escapeHtml(label.slice(0, 2).toUpperCase())}</div>
          <div class="session-info">
            <div class="session-info-visitor">${activeDot}${escapeHtml(label)} · <span class="dim">${escapeHtml(site)}</span></div>
            <div class="session-info-meta">${escapeHtml(meta)}</div>
          </div>
        </div>`;
    }).join('');
  }

  // --- Charts ---
  function createSessionsChart(data) {
    const canvas = document.getElementById('sessions-chart');
    if (!canvas || !window.Chart) return;
    if (window.dashboardSessionsChart) window.dashboardSessionsChart.destroy();
    const labels = data.map(d => d.label || d.time || '');
    const values = data.map(d => d.value || d.count || 0);
    window.dashboardSessionsChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Sessions',
          data: values,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#D4AF37',
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            g.addColorStop(0, isLight ? 'rgba(15,23,42,0.14)' : 'rgba(212,175,55,0.35)');
            g.addColorStop(1, isLight ? 'rgba(15,23,42,0)'    : 'rgba(212,175,55,0)');
            return g;
          },
          borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4,
          pointHoverBackgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#D4AF37'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutCubic' },
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.15)' }, ticks: { color: '#64748b', font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }
        }
      }
    });
  }

  // --- Socket wiring ---
  // Note: global ALPToast in app.js already handles admin:notification / admin:session:new
  // so we don't bind those here to avoid double-toasting. We only add dashboard-specific
  // live reactions: activity feed prepend + counter bump on new sessions.
  function bindSockets() {
    if (!window.ALPSocket || !window.ALPSocket.on) return;
    const on = (evt, fn) => { window.ALPSocket.on(evt, fn); socketHandlers.push([evt, fn]); };
    on('admin:session:new', (s) => {
      const el = document.getElementById('stat-active-sessions');
      if (el) {
        const cur = parseInt(String(el.textContent).replace(/[^0-9]/g,''), 10) || 0;
        animateCounter(el, cur + 1);
      }
      addActivityItem({
        icon: '👤',
        message: `New visitor on ${s.website_name || 'Site'} · ${s.ip_address || 'unknown'}${s.country ? ' · ' + s.country : ''}`,
        timestamp: new Date().toISOString()
      });
    });
    on('admin:session:end', () => {
      const el = document.getElementById('stat-active-sessions');
      if (el) {
        const cur = parseInt(String(el.textContent).replace(/[^0-9]/g,''), 10) || 0;
        animateCounter(el, Math.max(0, cur - 1));
      }
    });
    on('admin:notification', (n) => {
      if (!n) return;
      // Add to live activity feed (global handler shows the toast)
      const iconMap = { alert:'⚠️', warning:'⚠', success:'✓', info:'ℹ', error:'✕' };
      addActivityItem({
        icon: iconMap[n.type] || '•',
        message: `${n.title ? n.title + ' — ' : ''}${n.message || ''}`,
        timestamp: n.created_at || new Date().toISOString()
      });
      // Bump captures counter if it's a credential-capture notification
      if (n.title === 'Credentials Captured') {
        loadDashboard();
        // Once the captures card re-renders, the newest row is at the top.
        // Give it the drop-in glow animation to draw the eye.
        setTimeout(() => {
          const first = document.querySelector('#captures-list .capture-row');
          if (first) {
            first.classList.add('alp-capture-new');
            setTimeout(() => first.classList.remove('alp-capture-new'), 2500);
          }
        }, 250);
      }
    });
  }
  function unbindSockets() {
    if (!window.ALPSocket || !window.ALPSocket.off) return;
    for (const [evt, fn] of socketHandlers) window.ALPSocket.off(evt, fn);
    socketHandlers = [];
  }

  // --- Init ---
  async function init() {
    const rangeSelect = document.getElementById('dashboard-range-select');
    if (rangeSelect) {
      rangeSelect.value = currentRange;
      rangeSelect.addEventListener('change', (e) => { currentRange = e.target.value; loadDashboard(); });
    }
    await Promise.all([loadDashboard(), loadServers()]);
    bindSockets();
    refreshTimer = setInterval(loadDashboard, 30000);
    vpsTimer     = setInterval(loadServers, 45000);
  }

  function cleanup() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (vpsTimer)     { clearInterval(vpsTimer);     vpsTimer     = null; }
    if (window.dashboardSessionsChart) { window.dashboardSessionsChart.destroy(); window.dashboardSessionsChart = null; }
    unbindSockets();
  }

  // --- Styles ---
  function styles() {
    return `<style>
      .dashboard-page { max-width: 1400px; margin: 0 auto; }

      /* Header */
      .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; gap:16px; }
      .header-actions { display:flex; align-items:center; gap:10px; }
      .range-select { height:32px; padding:0 32px 0 10px; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:6px; color:var(--text-primary); font-size:12px; font-weight:500; cursor:pointer; outline:none; transition:border-color .2s; }
      .range-select:hover { border-color:var(--border-primary); }
      .range-select:focus { border-color:var(--border-focus); }
      .live-indicator { display:flex; align-items:center; gap:6px; height:32px; padding:0 12px; background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.2); border-radius:6px; font-size:12px; font-weight:600; color:#10b981; }
      .pulse-dot { width:5px; height:5px; background:#10b981; border-radius:50%; animation: pulse 2s ease-in-out infinite; }
      @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }

      /* Entrance animations */
      @keyframes ccFadeIn { from{opacity:0} to{opacity:1} }
      @keyframes ccSlideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes ccPop { 0%{opacity:0;transform:scale(.95)} 100%{opacity:1;transform:scale(1)} }
      .cc-fade-in { animation: ccFadeIn .5s ease both; }
      .cc-slide-up { animation: ccSlideUp .55s cubic-bezier(.2,.9,.3,1) both; }
      .cc-slide-up:nth-of-type(1) { animation-delay:.05s }
      .cc-slide-up:nth-of-type(2) { animation-delay:.1s }
      .cc-slide-up:nth-of-type(3) { animation-delay:.15s }
      .cc-slide-up:nth-of-type(4) { animation-delay:.2s }
      .cc-slide-up:nth-of-type(5) { animation-delay:.25s }
      .cc-slide-up:nth-of-type(6) { animation-delay:.3s }

      /* Server strip */
      .server-strip { display:flex; align-items:center; gap:12px; padding:10px 14px; margin-bottom:14px; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; box-shadow:var(--shadow-card); overflow:hidden; }
      .server-strip-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; flex-shrink:0; }
      .server-strip-track { display:flex; align-items:center; gap:8px; flex:1; overflow-x:auto; scrollbar-width:thin; padding:2px 0; }
      .server-strip-track::-webkit-scrollbar { height:3px; }
      .server-strip-track::-webkit-scrollbar-thumb { background:var(--border-hover); border-radius:2px; }
      .server-strip-empty { font-size:12px; color:var(--text-muted); padding:4px 8px; }
      .server-strip-more { font-size:12px; font-weight:600; color:var(--accent-primary); text-decoration:none; flex-shrink:0; }
      .server-strip-more:hover { color:var(--accent-primary-hover); }
      .server-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; background:rgba(255,255,255,.03); border:1px solid var(--pill-color); border-color:color-mix(in oklab, var(--pill-color) 35%, transparent); border-radius:20px; font-size:11px; font-weight:600; color:var(--text-primary); flex-shrink:0; transition:all .2s; animation: ccPop .4s cubic-bezier(.2,.9,.3,1) both; text-decoration:none; cursor:pointer; }
      .server-pill:hover { transform:translateY(-1px); border-color:var(--pill-color); }
      .server-dot { width:6px; height:6px; border-radius:50%; animation: dotPulse 2.2s ease-in-out infinite; }
      @keyframes dotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.25)} }
      .server-pill-name { color:var(--text-primary); max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .server-pill-badge { font-size:10px; color:var(--pill-color); font-weight:700; letter-spacing:.03em; }

      /* Stats grid */
      .stats-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:18px; }
      .stat-card { background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; padding:14px; display:flex; gap:12px; align-items:flex-start; transition:all .2s; box-shadow:var(--shadow-card); animation: ccSlideUp .5s cubic-bezier(.2,.9,.3,1) both; }
      .stat-card:nth-child(1) { animation-delay:.05s } .stat-card:nth-child(2){ animation-delay:.1s } .stat-card:nth-child(3){ animation-delay:.15s } .stat-card:nth-child(4){ animation-delay:.2s }
      .stat-card:hover { border-color:var(--border-hover); transform:translateY(-2px); box-shadow:var(--shadow-card-lift), 0 0 0 1px var(--border-subtle); }
      .stat-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .stat-content { flex:1; min-width:0; }
      .stat-label { font-size:10px; font-weight:600; color:var(--text-muted); margin-bottom:4px; letter-spacing:.03em; text-transform:uppercase; }
      .stat-value { font-size:22px; font-weight:700; color:var(--text-primary); line-height:1; }
      @keyframes countBump { 0%{transform:scale(1)} 40%{transform:scale(1.06)} 100%{transform:scale(1)} }
      .count-bump { animation: countBump .55s cubic-bezier(.2,.9,.3,1); transform-origin:left center; display:inline-block; }

      /* Infra */
      .infra-section { margin-bottom:18px; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; padding:14px; box-shadow:var(--shadow-card); transition:border-color .2s; }
      .infra-section:hover { border-color:var(--border-subtle); }
      .infra-header { margin-bottom:12px; padding-bottom:9px; border-bottom:1px solid var(--border-subtle); }
      .infra-title { font-size:11px; font-weight:700; color:var(--accent-primary); text-transform:uppercase; letter-spacing:.06em; }
      .infra-grid { display:grid; grid-template-columns:repeat(8, 1fr); gap:10px; }
      .infra-tile { position:relative; text-align:center; padding:12px 8px 10px; background:rgba(255,255,255,.022); border:1px solid rgba(255,255,255,.05); border-radius:8px; transition:all .2s; overflow:hidden; }
      .infra-tile:hover { border-color:var(--border-primary); background:var(--accent-primary-muted); transform:translateY(-1px); }
      .infra-tile::after { content:''; position:absolute; inset:0; background:linear-gradient(120deg, transparent 40%, var(--accent-primary-muted) 50%, transparent 60%); transform:translateX(-100%); }
      .infra-tile:hover::after { animation: sheen 1s ease-out; }
      @keyframes sheen { to{ transform: translateX(100%); } }
      .infra-dot { width:5px; height:5px; border-radius:50%; position:absolute; top:8px; right:8px; opacity:.85; }
      .infra-tile-value { font-size:22px; font-weight:700; color:var(--text-primary); line-height:1; margin-bottom:5px; letter-spacing:-.02em; }
      .infra-tile-label { font-size:10px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; }

      /* Ops row */
      .ops-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }
      .alerts-card, .funnel-card, .captures-card, .deploys-card {
        background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; padding:14px; box-shadow:var(--shadow-card); transition:all .2s; min-height:200px;
      }
      .alerts-card:hover, .funnel-card:hover, .captures-card:hover, .deploys-card:hover { border-color:var(--border-primary); box-shadow:var(--shadow-card-lift); }

      /* Alerts */
      .alerts-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; }
      .alert-tile { display:flex; flex-direction:column; align-items:center; padding:16px 8px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.05); border-radius:8px; text-decoration:none; color:inherit; transition:all .2s; animation: ccPop .45s cubic-bezier(.2,.9,.3,1) both; position:relative; overflow:hidden; }
      .alert-tile:hover { transform:translateY(-2px); border-color:var(--tile-color); background:color-mix(in oklab, var(--tile-color) 8%, transparent); }
      .alert-tile.alert-active { border-color:color-mix(in oklab, var(--tile-color) 45%, transparent); }
      .alert-tile.alert-active::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--tile-color); animation: alertBar 2s ease-in-out infinite; }
      @keyframes alertBar { 0%,100%{opacity:1} 50%{opacity:.4} }
      .alert-value { font-size:26px; font-weight:800; color:var(--text-primary); line-height:1; margin-bottom:6px; }
      .alert-tile.alert-active .alert-value { color:var(--tile-color); }
      .alert-label { font-size:10px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; text-align:center; }
      .badge-danger { color:#fff !important; background:#ef4444 !important; border-color:#ef4444 !important; }

      /* Funnel */
      .funnel-bars { display:flex; flex-direction:column; gap:10px; margin-top:4px; }
      .funnel-row { display:grid; grid-template-columns:90px 1fr 60px; align-items:center; gap:10px; animation: ccSlideUp .5s both; }
      .funnel-label { font-size:11px; color:var(--text-muted); font-weight:600; }
      .funnel-track { height:14px; background:rgba(255,255,255,.04); border-radius:7px; overflow:hidden; }
      .funnel-fill { height:100%; background:linear-gradient(90deg, var(--f-color) 0%, color-mix(in oklab, var(--f-color) 60%, transparent) 100%); border-radius:7px; transition:width .8s cubic-bezier(.2,.9,.3,1); box-shadow:0 0 8px color-mix(in oklab, var(--f-color) 40%, transparent); }
      .funnel-count { font-size:14px; font-weight:700; color:var(--text-primary); text-align:right; font-variant-numeric:tabular-nums; }

      /* Charts */
      .charts-row { display:grid; grid-template-columns:2fr 1fr; gap:14px; margin-bottom:18px; }
      .chart-card { background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; padding:14px; transition:all .2s; box-shadow:var(--shadow-card); }
      .chart-card:hover { border-color:var(--border-primary); box-shadow:0 8px 24px rgba(0,0,0,.4), 0 0 0 1px var(--accent-primary-muted); }
      .chart-header { margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle); }
      .chart-header h3 { font-size:13px; font-weight:600; color:var(--accent-primary); margin:0; letter-spacing:.02em; }
      .chart-body { height:200px; position:relative; }
      .chart-body-geo { height:auto; min-height:180px; }

      /* Geo list */
      .geo-list { display:flex; flex-direction:column; gap:8px; padding:4px 0; }
      .geo-row { display:grid; grid-template-columns:24px 30px 1fr 40px; align-items:center; gap:8px; animation: ccSlideUp .4s both; }
      .geo-flag { font-size:16px; text-align:center; }
      .geo-cc { font-size:11px; font-weight:600; color:var(--text-muted); letter-spacing:.05em; }
      .geo-bar-wrap { height:8px; background:rgba(255,255,255,.04); border-radius:4px; overflow:hidden; }
      .geo-bar { height:100%; background:linear-gradient(90deg, var(--accent-primary), var(--accent-primary-muted)); border-radius:4px; transition:width .8s cubic-bezier(.2,.9,.3,1); }
      .geo-count { font-size:12px; font-weight:700; color:var(--text-primary); text-align:right; font-variant-numeric:tabular-nums; }

      /* Captures */
      .captures-list { display:flex; flex-direction:column; gap:6px; max-height:240px; overflow-y:auto; }
      .captures-list::-webkit-scrollbar { width:4px; } .captures-list::-webkit-scrollbar-thumb { background:var(--border-hover); border-radius:2px; }
      .capture-row { display:flex; align-items:center; gap:10px; padding:10px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.04); border-radius:8px; text-decoration:none; color:inherit; transition:all .2s; animation: ccSlideUp .4s both; }
      .capture-row:hover { border-color:rgba(16,185,129,.3); background:rgba(16,185,129,.05); transform:translateX(2px); }
      .capture-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; animation: dotPulse 2s ease-in-out infinite; }
      .capture-content { flex:1; min-width:0; }
      .capture-title { font-size:12px; font-weight:600; color:var(--text-primary); }
      .capture-page { color:var(--text-muted); font-weight:500; margin-left:4px; font-size:11px; }
      .capture-fields { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
      .capture-field { font-size:10px; font-weight:600; padding:2px 6px; background:rgba(16,185,129,.12); border:1px solid rgba(16,185,129,.25); color:#10b981; border-radius:4px; text-transform:lowercase; letter-spacing:.02em; }
      .capture-time { font-size:11px; color:var(--text-muted); flex-shrink:0; }

      /* Ops stack */
      .ops-stack { display:flex; flex-direction:column; gap:8px; }
      .ops-row-item { display:flex; align-items:center; gap:12px; padding:10px 12px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.04); border-radius:8px; animation: ccSlideUp .4s both; transition:all .2s; }
      .ops-row-item:hover { transform:translateX(2px); border-color:var(--border-primary); }
      .ops-emoji { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; }
      .ops-label { flex:1; font-size:12px; color:var(--text-primary); font-weight:500; }
      .ops-count { font-size:16px; font-weight:700; color:var(--text-primary); font-variant-numeric:tabular-nums; }

      /* Bottom row */
      .bottom-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .activity-card, .sessions-card { background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; padding:14px; min-height:240px; box-shadow:var(--shadow-card); transition:border-color .2s, box-shadow .2s, transform .2s; }
      .activity-card:hover, .sessions-card:hover { border-color:var(--border-gold); box-shadow:var(--shadow-card-lift); transform:translateY(-2px); }
      .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle); }
      .card-header h3 { font-size:13px; font-weight:600; color:var(--accent-primary); margin:0; letter-spacing:.02em; }
      .badge { font-size:11px; font-weight:600; color:var(--accent-primary); background:var(--accent-primary-muted); border:1px solid var(--border-primary); padding:3px 8px; border-radius:5px; transition:all .3s; }
      .view-all { font-size:12px; font-weight:600; color:var(--accent-primary); text-decoration:none; }
      .view-all:hover { color:var(--accent-primary-hover); }
      .activity-list, .sessions-list { max-height:280px; overflow-y:auto; }
      .activity-list::-webkit-scrollbar, .sessions-list::-webkit-scrollbar { width:4px; }
      .activity-list::-webkit-scrollbar-thumb, .sessions-list::-webkit-scrollbar-thumb { background:var(--border-hover); border-radius:2px; }
      .empty-state { text-align:center; padding:40px 16px; color:var(--text-muted); font-size:12px; }

      .activity-item { display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; margin-bottom:6px; transition:all .2s; border-left:2px solid transparent; }
      .activity-item:hover { background:var(--accent-primary-muted); border-left-color:var(--border-hover); padding-left:6px; }
      .activity-item-icon { flex-shrink:0; font-size:14px; width:22px; text-align:center; }
      .activity-item-content { flex:1; min-width:0; }
      .activity-item-title { font-size:12px; font-weight:500; color:var(--text-primary); word-break:break-word; }
      .activity-item-time { font-size:11px; color:var(--text-muted); flex-shrink:0; }
      @keyframes newItemFlash { 0%{background:rgba(16,185,129,.18); border-left-color:#10b981} 100%{background:transparent; border-left-color:transparent} }
      .activity-item-new { animation: newItemFlash 2.4s ease-out both; }

      .recent-session-item { display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; margin-bottom:6px; cursor:pointer; transition:all .2s; animation: ccSlideUp .4s both; }
      .recent-session-item:hover { background:var(--accent-primary-muted); transform:translateX(2px); }
      .session-avatar { width:32px; height:32px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:white; flex-shrink:0; }
      .session-info { flex:1; min-width:0; }
      .session-info-visitor { font-size:12px; font-weight:500; color:var(--text-primary); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; }
      .session-info-meta { font-size:11px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .dim { color:var(--text-muted); font-weight:500; }
      .live-dot { width:6px; height:6px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; animation: dotPulse 1.5s ease-in-out infinite; display:inline-block; }

      /* Responsive */
      @media (max-width: 1200px) {
        .infra-grid { grid-template-columns:repeat(4, 1fr); }
      }
      @media (max-width: 1024px) {
        .charts-row { grid-template-columns:1fr; }
        .infra-grid { grid-template-columns:repeat(4, 1fr); }
        .alerts-grid { grid-template-columns:repeat(2, 1fr); }
      }
      @media (max-width: 768px) {
        .page-header { flex-direction:column; }
        .stats-grid { grid-template-columns:repeat(2, 1fr); }
        .infra-grid { grid-template-columns:repeat(2, 1fr); }
        .ops-row, .bottom-row { grid-template-columns:1fr; }
      }
      @media (max-width: 480px) {
        .stats-grid { grid-template-columns:1fr; }
        .alerts-grid { grid-template-columns:repeat(2, 1fr); }
      }

      @media (prefers-reduced-motion: reduce) {
        .cc-fade-in, .cc-slide-up, .stat-card, .server-pill, .alert-tile, .funnel-row, .geo-row, .capture-row, .ops-row-item, .recent-session-item { animation:none !important; }
        .funnel-fill, .geo-bar { transition:none !important; }
        .pulse-dot, .server-dot, .capture-dot, .live-dot { animation:none !important; }
      }
    </style>`;
  }

  return { render, init, cleanup };
})();
