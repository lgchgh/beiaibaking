const auth = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { username, password } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    if (auth.verifyCredentials(username, password)) {
      const token = auth.createToken(username);
      auth.setAuthCookie(res, token);
      res.status(200).json({ success: true, user: username });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
};
