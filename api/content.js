const auth = require('../lib/auth');
const { sql } = require('@vercel/postgres');

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
