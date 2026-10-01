#!/usr/bin/env node
/**
 * Keep the API up for local frontend (port 4000).
 * Loads backend/.env — uses Postgres when DATABASE_URL (+ DB_CLIENT=postgres) is set.
 *
 *   npm run api          (repo root)
 *   npm run start:api    (backend)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');
const envPath = path.join(backendDir, '.env');

/** Minimal .env loader (does not override already-set process.env). */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(envPath);

const env = {
  ...process.env,
  PORT: process.env.PORT || '4000',
};

// Prefer Postgres when a URL is configured; only default sqlite if nothing set.
const client = String(env.DB_CLIENT || '').toLowerCase();
const hasDbUrl = Boolean(String(env.DATABASE_URL || '').trim());
if (!client) {
  env.DB_CLIENT = hasDbUrl ? 'postgres' : 'sqlite';
}

function start() {
  const engineLabel =
    String(env.DB_CLIENT).toLowerCase() === 'sqlite' ? 'sqlite' : 'postgres';
  console.log(
    `[api] starting backend on 0.0.0.0:${env.PORT} (${engineLabel})…`
  );
  const child = spawn('node', ['src/index.js'], {
    cwd: backendDir,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    console.error(
      `[api] exited code=${code} signal=${signal || 'none'} — restarting in 1s…`
    );
    setTimeout(start, 1000);
  });
}

start();
