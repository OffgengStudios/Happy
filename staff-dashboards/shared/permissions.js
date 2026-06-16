// ═══════════════════════════════════════════════════════════════════════════════
//  STAFF PERMISSIONS — mirrors ROLE_PERMISSIONS.md in the browser
// ═══════════════════════════════════════════════════════════════════════════════

// MUST stay in sync with ROLE_PERMISSIONS in backend-apps-script/auth.gs.
// (Source of truth: docs/ROLE_PERMISSIONS.md — yes + limited = granted.)
const STAFF_ROLE_PERMISSIONS = {
  it_admin: ['*'],
  me_officer: [
    'participants.read', 'participants.update',
    'consent.read',
    'capacity.read', 'capacity.update',
    'cv.read',
    'jobs.read',
    'placements.read', 'placements.update',
    'outcomes.read', 'outcomes.create', 'outcomes.update',
    'data_quality.read', 'data_quality.resolve',
    'reports.read', 'reports.export',
    'audit.read',
  ],
  partnerships: [
    'participants.read',
    'jobs.read', 'jobs.create', 'jobs.update',
    'matching.run', 'matching.review',
    'placements.read', 'placements.create', 'placements.update',
    'outcomes.read',
    'reports.read',
  ],
  recruitment: [
    'participants.read', 'participants.update',
    'consent.read',
    'capacity.read',
    'cv.read', 'cv.upload', 'cv.review', 'cv.export',
    'jobs.read', 'jobs.create', 'jobs.update',
    'matching.run', 'matching.review',
    'placements.read', 'placements.create', 'placements.update',
    'outcomes.read',
    'data_quality.read', 'data_quality.resolve',
    'reports.read', 'reports.export',
  ],
  youth_engagement: [
    'participants.read', 'participants.create_staff', 'participants.update',
    'consent.read', 'consent.withdraw',
    'tokens.create', 'tokens.revoke',
    'capacity.read', 'capacity.update',
    'cv.read', 'cv.upload',
    'jobs.read',
    'placements.read',
    'outcomes.read', 'outcomes.create', 'outcomes.update',
    'data_quality.read', 'data_quality.resolve',
    'reports.read',
  ],
};

// ─── CHECKS ───────────────────────────────────────────────────────────────────

function staffHasPermission(permission) {
  const s = staffGetSession();
  if (!s) return false;
  if (s.role === 'it_admin') return true;
  const perms = s.permissions || STAFF_ROLE_PERMISSIONS[s.role] || [];
  return perms.includes('*') || perms.includes(permission);
}

const _SECTION_PERMISSION = {
  participants:  'participants.read',
  consent:       'consent.read',
  capacity:      'capacity.read',
  cv:            'cv.read',
  jobs:          'jobs.read',
  matching:      'matching.review',
  placements:    'placements.read',
  outcomes:      'outcomes.read',
  data_quality:  'data_quality.read',
  reports:       'reports.read',
  audit:         'audit.read',
  staff_users:   'staff.manage',
  system_config: 'system.configure',
  integrations:  'integrations.manage',
};

function canAccessSection(section) {
  const required = _SECTION_PERMISSION[section];
  return required ? staffHasPermission(required) : false;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────

// Hide sidebar links the current user can't access
function applyPermissionsToNav() {
  document.querySelectorAll('[data-requires]').forEach(el => {
    const perm = el.getAttribute('data-requires');
    if (!staffHasPermission(perm)) el.style.display = 'none';
  });
}

// Show/hide form fields based on role-specific sensitivity
function filterSensitiveFields(containerEl, role) {
  const sensitiveByRole = {
    partnerships: ['ghanaCardId', 'voterId', 'signatureFileId', 'passwordHash'],
    recruitment:  ['ghanaCardId', 'voterId', 'signatureFileId', 'passwordHash', 'adminNotes'],
    me_officer:   ['signatureFileId', 'passwordHash'],
    youth_engagement: ['passwordHash'],
  };
  const toHide = sensitiveByRole[role] || [];
  toHide.forEach(field => {
    containerEl.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
      el.style.display = 'none';
    });
  });
}
