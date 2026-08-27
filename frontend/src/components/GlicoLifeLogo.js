import React from 'react';
import { BRAND, glicoLogoUrl } from '../utils/brandAssets';
import './GlicoLifeLogo.css';

/** GLICO corporate wordmark. */
const GlicoLifeLogo = ({
  className = '',
  compact = false,
  markClassName = '',
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
  </div>
);

export default GlicoLifeLogo;
