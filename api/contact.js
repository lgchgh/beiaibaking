/**
 * Public contact form → email via Resend (https://resend.com).
 * Env: RESEND_API_KEY (required), CONTACT_TO_EMAIL, RESEND_FROM
 *
 * Note: With default from "onboarding@resend.dev", Resend only allows sending
 * to your signup email until you verify a domain — see ADMIN-SETUP.md.
 */
const { getJsonBody } = require('../lib/parseBody');

const RESEND_URL = 'https://api.resend.com/emails';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sendJson(res, status, obj) {
  try {
    if (res.headersSent) return;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).end(JSON.stringify(obj));
  } catch (e) {
    console.error('sendJson failed', e);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        contactApi: true,
        resendConfigured: !!process.env.RESEND_API_KEY,
      });
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not set');
      return sendJson(res, 503, {
        error: 'Contact form is not configured (missing RESEND_API_KEY)',
      });
    }

    let body = getJsonBody(req);
    if (!body && req.body != null) {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        body = null;
      }
    }
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }

    const email = String(body.email || '').trim().slice(0, 320);
    const subject = String(body.subject || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 10000);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Valid email address required' });
    }
    if (!subject) {
      return sendJson(res, 400, { error: 'Subject required' });
    }
    if (!message) {
      return sendJson(res, 400, { error: 'Message required' });
    }

    const to = (process.env.CONTACT_TO_EMAIL || 'admin@beiaibaking.net').trim();
    const from = (process.env.RESEND_FROM || 'Beiai Baking <onboarding@resend.dev>').trim();

    const plain = `From: ${email}\nSubject: ${subject}\n\n${message}`;
    const html = `<p><strong>From:</strong> ${esc(email)}</p><p><strong>Subject:</strong> ${esc(subject)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`;

    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[Beiai Baking contact] ${subject}`,
        text: plain,
        html,
      }),
    });

    const raw = await r.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Resend non-JSON body', r.status, raw.slice(0, 500));
      return sendJson(res, 502, {
        error: 'Email provider returned an invalid response',
        status: r.status,
      });
    }

    if (!r.ok) {
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
      return sendJson(res, 502, { error: msg + hint, code: data.name });
    }

    return sendJson(res, 200, { success: true });
  } catch (e) {
    console.error('contact handler error', e);
    return sendJson(res, 500, { error: 'Failed to send message', detail: String(e.message || e) });
  }
};
