/**
 * Local init: npx vercel env pull .env.local && npm install && node scripts/init-db.js
 * Or use: GET /api/init-db?secret=YOUR_INIT_SECRET (after deploy)
 */
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
const { sql } = require('../lib/db');

async function init() {
  try {
    await sql`SELECT 1`;
  } catch (e) {
    console.error('Database not configured. Run: npx vercel link && npx vercel env pull .env.local');
    process.exit(1);
  }
  await sql`CREATE TABLE IF NOT EXISTS gallery_images (id SERIAL PRIMARY KEY, category VARCHAR(50) NOT NULL, subcategory VARCHAR(50) NOT NULL, src VARCHAR(500) NOT NULL, caption VARCHAR(200) NOT NULL, alt VARCHAR(200), sort_order INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, slug VARCHAR(200) UNIQUE NOT NULL, content TEXT NOT NULL, excerpt VARCHAR(500), cover_image VARCHAR(500), published BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`;
  const { rows } = await sql`SELECT COUNT(*) as c FROM gallery_images`;
  if (parseInt(rows[0]?.c || 0) === 0) {
    const seed = [['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-01.jpg','Floral cake 1'],['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-02.jpg','Floral cake 2'],['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-03.jpg','Floral cake 3'],['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-04.jpg','Floral cake 4'],['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-01.jpg','Animal cake 1'],['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-02.jpg','Animal cake 2'],['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-03.jpg','Animal cake 3'],['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-04.jpg','Animal cake 4'],['decorated','decorated-character','assets/images/decorated-cakes/character/c-01.jpg','Character cake 1'],['decorated','decorated-character','assets/images/decorated-cakes/character/c-02.jpg','Character cake 2'],['decorated','decorated-character','assets/images/decorated-cakes/character/c-03.jpg','Character cake 3'],['decorated','decorated-character','assets/images/decorated-cakes/character/c-04.jpg','Character cake 4'],['fondant','fondant','assets/images/fondant-cakes/fon-01.jpg','Elegant fondant cake'],['fondant','fondant','assets/images/fondant-cakes/fon-02.jpg','Character fondant cake'],['fondant','fondant','assets/images/fondant-cakes/fon-03.jpg','Minimal fondant design'],['fondant','fondant','assets/images/fondant-cakes/fon-04.jpg','White & gold cake'],['french','french','assets/images/french-pastries/fp-01.jpg','Macarons'],['french','french','assets/images/french-pastries/fp-02.jpg','Éclairs'],['french','french','assets/images/french-pastries/fp-03.jpg','Entremets'],['french','french','assets/images/french-pastries/fp-04.jpg','Tarts'],['cookies','cookies','assets/images/iced-cookies/ic-01.jpg','Iced cookies'],['cookies','cookies','assets/images/iced-cookies/ic-02.jpg','Holiday cookies'],['cookies','cookies','assets/images/iced-cookies/ic-03.jpg','Butter cookies'],['cookies','cookies','assets/images/iced-cookies/ic-04.jpg','Gift box set']];
    for (let i = 0; i < seed.length; i++) {
      await sql`INSERT INTO gallery_images (category, subcategory, src, caption, alt, sort_order) VALUES (${seed[i][0]}, ${seed[i][1]}, ${seed[i][2]}, ${seed[i][3]}, ${seed[i][3]}, ${i})`;
    }
    console.log('Seeded', seed.length, 'gallery images');
  }
  console.log('Database initialized.');
}

init().catch(e => { console.error(e); process.exit(1); });
