// ═══════════════════════════════════════════════════════════════════════════════
//  PARTICIPANTS — CRUD, lookup, idempotency, merge, archive
// ═══════════════════════════════════════════════════════════════════════════════

// ─── IDEMPOTENCY ──────────────────────────────────────────────────────────────

var IDEMPOTENCY_TTL_DAYS = 30;

/**
 * Returns the cached response object if a prior run of the same requestId+action
 * was completed, or null if this is a new request.
 *
 * If a row exists with the same requestId+action but a DIFFERENT requestHash, the
 * caller is reusing an idempotency key with a different body — throws CONFLICT per
 * API_CONTRACT.md. Pass requestHash (hashValue of the request payload) to enable
 * that check; omit it to skip body comparison.
 */
function checkIdempotency(requestId, action, actorId, requestHash) {
  if (!requestId) return null;
  var sheet = getOrCreateSheet(SHEET.IDEMPOTENCY_LOG, HEADERS.IDEMPOTENCY_LOG);
  if (sheet.getLastRow() < 2) return null;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.IDEMPOTENCY_LOG.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.IDEMPOTENCY_LOG.length; i++) idx[HEADERS.IDEMPOTENCY_LOG[i]] = i;

  var now = Date.now();
  for (var r = 0; r < rows.length; r++) {
    if (String(rows[r][idx.requestId] || '') !== String(requestId)) continue;
    if (String(rows[r][idx.action]    || '') !== String(action))    continue;

    var ttl = new Date(rows[r][idx.ttlExpiresAt] || 0).getTime();
    if (ttl && ttl < now) return null; // expired — treat as new request

    // Same key, different body → conflict
    if (requestHash && String(rows[r][idx.requestHash] || '') &&
        String(rows[r][idx.requestHash]) !== String(requestHash)) {
      throw appError('CONFLICT', 'This requestId was already used with a different request body.');
    }

    var stored = rows[r][idx.resultDataJson];
    if (!stored) return null;
    try { return JSON.parse(String(stored)); } catch (_) { return null; }
  }
  return null;
}

/**
 * Records a completed action result so duplicate requests return the same response.
 * Column order MUST match HEADERS.IDEMPOTENCY_LOG.
 */
function writeIdempotency(requestId, action, actorId, responseObj, requestHash, participantId) {
  if (!requestId) return;
  try {
    var sheet     = getOrCreateSheet(SHEET.IDEMPOTENCY_LOG, HEADERS.IDEMPOTENCY_LOG);
    var now       = new Date();
    var ttl       = new Date(now.getTime() + IDEMPOTENCY_TTL_DAYS * 86400 * 1000).toISOString();
    var record    = {
      requestId:      requestId,
      action:         action,
      actorId:        actorId || '',
      participantId:  participantId || '',
      requestHash:    requestHash || '',
      resultStatus:   (responseObj && responseObj.status) || 'OK',
      resultDataJson: JSON.stringify(responseObj),
      createdAt:      now.toISOString(),
      ttlExpiresAt:   ttl,
    };
    sheet.appendRow(HEADERS.IDEMPOTENCY_LOG.map(function(h) {
      return toSheetValue(record[h] !== undefined ? record[h] : '');
    }));
  } catch (err) {
    console.error('writeIdempotency failed: ' + err.message);
  }
}

// ─── CANDIDATE LOOKUP ─────────────────────────────────────────────────────────

/**
 * Validates a candidate token, returns the participant record + consent prefill.
 * Never returns tokenHash, passwordHash, or any staff-only fields.
 */
function getParticipantByToken(payload) {
  var rawToken = String(payload.token || '').trim();
  if (!rawToken) throw appError('VALIDATION_ERROR', 'token is required.');

  var tokenRecord = validateCandidateToken(rawToken);
  var participantId = tokenRecord.participantId;

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant record not found for this token.');

  var record = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  // Prefill telephone and name from consent if not yet filled in
  if (!record.telephone) record.telephone = record.consentPhone || '';
  if (!record.surname && !record.firstName && record.consentName) {
    var parts     = String(record.consentName).trim().split(/\s+/);
    record.surname    = parts[0] || '';
    record.firstName  = parts.slice(1).join(' ') || '';
  }

  appendAudit({
    participantId: participantId,
    actorType:  'candidate',
    actorId:    participantId,
    action:     EVENT.TOKEN_USED,
    entityType: 'token',
    entityId:   tokenRecord.tokenId,
    status:     'success',
    summary:    'Token used for ' + tokenRecord.purpose,
  });

  var stage = record.currentStage || 'participant_information';
  return successResponse('', {
    participant: {
      participantId:  record.participantId,
      currentStage:   stage,
      allowedActions: _allowedActionsForStage(stage),
      profile:        _sanitizeForCandidate(record),
    },
    tokenPurpose: tokenRecord.purpose,
  });
}

// Candidate allowedActions per currentStage — mirrors API_CONTRACT.md.
function _allowedActionsForStage(stage) {
  var map = {
    participant_information: ['saveParticipantInfo', 'uploadCvMetadata'],
    capacity_building:       ['submitCapacityBuilding', 'uploadCvMetadata'],
    cv_upload:               ['uploadCvMetadata'],
    cv_parsing:              [],
    job_matching:            [],
    job_placement:           [],
    outcome_tracking:        [],
    completed:               [],
    withdrawn:               [],
    archived:                [],
  };
  return map[stage] || [];
}

// ─── STAFF LOOKUPS ────────────────────────────────────────────────────────────

function getParticipantById(payload, sessionToken) {
  var staffUser     = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.read');
  var participantId = String(payload.participantId || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');

  var rowIndex = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var record      = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  return successResponse('', { participant: _sanitizeForRole(record, staffUser.role) });
}

/**
 * Paginated participant list / search (API_CONTRACT: query, filters, limit, cursor).
 * Matches on participantId, normalized phone, Ghana Card, or name tokens. Returns a
 * role-filtered list. `limit: 0` returns just the total (used for dashboard counts).
 *
 * Payload: { q | query, stage, overallStatus|status, limit, offset|cursor }
 * Response: { participants: [...], total, cursor }
 */
function searchParticipants(payload, sessionToken) {
  var staffUser = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.read');

  var q      = String(payload.query || payload.q || '').trim();
  var stage  = String(payload.stage || '').trim();
  var status = String(payload.overallStatus || payload.status || '').trim();
  var limit  = (payload.limit === 0 || payload.limit === '0') ? 0 : (parseInt(payload.limit, 10) || 50);
  var offset = parseInt(payload.offset || payload.cursor, 10) || 0;
  if (isNaN(offset) || offset < 0) offset = 0;

  var master = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  if (master.getLastRow() < 2) return successResponse('', { participants: [], total: 0, cursor: null });

  var qLower = q.toLowerCase();
  var qPhone = normalizePhone(q);
  var qGhana = /^GHA-/i.test(q) ? normalizeGhanaCard(q) : '';

  var matched = getRecords(master, HEADERS.MASTER).filter(function(r) {
    if (!r.participantId) return false;
    if (stage  && r.currentStage  !== stage)  return false;
    if (status && r.overallStatus !== status) return false;
    if (!q) return true;
    var hay = [r.participantId, r.surname, r.firstName, r.otherNames, r.consentName]
      .join(' ').toLowerCase();
    if (hay.indexOf(qLower) >= 0) return true;
    if (qPhone && String(r.participantPhoneNormalized || '') === qPhone) return true;
    if (qGhana && String(r.ghanaCardNormalized || '') === qGhana) return true;
    return false;
  });

  // Newest first.
  matched.sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });

  var total = matched.length;
  var page  = (limit === 0)
    ? []
    : matched.slice(offset, offset + limit).map(function(r) { return _sanitizeForRole(r, staffUser.role); });
  var cursor = (limit !== 0 && offset + limit < total) ? (offset + limit) : null;

  return successResponse('', { participants: page, total: total, cursor: cursor });
}

function getParticipantDetail(payload, sessionToken) {
  var staffUser = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.read');

  var participantId = String(payload.participantId || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var master = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  // Pull child tab records
  var info     = _getChildRecord(SHEET.PARTICIPANT_INFO,   HEADERS.PARTICIPANT_INFO,   participantId);
  var capacity = _getChildRecord(SHEET.CAPACITY_BUILDING,  HEADERS.CAPACITY_BUILDING,  participantId);
  var cvs      = _getChildRecords(SHEET.CV_RECORDS,        HEADERS.CV_RECORDS,         participantId);
  var placement = _getChildRecord(SHEET.JOB_PLACEMENT,     HEADERS.JOB_PLACEMENT,      participantId);

  if (staffUser.role === 'it_admin') {
    appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
      participantId: participantId,
      action:     EVENT.PARTICIPANT_SENSITIVE_VIEWED,
      entityType: 'participant',
      entityId:   participantId,
      status:     'success',
    }));
  }

  var role = staffUser.role;
  return successResponse('', {
    participant:      _sanitizeForRole(master, role),
    participantInfo:  _sanitizeChildForRole(info, role, 'info'),
    capacityBuilding: capacity,
    cvRecords:        (cvs || []).map(function(c) { return _sanitizeChildForRole(c, role, 'cv'); }),
    placement:        _sanitizeChildForRole(placement, role, 'placement'),
  });
}

// ─── SAVE PARTICIPANT INFO (candidate-facing) ─────────────────────────────────

function saveParticipantInfo(payload, requestId) {
  var rawToken  = String(payload.token || '').trim();
  if (!rawToken) throw appError('VALIDATION_ERROR', 'token is required.');

  var tokenRecord = validateCandidateToken(rawToken, 'registration');
  var participantId = tokenRecord.participantId;

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'saveParticipantInfo', participantId, reqHash);
    if (cached) return cached;
  }

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant record not found.');

  var existing = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  if (existing.overallStatus === 'withdrawn' || existing.overallStatus === 'archived') {
    throw appError('CONFLICT', 'Cannot update a ' + existing.overallStatus + ' participant record.');
  }

  var now      = new Date().toISOString();
  var phone    = normalizePhone(payload.telephone  || payload.consentPhone || payload.phone || '');
  var email    = normalizeEmail(payload.email      || payload.consentEmail || '');
  var ghanaCard = normalizeGhanaCard(payload.ghanaCardId || '');

  // Only accept known Master fields from the candidate
  var incoming = pickKnownFields(payload, HEADERS.MASTER);

  // Server-side overrides — never trust from client
  delete incoming.participantId;
  delete incoming.overallStatus;
  delete incoming.currentStage;
  delete incoming.createdAt;
  delete incoming.createdBy;
  delete incoming.consentStatus;
  delete incoming.consentSubmittedAt;
  delete incoming.consentName;
  delete incoming.consentPhone;
  delete incoming.consentEmail;
  delete incoming.consentSubmissionId;
  delete incoming.cvFileId;            // CV is handled by cv-handler.gs
  delete incoming.cvFileUrl;
  delete incoming.cvStatus;
  delete incoming.lastUpdatedAt;
  delete incoming.lastUpdatedBy;

  // Compute section completion
  var infoComplete = _assessParticipantInfoComplete(Object.assign({}, existing, incoming));

  var updates = Object.assign(incoming, {
    participantPhoneNormalized: phone || existing.participantPhoneNormalized || '',
    participantEmailNormalized: email || existing.participantEmailNormalized || '',
    ghanaCardNormalized:        ghanaCard  || existing.ghanaCardNormalized  || '',
    participantInfoStatus:      infoComplete ? 'complete' : 'in_progress',
    lastUpdatedAt:              now,
    lastUpdatedBy:              'candidate',
  });

  normalizeDisplayFields(updates);
  updateRow(masterSheet, HEADERS.MASTER, rowIndex, updates);

  // Persist the full registration detail to Participant_Information. Master only
  // holds a summary subset; PI-only fields (sector, idType, voterId, income,
  // disability, displacement, work location, …) must be saved from the payload.
  var piRecord = pickKnownFields(payload, HEADERS.PARTICIPANT_INFO);
  piRecord.participantId    = participantId;
  piRecord.submissionSource = 'candidate_frontend';
  piRecord.submissionStatus = updates.participantInfoStatus;
  piRecord.createdBy        = 'candidate';
  piRecord.lastUpdatedBy    = 'candidate';
  normalizeDisplayFields(piRecord);
  _upsertParticipantInfoTab(piRecord);

  // Auto-transition if info is now complete and participant is still in participant_information stage
  var finalStage = fullRecord.currentStage || existing.currentStage;
  if (infoComplete && existing.currentStage === 'participant_information') {
    try {
      var nextStage = _chooseNextStage(fullRecord);
      applyTransition(participantId, nextStage, { type: 'candidate', participantId: participantId });
      finalStage = nextStage;
    } catch (_) {
      // Guard not met yet — stay in current stage
    }
  }

  appendAudit({
    requestId:     requestId || '',
    participantId: participantId,
    actorType:     'candidate',
    actorId:       participantId,
    action:        infoComplete ? EVENT.PROFILE_SUBMITTED : EVENT.PROFILE_SAVED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       infoComplete ? 'Participant information complete' : 'Partial save',
    metadata:      { fieldsUpdated: Object.keys(incoming).length },
  });

  var result = successResponse(requestId, {
    participantId:          participantId,
    participantInfoStatus:  updates.participantInfoStatus,
    currentStage:           finalStage,
  });

  if (requestId) writeIdempotency(requestId, 'saveParticipantInfo', participantId, result, reqHash, participantId);
  return result;
}

// ─── ADMIN UPDATE ─────────────────────────────────────────────────────────────

function adminUpdateParticipant(payload, sessionToken, requestId) {
  var staffUser = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.update');

  var participantId = String(payload.participantId || '').trim();
  var reason        = String(payload.reason || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');
  if (!reason)        throw appError('VALIDATION_ERROR', 'reason is required for admin updates.');

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var existing = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  var updates  = pickKnownFields(payload.updates || {}, HEADERS.MASTER);

  // Prevent overwriting protected fields (consent evidence is immutable).
  delete updates.participantId;
  delete updates.createdAt;
  delete updates.createdBy;
  delete updates.consentStatus;
  delete updates.consentSubmittedAt;
  delete updates.consentName;
  delete updates.consentPhone;
  delete updates.consentEmail;
  delete updates.consentSubmissionId;

  var now = new Date().toISOString();
  updates.lastUpdatedAt = now;
  updates.lastUpdatedBy = staffUser.email || staffUser.staffUserId;

  // Before/after hash for sensitive field tracking
  var sensitiveFields   = ['telephone', 'email', 'ghanaCardId', 'surname', 'firstName'];
  var beforeValues      = sensitiveFields.reduce(function(acc, f) { acc[f] = existing[f] || ''; return acc; }, {});
  var beforeHash        = hashValue(JSON.stringify(beforeValues));

  updateRow(masterSheet, HEADERS.MASTER, rowIndex, updates);

  // Re-read and update child tab
  var updated       = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  var afterValues   = sensitiveFields.reduce(function(acc, f) { acc[f] = updated[f] || ''; return acc; }, {});
  var afterHash     = hashValue(JSON.stringify(afterValues));

  // Persist any Participant_Information-only edits supplied in payload.updates.
  var piEdits = pickKnownFields(payload.updates || {}, HEADERS.PARTICIPANT_INFO);
  piEdits.participantId = participantId;
  piEdits.lastUpdatedBy = staffUser.email || staffUser.staffUserId;
  _upsertParticipantInfoTab(piEdits);

  // Mark downstream sections needs_review if participant info fields were changed
  var infoFields = ['surname', 'firstName', 'telephone', 'ghanaCardId', 'region', 'educationLevel', 'employmentStatus'];
  var changed    = infoFields.filter(function(f) { return Object.prototype.hasOwnProperty.call(updates, f); });
  if (changed.length) markDownstreamNeedsReview(participantId, ['participantInfo']);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.PARTICIPANT_UPDATED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    beforeHash:    beforeHash,
    afterHash:     afterHash,
    summary:       reason,
    metadata:      { changedFields: Object.keys(updates), reason: reason },
  }));

  return successResponse(requestId, { participantId: participantId, updated: true });
}

// ─── STAFF-CREATED PARTICIPANT ────────────────────────────────────────────────

function createParticipantByStaff(payload, sessionToken, requestId) {
  var staffUser = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.create_staff');

  var phone    = normalizePhone(payload.telephone || payload.phone || '');
  var email    = normalizeEmail(payload.email || '');
  var name     = String(payload.name || payload.surname || '').trim();

  if (!phone && !name) throw appError('VALIDATION_ERROR', 'At least phone or name is required.');

  // Check for existing participant
  var existing = findParticipantRow({ phone: phone, email: email });
  if (existing > 0) throw appError('CONFLICT', 'A participant with this phone or email already exists.');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'createParticipantByStaff', staffUser.staffUserId, reqHash);
    if (cached) return cached;
  }

  var participantId = generateParticipantId();
  var now           = new Date().toISOString();
  var master        = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);

  var record = blankRecord(HEADERS.MASTER);
  Object.assign(record, pickKnownFields(payload, HEADERS.MASTER), {
    participantId:              participantId,
    participantInfoStatus:      'in_progress',
    capacityBuildingStatus:     'not_started',
    cvStatus:                   'not_started',
    currentStage:               'participant_information',
    overallStatus:              'active',
    consentStatus:              'staff_created',
    participantPhoneNormalized: phone,
    participantEmailNormalized: email,
    createdAt:                  now,
    createdBy:                  staffUser.email || staffUser.staffUserId,
    lastUpdatedAt:              now,
    lastUpdatedBy:              staffUser.email || staffUser.staffUserId,
  });

  normalizeDisplayFields(record);
  master.appendRow(HEADERS.MASTER.map(function(h) { return toSheetValue(record[h] !== undefined ? record[h] : ''); }));

  // Persist full registration detail to Participant_Information (PI-only fields included).
  var piRecord = pickKnownFields(payload, HEADERS.PARTICIPANT_INFO);
  piRecord.participantId    = participantId;
  piRecord.submissionSource = 'staff_created';
  piRecord.submissionStatus = 'in_progress';
  piRecord.createdBy        = staffUser.email || staffUser.staffUserId;
  piRecord.lastUpdatedBy    = staffUser.email || staffUser.staffUserId;
  normalizeDisplayFields(piRecord);
  _upsertParticipantInfoTab(piRecord);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.PARTICIPANT_CREATED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       'Participant created by staff',
  }));

  var result = successResponse(requestId, { participantId: participantId, createdByStaff: true });
  if (requestId) writeIdempotency(requestId, 'createParticipantByStaff', staffUser.staffUserId, result, reqHash, participantId);
  return result;
}

// ─── MERGE DUPLICATES ─────────────────────────────────────────────────────────

function mergeDuplicateParticipants(payload, sessionToken, requestId) {
  var staffUser     = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.merge');

  var survivorId  = String(payload.survivorId  || '').trim();
  var duplicateId = String(payload.duplicateId || '').trim();
  var reason      = String(payload.reason      || '').trim();

  if (!survivorId || !duplicateId) throw appError('VALIDATION_ERROR', 'survivorId and duplicateId are required.');
  if (survivorId === duplicateId)  throw appError('VALIDATION_ERROR', 'survivorId and duplicateId must be different.');
  if (!reason)                     throw appError('VALIDATION_ERROR', 'reason is required for merges.');

  var masterSheet   = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var survivorRow   = findParticipantRow({ participantId: survivorId });
  var duplicateRow  = findParticipantRow({ participantId: duplicateId });

  if (survivorRow  < 0) throw appError('NOT_FOUND', 'Survivor participant not found.');
  if (duplicateRow < 0) throw appError('NOT_FOUND', 'Duplicate participant not found.');

  var survivor  = rowToObject(HEADERS.MASTER, masterSheet.getRange(survivorRow,  1, 1, HEADERS.MASTER.length).getValues()[0]);
  var duplicate = rowToObject(HEADERS.MASTER, masterSheet.getRange(duplicateRow, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  if (survivor.overallStatus  === 'archived') throw appError('CONFLICT', 'Survivor is archived.');
  if (duplicate.overallStatus === 'archived') throw appError('CONFLICT', 'Duplicate is archived.');

  var now = new Date().toISOString();

  // Revoke duplicate tokens
  revokeParticipantTokens(duplicateId, 'merged_into_' + survivorId);

  // Mark duplicate as duplicate
  updateRow(masterSheet, HEADERS.MASTER, duplicateRow, {
    overallStatus: 'duplicate',
    currentStage:  'archived',
    lastUpdatedAt: now,
    lastUpdatedBy: staffUser.email || staffUser.staffUserId,
    adminNotes:    (duplicate.adminNotes ? duplicate.adminNotes + ' | ' : '') + 'Merged into ' + survivorId + ' on ' + now,
  });

  // Write Merge_History row — column order MUST match HEADERS.MERGE_HISTORY:
  // mergeId, survivingParticipantId, mergedParticipantId, reason, mergedBy, mergedAt, fieldSummaryJson
  var mergeSheet = getOrCreateSheet(SHEET.MERGE_HISTORY, HEADERS.MERGE_HISTORY);
  var mergeRecord = {
    mergeId:                Utilities.getUuid(),
    survivingParticipantId: survivorId,
    mergedParticipantId:    duplicateId,
    reason:                 reason,
    mergedBy:               staffUser.email || staffUser.staffUserId,
    mergedAt:               now,
    fieldSummaryJson:       JSON.stringify({ survivor: survivorId, duplicate: duplicateId }),
  };
  mergeSheet.appendRow(HEADERS.MERGE_HISTORY.map(function(h) {
    return toSheetValue(mergeRecord[h] !== undefined ? mergeRecord[h] : '');
  }));

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:     requestId || '',
    participantId: survivorId,
    action:        EVENT.PARTICIPANT_MERGED,
    entityType:    'participant',
    entityId:      survivorId,
    status:        'success',
    summary:       'Merged ' + duplicateId + ' into ' + survivorId + '. Reason: ' + reason,
    metadata:      { survivorId: survivorId, duplicateId: duplicateId, reason: reason },
  }));

  return successResponse(requestId, { merged: true, survivorId: survivorId, duplicateId: duplicateId });
}

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────

function archiveParticipant(payload, sessionToken, requestId) {
  var staffUser     = validateSession(sessionToken);
  requirePermission(staffUser, 'participants.archive');

  var participantId = String(payload.participantId || '').trim();
  var reason        = String(payload.reason        || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');
  if (!reason)        throw appError('VALIDATION_ERROR', 'reason is required for archiving.');

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var record  = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  var actor   = { type: 'staff', staffUser: staffUser };

  applyTransition(participantId, 'archived', actor, reason);

  appendAudit(Object.assign(actorFields(actor), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.PARTICIPANT_ARCHIVED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       reason,
  }));

  return successResponse(requestId, { participantId: participantId, archived: true });
}

// ─── TRANSITION STATE ─────────────────────────────────────────────────────────

function transitionParticipantState(payload, sessionToken, requestId) {
  var staffUser     = validateSession(sessionToken);
  var participantId = String(payload.participantId || '').trim();
  var toStage       = String(payload.toStage       || '').trim();
  var reason        = String(payload.reason        || '').trim();

  if (!participantId || !toStage) throw appError('VALIDATION_ERROR', 'participantId and toStage are required.');

  // Per-target authorization. The state-machine guards additionally enforce
  // consent.withdraw / participants.archive for those terminal transitions.
  var TRANSITION_PERMISSION = {
    withdrawn:      'consent.withdraw',
    archived:       'participants.archive',
    job_matching:   'matching.review',
    job_placement:  'placements.create',
    outcome_tracking: 'outcomes.create',
    completed:      'outcomes.update',
  };
  requirePermission(staffUser, TRANSITION_PERMISSION[toStage] || 'participants.update');

  var actor = { type: 'staff', staffUser: staffUser };

  var updated = applyTransition(participantId, toStage, actor, reason);

  appendAudit(Object.assign(actorFields(actor), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.PARTICIPANT_STATE_TRANSITIONED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       'Transitioned to ' + toStage + (reason ? '. ' + reason : ''),
    metadata:      { toStage: toStage, reason: reason },
  }));

  return successResponse(requestId, {
    participantId:  participantId,
    currentStage:   updated.currentStage,
    overallStatus:  updated.overallStatus,
  });
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function _sanitizeForCandidate(record) {
  var copy   = Object.assign({}, record);
  var remove = [
    'continuationTokenHash', 'passwordHash', 'passwordSalt',
    'ghanaCardNormalized', 'participantPhoneNormalized', 'participantEmailNormalized',
    'adminNotes', 'legacyParticipantId',
  ];
  remove.forEach(function(k) { delete copy[k]; });
  return copy;
}

// Field-level filtering per ROLE_PERMISSIONS.md "Sensitive Field Access" table.
// Each role lists the Master fields it must NOT see. it_admin sees everything.
var _ROLE_HIDDEN_MASTER_FIELDS = {
  // Phone, email, Ghana Card, CV, income, admin notes all restricted from Partnerships.
  partnerships: [
    'telephone', 'participantPhoneNormalized', 'consentPhone',
    'email', 'participantEmailNormalized', 'consentEmail',
    'ghanaCardId', 'ghanaCardNormalized',
    'cvFileId', 'cvFileUrl', 'parserCategory', 'parserSubcategory', 'parserConfidence',
    'adminNotes',
  ],
  // Identity fields are IT Admin + M&E only; admin notes are IT Admin only.
  recruitment: ['ghanaCardId', 'ghanaCardNormalized', 'adminNotes'],
  // CV (parsed) is IT Admin + Recruitment only; identity fields hidden; admin notes IT Admin only.
  youth_engagement: [
    'cvFileId', 'cvFileUrl', 'parserCategory', 'parserSubcategory', 'parserConfidence',
    'ghanaCardId', 'ghanaCardNormalized', 'adminNotes',
  ],
  // M&E has limited identity access but no admin notes.
  me_officer: ['adminNotes'],
};

function _sanitizeForRole(record, role) {
  var copy = Object.assign({}, record);
  // Always strip internal hashes
  delete copy.continuationTokenHash;
  delete copy.passwordHash;
  delete copy.passwordSalt;

  var r = String(role || '').toLowerCase();
  if (r === 'it_admin') return copy;

  var hidden = _ROLE_HIDDEN_MASTER_FIELDS[r] || [];
  hidden.forEach(function(f) { delete copy[f]; });
  return copy;
}

// Filters child-tab records (Participant_Information, CV_Records, Job_Placement) for limited roles.
function _sanitizeChildForRole(record, role, kind) {
  if (!record) return record;
  var r = String(role || '').toLowerCase();
  if (r === 'it_admin') return record;
  var copy = Object.assign({}, record);

  // CV parsed text: IT Admin + Recruitment only.
  if (kind === 'cv' && r !== 'recruitment') {
    ['parsedName', 'parsedEmail', 'parsedPhone', 'parsedSkills',
     'parsedEducation', 'parsedExperience'].forEach(function(f) { delete copy[f]; });
  }
  // Identity + income fields: hidden from Partnerships and (identity) from non IT Admin/M&E.
  if (kind === 'info') {
    if (r === 'partnerships' || r === 'recruitment' || r === 'youth_engagement') {
      ['ghanaCardId', 'voterId'].forEach(function(f) { delete copy[f]; });
    }
    if (r === 'partnerships') {
      ['telephone', 'email', 'monthlyIncome', 'incomeFrequency'].forEach(function(f) { delete copy[f]; });
    }
  }
  if (kind === 'placement' && r === 'partnerships') {
    ['placementIncome', 'placementIncomeFreq'].forEach(function(f) { delete copy[f]; });
  }
  return copy;
}

function _assessParticipantInfoComplete(record) {
  var required = ['surname', 'firstName', 'sex', 'dob', 'telephone', 'region', 'educationLevel', 'employmentStatus'];
  return required.every(function(f) { return Boolean(String(record[f] || '').trim()); });
}

function _chooseNextStage(record) {
  // Capacity building is an optional stage controlled by System_Config. When
  // enabled, every participant passes through it (they can mark it not
  // applicable); otherwise skip straight to CV upload.
  var cfg = getSystemConfig();
  if (cfg.enableCapacityBuilding !== 'false') return 'capacity_building';
  return 'cv_upload';
}

// Upserts the participant's Participant_Information row (one row per participant).
// Merges new values over any existing row so partial saves accumulate detail
// instead of creating duplicate rows.
function _upsertParticipantInfoTab(record) {
  try {
    var sheet = getOrCreateSheet(SHEET.PARTICIPANT_INFO, HEADERS.PARTICIPANT_INFO);
    var now   = new Date().toISOString();
    var pidIdx = HEADERS.PARTICIPANT_INFO.indexOf('participantId');
    var rowNum = -1;

    if (sheet.getLastRow() >= 2) {
      var ids = sheet.getRange(2, pidIdx + 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '') === record.participantId) { rowNum = i + 2; break; }
      }
    }

    if (rowNum > 0) {
      var existing = rowToObject(HEADERS.PARTICIPANT_INFO, sheet.getRange(rowNum, 1, 1, HEADERS.PARTICIPANT_INFO.length).getValues()[0]);
      // Only overwrite with non-empty incoming values; never blank existing data.
      var merged = Object.assign({}, existing);
      Object.keys(record).forEach(function(k) {
        if (record[k] !== undefined && record[k] !== '') merged[k] = record[k];
      });
      merged.lastUpdatedAt = now;
      sheet.getRange(rowNum, 1, 1, HEADERS.PARTICIPANT_INFO.length)
        .setValues([HEADERS.PARTICIPANT_INFO.map(function(h) { return toSheetValue(merged[h] !== undefined ? merged[h] : ''); })]);
    } else {
      var rec = Object.assign({ participantInfoSubmissionId: 'PINFO-' + Utilities.getUuid().slice(0, 8).toUpperCase(), createdAt: now, lastUpdatedAt: now }, record);
      sheet.appendRow(HEADERS.PARTICIPANT_INFO.map(function(h) { return toSheetValue(rec[h] !== undefined ? rec[h] : ''); }));
    }
  } catch (err) {
    console.error('_upsertParticipantInfoTab failed: ' + err.message);
  }
}

function _getChildRecord(sheetName, headers, participantId) {
  var sheet = getOrCreateSheet(sheetName, headers);
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var idx  = headers.indexOf('participantId');
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][idx] || '') === participantId) {
      return rowToObject(headers, rows[i]);
    }
  }
  return null;
}

function _getChildRecords(sheetName, headers, participantId) {
  var sheet = getOrCreateSheet(sheetName, headers);
  if (sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var idx  = headers.indexOf('participantId');
  return rows
    .filter(function(row) { return String(row[idx] || '') === participantId; })
    .map(function(row)    { return rowToObject(headers, row); });
}
