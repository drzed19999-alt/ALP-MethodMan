/**
 * OutLaws - Settings Section Renderers
 * Returns HTML strings for each settings category panel.
 * Used by SettingsPage when a category is selected in the gatekeeper view.
 */
const SettingsSections = (() => {

  function renderGeneral() {
    return `
      <div class="settings-section stagger-item" id="section-general">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(99,102,241,0.12);color:#6366f1;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </div>
          <h2>General Settings</h2>
        </div>
        <div class="settings-card">
          <div class="settings-form-grid" style="margin-bottom:16px;">
            <div class="form-group">
              <label>Site Name</label>
              <input type="text" class="form-input" id="s-site-name" placeholder="OutLaws Panel" />
            </div>
            <div class="form-group">
              <label>Alert Duration (seconds)</label>
              <input type="number" class="form-input" id="s-notify-duration" min="1" max="60" placeholder="8" />
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Alert Sound</label>
              <div style="display:flex;gap:10px;align-items:center;">
                <select class="form-select" id="s-notify-sound" style="flex:1;">
                  <option value="0">Disabled</option>
                  <option value="1">Standard Chime</option>
                  <option value="blip">Digital Blip</option>
                  <option value="ping">Synth Ping</option>
                  <option value="retro">Retro Arcade</option>
                </select>
                <button type="button" class="btn btn-outline" id="btn-preview-sound" style="padding: 8px 12px; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Preview
                </button>
              </div>
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label for="s-notify-volume" style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                Alert Volume
                <span id="s-notify-volume-label" style="color:var(--text-secondary);">100%</span>
              </label>
              <input type="range" id="s-notify-volume" min="0" max="100" value="100" style="width:100%; cursor:pointer;" />
            </div>
            <div style="grid-column: span 2; height:1px; background:var(--border); margin:4px 0 8px;"></div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Hold Alert Sound <span style="font-size:11px; color:var(--text-muted);">(loops while a session is waiting on hold)</span></label>
              <div style="display:flex; gap:10px; align-items:center;">
                <select class="form-select" id="s-hold-sound" style="flex:1;">
                  <option value="0">Disabled</option>
                  <option value="pulse">Pulse Beep</option>
                  <option value="alarm">Alarm Tone</option>
                  <option value="heartbeat">Heartbeat</option>
                  <option value="drone">Drone</option>
                </select>
                <button type="button" class="btn btn-outline" id="btn-preview-hold-sound" style="padding:8px 12px; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Preview
                </button>
              </div>
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label for="s-hold-volume" style="display:flex; justify-content:space-between; margin-bottom:6px;">
                Hold Sound Volume
                <span id="s-hold-volume-label" style="color:var(--text-secondary);">80%</span>
              </label>
              <input type="range" id="s-hold-volume" min="0" max="100" value="80" style="width:100%; cursor:pointer;" />
            </div>
          </div>
          <div class="settings-toggles">
            <label class="toggle-row">
              <span>Enable Live Session Alerts</span>
              <input type="checkbox" id="s-notify-new-session" class="toggle-cb" />
              <span class="toggle-switch"></span>
            </label>
            <label class="toggle-row">
              <span>Enable Form Data Alerts</span>
              <input type="checkbox" id="s-notify-form-data" class="toggle-cb" />
              <span class="toggle-switch"></span>
            </label>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" id="save-general-btn">Save General Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSecurity() {
    return `
      <div class="settings-section stagger-item" id="section-security">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(239,68,68,0.12);color:#ef4444;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <h2>Account Security</h2>
        </div>
        <div class="settings-card">
          <div class="settings-form-grid">
            <div class="form-group">
              <label>New Password</label>
              <input type="password" class="form-input" id="s-new-password" placeholder="Min 6 characters" />
            </div>
            <div class="form-group">
              <label>Confirm New Password</label>
              <input type="password" class="form-input" id="s-confirm-password" placeholder="Re-enter password" />
            </div>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" id="change-password-btn">Update Password</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTelegram() {
    return `
      <div class="settings-section stagger-item" id="section-telegram">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(59,130,246,0.12);color:#3b82f6;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
          </div>
          <h2>Telegram Integration</h2>
          <span class="status-dot" id="tg-status-dot"></span>
          <span class="status-label" id="tg-status-label">Checking…</span>
        </div>
        <div class="settings-card telegram-card">
          <div class="tg-help">
            <p>Get your bot token from <a href="https://t.me/BotFather" target="_blank" style="color:#60a5fa;">@BotFather</a> on Telegram. To find your Chat ID, message <a href="https://t.me/userinfobot" target="_blank" style="color:#60a5fa;">@userinfobot</a> or use <code>/getUpdates</code> API.</p>
          </div>
          <div class="settings-form-grid">
            <div class="form-group">
              <label>Bot Token</label>
              <div class="input-with-toggle">
                <input type="password" class="form-input" id="s-tg-token" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
                <button type="button" class="input-toggle-btn" id="tg-token-toggle">Show</button>
              </div>
            </div>
            <div class="form-group">
              <label>Chat ID</label>
              <input type="text" class="form-input" id="s-tg-chatid" placeholder="-1001234567890" />
            </div>
          </div>
          <div class="settings-toggles">
            <label class="toggle-row"><span>Active</span><input type="checkbox" id="s-tg-active" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify New Sessions</span><input type="checkbox" id="s-tg-sessions" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Form Data</span><input type="checkbox" id="s-tg-formdata" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Errors</span><input type="checkbox" id="s-tg-errors" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Page Views</span><input type="checkbox" id="s-tg-pageviews" class="toggle-cb" /><span class="toggle-switch"></span></label>
          </div>
          <div class="settings-actions" style="gap:10px;">
            <button class="btn btn-outline" id="test-tg-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Test Connection
            </button>
            <button class="btn btn-primary" id="save-tg-btn">Save Telegram Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderWebsites() {
    return `
      <div class="settings-section stagger-item" id="section-websites">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(16,185,129,0.12);color:#10b981;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          </div>
          <h2>Scam Page Management</h2>
          <button class="btn btn-sm btn-primary" id="add-website-btn" style="margin-left:auto;">+ Add Scam Page</button>
        </div>
        <div class="websites-list" id="websites-list">
          <div class="empty-state-sm" id="websites-empty" style="display:none;"><p>No websites registered yet</p></div>
        </div>
      </div>
    `;
  }

  function renderUsers() {
    return `
      <div class="settings-section stagger-item" id="section-users">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(139,92,246,0.12);color:#8b5cf6;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <h2>User Management</h2>
          <button class="btn btn-sm btn-primary" id="add-user-btn" style="margin-left:auto;">+ Add User</button>
        </div>
        <div class="users-list" id="users-list"></div>
      </div>
    `;
  }

  function renderDanger() {
    return `
      <div class="settings-section stagger-item danger-section" id="section-danger">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(239,68,68,0.12);color:#ef4444;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h2>Danger Zone</h2>
        </div>
        <div class="settings-card danger-card">
          <div class="danger-actions">
            <div class="danger-item">
              <div><strong>Clear All Sessions</strong><p>Remove all active and historical session data</p></div>
              <button class="btn btn-danger" id="clear-sessions-btn">Clear Sessions</button>
            </div>
            <div class="danger-item">
              <div><strong>Clear All Logs</strong><p>Permanently delete all audit log entries</p></div>
              <button class="btn btn-danger" id="clear-all-logs-btn">Clear Logs</button>
            </div>
            <div class="danger-item">
              <div><strong>Reset Settings</strong><p>Restore all settings to their default values</p></div>
              <button class="btn btn-danger" id="reset-settings-btn">Reset Defaults</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return { renderGeneral, renderSecurity, renderTelegram, renderWebsites, renderUsers, renderDanger };
})();

if (typeof window !== 'undefined') {
  window.SettingsSections = SettingsSections;
}
