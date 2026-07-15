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
            <div class="login-logo-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="10" fill="url(#loginGrad)"/>
                <path d="M12 28V12l8 8 8-8v16" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="loginGrad" x1="0" y1="0" x2="40" y2="40">
                    <stop stop-color="#6366f1"/>
                    <stop offset="1" stop-color="#8b5cf6"/>
                  </linearGradient>
                </defs>
              </svg>
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
          </div>
        </div>
      </div>

      <style>
        .login-wrapper {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #0f0f1a 0%, #1a1035 30%, #1e1442 70%, #12121f 100%);
          overflow: hidden; font-family: 'Inter', sans-serif;
        }
        .login-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(99, 102, 241, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.025) 1px, transparent 1px);
          background-size: 50px 50px;
          opacity: 0.6;
        }
        .login-wrapper::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.12), transparent 60%);
        }
        .login-bg-shapes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; opacity: 0.6; }
        .login-shape {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.08));
          filter: blur(60px);
        }
        .login-shape-1 { width: 500px; height: 500px; top: -150px; right: -100px; animation: floatShape 25s ease-in-out infinite; }
        .login-shape-2 { width: 400px; height: 400px; bottom: -100px; left: -100px; animation: floatShape 20s ease-in-out infinite reverse; }
        .login-shape-3 { width: 250px; height: 250px; top: 40%; left: 30%; background: radial-gradient(circle, rgba(0, 255, 136, 0.08), transparent); animation: floatShape 18s ease-in-out infinite 3s; }
        @keyframes floatShape {
          0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
          33% { transform: translate(40px, -30px) scale(1.1) rotate(120deg); }
          66% { transform: translate(-30px, 20px) scale(0.9) rotate(240deg); }
        }

        .login-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 440px;
          background: rgba(22, 22, 42, 0.80);
          backdrop-filter: blur(32px) saturate(1.3);
          -webkit-backdrop-filter: blur(32px) saturate(1.3);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: 24px; padding: 56px 48px;
          box-shadow: 
            0 30px 80px rgba(0, 0, 0, 0.5), 
            0 0 100px rgba(99, 102, 241, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          animation: cardEntry 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .login-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 24px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.2), transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        @keyframes cardEntry {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .login-logo { text-align: center; margin-bottom: 32px; }
        .login-logo-icon { display: inline-block; margin-bottom: 16px; animation: cardEntry 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
        .login-title {
          font-size: 24px; font-weight: 700; margin: 0 0 6px;
          background: linear-gradient(135deg, #a5b4fc, #818cf8, #6366f1);
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
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px; transition: all 0.2s;
        }
        .login-input-wrap:focus-within {
          border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
          background: rgba(99, 102, 241, 0.04);
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
          background: linear-gradient(135deg, #6366f1, #7c3aed, #8b5cf6);
          color: #fff; border: none; border-radius: 12px;
          font-size: 15px; font-weight: 600; cursor: pointer;
          font-family: 'Inter', sans-serif;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          position: relative;
          box-shadow: 
            0 6px 20px rgba(99, 102, 241, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
        .login-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: radial-gradient(circle at center, rgba(255,255,255,0.15), transparent 70%);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .login-btn:hover::before {
          opacity: 1;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 
            0 10px 30px rgba(99, 102, 241, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
          filter: brightness(1.15);
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
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
