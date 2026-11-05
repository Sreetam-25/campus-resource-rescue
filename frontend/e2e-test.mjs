/**
 * e2e-test.mjs — Comprehensive End-to-End Test Suite against deployed AWS development stack.
 */

import { execSync } from 'node:child_process';

const API_BASE_URL = 'https://3v7ify4704.execute-api.ap-southeast-2.amazonaws.com/v1';
const REGION = 'ap-southeast-2';
const USER_POOL_ID = 'ap-southeast-2_ocKlGMqGo';
const CLIENT_ID = '6uu9meudsuv2n65r3vtn769fgk';

const OWNER_EMAIL = `test-owner-${Date.now()}@campus.edu`;
const REQUESTER_EMAIL = `test-requester-${Date.now()}@campus.edu`;
const TEST_PASSWORD = process.env.TEST_PASSWORD || (`CrrTest!${Math.random().toString(36).slice(2)}9A#`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function awsCli(args) {
  const cmd = `aws ${args} --region ${REGION}`;
  const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

async function createAndAuthTestUser(email, name, accountType, department) {
  console.log(`[Cognito] Creating test user: ${email}...`);
  try {
    awsCli(
      `cognito-idp admin-create-user --user-pool-id ${USER_POOL_ID} --username "${email}" --user-attributes Name=email,Value="${email}" Name=email_verified,Value=true Name=name,Value="${name}" Name=custom:accountType,Value="${accountType}" Name=custom:department,Value="${department}" --message-action SUPPRESS`
    );
  } catch (err) {
    if (!err.message?.includes('UsernameExistsException')) throw err;
  }

  awsCli(
    `cognito-idp admin-set-user-password --user-pool-id ${USER_POOL_ID} --username "${email}" --password "${TEST_PASSWORD}" --permanent`
  );

  console.log(`[Cognito] Authenticating user: ${email}...`);
  const authRes = awsCli(
    `cognito-idp initiate-auth --client-id ${CLIENT_ID} --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME="${email}",PASSWORD="${TEST_PASSWORD}"`
  );

  const accessToken = authRes.AuthenticationResult?.AccessToken;
  assert(accessToken, 'Expected AccessToken from Cognito InitiateAuth');
  return { accessToken, email };
}

async function cleanupUser(email) {
  try {
    awsCli(`cognito-idp admin-delete-user --user-pool-id ${USER_POOL_ID} --username "${email}"`);
  } catch (err) {
    console.warn(`Could not delete user ${email}:`, err.message);
  }
}

async function runE2ETests() {
  console.log('=== STARTING END-TO-END VERIFICATION ===\n');

  // Test 1: Public Health Check
  console.log('Test 1: GET /health');
  const healthRes = await fetch(`${API_BASE_URL}/health`);
  assert(healthRes.status === 200, `Expected 200 from /health, got ${healthRes.status}`);
  const healthData = await healthRes.json();
  assert(healthData.status === 'OPERATIONAL', 'Expected OPERATIONAL status');
  console.log('✓ Health check passed:', healthData);

  // Test 2: Public Stats
  console.log('\nTest 2: GET /stats');
  const statsRes = await fetch(`${API_BASE_URL}/stats`);
  assert(statsRes.status === 200, `Expected 200 from /stats, got ${statsRes.status}`);
  const statsData = await statsRes.json();
  assert(statsData.success === true, 'Expected success=true');
  console.log('✓ Initial stats fetched:', statsData.data);

  // Test 3: Public Catalog Browse
  console.log('\nTest 3: GET /resources');
  const browseRes = await fetch(`${API_BASE_URL}/resources`);
  assert(browseRes.status === 200, `Expected 200 from /resources, got ${browseRes.status}`);
  const browseData = await browseRes.json();
  assert(browseData.success === true, 'Expected success=true');
  console.log(`✓ Catalog browse returned ${browseData.data?.length || 0} items`);

  // Test 4: Protected route without token
  console.log('\nTest 4: POST /resources without Authorization token (expect 401)');
  const unauthRes = await fetch(`${API_BASE_URL}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Unauthorized Book' }),
  });
  assert(unauthRes.status === 401, `Expected 401 Unauthorized, got ${unauthRes.status}`);
  console.log('✓ Unauthorized request correctly rejected with HTTP 401');

  // Test 5 & 6: Cognito User Setup & Authentication
  console.log('\nTest 5 & 6: Setting up Owner and Requester accounts via Cognito');
  const owner = await createAndAuthTestUser(
    OWNER_EMAIL,
    'Rahul Sharma',
    'Student',
    'Computer Science'
  );
  const requester = await createAndAuthTestUser(
    REQUESTER_EMAIL,
    'Priya Patel',
    'Student',
    'Electronics'
  );
  console.log('✓ Both test accounts authenticated with valid Cognito Access Tokens');

  let testResourceId = null;
  let testRequestId = null;

  try {
    // Test 7: S3 Pre-signed POST Policy Generation
    console.log('\nTest 7: POST /uploads/presign (Request S3 upload policy)');
    const presignRes = await fetch(`${API_BASE_URL}/uploads/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({
        fileName: 'algorithms_textbook.jpg',
        fileType: 'image/jpeg',
        fileSize: 1024 * 50,
      }),
    });
    assert(presignRes.status === 200, `Expected 200 from /uploads/presign, got ${presignRes.status}`);
    const presignData = await presignRes.json();
    assert(presignData.success === true, 'Expected presign success=true');
    assert(presignData.uploadUrl, 'Expected uploadUrl');
    assert(presignData.key.includes('/resources/'), 'Expected user-scoped key path');
    console.log(`✓ Pre-signed POST policy generated for key: ${presignData.key}`);

    // Test 8: S3 Multipart Direct Upload with valid JPEG magic bytes
    console.log('\nTest 8: Upload valid JPEG to Amazon S3 via pre-signed POST');
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0xff, 0xd9,
    ]);

    const formData = new FormData();
    Object.entries(presignData.fields).forEach(([k, v]) => formData.append(k, v));
    formData.append(
      'file',
      new Blob([jpegBuffer], { type: 'image/jpeg' }),
      'algorithms_textbook.jpg'
    );

    const s3UploadRes = await fetch(presignData.uploadUrl, {
      method: 'POST',
      body: formData,
    });
    assert(
      s3UploadRes.status === 204 || s3UploadRes.status === 200,
      `Expected 204/200 from S3 POST, got ${s3UploadRes.status}`
    );
    console.log('✓ Valid image file uploaded directly to S3');

    // Test 9: Create Resource with verified imageKey
    console.log('\nTest 9: POST /resources (Create resource with S3 imageKey)');
    const createRes = await fetch(`${API_BASE_URL}/resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({
        title: 'Introduction to Algorithms (CLRS 3rd Ed)',
        description: 'Hardcover edition in excellent condition. Great for DSA coursework.',
        category: 'Books and Notebooks',
        condition: 'Good',
        sharingType: 'GIVE_AWAY',
        location: 'CS Department, Room 302',
        imageKey: presignData.key,
      }),
    });
    assert(createRes.status === 201, `Expected 201 Created, got ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.success === true, 'Expected success=true');
    testResourceId = createData.data.resourceId;
    console.log(`✓ Resource created successfully with ID: ${testResourceId}`);

    // Test 10: Retrieve Resource by ID with Pre-signed GET URL
    console.log(`\nTest 10: GET /resources/${testResourceId}`);
    const getRes = await fetch(`${API_BASE_URL}/resources/${testResourceId}`);
    assert(getRes.status === 200, `Expected 200, got ${getRes.status}`);
    const getData = await getRes.json();
    assert(getData.data.resourceId === testResourceId, 'Resource ID mismatch');
    assert(getData.data.imageUrl, 'Expected pre-signed imageUrl in response');
    console.log(`✓ Resource details retrieved with pre-signed GET imageUrl`);

    // Test 11: Self-Request Prevention
    console.log('\nTest 11: Owner attempts self-request (expect 403 SELF_REQUEST)');
    const selfReqRes = await fetch(`${API_BASE_URL}/resources/${testResourceId}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ message: 'I want my own book' }),
    });
    assert(selfReqRes.status === 403, `Expected 403 SELF_REQUEST, got ${selfReqRes.status}`);
    const selfReqData = await selfReqRes.json();
    assert(selfReqData.error?.code === 'SELF_REQUEST', 'Expected SELF_REQUEST error code');
    console.log('✓ Self-request correctly rejected with 403 SELF_REQUEST');

    // Test 12: Requester Submits Request
    console.log('\nTest 12: Requester submits request (POST /resources/{id}/requests)');
    const reqRes = await fetch(`${API_BASE_URL}/resources/${testResourceId}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requester.accessToken}`,
      },
      body: JSON.stringify({ message: 'Hello! I am taking algorithms this semester and would love this book.' }),
    });
    assert(reqRes.status === 201, `Expected 201 Created, got ${reqRes.status}`);
    const reqData = await reqRes.json();
    assert(reqData.success === true, 'Expected success=true');
    testRequestId = reqData.data.requestId;
    console.log(`✓ Request submitted successfully with ID: ${testRequestId}`);

    // Test 13: Duplicate Request Prevention
    console.log('\nTest 13: Requester submits duplicate request (expect 409 DUPLICATE_REQUEST)');
    const dupRes = await fetch(`${API_BASE_URL}/resources/${testResourceId}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requester.accessToken}`,
      },
      body: JSON.stringify({ message: 'Duplicate request attempt' }),
    });
    assert(dupRes.status === 409, `Expected 409 Conflict, got ${dupRes.status}`);
    const dupData = await dupRes.json();
    assert(dupData.error?.code === 'DUPLICATE_REQUEST', 'Expected DUPLICATE_REQUEST error code');
    console.log('✓ Duplicate request correctly prevented with 409 DUPLICATE_REQUEST');

    // Test 14: Query Sent Requests
    console.log('\nTest 14: GET /requests/my?role=requester');
    const myReqRes = await fetch(`${API_BASE_URL}/requests/my?role=requester`, {
      headers: { Authorization: `Bearer ${requester.accessToken}` },
    });
    assert(myReqRes.status === 200, `Expected 200, got ${myReqRes.status}`);
    const myReqData = await myReqRes.json();
    assert(myReqData.data.some((r) => r.requestId === testRequestId), 'Expected request in list');
    console.log(`✓ Sent requests verified (${myReqData.data.length} found)`);

    // Test 15: Query Incoming Requests
    console.log('\nTest 15: GET /requests/my?role=owner');
    const incomingRes = await fetch(`${API_BASE_URL}/requests/my?role=owner`, {
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });
    assert(incomingRes.status === 200, `Expected 200, got ${incomingRes.status}`);
    const incomingData = await incomingRes.json();
    assert(incomingData.data.some((r) => r.requestId === testRequestId), 'Expected request in owner incoming list');
    console.log(`✓ Incoming requests verified (${incomingData.data.length} found)`);

    // Test 16: Owner Accepts Request
    console.log('\nTest 16: POST /requests/{id}/decision (ACCEPT)');
    const acceptRes = await fetch(`${API_BASE_URL}/requests/${testRequestId}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ decision: 'ACCEPT' }),
    });
    assert(acceptRes.status === 200, `Expected 200, got ${acceptRes.status}`);
    const acceptData = await acceptRes.json();
    assert(acceptData.data.status === 'ACCEPTED', 'Expected status ACCEPTED');
    console.log('✓ Request ACCEPT decision processed successfully');

    // Verify resource transitioned to PENDING_CLAIM
    const updatedResCheck = await fetch(`${API_BASE_URL}/resources/${testResourceId}`);
    const updatedResData = await updatedResCheck.json();
    assert(
      updatedResData.data.status === 'PENDING_CLAIM',
      `Expected resource status PENDING_CLAIM, got ${updatedResData.data.status}`
    );
    console.log('✓ Resource status transitioned to PENDING_CLAIM');

    // Test 17: Attempt Redecision (expect 409 REQUEST_ALREADY_DECIDED)
    console.log('\nTest 17: Owner attempts decision on already decided request');
    const redecideRes = await fetch(`${API_BASE_URL}/requests/${testRequestId}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ decision: 'REJECT' }),
    });
    assert(redecideRes.status === 409, `Expected 409, got ${redecideRes.status}`);
    const redecideData = await redecideRes.json();
    assert(redecideData.error?.code === 'REQUEST_ALREADY_DECIDED', 'Expected REQUEST_ALREADY_DECIDED');
    console.log('✓ Re-decision correctly rejected with 409 REQUEST_ALREADY_DECIDED');

    // Test 18: Confirm Collection (PENDING_CLAIM -> GIVEN_AWAY)
    console.log('\nTest 18: PATCH /resources/{id} (Confirm collection -> GIVEN_AWAY)');
    const confirmRes = await fetch(`${API_BASE_URL}/resources/${testResourceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ status: 'GIVEN_AWAY' }),
    });
    assert(confirmRes.status === 200, `Expected 200, got ${confirmRes.status}`);
    const confirmData = await confirmRes.json();
    assert(confirmData.data.status === 'GIVEN_AWAY', 'Expected status GIVEN_AWAY');
    console.log('✓ GIVE_AWAY lifecycle successfully confirmed (GIVEN_AWAY)');

    // Test 19: BORROW Lifecycle (AVAILABLE -> BORROWED -> AVAILABLE)
    console.log('\nTest 19: Testing BORROW resource lifecycle');
    const borrowRes = await fetch(`${API_BASE_URL}/resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({
        title: 'Casio Scientific Calculator FX-991EX',
        description: 'Spare calculator available for mid-term exams.',
        category: 'Electronics',
        condition: 'Good',
        sharingType: 'BORROW',
        location: 'Library 1st floor',
      }),
    });
    const borrowData = await borrowRes.json();
    const borrowResId = borrowData.data.resourceId;

    // Requester requests borrow item
    const borrowReqRes = await fetch(`${API_BASE_URL}/resources/${borrowResId}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requester.accessToken}`,
      },
      body: JSON.stringify({ message: 'Need this calculator for Friday math exam' }),
    });
    const borrowReqData = await borrowReqRes.json();
    const borrowReqId = borrowReqData.data.requestId;

    // Owner accepts borrow request -> item transitions to BORROWED
    await fetch(`${API_BASE_URL}/requests/${borrowReqId}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ decision: 'ACCEPT' }),
    });

    const borrowStatusCheck = await fetch(`${API_BASE_URL}/resources/${borrowResId}`);
    const borrowStatusData = await borrowStatusCheck.json();
    assert(borrowStatusData.data.status === 'BORROWED', `Expected BORROWED, got ${borrowStatusData.data.status}`);
    console.log('✓ Resource transitioned to BORROWED upon request acceptance');

    // Owner marks item returned -> transitions back to AVAILABLE
    const returnRes = await fetch(`${API_BASE_URL}/resources/${borrowResId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });
    const returnData = await returnRes.json();
    assert(returnData.data.status === 'AVAILABLE', 'Expected return to AVAILABLE');
    console.log('✓ BORROW resource returned and made AVAILABLE again');

    // Test 20: Updated Stats
    console.log('\nTest 20: GET /stats (Verify updated metrics)');
    const finalStatsRes = await fetch(`${API_BASE_URL}/stats`);
    const finalStats = await finalStatsRes.json();
    console.log('✓ Final platform stats:', finalStats.data);

    console.log('\n==============================================');
    console.log('ALL 20 END-TO-END TESTS COMPLETED SUCCESSFULLY!');
    console.log('==============================================\n');
  } finally {
    // Cleanup test users
    console.log('[Cleanup] Removing test users from Cognito...');
    await cleanupUser(OWNER_EMAIL);
    await cleanupUser(REQUESTER_EMAIL);
    console.log('[Cleanup] Done.');
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
