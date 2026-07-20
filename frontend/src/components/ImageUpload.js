import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaCamera, FaVideo } from 'react-icons/fa';
import './ImageUpload.css';

const ImageUpload = ({ onImageSelect, imagePreview, label, accept = 'image/*', onCameraClick }) => {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles && acceptedFiles[0]) {
      onImageSelect(acceptedFiles[0]);
    }
  }, [onImageSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    multiple: false
  });

  return (
    <div className="image-upload-container">
      <div className="upload-header">
        <label className="upload-label">{label}</label>
        {onCameraClick && (
          <button className="camera-button" onClick={onCameraClick} type="button">
            <FaVideo /> Take Live Selfie
          </button>
        )}
      </div>
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${imagePreview ? 'has-image' : ''}`}
      >
        <input {...getInputProps()} />
        {imagePreview ? (
          <div className="image-preview">
            <img src={imagePreview} alt="Preview" />
            <div className="image-overlay">
              <span>Click or drag to replace</span>
            </div>
          </div>
        ) : (
          <div className="dropzone-content">
            <div className="upload-icon">
              <FaCamera />
            </div>
            <p className="dropzone-text">
              {isDragActive ? 'Drop the image here' : 'Drag & drop an image here, or click to select'}
            </p>
            <p className="dropzone-hint">
              Gallery or camera · auto-cropped to 640×480 PNG under 1MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload;
