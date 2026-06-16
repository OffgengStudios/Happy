# Data Model

## Rules

- `participantId` is the primary identifier for every participant-owned record.
- `Master` stores the latest lifecycle summary; child tabs store detailed operational records.
- Store display values and normalized lookup values separately.
- Store files in Google Drive and file metadata in Sheets.
- Store raw candidate tokens only in the response that creates them; persist hashes only.
- Every mutable tab should include `createdAt`, `createdBy`, `lastUpdatedAt`, and `lastUpdatedBy`.

## Identifier Standards

| Identifier | Format | Notes |
| --- | --- | --- |
| `participantId` | `HAPPY-YYYY-000001` | One per person, never reused. |
| `consentSubmissionId` | `CONSENT-YYYY-XXXXXXXX` | One per consent submission. |
| `tokenId` | UUID | Stored with token hash and purpose. |
| `cvRecordId` | `CV-YYYY-XXXXXXXX` | One per CV upload or parser attempt. |
| `jobOpportunityId` | `JOB-YYYY-XXXXXXXX` | One employer opportunity. |
| `matchId` | `MATCH-YYYY-XXXXXXXX` | One match recommendation or decision. |
| `placementId` | `PLACE-YYYY-XXXXXXXX` | One placement record. |
| `outcomeId` | `OUTCOME-YYYY-XXXXXXXX` | One follow-up outcome. |
| `auditId` | UUID | One audit event. |
| `issueId` | `DQ-YYYY-XXXXXXXX` | One data quality issue. |

## `Master`

One row per participant.

Required columns:

- `participantId`
- `currentStage`
- `overallStatus` (`active`, `withdrawn`, `duplicate`, `archived`, `completed`)
- `consentStatus`
- `participantInfoStatus`
- `capacityBuildingStatus`
- `cvStatus`
- `matchingStatus`
- `placementStatus`
- `outcomeStatus`
- `consentSubmissionId`
- `consentSubmittedAt`
- `consentName`
- `consentPhone`
- `consentEmail`
- `program`
- `surname`
- `firstName`
- `otherNames`
- `sex`
- `dob`
- `ageAtRegistration`
- `telephone`
- `participantPhoneNormalized`
- `email`
- `participantEmailNormalized`
- `ghanaCardId`
- `ghanaCardNormalized`
- `region`
- `district`
- `community`
- `implementingPartner`
- `educationLevel`
- `employmentStatus`
- `currentOccupation`
- `cvFileId`
- `cvFileUrl`
- `parserCategory`
- `parserSubcategory`
- `parserConfidence`
- `assignedTeam`
- `assignedStaffEmail`
- `adminNotes`
- `createdAt`
- `createdBy`
- `lastUpdatedAt`
- `lastUpdatedBy`

Consent values are immutable evidence fields. Participant information fields are editable profile fields. When serving `getParticipantByToken`, the backend derives pre-fill values from `Consents` at read time — not from stored columns in `Master`:

- `consentName` -> draft `surname`, `firstName`, `otherNames`
- `consentPhone` -> draft `telephone`
- `consentEmail` -> draft `email`

The submitted `surname`, `firstName`, `otherNames`, `telephone`, and `email` may differ from the pre-fill values. Material differences should be audited and may create data quality issues, but corrections should not overwrite the original consent values.

`cvFileId` and `cvFileUrl` mirror the most recent `CV_Records` row where `uploadStatus` is `complete` or `reviewStatus` is `reviewed`, whichever is latest. When a participant has multiple CV records, these fields always reflect the current active CV.

## `Consents`

Consent evidence. It may live in a separate workbook during migration, but every row must include or resolve to `participantId`.

Columns:

- `consentSubmissionId`
- `participantId`
- `timestamp`
- `venue`
- `participantName`
- `phone`
- `email`
- `accepted`
- `language`
- `program`
- `signatureFileId`
- `signatureFileUrl`
- `createdAt`

## `Participant_Information`

Detailed participant registration.

Columns:

- `participantInfoSubmissionId`
- `participantId`
- `submissionSource`
- `submissionStatus`
- `onboardingDate`
- `implementingPartner`
- `region`
- `district`
- `community`
- `locationStatus`
- `surname`
- `firstName`
- `otherNames`
- `sex`
- `dob`
- `ageAtRegistration`
- `participantTypeAge`
- `telephone`
- `email`
- `idType`
- `ghanaCardId`
- `voterId`
- `refugeeStatus`
- `nationality`
- `displacementStatus`
- `displacementReason`
- `originalCommunity`
- `hostCommunity`
- `disabilityStatus`
- `disabilitySpecify`
- `educationLevel`
- `employmentStatus`
- `currentOccupation`
- `monthlyIncome`
- `incomeFrequency`
- `sector`
- `industry`
- `jobType`
- `jobRole`
- `workRegion`
- `workDistrict`
- `workCommunity`
- `createdAt`
- `createdBy`
- `lastUpdatedAt`
- `lastUpdatedBy`

## `Capacity_Building`

Optional training records.

Columns:

- `capacityRecordId`
- `participantId`
- `submissionId`
- `trainedByPartner`
- `trainingStartDate`
- `trainingEndDate`
- `trainingLocation`
- `trainingMode`
- `virtualPlatform`
- `trainerType`
- `trainingPartner`
- `completionStatus`
- `certificateIssued`
- `modules`
- `digitalSkills`
- `wishTraining`
- `previousTrainings`
- `previousTrainingDesc`
- `createdAt`
- `createdBy`

## `CV_Records`

CV upload, parser, and review records.

Columns:

- `cvRecordId`
- `participantId`
- `uploadSource`
- `uploadedByRole`
- `uploadedByActor`
- `originalFileName`
- `fileMimeType`
- `fileSizeBytes`
- `driveFileId`
- `driveFileUrl`
- `uploadStatus`
- `parserStatus`
- `parsedName`
- `parsedEmail`
- `parsedPhone`
- `parsedSkills`
- `parsedEducation`
- `parsedExperience`
- `jobCategory`
- `jobSubcategory`
- `confidence`
- `parserVersion`
- `errorCode`
- `errorMessage`
- `reviewStatus`
- `reviewedBy`
- `reviewedAt`
- `deferredReason`
- `createdAt`
- `createdBy`

`uploadSource` values should include `candidate_frontend`, `staff_manual_upload`, `whatsapp`, `email_received`, and `legacy_import`. This allows CV to be optional during initial candidate registration while still supporting later staff upload into the parser for storage and tracking.

## `Job_Opportunities`

Employer opportunities used for matching and placement.

Columns:

- `jobOpportunityId`
- `employerName`
- `sector`
- `industry`
- `jobType`
- `jobRole`
- `employmentType`
- `employmentCategory`
- `region`
- `district`
- `community`
- `requiredSkills`
- `description`
- `openings`
- `status`
- `createdAt`
- `createdBy`
- `lastUpdatedAt`
- `lastUpdatedBy`

## `Job_Matches`

Matching recommendations and decisions.

Columns:

- `matchId`
- `participantId`
- `jobOpportunityId`
- `matchSource`
- `matchScore`
- `matchedSkills`
- `missingSkills`
- `recommendation`
- `decisionStatus`
- `decisionBy`
- `decisionAt`
- `notes`
- `createdAt`
- `createdBy`

## `Job_Placement`

Placement records.

Columns:

- `placementId`
- `participantId`
- `jobOpportunityId`
- `employerName`
- `placedByPartner`
- `placementStartDate`
- `placementRegion`
- `placementDistrict`
- `placementCommunity`
- `sector`
- `industry`
- `jobType`
- `jobRole`
- `employmentType`
- `employmentCategory`
- `placementIncome`
- `placementIncomeFreq`
- `contractType`
- `workHours`
- `placementStatus`
- `createdAt`
- `createdBy`
- `lastUpdatedAt`
- `lastUpdatedBy`

## `Outcome_Tracking`

Follow-up records after placement.

Columns:

- `outcomeId`
- `participantId`
- `placementId`
- `followUpDate`
- `followUpType`
- `currentlyEmployed`
- `currentEmployer`
- `currentJobRole`
- `currentIncome`
- `incomeFrequency`
- `retentionStatus`
- `reasonForExit`
- `participantFeedback`
- `employerFeedback`
- `nextFollowUpDate`
- `createdAt`
- `createdBy`

For `Audit_Log` column definitions see `EVENT_LOGGING_SPEC.md`. For `Data_Quality_Issues` column definitions see `DATA_QUALITY_RULES.md`.

## Security and Operations Tabs

### `Staff_Users`

- `staffUserId`
- `email`
- `displayName`
- `role`
- `status`
- `passwordHash` or `authProviderSubject`
- `lastLoginAt`
- `failedLoginCount`
- `createdAt`
- `createdBy`
- `lastUpdatedAt`
- `lastUpdatedBy`

### `Token_Index`

- `tokenId`
- `participantId`
- `tokenHash`
- `purpose`
- `status`
- `createdAt`
- `expiresAt`
- `lastUsedAt`
- `revokedAt`
- `revokedReason`

`purpose` values: `registration`, `cv_upload`, `whatsapp_continuation`, `one_time_action`.

`status` values: `active`, `used`, `expired`, `revoked`.

### `Merge_History`

- `mergeId`
- `survivingParticipantId`
- `mergedParticipantId`
- `reason`
- `mergedBy`
- `mergedAt`
- `fieldSummaryJson`

### `Idempotency_Log`

- `requestId`
- `action`
- `actorId`
- `participantId`
- `requestHash`
- `resultStatus`
- `resultDataJson`
- `createdAt`
- `ttlExpiresAt`

Rows should be purged when `ttlExpiresAt` has passed. A nightly cleanup job removes expired rows to prevent unbounded table growth.

### `System_Config`

- `key`
- `value`
- `description`
- `updatedAt`
- `updatedBy`

One row per configuration key. Key names match those listed in `SYSTEM_CONFIG.md`. Secrets must never be stored here; use Apps Script `PropertiesService` for secrets. The `key` column should be unique and the header row protected from manual edits.

## Normalization

- Phone: keep display value and a normalized digits-only lookup value.
- Email: lowercase and trim for normalized lookup.
- Ghana Card: uppercase and remove extra spaces.
- Names: trim spaces and normalize repeated whitespace; do not erase meaningful spelling.
- Dates: ISO date or datetime.
- Multi-select values: pipe-separated unless a child tab is justified.

## Relationships

```text
Master 1 -- many Participant_Information
Master 1 -- many Capacity_Building
Master 1 -- many CV_Records
Master 1 -- many Job_Matches
Master 1 -- many Job_Placement
Job_Placement 1 -- many Outcome_Tracking
Master 1 -- many Token_Index
Master 1 -- many Audit_Log
Master 1 -- many Data_Quality_Issues
Master 1 -- many Merge_History
```
