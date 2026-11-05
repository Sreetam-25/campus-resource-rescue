/**
 * dynamodb.mjs — DynamoDB DocumentClient singleton and high-level operations.
 *
 * Implements data access patterns per database-design.md:
 * - ResourcesTable and RequestsTable operations
 * - Duplicate request prevention with strongly-consistent lock items
 * - Atomic accept/claim via TransactWriteItems
 * - Batch rejection and lock deletion
 * - Pagination with LastEvaluatedKey
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { AppError, ErrorCode } from './errors.mjs';

export const RESOURCES_TABLE =
  process.env.RESOURCES_TABLE || 'crr-resources-dev';
export const REQUESTS_TABLE =
  process.env.REQUESTS_TABLE || 'crr-requests-dev';

// Standard client singleton
let rawClient = null;
let docClient = null;

export function getDocClient() {
  if (!docClient) {
    rawClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-southeast-2',
    });
    docClient = DynamoDBDocumentClient.from(rawClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }
  return docClient;
}

/**
 * Replace docClient instance (used in unit tests for mocking).
 *
 * @param {any} mock
 */
export function setDocClient(mock) {
  docClient = mock;
}

/**
 * Build deterministic lock key for duplicate request prevention.
 * PK in RequestsTable: LOCK#{resourceId}#{requesterId}
 *
 * @param {string} resourceId
 * @param {string} requesterId
 * @returns {string}
 */
export function getLockKey(resourceId, requesterId) {
  return `LOCK#${resourceId}#${requesterId}`;
}

/**
 * Get item by PK.
 *
 * @param {string} TableName
 * @param {Record<string, any>} Key
 * @param {string} [ProjectionExpression]
 * @param {Record<string, string>} [ExpressionAttributeNames]
 */
export async function getItem(
  TableName,
  Key,
  ProjectionExpression = undefined,
  ExpressionAttributeNames = undefined
) {
  const client = getDocClient();
  const command = new GetCommand({
    TableName,
    Key,
    ProjectionExpression,
    ExpressionAttributeNames,
  });
  const res = await client.send(command);
  return res.Item || null;
}

/**
 * Put item with optional condition.
 *
 * @param {string} TableName
 * @param {Record<string, any>} Item
 * @param {string} [ConditionExpression]
 * @param {Record<string, string>} [ExpressionAttributeNames]
 * @param {Record<string, any>} [ExpressionAttributeValues]
 */
export async function putItem(
  TableName,
  Item,
  ConditionExpression = undefined,
  ExpressionAttributeNames = undefined,
  ExpressionAttributeValues = undefined
) {
  const client = getDocClient();
  const command = new PutCommand({
    TableName,
    Item,
    ConditionExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
  });
  return client.send(command);
}

/**
 * Update item with condition expression.
 *
 * @param {string} TableName
 * @param {Record<string, any>} Key
 * @param {string} UpdateExpression
 * @param {Record<string, string>} ExpressionAttributeNames
 * @param {Record<string, any>} ExpressionAttributeValues
 * @param {string} [ConditionExpression]
 * @param {string} [ReturnValues='ALL_NEW']
 */
export async function updateItem(
  TableName,
  Key,
  UpdateExpression,
  ExpressionAttributeNames,
  ExpressionAttributeValues,
  ConditionExpression = undefined,
  ReturnValues = 'ALL_NEW'
) {
  const client = getDocClient();
  const command = new UpdateCommand({
    TableName,
    Key,
    UpdateExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ConditionExpression,
    ReturnValues,
  });
  const res = await client.send(command);
  return res.Attributes;
}

/**
 * Delete item by key.
 *
 * @param {string} TableName
 * @param {Record<string, any>} Key
 * @param {string} [ConditionExpression]
 * @param {Record<string, any>} [ExpressionAttributeValues]
 */
export async function deleteItem(
  TableName,
  Key,
  ConditionExpression = undefined,
  ExpressionAttributeValues = undefined
) {
  const client = getDocClient();
  const command = new DeleteCommand({
    TableName,
    Key,
    ConditionExpression,
    ExpressionAttributeValues,
  });
  return client.send(command);
}

/**
 * Query index or table.
 *
 * @param {import('@aws-sdk/lib-dynamodb').QueryCommandInput} params
 */
export async function query(params) {
  const client = getDocClient();
  const command = new QueryCommand(params);
  return client.send(command);
}

/**
 * Scan index or table.
 *
 * @param {import('@aws-sdk/lib-dynamodb').ScanCommandInput} params
 */
export async function scan(params) {
  const client = getDocClient();
  const command = new ScanCommand(params);
  return client.send(command);
}

/**
 * Atomic TransactWriteItems execution.
 *
 * @param {Array<object>} TransactItems
 */
export async function transactWrite(TransactItems) {
  const client = getDocClient();
  const command = new TransactWriteCommand({
    TransactItems,
  });
  return client.send(command);
}

/**
 * Batch write items (up to 25 per call).
 *
 * @param {Record<string, Array<object>>} RequestItems
 */
export async function batchWrite(RequestItems) {
  const client = getDocClient();
  const command = new BatchWriteCommand({
    RequestItems,
  });
  return client.send(command);
}

/**
 * Check if a DynamoDB error is a TransactionCanceledException due to conditional check failure.
 *
 * @param {any} err
 * @returns {boolean}
 */
export function isConditionCheckFailure(err) {
  if (err?.name === 'ConditionalCheckFailedException') {
    return true;
  }
  if (err?.name === 'TransactionCanceledException') {
    const reasons = err.CancellationReasons || [];
    return reasons.some((r) => r.Code === 'ConditionalCheckFailed');
  }
  return false;
}
