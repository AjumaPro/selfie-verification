import React, { useEffect, useState } from 'react';
import {
  FaIdCard,
  FaCheckCircle,
  FaShieldAlt,
} from 'react-icons/fa';
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
import {
  fetchPublicVerifySession,
  submitVerifyResult,
} from '../services/verifyApi';
import { BRAND } from '../utils/brandAssets';
import GlicoLifeLogo from './GlicoLifeLogo';
import './VerifyJoin.css';

/**
 * Public guest page (?verify=id): Ghana Card + selfie → host receives result.
 */
const VerifyJoin = ({ sessionId, onClose }) => {
  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [processingPick, setProcessingPick] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiResult, setApiResult] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSession(true);
    setSessionError('');
    fetchPublicVerifySession(sessionId)
      .then((data) => {
        if (!cancelled) setSession(data.session);
      })
      .catch((err) => {
        if (!cancelled) {
          setSessionError(
            err.message ||
              'Verification link not found. Ask the host for a new QR or URL.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    loadModels()
      .then(() => {
        if (!cancelled) setModelsReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setModelsError(
            err.message ||
              'Face models failed to load. You can still try verification.'
          );
          setModelsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCroppedImage = async (file) => {
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
      setError(err.message || 'Failed to prepare selfie.');
    } finally {
      setProcessingPick(false);
    }
  };

  const handleVerify = async () => {
    if (!image) {
      setError('Please take or upload a selfie first.');
      return;
    }
    if (!ghanaCardNumber || ghanaCardNumber.trim() === '') {
      setError('Please enter your Ghana Card number (e.g. GHA-xxxxxxxxx-x).');
      return;
    }
    if (!apiConfig.baseUrl || !apiConfig.userId || !apiConfig.merchantKey) {
      setError('Verification is not configured. Contact the host / administrator.');
      return;
    }

    setLoading(true);
    setError('');
    setApiResult(null);
    setSubmitted(null);

    try {
      let localFaceOk = false;
      try {
        if (modelsReady) {
          const localData = await verifySelfie(image);
          localFaceOk = !!(localData && localData.success !== false);
        }
      } catch {
        localFaceOk = false;
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

      const data = apiResponse?.data || apiResponse || {};
      const person = data.person || {};
      const verified =
        data.verified === 'TRUE' ||
        data.verified === true ||
        apiResponse?.verified === 'TRUE';

      const saved = await submitVerifyResult(sessionId, {
        ghanaCard: ghanaCardNumber.trim(),
        verified,
        forenames: person.forenames || '',
        surname: person.surname || '',
        nationalId: person.nationalId || ghanaCardNumber.trim(),
        gender: person.gender || '',
        birthDate: person.birthDate || '',
        code: data.code || '',
        message: data.message || '',
        transactionGuid: data.transactionGuid || '',
        localFaceOk,
        person,
      });
      setSubmitted(saved);
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const apiVerified =
    apiResult &&
    (apiResult.data?.verified === 'TRUE' ||
      apiResult.data?.verified === true ||
      apiResult.verified === 'TRUE' ||
      apiResult.verified === true);

  return (
    <div className="App verify-join-page">
      <header className="verify-join-header">
        <GlicoLifeLogo compact markClassName="verify-join-logo" />
        <div>
          <h1>Identity verification</h1>
          <p>{BRAND.name} · Ghana Card selfie check</p>
        </div>
      </header>

      <main className="verify-join-main">
        {loadingSession && (
          <div className="verify-join-card">
            <div className="loading-spinner" />
            <p>Loading verification…</p>
          </div>
        )}

        {sessionError && (
          <div className="verify-join-card">
            <p className="verify-join-error" role="alert">
              {sessionError}
            </p>
            {onClose && (
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        )}

        {session && !submitted && (
          <div className="verify-join-card">
            <h2>
              <FaIdCard aria-hidden /> {session.title}
            </h2>
            {session.note ? (
              <p className="verify-join-note">{session.note}</p>
            ) : (
              <p className="verify-join-note">
                Enter your Ghana Card number and take a clear selfie. Your result
                is sent to the host automatically.
              </p>
            )}

            {modelsError && (
              <p className="verify-join-hint">{modelsError}</p>
            )}

            <div className="form-row">
              <label className="form-group full-width">
                Ghana Card number
                <input
                  className="form-input"
                  value={ghanaCardNumber}
                  onChange={(e) => setGhanaCardNumber(e.target.value)}
                  placeholder="GHA-xxxxxxxxx-x"
                  autoComplete="off"
                  inputMode="text"
                />
              </label>
            </div>

            <div className="verify-join-selfie">
              <p className="verify-join-consent-title">
                <FaShieldAlt aria-hidden /> Your selfie
              </p>
              {showCamera ? (
                <CameraCapture
                  onCapture={(file) => {
                    setShowCamera(false);
                    applyCroppedImage(file);
                  }}
                  onClose={() => setShowCamera(false)}
                />
              ) : (
                <ImageUpload
                  label="Upload or take selfie"
                  onImageSelect={(file) => applyCroppedImage(file)}
                  imagePreview={imagePreview}
                  onCameraClick={() => setShowCamera(true)}
                />
              )}
              {processingPick && (
                <p className="verify-join-hint">Preparing selfie…</p>
              )}
              {imageInfo && !processingPick && (
                <p className="image-info-success">
                  Image ready ({imageInfo.width}×{imageInfo.height})
                </p>
              )}
            </div>

            {error && (
              <p className="verify-join-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary verify-join-submit"
              onClick={handleVerify}
              disabled={loading || processingPick || !image}
            >
              {loading ? 'Verifying…' : 'Verify & send to host'}
            </button>
          </div>
        )}

        {submitted && (
          <div className="verify-join-card verify-join-done">
            <h2>
              <FaCheckCircle aria-hidden /> Submitted
            </h2>
            <p>{submitted.message || 'Your verification was sent to the host.'}</p>
            {apiResult && (
              <VerificationResultCard
                apiResult={apiResult}
                title={apiVerified ? 'Verified identity' : 'Verification result'}
              />
            )}
            {onClose && (
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default VerifyJoin;
