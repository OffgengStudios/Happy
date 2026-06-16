# Security Model

## Goals

- Protect participant PII while preserving a low-cost architecture.
- Allow candidates to continue journeys without accounts.
- Require staff authentication and role-based authorization.
- Prevent direct browser writes to Google Sheets.
- Make important actions auditable and reversible where possible.

## Actor Types

| Actor | Authentication | Authorization |
| --- | --- | --- |
| Candidate | Secure token link | Token purpose and participant scope. |
| Staff | Staff session | Role permissions. |
| Integration | Shared secret or request signature | Integration allowlist and route scope. |
| System | Apps Script trigger | Script-level permission. |

## Candidate Tokens

Candidate links contain a raw token. The backend stores only a hash.

Rules:

- Generate at least 256 bits of randomness. In Apps Script, concatenate two `Utilities.getUuid()` values (each UUID v4 provides approximately 122 bits of entropy), append the `TOKEN_HASH_PEPPER` secret if configured, then hash the full string with `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)` to produce the stored hash. Return the raw concatenated UUID string (without the pepper) as the candidate-facing token. Never use `Math.random()` or a single UUID alone as a token.
- Store token hash, purpose, `participantId`, status, creation time, expiry, and last use.
- Scope tokens by purpose: registration, CV upload, WhatsApp continuation, or one-time action.
- Revoke tokens when consent is withdrawn, participant is archived, duplicate is merged, or a new token replaces an old one.
- Never log raw tokens.

Recommended lifetimes:

| Purpose | Lifetime |
| --- | --- |
| Consent to registration | 14 days |
| Resume incomplete profile | 14 days |
| CV upload | 7 days |
| WhatsApp continuation | 7 days |
| One-time sensitive action | 30 minutes |

## Staff Authentication

Minimum viable model:

- `Staff_Users` contains email, display name, role, active status, and password hash or identity provider subject.
- Sessions expire.
- Failed login attempts are logged.
- Disabled users cannot create sessions or use existing sessions.

Preferred model:

- Use Google identity for staff email verification where feasible.
- Keep role and permission mapping in Sheets or backend config.

Session implementation: use `STAFF_SESSION_SECRET` as an HMAC key. On login, structure the session token as `staffUserId:expiresAt:hmac` where `hmac` is `HMAC-SHA256(staffUserId + ":" + expiresAt, STAFF_SESSION_SECRET)` encoded as hex. On every staff request, split the token on `:` to recover `staffUserId` and `expiresAt`, recompute the HMAC, and reject if the signature does not match or `expiresAt` is past. Store the session token in `sessionStorage` on the client so it does not survive a browser tab close, reducing the window for token theft. Do not store in `localStorage`.

## Rate Limiting

Apps Script has no native rate limiter. Implement via `CacheService` with `LockService` for atomic counter increments:

- On each candidate token validation failure, increment a counter keyed by request origin in `CacheService` with a 15-minute TTL. Return `RATE_LIMITED` when the counter exceeds the configured threshold.
- On each staff login failure, increment a counter keyed by the attempted email. Temporarily block further attempts after the configured threshold and emit a `staff.login_failed` audit event.
- Always acquire a `LockService` lock before reading and writing a counter to prevent race conditions under concurrent requests.
- Store thresholds in `System_Config` so they can be tuned without a code deployment.

## Authorization

- Backend checks permissions on every staff action.
- UI hiding is helpful but never authoritative.
- High-risk actions require reason text.
- Broad exports, duplicate merges, role changes, and system configuration changes are IT Admin-only unless explicitly delegated.

## Data Protection

PII includes names, phone numbers, email, Ghana Card, address/community, CV files, consent signatures, income, placement details, and outcome notes.

Controls:

- Restrict spreadsheet and Drive folder sharing.
- Store CV files and signatures in separate restricted Drive folders.
- Store file IDs and URLs in Sheets, not file contents.
- Mask sensitive fields for limited roles.
- Audit sensitive views and exports.
- Do not place PII or long-lived secrets in URLs.

## Frontend Security

- GitHub Pages hosts static files only.
- Frontend must not contain spreadsheet write credentials, integration secrets, or admin passwords.
- Frontend calls Apps Script for all reads and writes.
- Candidate token should be held in memory or session storage unless a deliberate resume-later choice is implemented.
- Validate file type and size in frontend for usability; backend repeats validation.

## Apps Script Backend Security

- Deploy the web app as "Execute as: Me" (so the script accesses Sheets with the owner's credentials) and "Who has access: Anyone" — not "Anyone with Google account", because candidates do not have Google accounts and must reach consent and token endpoints without signing in.
- Use an allowlist of actions.
- Validate payloads before writes.
- Check token or staff session before returning participant data.
- Escape values beginning with `=`, `+`, `-`, or `@` before writing to Sheets.
- Use `LockService` for participant ID generation, token creation, and duplicate-sensitive writes.
- Return safe errors and keep detailed diagnostics in restricted logs.

## Integration Security

### CV Parser

- Parser callback requires integration secret or HMAC signature.
- Result must include `participantId` and `cvRecordId`.
- Parser cannot create canonical participants directly.
- Identity conflicts are marked `needs_review`.

### WhatsApp

- Verify provider webhook signatures.
- Store provider message IDs and reject duplicates.
- Use short-lived continuation links.
- Rate limit outbound notifications.
- Stop messaging withdrawn or archived participants.

## Required Audit Events

- Consent submitted or withdrawn.
- Token created, used, expired, or revoked.
- Participant profile created or updated.
- CV uploaded, parsed, reviewed, or failed.
- Staff login, failed login, logout, role change, and user disable.
- Sensitive view and export.
- Duplicate merge.
- Placement and outcome change.
- System configuration change.
- Integration callback accepted or rejected.

## Threats and Mitigations

| Threat | Mitigation |
| --- | --- |
| Leaked candidate link | Expiry, purpose scoping, revocation, short-lived WhatsApp links. |
| Staff account compromise | Strong auth, session expiry, disable user, audit review. |
| Direct sheet tampering | Restricted sharing, protected headers, reconciliation checks. |
| Duplicate identities | Normalized lookup fields, blocking duplicate checks, merge workflow. |
| Webhook replay | Signature verification and idempotency by provider message ID. |
| Formula injection | Escape formula-leading values before sheet writes. |
| Unauthorized export | Permission checks and audit events. |

## Acceptance Criteria

- No raw token is stored in Sheets.
- Candidate token cannot read another participant.
- Staff route fails without valid session.
- Staff role cannot perform unauthorized action.
- Integration callback fails without valid authentication.
- Important actions produce audit records.
