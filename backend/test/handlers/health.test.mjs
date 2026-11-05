import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handler as healthHandler } from '../../src/handlers/health.mjs';

describe('healthHandler', () => {
  test('returns 200 OPERATIONAL with service and region', async () => {
    const res = await healthHandler();
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/json');

    const body = JSON.parse(res.body);
    assert.equal(body.status, 'OPERATIONAL');
    assert.equal(body.service, 'campus-resource-rescue-api');
    assert.ok(body.timestamp);
    assert.ok(body.region);
  });
});
