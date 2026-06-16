# User Journey

## Candidate Journey

Candidates do not create accounts. They use secure continuation links.

### 1. Consent

Entry points:

- Field officer shares consent link.
- Staff sends or resends a secure link.
- Future WhatsApp message provides a continuation link.

Candidate actions:

- Reviews consent language.
- Provides name, phone, optional email, venue, language, and signature.
- Accepts participation.

System actions:

- Creates or finds participant by normalized identity fields.
- Generates `participantId`.
- Saves consent record and signature.
- Creates hashed continuation token.
- Sends continuation link if email or messaging channel exists.
- Writes audit event.

### 2. Participant Information

Candidate actions:

- Opens secure link.
- Completes demographic, contact, location, education, and employment fields.
- Saves or submits.

System actions:

- Validates token.
- Pre-fills name and phone details from consent.
- Saves data through Apps Script.
- Mirrors latest values to `Master`.
- Runs duplicate and completeness checks.
- Moves participant to capacity building or CV upload.

Pre-fill behavior:

- `consentName` is split into `surname`, `firstName`, and `otherNames` as a best-effort draft.
- `consentPhone` pre-fills `telephone`.
- `consentEmail` pre-fills `email` when present.
- The participant may correct these fields before submission.
- If submitted registration name or phone differs materially from consent, the backend saves the corrected values, keeps the original consent values, and creates a data quality or audit note for review.

### 3. Capacity Building

This stage is optional.

Paths:

- Candidate or staff records completed training.
- Staff marks not applicable.
- Candidate skips if configured.

System actions:

- Stores capacity building record.
- Updates status.
- Moves participant to CV upload.

### 4. CV Upload

Candidate actions:

- Uploads PDF or DOCX CV.
- Requests support if no CV is available.
- Continues without a CV when the program allows CV collection later.

System actions:

- If CV is uploaded now, validates file type and size.
- Stores uploaded file in Drive.
- Creates `CV_Records` row.
- Queues parser job.
- Moves participant to CV parsing.
- If CV is not uploaded now, marks CV as `deferred` or `not_started` and keeps the participant available for later follow-up.

Staff later actions:

- Receives CV by email, WhatsApp, field collection, or another channel.
- Finds the existing participant by `participantId`, phone, email, or name.
- Manually uploads the CV to the parser for storage, parsing, and tracking.
- Reviews parser output and resolves any identity mismatch before matching.

### 5. CV Parsing

System actions:

- Parser extracts contact, skills, education, experience, and job category.
- Parser writes result back with `participantId` and `cvRecordId`.
- Low-confidence or conflicting results are marked for review.

Recruitment actions:

- Manually uploads later-received CVs for existing participants.
- Reviews parsed CV.
- Corrects category, skills, or contact conflicts.
- Approves participant for matching.

### 6. Job Matching

Recruitment actions:

- Runs matching against opportunities.
- Reviews recommendations.
- Shortlists or rejects with reason.

Partnerships actions:

- Maintains job opportunity and employer information.
- Supports placement readiness.

System actions:

- Stores match score, matched skills, and decisions.
- Updates matching status.

### 7. Job Placement

Staff actions:

- Records employer, role, start date, employment type, income, and placement status.

System actions:

- Creates placement record.
- Updates lifecycle to outcome tracking.
- Schedules follow-up.

### 8. Outcome Tracking

M&E or Youth Engagement actions:

- Follows up with participant.
- Records retention, current employment, income, feedback, and next follow-up.

System actions:

- Marks follow-ups due, complete, or overdue.
- Updates reporting fields.
- Moves participant to completed when criteria are met.

## Staff Journeys

IT Admin:

- Manage users, roles, configuration, schema, deployments, integrations, and duplicate merges.

M&E:

- Review completeness, outcomes, data quality issues, and approved reports.

Partnerships:

- Manage employers and opportunities, support placement details.

Recruitment:

- Review CVs, run matching, shortlist candidates, and record recruitment outcomes.

Youth Engagement:

- Support consent, registration, continuation links, reminders, capacity building, and follow-up.

## Incomplete Journey Recovery

- Candidate reopens valid secure link.
- Youth Engagement resends a fresh token.
- WhatsApp sends a short-lived continuation link.
- Staff dashboards show incomplete participants by stage and owner.

## Candidate Experience Requirements

- No login.
- Mobile-first forms.
- Clear progress.
- Friendly validation and error messages.
- Secure save/resume through token.
- CV upload status feedback.

## Staff Experience Requirements

- Staff login required.
- Role-specific queues.
- Search and filters by stage, region, status, and issue type.
- Reason prompts for high-impact changes.
- Audited exports.
