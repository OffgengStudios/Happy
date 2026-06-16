// ═══════════════════════════════════════════════════════════════════════════════
//  MATCHING — run skill/category matching, review match decisions
// ═══════════════════════════════════════════════════════════════════════════════

// Builds a lightweight match profile for a participant from Master + latest CV
// parse + Participant_Information.
function _participantMatchProfile(participantId) {
  var masterRow = findParticipantRow({ participantId: participantId });
  if (masterRow < 0) return null;
  var master = rowToObject(HEADERS.MASTER,
    getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER).getRange(masterRow, 1, 1, HEADERS.MASTER.length).getValues()[0]);

  var skills = [];
  var cv = _getChildRecord(SHEET.CV_RECORDS, HEADERS.CV_RECORDS, participantId);
  if (cv && cv.parsedSkills) skills = _splitSkills(cv.parsedSkills);

  var info = _getChildRecord(SHEET.PARTICIPANT_INFO, HEADERS.PARTICIPANT_INFO, participantId);

  return {
    master:   master,
    skills:   skills,
    category: String(master.parserCategory || (info && info.jobRole) || '').toLowerCase(),
    sector:   String((info && info.sector) || '').toLowerCase(),
    region:   String(master.region || (info && info.region) || '').toLowerCase(),
  };
}

// Scores a participant profile against one opportunity. Returns { score, matched, missing }.
function _scoreMatch(profile, job) {
  var required = _splitSkills(job.requiredSkills);
  var matched  = required.filter(function(s) { return profile.skills.indexOf(s) >= 0; });
  var missing  = required.filter(function(s) { return profile.skills.indexOf(s) < 0; });

  var score = required.length ? (matched.length / required.length) : 0.4; // base when no skills listed
  if (profile.sector && String(job.sector || '').toLowerCase() === profile.sector) score += 0.2;
  if (profile.region && String(job.region || '').toLowerCase() === profile.region) score += 0.15;
  if (profile.category && String(job.jobRole || '').toLowerCase().indexOf(profile.category) >= 0) score += 0.15;
  if (score > 1) score = 1;

  return { score: Math.round(score * 100) / 100, matched: matched, missing: missing };
}

function runJobMatch(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'matching.run');

  var participantId = String(payload.participantId || '').trim();
  if (!participantId) throw appError('VALIDATION_ERROR', 'participantId is required.');

  var reqHash = hashValue(JSON.stringify(payload || {}));
  if (requestId) {
    var cached = checkIdempotency(requestId, 'runJobMatch', staff.staffUserId, reqHash);
    if (cached) return cached;
  }

  var profile = _participantMatchProfile(participantId);
  if (!profile) throw appError('NOT_FOUND', 'Participant not found.');

  var onlyJobId = String(payload.jobOpportunityId || '').trim();
  var jobsSheet = getOrCreateSheet(SHEET.JOB_OPPORTUNITIES, HEADERS.JOB_OPPORTUNITIES);
  var jobs = getRecords(jobsSheet, HEADERS.JOB_OPPORTUNITIES).filter(function(j) {
    if (String(j.status || '').toLowerCase() !== 'open') return false;
    if (onlyJobId && j.jobOpportunityId !== onlyJobId) return false;
    return true;
  });

  var now      = new Date().toISOString();
  var actor    = staff.email || staff.staffUserId;
  var matchSheet = getOrCreateSheet(SHEET.JOB_MATCHES, HEADERS.JOB_MATCHES);
  var created  = 0;

  jobs.forEach(function(job) {
    var s = _scoreMatch(profile, job);
    if (s.score <= 0) return;
    var rec = {
      matchId:        generateMatchId(),
      participantId:  participantId,
      jobOpportunityId: job.jobOpportunityId,
      matchSource:    'auto',
      matchScore:     s.score,
      matchedSkills:  s.matched.join(', '),
      missingSkills:  s.missing.join(', '),
      recommendation: s.score >= 0.6 ? 'recommended' : 'review',
      decisionStatus: 'pending',
      createdAt:      now,
      createdBy:      actor,
    };
    matchSheet.appendRow(HEADERS.JOB_MATCHES.map(function(h) { return toSheetValue(rec[h] !== undefined ? rec[h] : ''); }));
    created++;
  });

  // Reflect that matching has run on the Master summary.
  var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var mrow = findParticipantRow({ participantId: participantId });
  if (mrow > 0) updateRow(masterSheet, HEADERS.MASTER, mrow, { matchingStatus: 'matched', lastUpdatedAt: now, lastUpdatedBy: actor });

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', participantId: participantId, action: EVENT.MATCH_RUN,
    entityType: 'participant', entityId: participantId, status: 'success',
    summary: 'Ran matching: ' + created + ' match(es) created', metadata: { matches: created },
  }));

  var result = successResponse(requestId, { participantId: participantId, matches: created });
  if (requestId) writeIdempotency(requestId, 'runJobMatch', staff.staffUserId, result, reqHash, participantId);
  return result;
}

function reviewJobMatch(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'matching.review');

  var matchId  = String(payload.matchId  || '').trim();
  var decision = String(payload.decision || '').trim(); // shortlisted | rejected | deferred
  var notes    = String(payload.notes    || '').trim();
  if (!matchId)  throw appError('VALIDATION_ERROR', 'matchId is required.');
  if (['shortlisted', 'rejected', 'deferred'].indexOf(decision) < 0) {
    throw appError('VALIDATION_ERROR', 'decision must be shortlisted, rejected, or deferred.');
  }

  var sheet = getOrCreateSheet(SHEET.JOB_MATCHES, HEADERS.JOB_MATCHES);
  var rowNum = _findRowById(sheet, HEADERS.JOB_MATCHES, 'matchId', matchId);
  if (rowNum < 0) throw appError('NOT_FOUND', 'Match not found.');

  var match = rowToObject(HEADERS.JOB_MATCHES, sheet.getRange(rowNum, 1, 1, HEADERS.JOB_MATCHES.length).getValues()[0]);
  var now   = new Date().toISOString();
  var actor = staff.email || staff.staffUserId;

  updateRow(sheet, HEADERS.JOB_MATCHES, rowNum, {
    decisionStatus: decision, decisionBy: actor, decisionAt: now, notes: notes,
  });

  // Shortlisting advances the participant toward placement.
  if (decision === 'shortlisted') {
    var masterSheet = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
    var mrow = findParticipantRow({ participantId: match.participantId });
    if (mrow > 0) updateRow(masterSheet, HEADERS.MASTER, mrow, { matchingStatus: 'shortlisted', lastUpdatedAt: now, lastUpdatedBy: actor });
    try { applyTransition(match.participantId, 'job_placement', { type: 'staff', staffUser: staff }, 'Shortlisted for ' + match.jobOpportunityId); } catch (_) {}
  }

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', participantId: match.participantId,
    action: decision === 'shortlisted' ? EVENT.MATCH_SHORTLISTED : (decision === 'rejected' ? EVENT.MATCH_REJECTED : EVENT.MATCH_REVIEWED),
    entityType: 'match', entityId: matchId, status: 'success',
    summary: decision + (notes ? '. ' + notes : ''),
  }));

  return successResponse(requestId, { matchId: matchId, decisionStatus: decision });
}
