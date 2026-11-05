import { apiService } from './api.js';

export const requestService = {
  /**
   * Get user's requests from backend (both sent and incoming).
   *
   * @param {{ role?: 'requester' | 'owner', status?: string }} [params={}]
   * @returns {Promise<Array>}
   */
  async getRequests(params = {}) {
    try {
      if (params.role) {
        return await apiService.getMyRequests(params);
      }
      // If no specific role is requested, fetch both sent and incoming in parallel
      const [sent, incoming] = await Promise.allSettled([
        apiService.getMyRequests({ role: 'requester' }),
        apiService.getMyRequests({ role: 'owner' }),
      ]);

      const sentItems = sent.status === 'fulfilled' ? (sent.value || []) : [];
      const incomingItems = incoming.status === 'fulfilled' ? (incoming.value || []) : [];

      // Combine distinct requests
      const map = new Map();
      [...sentItems, ...incomingItems].forEach((req) => {
        if (req && req.requestId) {
          map.set(req.requestId, req);
        }
      });
      return Array.from(map.values());
    } catch (err) {
      console.warn('requestService.getRequests error:', err);
      return [];
    }
  },

  /**
   * Submit request for an available resource.
   *
   * @param {{ resource: object, message: string }} params
   * @returns {Promise<object>}
   */
  async submitRequest({ resource, message }) {
    if (!resource || !resource.resourceId) {
      throw new Error('Invalid resource specified.');
    }
    return await apiService.createRequest(resource.resourceId, { message });
  },

  /**
   * Owner accepts or rejects request.
   *
   * @param {string} requestId
   * @param {'ACCEPT' | 'REJECT'} decision
   * @returns {Promise<object>}
   */
  async decideRequest(requestId, decision) {
    return await apiService.decideRequest(requestId, decision);
  },
};
