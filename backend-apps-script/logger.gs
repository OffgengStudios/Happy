// ═══════════════════════════════════════════════════════════════════════════════
//  LOGGER — audit log writer and EVENT constants
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EVENT CONSTANTS ──────────────────────────────────────────────────────────

const EVENT = {
  // Candidate
  CONSENT_SUBMITTED:        'candidate.consent_submitted',
  CONSENT_WITHDRAWN:        'candidate.consent_withdrawn',
  TOKEN_USED:               'candidate.token_used',
  TOKEN_EXPIRED:            'candidate.token_expired',
  TOKEN_REVOKED:            'candidate.token_revoked',
  TOKEN_CREATED:            'token.created',
  PROFILE_STARTED:          'candidate.profile_started',
  PROFILE_SAVED:            'candidate.profile_saved',
  PROFILE_SUBMITTED:        'candidate.profile_submitted',
  CAPACITY_SUBMITTED:       'candidate.capacity_submitted',
  CANDIDATE_CV_UPLOADED:    'candidate.cv_uploaded',

  // Staff auth
  STAFF_LOGIN_SUCCESS:      'staff.login_success',
  STAFF_LOGIN_FAILED:       'staff.login_failed',
  STAFF_LOGOUT:             'staff.logout',
  STAFF_SESSION_EXPIRED:    'staff.session_expired',
  STAFF_SESSION_REFRESHED:  'staff.session_refreshed',
  STAFF_USER_CREATED:       'staff.user_created',
  STAFF_USER_DISABLED:      'staff.user_disabled',
  STAFF_ROLE_CHANGED:       'staff.role_changed',
  STAFF_PASSWORD_RESET:     'staff.password_reset',

  // Participant
  PARTICIPANT_CREATED:          'participant.created',
  PARTICIPANT_UPDATED:          'participant.updated',
  PARTICIPANT_STATE_TRANSITIONED: 'participant.state_transitioned',
  PARTICIPANT_WITHDRAWN:        'participant.withdrawn',
  PARTICIPANT_DUPLICATE_FLAGGED: 'participant.duplicate_flagged',
  PARTICIPANT_MERGED:           'participant.merged',
  PARTICIPANT_ARCHIVED:         'participant.archived',
  PARTICIPANT_EXPORTED:         'participant.exported',
  PARTICIPANT_SENSITIVE_VIEWED: 'participant.sensitive_viewed',

  // CV and matching
  CV_UPLOADED:         'cv.uploaded',
  CV_PARSE_QUEUED:     'cv.parse_queued',
  CV_PARSE_STARTED:    'cv.parse_started',
  CV_PARSE_COMPLETED:  'cv.parse_completed',
  CV_PARSE_FAILED:     'cv.parse_failed',
  CV_REVIEWED:         'cv.reviewed',
  MATCH_RUN:           'match.run',
  MATCH_REVIEWED:      'match.reviewed',
  MATCH_SHORTLISTED:   'match.shortlisted',
  MATCH_REJECTED:      'match.rejected',

  // Placement and outcomes
  PLACEMENT_CREATED:          'placement.created',
  PLACEMENT_UPDATED:          'placement.updated',
  PLACEMENT_ENDED:            'placement.ended',
  OUTCOME_CREATED:            'outcome.created',
  OUTCOME_UPDATED:            'outcome.updated',
  OUTCOME_FOLLOWUP_DUE:       'outcome.followup_due',
  OUTCOME_FOLLOWUP_OVERDUE:   'outcome.followup_overdue',

  // Data quality
  DQ_SCAN_STARTED:     'data_quality.scan_started',
  DQ_SCAN_COMPLETED:   'data_quality.scan_completed',
  DQ_ISSUE_CREATED:    'data_quality.issue_created',
  DQ_ISSUE_RESOLVED:   'data_quality.issue_resolved',
  DQ_ISSUE_DISMISSED:  'data_quality.issue_dismissed',

  // Integrations
  CV_PARSER_CALLBACK_RECEIVED: 'integration.cv_parser_callback_received',
  CV_PARSER_CALLBACK_REJECTED: 'integration.cv_parser_callback_rejected',
  WHATSAPP_WEBHOOK_RECEIVED:   'integration.whatsapp_webhook_received',
  WHATSAPP_MESSAGE_SENT:       'integration.whatsapp_message_sent',
  WHATSAPP_MESSAGE_FAILED:     'integration.whatsapp_message_failed',

  // System
  CONFIG_UPDATED:      'system.config_updated',
  SCHEMA_BOOTSTRAPPED: 'system.schema_bootstrapped',
  DEPLOYMENT_CHECKED:  'system.deployment_checked',
  SYSTEM_ERROR:        'system.error',
};

// ─── APPEND AUDIT ─────────────────────────────────────────────────────────────

/**
 * Appends one row to Audit_Log.
 *
 * Required fields: action, actorType, actorId, entityType, status
 * Optional:        requestId, participantId, actorRole, entityId, beforeHash,
 *                  afterHash, summary, metadata (object), ipAddress, userAgent
 *
 * Never pass raw tokens, passwords, secrets, PII field values, or full CV text
 * in the entry — only IDs, hashes, action names, and non-sensitive metadata.
 */
function appendAudit(entry) {
  try {
    var sheet = getOrCreateSheet(SHEET.AUDIT_LOG, HEADERS.AUDIT_LOG);
    var now   = new Date().toISOString();

    var metaJson = '';
    if (entry.metadata && typeof entry.metadata === 'object') {
      try { metaJson = JSON.stringify(entry.metadata); } catch (_) { metaJson = ''; }
    }

    sheet.appendRow([
      Utilities.getUuid(),                    // auditId
      now,                                    // timestamp
      entry.requestId    || '',               // requestId
      entry.participantId || '',              // participantId
      entry.actorType    || 'system',         // actorType
      entry.actorId      || 'system',         // actorId
      entry.actorRole    || '',               // actorRole
      entry.action       || '',               // action
      entry.entityType   || '',               // entityType
      entry.entityId     || '',               // entityId
      entry.status       || 'success',        // status
      entry.beforeHash   || '',               // beforeHash
      entry.afterHash    || '',               // afterHash
      entry.summary      || '',               // summary
      metaJson,                               // metadataJson
      entry.ipAddress    || '',               // ipAddress
      entry.userAgent    || '',               // userAgent
    ]);
  } catch (err) {
    // Never let a logging failure crash the request — log to console only
    console.error('appendAudit failed: ' + (err.message || String(err)));
  }
}

// ─── REDACTED LOG ─────────────────────────────────────────────────────────────

/**
 * Logs a minimal audit event suitable for error and security events.
 * Deliberately avoids including payload values or PII.
 */
function redactedLog(action, requestId, participantId, status, summary, metadata) {
  appendAudit({
    action:        action,
    requestId:     requestId     || '',
    participantId: participantId || '',
    actorType:     'system',
    actorId:       'system',
    entityType:    participantId ? 'participant' : 'system',
    entityId:      participantId || '',
    status:        status        || 'failed',
    summary:       summary       || '',
    metadata:      metadata      || {},
  });
}

// ─── ACTOR HELPER ─────────────────────────────────────────────────────────────

/**
 * Builds the actorType/actorId/actorRole fields from an actor object.
 * actor can be: { type:'staff', staffUser:{...} } | { type:'candidate', participantId } | { type:'system' }
 */
function actorFields(actor) {
  if (!actor) return { actorType: 'system', actorId: 'system', actorRole: '' };
  if (actor.type === 'staff' && actor.staffUser) {
    return {
      actorType: 'staff',
      actorId:   actor.staffUser.email || actor.staffUser.staffUserId || '',
      actorRole: actor.staffUser.role  || '',
    };
  }
  if (actor.type === 'candidate') {
    return { actorType: 'candidate', actorId: actor.participantId || '', actorRole: '' };
  }
  if (actor.type === 'integration') {
    return { actorType: 'integration', actorId: actor.name || 'integration', actorRole: '' };
  }
  return { actorType: 'system', actorId: 'system', actorRole: '' };
}
