const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { scopeByWebsite, ownsWebsite } = require('../middleware/scope');

// Apply auth to all redirect routes
router.use(authenticateToken);

// Guard: existing rule must belong to a website the caller owns.
async function _guardRuleId(req, res, next) {
  const ruleId = parseInt(req.params.id, 10);
  if (!Number.isFinite(ruleId)) return res.status(400).json({ error: 'invalid id' });
  const db = getAdapter();
  try {
    const rule = await db.get('SELECT id, website_id FROM redirect_rules WHERE id = ?', [ruleId]);
    if (!rule) return res.status(404).json({ error: 'Redirect rule not found' });
    if (rule.website_id != null && !(await ownsWebsite(req, rule.website_id))) {
      return res.status(404).json({ error: 'Redirect rule not found' });
    }
    // Global rules (website_id NULL) are god-only.
    if (rule.website_id == null && req.effectiveUserId != null) {
      return res.status(403).json({ error: 'Global redirect rules are god-only' });
    }
    req._rule = rule;
    next();
  } catch (err) {
    console.error('[redirects] guard error:', err.message);
    res.status(500).json({ error: 'Scope check failed' });
  }
}

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
    const { website_id, is_active } = req.query;

    let whereClauses = [];
    let params = [];

    if (website_id) {
      whereClauses.push('r.website_id = ?');
      params.push(parseInt(website_id, 10));
    }

    if (is_active !== undefined) {
      whereClauses.push('r.is_active = ?');
      params.push(parseInt(is_active, 10));
    }

    // Scope by ownership through the website.
    const scope = scopeByWebsite(req, 'r.website_id');
    if (scope.clause) {
      whereClauses.push(scope.clause.replace(/^\s*AND\s*/i, ''));
      params.push(...scope.params);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const rules = await db.all(`
      SELECT r.*, w.name as website_name, w.domain as website_domain
      FROM redirect_rules r
      LEFT JOIN websites w ON r.website_id = w.id
      ${whereSQL}
      ORDER BY r.priority DESC, r.created_at DESC
    `, params);

    const parsed = rules.map(rule => {
      try {
        rule.conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions || '{}') : (rule.conditions || {});
      } catch (e) {
        rule.conditions = {};
      }
      return rule;
    });

    res.json({ rules: parsed });
  } catch (err) {
    console.error('List redirect rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const db = getAdapter();
    const {
      website_id,
      name,
      source_pattern = '*',
      target_url,
      is_active = 1,
      apply_when_offline = 0,
      priority = 0,
      conditions = {}
    } = req.body;

    if (!target_url) return res.status(400).json({ error: 'target_url is required' });
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Every rule must be attached to a website the caller owns. Global
    // (website_id null) rules are only allowed for unrestricted god.
    if (website_id) {
      if (!(await ownsWebsite(req, website_id))) {
        return res.status(403).json({ error: 'You do not own this website' });
      }
    } else if (req.effectiveUserId != null) {
      return res.status(403).json({ error: 'website_id is required for non-god callers' });
    }

    const conditionsStr = typeof conditions === 'string' ? conditions : JSON.stringify(conditions);

    const result = await db.run(`
      INSERT INTO redirect_rules (website_id, name, source_pattern, target_url, is_active, apply_when_offline, priority, conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      website_id ? parseInt(website_id, 10) : null,
      name,
      source_pattern,
      target_url,
      is_active ? 1 : 0,
      apply_when_offline ? 1 : 0,
      parseInt(priority, 10) || 0,
      conditionsStr
    ]);

    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `Created redirect rule: ${name}`, 'redirect',
      JSON.stringify({ rule_id: result.lastInsertRowid, target_url, source_pattern }), req.ip]);

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'redirect', '🔀', `${req.user.username} created redirect rule "${name}"`,
      JSON.stringify({ rule_id: result.lastInsertRowid, target_url }), website_id || null]);

    const rule = await db.get('SELECT * FROM redirect_rules WHERE id = ?', [result.lastInsertRowid]);
    if (rule) {
      try { rule.conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions || '{}') : (rule.conditions || {}); } catch (e) { rule.conditions = {}; }
    }

    res.status(201).json({ message: 'Redirect rule created', rule });
  } catch (err) {
    console.error('Create redirect rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /:id ───────────────────────────────────────────────────────────────────
router.put('/:id', _guardRuleId, async (req, res) => {
  try {
    const db = getAdapter();
    const ruleId = parseInt(req.params.id, 10);
    const existing = await db.get('SELECT * FROM redirect_rules WHERE id = ?', [ruleId]);
    if (!existing) return res.status(404).json({ error: 'Redirect rule not found' });

    const {
      website_id,
      name,
      source_pattern,
      target_url,
      is_active,
      apply_when_offline,
      priority,
      conditions
    } = req.body;

    // If reassigning to a different website, caller must own the target too.
    if (website_id !== undefined && website_id && Number(website_id) !== Number(existing.website_id)) {
      if (!(await ownsWebsite(req, website_id))) {
        return res.status(403).json({ error: 'You do not own the target website' });
      }
    }

    const updates = [];
    const values = [];

    if (website_id !== undefined) { updates.push('website_id = ?');         values.push(website_id ? parseInt(website_id, 10) : null); }
    if (name !== undefined)       { updates.push('name = ?');               values.push(name); }
    if (source_pattern !== undefined) { updates.push('source_pattern = ?'); values.push(source_pattern); }
    if (target_url !== undefined) { updates.push('target_url = ?');         values.push(target_url); }
    if (is_active !== undefined)  { updates.push('is_active = ?');          values.push(is_active ? 1 : 0); }
    if (apply_when_offline !== undefined) { updates.push('apply_when_offline = ?'); values.push(apply_when_offline ? 1 : 0); }
    if (priority !== undefined)   { updates.push('priority = ?');           values.push(parseInt(priority, 10) || 0); }
    if (conditions !== undefined) { updates.push('conditions = ?');         values.push(typeof conditions === 'string' ? conditions : JSON.stringify(conditions)); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(ruleId);

    await db.run(`UPDATE redirect_rules SET ${updates.join(', ')} WHERE id = ?`, values);

    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `Updated redirect rule: ${name || existing.name}`, 'redirect',
      JSON.stringify({ rule_id: ruleId }), req.ip]);

    const rule = await db.get('SELECT * FROM redirect_rules WHERE id = ?', [ruleId]);
    if (rule) {
      try { rule.conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions || '{}') : (rule.conditions || {}); } catch (e) { rule.conditions = {}; }
    }

    res.json({ message: 'Redirect rule updated', rule });
  } catch (err) {
    console.error('Update redirect rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id', _guardRuleId, async (req, res) => {
  try {
    const db = getAdapter();
    const ruleId = parseInt(req.params.id, 10);
    const existing = await db.get('SELECT * FROM redirect_rules WHERE id = ?', [ruleId]);
    if (!existing) return res.status(404).json({ error: 'Redirect rule not found' });

    await db.run('DELETE FROM redirect_rules WHERE id = ?', [ruleId]);

    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `Deleted redirect rule: ${existing.name}`, 'redirect',
      JSON.stringify({ rule_id: ruleId, name: existing.name, target_url: existing.target_url }), req.ip]);

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'redirect', '🗑️', `${req.user.username} deleted redirect rule "${existing.name}"`,
      JSON.stringify({ rule_id: ruleId }), existing.website_id]);

    res.json({ message: 'Redirect rule deleted' });
  } catch (err) {
    console.error('Delete redirect rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /:id/toggle ────────────────────────────────────────────────────────────
router.put('/:id/toggle', requireRole('super_admin'), _guardRuleId, async (req, res) => {
  try {
    const db = getAdapter();
    const ruleId = parseInt(req.params.id, 10);
    const existing = await db.get('SELECT * FROM redirect_rules WHERE id = ?', [ruleId]);
    if (!existing) return res.status(404).json({ error: 'Redirect rule not found' });

    const newState = existing.is_active ? 0 : 1;
    await db.run('UPDATE redirect_rules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newState, ruleId]);

    const stateLabel = newState ? 'activated' : 'deactivated';

    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, `${stateLabel} redirect rule: ${existing.name}`, 'redirect',
      JSON.stringify({ rule_id: ruleId, is_active: newState }), req.ip]);

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'redirect', newState ? '✅' : '⏸️', `${req.user.username} ${stateLabel} redirect rule "${existing.name}"`,
      JSON.stringify({ rule_id: ruleId }), existing.website_id]);

    res.json({ message: `Redirect rule ${stateLabel}`, is_active: newState });
  } catch (err) {
    console.error('Toggle redirect rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
