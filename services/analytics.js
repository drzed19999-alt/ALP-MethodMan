const { getDb } = require('../database/init');

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
      // Treat as number of days
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
function getDashboardStats(websiteId, dateRange) {
  const db = getDb();
  const df = _dateFilter('started_at', dateRange);

  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  // Total sessions
  const totalSessions = db.prepare(`
    SELECT COUNT(*) as count FROM sessions
    WHERE ${df.sql} ${websiteClause}
  `).get(...df.params, ...websiteParams).count;

  // Active sessions (current)
  const activeSessions = db.prepare(`
    SELECT COUNT(*) as count FROM sessions
    WHERE is_active = 1 ${websiteClause}
  `).get(...websiteParams).count;

  // Total page views
  const pvDf = _dateFilter('timestamp', dateRange);
  const totalPageViews = db.prepare(`
    SELECT COUNT(*) as count FROM page_views
    WHERE ${pvDf.sql} ${websiteClause}
  `).get(...pvDf.params, ...websiteParams).count;

  // Unique visitors (by visitor_id)
  const uniqueVisitors = db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) as count FROM sessions
    WHERE ${df.sql} ${websiteClause}
  `).get(...df.params, ...websiteParams).count;

  // Average session duration (in ms)
  const avgDuration = db.prepare(`
    SELECT AVG(
      CAST((julianday(last_activity) - julianday(started_at)) * 86400000 AS INTEGER)
    ) as avg_ms FROM sessions
    WHERE ${df.sql} ${websiteClause} AND last_activity > started_at
  `).get(...df.params, ...websiteParams).avg_ms || 0;

  // Average pages per session
  const avgPages = db.prepare(`
    SELECT AVG(pages_viewed) as avg_pages FROM sessions
    WHERE ${df.sql} ${websiteClause}
  `).get(...df.params, ...websiteParams).avg_pages || 0;

  // Bounce rate (sessions with only 1 page view)
  const bounceSessions = db.prepare(`
    SELECT COUNT(*) as count FROM sessions
    WHERE ${df.sql} ${websiteClause} AND pages_viewed <= 1
  `).get(...df.params, ...websiteParams).count;

  const bounceRate = totalSessions > 0 ? ((bounceSessions / totalSessions) * 100).toFixed(1) : 0;

  // Redirects count
  const rdDf = _dateFilter('executed_at', dateRange);
  const totalRedirects = db.prepare(`
    SELECT COUNT(*) as count FROM redirect_commands
    WHERE ${rdDf.sql} ${websiteClause}
  `).get(...rdDf.params, ...websiteParams).count;

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
function getPageStats(websiteId, dateRange, limit = 10) {
  const db = getDb();
  const df = _dateFilter('timestamp', dateRange);
  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  return db.prepare(`
    SELECT
      page_url,
      page_title,
      COUNT(*) as views,
      AVG(duration_ms) as avg_duration,
      COUNT(DISTINCT session_id) as unique_sessions
    FROM page_views
    WHERE ${df.sql} ${websiteClause}
    GROUP BY page_url
    ORDER BY views DESC
    LIMIT ?
  `).all(...df.params, ...websiteParams, limit);
}

/**
 * Get timeline data points grouped by interval.
 *
 * @param {number|null} websiteId
 * @param {string} interval - 'hourly' or 'daily'
 * @param {string} dateRange
 * @returns {Array} Array of { label, sessions, pageViews }
 */
function getTimelineData(websiteId, interval, dateRange) {
  const db = getDb();
  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  let groupFormat;
  if (interval === 'hourly') {
    groupFormat = "strftime('%Y-%m-%d %H:00', started_at)";
  } else {
    groupFormat = "strftime('%Y-%m-%d', started_at)";
  }

  const df = _dateFilter('started_at', dateRange);

  // Sessions timeline
  const sessionTimeline = db.prepare(`
    SELECT
      ${groupFormat} as label,
      COUNT(*) as sessions,
      SUM(pages_viewed) as pageViews
    FROM sessions
    WHERE ${df.sql} ${websiteClause}
    GROUP BY label
    ORDER BY label ASC
  `).all(...df.params, ...websiteParams);

  return sessionTimeline;
}

/**
 * Get referrer breakdown.
 */
function getReferrerStats(websiteId, dateRange) {
  const db = getDb();
  const df = _dateFilter('started_at', dateRange);
  const websiteClause = websiteId ? 'AND website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  return db.prepare(`
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
  `).all(...df.params, ...websiteParams);
}

/**
 * Get device/browser/OS breakdown from sessions.
 */
function getDeviceStats(websiteId) {
  const db = getDb();
  const websiteClause = websiteId ? 'WHERE website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  const browsers = db.prepare(`
    SELECT browser as name, COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY browser
    ORDER BY count DESC
    LIMIT 10
  `).all(...websiteParams);

  const operatingSystems = db.prepare(`
    SELECT os as name, COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY os
    ORDER BY count DESC
    LIMIT 10
  `).all(...websiteParams);

  const devices = db.prepare(`
    SELECT device as name, COUNT(*) as count
    FROM sessions ${websiteClause}
    GROUP BY device
    ORDER BY count DESC
    LIMIT 10
  `).all(...websiteParams);

  return { browsers, operatingSystems, devices };
}

/**
 * Get country breakdown from sessions.
 */
function getCountryStats(websiteId) {
  const db = getDb();
  const websiteClause = websiteId ? 'WHERE website_id = ?' : '';
  const websiteParams = websiteId ? [websiteId] : [];

  return db.prepare(`
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
  `).all(...websiteParams);
}

module.exports = {
  getDashboardStats,
  getPageStats,
  getTimelineData,
  getReferrerStats,
  getDeviceStats,
  getCountryStats
};
