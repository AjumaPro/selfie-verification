/**
 * Third-Party Face Verification API Service
 * Integrates with external verification API
 */

import * as faceapi from 'face-api.js';
import { loadModels } from './faceDetection';

/**
 * Convert image file to base64 string
 * This function reads an image file and converts it to a base64-encoded string
 * @param {File} file - The image file to convert
 * @returns {Promise<string>} Promise that resolves to base64 string
 */
export const imageToBase64 = (file) => {
  // Return a Promise to handle asynchronous file reading
  return new Promise((resolve, reject) => {
    // Create a FileReader instance to read the file
    const reader = new FileReader();
    // Callback function executed when file reading completes successfully
    reader.onload = () => {
      // reader.result contains "data:image/png;base64,<base64string>"
      // Split by comma to separate the prefix from the base64 data
      // Take the second part [1] which is the actual base64 string
      // Fallback to reader.result if split doesn't work
      const base64String = reader.result.split(',')[1] || reader.result;
      // Resolve the promise with the base64 string
      resolve(base64String);
    };
    // Callback function executed if file reading fails
    reader.onerror = reject;
    // Start reading the file as a data URL (base64 encoded)
    reader.readAsDataURL(file);
  });
};

/**
 * NIA / Selfie API image standard:
 * - Live / clear portrait of the person
 * - Cropped output: exactly 640 x 480
 * - Format: PNG
 * - File size: < 1 MB
 * - Prefer source resolution ≥ ~500×500; face must fill the frame
 */
export const IMAGE_STANDARD = {
  width: 640,
  height: 480,
  maxBytes: 1 * 1024 * 1024, // 1 MB
  format: 'PNG',
  mimeType: 'image/png',
  preferredMinSide: 500,
  minFaceFillRatio: 0.45,
  facePadding: 0.55,
};

/**
 * Average brightness 0–255 from canvas pixel data
 */
const getAverageBrightness = (ctx, width, height) => {
  const { data } = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / 4);
};

/**
 * Load a File/Blob into an HTMLImageElement
 */
const fileToImage = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No image file provided'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image. Use a JPEG or PNG from your device.'));
    };
    img.src = url;
  });

/**
 * Build a 4:3 crop rectangle centered on the face box, with padding.
 */
const getFaceCropRect = (imgWidth, imgHeight, box, padding) => {
  const targetRatio = IMAGE_STANDARD.width / IMAGE_STANDARD.height;
  const faceCx = box.x + box.width / 2;
  const faceCy = box.y + box.height / 2;

  let cropW = box.width * (1 + padding * 2);
  let cropH = box.height * (1 + padding * 2);

  if (cropW / cropH > targetRatio) {
    cropH = cropW / targetRatio;
  } else {
    cropW = cropH * targetRatio;
  }

  const faceFill = Math.min(box.width / cropW, box.height / cropH);
  if (faceFill < IMAGE_STANDARD.minFaceFillRatio) {
    const scale = faceFill / IMAGE_STANDARD.minFaceFillRatio;
    cropW *= scale;
    cropH *= scale;
    if (cropW / cropH > targetRatio) {
      cropH = cropW / targetRatio;
    } else {
      cropW = cropH * targetRatio;
    }
  }

  cropW = Math.min(cropW, imgWidth);
  cropH = Math.min(cropH, imgHeight);
  if (cropW / cropH > targetRatio) {
    cropH = Math.min(cropW / targetRatio, imgHeight);
    cropW = cropH * targetRatio;
  } else {
    cropW = Math.min(cropH * targetRatio, imgWidth);
    cropH = cropW / targetRatio;
  }

  let sx = faceCx - cropW / 2;
  let sy = faceCy - cropH / 2;
  sx = Math.max(0, Math.min(sx, imgWidth - cropW));
  sy = Math.max(0, Math.min(sy, imgHeight - cropH));

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.max(1, Math.round(cropW)),
    sh: Math.max(1, Math.round(cropH)),
  };
};

/** Center cover-crop to 4:3 when face detection is unavailable */
const getCenterCoverRect = (imgWidth, imgHeight) => {
  const targetRatio = IMAGE_STANDARD.width / IMAGE_STANDARD.height;
  const srcRatio = imgWidth / imgHeight;
  if (srcRatio > targetRatio) {
    const sw = Math.round(imgHeight * targetRatio);
    return { sx: Math.round((imgWidth - sw) / 2), sy: 0, sw, sh: imgHeight };
  }
  const sh = Math.round(imgWidth / targetRatio);
  return { sx: 0, sy: Math.round((imgHeight - sh) / 2), sw: imgWidth, sh };
};

/**
 * Encode canvas as PNG under 1MB using toDataURL (avoids Blob/FileReader issues).
 */
const canvasToPngResult = (canvas, brightness) => {
  const { width: OUT_W, height: OUT_H, maxBytes } = IMAGE_STANDARD;
  let dataUrl = canvas.toDataURL('image/png');
  let base64 = dataUrl.split(',')[1] || '';
  let size = Math.ceil((base64.length * 3) / 4);

  if (size > maxBytes) {
    // Shrink via JPEG intermediate, then re-export PNG
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.82);
    const tmp = document.createElement('canvas');
    tmp.width = OUT_W;
    tmp.height = OUT_H;
    const tctx = tmp.getContext('2d');
    const img = new Image();
    // Synchronous path not possible for Image load — use draw from original with lower fidelity:
    // Draw white bg and re-encode as PNG after painting JPEG into an Image is async.
    // Instead: use createImageBitmap-free approach — draw jpeg via temporary Image in Promise.
    return new Promise((resolve, reject) => {
      img.onload = () => {
        tctx.fillStyle = '#fff';
        tctx.fillRect(0, 0, OUT_W, OUT_H);
        tctx.drawImage(img, 0, 0, OUT_W, OUT_H);
        dataUrl = tmp.toDataURL('image/png');
        base64 = dataUrl.split(',')[1] || '';
        size = Math.ceil((base64.length * 3) / 4);
        if (size > maxBytes) {
          reject(
            new Error(
              `Processed image is ${(size / (1024 * 1024)).toFixed(2)}MB. Portrait must be under 1MB (PNG, 640×480).`
            )
          );
          return;
        }
        resolve({
          base64,
          dataUrl,
          dataType: 'PNG',
          size,
          width: OUT_W,
          height: OUT_H,
          brightness: Math.round(brightness),
          faceCropped: true,
        });
      };
      img.onerror = () => reject(new Error('Failed to compress image under 1MB'));
      img.src = jpegUrl;
    });
  }

  return Promise.resolve({
    base64,
    dataUrl,
    dataType: 'PNG',
    size,
    width: OUT_W,
    height: OUT_H,
    brightness: Math.round(brightness),
    faceCropped: true,
  });
};

/**
 * Detect face (when possible), crop to exactly 640×480 PNG under 1 MB.
 * Works for device gallery picks and live camera captures.
 * @param {File|Blob} file
 */
export const processImageForAPI = async (file) => {
  const { width: OUT_W, height: OUT_H, facePadding, preferredMinSide } = IMAGE_STANDARD;

  if (!file || !(file instanceof Blob)) {
    throw new Error('Invalid image file. Please pick a photo from your device or take a live selfie.');
  }

  const img = await fileToImage(file);

  // Upscale path is allowed so gallery photos can still meet 640×480 output
  if (img.width < 100 || img.height < 100) {
    throw new Error(
      `Image too small (${img.width}×${img.height}). Use a clearer photo (prefer at least ${preferredMinSide}×${preferredMinSide}px).`
    );
  }

  await loadModels();

  let detections = [];
  try {
    detections = await faceapi
      .detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 })
      )
      .withFaceLandmarks();
  } catch (err) {
    console.warn('Face detection for crop failed:', err);
  }

  let sx;
  let sy;
  let sw;
  let sh;
  let faceCropped = false;

  if (detections && detections.length > 0) {
    const primary = detections.reduce((best, d) => {
      const area = d.detection.box.width * d.detection.box.height;
      const bestArea = best.detection.box.width * best.detection.box.height;
      return area > bestArea ? d : best;
    });
    const box = primary.detection.box;
    ({ sx, sy, sw, sh } = getFaceCropRect(img.width, img.height, box, facePadding));
    faceCropped = true;
  } else {
    // Still crop to 640×480 standard so device picks are normalized
    ({ sx, sy, sw, sh } = getCenterCoverRect(img.width, img.height));
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

  const brightness = getAverageBrightness(ctx, OUT_W, OUT_H);
  if (brightness < 35) {
    throw new Error(
      'Insufficient lighting. Pick a clearer photo or retake with enough light so the face is identifiable.'
    );
  }
  if (brightness > 248) {
    throw new Error(
      'Image is overexposed. Pick another photo or retake with more even lighting.'
    );
  }

  const result = await canvasToPngResult(canvas, brightness);
  result.faceCropped = faceCropped;
  result.sourceWidth = img.width;
  result.sourceHeight = img.height;
  return result;
};

/**
 * Crop a device-picked (or camera) image to API standard and return a PNG File + preview.
 * Call this as soon as the user selects an image from the gallery.
 */
export const cropPickedImageToStandard = async (file) => {
  const processed = await processImageForAPI(file);
  const binary = atob(processed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pngFile = new File([bytes], 'selfie-640x480.png', { type: 'image/png' });
  return {
    file: pngFile,
    previewUrl: processed.dataUrl,
    info: {
      width: processed.width,
      height: processed.height,
      size: processed.size,
      dataType: processed.dataType,
      faceCropped: processed.faceCropped,
      sourceWidth: processed.sourceWidth,
      sourceHeight: processed.sourceHeight,
    },
  };
};

/**
 * KYC Face Verification
 * POST /api/v1/third-party/verification/base_64/verification/kyc/face
 */
/**
 * KYC Face Verification API Call
 * Sends face image to KYC verification endpoint
 * POST /api/v1/third-party/verification/base_64/verification/kyc/face
 * @param {Object} config - Configuration object with API parameters
 * @param {string} config.baseUrl - Base URL of the API
 * @param {string} config.pinNumber - PIN Number for verification
 * @param {string} config.imageBase64 - Base64 encoded image string
 * @param {string} config.dataType - Image data type (default: 'PNG')
 * @param {string} config.center - Center value (default: 'BRANCHLESS')
 * @param {string} config.userId - User ID for verification
 * @param {string} config.merchantKey - Merchant key for authentication
 * @returns {Promise<Object>} Promise that resolves to API response data
 */
export const kycFaceVerification = async (config) => {
  // Destructure configuration object to extract individual parameters
  const {
    baseUrl,  // Base URL of the API server
    pinNumber,  // PIN Number entered by user
    imageBase64,  // Base64 encoded image string
    dataType,  // Image format (PNG)
    center,  // Center value (BRANCHLESS)
    userId,  // User ID entered by user
    merchantKey  // Merchant key entered by user
  } = config;

  // Construct request body object matching API requirements exactly as per specification
  // API Spec: { pinNumber, image, dataType, center, userID, merchantKey }
  const requestBody = {
    pinNumber: pinNumber,  // PIN Number (Ghana card number format: GHA-xxxxxxxxx-x)
    image: imageBase64,  // Base64 encoded image string (PNG format, <1MB, 640x480 minimum)
    dataType: dataType || 'PNG',  // Image data type (must be 'PNG' as per spec)
    center: center || 'BRANCHLESS',  // Center value (default: 'BRANCHLESS')
    userID: userId,  // User ID (note: API expects 'userID' not 'userId' - matches spec)
    merchantKey: merchantKey  // Merchant authentication key
  };

  // Construct full API URL by cleaning base URL and appending endpoint
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');  // Remove trailing slashes using regex
  const endpoint = '/api/v1/third-party/verification/base_64/verification/kyc/face';  // API endpoint path
  const fullUrl = `${cleanBaseUrl}${endpoint}`;  // Combine base URL with endpoint

  // Log API call details to console for debugging (without sensitive data)
  console.log('KYC Verification API Call:', {
    method: 'POST',  // HTTP method
    url: fullUrl,  // Complete API URL
    endpoint: endpoint,  // Endpoint path
    requestBodyKeys: Object.keys(requestBody),  // Request body keys (without values for security)
    imageSize: imageBase64 ? `${Math.round(imageBase64.length / 1024)}KB` : 'N/A',  // Approximate image size
    dataType: requestBody.dataType,  // Image data type
    center: requestBody.center  // Center value
  });

  // Wrap API call in try-catch to handle errors
  try {
    // Make HTTP POST request to API endpoint
    const response = await fetch(
      fullUrl,  // Complete API URL
      {
        method: 'POST',  // HTTP method
        headers: {
          'Content-Type': 'application/json',  // Set content type to JSON
        },
        body: JSON.stringify(requestBody),  // Convert request body to JSON string
      }
    );

    // Attempt to parse JSON response body (even on HTTP error) so UI can display details
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseError) {
      console.error('KYC Verification: Failed to parse JSON response:', parseError, rawText);
      throw new Error(
        `Verification failed: HTTP ${response.status} - ${response.statusText} (invalid JSON response)`
      );
    }

    // Log HTTP errors but still return parsed JSON so the UI can show server details
    if (!response.ok) {
      console.error('KYC Verification: HTTP error response from API:', {
        status: response.status,
        statusText: response.statusText,
        body: data,
      });
      // Attach HTTP status info so the UI / raw viewer can show it
      return {
        ...data,
        httpStatus: response.status,
        httpStatusText: response.statusText,
      };
    }

    // For successful HTTP responses:
    // API Spec Response Structure:
    // {
    //   "data": {
    //     "transactionGuid": "...",
    //     "requestTimestamp": "YYYY-MM-DD",
    //     "responseTimestamp": "YYYY-MM-DD",
    //     "verified": "TRUE",
    //     "person": { ... },
    //     "success": true,
    //     "timestamp": "YYYY-MM-DD",
    //     "code": "00"
    //   }
    // }
    // Log successful response to console (without sensitive person data)
    console.log('KYC Verification API Response:', {
      status: response.status,  // HTTP status code
      code: data.data?.code || data.code || 'N/A',  // Verification code
      verified: data.data?.verified || 'N/A',  // Verification status
      success: data.data?.success !== undefined ? data.data.success : data.success,  // Success flag
      transactionGuid: data.data?.transactionGuid || 'N/A',  // Transaction GUID
      hasPersonData: !!data.data?.person  // Whether person data exists (without logging it)
    });
    
    // Return the response data (full structure as returned by API)
    return data;
  } catch (error) {
    // Log error to console for debugging
    console.error('KYC Verification Error:', error);
    // Check if error is a network error (connection failed)
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      // Throw user-friendly network error message
      throw new Error(`Network error: Unable to connect to API. Please check the Base URL: ${baseUrl}`);
    }
    // Throw generic error with original error message
    throw new Error(`Verification failed: ${error.message}`);
  }
};

/**
 * Yes/No Face Verification API Call
 * Sends face image to Yes/No verification endpoint (simpler than KYC)
 * POST /api/v1/third-party/verification/yes_no/face
 * @param {Object} config - Configuration object with API parameters
 * @param {string} config.baseUrl - Base URL of the API
 * @param {string} config.pinNumber - PIN Number for verification
 * @param {string} config.imageBase64 - Base64 encoded image string
 * @param {string} config.dataType - Image data type (default: 'PNG')
 * @param {string} config.center - Center value (default: 'BRANCHLESS')
 * @param {string} config.userId - User ID for verification
 * @param {string} config.merchantKey - Merchant key for authentication
 * @returns {Promise<Object>} Promise that resolves to API response data
 */
export const yesNoFaceVerification = async (config) => {
  // Destructure configuration object to extract individual parameters
  const {
    baseUrl,  // Base URL of the API server
    pinNumber,  // PIN Number entered by user
    imageBase64,  // Base64 encoded image string
    dataType,  // Image format (PNG)
    center,  // Center value (BRANCHLESS)
    userId,  // User ID entered by user
    merchantKey  // Merchant key entered by user
  } = config;

  // Construct request body object matching API requirements exactly as per specification
  // API Spec: { pinNumber, image, dataType, center, userID, merchantKey }
  const requestBody = {
    pinNumber: pinNumber,  // PIN Number (Ghana card number format: GHA-xxxxxxxxx-x)
    image: imageBase64,  // Base64 encoded image string (PNG format, <1MB, 640x480 minimum)
    dataType: dataType || 'PNG',  // Image data type (must be 'PNG' as per spec)
    center: center || 'BRANCHLESS',  // Center value (default: 'BRANCHLESS')
    userID: userId,  // User ID (note: API expects 'userID' not 'userId' - matches spec)
    merchantKey: merchantKey  // Merchant authentication key
  };

  // Construct full API URL by cleaning base URL and appending endpoint
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');  // Remove trailing slashes using regex
  const endpoint = '/api/v1/third-party/verification/yes_no/face';  // API endpoint path
  const fullUrl = `${cleanBaseUrl}${endpoint}`;  // Combine base URL with endpoint

  // Log API call details to console for debugging (without sensitive data)
  console.log('Yes/No Verification API Call:', {
    method: 'POST',  // HTTP method
    url: fullUrl,  // Complete API URL
    endpoint: endpoint,  // Endpoint path
    requestBodyKeys: Object.keys(requestBody),  // Request body keys (without values for security)
    imageSize: imageBase64 ? `${Math.round(imageBase64.length / 1024)}KB` : 'N/A',  // Approximate image size
    dataType: requestBody.dataType,  // Image data type
    center: requestBody.center  // Center value
  });

  // Wrap API call in try-catch to handle errors
  try {
    // Make HTTP POST request to API endpoint
    const response = await fetch(
      fullUrl,  // Complete API URL
      {
        method: 'POST',  // HTTP method
        headers: {
          'Content-Type': 'application/json',  // Set content type to JSON
        },
        body: JSON.stringify(requestBody),  // Convert request body to JSON string
      }
    );

    // Attempt to parse JSON response body (even on HTTP error) so UI can display details
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseError) {
      console.error('Yes/No Verification: Failed to parse JSON response:', parseError, rawText);
      throw new Error(
        `Verification failed: HTTP ${response.status} - ${response.statusText} (invalid JSON response)`
      );
    }

    // Log HTTP errors but still return parsed JSON so the UI can show server details
    if (!response.ok) {
      console.error('Yes/No Verification: HTTP error response from API:', {
        status: response.status,
        statusText: response.statusText,
        body: data,
      });
      // Attach HTTP status info so the UI / raw viewer can show it
      return {
        ...data,
        httpStatus: response.status,
        httpStatusText: response.statusText,
      };
    }

    // For successful HTTP responses:
    // API Spec Response Structure:
    // {
    //   "data": {
    //     "transactionGuid": "...",
    //     "requestTimestamp": "YYYY-MM-DD",
    //     "responseTimestamp": "YYYY-MM-DD",
    //     "verified": "TRUE",
    //     "person": { ... },
    //     "success": true,
    //     "timestamp": "YYYY-MM-DD",
    //     "code": "00"
    //   }
    // }
    // Log successful response to console (without sensitive person data)
    console.log('Yes/No Verification API Response:', {
      status: response.status,  // HTTP status code
      code: data.data?.code || data.code || 'N/A',  // Verification code
      verified: data.data?.verified || 'N/A',  // Verification status
      success: data.data?.success !== undefined ? data.data.success : data.success,  // Success flag
      transactionGuid: data.data?.transactionGuid || 'N/A',  // Transaction GUID
      hasPersonData: !!data.data?.person  // Whether person data exists (without logging it)
    });
    
    // Return the response data (full structure as returned by API)
    return data;
  } catch (error) {
    // Log error to console for debugging
    console.error('Yes/No Verification Error:', error);
    // Check if error is a network error (connection failed)
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      // Throw user-friendly network error message
      throw new Error(`Network error: Unable to connect to API. Please check the Base URL: ${baseUrl}`);
    }
    // Throw generic error with original error message
    throw new Error(`Verification failed: ${error.message}`);
  }
};

/**
 * Get human-readable message for API response code
 * Converts numeric API response codes to descriptive messages
 * @param {string} code - API response code (e.g., '00', '01', '02')
 * @returns {string} Human-readable message describing the code
 */
export const getCodeMessage = (code) => {
  const messages = {
    '00': 'Successful Verification',
    '01': 'Unsuccessful Verification - Check data for details',
    '02': 'Invalid Data',
    '03': 'On NIA watch list - Person needs to go to NIA office to resolve issue',
    '04': 'Internal Server Error',
    '11': 'Face too small — move closer and retake a live close-up portrait',
  };
  return messages[code] || `Unknown code: ${code}`;
};
