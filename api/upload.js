const auth = require('../lib/auth');
const crypto = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
let client;

function getClient() {
  const required = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE'];
  if (required.some(k => !process.env[k])) {
    throw new Error('R2 environment variables are missing');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT.replace(/\/$/, ''),
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

function isImage(mime, buf) {
  if (mime === 'image/jpeg') return buf.length > 3 && buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/gif') return /^GIF8[79]a/.test(buf.subarray(0,6).toString('ascii'));
  if (mime === 'image/webp') return buf.length >= 12 && buf.toString('ascii',0,4) === 'RIFF' && buf.toString('ascii',8,12) === 'WEBP';
  if (mime === 'image/avif') return buf.length >= 12 && buf.toString('ascii',4,8) === 'ftyp' && /avif|avis/.test(buf.toString('ascii',8,24));
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!auth.requireAuth(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { data, filename, contentType } = body;
    if (typeof data !== 'string' || !data) {
      res.status(400).json({ error: 'data (base64) required' });
      return;
    }
    // FileReader returns data:image/...;base64,...; keep compatibility with the existing admin UI.
    const match = data.match(/^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=\r\n]+)$/);
    const mime = match ? match[1] : (contentType || 'image/jpeg');
    const base64 = match ? match[2] : data;
    if (!MIME_EXT[mime] || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
      res.status(400).json({ error: 'Unsupported image format' });
      return;
    }
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length || buf.length > 8 * 1024 * 1024 || !isImage(mime, buf)) {
      res.status(400).json({ error: 'Invalid image or image too large' });
      return;
    }

    const base = String(filename || `image.${MIME_EXT[mime]}`)
      .replace(/\\/g, '/').split('/').pop()
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .slice(0, 80);
    const key = `uploads/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${base || `image.${MIME_EXT[mime]}`}`;
    await getClient().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buf,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    res.status(200).json({ url: `${process.env.R2_PUBLIC_BASE.replace(/\/$/, '')}/${key}` });
  } catch (e) {
    console.error('R2 upload failed:', e?.message || e);
    res.status(500).json({ error: 'Upload failed' });
  }
};
