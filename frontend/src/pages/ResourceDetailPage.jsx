import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { StatusBadge, TypeBadge } from '../components/common/Badge';
import { MapPinIcon } from '../components/common/Icons';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { ResourceCard } from '../components/resources/ResourceCard';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { resourceService } from '../services/resourceService';

export const ResourceDetailPage = ({ 
  allResources = [], 
  onRequestResource 
}) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load resource by URL parameter
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const found = allResources.find(r => r.resourceId === id);
    if (found) {
      setResource(found);
      setLoading(false);
    } else {
      resourceService.getResourceById(id).then(res => {
        if (isMounted) {
          setResource(res);
          setLoading(false);
        }
      });
    }

    return () => { isMounted = false; };
  }, [id, allResources]);

  if (loading) {
    return (
      <div style={{ padding: '80px 20px', minHeight: '60vh' }}>
        <LoadingSpinner text="Loading resource details..." />
      </div>
    );
  }

  if (!resource) {
    return (
      <div style={{ padding: '80px 20px', minHeight: '70vh', textAlign: 'center' }}>
        <div style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          padding: '48px 24px',
          maxWidth: '500px',
          margin: '0 auto',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔍</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '8px' }}>
            Resource Not Found
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            The requested campus item ID <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{id}</code> does not exist or has been removed.
          </p>
          <Link to="/browse" className="btn btn-primary">
            Browse All Available Resources
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = isAuthenticated && user && (resource.ownerId === user.id || resource.ownerId === user.sub);
  const isAvailable = (resource.status || '').toUpperCase() === 'AVAILABLE';

  // Related items
  const related = (allResources || [])
    .filter(r => r.resourceId !== resource.resourceId && r.category === resource.category)
    .slice(0, 4);

  const handleOpenRequestModal = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setRequestModalOpen(true);
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      await onRequestResource(resource, requestMessage);
      setRequestSuccess(true);
      setTimeout(() => {
        setRequestSuccess(false);
        setRequestModalOpen(false);
        setRequestMessage('');
      }, 1600);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '32px 0 60px 0', minHeight: '80vh' }}>
      <div className="container">
        {/* Breadcrumb with Router Link */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.875rem',
          color: 'var(--color-text-muted)',
          marginBottom: '28px'
        }}>
          <Link 
            to="/browse"
            style={{ color: 'var(--color-primary)', fontWeight: 600 }}
          >
            ← Browse Resources
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>
            {resource.title}
          </span>
        </div>

        {/* Main Details Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.1fr',
          gap: '40px',
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          padding: '36px',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card)',
          marginBottom: '48px'
        }} className="resource-detail-grid">
          {/* Left: Photos */}
          <div>
            <div style={{
              width: '100%',
              height: '380px',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              background: '#f1f5f0',
              border: '1px solid var(--color-border-subtle)',
              position: 'relative'
            }}>
              <img 
                src={resource.imageUrl} 
                alt={resource.title} 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>
              📍 Campus Collection Point: <strong>{resource.location}</strong>
            </div>
          </div>

          {/* Right: Info & Request CTA */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <StatusBadge status={resource.status} />
              <TypeBadge type={resource.sharingType} />
              <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '3px 10px', borderRadius: '12px' }}>
                {resource.category}
              </span>
            </div>

            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '14px', lineHeight: 1.2 }}>
              {resource.title}
            </h1>

            <p style={{
              fontSize: '1rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
              marginBottom: '24px',
              whiteSpace: 'pre-line'
            }}>
              {resource.description}
            </p>

            {/* Spec list */}
            <div style={{
              background: 'var(--color-bg-page)',
              borderRadius: 'var(--radius-md)',
              padding: '18px 20px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              border: '1px solid var(--color-border-subtle)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Condition:</span>
                <span style={{ fontWeight: 600 }}>{resource.condition || 'Good'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Campus Location:</span>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPinIcon size={14} /> {resource.location || 'Campus'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Sharing Type:</span>
                <span style={{ fontWeight: 600 }}>
                  {resource.sharingType === 'GIVE_AWAY' ? 'Give Away (Free to keep)' : resource.sharingType === 'BORROW' ? 'Borrow (Temporary loan)' : 'Exchange (Swap for items)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Posted On:</span>
                <span style={{ fontWeight: 600 }}>
                  {new Date(resource.createdAt || Date.now()).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Owner Profile Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 18px',
              background: '#ffffff',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              marginBottom: '24px'
            }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'var(--color-accent-light)',
                color: 'var(--color-primary)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem'
              }}>
                {(resource.ownerName || 'C').charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {resource.ownerName}
                </div>
                <div style={{ fontSize: '0.775rem', color: '#64748b' }}>
                  Listing Creator
                </div>
              </div>
            </div>

            {/* Request CTA Button with multi-user permissions */}
            <div style={{ marginTop: 'auto' }}>
              {isOwner ? (
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-primary)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  textAlign: 'center'
                }}>
                  👤 You posted this listing. You can track and manage requests in your <Link to="/dashboard" style={{ textDecoration: 'underline' }}>Dashboard</Link>.
                </div>
              ) : !isAvailable ? (
                <button 
                  className="btn btn-secondary btn-lg"
                  style={{ width: '100%', justifyContent: 'center', opacity: 0.75, cursor: 'not-allowed' }}
                  disabled
                >
                  🔒 Resource Already Claimed
                </button>
              ) : (
                <button 
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleOpenRequestModal}
                >
                  🤝 {isAuthenticated ? 'Request This Resource' : 'Sign in to Request This Resource'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Related Resources */}
        {related.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '20px' }}>
              More in {resource.category}
            </h3>
            <div className="resources-grid">
              {related.map(r => (
                <ResourceCard 
                  key={r.resourceId} 
                  resource={r} 
                />
              ))}
            </div>
          </div>
        )}

        {/* Request Modal */}
        <Modal
          isOpen={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          title={`Request: ${resource.title}`}
        >
          {requestSuccess ? (
            <div style={{ textAlign: 'center', padding: '24px 10px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🎉</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                Request Sent to {resource.ownerName}!
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
                You can track the status of this request in your <Link to="/dashboard/requests" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>My Requests</Link> dashboard.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSendRequest}>
              {errorMsg && (
                <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
                  {errorMsg}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Requester Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={user?.name || ''} 
                  disabled 
                  style={{ background: '#f8fafc' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Your Email</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={user?.email || ''} 
                  disabled 
                  style={{ background: '#f8fafc' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Message to Owner <span className="required">*</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Explain why you need this item, when you can pick it up on campus, or when you plan to return it..."
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => setRequestModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? <LoadingSpinner text="Sending..." size="sm" /> : 'Send Request'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>

      <style>{`
        @media (max-width: 840px) {
          .resource-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};
