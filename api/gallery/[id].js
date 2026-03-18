const auth = require('../../lib/auth');
const { sql } = require('../../lib/db');

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
    const cur = await sql`SELECT * FROM gallery_images WHERE id = ${numId}`;
    if (!cur.rows?.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const row = cur.rows[0];
    const category = body.category ?? row.category;
    const subcategory = body.subcategory ?? row.subcategory;
    const src = body.src ?? row.src;
    const caption = body.caption ?? row.caption;
    const alt = body.alt ?? row.alt;
    const sort_order = body.sort_order ?? row.sort_order;
    const r = await sql`UPDATE gallery_images SET category=${category}, subcategory=${subcategory}, src=${src}, caption=${caption}, alt=${alt}, sort_order=${sort_order} WHERE id = ${numId} RETURNING *`;
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
    await sql`DELETE FROM gallery_images WHERE id = ${parseInt(id)}`;
    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
