/**
 * ALP - Analytics Page Module
 * Date range, website filter, charts, tables, breakdowns
 */
const AnalyticsPage = (() => {
  let charts = {};
  let currentRange = 'today';
  let currentWebsite = '';

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
            <h1 class="page-title">Analytics</h1>
            <p class="page-subtitle">Detailed insights across your websites</p>
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
            <div class="stat-icon" style="background:rgba(99,102,241,0.12);color:#6366f1;">
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
            <div class="chart-container" style="height:220px;"><canvas id="browsers-chart"></canvas></div>
          </div>
          <div class="card stagger-item">
            <div class="card-header"><h3>Devices</h3></div>
            <div class="chart-container" style="height:220px;"><canvas id="devices-chart"></canvas></div>
          </div>
          <div class="card stagger-item">
            <div class="card-header"><h3>Countries</h3></div>
            <div class="chart-container" style="height:220px;"><canvas id="countries-chart"></canvas></div>
          </div>
        </div>
      </div>

      <style>
        .analytics-page { max-width: 1400px; margin: 0 auto; }
        .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
        .page-title { font-size:26px; font-weight:700; color:var(--text-primary); margin:0 0 4px; }
        .page-subtitle { font-size:14px; color:var(--text-secondary); margin:0; }
        .header-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

        .date-range-tabs { display:flex; background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; overflow:hidden; }
        .range-tab {
          padding:8px 16px; font-size:13px; font-weight:500; color:var(--text-secondary);
          background:transparent; border:none; cursor:pointer; transition:all 0.15s; font-family:'Inter',sans-serif;
        }
        .range-tab:hover { color:var(--text-primary); }
        .range-tab.active { background:#6366f1; color:#fff; }

        .filter-select {
          background:rgba(255,255,255,0.04); border:1px solid var(--border-color);
          color:var(--text-secondary); border-radius:8px; padding:9px 32px 9px 14px;
          font-size:13px; font-family:'Inter',sans-serif; cursor:pointer; appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
        }

        .custom-date-row { display:flex; align-items:center; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
        .form-input {
          padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid var(--border-color);
          border-radius:8px; color:var(--text-primary); font-size:13px; font-family:'Inter',sans-serif; outline:none;
        }
        .form-input:focus { border-color:#6366f1; }
        .btn { display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; font-family:'Inter',sans-serif; border:none; }
        .btn-sm { padding:8px 14px; font-size:12px; }
        .btn-primary { background:#6366f1; color:#fff; }
        .btn-primary:hover { background:#5558e6; }

        .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-bottom:24px; }
        .stat-card {
          background:var(--card-bg); border:1px solid var(--border-color); border-radius:14px;
          padding:20px; display:flex; align-items:center; gap:16px; transition:all 0.2s;
        }
        .stat-card:hover { border-color:rgba(99,102,241,0.25); transform:translateY(-2px); }
        .stat-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .stat-info { flex:1; }
        .stat-number { font-size:26px; font-weight:700; color:var(--text-primary); line-height:1.2; }
        .stat-label { font-size:12px; color:var(--text-secondary); margin-top:2px; }

        .card { background:var(--card-bg); border:1px solid var(--border-color); border-radius:14px; padding:22px; }
        .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .card-header h3 { font-size:15px; font-weight:600; color:var(--text-primary); margin:0; }
        .chart-container { position:relative; }

        .analytics-two-col { display:flex; gap:20px; margin:24px 0; flex-wrap:wrap; }
        .analytics-two-col .card { flex:1; min-width:320px; }
        .analytics-table-wrap { overflow-x:auto; }
        .analytics-table { width:100%; border-collapse:collapse; }
        .analytics-table th { text-align:left; font-size:11px; font-weight:600; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; padding:8px 12px; border-bottom:1px solid var(--border-color); }
        .analytics-table td { padding:10px 12px; font-size:13px; color:var(--text-primary); border-bottom:1px solid rgba(255,255,255,0.03); }
        .analytics-table tbody tr:hover { background:rgba(99,102,241,0.04); }
        .analytics-table .page-url { max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pct-bar { display:flex; align-items:center; gap:8px; min-width:120px; }
        .pct-bar-track { flex:1; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; }
        .pct-bar-fill { height:100%; background:#6366f1; border-radius:3px; transition:width 0.3s; }
        .pct-bar-label { font-size:12px; color:var(--text-tertiary); min-width:32px; text-align:right; }

        .analytics-donuts-row { display:flex; gap:20px; margin-top:24px; flex-wrap:wrap; }
        .analytics-donuts-row .card { flex:1; min-width:260px; }

        .stagger-item { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .stagger-item:nth-child(1) { animation-delay:0.05s; }
        .stagger-item:nth-child(2) { animation-delay:0.1s; }
        .stagger-item:nth-child(3) { animation-delay:0.15s; }
        .stagger-item:nth-child(4) { animation-delay:0.2s; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .page-enter { animation: fadeUp 0.3s ease both; }

        @media (max-width:768px) {
          .analytics-two-col, .analytics-donuts-row { flex-direction:column; }
          .stats-grid { grid-template-columns:repeat(2,1fr); }
        }
      </style>
    `;
  }

  // --- Charts ---
  const chartColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

  function createOrUpdateChart(id, type, labels, dataValues, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    const isDoughnut = type === 'doughnut';
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
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.08)',
            fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2
          })
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: isDoughnut ? { position: 'bottom', labels: { color: '#9ca3af', padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } : { display: false }
        },
        ...(isDoughnut ? {} : {
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0 } }
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
  }

  function destroy() {
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};
    currentRange = 'today';
    currentWebsite = '';
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') {
  window.AnalyticsPage = AnalyticsPage;
}
