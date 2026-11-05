import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handler as statsHandler, resetStatsCache } from '../../src/handlers/stats.mjs';
import { setDocClient } from '../../src/lib/dynamodb.mjs';

describe('statsHandler', () => {
  beforeEach(() => {
    resetStatsCache();
  });

  test('aggregates category counts and request counts successfully', async () => {
    setDocClient({
      send: async (command) => {
        const name = command.constructor.name;
        if (name === 'QueryCommand') {
          // Return simulated count per category
          const cat = command.input.ExpressionAttributeValues[':cat'];
          return { Count: cat === 'Electronics' ? 5 : 2 };
        }
        if (name === 'ScanCommand') {
          if (command.input.TableName.includes('resources')) {
            return { Count: 25 };
          }
          if (command.input.TableName.includes('requests')) {
            return { Count: 14 };
          }
        }
        return { Count: 0 };
      },
    });

    const res = await statsHandler({
      requestContext: { http: { method: 'GET', path: '/stats' } },
    });
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.totalResources, 25);
    assert.equal(body.data.totalRequests, 14);
    assert.equal(body.data.categoryCounts.Electronics, 5);
  });

  test('serves cached results on subsequent invocations within TTL', async () => {
    let callCount = 0;
    setDocClient({
      send: async () => {
        callCount++;
        return { Count: 3 };
      },
    });

    const res1 = await statsHandler({});
    assert.equal(res1.statusCode, 200);
    const initialCalls = callCount;
    assert.ok(initialCalls > 0);

    // Second call should hit in-memory cache and not invoke DynamoDB
    const res2 = await statsHandler({});
    assert.equal(res2.statusCode, 200);
    assert.equal(callCount, initialCalls);
  });
});
