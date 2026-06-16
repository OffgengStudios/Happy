# Happy Kollekt System Blueprint

## Purpose

Happy Kollekt is a unified Youth Employment Operating System for managing a participant from consent through registration, optional capacity building, CV upload, CV parsing, job matching, placement, and outcome tracking.

The platform consolidates Hermes/HMS, the existing consent and participant frontends, Google Apps Script backends, Google Sheets operations, the CV parser, staff dashboards, and a future WhatsApp engagement layer.

## Core Principles

- One individual has one canonical `participantId`.
- Google Apps Script is the backend and single source of truth.
- Google Sheets remains the primary database.
- GitHub Pages hosts static candidate and staff frontends.
- Frontends never write directly to Google Sheets.
- Candidates do not create accounts or log in.
- Candidate access uses secure links and scoped tokens.
- Consent data pre-fills the participant information section for name, phone, and email.
- Staff users authenticate and receive role-based permissions.
- Every operational record references `participantId`.
- Important actions are written to `Audit_Log`.
- Data quality checks identify duplicates, missing information, invalid states, and inconsistencies.

## Repository Assessment

| Path | Current responsibility | Recommendation |
| --- | --- | --- |
| `backend-apps-script/` | Intended Apps Script backend, currently mostly stubs | Make this the only deployable Apps Script backend. |
| `happy-kollekt/apps-script/Code.gs` | Older unified Apps Script with real routes, sheet headers, consent, registration, admin, migration, and normalization logic | Use as migration source material; split reviewed logic into `backend-apps-script/`. |
| `happy-consent-form/apps-script/Code.gs` | Consent-only backend | Treat as legacy source; fold still-valid consent behavior into canonical backend. |
| `frontend/` | Intended unified candidate frontend | Make this the canonical candidate journey frontend. |
| `happy-consent-form/` | Standalone consent frontend | Treat as legacy UI source; migrate into unified candidate journey. |
| `happy-kollekt/` | Broader candidate frontend and older Apps Script | Treat frontend as source material; do not keep a second backend here. |
| `staff-dashboards/` | Role dashboards | Keep and consolidate shared staff auth/API code. |
| `it-admin-panel/` | Separate admin panel | Move conceptually under `staff-dashboards/it-admin/`. |
| `CV-Parser/` | Full Python/FastAPI parser, matching, auth, WhatsApp draft | Keep as integration subsystem, not participant database authority. |
| `CV- Parser for the system/` | Small parser/classifier prototype | Archive or fold useful classifier logic into parser integration. |
| `scripts/` | Migration and cleanup scripts | Keep as operational tooling with dry-run and audit guidance. |
| `tests/` | Initial tests | Expand for Apps Script contracts, data quality, parser integration, and end-to-end smoke tests. |
| `docs/` | Architecture foundation | Keep as implementation baseline. |

## Duplicate Responsibilities

- Consent capture appears in both consent-only and unified Apps Script code.
- Participant creation and lookup exist in legacy Apps Script while canonical backend files are placeholders.
- Candidate UI is split between `frontend`, `happy-consent-form`, and `happy-kollekt`.
- Staff/admin functionality is split between `staff-dashboards`, `it-admin-panel`, and older Apps Script admin routes.
- CV parsing exists as a Python service plus a smaller JavaScript prototype.
- WhatsApp planning lives in the CV parser area, but lifecycle ownership belongs to Happy Kollekt.

## Recommended Folder Structure

```text
happy-kollekt/
  backend-apps-script/
    Code.gs
    config.gs
    routes.gs
    sheets.gs
    validators.gs
    auth.gs
    tokens.gs
    participants.gs
    consent.gs
    state-machine.gs
    cv-handler.gs
    matching.gs
    placements.gs
    outcomes.gs
    data-quality.gs
    logger.gs
  frontend/
    index.html
    css/
    js/
      api.js
      router.js
      state-manager.js
      token-session.js
      form-handler.js
  staff-dashboards/
    shared/
      api.js
      auth.js
      permissions.js
      components.js
    it-admin/
    monitoring-evaluation/
    partnerships/
    recruitment/
    youth-engagement/
  integrations/
    cv-parser/
      README.md
      adapter-contract.md
      service/
    whatsapp/
      README.md
      webhook-contract.md
  scripts/
  tests/
  docs/
```

## Runtime Architecture

```text
Candidate browser / WhatsApp
        |
        v
GitHub Pages frontend
        |
        v
Google Apps Script Web App
        |
        +--> Google Sheets workbook
        +--> Google Drive folders
        +--> MailApp notifications
        +--> CV parser integration
        +--> WhatsApp provider integration
```

Staff dashboards are also hosted on GitHub Pages and call Apps Script. Apps Script validates staff session, role permission, payload shape, state transition, and audit requirements before writing to Sheets.

## Canonical Stores

- `Master`: one row per participant and latest lifecycle summary.
- `Consents`: consent submissions and evidence.
- `Participant_Information`: registration details.
- `Capacity_Building`: optional training records.
- `CV_Records`: optional CV upload, later staff upload, parser, and review records.
- `Job_Opportunities`: employer roles and opportunity metadata.
- `Job_Matches`: matching recommendations and decisions.
- `Job_Placement`: placement records.
- `Outcome_Tracking`: follow-up outcomes.
- `Staff_Users`: staff identity and role.
- `Token_Index`: candidate token hashes and expiry metadata.
- `Audit_Log`: append-only action log.
- `Data_Quality_Issues`: generated quality issues and resolutions.
- `System_Config`: non-secret settings.

## Component Ownership

| Component | Primary owner | Responsibilities |
| --- | --- | --- |
| Candidate frontend | Youth Engagement, IT Admin | Consent, registration, continuation, CV upload. |
| Staff dashboards | Functional teams | Role-specific operations and queues. |
| Apps Script backend | IT Admin | API, validation, auth, sheets, state, audit. |
| Google Sheets workbook | IT Admin, M&E | Primary database and reporting source. |
| CV parser | Recruitment, IT Admin | CV extraction, classification, parser feedback. |
| WhatsApp integration | Youth Engagement, IT Admin | Reminders, continuation links, opportunity messaging. |
| Data quality engine | M&E, IT Admin | Duplicate, missing data, consistency checks. |

## Architecture Validation

### Risks

- Google Sheets full-row scans will slow down as data grows.
- Apps Script execution limits can interrupt imports, data quality scans, and bulk dashboard reads.
- Multiple legacy folders can cause deployment drift.
- Candidate links become risky if tokens are long-lived, reusable, or logged.
- CV parser output can create duplicate identities unless every result resolves to `participantId`.
- WhatsApp webhooks can repeat messages without idempotency.

### Scalability Concerns

- Use normalized lookup fields and `Token_Index` to avoid repeated full-sheet scans.
- Paginate staff dashboard reads.
- Batch data quality scans with cursor state.
- Store files in Drive and metadata in Sheets.
- Keep parser and WhatsApp processing asynchronous where possible.

### Security Concerns

- Store token hashes only.
- Replace shared admin password patterns with staff sessions and role checks.
- Enforce permissions in backend, not only in UI.
- Audit PII exports and sensitive views.
- Verify parser and WhatsApp callbacks with secrets or signatures.

### Operational Bottlenecks

- Manual Apps Script deployment can drift from repo code.
- Header/schema changes can silently break dashboards.
- Large exports can exceed Apps Script runtime.
- Parser hosting can add cost if it remains always-on.

### Simplification Opportunities

- Merge consent and registration into one candidate frontend.
- Make `backend-apps-script/` the only deployable backend source.
- Treat CV parser as a service adapter, not a second database.
- Share one staff API client and permission map across dashboards.
- Use dashboard queues rather than separate one-off operational spreadsheets.

## Development Roadmap

### Phase 1: Foundation and Documentation

- Finalize `/docs`.
- Choose canonical folders.
- Mark legacy folders as migration sources.
- Freeze tab names, state names, action names, role names, and permissions.

### Phase 2: Participant Identity System and State Machine

- Implement `participantId` generation with locking.
- Implement token creation, hashing, expiry, and revocation.
- Implement state transition validator.
- Add duplicate checks on phone, email, Ghana Card, and normalized name.
- Write a consent migration script in `scripts/` that reads legacy consent workbooks, normalizes phone and name fields, matches rows to `participantId` where one already exists, logs all unmatched rows for manual review, and runs in dry-run mode before writing anything.

### Phase 3: Google Apps Script Backend

- Move reviewed legacy code into canonical backend modules.
- Implement route dispatcher, validators, sheet helpers, auth, permissions, audit, and config.
- Add schema bootstrap and health checks.
- Add contract tests around backend actions.

### Phase 4: Candidate Frontend Experience

- Consolidate consent, participant information, capacity building, and CV upload.
- Support secure token continuation.
- Add mobile-first validation and clear error states.
- Make CV upload optional during initial registration and clearly support later collection.

### Phase 5: Staff Dashboards

- Build shared authenticated dashboard shell.
- Implement role-specific queues, search, detail views, and actions.
- Add audited exports and high-risk action reasons.

### Phase 6: Data Quality Engine

- Implement duplicate rules, completeness checks, invalid state checks, and issue resolution.
- Run scheduled scans with batch cursors.
- Surface issues in IT Admin and M&E views.

### Phase 7: CV Parser Integration

- Define adapter contract.
- Connect CV records to parser jobs.
- Write parser output back under the same `participantId`.
- Support manual staff upload of later-received CVs for storage, parsing, and tracking.
- Require staff review for low-confidence results.

### Phase 8: WhatsApp Integration

- Implement webhook bridge, provider signature verification, and message idempotency.
- Send short-lived continuation links.
- Keep WhatsApp state subordinate to the participant lifecycle state machine.

### Phase 9: Testing and Deployment

- Add Apps Script route tests, schema tests, dashboard smoke tests, parser contract tests, and data quality tests.
- Define staging and production deployments.
- Document rollback and monitoring procedures.
