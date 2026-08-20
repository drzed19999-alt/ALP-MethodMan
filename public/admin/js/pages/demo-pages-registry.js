/**
 * demo-pages-registry.js
 * Registry-tab logic: page card render, grid paint, bulk selection/delete/export,
 * Preview modal, Analytics modal, Orphaned-pages detection & cleanup.
 * Depends on: window.DemoPagesState, DemoPagesFields, DemoPagesModals, showModal, showToast.
 */
'use strict';
window.DemoPagesRegistry = (() => {
  function S() { return window.DemoPagesState; }
  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function $(id) { return document.getElementById(id); }
  function getTypeInfo(v) { return window.DemoPagesFields.getTypeInfo(v); }
  function renderFieldPills(fields) {
    if (!Array.isArray(fields) || !fields.length) return '<span style="font-size:11px;color:var(--text-placeholder);">None</span>';
    return fields.slice(0, 4).map(f => `<span class="dp-field-pill">${esc(f.label||f.canonical||f)}</span>`).join('') +
      (fields.length > 4 ? `<span class="dp-field-pill dp-field-pill--more">+${fields.length - 4}</span>` : '');
  }

  // ── Page card HTML ─────────────────────────────────────────────────────────
  function _hexRgb(hex) {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function renderCard(p, idx) {
    const type = getTypeInfo(p.form_type);
    const fields = Array.isArray(p.fields_schema) ? p.fields_schema : [];
    const isSelected = S().selectedPageIds.has(p.id);
    const [cr, cg, cb] = _hexRgb(type.color);
    const cardBg = `linear-gradient(145deg,rgba(${cr},${cg},${cb},.1),rgba(${cr},${cg},${cb},.04))`;
    const cardBorder = `rgba(${cr},${cg},${cb},.28)`;

    // Quick stats
    const views = p.views_count || 0;
    const subs = p.submissions_count || 0;
    const convRate = views > 0 ? ((subs / views) * 100).toFixed(0) : 0;
    let lastActStr = '';
    if (p.last_activity_at) {
      const diff = Date.now() - new Date(p.last_activity_at);
      const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
      lastActStr = m < 1 ? 'just now' : m < 60 ? `${m}m ago` : h < 24 ? `${h}h ago` : `${d}d ago`;
    }

    return `
      <div class="dp-card ${isSelected ? 'dp-card--selected' : ''}" data-id="${p.id}" style="--dp-accent:${type.color};animation-delay:${Math.min(idx * .06, .4)}s;background:${cardBg};border-color:${cardBorder};">
        <input type="checkbox" class="dp-bulk-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
        <div class="dp-card-head">
          <div class="dp-card-name">${esc(p.name)}</div>
          <span class="dp-type-badge" style="background:${type.bg};color:${type.color};">${type.label}</span>
        </div>
        <div class="dp-url-row">
          <div class="dp-url-path" title="${esc(p.url)}">${esc(p.url)}</div>
          <button class="dp-icon-btn dp-copy-btn" data-url="${esc(p.url)}" title="Copy">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <a class="dp-icon-btn" href="${esc(p.url)}" target="_blank" title="Open">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
        <div class="dp-card-mini-stats">
          <span class="dp-mini-stat" title="Total views">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ${views.toLocaleString()}
          </span>
          <span class="dp-mini-stat dp-mini-stat--g" title="Submissions">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ${subs.toLocaleString()}
          </span>
          ${views > 0 ? `<span class="dp-mini-stat dp-mini-stat--gold" title="Conversion rate">${convRate}%</span>` : `<span class="dp-mini-stat dp-mini-stat--muted">—</span>`}
          ${lastActStr ? `<span class="dp-mini-stat dp-mini-stat--muted" title="Last activity">${lastActStr}</span>` : ''}
        </div>
        <div>
          <div class="dp-fields-label">Captured Fields</div>
          <div class="dp-fields-row">${renderFieldPills(fields)}</div>
        </div>
        <div class="dp-card-actions">
          <button class="dp-btn dp-btn-preview dp-preview-btn" data-id="${p.id}" data-url="${esc(p.url)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>Preview
          </button>
          <button class="dp-btn dp-btn-analytics dp-analytics-btn" data-id="${p.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="16"/>
            </svg>Analytics
          </button>
          <button class="dp-btn dp-btn-edit dp-edit-btn" data-id="${p.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>Edit
          </button>
          <button class="dp-btn dp-btn-delete dp-delete-btn" data-id="${p.id}" data-name="${esc(p.name)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>Delete
          </button>
        </div>
      </div>`;
  }

  // ── Grid ───────────────────────────────────────────────────────────────────
  function repaintGrid() {
    const grid = $('dp-grid'); if (!grid) return;
    const countEl = $('dp-tab-reg-count'); if (countEl) countEl.textContent = S().pages.length || '';
    if (!S().pages.length) {
      grid.innerHTML = `<div class="dp-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>
        </svg>
        <p>No pages yet &mdash; click <strong>Add Page Entry</strong>.</p>
      </div>`;
      hideBulkToolbar();
      return;
    }
    grid.innerHTML = S().pages.map((p, i) => renderCard(p, i)).join('');
    bindCardEvents();
    updateBulkToolbar();
  }

  function bindCardEvents() {
    document.querySelectorAll('.dp-copy-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      window.copyToClipboard(b.dataset.url, 'URL copied!');
      b.classList.add('copied'); setTimeout(() => b.classList.remove('copied'), 1500);
    }));
    document.querySelectorAll('.dp-preview-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); showPreviewModal(parseInt(b.dataset.id, 10), b.dataset.url);
    }));
    document.querySelectorAll('.dp-analytics-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); showAnalyticsModal(parseInt(b.dataset.id, 10));
    }));
    document.querySelectorAll('.dp-edit-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); window.DemoPagesModals.openEditModal(parseInt(b.dataset.id, 10));
    }));
    document.querySelectorAll('.dp-delete-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); window.DemoPagesModals.openDeleteModal(parseInt(b.dataset.id, 10), b.dataset.name);
    }));
    document.querySelectorAll('.dp-bulk-checkbox').forEach(cb => {
      cb.addEventListener('change', e => {
        const pageId = parseInt(cb.dataset.id, 10);
        cb.checked ? S().selectedPageIds.add(pageId) : S().selectedPageIds.delete(pageId);
        cb.closest('.dp-card')?.classList.toggle('dp-card--selected', cb.checked);
        updateBulkToolbar();
      });
    });
  }

  // ── Bulk Operations ────────────────────────────────────────────────────────
  function updateBulkToolbar() {
    const count = S().selectedPageIds.size;
    const toolbar = $('dp-bulk-toolbar');
    const selectAllBtn = $('dp-select-all-btn');
    if (count > 0) {
      if (!toolbar) { createBulkToolbar(); }
      else { toolbar.style.display = 'flex'; const cs = toolbar.querySelector('.dp-bulk-count'); if (cs) cs.textContent = count; }
    } else {
      if (toolbar) toolbar.style.display = 'none';
    }
    if (selectAllBtn) {
      const allSelected = S().pages.length > 0 && S().selectedPageIds.size === S().pages.length;
      selectAllBtn.innerHTML = allSelected
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Deselect All'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Select All';
    }
  }

  function createBulkToolbar() {
    const regPanel = $('dp-panel-registry'); if (!regPanel) return;
    const panelInner = regPanel.querySelector('.dp-panel-inner'); if (!panelInner) return;
    if ($('dp-bulk-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'dp-bulk-toolbar'; toolbar.className = 'dp-bulk-toolbar';
    toolbar.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex:1;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        <span style="font-size:13px;font-weight:700;color:var(--text-primary);"><span class="dp-bulk-count">0</span> selected</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="dp-bulk-delete-btn" class="dp-bulk-action-btn dp-bulk-action-btn--danger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>Delete
        </button>
        <button id="dp-bulk-export-btn" class="dp-bulk-action-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>Export JSON
        </button>
        <button id="dp-bulk-cancel-btn" class="dp-bulk-action-btn dp-bulk-action-btn--ghost">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>Cancel
        </button>
      </div>`;
    const header = panelInner.querySelector('div[style*="display:flex"]');
    panelInner.insertBefore(toolbar, header || panelInner.firstChild);
    $('dp-bulk-delete-btn')?.addEventListener('click', bulkDeletePages);
    $('dp-bulk-export-btn')?.addEventListener('click', bulkExportPages);
    $('dp-bulk-cancel-btn')?.addEventListener('click', clearBulkSelection);
  }

  function hideBulkToolbar() { const t = $('dp-bulk-toolbar'); if (t) t.style.display = 'none'; }

  function clearBulkSelection() {
    S().selectedPageIds.clear();
    document.querySelectorAll('.dp-bulk-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.dp-card--selected').forEach(card => card.classList.remove('dp-card--selected'));
    updateBulkToolbar();
  }

  async function bulkDeletePages() {
    const ids = Array.from(S().selectedPageIds); if (!ids.length) return;
    window.showModal({
      title: 'Delete Multiple Pages', type: 'danger', width: '520px',
      content: `
        <p style="font-size:14px;color:var(--text-secondary);margin:0 0 14px;">
          Delete <strong style="color:var(--text-primary);">${ids.length} page${ids.length !== 1 ? 's' : ''}</strong>?
        </p>
        <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:12px 14px;">
          <div style="font-size:12px;color:var(--text-secondary);">
            ${S().pages.filter(p => ids.includes(p.id)).map(p => `<div style="margin-bottom:4px;">&bull; ${esc(p.name)}</div>`).join('')}
          </div>
        </div>`,
      confirmText: `Delete ${ids.length} Page${ids.length !== 1 ? 's' : ''}`,
      onConfirm: async () => {
        try {
          await window.ALPApi.bulkDeletePages(ids);
          window.showToast(`Deleted ${ids.length} page${ids.length !== 1 ? 's' : ''}`, 'success');
          S().pages = S().pages.filter(p => !ids.includes(p.id));
          clearBulkSelection(); repaintGrid();
        } catch (err) { window.showToast('Bulk delete failed: ' + err.message, 'error'); }
      }
    });
  }

  async function bulkExportPages() {
    const ids = Array.from(S().selectedPageIds); if (!ids.length) return;
    const selectedPages = S().pages.filter(p => ids.includes(p.id));
    const data = JSON.stringify({ exported_at: new Date().toISOString(), website_id: S().selectedWebsiteId,
      pages: selectedPages.map(p => ({ name: p.name, url: p.url, form_type: p.form_type, fields_schema: p.fields_schema, created_at: p.created_at }))
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `pages-export-${Date.now()}.json` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    window.showToast(`Exported ${ids.length} page${ids.length !== 1 ? 's' : ''} to JSON`, 'success');
  }

  // ── Preview Modal ──────────────────────────────────────────────────────────
  function showPreviewModal(pageId, pageUrl) {
    const page = S().pages.find(p => p.id === pageId); if (!page) return;
    const previewUrl = pageUrl + (pageUrl.includes('?') ? '&' : '?') + '_alp_preview=1';
    window.showModal({
      title: `Preview: ${page.name}`, width: '90vw', maxWidth: '1400px',
      content: `
        <div id="dp-preview-controls" style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;">
          <div style="flex:1;display:flex;align-items:center;gap:8px;">
            <button class="dp-preview-size-btn dp-preview-size-btn--active" data-width="100%">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Desktop
            </button>
            <button class="dp-preview-size-btn" data-width="768px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="18" x2="15" y2="18"/></svg>Tablet
            </button>
            <button class="dp-preview-size-btn" data-width="375px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="1" width="6" height="22" rx="2"/><line x1="11" y1="19" x2="13" y2="19"/></svg>Mobile
            </button>
          </div>
          <button id="dp-preview-refresh" style="padding:7px 14px;background:rgba(99,102,241,.1);color:#818cf8;border:1px solid rgba(99,102,241,.2);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">Refresh</button>
          <a href="${esc(previewUrl)}" target="_blank" style="padding:7px 14px;background:rgba(16,185,129,.1);color:#6ee7b7;border:1px solid rgba(16,185,129,.2);border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;font-family:'Inter',sans-serif;display:inline-flex;align-items:center;gap:5px;">Open in Tab</a>
        </div>
        <div id="dp-preview-frame-wrap" style="width:100%;height:650px;border:1px solid rgba(255,255,255,.12);border-radius:10px;overflow:hidden;background:rgba(0,0,0,.3);transition:all .3s;">
          <iframe id="dp-preview-iframe" src="${esc(previewUrl)}" style="width:100%;height:100%;border:none;background:#fff;"></iframe>
        </div>`,
      confirmText: 'Close', hideCancel: true, onConfirm: () => {}
    });
    setTimeout(() => {
      const wrap = $('dp-preview-frame-wrap'); const iframe = $('dp-preview-iframe');
      document.querySelectorAll('.dp-preview-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.dp-preview-size-btn').forEach(b => b.classList.remove('dp-preview-size-btn--active'));
          btn.classList.add('dp-preview-size-btn--active');
          if (wrap) wrap.style.width = btn.dataset.width;
        });
      });
      $('dp-preview-refresh')?.addEventListener('click', () => { if (iframe) iframe.src = iframe.src; });
    }, 100);
  }

  // ── Analytics Modal ────────────────────────────────────────────────────────
  async function showAnalyticsModal(pageId) {
    const page = S().pages.find(p => p.id === pageId); if (!page) return;
    window.showModal({
      title: `Analytics: ${page.name}`, width: '900px',
      content: `<div style="display:flex;align-items:center;justify-content:center;padding:40px;">
        <div style="animation:dpSpin 1s linear infinite;color:#818cf8;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        </div>
        <span style="margin-left:12px;color:var(--text-secondary);font-size:14px;">Loading analytics...</span>
      </div>`,
      confirmText: 'Close', hideCancel: true, onConfirm: () => {}
    });
    try {
      const analytics = await window.ALPApi.getPageAnalytics(pageId);
      const stats = analytics.stats || {};
      const viewsByDay = analytics.viewsByDay || [];
      const labels = viewsByDay.map(d => { const dt = new Date(d.date); return `${dt.getMonth()+1}/${dt.getDate()}`; });
      const viewData = viewsByDay.map(d => d.count);
      const convRate = stats.views > 0 ? ((stats.submissions / stats.views) * 100).toFixed(1) : '0.0';
      let lastStr = 'Never';
      if (stats.lastActivity) {
        const diffMs = Date.now() - new Date(stats.lastActivity);
        const m = Math.floor(diffMs/60000), h = Math.floor(diffMs/3600000), d = Math.floor(diffMs/86400000);
        lastStr = m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : h < 24 ? `${h} hour${h!==1?'s':''} ago` : `${d} day${d!==1?'s':''} ago`;
      }
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        const contentDiv = modalContent.querySelector('.modal-body > div');
        if (contentDiv) {
          contentDiv.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;">
              <div class="dp-analytics-stat" style="padding:16px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15);border-radius:12px;">
                <div style="font-size:11px;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">Total Views</div>
                <div style="font-size:28px;font-weight:800;color:#a5b4fc;">${stats.views || 0}</div>
              </div>
              <div class="dp-analytics-stat" style="padding:16px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);border-radius:12px;">
                <div style="font-size:11px;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">Submissions</div>
                <div style="font-size:28px;font-weight:800;color:#6ee7b7;">${stats.submissions || 0}</div>
              </div>
              <div class="dp-analytics-stat" style="padding:16px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.15);border-radius:12px;">
                <div style="font-size:11px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">Conversion</div>
                <div style="font-size:28px;font-weight:800;color:#fcd34d;">${convRate}%</div>
              </div>
            </div>
            <div style="padding:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;margin-bottom:20px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">Views (Last 30 Days)</div>
              <canvas id="dp-analytics-chart" width="800" height="250"></canvas>
            </div>
            <div style="display:flex;align-items:center;gap:20px;padding:14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;">
              <div style="flex:1;"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:3px;">Last Activity</div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">${lastStr}</div></div>
              <div style="flex:1;"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:3px;">Created</div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">${stats.createdAt ? new Date(stats.createdAt).toLocaleDateString() : 'Unknown'}</div></div>
            </div>`;
          setTimeout(() => {
            const canvas = $('dp-analytics-chart'); if (!canvas) return;
            const ctx = canvas.getContext('2d'); if (!ctx) return;
            const pad = 40, w = canvas.width - pad * 2, h = canvas.height - pad * 2, max = Math.max(...viewData, 1);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) { const y = pad + (h / 5) * i; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(canvas.width - pad, y); ctx.stroke(); }
            if (viewData.length > 0) {
              ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2.5; ctx.beginPath();
              viewData.forEach((val, idx) => { const x = pad + (w / (viewData.length - 1 || 1)) * idx; const y = pad + h - (val / max) * h; idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
              ctx.stroke();
              viewData.forEach((val, idx) => { const x = pad + (w / (viewData.length - 1 || 1)) * idx; const y = pad + h - (val / max) * h; ctx.fillStyle = '#6366f1'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
            }
            ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
            labels.forEach((label, idx) => { if (idx % Math.ceil(labels.length / 10) === 0) { const x = pad + (w / (viewData.length - 1 || 1)) * idx; ctx.fillText(label, x, canvas.height - pad + 18); } });
            ctx.textAlign = 'right';
            for (let i = 0; i <= 5; i++) { const y = pad + (h / 5) * i; ctx.fillText(Math.round((max / 5) * (5 - i)), pad - 10, y + 4); }
          }, 50);
        }
      }
    } catch (err) {
      window.showToast('Failed to load analytics: ' + err.message, 'error');
      document.querySelector('.modal-overlay')?.click();
    }
  }

  // ── Orphaned Pages ─────────────────────────────────────────────────────────
  async function checkOrphanedPages() {
    if (!S().selectedWebsiteId) return;
    try {
      const data = await window.ALPApi.getOrphanedPages(S().selectedWebsiteId);
      if (data.count > 0) { showOrphanedBanner(data.orphaned); }
      else { $('dp-panel-registry')?.querySelector('.dp-orphaned-banner')?.remove(); }
    } catch (err) { console.error('[DemoPagesRegistry] orphan check failed:', err); }
  }

  function showOrphanedBanner(orphaned) {
    const regPanel = $('dp-panel-registry'); if (!regPanel) return;
    regPanel.querySelector('.dp-orphaned-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'dp-orphaned-banner'; banner.style.cssText = 'margin-bottom:16px;';
    banner.innerHTML = `
      <div class="dp-info-banner" style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.15);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" style="flex-shrink:0;">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:2px;">${orphaned.length} Orphaned Page${orphaned.length !== 1 ? 's' : ''} Detected</div>
          <div style="font-size:11px;color:var(--text-secondary);">HTML files missing from server &mdash; pages will return 404 errors</div>
        </div>
        <button class="dp-banner-btn" id="dp-view-orphaned-btn" style="padding:7px 14px;background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;">View &amp; Clean Up</button>
      </div>`;
    regPanel.querySelector('.dp-panel-inner')?.prepend(banner);
    $('dp-view-orphaned-btn')?.addEventListener('click', () => showOrphanedModal(orphaned));
  }

  function showOrphanedModal(orphaned) {
    const listHtml = orphaned.map(p => `
      <div class="dp-orphan-item" style="padding:12px 14px;border-radius:10px;border:1px solid rgba(239,68,68,.12);background:rgba(239,68,68,.02);margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px;">${esc(p.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);margin-bottom:4px;">URL: ${esc(p.url)}</div>
            <div style="font-size:11px;color:#f59e0b;"><span style="font-weight:600;">Missing file:</span> <code style="color:#fbbf24;">${esc(p.expectedFile)}</code></div>
          </div>
          <button class="dp-orphan-delete-btn" data-id="${p.id}" style="padding:6px 12px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;">Remove</button>
        </div>
      </div>`).join('');

    window.showModal({
      title: `Orphaned Pages (${orphaned.length})`, width: '600px',
      content: `
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 14px;">These pages are registered but their HTML files don't exist on the server.</p>
        <div style="max-height:400px;overflow-y:auto;">${listHtml}</div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);">
          <button id="dp-cleanup-all-btn" style="padding:9px 18px;background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;">Delete All Orphaned Pages</button>
        </div>`,
      confirmText: 'Close', hideCancel: true, onConfirm: () => {}
    });
    setTimeout(() => {
      document.querySelectorAll('.dp-orphan-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pageId = parseInt(btn.dataset.id, 10);
          try {
            await window.ALPApi.bulkDeletePages([pageId]);
            btn.closest('.dp-orphan-item').style.opacity = '0.3';
            btn.disabled = true; btn.textContent = 'Removed';
            window.showToast('Page removed from registry', 'success');
            S().pages = S().pages.filter(p => p.id !== pageId); repaintGrid();
          } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
        });
      });
      $('dp-cleanup-all-btn')?.addEventListener('click', async () => {
        const ids = orphaned.map(p => p.id);
        try {
          await window.ALPApi.bulkDeletePages(ids);
          window.showToast(`Removed ${ids.length} orphaned pages`, 'success');
          S().pages = S().pages.filter(p => !ids.includes(p.id));
          repaintGrid(); document.querySelector('.modal-overlay')?.click();
        } catch (err) { window.showToast('Cleanup failed: ' + err.message, 'error'); }
      });
    }, 100);
  }

  return { renderCard, repaintGrid, bindCardEvents, updateBulkToolbar, hideBulkToolbar, clearBulkSelection, showPreviewModal, showAnalyticsModal, checkOrphanedPages, showOrphanedModal };
})();
