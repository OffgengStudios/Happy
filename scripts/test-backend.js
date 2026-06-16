#!/usr/bin/env node
/**
 * scripts/test-backend.js — End-to-end smoke tests for the Happy Kollekt Apps Script backend.
 *
 * Usage:
 *   node scripts/test-backend.js <APPS_SCRIPT_URL>
 *
 *   or set APPS_SCRIPT_DEPLOYMENT_URL in .env and run without args:
 *   node scripts/test-backend.js
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

(async () => {

// ─── Config ───────────────────────────────────────────────────────────────────

let BASE_URL = process.argv[2] || '';

const envVars = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) envVars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

if (!BASE_URL) BASE_URL = envVars.APPS_SCRIPT_DEPLOYMENT_URL || '';

if (!BASE_URL) {
  console.error('ERROR: Provide the deployed Apps Script URL as an argument, or set APPS_SCRIPT_DEPLOYMENT_URL in .env');
  process.exit(1);
}

BASE_URL = BASE_URL.replace(/\/$/, '');
console.log(`\nHappy Kollekt — Apps Script Backend Smoke Tests`);
console.log(`Target: ${BASE_URL}\n`);

// The backend only allows bootstrap with ADMIN_BOOTSTRAP_EMAIL (if configured),
// so default to that value from .env.
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || envVars.ADMIN_BOOTSTRAP_EMAIL || 'admin@happykollekt.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || envVars.ADMIN_PASSWORD       || 'Test@Passw0rd!2026';
console.log(`Admin email: ${ADMIN_EMAIL}\n`);

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function uuid() { return crypto.randomUUID(); }

async function api(action, payload = {}, sessionToken = '', extraHeaders = {}) {
  const requestId = uuid();
  const body = JSON.stringify({ action, requestId, sessionToken, payload });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(BASE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body,
        redirect: 'follow',
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { raw: text, httpStatus: res.status }; }
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

async function get() {
  const res = await fetch(BASE_URL, { redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function test(name, fn) {
  process.stdout.write(`  ${name} … `);
  try {
    await fn();
    console.log('\x1b[32m✓\x1b[0m');
    passed++;
  } catch (err) {
    console.log(`\x1b[31m✗\x1b[0m  ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function assertOk(result, context) {
  const ok = result.status === 'OK';
  assert(ok, `${context}: got ${JSON.stringify(result).slice(0, 300)}`);
  return result;
}

function assertError(result, expectedCode, context) {
  const actualCode = result.error && result.error.code;
  assert(result.status === 'ERROR', `${context}: expected error, got ${JSON.stringify(result).slice(0, 200)}`);
  assert(
    actualCode === expectedCode,
    `${context}: expected ${expectedCode}, got ${actualCode} — ${JSON.stringify(result).slice(0, 200)}`
  );
}

// ─── Test state ───────────────────────────────────────────────────────────────

let sessionToken  = '';
let participantId = '';
let rawToken      = '';

// ─── SUITE: Health ────────────────────────────────────────────────────────────

console.log('── Health ──');

await test('GET → health check returns OK', async () => {
  const r = await get();
  assert(
    r.success === true || r.status === 'OK' || (r.data && r.data.status === 'OK'),
    `Got: ${JSON.stringify(r)}`
  );
});

// ─── SUITE: Bootstrap ─────────────────────────────────────────────────────────

console.log('\n── Bootstrap ──');

await test('bootstrapFirstAdmin creates IT Admin (or FORBIDDEN if already exists)', async () => {
  const r = await api('bootstrapFirstAdmin', {
    email:       ADMIN_EMAIL,
    password:    ADMIN_PASSWORD,
    displayName: 'Test Admin',
  });
  const ok = r.status === 'OK' || (r.status === 'ERROR' && r.error && r.error.code === 'FORBIDDEN');
  assert(ok, `Unexpected response: ${JSON.stringify(r).slice(0, 300)}`);
});

// ─── SUITE: Staff Auth ────────────────────────────────────────────────────────

console.log('\n── Staff Auth ──');

await test('staffLogin with correct credentials → session token issued', async () => {
  const r = await api('staffLogin', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assertOk(r, 'staffLogin');
  assert(r.data && r.data.sessionToken, `sessionToken missing from response: ${JSON.stringify(r).slice(0, 200)}`);
  sessionToken = r.data.sessionToken;
});

await test('staffLogin with wrong password → AUTH_REQUIRED', async () => {
  const r = await api('staffLogin', { email: ADMIN_EMAIL, password: 'wrong-password-xxxx' });
  assertError(r, 'AUTH_REQUIRED', 'staffLogin bad password');
});

await test('getCurrentStaffUser → returns role and email', async () => {
  const r = await api('getCurrentStaffUser', {}, sessionToken);
  assertOk(r, 'getCurrentStaffUser');
  assert(r.data.staffUser.role === 'it_admin', `Expected it_admin, got ${r.data.staffUser.role}`);
  assert(r.data.staffUser.email === ADMIN_EMAIL, `Email mismatch: got ${r.data.staffUser.email}`);
});

// ─── SUITE: Consent ───────────────────────────────────────────────────────────

console.log('\n── Consent ──');

const consentPhone = '0244' + Math.floor(100000 + Math.random() * 900000);
const consentEmail = `test.${uuid().slice(0, 8)}@happykollekt.test`;

await test('initConsent with accepted:false → VALIDATION_ERROR', async () => {
  const r = await api('initConsent', {
    accepted: false,
    name:     'Test Candidate',
    phone:    consentPhone,
    email:    consentEmail,
    venue:    'Accra Test',
    program:  'HAPPY',
    language: 'English',
  });
  assertError(r, 'VALIDATION_ERROR', 'initConsent accepted:false');
});

await test('initConsent with accepted:true → participant created', async () => {
  const r = await api('initConsent', {
    accepted: true,
    name:     'Test Candidate',
    phone:    consentPhone,
    email:    consentEmail,
    venue:    'Accra Test Centre',
    program:  'HAPPY',
    language: 'English',
  });
  assertOk(r, 'initConsent');
  assert(r.data.participantId, 'participantId missing');
  participantId = r.data.participantId;
  const registrationUrl = r.data.registrationUrl || r.data.continuationUrl || '';
  assert(registrationUrl, `registrationUrl/continuationUrl missing from: ${JSON.stringify(r.data)}`);
  const m = registrationUrl.match(/[?&]token=([^&]+)/);
  rawToken = m ? decodeURIComponent(m[1]) : '';
  assert(rawToken,                        `Could not extract token from: ${registrationUrl}`);
  assert(participantId.startsWith('HAPPY-'), `participantId format wrong: ${participantId}`);
});

await test('initConsent — second consent with same phone reuses participant (no duplicate)', async () => {
  const r = await api('initConsent', {
    accepted: true,
    name:     'Duplicate Candidate',
    phone:    consentPhone,       // same phone as above
    email:    `other.${uuid().slice(0, 8)}@test.com`,
    venue:    'Test',
    program:  'HAPPY',
    language: 'English',
  });
  assertOk(r, 'duplicate initConsent');
  assert(
    r.data.participantId === participantId,
    `Expected same participantId ${participantId}, got ${r.data.participantId} — duplicate participant created`
  );
  assert(r.data.isNewParticipant === false, `Expected isNewParticipant:false, got ${r.data.isNewParticipant}`);
});

// ─── SUITE: Candidate Token ───────────────────────────────────────────────────

console.log('\n── Candidate Token ──');

await test('getParticipantByToken → returns participant record', async () => {
  assert(rawToken, 'No token — initConsent must have passed');
  const r = await api('getParticipantByToken', { token: rawToken });
  assertOk(r, 'getParticipantByToken');
  assert(r.data.participant, 'participant object missing');
  assert(
    r.data.participant.participantId === participantId,
    `participantId mismatch: expected ${participantId}, got ${r.data.participant.participantId}`
  );
});

await test('getParticipantByToken with invalid token → error', async () => {
  const r = await api('getParticipantByToken', { token: 'totally-invalid-token-xyz' });
  assert(r.status !== 'OK', `Expected error for invalid token, got: ${JSON.stringify(r).slice(0, 200)}`);
});

// ─── SUITE: Participant Info ──────────────────────────────────────────────────

console.log('\n── Participant Info ──');

await test('saveParticipantInfo → saves successfully', async () => {
  assert(rawToken, 'No token available');
  const r = await api('saveParticipantInfo', {
    token:            rawToken,
    surname:          'Mensah',
    firstName:        'Kofi',
    sex:              'male',
    dob:              '2000-01-15',
    telephone:        consentPhone,
    region:           'Greater Accra',
    district:         'Accra Metropolitan',
    community:        'Osu',
    educationLevel:   'tertiary',
    employmentStatus: 'unemployed',
    idType:           'ghana_card',
    ghanaCardId:      'GHA-' + Math.floor(100000000 + Math.random() * 900000000) + '-0',
    disabilityStatus: 'none',
    refugeeStatus:    'no',
  });
  assertOk(r, 'saveParticipantInfo');
});

// ─── SUITE: Staff Operations ──────────────────────────────────────────────────

console.log('\n── Staff: Participants ──');

await test('searchParticipants → finds the participant we created', async () => {
  assert(sessionToken, 'No session token');
  const r = await api('searchParticipants', { query: 'Mensah' }, sessionToken);
  assertOk(r, 'searchParticipants');
  assert(Array.isArray(r.data.participants), 'participants array missing');
  const found = r.data.participants.some(p => p.participantId === participantId);
  assert(found, `Participant ${participantId} not found in search results`);
});

await test('getParticipantDetail → returns full record', async () => {
  const r = await api('getParticipantDetail', { participantId }, sessionToken);
  assertOk(r, 'getParticipantDetail');
  assert(r.data.participant.participantId === participantId, 'participantId mismatch');
});

// ─── SUITE: Data Quality ──────────────────────────────────────────────────────

console.log('\n── Data Quality ──');

await test('runDataQualityScan → succeeds', async () => {
  const r = await api('runDataQualityScan', {}, sessionToken);
  assertOk(r, 'runDataQualityScan');
});

await test('listDataQualityIssues → returns issues array', async () => {
  const r = await api('listDataQualityIssues', {}, sessionToken);
  assertOk(r, 'listDataQualityIssues');
  assert(Array.isArray(r.data.issues), 'issues array missing');
});

// ─── SUITE: Logout ────────────────────────────────────────────────────────────

console.log('\n── Session Teardown ──');

await test('staffLogout → invalidates session', async () => {
  const r = await api('staffLogout', {}, sessionToken);
  assertOk(r, 'staffLogout');
});

await test('getCurrentStaffUser after logout → AUTH_REQUIRED', async () => {
  const r = await api('getCurrentStaffUser', {}, sessionToken);
  assertError(r, 'AUTH_REQUIRED', 'post-logout getCurrentStaffUser');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(52));
console.log(`Results: \x1b[32m${passed} passed\x1b[0m, \x1b[${failed > 0 ? '31' : '32'}m${failed} failed\x1b[0m`);

if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  \x1b[31m✗\x1b[0m ${f.name}`);
    console.log(`    ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('\n\x1b[32mAll tests passed.\x1b[0m');
}

})();
