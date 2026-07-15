#!/usr/bin/env node
/**
 * scripts/data-cleaner.js — archive test/seed participants via the Apps Script backend.
 *
 * Requires an IT Admin login (participants.archive permission):
 *   $env:ADMIN_EMAIL    = "you@example.com"
 *   $env:ADMIN_PASSWORD = Read-Host "Admin password"
 *   node Happy/scripts/data-cleaner.js --dry-run   # preview
 *   node Happy/scripts/data-cleaner.js             # archive
 *
 * Archives (never deletes) through archiveParticipant, so every record keeps
 * its audit trail and disappears from dashboards, DQ scans, and the pipeline.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// APPS_SCRIPT_URL comes from the CV-Parser backend .env (shared platform config)
const ENV_PATH = path.join(__dirname, '..', '..', 'CV-Parser', 'cv_system_output', '.env');
const env = {};
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE_URL = env.APPS_SCRIPT_URL;
if (!BASE_URL) { console.error(`ERROR: APPS_SCRIPT_URL not found in ${ENV_PATH}`); process.exit(1); }

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ERROR: set ADMIN_EMAIL and ADMIN_PASSWORD environment variables (IT Admin account).');
  process.exit(1);
}

// Seed/smoke-test records identified 2026-07-14.
// HAPPY-2026-000012 (real registration) deliberately excluded.
const TEST_IDS = [
  'HAPPY-2026-000001', 'HAPPY-2026-000002', 'HAPPY-2026-000003', 'HAPPY-2026-000004',
  'HAPPY-2026-000005', 'HAPPY-2026-000006', 'HAPPY-2026-000007', 'HAPPY-2026-000008',
  'HAPPY-2026-000009', 'HAPPY-2026-000010', 'HAPPY-2026-000011', 'HAPPY-2026-000013',
  'HAPPY-2026-000014', 'HAPPY-2026-000015', 'HAPPY-2026-000016', 'HAPPY-2026-000017',
  'HAPPY-2026-000018', 'HAPPY-2026-000019', 'HAPPY-2026-000020', 'HAPPY-2026-000021',
  'HAPPY-2026-000022', 'HAPPY-2026-000023', 'HAPPY-2026-000024', 'HAPPY-2026-000025',
  'HAPPY-2026-000026', 'HAPPY-2026-000027', 'HAPPY-2026-000028',
];

const REASON = 'Test data cleanup before team go-live (seed/smoke-test records)';
const dryRun = process.argv.includes('--dry-run');

async function api(action, payload = {}, sessionToken = '') {
  const body = JSON.stringify({ action, requestId: crypto.randomUUID(), sessionToken, payload });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'follow',
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300), httpStatus: res.status }; }
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

(async () => {
  const login = await api('staffLogin', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!login.success || !login.data?.sessionToken) {
    console.error('LOGIN FAILED:', JSON.stringify(login).slice(0, 400));
    process.exit(1);
  }
  const token = login.data.sessionToken;
  const me = await api('getCurrentStaffUser', {}, token);
  const who = me.data?.staffUser || {};
  console.log(`Logged in as ${who.email} (role: ${who.role})`);
  if (who.role !== 'it_admin') {
    console.error('ERROR: participants.archive requires the it_admin role.');
    await api('staffLogout', {}, token);
    process.exit(1);
  }

  let ok = 0, failed = 0;
  for (const pid of TEST_IDS) {
    if (dryRun) { console.log(`[dry-run] would archive ${pid}`); continue; }
    const r = await api('archiveParticipant', { participantId: pid, reason: REASON }, token);
    if (r.success) { ok++; console.log(`archived  ${pid}`); }
    else { failed++; console.log(`FAILED    ${pid}: ${r.error?.code || ''} ${r.error?.message || JSON.stringify(r).slice(0, 200)}`); }
  }
  if (!dryRun) console.log(`\nDone. archived=${ok} failed=${failed} (of ${TEST_IDS.length})`);
  await api('staffLogout', {}, token);
})();
