/**
 * resources.mjs — Lambda handler for resource catalog endpoints.
 *
 * Routes:
 *   GET   /resources
 *   GET   /resources/{id}
 *   POST  /resources
 *   PATCH /resources/{id}
 */

import crypto from 'node:crypto';
import {
  RESOURCES_TABLE,
  getItem,
  putItem,
  updateItem,
  query,
} from '../lib/dynamodb.mjs';
import { getPresignedGetUrl, verifyAndValidateS3Image } from '../lib/s3.mjs';
import {
  getCaller,
  assertOwner,
  assertImageKeyOwnership,
} from '../lib/auth.mjs';
import {
  parseBody,
  validateCreateResource,
  validatePatchResource,
  validateUUID,
  validatePageSize,
  encodeCursor,
  decodeCursor,
} from '../lib/validate.mjs';
import { successResponse, errorResponse } from '../lib/response.mjs';
import { AppError, ErrorCode } from '../lib/errors.mjs';

/**
 * GET /resources — Browse catalog with filters and pagination.
 */
async function handleGetResources(event) {
  const queryParams = event.queryStringParameters || {};
  const { category, sharingType, condition, nextKey } = queryParams;
  const pageSize = validatePageSize(queryParams.pageSize, 20, 50);

  const queryBinding = {
    category: category || '',
    sharingType: sharingType || '',
    condition: condition || '',
  };

  const exclusiveStartKey = decodeCursor(nextKey, queryBinding);

  let items = [];
  let lastEvaluatedKey = exclusiveStartKey;
  let hasMore = true;

  // Query either categoryStatusIndex or statusCreatedIndex
  while (hasMore && items.length < pageSize) {
    let queryParamsDDB;

    if (category) {
      // Access pattern: categoryStatusIndex (category = :cat, filter status = AVAILABLE)
      queryParamsDDB = {
        TableName: RESOURCES_TABLE,
        IndexName: 'categoryStatusIndex',
        KeyConditionExpression: 'category = :cat',
        FilterExpression: '#status = :available',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':cat': category,
          ':available': 'AVAILABLE',
        },
        ScanIndexForward: false,
        Limit: pageSize,
      };
    } else {
      // Access pattern: statusCreatedIndex (status = AVAILABLE)
      queryParamsDDB = {
        TableName: RESOURCES_TABLE,
        IndexName: 'statusCreatedIndex',
        KeyConditionExpression: '#status = :available',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':available': 'AVAILABLE',
        },
        ScanIndexForward: false,
        Limit: pageSize,
      };
    }

    if (lastEvaluatedKey) {
      queryParamsDDB.ExclusiveStartKey = lastEvaluatedKey;
    }

    // Apply additional filters (sharingType, condition)
    if (sharingType) {
      queryParamsDDB.FilterExpression = queryParamsDDB.FilterExpression
        ? `${queryParamsDDB.FilterExpression} AND sharingType = :st`
        : 'sharingType = :st';
      queryParamsDDB.ExpressionAttributeValues[':st'] = sharingType;
    }

    if (condition) {
      queryParamsDDB.FilterExpression = queryParamsDDB.FilterExpression
        ? `${queryParamsDDB.FilterExpression} AND #cond = :cond`
        : '#cond = :cond';
      queryParamsDDB.ExpressionAttributeNames['#cond'] = 'condition';
      queryParamsDDB.ExpressionAttributeValues[':cond'] = condition;
    }

    const result = await query(queryParamsDDB);
    const fetched = result.Items || [];
    items.push(...fetched);

    lastEvaluatedKey = result.LastEvaluatedKey || null;
    hasMore = Boolean(lastEvaluatedKey);

    // Stop if we gathered enough items or no more records exist
    if (!hasMore || items.length >= pageSize) {
      break;
    }
  }

  // Trim to requested pageSize if we accumulated more in pagination loop
  let returnedCursor = null;
  if (items.length > pageSize) {
    items = items.slice(0, pageSize);
    // Use last item for cursor
    const lastItem = items[items.length - 1];
    returnedCursor = encodeCursor(
      {
        resourceId: lastItem.resourceId,
        createdAt: lastItem.createdAt,
        status: lastItem.status,
        ...(category ? { category: lastItem.category } : {}),
      },
      queryBinding
    );
  } else if (lastEvaluatedKey) {
    returnedCursor = encodeCursor(lastEvaluatedKey, queryBinding);
  }

  // Enrich with pre-signed GET image URLs in parallel
  const enriched = await Promise.all(
    items.map(async (res) => {
      const item = { ...res };
      if (item.imageKey) {
        try {
          item.imageUrl = await getPresignedGetUrl(item.imageKey, 3600);
        } catch (err) {
          console.warn(`Failed to generate pre-signed URL for key: ${item.imageKey}`, err);
          item.imageUrl = null;
        }
      }
      return item;
    })
  );

  return successResponse(enriched, {
    count: enriched.length,
    nextKey: returnedCursor,
  });
}

/**
 * GET /resources/{id} — Retrieve single resource.
 */
async function handleGetResourceById(event) {
  const resourceId = validateUUID(event.pathParameters?.id, 'resourceId');
  const item = await getItem(RESOURCES_TABLE, { resourceId });

  if (!item) {
    throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found.');
  }

  const resource = { ...item };
  if (resource.imageKey) {
    try {
      resource.imageUrl = await getPresignedGetUrl(resource.imageKey, 3600);
    } catch (err) {
      console.warn(`Failed to generate pre-signed GET URL for ${resource.imageKey}`, err);
      resource.imageUrl = null;
    }
  }

  return successResponse(resource);
}

/**
 * POST /resources — Create resource listing.
 */
async function handleCreateResource(event) {
  const caller = getCaller(event);
  const body = parseBody(event);
  const validated = validateCreateResource(body);

  if (validated.imageKey) {
    assertImageKeyOwnership(caller.sub, validated.imageKey);
    await verifyAndValidateS3Image(validated.imageKey);
  }

  const now = new Date().toISOString();
  const resourceId = crypto.randomUUID();

  const item = {
    resourceId,
    ownerId: caller.sub,
    ownerName: caller.name || caller.username || 'Campus Member',
    title: validated.title,
    description: validated.description,
    category: validated.category,
    condition: validated.condition,
    sharingType: validated.sharingType,
    location: validated.location,
    status: 'AVAILABLE',
    createdAt: now,
    updatedAt: now,
  };

  if (validated.imageKey) {
    item.imageKey = validated.imageKey;
  }

  await putItem(RESOURCES_TABLE, item);

  return successResponse(item, null, 201);
}

/**
 * PATCH /resources/{id} — Update resource status (owner only).
 */
async function handlePatchResource(event) {
  const caller = getCaller(event);
  const resourceId = validateUUID(event.pathParameters?.id, 'resourceId');
  const body = parseBody(event);
  const requestedStatus = validatePatchResource(body);

  const currentItem = await getItem(RESOURCES_TABLE, { resourceId });
  if (!currentItem) {
    throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Resource not found.');
  }

  assertOwner(caller.sub, currentItem.ownerId, 'resource');

  // Validate allowed status transitions per database-design.md:
  // GIVE_AWAY: PENDING_CLAIM -> GIVEN_AWAY
  // BORROW:    BORROWED -> AVAILABLE
  const sharingType = currentItem.sharingType;
  const currentStatus = currentItem.status;

  let isAllowed = false;
  if (sharingType === 'GIVE_AWAY') {
    if (currentStatus === 'PENDING_CLAIM' && requestedStatus === 'GIVEN_AWAY') {
      isAllowed = true;
    }
  } else if (sharingType === 'BORROW') {
    if (currentStatus === 'BORROWED' && requestedStatus === 'AVAILABLE') {
      isAllowed = true;
    }
  }

  if (!isAllowed) {
    throw new AppError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot transition ${sharingType} resource from '${currentStatus}' to '${requestedStatus}'.`
    );
  }

  const now = new Date().toISOString();

  await updateItem(
    RESOURCES_TABLE,
    { resourceId },
    'SET #status = :newStatus, updatedAt = :now',
    { '#status': 'status' },
    {
      ':newStatus': requestedStatus,
      ':now': now,
      ':callerSub': caller.sub,
      ':currentStatus': currentStatus,
    },
    'ownerId = :callerSub AND #status = :currentStatus'
  );

  return successResponse({
    resourceId,
    status: requestedStatus,
    updatedAt: now,
  });
}

/**
 * Main Lambda entry point.
 */
export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const pathId = event.pathParameters?.id;

    if (method === 'GET') {
      if (pathId) {
        return await handleGetResourceById(event);
      }
      return await handleGetResources(event);
    }

    if (method === 'POST') {
      return await handleCreateResource(event);
    }

    if (method === 'PATCH' && pathId) {
      return await handlePatchResource(event);
    }

    return errorResponse(
      new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Unsupported method ${method} on resources endpoint.`
      )
    );
  } catch (err) {
    return errorResponse(err);
  }
};
