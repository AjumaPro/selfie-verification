# Image Verification - Testing Checklist

This checklist helps you verify that the image verification feature is working correctly.

## ✅ Pre-requisites

### 1. Environment Configuration

- [ ] `.env` file exists in the `frontend` directory
- [ ] `.env` file contains `REACT_APP_API_BASE_URL`
- [ ] `.env` file contains `REACT_APP_DEFAULT_USER_ID`
- [ ] `.env` file contains `REACT_APP_DEFAULT_MERCHANT_KEY`
- [ ] `.env` file contains `REACT_APP_DEFAULT_CENTER` (optional, defaults to 'BRANCHLESS')
- [ ] Development server has been restarted after creating/modifying `.env`

### 2. Check Browser Console

Open browser console (F12) and verify:
- [ ] No errors on page load
- [ ] Console shows: "Base URL loaded from .env: [your-url]"
- [ ] Console shows: "User ID loaded from .env"
- [ ] Console shows: "Merchant Key loaded from .env"

If you see warnings instead, check your `.env` file configuration.

---

## 🧪 Testing KYC Face Verification

### Test 1: Basic Verification Flow

1. [ ] Navigate to "KYC Face Verification" tab
2. [ ] Enter a valid Ghana card number (format: `GHA-xxxxxxxxx-x`)
3. [ ] Upload an image OR click "Take Live Selfie"
4. [ ] Click "Verify KYC" button
5. [ ] Verify button shows "Verifying..." during processing
6. [ ] Image processing info appears (dimensions, size)
7. [ ] Verification result appears with status code

### Test 2: Validation Checks

1. [ ] Try to verify without entering Ghana card number → Should show error
2. [ ] Try to verify without uploading image → Should show error
3. [ ] Enter invalid Ghana card number format → Should allow (format validation is lenient)
4. [ ] Verify button is disabled when required fields are missing

### Test 3: Image Processing

1. [ ] Upload a large image (>1MB) → Should be compressed automatically
2. [ ] Upload a small image (<640x480) → Should be resized to meet minimum requirements
3. [ ] Upload different image formats (JPG, PNG) → Should convert to PNG
4. [ ] Check console for image processing logs

### Test 4: API Response Handling

1. [ ] Successful verification (Code 00) → Shows green success message
2. [ ] Failed verification (Code 01) → Shows error message with details
3. [ ] Invalid data (Code 02) → Shows appropriate error
4. [ ] Watch list (Code 03) → Shows NIA watch list message
5. [ ] Server error (Code 04) → Shows internal server error message

### Test 5: Camera Capture

1. [ ] Click "Take Live Selfie" button
2. [ ] Camera permission prompt appears
3. [ ] Allow camera access
4. [ ] Camera preview appears
5. [ ] Click "Capture" button
6. [ ] Image is captured and displayed
7. [ ] Click "Confirm" to use the image
8. [ ] Image appears in the upload area
9. [ ] Can verify with captured image

---

## 🧪 Testing Yes/No Face Verification

### Test 1: Basic Verification Flow

1. [ ] Navigate to "Yes/No Face Verification" tab
2. [ ] Enter a valid Ghana card number
3. [ ] Upload an image OR take a selfie
4. [ ] Click "Verify Face" button
5. [ ] Verification result appears

### Test 2: Same Validation Checks as KYC

- [ ] All validation checks from KYC tests apply here too

---

## 🔍 Debugging Tips

### If Verification Fails

1. **Check Browser Console**
   - Look for error messages
   - Check network tab for API call details
   - Verify API request payload

2. **Check API Response**
   - Open browser DevTools → Network tab
   - Find the API request (filter by "verification")
   - Check request payload (should include base64 image)
   - Check response status and body

3. **Verify Configuration**
   - Check `.env` file has all required variables
   - Restart development server after `.env` changes
   - Verify Base URL format (no trailing slash)

4. **Check Image Processing**
   - Console should show image processing logs
   - Verify image dimensions meet requirements (640x480 minimum)
   - Verify image size is under 1MB
   - Verify image format is PNG

### Common Issues

#### Issue: "Base URL is not configured"
- **Solution**: Add `REACT_APP_API_BASE_URL` to `.env` file and restart server

#### Issue: "User ID is not configured"
- **Solution**: Add `REACT_APP_DEFAULT_USER_ID` to `.env` file and restart server

#### Issue: "Merchant Key is not configured"
- **Solution**: Add `REACT_APP_DEFAULT_MERCHANT_KEY` to `.env` file and restart server

#### Issue: Network error / Failed to fetch
- **Solution**: 
  - Check Base URL is correct
  - Verify API server is accessible
  - Check CORS settings on API server
  - Check browser console for detailed error

#### Issue: Image too large
- **Solution**: Image processing should handle this automatically, but check console logs

#### Issue: Camera not working
- **Solution**: 
  - Check browser permissions
  - Use HTTPS (required for camera access)
  - Try different browser
  - Check browser console for permission errors

---

## ✅ Expected Behavior

### Successful Verification Flow

1. User enters Ghana card number
2. User uploads/takes image
3. User clicks "Verify" button
4. Image is processed (resized, compressed, converted to PNG)
5. API request is sent with:
   - Base64 encoded image
   - Ghana card number (PIN)
   - User ID (from .env)
   - Merchant Key (from .env)
   - Center (from .env)
6. API response is received
7. Result is displayed with:
   - Status code
   - Verification status
   - Transaction details
   - Person data (if available)

### Error Handling

- All errors show user-friendly messages
- Network errors show specific error details
- Validation errors prevent API calls
- API errors show response codes and messages

---

## 📝 Test Results Template

```
Date: ___________
Tester: ___________

Environment:
- Base URL: [ ] Configured [ ] Not configured
- User ID: [ ] Configured [ ] Not configured
- Merchant Key: [ ] Configured [ ] Not configured

KYC Verification:
- Basic flow: [ ] Pass [ ] Fail
- Validation: [ ] Pass [ ] Fail
- Image processing: [ ] Pass [ ] Fail
- API response: [ ] Pass [ ] Fail
- Camera capture: [ ] Pass [ ] Fail

Yes/No Verification:
- Basic flow: [ ] Pass [ ] Fail
- Validation: [ ] Pass [ ] Fail

Issues Found:
1. ________________________________
2. ________________________________
3. ________________________________

Notes:
___________________________________
___________________________________
```

---

## 🎯 Quick Test

**Fastest way to verify it works:**

1. Ensure `.env` file is configured
2. Restart development server
3. Open app in browser
4. Go to "KYC Face Verification" tab
5. Enter any Ghana card number (e.g., `GHA-123456789-1`)
6. Upload any face image
7. Click "Verify KYC"
8. Check if:
   - Loading indicator appears
   - Image processing info shows
   - API call is made (check Network tab)
   - Result appears (success or error)

If all steps complete without errors, the verification system is working! ✅
