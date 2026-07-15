const router = require('express').Router();
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

// Apply auth to all analytics routes
router.use(authenticateToken);

/**
 * Helper: build a date filter clause for a column.
 * Supports: today, yesterday, 7d, 30d, 90d, or custom from/to ISO dates.
 */
function buildDateFilter(query, column) {
  const { range, from, to } = query;
  let clause = '';
  const params = [];

  switch (range) {
    case 'today':
      clause = `AND ${column} >= date('now', 'start of day')`;
      break;
    case 'yesterday':
      clause = `AND ${column} >= date('now', '-1 day', 'start of day') AND ${column} < date('now', 'start of day')`;
      break;
    case '7d':
      clause = `AND ${column} >= datetime('now', '-7 days')`;
      break;
    case '30d':
      clause = `AND ${column} >= datetime('now', '-30 days')`;
      break;
    case '90d':
      clause = `AND ${column} >= datetime('now', '-90 days')`;
      break;
    case 'custom':
      if (from) {
        clause += ` AND ${column} >= ?`;
        params.push(from);
      }
      if (to) {
        clause += ` AND ${column} <= ?`;
        params.push(to);
      }
      break;
    default:
      // Default to today
      clause = `AND ${column} >= date('now', 'start of day')`;
      break;
  }

  return { clause, params };
}

// ─── GET /dashboard ─────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  try {
    const db = getDb();
    const { website_id, range = 'today' } = req.query;

    let websiteFilter = '';
    const websiteParams = [];
    if (website_id) {
      websiteFilter = 'AND website_id = ?';
      websiteParams.push(parseInt(website_id, 10));
    }

    // Active sessions now
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE is_active = 1 ${websiteFilter}
    `).get(...websiteParams).count;

    // Date filters for sessions and page views
    const dateFilterPV = buildDateFilter(req.query, 'timestamp');
    const dateFilterSessions = buildDateFilter(req.query, 'started_at');

    // Page views in range
    const pageViewsToday = db.prepare(`
      SELECT COUNT(*) as count FROM page_views
      WHERE 1=1 ${dateFilterPV.clause} ${websiteFilter}
    `).get(...dateFilterPV.params, ...websiteParams).count;

    // Average session duration in range (in seconds)
    const avgDuration = db.prepare(`
      SELECT AVG((julianday(COALESCE(last_activity, started_at)) - julianday(started_at)) * 86400) as avg_seconds
      FROM sessions
      WHERE 1=1 ${dateFilterSessions.clause} ${websiteFilter}
    `).get(...dateFilterSessions.params, ...websiteParams).avg_seconds || 0;

    // Active websites
    const activeWebsites = db.prepare('SELECT COUNT(*) as count FROM websites WHERE is_active = 1').get().count;

    // Trend calculations (mock or simple comparison to yesterday)
    const sessionsTrend = 14;
    const viewsTrend = 8;
    const durationTrend = -3;
    const websitesTrend = 0;

    // Chart data depending on timeframe
    const isDaily = range === '7d' || range === '30d' || range === '90d' || range === 'custom';
    let sessionsChart = [];

    if (isDaily) {
      // Group by date
      const timelineData = db.prepare(`
        SELECT strftime('%Y-%m-%d', started_at) as date_str, COUNT(*) as count
        FROM sessions
        WHERE 1=1 ${dateFilterSessions.clause} ${websiteFilter}
        GROUP BY date_str
        ORDER BY date_str ASC
      `).all(...dateFilterSessions.params, ...websiteParams);

      sessionsChart = timelineData.map(d => {
        // e.g. "2026-06-21" -> "06-21"
        const label = d.date_str ? d.date_str.slice(5) : '';
        return {
          label,
          value: d.count || 0
        };
      });
    } else {
      // Hourly chart data (last 24 hours)
      const hourlyData = db.prepare(`
        SELECT strftime('%H', started_at) as hour, COUNT(*) as sessions
        FROM sessions
        WHERE started_at >= datetime('now', '-24 hours') ${websiteFilter}
        GROUP BY hour
        ORDER BY hour ASC
      `).all(...websiteParams);

      for (let h = 0; h < 24; h++) {
        const hourStr = h.toString().padStart(2, '0');
        const found = hourlyData.find(d => d.hour === hourStr);
        sessionsChart.push({
          label: `${hourStr}:00`,
          value: found ? found.sessions : 0
        });
      }
    }

    // Top pages in range
    const topPages = db.prepare(`
      SELECT page_url as page, COUNT(*) as count
      FROM page_views
      WHERE 1=1 ${dateFilterPV.clause} ${websiteFilter}
      GROUP BY page_url
      ORDER BY count DESC
      LIMIT 5
    `).all(...dateFilterPV.params, ...websiteParams);

    // Live Activity feed
    const activityFeed = db.prepare(`
      SELECT id, type, icon, message, timestamp
      FROM activity_feed
      ORDER BY timestamp DESC
      LIMIT 15
    `).all();

    // Recent sessions
    const recentSessions = db.prepare(`
      SELECT s.*, w.name as website_name
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      ORDER BY s.last_activity DESC
      LIMIT 5
    `).all();

    res.json({
      stats: {
        activeSessions,
        pageViewsToday,
        avgDuration: Math.round(avgDuration * 1000), // convert to ms for UI
        activeWebsites,
        sessionsTrend,
        viewsTrend,
        durationTrend,
        websitesTrend
      },
      sessionsChart,
      topPages,
      activityFeed,
      recentSessions
    });
  } catch (err) {
    console.error('Analytics dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /overview ──────────────────────────────────────────────────────────────
router.get('/overview', (req, res) => {
  try {
    const db = getDb();
    const { website_id } = req.query;

    let websiteFilter = '';
    const websiteParams = [];
    if (website_id) {
      websiteFilter = 'AND website_id = ?';
      websiteParams.push(parseInt(website_id, 10));
    }

    // Sessions today
    const sessionsToday = db.prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE started_at >= date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    // Sessions yesterday (for comparison)
    const sessionsYesterday = db.prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE started_at >= date('now', '-1 day', 'start of day')
        AND started_at < date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    // Active sessions now
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE is_active = 1 ${websiteFilter}
    `).get(...websiteParams);

    // Page views today
    const pageViewsToday = db.prepare(`
      SELECT COUNT(*) as count FROM page_views
      WHERE timestamp >= date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    // Page views yesterday
    const pageViewsYesterday = db.prepare(`
      SELECT COUNT(*) as count FROM page_views
      WHERE timestamp >= date('now', '-1 day', 'start of day')
        AND timestamp < date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    // Average session duration today (in seconds)
    const avgDuration = db.prepare(`
      SELECT AVG((julianday(COALESCE(last_activity, started_at)) - julianday(started_at)) * 86400) as avg_seconds
      FROM sessions
      WHERE started_at >= date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    // Top pages today
    const topPages = db.prepare(`
      SELECT page_url, page_title, COUNT(*) as views
      FROM page_views
      WHERE timestamp >= date('now', 'start of day') ${websiteFilter}
      GROUP BY page_url
      ORDER BY views DESC
      LIMIT 10
    `).all(...websiteParams);

    // Hourly chart data (last 24 hours)
    const hourlyData = db.prepare(`
      SELECT strftime('%H', started_at) as hour, COUNT(*) as sessions
      FROM sessions
      WHERE started_at >= datetime('now', '-24 hours') ${websiteFilter}
      GROUP BY hour
      ORDER BY hour ASC
    `).all(...websiteParams);

    // Fill in missing hours
    const hourlyChart = [];
    for (let h = 0; h < 24; h++) {
      const hourStr = h.toString().padStart(2, '0');
      const found = hourlyData.find(d => d.hour === hourStr);
      hourlyChart.push({
        hour: hourStr,
        label: `${hourStr}:00`,
        sessions: found ? found.sessions : 0
      });
    }

    // Unique visitors today (by visitor_id)
    const uniqueVisitors = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as count FROM sessions
      WHERE started_at >= date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    // Bounce rate (sessions with only 1 page view)
    const totalSessionsForBounce = db.prepare(`
      SELECT COUNT(*) as total FROM sessions
      WHERE started_at >= date('now', 'start of day') ${websiteFilter}
    `).get(...websiteParams);

    const bouncedSessions = db.prepare(`
      SELECT COUNT(*) as bounced FROM sessions
      WHERE started_at >= date('now', 'start of day')
        AND pages_viewed <= 1 ${websiteFilter}
    `).get(...websiteParams);

    const bounceRate = totalSessionsForBounce.total > 0
      ? Math.round((bouncedSessions.bounced / totalSessionsForBounce.total) * 100)
      : 0;

    res.json({
      sessions_today: sessionsToday.count,
      sessions_yesterday: sessionsYesterday.count,
      active_sessions: activeSessions.count,
      page_views_today: pageViewsToday.count,
      page_views_yesterday: pageViewsYesterday.count,
      avg_duration_seconds: Math.round(avgDuration.avg_seconds || 0),
      unique_visitors: uniqueVisitors.count,
      bounce_rate: bounceRate,
      top_pages: topPages,
      hourly_chart: hourlyChart
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /pages ─────────────────────────────────────────────────────────────────
router.get('/pages', (req, res) => {
  try {
    const db = getDb();
    const { website_id, limit = 50 } = req.query;
    const dateFilter = buildDateFilter(req.query, 'pv.timestamp');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND pv.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const pages = db.prepare(`
      SELECT
        pv.page_url,
        pv.page_title,
        COUNT(*) as views,
        COUNT(DISTINCT pv.session_id) as unique_sessions,
        AVG(pv.duration_ms) as avg_duration_ms
      FROM page_views pv
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY pv.page_url
      ORDER BY views DESC
      LIMIT ?
    `).all(...allParams, limitNum);

    res.json({ pages });
  } catch (err) {
    console.error('Analytics pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /referrers ─────────────────────────────────────────────────────────────
router.get('/referrers', (req, res) => {
  try {
    const db = getDb();
    const { website_id, limit = 20 } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const referrers = db.prepare(`
      SELECT
        CASE
          WHEN s.referrer IS NULL OR s.referrer = '' THEN 'Direct'
          ELSE s.referrer
        END as referrer,
        COUNT(*) as sessions,
        COUNT(DISTINCT s.visitor_id) as unique_visitors
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY referrer
      ORDER BY sessions DESC
      LIMIT ?
    `).all(...allParams, limitNum);

    res.json({ referrers });
  } catch (err) {
    console.error('Analytics referrers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /countries ─────────────────────────────────────────────────────────────
router.get('/countries', (req, res) => {
  try {
    const db = getDb();
    const { website_id, limit = 30 } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    const countries = db.prepare(`
      SELECT
        COALESCE(NULLIF(s.country, ''), 'Unknown') as country,
        COUNT(*) as sessions,
        COUNT(DISTINCT s.visitor_id) as unique_visitors
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY country
      ORDER BY sessions DESC
      LIMIT ?
    `).all(...allParams, limitNum);

    res.json({ countries });
  } catch (err) {
    console.error('Analytics countries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /devices ───────────────────────────────────────────────────────────────
router.get('/devices', (req, res) => {
  try {
    const db = getDb();
    const { website_id } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    // Browsers
    const browsers = db.prepare(`
      SELECT
        COALESCE(NULLIF(s.browser, ''), 'Unknown') as browser,
        COUNT(*) as count
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY browser
      ORDER BY count DESC
    `).all(...allParams);

    // Operating systems
    const operatingSystems = db.prepare(`
      SELECT
        COALESCE(NULLIF(s.os, ''), 'Unknown') as os,
        COUNT(*) as count
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY os
      ORDER BY count DESC
    `).all(...allParams);

    // Device types
    const devices = db.prepare(`
      SELECT
        COALESCE(NULLIF(s.device, ''), 'Unknown') as device,
        COUNT(*) as count
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY device
      ORDER BY count DESC
    `).all(...allParams);

    res.json({ browsers, operating_systems: operatingSystems, devices });
  } catch (err) {
    console.error('Analytics devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /timeline ──────────────────────────────────────────────────────────────
router.get('/timeline', (req, res) => {
  try {
    const db = getDb();
    const { website_id, granularity = 'hourly' } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    let groupBy, selectExpr, orderBy;

    if (granularity === 'daily') {
      selectExpr = "strftime('%Y-%m-%d', s.started_at) as period";
      groupBy = "strftime('%Y-%m-%d', s.started_at)";
      orderBy = 'period ASC';
    } else {
      // hourly (default)
      selectExpr = "strftime('%Y-%m-%d %H:00', s.started_at) as period";
      groupBy = "strftime('%Y-%m-%d %H:00', s.started_at)";
      orderBy = 'period ASC';
    }

    const sessions = db.prepare(`
      SELECT
        ${selectExpr},
        COUNT(*) as sessions,
        COUNT(DISTINCT s.visitor_id) as unique_visitors
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy}
    `).all(...allParams);

    // Page views timeline
    const pvDateFilter = buildDateFilter(req.query, 'pv.timestamp');
    const pvAllParams = [...pvDateFilter.params];
    let pvWebsiteFilter = '';
    if (website_id) {
      pvWebsiteFilter = 'AND pv.website_id = ?';
      pvAllParams.push(parseInt(website_id, 10));
    }

    let pvGroupBy, pvSelectExpr;
    if (granularity === 'daily') {
      pvSelectExpr = "strftime('%Y-%m-%d', pv.timestamp) as period";
      pvGroupBy = "strftime('%Y-%m-%d', pv.timestamp)";
    } else {
      pvSelectExpr = "strftime('%Y-%m-%d %H:00', pv.timestamp) as period";
      pvGroupBy = "strftime('%Y-%m-%d %H:00', pv.timestamp)";
    }

    const pageViews = db.prepare(`
      SELECT
        ${pvSelectExpr},
        COUNT(*) as page_views
      FROM page_views pv
      WHERE 1=1 ${pvDateFilter.clause} ${pvWebsiteFilter}
      GROUP BY ${pvGroupBy}
      ORDER BY period ASC
    `).all(...pvAllParams);

    // Merge sessions and page views by period
    const pvMap = {};
    pageViews.forEach(pv => { pvMap[pv.period] = pv.page_views; });

    const timeline = sessions.map(s => ({
      period: s.period,
      sessions: s.sessions,
      unique_visitors: s.unique_visitors,
      page_views: pvMap[s.period] || 0
    }));

    res.json({ granularity, timeline });
  } catch (err) {
    console.error('Analytics timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
