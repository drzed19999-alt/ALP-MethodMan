/**
 * ALP - Analytics Page Module
 * Date range, website filter, charts, tables, breakdowns
 */
const AnalyticsPage = (() => {
  let charts = {};
  let lastChartsData = {};
  let currentRange = 'today';
  let currentWebsite = '';
  let _onThemeChange = null;

  function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function formatDuration(ms) {
    if (!ms || ms < 1000) return '0s';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function render() {
    return `
      <div class="analytics-page page-enter">
        <div class="page-header">
          <div>
            <div class="ph" style="--ph-accent:#a78bfa;--ph-glow:rgba(167,139,250,0.5)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>INTEL · ANALYTICS</div>
              <h1 class="ph-title"><span class="ph-title-glyph">◈</span><span class="ph-title-text">Intel</span></h1>
              <p class="ph-sub">Detailed insights and traffic patterns across your websites</p>
            </div>
          </div>
          <div class="header-actions">
            <div class="date-range-tabs" id="date-range-tabs">
              <button class="range-tab active" data-range="today">Today</button>
              <button class="range-tab" data-range="7d">7 Days</button>
              <button class="range-tab" data-range="30d">30 Days</button>
              <button class="range-tab" data-range="custom">Custom</button>
            </div>
            <select id="analytics-website" class="filter-select">
              <option value="">All Websites</option>
            </select>
          </div>
        </div>

        <!-- Custom date (hidden by default) -->
        <div class="custom-date-row" id="custom-date-row" style="display:none;">
          <input type="date" id="date-from" class="form-input" />
          <span style="color:var(--text-tertiary);">to</span>
          <input type="date" id="date-to" class="form-input" />
          <button class="btn btn-sm btn-primary" id="apply-custom-date">Apply</button>
        </div>

        <!-- Stat Cards -->
        <div class="stats-grid" id="analytics-stats">
          <div class="stat-card stagger-item">
            <div class="stat-icon" style="background:rgba(212,175,55,0.1);color:#D4AF37;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-number" id="stat-visitors">0</div>
              <div class="stat-label">Total Visitors</div>
            </div>
          </div>
          <div class="stat-card stagger-item">
            <div class="stat-icon" style="background:rgba(16,185,129,0.12);color:#10b981;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-number" id="stat-pageviews">0</div>
              <div class="stat-label">Page Views</div>
            </div>
          </div>
          <div class="stat-card stagger-item">
            <div class="stat-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-number" id="stat-duration">0s</div>
              <div class="stat-label">Avg Duration</div>
            </div>
          </div>
          <div class="stat-card stagger-item">
            <div class="stat-icon" style="background:rgba(239,68,68,0.12);color:#ef4444;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-number" id="stat-bounce">0%</div>
              <div class="stat-label">Bounce Rate</div>
            </div>
          </div>
        </div>

        <!-- Main Chart -->
        <div class="card stagger-item" style="margin-bottom:24px;">
          <div class="card-header">
            <h3>Visitors Over Time</h3>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="visitors-chart"></canvas>
          </div>
        </div>

        <!-- Two Columns: Top Pages + Top Referrers -->
        <div class="analytics-two-col">
          <div class="card stagger-item">
            <div class="card-header"><h3>Top Pages</h3></div>
            <div class="analytics-table-wrap">
              <table class="analytics-table" id="top-pages-table">
                <thead><tr><th>Page</th><th>Views</th><th>Avg Duration</th></tr></thead>
                <tbody id="top-pages-body"><tr><td colspan="3" style="text-align:center;color:var(--text-tertiary);padding:30px;">Loading…</td></tr></tbody>
              </table>
            </div>
          </div>
          <div class="card stagger-item">
            <div class="card-header"><h3>Top Referrers</h3></div>
            <div class="analytics-table-wrap">
              <table class="analytics-table" id="top-referrers-table">
                <thead><tr><th>Referrer</th><th>Visits</th><th></th></tr></thead>
                <tbody id="top-referrers-body"><tr><td colspan="3" style="text-align:center;color:var(--text-tertiary);padding:30px;">Loading…</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Doughnut Charts Row -->
        <div class="analytics-donuts-row">
          <div class="card stagger-item">
            <div class="card-header"><h3>Browsers</h3></div>
            <div class="chart-container" style="height:260px;"><canvas id="browsers-chart"></canvas></div>
          </div>
          <div class="card stagger-item">
            <div class="card-header"><h3>Devices</h3></div>
            <div class="chart-container" style="height:260px;"><canvas id="devices-chart"></canvas></div>
          </div>
          <div class="card stagger-item">
            <div class="card-header"><h3>Countries</h3></div>
            <div class="chart-container" style="height:260px;"><canvas id="countries-chart"></canvas></div>
          </div>
        </div>
      </div>

      <style>
        .analytics-page { max-width: 1400px; margin: 0 auto; min-width: 0; }
        .analytics-page .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
        .analytics-page .header-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; max-width:100%; }

        .analytics-page .date-range-tabs { display:flex; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:10px; overflow:hidden; max-width:100%; }
        .analytics-page .range-tab {
          padding:8px 14px; font-size:13px; font-weight:500; color:var(--text-secondary);
          background:transparent; border:none; cursor:pointer; transition:all 0.15s; font-family:'Inter',sans-serif; white-space:nowrap;
        }
        .analytics-page .range-tab:hover { color:var(--text-primary); }
        .analytics-page .range-tab.active { background:var(--accent-primary); color:var(--text-inverse); font-weight:600; }

        .analytics-page .filter-select {
          background-color:var(--bg-input); border:1px solid var(--border-primary);
          color:var(--text-secondary); border-radius:8px; padding:9px 32px 9px 14px;
          font-size:13px; font-family:'Inter',sans-serif; cursor:pointer; appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
        }

        .analytics-page .custom-date-row { display:flex; align-items:center; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
        .analytics-page .custom-date-row .form-input { width:auto; flex:1 1 140px; max-width:200px; }

        .analytics-page .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:16px; margin-bottom:24px; }
        .analytics-page .stat-card {
          background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:14px;
          padding:20px; display:flex; align-items:center; gap:16px; transition:all 0.2s; min-width:0;
          box-shadow: var(--shadow-card);
        }
        .analytics-page .stat-card:hover { border-color:color-mix(in oklab, var(--accent-primary) 40%, transparent); transform:translateY(-2px); box-shadow:var(--shadow-card-lift); }
        .analytics-page .stat-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .analytics-page .stat-info { flex:1; min-width:0; }
        .analytics-page .stat-number { font-size:26px; font-weight:700; color:var(--text-primary); line-height:1.2; overflow:hidden; text-overflow:ellipsis; }
        .analytics-page .stat-label { font-size:12px; color:var(--text-secondary); margin-top:2px; }

        .analytics-page .card { background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:14px; padding:22px; min-width:0; }
        .analytics-page .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .analytics-page .card-header h3 { font-size:15px; font-weight:600; color:var(--text-primary); margin:0; }
        .analytics-page .chart-container { position:relative; min-width:0; }

        .analytics-page .analytics-two-col { display:flex; gap:20px; margin:24px 0; flex-wrap:wrap; }
        .analytics-page .analytics-two-col .card { flex:1; min-width:min(320px, 100%); }
        .analytics-page .analytics-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%; }
        .analytics-page .analytics-table { width:100%; border-collapse:collapse; }
        .analytics-page .analytics-table th { text-align:left; font-size:11px; font-weight:600; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; padding:8px 12px; border-bottom:1px solid var(--border-primary); white-space:nowrap; }
        .analytics-page .analytics-table td { padding:10px 12px; font-size:13px; color:var(--text-primary); border-bottom:1px solid var(--border-subtle); }
        .analytics-page .analytics-table tbody tr:hover { background:var(--bg-hover); }
        .analytics-page .analytics-table .page-url { display:block; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .analytics-page .pct-bar { display:flex; align-items:center; gap:8px; min-width:110px; }
        .analytics-page .pct-bar-track { flex:1; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden; }
        .analytics-page .pct-bar-fill { height:100%; background:var(--accent-primary); border-radius:3px; transition:width 0.3s; }
        .analytics-page .pct-bar-label { font-size:12px; color:var(--text-tertiary); min-width:32px; text-align:right; }

        .analytics-page .analytics-donuts-row { display:flex; gap:20px; margin-top:24px; flex-wrap:wrap; }
        .analytics-page .analytics-donuts-row .card { flex:1; min-width:min(260px, 100%); }

        .analytics-page .stagger-item { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .analytics-page .stagger-item:nth-child(1) { animation-delay:0.05s; }
        .analytics-page .stagger-item:nth-child(2) { animation-delay:0.1s; }
        .analytics-page .stagger-item:nth-child(3) { animation-delay:0.15s; }
        .analytics-page .stagger-item:nth-child(4) { animation-delay:0.2s; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }

        @media (max-width:768px) {
          .analytics-page .analytics-two-col, .analytics-page .analytics-donuts-row { flex-direction:column; }
          .analytics-page .analytics-two-col .card,
          .analytics-page .analytics-donuts-row .card { min-width:0; width:100%; }
          .analytics-page .stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
          .analytics-page .card { padding:16px; }
        }
        @media (max-width:480px) {
          .analytics-page .header-actions { width:100%; }
          .analytics-page .date-range-tabs { width:100%; }
          .analytics-page .range-tab { flex:1; padding:8px 6px; font-size:11.5px; text-align:center; }
          .analytics-page .filter-select { width:100%; }
          .analytics-page .stats-grid { gap:10px; }
          .analytics-page .stat-card { padding:14px 12px; gap:10px; }
          .analytics-page .stat-icon { width:36px; height:36px; }
          .analytics-page .stat-number { font-size:20px; }
          .analytics-page .analytics-table .page-url { max-width:150px; }
        }
      </style>
    `;
  }

  // --- Charts ---
  const chartColors = ['#D4AF37','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

  function getChartTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent-primary').trim() || (isLight ? '#0F172A' : '#D4AF37');
    const tickColor = cs.getPropertyValue('--text-tertiary').trim() || (isLight ? '#475569' : '#94a3b8');
    const gridColor = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.05)';
    const fillBg = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(212,175,55,0.12)';
    return { accent, tickColor, gridColor, fillBg };
  }

  function createOrUpdateChart(id, type, labels, dataValues, label) {
    lastChartsData[id] = { type, labels, dataValues, label };
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    const isDoughnut = type === 'doughnut';
    const theme = getChartTheme();
    const isNarrow = window.innerWidth < 640;
    charts[id] = new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{
          label: label || '',
          data: dataValues,
          ...(isDoughnut ? {
            backgroundColor: chartColors.slice(0, labels.length),
            borderWidth: 0
          } : {
            borderColor: theme.accent,
            backgroundColor: theme.fillBg,
            fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2
          })
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: isDoughnut ? { position: 'bottom', labels: { color: theme.tickColor, padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } : { display: false }
        },
        ...(isDoughnut ? {} : {
          scales: {
            x: { grid: { color: theme.gridColor }, ticks: { color: theme.tickColor, font: { size: 11 }, maxTicksLimit: isNarrow ? 6 : 12 } },
            y: { beginAtZero: true, grid: { color: theme.gridColor }, ticks: { color: theme.tickColor, font: { size: 11 }, precision: 0 } }
          },
          interaction: { intersect: false, mode: 'index' }
        })
      }
    });
  }

  // --- Data ---
  async function loadAnalytics() {
    try {
      const params = { range: currentRange, website_id: currentWebsite || undefined };
      // Custom date range
      if (currentRange === 'custom') {
        params.from = document.getElementById('date-from')?.value;
        params.to = document.getElementById('date-to')?.value;
        if (!params.from || !params.to) return;
      }
      const data = await window.ALPApi.getAnalytics(params);
      if (!data) return;

      // Stat cards
      const stats = data.stats || {};
      const setText = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      setText('stat-visitors', (stats.visitors || 0).toLocaleString());
      setText('stat-pageviews', (stats.pageViews || 0).toLocaleString());
      setText('stat-duration', formatDuration(stats.avgDuration || 0));
      setText('stat-bounce', (stats.bounceRate || 0) + '%');

      // Visitors chart
      if (data.visitorsChart) {
        createOrUpdateChart('visitors-chart', 'line',
          data.visitorsChart.map(d => d.label || d.hour || d.date),
          data.visitorsChart.map(d => d.count || d.value || 0),
          'Visitors'
        );
      }

      // Top pages table
      const pagesBody = document.getElementById('top-pages-body');
      if (pagesBody && data.topPages) {
        if (data.topPages.length === 0) {
          pagesBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-tertiary);padding:30px;">No data</td></tr>';
        } else {
          pagesBody.innerHTML = data.topPages.map(p => `
            <tr>
              <td><span class="page-url">${escapeHtml(p.page_url || p.page || '/')}</span></td>
              <td>${(p.views || p.count || 0).toLocaleString()}</td>
              <td>${formatDuration(p.avg_duration || p.avgDuration || 0)}</td>
            </tr>
          `).join('');
        }
      }

      // Top referrers table
      const refsBody = document.getElementById('top-referrers-body');
      if (refsBody && data.topReferrers) {
        const totalRefs = data.topReferrers.reduce((sum, r) => sum + (r.visits || r.count || 0), 0) || 1;
        if (data.topReferrers.length === 0) {
          refsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-tertiary);padding:30px;">No data</td></tr>';
        } else {
          refsBody.innerHTML = data.topReferrers.map(r => {
            const pct = Math.round(((r.visits || r.count || 0) / totalRefs) * 100);
            return `
              <tr>
                <td><span class="page-url">${escapeHtml(r.referrer || r.source || 'Direct')}</span></td>
                <td>${(r.visits || r.count || 0).toLocaleString()}</td>
                <td>
                  <div class="pct-bar">
                    <div class="pct-bar-track"><div class="pct-bar-fill" style="width:${pct}%"></div></div>
                    <span class="pct-bar-label">${pct}%</span>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Doughnut charts
      if (data.browsers) {
        const items = data.browsers.slice(0, 6);
        createOrUpdateChart('browsers-chart', 'doughnut',
          items.map(b => b.name || b.browser || 'Unknown'),
          items.map(b => b.count || b.value || 0)
        );
      }
      if (data.devices) {
        createOrUpdateChart('devices-chart', 'doughnut',
          data.devices.map(d => d.name || d.device || 'Unknown'),
          data.devices.map(d => d.count || d.value || 0)
        );
      }
      if (data.countries) {
        const items = data.countries.slice(0, 5);
        const otherCount = data.countries.slice(5).reduce((s, c) => s + (c.count || c.value || 0), 0);
        const labels = items.map(c => c.name || c.country || 'Unknown');
        const values = items.map(c => c.count || c.value || 0);
        if (otherCount > 0) { labels.push('Other'); values.push(otherCount); }
        createOrUpdateChart('countries-chart', 'doughnut', labels, values);
      }

    } catch (err) {
      console.error('Analytics load error:', err);
    }
  }

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      const websites = data.websites || data || [];
      const select = document.getElementById('analytics-website');
      if (select) {
        websites.forEach(w => {
          const opt = document.createElement('option');
          opt.value = w.id;
          opt.textContent = w.name || w.domain;
          select.appendChild(opt);
        });
      }
    } catch (e) { /* ignore */ }
  }

  // --- Init ---
  function init() {
    loadWebsites();
    loadAnalytics();

    // Date range tabs
    const tabs = document.getElementById('date-range-tabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.range-tab');
        if (!tab) return;
        tabs.querySelectorAll('.range-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentRange = tab.dataset.range;

        const customRow = document.getElementById('custom-date-row');
        if (customRow) customRow.style.display = currentRange === 'custom' ? 'flex' : 'none';

        if (currentRange !== 'custom') loadAnalytics();
      });
    }

    // Custom date apply
    const applyBtn = document.getElementById('apply-custom-date');
    if (applyBtn) applyBtn.addEventListener('click', () => loadAnalytics());

    // Website filter
    const websiteSelect = document.getElementById('analytics-website');
    if (websiteSelect) websiteSelect.addEventListener('change', () => { currentWebsite = websiteSelect.value; loadAnalytics(); });

    // Re-theme active charts live on Light/Dark theme switch
    _onThemeChange = () => {
      Object.entries(lastChartsData).forEach(([id, cfg]) => {
        createOrUpdateChart(id, cfg.type, cfg.labels, cfg.dataValues, cfg.label);
      });
    };
    window.addEventListener('alp:theme-change', _onThemeChange);
  }

  function destroy() {
    if (_onThemeChange) {
      window.removeEventListener('alp:theme-change', _onThemeChange);
      _onThemeChange = null;
    }
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};
    lastChartsData = {};
    currentRange = 'today';
    currentWebsite = '';
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') {
  window.AnalyticsPage = AnalyticsPage;
}
