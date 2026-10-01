import React, { useState } from 'react';
import ImageUpload from './ImageUpload';
import CameraCapture from './CameraCapture';
import { verifyWithReference } from '../services/faceDetection';
import ResultDisplay from './ResultDisplay';
import './ReferenceVerification.css';

const ReferenceVerification = () => {
  const [selfie, setSelfie] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [reference, setReference] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [threshold, setThreshold] = useState(0.6);
  const [showCamera, setShowCamera] = useState(false);

  const handleSelfieSelect = (file) => {
    setSelfie(file);
    setResult(null);
    setError(null);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelfiePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleReferenceSelect = (file) => {
    setReference(file);
    setResult(null);
    setError(null);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setReferencePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVerify = async () => {
    if (!selfie) {
      setError('Please select a selfie image');
      return;
    }
    if (!reference) {
      setError('Please select a reference image');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await verifyWithReference(selfie, reference, threshold);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to verify against reference');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelfie(null);
    setSelfiePreview(null);
    setReference(null);
    setReferencePreview(null);
    setResult(null);
    setError(null);
  };

  const handleCameraCapture = (file) => {
    handleSelfieSelect(file);
    setShowCamera(false);
  };

  return (
    <div className="reference-verification">
      <div className="card">
        <h2>Compare with Reference</h2>
        <p className="description">
          Upload a selfie and a reference image to compare and verify if they match the same person.
        </p>

        <div className="image-uploads">
          <ImageUpload
            label="Upload Selfie"
            onImageSelect={handleSelfieSelect}
            imagePreview={selfiePreview}
            onCameraClick={() => setShowCamera(true)}
          />
          <ImageUpload
            label="Upload Reference Image"
            onImageSelect={handleReferenceSelect}
            imagePreview={referencePreview}
          />
        </div>

        {showCamera && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        <div className="threshold-control">
          <label htmlFor="threshold">Similarity Threshold: {threshold}</label>
          <input
            type="range"
            id="threshold"
            min="0.3"
            max="1.0"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
          <div className="threshold-hint">
            Lower values = stricter matching | Higher values = more lenient
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={!selfie || !reference || loading}
          >
            {loading ? 'Comparing...' : 'Compare Images'}
          </button>
          {(selfie || reference) && (
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>

        {loading && <div className="loading">Comparing images...</div>}

        {result && (
          <ResultDisplay
            result={result}
            imagePreview={selfiePreview}
            referencePreview={referencePreview}
            type="reference"
          />
        )}
      </div>
    </div>
  );
};

export default ReferenceVerification;
