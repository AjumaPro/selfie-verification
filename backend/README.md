# Selfie Verification API

Node.js + Express auth backend. **SQLite** for local/device; **PostgreSQL** on DigitalOcean.

## Quick start (local / device)

```bash
cp .env.example .env
# .env already uses DB_CLIENT=sqlite by default
npm install
npm run db:migrate
npm run dev
```

Data file: `backend/data/auth.db` (gitignored).

Base URL: `http://localhost:4000`

## Production (DigitalOcean)

Set `DATABASE_URL` (Postgres). Do **not** set `DB_CLIENT=sqlite`. Migrations run on start.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | no | Health check |
| POST | `/api/auth/register` | no | Self-register → **pending** (no token) |
| POST | `/api/auth/login` | no | User sign in (approved only) |
| POST | `/api/auth/superadmin/login` | no | Superadmin sign in |
| GET | `/api/auth/me` | Bearer | Current approved user |
| PATCH | `/api/auth/me` | Bearer | Update own name / email / organization |
| PATCH | `/api/auth/me/password` | Bearer | Change own password |
| GET | `/api/auth/users` | Superadmin | List users |
| POST | `/api/auth/users` | Superadmin | Create account |
| PATCH | `/api/auth/users/:id` | Superadmin | Edit user profile |
| PATCH | `/api/auth/users/:id/password` | Superadmin | Reset user password |
| PATCH | `/api/auth/users/:id/status` | Superadmin | `pending` / `approved` / `rejected` |
| DELETE | `/api/auth/users/:id` | Superadmin | Delete user |

## Superadmin seed

```env
SUPERADMIN_EMAIL=superadmin@glico.local
SUPERADMIN_PASSWORD=SuperAdmin@123
SUPERADMIN_NAME=Super Admin
```

Run `npm run db:migrate` after changing these values.
