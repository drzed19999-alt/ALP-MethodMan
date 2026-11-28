/**
 * ALP — God's "View as user" impersonation UI.
 *
 * God-only. Non-god users never see the trigger button; even if they did,
 * the server ignores X-As-User from anyone who isn't god.
 *
 * Storage:
 *   localStorage.alp_as_user       — target user id, or unset
 *   localStorage.alp_as_user_name  — cached username (for the banner label)
 *
 * The header (api.js) reads alp_as_user on every request and forwards it as
 * X-As-User. Clearing the localStorage keys returns god to unrestricted view.
 */
(function () {
  'use strict';

  const KEY_ID   = 'alp_as_user';
  const KEY_NAME = 'alp_as_user_name';

  function isGod() {
    return !!(window.ALPAuth && window.ALPAuth.isGod && window.ALPAuth.isGod());
  }

  function getCurrent() {
    const id = localStorage.getItem(KEY_ID);
    if (!id) return null;
    return { id, name: localStorage.getItem(KEY_NAME) || `user #${id}` };
  }

  function set(userId, userName) {
    if (!userId) { clear(); return; }
    localStorage.setItem(KEY_ID, String(userId));
    localStorage.setItem(KEY_NAME, String(userName || `user #${userId}`));
    renderBanner();
    // Full reload — every open page's data is cached against the previous
    // scope and must re-fetch. Reload guarantees no stale rows leak through.
    setTimeout(() => window.location.reload(), 50);
  }

  function clear() {
    localStorage.removeItem(KEY_ID);
    localStorage.removeItem(KEY_NAME);
    renderBanner();
    setTimeout(() => window.location.reload(), 50);
  }

  let _bannerRo = null;

  function _esc(s) {
    if (window.AlpUtil && window.AlpUtil.escapeHtml) return window.AlpUtil.escapeHtml(s);
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function _injectCss() {
    if (document.getElementById('alp-view-as-css')) return;
    const st = document.createElement('style');
    st.id = 'alp-view-as-css';
    st.textContent = `
      .alp-view-as-banner {
        position: fixed; top: 0; left: 0; right: 0;
        z-index: var(--z-banner, 450);
        background: linear-gradient(90deg, #7c3aed 0%, #c026d3 100%);
        color: #ffffff !important;
        padding: 8px 14px;
        font-size: 13px; font-weight: 600;
        display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
        gap: 8px 12px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      }
      .alp-view-as-banner * { color: #ffffff !important; }
      .alp-view-as-exit {
        margin-left: 4px;
        background: rgba(255, 255, 255, 0.22);
        border: 1px solid rgba(255, 255, 255, 0.35);
        color: #ffffff !important;
        padding: 4px 12px; border-radius: 6px;
        font-weight: 700; cursor: pointer; font-size: 12px;
        min-height: 28px;
      }
      .alp-view-as-exit:hover { background: rgba(255, 255, 255, 0.32); }

      .alp-view-as-overlay {
        position: fixed; inset: 0;
        background: var(--bg-overlay, rgba(0, 0, 0, 0.65));
        backdrop-filter: blur(4px);
        z-index: var(--z-modal, 600);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
      }
      .alp-view-as-dialog {
        background: var(--bg-elevated, #111);
        color: var(--text-primary);
        border: 1px solid var(--border-primary);
        border-radius: 12px;
        max-width: 440px; width: 100%;
        max-height: 80vh; max-height: 80dvh;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: var(--shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.6));
      }
      .alp-view-as-hdr {
        padding: 14px 18px; border-bottom: 1px solid var(--border-primary);
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
      }
      .alp-view-as-close {
        background: transparent; border: 1px solid var(--border-primary);
        border-radius: 8px; color: var(--text-secondary);
        font-size: 20px; line-height: 1; cursor: pointer;
        width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
      }
      .alp-view-as-close:hover { background: var(--bg-hover); color: var(--text-primary); }
      .alp-view-as-search {
        width: 100%; padding: 9px 12px;
        background: var(--bg-input); border: 1px solid var(--border-primary);
        border-radius: 8px; color: var(--text-primary); font-size: 13px; box-sizing: border-box;
      }
      .alp-view-as-search:focus { border-color: var(--accent-primary); outline: none; }
      .alp-view-as-row {
        width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 10px 12px; background: transparent; border: none; border-radius: 8px;
        color: var(--text-primary); text-align: left; cursor: pointer; font-size: 13px;
        transition: background 0.12s ease;
      }
      .alp-view-as-row:hover { background: var(--bg-hover); }
      .alp-view-as-row-left {
        display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;
      }
      .alp-view-as-email {
        color: var(--text-muted); font-size: 11px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
      }
      .alp-view-as-role {
        color: var(--text-muted); font-size: 11px; flex-shrink: 0;
      }
      .alp-view-as-foot {
        padding: 10px 16px; border-top: 1px solid var(--border-primary);
        display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
        font-size: 12px; color: var(--text-secondary);
      }
      .alp-view-as-reset {
        background: transparent; border: 1px solid var(--border-primary);
        color: var(--text-primary); padding: 6px 12px; border-radius: 6px;
        font-size: 12px; font-weight: 600; cursor: pointer;
      }
      .alp-view-as-reset:hover { background: var(--bg-hover); }
    `;
    document.head.appendChild(st);
  }

  // ── Persistent banner ─────────────────────────────────────────────────────
  function renderBanner() {
    _injectCss();
    let bar = document.getElementById('alp-view-as-banner');
    const cur = getCurrent();
    if (!cur || !isGod()) {
      if (_bannerRo) { _bannerRo.disconnect(); _bannerRo = null; }
      if (bar) bar.remove();
      document.documentElement.style.setProperty('--banner-offset', '0px');
      document.body.style.removeProperty('padding-top');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'alp-view-as-banner';
      bar.className = 'alp-view-as-banner';
      bar.innerHTML = `
        <span style="opacity:.92;">👁 Viewing as</span>
        <strong id="alp-view-as-name" style="text-decoration:underline;"></strong>
        <button type="button" id="alp-view-as-exit" class="alp-view-as-exit">Exit</button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('#alp-view-as-exit').addEventListener('click', () => clear());
      if (window.ResizeObserver) {
        _bannerRo = new ResizeObserver(() => {
          document.documentElement.style.setProperty('--banner-offset', `${bar.offsetHeight || 36}px`);
        });
        _bannerRo.observe(bar);
      }
    }
    bar.querySelector('#alp-view-as-name').textContent = cur.name;
    document.documentElement.style.setProperty('--banner-offset', `${bar.offsetHeight || 36}px`);
  }

  // ── Picker modal ──────────────────────────────────────────────────────────
  async function openPicker() {
    if (!isGod()) return;
    _injectCss();
    let users = [];
    try {
      const resp = await window.ALPApi.godGetUsers();
      users = (resp && resp.users) || [];
    } catch (e) {
      if (window.showToast) window.showToast('Failed to load user list: ' + e.message, 'error');
      return;
    }
    const list = users.filter(u => u.role !== 'god');

    const prev = document.getElementById('alp-view-as-picker');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = 'alp-view-as-picker';
    overlay.className = 'alp-view-as-overlay';
    overlay.innerHTML = `
      <div class="alp-view-as-dialog" role="dialog" aria-modal="true" aria-label="View as user">
        <div class="alp-view-as-hdr">
          <strong style="font-size:15px;">View as user</strong>
          <button type="button" id="alp-view-as-close" class="alp-view-as-close" aria-label="Close">×</button>
        </div>
        <div style="padding:12px 16px 0 16px;">
          <input type="text" id="alp-view-as-search" class="alp-view-as-search" placeholder="Search users…" autocomplete="off" />
        </div>
        <div id="alp-view-as-list" style="overflow-y:auto;padding:8px;flex:1;min-height:0;"></div>
        <div class="alp-view-as-foot">
          <span>Filters data to only that user's view.</span>
          <button type="button" id="alp-view-as-reset" class="alp-view-as-reset">Reset (see all)</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function closePicker() {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    }
    function onEsc(e) {
      if (e.key === 'Escape') closePicker();
    }
    document.addEventListener('keydown', onEsc);

    function paint(filter = '') {
      const q = filter.trim().toLowerCase();
      const rows = list
        .filter(u => !q || (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
        .map(u => {
          const roleBadge = { super_admin: '⭐', admin: '🛡', viewer: '👁' }[u.role] || '';
          const uname = _esc(u.username || `user #${u.id}`);
          const email = _esc(u.email || '');
          const role  = _esc(u.role || '');
          return `
            <button type="button" class="alp-view-as-row" data-uid="${_esc(u.id)}" data-uname="${uname}">
              <span class="alp-view-as-row-left">
                <span style="flex-shrink:0;">${roleBadge}</span>
                <span style="font-weight:600;flex-shrink:0;">${uname}</span>
                <span class="alp-view-as-email">${email}</span>
              </span>
              <span class="alp-view-as-role">${role}</span>
            </button>`;
        }).join('');
      overlay.querySelector('#alp-view-as-list').innerHTML =
        rows || '<div style="padding:20px;text-align:center;color:var(--text-muted);">No users match.</div>';
    }

    paint();
    overlay.querySelector('#alp-view-as-search').addEventListener('input', (e) => paint(e.target.value));
    overlay.querySelector('#alp-view-as-close').addEventListener('click', closePicker);
    overlay.querySelector('#alp-view-as-reset').addEventListener('click', () => { closePicker(); clear(); });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { closePicker(); return; }
      const btn = e.target.closest && e.target.closest('[data-uid]');
      if (btn) {
        closePicker();
        set(btn.getAttribute('data-uid'), btn.getAttribute('data-uname'));
      }
    });
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setTimeout(() => overlay.querySelector('#alp-view-as-search')?.focus(), 20);
    }
  }

  // Render the banner on load whenever a value is present.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBanner);
  } else {
    renderBanner();
  }

  window.ALPViewAsUser = { openPicker, set, clear, getCurrent, renderBanner, isGod };
})();
