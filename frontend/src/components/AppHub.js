import React from 'react';
import { FaIdCard, FaVideo, FaArrowRight, FaLock, FaUnlock } from 'react-icons/fa';
import './AppHub.css';

/**
 * Public landing: Meetings opens freely; Image Recognition needs sign-in.
 */
const AppHub = ({ onSelect }) => {
  return (
    <section className="app-hub" aria-label="GLICO applications">
      <div className="app-hub-intro">
        <h2>GLICO applications</h2>
        <p>
          Choose an app. <strong>Meetings</strong> is open to everyone — no login.
          <strong> Image Recognition</strong> requires a signed-in account for KYC.
        </p>
      </div>

      <div className="app-hub-grid">
        <button
          type="button"
          className="app-hub-card app-hub-card-verify"
          onClick={() => onSelect('recognition')}
        >
          <span className="app-hub-card-icon" aria-hidden>
            <FaIdCard />
          </span>
          <h3>Image Recognition</h3>
          <p>
            Ghana Card selfie verification and face checks. Sign in required.
          </p>
          <span className="app-hub-card-meta">
            <FaLock aria-hidden /> Requires sign-in
          </span>
          <span className="app-hub-card-cta">
            Open app <FaArrowRight aria-hidden />
          </span>
        </button>

        <button
          type="button"
          className="app-hub-card app-hub-card-meetings"
          onClick={() => onSelect('meetings')}
        >
          <span className="app-hub-card-icon" aria-hidden>
            <FaVideo />
          </span>
          <h3>Meetings</h3>
          <p>
            Plan sessions, set agendas and attendees, and keep a simple meeting
            log — no account needed.
          </p>
          <span className="app-hub-card-meta open">
            <FaUnlock aria-hidden /> No login required
          </span>
          <span className="app-hub-card-cta">
            Open app <FaArrowRight aria-hidden />
          </span>
        </button>
      </div>
    </section>
  );
};

export default AppHub;
