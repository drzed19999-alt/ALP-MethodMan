/**
 * Serverless Demo Page Handler
 * GET /api/demo
 * Serves requested demo page with API key and tracker injected.
 */
const fs = require('fs');
const path = require('path');
const { getAdapter } = require('../../database/adapter');

const XPAGES_ROOT = path.join(__dirname, '..', '..', 'xPages');

module.exports = async function handler(req, res) {
  try {
    const urlPath = req.url.replace(/^\/api\/demo/, '').replace(/^\/demo/, '');
    const parts = urlPath.split('/').filter(Boolean);

    let slug = parts[0] || 'demo';
    let page = parts[1] || 'index.html';

    if (!page.endsWith('.html') && !page.includes('.')) {
      page += '.html';
    }

    if (slug.includes('..') || page.includes('..')) {
      return res.status(400).send('Invalid path');
    }

    const db = getAdapter();
    const website = await db.get('SELECT api_key FROM websites WHERE demo_slug = ? LIMIT 1', [slug]);
    const apiKey = website ? website.api_key : 'demo-default';

    let filePath = path.join(XPAGES_ROOT, slug, page);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(XPAGES_ROOT, 'demo', page);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Page not found');
    }

    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/%%API_KEY%%/g, apiKey);

    const trackerSnippet = `<script src="/tracker.js" data-api-key="${apiKey}" defer></script>`;
    if (!html.includes('/tracker.js') && !html.includes('data-api-key')) {
      if (html.includes('</body>')) {
        html = html.replace('</body>', `  ${trackerSnippet}\n</body>`);
      } else {
        html += '\n' + trackerSnippet;
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Demo page handler error:', err);
    res.status(500).send('Internal server error');
  }
};
