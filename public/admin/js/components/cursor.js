/**
 * ALP – Custom Gold Cursor
 * Replaces the default cursor with a gold blob that trails the mouse,
 * stretches on fast movement, and glows on interactive elements.
 * Auto-disables on touch devices.
 */
const ALPCursor = (() => {
  let dot, ring;
  let mx = -100, my = -100;   // true mouse position
  let dx = -100, dy = -100;   // dot (fast lerp)
  let rx = -100, ry = -100;   // ring (slow lerp)
  let vx = 0, vy = 0;         // velocity
  let raf = 0;
  let hovering = false;
  let pressing = false;
  let hidden = false;

  const DOT_LERP  = 0.85;
  const RING_LERP = 0.45;

  function _inject() {
    const s = document.createElement('style');
    s.textContent = `
      .alp-cursor-dot,
      .alp-cursor-ring {
        position: fixed; top: 0; left: 0;
        pointer-events: none;
        z-index: 2147483647;
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
      .alp-cursor-dot.alp-cur-press {
        width: 6px; height: 6px;
      }
      .alp-cursor-ring.alp-cur-press {
        width: 26px; height: 26px;
      }
      .alp-cursor-dot.alp-cur-hidden,
      .alp-cursor-ring.alp-cur-hidden { opacity: 0; }

      .alp-cursor-active,
      .alp-cursor-active * { cursor: none !important; }

      .alp-cursor-burst {
        position: fixed; top: 0; left: 0;
        pointer-events: none;
        z-index: 2147483647;
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

      [data-theme='light'] .alp-cursor-dot {
        background: radial-gradient(circle, #a8862a 0%, #7a6318 60%, #5c4a10 100%);
        box-shadow: 0 0 5px 1px rgba(122,99,24,0.45), 0 0 12px 2px rgba(122,99,24,0.15);
      }
      [data-theme='light'] .alp-cursor-ring {
        border-color: rgba(122,99,24,0.4);
        background: radial-gradient(circle, rgba(122,99,24,0.06) 0%, transparent 70%);
        box-shadow: 0 0 10px 2px rgba(122,99,24,0.08);
      }
      [data-theme='light'] .alp-cursor-dot.alp-cur-hover {
        background: radial-gradient(circle, #a8862a 0%, #8f7222 50%, #7a6318 100%);
        box-shadow: 0 0 8px 2px rgba(122,99,24,0.5), 0 0 18px 4px rgba(122,99,24,0.2);
      }
      [data-theme='light'] .alp-cursor-ring.alp-cur-hover {
        border-color: rgba(122,99,24,0.55);
        background: radial-gradient(circle, rgba(122,99,24,0.08) 0%, transparent 70%);
        box-shadow: 0 0 14px 3px rgba(122,99,24,0.12);
      }
      [data-theme='light'] .alp-cursor-burst-particle {
        background: #8f7222;
        box-shadow: 0 0 5px 1px rgba(122,99,24,0.6);
      }
      [data-theme='light'] .alp-cursor-burst-ring {
        border-color: rgba(122,99,24,0.7);
      }

      @media (hover: none), (pointer: coarse) {
        .alp-cursor-dot, .alp-cursor-ring { display: none !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .alp-cursor-dot, .alp-cursor-ring { display: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  function _create() {
    dot  = document.createElement('div');
    ring = document.createElement('div');
    dot.className  = 'alp-cursor-dot';
    ring.className = 'alp-cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
    document.body.appendChild(dot);
  }

  function _isInteractive(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'SUMMARY') return true;
    if (el.closest('a, button, [role="button"], label[for], .sidebar-nav-item, .btn, .clickable, [onclick]')) return true;
    const cs = getComputedStyle(el);
    return cs.cursor === 'pointer';
  }

  function _onMove(e) {
    mx = e.clientX;
    my = e.clientY;
    if (hidden) {
      hidden = false;
      dot.classList.remove('alp-cur-hidden');
      ring.classList.remove('alp-cur-hidden');
    }
    const over = _isInteractive(e.target);
    if (over !== hovering) {
      hovering = over;
      dot.classList.toggle('alp-cur-hover', over);
      ring.classList.toggle('alp-cur-hover', over);
    }
  }

  function _burst() {
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

  function _onDown() {
    pressing = true;
    dot.classList.add('alp-cur-press');
    ring.classList.add('alp-cur-press');
    _burst();
  }
  function _onUp() {
    pressing = false;
    dot.classList.remove('alp-cur-press');
    ring.classList.remove('alp-cur-press');
  }

  function _onLeave() {
    hidden = true;
    dot.classList.add('alp-cur-hidden');
    ring.classList.add('alp-cur-hidden');
  }

  function _tick() {
    // Lerp positions
    dx += (mx - dx) * DOT_LERP;
    dy += (my - dy) * DOT_LERP;
    rx += (mx - rx) * RING_LERP;
    ry += (my - ry) * RING_LERP;

    // Velocity for stretch
    const nvx = mx - dx;
    const nvy = my - dy;
    vx += (nvx - vx) * 0.3;
    vy += (nvy - vy) * 0.3;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const angle = Math.atan2(vy, vx) * (180 / Math.PI);

    // Stretch the dot along movement direction
    const stretch = Math.min(speed * 0.06, 0.6);
    const sx = 1 + stretch;
    const sy = 1 / (1 + stretch * 0.4);

    dot.style.transform  = `translate(${dx}px, ${dy}px) translate(-50%,-50%) rotate(${angle}deg) scale(${sx},${sy})`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;

    raf = requestAnimationFrame(_tick);
  }

  function init() {
    // Skip touch-only devices
    if (window.matchMedia('(hover: none)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    _inject();
    _create();
    document.documentElement.classList.add('alp-cursor-active');

    document.addEventListener('mousemove',  _onMove,  { passive: true });
    document.addEventListener('mousedown',  _onDown,  { passive: true });
    document.addEventListener('mouseup',    _onUp,    { passive: true });
    document.addEventListener('mouseleave', _onLeave, { passive: true });
    document.addEventListener('mouseenter', () => {
      hidden = false;
      dot.classList.remove('alp-cur-hidden');
      ring.classList.remove('alp-cur-hidden');
    }, { passive: true });

    raf = requestAnimationFrame(_tick);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    document.removeEventListener('mousemove',  _onMove);
    document.removeEventListener('mousedown',  _onDown);
    document.removeEventListener('mouseup',    _onUp);
    document.removeEventListener('mouseleave', _onLeave);
    document.documentElement.classList.remove('alp-cursor-active');
    if (dot)  dot.remove();
    if (ring) ring.remove();
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
