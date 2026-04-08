/**
 * GitHub Actions cron：校验 CRON_SECRET 后将 AI 文章批量写入 posts（由 /api/posts POST 调用）。
 */

const { sql } = require('./db');
const { ensurePostsSchema } = require('./ensurePostsSchema');
const { getJsonBody } = require('./parseBody');
const { cronAuthResult } = require('./cronAuth');

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

function deriveIngestSlug(title, date) {
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

module.exports = async function cronIngestHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authz = cronAuthResult(req);
  if (!authz.ok) {
    if (authz.reason === 'not_configured') {
      return res.status(503).json({
        error: 'Server misconfiguration',
        detail: 'CRON_SECRET is not set in Vercel project env',
      });
    }
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

    const items = Array.isArray(body) ? body : [body];
    const results = { inserted: 0, skipped: 0, errors: [] };

    for (const post of items) {
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
      const scheduledRaw = post.scheduled_publish_at;
      let scheduledAt = null;
      if (scheduledRaw != null && String(scheduledRaw).trim() !== '') {
        const d = new Date(scheduledRaw);
        if (!Number.isNaN(d.getTime())) scheduledAt = d;
      }
      const wantsScheduled = scheduledAt != null;
      const explicitPub = post.published;
      let publishedFlag = true;
      if (wantsScheduled) publishedFlag = false;
      else if (explicitPub === false) publishedFlag = false;

      if (await titleExists(title)) {
        results.skipped++;
        results.errors.push({ title, reasons: ['duplicate title, skipped'] });
        continue;
      }

      let slug = deriveIngestSlug(title, publishedDate);
      let attempt = 0;
      while (await slugExists(slug) && attempt < 8) {
        attempt++;
        slug = deriveIngestSlug(title, publishedDate) + '-' + attempt;
      }

      try {
        const now = new Date();
        const createdAt = wantsScheduled ? now : (publishedDate ? new Date(publishedDate) : now);
        const publishedAtVal = publishedFlag && !wantsScheduled
          ? (publishedDate ? new Date(publishedDate) : createdAt)
          : null;

        await sql`
          INSERT INTO posts (
            title, slug, content, type, excerpt, cover_image, published, pinned,
            created_at, updated_at, scheduled_publish_at, published_at,
            schedule_abandoned, scheduled_publish_fail_count
          )
          VALUES (
            ${title},
            ${slug},
            ${content},
            ${type},
            ${excerpt},
            ${coverImage},
            ${publishedFlag},
            false,
            ${createdAt},
            ${now},
            ${wantsScheduled ? scheduledAt : null},
            ${publishedAtVal},
            false,
            0
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
