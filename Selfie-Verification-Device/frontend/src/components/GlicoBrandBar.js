import React from 'react';
import { BRAND } from '../utils/brandAssets';
import GlicoLifeLogo from './GlicoLifeLogo';
import './GlicoBrandBar.css';

/**
 * Top-of-app Glico Life colours + logo lockup for device / desktop shells.
 * @param {{ product?: string, tagline?: string, compact?: boolean, className?: string }} props
 */
const GlicoBrandBar = ({
  product = BRAND.name,
  tagline = BRAND.tagline,
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
      <GlicoLifeLogo compact={compact} markClassName="glico-brand-bar-logo" />
      <div className="glico-brand-bar-text">
        <strong>{product || BRAND.name}</strong>
        {tagline ? <span>{tagline}</span> : null}
      </div>
    </div>
  </div>
);

export default GlicoBrandBar;
