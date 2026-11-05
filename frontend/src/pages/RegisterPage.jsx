import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LeafIcon, CheckIcon } from '../components/common/Icons';

export const RegisterPage = () => {
  const { register, confirmRegistration, resendCode, login, loading, authError, setAuthError } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    accountType: 'Student',
    department: 'Computer Science & Engineering',
  });

  const [step, setStep] = useState('register'); // 'register' | 'confirm' | 'success'
  const [verificationCode, setVerificationCode] = useState('');
  const [resendStatus, setResendStatus] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);

    if (!formData.name.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setAuthError('Please enter a valid college email address.');
      return;
    }
    if (formData.password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      setAuthError('Password must contain at least one uppercase letter and one number.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setAuthError('Passwords do not match. Please re-enter.');
      return;
    }

    try {
      const result = await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        accountType: formData.accountType,
        department: formData.department,
      });

      if (result.isSignUpComplete) {
        // Automatically log in
        await login(formData.email, formData.password);
        navigate('/browse', { replace: true });
      } else {
        // Move to verification step
        setStep('confirm');
      }
    } catch (err) {
      // Error is set in AuthContext
    }
  };

  const handleConfirmCode = async (e) => {
    e.preventDefault();
    setAuthError(null);

    if (!verificationCode.trim()) {
      setAuthError('Please enter the verification code sent to your email.');
      return;
    }

    try {
      await confirmRegistration(formData.email, verificationCode);
      setStep('success');

      // Attempt automatic sign-in
      try {
        await login(formData.email, formData.password);
        setTimeout(() => {
          navigate('/browse', { replace: true });
        }, 1200);
      } catch {
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1500);
      }
    } catch (err) {
      // Error handled in AuthContext
    }
  };

  const handleResend = async () => {
    setResendStatus('');
    try {
      await resendCode(formData.email);
      setResendStatus('Verification code resent! Please check your inbox.');
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
          maxWidth: '500px',
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
            {step === 'register' && 'Create Campus Account'}
            {step === 'confirm' && 'Verify Your Email'}
            {step === 'success' && 'Account Verified!'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            {step === 'register' && 'Join the student and department resource-sharing community.'}
            {step === 'confirm' && `We sent a confirmation code to ${formData.email}.`}
            {step === 'success' && 'Redirecting you to the platform...'}
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

        {/* Step 1: Registration Form */}
        {step === 'register' && (
          <form onSubmit={handleSubmit}>
            {/* Full Name */}
            <div className="form-group">
              <label className="form-label">
                Full Name <span className="required">*</span>
              </label>
              <input
                type="text"
                name="name"
                className="form-input"
                placeholder="e.g. Rahul Sharma"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">
                College Email Address <span className="required">*</span>
              </label>
              <input
                type="email"
                name="email"
                className="form-input"
                placeholder="e.g. rahul@college.edu"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            {/* Account Type */}
            <div className="form-group">
              <label className="form-label">
                Account Type <span className="required">*</span>
              </label>
              <select
                name="accountType"
                className="form-select"
                value={formData.accountType}
                onChange={handleChange}
              >
                <option value="Student">Student (Undergraduate / Postgrad)</option>
                <option value="Department">Department Lab / Faculty Office</option>
                <option value="Staff">Campus Club / Society</option>
              </select>
            </div>

            {/* Department */}
            <div className="form-group">
              <label className="form-label">
                Academic Department / Club <span className="required">*</span>
              </label>
              <input
                type="text"
                name="department"
                className="form-input"
                placeholder="e.g. Computer Science, Mechanical, Library"
                value={formData.department}
                onChange={handleChange}
                required
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">
                Password <span className="required">*</span>
              </label>
              <input
                type="password"
                name="password"
                className="form-input"
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            {/* Confirm Password */}
            <div className="form-group">
              <label className="form-label">
                Confirm Password <span className="required">*</span>
              </label>
              <input
                type="password"
                name="confirmPassword"
                className="form-input"
                placeholder="Re-type password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: '8px', padding: '14px' }}
            >
              {loading ? 'Creating Account...' : 'Register Account'}
            </button>
          </form>
        )}

        {/* Step 2: Confirmation Code Form */}
        {step === 'confirm' && (
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
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '6px', display: 'block' }}>
                Check your spam or junk folder if you do not see it within a minute.
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: '12px', padding: '14px' }}
            >
              {loading ? 'Verifying...' : 'Confirm & Activate Account'}
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
                onClick={() => setStep('register')}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
              >
                Change Details
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Success Screen */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#166534',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <CheckIcon size={28} />
            </div>
            <p style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '1.1rem' }}>
              Your account has been successfully verified!
            </p>
          </div>
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
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: 'var(--color-primary)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Log in here
          </Link>
        </div>
      </div>
    </div>
  );
};
