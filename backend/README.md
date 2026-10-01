# Selfie Verification API

Node.js + Express auth backend. **PostgreSQL** by default (local + DigitalOcean). SQLite only for offline device mode.

## Quick start (Postgres)

```bash
cp .env.example .env
# Set DATABASE_URL and DB_CLIENT=postgres
npm install
npm run db:migrate
npm run dev
# or from monorepo root: npm run api
```

Base URL: `http://localhost:4000` — `/health` should report `"engine":"postgres"`.

### Offline device only (SQLite)

```bash
# in .env:
DB_CLIENT=sqlite
SQLITE_PATH=./data/auth.db
# leave DATABASE_URL unset
```

## Production (DigitalOcean)

Set `DATABASE_URL` (Postgres) and `DB_CLIENT=postgres`. Migrations run on start.

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
