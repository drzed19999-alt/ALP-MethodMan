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

          <form id="login-form" class="login-form" autocomplete="on">
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
          overflow: hidden; font-family: 'Inter', sans-serif;
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
          width: 100%; max-width: 440px;
          background: #141414;
          border: 1px solid rgba(212, 175, 55, 0.25);
          border-radius: 16px; padding: 56px 48px;
          box-shadow: 
            0 30px 80px rgba(0, 0, 0, 0.7), 
            0 0 40px rgba(212, 175, 55, 0.06);
          animation: cardEntry 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
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

        .login-logo { text-align: center; margin-bottom: 32px; }
        .login-logo-icon { display: inline-block; margin-bottom: 16px; animation: cardEntry 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
        .login-title {
          font-size: 24px; font-weight: 700; margin: 0 0 6px;
          background: linear-gradient(135deg, #F0D375, #D4AF37, #B8962E);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .login-subtitle { color: var(--text-secondary); font-size: 14px; margin: 0; }

        .login-error {
          display: flex; align-items: center; gap: 8px; padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px; color: #fca5a5; font-size: 13px; margin-bottom: 20px;
          animation: shakeX 0.4s ease;
        }
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }

        .login-field { margin-bottom: 20px; }
        .login-field label { display: block; font-size: 13px; font-weight: 500; color: #9ca3af; margin-bottom: 8px; }
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
        .login-input-icon { position: absolute; left: 14px; color: var(--text-muted); flex-shrink: 0; pointer-events: none; }
        .login-input-wrap input {
          flex: 1; background: none; border: none; outline: none;
          padding: 12px 14px 12px 42px; color: #e5e7eb; font-size: 14px;
          font-family: 'Inter', sans-serif; width: 100%;
        }
        .login-input-wrap input::placeholder { color: var(--text-placeholder); }

        .login-eye-btn {
          background: none; border: none; cursor: pointer; padding: 8px 12px;
          color: var(--text-muted); display: flex; align-items: center;
          transition: color 0.2s;
        }
        .login-eye-btn:hover { color: #9ca3af; }

        .login-btn {
          width: 100%; padding: 14px 24px; margin-top: 12px;
          background: linear-gradient(135deg, #D4AF37, #B8962E);
          color: #0a0a0a; border: none; border-radius: 8px;
          font-size: 14px; font-weight: 700; cursor: pointer;
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
        .login-remember { margin-bottom: 20px; }
        .login-remember-label {
          display: flex; align-items: center; gap: 10px;
          cursor: pointer; color: #9ca3af; font-size: 13px; user-select: none;
        }
        .login-remember-label input[type="checkbox"] { display: none; }
        .login-remember-box {
          width: 18px; height: 18px; flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: 5px; background: rgba(255,255,255,0.04);
          position: relative; transition: all 0.2s;
        }
        .login-remember-label:hover .login-remember-box { border-color: #6366f1; }
        .login-remember-label input:checked + .login-remember-box {
          background: #6366f1; border-color: #6366f1;
        }
        .login-remember-label input:checked + .login-remember-box::after {
          content: ''; position: absolute;
          left: 5px; top: 2px;
          width: 5px; height: 9px;
          border: 2px solid #fff; border-top: none; border-left: none;
          transform: rotate(45deg);
        }

        .login-footer { text-align: center; margin-top: 28px; }
        .login-footer p { color: var(--text-placeholder); font-size: 12px; margin: 0; }
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

        // Brief delay for visual feedback
        setTimeout(() => {
          window.location.hash = '#/dashboard';
        }, 300);
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

  return { render, init };
})();

// Export for module usage
if (typeof window !== 'undefined') {
  window.LoginPage = LoginPage;
}
