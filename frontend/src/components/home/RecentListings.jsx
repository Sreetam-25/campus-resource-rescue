import React from 'react';
import { Link } from 'react-router-dom';
import { ResourceCard } from '../resources/ResourceCard';
import { ArrowRightIcon } from '../common/Icons';
import { LoadingSpinner } from '../common/LoadingSpinner';

export const RecentListings = ({ resources, loading }) => {
  const displayItems = (resources || []).slice(0, 4);

  return (
    <section style={{ padding: '48px 0', background: 'var(--color-bg-page)' }}>
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Recently Shared Resources</h2>
          <Link 
            to="/browse"
            className="section-link"
          >
            View All Resources <ArrowRightIcon size={16} />
          </Link>
        </div>

        {loading ? (
          <LoadingSpinner text="Loading campus listings..." />
        ) : displayItems.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)'
          }}>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              No resources listed yet. Be the first to share!
            </p>
            <Link to="/post-resource" className="btn btn-primary">
              + Share First Resource
            </Link>
          </div>
        ) : (
          <div className="resources-grid">
            {displayItems.map((res) => (
              <ResourceCard 
                key={res.resourceId} 
                resource={res} 
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
