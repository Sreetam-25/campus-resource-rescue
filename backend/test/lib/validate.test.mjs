import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBody,
  validateString,
  validateUUID,
  validateCreateResource,
  validatePatchResource,
  validateCreateRequest,
  validateDecision,
  validatePresignUpload,
  validateImageBuffer,
  encodeCursor,
  decodeCursor,
  validatePageSize,
} from '../../src/lib/validate.mjs';
import { AppError } from '../../src/lib/errors.mjs';

describe('validate.mjs', () => {
  test('parseBody parses string and base64 bodies', () => {
    assert.deepEqual(parseBody({ body: '{"a":1}' }), { a: 1 });
    assert.deepEqual(
      parseBody({ body: Buffer.from('{"b":2}').toString('base64'), isBase64Encoded: true }),
      { b: 2 }
    );
    assert.deepEqual(parseBody({ body: null }), {});
    assert.throws(() => parseBody({ body: 'invalid-json{' }), AppError);
  });

  test('validateString enforces bounds and trims', () => {
    assert.equal(validateString('  hello  ', 'title', 3, 10), 'hello');
    assert.throws(() => validateString('hi', 'title', 3, 10), (err) => err.statusCode === 400);
    assert.throws(
      () => validateString('very long string exceeding max', 'title', 1, 10),
      (err) => err.statusCode === 400
    );
  });

  test('validateUUID validates standard v4 UUID', () => {
    const valid = '123e4567-e89b-12d3-a456-426614174000';
    assert.equal(validateUUID(valid), valid);
    assert.throws(() => validateUUID('not-a-uuid'), AppError);
  });

  test('validateCreateResource enforces valid enums and rejects EXCHANGE', () => {
    const valid = {
      title: 'Lab Microscope',
      description: 'Used compound microscope with extra lenses',
      category: 'Laboratory Equipment',
      condition: 'Good',
      sharingType: 'BORROW',
      location: 'Science Building Lab 4',
      imageKey: 'users/sub-123/resources/uuid.jpg',
    };
    const res = validateCreateResource(valid);
    assert.equal(res.title, 'Lab Microscope');

    // Test EXCHANGE rejection
    assert.throws(
      () => validateCreateResource({ ...valid, sharingType: 'EXCHANGE' }),
      (err) => err.code === 'EXCHANGE_NOT_SUPPORTED'
    );

    // Test invalid category
    assert.throws(
      () => validateCreateResource({ ...valid, category: 'Invalid Category' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  test('validatePatchResource allows only AVAILABLE and GIVEN_AWAY', () => {
    assert.equal(validatePatchResource({ status: 'AVAILABLE' }), 'AVAILABLE');
    assert.equal(validatePatchResource({ status: 'GIVEN_AWAY' }), 'GIVEN_AWAY');
    assert.throws(() => validatePatchResource({ status: 'PENDING_CLAIM' }), AppError);
  });

  test('validatePresignUpload validates file type and max size', () => {
    const valid = {
      fileName: 'calculator.jpg',
      fileType: 'image/jpeg',
      fileSize: 2048,
    };
    assert.deepEqual(validatePresignUpload(valid), valid);

    // Unsupported file type
    assert.throws(
      () => validatePresignUpload({ ...valid, fileType: 'application/pdf' }),
      (err) => err.code === 'INVALID_FILE_TYPE'
    );

    // Oversized (> 5MB)
    assert.throws(
      () => validatePresignUpload({ ...valid, fileSize: 6 * 1024 * 1024 }),
      (err) => err.code === 'FILE_TOO_LARGE'
    );
  });

  test('validateImageBuffer checks magic bytes for jpeg, png, webp', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    assert.equal(validateImageBuffer(jpegBuffer, 'image/jpeg'), true);
    assert.equal(validateImageBuffer(jpegBuffer, 'image/png'), false);

    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    assert.equal(validateImageBuffer(pngBuffer, 'image/png'), true);

    const webpBuffer = Buffer.from('RIFF1234WEBPVP8 ');
    assert.equal(validateImageBuffer(webpBuffer, 'image/webp'), true);

    const textBuffer = Buffer.from('Hello world this is not an image');
    assert.equal(validateImageBuffer(textBuffer, 'image/jpeg'), false);
  });

  test('encodeCursor and decodeCursor enforce query parameter binding', () => {
    const binding = { category: 'Electronics', sharingType: 'BORROW' };
    const key = { resourceId: 'res-1', createdAt: '2026-11-01' };

    const cursor = encodeCursor(key, binding);
    assert.ok(cursor);

    // Decode with matching binding succeeds
    const decoded = decodeCursor(cursor, binding);
    assert.deepEqual(decoded, key);

    // Decode with mismatched binding throws 400 INVALID_CURSOR
    assert.throws(
      () => decodeCursor(cursor, { category: 'Books and Notebooks', sharingType: 'BORROW' }),
      (err) => err.code === 'INVALID_CURSOR'
    );
  });

  test('validatePageSize clamps between 1 and 50', () => {
    assert.equal(validatePageSize('25'), 25);
    assert.equal(validatePageSize('100'), 50);
    assert.equal(validatePageSize('-5'), 20);
    assert.equal(validatePageSize(undefined), 20);
  });
});
