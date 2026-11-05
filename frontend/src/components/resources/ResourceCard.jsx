import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge, TypeBadge } from '../common/Badge';
import { HeartIcon, MapPinIcon } from '../common/Icons';

export const ResourceCard = ({ resource }) => {
  const [isSaved, setIsSaved] = useState(false);

  // Fallback image generator based on category if needed
  const getFallbackImage = (category, title) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('book')) return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
    if (cat.includes('calc') || (title || '').toLowerCase().includes('calc')) return 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?auto=format&fit=crop&w=600&q=80';
    if (cat.includes('elect') || (title || '').toLowerCase().includes('keyboard')) return 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80';
    if (cat.includes('furn') || (title || '').toLowerCase().includes('table')) return 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=600&q=80';
    if (cat.includes('sport') || (title || '').toLowerCase().includes('bat')) return 'https://images.unsplash.com/photo-1531415074868-036b1c57e329?auto=format&fit=crop&w=600&q=80';
    if (cat.includes('station')) return 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80';
    return 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=600&q=80';
  };

  const imageUrl = resource.imageUrl || getFallbackImage(resource.category, resource.title);

  return (
    <div className="resource-card">
      <Link to={`/resources/${resource.resourceId}`} className="card-img-wrapper" style={{ display: 'block' }}>
        <div className="card-status-badge">
          <StatusBadge status={resource.status} />
        </div>
        <button 
          type="button"
          className="card-save-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsSaved(!isSaved);
          }}
          aria-label="Save resource"
        >
          <HeartIcon size={16} filled={isSaved} className={isSaved ? "text-danger" : ""} />
        </button>
        <img 
          src={imageUrl} 
          alt={resource.title} 
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = getFallbackImage(resource.category, resource.title);
          }}
        />
      </Link>

      <div className="card-content">
        <Link to={`/resources/${resource.resourceId}`}>
          <h3 className="card-title" title={resource.title}>{resource.title}</h3>
        </Link>
        
        <div className="card-category-row">
          <span>●</span>
          <span>{resource.category || 'General'}</span>
        </div>

        <div className="card-meta-row">
          <span>Condition: {resource.condition || 'Good'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <MapPinIcon size={13} /> {resource.location || 'Campus'}
          </span>
        </div>

        <div className="card-footer">
          <TypeBadge type={resource.sharingType} />
          <Link 
            to={`/resources/${resource.resourceId}`}
            className="btn btn-outline btn-sm"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
};
