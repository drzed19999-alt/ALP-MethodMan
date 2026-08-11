/**
 * ALP - Confirm Dialog
 * Promise-based confirmation modal. Replaces the ad-hoc delete confirms that
 * every page invents. Backed by native <dialog> — no dependency on modal.js.
 *
 * Usage:
 *   const ok = await AlpConfirm.show({
 *     title: 'Delete domain?',
 *     body:  'This removes DNS records and origin config. Cannot be undone.',
 *     confirmLabel: 'Delete',
 *     variant: 'danger',
 *   });
 *   if (ok) { … }
 *
 * Shortcuts:
 *   AlpConfirm.danger(opts) → variant='danger'
 *   AlpConfirm.warn(opts)   → variant='warning'
 *   AlpConfirm.ask(opts)    → variant='info'
 */
window.AlpConfirm = (function () {
  'use strict';
  const esc = (window.AlpUtil && window.AlpUtil.escapeHtml)
    || function (s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

  function _ensureRoot() {
    let root = document.getElementById('alp-confirm-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'alp-confirm-root';
      document.body.appendChild(root);
    }
    return root;
  }

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} [opts.body]        Plain text or HTML (see opts.htmlBody)
   * @param {boolean} [opts.htmlBody]   Treat body as raw HTML
   * @param {string} [opts.confirmLabel='Confirm']
   * @param {string} [opts.cancelLabel='Cancel']
   * @param {'info'|'warning'|'danger'} [opts.variant='info']
   * @returns {Promise<boolean>}
   */
  function show(opts) {
    return new Promise((resolve) => {
      opts = opts || {};
      const variant = ['info', 'warning', 'danger'].includes(opts.variant) ? opts.variant : 'info';
      const title = esc(opts.title || 'Confirm');
      const body  = opts.body
        ? `<div class="alp-confirm-body">${opts.htmlBody ? opts.body : esc(opts.body)}</div>`
        : '';
      const confirmLabel = esc(opts.confirmLabel || 'Confirm');
      const cancelLabel  = esc(opts.cancelLabel  || 'Cancel');
      const confirmCls = 'alp-confirm-btn alp-confirm-btn--' + variant;

      const overlay = document.createElement('div');
      overlay.className = 'alp-confirm-overlay';
      overlay.innerHTML = `
        <div class="alp-confirm-modal alp-confirm-modal--${variant}" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="alp-confirm-title">${title}</div>
          ${body}
          <div class="alp-confirm-actions">
            <button type="button" class="alp-confirm-btn alp-confirm-btn--cancel">${cancelLabel}</button>
            <button type="button" class="${confirmCls}">${confirmLabel}</button>
          </div>
        </div>
      `;
      _ensureRoot().appendChild(overlay);

      const modal   = overlay.querySelector('.alp-confirm-modal');
      const cancel  = overlay.querySelector('.alp-confirm-btn--cancel');
      const confirm = overlay.querySelector('.' + confirmCls.split(' ').join('.'));

      const done = (value) => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('alp-confirm-out');
        setTimeout(() => overlay.remove(), 140);
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') done(false);
        else if (e.key === 'Enter') done(true);
      };
      cancel.addEventListener('click', () => done(false));
      confirm.addEventListener('click', () => done(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
      document.addEventListener('keydown', onKey);

      // Autofocus the confirm button. For destructive actions, autofocus
      // cancel instead to reduce accidental clicks.
      setTimeout(() => (variant === 'danger' ? cancel : confirm).focus(), 30);
    });
  }

  return {
    show,
    danger: (opts) => show({ ...opts, variant: 'danger' }),
    warn:   (opts) => show({ ...opts, variant: 'warning' }),
    ask:    (opts) => show({ ...opts, variant: 'info' }),
  };
})();
