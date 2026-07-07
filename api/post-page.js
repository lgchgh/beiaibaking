const fs = require('fs');
const path = require('path');
const { sql } = require('../lib/db');
const { ensurePostsSchema } = require('../lib/ensurePostsSchema');

const ORIGIN = (process.env.SITE_URL || 'https://www.beiaibaking.net').replace(/\/$/, '');
const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'post.html');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 3).trimEnd() + '...';
}

function repairMojibakeText(value) {
  return String(value || '')
    .replace(/\u9225\u650A/g, '-i')
    .replace(/\u9225\u6503/g, '-c');
}

function validType(value) {
  const type = String(value || '').toLowerCase();
  return ['news', 'recipe', 'blog'].includes(type) ? type : 'blog';
}

function absoluteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return `${ORIGIN}/assets/images/logo.png`;
  try {
    return new URL(raw, `${ORIGIN}/`).href;
  } catch (e) {
    return `${ORIGIN}/assets/images/logo.png`;
  }
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function replaceMeta(html, post) {
  const type = validType(post.type);
  const slug = String(post.slug || '').trim();
  const pageUrl = `${ORIGIN}/post.html?slug=${encodeURIComponent(slug)}&type=${encodeURIComponent(type)}`;
  const title = repairMojibakeText(post.title || 'Post').trim();
  const fullTitle = `${title} | Beiai Baking`;
  const content = repairMojibakeText(post.content || '');
  const excerpt = repairMojibakeText(post.excerpt || '');
  const description = truncateText(excerpt || stripHtml(content), 160) || `Read this post on Beiai Baking: ${title}.`;
  const image = absoluteUrl(post.cover_image);
  const published = post.published_at || post.created_at || '';
  const modified = post.updated_at || published;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: 'Beiai Baking',
        url: `${ORIGIN}/`,
        logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/images/logo.png` },
      },
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#website`,
        name: 'Beiai Baking',
        url: `${ORIGIN}/`,
        inLanguage: 'en',
      },
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: fullTitle,
        description,
        isPartOf: { '@id': `${ORIGIN}/#website` },
        about: { '@id': `${ORIGIN}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Share', item: `${ORIGIN}/blog.html` },
          { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
        ],
      },
      {
        '@type': 'Article',
        '@id': `${pageUrl}#article`,
        headline: title,
        description,
        datePublished: published || undefined,
        dateModified: modified || undefined,
        author: { '@type': 'Organization', name: 'Beiai Baking' },
        publisher: {
          '@type': 'Organization',
          name: 'Beiai Baking',
          logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/images/logo.png` },
        },
        mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
        image,
      },
    ],
  };

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(fullTitle)}</title>`)
    .replace(/<meta name="description"[^>]*>/i, `<meta name="description" id="seo-meta-description" content="${escapeHtml(description)}" />`)
    .replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" id="seo-canonical" href="${escapeHtml(pageUrl)}" />`)
    .replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`)
    .replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`)
    .replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${escapeHtml(image)}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`)
    .replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${escapeHtml(image)}" />`)
    .replace(/<p id="postLoading">Loading\.\.\.<\/p>/i, '<p id="postLoading" style="display:none">Loading...</p>')
    .replace(/<div id="postContent" style="display:none">/i, '<div id="postContent">')
    .replace(/<h1 id="postTitle"><\/h1>/i, `<h1 id="postTitle">${escapeHtml(title)}</h1>`)
    .replace(/<p class="post-date" id="postDate"><\/p>/i, `<p class="post-date" id="postDate">${escapeHtml(formatDate(published))}</p>`)
    .replace(/<div class="post-body" id="postBody"><\/div>/i, `<div class="post-body" id="postBody">${content}</div>`);

  out = out.replace(
    /<\/head>/i,
    `<script type="application/ld+json" id="seo-page-jsonld">${JSON.stringify(jsonLd)}</script>\n</head>`
  );
  return out;
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, must-revalidate',
  });
  return res.end(html);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const id = req.query?.id;
  const slug = req.query?.slug;
  if (!id && !slug) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end();
    }
    return sendHtml(res, 200, template);
  }

  try {
    await ensurePostsSchema();
    let result;
    const numId = Number.parseInt(id, 10);
    if (id && !Number.isNaN(numId)) {
      result = await sql`SELECT * FROM posts WHERE id = ${numId} AND published = true`;
    } else {
      result = await sql`SELECT * FROM posts WHERE slug = ${slug || id} AND published = true`;
    }
    const post = result.rows?.[0];
    if (!post) {
      const notFound = template
        .replace(/<title>[\s\S]*?<\/title>/i, '<title>Post not found | Beiai Baking</title>')
        .replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex, follow" />');
      return sendHtml(res, 404, notFound);
    }
    const html = replaceMeta(template, post);
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      });
      return res.end();
    }
    return sendHtml(res, 200, html);
  } catch (e) {
    console.error('post-page render failed', e);
    return sendHtml(res, 200, template);
  }
};
