// ═══════════════════════════════════════════════════════════════════════════════
//  API — wraps every Apps Script request in the standard envelope
// ═══════════════════════════════════════════════════════════════════════════════

// Set by the build / deploy step or overridden for local testing.
const API_ENDPOINT = (function () {
  if (typeof APPS_SCRIPT_URL !== 'undefined') return APPS_SCRIPT_URL;
  const meta = document.querySelector('meta[name="api-endpoint"]');
  if (meta) return meta.getAttribute('content');
  return '';
}());

// ─── CORE POST ────────────────────────────────────────────────────────────────

/**
 * Sends a request to the Apps Script web app.
 * Returns the parsed `data` object on success, throws an ApiError on failure.
 */
async function apiPost(action, payload, requestId) {
  const rid     = requestId || generateRequestId();
  const session = getStaffSession();
  const body    = {
    action,
    requestId:    rid,
    sessionToken: session ? (session.sessionToken || '') : '',
    payload:      payload || {},
  };

  let response;
  try {
    // text/plain avoids the CORS preflight that Apps Script cannot answer;
    // doPost parses e.postData.contents as JSON regardless of content type.
    response = await fetch(API_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new ApiError('NETWORK_ERROR', 'No internet connection. Your data will be saved and sent when you reconnect.');
  }

  let json;
  try {
    json = await response.json();
  } catch (_) {
    throw new ApiError('SERVER_ERROR', 'Server returned an invalid response.');
  }

  if (json.status === 'OK') {
    return json.data || {};
  }

  const err = (json.error || {});
  throw new ApiError(err.code || 'SERVER_ERROR', err.message || 'An unexpected error occurred.', err.details);
}

// ─── API ERROR CLASS ─────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code    = code;
    this.details = details || {};
  }
}

// ─── NAMED WRAPPERS ───────────────────────────────────────────────────────────

async function apiGetSystemConfig() {
  return apiPost('getSystemConfig', {});
}

async function apiHealthCheck() {
  return apiPost('healthCheck', {});
}

async function apiInitConsent(payload) {
  return apiPost('initConsent', payload);
}

async function apiGetParticipantByToken(token) {
  return apiPost('getParticipantByToken', { token });
}

async function apiSaveParticipantInfo(payload, requestId) {
  return apiPost('saveParticipantInfo', payload, requestId);
}

async function apiSubmitCapacityBuilding(payload, requestId) {
  return apiPost('submitCapacityBuilding', payload, requestId);
}

async function apiUploadCvMetadata(payload, requestId) {
  return apiPost('uploadCvMetadata', payload, requestId);
}

async function apiWithdrawConsent(payload) {
  return apiPost('withdrawConsent', payload);
}

// ─── ERROR DISPLAY HELPER ────────────────────────────────────────────────────

function apiErrorMessage(err) {
  if (!(err instanceof ApiError)) return err.message || 'Something went wrong.';
  switch (err.code) {
    case 'TOKEN_INVALID':   return 'Your registration link is invalid or has expired. Please contact your field officer for a new link.';
    case 'AUTH_REQUIRED':   return 'Your session has expired. Please log in again.';
    case 'FORBIDDEN':       return 'You do not have permission to perform this action.';
    case 'RATE_LIMITED':    return 'Too many attempts. Please wait 15 minutes and try again.';
    case 'NOT_FOUND':       return 'Record not found.';
    case 'CONFLICT':        return err.message || 'This action conflicts with the current state.';
    case 'VALIDATION_ERROR': return err.message || 'Please check the form and try again.';
    case 'NETWORK_ERROR':   return err.message;
    default:                return err.message || 'An unexpected error occurred. Please try again.';
  }
}
