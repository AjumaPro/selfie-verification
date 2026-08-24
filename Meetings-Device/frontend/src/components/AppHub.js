import React from 'react';
import {
  FaIdCard,
  FaVideo,
  FaArrowRight,
  FaLock,
  FaUnlock,
  FaShieldAlt,
  FaMobileAlt,
} from 'react-icons/fa';
import MeetingsDeviceDownloads from './MeetingsDeviceDownloads';
import { BRAND } from '../utils/brandAssets';
import './AppHub.css';

/**
 * Hub: Image Recognition + Meetings columns.
 * Meetings column always shows Windows/Mac Meetings-on-device download buttons.
 */
const AppHub = ({ onSelect, deviceOnly = false }) => {
  const openMeetings = () => {
    if (!deviceOnly) {
      onSelect('meetings');
      return;
    }
    const pwa = process.env.REACT_APP_MEETINGS_PWA_URL;
    if (pwa) {
      window.open(pwa, '_blank', 'noopener,noreferrer');
      return;
    }
    // Same origin website Meetings (DigitalOcean / browser builds)
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      // Web app reads section from in-app state only; open full site meetings path via query for guests
      window.open(`${url.origin}/`, '_blank', 'noopener,noreferrer');
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      className="app-hub"
      aria-label={deviceOnly ? BRAND.deviceAriaLabel : BRAND.hubAriaLabel}
    >
      <div className="app-hub-intro">
        <h2>{deviceOnly ? BRAND.deviceHubTitle : BRAND.hubTitle}</h2>
        <p>
          {deviceOnly ? (
            <>
              Image Recognition runs in this app. The <strong>Meetings</strong>{' '}
              column lists Windows / Mac installs for the separate Meetings
              app.
            </>
          ) : (
            <>
              Choose an app. <strong>Image Recognition</strong> — sign in, then
              share a QR so guests verify Ghana Card + selfie. <strong>Meetings</strong>{' '}
              is open without login.
            </>
          )}
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
            Share a QR / link for guests to verify Ghana Card + selfie — or
            verify on this device. Sign in required.
          </p>
          <span className="app-hub-card-meta">
            <FaLock aria-hidden /> Sign in · QR share &amp; KYC
          </span>
          <span className="app-hub-card-cta">
            Open &amp; share QR <FaArrowRight aria-hidden />
          </span>
        </button>

        <div className="app-hub-card app-hub-card-meetings app-hub-card-meetings-panel">
          <button
            type="button"
            className="app-hub-card-open-meetings"
            onClick={openMeetings}
          >
            <span className="app-hub-card-icon" aria-hidden>
              <FaVideo />
            </span>
            <h3>Meetings</h3>
            <p>
              {deviceOnly
                ? 'Full meetings tools (QR, map, booking) as Windows / Mac / phone apps — not bundled inside Image Recognition.'
                : 'Plan sessions, QR check-in, venue map, meals, free-slot booking — no account needed.'}
            </p>
            <span className="app-hub-card-meta open">
              {deviceOnly ? (
                <>
                  <FaMobileAlt aria-hidden /> Device downloads below
                </>
              ) : (
                <>
                  <FaUnlock aria-hidden /> No login · open below
                </>
              )}
            </span>
            {!deviceOnly && (
              <span className="app-hub-card-cta">
                Open Meetings <FaArrowRight aria-hidden />
              </span>
            )}
          </button>

          <div className="app-hub-meet-dl-stop">
            <MeetingsDeviceDownloads compact />
          </div>
        </div>
      </div>

      {deviceOnly && (
        <div className="app-hub-device-note" role="note">
          <FaShieldAlt aria-hidden /> This package is Image Recognition. Use the
          Meetings column for Windows (.exe), Mac (.dmg), or Install PWA on this
          device.
        </div>
      )}
    </section>
  );
};

export default AppHub;
