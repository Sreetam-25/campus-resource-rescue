/**
 * requests.mjs — Lambda handler for resource request workflows.
 *
 * Routes:
 *   POST /resources/{id}/requests   — Submit request
 *   GET  /requests/my               — View my sent or incoming requests
 *   POST /requests/{id}/decision    — Owner accepts or rejects request
 */

import crypto from 'node:crypto';
import {
  RESOURCES_TABLE,
  REQUESTS_TABLE,
  getItem,
  query,
  transactWrite,
  batchWrite,
  getLockKey,
  isConditionCheckFailure,
} from '../lib/dynamodb.mjs';
import {
  getCaller,
  assertOwner,
  assertNotOwner,
} from '../lib/auth.mjs';
import {
  parseBody,
  validateCreateRequest,
  validateDecision,
  validateUUID,
  validatePageSize,
  encodeCursor,
  decodeCursor,
  VALID_ROLES,
  VALID_REQUEST_STATUSES,
} from '../lib/validate.mjs';
import { successResponse, errorResponse } from '../lib/response.mjs';
import { AppError, ErrorCode } from '../lib/errors.mjs';

/**
 * POST /resources/{id}/requests — Submit request with atomic lock item.
 */
async function handleCreateRequest(event) {
  const caller = getCaller(event);
  const resourceId = validateUUID(event.pathParameters?.id, 'resourceId');
  const body = parseBody(event);
  const { message } = validateCreateRequest(body);

  // 1. Fetch resource and verify state
  const resource = await getItem(RESOURCES_TABLE, { resourceId });
  if (!resource) {
    throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found.');
  }

  if (resource.status !== 'AVAILABLE') {
    throw new AppError(
      ErrorCode.ALREADY_UNAVAILABLE,
      'This resource is no longer available for requests.'
    );
  }

  // Prevent self-request
  assertNotOwner(caller.sub, resource.ownerId);

  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();
  const lockKey = getLockKey(resourceId, caller.sub);

  // 2. TransactWriteItems: Write unique lock item + request item atomically
  const lockItem = {
    requestId: lockKey,
    resourceId,
    requesterId: caller.sub,
    lockType: 'PENDING_GUARD',
    createdAt: now,
  };

  const requestItem = {
    requestId,
    resourceId,
    resourceTitle: resource.title,
    ownerId: resource.ownerId,
    requesterId: caller.sub,
    requesterName: caller.name || caller.username || 'Campus Requester',
    message,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await transactWrite([
      {
        Put: {
          TableName: REQUESTS_TABLE,
          Item: lockItem,
          ConditionExpression: 'attribute_not_exists(requestId)',
        },
      },
      {
        Put: {
          TableName: REQUESTS_TABLE,
          Item: requestItem,
          ConditionExpression: 'attribute_not_exists(requestId)',
        },
      },
    ]);
  } catch (err) {
    if (isConditionCheckFailure(err)) {
      throw new AppError(
        ErrorCode.DUPLICATE_REQUEST,
        'You already have an active pending request for this resource.'
      );
    }
    throw err;
  }

  return successResponse(requestItem, null, 201);
}

/**
 * GET /requests/my — My Sent Requests or Incoming Requests.
 */
async function handleGetMyRequests(event) {
  const caller = getCaller(event);
  const queryParams = event.queryStringParameters || {};
  const role = queryParams.role || 'requester';
  const status = queryParams.status;
  const pageSize = validatePageSize(queryParams.pageSize, 20, 50);

  if (!VALID_ROLES.includes(role)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid role parameter. Must be 'requester' or 'owner'.`
    );
  }

  if (status && !VALID_REQUEST_STATUSES.includes(status)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid status filter. Must be one of: ${VALID_REQUEST_STATUSES.join(', ')}.`
    );
  }

  const queryBinding = {
    role,
    status: status || '',
  };

  const exclusiveStartKey = decodeCursor(queryParams.nextKey, queryBinding);

  let items = [];
  let lastEvaluatedKey = exclusiveStartKey;
  let hasMore = true;

  const isOwner = role === 'owner';
  const indexName = isOwner ? 'ownerRequestsIndex' : 'requesterRequestsIndex';
  const partitionKeyName = isOwner ? 'ownerId' : 'requesterId';

  while (hasMore && items.length < pageSize) {
    let KeyConditionExpression = `${partitionKeyName} = :userId`;
    const ExpressionAttributeNames = {};
    const ExpressionAttributeValues = {
      ':userId': caller.sub,
    };

    // Filter out lock items (lockType attribute present)
    let FilterExpression = 'attribute_not_exists(lockType)';

    if (status) {
      FilterExpression += ' AND #status = :filterStatus';
      ExpressionAttributeNames['#status'] = 'status';
      ExpressionAttributeValues[':filterStatus'] = status;
    }

    const queryParamsDDB = {
      TableName: REQUESTS_TABLE,
      IndexName: indexName,
      KeyConditionExpression,
      FilterExpression,
      ExpressionAttributeValues,
      ScanIndexForward: false, // Newest first
      Limit: pageSize,
    };

    if (Object.keys(ExpressionAttributeNames).length > 0) {
      queryParamsDDB.ExpressionAttributeNames = ExpressionAttributeNames;
    }

    if (lastEvaluatedKey) {
      queryParamsDDB.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await query(queryParamsDDB);
    const fetched = (result.Items || []).filter((item) => !item.lockType);
    items.push(...fetched);

    lastEvaluatedKey = result.LastEvaluatedKey || null;
    hasMore = Boolean(lastEvaluatedKey);

    if (!hasMore || items.length >= pageSize) {
      break;
    }
  }

  let returnedCursor = null;
  if (items.length > pageSize) {
    items = items.slice(0, pageSize);
    const lastItem = items[items.length - 1];
    returnedCursor = encodeCursor(
      {
        requestId: lastItem.requestId,
        createdAt: lastItem.createdAt,
        [partitionKeyName]: lastItem[partitionKeyName],
      },
      queryBinding
    );
  } else if (lastEvaluatedKey) {
    returnedCursor = encodeCursor(lastEvaluatedKey, queryBinding);
  }

  return successResponse(items, {
    count: items.length,
    nextKey: returnedCursor,
  });
}

/**
 * POST /requests/{id}/decision — Owner accepts or rejects request.
 */
async function handleDecideRequest(event) {
  const caller = getCaller(event);
  const requestId = validateUUID(event.pathParameters?.id, 'requestId');
  const body = parseBody(event);
  const decision = validateDecision(body);

  // 1. Fetch request item
  const reqItem = await getItem(REQUESTS_TABLE, { requestId });
  if (!reqItem) {
    throw new AppError(ErrorCode.REQUEST_NOT_FOUND, 'Request not found.');
  }

  // Verify ownership
  assertOwner(caller.sub, reqItem.ownerId, 'request');

  if (reqItem.status !== 'PENDING') {
    throw new AppError(
      ErrorCode.REQUEST_ALREADY_DECIDED,
      `Request is already in '${reqItem.status}' status.`
    );
  }

  // 2. Fetch associated resource
  const resource = await getItem(RESOURCES_TABLE, { resourceId: reqItem.resourceId });
  if (!resource) {
    throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Associated resource not found.');
  }

  assertOwner(caller.sub, resource.ownerId, 'resource');

  const now = new Date().toISOString();
  const lockKey = getLockKey(reqItem.resourceId, reqItem.requesterId);

  if (decision === 'ACCEPT') {
    if (resource.status !== 'AVAILABLE') {
      throw new AppError(
        ErrorCode.ALREADY_UNAVAILABLE,
        'Resource is no longer available to accept requests.'
      );
    }

    // Determine target resource status
    const targetStatus =
      resource.sharingType === 'GIVE_AWAY' ? 'PENDING_CLAIM' : 'BORROWED';

    try {
      await transactWrite([
        // 1. Accept request item
        {
          Update: {
            TableName: REQUESTS_TABLE,
            Key: { requestId },
            UpdateExpression: 'SET #s = :accepted, updatedAt = :now',
            ConditionExpression: '#s = :pending AND ownerId = :ownerSub',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':accepted': 'ACCEPTED',
              ':pending': 'PENDING',
              ':ownerSub': caller.sub,
              ':now': now,
            },
          },
        },
        // 2. Update resource status
        {
          Update: {
            TableName: RESOURCES_TABLE,
            Key: { resourceId: reqItem.resourceId },
            UpdateExpression: 'SET #s = :newStatus, updatedAt = :now',
            ConditionExpression: '#s = :available AND ownerId = :ownerSub',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':newStatus': targetStatus,
              ':available': 'AVAILABLE',
              ':ownerSub': caller.sub,
              ':now': now,
            },
          },
        },
        // 3. Delete pending guard lock for accepted requester
        {
          Delete: {
            TableName: REQUESTS_TABLE,
            Key: { requestId: lockKey },
          },
        },
      ]);
    } catch (err) {
      if (isConditionCheckFailure(err)) {
        throw new AppError(
          ErrorCode.RACE_CONDITION,
          'Accept failed due to concurrent modification of request or resource.'
        );
      }
      throw err;
    }

    // Post-decision: Auto-reject remaining pending requests for this resource
    try {
      await autoRejectSupersededRequests(reqItem.resourceId, requestId, caller.sub);
    } catch (err) {
      console.warn('Background auto-rejection of other requests encountered an issue:', err);
    }

    return successResponse({
      requestId,
      status: 'ACCEPTED',
      resourceStatus: targetStatus,
      updatedAt: now,
    });
  }

  // Decision === 'REJECT'
  try {
    await transactWrite([
      // 1. Reject request
      {
        Update: {
          TableName: REQUESTS_TABLE,
          Key: { requestId },
          UpdateExpression: 'SET #s = :rejected, updatedAt = :now',
          ConditionExpression: '#s = :pending AND ownerId = :ownerSub',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':rejected': 'REJECTED',
            ':pending': 'PENDING',
            ':ownerSub': caller.sub,
            ':now': now,
          },
        },
      },
      // 2. Delete lock item so requester may request again if re-opened
      {
        Delete: {
          TableName: REQUESTS_TABLE,
          Key: { requestId: lockKey },
        },
      },
    ]);
  } catch (err) {
    if (isConditionCheckFailure(err)) {
      throw new AppError(
        ErrorCode.REQUEST_ALREADY_DECIDED,
        'Request is no longer in pending state.'
      );
    }
    throw err;
  }

  return successResponse({
    requestId,
    status: 'REJECTED',
    updatedAt: now,
  });
}

/**
 * Auto-reject other pending requests on the same resource after one is accepted.
 * Deletes corresponding lock items so no orphaned locks remain.
 */
async function autoRejectSupersededRequests(resourceId, acceptedRequestId, ownerId) {
  // Query all requests on this resource
  const result = await query({
    TableName: REQUESTS_TABLE,
    IndexName: 'resourceRequestsIndex',
    KeyConditionExpression: 'resourceId = :resId AND #s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':resId': resourceId,
      ':pending': 'PENDING',
    },
  });

  const otherPending = (result.Items || []).filter(
    (item) => item.requestId !== acceptedRequestId && !item.lockType
  );

  if (otherPending.length === 0) return;

  const now = new Date().toISOString();

  // DynamoDB BatchWriteItem supports up to 25 items per request.
  // We reject requests and delete lock items.
  for (const otherReq of otherPending) {
    try {
      const lockKey = getLockKey(resourceId, otherReq.requesterId);
      await transactWrite([
        {
          Update: {
            TableName: REQUESTS_TABLE,
            Key: { requestId: otherReq.requestId },
            UpdateExpression: 'SET #s = :rej, updatedAt = :now',
            ConditionExpression: '#s = :pen AND ownerId = :owner',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':rej': 'REJECTED',
              ':pen': 'PENDING',
              ':owner': ownerId,
              ':now': now,
            },
          },
        },
        {
          Delete: {
            TableName: REQUESTS_TABLE,
            Key: { requestId: lockKey },
          },
        },
      ]);
    } catch (e) {
      // Best-effort auto-rejection; ignore already handled items
    }
  }
}

/**
 * Main Lambda entry point.
 */
export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const path = event.requestContext?.http?.path || event.path || '';

    if (method === 'POST') {
      if (path.includes('/requests') && path.endsWith('/decision')) {
        return await handleDecideRequest(event);
      }
      if (path.includes('/resources/') && path.endsWith('/requests')) {
        return await handleCreateRequest(event);
      }
    }

    if (method === 'GET' && path.includes('/requests/my')) {
      return await handleGetMyRequests(event);
    }

    return errorResponse(
      new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Unsupported route ${method} ${path} on requests endpoint.`
      )
    );
  } catch (err) {
    return errorResponse(err);
  }
};
