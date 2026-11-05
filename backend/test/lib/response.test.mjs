import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatResponse,
  successResponse,
  customSuccessResponse,
  errorResponse,
} from '../../src/lib/response.mjs';
import { AppError, ErrorCode } from '../../src/lib/errors.mjs';

describe('response.mjs', () => {
  test('formatResponse creates valid API Gateway envelope', () => {
    const res = formatResponse(200, { ok: true }, { 'X-Custom': 'val' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/json');
    assert.equal(res.headers['X-Custom'], 'val');
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });

  test('successResponse formats single data item without meta', () => {
    const res = successResponse({ id: '123' }, null, 201);
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, { id: '123' });
    assert.equal(body.meta, undefined);
  });

  test('successResponse formats list with meta pagination', () => {
    const res = successResponse(['item1', 'item2'], { count: 2, nextKey: 'cursor123' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, ['item1', 'item2']);
    assert.deepEqual(body.meta, { count: 2, nextKey: 'cursor123' });
  });

  test('customSuccessResponse formats arbitrary top-level properties', () => {
    const res = customSuccessResponse({ uploadUrl: 'https://s3...', key: 'users/123' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.uploadUrl, 'https://s3...');
    assert.equal(body.key, 'users/123');
  });

  test('errorResponse handles AppError with correct status and structure', () => {
    const appErr = new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Listing not found');
    const res = errorResponse(appErr);
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.deepEqual(body.error, {
      code: 'RESOURCE_NOT_FOUND',
      message: 'Listing not found',
    });
  });

  test('errorResponse formats unexpected errors as INTERNAL_ERROR 500', () => {
    const origError = console.error;
    console.error = () => {}; // Silence intentional error log in test
    try {
      const genericErr = new TypeError('Cannot read properties of undefined');
      const res = errorResponse(genericErr);
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
    } finally {
      console.error = origError;
    }
  });
});
