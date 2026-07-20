const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-me-to-a-long-random-secret') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
  }
  return secret || 'dev-only-secret';
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user' },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(match[1], getJwtSecret());
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userRole = payload.role || 'user';
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.userRole !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  return next();
}

module.exports = { signToken, authRequired, requireSuperAdmin, getJwtSecret };
