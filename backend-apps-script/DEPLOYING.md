# Deploying backend changes to Google Apps Script

The live backend is a Google Apps Script web app owned by the HAPPY team's Google account.
The exec URL must never change (all frontends point at it), so always **update the existing
deployment to a new version** — never create a second deployment.

## What changed for the portal (Phase 2)

| File | Change |
|---|---|
| `config.gs` | Two new Master columns appended: `latestOutcomeEmployed`, `latestOutcomeDate` (auto-added to the live sheet by `ensureHeaders`) |
| `outcomes.gs` | `recordOutcome` now mirrors the latest follow-up onto Master |
| `reports.gs` | New `getCandidatePipeline` action (lifecycle counts + filterable list) |
| `routes.gs` | Registered `getCandidatePipeline` |
| `participants.gs` | `getParticipantDetail` now includes `outcomes` |

All changes are additive — existing frontends keep working.

## Option A — clasp (recommended, repeatable)

```powershell
cd Happy\backend-apps-script
clasp login                       # opens browser — sign in with the account that owns the script
```

Find the script ID: open the project at script.google.com → Project Settings → Script ID. Then:

```powershell
'{"scriptId":"<SCRIPT_ID>","rootDir":"."}' | Out-File -Encoding ascii .clasp.json
clasp pull                        # one-time: fetches appsscript.json so the manifest matches
git status                        # sanity: pull should not overwrite our edited .gs files — if it does, git checkout -- <file>
clasp push                        # upload all .gs files
```

Finally, in the Apps Script editor: **Deploy → Manage deployments → (pencil) → Version: New version → Deploy.**
The exec URL stays the same.

## Option B — manual paste (no setup)

Open the project at script.google.com and paste the full contents of the five changed files
over their counterparts, then **Deploy → Manage deployments → New version**.

## Verify after deploying

From any machine:

```powershell
node ..\scripts\test-backend.js "https://script.google.com/macros/s/<deployment-id>/exec"
```

Or log into the portal (`http://<host>/portal/staff/login`) — the Pipeline page calls
`getCandidatePipeline` and will load counts if the deploy worked.
