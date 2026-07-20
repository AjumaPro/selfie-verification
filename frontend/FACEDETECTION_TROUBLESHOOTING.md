# Face Detection Troubleshooting Guide

If Face Detection is not working, follow these steps to diagnose and fix the issue.

## Common Issues and Solutions

### 1. Models Not Loading

**Symptoms:**
- App shows "Loading Face Detection Models..." indefinitely
- Error message: "Failed to load face detection models"
- Console shows model loading errors

**Solutions:**

#### Option A: Download Models Locally (Recommended)
```bash
cd frontend
node download-models.js
```

This downloads models to `public/models/` directory. After downloading, restart the dev server:
```bash
npm start
```

#### Option B: Check Internet Connection
If models are loading from CDN, ensure you have an active internet connection. The app will automatically fall back to CDN if local models are not found.

#### Option C: Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for errors related to model loading
4. Check Network tab to see if model files are being downloaded

### 2. "No Face Detected" When Face is Present

**Possible Causes:**
- Image quality too low
- Face too small in image
- Poor lighting
- Face partially obscured
- Image format not supported

**Solutions:**
- Use a clear, well-lit image
- Ensure face takes up at least 10-20% of the image
- Try a different image format (JPG, PNG)
- Ensure face is clearly visible and not obscured

### 3. Error: "Face detection failed"

**Check Browser Console:**
1. Open DevTools (F12)
2. Check Console for detailed error messages
3. Look for:
   - Model loading errors
   - Image loading errors
   - Network errors
   - TensorFlow.js errors

**Common Error Messages:**

#### "Failed to load face detection models"
- **Solution:** Download models locally or check internet connection

#### "Failed to load image"
- **Solution:** Try a different image file, check file format

#### "Network error"
- **Solution:** Check internet connection if using CDN models

### 4. Models Directory Missing

**Check if models directory exists:**
```bash
ls -la frontend/public/models
```

**If missing, create and download:**
```bash
mkdir -p frontend/public/models
cd frontend
node download-models.js
```

### 5. Browser Compatibility Issues

**Supported Browsers:**
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

**If using older browser:**
- Update to latest version
- Enable JavaScript
- Check if WebGL is enabled (required for TensorFlow.js)

### 6. CORS Issues (CDN Models)

If loading models from CDN fails due to CORS:
- Download models locally instead
- Run: `node download-models.js`

## Debugging Steps

### Step 1: Check Browser Console
1. Open DevTools (F12)
2. Go to Console tab
3. Look for error messages
4. Check for warnings about models

### Step 2: Check Network Tab
1. Open DevTools (F12)
2. Go to Network tab
3. Try to detect a face
4. Look for failed requests (red)
5. Check if model files are loading

### Step 3: Verify Models Are Loaded
1. Open browser console
2. Type: `window.faceapi` (if available)
3. Check if models are loaded

### Step 4: Test with Simple Image
1. Use a clear, front-facing photo
2. Ensure good lighting
3. Face should be clearly visible
4. Try with different image formats

### Step 5: Check File Permissions
Ensure the app has permission to:
- Read image files
- Access camera (if using camera capture)
- Load models from local directory or CDN

## Expected Console Output

When working correctly, you should see:
```
Loading face detection models...
Models loaded successfully
Loading image...
Image loaded: { width: 640, height: 480 }
Detecting faces...
Face detection complete: { count: 1 }
Liveness score calculated: 0.85
Detection result: { success: true, face_detected: true, ... }
```

## Quick Fix Checklist

- [ ] Models downloaded locally (`node download-models.js`)
- [ ] Dev server restarted after downloading models
- [ ] Browser console checked for errors
- [ ] Internet connection active (if using CDN)
- [ ] Image file is valid and readable
- [ ] Browser is up to date
- [ ] JavaScript is enabled
- [ ] No browser extensions blocking requests

## Still Not Working?

1. **Clear browser cache:**
   - Chrome: Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
   - Select "Cached images and files"
   - Clear data

2. **Try incognito/private mode:**
   - This disables extensions that might interfere

3. **Check for console errors:**
   - Share the exact error message
   - Include browser and version

4. **Verify file structure:**
   ```
   frontend/
   ├── public/
   │   └── models/
   │       ├── tiny_face_detector_model-weights_manifest.json
   │       ├── tiny_face_detector_model-shard1
   │       ├── face_landmark_68_model-weights_manifest.json
   │       ├── face_landmark_68_model-shard1
   │       ├── face_recognition_model-weights_manifest.json
   │       ├── face_recognition_model-shard1
   │       ├── face_recognition_model-shard2
   │       ├── face_expression_model-weights_manifest.json
   │       └── face_expression_model-shard1
   ```

5. **Reinstall dependencies:**
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```

## Contact for Help

If none of these solutions work, please provide:
1. Browser and version
2. Operating system
3. Full error message from console
4. Steps to reproduce the issue
5. Screenshot of browser console
