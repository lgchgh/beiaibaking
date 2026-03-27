/**
 * Public contact form → email via Resend (https://resend.com).
 * Env: RESEND_API_KEY (required), CONTACT_TO_EMAIL, RESEND_FROM
 *
 * Same response style as api/login.js (res.status().json). Non-async handler +
 * .then() chain — some Vercel Fluid builds mishandle async + writeHead and return 502.
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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (ch) => chunks.push(ch));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  if (res.headersSent || res.writableEnded) return;
  res.status(status).json(obj);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resendPost(apiKey, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const reqOut = https.request(
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
        incoming.on('error', reject);
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: incoming.statusCode || 0, text });
        });
      }
    );
    reqOut.on('error', reject);
    reqOut.write(body);
    reqOut.end();
  });
}

function loadBody(req) {
  const parsed = getJsonBody(req);
  if (parsed != null) return Promise.resolve(parsed);
  return readRawBody(req)
    .then((raw) => {
      const text = raw.length ? raw.toString('utf8') : '';
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })
    .catch(() => null);
}

module.exports = (req, res) => {
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
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return json(res, 503, {
      error: 'Contact form is not configured (missing RESEND_API_KEY)',
    });
  }

  loadBody(req)
    .then((body) => {
      if (!body || typeof body !== 'object') {
        json(res, 400, { error: 'Invalid JSON body' });
        return null;
      }

      const email = String(body.email || '').trim().slice(0, 320);
      const subject = String(body.subject || '').trim().slice(0, 200);
      const message = String(body.message || '').trim().slice(0, 10000);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        json(res, 400, { error: 'Valid email address required' });
        return null;
      }
      if (!subject) {
        json(res, 400, { error: 'Subject required' });
        return null;
      }
      if (!message) {
        json(res, 400, { error: 'Message required' });
        return null;
      }

      const to = (process.env.CONTACT_TO_EMAIL || 'admin@beiaibaking.net').trim();
      const from = (process.env.RESEND_FROM || 'Beiai Baking <onboarding@resend.dev>').trim();
      const plain = `From: ${email}\nSubject: ${subject}\n\n${message}`;
      const html = `<p><strong>From:</strong> ${esc(email)}</p><p><strong>Subject:</strong> ${esc(subject)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`;

      return resendPost(apiKey, {
        from,
        to: [to],
        reply_to: email,
        subject: `[Beiai Baking contact] ${subject}`,
        text: plain,
        html,
      });
    })
    .then((r) => {
      if (r == null) return;

      let data = {};
      try {
        data = r.text ? JSON.parse(r.text) : {};
      } catch (e) {
        console.error('Resend non-JSON body', r.status, String(r.text).slice(0, 500));
        json(res, 502, {
          error: 'Email provider returned an invalid response',
          status: r.status,
        });
        return;
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
        json(res, 502, { error: msg + hint, code: data.name });
        return;
      }

      json(res, 200, { success: true });
    })
    .catch((e) => {
      console.error('contact handler error', e);
      json(res, 500, {
        error: 'Failed to send message',
        detail: String(e && e.message ? e.message : e),
      });
    });
};
