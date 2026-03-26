/**
 * URL slug for posts: ASCII from title, or fallback when title is non-Latin.
 */
function deriveSlug(slugInput, title) {
  let s = (slugInput || '').trim();
  if (!s || /^auto-generated$/i.test(s)) {
    s = String(title || '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
  if (!s) {
    s = 'post-' + Date.now();
  }
  return s.slice(0, 200);
}

module.exports = { deriveSlug };
