# Role Permissions

## Roles

- IT Admin
- Monitoring & Evaluation (M&E)
- Partnerships Team
- Recruitment Team
- Youth Engagement Team

## Permission Matrix

| Permission | IT Admin | M&E | Partnerships | Recruitment | Youth Engagement |
| --- | --- | --- | --- | --- | --- |
| `participants.read` | yes | yes | limited | yes | yes |
| `participants.create_staff` | yes | no | no | no | yes |
| `participants.update` | yes | limited | no | limited | limited |
| `participants.merge` | yes | no | no | no | no |
| `participants.archive` | yes | no | no | no | no |
| `consent.read` | yes | yes | no | limited | yes |
| `consent.withdraw` | yes | no | no | no | yes |
| `tokens.create` | yes | no | no | no | yes |
| `tokens.revoke` | yes | no | no | no | limited |
| `capacity.read` | yes | yes | no | limited | yes |
| `capacity.update` | yes | yes | no | no | yes |
| `cv.read` | yes | limited | no | yes | limited |
| `cv.upload` | yes | no | no | yes | yes |
| `cv.review` | yes | no | no | yes | no |
| `cv.export` | yes | no | no | yes | no |
| `jobs.read` | yes | yes | yes | yes | limited |
| `jobs.create` | yes | no | yes | limited | no |
| `jobs.update` | yes | no | yes | limited | no |
| `matching.run` | yes | no | limited | yes | no |
| `matching.review` | yes | no | limited | yes | no |
| `placements.read` | yes | yes | yes | yes | limited |
| `placements.create` | yes | no | yes | yes | no |
| `placements.update` | yes | limited | yes | yes | no |
| `outcomes.read` | yes | yes | limited | limited | yes |
| `outcomes.create` | yes | yes | no | no | yes |
| `outcomes.update` | yes | yes | no | no | yes |
| `data_quality.read` | yes | yes | no | limited | limited |
| `data_quality.resolve` | yes | yes | no | limited | limited |
| `reports.read` | yes | yes | limited | limited | limited |
| `reports.export` | yes | yes | no | limited | no |
| `audit.read` | yes | limited | no | no | no |
| `staff.manage` | yes | no | no | no | no |
| `system.configure` | yes | no | no | no | no |
| `integrations.manage` | yes | no | no | no | no |

`limited` means the backend must filter fields, records, or allowed actions for that role.

## Role Responsibilities

IT Admin:

- Manage staff users, roles, configuration, schema, integrations, deployment support, token revocation, duplicate merges, and emergency fixes.

Monitoring & Evaluation:

- Review reporting completeness, data quality issues, outcomes, exports, and program metrics.

Partnerships Team:

- Manage employer relationships, opportunities, and placement partner details.

Recruitment Team:

- Review CV parser results, correct categories, run matching, shortlist candidates, and record recruitment decisions.

Youth Engagement Team:

- Support consent, registration, continuation links, capacity building, reminders, and follow-up.

## Sensitive Field Access

| Field group | Access |
| --- | --- |
| Names and participant ID | Staff with `participants.read`. |
| Phone and email | IT Admin, Recruitment, Youth Engagement, M&E where needed. |
| Ghana Card and identity fields | IT Admin and M&E limited. |
| CV file and parsed CV text | IT Admin and Recruitment. |
| Income | IT Admin, M&E, and limited placement/outcome staff. |
| Consent signature | IT Admin, Youth Engagement, and M&E limited. |
| Audit log | IT Admin and M&E limited. |

## Backend Enforcement

Every staff request must resolve:

- `staffUserId`
- `email`
- `role`
- `permissions`
- `sessionExpiresAt`

Backend checks:

- Session is valid.
- User is active.
- Role has required permission.
- Limited role scope is applied.
- High-risk actions include reason text.

## High-Risk Actions

- Merge participants.
- Archive participants.
- Export broad PII.
- View audit logs.
- Change staff role.
- Change system config.
- Manage integration secrets.
- Delete or disable records.

## Acceptance Criteria

- Unauthorized staff actions return `FORBIDDEN`.
- Limited roles receive filtered fields.
- High-risk actions are audited with reason.
- Staff UI permission names match backend permission names.
