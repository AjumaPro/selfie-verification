# Selfie Verification — Device build

On-device package (PWA / local / desktop parity): **same web features as production except Meetings**.

## Included (matches web)

- Authentication: **Sign in · Register · Super Admin**
- Stay signed in on this device
- Image Recognition / Ghana Card KYC / face-api
- Super Admin dashboard
- Install helpers (PWA / desktop download links)
- Results PDF & image export
- Mobile-friendly UI

## Not included

- **Meetings** (host, QR check-in, booking, map venue) — use the **website** for that

## Setup

```bash
cd frontend
npm install
npm run download-models
# Point auth at API (remote DO or local Postgres API):
# REACT_APP_AUTH_API_URL=https://YOUR-APP.ondigitalocean.app
npm start
```

## Windows / Mac installers

Built from the main monorepo `frontend/` with Electron (device mode hides Meetings automatically):

```bash
cd frontend
export REACT_APP_DEVICE_APP=true
export REACT_APP_AUTH_API_URL=https://YOUR-APP.ondigitalocean.app
npm run electron:build
```
