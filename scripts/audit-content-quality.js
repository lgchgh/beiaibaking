const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
} catch (e) {
  // dotenv is optional for deployed environments.
}

const ROOT = path.join(__dirname, '..');
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.json', '.css', '.md', '.txt']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel']);

function chars(...codes) {
  return codes.map((code) => String.fromCharCode(code)).join('|');
}

const PATTERNS = [
  { label: 'replacement character', regex: /\uFFFD/g },
  { label: 'UTF-8 mojibake quote/dash prefix', regex: new RegExp(chars(0x9225), 'g') },
  { label: 'UTF-8 mojibake arrow', regex: new RegExp(chars(0x922b), 'g') },
  { label: 'UTF-8 mojibake copyright', regex: new RegExp(chars(0x6f0f), 'g') },
  { label: 'UTF-8 mojibake emoji prefix', regex: new RegExp(chars(0x9983), 'g') },
  { label: 'common Chinese mojibake', regex: new RegExp(chars(0x951b, 0x6d93, 0x7039, 0x85c9, 0x9422, 0x7f01, 0x7af4, 0x95c4, 0x567a), 'g') },
];

function excerpt(value, index) {
  const text = String(value || '').replace(/\s+/g, ' ');
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + 75);
  return text.slice(start, end);
}

function scanText(label, value, issues) {
  const text = String(value || '');
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text))) {
      issues.push({
        label,
        pattern: pattern.label,
        excerpt: excerpt(text, match.index),
      });
      if (issues.length >= 200) return;
    }
  }
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

async function scanStaticFiles(issues) {
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      scanText(`${rel}:${index + 1}`, line, issues);
    });
  }
}

async function scanPosts(issues) {
  const conn = process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_DATABASE_URL
    || process.env.POSTGRES_DATABASE_URL
    || process.env.POSTGRES_URL_NON_POOLING;

  if (!conn) {
    console.log('Post scan skipped: no Postgres connection string configured.');
    return;
  }

  const { sql, pool } = require('../lib/db');
  const result = await sql`
    SELECT id, slug, title, excerpt, content
    FROM posts
    ORDER BY id DESC
  `;

  for (const post of result.rows) {
    scanText(`post ${post.id} ${post.slug} title`, post.title, issues);
    scanText(`post ${post.id} ${post.slug} excerpt`, post.excerpt, issues);
    scanText(`post ${post.id} ${post.slug} content`, post.content, issues);
  }

  await pool.end();
}

async function main() {
  const issues = [];
  await scanStaticFiles(issues);
  await scanPosts(issues);

  if (!issues.length) {
    console.log('No known mojibake markers found.');
    return;
  }

  console.log(`Found ${issues.length} possible content issue(s):`);
  for (const issue of issues) {
    console.log(`- ${issue.label}`);
    console.log(`  Pattern: ${issue.pattern}`);
    console.log(`  Excerpt: ${issue.excerpt}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
