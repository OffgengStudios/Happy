# State Machine

## Purpose

The state machine defines valid participant lifecycle progression. Apps Script must validate all state transitions before changing `Master.currentStage` or section status fields.

## Stages

| Stage | Description | Primary owner |
| --- | --- | --- |
| `consent` | Consent is pending or being captured. | Candidate / Youth Engagement |
| `participant_information` | Core participant data is being collected. | Candidate / Youth Engagement |
| `capacity_building` | Optional training details are collected or skipped. | Youth Engagement / M&E |
| `cv_upload` | Participant may provide a CV now, skip for later, or be supported by staff upload. | Candidate / Recruitment |
| `cv_parsing` | CV is queued, parsed, failed, or under review. | System / Recruitment |
| `job_matching` | Participant is eligible for job opportunity matching. | Recruitment / Partnerships |
| `job_placement` | Participant is shortlisted, placed, or placement is in progress. | Recruitment / Partnerships |
| `outcome_tracking` | Follow-up outcomes are due or being tracked. | M&E / Youth Engagement |
| `completed` | Required lifecycle is complete for current program. | M&E |
| `withdrawn` | Participant opted out or withdrew consent. | Youth Engagement / IT Admin |
| `archived` | Record is retained but inactive. | IT Admin |

## Section Status Values

- `not_started`
- `in_progress`
- `complete`
- `not_applicable`
- `needs_review`
- `failed`

Some sections use additional domain statuses, such as `queued`, `parsing`, `parsed`, `placed`, `overdue`, or `withdrawn`.

## Allowed Transitions

| From | To | Trigger |
| --- | --- | --- |
| `consent` | `participant_information` | Consent accepted and participant created. |
| `participant_information` | `capacity_building` | Participant information complete and capacity building applies. |
| `participant_information` | `cv_upload` | Participant information complete and capacity building is skipped or not applicable. CV may still be pending. |
| `capacity_building` | `cv_upload` | Capacity building complete or not applicable. |
| `cv_upload` | `cv_parsing` | Valid CV file metadata recorded. |
| `cv_upload` | `job_matching` | Staff marks participant eligible for non-CV/manual matching or CV is deferred. |
| `cv_parsing` | `cv_upload` | Parser failed and replacement CV requested. |
| `cv_parsing` | `job_matching` | CV parsed or manually reviewed. |
| `job_matching` | `job_placement` | Match reviewed, shortlisted, selected, or placement started. |
| `job_placement` | `outcome_tracking` | Placement record created. |
| `outcome_tracking` | `completed` | Required follow-up complete. |
| any active stage | `withdrawn` | Participant opts out or consent is withdrawn. |
| any non-active stage | `archived` | IT Admin archives record. |

## Guard Rules

### Consent to Participant Information

Required:

- Consent accepted.
- Name or phone present.
- `participantId` exists.
- Consent record saved.
- Name, phone, and email prefill values are available for the participant information section where present.
- Continuation token created.
- Audit event written.

### Participant Information to Next Stage

Required:

- Required profile fields complete.
- No unresolved blocking duplicate issue.
- `participantInfoStatus = complete`.

### Capacity Building to CV Upload

Required:

- `capacityBuildingStatus = complete` or `not_applicable`.

### CV Upload to CV Parsing

Required:

- File type accepted.
- File size accepted.
- Drive file ID stored.
- `CV_Records` row created.

CV is optional at the start of the journey. If the participant does not have a CV during registration, the backend should keep `cvStatus = not_started` or `deferred` and allow the participant to continue where program rules permit. When the CV is later received by staff through email, WhatsApp, field collection, or another channel, Recruitment or Youth Engagement can manually upload it to the CV parser and attach it to the existing `participantId`.

### CV Upload to Job Matching Without CV

Required:

- Staff marks CV as deferred, unavailable, or not required for the current opportunity.
- Reason is recorded.
- Participant has enough profile data for manual matching.
- Audit event is written.

### CV Parsing to Job Matching

Required:

- Parser result accepted or manual review completed.
- `cvStatus = parsed`, `reviewed`, or `deferred`.
- Job category exists from parser, participant profile, or staff override.

### Job Matching to Placement

Required:

- Match decision or manual placement reason exists.
- Recruitment or Partnerships action is audited.

### Placement to Outcome Tracking

Required:

- Placement record exists.
- Employer or partner exists.
- Placement start date exists.

### Outcome Tracking to Completed

Required:

- Required outcome fields complete.
- M&E review complete where configured.

### Any Active Stage to Withdrawn

Required:

- Initiating actor is candidate via valid token or staff with `consent.withdraw`.
- Reason is recorded when staff-initiated.
- All `Token_Index` rows for the participant are set to `revoked`.
- WhatsApp reminders are stopped.
- `currentStage = withdrawn`, `overallStatus = withdrawn`.
- Consent and audit history are preserved.
- Audit event written.

### Any Non-Active Stage to Archived

Required:

- Participant is in `completed` or `withdrawn` stage.
- Initiating actor is IT Admin with `participants.archive`.
- Reason is recorded.
- Participant has no open blocking data quality issues that require action before archiving.
- `currentStage = archived`, `overallStatus = archived`.
- Audit event written.

## Corrections

Corrections should not automatically rewind `currentStage`. If an earlier correction invalidates later work:

- Keep current stage when possible.
- Mark affected downstream status as `needs_review`.
- Create audit event with reason.
- Add issue to responsible team queue.

## Duplicate Handling

Potential duplicate:

- Create `Data_Quality_Issues` record.
- Block transition to `job_matching` when severity is high or critical.

Confirmed duplicate:

- Select surviving `participantId`.
- Move or reference child records under surviving participant.
- Mark losing record `overallStatus = duplicate`.
- Write `Merge_History`.
- Audit merge.

## Acceptance Criteria

- Invalid transition returns `CONFLICT`.
- Every transition writes audit.
- Only backend changes lifecycle state.
- Staff-triggered transitions check role permissions.
- Candidate-triggered transitions check token purpose and participant scope.
