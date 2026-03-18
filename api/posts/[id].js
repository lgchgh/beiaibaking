const auth = require('../../lib/auth');
const { sql } = require('../../lib/db');

async function handleGet(req, res) {
  const id = req.query?.id;
  const slug = req.query?.slug;
  if (!id && !slug) {
    res.status(400).json({ error: 'id or slug required' });
    return;
  }
  try {
    let result;
    if (id) {
      result = await sql`SELECT * FROM posts WHERE id = ${parseInt(id)}`;
    } else {
      result = await sql`SELECT * FROM posts WHERE slug = ${slug}`;
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
    const slug = body.slug ?? row.slug;
    const content = body.content ?? row.content;
    const excerpt = body.excerpt ?? row.excerpt;
    const cover_image = body.cover_image ?? row.cover_image;
    const published = body.published !== undefined ? !!body.published : row.published;
    const r = await sql`UPDATE posts SET title=${title}, slug=${slug}, content=${content}, excerpt=${excerpt}, cover_image=${cover_image}, published=${published}, updated_at=NOW() WHERE id = ${numId} RETURNING *`;
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
