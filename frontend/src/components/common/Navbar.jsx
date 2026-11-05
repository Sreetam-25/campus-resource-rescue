import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LeafIcon, MenuIcon, XIcon } from './Icons';
import { useAuth } from '../../context/AuthContext';

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    closeMenus();
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        {/* Brand */}
        <Link to="/" className="brand" onClick={closeMenus}>
          <div className="brand-icon">
            <LeafIcon size={22} />
          </div>
          <span>Campus Resource Rescue</span>
        </Link>

        {/* Desktop Nav Items */}
        <nav>
          <ul className="nav-links">
            <li>
              <NavLink 
                to="/" 
                end
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                Home
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/browse" 
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                Browse Resources
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/post-resource" 
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                Share a Resource
              </NavLink>
            </li>
            {isAuthenticated && (
              <li>
                <NavLink 
                  to="/dashboard" 
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  Dashboard
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        {/* User Auth Section */}
        <div className="nav-auth">
          {!isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link to="/login" className="btn btn-outline btn-sm">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Sign Up
              </Link>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* Profile Avatar / Pill Button */}
              <button
                className="btn btn-outline btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px' }}
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                aria-label="User profile menu"
              >
                <span style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700
                }}>
                  {user.avatar || 'U'}
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user.name}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>▼</span>
              </button>

              {/* Profile Dropdown Menu */}
              {profileDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '115%',
                  background: '#ffffff',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  width: '220px',
                  padding: '8px',
                  zIndex: 200
                }}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: '6px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-main)' }}>{user.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user.email}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: '2px' }}>
                      {user.accountType} • {user.department}
                    </div>
                  </div>

                  <Link
                    to="/dashboard/listings"
                    onClick={closeMenus}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'var(--color-bg-subtle)'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    📦 My Listings
                  </Link>

                  <Link
                    to="/dashboard/requests"
                    onClick={closeMenus}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'var(--color-bg-subtle)'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    🤝 My Requests
                  </Link>

                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '6px 0' }} />

                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#dc2626',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#fef2f2'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button 
          className="mobile-nav-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: 'var(--header-height)',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#ffffff',
          zIndex: 99,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <NavLink 
            to="/" 
            end
            onClick={closeMenus}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            style={{ textAlign: 'left', fontSize: '1.1rem', padding: '10px 0' }}
          >
            Home
          </NavLink>
          <NavLink 
            to="/browse" 
            onClick={closeMenus}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            style={{ textAlign: 'left', fontSize: '1.1rem', padding: '10px 0' }}
          >
            Browse Resources
          </NavLink>
          <NavLink 
            to="/post-resource" 
            onClick={closeMenus}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            style={{ textAlign: 'left', fontSize: '1.1rem', padding: '10px 0' }}
          >
            Share a Resource
          </NavLink>
          {isAuthenticated && (
            <NavLink 
              to="/dashboard" 
              onClick={closeMenus}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              style={{ textAlign: 'left', fontSize: '1.1rem', padding: '10px 0' }}
            >
              My Dashboard
            </NavLink>
          )}

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: 'auto' }}>
            {isAuthenticated ? (
              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Signed in as:</div>
                <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '1rem', marginTop: '2px' }}>
                  {user.name} ({user.accountType})
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', marginTop: '12px', justifyContent: 'center', color: '#dc2626' }}
                  onClick={handleLogout}
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <Link
                  to="/login"
                  className="btn btn-outline"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={closeMenus}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={closeMenus}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
