import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage = () => {
  return (
    <div style={{ padding: '80px 20px', minHeight: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        padding: '48px 32px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🍃</div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '8px' }}>
          404 - Page Not Found
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '28px' }}>
          The campus resource or page you are looking for does not exist, has been claimed, or was moved.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-outline">
            Go to Home
          </Link>
          <Link to="/browse" className="btn btn-primary">
            Browse All Resources
          </Link>
        </div>
      </div>
    </div>
  );
};
