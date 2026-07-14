// ═══════════════════════════════════════════════════════════════════════════════
//  REPORTS — aggregate programme metrics + CSV export (M&E / IT Admin)
// ═══════════════════════════════════════════════════════════════════════════════

function getReport(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'reports.read');

  var type = String(payload.reportType || 'programme_summary').trim();

  switch (type) {
    case 'outcome_list':          return successResponse(requestId, _reportOutcomeList(payload));
    case 'placement_rate':        return successResponse(requestId, _reportPlacementRate());
    case 'outcome_retention':     return successResponse(requestId, _reportOutcomeRetention());
    case 'data_quality_summary':  return successResponse(requestId, _reportDqSummary());
    case 'programme_summary':
    default:                      return successResponse(requestId, _reportProgrammeSummary());
  }
}

function _countBy(records, field) {
  var out = {};
  records.forEach(function(r) {
    var k = String(r[field] || 'unknown');
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function _reportProgrammeSummary() {
  var master = getCachedRecords(SHEET.MASTER, HEADERS.MASTER);
  return {
    reportType:  'programme_summary',
    generatedAt: new Date().toISOString(),
    total:       master.length,
    byStage:     _countBy(master, 'currentStage'),
    byStatus:    _countBy(master, 'overallStatus'),
    bySex:       _countBy(master, 'sex'),
    byRegion:    _countBy(master, 'region'),
  };
}

function _reportPlacementRate() {
  var master = getCachedRecords(SHEET.MASTER, HEADERS.MASTER);
  var placements = getCachedRecords(SHEET.JOB_PLACEMENT, HEADERS.JOB_PLACEMENT);
  var placed = {};
  placements.forEach(function(p) { if (p.participantId) placed[p.participantId] = true; });
  var total   = master.length;
  var placedN = Object.keys(placed).length;
  return {
    reportType:  'placement_rate',
    generatedAt: new Date().toISOString(),
    totalParticipants: total,
    placed:      placedN,
    placementRatePct: total ? Math.round((placedN / total) * 1000) / 10 : 0,
  };
}

function _reportOutcomeRetention() {
  var outcomes = getCachedRecords(SHEET.OUTCOME_TRACKING, HEADERS.OUTCOME_TRACKING);
  var byRetention = _countBy(outcomes, 'retentionStatus');
  var employed = outcomes.filter(function(o) { return String(o.currentlyEmployed || '').toLowerCase() === 'yes'; }).length;
  return {
    reportType:  'outcome_retention',
    generatedAt: new Date().toISOString(),
    totalFollowUps: outcomes.length,
    currentlyEmployed: employed,
    employmentRatePct: outcomes.length ? Math.round((employed / outcomes.length) * 1000) / 10 : 0,
    byRetentionStatus: byRetention,
  };
}

function _reportDqSummary() {
  var issues = getCachedRecords(SHEET.DATA_QUALITY_ISSUES, HEADERS.DATA_QUALITY_ISSUES);
  var open = issues.filter(function(i) { return i.status === 'open' || i.status === 'in_review'; });
  return {
    reportType:  'data_quality_summary',
    generatedAt: new Date().toISOString(),
    totalIssues: issues.length,
    open:        open.length,
    bySeverity:  _countBy(open, 'severity'),
    byType:      _countBy(open, 'issueType'),
  };
}

function _reportOutcomeList(payload) {
  var limit = parseInt(payload.limit, 10) || 100;
  var rows  = getCachedRecords(SHEET.OUTCOME_TRACKING, HEADERS.OUTCOME_TRACKING);
  rows.sort(function(a, b) { return String(b.followUpDate || '').localeCompare(String(a.followUpDate || '')); });
  return { reportType: 'outcome_list', rows: rows.slice(0, limit), total: rows.length };
}

// ─── CANDIDATE LIFECYCLE PIPELINE ────────────────────────────────────────────
// Derives each participant's lifecycle status for the Employer Partnership
// Portal tracker: registering → onboarded → trained → placed → working/looking.
// working/looking only apply after placement, from the latest follow-up outcome.

function getCandidatePipeline(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'reports.read');

  var master = getCachedRecords(SHEET.MASTER, HEADERS.MASTER);

  // Latest outcome per participant. Master mirror columns cover new records;
  // scanning Outcome_Tracking covers rows recorded before the mirror existed.
  var latestOutcome = {};
  getCachedRecords(SHEET.OUTCOME_TRACKING, HEADERS.OUTCOME_TRACKING).forEach(function(o) {
    var pid  = String(o.participantId || '');
    var date = String(o.followUpDate || '');
    if (!pid) return;
    if (!latestOutcome[pid] || date >= latestOutcome[pid].date) {
      latestOutcome[pid] = { date: date, employed: String(o.currentlyEmployed || '').toLowerCase() };
    }
  });

  var region  = String(payload.region || '').trim();
  var partner = String(payload.implementingPartner || '').trim();
  var sex     = String(payload.sex || '').trim();
  var statusFilter = String(payload.lifecycleStatus || '').trim();
  var search  = String(payload.search || '').trim().toLowerCase();
  var includeParticipants = payload.includeParticipants !== false;
  var limit   = Math.min(parseInt(payload.limit, 10) || 100, 500);
  var offset  = parseInt(payload.offset, 10) || 0;

  var counts = { registering: 0, onboarded: 0, trained: 0, placed: 0, working: 0, looking: 0 };
  var rows = [];

  master.forEach(function(m) {
    if (String(m.overallStatus || '').toLowerCase() === 'archived') return;
    if (region  && String(m.region || '') !== region) return;
    if (partner && String(m.implementingPartner || '') !== partner) return;
    if (sex     && String(m.sex || '') !== sex) return;

    var status = _lifecycleStatus(m, latestOutcome[String(m.participantId || '')]);
    counts[status] = (counts[status] || 0) + 1;

    if (!includeParticipants) return;
    if (statusFilter && status !== statusFilter) return;
    if (search) {
      var hay = (String(m.participantId || '') + ' ' + String(m.surname || '') + ' ' +
                 String(m.firstName || '') + ' ' + String(m.otherNames || '')).toLowerCase();
      if (hay.indexOf(search) < 0) return;
    }
    rows.push({
      participantId:   m.participantId,
      name:            [m.firstName, m.otherNames, m.surname].filter(Boolean).join(' '),
      sex:             m.sex,
      region:          m.region,
      district:        m.district,
      implementingPartner: m.implementingPartner,
      lifecycleStatus: status,
      currentStage:    m.currentStage,
      cvStatus:        m.cvStatus,
      lastUpdatedAt:   m.lastUpdatedAt,
    });
  });

  return successResponse(requestId, {
    generatedAt: new Date().toISOString(),
    counts:      counts,
    total:       Object.keys(counts).reduce(function(sum, k) { return sum + counts[k]; }, 0),
    participants: includeParticipants ? rows.slice(offset, offset + limit) : [],
    matched:     rows.length,
  });
}

function _lifecycleStatus(m, outcome) {
  if (String(m.placementStatus || '') === 'placed') {
    var employed = outcome ? outcome.employed : String(m.latestOutcomeEmployed || '').toLowerCase();
    if (employed === 'yes') return 'working';
    if (employed === 'no')  return 'looking';
    return 'placed';
  }
  if (String(m.capacityBuildingStatus || '') === 'complete')  return 'trained';
  if (String(m.participantInfoStatus  || '') === 'complete')  return 'onboarded';
  return 'registering';
}

// ─── CSV EXPORT ──────────────────────────────────────────────────────────────

function exportReport(payload, sessionToken, requestId) {
  var staff = validateSession(sessionToken);
  requirePermission(staff, 'reports.export');

  var type = String(payload.reportType || 'participants').trim();
  var map  = {
    participants: { sheet: SHEET.MASTER,            headers: HEADERS.MASTER },
    placements:   { sheet: SHEET.JOB_PLACEMENT,     headers: HEADERS.JOB_PLACEMENT },
    outcomes:     { sheet: SHEET.OUTCOME_TRACKING,  headers: HEADERS.OUTCOME_TRACKING },
  };
  var spec = map[type];
  if (!spec) throw appError('VALIDATION_ERROR', 'Unknown export type: ' + type);

  var records = getRecords(getOrCreateSheet(spec.sheet, spec.headers), spec.headers);
  var csv = _toCsv(spec.headers, records);
  var filename = 'happy-kollect-' + type + '-' + new Date().toISOString().slice(0, 10) + '.csv';

  // Archive a copy to the configured exports Drive folder, if set.
  var driveFileUrl = '';
  var exportsFolderId = getConfigOptional('EXPORTS_FOLDER_ID');
  if (exportsFolderId) {
    try {
      var file = DriveApp.getFolderById(exportsFolderId)
        .createFile(Utilities.newBlob(csv, 'text/csv', filename));
      driveFileUrl = file.getUrl();
    } catch (err) { console.error('export archive failed: ' + err.message); }
  }

  appendAudit(Object.assign(actorFields({ type: 'staff', staffUser: staff }), {
    requestId: requestId || '', action: EVENT.PARTICIPANT_EXPORTED, entityType: 'export',
    entityId: type, status: 'success', summary: 'Exported ' + records.length + ' ' + type + ' rows',
    metadata: { reportType: type, rowCount: records.length, archived: !!driveFileUrl },
  }));

  return successResponse(requestId, {
    reportType:   type,
    filename:     filename,
    rowCount:     records.length,
    csv:          csv,
    driveFileUrl: driveFileUrl,
  });
}

function _toCsv(headers, records) {
  var esc = function(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  var lines = [headers.join(',')];
  records.forEach(function(r) {
    lines.push(headers.map(function(h) { return esc(r[h]); }).join(','));
  });
  return lines.join('\n');
}
