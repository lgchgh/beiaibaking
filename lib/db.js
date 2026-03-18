/**
 * PostgreSQL client compatible with Prisma Postgres and Vercel Postgres.
 * Uses standard pg package to support both pooled and direct connection strings.
 */
const { Pool } = require('pg');

const connStr = process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_DATABASE_URL
  || process.env.POSTGRES_DATABASE_URL;

const pool = connStr ? new Pool({ connectionString: connStr }) : null;

/**
 * Tagged template for parameterized queries. Usage: sql`SELECT * FROM t WHERE id = ${id}`
 */
function sql(strings, ...values) {
  if (!pool) throw new Error('No Postgres connection string configured');
  const text = strings.reduce((acc, part, i) => acc + (i > 0 ? '$' + i : '') + part, '');
  return pool.query(text, values);
}

module.exports = { sql, pool };
