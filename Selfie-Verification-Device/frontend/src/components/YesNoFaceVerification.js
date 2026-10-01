import React, { useState, useEffect } from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import ImageUpload from './ImageUpload';
import CameraCapture from './CameraCapture';
import { yesNoFaceVerification, processImageForAPI, cropPickedImageToStandard } from '../services/thirdPartyVerification';
import apiConfig from '../config/api';
import VerificationResultCard from './VerificationResultCard';
import './YesNoFaceVerification.css';

const YesNoFaceVerification = () => {
  const [image, setImage] = useState(null); // Face image for verification
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processingPick, setProcessingPick] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  
  // Ghana card input method: 'number' or 'image'
  const [inputMethod, setInputMethod] = useState('number'); // 'number' or 'image'
  const [cardImage, setCardImage] = useState(null); // Ghana card image
  const [cardImagePreview, setCardImagePreview] = useState(null); // Preview of Ghana card image
  
  // API Configuration - Base URL, User ID, Merchant Key, and Center are pre-configured
  // Users can either enter Ghana card number OR upload Ghana card image
  const [baseUrl] = useState(apiConfig.baseUrl);
  const [pinNumber, setPinNumber] = useState(''); // Ghana card number (format: GHA-xxxxxxxxx-x)
  const [center] = useState(apiConfig.center); // Pre-configured from config
  const [userId] = useState(apiConfig.userId); // Pre-configured from config
  const [merchantKey] = useState(apiConfig.merchantKey); // Pre-configured from config
  
  // Load API configuration from config file on mount
  useEffect(() => {
    const configBaseUrl = apiConfig.baseUrl;
    const configUserId = apiConfig.userId;
    const configMerchantKey = apiConfig.merchantKey;
    
    if (configBaseUrl) {
      console.log('Base URL loaded from .env:', configBaseUrl);
    } else {
      console.warn('Base URL not configured. Please set REACT_APP_API_BASE_URL in .env file');
    }
    
    if (configUserId) {
      console.log('User ID loaded from .env');
    } else {
      console.warn('User ID not configured. Please set REACT_APP_DEFAULT_USER_ID in .env file');
    }
    
    if (configMerchantKey) {
      console.log('Merchant Key loaded from .env');
    } else {
      console.warn('Merchant Key not configured. Please set REACT_APP_DEFAULT_MERCHANT_KEY in .env file');
    }
  }, []);

  // Handle face image selection — crop to 640×480 PNG <1MB immediately
  const handleImageSelect = async (file) => {
    setProcessingPick(true);
    setResult(null);
    setError(null);
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

  // Handle Ghana card image selection
  const handleCardImageSelect = (file) => {
    setCardImage(file);
    setResult(null);
    setError(null);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setCardImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVerify = async (imageFile = null) => {
    const imageToVerify = imageFile || image;
    
    // Check if image is provided
    if (!imageToVerify) {
      setError('Please upload an image or take a selfie first');
      return;
    }

    // Check if Ghana card information is provided (either number or image)
    if (inputMethod === 'number') {
      // If using number input method, card number is required
      if (!pinNumber || pinNumber.trim() === '') {
        setError('Please enter your Ghana card number (format: GHA-xxxxxxxxx-x)');
        return;
      }
    } else if (inputMethod === 'image') {
      // If using image input method, card image is required
      if (!cardImage) {
        setError('Please upload your Ghana card image');
        return;
      }
      // If card image is provided but no number entered, try to use image
      // Note: For now, we still need the number. In future, OCR can extract it.
      if (!pinNumber || pinNumber.trim() === '') {
        setError('Please enter your Ghana card number from the uploaded card image (format: GHA-xxxxxxxxx-x)');
        return;
      }
    }

    // Check if API credentials are configured
    if (!baseUrl) {
      setError('Base URL is not configured. Please contact administrator.');
      return;
    }

    if (!userId) {
      setError('User ID is not configured. Please contact administrator.');
      return;
    }

    if (!merchantKey) {
      setError('Merchant Key is not configured. Please contact administrator.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Process image to meet API requirements
      const processedImage = await processImageForAPI(imageToVerify);
      setImageInfo(processedImage);
      
      // Log verification details (without sensitive data)
      console.log('Starting Yes/No Verification:', {
        inputMethod: inputMethod,
        hasCardImage: !!cardImage,
        hasCardNumber: !!pinNumber && pinNumber.trim() !== '',
        faceImageSize: `${Math.round(processedImage.size / 1024)}KB`,
        endpoint: 'Yes/No Face Verification'
      });
      
      // Call Yes/No verification API with correct endpoint
      // Endpoint: BASE_URL/api/v1/third-party/verification/yes_no/face
      const response = await yesNoFaceVerification({
        baseUrl: baseUrl,
        pinNumber: pinNumber.trim(), // Use the Ghana card number (from input or extracted from image)
        imageBase64: processedImage.base64, // Face image for verification
        dataType: processedImage.dataType,
        center: center,
        userId: userId,
        merchantKey: merchantKey
      });

      console.log('Yes/No Verification completed successfully');
      setResult(response);
    } catch (err) {
      setError(err.message || 'Failed to verify face');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setImagePreview(null);
    setCardImage(null);
    setCardImagePreview(null);
    setPinNumber('');
    setResult(null);
    setError(null);
    setImageInfo(null);
  };

  const handleCameraCapture = (file) => {
    setShowCamera(false);
    handleImageSelect(file);
  };

  return (
    <div className="yesno-verification">
      <div className="card">
        <h2>Yes/No Face Verification</h2>
        <p className="description">
          Simple face verification that returns YES or NO. Prefer a live selfie with your Ghana card details.
          Face images are cropped to 640×480 PNG under 1MB with sufficient lighting for clear identification.
        </p>

        {/* User Input - Ghana Card Number or Image */}
        <div className="api-config">
          <h3>Ghana Card Information</h3>
          <p className="config-description">
            Choose how you want to provide your Ghana card information:
          </p>
          
          {/* Input Method Toggle */}
          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <div className="form-group full-width">
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className={`btn ${inputMethod === 'number' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setInputMethod('number');
                    setCardImage(null);
                    setCardImagePreview(null);
                  }}
                  style={{ flex: 1 }}
                >
                  Enter Card Number
                </button>
                <button
                  type="button"
                  className={`btn ${inputMethod === 'image' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setInputMethod('image');
                    setPinNumber('');
                  }}
                  style={{ flex: 1 }}
                >
                  Upload Card Image
                </button>
              </div>
            </div>
          </div>

          {/* Card Number Input */}
          {inputMethod === 'number' && (
            <div className="form-row">
              <div className="form-group full-width">
                <label htmlFor="pinNumber">Ghana Card Number *</label>
                <input
                  type="text"
                  id="pinNumber"
                  value={pinNumber}
                  onChange={(e) => setPinNumber(e.target.value)}
                  placeholder="GHA-xxxxxxxxx-x"
                  className="form-input"
                />
                <small className="form-hint">Format: GHA-xxxxxxxxx-x</small>
              </div>
            </div>
          )}

          {/* Card Image Upload */}
          {inputMethod === 'image' && (
            <div className="form-row">
              <div className="form-group full-width">
                <label>Ghana Card Image *</label>
                <ImageUpload
                  label=""
                  onImageSelect={handleCardImageSelect}
                  imagePreview={cardImagePreview}
                  accept="image/*"
                />
                {cardImagePreview && (
                  <div style={{ marginTop: '1rem' }}>
                    <label htmlFor="pinNumberFromImage">Enter Card Number from Image *</label>
                    <input
                      type="text"
                      id="pinNumberFromImage"
                      value={pinNumber}
                      onChange={(e) => setPinNumber(e.target.value)}
                      placeholder="GHA-xxxxxxxxx-x"
                      className="form-input"
                      style={{ marginTop: '0.5rem' }}
                    />
                    <small className="form-hint">Please enter the card number visible in the image above</small>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <ImageUpload
          label="Upload Face Image"
          onImageSelect={handleImageSelect}
          imagePreview={imagePreview}
          onCameraClick={() => setShowCamera(true)}
        />

        {showCamera && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        {processingPick && (
          <div className="loading">Cropping to 640×480 PNG (&lt;1MB)…</div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={
              !image || 
              loading ||
              processingPick ||
              !baseUrl || 
              !userId || 
              !merchantKey || 
              (inputMethod === 'number' && (!pinNumber || pinNumber.trim() === '')) ||
              (inputMethod === 'image' && (!cardImage || !pinNumber || pinNumber.trim() === ''))
            }
          >
            {loading ? 'Verifying...' : 'Verify Face'}
          </button>
          {image && (
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>

        {loading && (
          <div className="loading">
            Processing image and verifying...
            {imageInfo && (
              <div className="image-info">
                <small>Image processed: {imageInfo.width}x{imageInfo.height}px, {(imageInfo.size / 1024).toFixed(2)}KB</small>
              </div>
            )}
          </div>
        )}
        
        {imageInfo && !loading && (
          <div className="image-info-success">
            <small><FaCheckCircle className="inline-icon" /> Image processed: {imageInfo.width}x{imageInfo.height}px, {(imageInfo.size / 1024).toFixed(2)}KB, {imageInfo.dataType}</small>
          </div>
        )}

        {result && (
          <VerificationResultCard
            apiResult={result}
            title="Yes/No Verification Result"
          />
        )}
      </div>
    </div>
  );
};

export default YesNoFaceVerification;
