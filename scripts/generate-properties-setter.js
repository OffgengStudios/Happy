#!/usr/bin/env node
/**
 * Reads .env and outputs a Google Apps Script snippet that sets all
 * PropertiesService values in one run.
 *
 * Usage:
 *   node scripts/generate-properties-setter.js
 *
 * Then:
 *   1. Copy the printed function into your Apps Script project (any .gs file)
 *   2. Run it once from the Apps Script editor (Run → setScriptProperties)
 *   3. Delete the function after it runs — secrets live in PropertiesService, not code
 */

const fs   = require('fs');
const path = require('path');

// ─── Keys that belong in Apps Script PropertiesService ───────────────────────
const APPS_SCRIPT_KEYS = [
  'ENVIRONMENT',
  'KOLLECT_SPREADSHEET_ID',
  'CONSENT_SPREADSHEET_ID',
  'CV_UPLOAD_FOLDER_ID',
  'CONSENT_SIGNATURE_FOLDER_ID',
  'EXPORTS_FOLDER_ID',
  'STAFF_SESSION_SECRET',
  'TOKEN_HASH_PEPPER',
  'CV_PARSER_INTEGRATION_SECRET',
  'WHATSAPP_WEBHOOK_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'ADMIN_BOOTSTRAP_EMAIL',
  'APPS_SCRIPT_DEPLOYMENT_URL',
  'CANDIDATE_FRONTEND_URL',
  'STAFF_DASHBOARD_URL',
  'CV_PARSER_BASE_URL',
];

// ─── Parse .env ───────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env file not found. Copy .env.example to .env and fill in values first.');
  process.exit(1);
}

const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const env   = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  env[key] = val;
}

// ─── Check for unfilled placeholders ─────────────────────────────────────────
const missing = [];
for (const key of APPS_SCRIPT_KEYS) {
  const val = env[key] || '';
  if (!val || val.startsWith('PASTE_') || val === '') {
    if (['WHATSAPP_WEBHOOK_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
         'APPS_SCRIPT_DEPLOYMENT_URL', 'CANDIDATE_FRONTEND_URL', 'STAFF_DASHBOARD_URL',
         'CV_PARSER_BASE_URL'].includes(key)) continue; // optional at this stage
    missing.push(key);
  }
}

if (missing.length) {
  console.warn('WARNING: These keys have no value yet and will be skipped:\n  ' + missing.join('\n  ') + '\n');
}

// ─── Generate the .gs snippet ─────────────────────────────────────────────────
const props = {};
for (const key of APPS_SCRIPT_KEYS) {
  const val = env[key] || '';
  if (!val || val.startsWith('PASTE_')) continue;
  props[key] = val;
}

const propsJson = JSON.stringify(props, null, 2)
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`');

const snippet = `
// ─── Paste this function into any .gs file, run it ONCE, then delete it. ─────
// It sets all PropertiesService values from your .env.
// Generated: ${new Date().toISOString()}

function setScriptProperties() {
  const props = ${JSON.stringify(props, null, 2)};
  PropertiesService.getScriptProperties().setProperties(props, false);
  console.log('Properties set: ' + Object.keys(props).join(', '));
}
`;

console.log(snippet);
console.log('\n// ── Also verify after running with: ─────────────────────────────────────────');
console.log('// function verifyProperties() {');
console.log('//   const p = PropertiesService.getScriptProperties().getProperties();');
console.log('//   console.log(Object.keys(p).sort().join(", "));');
console.log('// }');
