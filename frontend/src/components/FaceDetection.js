import React, { useState } from 'react';
import ImageUpload from './ImageUpload';
import CameraCapture from './CameraCapture';
import { detectFace } from '../services/faceDetection';
import {
  kycFaceVerification,
  processImageForAPI,
  cropPickedImageToStandard,
} from '../services/thirdPartyVerification';
import apiConfig from '../config/api';
import ResultDisplay from './ResultDisplay';
import VerificationResultCard from './VerificationResultCard';
import './FaceDetection.css';

/** @typedef {'image' | 'card'} DetectionMode */

const FaceDetection = () => {
  const [mode, setMode] = useState(/** @type {DetectionMode} */ ('image'));
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processingPick, setProcessingPick] = useState(false);
  const [result, setResult] = useState(null);
  const [apiResult, setApiResult] = useState(null);
  const [error, setError] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');

  const applyCroppedImage = async (file) => {
    setProcessingPick(true);
    setError(null);
    setResult(null);
    setApiResult(null);
    try {
      const cropped = await cropPickedImageToStandard(file);
      setImage(cropped.file);
      setImagePreview(cropped.previewUrl);
      setImageInfo(cropped.info);
    } catch (err) {
      setImage(null);
      setImagePreview(null);
      setImageInfo(null);
      setError(err.message || 'Failed to crop image to 640×480 PNG standard');
    } finally {
      setProcessingPick(false);
    }
  };

  const handleImageSelect = (file) => {
    applyCroppedImage(file);
  };

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setError(null);
    setResult(null);
    setApiResult(null);
  };

  const handleDetect = async () => {
    setError(null);
    setResult(null);
    setApiResult(null);

    if (mode === 'image') {
      if (!image) {
        setError('Please select or capture an image.');
        return;
      }

      setLoading(true);
      try {
        const data = await detectFace(image);
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response from face detection service');
        }
        setResult(data);
      } catch (err) {
        setError(err.message || 'Failed to detect face');
      } finally {
        setLoading(false);
      }
      return;
    }

    // mode === 'card' — Ghana Card number + face image → API
    if (!ghanaCardNumber || ghanaCardNumber.trim() === '') {
      setError('Enter your Ghana card number (format: GHA-xxxxxxxxx-x).');
      return;
    }
    if (!image) {
      setError(
        'The API needs a face image with the Ghana card number. Upload or take a selfie.'
      );
      return;
    }
    if (!apiConfig.baseUrl || !apiConfig.userId || !apiConfig.merchantKey) {
      setError('API credentials are not configured. Please contact administrator.');
      return;
    }

    setLoading(true);
    try {
      const data = await detectFace(image);
      setResult(data);

      if (!data?.face_detected) {
        throw new Error('No face detected. Use a clearer face photo before calling the API.');
      }

      const processedImage = await processImageForAPI(image);
      const apiResponse = await kycFaceVerification({
        baseUrl: apiConfig.baseUrl,
        pinNumber: ghanaCardNumber.trim(),
        imageBase64: processedImage.base64,
        dataType: processedImage.dataType,
        center: apiConfig.center,
        userId: apiConfig.userId,
        merchantKey: apiConfig.merchantKey,
      });
      setApiResult(apiResponse);
    } catch (err) {
      setError(err.message || 'Failed to fetch identity from API');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setImagePreview(null);
    setImageInfo(null);
    setResult(null);
    setApiResult(null);
    setError(null);
    setGhanaCardNumber('');
  };

  const handleCameraCapture = (file) => {
    setShowCamera(false);
    applyCroppedImage(file);
  };

  const apiReady = !!(apiConfig.baseUrl && apiConfig.userId && apiConfig.merchantKey);
  const primaryLabel =
    mode === 'image'
      ? loading
        ? 'Detecting…'
        : 'Detect Face'
      : loading
        ? 'Fetching identity…'
        : 'Fetch from API';

  return (
    <div className="face-detection">
      <div className="card">
        <h2>Face Detection</h2>
        <p className="description">
          Choose how you want to run detection: image only (on device), or Ghana Card number with a
          face image to fetch identity from the API.
        </p>

        <div className="mode-options" role="radiogroup" aria-label="Detection mode">
          <button
            type="button"
            className={`mode-option ${mode === 'image' ? 'active' : ''}`}
            onClick={() => handleModeChange('image')}
            aria-pressed={mode === 'image'}
          >
            <strong>Image only</strong>
            <span>Local face detection — no Ghana Card number, no API</span>
          </button>
          <button
            type="button"
            className={`mode-option ${mode === 'card' ? 'active' : ''}`}
            onClick={() => handleModeChange('card')}
            aria-pressed={mode === 'card'}
          >
            <strong>Ghana Card number</strong>
            <span>Enter card number + face image to fetch identity from the API</span>
          </button>
        </div>

        {mode === 'card' && (
          <div className="form-row">
            <div className="form-group full-width">
              <label htmlFor="fdGhanaCard">Ghana Card Number *</label>
              <input
                type="text"
                id="fdGhanaCard"
                value={ghanaCardNumber}
                onChange={(e) => setGhanaCardNumber(e.target.value)}
                placeholder="GHA-xxxxxxxxx-x"
                className="form-input"
              />
              <small className="form-hint">
                The selfie API always needs both the card number and a face image.
              </small>
              {!apiReady && (
                <small className="form-hint warn">
                  API credentials missing in .env — configure base URL, user ID, and merchant key.
                </small>
              )}
            </div>
          </div>
        )}

        <ImageUpload
          label={mode === 'image' ? 'Upload Image' : 'Upload Face Image *'}
          onImageSelect={handleImageSelect}
          imagePreview={imagePreview}
          onCameraClick={() => setShowCamera(true)}
        />

        {processingPick && (
          <div className="loading">Cropping to 640×480 PNG (&lt;1MB)…</div>
        )}

        {imageInfo && !processingPick && (
          <div className="image-info-success">
            Ready: {imageInfo.width}×{imageInfo.height} PNG · {(imageInfo.size / 1024).toFixed(1)} KB
            {imageInfo.faceCropped ? ' · face crop applied' : ' · center crop applied'}
          </div>
        )}

        {showCamera && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        {error && <div className="error">{error}</div>}

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handleDetect}
            disabled={
              loading ||
              processingPick ||
              (mode === 'image' && !image) ||
              (mode === 'card' && (!image || !ghanaCardNumber.trim()))
            }
          >
            {primaryLabel}
          </button>
          {(image || ghanaCardNumber) && (
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>

        {loading && (
          <div className="loading">
            {mode === 'image'
              ? 'Detecting faces on device…'
              : 'Detecting face and fetching identity from API…'}
          </div>
        )}

        {apiResult && (
          <VerificationResultCard
            apiResult={apiResult}
            title="KYC Identity Result"
          />
        )}

        {result && (
          <details className="local-detect-details" open={!apiResult}>
            <summary>Local face detection</summary>
            <ResultDisplay
              result={result}
              imagePreview={imagePreview}
              type="detection"
            />
          </details>
        )}
      </div>
    </div>
  );
};

export default FaceDetection;
