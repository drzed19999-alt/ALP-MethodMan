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

  function _ensureContainer() {
    if (container && document.body.contains(container)) return;

    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '10000',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
      maxHeight: '100vh',
      overflow: 'hidden'
    });
    document.body.appendChild(container);
  }

  /**
   * Show a toast notification.
   * @param {string} message - Toast message text
   * @param {'success'|'error'|'warning'|'info'} type - Toast type
   * @param {number} duration - Auto-dismiss ms, 0 for persistent
   */
  function _injectThemeCss() {
    if (document.getElementById('__alp_toast_css__')) return;
    const style = document.createElement('style');
    style.id = '__alp_toast_css__';
    style.textContent = `
      .alp-toast {
        display:flex; align-items:center; gap:12px;
        min-width:320px; max-width:420px; padding:14px 16px;
        border-radius:10px; font-size:13.5px; font-weight:500;
        font-family:'Inter',sans-serif; cursor:default;
        pointer-events:auto;
        transform: translateX(120%) scale(0.9); opacity:0;
        transition: transform 350ms cubic-bezier(0.34,1.56,0.64,1), opacity 350ms ease, box-shadow 300ms ease;
        /* Dark-theme defaults */
        background: rgba(18, 18, 28, 0.85);
        color: #e2e8f0;
        border: 1px solid rgba(255,255,255,0.08);
        border-left-width: 4px;
        backdrop-filter: blur(12px) saturate(180%);
        -webkit-backdrop-filter: blur(12px) saturate(180%);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      }
      .alp-toast .toast-icon { flex-shrink:0; display:flex; align-items:center; }
      .alp-toast .toast-message { flex:1; line-height:1.4; }
      .alp-toast .toast-close {
        background:none; border:none; font-size:20px; cursor:pointer;
        padding:0 2px; line-height:1; flex-shrink:0; opacity:.55;
        transition: opacity 150ms ease;
        color:#94a3b8;
      }
      .alp-toast .toast-close:hover { opacity:1; }

      /* Light theme — spec: white surface, slate text, colored left border */
      [data-theme='light'] .alp-toast {
        background: #FFFFFF;
        color: #0F172A;
        border: 1px solid #E2E8F0;
        border-left-width: 4px;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02);
      }
      [data-theme='light'] .alp-toast .toast-close { color:#64748B; }
    `;
    document.head.appendChild(style);
  }

  function showToast(message, type = 'info', duration = 3000) {
    _ensureContainer();
    _injectThemeCss();

    const id = `toast-${++toastCount}`;
    const color = COLORS[type] || COLORS.info;
    const icon = ICONS[type] || ICONS.info;

    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'alp-toast';
    toast.setAttribute('role', 'alert');
    toast.style.borderLeftColor = color;
    toast.innerHTML = `
      <div class="toast-icon" style="color:${color};">${icon}</div>
      <div class="toast-message">${_escapeHtml(message)}</div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => _dismissToast(toast));

    container.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0) scale(1)';
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
    toast.style.transform = 'translateX(120%) scale(0.9)';
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

  return { showToast, show: showToast };
})();

// Export globally
window.ALPToast = ALPToast;
window.showToast = ALPToast.showToast;
