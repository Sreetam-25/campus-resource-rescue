import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SearchIcon, ArrowRightIcon, UploadIcon, BoxIcon, UsersIcon, LeafIcon } from '../common/Icons';

export const HeroSection = ({ stats }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/browse?search=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/browse');
    }
  };

  return (
    <section className="hero-section">
      <div className="container">
        <div className="hero-grid">
          {/* Left Column: Copy & Actions */}
          <div>
            <h1 className="hero-title">
              Give unused resources <br />
              <span className="highlight">a second life.</span>
            </h1>
            <p className="hero-subtitle">
              Share, discover and reuse resources within your campus community. Reduce waste and help fellow students.
            </p>

            {/* Integrated Search Bar */}
            <form className="hero-search-pill" onSubmit={handleSubmit}>
              <SearchIcon size={20} style={{ color: '#94a3b8', marginRight: '10px' }} />
              <input
                type="text"
                placeholder="Search for books, electronics, furniture..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="search-btn" aria-label="Search">
                <SearchIcon size={18} />
              </button>
            </form>

            {/* Action Buttons using Router Links */}
            <div className="hero-actions hero-cta-cluster">
              <Link 
                to="/browse"
                className="btn btn-primary btn-lg"
              >
                Explore Resources <ArrowRightIcon size={18} />
              </Link>
              <Link 
                to="/post-resource"
                className="btn btn-outline btn-lg"
              >
                <UploadIcon size={18} /> Share a Resource
              </Link>
            </div>

            {/* Stats Row */}
            <div className="stats-card-row">
              <div className="stat-item">
                <div className="stat-icon">
                  <BoxIcon size={20} />
                </div>
                <div>
                  <div className="stat-number">
                    {stats?.totalResources ? `${stats.totalResources}` : '28'}
                  </div>
                  <div className="stat-label">Resources Shared</div>
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-icon">
                  <UsersIcon size={20} />
                </div>
                <div>
                  <div className="stat-number">
                    {stats?.totalRequests ? `${stats.totalRequests}` : '2'}
                  </div>
                  <div className="stat-label">Requests Created</div>
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-icon">
                  <LeafIcon size={20} />
                </div>
                <div>
                  <div className="stat-number">
                    {stats?.claimedResources ? `${stats.claimedResources}` : '0'}
                  </div>
                  <div className="stat-label">Items Reused</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Showcase */}
          <div className="hero-media-wrapper">
            <div className="hero-image-card">
              <div className="hero-visual-inner">
                <div className="hero-visual-top">
                  <div className="hero-glass-chip">
                    🎓 Campus Circular Economy
                  </div>
                  <span className="hero-visual-leaf" aria-hidden="true">🌿</span>
                </div>

                <div className="hero-3d-scene" aria-hidden="true">
                  <div className="hero-3d-stage">
                    <div className="iso-shadow" />
                    <div className="iso iso-notebook">
                      <span className="iso-notebook-band" />
                    </div>
                    <div className="iso iso-book">
                      <span className="iso-book-spine" />
                      <span className="iso-book-cover">DSA</span>
                    </div>
                    <div className="iso iso-calc">
                      <span className="iso-calc-screen" />
                      <span className="iso-calc-keys" />
                    </div>
                    <div className="iso iso-pencil" />
                  </div>
                </div>

                <div className="hero-visual-caption">
                  <span>🤝 Connecting students & departments across campus</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
