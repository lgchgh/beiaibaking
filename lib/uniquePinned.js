const { sql } = require('./db');

const SHARE_TYPES = ['news', 'recipe', 'blog'];

/**
 * Clears pinned on all other posts of the same type so at most one is pinned per category.
 */
async function clearOtherPinnedPosts(postType, keepId) {
  const id = parseInt(keepId, 10);
  if (!postType || !SHARE_TYPES.includes(postType) || Number.isNaN(id)) return;
  await sql`UPDATE posts SET pinned = false WHERE type = ${postType} AND id <> ${id}`;
}

/** Keeps the newest pinned post per type; clears duplicate pins (idempotent). */
async function dedupePinnedPosts() {
  await sql`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY type
          ORDER BY created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM posts
      WHERE pinned = true AND type IN ('news', 'recipe', 'blog')
    )
    UPDATE posts p SET pinned = false
    FROM ranked r
    WHERE p.id = r.id AND r.rn > 1
  `;
}

module.exports = { clearOtherPinnedPosts, dedupePinnedPosts, SHARE_TYPES };
