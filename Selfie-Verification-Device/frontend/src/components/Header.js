import React from 'react';
import {
  FaSignOutAlt,
  FaUser,
  FaUserShield,
  FaThLarge,
  FaIdCard,
  FaVideo,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { glicoLogoUrl } from '../utils/brandAssets';
import './Header.css';

const appLabels = {
  hub: {
    title: 'GLICO Platform',
    subtitle: 'Applications home',
  },
  recognition: {
    title: 'Image Recognition',
    subtitle: 'Identity verification & KYC',
  },
  meetings: {
    title: 'Meetings',
    subtitle: 'Schedule & session log',
  },
};

const Header = ({ activeApp = 'hub', onBackToApps, deviceOnly = false }) => {
  const { user, isAuthenticated, isSuperAdmin, logout } = useAuth();
  const labels = appLabels[activeApp] || appLabels.hub;
  const title =
    activeApp === 'hub' && isSuperAdmin
      ? 'GLICO Platform Admin'
      : labels.title;
  const subtitle =
    activeApp === 'hub' && isSuperAdmin
      ? 'Superadmin control panel'
      : deviceOnly && activeApp === 'hub'
        ? 'Desktop · Ghana Card KYC'
        : labels.subtitle;

  return (
    <header
      className={`header ${isSuperAdmin ? 'header-admin' : ''} ${
        activeApp !== 'hub' ? 'header-in-app' : ''
      } ${deviceOnly ? 'header-device' : ''}`}
    >
      <div className="header-content">
        <div className="header-main">
          <div className="header-brand">
            <img
              src={glicoLogoUrl()}
              alt="GLICO"
              className="header-logo"
            />
            <div className="header-brand-text">
              <h1>
                {activeApp === 'recognition' && (
                  <FaIdCard className="header-app-mark" aria-hidden />
                )}
                {activeApp === 'meetings' && (
                  <FaVideo className="header-app-mark" aria-hidden />
                )}
                {title}
              </h1>
              <p>{subtitle}</p>
            </div>
          </div>
        </div>

        {(onBackToApps || (isAuthenticated && user)) && (
          <div className="header-user">
            {onBackToApps && (
              <button
                type="button"
                className="header-apps-btn"
                onClick={onBackToApps}
              >
                <FaThLarge /> All apps
              </button>
            )}
            {isAuthenticated && user && (
              <>
                <div className="header-user-info">
                  {isSuperAdmin ? (
                    <FaUserShield className="header-user-icon admin" aria-hidden />
                  ) : (
                    <FaUser className="header-user-icon" aria-hidden />
                  )}
                  <div>
                    <span className="header-user-name">
                      {user.fullName}
                      {isSuperAdmin && (
                        <span className="header-role-pill">Super Admin</span>
                      )}
                    </span>
                    <span className="header-user-email">{user.email}</span>
                  </div>
                </div>
                <button type="button" className="header-logout" onClick={logout}>
                  <FaSignOutAlt /> Sign out
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
