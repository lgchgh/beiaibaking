const auth = require('../lib/auth');
const { sql } = require('../lib/db');

async function handleGet(req, res) {
  const published = req.query?.published;
  try {
    let result;
    if (published === 'true') {
      result = await sql`SELECT id, title, slug, excerpt, cover_image, created_at FROM posts WHERE published = true ORDER BY created_at DESC`;
    } else {
      const user = auth.requireAuth(req);
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      result = await sql`SELECT * FROM posts ORDER BY created_at DESC`;
    }
    res.status(200).json(result.rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
}

async function handlePost(req, res) {
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { title, slug, content, excerpt, cover_image, published } = body;
    if (!title || !content) {
      res.status(400).json({ error: 'title and content required' });
      return;
    }
    const s = slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const r = await sql`INSERT INTO posts (title, slug, content, excerpt, cover_image, published) VALUES (${title}, ${s}, ${content}, ${excerpt || ''}, ${cover_image || ''}, ${!!published}) RETURNING *`;
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create post' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
