/**
 * Vercel / Node may pass req.body as object, string, or Buffer.
 */
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

module.exports = { getJsonBody };
