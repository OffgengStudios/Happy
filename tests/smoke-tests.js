#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
 *  HAPPY KOLLECT — end-to-end smoke tests
 *
 *  Exercises the full candidate + staff lifecycle against a DEPLOYED Apps Script
 *  Web App. Dependency-free; requires Node 18+ (global fetch).
 *
 *  Run:
 *    APPS_SCRIPT_URL="https://script.google.com/macros/s/XXX/exec" \
 *    SMOKE_ADMIN_EMAIL="admin@org.com" SMOKE_ADMIN_PASSWORD="…" \
 *    node tests/smoke-tests.js
 *
 *  Candidate-only steps run without credentials. Staff steps are skipped (not
 *  failed) when SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD are absent.
 * ═══════════════════════════════════════════════════════════════════════════════ */

const URL   = process.env.APPS_SCRIPT_URL || process.argv[2];
const EMAIL = process.env.SMOKE_ADMIN_EMAIL || '';
const PASS  = process.env.SMOKE_ADMIN_PASSWORD || '';

if (!URL) {
  console.error('Set APPS_SCRIPT_URL (env or first arg).');
  process.exit(2);
}

let passed = 0, failed = 0, skipped = 0;
const log  = (s) => console.log(s);
const ok   = (m) => { passed++; log('  \x1b[32m✓\x1b[0m ' + m); };
const skip = (m) => { skipped++; log('  \x1b[33m∼\x1b[0m ' + m + ' (skipped)'); };
const bad  = (m, e) => { failed++; log('  \x1b[31m✗\x1b[0m ' + m + ' — ' + (e && e.message || e)); };

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function call(action, payload, sessionToken) {
  const body = { action, requestId: 'smoke-' + Math.random().toString(36).slice(2), payload: payload || {} };
  if (sessionToken) body.sessionToken = sessionToken;
  const res  = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (json.status !== 'OK') {
    const err = json.error || {};
    const e = new Error('[' + (err.code || '?') + '] ' + (err.message || 'error'));
    e.code = err.code;
    throw e;
  }
  return json.data || {};
}

function tokenFromUrl(u) { const m = String(u || '').match(/[?&]token=([^&#]+)/); return m ? decodeURIComponent(m[1]) : ''; }

(async function run() {
  log('\nHAPPY KOLLECT smoke tests → ' + URL + '\n');

  // ── Health & config ──────────────────────────────────────────────────────
  try { const d = await call('healthCheck'); assert(d.backendVersion, 'no version'); ok('healthCheck → ' + d.backendVersion + ' (' + d.status + ')'); }
  catch (e) { bad('healthCheck', e); }

  try { const d = await call('getSystemConfig'); assert(d.backendVersion, 'no config'); ok('getSystemConfig → env ' + d.environment); }
  catch (e) { bad('getSystemConfig', e); }

  // ── Candidate journey ────────────────────────────────────────────────────
  const phone = '02' + Math.floor(10000000 + Math.random() * 89999999);
  let token = '', participantId = '';
  try {
    const d = await call('initConsent', { name: 'Smoke Test', phone, venue: 'Smoke', language: 'en', accepted: true });
    assert(d.participantId, 'no participantId');
    token = tokenFromUrl(d.continuationUrl || d.registrationUrl);
    participantId = d.participantId;
    assert(token, 'no token in continuationUrl');
    ok('initConsent → ' + participantId);
  } catch (e) { bad('initConsent', e); }

  if (token) {
    try { const d = await call('getParticipantByToken', { token }); assert(d.participant && d.participant.currentStage, 'no stage'); ok('getParticipantByToken → ' + d.participant.currentStage); }
    catch (e) { bad('getParticipantByToken', e); }

    try {
      const d = await call('saveParticipantInfo', { token, surname: 'Test', firstName: 'Smoke', sex: 'Female', dob: '2000-01-01', telephone: phone, region: 'Greater Accra', district: 'Accra', educationLevel: 'SHS', employmentStatus: 'Unemployed', sector: 'Agriculture', monthlyIncome: '1-200', idType: 'Ghana Card' });
      assert(d.participantInfoStatus, 'no status');
      ok('saveParticipantInfo → ' + d.participantInfoStatus + ' / stage ' + d.currentStage);
    } catch (e) { bad('saveParticipantInfo', e); }

    try { const d = await call('submitCapacityBuilding', { token, trainedByPartner: 'No' }); ok('submitCapacityBuilding → ' + d.capacityBuildingStatus + ' / stage ' + d.currentStage); }
    catch (e) { bad('submitCapacityBuilding', e); }
  }

  // ── Staff journey ────────────────────────────────────────────────────────
  if (!EMAIL || !PASS) {
    skip('staff login + matching/placement/outcome/report flow');
  } else {
    let session = '';
    try { const d = await call('staffLogin', { email: EMAIL, password: PASS }); assert(d.sessionToken, 'no session'); session = d.sessionToken; ok('staffLogin → ' + d.role); }
    catch (e) { bad('staffLogin', e); }

    if (session) {
      try { const d = await call('searchParticipants', { q: participantId }, session); assert(Array.isArray(d.participants), 'not a list'); ok('searchParticipants → ' + d.total + ' total'); }
      catch (e) { bad('searchParticipants', e); }

      let jobId = '';
      try { const d = await call('createJobOpportunity', { employerName: 'Smoke Co', sector: 'Agriculture', jobRole: 'Field Officer', region: 'Greater Accra', requiredSkills: 'excel, customer service', status: 'open' }, session); assert(d.jobOpportunityId, 'no job id'); jobId = d.jobOpportunityId; ok('createJobOpportunity → ' + jobId); }
      catch (e) { bad('createJobOpportunity', e); }

      let matchId = '';
      try { const d = await call('runJobMatch', { participantId }, session); ok('runJobMatch → ' + d.matches + ' matches'); }
      catch (e) { bad('runJobMatch', e); }
      try { const d = await call('searchMatches', { participantId }, session); if (d.matches && d.matches[0]) matchId = d.matches[0].matchId; ok('searchMatches → ' + (d.total || 0)); }
      catch (e) { bad('searchMatches', e); }
      if (matchId) { try { await call('reviewJobMatch', { matchId, decision: 'shortlisted', notes: 'smoke' }, session); ok('reviewJobMatch → shortlisted'); } catch (e) { bad('reviewJobMatch', e); } }

      let placementId = '';
      try { const d = await call('recordPlacement', { participantId, employerName: 'Smoke Co', jobRole: 'Field Officer', placementStartDate: '2026-07-01' }, session); assert(d.placementId, 'no placement id'); placementId = d.placementId; ok('recordPlacement → ' + placementId); }
      catch (e) { bad('recordPlacement', e); }

      if (placementId) { try { const d = await call('recordOutcome', { participantId, placementId, followUpDate: '2026-08-01', currentlyEmployed: 'Yes', retentionStatus: 'Retained' }, session); ok('recordOutcome → ' + d.outcomeId); } catch (e) { bad('recordOutcome', e); } }

      try { const d = await call('getReport', { reportType: 'programme_summary' }, session); assert(typeof d.total === 'number', 'no total'); ok('getReport(programme_summary) → ' + d.total + ' participants'); }
      catch (e) { bad('getReport', e); }
      try { const d = await call('getAuditLog', { limit: 5 }, session); assert(Array.isArray(d.entries), 'not a list'); ok('getAuditLog → ' + d.total + ' entries'); }
      catch (e) { bad('getAuditLog', e); }
      try { const d = await call('listStaffUsers', {}, session); assert(Array.isArray(d.staffUsers), 'not a list'); ok('listStaffUsers → ' + d.total); }
      catch (e) { bad('listStaffUsers', e); }
    }
  }

  log('\n' + '─'.repeat(48));
  log('  passed: ' + passed + '   failed: ' + failed + '   skipped: ' + skipped + '\n');
  process.exit(failed ? 1 : 0);
})();
