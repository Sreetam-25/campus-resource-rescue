import { apiService } from './api.js';

export const resourceService = {
  /**
   * Get catalog resources from API Gateway.
   *
   * @param {object} [params={}] Filters (category, sharingType, condition)
   * @returns {Promise<Array>}
   */
  async getResources(params = {}) {
    try {
      const data = await apiService.getResources(params);
      return data || [];
    } catch (err) {
      console.error('resourceService.getResources error:', err);
      return [];
    }
  },

  /**
   * Get single resource by ID.
   *
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getResourceById(id) {
    try {
      return await apiService.getResourceById(id);
    } catch (err) {
      console.error('resourceService.getResourceById error:', err);
      return null;
    }
  },

  /**
   * Create a new resource.
   *
   * @param {object} resourceData
   * @returns {Promise<object>}
   */
  async createResource(resourceData) {
    return await apiService.createResource(resourceData);
  },

  /**
   * Update resource status (owner only).
   *
   * @param {string} resourceId
   * @param {string} newStatus
   * @returns {Promise<object>}
   */
  async updateStatus(resourceId, newStatus) {
    return await apiService.updateResourceStatus(resourceId, newStatus);
  },

  /**
   * Compute category counts from resources list.
   *
   * @param {Array} resourcesList
   * @returns {Record<string, number>}
   */
  getCategoryCounts(resourcesList = []) {
    const counts = {};
    for (const r of resourcesList) {
      if (r && r.category) {
        counts[r.category] = (counts[r.category] || 0) + 1;
      }
    }
    return counts;
  },
};
