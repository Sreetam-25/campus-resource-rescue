/**
 * statsHandler — GET /stats
 *
 * Aggregate statistics for the platform:
 * - Total resources
 * - Available resources
 * - Total requests
 * - Category breakdown
 *
 * Implements in-memory 60-second caching per Lambda container.
 */

import {
  RESOURCES_TABLE,
  REQUESTS_TABLE,
  query,
  scan,
} from '../lib/dynamodb.mjs';
import { VALID_CATEGORIES } from '../lib/validate.mjs';
import { successResponse, errorResponse } from '../lib/response.mjs';

const CACHE_TTL_MS = 60 * 1000; // 60 seconds
let cachedStats = null;
let lastCacheTime = 0;

/**
 * Reset cache helper (used in tests).
 */
export function resetStatsCache() {
  cachedStats = null;
  lastCacheTime = 0;
}

/**
 * Main Lambda entry point.
 */
export const handler = async (event) => {
  try {
    const now = Date.now();
    if (cachedStats && now - lastCacheTime < CACHE_TTL_MS) {
      return successResponse(cachedStats);
    }

    // 1. Parallel queries on categoryStatusIndex for all 8 categories
    const categoryCounts = {};
    let totalAvailable = 0;

    const categoryQueries = VALID_CATEGORIES.map(async (category) => {
      // Query items in category with status = AVAILABLE
      const result = await query({
        TableName: RESOURCES_TABLE,
        IndexName: 'categoryStatusIndex',
        KeyConditionExpression: 'category = :cat',
        FilterExpression: '#s = :available',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':cat': category,
          ':available': 'AVAILABLE',
        },
        Select: 'COUNT',
      });
      const count = result.Count || 0;
      return { category, count };
    });

    // 2. Count total resources in table (Count scan)
    const totalResourcesPromise = scan({
      TableName: RESOURCES_TABLE,
      Select: 'COUNT',
    });

    // 3. Count total actual requests (exclude lock items)
    const totalRequestsPromise = scan({
      TableName: REQUESTS_TABLE,
      FilterExpression: 'attribute_not_exists(lockType)',
      Select: 'COUNT',
    });

    const [categoryResults, totalResScan, totalReqScan] = await Promise.all([
      Promise.all(categoryQueries),
      totalResourcesPromise,
      totalRequestsPromise,
    ]);

    for (const { category, count } of categoryResults) {
      categoryCounts[category] = count;
      totalAvailable += count;
    }

    const stats = {
      totalResources: totalResScan.Count || totalAvailable,
      availableResources: totalAvailable,
      totalRequests: totalReqScan.Count || 0,
      categoryCounts,
    };

    // Cache the aggregated result
    cachedStats = stats;
    lastCacheTime = now;

    return successResponse(stats);
  } catch (err) {
    return errorResponse(err);
  }
};
