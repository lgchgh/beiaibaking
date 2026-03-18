const auth = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = auth.requireAuth(req);
  if (user) {
    res.status(200).json({ user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
};
