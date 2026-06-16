// ═══════════════════════════════════════════════════════════════════════════════
//  STATE MACHINE — lifecycle transition validation and application
// ═══════════════════════════════════════════════════════════════════════════════

const ACTIVE_STAGES = [
  'consent', 'participant_information', 'capacity_building', 'cv_upload',
  'cv_parsing', 'job_matching', 'job_placement', 'outcome_tracking', 'completed',
];

const ARCHIVABLE_STAGES = ['completed', 'withdrawn'];

// Explicit stage-to-stage transitions (excluding "any active → withdrawn" and "archivable → archived")
const EXPLICIT_TRANSITIONS = [
  { from: 'consent',                 to: 'participant_information', guards: [_guardConsentToParticipantInfo] },
  { from: 'participant_information', to: 'capacity_building',       guards: [_guardParticipantInfoComplete] },
  { from: 'participant_information', to: 'cv_upload',               guards: [_guardParticipantInfoComplete] },
  { from: 'capacity_building',       to: 'cv_upload',               guards: [_guardCapacityBuildingToCV] },
  { from: 'cv_upload',               to: 'cv_parsing',              guards: [_guardCVUploadToParsing] },
  { from: 'cv_upload',               to: 'job_matching',            guards: [_guardCVUploadToJobMatchingNoCV] },
  { from: 'cv_parsing',              to: 'cv_upload',               guards: [] },  // parser failed — no data guard
  { from: 'cv_parsing',              to: 'job_matching',            guards: [_guardCVParsingToJobMatching] },
  { from: 'job_matching',            to: 'job_placement',           guards: [_guardJobMatchingToPlacement] },
  { from: 'job_placement',           to: 'outcome_tracking',        guards: [_guardPlacementToOutcomeTracking] },
  { from: 'outcome_tracking',        to: 'completed',               guards: [_guardOutcomeToCompleted] },
];

// ─── VALIDATE ─────────────────────────────────────────────────────────────────

/**
 * Returns { valid:true } or { valid:false, errorCode, message }.
 * record = rowToObject output from Master. actor = { type:'candidate'|'staff'|'system', ... }
 */
function validateTransition(fromStage, toStage, record, actor) {
  if (toStage === 'withdrawn') {
    if (ACTIVE_STAGES.indexOf(fromStage) < 0) {
      return { valid: false, errorCode: 'CONFLICT', message: 'Cannot withdraw from stage: ' + fromStage };
    }
    return _runGuards([_guardToWithdrawn], record, actor);
  }

  if (toStage === 'archived') {
    if (ARCHIVABLE_STAGES.indexOf(fromStage) < 0) {
      return { valid: false, errorCode: 'CONFLICT', message: 'Only completed or withdrawn participants can be archived.' };
    }
    return _runGuards([_guardToArchived], record, actor);
  }

  var rule = null;
  for (var i = 0; i < EXPLICIT_TRANSITIONS.length; i++) {
    if (EXPLICIT_TRANSITIONS[i].from === fromStage && EXPLICIT_TRANSITIONS[i].to === toStage) {
      rule = EXPLICIT_TRANSITIONS[i];
      break;
    }
  }
  if (!rule) {
    return { valid: false, errorCode: 'CONFLICT', message: 'No valid transition from ' + fromStage + ' to ' + toStage + '.' };
  }

  return _runGuards(rule.guards, record, actor);
}

function _runGuards(guards, record, actor) {
  for (var i = 0; i < guards.length; i++) {
    var result = guards[i](record, actor);
    if (result && !result.valid) return result;
  }
  return { valid: true };
}

// ─── APPLY ────────────────────────────────────────────────────────────────────

/**
 * Validates then writes the transition. Caller must have already checked idempotency.
 * Returns the updated Master record object.
 */
function applyTransition(participantId, toStage, actor, reason) {
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found: ' + participantId);

  var record    = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  var fromStage = String(record.currentStage || 'consent');

  if (fromStage === toStage) return record;  // idempotent no-op

  // Expose the caller-supplied reason to guards (used by manual/no-CV transitions).
  if (actor && reason && actor.reason === undefined) actor.reason = reason;

  var check = validateTransition(fromStage, toStage, record, actor);
  if (!check.valid) throw appError(check.errorCode || 'CONFLICT', check.message);

  var now           = new Date().toISOString();
  var overallStatus = _deriveOverallStatus(toStage);
  var actorId       = (actor && actor.type === 'staff' && actor.staffUser)
    ? (actor.staffUser.email || actor.staffUser.staffUserId)
    : (actor && actor.type) || 'system';

  updateRow(masterSheet, HEADERS.MASTER, rowIndex, {
    currentStage:  toStage,
    overallStatus: overallStatus,
    lastUpdatedAt: now,
    lastUpdatedBy: actorId,
  });

  // Revoke tokens when withdrawing
  if (toStage === 'withdrawn') {
    revokeParticipantTokens(participantId, reason || 'withdrawn');
  }

  // Re-read the updated record and return it
  var updated = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  return updated;
}

function _deriveOverallStatus(stage) {
  if (stage === 'withdrawn') return 'withdrawn';
  if (stage === 'archived')  return 'archived';
  if (stage === 'completed') return 'completed';
  return 'active';
}

// ─── GUARD FUNCTIONS ──────────────────────────────────────────────────────────

function _pass()  { return { valid: true }; }
function _fail(errorCode, message) { return { valid: false, errorCode: errorCode, message: message }; }

function _guardConsentToParticipantInfo(record) {
  if (!record.participantId) return _fail('CONFLICT', 'participantId not yet assigned.');
  if (!record.consentSubmittedAt && record.consentStatus !== 'complete' && record.consentStatus !== 'staff_created') {
    return _fail('CONFLICT', 'Consent record not saved.');
  }
  if (!record.consentName && !record.consentPhone && !record.participantPhoneNormalized) {
    return _fail('CONFLICT', 'Name or phone required from consent.');
  }
  return _pass();
}

function _guardParticipantInfoComplete(record) {
  if (record.participantInfoStatus !== 'complete') {
    return _fail('VALIDATION_ERROR', 'Participant information is not yet complete.');
  }
  var blocking = getBlockingDqIssues(record.participantId, ['duplicate']);
  if (blocking.length) {
    return _fail('CONFLICT', 'Unresolved blocking duplicate issue prevents progression.');
  }
  return _pass();
}

function _guardCapacityBuildingToCV(record) {
  if (record.capacityBuildingStatus !== 'complete' && record.capacityBuildingStatus !== 'not_applicable') {
    return _fail('CONFLICT', 'Capacity building must be complete or not_applicable.');
  }
  return _pass();
}

function _guardCVUploadToParsing(record) {
  if (!record.cvFileId) {
    return _fail('CONFLICT', 'No CV file ID recorded on the participant record.');
  }
  if (record.cvStatus === 'failed' || record.cvStatus === 'not_started') {
    return _fail('CONFLICT', 'CV file metadata not yet confirmed. Current status: ' + (record.cvStatus || 'unknown'));
  }
  return _pass();
}

function _guardCVUploadToJobMatchingNoCV(record, actor) {
  if (!actor || actor.type !== 'staff') {
    return _fail('FORBIDDEN', 'Only staff can mark a participant eligible without a CV.');
  }
  if (!actor.reason) {
    return _fail('VALIDATION_ERROR', 'A reason is required when bypassing CV upload.');
  }
  if (!record.firstName || !record.surname) {
    return _fail('VALIDATION_ERROR', 'Participant must have first name and surname before matching without CV.');
  }
  return _pass();
}

function _guardCVParsingToJobMatching(record, actor) {
  var validStatuses = ['parsed', 'reviewed', 'deferred'];
  if (validStatuses.indexOf(record.cvStatus) < 0) {
    return _fail('CONFLICT', 'CV must be parsed, reviewed, or deferred. Current status: ' + (record.cvStatus || 'unknown'));
  }
  // Job category from parser output (parserCategory), or a staff override reason.
  var hasJobCategory = record.parserCategory || (actor && actor.reason);
  if (!hasJobCategory) {
    return _fail('CONFLICT', 'A job category must exist from parser output, participant profile, or staff override.');
  }
  return _pass();
}

function _guardJobMatchingToPlacement(record, actor) {
  if (!actor || actor.type !== 'staff') {
    return _fail('FORBIDDEN', 'Only staff can initiate placement.');
  }
  // A recorded matching decision (Master.matchingStatus) or a manual placement reason.
  var hasMatchBasis = (record.matchingStatus && record.matchingStatus !== 'not_started') || actor.reason;
  if (!hasMatchBasis) {
    return _fail('CONFLICT', 'A match decision or manual placement reason must be recorded before placement.');
  }
  return _pass();
}

function _guardPlacementToOutcomeTracking(record) {
  if (!record.placementStatus || record.placementStatus === 'not_started') {
    return _fail('CONFLICT', 'A placement record must exist before outcome tracking begins.');
  }
  return _pass();
}

function _guardOutcomeToCompleted(record) {
  if (record.outcomeStatus !== 'complete') {
    return _fail('CONFLICT', 'Outcome tracking must be complete before marking the record completed.');
  }
  return _pass();
}

function _guardToWithdrawn(record, actor) {
  if (!actor) return _fail('FORBIDDEN', 'Actor required for withdrawal.');
  if (actor.type === 'candidate') return _pass();
  if (actor.type === 'staff') {
    if (!_actorHasPermission(actor, 'consent.withdraw')) {
      return _fail('FORBIDDEN', 'Staff role lacks consent.withdraw permission.');
    }
    return _pass();
  }
  return _fail('FORBIDDEN', 'Unrecognised actor type for withdrawal.');
}

function _guardToArchived(record, actor) {
  if (!actor || actor.type !== 'staff') {
    return _fail('FORBIDDEN', 'Only staff can archive a participant.');
  }
  if (!_actorHasPermission(actor, 'participants.archive')) {
    return _fail('FORBIDDEN', 'Staff role lacks participants.archive permission.');
  }
  var blocking = getBlockingDqIssues(record.participantId, ['critical', 'high']);
  if (blocking.length) {
    return _fail('CONFLICT', 'Resolve open blocking data quality issues before archiving.');
  }
  return _pass();
}

// ─── PERMISSION HELPER ────────────────────────────────────────────────────────

// Single source of truth: ROLE_PERMISSIONS from auth.gs (same global scope in
// Apps Script). Do NOT keep a second copy here — it caused permission-name drift.
function _actorHasPermission(actor, permission) {
  if (!actor || actor.type !== 'staff' || !actor.staffUser) return false;
  var role  = String(actor.staffUser.role || '').toLowerCase();
  var perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.indexOf('*') >= 0) return true;
  return perms.indexOf(permission) >= 0;
}

// ─── DATA QUALITY INTEGRATION ─────────────────────────────────────────────────

/**
 * Returns open Data_Quality_Issues rows for a participant with the given severities.
 */
function getBlockingDqIssues(participantId, severities) {
  if (!participantId) return [];
  var sheet = getOrCreateSheet(SHEET.DATA_QUALITY_ISSUES, HEADERS.DATA_QUALITY_ISSUES);
  if (sheet.getLastRow() < 2) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.DATA_QUALITY_ISSUES.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.DATA_QUALITY_ISSUES.length; i++) {
    idx[HEADERS.DATA_QUALITY_ISSUES[i]] = i;
  }

  var sev = severities || ['critical', 'high'];
  return rows.filter(function(row) {
    var pid    = String(row[idx.participantId] || '').trim();
    var status = String(row[idx.status]        || '').trim();
    var sv     = String(row[idx.severity]      || '').trim().toLowerCase();
    return pid === participantId &&
           (status === 'open' || status === 'in_review') &&
           sev.indexOf(sv) >= 0;
  }).map(function(row) {
    return rowToObject(HEADERS.DATA_QUALITY_ISSUES, row);
  });
}

// ─── CORRECTION HELPER ────────────────────────────────────────────────────────

/**
 * After an earlier-stage correction, marks affected downstream section statuses as needs_review.
 * Returns the list of status fields that were flagged.
 */
function markDownstreamNeedsReview(participantId, affectedDomains) {
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex    = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) return [];

  var record  = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
  var updates = { lastUpdatedAt: new Date().toISOString() };
  var flagged = [];

  // Status field names MUST be canonical Master columns.
  var downstreamMap = {
    participantInfo: ['cvStatus', 'capacityBuildingStatus'],
    cvUpload:        ['matchingStatus'],
    cvParsed:        ['matchingStatus', 'placementStatus'],
    jobMatching:     ['placementStatus', 'outcomeStatus'],
  };

  (affectedDomains || []).forEach(function(domain) {
    var downstream = downstreamMap[domain] || [];
    downstream.forEach(function(statusField) {
      if (record[statusField] && record[statusField] !== 'not_started' && record[statusField] !== 'not_applicable') {
        updates[statusField] = 'needs_review';
        flagged.push(statusField);
      }
    });
  });

  if (flagged.length) {
    updateRow(masterSheet, HEADERS.MASTER, rowIndex, updates);
  }

  return flagged;
}
