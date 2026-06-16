# Event Logging Specification

## Purpose

Audit logging provides traceability for lifecycle changes, staff actions, security events, integrations, data quality decisions, and operational corrections.

## `Audit_Log` Schema

| Column | Required | Notes |
| --- | --- | --- |
| `auditId` | yes | UUID. |
| `timestamp` | yes | ISO timestamp. |
| `requestId` | no | Request correlation or idempotency key. |
| `participantId` | no | Required for participant-scoped actions. |
| `actorType` | yes | `candidate`, `staff`, `system`, `integration`. |
| `actorId` | yes | Participant ID, staff email, system name, or integration name. |
| `actorRole` | no | Staff role when applicable. |
| `action` | yes | Stable action name. |
| `entityType` | yes | `participant`, `cv`, `placement`, `token`, etc. |
| `entityId` | no | Record identifier. |
| `status` | yes | `success`, `failed`, `blocked`. |
| `beforeHash` | no | Hash of selected before values for sensitive changes. |
| `afterHash` | no | Hash of selected after values for sensitive changes. |
| `summary` | no | Short human-readable note. |
| `metadataJson` | no | Compact non-secret JSON. |
| `ipAddress` | no | If available. |
| `userAgent` | no | If available. |

## Logging Rules

- Logs are append-only.
- Do not log raw tokens, passwords, full CV text, secrets, or large request bodies.
- Log failed authorization and integration attempts.
- Log scheduled job start, completion, and failure.
- For sensitive changes, log changed fields and hashes instead of full values when possible.

## Required Action Names

Candidate actions:

- `candidate.consent_submitted`
- `candidate.consent_withdrawn`
- `candidate.token_used`
- `candidate.token_expired`
- `candidate.token_revoked`
- `token.created`
- `candidate.profile_started`
- `candidate.profile_saved`
- `candidate.profile_submitted`
- `candidate.capacity_submitted`
- `candidate.cv_uploaded`

Staff authentication:

- `staff.login_success`
- `staff.login_failed`
- `staff.logout`
- `staff.session_expired`
- `staff.session_refreshed`
- `staff.user_created`
- `staff.user_disabled`
- `staff.role_changed`
- `staff.password_reset`

Participant operations:

- `participant.created`
- `participant.updated`
- `participant.state_transitioned`
- `participant.withdrawn`
- `participant.duplicate_flagged`
- `participant.merged`
- `participant.archived`
- `participant.exported`
- `participant.sensitive_viewed`

CV and matching:

- `cv.uploaded`
- `cv.parse_queued`
- `cv.parse_started`
- `cv.parse_completed`
- `cv.parse_failed`
- `cv.reviewed`
- `match.run`
- `match.reviewed`
- `match.shortlisted`
- `match.rejected`

Placement and outcomes:

- `placement.created`
- `placement.updated`
- `placement.ended`
- `outcome.created`
- `outcome.updated`
- `outcome.followup_due`
- `outcome.followup_overdue`

Data quality:

- `data_quality.scan_started`
- `data_quality.scan_completed`
- `data_quality.issue_created`
- `data_quality.issue_resolved`
- `data_quality.issue_dismissed`

Integrations:

- `integration.cv_parser_callback_received`
- `integration.cv_parser_callback_rejected`
- `integration.whatsapp_webhook_received`
- `integration.whatsapp_message_sent`
- `integration.whatsapp_message_failed`

System:

- `system.config_updated`
- `system.schema_bootstrapped`
- `system.deployment_checked`
- `system.error`

## Metadata Examples

State transition:

```json
{
  "fromStage": "cv_parsing",
  "toStage": "job_matching",
  "reason": "CV parser result reviewed",
  "changedFields": ["currentStage", "cvStatus", "matchingStatus"]
}
```

Duplicate issue:

```json
{
  "issueId": "DQ-2026-AB12CD34",
  "rule": "same_phone_overlapping_name",
  "relatedParticipantId": "HAPPY-2026-000002",
  "confidence": 0.91
}
```

Parser callback:

```json
{
  "cvRecordId": "CV-2026-AB12CD34",
  "parserStatus": "parsed",
  "parserVersion": "v1",
  "confidence": 0.82
}
```

## Retention

- Keep consent, security, merge, placement, and outcome audit events for the full program retention period.
- Archive old logs to locked files or archival sheets if workbook performance degrades.
- Do not purge logs without an approved retention policy.

## Review Cadence

- IT Admin reviews auth failures, integration rejections, and system errors weekly.
- M&E reviews data quality outcomes weekly.
- Team leads review placement and outcome edit logs monthly.

## Acceptance Criteria

- Every mutating route logs success or failure.
- Every state transition has an audit event.
- Every staff role change is auditable.
- Every duplicate merge is reconstructable from audit and merge history.
