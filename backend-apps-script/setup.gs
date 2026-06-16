// =============================================================================
//  SETUP - one-time deployment helper (run from the Apps Script editor)
//
//  Apps Script cannot read the repo's .env. Use this file to load the same
//  values into Script Properties + System_Config.
//
//  HOW TO USE
//  1. Paste your values from .env into PROPS and CONFIG_URLS below.
//  2. In the Apps Script editor, Run > setupDeployment().
//  3. Run > verifyDeployment() to confirm nothing required is missing.
//  4. DELETE the pasted values from this file afterward (do NOT commit secrets).
//
//  Empty values are skipped, so it is safe to run repeatedly as you fill them in.
// =============================================================================

// --- Script Properties (mirror of .env) --------------------------------------
// REQUIRED keys are marked; the backend throws on a missing required key.
var PROPS = {
  // Environment
  ENVIRONMENT:                 '',  // e.g. 'staging' or 'production'

  // Spreadsheets
  KOLLECT_SPREADSHEET_ID:      '',  // REQUIRED - main workbook ID
  CONSENT_SPREADSHEET_ID:      '',  // optional - separate consent workbook (else same as main)

  // Drive folders
  CV_UPLOAD_FOLDER_ID:         '',  // REQUIRED - candidate/staff CV uploads
  CONSENT_SIGNATURE_FOLDER_ID: '',  // REQUIRED - consent signature images
  EXPORTS_FOLDER_ID:           '',  // optional - CSV export archive

  // Secrets
  STAFF_SESSION_SECRET:        '',  // REQUIRED - HMAC key for staff sessions
  TOKEN_HASH_PEPPER:           '',  // REQUIRED - pepper for candidate token hashing
  CV_PARSER_INTEGRATION_SECRET:'',  // REQUIRED if using the parser (matches parser CV_PARSER_CALLBACK_SECRET)

  // Identity / deployment
  ADMIN_BOOTSTRAP_EMAIL:       '',  // optional - locks first-admin creation to this email
  APPS_SCRIPT_DEPLOYMENT_URL:  '',  // optional - this web app /exec URL (parser callback target)
  CV_PARSER_BASE_URL:          '',  // optional - FastAPI parser base URL (blank disables auto-queue)

  // WhatsApp (Phase 8 - optional)
  WHATSAPP_ACCESS_TOKEN:       '',
  WHATSAPP_PHONE_NUMBER_ID:    '',
  WHATSAPP_WEBHOOK_SECRET:     ''
};

// --- System_Config sheet values (NOT script properties) ----------------------
// These drive absolute continuation links and the public config the frontend reads.
var CONFIG_URLS = {
  candidateFrontendUrl: '',  // GitHub Pages URL of the candidate frontend (trailing slash optional)
  staffDashboardUrl:    ''   // GitHub Pages URL of the staff dashboards
};

var REQUIRED_PROPS = [
  'KOLLECT_SPREADSHEET_ID', 'STAFF_SESSION_SECRET', 'TOKEN_HASH_PEPPER',
  'CV_UPLOAD_FOLDER_ID', 'CONSENT_SIGNATURE_FOLDER_ID', 'CV_PARSER_INTEGRATION_SECRET'
];

// --- ACTIONS -----------------------------------------------------------------

function setupDeployment() {
  var store   = PropertiesService.getScriptProperties();
  var setKeys = [];
  Object.keys(PROPS).forEach(function (k) {
    var v = String(PROPS[k] || '').trim();
    if (v) { store.setProperty(k, v); setKeys.push(k); }
  });

  // Ensure the schema exists before writing System_Config URL values.
  bootstrapSchema();
  Object.keys(CONFIG_URLS).forEach(function (k) {
    var v = String(CONFIG_URLS[k] || '').trim();
    if (v) _setSystemConfigValue(k, v);
  });

  Logger.log('Set ' + setKeys.length + ' script properties: ' + setKeys.join(', '));
  Logger.log('Now run verifyDeployment(), then delete the pasted values from setup.gs.');
  return { propertiesSet: setKeys };
}

function verifyDeployment() {
  var store   = PropertiesService.getScriptProperties();
  var missing = REQUIRED_PROPS.filter(function (k) { return !store.getProperty(k); });

  var cfg     = getSystemConfig();
  var urlGaps = [];
  if (!cfg.candidateFrontendUrl) urlGaps.push('System_Config.candidateFrontendUrl');
  if (!cfg.staffDashboardUrl)    urlGaps.push('System_Config.staffDashboardUrl');

  var ok = missing.length === 0;
  Logger.log(ok ? 'OK - all required Script Properties present.'
                : 'MISSING required properties: ' + missing.join(', '));
  if (urlGaps.length) Logger.log('WARNING - links will be relative until set: ' + urlGaps.join(', '));

  // Confirm the workbook + tabs resolve.
  try {
    var health = healthCheck();
    Logger.log('Health: ' + health.status + ' (version ' + health.backendVersion + ')');
  } catch (e) {
    Logger.log('ERROR - healthCheck failed, check KOLLECT_SPREADSHEET_ID: ' + e.message);
    ok = false;
  }

  return { ready: ok, missingRequired: missing, urlGaps: urlGaps };
}
