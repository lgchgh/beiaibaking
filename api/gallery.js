const auth = require('../lib/auth');
const { sql } = require('../lib/db');

const HOME_CATEGORIES = ['decorated', 'fondant', 'french', 'cookies'];

function emptyHomeBundle() {
  const out = {};
  HOME_CATEGORIES.forEach((c) => {
    out[c] = [];
  });
  return out;
}

/** 一条 SQL 拉首页四类（每类最多 4 条），避免 Promise.all 并发占满无服务器连接池 */
async function queryHomeGalleryBundle() {
  try {
    const r = await sql`
      SELECT id, category, subcategory, src, caption, alt, sort_order, created_at
      FROM (
        SELECT id, category, subcategory, src, caption, alt, sort_order, created_at,
          ROW_NUMBER() OVER (PARTITION BY category ORDER BY sort_order ASC, id ASC) AS _rn
        FROM gallery_images
        WHERE category IN ('decorated', 'fondant', 'french', 'cookies')
      ) AS ranked
      WHERE _rn <= 4
      ORDER BY category, sort_order, id
    `;
    const out = emptyHomeBundle();
    (r.rows || []).forEach((row) => {
      const cat = row.category;
      if (Object.prototype.hasOwnProperty.call(out, cat)) out[cat].push(row);
    });
    return out;
  } catch (e) {
    console.error('gallery home batch query failed, sequential fallback', e);
    const out = emptyHomeBundle();
    for (let i = 0; i < HOME_CATEGORIES.length; i++) {
      const cat = HOME_CATEGORIES[i];
      const r = await sql`SELECT * FROM gallery_images WHERE category = ${cat} ORDER BY sort_order, id LIMIT 4`;
      out[cat] = r.rows || [];
    }
    return out;
  }
}

async function handleGet(req, res) {
  const category = req.query?.category;
  const subcategory = req.query?.sub;
  const home = req.query?.home;
  try {
    if (home === '1' || home === 'true') {
      const out = await queryHomeGalleryBundle();
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.status(200).json(out);
      return;
    }
    let result;
    if (category && subcategory) {
      result = await sql`SELECT * FROM gallery_images WHERE category = ${category} AND subcategory = ${subcategory} ORDER BY sort_order, id`;
    } else if (category) {
      result = await sql`SELECT * FROM gallery_images WHERE category = ${category} ORDER BY sort_order, id`;
    } else {
      result = await sql`SELECT * FROM gallery_images ORDER BY category, subcategory, sort_order, id`;
    }
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
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
    const { category, subcategory, src, caption, alt, sort_order } = body;
    if (!category || !subcategory || !src || !caption) {
      res.status(400).json({ error: 'category, subcategory, src, caption required' });
      return;
    }
    const so = sort_order !== undefined ? parseInt(sort_order) : 0;
    const r = await sql`INSERT INTO gallery_images (category, subcategory, src, caption, alt, sort_order) VALUES (${category}, ${subcategory || category}, ${src}, ${caption}, ${alt || caption}, ${so}) RETURNING *`;
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
