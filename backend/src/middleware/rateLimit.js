const crypto = require('crypto');

/**
 * Lightweight in-memory rate limiter (per-process).
 * Suitable for a single App Platform instance; resets on restart.
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  keyFn = (req) => req.ip || 'unknown',
  message = 'Too many attempts. Please wait and try again.',
} = {}) {
  const hits = new Map();

  function prune(now) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) prune(now);

    const key = String(keyFn(req) || 'unknown');
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retrySec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: message,
        retryAfterSeconds: retrySec,
      });
    }

    return next();
  };
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function authAttemptKey(req) {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const ip = clientIp(req);
  const digest = crypto
    .createHash('sha256')
    .update(`${ip}|${email}`)
    .digest('hex')
    .slice(0, 24);
  return digest;
}

module.exports = {
  createRateLimiter,
  clientIp,
  authAttemptKey,
};
