import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handler as requestsHandler } from '../../src/handlers/requests.mjs';
import { setDocClient } from '../../src/lib/dynamodb.mjs';

describe('requestsHandler', () => {
  const callerSub = '11111111-2222-3333-4444-555555555555';
  const ownerSub = '88888888-7777-6666-5555-444444444444';
  const otherSub = '99999999-8888-7777-6666-555555555555';
  const testResId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const testReqId = 'b2c3d4e5-f6a1-4b2c-8d3e-4f5a6b7c8d9e';

  const makeAuthEvent = (
    method,
    path,
    body = null,
    pathParameters = null,
    queryParams = null,
    customSub = callerSub
  ) => ({
    requestContext: {
      http: { method, path },
      authorizer: {
        jwt: {
          claims: {
            sub: customSub,
            name: 'Test Student',
            email: 'student@college.edu',
          },
        },
      },
    },
    pathParameters,
    queryStringParameters: queryParams,
    body: body ? JSON.stringify(body) : null,
  });

  describe('POST /resources/{id}/requests', () => {
    test('submits request and writes atomic lock + request items in transaction', async () => {
      let transactItems = null;

      setDocClient({
        send: async (command) => {
          const name = command.constructor.name;
          if (name === 'GetCommand') {
            return {
              Item: {
                resourceId: testResId,
                ownerId: ownerSub,
                title: 'Casio Calculator',
                status: 'AVAILABLE',
              },
            };
          }
          if (name === 'TransactWriteCommand') {
            transactItems = command.input.TransactItems;
            return {};
          }
          return {};
        },
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/resources/${testResId}/requests`,
          { message: 'Hi, I need this calculator for final exams' },
          { id: testResId }
        )
      );

      assert.equal(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.data.resourceId, testResId);
      assert.equal(body.data.requesterId, callerSub);
      assert.equal(body.data.status, 'PENDING');

      // Verify transaction structure: exactly 2 Put operations
      assert.ok(transactItems);
      assert.equal(transactItems.length, 2);
      // Item 1: Lock item with uniqueness condition
      assert.equal(transactItems[0].Put.Item.requestId, `LOCK#${testResId}#${callerSub}`);
      assert.equal(transactItems[0].Put.ConditionExpression, 'attribute_not_exists(requestId)');
      // Item 2: Request item
      assert.equal(transactItems[1].Put.Item.status, 'PENDING');
    });

    test('returns 409 DUPLICATE_REQUEST when lock item condition fails', async () => {
      setDocClient({
        send: async (command) => {
          if (command.constructor.name === 'GetCommand') {
            return {
              Item: {
                resourceId: testResId,
                ownerId: ownerSub,
                status: 'AVAILABLE',
              },
            };
          }
          if (command.constructor.name === 'TransactWriteCommand') {
            const err = new Error('Transaction cancelled');
            err.name = 'TransactionCanceledException';
            err.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }];
            throw err;
          }
          return {};
        },
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/resources/${testResId}/requests`,
          { message: 'I need this calculator again' },
          { id: testResId }
        )
      );

      assert.equal(res.statusCode, 409);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'DUPLICATE_REQUEST');
    });

    test('rejects self-request with 403 SELF_REQUEST', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            resourceId: testResId,
            ownerId: callerSub, // Same as caller
            status: 'AVAILABLE',
          },
        }),
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/resources/${testResId}/requests`,
          { message: 'Requesting my own item' },
          { id: testResId }
        )
      );

      assert.equal(res.statusCode, 403);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'SELF_REQUEST');
    });

    test('rejects request on non-AVAILABLE resource with 409 ALREADY_UNAVAILABLE', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            resourceId: testResId,
            ownerId: ownerSub,
            status: 'PENDING_CLAIM', // Not AVAILABLE
          },
        }),
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/resources/${testResId}/requests`,
          { message: 'Requesting claimed item' },
          { id: testResId }
        )
      );

      assert.equal(res.statusCode, 409);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'ALREADY_UNAVAILABLE');
    });
  });

  describe('GET /requests/my', () => {
    test('queries requesterRequestsIndex and excludes lock items', async () => {
      setDocClient({
        send: async (command) => {
          if (command.constructor.name === 'QueryCommand') {
            return {
              Items: [
                {
                  requestId: testReqId,
                  resourceId: testResId,
                  requesterId: callerSub,
                  status: 'PENDING',
                  createdAt: '2026-11-02T10:00:00Z',
                },
                {
                  requestId: `LOCK#${testResId}#${callerSub}`,
                  lockType: 'PENDING_GUARD',
                },
              ],
              LastEvaluatedKey: null,
            };
          }
          return {};
        },
      });

      const res = await requestsHandler(
        makeAuthEvent('GET', '/requests/my', null, null, { role: 'requester' })
      );

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].requestId, testReqId);
      assert.equal(body.data[0].lockType, undefined);
    });
  });

  describe('POST /requests/{id}/decision', () => {
    test('ACCEPT decision executes atomic transaction and updates resource to PENDING_CLAIM', async () => {
      let transactItems = null;

      setDocClient({
        send: async (command) => {
          const name = command.constructor.name;
          if (name === 'GetCommand') {
            if (command.input.TableName.includes('requests')) {
              return {
                Item: {
                  requestId: testReqId,
                  resourceId: testResId,
                  ownerId: callerSub, // Caller is owner
                  requesterId: 'requester-abc',
                  status: 'PENDING',
                },
              };
            }
            if (command.input.TableName.includes('resources')) {
              return {
                Item: {
                  resourceId: testResId,
                  ownerId: callerSub,
                  sharingType: 'GIVE_AWAY',
                  status: 'AVAILABLE',
                },
              };
            }
          }
          if (name === 'TransactWriteCommand') {
            transactItems = command.input.TransactItems;
            return {};
          }
          if (name === 'QueryCommand') {
            // Auto-reject search
            return { Items: [] };
          }
          return {};
        },
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/requests/${testReqId}/decision`,
          { decision: 'ACCEPT' },
          { id: testReqId }
        )
      );

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.data.status, 'ACCEPTED');
      assert.equal(body.data.resourceStatus, 'PENDING_CLAIM');

      // Verify transaction: 1 Request update, 1 Resource update, 1 Lock delete
      assert.ok(transactItems);
      assert.equal(transactItems.length, 3);
      assert.ok(transactItems[0].Update);
      assert.ok(transactItems[1].Update);
      assert.ok(transactItems[2].Delete);
      assert.equal(transactItems[2].Delete.Key.requestId, `LOCK#${testResId}#requester-abc`);
    });

    test('REJECT decision sets status to REJECTED and deletes lock item', async () => {
      let transactItems = null;

      setDocClient({
        send: async (command) => {
          const name = command.constructor.name;
          if (name === 'GetCommand') {
            if (command.input.TableName.includes('requests')) {
              return {
                Item: {
                  requestId: testReqId,
                  resourceId: testResId,
                  ownerId: callerSub,
                  requesterId: 'requester-abc',
                  status: 'PENDING',
                },
              };
            }
            if (command.input.TableName.includes('resources')) {
              return {
                Item: {
                  resourceId: testResId,
                  ownerId: callerSub,
                  status: 'AVAILABLE',
                },
              };
            }
          }
          if (name === 'TransactWriteCommand') {
            transactItems = command.input.TransactItems;
            return {};
          }
          return {};
        },
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/requests/${testReqId}/decision`,
          { decision: 'REJECT' },
          { id: testReqId }
        )
      );

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.data.status, 'REJECTED');
      assert.ok(transactItems);
      assert.equal(transactItems.length, 2);
    });

    test('rejects decision on already decided request with 409 REQUEST_ALREADY_DECIDED', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            requestId: testReqId,
            resourceId: testResId,
            ownerId: callerSub,
            status: 'ACCEPTED', // Not PENDING
          },
        }),
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/requests/${testReqId}/decision`,
          { decision: 'ACCEPT' },
          { id: testReqId }
        )
      );

      assert.equal(res.statusCode, 409);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'REQUEST_ALREADY_DECIDED');
    });

    test('rejects decision from non-owner with 403 FORBIDDEN', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            requestId: testReqId,
            resourceId: testResId,
            ownerId: otherSub, // Not the caller
            status: 'PENDING',
          },
        }),
      });

      const res = await requestsHandler(
        makeAuthEvent(
          'POST',
          `/requests/${testReqId}/decision`,
          { decision: 'ACCEPT' },
          { id: testReqId }
        )
      );

      assert.equal(res.statusCode, 403);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'FORBIDDEN');
    });
  });
});
