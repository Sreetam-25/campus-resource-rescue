import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from '../common/Icons';

export const CATEGORIES = [
  { id: 'Books and Notebooks', name: 'Books & Notes', icon: '📚' },
  { id: 'Electronics', name: 'Electronics', icon: '💻' },
  { id: 'Stationery', name: 'Stationery', icon: '✏️' },
  { id: 'Furniture', name: 'Furniture', icon: '🪑' },
  { id: 'Laboratory Equipment', name: 'Lab Equipment', icon: '🔬' },
  { id: 'Sports Equipment', name: 'Sports Gear', icon: '⚽' },
  { id: 'Hostel Essentials', name: 'Hostel Essentials', icon: '🧺' },
  { id: 'Other', name: 'Other', icon: '📦' }
];

export const CategoryGrid = ({ categoryCounts = {} }) => {
  const navigate = useNavigate();

  const handleCategoryClick = (catId) => {
    navigate(`/browse?category=${encodeURIComponent(catId)}`);
  };

  return (
    <section className="category-section">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Browse by Category</h2>
          <Link 
            to="/browse"
            className="section-link"
          >
            View All Categories <ArrowRightIcon size={16} />
          </Link>
        </div>

        <div className="category-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            return (
              <div 
                key={cat.id} 
                className="category-card"
                onClick={() => handleCategoryClick(cat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCategoryClick(cat.id); }}
              >
                <div className="category-icon-box">
                  {cat.icon}
                </div>
                <span className="category-card-name">{cat.name}</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '1px 8px', borderRadius: '10px' }}>
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
