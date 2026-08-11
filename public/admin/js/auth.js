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

  // Cache of fresh server-side data (permissions, avatar) fetched via /me.
  // Used to override the (potentially stale) JWT payload when god has changed
  // this user's permissions after they logged in.
  const SERVER_CACHE_KEY = 'alp_server_view';

  function _readServerCache() {
    try {
      const raw = sessionStorage.getItem(SERVER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _applyServerPermissions(userFromMe) {
    if (!userFromMe) return;
    try {
      sessionStorage.setItem(SERVER_CACHE_KEY, JSON.stringify({
        permissions: userFromMe.permissions || {},
        avatar_color: userFromMe.avatar_color || null,
        avatar_seed:  userFromMe.avatar_seed  || null,
        savedAt:     Date.now(),
      }));
    } catch { /* storage may be full */ }
  }

  /**
   * Get the decoded user object from the JWT, merged with any fresher
   * permissions server cache. Server data wins where present.
   */
  function getUser() {
    const jwtUser = _decodePayload(getToken());
    if (!jwtUser) return null;
    const server = _readServerCache();
    if (!server) return jwtUser;
    return {
      ...jwtUser,
      permissions: server.permissions ?? jwtUser.permissions,
      avatar_color: server.avatar_color || jwtUser.avatar_color || null,
      avatar_seed:  server.avatar_seed  || jwtUser.avatar_seed  || null,
    };
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
    return user.role === 'super_admin' || user.role === 'god';
  }

  /** Check if the current user has the god role. */
  function isGod() {
    const user = getUser();
    if (!user) return false;
    return user.role === 'god';
  }

  /**
   * Check if the current user has access to a specific page/feature.
   * God always has access. Other roles respect the permissions set by god.
   * Defaults to true when no explicit permission is set.
   */
  function canAccess(page) {
    const user = getUser();
    if (!user) return false;
    if (user.role === 'god') return true;
    const pages = (user.permissions && user.permissions.pages) || {};
    return pages[page] !== false;
  }

  /**
   * Check whether the current user is allowed to perform `action` on `page`.
   * God bypasses. Default (missing key) = allowed. Explicit `false` = denied.
   * Mirrors the server-side requireAction() middleware so the UI can hide or
   * disable buttons that the API would reject.
   */
  function canAct(page, action) {
    const user = getUser();
    if (!user) return false;
    if (user.role === 'god') return true;
    const perms = user.permissions || {};
    // A blocked page implicitly blocks every action on that page.
    const pages = perms.pages || {};
    if (pages[page] === false) return false;
    const actions = (perms.actions && perms.actions[page]) || {};
    return actions[action] !== false;
  }

  /**
   * Legacy shim. Ownership is now enforced server-side per resource; the client
   * no longer carries a pre-computed website id list. Kept as a soft-deprecated
   * function so callers that ask "which sites am I allowed to see?" get back
   * `null` (unrestricted) — the actual filtering happens when they call
   * getWebsites(), which returns exactly what the caller may see.
   */
  function getAssignedWebsiteIds() { return null; }

  /**
   * Client-side gate for showing a website's UI. Always defers to the server,
   * which enforces owner_id-based access and returns 403 on mismatch. Returning
   * true here means the UI won't hide the button, but a bad click still fails
   * safely on the API — no data leak.
   */
  function canAccessWebsite(_websiteId) { return true; }

  /** Log out: clear tokens, disconnect socket, navigate to login. */
  function logout() {
    removeToken();
    try { sessionStorage.removeItem(SERVER_CACHE_KEY); } catch {}
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
    isGod,
    canAccess,
    canAct,
    getAssignedWebsiteIds,
    canAccessWebsite,
    _applyServerPermissions,
    logout
  };
})();

// Export globally
window.ALPAuth = ALPAuth;
