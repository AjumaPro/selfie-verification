import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import AuthPanel from './components/AuthPanel';
import InstallOnDevice from './components/InstallOnDevice';
import SelfieVerification from './components/SelfieVerification';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import { useAuth } from './context/AuthContext';
import { loadModels } from './services/faceDetection';
import apiConfig from './config/api';

function App() {
  const { isAuthenticated, isSuperAdmin, booting } = useAuth();
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const apiReady = apiConfig.isAutoVerificationEnabled;
  const missingConfig = apiConfig.missingConfig || [];

  useEffect(() => {
    if (!isAuthenticated) {
      setModelsLoading(false);
      setModelsReady(false);
      setModelsError(null);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);

    loadModels()
      .then(() => {
        if (!cancelled) {
          setModelsReady(true);
          setModelsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError(error.message);
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (booting) {
    return (
      <div className="App">
        <Header />
        <div className="container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <h2>Checking session…</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="App">
        <Header />
        <div className="container">
          <AuthPanel />
        </div>
      </div>
    );
  }

  if (modelsLoading) {
    return (
      <div className="App">
        <Header />
        <div className="container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <h2>Loading Face Detection Models...</h2>
            <p>This may take a few moments on first load</p>
          </div>
        </div>
      </div>
    );
  }

  if (modelsError) {
    return (
      <div className="App">
        <Header />
        <div className="container">
          <div className="error-container">
            <h2>Error Loading Models</h2>
            <p>{modelsError}</p>
            <p>Please make sure the models are in the /public/models directory</p>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!modelsReady) return null;

  return (
    <div className="App">
      <Header />
      <div className="container">
        {isSuperAdmin && <SuperAdminDashboard />}

        {!apiReady && (
          <div className="config-banner" role="alert">
            <strong>API not fully configured.</strong>
            <p>
              Verify Selfie needs credentials in <code>frontend/.env</code>.
              Missing: <code>{missingConfig.join(', ') || 'unknown'}</code>
            </p>
            <p>
              Set the missing values, then restart the dev server (<code>npm start</code>).
            </p>
          </div>
        )}

        <InstallOnDevice />
        <SelfieVerification />
      </div>
    </div>
  );
}

export default App;
