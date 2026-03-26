const auth = require('../../lib/auth');
const { sql } = require('../../lib/db');
const { deriveSlug } = require('../../lib/postSlug');

async function handleGet(req, res) {
  let id = req.query?.id;
  let slug = req.query?.slug;
  if (!id && !slug) {
    res.status(400).json({ error: 'id or slug required' });
    return;
  }
  try {
    let result;
    const numId = parseInt(id);
    if (id && !isNaN(numId)) {
      result = await sql`SELECT * FROM posts WHERE id = ${numId}`;
    } else {
      const slugVal = slug || id;
      result = await sql`SELECT * FROM posts WHERE slug = ${slugVal}`;
    }
    const row = result.rows?.[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!row.published) {
      const user = auth.requireAuth(req);
      if (!user) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }
    res.status(200).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
}

async function handlePut(req, res) {
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = req.query?.id;
  if (!id) {
    res.status(400).json({ error: 'ID required' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const numId = parseInt(id);
    const cur = await sql`SELECT * FROM posts WHERE id = ${numId}`;
    if (!cur.rows?.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const row = cur.rows[0];
    const title = body.title ?? row.title;
    const slug = body.slug !== undefined ? deriveSlug(body.slug, title) : row.slug;
    const content = body.content ?? row.content;
    const typeVal = body.type !== undefined ? (['news', 'recipe', 'blog'].includes(body.type) ? body.type : (row.type || 'blog')) : (row.type || 'blog');
    const excerpt = body.excerpt ?? row.excerpt;
    const cover_image = body.cover_image ?? row.cover_image;
    const published = body.published !== undefined ? !!body.published : row.published;
    const pinned = body.pinned !== undefined ? !!body.pinned : !!row.pinned;
    const r = await sql`UPDATE posts SET title=${title}, slug=${slug}, content=${content}, type=${typeVal}, excerpt=${excerpt}, cover_image=${cover_image}, published=${published}, pinned=${pinned}, updated_at=NOW() WHERE id = ${numId} RETURNING *`;
    res.status(200).json(r.rows[0] || {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update' });
  }
}

async function handleDelete(req, res) {
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = req.query?.id;
  if (!id) {
    res.status(400).json({ error: 'ID required' });
    return;
  }
  try {
    await sql`DELETE FROM posts WHERE id = ${parseInt(id)}`;
    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
