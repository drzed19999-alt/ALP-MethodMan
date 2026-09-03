/**
 * ALP — runtime for the interactive parts of alp-animations.css.
 * Each helper is idempotent and no-op when `prefers-reduced-motion: reduce`.
 */
(function () {
  'use strict';
  if (window.__alp_animations_wired) return;
  window.__alp_animations_wired = true;
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 15. Cursor spotlight in the sidebar ────────────────────────────────
  // A subtle radial gradient follows the pointer. Uses CSS vars so the paint
  // stays on the compositor.
  function spotlight() {
    const sb = document.querySelector('.sidebar');
    if (!sb || sb.dataset.spotlight) return;
    sb.dataset.spotlight = '1';
    sb.style.setProperty('--sb-spot-x', '50%');
    sb.style.setProperty('--sb-spot-y', '0%');
    sb.addEventListener('mousemove', (e) => {
      if (REDUCE) return;
      const rect = sb.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      sb.style.setProperty('--sb-spot-x', x + '%');
      sb.style.setProperty('--sb-spot-y', y + '%');
    });
    // Inject the pseudo-element via a stylesheet once
    if (!document.getElementById('__alp_spot__')) {
      const st = document.createElement('style');
      st.id = '__alp_spot__';
      st.textContent = `
        .sidebar { position: relative; }
        .sidebar::after {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(280px circle at var(--sb-spot-x,50%) var(--sb-spot-y,0%),
                                       rgba(212,175,55,.06), transparent 60%);
          transition: background 60ms linear;
          z-index: 0;
        }
        [data-theme='light'] .sidebar::after {
          background: radial-gradient(280px circle at var(--sb-spot-x,50%) var(--sb-spot-y,0%),
                                       rgba(15,23,42,.04), transparent 60%);
        }
        .sidebar > * { position: relative; z-index: 1; }
      `;
      document.head.appendChild(st);
    }
  }

  // ── 22. Ripple on button click ─────────────────────────────────────────
  function ripple(e) {
    if (REDUCE) return;
    const btn = e.target.closest('.btn, .dp-btn, .um-action-btn, .alp-btn');
    if (!btn || btn.disabled) return;
    // Skip icon-only buttons where overflow would clip the ripple weirdly
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const el = document.createElement('span');
    el.className = 'alp-ripple-el';
    el.style.width = el.style.height = size + 'px';
    el.style.left = (e.clientX - rect.left - size / 2) + 'px';
    el.style.top  = (e.clientY - rect.top  - size / 2) + 'px';
    btn.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }
  document.addEventListener('click', ripple, true);

  // ── 26. Drawer backdrop blur — auto-toggles body class when panel opens
  const drawerObs = new MutationObserver(() => {
    const panel = document.getElementById('um-drawer-panel');
    if (!panel) return;
    document.body.classList.toggle('alp-drawer-open', panel.classList.contains('open'));
  });
  drawerObs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // ── 25. Tab underline slide — animated moving underline for tab groups
  // Any element in [.detail-tabs, .alp-tabs-bar, .um-drawer-tabs] gets an
  // absolutely-positioned bar that slides between .active children.
  function wireTabGroup(group) {
    if (group.dataset.slidingUnderline) return;
    group.dataset.slidingUnderline = '1';
    group.style.position = group.style.position || 'relative';
    const bar = document.createElement('span');
    bar.className = 'alp-tab-slider';
    bar.style.cssText = `
      position:absolute; bottom:0; height:2px; background:var(--accent-primary);
      border-radius:2px; pointer-events:none; z-index:2;
      transition: transform 300ms cubic-bezier(.34,1.56,.64,1),
                  width 300ms cubic-bezier(.34,1.56,.64,1),
                  opacity 200ms ease-out;
      opacity:0;
    `;
    group.appendChild(bar);
    function moveTo(active) {
      if (!active) { bar.style.opacity = '0'; return; }
      const rect = active.getBoundingClientRect();
      const parent = group.getBoundingClientRect();
      bar.style.width = rect.width + 'px';
      bar.style.transform = `translateX(${rect.left - parent.left}px)`;
      bar.style.opacity = '1';
    }
    const settle = () => moveTo(group.querySelector('.active'));
    const mo = new MutationObserver(settle);
    mo.observe(group, { subtree: true, attributes: true, attributeFilter: ['class'] });
    // Initial + on resize
    settle();
    window.addEventListener('resize', settle);
  }
  function scanTabs() {
    document.querySelectorAll('.detail-tabs, .alp-tabs-bar, .um-drawer-tabs').forEach(wireTabGroup);
  }

  // ── 28. Success checkmark stroke draw ─────────────────────────────────
  // Helper — call ALPAnim.checkmark(container) after a save to draw a check.
  function checkmark(container) {
    if (!container) return;
    container.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline class="alp-check-draw" points="20 6 9 17 4 12"></polyline>
      </svg>`;
  }

  // ── 30. Copy button feedback — helper to flash a target ────────────────
  function copyFlash(el) {
    if (!el) return;
    el.classList.remove('alp-copy-clicked');
    void el.offsetWidth;
    el.classList.add('alp-copy-clicked');
    setTimeout(() => el.classList.remove('alp-copy-clicked'), 500);
  }

  // Auto-attach on `[data-copy]` — copies text and flashes
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-copy]');
    if (!el) return;
    const text = el.dataset.copy;
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      copyFlash(el);
      if (window.showToast) window.showToast('Copied', 'success', 1500);
    } catch {}
  });

  // ── Init on ready ──────────────────────────────────────────────────────
  function init() {
    spotlight();
    scanTabs();
    // Re-scan tabs when new drawer tabs render
    new MutationObserver(scanTabs).observe(document.body, { subtree: true, childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

  // ── 19. Count-up for numeric elements ────────────────────────────────
  // Rolls a number el from its current textContent to `target` over ~900ms.
  // Used by any page that wants a live-updating stat to feel alive.
  function countUp(el, target, opts) {
    if (!el) return;
    opts = opts || {};
    const duration = opts.duration || 900;
    const suffix = opts.suffix || '';
    const start = parseInt(String(el.textContent).replace(/[^0-9-]/g, ''), 10) || 0;
    const end = Number(target) || 0;
    const diff = end - start;
    if (REDUCE || diff === 0) { el.textContent = end.toLocaleString() + suffix; return; }
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + diff * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  window.ALPAnim = { checkmark, copyFlash, countUp };
})();
