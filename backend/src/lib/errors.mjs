/**
 * errors.mjs — Application error codes and AppError class.
 *
 * All business-logic errors are expressed as AppError instances.
 * Handlers catch AppError and convert it to the standard error response
 * envelope via response.mjs. Unexpected errors (non-AppError) are caught
 * and returned as INTERNAL_ERROR 500.
 *
 * Error codes match the API Specification error code reference exactly.
 */

// ── Error code constants ────────────────────────────────────────────────────

export const ErrorCode = Object.freeze({
  // 400 — client input
  VALIDATION_ERROR:          'VALIDATION_ERROR',
  INVALID_FILE_TYPE:         'INVALID_FILE_TYPE',
  FILE_TOO_LARGE:            'FILE_TOO_LARGE',
  EXCHANGE_NOT_SUPPORTED:    'EXCHANGE_NOT_SUPPORTED',
  INVALID_CURSOR:            'INVALID_CURSOR',

  // 401 — authentication (returned by API GW, but useful as a constant)
  UNAUTHORIZED:              'UNAUTHORIZED',

  // 403 — authorisation
  FORBIDDEN:                 'FORBIDDEN',
  SELF_REQUEST:              'SELF_REQUEST',
  IMAGE_KEY_MISMATCH:        'IMAGE_KEY_MISMATCH',

  // 404 — not found
  RESOURCE_NOT_FOUND:        'RESOURCE_NOT_FOUND',
  REQUEST_NOT_FOUND:         'REQUEST_NOT_FOUND',

  // 409 — conflict / state violation
  ALREADY_UNAVAILABLE:       'ALREADY_UNAVAILABLE',
  DUPLICATE_REQUEST:         'DUPLICATE_REQUEST',
  REQUEST_ALREADY_DECIDED:   'REQUEST_ALREADY_DECIDED',
  RACE_CONDITION:            'RACE_CONDITION',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',

  // 500 — server fault
  INTERNAL_ERROR:            'INTERNAL_ERROR',
});

// ── HTTP status code map ────────────────────────────────────────────────────

const HTTP_STATUS = {
  [ErrorCode.VALIDATION_ERROR]:          400,
  [ErrorCode.INVALID_FILE_TYPE]:         400,
  [ErrorCode.FILE_TOO_LARGE]:            400,
  [ErrorCode.EXCHANGE_NOT_SUPPORTED]:    400,
  [ErrorCode.INVALID_CURSOR]:            400,
  [ErrorCode.UNAUTHORIZED]:              401,
  [ErrorCode.FORBIDDEN]:                 403,
  [ErrorCode.SELF_REQUEST]:              403,
  [ErrorCode.IMAGE_KEY_MISMATCH]:        403,
  [ErrorCode.RESOURCE_NOT_FOUND]:        404,
  [ErrorCode.REQUEST_NOT_FOUND]:         404,
  [ErrorCode.ALREADY_UNAVAILABLE]:       409,
  [ErrorCode.DUPLICATE_REQUEST]:         409,
  [ErrorCode.REQUEST_ALREADY_DECIDED]:   409,
  [ErrorCode.RACE_CONDITION]:            409,
  [ErrorCode.INVALID_STATUS_TRANSITION]: 409,
  [ErrorCode.INTERNAL_ERROR]:            500,
};

/**
 * AppError — throw this from any handler or helper to produce a structured
 * error response.  Handlers must NOT construct raw error responses directly.
 *
 * @example
 *   throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found.');
 */
export class AppError extends Error {
  /**
   * @param {string} code    - One of the ErrorCode constants.
   * @param {string} message - Human-readable description for the API caller.
   */
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = HTTP_STATUS[code] ?? 500;
  }
}
