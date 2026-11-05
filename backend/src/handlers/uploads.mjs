/**
 * uploads.mjs — Lambda handler for pre-signed S3 upload policies.
 *
 * Routes:
 *   POST /uploads/presign
 */

import { getCaller } from '../lib/auth.mjs';
import { validatePresignUpload, parseBody } from '../lib/validate.mjs';
import { createPresignedUploadPost } from '../lib/s3.mjs';
import { customSuccessResponse, errorResponse } from '../lib/response.mjs';
import { AppError, ErrorCode } from '../lib/errors.mjs';

/**
 * Main Lambda entry point.
 */
export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (method !== 'POST') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Method ${method} not allowed on /uploads/presign.`
      );
    }

    const caller = getCaller(event);
    const body = parseBody(event);
    const validated = validatePresignUpload(body);

    const presignedData = await createPresignedUploadPost({
      callerSub: caller.sub,
      fileName: validated.fileName,
      fileType: validated.fileType,
      fileSize: validated.fileSize,
      expiresIn: 300, // 5 minutes
    });

    return customSuccessResponse(presignedData);
  } catch (err) {
    return errorResponse(err);
  }
};
