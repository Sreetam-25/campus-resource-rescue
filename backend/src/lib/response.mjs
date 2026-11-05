/**
 * response.mjs — Standardized API Gateway HTTP API response builders.
 *
 * Implements standard response envelopes matching api-specification.md:
 * - Success list:  { success: true, data: [...], meta: { count, nextKey } }
 * - Success item:  { success: true, data: { ... } }
 * - Error:         { success: false, error: { code, message } }
 */

import { AppError, ErrorCode } from './errors.mjs';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

/**
 * Format raw API Gateway HTTP response object.
 *
 * @param {number} statusCode
 * @param {object} body
 * @param {Record<string, string>} [headers]
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
export function formatResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...DEFAULT_HEADERS,
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Success response builder.
 *
 * @param {any} data
 * @param {{ count?: number, nextKey?: string | null } | null} [meta]
 * @param {number} [statusCode=200]
 * @param {Record<string, string>} [headers]
 */
export function successResponse(data, meta = null, statusCode = 200, headers = {}) {
  const body = {
    success: true,
    data,
  };
  if (meta !== null && typeof meta === 'object') {
    body.meta = {
      count: meta.count ?? (Array.isArray(data) ? data.length : 1),
      nextKey: meta.nextKey ?? null,
    };
  }
  return formatResponse(statusCode, body, headers);
}

/**
 * Custom success response builder for endpoints with specific schemas (e.g. uploads/presign).
 *
 * @param {Record<string, any>} payload
 * @param {number} [statusCode=200]
 * @param {Record<string, string>} [headers]
 */
export function customSuccessResponse(payload, statusCode = 200, headers = {}) {
  return formatResponse(statusCode, { success: true, ...payload }, headers);
}

/**
 * Error response builder.
 *
 * @param {Error | AppError | any} err
 * @param {Record<string, string>} [headers]
 */
export function errorResponse(err, headers = {}) {
  if (err instanceof AppError) {
    return formatResponse(
      err.statusCode,
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      },
      headers
    );
  }

  // Handle unexpected or generic errors
  console.error('Unhandled server error:', err);
  return formatResponse(
    500,
    {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An internal server error occurred.',
      },
    },
    headers
  );
}
