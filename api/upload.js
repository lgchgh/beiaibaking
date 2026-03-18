const auth = require('../lib/auth');
const { put } = require('@vercel/blob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = auth.requireAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { data, filename, contentType } = body;
    if (!data) {
      res.status(400).json({ error: 'data (base64) required' });
      return;
    }
    const buf = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const name = filename || `uploads/${Date.now()}.jpg`;
    const blob = await put(name, buf, {
      access: 'public',
      contentType: contentType || 'image/jpeg',
    });
    res.status(200).json({ url: blob.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
};
