# Selfie Verification — Device Install version

Standalone copy of the streamlined selfie verification app.

## What’s included

- **Verify Selfie** (Ghana Card + face → KYC API)
- **Install on your device** (PWA — Android / iPhone / desktop)
- Image crop to **640×480 PNG under 1MB**
- Save results as **PDF** or **image**

## Setup

```bash
cd frontend
npm install
npm run download-models   # optional but recommended
npm start
```

Open http://localhost:3000

Configure API credentials in `frontend/.env` (see `ENV_TEMPLATE.txt`).

## Note

This folder is separate from `IMAGE recognition`. Changes here do not update the original project unless you copy them back.
