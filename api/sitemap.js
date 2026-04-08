const { sql } = require('../lib/db');
const { ensurePostsSchema } = require('../lib/ensurePostsSchema');

const ORIGIN = (process.env.SITE_URL || 'https://www.beiaibaking.net').replace(/\/$/, '');

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeLastmod(ts) {
  if (ts == null || ts === '') return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/gallery.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/blog.html', changefreq: 'weekly', priority: '0.85' },
  { path: '/about.html', changefreq: 'monthly', priority: '0.8' },
  { path: '/contact.html', changefreq: 'monthly', priority: '0.75' },
  { path: '/decorated-cakes.html', changefreq: 'monthly', priority: '0.65' },
  { path: '/privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms-of-use.html', changefreq: 'yearly', priority: '0.3' },
];

function buildXml(postRows) {
  const rows = Array.isArray(postRows) ? postRows : [];
  let body = '<?xml version="1.0" encoding="UTF-8"?>\n';
  body += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const p of STATIC_PAGES) {
    const loc = p.path === '/' ? ORIGIN + '/' : ORIGIN + p.path;
    body += `  <url><loc>${xmlEsc(loc)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>\n`;
  }
  for (const row of rows) {
    const slug = String(row.slug || '').trim();
    if (!slug) continue;
    const type = ['news', 'recipe', 'blog'].includes(String(row.type || '').toLowerCase())
      ? String(row.type).toLowerCase()
      : 'blog';
    const loc = `${ORIGIN}/post.html?slug=${encodeURIComponent(slug)}&type=${encodeURIComponent(type)}`;
    const ts = row.published_at || row.updated_at || row.created_at;
    const lastmod = safeLastmod(ts);
    body += '  <url>';
    body += `<loc>${xmlEsc(loc)}</loc>`;
    if (lastmod) body += `<lastmod>${lastmod}</lastmod>`;
    body += '<changefreq>monthly</changefreq><priority>0.64</priority>';
    body += '</url>\n';
  }
  body += '</urlset>';
  return body;
}

function sendXml(res, body) {
  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
  return res.end(body);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }

    let postRows = [];
    try {
      await ensurePostsSchema();
      const postsR = await sql`
      SELECT slug, type, updated_at, created_at, published_at
      FROM posts
      WHERE published = true AND slug IS NOT NULL AND TRIM(BOTH FROM slug::text) <> ''
      ORDER BY COALESCE(published_at, updated_at) DESC NULLS LAST, created_at DESC
    `;
      postRows = postsR.rows || [];
    } catch (e) {
      console.error('sitemap: skipping post URLs (database error), static pages only', e.message || e);
    }

    return sendXml(res, buildXml(postRows));
  } catch (e) {
    console.error('sitemap: fatal, serving static URLs only', e.message || e);
    try {
      return sendXml(res, buildXml([]));
    } catch (e2) {
      console.error('sitemap: fallback failed', e2.message || e2);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Sitemap error');
    }
  }
};
