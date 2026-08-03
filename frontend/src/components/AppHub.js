import React from 'react';
import { FaIdCard, FaVideo, FaArrowRight, FaShieldAlt } from 'react-icons/fa';
import './AppHub.css';

/**
 * Post-login landing: choose Image Recognition or Meetings.
 */
const AppHub = ({ onSelect, isSuperAdmin }) => {
  return (
    <section className="app-hub" aria-label="GLICO applications">
      <div className="app-hub-intro">
        <h2>Choose an application</h2>
        <p>
          Image Recognition for Ghana Card KYC selfie checks, or Meetings for
          scheduling and managing work sessions. Each app is separate.
        </p>
        {isSuperAdmin && (
          <p className="app-hub-admin-hint">
            <FaShieldAlt aria-hidden /> Super Admin tools stay available under
            each application.
          </p>
        )}
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
            Capture or upload a selfie, verify against Ghana Card KYC, and run
            face checks.
          </p>
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
            log for your team.
          </p>
          <span className="app-hub-card-cta">
            Open app <FaArrowRight aria-hidden />
          </span>
        </button>
      </div>
    </section>
  );
};

export default AppHub;
