/**
 * OutLaws - Settings Page Module
 * General, Maintenance, Telegram, Websites, Users, Danger Zone
 */
const SettingsPage = (() => {
  let settings = {};
  let telegram = {};
  let websites = [];
  let users = [];

  function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function avatarColor(id) {
    const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
    let h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  // --- Category definitions ---
  const CATEGORIES = [
    {
      key: 'general',
      label: 'General',
      desc: 'Notifications & site name',
      color: '#D4AF37',
      bg: 'rgba(212,175,55,0.1)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
    },
    // Account Security removed — password change lives inside the profile
    // drawer (User Management), not in Settings.
    {
      key: 'telegram',
      label: 'Telegram',
      desc: 'Bot integration & alerts',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.12)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>`
    },
    {
      key: 'discord',
      label: 'Discord',
      desc: 'Webhook alerts & bot',
      color: '#5865F2',
      bg: 'rgba(88,101,242,0.12)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.078.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037c-1.714.298-3.354.822-4.885 1.515a.07.07 0 00-.032.027C.533 9.045-.32 13.579.099 18.057a.083.083 0 00.031.056 19.9 19.9 0 006.001 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.225-1.994a.076.076 0 00-.041-.105 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.009c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.891.077.077 0 00-.041.106c.36.699.772 1.363 1.225 1.994a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.028zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.419-2.157 2.419z"/></svg>`
    },
    {
      key: 'mail',
      label: 'Mail',
      desc: 'SMTP email alerts',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>`
    },
    {
      key: 'websites',
      label: 'Websites',
      desc: 'Manage tracked domains',
      color: '#10b981',
      bg: 'rgba(16,185,129,0.12)',
      godOnly: true,
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`
    },
    {
      key: 'users',
      label: 'User Management',
      desc: 'Full profile drawer, roles, websites, permissions',
      color: '#8b5cf6',
      bg: 'rgba(139,92,246,0.12)',
      godOnly: true,
      // Instead of rendering a compact inline list, this category deep-links to
      // the dedicated User Management page — same drawer, richer UI.
      href: '#/user-management',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`
    },
    {
      key: 'panel',
      label: 'Panel Config',
      desc: 'Panel domain, VPS & port',
      color: '#14b8a6',
      bg: 'rgba(20,184,166,0.1)',
      godOnly: true,
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`
    },
    {
      key: 'infrastructure',
      label: 'Infrastructure',
      desc: 'Hosting provider & DNS',
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.1)',
      godOnly: true,
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/><line x1="6" y1="5" x2="6.01" y2="5"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="6" y1="19" x2="6.01" y2="19"/></svg>`
    },
    {
      key: 'danger',
      label: 'Danger Zone',
      desc: 'Clear data & reset defaults',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.08)',
      border: 'rgba(239,68,68,0.2)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    }
  ];

  function render() {
    const user = window.ALPAuth.getUser();
    const isSuperAdmin = user && (user.role === 'super_admin' || user.role === 'god');
    const isGod = user && user.role === 'god';
    // Every settings category is now toggleable per-user by god. The old
    // godOnly / superAdminOnly flags define the SAFE DEFAULT (what non-god
    // users see when god hasn't touched their permissions), but god can flip
    // that default by explicitly granting or denying view-<key>.
    //   permission === true  → force-visible (overrides role gate)
    //   permission === false → force-hidden  (overrides default visibility)
    //   permission missing   → fall back to the role gate below
    const explicitPerm = (key) => {
      const a = user && user.permissions && user.permissions.actions && user.permissions.actions.settings;
      return a ? a['view-' + key] : undefined;
    };
    const visibleCats = CATEGORIES.filter(c => {
      if (isGod) return true;
      // godOnly is a HARD lock — no permission override can expose it. Panel,
      // Users, and Infrastructure hold master creds and other admins; those
      // stay godadmin-only forever.
      if (c.godOnly) return false;
      const perm = explicitPerm(c.key);
      if (perm === false) return false;
      if (perm === true)  return true;
      if (c.superAdminOnly)  return !!isSuperAdmin;
      return true;
    });

    const godBadge = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#D4AF37" title="God admin only" style="flex-shrink:0;margin-left:4px;"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`;

    const cards = visibleCats.map(c => `
      <button class="settings-cat-card" data-section="${c.key}" style="--cat-color:${c.color};--cat-bg:${c.bg};${c.border ? `--cat-border:${c.border};` : ''}">
        <div class="settings-cat-icon" style="background:var(--cat-bg);color:var(--cat-color);">
          ${c.icon}
        </div>
        <div class="settings-cat-info">
          <div class="settings-cat-label" style="display:flex;align-items:center;gap:4px;">${c.label}${c.godOnly ? godBadge : ''}</div>
          <div class="settings-cat-desc">${c.desc}</div>
        </div>
        <svg class="settings-cat-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    `).join('');

    return `
      <div class="settings-page page-enter" id="settings-root">
        <div class="page-header">
          <div>
            <h1 class="page-title">Settings</h1>
            <p class="page-subtitle">Configure your OutLaws Panel</p>
          </div>
        </div>

        <!-- Category Picker (Gate) -->
        <div id="settings-gate" class="settings-gate">
          <div class="settings-cat-grid">
            ${cards}
          </div>
        </div>

        <!-- Section Panel (slides in) -->
        <div id="settings-section-panel" class="settings-section-panel" style="display:none;">
          <button class="settings-back-btn" id="settings-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
            Back to Settings
          </button>
          <div id="settings-section-content"></div>
        </div>
      </div>

      <style>
        .settings-page { max-width: 860px; margin: 0 auto; }
        .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:32px; }
        .page-title { font-size:26px; font-weight:700; color:var(--text-primary); margin:0 0 4px; }
        .page-subtitle { font-size:14px; color:var(--text-secondary); margin:0; }

        /* ---- Gate: Category picker grid ---- */
        .settings-gate { animation: fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .settings-cat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .settings-cat-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 18px;
          background: var(--card-bg);
          border: 1px solid var(--cat-border, var(--border-color));
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.16,1,0.3,1);
          text-align: left;
          font-family: 'Inter', sans-serif;
          position: relative;
          overflow: hidden;
        }
        .settings-cat-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--cat-bg);
          opacity: 0;
          transition: opacity 0.22s ease;
          border-radius: inherit;
        }
        .settings-cat-card:hover::before { opacity: 1; }
        .settings-cat-card:hover {
          border-color: var(--cat-color);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px var(--cat-color);
        }
        .settings-cat-card:active { transform: translateY(0); }
        .settings-cat-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
          transition: transform 0.22s ease;
        }
        .settings-cat-card:hover .settings-cat-icon { transform: scale(1.08); }
        .settings-cat-info {
          flex: 1;
          min-width: 0;
          position: relative;
          z-index: 1;
        }
        .settings-cat-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 3px;
        }
        .settings-cat-desc {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .settings-cat-arrow {
          color: var(--text-muted);
          flex-shrink: 0;
          position: relative;
          z-index: 1;
          transition: transform 0.2s ease, color 0.2s ease;
        }
        .settings-cat-card:hover .settings-cat-arrow {
          transform: translateX(4px);
          color: var(--cat-color);
        }

        /* ---- Section Panel ---- */
        .settings-section-panel { animation: slideInSection 0.32s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes slideInSection {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOutSection {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(24px); }
        }

        .settings-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          margin-bottom: 24px;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .settings-back-btn:hover {
          background: rgba(212,175,55,0.07);
          border-color: rgba(212,175,55,0.45);
          color: #D4AF37;
        }
        .settings-back-btn svg { transition: transform 0.18s ease; }
        .settings-back-btn:hover svg { transform: translateX(-3px); }

        /* ---- Shared section styles ---- */
        .settings-section { margin-bottom:32px; }
        .section-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
        .section-header h2 { font-size:17px; font-weight:600; color:var(--text-primary); margin:0; }
        .section-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

        .settings-card { background:var(--card-bg); border:1px solid var(--border-color); border-radius:14px; padding:24px; }
        .settings-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
        .form-group { display:flex; flex-direction:column; }
        .form-group label { font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px; }
        .form-input, .form-textarea, .form-select {
          padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid var(--border-color);
          border-radius:8px; color:var(--text-primary); font-size:13px; font-family:'Inter',sans-serif;
          outline:none; transition:border-color 0.2s; width:100%; box-sizing:border-box;
        }
        .form-input:focus, .form-textarea:focus, .form-select:focus { border-color:#D4AF37; box-shadow:0 0 0 3px rgba(212,175,55,0.1); }
        .form-textarea { resize:vertical; min-height:70px; }
        .form-select {
          appearance:none; cursor:pointer;
          background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center; padding-right:32px;
        }

        .input-with-toggle { display:flex; gap:6px; }
        .input-with-toggle .form-input { flex:1; }
        .input-toggle-btn {
          padding:0 14px; background:rgba(255,255,255,0.06); border:1px solid var(--border-color);
          border-radius:8px; color:var(--text-secondary); font-size:12px; cursor:pointer;
          font-family:'Inter',sans-serif; transition:all 0.15s; white-space:nowrap;
        }
        .input-toggle-btn:hover { background:rgba(255,255,255,0.1); }

        .settings-toggles { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
        .toggle-row {
          display:flex; align-items:center; justify-content:space-between; padding:10px 0;
          border-bottom:1px solid rgba(255,255,255,0.03); cursor:pointer; font-size:13px;
          color:var(--text-primary); user-select:none;
        }
        .toggle-row:last-child { border-bottom:none; }
        .toggle-cb { display:none; }
        .toggle-switch {
          position:relative; width:40px; height:22px; background:rgba(255,255,255,0.1);
          border-radius:11px; transition:background 0.2s; flex-shrink:0;
        }
        .toggle-switch::after {
          content:''; position:absolute; left:3px; top:3px; width:16px; height:16px;
          background:#fff; border-radius:50%; transition:transform 0.2s;
        }
        .toggle-cb:checked + .toggle-switch { background:#10b981; }
        .toggle-cb:checked + .toggle-switch::after { transform:translateX(18px); }

        .settings-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
        .btn { display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; font-family:'Inter',sans-serif; border:none; }
        .btn-primary { background:linear-gradient(135deg,#D4AF37,#B8962E); color:#0a0a0a; font-weight:600; box-shadow:0 4px 14px rgba(212,175,55,.25); }
        .btn-primary:hover { filter:brightness(1.1); transform:translateY(-1px); box-shadow:0 6px 20px rgba(212,175,55,.4); }
        .btn-sm { padding:6px 14px; font-size:12px; }
        .btn-outline { background:transparent; color:var(--text-secondary); border:1px solid var(--border-color); }
        .btn-outline:hover { border-color:rgba(212,175,55,.45); color:#D4AF37; }
        .btn-danger { background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.2); }
        .btn-danger:hover { background:rgba(239,68,68,0.2); }

        .status-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .status-dot.connected { background:#10b981; }
        .status-dot.disconnected { background:#ef4444; }
        .status-label { font-size:12px; font-weight:500; }
        .status-label.connected { color:#10b981; }
        .status-label.disconnected { color:#ef4444; }

        .tg-help { background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.12); border-radius:10px; padding:14px 16px; margin-bottom:16px; }
        .tg-help p { font-size:13px; color:var(--text-secondary); margin:0; line-height:1.5; }
        .tg-help code { background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:12px; }

        /* ── Premium Website Cards ───────────────────────────── */
        .websites-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px;
        }
        .websites-header-left { display: flex; flex-direction: column; gap: 3px; }
        .websites-header-title { font-size: 13px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.02em; }
        .websites-header-sub { font-size: 11px; color: var(--text-muted); }
        .websites-add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
          background: linear-gradient(135deg, #D4AF37, #B8962E);
          color: #0a0a0a; border: none; cursor: pointer;
          box-shadow: 0 4px 14px rgba(212,175,55,0.35);
          transition: all 0.2s ease; font-family: 'Inter', sans-serif;
        }
        .websites-add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,175,55,0.5); }
        .websites-add-btn:active { transform: translateY(0); }
        .websites-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 18px;
        }
        .website-card {
          position: relative; display: flex; flex-direction: column;
          background: linear-gradient(145deg, rgba(19,19,32,0.95) 0%, rgba(15,15,25,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px; overflow: hidden;
          transition: transform 0.25s cubic-bezier(0.25,0.8,0.25,1),
                      box-shadow 0.25s cubic-bezier(0.25,0.8,0.25,1),
                      border-color 0.25s;
          box-shadow: 0 4px 24px rgba(0,0,0,0.35);
          animation: fadeUp 0.35s var(--ease-out) both;
        }
        .website-card:hover {
          transform: translateY(-4px);
          border-color: rgba(var(--wc-r, 99), var(--wc-g, 102), var(--wc-b, 241), 0.4);
          box-shadow: 0 16px 48px rgba(0,0,0,0.5),
                      0 0 30px rgba(var(--wc-r,99), var(--wc-g,102), var(--wc-b,241), 0.1);
        }
        /* Colored top accent stripe */
        .website-card-accent {
          height: 3px; width: 100%;
          background: linear-gradient(90deg,
            rgba(var(--wc-r,99),var(--wc-g,102),var(--wc-b,241),0) 0%,
            rgba(var(--wc-r,99),var(--wc-g,102),var(--wc-b,241),1) 40%,
            rgba(var(--wc-r,99),var(--wc-g,102),var(--wc-b,241),0.7) 100%);
          transition: opacity 0.25s;
        }
        .website-card:hover .website-card-accent { opacity: 1; }
        /* Status dot top-right */
        .website-status-dot {
          position: absolute; top: 16px; right: 16px;
          width: 9px; height: 9px; border-radius: 50%;
          border: 2px solid rgba(0,0,0,0.4);
        }
        .website-status-dot.active {
          background: #10b981;
          box-shadow: 0 0 0 0 rgba(16,185,129,0.55);
          animation: statusPulse 2.2s ease-in-out infinite;
        }
        .website-status-dot.inactive { background: var(--text-muted); }
        @keyframes statusPulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
          70%  { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
        /* Card inner padding area */
        .website-card-inner { padding: 18px 20px 14px; display: flex; flex-direction: column; gap: 14px; }
        /* Logo + identity row */
        .website-card-identity { display: flex; align-items: center; gap: 14px; }
        .website-logo-wrap {
          width: 52px; height: 52px; border-radius: 13px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,0.09);
          overflow: hidden; background: transparent;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .website-logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
        .website-logo-avatar {
          width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -1px;
        }
        .website-info { flex: 1; min-width: 0; }
        .website-name {
          font-size: 15px; font-weight: 700; color: #e2e8f0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          letter-spacing: -0.2px;
        }
        .website-domain {
          font-size: 11.5px; color: var(--text-muted); margin-top: 3px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-family: var(--font-mono);
        }
        .website-slug-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; color: #D4AF37;
          background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.18);
          padding: 2px 7px; border-radius: 20px; font-weight: 600; margin-top: 5px;
          text-decoration: none; width: fit-content; transition: all 0.2s;
        }
        .website-slug-badge:hover { background: rgba(212,175,55,0.16); color: #E8C547; }
        /* API Key row */
        .website-apikey-row { display: flex; flex-direction: column; gap: 4px; }
        .website-key-label {
          font-size: 9px; font-weight: 700; color: var(--text-placeholder);
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .website-apikey-pill {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 7px 11px; background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 9px; font-family: var(--font-mono); font-size: 11px;
          color: var(--text-tertiary); cursor: pointer; transition: all 0.2s;
        }
        .website-apikey-pill:hover { border-color: rgba(212,175,55,0.3); color: var(--text-secondary); }
        .website-apikey-pill .key-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .website-apikey-pill .key-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .website-key-btn {
          background: none; border: none; padding: 0; cursor: pointer;
          color: var(--text-placeholder); transition: color 0.15s; display: flex; align-items: center;
        }
        .website-key-btn:hover { color: var(--text-secondary); }
        /* Stats bar */
        .website-stats-bar {
          display: flex; gap: 8px;
        }
        .website-stat-item {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 7px 6px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 9px;
        }
        .website-stat-value { font-size: 14px; font-weight: 700; color: #cbd5e1; line-height: 1; }
        .website-stat-value.active-count { color: #10b981; }
        .website-stat-label { font-size: 9px; color: var(--text-placeholder); text-transform: uppercase; letter-spacing: 0.5px; }
        /* Divider */
        .website-card-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 0; }
        /* Action row */
        .website-action-row {
          display: flex;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .website-action-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
          padding: 11px 6px; font-size: 11.5px; font-weight: 600;
          background: none; border: none; cursor: pointer;
          border-right: 1px solid rgba(255,255,255,0.05);
          color: var(--text-muted); transition: background 0.15s, color 0.15s;
          font-family: 'Inter', sans-serif;
        }
        .website-action-btn:last-child { border-right: none; }
        .website-action-btn:hover { background: rgba(255,255,255,0.04); }
        .website-action-btn.code-btn:hover { color: #D4AF37; }
        .website-action-btn.edit-btn:hover { color: #34d399; }
        .website-action-btn.delete-btn:hover { color: #f87171; background: rgba(239,68,68,0.06); }
        /* Toggle label inside footer */
        .website-toggle-row {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 20px 12px;
        }
        .website-status-text { font-size: 11px; font-weight: 600; color: var(--text-muted); }
        .website-status-text.active { color: #10b981; }
        /* Empty state CTA */
        .website-empty-cta {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; padding: 60px 30px;
          border: 2px dashed rgba(212,175,55,0.2);
          border-radius: 20px; text-align: center;
          background: rgba(212,175,55,0.02);
          transition: border-color 0.2s, background 0.2s;
          cursor: pointer;
        }
        .website-empty-cta:hover { border-color: rgba(212,175,55,0.45); background: rgba(212,175,55,0.05); }
        .website-empty-icon { color: rgba(212,175,55,0.35); }
        .website-empty-cta h3 { font-size: 16px; font-weight: 700; color: var(--text-tertiary); margin: 0; }
        .website-empty-cta p { font-size: 13px; color: var(--text-secondary); margin: 0; }
        .website-empty-cta-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 22px; background: linear-gradient(135deg, #D4AF37, #B8962E);
          color: #0a0a0a; border: none; border-radius: 10px; font-size: 13px;
          font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif;
          box-shadow: 0 4px 14px rgba(212,175,55,0.4);
          transition: all 0.2s;
        }
        .website-empty-cta-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,175,55,0.55); }

        /* User cards */
        .users-list { display:flex; flex-direction:column; gap:10px; }
        .user-card { display:flex; align-items:center; gap:14px; padding:16px 20px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; transition:all 0.2s; }
        .user-card:hover { border-color:rgba(212,175,55,0.25); }
        .user-avatar { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:600; color:#fff; font-size:15px; flex-shrink:0; }
        .user-info { flex:1; min-width:0; }
        .user-name { font-size:14px; font-weight:600; color:var(--text-primary); }
        .user-email { font-size:12px; color:var(--text-secondary); }
        .role-badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:500; }
        .role-super_admin { background:rgba(239,68,68,0.12); color:#ef4444; }
        .role-admin { background:rgba(212,175,55,0.1); color:#D4AF37; }
        .role-viewer { background:rgba(107,114,128,0.12); color:#9ca3af; }
        .user-actions { display:flex; align-items:center; gap:8px; }
        .role-select { padding:5px 10px; background:rgba(255,255,255,0.04); border:1px solid var(--border-color); border-radius:6px; color:var(--text-secondary); font-size:12px; font-family:'Inter',sans-serif; cursor:pointer; }

        /* Danger zone */
        .danger-section .section-header { color:#ef4444; }
        .danger-card { border-color:rgba(239,68,68,0.2); }
        .danger-actions { display:flex; flex-direction:column; gap:0; }
        .danger-item { display:flex; align-items:center; justify-content:space-between; padding:16px 0; border-bottom:1px solid rgba(255,255,255,0.04); gap:16px; }
        .danger-item:last-child { border-bottom:none; }
        .danger-item strong { font-size:14px; color:var(--text-primary); display:block; }
        .danger-item p { font-size:12px; color:var(--text-tertiary); margin:4px 0 0; }

        .empty-state-sm { text-align:center; padding:30px; }
        .empty-state-sm p { color:var(--text-tertiary); font-size:13px; margin:0; }

        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .page-enter { animation:fadeUp 0.3s ease both; }
        .stagger-item { animation:fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }

        @media (max-width:600px) {
          .settings-cat-grid { grid-template-columns: 1fr; }
          .settings-form-grid { grid-template-columns:1fr; }
          .danger-item { flex-direction:column; align-items:flex-start; }
        }

        /* ── Infrastructure section ─────────────────────────────── */
        .infra-note {
          display:flex; gap:10px; align-items:flex-start;
          background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.15);
          border-radius:10px; padding:12px 14px; margin-bottom:16px;
        }
        .infra-note-icon { color:#818cf8; flex-shrink:0; margin-top:1px; }
        .infra-note-text { font-size:12px; color:var(--text-secondary); line-height:1.6; }
        .infra-note-text code { background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:4px; font-size:11px; font-family:'JetBrains Mono',monospace; }

        .provider-selector { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
        .provider-pill {
          display:flex; align-items:center; gap:12px; padding:16px 18px;
          background:rgba(255,255,255,0.02); border:2px solid var(--border-color);
          border-radius:12px; cursor:pointer; text-align:left;
          font-family:'Inter',sans-serif; transition:all 0.2s; position:relative;
        }
        .provider-pill:hover { border-color:rgba(212,175,55,0.35); background:rgba(212,175,55,0.04); }
        .provider-pill.active {
          border-color:#D4AF37; background:rgba(212,175,55,0.06);
          box-shadow:0 0 0 1px rgba(212,175,55,0.2), 0 4px 16px rgba(212,175,55,0.08);
        }
        .provider-pill-icon {
          width:38px; height:38px; border-radius:10px;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          background:rgba(255,255,255,0.06); color:var(--text-secondary); transition:all 0.2s;
        }
        .provider-pill.active .provider-pill-icon { background:rgba(212,175,55,0.12); color:#D4AF37; }
        .provider-pill-info { flex:1; }
        .provider-pill-name { font-size:13px; font-weight:600; color:var(--text-primary); display:block; margin-bottom:2px; }
        .provider-pill-desc { font-size:11px; color:var(--text-secondary); }
        .provider-pill-check {
          width:20px; height:20px; border-radius:50%; border:2px solid var(--border-color);
          display:flex; align-items:center; justify-content:center; font-size:11px;
          flex-shrink:0; transition:all 0.2s; color:transparent;
        }
        .provider-pill.active .provider-pill-check { background:#D4AF37; border-color:#D4AF37; color:#0a0a0a; font-weight:700; }

        .infra-sub-header { display:flex; align-items:center; gap:10px; margin:20px 0 12px; }
        .infra-sub-header h3 { font-size:14px; font-weight:600; color:var(--text-primary); margin:0; flex:1; }
        .infra-provider-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .infra-provider-dot.configured { background:#10b981; }
        .infra-provider-dot.unconfigured { background:rgba(255,255,255,0.18); }

        .source-badge {
          font-size:9.5px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;
          padding:2px 8px; border-radius:20px;
        }
        .source-badge.env { background:rgba(99,102,241,0.1); color:#818cf8; border:1px solid rgba(99,102,241,0.2); }
        .source-badge.db  { background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.2); }
        .source-badge.none { background:rgba(239,68,68,0.08); color:#f87171; border:1px solid rgba(239,68,68,0.15); }

        .label-hint { font-size:10px; font-weight:500; color:var(--text-muted); margin-left:6px; font-family:'JetBrains Mono',monospace; }

        .infra-panel-fields { margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.05); }
        .infra-divider-label {
          font-size:10px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase;
          color:var(--text-muted); margin-bottom:12px;
        }

        .test-result-row { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:12px; font-weight:600; min-height:20px; }
        .test-ok { color:#10b981; }
        .test-err { color:#ef4444; }

        .infra-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:600px) { .infra-row { grid-template-columns:1fr; } .provider-selector { grid-template-columns:1fr; } }
      </style>
    `;
  }

  // --- Navigation helpers ---
  function showSection(key) {
    const gate = document.getElementById('settings-gate');
    const panel = document.getElementById('settings-section-panel');
    const content = document.getElementById('settings-section-content');
    if (!gate || !panel || !content) return;

    const user = window.ALPAuth.getUser();
    const isSuperAdmin = user && (user.role === 'super_admin' || user.role === 'god');

    let html = '';
    switch (key) {
      case 'general':
        html = window.SettingsSections.renderGeneral();
        break;
      case 'telegram':
        html = window.SettingsSections.renderTelegram();
        break;
      case 'discord':
        html = window.SettingsSections.renderDiscord();
        break;
      case 'mail':
        html = window.SettingsSections.renderMail();
        break;
      case 'websites':
        html = window.SettingsSections.renderWebsites();
        break;
      case 'users':
        // Deep-links to the dedicated User Management page — never rendered inline.
        window.location.hash = '#/user-management';
        return;
      case 'panel':
        if (!isSuperAdmin) return;
        html = window.SettingsSections.renderPanel();
        break;
      case 'infrastructure':
        if (!isSuperAdmin) return;
        html = window.SettingsSections.renderInfrastructure();
        break;
      case 'danger':
        html = window.SettingsSections.renderDanger();
        break;
      default:
        return;
    }

    content.innerHTML = html;
    gate.style.display = 'none';
    panel.style.display = 'block';
    panel.style.animation = 'none';
    void panel.offsetWidth; // reflow
    panel.style.animation = '';

    // Trigger section-specific init
    switch (key) {
      case 'general':
        loadSettings();
        bindGeneralActions();
        break;
      case 'telegram':
        loadTelegram();
        bindTelegramActions();
        break;
      case 'discord':
        // UI-only for now — no wiring/persistence yet.
        break;
      case 'mail':
        // UI-only for now — no wiring/persistence yet.
        break;
      case 'websites':
        loadWebsites().then(() => window.SettingsWebsites.init(loadWebsites));
        break;
      // 'users' case removed — the click handler redirects to /user-management
      // before the section is ever rendered inline.
      case 'panel':
        loadPanel();
        bindPanelActions();
        break;
      case 'infrastructure':
        loadInfrastructure();
        bindInfrastructureActions();
        break;
      case 'danger':
        bindDangerActions();
        break;
    }
  }

  function goBack() {
    const gate = document.getElementById('settings-gate');
    const panel = document.getElementById('settings-section-panel');
    if (!gate || !panel) return;
    panel.style.display = 'none';
    gate.style.display = 'block';
    gate.style.animation = 'none';
    void gate.offsetWidth;
    gate.style.animation = '';
  }

  // --- Populate ---
  function populateSettings() {
    const s = settings;
    const el = (id) => document.getElementById(id);
    if (el('s-site-name')) el('s-site-name').value = s.site_name || 'Admin Live Panel';
    if (el('s-notify-new-session')) el('s-notify-new-session').checked = s.notify_new_session !== '0';
    if (el('s-notify-form-data')) el('s-notify-form-data').checked = s.notify_form_data !== '0';
    if (el('s-notify-sound')) el('s-notify-sound').value = s.notify_sound || '1';
    if (el('s-notify-duration')) el('s-notify-duration').value = s.notify_duration || '8';
    if (el('s-notify-volume')) {
      const vol = s.notify_volume !== undefined ? s.notify_volume : '100';
      el('s-notify-volume').value = vol;
      if (el('s-notify-volume-label')) el('s-notify-volume-label').textContent = `${vol}%`;
    }
    if (el('s-hold-sound')) el('s-hold-sound').value = s.hold_sound || 'pulse';
    if (el('s-hold-volume')) {
      const hvol = s.hold_volume !== undefined ? s.hold_volume : '80';
      el('s-hold-volume').value = hvol;
      if (el('s-hold-volume-label')) el('s-hold-volume-label').textContent = `${hvol}%`;
    }
  }

  function populateTelegram() {
    const t = telegram;
    const el = (id) => document.getElementById(id);
    if (el('s-tg-token')) el('s-tg-token').value = t.bot_token || '';
    if (el('s-tg-chatid')) el('s-tg-chatid').value = t.chat_id || '';
    if (el('s-tg-active')) el('s-tg-active').checked = !!t.is_active;
    if (el('s-tg-sessions')) el('s-tg-sessions').checked = !!t.notify_new_session;
    if (el('s-tg-formdata')) el('s-tg-formdata').checked = !!t.notify_form_data;
    if (el('s-tg-errors')) el('s-tg-errors').checked = !!t.notify_errors;
    if (el('s-tg-pageviews')) el('s-tg-pageviews').checked = !!t.notify_page_views;

    // Status
    const dot = document.getElementById('tg-status-dot');
    const label = document.getElementById('tg-status-label');
    const connected = t.is_active && t.bot_token && t.chat_id;
    if (dot) { dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`; }
    if (label) { label.className = `status-label ${connected ? 'connected' : 'disconnected'}`; label.textContent = connected ? 'Connected' : 'Disconnected'; }
  }

  function renderWebsites() {
    const list = document.getElementById('websites-list');
    const empty = document.getElementById('websites-empty');
    window.SettingsWebsites.setWebsites(websites);
    window.SettingsWebsites.renderWebsitesList(list, empty);
  }

  function renderUsers() {
    const list = document.getElementById('users-list');
    if (!list) return;

    if (users.length === 0) {
      list.innerHTML = '<div class="empty-state-sm"><p>No users found</p></div>';
      return;
    }

    list.innerHTML = users.map(u => `
      <div class="user-card" data-user-id="${u.id}">
        <div class="user-avatar" style="background:${u.avatar_color || avatarColor(u.username)}">${(u.username || '?')[0].toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.username)}</div>
          <div class="user-email">${escapeHtml(u.email)}</div>
        </div>
        <span class="role-badge role-${u.role}">${escapeHtml(u.role)}</span>
        <div class="user-actions">
          <select class="role-select user-role-select" data-id="${u.id}">
            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
          </select>
          <button class="btn btn-sm btn-danger user-delete-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Data loading methods

  // --- Data Loading ---
  async function loadSettings() {
    try {
      const data = await window.ALPApi.getSettings();
      settings = data.settings || data || {};
      populateSettings();
    } catch (e) { console.error('Load settings:', e); }
  }

  async function loadTelegram() {
    try {
      const data = await window.ALPApi.getTelegramConfig();
      telegram = data.config || data || {};
      populateTelegram();
    } catch (e) { console.error('Load telegram:', e); }
  }

  async function loadWebsites() {
    try {
      const data = await window.ALPApi.getWebsites();
      websites = data.websites || data || [];
      renderWebsites();
    } catch (e) { console.error('Load websites:', e); }
  }

  async function loadUsers() {
    try {
      const data = await window.ALPApi.getUsers();
      users = data.users || data || [];
      renderUsers();
    } catch (e) { console.error('Load users:', e); }
  }

  function addEnvRow(key = '', value = '') {
    const list = document.getElementById('env-vars-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'env-var-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;';
    row.innerHTML = `
      <input type="text" class="form-input env-key" placeholder="VARIABLE_NAME"
        value="${key.replace(/"/g,'&quot;')}"
        style="font-family:'JetBrains Mono',monospace;font-size:12px;">
      <div style="display:flex;align-items:center;position:relative;">
        <input type="password" class="form-input env-val" placeholder="value"
          value="${value.replace(/"/g,'&quot;')}"
          autocomplete="off" data-lpignore="true" data-form-type="other"
          style="font-size:12px;padding-right:52px;">
        <button type="button" class="input-toggle-btn env-show-btn"
          style="position:absolute;right:4px;top:50%;transform:translateY(-50%);">Show</button>
      </div>
      <button type="button" class="btn btn-outline env-remove-btn"
        style="padding:6px 10px;color:#f87171;border-color:rgba(248,113,113,0.3);min-width:auto;">×</button>
    `;
    row.querySelector('.env-show-btn').addEventListener('click', function() {
      const inp = this.closest('div').querySelector('input');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      this.textContent = inp.type === 'password' ? 'Show' : 'Hide';
    });
    row.querySelector('.env-remove-btn').addEventListener('click', () => row.remove());
    row.querySelector('.env-key').addEventListener('input', function() {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      this.setSelectionRange(pos, pos);
    });
    list.appendChild(row);
  }

  function renderEnvVars(vars) {
    const list = document.getElementById('env-vars-list');
    if (!list) return;
    list.innerHTML = '';
    if (!vars.length) {
      [['JWT_SECRET',''],['SUPABASE_URL',''],['SUPABASE_KEY',''],['PORT','3000']].forEach(([k,v]) => addEnvRow(k, v));
    } else {
      vars.forEach(v => addEnvRow(v.key, v.value));
    }
  }

  async function loadPanel() {
    try {
      const [hostingCfg, deployCfg, envData] = await Promise.all([
        window.ALPApi._request('GET', '/api/hosting'),
        window.ALPApi._request('GET', '/api/deploy/config').catch(() => ({})),
        window.ALPApi._request('GET', '/api/deploy/env').catch(() => ({ vars: [] })),
      ]);
      const p   = hostingCfg.panel || {};
      const d   = deployCfg || {};
      const el  = (id) => document.getElementById(id);
      renderEnvVars((envData || {}).vars || []);

      // Overview tab
      if (el('panel-domain'))  el('panel-domain').value  = p.domain  || '';
      if (el('panel-port'))    el('panel-port').value    = p.port    || '3000';
      if (el('panel-proxy'))   el('panel-proxy').value   = p.proxy   || 'none';
      if (el('panel-ssl'))     el('panel-ssl').checked   = p.ssl !== 'false';

      // URL preview
      if (p.domain) {
        const proto = p.ssl !== 'false' ? 'https' : 'http';
        const prev  = el('panel-url-preview');
        if (prev) { prev.textContent = `${proto}://${p.domain.replace(/^https?:\/\//, '')}`; prev.style.display = 'block'; }
      }

      // Server tab
      if (el('panel-vps-host')) el('panel-vps-host').value = p.vps_host || '';
      if (el('panel-ssh-port')) el('panel-ssh-port').value = p.ssh_port || '22';
      if (el('panel-ssh-user')) el('panel-ssh-user').value = p.ssh_user || 'root';
      const hint = el('panel-dns-hint');
      if (hint && p.vps_host) {
        hint.textContent = p.vps_host;
        el('panel-dns-hint-box').style.display = 'block';
      }

      // Deploy tab
      const authMode = d.auth_mode || 'key';
      const radioKey  = document.getElementById('auth-mode-key');
      const radioPass = document.getElementById('auth-mode-pass');
      if (radioKey)  radioKey.checked  = authMode === 'key';
      if (radioPass) radioPass.checked = authMode === 'password';
      toggleAuthMode(authMode, d.has_key, d.has_pass);

      if (el('deploy-git-repo'))   el('deploy-git-repo').value   = d.git_repo   || '';
      if (el('deploy-git-branch')) el('deploy-git-branch').value = d.git_branch || 'main';
      if (el('deploy-app-dir'))    el('deploy-app-dir').value    = d.app_dir    || '/var/www/alp';
      if (el('deploy-pm2-name'))   el('deploy-pm2-name').value   = d.pm2_name   || 'alp';

    } catch (e) { console.error('Load panel config:', e); }
  }

  function toggleAuthMode(mode, hasKey, hasPass) {
    const keyGroup  = document.getElementById('ssh-key-group');
    const passGroup = document.getElementById('ssh-pass-group');
    if (!keyGroup || !passGroup) return;
    keyGroup.style.display  = mode === 'key'      ? 'block' : 'none';
    passGroup.style.display = mode === 'password' ? 'block' : 'none';
    if (mode === 'key' && hasKey) {
      document.getElementById('ssh-key-saved-row').style.display = 'flex';
      document.getElementById('ssh-key-input-wrap').style.display = 'none';
    }
    if (mode === 'password' && hasPass) {
      const savedRow = document.getElementById('ssh-pass-saved-row');
      const inputWrap = document.getElementById('ssh-pass-input-wrap');
      if (savedRow)  savedRow.style.display  = 'flex';
      if (inputWrap) inputWrap.style.display = 'none';
    }
  }

  async function loadPanelHistory() {
    const container = document.getElementById('deploy-history-table');
    if (!container) return;
    try {
      const data = await window.ALPApi._request('GET', '/api/deploy/history');
      const rows  = data.history || [];
      if (!rows.length) {
        container.innerHTML = '<div class="empty-state-sm"><p>No deployments yet</p></div>';
        return;
      }
      container.innerHTML = rows.map(r => {
        const details  = (() => { try { return JSON.parse(r.details || '{}'); } catch { return {}; } })();
        const isSetup  = r.action.toLowerCase().includes('setup');
        const isFailed = r.action.toLowerCase().includes('failed');
        const badge    = isFailed ? 'failed' : isSetup ? 'setup' : 'success';
        const label    = isFailed ? 'Failed' : isSetup ? 'Setup' : 'Deploy';
        const time     = new Date(r.created_at).toLocaleString();
        const dur      = details.duration ? ` · ${details.duration}` : '';
        return `
          <div class="deploy-history-row">
            <span class="deploy-badge ${badge}">${label}</span>
            <span style="color:var(--text-primary);font-size:12px;">${r.action}</span>
            <span style="color:var(--text-muted);font-size:11px;font-family:'JetBrains Mono',monospace;">${dur}</span>
            <span style="color:var(--text-muted);font-size:11px;">${time}</span>
          </div>`;
      }).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state-sm"><p>Could not load history</p></div>';
    }
  }

  function bindPanelActions() {
    // ── Tab switching
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const content = document.getElementById(`panel-tab-${tab.dataset.tab}`);
        if (content) content.classList.add('active');
        if (tab.dataset.tab === 'history') loadPanelHistory();
      });
    });

    // ── Live URL preview
    const updatePreview = () => {
      const domain = (document.getElementById('panel-domain')?.value || '').replace(/^https?:\/\//, '').trim();
      const ssl    = document.getElementById('panel-ssl')?.checked !== false;
      const prev   = document.getElementById('panel-url-preview');
      if (!prev) return;
      if (domain) { prev.textContent = `${ssl ? 'https' : 'http'}://${domain}`; prev.style.display = 'block'; }
      else        { prev.textContent = ''; prev.style.display = 'none'; }
    };
    document.getElementById('panel-domain')?.addEventListener('input', updatePreview);
    document.getElementById('panel-ssl')?.addEventListener('change', updatePreview);

    // ── Live DNS hint
    document.getElementById('panel-vps-host')?.addEventListener('input', (e) => {
      const ip   = e.target.value.trim();
      const hint = document.getElementById('panel-dns-hint');
      const box  = document.getElementById('panel-dns-hint-box');
      if (hint) hint.textContent = ip || '';
      if (box)  box.style.display = ip ? 'block' : 'none';
    });

    // ── Auth mode toggle
    document.querySelectorAll('[name="deploy-auth-mode"]').forEach(r => {
      r.addEventListener('change', () => toggleAuthMode(r.value, false));
    });
    document.getElementById('ssh-pass-change-btn')?.addEventListener('click', () => {
      document.getElementById('ssh-pass-saved-row').style.display  = 'none';
      document.getElementById('ssh-pass-input-wrap').style.display = 'block';
      document.getElementById('deploy-ssh-pass')?.focus();
    });

    document.getElementById('ssh-key-change-btn')?.addEventListener('click', () => {
      document.getElementById('ssh-key-saved-row').style.display = 'none';
      document.getElementById('ssh-key-input-wrap').style.display = 'block';
      document.getElementById('deploy-ssh-key').focus();
    });

    // ── Show/hide password
    document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.togglePass);
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
      });
    });

    // ── Test connection (Overview tab)
    document.getElementById('test-panel-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const res = document.getElementById('panel-test-result');
      btn.disabled = true; btn.textContent = 'Testing…'; if (res) res.innerHTML = '';
      try {
        const data = await window.ALPApi._request('POST', '/api/hosting/test/panel');
        if (res) res.innerHTML = data.ok
          ? `<span class="test-ok">✓ Reachable — HTTP ${data.http_status}</span>`
          : `<span class="test-err">✗ ${data.error}</span>`;
      } catch (ex) { if (res) res.innerHTML = `<span class="test-err">✗ ${ex.message}</span>`; }
      btn.disabled = false; btn.textContent = 'Test Connection';
    });

    // ── Save Overview
    document.getElementById('save-panel-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const el = id => document.getElementById(id);
        await window.ALPApi._request('PUT', '/api/hosting', { panel: {
          domain:   el('panel-domain')?.value.trim()  || '',
          port:     el('panel-port')?.value.trim()    || '3000',
          proxy:    el('panel-proxy')?.value          || 'none',
          ssl:      el('panel-ssl')?.checked ? 'true' : 'false',
        }});
        window.showToast('Overview saved', 'success'); await loadPanel();
      } catch (ex) { window.showToast('Failed: ' + ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Save';
    });

    // ── Save Server Settings
    document.getElementById('save-panel-server-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const el = id => document.getElementById(id);
        await window.ALPApi._request('PUT', '/api/hosting', { panel: {
          vps_host: el('panel-vps-host')?.value.trim() || '',
          ssh_port: el('panel-ssh-port')?.value.trim() || '22',
          ssh_user: el('panel-ssh-user')?.value.trim() || 'root',
        }});
        window.showToast('Server settings saved', 'success'); await loadPanel();
      } catch (ex) { window.showToast('Failed: ' + ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Save Server Settings';
    });

    // ── Save Deploy Config
    document.getElementById('save-deploy-cfg-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const el       = id => document.getElementById(id);
        const authMode = document.querySelector('[name="deploy-auth-mode"]:checked')?.value || 'key';
        const body     = {
          auth_mode:  authMode,
          git_repo:   el('deploy-git-repo')?.value.trim()   || '',
          git_branch: el('deploy-git-branch')?.value.trim() || 'main',
          app_dir:    el('deploy-app-dir')?.value.trim()    || '/var/www/alp',
          pm2_name:   el('deploy-pm2-name')?.value.trim()   || 'alp',
        };
        const keyVal  = el('deploy-ssh-key')?.value.trim();
        const passVal = el('deploy-ssh-pass')?.value.trim();
        if (authMode === 'key'      && keyVal)  body.ssh_key  = keyVal;
        if (authMode === 'password' && passVal) body.ssh_pass = passVal;
        await window.ALPApi._request('PUT', '/api/deploy/config', body);
        window.showToast('Deploy config saved', 'success');
        if (keyVal || passVal) await loadPanel();
      } catch (ex) { window.showToast('Failed: ' + ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Save Config';
    });

    // ── Env vars: add row
    document.getElementById('btn-add-env-var')?.addEventListener('click', () => addEnvRow());

    // ── Env vars: save
    document.getElementById('save-env-vars-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const vars = [];
        document.querySelectorAll('.env-var-row').forEach(row => {
          const key = row.querySelector('.env-key')?.value.trim();
          const val = row.querySelector('.env-val')?.value ?? '';
          if (key) vars.push({ key, value: val });
        });
        await window.ALPApi._request('PUT', '/api/deploy/env', { vars });
        window.showToast(`${vars.length} variable${vars.length === 1 ? '' : 's'} saved`, 'success');
      } catch (ex) { window.showToast('Failed: ' + ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Save Variables';
    });

    // ── Refresh history
    document.getElementById('refresh-history-btn')?.addEventListener('click', loadPanelHistory);

    // ── Terminal helpers
    let deployStepMap = {};

    function termShow(title) {
      const wrap = document.getElementById('deploy-terminal-wrap');
      const ttl  = document.getElementById('terminal-title');
      if (wrap) wrap.style.display = 'block';
      if (ttl)  ttl.textContent = title;
      document.getElementById('deploy-steps').innerHTML = '';
      document.getElementById('deploy-log').innerHTML   = '';
      document.getElementById('deploy-summary').style.display = 'none';
      deployStepMap = {};
      wrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function termStep(id, label, status) {
      const container = document.getElementById('deploy-steps');
      if (!container) return;
      let el = document.getElementById(`dstep-${id}`);
      if (!el) {
        el = document.createElement('div');
        el.id        = `dstep-${id}`;
        el.className = 'deploy-step';
        el.innerHTML = `<div class="step-icon"></div><span class="step-label"></span>`;
        container.appendChild(el);
        deployStepMap[id] = el;
      }
      el.className = `deploy-step ${status}`;
      el.querySelector('.step-label').textContent = label || el.querySelector('.step-label').textContent;
      const icon = el.querySelector('.step-icon');
      if      (status === 'running') { icon.className = 'step-icon spinning'; icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`; }
      else if (status === 'done')    { icon.className = 'step-icon'; icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`; }
      else if (status === 'error')   { icon.className = 'step-icon'; icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`; }
      else if (status === 'warning') { icon.className = 'step-icon'; icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }
    }

    const LEVEL_COLOR = { success: '#34d399', error: '#f87171', warn: '#fbbf24', warning: '#fbbf24', info: 'rgba(255,255,255,0.7)' };

    function termLog(line, level) {
      const log = document.getElementById('deploy-log');
      if (!log || !line) return;
      const span = document.createElement('span');
      span.style.color = LEVEL_COLOR[level] || 'rgba(255,255,255,0.7)';
      span.textContent = line + '\n';
      log.appendChild(span);
      log.scrollTop = log.scrollHeight;
    }

    function termFinish(success, duration) {
      const dot     = document.getElementById('terminal-status-dot');
      const title   = document.getElementById('terminal-title');
      const summary = document.getElementById('deploy-summary');
      if (dot)   { dot.style.animation = 'none'; dot.style.background = success ? '#28c840' : '#ff5f57'; }
      if (title) title.textContent = success ? `Done in ${duration}s` : 'Deploy failed';
      if (summary) {
        summary.style.display = 'block';
        summary.style.color   = success ? '#34d399' : '#f87171';
        summary.textContent   = success ? `✓  Deployed successfully in ${duration}s` : `✗  Deployment failed — check logs above`;
      }
      if (success) { setTimeout(() => loadPanelHistory(), 1500); }
    }

    function startSSEDeploy(deployId, title) {
      termShow(title);
      const token = localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token');
      const es    = new EventSource(`/api/deploy/stream?id=${deployId}&token=${encodeURIComponent(token)}`);
      es.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if      (msg.type === 'step') termStep(msg.id, msg.label, msg.status);
          else if (msg.type === 'log')  termLog(msg.line, msg.level);
          else if (msg.type === 'done') { termFinish(msg.success, msg.duration); es.close(); }
          else if (msg.type === 'error') { termLog(msg.message, 'error'); es.close(); }
        } catch {}
      };
      es.onerror = () => { termLog('Connection to deploy stream lost', 'error'); es.close(); };
    }

    // ── Setup Server button
    document.getElementById('btn-setup-server')?.addEventListener('click', () => {
      window.showModal({
        title:   'Setup Server',
        content: '<p style="color:var(--text-secondary);font-size:14px;">This will install Node.js, PM2, nginx, clone your repo, and configure the server from scratch.<br><br>This is safe to run on a fresh VPS. Existing apps will not be affected.</p>',
        onConfirm: async () => {
          try {
            const { deployId } = await window.ALPApi._request('POST', '/api/deploy/panel/setup');
            startSSEDeploy(deployId, 'Server Setup');
          } catch (ex) { window.showToast('Failed to start setup: ' + ex.message, 'error'); }
        },
      });
    });

    // ── Deploy Now button
    document.getElementById('btn-deploy-panel')?.addEventListener('click', () => {
      window.showModal({
        title:   'Deploy Panel',
        content: '<p style="color:var(--text-secondary);font-size:14px;">Pull the latest code from git, run <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">npm install</code>, and restart the PM2 process.</p>',
        onConfirm: async () => {
          try {
            const { deployId } = await window.ALPApi._request('POST', '/api/deploy/panel');
            startSSEDeploy(deployId, 'Deploying Panel');
          } catch (ex) { window.showToast('Failed to start deploy: ' + ex.message, 'error'); }
        },
      });
    });

    // ── Quick Pull (god-only) — content-only VPS sync, no npm/pm2 restart
    if (window.ALPAuth?.isGod?.()) {
      const tile = document.getElementById('tile-quick-sync');
      if (tile) tile.style.display = '';
    }
    document.getElementById('btn-quick-sync')?.addEventListener('click', () => {
      if (!window.ALPAuth?.isGod?.()) { window.showToast('God role required', 'error'); return; }
      window.showModal({
        title:   'Quick Pull VPS',
        content: '<p style="color:var(--text-secondary);font-size:14px;">Runs <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">git fetch origin &amp;&amp; git reset --hard origin/&lt;branch&gt;</code> on the panel VPS. Use for content-only changes (xPages, uploads). Skips npm install and PM2 restart — the panel process keeps running.</p>',
        onConfirm: async () => {
          const btn = document.getElementById('btn-quick-sync');
          const out = document.getElementById('quick-sync-result');
          if (btn) { btn.disabled = true; btn.textContent = 'Pulling…'; }
          if (out) out.textContent = '';
          try {
            const r = await window.ALPApi._request('POST', '/api/deploy/vps-pull');
            if (r.ok) {
              window.showToast('VPS pulled: ' + (r.sha || 'ok'), 'success');
              if (out) out.textContent = `✓ ${r.host} · ${r.branch} · ${r.sha || 'ok'}`;
              try { loadDeployHistory(); } catch {}
            } else {
              window.showToast('Pull failed: ' + (r.error || 'unknown'), 'error');
              if (out) out.textContent = `✗ ${r.error || 'unknown error'}`;
            }
          } catch (ex) {
            window.showToast('Pull failed: ' + ex.message, 'error');
            if (out) out.textContent = `✗ ${ex.message}`;
          } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Quick Pull VPS'; }
          }
        },
      });
    });
  }

  async function loadInfrastructure() {
    try {
      const cfg = await window.ALPApi._request('GET', '/api/hosting');

      // Active provider toggle
      const pills = document.querySelectorAll('.provider-pill');
      pills.forEach(p => {
        p.classList.toggle('active', p.dataset.provider === cfg.active_provider);
      });
      const providerInput = document.getElementById('infra-active-provider');
      if (providerInput) providerInput.value = 'vps';

      // Element lookup helper for the remaining VPS / Cloudflare fields.
      const rwEl = (id) => document.getElementById(id);

      // VPS
      const vps = cfg.vps;
      if (rwEl('vps-host'))       rwEl('vps-host').value       = vps.host;
      if (rwEl('vps-ssh-port'))   rwEl('vps-ssh-port').value   = vps.ssh_port;
      if (rwEl('vps-ssh-user'))   rwEl('vps-ssh-user').value   = vps.ssh_user;
      if (rwEl('vps-panel'))      rwEl('vps-panel').value      = vps.panel;
      if (rwEl('vps-panel-url'))  rwEl('vps-panel-url').value  = vps.panel_url;
      if (rwEl('vps-panel-user')) rwEl('vps-panel-user').value = vps.panel_user;
      if (rwEl('vps-panel-pass-display')) rwEl('vps-panel-pass-display').textContent = vps.panel_pass_masked || '—';
      const vpsDot = document.getElementById('vps-status-dot');
      if (vpsDot) { vpsDot.className = `infra-provider-dot ${vps.configured ? 'configured' : 'unconfigured'}`; }
      const vpsLabel = document.getElementById('vps-status-label');
      if (vpsLabel) { vpsLabel.textContent = vps.configured ? 'Configured' : 'Not configured'; vpsLabel.style.color = vps.configured ? '#10b981' : 'var(--text-muted)'; }
      togglePanelFields(vps.panel);

      // Cloudflare
      const cf = cfg.cloudflare;
      if (rwEl('cf-token-display'))  rwEl('cf-token-display').textContent = cf.token_masked || '—';
      if (rwEl('cf-email'))          rwEl('cf-email').value                = cf.email || '';
      if (rwEl('cf-account-id'))     rwEl('cf-account-id').value           = cf.account_id || '';
      const cfBadge = document.getElementById('cf-source-badge');
      if (cfBadge) { cfBadge.className = `source-badge ${cf.source}`; cfBadge.textContent = cf.source === 'db' ? 'DB' : cf.source === 'env' ? 'ENV' : 'Not Set'; }
      const cfDot = document.getElementById('cf-status-dot');
      if (cfDot) { cfDot.className = `infra-provider-dot ${cf.configured ? 'configured' : 'unconfigured'}`; }
      const cfLabel = document.getElementById('cf-status-label');
      if (cfLabel) { cfLabel.textContent = cf.configured ? 'Configured' : 'Not configured'; cfLabel.style.color = cf.configured ? '#10b981' : 'var(--text-muted)'; }

    } catch (e) { console.error('Load infrastructure:', e); }
  }

  function togglePanelFields(panel) {
    const fields = document.getElementById('vps-panel-fields');
    if (fields) fields.style.display = (panel && panel !== 'none') ? 'block' : 'none';
  }

  // --- Section-specific bind functions ---

  function bindGeneralActions() {
    var saveGeneral = document.getElementById('save-general-btn');
    if (saveGeneral) {
      saveGeneral.addEventListener('click', async () => {
        try {
          await window.ALPApi.updateSettings({
            site_name: document.getElementById('s-site-name').value,
            notify_new_session: document.getElementById('s-notify-new-session').checked ? '1' : '0',
            notify_form_data: document.getElementById('s-notify-form-data').checked ? '1' : '0',
            notify_sound: document.getElementById('s-notify-sound').value,
            notify_volume: document.getElementById('s-notify-volume').value,
            notify_duration: document.getElementById('s-notify-duration').value || '8',
            hold_sound: document.getElementById('s-hold-sound') ? document.getElementById('s-hold-sound').value : 'pulse',
            hold_volume: document.getElementById('s-hold-volume') ? document.getElementById('s-hold-volume').value : '80'
          });
          if (window.reloadGlobalSettings) await window.reloadGlobalSettings();
          window.showToast('General settings saved', 'success');
        } catch (e) { window.showToast('Failed to save', 'error'); }
      });
    }

    var volSlider = document.getElementById('s-notify-volume');
    var volLabel = document.getElementById('s-notify-volume-label');
    if (volSlider && volLabel) {
      volSlider.addEventListener('input', (e) => {
        volLabel.textContent = `${e.target.value}%`;
      });
      volSlider.addEventListener('change', (e) => {
        if (window.playNotificationSound) {
          const snd = document.getElementById('s-notify-sound').value;
          window.playNotificationSound(snd, e.target.value);
        }
      });
    }

    var previewBtn = document.getElementById('btn-preview-sound');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        if (window.playNotificationSound) {
          const snd = document.getElementById('s-notify-sound').value;
          const vol = document.getElementById('s-notify-volume').value;
          if (snd === '0') {
            window.showToast('Select a sound to preview', 'info');
          } else {
            window.playNotificationSound(snd, vol);
          }
        }
      });
    }

    var holdVolSlider = document.getElementById('s-hold-volume');
    var holdVolLabel = document.getElementById('s-hold-volume-label');
    if (holdVolSlider && holdVolLabel) {
      holdVolSlider.addEventListener('input', (e) => {
        holdVolLabel.textContent = `${e.target.value}%`;
      });
      holdVolSlider.addEventListener('change', (e) => {
        if (window.holdSoundManager) {
          const snd = document.getElementById('s-hold-sound').value;
          window.holdSoundManager.preview(snd, e.target.value);
        }
      });
    }

    var previewHoldBtn = document.getElementById('btn-preview-hold-sound');
    if (previewHoldBtn) {
      previewHoldBtn.addEventListener('click', () => {
        if (window.holdSoundManager) {
          const snd = document.getElementById('s-hold-sound').value;
          const vol = document.getElementById('s-hold-volume').value;
          if (snd === '0') {
            window.showToast('Select a hold sound to preview', 'info');
          } else {
            window.holdSoundManager.preview(snd, vol);
          }
        }
      });
    }
  }

  function bindSecurityActions() {
    var changePasswordBtn = document.getElementById('change-password-btn');
    if (changePasswordBtn) {
      changePasswordBtn.addEventListener('click', async () => {
        var newPassword = document.getElementById('s-new-password').value;
        var confirmPassword = document.getElementById('s-confirm-password').value;
        if (!newPassword) { window.showToast('Please enter a new password', 'warning'); return; }
        if (newPassword.length < 6) { window.showToast('Password must be at least 6 characters', 'warning'); return; }
        if (newPassword !== confirmPassword) { window.showToast('Passwords do not match', 'warning'); return; }
        try {
          changePasswordBtn.textContent = 'Updating...';
          changePasswordBtn.disabled = true;
          await window.ALPApi.updateProfile({ password: newPassword });
          window.showToast('Password updated successfully', 'success');
          document.getElementById('s-new-password').value = '';
          document.getElementById('s-confirm-password').value = '';
        } catch (e) {
          window.showToast('Failed to update password: ' + e.message, 'error');
        } finally {
          changePasswordBtn.textContent = 'Update Password';
          changePasswordBtn.disabled = false;
        }
      });
    }
  }

  function bindTelegramActions() {
    var tgTokenToggle = document.getElementById('tg-token-toggle');
    if (tgTokenToggle) {
      tgTokenToggle.addEventListener('click', () => {
        var inp = document.getElementById('s-tg-token');
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        tgTokenToggle.textContent = show ? 'Hide' : 'Show';
      });
    }
    var saveTg = document.getElementById('save-tg-btn');
    if (saveTg) {
      saveTg.addEventListener('click', async () => {
        try {
          await window.ALPApi.updateTelegramConfig({
            bot_token: document.getElementById('s-tg-token').value,
            chat_id: document.getElementById('s-tg-chatid').value,
            is_active: document.getElementById('s-tg-active').checked ? 1 : 0,
            notify_new_session: document.getElementById('s-tg-sessions').checked ? 1 : 0,
            notify_form_data: document.getElementById('s-tg-formdata').checked ? 1 : 0,
            notify_errors: document.getElementById('s-tg-errors').checked ? 1 : 0,
            notify_page_views: document.getElementById('s-tg-pageviews').checked ? 1 : 0
          });
          await loadTelegram();
          window.showToast('Telegram settings saved', 'success');
        } catch (e) { window.showToast('Failed to save', 'error'); }
      });
    }
    var testTg = document.getElementById('test-tg-btn');
    if (testTg) {
      testTg.addEventListener('click', async () => {
        try {
          var res = await window.ALPApi.testTelegram();
          if (res.success) {
            window.showToast('Test message sent successfully!', 'success');
          } else {
            window.showToast('Test failed: ' + (res.error || 'Unknown error'), 'error');
          }
        } catch (e) { window.showToast('Test failed: ' + e.message, 'error'); }
      });
    }
  }

  function bindUserActions() {
    var usersList = document.getElementById('users-list');
    if (usersList) {
      usersList.addEventListener('click', async (e) => {
        var deleteBtn = e.target.closest('.user-delete-btn');
        if (deleteBtn) {
          var username = deleteBtn.dataset.username;
          window.showModal({
            title: 'Delete User',
            content: '<p style="color:var(--text-secondary);">Delete user <strong>' + escapeHtml(username) + '</strong>? This cannot be undone.</p>',
            onConfirm: async () => {
              try {
                await window.ALPApi.deleteUser(deleteBtn.dataset.id);
                window.showToast('User deleted', 'success');
                await loadUsers();
              } catch (err) { window.showToast('Failed', 'error'); }
            }
          });
        }
      });
      usersList.addEventListener('change', async (e) => {
        var roleSelect = e.target.closest('.user-role-select');
        if (roleSelect) {
          try {
            await window.ALPApi.updateUser(roleSelect.dataset.id, { role: roleSelect.value });
            window.showToast('Role updated', 'success');
            await loadUsers();
          } catch (err) { window.showToast('Failed to update role', 'error'); }
        }
      });
    }
    var addUser = document.getElementById('add-user-btn');
    if (addUser) {
      addUser.addEventListener('click', () => {
        window.showModal({
          title: 'Add User',
          content: '<div style="display:flex;flex-direction:column;gap:14px;"><div class="form-group"><label>Username</label><input type="text" id="modal-user-username" class="form-input" /></div><div class="form-group"><label>Email</label><input type="email" id="modal-user-email" class="form-input" /></div><div class="form-group"><label>Password</label><input type="password" id="modal-user-password" class="form-input" /></div><div class="form-group"><label>Role</label><select id="modal-user-role" class="form-select"><option value="viewer">Viewer</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></div></div>',
          onConfirm: async () => {
            var data = {
              username: document.getElementById('modal-user-username').value.trim(),
              email: document.getElementById('modal-user-email').value.trim(),
              password: document.getElementById('modal-user-password').value,
              role: document.getElementById('modal-user-role').value
            };
            if (!data.username || !data.email || !data.password) {
              window.showToast('All fields are required', 'warning'); return;
            }
            try {
              await window.ALPApi.createUser(data);
              window.showToast('User created', 'success');
              await loadUsers();
            } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
          }
        });
      });
    }
  }

  function bindDangerActions() {
    var confirmDanger = function(title, msg, action) {
      window.showModal({
        title: title,
        content: '<p style="color:var(--text-secondary);font-size:14px;">' + msg + '</p><p style="color:#ef4444;font-size:13px;margin-top:8px;">This action cannot be undone.</p>',
        onConfirm: action
      });
    };
    var clearSessions = document.getElementById('clear-sessions-btn');
    if (clearSessions) {
      clearSessions.addEventListener('click', () => {
        confirmDanger('Clear All Sessions', 'This will permanently remove all session data.', async () => {
          try { await window.ALPApi.clearSessions(); window.showToast('Sessions cleared', 'success'); }
          catch (e) { window.showToast('Failed', 'error'); }
        });
      });
    }
    var clearLogs = document.getElementById('clear-all-logs-btn');
    if (clearLogs) {
      clearLogs.addEventListener('click', () => {
        confirmDanger('Clear All Logs', 'This will permanently delete all audit logs.', async () => {
          try { await window.ALPApi.clearAllLogs(); window.showToast('Logs cleared', 'success'); }
          catch (e) { window.showToast('Failed', 'error'); }
        });
      });
    }
    var resetSettings = document.getElementById('reset-settings-btn');
    if (resetSettings) {
      resetSettings.addEventListener('click', () => {
        confirmDanger('Reset Settings', 'This will restore all settings to default values.', async () => {
          try { await window.ALPApi.resetSettings(); window.showToast('Settings reset', 'success'); await loadSettings(); }
          catch (e) { window.showToast('Failed', 'error'); }
        });
      });
    }
  }

  function bindInfrastructureActions() {
    // Provider pill toggle
    document.querySelectorAll('.provider-pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('.provider-pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        const input = document.getElementById('infra-active-provider');
        if (input) input.value = p.dataset.provider;
      });
    });

    // Show/hide password fields
    document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.togglePass);
        if (!target) return;
        if (target.type === 'password') { target.type = 'text'; btn.textContent = 'Hide'; }
        else                            { target.type = 'password'; btn.textContent = 'Show'; }
      });
    });

    // Panel dropdown toggle
    const panelSel = document.getElementById('vps-panel');
    if (panelSel) {
      panelSel.addEventListener('change', () => togglePanelFields(panelSel.value));
    }

    // Token field swap (click masked display → show real input)
    ['rw', 'cf'].forEach(prefix => {
      const display = document.getElementById(`${prefix}-token-display`);
      const editBtn = document.getElementById(`${prefix}-token-edit-btn`);
      const inputWrap = document.getElementById(`${prefix}-token-input-wrap`);
      if (editBtn && display && inputWrap) {
        editBtn.addEventListener('click', () => {
          display.closest('.token-display-row').style.display = 'none';
          inputWrap.style.display = 'flex';
          inputWrap.querySelector('input').focus();
        });
      }
    });

    // VPS panel-pass edit
    const vpsPpDisplay = document.getElementById('vps-panel-pass-display');
    const vpsPpEditBtn = document.getElementById('vps-panel-pass-edit-btn');
    const vpsPpWrap    = document.getElementById('vps-panel-pass-input-wrap');
    if (vpsPpEditBtn && vpsPpDisplay && vpsPpWrap) {
      vpsPpEditBtn.addEventListener('click', () => {
        vpsPpDisplay.closest('.token-display-row').style.display = 'none';
        vpsPpWrap.style.display = 'flex';
        vpsPpWrap.querySelector('input').focus();
      });
    }

    // Test connection helpers
    async function runTest(endpoint, btnId, resultId) {
      const btn    = document.getElementById(btnId);
      const result = document.getElementById(resultId);
      if (!btn || !result) return;
      btn.disabled = true;
      btn.textContent = 'Testing…';
      result.innerHTML = '';
      try {
        const data = await window.ALPApi._request('POST', `/api/hosting/test/${endpoint}`);
        if (data.ok) {
          const detail = data.service_name ? ` — ${data.service_name}` : data.status ? ` — ${data.status}` : data.note ? ` — ${data.note}` : '';
          result.innerHTML = `<span class="test-ok">✓ Connected${detail}</span>`;
        } else {
          result.innerHTML = `<span class="test-err">✗ ${data.error || 'Connection failed'}</span>`;
        }
      } catch (e) {
        result.innerHTML = `<span class="test-err">✗ ${e.message}</span>`;
      }
      btn.disabled = false;
      btn.textContent = 'Test Connection';
    }

    const testCfBtn = document.getElementById('test-cloudflare-btn');
    if (testCfBtn) testCfBtn.addEventListener('click', () => runTest('cloudflare', 'test-cloudflare-btn', 'cf-test-result'));

    const testVpsBtn = document.getElementById('test-vps-btn');
    if (testVpsBtn) testVpsBtn.addEventListener('click', () => runTest('vps', 'test-vps-btn', 'vps-test-result'));

    // Save
    const saveBtn = document.getElementById('save-infra-btn');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const el = (id) => document.getElementById(id);
        const cfTokenInput = el('cf-token-input');
        const vpsPpInput   = el('vps-panel-pass');

        const body = {
          active_provider: 'vps',
          vps: {
            host:       el('vps-host')?.value.trim() || '',
            ssh_port:   el('vps-ssh-port')?.value.trim() || '22',
            ssh_user:   el('vps-ssh-user')?.value.trim() || 'root',
            panel:      el('vps-panel')?.value || 'none',
            panel_url:  el('vps-panel-url')?.value.trim() || '',
            panel_user: el('vps-panel-user')?.value.trim() || '',
            panel_pass: vpsPpInput?.value.trim() || '',
          },
          cloudflare: {
            token:      cfTokenInput?.value.trim() || '',
            email:      el('cf-email')?.value.trim() || '',
            account_id: el('cf-account-id')?.value.trim() || '',
          },
        };

        await window.ALPApi._request('PUT', '/api/hosting', body);
        window.showToast('Infrastructure configuration saved', 'success');
        await loadInfrastructure();
      } catch (e) {
        window.showToast('Failed to save: ' + e.message, 'error');
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Configuration';
    });
  }

  // --- Init: wire gatekeeper card clicks + Back button ---
  function init() {
    var gate = document.getElementById('settings-gate');
    if (gate) {
      gate.addEventListener('click', (e) => {
        var card = e.target.closest('.settings-cat-card');
        if (!card || !card.dataset.section) return;
        // Category with an `href` deep-links to another page instead of
        // rendering an inline section. Used by "User Management" → /user-management.
        const cat = CATEGORIES.find(c => c.key === card.dataset.section);
        if (cat && cat.href) { window.location.hash = cat.href; return; }
        showSection(card.dataset.section);
      });
    }
    var backBtn = document.getElementById('settings-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', goBack);
    }
  }

  function destroy() {
    settings = {};
    telegram = {};
    websites = [];
    users = [];
  }

  return { render, init, destroy };
})();

if (typeof window !== 'undefined') {
  window.SettingsPage = SettingsPage;
}
