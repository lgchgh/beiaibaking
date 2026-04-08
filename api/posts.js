const auth = require('../lib/auth');
const { cronAuthResult, readCronSecretFromRequest } = require('../lib/cronAuth');
const { sql } = require('../lib/db');
const { deriveSlug } = require('../lib/postSlug');
const { getJsonBody } = require('../lib/parseBody');
const { ensurePostsSchema } = require('../lib/ensurePostsSchema');
const { clearOtherPinnedPosts } = require('../lib/uniquePinned');

const POSTS_MAX_PAGE_SIZE = 100;

async function handleGet(req, res) {
  const published = req.query?.published;
  const type = req.query?.type;
  const paged = req.query?.paged === '1' || req.query?.paged === 'true';
  try {
    let result;
    if (published === 'true') {
      if (paged) {
        const limit = Math.min(
          Math.max(parseInt(req.query.limit, 10) || 20, 1),
          POSTS_MAX_PAGE_SIZE
        );
        const pageRequested = Math.max(parseInt(req.query.page, 10) || 1, 1);
        let totalR;
        if (type) {
          totalR = await sql`
            SELECT COUNT(*)::int AS c FROM posts
            WHERE published = true AND type = ${type}
          `;
        } else {
          totalR = await sql`
            SELECT COUNT(*)::int AS c FROM posts WHERE published = true
          `;
        }
        const total = totalR.rows[0]?.c ?? 0;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
        const page = Math.min(pageRequested, totalPages);
        const offset = (page - 1) * limit;
        let rowsR;
        if (type) {
          rowsR = await sql`
            SELECT id, title, slug, type, excerpt, cover_image, pinned, created_at, published_at FROM posts
            WHERE published = true AND type = ${type}
            ORDER BY COALESCE(pinned, false) DESC, COALESCE(published_at, created_at) DESC
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else {
          rowsR = await sql`
            SELECT id, title, slug, type, excerpt, cover_image, pinned, created_at, published_at FROM posts
            WHERE published = true
            ORDER BY COALESCE(pinned, false) DESC, COALESCE(published_at, created_at) DESC
            LIMIT ${limit} OFFSET ${offset}
          `;
        }
        res.status(200).json({
          items: rowsR.rows || [],
          total,
          page,
          limit,
          totalPages,
        });
        return;
      }
      if (type) {
        result = await sql`SELECT id, title, slug, type, excerpt, cover_image, pinned, created_at, published_at FROM posts WHERE published = true AND type = ${type} ORDER BY COALESCE(pinned, false) DESC, COALESCE(published_at, created_at) DESC`;
      } else {
        result = await sql`SELECT id, title, slug, type, excerpt, cover_image, pinned, created_at, published_at FROM posts WHERE published = true ORDER BY COALESCE(pinned, false) DESC, COALESCE(published_at, created_at) DESC`;
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
    res.status(500).json({
      error: 'Failed to fetch posts',
      detail: e.message || String(e),
      code: e.code,
    });
  }
}

async function handlePost(req, res) {
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const body = getJsonBody(req);
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    const { title, slug, content, type, excerpt, cover_image, published, pinned } = body;
    if (!title || !content) {
      res.status(400).json({ error: 'title and content required' });
      return;
    }
    const postType = ['news', 'recipe', 'blog'].includes(type) ? type : 'news';
    const ex = String(excerpt || '').slice(0, 500);
    const baseSlug = deriveSlug(slug, title);
    let lastErr;
    for (let attempt = 0; attempt < 8; attempt++) {
      const s = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      try {
        const cov = String(cover_image || '').slice(0, 500);
        const pub = !!published;
        const publishedAt = pub ? new Date() : null;
        const r = await sql`INSERT INTO posts (title, slug, content, type, excerpt, cover_image, published, pinned, published_at) VALUES (${String(title).slice(0, 200)}, ${s}, ${content}, ${postType}, ${ex}, ${cov}, ${pub}, ${!!pinned}, ${publishedAt}) RETURNING *`;
        const row = r.rows[0];
        if (row && row.pinned) await clearOtherPinnedPosts(postType, row.id);
        res.status(201).json(row);
        return;
      } catch (e) {
        lastErr = e;
        if (e.code === '23505' && attempt < 7) continue;
        break;
      }
    }
    console.error(lastErr);
    res.status(500).json({
      error: 'Failed to create post',
      detail: (lastErr && (lastErr.message || String(lastErr))) || 'unknown',
      code: lastErr && lastErr.code,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Failed to create post',
      detail: e.message || String(e),
      code: e.code,
    });
  }
}

module.exports = async (req, res) => {
  await ensurePostsSchema();
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') {
    if (readCronSecretFromRequest(req)) {
      const authz = cronAuthResult(req);
      if (authz.ok) return require('../lib/cronIngestHandler')(req, res);
      if (authz.reason === 'not_configured') {
        return res.status(503).json({
          error: 'Server misconfiguration',
          detail: 'CRON_SECRET is not set in Vercel project env',
        });
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return handlePost(req, res);
  }
  res.status(405).json({ error: 'Method not allowed' });
};
