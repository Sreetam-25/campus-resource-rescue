/**
 * validate.mjs — Input validation, schema constraints, and cursor binding.
 *
 * Implements strict validations per api-specification.md and database-design.md.
 */

import { AppError, ErrorCode } from './errors.mjs';

export const VALID_CATEGORIES = Object.freeze([
  'Books and Notebooks',
  'Electronics',
  'Stationery',
  'Furniture',
  'Laboratory Equipment',
  'Sports Equipment',
  'Hostel Essentials',
  'Other',
]);

export const VALID_CONDITIONS = Object.freeze(['New', 'Good', 'Used']);

export const VALID_SHARING_TYPES = Object.freeze(['GIVE_AWAY', 'BORROW']);

export const VALID_RESOURCE_STATUSES = Object.freeze([
  'AVAILABLE',
  'PENDING_CLAIM',
  'GIVEN_AWAY',
  'BORROWED',
]);

export const VALID_REQUEST_STATUSES = Object.freeze(['PENDING', 'ACCEPTED', 'REJECTED']);

export const VALID_DECISIONS = Object.freeze(['ACCEPT', 'REJECT']);

export const VALID_ROLES = Object.freeze(['requester', 'owner']);

export const ALLOWED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)
export const MIN_IMAGE_SIZE = 1;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Safely parse JSON request body from API Gateway event.
 *
 * @param {object} event
 * @returns {Record<string, any>}
 */
export function parseBody(event) {
  if (!event || !event.body) {
    return {};
  }
  if (typeof event.body === 'object') {
    return event.body;
  }
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(raw);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Malformed JSON request body.');
  }
}

/**
 * Validate string length and presence.
 *
 * @param {any} value
 * @param {string} fieldName
 * @param {number} min
 * @param {number} max
 * @param {boolean} [required=true]
 * @returns {string} Trimmed string
 */
export function validateString(value, fieldName, min, max, required = true) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `${fieldName} is required.`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length < min) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `${fieldName} must be at least ${min} characters long.`
    );
  }
  if (trimmed.length > max) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `${fieldName} cannot exceed ${max} characters.`
    );
  }
  return trimmed;
}

/**
 * Validate UUID string.
 *
 * @param {string} id
 * @param {string} [name='id']
 */
export function validateUUID(id, name = 'id') {
  if (!id || typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid ${name} format; expected UUID.`);
  }
  return id.trim();
}

/**
 * Validate resource creation body.
 *
 * @param {Record<string, any>} body
 */
export function validateCreateResource(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request body is required.');
  }

  // Reject removed EXCHANGE sharing type explicitly
  if (body.sharingType === 'EXCHANGE') {
    throw new AppError(
      ErrorCode.EXCHANGE_NOT_SUPPORTED,
      'Sharing type EXCHANGE is not supported. Use GIVE_AWAY or BORROW.'
    );
  }

  const title = validateString(body.title, 'title', 3, 120, true);
  const description = validateString(body.description, 'description', 10, 500, true);
  const location = validateString(body.location, 'location', 3, 120, true);

  if (!VALID_CATEGORIES.includes(body.category)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`
    );
  }

  if (!VALID_CONDITIONS.includes(body.condition)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(', ')}.`
    );
  }

  if (!VALID_SHARING_TYPES.includes(body.sharingType)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid sharingType. Must be one of: ${VALID_SHARING_TYPES.join(', ')}.`
    );
  }

  let imageKey = null;
  if (body.imageKey) {
    if (typeof body.imageKey !== 'string') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'imageKey must be a string.');
    }
    imageKey = body.imageKey.trim();
  }

  return {
    title,
    description,
    category: body.category,
    condition: body.condition,
    sharingType: body.sharingType,
    location,
    imageKey,
  };
}

/**
 * Validate resource status patch body.
 *
 * @param {Record<string, any>} body
 * @returns {string} Status
 */
export function validatePatchResource(body) {
  if (!body || typeof body !== 'object' || !body.status) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Status field is required.');
  }
  const allowed = ['AVAILABLE', 'GIVEN_AWAY'];
  if (!allowed.includes(body.status)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid patch status. Owner can only set status to: ${allowed.join(', ')}.`
    );
  }
  return body.status;
}

/**
 * Validate request creation body.
 *
 * @param {Record<string, any>} body
 */
export function validateCreateRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request body is required.');
  }
  const message = validateString(body.message, 'message', 10, 500, true);
  return { message };
}

/**
 * Validate request decision body.
 *
 * @param {Record<string, any>} body
 */
export function validateDecision(body) {
  if (!body || typeof body !== 'object' || !body.decision) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Decision field is required.');
  }
  if (!VALID_DECISIONS.includes(body.decision)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid decision. Must be one of: ${VALID_DECISIONS.join(', ')}.`
    );
  }
  return body.decision;
}

/**
 * Validate pre-sign upload request body.
 *
 * @param {Record<string, any>} body
 */
export function validatePresignUpload(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request body is required.');
  }
  const fileName = validateString(body.fileName, 'fileName', 1, 255, true);

  if (!body.fileType || !ALLOWED_IMAGE_TYPES.includes(body.fileType)) {
    throw new AppError(
      ErrorCode.INVALID_FILE_TYPE,
      `Invalid fileType. Only ${ALLOWED_IMAGE_TYPES.join(', ')} are supported.`
    );
  }

  const fileSize = Number(body.fileSize);
  if (!Number.isInteger(fileSize) || fileSize < MIN_IMAGE_SIZE) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'fileSize must be a positive integer.');
  }
  if (fileSize > MAX_IMAGE_SIZE) {
    throw new AppError(
      ErrorCode.FILE_TOO_LARGE,
      `fileSize exceeds maximum allowed limit of ${MAX_IMAGE_SIZE} bytes (5 MB).`
    );
  }

  return {
    fileName,
    fileType: body.fileType,
    fileSize,
  };
}

/**
 * Inspect buffer magic bytes to verify actual image content type.
 * Protects against files disguised with arbitrary Content-Type headers.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {string} declaredMimeType
 * @returns {boolean}
 */
export function validateImageBuffer(buffer, declaredMimeType) {
  if (!buffer || buffer.length < 12) {
    return false;
  }
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // JPEG magic bytes: FF D8 FF
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;

  // WEBP magic bytes: 'RIFF'....'WEBP'
  const isWebp =
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP';

  if (declaredMimeType === 'image/jpeg') return isJpeg;
  if (declaredMimeType === 'image/png') return isPng;
  if (declaredMimeType === 'image/webp') return isWebp;

  return false;
}

/**
 * Encode pagination cursor bound to query parameters.
 *
 * @param {object} lastEvaluatedKey
 * @param {Record<string, any>} queryBinding
 * @returns {string} base64url cursor
 */
export function encodeCursor(lastEvaluatedKey, queryBinding = {}) {
  if (!lastEvaluatedKey) return null;
  const payload = {
    k: lastEvaluatedKey,
    b: queryBinding,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decode and verify pagination cursor.
 * Throws 400 INVALID_CURSOR if corrupt or bound to different query params.
 *
 * @param {string} cursorStr
 * @param {Record<string, any>} expectedBinding
 * @returns {object} lastEvaluatedKey
 */
export function decodeCursor(cursorStr, expectedBinding = {}) {
  if (!cursorStr) return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.k || typeof parsed.k !== 'object') {
      throw new Error('Malformed cursor structure');
    }

    // Verify query binding
    const actualBinding = parsed.b || {};
    for (const [key, expectedVal] of Object.entries(expectedBinding)) {
      if (expectedVal !== undefined && expectedVal !== null) {
        if (String(actualBinding[key] ?? '') !== String(expectedVal)) {
          throw new AppError(
            ErrorCode.INVALID_CURSOR,
            `Pagination cursor was issued for a different query (${key} mismatch).`
          );
        }
      }
    }

    return parsed.k;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(ErrorCode.INVALID_CURSOR, 'Invalid pagination cursor.');
  }
}

/**
 * Parse and validate integer page size.
 *
 * @param {any} raw
 * @param {number} [defaultSize=20]
 * @param {number} [maxSize=50]
 * @returns {number}
 */
export function validatePageSize(raw, defaultSize = 20, maxSize = 50) {
  if (!raw) return defaultSize;
  const num = parseInt(raw, 10);
  if (isNaN(num) || num < 1) return defaultSize;
  return Math.min(num, maxSize);
}
