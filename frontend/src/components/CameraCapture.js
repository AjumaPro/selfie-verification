import React, { useRef, useEffect, useState } from 'react';
import { FaCamera, FaTimes, FaCheck } from 'react-icons/fa';
import './CameraCapture.css';

const CameraCapture = ({ onCapture, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      // Higher-res live capture so face-crop to 640×480 keeps detail
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 4 / 3 },
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access and try again.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : 'Failed to access camera. Please check your camera settings.'
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsStreaming(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Keep full camera resolution — API processing will face-crop to 640×480
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const imageUrl = URL.createObjectURL(blob);
      setCapturedImage(imageUrl);
    }, 'image/png');
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const confirmCapture = () => {
    if (!canvasRef.current || !capturedImage) return;

    canvasRef.current.toBlob((blob) => {
      const file = new File([blob], 'selfie.png', { type: 'image/png' });
      onCapture(file);
      stopCamera();
      if (onClose) onClose();
    }, 'image/png');
  };

  const handleClose = () => {
    stopCamera();
    if (onClose) onClose();
  };

  return (
    <div className="camera-capture-overlay">
      <div className="camera-capture-container">
        <div className="camera-header">
          <h3>Take Selfie</h3>
          <button className="close-button" onClick={handleClose}>
            <FaTimes />
          </button>
        </div>

        {error ? (
          <div className="camera-error">
            <p>{error}</p>
            <button className="btn btn-primary" onClick={startCamera}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="camera-preview">
              {!capturedImage ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-video"
                  />
                  <div className="face-guide" aria-hidden="true">
                    <div className="face-oval" />
                  </div>
                </>
              ) : (
                <img src={capturedImage} alt="Captured" className="captured-image" />
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>

            <div className="camera-controls">
              {!capturedImage ? (
                <>
                  <button className="capture-button" onClick={capturePhoto} disabled={!isStreaming}>
                    <FaCamera />
                  </button>
                  <p className="camera-hint">
                    Move closer until your face fills the oval. Good lighting. Live portrait only.
                  </p>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={retakePhoto}>
                    <FaTimes /> Retake
                  </button>
                  <button className="btn btn-primary" onClick={confirmCapture}>
                    <FaCheck /> Use This Photo
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
