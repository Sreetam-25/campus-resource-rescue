/**
 * s3.mjs — Amazon S3 client singleton and pre-signed URL/POST helpers.
 *
 * Implements S3 operations per security-design.md and backend-architecture.md:
 * - Pre-signed POST policy generation for direct browser-to-S3 upload (5-minute expiry)
 * - Strict server-side policy conditions: exact Content-Type, key prefix, size range
 * - Pre-signed GET URL generation for private image access (1-hour expiry)
 * - Pre-signed URLs are generated at read time and NEVER stored in DynamoDB
 */

import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { validateImageBuffer, ALLOWED_IMAGE_TYPES } from './validate.mjs';
import { AppError, ErrorCode } from './errors.mjs';

export const IMAGES_BUCKET = process.env.IMAGES_BUCKET || 'crr-images-local';

let s3ClientInstance = null;

export function getS3Client() {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: process.env.AWS_REGION || 'ap-southeast-2',
    });
  }
  return s3ClientInstance;
}

/**
 * Replace S3 client instance (used in unit tests for mocking).
 *
 * @param {any} mock
 */
export function setS3Client(mock) {
  s3ClientInstance = mock;
}

/**
 * Determine safe file extension from MIME type.
 *
 * @param {string} mimeType
 * @param {string} [fileName]
 * @returns {string} e.g. '.jpg'
 */
export function getExtension(mimeType, fileName = '') {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';

  const ext = fileName.includes('.') ? `.${fileName.split('.').pop().toLowerCase()}` : '';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.jpg';
}

/**
 * Generate a pre-signed GET URL for reading an image (1-hour expiry).
 *
 * @param {string} key
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string>}
 */
export async function getPresignedGetUrl(key, expiresIn = 3600) {
  if (!key) return null;
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: IMAGES_BUCKET,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a pre-signed POST policy for uploading an image (5-minute expiry).
 *
 * Scopes key to: users/{callerSub}/resources/{uuid}.{ext}
 *
 * @param {{
 *   callerSub: string,
 *   fileName: string,
 *   fileType: string,
 *   fileSize: number,
 *   expiresIn?: number
 * }} params
 * @returns {Promise<{ uploadUrl: string, fields: Record<string, string>, key: string, expiresIn: number }>}
 */
export async function createPresignedUploadPost({
  callerSub,
  fileName,
  fileType,
  fileSize,
  expiresIn = 300,
}) {
  const client = getS3Client();
  const ext = getExtension(fileType, fileName);
  const imageId = crypto.randomUUID();
  const key = `users/${callerSub}/resources/${imageId}${ext}`;

  const Conditions = [
    ['content-length-range', 1, 5242880], // 1 byte to 5 MB
    { 'Content-Type': fileType },        // exact match
    { key },                             // exact key match
  ];

  const post = await createPresignedPost(client, {
    Bucket: IMAGES_BUCKET,
    Key: key,
    Conditions,
    Expires: expiresIn,
    Fields: {
      'Content-Type': fileType,
    },
  });

  return {
    uploadUrl: post.url,
    fields: post.fields,
    key,
    expiresIn,
  };
}

/**
 * Verify that an uploaded image object exists in S3 and matches valid image magic bytes.
 * Reads the first 64 bytes using a range request to check magic bytes efficiently.
 *
 * @param {string} key
 * @returns {Promise<{ contentType: string }>}
 */
export async function verifyAndValidateS3Image(key) {
  if (!key) return null;
  const client = getS3Client();
  let response;
  try {
    const command = new GetObjectCommand({
      Bucket: IMAGES_BUCKET,
      Key: key,
      Range: 'bytes=0-63',
    });
    response = await client.send(command);
  } catch (err) {
    if (
      err.name === 'NoSuchKey' ||
      err.name === 'NotFound' ||
      err.$metadata?.httpStatusCode === 404
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Referenced image does not exist in storage.'
      );
    }
    throw err;
  }

  const rawContentType = response.ContentType || '';
  const contentType = rawContentType.split(';')[0].trim().toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    throw new AppError(
      ErrorCode.INVALID_FILE_TYPE,
      `Unsupported image content type: ${contentType}. Allowed types: image/jpeg, image/png, image/webp.`
    );
  }

  // Read byte stream
  const chunks = [];
  if (response.Body) {
    if (typeof response.Body.transformToByteArray === 'function') {
      const byteArray = await response.Body.transformToByteArray();
      chunks.push(Buffer.from(byteArray));
    } else {
      for await (const chunk of response.Body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
  }
  const buffer = Buffer.concat(chunks);

  if (!validateImageBuffer(buffer, contentType)) {
    throw new AppError(
      ErrorCode.INVALID_FILE_TYPE,
      'Uploaded file content does not match the declared image format (invalid magic bytes).'
    );
  }

  return { contentType };
}
