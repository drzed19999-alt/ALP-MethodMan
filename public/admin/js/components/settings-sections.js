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

        <!-- ── Ambient Background — subtle motion behind the app ─────────── -->
        <div class="section-header" style="margin-top:28px;">
          <div class="section-icon" style="background:rgba(56,189,248,0.12);color:#38bdf8;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          <h2>Ambient Background</h2>
        </div>
        <div class="settings-card">
          <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.55;">
            A gentle animated layer sits behind the app. Preview updates instantly — your choice is remembered on this device.
          </div>
          <div class="ambient-grid" id="ambient-picker">
            <button type="button" class="ambient-card" data-ambient="none">
              <div class="ambient-thumb amb-thumb-none">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <div class="ambient-label">Off</div>
              <div class="ambient-desc">No background</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="snow">
              <div class="ambient-thumb amb-thumb-snow">
                <span class="flake" style="left:20%;top:15%">·</span>
                <span class="flake" style="left:50%;top:30%">·</span>
                <span class="flake" style="left:75%;top:20%">·</span>
                <span class="flake" style="left:35%;top:55%">·</span>
                <span class="flake" style="left:65%;top:65%">·</span>
                <span class="flake" style="left:15%;top:75%">·</span>
              </div>
              <div class="ambient-label">Snow</div>
              <div class="ambient-desc">Soft drifting flakes</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="rain">
              <div class="ambient-thumb amb-thumb-rain"></div>
              <div class="ambient-label">Rain</div>
              <div class="ambient-desc">Angled light streaks</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="stars">
              <div class="ambient-thumb amb-thumb-stars">
                <span class="star" style="left:15%;top:20%"></span>
                <span class="star" style="left:80%;top:15%"></span>
                <span class="star" style="left:60%;top:45%"></span>
                <span class="star" style="left:25%;top:65%"></span>
                <span class="star" style="left:75%;top:75%"></span>
                <span class="star" style="left:45%;top:80%"></span>
              </div>
              <div class="ambient-label">Stars</div>
              <div class="ambient-desc">Twinkling gold points</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="aurora">
              <div class="ambient-thumb amb-thumb-aurora"></div>
              <div class="ambient-label">Aurora</div>
              <div class="ambient-desc">Slow drifting colour</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="matrix">
              <div class="ambient-thumb amb-thumb-matrix">
                <span>1</span><span>0</span><span>$</span><span>1</span><span>ﾃ</span><span>0</span>
              </div>
              <div class="ambient-label">Matrix</div>
              <div class="ambient-desc">Falling green code</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="fireflies">
              <div class="ambient-thumb amb-thumb-firefly">
                <span class="fly" style="left:25%;top:30%"></span>
                <span class="fly" style="left:70%;top:20%"></span>
                <span class="fly" style="left:55%;top:60%"></span>
                <span class="fly" style="left:20%;top:75%"></span>
              </div>
              <div class="ambient-label">Fireflies</div>
              <div class="ambient-desc">Warm meandering glow</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="confetti">
              <div class="ambient-thumb amb-thumb-confetti">
                <span style="background:#D4AF37;left:15%;top:20%"></span>
                <span style="background:#f43f5e;left:55%;top:15%"></span>
                <span style="background:#8b5cf6;left:75%;top:45%"></span>
                <span style="background:#10b981;left:25%;top:65%"></span>
                <span style="background:#38bdf8;left:65%;top:75%"></span>
              </div>
              <div class="ambient-label">Confetti</div>
              <div class="ambient-desc">Playful colour bits</div>
            </button>
            <button type="button" class="ambient-card" data-ambient="bubbles">
              <div class="ambient-thumb amb-thumb-bubbles">
                <span style="left:15%;top:70%;width:16px;height:16px"></span>
                <span style="left:45%;top:55%;width:12px;height:12px"></span>
                <span style="left:70%;top:40%;width:20px;height:20px"></span>
                <span style="left:30%;top:25%;width:9px;height:9px"></span>
              </div>
              <div class="ambient-label">Bubbles</div>
              <div class="ambient-desc">Floating up gently</div>
            </button>
          </div>
        </div>

        <style>
          .ambient-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 12px;
          }
          .ambient-card {
            display: flex; flex-direction: column; align-items: stretch; gap: 6px;
            padding: 10px; background: rgba(255,255,255,0.03);
            border: 1px solid var(--border-color); border-radius: 12px;
            cursor: pointer; text-align: left; font-family: 'Inter', sans-serif;
            transition: transform .18s ease, border-color .18s ease, background .18s ease;
            color: var(--text-primary);
          }
          .ambient-card:hover { transform: translateY(-2px); border-color: rgba(56,189,248,0.45); background: rgba(56,189,248,0.05); }
          .ambient-card.active {
            border-color: #38bdf8;
            background: rgba(56,189,248,0.08);
            box-shadow: 0 0 0 2px rgba(56,189,248,0.18);
          }
          .ambient-thumb {
            position: relative; height: 74px; border-radius: 8px; overflow: hidden;
            background: linear-gradient(135deg, #0a0a0f, #14141c);
            border: 1px solid rgba(255,255,255,0.06);
            display: flex; align-items: center; justify-content: center;
            color: rgba(255,255,255,0.35);
          }
          .ambient-label { font-size: 12.5px; font-weight: 700; color: var(--text-primary); }
          .ambient-desc  { font-size: 10.5px; color: var(--text-muted); line-height: 1.35; }

          /* --- Thumb previews ------------------------------------------- */
          .amb-thumb-snow .flake { position: absolute; color: #e0f2fe; font-size: 22px; line-height: 1; text-shadow: 0 0 4px #fff; animation: ambFall 3s linear infinite; }
          .amb-thumb-snow .flake:nth-child(2) { animation-duration: 3.6s; animation-delay: -0.7s; }
          .amb-thumb-snow .flake:nth-child(3) { animation-duration: 2.4s; animation-delay: -1.4s; }
          .amb-thumb-snow .flake:nth-child(4) { animation-duration: 3.2s; animation-delay: -0.3s; }
          .amb-thumb-snow .flake:nth-child(5) { animation-duration: 2.8s; animation-delay: -1.0s; }
          .amb-thumb-snow .flake:nth-child(6) { animation-duration: 3.4s; animation-delay: -1.7s; }
          @keyframes ambFall { from { transform: translateY(-20px); } to { transform: translateY(80px); } }

          .amb-thumb-rain {
            background:
              linear-gradient(115deg, rgba(180,210,240,0) 46%, rgba(180,210,240,.45) 50%, rgba(180,210,240,0) 54%) 0 0/22px 100%,
              linear-gradient(135deg, #0b1220, #131c2e);
            animation: ambRain 700ms linear infinite;
          }
          @keyframes ambRain { to { background-position-x: -22px, 0; } }

          .amb-thumb-stars { background: radial-gradient(ellipse at center, #0f0f1a 0%, #050508 100%); }
          .amb-thumb-stars .star { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #D4AF37; box-shadow: 0 0 6px #D4AF37; animation: ambTwinkle 1.8s ease-in-out infinite; }
          .amb-thumb-stars .star:nth-child(1) { animation-delay: 0s; }
          .amb-thumb-stars .star:nth-child(2) { animation-delay: -0.4s; }
          .amb-thumb-stars .star:nth-child(3) { animation-delay: -0.8s; }
          .amb-thumb-stars .star:nth-child(4) { animation-delay: -1.2s; }
          .amb-thumb-stars .star:nth-child(5) { animation-delay: -1.6s; }
          .amb-thumb-stars .star:nth-child(6) { animation-delay: -0.6s; }
          @keyframes ambTwinkle { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

          .amb-thumb-aurora {
            background:
              radial-gradient(circle at 20% 40%, rgba(139,92,246,.55), transparent 55%),
              radial-gradient(circle at 80% 60%, rgba(212,175,55,.45), transparent 55%),
              radial-gradient(circle at 50% 30%, rgba(56,189,248,.35), transparent 55%),
              #050508;
            animation: ambAurora 8s ease-in-out infinite;
            filter: blur(2px);
          }
          @keyframes ambAurora {
            0%,100% { background-position: 20% 40%, 80% 60%, 50% 30%, 0 0; }
            50%     { background-position: 60% 20%, 20% 80%, 30% 60%, 0 0; }
          }

          .amb-thumb-matrix { background: #000; color: #4ade80; font-family: monospace; font-size: 14px; font-weight: 700; }
          .amb-thumb-matrix span { position: absolute; text-shadow: 0 0 4px #4ade80; animation: ambMatrixFall 2s linear infinite; }
          .amb-thumb-matrix span:nth-child(1) { left: 15%; animation-delay: 0s; }
          .amb-thumb-matrix span:nth-child(2) { left: 30%; animation-delay: -0.4s; }
          .amb-thumb-matrix span:nth-child(3) { left: 45%; animation-delay: -0.8s; }
          .amb-thumb-matrix span:nth-child(4) { left: 60%; animation-delay: -1.2s; }
          .amb-thumb-matrix span:nth-child(5) { left: 75%; animation-delay: -1.6s; }
          .amb-thumb-matrix span:nth-child(6) { left: 90%; animation-delay: -0.2s; }
          @keyframes ambMatrixFall { from { top: -14px; opacity: 1; } to { top: 74px; opacity: 0.2; } }

          .amb-thumb-firefly { background: radial-gradient(ellipse at center, #1a1a10 0%, #05050a 100%); }
          .amb-thumb-firefly .fly { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff0aa; box-shadow: 0 0 8px #fdd961, 0 0 14px rgba(253,217,97,.6); animation: ambFlyPulse 1.4s ease-in-out infinite; }
          .amb-thumb-firefly .fly:nth-child(2) { animation-delay: -0.4s; }
          .amb-thumb-firefly .fly:nth-child(3) { animation-delay: -0.8s; }
          .amb-thumb-firefly .fly:nth-child(4) { animation-delay: -1.1s; }
          @keyframes ambFlyPulse { 0%,100% { opacity: 0.3; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.1); } }

          .amb-thumb-confetti { background: linear-gradient(135deg, #0f0f1a, #16192a); }
          .amb-thumb-confetti span { position: absolute; width: 6px; height: 3px; border-radius: 1px; animation: ambFall 2.4s linear infinite; }
          .amb-thumb-confetti span:nth-child(1) { animation-delay: 0s; }
          .amb-thumb-confetti span:nth-child(2) { animation-delay: -0.5s; }
          .amb-thumb-confetti span:nth-child(3) { animation-delay: -1.0s; }
          .amb-thumb-confetti span:nth-child(4) { animation-delay: -1.5s; }
          .amb-thumb-confetti span:nth-child(5) { animation-delay: -2.0s; }

          .amb-thumb-bubbles { background: linear-gradient(180deg, #0b1a2c, #050810); }
          .amb-thumb-bubbles span { position: absolute; border-radius: 50%; border: 1px solid rgba(150,200,255,.55); background: rgba(150,200,255,.08); animation: ambRise 3s linear infinite; }
          .amb-thumb-bubbles span:nth-child(1) { animation-delay: 0s; }
          .amb-thumb-bubbles span:nth-child(2) { animation-delay: -0.8s; }
          .amb-thumb-bubbles span:nth-child(3) { animation-delay: -1.6s; }
          .amb-thumb-bubbles span:nth-child(4) { animation-delay: -2.2s; }
          @keyframes ambRise { from { transform: translateY(20px); opacity: 0.9; } to { transform: translateY(-80px); opacity: 0; } }

          @media (prefers-reduced-motion: reduce) {
            .amb-thumb-snow .flake,
            .amb-thumb-rain,
            .amb-thumb-stars .star,
            .amb-thumb-aurora,
            .amb-thumb-matrix span,
            .amb-thumb-firefly .fly,
            .amb-thumb-confetti span,
            .amb-thumb-bubbles span { animation: none !important; }
          }
        </style>
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

  function renderDiscord() {
    // UI-only mirror of the Telegram card. No backend wiring yet — inputs
    // are inert scaffolding for future Discord webhook + bot integration.
    return `
      <div class="settings-section stagger-item" id="section-discord">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(88,101,242,0.12);color:#5865F2;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.078.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037c-1.714.298-3.354.822-4.885 1.515a.07.07 0 00-.032.027C.533 9.045-.32 13.579.099 18.057a.083.083 0 00.031.056 19.9 19.9 0 006.001 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.225-1.994a.076.076 0 00-.041-.105 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.009c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.891.077.077 0 00-.041.106c.36.699.772 1.363 1.225 1.994a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.028zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.419-2.157 2.419z"/></svg>
          </div>
          <h2>Discord Integration</h2>
          <span class="status-dot" style="background:#64748b;box-shadow:0 0 0 3px rgba(100,116,139,.15);"></span>
          <span class="status-label" style="color:#64748b;">Not configured</span>
        </div>
        <div class="settings-card telegram-card">
          <div class="tg-help">
            <p>Create a Discord webhook in your server: <b>Server Settings → Integrations → Webhooks → New Webhook</b>. Or create a bot at <a href="https://discord.com/developers/applications" target="_blank" style="color:#a5b4fc;">discord.com/developers</a>.</p>
          </div>
          <div class="settings-form-grid">
            <div class="form-group">
              <label>Webhook URL</label>
              <div class="input-with-toggle">
                <input type="password" class="form-input" id="s-dc-webhook" placeholder="https://discord.com/api/webhooks/1234567890/xyz…" />
                <button type="button" class="input-toggle-btn" id="dc-webhook-toggle">Show</button>
              </div>
            </div>
            <div class="form-group">
              <label>Bot Token <span style="color:#64748b;font-weight:400;">(optional)</span></label>
              <input type="password" class="form-input" id="s-dc-bot-token" placeholder="MTA1NDU1MzEwNzUwMjY5MzQ0Mg.GxyZAB..." />
            </div>
            <div class="form-group">
              <label>Channel ID <span style="color:#64748b;font-weight:400;">(bot mode)</span></label>
              <input type="text" class="form-input" id="s-dc-channel" placeholder="1234567890123456789" />
            </div>
            <div class="form-group">
              <label>Bot Nickname</label>
              <input type="text" class="form-input" id="s-dc-nick" placeholder="ALP Sentinel" />
            </div>
          </div>
          <div class="settings-toggles">
            <label class="toggle-row"><span>Active</span><input type="checkbox" id="s-dc-active" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify New Sessions</span><input type="checkbox" id="s-dc-sessions" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Form Data</span><input type="checkbox" id="s-dc-formdata" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Errors</span><input type="checkbox" id="s-dc-errors" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Domain Flagged</span><input type="checkbox" id="s-dc-flagged" class="toggle-cb" /><span class="toggle-switch"></span></label>
          </div>
          <div class="settings-actions" style="gap:10px;">
            <button class="btn btn-outline" id="test-dc-btn" disabled title="Coming soon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Test Webhook
            </button>
            <button class="btn btn-primary" id="save-dc-btn" disabled title="Coming soon">Save Discord Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderMail() {
    // UI-only mirror of the Telegram card. Fields represent a standard SMTP
    // config plus per-event toggles. No backend wiring yet.
    return `
      <div class="settings-section stagger-item" id="section-mail">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>
          </div>
          <h2>Email Integration</h2>
          <span class="status-dot" style="background:#64748b;box-shadow:0 0 0 3px rgba(100,116,139,.15);"></span>
          <span class="status-label" style="color:#64748b;">Not configured</span>
        </div>
        <div class="settings-card telegram-card">
          <div class="tg-help">
            <p>Send alerts via SMTP. Works with Gmail (app password), SendGrid, Mailgun, Postmark, or any SMTP provider. TLS is enforced.</p>
          </div>
          <div class="settings-form-grid">
            <div class="form-group">
              <label>SMTP Host</label>
              <input type="text" class="form-input" id="s-ml-host" placeholder="smtp.gmail.com" />
            </div>
            <div class="form-group">
              <label>Port</label>
              <input type="number" class="form-input" id="s-ml-port" placeholder="587" />
            </div>
            <div class="form-group">
              <label>Username</label>
              <input type="text" class="form-input" id="s-ml-user" placeholder="alerts@yourdomain.com" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Password / API Key</label>
              <div class="input-with-toggle">
                <input type="password" class="form-input" id="s-ml-pass" placeholder="••••••••••••" autocomplete="new-password" />
                <button type="button" class="input-toggle-btn" id="ml-pass-toggle">Show</button>
              </div>
            </div>
            <div class="form-group">
              <label>From Address</label>
              <input type="email" class="form-input" id="s-ml-from" placeholder="ALP Panel &lt;alerts@yourdomain.com&gt;" />
            </div>
            <div class="form-group">
              <label>Recipient(s) <span style="color:#64748b;font-weight:400;">(comma-separated)</span></label>
              <input type="text" class="form-input" id="s-ml-to" placeholder="you@example.com, oncall@example.com" />
            </div>
          </div>
          <div class="settings-toggles">
            <label class="toggle-row"><span>Active</span><input type="checkbox" id="s-ml-active" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Use TLS (STARTTLS)</span><input type="checkbox" id="s-ml-tls" class="toggle-cb" checked /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify New Sessions</span><input type="checkbox" id="s-ml-sessions" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Form Data</span><input type="checkbox" id="s-ml-formdata" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Errors</span><input type="checkbox" id="s-ml-errors" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Notify Domain Flagged</span><input type="checkbox" id="s-ml-flagged" class="toggle-cb" /><span class="toggle-switch"></span></label>
            <label class="toggle-row"><span>Daily Digest</span><input type="checkbox" id="s-ml-digest" class="toggle-cb" /><span class="toggle-switch"></span></label>
          </div>
          <div class="settings-actions" style="gap:10px;">
            <button class="btn btn-outline" id="test-ml-btn" disabled title="Coming soon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Send Test Email
            </button>
            <button class="btn btn-primary" id="save-ml-btn" disabled title="Coming soon">Save Mail Settings</button>
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

          <div class="alp-tabs alp-tabs--compact deploy-subtabs" data-default="ssh">
            <div class="alp-tabs-bar" role="tablist">
              <button type="button" class="alp-tab active" data-tab="ssh">
                <span class="alp-tab-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></span>
                SSH Auth
              </button>
              <button type="button" class="alp-tab" data-tab="app">
                <span class="alp-tab-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="6" y1="9" x2="6" y2="15"/><path d="M18 9a9 9 0 00-9 9"/></svg></span>
                Repo &amp; App
              </button>
              <button type="button" class="alp-tab" data-tab="env">
                <span class="alp-tab-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                Environment
              </button>
              <button type="button" class="alp-tab" data-tab="run">
                <span class="alp-tab-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>
                Deploy
              </button>
            </div>

            <!-- SSH Auth panel -->
            <div class="alp-tab-panel active" data-panel="ssh">
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

            </div><!-- /panel:ssh -->

            <!-- Repo & App panel -->
            <div class="alp-tab-panel" data-panel="app">
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

            </div><!-- /panel:app -->

            <!-- Environment panel -->
            <div class="alp-tab-panel" data-panel="env">
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

            </div><!-- /panel:env -->

            <!-- Deploy panel -->
            <div class="alp-tab-panel" data-panel="run">
          <!-- Actions -->
          <div class="settings-card" style="margin-bottom:16px;">
            <div class="infra-sub-header" style="margin-top:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <h3>Actions</h3>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
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
              <div id="tile-quick-sync" style="padding:16px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:12px;display:none;">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">⚡ Quick Pull <span style="font-size:9px;font-weight:700;background:rgba(212,175,55,0.15);color:#D4AF37;padding:2px 6px;border-radius:4px;margin-left:4px;letter-spacing:0.5px;">GOD</span></div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">Content-only sync: <code style="background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;">git fetch + reset --hard</code> on VPS. No npm install, no PM2 restart.</div>
                <button id="btn-quick-sync" class="btn btn-outline" style="width:100%;justify-content:center;border-color:rgba(34,197,94,0.4);color:#4ade80;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
                  Quick Pull VPS
                </button>
                <div id="quick-sync-result" style="margin-top:10px;font-size:11px;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,0.55);word-break:break-all;"></div>
              </div>
            </div>
          </div>

            </div><!-- /panel:run -->
          </div><!-- /alp-tabs deploy-subtabs -->

          <!-- Terminal Output — outside sub-tabs so it stays visible while deploying -->
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
          </div>
        </div>

        <input type="hidden" id="infra-active-provider" value="vps">

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

  // ─── Notifications preferences (per-user delivery matrix + telegram mirror) ──
  function renderNotifications() {
    const CATS = [
      { key: 'security', label: 'Security',  desc: 'Logins, 2FA, resets, sessions, role changes', color: '#f87171' },
      { key: 'tenant',   label: 'Tenant',    desc: 'Websites, domains, VPS changes by any user',   color: '#a78bfa' },
      { key: 'system',   label: 'System',    desc: 'Pipeline outcomes: domain live / flagged / down', color: '#38bdf8' },
      { key: 'activity', label: 'Activity',  desc: 'Visitor traffic and capture events (noisy)',   color: '#34d399' },
    ];
    const SEV = ['low', 'normal', 'high', 'critical'];
    const MODES = [
      { v: 'silent', l: 'Badge only',      hint: 'Just bumps the unread count.' },
      { v: 'normal', l: 'Badge + chime',   hint: 'Subtle sound, no toast.' },
      { v: 'toast',  l: 'Toast + chime',   hint: 'Pops a toast; critical also plays alarm sound.' },
    ];
    const rows = CATS.map(c => `
      <div class="np-row" data-cat="${c.key}" style="--cat-color:${c.color};">
        <div class="np-row-head">
          <div class="np-cat-dot"></div>
          <div>
            <div class="np-cat-label">${c.label}</div>
            <div class="np-cat-desc">${c.desc}</div>
          </div>
          <label class="np-telegram-toggle" title="Also mirror high/critical to Telegram">
            <input type="checkbox" class="np-tg-cb" data-cat="${c.key}" />
            <span>📱 Telegram</span>
          </label>
        </div>
        <div class="np-sev-grid">
          ${SEV.map(s => `
            <div class="np-sev-cell">
              <div class="np-sev-lbl">${s}</div>
              <select class="np-sev-select" data-cat="${c.key}" data-sev="${s}">
                ${MODES.map(m => `<option value="${m.v}" title="${m.hint}">${m.l}</option>`).join('')}
              </select>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <div class="settings-section stagger-item" id="section-notifications">
        <div class="section-header">
          <div class="section-icon" style="background:rgba(59,130,246,0.12);color:#3b82f6;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          </div>
          <h2>Notifications</h2>
        </div>
        <div class="settings-card">
          <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.55;">
            Choose how each category and severity is delivered. Watched-user events always toast.
            High / critical severities also mirror to Telegram if you provide your chat id below and enable the toggle.
          </div>
          <div class="np-rows">${rows}</div>

          <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--border-color);">
            <div class="form-group">
              <label>Toast position <span style="font-size:11px;color:var(--text-muted);">(where notifications appear on screen)</span></label>
              <div class="np-pos-picker" id="np-pos-picker">
                <button type="button" class="np-pos-btn" data-pos="left" title="Slides in from the top-left">
                  <div class="np-pos-preview np-pos-preview--left">
                    <span></span>
                    <span></span>
                  </div>
                  <div class="np-pos-label">Left</div>
                  <div class="np-pos-desc">Default</div>
                </button>
                <button type="button" class="np-pos-btn" data-pos="center" title="Drops down from the top-center">
                  <div class="np-pos-preview np-pos-preview--center">
                    <span></span>
                    <span></span>
                  </div>
                  <div class="np-pos-label">Center</div>
                  <div class="np-pos-desc">Top-drop</div>
                </button>
                <button type="button" class="np-pos-btn" data-pos="right" title="Slides in from the top-right">
                  <div class="np-pos-preview np-pos-preview--right">
                    <span></span>
                    <span></span>
                  </div>
                  <div class="np-pos-label">Right</div>
                  <div class="np-pos-desc">Classic</div>
                </button>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
                Applies instantly and is remembered on this device. Try it — click a position, a preview toast will appear.
              </div>
            </div>
          </div>

          <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--border-color);">
            <div class="form-group">
              <label>Personal Telegram chat id <span style="font-size:11px;color:var(--text-muted);">(get from @userinfobot)</span></label>
              <input type="text" class="form-input" id="np-tg-chatid" placeholder="e.g. 123456789 or -1001234567890" />
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
                Independent of the panel-wide Telegram config. Only used to mirror <b>your</b> notifications.
              </div>
            </div>
          </div>

          <div class="settings-actions">
            <button class="btn btn-primary" id="save-notif-prefs-btn">Save Notification Prefs</button>
          </div>
        </div>

        <style>
          .np-rows { display:flex; flex-direction:column; gap:10px; }
          .np-row {
            padding: 14px; border-radius: 12px;
            background: rgba(255,255,255,.02);
            border: 1px solid var(--border-color);
            border-left: 3px solid var(--cat-color);
          }
          .np-row-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
          .np-cat-dot { width:10px; height:10px; border-radius:50%; background: var(--cat-color); box-shadow: 0 0 8px var(--cat-color); flex-shrink:0; }
          .np-cat-label { font-size:13px; font-weight:700; color:var(--text-primary); }
          .np-cat-desc  { font-size:11.5px; color:var(--text-muted); margin-top:2px; }
          .np-telegram-toggle {
            margin-left:auto; display:flex; align-items:center; gap:6px;
            font-size:11.5px; color: var(--text-secondary); cursor:pointer;
            padding: 4px 10px; border-radius: 20px;
            background: rgba(0,136,204,.06); border:1px solid rgba(0,136,204,.2);
          }
          .np-telegram-toggle input { accent-color: #38bdf8; }
          .np-sev-grid {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
          }
          @media (max-width: 700px) { .np-sev-grid { grid-template-columns: repeat(2, 1fr); } }
          .np-sev-cell { display:flex; flex-direction:column; gap:4px; }
          .np-sev-lbl {
            font-size:10px; font-weight:700; text-transform:uppercase;
            letter-spacing:.06em; color:var(--text-muted);
          }
          .np-sev-select {
            width:100%; padding:8px 10px; font-size:12px;
            background: rgba(255,255,255,.04);
            border:1px solid var(--border-color); border-radius:8px;
            color: var(--text-primary);
            font-family:'Inter',sans-serif;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 28px;
          }

          /* ── Toast position picker ─────────────────────────────────── */
          .np-pos-picker {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 6px;
          }
          .np-pos-btn {
            display: flex; flex-direction: column; align-items: stretch; gap: 6px;
            padding: 10px 10px 12px;
            background: rgba(255,255,255,.03);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            cursor: pointer; text-align: left;
            font-family: 'Inter', sans-serif;
            color: var(--text-primary);
            transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
          }
          .np-pos-btn:hover {
            transform: translateY(-2px);
            border-color: rgba(56,189,248,.45);
            background: rgba(56,189,248,.04);
          }
          .np-pos-btn.active {
            border-color: #38bdf8;
            background: rgba(56,189,248,.08);
            box-shadow: 0 0 0 2px rgba(56,189,248,.18);
          }
          .np-pos-preview {
            position: relative;
            height: 58px;
            border-radius: 8px;
            background: linear-gradient(135deg, #0a0a0f, #14141c);
            border: 1px solid rgba(255,255,255,.06);
            overflow: hidden;
          }
          .np-pos-preview span {
            position: absolute;
            display: block;
            height: 8px;
            border-radius: 2px;
            background: linear-gradient(90deg, #38bdf8, #0ea5e9);
            box-shadow: 0 2px 6px rgba(56,189,248,.35);
          }
          .np-pos-preview--left span:nth-child(1) { top: 8px;  left: 6px;  width: 46%; animation: npSlideInL 2.2s ease-in-out infinite; }
          .np-pos-preview--left span:nth-child(2) { top: 22px; left: 6px;  width: 32%; animation: npSlideInL 2.2s ease-in-out infinite .35s; opacity: .7; }
          .np-pos-preview--right span:nth-child(1) { top: 8px;  right: 6px; width: 46%; animation: npSlideInR 2.2s ease-in-out infinite; }
          .np-pos-preview--right span:nth-child(2) { top: 22px; right: 6px; width: 32%; animation: npSlideInR 2.2s ease-in-out infinite .35s; opacity: .7; }
          .np-pos-preview--center span:nth-child(1) { top: 8px;  left: 50%; width: 46%; transform: translateX(-50%); animation: npDropDown 2.2s ease-in-out infinite; }
          .np-pos-preview--center span:nth-child(2) { top: 22px; left: 50%; width: 32%; transform: translateX(-50%); animation: npDropDown 2.2s ease-in-out infinite .35s; opacity: .7; }
          @keyframes npSlideInL {
            0%       { transform: translateX(-110%); opacity: 0; }
            15%, 80% { transform: translateX(0);     opacity: 1; }
            100%     { transform: translateX(-110%); opacity: 0; }
          }
          @keyframes npSlideInR {
            0%       { transform: translateX(110%);  opacity: 0; }
            15%, 80% { transform: translateX(0);     opacity: 1; }
            100%     { transform: translateX(110%);  opacity: 0; }
          }
          @keyframes npDropDown {
            0%       { transform: translate(-50%, -140%); opacity: 0; }
            15%, 80% { transform: translate(-50%, 0);     opacity: 1; }
            100%     { transform: translate(-50%, -140%); opacity: 0; }
          }
          .np-pos-label { font-size: 12.5px; font-weight: 700; color: var(--text-primary); }
          .np-pos-desc  { font-size: 10.5px; color: var(--text-muted); }
          @media (prefers-reduced-motion: reduce) {
            .np-pos-preview span { animation: none !important; opacity: 1 !important; transform: none !important; }
            .np-pos-preview--left  span { left: 6px !important; }
            .np-pos-preview--right span { right: 6px !important; left: auto !important; }
            .np-pos-preview--center span { left: 50% !important; transform: translateX(-50%) !important; }
          }
        </style>
      </div>
    `;
  }

  return { renderGeneral, renderTelegram, renderDiscord, renderMail, renderWebsites, renderUsers, renderDanger, renderInfrastructure, renderPanel, renderNotifications };
})();

if (typeof window !== 'undefined') {
  window.SettingsSections = SettingsSections;
}
