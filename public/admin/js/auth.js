/**
 * ALP Auth State Manager
 * Handles JWT storage, decoding, role checking, and logout.
 *
 * Storage strategy:
 *  - rememberMe = true  → localStorage  (persists across browser restarts, 30-day token)
 *  - rememberMe = false → sessionStorage (cleared when tab/browser closes, 24h token)
 */
const ALPAuth = (() => {
  const TOKEN_KEY = 'alp_token';
  const REMEMBER_KEY = 'alp_remember';

  /** Pick the correct storage based on whether the user chose "remember me". */
  function _storage() {
    // If we already have a localStorage token (legacy or remembered), use that.
    if (localStorage.getItem(TOKEN_KEY)) return localStorage;
    // If there's a session token, use sessionStorage.
    if (sessionStorage.getItem(TOKEN_KEY)) return sessionStorage;
    // Default: check the remembered preference for reads before first login.
    return localStorage.getItem(REMEMBER_KEY) === '1' ? localStorage : sessionStorage;
  }

  /**
   * Store the JWT token.
   * @param {string} token  - JWT string
   * @param {boolean} remember - true = localStorage (persists), false = sessionStorage (session-only)
   */
  function setToken(token, remember = false) {
    // Clear from both storages first to avoid stale tokens
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);

    if (remember) {
      localStorage.setItem(REMEMBER_KEY, '1');
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.setItem(TOKEN_KEY, token);
    }
  }

  /**
   * Retrieve the stored JWT token (checks both storages).
   */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  }

  /**
   * Remove the stored JWT token from all storages.
   */
  function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  /**
   * Decode the JWT payload (without verification — that's the server's job).
   * Returns null if token is missing or malformed.
   */
  function _decodePayload(token) {
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = parts[1];
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * Get the decoded user object from the JWT.
   * Returns { userId, username, role, iat, exp } or null.
   */
  function getUser() {
    return _decodePayload(getToken());
  }

  /**
   * Check if the token exists and is not expired.
   */
  function isAuthenticated() {
    const user = getUser();
    if (!user) return false;
    if (user.exp) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec >= user.exp) {
        removeToken();
        return false;
      }
    }
    return true;
  }

  /** Check if the current user has admin or super_admin role. */
  function isAdmin() {
    const user = getUser();
    if (!user) return false;
    return user.role === 'admin' || user.role === 'super_admin';
  }

  /** Check if the current user has super_admin role. */
  function isSuperAdmin() {
    const user = getUser();
    if (!user) return false;
    return user.role === 'super_admin';
  }

  /** Log out: clear tokens, disconnect socket, navigate to login. */
  function logout() {
    removeToken();
    if (window.ALPSocket) {
      window.ALPSocket.disconnect();
    }
    window.location.hash = '#/login';
  }

  return {
    setToken,
    getToken,
    removeToken,
    getUser,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    logout
  };
})();

// Export globally
window.ALPAuth = ALPAuth;
