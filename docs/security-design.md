# Security Design — Campus Resource Rescue

**Region:** `ap-southeast-2`  
**Identity Provider:** Amazon Cognito User Pool  
**Frontend Auth Library:** AWS Amplify JavaScript v6 (`aws-amplify` ≥ 6.x)

---

## 1. Cognito User Pool Configuration

### Pool Settings

| Setting | Value | Reason |
|---|---|---|
| Pool name | `campus-resource-rescue-users` | — |
| Sign-in attribute | Email address | Matches existing registration form |
| Username case-insensitivity | Enabled | `Rahul@college.edu` = `rahul@college.edu` |
| Email verification | Required | Users must confirm email before first login |
| Password minimum length | 8 characters | Stronger than the current mock (6-char) |
| Password requirements | 1 uppercase + 1 number | Basic hardening; symbols not required |
| Self sign-up | Enabled | Open campus registration |
| MFA | Not required | Campus use case; free tier |
| Token expiry — Access Token | 1 hour | Short-lived |
| Token expiry — ID Token | 1 hour | — |
| Token expiry — Refresh Token | 30 days | Reasonable session length for students |

### App Client Settings

| Setting | Value |
|---|---|
| Client name | `campus-resource-rescue-web` |
| Client secret | **None** — SPA cannot store secrets |
| Auth flows | `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |
| Token revocation | Enabled |
| Prevent user existence errors | Enabled (prevents account enumeration) |

### Custom Attributes

| Attribute | Type | Mutable | Purpose |
|---|---|---|---|
| `custom:accountType` | String | No | `Student` or `Department` — set at registration |
| `custom:department` | String | Yes | Department or branch name |
| `name` | Standard | Yes | Display name |

---

## 2. Amplify JavaScript v6 — API Reference

The frontend uses `aws-amplify` v6. The old class-based `Auth.signIn()` / `Auth.signUp()` API from v5 is **not used**. All examples below use the v6 named-export API.

### v6 Configuration (once, at app startup)

```javascript
// src/main.jsx or src/amplifyConfig.js
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        email: true
      }
    }
  }
});
```

---

## 3. Registration Flow (Amplify v6)

```javascript
import { signUp, confirmSignUp, autoSignIn } from 'aws-amplify/auth';

// Step 1 — User fills RegisterPage and submits
const { nextStep } = await signUp({
  username: email,           // Cognito uses email as username
  password,
  options: {
    userAttributes: {
      email,
      name,
      'custom:accountType': accountType,   // 'Student' or 'Department'
      'custom:department':  department
    },
    autoSignIn: true         // Amplify v6: auto sign-in after confirmation
  }
});

// nextStep.signUpStep === 'CONFIRM_SIGN_UP'
// → show confirmation code input in RegisterPage

// Step 2 — User enters the 6-digit code sent to their email
await confirmSignUp({ username: email, confirmationCode: code });

// Step 3 — Auto sign-in (because autoSignIn: true was set)
await autoSignIn();
// AuthContext now reads the active session from Amplify's session store
```

### What happens in AuthContext

`authService.js` is replaced by direct Amplify v6 calls. `AuthContext.jsx` listens to `Hub` events from Amplify to detect sign-in and sign-out:

```javascript
import { Hub } from 'aws-amplify/utils';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

Hub.listen('auth', ({ payload }) => {
  if (payload.event === 'signedIn')  { /* reload user state */ }
  if (payload.event === 'signedOut') { setUser(null); }
});
```

---

## 4. Login Flow (Amplify v6)

```javascript
import { signIn } from 'aws-amplify/auth';

const { nextStep } = await signIn({ username: email, password });

switch (nextStep.signInStep) {
  case 'DONE':
    // Signed in — session is active
    break;
  case 'CONFIRM_SIGN_UP':
    // User never confirmed email — redirect to confirmation screen
    break;
  default:
    // Handle any unexpected MFA step (not expected in this config)
}
```

---

## 5. Token Retrieval for API Calls (Amplify v6)

```javascript
import { fetchAuthSession } from 'aws-amplify/auth';

async function getAccessToken() {
  const session = await fetchAuthSession();
  return session.tokens?.accessToken?.toString();
}

// In api.js request() helper:
const token = await getAccessToken();
const response = await fetch(`${API_BASE_URL}${endpoint}`, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  ...options
});
```

**Do not use** `Auth.currentSession().getAccessToken().getJwtToken()` — this is the Amplify v5 API and will throw in v6.

---

## 6. Token Storage (Amplify v6 Default Behaviour)

Amplify v6 manages token storage internally. By default it uses `localStorage` for web. This is a deliberate Amplify v6 change from v5's in-memory default.

| Token | Storage in Amplify v6 | Notes |
|---|---|---|
| Access Token | `localStorage` (default) | Accessible by JS — XSS risk. See trade-off below. |
| ID Token | `localStorage` (default) | — |
| Refresh Token | `localStorage` (default) | Cleared on `signOut()` |

**Trade-off:** `localStorage` persistence means the session survives page refresh (better UX) but is accessible to any JavaScript on the page (XSS risk). For this campus application — low-sensitivity data, no financial transactions — `localStorage` is acceptable.

**To use sessionStorage instead** (session lost on tab close), configure a custom storage provider:

```javascript
Amplify.configure({
  Auth: {
    Cognito: { ... },
  },
  // Custom storage: sessionStorage
}, {
  Storage: window.sessionStorage
});
```

This is a deployment-time decision. The recommendation for this project is to accept Amplify's default (`localStorage`) and not add a custom storage provider unless required.

---

## 7. Logout Flow (Amplify v6)

```javascript
import { signOut } from 'aws-amplify/auth';

await signOut();
// Amplify v6 clears all tokens from storage and fires 'signedOut' Hub event.
// AuthContext Hub listener sets user = null.
// React Router redirects to /.

// Global sign-out (revokes all sessions on all devices):
await signOut({ global: true });
```

---

## 8. JWT Validation in API Gateway

API Gateway HTTP API JWT Authorizer validates every request to protected routes before Lambda is invoked.

**Authorizer configuration (from SAM template):**

```yaml
JwtConfiguration:
  issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${CampusUserPool}"
  audience:
    - !Ref CampusUserPoolClient
```

**Validation steps (performed by API Gateway, not Lambda):**
1. Fetch Cognito JWKS from `{issuer}/.well-known/jwks.json`. Cache with 1-hour TTL.
2. Validate RS256 signature.
3. Validate `exp` (not expired).
4. Validate `iss` matches the configured issuer.
5. Validate `aud` or `client_id` matches the configured audience.
6. On failure: return `401 Unauthorized` without invoking Lambda.
7. On success: pass decoded claims to Lambda in `event.requestContext.authorizer.jwt.claims`.

---

## 9. User Identity in Lambda

```javascript
// Extract in every handler that needs caller identity
const callerId = event.requestContext.authorizer.jwt.claims.sub;
const callerName = event.requestContext.authorizer.jwt.claims.name || 'Unknown';
```

`sub` is the Cognito User Pool UUID — permanent, immutable, cannot be spoofed.  
`name` is the Cognito profile attribute — used only for response assembly, never persisted in DynamoDB.

**Rules enforced in Lambda:**

| Rule | Implementation |
|---|---|
| `ownerId` always = JWT `sub` | Set in Lambda on resource creation — never from request body |
| `requesterId` always = JWT `sub` | Set in Lambda on request creation — never from request body |
| Only owner may decide requests | Lambda reads request item; verifies `ownerId = callerSub` before accepting |
| Owner enforcement in DynamoDB | TransactWrite ConditionExpression includes `ownerId = :callerSub` on both items |
| Only owner may patch resource status | `UpdateItem` with `ConditionExpression: ownerId = :callerSub` |
| Self-request prevention | Lambda reads resource; rejects if `ownerId = callerSub` before any write |

---

## 10. Account Types: Student vs Department

`accountType` is a **display/UX attribute only**.

| Aspect | Detail |
|---|---|
| Stored in | Cognito custom attribute `custom:accountType` |
| Values | `Student`, `Department` |
| Affects | Default location pre-fill in PostResourcePage |
| Does not affect | API permissions, resource ownership, request rights |
| Admin privileges | None — both types have identical backend capabilities |

There is no admin-only endpoint in scope. Privilege escalation via `accountType` is not possible.

---

## 11. Resource Ownership Enforcement

All write operations on resources use a DynamoDB `ConditionExpression` as a second enforcement layer beyond Lambda's application-level check:

```
ConditionExpression: "ownerId = :callerSub"
```

If the condition fails (e.g. the caller is not the owner), DynamoDB throws `ConditionalCheckFailedException`. Lambda catches this and returns `403 FORBIDDEN`. The Lambda application-level check is the first line of defence; the DynamoDB condition is a backstop that prevents mutation even if there is a bug in the Lambda routing logic.

---

## 12. S3 Security Architecture

### Bucket Configuration

| Setting | Value |
|---|---|
| Bucket name | `campus-resource-rescue-images-{accountId}` |
| Block all public access | **Enabled** (all 4 settings) |
| ACLs | Disabled (`BucketOwnerEnforced`) |
| Versioning | Disabled (reduces cost) |
| Encryption | SSE-S3 (AES-256, no cost) |

### User-Scoped Key Prefix

Image keys follow the pattern: `users/{cognitoSub}/resources/{uuid}.{ext}`

The `uploadsHandler` Lambda generates the key using the caller's `sub` from the JWT. The pre-signed POST policy includes `eq: $key users/{callerSub}/resources/{uuid}...` — S3 enforces this condition and rejects uploads to any other key.

**Ownership verification on `POST /resources`:** `resourcesHandler` verifies that the `imageKey` field in the request body starts with `users/{callerSub}/` before writing the resource. A user cannot submit another user's `imageKey` for their own listing.

```javascript
if (imageKey && !imageKey.startsWith(`users/${callerId}/`)) {
  return error(403, 'FORBIDDEN', 'imageKey does not belong to the authenticated user.');
}
```

### Pre-signed POST Policy (Upload)

- Generated by `uploadsHandler` using `@aws-sdk/s3-presigned-post`
- Policy conditions enforced server-side by S3:
  ```
  content-length-range: [1, 5242880]
  eq: $Content-Type  image/jpeg | image/png | image/webp   ← exact match, not starts-with
  eq: $key           users/{callerSub}/resources/{uuid}.{ext}
  ```
- Expires: 300 seconds (5 minutes)
- Content-type condition uses exact match (`eq`) rather than `starts-with image/` to prevent `image/svg+xml` or `image/tiff` uploads, which are not display-safe.

### Pre-signed GET URL (Download)

- Generated by `resourcesHandler` in Lambda at read time using `@aws-sdk/s3-request-presigner`
- Expires: 3600 seconds (1 hour)
- **Not stored in DynamoDB.** Only `imageKey` (the S3 object key) is persisted. Lambda generates a fresh pre-signed URL on every `GET /resources` or `GET /resources/{id}` response.
- Storing a pre-signed URL in DynamoDB is incorrect because the URL would expire while the data is at rest; any cached or replayed response would contain a stale URL.

### CORS Configuration

```json
{
  "AllowedOrigins": ["https://{amplifyAppId}.amplifyapp.com"],
  "AllowedMethods": ["GET", "POST"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}
```

`AllowedOrigins` is restricted to the specific Amplify domain. The wildcard `*` is never used in production. For local development, a separate parameter (`DevOrigin`) is passed to the SAM template and added to `AllowedOrigins`.

`AllowedMethods` includes `POST` (for pre-signed POST multipart upload) and `GET` (for pre-signed GET download). `PUT` is not included because this design uses pre-signed POST, not pre-signed PUT.

---

## 13. IAM Permissions Summary

Each Lambda has a dedicated role. Full role definitions are in `backend-architecture.md` Section 5.

| Function | DynamoDB | S3 |
|---|---|---|
| `resourcesHandler` | GetItem, PutItem, UpdateItem, Query on Resources table + indexes | s3:GetObject on bucket/* |
| `requestsHandler` | GetItem, PutItem, UpdateItem, DeleteItem, Query, BatchWriteItem, TransactWriteItems on both tables + indexes | None |
| `uploadsHandler` | None | s3:PutObject on bucket/users/* |
| `statsHandler` | Query, Scan on Resources + Requests tables + indexes | None |
| `healthHandler` | None | None |

No function has `iam:*`, `cognito-idp:AdminCreate*`, `s3:DeleteObject`, `s3:ListBucket`, or any destructive permission.

---

## 14. Security Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Forged ownerId/requesterId in request body | Lambda ignores body identity fields — always uses JWT `sub` |
| Expired or invalid JWT reaching Lambda | API Gateway JWT Authorizer rejects at gateway level — Lambda not invoked |
| Race condition: two owners accept simultaneously | DynamoDB TransactWrite with `ConditionExpression` on both items — second write fails atomically |
| Duplicate request submission (concurrent) | Transaction-based lock item with `attribute_not_exists` condition — race-free |
| Image upload to another user's key prefix | Pre-signed POST policy pins `key` to `users/{callerSub}/...` — S3 enforces it |
| Submitting another user's imageKey | Lambda verifies `imageKey.startsWith("users/" + callerId + "/")` before PutItem |
| Non-image file disguised as image | Content-type enforced by S3 POST policy (`eq` condition, not `starts-with`) |
| Oversized upload (> 5 MB) | `content-length-range` enforced by S3 — cannot be bypassed by the client |
| Public S3 access | Block all public access enabled; images only accessible via expiring pre-signed GET URLs |
| XSS token theft | Amplify v6 default: `localStorage`. Acceptable trade-off for this low-sensitivity application. |
| User enumeration on login | Cognito `PreventUserExistenceErrors: ENABLED` |
| CORS abuse | CORS restricted to specific Amplify app domain — wildcard not used |
| DynamoDB injection | AWS SDK uses parameterized `ExpressionAttributeValues` — no injection surface |
| Credential exposure | Lambda uses IAM execution roles — no hardcoded credentials |
| Pre-signed URL expiry in database | Pre-signed GET URLs are never stored in DynamoDB — generated fresh at read time |

---

## 15. Frontend Integration Changes Required

| File | Change |
|---|---|
| `src/main.jsx` | Add `Amplify.configure(...)` call with Cognito settings at app startup |
| `src/services/authService.js` | Replace in-memory mock with `signIn`, `signUp`, `confirmSignUp`, `autoSignIn`, `signOut`, `fetchAuthSession` from `aws-amplify/auth` |
| `src/services/api.js` `request()` | Replace hardcoded headers with `Authorization: Bearer ${await getAccessToken()}` using `fetchAuthSession` |
| `src/context/AuthContext.jsx` | Replace `authService` calls with Amplify v6 `getCurrentUser` and Hub event listener; handle `CONFIRM_SIGN_UP` next step |
| `src/pages/RegisterPage.jsx` | Add confirmation code input step; call `confirmSignUp` then `autoSignIn` |
| `src/pages/LoginPage.jsx` | Remove demo quick-fill buttons; handle `CONFIRM_SIGN_UP` next step; remove `rememberMe` checkbox (Amplify handles persistence) |
| `frontend/.env.example` | Update to list `VITE_COGNITO_REGION`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_API_BASE_URL` |
| `frontend/package.json` | Add `aws-amplify` as a dependency |
