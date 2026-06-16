// ═══════════════════════════════════════════════════════════════════════════════
//  CV HANDLER — upload metadata, parser queue, parser callback
// ═══════════════════════════════════════════════════════════════════════════════

var ACCEPTED_CV_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];
var ACCEPTED_CV_EXTENSIONS = ['.pdf', '.docx', '.doc'];
var MAX_CV_SIZE_BYTES       = 10 * 1024 * 1024;  // 10 MB

// ─── CANDIDATE CV UPLOAD ──────────────────────────────────────────────────────

/**
 * Candidate records a CV they uploaded directly to Drive via the frontend picker.
 * The frontend sends only driveFileId — never base64 or raw file content.
 */
function uploadCvMetadata(payload, requestId) {
  var rawToken  = String(payload.token || '').trim();
  if (!rawToken) throw appError('VALIDATION_ERROR', 'token is required.');

  var tokenRecord = validateCandidateToken(rawToken, 'cv_upload');
  var participantId = tokenRecord.participantId;

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'uploadCvMetadata', participantId, reqHash);
    if (cached) return cached;
  }

  var driveFileId = String(payload.driveFileId || '').trim();
  var fileName    = String(payload.fileName    || '').trim();
  var fileType    = String(payload.fileType    || '').trim();
  var fileSizeBytes = Number(payload.fileSizeBytes) || 0;

  if (!driveFileId) throw appError('VALIDATION_ERROR', 'driveFileId is required.');

  _validateCvFile(driveFileId, fileName, fileType, fileSizeBytes);

  var result = _writeCvRecord({
    participantId:  participantId,
    driveFileId:    driveFileId,
    fileName:       fileName,
    fileType:       fileType,
    fileSizeBytes:  fileSizeBytes,
    uploadSource:   'candidate_frontend',  // server-side — never from client
    uploadedByRole: 'candidate',
    uploadedBy:     participantId,
  }, requestId);

  if (requestId) writeIdempotency(requestId, 'uploadCvMetadata', participantId, result, reqHash, participantId);
  return result;
}

// ─── STAFF CV UPLOAD ──────────────────────────────────────────────────────────

/**
 * Staff uploads a CV on behalf of a participant (from email, field collection, WhatsApp).
 * Can receive a Drive file ID (preferred) or a base64 data URL (fallback).
 */
function staffUploadCvMetadata(payload, sessionToken, requestId) {
  var staffUser     = validateSession(sessionToken);
  requirePermission(staffUser, 'cv.upload');

  var participantId = String(payload.participantId || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');

  var rowIndex = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var record      = rowToObject(HEADERS.MASTER, masterSheet.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  if (record.overallStatus === 'withdrawn' || record.overallStatus === 'archived') {
    throw appError('CONFLICT', 'Cannot upload CV for a ' + record.overallStatus + ' participant.');
  }

  var driveFileId   = String(payload.driveFileId   || '').trim();
  var fileName      = String(payload.fileName      || '').trim();
  var fileType      = String(payload.fileType      || '').trim();
  var fileSizeBytes = Number(payload.fileSizeBytes) || 0;

  // Accept base64 upload as fallback (staff portal only)
  if (!driveFileId && payload.cvDataUrl) {
    var saved    = _saveCvDataUrlToDrive(payload, participantId);
    driveFileId  = saved.id;
    fileName     = saved.name;
    fileType     = saved.mimeType;
  }

  if (!driveFileId) throw appError('VALIDATION_ERROR', 'driveFileId or cvDataUrl is required.');

  _validateCvFile(driveFileId, fileName, fileType, fileSizeBytes);

  var result = _writeCvRecord({
    participantId:  participantId,
    driveFileId:    driveFileId,
    fileName:       fileName,
    fileType:       fileType,
    fileSizeBytes:  fileSizeBytes,
    uploadSource:   'staff_manual_upload',   // server-side — never from client
    uploadedByRole: staffUser.role,
    uploadedBy:     staffUser.email || staffUser.staffUserId,
  }, requestId);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.CV_UPLOADED,
    entityType:    'cv',
    entityId:      result.data && result.data.cvRecordId,
    status:        'success',
    summary:       'Staff uploaded CV for participant',
    metadata:      { fileName: fileName, uploadSource: 'staff_manual_upload', notes: String(payload.notes || payload.staffNotes || '').trim() },
  }));

  return result;
}

// ─── CV PARSER CALLBACK ───────────────────────────────────────────────────────

/**
 * Receives the parser result from the CV Parser FastAPI service.
 * Called via doPost action: "receiveCvParserResult".
 * Security: verified by Code.gs against X-Integration-Secret header
 * or payload.integrationSecret before this function is called.
 */
function receiveCvParserResult(payload, requestId) {
  var cvRecordId    = String(payload.cvRecordId    || '').trim();
  var participantId = String(payload.participantId || '').trim();
  var parserStatus  = String(payload.parserStatus  || '').trim();

  if (!cvRecordId || !participantId) {
    throw appError('VALIDATION_ERROR', 'cvRecordId and participantId are required.');
  }

  // Cross-validate cvRecordId → participantId before accepting results
  var cvSheet = getOrCreateSheet(SHEET.CV_RECORDS, HEADERS.CV_RECORDS);
  if (cvSheet.getLastRow() < 2) throw appError('NOT_FOUND', 'CV record not found: ' + cvRecordId);

  var rows = cvSheet.getRange(2, 1, cvSheet.getLastRow() - 1, HEADERS.CV_RECORDS.length).getValues();
  var idx  = {};
  for (var i = 0; i < HEADERS.CV_RECORDS.length; i++) idx[HEADERS.CV_RECORDS[i]] = i;

  var cvRow = -1;
  for (var r = 0; r < rows.length; r++) {
    if (rows[r][idx.cvRecordId] === cvRecordId) { cvRow = r; break; }
  }
  if (cvRow < 0) throw appError('NOT_FOUND', 'CV record not found: ' + cvRecordId);

  var storedParticipantId = String(rows[cvRow][idx.participantId] || '');
  if (storedParticipantId !== participantId) {
    appendAudit({
      requestId:     requestId || '',
      participantId: storedParticipantId,
      action:        EVENT.CV_PARSER_CALLBACK_REJECTED,
      actorType:     'integration',
      actorId:       'cv_parser',
      entityType:    'cv',
      entityId:      cvRecordId,
      status:        'failed',
      summary:       'participantId mismatch in parser callback',
      metadata:      { claimed: participantId, stored: storedParticipantId, cvRecordId: cvRecordId },
    });
    throw appError('CONFLICT', 'participantId in callback does not match stored CV record.');
  }

  var now     = new Date().toISOString();
  var parsed  = payload.parsed || {};
  var success = (parserStatus === 'parsed');
  var conf    = (payload.confidence !== undefined ? payload.confidence : parsed.confidence);

  // Column names MUST match HEADERS.CV_RECORDS / the parsed payload in API_CONTRACT.md.
  var cvUpdates = {
    parserStatus:    success ? 'parsed' : 'failed',
    parserVersion:   String(payload.parserVersion || ''),
    confidence:      (conf !== undefined && conf !== '' && !isNaN(Number(conf))) ? Number(conf) : '',
    parsedName:      String(parsed.name      || ''),
    parsedEmail:     String(parsed.email     || ''),
    parsedPhone:     String(parsed.phone     || ''),
    parsedSkills:    Array.isArray(parsed.skills) ? parsed.skills.join(', ') : String(parsed.skills || ''),
    parsedEducation: String(parsed.education  || ''),
    parsedExperience: String(parsed.experience || ''),
    jobCategory:     String(parsed.jobCategory    || ''),
    jobSubcategory:  String(parsed.jobSubcategory || ''),
    errorCode:       success ? '' : String(payload.errorCode || ''),
    errorMessage:    success ? '' : String(payload.errorMessage || ''),
  };

  updateRow(cvSheet, HEADERS.CV_RECORDS, cvRow + 2, cvUpdates);

  // Mirror key parser results to Master (canonical parser* columns).
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var masterRow   = findParticipantRow({ participantId: participantId });
  if (masterRow > 0) {
    var masterUpdates = {
      cvStatus:      success ? 'parsed' : 'failed',
      lastUpdatedAt: now,
      lastUpdatedBy: 'cv_parser',
    };
    if (parsed.jobCategory)    masterUpdates.parserCategory    = parsed.jobCategory;
    if (parsed.jobSubcategory) masterUpdates.parserSubcategory = parsed.jobSubcategory;
    if (cvUpdates.confidence !== '') masterUpdates.parserConfidence = cvUpdates.confidence;
    updateRow(masterSheet, HEADERS.MASTER, masterRow, masterUpdates);

    // Auto-transition to job_matching if parsed successfully
    if (success) {
      try {
        applyTransition(participantId, 'job_matching', { type: 'system' });
      } catch (_) {
        // Guard not met (e.g. no jobCategory yet) — stay in cv_parsing
      }
    }
  }

  appendAudit({
    requestId:     requestId || '',
    participantId: participantId,
    actorType:     'integration',
    actorId:       'cv_parser',
    action:        success ? EVENT.CV_PARSE_COMPLETED : EVENT.CV_PARSE_FAILED,
    entityType:    'cv',
    entityId:      cvRecordId,
    status:        success ? 'success' : 'failed',
    summary:       'Parser result received. Status: ' + parserStatus,
    metadata:      {
      cvRecordId:      cvRecordId,
      parserStatus:    parserStatus,
      parserVersion:   payload.parserVersion || '',
      confidence:      payload.confidence    || '',
    },
  });

  return successResponse(requestId, { cvRecordId: cvRecordId, accepted: true });
}

// ─── QUEUE CV PARSE ───────────────────────────────────────────────────────────

/**
 * Sends a CV to the CV Parser FastAPI service after the Drive file is confirmed.
 * Called internally by _writeCvRecord after a successful upload.
 */
function queueCvParse(cvRecordId, participantId, driveFileId) {
  var parserBaseUrl = getConfigOptional('CV_PARSER_BASE_URL');
  if (!parserBaseUrl) {
    console.warn('CV_PARSER_BASE_URL not configured — skipping queue.');
    return false;
  }

  var secret  = getConfig('CV_PARSER_INTEGRATION_SECRET');
  var payload = {
    cvRecordId:    cvRecordId,
    participantId: participantId,
    driveFileId:   driveFileId,
    callbackUrl:   getConfigOptional('APPS_SCRIPT_DEPLOYMENT_URL') || '',
  };

  try {
    var response = UrlFetchApp.fetch(parserBaseUrl.replace(/\/$/, '') + '/api/v1/integrate/parse', {
      method:     'post',
      contentType: 'application/json',
      payload:    JSON.stringify(payload),
      headers:    { Authorization: 'Bearer ' + secret },
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    var ok   = (code >= 200 && code < 300);

    // Update CV_Records queue status
    var cvSheet = getOrCreateSheet(SHEET.CV_RECORDS, HEADERS.CV_RECORDS);
    if (cvSheet.getLastRow() >= 2) {
      var rows = cvSheet.getRange(2, 1, cvSheet.getLastRow() - 1, HEADERS.CV_RECORDS.length).getValues();
      var idIdx = HEADERS.CV_RECORDS.indexOf('cvRecordId');
      for (var r = 0; r < rows.length; r++) {
        if (rows[r][idIdx] === cvRecordId) {
          updateRow(cvSheet, HEADERS.CV_RECORDS, r + 2, {
            parserStatus: ok ? 'queued' : 'failed',
          });
          break;
        }
      }
    }

    appendAudit({
      participantId: participantId,
      actorType:     'system',
      actorId:       'apps_script',
      action:        ok ? EVENT.CV_PARSE_QUEUED : EVENT.CV_PARSE_FAILED,
      entityType:    'cv',
      entityId:      cvRecordId,
      status:        ok ? 'success' : 'failed',
      summary:       ok ? 'CV queued for parsing' : 'Failed to queue CV (HTTP ' + code + ')',
    });

    return ok;
  } catch (err) {
    appendAudit({
      participantId: participantId,
      actorType:     'system',
      actorId:       'apps_script',
      action:        EVENT.CV_PARSE_FAILED,
      entityType:    'cv',
      entityId:      cvRecordId,
      status:        'failed',
      summary:       'Queue request threw: ' + err.message,
    });
    return false;
  }
}

// ─── CV REVIEW (staff) ────────────────────────────────────────────────────────

function reviewCvResult(payload, sessionToken, requestId) {
  var staffUser = validateSession(sessionToken);
  requirePermission(staffUser, 'cv.review');

  var cvRecordId  = String(payload.cvRecordId  || '').trim();
  var decision    = String(payload.decision    || '').trim();  // 'approved' | 'rejected' | 'override'
  var staffNotes  = String(payload.notes || payload.staffNotes || '').trim();
  var jobCategory = String(payload.jobCategory || '').trim();

  if (!cvRecordId) throw appError('VALIDATION_ERROR', 'cvRecordId is required.');
  if (!decision)   throw appError('VALIDATION_ERROR', 'decision is required.');

  var cvSheet = getOrCreateSheet(SHEET.CV_RECORDS, HEADERS.CV_RECORDS);
  if (cvSheet.getLastRow() < 2) throw appError('NOT_FOUND', 'CV record not found.');

  var rows  = cvSheet.getRange(2, 1, cvSheet.getLastRow() - 1, HEADERS.CV_RECORDS.length).getValues();
  var idx   = {};
  for (var i = 0; i < HEADERS.CV_RECORDS.length; i++) idx[HEADERS.CV_RECORDS[i]] = i;

  var cvRow = -1;
  for (var r = 0; r < rows.length; r++) {
    if (rows[r][idx.cvRecordId] === cvRecordId) { cvRow = r; break; }
  }
  if (cvRow < 0) throw appError('NOT_FOUND', 'CV record not found: ' + cvRecordId);

  var participantId = String(rows[cvRow][idx.participantId] || '');
  var now           = new Date().toISOString();
  var newCvStatus   = (decision === 'approved' || decision === 'override') ? 'reviewed' : 'failed';

  // Column names MUST match HEADERS.CV_RECORDS. CV_Records has no cvStatus column
  // (that is a Master-only section status); reviewStatus carries the decision here.
  var cvReviewUpdates = {
    reviewStatus: decision,
    reviewedBy:   staffUser.email || staffUser.staffUserId,
    reviewedAt:   now,
  };
  if (jobCategory) cvReviewUpdates.jobCategory = jobCategory;
  updateRow(cvSheet, HEADERS.CV_RECORDS, cvRow + 2, cvReviewUpdates);

  // Mirror to Master
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var masterRow   = findParticipantRow({ participantId: participantId });
  if (masterRow > 0) {
    var masterUpdates = { cvStatus: newCvStatus, lastUpdatedAt: now, lastUpdatedBy: staffUser.email || staffUser.staffUserId };
    if (jobCategory) masterUpdates.parserCategory = jobCategory;
    updateRow(masterSheet, HEADERS.MASTER, masterRow, masterUpdates);
  }

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.CV_REVIEWED,
    entityType:    'cv',
    entityId:      cvRecordId,
    status:        'success',
    summary:       decision + (staffNotes ? '. ' + staffNotes : ''),
    metadata:      { decision: decision, jobCategory: jobCategory },
  }));

  return successResponse(requestId, { cvRecordId: cvRecordId, cvStatus: newCvStatus });
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function _validateCvFile(driveFileId, fileName, fileType, fileSizeBytes) {
  // Drive file ID verification: confirm file exists and is in the configured folder
  var folderId = getConfig('CV_UPLOAD_FOLDER_ID');
  try {
    var file    = DriveApp.getFileById(driveFileId);
    var parents = file.getParents();
    var inFolder = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) { inFolder = true; break; }
    }
    if (!inFolder) throw appError('VALIDATION_ERROR', 'CV file is not in the configured upload folder.');
  } catch (err) {
    if (err.code) throw err;
    throw appError('VALIDATION_ERROR', 'CV file not accessible: ' + err.message);
  }

  // File type check
  var ext       = (fileName.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  var validMime = ACCEPTED_CV_MIME_TYPES.indexOf(fileType) >= 0;
  var validExt  = ACCEPTED_CV_EXTENSIONS.indexOf(ext) >= 0;
  if (fileType && !validMime) throw appError('VALIDATION_ERROR', 'File type not accepted: ' + fileType);
  if (ext      && !validExt)  throw appError('VALIDATION_ERROR', 'File extension not accepted: ' + ext);

  // File size check
  if (fileSizeBytes && fileSizeBytes > MAX_CV_SIZE_BYTES) {
    throw appError('VALIDATION_ERROR', 'File exceeds maximum size of ' + (MAX_CV_SIZE_BYTES / 1024 / 1024) + ' MB.');
  }
}

function _writeCvRecord(opts, requestId) {
  var cvRecordId = generateCvRecordId();
  var now        = new Date().toISOString();
  var cvSheet    = getOrCreateSheet(SHEET.CV_RECORDS, HEADERS.CV_RECORDS);

  // Get Drive file URL
  var driveFileUrl = '';
  try { driveFileUrl = DriveApp.getFileById(opts.driveFileId).getUrl(); } catch (_) {}

  // Column names MUST match HEADERS.CV_RECORDS (see DATA_MODEL.md).
  var cvRecord = {
    cvRecordId:      cvRecordId,
    participantId:   opts.participantId,
    uploadSource:    opts.uploadSource,                 // server-set
    uploadedByRole:  opts.uploadedByRole || '',
    uploadedByActor: opts.uploadedBy     || '',
    originalFileName: sanitizeFileName(opts.fileName),
    fileMimeType:    opts.fileType      || '',
    fileSizeBytes:   opts.fileSizeBytes || '',
    driveFileId:     opts.driveFileId,
    driveFileUrl:    driveFileUrl,
    uploadStatus:    'complete',
    parserStatus:    'pending',
    createdAt:       now,
    createdBy:       opts.uploadedBy || opts.participantId,
  };
  cvSheet.appendRow(HEADERS.CV_RECORDS.map(function(h) {
    return toSheetValue(cvRecord[h] !== undefined ? cvRecord[h] : '');
  }));

  // Mirror active CV to Master (canonical cvFileId / cvFileUrl).
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var masterRow   = findParticipantRow({ participantId: opts.participantId });
  if (masterRow > 0) {
    updateRow(masterSheet, HEADERS.MASTER, masterRow, {
      cvStatus:      'uploaded',
      cvFileId:      opts.driveFileId,
      cvFileUrl:     driveFileUrl,
      lastUpdatedAt: now,
      lastUpdatedBy: opts.uploadedBy || 'system',
    });

    // Transition to cv_parsing stage
    try {
      applyTransition(opts.participantId, 'cv_parsing', { type: 'system' });
    } catch (_) {
      // Guard not met — stay in current stage
    }
  }

  // Queue parse with CV Parser service
  queueCvParse(cvRecordId, opts.participantId, opts.driveFileId);

  appendAudit({
    requestId:     requestId || '',
    participantId: opts.participantId,
    actorType:     opts.uploadSource === 'staff_manual_upload' ? 'staff' : 'candidate',
    actorId:       opts.uploadedBy || opts.participantId,
    action:        EVENT.CV_UPLOADED,
    entityType:    'cv',
    entityId:      cvRecordId,
    status:        'success',
    summary:       'CV uploaded via ' + opts.uploadSource,
    metadata:      { fileName: opts.fileName, uploadSource: opts.uploadSource },
  });

  // Re-read current stage so the candidate UI can route correctly.
  var currentStage = '';
  if (masterRow > 0) {
    currentStage = String(rowToObject(HEADERS.MASTER,
      masterSheet.getRange(masterRow, 1, 1, HEADERS.MASTER.length).getValues()[0]).currentStage || '');
  }

  return successResponse(requestId, {
    cvRecordId:    cvRecordId,
    participantId: opts.participantId,
    cvStatus:      'uploaded',
    currentStage:  currentStage,
  });
}

function _saveCvDataUrlToDrive(payload, participantId) {
  var match = String(payload.cvDataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw appError('VALIDATION_ERROR', 'Invalid CV data URL.');

  var mimeType  = payload.fileType || match[1];
  var bytes     = Utilities.base64Decode(match[2]);
  var safeName  = sanitizeFileName(payload.fileName || 'cv');
  var ext       = mimeType === 'application/pdf' ? '.pdf' : mimeType.indexOf('word') >= 0 ? '.docx' : '';
  var fileName  = participantId + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '_' + safeName + ext;
  var blob      = Utilities.newBlob(bytes, mimeType, fileName);
  var folderId  = getConfig('CV_UPLOAD_FOLDER_ID');
  var folder    = DriveApp.getFolderById(folderId);
  var file      = folder.createFile(blob);

  return { id: file.getId(), url: file.getUrl(), name: file.getName(), mimeType: mimeType };
}
