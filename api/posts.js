const auth = require('../lib/auth');
const { sql } = require('../lib/db');
const { deriveSlug } = require('../lib/postSlug');

async function handleGet(req, res) {
  const published = req.query?.published;
  const type = req.query?.type;
  try {
    let result;
    if (published === 'true') {
      if (type) {
        result = await sql`SELECT id, title, slug, type, excerpt, cover_image, pinned, created_at FROM posts WHERE published = true AND type = ${type} ORDER BY COALESCE(pinned, false) DESC, created_at DESC`;
      } else {
        result = await sql`SELECT id, title, slug, type, excerpt, cover_image, pinned, created_at FROM posts WHERE published = true ORDER BY COALESCE(pinned, false) DESC, created_at DESC`;
      }
    } else {
      const user = auth.requireAuth(req);
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      result = await sql`SELECT * FROM posts ORDER BY COALESCE(pinned, false) DESC, created_at DESC`;
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
    const { title, slug, content, type, excerpt, cover_image, published, pinned } = body;
    if (!title || !content) {
      res.status(400).json({ error: 'title and content required' });
      return;
    }
    const postType = ['news', 'recipe', 'blog'].includes(type) ? type : 'blog';
    const s = deriveSlug(slug, title);
    const r = await sql`INSERT INTO posts (title, slug, content, type, excerpt, cover_image, published, pinned) VALUES (${title}, ${s}, ${content}, ${postType}, ${excerpt || ''}, ${cover_image || ''}, ${!!published}, ${!!pinned}) RETURNING *`;
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
