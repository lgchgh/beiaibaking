/**
 * Idempotent DDL for older DBs. Uses a short-lived direct connection — Prisma/Vercel
 * pooled URLs ("upstream") often fail for ALTER; prefer POSTGRES_URL_NON_POOLING when set.
 */
const { Client } = require('pg');

function migrateConnectionString() {
  return (
    process.env.POSTGRES_URL_NON_POOLING
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_DATABASE_URL
    || process.env.POSTGRES_DATABASE_URL
    || null
  );
}

let migratePromise = null;

async function ensurePostsSchema() {
  const url = migrateConnectionString();
  if (!url) return;

  if (!migratePromise) {
    migratePromise = (async () => {
      const client = new Client({
        connectionString: url,
        connectionTimeoutMillis: 20000,
      });
      try {
        await client.connect();
        await client.query(
          "ALTER TABLE posts ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'blog'"
        );
        await client.query(
          'ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false'
        );
      } finally {
        await client.end().catch(() => {});
      }
    })().catch((e) => {
      migratePromise = null;
      throw e;
    });
  }

  await migratePromise;
}

module.exports = { ensurePostsSchema };
