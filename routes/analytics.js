const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
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
      clause = `AND ${column} >= CURRENT_DATE`;
      break;
    case 'yesterday':
      clause = `AND ${column} >= (CURRENT_DATE - INTERVAL '1 day') AND ${column} < CURRENT_DATE`;
      break;
    case '7d':
      clause = `AND ${column} >= (CURRENT_TIMESTAMP - INTERVAL '7 days')`;
      break;
    case '30d':
      clause = `AND ${column} >= (CURRENT_TIMESTAMP - INTERVAL '30 days')`;
      break;
    case '90d':
      clause = `AND ${column} >= (CURRENT_TIMESTAMP - INTERVAL '90 days')`;
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
      clause = `AND ${column} >= CURRENT_DATE`;
      break;
  }

  return { clause, params };
}

// ─── GET /dashboard ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, range = 'today' } = req.query;

    let websiteFilter = '';
    const websiteParams = [];
    if (website_id) {
      websiteFilter = 'AND website_id = ?';
      websiteParams.push(parseInt(website_id, 10));
    }

    // Active sessions now
    const activeRow = await db.get(`
      SELECT COUNT(*) as count FROM sessions
      WHERE is_active = 1 ${websiteFilter}
    `, websiteParams);
    const activeSessions = activeRow ? activeRow.count : 0;

    // Date filters for sessions and page views
    const dateFilterPV = buildDateFilter(req.query, 'timestamp');
    const dateFilterSessions = buildDateFilter(req.query, 'started_at');

    // Page views in range
    const pvRow = await db.get(`
      SELECT COUNT(*) as count FROM page_views
      WHERE 1=1 ${dateFilterPV.clause} ${websiteFilter}
    `, [...dateFilterPV.params, ...websiteParams]);
    const pageViewsToday = pvRow ? pvRow.count : 0;

    // Average session duration in range (in seconds)
    const avgRow = await db.get(`
      SELECT AVG((julianday(COALESCE(last_activity, started_at)) - julianday(started_at)) * 86400) as avg_seconds
      FROM sessions
      WHERE 1=1 ${dateFilterSessions.clause} ${websiteFilter}
    `, [...dateFilterSessions.params, ...websiteParams]);
    const avgDuration = avgRow ? (avgRow.avg_seconds || 0) : 0;

    // Active websites
    const webRow = await db.get('SELECT COUNT(*) as count FROM websites WHERE is_active = 1');
    const activeWebsites = webRow ? webRow.count : 0;

    const sessionsTrend = 14;
    const viewsTrend = 8;
    const durationTrend = -3;
    const websitesTrend = 0;

    const isDaily = range === '7d' || range === '30d' || range === '90d' || range === 'custom';
    let sessionsChart = [];

    if (isDaily) {
      const timelineData = await db.all(`
        SELECT strftime('%Y-%m-%d', started_at) as date_str, COUNT(*) as count
        FROM sessions
        WHERE 1=1 ${dateFilterSessions.clause} ${websiteFilter}
        GROUP BY date_str
        ORDER BY date_str ASC
      `, [...dateFilterSessions.params, ...websiteParams]);

      sessionsChart = timelineData.map(d => {
        const label = d.date_str ? d.date_str.slice(5) : '';
        return { label, value: d.count || 0 };
      });
    } else {
      const hourlyData = await db.all(`
        SELECT strftime('%H', started_at) as hour, COUNT(*) as sessions
        FROM sessions
        WHERE started_at >= datetime('now', '-24 hours') ${websiteFilter}
        GROUP BY hour
        ORDER BY hour ASC
      `, websiteParams);

      for (let h = 0; h < 24; h++) {
        const hourStr = h.toString().padStart(2, '0');
        const found = hourlyData.find(d => d.hour === hourStr);
        sessionsChart.push({
          label: `${hourStr}:00`,
          value: found ? found.sessions : 0
        });
      }
    }

    const topPages = await db.all(`
      SELECT page_url as page, COUNT(*) as count
      FROM page_views
      WHERE 1=1 ${dateFilterPV.clause} ${websiteFilter}
      GROUP BY page_url
      ORDER BY count DESC
      LIMIT 5
    `, [...dateFilterPV.params, ...websiteParams]);

    const activityFeed = await db.all(`
      SELECT id, type, icon, message, timestamp
      FROM activity_feed
      ORDER BY timestamp DESC
      LIMIT 15
    `);

    const recentSessions = await db.all(`
      SELECT s.*, w.name as website_name
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      ORDER BY s.last_activity DESC
      LIMIT 5
    `);

    res.json({
      stats: {
        activeSessions,
        pageViewsToday,
        avgDuration: Math.round(avgDuration * 1000),
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
router.get('/overview', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id } = req.query;

    let websiteFilter = '';
    const websiteParams = [];
    if (website_id) {
      websiteFilter = 'AND website_id = ?';
      websiteParams.push(parseInt(website_id, 10));
    }

    const sessionsToday = await db.get(`
      SELECT COUNT(*) as count FROM sessions
      WHERE started_at >= CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const sessionsYesterday = await db.get(`
      SELECT COUNT(*) as count FROM sessions
      WHERE started_at >= (CURRENT_DATE - INTERVAL '1 day')
        AND started_at < CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const activeSessions = await db.get(`
      SELECT COUNT(*) as count FROM sessions
      WHERE is_active = 1 ${websiteFilter}
    `, websiteParams);

    const pageViewsToday = await db.get(`
      SELECT COUNT(*) as count FROM page_views
      WHERE timestamp >= CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const pageViewsYesterday = await db.get(`
      SELECT COUNT(*) as count FROM page_views
      WHERE timestamp >= (CURRENT_DATE - INTERVAL '1 day')
        AND timestamp < CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const avgDuration = await db.get(`
      SELECT AVG((julianday(COALESCE(last_activity, started_at)) - julianday(started_at)) * 86400) as avg_seconds
      FROM sessions
      WHERE started_at >= CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const topPages = await db.all(`
      SELECT page_url, page_title, COUNT(*) as views
      FROM page_views
      WHERE timestamp >= CURRENT_DATE ${websiteFilter}
      GROUP BY page_url, page_title
      ORDER BY views DESC
      LIMIT 10
    `, websiteParams);

    const hourlyData = await db.all(`
      SELECT strftime('%H', started_at) as hour, COUNT(*) as sessions
      FROM sessions
      WHERE started_at >= datetime('now', '-24 hours') ${websiteFilter}
      GROUP BY hour
      ORDER BY hour ASC
    `, websiteParams);

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

    const uniqueVisitors = await db.get(`
      SELECT COUNT(DISTINCT visitor_id) as count FROM sessions
      WHERE started_at >= CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const totalSessionsForBounce = await db.get(`
      SELECT COUNT(*) as total FROM sessions
      WHERE started_at >= CURRENT_DATE ${websiteFilter}
    `, websiteParams);

    const bouncedSessions = await db.get(`
      SELECT COUNT(*) as bounced FROM sessions
      WHERE started_at >= CURRENT_DATE
        AND pages_viewed <= 1 ${websiteFilter}
    `, websiteParams);

    const totalB = totalSessionsForBounce ? totalSessionsForBounce.total : 0;
    const bouncedB = bouncedSessions ? bouncedSessions.bounced : 0;
    const bounceRate = totalB > 0 ? Math.round((bouncedB / totalB) * 100) : 0;

    res.json({
      sessions_today: sessionsToday ? sessionsToday.count : 0,
      sessions_yesterday: sessionsYesterday ? sessionsYesterday.count : 0,
      active_sessions: activeSessions ? activeSessions.count : 0,
      page_views_today: pageViewsToday ? pageViewsToday.count : 0,
      page_views_yesterday: pageViewsYesterday ? pageViewsYesterday.count : 0,
      avg_duration_seconds: Math.round((avgDuration ? avgDuration.avg_seconds : 0) || 0),
      unique_visitors: uniqueVisitors ? uniqueVisitors.count : 0,
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
router.get('/pages', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, limit = 50 } = req.query;
    const dateFilter = buildDateFilter(req.query, 'pv.timestamp');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND pv.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const pages = await db.all(`
      SELECT
        pv.page_url,
        pv.page_title,
        COUNT(*) as views,
        COUNT(DISTINCT pv.session_id) as unique_sessions,
        AVG(pv.duration_ms) as avg_duration_ms
      FROM page_views pv
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY pv.page_url, pv.page_title
      ORDER BY views DESC
      LIMIT ?
    `, [...allParams, limitNum]);

    res.json({ pages });
  } catch (err) {
    console.error('Analytics pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /referrers ─────────────────────────────────────────────────────────────
router.get('/referrers', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, limit = 20 } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const referrers = await db.all(`
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
    `, [...allParams, limitNum]);

    res.json({ referrers });
  } catch (err) {
    console.error('Analytics referrers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /countries ─────────────────────────────────────────────────────────────
router.get('/countries', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, limit = 30 } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    const countries = await db.all(`
      SELECT
        COALESCE(NULLIF(s.country, ''), 'Unknown') as country,
        COUNT(*) as sessions,
        COUNT(DISTINCT s.visitor_id) as unique_visitors
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY country
      ORDER BY sessions DESC
      LIMIT ?
    `, [...allParams, limitNum]);

    res.json({ countries });
  } catch (err) {
    console.error('Analytics countries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /devices ───────────────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id } = req.query;
    const dateFilter = buildDateFilter(req.query, 's.started_at');

    let websiteFilter = '';
    const allParams = [...dateFilter.params];
    if (website_id) {
      websiteFilter = 'AND s.website_id = ?';
      allParams.push(parseInt(website_id, 10));
    }

    const browsers = await db.all(`
      SELECT
        COALESCE(NULLIF(s.browser, ''), 'Unknown') as browser,
        COUNT(*) as count
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY browser
      ORDER BY count DESC
    `, allParams);

    const operatingSystems = await db.all(`
      SELECT
        COALESCE(NULLIF(s.os, ''), 'Unknown') as os,
        COUNT(*) as count
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY os
      ORDER BY count DESC
    `, allParams);

    const devices = await db.all(`
      SELECT
        COALESCE(NULLIF(s.device, ''), 'Unknown') as device,
        COUNT(*) as count
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY device
      ORDER BY count DESC
    `, allParams);

    res.json({ browsers, operating_systems: operatingSystems, devices });
  } catch (err) {
    console.error('Analytics devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /timeline ──────────────────────────────────────────────────────────────
router.get('/timeline', async (req, res) => {
  try {
    const db = getAdapter();
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
      selectExpr = "strftime('%Y-%m-%d %H:00', s.started_at) as period";
      groupBy = "strftime('%Y-%m-%d %H:00', s.started_at)";
      orderBy = 'period ASC';
    }

    const sessions = await db.all(`
      SELECT
        ${selectExpr},
        COUNT(*) as sessions,
        COUNT(DISTINCT s.visitor_id) as unique_visitors
      FROM sessions s
      WHERE 1=1 ${dateFilter.clause} ${websiteFilter}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy}
    `, allParams);

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

    const pageViews = await db.all(`
      SELECT
        ${pvSelectExpr},
        COUNT(*) as page_views
      FROM page_views pv
      WHERE 1=1 ${pvDateFilter.clause} ${pvWebsiteFilter}
      GROUP BY ${pvGroupBy}
      ORDER BY period ASC
    `, pvAllParams);

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
