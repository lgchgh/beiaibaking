const auth = require('../lib/auth');
const { sql } = require('../lib/db');

async function handlePost(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const page = body.page || 'unknown';
    const referrer = body.referrer || '';
    await sql`INSERT INTO visitor_logs (page, referrer) VALUES (${page}, ${referrer})`;
    res.status(200).json({ ok: true });
  } catch (e) {
    if (e.message?.includes('does not exist')) {
      res.status(200).json({ ok: true });
      return;
    }
    console.error(e);
    res.status(500).json({ ok: false });
  }
}

async function handleGet(req, res) {
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const total = await sql`SELECT COUNT(*) as c FROM visitor_logs`;
    const byPage = await sql`SELECT page, COUNT(*) as c FROM visitor_logs GROUP BY page ORDER BY c DESC`;
    const byReferrer = await sql`SELECT referrer, COUNT(*) as c FROM visitor_logs WHERE referrer != '' AND referrer IS NOT NULL GROUP BY referrer ORDER BY c DESC LIMIT 50`;
    const recent = await sql`SELECT page, referrer, created_at FROM visitor_logs ORDER BY created_at DESC LIMIT 100`;
    res.status(200).json({
      total: parseInt(total.rows?.[0]?.c || 0),
      byPage: byPage.rows || [],
      byReferrer: byReferrer.rows || [],
      recent: recent.rows || [],
    });
  } catch (e) {
    if (e.message?.includes('does not exist')) {
      res.status(200).json({ total: 0, byPage: [], byReferrer: [], recent: [] });
      return;
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'GET') return handleGet(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
