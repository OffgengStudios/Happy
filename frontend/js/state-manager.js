// ═══════════════════════════════════════════════════════════════════════════════
//  STATE MANAGER — sessionStorage-backed token + participant + staff session
// ═══════════════════════════════════════════════════════════════════════════════

const KEYS = {
  CANDIDATE_TOKEN:    'hk_candidate_token',
  PARTICIPANT:        'hk_participant',
  STAFF_SESSION:      'hk_staff_session',
  OFFLINE_QUEUE:      'hk_offline_queue',     // localStorage — survives reload
};

// ─── CANDIDATE TOKEN ──────────────────────────────────────────────────────────
// Stored in sessionStorage — cleared on tab close, never in history.

function getToken()     { return sessionStorage.getItem(KEYS.CANDIDATE_TOKEN) || ''; }
function setToken(tok)  { sessionStorage.setItem(KEYS.CANDIDATE_TOKEN, tok); }
function clearToken()   { sessionStorage.removeItem(KEYS.CANDIDATE_TOKEN); }

// ─── PARTICIPANT RECORD ───────────────────────────────────────────────────────

function getParticipant() {
  try { return JSON.parse(sessionStorage.getItem(KEYS.PARTICIPANT) || 'null'); }
  catch (_) { return null; }
}
function setParticipant(p) { sessionStorage.setItem(KEYS.PARTICIPANT, JSON.stringify(p)); }
function clearParticipant() { sessionStorage.removeItem(KEYS.PARTICIPANT); }

// ─── STAFF SESSION ────────────────────────────────────────────────────────────
// Also in sessionStorage.

function getStaffSession() {
  try { return JSON.parse(sessionStorage.getItem(KEYS.STAFF_SESSION) || 'null'); }
  catch (_) { return null; }
}
function setStaffSession(s) { sessionStorage.setItem(KEYS.STAFF_SESSION, JSON.stringify(s)); }
function clearStaffSession() { sessionStorage.removeItem(KEYS.STAFF_SESSION); }

function isStaffLoggedIn() {
  const s = getStaffSession();
  if (!s || !s.sessionToken || !s.sessionExpiresAt) return false;
  return Date.now() / 1000 < s.sessionExpiresAt;
}

// ─── OFFLINE QUEUE ────────────────────────────────────────────────────────────
// localStorage so submissions survive reload while offline.

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(KEYS.OFFLINE_QUEUE) || '[]'); }
  catch (_) { return []; }
}
function saveOfflineQueue(queue) { localStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(queue)); }

function enqueueOffline(action, payload) {
  const queue = getOfflineQueue();
  queue.push({ action, payload, queuedAt: new Date().toISOString(), requestId: generateRequestId() });
  saveOfflineQueue(queue);
}

async function flushOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length || !isOnline()) return 0;
  let flushed = 0;
  const remaining = [];
  for (const item of queue) {
    try {
      await apiPost(item.action, item.payload, item.requestId);
      flushed++;
    } catch (_) {
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
  return flushed;
}

// ─── TOKEN URL EXTRACTION ─────────────────────────────────────────────────────

function extractTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');
  if (token) {
    // Immediately remove token from URL — prevents browser history leakage
    const clean = window.location.pathname + (params.toString().replace(/token=[^&]*&?/, '').replace(/^&|&$/, '') ? '?' + params.toString().replace(/token=[^&]*&?/, '').replace(/^&|&$/, '') : '');
    history.replaceState(null, '', clean || window.location.pathname);
    return token;
  }
  return null;
}

// ─── ALLOWED ACTIONS ─────────────────────────────────────────────────────────

const STAGE_ALLOWED_ACTIONS = {
  participant_information: ['saveParticipantInfo', 'uploadCvMetadata'],
  capacity_building:       ['submitCapacityBuilding', 'uploadCvMetadata'],
  cv_upload:               ['uploadCvMetadata'],
  cv_parsing:              [],
  job_matching:            [],
  job_placement:           [],
  outcome_tracking:        [],
  completed:               [],
  withdrawn:               [],
  archived:                [],
};

function getAllowedActions(stage) {
  return STAGE_ALLOWED_ACTIONS[stage] || [];
}
