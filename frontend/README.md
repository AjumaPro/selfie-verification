# Face Recognition React App

A standalone React application for face detection and verification that runs entirely in the browser.

## Installation

```bash
npm install
```

## Download Models (Recommended)

For faster loading and offline use:

```bash
node download-models.js
```

This downloads the face detection models to `public/models/`.

## Development

```bash
npm start
```

Opens at `http://localhost:3000`

## Production Build

```bash
npm run build
```

## Features

- Face detection
- Selfie verification
- Face comparison with reference images
- All processing happens in the browser
- No backend required

## Technologies

- React 18
- face-api.js for face detection
- Pure client-side processing
