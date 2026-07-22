# Selfie Verification (GLICO)

Ghana Card KYC face verification app with **user auth**, **superadmin approval**, desktop installers (Mac/Windows), and a **Node + Express + PostgreSQL** backend.

The UI runs in the browser (or Electron). Face checks use `face-api.js` locally; identity verification calls the third-party Selfie API. User accounts are stored in PostgreSQL.

---

## Features

- **Verify Selfie** — Ghana Card number + live/gallery selfie → KYC face verification
- **Image pipeline** — face-aware crop to **640×480 PNG**, &lt;1MB, for the API
- **Auth** — register, login, stay signed in on device
- **Superadmin** — approve / reject / create / delete accounts; full access to all app sections
- **Install** — PWA, ZIP package, Windows `.exe`, Mac `.dmg` / `.zip`
- **Electron** desktop wrappers for Mac and Windows

---

## Project structure

```
IMAGE recognition/
├── README.md                 ← this file
├── backend/                  ← Express + PostgreSQL auth API
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── db/               ← pool + migrate/seed
│       ├── middleware/       ← JWT auth
│       └── routes/           ← /api/auth/*
├── frontend/                 ← React (CRA + craco) UI
│   ├── .env                  ← local secrets (not committed)
│   ├── electron/             ← Electron main/preload
│   ├── public/downloads/     ← installers & help text
│   ├── scripts/              ← electron build, copy downloads
│   └── src/
│       ├── components/       ← Auth, Admin, SelfieVerification, …
│       ├── context/          ← AuthContext
│       ├── services/         ← auth + face + third-party API
│       └── config/
└── Selfie-Verification-Device/   ← packaged device copy of the UI
```

---

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** (**DigitalOcean Managed Postgres**)
- npm

---

## 1. Backend (auth API)

```bash
cd backend
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, SUPERADMIN_* , CORS_ORIGIN
npm install
npm run db:migrate
npm run dev
```

API: **http://localhost:4000**

### Backend `.env` keys

| Variable | Purpose |
|----------|---------|
| `PORT` | Default `4000` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Token signing secret |
| `JWT_EXPIRES_IN` | e.g. `30d` (Stay signed in) |
| `CORS_ORIGIN` | e.g. `http://localhost:3000,http://localhost:3001` |
| `SUPERADMIN_EMAIL` | Seeded superadmin email |
| `SUPERADMIN_PASSWORD` | Seeded superadmin password |
| `SUPERADMIN_NAME` | Display name |

### Default superadmin (after migrate)

- **Email:** `superadmin@glico.local`
- **Password:** `SuperAdmin@123` (change in `backend/.env` for production)

Use the **Admin** tab in the UI (not normal Sign in).

### Auth API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `POST` | `/api/auth/register` | — | Self-register → **pending** (no login token) |
| `POST` | `/api/auth/login` | — | User login (approved only) |
| `POST` | `/api/auth/superadmin/login` | — | Superadmin login |
| `GET` | `/api/auth/me` | Bearer | Current user |
| `PATCH` | `/api/auth/me` | Bearer | Update own profile |
| `PATCH` | `/api/auth/me/password` | Bearer | Change own password |
| `GET` | `/api/auth/users` | Superadmin | List users |
| `POST` | `/api/auth/users` | Superadmin | Create account |
| `PATCH` | `/api/auth/users/:id` | Superadmin | Edit user profile |
| `PATCH` | `/api/auth/users/:id/password` | Superadmin | Reset user password |
| `PATCH` | `/api/auth/users/:id/status` | Superadmin | `pending` / `approved` / `rejected` |
| `DELETE` | `/api/auth/users/:id` | Superadmin | Delete user |

### Account rules

| Role | Register | Sign in | App access |
|------|----------|---------|------------|
| **User** | Yes → status `pending` | Only if `approved` | Verification + install |
| **Superadmin** | Seeded / created by admin | Admin tab only | **All sections** + user management |

Superadmin can **create**, **approve**, **reject**, and **delete** user accounts.

---

## 2. Frontend (React)

```bash
cd frontend
cp .env.example .env   # if present; otherwise create .env
npm install
node download-models.js   # face-api models into public/models
npm start
```

UI: **http://localhost:3000**

Keep the backend running on `:4000` or login will fail.

### Frontend `.env` keys

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_BASE_URL` | Third-party selfie/KYC API base |
| `REACT_APP_DEFAULT_USER_ID` | Merchant API user id |
| `REACT_APP_DEFAULT_MERCHANT_KEY` | Merchant key |
| `REACT_APP_DEFAULT_CENTER` | e.g. `BRANCHLESS` |
| `REACT_APP_AUTH_API_URL` | Auth backend, e.g. `http://localhost:4000` |

**Never commit** `.env` files (they contain secrets).

### Stay signed in

- First open → must sign in (or register + wait for approval)
- **Stay signed in on this device** → token in `localStorage` → auto-login next open
- Unchecked → session only until the app closes

---

## 3. Device copy

A parallel UI lives under `Selfie-Verification-Device/` (and optionally the sibling Desktop folder). Point its `.env` at the same auth API:

```
REACT_APP_AUTH_API_URL=http://localhost:4000
```

Often run on **http://localhost:3001**.

---

## 4. Desktop installers (Electron)

```bash
cd frontend
npm run electron:build        # Mac + Windows
npm run electron:build:mac    # Mac .dmg + .zip
npm run electron:build:win    # Windows .exe
```

Artifacts are copied to `frontend/public/downloads/`:

- `Selfie-Verification-Windows.exe`
- `Selfie-Verification-Mac.dmg`
- `Selfie-Verification-Mac.zip`
- `selfie-verification-ui.zip`
- `MAC-INSTALL.txt` / `WINDOWS-INSTALL.txt`

**Note:** Builds are unsigned. macOS Gatekeeper / Windows SmartScreen will warn — use **Open Anyway** / **Run anyway**, or Control-click → Open on Mac.

Large installers are parked out of the CRA `public/` tree during Electron build so they are not baked into the app asar.

---

## 5. Selfie / KYC verification

1. Sign in with an **approved** account (or as superadmin).
2. Enter Ghana Card number.
3. Capture or pick a selfie (guided oval / auto-crop to 640×480 PNG).
4. Submit → third-party API returns identity data when successful.

Image requirements (app-enforced): live portrait, **640×480**, PNG, under **1MB**, good lighting.

---

## Scripts cheat sheet

### Backend

```bash
npm run dev           # API with --watch
npm start             # API once
npm run db:migrate    # schema + superadmin seed
```

### Frontend

```bash
npm start                   # CRA/craco dev server
npm run build               # production web build
npm run download-models     # face-api weights
npm run package:download    # UI ZIP
npm run electron:dev        # Electron against localhost:3000
npm run electron:build      # Mac + Win installers
```

---

## Security notes

- Change `JWT_SECRET` and `SUPERADMIN_PASSWORD` before production.
- Do not commit `backend/.env` or `frontend/.env`.
- Self-registered users remain **pending** until a superadmin approves them.
- Superadmins cannot be deleted or set to rejected via the admin UI.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Cannot reach the auth server” | Start backend: `cd backend && npm run dev` |
| Login fails after register | Wait for superadmin **Approve** |
| Superadmin “use Admin login” | Use the **Admin** tab, not Sign in |
| Mac “developer cannot be verified” | Control-click app → Open, or Privacy & Security → Open Anyway |
| Electron app huge (~500MB) | Rebuild with parking script (`npm run electron:build`) so downloads aren’t inside asar |

---

## Deploy to DigitalOcean (App Platform)

This repo includes `.do/app.yaml` for **App Platform**:

- **web** — static React build (`frontend/`)
- **api** — Express auth API (`backend/`) on `/api` and `/health`
- Auth uses **same origin** (`REACT_APP_AUTH_API_URL` empty), so the browser calls `/api/...` on your app URL
- Production uses **DigitalOcean Managed Postgres** via `DATABASE_URL=${db.DATABASE_URL}` (see `.do/app.yaml`)

### 1. Push to GitHub

Repo: `https://github.com/AjumaPro/selfie-verification`

### 2. Create the app

> **“No components detected”?** The repo is a monorepo — set Source Directory to `backend` or `frontend`, or upload `.do/app.yaml`. Full steps: [DEPLOY-DIGITALOCEAN.md](./DEPLOY-DIGITALOCEAN.md).

1. Open [Create App on DigitalOcean](https://cloud.digitalocean.com/apps/new).
2. Prefer **upload App Spec** → [`.do/app.yaml`](./.do/app.yaml), **or** GitHub → repo `AjumaPro/selfie-verification` → branch `main` → Source Directory **`backend`** (then add resource with Source Directory **`frontend`**).
3. Set secrets / env vars:

| Key | Component | Notes |
|-----|-----------|--------|
| `DATABASE_URL` | web | `${db.DATABASE_URL}` (DigitalOcean Managed Postgres) |
| `JWT_SECRET` | api | Long random string |
| `SUPERADMIN_EMAIL` | api | Admin login email |
| `SUPERADMIN_PASSWORD` | api | Strong password |
| `SUPERADMIN_NAME` | api | optional |
| `CORS_ORIGIN` | api | `*` or your app URL |
| `REACT_APP_DEFAULT_USER_ID` | web (build-time) | KYC API user id |
| `REACT_APP_DEFAULT_MERCHANT_KEY` | web (build-time) | KYC merchant key |
| `REACT_APP_AUTH_API_URL` | web (build-time) | leave **empty** for same-origin |

4. Deploy → open `https://….ondigitalocean.app` → **Admin** tab with your superadmin credentials.

### Docker (optional Droplet)

```bash
docker build -t selfie-api ./backend
docker run -p 8080:8080 --env-file backend/.env selfie-api

docker build -t selfie-web ./frontend
docker run -p 80:80 selfie-web
```

---

## License / ownership

Internal GLICO application. Copyright © GLICO.
