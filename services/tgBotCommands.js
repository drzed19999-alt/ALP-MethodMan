/**
 * tgBotCommands.js
 * All command handlers for a per-website Telegram bot.
 * Each function receives (bot, msg, website) and responds to the chat.
 */

const { getAdapter } = require('../database/adapter');

// ─── HTML escape helper ───────────────────────────────────────────────────────
function esc(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Auth check ───────────────────────────────────────────────────────────────
function isAuthorized(userId, website) {
  try {
    const allowed = JSON.parse(website.tg_allowed_users || '[]');
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(String(userId)) || allowed.includes(userId);
  } catch {
    return true;
  }
}

function sendDenied(bot, chatId) {
  return bot.sendMessage(chatId,
    '🚫 <b>Access Denied</b>\n\nYou are not authorized to control this bot.',
    { parse_mode: 'HTML' }
  );
}

// ─── /start & /help ───────────────────────────────────────────────────────────
async function handleStart(bot, msg, website) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  const text = [
    `🤖 <b>${esc(website.name)} — Admin Bot</b>`,
    ``,
    `Manage your website directly from Telegram:`,
    ``,
    `📊 /stats — Live visitor stats`,
    `👥 /visitors — Active sessions right now`,
    `↗️ /redirect &lt;url&gt; — Redirect all active visitors`,
    `🔘 /toggle — Toggle site online / offline`,
    `🌐 /setdomain &lt;domain&gt; — Update linked domain`,
    `📄 /pages — List registered pages`,
    `📋 /logs — Recent audit log`,
    `❓ /help — Show this menu`,
    ``,
    `🌍 <b>Domain:</b> ${esc(website.domain || 'Not set')}`,
    `🔗 <b>Slug:</b> ${esc(website.demo_slug || 'Not set')}`,
    `💡 <b>Status:</b> ${website.is_active ? '🟢 Active' : '🔴 Inactive'}`
  ].join('\n');

  return bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

async function handleHelp(bot, msg, website) {
  return handleStart(bot, msg, website);
}

// ─── /stats ───────────────────────────────────────────────────────────────────
async function handleStats(bot, msg, website) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  try {
    const db = getAdapter();
    const wid = website.id;
    const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [active, today, pv, total, subs] = await Promise.all([
      db.get('SELECT COUNT(*) as n FROM sessions WHERE website_id = ? AND is_active = 1', [wid]),
      db.get('SELECT COUNT(*) as n FROM sessions WHERE website_id = ? AND started_at >= ?', [wid, todayISO]),
      db.get('SELECT COUNT(*) as n FROM page_views WHERE website_id = ? AND timestamp >= ?', [wid, todayISO]),
      db.get('SELECT COUNT(*) as n FROM sessions WHERE website_id = ?', [wid]),
      db.get('SELECT SUM(submissions_count) as n FROM demo_pages WHERE website_id = ?', [wid])
    ]);

    const text = [
      `📊 <b>${esc(website.name)} — Live Stats</b>`,
      ``,
      `🟢 <b>Active Visitors:</b> ${active?.n || 0}`,
      `📅 <b>Sessions Today:</b> ${today?.n || 0}`,
      `👁 <b>Page Views Today:</b> ${pv?.n || 0}`,
      `🗂 <b>Total Sessions:</b> ${total?.n || 0}`,
      `📝 <b>Total Submissions:</b> ${subs?.n || 0}`,
      ``,
      `💡 <b>Status:</b> ${website.is_active ? '🟢 Online' : '🔴 Offline'}`,
      `🌍 <b>Domain:</b> ${esc(website.domain || 'Not set')}`,
      `⏰ ${new Date().toUTCString()}`
    ].join('\n');

    return bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Error fetching stats: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── /visitors ────────────────────────────────────────────────────────────────
async function handleVisitors(bot, msg, website) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  try {
    const db = getAdapter();
    const sessions = await db.all(`
      SELECT id, ip_address, country, city, browser, os, current_page, started_at
      FROM sessions
      WHERE website_id = ? AND is_active = 1
      ORDER BY started_at DESC
      LIMIT 10
    `, [website.id]);

    if (sessions.length === 0) {
      return bot.sendMessage(chatId,
        `👥 <b>${esc(website.name)}</b>\n\n<i>No active visitors right now.</i>`,
        { parse_mode: 'HTML' }
      );
    }

    const lines = [`👥 <b>${esc(website.name)} — Active Visitors (${sessions.length})</b>`, ``];
    sessions.forEach((s, i) => {
      const loc = [s.city, s.country].filter(Boolean).join(', ') || 'Unknown';
      lines.push(
        `<b>#${i + 1}</b> 🌍 ${esc(loc)}`,
        `   📄 ${esc(s.current_page || '/')}`,
        `   💻 ${esc(s.browser || '?')} / ${esc(s.os || '?')}`,
        `   🔑 <code>${esc(s.id.slice(0, 8))}…</code>`,
        ``
      );
    });

    return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Error: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── /redirect <url> ─────────────────────────────────────────────────────────
async function handleRedirect(bot, msg, website, args) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  const targetUrl = (args || '').trim();
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return bot.sendMessage(chatId,
      '↗️ Usage: <code>/redirect https://example.com</code>\n\nRedirects all active visitors instantly.',
      { parse_mode: 'HTML' }
    );
  }

  try {
    const db = getAdapter();
    const sessions = await db.all(
      'SELECT id FROM sessions WHERE website_id = ? AND is_active = 1',
      [website.id]
    );

    if (sessions.length === 0) {
      return bot.sendMessage(chatId, '↗️ No active visitors to redirect.', { parse_mode: 'HTML' });
    }

    for (const s of sessions) {
      await db.run(
        'INSERT INTO redirect_commands (session_id, website_id, target_url, executed_by) VALUES (?, ?, ?, NULL)',
        [s.id, website.id, targetUrl]
      );
    }

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (NULL, ?, ?, ?, ?, ?)',
      [
        'telegram-bot',
        `Bot redirected ${sessions.length} visitor(s) on ${website.name}`,
        'redirect',
        JSON.stringify({ website_id: website.id, target_url: targetUrl, count: sessions.length }),
        'telegram'
      ]
    );

    return bot.sendMessage(chatId,
      `✅ <b>Redirected ${sessions.length} visitor(s)</b>\n\n↗️ → <code>${esc(targetUrl)}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Redirect failed: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── /toggle ──────────────────────────────────────────────────────────────────
async function handleToggle(bot, msg, website) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  try {
    const db = getAdapter();
    const newState = website.is_active ? 0 : 1;
    await db.run('UPDATE websites SET is_active = ? WHERE id = ?', [newState, website.id]);

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (NULL, ?, ?, ?, ?, ?)',
      [
        'telegram-bot',
        `Bot ${newState ? 'activated' : 'deactivated'} website: ${website.name}`,
        'website',
        JSON.stringify({ website_id: website.id, is_active: newState }),
        'telegram'
      ]
    );

    const icon = newState ? '🟢' : '🔴';
    const label = newState ? 'ONLINE' : 'OFFLINE';
    return bot.sendMessage(chatId,
      `${icon} <b>${esc(website.name)}</b> is now <b>${label}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Toggle failed: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── /setdomain <domain> ─────────────────────────────────────────────────────
async function handleSetDomain(bot, msg, website, args) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  const domain = (args || '').trim().toLowerCase()
    .replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

  if (!domain) {
    return bot.sendMessage(chatId,
      '🌐 Usage: <code>/setdomain example.com</code>\n\nSaves the domain linked to this website in the panel.\n\n<i>Note: DNS still needs to point to your VPS on your registrar.</i>',
      { parse_mode: 'HTML' }
    );
  }

  try {
    const db = getAdapter();
    await db.run('UPDATE websites SET domain = ? WHERE id = ?', [domain, website.id]);

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (NULL, ?, ?, ?, ?, ?)',
      [
        'telegram-bot',
        `Bot updated domain for ${website.name} to ${domain}`,
        'website',
        JSON.stringify({ website_id: website.id, domain }),
        'telegram'
      ]
    );

    return bot.sendMessage(chatId,
      `✅ <b>Domain updated</b>\n\n🌐 <b>${esc(website.name)}</b>\n→ <code>${esc(domain)}</code>\n\n<i>Point your DNS A record to your VPS IP to go live.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Failed: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── /pages ───────────────────────────────────────────────────────────────────
async function handlePages(bot, msg, website) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  try {
    const db = getAdapter();
    const pages = await db.all(
      'SELECT name, url, form_type, views_count, submissions_count FROM demo_pages WHERE website_id = ? ORDER BY id',
      [website.id]
    );

    if (pages.length === 0) {
      return bot.sendMessage(chatId,
        `📄 <b>${esc(website.name)}</b>\n\n<i>No pages registered yet.</i>`,
        { parse_mode: 'HTML' }
      );
    }

    const lines = [`📄 <b>${esc(website.name)} — Pages (${pages.length})</b>`, ``];
    pages.forEach((p, i) => {
      lines.push(
        `<b>${i + 1}. ${esc(p.name)}</b> <i>(${esc(p.form_type)})</i>`,
        `   🔗 <code>${esc(p.url)}</code>`,
        `   👁 ${p.views_count || 0} views  📝 ${p.submissions_count || 0} submissions`,
        ``
      );
    });

    return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Error: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── /logs ────────────────────────────────────────────────────────────────────
async function handleLogs(bot, msg, website) {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id, website)) return sendDenied(bot, chatId);

  try {
    const db = getAdapter();
    const logs = await db.all(`
      SELECT username, action, timestamp
      FROM audit_logs
      WHERE details LIKE ?
      ORDER BY timestamp DESC
      LIMIT 8
    `, [`%"website_id":${website.id}%`]);

    if (logs.length === 0) {
      return bot.sendMessage(chatId,
        `📋 <b>${esc(website.name)}</b>\n\n<i>No recent logs for this site.</i>`,
        { parse_mode: 'HTML' }
      );
    }

    const lines = [`📋 <b>${esc(website.name)} — Recent Logs</b>`, ``];
    logs.forEach(l => {
      const time = new Date(l.timestamp).toLocaleString('en-GB', { timeZone: 'UTC' });
      lines.push(
        `• <b>${esc(l.username || '?')}</b>: ${esc(l.action)}`,
        `  <i>${esc(time)} UTC</i>`,
        ``
      );
    });

    return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    return bot.sendMessage(chatId, `❌ Error: ${esc(err.message)}`, { parse_mode: 'HTML' });
  }
}

// ─── Unknown command ──────────────────────────────────────────────────────────
async function handleUnknown(bot, msg) {
  return bot.sendMessage(msg.chat.id,
    `❓ Unknown command. Send /help to see all available commands.`,
    { parse_mode: 'HTML' }
  );
}

module.exports = {
  handleStart,
  handleHelp,
  handleStats,
  handleVisitors,
  handleRedirect,
  handleToggle,
  handleSetDomain,
  handlePages,
  handleLogs,
  handleUnknown
};
