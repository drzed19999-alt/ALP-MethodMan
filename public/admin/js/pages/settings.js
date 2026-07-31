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
    {
      key: 'security',
      label: 'Account Security',
      desc: 'Change your password',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`
    },
    {
      key: 'telegram',
      label: 'Telegram',
      desc: 'Bot integration & alerts',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.12)',
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>`
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
      label: 'Users',
      desc: 'Manage admin accounts',
      color: '#8b5cf6',
      bg: 'rgba(139,92,246,0.12)',
      superAdminOnly: true,
      icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`
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
    const visibleCats = CATEGORIES.filter(c => {
      if (c.godOnly && !isGod) return false;
      if (c.superAdminOnly && !isSuperAdmin) return false;
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
    const isSuperAdmin = user && user.role === 'super_admin';

    let html = '';
    switch (key) {
      case 'general':
        html = window.SettingsSections.renderGeneral() + window.SettingsSections.renderSecurity();
        break;
      case 'security':
        html = window.SettingsSections.renderSecurity();
        break;
      case 'telegram':
        html = window.SettingsSections.renderTelegram();
        break;
      case 'websites':
        html = window.SettingsSections.renderWebsites();
        break;
      case 'users':
        if (!isSuperAdmin) return;
        html = window.SettingsSections.renderUsers();
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
        bindSecurityActions();
        break;
      case 'security':
        bindSecurityActions();
        break;
      case 'telegram':
        loadTelegram();
        bindTelegramActions();
        break;
      case 'websites':
        loadWebsites().then(() => window.SettingsWebsites.init(loadWebsites));
        break;
      case 'users':
        loadUsers();
        bindUserActions();
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

  // --- Init: wire gatekeeper card clicks + Back button ---
  function init() {
    var gate = document.getElementById('settings-gate');
    if (gate) {
      gate.addEventListener('click', (e) => {
        var card = e.target.closest('.settings-cat-card');
        if (card && card.dataset.section) showSection(card.dataset.section);
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
