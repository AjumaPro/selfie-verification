import React, { useState } from 'react';
import ImageUpload from './ImageUpload';
import CameraCapture from './CameraCapture';
import { verifySelfie } from '../services/faceDetection';
import { kycFaceVerification, processImageForAPI, cropPickedImageToStandard } from '../services/thirdPartyVerification';
import apiConfig from '../config/api';
import ResultDisplay from './ResultDisplay';
import VerificationResultCard from './VerificationResultCard';
import './SelfieVerification.css';

const SelfieVerification = () => {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processingPick, setProcessingPick] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');
  const [apiResult, setApiResult] = useState(null);

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

  const handleVerify = async () => {
    if (!image) {
      setError('Please select a selfie image first');
      return;
    }

    if (!ghanaCardNumber || ghanaCardNumber.trim() === '') {
      setError('Please enter your Ghana card number (format: GHA-xxxxxxxxx-x)');
      return;
    }

    if (!apiConfig.baseUrl || !apiConfig.userId || !apiConfig.merchantKey) {
      setError('API credentials are not configured. Please contact administrator.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setApiResult(null);

    try {
      // Local checks (optional quality signal) — API is the source of truth for identity
      const localData = await verifySelfie(image);
      setResult(localData);

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
      setError(err.message || 'Failed to verify selfie');
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

  const apiVerified =
    apiResult &&
    (apiResult.data?.verified === 'TRUE' ||
      apiResult.data?.verified === true ||
      apiResult.verified === 'TRUE' ||
      apiResult.verified === true);

  return (
    <div className="selfie-verification">
      <div className="card">
        <h2>Selfie Verification</h2>
        <p className="description">
          Take a live selfie and enter your Ghana card number. The selfie is checked locally, then
          verified with the KYC API. Successful matches show the returned identity details below
          (not raw JSON).
          Images are processed to the API standard: live portrait, 640×480 PNG, under 1MB, with sufficient lighting.
        </p>

        <div className="form-row">
          <div className="form-group full-width">
            <label htmlFor="ghanaCardNumber">Ghana Card Number *</label>
            <input
              type="text"
              id="ghanaCardNumber"
              value={ghanaCardNumber}
              onChange={(e) => setGhanaCardNumber(e.target.value)}
              placeholder="GHA-xxxxxxxxx-x"
              className="form-input"
            />
          </div>
        </div>

        <ImageUpload
          label="Upload Selfie"
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
            onClick={handleVerify}
            disabled={!image || loading || processingPick}
          >
            {loading ? 'Verifying...' : 'Verify Selfie'}
          </button>
          {image && (
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>

        {loading && <div className="loading">Verifying selfie...</div>}

        {/* API identity result is primary */}
        {apiResult && (
          <VerificationResultCard
            apiResult={apiResult}
            title="KYC Identity Result"
          />
        )}

        {/* Local face-api scores — secondary; hide failure banner when API already verified */}
        {result && !apiVerified && (
          <ResultDisplay
            result={result}
            imagePreview={imagePreview}
            type="verification"
          />
        )}

        {result && apiVerified && (
          <details className="local-checks-details">
            <summary>Local face checks (optional)</summary>
            <ResultDisplay
              result={result}
              imagePreview={imagePreview}
              type="verification"
            />
          </details>
        )}
      </div>
    </div>
  );
};

export default SelfieVerification;
