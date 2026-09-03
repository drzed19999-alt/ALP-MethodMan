/**
 * Admin Operations Center — god role only
 * Premium dashboard for monitoring and managing all administrator accounts.
 */
const UserManagementPage = (() => {

  const PAGE_FEATURES = [
    { key: 'dashboard',      label: 'Command Center', section: 'Recon'    },
    { key: 'sessions',       label: 'Live Feed',      section: 'Recon'    },
    { key: 'demo-pages',     label: 'Sites',          section: 'Ops'      },
    { key: 'captured-data',  label: 'Captures',       section: 'Ops'      },
    { key: 'analytics',      label: 'Intel',          section: 'Ops'      },
    { key: 'domains',        label: 'Domains',        section: 'Ops'      },
    { key: 'vps',            label: 'Servers',         section: 'Ops'      },
    { key: 'bin-lookup',     label: 'BIN Lookup',     section: 'Tools'    },
    { key: 'cc-checker',     label: 'CC Checker',     section: 'Tools'    },
    { key: 'ip-blocking',    label: 'IP Shield',      section: 'Defense'  },
    { key: 'rate-limits',    label: 'Rate Guard',     section: 'Defense'  },
    { key: 'firewall-rules', label: 'Firewall',       section: 'Defense'  },
    { key: 'notifications',  label: 'Alerts',         section: 'System'   },
    { key: 'logs',           label: 'Audit Trail',    section: 'System'   },
    { key: 'settings',       label: 'Config',         section: 'System'   },
  ];

  const ROLE_META = {
    god:         { label: 'God Admin',   cls: 'badge-warning',   icon: '👑', color: '#D4AF37',              bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.3)',
                   avatarBg: 'linear-gradient(135deg, #FFD86E, #B8860B)',        avatarStroke: '#FFF8E1' },
    super_admin: { label: 'Super Admin', cls: 'badge-info',      icon: '⭐', color: 'var(--color-info)',    bg: 'var(--color-info-muted)',    border: 'rgba(59,130,246,0.3)',
                   avatarBg: 'linear-gradient(135deg, #60a5fa, #2563eb)',        avatarStroke: '#dbeafe' },
    admin:       { label: 'Admin',       cls: 'badge-success',   icon: '🔧', color: 'var(--color-success)', bg: 'var(--color-success-muted)', border: 'rgba(34,197,94,0.3)',
                   avatarBg: 'linear-gradient(135deg, #34d399, #059669)',        avatarStroke: '#d1fae5' },
    viewer:      { label: 'Viewer',      cls: 'badge-secondary', icon: '👁',  color: 'var(--text-secondary)', bg: 'rgba(150,150,150,0.1)',     border: 'rgba(150,150,150,0.2)',
                   avatarBg: 'linear-gradient(135deg, #94a3b8, #475569)',        avatarStroke: '#e2e8f0' },
  };

  // Emoji-style role badge shown in the bottom-right of the avatar.
  const ROLE_BADGE = { god: '👑', super_admin: '⭐', admin: '🛡', viewer: '👁' };
  const ROLE_BADGE_COLOR = {
    god:         '#D4AF37',
    super_admin: '#8b5cf6',
    admin:       '#10b981',
    viewer:      '#94a3b8',
  };

  /**
   * Build an avatar circle for a user using the same procedural face art as
   * the Live Sessions page (SessionTemplates.sessionFaceSvg), tinted by the
   * user's role. Adds a small role badge (crown / star / shield / eye) in
   * the bottom-right corner.
   *
   * `extra` is HTML injected into the outer wrapper (e.g. an online-dot).
   */
  function _renderAvatar(user, size = 36, extra = '') {
    const meta = ROLE_META[user.role] || ROLE_META.viewer;
    const badgeChar = ROLE_BADGE[user.role] || '';
    const badgeColor = ROLE_BADGE_COLOR[user.role] || '#94a3b8';
    // Fall back to the flat gradient if SessionTemplates hasn't loaded yet
    // (e.g. tests) — keeps the layout stable in either case.
    const face = (window.SessionTemplates && window.SessionTemplates.sessionFaceSvg)
      ? window.SessionTemplates.sessionFaceSvg(user.username || user.id || 'x', badgeColor)
      : `<div style="width:100%;height:100%;border-radius:50%;background:${meta.avatarBg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${Math.round(size*.42)}px;">${(user.username||'?')[0].toUpperCase()}</div>`;

    // Badge size scales with avatar. Anchor bottom-right, ring cut with a
    // matching background box-shadow so it reads as sitting "outside" the face.
    const bSize = Math.max(14, Math.round(size * 0.42));
    const bFont = Math.max(9, Math.round(bSize * 0.62));
    const badgeHtml = badgeChar ? `
      <span title="${meta.label}" style="position:absolute;bottom:-2px;right:-2px;width:${bSize}px;height:${bSize}px;border-radius:50%;background:${badgeColor};color:#fff;font-size:${bFont}px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--bg-secondary),0 2px 6px rgba(0,0,0,.5);line-height:1;">${badgeChar}</span>` : '';

    return `
      <div style="width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;position:relative;overflow:visible;"
           title="${meta.label}${user.username ? ' — ' + user.username : ''}">
        <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;">${face}</div>
        ${badgeHtml}
        ${extra}
      </div>`;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let _users = [];
  let _stats = null;
  let _onlineIds = new Set();
  let _filterRole = 'all';
  let _filterStatus = 'all';
  let _searchQuery = '';
  let _sortBy = 'last_login';
  let _drawerUserId = null;
  let _drawerTab = 'overview';
  let _refreshTimer = null;
  let _presenceUnsub = null;
  let _allWebsites = null; // cached list of every website (id, name, domain, logo_url)
  let _outsideClickHandler = null;
  // Monotonic token used to drop stale async tab renders — every switchDrawerTab
  // bumps this, and the previous in-flight fetch's DOM writes are ignored.
  let _drawerTabToken = 0;
  // Server-authoritative catalog of per-page actions (fetched once, cached).
  // Shape: { [pageKey]: { label, section, actions: [{key,label}] } }
  let _actionCatalog = null;

  // Per-tab search strings for the owned lists in Websites / VPS
  const _drawerOwnedQuery = { website: '', vps: '' };
  // History tab filters
  let _historyFilter = 'all';       // 'all' | 'success' | 'failed'
  let _historyQuery = '';
  // Cache of one user's recent activity feed (loaded once per drawer open)
  let _drawerActivity = null;
  // Password reveal / force-change / strength UI state
  const _pwState = { visible: true, forceChange: false };
  // Which page cards are expanded (to show/hide their action toggles).
  const _expandedPerms = new Set();

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    return `
      <style>
        .um-stats-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:20px; }
        @media(max-width:1100px){ .um-stats-grid { grid-template-columns:repeat(3,1fr); } }
        @media(max-width:700px) { .um-stats-grid { grid-template-columns:repeat(2,1fr); } }
        .um-stat-card { background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:var(--radius-xl); padding:18px 20px; display:flex; align-items:center; gap:14px; transition:all var(--transition-base); cursor:default; }
        .um-stat-card:hover { border-color:var(--border-hover); transform:translateY(-1px); box-shadow:var(--shadow-md); }
        .um-stat-icon { width:44px; height:44px; border-radius:var(--radius-lg); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
        .um-stat-val { font-size:26px; font-weight:800; line-height:1; color:var(--text-primary); }
        .um-stat-lbl { font-size:11px; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:.5px; margin-top:3px; }

        .um-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
        .um-search-wrap { position:relative; flex:1; min-width:200px; }
        .um-search-wrap svg { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--text-secondary); pointer-events:none; }
        .um-search-input { width:100%; background:var(--bg-input); border:1px solid var(--border-primary); border-radius:var(--radius-md); padding:8px 12px 8px 34px; color:var(--text-primary); font-size:13px; outline:none; transition:border-color var(--transition-fast); }
        .um-search-input:focus { border-color:var(--accent-primary); }
        .um-select { background:var(--bg-input); border:1px solid var(--border-primary); border-radius:var(--radius-md); padding:8px 12px; color:var(--text-primary); font-size:13px; cursor:pointer; outline:none; }

        .um-table { width:100%; border-collapse:collapse; }
        .um-table th { padding:10px 14px; text-align:left; font-size:10px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid var(--border-primary); white-space:nowrap; }
        .um-table td { padding:12px 14px; border-bottom:1px solid var(--border-primary); vertical-align:middle; }
        .um-table tbody tr { transition:background var(--transition-fast); cursor:pointer; }
        .um-table tbody tr:hover { background:var(--bg-hover); }
        .um-table tbody tr:last-child td { border-bottom:none; }

        .um-online-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; transition:background var(--transition-normal); }
        .um-online-dot.online  { background:var(--color-success); box-shadow:0 0 6px var(--color-success); }
        .um-online-dot.offline { background:var(--text-muted); }

        .um-role-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:var(--radius-pill); font-size:11px; font-weight:700; border:1px solid; white-space:nowrap; }
        .um-suspended-tag { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:var(--radius-pill); font-size:10px; font-weight:700; color:var(--color-danger); background:var(--color-danger-muted); border:1px solid rgba(239,68,68,.3); margin-left:6px; }

        .um-action-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:var(--radius-md); font-size:12px; font-weight:600; border:1px solid var(--border-primary); background:transparent; color:var(--text-secondary); cursor:pointer; transition:all var(--transition-fast); }
        .um-action-btn:hover { background:var(--bg-hover); color:var(--text-primary); border-color:var(--border-hover); }
        .um-action-btn.danger:hover { background:var(--color-danger-muted); color:var(--color-danger); border-color:rgba(239,68,68,.3); }
        .um-action-btn.gold { color:var(--accent-primary); border-color:rgba(212,175,55,.3); }
        .um-action-btn.gold:hover { background:var(--accent-primary-muted); border-color:rgba(212,175,55,.5); }

        .um-bottom-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:20px; }
        @media(max-width:800px){ .um-bottom-grid { grid-template-columns:1fr; } }
        .um-section-title { font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.6px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }

        .um-log-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-primary); }
        .um-log-item:last-child { border-bottom:none; }
        .um-log-icon { width:28px; height:28px; border-radius:var(--radius-sm); background:var(--bg-tertiary); display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; margin-top:1px; }
        .um-alert-item { display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--color-danger-muted); border:1px solid rgba(239,68,68,.2); border-radius:var(--radius-md); margin-bottom:8px; }

        /* Profile Drawer — no overlay; click-outside-to-close handled via document listener so sidebar/header stay clickable while drawer is open. */
        #um-drawer-overlay { display:none !important; }
        #um-drawer-panel {
          position:fixed; top:0; right:0; width:440px; height:100vh;
          background:var(--bg-secondary);
          border-left:1px solid var(--border-primary);
          z-index:calc(var(--z-overlay)+1);
          display:flex; flex-direction:column; overflow:hidden;
          transform:translateX(100%);
          transition:transform var(--duration-slow) var(--ease-out);
          box-shadow: -20px 0 60px rgba(0,0,0,0.4), var(--shadow-xl);
        }
        #um-drawer-panel.open { transform:translateX(0); }
        @media(max-width:520px){ #um-drawer-panel { width:100%; } }
        .um-drawer-header {
          padding:16px 20px;
          border-bottom:1px solid var(--border-primary);
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; flex-shrink:0;
          background: linear-gradient(180deg, rgba(139,92,246,0.06), transparent);
        }
        .um-drawer-header-title {
          display:flex; align-items:center; gap:10px;
          font-size:14px; font-weight:800; color:var(--text-primary);
          letter-spacing:.02em;
        }
        .um-drawer-header-icon {
          width:32px; height:32px; border-radius:9px;
          display:flex; align-items:center; justify-content:center;
          background: linear-gradient(135deg, rgba(139,92,246,.18), rgba(139,92,246,.06));
          border: 1px solid rgba(139,92,246,.28);
          color:#a78bfa;
        }
        .um-drawer-body { flex:1; overflow-y:auto; padding:20px; }
        .um-drawer-close-btn {
          width:32px; height:32px; padding:0;
          display:flex; align-items:center; justify-content:center;
          background: rgba(255,255,255,.04);
          border:1px solid var(--border-primary);
          border-radius:9px; color:var(--text-secondary);
          cursor:pointer; transition:all .18s ease;
        }
        .um-drawer-close-btn:hover {
          background: rgba(239,68,68,.1);
          border-color: rgba(239,68,68,.3);
          color:#f87171;
          transform: rotate(90deg);
        }
        .um-drawer-tabs { display:flex; gap:4px; margin-bottom:20px; background:var(--bg-tertiary); border-radius:var(--radius-md); padding:3px; }
        .um-drawer-tab { flex:1; padding:7px 12px; border-radius:var(--radius-sm); font-size:12px; font-weight:600; text-align:center; cursor:pointer; color:var(--text-secondary); transition:all var(--transition-fast); border:none; background:transparent; }
        .um-drawer-tab.active { background:var(--bg-secondary); color:var(--text-primary); box-shadow:var(--shadow-sm); }
        .um-drawer-footer { padding:16px 20px; border-top:1px solid var(--border-primary); display:flex; gap:8px; flex-shrink:0; background: var(--bg-tertiary); }

        /* Empty-state hero when the drawer is open but no user is picked */
        .um-empty-hero {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:16px; padding:48px 24px; text-align:center;
          min-height: 60vh;
        }
        .um-empty-hero-icon {
          width:88px; height:88px; border-radius:22px;
          display:flex; align-items:center; justify-content:center;
          background: linear-gradient(135deg, rgba(139,92,246,.14), rgba(56,189,248,.08));
          border:1px solid rgba(139,92,246,.25);
          color:#a78bfa;
          animation: umHeroFloat 3.2s ease-in-out infinite;
        }
        @keyframes umHeroFloat {
          0%,100% { transform: translateY(0); box-shadow: 0 0 0 rgba(139,92,246,0); }
          50%     { transform: translateY(-6px); box-shadow: 0 12px 32px rgba(139,92,246,.25); }
        }
        .um-empty-hero h3 {
          font-size:16px; font-weight:700; color:var(--text-primary); margin:0;
        }
        .um-empty-hero p {
          font-size:12.5px; color:var(--text-secondary); margin:0;
          line-height:1.55; max-width:280px;
        }
        .um-empty-hero-hints {
          display:flex; flex-direction:column; gap:6px; margin-top:8px; width:100%; max-width:260px;
        }
        .um-empty-hero-hint {
          display:flex; align-items:center; gap:10px;
          padding:8px 12px;
          background: var(--bg-tertiary);
          border:1px solid var(--border-primary);
          border-radius:10px;
          font-size:11.5px; color:var(--text-secondary);
        }
        .um-empty-hero-hint kbd {
          padding:2px 6px; border-radius:5px;
          background: var(--bg-secondary);
          border:1px solid var(--border-primary);
          font-family: var(--font-mono); font-size:10px;
          color:var(--text-primary);
        }
        @media (prefers-reduced-motion: reduce) {
          .um-empty-hero-icon { animation: none !important; }
          .um-drawer-close-btn:hover { transform: none !important; }
        }

        .um-history-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-primary); font-size:12px; }
        .um-history-row:last-child { border-bottom:none; }
        .um-perm-section { margin-bottom:14px; }
        .um-perm-section-title { font-size:10px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.6px; margin-bottom:8px; }
        .um-perm-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .um-perm-chip { display:flex; align-items:center; gap:5px; padding:5px 9px; border-radius:var(--radius-sm); border:1px solid var(--border-primary); background:var(--bg-tertiary); font-size:12px; cursor:pointer; transition:all var(--transition-fast); }
        .um-perm-chip.blocked { opacity:.45; }
        .um-perm-card { border:1px solid var(--border-primary); border-radius:var(--radius-md); background:var(--bg-tertiary); transition:opacity var(--transition-fast); }
        .um-perm-card.blocked { opacity:.5; }
        .um-perm-card-head { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; gap:8px; }
        .um-perm-master { display:flex; align-items:center; gap:8px; cursor:pointer; flex:1; min-width:0; }
        .um-perm-expand { background:transparent; border:none; padding:4px 6px; border-radius:var(--radius-sm); color:var(--text-secondary); cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .um-perm-expand:hover { background:var(--bg-hover); color:var(--text-primary); }
        .um-perm-actions { display:flex; flex-direction:column; gap:4px; padding:6px 10px 10px 32px; border-top:1px dashed var(--border-primary); }
        .um-perm-action { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; color:var(--text-secondary); padding:3px 4px; border-radius:var(--radius-sm); }
        .um-perm-action:hover { color:var(--text-primary); background:var(--bg-hover); }
        .um-perm-action input:disabled + span { opacity:.4; }
        .um-info-row { display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--border-primary); font-size:13px; }
        .um-info-row:last-child { border-bottom:none; }
        .um-info-label { color:var(--text-secondary); font-size:12px; }

        /* ── Drawer picker combobox (Websites / VPS give-picker) ─────────── */
        .um-picker { position:relative; flex:1; min-width:0; }
        .um-picker-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 12px; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:8px; color:var(--text-primary); font-size:12.5px; font-family:'Inter',sans-serif; cursor:pointer; text-align:left; transition:border-color .15s; }
        .um-picker-trigger:hover:not(:disabled), .um-picker-trigger.open { border-color:var(--accent-primary); }
        .um-picker-trigger:disabled { opacity:.5; cursor:not-allowed; }
        .um-picker-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .um-picker-arrow { flex-shrink:0; opacity:.6; transition:transform .15s; }
        .um-picker-trigger.open .um-picker-arrow { transform:rotate(180deg); }
        .um-picker-panel { position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:9999; background:var(--bg-elevated); border:1px solid var(--accent-primary); border-radius:10px; box-shadow:0 12px 32px rgba(0,0,0,.5); display:none; flex-direction:column; max-height:340px; overflow:hidden; }
        .um-picker-panel.open { display:flex; }
        .um-picker-search-wrap { padding:8px; border-bottom:1px solid var(--border-primary); background:var(--bg-tertiary); }
        .um-picker-search { width:100%; box-sizing:border-box; background:var(--bg-secondary); border:1px solid var(--border-primary); color:var(--text-primary); border-radius:6px; padding:6px 10px; font-size:12px; font-family:'Inter',sans-serif; outline:none; }
        .um-picker-search:focus { border-color:var(--accent-primary); }
        .um-picker-list { overflow-y:auto; padding:4px 0; flex:1; }
        .um-picker-item { display:flex; align-items:center; gap:8px; padding:8px 12px; font-size:12.5px; color:var(--text-primary); cursor:pointer; transition:background .1s; }
        .um-picker-item:hover { background:var(--bg-hover); }
        .um-picker-item-icon { flex-shrink:0; font-size:14px; width:20px; text-align:center; }
        .um-picker-item-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .um-picker-item-hint { font-size:10px; color:var(--text-muted); flex-shrink:0; font-style:italic; }
        .um-picker-empty { padding:16px; text-align:center; color:var(--text-muted); font-size:12px; }

        /* ── Password strength meter (Overview → Quick Edit) ─────────────── */
        .um-pw-meter { height:4px; background:var(--bg-tertiary); border-radius:2px; overflow:hidden; margin-top:6px; display:flex; gap:2px; }
        .um-pw-meter-seg { flex:1; background:transparent; transition:background .18s; border-radius:1px; }
        .um-pw-meter-seg.on-weak   { background:#ef4444; }
        .um-pw-meter-seg.on-ok     { background:#f59e0b; }
        .um-pw-meter-seg.on-good   { background:#3b82f6; }
        .um-pw-meter-seg.on-strong { background:#10b981; }
        .um-pw-hint { display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--text-muted); margin-top:5px; }

        /* ── Overview stat pills (top of drawer) ──────────────────────────── */
        .um-hero-stats { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .um-hero-stat { flex:1; min-width:0; padding:10px 12px; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:8px; text-align:center; }
        .um-hero-stat-val { font-size:18px; font-weight:800; color:var(--text-primary); font-variant-numeric:tabular-nums; }
        .um-hero-stat-lbl { font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-top:2px; }
        .um-hero-stat--bad { border-color:rgba(239,68,68,.3); background:rgba(239,68,68,.06); }
        .um-hero-stat--bad .um-hero-stat-val { color:#f87171; }
        .um-hero-stat--good { border-color:rgba(16,185,129,.3); background:rgba(16,185,129,.06); }
        .um-hero-stat--good .um-hero-stat-val { color:#34d399; }

        /* Security-posture badge */
        .um-posture { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; }
        .um-posture--green  { background:rgba(16,185,129,.12); color:#10b981; border:1px solid rgba(16,185,129,.28); }
        .um-posture--amber  { background:rgba(245,158,11,.12); color:#f59e0b; border:1px solid rgba(245,158,11,.28); }
        .um-posture--red    { background:rgba(239,68,68,.12); color:#f87171; border:1px solid rgba(239,68,68,.28); }

        /* History tab filter chips */
        .um-hist-chips { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
        .um-hist-chip { padding:4px 10px; font-size:11px; font-weight:600; border-radius:12px; background:var(--bg-tertiary); color:var(--text-secondary); border:1px solid var(--border-primary); cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
        .um-hist-chip:hover { color:var(--text-primary); background:var(--bg-hover); }
        .um-hist-chip--active { background:var(--accent-primary); color:var(--text-inverse); border-color:var(--accent-primary); }
        .um-hist-map { display:flex; gap:6px; padding:8px 12px; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:8px; font-size:11px; color:var(--text-secondary); margin-bottom:10px; flex-wrap:wrap; }

        /* Permission preset selector */
        .um-perm-preset-bar { display:flex; align-items:center; gap:8px; padding:10px 12px; background:linear-gradient(145deg, rgba(139,92,246,.06), transparent); border:1px solid rgba(139,92,246,.16); border-radius:8px; margin-bottom:12px; flex-wrap:wrap; }
        .um-perm-preset-lbl { font-size:11px; font-weight:700; color:#a78bfa; text-transform:uppercase; letter-spacing:.05em; flex-shrink:0; }
        .um-perm-preset-select { background:var(--bg-secondary); border:1px solid var(--border-primary); color:var(--text-primary); border-radius:6px; padding:5px 10px; font-size:12px; font-family:'Inter',sans-serif; flex:1; min-width:0; }
        .um-perm-save-sticky { position:sticky; bottom:0; padding:12px 0; background:linear-gradient(to top, var(--bg-secondary) 70%, transparent); margin-top:16px; z-index:5; }
      </style>

      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <div>
          <div class="ph" style="--ph-accent:#8b5cf6;--ph-glow:rgba(139,92,246,0.5)">
            <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>TEAM · OPS CENTER</div>
            <h1 class="ph-title">
              <span class="ph-title-glyph">⊕</span>
              <span class="ph-title-text">Team</span>
              <span id="um-live-badge" class="ph-title-badge" style="--ph-accent:#22c55e;color:#22c55e;display:none;">● Live</span>
            </h1>
            <p class="ph-sub">Monitor and manage all administrator accounts <span class="ph-sub-sep">·</span> real-time presence tracking</p>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" id="um-refresh-btn" title="Refresh" style="padding:8px 12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
          <button class="btn btn-primary" id="um-add-btn" style="display:flex;align-items:center;gap:7px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Admin
          </button>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="um-stats-grid" id="um-stats">
        ${[0,1,2,3,4].map(() => `<div class="alp-skeleton alp-skeleton--stat"></div>`).join('')}
      </div>

      <!-- Toolbar -->
      <div class="um-toolbar">
        <div class="um-search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <!--
            type="search" + a randomized name + explicit no-suggest attrs stop
            Chrome / Firefox / password managers from autofilling with prior
            login values (was surfacing "godadmin" and filtering the table).
          -->
          <input
            class="um-search-input"
            id="um-search"
            type="search"
            placeholder="Search by name or email…"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            name="um-search-${Math.random().toString(36).slice(2, 10)}"
            data-lpignore="true"
            data-form-type="other"
            data-1p-ignore="true">
        </div>
        <select class="um-select" id="um-filter-role" title="Filter by role">
          <option value="all">All Roles</option>
          <option value="god">👑 God Admin</option>
          <option value="super_admin">⭐ Super Admin</option>
          <option value="admin">🔧 Admin</option>
          <option value="viewer">👁 Viewer</option>
        </select>
        <select class="um-select" id="um-filter-status" title="Filter by status">
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="suspended">Suspended</option>
        </select>
        <select class="um-select" id="um-sort-by" title="Sort by">
          <option value="last_login">Last Login</option>
          <option value="name">Name A–Z</option>
          <option value="role">Role</option>
          <option value="status">Status</option>
        </select>
      </div>

      <!-- Users table -->
      <div class="card" style="padding:0;overflow:hidden;">
        <div id="um-table-wrap">
          <div style="padding:16px;">
            ${[1,2,3,4].map(() => `<div class="alp-skeleton-row"><div class="alp-skeleton alp-skeleton--line" style="width:25%"></div><div class="alp-skeleton alp-skeleton--line" style="width:40%"></div><div class="alp-skeleton alp-skeleton--line" style="width:15%"></div></div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Bottom: Audit feed + Security alerts -->
      <div class="um-bottom-grid">
        <div class="card" style="padding:0;overflow:hidden;position:relative;">
          <a href="#/logs?category=auth" style="position:absolute;top:10px;right:14px;z-index:2;font-size:11px;color:var(--accent-primary);text-decoration:none;font-weight:600;">View All →</a>
          <div id="um-audit-feed" style="min-height:260px;"></div>
        </div>
        <div class="card" style="padding:20px;">
          <div class="um-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Security Alerts
            <span id="um-alert-badge" style="display:none;background:var(--color-danger);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:var(--radius-pill);">0</span>
          </div>
          <div id="um-alerts-wrap">
            <div style="text-align:center;color:var(--text-secondary);padding:24px;font-size:13px;">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Profile Drawer (outside page flow) -->
      <div id="um-drawer-overlay"></div>
      <div id="um-drawer-panel">
        <div class="um-drawer-header">
          <div class="um-drawer-header-title">
            <span class="um-drawer-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </span>
            <span>Admin Profile</span>
          </div>
          <button class="um-drawer-close-btn" id="um-drawer-close" aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="um-drawer-body" id="um-drawer-content">
          <div class="um-empty-hero">
            <div class="um-empty-hero-icon">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h3>No admin selected</h3>
            <p>Click a row in the table on the left to open that admin's profile — permissions, sessions, activity and more.</p>
            <div class="um-empty-hero-hints">
              <div class="um-empty-hero-hint">
                <kbd>Esc</kbd>
                <span>Close this panel</span>
              </div>
              <div class="um-empty-hero-hint">
                <kbd>Click outside</kbd>
                <span>Dismiss and continue browsing</span>
              </div>
            </div>
          </div>
        </div>
        <div class="um-drawer-footer" id="um-drawer-footer" style="display:none;"></div>
      </div>
    `;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    document.getElementById('um-add-btn').addEventListener('click', openCreateModal);
    document.getElementById('um-refresh-btn').addEventListener('click', () => loadAll());
    document.getElementById('um-search').addEventListener('input', _debounce(e => { _searchQuery = e.target.value.trim(); renderTable(); }, 250));
    document.getElementById('um-filter-role').addEventListener('change', e => { _filterRole = e.target.value; renderTable(); });
    document.getElementById('um-filter-status').addEventListener('change', e => { _filterStatus = e.target.value; renderTable(); });
    document.getElementById('um-sort-by').addEventListener('change', e => { _sortBy = e.target.value; renderTable(); });
    document.getElementById('um-drawer-close').addEventListener('click', closeDrawer);
    // Event delegation for permission-card expand buttons (rendered dynamically).
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-perm-expand]');
      if (btn) _togglePermExpand(btn.getAttribute('data-perm-expand'));
    });
    // Escape key closes drawer too.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _drawerUserId != null) closeDrawer();
    });

    // Socket presence
    if (window.ALPSocket) {
      _presenceUnsub = (online) => {
        _onlineIds = new Set(online.map(u => u.userId));
        _updateOnlineDots();
        _refreshStatOnlineCount();
      };
      window.ALPSocket.on('admin:presence', _presenceUnsub);
      document.getElementById('um-live-badge').style.display = 'inline-flex';
    }

    // Listen for forced session termination from another god
    if (window.ALPSocket) {
      window.ALPSocket.on('admin:session-terminated', (data) => {
        window.showToast(data?.message || 'Your session was terminated by an administrator.', 'error');
        setTimeout(() => { if (window.ALPAuth) window.ALPAuth.logout(); }, 2000);
      });
    }

    await loadAll();
    _refreshTimer = setInterval(() => loadAll(false), 30000);
  }

  // ── Data Loading ──────────────────────────────────────────────────────────

  async function loadAll(showSpinner = true) {
    try {
      // Bust the website list cache so a freshly-created site shows up on refresh.
      _allWebsites = null;
      const [usersRes, statsRes] = await Promise.all([
        window.ALPApi.godGetUsers(),
        window.ALPApi.godGetStats().catch(() => null),
      ]);

      _users = usersRes.users || [];
      _stats = statsRes;

      if (statsRes) {
        _onlineIds = new Set(statsRes.onlineIds || []);
      } else {
        try {
          const pRes = await window.ALPApi.godGetPresence();
          _onlineIds = new Set((pRes.online || []).map(u => u.userId));
        } catch {}
      }

      renderStats();
      renderTable();
      await Promise.all([renderAuditFeed(), renderAlerts()]);
    } catch (err) {
      document.getElementById('um-table-wrap').innerHTML =
        `<div style="padding:32px;text-align:center;color:var(--color-danger);">Failed to load: ${err.message}</div>`;
    }
  }

  // ── Stats Cards ───────────────────────────────────────────────────────────

  function renderStats() {
    const s = _stats || {};
    const byRole = s.byRole || {};
    const total = s.total ?? _users.length;
    const online = _onlineIds.size;
    const sessions = s.activeSessions ?? 0;
    const logins24h = s.recentLogins ?? 0;
    const failed24h = s.failedLogins ?? 0;

    const cards = [
      { icon: '👥', color: 'var(--color-info)',    bg: 'var(--color-info-muted)',    val: total,     lbl: 'Total Admins',     sub: _buildRoleSummary(byRole) },
      { icon: '🟢', color: 'var(--color-success)', bg: 'var(--color-success-muted)', val: online,    lbl: 'Online Now',       sub: online === 1 ? '1 session active' : `${online} sessions active` },
      { icon: '🔐', color: 'var(--accent-primary)', bg: 'var(--accent-primary-muted)', val: sessions, lbl: 'Active Sessions',  sub: 'stored session tokens' },
      { icon: '📊', color: 'var(--color-info)',    bg: 'var(--color-info-muted)',    val: logins24h, lbl: 'Logins (24h)',     sub: 'successful sign-ins' },
      { icon: '⚠️', color: failed24h > 0 ? 'var(--color-danger)' : 'var(--text-secondary)', bg: failed24h > 0 ? 'var(--color-danger-muted)' : 'var(--bg-tertiary)', val: failed24h, lbl: 'Failed (24h)', sub: 'failed login attempts' },
    ];

    document.getElementById('um-stats').innerHTML = cards.map(c => `
      <div class="um-stat-card">
        <div class="um-stat-icon" style="background:${c.bg};font-size:18px;">${c.icon}</div>
        <div>
          <div class="um-stat-val" style="color:${c.color};">${c.val}</div>
          <div class="um-stat-lbl">${c.lbl}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${c.sub}</div>
        </div>
      </div>
    `).join('');
  }

  function _buildRoleSummary(byRole) {
    const parts = [];
    if (byRole.god)         parts.push(`${byRole.god} god`);
    if (byRole.super_admin) parts.push(`${byRole.super_admin} super`);
    if (byRole.admin)       parts.push(`${byRole.admin} admin`);
    if (byRole.viewer)      parts.push(`${byRole.viewer} viewer`);
    return parts.join(' · ') || 'no users';
  }

  function _refreshStatOnlineCount() {
    const el = document.querySelector('#um-stats .um-stat-card:nth-child(2) .um-stat-val');
    if (el) el.textContent = _onlineIds.size;
  }

  // ── User Table ────────────────────────────────────────────────────────────

  function _getFilteredUsers() {
    let list = [..._users];
    const q = _searchQuery.toLowerCase();
    if (q) list = list.filter(u => (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    if (_filterRole !== 'all') list = list.filter(u => u.role === _filterRole);
    if (_filterStatus === 'online')    list = list.filter(u => _onlineIds.has(u.id));
    if (_filterStatus === 'offline')   list = list.filter(u => !_onlineIds.has(u.id));
    if (_filterStatus === 'suspended') list = list.filter(u => _isSuspended(u));

    const roleOrder = { god: 0, super_admin: 1, admin: 2, viewer: 3 };
    list.sort((a, b) => {
      if (_sortBy === 'name')      return (a.username || '').localeCompare(b.username || '');
      if (_sortBy === 'role')      return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (_sortBy === 'status')    return (_onlineIds.has(b.id) ? 1 : 0) - (_onlineIds.has(a.id) ? 1 : 0);
      // default: last_login desc
      return new Date(b.last_login || 0) - new Date(a.last_login || 0);
    });
    return list;
  }

  function _isSuspended(u) {
    const p = u.permissions || {};
    return !!(typeof p === 'object' ? p.suspended : false);
  }

  function renderTable() {
    const me = window.ALPAuth.getUser();
    const list = _getFilteredUsers();

    if (!list.length) {
      document.getElementById('um-table-wrap').innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--text-secondary);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;opacity:.4;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          No accounts match the current filters.
        </div>`;
      return;
    }

    const rows = list.map(u => {
      const rm = ROLE_META[u.role] || ROLE_META.viewer;
      const isSelf = Number(u.id) === Number(me?.userId);
      const isGodUser = u.role === 'god';
      const isOnline = _onlineIds.has(u.id);
      const suspended = _isSuspended(u);
      const lastLoginText = u.last_login ? _relTime(u.last_login) : 'Never';
      const permsPages = (u.permissions && u.permissions.pages) || {};
      const blockedCount = PAGE_FEATURES.filter(f => permsPages[f.key] === false).length;
      const pagesText = isGodUser ? 'All pages' : blockedCount === 0 ? `${PAGE_FEATURES.length} pages` : `${PAGE_FEATURES.length - blockedCount}/${PAGE_FEATURES.length} pages`;
      const siteCount = typeof u.owned_websites === 'number' ? u.owned_websites : 0;
      const sitesText = isGodUser ? 'All sites' : (siteCount === 0 ? '⚠ 0 sites' : `${siteCount} site${siteCount === 1 ? '' : 's'}`);
      const accessText = `${sitesText} · ${pagesText}`;
      const avatar = _renderAvatar(u, 36, `
        <span class="um-online-dot ${isOnline?'online':'offline'}" data-user-online-id="${u.id}" style="position:absolute;bottom:0;right:0;width:9px;height:9px;box-shadow:0 0 0 2px var(--bg-secondary);"></span>
      `);

      const actionBtns = isGodUser ? `<span style="font-size:11px;color:var(--text-muted);">Protected</span>` : `
        <button class="um-action-btn gold" onclick="event.stopPropagation();UserManagementPage._openEdit(${u.id})" title="Edit">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        ${!isSelf ? `
          <button class="um-action-btn ${suspended?'':'danger'}" onclick="event.stopPropagation();UserManagementPage._toggleSuspend(${u.id})" title="${suspended?'Activate':'Suspend'}">
            ${suspended
              ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Activate`
              : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Suspend`}
          </button>
          <button class="um-action-btn danger" onclick="event.stopPropagation();UserManagementPage._confirmDelete(${u.id})" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete
          </button>
        ` : ''}
      `;

      return `
        <tr data-user-id="${u.id}" onclick="UserManagementPage._openDrawer(${u.id})" title="View profile">
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar}
              <div>
                <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;">
                  ${u.username}${isSelf ? '<span style="font-size:10px;color:var(--text-muted);">(you)</span>' : ''}
                  ${suspended ? '<span class="um-suspended-tag">⛔ Suspended</span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--text-secondary);">${u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="um-role-badge" style="color:${rm.color};background:${rm.bg};border-color:${rm.border};">${rm.icon} ${rm.label}</span>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="um-online-dot ${isOnline?'online':'offline'}" data-user-online-id="${u.id}"></span>
              <span data-user-status-id="${u.id}" style="font-size:12px;color:${isOnline?'var(--color-success)':'var(--text-secondary)'};">
                ${isOnline ? 'Online' : lastLoginText}
              </span>
            </div>
          </td>
          <td style="font-size:12px;color:var(--text-secondary);">${lastLoginText}</td>
          <td style="font-size:12px;color:var(--text-secondary);">${accessText}</td>
          <td style="font-size:12px;color:var(--text-secondary);" onclick="event.stopPropagation();">
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">
              ${actionBtns}
            </div>
          </td>
        </tr>`;
    }).join('');

    document.getElementById('um-table-wrap').innerHTML = `
      <table class="um-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Page Access</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function _updateOnlineDots() {
    document.querySelectorAll('[data-user-online-id]').forEach(el => {
      const id = parseInt(el.dataset.userOnlineId);
      const on = _onlineIds.has(id);
      el.className = `um-online-dot ${on ? 'online' : 'offline'}`;
    });
    document.querySelectorAll('[data-user-status-id]').forEach(el => {
      const id = parseInt(el.dataset.userStatusId);
      const on = _onlineIds.has(id);
      el.style.color = on ? 'var(--color-success)' : 'var(--text-secondary)';
      if (on) el.textContent = 'Online';
      else {
        const u = _users.find(x => x.id === id);
        el.textContent = u?.last_login ? _relTime(u.last_login) : 'Offline';
      }
    });
  }

  // ── Audit Feed ────────────────────────────────────────────────────────────

  async function renderAuditFeed() {
    const el = document.getElementById('um-audit-feed');
    if (!el) return;

    // Mount the reusable Mac-style terminal so the feed shares the same look
    // as deploy/health streams. Idempotent — mount once, then just log().
    if (!el._term && window.AlpTerminal) {
      el._term = window.AlpTerminal.mount(el, {
        title: 'auth.log — recent authentication events',
      });
      el._term.setStatus('running');
    }
    const term = el._term;
    if (!term) {
      // Fallback for environments where AlpTerminal isn't loaded.
      el.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:8px;">Terminal component unavailable.</div>';
      return;
    }

    try {
      const { logs } = await window.ALPApi.getLogs({ category: 'auth', limit: 20 });
      term.clear();
      if (!logs || !logs.length) {
        term.log('$ tail -f audit.log', { color: '#94a3b8' });
        term.log('(no recent activity)', { color: '#64748b' });
        term.setStatus('idle');
        return;
      }
      term.log('$ tail -n 20 audit.log', { color: '#94a3b8' });
      // Oldest first so the newest line lands at the bottom (terminal feel).
      const ordered = logs.slice().reverse();
      for (const log of ordered) {
        const ts     = new Date(log.timestamp);
        const stamp  = ts.toLocaleTimeString([], { hour12: false });
        const isOk   = log.action === 'User logged in';
        const isFail = log.action === 'Login failed';
        const level  = isOk ? 'INFO ' : isFail ? 'WARN ' : 'INFO ';
        const color  = isFail ? '#f87171' : isOk ? '#34d399' : '#e2e8f0';
        const bits   = [];
        if (log.ip_address)         bits.push(log.ip_address);
        if (log.details?.country)   bits.push(log.details.country);
        if (log.details?.browser)   bits.push(log.details.browser);
        const tail = bits.length ? '  ' + bits.join(' · ') : '';
        term.log(`[${stamp}] ${level} ${log.username} — ${log.action}${tail}`, { color });
      }
      term.setStatus('running');
    } catch (err) {
      term.log(`[error] failed to load: ${err.message || err}`, { color: '#ff5f57' });
      term.setStatus('error');
    }
  }

  // ── Security Alerts ───────────────────────────────────────────────────────

  async function renderAlerts() {
    try {
      const { logs } = await window.ALPApi.getLogs({ action: 'Login failed', limit: 50 });
      const el = document.getElementById('um-alerts-wrap');
      const badge = document.getElementById('um-alert-badge');
      if (!el) return;

      // Group by IP for suspicious patterns (≥3 failures from same IP)
      const last24h = Date.now() - 86400000;
      const recent = (logs || []).filter(l => new Date(l.timestamp).getTime() > last24h);
      const byIp = {};
      recent.forEach(l => { byIp[l.ip_address] = (byIp[l.ip_address] || []).concat(l); });
      const suspicious = Object.entries(byIp).filter(([, arr]) => arr.length >= 3);

      if (badge) {
        if (recent.length > 0) { badge.textContent = recent.length; badge.style.display = 'inline-flex'; }
        else badge.style.display = 'none';
      }

      if (!recent.length) {
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;color:var(--color-success);gap:8px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style="font-size:12px;color:var(--text-secondary);">No security alerts in the last 24 hours.</span>
          </div>`;
        return;
      }

      const rows = [];
      if (suspicious.length) {
        rows.push(`<div style="font-size:11px;font-weight:700;color:var(--color-danger);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">⚠️ Brute Force Attempts</div>`);
        suspicious.forEach(([ip, attempts]) => {
          rows.push(`
            <div class="um-alert-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div style="flex:1;">
                <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${attempts.length} failed attempts from ${ip}</div>
                <div style="font-size:11px;color:var(--text-secondary);">Targeting: ${[...new Set(attempts.map(a=>a.username))].join(', ')} · Last: ${_relTime(attempts[0].timestamp)}</div>
              </div>
            </div>`);
        });
      }

      if (recent.length && !suspicious.length) {
        rows.push(`<div style="font-size:12px;color:var(--text-secondary);">${recent.length} failed login attempt${recent.length > 1 ? 's' : ''} in the last 24 hours.</div>`);
        recent.slice(0, 5).forEach(l => {
          rows.push(`
            <div class="um-log-item">
              <div class="um-log-icon">❌</div>
              <div style="flex:1;">
                <div style="font-size:12px;font-weight:600;"><span style="color:var(--color-danger);">${l.username}</span> — Login failed</div>
                <div style="font-size:11px;color:var(--text-secondary);">${_relTime(l.timestamp)} · ${l.ip_address}</div>
              </div>
            </div>`);
        });
      }

      el.innerHTML = rows.join('');
    } catch (err) {
      const el = document.getElementById('um-alerts-wrap');
      if (el) el.innerHTML = `<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load security alerts.</div>`;
    }
  }

  // ── Profile Drawer ────────────────────────────────────────────────────────

  function _openDrawer(userId) {
    _drawerUserId = userId;
    _drawerTab = 'overview';
    _watchedIdsCache = null; // force a fresh watched-ids fetch for the new context
    const panel = document.getElementById('um-drawer-panel');
    if (panel) panel.classList.add('open');
    _renderDrawer();

    // Click-outside-to-close, but only for clicks in the page body
    // (sidebar/header links keep working). Attach on the next tick so the
    // opening click doesn't immediately close it.
    if (_outsideClickHandler) document.removeEventListener('mousedown', _outsideClickHandler, true);
    _outsideClickHandler = (e) => {
      const p = document.getElementById('um-drawer-panel');
      if (!p || !p.classList.contains('open')) return;
      if (p.contains(e.target)) return;                      // click inside drawer → keep open
      if (e.target.closest('.alp-modal, #um-drawer-overlay, .modal, .alp-toast')) return;
      // click inside a table row (row-click reopens the drawer) → don't fight it
      if (e.target.closest('[data-user-id]')) return;
      closeDrawer();
    };
    setTimeout(() => document.addEventListener('mousedown', _outsideClickHandler, true), 0);
  }

  function closeDrawer() {
    _drawerUserId = null;
    _drawerActivity = null;
    _drawerOwnedQuery.website = '';
    _drawerOwnedQuery.vps = '';
    _historyFilter = 'all';
    _historyQuery = '';
    const panel = document.getElementById('um-drawer-panel');
    if (panel) panel.classList.remove('open');
    if (_outsideClickHandler) {
      document.removeEventListener('mousedown', _outsideClickHandler, true);
      _outsideClickHandler = null;
    }
  }

  // ── Permission presets ───────────────────────────────────────────────────
  // Applies a preset by flipping the page-level checkboxes and per-action
  // toggles in the current perms UI. User still has to click Save to persist.
  function _applyPermPreset(userId) {
    const sel = document.getElementById('dr-perm-preset');
    const preset = sel ? sel.value : '';
    if (!preset) { window.showToast('Pick a preset first', 'info'); return; }

    // Section membership from PAGE_FEATURES
    const bySection = {};
    PAGE_FEATURES.forEach(f => { (bySection[f.section] = bySection[f.section] || []).push(f); });

    // Bundles — key: 'full' | 'readonly' | 'content' | 'ops' | 'none'
    // Values: allowed page keys (everything else denied). readonly disables
    // all "action" checkboxes even for allowed pages.
    let allowedPages = new Set();
    let readOnly = false;
    if (preset === 'full') PAGE_FEATURES.forEach(f => allowedPages.add(f.key));
    else if (preset === 'readonly') { PAGE_FEATURES.forEach(f => allowedPages.add(f.key)); readOnly = true; }
    else if (preset === 'content') {
      ['demo-pages','captured-data','logs','dashboard','sessions'].forEach(k => allowedPages.add(k));
    } else if (preset === 'ops') {
      ['demo-pages','domains','vps','dashboard','sessions','captured-data','logs','settings'].forEach(k => allowedPages.add(k));
    } // 'none' leaves the set empty

    // Flip page master checkboxes
    PAGE_FEATURES.forEach(f => {
      const cb = document.getElementById(`dp-perm-${f.key}`);
      if (!cb) return;
      const on = allowedPages.has(f.key);
      cb.checked = on;
      const card = document.getElementById(`um-perm-card-${f.key}`);
      if (card) card.classList.toggle('blocked', !on);
      // Flip child action checkboxes
      document.querySelectorAll(`[data-page-key="${f.key}"][data-action-key]`).forEach(el => {
        // For read-only, keep view (default allowed) but deny anything named create/edit/delete/publish/etc
        if (readOnly) {
          const action = el.getAttribute('data-action-key') || '';
          const isWrite = /create|edit|delete|update|publish|deploy|redirect|control|bulk-|upload|tg-|regenerate-|sync-/i.test(action);
          el.checked = on && !isWrite;
        } else {
          el.checked = on;
        }
        el.disabled = !on;
      });
    });

    window.showToast(`Preset applied — click Save to persist`, 'info');
  }

  // ── Security posture score ───────────────────────────────────────────────
  // Cheap heuristic — everything we already know without new backend calls:
  //   • never logged in → amber
  //   • last login > 90 days → amber
  //   • recent failed logins (from _stats) → red
  //   • suspended → red
  //   • otherwise → green
  function _computeSecurityPosture(user) {
    const reasons = [];
    let level = 'green';
    if (_isSuspended(user)) { reasons.push('Account suspended'); level = 'red'; }
    if (!user.last_login) { reasons.push('Never logged in'); if (level !== 'red') level = 'amber'; }
    else {
      const days = Math.floor((Date.now() - new Date(user.last_login).getTime()) / 86400000);
      if (days > 90) { reasons.push(`Inactive ${days}d`); if (level !== 'red') level = 'amber'; }
    }
    // Failed logins are per-user; we only have the panel-wide count.
    // Show as a warning cue when the count is non-trivial.
    if ((_stats?.failedLogins || 0) > 10) {
      reasons.push('Panel-wide failed logins high');
      if (level !== 'red') level = 'amber';
    }
    // God accounts get a bump — they carry the most risk if compromised
    if (user.role === 'god') reasons.push('God role — high blast radius');
    const label = level === 'green' ? 'Healthy' : level === 'amber' ? 'Review' : 'At risk';
    const icon  = level === 'green' ? '✓' : level === 'amber' ? '⚠' : '✕';
    return { level, label, icon, reasons: reasons.length ? reasons : ['No warnings'] };
  }

  // ── Security tab ─────────────────────────────────────────────────────────
  // 2FA state + reset · IP allow-list · magic-link reset
  function _renderSecurityTab(user, body) {
    let ipList = [];
    try {
      const raw = user.ip_allowlist;
      ipList = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    } catch { ipList = []; }
    const tfaEnabled = !!user.tfa_enabled;
    body.innerHTML = `
      <!-- 2FA -->
      <div style="padding:14px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:10px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">Two-Factor Auth (TOTP)</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${tfaEnabled ? '✓ Enabled — user needs their app on login' : 'Not enrolled — user enrolls from their Account settings'}</div>
          </div>
          <span class="um-posture um-posture--${tfaEnabled ? 'green' : 'amber'}">${tfaEnabled ? '✓ ON' : '⚠ OFF'}</span>
        </div>
        ${tfaEnabled ? `
          <button class="btn btn-ghost btn-sm" style="width:100%;color:var(--color-warning);margin-top:6px;" onclick="UserManagementPage._reset2FA(${user.id})">
            Reset 2FA (breaks the pairing — user must re-enroll)
          </button>` : ''}
      </div>

      <!-- Magic-link reset -->
      <div style="padding:14px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:10px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">Magic-link password reset</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Instead of typing a password to share, issue a one-time link that lets them set their own.</div>
        <button class="btn btn-primary btn-sm" style="width:100%;" onclick="UserManagementPage._issueResetLink(${user.id})">
          Issue Reset Link (expires in 24h)
        </button>
      </div>

      <!-- IP allow-list -->
      <div style="padding:14px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">IP allow-list</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">
          One entry per line — either a plain IPv4 (e.g. <code>1.2.3.4</code>) or CIDR (e.g. <code>10.0.0.0/24</code>).
          Empty = no restriction. Login is refused when the caller's IP doesn't match.
        </div>
        <textarea id="dr-ip-allowlist" rows="5" placeholder="1.2.3.4&#10;10.0.0.0/24"
          style="width:100%;box-sizing:border-box;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border-primary);color:var(--text-primary);border-radius:8px;font-family:var(--font-mono);font-size:12px;outline:none;resize:vertical;">${ipList.join('\n')}</textarea>
        <button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;" onclick="UserManagementPage._saveIpAllowList(${user.id})">
          Save allow-list
        </button>
      </div>
    `;
  }

  // ── Sessions tab (live socket inventory) ─────────────────────────────────
  function _renderSessionsTab(user, sessions, body) {
    if (!sessions.length) {
      body.innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">
          <div style="font-size:20px;margin-bottom:6px;">💤</div>
          No active sessions — user isn't currently signed in on any device.
        </div>`;
      return;
    }
    body.innerHTML = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">${sessions.length} active session${sessions.length !== 1 ? 's' : ''}</div>
      ${sessions.map(s => `
        <div class="um-history-row" style="justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
            <div style="font-size:16px;">🖥</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${s.ip || 'unknown IP'}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                ${_parseUA(s.userAgent)}${s.connectedAt ? ` · connected ${_relTime(s.connectedAt)}` : ''}
              </div>
              <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px;">socket: ${(s.socketId || '').slice(0, 12)}…</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);flex-shrink:0;" onclick="UserManagementPage._killOneSession(${user.id}, '${s.socketId}')">
            Terminate
          </button>
        </div>`).join('')}
    `;
  }

  function _parseUA(ua) {
    if (!ua) return 'Unknown browser';
    if (/Chrome/.test(ua)) return 'Chrome';
    if (/Firefox/.test(ua)) return 'Firefox';
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
    if (/Edg/.test(ua)) return 'Edge';
    return 'Browser';
  }

  // ── Notes tab ────────────────────────────────────────────────────────────
  function _renderNotesTab(user, notes, body) {
    body.innerHTML = `
      <div style="padding:12px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Add a note (visible only to god)</div>
        <textarea id="dr-note-input" rows="3" placeholder="e.g. Verified via phone on Aug 20 — approved to see all sites."
          style="width:100%;box-sizing:border-box;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border-primary);color:var(--text-primary);border-radius:8px;font-size:12px;outline:none;resize:vertical;"></textarea>
        <button class="btn btn-primary btn-sm" style="margin-top:6px;width:100%;" onclick="UserManagementPage._addUserNote(${user.id})">Add note</button>
      </div>
      ${notes.length === 0
        ? `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:12px;">No notes yet.</div>`
        : notes.map(n => `
            <div class="um-history-row" style="align-items:flex-start;">
              <div style="font-size:16px;flex-shrink:0;">📝</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;color:var(--text-primary);white-space:pre-wrap;word-break:break-word;line-height:1.45;">${_escSafe(n.note)}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">
                  ${n.author_name || 'unknown'} · ${_relTime(n.created_at)}
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);flex-shrink:0;" onclick="UserManagementPage._deleteUserNote(${user.id}, ${n.id})" title="Delete">✕</button>
            </div>`).join('')}
    `;
  }
  function _escSafe(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

  // ── Activity timeline body (replaces old history renderer) ───────────────
  function _renderActivityBody(user, activity, body) {
    if (!activity.length) {
      body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No activity recorded yet.</div>';
      return;
    }
    // Filter chips: all / logins / actions
    let filtered = activity.slice();
    if (_historyFilter === 'success') filtered = filtered.filter(a => a.kind === 'auth');
    if (_historyFilter === 'failed')  filtered = filtered.filter(a => a.kind === 'action');
    body.innerHTML = `
      <div class="um-hist-chips">
        <button class="um-hist-chip ${_historyFilter === 'all' ? 'um-hist-chip--active' : ''}" data-hf="all">All (${activity.length})</button>
        <button class="um-hist-chip ${_historyFilter === 'success' ? 'um-hist-chip--active' : ''}" data-hf="success">🔐 Logins</button>
        <button class="um-hist-chip ${_historyFilter === 'failed' ? 'um-hist-chip--active' : ''}" data-hf="failed">⚙ Actions</button>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">${filtered.length} of ${activity.length} entries</div>
      ${filtered.map(a => {
        const auth = a.kind === 'auth';
        const success = a.action && /logged in/i.test(a.action);
        const icon = auth ? (success ? '✅' : '❌') : '⚙';
        const color = auth ? (success ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--accent-primary)';
        return `
          <div class="um-history-row">
            <div style="font-size:15px;flex-shrink:0;">${icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:12px;color:${color};">${_escSafe(a.action || 'Event')}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;line-height:1.5;">
                ${_relTime(a.timestamp)} · ${new Date(a.timestamp).toLocaleString()}
                ${a.ip_address ? ` · ${a.ip_address}` : ''}
                ${a.category && a.category !== 'auth' ? ` · <span style="color:var(--text-muted);">${_escSafe(a.category)}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('')}
    `;
    body.querySelectorAll('.um-hist-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        _historyFilter = chip.dataset.hf;
        _renderActivityBody(user, activity, body);
      });
    });
  }

  // ── History tab renderer (filters + search + top-countries strip) ────────
  function _renderHistoryBody(user, history, body) {
    if (!history.length) {
      body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No login history found.</div>';
      return;
    }
    // Filter/search
    let filtered = history.slice();
    if (_historyFilter === 'success') filtered = filtered.filter(h => h.action === 'User logged in');
    if (_historyFilter === 'failed')  filtered = filtered.filter(h => h.action !== 'User logged in');
    if (_historyQuery) {
      const q = _historyQuery.toLowerCase();
      filtered = filtered.filter(h => {
        const d = h.details || {};
        return (h.ip_address || '').toLowerCase().includes(q)
          || (d.country || '').toLowerCase().includes(q)
          || (d.city    || '').toLowerCase().includes(q)
          || (d.browser || '').toLowerCase().includes(q)
          || (d.os      || '').toLowerCase().includes(q);
      });
    }
    // Top countries mini-map (from full history, not filtered)
    const countryCounts = {};
    history.forEach(h => {
      const c = (h.details && h.details.country) || '';
      if (c) countryCounts[c] = (countryCounts[c] || 0) + 1;
    });
    const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const successCount = history.filter(h => h.action === 'User logged in').length;
    const failedCount = history.length - successCount;

    body.innerHTML = `
      <div class="um-hist-chips">
        <button class="um-hist-chip ${_historyFilter === 'all' ? 'um-hist-chip--active' : ''}" data-hf="all">All (${history.length})</button>
        <button class="um-hist-chip ${_historyFilter === 'success' ? 'um-hist-chip--active' : ''}" data-hf="success">✓ Success (${successCount})</button>
        <button class="um-hist-chip ${_historyFilter === 'failed' ? 'um-hist-chip--active' : ''}" data-hf="failed">✕ Failed (${failedCount})</button>
        <input type="text" id="um-hist-search" placeholder="Search IP, city, browser…" value="${_historyQuery.replace(/"/g, '&quot;')}"
          style="flex:1;min-width:100px;padding:4px 10px;font-size:11px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:12px;color:var(--text-primary);outline:none;">
      </div>

      ${topCountries.length ? `
        <div class="um-hist-map">
          <strong style="color:var(--text-primary);">Top locations:</strong>
          ${topCountries.map(([c, n]) => `<span>${c} <strong style="color:var(--text-primary);">${n}</strong></span>`).join(' · ')}
        </div>` : ''}

      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">${filtered.length} of ${history.length} record${history.length === 1 ? '' : 's'}${_historyFilter !== 'all' || _historyQuery ? ' (filtered)' : ''}</div>

      ${filtered.length ? filtered.map(h => {
        const success = h.action === 'User logged in';
        const d = h.details || {};
        return `
          <div class="um-history-row">
            <div style="font-size:16px;flex-shrink:0;">${success ? '✅' : '❌'}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:12px;color:${success?'var(--color-success)':'var(--color-danger)'};">${success ? 'Successful Login' : 'Failed Attempt'}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;line-height:1.5;">
                ${_relTime(h.timestamp)} · ${new Date(h.timestamp).toLocaleString()}
                ${h.ip_address ? `<br>${h.ip_address}${d.country ? ` · ${d.country}` : ''}${d.city ? `, ${d.city}` : ''}` : ''}
                ${d.browser ? `<br>${d.browser}${d.os ? ` on ${d.os}` : ''} · ${d.device || 'Desktop'}` : ''}
              </div>
            </div>
          </div>`;
      }).join('') : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">No records match the filter.</div>'}
    `;

    // Wire filters
    body.querySelectorAll('.um-hist-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        _historyFilter = chip.dataset.hf;
        _renderHistoryBody(user, history, body);
      });
    });
    const search = document.getElementById('um-hist-search');
    if (search) {
      search.addEventListener('input', () => {
        _historyQuery = search.value;
        _renderHistoryBody(user, history, body);
      });
      if (_historyQuery) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    }
  }

  // ── Impersonation ────────────────────────────────────────────────────────
  // Sets localStorage.alp_as_user so subsequent API calls are scoped to that
  // user's view. The header widget already shows a banner when active.
  function _impersonate(userId) {
    const user = _users.find(u => Number(u.id) === Number(userId));
    if (!user) return;
    if (!confirm(`View the panel as ${user.username}?\n\nEverything you see and do will be scoped to their perms and websites. Reload to exit.`)) return;
    try {
      localStorage.setItem('alp_as_user', String(userId));
      window.showToast(`Viewing as ${user.username} — reload the page to exit`, 'info');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      window.showToast('Failed: ' + err.message, 'error');
    }
  }

  // ── Password helpers ─────────────────────────────────────────────────────
  function _generatePassword() {
    const inp = document.getElementById('dr-password');
    if (!inp) return;
    // 16 chars, high-entropy, avoids ambiguous 0/O/1/l
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let pw = '';
    const rand = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(rand);
      for (let i = 0; i < 16; i++) pw += chars[rand[i] % chars.length];
    } else {
      for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    }
    inp.value = pw;
    _pwStrengthUpdate();
  }
  function _copyQuickPassword() {
    const inp = document.getElementById('dr-password');
    if (!inp || !inp.value) { window.showToast('Nothing to copy', 'warning'); return; }
    navigator.clipboard.writeText(inp.value).then(
      () => window.showToast('Password copied — share out-of-band', 'success'),
      () => window.showToast('Copy failed', 'error')
    );
  }
  function _pwStrengthUpdate() {
    const inp = document.getElementById('dr-password');
    const meter = document.getElementById('dr-pw-meter');
    const hint = document.getElementById('dr-pw-hint-text');
    if (!inp || !meter || !hint) return;
    const pw = inp.value;
    const segs = meter.querySelectorAll('.um-pw-meter-seg');
    // Score 0..4
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 12) score++;
    const bandClass = score <= 1 ? 'on-weak' : score === 2 ? 'on-ok' : score === 3 ? 'on-good' : 'on-strong';
    const bandLabel = pw.length === 0 ? 'Type or generate a password'
                    : score <= 1 ? 'Weak — needs 8+ chars, mixed case & numbers'
                    : score === 2 ? 'OK — add a symbol and length'
                    : score === 3 ? 'Good'
                    : 'Strong ✓';
    segs.forEach((seg, i) => {
      seg.className = 'um-pw-meter-seg' + (i < score ? ' ' + bandClass : '');
    });
    hint.textContent = bandLabel;
    hint.style.color = score >= 3 ? '#10b981' : score === 2 ? '#f59e0b' : score >= 1 ? '#f87171' : 'var(--text-muted)';
  }

  // ── Searchable combobox for the Websites / VPS Give-picker ──────────────
  // Turns a hidden <select class="dp-picker-select" data-um-picker="…"> into
  // a trigger + dropdown panel with a filter input. Mirrors the form-type
  // picker used in the demo-pages modal.
  function _initDrawerPickerCombobox(kind) {
    const sel = document.querySelector(`select.dp-picker-select[data-um-picker="${kind}"]`);
    if (!sel || sel.dataset.comboDone) return;
    sel.dataset.comboDone = '1';
    // Hide the native select — it stays in the DOM for the confirm handler
    // to read `.value` after a selection.
    sel.style.display = 'none';

    const options = Array.from(sel.querySelectorAll('option'))
      .filter(o => o.value)
      .map(o => ({
        value: o.value,
        label: o.dataset.label || o.textContent || o.value,
        hint:  o.dataset.hint || '',
        icon:  o.dataset.icon || '•',
        color: o.dataset.color || 'var(--accent-primary)',
      }));

    const wrapper = document.createElement('div');
    wrapper.className = 'um-picker';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'um-picker-trigger';
    trigger.innerHTML = `<span class="um-picker-label">${options.length ? '— pick to give —' : 'Nothing available'}</span>
      <svg class="um-picker-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
    if (!options.length) trigger.disabled = true;

    let panel = null, open = false;
    const setLabel = (text) => {
      const el = trigger.querySelector('.um-picker-label');
      if (el) el.textContent = text || '— pick —';
    };

    function openPanel() {
      if (open || !options.length) return; open = true;
      trigger.classList.add('open');
      panel = document.createElement('div');
      panel.className = 'um-picker-panel';
      panel.innerHTML = `
        <div class="um-picker-search-wrap">
          <input type="text" class="um-picker-search" placeholder="Search…" autocomplete="off" spellcheck="false"/>
        </div>
        <div class="um-picker-list"></div>`;
      const search = panel.querySelector('.um-picker-search');
      const list = panel.querySelector('.um-picker-list');
      function paint(q) {
        const query = q.toLowerCase().trim();
        const filtered = query
          ? options.filter(o => o.label.toLowerCase().includes(query) || o.hint.toLowerCase().includes(query))
          : options;
        if (!filtered.length) {
          list.innerHTML = `<div class="um-picker-empty">No match</div>`;
          return;
        }
        list.innerHTML = filtered.map(o => `
          <div class="um-picker-item" data-value="${o.value}">
            <span class="um-picker-item-icon" style="color:${o.color};">${o.icon}</span>
            <span class="um-picker-item-label">${o.label}</span>
            ${o.hint ? `<span class="um-picker-item-hint">${o.hint}</span>` : ''}
          </div>`).join('');
        list.querySelectorAll('.um-picker-item').forEach(item => {
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            const chosen = options.find(o => o.value === item.dataset.value);
            sel.value = item.dataset.value;
            setLabel(chosen ? chosen.label : item.dataset.value);
            closePanel();
          });
        });
      }
      search.addEventListener('input', () => paint(search.value));
      paint('');
      wrapper.appendChild(panel);
      setTimeout(() => { panel.classList.add('open'); search.focus(); }, 20);
    }
    function closePanel() {
      if (!open) return; open = false;
      trigger.classList.remove('open');
      if (panel) { panel.classList.remove('open'); panel.remove(); panel = null; }
    }

    trigger.addEventListener('click', (e) => { e.stopPropagation(); open ? closePanel() : openPanel(); });
    document.addEventListener('click', () => closePanel(), { once: false });

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(trigger);
    wrapper.appendChild(sel);
  }

  function _renderDrawer() {
    const user = _users.find(u => Number(u.id) === Number(_drawerUserId));
    if (!user) { closeDrawer(); return; }

    const rm = ROLE_META[user.role] || ROLE_META.viewer;
    const isOnline = _onlineIds.has(user.id);
    const suspended = _isSuspended(user);
    const isSelf = Number(user.id) === Number(window.ALPAuth.getUser()?.userId);
    const isGodUser = user.role === 'god';

    const content = document.getElementById('um-drawer-content');
    const footer = document.getElementById('um-drawer-footer');
    if (!content) return;

    // Header section
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--border-primary);">
        ${_renderAvatar(user, 52, `<span class="um-online-dot ${isOnline?'online':'offline'}" style="position:absolute;bottom:1px;right:1px;width:11px;height:11px;box-shadow:0 0 0 2px var(--bg-secondary);"></span>`)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${user.username}
            ${isSelf ? '<span style="font-size:10px;color:var(--text-muted);font-weight:600;">(you)</span>' : ''}
          </div>
          <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="um-role-badge" style="color:${rm.color};background:${rm.bg};border-color:${rm.border};">${rm.icon} ${rm.label}</span>
            ${suspended ? '<span class="um-suspended-tag">⛔ Suspended</span>' : ''}
          </div>
          <div style="font-size:11px;color:${isOnline?'var(--color-success)':'var(--text-secondary)'};margin-top:6px;display:flex;align-items:center;gap:5px;">
            <span class="um-online-dot ${isOnline?'online':'offline'}" style="width:7px;height:7px;"></span>
            ${isOnline ? 'Online now' : (user.last_login ? `Last seen ${_relTime(user.last_login)}` : 'Never logged in')}
          </div>
        </div>
        ${!isSelf && !isGodUser ? `
        <button id="um-watch-btn" title="Toggle notifications for every action this user takes"
                onclick="UserManagementPage._toggleWatch(${user.id})"
                style="flex-shrink:0;padding:8px 12px;border-radius:9px;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.25);color:#a78bfa;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:'Inter',sans-serif;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span id="um-watch-label">…</span>
        </button>` : ''}
      </div>

      <!-- Tabs -->
      <div class="um-drawer-tabs" style="flex-wrap:wrap;gap:2px;">
        <button class="um-drawer-tab ${_drawerTab==='overview'?'active':''}" onclick="UserManagementPage._switchDrawerTab('overview')">Overview</button>
        <button class="um-drawer-tab ${_drawerTab==='websites'?'active':''}" onclick="UserManagementPage._switchDrawerTab('websites')">Websites</button>
        <button class="um-drawer-tab ${_drawerTab==='vps'?'active':''}" onclick="UserManagementPage._switchDrawerTab('vps')">VPS</button>
        <button class="um-drawer-tab ${_drawerTab==='perms'?'active':''}" onclick="UserManagementPage._switchDrawerTab('perms')">Pages</button>
        <button class="um-drawer-tab ${_drawerTab==='security'?'active':''}" onclick="UserManagementPage._switchDrawerTab('security')">Security</button>
        <button class="um-drawer-tab ${_drawerTab==='sessions'?'active':''}" onclick="UserManagementPage._switchDrawerTab('sessions')">Sessions</button>
        <button class="um-drawer-tab ${_drawerTab==='notes'?'active':''}" onclick="UserManagementPage._switchDrawerTab('notes')">Notes</button>
        <button class="um-drawer-tab ${_drawerTab==='history'?'active':''}" onclick="UserManagementPage._switchDrawerTab('history')">Activity</button>
      </div>

      <div id="um-drawer-tab-body"></div>
    `;

    _renderDrawerTab(user);

    // If a watch button is on the header (not self, not god), sync its state
    if (!isGodUser && !isSelf) _refreshWatchBtn(user.id);

    // Footer actions
    if (!isGodUser && !isSelf) {
      footer.style.display = 'flex';
      footer.innerHTML = `
        <button class="btn btn-ghost btn-sm" onclick="UserManagementPage._toggleSuspend(${user.id})" style="${suspended ? 'color:var(--color-success);' : 'color:var(--color-warning);'}">
          ${suspended ? '✓ Activate Account' : '⛔ Suspend Account'}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="UserManagementPage._terminateSession(${user.id})" style="color:var(--color-warning);margin-left:auto;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          Terminate Session
        </button>
        <button class="btn btn-danger btn-sm" onclick="UserManagementPage._confirmDelete(${user.id})">Delete</button>
      `;
    } else {
      footer.style.display = 'none';
    }
  }

  // ── Watch this user ──────────────────────────────────────────────────
  // Toggles the target user's id in the caller's `watched_user_ids` array.
  // When set, every action that user takes fires as delivery:'toast' to us,
  // regardless of category/severity prefs. Cheap, local, no cron needed.
  let _watchedIdsCache = null;
  async function _fetchWatchedIds() {
    if (_watchedIdsCache) return _watchedIdsCache;
    try {
      const res = await window.ALPApi._request('GET', '/api/notifications/prefs');
      _watchedIdsCache = Array.isArray(res?.watched) ? res.watched.map(Number) : [];
    } catch { _watchedIdsCache = []; }
    return _watchedIdsCache;
  }
  async function _refreshWatchBtn(userId) {
    const btn = document.getElementById('um-watch-btn');
    const lbl = document.getElementById('um-watch-label');
    if (!btn || !lbl) return;
    const ids = await _fetchWatchedIds();
    const on = ids.includes(Number(userId));
    lbl.textContent = on ? 'Watching' : 'Watch';
    btn.style.background = on ? 'rgba(139,92,246,.22)' : 'rgba(139,92,246,.08)';
    btn.style.color      = on ? '#c4b5fd' : '#a78bfa';
    btn.style.borderColor = on ? 'rgba(139,92,246,.5)' : 'rgba(139,92,246,.25)';
  }
  async function _toggleWatch(userId) {
    try {
      const res = await window.ALPApi._post(`/api/notifications/watch/${userId}`, {});
      _watchedIdsCache = Array.isArray(res?.list) ? res.list.map(Number) : null;
      await _refreshWatchBtn(userId);
      window.showToast(res.watching ? '👁 Watching — every action pings you' : 'Watch cleared', 'success');
    } catch (err) {
      window.showToast(err.message || 'Watch toggle failed', 'error');
    }
  }

  function _switchDrawerTab(tab) {
    _drawerTab = tab;
    _drawerTabToken++;                 // any in-flight tab-render is now stale
    const user = _users.find(u => Number(u.id) === Number(_drawerUserId));
    if (!user) return;
    // update tab active states
    document.querySelectorAll('.um-drawer-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tab}'`));
    });
    _renderDrawerTab(user);
  }

  function _renderDrawerTab(user) {
    const body = document.getElementById('um-drawer-tab-body');
    if (!body) return;

    if (_drawerTab === 'overview') {
      const permsPages = (user.permissions && user.permissions.pages) || {};
      const blockedCount = PAGE_FEATURES.filter(f => permsPages[f.key] === false).length;
      const siteCount = typeof user.owned_websites === 'number' ? user.owned_websites : 0;
      const sitesLine = user.role === 'god'
        ? 'All sites (god)'
        : (siteCount === 0 ? '⚠ No sites assigned' : `${siteCount} site${siteCount === 1 ? '' : 's'}`);

      // Security posture: computed from last_login age, role weight, and
      // any recent failed logins we know about (via godGetStats).
      const posture = _computeSecurityPosture(user);
      const acctAgeDays = user.created_at ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000) : null;
      const isSelf = Number(user.id) === Number(window.ALPAuth.getUser()?.userId);
      const isGodUser = user.role === 'god';

      body.innerHTML = `
        <!-- Hero stat pills -->
        <div class="um-hero-stats">
          <div class="um-hero-stat ${user.role !== 'god' && siteCount === 0 ? 'um-hero-stat--bad' : ''}">
            <div class="um-hero-stat-val">${user.role === 'god' ? '∞' : siteCount}</div>
            <div class="um-hero-stat-lbl">Sites</div>
          </div>
          <div class="um-hero-stat ${_onlineIds.has(user.id) ? 'um-hero-stat--good' : ''}">
            <div class="um-hero-stat-val">${_onlineIds.has(user.id) ? '●' : '—'}</div>
            <div class="um-hero-stat-lbl">${_onlineIds.has(user.id) ? 'Online' : 'Offline'}</div>
          </div>
          <div class="um-hero-stat">
            <div class="um-hero-stat-val">${user.role === 'god' ? '∞' : PAGE_FEATURES.length - blockedCount}</div>
            <div class="um-hero-stat-lbl">Pages</div>
          </div>
        </div>

        <!-- Security posture -->
        <div class="um-info-row">
          <span class="um-info-label">Security posture</span>
          <span class="um-posture um-posture--${posture.level}" title="${posture.reasons.join(' · ')}">${posture.icon} ${posture.label}</span>
        </div>
        <div class="um-info-row"><span class="um-info-label">Username</span><span style="font-size:13px;">${user.username}</span></div>
        <div class="um-info-row"><span class="um-info-label">Role</span><span style="font-size:13px;">${user.role}</span></div>
        <div class="um-info-row"><span class="um-info-label">Created</span>
          <span style="font-size:13px;">${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}${acctAgeDays != null ? ` <span style="color:var(--text-muted);">· ${acctAgeDays}d old</span>` : ''}</span>
        </div>
        <div class="um-info-row"><span class="um-info-label">Last Login</span><span style="font-size:13px;">${user.last_login ? `${_relTime(user.last_login)} <span style="color:var(--text-muted);">· ${new Date(user.last_login).toLocaleDateString()}</span>` : 'Never'}</span></div>
        <div class="um-info-row"><span class="um-info-label">Assigned Sites</span><span style="font-size:13px;color:${user.role !== 'god' && siteCount === 0 ? 'var(--color-warning)' : 'inherit'};">${sitesLine}</span></div>
        <div class="um-info-row"><span class="um-info-label">Page Access</span><span style="font-size:13px;">${user.role === 'god' ? 'All pages (god)' : blockedCount === 0 ? `All ${PAGE_FEATURES.length} pages` : `${PAGE_FEATURES.length - blockedCount}/${PAGE_FEATURES.length} pages`}</span></div>
        <div class="um-info-row"><span class="um-info-label">Status</span>
          <span style="font-size:13px;color:${_isSuspended(user) ? 'var(--color-danger)' : _onlineIds.has(user.id) ? 'var(--color-success)' : 'var(--text-secondary)'};">
            ${_isSuspended(user) ? '⛔ Suspended' : _onlineIds.has(user.id) ? '🟢 Online' : '⚪ Offline'}
          </span>
        </div>

        ${!isSelf && !isGodUser && (window.ALPAuth.getUser()?.role === 'god') ? `
        <div style="margin-top:12px;padding:10px 12px;background:linear-gradient(145deg, rgba(139,92,246,.08), transparent);border:1px solid rgba(139,92,246,.2);border-radius:8px;display:flex;align-items:center;gap:10px;">
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:#a78bfa;">Impersonate this user</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">See the panel exactly as they see it (scoped API + UI)</div>
          </div>
          <button class="btn btn-sm" onclick="UserManagementPage._impersonate(${user.id})"
            style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;padding:6px 14px;font-size:12px;font-weight:700;border-radius:6px;cursor:pointer;">
            View as →
          </button>
        </div>` : ''}
        ${user.role !== 'god' ? `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-primary);" data-quick-edit-root>
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;">Quick Edit</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <select id="dr-role-select" class="um-select" style="flex:1;">
              <option value="viewer" ${user.role==='viewer'?'selected':''}>👁 Viewer</option>
              <option value="admin" ${user.role==='admin'?'selected':''}>🔧 Admin</option>
              <option value="super_admin" ${user.role==='super_admin'?'selected':''}>⭐ Super Admin</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="UserManagementPage._quickRoleChange(${user.id})">Update Role</button>
          </div>
          <style>
            /* Force-style this field so the global input reset (base.css line 65)
               doesn't strip the border/background off. Uses ID + !important so
               it always wins regardless of load order or cached CSS. */
            #dr-password {
              width: 100% !important;
              box-sizing: border-box !important;
              padding: 9px 38px 9px 12px !important;
              font-size: 13px !important;
              background: rgba(255,255,255,0.04) !important;
              border: 1px solid var(--border-primary) !important;
              border-radius: 8px !important;
              color: #f1f5f9 !important;
              outline: none !important;
              font-family: inherit !important;
              -webkit-text-fill-color: #f1f5f9 !important;
              caret-color: #D4AF37 !important;
              transition: border-color .15s !important;
            }
            #dr-password:focus {
              border-color: var(--accent-primary) !important;
              background: rgba(212,175,55,0.06) !important;
            }
            #dr-password::placeholder { color: var(--text-muted) !important; }
          </style>
          <div style="margin-top:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
              <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Reset login password</div>
              <button type="button" onclick="UserManagementPage._generatePassword()" style="font-size:10px;padding:2px 8px;background:rgba(212,175,55,.1);color:#D4AF37;border:1px solid rgba(212,175,55,.28);border-radius:4px;cursor:pointer;font-family:'Inter',sans-serif;">🎲 Generate</button>
            </div>
            <div style="display:flex;gap:8px;align-items:stretch;">
              <div style="position:relative;flex:1;">
                <input type="text" id="dr-password" placeholder="New panel password…" autocomplete="new-password" spellcheck="false" data-lpignore="true" data-1p-ignore="true"
                  oninput="UserManagementPage._pwStrengthUpdate()">
                <button type="button" id="dr-password-eye" title="Hide password" aria-label="Toggle password visibility"
                  style="position:absolute;top:50%;right:6px;transform:translateY(-50%);width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;border-radius:6px;"
                  onclick="UserManagementPage._toggleQuickPassword();">
                  <svg id="dr-password-eye-on" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg id="dr-password-eye-off" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.77 19.77 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.79 19.79 0 01-3.22 4.19M12 12a3 3 0 11-6 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <button type="button" onclick="UserManagementPage._copyQuickPassword()"
                style="padding:0 10px;background:rgba(255,255,255,.05);border:1px solid var(--border-primary);color:var(--text-secondary);border-radius:8px;cursor:pointer;font-size:11px;font-family:'Inter',sans-serif;" title="Copy to clipboard">📋</button>
              <button class="btn btn-ghost btn-sm" onclick="UserManagementPage._quickPasswordReset(${user.id})">Reset</button>
            </div>
            <!-- Strength meter: 4 segments light up 0-4 -->
            <div class="um-pw-meter" id="dr-pw-meter">
              <div class="um-pw-meter-seg" data-seg="1"></div>
              <div class="um-pw-meter-seg" data-seg="2"></div>
              <div class="um-pw-meter-seg" data-seg="3"></div>
              <div class="um-pw-meter-seg" data-seg="4"></div>
            </div>
            <div class="um-pw-hint">
              <span id="dr-pw-hint-text">Type or generate a password</span>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--text-secondary);font-weight:600;">
                <input type="checkbox" id="dr-pw-force" style="accent-color:var(--accent-primary);width:12px;height:12px;">
                Force change on next login
              </label>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Visible so you can copy it. Click the eye to hide. Share the new value with them out-of-band.</div>
          </div>
        </div>` : ''}
      `;
    } else if (_drawerTab === 'history') {
      // Activity timeline: login events + audit actions merged
      const token = ++_drawerTabToken;
      body.innerHTML = `<div style="padding:16px;"><div class="alp-skeleton alp-skeleton--line" style="width:70%"></div><div class="alp-skeleton alp-skeleton--line" style="width:50%"></div><div class="alp-skeleton alp-skeleton--line" style="width:85%"></div><div class="alp-skeleton alp-skeleton--line" style="width:40%"></div></div>`;
      window.ALPApi.godGetUserActivity(user.id).then(({ activity }) => {
        if (token !== _drawerTabToken) return;
        _renderActivityBody(user, activity || [], body);
      }).catch(() => {
        if (token !== _drawerTabToken) return;
        if (body) body.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load activity.</div>';
      });
    } else if (_drawerTab === 'security') {
      _renderSecurityTab(user, body);
    } else if (_drawerTab === 'sessions') {
      const token = ++_drawerTabToken;
      body.innerHTML = `<div style="padding:16px;"><div class="alp-skeleton alp-skeleton--line" style="width:60%"></div><div class="alp-skeleton alp-skeleton--line" style="width:40%"></div></div>`;
      window.ALPApi.godGetUserSessions(user.id).then(({ sessions }) => {
        if (token !== _drawerTabToken) return;
        _renderSessionsTab(user, sessions || [], body);
      }).catch(() => {
        if (token !== _drawerTabToken) return;
        if (body) body.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load sessions.</div>';
      });
    } else if (_drawerTab === 'notes') {
      const token = ++_drawerTabToken;
      body.innerHTML = `<div style="padding:16px;"><div class="alp-skeleton alp-skeleton--line" style="width:70%"></div><div class="alp-skeleton alp-skeleton--line" style="width:45%"></div></div>`;
      window.ALPApi.godGetUserNotes(user.id).then(({ notes }) => {
        if (token !== _drawerTabToken) return;
        _renderNotesTab(user, notes || [], body);
      }).catch(() => {
        if (token !== _drawerTabToken) return;
        if (body) body.innerHTML = '<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load notes.</div>';
      });
    } else if (_drawerTab === 'websites') {
      if (user.role === 'god') {
        body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">👑 God admin has unrestricted access to every website.</div>';
        return;
      }
      const token = ++_drawerTabToken;
      body.innerHTML = `<div style="padding:16px;"><div class="alp-skeleton alp-skeleton--line" style="width:65%"></div><div class="alp-skeleton alp-skeleton--line" style="width:45%"></div><div class="alp-skeleton alp-skeleton--line" style="width:80%"></div></div>`;
      _renderWebsitesTab(user, token).catch(err => {
        if (token !== _drawerTabToken) return; // stale, ignore
        if (body) body.innerHTML = `<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load: ${err.message}</div>`;
      });
    } else if (_drawerTab === 'vps') {
      if (user.role === 'god') {
        body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">👑 God admin has unrestricted access to every VPS.</div>';
        return;
      }
      const token = ++_drawerTabToken;
      body.innerHTML = `<div style="padding:16px;"><div class="alp-skeleton alp-skeleton--line" style="width:60%"></div><div class="alp-skeleton alp-skeleton--line" style="width:75%"></div><div class="alp-skeleton alp-skeleton--line" style="width:35%"></div></div>`;
      _renderVpsTab(user, token).catch(err => {
        if (token !== _drawerTabToken) return;
        if (body) body.innerHTML = `<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load: ${err.message}</div>`;
      });
    } else if (_drawerTab === 'perms') {
      const isGodUser = user.role === 'god';
      if (isGodUser) {
        body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">👑 God admin has unrestricted access to all pages and actions.</div>';
        return;
      }
      const token = ++_drawerTabToken;
      body.innerHTML = `<div style="padding:16px;"><div class="alp-skeleton alp-skeleton--line" style="width:55%"></div><div class="alp-skeleton alp-skeleton--line" style="width:70%"></div><div class="alp-skeleton alp-skeleton--line" style="width:45%"></div><div class="alp-skeleton alp-skeleton--line" style="width:60%"></div></div>`;
      _renderPermsTab(user, token).catch(err => {
        if (token !== _drawerTabToken) return; // stale
        if (body) body.innerHTML = `<div style="color:var(--color-danger);font-size:12px;padding:8px;">Failed to load: ${err.message}</div>`;
      });
    }
  }

  // ── Permissions Tab (pages + per-action toggles) ──────────────────────────

  async function _renderPermsTab(user, token) {
    const body = document.getElementById('um-drawer-tab-body');
    if (!body) return;

    // Fetch the shared page/action catalog once per session. Falls back to
    // the local PAGE_FEATURES list if the god endpoint is unavailable, so
    // page-level toggles still work even without action data.
    if (!_actionCatalog) {
      try {
        const { pages } = await window.ALPApi.godGetPermissionsCatalog();
        if (token !== _drawerTabToken) return;
        _actionCatalog = pages || {};
      } catch (err) {
        // Leave _actionCatalog null so the next tab open retries — a transient
        // failure shouldn't lock the drawer into "no actions ever" mode.
        console.warn('[user-management] catalog fetch failed:', err.message);
        _actionCatalog = null;
        window.showToast && window.showToast('Failed to load action catalog: ' + (err.message || 'unknown'), 'error');
        return;
      }
    }

    const permsPages   = (user.permissions && user.permissions.pages)   || {};
    const permsActions = (user.permissions && user.permissions.actions) || {};

    // Group PAGE_FEATURES by section — keep the order as authored so the
    // familiar layout (Monitoring / Control / Card Tools / Security / System)
    // stays put. Attach the action list from the catalog where present.
    const sections = {};
    PAGE_FEATURES.forEach(f => {
      if (!sections[f.section]) sections[f.section] = [];
      sections[f.section].push({
        ...f,
        actions: (_actionCatalog[f.key] && _actionCatalog[f.key].actions) || [],
      });
    });

    body.innerHTML = `
      <!-- Preset picker — one-click bundles for common role shapes -->
      <div class="um-perm-preset-bar">
        <span class="um-perm-preset-lbl">Preset</span>
        <select id="dr-perm-preset" class="um-perm-preset-select">
          <option value="">— Custom —</option>
          <option value="full">Full Ops (all pages, all actions)</option>
          <option value="readonly">Read-only (view all, no edits)</option>
          <option value="content">Content Only (sites + captures + logs)</option>
          <option value="ops">Ops Team (sites + servers + domains, no security)</option>
          <option value="none">Nothing (deny all)</option>
        </select>
        <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="UserManagementPage._applyPermPreset(${user.id})">Apply</button>
      </div>

      <div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div style="font-size:12px;color:var(--text-secondary);">
          Toggle a whole page or expand it to allow / deny individual actions.
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="UserManagementPage._drawerSetAllPerms(true)">All On</button>
          <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="UserManagementPage._drawerSetAllPerms(false)">All Off</button>
        </div>
      </div>
      ${Object.entries(sections).map(([sec, features]) => `
        <div class="um-perm-section">
          <div class="um-perm-section-title">${sec}</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${features.map(f => _renderPermPageCard(f, permsPages, permsActions)).join('')}
          </div>
        </div>
      `).join('')}
      <div class="um-perm-save-sticky">
        <button class="btn btn-primary" style="width:100%;" id="dr-perms-save-btn" onclick="UserManagementPage._saveDrawerPerms(${user.id})">
          Save Permissions
        </button>
      </div>
    `;

    // Sync page-card visual state when the master checkbox flips.
    PAGE_FEATURES.forEach(f => {
      const cb = document.getElementById(`dp-perm-${f.key}`);
      if (!cb) return;
      cb.addEventListener('change', () => {
        const card = document.getElementById(`um-perm-card-${f.key}`);
        if (card) card.classList.toggle('blocked', !cb.checked);
        // Disable child action toggles when page is blocked — they're
        // moot until the page is re-enabled.
        document.querySelectorAll(`[data-page-key="${f.key}"][data-action-key]`).forEach(el => {
          el.disabled = !cb.checked;
        });
      });
    });
  }

  function _renderPermPageCard(feature, permsPages, permsActions) {
    const pageEnabled = permsPages[feature.key] !== false;
    const actions = feature.actions || [];
    const acts = permsActions[feature.key] || {};
    const blockedActionCount = actions.filter(a => acts[a.key] === false).length;
    const isExpanded = _expandedPerms.has(feature.key);
    const summary = actions.length === 0
      ? 'view only'
      : blockedActionCount === 0
        ? `${actions.length} action${actions.length===1?'':'s'} allowed`
        : `${actions.length - blockedActionCount}/${actions.length} allowed`;

    // Whole card head is clickable to expand — but the master checkbox / label
    // must NOT trigger expand, otherwise every toggle would also expand. The
    // label's onclick stopPropagation prevents that bubble.
    const headClick = actions.length
      ? `onclick="UserManagementPage._togglePermExpand('${feature.key}')" style="cursor:pointer;"`
      : '';
    return `
      <div class="um-perm-card ${pageEnabled ? '' : 'blocked'}" id="um-perm-card-${feature.key}">
        <div class="um-perm-card-head" ${headClick}>
          <label class="um-perm-master" onclick="event.stopPropagation();">
            <input type="checkbox" id="dp-perm-${feature.key}" ${pageEnabled?'checked':''} style="accent-color:var(--accent-primary);">
            <span style="font-weight:600;font-size:13px;">${feature.label}</span>
          </label>
          <div style="display:flex;align-items:center;gap:8px;pointer-events:none;">
            <span style="font-size:11px;color:var(--text-secondary);">${summary}</span>
            ${actions.length ? `
              <span class="um-perm-expand" title="${isExpanded?'Hide actions':'Show actions'}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:${isExpanded?'rotate(180deg)':'rotate(0)'};transition:transform .15s;"><polyline points="6 9 12 15 18 9"/></svg>
              </span>` : ''}
          </div>
        </div>
        ${actions.length ? `
          <div class="um-perm-actions" id="um-perm-actions-${feature.key}" style="display:${isExpanded?'flex':'none'};">
            ${actions.map(a => {
              const allowed = acts[a.key] !== false;
              return `
                <label class="um-perm-action">
                  <input type="checkbox" data-page-key="${feature.key}" data-action-key="${a.key}" ${allowed?'checked':''} ${pageEnabled?'':'disabled'} style="accent-color:var(--accent-primary);">
                  <span>${a.label}</span>
                </label>`;
            }).join('')}
          </div>` : ''}
      </div>`;
  }

  function _togglePermExpand(pageKey) {
    if (_expandedPerms.has(pageKey)) _expandedPerms.delete(pageKey);
    else _expandedPerms.add(pageKey);
    const box = document.getElementById(`um-perm-actions-${pageKey}`);
    if (box) box.style.display = _expandedPerms.has(pageKey) ? 'flex' : 'none';
    const btn = document.querySelector(`[data-perm-expand="${pageKey}"] svg`);
    if (btn) btn.style.transform = _expandedPerms.has(pageKey) ? 'rotate(180deg)' : 'rotate(0)';
  }

  // ── Websites Tab ──────────────────────────────────────────────────────────
  //
  // Ownership is per-website (websites.owner_id). From this tab god can:
  //   • see the websites this user currently owns
  //   • Give — hand any other website they can see over to this user (CLEAN
  //     handoff: VPS creds, deploy domain, CF zone, per-website Telegram bot,
  //     and any attached domain rows are stripped/detached server-side so the
  //     client gets a fresh website — just identity + xPages files + form
  //     config)
  //   • Take back — same clean handoff in reverse (client's config is wiped)
  async function _renderWebsitesTab(user, token) {
    const body = document.getElementById('um-drawer-tab-body');
    if (!body) return;
    if (token === undefined) token = _drawerTabToken;

    // Fetch what THIS user sees (their own websites) via god impersonation.
    let owned = [];
    try {
      const prev = localStorage.getItem('alp_as_user');
      localStorage.setItem('alp_as_user', String(user.id));
      const wsRes = await window.ALPApi.getWebsites();
      if (prev == null) localStorage.removeItem('alp_as_user');
      else localStorage.setItem('alp_as_user', prev);
      if (token !== _drawerTabToken) return;
      owned = (wsRes.websites || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
    } catch (err) {
      body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--color-error,#f66);font-size:13px;">Failed to load: ${err.message}</div>`;
      return;
    }

    // Fetch every website god can see (i.e. the full panel), so we can offer
    // "give one of these to <user>". Filter out anything they already own.
    let transferable = [];
    try {
      const all = await window.ALPApi.getWebsites();
      if (token !== _drawerTabToken) return;
      const ownedIds = new Set(owned.map(w => Number(w.id)));
      transferable = ((all && all.websites) || [])
        .filter(w => !ownedIds.has(Number(w.id)))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch { /* non-fatal — picker just won't render */ }

    const _renderOwnedRow = (w) => {
      const logo = w.logo_url
        ? `<img src="${w.logo_url}" alt="" style="width:22px;height:22px;border-radius:6px;object-fit:cover;flex-shrink:0;">`
        : `<div style="width:22px;height:22px;border-radius:6px;background:${w.color || '#6366f1'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0;">${(w.name || '?')[0].toUpperCase()}</div>`;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;">
          ${logo}
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.name || '(no name)'}</div>
            <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.domain || ''}</div>
          </div>
          ${w.is_active ? '' : '<span style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Off</span>'}
          <button type="button" data-um-take="${w.id}" title="Transfer back to me"
            style="padding:4px 10px;border-radius:6px;background:transparent;border:1px solid rgba(255,255,255,.15);color:#94a3b8;font-size:11px;font-weight:600;cursor:pointer;">
            Take back
          </button>
        </div>`;
    };

    const ownedHtml = owned.length
      ? owned.map(_renderOwnedRow).join('')
      : `<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;background:var(--bg-secondary);border-radius:6px;">
           <div style="font-size:20px;margin-bottom:4px;">🏝</div>
           <strong>${user.username || 'This user'}</strong> doesn't own any websites yet.
         </div>`;

    // Owned-list search — helpful when a user owns dozens
    const searchQ = _drawerOwnedQuery.website || '';
    const ownedFiltered = searchQ
      ? owned.filter(w => (w.name || '').toLowerCase().includes(searchQ.toLowerCase()) || (w.domain || '').toLowerCase().includes(searchQ.toLowerCase()))
      : owned;
    const ownedFilteredHtml = ownedFiltered.length
      ? ownedFiltered.map(_renderOwnedRow).join('')
      : owned.length
        ? `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:11px;">No matches for "${searchQ}"</div>`
        : `<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;background:var(--bg-secondary);border-radius:6px;">
             <div style="font-size:20px;margin-bottom:4px;">🏝</div>
             <strong>${user.username || 'This user'}</strong> doesn't own any websites yet.
           </div>`;

    body.innerHTML = `
      <!-- Give picker on TOP (was at the bottom) — searchable combobox with
           REAL website logos. Uses the shared ALPCombobox helper. -->
      <div style="margin-bottom:16px;padding:12px;background:linear-gradient(145deg, rgba(212,175,55,.06), rgba(212,175,55,.02));border:1px solid rgba(212,175,55,.18);border-radius:10px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#D4AF37;margin-bottom:8px;">Give a website to this user</div>
        <div style="display:flex;gap:8px;align-items:stretch;">
          <select id="um-give-picker"></select>
          <button type="button" id="um-give-btn" ${transferable.length ? '' : 'disabled'}
            style="padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,#FFD86E,#D4AF37);border:0;color:#1a1600;font-weight:700;font-size:12px;cursor:pointer;flex-shrink:0;${transferable.length ? '' : 'opacity:.4;cursor:not-allowed;'}">Give</button>
        </div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;line-height:1.5;">
          Clean handoff — VPS creds, attached domains, Cloudflare zone, and per-website bots are stripped. Recipient gets identity + files + form config only.
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
        <div style="font-size:12px;color:var(--text-secondary);">
          <strong>${user.username || 'This user'}</strong> owns <strong>${owned.length}</strong> website${owned.length === 1 ? '' : 's'}.
        </div>
        ${owned.length > 5 ? `<input type="text" id="um-owned-search" placeholder="Search owned…" value="${searchQ.replace(/"/g, '&quot;')}" style="padding:5px 10px;font-size:11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:var(--text-primary);width:160px;">` : ''}
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">${ownedFilteredHtml}</div>
    `;

    // Wire owned-list search
    const searchEl = document.getElementById('um-owned-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        _drawerOwnedQuery.website = searchEl.value;
        _renderWebsitesTab(user, _drawerTabToken);
      });
      if (_drawerOwnedQuery.website) { searchEl.focus(); searchEl.setSelectionRange(searchEl.value.length, searchEl.value.length); }
    }

    // Upgrade the picker into a searchable combobox with real website logos
    const wSel = document.getElementById('um-give-picker');
    if (wSel && window.ALPCombobox) {
      window.ALPCombobox.upgrade(wSel, {
        placeholder: transferable.length ? 'Pick a website to give…' : 'No websites available',
        searchPlaceholder: 'Search by name or domain…',
        items: transferable.map(w => ({
          value: String(w.id),
          label: w.name || '(no name)',
          hint:  w.domain || '',
          color: w.color || '#6366f1',
          icon:  w.logo_url
            ? { type: 'img', src: w.logo_url }
            : { type: 'color', color: w.color || '#6366f1', letter: (w.name || '?')[0].toUpperCase() },
          tail:  w.is_active ? '' : 'off',
        })),
      });
    }

    // Wire "Give" — transfer the picked website to this user.
    document.getElementById('um-give-btn')?.addEventListener('click', async (ev) => {
      const sel = document.getElementById('um-give-picker');
      const wid = sel && sel.value;
      if (!wid) return;
      const siteLabel = sel.options[sel.selectedIndex]?.textContent || 'this website';
      const confirmMsg =
        `Give "${siteLabel.trim()}" to ${user.username || 'this user'}?\n\n` +
        `Clean handoff — VPS creds, attached domains, Cloudflare zone, and per-website Telegram bot are stripped. ` +
        `They get a fresh website with only the name, files, and form config.`;
      if (!confirm(confirmMsg)) return;
      const btn = ev.currentTarget;
      const loading = window.ALPLoading.action(btn, 'Transferring…');
      try {
        await window.ALPApi._request('POST', `/api/websites/${wid}/transfer`, { new_owner_id: user.id });
        if (window.showToast) window.showToast('Website transferred — clean handoff', 'success');
        await _renderWebsitesTab(user, _drawerTabToken);
      } catch (err) {
        if (window.showToast) window.showToast('Transfer failed: ' + err.message, 'error');
      }
      loading.stop();
    });

    // Wire "Take back" — transfer this user's website back to god (current caller).
    const godId = (window.ALPAuth && window.ALPAuth.getUser && window.ALPAuth.getUser()?.id) || null;
    body.querySelectorAll('button[data-um-take]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (godId == null) {
          if (window.showToast) window.showToast('Could not detect god user id', 'error');
          return;
        }
        const wid = btn.getAttribute('data-um-take');
        const confirmMsg =
          `Take this website back from ${user.username}?\n\n` +
          `Clean handoff — their VPS creds, attached domains, Cloudflare zone, and per-website Telegram bot will be stripped. ` +
          `You will get the website's identity + files + form config only.`;
        if (!confirm(confirmMsg)) return;
        const loading = window.ALPLoading.action(btn, 'Working…');
        try {
          await window.ALPApi._request('POST', `/api/websites/${wid}/transfer`, { new_owner_id: godId });
          if (window.showToast) window.showToast('Website returned to you', 'success');
          await _renderWebsitesTab(user, _drawerTabToken);
        } catch (err) {
          if (window.showToast) window.showToast('Transfer failed: ' + err.message, 'error');
        }
        loading.stop();
      });
    });
  }

  // ── VPS Tab ────────────────────────────────────────────────────────────────
  async function _renderVpsTab(user, token) {
    const body = document.getElementById('um-drawer-tab-body');
    if (!body) return;
    if (token === undefined) token = _drawerTabToken;

    let owned = [], allVps = [];
    try {
      const res = await window.ALPApi._request('GET', '/api/vps-dashboard/metrics');
      if (token !== _drawerTabToken) return;
      const vpsArr = (res && res.vps) || [];
      owned = vpsArr.filter(v => Number(v.owner_id) === Number(user.id) && !v.is_panel);
      allVps = vpsArr.filter(v => !v.is_panel);
    } catch (err) {
      body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--color-error,#f66);font-size:13px;">Failed to load: ${err.message}</div>`;
      return;
    }

    const ownedIds = new Set(owned.map(v => Number(v.vps_id)));
    const assignable = allVps.filter(v => !ownedIds.has(Number(v.vps_id)));

    const _renderOwnedRow = (v) => {
      const siteCount = (v.sites || []).length;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;">
          <div style="width:22px;height:22px;border-radius:6px;background:${siteCount ? '#0d9488' : '#64748b'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0;">
            ${siteCount ? '🖥' : '📦'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.host}${v.label ? ' (' + v.label + ')' : ''}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${siteCount} website${siteCount === 1 ? '' : 's'}</div>
          </div>
          <button type="button" data-um-take-vps="${v.vps_id}" data-vps-host="${v.host}" title="Unassign this VPS"
            style="padding:4px 10px;border-radius:6px;background:transparent;border:1px solid rgba(255,255,255,.15);color:#94a3b8;font-size:11px;font-weight:600;cursor:pointer;">
            Take back
          </button>
        </div>`;
    };

    const ownedHtml = owned.length
      ? owned.map(_renderOwnedRow).join('')
      : `<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;background:var(--bg-secondary);border-radius:6px;">
           <div style="font-size:20px;margin-bottom:4px;">📦</div>
           <strong>${user.username || 'This user'}</strong> has no VPS assigned yet.
         </div>`;

    const searchQ = _drawerOwnedQuery.vps || '';
    const ownedFiltered = searchQ
      ? owned.filter(v => (v.host || '').toLowerCase().includes(searchQ.toLowerCase()) || (v.label || '').toLowerCase().includes(searchQ.toLowerCase()))
      : owned;
    const ownedFilteredHtml = ownedFiltered.length
      ? ownedFiltered.map(_renderOwnedRow).join('')
      : owned.length
        ? `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:11px;">No matches for "${searchQ}"</div>`
        : `<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;background:var(--bg-secondary);border-radius:6px;">
             <div style="font-size:20px;margin-bottom:4px;">📦</div>
             <strong>${user.username || 'This user'}</strong> has no VPS assigned yet.
           </div>`;

    body.innerHTML = `
      <!-- Assign picker on TOP (was at the bottom) — searchable combobox -->
      <div style="margin-bottom:16px;padding:12px;background:linear-gradient(145deg, rgba(212,175,55,.06), rgba(212,175,55,.02));border:1px solid rgba(212,175,55,.18);border-radius:10px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#D4AF37;margin-bottom:8px;">Assign a VPS to this user</div>
        <div style="display:flex;gap:8px;align-items:stretch;">
          <select id="um-give-vps-picker" class="dp-picker-select" data-um-picker="vps">
            ${assignable.length ? assignable.map(v => {
              const hint = v.owner_id ? 'owned by another user' : 'unassigned';
              const icon = v.reachable === false ? '⚠️' : (v.owner_id ? '👤' : '📦');
              const color = v.reachable === false ? '#f87171' : (v.owner_id ? '#94a3b8' : '#10b981');
              const label = `${v.host}${v.label ? ' (' + v.label + ')' : ''}`;
              return `<option value="${v.vps_id}" data-label="${label}" data-hint="${hint}" data-icon="${icon}" data-color="${color}">${label} — ${hint}</option>`;
            }).join('') : ''}
          </select>
          <button type="button" id="um-give-vps-btn" ${assignable.length ? '' : 'disabled'}
            style="padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,#FFD86E,#D4AF37);border:0;color:#1a1600;font-weight:700;font-size:12px;cursor:pointer;flex-shrink:0;${assignable.length ? '' : 'opacity:.4;cursor:not-allowed;'}">Assign</button>
        </div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;line-height:1.5;">
          The user will see this VPS on their dashboard and can deploy websites to it.
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
        <div style="font-size:12px;color:var(--text-secondary);">
          <strong>${user.username || 'This user'}</strong> owns <strong>${owned.length}</strong> VPS${owned.length === 1 ? '' : 'es'}.
        </div>
        ${owned.length > 5 ? `<input type="text" id="um-owned-vps-search" placeholder="Search owned…" value="${searchQ.replace(/"/g, '&quot;')}" style="padding:5px 10px;font-size:11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:var(--text-primary);width:160px;">` : ''}
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">${ownedFilteredHtml}</div>
    `;

    const searchEl = document.getElementById('um-owned-vps-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        _drawerOwnedQuery.vps = searchEl.value;
        _renderVpsTab(user, _drawerTabToken);
      });
      if (_drawerOwnedQuery.vps) { searchEl.focus(); searchEl.setSelectionRange(searchEl.value.length, searchEl.value.length); }
    }

    const vSel = document.getElementById('um-give-vps-picker');
    if (vSel && window.ALPCombobox) {
      window.ALPCombobox.upgrade(vSel, {
        placeholder: assignable.length ? 'Pick a VPS to assign…' : 'No VPS available',
        searchPlaceholder: 'Search by host or label…',
        items: assignable.map(v => {
          const unreachable = v.reachable === false;
          const owned = !!v.owner_id;
          return {
            value: String(v.vps_id),
            label: v.host + (v.label ? ` (${v.label})` : ''),
            hint:  unreachable ? 'unreachable' : (owned ? 'owned by another user' : 'unassigned — free to assign'),
            color: unreachable ? '#f87171' : (owned ? '#94a3b8' : '#10b981'),
            icon:  { type: 'emoji', text: unreachable ? '⚠️' : (owned ? '👤' : '📦') },
          };
        }),
      });
    }

    document.getElementById('um-give-vps-btn')?.addEventListener('click', async (ev) => {
      const sel = document.getElementById('um-give-vps-picker');
      const vpsId = sel && sel.value;
      if (!vpsId) return;
      const label = sel.options[sel.selectedIndex]?.textContent || 'this VPS';
      if (!confirm(`Assign "${label.trim()}" to ${user.username || 'this user'}?`)) return;
      const btn = ev.currentTarget;
      const loading = window.ALPLoading.action(btn, 'Assigning…');
      try {
        await window.ALPApi._request('POST', '/api/vps-dashboard/assign', {
          vps_id: Number(vpsId),
          owner_id: Number(user.id),
        });
        if (window.showToast) window.showToast('VPS assigned', 'success');
        await _renderVpsTab(user, _drawerTabToken);
      } catch (err) {
        if (window.showToast) window.showToast('Assign failed: ' + err.message, 'error');
      }
      loading.stop();
    });

    body.querySelectorAll('button[data-um-take-vps]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const vpsId = btn.getAttribute('data-um-take-vps');
        const host = btn.getAttribute('data-vps-host');
        if (!confirm(`Take back VPS ${host} from ${user.username}?\n\nThe VPS will become unassigned.`)) return;
        const loading = window.ALPLoading.action(btn, 'Working…');
        try {
          await window.ALPApi._request('POST', '/api/vps-dashboard/assign', {
            vps_id: Number(vpsId),
            owner_id: null,
          });
          if (window.showToast) window.showToast(`VPS ${host} unassigned`, 'success');
          await _renderVpsTab(user, _drawerTabToken);
        } catch (err) {
          if (window.showToast) window.showToast('Failed: ' + err.message, 'error');
        }
        loading.stop();
      });
    });
  }

  // Legacy no-ops kept so inline onclick attributes from cached HTML don't 500.
  function _websitesDirty() {}
  function _websitesSetAll() {}
  async function _saveWebsites() {}

  function _drawerPermChange() { /* handled by checkbox onchange */ }

  function _drawerSetAllPerms(enabled) {
    PAGE_FEATURES.forEach(f => {
      const cb   = document.getElementById(`dp-perm-${f.key}`);
      const chip = document.getElementById(`um-perm-chip-${f.key}`);   // legacy chip layout
      const card = document.getElementById(`um-perm-card-${f.key}`);
      if (cb)   cb.checked = enabled;
      if (chip) chip.classList.toggle('blocked', !enabled);
      if (card) card.classList.toggle('blocked', !enabled);
    });
    // Also flip every per-action checkbox to match the master state.
    document.querySelectorAll('[data-page-key][data-action-key]').forEach(el => {
      el.checked  = enabled;
      el.disabled = !enabled;
    });
  }

  async function _saveDrawerPerms(userId) {
    const btn = document.getElementById('dr-perms-save-btn');
    const loading = btn ? window.ALPLoading.action(btn, 'Saving…') : { stop: () => {} };
    try {
      // Collect page-level blocks.
      const pages = {};
      PAGE_FEATURES.forEach(f => {
        const cb = document.getElementById(`dp-perm-${f.key}`);
        if (cb && !cb.checked) pages[f.key] = false;
      });
      // Collect per-action blocks — only record explicit `false` so an
      // absent key still means "allowed" (matches requireAction semantics).
      const actions = {};
      document.querySelectorAll('[data-page-key][data-action-key]').forEach(el => {
        if (el.checked) return;
        const page = el.getAttribute('data-page-key');
        const key  = el.getAttribute('data-action-key');
        if (!actions[page]) actions[page] = {};
        actions[page][key] = false;
      });

      const user  = _users.find(u => Number(u.id) === Number(userId));
      const perms = { ...(user?.permissions || {}), pages, actions };
      await window.ALPApi.godUpdateUser(userId, { permissions: perms });
      window.showToast('Permissions saved', 'success');
      await loadAll(false);
      if (Number(_drawerUserId) === Number(userId)) _renderDrawer();
    } catch (err) {
      window.showToast(err.message || 'Failed to save permissions', 'error');
    } finally {
      loading.stop();
    }
  }

  async function _quickRoleChange(userId) {
    const sel = document.getElementById('dr-role-select');
    if (!sel) return;
    try {
      await window.ALPApi.godUpdateUser(userId, { role: sel.value });
      window.showToast('Role updated', 'success');
      await loadAll(false);
      if (Number(_drawerUserId) === Number(userId)) _renderDrawer();
    } catch (err) {
      window.showToast(err.message || 'Failed to update role', 'error');
    }
  }

  function _toggleQuickPassword() {
    const inp = document.getElementById('dr-password');
    const on  = document.getElementById('dr-password-eye-on');
    const off = document.getElementById('dr-password-eye-off');
    const btn = document.getElementById('dr-password-eye');
    if (!inp) return;
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    if (on)  on.style.display  = showing ? 'block' : 'none';
    if (off) off.style.display = showing ? 'none'  : 'block';
    if (btn) btn.setAttribute('title', showing ? 'Show password' : 'Hide password');
  }

  async function _quickPasswordReset(userId) {
    const inp = document.getElementById('dr-password');
    const forceEl = document.getElementById('dr-pw-force');
    if (!inp || !inp.value.trim()) { window.showToast('Enter a new password first', 'error'); return; }
    if (inp.value.length < 6) { window.showToast('Password must be at least 6 characters', 'error'); return; }
    try {
      await window.ALPApi.godUpdateUser(userId, { password: inp.value, forceChange: !!(forceEl && forceEl.checked) });
      inp.value = '';
      if (forceEl) forceEl.checked = false;
      _pwStrengthUpdate();
      window.showToast(forceEl && forceEl.checked ? 'Password reset (user must change on next login)' : 'Password reset successfully', 'success');
    } catch (err) {
      window.showToast(err.message || 'Failed to reset password', 'error');
    }
  }

  // ── Magic-link reset ─────────────────────────────────────────────────────
  async function _issueResetLink(userId) {
    try {
      const r = await window.ALPApi.godIssueResetLink(userId, 24);
      // Show the link in a modal so god can copy and share it
      if (window.showModal) {
        window.showModal({
          title: '🔗 Magic Reset Link Issued',
          width: '520px',
          content: `
            <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px;">
              Share this single-use link with the user. It expires in <strong>${r.ttl_hours}h</strong>.
            </p>
            <div style="display:flex;gap:6px;align-items:stretch;">
              <input type="text" readonly value="${(r.link || '').replace(/"/g, '&quot;')}"
                style="flex:1;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border-primary);color:var(--text-primary);border-radius:8px;font-family:var(--font-mono);font-size:12px;">
              <button type="button" onclick="navigator.clipboard.writeText('${(r.link || '').replace(/'/g, "\\'")}').then(()=>window.showToast('Copied','success'))"
                style="padding:9px 14px;background:var(--accent-primary);color:var(--text-inverse);border:0;border-radius:8px;font-weight:700;cursor:pointer;">📋</button>
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin:12px 0 0;">Expires: ${new Date(r.expires_at).toLocaleString()}</p>`,
          confirmText: 'Done', hideCancel: true, onConfirm: () => {}
        });
      } else {
        window.showToast('Link: ' + r.link, 'info');
      }
    } catch (err) {
      window.showToast('Failed: ' + err.message, 'error');
    }
  }

  // ── IP allow-list save ──────────────────────────────────────────────────
  async function _saveIpAllowList(userId) {
    const inp = document.getElementById('dr-ip-allowlist');
    if (!inp) return;
    const list = inp.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    try {
      await window.ALPApi.godUpdateUser(userId, { ip_allowlist: list });
      window.showToast(list.length ? `IP allow-list saved (${list.length} entr${list.length === 1 ? 'y' : 'ies'})` : 'IP allow-list cleared', 'success');
      await loadAll(false);
    } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
  }

  // ── 2FA reset (god) ─────────────────────────────────────────────────────
  async function _reset2FA(userId) {
    if (!confirm('Reset 2FA for this user? Their authenticator app pairing will be broken and they must set up again.')) return;
    try {
      await window.ALPApi.godResetTfa(userId);
      window.showToast('2FA reset — user must re-enroll', 'success');
      await loadAll(false);
    } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
  }

  // ── Notes: add + delete ──────────────────────────────────────────────────
  async function _addUserNote(userId) {
    const inp = document.getElementById('dr-note-input');
    if (!inp || !inp.value.trim()) return;
    try {
      await window.ALPApi.godAddUserNote(userId, inp.value.trim());
      inp.value = '';
      _switchDrawerTab('notes'); // re-render
    } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
  }
  async function _deleteUserNote(userId, noteId) {
    try {
      await window.ALPApi.godDeleteUserNote(userId, noteId);
      _switchDrawerTab('notes');
    } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
  }

  // ── Sessions: kill one ───────────────────────────────────────────────────
  async function _killOneSession(userId, socketId) {
    if (!confirm('Terminate this one session? The user stays logged in on other devices.')) return;
    try {
      await window.ALPApi.godKillUserSession(userId, socketId);
      window.showToast('Session terminated', 'success');
      _switchDrawerTab('sessions');
    } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
  }

  // ── Restore soft-deleted user ────────────────────────────────────────────
  async function _restoreUser(userId) {
    try {
      await window.ALPApi.godRestoreUser(userId);
      window.showToast('User restored', 'success');
      await loadAll();
    } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function _openEdit(userId) {
    _openDrawer(userId);
    _drawerTab = 'overview';
    const user = _users.find(u => Number(u.id) === Number(userId));
    if (user) _renderDrawer();
  }

  function _toggleSuspend(userId) {
    const user = _users.find(u => Number(u.id) === Number(userId));
    if (!user) return;
    const suspended = _isSuspended(user);
    window.showModal({
      title: suspended ? 'Activate Account' : 'Suspend Account',
      message: suspended
        ? `Activate <strong>${user.username}</strong>? They will be able to log in again.`
        : `Suspend <strong>${user.username}</strong>? They will be immediately signed out and unable to log in.`,
      confirmText: suspended ? 'Activate' : 'Suspend',
      confirmClass: suspended ? 'btn-success' : 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godSuspendUser(userId, !suspended);
          window.showToast(suspended ? `${user.username} activated` : `${user.username} suspended`, suspended ? 'success' : 'warning');
          await loadAll(false);
          if (Number(_drawerUserId) === Number(userId)) _renderDrawer();
        } catch (err) {
          window.showToast(err.message || 'Failed', 'error');
        }
      }
    });
  }

  function _terminateSession(userId) {
    const user = _users.find(u => Number(u.id) === Number(userId));
    if (!user) return;
    window.showModal({
      title: 'Terminate Session',
      message: `Force sign out <strong>${user.username}</strong>? Their active session token will be invalidated.`,
      confirmText: 'Terminate',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godTerminateSession(userId);
          window.showToast(`${user.username}'s session terminated`, 'success');
          await loadAll(false);
        } catch (err) {
          window.showToast(err.message || 'Failed to terminate session', 'error');
        }
      }
    });
  }

  function _confirmDelete(userId) {
    const user = _users.find(u => Number(u.id) === Number(userId));
    if (!user) return;
    window.showModal({
      title: 'Delete Admin Account',
      message: `Permanently delete <strong>${user.username}</strong> (${user.email})? This action cannot be undone.`,
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godDeleteUser(userId);
          window.showToast(`${user.username} deleted`, 'success');
          if (Number(_drawerUserId) === Number(userId)) closeDrawer();
          await loadAll(false);
        } catch (err) {
          window.showToast(err.message || 'Failed to delete user', 'error');
        }
      }
    });
  }

  // ── Create Modal ──────────────────────────────────────────────────────────

  function openCreateModal() {
    const inputCss = `
      width:100%;box-sizing:border-box;background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.12);border-radius:10px;
      padding:11px 13px;color:#f1f5f9;font-size:14px;font-family:inherit;
      outline:none;transition:border-color .15s,background .15s,box-shadow .15s;
    `.replace(/\s+/g, ' ').trim();
    const labelCss = `display:block;font-size:11px;font-weight:700;margin-bottom:6px;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;`;
    const hintCss  = `font-size:11px;color:#64748b;margin-top:5px;`;

    window.showModal({
      title: 'New Admin Account',
      width: '460px',
      content: `
        <style>
          #nc-form input:focus, #nc-form select:focus {
            border-color: #D4AF37 !important;
            background: rgba(212,175,55,.06) !important;
            box-shadow: 0 0 0 3px rgba(212,175,55,.12);
          }
          #nc-form input::placeholder { color: #475569; }
        </style>
        <form id="nc-form" onsubmit="return false;" style="display:flex;flex-direction:column;gap:16px;">
          <div>
            <label style="${labelCss}">Username</label>
            <input id="nc-username" style="${inputCss}" placeholder="e.g. client_acme" autocomplete="off">
          </div>
          <div>
            <label style="${labelCss}">Password</label>
            <input id="nc-password" type="password" style="${inputCss}" placeholder="Minimum 6 characters" autocomplete="new-password">
            <div style="${hintCss}">You'll share this with the client. They can change it after logging in.</div>
          </div>
          <div>
            <label style="${labelCss}">Role</label>
            <select id="nc-role" style="${inputCss};cursor:pointer;appearance:none;background-image:linear-gradient(45deg,transparent 50%,#94a3b8 50%),linear-gradient(135deg,#94a3b8 50%,transparent 50%);background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:34px;">
              <option value="viewer">Viewer — read-only client</option>
              <option value="admin">Admin — client who can take actions</option>
              <option value="super_admin">Super Admin — advanced client</option>
            </select>
            <div style="${hintCss}">Next: open their profile → <b>Websites</b> tab to assign which sites they can access.</div>
          </div>
        </form>
      `,
      confirmText: 'Create Admin',
      onConfirm: async () => {
        const username = document.getElementById('nc-username')?.value.trim();
        const password = document.getElementById('nc-password')?.value;
        const role = document.getElementById('nc-role')?.value;

        if (!username || !password) { window.showToast('Username and password are required', 'error'); return false; }
        if (password.length < 6) { window.showToast('Password must be at least 6 characters', 'error'); return false; }

        try {
          // Email is now optional — server auto-generates one from the username
          // when omitted. Kept out of the UI to reduce friction for internal clients.
          await window.ALPApi.godCreateUser({ username, password, role });
          window.showToast(`"${username}" created successfully`, 'success');
          await loadAll(false);
        } catch (err) {
          window.showToast(err.message || 'Failed to create user', 'error');
          return false;
        }
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _relTime(ts) {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function destroy() {
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = null;

    if (_presenceUnsub && window.ALPSocket) {
      window.ALPSocket.off('admin:presence', _presenceUnsub);
    }
    _presenceUnsub = null;

    // Remove drawer DOM if still mounted
    const overlay = document.getElementById('um-drawer-overlay');
    const panel = document.getElementById('um-drawer-panel');
    if (overlay) overlay.style.display = 'none';
    if (panel) panel.classList.remove('open');

    _users = [];
    _stats = null;
    _onlineIds = new Set();
    _drawerUserId = null;
    // Reset every filter so navigating away and back never restores a stale
    // search/filter that hides users on re-entry.
    _searchQuery  = '';
    _filterRole   = 'all';
    _filterStatus = 'all';
    _sortBy       = 'last_login';
    _allWebsites  = null;
    _actionCatalog = null;
    _expandedPerms.clear();
  }

  return {
    render,
    init,
    destroy,
    // Called from inline event handlers
    _openEdit,
    _openDrawer,
    _switchDrawerTab,
    _drawerSetAllPerms,
    _drawerPermChange,
    _saveDrawerPerms,
    _quickRoleChange,
    _quickPasswordReset,
    _toggleSuspend,
    _terminateSession,
    _confirmDelete,
    _websitesDirty,
    _websitesSetAll,
    _saveWebsites,
    _togglePermExpand,
    _toggleQuickPassword,
    // New handlers wired in this rewrite
    _impersonate,
    _generatePassword,
    _copyQuickPassword,
    _pwStrengthUpdate,
    _applyPermPreset,
    _issueResetLink,
    _saveIpAllowList,
    _reset2FA,
    _addUserNote,
    _deleteUserNote,
    _killOneSession,
    _restoreUser,
    _toggleWatch,
  };
})();

window.UserManagementPage = UserManagementPage;
