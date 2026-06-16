# Happy Kollekt — Deployment Checklist

Follow these steps in order. Each step must succeed before moving to the next.

---

## 1. Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a **blank spreadsheet**.
2. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
   ```
3. Paste it as `KOLLECT_SPREADSHEET_ID` in your `.env` file.
4. You can use the same spreadsheet for both the main data and the consent log, or create a separate one for `CONSENT_SPREADSHEET_ID`.

---

## 2. Google Drive Folders

Create three folders in Google Drive and copy each folder's ID from the URL (`/folders/<FOLDER_ID>`):

| `.env` key                  | Purpose                              |
|-----------------------------|--------------------------------------|
| `CV_UPLOAD_FOLDER_ID`        | Stores candidate CV files            |
| `CONSENT_SIGNATURE_FOLDER_ID`| Stores consent signature images      |
| `EXPORTS_FOLDER_ID`          | Stores data export files             |

---

## 3. Generate Secrets

Run these commands to generate cryptographically strong secrets:

```bash
# STAFF_SESSION_SECRET — signs staff session tokens (48 bytes)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# TOKEN_HASH_PEPPER — appended before hashing candidate tokens (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CV_PARSER_INTEGRATION_SECRET — shared with CV Parser (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste each value into `.env`.

---

## 4. Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Name it `happy-kollekt-backend`.
3. Delete the default `Code.gs` file content.
4. Create one `.gs` file for each file in `backend-apps-script/`:

   | File in `backend-apps-script/` | Create in Apps Script |
   |--------------------------------|----------------------|
   | `config.gs`                    | `config.gs`          |
   | `utils.gs`                     | `utils.gs`           |
   | `logger.gs`                    | `logger.gs`          |
   | `auth.gs`                      | `auth.gs`            |
   | `state-machine.gs`             | `state-machine.gs`   |
   | `consent.gs`                   | `consent.gs`         |
   | `participants.gs`              | `participants.gs`    |
   | `cv-handler.gs`                | `cv-handler.gs`      |
   | `data-quality.gs`              | `data-quality.gs`    |
   | `whatsapp.gs`                  | `whatsapp.gs`        |
   | `routes.gs`                    | `routes.gs`          |
   | `Code.gs`                      | `Code.gs`            |

   Copy-paste the content of each file from your local project into the Apps Script editor.

> **Tip:** Use [clasp](https://github.com/google/clasp) to push all files at once:
> ```bash
> npm install -g @google/clasp
> clasp login
> clasp create --type standalone --title "happy-kollekt-backend"
> # Copy the scriptId from .clasp.json
> clasp push
> ```

---

## 5. Set PropertiesService Values

1. Fill in all required values in your local `.env` file.
2. Generate the Apps Script snippet:
   ```bash
   node scripts/generate-properties-setter.js
   ```
3. Copy the printed `setScriptProperties()` function.
4. Paste it into any `.gs` file in your Apps Script project.
5. In the Apps Script editor, select `setScriptProperties` from the function dropdown and click **Run**.
6. Verify it ran successfully in the **Execution log**.
7. Delete the `setScriptProperties` function — secrets live in PropertiesService, not in code.

---

## 6. Bootstrap the Schema

1. In the Apps Script editor, select the function `runBootstrap` (defined in `Code.gs`).
2. Click **Run**.
3. Open the Google Spreadsheet — it should now have 16 tabs:
   - Master, Consents, Participant_Information, Capacity_Building, CV_Records,
     Job_Opportunities, Job_Matches, Job_Placement, Outcome_Tracking, Staff_Users,
     Token_Index, Audit_Log, Data_Quality_Issues, System_Config, Idempotency_Log, Merge_History

---

## 7. Deploy as a Web App

1. In Apps Script: **Deploy → New deployment**.
2. Click the gear icon → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** and copy the **Web App URL**.
5. Paste it as `APPS_SCRIPT_DEPLOYMENT_URL` in your `.env`.

---

## 8. Run the Smoke Tests

```bash
node scripts/test-backend.js
```

Or pass the URL directly:

```bash
node scripts/test-backend.js "https://script.google.com/macros/s/<deployment-id>/exec"
```

On the first run, `bootstrapFirstAdmin` will create the IT Admin account using:
- `ADMIN_EMAIL` (env var, default: `admin@happykollekt.test`)
- `ADMIN_PASSWORD` (env var, default: `Test@Passw0rd!2026`)

Override before running:
```bash
ADMIN_EMAIL=you@yourdomain.com ADMIN_PASSWORD=YourStr0ngPass! node scripts/test-backend.js
```

---

## 9. Configure System_Config

After bootstrap, set operational values directly in the **System_Config** tab of the spreadsheet:

| Key                     | Description                                   |
|-------------------------|-----------------------------------------------|
| `candidateFrontendUrl`  | GitHub Pages URL of the candidate frontend    |
| `staffDashboardUrl`     | GitHub Pages URL of the staff dashboards      |
| `enableWhatsApp`        | `true` to enable WhatsApp integration         |
| `maxDailyConsentRate`   | Max consents per day (rate limit)             |

---

## 10. Deploy the CV Parser (optional for basic testing)

See the CV Parser's own `.env.example` for required variables. Key values to set:
- `APPS_SCRIPT_CALLBACK_URL` = the Web App URL from Step 7
- `CV_PARSER_INTEGRATION_SECRET` = same value as in Apps Script PropertiesService

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `{"success":false,"code":"SERVER_ERROR"}` on every request | PropertiesService values not set — run `setScriptProperties` |
| `KOLLECT_SPREADSHEET_ID` not found | Wrong spreadsheet ID, or Apps Script doesn't have access to the sheet |
| `bootstrapFirstAdmin` returns `FORBIDDEN` | IT Admin already exists — use `staffLogin` directly |
| `AUTH_REQUIRED` after correct login | `STAFF_SESSION_SECRET` missing or changed after sessions were created |
| Drive file verification fails | CV folder ID wrong, or Drive file not in the configured folder |
