/**
 * ALP - VPS Dashboard (v2)
 *
 * Gives admins live control over every VPS: reachability + CPU/RAM/disk
 * metrics, per-site actions (sync content, restart antibot, tail logs),
 * per-VPS actions (test SSH, restart nginx, disk usage, firewall), and
 * panel-VPS shortcuts (deploy, restart, tail pm2 logs).
 *
 * Uses the shared primitives: AlpStats, AlpLiveDot, AlpTerminal,
 * AlpConfirm, AlpEmpty, AlpCallout, AlpUtil.
 *
 * Backend: /api/vps-dashboard/metrics + /action + streams via /api/deploy/stream.
 */
const VpsPage = (() => {
  const esc = window.AlpUtil.escapeHtml;
  const timeAgo = window.AlpUtil.timeAgo;

  let _metrics = { vps: [] };
  let _websites = [];
  let _panelVpsInfo = null;
  let _domains = [];
  let _destroyed = false;
  let _pollTimer = null;
  let _healthStream = null;
  let _actionTermEl = null;
  let _abort = null;

  const POLL_MS = 30_000;

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    return `
      <div class="vps2-root" style="max-width:1280px;margin:0 auto;">
        <div class="vps2-header">
          <div>
            <div class="ph" style="--ph-accent:#06b6d4;--ph-glow:rgba(6,182,212,0.5)">
              <div class="ph-eyebrow"><span class="ph-eyebrow-dot"></span>SERVERS · INFRASTRUCTURE</div>
              <h1 class="ph-title"><span class="ph-title-glyph">⛃</span><span class="ph-title-text">Server Control</span></h1>
              <p class="ph-sub">Live metrics + admin actions across every configured server</p>
            </div>
          </div>
          <div class="vps2-header-actions">
            <span id="vps2-last-updated" class="vps2-last-updated"></span>
            <button id="vps2-refresh-btn" class="btn btn-secondary vps2-btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
            <div class="vps2-add-wrap" style="position:relative;">
              <button id="vps2-add-btn" class="btn btn-primary vps2-btn-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add VPS
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:2px;"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="vps2-add-menu" class="vps2-add-menu">
                <button type="button" data-add-target="panel" class="vps2-add-item">
                  <span class="vps2-add-ico">🎛</span>
                  <div>
                    <div class="vps2-add-title">Panel VPS</div>
                    <div class="vps2-add-sub">The server hosting the admin panel itself</div>
                    <div class="vps2-add-note">god only</div>
                  </div>
                </button>
                <button type="button" data-add-target="website" class="vps2-add-item">
                  <span class="vps2-add-ico">🕸</span>
                  <div>
                    <div class="vps2-add-title">Website VPS</div>
                    <div class="vps2-add-sub">Attach a server to one of your websites</div>
                    <div class="vps2-add-note">Configures SSH + optional public domain</div>
                  </div>
                </button>
                <button type="button" data-add-target="standalone" class="vps2-add-item">
                  <span class="vps2-add-ico">📦</span>
                  <div>
                    <div class="vps2-add-title">Standalone VPS</div>
                    <div class="vps2-add-sub">Add an unattached backup server</div>
                    <div class="vps2-add-note">Link to websites later</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="vps2-stats"></div>
        <div id="vps2-cards"></div>

        <!-- terminal is now rendered as a modal overlay -->
      </div>

      <style>
        .vps2-term-modal-overlay {
          position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);
          z-index:var(--z-modal, 600);display:flex;align-items:center;justify-content:center;padding:20px;
        }
        [data-theme='light'] .vps2-term-modal-overlay,
        [data-theme='light'] .vps2-modal-overlay { background:rgba(15,23,42,.45); }
        .vps2-term-modal {
          width:100%;max-width:780px;max-height:85vh;max-height:85dvh;display:flex;flex-direction:column;
          background:linear-gradient(155deg,#0d1117,#080b12);
          border:1px solid rgba(20,184,166,.4);border-radius:16px;
          box-shadow:0 24px 80px rgba(0,0,0,.7),0 0 40px rgba(20,184,166,.15);
          overflow:hidden;animation:fadeUp .25s ease both;
        }
        .vps2-term-modal-header {
          display:flex;align-items:center;justify-content:space-between;
          padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.06);
          background:rgba(0,0,0,.3);
        }
        .vps2-term-modal-label {
          font-size:13px;font-weight:700;color:#D4AF37;
          font-family:'JetBrains Mono',ui-monospace,monospace;
        }
        .vps2-term-modal-close {
          background:none;border:0;color:#94a3b8;font-size:22px;line-height:1;
          cursor:pointer;padding:0 4px;transition:color .15s;
        }
        .vps2-term-modal-close:hover { color:#fff; }
        .vps2-term-modal-body { flex:1;min-height:0;overflow:hidden; }
        .vps2-term-modal-body .alp-term { border:0;border-radius:0; }
        .vps2-term-modal-body .alp-term-log { max-height:60dvh; }

        /* Token-driven modals & Add-VPS menu (Light + Dark safe, never clips comboboxes) */
        .vps2-add-menu {
          display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:var(--z-popover, 700);
          width:min(290px, calc(100vw - 24px));
          background:var(--bg-elevated);border:1px solid var(--border-primary);
          border-radius:12px;box-shadow:var(--shadow-xl);overflow:hidden;
        }
        .vps2-add-item {
          width:100%;text-align:left;display:flex;align-items:flex-start;gap:12px;
          padding:13px 15px;background:transparent;border:0;color:var(--text-primary);
          border-bottom:1px solid var(--border-subtle);cursor:pointer;font-family:inherit;
          transition:background .15s;
        }
        .vps2-add-item:last-child { border-bottom:0; }
        .vps2-add-item:hover { background:var(--bg-hover); }
        .vps2-add-ico { font-size:20px;line-height:1;flex-shrink:0; }
        .vps2-add-title { font-size:13px;font-weight:700;color:var(--accent-primary); }
        .vps2-add-sub { font-size:11px;color:var(--text-secondary);margin-top:2px; }
        .vps2-add-note { font-size:10px;color:var(--text-muted);margin-top:3px; }

        .vps2-modal-overlay {
          position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);
          z-index:var(--z-modal, 600);display:flex;align-items:center;justify-content:center;
          overflow-y:auto;padding:24px 16px;box-sizing:border-box;
        }
        .vps2-modal {
          background:var(--bg-elevated);border:1px solid var(--border-primary);
          border-radius:14px;max-width:520px;width:100%;max-height:90vh;max-height:90dvh;
          display:flex;flex-direction:column;box-shadow:var(--shadow-xl);color:var(--text-primary);
          margin:auto 0;
        }
        .vps2-modal--wide { max-width:780px; }
        .vps2-modal--danger { border-color:rgba(239,68,68,.4); }
        .vps2-modal-hdr {
          display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
          padding:16px 20px;border-bottom:1px solid var(--border-subtle);flex-shrink:0;
        }
        .vps2-modal-title { font-size:15px;font-weight:800;color:var(--text-primary); }
        .vps2-modal-sub { font-size:11px;color:var(--text-secondary);margin-top:2px; }
        .vps2-modal-close {
          background:var(--bg-tertiary);border:1px solid var(--border-primary);color:var(--text-secondary);
          font-size:18px;line-height:1;cursor:pointer;width:28px;height:28px;border-radius:6px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        }
        .vps2-modal-close:hover { background:var(--bg-hover);color:var(--text-primary); }
        .vps2-modal-body { padding:18px 20px;font-size:12.5px;color:var(--text-secondary);overflow-y:auto;flex:1;min-height:0; }
        .vps2-modal-err { display:none;margin:0 20px 12px;padding:10px 12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:var(--color-danger);font-size:12px; }
        .vps2-modal-ftr {
          display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;
          padding:14px 20px;border-top:1px solid var(--border-subtle);background:var(--bg-tertiary);
          border-radius:0 0 14px 14px;flex-shrink:0;
        }
        .vps2-modal-lbl { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-tertiary);margin-bottom:6px; }
        .vps2-modal-input {
          width:100%;box-sizing:border-box;background:var(--bg-input);border:1px solid var(--border-primary);
          border-radius:8px;padding:10px 12px;font-size:13px;color:var(--text-primary);font-family:inherit;outline:none;
        }
        .vps2-modal-input:focus { border-color:var(--accent-primary); }
        .vps2-form-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
        .vps2-auth-opt {
          flex:1;padding:8px 10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);
          border-radius:8px;font-size:12px;color:var(--text-primary);cursor:pointer;
        }
        .vps2-card-footer {
          padding:10px 18px;background:rgba(0,0,0,.1);border-top:1px solid rgba(255,255,255,.04);
          display:flex;gap:8px;flex-wrap:wrap;
        }
        [data-theme='light'] .vps2-card-footer { background:var(--bg-tertiary);border-top-color:var(--border-subtle); }
        [data-theme='light'] .vps2-card--idle {
          background:var(--bg-secondary);border-color:var(--border-primary);box-shadow:var(--shadow-sm);
        }
        [data-theme='light'] .vps2-badge--idle {
          background:var(--bg-tertiary);color:var(--text-secondary);border-color:var(--border-primary);
        }
        .vps2-metrics .alp-callout { grid-column: 1 / -1; }

        .vps2-header { display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px; }
        .vps2-title { font-size:22px;font-weight:800;color:var(--text-primary);margin:0; }
        .vps2-subtitle { font-size:13px;color:var(--text-secondary);margin:4px 0 0; }
        .vps2-header-actions { display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
        .vps2-last-updated { font-size:11px;color:var(--text-muted); }
        .vps2-btn-sm { font-size:12px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px; }

        .vps2-panel-section { margin-bottom: 22px; }

        .vps2-grid {
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));
          gap:18px;
        }
        @media (max-width: 720px) {
          .vps2-grid { grid-template-columns: 1fr; gap: 14px; }
        }

        .vps2-card {
          position:relative;
          background:linear-gradient(160deg,rgba(18,22,32,.98),rgba(11,14,22,.99));
          border:1px solid rgba(20,184,166,.42);
          border-radius:16px;
          overflow:hidden;
          animation:fadeUp .35s ease both;
          transition:transform .22s cubic-bezier(.25,.8,.25,1),box-shadow .22s,border-color .22s;
          box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 18px rgba(20,184,166,.22);
        }
        .vps2-card:hover {
          transform:translateY(-3px);
          border-color:rgba(20,184,166,.75);
          box-shadow:0 12px 36px rgba(0,0,0,.5),0 0 30px rgba(20,184,166,.4);
        }
        .vps2-card::before {
          content:'';position:absolute;left:0;right:0;top:0;height:3px;
          background:linear-gradient(90deg,transparent,rgba(20,184,166,.9) 50%,transparent);
          pointer-events:none;z-index:2;
        }
        .vps2-card--panel {
          border-color:rgba(251,191,36,.5);
          box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 22px rgba(251,191,36,.28);
        }
        .vps2-card--panel::before { background:linear-gradient(90deg,transparent,rgba(251,191,36,.9) 50%,transparent); }
        .vps2-card--panel:hover {
          border-color:rgba(251,191,36,.85);
          box-shadow:0 12px 36px rgba(0,0,0,.5),0 0 36px rgba(251,191,36,.5);
        }
        .vps2-card--warn {
          border-color:rgba(245,158,11,.5);
          box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 22px rgba(245,158,11,.25);
        }
        .vps2-card--warn::before { background:linear-gradient(90deg,transparent,rgba(245,158,11,.9) 50%,transparent); }
        .vps2-card--down {
          border-color:rgba(239,68,68,.55);
          background:linear-gradient(160deg,rgba(40,10,15,.98),rgba(20,5,8,.99));
          box-shadow:0 4px 20px rgba(0,0,0,.5),0 0 25px rgba(239,68,68,.3);
        }
        .vps2-card--down::before { background:linear-gradient(90deg,transparent,rgba(239,68,68,.85) 50%,transparent); }
        .vps2-card--down:hover {
          border-color:rgba(239,68,68,.9);
          box-shadow:0 12px 36px rgba(0,0,0,.6),0 0 40px rgba(239,68,68,.5);
        }
        .vps2-card--idle {
          border-color:rgba(148,163,184,.35);
          background:linear-gradient(160deg,rgba(30,32,42,.98),rgba(18,20,28,.99));
          box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 18px rgba(148,163,184,.12);
        }
        .vps2-card--idle::before { background:linear-gradient(90deg,transparent,rgba(148,163,184,.5) 50%,transparent); }
        .vps2-card--idle:hover {
          border-color:rgba(148,163,184,.65);
          box-shadow:0 12px 36px rgba(0,0,0,.45),0 0 30px rgba(148,163,184,.25);
        }
        .vps2-card--idle .vps2-card-icon { background:rgba(148,163,184,.1);border-color:rgba(148,163,184,.25); }
        .vps2-badge--idle { background:rgba(148,163,184,.12);color:#94a3b8;border:1px solid rgba(148,163,184,.25); }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }

        .vps2-card-hdr {
          padding:16px 18px;
          border-bottom:1px solid rgba(255,255,255,.06);
          display:flex;align-items:center;gap:14px;flex-wrap:wrap;
          min-width:0;
        }
        .vps2-card-hdr > div:nth-child(2) { min-width:0; word-break:break-word; }
        .vps2-card-remove-btn {
          margin-left:auto;flex-shrink:0;background:transparent;color:#f87171;
          border:1px solid rgba(239,68,68,.28);border-radius:7px;
          padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;
          display:inline-flex;align-items:center;gap:5px;font-family:inherit;
          transition:background .12s,color .12s;
        }
        .vps2-card-remove-btn:hover { background:rgba(239,68,68,.14);color:#fca5a5; }
        .vps2-card--panel .vps2-card-hdr { background:linear-gradient(135deg,rgba(251,191,36,.06),rgba(234,179,8,.04)); }
        .vps2-card-hdr:not(.vps2-card--panel-hdr) { background:linear-gradient(135deg,rgba(20,184,166,.06),rgba(59,130,246,.04)); }

        .vps2-card-icon {
          width:42px;height:42px;border-radius:11px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
          background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.25);
        }
        .vps2-card--panel .vps2-card-icon { background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.25); }
        .vps2-card--down .vps2-card-icon  { background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.35); }

        .vps2-card-title-row { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
        .vps2-card-host { font-size:15px;font-weight:800;color:#f1f5f9;font-family:var(--font-mono);letter-spacing:-.02em; }
        .vps2-card-meta { font-size:11px;color:#94a3b8;margin-top:2px; }
        .vps2-badge {
          display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
          border-radius:6px;font-size:9px;font-weight:700;
          text-transform:uppercase;letter-spacing:.5px;
        }
        .vps2-badge--panel   { background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.25); }
        .vps2-badge--down    { background:rgba(239,68,68,.12); color:#f87171;border:1px solid rgba(239,68,68,.35); }
        .vps2-badge--up      { background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.25); }
        .vps2-badge--warn    { background:rgba(245,158,11,.12);color:#fbbf24;border:1px solid rgba(245,158,11,.25); }
        .vps2-badge--muted   { background:rgba(107,114,128,.15);color:#9ca3af;border:1px solid rgba(107,114,128,.25); }
        .vps2-badge--provider{ background:rgba(129,140,248,.12);color:#a5b4fc;border:1px solid rgba(129,140,248,.28);cursor:help; }

        .vps2-metrics {
          display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));
          gap:8px;padding:12px 14px;background:rgba(0,0,0,.18);
          border-bottom:1px solid rgba(255,255,255,.04);
        }
        @media (max-width: 520px) {
          .vps2-metrics { grid-template-columns:repeat(2,1fr); }
        }
        .vps2-metric {
          display:flex;flex-direction:column;padding:8px 10px;
          background:rgba(255,255,255,.02);border-radius:8px;
        }
        .vps2-metric-lbl { font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px; }
        .vps2-metric-val { font-size:15px;font-weight:800;color:#e2e8f0;margin-top:2px; }
        .vps2-metric-bar { height:3px;border-radius:2px;background:rgba(255,255,255,.06);margin-top:6px;overflow:hidden; }
        .vps2-metric-bar-fill { height:100%;transition:width .3s ease; }

        .vps2-card-actions {
          display:flex;gap:6px;padding:10px 18px;flex-wrap:wrap;
          background:rgba(0,0,0,.1);border-bottom:1px solid rgba(255,255,255,.04);
        }
        .vps2-act-btn {
          font-size:11px;padding:5px 11px;border-radius:7px;border:1px solid rgba(255,255,255,.1);
          background:rgba(255,255,255,.04);color:var(--text-primary);cursor:pointer;
          transition:background .12s;font-family:inherit;
          display:inline-flex;align-items:center;gap:5px;font-weight:600;
        }
        .vps2-act-btn:hover { background:rgba(255,255,255,.09); }
        .vps2-act-btn.danger  { color:#f87171;border-color:rgba(239,68,68,.22); }
        .vps2-act-btn.danger:hover  { background:rgba(239,68,68,.1); }
        .vps2-act-btn.primary { color:#D4AF37;border-color:rgba(212,175,55,.3); }
        .vps2-act-btn.primary:hover { background:rgba(212,175,55,.12); }
        .vps2-act-btn.warning { color:#fbbf24;border-color:rgba(245,158,11,.28); }
        .vps2-act-btn.warning:hover { background:rgba(245,158,11,.1); }
        .vps2-act-btn:disabled { opacity:.5;cursor:not-allowed; }

        .vps2-sites-tbl-wrap { width:100%; }
        .vps2-sites-tbl { width:100%;border-collapse:collapse;table-layout:fixed; }
        .vps2-sites-tbl th {
          text-align:left;padding:8px 10px;font-size:9px;font-weight:700;
          text-transform:uppercase;letter-spacing:.8px;color:#64748b;
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .vps2-sites-tbl td {
          padding:10px;border-bottom:1px solid rgba(255,255,255,.04);
          font-size:12px;color:#e2e8f0;vertical-align:middle;
          word-break:break-word;overflow-wrap:anywhere;
        }
        .vps2-sites-tbl tr:hover td { background:rgba(255,255,255,.02); }
        .vps2-sites-tbl tr:last-child td { border-bottom:0; }

        /* Actions dropdown — a compact "⋯ Actions" pill that expands a floating
           panel with all 4 site actions. Native <details> so no extra JS. */
        .vps2-site-menu { position:relative; }
        .vps2-site-menu > summary {
          list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:4px;
          padding:5px 10px;background:rgba(255,255,255,.04);color:#cbd5e1;
          border:1px solid rgba(255,255,255,.08);border-radius:6px;
          font-size:11px;font-weight:600;font-family:inherit;transition:background .15s;
          user-select:none;
        }
        .vps2-site-menu > summary::-webkit-details-marker { display:none; }
        .vps2-site-menu > summary:hover { background:rgba(255,255,255,.09); }
        .vps2-site-menu[open] > summary {
          background:rgba(20,184,166,.14);border-color:rgba(20,184,166,.4);color:#5eead4;
        }
        .vps2-site-menu-panel {
          position:absolute;right:0;top:calc(100% + 4px);z-index:100;
          min-width:170px;padding:6px;display:flex;flex-direction:column;gap:4px;
          background:linear-gradient(155deg,rgba(18,18,28,.98),rgba(10,10,18,.98));
          border:1px solid rgba(20,184,166,.35);border-radius:10px;
          box-shadow:0 12px 30px rgba(0,0,0,.6),0 0 20px rgba(20,184,166,.15);
        }
        .vps2-site-menu-panel .vps2-act-btn {
          width:100%;justify-content:flex-start;text-align:left;font-size:11px;
        }

        /* Narrow cards / phones — stack each row as a compact mini-card. */
        @media (max-width: 780px) {
          .vps2-sites-tbl,
          .vps2-sites-tbl tbody,
          .vps2-sites-tbl tr,
          .vps2-sites-tbl td { display:block;width:100%; }
          .vps2-sites-tbl thead { display:none; }
          .vps2-sites-tbl tr {
            padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);
            position:relative;
          }
          .vps2-sites-tbl tr:last-child { border-bottom:0; }
          .vps2-sites-tbl td {
            padding:2px 0;border-bottom:0;font-size:12px;
          }
          .vps2-sites-tbl td[data-lbl]:not([data-lbl=""])::before {
            content:attr(data-lbl) ": ";display:inline;
            font-size:10px;font-weight:700;color:#64748b;
            text-transform:uppercase;letter-spacing:.5px;margin-right:4px;
          }
          /* Actions dropdown floats to the top-right of the stacked card */
          .vps2-sites-tbl td:has(.vps2-site-menu) {
            position:absolute;top:8px;right:10px;width:auto;padding:0;
          }
        }

        .vps2-site-actions { display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end; }
        .vps2-card-actions { min-width:0; }
        .vps2-act-btn { max-width:100%; }

        @media (max-width: 640px) {
          .vps2-modal-overlay, .vps2-term-modal-overlay { padding: 12px; }
          .vps2-act-btn { min-height: 36px; padding: 7px 12px; font-size: 11.5px; }
          .vps2-sites-tbl td[data-lbl="Move"] { text-align: left !important; }
          .vps2-add-menu { left: 0; right: auto; }
        }
        @media (max-width: 480px) {
          .vps2-form-grid { grid-template-columns: 1fr; }
          .vps2-modal-hdr, .vps2-modal-body, .vps2-modal-ftr { padding-left: 14px; padding-right: 14px; }
          .vps2-modal-input { font-size: 16px; }
        }
      </style>
    `;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    _destroyed = false;
    if (_abort) { try { _abort.abort(); } catch (_) {} }
    _abort = new AbortController();
    const signal = _abort.signal;

    document.getElementById('vps2-refresh-btn')?.addEventListener('click', () => loadMetrics({ fresh: true }), { signal });

    const addBtn  = document.getElementById('vps2-add-btn');
    const addMenu = document.getElementById('vps2-add-menu');
    const isGod   = !!(window.ALPAuth && window.ALPAuth.isGod && window.ALPAuth.isGod());

    if (addBtn && addMenu) {
      if (!isGod) {
        const panelItem = addMenu.querySelector('[data-add-target="panel"]');
        if (panelItem) panelItem.remove();
      }
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMenu.style.display = (addMenu.style.display === 'block') ? 'none' : 'block';
      }, { signal });
      document.addEventListener('click', (e) => {
        if (!addMenu.contains(e.target) && !addBtn.contains(e.target)) addMenu.style.display = 'none';
      }, { signal });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') addMenu.style.display = 'none';
      }, { signal });
      addMenu.querySelectorAll('.vps2-add-item').forEach(item => {
        item.addEventListener('click', () => {
          const target = item.getAttribute('data-add-target');
          addMenu.style.display = 'none';
          if (target === 'panel')     _openPanelVpsModal();
          if (target === 'website')   _openWebsiteVpsModal();
          if (target === 'standalone') _openStandaloneVpsModal();
        }, { signal });
      });
    }

    // Delegated action-button handler
    document.getElementById('vps2-cards').addEventListener('click', onActionClick, { signal });

    await loadContext();      // list of sites + domains for name lookup
    await loadMetrics();
    startPolling();
  }

  function destroy() {
    _destroyed = true;
    stopPolling();
    if (_abort) { try { _abort.abort(); } catch (_) {} _abort = null; }
    if (_healthStream) { try { _healthStream.close(); } catch (_) {} _healthStream = null; }
  }

  function startPolling() {
    stopPolling();
    _pollTimer = setInterval(() => { if (!_destroyed) loadMetrics(); }, POLL_MS);
  }
  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadContext() {
    try {
      const [vpsList, domResp] = await Promise.all([
        window.ALPApi._request('GET', '/api/website-deploy/vps-list'),
        window.ALPApi._request('GET', '/api/domains'),
      ]);
      if (Array.isArray(vpsList)) {
        _websites = vpsList; _panelVpsInfo = null;
      } else {
        _websites = Array.isArray(vpsList?.websites) ? vpsList.websites : [];
        _panelVpsInfo = vpsList?.panel_vps || null;
      }
      _domains = (domResp && domResp.domains) ? domResp.domains : [];
    } catch (e) {
      window.showToast('Failed to load VPS context: ' + e.message, 'error');
    }
  }

  async function loadMetrics(opts = {}) {
    try {
      const q = opts.fresh ? '?fresh=1' : '';
      const resp = await window.ALPApi._request('GET', '/api/vps-dashboard/metrics' + q);
      if (_destroyed) return;
      _metrics = resp || { vps: [] };
      renderStats();
      renderCards();
      const el = document.getElementById('vps2-last-updated');
      if (el) el.textContent = resp.cached
        ? `cached ${Math.round((resp.age_ms || 0) / 1000)}s ago`
        : `updated ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      if (!_destroyed) window.showToast('Metrics probe failed: ' + e.message, 'error');
    }
  }

  // ── Renders ──────────────────────────────────────────────────────────────

  function renderStats() {
    const el = document.getElementById('vps2-stats');
    if (!el) return;
    const vps = _metrics.vps || [];
    const totalHosts = vps.length;
    const reachable = vps.filter(v => v.reachable).length;
    const nginxUp = vps.filter(v => v.nginx_active).length;
    const totalSites = vps.reduce((n, v) => n + (v.sites?.length || 0), 0);
    const activeSidecars = vps.reduce((n, v) => n + (v.sites || []).filter(s => s.antibot_active).length, 0);
    const liveDomains = _domains.filter(d => d.status === 'live').length;
    const flagged     = _domains.filter(d => d.flagged).length;

    el.innerHTML = window.AlpStats.render([
      { icon: '🖥',  value: `${reachable}/${totalHosts}`, label: 'VPS Reachable', color: reachable === totalHosts ? '#10b981' : '#f59e0b' },
      { icon: '🌐', value: liveDomains,                   label: 'Live Domains',  color: '#3b82f6' },
      { icon: '🛡',  value: `${activeSidecars}/${totalSites}`, label: 'Antibot Active', color: '#14b8a6' },
      { icon: '⚙',  value: nginxUp,                       label: 'nginx Running', color: '#818cf8' },
      { icon: '⚠',  value: flagged,                       label: 'Flagged Domains', color: flagged ? '#ef4444' : '#6b7280' },
    ], { minWidth: 140 });
  }

  function renderCards() {
    const el = document.getElementById('vps2-cards');
    if (!el) return;
    const vps = _metrics.vps || [];

    if (!vps.length) {
      el.innerHTML = window.AlpEmpty.render({
        title: 'No VPS configured',
        sub: 'Add a VPS by going to Websites → Host, or set the panel VPS in Settings → Panel Configuration.',
      });
      return;
    }

    // Split panel VPS out — it always renders full-width at the top.
    // Website VPSes go into the sorted grid below.
    const panels  = vps.filter(v => v.is_panel);
    const others  = vps.filter(v => !v.is_panel);

    // Sort website VPSes: healthy (green) → warning (amber) → down (red)
    const rankOf = (v) => {
      if (!v.reachable) return 2;
      const disk = v.disk_percent;
      const highLoad = disk != null && disk >= 85;
      if (v.nginx_active === false || highLoad) return 1;
      return 0;
    };
    others.sort((a, b) => {
      const ra = rankOf(a), rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      return String(a.host).localeCompare(String(b.host));
    });

    const panelSection = panels.length
      ? `<div class="vps2-panel-section">${panels.map(renderCard).join('')}</div>`
      : '';
    const gridSection = others.length
      ? `<div class="vps2-grid">${others.map(renderCard).join('')}</div>`
      : '';
    el.innerHTML = panelSection + gridSection;
  }

  function renderCard(v) {
    const isDown = !v.reachable;
    const isWarn = !isDown && (v.nginx_active === false || (v.disk_percent != null && v.disk_percent >= 85));
    const isIdle = !v.is_panel && (!v.sites || !v.sites.length);
    const cls = [
      'vps2-card',
      v.is_panel ? 'vps2-card--panel' : '',
      isIdle ? 'vps2-card--idle' : '',
      isDown ? 'vps2-card--down' : (isWarn ? 'vps2-card--warn' : ''),
    ].filter(Boolean).join(' ');
    const badges = [];
    if (v.is_panel) badges.push('<span class="vps2-badge vps2-badge--panel">PANEL</span>');
    if (isIdle) badges.push('<span class="vps2-badge vps2-badge--idle">UNATTACHED</span>');
    if (isDown)     badges.push(`<span class="vps2-badge vps2-badge--down">UNREACHABLE</span>`);
    else if (v.stale) badges.push(`<span class="vps2-badge vps2-badge--warn" title="Last probe failed — retrying">${window.AlpLiveDot.render({ status: 'warning', size: 6 })} CHECKING…</span>`);
    else            badges.push(`<span class="vps2-badge vps2-badge--up">${window.AlpLiveDot.render({ status: 'online', size: 6 })} UP</span>`);
    if (v.nginx_active === false) badges.push('<span class="vps2-badge vps2-badge--warn">nginx down</span>');
    // Provider fingerprint. From DMI first, then reverse-DNS as fallback.
    // Muted styling for generic hypervisor tags so the operator can see the
    // reading is soft.
    if (v.provider) {
      const generic = /^(QEMU|KVM|Xen|Bochs|Hyper-V)$/i.test(v.provider);
      const r = v.provider_raw || {};
      const bits = [];
      if (r.sys_vendor)  bits.push(`sys_vendor: ${r.sys_vendor}`);
      if (r.bios_vendor) bits.push(`bios_vendor: ${r.bios_vendor}`);
      if (r.product_name) bits.push(`product: ${r.product_name}`);
      if (r.ptr)         bits.push(`ptr: ${r.ptr}`);
      if (r.ptr_note)    bits.push(r.ptr_note);
      const title = bits.length ? bits.join('\n') : v.provider;
      badges.push(`<span class="vps2-badge vps2-badge--${generic ? 'muted' : 'provider'}" title="${esc(title)}">${esc(v.provider)}</span>`);
    }

    // Metrics grid
    const metrics = isDown ? `
      <div class="vps2-metrics">
        ${window.AlpCallout.render({ variant: 'danger', title: 'Server unreachable', body: v.error || 'SSH connection failed. Check credentials, host, and firewall.' })}
      </div>` : `
      <div class="vps2-metrics">
        ${metricTile('CPU',   v.cpu_percent  != null ? v.cpu_percent  + '%' : '—', barPct(v.cpu_percent))}
        ${metricTile('RAM',   v.mem_percent  != null ? v.mem_percent  + '%' : '—', barPct(v.mem_percent))}
        ${metricTile('DISK',  v.disk_percent != null ? v.disk_percent + '%' : '—', barPct(v.disk_percent), v.disk_available ? v.disk_available + ' free' : '')}
        ${metricTile('LOAD',  v.load ? v.load[0].toFixed(2) : '—', null, v.load ? v.load.slice(1).map(x => x.toFixed(2)).join(' / ') : '')}
        ${metricTile('UPTIME', v.uptime || '—')}
        ${v.nginx_conn != null ? metricTile('NGX CONN', v.nginx_conn) : ''}
        ${v.is_panel && v.panel ? metricTile('PM2 MEM', v.panel.pm2_mem_mb != null ? v.panel.pm2_mem_mb + ' MB' : '—', null, v.panel.pm2_restarts != null ? '↻ ' + v.panel.pm2_restarts + ' restarts' : '') : ''}
      </div>`;

    // Site rows
    const siteRows = renderSiteRows(v);

    // Action rows
    const vpsActions = renderVpsActions(v, isDown);
    const panelActions = v.is_panel ? renderPanelActions(v, isDown) : '';

    return `
      <div class="${cls}" data-host="${esc(v.host)}">
        <div class="vps2-card-hdr">
          <div class="vps2-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${v.is_panel ? '#fbbf24' : isIdle ? '#94a3b8' : '#14b8a6'}" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
              <circle cx="6" cy="6" r="1.5" fill="${v.is_panel ? '#fbbf24' : isIdle ? '#94a3b8' : '#14b8a6'}"/><circle cx="6" cy="18" r="1.5" fill="${v.is_panel ? '#fbbf24' : isIdle ? '#94a3b8' : '#14b8a6'}"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div class="vps2-card-title-row">
              <span class="vps2-card-host">${esc(v.host)}</span>
              ${badges.join(' ')}
            </div>
            <div class="vps2-card-meta">
              probed in ${v.probed_ms}ms
              ${v.sites?.length ? ` · ${v.sites.length} site${v.sites.length !== 1 ? 's' : ''}` : ''}
              ${v.label ? ` · ${esc(v.label)}` : ''}
            </div>
          </div>
          <button class="vps2-card-remove-btn" data-remove-host="${esc(v.host)}" data-is-panel="${v.is_panel ? '1' : '0'}" title="Detach this VPS from the panel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Remove
          </button>
        </div>
        ${metrics}
        ${vpsActions}
        ${panelActions}
        ${siteRows}
      </div>`;
  }

  function metricTile(label, value, barPct, sub) {
    const bar = barPct != null
      ? `<div class="vps2-metric-bar"><div class="vps2-metric-bar-fill" style="width:${barPct}%;background:${barColor(barPct)};"></div></div>`
      : '';
    const s = sub ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${esc(sub)}</div>` : '';
    return `<div class="vps2-metric">
      <span class="vps2-metric-lbl">${esc(label)}</span>
      <span class="vps2-metric-val">${esc(value)}</span>
      ${bar}${s}
    </div>`;
  }
  function barPct(n) {
    if (n == null || isNaN(n)) return null;
    return Math.max(0, Math.min(100, n));
  }
  function barColor(pct) {
    if (pct >= 85) return '#ef4444';
    if (pct >= 70) return '#f59e0b';
    return '#10b981';
  }

  function renderVpsActions(v, isDown) {
    const isGod = !!(window.ALPAuth && window.ALPAuth.isGod && window.ALPAuth.isGod());
    return `
      <div class="vps2-card-actions">
        <span style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;padding:4px 6px 4px 0;">Server:</span>
        <button class="vps2-act-btn" data-vps-action="test-ssh"      data-host="${esc(v.host)}">🔌 Test SSH</button>
        <button class="vps2-act-btn" data-vps-action="nginx-status"  data-host="${esc(v.host)}">⚙ nginx status</button>
        <button class="vps2-act-btn warning" data-vps-action="nginx-reload" data-host="${esc(v.host)}" ${isDown ? 'disabled' : ''}>↻ nginx reload</button>
        <button class="vps2-act-btn danger"  data-vps-action="restart-nginx" data-host="${esc(v.host)}" ${isDown ? 'disabled' : ''} data-confirm="restart nginx on ${esc(v.host)}">⚠ restart nginx</button>
        <button class="vps2-act-btn" data-vps-action="disk-usage"    data-host="${esc(v.host)}" ${isDown ? 'disabled' : ''}>💾 disk</button>
        <button class="vps2-act-btn" data-vps-action="firewall"      data-host="${esc(v.host)}" ${isDown ? 'disabled' : ''}>🛡 firewall</button>
      </div>`;
  }

  function renderPanelActions(v, isDown) {
    const pm2 = v.panel || {};
    const uptimeStr = pm2.pm2_uptime_ms ? humanDuration(pm2.pm2_uptime_ms) : '—';
    return `
      <div class="vps2-card-actions">
        <span style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;padding:4px 6px 4px 0;">Panel:</span>
        <span class="vps2-badge vps2-badge--${pm2.pm2_status === 'online' ? 'up' : 'warn'}" title="pm2 process ${esc(pm2.pm2_name || 'alp')}">
          pm2 ${esc(pm2.pm2_status || '—')} · up ${esc(uptimeStr)}
        </span>
        <button class="vps2-act-btn primary" data-panel-action="deploy" ${isDown ? 'disabled' : ''}>🚀 Deploy Now</button>
        <button class="vps2-act-btn" data-panel-action="tail-pm2" ${isDown ? 'disabled' : ''}>📜 pm2 logs</button>
        <button class="vps2-act-btn" data-panel-action="pm2-status" ${isDown ? 'disabled' : ''}>ℹ pm2 status</button>
        <button class="vps2-act-btn danger" data-panel-action="restart-panel" ${isDown ? 'disabled' : ''} data-confirm="restart the panel (pm2 restart ${esc(pm2.pm2_name || 'alp')})">⚠ restart panel</button>
      </div>`;
  }

  function renderSiteRows(v) {
    const count = v.sites?.length || 0;
    const sitesBtn = count
      ? `<button class="vps2-act-btn" data-show-sites="${esc(v.host)}" style="flex:1;justify-content:center;gap:8px;padding:8px 14px;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
           ${count} Website${count !== 1 ? 's' : ''}
         </button>`
      : '';
    const deployBtn = v.is_panel ? '' : `
        <button class="vps2-act-btn primary" data-deploy-to-vps="${esc(v.host)}" style="${count ? '' : 'flex:1;'}justify-content:center;gap:8px;padding:8px 14px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
          Deploy Website
        </button>`;
    if (!sitesBtn && !deployBtn) return '';
    return `
      <div class="vps2-card-footer">
        ${sitesBtn}${deployBtn}
      </div>`;
  }

  function _openSitesModal(host) {
    const v = (_metrics.vps || []).find(x => x.host === host);
    if (!v || !v.sites || !v.sites.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'vps2-modal-overlay';
    overlay.innerHTML = `
      <div class="vps2-modal vps2-modal--wide">
        <div class="vps2-modal-hdr">
          <div>
            <div class="vps2-modal-title">Websites on ${esc(host)}</div>
            <div class="vps2-modal-sub">${v.sites.length} website${v.sites.length !== 1 ? 's' : ''} attached</div>
          </div>
          <button type="button" class="vps2-modal-close vps2-sites-modal-close" aria-label="Close">×</button>
        </div>
        <div class="vps2-modal-body" style="padding:0;">
          <table class="vps2-sites-tbl">
            <thead>
              <tr>
                <th>Website</th>
                <th>Antibot</th>
                <th>Domains</th>
                <th style="text-align:center;white-space:nowrap;">Move</th>
                <th style="text-align:right;width:110px;"></th>
              </tr>
            </thead>
            <tbody>
              ${v.sites.map(s => {
                const w = _websites.find(x => x.id === s.id);
                const domains = _domains.filter(d => d.website_id === s.id && d.hosting_provider === 'vps');
                const abBadge = s.antibot_active
                  ? `<span class="vps2-badge vps2-badge--up">${window.AlpLiveDot.render({ status: 'online', size: 5 })} running</span>`
                  : `<span class="vps2-badge vps2-badge--muted">stopped</span>`;
                const domainChips = domains.length
                  ? domains.map(d => {
                      const isLive = d.status === 'live';
                      const dot = window.AlpLiveDot.render({ status: d.flagged ? 'danger' : (isLive ? 'online' : 'offline'), size: 5 });
                      return `<a href="https://${esc(d.domain)}" target="_blank" rel="noopener" class="vps2-badge ${d.flagged ? 'vps2-badge--down' : (isLive ? 'vps2-badge--up' : 'vps2-badge--muted')}" style="text-decoration:none;">${dot} ${esc(d.domain)}</a>`;
                    }).join(' ')
                  : '<span style="font-size:10px;color:#475569;font-style:italic;">none</span>';
                return `
                  <tr>
                    <td data-lbl="Website" style="font-weight:700;">
                      ${esc(s.name || w?.name || s.slug)}
                      <div style="font-family:var(--font-mono);font-size:10px;color:#818cf8;font-weight:500;margin-top:2px;">${esc(s.slug || '—')}</div>
                    </td>
                    <td data-lbl="Antibot">${abBadge}</td>
                    <td data-lbl="Domains">${domainChips}</td>
                    <td data-lbl="Move" style="text-align:center;">
                      <button class="vps2-act-btn" data-move-site="${s.id}" data-site-name="${esc(s.name || s.slug)}" data-current-host="${esc(host)}" style="border-color:rgba(129,140,248,.3);color:#a5b4fc;white-space:nowrap;">↗ Move to VPS</button>
                    </td>
                    <td data-lbl="">
                      <details class="vps2-site-menu">
                        <summary class="vps2-site-menu-btn">⋯ Actions</summary>
                        <div class="vps2-site-menu-panel">
                          <button class="vps2-act-btn primary" data-site-action="sync-content"    data-wid="${s.id}" title="Push local xPages/${esc(s.slug)}/ to /var/www/${esc(s.slug)}">⬆ Sync content</button>
                          <button class="vps2-act-btn"         data-site-action="tail-antibot"    data-wid="${s.id}" title="Last 100 lines of antibot kill log">📜 Kill log</button>
                          <button class="vps2-act-btn"         data-site-action="antibot-status"  data-wid="${s.id}">ℹ Status</button>
                          <button class="vps2-act-btn warning" data-site-action="restart-antibot" data-wid="${s.id}" data-confirm="restart antibot sidecar for ${esc(s.slug)}">↻ Restart</button>
                          <button class="vps2-act-btn danger" data-detach-site="${s.id}" data-detach-name="${esc(s.name || s.slug)}" data-detach-host="${esc(host)}">✕ Remove from VPS</button>
                        </div>
                      </details>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.querySelector('.vps2-sites-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    // Wire up action buttons inside the modal
    overlay.addEventListener('click', (e) => {
      const moveBtn = e.target.closest('button[data-move-site]');
      if (moveBtn) {
        e.preventDefault();
        e.stopPropagation();
        close();
        _openMoveModal(moveBtn.dataset.moveSite, moveBtn.dataset.siteName, moveBtn.dataset.currentHost);
        return;
      }
      const detachBtn = e.target.closest('button[data-detach-site]');
      if (detachBtn) {
        e.preventDefault();
        e.stopPropagation();
        _confirmDetachSite(detachBtn.dataset.detachSite, detachBtn.dataset.detachName, detachBtn.dataset.detachHost, close);
        return;
      }
      const btn = e.target.closest('button[data-site-action]');
      if (btn) onActionClick(e);
    });
  }

  async function _confirmDetachSite(websiteId, siteName, host, closeParent) {
    const ok = await window.AlpConfirm.danger({
      title: 'Remove website from VPS',
      body:  `Remove <strong>${esc(siteName)}</strong> from <strong>${esc(host)}</strong>?<br><span style="color:#94a3b8;font-size:12px;">The website files on the remote server will not be deleted.</span>`,
      confirmLabel: 'Remove from VPS',
    });
    if (!ok) return;
    try {
      await window.ALPApi._request('POST', '/api/vps-dashboard/detach-site', { website_id: websiteId });
      window.showToast(`${siteName} removed from ${host}`, 'success');
      if (closeParent) closeParent();
      await loadContext();
      await loadMetrics({ fresh: true });
    } catch (e) {
      window.showToast('Detach failed: ' + e.message, 'error');
    }
  }

  // ── Deploy Website to VPS modal ──────────────────────────────────────────

  async function _openDeployToVpsModal(host) {
    const v = (_metrics.vps || []).find(x => x.host === host);
    if (!v) return;

    const vpsId = v.vps_id;
    if (!vpsId) { window.showToast('Could not find VPS registry id', 'error'); return; }

    // Fetch all websites — only show ones with NO VPS assigned (first-time deploy)
    let allSites = [];
    try {
      const resp = await window.ALPApi._request('GET', '/api/websites');
      allSites = Array.isArray(resp) ? resp : (resp?.websites || []);
    } catch (e) {
      window.showToast('Failed to load websites: ' + e.message, 'error');
      return;
    }
    const available = allSites.filter(w => !w.vps_host && !w.vps_id);

    let _selectedWebsiteId = '';

    const overlay = document.createElement('div');
    overlay.className = 'vps2-modal-overlay';

    overlay.innerHTML = `
      <div class="vps2-modal" style="max-width:480px;">
        <div class="vps2-modal-hdr">
          <div>
            <div class="vps2-modal-title" style="color:var(--accent-primary);">Deploy Website to VPS</div>
            <div class="vps2-modal-sub">${esc(host)}</div>
          </div>
          <button type="button" id="dv-close" class="vps2-modal-close" aria-label="Close">×</button>
        </div>
        <div class="vps2-modal-body">
          <div class="vps2-modal-lbl">Select website</div>
          <div id="dv-website-container"></div>
          <input type="hidden" id="dv-website-hidden" value="" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">Full deploy: files, antibot, nginx, SSL, and DNS.</div>
          <div id="dv-err" class="vps2-modal-err" style="margin:12px 0 0;"></div>
        </div>
        <div class="vps2-modal-ftr">
          <button type="button" id="dv-cancel" class="btn btn-secondary">Cancel</button>
          <button type="button" id="dv-go" class="btn btn-primary">Deploy</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Mount the shared website-select component
    if (window.ALPWebsiteSelect) {
      window.ALPWebsiteSelect.create({
        containerId: 'dv-website-container',
        hiddenInputId: 'dv-website-hidden',
        websites: available,
        placeholder: 'Select website…',
        fullWidth: true,
        fixedBelow: true,
        onChange: (val) => { _selectedWebsiteId = val; },
      });
    }

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.querySelector('#dv-close').addEventListener('click', close);
    overlay.querySelector('#dv-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    overlay.querySelector('#dv-go').addEventListener('click', async () => {
      const websiteId = _selectedWebsiteId || overlay.querySelector('#dv-website-hidden')?.value || '';
      if (!websiteId) {
        const errEl = overlay.querySelector('#dv-err');
        errEl.textContent = 'Pick a website';
        errEl.style.display = 'block';
        return;
      }
      const site = available.find(w => String(w.id) === String(websiteId));
      const siteName = site?.name || '';

      try {
        close();
        const resp = await window.ALPApi._request('POST', '/api/vps-dashboard/move-site', {
          website_id: Number(websiteId),
          target_vps_id: Number(vpsId),
        });
        if (resp.session_id) {
          openTerminalStream(resp.session_id, `Deploying ${siteName} → ${host}`);
          if (window.showToast) window.showToast(`Deploying ${siteName} to ${host} — watch terminal`, 'info');
        } else {
          if (window.showToast) window.showToast(resp.message || `Deployed ${siteName} to ${host}`, 'success');
        }
        setTimeout(() => { loadContext(); loadMetrics({ fresh: true }); }, 3000);
      } catch (e) {
        window.showToast(`Deploy failed: ${e.message}`, 'error');
      }
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function onActionClick(e) {
    const removeBtn = e.target.closest('button[data-remove-host]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      return removeVps(removeBtn.dataset.removeHost, removeBtn.dataset.isPanel === '1', removeBtn);
    }

    const sitesBtn = e.target.closest('button[data-show-sites]');
    if (sitesBtn) {
      e.preventDefault();
      e.stopPropagation();
      return _openSitesModal(sitesBtn.dataset.showSites);
    }

    const deployBtn = e.target.closest('button[data-deploy-to-vps]');
    if (deployBtn) {
      e.preventDefault();
      e.stopPropagation();
      return _openDeployToVpsModal(deployBtn.dataset.deployToVps);
    }

    const btn = e.target.closest('button[data-site-action], button[data-vps-action], button[data-panel-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;

    const confirmMsg = btn.dataset.confirm;
    if (confirmMsg) {
      const ok = await window.AlpConfirm.danger({
        title: 'Confirm action',
        body:  'You\'re about to ' + confirmMsg + '. Continue?',
        confirmLabel: 'Yes, do it',
      });
      if (!ok) return;
    }

    if (btn.dataset.siteAction)  return runSiteAction(btn.dataset.siteAction,  btn.dataset.wid, btn);
    if (btn.dataset.vpsAction)   return runVpsAction(btn.dataset.vpsAction,    btn.dataset.host, btn);
    if (btn.dataset.panelAction) return runPanelAction(btn.dataset.panelAction, btn);
  }

  async function removeVps(host, isPanel, btn) {
    const affected = _metrics.vps?.find(v => v.host === host)?.sites || [];
    const ok = await _typeToConfirm({ host, isPanel, affected });
    if (!ok) return;

    const loading = window.ALPLoading.action(btn, 'Removing…');
    try {
      await window.ALPApi._request('POST', '/api/vps-dashboard/remove', { host, is_panel: !!isPanel });
      window.showToast(`VPS ${host} removed from panel`, 'success');
      await loadContext();
      await loadMetrics({ fresh: true });
    } catch (e) {
      window.showToast('Remove failed: ' + e.message, 'error');
    }
    loading.stop();
  }

  // Type-to-confirm removal modal — user must type the exact VPS host to
  // arm the delete button. Guards against a stray click on the wrong card.
  function _typeToConfirm({ host, isPanel, affected }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'vps2-modal-overlay';
      const sitesHtml = affected.length
        ? `<div style="margin:12px 0 0;padding:10px 12px;background:rgba(217,119,6,.1);border:1px solid rgba(217,119,6,.28);border-radius:8px;font-size:12px;color:var(--color-warning);">
             <div style="font-weight:700;margin-bottom:4px;">${affected.length} website${affected.length !== 1 ? 's' : ''} will be detached:</div>
             <div>${affected.map(s => esc(s.name || s.slug)).join(', ')}</div>
           </div>`
        : '';
      const panelWarn = isPanel
        ? `<div style="margin:12px 0 0;padding:10px 12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;font-size:12px;color:var(--color-danger);">
             ⚠ This is the <strong>panel VPS</strong>. Deploys and panel actions will stop working until you reconfigure it.
           </div>`
        : '';
      overlay.innerHTML = `
        <div class="vps2-modal vps2-modal--danger" style="max-width:480px;">
          <div class="vps2-modal-hdr">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:34px;height:34px;border-radius:9px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.32);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2.2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              </div>
              <div>
                <div class="vps2-modal-title" style="color:var(--color-danger);">Remove VPS</div>
                <div class="vps2-modal-sub">This detaches it from the panel. The remote box is not touched.</div>
              </div>
            </div>
          </div>
          <div class="vps2-modal-body">
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55;">
              Type the VPS host below to confirm. This clears the SSH config from every website using it${isPanel ? ' or from panel settings' : ''} — nginx and antibot on the remote server keep running until you tear them down manually.
            </div>
            ${sitesHtml}
            ${panelWarn}
            <div class="vps2-modal-lbl" style="margin-top:16px;">Type to confirm</div>
            <div style="padding:8px 12px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:7px;font-family:var(--font-mono);font-size:13px;color:var(--accent-primary);user-select:all;margin-bottom:8px;word-break:break-all;">${esc(host)}</div>
            <input id="vps2-rm-input" class="vps2-modal-input" type="text" placeholder="Type the host above to enable Remove"
              autocomplete="off" spellcheck="false" data-lpignore="true" style="font-family:var(--font-mono);" />
            <div id="vps2-rm-match" style="font-size:11px;color:var(--text-muted);margin-top:6px;min-height:14px;"></div>
          </div>
          <div class="vps2-modal-ftr">
            <button type="button" id="vps2-rm-cancel" class="btn btn-secondary">Cancel</button>
            <button type="button" id="vps2-rm-confirm" class="btn btn-danger-solid" disabled style="opacity:.45;cursor:not-allowed;">Remove VPS</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const input   = overlay.querySelector('#vps2-rm-input');
      const match   = overlay.querySelector('#vps2-rm-match');
      const confirm = overlay.querySelector('#vps2-rm-confirm');
      const cancel  = overlay.querySelector('#vps2-rm-cancel');

      const finish = (val) => {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') finish(false);
        else if (e.key === 'Enter' && !confirm.disabled) finish(true);
      };
      const armed = () => {
        const isArmed = input.value.trim() === host;
        confirm.disabled = !isArmed;
        confirm.style.opacity = isArmed ? '1' : '.45';
        confirm.style.cursor = isArmed ? 'pointer' : 'not-allowed';
        if (isArmed) {
          match.textContent = '✓ Match — press Remove to detach';
          match.style.color = 'var(--color-success)';
          input.style.borderColor = 'var(--color-success)';
        } else {
          match.textContent = input.value ? '✗ Does not match' : '';
          match.style.color = input.value ? 'var(--color-danger)' : 'var(--text-muted)';
          input.style.borderColor = input.value ? 'var(--color-danger)' : '';
        }
      };
      input.addEventListener('input', armed);
      cancel.addEventListener('click', () => finish(false));
      confirm.addEventListener('click', () => { if (!confirm.disabled) finish(true); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
      document.addEventListener('keydown', onKey);
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        setTimeout(() => input.focus(), 40);
      }
    });
  }

  async function runSiteAction(action, websiteId, btn) {
    const site = _websites.find(w => String(w.id) === String(websiteId));
    const label = site ? site.name : ('site #' + websiteId);
    // Long-running actions go through SSE
    if (action === 'sync-content') {
      return streamAction({ target: 'site', action, website_id: Number(websiteId), label: `Syncing ${label}` });
    }
    // Sync actions return JSON
    return callAction({ target: 'site', action, website_id: Number(websiteId), label: `${action} · ${label}` }, btn);
  }
  async function runVpsAction(action, host, btn) {
    return callAction({ target: 'vps', action, host, label: `${action} · ${host}` }, btn);
  }
  async function runPanelAction(action, btn) {
    if (action === 'deploy') {
      return streamAction({ target: 'panel', action, label: 'Deploying panel' });
    }
    return callAction({ target: 'panel', action, label: `Panel · ${action}` }, btn);
  }

  async function callAction({ target, action, website_id, host, label }, btn) {
    const loading = btn ? window.ALPLoading.action(btn) : { stop: () => {} };
    try {
      const r = await window.ALPApi._request('POST', '/api/vps-dashboard/action', {
        target, action, website_id, host,
      });
      showTerminalOutput(label, r);
      if (['restart-antibot', 'restart-nginx', 'nginx-reload', 'restart-panel'].includes(action)) {
        setTimeout(() => loadMetrics({ fresh: true }), 1500);
      }
    } catch (e) {
      window.showToast(`${action} failed: ${e.message}`, 'error');
    } finally {
      loading.stop();
    }
  }

  async function streamAction({ target, action, website_id, host, label }) {
    try {
      const resp = await window.ALPApi._request('POST', '/api/vps-dashboard/action', { target, action, website_id, host });
      if (!resp?.session_id) throw new Error('no session id returned');
      openTerminalStream(resp.session_id, label);
      if (action === 'deploy' || action === 'sync-content') {
        setTimeout(() => loadMetrics({ fresh: true }), 3000);
      }
    } catch (e) {
      window.showToast(`${action} failed: ${e.message}`, 'error');
    }
  }

  // ── Terminal modal overlay ────────────────────────────────────────────────

  let _termModal = null;

  function _createTermModal(label) {
    if (_termModal) { _termModal.remove(); _termModal = null; }
    if (_healthStream) { try { _healthStream.close(); } catch (_) {} _healthStream = null; }

    const overlay = document.createElement('div');
    overlay.className = 'vps2-term-modal-overlay';
    overlay.innerHTML = `
      <div class="vps2-term-modal">
        <div class="vps2-term-modal-header">
          <span class="vps2-term-modal-label">${esc(label)}</span>
          <button type="button" class="vps2-term-modal-close">×</button>
        </div>
        <div class="vps2-term-modal-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    _termModal = overlay;

    const close = () => {
      if (_healthStream) { try { _healthStream.close(); } catch (_) {} _healthStream = null; }
      overlay.remove();
      _termModal = null;
    };
    overlay.querySelector('.vps2-term-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    return overlay.querySelector('.vps2-term-modal-body');
  }

  function showTerminalOutput(label, resp) {
    const container = _createTermModal(label);
    const term = window.AlpTerminal.mount(container, { title: label });
    term.setStatus('ok');
    const body = [];
    if (resp && resp.output != null) body.push(resp.output);
    if (resp && resp.stdout)         body.push(resp.stdout);
    if (resp && resp.stderr)         body.push('---STDERR---\n' + resp.stderr);
    if (!body.length && resp && resp.ok === false) body.push('Action failed.');
    (body.join('\n\n') || '(no output)').split(/\r?\n/).forEach(line => term.log(line));
    if (resp && resp.truncated) term.log('… output truncated to 32 KB', { level: 'warn' });
    _actionTermEl = term;
  }

  function openTerminalStream(sessionId, label) {
    const container = _createTermModal(label);
    const term = window.AlpTerminal.mount(container, { title: label });
    term.setStatus('running');
    _actionTermEl = term;

    const token = window.ALPAuth?.getToken();
    const url = `${window.location.origin}/api/deploy/stream?id=${sessionId}&token=${encodeURIComponent(token || '')}`;
    _healthStream = new EventSource(url);

    _healthStream.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.type === 'log') term.log(evt.message);
        else if (evt.type === 'done')  { term.setStatus('ok');    term.log(evt.message || 'done', { level: 'ok' }); _healthStream.close(); _healthStream = null; }
        else if (evt.type === 'error') { term.setStatus('error'); term.log(evt.message || 'error', { level: 'error' }); _healthStream.close(); _healthStream = null; }
      } catch (_) {}
    };
    _healthStream.onerror = () => {
      term.log('Stream disconnected', { level: 'warn' });
      if (_healthStream) { try { _healthStream.close(); } catch (_) {} _healthStream = null; }
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function humanDuration(ms) {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ' + (m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }

  // ── VPS Creation Modals ───────────────────────────────────────────────────
  // Shared shell for all VPS create/move flows (token-driven Light + Dark safe, no overflow:hidden clipping comboboxes)
  function _openVpsModal({ title, subtitle, bodyHtml, saveLabel, onSave }) {
    const existing = document.getElementById('vps2-create-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vps2-create-modal';
    modal.className = 'vps2-modal-overlay';
    modal.innerHTML = `
      <div class="vps2-modal">
        <div class="vps2-modal-hdr">
          <div>
            <div class="vps2-modal-title" style="color:var(--accent-primary);">${esc(title)}</div>
            <div class="vps2-modal-sub">${esc(subtitle || '')}</div>
          </div>
          <button type="button" id="vps2-cm-close" class="vps2-modal-close" aria-label="Close">×</button>
        </div>
        <div id="vps2-cm-body" class="vps2-modal-body">${bodyHtml}</div>
        <div id="vps2-cm-err" class="vps2-modal-err"></div>
        <div class="vps2-modal-ftr">
          <button type="button" id="vps2-cm-cancel" class="btn btn-secondary">Cancel</button>
          <button type="button" id="vps2-cm-save" class="btn btn-primary">${esc(saveLabel || 'Save')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => { modal.remove(); document.removeEventListener('keydown', escHandler); };
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    modal.querySelector('#vps2-cm-close').addEventListener('click', close);
    modal.querySelector('#vps2-cm-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', escHandler);

    const showErr = (msg) => {
      const el = modal.querySelector('#vps2-cm-err');
      el.textContent = msg || 'Something went wrong';
      el.style.display = 'block';
    };
    let _saveLoading = null;
    const setSaving = (yes) => {
      const btn = modal.querySelector('#vps2-cm-save');
      if (yes && !_saveLoading) _saveLoading = window.ALPLoading.action(btn, 'Saving…');
      if (!yes && _saveLoading) { _saveLoading.stop(); _saveLoading = null; }
    };
    modal.querySelector('#vps2-cm-save').addEventListener('click', async () => {
      modal.querySelector('#vps2-cm-err').style.display = 'none';
      setSaving(true);
      try {
        const ok = await onSave({ modal, showErr, close });
        if (ok !== false) close();
      } catch (err) {
        showErr(err && err.message ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    });

    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => {
        const inp = modal.querySelector('input,select,textarea');
        if (inp) inp.focus();
      }, 30);
    }

    return { modal, close, showErr };
  }

  // ── Panel VPS (god-only) ─────────────────────────────────────────────────
  function _openPanelVpsModal() {
    const isGod = !!(window.ALPAuth && window.ALPAuth.isGod && window.ALPAuth.isGod());
    if (!isGod) {
      if (window.showToast) window.showToast('Panel VPS is god-only', 'warning');
      return;
    }
    const bodyHtml = `
      <div class="vps2-form-grid">
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Host / IP <span style="color:var(--color-danger);">*</span></div>
          <input id="pvps-host" class="vps2-modal-input" type="text" placeholder="74.50.87.73" />
        </div>
        <div>
          <div class="vps2-modal-lbl">SSH User</div>
          <input id="pvps-user" class="vps2-modal-input" type="text" value="root" />
        </div>
        <div>
          <div class="vps2-modal-lbl">SSH Port</div>
          <input id="pvps-port" class="vps2-modal-input" type="number" value="22" />
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Auth</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label class="vps2-auth-opt"><input type="radio" name="pvps-auth" value="pass" checked style="margin-right:6px;">Password</label>
            <label class="vps2-auth-opt"><input type="radio" name="pvps-auth" value="key" style="margin-right:6px;">SSH Key</label>
          </div>
          <input id="pvps-pass" class="vps2-modal-input" type="password" placeholder="SSH password" />
          <textarea id="pvps-key" class="vps2-modal-input" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows="4" style="display:none;font-family:var(--font-mono);font-size:11px;"></textarea>
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Panel Domain <span style="color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0;">(optional)</span></div>
          <input id="pvps-domain" class="vps2-modal-input" type="text" placeholder="panel.example.com" />
        </div>
      </div>
    `;
    const ctx = _openVpsModal({
      title: 'Add Panel VPS',
      subtitle: 'The server hosting the admin panel itself',
      bodyHtml,
      saveLabel: 'Save Panel VPS',
      onSave: async ({ showErr }) => {
        const host   = document.getElementById('pvps-host').value.trim();
        const port   = document.getElementById('pvps-port').value.trim() || '22';
        const user   = document.getElementById('pvps-user').value.trim() || 'root';
        const auth   = (document.querySelector('input[name="pvps-auth"]:checked') || {}).value || 'pass';
        const pass   = document.getElementById('pvps-pass').value;
        const key    = document.getElementById('pvps-key').value;
        const domain = document.getElementById('pvps-domain').value.trim();
        if (!host)                       { showErr('Host is required');     return false; }
        if (auth === 'pass' && !pass)    { showErr('Password is required'); return false; }
        if (auth === 'key'  && !key)     { showErr('SSH key is required');  return false; }

        const settings = {
          panel_vps_host: host,
          panel_vps_ssh_port: port,
          panel_vps_ssh_user: user,
          deploy_ssh_auth: auth === 'key' ? 'key' : 'password',
        };
        if (auth === 'pass') settings.deploy_ssh_pass = pass;
        else                 settings.deploy_ssh_key  = key;
        if (domain) settings.panel_domain = domain;

        await window.ALPApi.updateSettings(settings);
        if (window.showToast) window.showToast('Panel VPS saved', 'success');
        await loadContext();
        await loadMetrics({ fresh: true });
      },
    });
    ctx.modal.querySelectorAll('input[name="pvps-auth"]').forEach(r => {
      r.addEventListener('change', () => {
        const isKey = r.value === 'key' && r.checked;
        ctx.modal.querySelector('#pvps-pass').style.display = isKey ? 'none' : 'block';
        ctx.modal.querySelector('#pvps-key').style.display  = isKey ? 'block' : 'none';
      });
    });
  }

  // ── Website VPS ──────────────────────────────────────────────────────────
  async function _openWebsiteVpsModal() {
    let sites = [];
    try {
      const r = await window.ALPApi.getWebsites();
      sites = ((r && r.websites) || []).slice().sort((a, b) => {
        const av = a.vps_host ? 1 : 0, bv = b.vps_host ? 1 : 0;
        return av - bv || (a.name || '').localeCompare(b.name || '');
      });
    } catch (err) {
      if (window.showToast) window.showToast('Failed to load websites: ' + err.message, 'error');
      return;
    }
    if (!sites.length) {
      if (window.showToast) window.showToast('You have no websites yet — create one first on the Websites page', 'warning');
      return;
    }

    const opts = sites.map(s => {
      const badge = s.vps_host ? ` — already on ${esc(s.vps_host)}` : '';
      return `<option value="${s.id}">${esc(s.name || 'unnamed')}${badge}</option>`;
    }).join('');

    const bodyHtml = `
      <div class="vps2-form-grid">
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Website <span style="color:var(--color-danger);">*</span></div>
          <select id="wvps-site" class="vps2-modal-input">${opts}</select>
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">VPS Host / IP <span style="color:var(--color-danger);">*</span></div>
          <input id="wvps-host" class="vps2-modal-input" type="text" placeholder="74.50.87.73 or vps.example.com" />
        </div>
        <div>
          <div class="vps2-modal-lbl">SSH User</div>
          <input id="wvps-user" class="vps2-modal-input" type="text" value="root" />
        </div>
        <div>
          <div class="vps2-modal-lbl">SSH Port</div>
          <input id="wvps-port" class="vps2-modal-input" type="number" value="22" />
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Auth</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label class="vps2-auth-opt"><input type="radio" name="wvps-auth" value="pass" checked style="margin-right:6px;">Password</label>
            <label class="vps2-auth-opt"><input type="radio" name="wvps-auth" value="key" style="margin-right:6px;">SSH Key</label>
          </div>
          <input id="wvps-pass" class="vps2-modal-input" type="password" placeholder="SSH password" />
          <textarea id="wvps-key" class="vps2-modal-input" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows="4" style="display:none;font-family:var(--font-mono);font-size:11px;"></textarea>
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Public Domain <span style="color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0;">(optional)</span></div>
          <input id="wvps-domain" class="vps2-modal-input" type="text" placeholder="site.example.com" />
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">If set, a Cloudflare zone is created and its nameservers are shown to you.</div>
        </div>
      </div>
    `;

    const ctx = _openVpsModal({
      title: 'Add Website VPS',
      subtitle: 'Attach an SSH-reachable server to one of your websites',
      bodyHtml,
      saveLabel: 'Save VPS Config',
      onSave: async ({ showErr }) => {
        const siteId = document.getElementById('wvps-site').value;
        const host   = document.getElementById('wvps-host').value.trim();
        const port   = document.getElementById('wvps-port').value.trim() || '22';
        const user   = document.getElementById('wvps-user').value.trim() || 'root';
        const auth   = (document.querySelector('input[name="wvps-auth"]:checked') || {}).value || 'pass';
        const pass   = document.getElementById('wvps-pass').value;
        const key    = document.getElementById('wvps-key').value;
        const domain = document.getElementById('wvps-domain').value.trim();
        if (!siteId)                     { showErr('Pick a website');       return false; }
        if (!host)                       { showErr('Host is required');     return false; }
        if (auth === 'pass' && !pass)    { showErr('Password is required'); return false; }
        if (auth === 'key'  && !key)     { showErr('SSH key is required');  return false; }

        const body = {
          vps_host: host,
          vps_ssh_port: port,
          vps_ssh_user: user,
        };
        if (auth === 'pass') body.vps_ssh_pass = pass;
        else                 body.vps_ssh_key  = key;
        if (domain) body.deploy_domain = domain;

        const resp = await window.ALPApi._request('PUT', `/api/website-deploy/${siteId}/config`, body);
        if (window.showToast) window.showToast('Website VPS saved', 'success');
        if (resp && resp.cloudflare && Array.isArray(resp.cloudflare.nameservers) && resp.cloudflare.nameservers.length) {
          const ns = resp.cloudflare.nameservers.join(', ');
          if (window.showToast) window.showToast('Point domain to Cloudflare: ' + ns, 'info');
        }
        await loadContext();
        await loadMetrics({ fresh: true });
      },
    });
    // Upgrade the site picker to a searchable combobox
    if (window.ALPCombobox) {
      const siteSel = ctx.modal.querySelector('#wvps-site');
      if (siteSel) {
        window.ALPCombobox.upgrade(siteSel, {
          placeholder: 'Pick a website…',
          searchPlaceholder: 'Search sites…',
          items: sites.map(s => ({
            value: String(s.id),
            label: s.name || 'unnamed',
            hint:  s.vps_host ? `on ${s.vps_host}` : (s.domain || ''),
            color: s.color || '#6366f1',
            icon:  s.logo_url
              ? { type: 'img', src: s.logo_url }
              : { type: 'color', color: s.color || '#6366f1', letter: (s.name || '?')[0].toUpperCase() },
          })),
        });
      }
    }

    ctx.modal.querySelectorAll('input[name="wvps-auth"]').forEach(r => {
      r.addEventListener('change', () => {
        const isKey = r.value === 'key' && r.checked;
        ctx.modal.querySelector('#wvps-pass').style.display = isKey ? 'none' : 'block';
        ctx.modal.querySelector('#wvps-key').style.display  = isKey ? 'block' : 'none';
      });
    });
  }

  // ── Standalone VPS ───────────────────────────────────────────────────────
  function _openStandaloneVpsModal() {
    const bodyHtml = `
      <div class="vps2-form-grid">
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Host / IP <span style="color:var(--color-danger);">*</span></div>
          <input id="svps-host" class="vps2-modal-input" type="text" placeholder="74.50.87.73" />
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Label <span style="color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0;">(optional)</span></div>
          <input id="svps-label" class="vps2-modal-input" type="text" placeholder="backup-eu, staging, etc." />
        </div>
        <div>
          <div class="vps2-modal-lbl">SSH User</div>
          <input id="svps-user" class="vps2-modal-input" type="text" value="root" />
        </div>
        <div>
          <div class="vps2-modal-lbl">SSH Port</div>
          <input id="svps-port" class="vps2-modal-input" type="number" value="22" />
        </div>
        <div style="grid-column:1/-1;">
          <div class="vps2-modal-lbl">Auth</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label class="vps2-auth-opt"><input type="radio" name="svps-auth" value="pass" checked style="margin-right:6px;">Password</label>
            <label class="vps2-auth-opt"><input type="radio" name="svps-auth" value="key" style="margin-right:6px;">SSH Key</label>
          </div>
          <input id="svps-pass" class="vps2-modal-input" type="password" placeholder="SSH password" />
          <textarea id="svps-key" class="vps2-modal-input" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows="4" style="display:none;font-family:var(--font-mono);font-size:11px;"></textarea>
        </div>
      </div>
    `;
    const ctx = _openVpsModal({
      title: 'Add Standalone VPS',
      subtitle: 'Unattached backup server — link to websites later',
      bodyHtml,
      saveLabel: 'Add VPS',
      onSave: async ({ showErr }) => {
        const host  = document.getElementById('svps-host').value.trim();
        const label = document.getElementById('svps-label').value.trim();
        const port  = document.getElementById('svps-port').value.trim() || '22';
        const user  = document.getElementById('svps-user').value.trim() || 'root';
        const auth  = (document.querySelector('input[name="svps-auth"]:checked') || {}).value || 'pass';
        const pass  = document.getElementById('svps-pass').value;
        const key   = document.getElementById('svps-key').value;
        if (!host)                       { showErr('Host is required');     return false; }
        if (auth === 'pass' && !pass)    { showErr('Password is required'); return false; }
        if (auth === 'key'  && !key)     { showErr('SSH key is required');  return false; }

        const resp = await window.ALPApi._request('POST', '/api/vps-dashboard/add', {
          host, ssh_port: port, ssh_user: user,
          auth_mode: auth === 'key' ? 'key' : 'password',
          ssh_pass: auth === 'key' ? null : pass,
          ssh_key:  auth === 'key' ? key  : null,
          label: label || null,
        });
        if (resp.session_id) {
          openTerminalStream(resp.session_id, `Provisioning ${host}`);
          if (window.showToast) window.showToast(`Setting up ${host} — watch terminal for progress`, 'info');
        } else {
          if (window.showToast) window.showToast('Standalone VPS added', 'success');
        }
        setTimeout(async () => { await loadContext(); await loadMetrics({ fresh: true }); }, 3000);
      },
    });
    ctx.modal.querySelectorAll('input[name="svps-auth"]').forEach(r => {
      r.addEventListener('change', () => {
        const isKey = r.value === 'key' && r.checked;
        ctx.modal.querySelector('#svps-pass').style.display = isKey ? 'none' : 'block';
        ctx.modal.querySelector('#svps-key').style.display  = isKey ? 'block' : 'none';
      });
    });
  }

  // ── Move Website to different VPS ──────────────────────────────────────────
  function _openMoveModal(websiteId, siteName, currentHost) {
    const allVps = (_metrics.vps || []).filter(v => v.vps_id && v.host !== currentHost);
    if (!allVps.length) {
      if (window.showToast) window.showToast('No other VPS available to move to', 'warning');
      return;
    }
    const opts = allVps.map(v =>
      `<option value="${v.vps_id}">${esc(v.host)}${v.label ? ' (' + esc(v.label) + ')' : ''}${v.sites?.length ? ' · ' + v.sites.length + ' site(s)' : ' · idle'}</option>`
    ).join('');

    const ctx = _openVpsModal({
      title: 'Move Website',
      subtitle: `${siteName} — currently on ${currentHost}`,
      bodyHtml: `
        <div class="vps2-modal-lbl">Move to VPS</div>
        <select id="mvps-target" class="vps2-modal-input">${opts}</select>
        <div style="margin-top:12px;padding:10px 12px;background:rgba(20,184,166,.1);border:1px solid rgba(20,184,166,.28);border-radius:8px;font-size:11.5px;color:var(--color-success);line-height:1.5;">
          Full deployment — syncs files, deploys antibot, sets up nginx + SSL, and updates DNS on the new VPS.
        </div>
      `,
      saveLabel: 'Move',
      onSave: async ({ showErr }) => {
        const targetVpsId = document.getElementById('mvps-target').value;
        if (!targetVpsId) { showErr('Pick a target VPS'); return false; }
        const sel = document.getElementById('mvps-target');
        const targetLabel = sel.options[sel.selectedIndex]?.textContent || '';
        const resp = await window.ALPApi._request('POST', '/api/vps-dashboard/move-site', {
          website_id: Number(websiteId),
          target_vps_id: Number(targetVpsId),
        });
        if (resp.session_id) {
          openTerminalStream(resp.session_id, `Moving ${siteName} → ${targetLabel}`);
          if (window.showToast) window.showToast(`Moving ${siteName} to ${resp.host} — watch terminal for progress`, 'info');
        } else {
          if (window.showToast) window.showToast(`Moved ${siteName} to ${resp.host}`, 'success');
        }
        setTimeout(() => { loadContext(); loadMetrics({ fresh: true }); }, 3000);
      },
    });
    // Upgrade the VPS target picker into a searchable combobox with rich items
    if (window.ALPCombobox && ctx?.modal) {
      const vSel = ctx.modal.querySelector('#mvps-target');
      if (vSel) {
        window.ALPCombobox.upgrade(vSel, {
          placeholder: 'Pick a target VPS…',
          searchPlaceholder: 'Search VPS…',
          items: allVps.map(v => {
            const busy = v.sites?.length || 0;
            const unreachable = v.reachable === false;
            return {
              value: String(v.vps_id),
              label: v.host + (v.label ? ` (${v.label})` : ''),
              hint:  unreachable ? 'unreachable' : (busy ? `${busy} site${busy !== 1 ? 's' : ''}` : 'idle'),
              color: unreachable ? '#f87171' : (busy ? '#f59e0b' : '#10b981'),
              icon:  { type: 'emoji', text: unreachable ? '⚠️' : (busy ? '🖥' : '📦') },
            };
          }),
        });
      }
    }
  }

  return { render, init, destroy };
})();

window.VpsPage = VpsPage;
