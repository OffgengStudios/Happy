// ═══════════════════════════════════════════════════════════════════════════════
//  CAPACITY BUILDING — optional training records (candidate or staff)
// ═══════════════════════════════════════════════════════════════════════════════

function generateCapacityRecordId() {
  return 'CAP-' + new Date().getFullYear() + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/**
 * Records a capacity-building submission and advances the participant to cv_upload.
 * Auth: candidate token (payload.token) OR staff session with capacity.update.
 */
function submitCapacityBuilding(payload, sessionToken, requestId) {
  var rawToken = String(payload.token || '').trim();
  var actor, participantId, actorId;

  if (rawToken) {
    var tokenRecord = validateCandidateToken(rawToken, 'registration');
    participantId   = tokenRecord.participantId;
    actor           = { type: 'candidate', participantId: participantId };
    actorId         = participantId;
  } else if (sessionToken) {
    var staffUser = validateSession(sessionToken);
    requirePermission(staffUser, 'capacity.update');
    participantId = String(payload.participantId || '').trim();
    if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');
    actor   = { type: 'staff', staffUser: staffUser };
    actorId = staffUser.email || staffUser.staffUserId;
  } else {
    throw appError('AUTH_REQUIRED', 'Provide a candidate token or staff session token.');
  }

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'submitCapacityBuilding', participantId, reqHash);
    if (cached) return cached;
  }

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var existing = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  if (existing.overallStatus === 'withdrawn' || existing.overallStatus === 'archived') {
    throw appError('CONFLICT', 'Cannot update a ' + existing.overallStatus + ' participant record.');
  }

  var now        = new Date().toISOString();
  var trained    = String(payload.trainedByPartner || '').trim();
  var applicable = /^(yes|true)$/i.test(trained);
  var status     = applicable ? 'complete' : 'not_applicable';

  // Write Capacity_Building child record (column names match HEADERS.CAPACITY_BUILDING).
  var cbSheet = getOrCreateSheet(SHEET.CAPACITY_BUILDING, HEADERS.CAPACITY_BUILDING);
  var record  = {
    capacityRecordId:     generateCapacityRecordId(),
    participantId:        participantId,
    submissionId:         requestId || '',
    trainedByPartner:     trained,
    trainingStartDate:    String(payload.trainingStartDate    || ''),
    trainingEndDate:      String(payload.trainingEndDate      || ''),
    trainingLocation:     String(payload.trainingLocation     || ''),
    trainingMode:         String(payload.trainingMode         || ''),
    virtualPlatform:      String(payload.virtualPlatform      || ''),
    trainerType:          String(payload.trainerType          || ''),
    trainingPartner:      String(payload.trainingPartner      || ''),
    completionStatus:     String(payload.completionStatus     || ''),
    certificateIssued:    String(payload.certificateIssued    || ''),
    modules:              String(payload.modules              || ''),
    digitalSkills:        String(payload.digitalSkills        || ''),
    wishTraining:         String(payload.wishTraining         || ''),
    previousTrainings:    String(payload.previousTrainings    || ''),
    previousTrainingDesc: String(payload.previousTrainingDesc || ''),
    createdAt:            now,
    createdBy:            actorId,
  };
  cbSheet.appendRow(HEADERS.CAPACITY_BUILDING.map(function(h) {
    return toSheetValue(record[h] !== undefined ? record[h] : '');
  }));

  // Mirror status to Master.
  updateRow(masterSheet, HEADERS.MASTER, rowIndex, {
    capacityBuildingStatus: status,
    lastUpdatedAt:          now,
    lastUpdatedBy:          actorId,
  });

  // Advance to cv_upload (guard requires capacityBuildingStatus complete/not_applicable).
  var finalStage = existing.currentStage;
  try {
    var updated = applyTransition(participantId, 'cv_upload', actor);
    finalStage  = updated.currentStage;
  } catch (_) {
    // Guard not met (e.g. participant info incomplete) — stay in current stage.
  }

  appendAudit(Object.assign(actorFields(actor), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.CAPACITY_SUBMITTED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       'Capacity building ' + status,
    metadata:      { trainedByPartner: trained },
  }));

  var result = successResponse(requestId, {
    participantId:           participantId,
    capacityBuildingStatus:  status,
    currentStage:            finalStage,
  });

  if (requestId) writeIdempotency(requestId, 'submitCapacityBuilding', participantId, result, reqHash, participantId);
  return result;
}
