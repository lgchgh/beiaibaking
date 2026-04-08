const auth = require('../../lib/auth');
const { sql } = require('../../lib/db');
const { deriveSlug } = require('../../lib/postSlug');
const { getJsonBody } = require('../../lib/parseBody');
const { ensurePostsSchema } = require('../../lib/ensurePostsSchema');
const { clearOtherPinnedPosts } = require('../../lib/uniquePinned');

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
    const body = getJsonBody(req);
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    const numId = parseInt(id);
    const cur = await sql`SELECT * FROM posts WHERE id = ${numId}`;
    if (!cur.rows?.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const row = cur.rows[0];
    const title = String(body.title ?? row.title).slice(0, 200);
    const slug = body.slug !== undefined ? deriveSlug(body.slug, title) : row.slug;
    const content = body.content ?? row.content;
    const typeVal = body.type !== undefined ? (['news', 'recipe', 'blog'].includes(body.type) ? body.type : (row.type || 'news')) : (row.type || 'news');
    const excerpt = String(body.excerpt ?? row.excerpt ?? '').slice(0, 500);
    const cover_image = String(body.cover_image ?? row.cover_image ?? '').slice(0, 500);
    const published = body.published !== undefined ? !!body.published : row.published;
    const pinned = body.pinned !== undefined ? !!body.pinned : !!row.pinned;
    const turningOn = published && !row.published;
    const r = turningOn
      ? await sql`
          UPDATE posts SET
            title=${title}, slug=${slug}, content=${content}, type=${typeVal}, excerpt=${excerpt}, cover_image=${cover_image},
            published=${published}, pinned=${pinned}, updated_at=NOW(),
            published_at=COALESCE(published_at, NOW()),
            scheduled_publish_at=NULL, schedule_abandoned=false, scheduled_publish_fail_count=0
          WHERE id = ${numId} RETURNING *`
      : await sql`UPDATE posts SET title=${title}, slug=${slug}, content=${content}, type=${typeVal}, excerpt=${excerpt}, cover_image=${cover_image}, published=${published}, pinned=${pinned}, updated_at=NOW() WHERE id = ${numId} RETURNING *`;
    const updated = r.rows[0];
    if (updated && updated.pinned) await clearOtherPinnedPosts(typeVal, numId);
    res.status(200).json(updated || {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update', detail: e.message || String(e), code: e.code });
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
  await ensurePostsSchema();
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
