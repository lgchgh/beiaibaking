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

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).type('text/plain').send('Method not allowed');
    return;
  }
  try {
    await ensurePostsSchema();
    const postsR = await sql`
      SELECT slug, type, updated_at, created_at
      FROM posts
      WHERE published = true AND slug IS NOT NULL AND TRIM(BOTH FROM slug::text) <> ''
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    `;
    const postRows = postsR.rows || [];
    let body = '<?xml version="1.0" encoding="UTF-8"?>\n';
    body += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const p of STATIC_PAGES) {
      const loc = p.path === '/' ? ORIGIN + '/' : ORIGIN + p.path;
      body += `  <url><loc>${xmlEsc(loc)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>\n`;
    }
    for (const row of postRows) {
      const slug = String(row.slug || '').trim();
      if (!slug) continue;
      const type = ['news', 'recipe', 'blog'].includes(String(row.type || '').toLowerCase())
        ? String(row.type).toLowerCase()
        : 'blog';
      const loc = `${ORIGIN}/post.html?slug=${encodeURIComponent(slug)}&type=${encodeURIComponent(type)}`;
      const ts = row.updated_at || row.created_at;
      const lastmod = ts ? new Date(ts).toISOString().slice(0, 10) : '';
      body += '  <url>';
      body += `<loc>${xmlEsc(loc)}</loc>`;
      if (lastmod) body += `<lastmod>${lastmod}</lastmod>`;
      body += '<changefreq>monthly</changefreq><priority>0.64</priority>';
      body += '</url>\n';
    }
    body += '</urlset>';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(body);
  } catch (e) {
    console.error(e);
    res.status(500).type('text/plain').send('Sitemap error');
  }
};
