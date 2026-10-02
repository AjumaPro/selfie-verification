import React from 'react';
import {
  FaIdCard,
  FaArrowRight,
  FaLock,
  FaShieldAlt,
  FaFileAlt,
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

      <button
        type="button"
        className="app-hub-card app-hub-card-form"
        onClick={() => onSelect('membership')}
      >
        <span className="app-hub-card-icon app-hub-card-icon-navy" aria-hidden>
          <FaFileAlt />
        </span>
        <h3>TPFS Membership Form</h3>
        <p>
          Complete the Teachers’ Provident Fund Scheme (Tier-3) registration —
          personal details, contribution rate, and beneficiaries.
        </p>
        <span className="app-hub-card-meta">
          <FaLock aria-hidden /> Staff sign-in · Printable
        </span>
        <span className="app-hub-card-cta">
          Open form <FaArrowRight aria-hidden />
        </span>
      </button>
    </div>

    {deviceOnly && (
      <div className="app-hub-device-note" role="note">
        <FaShieldAlt aria-hidden /> Desktop KYC for GLICO Pensions members.
      </div>
    )}
  </section>
);

export default AppHub;
