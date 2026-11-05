import React from 'react';
import { UploadIcon, SearchIcon, UsersIcon } from '../common/Icons';

export const HowItWorks = () => {
  return (
    <section className="how-it-works-section">
      <div className="container">
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
          <h2 className="section-title" style={{ fontSize: '2rem' }}>How It Works</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', fontSize: '0.95rem' }}>
            Sharing and borrowing campus resources in three effortless steps.
          </p>
        </div>

        <div className="how-steps-grid">
          {/* Step 1 */}
          <div className="step-card">
            <div className="step-header">
              <div className="step-icon-box">
                <UploadIcon size={24} />
              </div>
              <div className="step-number">1</div>
            </div>
            <h3 className="step-title">List an unused resource</h3>
            <p className="step-desc">
              Add details, condition, location, and a photograph of the resource you want to give away, lend, or exchange.
            </p>
          </div>

          {/* Step 2 */}
          <div className="step-card">
            <div className="step-header">
              <div className="step-icon-box">
                <SearchIcon size={24} />
              </div>
              <div className="step-number">2</div>
            </div>
            <h3 className="step-title">Someone discovers & requests it</h3>
            <p className="step-desc">
              Fellow students browse listings across categories, find what they need, and send a direct borrow/claim request.
            </p>
          </div>

          {/* Step 3 */}
          <div className="step-card">
            <div className="step-header">
              <div className="step-icon-box">
                <UsersIcon size={24} />
              </div>
              <div className="step-number">3</div>
            </div>
            <h3 className="step-title">Connect & exchange safely</h3>
            <p className="step-desc">
              The owner accepts the request, coordinates meeting at a designated campus pickup spot, and hands over the item.
            </p>
          </div>
        </div>

        {/* Environmental sustainability callout */}
        <div className="impact-glass-banner" style={{
          marginTop: '44px',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '1rem' }}>
              🌍 Campus Environmental & Financial Impact
            </div>
            <div style={{ fontSize: '0.875rem', color: '#2d6a4f', marginTop: '4px' }}>
              Reusing lab equipment, books, and electronics keeps functional goods out of landfills and reduces student expenses.
            </div>
          </div>
          <div style={{
            background: '#ffffff',
            padding: '8px 16px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            100% Student-to-Student
          </div>
        </div>
      </div>
    </section>
  );
};
