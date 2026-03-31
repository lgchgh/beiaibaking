-- Run this in Vercel Dashboard: Storage > Postgres > Query
-- Or run: npx vercel env pull .env.local && node scripts/init-db.js

CREATE TABLE IF NOT EXISTS gallery_images (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  subcategory VARCHAR(50) NOT NULL,
  src TEXT NOT NULL,
  caption VARCHAR(200) NOT NULL,
  alt VARCHAR(200),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(500),
  cover_image VARCHAR(500),
  published BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_category ON gallery_images(category);
CREATE INDEX IF NOT EXISTS idx_gallery_sub ON gallery_images(subcategory);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
