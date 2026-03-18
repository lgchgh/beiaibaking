const auth = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  auth.clearAuthCookie(res);
  res.status(200).json({ success: true });
};
