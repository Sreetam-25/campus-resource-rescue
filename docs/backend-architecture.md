# Backend Architecture — Campus Resource Rescue

**Project:** Campus Resource Rescue  
**Architecture:** AWS Serverless  
**Region:** `ap-southeast-2` (Asia Pacific — Sydney)  
**Account:** `072718159688`  
**IaC:** AWS SAM (CloudFormation)  
**Runtime:** Node.js 24.x (`nodejs24.x`) on Amazon Linux 2023  
**AWS SDK:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner`

---

## 1. Technology Stack

| Service | Role | Free Tier Status |
|---|---|---|
| **AWS Amplify** | React frontend hosting, CI/CD | 1,000 build mins/month, 5 GB storage, 15 GB served/month (12-month) |
| **Amazon Cognito** | Authentication, JWT | 50,000 MAUs — always free, no time limit |
| **Amazon API Gateway HTTP API** | REST API entry point | 1M calls/month for 12 months, then ~$1.00/million (see Section 8) |
| **AWS Lambda** | Business logic | 1M requests + 400,000 GB-sec/month — always free, no time limit |
| **Amazon DynamoDB** | Resources and requests storage | 25 GB + on-demand free tier — always free, no time limit |
| **Amazon S3** | Image storage | 5 GB, 20,000 GETs, 2,000 PUTs/month for 12 months |
| **Amazon CloudWatch** | Logs, metrics, alarms | 5 GB log ingestion/month free (ongoing) |
| **AWS SAM / CloudFormation** | IaC deployment | Free |

---

## 2. Lambda Functions

Five Lambda handlers. The backend is intentionally **not** split into microservices — each handler covers a logical domain and remains simple to maintain and test.

### Runtime

All functions use `nodejs24.x` (Amazon Linux 2023). This is the current LTS-equivalent runtime with a deprecation date of April 30, 2028.

```yaml
# SAM Globals section
Globals:
  Function:
    Runtime: nodejs24.x
    Architectures: [arm64]    # Graviton — lower cost and better cold-start for I/O-bound workloads
```

---

### resourcesHandler

**File:** `backend/src/handlers/resources.mjs`

| Route | Method | Auth |
|---|---|---|
| `GET /resources` | GET | Public |
| `GET /resources/{id}` | GET | Public |
| `POST /resources` | POST | Protected |
| `PATCH /resources/{id}` | PATCH | Protected (owner only) |

**Responsibilities:**
- `GET /resources`: Query `statusCreatedIndex` with `status = AVAILABLE`. Apply `FilterExpression` for optional `category`, `sharingType`, `condition` parameters. Handle multi-page internal queries when `FilterExpression` reduces results below requested page size.
- `GET /resources/{id}`: `GetItem` from base table. Generate a pre-signed S3 GET URL (1-hour expiry) from `imageKey` on read — never stored in DynamoDB.
- `POST /resources`: Validate body; set `ownerId` from JWT `sub`; validate `imageKey` prefix matches `users/{sub}/` (see S3 ownership section); `PutItem`.
- `PATCH /resources/{id}`: `GetItem` to verify `ownerId = callerSub`; validate status transition is legal for the resource's `sharingType`; `UpdateItem` with `ConditionExpression: ownerId = :callerSub AND #status = :currentStatus`.

**Memory:** 256 MB  
**Timeout:** 10 seconds  
**IAM Role:** `ResourcesFunctionRole` — see Section 5

---

### requestsHandler

**File:** `backend/src/handlers/requests.mjs`

| Route | Method | Auth |
|---|---|---|
| `POST /resources/{id}/requests` | POST | Protected |
| `GET /requests/my` | GET | Protected |
| `POST /requests/{id}/decision` | POST | Protected (owner only) |

**Responsibilities:**
- `POST /resources/{id}/requests`:
  1. `GetItem` on resource — verify `status = AVAILABLE` and `ownerId ≠ callerSub` (self-request check).
  2. `TransactWriteItems` — write lock item + request item atomically (duplicate prevention; see database-design.md).
  3. Return 409 on `TransactionCanceledException` with cancellation reason `ConditionalCheckFailed` on the lock item.
- `GET /requests/my`:
  - `role=owner`: Query `ownerRequestsIndex` with `ownerId = callerSub`. Skip lock items (`lockType` attribute present).
  - `role=requester`: Query `requesterRequestsIndex` with `requesterId = callerSub`. Skip lock items.
  - Validate cursor binding before using `ExclusiveStartKey`.
- `POST /requests/{id}/decision`:
  1. `GetItem` on request — verify item exists.
  2. If `decision = ACCEPT`: `TransactWriteItems` with all four conditions (see database-design.md). Determine new resource status from `sharingType` (`PENDING_CLAIM` or `BORROWED`). After success, query `resourceRequestsIndex` for remaining `PENDING` request items and `BatchWriteItem` to reject them and delete their lock items.
  3. If `decision = REJECT`: `TransactWriteItems` — set request to `REJECTED` + delete lock item + verify `ownerId = callerSub` in condition.

**Memory:** 256 MB  
**Timeout:** 15 seconds  
**IAM Role:** `RequestsFunctionRole` — see Section 5

---

### uploadsHandler

**File:** `backend/src/handlers/uploads.mjs`

| Route | Method | Auth |
|---|---|---|
| `POST /uploads/presign` | POST | Protected |

**Responsibilities:**
- Validate `fileType`: allow only `image/jpeg`, `image/png`, `image/webp`. Reject all others (400).
- Validate `fileSize` ≤ 5,242,880 bytes (5 MB). Reject if exceeded (400).
- Extract `callerSub` from JWT. Generate user-scoped key: `users/{callerSub}/resources/{uuid}.{ext}`.
- Call `createPresignedPost` with policy conditions enforced by S3:
  - `content-length-range: [1, 5242880]`
  - `starts-with: $Content-Type image/`
  - `eq: $key users/{callerSub}/resources/{uuid}.{ext}` ← pins the key to this caller's prefix
- Return `{ uploadUrl, fields, key, expiresIn: 300 }`.

**Memory:** 128 MB  
**Timeout:** 5 seconds  
**IAM Role:** `UploadsFunctionRole` — see Section 5

---

### statsHandler

**File:** `backend/src/handlers/stats.mjs`

| Route | Method | Auth |
|---|---|---|
| `GET /stats` | GET | Public |

**Responsibilities:**
- Query `categoryStatusIndex` once per category with `category = X` + `FilterExpression: #status = :AVAILABLE` to get per-category counts. Eight queries run in parallel (`Promise.all`).
- Count total requests (eventually consistent Scan with `Select: COUNT`).
- Aggregate and return stats.
- In-memory Lambda cache: if last execution < 60 seconds ago, return cached result without re-querying. This cache is per Lambda instance and lost on cold start — acceptable at campus scale.

**Memory:** 128 MB  
**Timeout:** 10 seconds  
**IAM Role:** `StatsFunctionRole` — see Section 5

---

### healthHandler

**File:** `backend/src/handlers/health.mjs`

| Route | Method | Auth |
|---|---|---|
| `GET /health` | GET | Public |

**Responsibilities:**
- Return `{ status: "OPERATIONAL", region, timestamp }` immediately. No DynamoDB or S3 calls.

**Memory:** 128 MB  
**Timeout:** 3 seconds  
**IAM Role:** `HealthFunctionRole` — see Section 5

---

## 3. SAM Template Structure

```
backend/
├── template.yaml              ← SAM template (single source of truth for all infrastructure)
├── samconfig.toml             ← SAM deploy configuration
├── package.json               ← workspace root for Lambda dependencies
└── src/
    ├── handlers/
    │   ├── resources.mjs
    │   ├── requests.mjs
    │   ├── uploads.mjs
    │   ├── stats.mjs
    │   └── health.mjs
    └── lib/
        ├── dynamodb.mjs       ← DynamoDB DocumentClient singleton + helpers
        ├── s3.mjs             ← S3 client + presign helpers
        ├── auth.mjs           ← JWT claim extraction (callerSub, callerName)
        ├── response.mjs       ← Standard envelope builders (success / error)
        └── validate.mjs       ← Input validation helpers
```

Dependencies are bundled at build time with `sam build`. There is no Lambda Layer for application dependencies — SAM bundles `node_modules` into each function's deployment package via `esbuild`.

---

## 4. SAM Template — Infrastructure Definition

The template uses `AWS::Serverless::HttpApi` (SAM resource type) consistently throughout. This is the correct SAM abstraction for HTTP API Gateway and handles routes, integrations, and stage creation automatically. Raw `AWS::ApiGatewayV2::*` resources are not used alongside SAM function events — mixing the two creates integration conflicts.

### Cognito User Pool

```yaml
CampusUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: campus-resource-rescue-users
    UsernameAttributes: [email]
    AutoVerifiedAttributes: [email]
    UsernameConfiguration:
      CaseSensitive: false
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireUppercase: true
        RequireNumbers: true
        RequireSymbols: false
    Schema:
      - Name: accountType
        AttributeDataType: String
        Mutable: false
      - Name: department
        AttributeDataType: String
        Mutable: true
    UserPoolAddOns:
      AdvancedSecurityMode: OFF     # AUDIT/ENFORCED modes cost extra

CampusUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: campus-resource-rescue-web
    UserPoolId: !Ref CampusUserPool
    GenerateSecret: false           # SPA — cannot store a client secret
    ExplicitAuthFlows:
      - ALLOW_USER_PASSWORD_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
      - ALLOW_USER_SRP_AUTH         # SRP is more secure than plain USER_PASSWORD_AUTH
    PreventUserExistenceErrors: ENABLED
    EnableTokenRevocation: true
    AccessTokenValidity: 1          # hours
    IdTokenValidity: 1              # hours
    RefreshTokenValidity: 30        # days
    TokenValidityUnits:
      AccessToken: hours
      IdToken: hours
      RefreshToken: days
```

### API Gateway (AWS::Serverless::HttpApi)

```yaml
HttpApi:
  Type: AWS::Serverless::HttpApi
  Properties:
    StageName: v1
    # StageName: v1 means the base URL is https://{id}.execute-api.ap-southeast-2.amazonaws.com/v1
    # This matches the VITE_API_BASE_URL used by the frontend.
    CorsConfiguration:
      AllowOrigins:
        - !Sub "https://${AmplifyAppId}.amplifyapp.com"
        # AmplifyAppId is a CloudFormation parameter supplied at deploy time.
        # For local development, add http://localhost:5173 via samconfig.toml parameter_overrides.
      AllowMethods:
        - GET
        - POST
        - PATCH
        - OPTIONS
      AllowHeaders:
        - Authorization
        - Content-Type
      MaxAge: 86400
    Auth:
      Authorizers:
        CognitoAuthorizer:
          IdentitySource: "$request.header.Authorization"
          JwtConfiguration:
            issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${CampusUserPool}"
            audience:
              - !Ref CampusUserPoolClient
      DefaultAuthorizer: CognitoAuthorizer
      # DefaultAuthorizer applies to all routes. Public routes override with AuthorizationType: NONE.
```

### CloudFormation Parameters

```yaml
Parameters:
  AmplifyAppId:
    Type: String
    Description: "Amplify App ID — used to restrict CORS and S3 bucket CORS to the hosted frontend."
    # Supplied via samconfig.toml parameter_overrides at deploy time.
    # Example: parameter_overrides = "AmplifyAppId=d1abc23def456"
    # Do NOT hardcode this value in template.yaml.
```

The `AmplifyAppId` parameter replaces the previous `!Sub https://${AmplifyApp}.amplifyapp.com` reference, which was unresolvable because `AmplifyApp` was never defined as a resource in the SAM template. Amplify hosting is provisioned separately (through the Amplify Console or the Amplify CLI), not through this SAM stack.

### DynamoDB Tables

```yaml
ResourcesTable:
  Type: AWS::DynamoDB::Table
  DeletionPolicy: Retain      # prevent accidental data loss on stack delete
  Properties:
    TableName: !Sub "campus-resource-rescue-resources-${AWS::StackName}"
    BillingMode: PAY_PER_REQUEST
    PointInTimeRecoverySpecification:
      PointInTimeRecoveryEnabled: false   # disabled — free tier; enable for production
    AttributeDefinitions:
      - { AttributeName: resourceId, AttributeType: S }
      - { AttributeName: ownerId,    AttributeType: S }
      - { AttributeName: status,     AttributeType: S }
      - { AttributeName: category,   AttributeType: S }
      - { AttributeName: createdAt,  AttributeType: S }
    KeySchema:
      - { AttributeName: resourceId, KeyType: HASH }
    GlobalSecondaryIndexes:
      - IndexName: ownerIndex
        KeySchema:
          - { AttributeName: ownerId,   KeyType: HASH }
          - { AttributeName: createdAt, KeyType: RANGE }
        Projection: { ProjectionType: ALL }
      - IndexName: statusCreatedIndex
        KeySchema:
          - { AttributeName: status,    KeyType: HASH }
          - { AttributeName: createdAt, KeyType: RANGE }
        Projection: { ProjectionType: ALL }
      - IndexName: categoryStatusIndex
        KeySchema:
          - { AttributeName: category,  KeyType: HASH }
          - { AttributeName: createdAt, KeyType: RANGE }
        Projection: { ProjectionType: ALL }

RequestsTable:
  Type: AWS::DynamoDB::Table
  DeletionPolicy: Retain
  Properties:
    TableName: !Sub "campus-resource-rescue-requests-${AWS::StackName}"
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - { AttributeName: requestId,   AttributeType: S }
      - { AttributeName: ownerId,     AttributeType: S }
      - { AttributeName: requesterId, AttributeType: S }
      - { AttributeName: resourceId,  AttributeType: S }
      - { AttributeName: status,      AttributeType: S }
      - { AttributeName: createdAt,   AttributeType: S }
    KeySchema:
      - { AttributeName: requestId, KeyType: HASH }
    GlobalSecondaryIndexes:
      - IndexName: ownerRequestsIndex
        KeySchema:
          - { AttributeName: ownerId,   KeyType: HASH }
          - { AttributeName: createdAt, KeyType: RANGE }
        Projection: { ProjectionType: ALL }
      - IndexName: requesterRequestsIndex
        KeySchema:
          - { AttributeName: requesterId, KeyType: HASH }
          - { AttributeName: createdAt,   KeyType: RANGE }
        Projection: { ProjectionType: ALL }
      - IndexName: resourceRequestsIndex
        KeySchema:
          - { AttributeName: resourceId, KeyType: HASH }
          - { AttributeName: status,     KeyType: RANGE }
        Projection: { ProjectionType: ALL }
```

### S3 Bucket

```yaml
ImagesBucket:
  Type: AWS::S3::Bucket
  DeletionPolicy: Retain
  Properties:
    BucketName: !Sub "campus-resource-rescue-images-${AWS::AccountId}"
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
    OwnershipControls:
      Rules:
        - ObjectOwnership: BucketOwnerEnforced
    BucketEncryption:
      ServerSideEncryptionConfiguration:
        - ServerSideEncryptionByDefault:
            SSEAlgorithm: AES256
    LifecycleConfiguration:
      Rules:
        - Id: DeleteIncompleteMultipartUploads
          Status: Enabled
          AbortIncompleteMultipartUpload:
            DaysAfterInitiation: 1
    CorsConfiguration:
      CorsRules:
        - AllowedOrigins:
            - !Sub "https://${AmplifyAppId}.amplifyapp.com"
          AllowedMethods: [GET, POST]
          AllowedHeaders: ["*"]
          ExposeHeaders: [ETag]
          MaxAge: 3000
```

Note: `PUT` is not needed in S3 CORS because the upload method for pre-signed POST policies is `POST` (multipart form). `PUT` is for pre-signed PUT URL uploads, which this design does not use.

### Lambda Functions

```yaml
Globals:
  Function:
    Runtime: nodejs24.x
    Architectures: [arm64]
    Environment:
      Variables:
        RESOURCES_TABLE: !Ref ResourcesTable
        REQUESTS_TABLE:  !Ref RequestsTable
        IMAGES_BUCKET:   !Ref ImagesBucket
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1"   # reuse HTTP keep-alive connections

ResourcesFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub "crr-resources-${AWS::StackName}"
    Handler: src/handlers/resources.handler
    MemorySize: 256
    Timeout: 10
    Role: !GetAtt ResourcesFunctionRole.Arn
    Events:
      GetResources:
        Type: HttpApi
        Properties:
          Path: /resources
          Method: GET
          ApiId: !Ref HttpApi
          Auth:
            Authorizer: NONE     # public
      GetResource:
        Type: HttpApi
        Properties:
          Path: /resources/{id}
          Method: GET
          ApiId: !Ref HttpApi
          Auth:
            Authorizer: NONE     # public
      PostResource:
        Type: HttpApi
        Properties:
          Path: /resources
          Method: POST
          ApiId: !Ref HttpApi
          # DefaultAuthorizer (CognitoAuthorizer) applies — no override needed
      PatchResource:
        Type: HttpApi
        Properties:
          Path: /resources/{id}
          Method: PATCH
          ApiId: !Ref HttpApi

RequestsFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub "crr-requests-${AWS::StackName}"
    Handler: src/handlers/requests.handler
    MemorySize: 256
    Timeout: 15
    Role: !GetAtt RequestsFunctionRole.Arn
    Events:
      PostRequest:
        Type: HttpApi
        Properties:
          Path: /resources/{id}/requests
          Method: POST
          ApiId: !Ref HttpApi
      GetMyRequests:
        Type: HttpApi
        Properties:
          Path: /requests/my
          Method: GET
          ApiId: !Ref HttpApi
      DecideRequest:
        Type: HttpApi
        Properties:
          Path: /requests/{id}/decision
          Method: POST
          ApiId: !Ref HttpApi

UploadsFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub "crr-uploads-${AWS::StackName}"
    Handler: src/handlers/uploads.handler
    MemorySize: 128
    Timeout: 5
    Role: !GetAtt UploadsFunctionRole.Arn
    Events:
      PostPresign:
        Type: HttpApi
        Properties:
          Path: /uploads/presign
          Method: POST
          ApiId: !Ref HttpApi

StatsFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub "crr-stats-${AWS::StackName}"
    Handler: src/handlers/stats.handler
    MemorySize: 128
    Timeout: 10
    Role: !GetAtt StatsFunctionRole.Arn
    Events:
      GetStats:
        Type: HttpApi
        Properties:
          Path: /stats
          Method: GET
          ApiId: !Ref HttpApi
          Auth:
            Authorizer: NONE

HealthFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub "crr-health-${AWS::StackName}"
    Handler: src/handlers/health.handler
    MemorySize: 128
    Timeout: 3
    Role: !GetAtt HealthFunctionRole.Arn
    Events:
      GetHealth:
        Type: HttpApi
        Properties:
          Path: /health
          Method: GET
          ApiId: !Ref HttpApi
          Auth:
            Authorizer: NONE
```

### CloudWatch Log Groups and Alarms

```yaml
# Explicit log groups with retention — prevents indefinite log accumulation
LogGroupResources:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/aws/lambda/${ResourcesFunction}"
    RetentionInDays: 7

LogGroupRequests:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/aws/lambda/${RequestsFunction}"
    RetentionInDays: 7

LogGroupUploads:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/aws/lambda/${UploadsFunction}"
    RetentionInDays: 7

LogGroupStats:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/aws/lambda/${StatsFunction}"
    RetentionInDays: 7

LogGroupHealth:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/aws/lambda/${HealthFunction}"
    RetentionInDays: 7

ApiErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub "campus-api-5xx-errors-${AWS::StackName}"
    MetricName: 5XXError
    Namespace: AWS/ApiGateway
    Statistic: Sum
    Period: 300
    Threshold: 5
    ComparisonOperator: GreaterThanOrEqualToThreshold
    EvaluationPeriods: 1
    TreatMissingData: notBreaching
    Dimensions:
      - Name: ApiId
        Value: !Ref HttpApi
```

---

## 5. IAM Roles — Separate, Least-Privilege Per Function

Each Lambda function has its own IAM execution role. No shared role is used. This limits blast radius if any single function is compromised.

```yaml
# Base policy document reused inline (DRY in practice via YAML anchors)

ResourcesFunctionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "crr-resources-role-${AWS::StackName}"
    AssumeRolePolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal: { Service: lambda.amazonaws.com }
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Policies:
      - PolicyName: DynamoDBResourcesAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:UpdateItem, dynamodb:Query]
              Resource:
                - !GetAtt ResourcesTable.Arn
                - !Sub "${ResourcesTable.Arn}/index/*"
      - PolicyName: S3GetObjectAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: s3:GetObject
              Resource: !Sub "${ImagesBucket.Arn}/*"
              # Generate pre-signed GET URLs only — no s3:PutObject

RequestsFunctionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "crr-requests-role-${AWS::StackName}"
    AssumeRolePolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal: { Service: lambda.amazonaws.com }
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Policies:
      - PolicyName: DynamoDBRequestsAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:UpdateItem,
                       dynamodb:DeleteItem, dynamodb:Query, dynamodb:BatchWriteItem,
                       dynamodb:TransactWriteItems]
              Resource:
                - !GetAtt ResourcesTable.Arn
                - !Sub "${ResourcesTable.Arn}/index/*"
                - !GetAtt RequestsTable.Arn
                - !Sub "${RequestsTable.Arn}/index/*"
              # requestsHandler needs both tables for TransactWrite

UploadsFunctionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "crr-uploads-role-${AWS::StackName}"
    AssumeRolePolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal: { Service: lambda.amazonaws.com }
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Policies:
      - PolicyName: S3PutObjectAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: s3:PutObject
              Resource: !Sub "${ImagesBucket.Arn}/users/*"
              # Scoped to users/ prefix only — not the entire bucket

StatsFunctionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "crr-stats-role-${AWS::StackName}"
    AssumeRolePolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal: { Service: lambda.amazonaws.com }
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Policies:
      - PolicyName: DynamoDBReadOnly
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: [dynamodb:Query, dynamodb:Scan]
              Resource:
                - !GetAtt ResourcesTable.Arn
                - !Sub "${ResourcesTable.Arn}/index/*"
                - !GetAtt RequestsTable.Arn
              # No PutItem, UpdateItem, DeleteItem, or TransactWrite

HealthFunctionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "crr-health-role-${AWS::StackName}"
    AssumeRolePolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal: { Service: lambda.amazonaws.com }
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    # No DynamoDB or S3 access — health check only
```

---

## 6. Deployment Dependencies

CloudFormation resolves the following logical order via `!Ref` and `!GetAtt`:

```
1. CampusUserPool
2. CampusUserPoolClient          → depends on CampusUserPool
3. ResourcesTable                → independent
4. RequestsTable                 → independent
5. ImagesBucket                  → independent
6. *FunctionRole (×5)            → depends on ResourcesTable, RequestsTable, ImagesBucket ARNs
7. HttpApi                       → independent (Cognito authorizer config references UserPool)
8. All Lambda functions          → depends on *FunctionRole ARNs and HttpApi
9. CloudWatch Log Groups         → depends on Lambda function names
10. CloudWatch Alarms            → depends on HttpApi
```

---

## 7. samconfig.toml

```toml
version = 0.1

[default.deploy.parameters]
stack_name        = "campus-resource-rescue"
region            = "ap-southeast-2"
confirm_changeset = true
capabilities      = "CAPABILITY_IAM CAPABILITY_AUTO_EXPAND CAPABILITY_NAMED_IAM"
# CAPABILITY_NAMED_IAM is required because the template creates named IAM roles.

parameter_overrides = "AmplifyAppId=YOUR_AMPLIFY_APP_ID"
# Replace YOUR_AMPLIFY_APP_ID with the actual Amplify App ID after the Amplify app is created.
# Example: AmplifyAppId=d1abc23def456
# For local dev, add: AmplifyAppId=d1abc23def456 DevOrigin=http://localhost:5173

resolve_s3        = true
# resolve_s3=true tells SAM CLI to automatically create and manage the S3 bucket
# for deployment artifacts. This replaces the previous placeholder s3_bucket value.
```

Deploy commands:
```powershell
sam build
sam deploy --guided    # first deploy — prompts for parameter values and saves to samconfig.toml
sam deploy             # subsequent deploys — uses saved config
```

---

## 8. Frontend Environment Variables

After deployment, these variables are set in the Amplify Console (Environment Variables section) and in `frontend/.env.local` for development. They must never be committed to git.

```
VITE_API_BASE_URL=https://{apiId}.execute-api.ap-southeast-2.amazonaws.com/v1
VITE_COGNITO_REGION=ap-southeast-2
VITE_COGNITO_USER_POOL_ID=ap-southeast-2_XXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

The `frontend/.env.example` already exists in the repository and should be updated to list these four keys. `VITE_S3_BUCKET` is not needed in the frontend — S3 keys are only referenced through the backend API.

---

## 9. Cost and Free Tier Analysis

### Corrections to the Previous Version

The previous document stated API Gateway HTTP API has a 12-month free tier. Per current AWS pricing (verified November 2026):

> "The Amazon API Gateway free tier includes one million API calls received for HTTP APIs … per month for **up to 12 months**."
> Starting **July 15, 2025**, new AWS customers receive **up to $200 in Free Tier credits** instead, valid for 12 months.

For accounts created before July 15, 2025: the 12-month free tier applies as previously documented.  
For accounts created on or after July 15, 2025: API Gateway costs come out of the $200 credit pool. At campus scale (~10,000 requests/month), the cost is ~$0.01/month — negligible.

### Always-Free Services (no time limit)

| Service | Free Allowance | Estimated Campus Usage | Assessment |
|---|---|---|---|
| **Cognito** | 50,000 MAUs/month | ~100–500 users | ✅ Zero cost |
| **DynamoDB** | 25 GB storage + on-demand free | < 100 MB data | ✅ Zero cost |
| **Lambda** | 1M requests + 400K GB-sec/month | < 50K requests/month | ✅ Zero cost |
| **CloudWatch Logs** | 5 GB ingestion/month | < 100 MB/month at 7-day retention | ✅ Zero cost |

### Time-Limited or Credit-Based

| Service | Free Allowance | Post-Free Cost | Risk |
|---|---|---|---|
| **API Gateway HTTP API** | 1M calls/month (12 months or $200 credit) | ~$1.00/million calls | Negligible at campus scale |
| **S3 Storage** | 5 GB (12 months) | $0.025/GB/month (ap-southeast-2) | Watch image accumulation |
| **S3 Requests** | 20,000 GETs, 2,000 PUTs (12 months) | $0.004/10K GETs, $0.005/1K PUTs | Low at campus scale |
| **Amplify Hosting** | 1,000 build mins, 5 GB storage, 15 GB served (12 months) | $0.01/build min, $0.023/GB stored | Low risk |

### Chargeable Items to Monitor

| Item | Risk | Mitigation |
|---|---|---|
| S3 image storage growth | Users upload large images over time | 5 MB limit via POST policy; `AbortIncompleteMultipartUpload` lifecycle rule (already in template) |
| CloudWatch log volume | Lambda errors producing large log entries | `RetentionInDays: 7` on all log groups (already in template) |
| DynamoDB lock item accumulation | PENDING requests that are never decided leave lock items | Acceptable at campus scale; add a TTL attribute to lock items in a later phase |
| API Gateway data transfer out | Large JSON responses | Paginate at 20 items; keep responses lean |

### Services Explicitly Excluded

- ❌ EC2 — not serverless, unnecessary cost
- ❌ RDS — not needed; DynamoDB is sufficient
- ❌ NAT Gateway — no VPC required for this serverless architecture
- ❌ OpenSearch / Elasticsearch — overengineered for campus scale
- ❌ EKS / Fargate / ECS — unnecessary complexity
- ❌ Cognito Advanced Security (AUDIT/ENFORCED mode) — extra cost, not needed

---

## 10. Amplify Hosting

The existing `amplify.yml` in the repository root handles CI/CD. No changes are needed to the frontend build configuration.

The Amplify app is provisioned separately from the SAM stack — through the Amplify Console or the Amplify CLI. After the Amplify app is created, its App ID is supplied to SAM as the `AmplifyAppId` parameter.

**Environment Variables** (set in Amplify Console under App Settings → Environment Variables):
- All four `VITE_*` variables listed in Section 8 above

---

## 11. Unresolved Decisions Requiring Approval

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Email verification UX** | (a) Add confirmation code step to RegisterPage after sign-up, (b) Use Cognito auto-confirm (no verification) | (a) — required for a real campus community |
| 2 | **Token persistence on page refresh** | (a) In-memory only (session lost on refresh), (b) Use `aws-amplify` default persistence (sessionStorage per Amplify v6 behaviour) | (b) — Amplify v6 manages this automatically; no manual sessionStorage code needed |
| 3 | **S3 orphaned image cleanup** | (a) Accept accumulation for now, (b) Add TTL attribute to lock items + S3 lifecycle to expire unreferenced keys | (a) for first implementation |
| 4 | **Local development CORS** | (a) Add `http://localhost:5173` to `AllowedOrigins` via a separate dev deployment, (b) Use a SAM local proxy | (a) — add `DevOrigin` parameter to template, default empty |
| 5 | **Custom domain** | (a) Use Amplify auto-generated URL, (b) Configure custom domain | User decision — requires a domain name |
| 6 | **PENDING_CLAIM timeout for GIVE_AWAY** | (a) No timeout — owner must manually confirm, (b) Auto-expire after N days via DynamoDB TTL | (a) for first implementation |
| 7 | **Lock item TTL** | Lock items for rejected/accepted requests are deleted. Orphaned locks (never decided) accumulate | Add a TTL attribute set to 30 days on lock items — clean, low-effort mitigation |
