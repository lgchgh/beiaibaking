/**
 * One-time DB init. Call: GET /api/init-db?secret=YOUR_INIT_SECRET
 * Set INIT_SECRET in Vercel env. After init, remove or change the secret.
 */
const { sql } = require('../lib/db');

const HOME_INTRO_MAIN_DEFAULT = "Hi, I'm Nova.\n\nMy baking journey began with a simple cookie for my children and evolved into a global pursuit of mastery. From studying in Paris and Seoul to being featured on national TV, I've dedicated my life to inspiring others through the art of baking. I invite you to join me on this wonderful adventure.";

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const secret = process.env.INIT_SECRET;
  if (!secret || req.query?.secret !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    await sql`CREATE TABLE IF NOT EXISTS gallery_images (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL,
      subcategory VARCHAR(50) NOT NULL,
      src VARCHAR(500) NOT NULL,
      caption VARCHAR(200) NOT NULL,
      alt VARCHAR(200),
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(200) UNIQUE NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'blog',
      excerpt VARCHAR(500),
      cover_image VARCHAR(500),
      published BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'blog'`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false`;
    await sql`CREATE TABLE IF NOT EXISTS site_content (
      page VARCHAR(50) NOT NULL,
      key VARCHAR(100) NOT NULL,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (page, key)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS visitor_logs (
      id SERIAL PRIMARY KEY,
      page VARCHAR(100),
      referrer VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    const { rows } = await sql`SELECT COUNT(*) as c FROM gallery_images`;
    if (parseInt(rows[0]?.c || 0) === 0) {
      const seed = [
        ['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-01.jpg','Floral cake 1'],
        ['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-02.jpg','Floral cake 2'],
        ['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-03.jpg','Floral cake 3'],
        ['decorated','decorated-floral','assets/images/decorated-cakes/floral/f-04.jpg','Floral cake 4'],
        ['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-01.jpg','Animal cake 1'],
        ['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-02.jpg','Animal cake 2'],
        ['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-03.jpg','Animal cake 3'],
        ['decorated','decorated-animal','assets/images/decorated-cakes/animal/a-04.jpg','Animal cake 4'],
        ['decorated','decorated-character','assets/images/decorated-cakes/character/c-01.jpg','Character cake 1'],
        ['decorated','decorated-character','assets/images/decorated-cakes/character/c-02.jpg','Character cake 2'],
        ['decorated','decorated-character','assets/images/decorated-cakes/character/c-03.jpg','Character cake 3'],
        ['decorated','decorated-character','assets/images/decorated-cakes/character/c-04.jpg','Character cake 4'],
        ['fondant','wedding','assets/images/fondant-cakes/fon-01.jpg','Wedding fondant cake'],
        ['fondant','wedding','assets/images/fondant-cakes/fon-03.jpg','Elegant wedding cake'],
        ['fondant','wedding','assets/images/fondant-cakes/fon-04.jpg','White & gold wedding cake'],
        ['fondant','character','assets/images/fondant-cakes/fon-02.jpg','Character fondant cake'],
        ['french','mirror','assets/images/french-pastries/fp-03.jpg','Mirror glaze cake'],
        ['french','macarons','assets/images/french-pastries/fp-01.jpg','Macarons'],
        ['french','assorted','assets/images/french-pastries/fp-02.jpg','Éclairs'],
        ['french','assorted','assets/images/french-pastries/fp-04.jpg','Tarts'],
        ['cookies','cookies','assets/images/iced-cookies/ic-01.jpg','Iced cookies'],
        ['cookies','cookies','assets/images/iced-cookies/ic-02.jpg','Holiday cookies'],
        ['cookies','cookies','assets/images/iced-cookies/ic-03.jpg','Butter cookies'],
        ['cookies','cookies','assets/images/iced-cookies/ic-04.jpg','Gift box set'],
      ];
      for (let i = 0; i < seed.length; i++) {
        const [cat, sub, src, cap] = seed[i];
        await sql`INSERT INTO gallery_images (category, subcategory, src, caption, alt, sort_order) VALUES (${cat}, ${sub}, ${src}, ${cap}, ${cap}, ${i})`;
      }
    }
    const { rows: scRows } = await sql`SELECT COUNT(*) as c FROM site_content`;
    if (parseInt(scRows?.[0]?.c || 0) === 0) {
      const defaults = [
        ['home','hero_tagline','Where flavor meets art.'],
        ['home','intro_photo',''],
        ['home','intro_main', HOME_INTRO_MAIN_DEFAULT],
        ['home','cat_decorated','Decorated Cakes'],
        ['home','cat_fondant','Fondant Cakes'],
        ['home','cat_french','French Pastries'],
        ['home','cat_cookies','Iced Cookies'],
        ['about','hero_title','About Beiai Baking'],
        ['about','story_title','Our Story'],
        ['about','story_content',"Hi, I'm Nova. As a mother of three, my journey from a home baking enthusiast to a full-time professional instructor has been a path filled with unexpected joy.\n\nIt all began between 2001 and 2011. Driven by the simple desire to provide variety for my children's meals, I started following videos to bake simple cakes and cookies. What started as a parenting necessity soon sparked a deep passion. I found myself creating birthday cakes for friends and family, and as my curiosity grew, so did my ambition to master the craft.\n\nIn 2012, I decided to take my skills to the next level. My pursuit of excellence led me to Paris, France, to study classical pastry arts, followed by a journey to Seoul, South Korea, to master the latest trends in Korean flower piping. Two years later, I became a certified Wilton instructor, officially launching my professional career.\n\nSince 2014, I have had the privilege of teaching over 10,000 students. My work and journey have been featured on national television and captured in a personal documentary, aimed at inspiring homemakers to discover their own passions and careers.\n\nI am profoundly grateful to my family and friends—their support has shaped who I am today. Baking is a journey of endless surprises; through this website, I hope to share that energy with you. I invite you to join me on this wonderful baking adventure!"],
        ['contact','title','Send Us a Message'],
        ['site','site_email','admin@beiaibaking.net'],
        ['site','site_email_label',''],
        ['site','site_instagram',''],
        ['site','site_pinterest',''],
        ['site','site_youtube',''],
        ['site','site_nav_show_youtube','1'],
        ['site','site_nav_show_pinterest','1'],
        ['site','site_nav_show_instagram','1'],
        ['privacy','content','<h1>Privacy Policy</h1><p class="legal-updated">Last updated: 2026</p><h2>1. Introduction</h2><p>Beiai Baking (“we”, “our”, or “us”) operates this website. This Privacy Policy explains how we collect, use, and protect information when you visit our site.</p><h2>2. Information We Collect</h2><p>We may collect information you provide directly, such as when you contact us through our <a href="contact.html">Contact page</a>. This may include your name, email address, and the content of your message. We do not sell your personal information to third parties.</p><h2>3. Automatically Collected Information</h2><p>When you visit our website, we or our hosting and analytics providers may collect certain information automatically, such as your IP address, browser type, device type, and pages visited. This helps us improve the site and understand how visitors use it.</p><h2>4. Cookies and Similar Technologies</h2><p>We may use cookies and similar technologies to improve your experience and for analytics. You can adjust your browser settings to refuse or limit cookies.</p><h2>5. How We Use Your Information</h2><p>We use the information we collect to respond to your enquiries, improve our website, and comply with applicable law. We do not use your data for marketing unless you have given consent.</p><h2>6. Data Security</h2><p>We take reasonable steps to protect your personal information from unauthorised access, loss, or misuse. No method of transmission over the internet is completely secure.</p><h2>7. Third-Party Links</h2><p>Our website may contain links to third-party sites (e.g. social media). We are not responsible for the privacy practices of those sites. We encourage you to read their privacy policies.</p><h2>8. Your Rights</h2><p>Depending on where you live, you may have the right to access, correct, or delete your personal data, or to object to or restrict certain processing. To exercise these rights or ask questions about this policy, please <a href="contact.html">contact us</a>.</p><h2>9. Changes to This Policy</h2><p>We may update this Privacy Policy from time to time. The “Last updated” date at the top will be revised when changes are made. Continued use of the site after changes constitutes acceptance of the updated policy.</p><h2>10. Contact</h2><p>For any questions about this Privacy Policy, please <a href="contact.html">contact us</a>.</p>'],
        ['terms','content','<h1>Terms of Use</h1><p class="legal-updated">Last updated: 2026</p><h2>1. Acceptance of Terms</h2><p>By accessing or using the Beiai Baking website, you agree to be bound by these Terms of Use. If you do not agree, please do not use this site.</p><h2>2. Use of the Website</h2><p>You may use this website for lawful purposes only. You must not use it in any way that is unlawful, harmful, or that could damage, disable, or impair the site or any third party. You may not attempt to gain unauthorised access to any part of the site, other accounts, or systems connected to the site.</p><h2>3. Intellectual Property</h2><p>All content on this website, including but not limited to text, images, graphics, logos, and photographs, is the property of Beiai Baking or its licensors and is protected by copyright and other intellectual property laws. You may not copy, reproduce, distribute, or create derivative works from any content without our prior written permission, except for personal, non-commercial viewing.</p><h2>4. Portfolio and Images</h2><p>The cake and pastry images displayed in our gallery are for portfolio and promotional purposes. They may not be downloaded, reproduced, or used for commercial purposes without our consent.</p><h2>5. Accuracy of Information</h2><p>We strive to keep the information on this website accurate and up to date, but we do not warrant that all content is complete, current, or error-free. We may change or remove content at any time without notice.</p><h2>6. Third-Party Links</h2><p>This website may contain links to third-party websites. We are not responsible for the content, privacy practices, or availability of those sites. Links do not imply endorsement.</p><h2>7. Disclaimer of Warranties</h2><p>This website is provided “as is” and “as available” without warranties of any kind, either express or implied. We do not warrant that the site will be uninterrupted, secure, or free of errors or harmful components.</p><h2>8. Limitation of Liability</h2><p>To the fullest extent permitted by law, Beiai Baking and its operators shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of or inability to use this website, including loss of data or profits.</p><h2>9. Indemnification</h2><p>You agree to indemnify and hold harmless Beiai Baking and its operators from any claims, damages, or expenses (including reasonable legal fees) arising from your use of the website or your breach of these Terms.</p><h2>10. Changes to These Terms</h2><p>We may update these Terms of Use from time to time. The “Last updated” date at the top will be revised when changes are made. Your continued use of the site after changes constitutes acceptance of the updated terms.</p><h2>11. Contact</h2><p>For questions about these Terms of Use, please <a href="contact.html">contact us</a>.</p>'],
      ];
      for (const [p,k,v] of defaults) {
        await sql`INSERT INTO site_content (page, key, value) VALUES (${p}, ${k}, ${v}) ON CONFLICT (page, key) DO NOTHING`;
      }
    }
    await sql`INSERT INTO site_content (page, key, value) VALUES ('home', 'intro_photo', '') ON CONFLICT (page, key) DO NOTHING`;
    await sql`INSERT INTO site_content (page, key, value) VALUES ('home', 'intro_main', ${HOME_INTRO_MAIN_DEFAULT}) ON CONFLICT (page, key) DO NOTHING`;
    await sql`INSERT INTO site_content (page, key, value) VALUES ('gallery', 'banner_image', 'assets/images/french-pastries/fp-05.jpg') ON CONFLICT (page, key) DO NOTHING`;
    await sql`INSERT INTO site_content (page, key, value) VALUES ('share', 'banner_image', 'assets/images/share-hero.jpg') ON CONFLICT (page, key) DO NOTHING`;
    await sql`INSERT INTO site_content (page, key, value) VALUES ('site', 'site_nav_show_youtube', '1') ON CONFLICT (page, key) DO NOTHING`;
    await sql`INSERT INTO site_content (page, key, value) VALUES ('site', 'site_nav_show_pinterest', '1') ON CONFLICT (page, key) DO NOTHING`;
    await sql`INSERT INTO site_content (page, key, value) VALUES ('site', 'site_nav_show_instagram', '1') ON CONFLICT (page, key) DO NOTHING`;
    res.status(200).json({ success: true, message: 'Database initialized' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
};
