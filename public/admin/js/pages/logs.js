/**
 * ALP - Audit Logs Page (Terminal Edition)
 *
 * Mac-style terminal viewer for audit logs:
 *   • Traffic-light chrome + monospaced font
 *   • Category sidebar with live counts (click to filter)
 *   • Syslog-style line format: [timestamp] [CATEGORY] user → action  ip
 *   • Click any line to expand JSON details inline (syntax-highlighted)
 *   • Search + user + date-range filters
 *   • Auto-follow toggle (like `tail -f`) + pause on scroll
 *   • Real-time socket push (new log lines fade in at bottom)
 *   • CSV export + clear-old-logs (super_admin)
 */
const LogsPage = (() => {
  let logs = [];
  let total = 0;
  let page = 1;
  const perPage = 50;
  let filters = { category: '', user: '', search: '', from: '', to: '' };
  let expandedIds = new Set();
  let follow = true;
  let socketOff = null;
  let categoryCounts = { __all: 0 }; // global counts (all rows in the DB scope, ignoring filters)

  const CAT_META = {
    auth:         { color: '#3b82f6', icon: '🔐', label: 'AUTH' },
    session:      { color: '#10b981', icon: '👁',  label: 'SESSION' },
    redirect:     { color: '#f59e0b', icon: '↪',  label: 'REDIRECT' },
    settings:     { color: '#8b5cf6', icon: '⚙',  label: 'SETTINGS' },
    user:         { color: '#ec4899', icon: '👤', label: 'USER' },
    website:      { color: '#14b8a6', icon: '🌐', label: 'WEBSITE' },
    system:       { color: '#6b7280', icon: '⚡', label: 'SYSTEM' },
    notification: { color: '#f97316', icon: '🔔', label: 'NOTIFY' },
    security:     { color: '#ef4444', icon: '🛡',  label: 'SECURITY' },
    domain:       { color: '#0ea5e9', icon: '🌍', label: 'DOMAIN' },
    vps:          { color: '#a855f7', icon: '📡', label: 'VPS' },
  };

  const escHtml = s => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  function parseDate(s) {
    if (!s) return new Date();
    if (typeof s === 'string' && !s.includes('T') && !s.includes('Z') && !s.includes('+')) {
      return new Date(s.trim().replace(' ', 'T') + 'Z');
    }
    return new Date(s);
  }

  function fmtAbs(s) {
    const d = parseDate(s);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function fmtAgo(s) {
    const diff = Math.max(0, Date.now() - parseDate(s).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'now';
    if (m < 60)  return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function catMeta(cat) {
    return CAT_META[cat] || { color: '#6b7280', icon: '•', label: (cat || 'GENERAL').toUpperCase() };
  }

  /** Syntax-highlight a JSON string. */
  function highlightJson(json) {
    if (json == null) return '';
    let src;
    try {
      src = typeof json === 'string' ? JSON.stringify(JSON.parse(json), null, 2) : JSON.stringify(json, null, 2);
    } catch {
      return escHtml(String(json));
    }
    return escHtml(src).replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (m) => {
        let cls = 'jn';                                       // number
        if (/^"/.test(m))          cls = /:$/.test(m) ? 'jk' : 'js'; // key vs string
        else if (/true|false/.test(m)) cls = 'jb';
        else if (/null/.test(m))   cls = 'jnl';
        return `<span class="${cls}">${m}</span>`;
      }
    );
  }

  /** Return search-highlighted HTML. */
  function highlight(text, q) {
    const t = escHtml(text || '');
    if (!q) return t;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return t.replace(re, '<mark class="term-mark">$1</mark>');
  }

  function render() {
    const user = window.ALPAuth.getUser();
    const isSuperAdmin = user && (user.role === 'super_admin' || user.role === 'god');

    return `
      <div class="logs-page page-enter">
        <div class="logs-header">
          <div>
            <h1 class="logs-title">
              <span class="logs-title-prefix">/var/log/</span><span class="logs-title-name">audit</span>
              <span class="logs-live-dot" id="logs-live-dot" title="Live tail active"></span>
            </h1>
            <p class="logs-sub">Real-time terminal view of every administrative action across the panel.</p>
          </div>
          <div class="logs-actions">
            <span class="logs-total-pill">
              <span class="logs-total-num" id="logs-total">0</span>
              <span class="logs-total-lab">events</span>
            </span>
            <button class="logs-btn" id="logs-export-btn" title="Export current page to CSV">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              CSV
            </button>
            ${isSuperAdmin ? `
              <button class="logs-btn logs-btn-danger" id="clear-logs-btn" title="Clear logs older than 30 days">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                Clear old
              </button>` : ''}
          </div>
        </div>

        <!-- Filter bar -->
        <div class="logs-filters">
          <div class="logs-search">
            <span class="logs-search-prompt">$</span>
            <input type="text" id="logs-search" placeholder="grep &lt;action | user | detail&gt;…" spellcheck="false" />
            <span class="logs-search-hint" id="logs-search-hint">↵ to search · Esc to clear</span>
          </div>
          <select id="filter-user" class="logs-select">
            <option value="">-- all users --</option>
          </select>
          <input type="date" id="filter-date-from" class="logs-date" title="From date" />
          <span class="logs-date-sep">→</span>
          <input type="date" id="filter-date-to" class="logs-date" title="To date" />
          <button class="logs-btn logs-btn-icon" id="logs-refresh" title="Refresh (r)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
          </button>
        </div>

        <!-- Terminal panel -->
        <div class="log-term">
          <div class="log-term-hdr">
            <div class="log-term-dots">
              <span class="log-term-dot" style="background:#ff5f57"></span>
              <span class="log-term-dot" style="background:#febc2e"></span>
              <span class="log-term-dot" style="background:#28c840"></span>
            </div>
            <span class="log-term-title" id="log-term-title">god@outlaws:~/audit-logs — <span id="log-term-slice">page 1</span></span>
            <label class="log-term-follow" title="Auto-scroll to newest log">
              <input type="checkbox" id="logs-follow" checked />
              <span>tail -f</span>
            </label>
          </div>

          <div class="log-term-body">
            <!-- Category sidebar -->
            <aside class="log-cats" id="log-cats">
              <div class="log-cats-label">CATEGORIES</div>
              <button class="log-cat active" data-cat="">
                <span class="log-cat-icon">≡</span>
                <span class="log-cat-name">All</span>
                <span class="log-cat-count" id="cat-count-all">0</span>
              </button>
              ${Object.entries(CAT_META).map(([key, m]) => `
                <button class="log-cat" data-cat="${key}" style="--cat-color:${m.color};">
                  <span class="log-cat-icon" style="color:${m.color}">${m.icon}</span>
                  <span class="log-cat-name">${m.label.toLowerCase()}</span>
                  <span class="log-cat-count" id="cat-count-${key}">0</span>
                </button>
              `).join('')}
            </aside>

            <!-- Log stream -->
            <div class="log-stream" id="log-stream">
              <div class="log-empty">
                <div class="log-empty-spinner"></div>
                <div>Loading audit stream…</div>
              </div>
            </div>
          </div>

          <div class="log-term-footer">
            <div class="log-term-footer-left" id="log-term-status">Ready.</div>
            <div class="log-pager" id="log-pager"></div>
          </div>
        </div>
      </div>

      <style>
        .logs-page { max-width: 1400px; margin: 0 auto; }

        /* Header */
        .logs-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 14px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .logs-title {
          font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px;
          display: flex; align-items: center; gap: 10px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .logs-title-prefix { color: var(--text-tertiary); font-weight: 500; }
        .logs-title-name   { color: var(--accent-primary); }
        .logs-live-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #34d399; box-shadow: 0 0 8px #34d399;
          animation: logs-pulse 1.6s ease-in-out infinite;
        }
        @keyframes logs-pulse { 50% { opacity: 0.35; transform: scale(0.85); } }
        .logs-sub {
          font-size: 12.5px; color: var(--text-secondary); margin: 0;
        }
        .logs-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .logs-total-pill {
          display: inline-flex; align-items: baseline; gap: 5px;
          padding: 6px 12px; border-radius: 8px;
          background: var(--bg-secondary); border: 1px solid var(--border-gold);
        }
        .logs-total-num { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 800; color: var(--accent-primary); }
        .logs-total-lab { font-size: 10.5px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }
        .logs-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
          background: var(--bg-secondary); border: 1px solid var(--border-primary);
          color: var(--text-secondary); cursor: pointer; font-family: inherit;
          transition: all 0.15s;
        }
        .logs-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
        .logs-btn-danger { color: var(--color-danger); border-color: rgba(239,68,68,0.25); }
        .logs-btn-danger:hover { background: rgba(239,68,68,0.08); border-color: var(--color-danger); color: var(--color-danger); }
        .logs-btn-icon { padding: 7px 9px; }

        /* Filter bar */
        .logs-filters {
          display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
          background: var(--bg-secondary); border: 1px solid var(--border-primary);
          border-radius: 12px; padding: 10px 12px; margin-bottom: 12px;
        }
        .logs-search {
          flex: 1 1 260px; min-width: 200px;
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-tertiary); border: 1px solid var(--border-primary);
          border-radius: 8px; padding: 0 10px;
          transition: all 0.15s;
        }
        .logs-search:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-primary-ring);
        }
        .logs-search-prompt {
          font-family: 'JetBrains Mono', monospace; color: var(--accent-primary);
          font-size: 14px; font-weight: 700;
        }
        #logs-search {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: 'JetBrains Mono', monospace; font-size: 12.5px;
          color: var(--text-primary); padding: 9px 4px;
        }
        #logs-search::placeholder { color: var(--text-placeholder); font-family: inherit; }
        .logs-search-hint {
          font-size: 10.5px; color: var(--text-tertiary); white-space: nowrap;
          padding-right: 4px; font-family: 'JetBrains Mono', monospace;
        }
        .logs-select, .logs-date {
          background: var(--bg-tertiary); border: 1px solid var(--border-primary);
          color: var(--text-secondary); border-radius: 8px; padding: 9px 12px;
          font-family: 'JetBrains Mono', monospace; font-size: 11.5px; outline: none;
          cursor: pointer;
        }
        .logs-select { min-width: 150px; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%237a7a7a' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; padding-right: 30px;
        }
        .logs-date::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
        .logs-date-sep { color: var(--text-tertiary); font-family: 'JetBrains Mono', monospace; }

        /* Terminal panel */
        .log-term {
          background: #0a0e17;
          border: 1px solid rgba(212,175,55,0.18);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 12px 36px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.02);
        }
        .log-term-hdr {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px;
          background: linear-gradient(180deg, rgba(20,25,35,0.9), rgba(10,14,23,0.9));
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .log-term-dots { display: flex; gap: 6px; }
        .log-term-dot  { width: 11px; height: 11px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25); }
        .log-term-title {
          flex: 1; text-align: center;
          font-family: 'JetBrains Mono', monospace; font-size: 11.5px;
          color: rgba(255,255,255,0.55);
        }
        .log-term-title #log-term-slice { color: var(--accent-primary); }
        .log-term-follow {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
          color: rgba(255,255,255,0.6); cursor: pointer;
          padding: 4px 8px; border-radius: 6px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.15s;
        }
        .log-term-follow:hover { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.06); }
        .log-term-follow input { accent-color: var(--accent-primary); margin: 0; }

        .log-term-body {
          display: grid; grid-template-columns: 200px 1fr;
          height: 70vh; min-height: 480px; max-height: 70vh;
        }

        /* Categories sidebar */
        .log-cats {
          background: rgba(0,0,0,0.25);
          border-right: 1px solid rgba(255,255,255,0.05);
          padding: 12px 8px;
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
        }
        .log-cats-label {
          font-size: 10px; font-weight: 800; letter-spacing: 1px;
          color: rgba(255,255,255,0.35); padding: 4px 10px 10px;
        }
        .log-cat {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 7px 10px; border-radius: 6px;
          background: transparent; border: 1px solid transparent;
          color: rgba(255,255,255,0.6);
          font-family: inherit; font-size: 11.5px; text-align: left;
          cursor: pointer; transition: all 0.12s;
        }
        .log-cat:hover { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.9); }
        .log-cat.active {
          background: rgba(212,175,55,0.10);
          border-color: rgba(212,175,55,0.28);
          color: var(--accent-primary);
        }
        .log-cat.active .log-cat-icon { text-shadow: 0 0 8px currentColor; }
        .log-cat-icon { width: 16px; text-align: center; flex-shrink: 0; }
        .log-cat-name { flex: 1; text-transform: lowercase; }
        .log-cat-count {
          font-size: 10.5px; font-weight: 700;
          background: rgba(255,255,255,0.06);
          padding: 1px 6px; border-radius: 10px;
          min-width: 20px; text-align: center;
        }
        .log-cat.active .log-cat-count {
          background: rgba(212,175,55,0.22); color: var(--accent-primary);
        }

        /* Log stream */
        .log-stream {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px; line-height: 1.55;
          overflow-y: auto; overflow-x: hidden;
          min-height: 0; height: 100%;
          background: linear-gradient(180deg, rgba(8,8,16,0.6), rgba(10,14,23,0.9));
          padding: 6px 0;
          scroll-behavior: smooth;
        }
        .log-cats { min-height: 0; height: 100%; }
        .log-line {
          display: grid;
          grid-template-columns: 155px 90px 88px 1fr auto;
          gap: 12px; align-items: baseline;
          padding: 4px 16px;
          border-left: 3px solid transparent;
          cursor: pointer;
          position: relative;
          transition: background 0.1s;
        }
        .log-line:hover { background: rgba(255,255,255,0.03); }
        .log-line.expanded { background: rgba(212,175,55,0.05); border-left-color: var(--accent-primary); }
        .log-line.new-line { animation: logs-slide-in 0.4s var(--ease-out) both; }
        @keyframes logs-slide-in {
          from { opacity: 0; transform: translateX(-6px); background: rgba(52,211,153,0.15); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .ll-time { color: rgba(255,255,255,0.45); font-size: 11px; white-space: nowrap; }
        .ll-time small { color: rgba(255,255,255,0.32); margin-left: 6px; font-size: 10px; }
        .ll-cat  {
          font-weight: 700; text-transform: uppercase;
          font-size: 10.5px; letter-spacing: 0.5px;
          padding: 1px 8px; border-radius: 4px;
          background: rgba(255,255,255,0.04);
          text-align: center;
        }
        .ll-user {
          color: rgba(255,255,255,0.85); font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ll-arrow { color: rgba(255,255,255,0.35); margin-right: 6px; }
        .ll-action {
          color: rgba(255,255,255,0.72);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ll-line.expanded .ll-action { white-space: normal; }
        .ll-ip {
          color: rgba(255,255,255,0.4); font-size: 11px;
          white-space: nowrap;
        }
        .ll-expand {
          display: inline-block; width: 12px; text-align: center;
          color: rgba(255,255,255,0.3); font-size: 10px;
        }
        .log-line.expanded .ll-expand { color: var(--accent-primary); }

        .log-details {
          padding: 10px 20px 14px 47px;
          background: rgba(0,0,0,0.35);
          border-left: 3px solid var(--accent-primary);
          margin-bottom: 4px;
          animation: logs-slide-down 0.2s ease both;
        }
        @keyframes logs-slide-down {
          from { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
          to   { opacity: 1; max-height: 500px; }
        }
        .log-details-hdr {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 10.5px; color: rgba(255,255,255,0.45);
          text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 8px;
          font-weight: 700;
        }
        .log-details-copy {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6); font-family: inherit; font-size: 10px;
          padding: 3px 8px; border-radius: 5px; cursor: pointer;
          transition: all 0.15s;
        }
        .log-details-copy:hover { color: var(--accent-primary); border-color: var(--accent-primary); }
        .log-details-copy.copied { color: #34d399; border-color: #34d399; background: rgba(52,211,153,0.1); }
        .log-details pre {
          margin: 0; padding: 10px 12px;
          background: rgba(0,0,0,0.4); border-radius: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11.5px; line-height: 1.6;
          color: rgba(255,255,255,0.7); white-space: pre-wrap; word-break: break-word;
          max-height: 320px; overflow-y: auto;
        }
        .log-details .jk  { color: #7dd3fc; }   /* key */
        .log-details .js  { color: #86efac; }   /* string */
        .log-details .jn  { color: #fbbf24; }   /* number */
        .log-details .jb  { color: #f0abfc; }   /* boolean */
        .log-details .jnl { color: #94a3b8; font-style: italic; } /* null */
        .log-details-empty {
          color: rgba(255,255,255,0.4); font-style: italic; padding: 4px 0;
        }

        .term-mark {
          background: rgba(212,175,55,0.35); color: #fff;
          padding: 0 2px; border-radius: 3px; font-weight: 700;
        }
        .log-empty {
          padding: 60px 20px; text-align: center;
          color: rgba(255,255,255,0.4); font-family: 'JetBrains Mono', monospace;
        }
        .log-empty-spinner {
          width: 30px; height: 30px; margin: 0 auto 14px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: var(--accent-primary);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .log-term-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 14px;
          background: rgba(0,0,0,0.35);
          border-top: 1px solid rgba(255,255,255,0.06);
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
          color: rgba(255,255,255,0.55);
        }
        .log-pager { display: flex; align-items: center; gap: 4px; }
        .log-pager-btn {
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.5);
          font-family: inherit; font-size: 10.5px;
          padding: 4px 9px; border-radius: 5px; cursor: pointer;
          transition: all 0.15s;
        }
        .log-pager-btn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
        .log-pager-btn.active {
          background: rgba(212,175,55,0.2);
          border-color: var(--accent-primary);
          color: var(--accent-primary); font-weight: 700;
        }
        .log-pager-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .log-pager-sep { color: rgba(255,255,255,0.25); padding: 0 2px; }

        /* Light theme */
        [data-theme='light'] .log-term { background: #1c1a17; }
        [data-theme='light'] .log-cats { background: rgba(0,0,0,0.35); }
        [data-theme='light'] .log-stream { background: linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.55)); }

        /* Mobile */
        @media (max-width: 800px) {
          .log-term-body { grid-template-columns: 1fr; max-height: none; }
          .log-cats {
            display: flex; flex-direction: row; overflow-x: auto;
            border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05);
            padding: 8px; gap: 6px;
          }
          .log-cats-label { display: none; }
          .log-cat { flex: 0 0 auto; width: auto; padding: 6px 10px; }
          .log-cat-name { display: none; }
          .log-cat.active .log-cat-name { display: inline; }
          .log-stream { max-height: 60vh; }
          .log-line {
            grid-template-columns: 1fr auto; grid-template-rows: auto auto;
            gap: 4px 8px; padding: 8px 12px;
          }
          .ll-time { grid-column: 1; grid-row: 1; }
          .ll-cat  { grid-column: 2; grid-row: 1; }
          .ll-user { display: none; }
          .ll-action { grid-column: 1 / -1; grid-row: 2; white-space: normal; }
          .ll-ip { display: none; }
          .ll-expand { position: absolute; top: 8px; right: 4px; }
          .log-details { padding: 10px 14px; }
        }
        @media (max-width: 640px) {
          .logs-header { flex-direction: column; align-items: stretch; }
          .logs-actions { justify-content: flex-start; }
          .logs-filters { padding: 8px; gap: 6px; }
          .logs-select, .logs-date { flex: 1 1 auto; min-width: 100px; }
          .logs-search-hint { display: none; }
        }
      </style>
    `;
  }

  /** Render the log stream (called on filter/paginate/socket). */
  function renderStream(newIds = new Set()) {
    const stream = document.getElementById('log-stream');
    if (!stream) return;

    updateCategoryCounts();

    if (!logs.length) {
      stream.innerHTML = `
        <div class="log-empty">
          <div style="font-size: 42px; margin-bottom: 12px; opacity: 0.3;">∅</div>
          <div>No log entries match the current filter.</div>
        </div>
      `;
      updateFooter();
      return;
    }

    const q = filters.search.trim();
    stream.innerHTML = logs.map(log => renderLine(log, newIds.has(log.id), q)).join('');

    // Auto-follow: scroll to bottom (newest at the visual bottom)
    if (follow && page === 1) {
      stream.scrollTop = stream.scrollHeight;
    }

    updateFooter();
  }

  function renderLine(log, isNew, q) {
    const m = catMeta(log.category);
    const isExp = expandedIds.has(log.id);
    const detailsRaw = log.details;
    const hasDetails = detailsRaw && String(detailsRaw).trim() && String(detailsRaw).trim() !== '{}';

    return `
      <div class="log-line ${isExp ? 'expanded' : ''} ${isNew ? 'new-line' : ''}" data-id="${escHtml(log.id)}">
        <span class="ll-time">${escHtml(fmtAbs(log.timestamp))}<small>${escHtml(fmtAgo(log.timestamp))}</small></span>
        <span class="ll-cat" style="color:${m.color}; background: ${m.color}18;">${escHtml(m.label)}</span>
        <span class="ll-user" title="${escHtml(log.username || 'system')}">${escHtml(log.username || 'system')}</span>
        <span class="ll-action"><span class="ll-arrow">→</span>${highlight(log.action || '—', q)}</span>
        <span class="ll-ip">${escHtml(log.ip_address || '')} <span class="ll-expand">${hasDetails ? (isExp ? '▾' : '▸') : ''}</span></span>
      </div>
      ${isExp ? renderDetails(log) : ''}
    `;
  }

  function renderDetails(log) {
    const raw = log.details;
    if (!raw || raw === '{}') return `<div class="log-details"><div class="log-details-empty">// no additional details</div></div>`;
    const highlighted = highlightJson(raw);
    const forCopy = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return `
      <div class="log-details">
        <div class="log-details-hdr">
          <span>// event details · id=${escHtml(log.id)}</span>
          <button class="log-details-copy" data-copy="${escHtml(forCopy)}">Copy JSON</button>
        </div>
        <pre>${highlighted}</pre>
      </div>
    `;
  }

  function fmtCount(n) {
    if (n == null)     return '0';
    if (n > 999999)    return `${(n / 1000000).toFixed(1)}M`;
    if (n > 999)       return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function updateCategoryCounts() {
    // Sidebar always shows GLOBAL counts (loaded once via /api/logs/categories),
    // not the current-page filter — otherwise switching to "redirect" makes every
    // other category show 0 which is misleading.
    const allEl = document.getElementById('cat-count-all');
    if (allEl) allEl.textContent = fmtCount(categoryCounts.__all);
    for (const k of Object.keys(CAT_META)) {
      const el = document.getElementById(`cat-count-${k}`);
      if (el) el.textContent = fmtCount(categoryCounts[k] || 0);
    }
    const tot = document.getElementById('logs-total');
    if (tot) tot.textContent = total.toLocaleString();
  }

  async function loadCategoryCounts() {
    try {
      const data = await window.ALPApi.getLogCategories();
      const list = data.categories || [];
      categoryCounts = { __all: 0 };
      for (const row of list) {
        const cat = row.category;
        const n   = parseInt(row.count, 10) || 0;
        categoryCounts[cat] = n;
        categoryCounts.__all += n;
      }
      updateCategoryCounts();
    } catch { /* non-fatal */ }
  }

  function updateFooter() {
    const status = document.getElementById('log-term-status');
    const slice  = document.getElementById('log-term-slice');
    const pager  = document.getElementById('log-pager');
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    if (status) {
      const parts = [];
      parts.push(`${logs.length} line${logs.length === 1 ? '' : 's'}`);
      if (filters.category) parts.push(`cat=${filters.category}`);
      if (filters.user)     parts.push(`user=${filters.user}`);
      if (filters.search)   parts.push(`grep="${filters.search}"`);
      status.textContent = `» ${parts.join(' · ')}`;
    }
    if (slice) slice.textContent = `page ${page}/${totalPages}`;

    if (pager) {
      if (totalPages <= 1) { pager.innerHTML = ''; return; }
      let html = `<button class="log-pager-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>◂ prev</button>`;
      const win = 3;
      let start = Math.max(1, page - win);
      let end   = Math.min(totalPages, start + win * 2);
      if (end - start < win * 2) start = Math.max(1, end - win * 2);
      if (start > 1) html += `<button class="log-pager-btn" data-page="1">1</button><span class="log-pager-sep">…</span>`;
      for (let i = start; i <= end; i++) {
        html += `<button class="log-pager-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }
      if (end < totalPages) html += `<span class="log-pager-sep">…</span><button class="log-pager-btn" data-page="${totalPages}">${totalPages}</button>`;
      html += `<button class="log-pager-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>next ▸</button>`;
      pager.innerHTML = html;
    }
  }

  async function loadLogs(opts = {}) {
    const stream = document.getElementById('log-stream');
    if (stream && !opts.silent) {
      stream.innerHTML = `<div class="log-empty"><div class="log-empty-spinner"></div><div>Loading audit stream…</div></div>`;
    }
    try {
      const params = {
        page, limit: perPage,
        category: filters.category || undefined,
        user:     filters.user     || undefined,
        search:   filters.search   || undefined,
        from:     filters.from     || undefined,
        to:       filters.to       || undefined,
      };
      const data = await window.ALPApi.getAuditLogs(params);
      logs  = data.logs || data.items || [];
      total = data.total || logs.length;
      // Reverse-order for terminal feel: newest at bottom when on page 1 with no filter
      // API already returns newest-first, so reverse so newest is visually at the bottom
      logs = logs.slice().reverse();
      renderStream();
    } catch (err) {
      console.error('Load logs error:', err);
      if (stream) stream.innerHTML = `<div class="log-empty" style="color:#f87171;">✗ failed to load: ${escHtml(err.message || 'error')}</div>`;
    }
  }

  async function loadUsers() {
    try {
      const data = await window.ALPApi.getUsers();
      const users = data.users || data || [];
      const select = document.getElementById('filter-user');
      const roleIcon = { god: '👑', super_admin: '⭐', admin: '🛡', viewer: '👁' };
      if (select) {
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.username;
          opt.textContent = `${roleIcon[u.role] || '👤'} ${u.username}`;
          select.appendChild(opt);
        });
      }
    } catch { /* ignore */ }
  }

  function exportCsv() {
    if (!logs.length) { window.showToast?.('Nothing to export on this page', 'warning'); return; }
    const cols = ['timestamp','username','category','action','ip_address','details'];
    const csv = [cols].concat(logs.slice().reverse().map(l => cols.map(c => {
      const v = String(l[c] == null ? '' : l[c]);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }))).map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    a.href = url; a.download = `audit-logs-page-${page}-${ts}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function init() {
    loadLogs();
    loadUsers();
    loadCategoryCounts();

    // Category clicks
    document.querySelectorAll('.log-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.log-cat').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filters.category = btn.dataset.cat;
        page = 1; expandedIds.clear();
        loadLogs();
      });
    });

    // Search (debounced)
    const search = document.getElementById('logs-search');
    if (search) {
      let debounce = null;
      search.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          filters.search = search.value.trim();
          page = 1; expandedIds.clear();
          loadLogs();
        }, 350);
      });
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { search.value = ''; filters.search = ''; page = 1; loadLogs(); }
      });
    }

    // User + dates
    const uSel = document.getElementById('filter-user');
    if (uSel) uSel.addEventListener('change', () => { filters.user = uSel.value; page = 1; expandedIds.clear(); loadLogs(); });
    const dFrom = document.getElementById('filter-date-from');
    const dTo   = document.getElementById('filter-date-to');
    if (dFrom) dFrom.addEventListener('change', () => { filters.from = dFrom.value; page = 1; loadLogs(); });
    if (dTo)   dTo.addEventListener('change',   () => { filters.to   = dTo.value;   page = 1; loadLogs(); });

    // Follow toggle
    const followEl = document.getElementById('logs-follow');
    if (followEl) followEl.addEventListener('change', () => {
      follow = followEl.checked;
      if (follow) {
        const s = document.getElementById('log-stream');
        if (s) s.scrollTop = s.scrollHeight;
      }
    });

    // Refresh
    const refresh = document.getElementById('logs-refresh');
    if (refresh) refresh.addEventListener('click', () => loadLogs());

    // Line click → expand
    const stream = document.getElementById('log-stream');
    if (stream) {
      stream.addEventListener('click', (e) => {
        // Copy button?
        const copy = e.target.closest('.log-details-copy');
        if (copy) {
          e.stopPropagation();
          navigator.clipboard.writeText(copy.getAttribute('data-copy') || '').then(() => {
            copy.classList.add('copied');
            const orig = copy.textContent;
            copy.textContent = '✓ Copied';
            setTimeout(() => { copy.classList.remove('copied'); copy.textContent = orig; }, 1200);
          });
          return;
        }
        const line = e.target.closest('.log-line');
        if (!line) return;
        const id = line.getAttribute('data-id');
        if (!id) return;
        if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
        renderStream();
      });

      // Pause follow if user scrolls up
      stream.addEventListener('scroll', () => {
        const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 60;
        if (!nearBottom && follow && followEl) {
          follow = false; followEl.checked = false;
        }
      });
    }

    // Pager
    const pager = document.getElementById('log-pager');
    if (pager) pager.addEventListener('click', (e) => {
      const btn = e.target.closest('.log-pager-btn');
      if (btn && !btn.disabled) {
        page = parseInt(btn.dataset.page, 10);
        expandedIds.clear();
        loadLogs();
      }
    });

    // Export
    const exp = document.getElementById('logs-export-btn');
    if (exp) exp.addEventListener('click', exportCsv);

    // Clear old logs
    const clearBtn = document.getElementById('clear-logs-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.showModal({
          title: 'Clear old logs',
          content: `<p style="color:var(--text-secondary);font-size:14px;margin:0 0 12px;">Permanently delete audit logs older than 30 days. This action cannot be undone.</p>
                    <p style="color:var(--color-danger);font-size:13px;margin:0;">⚠ Proceed with caution.</p>`,
          onConfirm: async () => {
            try {
              await window.ALPApi.clearOldLogs();
              window.showToast?.('Old logs cleared', 'success');
              page = 1; await loadLogs(); await loadCategoryCounts();
            } catch { window.showToast?.('Failed to clear logs', 'error'); }
          }
        });
      });
    }

    // Realtime: listen for new log events pushed via socket, if the server emits them.
    if (window.ALPSocket) {
      const handler = (log) => {
        if (!log || !log.id) return;
        // Only append when we're on page 1 and no active filter would exclude it
        if (page !== 1) return;
        if (filters.category && log.category !== filters.category) return;
        if (filters.user && log.username !== filters.user) return;
        if (filters.search && !JSON.stringify(log).toLowerCase().includes(filters.search.toLowerCase())) return;

        logs.push(log);
        if (logs.length > perPage) logs.shift();
        total = total + 1;
        // Live-bump the sidebar count for that category
        const cat = log.category || 'general';
        if (CAT_META[cat]) {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          categoryCounts.__all = (categoryCounts.__all || 0) + 1;
        }
        renderStream(new Set([log.id]));
      };
      window.ALPSocket.on('admin:log', handler);
      socketOff = () => window.ALPSocket.off('admin:log', handler);
    }
  }

  function destroy() {
    logs = []; total = 0; page = 1;
    filters = { category: '', user: '', search: '', from: '', to: '' };
    expandedIds.clear();
    if (socketOff) { socketOff(); socketOff = null; }
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') {
  window.LogsPage = LogsPage;
}
