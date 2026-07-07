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
  { path: '/piped-cakes.html', changefreq: 'monthly', priority: '0.65' },
  { path: '/fondant-cakes.html', changefreq: 'monthly', priority: '0.65' },
  { path: '/french-pastries.html', changefreq: 'monthly', priority: '0.65' },
  { path: '/cookies.html', changefreq: 'monthly', priority: '0.65' },
  { path: '/privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms-of-use.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/copyright.html', changefreq: 'yearly', priority: '0.3' },
];

const GALLERY_IMAGE_PAGE_RULES = [
  { path: '/decorated-cakes.html', category: 'decorated' },
  { path: '/piped-cakes.html', category: 'decorated', subcategory: 'decorated-floral' },
  { path: '/fondant-cakes.html', category: 'fondant' },
  { path: '/french-pastries.html', category: 'french' },
  { path: '/cookies.html', category: 'cookies' },
];


function imageLoc(src) {
  const s = String(src || '').trim();
  if (!s || /^data:/i.test(s)) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return ORIGIN + (s[0] === '/' ? s : '/' + s);
}

function imageTagsForPage(path, galleryRows) {
  const out = [];
  const seen = new Set();
  function addImage(src, caption) {
    const loc = imageLoc(src);
    if (!loc || seen.has(loc)) return;
    seen.add(loc);
    out.push({ loc, caption: String(caption || '').trim() });
  }

  const rule = GALLERY_IMAGE_PAGE_RULES.find((r) => r.path === path);
  if (rule && Array.isArray(galleryRows)) {
    galleryRows.forEach((row) => {
      if (row.category !== rule.category) return;
      if (rule.subcategory && row.subcategory !== rule.subcategory) return;
      addImage(row.src, row.alt || row.caption);
    });
  }

  return out
    .slice(0, 1000)
    .map((img) => {
      let tag = `<image:image><image:loc>${xmlEsc(img.loc)}</image:loc>`;
      if (img.caption) tag += `<image:caption>${xmlEsc(img.caption)}</image:caption>`;
      tag += '</image:image>';
      return tag;
    })
    .join('');
}


function buildXml(postRows, galleryRows) {
  const rows = Array.isArray(postRows) ? postRows : [];
  let body = '<?xml version="1.0" encoding="UTF-8"?>\n';
  body += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
  for (const p of STATIC_PAGES) {
    const loc = p.path === '/' ? ORIGIN + '/' : ORIGIN + p.path;
    body += '  <url>';
    body += `<loc>${xmlEsc(loc)}</loc>`;
    body += `<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority>`;
    body += imageTagsForPage(p.path, galleryRows);
    body += '</url>\n';
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
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }

    let postRows = [];
    let galleryRows = [];
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

    try {
      const galleryR = await sql`
        SELECT category, subcategory, src, caption, alt
        FROM gallery_images
        WHERE src IS NOT NULL AND TRIM(BOTH FROM src::text) <> ''
        ORDER BY category, subcategory, sort_order, id
      `;
      galleryRows = galleryR.rows || [];
    } catch (e) {
      console.error('sitemap: skipping image URLs (database error)', e.message || e);
    }

    const body = buildXml(postRows, galleryRows);
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      });
      return res.end();
    }
    return sendXml(res, body);
  } catch (e) {
    console.error('sitemap: fatal, serving static URLs only', e.message || e);
    try {
      return sendXml(res, buildXml([], []));
    } catch (e2) {
      console.error('sitemap: fallback failed', e2.message || e2);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Sitemap error');
    }
  }
};
