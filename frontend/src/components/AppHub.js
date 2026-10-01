import React from 'react';
import {
  FaIdCard,
  FaArrowRight,
  FaLock,
  FaShieldAlt,
  FaQrcode,
  FaUserCheck,
} from 'react-icons/fa';
import { BRAND } from '../utils/brandAssets';
import './AppHub.css';

const AppHub = ({ onSelect, deviceOnly = false }) => (
  <section
    className="app-hub"
    aria-label={deviceOnly ? BRAND.deviceAriaLabel : BRAND.hubAriaLabel}
  >
    <div className="app-hub-hero">
      <p className="app-hub-kicker">Member services</p>
      <h2>{deviceOnly ? BRAND.deviceHubTitle : 'Verify identity with confidence'}</h2>
      <p className="app-hub-lead">
        GLICO Pensions staff can share a secure QR for Ghana Card + selfie
        checks, or complete KYC on this device.
      </p>
      <ol className="app-hub-steps">
        <li>
          <span>1</span>
          Sign in
        </li>
        <li>
          <span>2</span>
          Share QR or capture selfie
        </li>
        <li>
          <span>3</span>
          Confirm Ghana Card match
        </li>
      </ol>
    </div>

    <div className="app-hub-grid app-hub-grid-kyc">
      <button
        type="button"
        className="app-hub-card app-hub-card-verify"
        onClick={() => onSelect('recognition')}
      >
        <span className="app-hub-card-icon" aria-hidden>
          <FaIdCard />
        </span>
        <h3>Start ID Verification</h3>
        <p>
          Create a shareable Ghana Card check for members, or run verification
          here. Staff sign-in is required.
        </p>
        <span className="app-hub-card-meta">
          <FaLock aria-hidden /> Secure · QR share · KYC
        </span>
        <span className="app-hub-card-cta">
          Continue <FaArrowRight aria-hidden />
        </span>
      </button>

      <div className="app-hub-aside" aria-hidden={false}>
        <div className="app-hub-aside-item">
          <FaQrcode aria-hidden />
          <div>
            <strong>QR for members</strong>
            <p>Guests open the link on their phone — no staff account needed.</p>
          </div>
        </div>
        <div className="app-hub-aside-item">
          <FaUserCheck aria-hidden />
          <div>
            <strong>On-device KYC</strong>
            <p>Capture a selfie against the Ghana Card on this workstation.</p>
          </div>
        </div>
        <div className="app-hub-aside-item">
          <FaShieldAlt aria-hidden />
          <div>
            <strong>GLICO Pensions</strong>
            <p>{BRAND.tagline}</p>
          </div>
        </div>
      </div>
    </div>

    {deviceOnly && (
      <div className="app-hub-device-note" role="note">
        <FaShieldAlt aria-hidden /> Desktop KYC for GLICO Pensions members.
      </div>
    )}
  </section>
);

export default AppHub;
