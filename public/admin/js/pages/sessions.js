/**
 * ALP - Live Sessions Page Module
 * Card-based session display with real-time updates, filters, detail panel
 * Fully featured with bulk-select mode, inline DOM card updates, and redirect actions.
 */
const SessionsPage = (() => {
  let socketListeners = [];
  let refreshTimer = null;
  let allSessions = [];
  let filters = { website: '', country: '', device: '', search: '', status: 'active' };
  
  // Bulk selection state
  let isSelectMode = false;
  let selectedSessionIds = new Set();
  let sessionView = localStorage.getItem('alp_session_view') || 'cards'; // persisted

  // --- Render ---
  function render() {
    return `
      <div class="sessions-page page-enter">
        <div class="page-header">
          <div>
            <h1 class="page-title">Live Sessions</h1>
            <p class="page-subtitle">Monitor and manage active visitor sessions</p>
          </div>
          <div class="header-actions">
            <span class="live-indicator"><span class="pulse-dot"></span> <span id="live-count">0</span> Live</span>
            <!-- View Toggle -->
            <div class="sess-view-toggle" id="sess-view-toggle">
              <button class="sess-view-btn active" data-view="cards" title="Card View">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </button>
              <button class="sess-view-btn" data-view="rows" title="Row View">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
            <button class="btn btn-outline" id="toggle-select-mode-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
              Select Mode
            </button>
            <button class="btn btn-outline" id="bulk-redirect-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Bulk Redirect
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="filter-bar" id="filter-bar">
          <div class="search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="session-search" placeholder="Search visitor, page, IP…" class="search-input" />
          </div>
          <select id="filter-status" class="filter-select filter-status-select">
            <option value="active">🟢 Live Sessions</option>
            <option value="">All Sessions</option>
            <option value="offline">⚫ Offline Only</option>
          </select>
          <div id="filter-website-container"></div>
          <select id="filter-country" class="filter-select"><option value="">All Countries</option></select>
          <select id="filter-device" class="filter-select">
            <option value="">All Devices</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>

        <!-- Bulk Selection Action Bar -->
        <div class="bulk-select-bar" id="bulk-select-bar" style="display: none;">
          <div class="bs-info">
            <span class="bs-count" id="bs-count">0 sessions selected</span>
          </div>
          <div class="bs-actions">
            <button class="btn btn-sm btn-outline" id="bs-select-all-btn">Select All</button>
            <button class="btn btn-sm btn-outline" id="bs-clear-btn">Clear Selection</button>
            <button class="btn btn-sm btn-primary" id="bs-redirect-btn">Redirect Selected</button>
            <button class="btn btn-sm btn-danger" id="bs-end-btn">End Selected</button>
            <button class="btn btn-sm btn-danger" id="bs-delete-btn" style="background:#dc2626; border-color:#dc2626;">Delete Selected</button>
            <button class="btn btn-sm btn-outline" id="bs-cancel-btn">Cancel</button>
          </div>
        </div>

        <!-- Sessions Grid -->
        <div class="sessions-grid" id="sessions-grid">
          <div class="empty-state" id="sessions-empty" style="display:none;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-tertiary)"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <p>No active sessions found</p>
          </div>
        </div>
      </div>
    `;
  }

  // --- Row View Renderer ---
  function renderSessionRow(s) {
    const pagePath = (s.current_page || '').toLowerCase();
    const isHolding = s.is_active && SessionTemplates.isLoadingPage(pagePath, s.current_page_type);
    const isWarning  = s.is_active && s.current_page_type === 'warning';
    const isOnline   = !!s.is_active;

    let rowClass = 'sess-row';
    if (isHolding)      rowClass += ' sess-row-holding';
    else if (isWarning) rowClass += ' sess-row-warning';
    else if (isOnline)  rowClass += ' sess-row-online';
    else                rowClass += ' sess-row-offline';

    const ledCls = isHolding ? 'holding' : isWarning ? 'warning' : isOnline ? 'online' : 'offline';
    const color    = SessionTemplates.avatarColor(s.visitor_id || s.id);
    const vid      = s.visitor_id || s.id || 'Unknown';
    const initials = vid.slice(0, 2).toUpperCase();
    const flag     = s.country ? SessionTemplates.countryFlag(s.country) : '🌐';
    const dur      = SessionTemplates.sessionDuration(s.started_at);
    const siteHex  = s.website_color || '#6366f1';
    const page     = s.current_page || '/';
    const location = [s.city, s.country].filter(Boolean).join(', ') || '—';
    const device   = (s.device || '—');

    let formCount = 0;
    try {
      const meta = (typeof s.metadata === 'object') ? s.metadata : JSON.parse(s.metadata || '{}');
      formCount = (meta.formData && meta.formData.length) ? meta.formData.length : 0;
    } catch { }

    const esc = SessionTemplates.escapeHtml;

    return `
      <tr class="${rowClass}" data-sess-id="${s.id}" style="--row-site-color:${siteHex};">
        <td class="sess-td-status">
          <span class="sess-row-led ${ledCls}"></span>
        </td>
        <td class="sess-td-visitor">
          <div class="sess-row-visitor">
            <div class="sess-row-avatar" style="background:${color}">${esc(initials)}</div>
            <span class="sess-row-vid" title="${esc(vid)}">${esc(vid.length > 14 ? vid.slice(0,14)+'…' : vid)}</span>
          </div>
        </td>
        <td class="sess-td-website">
          <div class="sess-row-website">
            <span class="sess-row-site-dot" style="background:${siteHex};box-shadow:0 0 5px ${siteHex}55;"></span>
            <span>${esc(s.website_name || '—')}</span>
          </div>
        </td>
        <td class="sess-td-page">
          <div class="sess-row-page" title="${esc(page)}">${esc(page.length > 36 ? page.slice(0,36)+'…' : page)}</div>
        </td>
        <td class="sess-td-loc">
          <span class="sess-row-loc">${flag} ${esc(location.length > 22 ? location.slice(0,22)+'…' : location)}</span>
        </td>
        <td class="sess-td-device">
          <span class="sess-row-device">${esc(device)}</span>
        </td>
        <td class="sess-td-dur">
          <span class="sess-row-dur">${esc(dur)}</span>
        </td>
        <td class="sess-td-badges">
          <div class="sess-row-badges">
            ${isHolding ? '<span class="sess-row-badge holding">⏳ Hold</span>' : ''}
            ${isWarning ? '<span class="sess-row-badge warning">🚨 Warn</span>' : ''}
            ${formCount > 0 ? `<span class="sess-row-badge form">📝 ${formCount}</span>` : ''}
          </div>
        </td>
        <td class="sess-td-actions">
          <div class="sess-row-actions">
            <button class="sess-row-btn" data-row-view="${s.id}">View</button>
          </div>
        </td>
      </tr>`;
  }

  // --- Render Sessions Grid ---
  function renderSessionsGrid() {
    const grid = document.getElementById('sessions-grid');
    const empty = document.getElementById('sessions-empty');
    if (!grid) return;

    const filtered = getFilteredSessions();

    const liveCount = document.getElementById('live-count');
    if (liveCount) liveCount.textContent = allSessions.filter(s => s.is_active).length;

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (empty) { empty.style.display = 'block'; grid.appendChild(empty); }
      return;
    }
    if (empty) empty.style.display = 'none';

    if (sessionView === 'rows') {
      grid.className = 'sessions-grid-rows';
      grid.style.display = 'block';
      const rows = filtered.map(s => renderSessionRow(s)).join('');
      grid.innerHTML = `
        <div class="sess-rows-wrap">
          <table class="sess-rows-table">
            <colgroup>
              <col style="width:40px">
              <col style="width:180px">
              <col style="width:150px">
              <col>
              <col style="width:160px">
              <col style="width:90px">
              <col style="width:80px">
              <col style="width:110px">
              <col style="width:90px">
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Visitor</th>
                <th>Website</th>
                <th>Current Page</th>
                <th>Location</th>
                <th>Device</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      return;
    }

    grid.className = 'sessions-grid';
    grid.style.display = '';
    grid.innerHTML = filtered.map(s => SessionTemplates.renderSessionCard(s, selectedSessionIds, isSelectMode)).join('');
  }

  function getFilteredSessions() {
    let filtered = allSessions;
    // Status filter (active / offline / all)
    if (filters.status === 'active') {
      filtered = filtered.filter(s => s.is_active);
    } else if (filters.status === 'offline') {
      filtered = filtered.filter(s => !s.is_active);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(s =>
        (s.visitor_id || '').toLowerCase().includes(q) ||
        (s.current_page || '').toLowerCase().includes(q) ||
        (s.ip_address || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
      );
    }
    if (filters.website) {
      filtered = filtered.filter(s => String(s.website_id) === filters.website);
    }
    if (filters.country) {
      filtered = filtered.filter(s => (s.country || '').toLowerCase() === filters.country.toLowerCase());
    }
    if (filters.device) {
      filtered = filtered.filter(s => (s.device || '').toLowerCase() === filters.device.toLowerCase());
    }
    return filtered;
  }

  // --- Live card update helper (DOM replacement in real-time) ---
  function updateSessionCardDOM(s) {
    if (sessionView === 'rows') {
      const row = document.querySelector(`tr.sess-row[data-sess-id="${s.id}"]`);
      if (!row) return;
      const tmp = document.createElement('tbody');
      tmp.innerHTML = renderSessionRow(s);
      const newRow = tmp.firstElementChild;
      newRow.style.animation = 'row-hold-pulse 0.6s ease-out';
      row.replaceWith(newRow);
      return;
    }

    const card = document.querySelector(`.session-card[data-session-id="${s.id}"]`);
    if (!card) return;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = SessionTemplates.renderSessionCard(s, selectedSessionIds, isSelectMode);
    const newCard = tempDiv.firstElementChild;
    newCard.classList.add('card-update-flash');
    card.replaceWith(newCard);
  }

  // --- Bulk Select UX controls ---
  function updateBulkSelectBar() {
    const bar = document.getElementById('bulk-select-bar');
    const countEl = document.getElementById('bs-count');
    if (!bar || !countEl) return;

    if (isSelectMode) {
      bar.style.display = 'flex';
      const size = selectedSessionIds.size;
      countEl.textContent = `${size} session${size !== 1 ? 's' : ''} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  function disableSelectMode() {
    isSelectMode = false;
    selectedSessionIds.clear();
    document.querySelectorAll('.session-card').forEach(card => {
      card.classList.remove('select-mode-active');
      card.classList.remove('selected');
    });
    const toggleBtn = document.getElementById('toggle-select-mode-btn');
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
    }
    updateBulkSelectBar();
  }

  function enableSelectMode() {
    isSelectMode = true;
    document.querySelectorAll('.session-card').forEach(card => {
      card.classList.add('select-mode-active');
    });
    const toggleBtn = document.getElementById('toggle-select-mode-btn');
    if (toggleBtn) {
      toggleBtn.classList.add('active');
    }
    updateBulkSelectBar();
  }

  // Drawer rendering and action handling is now delegated to the SessionDrawer component

  // --- Redirect Modal with Context-Aware Suggestions ---
  function showRedirectModal(sessionId) {
    SessionRedirectModal.show(sessionId);
  }

  // --- Data Loading ---
  async function loadSessions() {
    try {
      const data = await window.ALPApi.getSessions();
      allSessions = data.sessions || data || [];
      renderSessionsGrid();
      populateFilters();
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      const websites = data.websites || data || [];
      
      window.ALPWebsiteSelect.create({
        containerId: 'filter-website-container',
        hiddenInputId: 'filter-website',
        websites: websites,
        placeholder: 'All Scam Pages',
        selectedValue: filters.website,
        onChange: (val) => {
          filters.website = val;
          renderSessionsGrid();
        }
      });

      if (document.getElementById('bulk-website-container')) {
        window.ALPWebsiteSelect.create({
          containerId: 'bulk-website-container',
          hiddenInputId: 'bulk-website',
          websites: websites,
          placeholder: 'All Scam Pages',
          selectedValue: '',
          fullWidth: true
        });
      }
    } catch (e) { /* ignore */ }
  }

  function populateFilters() {
    const countries = [...new Set(allSessions.map(s => s.country).filter(Boolean))];
    const select = document.getElementById('filter-country');
    if (select && select.options.length <= 1) {
      countries.sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = `${SessionTemplates.countryFlag(c)} ${c}`;
        select.appendChild(opt);
      });
    }
  }

  // --- Init ---
  function init() {
    SessionDrawer.init({
      onSessionUpdated: (sid, data) => {
        const idx = allSessions.findIndex(s => s.id === sid);
        if (idx >= 0) {
          allSessions[idx] = { ...allSessions[idx], ...data };
          updateSessionCardDOM(allSessions[idx]);
        }
      },
      onSessionDeleted: (sid) => {
        const card = document.querySelector(`.session-card[data-session-id="${sid}"]`);
        if (card) card.classList.add('ending');
        setTimeout(() => {
          allSessions = allSessions.filter(s => s.id !== sid);
          renderSessionsGrid();
        }, 500);
      }
    });

    loadSessions();
    loadWebsites();

    // View toggle (cards ↔ rows)
    const viewToggle = document.getElementById('sess-view-toggle');
    if (viewToggle) {
      // Set initial active state from persisted sessionView
      viewToggle.querySelectorAll('.sess-view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === sessionView)
      );
      viewToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.sess-view-btn');
        if (!btn || btn.dataset.view === sessionView) return;
        sessionView = btn.dataset.view;
        localStorage.setItem('alp_session_view', sessionView);
        viewToggle.querySelectorAll('.sess-view-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.view === sessionView)
        );
        // Select mode is card-only — disable it when switching to rows
        const selectBtn = document.getElementById('toggle-select-mode-btn');
        if (selectBtn) selectBtn.style.display = sessionView === 'rows' ? 'none' : '';
        if (sessionView === 'rows' && isSelectMode) disableSelectMode();
        renderSessionsGrid();
      });
    }

    // Hide select mode button when starting in row view
    const _selBtn = document.getElementById('toggle-select-mode-btn');
    if (_selBtn && sessionView === 'rows') _selBtn.style.display = 'none';

    // Select Mode toggle
    const toggleSelectBtn = document.getElementById('toggle-select-mode-btn');
    if (toggleSelectBtn) {
      toggleSelectBtn.addEventListener('click', () => {
        if (isSelectMode) {
          disableSelectMode();
        } else {
          enableSelectMode();
        }
      });
    }

    // Search
    const searchInput = document.getElementById('session-search');
    if (searchInput) {
      let debounce = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          filters.search = searchInput.value;
          renderSessionsGrid();
        }, 250);
      });
    }

    // Filters
    ['filter-status', 'filter-website', 'filter-country', 'filter-device'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => {
        filters[id.replace('filter-', '')] = el.value;
        renderSessionsGrid();
        if (isSelectMode) {
          // Re-evaluate checkboxes classes in DOM
          document.querySelectorAll('.session-card').forEach(card => card.classList.add('select-mode-active'));
        }
      });
    });

    const grid = document.getElementById('sessions-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        // Row view clicks
        const rowViewBtn = e.target.closest('[data-row-view]');
        if (rowViewBtn) { SessionDrawer.open(rowViewBtn.dataset.rowView); return; }
        const row = e.target.closest('.sess-row');
        if (row && row.dataset.sessId) { SessionDrawer.open(row.dataset.sessId); return; }

        const card = e.target.closest('.session-card');
        if (!card) return;

        // If Select Mode is active, click toggles checkbox and selection status
        if (isSelectMode) {
          const sid = card.dataset.sessionId;
          if (selectedSessionIds.has(sid)) {
            selectedSessionIds.delete(sid);
            card.classList.remove('selected');
          } else {
            selectedSessionIds.add(sid);
            card.classList.add('selected');
          }
          updateBulkSelectBar();
          return;
        }

        const viewBtn = e.target.closest('.session-view-btn');
        if (viewBtn) { SessionDrawer.open(viewBtn.dataset.sid); return; }

        const redirectBtn = e.target.closest('.session-redirect-btn');
        if (redirectBtn) {
          const sid = redirectBtn.dataset.sid;
          showRedirectModal(sid);
          return;
        }

        const endBtn = e.target.closest('.session-end-btn');
        if (endBtn) {
          const sid = endBtn.dataset.sid;
          window.showModal({
            title: 'End Session',
            content: `<p>Are you sure you want to force-end this session?</p>`,
            onConfirm: async () => {
              try {
                await window.ALPApi.endSession(sid);
                window.showToast('Session ended successfully', 'success');
                const idx = allSessions.findIndex(x => x.id === sid);
                if (idx >= 0) {
                  allSessions[idx].is_active = false;
                  updateSessionCardDOM(allSessions[idx]);
                }
              } catch (err) { window.showToast('Failed to end session: ' + err.message, 'error'); }
            }
          });
          return;
        }

        const deleteBtn = e.target.closest('.session-delete-btn');
        if (deleteBtn) {
          const sid = deleteBtn.dataset.sid;
          window.showModal({
            title: 'Delete Session',
            content: `<p>Are you sure you want to permanently delete this session? All recorded page views and data will be lost.</p>`,
            type: 'danger',
            onConfirm: async () => {
              try {
                await window.ALPApi.deleteSession(sid);
                window.showToast('Session deleted permanently', 'success');
                const card = document.querySelector(`.session-card[data-session-id="${sid}"]`);
                if (card) card.classList.add('ending');
                setTimeout(() => {
                  allSessions = allSessions.filter(x => x.id !== sid);
                  renderSessionsGrid();
                }, 500);
              } catch (err) { window.showToast('Failed to delete session: ' + err.message, 'error'); }
            }
          });
          return;
        }

        // Click card details fallback
        if (!e.target.closest('.session-card-actions')) {
          SessionDrawer.open(card.dataset.sessionId);
        }
      });
    }

    // Bulk select bar events
    const bsSelectAll = document.getElementById('bs-select-all-btn');
    if (bsSelectAll) {
      bsSelectAll.addEventListener('click', () => {
        const filtered = getFilteredSessions();
        filtered.forEach(s => selectedSessionIds.add(s.id));
        document.querySelectorAll('.session-card').forEach(card => card.classList.add('selected'));
        updateBulkSelectBar();
      });
    }

    const bsClear = document.getElementById('bs-clear-btn');
    if (bsClear) {
      bsClear.addEventListener('click', () => {
        selectedSessionIds.clear();
        document.querySelectorAll('.session-card.selected').forEach(card => card.classList.remove('selected'));
        updateBulkSelectBar();
      });
    }

    const bsCancel = document.getElementById('bs-cancel-btn');
    if (bsCancel) {
      bsCancel.addEventListener('click', disableSelectMode);
    }

    const bsRedirect = document.getElementById('bs-redirect-btn');
    if (bsRedirect) {
      bsRedirect.addEventListener('click', () => {
        const size = selectedSessionIds.size;
        if (size === 0) { window.showToast('No sessions selected', 'warning'); return; }
        
        window.showModal({
          title: `⚡ Redirect ${size} Session${size !== 1 ? 's' : ''}`,
          content: `
            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Target URL</label>
              <input type="url" id="bs-redirect-url" placeholder="https://example.com" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:13px;outline:none;font-family:'Inter',sans-serif;" />
            </div>
          `,
          onConfirm: async () => {
            const url = document.getElementById('bs-redirect-url').value.trim();
            if (!url) { window.showToast('Enter a target URL', 'warning'); return; }
            
            const ids = Array.from(selectedSessionIds);
            let ok = 0, fail = 0;
            await Promise.all(ids.map(async id => {
              try {
                await window.ALPApi.redirectSession(id, url);
                ok++;
              } catch {
                fail++;
              }
            }));
            window.showToast(`Redirected ${ok} session${ok !== 1 ? 's' : ''}${fail ? ` (${fail} failed)` : ''}`, ok ? 'success' : 'error');
            disableSelectMode();
          }
        });
      });
    }

    const bsEnd = document.getElementById('bs-end-btn');
    if (bsEnd) {
      bsEnd.addEventListener('click', () => {
        const size = selectedSessionIds.size;
        if (size === 0) { window.showToast('No sessions selected', 'warning'); return; }

        window.showModal({
          title: `⛔ End ${size} Session${size !== 1 ? 's' : ''}`,
          content: `<p>Are you sure you want to force-end ${size} selected session${size !== 1 ? 's' : ''}?</p>`,
          onConfirm: async () => {
            const ids = Array.from(selectedSessionIds);
            let ok = 0, fail = 0;
            await Promise.all(ids.map(async id => {
              try {
                await window.ALPApi.endSession(id);
                ok++;
                const idx = allSessions.findIndex(s => s.id === id);
                if (idx >= 0) allSessions[idx].is_active = false;
              } catch {
                fail++;
              }
            }));
            window.showToast(`Ended ${ok} session${ok !== 1 ? 's' : ''}${fail ? ` (${fail} failed)` : ''}`, ok ? 'success' : 'error');
            renderSessionsGrid();
            disableSelectMode();
          }
        });
      });
    }

    const bsDelete = document.getElementById('bs-delete-btn');
    if (bsDelete) {
      bsDelete.addEventListener('click', () => {
        const size = selectedSessionIds.size;
        if (size === 0) { window.showToast('No sessions selected', 'warning'); return; }

        window.showModal({
          title: `🗑️ Delete ${size} Session${size !== 1 ? 's' : ''}`,
          content: `<p>Are you sure you want to permanently delete ${size} selected session${size !== 1 ? 's' : ''}? All recorded page views and data will be lost.</p>`,
          type: 'danger',
          onConfirm: async () => {
            const ids = Array.from(selectedSessionIds);
            let ok = 0, fail = 0;
            await Promise.all(ids.map(async id => {
              try {
                await window.ALPApi.deleteSession(id);
                ok++;
                allSessions = allSessions.filter(s => s.id !== id);
              } catch {
                fail++;
              }
            }));
            window.showToast(`Deleted ${ok} session${ok !== 1 ? 's' : ''}${fail ? ` (${fail} failed)` : ''}`, ok ? 'success' : 'error');
            renderSessionsGrid();
            disableSelectMode();
          }
        });
      });
    }

    // Broadcast Redirect (General top button click helper)
    const bulkBtn = document.getElementById('bulk-redirect-btn');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', () => {
        window.showModal({
          title: 'Broadcast Redirect',
          content: `
            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Website</label>
              <div id="bulk-website-container"></div>
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Target URL</label>
              <input type="url" id="bulk-redirect-url" placeholder="https://example.com" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:13px;outline:none;font-family:'Inter',sans-serif;" />
            </div>
          `,
          onConfirm: async () => {
            const url = document.getElementById('bulk-redirect-url').value.trim();
            const websiteId = document.getElementById('bulk-website').value;
            if (!url) { window.showToast('Enter a target URL', 'warning'); return; }
            try {
              if (window.ALPSocket && window.ALPSocket.connected) {
                window.ALPSocket.broadcastRedirect(websiteId || null, url);
                window.showToast('Broadcast redirect command sent!', 'success');
              } else {
                window.showToast('Socket not connected. Cannot send redirect.', 'error');
              }
            } catch (err) { window.showToast('Bulk redirect failed', 'error'); }
          }
        });
        loadWebsites(); // refresh options in modal
      });
    }

    // Socket listeners for real-time smoothness
    if (window.ALPSocket) {
      const onNewSession = (session) => {
        const exists = allSessions.find(s => s.id === session.id);
        if (!exists) { 
          allSessions.unshift(session); 
          renderSessionsGrid(); 
        }
      };
      window.ALPSocket.on('admin:session:new', onNewSession);
      socketListeners.push(['admin:session:new', onNewSession]);

      const onSessionUpdate = (payload) => {
        // Polling sends the full sessions array; WebSocket sends a single object.
        if (Array.isArray(payload)) {
          payload.forEach(s => {
            const idx = allSessions.findIndex(x => x.id === s.id);
            if (idx >= 0) allSessions[idx] = { ...allSessions[idx], ...s };
            else allSessions.unshift(s);
          });
          renderSessionsGrid();
          return;
        }
        const session = payload;
        const idx = allSessions.findIndex(s => s.id === session.id);
        if (idx >= 0) {
          const wasInactive = !allSessions[idx].is_active;
          allSessions[idx] = { ...allSessions[idx], ...session };
          if (wasInactive && session.is_active) {
            renderSessionsGrid();
          } else {
            updateSessionCardDOM(allSessions[idx]);
          }
        } else {
          allSessions.unshift(session);
          renderSessionsGrid();
        }
      };
      window.ALPSocket.on('admin:session:update', onSessionUpdate);
      socketListeners.push(['admin:session:update', onSessionUpdate]);

      const onSessionEnd = (data) => {
        const sid = data.id || data.sessionId;
        const card = document.querySelector(`.session-card[data-session-id="${sid}"]`);
        if (card) card.classList.add('ending');
        setTimeout(() => {
          // Mark inactive in local state — do NOT delete from allSessions.
          // If the visitor reconnects within the grace period, admin:session:update
          // will arrive with is_active=1 and the session will reappear above.
          const idx = allSessions.findIndex(s => s.id === sid);
          if (idx >= 0) {
            allSessions[idx] = { ...allSessions[idx], is_active: 0 };
          }
          renderSessionsGrid();
        }, 500);
      };
      window.ALPSocket.on('admin:session:end', onSessionEnd);
      socketListeners.push(['admin:session:end', onSessionEnd]);

      const onSessionsCleared = () => {
        allSessions = [];
        renderSessionsGrid();
        window.showToast('All sessions have been cleared', 'info');
      };
      window.ALPSocket.on('admin:sessions:cleared', onSessionsCleared);
      socketListeners.push(['admin:sessions:cleared', onSessionsCleared]);

      const onConnect = () => {
        console.log('[SessionsPage] Socket connected/reconnected. Reloading sessions to sync.');
        loadSessions();
      };
      window.ALPSocket.on('connect', onConnect);
      socketListeners.push(['connect', onConnect]);
    }

    // Auto-refresh fallback (safeguard)
    refreshTimer = setInterval(loadSessions, 12000);
  }

  function destroy() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (window.ALPSocket) {
      socketListeners.forEach(([ev, fn]) => window.ALPSocket.off(ev, fn));
    }
    socketListeners = [];
    allSessions = [];
    selectedSessionIds.clear();
    isSelectMode = false;
    filters = { website: '', country: '', device: '', search: '', status: 'active' };
  }

  return { render, init, destroy, loadSessions, showRedirectModal };
})();

if (typeof window !== 'undefined') {
  window.SessionsPage = SessionsPage;
}
