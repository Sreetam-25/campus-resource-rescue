import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UploadIcon, CheckIcon } from '../components/common/Icons';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES } from '../components/home/CategoryGrid';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { apiService } from '../services/api';

export const PostResourcePage = ({ onSubmitResource }) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    category: 'Books and Notebooks',
    description: '',
    sharingType: 'GIVE_AWAY',
    condition: 'Good',
    location: user?.accountType === 'Department' ? `${user.department} Lab` : 'Hostel 3, Room 214'
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);

  // If not authenticated, prompt to log in
  if (!isAuthenticated) {
    return (
      <div style={{ padding: '80px 20px', minHeight: '80vh', textAlign: 'center' }}>
        <div style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          padding: '48px 24px',
          maxWidth: '520px',
          margin: '0 auto',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔐</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '8px' }}>
            Login Required to Share
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            Please sign in with your college account to post textbooks, electronic components, or campus essentials.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/" className="btn btn-outline">
              Return Home
            </Link>
            <Link to="/login" state={{ from: { pathname: '/post-resource' } }} className="btn btn-primary">
              Sign In to Continue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleTextChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const validateAndSetFile = (file) => {
    setErrorMsg('');
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image file size must be less than 5 MB.');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const getCategoryFallbackImage = (cat) => {
    if (cat.includes('Book')) return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=700&q=80';
    if (cat.includes('Elec')) return 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?auto=format&fit=crop&w=700&q=80';
    if (cat.includes('Stat')) return 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=700&q=80';
    if (cat.includes('Furn')) return 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=700&q=80';
    if (cat.includes('Lab')) return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=700&q=80';
    if (cat.includes('Sport')) return 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=700&q=80';
    if (cat.includes('Hostel')) return 'https://images.unsplash.com/photo-1594213114663-ddf4f240f08d?auto=format&fit=crop&w=700&q=80';
    return 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=700&q=80';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.title.trim()) {
      setErrorMsg('Please enter a resource title.');
      return;
    }
    if (!formData.description.trim()) {
      setErrorMsg('Please enter a description for the resource.');
      return;
    }
    if (!formData.location.trim()) {
      setErrorMsg('Please specify a campus pickup location.');
      return;
    }

    setSubmitting(true);
    try {
      let imageKey = null;
      if (selectedFile) {
        // 1. Request S3 pre-signed POST policy from API Gateway
        const presign = await apiService.getPresignedUploadUrl({
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size,
        });

        // 2. Direct browser upload to S3 via pre-signed POST FormData
        await apiService.uploadFileToS3(presign.uploadUrl, presign.fields, selectedFile);
        imageKey = presign.key;
      }

      // 3. Publish resource with user-owned imageKey
      await onSubmitResource({
        ...formData,
        imageKey,
      });
      setSuccessMsg(true);
      setTimeout(() => {
        navigate('/browse');
      }, 1400);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to publish resource.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '40px 0 60px 0', minHeight: '80vh' }}>
      <div className="container" style={{ maxWidth: '780px' }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#133324', marginBottom: '8px' }}>
            Share a Resource
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
            Posting as <strong>{user?.name}</strong> ({user?.department}). List an item you want to give away, lend, or exchange.
          </p>
        </div>

        {/* Card Container */}
        <div className="post-card-container">
          {successMsg ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--color-accent-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px auto'
              }}>
                <CheckIcon size={32} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}>
                Resource Published Successfully!
              </h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Your listing is now live on the campus resource exchange and visible in the catalog.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {errorMsg && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: '#fee2e2',
                  color: '#991b1b',
                  fontSize: '0.875rem',
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>⚠️ {errorMsg}</span>
                  <button 
                    type="button" 
                    onClick={() => setErrorMsg('')} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Title */}
              <div className="form-group">
                <label className="form-label">
                  Resource Title <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  className="form-input"
                  placeholder="e.g. Casio Scientific Calculator FX-991EX or Engineering Mechanics Book"
                  value={formData.title}
                  onChange={handleTextChange}
                  required
                />
              </div>

              {/* Category */}
              <div className="form-group">
                <label className="form-label">
                  Category <span className="required">*</span>
                </label>
                <select
                  name="category"
                  className="form-select"
                  value={formData.category}
                  onChange={handleTextChange}
                  required
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Description with character counter */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">
                    Description <span className="required">*</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {formData.description.length}/500
                  </span>
                </div>
                <textarea
                  name="description"
                  className="form-textarea"
                  maxLength={500}
                  placeholder="Describe the item condition, edition, components included, or any instructions for pickup..."
                  value={formData.description}
                  onChange={handleTextChange}
                  required
                />
              </div>

              {/* Listing Type Radio Pills */}
              <div className="form-group">
                <label className="form-label">
                  Sharing Type <span className="required">*</span>
                </label>
                <div className="form-radio-group">
                  <div 
                    className={`radio-pill-label ${formData.sharingType === 'GIVE_AWAY' ? 'selected' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, sharingType: 'GIVE_AWAY' }))}
                  >
                    🎁 Give Away (Free)
                  </div>
                  <div 
                    className={`radio-pill-label ${formData.sharingType === 'BORROW' ? 'selected' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, sharingType: 'BORROW' }))}
                  >
                    ⏳ Borrow (Lend)
                  </div>
                </div>
              </div>

              {/* Condition & Pickup Location */}
              <div className="form-row-2col">
                <div className="form-group">
                  <label className="form-label">
                    Condition <span className="required">*</span>
                  </label>
                  <select
                    name="condition"
                    className="form-select"
                    value={formData.condition}
                    onChange={handleTextChange}
                    required
                  >
                    <option value="New">New (Unused / mint)</option>
                    <option value="Good">Good (Minor wear, fully functional)</option>
                    <option value="Used">Used (Acceptable working condition)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Campus Pickup Location <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="location"
                    className="form-input"
                    placeholder="e.g. Hostel 3 Common Room, CSE Department 2nd Floor"
                    value={formData.location}
                    onChange={handleTextChange}
                    required
                  />
                </div>
              </div>

              {/* Upload Photograph with live thumbnail preview */}
              <div className="form-group">
                <label className="form-label">
                  Photograph of Item
                </label>
                <div 
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png, image/jpeg, image/webp"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  {previewUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', width: '100%' }}>
                      <img 
                        src={previewUrl} 
                        alt="Preview" 
                        style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '12px', border: '1px solid var(--color-border)' }} 
                      />
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedFile?.name || 'Selected image'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Ready to upload
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: '8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            setPreviewUrl(null);
                          }}
                        >
                          Change Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="dropzone-icon">
                        <UploadIcon size={22} />
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                          Click to select a photo
                        </span> or drag and drop
                      </div>
                      <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                        PNG, JPG, WEBP (Max 5 MB) • Clear photos help items get adopted faster
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Form Buttons */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '14px',
                marginTop: '32px',
                paddingTop: '20px',
                borderTop: '1px solid var(--color-border-subtle)'
              }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => navigate(-1)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ minWidth: '150px' }}
                >
                  {submitting ? (
                    <LoadingSpinner text="Publishing..." size="sm" />
                  ) : (
                    'Publish Resource'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
