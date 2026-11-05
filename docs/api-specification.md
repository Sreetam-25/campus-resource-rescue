# API Specification — Campus Resource Rescue

**Base URL:** `https://{apiId}.execute-api.ap-southeast-2.amazonaws.com/v1`
**Protocol:** HTTPS only
**Authentication:** Cognito JWT Access Token via `Authorization: Bearer {token}`
**Content-Type:** `application/json`

---

## Authentication Convention

| Symbol | Meaning |
|---|---|
| 🔓 Public | No token required |
| 🔐 Protected | Valid Cognito Access Token required |

API Gateway JWT Authorizer validates the token. Invalid or missing tokens receive `401` from API Gateway — Lambda is never invoked.

**Identity in Lambda:** `event.requestContext.authorizer.jwt.claims.sub`
Lambda **never** trusts `ownerId`, `requesterId`, or any identity field in the request body.

---

## Standard Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "count": 20, "nextKey": "base64url-cursor" }
}
```

`meta` is present on list responses only. `nextKey` is `null` when there are no further pages.

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource does not exist."
  }
}
```

---

## Health

### GET /health 🔓

Backend liveness check.

**Response 200:**
```json
{
  "status": "OPERATIONAL",
  "service": "campus-resource-rescue-api",
  "region": "ap-southeast-2",
  "timestamp": "2026-11-03T12:00:00Z"
}
```

**Lambda:** `healthHandler`

---

## Resources

### GET /resources 🔓

Browse the resource catalog with optional filters.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `category` | string | — | Exact category name |
| `sharingType` | string | — | `GIVE_AWAY` or `BORROW` |
| `condition` | string | — | `New`, `Good`, or `Used` |
| `pageSize` | integer | `20` | Max 50 |
| `nextKey` | string | — | Pagination cursor from previous response |

All results have `status = AVAILABLE`. There is no `status` query parameter on the public browse endpoint — the catalog only shows available items.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "resourceId":  "res-uuid",
      "ownerId":     "cognito-sub",
      "ownerName":   "Rahul Sharma",
      "title":       "Casio FX-991EX",
      "description": "...",
      "category":    "Electronics",
      "condition":   "Good",
      "sharingType": "BORROW",
      "location":    "Hostel 3, Common Room",
      "imageUrl":    "https://s3-presigned-url...",
      "status":      "AVAILABLE",
      "createdAt":   "2026-10-23T08:30:00Z",
      "updatedAt":   "2026-10-23T08:30:00Z"
    }
  ],
  "meta": { "count": 20, "nextKey": "eyJyZXNvdXJjZUlkIjoiLi4uIn0" }
}
```

**Field notes:**
- `ownerName` is resolved from the JWT claim at response time — it is not stored in DynamoDB. For listings owned by other users, `ownerName` comes from the `name` attribute stored in the resource item at creation time (set from JWT at write time and stored as a snapshot).
- `imageUrl` is a pre-signed S3 GET URL with 1-hour expiry, generated in Lambda from the stored `imageKey`. Resources without an image omit `imageUrl`. Pre-signed URLs are never stored in DynamoDB.
- `ownerId` (Cognito `sub`) is included to allow the frontend to detect "this is mine" without a separate lookup.

**Lambda:** `resourcesHandler`

---

### GET /resources/{id} 🔓

Retrieve a single resource by ID.

**Path Params:** `id` — resourceId (UUID)

**Response 200:** Same shape as a single item from the list above.

**Response 404:**
```json
{
  "success": false,
  "error": { "code": "RESOURCE_NOT_FOUND", "message": "Resource not found." }
}
```

**Lambda:** `resourcesHandler`

---

### POST /resources 🔐

Create a new resource listing.

**Request Body:**
```json
{
  "title":       "Casio FX-991EX ClassWiz Scientific Calculator",
  "description": "Natural textbook display, 552 functions...",
  "category":    "Electronics",
  "condition":   "Good",
  "sharingType": "BORROW",
  "location":    "Hostel 3, Common Room",
  "imageKey":    "users/cognito-sub-uuid/resources/a3f1c2d4-uuid.jpg"
}
```

| Field | Required | Constraints |
|---|---|---|
| `title` | Yes | 3–120 characters |
| `description` | Yes | 10–500 characters |
| `category` | Yes | One of the 8 valid categories |
| `condition` | Yes | `New`, `Good`, or `Used` |
| `sharingType` | Yes | `GIVE_AWAY` or `BORROW` — `EXCHANGE` is not supported |
| `location` | Yes | 3–120 characters |
| `imageKey` | No | Must start with `users/{callerSub}/` if provided |

Lambda sets: `ownerId = JWT sub`, `ownerName = JWT name claim` (snapshot at write time), `status = AVAILABLE`, `resourceId = UUID`, `createdAt/updatedAt = now`.

**Response 201:**
```json
{
  "success": true,
  "data": {
    "resourceId": "res-uuid",
    "ownerId":    "cognito-sub",
    "status":     "AVAILABLE",
    "createdAt":  "2026-11-03T12:00:00Z",
    "..."
  }
}
```

**Response 400:** Validation failure (missing fields, invalid enum, EXCHANGE submitted)
**Response 403:** `imageKey` prefix does not match caller's sub
**Response 401:** Missing / invalid token

**Lambda:** `resourcesHandler`

---

### PATCH /resources/{id} 🔐

Update resource status. Owner only. Used for two distinct lifecycle events:

| `sharingType` | `status` value | Meaning |
|---|---|---|
| `GIVE_AWAY` | `GIVEN_AWAY` | Owner confirms the item has been collected |
| `BORROW` | `AVAILABLE` | Owner marks the borrowed item as returned |

No other status values are accepted via PATCH. The transition from `AVAILABLE → PENDING_CLAIM` or `AVAILABLE → BORROWED` is performed internally by `requestsHandler` on request acceptance — not by this endpoint.

**Request Body:**
```json
{ "status": "AVAILABLE" }
```
or
```json
{ "status": "GIVEN_AWAY" }
```

Lambda verifies: owner is the caller AND the transition is valid for the resource's `sharingType` AND the current `status` is the expected predecessor.

**Response 200:**
```json
{ "success": true, "data": { "resourceId": "...", "status": "AVAILABLE", "updatedAt": "..." } }
```

**Response 400:** Invalid status value or invalid transition
**Response 403:** Caller is not the owner
**Response 404:** Resource not found
**Response 409:** `INVALID_STATUS_TRANSITION` — e.g. resource is already GIVEN_AWAY

**Lambda:** `resourcesHandler`

---

## Requests

### POST /resources/{id}/requests 🔐

Submit a request for a resource.

**Path Params:** `id` — resourceId

**Request Body:**
```json
{
  "message": "Hi, I need this calculator for my semester exams next week."
}
```

| Field | Required | Constraints |
|---|---|---|
| `message` | Yes | 10–500 characters |

**Enforced rules — 403/404/409 if violated:**
1. Resource must exist (404 if not).
2. Resource `status` must be `AVAILABLE` (409 `ALREADY_UNAVAILABLE` if not).
3. Caller must not be the resource owner (403 `SELF_REQUEST`).
4. No existing PENDING request lock for this `(resourceId, callerId)` pair (409 `DUPLICATE_REQUEST` if TransactWrite condition fails).

**Response 201:**
```json
{
  "success": true,
  "data": {
    "requestId":   "req-uuid",
    "resourceId":  "res-uuid",
    "resourceTitle": "Casio FX-991EX",
    "ownerId":     "owner-sub",
    "requesterId": "requester-sub",
    "message":     "Hi, I need this...",
    "status":      "PENDING",
    "createdAt":   "2026-11-03T12:05:00Z"
  }
}
```

**Note on requester PII:** `requesterName` and `requesterEmail` are not included in the stored request item or in this response. They are resolved from Cognito token claims at response time in `GET /requests/my` (owner view) if needed. This minimises PII stored in DynamoDB.

**Response 400:** Missing or too-short message
**Response 403:** Self-request
**Response 404:** Resource not found
**Response 409:** Resource already unavailable, or duplicate pending request

**Lambda:** `requestsHandler`

---

### POST /requests/{id}/decision 🔐

Owner accepts or rejects a pending request.

**Path Params:** `id` — requestId

**Request Body:**
```json
{ "decision": "ACCEPT" }
```

`decision` must be `ACCEPT` or `REJECT`.

**On ACCEPT — DynamoDB TransactWrite atomically verifies all four conditions:**
1. `request.status = PENDING`
2. `request.ownerId = callerSub` (ownership via DB condition)
3. `resource.status = AVAILABLE`
4. `resource.ownerId = callerSub` (ownership via DB condition)

If all pass:
- Sets `request.status = ACCEPTED`
- Sets `resource.status` to `PENDING_CLAIM` (for GIVE_AWAY) or `BORROWED` (for BORROW)
- Deletes the PENDING-guard lock item

After success, Lambda queries and batch-rejects all remaining PENDING requests for the same resource.

**On REJECT — DynamoDB TransactWrite:**
- Sets `request.status = REJECTED` with `ConditionExpression: ownerId = :callerSub AND status = :pending`
- Deletes the PENDING-guard lock item

**Response 200:**
```json
{
  "success": true,
  "data": { "requestId": "...", "status": "ACCEPTED", "updatedAt": "..." }
}
```

**Response 400:** Invalid `decision` value
**Response 403:** Caller is not the resource owner
**Response 404:** Request not found
**Response 409:** `RACE_CONDITION` — transaction condition check failed (request already decided or resource already unavailable); `REQUEST_ALREADY_DECIDED` — request is not in PENDING state

**Lambda:** `requestsHandler`

---

### GET /requests/my 🔐

Fetch requests for the authenticated user.

**Query Parameters:**

| Parameter | Values | Default | Description |
|---|---|---|---|
| `role` | `requester` \| `owner` | `requester` | `requester` → My Sent Requests; `owner` → Incoming Requests |
| `status` | `PENDING` \| `ACCEPTED` \| `REJECTED` | — | Optional filter |
| `pageSize` | integer | `20` | Max 50 |
| `nextKey` | string | — | Pagination cursor |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "requestId":      "req-uuid",
      "resourceId":     "res-uuid",
      "resourceTitle":  "Casio FX-991EX",
      "ownerId":        "owner-sub",
      "requesterId":    "requester-sub",
      "message":        "Hi I need this...",
      "status":         "PENDING",
      "createdAt":      "2026-10-30T10:00:00Z",
      "updatedAt":      "2026-10-30T10:00:00Z"
    }
  ],
  "meta": { "count": 5, "nextKey": null }
}
```

**Cursor binding:** The `nextKey` cursor is bound to the `role` and `status` parameters. Passing a cursor from a `role=owner` query to a `role=requester` query returns `400 INVALID_CURSOR`.

**Display names in the owner view:** When `role=owner`, Lambda appends `requesterName` (from the stored `ownerName` snapshot in the resource item, and `name` from Cognito at request creation time — see note below) to each request for UI display. `requesterEmail` is **not** included in the response — the requester's email is not exposed to the resource owner through the API.

> **Note on name snapshots:** When a request is created, Lambda reads the caller's `name` from the JWT claim and stores it as `requesterName` in the request item at write time. This snapshot means the owner can see the requester's name without a Cognito lookup and without exposing the email address. The snapshot may become stale if the requester changes their name in Cognito, which is acceptable for this use case.

**Lambda:** `requestsHandler`

---

## Uploads

### POST /uploads/presign 🔐

Request a pre-signed S3 POST policy for a direct browser-to-S3 upload.

**Request Body:**
```json
{
  "fileName": "my-calculator.jpg",
  "fileType": "image/jpeg",
  "fileSize": 2097152
}
```

| Field | Required | Constraints |
|---|---|---|
| `fileName` | Yes | Used for extension extraction only |
| `fileType` | Yes | Exact match: `image/jpeg`, `image/png`, or `image/webp` only |
| `fileSize` | Yes | Integer bytes, 1–5,242,880 (5 MB) |

**Lambda generates:** key `users/{callerSub}/resources/{uuid}.{ext}`

**S3 POST policy conditions (enforced by S3, not Lambda):**
- `content-length-range: [1, 5242880]`
- `eq: $Content-Type <exact fileType>`
- `eq: $key users/{callerSub}/resources/{uuid}.{ext}`

**Response 200:**
```json
{
  "success": true,
  "uploadUrl": "https://campus-resource-rescue-images-072718159688.s3.ap-southeast-2.amazonaws.com/",
  "fields": {
    "key":            "users/cognito-sub/resources/uuid.jpg",
    "Content-Type":   "image/jpeg",
    "Policy":         "base64-encoded-policy",
    "X-Amz-Signature": "...",
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "...",
    "X-Amz-Date":     "..."
  },
  "key":       "users/cognito-sub/resources/uuid.jpg",
  "expiresIn": 300
}
```

**Browser upload:**
```
POST {uploadUrl}
Content-Type: multipart/form-data
Body: all {fields} as form fields, then "file" field with binary content
```

S3 returns `204 No Content` on success. On POST policy violation (wrong content-type, oversized, expired), S3 returns `403` with an XML error body.

**Response 400:** Invalid `fileType` or `fileSize`
**Response 401:** Missing token

**Lambda:** `uploadsHandler`

---

## Statistics

### GET /stats 🔓

Aggregate statistics for the home page and dashboard.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalResources":     28,
    "availableResources": 26,
    "totalRequests":      14,
    "categoryCounts": {
      "Books and Notebooks":  5,
      "Electronics":          4,
      "Stationery":           4,
      "Furniture":            3,
      "Laboratory Equipment": 4,
      "Sports Equipment":     4,
      "Hostel Essentials":    3,
      "Other":                1
    }
  }
}
```

`totalResources` is the count of all resources regardless of status. `availableResources` is resources with `status = AVAILABLE` only. `claimedResources` is removed from the spec — the frontend `App.jsx` computes it as `totalResources - availableResources` if needed.

**Lambda:** `statsHandler`
**Implementation:** Eight parallel queries on `categoryStatusIndex` (one per category) + one Scan with `Select: COUNT` on Requests table. Results cached in Lambda memory for 60 seconds per instance.

---

## Error Code Reference

| HTTP | Code | Scenario |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing required field, failed length/enum validation |
| 400 | `INVALID_FILE_TYPE` | fileType not in allowed set |
| 400 | `FILE_TOO_LARGE` | fileSize > 5,242,880 |
| 400 | `EXCHANGE_NOT_SUPPORTED` | sharingType EXCHANGE submitted |
| 400 | `INVALID_CURSOR` | nextKey does not match current query parameters |
| 401 | `UNAUTHORIZED` | Missing or expired JWT (returned by API Gateway) |
| 403 | `FORBIDDEN` | Valid token but caller is not the owner |
| 403 | `SELF_REQUEST` | User attempting to request their own resource |
| 403 | `IMAGE_KEY_MISMATCH` | imageKey prefix does not belong to caller |
| 404 | `RESOURCE_NOT_FOUND` | resourceId does not exist |
| 404 | `REQUEST_NOT_FOUND` | requestId does not exist |
| 409 | `ALREADY_UNAVAILABLE` | Resource status is not AVAILABLE |
| 409 | `DUPLICATE_REQUEST` | TransactWrite lock condition failed — pending request exists |
| 409 | `REQUEST_ALREADY_DECIDED` | Request is not PENDING |
| 409 | `INVALID_STATUS_TRANSITION` | PATCH attempted an illegal status change |
| 409 | `RACE_CONDITION` | TransactWrite condition failed on Accept (concurrent operation) |
| 500 | `INTERNAL_ERROR` | Unhandled Lambda exception |

---

## OpenAPI 3.0 Skeleton

```yaml
openapi: "3.0.3"
info:
  title: Campus Resource Rescue API
  version: "1.0.0"
servers:
  - url: https://{apiId}.execute-api.ap-southeast-2.amazonaws.com/v1
    variables:
      apiId: { default: "replace-after-deployment" }

components:
  securitySchemes:
    CognitoJWT:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Resource:
      type: object
      properties:
        resourceId:  { type: string }
        ownerId:     { type: string }
        ownerName:   { type: string }
        title:       { type: string }
        description: { type: string }
        category:
          type: string
          enum: ["Books and Notebooks","Electronics","Stationery","Furniture",
                 "Laboratory Equipment","Sports Equipment","Hostel Essentials","Other"]
        condition:   { type: string, enum: ["New","Good","Used"] }
        sharingType: { type: string, enum: ["GIVE_AWAY","BORROW"] }
        location:    { type: string }
        imageUrl:    { type: string, description: "Pre-signed S3 GET URL, 1-hour expiry" }
        status:
          type: string
          enum: ["AVAILABLE","PENDING_CLAIM","GIVEN_AWAY","BORROWED"]
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
    Request:
      type: object
      properties:
        requestId:     { type: string }
        resourceId:    { type: string }
        resourceTitle: { type: string }
        ownerId:       { type: string }
        requesterId:   { type: string }
        requesterName: { type: string, description: "Snapshot from Cognito name at request creation" }
        message:       { type: string }
        status:        { type: string, enum: ["PENDING","ACCEPTED","REJECTED"] }
        createdAt:     { type: string, format: date-time }
        updatedAt:     { type: string, format: date-time }

paths:
  /health:
    get:
      summary: Health check
      responses:
        "200": { description: OK }

  /resources:
    get:
      summary: Browse AVAILABLE resources
      parameters:
        - { name: category,    in: query, schema: { type: string } }
        - { name: sharingType, in: query, schema: { type: string } }
        - { name: condition,   in: query, schema: { type: string } }
        - { name: pageSize,    in: query, schema: { type: integer, default: 20 } }
        - { name: nextKey,     in: query, schema: { type: string } }
      responses:
        "200": { description: Paginated resource list }
    post:
      summary: Create resource listing
      security: [{ CognitoJWT: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title, description, category, condition, sharingType, location]
              properties:
                title:       { type: string }
                description: { type: string }
                category:    { type: string }
                condition:   { type: string }
                sharingType: { type: string, enum: ["GIVE_AWAY","BORROW"] }
                location:    { type: string }
                imageKey:    { type: string }
      responses:
        "201": { description: Resource created }
        "400": { description: Validation error }
        "403": { description: imageKey mismatch }

  /resources/{id}:
    get:
      summary: Get resource by ID
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200": { description: Resource }
        "404": { description: Not found }
    patch:
      summary: Update resource status (owner only)
      security: [{ CognitoJWT: [] }]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status: { type: string, enum: ["AVAILABLE","GIVEN_AWAY"] }
      responses:
        "200": { description: Updated }
        "403": { description: Not owner }
        "404": { description: Not found }
        "409": { description: Invalid transition }

  /resources/{id}/requests:
    post:
      summary: Submit request for resource
      security: [{ CognitoJWT: [] }]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [message]
              properties:
                message: { type: string, minLength: 10, maxLength: 500 }
      responses:
        "201": { description: Request created }
        "403": { description: Self-request }
        "404": { description: Resource not found }
        "409": { description: Already unavailable or duplicate }

  /requests/my:
    get:
      summary: Get my requests
      security: [{ CognitoJWT: [] }]
      parameters:
        - { name: role,     in: query, schema: { type: string, enum: [requester, owner] } }
        - { name: status,   in: query, schema: { type: string } }
        - { name: pageSize, in: query, schema: { type: integer } }
        - { name: nextKey,  in: query, schema: { type: string } }
      responses:
        "200": { description: Request list }
        "400": { description: Invalid cursor }

  /requests/{id}/decision:
    post:
      summary: Accept or reject a request (owner only)
      security: [{ CognitoJWT: [] }]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [decision]
              properties:
                decision: { type: string, enum: ["ACCEPT","REJECT"] }
      responses:
        "200": { description: Decision recorded }
        "403": { description: Not owner }
        "404": { description: Not found }
        "409": { description: Already decided or race condition }

  /uploads/presign:
    post:
      summary: Get pre-signed S3 POST policy
      security: [{ CognitoJWT: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [fileName, fileType, fileSize]
              properties:
                fileName: { type: string }
                fileType: { type: string, enum: ["image/jpeg","image/png","image/webp"] }
                fileSize: { type: integer, minimum: 1, maximum: 5242880 }
      responses:
        "200": { description: Pre-signed POST policy }
        "400": { description: Invalid file type or size }

  /stats:
    get:
      summary: Platform statistics
      responses:
        "200": { description: Stats }
```
