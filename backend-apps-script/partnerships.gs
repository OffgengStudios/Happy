// ═══════════════════════════════════════════════════════════════════════════════
//  PARTNERSHIPS — HAPPY Employer Partnership Portal (HEPP) backend
//
//  Public actions (no session — employers have no accounts, per PRD FR-1):
//    submitPartnership          — full submission: consent + signature + company +
//                                 contact + vacancies (+ document refs). Immutable
//                                 once written (FR-11).
//    uploadPartnershipDocument  — base64 supporting document → Drive, returns ids.
//
//  Staff actions:
//    searchPartnershipSubmissions — review queue list (jobs.read)
//    getPartnershipDetail         — one submission + vacancies + documents (jobs.read)
//    updatePartnershipStatus      — new/reviewed/contacted/converted/archived
//                                   (jobs.update); 'converted' creates
//                                   Job_Opportunities rows from the vacancies.
// ═══════════════════════════════════════════════════════════════════════════════

var PARTNERSHIP_STATUSES = ['new', 'reviewed', 'contacted', 'converted', 'archived'];
var PARTNERSHIP_MAX_DOC_MB = 10;
var PARTNERSHIP_MAX_SIGNATURE_MB = 2;
var PARTNERSHIP_MAX_VACANCIES = 20;
var PARTNERSHIP_MAX_DOCUMENTS = 10;
var PARTNERSHIP_SUBMIT_LIMIT = 5;
var PARTNERSHIP_UPLOAD_LIMIT = 20;
var PARTNERSHIP_RATE_WINDOW_SECS = 3600;
var PARTNERSHIP_ORPHAN_MAX_AGE_HOURS = 24;

// ─── PUBLIC: SUBMIT ───────────────────────────────────────────────────────────

function submitPartnership(payload, requestId, context) {
  // BR-1: consent checked AND signature present AND at least one vacancy.
  if (payload.consentAgreement !== true || payload.consentContact !== true) {
    throw appError('VALIDATION_ERROR', 'Both consent confirmations are required.');
  }
  var companyName = String(payload.companyName || '').trim();
  if (companyName.length < 2) throw appError('VALIDATION_ERROR', 'Company name is required (min 2 characters).');
  var contactName  = String(payload.contactName  || '').trim();
  var contactPhone = String(payload.contactPhone || '').trim();
  var contactEmail = String(payload.contactEmail || '').trim();
  if (!contactName)  throw appError('VALIDATION_ERROR', 'Contact name is required.');
  if (!contactPhone) throw appError('VALIDATION_ERROR', 'Contact phone is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    throw appError('VALIDATION_ERROR', 'A valid contact email is required.');
  }
  _enforcePartnershipRateLimit('submit', contactEmail || companyName || requestId, PARTNERSHIP_SUBMIT_LIMIT, context);

  var vacancies = Array.isArray(payload.vacancies) ? payload.vacancies : [];
  if (!vacancies.length) throw appError('VALIDATION_ERROR', 'At least one vacancy is required.');
  if (vacancies.length > PARTNERSHIP_MAX_VACANCIES) {
    throw appError('VALIDATION_ERROR', 'A submission can include at most ' + PARTNERSHIP_MAX_VACANCIES + ' vacancies.');
  }
  vacancies.forEach(function(v, i) {
    if (!String(v.jobTitle || '').trim())       throw appError('VALIDATION_ERROR', 'Vacancy ' + (i + 1) + ': job title is required.');
    if (!String(v.location || '').trim())       throw appError('VALIDATION_ERROR', 'Vacancy ' + (i + 1) + ': location is required.');
    if (!String(v.employmentType || '').trim()) throw appError('VALIDATION_ERROR', 'Vacancy ' + (i + 1) + ': employment type is required.');
    var openings = Number(v.openings || 1);
    if (!isFinite(openings) || openings < 1 || openings > 1000) {
      throw appError('VALIDATION_ERROR', 'Vacancy ' + (i + 1) + ': openings must be between 1 and 1000.');
    }
  });
  var signatureDataUrl = String(payload.signatureDataUrl || '');
  if (!/^data:image\/(png|jpeg);base64,./.test(signatureDataUrl)) {
    throw appError('VALIDATION_ERROR', 'A drawn signature is required.');
  }
  _validateBase64Size(signatureDataUrl, PARTNERSHIP_MAX_SIGNATURE_MB, 'Signature image');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'submitPartnership', contactEmail, reqHash);
    if (cached) return cached;
  }

  var now = new Date().toISOString();

  // Signature image → Drive.
  var sigFile = _savePartnershipBlob(signatureDataUrl, 'signature-' + Date.now() + '.png');

  // Reference number: HP-EMP-{YEAR}-{5-digit}, monotonic via script properties + lock (BR-3).
  var referenceNumber = _nextPartnershipReference();

  var submissionId = 'PS-' + Utilities.getUuid().slice(0, 8).toUpperCase();

  // Vacancy rows.
  var vacSheet = getOrCreateSheet(SHEET.PARTNERSHIP_VACANCIES, HEADERS.PARTNERSHIP_VACANCIES);
  vacancies.forEach(function(v) {
    var rec = {
      vacancyId:      'PV-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      submissionId:   submissionId,
      jobTitle:       String(v.jobTitle || '').trim(),
      location:       String(v.location || '').trim(),
      employmentType: String(v.employmentType || '').trim(),
      openings:       String(v.openings || '1'),
      compensation:   String(v.compensation || 'Negotiable'),
      description:    String(v.description || ''),
      jobOpportunityId: '',
      createdAt:      now,
    };
    vacSheet.appendRow(HEADERS.PARTNERSHIP_VACANCIES.map(function(h) { return toSheetValue(rec[h] !== undefined ? rec[h] : ''); }));
  });
  invalidateRecordsCache(SHEET.PARTNERSHIP_VACANCIES);

  // Link any pre-uploaded documents to this submission.
  var documentIds = Array.isArray(payload.documentIds) ? payload.documentIds.map(String) : [];
  if (documentIds.length > PARTNERSHIP_MAX_DOCUMENTS) {
    throw appError('VALIDATION_ERROR', 'A submission can include at most ' + PARTNERSHIP_MAX_DOCUMENTS + ' supporting documents.');
  }
  var docCount = _linkPartnershipDocuments(documentIds, submissionId);

  // Submission row (immutable content; only status/review fields change later).
  var record = {
    submissionId:     submissionId,
    referenceNumber:  referenceNumber,
    status:           'new',
    companyName:      companyName,
    sector:           String(payload.sector || ''),
    companySize:      String(payload.companySize || ''),
    region:           String(payload.region || ''),
    city:             String(payload.city || ''),
    website:          String(payload.website || ''),
    contactName:      contactName,
    contactRole:      String(payload.contactRole || ''),
    contactPhone:     contactPhone,
    contactEmail:     contactEmail,
    consentAgreement: 'yes',
    consentContact:   'yes',
    signatureFileId:  sigFile.fileId,
    signatureFileUrl: sigFile.fileUrl,
    vacancyCount:     vacancies.length,
    documentCount:    docCount,
    reviewNotes:      '',
    reviewedBy:       '',
    reviewedAt:       '',
    convertedJobIds:  '',
    createdAt:        now,
    lastUpdatedAt:    now,
    lastUpdatedBy:    'employer-portal',
  };
  var sheet = getOrCreateSheet(SHEET.PARTNERSHIP_SUBMISSIONS, HEADERS.PARTNERSHIP_SUBMISSIONS);
  sheet.appendRow(HEADERS.PARTNERSHIP_SUBMISSIONS.map(function(h) { return toSheetValue(record[h] !== undefined ? record[h] : ''); }));
  invalidateRecordsCache(SHEET.PARTNERSHIP_SUBMISSIONS);

  appendAudit({
    actorType: 'employer', actorId: contactEmail, actorRole: 'public',
    requestId: requestId || '', action: 'partnership.submitted',
    entityType: 'partnership', entityId: submissionId, status: 'success',
    summary: companyName + ' submitted ' + vacancies.length + ' vacanc' + (vacancies.length === 1 ? 'y' : 'ies') + ' (' + referenceNumber + ')',
  });

  _sendPartnershipConfirmation(contactEmail, contactName, companyName, referenceNumber, vacancies.length);

  var result = successResponse(requestId, {
    submissionId:    submissionId,
    referenceNumber: referenceNumber,
    submittedAt:     now,
  });
  if (requestId) writeIdempotency(requestId, 'submitPartnership', contactEmail, result, reqHash, '');
  return result;
}

// ─── PUBLIC: DOCUMENT UPLOAD ─────────────────────────────────────────────────

function uploadPartnershipDocument(payload, requestId, context) {
  _enforcePartnershipRateLimit('upload', 'public-upload', PARTNERSHIP_UPLOAD_LIMIT, context);
  _cleanupStalePartnershipDocuments(PARTNERSHIP_ORPHAN_MAX_AGE_HOURS, 5);

  var match = String(payload.fileDataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw appError('VALIDATION_ERROR', 'fileDataUrl must be a base64 data URL.');
  var mimeType = match[1];
  var allowed = ['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword', 'image/png', 'image/jpeg'];
  if (allowed.indexOf(mimeType) < 0) {
    throw appError('VALIDATION_ERROR', 'Unsupported file type: ' + mimeType);
  }
  _validateBase64Size(String(payload.fileDataUrl || ''), PARTNERSHIP_MAX_DOC_MB, 'File');
  var bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > PARTNERSHIP_MAX_DOC_MB * 1024 * 1024) {
    throw appError('VALIDATION_ERROR', 'File exceeds ' + PARTNERSHIP_MAX_DOC_MB + ' MB limit.');
  }
  var fileName = String(payload.fileName || 'document').replace(/[^\w.\- ]/g, '_').slice(0, 120);

  var folder = _getPartnershipFolder();
  var file   = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));

  var documentId = 'PD-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var sheet = getOrCreateSheet(SHEET.PARTNERSHIP_DOCUMENTS, HEADERS.PARTNERSHIP_DOCUMENTS);
  var rec = {
    documentId:    documentId,
    submissionId:  '',           // linked on submit
    fileName:      fileName,
    mimeType:      mimeType,
    fileSizeBytes: bytes.length,
    driveFileId:   file.getId(),
    driveFileUrl:  file.getUrl(),
    createdAt:     new Date().toISOString(),
  };
  sheet.appendRow(HEADERS.PARTNERSHIP_DOCUMENTS.map(function(h) { return toSheetValue(rec[h] !== undefined ? rec[h] : ''); }));
  invalidateRecordsCache(SHEET.PARTNERSHIP_DOCUMENTS);

  return successResponse(requestId, { documentId: documentId, fileName: fileName });
}

// ─── STAFF: REVIEW QUEUE ─────────────────────────────────────────────────────

function searchPartnershipSubmissions(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.read');

  var status = String(payload.status || '').trim();
  var search = String(payload.search || '').trim().toLowerCase();
  var limit  = Math.min(parseInt(payload.limit, 10) || 50, 200);
  var offset = parseInt(payload.offset, 10) || 0;

  var rows = getCachedRecords(SHEET.PARTNERSHIP_SUBMISSIONS, HEADERS.PARTNERSHIP_SUBMISSIONS)
    .filter(function(r) {
      if (status && String(r.status || '') !== status) return false;
      if (search) {
        var hay = (String(r.companyName || '') + ' ' + String(r.contactName || '') + ' ' +
                   String(r.referenceNumber || '') + ' ' + String(r.contactEmail || '')).toLowerCase();
        if (hay.indexOf(search) < 0) return false;
      }
      return true;
    })
    .sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });

  return successResponse('', {
    total:       rows.length,
    submissions: rows.slice(offset, offset + limit),
  });
}

function getPartnershipDetail(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.read');

  var submissionId = String(payload.submissionId || '').trim();
  if (!submissionId) throw appError('VALIDATION_ERROR', 'submissionId is required.');

  var submission = getCachedRecords(SHEET.PARTNERSHIP_SUBMISSIONS, HEADERS.PARTNERSHIP_SUBMISSIONS)
    .filter(function(r) { return String(r.submissionId) === submissionId; })[0];
  if (!submission) throw appError('NOT_FOUND', 'Partnership submission not found.');

  var vacancies = getCachedRecords(SHEET.PARTNERSHIP_VACANCIES, HEADERS.PARTNERSHIP_VACANCIES)
    .filter(function(r) { return String(r.submissionId) === submissionId; });
  var documents = getCachedRecords(SHEET.PARTNERSHIP_DOCUMENTS, HEADERS.PARTNERSHIP_DOCUMENTS)
    .filter(function(r) { return String(r.submissionId) === submissionId; });

  return successResponse('', { submission: submission, vacancies: vacancies, documents: documents });
}

function updatePartnershipStatus(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.update');

  var submissionId = String(payload.submissionId || '').trim();
  var newStatus    = String(payload.status || '').trim().toLowerCase();
  if (!submissionId) throw appError('VALIDATION_ERROR', 'submissionId is required.');
  if (PARTNERSHIP_STATUSES.indexOf(newStatus) < 0) {
    throw appError('VALIDATION_ERROR', 'Invalid status. Allowed: ' + PARTNERSHIP_STATUSES.join(', '));
  }

  var sheet   = getOrCreateSheet(SHEET.PARTNERSHIP_SUBMISSIONS, HEADERS.PARTNERSHIP_SUBMISSIONS);
  var rowIdx  = _findPartnershipRow(sheet, submissionId);
  if (rowIdx < 0) throw appError('NOT_FOUND', 'Partnership submission not found.');
  var current = rowToObject(HEADERS.PARTNERSHIP_SUBMISSIONS,
    sheet.getRange(rowIdx, 1, 1, HEADERS.PARTNERSHIP_SUBMISSIONS.length).getValues()[0]);

  var now   = new Date().toISOString();
  var actor = staff.email || staff.staffUserId;
  var updates = {
    status:        newStatus,
    reviewNotes:   payload.reviewNotes !== undefined ? String(payload.reviewNotes) : current.reviewNotes,
    reviewedBy:    actor,
    reviewedAt:    now,
    lastUpdatedAt: now,
    lastUpdatedBy: actor,
  };

  // Converting pulls every vacancy into the live Job_Opportunities pipeline (once).
  var createdJobIds = [];
  if (newStatus === 'converted' && !String(current.convertedJobIds || '')) {
    var jobSheet = getOrCreateSheet(SHEET.JOB_OPPORTUNITIES, HEADERS.JOB_OPPORTUNITIES);
    var vacSheet = getOrCreateSheet(SHEET.PARTNERSHIP_VACANCIES, HEADERS.PARTNERSHIP_VACANCIES);
    var vacs = getRecords(vacSheet, HEADERS.PARTNERSHIP_VACANCIES)
      .filter(function(v) { return String(v.submissionId) === submissionId; });

    vacs.forEach(function(v) {
      var jobId = generateJobOpportunityId();
      var jobRec = {
        jobOpportunityId: jobId,
        employerName:     current.companyName,
        sector:           current.sector,
        industry:         '',
        jobType:          '',
        jobRole:          v.jobTitle,
        employmentType:   v.employmentType,
        employmentCategory: '',
        region:           current.region,
        district:         '',
        community:        v.location,
        requiredSkills:   '',
        description:      v.description,
        openings:         v.openings,
        status:           'open',
        createdAt:        now,
        createdBy:        actor,
        lastUpdatedAt:    now,
        lastUpdatedBy:    actor,
      };
      jobSheet.appendRow(HEADERS.JOB_OPPORTUNITIES.map(function(h) { return toSheetValue(jobRec[h] !== undefined ? jobRec[h] : ''); }));
      createdJobIds.push(jobId);

      var vRowIdx = _findRowByField(vacSheet, HEADERS.PARTNERSHIP_VACANCIES, 'vacancyId', String(v.vacancyId));
      if (vRowIdx > 0) updateRow(vacSheet, HEADERS.PARTNERSHIP_VACANCIES, vRowIdx, { jobOpportunityId: jobId });
    });
    invalidateRecordsCache(SHEET.JOB_OPPORTUNITIES);
    invalidateRecordsCache(SHEET.PARTNERSHIP_VACANCIES);
    updates.convertedJobIds = createdJobIds.join(',');
  }

  updateRow(sheet, HEADERS.PARTNERSHIP_SUBMISSIONS, rowIdx, updates);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', action: 'partnership.status_changed',
    entityType: 'partnership', entityId: submissionId, status: 'success',
    summary: current.companyName + ': ' + current.status + ' → ' + newStatus +
             (createdJobIds.length ? ' (' + createdJobIds.length + ' job opportunities created)' : ''),
  }));

  return successResponse(requestId, {
    submissionId: submissionId,
    status:       newStatus,
    convertedJobIds: createdJobIds,
  });
}

// ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

function _nextPartnershipReference() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var year  = String(new Date().getFullYear());
    var key   = 'PARTNERSHIP_REF_SEQ_' + year;
    var next  = parseInt(props.getProperty(key) || '0', 10) + 1;
    props.setProperty(key, String(next));
    return 'HP-EMP-' + year + '-' + ('00000' + next).slice(-5);
  } finally {
    lock.releaseLock();
  }
}

function _getPartnershipFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PARTNERSHIP_FILES_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (_) { /* recreate below */ }
  }
  var folder = DriveApp.createFolder('HEPP Partnership Files');
  props.setProperty('PARTNERSHIP_FILES_FOLDER_ID', folder.getId());
  return folder;
}

function _savePartnershipBlob(dataUrl, fileName) {
  var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  var bytes = Utilities.base64Decode(match[2]);
  var file  = _getPartnershipFolder().createFile(Utilities.newBlob(bytes, match[1], fileName));
  return { fileId: file.getId(), fileUrl: file.getUrl() };
}

function _linkPartnershipDocuments(documentIds, submissionId) {
  if (!documentIds.length) return 0;
  var sheet  = getOrCreateSheet(SHEET.PARTNERSHIP_DOCUMENTS, HEADERS.PARTNERSHIP_DOCUMENTS);
  var linked = 0;
  documentIds.forEach(function(docId) {
    var rowIdx = _findRowByField(sheet, HEADERS.PARTNERSHIP_DOCUMENTS, 'documentId', docId);
    if (rowIdx > 0) {
      updateRow(sheet, HEADERS.PARTNERSHIP_DOCUMENTS, rowIdx, { submissionId: submissionId });
      linked++;
    }
  });
  if (linked) invalidateRecordsCache(SHEET.PARTNERSHIP_DOCUMENTS);
  return linked;
}

function _findPartnershipRow(sheet, submissionId) {
  return _findRowByField(sheet, HEADERS.PARTNERSHIP_SUBMISSIONS, 'submissionId', submissionId);
}

// Returns the 1-based sheet row for the first record whose `field` equals `value`, or -1.
function _findRowByField(sheet, headers, field, value) {
  if (sheet.getLastRow() < 2) return -1;
  var col  = headers.indexOf(field);
  if (col < 0) return -1;
  var vals = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][0]) === value) return r + 2;
  }
  return -1;
}

function _sendPartnershipConfirmation(email, name, companyName, referenceNumber, vacancyCount) {
  try {
    MailApp.sendEmail({
      to:      email,
      subject: 'HAPPY Program partnership received — ' + referenceNumber,
      body: [
        'Hello ' + name + ',',
        '',
        'Thank you for partnering with the HAPPY Program (Harnessing Agricultural',
        'Productivity and Prosperity for Youth).',
        '',
        'We received your partnership submission for ' + companyName + ':',
        '',
        '  Reference number: ' + referenceNumber,
        '  Vacancies listed: ' + vacancyCount,
        '',
        'Our acquisition team will contact you within 3 working days to discuss',
        'next steps and candidate matching.',
        '',
        'Please keep this reference number for your records.',
        '',
        '— The HAPPY Program team',
        'Mastercard Foundation · Agri-Impact · Jobberman Ghana',
      ].join('\n'),
    });
  } catch (err) {
    console.error('partnership confirmation email failed: ' + err.message);
  }
}

function _validateBase64Size(dataUrl, maxMb, label) {
  var match = String(dataUrl || '').match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw appError('VALIDATION_ERROR', label + ' must be a base64 data URL.');
  var approxBytes = Math.floor(match[1].length * 3 / 4);
  var maxBytes = maxMb * 1024 * 1024;
  if (approxBytes > maxBytes) {
    throw appError('VALIDATION_ERROR', label + ' exceeds ' + maxMb + ' MB limit.');
  }
}

function _enforcePartnershipRateLimit(kind, actorHint, maxRequests, context) {
  var headers = (context && context.headers) || {};
  var userAgent = headers['User-Agent'] || headers['user-agent'] || '';
  var actor = normalizeEmail(actorHint) || String(actorHint || 'anonymous').toLowerCase();
  var key = 'hepp_' + kind + '_' + hashValue(actor + '|' + userAgent).slice(0, 32);
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(5000);
    var count = parseInt(cache.get(key) || '0', 10);
    if (count >= maxRequests) {
      throw appError('RATE_LIMITED', 'Too many requests. Please wait and try again later.');
    }
    cache.put(key, String(count + 1), PARTNERSHIP_RATE_WINDOW_SECS);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function cleanupStalePartnershipDocuments(payload, sessionToken) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'jobs.update');
  var maxAgeHours = Math.max(Number(payload.maxAgeHours || PARTNERSHIP_ORPHAN_MAX_AGE_HOURS), 1);
  var limit = Math.min(Math.max(Number(payload.limit || 50), 1), 200);
  var cleaned = _cleanupStalePartnershipDocuments(maxAgeHours, limit);
  return successResponse('', cleaned);
}

function _cleanupStalePartnershipDocuments(maxAgeHours, limit) {
  var sheet = getOrCreateSheet(SHEET.PARTNERSHIP_DOCUMENTS, HEADERS.PARTNERSHIP_DOCUMENTS);
  if (sheet.getLastRow() < 2) return { deleted: 0 };

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.PARTNERSHIP_DOCUMENTS.length).getValues();
  var idx = {};
  for (var i = 0; i < HEADERS.PARTNERSHIP_DOCUMENTS.length; i++) idx[HEADERS.PARTNERSHIP_DOCUMENTS[i]] = i;

  var cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  var deleted = 0;
  for (var r = rows.length - 1; r >= 0 && deleted < limit; r--) {
    var row = rows[r];
    if (String(row[idx.submissionId] || '').trim()) continue;
    var createdAt = new Date(row[idx.createdAt] || '').getTime();
    if (!createdAt || createdAt > cutoff) continue;

    var driveFileId = String(row[idx.driveFileId] || '').trim();
    if (driveFileId) {
      try { DriveApp.getFileById(driveFileId).setTrashed(true); } catch (_) {}
    }
    sheet.deleteRow(r + 2);
    deleted++;
  }
  if (deleted) invalidateRecordsCache(SHEET.PARTNERSHIP_DOCUMENTS);
  return { deleted: deleted };
}
