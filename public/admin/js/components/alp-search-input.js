/**
 * ALP - Search Input
 * Search box with icon, clear (×) button, and optional result count.
 * Emits an 'alp-search' CustomEvent on the input element with detail = query.
 *
 * Usage — declarative:
 *   <div id="my-search"></div>
 *   const el = document.getElementById('my-search');
 *   el.innerHTML = AlpSearchInput.render({
 *     id: 'sites-search',
 *     placeholder: 'Search sites…',
 *     debounceMs: 250,
 *   });
 *   AlpSearchInput.attach(el, (q, meta) => renderList(q));
 *   // Later: AlpSearchInput.setCount(el, `${n} results`);
 */
window.AlpSearchInput = (function () {
  'use strict';
  const esc = (window.AlpUtil && window.AlpUtil.escapeHtml)
    || function (s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  const debounce = (window.AlpUtil && window.AlpUtil.debounce)
    || function (fn, ms) { let t; return function () { clearTimeout(t); const a = arguments, s = this; t = setTimeout(() => fn.apply(s, a), ms); }; };

  function render(opts) {
    opts = opts || {};
    const id = esc(opts.id || 'alp-search-' + Math.random().toString(36).slice(2, 8));
    const placeholder = esc(opts.placeholder || 'Search…');
    const value = opts.value ? esc(opts.value) : '';
    return `
      <div class="alp-search" data-search-id="${id}">
        <span class="alp-search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </span>
        <input type="text" id="${id}" class="alp-search-input" placeholder="${placeholder}" value="${value}" autocomplete="off" spellcheck="false" />
        <button type="button" class="alp-search-clear" style="${value ? '' : 'display:none;'}" title="Clear">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span class="alp-search-count" style="display:none;"></span>
      </div>
    `;
  }

  /**
   * Attach handlers. Fires onQuery(query, { inputEl }) after debounce.
   * @param {HTMLElement} rootEl element containing the rendered .alp-search
   * @param {Function} onQuery
   * @param {object} [opts] { debounceMs = 250 }
   */
  function attach(rootEl, onQuery, opts) {
    if (!rootEl) return;
    opts = opts || {};
    const wrap    = rootEl.querySelector('.alp-search') || rootEl;
    const input   = wrap.querySelector('.alp-search-input');
    const clear   = wrap.querySelector('.alp-search-clear');
    if (!input) return;

    const fire = (q) => {
      if (typeof onQuery === 'function') { try { onQuery(q, { inputEl: input }); } catch (_) {} }
      input.dispatchEvent(new CustomEvent('alp-search', { detail: q, bubbles: true }));
    };
    const fireDebounced = debounce((q) => fire(q), opts.debounceMs != null ? opts.debounceMs : 250);

    input.addEventListener('input', (e) => {
      const q = e.target.value;
      clear.style.display = q ? 'inline-flex' : 'none';
      fireDebounced(q.trim());
    });
    clear.addEventListener('click', () => {
      input.value = '';
      clear.style.display = 'none';
      input.focus();
      fire('');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        clear.style.display = 'none';
        fire('');
      }
    });
  }

  /**
   * Show a result-count pill next to the search input.
   * @param {HTMLElement} rootEl
   * @param {string|null} text  null/'' to hide
   */
  function setCount(rootEl, text) {
    if (!rootEl) return;
    const el = rootEl.querySelector('.alp-search-count');
    if (!el) return;
    if (text) { el.textContent = text; el.style.display = 'inline-flex'; }
    else { el.style.display = 'none'; el.textContent = ''; }
  }

  function getValue(rootEl) {
    const inp = rootEl && rootEl.querySelector('.alp-search-input');
    return inp ? inp.value.trim() : '';
  }

  return { render, attach, setCount, getValue };
})();
