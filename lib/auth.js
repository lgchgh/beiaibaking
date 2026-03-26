const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { serialize } = require('cookie');

const JWT_SECRET = process.env.JWT_SECRET || 'beiai-baking-secret-change-in-production';
const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Secure flag must match URL scheme. vercel dev uses HTTP + VERCEL_ENV=development — no Secure. */
function useSecureCookie() {
  if (process.env.VERCEL_ENV === 'development') return false;
  if (process.env.VERCEL === '1') return true;
  return process.env.NODE_ENV === 'production';
}

function verifyCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME || 'lgchgh';
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD;
  if (username !== expectedUser) return false;
  if (hash && bcrypt.compareSync(password, hash)) return true;
  if (plain && password === plain) return true;
  return false;
}

function createToken(username) {
  return jwt.sign(
    { user: username, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.user;
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const cookie = req.headers?.cookie || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function requireAuth(req) {
  const token = getTokenFromRequest(req);
  const user = token ? verifyToken(token) : null;
  return user;
}

function setAuthCookie(res, token) {
  const secure = useSecureCookie();
  res.setHeader('Set-Cookie', serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  }));
}

function clearAuthCookie(res) {
  const secure = useSecureCookie();
  res.setHeader('Set-Cookie', serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  }));
}

module.exports = {
  verifyCredentials,
  createToken,
  verifyToken,
  requireAuth,
  getTokenFromRequest,
  setAuthCookie,
  clearAuthCookie,
};
