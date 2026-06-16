// ═══════════════════════════════════════════════════════════════════════════════
//  UTILS — ID generation, token/hash, sheet helpers, normalization
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ID GENERATORS ────────────────────────────────────────────────────────────

function generateParticipantId() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (_) {
    throw appError('SERVER_ERROR', 'Could not acquire lock for ID generation. Please retry.');
  }
  try {
    var sheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
    var max   = 0;
    if (sheet.getLastRow() >= 2) {
      var col  = HEADERS.MASTER.indexOf('participantId') + 1;
      var vals = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        var m = String(vals[i][0] || '').match(/^HAPPY-(\d{4})-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[2], 10));
      }
    }
    return 'HAPPY-' + new Date().getFullYear() + '-' + String(max + 1).padStart(6, '0');
  } finally {
    lock.releaseLock();
  }
}

function generateConsentId() {
  return 'CONSENT-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generateCvRecordId() {
  return 'CV-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generateJobOpportunityId() {
  return 'JOB-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generateMatchId() {
  return 'MATCH-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generatePlacementId() {
  return 'PLACE-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generateOutcomeId() {
  return 'OUTCOME-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generateIssueId() {
  return 'DQ-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function generateRequestId() {
  return Utilities.getUuid();
}

// HAMIS ID — scans Participant_Information tab (not Master).
const PARTNER_CODE_MAP = {
  'Jobberman': 'JOB', 'Agrico': 'AGR', 'YouthEmpower': 'YOU', 'SkillsGH': 'SKI',
};
const REGION_CODE_MAP = {
  'Greater Accra': 'GRE', 'Ashanti': 'ASH', 'Central': 'CEN',
  'Eastern': 'EAS', 'Western': 'WES', 'Northern': 'NOR',
  'Upper East': 'UPE', 'Upper West': 'UPW', 'Volta': 'VOL',
  'Bono': 'BON', 'Bono East': 'BOE', 'Ahafo': 'AHA',
  'Savannah': 'SAV', 'North East': 'NOE', 'Oti': 'OTI', 'Western North': 'WEN',
};

function generateHamisId(region, partner) {
  var partnerCode = PARTNER_CODE_MAP[partner] || String(partner || '').substring(0, 3).toUpperCase() || 'UNK';
  var regionCode  = REGION_CODE_MAP[region]   || String(region  || '').substring(0, 3).toUpperCase() || 'UNK';
  var prefix      = 'HAMIS-' + partnerCode + '-' + regionCode + '-';

  var sheet = getOrCreateSheet(SHEET.PARTICIPANT_INFO, HEADERS.PARTICIPANT_INFO);
  var max   = 0;
  if (sheet.getLastRow() >= 2) {
    var col  = HEADERS.PARTICIPANT_INFO.indexOf('hamisId') + 1;
    var vals = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var s = String(vals[i][0] || '');
      if (s.startsWith(prefix)) {
        var n = parseInt(s.slice(prefix.length), 10);
        if (!isNaN(n)) max = Math.max(max, n);
      }
    }
  }
  return prefix + String(max + 1).padStart(6, '0');
}

// ─── TOKEN & HASH ─────────────────────────────────────────────────────────────

// Raw candidate token — two UUIDs concatenated, no hyphens (≈244 bits entropy).
function createToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

// Hash a candidate token for storage: SHA-256(raw + TOKEN_HASH_PEPPER).
// Never call this on non-token values — use hashValue() for those.
function hashToken(rawToken) {
  var pepper = getConfig('TOKEN_HASH_PEPPER');
  return hashValue(String(rawToken) + pepper);
}

// General-purpose SHA-256 hash (no pepper — for Ghana Card dedup, fingerprints, etc.).
function hashValue(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''))
    .map(function(b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); })
    .join('');
}

// ─── SHEET HELPERS ────────────────────────────────────────────────────────────

function getOrCreateSheet(name, headers) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    protectHeaderRow(sheet);
  } else {
    ensureHeaders(sheet, headers);
  }
  return sheet;
}

function ensureHeaders(sheet, desired) {
  if (!desired || !desired.length) return desired;
  var lastCol  = Math.max(sheet.getLastColumn(), desired.length);
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean);
  if (existing.length === 0) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    sheet.setFrozenRows(1);
    return desired.slice();
  }
  var missing = desired.filter(function(h) { return existing.indexOf(h) < 0; });
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  return desired.slice();
}

function rowToObject(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = fromSheetValue(row[i] !== undefined ? row[i] : '');
  }
  return obj;
}

function blankRecord(headers) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) obj[headers[i]] = '';
  return obj;
}

function getRecords(sheet, headers) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues()
    .map(function(row) { return rowToObject(headers, row); })
    .filter(function(row) { return Object.values(row).some(Boolean); });
}

function pickKnownFields(payload, headers) {
  var picked = {};
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (Object.prototype.hasOwnProperty.call(payload, h)) picked[h] = payload[h];
  }
  return picked;
}

function updateRow(sheet, headers, rowIndex, values) {
  var existing = rowToObject(headers, sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0]);
  var merged   = Object.assign({}, existing, values);
  sheet.getRange(rowIndex, 1, 1, headers.length)
    .setValues([headers.map(function(h) { return toSheetValue(merged[h] !== undefined ? merged[h] : ''); })]);
}

// Formula-injection escape — prefix values starting with = + - @ with a single quote.
function toSheetValue(v) {
  if (typeof v !== 'string') return v === undefined || v === null ? '' : v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function fromSheetValue(v) {
  return typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
}

// ─── PARTICIPANT LOOKUP ───────────────────────────────────────────────────────

// Find a row in Master by one of several criteria.
// criteria keys: participantId | phone | email | ghanaCard | tokenHash (searches Token_Index)
function findParticipantRow(criteria) {
  var master  = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  if (master.getLastRow() < 2) return -1;

  var headers = HEADERS.MASTER;
  var rows    = master.getRange(2, 1, master.getLastRow() - 1, headers.length).getValues();
  var idx     = {};
  for (var i = 0; i < headers.length; i++) idx[headers[i]] = i;

  // Sheets coerces all-digit strings (normalized phones) to numbers on write,
  // so every comparison must String-coerce the cell value first.
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (criteria.participantId && String(row[idx.participantId] || '') === String(criteria.participantId)) return r + 2;
    if (criteria.ghanaCard     && String(row[idx.ghanaCardNormalized] || '') === String(criteria.ghanaCard)) return r + 2;
    if (criteria.phone         && String(row[idx.participantPhoneNormalized] || '') === String(criteria.phone)) return r + 2;
    if (criteria.email         && String(row[idx.participantEmailNormalized] || '') === String(criteria.email)) return r + 2;
  }

  // Token lookup — check Token_Index, then resolve to Master via participantId
  if (criteria.tokenHash) {
    var tokenSheet = getOrCreateSheet(SHEET.TOKEN_INDEX, HEADERS.TOKEN_INDEX);
    if (tokenSheet.getLastRow() >= 2) {
      var tRows = tokenSheet.getRange(2, 1, tokenSheet.getLastRow() - 1, HEADERS.TOKEN_INDEX.length).getValues();
      var tIdx  = {};
      for (var j = 0; j < HEADERS.TOKEN_INDEX.length; j++) tIdx[HEADERS.TOKEN_INDEX[j]] = j;
      for (var t = 0; t < tRows.length; t++) {
        if (String(tRows[t][tIdx.tokenHash] || '') === String(criteria.tokenHash)) {
          var pid = String(tRows[t][tIdx.participantId] || '').trim();
          if (pid) return findParticipantRow({ participantId: pid });
        }
      }
    }
  }

  return -1;
}

function findParticipantRowsByName(query) {
  var master  = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  if (master.getLastRow() < 2) return [];
  var headers = HEADERS.MASTER;
  var rows    = master.getRange(2, 1, master.getLastRow() - 1, headers.length).getValues();
  var sIdx    = headers.indexOf('surname');
  var fIdx    = headers.indexOf('firstName');
  var qNorm   = String(query).toLowerCase().replace(/\s+/g, ' ').trim();
  var matches = [];
  for (var i = 0; i < rows.length; i++) {
    var sn    = String(rows[i][sIdx] || '').toLowerCase().trim();
    var fn    = String(rows[i][fIdx] || '').toLowerCase().trim();
    if (!sn && !fn) continue;
    var full1 = (sn + ' ' + fn).trim();
    var full2 = (fn + ' ' + sn).trim();
    var hit   = full1 === qNorm || full2 === qNorm || sn === qNorm || fn === qNorm ||
                (qNorm.length >= 3 && (full1.indexOf(qNorm) >= 0 || full2.indexOf(qNorm) >= 0));
    if (hit) matches.push(i + 2);
  }
  return matches;
}

// ─── TOKEN INDEX HELPERS ──────────────────────────────────────────────────────

// Write a new row to Token_Index. Returns the tokenId.
function createTokenRecord(participantId, purpose, rawToken, lifetimeDays) {
  var tokenId   = Utilities.getUuid();
  var now       = new Date();
  var expiresAt = new Date(now.getTime() + (lifetimeDays || 14) * 86400 * 1000);

  var sheet = getOrCreateSheet(SHEET.TOKEN_INDEX, HEADERS.TOKEN_INDEX);
  sheet.appendRow([
    tokenId,
    participantId,
    hashToken(rawToken),
    purpose,
    'active',
    now.toISOString(),
    expiresAt.toISOString(),
    '',   // lastUsedAt
    '',   // revokedAt
    '',   // revokedReason
  ]);
  return tokenId;
}

// Validate a raw token: returns the Token_Index row object or throws TOKEN_INVALID.
function validateCandidateToken(rawToken, requiredPurpose) {
  var tokenHash   = hashToken(rawToken);
  var sheet       = getOrCreateSheet(SHEET.TOKEN_INDEX, HEADERS.TOKEN_INDEX);
  if (sheet.getLastRow() < 2) throw appError('TOKEN_INVALID', 'Token not found.');

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.TOKEN_INDEX.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.TOKEN_INDEX.length; i++) idx[HEADERS.TOKEN_INDEX[i]] = i;

  for (var r = 0; r < rows.length; r++) {
    if (rows[r][idx.tokenHash] !== tokenHash) continue;

    var record = rowToObject(HEADERS.TOKEN_INDEX, rows[r]);

    if (record.status !== 'active') {
      throw appError('TOKEN_INVALID', 'Token has been ' + record.status + '.');
    }
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      // Mark as expired
      sheet.getRange(r + 2, idx.status + 1).setValue('expired');
      throw appError('TOKEN_INVALID', 'Token has expired.');
    }
    if (requiredPurpose && record.purpose !== requiredPurpose) {
      // Allow both registration and cv_upload tokens for candidate actions
      var candidatePurposes = ['registration', 'cv_upload'];
      if (!candidatePurposes.includes(record.purpose)) {
        throw appError('TOKEN_INVALID', 'Token purpose mismatch.');
      }
    }

    // Update lastUsedAt
    sheet.getRange(r + 2, idx.lastUsedAt + 1).setValue(new Date().toISOString());

    return record;
  }

  throw appError('TOKEN_INVALID', 'Token not found.');
}

// Revoke all active tokens for a participant (used on withdrawal, archive, merge).
function revokeParticipantTokens(participantId, reason) {
  var sheet = getOrCreateSheet(SHEET.TOKEN_INDEX, HEADERS.TOKEN_INDEX);
  if (sheet.getLastRow() < 2) return;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.TOKEN_INDEX.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.TOKEN_INDEX.length; i++) idx[HEADERS.TOKEN_INDEX[i]] = i;
  var now  = new Date().toISOString();

  for (var r = 0; r < rows.length; r++) {
    if (rows[r][idx.participantId] === participantId && rows[r][idx.status] === 'active') {
      sheet.getRange(r + 2, idx.status    + 1).setValue('revoked');
      sheet.getRange(r + 2, idx.revokedAt + 1).setValue(now);
      sheet.getRange(r + 2, idx.revokedReason + 1).setValue(reason || 'revoked');
    }
  }
}

// ─── NORMALIZATION ────────────────────────────────────────────────────────────

// Returns a normalized 233-prefix phone string for dedup lookups.
function normalizePhone(value) {
  var d = String(value || '').replace(/\D+/g, '');
  if (!d) return '';
  if (d.length === 10 && d.startsWith('0')) return '233' + d.slice(1);
  if (d.length === 12 && d.startsWith('233')) return d;
  if (d.length === 9) return '233' + d;
  return d;
}

// Returns a local 0244... display format for phone fields.
function toLocalPhone(value) {
  var d = String(value || '').replace(/\D+/g, '');
  if (!d) return String(value || '');
  if (d.length === 12 && d.startsWith('233')) return '0' + d.slice(3);
  if (d.length === 10 && d.startsWith('0'))   return d;
  if (d.length === 9)                          return '0' + d;
  return String(value || '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeGhanaCard(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function toTitleCase(str) {
  return String(str || '').trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, function(c) { return c.toUpperCase(); });
}

// Normalizes display-facing name and phone fields on a record object in-place.
function normalizeDisplayFields(record) {
  ['telephone', 'consentPhone'].forEach(function(f) {
    if (record[f]) record[f] = toLocalPhone(record[f]);
  });
  ['surname', 'firstName', 'otherNames', 'consentName', 'currentOccupation', 'currentEmployer'].forEach(function(f) {
    if (record[f]) record[f] = toTitleCase(record[f]);
  });
  return record;
}

function sanitizeFileName(value) {
  return String(value || 'file')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';
}

// ─── ERROR HELPERS ────────────────────────────────────────────────────────────

// Creates a structured error object. Throw these from action handlers.
// Code should match one of the standard error codes in API_CONTRACT.md.
function appError(code, message, details) {
  var err    = new Error(message);
  err.code   = code;
  err.details = details || {};
  return err;
}

// Builds the standard error response envelope.
function errorResponse(requestId, code, message, details) {
  return {
    status:    'ERROR',
    requestId: requestId || '',
    error: {
      code:    code    || 'SERVER_ERROR',
      message: message || 'An unexpected error occurred.',
      details: details || {},
    },
  };
}

// Builds the standard success response envelope.
function successResponse(requestId, data, warnings) {
  return {
    status:    'OK',
    requestId: requestId || '',
    data:      data     || {},
    warnings:  warnings || [],
  };
}

// ─── MISC ─────────────────────────────────────────────────────────────────────

function countWhere(records, field, value) {
  return records.filter(function(r) { return r[field] === value; }).length;
}

function countYouth(records) {
  return records.filter(function(r) {
    var a = Number(r.ageAtRegistration || r.age);
    return !isNaN(a) && a >= 15 && a <= 35;
  }).length;
}

// Job role classifier — mirrors the client-side version.
function classifyJobRole(role) {
  var text = String(role || '').toLowerCase();
  if (/\b(manager|director|principal|dean|registrar|administrator|superintendent|cto|lead|head)\b/.test(text)) return 'Management';
  if (/\b(accountant|bookkeeper|officer|coordinator|specialist|analyst|secretary|clerk|cashier|teller|buyer|recruiter|writer|controller|auditor|agent|rep|representative|relationship|records|admissions|documentation|dispatcher)\b/.test(text)) return 'Administrative';
  if (/\b(cleaner|security|guard|driver|loader|laborer|worker|operator|attendant|hand|janitor|gardener|courier|picker|stocker|sanitation|bellhop|housekeeper|laundry|storekeeper|helper|assistant)\b/.test(text)) return 'Support';
  return 'Technical';
}
