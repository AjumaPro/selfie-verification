import React, { useEffect, useState } from 'react';
import { FaCheckCircle, FaIdCard } from 'react-icons/fa';
import ImageUpload from './ImageUpload';
import CameraCapture from './CameraCapture';
import { loadModels, verifySelfie } from '../services/faceDetection';
import {
  kycFaceVerification,
  processImageForAPI,
  cropPickedImageToStandard,
} from '../services/thirdPartyVerification';
import apiConfig from '../config/api';
import VerificationResultCard from './VerificationResultCard';
import { isKycApproved, buildKycAttemptPayload } from '../utils/kycAttempt';
import { submitDeviceAttempt } from '../services/verifyApi';
import { getToken } from '../services/authService';
import './GhanaCardSelfVerify.css';

const GhanaCardSelfVerify = ({
  ghanaCard,
  onGhanaCardChange,
  onApproved,
  disabled = false,
  verified = false,
}) => {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [processingPick, setProcessingPick] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiResult, setApiResult] = useState(null);
  const [modelsReady, setModelsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadModels()
      .then(() => {
        if (!cancelled) setModelsReady(true);
      })
      .catch(() => {
        if (!cancelled) setModelsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyImage = async (file) => {
    setProcessingPick(true);
    setError('');
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
      setError(err.message || 'Could not prepare selfie.');
    } finally {
      setProcessingPick(false);
    }
  };

  const handleVerify = async () => {
    if (!image) {
      setError('Take or upload a selfie first.');
      return;
    }
    const pin = String(ghanaCard || '').trim();
    if (!pin) {
      setError('Enter your Ghana Card number (GHA-XXXXXXXXX-X).');
      return;
    }
    if (!apiConfig.baseUrl || !apiConfig.userId || !apiConfig.merchantKey) {
      setError('Ghana Card verification is not configured.');
      return;
    }

    setLoading(true);
    setError('');
    setApiResult(null);
    let localFaceOk = false;
    let apiResponse = null;
    try {
      if (modelsReady) {
        try {
          const localData = await verifySelfie(image);
          localFaceOk = !!(localData && localData.success !== false);
        } catch {
          localFaceOk = false;
        }
      }
      const processed = await processImageForAPI(image);
      apiResponse = await kycFaceVerification({
        baseUrl: apiConfig.baseUrl,
        pinNumber: pin,
        imageBase64: processed.base64,
        dataType: processed.dataType,
        center: apiConfig.center,
        userId: apiConfig.userId,
        merchantKey: apiConfig.merchantKey,
      });
      setApiResult(apiResponse);
      const approved = isKycApproved(apiResponse);
      const person =
        apiResponse?.data?.person || apiResponse?.person || {};
      if (approved && onApproved) {
        onApproved({
          ghanaCard: pin,
          person,
          apiResult: apiResponse,
          selfieDataUrl: imagePreview || '',
        });
      }
      if (getToken()) {
        try {
          await submitDeviceAttempt(
            buildKycAttemptPayload({
              ghanaCard: pin,
              apiResponse,
              localFaceOk,
              source: 'device',
            })
          );
        } catch {
          /* dashboard save is optional here */
        }
      }
      if (!approved) {
        setError(
          apiResponse?.data?.message ||
            'Ghana Card did not match this selfie. Try again in good light.'
        );
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const approved = verified || isKycApproved(apiResult);

  return (
    <div className={`tpfs-kyc ${approved ? 'is-ok' : ''}`}>
      <div className="tpfs-kyc-head">
        <FaIdCard aria-hidden />
        <div>
          <strong>Ghana Card self-verification</strong>
          <p>
            Enter the Ghana Card number, take a selfie, and verify against NIA
            before submitting this form.
          </p>
        </div>
      </div>

      {approved && (
        <p className="tpfs-kyc-ok">
          <FaCheckCircle aria-hidden /> Ghana Card verified. Personal details
          were filled from NIA.
        </p>
      )}

      <label className="tpfs-kyc-label">
        Ghana Card number
        <input
          className="form-input"
          value={ghanaCard}
          onChange={(e) => {
            onGhanaCardChange(String(e.target.value || '').toUpperCase());
            setApiResult(null);
            setError('');
          }}
          placeholder="GHA-XXXXXXXXX-X"
          required
          disabled={disabled}
        />
      </label>

      {!disabled && (
        <>
          <ImageUpload
            label="Selfie for Ghana Card match"
            onImageSelect={applyImage}
            imagePreview={imagePreview}
            onCameraClick={() => setShowCamera(true)}
          />
          {processingPick && (
            <p className="tpfs-kyc-hint">Preparing selfie…</p>
          )}
          {imageInfo && !processingPick && (
            <p className="tpfs-kyc-hint">
              Ready: {imageInfo.width}×{imageInfo.height} PNG
            </p>
          )}
          {showCamera && (
            <CameraCapture
              onCapture={(file) => {
                setShowCamera(false);
                applyImage(file);
              }}
              onClose={() => setShowCamera(false)}
            />
          )}
          {error && (
            <p className="tpfs-kyc-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={loading || processingPick || !image}
          >
            {loading ? 'Verifying…' : 'Verify Ghana Card'}
          </button>
        </>
      )}

      {apiResult && (
        <div className="tpfs-kyc-result">
          <VerificationResultCard
            apiResult={apiResult}
            title={approved ? 'Approved' : 'Attempted'}
          />
        </div>
      )}
    </div>
  );
};

export default GhanaCardSelfVerify;
