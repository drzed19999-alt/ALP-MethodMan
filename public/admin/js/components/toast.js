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
  function showToast(message, type = 'info', duration = 3000) {
    _ensureContainer();

    const id = `toast-${++toastCount}`;
    const color = COLORS[type] || COLORS.info;
    const icon = ICONS[type] || ICONS.info;

    const toast = document.createElement('div');
    toast.id = id;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${_escapeHtml(message)}</div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;
    Object.assign(toast.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      minWidth: '320px',
      maxWidth: '420px',
      padding: '14px 16px',
      background: 'rgba(18, 18, 28, 0.85)',
      backdropFilter: 'blur(12px) saturate(180%)',
      webkitBackdropFilter: 'blur(12px) saturate(180%)',
      borderLeft: `4px solid ${color}`,
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderLeftWidth: '4px',
      borderRadius: '10px',
      boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 15px ${color}1a`,
      pointerEvents: 'auto',
      transform: 'translateX(120%) scale(0.9)',
      opacity: '0',
      transition: 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 350ms ease, box-shadow 300ms ease',
      fontSize: '13.5px',
      fontWeight: '500',
      color: 'var(--text-primary, #e2e8f0)',
      cursor: 'default',
      fontFamily: "'Inter', sans-serif"
    });

    // Icon style
    const iconEl = toast.querySelector('.toast-icon');
    Object.assign(iconEl.style, {
      flexShrink: '0',
      color: color,
      display: 'flex',
      alignItems: 'center'
    });

    // Message style
    const msgEl = toast.querySelector('.toast-message');
    Object.assign(msgEl.style, {
      flex: '1',
      lineHeight: '1.4'
    });

    // Close button style
    const closeBtn = toast.querySelector('.toast-close');
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      color: 'var(--text-secondary, #94a3b8)',
      fontSize: '20px',
      cursor: 'pointer',
      padding: '0 2px',
      lineHeight: '1',
      flexShrink: '0',
      opacity: '0.6',
      transition: 'opacity 150ms ease'
    });
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.opacity = '1'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.opacity = '0.6'; });
    closeBtn.addEventListener('click', () => _dismissToast(toast));

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

      // Pause on hover
      toast.addEventListener('mouseenter', () => {
        clearTimeout(toast._dismissTimer);
        toast.style.boxShadow = `0 12px 40px rgba(0,0,0,0.5), 0 0 20px ${color}33`;
      });
      toast.addEventListener('mouseleave', () => {
        toast._dismissTimer = setTimeout(() => _dismissToast(toast), duration);
        toast.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 15px ${color}1a`;
      });
    } else {
      toast.addEventListener('mouseenter', () => {
        toast.style.boxShadow = `0 12px 40px rgba(0,0,0,0.5), 0 0 20px ${color}33`;
      });
      toast.addEventListener('mouseleave', () => {
        toast.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 15px ${color}1a`;
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
