// ═══════════════════════════════════════════════════════════════════════════════
//  DATA QUALITY — batch cursor scan, duplicate rules, issue management
// ═══════════════════════════════════════════════════════════════════════════════
//
// Note: getBlockingDqIssues() lives in state-machine.gs (same global scope).

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

var DQ_ISSUE_TYPE = {
  DUPLICATE_GHANA_CARD:        'duplicate_ghana_card',
  DUPLICATE_PHONE_NAME:        'duplicate_phone_name',
  DUPLICATE_EMAIL_NAME:        'duplicate_email_name',
  DUPLICATE_PHONE_DIFF_NAME:   'duplicate_phone_diff_name',
  DUPLICATE_NAME_DOB_DISTRICT: 'duplicate_name_dob_district',
  DUPLICATE_PARSER_CONTACT:    'duplicate_parser_contact',
  MISSING_REQUIRED_FIELD:      'missing_required_field',
  INVALID_FORMAT:              'invalid_format',
  STATE_INCONSISTENCY:         'state_inconsistency',
  CONSENT_MISMATCH:            'consent_mismatch',
};

// Severity by issue type
var _DQ_SEVERITY = {
  duplicate_ghana_card:        'critical',
  duplicate_phone_name:        'high',
  duplicate_email_name:        'high',
  duplicate_phone_diff_name:   'medium',
  duplicate_name_dob_district: 'high',
  duplicate_parser_contact:    'high',
  missing_required_field:      'medium',
  invalid_format:              'medium',
  state_inconsistency:         'high',
  consent_mismatch:            'medium',
};

// Assigned role by issue type
var _DQ_ASSIGNED_ROLE = {
  duplicate_ghana_card:        'it_admin',
  duplicate_phone_name:        'me_officer',
  duplicate_email_name:        'me_officer',
  duplicate_phone_diff_name:   'me_officer',
  duplicate_name_dob_district: 'it_admin',
  duplicate_parser_contact:    'recruitment',
  missing_required_field:      'youth_engagement',
  invalid_format:              'youth_engagement',
  state_inconsistency:         'me_officer',
  consent_mismatch:            'youth_engagement',
};

// ─── PUBLIC: STAFF-TRIGGERED SCAN ─────────────────────────────────────────────

function runDataQualityScan(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'data_quality.read');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  var cached  = checkIdempotency(requestId, 'runDataQualityScan', staff.staffUserId, reqHash);
  if (cached) return cached;

  var actor = { type: 'staff', actorId: staff.staffUserId, actorRole: staff.role };
  var result = _runDqScanBatch(requestId, actor);

  writeIdempotency(requestId, 'runDataQualityScan', staff.staffUserId, result, reqHash, '');
  return result;
}

// ─── TRIGGER CALLBACK (parameterless — called by time-based trigger) ──────────

function dqScanTriggerCallback() {
  var rid = generateRequestId();
  try {
    runHourlyMaintenance(); // purge expired idempotency rows + sweep expired tokens
  } catch (e) {
    console.error('runHourlyMaintenance: ' + (e.message || e));
  }
  try {
    _runDqScanBatch(rid, { type: 'system', actorId: 'dq_trigger', actorRole: 'system' });
  } catch (e) {
    appendAudit({
      auditId:   'AUD-' + rid,
      timestamp: new Date().toISOString(),
      requestId: rid,
      actorType: 'system',
      actorId:   'dq_trigger',
      action:    EVENT.DQ_SCAN_COMPLETED,
      status:    'error',
      summary:   'DQ trigger scan failed: ' + String(e.message || e),
    });
  }
}

// ─── INTERNAL BATCH ENGINE ────────────────────────────────────────────────────

function _runDqScanBatch(requestId, actor) {
  var sysConfig = getSystemConfig();
  var batchSize = parseInt(sysConfig.dqBatchSize, 10) || 250;
  var cursor    = sysConfig.dqScanCursor || '';

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var totalRows   = masterSheet.getLastRow() - 1; // excluding header
  if (totalRows < 1) {
    return successResponse(requestId, { scanned: 0, issuesCreated: 0, cursorReset: true });
  }

  // Resolve start offset from cursor (0-based)
  var startOffset = _resolveCursorOffset(masterSheet, cursor);
  var endOffset   = Math.min(startOffset + batchSize, totalRows);

  // Build cross-record lookup maps (all rows, compact fields only)
  var lookup = _buildDuplicateLookup(masterSheet, totalRows);

  // Pre-load existing open/in_review fingerprints to avoid re-creating issues
  var existingPrints = _loadExistingFingerprints();

  // Read batch rows
  var batchValues = masterSheet.getRange(
    startOffset + 2, 1,
    endOffset - startOffset,
    HEADERS.MASTER.length
  ).getValues();

  var issuesCreated   = 0;
  var lastProcessedId = cursor;

  for (var r = 0; r < batchValues.length; r++) {
    var record = rowToObject(HEADERS.MASTER, batchValues[r]);
    if (!record.participantId) continue;
    // Skip archived/duplicate — they are end-states, not actionable
    if (record.overallStatus === 'archived' || record.overallStatus === 'duplicate') continue;

    var issues = [];
    issues = issues.concat(_checkDuplicateRules(record, lookup));
    issues = issues.concat(_checkMissingRequiredFields(record));
    issues = issues.concat(_checkFormatRules(record, sysConfig));
    issues = issues.concat(_checkStateConsistency(record));
    issues = issues.concat(_checkConsentMismatch(record));

    for (var j = 0; j < issues.length; j++) {
      var fp = computeIssueFingerprint(
        issues[j].participantId,
        issues[j].issueType,
        issues[j].fieldName,
        issues[j].relatedParticipantId
      );
      if (existingPrints[fp]) continue; // already open or in_review
      if (createDataQualityIssue(issues[j])) {
        existingPrints[fp] = true;
        issuesCreated++;
      }
    }

    lastProcessedId = record.participantId;
  }

  // Advance or reset cursor
  var newCursor = (endOffset >= totalRows) ? '' : lastProcessedId;
  _setSystemConfigValue('dqScanCursor', newCursor);

  var result = successResponse(requestId, {
    scanned:       endOffset - startOffset,
    issuesCreated: issuesCreated,
    cursorReset:   newCursor === '',
    nextCursor:    newCursor,
  });

  appendAudit({
    auditId:      'AUD-' + requestId,
    timestamp:    new Date().toISOString(),
    requestId:    requestId,
    actorType:    actor.type,
    actorId:      actor.actorId,
    actorRole:    actor.actorRole,
    action:       EVENT.DQ_SCAN_COMPLETED,
    status:       'success',
    summary:      'DQ scan: scanned=' + (endOffset - startOffset) + ', issuesCreated=' + issuesCreated,
  });

  return result;
}

// ─── DUPLICATE LOOKUP BUILDER ─────────────────────────────────────────────────

function _buildDuplicateLookup(masterSheet, totalRows) {
  // Extract compact lookup fields: indices we need
  var h   = HEADERS.MASTER;
  var idx = {
    participantId:             h.indexOf('participantId'),
    overallStatus:             h.indexOf('overallStatus'),
    participantPhoneNormalized: h.indexOf('participantPhoneNormalized'),
    participantEmailNormalized: h.indexOf('participantEmailNormalized'),
    ghanaCardNormalized:       h.indexOf('ghanaCardNormalized'),
    surname:                   h.indexOf('surname'),
    firstName:                 h.indexOf('firstName'),
    otherNames:                h.indexOf('otherNames'),
    consentName:               h.indexOf('consentName'),
    dob:                       h.indexOf('dob'),
    district:                  h.indexOf('district'),
  };

  // Determine which columns we actually need (compact read)
  var cols = masterSheet.getRange(2, 1, totalRows, h.length).getValues();

  var phoneMap      = {};   // normalizedPhone → [{participantId, nameTokens, overallStatus}]
  var emailMap      = {};   // normalizedEmail → [...]
  var ghanaCardMap  = {};   // normalizedGhanaCard → [...]
  var nameDobMap    = {};   // key(name+dob+district) → [participantId]
  // For parser contact rule: load parsedPhone/parsedEmail from CV_Records
  var parsedContactMap = _buildParsedContactLookup();

  for (var i = 0; i < cols.length; i++) {
    var row = cols[i];
    var pid    = String(row[idx.participantId]             || '').trim();
    var status = String(row[idx.overallStatus]             || '').trim();
    var phone  = String(row[idx.participantPhoneNormalized] || '').trim();
    var email  = String(row[idx.participantEmailNormalized] || '').trim();
    var gc     = String(row[idx.ghanaCardNormalized]       || '').trim();
    var dob    = String(row[idx.dob]                       || '').slice(0, 10);
    var dist   = (String(row[idx.district]                 || '')).toLowerCase().trim();

    if (!pid) continue;
    if (status === 'archived' || status === 'duplicate') continue;

    var nameTokens = _extractNameTokens(
      String(row[idx.surname]    || ''),
      String(row[idx.firstName]  || ''),
      String(row[idx.otherNames] || ''),
      String(row[idx.consentName]|| '')
    );

    var entry = { participantId: pid, nameTokens: nameTokens, overallStatus: status, dob: dob, district: dist };

    if (phone) {
      if (!phoneMap[phone]) phoneMap[phone] = [];
      phoneMap[phone].push(entry);
    }
    if (email) {
      if (!emailMap[email]) emailMap[email] = [];
      emailMap[email].push(entry);
    }
    if (gc) {
      if (!ghanaCardMap[gc]) ghanaCardMap[gc] = [];
      ghanaCardMap[gc].push(entry);
    }

    var ndKey = _nameDobDistrictKey(nameTokens, dob, dist);
    if (ndKey) {
      if (!nameDobMap[ndKey]) nameDobMap[ndKey] = [];
      nameDobMap[ndKey].push(pid);
    }
  }

  return { phoneMap: phoneMap, emailMap: emailMap, ghanaCardMap: ghanaCardMap,
           nameDobMap: nameDobMap, parsedContactMap: parsedContactMap };
}

function _buildParsedContactLookup() {
  // parsedPhone/parsedEmail from CV_Records → participantId
  var sheet = getOrCreateSheet(SHEET.CV_RECORDS, HEADERS.CV_RECORDS);
  if (sheet.getLastRow() < 2) return { phones: {}, emails: {} };

  var h       = HEADERS.CV_RECORDS;
  var pidIdx  = h.indexOf('participantId');
  var phIdx   = h.indexOf('parsedPhone');
  var emIdx   = h.indexOf('parsedEmail');
  var stIdx   = h.indexOf('parserStatus');

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, h.length).getValues();
  var phones = {}, emails = {};

  for (var i = 0; i < rows.length; i++) {
    var pid    = String(rows[i][pidIdx] || '').trim();
    var status = String(rows[i][stIdx]  || '').trim();
    if (!pid || status !== 'parsed') continue;

    var ph = normalizePhone(String(rows[i][phIdx] || ''));
    var em = normalizeEmail(String(rows[i][emIdx] || ''));

    if (ph) {
      if (!phones[ph]) phones[ph] = [];
      phones[ph].push(pid);
    }
    if (em) {
      if (!emails[em]) emails[em] = [];
      emails[em].push(pid);
    }
  }

  return { phones: phones, emails: emails };
}

// ─── DUPLICATE RULES (6 rules) ────────────────────────────────────────────────

function _checkDuplicateRules(record, lookup) {
  var issues = [];
  var pid    = record.participantId;
  var phone  = String(record.participantPhoneNormalized || '').trim();
  var email  = String(record.participantEmailNormalized || '').trim();
  var gc     = String(record.ghanaCardNormalized || '').trim();
  var myTokens = _extractNameTokens(
    record.surname || '', record.firstName || '',
    record.otherNames || '', record.consentName || ''
  );

  // Rule 1: Same normalized Ghana Card → critical
  if (gc && lookup.ghanaCardMap[gc] && lookup.ghanaCardMap[gc].length > 1) {
    lookup.ghanaCardMap[gc].forEach(function(other) {
      if (other.participantId === pid) return;
      issues.push({
        participantId:        pid,
        relatedParticipantId: other.participantId,
        issueType:            DQ_ISSUE_TYPE.DUPLICATE_GHANA_CARD,
        severity:             'critical',
        fieldName:            'ghanaCardNormalized',
        currentValue:         gc,
        confidence:           1.0,
      });
    });
  }

  // Rules 2, 3, 4: Same phone or email
  if (phone && lookup.phoneMap[phone] && lookup.phoneMap[phone].length > 1) {
    lookup.phoneMap[phone].forEach(function(other) {
      if (other.participantId === pid) return;
      var overlap = _hasNameOverlap(myTokens, other.nameTokens);
      issues.push({
        participantId:        pid,
        relatedParticipantId: other.participantId,
        issueType:            overlap
          ? DQ_ISSUE_TYPE.DUPLICATE_PHONE_NAME
          : DQ_ISSUE_TYPE.DUPLICATE_PHONE_DIFF_NAME,
        severity:             overlap ? 'high' : 'medium',
        fieldName:            'participantPhoneNormalized',
        currentValue:         phone,
        confidence:           overlap ? 0.90 : 0.60,
      });
    });
  }

  if (email && lookup.emailMap[email] && lookup.emailMap[email].length > 1) {
    lookup.emailMap[email].forEach(function(other) {
      if (other.participantId === pid) return;
      var overlap = _hasNameOverlap(myTokens, other.nameTokens);
      if (!overlap) return; // email-only match without name overlap → too noisy
      issues.push({
        participantId:        pid,
        relatedParticipantId: other.participantId,
        issueType:            DQ_ISSUE_TYPE.DUPLICATE_EMAIL_NAME,
        severity:             'high',
        fieldName:            'participantEmailNormalized',
        currentValue:         email,
        confidence:           0.85,
      });
    });
  }

  // Rule 5: Same normalized name + DOB + district → high
  var myDob  = String(record.dob || '').slice(0, 10);
  var myDist = String(record.district || '').toLowerCase().trim();
  var ndKey  = _nameDobDistrictKey(myTokens, myDob, myDist);
  if (ndKey && lookup.nameDobMap[ndKey] && lookup.nameDobMap[ndKey].length > 1) {
    lookup.nameDobMap[ndKey].forEach(function(otherId) {
      if (otherId === pid) return;
      issues.push({
        participantId:        pid,
        relatedParticipantId: otherId,
        issueType:            DQ_ISSUE_TYPE.DUPLICATE_NAME_DOB_DISTRICT,
        severity:             'high',
        fieldName:            'surname,firstName,dob,district',
        currentValue:         ndKey,
        confidence:           0.88,
      });
    });
  }

  // Rule 6: Parser extracted contact matches another participant → high
  if (phone && lookup.parsedContactMap.phones[phone]) {
    lookup.parsedContactMap.phones[phone].forEach(function(otherId) {
      if (otherId === pid) return;
      issues.push({
        participantId:        pid,
        relatedParticipantId: otherId,
        issueType:            DQ_ISSUE_TYPE.DUPLICATE_PARSER_CONTACT,
        severity:             'high',
        fieldName:            'parsedPhone',
        currentValue:         phone,
        confidence:           0.80,
      });
    });
  }
  if (email && lookup.parsedContactMap.emails[email]) {
    lookup.parsedContactMap.emails[email].forEach(function(otherId) {
      if (otherId === pid) return;
      issues.push({
        participantId:        pid,
        relatedParticipantId: otherId,
        issueType:            DQ_ISSUE_TYPE.DUPLICATE_PARSER_CONTACT,
        severity:             'high',
        fieldName:            'parsedEmail',
        currentValue:         email,
        confidence:           0.75,
      });
    });
  }

  return issues;
}

// ─── MISSING REQUIRED FIELDS ──────────────────────────────────────────────────

function _checkMissingRequiredFields(record) {
  var issues = [];
  var pid    = record.participantId;
  var stage  = record.currentStage || '';

  // Consent fields — always required once a participant exists.
  // (No 'accepted' column on Master; acceptance is captured in the Consents tab.
  //  Staff-created participants legitimately have no consentSubmittedAt.)
  var consentRequired = (record.consentStatus === 'staff_created')
    ? ['consentStatus']
    : ['consentStatus', 'consentSubmittedAt'];
  consentRequired.forEach(function(f) {
    if (!record[f]) issues.push(_missingFieldIssue(pid, f, 'medium'));
  });
  if (!record.consentName && !record.consentPhone) {
    issues.push(_missingFieldIssue(pid, 'consentName_or_consentPhone', 'medium'));
  }

  // Participant information fields — required once past consent stage
  var infoStages = ['participant_information', 'capacity_building', 'cv_upload', 'cv_parsing',
                    'job_matching', 'job_placement', 'outcome_tracking', 'completed'];
  if (infoStages.indexOf(stage) >= 0) {
    var piRequired = ['surname', 'firstName', 'sex', 'telephone', 'region', 'district',
                      'educationLevel', 'employmentStatus'];
    piRequired.forEach(function(f) {
      if (!record[f]) issues.push(_missingFieldIssue(pid, f, 'medium'));
    });
  }

  return issues;
}

function _missingFieldIssue(participantId, fieldName, severity) {
  return {
    participantId:        participantId,
    relatedParticipantId: '',
    issueType:            DQ_ISSUE_TYPE.MISSING_REQUIRED_FIELD,
    severity:             severity || 'medium',
    fieldName:            fieldName,
    currentValue:         '',
    expectedValue:        'non-empty',
    confidence:           1.0,
  };
}

// ─── FORMAT RULES ─────────────────────────────────────────────────────────────

function _checkFormatRules(record, sysConfig) {
  var issues = [];
  var pid    = record.participantId;

  // participantId pattern
  var pidPattern = sysConfig.participantIdPattern || '^HAPPY-[0-9]{4}-[0-9]{6}$';
  if (pid && !new RegExp(pidPattern).test(pid)) {
    issues.push(_formatIssue(pid, 'participantId', pid, pidPattern));
  }

  // Phone
  if (record.telephone) {
    var phonePattern = sysConfig.phonePattern || '^0[0-9]{9}$';
    var norm = normalizePhone(record.telephone);
    if (!norm || !new RegExp(phonePattern).test(norm)) {
      issues.push(_formatIssue(pid, 'telephone', record.telephone, phonePattern));
    }
  }

  // Email
  if (record.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(record.email).trim())) {
      issues.push(_formatIssue(pid, 'email', record.email, 'valid email'));
    }
  }

  // Ghana Card
  if (record.ghanaCardId && record.idType === 'Ghana Card') {
    var gcPattern = sysConfig.ghanaCardPattern || '^GHA-[0-9]{9}-[0-9]$';
    if (!new RegExp(gcPattern, 'i').test(String(record.ghanaCardId).trim())) {
      issues.push(_formatIssue(pid, 'ghanaCardId', record.ghanaCardId, gcPattern));
    }
  }

  // DOB plausibility (age 15–35 at registration is program eligibility range)
  if (record.dob) {
    var dob = new Date(record.dob);
    if (!isNaN(dob.getTime())) {
      var ageMs    = Date.now() - dob.getTime();
      var ageDays  = ageMs / 86400000;
      if (ageDays < 365 * 15 || ageDays > 365 * 65) {
        issues.push(_formatIssue(pid, 'dob', record.dob, 'plausible program age (15–65)'));
      }
    } else {
      issues.push(_formatIssue(pid, 'dob', record.dob, 'valid ISO date'));
    }
  }

  // parserConfidence must be 0–1 when present
  if (record.parserConfidence !== '' && record.parserConfidence !== undefined) {
    var conf = parseFloat(record.parserConfidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      issues.push(_formatIssue(pid, 'parserConfidence', record.parserConfidence, '0.0–1.0'));
    }
  }

  return issues;
}

function _formatIssue(participantId, fieldName, currentValue, expectedValue) {
  return {
    participantId:        participantId,
    relatedParticipantId: '',
    issueType:            DQ_ISSUE_TYPE.INVALID_FORMAT,
    severity:             'medium',
    fieldName:            fieldName,
    currentValue:         String(currentValue || '').slice(0, 100),
    expectedValue:        String(expectedValue || ''),
    confidence:           1.0,
  };
}

// ─── STATE CONSISTENCY RULES ──────────────────────────────────────────────────

function _checkStateConsistency(record) {
  var issues = [];
  var pid    = record.participantId;
  var stage  = record.currentStage || '';

  // job_matching requires participant info complete and CV parsed/reviewed
  if (stage === 'job_matching' || stage === 'job_placement' || stage === 'outcome_tracking') {
    if (record.participantInfoStatus !== 'complete') {
      issues.push(_stateIssue(pid, 'participantInfoStatus',
        record.participantInfoStatus, 'complete',
        'participant information must be complete before job_matching'));
    }
    if (record.cvStatus !== 'parsed' && record.cvStatus !== 'reviewed' && record.cvStatus !== 'deferred') {
      issues.push(_stateIssue(pid, 'cvStatus',
        record.cvStatus, 'parsed or reviewed or deferred',
        'CV must be processed before job matching'));
    }
  }

  // outcome_tracking requires placement record (we check placementStatus)
  if (stage === 'outcome_tracking' && !record.placementStatus) {
    issues.push(_stateIssue(pid, 'placementStatus', '', 'any',
      'outcome tracking requires a placement record'));
  }

  // cvStatus=parsed requires successful parser run (parserConfidence > 0)
  if (record.cvStatus === 'parsed') {
    var conf = parseFloat(record.parserConfidence);
    if (isNaN(conf) || conf <= 0) {
      issues.push(_stateIssue(pid, 'parserConfidence', record.parserConfidence, '>0',
        'cvStatus=parsed but no valid parserConfidence'));
    }
  }

  // overallStatus=withdrawn must have tokens revoked — we check indirectly:
  // at minimum, currentStage should be 'withdrawn'
  if (record.overallStatus === 'withdrawn' && stage !== 'withdrawn') {
    issues.push(_stateIssue(pid, 'currentStage', stage, 'withdrawn',
      'overallStatus=withdrawn but currentStage is not withdrawn'));
  }

  // overallStatus=duplicate requires a merge history entry (check separately in referential integrity)
  if (record.overallStatus === 'duplicate' && stage !== 'archived') {
    issues.push(_stateIssue(pid, 'currentStage', stage, 'archived',
      'overallStatus=duplicate but currentStage is not archived'));
  }

  return issues;
}

function _stateIssue(participantId, fieldName, currentValue, expectedValue, note) {
  return {
    participantId:        participantId,
    relatedParticipantId: '',
    issueType:            DQ_ISSUE_TYPE.STATE_INCONSISTENCY,
    severity:             'high',
    fieldName:            fieldName,
    currentValue:         String(currentValue || ''),
    expectedValue:        String(expectedValue || ''),
    confidence:           1.0,
    notes:                note || '',
  };
}

// ─── CONSENT-TO-REGISTRATION MISMATCH RULES ───────────────────────────────────

function _checkConsentMismatch(record) {
  var issues = [];
  var pid    = record.participantId;

  // Phone mismatch after normalization
  if (record.consentPhone && record.telephone) {
    var cpNorm = normalizePhone(record.consentPhone);
    var tpNorm = normalizePhone(record.telephone);
    if (cpNorm && tpNorm && cpNorm !== tpNorm) {
      issues.push({
        participantId:        pid,
        relatedParticipantId: '',
        issueType:            DQ_ISSUE_TYPE.CONSENT_MISMATCH,
        severity:             'medium',
        fieldName:            'telephone',
        currentValue:         'consent:' + cpNorm + ' registration:' + tpNorm,
        expectedValue:        'match after normalization',
        confidence:           1.0,
      });
    }
  }

  // Email mismatch
  if (record.consentEmail && record.email) {
    var ceNorm = normalizeEmail(record.consentEmail);
    var reNorm = normalizeEmail(record.email);
    if (ceNorm && reNorm && ceNorm !== reNorm) {
      var sev = (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ceNorm) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reNorm))
        ? 'low' : 'medium';
      issues.push({
        participantId:        pid,
        relatedParticipantId: '',
        issueType:            DQ_ISSUE_TYPE.CONSENT_MISMATCH,
        severity:             sev,
        fieldName:            'email',
        currentValue:         'consent:' + ceNorm + ' registration:' + reNorm,
        expectedValue:        'match after normalization',
        confidence:           1.0,
      });
    }
  }

  // Name token overlap
  if (record.consentName && (record.surname || record.firstName)) {
    var consentTokens = _extractNameTokens('', '', '', record.consentName);
    var regTokens     = _extractNameTokens(
      record.surname || '', record.firstName || '',
      record.otherNames || '', ''
    );
    if (consentTokens.length > 0 && regTokens.length > 0 && !_hasNameOverlap(consentTokens, regTokens)) {
      issues.push({
        participantId:        pid,
        relatedParticipantId: '',
        issueType:            DQ_ISSUE_TYPE.CONSENT_MISMATCH,
        severity:             'medium',
        fieldName:            'consentName',
        currentValue:         record.consentName,
        expectedValue:        'token overlap with registered name',
        confidence:           0.85,
      });
    }
  }

  return issues;
}

// ─── FINGERPRINT ─────────────────────────────────────────────────────────────

function computeIssueFingerprint(participantId, issueType, fieldName, relatedParticipantId) {
  return hashValue([
    String(participantId        || ''),
    String(issueType            || ''),
    String(fieldName            || ''),
    String(relatedParticipantId || ''),
  ].join(':'));
}

function _loadExistingFingerprints() {
  var sheet = getOrCreateSheet(SHEET.DATA_QUALITY_ISSUES, HEADERS.DATA_QUALITY_ISSUES);
  var prints = {};
  if (sheet.getLastRow() < 2) return prints;

  var h      = HEADERS.DATA_QUALITY_ISSUES;
  var pidIdx = h.indexOf('participantId');
  var typIdx = h.indexOf('issueType');
  var fldIdx = h.indexOf('fieldName');
  var relIdx = h.indexOf('relatedParticipantId');
  var stIdx  = h.indexOf('status');

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, h.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var status = String(rows[i][stIdx] || '').trim();
    if (status !== 'open' && status !== 'in_review') continue;
    var fp = computeIssueFingerprint(
      String(rows[i][pidIdx] || ''),
      String(rows[i][typIdx] || ''),
      String(rows[i][fldIdx] || ''),
      String(rows[i][relIdx] || '')
    );
    prints[fp] = true;
  }
  return prints;
}

// ─── CREATE ISSUE ─────────────────────────────────────────────────────────────

function createDataQualityIssue(issue) {
  if (!issue || !issue.participantId || !issue.issueType) return false;

  var issueType = issue.issueType;
  var now       = new Date().toISOString();
  var row = [
    generateIssueId(),
    issue.participantId,
    issue.relatedParticipantId || '',
    issueType,
    issue.severity        || _DQ_SEVERITY[issueType]      || 'medium',
    'open',
    issue.fieldName       || '',
    String(issue.currentValue  || '').slice(0, 500),
    String(issue.expectedValue || '').slice(0, 200),
    issue.confidence      !== undefined ? issue.confidence : '',
    now,
    'dq_scan',
    _DQ_ASSIGNED_ROLE[issueType] || 'me_officer',
    '',   // resolution
    '',   // resolvedBy
    '',   // resolvedAt
    issue.notes || '',
  ];

  var sheet = getOrCreateSheet(SHEET.DATA_QUALITY_ISSUES, HEADERS.DATA_QUALITY_ISSUES);
  sheet.appendRow(row);
  invalidateRecordsCache(SHEET.DATA_QUALITY_ISSUES);

  appendAudit({
    auditId:      'AUD-' + generateRequestId(),
    timestamp:    now,
    participantId: issue.participantId,
    actorType:    'system',
    actorId:      'dq_scan',
    action:       EVENT.DQ_ISSUE_CREATED,
    entityType:   'data_quality_issue',
    entityId:     row[0],
    status:       'success',
    summary:      issueType + ' on ' + issue.fieldName,
  });

  return true;
}

// ─── RESOLVE ISSUE ────────────────────────────────────────────────────────────

var _VALID_RESOLUTIONS = ['fix_field', 'merge_duplicate', 'mark_not_duplicate', 'request_update', 'accept_exception'];

function resolveDataQualityIssue(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'data_quality.resolve');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  var cached  = checkIdempotency(requestId, 'resolveDataQualityIssue', staff.staffUserId, reqHash);
  if (cached) return cached;

  var issueId   = String(payload.issueId   || '').trim();
  var resolution = String(payload.resolution || '').trim();
  var notes      = String(payload.notes     || '').trim();
  var newStatus  = String(payload.status    || 'resolved').trim();

  if (!issueId)   throw appError('VALIDATION_ERROR', 'issueId is required.');
  if (!resolution) throw appError('VALIDATION_ERROR', 'resolution is required.');
  if (_VALID_RESOLUTIONS.indexOf(resolution) < 0) {
    throw appError('VALIDATION_ERROR', 'Invalid resolution. Must be one of: ' + _VALID_RESOLUTIONS.join(', '));
  }
  if (newStatus !== 'resolved' && newStatus !== 'dismissed') {
    newStatus = 'resolved';
  }
  if (!notes && resolution === 'mark_not_duplicate') {
    throw appError('VALIDATION_ERROR', 'A reason note is required when marking as not-duplicate.');
  }

  var sheet = getOrCreateSheet(SHEET.DATA_QUALITY_ISSUES, HEADERS.DATA_QUALITY_ISSUES);
  if (sheet.getLastRow() < 2) throw appError('NOT_FOUND', 'Issue not found: ' + issueId);

  var h      = HEADERS.DATA_QUALITY_ISSUES;
  var idIdx  = h.indexOf('issueId');
  var stIdx  = h.indexOf('status');
  var resIdx = h.indexOf('resolution');
  var rByIdx = h.indexOf('resolvedBy');
  var rAtIdx = h.indexOf('resolvedAt');
  var ntIdx  = h.indexOf('notes');

  var rows    = sheet.getRange(2, 1, sheet.getLastRow() - 1, h.length).getValues();
  var rowNum  = -1;
  var issueRecord = null;

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idIdx] || '') === issueId) {
      rowNum      = i + 2;
      issueRecord = rowToObject(h, rows[i]);
      break;
    }
  }

  if (rowNum < 0) throw appError('NOT_FOUND', 'Issue not found: ' + issueId);

  var currentStatus = String(issueRecord.status || '');
  if (currentStatus === 'resolved' || currentStatus === 'merged') {
    throw appError('CONFLICT', 'Issue is already ' + currentStatus + '.');
  }

  var now = new Date().toISOString();
  sheet.getRange(rowNum, stIdx  + 1).setValue(newStatus);
  sheet.getRange(rowNum, resIdx + 1).setValue(resolution);
  sheet.getRange(rowNum, rByIdx + 1).setValue(staff.staffUserId);
  sheet.getRange(rowNum, rAtIdx + 1).setValue(now);
  if (notes) sheet.getRange(rowNum, ntIdx + 1).setValue(notes);
  invalidateRecordsCache(SHEET.DATA_QUALITY_ISSUES);

  var evt = newStatus === 'dismissed' ? EVENT.DQ_ISSUE_DISMISSED : EVENT.DQ_ISSUE_RESOLVED;
  appendAudit({
    auditId:       'AUD-' + requestId,
    timestamp:     now,
    requestId:     requestId,
    participantId: issueRecord.participantId,
    actorType:     'staff',
    actorId:       staff.staffUserId,
    actorRole:     staff.role,
    action:        evt,
    entityType:    'data_quality_issue',
    entityId:      issueId,
    status:        'success',
    summary:       resolution + ' → ' + newStatus,
  });

  var result = successResponse(requestId, { issueId: issueId, status: newStatus, resolution: resolution });
  writeIdempotency(requestId, 'resolveDataQualityIssue', staff.staffUserId, result, reqHash, issueRecord.participantId);
  return result;
}

// ─── LIST ISSUES (staff-readable) ─────────────────────────────────────────────

function listDataQualityIssues(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'data_quality.read');

  var sheet = getOrCreateSheet(SHEET.DATA_QUALITY_ISSUES, HEADERS.DATA_QUALITY_ISSUES);
  if (sheet.getLastRow() < 2) return successResponse(requestId, { issues: [] });

  var h    = HEADERS.DATA_QUALITY_ISSUES;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, h.length).getValues();

  var filterStatus = payload.status || null;
  var filterPid    = payload.participantId || null;
  var filterSev    = payload.severity || null;

  var issues = rows
    .map(function(row) { return rowToObject(h, row); })
    .filter(function(issue) {
      if (filterStatus && issue.status !== filterStatus) return false;
      if (filterPid    && issue.participantId !== filterPid) return false;
      if (filterSev    && issue.severity !== filterSev) return false;
      return true;
    });

  return successResponse(requestId, { issues: issues, total: issues.length });
}

// ─── TRIGGER INSTALLATION ─────────────────────────────────────────────────────

function installDqTrigger(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'system.configure');

  // Remove existing DQ triggers
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dqScanTriggerCallback') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new hourly trigger
  ScriptApp.newTrigger('dqScanTriggerCallback')
    .timeBased()
    .everyHours(1)
    .create();

  appendAudit({
    auditId:   'AUD-' + requestId,
    timestamp: new Date().toISOString(),
    requestId: requestId,
    actorType: 'staff',
    actorId:   staff.staffUserId,
    actorRole: staff.role,
    action:    'system.dq_trigger_installed',
    status:    'success',
    summary:   'Hourly DQ trigger installed by ' + staff.staffUserId,
  });

  return successResponse(requestId, { trigger: 'dqScanTriggerCallback', intervalHours: 1 });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _resolveCursorOffset(sheet, cursor) {
  if (!cursor) return 0;
  var totalRows = sheet.getLastRow() - 1;
  if (totalRows < 1) return 0;

  var pidCol = HEADERS.MASTER.indexOf('participantId') + 1;
  var ids    = sheet.getRange(2, pidCol, totalRows, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '') === cursor) return i + 1;
  }
  return 0; // cursor not found — start over
}

function _setSystemConfigValue(key, value) {
  var sheet = getOrCreateSheet(SHEET.SYSTEM_CONFIG, HEADERS.SYSTEM_CONFIG);
  if (sheet.getLastRow() < 2) return;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === key) {
      sheet.getRange(i + 2, 2).setValue(String(value));
      sheet.getRange(i + 2, 4).setValue(new Date().toISOString());
      invalidateSystemConfigCache();
      return;
    }
  }
  // Key not found — append
  sheet.appendRow([key, String(value), '', new Date().toISOString(), 'system']);
  invalidateSystemConfigCache();
}

function _extractNameTokens(surname, firstName, otherNames, consentName) {
  var combined = [surname, firstName, otherNames, consentName].join(' ');
  return combined
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(function(t) { return t.length >= 2; });
}

function _hasNameOverlap(tokensA, tokensB) {
  for (var i = 0; i < tokensA.length; i++) {
    if (tokensB.indexOf(tokensA[i]) >= 0) return true;
  }
  return false;
}

function _nameDobDistrictKey(nameTokens, dob, district) {
  if (!nameTokens || nameTokens.length < 2) return null;
  if (!dob || dob.length < 4) return null;
  var sortedTokens = nameTokens.slice().sort().join('_');
  var cleanDob     = dob.replace(/-/g, '');
  return sortedTokens + '|' + cleanDob + '|' + (district || '');
}
