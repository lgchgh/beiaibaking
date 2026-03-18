const auth = require('../lib/auth');
const { sql } = require('@vercel/postgres');

async function handleGet(req, res) {
  const category = req.query?.category;
  const subcategory = req.query?.sub;
  try {
    let result;
    if (category && subcategory) {
      result = await sql`SELECT * FROM gallery_images WHERE category = ${category} AND subcategory = ${subcategory} ORDER BY sort_order, id`;
    } else if (category) {
      result = await sql`SELECT * FROM gallery_images WHERE category = ${category} ORDER BY sort_order, id`;
    } else {
      result = await sql`SELECT * FROM gallery_images ORDER BY category, subcategory, sort_order, id`;
    }
    res.status(200).json(result.rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch gallery' });
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
    const { category, subcategory, src, caption, alt } = body;
    if (!category || !subcategory || !src || !caption) {
      res.status(400).json({ error: 'category, subcategory, src, caption required' });
      return;
    }
    const r = await sql`INSERT INTO gallery_images (category, subcategory, src, caption, alt) VALUES (${category}, ${subcategory || category}, ${src}, ${caption}, ${alt || caption}) RETURNING *`;
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add image' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
