import React from 'react';

export const StatusBadge = ({ status }) => {
  const normalized = (status || 'AVAILABLE').toUpperCase();
  
  if (normalized === 'AVAILABLE') {
    return (
      <span className="badge badge-available">
        <span className="badge-dot" /> Available
      </span>
    );
  }
  
  if (normalized === 'CLAIMED' || normalized === 'PENDING_CLAIM') {
    return (
      <span className="badge badge-claimed">
        <span className="badge-dot" /> {normalized === 'PENDING_CLAIM' ? 'Pending Claim' : 'Claimed'}
      </span>
    );
  }

  if (normalized === 'BORROWED') {
    return (
      <span className="badge" style={{ backgroundColor: '#e0e7ff', color: '#3730a3' }}>
        <span className="badge-dot" style={{ backgroundColor: '#6366f1' }} /> Borrowed
      </span>
    );
  }

  if (normalized === 'GIVEN_AWAY') {
    return (
      <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
        <span className="badge-dot" style={{ backgroundColor: '#94a3b8' }} /> Given Away
      </span>
    );
  }

  if (normalized === 'PENDING') {
    return (
      <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
        <span className="badge-dot" style={{ backgroundColor: '#f59e0b' }} /> Pending
      </span>
    );
  }

  if (normalized === 'ACCEPTED') {
    return (
      <span className="badge badge-available">
        <span className="badge-dot" /> Accepted
      </span>
    );
  }

  if (normalized === 'REJECTED') {
    return (
      <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
        <span className="badge-dot" style={{ backgroundColor: '#ef4444' }} /> Rejected
      </span>
    );
  }

  return <span className="badge badge-claimed">{status}</span>;
};

export const TypeBadge = ({ type }) => {
  const normalized = (type || 'GIVE_AWAY').toLowerCase();
  
  if (normalized.includes('give') || normalized === 'free') {
    return <span className="badge badge-free">Free</span>;
  }
  if (normalized.includes('borrow') || normalized === 'lend') {
    return <span className="badge badge-borrow">Borrow</span>;
  }
  if (normalized.includes('exchange') || normalized === 'swap') {
    return <span className="badge badge-exchange">Exchange</span>;
  }

  return <span className="badge badge-free">{type}</span>;
};
