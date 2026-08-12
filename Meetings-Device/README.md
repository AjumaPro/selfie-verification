# GLICO Meetings — mobile / on-device PWA

Standalone installable app with **all website Meetings features**, and **no Image Recognition**.

## Features (parity with web Meetings)

| Area | Functions |
|------|-----------|
| Host planner | Create / edit / delete, status, categories, priorities |
| Schedule | Date/time, duration, recurrence series expansion |
| Place | Optional/required map pin, radius, OSM / GPS picker |
| Format | In-person vs online, join link |
| Meals | Breakfast / lunch / dinner menu + guest choices |
| Program | Text schedule + file upload (PDF/image) |
| Views | Agenda, calendar, **Book with me** host page |
| Check-in | Publish meeting, QR generate/download, share link |
| Attendance | Live list, at-venue vs away GPS match, remove |
| Guests | `?join=<id>` check-in page (location consent) |
| Booking | `?book=<id>` free-slot guest booking |

## Run locally

Requires the monorepo auth/meetings API on port **4000** (Postgres):

```bash
# terminal 1 — monorepo root
npm run api

# terminal 2
cd Meetings-Device/frontend
npm install
cp .env.example .env   # optional
npm start              # http://localhost:3002  (syncs code from frontend/)
```

`npm start` / `npm run build` always **sync** Meetings components from `frontend/src`.

## Install as PWA (phone / tablet)

1. Deploy the built static site over **HTTPS** (or use localhost).
2. Open the URL on the phone browser.
3. Tap **Install app** (or browser → Add to Home Screen).
4. App opens full screen; guests still use the same host for QR/booking links.

```bash
cd Meetings-Device/frontend
npm run build
# Serve frontend/build with any static host, or reverse-proxy to same domain as API
```

Point production at your API:

```bash
# .env or build env
REACT_APP_AUTH_API_URL=https://YOUR-APP.ondigitalocean.app
```

## Relation to other packages

| Package | Purpose |
|---------|---------|
| `frontend/` (website) | Image Recognition **+** Meetings |
| `Selfie-Verification-Device/` | Recognition / KYC device (no Meetings) |
| **`Meetings-Device/`** | Meetings-only PWA (this app) |

## Notes

- No login required for Meetings (same as web).
- QR check-in and location need **HTTPS** (or localhost) and user GPS permission.
- Keep this package in sync via `npm run sync` after Meetings changes in `frontend/`.
