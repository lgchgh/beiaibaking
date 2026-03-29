/**
 * POST /api/ingest
 *
 * GitHub Actions → AI 生成文章写入数据库（原 /api/auto-generate-receiver）。
 * 鉴权：x-cron-secret + 频率与内容校验。
 */

const { sql } = require('../lib/db');
const { ensurePostsSchema } = require('../lib/ensurePostsSchema');
const { getJsonBody } = require('../lib/parseBody');

const ALLOWED_TYPES = ['news', 'recipe', 'blog'];
const MIN_CONTENT_LENGTH = 100;
const MAX_POSTS_PER_HOUR = 40;

async function getRateLimitCount() {
  const result = await sql`
    SELECT COUNT(*) as count FROM posts
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `;
  return parseInt(result.rows[0]?.count || '0', 10);
}

async function slugExists(slug) {
  const result = await sql`
    SELECT id FROM posts WHERE slug = ${slug} LIMIT 1
  `;
  return result.rows.length > 0;
}

async function titleExists(title) {
  const result = await sql`
    SELECT id FROM posts WHERE LOWER(title) = LOWER(${title}) LIMIT 1
  `;
  return result.rows.length > 0;
}

function deriveSlug(title, date) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 160);
  const suffix = date ? '-' + String(date).slice(0, 7) : '';
  return (base + suffix).slice(0, 200);
}

function validatePost(post) {
  const errors = [];
  if (!post.title || String(post.title).trim().length === 0) {
    errors.push('title is required');
  }
  if (!post.content || String(post.content).trim().length < MIN_CONTENT_LENGTH) {
    errors.push(`content must be at least ${MIN_CONTENT_LENGTH} characters`);
  }
  if (!ALLOWED_TYPES.includes(post.type)) {
    errors.push(`type must be one of: ${ALLOWED_TYPES.join(', ')}`);
  }
  return errors;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await ensurePostsSchema();

    const recentCount = await getRateLimitCount();
    if (recentCount >= MAX_POSTS_PER_HOUR) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        detail: `Max ${MAX_POSTS_PER_HOUR} posts per hour. Current: ${recentCount}`,
      });
    }

    const body = getJsonBody(req);
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const posts = Array.isArray(body) ? body : [body];
    const results = { inserted: 0, skipped: 0, errors: [] };

    for (const post of posts) {
      const validationErrors = validatePost(post);
      if (validationErrors.length > 0) {
        results.skipped++;
        results.errors.push({ title: post.title || '(no title)', reasons: validationErrors });
        continue;
      }

      const title = String(post.title).trim().slice(0, 200);
      const content = String(post.content).trim();
      const type = post.type;
      const excerpt = String(post.excerpt || '').slice(0, 500);
      const coverImage = String(post.cover_image || '').slice(0, 500);
      const publishedDate = post.published_date || null;

      if (await titleExists(title)) {
        results.skipped++;
        results.errors.push({ title, reasons: ['duplicate title, skipped'] });
        continue;
      }

      let slug = deriveSlug(title, publishedDate);
      let attempt = 0;
      while (await slugExists(slug) && attempt < 8) {
        attempt++;
        slug = deriveSlug(title, publishedDate) + '-' + attempt;
      }

      try {
        const createdAt = publishedDate ? new Date(publishedDate) : new Date();
        await sql`
          INSERT INTO posts (title, slug, content, type, excerpt, cover_image, published, pinned, created_at, updated_at)
          VALUES (
            ${title},
            ${slug},
            ${content},
            ${type},
            ${excerpt},
            ${coverImage},
            true,
            false,
            ${createdAt},
            ${createdAt}
          )
        `;
        results.inserted++;
      } catch (e) {
        results.skipped++;
        results.errors.push({ title, reasons: [e.message || String(e)] });
      }
    }

    return res.status(200).json({
      success: true,
      inserted: results.inserted,
      skipped: results.skipped,
      errors: results.errors,
    });
  } catch (e) {
    console.error('[cron-ingest] error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      detail: e.message || String(e),
    });
  }
};
