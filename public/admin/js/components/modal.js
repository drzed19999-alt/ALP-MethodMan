/**
 * ALP Modal Component — Gold Premium Edition
 */
'use strict';
const ALPModal = (() => {
  let overlay = null;
  let opts = null;
  let _esc = null;
  let _t = null;
  let _prevFocus = null;

  const TC = {
    danger:  { c:'#ef4444', g:'linear-gradient(135deg,#ef4444,#dc2626)', s:'rgba(239,68,68,.25)',  ri:'239,68,68',   i:'⚠',  b:'.3'  },
    warning: { c:'#f59e0b', g:'linear-gradient(135deg,#f59e0b,#d97706)', s:'rgba(245,158,11,.2)',  ri:'245,158,11',  i:'⚡', b:'.25' },
    success: { c:'#10b981', g:'linear-gradient(135deg,#10b981,#059669)', s:'rgba(16,185,129,.2)',  ri:'16,185,129',  i:'✓',  b:'.25' },
    info:    { c:'#3b82f6', g:'linear-gradient(135deg,#3b82f6,#2563eb)', s:'rgba(59,130,246,.2)',  ri:'59,130,246',  i:'ℹ',  b:'.25' },
    default: { c:'#D4AF37', g:'var(--gradient-primary)',                  s:'rgba(212,175,55,.15)', ri:'212,175,55',  i:'',   b:'.18' },
  };

  function _e(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function showModal(options = {}) {
    if (_t) { clearTimeout(_t); _t = null; }
    if (overlay) _rm();
    _prevFocus = document.activeElement;

    const tc = TC[options.type] || TC.default;
    const widthVal = options.width || '480px';
    const maxWidthRule = options.maxWidth
      ? `min(${widthVal}, ${options.maxWidth})`
      : widthVal;

    opts = {
      title:           options.title || 'Confirm',
      content:         options.content ?? options.message ?? options.html ?? options.body ?? '',
      onConfirm:       options.onConfirm || null,
      onCancel:        options.onCancel || null,
      confirmText:     options.confirmText !== undefined ? options.confirmText : 'Confirm',
      cancelText:      options.cancelText || 'Cancel',
      type:            options.type || 'default',
      showCancel:      options.showCancel !== false && !options.hideCancel,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      hideButtons:     !!(options.hideButtons || options.showFooter === false),
      width:           maxWidthRule,
      tc,
    };

    overlay = document.createElement('div');
    overlay.className = 'alp-modal-overlay';

    const iconHtml = tc.i
      ? `<div class="alp-modal-icon" style="width:36px;height:36px;border-radius:10px;background:${tc.s};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;border:1px solid rgba(${tc.ri},.2);">${tc.i}</div>`
      : '';

    const confirmTextColor = opts.type === 'default' ? 'var(--text-inverse)' : '#ffffff';
    const footHtml = opts.hideButtons ? '' : `
      <div class="alp-mf">
        ${opts.showCancel ? `<button type="button" class="alp-mcc">${_e(opts.cancelText)}</button>` : ''}
        ${opts.confirmText !== null ? `<button type="button" class="alp-mc" style="background:${tc.g};color:${confirmTextColor};box-shadow:0 4px 16px ${tc.s};">${_e(opts.confirmText)}</button>` : ''}
      </div>`;

    overlay.innerHTML = `
      <div class="alp-modal" role="dialog" aria-modal="true" aria-label="${_e(opts.title)}" style="max-width:${opts.width};border-top:3px solid ${tc.c};">
        <div class="alp-mh">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
            ${iconHtml}
            <h3 class="alp-mt">${_e(opts.title)}</h3>
          </div>
          <button type="button" class="alp-mx" aria-label="Close dialog">&times;</button>
        </div>
        <div class="alp-mb">${opts.content}</div>
        ${footHtml}
      </div>`;

    document.body.appendChild(overlay);

    const modal      = overlay.querySelector('.alp-modal');
    const closeBtn   = overlay.querySelector('.alp-mx');
    const cancelBtn  = overlay.querySelector('.alp-mcc');
    const confirmBtn = overlay.querySelector('.alp-mc');

    closeBtn?.addEventListener('click', _cancel);
    cancelBtn?.addEventListener('click', _cancel);
    confirmBtn?.addEventListener('click', _confirm);

    if (opts.closeOnBackdrop) {
      overlay.addEventListener('click', e => { if (e.target === overlay) _cancel(); });
    }

    const FOCUSABLE = 'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable]';
    _esc = e => {
      if (e.key === 'Escape') { _cancel(); return; }
      if (e.key !== 'Tab' || !overlay) return;
      const nodes = Array.from(modal.querySelectorAll(FOCUSABLE))
        .filter(n => n.offsetParent !== null || n === document.activeElement);
      if (!nodes.length) { e.preventDefault(); return; }
      const first = nodes[0];
      const last  = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !modal.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', _esc);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay?.classList.add('is-open');
    }));

    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const firstField = isFinePointer
      ? modal.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])')
      : null;
    (firstField || confirmBtn || closeBtn)?.focus();
  }

  function hideModal() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    _t = setTimeout(_rm, 210);
  }

  async function _confirm() {
    if (!opts?.onConfirm) { hideModal(); return; }
    const btn = overlay?.querySelector('.alp-mc');
    if (btn) { btn.disabled = true; }
    try {
      const result = await opts.onConfirm();
      if (result === false) {
        if (btn) { btn.disabled = false; }
        return;
      }
      hideModal();
    } catch (e) {
      if (btn) { btn.disabled = false; }
    }
  }

  function _cancel() {
    opts?.onCancel?.();
    hideModal();
  }

  function _rm() {
    if (_t) { clearTimeout(_t); _t = null; }
    overlay?.parentNode?.removeChild(overlay);
    overlay = null;
    opts = null;
    document.body.style.overflow = '';
    if (_esc) { document.removeEventListener('keydown', _esc); _esc = null; }
    if (_prevFocus && typeof _prevFocus.focus === 'function' && _prevFocus.isConnected) {
      try { _prevFocus.focus(); } catch {}
    }
    _prevFocus = null;
  }

  // Legacy alias
  function _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { showModal, hideModal };
})();

window.ALPModal = ALPModal;
window.showModal = ALPModal.showModal;
window.hideModal = ALPModal.hideModal;
window.closeModal = ALPModal.hideModal;
