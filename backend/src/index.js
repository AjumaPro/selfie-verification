require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { query, engine } = require('./db/pool');
const { getJwtSecret } = require('./middleware/auth');

const app = express();
const port = Number(process.env.PORT) || 4000;

function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  // Warn early if JWT is weak; do not crash the process (health checks need the server up)
  getJwtSecret();
}

const allowedOrigins = String(process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      if (/^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      if (/^https?:\/\/([\w-]+\.)*ondigitalocean\.app$/i.test(origin)) {
        return cb(null, true);
      }
      console.warn('CORS blocked origin:', origin);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '3mb' }));

app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1 AS ok');
    return res.json({
      ok: true,
      service: 'selfie-verification-api',
      database: 'up',
      engine,
    });
  } catch (err) {
    console.error('health check db error:', err.message);
    return res.status(503).json({
      ok: false,
      service: 'selfie-verification-api',
      database: 'down',
      engine,
      error: 'Database unavailable',
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/booking', require('./routes/booking'));
app.use('/api/verify', require('./routes/verify'));

// Production: serve React build from backend/public (copied during root `npm run build`)
const clientDir = path.join(__dirname, '..', 'public');
const clientIndex = path.join(clientDir, 'index.html');

if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDir, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(clientIndex);
  });
  console.log('Serving UI from', clientDir);
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<!doctype html><meta charset="utf-8"><title>Selfie Verification API</title>' +
          '<body style="font-family:system-ui;padding:2rem">' +
          '<h1>API is running</h1>' +
          '<p>UI build not found (<code>backend/public</code>). ' +
          'On DigitalOcean, ensure the root build runs <code>npm run build</code> before start.</p>' +
          '<p><a href="/health">/health</a></p></body>'
      );
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

try {
  assertProductionSecrets();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { ensureMeetingsSchema } = require('./db/meetingsSchema');
const { ensureBookingSchema } = require('./db/bookingSchema');
const { ensureVerifySchema } = require('./db/verifySchema');

async function start() {
  try {
    await ensureMeetingsSchema(query);
    console.log('✓ Meetings schema ready');
  } catch (err) {
    console.error('Meetings schema setup failed:', err.message);
  }
  try {
    await ensureBookingSchema(query);
    console.log('✓ Booking schema ready');
  } catch (err) {
    console.error('Booking schema setup failed:', err.message);
  }
  try {
    await ensureVerifySchema(query);
    console.log('✓ Verify-share schema ready');
  } catch (err) {
    console.error('Verify schema setup failed:', err.message);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Selfie Verification listening on http://127.0.0.1:${port}`);
  });
}

start();
