// ═══════════════════════════════════════════════════════════════════════════════
//  STAFF READ ENDPOINTS — paginated, role-gated list reads for the dashboards.
//  All return { <key>: [...], total, cursor }. limit:0 returns just the count.
// ═══════════════════════════════════════════════════════════════════════════════

// Shared paginate/sort helper. Sorts by sortField descending when provided.
function _paginateList(records, payload, sortField) {
  var limit  = (payload.limit === 0 || payload.limit === '0') ? 0 : (parseInt(payload.limit, 10) || 100);
  var offset = parseInt(payload.offset || payload.cursor, 10) || 0;
  if (isNaN(offset) || offset < 0) offset = 0;

  if (sortField) {
    records.sort(function(a, b) { return String(b[sortField] || '').localeCompare(String(a[sortField] || '')); });
  }
  var total  = records.length;
  var page   = (limit === 0) ? [] : records.slice(offset, offset + limit);
  var cursor = (limit !== 0 && offset + limit < total) ? (offset + limit) : null;
  return { page: page, total: total, cursor: cursor };
}

function _matchesQuery(record, q, fields) {
  if (!q) return true;
  var hay = fields.map(function(f) { return String(record[f] || ''); }).join(' ').toLowerCase();
  return hay.indexOf(q.toLowerCase()) >= 0;
}

// ─── CV RECORDS ────────────────────────────────────────────────────────────────

function searchCvRecords(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'cv.read');

  var status = String(payload.status || '').trim();
  var q      = String(payload.q || payload.query || '').trim();
  var sheet  = getOrCreateSheet(SHEET.CV_RECORDS, HEADERS.CV_RECORDS);

  var records = getRecords(sheet, HEADERS.CV_RECORDS).filter(function(r) {
    if (status && r.parserStatus !== status && r.uploadStatus !== status && r.reviewStatus !== status) return false;
    return _matchesQuery(r, q, ['cvRecordId', 'participantId', 'originalFileName', 'uploadSource']);
  });

  var pg = _paginateList(records, payload, 'createdAt');
  return successResponse('', { cvRecords: pg.page, total: pg.total, cursor: pg.cursor });
}

// ─── JOB MATCHES ─────────────────────────────────────────────────────────────

function searchMatches(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'matching.review');

  var pid   = String(payload.participantId || '').trim();
  var q     = String(payload.q || payload.query || '').trim();
  var sheet = getOrCreateSheet(SHEET.JOB_MATCHES, HEADERS.JOB_MATCHES);

  var records = getRecords(sheet, HEADERS.JOB_MATCHES).filter(function(r) {
    if (pid && String(r.participantId || '') !== pid) return false;
    return _matchesQuery(r, q, ['matchId', 'participantId', 'jobOpportunityId']);
  });

  var pg = _paginateList(records, payload, 'createdAt');
  return successResponse('', { matches: pg.page, total: pg.total, cursor: pg.cursor });
}

// ─── PLACEMENTS ────────────────────────────────────────────────────────────────

function searchPlacements(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'placements.read');

  var q     = String(payload.q || payload.query || '').trim();
  var sheet = getOrCreateSheet(SHEET.JOB_PLACEMENT, HEADERS.JOB_PLACEMENT);

  var records = getRecords(sheet, HEADERS.JOB_PLACEMENT).filter(function(r) {
    return _matchesQuery(r, q, ['placementId', 'participantId', 'employerName', 'jobRole']);
  }).map(function(r) { return _sanitizeChildForRole(r, staff.role, 'placement'); });

  var pg = _paginateList(records, payload, 'createdAt');
  return successResponse('', { placements: pg.page, total: pg.total, cursor: pg.cursor });
}

// ─── JOB OPPORTUNITIES ─────────────────────────────────────────────────────────

function searchJobOpportunities(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.read');

  var q      = String(payload.q || payload.query || '').trim();
  var status = String(payload.status || '').trim();
  var sheet  = getOrCreateSheet(SHEET.JOB_OPPORTUNITIES, HEADERS.JOB_OPPORTUNITIES);

  var records = getRecords(sheet, HEADERS.JOB_OPPORTUNITIES).filter(function(r) {
    if (status && r.status !== status) return false;
    return _matchesQuery(r, q, ['jobOpportunityId', 'employerName', 'jobRole', 'sector', 'industry', 'region']);
  });

  var pg = _paginateList(records, payload, 'createdAt');
  return successResponse('', { jobs: pg.page, total: pg.total, cursor: pg.cursor });
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────

function getAuditLog(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'audit.read');

  var pid    = String(payload.participantId || '').trim();
  var action = String(payload.action || '').trim();
  var sheet  = getOrCreateSheet(SHEET.AUDIT_LOG, HEADERS.AUDIT_LOG);

  var records = getRecords(sheet, HEADERS.AUDIT_LOG).filter(function(r) {
    if (pid    && String(r.participantId || '') !== pid)  return false;
    if (action && String(r.action || '')        !== action) return false;
    return true;
  });

  var pg = _paginateList(records, payload, 'timestamp');
  return successResponse('', { entries: pg.page, total: pg.total, cursor: pg.cursor });
}

// ─── STAFF USERS ─────────────────────────────────────────────────────────────

function listStaffUsers(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'staff.manage');

  var sheet = getOrCreateSheet(SHEET.STAFF_USERS, HEADERS.STAFF_USERS);
  var records = getRecords(sheet, HEADERS.STAFF_USERS).map(function(u) {
    // Never expose credential material.
    delete u.passwordHash;
    delete u.passwordSalt;
    return u;
  });

  var pg = _paginateList(records, payload, 'createdAt');
  return successResponse('', { staffUsers: pg.page, total: pg.total, cursor: pg.cursor });
}

// ─── SCHEMA BOOTSTRAP (admin) ──────────────────────────────────────────────────

function runBootstrapAction(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'system.configure');
  var result = bootstrapSchema();
  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    action:     EVENT.SCHEMA_BOOTSTRAPPED,
    entityType: 'system',
    status:     'success',
    summary:    result.message || 'Schema bootstrap run.',
  }));
  return successResponse('', result);
}
