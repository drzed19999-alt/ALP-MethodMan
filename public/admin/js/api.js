/**
 * ALP API Client
 * Centralized HTTP client for all admin panel API interactions.
 */
class ALPApi {
  constructor() {
    this.baseUrl = window.location.origin;
  }

  // ─── Core Request Method ───────────────────────────────────────────

  async _request(method, path, body = null, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Attach JWT if available (check both storages — sessionStorage when not remembered)
    const token = localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
      method,
      headers,
      credentials: 'include'
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Handle non-JSON responses (e.g. 204 No Content)
      if (response.status === 204) {
        return { success: true };
      }

      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        // Ignore parsing errors for non-JSON responses
      }

      // Handle 401 Unauthorized or 403 Invalid/expired token
      const isTokenError = response.status === 401 ||
        (response.status === 403 && data?.error && data.error.toLowerCase().includes('token'));

      if (isTokenError) {
        // Detect single-session replacement vs. normal expiry
        const isSessionReplaced = data?.code === 'SESSION_REPLACED';

        if (isSessionReplaced) {
          // Write flag for login page to show a persistent banner
          sessionStorage.setItem('alp_session_replaced', '1');
        }

        if (window.ALPAuth) {
          window.ALPAuth.logout();
        } else {
          localStorage.removeItem('alp_token');
          sessionStorage.removeItem('alp_token');
          if (window.location.hash !== '#/login') {
            window.location.hash = '#/login';
          }
        }
        const logoutMessage = isSessionReplaced
          ? 'Your session was ended because you logged in from another device.'
          : (data && (data.error || data.message)) || 'Session expired. Please log in again.';
        throw new ApiError(logoutMessage, response.status, data);
      }

      if (!response.ok) {
        throw new ApiError(
          (data && (data.error || data.message)) || `Request failed with status ${response.status}`,
          response.status,
          data
        );
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      // Network or parsing error
      throw new ApiError(
        err.message || 'Network error. Please check your connection.',
        0
      );
    }
  }

  _get(path) {
    return this._request('GET', path);
  }

  _post(path, body) {
    return this._request('POST', path, body);
  }

  _put(path, body) {
    return this._request('PUT', path, body);
  }

  _patch(path, body) {
    return this._request('PATCH', path, body);
  }

  _delete(path, body) {
    return this._request('DELETE', path, body);
  }

  // ─── Auth ──────────────────────────────────────────────────────────

  login(username, password, rememberMe = false) {
    return this._post('/api/auth/login', { username, password, rememberMe });
  }

  register(username, email, password) {
    return this._post('/api/auth/register', { username, email, password });
  }

  getMe() {
    return this._get('/api/auth/me');
  }

  updateProfile(data) {
    return this._put('/api/auth/me', data);
  }

  // ─── Users ─────────────────────────────────────────────────────────

  getUsers() {
    return this._get('/api/users');
  }

  createUser(data) {
    return this._post('/api/auth/register', data);
  }

  updateUserRole(userId, role) {
    return this._put(`/api/users/${userId}/role`, { role });
  }

  updateUser(userId, data) {
    if (data && data.role) {
      return this.updateUserRole(userId, data.role);
    }
    return Promise.reject(new Error('Only role updates are supported for other users'));
  }

  deleteUser(userId) {
    return this._delete(`/api/users/${userId}`);
  }

  // ─── Sessions ──────────────────────────────────────────────────────

  getSessions(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/sessions${query}`);
  }

  getSession(sessionId) {
    return this._get(`/api/sessions/${sessionId}`);
  }

  redirectSession(sessionId, targetUrl) {
    return this._post(`/api/sessions/${sessionId}/redirect`, { target_url: targetUrl });
  }

  endSession(sessionId) {
    return this._post(`/api/sessions/${sessionId}/end`);
  }

  deleteSession(sessionId) {
    return this._delete(`/api/sessions/${sessionId}`);
  }

  advanceSession(sessionId) {
    return this._post(`/api/sessions/${sessionId}/advance`);
  }

  injectText(sessionId, text) {
    // Prefer real-time socket delivery; fall back to REST if socket unavailable
    if (window.ALPSocket && typeof window.ALPSocket.injectText === 'function') {
      window.ALPSocket.injectText(sessionId, text);
      return Promise.resolve({ success: true });
    }
    return this._post(`/api/sessions/${sessionId}/inject`, { text });
  }

  clearSessions() {
    return this._post('/api/sessions/clear');
  }

  getSessionStats() {
    return this._get('/api/sessions/stats');
  }

  // ─── Funnel Builder ───────────────────────────────────────────────

  getFunnel(websiteId) {
    return this._get(`/api/funnels?website_id=${websiteId}`);
  }

  saveFunnel(data) {
    return this._post('/api/funnels', data);
  }

  getDemoPages(websiteId = null) {
    const url = websiteId ? `/api/funnels/demo-pages?website_id=${websiteId}` : '/api/funnels/demo-pages';
    return this._get(url);
  }

  createDemoPage(data) {
    return this._post('/api/funnels/demo-pages', data);
  }

  updateDemoPage(id, data) {
    return this._put(`/api/funnels/demo-pages/${id}`, data);
  }

  deleteDemoPage(id) {
    return this._delete(`/api/funnels/demo-pages/${id}`);
  }

  // ─── Redirect Rules ───────────────────────────────────────────────

  getRedirects(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/redirects${query}`);
  }

  createRedirect(data) {
    return this._post('/api/redirects', data);
  }

  updateRedirect(redirectId, data) {
    return this._put(`/api/redirects/${redirectId}`, data);
  }

  deleteRedirect(redirectId) {
    return this._delete(`/api/redirects/${redirectId}`);
  }

  toggleRedirect(redirectId) {
    return this._put(`/api/redirects/${redirectId}/toggle`);
  }

  getRedirectRules(params = {}) { return this.getRedirects(params); }
  createRedirectRule(data) { return this.createRedirect(data); }
  updateRedirectRule(redirectId, data) { return this.updateRedirect(redirectId, data); }
  deleteRedirectRule(redirectId) { return this.deleteRedirect(redirectId); }

  // ─── Analytics ─────────────────────────────────────────────────────

  getDashboard(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/dashboard${query}`);
  }

  getAnalyticsOverview(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/overview${query}`);
  }

  getPageAnalytics(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/pages${query}`);
  }

  getReferrers(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/referrers${query}`);
  }

  getCountries(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/countries${query}`);
  }

  getDevices(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/devices${query}`);
  }

  getTimeline(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/analytics/timeline${query}`);
  }

  async getAnalytics(params = {}) {
    const [overview, pages, referrers, countries, devices, timeline] = await Promise.all([
      this.getAnalyticsOverview(params),
      this.getPageAnalytics(params),
      this.getReferrers(params),
      this.getCountries(params),
      this.getDevices(params),
      this.getTimeline(params)
    ]);

    return {
      stats: {
        visitors: overview.unique_visitors || 0,
        pageViews: overview.page_views_today || 0,
        avgDuration: (overview.avg_duration_seconds || 0) * 1000,
        bounceRate: overview.bounce_rate || 0
      },
      visitorsChart: timeline.timeline ? timeline.timeline.map(t => ({
        label: t.period.split(' ')[1] || t.period,
        count: t.sessions || 0
      })) : [],
      topPages: pages.pages || [],
      topReferrers: referrers.referrers ? referrers.referrers.map(r => ({
        referrer: r.referrer,
        count: r.sessions
      })) : [],
      browsers: devices.browsers || [],
      devices: devices.devices || [],
      countries: countries.countries ? countries.countries.map(c => ({
        country: c.country,
        count: c.sessions
      })) : []
    };
  }

  // ─── Notifications ────────────────────────────────────────────────

  getNotifications(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/notifications${query}`);
  }

  createNotification(data) {
    return this._post('/api/notifications', data);
  }

  markRead(notificationId) {
    return this._patch(`/api/notifications/${notificationId}/read`);
  }

  markAllRead() {
    return this._post('/api/notifications/read-all');
  }

  deleteNotification(notificationId) {
    return this._delete(`/api/notifications/${notificationId}`);
  }

  markNotificationRead(notificationId) { return this.markRead(notificationId); }
  markAllNotificationsRead() { return this.markAllRead(); }

  // ─── Audit Logs ───────────────────────────────────────────────────

  getLogs(params = {}) {
    const query = this._buildQuery(params);
    return this._get(`/api/logs${query}`);
  }

  getAuditLogs(params = {}) { return this.getLogs(params); }

  getLogCategories() {
    return this._get('/api/logs/categories');
  }

  clearLogs(params = {}) {
    return this._delete('/api/logs', params);
  }

  clearAllLogs() {
    return this._post('/api/logs/clear-all');
  }

  clearOldLogs(keepDays = 30) {
    return this._post('/api/logs/clear', { keep_days: keepDays });
  }

  // ─── Settings ──────────────────────────────────────────────────────

  getSettings() {
    return this._get('/api/settings');
  }

  updateSettings(settings) {
    return this._put('/api/settings', { settings });
  }

  resetSettings() {
    return this._post('/api/settings/reset');
  }

  getMaintenanceStatus() {
    return this._get('/api/settings/maintenance');
  }

  // ─── Websites ──────────────────────────────────────────────────────

  getWebsites() {
    return this._get('/api/websites');
  }

  createWebsite(data) {
    return this._post('/api/websites', data);
  }

  createWebsiteWithAI(data) {
    return this._post('/api/websites/ai-create', data);
  }

  updateWebsite(websiteId, data) {
    return this._put(`/api/websites/${websiteId}`, data);
  }

  deleteWebsite(websiteId) {
    return this._delete(`/api/websites/${websiteId}`);
  }

  regenerateApiKey(websiteId) {
    return this._post(`/api/websites/${websiteId}/regenerate-key`);
  }

  getDemoFiles(websiteId) {
    return this._get(`/api/websites/${websiteId}/files`);
  }

  scanFields(websiteId, file) {
    return this._get(`/api/websites/${websiteId}/scan-fields?file=${encodeURIComponent(file)}`);
  }

  async uploadDemoFiles(websiteId, files) {
    const url = `${this.baseUrl}/api/websites/${websiteId}/upload`;
    const formData = new FormData();
    const paths = [];
    for (const file of files) {
      formData.append('files', file);
      paths.push(file.webkitRelativePath || file.name);
    }
    formData.append('paths', JSON.stringify(paths));

    const headers = {};
    const token = localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || `Upload failed with status ${response.status}`,
        response.status,
        data
      );
    }
    return data;
  }

  deleteDemoFile(websiteId, filename) {
    return this._delete(`/api/websites/${websiteId}/files/${encodeURIComponent(filename)}`);
  }

  // Orphaned pages detection
  getOrphanedPages(websiteId) {
    return this._get(`/api/funnels/demo-pages/${websiteId}/orphaned`);
  }

  // Bulk operations
  bulkDeletePages(ids) {
    return this._post('/api/funnels/demo-pages/bulk-delete', { ids });
  }

  bulkUpdatePages(ids, updates) {
    return this._post('/api/funnels/demo-pages/bulk-update', { ids, updates });
  }

  // Analytics
  getPageAnalytics(pageId) {
    return this._get(`/api/funnels/demo-pages/${pageId}/analytics`);
  }

  // Download site as ZIP
  async downloadSiteZip(websiteId) {
    const url = `${this.baseUrl}/api/websites/${websiteId}/download-zip`;
    const headers = {};
    const token = localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new ApiError(
        data.error || data.message || `Download failed with status ${response.status}`,
        response.status,
        data
      );
    }

    return response;
  }

  async uploadLogo(file) {
    const url = `${this.baseUrl}/api/websites/upload-logo`;
    const formData = new FormData();
    formData.append('logo', file);

    const headers = {};
    const token = localStorage.getItem('alp_token') || sessionStorage.getItem('alp_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || `Upload failed with status ${response.status}`,
        response.status,
        data
      );
    }
    return data;
  }

  // ─── Telegram ──────────────────────────────────────────────────────

  getTelegramConfig() {
    return this._get('/api/telegram/config');
  }

  updateTelegramConfig(data) {
    return this._put('/api/telegram/config', data);
  }

  testTelegram() {
    return this._post('/api/telegram/test');
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  _buildQuery(params) {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    );
    if (entries.length === 0) return '';
    const qs = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `?${qs}`;
  }
}

/**
 * Custom API Error
 */
class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Export singleton
window.ALPApi = new ALPApi();
window.ApiError = ApiError;
