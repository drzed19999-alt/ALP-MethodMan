/**
 * Domain Monitor — Background Job
 *
 * Runs a periodic pass through every tracked domain and calls the pipeline
 * checker as needed.  Uses the same setInterval pattern as session cleanup
 * in server.js — no external cron library required.
 *
 * Check cadence:
 *   - pending_nameservers / vps_configured: every 2 min
 *   - live / ssl_issued: uptime probe every 60 min
 *   - error: retry every 30 min (with error_count back-off up to 6 h)
 *   - is_processing = 1: skip (another check is running)
 */

const { getAdapter }             = require('../database/adapter');
const { checkDomain, checkUptime } = require('../services/domainPipeline');

const BASE_INTERVAL_MS  = 2 * 60 * 1000;   // 2 min
const UPTIME_INTERVAL_H = 1;               // re-check live domains hourly
const ERROR_RETRY_MIN   = 30;              // base retry for error state (minutes)
const ERROR_MAX_MIN     = 360;             // cap back-off at 6 h

function minutesSince(isoStr) {
  if (!isoStr) return Infinity;
  return (Date.now() - new Date(isoStr).getTime()) / 60000;
}

function shouldCheck(domain) {
  if (domain.is_processing) return false;

  switch (domain.status) {
    case 'pending_nameservers':
    case 'nameservers_active':
    case 'vps_configured':
      return minutesSince(domain.last_checked_at) >= 2;

    case 'ssl_issued':
      return minutesSince(domain.last_checked_at) >= 30;

    case 'live':
      return minutesSince(domain.last_uptime_check_at) >= UPTIME_INTERVAL_H * 60;

    case 'error': {
      const backoffMin = Math.min(ERROR_MAX_MIN, ERROR_RETRY_MIN * Math.pow(2, Math.max(0, (domain.error_count || 1) - 1)));
      return minutesSince(domain.last_checked_at) >= backoffMin;
    }

    default:
      return false;
  }
}

async function runPass() {
  const db = getAdapter();
  let domains;
  try {
    domains = await db.all(
      `SELECT * FROM domains WHERE manual_override = 0 AND is_processing = 0`
    );
  } catch (err) {
    console.error('[DomainMonitor] DB read error:', err.message);
    return;
  }

  for (const d of domains) {
    if (!shouldCheck(d)) continue;

    if (d.status === 'live') {
      checkUptime(d.id).catch(err =>
        console.error(`[DomainMonitor] uptime check failed for ${d.domain}:`, err.message)
      );
    } else {
      checkDomain(d.id).catch(err =>
        console.error(`[DomainMonitor] pipeline check failed for ${d.domain}:`, err.message)
      );
    }
  }
}

function start() {
  console.log('[DomainMonitor] started — interval: 2 min');
  runPass().catch(() => {}); // immediate first pass
  return setInterval(() => runPass().catch(() => {}), BASE_INTERVAL_MS);
}

module.exports = { start, runPass };
