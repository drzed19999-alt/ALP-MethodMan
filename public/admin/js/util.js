/**
 * ALP - Shared utilities
 * Small pure functions used across many pages. Loaded before all page modules.
 * Prefer these over per-file copies so behavior stays consistent.
 *
 * Exposed as: window.AlpUtil.escapeHtml(str), .timeAgo(date), .formatBytes(n),
 *             .debounce(fn, ms), .parseDate(str)
 */
window.AlpUtil = (function () {
  'use strict';

  /**
   * Escape a string for safe insertion into HTML.
   * Handles null/undefined by returning ''.
   * @param {*} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    // Use textContent → innerHTML to leverage the browser's escaper.
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /**
   * Parse a date string safely. Handles both ISO strings and SQLite-style
   * "YYYY-MM-DD HH:MM:SS" (assumed UTC).
   * @param {string|Date|null} dateStr
   * @returns {Date}
   */
  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    const s = String(dateStr);
    // Bare "YYYY-MM-DD HH:MM:SS" → assume UTC
    if (!s.includes('T') && !s.includes('Z') && !s.includes('+') && s.includes(' ')) {
      return new Date(s.trim().replace(' ', 'T') + 'Z');
    }
    return new Date(s);
  }

  /**
   * Human "N ago" — "just now", "5m ago", "3h ago", "2d ago".
   * @param {string|Date|null} dateStr
   * @returns {string}
   */
  function timeAgo(dateStr) {
    const d = parseDate(dateStr);
    const diff = Math.max(0, Date.now() - d.getTime());
    const s = Math.floor(diff / 1000);
    if (s < 60)  return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60)  return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24)  return h + 'h ago';
    const days = Math.floor(h / 24);
    if (days < 30) return days + 'd ago';
    const months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.floor(months / 12) + 'y ago';
  }

  /**
   * Human byte size — "512 B", "1.2 KB", "3.4 MB", "1.1 GB".
   * @param {number} n bytes
   * @param {number} [decimals=1]
   * @returns {string}
   */
  function formatBytes(n, decimals) {
    if (!n || n < 0) return '0 B';
    if (decimals == null) decimals = 1;
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    return (n / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals) + ' ' + units[i];
  }

  /**
   * Debounce — returns a wrapped function that delays calls by ms.
   * @param {Function} fn
   * @param {number} ms
   * @returns {Function}
   */
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  return { escapeHtml, timeAgo, formatBytes, debounce, parseDate };
})();
