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
      const isAct  = t.key === defaultKey;
      const active = isAct ? ' active' : '';
      const badge  = (t.badge == null || t.badge === '')
        ? ''
        : `<span class="alp-tab-pill">${_esc(t.badge)}</span>`;
      const icon = t.icon ? `<span class="alp-tab-icon">${t.icon}</span>` : '';
      return `<button type="button" role="tab" aria-selected="${isAct ? 'true' : 'false'}" tabindex="${isAct ? '0' : '-1'}" class="alp-tab${active}" data-tab="${_esc(t.key)}">${icon}${_esc(t.label)}${badge}</button>`;
    }).join('');

    const panels = tabs.map(t => {
      const active = t.key === defaultKey ? ' active' : '';
      return `<div role="tabpanel" class="alp-tab-panel${active}" data-panel="${_esc(t.key)}">${t.content || ''}</div>`;
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
      const isAct = btn.dataset.tab === key;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
      btn.setAttribute('tabindex', isAct ? '0' : '-1');
    });
    tabsEl.querySelectorAll(':scope > .alp-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === key);
      panel.setAttribute('role', 'tabpanel');
    });
  }

  /**
   * Ensure every .alp-tabs inside rootEl has its default tab activated.
   * Call this after injecting tab HTML into the DOM.
   */
  function hydrate(rootEl) {
    if (!rootEl) rootEl = document;
    rootEl.querySelectorAll('.alp-tabs').forEach(tabsEl => {
      const activeBtn = tabsEl.querySelector(':scope > .alp-tabs-bar > .alp-tab.active');
      const def = (activeBtn && activeBtn.dataset.tab)
        || tabsEl.dataset.default
        || tabsEl.querySelector(':scope > .alp-tabs-bar > .alp-tab')?.dataset.tab;
      if (def) activate(tabsEl, def);
    });
  }

  // ── Global click & arrow-key delegates ───────────────────────────────────
  if (!window.__alp_tabs_wired) {
    window.__alp_tabs_wired = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.alp-tab');
      if (!btn) return;
      const tabsEl = btn.closest('.alp-tabs');
      if (!tabsEl || !btn.dataset.tab) return;
      const bar = btn.closest('.alp-tabs-bar');
      if (!bar || bar.parentElement !== tabsEl) return;
      e.preventDefault();
      e.stopPropagation();
      activate(tabsEl, btn.dataset.tab);
      const cb = tabsEl.__onSwitch;
      if (typeof cb === 'function') { try { cb(btn.dataset.tab); } catch (_) {} }
    });
    document.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const btn = e.target.closest && e.target.closest('.alp-tab');
      if (!btn) return;
      const bar = btn.closest('.alp-tabs-bar');
      const tabsEl = btn.closest('.alp-tabs');
      if (!bar || !tabsEl || bar.parentElement !== tabsEl) return;
      const btns = Array.from(bar.querySelectorAll(':scope > .alp-tab'));
      const idx = btns.indexOf(btn);
      if (idx === -1 || btns.length < 2) return;
      e.preventDefault();
      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % btns.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + btns.length) % btns.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = btns.length - 1;
      const target = btns[nextIdx];
      activate(tabsEl, target.dataset.tab);
      target.focus();
      const cb = tabsEl.__onSwitch;
      if (typeof cb === 'function') { try { cb(target.dataset.tab); } catch (_) {} }
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
