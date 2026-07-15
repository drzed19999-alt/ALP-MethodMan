/**
 * ALP Modal Component
 * Configurable modal with animations, backdrop close, and keyboard support.
 */
const ALPModal = (() => {
  let overlay = null;
  let currentOptions = null;
  let _escHandler = null;
  let _hideTimer = null;

  const TYPE_COLORS = {
    danger: '#ef4444',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#6366f1',
    default: '#6366f1'
  };

  /**
   * Show a modal dialog.
   * @param {Object} options
   * @param {string} options.title - Modal title
   * @param {string} options.content - HTML content for the modal body
   * @param {Function} [options.onConfirm] - Confirm callback
   * @param {Function} [options.onCancel] - Cancel callback
   * @param {string} [options.confirmText='Confirm'] - Confirm button text
   * @param {string} [options.cancelText='Cancel'] - Cancel button text
   * @param {string} [options.type='default'] - Modal type for styling (danger, warning, success, info, default)
   * @param {boolean} [options.showCancel=true] - Whether to show cancel button
   * @param {boolean} [options.closeOnBackdrop=true] - Close when clicking backdrop
   */
  function showModal(options = {}) {
    // Cancel any pending close animation before replacing
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    if (overlay) {
      _removeOverlay();
    }

    currentOptions = {
      title: options.title || 'Confirm',
      content: options.content || '',
      onConfirm: options.onConfirm || null,
      onCancel: options.onCancel || null,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      type: options.type || 'default',
      showCancel: options.showCancel !== false,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      hideButtons: options.hideButtons || false,
      width: options.width || '480px'
    };

    const accentColor = TYPE_COLORS[currentOptions.type] || TYPE_COLORS.default;

    // Create overlay
    overlay = document.createElement('div');
    overlay.className = 'alp-modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '9999',
      opacity: '0',
      transition: 'opacity 200ms ease',
      padding: '20px'
    });

    // Modal container
    overlay.innerHTML = `
      <div class="alp-modal" style="
        background: var(--bg-card, #12121a);
        border: 1px solid var(--border-color, #1e1e2e);
        border-radius: 12px;
        max-width: ${currentOptions.width};
        width: 100%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        transform: scale(0.9) translateY(20px);
        opacity: 0;
        transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease;
        overflow: hidden;
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 40px);
      ">
        <div class="alp-modal-header" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-color, #1e1e2e);
        ">
          <h3 style="
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary, #e2e8f0);
          ">${_escapeHtml(currentOptions.title)}</h3>
          <button class="alp-modal-close" aria-label="Close modal" style="
            background: none;
            border: none;
            color: var(--text-secondary, #94a3b8);
            font-size: 22px;
            cursor: pointer;
            padding: 4px;
            line-height: 1;
            border-radius: 6px;
            transition: background 150ms ease, color 150ms ease;
          ">&times;</button>
        </div>
        <div class="alp-modal-body" style="
          padding: 20px 24px;
          color: var(--text-secondary, #94a3b8);
          font-size: 14px;
          line-height: 1.6;
          overflow-y: auto;
          flex: 1;
        ">${currentOptions.content}</div>
        ${currentOptions.hideButtons ? '' : `
        <div class="alp-modal-footer" style="
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px 20px;
          border-top: 1px solid var(--border-color, #1e1e2e);
        ">
          ${currentOptions.showCancel ? `
            <button class="alp-modal-cancel" style="
              padding: 10px 20px;
              border: 1px solid var(--border-color, #1e1e2e);
              background: transparent;
              color: var(--text-secondary, #94a3b8);
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: background 150ms ease, border-color 150ms ease;
              font-family: 'Inter', sans-serif;
            ">${_escapeHtml(currentOptions.cancelText)}</button>
          ` : ''}
          <button class="alp-modal-confirm" style="
            padding: 10px 20px;
            border: none;
            background: ${accentColor};
            color: #ffffff;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 150ms ease, transform 100ms ease;
            font-family: 'Inter', sans-serif;
          ">${_escapeHtml(currentOptions.confirmText)}</button>
        </div>
        `}
      </div>
    `;

    document.body.appendChild(overlay);

    // Bind events
    const modal = overlay.querySelector('.alp-modal');
    const closeBtn = overlay.querySelector('.alp-modal-close');
    const cancelBtn = overlay.querySelector('.alp-modal-cancel');
    const confirmBtn = overlay.querySelector('.alp-modal-confirm');

    closeBtn.addEventListener('click', () => _handleCancel());
    if (cancelBtn) cancelBtn.addEventListener('click', () => _handleCancel());
    if (confirmBtn) confirmBtn.addEventListener('click', () => _handleConfirm());

    // Hover states
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'var(--bg-secondary, #1e1e2e)';
      closeBtn.style.color = 'var(--text-primary, #e2e8f0)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'none';
      closeBtn.style.color = 'var(--text-secondary, #94a3b8)';
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.borderColor = 'var(--text-secondary, #94a3b8)';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.borderColor = 'var(--border-color, #1e1e2e)';
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.opacity = '0.85'; });
      confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.opacity = '1'; });
      confirmBtn.addEventListener('mousedown', () => { confirmBtn.style.transform = 'scale(0.97)'; });
      confirmBtn.addEventListener('mouseup', () => { confirmBtn.style.transform = 'scale(1)'; });
    }

    // Backdrop click
    if (currentOptions.closeOnBackdrop) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) _handleCancel();
      });
    }

    // Escape key
    _escHandler = (e) => {
      if (e.key === 'Escape') _handleCancel();
    };
    document.addEventListener('keydown', _escHandler);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1) translateY(0)';
        modal.style.opacity = '1';
      });
    });

    // Focus confirm button
    if (confirmBtn) confirmBtn.focus();
  }

  function hideModal() {
    if (!overlay) return;

    const modal = overlay.querySelector('.alp-modal');
    overlay.style.opacity = '0';
    if (modal) {
      modal.style.transform = 'scale(0.9) translateY(20px)';
      modal.style.opacity = '0';
    }

    _hideTimer = setTimeout(() => {
      _removeOverlay();
    }, 200);
  }

  async function _handleConfirm() {
    if (!currentOptions || !currentOptions.onConfirm) {
      hideModal();
      return;
    }

    const confirmBtn = overlay && overlay.querySelector('.alp-modal-confirm');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.6';
      confirmBtn.style.cursor = 'not-allowed';
    }

    try {
      await currentOptions.onConfirm();
      hideModal();
    } catch (err) {
      // Re-enable button so user can try again or cancel
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
      }
    }
  }

  function _handleCancel() {
    if (currentOptions && currentOptions.onCancel) {
      currentOptions.onCancel();
    }
    hideModal();
  }

  function _removeOverlay() {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    currentOptions = null;
    document.body.style.overflow = '';

    if (_escHandler) {
      document.removeEventListener('keydown', _escHandler);
      _escHandler = null;
    }
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { showModal, hideModal };
})();

// Export globally
window.ALPModal = ALPModal;
window.showModal = ALPModal.showModal;
window.hideModal = ALPModal.hideModal;
window.closeModal = ALPModal.hideModal;
