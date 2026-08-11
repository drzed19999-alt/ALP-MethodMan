/**
 * ALP - Password Input
 * <input type="password"> with a show/hide toggle button.
 *
 * Usage:
 *   container.innerHTML = AlpPasswordInput.render({
 *     id: 'my-password',
 *     placeholder: 'Enter password',
 *     value: '',
 *     autocomplete: 'new-password',
 *   });
 *   AlpPasswordInput.attach(container);   // wires up show/hide toggle
 *
 * Autocomplete note: password managers can be aggressive about filling fields.
 * Pass autocomplete='off' + a random name to opt out for secret storage
 * (as settings-sections.js does for the deploy SSH pass).
 */
window.AlpPasswordInput = (function () {
  'use strict';
  const esc = (window.AlpUtil && window.AlpUtil.escapeHtml)
    || function (s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

  function render(opts) {
    opts = opts || {};
    const id = esc(opts.id || 'alp-pass-' + Math.random().toString(36).slice(2, 8));
    const placeholder = esc(opts.placeholder || 'Password');
    const value = opts.value ? esc(opts.value) : '';
    const autocomplete = esc(opts.autocomplete || 'current-password');
    const name = esc(opts.name || id);
    const readonly = opts.readonly ? 'readonly' : '';
    return `
      <div class="alp-pass" data-pass-id="${id}">
        <input type="password" id="${id}" name="${name}" class="alp-pass-input" placeholder="${placeholder}" value="${value}" autocomplete="${autocomplete}" data-lpignore="true" ${readonly} />
        <button type="button" class="alp-pass-toggle" title="Show password" aria-label="Toggle password visibility">
          <svg class="alp-pass-eye" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <svg class="alp-pass-eye-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.77 19.77 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.79 19.79 0 01-3.22 4.19M12 12a3 3 0 11-6 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        </button>
      </div>
    `;
  }

  function attach(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.alp-pass').forEach((wrap) => {
      if (wrap.__alp_attached) return;
      wrap.__alp_attached = true;
      const input  = wrap.querySelector('.alp-pass-input');
      const toggle = wrap.querySelector('.alp-pass-toggle');
      const eye    = wrap.querySelector('.alp-pass-eye');
      const eyeOff = wrap.querySelector('.alp-pass-eye-off');
      if (!input || !toggle) return;
      toggle.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        eye.style.display    = showing ? 'block' : 'none';
        eyeOff.style.display = showing ? 'none'  : 'block';
        toggle.setAttribute('title', showing ? 'Show password' : 'Hide password');
      });
    });
  }

  return { render, attach };
})();
