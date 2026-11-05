import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCaller,
  getOptionalCaller,
  assertOwner,
  assertNotOwner,
  assertImageKeyOwnership,
} from '../../src/lib/auth.mjs';
import { AppError } from '../../src/lib/errors.mjs';

describe('auth.mjs', () => {
  const mockJwtEvent = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-sub-1234-5678',
            name: 'Priya Sharma',
            email: 'priya@college.edu',
            'custom:accountType': 'Student',
            'custom:department': 'Computer Science',
          },
        },
      },
    },
  };

  test('getCaller extracts identity claims correctly', () => {
    const caller = getCaller(mockJwtEvent);
    assert.equal(caller.sub, 'user-sub-1234-5678');
    assert.equal(caller.name, 'Priya Sharma');
    assert.equal(caller.email, 'priya@college.edu');
    assert.equal(caller.accountType, 'Student');
    assert.equal(caller.department, 'Computer Science');
  });

  test('getCaller throws 401 UNAUTHORIZED when claims are missing', () => {
    assert.throws(() => getCaller({}), (err) => err.statusCode === 401);
    assert.throws(() => getCaller({ requestContext: {} }), AppError);
  });

  test('getOptionalCaller returns null for unauthenticated events without throwing', () => {
    assert.equal(getOptionalCaller({}), null);
    assert.equal(getOptionalCaller(mockJwtEvent)?.sub, 'user-sub-1234-5678');
  });

  test('assertOwner verifies owner matches caller', () => {
    assert.doesNotThrow(() => assertOwner('sub-1', 'sub-1'));
    assert.throws(() => assertOwner('sub-1', 'sub-2'), (err) => err.statusCode === 403);
  });

  test('assertNotOwner prevents self-request', () => {
    assert.doesNotThrow(() => assertNotOwner('caller-1', 'owner-2'));
    assert.throws(() => assertNotOwner('sub-1', 'sub-1'), (err) => err.code === 'SELF_REQUEST');
  });

  test('assertImageKeyOwnership requires users/{callerSub}/ prefix', () => {
    const callerSub = 'sub-abc-123';
    assert.doesNotThrow(() =>
      assertImageKeyOwnership(callerSub, `users/${callerSub}/resources/calc.jpg`)
    );
    assert.throws(
      () => assertImageKeyOwnership(callerSub, 'users/other-sub/resources/calc.jpg'),
      (err) => err.code === 'IMAGE_KEY_MISMATCH'
    );
    assert.throws(
      () => assertImageKeyOwnership(callerSub, 'public/resources/calc.jpg'),
      (err) => err.code === 'IMAGE_KEY_MISMATCH'
    );
  });
});
