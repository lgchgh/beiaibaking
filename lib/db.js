/**
 * PostgreSQL client compatible with Prisma Postgres and Vercel Postgres.
 * Uses standard pg package to support both pooled and direct connection strings.
 */
const { Pool } = require('pg');

const connStr = process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_DATABASE_URL
  || process.env.POSTGRES_DATABASE_URL
  || process.env.POSTGRES_URL_NON_POOLING;

function poolSsl() {
  if (!connStr || /localhost|127\.0\.0\.1/i.test(connStr)) return false;
  if (process.env.POSTGRES_SSL_STRICT === '1') return undefined;
  return { rejectUnauthorized: false };
}

const pool = connStr
  ? new Pool({
    connectionString: connStr,
    connectionTimeoutMillis: 25000,
    ssl: poolSsl(),
  })
  : null;

/**
 * Tagged template for parameterized queries. Usage: sql`SELECT * FROM t WHERE id = ${id}`
 */
function sql(strings, ...values) {
  if (!pool) throw new Error('No Postgres connection string configured');
  const text = strings.reduce((acc, part, i) => acc + (i > 0 ? '$' + i : '') + part, '');
  return pool.query(text, values);
}

module.exports = { sql, pool };
