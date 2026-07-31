/**
 * ALPLoading — global loading state manager
 *
 * Three tiers:
 *   1. Top progress rail — auto-driven by every ALPApi call
 *   2. Page scan overlay  — shown while page data is fetching after navigation
 *   3. Button action state — opt-in per button via ALPLoading.action(btn)
 *
 * Usage:
 *   ALPLoading.action(btn)      → { stop } — wrap any button click
 *   ALPLoading.skeleton(el, n)  → restore() — show skeleton lines in el
 *   ALPLoading.pageReady()      — call after rendering page HTML (app.js)
 */
class ALPLoadingManager {
  constructor() {
    this._count     = 0;       // in-flight request counter
    this._progress  = 0;       // rail fill 0-100
    this._rail      = null;    // .alp-rail DOM node
    this._fill      = null;    // .alp-rail__fill DOM node
    this._trickle   = null;    // setInterval handle
    this._endTimer  = null;    // setTimeout handle for fade-out
    this._scanTimer = null;    // setTimeout for page-scan delay
    this._pageEl    = null;    // cached #page-content node

    // Defer DOM work until body exists
    if (document.body) {
      this._mountRail();
    } else {
      document.addEventListener('DOMContentLoaded', () => this._mountRail());
    }
  }

  // ─── Rail mount ────────────────────────────────────────────────────

  _mountRail() {
    if (this._rail) return;
    const rail = document.createElement('div');
    rail.className = 'alp-rail';
    rail.innerHTML = '<div class="alp-rail__fill"></div>';
    document.body.prepend(rail);
    this._rail = rail;
    this._fill = rail.querySelector('.alp-rail__fill');
  }

  // ─── Public: request lifecycle (called by ALPApi) ──────────────────

  start() {
    this._count++;
    if (this._count === 1) {
      clearTimeout(this._endTimer);
      this._beginRail();
    }
  }

  done() {
    this._count = Math.max(0, this._count - 1);
    if (this._count === 0) {
      this._finishRail();
      this._hideScan();
    }
  }

  // ─── Public: button action state ───────────────────────────────────

  /**
   * Put a button into loading state. Returns { stop } to restore it.
   *
   * @param {HTMLElement} btn
   * @param {string} [label] — optional override text while loading
   * @returns {{ stop: Function }}
   */
  action(btn, label) {
    if (!btn) return { stop: () => {} };

    const original = btn.innerHTML;
    const wasDisabled = btn.disabled;

    const spinEl = document.createElement('span');
    spinEl.className = 'alp-spin';
    spinEl.setAttribute('aria-hidden', 'true');

    btn.disabled = true;
    btn.classList.add('alp-btn-loading');

    if (label) {
      btn.innerHTML = '';
      btn.appendChild(spinEl);
      btn.appendChild(document.createTextNode(label));
    } else {
      btn.prepend(spinEl);
    }

    return {
      stop: () => {
        btn.disabled = wasDisabled;
        btn.classList.remove('alp-btn-loading');
        btn.innerHTML = original;
      }
    };
  }

  // ─── Public: skeleton placeholder ──────────────────────────────────

  /**
   * Fill a container with skeleton lines. Returns a restore function.
   *
   * @param {HTMLElement} el — container to fill
   * @param {number}  [rows=4] — number of skeleton lines
   * @param {'text'|'stats'|'cards'|'rows'} [type='text']
   * @returns {Function} restore — call to put original content back
   */
  skeleton(el, rows = 4, type = 'text') {
    if (!el) return () => {};
    const orig = el.innerHTML;
    el.innerHTML = this._skeletonHtml(rows, type);
    return () => { el.innerHTML = orig; };
  }

  _skeletonHtml(rows, type) {
    if (type === 'stats') {
      return Array.from({ length: rows }, () =>
        `<div class="alp-skeleton alp-skeleton--stat"></div>`
      ).join('');
    }

    if (type === 'cards') {
      const widths = [62, 45, 78, 55, 88];
      return Array.from({ length: rows }, (_, i) => `
        <div class="alp-skeleton-card">
          <div class="alp-skeleton alp-skeleton--line" style="width:${widths[i % 5]}%"></div>
          <div class="alp-skeleton alp-skeleton--line" style="width:${widths[(i + 2) % 5]}%"></div>
          <div class="alp-skeleton alp-skeleton--line" style="width:${widths[(i + 4) % 5]}%"></div>
        </div>
      `).join('');
    }

    if (type === 'rows') {
      return Array.from({ length: rows }, (_, i) => `
        <div class="alp-skeleton-row">
          <div class="alp-skeleton alp-skeleton--line" style="width:${[30, 20, 40, 25][i % 4]}%"></div>
          <div class="alp-skeleton alp-skeleton--line" style="width:${[50, 35, 45, 60][i % 4]}%"></div>
          <div class="alp-skeleton alp-skeleton--line" style="width:${[15, 25, 20, 18][i % 4]}%"></div>
        </div>
      `).join('');
    }

    // Default: text lines
    const widths = [78, 55, 88, 42, 70, 60];
    return Array.from({ length: rows }, (_, i) =>
      `<div class="alp-skeleton alp-skeleton--line" style="width:${widths[i % widths.length]}%"></div>`
    ).join('');
  }

  // ─── Public: page-transition scan ──────────────────────────────────

  /**
   * Called by app.js right after rendering a page's static HTML.
   * Shows the scan overlay only if the subsequent API calls take > 300ms.
   */
  pageReady() {
    const el = this._getPageEl();
    if (!el) return;

    el.classList.add('alp-page-loading');

    // Only reveal the visual if loading takes more than 300ms
    clearTimeout(this._scanTimer);
    this._scanTimer = setTimeout(() => {
      if (this._count > 0) {
        el.classList.add('alp-scan-visible');
      }
    }, 300);
  }

  _hideScan() {
    clearTimeout(this._scanTimer);
    const el = this._getPageEl();
    if (el) el.classList.remove('alp-scan-visible');
  }

  _getPageEl() {
    if (!this._pageEl || !document.body.contains(this._pageEl)) {
      this._pageEl = document.getElementById('page-content');
    }
    return this._pageEl;
  }

  // ─── Rail internals ────────────────────────────────────────────────

  _beginRail() {
    if (!this._rail) return;
    clearInterval(this._trickle);

    // Snap to starting position without transition, then enable it
    this._fill.style.transition = 'none';
    this._fill.style.width = '0%';
    this._progress = 0;

    // Force reflow so the 0% lands before we re-enable transitions
    void this._fill.offsetWidth;
    this._fill.style.transition = '';

    this._rail.classList.remove('is-completing');
    this._rail.classList.add('is-active');

    // Quick burst to 22%
    requestAnimationFrame(() => this._setProgress(22));

    // Slow trickle: each tick inches forward, decelerating as it approaches 88%
    this._trickle = setInterval(() => {
      if (this._progress < 88) {
        const remaining = 88 - this._progress;
        // Move ~7% of remaining distance per tick, min 0.4
        const step = Math.max(remaining * 0.07, 0.4);
        this._setProgress(this._progress + step);
      }
    }, 350);
  }

  _finishRail() {
    if (!this._rail) return;
    clearInterval(this._trickle);

    this._rail.classList.add('is-completing');
    this._setProgress(100);

    this._endTimer = setTimeout(() => {
      this._rail.classList.remove('is-active', 'is-completing');
      // Reset width silently after fade-out
      setTimeout(() => {
        if (this._fill) {
          this._fill.style.transition = 'none';
          this._fill.style.width = '0%';
          this._progress = 0;
          void this._fill.offsetWidth;
          this._fill.style.transition = '';
        }
      }, 220);
    }, 420);
  }

  _setProgress(p) {
    this._progress = Math.min(p, 100);
    if (this._fill) this._fill.style.width = this._progress + '%';
  }
}

window.ALPLoading = new ALPLoadingManager();
