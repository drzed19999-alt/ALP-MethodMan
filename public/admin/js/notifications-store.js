/**
 * ALP - Notifications Store
 * Single source of truth for the unread-notification count.
 * Sidebar and header subscribe; anyone who mutates server state calls refresh().
 */
const ALPNotifications = (() => {
  const POLL_MS = 30_000;

  let _count = 0;
  let _lastPayload = null;
  let _timer = null;
  const _subs = new Set();

  function _emit() {
    _subs.forEach(fn => { try { fn(_count, _lastPayload); } catch (_) {} });
  }

  async function refresh() {
    if (!window.ALPApi || !window.ALPAuth || !window.ALPAuth.isAuthenticated()) return _count;
    try {
      const resp = await window.ALPApi.getNotifications();
      const list = resp && (resp.notifications || (Array.isArray(resp) ? resp : []));
      const next = (typeof resp?.unread_count === 'number')
        ? resp.unread_count
        : (list || []).filter(n => !n.is_read).length;
      _lastPayload = resp;
      if (next !== _count) {
        _count = next;
        _emit();
      } else {
        _lastPayload = resp;
      }
    } catch (_) { /* offline — keep last state */ }
    return _count;
  }

  function subscribe(fn) {
    _subs.add(fn);
    fn(_count, _lastPayload);
    return () => _subs.delete(fn);
  }

  function getCount() { return _count; }
  function getPayload() { return _lastPayload; }

  function startPolling(ms) {
    stopPolling();
    _timer = setInterval(refresh, ms || POLL_MS);
    refresh();
  }
  function stopPolling() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  return { refresh, subscribe, getCount, getPayload, startPolling, stopPolling };
})();

window.ALPNotifications = ALPNotifications;
