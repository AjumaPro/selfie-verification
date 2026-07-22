const jwt = require('jsonwebtoken');

const PROD_FALLBACK_JWT =
  'glico-selfie-do-fallback-jwt-set-JWT_SECRET-in-app-platform';

function isWeakJwtSecret(secret) {
  if (!secret || !String(secret).trim()) return true;
  const s = String(secret).trim();
  if (s === 'change-me-to-a-long-random-secret') return true;
  if (s === 'dev-only-secret') return true;
  if (/REPLACE_WITH/i.test(s)) return true;
  return false;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!isWeakJwtSecret(secret)) {
    return String(secret).trim();
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      'WARNING: JWT_SECRET is missing or a placeholder. ' +
        'Set a strong JWT_SECRET in DigitalOcean App → Settings → web → Environment Variables, then redeploy.'
    );
    return PROD_FALLBACK_JWT;
  }
  return 'dev-only-secret';
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
