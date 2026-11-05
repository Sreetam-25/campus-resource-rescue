/**
 * healthHandler — GET /health
 *
 * Backend liveness check returning OPERATIONAL status.
 * Public route — no authentication, DynamoDB, or S3 calls.
 */

import { formatResponse } from '../lib/response.mjs';

export const handler = async () => {
  return formatResponse(200, {
    status: 'OPERATIONAL',
    service: 'campus-resource-rescue-api',
    region: process.env.AWS_REGION || 'ap-southeast-2',
    timestamp: new Date().toISOString(),
  });
};
