import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';
import { handler as resourcesHandler } from '../../src/handlers/resources.mjs';
import { setDocClient } from '../../src/lib/dynamodb.mjs';
import { setS3Client } from '../../src/lib/s3.mjs';

describe('resourcesHandler', () => {
  const callerSub = '11111111-2222-3333-4444-555555555555';
  const otherSub = '99999999-8888-7777-6666-555555555555';
  const testResId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';

  const makeAuthEvent = (method, path, body = null, pathParameters = null, queryParams = null) => ({
    requestContext: {
      http: { method, path },
      authorizer: {
        jwt: {
          claims: {
            sub: callerSub,
            name: 'Rahul Sharma',
            email: 'rahul@campus.edu',
          },
        },
      },
    },
    pathParameters,
    queryStringParameters: queryParams,
    body: body ? JSON.stringify(body) : null,
  });

  beforeEach(() => {
    const s3 = new S3Client({
      region: 'ap-southeast-2',
      credentials: {
        accessKeyId: 'mock-access-key-id',
        secretAccessKey: 'mock-secret-access-key',
      },
    });
    s3.send = async () => ({
      ContentType: 'image/jpeg',
      Body: (async function* () {
        yield Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
      })(),
    });
    setS3Client(s3);
  });

  describe('GET /resources', () => {
    test('browses catalog and attaches pre-signed image URLs', async () => {
      setDocClient({
        send: async (command) => {
          if (command.constructor.name === 'QueryCommand') {
            return {
              Items: [
                {
                  resourceId: testResId,
                  title: 'Casio Calculator',
                  category: 'Electronics',
                  status: 'AVAILABLE',
                  imageKey: `users/${callerSub}/resources/calc.jpg`,
                  createdAt: '2026-11-01T10:00:00Z',
                },
              ],
              LastEvaluatedKey: null,
            };
          }
          return {};
        },
      });

      const res = await resourcesHandler({
        requestContext: { http: { method: 'GET', path: '/resources' } },
        queryStringParameters: { pageSize: '10' },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 1);
      assert.ok(body.data[0].imageUrl);
      assert.equal(body.meta.count, 1);
      assert.equal(body.meta.nextKey, null);
    });
  });

  describe('GET /resources/{id}', () => {
    test('returns resource by ID', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            resourceId: testResId,
            ownerId: callerSub,
            title: 'Casio Calculator',
            status: 'AVAILABLE',
          },
        }),
      });

      const res = await resourcesHandler({
        requestContext: { http: { method: 'GET', path: `/resources/${testResId}` } },
        pathParameters: { id: testResId },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.data.resourceId, testResId);
    });

    test('returns 404 RESOURCE_NOT_FOUND when missing', async () => {
      setDocClient({
        send: async () => ({ Item: null }),
      });

      const res = await resourcesHandler({
        requestContext: { http: { method: 'GET', path: `/resources/${testResId}` } },
        pathParameters: { id: testResId },
      });

      assert.equal(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'RESOURCE_NOT_FOUND');
    });
  });

  describe('POST /resources', () => {
    test('creates resource successfully and sets ownerId from JWT sub', async () => {
      let savedItem = null;
      setDocClient({
        send: async (command) => {
          if (command.constructor.name === 'PutCommand') {
            savedItem = command.input.Item;
          }
          return {};
        },
      });

      const validPayload = {
        title: 'Algorithms Textbook',
        description: 'Hardcover edition for CS coursework',
        category: 'Books and Notebooks',
        condition: 'Good',
        sharingType: 'GIVE_AWAY',
        location: 'Hostel 3 Common Room',
        imageKey: `users/${callerSub}/resources/textbook.jpg`,
      };

      const res = await resourcesHandler(makeAuthEvent('POST', '/resources', validPayload));
      assert.equal(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.equal(body.success, true);
      assert.equal(body.data.ownerId, callerSub);
      assert.equal(body.data.status, 'AVAILABLE');
      assert.ok(savedItem);
      assert.equal(savedItem.ownerId, callerSub);
    });

    test('rejects EXCHANGE sharingType with 400 EXCHANGE_NOT_SUPPORTED', async () => {
      const payload = {
        title: 'Study Desk',
        description: 'Solid wooden table',
        category: 'Furniture',
        condition: 'Used',
        sharingType: 'EXCHANGE',
        location: 'Hostel 4',
      };

      const res = await resourcesHandler(makeAuthEvent('POST', '/resources', payload));
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'EXCHANGE_NOT_SUPPORTED');
    });

    test('rejects mismatched imageKey prefix with 403 IMAGE_KEY_MISMATCH', async () => {
      const payload = {
        title: 'Study Desk',
        description: 'Solid wooden table in good condition',
        category: 'Furniture',
        condition: 'Good',
        sharingType: 'GIVE_AWAY',
        location: 'Hostel 4 Room 102',
        imageKey: `users/${otherSub}/resources/desk.jpg`,
      };

      const res = await resourcesHandler(makeAuthEvent('POST', '/resources', payload));
      assert.equal(res.statusCode, 403);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'IMAGE_KEY_MISMATCH');
    });

    test('rejects imageKey if S3 object does not exist with 400 VALIDATION_ERROR', async () => {
      const s3 = new S3Client({
        region: 'ap-southeast-2',
        credentials: {
          accessKeyId: 'mock-access-key-id',
          secretAccessKey: 'mock-secret-access-key',
        },
      });
      s3.send = async () => {
        const err = new Error('The specified key does not exist.');
        err.name = 'NoSuchKey';
        throw err;
      };
      setS3Client(s3);

      const payload = {
        title: 'Study Desk',
        description: 'Solid wooden table in good condition',
        category: 'Furniture',
        condition: 'Good',
        sharingType: 'GIVE_AWAY',
        location: 'Hostel 4 Room 102',
        imageKey: `users/${callerSub}/resources/nonexistent.jpg`,
      };

      const res = await resourcesHandler(makeAuthEvent('POST', '/resources', payload));
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    });

    test('rejects imageKey if S3 object has invalid magic bytes with 400 INVALID_FILE_TYPE', async () => {
      const s3 = new S3Client({
        region: 'ap-southeast-2',
        credentials: {
          accessKeyId: 'mock-access-key-id',
          secretAccessKey: 'mock-secret-access-key',
        },
      });
      s3.send = async () => ({
        ContentType: 'image/jpeg',
        Body: (async function* () {
          yield Buffer.from('NOT_A_REAL_IMAGE_FILE_JUST_PLAIN_TEXT');
        })(),
      });
      setS3Client(s3);

      const payload = {
        title: 'Study Desk',
        description: 'Solid wooden table in good condition',
        category: 'Furniture',
        condition: 'Good',
        sharingType: 'GIVE_AWAY',
        location: 'Hostel 4 Room 102',
        imageKey: `users/${callerSub}/resources/badimage.jpg`,
      };

      const res = await resourcesHandler(makeAuthEvent('POST', '/resources', payload));
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'INVALID_FILE_TYPE');
    });
  });

  describe('PATCH /resources/{id}', () => {
    test('allows owner to confirm collection of GIVE_AWAY (PENDING_CLAIM -> GIVEN_AWAY)', async () => {
      setDocClient({
        send: async (command) => {
          if (command.constructor.name === 'GetCommand') {
            return {
              Item: {
                resourceId: testResId,
                ownerId: callerSub,
                sharingType: 'GIVE_AWAY',
                status: 'PENDING_CLAIM',
              },
            };
          }
          if (command.constructor.name === 'UpdateCommand') {
            return { Attributes: { status: 'GIVEN_AWAY' } };
          }
          return {};
        },
      });

      const res = await resourcesHandler(
        makeAuthEvent('PATCH', `/resources/${testResId}`, { status: 'GIVEN_AWAY' }, { id: testResId })
      );

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.data.status, 'GIVEN_AWAY');
    });

    test('allows owner to mark BORROW item returned (BORROWED -> AVAILABLE)', async () => {
      setDocClient({
        send: async (command) => {
          if (command.constructor.name === 'GetCommand') {
            return {
              Item: {
                resourceId: testResId,
                ownerId: callerSub,
                sharingType: 'BORROW',
                status: 'BORROWED',
              },
            };
          }
          return {};
        },
      });

      const res = await resourcesHandler(
        makeAuthEvent('PATCH', `/resources/${testResId}`, { status: 'AVAILABLE' }, { id: testResId })
      );

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.data.status, 'AVAILABLE');
    });

    test('rejects invalid status transitions with 409 INVALID_STATUS_TRANSITION', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            resourceId: testResId,
            ownerId: callerSub,
            sharingType: 'GIVE_AWAY',
            status: 'AVAILABLE', // Cannot patch to GIVEN_AWAY directly without PENDING_CLAIM
          },
        }),
      });

      const res = await resourcesHandler(
        makeAuthEvent('PATCH', `/resources/${testResId}`, { status: 'GIVEN_AWAY' }, { id: testResId })
      );

      assert.equal(res.statusCode, 409);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'INVALID_STATUS_TRANSITION');
    });

    test('rejects non-owner PATCH with 403 FORBIDDEN', async () => {
      setDocClient({
        send: async () => ({
          Item: {
            resourceId: testResId,
            ownerId: otherSub, // Different owner
            sharingType: 'BORROW',
            status: 'BORROWED',
          },
        }),
      });

      const res = await resourcesHandler(
        makeAuthEvent('PATCH', `/resources/${testResId}`, { status: 'AVAILABLE' }, { id: testResId })
      );

      assert.equal(res.statusCode, 403);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'FORBIDDEN');
    });
  });
});
