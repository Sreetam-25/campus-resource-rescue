import { authService } from './authService.js';

// API Gateway base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://3v7ify4704.execute-api.ap-southeast-2.amazonaws.com/v1';

/**
 * Standard fetch wrapper with automatic Cognito Access Token injection and error envelope parsing.
 *
 * @param {string} endpoint
 * @param {RequestInit} [options={}]
 * @param {boolean} [requireAuth=false]
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}, requireAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Inject Cognito Access Token if available or required
  const token = await authService.getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (requireAuth) {
    throw new Error('You must be signed in to perform this action.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your network connection.');
    }
    throw new Error(err.message || 'Network error communicating with server.');
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error?.message || data?.message || `Request failed (${res.status})`;
    const appError = new Error(errorMsg);
    appError.status = res.status;
    appError.code = data?.error?.code || 'API_ERROR';
    throw appError;
  }

  return data;
}

export const apiService = {
  /**
   * GET /resources — Browse catalog with filters and pagination.
   */
  async getResources(params = {}) {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'All') query.append('category', params.category);
    if (params.sharingType && params.sharingType !== 'ALL') query.append('sharingType', params.sharingType);
    if (params.condition && params.condition !== 'ALL') query.append('condition', params.condition);
    if (params.pageSize) query.append('pageSize', String(params.pageSize));
    if (params.nextKey) query.append('nextKey', params.nextKey);

    const queryString = query.toString();
    const result = await request(`/resources${queryString ? `?${queryString}` : ''}`);
    return result?.data || [];
  },

  /**
   * GET /resources/:id — Retrieve single resource details.
   */
  async getResourceById(id) {
    if (!id) return null;
    const result = await request(`/resources/${id}`);
    return result?.data || null;
  },

  /**
   * POST /resources — Create new resource listing.
   */
  async createResource(resourceData) {
    const payload = {
      title: resourceData.title.trim(),
      description: resourceData.description.trim(),
      category: resourceData.category,
      condition: resourceData.condition || 'Good',
      sharingType: resourceData.sharingType || 'GIVE_AWAY',
      location: resourceData.location?.trim() || 'Campus',
    };

    if (resourceData.imageKey) {
      payload.imageKey = resourceData.imageKey;
    }

    const result = await request('/resources', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, true);

    return result?.data;
  },

  /**
   * PATCH /resources/:id — Update resource status (owner only).
   */
  async updateResourceStatus(resourceId, status) {
    const result = await request(`/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }, true);

    return result?.data || { success: true };
  },

  /**
   * POST /uploads/presign — Get S3 pre-signed POST policy for direct browser-to-S3 upload.
   */
  async getPresignedUploadUrl({ fileName, fileType, fileSize }) {
    const result = await request('/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType, fileSize }),
    }, true);

    return result;
  },

  /**
   * Upload image file directly to Amazon S3 using pre-signed POST policy FormData.
   */
  async uploadFileToS3(uploadUrl, fields, file) {
    const formData = new FormData();

    // S3 requires all policy fields to be added before the file field
    if (fields && typeof fields === 'object') {
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // The file field MUST be the last field in the FormData payload
    formData.append('file', file);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`S3 upload failed with status ${res.status}.`);
    }

    return true;
  },

  /**
   * POST /resources/:id/requests — Submit request on an available resource.
   */
  async createRequest(resourceId, { message }) {
    const result = await request(`/resources/${resourceId}/requests`, {
      method: 'POST',
      body: JSON.stringify({ message: message || 'I would like to request this item.' }),
    }, true);

    return result?.data;
  },

  /**
   * GET /requests/my — Retrieve user's sent or incoming requests.
   *
   * @param {{ role?: 'requester' | 'owner', status?: string, pageSize?: number, nextKey?: string }} params
   */
  async getMyRequests(params = {}) {
    const query = new URLSearchParams();
    query.append('role', params.role || 'requester');
    if (params.status) query.append('status', params.status);
    if (params.pageSize) query.append('pageSize', String(params.pageSize));
    if (params.nextKey) query.append('nextKey', params.nextKey);

    const result = await request(`/requests/my?${query.toString()}`, {}, true);
    return result?.data || [];
  },

  /**
   * POST /requests/:id/decision — Owner accepts or rejects request.
   */
  async decideRequest(requestId, decision) {
    const result = await request(`/requests/${requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }, true);

    return result?.data || { success: true };
  },

  /**
   * GET /stats — Aggregated platform statistics.
   */
  async getStats() {
    try {
      const result = await request('/stats');
      return result?.data || null;
    } catch (err) {
      console.warn('Failed to fetch platform stats:', err);
      return null;
    }
  },

  /**
   * GET /health — Liveness check.
   */
  async getHealth() {
    return await request('/health');
  },
};
