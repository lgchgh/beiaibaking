/**
 * Public contact form → email via Resend (https://resend.com).
 * Env: RESEND_API_KEY (required), CONTACT_TO_EMAIL, RESEND_FROM
 *
 * Uses https.request (not fetch). Waits for res "finish" after end() so Fluid /
 * serverless does not freeze the isolate before the body is flushed (avoids 502).
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

/** @returns {Promise<void>} */
function sendJson(res, status, obj) {
  return new Promise((resolve, reject) => {
    if (res.headersSent || res.writableEnded) {
      resolve();
      return;
    }
    const payload = JSON.stringify(obj);
    const done = () => resolve();
    const fail = (err) => reject(err);
    res.once('finish', done);
    res.once('error', fail);
    try {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload, 'utf8'),
      });
      res.end(payload);
    } catch (e) {
      res.removeListener('finish', done);
      res.removeListener('error', fail);
      reject(e);
    }
  });
}

/** @returns {Promise<void>} */
function sendOptions(res) {
  return new Promise((resolve, reject) => {
    if (res.headersSent || res.writableEnded) {
      resolve();
      return;
    }
    const done = () => resolve();
    const fail = (err) => reject(err);
    res.once('finish', done);
    res.once('error', fail);
    try {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
    } catch (e) {
      res.removeListener('finish', done);
      res.removeListener('error', fail);
      reject(e);
    }
  });
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
      await sendOptions(res);
      return;
    }
    if (req.method === 'GET') {
      await sendJson(res, 200, {
        ok: true,
        contactApi: true,
        resendConfigured: !!process.env.RESEND_API_KEY,
      });
      return;
    }
    if (req.method !== 'POST') {
      await sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not set');
      await sendJson(res, 503, {
        error: 'Contact form is not configured (missing RESEND_API_KEY)',
      });
      return;
    }

    let body = getJsonBody(req);
    if (body == null) {
      try {
        const raw = await readRawBody(req);
        const text = raw.length ? raw.toString('utf8') : '';
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
    }
    if (!body || typeof body !== 'object') {
      await sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const email = String(body.email || '').trim().slice(0, 320);
    const subject = String(body.subject || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 10000);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await sendJson(res, 400, { error: 'Valid email address required' });
      return;
    }
    if (!subject) {
      await sendJson(res, 400, { error: 'Subject required' });
      return;
    }
    if (!message) {
      await sendJson(res, 400, { error: 'Message required' });
      return;
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
      await sendJson(res, 502, {
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
      await sendJson(res, 502, { error: msg + hint, code: data.name });
      return;
    }

    await sendJson(res, 200, { success: true });
  } catch (e) {
    console.error('contact handler error', e);
    try {
      await sendJson(res, 500, {
        error: 'Failed to send message',
        detail: String(e.message || e),
      });
    } catch (e2) {
      console.error('contact handler: could not send error JSON', e2);
    }
  }
};
