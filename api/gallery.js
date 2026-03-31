const auth = require('../lib/auth');
const { canonicalCategorySubcategory } = require('../lib/galleryCanonical');
const { sql } = require('../lib/db');

const HOME_CATEGORIES = ['decorated', 'fondant', 'french', 'cookies'];

/** 法式马卡龙：库内可能为 macarons / macaron，查询时一并匹配 */
function isFrenchMacaronSubFilter(category, sub) {
  if (!category || !sub) return false;
  if (String(category).toLowerCase() !== 'french') return false;
  const s = String(sub).trim().toLowerCase();
  return s === 'macaron' || s === 'macaroons' || s === 'macarons';
}

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
          AND NOT (
            LOWER(TRIM(category::text)) = 'fondant'
            AND (
              LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
              OR LOWER(TRIM(COALESCE(caption::text, ''))) IN ('macaron', 'macarons', '马卡龙')
              OR LOWER(TRIM(COALESCE(alt::text, ''))) IN ('macaron', 'macarons', '马卡龙')
            )
          )
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
      const r = await sql`
        SELECT * FROM gallery_images
        WHERE category = ${cat}
          AND NOT (
            LOWER(TRIM(category::text)) = 'fondant'
            AND (
              LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
              OR LOWER(TRIM(COALESCE(caption::text, ''))) IN ('macaron', 'macarons', '马卡龙')
              OR LOWER(TRIM(COALESCE(alt::text, ''))) IN ('macaron', 'macarons', '马卡龙')
            )
          )
        ORDER BY sort_order, id LIMIT 4`;
      out[cat] = r.rows || [];
    }
    return out;
  }
}

const GALLERY_MAX_PAGE_SIZE = 100;

async function handleGet(req, res) {
  const category = req.query?.category;
  const subcategory = req.query?.sub;
  const home = req.query?.home;
  const paged = req.query?.paged === '1' || req.query?.paged === 'true';
  const macaronSubs = isFrenchMacaronSubFilter(category, subcategory);
  try {
    await sql`
      UPDATE gallery_images
      SET category = 'french', subcategory = 'macarons'
      WHERE LOWER(TRIM(category::text)) = 'fondant'
        AND (
          LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
          OR LOWER(TRIM(COALESCE(caption::text, ''))) IN ('macaron', 'macarons', '马卡龙')
          OR LOWER(TRIM(COALESCE(alt::text, ''))) IN ('macaron', 'macarons', '马卡龙')
        )
    `;
    if (home === '1' || home === 'true') {
      const out = await queryHomeGalleryBundle();
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.status(200).json(out);
      return;
    }
    if (paged && category) {
      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 30, 1),
        GALLERY_MAX_PAGE_SIZE
      );
      const pageRequested = Math.max(parseInt(req.query.page, 10) || 1, 1);
      let totalR;
      if (subcategory) {
        totalR = macaronSubs
          ? await sql`
              SELECT COUNT(*)::int AS c FROM gallery_images
              WHERE LOWER(TRIM(category::text)) = LOWER(TRIM(${category}))
                AND LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
            `
          : await sql`
              SELECT COUNT(*)::int AS c FROM gallery_images
              WHERE category = ${category} AND subcategory = ${subcategory}
            `;
      } else {
        totalR = await sql`
          SELECT COUNT(*)::int AS c FROM gallery_images
          WHERE category = ${category}
            AND NOT (
              LOWER(TRIM(category::text)) = 'fondant'
              AND (
                LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
                OR LOWER(TRIM(COALESCE(caption::text, ''))) IN ('macaron', 'macarons', '马卡龙')
                OR LOWER(TRIM(COALESCE(alt::text, ''))) IN ('macaron', 'macarons', '马卡龙')
              )
            )
        `;
      }
      const total = totalR.rows[0]?.c ?? 0;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
      const page = Math.min(pageRequested, totalPages);
      const offset = (page - 1) * limit;
      let rowsR;
      if (subcategory) {
        rowsR = macaronSubs
          ? await sql`
              SELECT * FROM gallery_images
              WHERE LOWER(TRIM(category::text)) = LOWER(TRIM(${category}))
                AND LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
              ORDER BY sort_order, id
              LIMIT ${limit} OFFSET ${offset}
            `
          : await sql`
              SELECT * FROM gallery_images
              WHERE category = ${category} AND subcategory = ${subcategory}
              ORDER BY sort_order, id
              LIMIT ${limit} OFFSET ${offset}
            `;
      } else {
        rowsR = await sql`
          SELECT * FROM gallery_images
          WHERE category = ${category}
            AND NOT (
              LOWER(TRIM(category::text)) = 'fondant'
              AND (
                LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
                OR LOWER(TRIM(COALESCE(caption::text, ''))) IN ('macaron', 'macarons', '马卡龙')
                OR LOWER(TRIM(COALESCE(alt::text, ''))) IN ('macaron', 'macarons', '马卡龙')
              )
            )
          ORDER BY sort_order, id
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.status(200).json({
        items: rowsR.rows || [],
        total,
        page,
        limit,
        totalPages,
      });
      return;
    }
    let result;
    if (category && subcategory) {
      result = macaronSubs
        ? await sql`
            SELECT * FROM gallery_images
            WHERE LOWER(TRIM(category::text)) = LOWER(TRIM(${category}))
              AND LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
            ORDER BY sort_order, id`
        : await sql`SELECT * FROM gallery_images WHERE category = ${category} AND subcategory = ${subcategory} ORDER BY sort_order, id`;
    } else if (category) {
      result = await sql`
        SELECT * FROM gallery_images
        WHERE category = ${category}
          AND NOT (
            LOWER(TRIM(category::text)) = 'fondant'
            AND (
              LOWER(TRIM(subcategory::text)) IN ('macarons', 'macaron', 'macaroons')
              OR LOWER(TRIM(COALESCE(caption::text, ''))) IN ('macaron', 'macarons', '马卡龙')
              OR LOWER(TRIM(COALESCE(alt::text, ''))) IN ('macaron', 'macarons', '马卡龙')
            )
          )
        ORDER BY sort_order, id`;
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
    const { category: catW, subcategory: subW } = canonicalCategorySubcategory(
      category,
      subcategory || category,
      caption,
      alt || caption
    );
    const r = await sql`INSERT INTO gallery_images (category, subcategory, src, caption, alt, sort_order) VALUES (${catW}, ${subW}, ${src}, ${caption}, ${alt || caption}, ${so}) RETURNING *`;
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
