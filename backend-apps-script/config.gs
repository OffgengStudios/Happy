// ─── BACKEND VERSION ──────────────────────────────────────────────────────────
const BACKEND_VERSION = '2026.06.11-foundation';

// ─── CANONICAL SHEET NAMES ────────────────────────────────────────────────────
const SHEET = {
  MASTER:               'Master',
  CONSENTS:             'Consents',
  PARTICIPANT_INFO:     'Participant_Information',
  CAPACITY_BUILDING:    'Capacity_Building',
  CV_RECORDS:           'CV_Records',
  JOB_OPPORTUNITIES:    'Job_Opportunities',
  JOB_MATCHES:          'Job_Matches',
  JOB_PLACEMENT:        'Job_Placement',
  OUTCOME_TRACKING:     'Outcome_Tracking',
  STAFF_USERS:          'Staff_Users',
  TOKEN_INDEX:          'Token_Index',
  AUDIT_LOG:            'Audit_Log',
  DATA_QUALITY_ISSUES:  'Data_Quality_Issues',
  SYSTEM_CONFIG:        'System_Config',
  IDEMPOTENCY_LOG:      'Idempotency_Log',
  MERGE_HISTORY:        'Merge_History',
  PARTNERSHIP_SUBMISSIONS: 'Partnership_Submissions',
  PARTNERSHIP_VACANCIES:   'Partnership_Vacancies',
  PARTNERSHIP_DOCUMENTS:   'Partnership_Documents',
};

// ─── CANONICAL HEADERS ────────────────────────────────────────────────────────
const HEADERS = {
  MASTER: [
    'participantId', 'currentStage', 'overallStatus',
    'consentStatus', 'participantInfoStatus', 'capacityBuildingStatus',
    'cvStatus', 'matchingStatus', 'placementStatus', 'outcomeStatus',
    'consentSubmissionId', 'consentSubmittedAt',
    'consentName', 'consentPhone', 'consentEmail', 'program',
    'surname', 'firstName', 'otherNames', 'sex', 'dob', 'ageAtRegistration',
    'telephone', 'participantPhoneNormalized',
    'email', 'participantEmailNormalized',
    'ghanaCardId', 'ghanaCardNormalized',
    'region', 'district', 'community', 'implementingPartner',
    'educationLevel', 'employmentStatus', 'currentOccupation',
    'cvFileId', 'cvFileUrl',
    'parserCategory', 'parserSubcategory', 'parserConfidence',
    'assignedTeam', 'assignedStaffEmail', 'adminNotes',
    'createdAt', 'createdBy', 'lastUpdatedAt', 'lastUpdatedBy',
    // Appended columns (ensureHeaders adds them to live sheets at the end —
    // never insert new Master columns mid-array, order is positional):
    'latestOutcomeEmployed', 'latestOutcomeDate',
  ],

  CONSENTS: [
    'consentSubmissionId', 'participantId', 'timestamp', 'venue',
    'participantName', 'phone', 'email', 'accepted', 'language', 'program',
    'signatureFileId', 'signatureFileUrl', 'createdAt',
  ],

  PARTICIPANT_INFO: [
    'participantInfoSubmissionId', 'participantId',
    'submissionSource', 'submissionStatus',
    'onboardingDate', 'implementingPartner',
    'region', 'district', 'community', 'locationStatus',
    'surname', 'firstName', 'otherNames', 'sex', 'dob',
    'ageAtRegistration', 'participantTypeAge',
    'telephone', 'email',
    'idType', 'ghanaCardId', 'voterId',
    'refugeeStatus', 'nationality',
    'displacementStatus', 'displacementReason',
    'originalCommunity', 'hostCommunity',
    'disabilityStatus', 'disabilitySpecify',
    'educationLevel', 'employmentStatus', 'currentOccupation',
    'monthlyIncome', 'incomeFrequency',
    'sector', 'industry', 'jobType', 'jobRole',
    'workRegion', 'workDistrict', 'workCommunity',
    'hamisId',
    'createdAt', 'createdBy', 'lastUpdatedAt', 'lastUpdatedBy',
  ],

  CAPACITY_BUILDING: [
    'capacityRecordId', 'participantId', 'submissionId',
    'trainedByPartner', 'trainingStartDate', 'trainingEndDate',
    'trainingLocation', 'trainingMode', 'virtualPlatform',
    'trainerType', 'trainingPartner', 'completionStatus', 'certificateIssued',
    'modules', 'digitalSkills', 'wishTraining',
    'previousTrainings', 'previousTrainingDesc',
    'createdAt', 'createdBy',
  ],

  CV_RECORDS: [
    'cvRecordId', 'participantId',
    'uploadSource', 'uploadedByRole', 'uploadedByActor',
    'originalFileName', 'fileMimeType', 'fileSizeBytes',
    'driveFileId', 'driveFileUrl',
    'uploadStatus', 'parserStatus',
    'parsedName', 'parsedEmail', 'parsedPhone',
    'parsedSkills', 'parsedEducation', 'parsedExperience',
    'jobCategory', 'jobSubcategory', 'confidence',
    'parserVersion', 'errorCode', 'errorMessage',
    'reviewStatus', 'reviewedBy', 'reviewedAt', 'deferredReason',
    'createdAt', 'createdBy',
  ],

  JOB_OPPORTUNITIES: [
    'jobOpportunityId', 'employerName',
    'sector', 'industry', 'jobType', 'jobRole',
    'employmentType', 'employmentCategory',
    'region', 'district', 'community',
    'requiredSkills', 'description', 'openings', 'status',
    'createdAt', 'createdBy', 'lastUpdatedAt', 'lastUpdatedBy',
  ],

  JOB_MATCHES: [
    'matchId', 'participantId', 'jobOpportunityId',
    'matchSource', 'matchScore', 'matchedSkills', 'missingSkills',
    'recommendation', 'decisionStatus', 'decisionBy', 'decisionAt', 'notes',
    'createdAt', 'createdBy',
  ],

  JOB_PLACEMENT: [
    'placementId', 'participantId', 'jobOpportunityId',
    'employerName', 'placedByPartner',
    'placementStartDate', 'placementRegion', 'placementDistrict', 'placementCommunity',
    'sector', 'industry', 'jobType', 'jobRole',
    'employmentType', 'employmentCategory',
    'placementIncome', 'placementIncomeFreq', 'contractType', 'workHours',
    'placementStatus',
    'createdAt', 'createdBy', 'lastUpdatedAt', 'lastUpdatedBy',
  ],

  OUTCOME_TRACKING: [
    'outcomeId', 'participantId', 'placementId',
    'followUpDate', 'followUpType',
    'currentlyEmployed', 'currentEmployer', 'currentJobRole',
    'currentIncome', 'incomeFrequency',
    'retentionStatus', 'reasonForExit',
    'participantFeedback', 'employerFeedback', 'nextFollowUpDate',
    'createdAt', 'createdBy',
  ],

  STAFF_USERS: [
    'staffUserId', 'email', 'displayName', 'role', 'status',
    'passwordHash', 'passwordSalt',
    'lastLoginAt', 'failedLoginCount',
    'createdAt', 'createdBy', 'lastUpdatedAt', 'lastUpdatedBy',
    // Appended column (ensureHeaders adds it to the live sheet at the end):
    'mustChangePassword',
  ],

  TOKEN_INDEX: [
    'tokenId', 'participantId', 'tokenHash', 'purpose', 'status',
    'createdAt', 'expiresAt', 'lastUsedAt', 'revokedAt', 'revokedReason',
  ],

  AUDIT_LOG: [
    'auditId', 'timestamp', 'requestId', 'participantId',
    'actorType', 'actorId', 'actorRole',
    'action', 'entityType', 'entityId',
    'status', 'beforeHash', 'afterHash',
    'summary', 'metadataJson',
    'ipAddress', 'userAgent',
  ],

  DATA_QUALITY_ISSUES: [
    'issueId', 'participantId', 'relatedParticipantId',
    'issueType', 'severity', 'status',
    'fieldName', 'currentValue', 'expectedValue', 'confidence',
    'detectedAt', 'detectedBy', 'assignedRole',
    'resolution', 'resolvedBy', 'resolvedAt', 'notes',
  ],

  SYSTEM_CONFIG: [
    'key', 'value', 'description', 'updatedAt', 'updatedBy',
  ],

  IDEMPOTENCY_LOG: [
    'requestId', 'action', 'actorId', 'participantId',
    'requestHash', 'resultStatus', 'resultDataJson',
    'createdAt', 'ttlExpiresAt',
  ],

  MERGE_HISTORY: [
    'mergeId', 'survivingParticipantId', 'mergedParticipantId',
    'reason', 'mergedBy', 'mergedAt', 'fieldSummaryJson',
  ],

  PARTNERSHIP_SUBMISSIONS: [
    'submissionId', 'referenceNumber', 'status',
    'companyName', 'sector', 'companySize', 'region', 'city', 'website',
    'contactName', 'contactRole', 'contactPhone', 'contactEmail',
    'consentAgreement', 'consentContact',
    'signatureFileId', 'signatureFileUrl',
    'vacancyCount', 'documentCount',
    'reviewNotes', 'reviewedBy', 'reviewedAt', 'convertedJobIds',
    'createdAt', 'lastUpdatedAt', 'lastUpdatedBy',
  ],

  PARTNERSHIP_VACANCIES: [
    'vacancyId', 'submissionId',
    'jobTitle', 'location', 'employmentType', 'openings', 'compensation', 'description',
    'jobOpportunityId', 'createdAt',
  ],

  PARTNERSHIP_DOCUMENTS: [
    'documentId', 'submissionId',
    'fileName', 'mimeType', 'fileSizeBytes',
    'driveFileId', 'driveFileUrl', 'createdAt',
  ],
};

// ─── DEFAULT SYSTEM_CONFIG VALUES ─────────────────────────────────────────────
const SYSTEM_CONFIG_DEFAULTS = [
  { key: 'backendVersion',                   value: BACKEND_VERSION,            description: 'Deployed backend version.' },
  { key: 'candidateFrontendUrl',             value: '',                         description: 'GitHub Pages URL for candidate forms.' },
  { key: 'staffDashboardUrl',                value: '',                         description: 'GitHub Pages URL for staff dashboards.' },
  { key: 'maxCvFileSizeMb',                  value: '10',                       description: 'Maximum CV file size in MB.' },
  { key: 'allowedCvMimeTypes',               value: 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', description: 'Comma-separated allowed CV MIME types.' },
  { key: 'candidateTokenDays',               value: '14',                       description: 'Lifetime of registration/continuation tokens in days.' },
  { key: 'cvTokenDays',                      value: '7',                        description: 'Lifetime of CV upload tokens in days.' },
  { key: 'parserConfidenceThreshold',        value: '0.75',                     description: 'Minimum parser confidence to auto-accept result.' },
  { key: 'duplicateHighConfidenceThreshold', value: '0.90',                     description: 'Confidence above which a duplicate is flagged as critical.' },
  { key: 'outcomeFollowupDays',              value: '30',                       description: 'Days after placement before first outcome follow-up.' },
  { key: 'tokenValidationRateLimit',         value: '10',                       description: 'Max token validation failures per window before RATE_LIMITED.' },
  { key: 'tokenValidationRateLimitWindowMinutes', value: '15',                  description: 'Rolling window in minutes for token validation rate limit.' },
  { key: 'loginRateLimit',                   value: '5',                        description: 'Max failed logins per email before lockout.' },
  { key: 'loginLockoutMinutes',              value: '15',                       description: 'Duration of login lockout in minutes.' },
  { key: 'ghanaCardPattern',                 value: '^GHA-[0-9]{9}-[0-9]$',     description: 'Regex for Ghana Card validation.' },
  { key: 'phonePattern',                     value: '^0[0-9]{9}$',              description: '10-digit Ghana mobile number pattern.' },
  { key: 'participantIdPattern',             value: '^HAPPY-[0-9]{4}-[0-9]{6}$', description: 'Frozen participant ID format.' },
  { key: 'dqScanCursor',                     value: '',                         description: 'Last processed participantId for DQ batch scan.' },
  { key: 'dqBatchSize',                      value: '250',                      description: 'Rows processed per DQ scan trigger firing.' },
  { key: 'idempotencyTtlDays',              value: '30',                        description: 'Idempotency log TTL in days.' },
  { key: 'enableCapacityBuilding',           value: 'true',                     description: 'Show capacity building flow.' },
  { key: 'enableCvUpload',                   value: 'true',                     description: 'Allow CV upload.' },
  { key: 'enableParserIntegration',          value: 'false',                    description: 'Queue and receive CV parser results.' },
  { key: 'enableWhatsApp',                   value: 'false',                    description: 'Enable WhatsApp webhook and outbound messages.' },
  { key: 'enableStaffDashboards',            value: 'true',                     description: 'Enable staff routes.' },
  { key: 'enableDataQualityBlocking',        value: 'true',                     description: 'Block configured transitions on critical DQ issues.' },
];

// ─── PROPS ────────────────────────────────────────────────────────────────────
// Reads a value from Apps Script PropertiesService.
// Throws if a required key is missing.
function getConfig(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (val === null || val === undefined) {
    throw new Error('Missing required configuration: ' + key);
  }
  return val;
}

// Optional variant — returns null rather than throwing.
function getConfigOptional(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || null;
}

// ─── SPREADSHEET ACCESS ───────────────────────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(getConfig('KOLLECT_SPREADSHEET_ID'));
}

function getConsentSpreadsheet() {
  const consentId = getConfigOptional('CONSENT_SPREADSHEET_ID');
  if (!consentId || consentId === getConfig('KOLLECT_SPREADSHEET_ID')) {
    return getSpreadsheet();
  }
  return SpreadsheetApp.openById(consentId);
}

// ─── SYSTEM_CONFIG SHEET READER ───────────────────────────────────────────────
// Returns the full System_Config map, cached for 5 minutes.
const SYSTEM_CONFIG_CACHE_KEY = 'system_config_v1';

function getSystemConfig() {
  const cache   = CacheService.getScriptCache();
  const cached  = cache.get(SYSTEM_CONFIG_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const ss     = getSpreadsheet();
  const sheet  = ss.getSheetByName(SHEET.SYSTEM_CONFIG);
  const config = {};

  if (sheet && sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      const k = String(rows[i][0] || '').trim();
      const v = String(rows[i][1] || '').trim();
      if (k) config[k] = v;
    }
  }

  // Fall back to hardcoded defaults for any missing key
  for (var d = 0; d < SYSTEM_CONFIG_DEFAULTS.length; d++) {
    const def = SYSTEM_CONFIG_DEFAULTS[d];
    if (config[def.key] === undefined) config[def.key] = def.value;
  }

  try { cache.put(SYSTEM_CONFIG_CACHE_KEY, JSON.stringify(config), 300); } catch (_) {}
  return config;
}

// Invalidates the System_Config cache — call after any config update.
function invalidateSystemConfigCache() {
  try { CacheService.getScriptCache().remove(SYSTEM_CONFIG_CACHE_KEY); } catch (_) {}
}

// Returns the public-safe subset of config sent to the frontend via getSystemConfig action.
function getPublicConfig() {
  const c = getSystemConfig();
  return {
    backendVersion:     c.backendVersion      || BACKEND_VERSION,
    environment:        getConfigOptional('ENVIRONMENT') || 'production',
    candidateFrontendUrl: c.candidateFrontendUrl || '',
    maxCvFileSizeMb:    Number(c.maxCvFileSizeMb) || 10,
    allowedCvMimeTypes: (c.allowedCvMimeTypes || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean),
    candidateTokenDays: Number(c.candidateTokenDays) || 14,
    cvTokenDays:        Number(c.cvTokenDays) || 7,
    features: {
      enableCapacityBuilding:    c.enableCapacityBuilding    !== 'false',
      enableCvUpload:            c.enableCvUpload            !== 'false',
      enableParserIntegration:   c.enableParserIntegration   === 'true',
      enableWhatsApp:            c.enableWhatsApp            === 'true',
      enableStaffDashboards:     c.enableStaffDashboards     !== 'false',
    },
  };
}

// Returns backend version, environment, and per-tab availability for the
// `healthCheck` action (see API_CONTRACT.md).
function healthCheck() {
  var sheets = {};
  var ok     = true;
  try {
    var ss = getSpreadsheet();
    Object.keys(SHEET).forEach(function(k) {
      var name    = SHEET[k];
      var present = !!ss.getSheetByName(name);
      sheets[name] = present;
      if (!present) ok = false;
    });
  } catch (err) {
    ok = false;
  }
  return {
    status:         ok ? 'OK' : 'DEGRADED',
    backendVersion: BACKEND_VERSION,
    environment:    getConfigOptional('ENVIRONMENT') || 'unknown',
    sheets:         sheets,
    checkedAt:      new Date().toISOString(),
  };
}

// ─── SCHEMA BOOTSTRAP ─────────────────────────────────────────────────────────
// Creates all 16 canonical tabs with correct headers. Safe to run multiple times.
// Does NOT create the first IT Admin — that is handled by bootstrapFirstAdmin() in auth.gs.
function bootstrapSchema() {
  const ss  = getSpreadsheet();
  const now = new Date().toISOString();

  const tabsToCreate = [
    { name: SHEET.MASTER,              headers: HEADERS.MASTER              },
    { name: SHEET.CONSENTS,            headers: HEADERS.CONSENTS            },
    { name: SHEET.PARTICIPANT_INFO,    headers: HEADERS.PARTICIPANT_INFO    },
    { name: SHEET.CAPACITY_BUILDING,   headers: HEADERS.CAPACITY_BUILDING   },
    { name: SHEET.CV_RECORDS,          headers: HEADERS.CV_RECORDS          },
    { name: SHEET.JOB_OPPORTUNITIES,   headers: HEADERS.JOB_OPPORTUNITIES   },
    { name: SHEET.JOB_MATCHES,         headers: HEADERS.JOB_MATCHES         },
    { name: SHEET.JOB_PLACEMENT,       headers: HEADERS.JOB_PLACEMENT       },
    { name: SHEET.OUTCOME_TRACKING,    headers: HEADERS.OUTCOME_TRACKING    },
    { name: SHEET.STAFF_USERS,         headers: HEADERS.STAFF_USERS         },
    { name: SHEET.TOKEN_INDEX,         headers: HEADERS.TOKEN_INDEX         },
    { name: SHEET.AUDIT_LOG,           headers: HEADERS.AUDIT_LOG           },
    { name: SHEET.DATA_QUALITY_ISSUES, headers: HEADERS.DATA_QUALITY_ISSUES },
    { name: SHEET.SYSTEM_CONFIG,       headers: HEADERS.SYSTEM_CONFIG       },
    { name: SHEET.IDEMPOTENCY_LOG,     headers: HEADERS.IDEMPOTENCY_LOG     },
    { name: SHEET.MERGE_HISTORY,       headers: HEADERS.MERGE_HISTORY       },
  ];

  const created = [];
  const updated = [];

  for (var i = 0; i < tabsToCreate.length; i++) {
    var tab = tabsToCreate[i];
    var sheet = ss.getSheetByName(tab.name);
    var isNew = false;

    if (!sheet) {
      sheet = ss.insertSheet(tab.name);
      isNew = true;
    }

    // Write / extend headers
    var lastCol  = Math.max(sheet.getLastColumn(), 1);
    var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean);

    if (existing.length === 0) {
      sheet.getRange(1, 1, 1, tab.headers.length).setValues([tab.headers]);
      sheet.setFrozenRows(1);
      protectHeaderRow(sheet);
    } else {
      var missing = tab.headers.filter(function(h) { return existing.indexOf(h) < 0; });
      if (missing.length) {
        sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
      }
    }

    if (isNew) {
      created.push(tab.name);
    } else {
      updated.push(tab.name);
    }
  }

  // Seed System_Config defaults (only for keys not already present)
  seedSystemConfig(ss, now);

  // Invalidate cache so getSystemConfig() picks up seeded values
  invalidateSystemConfigCache();

  return {
    status:  'OK',
    created: created,
    updated: updated,
    message: 'Schema bootstrap complete. Created: ' + created.length + ', verified: ' + updated.length + ' tabs.',
  };
}

function seedSystemConfig(ss, now) {
  var sheet = ss.getSheetByName(SHEET.SYSTEM_CONFIG);
  if (!sheet) return;

  var lastRow  = sheet.getLastRow();
  var existing = {};

  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      var k = String(rows[i][0] || '').trim();
      if (k) existing[k] = true;
    }
  }

  var toAdd = SYSTEM_CONFIG_DEFAULTS.filter(function(d) { return !existing[d.key]; });
  if (toAdd.length === 0) return;

  var rows = toAdd.map(function(d) {
    return [d.key, d.value, d.description, now, 'bootstrap'];
  });
  sheet.getRange(lastRow + 1, 1, rows.length, 5).setValues(rows);
}

function protectHeaderRow(sheet) {
  try {
    var protection = sheet.getRange(1, 1, 1, sheet.getLastColumn()).protect();
    protection.setDescription('Header row — do not edit manually');
    protection.setWarningOnly(true);
  } catch (_) {}
}
