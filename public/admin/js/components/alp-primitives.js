/**
 * ALP - HTML primitives
 * Small pure render helpers. Each returns an HTML string — you inject it, no
 * hydration needed. Grouped in one file because they're all tiny and share
 * the same shape (options in, string out).
 *
 * Exposes:
 *   window.AlpEmpty         .render({ icon, title, sub, action })
 *   window.AlpCallout       .render({ variant, icon, title, body, action })
 *   window.AlpKV            .render([{ label, value, color }])   ← array or single
 *                          .row({ label, value, color })
 *   window.AlpLiveDot       .render({ status, size, ring })
 *   window.AlpSectionHeader .render({ icon, title, color, action })
 *   window.AlpStats         .render([{ icon, value, label, color, sub, delta }])
 */
(function () {
  'use strict';

  const esc = (window.AlpUtil && window.AlpUtil.escapeHtml)
    || function (s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

  // ─── AlpEmpty ──────────────────────────────────────────────────────────────
  // Empty-state / loading-state box. `loading:true` swaps the icon for a spinner.
  window.AlpEmpty = {
    render(opts) {
      opts = opts || {};
      const title  = esc(opts.title || (opts.loading ? 'Loading…' : 'Nothing here yet'));
      const sub    = opts.sub ? `<div class="alp-empty-sub">${esc(opts.sub)}</div>` : '';
      const action = opts.action ? `<div class="alp-empty-action">${opts.action}</div>` : '';
      const icon   = opts.loading
        ? `<div class="alp-empty-spinner"></div>`
        : (opts.icon ? `<div class="alp-empty-icon">${opts.icon}</div>` : '');
      return `<div class="alp-empty">${icon}<div class="alp-empty-title">${title}</div>${sub}${action}</div>`;
    },
  };

  // ─── AlpCallout ────────────────────────────────────────────────────────────
  // Colored info/warning/danger/success box.
  //   variant: 'info' | 'warning' | 'danger' | 'success' (default 'info')
  const CALLOUT_ICONS = {
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    danger:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  };
  window.AlpCallout = {
    render(opts) {
      opts = opts || {};
      const variant = ['info', 'warning', 'danger', 'success'].includes(opts.variant) ? opts.variant : 'info';
      const icon = opts.icon === false ? '' :
        `<span class="alp-callout-icon">${opts.icon || CALLOUT_ICONS[variant]}</span>`;
      const title = opts.title ? `<div class="alp-callout-title">${esc(opts.title)}</div>` : '';
      const body  = opts.body  ? `<div class="alp-callout-body">${opts.htmlBody ? opts.body : esc(opts.body)}</div>` : '';
      const action = opts.action ? `<div class="alp-callout-action">${opts.action}</div>` : '';
      return `<div class="alp-callout alp-callout--${variant}">${icon}<div class="alp-callout-content">${title}${body}${action}</div></div>`;
    },
  };

  // ─── AlpKV ────────────────────────────────────────────────────────────────
  // Label / value row(s) for detail panels.
  //   .row({ label, value, color, mono })         → single row HTML
  //   .render([{...}, {...}])                     → block of rows
  window.AlpKV = {
    row(opts) {
      opts = opts || {};
      const color = opts.color ? ` style="color:${esc(opts.color)}"` : '';
      const valueCls = 'alp-kv-v' + (opts.mono ? ' alp-kv-v--mono' : '');
      const value = opts.htmlValue ? opts.value : esc(opts.value);
      return `<div class="alp-kv"><span class="alp-kv-k">${esc(opts.label)}</span><span class="${valueCls}"${color}>${value}</span></div>`;
    },
    render(rows) {
      if (!Array.isArray(rows)) rows = [rows];
      return rows.map(r => this.row(r)).join('');
    },
  };

  // ─── AlpLiveDot ───────────────────────────────────────────────────────────
  // Animated status dot — online/offline/warning/danger. Emits a span with a
  // pulsing halo when status='online'.
  //   size: pixel size (default 8)
  //   status: 'online' | 'offline' | 'warning' | 'danger' | 'neutral'
  //   ring: bg-secondary color for the halo cutout (default var(--bg-secondary))
  window.AlpLiveDot = {
    render(opts) {
      opts = opts || {};
      const size = opts.size || 8;
      const status = opts.status || 'neutral';
      const ring = opts.ring ? esc(opts.ring) : 'var(--bg-secondary)';
      return `<span class="alp-livedot alp-livedot--${esc(status)}" style="width:${size}px;height:${size}px;box-shadow:0 0 0 2px ${ring};"></span>`;
    },
  };

  // ─── AlpSectionHeader ─────────────────────────────────────────────────────
  // Icon + title + optional action button, with a subtle divider.
  //   icon: SVG string
  //   color: accent hex for the icon background
  //   action: HTML for right-aligned button
  window.AlpSectionHeader = {
    render(opts) {
      opts = opts || {};
      const color = opts.color || '#D4AF37';
      const iconBg = opts.iconBg || `${color}22`; // ~13% alpha
      const icon = opts.icon
        ? `<span class="alp-secthdr-icon" style="background:${esc(iconBg)};color:${esc(color)};">${opts.icon}</span>`
        : '';
      const title = `<h3 class="alp-secthdr-title">${esc(opts.title || '')}</h3>`;
      const action = opts.action ? `<div class="alp-secthdr-action">${opts.action}</div>` : '';
      return `<div class="alp-secthdr">${icon}${title}${action}</div>`;
    },
  };

  // ─── AlpStats ─────────────────────────────────────────────────────────────
  // Grid of stat tiles. Each item: { icon, value, label, color, sub, delta }
  //   delta: { value: '+12%', trend: 'up' | 'down' | 'flat' }
  window.AlpStats = {
    render(items, opts) {
      if (!Array.isArray(items)) return '';
      opts = opts || {};
      const min = opts.minWidth || 160;
      const cards = items.map(it => {
        const color = it.color || '#D4AF37';
        const iconBg = it.iconBg || `${color}1a`; // ~10% alpha
        const icon = it.icon
          ? `<div class="alp-stat-icon" style="background:${esc(iconBg)};color:${esc(color)};">${it.icon}</div>`
          : '';
        const value = `<div class="alp-stat-value" style="color:${esc(color)};">${esc(it.value == null ? '—' : it.value)}</div>`;
        const label = `<div class="alp-stat-label">${esc(it.label || '')}</div>`;
        const sub   = it.sub   ? `<div class="alp-stat-sub">${esc(it.sub)}</div>` : '';
        const delta = it.delta
          ? `<div class="alp-stat-delta alp-stat-delta--${esc(it.delta.trend || 'flat')}">${esc(it.delta.value)}</div>`
          : '';
        return `<div class="alp-stat-card">${icon}<div class="alp-stat-body">${value}${label}${sub}</div>${delta}</div>`;
      }).join('');
      return `<div class="alp-stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr));">${cards}</div>`;
    },
  };

})();
