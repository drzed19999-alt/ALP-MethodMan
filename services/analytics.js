const { getAdapter } = require('../database/adapter');

/**
 * Parse a dateRange string into SQL-compatible datetime bounds.
 * Supports: 'today', '7d', '30d', '90d', 'all', or { start, end } object.
 *
 * @param {string|Object} dateRange
 * @returns {{ start: string|null, end: string|null }}
 */
function _parseDateRange(dateRange) {
  const now = new Date();
  let start = null;
  const end = now.toISOString();

  if (!dateRange || dateRange === 'all') {
    return { start: null, end: null };
  }

  if (typeof dateRange === 'object' && dateRange.start) {
    return {
      start: dateRange.start,
      end: dateRange.end || end
    };
  }

  switch (dateRange) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      start = d.toISOString();
      break;
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      start = d.toISOString();
      break;
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      start = d.toISOString();
      break;
    }
    case '90d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      start = d.toISOString();
      break;
    }
    default: {
      const days = parseInt(dateRange, 10);
      if (!isNaN(days) && days > 0) {
        const d = new Date(now);
        d.setDate(d.getDate() - days);
        start = d.toISOString();
      }
      break;
    }
  }

  return { start, end };
}

/**
 * Build a WHERE clause fragment for date filtering.
 */
function _dateFilter(column, dateRange) {
  const { start, end } = _parseDateRange(dateRange);
  const clauses = [];
  const params = [];

  if (start) {
    clauses.push(`${column} >= ?`);
    params.push(start);
  }
  if (end) {
    clauses.push(`${column} <= ?`);
    params.push(end);
  }

  return {
    sql: clauses.length > 0 ? clauses.join(' AND ') : '1=1',
    params
  };
}

/**
 * Get aggregate dashboard statistics.
 */
async function getDashboardStats(websiteId, dateRange) {
  const db = getAdapter();
  const df = _dateFilter('started_at', dateRange);

  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  // Total sessions
  const sRow = await db.get(`
    SELECT COUNT(*) as count FROM sessions
    WHERE ${df.sql} ${websiteClause}
  `, [...df.params, ...websiteParams]);
  const totalSessions = sRow ? sRow.count : 0;

  // Active sessions (current)
  const aRow = await db.get(`
    SELECT COUNT(*) as count FROM sessions
    WHERE is_active = 1 ${websiteClause}
  `, websiteParams);
  const activeSessions = aRow ? aRow.count : 0;

  // Total page views
  const pvDf = _dateFilter('timestamp', dateRange);
  const pvRow = await db.get(`
    SELECT COUNT(*) as count FROM page_views
    WHERE ${pvDf.sql} ${websiteClause}
  `, [...pvDf.params, ...websiteParams]);
  const totalPageViews = pvRow ? pvRow.count : 0;

  // Unique visitors (by visitor_id)
  const uRow = await db.get(`
    SELECT COUNT(DISTINCT visitor_id) as count FROM sessions
    WHERE ${df.sql} ${websiteClause}
  `, [...df.params, ...websiteParams]);
  const uniqueVisitors = uRow ? uRow.count : 0;

  // Average session duration (in ms)
  const durRow = await db.get(`
    SELECT AVG(
      CAST((julianday(last_activity) - julianday(started_at)) * 86400000 AS INTEGER)
    ) as avg_ms FROM sessions
    WHERE ${df.sql} ${websiteClause} AND last_activity > started_at
  `, [...df.params, ...websiteParams]);
  const avgDuration = durRow ? (durRow.avg_ms || 0) : 0;

  // Average pages per session
  const pageRow = await db.get(`
    SELECT AVG(pages_viewed) as avg_pages FROM sessions
    WHERE ${df.sql} ${websiteClause}
  `, [...df.params, ...websiteParams]);
  const avgPages = pageRow ? (pageRow.avg_pages || 0) : 0;

  // Bounce rate (sessions with only 1 page view)
  const bRow = await db.get(`
    SELECT COUNT(*) as count FROM sessions
    WHERE ${df.sql} ${websiteClause} AND pages_viewed <= 1
  `, [...df.params, ...websiteParams]);
  const bounceSessions = bRow ? bRow.count : 0;

  const bounceRate = totalSessions > 0 ? ((bounceSessions / totalSessions) * 100).toFixed(1) : 0;

  // Redirects count
  const rdDf = _dateFilter('executed_at', dateRange);
  const rRow = await db.get(`
    SELECT COUNT(*) as count FROM redirect_commands
    WHERE ${rdDf.sql} ${websiteClause}
  `, [...rdDf.params, ...websiteParams]);
  const totalRedirects = rRow ? rRow.count : 0;

  return {
    totalSessions,
    activeSessions,
    totalPageViews,
    uniqueVisitors,
    avgDuration: Math.round(avgDuration),
    avgPages: parseFloat(avgPages.toFixed(1)),
    bounceRate: parseFloat(bounceRate),
    totalRedirects
  };
}

/**
 * Get top pages ranked by view count.
 */
async function getPageStats(websiteId, dateRange, limit = 10) {
  const db = getAdapter();
  const df = _dateFilter('timestamp', dateRange);
  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  return await db.all(`
    SELECT
      page_url,
      page_title,
      COUNT(*) as views,
      AVG(duration_ms) as avg_duration,
      COUNT(DISTINCT session_id) as unique_sessions
    FROM page_views
    WHERE ${df.sql} ${websiteClause}
    GROUP BY page_url, page_title
    ORDER BY views DESC
    LIMIT ?
  `, [...df.params, ...websiteParams, limit]);
}

/**
 * Get timeline data points grouped by interval.
 */
async function getTimelineData(websiteId, interval, dateRange) {
  const db = getAdapter();
  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  let groupFormat;
  if (interval === 'hourly') {
    groupFormat = "strftime('%Y-%m-%d %H:00', started_at)";
  } else {
    groupFormat = "strftime('%Y-%m-%d', started_at)";
  }

  const df = _dateFilter('started_at', dateRange);

  return await db.all(`
    SELECT
      ${groupFormat} as label,
      COUNT(*) as sessions,
      SUM(pages_viewed) as pageViews
    FROM sessions
    WHERE ${df.sql} ${websiteClause}
    GROUP BY label
    ORDER BY label ASC
  `, [...df.params, ...websiteParams]);
}

/**
 * Get referrer breakdown.
 */
async function getReferrerStats(websiteId, dateRange) {
  const db = getAdapter();
  const df = _dateFilter('started_at', dateRange);
  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  return await db.all(`
    SELECT
      CASE
        WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
        ELSE referrer
      END as referrer,
      COUNT(*) as count
    FROM sessions
    WHERE ${df.sql} ${websiteClause}
    GROUP BY referrer
    ORDER BY count DESC
    LIMIT 20
  `, [...df.params, ...websiteParams]);
}

/**
 * Get device/browser/OS breakdown from sessions.
 */
async function getDeviceStats(websiteId) {
  const db = getAdapter();
  const websiteClause = websiteId ? 'WHERE website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  const browsers = await db.all(`
    SELECT browser as name, COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY browser
    ORDER BY count DESC
    LIMIT 10
  `, websiteParams);

  const operatingSystems = await db.all(`
    SELECT os as name, COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY os
    ORDER BY count DESC
    LIMIT 10
  `, websiteParams);

  const devices = await db.all(`
    SELECT device as name, COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY device
    ORDER BY count DESC
    LIMIT 10
  `, websiteParams);

  return { browsers, operatingSystems, devices };
}

/**
 * Get country breakdown from sessions.
 */
async function getCountryStats(websiteId) {
  const db = getAdapter();
  const websiteClause = websiteId ? 'WHERE website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  return await db.all(`
    SELECT
      CASE
        WHEN country IS NULL OR country = '' THEN 'Unknown'
        ELSE country
      END as country,
      COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY country
    ORDER BY count DESC
    LIMIT 30
  `, websiteParams);
}

module.exports = {
  getDashboardStats,
  getPageStats,
  getTimelineData,
  getReferrerStats,
  getDeviceStats,
  getCountryStats
};
