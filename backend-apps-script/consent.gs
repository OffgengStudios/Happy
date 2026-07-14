// ═══════════════════════════════════════════════════════════════════════════════
//  CONSENT — initConsent, withdrawConsent, staffCreateContinuationToken
// ═══════════════════════════════════════════════════════════════════════════════

// ─── INIT CONSENT ─────────────────────────────────────────────────────────────

function initConsent(payload, requestId) {
  // Security rule #1: accepted must be explicitly true
  if (payload.accepted !== true) {
    throw appError('VALIDATION_ERROR', 'Consent was not accepted. Participant record will not be created.');
  }

  var now   = new Date().toISOString();
  var phone = normalizePhone(payload.phone  || '');
  var email = normalizeEmail(payload.email  || '');
  var name  = String(payload.name || payload.consentName || '').trim();

  if (!phone && !name) {
    throw appError('VALIDATION_ERROR', 'At least a phone number or name is required.');
  }

  var master = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);

  // LockService wraps duplicate check + ID generation atomically
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (_) {
    throw appError('SERVER_ERROR', 'Could not acquire lock for consent processing. Please retry.');
  }

  var participantId;
  var rowIndex;
  var isNew  = false;

  try {
    rowIndex = findParticipantRow({ phone: phone || null, email: email || null });

    if (rowIndex > 0) {
      var existing  = rowToObject(HEADERS.MASTER, master.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);
      participantId = existing.participantId;
    } else {
      participantId = generateParticipantId();  // already LockService-safe internally, but outer lock is still held
      isNew         = true;
    }
  } finally {
    lock.releaseLock();
  }

  // Idempotency: check before any writes
  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'initConsent', 'candidate:' + phone, reqHash);
    if (cached) return cached;
  }

  // Signature to Drive (evidence stored in the Consents tab, not Master)
  var sig = _saveConsentSignatureToDrive(payload, participantId);

  // Token — registration lifetime comes from System_Config (candidateTokenDays)
  var rawToken     = createToken();
  var consentId    = generateConsentId();
  var sysConfig    = getSystemConfig();
  var tokenDays    = Number(sysConfig.candidateTokenDays) || 14;
  var tokenExpires = new Date(Date.now() + tokenDays * 86400 * 1000).toISOString();
  var frontendUrl  = (sysConfig.candidateFrontendUrl || '').replace(/\/$/, '');
  var continuationUrl = frontendUrl
    ? frontendUrl + '/?token=' + encodeURIComponent(rawToken)
    : '?token=' + encodeURIComponent(rawToken);

  var masterRecord = {
    participantId:              participantId,
    consentStatus:              'complete',
    consentSubmittedAt:         payload.timestamp || now,
    consentSubmissionId:        consentId,
    consentName:                name,
    consentPhone:               toLocalPhone(phone),
    consentEmail:               email,
    program:                    String(payload.program || 'HAPPY Program'),
    participantInfoStatus:      isNew ? 'not_started' : undefined,
    capacityBuildingStatus:     isNew ? 'not_started' : undefined,
    cvStatus:                   isNew ? 'not_started' : undefined,
    currentStage:               'participant_information',
    overallStatus:              'active',
    lastUpdatedAt:              now,
    lastUpdatedBy:              'consent',
    participantPhoneNormalized: phone,
    participantEmailNormalized: email,
  };

  // Strip undefined — updateRow handles merging with existing values
  Object.keys(masterRecord).forEach(function(k) {
    if (masterRecord[k] === undefined) delete masterRecord[k];
  });

  if (isNew) {
    masterRecord.createdAt = now;
    masterRecord.createdBy = 'consent';
    master.appendRow(HEADERS.MASTER.map(function(h) { return toSheetValue(masterRecord[h] !== undefined ? masterRecord[h] : ''); }));
    rowIndex = master.getLastRow();
  } else {
    updateRow(master, HEADERS.MASTER, rowIndex, masterRecord);
  }
  invalidateRecordsCache(SHEET.MASTER);

  // Write Token_Index record
  createTokenRecord(participantId, 'registration', rawToken, tokenDays);

  // Write Consents tab
  _appendToConsentLog(payload, consentId, participantId, sig, now);

  // Audit
  appendAudit({
    requestId:     requestId || '',
    participantId: participantId,
    actorType:     'candidate',
    actorId:       participantId,
    action:        EVENT.CONSENT_SUBMITTED,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       isNew ? 'New participant created via consent' : 'Existing participant reconsented',
    metadata:      { consentId: consentId, venue: payload.venue || '', isNew: isNew },
  });

  // Email (send result is captured in the audit log + response, not mirrored to Master)
  var emailResult = _sendConsentEmail({
    participantId:      participantId,
    rawToken:           rawToken,
    registrationUrl:    continuationUrl,
    consentSubmissionId: consentId,
    name:               name,
    email:              email,
  });

  var result = successResponse(requestId, {
    participantId:    participantId,
    consentId:        consentId,
    continuationUrl:  continuationUrl,
    registrationUrl:  continuationUrl,  // alias for staff dashboard
    tokenExpiresAt:   tokenExpires,
    emailSent:        emailResult.sent,
    isNewParticipant: isNew,
  });

  if (requestId) writeIdempotency(requestId, 'initConsent', 'candidate:' + phone, result, reqHash, participantId);

  return result;
}

// ─── WITHDRAW CONSENT ─────────────────────────────────────────────────────────

function withdrawConsent(payload, sessionToken, requestId) {
  var participantId = String(payload.participantId || '');
  var reason        = String(payload.reason || '').trim();
  var rawToken      = String(payload.token  || '').trim();

  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');

  var actor;

  if (rawToken) {
    // Candidate-initiated via token
    var tokenRecord = validateCandidateToken(rawToken, 'registration');
    if (tokenRecord.participantId !== participantId) {
      throw appError('FORBIDDEN', 'Token does not belong to this participant.');
    }
    actor = { type: 'candidate', participantId: participantId, tokenRecord: tokenRecord };
  } else if (sessionToken) {
    // Staff-initiated
    var staffUser = validateSession(sessionToken);
    requirePermission(staffUser, 'consent.withdraw');
    if (!reason) throw appError('VALIDATION_ERROR', 'A reason is required for staff-initiated withdrawal.');
    actor = { type: 'staff', staffUser: staffUser };
  } else {
    throw appError('AUTH_REQUIRED', 'Provide a candidate token or staff session token.');
  }

  var master   = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var rowIndex = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var record = rowToObject(HEADERS.MASTER, master.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  if (record.overallStatus === 'withdrawn') {
    return successResponse(requestId, { participantId: participantId, alreadyWithdrawn: true });
  }
  if (record.overallStatus === 'archived') {
    throw appError('CONFLICT', 'Archived participants cannot be withdrawn.');
  }

  // Apply transition (handles validation + token revocation)
  applyTransition(participantId, 'withdrawn', actor, reason);

  // Record withdrawal reason in adminNotes (schema-aligned); full detail is in Audit_Log.
  var nowIso  = new Date().toISOString();
  var noteTxt = 'Withdrawn (' + actor.type + ') ' + nowIso + (reason ? ': ' + reason : '');
  updateRow(master, HEADERS.MASTER, rowIndex, {
    adminNotes:    (record.adminNotes ? record.adminNotes + ' | ' : '') + noteTxt,
    lastUpdatedAt: nowIso,
    lastUpdatedBy: actor.type === 'staff' ? (actor.staffUser.email || actor.staffUser.staffUserId) : 'candidate',
  });

  var af = actorFields(actor);
  appendAudit(Object.assign(af, {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.PARTICIPANT_WITHDRAWN,
    entityType:    'participant',
    entityId:      participantId,
    status:        'success',
    summary:       reason || 'Participant withdrew consent',
    metadata:      { reason: reason, initiatedBy: actor.type },
  }));

  return successResponse(requestId, {
    participantId: participantId,
    withdrawn:     true,
  });
}

// ─── STAFF CREATE CONTINUATION TOKEN ─────────────────────────────────────────

function staffCreateContinuationToken(payload, sessionToken, requestId) {
  var staffUser = validateSession(sessionToken);
  requirePermission(staffUser, 'tokens.create');

  var participantId = String(payload.participantId || '');
  var purpose       = String(payload.purpose || 'registration');
  var lifetimeDays  = Number(payload.lifetimeDays) || 14;

  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');

  var validPurposes = ['registration', 'cv_upload', 'whatsapp_continuation', 'one_time_action'];
  if (validPurposes.indexOf(purpose) < 0) {
    throw appError('VALIDATION_ERROR', 'Invalid purpose. Must be one of: ' + validPurposes.join(', '));
  }

  var rowIndex = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) throw appError('NOT_FOUND', 'Participant not found.');

  var master = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var record = rowToObject(HEADERS.MASTER, master.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  if (record.overallStatus === 'withdrawn' || record.overallStatus === 'archived') {
    throw appError('CONFLICT', 'Cannot create a token for a ' + record.overallStatus + ' participant.');
  }

  var rawToken     = createToken();
  var tokenId      = createTokenRecord(participantId, purpose, rawToken, lifetimeDays);
  var sysConfig    = getSystemConfig();
  var frontendUrl  = (sysConfig.candidateFrontendUrl || '').replace(/\/$/, '');
  var continueUrl  = frontendUrl
    ? frontendUrl + '/?token=' + encodeURIComponent(rawToken)
    : '?token=' + encodeURIComponent(rawToken);

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staffUser }), {
    requestId:     requestId || '',
    participantId: participantId,
    action:        EVENT.TOKEN_CREATED,
    entityType:    'token',
    entityId:      tokenId,
    status:        'success',
    summary:       'Continuation token created for ' + purpose,
    metadata:      { purpose: purpose, lifetimeDays: lifetimeDays },
  }));

  return successResponse(requestId, {
    participantId:   participantId,
    tokenId:         tokenId,
    purpose:         purpose,
    continuationUrl: continueUrl,
    registrationUrl: continueUrl,  // aliases consumed by the youth dashboard
    tokenUrl:        continueUrl,
    expiresInDays:   lifetimeDays,
  });
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function _appendToConsentLog(payload, consentId, participantId, sig, now) {
  try {
    var ss    = getConsentSpreadsheet();
    var sheet = ss.getSheetByName(SHEET.CONSENTS);
    if (!sheet) sheet = ss.insertSheet(SHEET.CONSENTS);
    ensureHeaders(sheet, HEADERS.CONSENTS);

    // Map by header name — column order MUST match HEADERS.CONSENTS.
    var record = {
      consentSubmissionId: consentId,
      participantId:       participantId,
      timestamp:           payload.timestamp || now,
      venue:               String(payload.venue || ''),
      participantName:     String(payload.name || payload.consentName || '').trim(),
      phone:               String(payload.phone || ''),
      email:               String(payload.email || ''),
      accepted:            'true', // initConsent only runs when accepted === true
      language:            String(payload.language || 'en'),
      program:             String(payload.program || 'HAPPY Program'),
      signatureFileId:     sig.id  || '',
      signatureFileUrl:    sig.url || '',
      createdAt:           now,
    };
    var rowNum = sheet.getLastRow() + 1;
    sheet.appendRow(HEADERS.CONSENTS.map(function(h) {
      return toSheetValue(record[h] !== undefined ? record[h] : '');
    }));

    if (sig.url) {
      sheet.getRange(rowNum, HEADERS.CONSENTS.indexOf('signatureFileUrl') + 1)
        .setFormula('=HYPERLINK("' + sig.url + '","View")');
    }
  } catch (err) {
    console.error('_appendToConsentLog failed: ' + err.message);
    // Non-fatal: audit and Master record are the source of truth
  }
}

function _saveConsentSignatureToDrive(payload, participantId) {
  try {
    var match = String(payload.signature || '').match(/^data:image\/png;base64,(.+)$/);
    if (!match) return { id: '', url: '', name: '' };

    var folderId = getConfig('CONSENT_SIGNATURE_FOLDER_ID');
    var folder   = DriveApp.getFolderById(folderId);

    // Verify the folder is the configured one (drive ID verification)
    var parents  = folder.getParents();
    // folder.getId() == folderId is sufficient; we just confirm it resolves without error
    if (folder.getId() !== folderId) return { id: '', url: '', name: '' };

    var bytes    = Utilities.base64Decode(match[1]);
    var safeName = sanitizeFileName(payload.name || participantId || 'participant');
    var fileName = participantId + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '_' + safeName + '_consent-signature.png';
    var blob     = Utilities.newBlob(bytes, 'image/png', fileName);
    var file     = folder.createFile(blob);
    return { id: file.getId(), url: file.getUrl(), name: file.getName() };
  } catch (err) {
    console.error('_saveConsentSignatureToDrive failed: ' + err.message);
    return { id: '', url: '', name: '' };
  }
}

function _sendConsentEmail(details) {
  if (!details.email) return { sent: false, error: '' };
  try {
    var name = details.name ? ' ' + details.name : '';
    MailApp.sendEmail({
      to:      details.email,
      subject: 'Your HAPPY Program Consent Confirmation',
      body: [
        'Hello' + name + ',',
        '',
        'Thank you for giving your consent to participate in the HAPPY Program.',
        '',
        'Here are your details — please keep them safe:',
        '',
        '  Consent ID:     ' + details.consentSubmissionId,
        '  Participant ID: ' + details.participantId,
        '',
        'Click the link below to complete your registration:',
        '',
        '  ' + details.registrationUrl,
        '',
        'If you have any questions, please contact your HAPPY Program field officer.',
        '',
        'Regards,',
        'HAPPY Program Team',
      ].join('\n'),
      name: 'HAPPY Program',
    });
    return { sent: true, error: '' };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}
