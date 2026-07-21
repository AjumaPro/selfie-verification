# Selfie Verification API

Node.js + Express + PostgreSQL auth backend. See the root [README.md](../README.md) for the full project guide.

## Quick start

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Base URL: `http://localhost:4000`

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
