/**
 * auth.mjs — JWT claim extraction and caller authorization helpers.
 *
 * Enforces security rules:
 * - Cognito `sub` is the sole authoritative user identity.
 * - Access token does not reliably contain `name` claim — never assume it exists.
 * - Ownership assertions are verified in code before DynamoDB writes.
 * - Prevents self-request on listings.
 * - Enforces user-scoped imageKey prefix isolation (users/{callerSub}/).
 */

import { AppError, ErrorCode } from './errors.mjs';

/**
 * Extract authenticated caller claims from API Gateway event.
 *
 * @param {object} event
 * @returns {{
 *   sub: string,
 *   name: string | null,
 *   email: string | null,
 *   accountType: string | null,
 *   department: string | null,
 *   username: string | null
 * }}
 */
export function getCaller(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims.sub) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Missing or invalid authentication token.'
    );
  }

  return {
    sub: claims.sub,
    name: claims.name || claims['custom:name'] || null,
    email: claims.email || null,
    accountType: claims['custom:accountType'] || null,
    department: claims['custom:department'] || null,
    username: claims.username || claims['cognito:username'] || claims.sub,
  };
}

/**
 * Extract caller if present; returns null for public routes.
 *
 * @param {object} event
 */
export function getOptionalCaller(event) {
  try {
    return getCaller(event);
  } catch {
    return null;
  }
}

/**
 * Assert that the caller is the owner of a resource or request.
 *
 * @param {string} callerSub
 * @param {string} ownerId
 * @param {string} [resourceType='resource']
 */
export function assertOwner(callerSub, ownerId, resourceType = 'resource') {
  if (!callerSub || !ownerId || callerSub !== ownerId) {
    throw new AppError(
      ErrorCode.FORBIDDEN,
      `You are not the owner of this ${resourceType}.`
    );
  }
}

/**
 * Assert that the caller is NOT the owner of the resource (prevents self-request).
 *
 * @param {string} callerSub
 * @param {string} ownerId
 */
export function assertNotOwner(callerSub, ownerId) {
  if (callerSub && ownerId && callerSub === ownerId) {
    throw new AppError(
      ErrorCode.SELF_REQUEST,
      'You cannot request your own resource.'
    );
  }
}

/**
 * Verify that an imageKey is scoped to the caller's sub: users/{callerSub}/...
 *
 * @param {string} callerSub
 * @param {string} [imageKey]
 */
export function assertImageKeyOwnership(callerSub, imageKey) {
  if (!imageKey) return;
  const expectedPrefix = `users/${callerSub}/`;
  if (!imageKey.startsWith(expectedPrefix)) {
    throw new AppError(
      ErrorCode.IMAGE_KEY_MISMATCH,
      `imageKey must begin with '${expectedPrefix}'.`
    );
  }
}
