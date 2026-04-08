/**
 * Idempotent DDL for older posts tables. Tries several env URLs; TLS for serverless Postgres.
 * Non-fatal: logs on failure; uses in-flight lock so concurrent requests wait for one migrate pass.
 */
const { Client } = require('pg');

function sslForConnection(url) {
  if (!url || /localhost|127\.0\.0\.1/i.test(url)) return false;
  if (process.env.POSTGRES_SSL_STRICT === '1') return undefined;
  return { rejectUnauthorized: false };
}

function candidateUrls() {
  const keys = [
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_DATABASE_URL',
    'POSTGRES_DATABASE_URL',
  ];
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    const v = process.env[k];
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

let migrateOk = false;
let migrateInFlight = null;

async function ensurePostsSchema() {
  if (migrateOk) return;
  if (migrateInFlight) {
    await migrateInFlight;
    return;
  }

  migrateInFlight = (async () => {
    const urls = candidateUrls();
    if (!urls.length) return;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const client = new Client({
        connectionString: url,
        connectionTimeoutMillis: 25000,
        ssl: sslForConnection(url),
      });
      try {
        await client.connect();
        await client.query(
          "ALTER TABLE posts ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'blog'"
        );
        await client.query(
          'ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false'
        );
        await client.query(
          'ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ'
        );
        await client.query(
          'ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ'
        );
        await client.query(
          'ALTER TABLE posts ADD COLUMN IF NOT EXISTS schedule_abandoned BOOLEAN DEFAULT false'
        );
        await client.query(
          'ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_publish_fail_count INT DEFAULT 0'
        );
        try {
          const { dedupePinnedPosts } = require('./uniquePinned');
          await dedupePinnedPosts();
        } catch (e) {
          console.error('dedupePinnedPosts', e.message || e);
        }
        migrateOk = true;
        return;
      } catch (e) {
        console.error(
          'ensurePostsSchema attempt',
          i + 1,
          '/',
          urls.length,
          e.message || e
        );
      } finally {
        await client.end().catch(() => {});
      }
    }
    console.error(
      'ensurePostsSchema: all URLs failed (fix Vercel Postgres env or run init-db when DB is reachable).'
    );
  })();

  try {
    await migrateInFlight;
  } finally {
    migrateInFlight = null;
  }
}

module.exports = { ensurePostsSchema };
