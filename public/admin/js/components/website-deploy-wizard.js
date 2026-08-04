/**
 * Website Deploy Wizard
 *
 * A full-screen modal that walks the admin through hosting a website on its own VPS.
 * Opens from the "Host" button on each website card in Settings → Websites.
 *
 * Steps admin fills:
 *   • VPS host / SSH user / SSH port / SSH password
 *   • Public domain (e.g. investec-banking.com)
 *
 * Then one "Setup" click does EVERYTHING:
 *   SSH → install nginx → upload xPages/<slug> → CF zone → A records → SSL → nginx → live
 *
 * The terminal (identical to Panel Deploy) streams every step via SSE (/api/deploy/stream).
 */

window.WebsiteDeployWizard = (function () {
  let currentWebsite = null;
  let currentDeployId = null;
  let stepMap = {};

  // ── UI ────────────────────────────────────────────────────────────────────

  function open(website) {
    currentWebsite = website;
    render();
    loadConfig();
    loadVpsList();
  }

  async function loadVpsList() {
    try {
      const list = await window.ALPApi._request('GET', '/api/website-deploy/vps-list');
      const others = (list || []).filter(v => String(v.id) !== String(currentWebsite.id));
      if (!others.length) return; // no other VPS to copy from — leave the picker hidden

      // Group by host so admins see "3 sites already on 74.50.87.73"
      const byHost = {};
      for (const v of others) (byHost[v.vps_host] = byHost[v.vps_host] || []).push(v);

      const sel = document.getElementById('wdw-copy-vps-select');
      if (!sel) return;
      sel.innerHTML = '<option value="">— pick a website —</option>' +
        Object.entries(byHost).map(([host, sites]) => {
          const label = `${host}${sites.length > 1 ? `  (${sites.length} sites)` : ''}`;
          return `<optgroup label="${escape(label)}">` +
            sites.map(v => {
              const auth = v.has_pass ? 'password' : v.has_key ? 'ssh-key' : 'no-auth';
              return `<option value="${v.id}">${escape(v.name)} — ${escape(v.vps_ssh_user)} · ${auth}</option>`;
            }).join('') +
            `</optgroup>`;
        }).join('');
      document.getElementById('wdw-copy-vps-wrap').style.display = 'block';
    } catch (e) {
      console.warn('loadVpsList:', e);
    }
  }

  async function copyVpsFromSource() {
    const sel = document.getElementById('wdw-copy-vps-select');
    const btn = document.getElementById('wdw-copy-vps-btn');
    if (!sel || !sel.value) {
      window.showToast('Pick a website to copy from', 'warn');
      return;
    }
    const orig = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Copying…';
    try {
      const r = await window.ALPApi._request(
        'POST',
        `/api/website-deploy/${currentWebsite.id}/copy-vps/${sel.value}`
      );
      window.showToast(`Copied VPS from "${r.source_name}" (${r.copied.host})`, 'success');
      await loadConfig(); // refill host/port/user + show "saved securely" chip
    } catch (e) {
      window.showToast('Copy failed: ' + e.message, 'error');
    }
    btn.disabled = false; btn.innerHTML = orig;
  }

  function render() {
    const w = currentWebsite;
    const modal = document.createElement('div');
    modal.id = 'wdw-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 20px;';
    modal.innerHTML = `
      <style>
        .wdw-body { --wdw-accent:#14b8a6; --wdw-accent-2:#0ea5e9; }
        .wdw-body input.form-input { background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.08); border-radius:9px; padding:11px 14px; font-size:13px; color:#fff; transition:border-color .15s, background .15s; }
        .wdw-body input.form-input:focus { outline:none; border-color:var(--wdw-accent); background:rgba(20,184,166,0.06); }
        .wdw-body label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:rgba(255,255,255,0.55); display:block; margin-bottom:6px; }
        .wdw-body label .hint { font-weight:400; text-transform:none; letter-spacing:0; color:rgba(255,255,255,0.35); font-size:10.5px; margin-left:4px; }
        .wdw-section { padding:20px 22px; border-top:1px solid rgba(255,255,255,0.05); }
        .wdw-section-title { display:flex; align-items:center; gap:10px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.09em; color:rgba(255,255,255,0.5); margin-bottom:14px; }
        .wdw-section-title-dot { width:6px; height:6px; border-radius:50%; background:var(--wdw-accent); box-shadow:0 0 0 3px rgba(20,184,166,0.15); }
        .wdw-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .wdw-btn-primary {
          width:100%; padding:14px 20px; border-radius:11px;
          background:linear-gradient(135deg, var(--wdw-accent), var(--wdw-accent-2));
          border:none; color:white; font-weight:600; font-size:13.5px;
          cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px;
          transition:transform .12s, box-shadow .18s;
          box-shadow:0 4px 20px rgba(20,184,166,0.25);
        }
        .wdw-btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 24px rgba(20,184,166,0.35); }
        .wdw-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .wdw-btn-ghost {
          padding:11px 18px; border-radius:9px; background:transparent;
          border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.75);
          font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:7px;
          transition:all .12s;
        }
        .wdw-btn-ghost:hover { border-color:rgba(255,255,255,0.2); background:rgba(255,255,255,0.03); color:#fff; }
        .wdw-status-banner {
          display:flex; align-items:center; gap:12px;
          padding:14px 22px; background:rgba(0,0,0,0.25);
          border-bottom:1px solid rgba(255,255,255,0.05);
        }
        .wdw-status-dot { width:10px; height:10px; border-radius:50%; }
        .wdw-input-with-toggle { position:relative; }
        .wdw-input-with-toggle input.form-input { padding-right:60px; }
        .wdw-input-with-toggle button.reveal { position:absolute; right:6px; top:50%; transform:translateY(-50%);
          background:transparent; border:none; color:rgba(255,255,255,0.5); padding:6px 10px; border-radius:6px; font-size:11px; cursor:pointer; }
        .wdw-input-with-toggle button.reveal:hover { color:#fff; background:rgba(255,255,255,0.05); }
        .wdw-saved-chip {
          display:flex; align-items:center; gap:10px;
          padding:11px 14px; background:rgba(52,211,153,0.08);
          border:1px solid rgba(52,211,153,0.2); border-radius:9px;
          font-size:12px; color:#34d399; font-family:'JetBrains Mono',monospace;
        }
        .wdw-saved-chip button { margin-left:auto; background:transparent; border:none; color:rgba(255,255,255,0.5); font-size:11px; cursor:pointer; padding:2px 8px; border-radius:5px; }
        .wdw-saved-chip button:hover { color:#fff; background:rgba(255,255,255,0.05); }
        .wdw-ns-card {
          margin:0 22px 22px; padding:18px 20px;
          background:linear-gradient(135deg, rgba(251,191,36,0.06), rgba(245,158,11,0.03));
          border:1px solid rgba(251,191,36,0.25); border-radius:14px;
        }
        .wdw-ns-title { display:flex; align-items:center; gap:9px; font-size:12px; font-weight:600; color:#fbbf24; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em; }
        .wdw-ns-desc { font-size:12px; color:rgba(255,255,255,0.7); line-height:1.55; margin-bottom:12px; }
        .wdw-ns-desc code { background:rgba(0,0,0,0.35); padding:2px 7px; border-radius:5px; font-size:11px; color:#fbbf24; }
        .wdw-ns-item {
          display:flex; align-items:center; gap:10px;
          padding:9px 12px; background:rgba(0,0,0,0.35);
          border:1px solid rgba(255,255,255,0.05); border-radius:8px;
          font-family:'JetBrains Mono',monospace; font-size:12px; color:#fbbf24;
          margin-bottom:6px;
        }
        .wdw-ns-copy { margin-left:auto; padding:5px 11px; background:rgba(251,191,36,0.15); border:none;
          color:#fbbf24; font-size:10px; font-weight:600; border-radius:5px; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; }
        .wdw-ns-copy:hover { background:rgba(251,191,36,0.28); }
        .wdw-ns-footer { font-size:11px; color:rgba(255,255,255,0.5); margin-top:12px; }
        .wdw-ns-footer a { color:#5eead4; text-decoration:none; }

        .wdw-terminal { margin:0 22px 22px; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.4); }
        .wdw-term-bar { display:flex; align-items:center; gap:10px; padding:12px 16px; background:rgba(0,0,0,0.5); border-bottom:1px solid rgba(255,255,255,0.05); }
        .wdw-term-lights { display:flex; gap:6px; }
        .wdw-term-light { width:11px; height:11px; border-radius:50%; }
        .wdw-term-title { flex:1; text-align:center; font-family:'JetBrains Mono',monospace; font-size:11.5px; color:rgba(255,255,255,0.55); }
        .wdw-term-body { display:grid; grid-template-columns:230px 1fr; min-height:380px; }
        .wdw-term-steps { padding:16px 12px; background:rgba(0,0,0,0.3); border-right:1px solid rgba(255,255,255,0.04); display:flex; flex-direction:column; gap:5px; overflow-y:auto; max-height:520px; }
        .wdw-term-log { padding:16px; font-family:'JetBrains Mono',monospace; font-size:11.5px; line-height:1.65; overflow-y:auto; max-height:520px; background:rgba(8,10,20,0.65); white-space:pre-wrap; word-break:break-word; color:rgba(255,255,255,0.72); }
        .wdw-step { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:6px; font-size:11.5px; color:rgba(255,255,255,0.45); font-family:'JetBrains Mono',monospace; transition:all .18s; }
        .wdw-step .icon { width:14px; height:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:11px; }
        .wdw-step.running { color:#fff; background:rgba(20,184,166,0.08); }
        .wdw-step.running .icon { color:#14b8a6; animation:wdwSpin 0.8s linear infinite; }
        .wdw-step.done { color:#34d399; }
        .wdw-step.error { color:#f87171; }
        .wdw-step.warning { color:#fbbf24; }
        @keyframes wdwSpin { to { transform:rotate(360deg); } }
        @keyframes wdwBlink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        .wdw-term-summary { padding:13px 16px; background:rgba(0,0,0,0.35); border-top:1px solid rgba(255,255,255,0.05); font-family:'JetBrains Mono',monospace; font-size:12px; }
      </style>
      <div style="max-width:920px;width:100%;background:var(--bg-elevated,#0f1420);border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;margin:auto;box-shadow:0 30px 80px rgba(0,0,0,0.7);">

        <!-- HEADER -->
        <div style="display:flex;align-items:center;gap:14px;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,0.05);">
          <div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#14b8a6,#0ea5e9);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(20,184,166,0.3);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"><path d="M2 12s5-6 10-6 10 6 10 6-5 6-10 6-10-6-10-6z"/><path d="M12 4v2m0 12v2M5 12h2m10 0h2"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:15.5px;font-weight:600;color:#fff;letter-spacing:-0.01em;">Host on VPS</div>
            <div style="font-size:11.5px;color:rgba(255,255,255,0.5);margin-top:2px;">
              ${escape(w.name)}${w.demo_slug ? ` <span style="color:rgba(255,255,255,0.3);margin:0 5px;">·</span> <code style="font-size:11px;color:rgba(255,255,255,0.55);">xPages/${escape(w.demo_slug)}</code>` : ''}
            </div>
          </div>
          <button id="wdw-close" style="width:32px;height:32px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.55);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .12s;" onmouseover="this.style.background='rgba(255,255,255,0.05)';this.style.color='#fff';" onmouseout="this.style.background='transparent';this.style.color='rgba(255,255,255,0.55)';">✕</button>
        </div>

        <!-- STATUS BANNER -->
        <div id="wdw-status-row" class="wdw-status-banner"></div>

        <!-- BODY -->
        <div id="wdw-body" class="wdw-body" style="max-height:calc(100vh - 200px);overflow-y:auto;">

          <!-- VPS section -->
          <div class="wdw-section">
            <div class="wdw-section-title">
              <span class="wdw-section-title-dot"></span>
              Server
            </div>

            <!-- Copy-from-existing-VPS picker (only shown when other sites have a VPS) -->
            <div id="wdw-copy-vps-wrap" style="display:none;margin-bottom:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(14,165,233,0.06),rgba(20,184,166,0.04));border:1px solid rgba(20,184,166,0.22);border-radius:10px;">
              <label style="margin-bottom:8px;color:#5eead4;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Use same VPS as another website <span class="hint">— auto-fills host + credentials</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center;">
                <select id="wdw-copy-vps-select" class="form-input" style="flex:1;">
                  <option value="">— pick a website —</option>
                </select>
                <button id="wdw-copy-vps-btn" class="wdw-btn-ghost" style="flex-shrink:0;">Copy</button>
              </div>
            </div>

            <div style="margin-bottom:12px;">
              <label>IP Address <span class="hint">or hostname</span></label>
              <input type="text" id="wdw-vps-host" class="form-input" placeholder="74.50.87.73">
            </div>
            <div class="wdw-grid-2" style="margin-bottom:12px;">
              <div>
                <label>SSH Port</label>
                <input type="text" id="wdw-vps-port" class="form-input" placeholder="22">
              </div>
              <div>
                <label>SSH User</label>
                <input type="text" id="wdw-vps-user" class="form-input" placeholder="root">
              </div>
            </div>
            <div>
              <label>Root Password</label>
              <div id="wdw-pass-saved-row" class="wdw-saved-chip" style="display:none;">
                <span>🔒</span>
                <span>Saved securely — click Change to replace</span>
                <button id="wdw-pass-change">Change</button>
              </div>
              <div id="wdw-pass-input-wrap" class="wdw-input-with-toggle">
                <input type="text" id="wdw-vps-pass" class="form-input" placeholder="Enter the root password"
                  readonly autocomplete="off" data-lpignore="true" data-form-type="other"
                  name="wdw_vps_secret_${Math.random().toString(36).slice(2)}"
                  style="-webkit-text-security:disc;text-security:disc;">
                <button class="reveal" data-toggle-pass="wdw-vps-pass">Show</button>
              </div>
            </div>
          </div>

          <!-- Domain section -->
          <div class="wdw-section">
            <div class="wdw-section-title">
              <span class="wdw-section-title-dot"></span>
              Domain
            </div>
            <div>
              <label>Public Domain <span class="hint">example: investec-banking.com</span></label>
              <input type="text" id="wdw-domain" class="form-input" placeholder="example.com">
              <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;line-height:1.5;">
                A Cloudflare zone will be created automatically. You'll get nameservers to paste at your registrar.
              </div>
            </div>
          </div>

          <!-- Antibot toggle -->
          <div class="wdw-section">
            <div class="wdw-section-title">
              <span class="wdw-section-title-dot"></span>
              Antibot Gate
            </div>
            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:12px 14px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:9px;">
              <input type="checkbox" id="wdw-antibot" style="width:16px;height:16px;accent-color:#14b8a6;cursor:pointer;">
              <div style="flex:1;">
                <div style="font-size:12.5px;font-weight:600;color:#fff;">Inject antibot on this website's deployed HTML</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:3px;line-height:1.5;">
                  Hides pages until a fingerprint check passes. Needs the panel to serve <code style="color:#14b8a6;">/antibot.js</code> — otherwise pages get stuck invisible.
                </div>
              </div>
            </label>
          </div>

          <!-- Actions -->
          <div class="wdw-section" style="padding-top:16px;">
            <button id="wdw-setup" class="wdw-btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              Setup &amp; Deploy
            </button>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
              <button id="wdw-save" class="wdw-btn-ghost">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/></svg>
                Save config only
              </button>
              <button id="wdw-quick" class="wdw-btn-ghost" style="display:none;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Quick redeploy files
              </button>
            </div>
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);">
              <button id="wdw-strip-antibot" class="wdw-btn-ghost" style="width:100%;justify-content:center;color:#fbbf24;border-color:rgba(251,191,36,0.25);">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Strip antibot from deployed files
              </button>
              <div style="font-size:10.5px;color:rgba(255,255,255,0.4);margin-top:6px;line-height:1.5;text-align:center;">
                Emergency: removes the antibot hide-style + script tag from every HTML on the VPS. Use if the panel isn't serving <code style="color:#fbbf24;">/antibot.js</code> and pages are stuck invisible.
              </div>
            </div>
          </div>

          <!-- Nameservers box (progressive) -->
          <div id="wdw-ns-box" class="wdw-ns-card" style="display:none;">
            <div class="wdw-ns-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Manual step required</span>
            </div>
            <div class="wdw-ns-desc">
              At your registrar (Namecheap etc.), set the nameservers for <code id="wdw-ns-domain"></code> to:
            </div>
            <div id="wdw-ns-list"></div>
            <div class="wdw-ns-footer">
              DNS propagation typically takes 5–30 min. After that, your site is live at <span id="wdw-ns-url"></span>.
            </div>
            <div id="wdw-ns-prewarn"></div>
          </div>

          <!-- Terminal -->
          <div id="wdw-terminal-wrap" class="wdw-terminal" style="display:none;">
            <div class="wdw-term-bar">
              <div class="wdw-term-lights">
                <div class="wdw-term-light" style="background:#ff5f57;"></div>
                <div class="wdw-term-light" style="background:#febc2e;"></div>
                <div class="wdw-term-light" style="background:#28c840;"></div>
              </div>
              <span id="wdw-term-title" class="wdw-term-title">deploying…</span>
              <div id="wdw-term-status" style="width:8px;height:8px;border-radius:50%;background:#febc2e;animation:wdwBlink 1s ease-in-out infinite;"></div>
            </div>
            <div class="wdw-term-body">
              <div id="wdw-steps" class="wdw-term-steps"></div>
              <div id="wdw-log" class="wdw-term-log"></div>
            </div>
            <div id="wdw-summary" class="wdw-term-summary" style="display:none;"></div>
          </div>

        </div>
      </div>
    `;
    document.body.appendChild(modal);
    bindActions();
  }

  function close() {
    document.getElementById('wdw-modal')?.remove();
    currentWebsite = null;
    currentDeployId = null;
  }

  function bindActions() {
    document.getElementById('wdw-close')?.addEventListener('click', close);

    // Password reveal removes readonly (Chrome autofill bypass)
    const pinput = document.getElementById('wdw-vps-pass');
    if (pinput) pinput.addEventListener('focus', () => pinput.removeAttribute('readonly'));

    document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
      btn.addEventListener('click', function () {
        const t = document.getElementById(this.dataset.togglePass);
        if (!t) return;
        const showing = t.style.webkitTextSecurity === 'none';
        t.style.webkitTextSecurity = showing ? 'disc' : 'none';
        t.style.textSecurity       = showing ? 'disc' : 'none';
        this.textContent = showing ? 'Show' : 'Hide';
      });
    });

    document.getElementById('wdw-pass-change')?.addEventListener('click', () => {
      document.getElementById('wdw-pass-saved-row').style.display = 'none';
      document.getElementById('wdw-pass-input-wrap').style.display = '';
      document.getElementById('wdw-vps-pass').focus();
    });

    document.getElementById('wdw-save')?.addEventListener('click', saveConfig);
    document.getElementById('wdw-setup')?.addEventListener('click', () => runSetup(false));
    document.getElementById('wdw-quick')?.addEventListener('click', () => runSetup(true));
    document.getElementById('wdw-strip-antibot')?.addEventListener('click', stripAntibot);
    document.getElementById('wdw-copy-vps-btn')?.addEventListener('click', copyVpsFromSource);
  }

  async function stripAntibot() {
    if (!currentWebsite) return;
    const btn = document.getElementById('wdw-strip-antibot');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Stripping…';
    try {
      const r = await window.ALPApi._request('POST', `/api/website-deploy/${currentWebsite.id}/strip-antibot`);
      window.showToast(`Stripped from ${r.stripped} file(s), skipped ${r.unchanged} clean file(s). Hard-refresh the site to see the change.`, 'success');
    } catch (e) {
      window.showToast('Strip failed: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = orig;
  }

  // ── Load / Save ───────────────────────────────────────────────────────────

  async function loadConfig() {
    try {
      const cfg = await window.ALPApi._request('GET', `/api/website-deploy/${currentWebsite.id}/config`);
      const el = id => document.getElementById(id);
      if (el('wdw-vps-host')) el('wdw-vps-host').value = cfg.vps_host || '';
      if (el('wdw-vps-port')) el('wdw-vps-port').value = cfg.vps_ssh_port || 22;
      if (el('wdw-vps-user')) el('wdw-vps-user').value = cfg.vps_ssh_user || 'root';
      if (el('wdw-domain'))   el('wdw-domain').value   = cfg.deploy_domain || '';
      if (el('wdw-antibot'))  el('wdw-antibot').checked = !!cfg.antibot_enabled;
      if (cfg.has_pass) {
        el('wdw-pass-saved-row').style.display = 'flex';
        el('wdw-pass-input-wrap').style.display = 'none';
      }
      renderStatus(cfg);
      // Show quick redeploy button only if already set up
      if (cfg.deploy_status && cfg.deploy_status !== 'not_deployed') {
        document.getElementById('wdw-quick').style.display = '';
      }
      // Show nameservers box if we have them
      if (cfg.cf_nameservers) showNameservers(cfg.deploy_domain, cfg.cf_nameservers.split(','));
    } catch (e) { console.warn('Load config:', e); }
  }

  function renderStatus(cfg) {
    const row = document.getElementById('wdw-status-row');
    if (!row) return;
    const s = cfg.deploy_status || 'not_deployed';
    const map = {
      not_deployed: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'Not deployed yet',   icon: '○' },
      ns_pending:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Live · waiting on nameservers', icon: '◐' },
      live:         { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Live',              icon: '●' },
    };
    const m = map[s] || map.not_deployed;
    const url = cfg.deploy_domain ? `https://${cfg.deploy_domain}` : '';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="color:${m.color};font-size:14px;">${m.icon}</span>
        <span style="color:${m.color};font-weight:500;font-size:12.5px;">${m.label}</span>
        ${url ? `<a href="${url}" target="_blank" style="margin-left:auto;font-size:11px;color:var(--text-secondary);text-decoration:none;">→ ${escape(cfg.deploy_domain)}</a>` : ''}
      </div>
    `;
  }

  async function saveConfig() {
    const btn = document.getElementById('wdw-save');
    btn.disabled = true; const orig = btn.innerHTML; btn.textContent = 'Saving…';
    let response = null;
    try {
      const body = {
        vps_host:        document.getElementById('wdw-vps-host').value.trim(),
        vps_ssh_port:    document.getElementById('wdw-vps-port').value.trim() || '22',
        vps_ssh_user:    document.getElementById('wdw-vps-user').value.trim() || 'root',
        deploy_domain:   document.getElementById('wdw-domain').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
        antibot_enabled: !!document.getElementById('wdw-antibot')?.checked,
      };
      const pass = document.getElementById('wdw-vps-pass').value.trim();
      if (pass) body.vps_ssh_pass = pass;
      response = await window.ALPApi._request('PUT', `/api/website-deploy/${currentWebsite.id}/config`, body);
      window.showToast('Config saved', 'success');
      // Show any warnings from server (e.g. "Domain cleaned to xxx")
      (response.warnings || []).forEach(w => window.showToast(w, 'info'));
      // If Cloudflare returned nameservers → show them immediately (before setup)
      if (response.cloudflare && response.cloudflare.nameservers && response.cloudflare.needs_ns_update) {
        showNameservers(body.deploy_domain, response.cloudflare.nameservers, /*preSetup=*/true);
      }
      await loadConfig();
    } catch (e) {
      window.showToast('Failed: ' + e.message, 'error');
    }
    btn.disabled = false; btn.innerHTML = orig;
    return response;
  }

  // ── Setup / Deploy runner + SSE ───────────────────────────────────────────

  async function runSetup(quick) {
    // Save first
    await saveConfig();
    const endpoint = quick ? 'deploy' : 'setup';
    const label    = quick ? 'Redeploying' : 'Setting up server';
    try {
      const r = await window.ALPApi._request('POST', `/api/website-deploy/${currentWebsite.id}/${endpoint}`);
      currentDeployId = r.deployId;
      openTerminal(label);
      startSSE(r.deployId);
    } catch (e) {
      window.showToast('Failed to start: ' + e.message, 'error');
    }
  }

  function openTerminal(title) {
    const wrap = document.getElementById('wdw-terminal-wrap');
    if (wrap) wrap.style.display = 'block';
    document.getElementById('wdw-term-title').textContent = title;
    document.getElementById('wdw-term-status').style.background = '#febc2e';
    document.getElementById('wdw-steps').innerHTML = '';
    document.getElementById('wdw-log').innerHTML = '';
    document.getElementById('wdw-summary').style.display = 'none';
    stepMap = {};
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderStep(id, label, status) {
    let row = stepMap[id];
    if (!row) {
      row = document.createElement('div');
      row.className = 'deploy-step running';
      row.innerHTML = `<span class="step-icon spinning">◐</span><span>${escape(label || '')}</span>`;
      document.getElementById('wdw-steps').appendChild(row);
      stepMap[id] = row;
      return;
    }
    row.className = 'deploy-step ' + status;
    const icon = row.querySelector('.step-icon');
    if (status === 'done')    { icon.className = 'step-icon'; icon.textContent = '✓'; }
    else if (status === 'error')   { icon.className = 'step-icon'; icon.textContent = '✗'; }
    else if (status === 'warning') { icon.className = 'step-icon'; icon.textContent = '!'; }
  }

  function appendLog(line, level) {
    const log = document.getElementById('wdw-log');
    const color = level === 'error' ? '#f87171' : level === 'success' ? '#34d399' : level === 'warn' || level === 'warning' ? '#fbbf24' : 'rgba(255,255,255,0.7)';
    const div = document.createElement('div');
    div.style.color = color;
    div.textContent = line;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function finishRun(evt) {
    document.getElementById('wdw-term-status').style.background = evt.success ? '#28c840' : '#ff5f57';
    document.getElementById('wdw-term-status').style.animation = 'none';
    document.getElementById('wdw-term-title').textContent = evt.success ? `Done in ${evt.duration}s` : 'Deploy failed';
    const sum = document.getElementById('wdw-summary');
    sum.style.display = 'block';
    sum.innerHTML = evt.success
      ? `<span style="color:#34d399;">✓ Deployed successfully in ${evt.duration}s</span>${evt.domain ? ` · <a href="https://${evt.domain}" target="_blank" style="color:#5eead4;">https://${evt.domain}</a>` : ''}`
      : `<span style="color:#f87171;">✗ ${escape(evt.error || 'Deployment failed — check logs above')}</span>`;
    if (evt.success && evt.nameservers) {
      const ns = evt.nameservers.split(',').map(s => s.trim());
      showNameservers(currentWebsite.deploy_domain || document.getElementById('wdw-domain').value.trim(), ns);
    }
    if (evt.success) {
      loadConfig(); // refresh status pill + show Quick Redeploy
    }
  }

  function showNameservers(domain, ns, preSetup) {
    const box = document.getElementById('wdw-ns-box');
    if (!box) return;
    document.getElementById('wdw-ns-domain').textContent = domain;
    document.getElementById('wdw-ns-list').innerHTML = ns.map(n => `→ ${escape(n)}`).join('<br>');
    document.getElementById('wdw-ns-url').innerHTML = `<a href="https://${domain}" target="_blank" style="color:#5eead4;">https://${escape(domain)}</a>`;
    box.style.display = 'block';
    // Add a strong pre-setup warning if the zone isn't active yet
    let notice = document.getElementById('wdw-ns-prewarn');
    if (preSetup) {
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'wdw-ns-prewarn';
        notice.style.cssText = 'margin-top:10px;padding:10px 12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:11px;color:#fca5a5;';
        box.appendChild(notice);
      }
      notice.innerHTML = `<strong style="color:#f87171;">⚠ Do this BEFORE clicking Setup:</strong><br>
        Update those 2 nameservers at your registrar (Namecheap → Domain List → <strong>${escape(domain)}</strong> → Nameservers → Custom DNS) and save.
        Then wait ~5–15 min. If you click Setup before the domain is active on Cloudflare, SSL cert will be skipped and site will run HTTP-only until you re-run Setup.`;
    } else if (notice) {
      notice.remove();
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function startSSE(deployId) {
    const token = localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token') || '';
    if (!token) {
      appendLog('✗ No auth token found in browser storage — reload page and try again', 'error');
      finishRun({ success: false, error: 'No auth token' });
      return;
    }
    const url = `/api/deploy/stream?id=${encodeURIComponent(deployId)}&token=${encodeURIComponent(token)}`;
    appendLog(`Opening live stream (deploy id: ${deployId})...`, 'info');
    let opened = false;
    let receivedAny = false;
    const es = new EventSource(url);

    es.addEventListener('open', () => {
      opened = true;
      appendLog('✓ Stream connected — waiting for events...', 'success');
    });

    es.onmessage = (e) => {
      receivedAny = true;
      try {
        const evt = JSON.parse(e.data);
        if      (evt.type === 'step')  renderStep(evt.id, evt.label, evt.status);
        else if (evt.type === 'log')   appendLog(evt.line, evt.level);
        else if (evt.type === 'done')  { finishRun(evt); es.close(); }
        else if (evt.type === 'error') { appendLog(evt.message, 'error'); es.close(); }
        else appendLog('[unknown event] ' + JSON.stringify(evt), 'warn');
      } catch (err) {
        appendLog('Parse error on event: ' + err.message, 'error');
      }
    };

    es.onerror = (e) => {
      if (!opened) {
        appendLog('✗ Stream failed to connect — likely 401 unauthorized. Check browser DevTools → Network tab.', 'error');
      } else if (!receivedAny) {
        appendLog('✗ Stream disconnected before any events arrived — deploy id may be invalid.', 'error');
      } else {
        appendLog('Stream closed by server', 'info');
      }
      es.close();
    };

    // Fallback timeout — if nothing arrives in 15s, warn admin
    setTimeout(() => {
      if (!receivedAny) {
        appendLog('⚠ No events in 15s. Possible causes: server needs restart, session lost, or SSE blocked by proxy/network.', 'warn');
      }
    }, 15000);
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  function escape(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { open, close };
})();
