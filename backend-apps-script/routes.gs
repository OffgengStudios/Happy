// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTES — ACTION_MAP binding every API action to its handler
//
//  Handler signature: fn(payload, sessionToken, requestId, context)
//  context = { headers: {}, rawBody: '' }
// ═══════════════════════════════════════════════════════════════════════════════

var ACTION_MAP = {

  // ─── CANDIDATE (no session token needed) ───────────────────────────────────

  initConsent: function(p, s, r) {
    return initConsent(p, r);
  },

  getParticipantByToken: function(p) {
    return getParticipantByToken(p);
  },

  // ─── PUBLIC CONFIG / HEALTH (no auth) ──────────────────────────────────────

  getSystemConfig: function(p, s, r) {
    return successResponse(r, getPublicConfig());
  },

  healthCheck: function(p, s, r) {
    return successResponse(r, healthCheck());
  },

  saveParticipantInfo: function(p, s, r) {
    return saveParticipantInfo(p, r);
  },

  submitCapacityBuilding: function(p, s, r) {
    return submitCapacityBuilding(p, s, r);
  },

  uploadCvMetadata: function(p, s, r) {
    return uploadCvMetadata(p, r);
  },

  // ─── EMPLOYER PARTNERSHIP PORTAL (public — employers have no accounts) ──────

  submitPartnership: function(p, s, r, ctx) {
    return submitPartnership(p, r, ctx);
  },

  uploadPartnershipDocument: function(p, s, r, ctx) {
    return uploadPartnershipDocument(p, r, ctx);
  },

  // ─── STAFF AUTH ────────────────────────────────────────────────────────────

  staffLogin: function(p, s, r) {
    return successResponse(r, staffLogin(p, r));
  },

  staffLogout: function(p, s, r) {
    return successResponse(r, staffLogout(s, r));
  },

  staffRefreshSession: function(p, s, r) {
    return successResponse(r, staffRefreshSession(s, r));
  },

  getCurrentStaffUser: function(p, s, r) {
    var staffUser = validateSession(s);
    return successResponse(r, {
      staffUser: {
        staffUserId: staffUser.staffUserId,
        email:       staffUser.email,
        displayName: staffUser.displayName,
        role:        staffUser.role,
        permissions: permissionsForRole(staffUser.role),
        sessionExpiresAt: staffUser.sessionExpiresAt,
      },
    });
  },

  bootstrapFirstAdmin: function(p, s, r) {
    return successResponse(r, bootstrapFirstAdmin(p));
  },

  createStaffUser: function(p, s, r) {
    return createStaffUser(p, s);
  },

  updateStaffUser: function(p, s, r) {
    return updateStaffUser(p, s, r);
  },

  changeOwnPassword: function(p, s, r) {
    return changeOwnPassword(p, s, r);
  },

  adminResetStaffPassword: function(p, s, r) {
    return adminResetStaffPassword(p, s, r);
  },

  // ─── PARTICIPANT OPERATIONS ────────────────────────────────────────────────

  searchParticipants: function(p, s, r) {
    return searchParticipants(p, s);
  },

  // ─── STAFF READ LISTS ──────────────────────────────────────────────────────

  searchCvRecords: function(p, s, r) {
    return searchCvRecords(p, s);
  },

  searchMatches: function(p, s, r) {
    return searchMatches(p, s);
  },

  searchPlacements: function(p, s, r) {
    return searchPlacements(p, s);
  },

  searchJobOpportunities: function(p, s, r) {
    return searchJobOpportunities(p, s);
  },

  getAuditLog: function(p, s, r) {
    return getAuditLog(p, s);
  },

  listStaffUsers: function(p, s, r) {
    return listStaffUsers(p, s);
  },

  runBootstrap: function(p, s, r) {
    return runBootstrapAction(p, s);
  },

  getParticipantDetail: function(p, s, r) {
    return getParticipantDetail(p, s);
  },

  getParticipantById: function(p, s, r) {
    return getParticipantById(p, s);
  },

  adminUpdateParticipant: function(p, s, r) {
    return adminUpdateParticipant(p, s, r);
  },

  transitionParticipantState: function(p, s, r) {
    return transitionParticipantState(p, s, r);
  },

  withdrawConsent: function(p, s, r) {
    return withdrawConsent(p, s, r);
  },

  createParticipantByStaff: function(p, s, r) {
    return createParticipantByStaff(p, s, r);
  },

  staffCreateContinuationToken: function(p, s, r) {
    return staffCreateContinuationToken(p, s, r);
  },

  mergeDuplicateParticipants: function(p, s, r) {
    return mergeDuplicateParticipants(p, s, r);
  },

  archiveParticipant: function(p, s, r) {
    return archiveParticipant(p, s, r);
  },

  // ─── CV ────────────────────────────────────────────────────────────────────

  staffUploadCvMetadata: function(p, s, r) {
    return staffUploadCvMetadata(p, s, r);
  },

  reviewCvResult: function(p, s, r) {
    return reviewCvResult(p, s, r);
  },

  // ─── INTEGRATION CALLBACKS ─────────────────────────────────────────────────
  // Security: Code.gs verifies integration secret BEFORE calling these.

  receiveCvParserResult: function(p, s, r) {
    return receiveCvParserResult(p, r);
  },

  listQueuedCvRecords: function(p, s, r) {
    return listQueuedCvRecords(p, r);
  },

  fetchCvFile: function(p, s, r) {
    return fetchCvFile(p, r);
  },

  exportSheetData: function(p, s, r) {
    return exportSheetData(p, r);
  },

  receiveWhatsappWebhook: function(p, s, r, ctx) {
    return handleWhatsappWebhook(p, ctx && ctx.headers);
  },

  // ─── JOBS / MATCHING / PLACEMENT / OUTCOMES ────────────────────────────────

  createJobOpportunity: function(p, s, r) {
    return createJobOpportunity(p, s, r);
  },

  updateJobOpportunity: function(p, s, r) {
    return updateJobOpportunity(p, s, r);
  },

  runJobMatch: function(p, s, r) {
    return runJobMatch(p, s, r);
  },

  reviewJobMatch: function(p, s, r) {
    return reviewJobMatch(p, s, r);
  },

  recordPlacement: function(p, s, r) {
    return recordPlacement(p, s, r);
  },

  updatePlacement: function(p, s, r) {
    return updatePlacement(p, s, r);
  },

  recordOutcome: function(p, s, r) {
    return recordOutcome(p, s, r);
  },

  runDataQualityScan: function(p, s, r) {
    return runDataQualityScan(p, s, r);
  },

  resolveDataQualityIssue: function(p, s, r) {
    return resolveDataQualityIssue(p, s, r);
  },

  listDataQualityIssues: function(p, s, r) {
    return listDataQualityIssues(p, s, r);
  },

  installDqTrigger: function(p, s, r) {
    return installDqTrigger(p, s, r);
  },

  getReport: function(p, s, r) {
    return getReport(p, s, r);
  },

  getCandidatePipeline: function(p, s, r) {
    return getCandidatePipeline(p, s, r);
  },

  searchPartnershipSubmissions: function(p, s, r) {
    return searchPartnershipSubmissions(p, s);
  },

  getPartnershipDetail: function(p, s, r) {
    return getPartnershipDetail(p, s);
  },

  updatePartnershipStatus: function(p, s, r) {
    return updatePartnershipStatus(p, s, r);
  },

  cleanupStalePartnershipDocuments: function(p, s, r) {
    return cleanupStalePartnershipDocuments(p, s);
  },

  exportReport: function(p, s, r) {
    return exportReport(p, s, r);
  },
};
