const auth = require('../lib/auth');
const { sql } = require('../lib/db');

/** 读取 home 时合并旧版 intro_para1 + intro_para2，便于无缝迁移到 intro_main */
function mergeLegacyHomeIntro(data) {
  if (!data || typeof data !== 'object') return;
  const main = data.intro_main;
  if (main != null && String(main).trim() !== '') return;
  const parts = [data.intro_para1, data.intro_para2].filter(
    (x) => x != null && String(x).trim() !== ''
  );
  if (parts.length) data.intro_main = parts.join('\n\n');
}

/**
 * DB may still hold older legal copy with mailto:. Rewrite on read so the live site
 * matches the static HTML defaults (links to contact.html).
 */
function rewriteLegalContactHtml(html) {
  if (!html || typeof html !== 'string') return html;
  let s = html;
  s = s.replace(
    /<a\s+href=['"]mailto:admin@beiaibaking\.net['"][^>]*>[\s\S]*?<\/a>/gi,
    '<a href="contact.html">contact us</a>'
  );
  s = s.replace(
    /when you contact us by email \(e\.g\. admin@beiaibaking\.net\)/gi,
    'when you contact us through our <a href="contact.html">Contact page</a>'
  );
  s = s.replace(/please contact us at admin@beiaibaking\.net/gi, 'please <a href="contact.html">contact us</a>');
  s = s.replace(/contact us at admin@beiaibaking\.net/gi, 'please <a href="contact.html">contact us</a>');
  return s;
}

async function handleGet(req, res) {
  const page = req.query?.page;
  if (!page) {
    res.status(400).json({ error: 'page required' });
    return;
  }
  try {
    const r = await sql`SELECT key, value FROM site_content WHERE page = ${page}`;
    const data = {};
    (r.rows || []).forEach(row => { data[row.key] = row.value; });
    if (page === 'home') mergeLegacyHomeIntro(data);
    if ((page === 'privacy' || page === 'terms') && typeof data.content === 'string') {
      data.content = rewriteLegalContactHtml(data.content);
    }
    res.status(200).json(data);
  } catch (e) {
    if (e.message?.includes('does not exist')) {
      res.status(200).json({});
      return;
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
}

async function handlePut(req, res) {
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { page, key, value, content } = body;
    if (!page) {
      res.status(400).json({ error: 'page required' });
      return;
    }
    if (content && typeof content === 'object') {
      for (const [k, v] of Object.entries(content)) {
        await sql`INSERT INTO site_content (page, key, value) VALUES (${page}, ${k}, ${String(v || '')})
          ON CONFLICT (page, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
      }
    } else if (key) {
      await sql`INSERT INTO site_content (page, key, value) VALUES (${page}, ${key}, ${value || ''})
        ON CONFLICT (page, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
    }
    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
