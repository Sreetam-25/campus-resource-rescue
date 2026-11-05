import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResourceFilter } from '../components/resources/ResourceFilter';
import { ResourceCard } from '../components/resources/ResourceCard';
import { SearchIcon, FilterIcon } from '../components/common/Icons';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { resourceService } from '../services/resourceService';

export const BrowsePage = ({ resources = [], loading = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read state from URL search params
  const searchQuery = searchParams.get('search') || '';
  const selectedCategory = searchParams.get('category') || 'all';
  const selectedType = searchParams.get('type') || 'all';
  const selectedCondition = searchParams.get('condition') || 'all';
  const selectedLocation = searchParams.get('location') || 'all';
  const sortBy = searchParams.get('sort') || 'newest';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const itemsPerPage = 6;

  // Helper to update search params while preserving other active filters
  const updateFilter = (key, value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (!value || value === 'all' || value === '') {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }
    // Reset to page 1 on filter changes unless changing page itself
    if (key !== 'page') {
      nextParams.delete('page');
    }
    setSearchParams(nextParams);
  };

  const handleClearAll = () => {
    setSearchParams(new URLSearchParams());
  };

  // Calculate dynamic category counts from the actual dataset
  const categoryCounts = useMemo(() => {
    return resourceService.getCategoryCounts(resources);
  }, [resources]);

  // Filtered & Sorted items
  const filteredResources = useMemo(() => {
    return (resources || []).filter((item) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        const matchesCat = (item.category || '').toLowerCase().includes(q);
        const matchesLoc = (item.location || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCat && !matchesLoc) return false;
      }

      // Category filter
      if (selectedCategory !== 'all') {
        const itemCat = (item.category || '').toLowerCase();
        const selCat = selectedCategory.toLowerCase();
        if (itemCat !== selCat && !itemCat.includes(selCat) && !selCat.includes(itemCat)) {
          return false;
        }
      }

      // Type filter
      if (selectedType !== 'all') {
        const itemType = (item.sharingType || '').toUpperCase();
        if (selectedType === 'GIVE_AWAY' && !itemType.includes('GIVE') && itemType !== 'FREE') return false;
        if (selectedType === 'BORROW' && !itemType.includes('BORROW') && itemType !== 'LEND') return false;
        if (selectedType === 'EXCHANGE' && !itemType.includes('EXCHANGE') && itemType !== 'SWAP') return false;
      }

      // Condition filter
      if (selectedCondition !== 'all') {
        if ((item.condition || '').toLowerCase() !== selectedCondition.toLowerCase()) return false;
      }

      // Location filter
      if (selectedLocation !== 'all') {
        if ((item.location || '').toLowerCase() !== selectedLocation.toLowerCase()) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });
  }, [resources, searchQuery, selectedCategory, selectedType, selectedCondition, selectedLocation, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredResources.length / itemsPerPage) || 1;
  const paginatedResources = filteredResources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div style={{ padding: '40px 0 60px 0', minHeight: '80vh' }}>
      <div className="container">
        {/* Header Title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#133324', marginBottom: '8px' }}>
            Browse Resources
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
            Discover books, electronics, stationery, lab equipment and more from fellow campus members.
          </p>
        </div>

        {/* Global Search Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 18px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '32px'
        }}>
          <SearchIcon size={20} style={{ color: '#94a3b8', marginRight: '12px' }} />
          <input
            type="text"
            placeholder="Search resources by title, description or location..."
            value={searchQuery}
            onChange={(e) => updateFilter('search', e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '1rem',
              color: 'var(--color-text-main)'
            }}
          />
          {searchQuery && (
            <button 
              onClick={() => updateFilter('search', '')}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Mobile Filter Toggle */}
        <div style={{ display: 'none', marginBottom: '16px' }} className="mobile-filter-bar">
          <button 
            className="btn btn-outline"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
          >
            <FilterIcon size={16} /> Filters & Sorting ({filteredResources.length} Found)
          </button>
        </div>

        {/* Main Grid: Sidebar + Listings */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: '32px',
          alignItems: 'start'
        }} className="browse-layout">
          {/* Sidebar */}
          <aside className="browse-sidebar">
            <ResourceFilter 
              selectedCategory={selectedCategory}
              onSelectCategory={(cat) => updateFilter('category', cat)}
              selectedType={selectedType}
              onSelectType={(t) => updateFilter('type', t)}
              selectedCondition={selectedCondition}
              onSelectCondition={(c) => updateFilter('condition', c)}
              selectedLocation={selectedLocation}
              onSelectLocation={(l) => updateFilter('location', l)}
              categoryCounts={categoryCounts}
              totalCount={resources.length}
              onClearAll={handleClearAll}
            />
          </aside>

          {/* Results Column */}
          <main>
            {/* Results bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--color-border-subtle)',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                  {filteredResources.length}
                </span> {filteredResources.length === 1 ? 'resource found' : 'resources found'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Sort by:</span>
                <select 
                  className="form-select"
                  value={sortBy}
                  onChange={(e) => updateFilter('sort', e.target.value)}
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.875rem' }}
                >
                  <option value="newest">Most Recent</option>
                  <option value="title">Title A-Z</option>
                </select>
              </div>
            </div>

            {/* Listings Grid */}
            {loading ? (
              <LoadingSpinner text="Loading campus resources..." />
            ) : paginatedResources.length === 0 ? (
              <div style={{
                background: '#ffffff',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '60px 20px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔍</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
                  No resources match your filters
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', margin: '0 auto 20px auto' }}>
                  Try adjusting your search terms, selecting another category, or resetting all filters.
                </p>
                <button className="btn btn-primary" onClick={handleClearAll}>
                  Clear All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="resources-grid">
                  {paginatedResources.map((res) => (
                    <ResourceCard 
                      key={res.resourceId} 
                      resource={res} 
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '40px'
                  }}>
                    <button 
                      className="btn btn-outline btn-sm"
                      disabled={currentPage === 1}
                      onClick={() => updateFilter('page', (currentPage - 1).toString())}
                    >
                      ‹ Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        onClick={() => updateFilter('page', num.toString())}
                        className={`btn btn-sm ${currentPage === num ? 'btn-primary' : 'btn-outline'}`}
                        style={{ minWidth: '36px', height: '36px', padding: 0 }}
                      >
                        {num}
                      </button>
                    ))}
                    <button 
                      className="btn btn-outline btn-sm"
                      disabled={currentPage === totalPages}
                      onClick={() => updateFilter('page', (currentPage + 1).toString())}
                    >
                      Next ›
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <style>{`
        @media (max-width: 880px) {
          .browse-layout {
            grid-template-columns: 1fr !important;
          }
          .mobile-filter-bar {
            display: block !important;
          }
          .browse-sidebar {
            display: ${mobileFilterOpen ? 'block' : 'none'};
            margin-bottom: 20px;
          }
        }
      `}</style>
    </div>
  );
};
