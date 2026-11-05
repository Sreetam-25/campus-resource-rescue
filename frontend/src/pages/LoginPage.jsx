import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LeafIcon } from '../components/common/Icons';

export const LoginPage = () => {
  const { login, confirmRegistration, resendCode, loading, authError, setAuthError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnconfirmed, setIsUnconfirmed] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [resendStatus, setResendStatus] = useState('');

  const from = location.state?.from?.pathname || '/browse';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError('Please enter both your college email and password.');
      return;
    }
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err.name === 'UserNotConfirmedException' || err.code === 'UserNotConfirmedException') {
        setIsUnconfirmed(true);
      }
    }
  };

  const handleConfirmCode = async (e) => {
    e.preventDefault();
    setAuthError(null);
    if (!verificationCode.trim()) {
      setAuthError('Please enter the verification code.');
      return;
    }
    try {
      await confirmRegistration(email, verificationCode);
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      // Error handled in AuthContext
    }
  };

  const handleResend = async () => {
    setResendStatus('');
    try {
      await resendCode(email);
      setResendStatus('Verification code resent! Please check your email.');
    } catch (err) {
      // Handled in AuthContext
    }
  };

  return (
    <div
      style={{
        padding: '60px 20px',
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          padding: '36px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--color-primary)',
              color: 'var(--color-accent-mint)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <LeafIcon size={24} />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-text-main)',
              marginBottom: '6px',
            }}
          >
            {isUnconfirmed ? 'Verify Account' : 'Welcome Back'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            {isUnconfirmed
              ? `Enter the verification code sent to ${email}`
              : 'Log in to share, borrow, or manage campus resources.'}
          </p>
        </div>

        {authError && (
          <div
            style={{
              padding: '12px 14px',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '20px',
            }}
          >
            ⚠️ {authError}
          </div>
        )}

        {resendStatus && (
          <div
            style={{
              padding: '12px 14px',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '20px',
            }}
          >
            ✓ {resendStatus}
          </div>
        )}

        {!isUnconfirmed ? (
          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div className="form-group">
              <label className="form-label">
                College Email <span className="required">*</span>
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="e.g. rahul@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">
                Password <span className="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: '16px', padding: '14px' }}
            >
              {loading ? 'Logging in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmCode}>
            <div className="form-group">
              <label className="form-label">
                Verification Code <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="6-digit verification code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={10}
                required
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '4px' }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: '12px', padding: '14px' }}
            >
              {loading ? 'Verifying...' : 'Verify & Log In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '18px', fontSize: '0.85rem' }}>
              <button
                type="button"
                onClick={handleResend}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
              >
                Resend Code
              </button>
              <button
                type="button"
                onClick={() => setIsUnconfirmed(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* Footer Link */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid var(--color-border-subtle)',
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary)',
          }}
        >
          New student or department?{' '}
          <Link
            to="/register"
            style={{
              color: 'var(--color-primary)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
};
