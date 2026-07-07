try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
const { buildGalleryAlt, shouldBackfillGalleryAlt } = require('../lib/galleryAlt');
const { sql } = require('../lib/db');

async function main() {
  try {
    await sql`SELECT 1`;
  } catch (e) {
    console.error('Database not configured. Run: npx vercel link && npx vercel env pull .env.local');
    process.exit(1);
  }

  const { rows } = await sql`SELECT id, category, subcategory, src, caption, alt FROM gallery_images ORDER BY id`;
  let updated = 0;

  for (const row of rows || []) {
    if (!shouldBackfillGalleryAlt(row)) continue;
    const alt = buildGalleryAlt(row);
    await sql`UPDATE gallery_images SET alt = ${alt} WHERE id = ${row.id}`;
    updated++;
    console.log('Updated', row.id, '->', alt);
  }

  console.log('Done. Updated', updated, 'of', (rows || []).length, 'rows.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
