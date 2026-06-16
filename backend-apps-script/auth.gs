// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH — staff authentication, session management, permission enforcement
// ═══════════════════════════════════════════════════════════════════════════════

// Must not exceed 6h: logout revocation uses CacheService, whose max TTL is 21600s.
const SESSION_DURATION_HOURS = 6;
const RATE_LIMIT_MAX_FAILURES = 5;
const RATE_LIMIT_WINDOW_SECS  = 900;   // 15 minutes
const PBKDF2_ITERATIONS       = 100000; // balance of security vs Apps Script timeout
const PBKDF2_KEY_LEN          = 32;    // bytes

// ─── ROLE PERMISSIONS MAP ─────────────────────────────────────────────────────
// "limited" in the spec = permission is granted; action handlers apply field filtering.
// The special value '*' means all permissions.

// Derived strictly from ROLE_PERMISSIONS.md (yes + limited = granted; no = absent).
// "limited" means handlers additionally apply field/record filtering for that role.
const ROLE_PERMISSIONS = {
  it_admin: ['*'],

  me_officer: [
    'participants.read', 'participants.update',
    'consent.read',
    'capacity.read', 'capacity.update',
    'cv.read',
    'jobs.read',
    'placements.read', 'placements.update',
    'outcomes.read', 'outcomes.create', 'outcomes.update',
    'data_quality.read', 'data_quality.resolve',
    'reports.read', 'reports.export',
    'audit.read',
  ],

  partnerships: [
    'participants.read',
    'jobs.read', 'jobs.create', 'jobs.update',
    'matching.run', 'matching.review',
    'placements.read', 'placements.create', 'placements.update',
    'outcomes.read',
    'reports.read',
  ],

  recruitment: [
    'participants.read', 'participants.update',
    'consent.read',
    'capacity.read',
    'cv.read', 'cv.upload', 'cv.review', 'cv.export',
    'jobs.read', 'jobs.create', 'jobs.update',
    'matching.run', 'matching.review',
    'placements.read', 'placements.create', 'placements.update',
    'outcomes.read',
    'data_quality.read', 'data_quality.resolve',
    'reports.read', 'reports.export',
  ],

  youth_engagement: [
    'participants.read', 'participants.create_staff', 'participants.update',
    'consent.read', 'consent.withdraw',
    'tokens.create', 'tokens.revoke',
    'capacity.read', 'capacity.update',
    'cv.read', 'cv.upload',
    'jobs.read',
    'placements.read',
    'outcomes.read', 'outcomes.create', 'outcomes.update',
    'data_quality.read', 'data_quality.resolve',
    'reports.read',
  ],
};

// Returns the permission array for a role (['*'] for it_admin), or [] if unknown.
function permissionsForRole(role) {
  return ROLE_PERMISSIONS[String(role || '').toLowerCase()] || [];
}

// ─── PASSWORD HASHING (PBKDF2-HMAC-SHA256) ────────────────────────────────────

function hashPassword(password, salt) {
  var saltHex  = salt || bytesToHex(randomBytes(32));
  var digest   = _pbkdf2(password, saltHex, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN);
  return { hash: digest, salt: saltHex };
}

function verifyPassword(password, storedHash, storedSalt) {
  var result = _pbkdf2(password, storedSalt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN);
  return _constantTimeEqual(result, storedHash);
}

// PBKDF2-HMAC-SHA256 (single block DK, sufficient for 256-bit output).
function _pbkdf2(password, salt, iterations, keyLen) {
  // U1 = HMAC(password, salt || 0x00000001)
  var block1  = salt + '\x00\x00\x00\x01';
  var u       = _hmacSha256Bytes(password, block1);
  var result  = u.slice(0);

  for (var i = 1; i < iterations; i++) {
    var uStr = String.fromCharCode.apply(null, u.map(function(b) { return b < 0 ? b + 256 : b; }));
    u        = _hmacSha256Bytes(password, uStr);
    for (var j = 0; j < result.length; j++) {
      result[j] ^= (u[j] < 0 ? u[j] + 256 : u[j]);
    }
  }

  return bytesToHex(result.slice(0, keyLen));
}

function _hmacSha256Bytes(key, data) {
  return Utilities.computeHmacSha256Signature(data, key);
}

// Constant-time string comparison to prevent timing attacks.
function _constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToHex(bytes) {
  return bytes.map(function(b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
}

function randomBytes(n) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid() + String(Date.now())
  ).slice(0, n);
}

// ─── SESSION TOKENS ───────────────────────────────────────────────────────────
// Format: staffUserId:expiresAtEpoch:hmac
// expiresAtEpoch = integer seconds since Unix epoch (NOT ISO string).
// hmac = HMAC-SHA256(staffUserId + ':' + expiresAtEpoch, STAFF_SESSION_SECRET).

function generateSessionToken(staffUserId) {
  return generateSession(staffUserId).sessionToken;
}

// Returns { sessionToken, expiresAt } where expiresAt is epoch seconds.
function generateSession(staffUserId) {
  var expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_HOURS * 3600;
  var payload   = staffUserId + ':' + expiresAt;
  var secret    = getConfig('STAFF_SESSION_SECRET');
  var hmac      = bytesToHex(Utilities.computeHmacSha256Signature(payload, secret));
  return { sessionToken: payload + ':' + hmac, expiresAt: expiresAt };
}

function parseSessionToken(sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null;
  var parts = sessionToken.split(':');
  // staffUserId may contain hyphens but not colons; expiresAtEpoch is numeric; hmac is last 64 hex chars
  if (parts.length < 3) return null;
  var hmac          = parts[parts.length - 1];
  var expiresAt     = parts[parts.length - 2];
  var staffUserId   = parts.slice(0, parts.length - 2).join(':');
  return { staffUserId: staffUserId, expiresAt: parseInt(expiresAt, 10), hmac: hmac };
}

/**
 * Validates a session token. Returns the Staff_Users record on success.
 * Throws AUTH_REQUIRED on any failure.
 */
function validateSession(sessionToken) {
  var parsed = parseSessionToken(sessionToken);
  if (!parsed) throw appError('AUTH_REQUIRED', 'Invalid session token format.');

  if (CacheService.getScriptCache().get('revoked_session_' + hashValue(sessionToken))) {
    throw appError('AUTH_REQUIRED', 'Session has been logged out. Please log in again.');
  }

  var nowEpoch = Math.floor(Date.now() / 1000);
  if (isNaN(parsed.expiresAt) || parsed.expiresAt <= nowEpoch) {
    throw appError('AUTH_REQUIRED', 'Session has expired. Please log in again.');
  }

  var secret      = getConfig('STAFF_SESSION_SECRET');
  var payload     = parsed.staffUserId + ':' + parsed.expiresAt;
  var hmacBytes   = Utilities.computeHmacSha256Signature(payload, secret);
  var expectedHmac = bytesToHex(hmacBytes);

  if (!_constantTimeEqual(parsed.hmac, expectedHmac)) {
    throw appError('AUTH_REQUIRED', 'Invalid session token signature.');
  }

  // Load the staff user record
  var staffUser = _getStaffUserById(parsed.staffUserId);
  if (!staffUser) throw appError('AUTH_REQUIRED', 'Staff user not found.');
  if (staffUser.status !== 'active') throw appError('AUTH_REQUIRED', 'Staff account is not active.');

  staffUser.sessionExpiresAt = parsed.expiresAt;
  return staffUser;
}

function getCurrentStaffUser(sessionToken) {
  return validateSession(sessionToken);
}

// ─── PERMISSION CHECKS ────────────────────────────────────────────────────────

/**
 * Throws FORBIDDEN if the staff user's role lacks the given permission.
 * staffUser is the object returned by validateSession().
 */
function requirePermission(staffUser, permission) {
  if (!staffUser || !staffUser.role) throw appError('FORBIDDEN', 'Permission check failed: no role on staff record.');
  var role  = String(staffUser.role).toLowerCase();
  var perms = ROLE_PERMISSIONS[role];
  if (!perms) throw appError('FORBIDDEN', 'Unknown role: ' + role);
  if (perms.indexOf('*') >= 0) return;
  if (perms.indexOf(permission) < 0) {
    throw appError('FORBIDDEN', 'Role "' + role + '" does not have permission: ' + permission);
  }
}

function hasPermission(staffUser, permission) {
  try { requirePermission(staffUser, permission); return true; }
  catch (_) { return false; }
}

// ─── STAFF LOGIN ──────────────────────────────────────────────────────────────

function staffLogin(payload, requestId) {
  var email    = normalizeEmail(payload.email || '');
  var password = String(payload.password || '');

  if (!email || !password) {
    throw appError('VALIDATION_ERROR', 'Email and password are required.');
  }

  // Rate limit check — atomic via LockService
  _enforceLoginRateLimit(email);

  // Load staff user
  var staffUser = _getStaffUserByEmail(email);

  if (!staffUser || !staffUser.passwordHash || staffUser.status !== 'active') {
    _recordLoginFailure(email, requestId, 'user_not_found_or_inactive');
    throw appError('AUTH_REQUIRED', 'Invalid credentials.');
  }

  // Verify password
  var valid = verifyPassword(password, staffUser.passwordHash, staffUser.passwordSalt);
  if (!valid) {
    _recordLoginFailure(email, requestId, 'wrong_password');
    throw appError('AUTH_REQUIRED', 'Invalid credentials.');
  }

  // Clear failure counter on success
  CacheService.getScriptCache().remove('login_fail_count_' + email);

  var session = generateSession(staffUser.staffUserId);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:    requestId || '',
    action:       EVENT.STAFF_LOGIN_SUCCESS,
    entityType:   'staff',
    entityId:     staffUser.staffUserId,
    status:       'success',
    summary:      'Login from ' + (payload.ipAddress || 'unknown'),
  }));

  // Flat fields are consumed by the staff dashboard auth client; `staff` nests
  // them to match API_CONTRACT.md.
  return {
    sessionToken:     session.sessionToken,
    sessionExpiresAt: session.expiresAt,
    staffUserId:      staffUser.staffUserId,
    email:            staffUser.email,
    displayName:      staffUser.displayName,
    role:             staffUser.role,
    permissions:      permissionsForRole(staffUser.role),
    staff: {
      email:       staffUser.email,
      role:        staffUser.role,
      permissions: permissionsForRole(staffUser.role),
    },
  };
}

function _enforceLoginRateLimit(email) {
  var lock  = LockService.getScriptLock();
  var cache = CacheService.getScriptCache();
  var key   = 'login_fail_count_' + email;

  try {
    lock.waitLock(5000);
    var count = parseInt(cache.get(key) || '0', 10);
    if (count >= RATE_LIMIT_MAX_FAILURES) {
      throw appError('RATE_LIMITED', 'Too many failed login attempts. Try again in 15 minutes.');
    }
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function _recordLoginFailure(email, requestId, reason) {
  var lock  = LockService.getScriptLock();
  var cache = CacheService.getScriptCache();
  var key   = 'login_fail_count_' + email;

  try {
    lock.waitLock(5000);
    var count = parseInt(cache.get(key) || '0', 10) + 1;
    cache.put(key, String(count), RATE_LIMIT_WINDOW_SECS);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }

  appendAudit({
    requestId:  requestId || '',
    action:     EVENT.STAFF_LOGIN_FAILED,
    actorType:  'staff',
    actorId:    email,
    entityType: 'staff',
    status:     'failed',
    summary:    reason,
  });
}

// ─── STAFF LOGOUT ─────────────────────────────────────────────────────────────

// Sessions are stateless HMAC tokens, so logout revokes via a CacheService
// denylist keyed by token hash (TTL = remaining token lifetime).
function staffLogout(sessionToken, requestId) {
  try {
    var staffUser = validateSession(sessionToken);
    _revokeSessionToken(sessionToken);
    appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
      requestId:  requestId || '',
      action:     EVENT.STAFF_LOGOUT,
      entityType: 'staff',
      entityId:   staffUser.staffUserId,
      status:     'success',
    }));
    return { loggedOut: true };
  } catch (_) {
    _revokeSessionToken(sessionToken);
    return { loggedOut: true };
  }
}

function _revokeSessionToken(sessionToken) {
  try {
    if (!sessionToken) return;
    var parsed   = parseSessionToken(sessionToken);
    var nowEpoch = Math.floor(Date.now() / 1000);
    var ttl      = 21600; // CacheService max
    if (parsed && !isNaN(parsed.expiresAt)) {
      ttl = Math.min(Math.max(parsed.expiresAt - nowEpoch, 1), 21600);
    }
    CacheService.getScriptCache().put('revoked_session_' + hashValue(sessionToken), '1', ttl);
  } catch (_) {}
}

// ─── SESSION REFRESH ──────────────────────────────────────────────────────────

function staffRefreshSession(sessionToken, requestId) {
  var staffUser = validateSession(sessionToken);
  var session   = generateSession(staffUser.staffUserId);
  _revokeSessionToken(sessionToken); // old token must not outlive the refresh

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:  requestId || '',
    action:     EVENT.STAFF_SESSION_REFRESHED,
    entityType: 'staff',
    entityId:   staffUser.staffUserId,
    status:     'success',
  }));

  return {
    sessionToken:     session.sessionToken,
    sessionExpiresAt: session.expiresAt,
    staffUserId:      staffUser.staffUserId,
    email:            staffUser.email,
    displayName:      staffUser.displayName,
    role:             staffUser.role,
    permissions:      permissionsForRole(staffUser.role),
  };
}

// ─── BOOTSTRAP FIRST ADMIN ────────────────────────────────────────────────────

/**
 * Creates the first IT Admin account. Self-seals after first use.
 * Must only be callable when no IT Admin exists in Staff_Users.
 */
function bootstrapFirstAdmin(payload) {
  var sheet = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);

  // Self-seal: check for any existing IT Admin
  if (sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.STAFF_USERS.length).getValues();
    var idx  = {};
    for (var i = 0; i < HEADERS.STAFF_USERS.length; i++) idx[HEADERS.STAFF_USERS[i]] = i;
    var hasAdmin = rows.some(function(row) {
      return String(row[idx.role] || '').toLowerCase() === 'it_admin' &&
             String(row[idx.status] || '') === 'active';
    });
    if (hasAdmin) throw appError('FORBIDDEN', 'Bootstrap has already been completed.');
  }

  var adminEmail = getConfigOptional('ADMIN_BOOTSTRAP_EMAIL');
  if (adminEmail && normalizeEmail(payload.email) !== normalizeEmail(adminEmail)) {
    throw appError('FORBIDDEN', 'Bootstrap email does not match configured admin email.');
  }

  var password = String(payload.password || '');
  if (!password || password.length < 12) {
    throw appError('VALIDATION_ERROR', 'Password must be at least 12 characters.');
  }

  var hashed      = hashPassword(password);
  var staffUserId = Utilities.getUuid();
  var now         = new Date().toISOString();

  sheet.appendRow([
    staffUserId,
    normalizeEmail(payload.email),
    payload.displayName || 'IT Admin',
    'it_admin',
    'active',
    hashed.hash,
    hashed.salt,
    '',          // lastLoginAt
    0,           // failedLoginCount
    now,         // createdAt
    'bootstrap', // createdBy
    now,         // lastUpdatedAt
    'bootstrap', // lastUpdatedBy
  ]);

  appendAudit({
    action:     EVENT.STAFF_USER_CREATED,
    actorType:  'system',
    actorId:    'bootstrap',
    entityType: 'staff',
    entityId:   staffUserId,
    status:     'success',
    summary:    'First IT Admin account created via bootstrap.',
  });

  return { staffUserId: staffUserId, role: 'it_admin' };
}

// ─── STAFF USER MANAGEMENT ────────────────────────────────────────────────────

function createStaffUser(payload, adminSession) {
  var admin = validateSession(adminSession);
  requirePermission(admin, 'staff.manage');

  var email       = normalizeEmail(payload.email || '');
  var role        = String(payload.role || '').toLowerCase();
  var displayName = String(payload.displayName || payload.display_name || '');
  var password    = String(payload.password || '');

  if (!email || !role || !displayName || !password) {
    throw appError('VALIDATION_ERROR', 'email, role, displayName, and password are required.');
  }
  if (!ROLE_PERMISSIONS[role]) {
    throw appError('VALIDATION_ERROR', 'Invalid role: ' + role);
  }
  if (password.length < 12) {
    throw appError('VALIDATION_ERROR', 'Password must be at least 12 characters.');
  }

  // Check for existing email
  var existing = _getStaffUserByEmail(email);
  if (existing) throw appError('CONFLICT', 'A staff user with this email already exists.');

  var hashed      = hashPassword(password);
  var staffUserId = Utilities.getUuid();
  var now         = new Date().toISOString();
  var sheet       = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);

  sheet.appendRow([
    staffUserId, email, displayName, role, 'active',
    hashed.hash, hashed.salt,
    '', 0, now, admin.staffUserId, now, admin.staffUserId,
  ]);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: admin }), {
    action:     EVENT.STAFF_USER_CREATED,
    entityType: 'staff',
    entityId:   staffUserId,
    status:     'success',
    summary:    'Created ' + role + ' account for ' + email,
  }));

  return { staffUserId: staffUserId, email: email, role: role };
}

function updateStaffUser(payload, adminSession, requestId) {
  var admin = validateSession(adminSession);
  requirePermission(admin, 'staff.manage');

  var sheet   = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);
  var rowIdx  = _findStaffUserRow(payload.staffUserId);
  if (rowIdx < 0) throw appError('NOT_FOUND', 'Staff user not found.');

  var current = rowToObject(HEADERS.STAFF_USERS, sheet.getRange(rowIdx, 1, 1, HEADERS.STAFF_USERS.length).getValues()[0]);
  var updates = {};
  var changed = [];

  if (payload.role && payload.role !== current.role) {
    if (!ROLE_PERMISSIONS[payload.role]) throw appError('VALIDATION_ERROR', 'Invalid role.');
    updates.role = payload.role;
    changed.push('role');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status') && payload.status !== current.status) {
    if (['active', 'inactive'].indexOf(payload.status) < 0) throw appError('VALIDATION_ERROR', 'Invalid status.');
    updates.status = payload.status;
    changed.push('status');
  }
  if (payload.displayName && payload.displayName !== current.displayName) {
    updates.displayName = payload.displayName;
    changed.push('displayName');
  }
  if (payload.newPassword) {
    if (payload.newPassword.length < 12) throw appError('VALIDATION_ERROR', 'Password must be at least 12 characters.');
    var hashed = hashPassword(payload.newPassword);
    updates.passwordHash = hashed.hash;
    updates.passwordSalt = hashed.salt;
    changed.push('password');
  }

  if (!changed.length) return { updated: false };

  updateRow(sheet, HEADERS.STAFF_USERS, rowIdx, updates);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: admin }), {
    requestId:  requestId || '',
    action:     changed.includes('role') ? EVENT.STAFF_ROLE_CHANGED : EVENT.STAFF_USER_CREATED,
    entityType: 'staff',
    entityId:   payload.staffUserId,
    status:     'success',
    summary:    'Updated: ' + changed.join(', '),
    metadata:   { changedFields: changed },
  }));

  return { updated: true, changedFields: changed };
}

// ─── STAFF USER LOOKUPS ───────────────────────────────────────────────────────

function _getStaffUserByEmail(email) {
  var sheet = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.STAFF_USERS.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.STAFF_USERS.length; i++) idx[HEADERS.STAFF_USERS[i]] = i;
  for (var r = 0; r < rows.length; r++) {
    if (normalizeEmail(rows[r][idx.email]) === normalizeEmail(email)) {
      return rowToObject(HEADERS.STAFF_USERS, rows[r]);
    }
  }
  return null;
}

function _getStaffUserById(staffUserId) {
  var sheet = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.STAFF_USERS.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.STAFF_USERS.length; i++) idx[HEADERS.STAFF_USERS[i]] = i;
  for (var r = 0; r < rows.length; r++) {
    if (rows[r][idx.staffUserId] === staffUserId) return rowToObject(HEADERS.STAFF_USERS, rows[r]);
  }
  return null;
}

function _findStaffUserRow(staffUserId) {
  var sheet = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);
  if (sheet.getLastRow() < 2) return -1;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.STAFF_USERS.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.STAFF_USERS.length; i++) idx[HEADERS.STAFF_USERS[i]] = i;
  for (var r = 0; r < rows.length; r++) {
    if (rows[r][idx.staffUserId] === staffUserId) return r + 2;
  }
  return -1;
}
