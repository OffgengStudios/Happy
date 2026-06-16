// ═══════════════════════════════════════════════════════════════════════════════
//  PLACEMENTS — record and update job placements
// ═══════════════════════════════════════════════════════════════════════════════

function recordPlacement(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'placements.create');

  var participantId = String(payload.participantId || '').trim();
  var employerName  = String(payload.employerName  || '').trim();
  var startDate     = String(payload.placementStartDate || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');
  if (!employerName)  throw appError('VALIDATION_ERROR', 'employerName is required.');
  if (!startDate)     throw appError('VALIDATION_ERROR', 'placementStartDate is required.');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'recordPlacement', staff.staffUserId, reqHash);
    if (cached) return cached;
  }

  var masterRow = findParticipantRow({ participantId: participantId });
  if (masterRow < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var now   = new Date().toISOString();
  var actor = staff.email || staff.staffUserId;
  var id    = generatePlacementId();
  var sheet = getOrCreateSheet(SHEET.JOB_PLACEMENT, HEADERS.JOB_PLACEMENT);

  var record = Object.assign(pickKnownFields(payload, HEADERS.JOB_PLACEMENT), {
    placementId:     id,
    participantId:   participantId,
    employerName:    employerName,
    placementStartDate: startDate,
    placementStatus: String(payload.placementStatus || 'placed'),
    createdAt:       now,
    createdBy:       actor,
    lastUpdatedAt:   now,
    lastUpdatedBy:   actor,
  });
  sheet.appendRow(HEADERS.JOB_PLACEMENT.map(function(h) { return toSheetValue(record[h] !== undefined ? record[h] : ''); }));

  // Update Master summary and advance lifecycle to outcome tracking.
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  updateRow(masterSheet, HEADERS.MASTER, masterRow, {
    placementStatus: 'placed', outcomeStatus: 'not_started', lastUpdatedAt: now, lastUpdatedBy: actor,
  });
  var staffActor = { type: 'staff', staffUser: staff };
  try { applyTransition(participantId, 'job_placement', staffActor, 'Placement recorded'); } catch (_) {}
  try { applyTransition(participantId, 'outcome_tracking', staffActor, 'Placement recorded'); } catch (_) {}

  appendAudit(Object.assign(actorFields(staffActor), {
    requestId: requestId || '', participantId: participantId, action: EVENT.PLACEMENT_CREATED,
    entityType: 'placement', entityId: id, status: 'success',
    summary: 'Placed at ' + employerName, metadata: { employerName: employerName, startDate: startDate },
  }));

  var result = successResponse(requestId, { placementId: id, participantId: participantId });
  if (requestId) writeIdempotency(requestId, 'recordPlacement', staff.staffUserId, result, reqHash, participantId);
  return result;
}

function updatePlacement(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'placements.update');

  var id = String(payload.placementId || '').trim();
  if (!id) throw appError('VALIDATION_ERROR', 'placementId is required.');

  var sheet = getOrCreateSheet(SHEET.JOB_PLACEMENT, HEADERS.JOB_PLACEMENT);
  var rowNum = _findRowById(sheet, HEADERS.JOB_PLACEMENT, 'placementId', id);
  if (rowNum < 0) throw appError('NOT_FOUND', 'Placement not found.');

  var updates = pickKnownFields(payload, HEADERS.JOB_PLACEMENT);
  delete updates.placementId; delete updates.participantId; delete updates.createdAt; delete updates.createdBy;
  updates.lastUpdatedAt = new Date().toISOString();
  updates.lastUpdatedBy = staff.email || staff.staffUserId;
  updateRow(sheet, HEADERS.JOB_PLACEMENT, rowNum, updates);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', action: EVENT.PLACEMENT_UPDATED, entityType: 'placement',
    entityId: id, status: 'success', summary: 'Placement updated',
  }));

  return successResponse(requestId, { placementId: id, updated: true });
}
