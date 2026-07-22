# DigitalOcean — fix “No components detected”

This is a **monorepo**. There is **no** `package.json` at the repo root, so App Platform cannot autodetect from `/`.

Apps live in:

| Folder | Role |
|--------|------|
| `backend/` | Node API (`package.json` + Dockerfile) |
| `frontend/` | React UI (`package.json` + Dockerfile) |

---

## Option A — Recommended: upload App Spec

1. DigitalOcean → **Apps** → **Create App**
2. Choose **GitHub** is optional; easier: use **App Spec** / “Upload app spec” / “Edit YAML”
3. Upload or paste: [`.do/app.yaml`](./.do/app.yaml)
4. Replace every `REPLACE_WITH_…` env value (Database URL, JWT secret, superadmin password, KYC keys)
5. Create resources → Deploy

---

## Option B — GitHub UI (manual source directories)

1. **Create App** → GitHub → `AjumaPro/selfie-verification` → branch `main`
2. On the detect screen, set **Source Directory** to:

   ```text
   backend
   ```

   (not blank / not `/`)

3. Confirm it detects a **Node.js** web service. Set:
   - HTTP port: `8080`
   - Run command: `npm run start:prod`
   - Routes: `/api` and `/health` (or edit after create)
4. Click **Add Resource** → **Detect from Source Code** again
5. Set **Source Directory** to:

   ```text
   frontend
   ```

6. Choose **Static Site**. Build command:

   ```text
   npm ci && node download-models.js && npm run build
   ```

   Output directory: `build`
7. Add env vars (see README “Deploy to DigitalOcean”), then deploy.

---

## Option C — Two separate apps

If the UI still fails detection, create **two apps**:

1. App 1 — Source Directory `backend`
2. App 2 — Source Directory `frontend`, with  
   `REACT_APP_AUTH_API_URL=https://YOUR-API-APP.ondigitalocean.app`

---

If the build log says **“This app may not specify any way to start a node process”**, DigitalOcean built the **repo root**. Fix:

1. App → component → **Settings** → **Source Directory** = `backend`
2. **Run Command** = `npm run start:prod`
3. **HTTP Port** = `8080`
4. Redeploy

Or rely on the root `Procfile` / `"start"` script (launches the API from `backend/`).
