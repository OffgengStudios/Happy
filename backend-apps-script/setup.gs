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

// --- First IT Admin login --------------------------------------------------
// Paste a STRONG password (12+ chars), Run > createOrResetFirstAdmin(), CLEAR it.
// Creates the IT Admin if missing, or resets its password if it already exists,
// using ADMIN_BOOTSTRAP_EMAIL as the login email. Run this if you are locked out.
var FIRST_ADMIN_PASSWORD = '';

function createOrResetFirstAdmin() {
  var email = normalizeEmail(getConfigOptional('ADMIN_BOOTSTRAP_EMAIL') || '');
  if (!email) throw new Error('Set ADMIN_BOOTSTRAP_EMAIL in PROPS and run setupDeployment() first.');
  if (!FIRST_ADMIN_PASSWORD || FIRST_ADMIN_PASSWORD.length < 12) {
    throw new Error('Paste a password of at least 12 characters into FIRST_ADMIN_PASSWORD.');
  }

  var sheet  = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);
  var hashed = hashPassword(FIRST_ADMIN_PASSWORD);
  var now    = new Date().toISOString();
  var H      = HEADERS.STAFF_USERS;

  // Locate an existing row for this email.
  var rowNum = -1, existing = null;
  if (sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, H.length).getValues();
    var emailIdx = H.indexOf('email');
    for (var i = 0; i < rows.length; i++) {
      if (normalizeEmail(rows[i][emailIdx]) === email) { rowNum = i + 2; existing = rowToObject(H, rows[i]); break; }
    }
  }

  if (rowNum > 0) {
    updateRow(sheet, H, rowNum, {
      role: 'it_admin', status: 'active',
      passwordHash: hashed.hash, passwordSalt: hashed.salt,
      lastUpdatedAt: now, lastUpdatedBy: 'setup_reset',
    });
    Logger.log('RESET existing IT Admin password for ' + email + ' (staffUserId ' + existing.staffUserId + ').');
  } else {
    var rec = {
      staffUserId: Utilities.getUuid(), email: email, displayName: 'IT Admin',
      role: 'it_admin', status: 'active', passwordHash: hashed.hash, passwordSalt: hashed.salt,
      lastLoginAt: '', failedLoginCount: 0, createdAt: now, createdBy: 'setup',
      lastUpdatedAt: now, lastUpdatedBy: 'setup',
    };
    sheet.appendRow(H.map(function (h) { return rec[h] !== undefined ? rec[h] : ''; }));
    Logger.log('CREATED IT Admin ' + email + '.');
  }

  // Clear any login-failure lockout for this email so you can sign in immediately.
  try { CacheService.getScriptCache().remove('login_fail_count_' + email); } catch (e) {}

  Logger.log('Done. Log in with ' + email + ' and the password you set, then CLEAR FIRST_ADMIN_PASSWORD.');
  return { email: email, reset: rowNum > 0 };
}

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
