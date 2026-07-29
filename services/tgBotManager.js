/**
 * tgBotManager.js
 * Multi-bot engine: manages one TelegramBot instance per website.
 * Called from server.js on startup and from routes/websites.js when bot config changes.
 */

'use strict';

const { getDb } = require('../database/init');
const cmds = require('./tgBotCommands');

// websiteId (number) → { bot: TelegramBot, website: object }
const bots = new Map();

// ─── Load a fresh website record ─────────────────────────────────────────────
function fetchWebsite(websiteId) {
  const db = getDb();
  return db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId) || null;
}

// ─── Parse a command message ─────────────────────────────────────────────────
// Returns { cmd, args } e.g. "/redirect https://x.com" → { cmd: 'redirect', args: 'https://x.com' }
function parseCommand(text) {
  if (!text || !text.startsWith('/')) return null;
  const clean = text.replace(/@\w+/, '').trim(); // strip @BotName mention
  const space = clean.indexOf(' ');
  if (space === -1) return { cmd: clean.slice(1).toLowerCase(), args: '' };
  return {
    cmd: clean.slice(1, space).toLowerCase(),
    args: clean.slice(space + 1).trim()
  };
}

// ─── Attach message handler to a bot instance ────────────────────────────────
function attachHandlers(bot, websiteId) {
  bot.on('message', async (msg) => {
    if (!msg.text) return;
    const parsed = parseCommand(msg.text);
    if (!parsed) return;

    // Always re-fetch website so toggle/setdomain reflect fresh state
    const website = fetchWebsite(websiteId);
    if (!website) return;

    const { cmd, args } = parsed;
    try {
      switch (cmd) {
        case 'start':   await cmds.handleStart(bot, msg, website); break;
        case 'help':    await cmds.handleHelp(bot, msg, website); break;
        case 'stats':   await cmds.handleStats(bot, msg, website); break;
        case 'visitors': await cmds.handleVisitors(bot, msg, website); break;
        case 'redirect': await cmds.handleRedirect(bot, msg, website, args); break;
        case 'toggle':  await cmds.handleToggle(bot, msg, website); break;
        case 'setdomain': await cmds.handleSetDomain(bot, msg, website, args); break;
        case 'pages':   await cmds.handlePages(bot, msg, website); break;
        case 'logs':    await cmds.handleLogs(bot, msg, website); break;
        default:        await cmds.handleUnknown(bot, msg); break;
      }
    } catch (err) {
      console.error(`[TgBot#${websiteId}] Command error (/${cmd}):`, err.message);
    }
  });

  bot.on('polling_error', (err) => {
    // 401 = invalid token — stop the bot silently
    if (err.code === 'ETELEGRAM' && err.response && err.response.statusCode === 401) {
      console.warn(`[TgBot#${websiteId}] Invalid token — stopping bot.`);
      stopBot(websiteId);
    } else {
      console.error(`[TgBot#${websiteId}] Polling error:`, err.message);
    }
  });

  bot.on('error', (err) => {
    console.error(`[TgBot#${websiteId}] Bot error:`, err.message);
  });
}

// ─── Start a single website bot ───────────────────────────────────────────────
async function startBot(websiteId) {
  // Stop existing instance first
  await stopBot(websiteId);

  const website = fetchWebsite(websiteId);
  if (!website || !website.tg_bot_token || !website.tg_bot_active) return;

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(website.tg_bot_token, {
      polling: { interval: 1000, autoStart: true, params: { timeout: 10 } }
    });

    attachHandlers(bot, websiteId);
    bots.set(websiteId, { bot, token: website.tg_bot_token });

    console.log(`✅ [TgBot] Started for website #${websiteId} "${website.name}"`);
  } catch (err) {
    console.error(`❌ [TgBot#${websiteId}] Failed to start:`, err.message);
  }
}

// ─── Stop a single website bot ────────────────────────────────────────────────
async function stopBot(websiteId) {
  const entry = bots.get(websiteId);
  if (!entry) return;

  try {
    await entry.bot.stopPolling();
  } catch (err) {
    // Ignore stop errors
  }
  bots.delete(websiteId);
  console.log(`🔴 [TgBot] Stopped bot for website #${websiteId}`);
}

// ─── Restart a bot (called after config change) ───────────────────────────────
async function restartBot(websiteId) {
  await startBot(websiteId);
}

// ─── Get a running bot instance ───────────────────────────────────────────────
function getBot(websiteId) {
  const entry = bots.get(websiteId);
  return entry ? entry.bot : null;
}

// ─── Initialize all active bots on server startup ────────────────────────────
async function initAll() {
  try {
    const db = getDb();
    const sites = db.prepare(
      "SELECT id FROM websites WHERE tg_bot_token IS NOT NULL AND tg_bot_token != '' AND tg_bot_active = 1"
    ).all();


    if (sites.length === 0) {
      console.log('ℹ️  [TgBotManager] No per-site bots configured yet.');
      return;
    }

    console.log(`🤖 [TgBotManager] Starting ${sites.length} site bot(s)...`);
    for (const site of sites) {
      await startBot(site.id);
    }
  } catch (err) {
    console.error('❌ [TgBotManager] initAll error:', err.message);
  }
}

// ─── Send a message via a website's bot ──────────────────────────────────────
// Useful for push alerts from tracker.js notifications
async function sendToSite(websiteId, chatId, html) {
  const entry = bots.get(websiteId);
  if (!entry) return false;
  try {
    await entry.bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    console.error(`[TgBot#${websiteId}] sendToSite error:`, err.message);
    return false;
  }
}

module.exports = { initAll, startBot, stopBot, restartBot, getBot, sendToSite };
