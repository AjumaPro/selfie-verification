# DigitalOcean deploy (App Platform + Managed Postgres)

## Current setup (recommended)

One **web** service serves API + UI. Postgres is a **DigitalOcean managed database** named `db`, bound as:

```text
DATABASE_URL=${db.DATABASE_URL}
```

Defined in [`.do/app.yaml`](./.do/app.yaml).

### Attach Postgres to an existing app (Control Panel)

1. Open your app → **Resources** → **Add Resource** → **Database**
2. Choose **PostgreSQL** (Dev DB is fine to start; upgrade later)
3. Name it **`db`** (must match the app spec), or note the name
4. App → **Settings** → your **web** component → **Environment Variables**
5. Set:

   | Key | Value |
   |-----|--------|
   | `DATABASE_URL` | `${db.DATABASE_URL}` |

   If you named the database something else (e.g. `postgres-db`), use `${postgres-db.DATABASE_URL}`.

7. **Save** → **Deploy**. On boot, `npm start` runs migrations against DO Postgres.

### Create / update from App Spec

1. Apps → your app → **Settings** → **App Spec** → Edit
2. Paste/upload [`.do/app.yaml`](./.do/app.yaml)
3. Replace `REPLACE_WITH_…` secrets (`JWT_SECRET`, superadmin, KYC keys)
4. Keep `DATABASE_URL: ${db.DATABASE_URL}`
5. Save → redeploy

---

## “No components detected”

This is a monorepo. Prefer the **root** single-service setup in `.do/app.yaml` (`source_dir: /` with `npm run build` + `npm start`).

Or set Source Directory explicitly to `backend` / `frontend` (see older multi-component notes in git history).

---

## “Cannot GET /”

Root deploy must run **`npm run build`** (copies UI into `backend/public`) before **`npm start`**.

---

## Local vs DigitalOcean DB

| Environment | `DATABASE_URL` |
|-------------|----------------|
| Local | DigitalOcean Postgres URL in `backend/.env` |
| DigitalOcean | `${db.DATABASE_URL}` from managed Postgres |

SSL for DO Postgres is handled in `backend/src/db/pool.js`.
