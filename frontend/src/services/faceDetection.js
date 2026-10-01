import * as faceapi from 'face-api.js';

// Initialize face-api.js models
let modelsLoaded = false;
let loadingPromise = null;

/**
 * Load face-api.js models
 */
export const loadModels = async () => {
  if (modelsLoaded) {
    return true;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      console.log('Starting to load face detection models...');
      // Try to load models from local directory first
      const MODEL_URL = '/models';
      
      try {
        console.log('Attempting to load models from local directory:', MODEL_URL);
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        console.log('✓ Models loaded successfully from local directory');
      } catch (localError) {
        // Fallback to CDN if local models not found
        console.warn('Local models not found, falling back to CDN...', localError.message);
        const CDN_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
        console.log('Loading models from CDN:', CDN_URL);
        
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(CDN_URL)
          ]);
          console.log('✓ Models loaded successfully from CDN');
        } catch (cdnError) {
          console.error('Failed to load models from CDN:', cdnError);
          throw new Error(`Failed to load models from both local directory and CDN. CDN error: ${cdnError.message}. Please run 'node download-models.js' to download models locally.`);
        }
      }

      // Verify models are actually loaded
      const isTinyFaceDetectorLoaded = faceapi.nets.tinyFaceDetector.isLoaded;
      const isFaceLandmarkLoaded = faceapi.nets.faceLandmark68Net.isLoaded;
      const isFaceRecognitionLoaded = faceapi.nets.faceRecognitionNet.isLoaded;
      const isFaceExpressionLoaded = faceapi.nets.faceExpressionNet.isLoaded;
      
      console.log('Model loading status:', {
        tinyFaceDetector: isTinyFaceDetectorLoaded,
        faceLandmark68: isFaceLandmarkLoaded,
        faceRecognition: isFaceRecognitionLoaded,
        faceExpression: isFaceExpressionLoaded
      });
      
      if (!isTinyFaceDetectorLoaded || !isFaceLandmarkLoaded || !isFaceRecognitionLoaded) {
        throw new Error('Models failed to load properly. Some models are not available.');
      }

      modelsLoaded = true;
      console.log('✓ All models loaded and verified');
      return true;
    } catch (error) {
      console.error('Error loading models:', error);
      modelsLoaded = false;
      loadingPromise = null; // Reset so we can try again
      throw new Error(`Failed to load face detection models: ${error.message}. Please check your internet connection, or run 'node download-models.js' to download models locally.`);
    }
  })();

  return loadingPromise;
};

/**
 * Load image from file or URL
 */
const loadImage = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => resolve(img);
      img.onerror = reject;
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Calculate image quality metrics
 */
const calculateImageQuality = (image) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Calculate brightness
  let brightnessSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    brightnessSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const meanBrightness = brightnessSum / (data.length / 4);
  const brightnessScore = 1.0 - Math.abs(meanBrightness - 127.5) / 127.5;
  
  // Calculate contrast (standard deviation)
  let variance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    variance += Math.pow(brightness - meanBrightness, 2);
  }
  const stdDev = Math.sqrt(variance / (data.length / 4));
  const contrastScore = Math.min(stdDev / 50.0, 1.0);
  
  // Resolution score
  const resolutionScore = Math.min((image.width * image.height) / (640 * 480), 1.0);
  
  // Combined quality score
  const qualityScore = (brightnessScore * 0.3 + contrastScore * 0.4 + resolutionScore * 0.3);
  
  return Math.max(0, Math.min(1, qualityScore));
};

/**
 * Calculate liveness score based on image quality and face detection
 */
const calculateLivenessScore = (image, detections) => {
  // Check if detections exist and have valid structure
  if (!detections || detections.length === 0) {
    return 0.0;
  }

  // Validate detection structure
  const detection = detections[0];
  if (!detection || !detection.box) {
    console.warn('Invalid detection structure:', detection);
    return 0.0;
  }

  // Validate box properties
  if (typeof detection.box.width === 'undefined' || 
      typeof detection.box.height === 'undefined' ||
      typeof image.width === 'undefined' ||
      typeof image.height === 'undefined') {
    console.warn('Missing required properties in detection or image:', {
      boxWidth: detection.box.width,
      boxHeight: detection.box.height,
      imageWidth: image.width,
      imageHeight: image.height
    });
    return 0.0;
  }

  const qualityScore = calculateImageQuality(image);
  
  // Check if face is reasonably sized (not too small)
  const faceWidth = detection.box.width || 0;
  const faceHeight = detection.box.height || 0;
  const faceArea = faceWidth * faceHeight;
  const imageArea = (image.width || 1) * (image.height || 1);
  const faceRatio = imageArea > 0 ? faceArea / imageArea : 0;
  
  // Face should be at least 5% of image and not more than 80%
  const sizeScore = faceRatio >= 0.05 && faceRatio <= 0.8 ? 1.0 : Math.max(0, 1 - Math.abs(faceRatio - 0.4));
  
  // Combined liveness score
  const livenessScore = (qualityScore * 0.5 + sizeScore * 0.5);
  
  return Math.max(0, Math.min(1, livenessScore));
};

/**
 * Detect faces in an image
 */
export const detectFace = async (imageFile) => {
  try {
    console.log('Loading face detection models...');
    // Ensure models are loaded before proceeding
    await loadModels();
    console.log('Models loaded successfully');
    
    console.log('Loading image...');
    // Load the image file
    const image = await loadImage(imageFile);
    console.log('Image loaded:', { width: image.width, height: image.height });
    
    console.log('Detecting faces...');
    // Detect all faces in the image with landmarks and descriptors
    let detections;
    try {
      detections = await faceapi
        .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();
      
      // Validate detections result
      if (!detections) {
        console.warn('Face detection returned null/undefined');
        detections = [];
      } else if (!Array.isArray(detections)) {
        console.warn('Face detection returned non-array:', typeof detections);
        detections = [];
      }
    } catch (detectionError) {
      console.error('Error during face detection:', detectionError);
      detections = [];
    }
    
    console.log('Face detection complete:', { 
      count: detections ? detections.length : 0,
      detectionsType: typeof detections,
      isArray: Array.isArray(detections)
    });

    const faceCount = detections ? detections.length : 0;
    const faceDetected = faceCount > 0;
    
    // Map detection results to face locations with proper validation
    const faceLocations = [];
    if (detections && Array.isArray(detections)) {
      for (const detection of detections) {
        // Validate detection structure before accessing properties
        if (detection && detection.box && 
            typeof detection.box.x !== 'undefined' &&
            typeof detection.box.y !== 'undefined' &&
            typeof detection.box.width !== 'undefined' &&
            typeof detection.box.height !== 'undefined') {
          faceLocations.push({
            x: Math.round(detection.box.x),
            y: Math.round(detection.box.y),
            width: Math.round(detection.box.width),
            height: Math.round(detection.box.height)
          });
        } else {
          console.warn('Invalid detection structure, skipping:', detection);
        }
      }
    }

    // Calculate liveness score based on image quality and face detection
    const livenessScore = calculateLivenessScore(image, detections);
    console.log('Liveness score calculated:', livenessScore);

    // Return detection results
    const result = {
      success: true,
      face_detected: faceDetected,
      face_count: faceCount,
      face_locations: faceLocations,
      liveness_score: livenessScore,
      message: faceDetected 
        ? `Detected ${faceCount} face(s)` 
        : 'No face detected'
    };
    
    console.log('Detection result:', result);
    return result;
  } catch (error) {
    console.error('Error in detectFace:', error);
    // Re-throw with more context
    throw new Error(`Face detection failed: ${error.message || error.toString()}`);
  }
};

/**
 * Verify a selfie image
 */
export const verifySelfie = async (imageFile) => {
  await loadModels();
  
  const image = await loadImage(imageFile);
  const detections = await faceapi
    .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  const faceCount = detections.length;
  const faceDetected = faceCount > 0;

  if (!faceDetected) {
    return {
      success: true,
      verified: false,
      confidence: 0.0,
      face_detected: false,
      liveness_score: 0.0,
      quality_score: 0.0,
      message: 'No face detected in the image'
    };
  }

  if (faceCount > 1) {
    return {
      success: true,
      verified: false,
      confidence: 0.0,
      face_detected: true,
      liveness_score: 0.0,
      quality_score: 0.0,
      message: `Multiple faces detected (${faceCount}). Selfie should contain only one face.`
    };
  }

  const livenessScore = calculateLivenessScore(image, detections);
  const qualityScore = calculateImageQuality(image);

  // Combined verification score
  const verificationScore = (
    livenessScore * 0.5 + 
    qualityScore * 0.3 + 
    (faceCount === 1 ? 1.0 : 0.0) * 0.2
  );

  const verified = verificationScore >= 0.5;

  return {
    success: true,
    verified,
    confidence: verificationScore,
    face_detected: true,
    liveness_score: livenessScore,
    quality_score: qualityScore,
    message: verified 
      ? 'Selfie verified successfully' 
      : 'Selfie verification failed - low quality or liveness score'
  };
};

/**
 * Verify selfie against a reference image
 */
export const verifyWithReference = async (selfieFile, referenceFile, threshold = 0.6) => {
  await loadModels();
  
  const selfieImage = await loadImage(selfieFile);
  const referenceImage = await loadImage(referenceFile);

  const selfieDetections = await faceapi
    .detectAllFaces(selfieImage, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  const referenceDetections = await faceapi
    .detectAllFaces(referenceImage, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  const selfieFaceDetected = selfieDetections.length > 0;
  const referenceFaceDetected = referenceDetections.length > 0;

  if (!selfieFaceDetected) {
    return {
      success: true,
      verified: false,
      confidence: 0.0,
      similarity: 0.0,
      selfie_face_detected: false,
      reference_face_detected: referenceFaceDetected,
      message: 'No face detected in selfie image'
    };
  }

  if (!referenceFaceDetected) {
    return {
      success: true,
      verified: false,
      confidence: 0.0,
      similarity: 0.0,
      selfie_face_detected: true,
      reference_face_detected: false,
      message: 'No face detected in reference image'
    };
  }

  if (selfieDetections.length > 1) {
    return {
      success: true,
      verified: false,
      confidence: 0.0,
      similarity: 0.0,
      selfie_face_detected: true,
      reference_face_detected: true,
      message: 'Multiple faces detected in selfie image'
    };
  }

  if (referenceDetections.length > 1) {
    return {
      success: true,
      verified: false,
      confidence: 0.0,
      similarity: 0.0,
      selfie_face_detected: true,
      reference_face_detected: true,
      message: 'Multiple faces detected in reference image'
    };
  }

  // Compare faces using face descriptors
  const selfieDescriptor = selfieDetections[0].descriptor;
  const referenceDescriptor = referenceDetections[0].descriptor;
  
  // Calculate Euclidean distance between descriptors
  let distance = 0;
  for (let i = 0; i < selfieDescriptor.length; i++) {
    distance += Math.pow(selfieDescriptor[i] - referenceDescriptor[i], 2);
  }
  distance = Math.sqrt(distance);

  // Convert distance to similarity (0-1 scale, higher is more similar)
  // face-api.js typically uses 0.6 as threshold, where lower distance = more similar
  const similarity = Math.max(0, 1 - distance);
  const isMatch = distance <= threshold;

  // Calculate liveness for selfie
  const livenessScore = calculateLivenessScore(selfieImage, selfieDetections);

  // Final verification requires both match and good liveness
  const verified = isMatch && livenessScore >= 0.4;
  const confidence = similarity * livenessScore;

  return {
    success: true,
    verified,
    confidence,
    similarity,
    selfie_face_detected: true,
    reference_face_detected: true,
    message: verified 
      ? 'Selfie matches reference image' 
      : `Selfie does not match reference (similarity: ${similarity.toFixed(2)})`
  };
};
