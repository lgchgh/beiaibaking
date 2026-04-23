/**
 * Public contact form → email via Resend (https://resend.com).
 * Env: RESEND_API_KEY (required), CONTACT_TO_EMAIL, RESEND_FROM
 *
 * POST body: only uses req.body (Vercel-parsed). Do not read req stream again —
 * attaching data/end listeners after Vercel consumed the body can break POST on some setups.
 */
function parseBody(req) {
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

/** Same pattern as api/login.js for string vs object body. */
function getContactFields(req) {
  let body = parseBody(req);
  if (body == null && req.body != null) {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== 'object') return { error: 'Invalid JSON body' };
  const email = String(body.email || '').trim().slice(0, 320);
  const subject = String(body.subject || '').trim().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 10000);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Valid email address required' };
  }
  if (!subject) return { error: 'Subject required' };
  if (!message) return { error: 'Message required' };
  return { email, subject, message };
}

function resendPost(apiKey, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).then((r) => r.text().then((text) => ({ status: r.status, text })));
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return res.status(503).json({
      error: 'Contact form is not configured (missing RESEND_API_KEY)',
    });
  }

  let answered = false;
  const reply = (status, obj) => {
    if (answered || res.headersSent || res.writableEnded) return;
    answered = true;
    try {
      res.status(status).json(obj);
    } catch (e) {
      console.error('contact reply failed', e);
    }
  };

  const fields = getContactFields(req);
  if (fields.error) {
    return reply(400, { error: fields.error });
  }

  const to = 'info@beiaibaking.net';
  const from = (process.env.RESEND_FROM || 'Beiai Baking <onboarding@resend.dev>').trim();
  const plain = `From: ${fields.email}\nSubject: ${fields.subject}\n\n${fields.message}`;
  const html = `<p><strong>From:</strong> ${esc(fields.email)}</p><p><strong>Subject:</strong> ${esc(fields.subject)}</p><p style="white-space:pre-wrap">${esc(fields.message)}</p>`;

  resendPost(apiKey, {
    from,
    to: [to],
    reply_to: fields.email,
    subject: `[Beiai Baking contact] ${fields.subject}`,
    text: plain,
    html,
  })
    .then((r) => {
      let data = {};
      try {
        data = r.text ? JSON.parse(r.text) : {};
      } catch (e) {
        console.error('Resend non-JSON body', r.status, String(r.text).slice(0, 500));
        reply(502, {
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
        // Mirror Resend 4xx (e.g. 403 testing / domain rules) so the client gets JSON + real status, not 502.
        const clientStatus =
          r.status >= 400 && r.status < 500 ? r.status : 502;
        reply(clientStatus, { error: msg, code: data.name });
        return;
      }

      reply(200, { success: true, recipient: to });
    })
    .catch((e) => {
      console.error('contact handler error', e);
      reply(500, {
        error: 'Failed to send message',
        detail: String(e && e.message ? e.message : e),
      });
    });
};
