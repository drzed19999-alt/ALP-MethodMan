/**
 * ALP - Login Page Module
 * Full-screen login with gradient background, centered card, animated load
 */
const LoginPage = (() => {

  function render() {
    return `
      <div class="login-wrapper">
        <div class="login-bg-shapes">
          <div class="login-shape login-shape-1"></div>
          <div class="login-shape login-shape-2"></div>
          <div class="login-shape login-shape-3"></div>
        </div>
        <div class="login-card" id="login-card">
          <div class="login-logo">
            <div class="login-logo-icon" style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #261f0a, #120f04); border: 1px solid #D4AF37; box-shadow: 0 0 20px rgba(212, 175, 55, 0.4), inset 0 0 10px rgba(212, 175, 55, 0.2); font-size: 28px; font-weight: 900; color: #D4AF37; text-shadow: 0 0 10px rgba(212, 175, 55, 0.9); display: inline-flex; align-items: center; justify-content: center;">
              $
            </div>
            <h1 class="login-title">Admin Live Panel</h1>
            <p class="login-subtitle">Sign in to your dashboard</p>
          </div>

          <!-- Admin Online Live Status Badge -->
          <div id="admin-status-box" class="admin-status-box">
            <div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
              <span class="spin-dot"></span> Checking live admin status...
            </div>
          </div>

          <form id="login-form" class="login-form" autocomplete="on">
            <!-- Persistent session-replaced warning (shown when kicked from another device) -->
            <div id="session-replaced-banner" class="session-replaced-banner" style="display:none;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <strong>Session ended</strong><br>
                <span>Your session was ended because you logged in from another device. Please sign in again. To get access on more than one device, <a href="https://t.me/itstheoutlaws" target="_blank" style="color: #38bdf8; text-decoration: underline; font-weight: 500;">contact admin</a>.</span>
              </div>
              <button type="button" id="dismiss-session-banner" aria-label="Dismiss" style="margin-left:auto;flex-shrink:0;background:none;border:none;cursor:pointer;color:inherit;opacity:0.6;padding:2px;line-height:1;">✕</button>
            </div>


            <div id="login-error" class="login-error" style="display:none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span id="login-error-msg"></span>
            </div>

            <div class="login-field">
              <label for="login-username">Username</label>
              <div class="login-input-wrap">
                <svg class="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <input type="text" id="login-username" name="username" placeholder="Enter your username" autocomplete="username" required />
              </div>
            </div>

            <div class="login-field">
              <label for="login-password">Password</label>
              <div class="login-input-wrap">
                <svg class="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <input type="password" id="login-password" name="password" placeholder="Enter your password" autocomplete="current-password" required />
                <button type="button" class="login-eye-btn" id="login-toggle-pw" tabindex="-1" aria-label="Toggle password visibility">
                  <svg id="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg id="eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="login-remember">
              <label class="login-remember-label" for="login-remember">
                <input type="checkbox" id="login-remember" name="remember" />
                <span class="login-remember-box"></span>
                <span>Remember me for 30 days</span>
              </label>
            </div>

            <button type="submit" class="login-btn" id="login-btn">
              <span class="login-btn-text">Sign In</span>
              <span class="login-btn-loader" style="display:none;">
                <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
                </svg>
                Signing in…
              </span>
            </button>
          </form>

          <div class="login-footer">
            <p>ALP &copy; ${new Date().getFullYear()}</p>
            <a href="https://t.me/itstheoutlaws" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:#38bdf8;font-size:11px;margin-top:6px;opacity:0.75;transition:opacity 0.2s;"
               onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.93 7.17-1.7 8.02c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.52.26l.18-2.65 4.74-4.28c.21-.18-.04-.28-.32-.1L7.9 14.38l-2.55-.8c-.55-.17-.56-.55.12-.82l9.95-3.84c.46-.17.86.1.51.75z" fill="#0088cc"/>
              </svg>
              @itstheoutlaws
            </a>
          </div>
        </div>
      </div>

      <style>
        .login-wrapper {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #080808 0%, #121212 50%, #080808 100%);
          overflow-y: auto; padding: 24px 16px; font-family: 'Inter', sans-serif;
        }
        .login-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
          background-size: 50px 50px;
          opacity: 0.6;
        }
        .login-wrapper::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55, 0.08), transparent 60%);
        }
        .login-bg-shapes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; opacity: 0.6; }
        .login-shape {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle, rgba(212, 175, 55, 0.08), transparent);
          filter: blur(60px);
        }
        .login-shape-1 { width: 500px; height: 500px; top: -150px; right: -100px; animation: floatShape 25s ease-in-out infinite; }
        .login-shape-2 { width: 400px; height: 400px; bottom: -100px; left: -100px; animation: floatShape 20s ease-in-out infinite reverse; }
        .login-shape-3 { width: 250px; height: 250px; top: 40%; left: 30%; background: radial-gradient(circle, rgba(212, 175, 55, 0.04), transparent); animation: floatShape 18s ease-in-out infinite 3s; }
        @keyframes floatShape {
          0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
          33% { transform: translate(40px, -30px) scale(1.1) rotate(120deg); }
          66% { transform: translate(-30px, 20px) scale(0.9) rotate(240deg); }
        }

        .login-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 410px;
          background: #141414;
          border: 1px solid rgba(212, 175, 55, 0.25);
          border-radius: 16px; padding: 28px 32px;
          box-shadow: 
            0 30px 80px rgba(0, 0, 0, 0.7), 
            0 0 40px rgba(212, 175, 55, 0.06);
          animation: cardEntry 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          max-height: 94vh; overflow-y: auto;
        }
        .login-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 16px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.3), rgba(212, 175, 55, 0.1), transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        @keyframes cardEntry {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .login-logo { text-align: center; margin-bottom: 20px; }
        .login-logo-icon { display: inline-block; margin-bottom: 10px; animation: cardEntry 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
        .login-title {
          font-size: 20px; font-weight: 700; margin: 0 0 4px;
          background: linear-gradient(135deg, #F0D375, #D4AF37, #B8962E);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .login-subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }

        .login-error {
          display: flex; align-items: center; gap: 8px; padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px; color: #fca5a5; font-size: 12px; margin-bottom: 14px;
          animation: shakeX 0.4s ease;
        }
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }

        /* ── Persistent session-replaced banner ── */
        .session-replaced-banner {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 14px;
          background: rgba(217, 119, 6, 0.12);
          border: 1px solid rgba(217, 119, 6, 0.4);
          border-left: 4px solid #d97706;
          border-radius: 10px;
          color: #fcd34d;
          font-size: 12px;
          line-height: 1.45;
          margin-bottom: 14px;
          animation: bannerSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .session-replaced-banner strong { color: #fbbf24; font-weight: 700; }
        @keyframes bannerSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Admin status badge styles ── */
        .admin-status-box {
          margin-bottom: 16px;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.4;
          transition: all 0.3s ease;
          animation: bannerSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .admin-status-online {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: #34d399;
        }
        .admin-status-offline {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #9ca3af;
        }
        .admin-status-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }
        .admin-status-dot-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        .admin-status-online .admin-status-dot-pulse {
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
          animation: pulseDot 2s infinite;
        }
        .admin-status-offline .admin-status-dot-pulse {
          background: #6b7280;
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        .spin-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border: 2px solid rgba(212, 175, 55, 0.3);
          border-top-color: #D4AF37;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          vertical-align: middle;
        }

        .login-field { margin-bottom: 14px; }
        .login-field label { display: block; font-size: 12px; font-weight: 500; color: #9ca3af; margin-bottom: 6px; }
        .login-input-wrap {
          position: relative; display: flex; align-items: center;
          background: #1a1a1a;
          border: 1px solid var(--border-primary);
          border-radius: 8px; transition: all 0.2s;
        }
        .login-input-wrap:focus-within {
          border-color: rgba(212, 175, 55, 0.5); box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
          background: #1c1c1c;
        }
        .login-input-icon { position: absolute; left: 12px; color: var(--text-muted); flex-shrink: 0; pointer-events: none; }
        .login-input-wrap input {
          flex: 1; background: none; border: none; outline: none;
          padding: 10px 12px 10px 38px; color: #e5e7eb; font-size: 13px;
          font-family: 'Inter', sans-serif; width: 100%;
        }
        .login-input-wrap input::placeholder { color: var(--text-placeholder); }

        .login-eye-btn {
          background: none; border: none; cursor: pointer; padding: 6px 10px;
          color: var(--text-muted); display: flex; align-items: center;
          transition: color 0.2s;
        }
        .login-eye-btn:hover { color: #9ca3af; }

        .login-btn {
          width: 100%; padding: 11px 20px; margin-top: 8px;
          background: linear-gradient(135deg, #D4AF37, #B8962E);
          color: #0a0a0a; border: none; border-radius: 8px;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.2s; box-shadow: 0 4px 16px rgba(212, 175, 55, 0.2);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .login-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #E8C547, #D4AF37);
          box-shadow: 0 6px 20px rgba(212, 175, 55, 0.3);
          transform: translateY(-1px);
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .login-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .login-btn-loader { display: flex; align-items: center; gap: 8px; }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Remember me */
        .login-remember { margin-bottom: 14px; }
        .login-remember-label {
          display: flex; align-items: center; gap: 8px;
          cursor: pointer; color: #9ca3af; font-size: 12px; user-select: none;
        }
        .login-remember-label input[type="checkbox"] { display: none; }
        .login-remember-box {
          width: 16px; height: 16px; flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: 4px; background: rgba(255,255,255,0.04);
          position: relative; transition: all 0.2s;
        }
        .login-remember-label:hover .login-remember-box { border-color: #6366f1; }
        .login-remember-label input:checked + .login-remember-box {
          background: #6366f1; border-color: #6366f1;
        }
        .login-remember-label input:checked + .login-remember-box::after {
          content: ''; position: absolute;
          left: 4px; top: 1px;
          width: 4px; height: 8px;
          border: 2px solid #fff; border-top: none; border-left: none;
          transform: rotate(45deg);
        }

        .login-footer { text-align: center; margin-top: 18px; }
        .login-footer p { color: var(--text-placeholder); font-size: 11px; margin: 0; }
      </style>

    `;
  }

  function init() {
    const form = document.getElementById('login-form');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const btnText = loginBtn.querySelector('.login-btn-text');
    const btnLoader = loginBtn.querySelector('.login-btn-loader');
    const errorBox = document.getElementById('login-error');
    const errorMsg = document.getElementById('login-error-msg');
    const togglePw = document.getElementById('login-toggle-pw');
    const eyeOpen = document.getElementById('eye-open');
    const eyeClosed = document.getElementById('eye-closed');
    const rememberCheckbox = document.getElementById('login-remember');

    // Show persistent session-replaced banner if user was kicked from another device
    const sessionReplaced = sessionStorage.getItem('alp_session_replaced');
    const banner = document.getElementById('session-replaced-banner');
    if (sessionReplaced && banner) {
      banner.style.display = 'flex';
      sessionStorage.removeItem('alp_session_replaced');
      const dismissBtn = document.getElementById('dismiss-session-banner');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          banner.style.animation = 'none';
          banner.style.opacity = '0';
          banner.style.transition = 'opacity 0.3s';
          setTimeout(() => { banner.style.display = 'none'; }, 300);
        });
      }
    }
    // Fetch and display live admin status
    const statusBox = document.getElementById('admin-status-box');
    if (statusBox && window.ALPApi && typeof window.ALPApi.getAdminStatus === 'function') {
      window.ALPApi.getAdminStatus().then(res => {
        if (res && res.online) {
          statusBox.className = 'admin-status-box admin-status-online';
          const userStr = res.lastLoginUser ? ` (${res.lastLoginUser})` : '';
          statusBox.innerHTML = `
            <div class="admin-status-header">
              <span class="admin-status-dot-pulse"></span>
              <span><strong>Admin Online</strong> — Active session in progress${userStr}</span>
            </div>
            <div style="font-size: 11px; opacity: 0.85; margin-top: 3px;">
              ⚡ Logging in will claim and switch the active panel session to this device.
            </div>
          `;
        } else {
          statusBox.className = 'admin-status-box admin-status-offline';
          statusBox.innerHTML = `
            <div class="admin-status-header">
              <span class="admin-status-dot-pulse"></span>
              <span>No Admin currently logged in</span>
            </div>
          `;
        }
      }).catch(err => {
        statusBox.style.display = 'none';
      });
    }

    // Password visibility toggle
    togglePw.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeOpen.style.display = isPassword ? 'none' : 'block';
      eyeClosed.style.display = isPassword ? 'block' : 'none';
    });

    // Show error
    function showError(msg) {
      errorMsg.textContent = msg;
      errorBox.style.display = 'flex';
      errorBox.style.animation = 'none';
      // Force reflow to restart animation
      void errorBox.offsetWidth;
      errorBox.style.animation = 'shakeX 0.4s ease';
    }

    function hideError() {
      errorBox.style.display = 'none';
    }

    function setLoading(loading) {
      loginBtn.disabled = loading;
      btnText.style.display = loading ? 'none' : 'inline';
      btnLoader.style.display = loading ? 'flex' : 'none';
    }

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const rememberMe = rememberCheckbox && rememberCheckbox.checked;

      if (!username || !password) {
        showError('Please enter both username and password.');
        return;
      }

      setLoading(true);

      try {
        const resp = await window.ALPApi.login(username, password, rememberMe);

        if (resp.error) {
          showError(resp.error);
          setLoading(false);
          return;
        }

        // Store auth data (remember=true → localStorage 30d, false → sessionStorage 24h)
        window.ALPAuth.setToken(resp.token, rememberMe);

        // Connect socket
        if (window.ALPSocket && typeof window.ALPSocket.connect === 'function') {
          window.ALPSocket.connect(resp.token);
        }

        // Hide login form, launch cinematic intro
        const card = document.getElementById('login-card');
        if (card) card.style.display = 'none';
        _playIntro();
      } catch (err) {
        showError(err.message || 'Login failed. Please try again.');
        setLoading(false);
      }
    });

    // Focus username input on load
    setTimeout(() => {
      usernameInput && usernameInput.focus();
    }, 600);
  }

  /* ── Cinematic login intro ──────────────────────────────────── */
  function _playIntro() {
    const user = window.ALPAuth && window.ALPAuth.getUser();
    const name = user ? user.username : 'Operator';
    const role = user ? user.role : 'admin';

    const ROLE_LABELS = { god: 'GOD ADMIN', super_admin: 'SUPER ADMIN', admin: 'ADMIN', viewer: 'VIEWER' };
    const roleLabel = ROLE_LABELS[role] || role.toUpperCase();

    const overlay = document.createElement('div');
    overlay.id = 'alp-intro';
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = `
      <style>
        #alp-intro {
          position: fixed; inset: 0; z-index: 2147483646;
          background: #0a0804;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          overflow: hidden;
          font-family: inherit;
        }
        .intro-scanline {
          position: absolute; inset: 0;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(212,175,55,0.015) 2px, rgba(212,175,55,0.015) 4px
          );
          pointer-events: none; z-index: 1;
          animation: introScanMove 8s linear infinite;
        }
        @keyframes introScanMove {
          to { background-position-y: 100px; }
        }
        .intro-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%);
          pointer-events: none; z-index: 1;
        }
        .intro-content { position: relative; z-index: 2; text-align: center; }

        .intro-logo {
          width: 72px; height: 72px;
          border-radius: 18px;
          background: linear-gradient(135deg, #1a1508, #0d0b04);
          border: 2px solid #D4AF37;
          display: flex; align-items: center; justify-content: center;
          font-size: 42px; font-weight: 900; color: #D4AF37;
          margin: 0 auto 28px;
          box-shadow: 0 0 0 0 rgba(212,175,55,0), 0 0 40px rgba(212,175,55,0.3);
          opacity: 0;
          animation: introLogoPulse 600ms 200ms ease-out forwards;
        }
        @keyframes introLogoPulse {
          0%   { opacity: 0; transform: scale(0.5); box-shadow: 0 0 0 0 rgba(212,175,55,0.6), 0 0 0 rgba(212,175,55,0); }
          50%  { opacity: 1; transform: scale(1.08); box-shadow: 0 0 0 16px rgba(212,175,55,0), 0 0 60px rgba(212,175,55,0.5); }
          100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(212,175,55,0), 0 0 40px rgba(212,175,55,0.3); }
        }

        .intro-line {
          width: 0; height: 1px; margin: 0 auto 24px;
          background: linear-gradient(90deg, transparent, #D4AF37, transparent);
          animation: introLineGrow 500ms 500ms ease-out forwards;
        }
        @keyframes introLineGrow { to { width: 180px; } }

        .intro-greeting {
          font-size: 13px; letter-spacing: 0.25em; text-transform: uppercase;
          color: rgba(212,175,55,0.5); margin-bottom: 8px;
          opacity: 0;
          animation: introFadeUp 400ms 650ms ease-out forwards;
        }
        .intro-name {
          font-size: 32px; font-weight: 800; letter-spacing: 0.04em;
          background: linear-gradient(90deg, #D4AF37, #f5d76e, #D4AF37);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          opacity: 0; margin-bottom: 16px;
          animation: introFadeUp 500ms 800ms ease-out forwards, introNameShimmer 2s 1.3s ease-in-out infinite;
        }
        @keyframes introNameShimmer {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }

        .intro-role {
          display: inline-block;
          padding: 5px 18px; border-radius: 20px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.18em;
          color: #D4AF37;
          border: 1px solid rgba(212,175,55,0.4);
          background: rgba(212,175,55,0.08);
          box-shadow: 0 0 20px rgba(212,175,55,0.1);
          opacity: 0;
          animation: introFadeUp 400ms 1050ms ease-out forwards;
        }

        .intro-status {
          margin-top: 32px; font-size: 11px;
          color: rgba(212,175,55,0.35); letter-spacing: 0.12em;
          opacity: 0;
          animation: introFadeUp 300ms 1300ms ease-out forwards;
        }
        .intro-status-dot {
          display: inline-block; width: 6px; height: 6px;
          background: #22c55e; border-radius: 50%;
          margin-right: 6px; vertical-align: middle;
          box-shadow: 0 0 8px rgba(34,197,94,0.5);
          animation: introDotPulse 1.2s 1.3s ease-in-out infinite;
        }
        @keyframes introDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        @keyframes introFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .intro-particles {
          position: absolute; inset: 0; z-index: 0; overflow: hidden;
        }
        .intro-particle {
          position: absolute; border-radius: 50%;
          background: #D4AF37;
          opacity: 0;
          animation: introFloat 3s ease-in-out infinite;
        }
        @keyframes introFloat {
          0%   { opacity: 0; transform: translateY(0) scale(0); }
          20%  { opacity: 0.6; transform: translateY(-20px) scale(1); }
          100% { opacity: 0; transform: translateY(-120px) scale(0.3); }
        }

        #alp-intro.intro-exit {
          animation: introExit 600ms ease-in forwards;
        }
        @keyframes introExit {
          0%   { opacity: 1; }
          60%  { opacity: 1; transform: scale(1.02); }
          100% { opacity: 0; transform: scale(1.05); }
        }
      </style>

      <div class="intro-particles" id="intro-particles"></div>
      <div class="intro-scanline"></div>
      <div class="intro-vignette"></div>

      <div class="intro-content">
        <div class="intro-logo">$</div>
        <div class="intro-line"></div>
        <div class="intro-greeting">Welcome back</div>
        <div class="intro-name">${_escHtml(name)}</div>
        <div class="intro-role">${roleLabel}</div>
        <div class="intro-status">
          <span class="intro-status-dot"></span>INITIALIZING SESSION
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Spawn floating gold particles
    const pContainer = document.getElementById('intro-particles');
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'intro-particle';
      const sz = 2 + Math.random() * 4;
      p.style.width = sz + 'px';
      p.style.height = sz + 'px';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = (40 + Math.random() * 50) + '%';
      p.style.animationDelay = (Math.random() * 2.5) + 's';
      p.style.animationDuration = (2 + Math.random() * 2) + 's';
      pContainer.appendChild(p);
    }

    // Exit and navigate
    setTimeout(() => {
      overlay.classList.add('intro-exit');
      setTimeout(() => {
        overlay.remove();
        window.location.hash = '#/dashboard';
      }, 550);
    }, 2300);
  }

  function _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return { render, init };
})();

// Export for module usage
if (typeof window !== 'undefined') {
  window.LoginPage = LoginPage;
}
