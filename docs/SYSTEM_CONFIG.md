# System Configuration

## Purpose

Configuration defines environment IDs, feature flags, limits, role settings, parser settings, and operational thresholds. Secrets must not be committed to the repository.

## Configuration Sources

1. Apps Script `PropertiesService` for secrets and environment-specific IDs.
2. `System_Config` sheet for non-secret runtime settings.
3. `backend-apps-script/config.gs` for stable defaults.
4. `getSystemConfig` API response for public-safe frontend settings.

## Environments

| Environment | Purpose |
| --- | --- |
| `local` | Frontend development and mock API testing. |
| `staging` | Test Apps Script deployment and staging workbook. |
| `production` | Live operations. |

Staging and production must use separate Sheets and Drive folders.

## Required Secret Properties

- `ENVIRONMENT`
- `KOLLECT_SPREADSHEET_ID`
- `CONSENT_SPREADSHEET_ID`
- `CV_UPLOAD_FOLDER_ID`
- `CONSENT_SIGNATURE_FOLDER_ID`
- `EXPORTS_FOLDER_ID`
- `STAFF_SESSION_SECRET`
- `TOKEN_HASH_PEPPER`
- `CV_PARSER_INTEGRATION_SECRET`
- `WHATSAPP_WEBHOOK_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `ADMIN_BOOTSTRAP_EMAIL`

## Non-Secret Runtime Settings

| Key | Example |
| --- | --- |
| `backendVersion` | `2026.06.11-foundation` |
| `candidateFrontendUrl` | `https://org.github.io/happy-kollekt/` |
| `staffDashboardUrl` | `https://org.github.io/happy-kollekt/staff/` |
| `maxCvFileSizeMb` | `10` |
| `allowedCvMimeTypes` | `application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `candidateTokenDays` | `14` |
| `cvTokenDays` | `7` |
| `parserConfidenceThreshold` | `0.75` |
| `duplicateHighConfidenceThreshold` | `0.90` |
| `outcomeFollowupDays` | `30` |

## Canonical Sheet Names

- `Master`
- `Consents`
- `Participant_Information`
- `Capacity_Building`
- `CV_Records`
- `Job_Opportunities`
- `Job_Matches`
- `Job_Placement`
- `Outcome_Tracking`
- `Staff_Users`
- `Token_Index`
- `Audit_Log`
- `Data_Quality_Issues`
- `System_Config`
- `Idempotency_Log`
- `Merge_History`

## Drive Folders

| Folder | Contents |
| --- | --- |
| Consent signatures | Signature images. |
| CV uploads | Candidate CV files. |
| Exports | Staff exports and reports. |
| Archives | Archived logs and snapshots. |

## Feature Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `enableCapacityBuilding` | true | Show capacity building flow. |
| `enableCvUpload` | true | Allow CV upload. |
| `enableParserIntegration` | false | Queue and receive parser results. |
| `enableWhatsApp` | false | Enable WhatsApp webhook and outbound messages. |
| `enableStaffDashboards` | true | Enable staff routes. |
| `enableDataQualityBlocking` | true | Block configured transitions on critical issues. |

## Validation Patterns

Store these in `System_Config` so operators can override without a code deployment.

| Key | Default pattern | Notes |
| --- | --- | --- |
| `ghanaCardPattern` | `^GHA-[0-9]{9}-[0-9]$` | Applied when `idType` is Ghana Card. |
| `phonePattern` | `^0[0-9]{9}$` | 10-digit Ghana mobile number. Extend for international formats if needed. |
| `participantIdPattern` | `^HAPPY-[0-9]{4}-[0-9]{6}$` | Frozen format — do not change after data exists. |

## Operational Limits

- Candidate token validation failures should be rate limited.
- Staff login failures should be rate limited.
- Dashboard list page size: default 50, max 500.

Rate limiting keys (stored in `System_Config`, referenced by the backend):

| Key | Default | Notes |
| --- | --- | --- |
| `tokenValidationRateLimit` | `10` | Max token validation failures per window before `RATE_LIMITED`. |
| `tokenValidationRateLimitWindowMinutes` | `15` | Rolling window in minutes for token validation failures. |
| `loginRateLimit` | `5` | Max failed login attempts per email before lockout. |
| `loginLockoutMinutes` | `15` | Duration of login lockout after threshold is reached. |

- CV file size: default 10 MB.
- Data quality batch size: default 250 rows.
- Audit export batch size: default 1000 rows.
- Idempotency log TTL: default 30 days; a nightly cleanup job purges rows where `ttlExpiresAt` is past.

## Deployment Records

Track:

- Apps Script deployment ID.
- Apps Script web app URL.
- Candidate frontend URL.
- Staff dashboard URL.
- Production spreadsheet ID.
- Staging spreadsheet ID.
- Drive folder IDs.
- Last deployment timestamp.
- Deployed by.

## Change Rules

- Only IT Admin changes production configuration.
- Every config change is audited.
- Secrets are never written to `System_Config`.
- Frontend only receives public-safe config.
- Header changes require documentation and migration plan updates.

## Bootstrap Checklist

- Create staging and production workbooks.
- Create canonical tabs.
- Protect header rows.
- Create Drive folders.
- Configure Apps Script properties.
- Deploy Apps Script web app.
- Configure GitHub Pages URLs.
- Run admin bootstrap: deploy the script, then call the bootstrap endpoint with `ADMIN_BOOTSTRAP_EMAIL` to create the first IT Admin `Staff_Users` row. The bootstrap endpoint must be disabled after first use.
- Run schema verification and health check.
