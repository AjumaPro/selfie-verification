require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');

const app = express();
const port = Number(process.env.PORT) || 4000;

const allowedOrigins = String(process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients and Electron (no Origin header)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      // Localhost / LAN dev frontends (any port)
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      if (/^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      // DigitalOcean App Platform
      if (/^https?:\/\/([\w-]+\.)*ondigitalocean\.app$/i.test(origin)) {
        return cb(null, true);
      }
      console.warn('CORS blocked origin:', origin);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'selfie-verification-api' });
});

app.use('/api/auth', authRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(port, () => {
  console.log(`Selfie Verification API listening on http://localhost:${port}`);
});
