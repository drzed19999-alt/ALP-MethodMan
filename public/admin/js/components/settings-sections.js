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

  function renderPanel() {
    return `
      <div class="settings-section stagger-item" id="section-panel">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(20,184,166,0.12);color:#14b8a6;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          </div>
          <h2>Panel Configuration</h2>
        </div>

        <!-- Tab bar -->
        <div class="panel-tabs">
          <button class="panel-tab active" data-tab="overview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10"/></svg>
            Overview
          </button>
          <button class="panel-tab" data-tab="server">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>
            Server
          </button>
          <button class="panel-tab" data-tab="deploy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Deploy
          </button>
          <button class="panel-tab" data-tab="history">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            History
          </button>
        </div>

        <!-- ── TAB: OVERVIEW ─────────────────────────────────────── -->
        <div class="panel-tab-content active" id="panel-tab-overview">
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              <h3>Domain &amp; Port</h3>
              <button id="test-panel-btn" class="btn btn-outline btn-sm" style="margin-left:auto;">Test Connection</button>
            </div>
            <div class="settings-form-grid">
              <div class="form-group" style="grid-column:span 2;">
                <label>Public Domain</label>
                <input type="text" id="panel-domain" class="form-input" placeholder="panel.yourdomain.com">
                <div id="panel-url-preview" style="display:none;margin-top:6px;font-size:11px;font-family:'JetBrains Mono',monospace;color:#14b8a6;padding:6px 10px;background:rgba(20,184,166,0.06);border-radius:6px;border:1px solid rgba(20,184,166,0.15);"></div>
              </div>
              <div class="form-group">
                <label>Internal Port <span class="label-hint">Node.js port</span></label>
                <input type="text" id="panel-port" class="form-input" placeholder="3000">
              </div>
              <div class="form-group">
                <label>Reverse Proxy</label>
                <select id="panel-proxy" class="form-select">
                  <option value="none">None (direct)</option>
                  <option value="nginx">nginx</option>
                  <option value="caddy">Caddy</option>
                  <option value="apache">Apache</option>
                </select>
              </div>
              <div class="form-group" style="grid-column:span 2;">
                <label class="toggle-row" style="border:none;padding:0;cursor:pointer;">
                  <span style="font-size:12px;font-weight:500;color:var(--text-secondary);">HTTPS / SSL enabled</span>
                  <input type="checkbox" id="panel-ssl" class="toggle-cb" checked>
                  <span class="toggle-switch"></span>
                </label>
              </div>
            </div>
            <div id="panel-test-result" class="test-result-row"></div>
          </div>
          <div class="settings-actions">
            <button id="save-panel-btn" class="btn btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save
            </button>
          </div>
        </div>

        <!-- ── TAB: SERVER ───────────────────────────────────────── -->
        <div class="panel-tab-content" id="panel-tab-server">
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>
              <h3>VPS Access</h3>
            </div>
            <div class="settings-form-grid">
              <div class="form-group" style="grid-column:span 2;">
                <label>Server IP / Hostname</label>
                <input type="text" id="panel-vps-host" class="form-input" placeholder="123.45.67.89 or vps.example.com">
                <div id="panel-dns-hint-box" style="display:none;margin-top:8px;padding:10px 14px;background:rgba(20,184,166,0.04);border:1px solid rgba(20,184,166,0.12);border-radius:8px;font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--text-secondary);">
                  A &nbsp; panel.yourdomain.com &nbsp; → &nbsp; <span id="panel-dns-hint" style="color:#34d399;"></span>
                </div>
              </div>
              <div class="form-group">
                <label>SSH Port</label>
                <input type="text" id="panel-ssh-port" class="form-input" placeholder="22">
              </div>
              <div class="form-group">
                <label>SSH User</label>
                <input type="text" id="panel-ssh-user" class="form-input" placeholder="root">
              </div>
            </div>
          </div>
          <div class="settings-actions">
            <button id="save-panel-server-btn" class="btn btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save Server Settings
            </button>
          </div>
        </div>

        <!-- ── TAB: DEPLOY ───────────────────────────────────────── -->
        <div class="panel-tab-content" id="panel-tab-deploy">

          <!-- SSH Auth -->
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <h3>SSH Authentication</h3>
            </div>
            <div class="settings-form-grid">
              <div class="form-group" style="grid-column:span 2;">
                <label>Auth Method</label>
                <div style="display:flex;gap:10px;">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-primary);">
                    <input type="radio" name="deploy-auth-mode" id="auth-mode-key" value="key" checked style="accent-color:#14b8a6;"> SSH Private Key
                  </label>
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-primary);">
                    <input type="radio" name="deploy-auth-mode" id="auth-mode-pass" value="password" style="accent-color:#14b8a6;"> Password
                  </label>
                </div>
              </div>

              <!-- Key auth fields -->
              <div class="form-group" id="ssh-key-group" style="grid-column:span 2;">
                <label>Private Key <span class="label-hint">PEM / OpenSSH format</span></label>
                <div id="ssh-key-saved-row" style="display:none;align-items:center;gap:8px;">
                  <code style="flex:1;font-size:11px;color:#34d399;background:rgba(16,185,129,0.06);padding:9px 14px;border-radius:8px;border:1px solid rgba(16,185,129,0.2);">🔑 SSH key saved</code>
                  <button id="ssh-key-change-btn" class="input-toggle-btn">Change</button>
                </div>
                <div id="ssh-key-input-wrap" style="display:block;">
                  <textarea id="deploy-ssh-key" class="form-input form-textarea" rows="5" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----" style="font-family:'JetBrains Mono',monospace;font-size:11px;min-height:110px;"></textarea>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:5px;">Paste the private key file contents. The corresponding public key must be in <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px;">~/.ssh/authorized_keys</code> on the VPS.</div>
                </div>
              </div>

              <!-- Password auth fields -->
              <div class="form-group" id="ssh-pass-group" style="grid-column:span 2;display:none;">
                <label>SSH Password</label>
                <div id="ssh-pass-saved-row" style="display:none;align-items:center;gap:8px;">
                  <code style="flex:1;font-size:11px;color:#34d399;background:rgba(16,185,129,0.06);padding:9px 14px;border-radius:8px;border:1px solid rgba(16,185,129,0.2);">🔒 Password saved</code>
                  <button id="ssh-pass-change-btn" class="input-toggle-btn">Change</button>
                </div>
                <div id="ssh-pass-input-wrap" style="display:block;">
                  <div class="input-with-toggle">
                    <input type="text" id="deploy-ssh-pass" class="form-input" placeholder="Enter SSH password"
                      readonly
                      autocomplete="off" data-lpignore="true" data-form-type="other"
                      name="deploy_vps_secret_${Math.random().toString(36).slice(2)}"
                      style="-webkit-text-security:disc;text-security:disc;font-family:text-security-disc;">
                    <button class="input-toggle-btn" data-toggle-pass="deploy-ssh-pass">Show</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Git & App -->
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="6" y1="9" x2="6" y2="15"/><path d="M18 9a9 9 0 00-9 9"/></svg>
              <h3>Repository &amp; App</h3>
            </div>
            <div class="settings-form-grid">
              <div class="form-group" style="grid-column:span 2;">
                <label>Git Repository URL</label>
                <input type="text" id="deploy-git-repo" class="form-input" placeholder="https://github.com/youruser/alp.git">
              </div>
              <div class="form-group">
                <label>Branch</label>
                <input type="text" id="deploy-git-branch" class="form-input" placeholder="main">
              </div>
              <div class="form-group">
                <label>Install Directory</label>
                <input type="text" id="deploy-app-dir" class="form-input" placeholder="/var/www/alp">
              </div>
              <div class="form-group">
                <label>PM2 Process Name</label>
                <input type="text" id="deploy-pm2-name" class="form-input" placeholder="alp">
              </div>
            </div>
            <div class="settings-actions" style="margin-top:8px;">
              <button id="save-deploy-cfg-btn" class="btn btn-outline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                Save Config
              </button>
            </div>
          </div>

          <!-- Environment Variables -->
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <h3>Environment Variables</h3>
              <button id="btn-add-env-var" class="btn btn-outline btn-sm" style="margin-left:auto;font-size:11px;padding:4px 10px;">+ Add Variable</button>
            </div>
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">
              Written as <code>.env</code> on the VPS during <strong>Setup Server</strong>. Add your <code>JWT_SECRET</code>, <code>SUPABASE_URL</code>, database credentials, etc.
            </div>
            <div id="env-vars-list" style="display:flex;flex-direction:column;gap:8px;min-height:8px;"></div>
            <div class="settings-actions" style="margin-top:12px;">
              <button id="save-env-vars-btn" class="btn btn-outline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save Variables
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <h3>Actions</h3>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="padding:16px;background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.15);border-radius:12px;">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">🚀 Setup Server</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">First-time setup: installs Node.js, PM2, nginx, clones repo, configures reverse proxy &amp; firewall.</div>
                <button id="btn-setup-server" class="btn btn-outline" style="width:100%;justify-content:center;border-color:rgba(99,102,241,0.4);color:#818cf8;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Setup Server
                </button>
              </div>
              <div style="padding:16px;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:12px;">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">⬆️ Deploy</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">Pull latest code from git, run npm install, and restart the PM2 process.</div>
                <button id="btn-deploy-panel" class="btn btn-primary" style="width:100%;justify-content:center;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                  Deploy Now
                </button>
              </div>
            </div>
          </div>

          <!-- Terminal Output -->
          <div id="deploy-terminal-wrap" style="display:none;margin-bottom:16px;">
            <div class="settings-card" style="padding:0;overflow:hidden;">
              <!-- Terminal header -->
              <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex;gap:6px;">
                  <div style="width:12px;height:12px;border-radius:50%;background:#ff5f57;"></div>
                  <div style="width:12px;height:12px;border-radius:50%;background:#febc2e;"></div>
                  <div style="width:12px;height:12px;border-radius:50%;background:#28c840;"></div>
                </div>
                <span id="terminal-title" style="font-size:12px;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,0.5);flex:1;text-align:center;">Deploying…</span>
                <div id="terminal-status-dot" style="width:8px;height:8px;border-radius:50%;background:#febc2e;animation:termBlink 1s ease-in-out infinite;"></div>
              </div>
              <!-- Steps sidebar + log area -->
              <div style="display:grid;grid-template-columns:220px 1fr;min-height:320px;">
                <div id="deploy-steps" style="padding:16px 12px;background:rgba(0,0,0,0.2);border-right:1px solid rgba(255,255,255,0.04);display:flex;flex-direction:column;gap:6px;"></div>
                <div id="deploy-log" style="padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:11.5px;line-height:1.7;overflow-y:auto;max-height:400px;background:rgba(8,8,16,0.6);white-space:pre-wrap;word-break:break-word;color:rgba(255,255,255,0.7);"></div>
              </div>
              <!-- Duration bar -->
              <div id="deploy-summary" style="display:none;padding:12px 16px;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.05);font-size:12px;font-family:'JetBrains Mono',monospace;"></div>
            </div>
          </div>

        </div><!-- /deploy tab -->

        <!-- ── TAB: HISTORY ──────────────────────────────────────── -->
        <div class="panel-tab-content" id="panel-tab-history">
          <div class="settings-card">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h3>Deploy History</h3>
              <button id="refresh-history-btn" class="btn btn-outline btn-sm" style="margin-left:auto;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                Refresh
              </button>
            </div>
            <div id="deploy-history-table" style="margin-top:4px;"></div>
          </div>
        </div>

      </div>

      <style>
        /* Panel tabs */
        .panel-tabs {
          display: flex; gap: 4px; margin-bottom: 20px;
          background: rgba(255,255,255,0.03); border: 1px solid var(--border-color);
          border-radius: 12px; padding: 4px;
        }
        .panel-tab {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 16px; border-radius: 9px; border: none;
          background: transparent; color: var(--text-secondary);
          font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif;
          cursor: pointer; transition: all 0.18s ease; flex: 1; justify-content: center;
        }
        .panel-tab:hover { color: var(--text-primary); background: rgba(255,255,255,0.05); }
        .panel-tab.active {
          background: rgba(20,184,166,0.12); color: #14b8a6;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }
        .panel-tab-content { display: none; }
        .panel-tab-content.active { display: block; }

        /* Terminal blink */
        @keyframes termBlink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

        /* Deploy step rows */
        .deploy-step {
          display: flex; align-items: center; gap: 8px;
          font-size: 11.5px; font-family: 'JetBrains Mono', monospace;
          color: rgba(255,255,255,0.45); padding: 4px 6px; border-radius: 6px;
          transition: all 0.2s;
        }
        .deploy-step.running { color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.05); }
        .deploy-step.done    { color: #34d399; }
        .deploy-step.error   { color: #f87171; }
        .deploy-step.warning { color: #fbbf24; }
        .step-icon { width: 16px; height: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        @keyframes stepSpin { to { transform: rotate(360deg); } }
        .step-icon.spinning svg { animation: stepSpin 0.8s linear infinite; }

        /* Deploy history table */
        .deploy-history-row {
          display: grid; grid-template-columns: auto 1fr auto auto;
          gap: 12px; align-items: center; padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px;
        }
        .deploy-history-row:last-child { border-bottom: none; }
        .deploy-badge {
          padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.4px;
        }
        .deploy-badge.success { background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.2); }
        .deploy-badge.failed  { background:rgba(239,68,68,0.08); color:#f87171; border:1px solid rgba(239,68,68,0.15); }
        .deploy-badge.setup   { background:rgba(99,102,241,0.1); color:#818cf8; border:1px solid rgba(99,102,241,0.2); }
      </style>
    `;
  }

  function renderInfrastructure() {
    return `
      <div class="settings-section stagger-item" id="section-infrastructure">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(99,102,241,0.12);color:#6366f1;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/><line x1="6" y1="5" x2="6.01" y2="5"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="6" y1="19" x2="6.01" y2="19"/></svg>
          </div>
          <h2>Infrastructure &amp; Hosting</h2>
        </div>

        <div class="infra-note">
          <div class="infra-note-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
          <div class="infra-note-text">
            Credentials saved here take priority over <code>.env</code> values and take effect immediately — no restart required.
            Railway routes remain fully operational regardless of which provider is active.
          </div>
        </div>

        <!-- Active Provider Selector -->
        <div class="settings-card" style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">Active Hosting Provider</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">New domains will be attached to the selected provider</div>
          <input type="hidden" id="infra-active-provider" value="railway">
          <div class="provider-selector">
            <button class="provider-pill" data-provider="railway">
              <div class="provider-pill-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l7-3 4 3 7-3v15l-7 3-4-3-7 3z"/></svg>
              </div>
              <div class="provider-pill-info">
                <span class="provider-pill-name">Railway</span>
                <span class="provider-pill-desc">Managed cloud platform</span>
              </div>
              <div class="provider-pill-check">✓</div>
            </button>
            <button class="provider-pill" data-provider="vps">
              <div class="provider-pill-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>
              </div>
              <div class="provider-pill-info">
                <span class="provider-pill-name">VPS / Self-hosted</span>
                <span class="provider-pill-desc">Your own server</span>
              </div>
              <div class="provider-pill-check">✓</div>
            </button>
          </div>
        </div>

        <!-- Railway Configuration -->
        <div class="settings-card" style="margin-bottom:16px;">
          <div class="infra-sub-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" style="flex-shrink:0;"><path d="M3 6l7-3 4 3 7-3v15l-7 3-4-3-7 3z"/></svg>
            <h3>Railway</h3>
            <div id="rw-status-dot" class="infra-provider-dot unconfigured"></div>
            <span id="rw-status-label" style="font-size:12px;color:var(--text-muted);">Not configured</span>
            <span id="rw-source-badge" class="source-badge none" style="margin-left:4px;">Not Set</span>
            <button id="test-railway-btn" class="btn btn-outline btn-sm" style="margin-left:auto;">Test Connection</button>
          </div>
          <div class="settings-form-grid">
            <div class="form-group" style="grid-column:span 2;">
              <label>API Token <span class="label-hint">RAILWAY_TOKEN</span></label>
              <div class="token-display-row" style="display:flex;align-items:center;gap:8px;">
                <code id="rw-token-display" style="flex:1;font-size:12px;color:var(--text-secondary);background:rgba(255,255,255,0.04);padding:9px 14px;border-radius:8px;border:1px solid var(--border-color);">—</code>
                <button id="rw-token-edit-btn" class="input-toggle-btn">Change</button>
              </div>
              <div id="rw-token-input-wrap" class="input-with-toggle" style="display:none;margin-top:6px;">
                <input type="password" id="rw-token-input" class="form-input" placeholder="Enter new token…">
                <button class="input-toggle-btn" data-toggle-pass="rw-token-input">Show</button>
              </div>
            </div>
            <div class="form-group">
              <label>Service ID <span class="label-hint">RAILWAY_SERVICE_ID</span></label>
              <input type="text" id="rw-service-id" class="form-input" placeholder="e16d9dcc-…">
            </div>
            <div class="form-group">
              <label>Environment ID <span class="label-hint">RAILWAY_ENVIRONMENT_ID</span></label>
              <input type="text" id="rw-env-id" class="form-input" placeholder="production">
            </div>
          </div>
          <div id="rw-test-result" class="test-result-row"></div>
        </div>

        <!-- VPS Configuration -->
        <div class="settings-card" style="margin-bottom:16px;">
          <div class="infra-sub-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" style="flex-shrink:0;"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>
            <h3>VPS / Self-hosted</h3>
            <div id="vps-status-dot" class="infra-provider-dot unconfigured"></div>
            <span id="vps-status-label" style="font-size:12px;color:var(--text-muted);">Not configured</span>
            <button id="test-vps-btn" class="btn btn-outline btn-sm" style="margin-left:auto;">Test Connection</button>
          </div>
          <div class="settings-form-grid">
            <div class="form-group">
              <label>Server IP / Hostname</label>
              <input type="text" id="vps-host" class="form-input" placeholder="123.45.67.89">
            </div>
            <div class="form-group">
              <div class="infra-row">
                <div class="form-group" style="margin-bottom:0;">
                  <label>SSH Port</label>
                  <input type="text" id="vps-ssh-port" class="form-input" placeholder="22">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label>SSH User</label>
                  <input type="text" id="vps-ssh-user" class="form-input" placeholder="root">
                </div>
              </div>
            </div>
            <div class="form-group" style="grid-column:span 2;">
              <label>Control Panel</label>
              <select id="vps-panel" class="form-select">
                <option value="none">None &mdash; Manual / Caddy / nginx</option>
                <option value="cpanel">cPanel</option>
                <option value="plesk">Plesk</option>
                <option value="directadmin">DirectAdmin</option>
              </select>
            </div>
          </div>

          <div id="vps-panel-fields" class="infra-panel-fields" style="display:none;">
            <div class="infra-divider-label">Panel Credentials</div>
            <div class="settings-form-grid">
              <div class="form-group" style="grid-column:span 2;">
                <label>Panel URL</label>
                <input type="url" id="vps-panel-url" class="form-input" placeholder="https://hostname:2083">
              </div>
              <div class="form-group">
                <label>Panel Username</label>
                <input type="text" id="vps-panel-user" class="form-input" placeholder="admin">
              </div>
              <div class="form-group">
                <label>Panel Password</label>
                <div class="token-display-row" style="display:flex;align-items:center;gap:8px;">
                  <code id="vps-panel-pass-display" style="flex:1;font-size:12px;color:var(--text-secondary);background:rgba(255,255,255,0.04);padding:9px 14px;border-radius:8px;border:1px solid var(--border-color);">—</code>
                  <button id="vps-panel-pass-edit-btn" class="input-toggle-btn">Change</button>
                </div>
                <div id="vps-panel-pass-input-wrap" class="input-with-toggle" style="display:none;margin-top:6px;">
                  <input type="password" id="vps-panel-pass" class="form-input" placeholder="Enter new password…">
                  <button class="input-toggle-btn" data-toggle-pass="vps-panel-pass">Show</button>
                </div>
              </div>
            </div>
          </div>
          <div id="vps-test-result" class="test-result-row"></div>
        </div>

        <!-- Cloudflare Configuration -->
        <div class="settings-card" style="margin-bottom:16px;">
          <div class="infra-sub-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" style="flex-shrink:0;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <h3>Cloudflare DNS</h3>
            <div id="cf-status-dot" class="infra-provider-dot unconfigured"></div>
            <span id="cf-status-label" style="font-size:12px;color:var(--text-muted);">Not configured</span>
            <span id="cf-source-badge" class="source-badge none" style="margin-left:4px;">Not Set</span>
            <button id="test-cloudflare-btn" class="btn btn-outline btn-sm" style="margin-left:auto;">Test Connection</button>
          </div>
          <div class="settings-form-grid">
            <div class="form-group" style="grid-column:span 2;">
              <label>API Token <span class="label-hint">CLOUDFLARE_API_TOKEN</span></label>
              <div class="token-display-row" style="display:flex;align-items:center;gap:8px;">
                <code id="cf-token-display" style="flex:1;font-size:12px;color:var(--text-secondary);background:rgba(255,255,255,0.04);padding:9px 14px;border-radius:8px;border:1px solid var(--border-color);">—</code>
                <button id="cf-token-edit-btn" class="input-toggle-btn">Change</button>
              </div>
              <div id="cf-token-input-wrap" class="input-with-toggle" style="display:none;margin-top:6px;">
                <input type="password" id="cf-token-input" class="form-input" placeholder="Enter new token…">
                <button class="input-toggle-btn" data-toggle-pass="cf-token-input">Show</button>
              </div>
            </div>
            <div class="form-group">
              <label>API Email <span class="label-hint">Optional — for Global API Key</span></label>
              <input type="email" id="cf-email" class="form-input" placeholder="you@example.com">
            </div>
            <div class="form-group">
              <label>Account ID <span class="label-hint">CLOUDFLARE_ACCOUNT_ID</span></label>
              <input type="text" id="cf-account-id" class="form-input" placeholder="abc123…">
            </div>
          </div>
          <div id="cf-test-result" class="test-result-row"></div>
        </div>

        <div class="settings-actions">
          <button id="save-infra-btn" class="btn btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  return { renderGeneral, renderSecurity, renderTelegram, renderWebsites, renderUsers, renderDanger, renderInfrastructure, renderPanel };
})();

if (typeof window !== 'undefined') {
  window.SettingsSections = SettingsSections;
}
