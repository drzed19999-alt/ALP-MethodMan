/**
 * ALP – Custom Gold Cursor
 * Replaces the default cursor with a gold blob that trails the mouse,
 * stretches on fast movement, and glows on interactive elements.
 * Auto-disables on touch devices.
 */
const ALPCursor = (() => {
  let dot, ring, styleEl;
  let mx = -100, my = -100;   // true mouse position
  let dx = -100, dy = -100;   // dot (fast lerp)
  let rx = -100, ry = -100;   // ring (slow lerp)
  let vx = 0, vy = 0;         // velocity
  let raf = 0;
  let hovering = false;
  let pressing = false;
  let hidden = true;
  let touchSuspended = false;

  const DOT_LERP  = 0.85;
  const RING_LERP = 0.45;

  function _inject() {
    if (document.getElementById('alp-cursor-css')) return;
    styleEl = document.createElement('style');
    styleEl.id = 'alp-cursor-css';
    styleEl.textContent = `
      .alp-cursor-dot,
      .alp-cursor-ring {
        position: fixed; top: 0; left: 0;
        pointer-events: none;
        z-index: var(--z-cursor, 9999);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        will-change: transform, opacity;
        transition: opacity 180ms ease;
      }
      .alp-cursor-dot {
        width: 8px; height: 8px;
        background: radial-gradient(circle, #f5d76e 0%, #D4AF37 60%, #B8860B 100%);
        box-shadow: 0 0 6px 1px rgba(212,175,55,0.5), 0 0 14px 3px rgba(212,175,55,0.18);
      }
      .alp-cursor-ring {
        width: 32px; height: 32px;
        border: 1.5px solid rgba(212,175,55,0.35);
        background: radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%);
        box-shadow: 0 0 12px 2px rgba(212,175,55,0.08);
      }
      .alp-cursor-dot.alp-cur-hover {
        width: 10px; height: 10px;
        background: radial-gradient(circle, #ffe88a 0%, #f5d76e 50%, #D4AF37 100%);
        box-shadow: 0 0 10px 3px rgba(245,215,110,0.6), 0 0 22px 6px rgba(212,175,55,0.25);
      }
      .alp-cursor-ring.alp-cur-hover {
        width: 44px; height: 44px;
        border-color: rgba(212,175,55,0.55);
        background: radial-gradient(circle, rgba(212,175,55,0.1) 0%, transparent 70%);
        box-shadow: 0 0 18px 4px rgba(212,175,55,0.15);
      }
      .alp-cursor-dot.alp-cur-press { width: 6px; height: 6px; }
      .alp-cursor-ring.alp-cur-press { width: 26px; height: 26px; }
      .alp-cursor-dot.alp-cur-hidden,
      .alp-cursor-ring.alp-cur-hidden { opacity: 0; }

      /* Only hide OS cursor when custom cursor is guaranteed visible; keep native I-beam on text inputs */
      @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
        .alp-cursor-active:not(.alp-cursor-touch-suspended),
        .alp-cursor-active:not(.alp-cursor-touch-suspended) * { cursor: none !important; }
        .alp-cursor-active input[type="text"],
        .alp-cursor-active input[type="search"],
        .alp-cursor-active input[type="password"],
        .alp-cursor-active input[type="email"],
        .alp-cursor-active input[type="url"],
        .alp-cursor-active input[type="number"],
        .alp-cursor-active textarea,
        .alp-cursor-active [contenteditable="true"] { cursor: text !important; }
      }

      .alp-cursor-burst {
        position: fixed; top: 0; left: 0;
        pointer-events: none;
        z-index: var(--z-cursor, 9999);
        border-radius: 50%;
        will-change: transform, opacity;
      }
      .alp-cursor-burst-particle {
        width: 4px; height: 4px;
        background: #f5d76e;
        border-radius: 50%;
        box-shadow: 0 0 6px 1px rgba(212,175,55,0.7);
        animation: alpBurstOut 420ms ease-out forwards;
      }
      .alp-cursor-burst-ring {
        width: 8px; height: 8px;
        border: 1.5px solid rgba(245,215,110,0.8);
        border-radius: 50%;
        background: transparent;
        animation: alpBurstRing 380ms ease-out forwards;
      }
      @keyframes alpBurstOut {
        0%   { transform: translate(-50%,-50%) translate(var(--bx,0),var(--by,0)) scale(1); opacity: 1; }
        100% { transform: translate(-50%,-50%) translate(calc(var(--bx,0) * 5), calc(var(--by,0) * 5)) scale(0); opacity: 0; }
      }
      @keyframes alpBurstRing {
        0%   { transform: translate(-50%,-50%) scale(1); opacity: 0.9; border-width: 2px; }
        100% { transform: translate(-50%,-50%) scale(4.5); opacity: 0; border-width: 0.5px; }
      }

      /* Light theme — Cool Slate accent instead of warm brown */
      [data-theme='light'] .alp-cursor-dot {
        background: radial-gradient(circle, #334155 0%, #0F172A 70%);
        box-shadow: 0 0 5px 1px rgba(15,23,42,0.35), 0 0 12px 2px rgba(15,23,42,0.12);
      }
      [data-theme='light'] .alp-cursor-ring {
        border-color: rgba(15,23,42,0.35);
        background: radial-gradient(circle, rgba(15,23,42,0.05) 0%, transparent 70%);
        box-shadow: 0 0 10px 2px rgba(15,23,42,0.06);
      }
      [data-theme='light'] .alp-cursor-dot.alp-cur-hover {
        background: radial-gradient(circle, #1E293B 0%, #0F172A 70%);
        box-shadow: 0 0 8px 2px rgba(15,23,42,0.40);
      }
      [data-theme='light'] .alp-cursor-ring.alp-cur-hover {
        border-color: rgba(15,23,42,0.55);
        background: radial-gradient(circle, rgba(15,23,42,0.07) 0%, transparent 70%);
      }
      [data-theme='light'] .alp-cursor-burst-particle {
        background: #0F172A;
        box-shadow: 0 0 5px 1px rgba(15,23,42,0.4);
      }
      [data-theme='light'] .alp-cursor-burst-ring {
        border-color: rgba(15,23,42,0.55);
      }

      @media (hover: none), (pointer: coarse), (prefers-reduced-motion: reduce) {
        .alp-cursor-dot, .alp-cursor-ring { display: none !important; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  function _create() {
    dot  = document.createElement('div');
    ring = document.createElement('div');
    dot.className  = 'alp-cursor-dot alp-cur-hidden';
    ring.className = 'alp-cursor-ring alp-cur-hidden';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
    document.body.appendChild(dot);
  }

  function _isInteractive(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'SUMMARY') return true;
    return !!el.closest('a, button, [role="button"], label[for], .sidebar-nav-item, .btn, .dc-btn, .dp-btn, .clickable, [onclick]');
  }

  function _isTextField(el) {
    if (!el || !el.tagName) return false;
    return !!el.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]');
  }

  function _ensureTick() {
    if (!raf) raf = requestAnimationFrame(_tick);
  }

  function _suspendTouch() {
    if (touchSuspended) return;
    touchSuspended = true;
    hidden = true;
    document.documentElement.classList.add('alp-cursor-touch-suspended');
    dot?.classList.add('alp-cur-hidden');
    ring?.classList.add('alp-cur-hidden');
  }

  function _onMove(e) {
    if (e.pointerType === 'touch') { _suspendTouch(); return; }
    if (touchSuspended) {
      touchSuspended = false;
      document.documentElement.classList.remove('alp-cursor-touch-suspended');
    }
    mx = e.clientX;
    my = e.clientY;
    const hideForText = _isTextField(e.target);
    if (hideForText !== hidden) {
      hidden = hideForText;
      dot.classList.toggle('alp-cur-hidden', hidden);
      ring.classList.toggle('alp-cur-hidden', hidden);
    }
    const over = !hideForText && _isInteractive(e.target);
    if (over !== hovering) {
      hovering = over;
      dot.classList.toggle('alp-cur-hover', over);
      ring.classList.toggle('alp-cur-hover', over);
    }
    _ensureTick();
  }

  function _burst() {
    if (touchSuspended || hidden) return;
    const count = 8;
    const els = [];
    const r = document.createElement('div');
    r.className = 'alp-cursor-burst alp-cursor-burst-ring';
    r.style.left = mx + 'px';
    r.style.top  = my + 'px';
    r.setAttribute('aria-hidden', 'true');
    els.push(r);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 6 + Math.random() * 6;
      const p = document.createElement('div');
      p.className = 'alp-cursor-burst alp-cursor-burst-particle';
      p.style.left = mx + 'px';
      p.style.top  = my + 'px';
      p.style.setProperty('--bx', Math.cos(a) * dist + 'px');
      p.style.setProperty('--by', Math.sin(a) * dist + 'px');
      const sz = (2 + Math.random() * 3) + 'px';
      p.style.width = sz;
      p.style.height = sz;
      p.setAttribute('aria-hidden', 'true');
      els.push(p);
    }
    const frag = document.createDocumentFragment();
    els.forEach(e => frag.appendChild(e));
    document.body.appendChild(frag);
    setTimeout(() => els.forEach(e => e.remove()), 450);
  }

  function _onDown(e) {
    if (e.pointerType === 'touch') { _suspendTouch(); return; }
    pressing = true;
    dot.classList.add('alp-cur-press');
    ring.classList.add('alp-cur-press');
    _burst();
  }
  function _onUp() {
    pressing = false;
    dot?.classList.remove('alp-cur-press');
    ring?.classList.remove('alp-cur-press');
  }

  function _onLeave() {
    hidden = true;
    dot?.classList.add('alp-cur-hidden');
    ring?.classList.add('alp-cur-hidden');
  }

  function _onEnter() {
    if (touchSuspended) return;
    hidden = false;
    dot?.classList.remove('alp-cur-hidden');
    ring?.classList.remove('alp-cur-hidden');
  }

  function _tick() {
    dx += (mx - dx) * DOT_LERP;
    dy += (my - dy) * DOT_LERP;
    rx += (mx - rx) * RING_LERP;
    ry += (my - ry) * RING_LERP;

    const nvx = mx - dx;
    const nvy = my - dy;
    vx += (nvx - vx) * 0.3;
    vy += (nvy - vy) * 0.3;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const angle = Math.atan2(vy, vx) * (180 / Math.PI);

    const stretch = Math.min(speed * 0.06, 0.6);
    const sx = 1 + stretch;
    const sy = 1 / (1 + stretch * 0.4);

    dot.style.transform  = `translate(${dx}px, ${dy}px) translate(-50%,-50%) rotate(${angle}deg) scale(${sx},${sy})`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;

    if (Math.hypot(mx - rx, my - ry) > 0.25 || Math.hypot(mx - dx, my - dy) > 0.25 || speed > 0.15) {
      raf = requestAnimationFrame(_tick);
    } else {
      raf = 0;
    }
  }

  function init() {
    if (window.matchMedia('(hover: none), (pointer: coarse), (prefers-reduced-motion: reduce)').matches) return;

    _inject();
    _create();
    document.documentElement.classList.add('alp-cursor-active');

    document.addEventListener('pointermove',  _onMove,  { passive: true });
    document.addEventListener('pointerdown',  _onDown,  { passive: true });
    document.addEventListener('pointerup',    _onUp,    { passive: true });
    document.addEventListener('mouseleave',   _onLeave, { passive: true });
    document.addEventListener('mouseenter',   _onEnter, { passive: true });
  }

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('pointermove',  _onMove);
    document.removeEventListener('pointerdown',  _onDown);
    document.removeEventListener('pointerup',    _onUp);
    document.removeEventListener('mouseleave',   _onLeave);
    document.removeEventListener('mouseenter',   _onEnter);
    document.documentElement.classList.remove('alp-cursor-active', 'alp-cursor-touch-suspended');
    if (dot)     { dot.remove();     dot = null; }
    if (ring)    { ring.remove();    ring = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  return { init, destroy };
})();

window.ALPCursor = ALPCursor;

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ALPCursor.init());
} else {
  ALPCursor.init();
}
