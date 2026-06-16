# API Contract

## Transport

Google Apps Script exposes a Web App. New clients should use `POST` with JSON:

```json
{
  "action": "actionName",
  "requestId": "client-generated-idempotency-key",
  "payload": {}
}
```

`GET` is reserved for health checks and carefully scoped read-only legacy support.

Staff actions must include `sessionToken` at the top level of the request body, not inside `payload`:

```json
{
  "action": "staffActionName",
  "requestId": "client-generated-idempotency-key",
  "sessionToken": "staff-session-token",
  "payload": {}
}
```

## Standard Success

```json
{
  "status": "OK",
  "requestId": "same-request-id",
  "data": {},
  "warnings": []
}
```

## Standard Error

```json
{
  "status": "ERROR",
  "requestId": "same-request-id-if-known",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable safe message.",
    "details": {}
  }
}
```

## Error Codes

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | Payload is missing or invalid. |
| `AUTH_REQUIRED` | Staff session is missing or expired. |
| `FORBIDDEN` | Staff role lacks permission. |
| `TOKEN_INVALID` | Candidate token is missing, invalid, expired, revoked, or wrong purpose. |
| `NOT_FOUND` | Requested record does not exist. |
| `CONFLICT` | Duplicate, invalid state transition, or idempotency conflict. |
| `RATE_LIMITED` | Caller exceeded allowed attempts. |
| `INTEGRATION_ERROR` | Parser, Drive, Mail, or WhatsApp provider failed. |
| `SERVER_ERROR` | Unexpected backend failure. |

## Cross-Cutting Requirements

- Every mutating action validates payload, authenticates actor, checks permissions, checks state transition rules, writes data, and appends audit.
- Every mutating action accepts `requestId`.
- Responses never include token hashes, password hashes, integration secrets, or raw internal stack traces.
- Candidate responses are scoped to the participant linked to the token.
- Staff list endpoints support pagination.

## Candidate Actions

### `initConsent`

Creates or updates a consented participant and returns a continuation link.

Payload:

```json
{
  "name": "Ama Mensah",
  "phone": "0244000000",
  "email": "ama@example.com",
  "venue": "Accra",
  "language": "en",
  "program": "HAPPY Youth Employment",
  "signature": "data:image/png;base64,...",
  "accepted": true
}
```

Response data:

```json
{
  "participantId": "HAPPY-2026-000001",
  "continuationUrl": "https://example.github.io/happy-kollekt/?token=...",
  "tokenExpiresAt": "2026-06-25T00:00:00Z",
  "emailSent": true
}
```

### `getParticipantByToken`

Returns the token owner and allowed next actions.

Payload:

```json
{
  "token": "raw-token"
}
```

Response data:

```json
{
  "participant": {
    "participantId": "HAPPY-2026-000001",
    "currentStage": "participant_information",
    "allowedActions": ["saveParticipantInfo", "uploadCvMetadata"],
    "profile": {
      "program": "HAPPY Youth Employment",
      "consentName": "Ama Mensah",
      "consentPhone": "0244000000",
      "consentEmail": "ama@example.com",
      "surname": "Mensah",
      "firstName": "Ama",
      "otherNames": "",
      "telephone": "0244000000",
      "email": "ama@example.com"
    }
  }
}
```

When a participant opens the information section after consent, the backend must return consent-derived draft fields. The frontend should pre-fill name, phone, and email from this response. Consent fields remain stored separately so later corrections do not erase the original consent record.

`allowedActions` is computed from `currentStage` and token purpose. The canonical mapping is:

| `currentStage` | Candidate `allowedActions` |
| --- | --- |
| `participant_information` | `saveParticipantInfo`, `uploadCvMetadata` |
| `capacity_building` | `submitCapacityBuilding`, `uploadCvMetadata` |
| `cv_upload` | `uploadCvMetadata` |
| `cv_parsing` | *(none — awaiting system)* |
| `job_matching` and later | *(none — staff-driven stages)* |
| `withdrawn` | *(none)* |
| `archived` | *(none)* |

### `saveParticipantInfo`

Required auth: candidate token.

Effect:

- Creates or updates `Participant_Information`.
- Mirrors latest accepted fields to `Master`.
- Preserves original `consentName`, `consentPhone`, and `consentEmail`.
- Flags material mismatch between consent identity and submitted participant information.
- Runs duplicate and completeness checks.
- Transitions to `capacity_building` or `cv_upload` when complete.

### `submitCapacityBuilding`

Required auth: candidate token or staff permission.

Effect:

- Creates `Capacity_Building` record.
- Updates capacity status.
- Transitions to `cv_upload` when complete or not applicable.

### `uploadCvMetadata`

Required auth: candidate token.

Payload:

```json
{
  "token": "raw-token",
  "fileName": "ama-cv.pdf",
  "mimeType": "application/pdf",
  "fileSizeBytes": 300000,
  "driveFileId": "drive-file-id"
}
```

CV is optional during the early candidate journey. If no CV is available, the frontend should not block participant information submission. The backend should leave `cvStatus` as `not_started` or set it to `deferred` when a staff or candidate action explicitly records that the CV will come later.

### `staffUploadCvMetadata`

Required auth: staff session with `cv.upload`.

Used when staff later receives a participant CV and manually uploads it to storage and parser tracking.

Payload:

```json
{
  "participantId": "HAPPY-2026-000001",
  "fileName": "ama-cv.pdf",
  "mimeType": "application/pdf",
  "fileSizeBytes": 300000,
  "driveFileId": "drive-file-id",
  "uploadSource": "staff_manual_upload",
  "receivedVia": "email",
  "notes": "CV received after registration"
}
```

Response data:

```json
{
  "cvRecordId": "CV-2026-AB12CD34",
  "parserStatus": "queued",
  "participantId": "HAPPY-2026-000001"
}
```

## Staff Authentication Actions

### `staffLogin`

Payload:

```json
{
  "email": "staff@example.com",
  "password": "password"
}
```

Response data:

```json
{
  "sessionToken": "session-token",
  "expiresAt": "2026-06-11T18:00:00Z",
  "staff": {
    "email": "staff@example.com",
    "role": "Recruitment Team",
    "permissions": ["participants.read", "cv.review"]
  }
}
```

### `staffLogout`

Revokes a staff session.

### `staffRefreshSession`

Renews an active session before it expires. Must be called while the current session is still valid. The old session token is revoked immediately on renewal.

Pass the current `sessionToken` at the request top level. No payload fields are required.

Response data:

```json
{
  "sessionToken": "new-session-token",
  "expiresAt": "2026-06-11T18:00:00Z"
}
```

### `getCurrentStaffUser`

Returns the active staff profile and permissions.

## Staff Operations

| Action | Required permission | Notes |
| --- | --- | --- |
| `searchParticipants` | `participants.read` | Supports query, filters, limit, cursor. |
| `getParticipantDetail` | `participants.read` | Returns fields allowed for role. |
| `adminUpdateParticipant` | `participants.update` | Requires reason. |
| `transitionParticipantState` | varies | Backend validates transition and role. |
| `staffUploadCvMetadata` | `cv.upload` | Attach later-received CV to existing participant. |
| `createJobOpportunity` | `jobs.create` | Partnerships or IT Admin. |
| `runJobMatch` | `matching.run` | Recruitment or IT Admin. |
| `reviewJobMatch` | `matching.review` | Recruitment or IT Admin. |
| `recordPlacement` | `placements.create` | Recruitment, Partnerships, or IT Admin. |
| `recordOutcome` | `outcomes.create` | M&E, Youth Engagement, or IT Admin. |
| `runDataQualityScan` | `data_quality.read` | M&E or IT Admin. |
| `resolveDataQualityIssue` | `data_quality.resolve` | Depends on issue type. |
| `mergeDuplicateParticipants` | `participants.merge` | IT Admin only. Requires reason. |
| `archiveParticipant` | `participants.archive` | IT Admin only. Requires reason. Sets stage to `archived`. |
| `withdrawConsent` | `consent.withdraw` | IT Admin or Youth Engagement. Revokes tokens, stops messaging, sets stage to `withdrawn`. |
| `staffCreateContinuationToken` | `tokens.create` | IT Admin or Youth Engagement. Creates a new hashed token for an existing participant and returns a continuation URL. |
| `createParticipantByStaff` | `participants.create_staff` | IT Admin or Youth Engagement. Creates a participant record directly for paper form intake or bulk field data entry, bypassing the candidate consent flow. Requires consent evidence reference. |
| `updateJobOpportunity` | `jobs.update` | Partnerships or IT Admin. |
| `updatePlacement` | `placements.update` | Recruitment, Partnerships, IT Admin, or M&E (limited). |
| `getReport` | `reports.read` | Returns aggregated program metrics filtered by role and date range. |
| `exportReport` | `reports.export` | Exports report data as CSV. Audited. IT Admin and M&E only. |

## CV Parser Integration

### `queueCvParse`

Creates parser job metadata. If parser is unavailable, status remains `queued`.

### `receiveCvParserResult`

Required auth: integration secret or HMAC signature.

Payload:

```json
{
  "cvRecordId": "CV-2026-AB12CD34",
  "participantId": "HAPPY-2026-000001",
  "parserStatus": "parsed",
  "parsed": {
    "name": "Ama Mensah",
    "email": "ama@example.com",
    "phone": "0244000000",
    "skills": ["Customer service", "Excel"],
    "education": "Diploma",
    "experience": "2 years sales assistant",
    "jobCategory": "Administrative",
    "jobSubcategory": "Customer Service",
    "confidence": 0.82
  }
}
```

## Health and Config

- `healthCheck`: returns backend version, environment, and sheet availability.

### `getSystemConfig`

No payload required. Returns public-safe settings the frontend needs at startup.

Response data:

```json
{
  "backendVersion": "2026.06.11-foundation",
  "environment": "production",
  "candidateFrontendUrl": "https://org.github.io/happy-kollekt/",
  "maxCvFileSizeMb": 10,
  "allowedCvMimeTypes": [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ],
  "candidateTokenDays": 14,
  "cvTokenDays": 7,
  "features": {
    "enableCapacityBuilding": true,
    "enableCvUpload": true,
    "enableParserIntegration": false,
    "enableWhatsApp": false
  }
}
```

## Idempotency

Apps Script stores `requestId`, `action`, `actor`, `participantId`, request hash, and result status in `Idempotency_Log` or cache. Repeated identical requests return the original result. Reused request IDs with different bodies return `CONFLICT`.
