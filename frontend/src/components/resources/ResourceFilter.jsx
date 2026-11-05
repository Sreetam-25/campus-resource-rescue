import React from 'react';
import { CATEGORIES } from '../home/CategoryGrid';

export const ResourceFilter = ({ 
  selectedCategory, 
  onSelectCategory, 
  selectedType, 
  onSelectType, 
  selectedCondition, 
  onSelectCondition, 
  selectedLocation, 
  onSelectLocation,
  categoryCounts = {},
  totalCount = 0,
  onClearAll 
}) => {
  const listingTypes = [
    { id: 'all', label: 'All Types' },
    { id: 'GIVE_AWAY', label: 'Free (Give Away)' },
    { id: 'BORROW', label: 'Borrow (Lend)' },
    { id: 'EXCHANGE', label: 'Exchange (Swap)' }
  ];

  const conditions = [
    { id: 'all', label: 'All Conditions' },
    { id: 'New', label: 'New' },
    { id: 'Good', label: 'Good' },
    { id: 'Used', label: 'Used' }
  ];

  const locations = [
    'All Locations',
    'Hostel 3, Room 214',
    'Hostel 3, Common Room',
    'Physics Dept Library, Raman Block',
    'Girls Hostel B, Block 1',
    'ECE Department Reception',
    'Drawing Hall 2, Mech Block',
    'Student Activity Center',
    'Campus Indoor Sports Complex',
    'Campus Main Football Ground'
  ];

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '24px 20px',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        marginBottom: '20px'
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Filters</h3>
        <button 
          onClick={onClearAll}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            fontSize: '0.825rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Clear All
        </button>
      </div>

      {/* Category filter with REAL dynamic counts */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '12px', letterSpacing: '0.5px' }}>
          Category
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="radio" 
                name="filterCategory" 
                checked={selectedCategory === 'all'} 
                onChange={() => onSelectCategory('all')} 
              />
              <span>All Categories</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>
              {totalCount}
            </span>
          </label>
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            return (
              <label key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="radio" 
                    name="filterCategory" 
                    checked={selectedCategory === cat.id} 
                    onChange={() => onSelectCategory(cat.id)} 
                  />
                  <span>{cat.name}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: count > 0 ? '#166534' : '#94a3b8', background: count > 0 ? '#dcfce7' : '#f1f5f9', padding: '2px 8px', borderRadius: '10px', fontWeight: count > 0 ? 600 : 400 }}>
                  {count}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Listing Type filter */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '12px', letterSpacing: '0.5px' }}>
          Sharing Type
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {listingTypes.map((t) => (
            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="filterType" 
                checked={selectedType === t.id} 
                onChange={() => onSelectType(t.id)} 
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Condition filter */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '12px', letterSpacing: '0.5px' }}>
          Condition
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {conditions.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="filterCondition" 
                checked={selectedCondition === c.id} 
                onChange={() => onSelectCondition(c.id)} 
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Campus Location filter */}
      <div>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '10px', letterSpacing: '0.5px' }}>
          Campus Location
        </h4>
        <select 
          className="form-select"
          value={selectedLocation}
          onChange={(e) => onSelectLocation(e.target.value)}
          style={{ fontSize: '0.875rem', padding: '8px 12px' }}
        >
          {locations.map((loc) => (
            <option key={loc} value={loc === 'All Locations' ? 'all' : loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
