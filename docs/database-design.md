# Database Design — Campus Resource Rescue

**Service:** Amazon DynamoDB  
**Region:** `ap-southeast-2`  
**Billing mode:** PAY_PER_REQUEST (on-demand) — no capacity planning, cost stays near zero at low volumes  
**Encryption:** AWS-managed SSE (AES-256, enabled by default, no extra cost)

---

## Table 1: Resources

### Purpose
Stores every resource listing created by students or departments.

### Key Schema

| Attribute | Type | Role |
|---|---|---|
| `resourceId` | String (UUID v4) | Partition Key (PK) |

No sort key on the base table. UUIDs distribute writes evenly and are opaque to external callers.

### Full Item Shape

```json
{
  "resourceId":  "res-a3f1c2d4-...",
  "ownerId":     "cognito-sub-uuid",
  "title":       "Casio FX-991EX ClassWiz",
  "description": "...",
  "category":    "Electronics",
  "condition":   "Good",
  "sharingType": "GIVE_AWAY",
  "location":    "Hostel 3, Common Room",
  "imageKey":    "users/cognito-sub-uuid/resources/a3f1c2d4-uuid.jpg",
  "status":      "AVAILABLE",
  "createdAt":   "2026-10-23T08:30:00Z",
  "updatedAt":   "2026-10-23T08:30:00Z"
}
```

**Note:** `ownerName` is not stored on the resource item. The owner's display name is resolved from the Cognito token in Lambda at response time and appended to the response only — it is never persisted in DynamoDB. This avoids stale display-name data and reduces the stored PII footprint.

### Attribute Enumerations

| Attribute | Allowed Values |
|---|---|
| `category` | `Books and Notebooks`, `Electronics`, `Stationery`, `Furniture`, `Laboratory Equipment`, `Sports Equipment`, `Hostel Essentials`, `Other` |
| `condition` | `New`, `Good`, `Used` |
| `sharingType` | `GIVE_AWAY`, `BORROW` |
| `status` | See Resource Status Lifecycle below |

### Resource Status Lifecycle

Resource status depends on `sharingType`. EXCHANGE has been removed from the first implementation — a swap workflow requires a separate design.

#### GIVE_AWAY statuses

```
AVAILABLE  →  PENDING_CLAIM  →  GIVEN_AWAY (terminal)
```

| Status | Meaning |
|---|---|
| `AVAILABLE` | Listed and open to requests |
| `PENDING_CLAIM` | A request has been accepted; item not yet collected |
| `GIVEN_AWAY` | Item permanently transferred; listing is closed |

- Once `GIVEN_AWAY`, the owner cannot revert the status. The item is no longer in the catalog.
- `PENDING_CLAIM` is set atomically when the owner accepts a request (TransactWrite).
- The owner confirms collection by calling `PATCH /resources/{id} { "status": "GIVEN_AWAY" }`.

#### BORROW statuses

```
AVAILABLE  →  BORROWED  →  AVAILABLE  (cycle repeats)
```

| Status | Meaning |
|---|---|
| `AVAILABLE` | Listed and open to borrow requests |
| `BORROWED` | Currently on loan to a requester |

- `BORROWED` is set atomically when the owner accepts a request (TransactWrite).
- The owner marks the item returned by calling `PATCH /resources/{id} { "status": "AVAILABLE" }`.
- A borrowed item can be re-listed for borrowing after it is returned.

#### Status transition rules

| Transition | Trigger | Allowed by |
|---|---|---|
| `AVAILABLE → PENDING_CLAIM` | Accept request on GIVE_AWAY resource | `requestsHandler` TransactWrite |
| `PENDING_CLAIM → GIVEN_AWAY` | Owner confirms collection | `resourcesHandler` PATCH |
| `AVAILABLE → BORROWED` | Accept request on BORROW resource | `requestsHandler` TransactWrite |
| `BORROWED → AVAILABLE` | Owner marks item returned | `resourcesHandler` PATCH |

No other transitions are valid. Lambda rejects any PATCH that attempts an invalid transition with `409 INVALID_STATUS_TRANSITION`.

---

### Global Secondary Indexes

#### GSI-1: `ownerIndex`

| Attribute | Role |
|---|---|
| `ownerId` | GSI PK |
| `createdAt` | GSI SK |

**Access pattern:** My Listings — all resources for the logged-in user, newest-first.

```
KeyConditionExpression: ownerId = :userId
ScanIndexForward: false
```

#### GSI-2: `statusCreatedIndex`

| Attribute | Role |
|---|---|
| `status` | GSI PK |
| `createdAt` | GSI SK |

**Access pattern:** Browse catalog — all `AVAILABLE` resources, newest-first. This is the primary browse query.

```
KeyConditionExpression: #status = :AVAILABLE
ScanIndexForward: false
```

Category and sharingType filters are applied as `FilterExpression` on the results from this index. At campus scale (≤ 500 active listings) this is efficient. The `Limit` parameter is set before filtering, so Lambda may need to issue multiple pages internally if many items are filtered out — this is handled transparently.

#### GSI-3: `categoryStatusIndex`

| Attribute | Role |
|---|---|
| `category` | GSI PK |
| `createdAt` | GSI SK |

**Access pattern:** Browse by category — supports filtering to a specific category first, then applying `FilterExpression: #status = :AVAILABLE`. Also used by `statsHandler` to count items per category without a full table scan.

---

## Table 2: Requests

### Purpose
Stores every resource request, including its entire lifecycle history.

### Key Schema

| Attribute | Type | Role |
|---|---|---|
| `requestId` | String (UUID v4) | Partition Key (PK) |

No sort key on the base table.

### Full Item Shape

```json
{
  "requestId":   "req-uuid4-...",
  "resourceId":  "res-a3f1c2d4-...",
  "resourceTitle": "Casio FX-991EX ClassWiz",
  "ownerId":     "cognito-sub-owner",
  "requesterId": "cognito-sub-requester",
  "message":     "Hi, I need this for my semester exams...",
  "status":      "PENDING",
  "createdAt":   "2026-10-30T10:00:00Z",
  "updatedAt":   "2026-10-30T10:00:00Z"
}
```

**Removed fields:** `ownerName`, `requesterName`, and `requesterEmail` are no longer stored in the Requests table. Display names are resolved from Cognito token claims at Lambda response time and included in the API response only. Storing a requester's email in a database item that the resource owner can query is unnecessary PII exposure.

### Attribute Enumerations

| Attribute | Allowed Values |
|---|---|
| `status` | `PENDING`, `ACCEPTED`, `REJECTED` |

### Global Secondary Indexes

#### GSI-1: `ownerRequestsIndex`

| Attribute | Role |
|---|---|
| `ownerId` | GSI PK |
| `createdAt` | GSI SK |

**Access pattern:** Incoming Requests dashboard — all requests where the logged-in user is the resource owner, newest-first.

```
KeyConditionExpression: ownerId = :userId
ScanIndexForward: false
```

#### GSI-2: `requesterRequestsIndex`

| Attribute | Role |
|---|---|
| `requesterId` | GSI PK |
| `createdAt` | GSI SK |

**Access pattern:** My Sent Requests dashboard — all requests submitted by the logged-in user, newest-first.

```
KeyConditionExpression: requesterId = :userId
ScanIndexForward: false
```

#### GSI-3: `resourceRequestsIndex`

| Attribute | Role |
|---|---|
| `resourceId` | GSI PK |
| `status` | GSI SK |

**Access patterns:**
1. After accepting a request, find all remaining `PENDING` requests for the same resource to auto-reject them.
2. Used as a supporting query in duplicate prevention (see below).

---

## Access Pattern Summary

| Access Pattern | Table / Index | Key Condition |
|---|---|---|
| Get resource by ID | Resources base table | `PK = resourceId` |
| Browse all AVAILABLE resources | Resources `statusCreatedIndex` | `status = AVAILABLE` |
| Browse AVAILABLE by category | Resources `categoryStatusIndex` | `category = X`, filter `status = AVAILABLE` |
| My listings | Resources `ownerIndex` | `ownerId = sub` |
| Incoming requests (owner) | Requests `ownerRequestsIndex` | `ownerId = sub` |
| Sent requests (requester) | Requests `requesterRequestsIndex` | `requesterId = sub` |
| All requests on a resource | Requests `resourceRequestsIndex` | `resourceId = X` |
| PENDING requests on a resource | Requests `resourceRequestsIndex` | `resourceId = X AND status = PENDING` |
| Dashboard stats | Resources `categoryStatusIndex` (per category) | aggregate in Lambda |

---

## Duplicate Request Prevention — Transaction-Based Design

### Problem with the previous approach

The prior design used a GSI query followed by a conditional PutItem. This has a race window: two concurrent requests for the same resource from the same requester could both read zero PENDING items and both proceed to write. GSI reads are eventually consistent by default, making the guard even weaker.

### Revised approach: Unique Constraint Item (strongly consistent)

A dedicated **lock item** is written to the Requests table alongside each PENDING request. The lock item uses a composite key that encodes the uniqueness constraint:

```
requestId (PK) = "LOCK#{resourceId}#{requesterId}"
```

**Creating a new request** uses a single `TransactWriteItems` with two operations:

```
TransactWriteItems([
  {
    // 1. Write the lock item — enforces uniqueness at the DB level
    Put: {
      TableName: RequestsTable,
      Item: {
        requestId: "LOCK#res-uuid#requester-sub",
        resourceId: "res-uuid",
        requesterId: "requester-sub",
        lockType: "PENDING_GUARD",
        createdAt: now
      },
      ConditionExpression: "attribute_not_exists(requestId)"
      // ← fails if a PENDING lock already exists for this (resource, requester) pair
    }
  },
  {
    // 2. Write the actual request item with a real UUID
    Put: {
      TableName: RequestsTable,
      Item: {
        requestId: "req-uuid4",
        resourceId: "res-uuid",
        ownerId: "owner-sub",
        requesterId: "requester-sub",
        message: "...",
        status: "PENDING",
        createdAt: now,
        updatedAt: now
      },
      ConditionExpression: "attribute_not_exists(requestId)"
    }
  }
])
```

If the lock item already exists, the transaction fails atomically. There is no query before the write — the uniqueness enforcement is entirely within the transaction. This is strongly consistent and race-free.

**When the request is accepted or rejected**, a third operation in the decision transaction **deletes the lock item**:

```
TransactWriteItems([
  { Update: request item → ACCEPTED/REJECTED },
  { Update: resource item → BORROWED/PENDING_CLAIM },
  {
    Delete: {
      TableName: RequestsTable,
      Key: { requestId: "LOCK#res-uuid#requester-sub" },
      ConditionExpression: "attribute_exists(requestId)"
    }
  }
])
```

After deletion, the requester can submit a new request (e.g. for a re-listed borrowed item).

**Lock items in GSI:** The `LOCK#` prefix means lock items appear in GSI queries. Lambda skips items where `lockType = "PENDING_GUARD"` when building response lists.

---

## Atomic Accept + Claim (DynamoDB Transaction)

When an owner accepts a request, Lambda executes a single `TransactWriteItems` covering all consistency requirements:

```
TransactWriteItems([
  {
    // 1. Accept the request — verify it is still PENDING
    Update: {
      TableName: RequestsTable,
      Key: { requestId },
      UpdateExpression: "SET #s = :accepted, updatedAt = :now",
      ConditionExpression: "#s = :pending AND requesterId = :requesterSub AND ownerId = :ownerSub",
      ExpressionAttributeValues: {
        ":accepted":    "ACCEPTED",
        ":pending":     "PENDING",
        ":requesterSub": requesterSubFromItem,
        ":ownerSub":    callerSub   // ← verifies ownership via DB condition, not just Lambda logic
      }
    }
  },
  {
    // 2. Claim the resource — verify it is still AVAILABLE and owned by caller
    Update: {
      TableName: ResourcesTable,
      Key: { resourceId },
      UpdateExpression: "SET #s = :newStatus, updatedAt = :now",
      ConditionExpression: "#s = :available AND ownerId = :ownerSub",
      ExpressionAttributeValues: {
        ":newStatus":  newStatus,   // PENDING_CLAIM for GIVE_AWAY, BORROWED for BORROW
        ":available":  "AVAILABLE",
        ":ownerSub":   callerSub
      }
    }
  },
  {
    // 3. Delete the pending-guard lock item
    Delete: {
      TableName: RequestsTable,
      Key: { requestId: "LOCK#" + resourceId + "#" + requesterSub }
    }
  }
])
```

The four conditions in the transaction together enforce:
- ✅ Request is PENDING
- ✅ Resource is AVAILABLE
- ✅ Caller is the resource owner (ownerId = callerSub on both request and resource items)
- ✅ Request and resource belong together (resourceId from the request item is used as the resource PK)

If any condition fails — because the resource was already accepted by a concurrent accept, or the request was already decided — the entire transaction rolls back and Lambda returns `409 RACE_CONDITION`.

**After the transaction:** Lambda queries `resourceRequestsIndex` for remaining `PENDING` request items (excluding lock items) and issues a `BatchWriteItem` to set them all to `REJECTED` and delete their lock items. This is done outside the main transaction because DynamoDB transactions are limited to 100 operations and batch-rejection is best-effort (already-decided items are skipped).

---

## Search Strategy

DynamoDB does not support full-text search. The current frontend searches by title, description, category, and location.

**Phase 1 (current scope):** The API returns all `AVAILABLE` resources up to the page size, and the client filters locally. For campus scale (≤ 500 active listings), a single paginated fetch of ~50 items is sufficient. The browse page already implements client-side filtering in `BrowsePage.jsx`.

**Phase 2 (future):** If scale grows, add DynamoDB Streams → Lambda → a search index. This is out of scope.

---

## Pagination Strategy and Cursor Integrity

All list endpoints use DynamoDB native cursor pagination.

### Mechanics

- Default page size: `20` items. Maximum: `50`.
- Lambda uses `Limit` on the DynamoDB query and receives `LastEvaluatedKey` when more pages exist.
- `LastEvaluatedKey` is serialised as JSON, then base64url-encoded, and returned as `nextKey` in the response.
- The client passes `?nextKey=<token>` on the next request.
- When `nextKey` is absent in the response, the client has reached the last page.

### FilterExpression and Limit interaction

When a GSI query uses `Limit` together with `FilterExpression`, DynamoDB applies `Limit` to the number of items *scanned*, not the number returned. A page of 20 scanned items may return fewer than 20 after filtering. Lambda handles this by issuing follow-up queries until the desired page size is collected or the table is exhausted.

### Cursor binding

A pagination cursor (`ExclusiveStartKey`) from DynamoDB encodes the index key of the last returned item. Cursors are **bound to a specific query** — a cursor from a `status=AVAILABLE` query cannot be used with a `category=Electronics` query. Lambda validates that the decoded cursor's embedded index key attributes match the active query parameters before using it. If they do not match, the cursor is rejected with `400 INVALID_CURSOR` rather than silently returning wrong data.

Cursors are not signed in this implementation. They do not contain sensitive data (only DynamoDB key attribute values), but they should not be used across different users' queries. Lambda checks that `ownerId` in an `ownerIndex` cursor matches the authenticated caller's `sub` before accepting it.

---

## DynamoDB Free Tier Note

DynamoDB on-demand (PAY_PER_REQUEST) free tier:
- 25 GB storage — always free, no time limit
- On-demand: first 25 million read and write request units per month are free. At campus scale this will not be exceeded.

**Decision:** PAY_PER_REQUEST — no capacity planning, zero cost at low volumes, scales automatically.
