/**
 * ALP Modal Component — Gold Premium Edition
 */
'use strict';
const ALPModal = (() => {
  let overlay = null;
  let opts = null;
  let _esc = null;
  let _t = null;

  const TC = {
    danger:  { c:'#ef4444', g:'linear-gradient(135deg,#ef4444,#dc2626)', s:'rgba(239,68,68,.25)',  ri:'239,68,68',   i:'⚠',  b:'.3'  },
    warning: { c:'#f59e0b', g:'linear-gradient(135deg,#f59e0b,#d97706)', s:'rgba(245,158,11,.2)',  ri:'245,158,11',  i:'⚡', b:'.25' },
    success: { c:'#10b981', g:'linear-gradient(135deg,#10b981,#059669)', s:'rgba(16,185,129,.2)',  ri:'16,185,129',  i:'✓',  b:'.25' },
    info:    { c:'#6366f1', g:'linear-gradient(135deg,#6366f1,#4f46e5)', s:'rgba(99,102,241,.2)',  ri:'99,102,241',  i:'ℹ',  b:'.25' },
    default: { c:'#f59e0b', g:'linear-gradient(135deg,#f59e0b,#d97706)', s:'rgba(245,158,11,.15)', ri:'245,158,11',  i:'',   b:'.18' },
  };

  function _e(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function showModal(options = {}) {
    if (_t) { clearTimeout(_t); _t = null; }
    if (overlay) _rm();

    const tc = TC[options.type] || TC.default;

    opts = {
      title:           options.title || 'Confirm',
      content:         options.content || '',
      onConfirm:       options.onConfirm || null,
      onCancel:        options.onCancel || null,
      confirmText:     options.confirmText !== undefined ? options.confirmText : 'Confirm',
      cancelText:      options.cancelText || 'Cancel',
      type:            options.type || 'default',
      showCancel:      options.showCancel !== false,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      hideButtons:     options.hideButtons || false,
      width:           options.width || '480px',
      tc,
    };

    overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity .2s ease;padding:20px;`;

    const iconHtml = tc.i
      ? `<div style="width:36px;height:36px;border-radius:10px;background:${tc.s};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;border:1px solid rgba(${tc.ri},.2);">${tc.i}</div>`
      : '';

    const footHtml = opts.hideButtons ? '' : `
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 24px 22px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.18);">
        ${opts.showCancel ? `<button class="alp-mcc" style="padding:10px 20px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#94a3b8;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:-.01em;">${_e(opts.cancelText)}</button>` : ''}
        ${opts.confirmText !== null ? `<button class="alp-mc" style="padding:10px 26px;border:none;background:${tc.g};color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 18px ${tc.s};transition:opacity .15s,transform .12s;letter-spacing:-.01em;">${_e(opts.confirmText)}</button>` : ''}
      </div>`;

    overlay.innerHTML = `
      <div class="alp-modal" style="
        background:linear-gradient(150deg,rgba(12,12,22,.99),rgba(8,8,16,.99));
        border:1px solid rgba(${tc.ri},${tc.b});
        border-top:3px solid ${tc.c};
        border-radius:18px;
        max-width:${opts.width};
        width:100%;
        box-shadow:0 32px 96px rgba(0,0,0,.8),0 0 60px ${tc.s};
        transform:scale(0.93) translateY(18px);
        opacity:0;
        transition:transform .32s cubic-bezier(.34,1.56,.64,1),opacity .22s ease;
        overflow:hidden;
        font-family:'Inter',sans-serif;
        display:flex;
        flex-direction:column;
        max-height:calc(100vh - 40px);
      ">
        <div style="display:flex;align-items:center;gap:13px;padding:22px 24px 18px;border-bottom:1px solid rgba(255,255,255,.07);">
          ${iconHtml}
          <h3 style="margin:0;font-size:17px;font-weight:700;color:#f1f5f9;flex:1;letter-spacing:-.025em;line-height:1.3;">${_e(opts.title)}</h3>
          <button class="alp-mx" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);color:#64748b;font-size:20px;cursor:pointer;padding:0;line-height:1;border-radius:9px;transition:all .15s;flex-shrink:0;">&times;</button>
        </div>
        <div class="alp-mb" style="padding:22px 24px;color:#cbd5e1;font-size:14px;line-height:1.7;overflow-y:auto;flex:1;">${opts.content}</div>
        ${footHtml}
      </div>`;

    document.body.appendChild(overlay);

    const modal   = overlay.querySelector('.alp-modal');
    const closeBtn = overlay.querySelector('.alp-mx');
    const cancelBtn = overlay.querySelector('.alp-mcc');
    const confirmBtn = overlay.querySelector('.alp-mc');

    closeBtn?.addEventListener('click', _cancel);
    cancelBtn?.addEventListener('click', _cancel);
    confirmBtn?.addEventListener('click', _confirm);

    closeBtn?.addEventListener('mouseenter', () => { closeBtn.style.background='rgba(255,255,255,.1)'; closeBtn.style.color='#e2e8f0'; });
    closeBtn?.addEventListener('mouseleave', () => { closeBtn.style.background='rgba(255,255,255,.06)'; closeBtn.style.color='#64748b'; });
    cancelBtn?.addEventListener('mouseenter', () => { cancelBtn.style.background='rgba(255,255,255,.08)'; cancelBtn.style.color='#e2e8f0'; cancelBtn.style.borderColor='rgba(255,255,255,.18)'; });
    cancelBtn?.addEventListener('mouseleave', () => { cancelBtn.style.background='rgba(255,255,255,.04)'; cancelBtn.style.color='#94a3b8'; cancelBtn.style.borderColor='rgba(255,255,255,.1)'; });
    confirmBtn?.addEventListener('mouseenter', () => { confirmBtn.style.opacity='.85'; confirmBtn.style.transform='translateY(-1px)'; });
    confirmBtn?.addEventListener('mouseleave', () => { confirmBtn.style.opacity='1'; confirmBtn.style.transform='none'; });
    confirmBtn?.addEventListener('mousedown', () => { confirmBtn.style.transform='scale(.96)'; });
    confirmBtn?.addEventListener('mouseup', () => { confirmBtn.style.transform='translateY(-1px)'; });

    if (opts.closeOnBackdrop) {
      overlay.addEventListener('click', e => { if (e.target === overlay) _cancel(); });
    }

    _esc = e => { if (e.key === 'Escape') _cancel(); };
    document.addEventListener('keydown', _esc);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
      modal.style.opacity = '1';
    }));

    if (confirmBtn) confirmBtn.focus();
  }

  function hideModal() {
    if (!overlay) return;
    const modal = overlay.querySelector('.alp-modal');
    overlay.style.opacity = '0';
    if (modal) { modal.style.transform = 'scale(.93) translateY(18px)'; modal.style.opacity = '0'; }
    _t = setTimeout(_rm, 230);
  }

  async function _confirm() {
    if (!opts?.onConfirm) { hideModal(); return; }
    const btn = overlay?.querySelector('.alp-mc');
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed'; }
    try {
      await opts.onConfirm();
      hideModal();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
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
