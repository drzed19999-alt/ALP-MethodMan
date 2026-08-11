/**
 * ALP - Terminal
 * Mac-style dark terminal panel used for streaming deploy/health/scan output.
 * Structure: header (traffic-light dots + title + status dot), optional steps
 * sidebar on the left, live scrolling log on the right, optional summary bar.
 *
 * Usage:
 *   const term = AlpTerminal.mount(container, {
 *     title: 'Deploying panel…',
 *     steps: [{ id: 'pull', label: 'git pull' }, { id: 'restart', label: 'pm2 restart' }],
 *   });
 *   term.log('Fetching origin/main…');
 *   term.log('✓ pulled 4 commits', { color: '#34d399' });
 *   term.setStep('pull', 'done');
 *   term.setStatus('running');
 *   term.done({ ok: true, summary: '2 steps · 4.1s' });
 *
 * `mount` returns a handle: { log, clear, setStep, setStatus, done, root }.
 */
window.AlpTerminal = (function () {
  'use strict';
  const esc = (window.AlpUtil && window.AlpUtil.escapeHtml)
    || function (s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

  const STATUS_COLORS = {
    idle:     '#64748b',
    running:  '#febc2e',
    ok:       '#28c840',
    error:    '#ff5f57',
  };

  /**
   * Render + mount a terminal into `containerEl`. Returns a handle.
   */
  function mount(containerEl, opts) {
    opts = opts || {};
    const title = esc(opts.title || 'Output');
    const hasSteps = Array.isArray(opts.steps) && opts.steps.length > 0;
    const stepsHtml = hasSteps
      ? `<div class="alp-term-steps">${opts.steps.map(s => stepHtml(s)).join('')}</div>`
      : '';
    containerEl.innerHTML = `
      <div class="alp-term">
        <div class="alp-term-hdr">
          <div class="alp-term-dots">
            <span class="alp-term-dot" style="background:#ff5f57"></span>
            <span class="alp-term-dot" style="background:#febc2e"></span>
            <span class="alp-term-dot" style="background:#28c840"></span>
          </div>
          <span class="alp-term-title">${title}</span>
          <span class="alp-term-status" data-status="idle" style="background:${STATUS_COLORS.idle};"></span>
        </div>
        <div class="alp-term-main${hasSteps ? ' has-steps' : ''}">
          ${stepsHtml}
          <div class="alp-term-log" role="log" aria-live="polite"></div>
        </div>
        <div class="alp-term-summary" style="display:none;"></div>
      </div>
    `;

    const root    = containerEl.querySelector('.alp-term');
    const logEl   = root.querySelector('.alp-term-log');
    const titleEl = root.querySelector('.alp-term-title');
    const statusEl = root.querySelector('.alp-term-status');
    const summaryEl = root.querySelector('.alp-term-summary');
    const stepsEl = root.querySelector('.alp-term-steps');

    function stepHtml(s) {
      const label = esc(s.label || s.id);
      const state = esc(s.state || 'pending');
      return `<div class="alp-term-step alp-term-step--${state}" data-step="${esc(s.id)}">
        <span class="alp-term-step-icon"></span>
        <span class="alp-term-step-label">${label}</span>
      </div>`;
    }

    /**
     * Append one log line.
     * @param {string} line
     * @param {{color?:string, level?:'info'|'warn'|'error'|'ok'}} [opts]
     */
    function log(line, opts) {
      opts = opts || {};
      const level = opts.level || 'info';
      const style = opts.color ? ` style="color:${esc(opts.color)}"` : '';
      const row = document.createElement('div');
      row.className = 'alp-term-line alp-term-line--' + level;
      if (style) row.setAttribute('style', style.slice(7).replace(/"$/, ''));
      row.textContent = String(line);
      logEl.appendChild(row);
      // Auto-scroll if user is near the bottom
      const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
      if (nearBottom) logEl.scrollTop = logEl.scrollHeight;
    }

    function clear() { logEl.innerHTML = ''; if (summaryEl) { summaryEl.style.display = 'none'; summaryEl.textContent = ''; } }

    function setStep(id, state) {
      if (!stepsEl) return;
      const el = stepsEl.querySelector(`[data-step="${CSS.escape(String(id))}"]`);
      if (!el) return;
      el.classList.remove('alp-term-step--pending', 'alp-term-step--running', 'alp-term-step--done', 'alp-term-step--error', 'alp-term-step--warn');
      el.classList.add('alp-term-step--' + state);
    }

    function setStatus(state) {
      const color = STATUS_COLORS[state] || STATUS_COLORS.idle;
      statusEl.style.background = color;
      statusEl.dataset.status = state;
      if (state === 'running') statusEl.classList.add('alp-term-status--pulse');
      else statusEl.classList.remove('alp-term-status--pulse');
    }

    function setTitle(t) { titleEl.textContent = String(t); }

    function done(opts) {
      opts = opts || {};
      setStatus(opts.ok === false ? 'error' : 'ok');
      if (opts.summary != null) {
        summaryEl.textContent = String(opts.summary);
        summaryEl.style.display = 'block';
      }
    }

    return { root, log, clear, setStep, setStatus, setTitle, done };
  }

  return { mount };
})();
