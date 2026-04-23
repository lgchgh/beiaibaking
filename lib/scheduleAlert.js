/**
 * Email alert when scheduled publishing is abandoned (uses same Resend setup as contact).
 */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function resendPost(apiKey, payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  return { status: r.status, text };
}

async function sendScheduleAbandonAlert({ id, title, type, detail }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[schedule-alert] RESEND_API_KEY not set, skip mail');
    return { ok: false, reason: 'no_api_key' };
  }
  const to = (process.env.CONTACT_TO_EMAIL || 'info@beiaibaking.net').trim();
  const from = (process.env.RESEND_FROM || 'Beiai Baking <onboarding@resend.dev>').trim();
  const subj = `[Beiai Baking] Scheduled publish failed (abandoned)`;
  const plain = [
    `Post ID: ${id}`,
    `Type: ${type || 'unknown'}`,
    `Title: ${title || '(none)'}`,
    '',
    `After scheduled retries the article was left unpublished (schedule abandoned).`,
    `Detail: ${detail || 'unknown error'}`,
    '',
    `Open the admin Posts tab to publish or delete the draft.`,
  ].join('\n');
  const html = `<p><strong>Post ID:</strong> ${esc(id)}</p>
<p><strong>Type:</strong> ${esc(type)}</p>
<p><strong>Title:</strong> ${esc(title)}</p>
<p>Scheduled publishing failed repeatedly; the draft remains visible in admin as abandoned.</p>
<p><strong>Detail:</strong> ${esc(detail)}</p>`;

  try {
    const r = await resendPost(apiKey, {
      from,
      to: [to],
      subject: subj,
      text: plain,
      html,
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    console.error('[schedule-alert] Resend error', r.status, r.text);
    return { ok: false, status: r.status };
  } catch (e) {
    console.error('[schedule-alert]', e.message || e);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendScheduleAbandonAlert };
