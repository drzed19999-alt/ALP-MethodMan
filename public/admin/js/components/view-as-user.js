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

  // ── Persistent banner ─────────────────────────────────────────────────────
  function renderBanner() {
    let bar = document.getElementById('alp-view-as-banner');
    const cur = getCurrent();
    if (!cur || !isGod()) {
      if (bar) bar.remove();
      document.body.style.removeProperty('padding-top');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'alp-view-as-banner';
      bar.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0',
        'z-index:99999',
        'background:linear-gradient(90deg,#7c3aed 0%,#c026d3 100%)',
        'color:#fff',
        'padding:8px 16px',
        'font-size:13px', 'font-weight:600',
        'display:flex', 'align-items:center', 'justify-content:center',
        'gap:12px',
        'box-shadow:0 2px 8px rgba(0,0,0,.3)',
      ].join(';');
      bar.innerHTML = `
        <span style="opacity:.9;">👁 Viewing as</span>
        <strong id="alp-view-as-name" style="text-decoration:underline;"></strong>
        <button type="button" id="alp-view-as-exit" style="margin-left:8px;background:rgba(255,255,255,.2);border:none;color:#fff;padding:4px 10px;border-radius:4px;font-weight:700;cursor:pointer;font-size:12px;">Exit</button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('#alp-view-as-exit').addEventListener('click', () => clear());
    }
    bar.querySelector('#alp-view-as-name').textContent = cur.name;
    document.body.style.paddingTop = `${bar.offsetHeight || 36}px`;
  }

  // ── Picker modal ──────────────────────────────────────────────────────────
  async function openPicker() {
    if (!isGod()) return;
    let users = [];
    try {
      const resp = await window.ALPApi.godGetUsers();
      users = (resp && resp.users) || [];
    } catch (e) {
      if (window.showToast) window.showToast('Failed to load user list: ' + e.message, 'error');
      return;
    }
    // Filter out god accounts — impersonating another god has no effect anyway.
    const list = users.filter(u => u.role !== 'god');

    const overlay = document.createElement('div');
    overlay.id = 'alp-view-as-picker';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary,#111);color:var(--text-primary,#fff);border:1px solid var(--border,#333);border-radius:12px;max-width:440px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border,#333);display:flex;align-items:center;justify-content:space-between;">
          <strong style="font-size:15px;">View as user</strong>
          <button id="alp-view-as-close" style="background:none;border:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:0;width:24px;height:24px;">×</button>
        </div>
        <div style="padding:12px 16px 0 16px;">
          <input type="text" id="alp-view-as-search" placeholder="Search users…" autocomplete="off" style="width:100%;padding:8px 12px;background:var(--bg-secondary,#1a1a1a);border:1px solid var(--border,#333);border-radius:6px;color:inherit;font-size:13px;box-sizing:border-box;" />
        </div>
        <div id="alp-view-as-list" style="overflow-y:auto;padding:8px;flex:1;min-height:0;"></div>
        <div style="padding:10px 16px;border-top:1px solid var(--border,#333);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-secondary,#999);">
          <span>Filters data to only that user's view.</span>
          <button id="alp-view-as-reset" style="background:transparent;border:1px solid var(--border,#333);color:inherit;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;">Reset (see all)</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function paint(filter = '') {
      const q = filter.trim().toLowerCase();
      const rows = list
        .filter(u => !q || (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
        .map(u => {
          const roleBadge = { super_admin: '⭐', admin: '🛡', viewer: '👁' }[u.role] || '';
          return `
            <button type="button" data-uid="${u.id}" data-uname="${(u.username || '').replace(/"/g, '&quot;')}"
              style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:transparent;border:none;border-radius:6px;color:inherit;text-align:left;cursor:pointer;font-size:13px;">
              <span style="display:flex;align-items:center;gap:8px;">
                <span>${roleBadge}</span>
                <span style="font-weight:600;">${u.username || `user #${u.id}`}</span>
                <span style="opacity:.6;font-size:11px;">${u.email || ''}</span>
              </span>
              <span style="opacity:.5;font-size:11px;">${u.role || ''}</span>
            </button>`;
        }).join('');
      overlay.querySelector('#alp-view-as-list').innerHTML =
        rows || '<div style="padding:20px;text-align:center;opacity:.6;">No users match.</div>';
    }

    paint();
    overlay.querySelector('#alp-view-as-search').addEventListener('input', (e) => paint(e.target.value));
    overlay.querySelector('#alp-view-as-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#alp-view-as-reset').addEventListener('click', () => { overlay.remove(); clear(); });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
      const btn = e.target.closest && e.target.closest('[data-uid]');
      if (btn) {
        overlay.remove();
        set(btn.getAttribute('data-uid'), btn.getAttribute('data-uname'));
      }
    });
    // Hover highlight (JS instead of CSS to stay self-contained)
    overlay.querySelectorAll('[data-uid]').forEach(b => {
      b.addEventListener('mouseenter', () => b.style.background = 'var(--bg-secondary, rgba(255,255,255,.06))');
      b.addEventListener('mouseleave', () => b.style.background = 'transparent');
    });
    setTimeout(() => overlay.querySelector('#alp-view-as-search')?.focus(), 20);
  }

  // Render the banner on load whenever a value is present.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBanner);
  } else {
    renderBanner();
  }

  window.ALPViewAsUser = { openPicker, set, clear, getCurrent, renderBanner, isGod };
})();
