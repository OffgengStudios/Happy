// ═══════════════════════════════════════════════════════════════════════════════
//  JOB OPPORTUNITIES — Partnerships create/update employer opportunities
// ═══════════════════════════════════════════════════════════════════════════════

function createJobOpportunity(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.create');

  var employerName = String(payload.employerName || '').trim();
  if (!employerName) throw appError('VALIDATION_ERROR', 'employerName is required.');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'createJobOpportunity', staff.staffUserId, reqHash);
    if (cached) return cached;
  }

  var now   = new Date().toISOString();
  var actor = staff.email || staff.staffUserId;
  var id    = generateJobOpportunityId();
  var sheet = getOrCreateSheet(SHEET.JOB_OPPORTUNITIES, HEADERS.JOB_OPPORTUNITIES);

  var record = Object.assign(pickKnownFields(payload, HEADERS.JOB_OPPORTUNITIES), {
    jobOpportunityId: id,
    status:           String(payload.status || 'open'),
    openings:         Number(payload.openings) || 1,
    createdAt:        now,
    createdBy:        actor,
    lastUpdatedAt:    now,
    lastUpdatedBy:    actor,
  });
  sheet.appendRow(HEADERS.JOB_OPPORTUNITIES.map(function(h) { return toSheetValue(record[h] !== undefined ? record[h] : ''); }));

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', action: 'job.created', entityType: 'job_opportunity',
    entityId: id, status: 'success', summary: 'Created opportunity for ' + employerName,
  }));

  var result = successResponse(requestId, { jobOpportunityId: id });
  if (requestId) writeIdempotency(requestId, 'createJobOpportunity', staff.staffUserId, result, reqHash, '');
  return result;
}

function updateJobOpportunity(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.update');

  var id = String(payload.jobOpportunityId || '').trim();
  if (!id) throw appError('VALIDATION_ERROR', 'jobOpportunityId is required.');

  var sheet = getOrCreateSheet(SHEET.JOB_OPPORTUNITIES, HEADERS.JOB_OPPORTUNITIES);
  var rowNum = _findRowById(sheet, HEADERS.JOB_OPPORTUNITIES, 'jobOpportunityId', id);
  if (rowNum < 0) throw appError('NOT_FOUND', 'Job opportunity not found.');

  var updates = pickKnownFields(payload, HEADERS.JOB_OPPORTUNITIES);
  delete updates.jobOpportunityId; delete updates.createdAt; delete updates.createdBy;
  updates.lastUpdatedAt = new Date().toISOString();
  updates.lastUpdatedBy = staff.email || staff.staffUserId;
  updateRow(sheet, HEADERS.JOB_OPPORTUNITIES, rowNum, updates);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', action: 'job.updated', entityType: 'job_opportunity',
    entityId: id, status: 'success', summary: 'Updated opportunity',
  }));

  return successResponse(requestId, { jobOpportunityId: id, updated: true });
}

// ─── SHARED HELPER ─────────────────────────────────────────────────────────────
// Find a 1-based sheet row by an id column. Returns -1 if not found.
function _findRowById(sheet, headers, idField, idValue) {
  if (sheet.getLastRow() < 2) return -1;
  var col  = headers.indexOf(idField);
  var vals = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '') === String(idValue)) return i + 2;
  }
  return -1;
}

// Splits a comma/pipe/semicolon-separated skills string into a lowercased token list.
function _splitSkills(value) {
  return String(value || '')
    .split(/[,;|]+/)
    .map(function(s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
}
