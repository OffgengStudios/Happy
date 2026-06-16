# Data Quality Rules

## Purpose

The data quality engine detects duplicates, missing information, invalid values, inconsistent lifecycle states, and integration mismatches. It creates issues for review; it does not silently delete participant data.

## `Data_Quality_Issues` Schema

- `issueId`
- `participantId`
- `relatedParticipantId`
- `issueType`
- `severity`
- `status`
- `fieldName`
- `currentValue`
- `expectedValue`
- `confidence`
- `detectedAt`
- `detectedBy`
- `assignedRole`
- `resolution`
- `resolvedBy`
- `resolvedAt`
- `notes`

Severity:

- `critical`: blocks progression.
- `high`: likely duplicate or operational failure.
- `medium`: needs review.
- `low`: cleanup or reporting quality.

Status:

- `open`
- `in_review`
- `resolved`
- `dismissed`
- `merged`

## Duplicate Rules

| Rule | Severity | Blocks |
| --- | --- | --- |
| Same normalized Ghana Card on two active participants | critical | All downstream transitions |
| Same normalized phone and overlapping name | high | Job matching |
| Same normalized email and overlapping name | high | Job matching |
| Same phone but very different name | medium | No |
| Same normalized full name, DOB, and district | high | Placement |
| Parser extracted phone/email matches another participant | high | Parser acceptance |

Name overlap should compare normalized name tokens while preserving original spelling.

## Missing Required Fields

Consent:

- `participantId`
- `consentStatus`
- `consentSubmittedAt`
- `consentName` or `consentPhone`
- `accepted`

Participant information:

- `surname`
- `firstName`
- `sex`
- `telephone`
- `region`
- `district`
- `educationLevel`
- `employmentStatus`

CV:

- `cvRecordId`
- `participantId`
- `driveFileId`
- `originalFileName`
- `fileMimeType`
- `uploadStatus`

Placement:

- `participantId`
- `employerName` or `placedByPartner`
- `placementStartDate`
- `jobRole`
- `employmentType`
- `placementStatus`

Outcome:

- `participantId`
- `placementId`
- `followUpDate`
- `currentlyEmployed`
- `retentionStatus`

## Format Rules

| Field | Rule |
| --- | --- |
| `participantId` | Must match `participantIdPattern` from `System_Config` (default `^HAPPY-[0-9]{4}-[0-9]{6}$`). |
| `email` | Must normalize to a plausible email with no spaces. |
| `telephone` | Must normalize to a valid configured phone format. |
| `ghanaCardId` | Must match `ghanaCardPattern` from `System_Config` (default `^GHA-[0-9]{9}-[0-9]$`) when `idType` is Ghana Card. |
| Date fields | Must be valid ISO date or datetime and not impossible. |
| `ageAtRegistration` | Must be plausible for program eligibility at time of registration. |
| `parserConfidence` | Must be between 0 and 1. |
| Income fields | Must be numeric when present. |

## State Consistency Rules

- `job_matching` requires participant information complete and CV parsed or reviewed.
- `job_placement` requires match decision or manual placement reason.
- `outcome_tracking` requires placement record.
- `cvStatus = parsed` requires parser success or manual review.
- `placementStatus = placed` requires placement date and employer or partner.
- `overallStatus = withdrawn` requires active tokens revoked.
- `overallStatus = duplicate` requires merge history.

## Referential Integrity Rules

- Every child row references an existing or historical `participantId`.
- Every outcome references a placement.
- Every job match references a participant and, where used, a job opportunity.
- Every participant-scoped audit event references `participantId`.

## Parser Quality Rules

- Parsed name conflicts with registered name and has no token overlap: `medium`.
- Parsed email conflicts with registered email: `medium`.
- Parsed phone matches another participant: `high`.
- Parser confidence below threshold: mark CV `needs_review`.
- Unsupported or unreadable CV: create issue and request replacement.

## Consent-to-Registration Consistency Rules

- Consent phone differs from submitted telephone after normalization: `medium`.
- Consent email differs from submitted email after normalization: `low` if both are valid, `medium` if one appears invalid.
- Consent name and submitted registration name have no meaningful token overlap: `medium`.
- Consent name is incomplete and participant information adds missing names: no issue; audit as normal profile completion.
- Participant corrects spelling, ordering, or capitalization of consent name: no issue unless identity appears different.

## Scheduled Checks

- Lightweight duplicate scan: hourly.
- Full quality scan: nightly.
- Parser reconciliation: hourly.
- Outcome due/overdue scan: daily.
- Staff user access review: weekly.

All scans that iterate `Master` or child tabs must use a batch cursor to stay within the Apps Script 6-minute execution limit. Cursor state (last processed row offset or `participantId`) is stored in `System_Config` under a key such as `dqScanCursor`. On each trigger firing, the job reads the cursor, processes the next batch (configurable, default 250 rows), persists the updated cursor, then exits. A full scan completion resets the cursor. If a job errors mid-batch, the cursor retains the last committed position so the next run resumes rather than restarts.

## Resolution Actions

- `fix_field`: authorized staff corrects value.
- `merge_duplicate`: IT Admin merges participants.
- `mark_not_duplicate`: staff dismisses duplicate with reason.
- `request_update`: Youth Engagement asks participant for missing data.
- `accept_exception`: M&E accepts reporting exception.

## Issue Fingerprinting

To prevent duplicate issues from repeated scans, each check must compute a fingerprint before creating a new `Data_Quality_Issues` row. A fingerprint is a hash of `participantId + issueType + fieldName + relatedParticipantId` (use empty string for absent fields). If an `open` or `in_review` row with the same fingerprint already exists, the scan skips creation and may update `detectedAt` only. Resolved or dismissed issues may produce a new row if the condition reappears.

## Acceptance Criteria

- Checks are idempotent and do not create endless duplicate issues.
- Blocking issues prevent configured transitions.
- Every resolution is audited.
- No data quality rule deletes participant data automatically.
