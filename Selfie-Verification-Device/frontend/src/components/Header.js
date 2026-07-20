import React from 'react';
import { FaShieldAlt, FaSignOutAlt, FaUser, FaUserShield } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import './Header.css';

const Header = () => {
  const { user, isAuthenticated, isSuperAdmin, logout } = useAuth();

  return (
    <header className={`header ${isSuperAdmin ? 'header-admin' : ''}`}>
      <div className="header-content">
        <div className="header-main">
          <h1>
            {isSuperAdmin ? (
              <FaUserShield className="header-icon admin" />
            ) : (
              <FaShieldAlt className="header-icon" />
            )}
            {isSuperAdmin ? 'Selfie Verification Admin' : 'Selfie Verification'}
          </h1>
          <p>
            {isSuperAdmin
              ? 'Superadmin control panel'
              : 'Face Detection & Selfie Verification'}
          </p>
        </div>

        {isAuthenticated && user && (
          <div className="header-user">
            <div className="header-user-info">
              {isSuperAdmin ? (
                <FaUserShield className="header-user-icon admin" aria-hidden />
              ) : (
                <FaUser className="header-user-icon" aria-hidden />
              )}
              <div>
                <span className="header-user-name">
                  {user.fullName}
                  {isSuperAdmin && <span className="header-role-pill">Super Admin</span>}
                </span>
                <span className="header-user-email">{user.email}</span>
              </div>
            </div>
            <button type="button" className="header-logout" onClick={logout}>
              <FaSignOutAlt /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
