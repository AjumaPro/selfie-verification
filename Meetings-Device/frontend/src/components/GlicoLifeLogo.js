import React from 'react';
import { BRAND, glicoLogoUrl } from '../utils/brandAssets';
import './GlicoLifeLogo.css';

/**
 * GLICO Life lockup: corporate wordmark + “Life” in brand navy.
 */
const GlicoLifeLogo = ({
  className = '',
  compact = false,
  markClassName = '',
  showLife = true,
}) => (
  <div
    className={`glico-life-lockup ${compact ? 'is-compact' : ''} ${className}`.trim()}
    role="img"
    aria-label={BRAND.name}
  >
    <img
      src={glicoLogoUrl()}
      alt=""
      aria-hidden
      className={`glico-life-lockup-mark ${markClassName}`.trim()}
    />
    {showLife ? <span className="glico-life-lockup-life">Life</span> : null}
  </div>
);

export default GlicoLifeLogo;
