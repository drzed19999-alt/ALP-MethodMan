/**
 * ALP Toast Notifications
 * Slide-in from top-right, auto-dismiss, stackable.
 */
const ALPToast = (() => {
  let container = null;
  let toastCount = 0;

  const ICONS = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  };

  const COLORS = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  // ─── Position ─────────────────────────────────────────────────────────
  // Users pick left | right | center (top-anchored) in Settings. Persisted
  // to localStorage; changing it re-anchors the container and swaps the
  // slide-in direction on every subsequent toast.
  const POSITION_KEY = 'alp_toast_position';
  const VALID_POSITIONS = ['left', 'right', 'center'];

  function _getPosition() {
    try {
      const v = localStorage.getItem(POSITION_KEY);
      return VALID_POSITIONS.includes(v) ? v : 'left';
    } catch { return 'left'; }
  }

  function _anchorContainer(pos) {
    if (!container) return;
    container.style.left = '';
    container.style.right = '';
    container.style.transform = '';
    container.style.alignItems = 'flex-start';
    const isNarrow = window.innerWidth <= 480;
    const edge = isNarrow ? '12px' : '20px';
    if (pos === 'right') {
      container.style.right = edge;
      container.style.alignItems = 'flex-end';
    } else if (pos === 'center') {
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.alignItems = 'center';
    } else {
      container.style.left = edge;
    }
    container.dataset.pos = pos;
  }

  function setPosition(pos) {
    if (!VALID_POSITIONS.includes(pos)) pos = 'left';
    try { localStorage.setItem(POSITION_KEY, pos); } catch {}
    _ensureContainer();
    _anchorContainer(pos);
  }
  function getPosition() { return _getPosition(); }

  function _ensureContainer() {
    if (container && document.body.contains(container)) return;

    // Reuse static #toast-container from index.html so we never create duplicate IDs
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    container.className = 'alp-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    Object.assign(container.style, {
      position: 'fixed',
      top: 'calc(var(--banner-offset, 0px) + 16px)',
      zIndex: 'var(--z-toast, 800)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: 'calc(100dvh - 32px)',
      overflow: 'hidden'
    });
    _anchorContainer(_getPosition());
  }

  function _injectThemeCss() {
    if (document.getElementById('__alp_toast_css__')) return;
    const style = document.createElement('style');
    style.id = '__alp_toast_css__';
    style.textContent = `
      .alp-toast {
        display:flex; align-items:center; gap:12px;
        min-width:0; width:min(380px, calc(100vw - 24px)); max-width:100%; padding:14px 16px;
        border-radius:10px; font-size:13.5px; font-weight:500;
        font-family:'Inter',sans-serif; cursor:default;
        pointer-events:auto;
        transform: translateX(120%) scale(0.9); opacity:0;
        transition: transform 350ms cubic-bezier(0.34,1.56,0.64,1), opacity 350ms ease, box-shadow 300ms ease;
        background: rgba(18, 18, 28, 0.90);
        color: #e2e8f0;
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 4px solid var(--toast-accent, #3b82f6);
        backdrop-filter: blur(12px) saturate(180%);
        -webkit-backdrop-filter: blur(12px) saturate(180%);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        box-sizing: border-box;
      }
      .alp-toast .toast-icon { flex-shrink:0; display:flex; align-items:center; color: var(--toast-accent, #3b82f6); }
      .alp-toast .toast-message { flex:1; min-width:0; line-height:1.4; overflow-wrap:anywhere; }
      .alp-toast .toast-close {
        background:none; border:none; font-size:20px; cursor:pointer;
        width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;
        padding:0; line-height:1; flex-shrink:0; opacity:.55;
        transition: opacity 150ms ease;
        color:#94a3b8;
      }
      .alp-toast .toast-close:hover { opacity:1; }

      /* Light theme — preserve semantic left accent border instead of wiping it with border shorthand */
      html[data-theme='light'] .alp-toast,
      [data-theme='light'] .alp-toast {
        background: #FFFFFF !important;
        color: #0F172A !important;
        border-top: 1px solid #E2E8F0 !important;
        border-right: 1px solid #E2E8F0 !important;
        border-bottom: 1px solid #E2E8F0 !important;
        border-left: 4px solid var(--toast-accent, #3b82f6) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02) !important;
      }
      html[data-theme='light'] .alp-toast .toast-message,
      [data-theme='light'] .alp-toast .toast-message { color: #0F172A !important; }
      html[data-theme='light'] .alp-toast .toast-close,
      [data-theme='light'] .alp-toast .toast-close { color: #64748B !important; }
    `;
    document.head.appendChild(style);
  }

  // Slide-in start position per anchor. Right → from right, Left → from left,
  // Center → drop-down. Reused for the exit transform when dismissed.
  function _enterTransformFor(pos) {
    if (pos === 'right')  return 'translateX(120%) scale(0.9)';
    if (pos === 'center') return 'translateY(-24px) scale(0.94)';
    return 'translateX(-120%) scale(0.9)'; // left (default)
  }
  function _restingTransformFor(pos) {
    return pos === 'center' ? 'translateY(0) scale(1)' : 'translateX(0) scale(1)';
  }

  function showToast(message, type = 'info', duration = 3000) {
    _ensureContainer();
    _injectThemeCss();

    const pos = _getPosition();
    const id = `toast-${++toastCount}`;
    const color = COLORS[type] || COLORS.info;
    const icon = ICONS[type] || ICONS.info;

    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'alp-toast';
    toast.dataset.pos = pos;
    toast.setAttribute('role', 'alert');
    toast.style.setProperty('--toast-accent', color);
    // Seed the pre-enter transform so the FLIP-style transition runs cleanly
    toast.style.transform = _enterTransformFor(pos);
    toast.style.opacity = '0';
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${_escapeHtml(message)}</div>
      <button type="button" class="toast-close" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => _dismissToast(toast));

    container.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = _restingTransformFor(pos);
        toast.style.opacity = '1';
      });
    });

    // Auto-dismiss
    if (duration > 0) {
      toast._dismissTimer = setTimeout(() => _dismissToast(toast), duration);
      toast.addEventListener('mouseenter', () => { clearTimeout(toast._dismissTimer); });
      toast.addEventListener('mouseleave', () => {
        toast._dismissTimer = setTimeout(() => _dismissToast(toast), duration);
      });
    }

    return id;
  }

  function _dismissToast(toast) {
    if (!toast || !toast.parentNode) return;

    clearTimeout(toast._dismissTimer);
    const pos = toast.dataset.pos || _getPosition();
    toast.style.transform = _enterTransformFor(pos);
    toast.style.opacity = '0';

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { showToast, show: showToast, setPosition, getPosition };
})();

// Export globally
window.ALPToast = ALPToast;
window.showToast = ALPToast.showToast;
