import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { StatusBadge, TypeBadge } from '../components/common/Badge';
import { BoxIcon, CheckIcon, ClockIcon, UsersIcon } from '../components/common/Icons';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export const DashboardPage = ({ 
  resources = [], 
  requests = [], 
  loading = false, 
  onAcceptRequest, 
  onRejectRequest, 
  onMarkAvailable 
}) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Determine active tab from URL path and search params
  const getTabFromPath = () => {
    if (location.pathname.includes('/listings')) return 'listings';
    if (location.pathname.includes('/requests')) {
      return searchParams.get('tab') === 'incoming' ? 'incoming' : 'sent';
    }
    return 'listings';
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Sync tab with URL navigation changes (browser back/forward)
  useEffect(() => {
    setActiveTab(getTabFromPath());
  }, [location.pathname, searchParams]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'listings') {
      navigate('/dashboard/listings');
    } else if (tab === 'incoming') {
      navigate('/dashboard/requests?tab=incoming');
    } else if (tab === 'sent') {
      navigate('/dashboard/requests');
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div style={{ padding: '80px 20px', minHeight: '80vh', textAlign: 'center' }}>
        <div style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          padding: '48px 24px',
          maxWidth: '480px',
          margin: '0 auto',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>👤</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '8px' }}>
            Sign In to View Dashboard
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            Please log in to manage your listed resources and track incoming or outgoing borrow requests.
          </p>
          <Link to="/login" state={{ from: location }} className="btn btn-primary">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Filter listings & requests strictly for current authenticated user
  const myListings = resources.filter(r => r.ownerId === user.id || r.ownerId === user.sub);
  const myRequests = requests.filter(r => r.requesterId === user.id || r.requesterId === user.sub);
  const incomingRequests = requests.filter(r => r.ownerId === user.id || r.ownerId === user.sub);

  // Dynamic user-specific metrics
  const totalListed = myListings.length;
  const availableCount = myListings.filter(i => (i.status || '').toUpperCase() === 'AVAILABLE').length;
  const claimedCount = myListings.filter(i => ['CLAIMED', 'PENDING_CLAIM', 'BORROWED', 'GIVEN_AWAY'].includes((i.status || '').toUpperCase())).length;
  const incomingPendingCount = incomingRequests.filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
  const totalRequestsMade = myRequests.length;

  const handleDecision = async (requestId, decision) => {
    setActionLoadingId(requestId);
    try {
      if (decision === 'ACCEPT') {
        await onAcceptRequest(requestId);
      } else {
        await onRejectRequest(requestId);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReturnToAvailable = async (resourceId, newStatus = 'AVAILABLE') => {
    setActionLoadingId(resourceId);
    try {
      await onMarkAvailable(resourceId, newStatus);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div style={{ padding: '40px 0 60px 0', minHeight: '80vh' }}>
      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#133324', marginBottom: '8px' }}>
              My Dashboard
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
              Logged in as <strong style={{ color: 'var(--color-primary)' }}>{user.name}</strong> ({user.role || user.accountType} • {user.email})
            </p>
          </div>
          <Link to="/post-resource" className="btn btn-primary">
            + Share New Resource
          </Link>
        </div>

        {/* 4 Metric Cards for User Activity */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '20px',
          marginBottom: '36px'
        }} className="dashboard-metrics-grid">
          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: '#f1f5f9',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BoxIcon size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-main)', lineHeight: 1.1 }}>
                {totalListed}
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                My Total Listings
              </div>
            </div>
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: '#dcfce7',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckIcon size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#166534', lineHeight: 1.1 }}>
                {availableCount}
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Available to Others
              </div>
            </div>
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: '#fef3c7',
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ClockIcon size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#b45309', lineHeight: 1.1 }}>
                {incomingPendingCount}
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Incoming Requests
              </div>
            </div>
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: '#ede9fe',
              color: '#6d28d9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UsersIcon size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#6d28d9', lineHeight: 1.1 }}>
                {totalRequestsMade}
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                My Sent Requests
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation with deep URLs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '24px'
        }}>
          <button
            onClick={() => switchTab('listings')}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'listings' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === 'listings' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer'
            }}
          >
            My Listings ({myListings.length})
          </button>

          <button
            onClick={() => switchTab('incoming')}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'incoming' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === 'incoming' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Incoming Requests ({incomingRequests.length})</span>
            {incomingPendingCount > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#ffffff',
                fontSize: '0.7rem',
                padding: '1px 6px',
                borderRadius: '10px'
              }}>
                {incomingPendingCount} new
              </span>
            )}
          </button>

          <button
            onClick={() => switchTab('sent')}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'sent' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === 'sent' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer'
            }}
          >
            My Requests ({myRequests.length})
          </button>
        </div>

        {/* Tab 1: My Listings */}
        {activeTab === 'listings' && (
          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {loading ? (
              <LoadingSpinner text="Loading your listings..." />
            ) : myListings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📦</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>No listings posted by {user.name}</h3>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                  Share textbooks, lab instruments, or sports equipment to help other campus members.
                </p>
                <Link to="/post-resource" className="btn btn-primary">
                  + Share Your First Resource
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)', color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '14px 20px' }}>Resource</th>
                      <th style={{ padding: '14px 20px' }}>Sharing Type</th>
                      <th style={{ padding: '14px 20px' }}>Status</th>
                      <th style={{ padding: '14px 20px' }}>Campus Location</th>
                      <th style={{ padding: '14px 20px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myListings.map((item) => (
                      <tr key={item.resourceId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '8px',
                              background: '#e2e8f0',
                              overflow: 'hidden',
                              flexShrink: 0
                            }}>
                              <img 
                                src={item.imageUrl} 
                                alt={item.title} 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--color-text-main)' }}>
                                {item.title}
                              </div>
                              <div style={{ fontSize: '0.775rem', color: '#64748b' }}>
                                {item.category} • Condition: {item.condition}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          <TypeBadge type={item.sharingType} />
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          <StatusBadge status={item.status} />
                        </td>

                        <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: '#475569' }}>
                          {item.location}
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Link 
                              to={`/resources/${item.resourceId}`}
                              className="btn btn-outline btn-sm"
                            >
                              View
                            </Link>

                            {/* Mark available again for returned items or confirm collection */}
                            {((item.status || '').toUpperCase() === 'BORROWED' || (item.status || '').toUpperCase() === 'CLAIMED') && (
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={actionLoadingId === item.resourceId}
                                onClick={() => handleReturnToAvailable(item.resourceId, 'AVAILABLE')}
                                title="Mark returned and make available to other students again"
                              >
                                {actionLoadingId === item.resourceId ? 'Updating...' : '🔄 Mark Available'}
                              </button>
                            )}
                            {(item.status || '').toUpperCase() === 'PENDING_CLAIM' && (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={actionLoadingId === item.resourceId}
                                onClick={() => handleReturnToAvailable(item.resourceId, 'GIVEN_AWAY')}
                                title="Confirm collection and finalize giveaway"
                              >
                                {actionLoadingId === item.resourceId ? 'Updating...' : '✓ Confirm Collection'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Incoming Requests (Owner controls) */}
        {activeTab === 'incoming' && (
          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {incomingRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📬</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>No incoming requests for your listings</h3>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  When other students or departments request items you've posted, their requests will appear here for your approval.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)', color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '14px 20px' }}>Requested Resource</th>
                      <th style={{ padding: '14px 20px' }}>Requester</th>
                      <th style={{ padding: '14px 20px' }}>Message</th>
                      <th style={{ padding: '14px 20px' }}>Request Status</th>
                      <th style={{ padding: '14px 20px' }}>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomingRequests.map((req) => (
                      <tr key={req.requestId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{req.resourceTitle}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {new Date(req.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{req.requesterName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{req.requesterEmail}</div>
                        </td>

                        <td style={{ padding: '14px 20px', maxWidth: '280px' }}>
                          <div style={{ fontSize: '0.85rem', color: '#334155', fontStyle: 'italic' }}>
                            "{req.message}"
                          </div>
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          <StatusBadge status={req.status} />
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          {(req.status || '').toUpperCase() === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={actionLoadingId === req.requestId}
                                onClick={() => handleDecision(req.requestId, 'ACCEPT')}
                              >
                                {actionLoadingId === req.requestId ? 'Saving...' : 'Accept'}
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                disabled={actionLoadingId === req.requestId}
                                onClick={() => handleDecision(req.requestId, 'REJECT')}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                              Decided: {req.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Sent Requests (Logged in user's claim history) */}
        {activeTab === 'sent' && (
          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {myRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🤝</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>No requests sent by {user.name}</h3>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                  Explore textbooks, electronics, and lab equipment on the catalog and submit a borrow or giveaway request.
                </p>
                <Link to="/browse" className="btn btn-primary">
                  Browse Resources
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)', color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '14px 20px' }}>Requested Resource</th>
                      <th style={{ padding: '14px 20px' }}>Owner</th>
                      <th style={{ padding: '14px 20px' }}>Request Date</th>
                      <th style={{ padding: '14px 20px' }}>Your Message</th>
                      <th style={{ padding: '14px 20px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequests.map((req) => (
                      <tr key={req.requestId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <Link to={`/resources/${req.resourceId}`} style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-primary)' }}>
                            {req.resourceTitle}
                          </Link>
                        </td>

                        <td style={{ padding: '14px 20px', fontSize: '0.85rem' }}>
                          {req.ownerName}
                        </td>

                        <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: '#64748b' }}>
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>

                        <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: '#475569', maxWidth: '240px' }}>
                          "{req.message}"
                        </td>

                        <td style={{ padding: '14px 20px' }}>
                          <StatusBadge status={req.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .dashboard-metrics-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 500px) {
          .dashboard-metrics-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};
