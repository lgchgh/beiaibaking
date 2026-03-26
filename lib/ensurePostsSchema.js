/**
 * Idempotent: add columns missing on older DBs (same as api/init-db ALTERs).
 */
const { sql, pool } = require('./db');

let migratePromise = null;

async function ensurePostsSchema() {
  if (!pool) return;
  if (!migratePromise) {
    migratePromise = (async () => {
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'blog'`;
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false`;
    })()
      .catch((e) => {
        migratePromise = null;
        throw e;
      });
  }
  await migratePromise;
}

module.exports = { ensurePostsSchema };
