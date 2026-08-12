import React from 'react';
import { glicoLogoUrl } from '../utils/brandAssets';
import './GlicoBrandBar.css';

/**
 * Top-of-app Glico colours + logo lockup for device / desktop shells.
 * @param {{ product?: string, tagline?: string, compact?: boolean, className?: string }} props
 */
const GlicoBrandBar = ({
  product = 'GLICO Platform',
  tagline = 'On this device',
  compact = false,
  className = '',
}) => (
  <div
    className={`glico-brand-bar ${compact ? 'is-compact' : ''} ${className}`.trim()}
    role="banner"
  >
    <div className="glico-brand-stripes" aria-hidden>
      <span className="stripe stripe-red" />
      <span className="stripe stripe-sky" />
      <span className="stripe stripe-navy" />
    </div>
    <div className="glico-brand-bar-inner">
      <img src={glicoLogoUrl()} alt="GLICO" className="glico-brand-bar-logo" />
      <div className="glico-brand-bar-text">
        <strong>{product}</strong>
        {tagline ? <span>{tagline}</span> : null}
      </div>
    </div>
  </div>
);

export default GlicoBrandBar;
