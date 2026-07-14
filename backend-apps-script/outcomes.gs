// ═══════════════════════════════════════════════════════════════════════════════
//  OUTCOMES — follow-up outcome tracking after placement
// ═══════════════════════════════════════════════════════════════════════════════

function recordOutcome(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'outcomes.create');

  var participantId = String(payload.participantId || '').trim();
  var placementId   = String(payload.placementId   || '').trim();
  var followUpDate  = String(payload.followUpDate   || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');
  if (!followUpDate)  throw appError('VALIDATION_ERROR', 'followUpDate is required.');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'recordOutcome', staff.staffUserId, reqHash);
    if (cached) return cached;
  }

  var masterRow = findParticipantRow({ participantId: participantId });
  if (masterRow < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var now   = new Date().toISOString();
  var actor = staff.email || staff.staffUserId;
  var id    = generateOutcomeId();
  var sheet = getOrCreateSheet(SHEET.OUTCOME_TRACKING, HEADERS.OUTCOME_TRACKING);

  var record = Object.assign(pickKnownFields(payload, HEADERS.OUTCOME_TRACKING), {
    outcomeId:     id,
    participantId: participantId,
    placementId:   placementId,
    followUpDate:  followUpDate,
    createdAt:     now,
    createdBy:     actor,
  });
  sheet.appendRow(HEADERS.OUTCOME_TRACKING.map(function(h) { return toSheetValue(record[h] !== undefined ? record[h] : ''); }));
  invalidateRecordsCache(SHEET.OUTCOME_TRACKING);

  // Update the Master outcome summary. Mark complete when the participant has exited.
  var retention   = String(payload.retentionStatus || '').toLowerCase();
  var outcomeStatus = (retention === 'exited') ? 'complete' : 'in_progress';
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var masterUpdates = { outcomeStatus: outcomeStatus, lastUpdatedAt: now, lastUpdatedBy: actor };

  // Mirror the latest outcome onto Master so lists/pipeline don't need an
  // Outcome_Tracking scan. Only overwrite when this follow-up is the newest.
  var existingMaster = rowToObject(HEADERS.MASTER,
    masterSheet.getRange(masterRow, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  var existingDate = String(existingMaster.latestOutcomeDate || '');
  if (!existingDate || followUpDate >= existingDate) {
    masterUpdates.latestOutcomeEmployed = String(payload.currentlyEmployed || '').toLowerCase();
    masterUpdates.latestOutcomeDate     = followUpDate;
  }
  updateRow(masterSheet, HEADERS.MASTER, masterRow, masterUpdates);

  // Move to completed when outcome tracking is complete (guard re-checks).
  if (outcomeStatus === 'complete') {
    try { applyTransition(participantId, 'completed', { type: 'staff', staffUser: staff }, 'Outcome tracking complete'); } catch (_) {}
  }

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', participantId: participantId, action: EVENT.OUTCOME_CREATED,
    entityType: 'outcome', entityId: id, status: 'success',
    summary: 'Outcome recorded (' + (payload.currentlyEmployed || 'n/a') + ')',
  }));

  var result = successResponse(requestId, { outcomeId: id, participantId: participantId, outcomeStatus: outcomeStatus });
  if (requestId) writeIdempotency(requestId, 'recordOutcome', staff.staffUserId, result, reqHash, participantId);
  return result;
}
