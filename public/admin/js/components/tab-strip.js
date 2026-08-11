/**
 * ALP - Tab Strip
 * Small reusable sub-tab component. Declarative HTML + one document-level
 * click delegate, so it works for dynamically-injected content (drawers,
 * settings panels) without per-instance wiring.
 *
 * Usage — declarative HTML:
 *   <div class="alp-tabs" data-default="info">
 *     <div class="alp-tabs-bar">
 *       <button class="alp-tab" data-tab="info">Info</button>
 *       <button class="alp-tab" data-tab="ns">Nameservers <span class="alp-tab-pill">3</span></button>
 *     </div>
 *     <div class="alp-tab-panel" data-panel="info">…</div>
 *     <div class="alp-tab-panel" data-panel="ns">…</div>
 *   </div>
 *
 * Usage — render helper:
 *   AlpTabs.render({
 *     defaultKey: 'info',
 *     tabs: [
 *       { key: 'info', label: 'Info',        content: '…', badge: null },
 *       { key: 'ns',   label: 'Nameservers', content: '…', badge: 3 },
 *     ],
 *   })  → HTML string.
 *
 * After injecting into the DOM, call AlpTabs.hydrate(rootEl) once — it sets
 * the default active tab on any .alp-tabs inside rootEl. Clicks after that
 * are handled by the global delegate.
 */
window.AlpTabs = (function () {
  'use strict';

  // ── HTML helpers ──────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Build a tab-strip HTML string.
   * @param {object} opts
   * @param {string} [opts.defaultKey] key to activate by default (defaults to first)
   * @param {Array<{key,label,content,badge}>} opts.tabs
   * @param {string} [opts.variant] 'default' | 'compact' | 'pill' — visual style
   * @param {string} [opts.className] extra classes on the wrapper
   */
  function render(opts) {
    const tabs = Array.isArray(opts && opts.tabs) ? opts.tabs : [];
    if (!tabs.length) return '';
    const defaultKey = opts.defaultKey || tabs[0].key;
    const variant    = opts.variant ? ' alp-tabs--' + _esc(opts.variant) : '';
    const extra      = opts.className ? ' ' + _esc(opts.className) : '';

    const bar = tabs.map(t => {
      const active = t.key === defaultKey ? ' active' : '';
      const badge  = (t.badge == null || t.badge === '')
        ? ''
        : `<span class="alp-tab-pill">${_esc(t.badge)}</span>`;
      const icon = t.icon ? `<span class="alp-tab-icon">${t.icon}</span>` : '';
      return `<button type="button" class="alp-tab${active}" data-tab="${_esc(t.key)}">${icon}${_esc(t.label)}${badge}</button>`;
    }).join('');

    const panels = tabs.map(t => {
      const active = t.key === defaultKey ? ' active' : '';
      return `<div class="alp-tab-panel${active}" data-panel="${_esc(t.key)}">${t.content || ''}</div>`;
    }).join('');

    return `<div class="alp-tabs${variant}${extra}" data-default="${_esc(defaultKey)}">
      <div class="alp-tabs-bar" role="tablist">${bar}</div>
      ${panels}
    </div>`;
  }

  /**
   * Activate a tab within a specific .alp-tabs container (or all of them
   * inside rootEl if key isn't found in one).
   */
  function activate(tabsEl, key) {
    if (!tabsEl) return;
    tabsEl.querySelectorAll(':scope > .alp-tabs-bar > .alp-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === key);
    });
    tabsEl.querySelectorAll(':scope > .alp-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === key);
    });
  }

  /**
   * Ensure every .alp-tabs inside rootEl has its default tab activated.
   * Call this after injecting tab HTML into the DOM.
   */
  function hydrate(rootEl) {
    if (!rootEl) rootEl = document;
    rootEl.querySelectorAll('.alp-tabs').forEach(tabsEl => {
      const hasActive = tabsEl.querySelector(':scope > .alp-tabs-bar > .alp-tab.active');
      if (hasActive) return;
      const def = tabsEl.dataset.default
        || tabsEl.querySelector(':scope > .alp-tabs-bar > .alp-tab')?.dataset.tab;
      if (def) activate(tabsEl, def);
    });
  }

  // ── Global click delegate ────────────────────────────────────────────────
  // Handles clicks on .alp-tab even for tabs added to the DOM later.
  if (!window.__alp_tabs_wired) {
    window.__alp_tabs_wired = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.alp-tab');
      if (!btn) return;
      const tabsEl = btn.closest('.alp-tabs');
      if (!tabsEl || !btn.dataset.tab) return;
      // only handle if THIS button belongs directly to this tabs bar (not a
      // deeper nested tab strip)
      const bar = btn.closest('.alp-tabs-bar');
      if (!bar || bar.parentElement !== tabsEl) return;
      e.preventDefault();
      e.stopPropagation();
      activate(tabsEl, btn.dataset.tab);
      const cb = tabsEl.__onSwitch;
      if (typeof cb === 'function') { try { cb(btn.dataset.tab); } catch (_) {} }
    });
  }

  /**
   * Attach an onSwitch callback to a tab strip. Called with the new key
   * whenever the user switches tabs.
   */
  function onSwitch(tabsEl, fn) {
    if (tabsEl) tabsEl.__onSwitch = fn;
  }

  return { render, hydrate, activate, onSwitch, _esc };
})();
