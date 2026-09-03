/**
 * ALP — Ambient background effects (behind the app UI).
 * Draws to a single fixed <canvas> anchored to <body>, sitting under all
 * content (z-index: 0) but above the body background. Sidebar, header, and
 * cards all sit on their own opaque grounds so the canvas peeks through only
 * where the layout leaves gaps.
 *
 * Options:
 *   - "none"     — off
 *   - "snow"     — soft white flakes drifting down
 *   - "rain"     — angled light streaks
 *   - "stars"    — twinkling gold points
 *   - "aurora"   — slow-moving colour blobs (CSS gradient, no canvas)
 *   - "matrix"   — falling green glyphs
 *   - "fireflies" — warm yellow glow dots that meander
 *   - "confetti" — festive scattered dots (subtle)
 *   - "bubbles"  — bubbles floating up
 *
 * Preference persists to localStorage under 'alp_ambient'.
 * Respects prefers-reduced-motion (pauses animation on canvas modes).
 */
(function () {
  'use strict';
  if (window.__alp_ambient_wired) return;
  window.__alp_ambient_wired = true;

  const STORAGE_KEY = 'alp_ambient';
  const OPTIONS = ['none', 'snow', 'rain', 'stars', 'aurora', 'matrix', 'fireflies', 'confetti', 'bubbles'];
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null, ctx = null, rafId = null;
  let particles = [];
  let currentMode = null;
  let auroraEl = null;

  function _readMode() {
    try { return localStorage.getItem(STORAGE_KEY) || 'none'; } catch { return 'none'; }
  }
  function _writeMode(m) {
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  }

  function _ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.id = 'alp-ambient-canvas';
    // Sits at layer 0 behind app-layout (layer 1). Pointer-events off so
    // clicks fall through. Opacity animates in/out on mode swap.
    canvas.style.cssText = [
      'position:fixed', 'inset:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:0', 'opacity:0.7',
      'transition:opacity 400ms ease'
    ].join(';');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _debounce(_resize, 200));
    _ensureVisibilityCss();
    return canvas;
  }

  // ── One-time CSS: lift app-layout above the canvas and make the page's
  // outer surfaces translucent so the effect peeks through, without touching
  // the opaque cards & sidebar controls that carry the UI content.
  function _ensureVisibilityCss() {
    if (document.getElementById('__alp_ambient_css__')) return;
    const st = document.createElement('style');
    st.id = '__alp_ambient_css__';
    st.textContent = `
      /* Canvas / aurora sit at z:0. Lift the whole app so it paints above. */
      html { background: var(--bg-primary); }
      body[data-ambient-active] { background: transparent; }
      body[data-ambient-active] .app-layout { position: relative; z-index: 1; background: transparent; }
      body[data-ambient-active] .main-content { background: transparent; }
      body[data-ambient-active] .page-content { background: transparent; }
      /* Sidebar stays opaque so nav labels remain readable */
      body[data-ambient-active] .sidebar,
      body[data-ambient-active] .header { position: relative; z-index: 2; }
    `;
    document.head.appendChild(st);
  }

  function _resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function _stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (canvas) {
      canvas.style.opacity = '0';
      setTimeout(() => {
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }, 300);
    }
    if (auroraEl) { auroraEl.remove(); auroraEl = null; }
    particles = [];
  }

  function _debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // ── Particle initializers ──────────────────────────────────────────────
  function _initSnow(count) {
    const W = window.innerWidth, H = window.innerHeight;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1 + Math.random() * 2.5,
      vy: 0.3 + Math.random() * 0.8,
      vx: (Math.random() - 0.5) * 0.4,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.008 + Math.random() * 0.015,
      opacity: 0.4 + Math.random() * 0.5
    }));
  }
  function _initRain(count) {
    const W = window.innerWidth, H = window.innerHeight;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * W * 1.2 - 100,
      y: Math.random() * H,
      len: 8 + Math.random() * 14,
      vy: 6 + Math.random() * 6,
      vx: 2 + Math.random() * 1.5,
      opacity: 0.15 + Math.random() * 0.25
    }));
  }
  function _initStars(count) {
    const W = window.innerWidth, H = window.innerHeight;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.4 + Math.random() * 1.6,
      base: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.015 + Math.random() * 0.02
    }));
  }
  function _initMatrix() {
    const W = window.innerWidth;
    const cols = Math.floor(W / 16);
    particles = Array.from({ length: cols }, (_, i) => ({
      x: i * 16 + 4,
      y: -Math.random() * window.innerHeight,
      vy: 2 + Math.random() * 4,
      char: _matrixChar()
    }));
  }
  function _matrixChar() {
    const s = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ01ﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ$';
    return s[Math.floor(Math.random() * s.length)];
  }
  function _initFireflies(count) {
    const W = window.innerWidth, H = window.innerHeight;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 2 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.03 + Math.random() * 0.03
    }));
  }
  function _initConfetti(count) {
    const W = window.innerWidth, H = window.innerHeight;
    const palette = ['#D4AF37', '#f43f5e', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      w: 4 + Math.random() * 4,
      h: 2 + Math.random() * 3,
      vy: 0.6 + Math.random() * 1.2,
      vx: (Math.random() - 0.5) * 0.8,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.05,
      color: palette[Math.floor(Math.random() * palette.length)],
      opacity: 0.35 + Math.random() * 0.35
    }));
  }
  function _initBubbles(count) {
    const W = window.innerWidth, H = window.innerHeight;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: H + Math.random() * H,
      r: 3 + Math.random() * 12,
      vy: 0.4 + Math.random() * 1.1,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.01 + Math.random() * 0.02,
      opacity: 0.1 + Math.random() * 0.25
    }));
  }

  // ── Renderers ──────────────────────────────────────────────────────────
  function _drawSnow() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.sway += p.swaySpeed;
      p.x += p.vx + Math.sin(p.sway) * 0.4;
      p.y += p.vy;
      if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; }
      if (p.x < -5) p.x = W + 5;
      if (p.x > W + 5) p.x = -5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
      ctx.fill();
    }
  }
  function _drawRain() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y > H) { p.y = -20; p.x = Math.random() * W * 1.2 - 100; }
      ctx.strokeStyle = `rgba(180,210,240,${p.opacity})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 1.5, p.y - p.len);
      ctx.stroke();
    }
  }
  function _drawStars() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.phase += p.speed;
      const twinkle = p.base + Math.sin(p.phase) * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212,175,55,${Math.max(0, twinkle)})`;
      ctx.fill();
      // Subtle glow
      if (p.r > 1) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212,175,55,${twinkle * 0.06})`;
        ctx.fill();
      }
    }
  }
  function _drawMatrix() {
    const W = window.innerWidth, H = window.innerHeight;
    // Trail fade instead of full clear
    ctx.fillStyle = 'rgba(8,8,8,0.15)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '13px monospace';
    for (const p of particles) {
      p.y += p.vy;
      if (Math.random() < 0.06) p.char = _matrixChar();
      ctx.fillStyle = 'rgba(74,222,128,0.85)';
      ctx.fillText(p.char, p.x, p.y);
      // Fading trail behind
      ctx.fillStyle = 'rgba(34,197,94,0.35)';
      ctx.fillText(p.char, p.x, p.y - 16);
      if (p.y > H + 20) {
        p.y = -20;
        p.vy = 2 + Math.random() * 4;
      }
    }
  }
  function _drawFireflies() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.phase += p.speed;
      p.x += p.vx + Math.sin(p.phase) * 0.3;
      p.y += p.vy + Math.cos(p.phase) * 0.3;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      const glow = 0.4 + Math.sin(p.phase) * 0.4;
      // Outer glow
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      grad.addColorStop(0, `rgba(255,220,120,${glow * 0.55})`);
      grad.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.r * 6, p.y - p.r * 6, p.r * 12, p.r * 12);
      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,240,170,${glow})`;
      ctx.fill();
    }
  }
  function _drawConfetti() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.rot += p.spin;
      p.y += p.vy;
      p.x += p.vx;
      if (p.y > H + 10) { p.y = -20; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W;
      if (p.x > W + 10) p.x = -10;
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
  function _drawBubbles() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.sway += p.swaySpeed;
      p.y -= p.vy;
      p.x += Math.sin(p.sway) * 0.6;
      if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(150,200,255,${p.opacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Highlight
      ctx.beginPath();
      ctx.arc(p.x - p.r / 3, p.y - p.r / 3, p.r / 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${p.opacity * 0.6})`;
      ctx.fill();
    }
  }

  // ── Aurora (CSS-only, no canvas) ───────────────────────────────────────
  function _mountAurora() {
    if (auroraEl) return;
    auroraEl = document.createElement('div');
    auroraEl.id = 'alp-ambient-aurora';
    auroraEl.style.cssText = [
      'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:0',
      'overflow:hidden', 'opacity:0', 'transition:opacity 500ms ease'
    ].join(';');
    auroraEl.innerHTML = `
      <style>
        #alp-ambient-aurora .aur-blob {
          position: absolute; border-radius: 50%; filter: blur(80px);
          mix-blend-mode: screen;
        }
        #alp-ambient-aurora .aur-1 {
          width: 60vmax; height: 60vmax; left: -10vw; top: -20vh;
          background: radial-gradient(circle, rgba(139,92,246,0.35), transparent 65%);
          animation: aurDrift1 25s ease-in-out infinite;
        }
        #alp-ambient-aurora .aur-2 {
          width: 55vmax; height: 55vmax; right: -15vw; bottom: -20vh;
          background: radial-gradient(circle, rgba(212,175,55,0.28), transparent 65%);
          animation: aurDrift2 30s ease-in-out infinite;
        }
        #alp-ambient-aurora .aur-3 {
          width: 45vmax; height: 45vmax; left: 30vw; top: 30vh;
          background: radial-gradient(circle, rgba(56,189,248,0.22), transparent 65%);
          animation: aurDrift3 35s ease-in-out infinite;
        }
        @keyframes aurDrift1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%     { transform: translate(15vw,10vh) scale(1.15); }
          66%     { transform: translate(-10vw,20vh) scale(0.9); }
        }
        @keyframes aurDrift2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%     { transform: translate(-20vw,-15vh) scale(1.1); }
          66%     { transform: translate(10vw,-10vh) scale(0.95); }
        }
        @keyframes aurDrift3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%     { transform: translate(-25vw,15vh) scale(1.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          #alp-ambient-aurora .aur-blob { animation: none !important; }
        }
      </style>
      <div class="aur-blob aur-1"></div>
      <div class="aur-blob aur-2"></div>
      <div class="aur-blob aur-3"></div>
    `;
    document.body.appendChild(auroraEl);
    requestAnimationFrame(() => { auroraEl.style.opacity = '1'; });
  }

  // ── Main loop dispatch ─────────────────────────────────────────────────
  const RENDERERS = {
    snow:      _drawSnow,
    rain:      _drawRain,
    stars:     _drawStars,
    matrix:    _drawMatrix,
    fireflies: _drawFireflies,
    confetti:  _drawConfetti,
    bubbles:   _drawBubbles,
  };

  function _loop() {
    const r = RENDERERS[currentMode];
    if (!r) return;
    r();
    if (!REDUCE) rafId = requestAnimationFrame(_loop);
  }

  function set(mode) {
    if (!OPTIONS.includes(mode)) mode = 'none';
    _writeMode(mode);
    _stop();
    currentMode = mode;
    if (mode === 'none') {
      document.body.removeAttribute('data-ambient-active');
      return;
    }
    document.body.setAttribute('data-ambient-active', mode);
    if (mode === 'aurora') { _ensureVisibilityCss(); _mountAurora(); return; }
    _ensureCanvas();
    canvas.style.opacity = '0.7';
    // Population counts tuned per mode
    const counts = { snow: 90, rain: 120, stars: 80, matrix: 0, fireflies: 40, confetti: 45, bubbles: 25 };
    if (mode === 'snow')      _initSnow(counts.snow);
    if (mode === 'rain')      _initRain(counts.rain);
    if (mode === 'stars')     _initStars(counts.stars);
    if (mode === 'matrix')    _initMatrix();
    if (mode === 'fireflies') _initFireflies(counts.fireflies);
    if (mode === 'confetti')  _initConfetti(counts.confetti);
    if (mode === 'bubbles')   _initBubbles(counts.bubbles);
    _loop();
    // Re-init particles on resize so counts scale sensibly
    window.addEventListener('resize', _debounce(() => {
      if (currentMode === mode) set(mode);
    }, 250), { once: true });
  }

  function get() { return currentMode || _readMode(); }
  function options() { return OPTIONS.slice(); }

  window.ALPAmbient = { set, get, options };

  // Boot with saved preference
  function boot() {
    const saved = _readMode();
    if (saved && saved !== 'none') set(saved);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
