/**
 * Cron: publish posts whose scheduled_publish_at is due.
 * GitHub Actions → POST with CRON_SECRET (same as /api/posts ingest).
 */
const { sql } = require('../lib/db');
const { ensurePostsSchema } = require('../lib/ensurePostsSchema');
const { cronAuthResult } = require('../lib/cronAuth');
const { sendScheduleAbandonAlert } = require('../lib/scheduleAlert');

const MAX_WAVES = 3;
const INTRA_RETRIES = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryPublishOne(id) {
  const cur = await sql`SELECT published FROM posts WHERE id = ${id}`;
  if (!cur.rows?.length) return { ok: false, err: new Error('missing post') };
  if (cur.rows[0].published) return { ok: true };

  let lastErr = null;
  for (let attempt = 0; attempt < INTRA_RETRIES; attempt++) {
    try {
      const u = await sql`
        UPDATE posts SET
          published = true,
          published_at = NOW(),
          updated_at = NOW(),
          scheduled_publish_at = NULL
        WHERE id = ${id}
          AND published = false
          AND schedule_abandoned = false
        RETURNING id
      `;
      if (u.rows && u.rows.length === 1) return { ok: true };
      const again = await sql`SELECT published FROM posts WHERE id = ${id}`;
      if (again.rows[0]?.published) return { ok: true };
      return { ok: false, err: new Error('no row updated') };
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (attempt + 1));
    }
  }
  return { ok: false, err: lastErr };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authz = cronAuthResult(req);
  if (!authz.ok) {
    if (authz.reason === 'not_configured') {
      res.status(503).json({ error: 'Server misconfiguration', detail: 'CRON_SECRET is not set' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await ensurePostsSchema();
    const due = await sql`
      SELECT id, title, type, scheduled_publish_fail_count
      FROM posts
      WHERE published = false
        AND schedule_abandoned = false
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= NOW()
      ORDER BY scheduled_publish_at ASC
      LIMIT 8
    `;

    const out = { published: 0, pending_retries: 0, abandoned: 0 };
    const rows = due.rows || [];

    for (const row of rows) {
      const attempt = await tryPublishOne(row.id);
      if (attempt.ok) {
        out.published++;
        continue;
      }
      const prev = parseInt(row.scheduled_publish_fail_count, 10) || 0;
      const next = prev + 1;
      const detail = (attempt.err && (attempt.err.message || String(attempt.err))) || 'publish failed';

      if (next >= MAX_WAVES) {
        await sql`
          UPDATE posts SET
            schedule_abandoned = true,
            scheduled_publish_fail_count = ${next},
            updated_at = NOW()
          WHERE id = ${row.id}
        `;
        out.abandoned++;
        await sendScheduleAbandonAlert({
          id: row.id,
          title: row.title,
          type: row.type,
          detail,
        });
      } else {
        await sql`
          UPDATE posts SET
            scheduled_publish_fail_count = ${next},
            updated_at = NOW()
          WHERE id = ${row.id}
        `;
        out.pending_retries++;
      }
    }

    res.status(200).json({ ok: true, ...out, checked: rows.length });
  } catch (e) {
    console.error('[publish-scheduled]', e);
    res.status(500).json({ error: 'Internal error', detail: e.message || String(e) });
  }
};
