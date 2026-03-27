/**
 * Public contact form → email via Resend (https://resend.com).
 * Env: RESEND_API_KEY (required), CONTACT_TO_EMAIL, RESEND_FROM
 */
const { getJsonBody } = require('../lib/parseBody');

const RESEND_URL = 'https://api.resend.com/emails';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    res.status(503).json({ error: 'Contact form is not configured (missing RESEND_API_KEY)' });
    return;
  }

  const body = getJsonBody(req);
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const email = String(body.email || '').trim().slice(0, 320);
  const subject = String(body.subject || '').trim().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 10000);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Valid email address required' });
    return;
  }
  if (!subject) {
    res.status(400).json({ error: 'Subject required' });
    return;
  }
  if (!message) {
    res.status(400).json({ error: 'Message required' });
    return;
  }

  const to = (process.env.CONTACT_TO_EMAIL || 'admin@beiaibaking.net').trim();
  const from = (process.env.RESEND_FROM || 'Beiai Baking <onboarding@resend.dev>').trim();

  const text = `From: ${email}\nSubject: ${subject}\n\n${message}`;
  const html = `<p><strong>From:</strong> ${esc(email)}</p><p><strong>Subject:</strong> ${esc(subject)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`;

  try {
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
        text,
        html,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Resend HTTP', r.status, data);
      res.status(502).json({
        error: data.message || data.name || 'Could not send email',
        detail: process.env.NODE_ENV === 'development' ? data : undefined,
      });
      return;
    }
    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send message' });
  }
};
