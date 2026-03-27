/**
 * Public contact form → email via Resend (https://resend.com).
 * Env: RESEND_API_KEY (required), CONTACT_TO_EMAIL, RESEND_FROM
 *
 * Uses https.request (not fetch) so the handler works on all Node runtimes on Vercel.
 */
const https = require('https');

const RESEND_HOST = 'api.resend.com';
const RESEND_PATH = '/emails';

function getJsonBody(req) {
  const b = req.body;
  if (b == null || b === '') return null;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  }
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (typeof b === 'object') return b;
  return null;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resendPost(apiKey, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: RESEND_HOST,
        port: 443,
        path: RESEND_PATH,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8'),
        },
      },
      (incoming) => {
        const chunks = [];
        incoming.on('data', (d) => chunks.push(d));
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: incoming.statusCode || 0, text });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        contactApi: true,
        resendConfigured: !!process.env.RESEND_API_KEY,
      });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not set');
      return res.status(503).json({
        error: 'Contact form is not configured (missing RESEND_API_KEY)',
      });
    }

    let body = getJsonBody(req);
    if (!body && req.body != null) {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch {
        body = null;
      }
    }
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const email = String(body.email || '').trim().slice(0, 320);
    const subject = String(body.subject || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 10000);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email address required' });
    }
    if (!subject) {
      return res.status(400).json({ error: 'Subject required' });
    }
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    const to = (process.env.CONTACT_TO_EMAIL || 'admin@beiaibaking.net').trim();
    const from = (process.env.RESEND_FROM || 'Beiai Baking <onboarding@resend.dev>').trim();

    const plain = `From: ${email}\nSubject: ${subject}\n\n${message}`;
    const html = `<p><strong>From:</strong> ${esc(email)}</p><p><strong>Subject:</strong> ${esc(subject)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`;

    const r = await resendPost(apiKey, {
      from,
      to: [to],
      reply_to: email,
      subject: `[Beiai Baking contact] ${subject}`,
      text: plain,
      html,
    });

    let data = {};
    try {
      data = r.text ? JSON.parse(r.text) : {};
    } catch (e) {
      console.error('Resend non-JSON body', r.status, String(r.text).slice(0, 500));
      return res.status(502).json({
        error: 'Email provider returned an invalid response',
        status: r.status,
      });
    }

    if (r.status < 200 || r.status >= 300) {
      console.error('Resend HTTP', r.status, data);
      let msg =
        (typeof data.message === 'string' && data.message) ||
        (Array.isArray(data.message) &&
          data.message.map((x) => (x && x.message) || '').filter(Boolean).join('; ')) ||
        'Could not send email';
      const hint =
        /verify|domain|own email|testing/i.test(msg)
          ? ' With onboarding@resend.dev, Resend often only delivers to your signup email until you verify beiaibaking.net in Resend. Set CONTACT_TO_EMAIL to that email, or verify your domain and use RESEND_FROM.'
          : '';
      return res.status(502).json({ error: msg + hint, code: data.name });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('contact handler error', e);
    return res.status(500).json({
      error: 'Failed to send message',
      detail: String(e.message || e),
    });
  }
};
