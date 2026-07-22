import React from 'react';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import './ResultDisplay.css';

const ResultDisplay = ({ result, imagePreview, referencePreview, type }) => {
  const renderScoreBar = (label, value, maxValue = 1.0) => {
    const percentage = (value / maxValue) * 100;
    const color = percentage >= 70 ? '#48a8e8' : percentage >= 40 ? '#ff9800' : '#d03038';
    
    return (
      <div className="score-item">
        <div className="score-label">
          <span>{label}</span>
          <span className="score-value">{value.toFixed(2)}</span>
        </div>
        <div className="score-bar">
          <div
            className="score-bar-fill"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>
      </div>
    );
  };

  const renderDetectionResult = () => {
    return (
      <div className="result-content">
        {imagePreview && (
          <div className="result-image">
            <img src={imagePreview} alt="Uploaded" />
          </div>
        )}
        
        <div className="result-stats">
          <div className={`status-badge ${result.face_detected ? 'success' : 'error'}`}>
            {result.face_detected ? (
              <><FaCheckCircle className="status-icon" /> Face Detected</>
            ) : (
              <><FaTimesCircle className="status-icon" /> No Face Detected</>
            )}
          </div>
          
          {result.face_detected && (
            <>
              <div className="stat-item">
                <span className="stat-label">Faces Found:</span>
                <span className="stat-value">{result.face_count}</span>
              </div>
              
              {renderScoreBar('Liveness Score', result.liveness_score)}
            </>
          )}
          
          <div className="result-message">{result.message}</div>
        </div>
      </div>
    );
  };

  const renderVerificationResult = () => {
    return (
      <div className="result-content">
        {imagePreview && (
          <div className="result-image">
            <img src={imagePreview} alt="Selfie" />
          </div>
        )}
        
        <div className="result-stats">
          <div className={`status-badge ${result.verified ? 'success' : 'error'}`}>
            {result.verified ? (
              <><FaCheckCircle className="status-icon" /> Verified</>
            ) : (
              <><FaTimesCircle className="status-icon" /> Not Verified</>
            )}
          </div>
          
          <div className="stat-item">
            <span className="stat-label">Face Detected:</span>
            <span className="stat-value">{result.face_detected ? 'Yes' : 'No'}</span>
          </div>
          
          {renderScoreBar('Confidence', result.confidence)}
          {renderScoreBar('Liveness Score', result.liveness_score)}
          {result.quality_score !== undefined && renderScoreBar('Quality Score', result.quality_score)}
          
          <div className="result-message">{result.message}</div>
        </div>
      </div>
    );
  };

  const renderReferenceResult = () => {
    return (
      <div className="result-content">
        <div className="comparison-images">
          {referencePreview && (
            <div className="result-image">
              <div className="image-label">Reference</div>
              <img src={referencePreview} alt="Reference" />
            </div>
          )}
          {imagePreview && (
            <div className="result-image">
              <div className="image-label">Selfie</div>
              <img src={imagePreview} alt="Selfie" />
            </div>
          )}
        </div>
        
        <div className="result-stats">
          <div className={`status-badge ${result.verified ? 'success' : 'error'}`}>
            {result.verified ? (
              <><FaCheckCircle className="status-icon" /> Match</>
            ) : (
              <><FaTimesCircle className="status-icon" /> No Match</>
            )}
          </div>
          
          <div className="stat-item">
            <span className="stat-label">Selfie Face:</span>
            <span className="stat-value">{result.selfie_face_detected ? 'Detected' : 'Not Detected'}</span>
          </div>
          
          <div className="stat-item">
            <span className="stat-label">Reference Face:</span>
            <span className="stat-value">{result.reference_face_detected ? 'Detected' : 'Not Detected'}</span>
          </div>
          
          {renderScoreBar('Similarity', result.similarity)}
          {renderScoreBar('Confidence', result.confidence)}
          
          <div className="result-message">{result.message}</div>
        </div>
      </div>
    );
  };

  if (!result) return null;

  return (
    <div className="result-display">
      <h3>Results</h3>
      {type === 'detection' && renderDetectionResult()}
      {type === 'verification' && renderVerificationResult()}
      {type === 'reference' && renderReferenceResult()}
    </div>
  );
};

export default ResultDisplay;
