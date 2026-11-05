import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, ErrorCode } from '../../src/lib/errors.mjs';

describe('errors.mjs', () => {
  test('ErrorCode constants are frozen and distinct', () => {
    assert.ok(Object.isFrozen(ErrorCode));
    assert.equal(ErrorCode.RESOURCE_NOT_FOUND, 'RESOURCE_NOT_FOUND');
    assert.equal(ErrorCode.DUPLICATE_REQUEST, 'DUPLICATE_REQUEST');
    assert.equal(ErrorCode.EXCHANGE_NOT_SUPPORTED, 'EXCHANGE_NOT_SUPPORTED');
  });

  test('AppError sets correct statusCode and code', () => {
    const err404 = new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Resource missing');
    assert.equal(err404.statusCode, 404);
    assert.equal(err404.code, 'RESOURCE_NOT_FOUND');
    assert.equal(err404.message, 'Resource missing');

    const err400 = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid title');
    assert.equal(err400.statusCode, 400);

    const err403 = new AppError(ErrorCode.FORBIDDEN, 'Not owner');
    assert.equal(err403.statusCode, 403);

    const err409 = new AppError(ErrorCode.DUPLICATE_REQUEST, 'Duplicate');
    assert.equal(err409.statusCode, 409);

    const errTransition = new AppError(ErrorCode.INVALID_STATUS_TRANSITION, 'Bad transition');
    assert.equal(errTransition.statusCode, 409);
  });

  test('AppError falls back to 500 for unknown codes', () => {
    const err = new AppError('UNKNOWN_CODE', 'Unexpected');
    assert.equal(err.statusCode, 500);
  });
});
