import React from 'react';
import { Link } from 'react-router-dom';
import { LeafIcon } from './Icons';

export const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand Info */}
          <div className="footer-brand">
            <Link to="/" className="footer-brand-title">
              <div className="brand-icon" style={{ background: '#2d6a4f' }}>
                <LeafIcon size={20} />
              </div>
              <span>Campus Resource Rescue</span>
            </Link>
            <p className="footer-tagline">
              One student's unused resource is another student's useful find. Empowering campuses through sustainable circular resource exchange.
            </p>
          </div>

          {/* About */}
          <div>
            <h4 className="footer-heading">About</h4>
            <ul className="footer-links">
              <li><Link to="/" className="footer-link">Our Mission</Link></li>
              <li><Link to="/browse" className="footer-link">Browse Catalog</Link></li>
              <li><Link to="/" className="footer-link">Campus Sustainability</Link></li>
              <li><Link to="/" className="footer-link">Community Guidelines</Link></li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="footer-heading">Help & FAQs</h4>
            <ul className="footer-links">
              <li><Link to="/browse" className="footer-link">How to Borrow</Link></li>
              <li><Link to="/post-resource" className="footer-link">How to Give Away</Link></li>
              <li><Link to="/dashboard" className="footer-link">Track Requests</Link></li>
              <li><Link to="/" className="footer-link">Safety & Trust</Link></li>
            </ul>
          </div>

          {/* Contact & Sustainability Badge */}
          <div>
            <h4 className="footer-heading">Contact & Impact</h4>
            <div className="footer-badge-box">
              <div className="footer-badge-title">🌱 Reuse • Share • Sustain</div>
              <p className="footer-badge-text">
                Designed for college campuses to minimize waste and promote collaborative student access to educational resources.
              </p>
            </div>
            <div style={{ marginTop: '16px', fontSize: '0.825rem', color: '#9ca3af' }}>
              <div>📍 Campus Central Library, Student Desk</div>
              <div>✉️ support@campusrescue.edu</div>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} Campus Resource Rescue. College Campus Sharing Initiative.</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Connect • Share • Sustain</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
