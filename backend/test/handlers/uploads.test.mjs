import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';
import { handler as uploadsHandler } from '../../src/handlers/uploads.mjs';
import { setS3Client } from '../../src/lib/s3.mjs';

describe('uploadsHandler', () => {
  const callerSub = '123e4567-e89b-12d3-a456-426614174000';

  const authEvent = (body) => ({
    requestContext: {
      http: { method: 'POST', path: '/uploads/presign' },
      authorizer: {
        jwt: {
          claims: { sub: callerSub, name: 'Alice' },
        },
      },
    },
    body: JSON.stringify(body),
  });

  beforeEach(() => {
    setS3Client(
      new S3Client({
        region: 'ap-southeast-2',
        credentials: {
          accessKeyId: 'mock-access-key-id',
          secretAccessKey: 'mock-secret-access-key',
        },
      })
    );
  });

  test('rejects unauthenticated requests with 401', async () => {
    const res = await uploadsHandler({
      requestContext: { http: { method: 'POST', path: '/uploads/presign' } },
      body: JSON.stringify({ fileName: 'img.jpg', fileType: 'image/jpeg', fileSize: 1024 }),
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  test('rejects invalid file types with 400 INVALID_FILE_TYPE', async () => {
    const res = await uploadsHandler(
      authEvent({ fileName: 'doc.pdf', fileType: 'application/pdf', fileSize: 1024 })
    );
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_FILE_TYPE');
  });

  test('rejects oversized files with 400 FILE_TOO_LARGE', async () => {
    const res = await uploadsHandler(
      authEvent({ fileName: 'large.jpg', fileType: 'image/jpeg', fileSize: 10 * 1024 * 1024 })
    );
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FILE_TOO_LARGE');
  });

  test('generates user-scoped pre-signed POST policy for valid JPEG', async () => {
    const res = await uploadsHandler(
      authEvent({ fileName: 'notes.jpg', fileType: 'image/jpeg', fileSize: 1024 * 100 })
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.uploadUrl);
    assert.ok(body.key.startsWith(`users/${callerSub}/resources/`));
    assert.ok(body.key.endsWith('.jpg'));
    assert.equal(body.expiresIn, 300);
    assert.ok(body.fields);
  });
});
