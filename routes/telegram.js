const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');

// ─── POST /webhook ──────────────────────────────────────────────────────────────
// Public endpoint - receives webhook data from Telegram
router.post('/webhook', async (req, res) => {
  try {
    const db = getAdapter();
    const update = req.body;

    // Log the incoming webhook
    await writeAudit(req, 'Received Telegram webhook', 'telegram', { update_id: update.update_id || null }, { user_id: null, username: 'telegram' });

    // Process message if present
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const from = update.message.from;

      // Activity feed entry
      await db.run(`
        INSERT INTO activity_feed (owner_id, type, icon, message, details)
        VALUES (?, ?, ?, ?, ?)
      `, [1, 'telegram', '💬', `Telegram message from ${from.first_name || from.username || chatId}: ${text.substring(0, 100)}`,
        JSON.stringify({ chat_id: chatId, from, text: text.substring(0, 500) })]);
    }

    // Always respond with 200 to Telegram
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.status(200).json({ ok: true });
  }
});

// Apply auth to remaining routes
router.use(authenticateToken);
// Global Telegram config = panel infrastructure = god only. Per-website
// Telegram bots (see routes/websites.js /tg-config) already scope through
// website ownership.
router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'god') return res.status(403).json({ error: 'Global Telegram config is god-only' });
  next();
});

// ─── GET /config ────────────────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const db = getAdapter();
    const config = await db.get('SELECT * FROM telegram_config WHERE id = 1');

    if (!config) {
      return res.json({
        config: {
          bot_token: '',
          bot_token_masked: '',
          chat_id: '',
          is_active: false,
          notify_new_session: true,
          notify_form_data: true,
          notify_errors: true,
          notify_page_views: false
        }
      });
    }

    // Mask the bot token - show only last 4 chars
    let maskedToken = '';
    if (config.bot_token && config.bot_token.length > 4) {
      maskedToken = '•'.repeat(config.bot_token.length - 4) + config.bot_token.slice(-4);
    } else if (config.bot_token) {
      maskedToken = config.bot_token;
    }

    res.json({
      config: {
        bot_token_masked: maskedToken,
        has_token: !!(config.bot_token && config.bot_token.length > 0),
        chat_id: config.chat_id,
        is_active: !!config.is_active,
        notify_new_session: !!config.notify_new_session,
        notify_form_data: !!config.notify_form_data,
        notify_errors: !!config.notify_errors,
        notify_page_views: !!config.notify_page_views
      }
    });
  } catch (err) {
    console.error('Get telegram config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /config ────────────────────────────────────────────────────────────────
router.put('/config', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const {
      bot_token,
      chat_id,
      is_active,
      notify_new_session,
      notify_form_data,
      notify_errors,
      notify_page_views
    } = req.body;

    const updates = [];
    const values = [];

    if (bot_token !== undefined) {
      updates.push('bot_token = ?');
      values.push(bot_token);
    }

    if (chat_id !== undefined) {
      updates.push('chat_id = ?');
      values.push(String(chat_id));
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (notify_new_session !== undefined) {
      updates.push('notify_new_session = ?');
      values.push(notify_new_session ? 1 : 0);
    }

    if (notify_form_data !== undefined) {
      updates.push('notify_form_data = ?');
      values.push(notify_form_data ? 1 : 0);
    }

    if (notify_errors !== undefined) {
      updates.push('notify_errors = ?');
      values.push(notify_errors ? 1 : 0);
    }

    if (notify_page_views !== undefined) {
      updates.push('notify_page_views = ?');
      values.push(notify_page_views ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(1);
    await db.run(`UPDATE telegram_config SET ${updates.join(', ')} WHERE id = ?`, values);

    // Audit log
    const changedFields = [];
    if (bot_token !== undefined) changedFields.push('bot_token');
    if (chat_id !== undefined) changedFields.push('chat_id');
    if (is_active !== undefined) changedFields.push('is_active');
    if (notify_new_session !== undefined) changedFields.push('notify_new_session');
    if (notify_form_data !== undefined) changedFields.push('notify_form_data');
    if (notify_errors !== undefined) changedFields.push('notify_errors');
    if (notify_page_views !== undefined) changedFields.push('notify_page_views');

    await writeAudit(req, 'Updated Telegram config', 'telegram', { fields: changedFields });

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, 'telegram', '🤖', `${req.user.username} updated Telegram configuration`,
      JSON.stringify({ fields: changedFields })]);

    res.json({ message: 'Telegram config updated' });
  } catch (err) {
    console.error('Update telegram config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /test ─────────────────────────────────────────────────────────────────
router.post('/test', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const config = await db.get('SELECT bot_token, chat_id FROM telegram_config WHERE id = 1');

    if (!config || !config.bot_token || !config.chat_id) {
      return res.status(400).json({ error: 'Telegram bot token and chat ID must be configured first' });
    }

    const { message = '🔔 Admin Live Panel - Test message\n\nIf you see this, your Telegram integration is working!' } = req.body;

    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(config.bot_token);

    try {
      await bot.sendMessage(config.chat_id, message, { parse_mode: 'HTML' });
    } catch (telegramErr) {
      console.error('Telegram send error:', telegramErr.message);
      return res.status(400).json({
        error: 'Failed to send Telegram message',
        details: telegramErr.message
      });
    }

    // Audit log
    await writeAudit(req, 'Sent Telegram test message', 'telegram', { chat_id: config.chat_id });

    res.json({ message: 'Test message sent successfully' });
  } catch (err) {
    console.error('Telegram test error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
