/**
 * ALP – Domain Command Center
 *
 * Sections:
 *  1. Stats cards — overview at a glance
 *  2. Managed Domains — unified table with search / filter / sort / batch actions
 *  3. Detail Drawer — slide-in panel with Overview / DNS & SSL / Audit tabs
 *  4. Legacy Website Domains — collapsed section for legacy Railway domains
 */
const DomainsPage = (() => {

  // ─── state ──────────────────────────────────────────────────────────────────

  let _domains      = [];
  let _websites     = [];
  let _railwayDoms  = [];
  let _railwayCfg   = false;
  let _quota        = null;
  let _destroyed    = false;
  let _pollTimer    = null;
  let _scamPages    = [];

  // UI state
  let _searchQuery  = '';
  let _filterStatus = '';
  let _filterUptime = '';
  let _filterWebsite = '';
  let _filterLinked  = '';
  let _sortBy       = 'created';
  let _selected     = new Set();
  let _drawerDomainId = null;
  let _drawerTab    = 'overview';

  // ─── helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const PIPELINE_STEPS = [
    { key: 'pending_nameservers', label: 'Pending NS', icon: '1' },
    { key: 'nameservers_active',  label: 'NS Active',  icon: '2' },
    { key: 'vps_configured',      label: 'VPS',        icon: '3' },
    { key: 'ssl_issued',          label: 'SSL',        icon: '4' },
    { key: 'live',                label: 'Live',       icon: '✓' },
  ];

  const STATUS_META = {
    pending_nameservers: { color: 'var(--color-warning)',  bg: 'var(--color-warning-muted)', label: 'Pending NS',   icon: '⏳' },
    nameservers_active:  { color: 'var(--color-info)',     bg: 'var(--color-info-muted)',    label: 'NS Active',    icon: '✓'  },
    railway_linked:      { color: 'var(--color-info)',     bg: 'var(--color-info-muted)',    label: 'VPS',          icon: '🖥' },
    vps_configured:      { color: 'var(--color-info)',     bg: 'var(--color-info-muted)',    label: 'VPS',          icon: '🖥' },
    ssl_issued:          { color: 'var(--color-success)',  bg: 'var(--color-success-muted)', label: 'SSL Issued',   icon: '🔒' },
    live:                { color: 'var(--color-success)',  bg: 'var(--color-success-muted)', label: 'Live',         icon: '✅' },
    error:               { color: 'var(--color-danger)',   bg: 'var(--color-danger-muted)',  label: 'Error',        icon: '✕'  },
  };

  function stepIndex(status) {
    // railway_linked is treated as equivalent to vps_configured
    const key = status === 'railway_linked' ? 'vps_configured' : status;
    return PIPELINE_STEPS.findIndex(s => s.key === key);
  }

  function parseNs(d) { return Array.isArray(d.nameservers) ? d.nameservers : []; }
  function parseDns(d) { return Array.isArray(d.dns_records) ? d.dns_records : []; }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtAgo(iso) {
    if (!iso) return '—';
    const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  function getFiltered() {
    let list = [..._domains];

    if (_searchQuery) {
      const q = _searchQuery.toLowerCase();
      list = list.filter(d =>
        d.domain.toLowerCase().includes(q) ||
        (d.error_message || '').toLowerCase().includes(q)
      );
    }

    if (_filterStatus) {
      if (_filterStatus === 'flagged') {
        list = list.filter(d => d.flagged);
      } else {
        list = list.filter(d => d.status === _filterStatus);
      }
    }

    if (_filterUptime) {
      if (_filterUptime === 'up')      list = list.filter(d => d.uptime_ok === 1);
      if (_filterUptime === 'down')    list = list.filter(d => d.uptime_ok === 0);
      if (_filterUptime === 'unknown') list = list.filter(d => d.uptime_ok === null || d.uptime_ok === undefined);
    }

    if (_filterWebsite) {
      list = list.filter(d => String(d.website_id) === _filterWebsite);
    }

    if (_filterLinked) {
      if (_filterLinked === 'linked')   list = list.filter(d => d.website_id);
      if (_filterLinked === 'unlinked') list = list.filter(d => !d.website_id);
    }

    list.sort((a, b) => {
      switch (_sortBy) {
        case 'domain':  return a.domain.localeCompare(b.domain);
        case 'status':  return (stepIndex(a.status) - stepIndex(b.status)) || a.domain.localeCompare(b.domain);
        case 'uptime':  return ((b.uptime_ok ?? -1) - (a.uptime_ok ?? -1));
        case 'checked': return new Date(b.last_checked_at || 0) - new Date(a.last_checked_at || 0);
        default:        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });

    return list;
  }

  // ─── CSS ────────────────────────────────────────────────────────────────────

  function styles() {
    return `
<style>
/* ── Domain Command Center ─────────────────────────── */
.dc-pg { max-width: 1200px; margin: 0 auto; padding: 0 0 60px; }

/* Header */
.dc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.dc-title { font-size: 22px; font-weight: 800; color: var(--text-primary); }
.dc-live-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: var(--color-success); padding: 3px 10px; border-radius: var(--radius-pill);
  background: var(--color-success-muted); border: 1px solid rgba(34,197,94,.2);
}
.dc-live-badge::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-success); animation: dc-pulse 2s infinite;
}
@keyframes dc-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.dc-header-actions { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }

/* Buttons */
.dc-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: var(--radius-md); font-size: 12px; font-weight: 700;
  cursor: pointer; border: 1px solid; white-space: nowrap; transition: all var(--transition-fast);
  font-family: var(--font-sans);
}
.dc-btn.gold   { background: var(--accent-primary-muted); color: var(--accent-primary); border-color: var(--border-gold); }
.dc-btn.gold:hover { background: var(--accent-primary-ring); }
.dc-btn.secondary { background: var(--bg-hover); color: var(--text-secondary); border-color: var(--border-primary); }
.dc-btn.secondary:hover { background: var(--bg-active); }
.dc-btn.danger { background: var(--color-danger-muted); color: var(--color-danger); border-color: rgba(239,68,68,.2); }
.dc-btn.danger:hover { background: rgba(239,68,68,.18); }
.dc-btn.success { background: var(--color-success-muted); color: var(--color-success); border-color: rgba(34,197,94,.2); }
.dc-btn.success:hover { background: rgba(34,197,94,.18); }
.dc-btn[disabled] { opacity: .35; cursor: not-allowed; pointer-events: none; }
.dc-btn-sm { padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); }

/* Stats Cards */
.dc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
.dc-stat {
  background: var(--bg-elevated); border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl); padding: 16px 18px; transition: all var(--transition-base);
  position: relative; overflow: hidden;
}
.dc-stat:hover { border-color: var(--border-hover); box-shadow: var(--shadow-sm); }
.dc-stat::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--stat-accent, var(--accent-primary)); opacity: .6;
}
.dc-stat-val { font-size: 26px; font-weight: 800; color: var(--text-primary); line-height: 1.2; }
.dc-stat-lbl { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); margin-top: 4px; }
.dc-stat-sub { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

/* CF Quota bar */
.dc-cf-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-radius: var(--radius-lg); margin-bottom: 16px;
  border: 1px solid var(--border-primary); font-size: 12px;
  background: var(--bg-elevated);
}
.dc-cf-bar.warn { border-color: rgba(245,158,11,.2); background: var(--color-warning-muted); }
.dc-cf-bar .dc-cf-label { color: var(--text-secondary); }
.dc-cf-bar .dc-cf-label strong { color: var(--accent-primary); }
.dc-cf-bar.warn .dc-cf-label strong { color: var(--color-warning); }

/* Toolbar */
.dc-toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap;
}
.dc-search {
  flex: 1; min-width: 180px; max-width: 320px;
  padding: 8px 12px 8px 32px; border-radius: var(--radius-md);
  background: var(--bg-input); border: 1px solid var(--border-primary);
  color: var(--text-primary); font-size: 12.5px; font-family: var(--font-sans);
  transition: border-color var(--transition-fast);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: 10px center;
}
.dc-search:focus { outline: none; border-color: var(--accent-primary); }
.dc-search::placeholder { color: var(--text-placeholder); }
.dc-select {
  padding: 8px 28px 8px 10px; border-radius: var(--radius-md);
  background: var(--bg-input); border: 1px solid var(--border-primary);
  color: var(--text-secondary); font-size: 12px; font-family: var(--font-sans);
  cursor: pointer; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: calc(100% - 8px) center;
}
.dc-select:focus { outline: none; border-color: var(--accent-primary); }

/* Batch bar */
.dc-batch {
  display: none; align-items: center; gap: 10px;
  padding: 10px 16px; border-radius: var(--radius-lg); margin-bottom: 12px;
  background: var(--accent-primary-muted); border: 1px solid var(--border-gold);
}
.dc-batch.show { display: flex; }
.dc-batch-count { font-size: 12px; font-weight: 700; color: var(--accent-primary); }
.dc-batch-actions { margin-left: auto; display: flex; gap: 8px; }

/* Table */
.dc-table-wrap {
  overflow-x: auto; border-radius: var(--radius-xl);
  border: 1px solid var(--border-primary); margin-bottom: 8px;
  background: var(--bg-elevated);
}
.dc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dc-table th {
  padding: 10px 14px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-tertiary); text-align: left;
  background: var(--bg-tertiary); border-bottom: 1px solid var(--border-primary);
  white-space: nowrap; user-select: none;
}
.dc-table th.sortable { cursor: pointer; }
.dc-table th.sortable:hover { color: var(--accent-primary); }
.dc-table th.sorted { color: var(--accent-primary); }
.dc-table td {
  padding: 12px 14px; border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary); vertical-align: middle;
}
.dc-table tr:last-child td { border-bottom: none; }
.dc-table tr:hover td { background: var(--bg-hover); }
.dc-table tr.selected td { background: var(--accent-primary-muted); }
.dc-table tr.row-up td { background: rgba(34,197,94,.04); }
.dc-table tr.row-up:hover td { background: rgba(34,197,94,.08); }
.dc-table tr.row-down td { background: rgba(239,68,68,.04); }
.dc-table tr.row-down:hover td { background: rgba(239,68,68,.08); }
.dc-table tr.row-flagged td { background: rgba(239,68,68,.06); }
.dc-table tr.row-flagged:hover td { background: rgba(239,68,68,.10); }

/* Domain cell */
.dc-domain-name {
  font-family: var(--font-mono); font-size: 12.5px; color: var(--text-primary);
  font-weight: 600; display: flex; align-items: center; gap: 6px;
}
.dc-domain-meta { font-size: 10.5px; color: var(--text-tertiary); margin-top: 2px; }
.dc-tag {
  font-size: 8.5px; padding: 1px 6px; border-radius: var(--radius-sm);
  font-weight: 700; text-transform: uppercase; letter-spacing: .04em; flex-shrink: 0;
}
.dc-tag-manual { background: var(--color-warning-muted); color: var(--color-warning); border: 1px solid rgba(245,158,11,.2); }
.dc-tag-flagged { background: var(--color-danger-muted); color: var(--color-danger); border: 1px solid rgba(239,68,68,.2); }

/* Pipeline */
.dc-pipeline { display: flex; align-items: center; gap: 2px; }
.dc-pipe-step {
  display: flex; align-items: center; gap: 2px;
  font-size: 9.5px; font-weight: 600; padding: 3px 7px; border-radius: var(--radius-xs);
  white-space: nowrap; transition: all var(--transition-base);
}
.dc-pipe-step.done   { background: var(--color-success-muted); color: var(--color-success); }
.dc-pipe-step.active { background: var(--accent-primary-muted); color: var(--accent-primary); animation: dc-pulse 2s infinite; }
.dc-pipe-step.future { background: var(--bg-hover); color: var(--text-muted); }
.dc-pipe-step.error  { background: var(--color-danger-muted); color: var(--color-danger); }
.dc-pipe-sep { color: var(--text-muted); font-size: 9px; }

/* Status badge */
.dc-status-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 700;
}

/* Uptime dot */
.dc-uptime { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; }
.dc-uptime::before {
  content: ''; display: block; width: 7px; height: 7px; border-radius: 50%;
}
.dc-uptime.up::before   { background: var(--color-success); box-shadow: 0 0 6px var(--color-success); }
.dc-uptime.down::before { background: var(--color-danger); }
.dc-uptime.unknown::before { background: var(--text-muted); }
.dc-uptime.up   { color: var(--color-success); }
.dc-uptime.down { color: var(--color-danger); }
.dc-uptime.unknown { color: var(--text-muted); }

/* Flag cell */
.dc-flag-clean { color: var(--color-success); font-size: 11px; }
.dc-flag-alert { color: var(--color-danger); font-weight: 700; font-size: 11px; }

/* Actions */
.dc-actions { display: flex; gap: 4px; flex-wrap: nowrap; }
.dc-act {
  padding: 5px 9px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600;
  cursor: pointer; border: 1px solid; white-space: nowrap; transition: all var(--transition-fast);
  font-family: var(--font-sans); display: inline-flex; align-items: center; gap: 4px;
  text-decoration: none; background: transparent;
}
.dc-act.view { color: var(--accent-primary); border-color: var(--border-gold); }
.dc-act.view:hover { background: var(--accent-primary-muted); }
.dc-act.check { color: var(--color-success); border-color: rgba(34,197,94,.2); }
.dc-act.check:hover { background: var(--color-success-muted); }
.dc-act.del { color: var(--color-danger); border-color: rgba(239,68,68,.2); }
.dc-act.del:hover { background: var(--color-danger-muted); }
.dc-act.visit { color: var(--color-success); border-color: rgba(34,197,94,.2); }
.dc-act.visit:hover { background: var(--color-success-muted); }

/* Checkbox */
.dc-check {
  width: 15px; height: 15px; border-radius: var(--radius-xs);
  border: 1.5px solid var(--border-hover); background: var(--bg-input);
  cursor: pointer; appearance: none; vertical-align: middle;
  transition: all var(--transition-fast); flex-shrink: 0;
}
.dc-check:checked {
  background: var(--accent-primary); border-color: var(--accent-primary);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: center;
}

/* Empty state */
.dc-empty { text-align: center; padding: 52px 20px; color: var(--text-tertiary); font-size: 13px; }
.dc-empty-icon { font-size: 36px; margin-bottom: 12px; opacity: .4; }
.dc-empty p { max-width: 300px; margin: 0 auto; line-height: 1.6; }

/* ── Detail Drawer ──────────────────────────── */
.dc-drawer-overlay {
  position: fixed; inset: 0; background: var(--bg-overlay); z-index: var(--z-overlay);
  opacity: 0; transition: opacity var(--transition-slow); pointer-events: none;
}
.dc-drawer-overlay.open { opacity: 1; pointer-events: all; }
.dc-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 560px; max-width: 100vw;
  background: var(--bg-secondary); border-left: 1px solid var(--border-primary);
  z-index: var(--z-modal); transform: translateX(100%);
  transition: transform var(--transition-slow); overflow-y: auto;
  box-shadow: var(--shadow-xl);
}
.dc-drawer.open { transform: translateX(0); }
.dc-drawer-hdr {
  position: sticky; top: 0; z-index: 2; padding: 18px 22px;
  background: var(--bg-secondary); border-bottom: 1px solid var(--border-primary);
  display: flex; align-items: center; gap: 12px;
}
.dc-drawer-title {
  font-family: var(--font-mono); font-size: 15px; font-weight: 700;
  color: var(--text-primary); flex: 1; min-width: 0; word-break: break-all;
}
.dc-drawer-close {
  width: 30px; height: 30px; border-radius: var(--radius-md);
  border: 1px solid var(--border-primary); background: var(--bg-hover);
  color: var(--text-tertiary); cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition-fast);
}
.dc-drawer-close:hover { background: var(--bg-active); color: var(--text-primary); }
.dc-drawer-body { padding: 0 22px 30px; }

/* Drawer tabs */
.dc-tabs {
  display: flex; gap: 0; border-bottom: 1px solid var(--border-primary);
  padding: 0 22px; background: var(--bg-secondary); position: sticky; top: 60px; z-index: 1;
}
.dc-tab {
  padding: 10px 16px; font-size: 12px; font-weight: 600; color: var(--text-tertiary);
  cursor: pointer; border-bottom: 2px solid transparent; transition: all var(--transition-fast);
  background: transparent; border-top: none; border-left: none; border-right: none;
  font-family: var(--font-sans);
}
.dc-tab:hover { color: var(--text-secondary); }
.dc-tab.active { color: var(--accent-primary); border-bottom-color: var(--accent-primary); }

/* Drawer stepper */
.dc-stepper { display: flex; align-items: center; justify-content: center; gap: 0; padding: 20px 8px 16px; }
.dc-step { display: flex; flex-direction: column; align-items: center; gap: 5px; position: relative; z-index: 1; }
.dc-step-dot {
  width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; transition: all .4s var(--ease-out);
  border: 2px solid transparent; flex-shrink: 0;
}
.dc-step.done .dc-step-dot   { background: var(--color-success-muted); border-color: var(--color-success); color: var(--color-success); }
.dc-step.active .dc-step-dot { background: var(--accent-primary-muted); border-color: var(--accent-primary); color: var(--accent-primary); box-shadow: 0 0 12px var(--accent-primary-ring); animation: dc-step-glow 2s ease-in-out infinite; }
.dc-step.future .dc-step-dot { background: var(--bg-hover); border-color: var(--border-primary); color: var(--text-muted); }
.dc-step.error .dc-step-dot  { background: var(--color-danger-muted); border-color: var(--color-danger); color: var(--color-danger); }
.dc-step-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
.dc-step.done   .dc-step-label { color: var(--color-success); }
.dc-step.active  .dc-step-label { color: var(--accent-primary); }
.dc-step.future .dc-step-label { color: var(--text-muted); }
.dc-step.error  .dc-step-label { color: var(--color-danger); }
.dc-step-line { flex: 1; height: 2px; min-width: 14px; max-width: 48px; border-radius: 1px; align-self: center; margin-top: -12px; transition: background .4s; }
.dc-step-line.done   { background: var(--color-success); }
.dc-step-line.active { background: linear-gradient(90deg, var(--color-success), var(--accent-primary)); }
.dc-step-line.future { background: var(--border-subtle); }
@keyframes dc-step-glow {
  0%,100% { box-shadow: 0 0 12px var(--accent-primary-ring); }
  50%     { box-shadow: 0 0 22px rgba(212,175,55,.35); }
}

/* Drawer sections */
.dc-section {
  background: var(--bg-tertiary); border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 12px;
}
.dc-section-lbl {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--text-tertiary); margin-bottom: 10px;
}
.dc-kv { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 4px 0; font-size: 12px; }
.dc-kv-k { color: var(--text-tertiary); flex-shrink: 0; }
.dc-kv-v { color: var(--text-primary); text-align: right; word-break: break-all; font-family: var(--font-mono); font-size: 11.5px; }

/* NS copy box */
.dc-ns-box {
  background: var(--bg-primary); border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg); padding: 10px 14px; margin: 10px 0;
}
.dc-ns-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.dc-ns-row:last-child { border-bottom: none; }
.dc-ns-val { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-primary); flex: 1; }
.dc-copy-btn {
  padding: 3px 9px; border-radius: var(--radius-sm); font-size: 10.5px; font-weight: 700;
  background: var(--accent-primary-muted); color: var(--accent-primary); border: 1px solid var(--border-gold);
  cursor: pointer; transition: all var(--transition-fast);
}
.dc-copy-btn:hover { background: var(--accent-primary-ring); }
.dc-copy-btn.copied { background: var(--color-success-muted); color: var(--color-success); border-color: rgba(34,197,94,.2); }

/* Quick links */
.dc-qlinks { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.dc-qlink {
  display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px;
  border-radius: var(--radius-md); font-size: 11.5px; font-weight: 600; cursor: pointer;
  border: 1px solid; text-decoration: none; transition: all var(--transition-fast);
}
.dc-qlink.green  { background: var(--color-success-muted); color: var(--color-success); border-color: rgba(34,197,94,.2); }
.dc-qlink.green:hover { background: rgba(34,197,94,.18); }
.dc-qlink.orange { background: var(--color-warning-muted); color: var(--color-warning); border-color: rgba(245,158,11,.2); }
.dc-qlink.orange:hover { background: rgba(245,158,11,.18); }
.dc-qlink.gold   { background: var(--accent-primary-muted); color: var(--accent-primary); border-color: var(--border-gold); }
.dc-qlink.gold:hover { background: var(--accent-primary-ring); }

/* Audit row */
.dc-audit-row {
  padding: 8px 0; border-bottom: 1px solid var(--border-subtle); font-size: 11.5px;
  display: flex; align-items: flex-start; gap: 10px;
}
.dc-audit-row:last-child { border-bottom: none; }
.dc-audit-time { color: var(--text-tertiary); white-space: nowrap; flex-shrink: 0; font-size: 10.5px; }
.dc-audit-action { color: var(--accent-primary); font-weight: 600; }
.dc-audit-error { color: var(--color-danger); font-size: 10.5px; margin-top: 2px; }

/* Override controls */
.dc-override-row { display: flex; gap: 8px; margin-top: 0; }
.dc-override-sel {
  flex: 1; padding: 8px 10px; background: var(--bg-input);
  border: 1px solid var(--border-primary); border-radius: var(--radius-md);
  color: var(--text-primary); font-size: 12px; font-family: var(--font-sans);
}

/* Section header */
.dc-section-hdr {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--text-tertiary); margin: 28px 0 10px;
  display: flex; align-items: center; gap: 8px;
}
.dc-section-hdr::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }

/* Legacy table */
.dc-legacy-wrap .dc-table td { font-size: 12px; }

/* Linked page card */
.dc-link-card {
  border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 14px;
  border: 1px solid;
}
.dc-link-card.linked { background: var(--color-success-muted); border-color: rgba(34,197,94,.2); }
.dc-link-card.unlinked { background: var(--color-warning-muted); border-color: rgba(245,158,11,.2); }
.dc-link-card-lbl {
  font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 8px;
}

/* Details/summary */
details summary::-webkit-details-marker { display: none; }
details summary::marker { display: none; }
details[open] summary svg { transform: rotate(180deg); }
details summary svg { transition: transform .2s; }

/* Responsive */
@media (max-width: 768px) {
  .dc-drawer { width: 100vw; }
  .dc-stats { grid-template-columns: repeat(2, 1fr); }
  .dc-toolbar { flex-direction: column; align-items: stretch; }
  .dc-search { max-width: none; }
}
</style>`;
  }

  // ─── page skeleton ────────────────────────────────────────────────────────

  function render() {
    return `${styles()}
<div class="dc-pg">

  <!-- Header -->
  <div class="dc-header">
    <span class="dc-title">Domain Command Center</span>
    <span class="dc-live-badge" id="dc-live-badge">Auto-refresh</span>
    <div class="dc-header-actions">
      <button class="dc-btn secondary" id="dc-import-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
        Bulk Import
      </button>
      <button class="dc-btn secondary" id="dc-checkall-btn">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Check All
      </button>
      <button class="dc-btn secondary" id="dc-refresh-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
        Refresh
      </button>
      <button class="dc-btn gold" id="dc-connect-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Connect Domain
      </button>
    </div>
  </div>

  <!-- Stats Cards -->
  <div class="dc-stats" id="dc-stats"></div>

  <!-- CF Quota bar -->
  <div id="dc-cf-bar" style="display:none;"></div>

  <!-- Toolbar -->
  <div class="dc-toolbar">
    <input class="dc-search" id="dc-search" type="text" placeholder="Search domains…" autocomplete="off" spellcheck="false"/>
    <select class="dc-select" id="dc-filter-status">
      <option value="">All Statuses</option>
      <option value="pending_nameservers">Pending NS</option>
      <option value="nameservers_active">NS Active</option>
      <option value="vps_configured">VPS Configured</option>
      <option value="ssl_issued">SSL Issued</option>
      <option value="live">Live</option>
      <option value="error">Error</option>
      <option value="flagged">Flagged</option>
    </select>
    <select class="dc-select" id="dc-filter-uptime">
      <option value="">All Uptime</option>
      <option value="up">Up</option>
      <option value="down">Down</option>
      <option value="unknown">Unknown</option>
    </select>
    <select class="dc-select" id="dc-filter-website">
      <option value="">All Websites</option>
    </select>
    <select class="dc-select" id="dc-filter-linked">
      <option value="">Linked & Unlinked</option>
      <option value="linked">Linked to Page</option>
      <option value="unlinked">No Page Linked</option>
    </select>
    <select class="dc-select" id="dc-sort">
      <option value="created">Sort: Newest</option>
      <option value="domain">Sort: A → Z</option>
      <option value="status">Sort: Status</option>
      <option value="uptime">Sort: Uptime</option>
      <option value="checked">Sort: Last Checked</option>
    </select>
  </div>

  <!-- Batch actions bar -->
  <div class="dc-batch" id="dc-batch">
    <span class="dc-batch-count" id="dc-batch-count">0 selected</span>
    <button class="dc-btn secondary dc-btn-sm" id="dc-batch-clear">Clear</button>
    <div class="dc-batch-actions">
      <button class="dc-btn success dc-btn-sm" id="dc-batch-recheck">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
        Recheck Selected
      </button>
      <button class="dc-btn danger dc-btn-sm" id="dc-batch-delete">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        Delete Selected
      </button>
    </div>
  </div>

  <!-- Domains table -->
  <div class="dc-table-wrap">
    <table class="dc-table">
      <thead>
        <tr>
          <th style="width:32px;"><input type="checkbox" class="dc-check" id="dc-select-all"/></th>
          <th class="sortable" data-sort="domain">Domain</th>
          <th>Pipeline</th>
          <th class="sortable" data-sort="uptime">Uptime</th>
          <th>Flag</th>
          <th>Website</th>
          <th class="sortable" data-sort="checked">Checked</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="dc-tbody">
        <tr><td colspan="8" class="dc-empty"><div class="dc-empty-icon">🌐</div><p>Loading domains…</p></td></tr>
      </tbody>
    </table>
  </div>

  <!-- Legacy website domains -->
  <details id="dc-legacy-details" style="margin-top: 28px;">
    <summary class="dc-section-hdr" style="cursor:pointer;list-style:none;user-select:none;">
      <span>Legacy Website Domains</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:4px;"><polyline points="6 9 12 15 18 9"/></svg>
    </summary>
    <div class="dc-legacy-wrap" id="dc-legacy-wrap" style="margin-top:10px;"></div>
  </details>

</div>

<!-- Drawer is appended to document.body dynamically -->`;
  }

  // ─── Stats Cards ────────────────────────────────────────────────────────

  function renderStats() {
    const el = document.getElementById('dc-stats');
    if (!el) return;

    const total    = _domains.length;
    const live     = _domains.filter(d => d.status === 'live').length;
    const ssl      = _domains.filter(d => d.status === 'ssl_issued' || d.status === 'live').length;
    const pending  = _domains.filter(d => d.status === 'pending_nameservers').length;
    const errors   = _domains.filter(d => d.status === 'error').length;
    const flagged  = _domains.filter(d => d.flagged).length;
    const down     = _domains.filter(d => d.uptime_ok === 0).length;
    const cfCount  = _quota?.configured ? (_quota.count ?? '?') : '—';
    const cfLimit  = _quota?.limit ? ` / ${_quota.limit}` : '';

    el.innerHTML = `
      <div class="dc-stat" style="--stat-accent: var(--accent-primary);">
        <div class="dc-stat-val">${total}</div>
        <div class="dc-stat-lbl">Total Domains</div>
        <div class="dc-stat-sub">${pending} pending · ${errors} errors</div>
      </div>
      <div class="dc-stat" style="--stat-accent: var(--color-success);">
        <div class="dc-stat-val">${live}</div>
        <div class="dc-stat-lbl">Live</div>
        <div class="dc-stat-sub">${ssl} with SSL</div>
      </div>
      <div class="dc-stat" style="--stat-accent: ${down > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
        <div class="dc-stat-val">${down}</div>
        <div class="dc-stat-lbl">Down</div>
        <div class="dc-stat-sub">${down > 0 ? 'Requires attention' : 'All healthy'}</div>
      </div>
      <div class="dc-stat" style="--stat-accent: ${flagged > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
        <div class="dc-stat-val">${flagged}</div>
        <div class="dc-stat-lbl">Flagged</div>
        <div class="dc-stat-sub">${flagged > 0 ? 'Action required!' : 'All clean'}</div>
      </div>
      <div class="dc-stat" style="--stat-accent: var(--color-info);">
        <div class="dc-stat-val">${cfCount}</div>
        <div class="dc-stat-lbl">CF Zones</div>
        <div class="dc-stat-sub">${_quota?.configured ? `Limit${cfLimit}` : 'Not configured'}</div>
      </div>
      <div class="dc-stat" style="--stat-accent: var(--color-warning);">
        <div class="dc-stat-val">${_domains.filter(d => !d.website_id).length}</div>
        <div class="dc-stat-lbl">Unlinked</div>
        <div class="dc-stat-sub">${_domains.filter(d => d.website_id).length} linked to pages</div>
      </div>`;

    populateWebsiteFilter();
  }

  function populateWebsiteFilter() {
    const sel = document.getElementById('dc-filter-website');
    if (!sel) return;
    const prev = sel.value;
    const websiteIds = [...new Set(_domains.filter(d => d.website_id).map(d => d.website_id))];
    const opts = websiteIds.map(wid => {
      const page = _scamPages.find(w => w.id === wid);
      const name = page ? page.name : `Website #${wid}`;
      const count = _domains.filter(d => d.website_id === wid).length;
      return `<option value="${wid}">${esc(name)} (${count})</option>`;
    });
    sel.innerHTML = `<option value="">All Websites</option>${opts.join('')}`;
    if (prev) sel.value = prev;
  }

  // ─── CF Quota bar ──────────────────────────────────────────────────────

  function renderQuotaBar() {
    const bar = document.getElementById('dc-cf-bar');
    if (!bar) return;
    if (!_quota || _quota.configured) { bar.style.display = 'none'; return; }
    bar.className = 'dc-cf-bar warn';
    bar.style.display = 'flex';
    bar.innerHTML = `<span style="color:var(--color-warning);">⚠</span>
      <span class="dc-cf-label"><strong>CLOUDFLARE_API_TOKEN</strong> not set — domain provisioning disabled</span>`;
  }

  // ─── Main Table ──────────────────────────────────────────────────────────

  function renderTable() {
    const tbody = document.getElementById('dc-tbody');
    if (!tbody) return;

    const filtered = getFiltered();

    if (!filtered.length) {
      const msg = _domains.length ? 'No domains match your filters.' : 'No managed domains yet.';
      const sub = _domains.length ? 'Try adjusting your search or filters.' : 'Click <strong>Connect Domain</strong> to get started.';
      tbody.innerHTML = `<tr><td colspan="8" class="dc-empty">
        <div class="dc-empty-icon">🌐</div>
        <p>${msg}<br>${sub}</p>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(d => {
      const checked = _selected.has(String(d.id));
      const pipeline = renderPipeline(d);
      const isLive = d.status === 'live' || d.status === 'ssl_issued';

      let uptime = `<span class="dc-uptime unknown">—</span>`;
      if (d.uptime_ok === 1) uptime = `<span class="dc-uptime up">Up</span>`;
      if (d.uptime_ok === 0) uptime = `<span class="dc-uptime down">Down</span>`;

      let flagHtml;
      if (!isLive && !d.flagged) {
        flagHtml = `<span style="color:var(--text-muted);">—</span>`;
      } else if (d.flagged) {
        flagHtml = `<span class="dc-flag-alert" title="${esc(d.flag_reason || '')}">⚠ Flagged</span>`;
      } else {
        flagHtml = `<span class="dc-flag-clean">✓ Clean</span>`;
      }

      const tags = [];
      if (d.manual_override) tags.push(`<span class="dc-tag dc-tag-manual">Manual</span>`);
      if (d.flagged) tags.push(`<span class="dc-tag dc-tag-flagged">Flagged</span>`);

      const visitBtn = isLive
        ? `<a class="dc-act visit" href="https://${esc(d.domain)}" target="_blank" rel="noopener" title="Open in browser">↗</a>`
        : '';

      const rowCls = [
        checked ? 'selected' : '',
        d.flagged ? 'row-flagged' : d.uptime_ok === 1 ? 'row-up' : d.uptime_ok === 0 ? 'row-down' : '',
      ].filter(Boolean).join(' ');

      return `<tr class="${rowCls}" data-id="${d.id}">
        <td><input type="checkbox" class="dc-check dc-row-check" data-id="${d.id}" ${checked ? 'checked' : ''}/></td>
        <td>
          <div class="dc-domain-name">
            ${esc(d.domain)}
            ${tags.join('')}
          </div>
          ${d.error_message && d.status === 'error' ? `<div class="dc-domain-meta" style="color:var(--color-danger);">${esc(d.error_message.slice(0, 80))}${d.error_message.length > 80 ? '…' : ''}</div>` : ''}
          ${d.status === 'pending_nameservers' ? `<div class="dc-domain-meta">Update nameservers at your registrar</div>` : ''}
        </td>
        <td>${pipeline}</td>
        <td>${uptime}</td>
        <td>${flagHtml}</td>
        <td>${(() => {
          const linked = _scamPages.find(w => w.id === d.website_id);
          return linked
            ? `<span style="font-size:11px;color:var(--text-primary);font-weight:600;display:inline-flex;align-items:center;gap:5px;"><span style="width:6px;height:6px;border-radius:50%;background:${esc(linked.color || 'var(--accent-primary)')};flex-shrink:0;"></span>${esc(linked.name)}</span>`
            : `<span style="font-size:11px;color:var(--text-muted);">—</span>`;
        })()}</td>
        <td style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;">${fmtAgo(d.last_checked_at)}</td>
        <td>
          <div class="dc-actions">
            ${visitBtn}
            <button class="dc-act view" data-id="${d.id}" title="View details">Details</button>
            <button class="dc-act check" data-id="${d.id}" data-action="recheck" title="Force recheck">↻</button>
            <button class="dc-act del" data-id="${d.id}" data-action="delete" title="Delete">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    wireTableButtons(tbody);
    updateBatchBar();
    updateSelectAllState();
  }

  function wireTableButtons(tbody) {
    tbody.querySelectorAll('.dc-act.view').forEach(btn => {
      btn.addEventListener('click', () => openDrawer(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="recheck"]').forEach(btn => {
      btn.addEventListener('click', () => recheckDomain(btn.dataset.id, btn));
    });
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
    });
    tbody.querySelectorAll('.dc-row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) _selected.add(id); else _selected.delete(id);
        const row = cb.closest('tr');
        if (row) row.classList.toggle('selected', cb.checked);
        updateBatchBar();
        updateSelectAllState();
      });
    });
  }

  function renderPipeline(d) {
    if (d.status === 'error') {
      return `<div class="dc-pipeline">
        <span class="dc-pipe-step error">✕ ${esc(d.error_message ? d.error_message.slice(0, 30) + (d.error_message.length > 30 ? '…' : '') : 'Error')}</span>
      </div>`;
    }
    const cur = stepIndex(d.status);
    return `<div class="dc-pipeline">
      ${PIPELINE_STEPS.map((s, i) => {
        const cls = i < cur ? 'done' : i === cur ? 'active' : 'future';
        const sep = i < PIPELINE_STEPS.length - 1 ? '<span class="dc-pipe-sep">›</span>' : '';
        return `<span class="dc-pipe-step ${cls}">${esc(s.label)}</span>${sep}`;
      }).join('')}
    </div>`;
  }

  // ─── Batch actions ────────────────────────────────────────────────────────

  function updateBatchBar() {
    const bar = document.getElementById('dc-batch');
    const countEl = document.getElementById('dc-batch-count');
    if (!bar || !countEl) return;
    if (_selected.size > 0) {
      bar.classList.add('show');
      countEl.textContent = `${_selected.size} selected`;
    } else {
      bar.classList.remove('show');
    }
  }

  function updateSelectAllState() {
    const cb = document.getElementById('dc-select-all');
    if (!cb) return;
    const filtered = getFiltered();
    if (!filtered.length) { cb.checked = false; cb.indeterminate = false; return; }
    const allChecked = filtered.every(d => _selected.has(String(d.id)));
    const someChecked = filtered.some(d => _selected.has(String(d.id)));
    cb.checked = allChecked;
    cb.indeterminate = someChecked && !allChecked;
  }

  async function batchRecheck() {
    const ids = [..._selected];
    if (!ids.length) return;
    let done = 0;
    for (const id of ids) {
      try { await window.ALPApi.recheckDomain(id); done++; } catch {}
    }
    window.showToast(`Recheck started for ${done} domain${done === 1 ? '' : 's'}`, 'success');
    _selected.clear();
    setTimeout(async () => { await loadManaged(); renderTable(); renderStats(); }, 4000);
  }

  function batchDelete() {
    const ids = [..._selected];
    if (!ids.length) return;
    const names = ids.map(id => {
      const d = _domains.find(x => String(x.id) === id);
      return d ? d.domain : id;
    });
    const confirmWord = 'DELETE';
    window.showModal({
      title: 'Delete Multiple Domains',
      type: 'danger',
      content: `
<div style="text-align:center;padding:6px 0;">
  <div style="width:44px;height:44px;border-radius:50%;background:var(--color-danger-muted);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px;">🗑</div>
  <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Delete ${ids.length} domain${ids.length === 1 ? '' : 's'}?</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;max-height:120px;overflow-y:auto;">
    ${names.map(n => `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary);">${esc(n)}</div>`).join('')}
  </div>
  <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">This will remove CF zones, VPS nginx configs, and panel records. Cannot be undone.</div>
  <div style="margin-top:14px;text-align:left;">
    <label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:.05em;margin-bottom:6px;">TYPE <strong style="color:var(--color-danger);">${confirmWord}</strong> TO CONFIRM</label>
    <input type="text" id="dc-batch-confirm" placeholder="${confirmWord}" autocomplete="off" spellcheck="false"
      style="width:100%;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border-primary);
      border-radius:var(--radius-md);color:var(--text-primary);font-size:13px;font-family:var(--font-mono);box-sizing:border-box;"/>
  </div>
</div>`,
      confirmText: 'Delete All',
      onConfirm: async () => {
        const typed = (document.getElementById('dc-batch-confirm')?.value || '').trim().toUpperCase();
        if (typed !== confirmWord) {
          window.showToast('Confirmation does not match — deletion cancelled', 'error');
          throw new Error('keep-modal');
        }
        let ok = 0, fail = 0;
        for (const id of ids) {
          try { await window.ALPApi.deleteManagedDomain(id); ok++; } catch { fail++; }
        }
        _selected.clear();
        window.showToast(`${ok} deleted${fail ? `, ${fail} failed` : ''}`, ok ? 'success' : 'error');
        await loadAll();
      },
    });
  }

  // ─── Detail Drawer ──────────────────────────────────────────────────────

  function _ensureDrawerInBody() {
    let overlay = document.getElementById('dc-drawer-overlay');
    let drawer  = document.getElementById('dc-drawer');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dc-drawer-overlay';
      overlay.className = 'dc-drawer-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', closeDrawer);
    } else if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'dc-drawer';
      drawer.className = 'dc-drawer';
      document.body.appendChild(drawer);
    } else if (drawer.parentElement !== document.body) {
      document.body.appendChild(drawer);
    }
    return { overlay, drawer };
  }

  function openDrawer(id) {
    _drawerDomainId = id;
    _drawerTab = 'overview';
    const { overlay, drawer } = _ensureDrawerInBody();
    renderDrawer();
    setTimeout(() => {
      overlay.classList.add('open');
      drawer.classList.add('open');
    }, 10);
  }

  function closeDrawer() {
    document.getElementById('dc-drawer-overlay')?.classList.remove('open');
    document.getElementById('dc-drawer')?.classList.remove('open');
    setTimeout(() => { _drawerDomainId = null; }, 300);
  }

  function renderDrawer() {
    _ensureDrawerInBody();
    const drawer = document.getElementById('dc-drawer');
    if (!drawer || !_drawerDomainId) return;

    const domain = _domains.find(d => String(d.id) === String(_drawerDomainId));
    if (!domain) { closeDrawer(); return; }

    const meta = STATUS_META[domain.status] || STATUS_META.error;

    drawer.innerHTML = `
      <div class="dc-drawer-hdr">
        <div class="dc-drawer-title">${esc(domain.domain)}</div>
        <span class="dc-status-badge" style="background:${meta.bg};color:${meta.color};border:1px solid;flex-shrink:0;">${meta.icon} ${meta.label}</span>
        <button class="dc-drawer-close" id="dc-drawer-close-btn">✕</button>
      </div>

      <div class="dc-tabs" id="dc-drawer-tabs">
        <button class="dc-tab ${_drawerTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
        <button class="dc-tab ${_drawerTab === 'dns' ? 'active' : ''}" data-tab="dns">DNS & SSL</button>
        <button class="dc-tab ${_drawerTab === 'audit' ? 'active' : ''}" data-tab="audit">Audit Log</button>
      </div>

      <div class="dc-drawer-body" id="dc-drawer-content"></div>`;

    document.getElementById('dc-drawer-close-btn')?.addEventListener('click', closeDrawer);

    drawer.querySelectorAll('.dc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _drawerTab = tab.dataset.tab;
        drawer.querySelectorAll('.dc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _drawerTab));
        renderDrawerContent(domain);
      });
    });

    renderDrawerContent(domain);
  }

  function renderDrawerContent(domain) {
    const el = document.getElementById('dc-drawer-content');
    if (!el) return;

    switch (_drawerTab) {
      case 'overview': return renderDrawerOverview(el, domain);
      case 'dns':      return renderDrawerDns(el, domain);
      case 'audit':    return renderDrawerAudit(el, domain);
    }
  }

  function renderDrawerOverview(el, domain) {
    const ns = parseNs(domain);
    const linkedPage = _scamPages.find(w => String(w.id) === String(domain.website_id));
    const isLiveOrSsl = domain.status === 'live' || domain.status === 'ssl_issued';
    const id = domain.id;

    el.innerHTML = `
      <!-- Pipeline stepper -->
      ${renderDetailPipeline(domain)}

      <!-- Quick links -->
      <div class="dc-qlinks">
        ${isLiveOrSsl ? `<a class="dc-qlink green" href="https://${esc(domain.domain)}" target="_blank" rel="noopener">↗ Visit Site</a>` : ''}
        ${domain.cf_zone_id ? `<a class="dc-qlink orange" href="https://dash.cloudflare.com/zones/${esc(domain.cf_zone_id)}" target="_blank" rel="noopener">☁ Cloudflare</a>` : ''}
        ${linkedPage && linkedPage.vps_host
          ? `<span class="dc-qlink gold" title="Website VPS">🖥 VPS ${esc(linkedPage.vps_host)}</span>`
          : `<span class="dc-qlink gold">🖥 VPS</span>`}
      </div>

      ${domain.flagged ? `
      <div class="dc-section" style="background:var(--color-danger-muted);border-color:rgba(239,68,68,.25);">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:16px;flex-shrink:0;">⚠</span>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--color-danger);margin-bottom:2px;">Domain Flagged</div>
            <div style="font-size:11px;color:var(--color-danger-hover);line-height:1.5;">${esc(domain.flag_reason || 'Suspicious content')} · ${fmtTime(domain.flag_detected_at)}</div>
          </div>
        </div>
      </div>` : ''}

      <!-- Linked page -->
      <div class="dc-link-card ${linkedPage ? 'linked' : 'unlinked'}">
        <div class="dc-link-card-lbl" style="color:${linkedPage ? 'var(--color-success)' : 'var(--color-warning)'};">
          ${linkedPage
            ? `✓ Linked — ${esc(linkedPage.name)}`
            : '⚠ No page linked — will 404 when live'}
        </div>
        <div id="dc-website-sel-container" style="margin-bottom:8px;"></div>
        <button class="dc-btn secondary dc-btn-sm" id="dc-save-website-btn" style="width:100%;justify-content:center;">Update Link</button>
      </div>

      ${ns.length ? `
      <div class="dc-section">
        <div class="dc-section-lbl">Nameservers — set at your registrar</div>
        ${nsBoxHtml(ns)}
      </div>` : ''}

      ${domain.error_message ? `
      <div class="dc-section" style="background:var(--color-danger-muted);border-color:rgba(239,68,68,.2);">
        <div style="font-size:12px;color:var(--color-danger);line-height:1.5;">
          <strong>Error:</strong> ${esc(domain.error_message)}
        </div>
      </div>` : ''}

      <!-- Info grid -->
      <div class="dc-section">
        <div class="dc-section-lbl">Domain Info</div>
        <div class="dc-kv"><span class="dc-kv-k">DNS Provider</span><span class="dc-kv-v">${esc(domain.dns_provider || '—')}</span></div>
        <div class="dc-kv"><span class="dc-kv-k">Hosting</span><span class="dc-kv-v">${esc(domain.hosting_provider || '—')}</span></div>
        <div class="dc-kv"><span class="dc-kv-k">Created</span><span class="dc-kv-v">${fmtTime(domain.created_at)}</span></div>
        <div class="dc-kv"><span class="dc-kv-k">Last Checked</span><span class="dc-kv-v">${fmtAgo(domain.last_checked_at)}</span></div>
        <div class="dc-kv"><span class="dc-kv-k">Uptime</span><span class="dc-kv-v" style="color:${domain.uptime_ok === 1 ? 'var(--color-success)' : domain.uptime_ok === 0 ? 'var(--color-danger)' : 'var(--text-muted)'};">${domain.uptime_ok === 1 ? '↑ Up' : domain.uptime_ok === 0 ? '↓ Down' : '—'} · ${fmtTime(domain.last_uptime_check_at)}</span></div>
        ${domain.manual_override ? `<div class="dc-kv"><span class="dc-kv-k">Manual Override</span><span class="dc-kv-v" style="color:var(--color-warning);">${esc(domain.manual_override_note || 'Yes')}</span></div>` : ''}
      </div>

      <!-- Quick actions -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="dc-btn success dc-btn-sm" id="dc-drawer-recheck" style="flex:1;justify-content:center;">↻ Recheck Now</button>
        <button class="dc-btn danger dc-btn-sm" id="dc-drawer-delete" style="flex:1;justify-content:center;">✕ Delete Domain</button>
      </div>`;

    setTimeout(() => {
      wireNsCopy(el);

      if (window.ALPWebsiteSelect) {
        window.ALPWebsiteSelect.create({
          containerId:   'dc-website-sel-container',
          hiddenInputId: 'dc-website-sel',
          websites:      _scamPages,
          placeholder:   'None — unlink',
          selectedValue: domain.website_id ? String(domain.website_id) : '',
          fullWidth:     true,
        });
      }

      document.getElementById('dc-save-website-btn')?.addEventListener('click', async () => {
        const sel = document.getElementById('dc-website-sel');
        const websiteId = sel?.value ? Number(sel.value) : null;
        try {
          await window.ALPApi.setDomainWebsite(id, websiteId);
          const page = _scamPages.find(w => w.id === websiteId);
          window.showToast(page ? `Linked to "${page.name}"` : 'Page unlinked', 'success');
          await loadAll();
          renderDrawer();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });

      document.getElementById('dc-drawer-recheck')?.addEventListener('click', () => recheckDomain(id));
      document.getElementById('dc-drawer-delete')?.addEventListener('click', () => confirmDelete(id));
    }, 60);
  }

  function renderDrawerDns(el, domain) {
    const dns = parseDns(domain);
    const id = domain.id;

    el.innerHTML = `
      <div style="padding-top:16px;">

      ${dns.length ? `
      <div class="dc-section">
        <div class="dc-section-lbl">DNS Records</div>
        ${dns.map(r => `
          <div class="dc-kv">
            <span class="dc-kv-k"><span style="background:var(--accent-primary-muted);color:var(--accent-primary);padding:1px 6px;border-radius:var(--radius-xs);font-size:10px;font-weight:700;">${esc(r.type)}</span> ${esc(r.name || '@')}</span>
            <span class="dc-kv-v">${esc(r.content)}</span>
          </div>`).join('')}
      </div>` : `
      <div class="dc-section">
        <div class="dc-section-lbl">DNS Records</div>
        <div style="font-size:12px;color:var(--text-muted);">No DNS records stored yet.</div>
      </div>`}

      <div class="dc-section">
        <div class="dc-section-lbl">SSL & Hosting</div>
        <div class="dc-kv"><span class="dc-kv-k">SSL Status</span><span class="dc-kv-v" style="color:${domain.ssl_status === 'active' ? 'var(--color-success)' : 'var(--text-muted)'};">${domain.ssl_status || 'Pending'}</span></div>
        <div class="dc-kv"><span class="dc-kv-k">CF Zone ID</span><span class="dc-kv-v">${esc(domain.cf_zone_id || '—')}</span></div>
      </div>

      <!-- Force pipeline -->
      <div class="dc-section">
        <div class="dc-section-lbl">Force Pipeline Stage</div>
        <div class="dc-override-row">
          <select class="dc-override-sel" id="dc-override-sel">
            <option value="">— select —</option>
            <option value="pending_nameservers">pending_nameservers</option>
            <option value="nameservers_active">nameservers_active</option>
            <option value="vps_configured">vps_configured</option>
            <option value="ssl_issued">ssl_issued</option>
            <option value="live">live</option>
            <option value="error">error</option>
          </select>
          <button class="dc-btn secondary dc-btn-sm" id="dc-override-btn">Apply</button>
        </div>
      </div>

      </div>`;

    setTimeout(() => {
      document.getElementById('dc-override-btn')?.addEventListener('click', async () => {
        const sel = document.getElementById('dc-override-sel');
        const status = sel?.value;
        if (!status) return;
        try {
          await window.ALPApi.overrideDomainStatus(id, status, '');
          window.showToast(`Status overridden to ${status}`, 'success');
          await loadAll();
          renderDrawer();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }, 60);
  }

  async function renderDrawerAudit(el, domain) {
    el.innerHTML = `<div style="padding-top:16px;"><div style="font-size:12px;color:var(--text-tertiary);">Loading audit log…</div></div>`;

    try {
      const { logs } = await window.ALPApi.getDomainAudit(domain.id);
      if (_drawerTab !== 'audit') return;

      if (!logs || !logs.length) {
        el.innerHTML = `<div style="padding-top:16px;"><div style="color:var(--text-tertiary);font-size:12px;">No audit events yet.</div></div>`;
        return;
      }

      el.innerHTML = `<div style="padding-top:16px;">
        <div class="dc-section">
          <div class="dc-section-lbl">Activity Log (${logs.length} events)</div>
          ${logs.map(l => {
            let details = '';
            if (l.details) {
              try {
                const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
                const keys = Object.keys(d).slice(0, 3);
                if (keys.length) details = `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${keys.map(k => `${esc(k)}: ${esc(String(d[k]).slice(0, 60))}`).join(' · ')}</div>`;
              } catch {}
            }
            return `<div class="dc-audit-row">
              <span class="dc-audit-time">${fmtTime(l.created_at)}</span>
              <div style="flex:1;min-width:0;">
                <span class="dc-audit-action">${esc(l.action)}</span>
                ${l.error ? `<div class="dc-audit-error">${esc(l.error)}</div>` : ''}
                ${details}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } catch {
      el.innerHTML = `<div style="padding-top:16px;"><div style="color:var(--color-danger);font-size:12px;">Failed to load audit log.</div></div>`;
    }
  }

  function renderDetailPipeline(d) {
    if (d.status === 'error') {
      return `<div class="dc-stepper">
        <div class="dc-step error">
          <div class="dc-step-dot">✕</div>
          <div class="dc-step-label">Error</div>
        </div>
      </div>`;
    }
    const cur = stepIndex(d.status);
    return `<div class="dc-stepper">
      ${PIPELINE_STEPS.map((s, i) => {
        const cls = i < cur ? 'done' : i === cur ? 'active' : 'future';
        const icon = i < cur ? '✓' : s.icon;
        const line = i < PIPELINE_STEPS.length - 1
          ? `<div class="dc-step-line ${i < cur ? 'done' : i === cur ? 'active' : 'future'}"></div>`
          : '';
        return `<div class="dc-step ${cls}">
          <div class="dc-step-dot">${icon}</div>
          <div class="dc-step-label">${esc(s.label)}</div>
        </div>${line}`;
      }).join('')}
    </div>`;
  }

  // ─── Legacy website domains ───────────────────────────────────────────────

  function renderLegacy() {
    const wrap = document.getElementById('dc-legacy-wrap');
    if (!wrap) return;

    // Any domain that already lives in the managed table should NOT show here —
    // it's been adopted and gets its actions from the Managed table above.
    const managedSet = new Set(_domains.map(d => (d.domain || '').toLowerCase()));

    const rows = [];
    for (const w of _websites) {
      if (w.domain && w.domain !== 'localhost' && !w.domain.startsWith('auto-') && !managedSet.has(w.domain.toLowerCase())) {
        rows.push({ site: w.name, siteId: w.id, color: w.color || '#6366f1', domain: w.domain.toLowerCase(), active: w.domain_active !== 0, isPrimary: true });
      }
      const alt = Array.isArray(w.domain_alt) ? w.domain_alt : (w.domain_alt ? tryParseArr(w.domain_alt) : []);
      alt.forEach(a => {
        const d = (a.domain || '').trim().toLowerCase();
        if (d && !managedSet.has(d)) rows.push({ site: w.name, siteId: w.id, color: w.color || '#6366f1', domain: d, active: !!a.active, isPrimary: false });
      });
    }

    if (!rows.length) {
      wrap.innerHTML = `<div class="dc-empty" style="padding:28px 20px;"><p>No legacy website domains configured.</p></div>`;
      return;
    }

    wrap.innerHTML = `
    <div class="dc-table-wrap">
      <table class="dc-table">
        <thead><tr><th>Website</th><th>Domain</th><th>Status</th><th>Railway</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const rd = _railwayDoms.find(x => x.domain === r.domain || x.domain === `www.${r.domain}`);
            const dnsOk = rd
              ? (rd.syncStatus === 'ACTIVE' ||
                 (rd.status?.dnsRecords || []).every(x =>
                   x.status === 'DNS_RECORD_STATUS_PROPAGATED' || x.status === 'VALID'))
              : false;
            const ryBadge = !_railwayCfg
              ? `<span style="font-size:11px;color:var(--text-tertiary);">—</span>`
              : rd
                ? dnsOk
                  ? `<span style="font-size:11px;color:var(--color-success);">✓ DNS OK</span>`
                  : `<span style="font-size:11px;color:var(--color-warning);">⏳ Pending</span>`
                : `<span style="font-size:11px;color:var(--text-muted);">—</span>`;
            const migrateBtn = `<button class="dc-btn secondary dc-btn-sm"
                onclick="DomainsPage._adoptLegacy(${r.siteId}, '${esc(r.domain)}')"
                title="Move to Managed table so you can delete, recheck, or re-provision it">
                → Migrate to Managed
              </button>`;
            const delBtn = rd
              ? `<button class="dc-btn danger dc-btn-sm"
                   onclick="DomainsPage._deleteLegacyRailway('${esc(rd.id)}','${esc(r.domain)}')"
                   style="margin-left:6px;">
                   Remove from Railway
                 </button>`
              : '';
            return `<tr>
              <td><span style="display:inline-flex;align-items:center;gap:7px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${esc(r.color)};flex-shrink:0;"></span>
                <span style="font-size:12px;font-weight:600;color:var(--text-primary);">${esc(r.site)}</span>
              </span></td>
              <td>
                <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);font-weight:600;">${esc(r.domain)}</span>
                ${r.isPrimary ? '<span style="font-size:8.5px;padding:1px 6px;background:var(--accent-primary-muted);color:var(--accent-primary);border-radius:var(--radius-pill);margin-left:5px;font-weight:700;">PRIMARY</span>' : ''}
              </td>
              <td><span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${r.active ? 'var(--color-success)' : 'var(--text-tertiary)'};">
                <span style="width:6px;height:6px;border-radius:50%;background:${r.active ? 'var(--color-success)' : 'var(--text-muted)'};"></span>
                ${r.active ? 'Active' : 'Inactive'}
              </span></td>
              <td>${ryBadge}</td>
              <td style="text-align:right;">${migrateBtn}${delBtn}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function tryParseArr(raw) {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }

  // ─── NS copy helpers ──────────────────────────────────────────────────────

  function nsBoxHtml(nameservers) {
    return `<div class="dc-ns-box">${nameservers.map(ns =>
      `<div class="dc-ns-row">
        <span class="dc-ns-val">${esc(ns)}</span>
        <button class="dc-copy-btn" data-ns="${esc(ns)}">Copy</button>
      </div>`
    ).join('')}</div>`;
  }

  function wireNsCopy(container) {
    if (!container) return;
    container.querySelectorAll('.dc-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.ns;
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const el = document.createElement('textarea');
          el.value = text;
          el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
        }
        btn.textContent = 'Copied!';
        btn.className = 'dc-copy-btn copied';
        setTimeout(() => { btn.textContent = 'Copy'; btn.className = 'dc-copy-btn'; }, 2000);
      });
    });
  }

  // ─── Connect Domain modal ─────────────────────────────────────────────────

  function openConnectModal() {
    const content = `
<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.6;">
  Choose a site, enter your domain below, then click <strong style="color:var(--text-primary);">Create Zone</strong> — we'll handle the rest.
</div>
<label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:.05em;margin-bottom:6px;">LINK TO PAGE <span style="font-weight:400;color:var(--text-muted);">(opens when domain is live)</span></label>
<div id="dc-new-website-container" style="margin-bottom:8px;"></div>
<div id="dc-hosting-hint" style="margin-bottom:14px;font-size:11px;line-height:1.5;color:var(--text-muted);min-height:16px;"></div>
<label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:.05em;margin-bottom:6px;">DOMAIN NAME</label>
<input type="text" id="dc-new-domain" placeholder="example.com"
  style="width:100%;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border-primary);
  border-radius:var(--radius-md);color:var(--text-primary);font-size:13px;font-family:var(--font-mono);box-sizing:border-box;"
  autocomplete="off" spellcheck="false"/>
<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Root domain only — no www, no https://</div>
<div id="dc-connect-error" style="display:none;background:var(--color-danger-muted);border:1px solid rgba(239,68,68,.25);border-radius:var(--radius-md);padding:8px 12px;margin-top:10px;font-size:12px;color:var(--color-danger);line-height:1.5;"></div>
<div id="dc-ns-result" style="display:none;margin-top:14px;"></div>`;

    let zoneCreated = false;

    window.showModal({
      title: '🌐 Connect a Domain',
      content,
      confirmText: 'Create Zone',
      cancelText: 'Cancel',
      width: '520px',
      closeOnBackdrop: false,
      onConfirm: async () => {
        if (zoneCreated) return;

        const input     = document.getElementById('dc-new-domain');
        const wHidden   = document.getElementById('dc-new-website');
        const domain    = (input?.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        const websiteId = wHidden?.value ? Number(wHidden.value) : null;
        if (!domain || !domain.includes('.')) {
          window.showToast('Enter a valid domain name (e.g. example.com)', 'error');
          throw new Error('keep-modal');
        }
        try {
          const result = await window.ALPApi.addDomain(domain, websiteId);
          if (result.resumed) {
            window.showToast(`${domain} already exists — resuming from ${result.domain.status}`, 'info');
          } else {
            window.showToast(`Zone created for ${domain}`, 'success');
          }

          const nsBox = document.getElementById('dc-ns-result');
          const ns = Array.isArray(result.domain.nameservers) ? result.domain.nameservers : [];
          if (nsBox && ns.length) {
            nsBox.style.display = 'block';
            nsBox.innerHTML = `
<div style="padding-top:14px;border-top:1px solid var(--border-primary);">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
    <div style="width:28px;height:28px;border-radius:50%;background:var(--color-success-muted);color:var(--color-success);font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;">✓</div>
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:1px;">Zone created</div>
      <div style="font-size:11.5px;color:var(--text-secondary);">Set these nameservers at your registrar:</div>
    </div>
  </div>
  ${nsBoxHtml(ns)}
  <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.6;">Pipeline updates automatically. Click <strong style="color:var(--text-primary);">Done</strong> when you've updated your registrar.</div>
</div>`;
            wireNsCopy(nsBox);
          }

          await loadManaged();
          renderTable();
          renderStats();

          zoneCreated = true;
          const confirmBtn = document.querySelector('.alp-mc');
          if (confirmBtn) {
            confirmBtn.textContent = 'Done';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
          }
          throw new Error('keep-modal');
        } catch (err) {
          if (err.message === 'keep-modal') throw err;
          const errDiv = document.getElementById('dc-connect-error');
          if (errDiv) {
            const msg = /zone\.create|permission/i.test(err.message)
              ? 'Cloudflare API token is missing zone-creation permission. Add Zone:Edit to your token in the Cloudflare dashboard.'
              : err.message;
            errDiv.textContent = msg;
            errDiv.style.display = 'block';
          } else {
            window.showToast(err.message, 'error');
          }
          throw err;
        }
      },
    });

    setTimeout(() => {
      const domainInput = document.getElementById('dc-new-domain');
      domainInput?.focus();
      domainInput?.addEventListener('input', () => {
        const errDiv = document.getElementById('dc-connect-error');
        if (errDiv) errDiv.style.display = 'none';
      });
      const updateHostingHint = (websiteId) => {
        const hint = document.getElementById('dc-hosting-hint');
        if (!hint) return;
        if (!websiteId) {
          hint.innerHTML = '<span style="color:#fbbf24;">⚠ Select a website to host this domain on a VPS.</span>';
          return;
        }
        const w = _scamPages.find(p => String(p.id) === String(websiteId));
        if (!w) { hint.innerHTML = ''; return; }
        if (w.vps_host) {
          hint.innerHTML = `<span style="color:#2dd4bf;">✓ Will host on VPS <code style="color:#2dd4bf;background:rgba(20,184,166,.08);padding:1px 5px;border-radius:4px;font-family:var(--font-mono);font-size:10.5px;">${esc(w.vps_host)}</code> — nginx site + SSL cert auto-provisioned when nameservers go active.</span>`;
        } else {
          hint.innerHTML = `<span style="color:#fbbf24;">⚠ This website has no VPS configured. Open the site's <strong>Host</strong> wizard first to enable VPS hosting.</span>`;
        }
      };

      if (window.ALPWebsiteSelect) {
        window.ALPWebsiteSelect.create({
          containerId:      'dc-new-website-container',
          hiddenInputId:    'dc-new-website',
          websites:         _scamPages,
          placeholder:      'Choose site to link',
          fullWidth:        true,
          fixedBelow:       true,
          showHostingBadge: true,
          onChange:         updateHostingHint,
        });
      }
      updateHostingHint('');
    }, 80);
  }

  // ─── Bulk import modal ────────────────────────────────────────────────────

  function openImportModal() {
    window.showModal({
      title: 'Bulk Import Domains',
      content: `
<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">One domain per line, max 50. A Cloudflare zone is created for each.</div>
<textarea id="dc-import-ta" placeholder="example.com&#10;another.io&#10;mysite.net"
  style="width:100%;height:140px;padding:10px 12px;background:var(--bg-input);
  border:1px solid var(--border-primary);border-radius:var(--radius-md);color:var(--text-primary);
  font-size:12px;font-family:var(--font-mono);box-sizing:border-box;resize:vertical;"></textarea>
<div id="dc-import-result" style="margin-top:10px;font-size:11.5px;"></div>`,
      confirmText: 'Import',
      cancelText:  'Cancel',
      width: '480px',
      onConfirm: async () => {
        const ta  = document.getElementById('dc-import-ta');
        const raw = (ta?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!raw.length) throw new Error('No domains entered');

        const { results } = await window.ALPApi.importDomains(raw);
        const ok  = results.filter(r => r.ok).length;
        const bad = results.filter(r => !r.ok);

        const resultEl = document.getElementById('dc-import-result');
        if (resultEl) {
          resultEl.innerHTML = `<span style="color:var(--color-success);">${ok} added</span>` +
            (bad.length ? ` · <span style="color:var(--color-danger);">${bad.length} failed</span>` : '') +
            (bad.length ? '<br>' + bad.map(r => `<span style="color:var(--color-danger);">${esc(r.domain)}: ${esc(r.error)}</span>`).join('<br>') : '');
        }

        await loadManaged();
        renderTable();
        renderStats();
        if (bad.length) throw new Error('keep-modal');
      },
    });
  }

  // ─── Recheck / Delete ─────────────────────────────────────────────────────

  async function recheckDomain(id, btn) {
    if (btn) btn.disabled = true;
    try {
      await window.ALPApi.recheckDomain(id);
      window.showToast('Check started', 'success');
      let polls = 0;
      const t = setInterval(async () => {
        polls++;
        await loadManaged();
        renderTable();
        renderStats();
        if (_drawerDomainId && String(_drawerDomainId) === String(id)) renderDrawer();
        if (polls >= 6) clearInterval(t);
      }, 3000);
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      if (btn) setTimeout(() => { btn.disabled = false; }, 5000);
    }
  }

  function confirmDelete(id) {
    const d = _domains.find(x => String(x.id) === String(id));
    if (!d) return;
    const confirmName = d.domain;
    window.showModal({
      title: 'Delete Domain',
      type: 'danger',
      content: `
<div style="text-align:center;padding:6px 0 2px;">
  <div style="width:44px;height:44px;border-radius:50%;background:var(--color-danger-muted);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px;">🗑</div>
  <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">${esc(confirmName)}</div>
  <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;">
    Removes Cloudflare zone, VPS nginx config, and panel record.<br>
    <span style="color:var(--text-muted);">Cannot be undone.</span>
  </div>
  <div style="margin-top:14px;text-align:left;">
    <label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:.05em;margin-bottom:6px;">TYPE <strong style="color:var(--color-danger);">${esc(confirmName)}</strong> TO CONFIRM</label>
    <input type="text" id="dc-confirm-name" placeholder="${esc(confirmName)}" autocomplete="off" spellcheck="false"
      style="width:100%;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border-primary);
      border-radius:var(--radius-md);color:var(--text-primary);font-size:13px;font-family:var(--font-mono);box-sizing:border-box;"/>
  </div>
</div>`,
      confirmText: 'Delete',
      onConfirm: async () => {
        const typed = (document.getElementById('dc-confirm-name')?.value || '').trim().toLowerCase();
        if (typed !== confirmName.toLowerCase()) {
          window.showToast('Domain name does not match — deletion cancelled', 'error');
          throw new Error('keep-modal');
        }
        try {
          const res = await window.ALPApi.deleteManagedDomain(id);
          const notices = res?.notices?.length ? res.notices : [];
          const msg = notices.length
            ? `${d.domain} deleted. Note: ${notices.join('; ')}.`
            : `${d.domain} deleted`;
          window.showToast(msg, 'success');
          if (_drawerDomainId && String(_drawerDomainId) === String(id)) closeDrawer();
          _selected.delete(String(id));
          await loadAll();
        } catch (err) {
          if (err.message === 'keep-modal') throw err;
          window.showToast(err.message, 'error');
        }
      },
    });
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  async function loadManaged() {
    try {
      const data = await window.ALPApi.getDomains();
      _domains = Array.isArray(data?.domains) ? data.domains : [];
    } catch { _domains = []; }
  }

  async function loadLegacy() {
    try {
      const data = await window.ALPApi.getWebsites();
      _websites = Array.isArray(data) ? data : (data?.websites || []);
    } catch { _websites = []; }
    try {
      const data = await window.ALPApi.getRailwayStatus();
      _railwayCfg  = data.configured;
      _railwayDoms = data.domains || [];
    } catch {
      _railwayCfg  = false;
      _railwayDoms = [];
    }
  }

  async function loadQuota() {
    try {
      _quota = await window.ALPApi.getDomainQuota();
    } catch { _quota = null; }
  }

  async function loadScamPages() {
    try {
      const data = await window.ALPApi.getWebsites();
      const list = Array.isArray(data) ? data : (data?.websites || []);
      _scamPages = list;
    } catch { _scamPages = []; }
  }

  async function loadAll() {
    await Promise.all([loadManaged(), loadLegacy(), loadQuota(), loadScamPages()]);
    if (_destroyed) return;
    renderStats();
    renderQuotaBar();
    renderTable();
    renderLegacy();
  }

  // ─── init / destroy ───────────────────────────────────────────────────────

  function init() {
    _destroyed = false;
    _selected.clear();
    _searchQuery = '';
    _filterStatus = '';
    _filterUptime = '';
    _filterWebsite = '';
    _filterLinked = '';
    _sortBy = 'created';

    loadAll();

    // Header buttons
    document.getElementById('dc-connect-btn')?.addEventListener('click', openConnectModal);
    document.getElementById('dc-import-btn')?.addEventListener('click', openImportModal);
    document.getElementById('dc-refresh-btn')?.addEventListener('click', loadAll);

    // Check all button
    document.getElementById('dc-checkall-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const { queued } = await window.ALPApi.checkAllDomains();
        window.showToast(`Checking ${queued} domain${queued === 1 ? '' : 's'}…`, 'success');
        setTimeout(async () => { await loadManaged(); renderTable(); renderStats(); }, 4000);
      } catch (err) {
        window.showToast(err.message, 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; }, 5000);
      }
    });

    // Search
    document.getElementById('dc-search')?.addEventListener('input', (e) => {
      _searchQuery = e.target.value;
      renderTable();
    });

    // Filters
    document.getElementById('dc-filter-status')?.addEventListener('change', (e) => {
      _filterStatus = e.target.value;
      renderTable();
    });
    document.getElementById('dc-filter-uptime')?.addEventListener('change', (e) => {
      _filterUptime = e.target.value;
      renderTable();
    });
    document.getElementById('dc-filter-website')?.addEventListener('change', (e) => {
      _filterWebsite = e.target.value;
      renderTable();
    });
    document.getElementById('dc-filter-linked')?.addEventListener('change', (e) => {
      _filterLinked = e.target.value;
      renderTable();
    });
    document.getElementById('dc-sort')?.addEventListener('change', (e) => {
      _sortBy = e.target.value;
      renderTable();
    });

    // Select all checkbox
    document.getElementById('dc-select-all')?.addEventListener('change', (e) => {
      const filtered = getFiltered();
      if (e.target.checked) {
        filtered.forEach(d => _selected.add(String(d.id)));
      } else {
        filtered.forEach(d => _selected.delete(String(d.id)));
      }
      renderTable();
    });

    // Batch actions
    document.getElementById('dc-batch-clear')?.addEventListener('click', () => {
      _selected.clear();
      renderTable();
    });
    document.getElementById('dc-batch-recheck')?.addEventListener('click', batchRecheck);
    document.getElementById('dc-batch-delete')?.addEventListener('click', batchDelete);

    // Drawer overlay click to close
    // Drawer overlay click is handled in _ensureDrawerInBody

    // Sortable headers
    document.querySelectorAll('.dc-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const sort = th.dataset.sort;
        if (sort) {
          _sortBy = sort;
          const sortSel = document.getElementById('dc-sort');
          if (sortSel) sortSel.value = sort;
          document.querySelectorAll('.dc-table th.sortable').forEach(t => t.classList.remove('sorted'));
          th.classList.add('sorted');
          renderTable();
        }
      });
    });

    // Auto-refresh every 30s
    _pollTimer = setInterval(() => {
      if (_destroyed) return;
      loadManaged().then(() => {
        renderTable();
        renderStats();
        if (_drawerDomainId) renderDrawer();
      }).catch(() => {});
    }, 30000);
  }

  function destroy() {
    _destroyed = true;
    clearInterval(_pollTimer);
    _pollTimer = null;
    closeDrawer();
    document.getElementById('dc-drawer-overlay')?.remove();
    document.getElementById('dc-drawer')?.remove();
  }

  async function _adoptLegacy(websiteId, domain) {
    try {
      const res = await window.ALPApi.adoptDomain(websiteId, domain);
      const hosting = res.domain?.hosting_provider || 'railway';
      window.showToast(`${domain} moved to Managed (${hosting.toUpperCase()}). Delete it from there for a clean re-add.`, 'success');
      await loadAll();
    } catch (err) {
      const msg = /already in managed/i.test(err.message || '')
        ? `${domain} is already in the Managed table above.`
        : (err.message || 'Migrate failed');
      window.showToast(msg, 'error');
      await loadAll();
    }
  }

  async function _deleteLegacyRailway(railwayDomainId, domainName) {
    window.showModal({
      title: 'Remove from Railway',
      content: `<div style="font-size:13px;color:var(--text-secondary);line-height:1.7;">
        Remove <strong style="color:var(--text-primary);font-family:var(--font-mono);">${esc(domainName)}</strong> from Railway?<br>
        <span style="font-size:11.5px;color:var(--text-muted);">Website settings stay unchanged — only the Railway domain attachment is deleted.</span>
      </div>`,
      confirmText: 'Remove',
      type: 'danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.removeRailwayDomain(railwayDomainId);
          window.showToast(`${domainName} removed from Railway`, 'success');
          await loadLegacy();
          renderLegacy();
        } catch (err) {
          window.showToast(err.message || 'Failed to remove from Railway', 'error');
        }
      }
    });
  }

  return { render, init, destroy, _deleteLegacyRailway, _adoptLegacy };
})();

window.DomainsPage = DomainsPage;
