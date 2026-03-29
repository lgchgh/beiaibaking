/**
 * GitHub Actions / cron → Vercel API：校验 CRON_SECRET。
 * 支持 x-cron-secret 与 Authorization: Bearer（避免个别链路只转发其一）。
 */

function readCronSecretFromRequest(req) {
  const h = req.headers || {};
  let x = h['x-cron-secret'];
  if (Array.isArray(x)) x = x[0];
  if (x != null && String(x).trim() !== '') return String(x).trim();

  let auth = h.authorization || h.Authorization;
  if (Array.isArray(auth)) auth = auth[0];
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(\S+)/i);
    if (m) return m[1].trim();
  }
  return '';
}

/**
 * @returns {{ ok: true } | { ok: false, reason: 'not_configured' | 'missing_header' | 'bad_secret' }}
 */
function cronAuthResult(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return { ok: false, reason: 'not_configured' };
  const got = readCronSecretFromRequest(req);
  if (!got) return { ok: false, reason: 'missing_header' };
  if (got !== expected) return { ok: false, reason: 'bad_secret' };
  return { ok: true };
}

module.exports = { readCronSecretFromRequest, cronAuthResult };
