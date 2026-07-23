const { getDb } = require('../database/init');

/**
 * Evaluate redirect rules against a session, return the highest-priority match or null.
 *
 * @param {Object} session - The session object from the DB
 * @param {boolean} isAdminOnline - Whether an admin is currently connected
 * @returns {Object|null} The matching redirect rule, or null
 */
function evaluateRules(session, isAdminOnline) {
  const db = getDb();

  // Get all active rules for this session's website, ordered by priority DESC
  let rules;
  if (isAdminOnline) {
    rules = db.prepare(`
      SELECT * FROM redirect_rules
      WHERE website_id = ? AND is_active = 1
      ORDER BY priority DESC
    `).all(session.website_id);
  } else {
    // When admin is offline, only apply rules with apply_when_offline = 1
    rules = db.prepare(`
      SELECT * FROM redirect_rules
      WHERE website_id = ? AND is_active = 1 AND apply_when_offline = 1
      ORDER BY priority DESC
    `).all(session.website_id);
  }

  for (const rule of rules) {
    // Check source pattern against current page
    if (!_matchPattern(rule.source_pattern, session.current_page)) {
      continue;
    }

    // Check conditions
    if (!_matchConditions(rule.conditions, session)) {
      continue;
    }

    // First matching rule (highest priority due to ORDER BY) wins
    return rule;
  }

  return null;
}

/**
 * Execute a redirect: send Socket.IO event, log to DB, add to activity feed.
 *
 * @param {Object} io - The Socket.IO server instance
 * @param {string} sessionId - The session to redirect
 * @param {string} targetUrl - The URL to redirect to
 * @param {number|null} adminUserId - The admin user who triggered the redirect (null for auto)
 */
function executeRedirect(io, sessionId, targetUrl, adminUserId) {
  const db = getDb();

  // Get the session to find its website_id and socket room info
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return;

  // Send redirect command to the tracker namespace
  const trackerNsp = io.of('/tracker');
  trackerNsp.to(`session:${sessionId}`).emit('tracker:redirect', { url: targetUrl });

  // Log the redirect command in the database
  db.prepare(`
    INSERT INTO redirect_commands (session_id, website_id, target_url, executed_by)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, session.website_id, targetUrl, adminUserId);

  // Add to activity feed
  const actionBy = adminUserId ? 'admin' : 'auto-rule';
  db.prepare(`
    INSERT INTO activity_feed (type, icon, message, details, website_id, session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'redirect',
    '🔀',
    `Session redirected to ${targetUrl} (${actionBy})`,
    JSON.stringify({ target_url: targetUrl, executed_by: adminUserId }),
    session.website_id,
    sessionId
  );

  // Emit the redirect event to admin namespace so admin panel updates
  const adminNsp = io.of('/admin');
  adminNsp.emit('admin:session-redirected', {
    sessionId,
    targetUrl,
    executedBy: adminUserId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get all redirect rules with apply_when_offline enabled for a given website.
 *
 * @param {number} websiteId
 * @returns {Array} Array of redirect rules
 */
function getOfflineRules(websiteId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM redirect_rules
    WHERE website_id = ? AND is_active = 1 AND apply_when_offline = 1
    ORDER BY priority DESC
  `).all(websiteId);
}

/**
 * Match a URL against a wildcard source pattern.
 */
function _matchPattern(pattern, url) {
  if (!pattern || pattern === '*') return true;
  if (!url) return false;

  // Escape regex special chars except *, then convert * to .*
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(url);
}

/**
 * Check if a session matches the conditions specified in a rule.
 */
function _matchConditions(conditionsStr, session) {
  if (!conditionsStr) return true;

  let conditions;
  try {
    conditions = typeof conditionsStr === 'string' ? JSON.parse(conditionsStr) : conditionsStr;
  } catch {
    return true; // Invalid JSON = no conditions = match
  }

  // Empty conditions object means match everything
  if (!conditions || Object.keys(conditions).length === 0) return true;

  // Check country
  if (conditions.country && conditions.country.trim()) {
    const expected = conditions.country.toLowerCase().trim();
    const actual = (session.country || '').toLowerCase().trim();
    if (expected !== actual) return false;
  }

  // Check device type
  if (conditions.device && conditions.device.trim()) {
    const expected = conditions.device.toLowerCase().trim();
    const actual = (session.device || '').toLowerCase().trim();
    if (expected !== actual) return false;
  }

  // Check browser
  if (conditions.browser && conditions.browser.trim()) {
    const expected = conditions.browser.toLowerCase().trim();
    const actual = (session.browser || '').toLowerCase().trim();
    if (!actual.includes(expected)) return false;
  }

  // Check referrer
  if (conditions.referrer && conditions.referrer.trim()) {
    const actual = session.referrer || '';
    if (!_matchPattern(conditions.referrer.trim(), actual)) return false;
  }

  return true;
}

/**
 * Resolve the next step in the funnel for a session and redirect if auto-advance is configured.
 */
function handleFunnelFormSubmit(io, sessionId, currentPageUrl) {
  const db = getDb();
  
  const session = db.prepare('SELECT website_id, metadata FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return;
  
  const funnel = db.prepare('SELECT steps FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1').get(session.website_id);
  if (!funnel) return;
  
  let steps = [];
  try { steps = JSON.parse(funnel.steps || '[]'); } catch { return; }
  
  const cleanPath = (url) => url.split('?')[0].replace(/\/$/, '').toLowerCase();
  const currentPath = cleanPath(currentPageUrl);
  
  const idx = steps.findIndex(s => cleanPath(s.url) === currentPath);
  if (idx === -1) return;

  // Save the current step index in the session metadata so we keep track of where they are
  let metadata = {};
  try { metadata = JSON.parse(session.metadata || '{}'); } catch {}
  metadata.currentStepIndex = idx;
  db.prepare('UPDATE sessions SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), sessionId);
  
  // Send visitor to the next step in the funnel (usually a loading screen)
  const nextStep = steps[idx + 1];
  if (nextStep && nextStep.url) {
    executeRedirect(io, sessionId, nextStep.url, null);
  } else {
    // Fallback: redirect to the loading page for this website's slug
    const website = db.prepare('SELECT demo_slug FROM websites WHERE id = ?').get(session.website_id);
    const slug = website && website.demo_slug ? website.demo_slug : 'demo';
    executeRedirect(io, sessionId, `/demo/${slug}/loading`, null);
  }
}

/**
 * Manually advance the visitor to the next step in the funnel
 */
function advanceFunnel(io, sessionId) {
  const db = getDb();
  
  const session = db.prepare('SELECT website_id, current_page, metadata FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  
  const funnel = db.prepare('SELECT steps FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1').get(session.website_id);
  if (!funnel) return null;
  
  let steps = [];
  try { steps = JSON.parse(funnel.steps || '[]'); } catch { return null; }
  
  let metadata = {};
  try { metadata = JSON.parse(session.metadata || '{}'); } catch {}
  
  let currentIdx = -1;
  if (metadata.hasOwnProperty('currentStepIndex')) {
    currentIdx = parseInt(metadata.currentStepIndex, 10);
  } else {
    const cleanPath = (url) => url.split('?')[0].replace(/\/$/, '').toLowerCase();
    const currentPath = cleanPath(session.current_page || '');
    currentIdx = steps.findIndex(s => cleanPath(s.url) === currentPath);
  }
  
  // Skip any intermediate loading/holding page steps since the user is already on loading
  let nextIdx = currentIdx + 1;
  while (nextIdx < steps.length) {
    const nextStep = steps[nextIdx];
    const cleanStepUrl = (nextStep.url || '').split('?')[0].replace(/\/$/, '').toLowerCase();
    const pageObj = db.prepare('SELECT form_type FROM demo_pages WHERE website_id = ? AND (LOWER(url) = ? OR LOWER(url) = ?)').get(session.website_id, cleanStepUrl, cleanStepUrl.split('/').pop());
    const isStepLoading = (pageObj && pageObj.form_type === 'loading') || 
                          cleanStepUrl.includes('/loading') || 
                          /^(loading|loader|wait|waiting|hold|holdscreen|please[-_]?wait|standby|processing|verifying)(.html)?$/.test(cleanStepUrl.split('/').pop());
    if (isStepLoading) {
      nextIdx++;
    } else {
      break;
    }
  }
  
  const nextStep = steps[nextIdx];
  if (nextStep) {
    // Update currentStepIndex to the next step index
    metadata.currentStepIndex = nextIdx;
    db.prepare('UPDATE sessions SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), sessionId);

    executeRedirect(io, sessionId, nextStep.url, null);
    return nextStep.url;
  }
  return null;
}

module.exports = {
  evaluateRules,
  executeRedirect,
  getOfflineRules,
  handleFunnelFormSubmit,
  advanceFunnel
};
