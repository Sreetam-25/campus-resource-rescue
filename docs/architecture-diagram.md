# Architecture Diagram — Campus Resource Rescue

**Region:** `ap-southeast-2` (Asia Pacific — Sydney)  
**Account:** `072718159688`

---

## Full System Architecture

```mermaid
flowchart TD
    subgraph Users["👥 Users"]
        S["🎓 Student (Browser)"]
        D["🏛️ Department / Lab (Browser)"]
    end

    subgraph Amplify["☁️ AWS Amplify Hosting  ap-southeast-2"]
        React["⚛️ React SPA  Vite Build\naws-amplify v6\nCI/CD via amplify.yml"]
    end

    subgraph Auth["🔐 Amazon Cognito  ap-southeast-2"]
        UP["User Pool\ncampus-resource-rescue-users\nEmail + Password  Email Verification\ncustom:accountType  custom:department"]
        AC["App Client  No secret — SPA\nUSER_PASSWORD_AUTH  USER_SRP_AUTH\nREFRESH_TOKEN_AUTH"]
    end

    subgraph APIGW["🌐 AWS Serverless::HttpApi  Stage: v1"]
        GW["HTTP API\ncampus-resource-rescue-api\nBase URL: execute-api.ap-southeast-2.amazonaws.com/v1"]
        JWTAUTH["JWT Authorizer\nvalidates Cognito AccessToken\nIssuer: cognito-idp / UserPool\nAudience: AppClientId"]
    end

    subgraph Lambda["⚡ AWS Lambda  Node.js 24.x  arm64"]
        L1["resourcesHandler\nGET /resources\nGET /resources/{id}\nPOST /resources\nPATCH /resources/{id}"]
        L2["requestsHandler\nPOST /resources/{id}/requests\nPOST /requests/{id}/decision\nGET /requests/my"]
        L3["uploadsHandler\nPOST /uploads/presign"]
        L4["statsHandler\nGET /stats"]
        L5["healthHandler\nGET /health"]
    end

    subgraph DDB["🗄️ Amazon DynamoDB  PAY_PER_REQUEST"]
        RT["Resources Table\nPK: resourceId\nGSI-1: ownerIndex ownerId+createdAt\nGSI-2: statusCreatedIndex status+createdAt\nGSI-3: categoryStatusIndex category+createdAt\nStatuses: AVAILABLE  PENDING_CLAIM\nBORROWED  GIVEN_AWAY"]
        RQ["Requests Table\nPK: requestId\nGSI-1: ownerRequestsIndex ownerId+createdAt\nGSI-2: requesterRequestsIndex requesterId+createdAt\nGSI-3: resourceRequestsIndex resourceId+status\nLock items: LOCK#resourceId#requesterId\nStatuses: PENDING  ACCEPTED  REJECTED"]
    end

    subgraph S3Bucket["🪣 Amazon S3  ap-southeast-2"]
        BKT["Private Bucket\ncampus-resource-rescue-images\nBlock all public access\nSSE-S3  BucketOwnerEnforced\nKey prefix: users/{sub}/resources/{uuid}.ext"]
    end

    subgraph IAM["🔑 IAM — Separate Roles"]
        R1["ResourcesFunctionRole\nDynamoDB: GetItem PutItem UpdateItem Query\nS3: GetObject"]
        R2["RequestsFunctionRole\nDynamoDB: GetItem PutItem UpdateItem DeleteItem\nQuery BatchWriteItem TransactWriteItems\nBoth tables"]
        R3["UploadsFunctionRole\nS3: PutObject on users/ prefix only"]
        R4["StatsFunctionRole\nDynamoDB: Query Scan  Read-only"]
        R5["HealthFunctionRole\nNo DynamoDB or S3"]
    end

    subgraph Monitor["📊 Amazon CloudWatch  ap-southeast-2"]
        LOGS["Log Groups  RetentionDays=7\n/aws/lambda/crr-resources\n/aws/lambda/crr-requests\n/aws/lambda/crr-uploads\n/aws/lambda/crr-stats\n/aws/lambda/crr-health"]
        ALARM["Alarm: campus-api-5xx-errors\nThreshold: 5 errors / 5 minutes"]
    end

    S -->|HTTPS| React
    D -->|HTTPS| React

    React -->|"1 signUp + confirmSignUp (Amplify v6)"| UP
    React -->|"2 signIn → AccessToken IdToken RefreshToken (Amplify v6)"| AC

    React -->|"3 API calls  Authorization: Bearer AccessToken"| GW
    GW --> JWTAUTH
    JWTAUTH -.->|"JWKS validation cached 1hr"| UP

    GW -->|"/resources*  Auth: NONE or CognitoAuthorizer"| L1
    GW -->|"/requests*  CognitoAuthorizer"| L2
    GW -->|"/uploads/presign  CognitoAuthorizer"| L3
    GW -->|"/stats  Auth: NONE"| L4
    GW -->|"/health  Auth: NONE"| L5

    L1 --- R1
    L2 --- R2
    L3 --- R3
    L4 --- R4
    L5 --- R5

    L1 <-->|"GetItem PutItem UpdateItem\nConditionExpression: ownerId=callerSub"| RT
    L2 <-->|"TransactWriteItems (4 conditions)\nBatchWriteItem auto-reject others"| RQ
    L2 <-->|"TransactWriteItems resource status\nPENDING_CLAIM or BORROWED"| RT
    L4 -->|"Parallel Query per category\ncategoryStatusIndex  60s cache"| RT
    L4 -->|"Scan SELECT COUNT"| RQ

    L3 -->|"createPresignedPost\neq key users/{sub}/resources/{uuid}\ncontent-length-range 1→5MB\nexact Content-Type match\nexpires 300s"| BKT

    React -->|"4 Direct S3 Upload  POST multipart with policy fields"| BKT
    BKT -->|"204 No Content"| React

    L1 -->|"GetObject presigned GET URL  1hr expiry  generated at read time  never stored"| BKT

    L1 -.->|structured JSON logs| LOGS
    L2 -.->|structured JSON logs| LOGS
    L3 -.->|structured JSON logs| LOGS
    L4 -.->|structured JSON logs| LOGS
    LOGS -.-> ALARM
```

---

## Pre-Signed Upload Flow (with ownership enforcement)

```mermaid
sequenceDiagram
    actor Browser as React (Browser / Amplify v6)
    participant API as API Gateway
    participant UL as uploadsHandler Lambda
    participant S3 as S3 Bucket
    participant RES as resourcesHandler Lambda
    participant DDB as DynamoDB

    Browser->>API: POST /uploads/presign<br/>{fileName, fileType: "image/jpeg", fileSize: 2097152}<br/>Authorization: Bearer {AccessToken}
    API->>UL: invoke (callerSub from JWT claims)
    UL->>UL: validate fileType in [jpeg, png, webp]<br/>validate fileSize ≤ 5 MB<br/>generate key: users/{callerSub}/resources/{uuid}.jpg
    UL->>S3: createPresignedPost<br/>conditions: eq key users/{callerSub}/...<br/>eq Content-Type image/jpeg<br/>content-length-range [1, 5242880]<br/>expires 300s
    S3-->>UL: {url, fields}
    UL-->>API: 200 {uploadUrl, fields, key, expiresIn}
    API-->>Browser: 200 {uploadUrl, fields, key}

    Browser->>S3: POST {uploadUrl} multipart/form-data<br/>all policy fields + file binary
    S3-->>Browser: 204 No Content

    Browser->>API: POST /resources<br/>{title, ..., imageKey: "users/{callerSub}/resources/uuid.jpg"}<br/>Authorization: Bearer {AccessToken}
    API->>RES: invoke (callerSub from JWT)
    RES->>RES: verify imageKey.startsWith("users/" + callerSub + "/")<br/>→ 403 IMAGE_KEY_MISMATCH if not
    RES->>DDB: PutItem {resourceId, ownerId=callerSub, imageKey, status=AVAILABLE, ...}
    DDB-->>RES: success
    RES-->>API: 201 {data: resource}
    API-->>Browser: 201 Created
```

---

## Request Lifecycle — State Machine

```mermaid
stateDiagram-v2
    direction LR

    [*] --> AVAILABLE : Resource created\nPOST /resources

    state "GIVE_AWAY lifecycle" as GA {
        AVAILABLE_GA: AVAILABLE
        PENDING_CLAIM: PENDING_CLAIM
        GIVEN_AWAY: GIVEN_AWAY (terminal)

        AVAILABLE_GA --> PENDING_CLAIM : ACCEPT request\nTransactWrite:\nrequest=ACCEPTED + resource=PENDING_CLAIM\n(4 conditions verified atomically)
        PENDING_CLAIM --> GIVEN_AWAY : Owner confirms collection\nPATCH /resources/{id} {status: GIVEN_AWAY}
    }

    state "BORROW lifecycle" as BW {
        AVAILABLE_B: AVAILABLE
        BORROWED: BORROWED

        AVAILABLE_B --> BORROWED : ACCEPT request\nTransactWrite:\nrequest=ACCEPTED + resource=BORROWED\n(4 conditions verified atomically)
        BORROWED --> AVAILABLE_B : Owner marks returned\nPATCH /resources/{id} {status: AVAILABLE}
    }

    state "Request states" as REQ {
        PENDING --> ACCEPTED : POST /requests/{id}/decision ACCEPT\n(owner only)
        PENDING --> REJECTED : POST /requests/{id}/decision REJECT\n(owner only)
        PENDING --> REJECTED : Auto-rejected when another\nrequest for same resource is accepted
    }
```

---

## Duplicate Request Prevention — Transaction Flow

```mermaid
sequenceDiagram
    actor RequesterA as Requester A
    actor RequesterB as Requester B
    participant API as API Gateway
    participant RL as requestsHandler
    participant DDB as DynamoDB

    Note over RequesterA, DDB: Both users request the same resource simultaneously

    RequesterA->>API: POST /resources/res-uuid/requests {message: "..."}
    RequesterB->>API: POST /resources/res-uuid/requests {message: "..."}

    API->>RL: invoke (callerSub = subA)
    API->>RL: invoke (callerSub = subB)

    Note over RL, DDB: Each invocation runs TransactWriteItems<br/>Put lock item (LOCK#res-uuid#subA) + Put request item<br/>ConditionExpression: attribute_not_exists(requestId) on lock

    RL->>DDB: TransactWriteItems<br/>Put LOCK#res-uuid#subA (if not exists)<br/>Put req-uuidA (PENDING)
    RL->>DDB: TransactWriteItems<br/>Put LOCK#res-uuid#subB (if not exists)<br/>Put req-uuidB (PENDING)

    Note over DDB: Different lock keys (subA ≠ subB) — both succeed

    DDB-->>RL: success (A)
    DDB-->>RL: success (B)

    Note over RequesterA, DDB: Now Requester A tries to submit again (duplicate)

    RequesterA->>API: POST /resources/res-uuid/requests {message: "again"}
    API->>RL: invoke (callerSub = subA)
    RL->>DDB: TransactWriteItems<br/>Put LOCK#res-uuid#subA (if not exists) ← FAILS — lock exists
    DDB-->>RL: TransactionCanceledException CancellationReasons[0].Code = ConditionalCheckFailed
    RL-->>API: 409 DUPLICATE_REQUEST
    API-->>RequesterA: 409 Conflict
```

---

## JWT Authentication Flow

```mermaid
sequenceDiagram
    actor User as User (Browser — Amplify v6)
    participant Cognito as Cognito User Pool
    participant APIGW as API Gateway JWT Authorizer
    participant Lambda as Lambda Handler

    User->>Cognito: signUp({username: email, password, options: {userAttributes, autoSignIn: true}})
    Cognito-->>User: nextStep: CONFIRM_SIGN_UP

    User->>Cognito: confirmSignUp({username: email, confirmationCode: "123456"})
    Cognito-->>User: confirmed

    User->>Cognito: autoSignIn()
    Cognito-->>User: {AccessToken, IdToken, RefreshToken} stored by Amplify

    Note over User: Amplify stores tokens in localStorage<br/>fetchAuthSession() retrieves AccessToken

    User->>APIGW: API call  Authorization: Bearer {AccessToken}
    APIGW->>Cognito: Fetch JWKS (cached 1hr)<br/>Validate RS256 signature + exp + iss + aud
    Cognito-->>APIGW: valid

    APIGW->>Lambda: event.requestContext.authorizer.jwt.claims<br/>sub, name, email, custom:accountType
    Lambda->>Lambda: callerSub = claims.sub<br/>callerName = claims.name<br/>NEVER trust body ownerId or requesterId
    Lambda-->>APIGW: response
    APIGW-->>User: response
```
