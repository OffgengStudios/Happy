// ═══════════════════════════════════════════════════════════════════════════════
//  STAFF SHARED API — wraps all Apps Script requests with session token injection
// ═══════════════════════════════════════════════════════════════════════════════

const STAFF_API_ENDPOINT = (function () {
  if (typeof APPS_SCRIPT_URL !== 'undefined') return APPS_SCRIPT_URL;
  const meta = document.querySelector('meta[name="api-endpoint"]');
  return meta ? meta.getAttribute('content') : '';
}());

async function staffApiPost(action, payload, requestId) {
  const rid     = requestId || crypto.randomUUID();
  const session = staffGetSession();
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
    response = await fetch(STAFF_API_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(body),
    });
  } catch (_) {
    throw new StaffApiError('NETWORK_ERROR', 'Network error — check your connection.');
  }

  let json;
  try  { json = await response.json(); }
  catch (_) { throw new StaffApiError('SERVER_ERROR', 'Invalid server response.'); }

  if (json.status === 'OK') return json.data || {};

  const err = json.error || {};
  if (err.code === 'AUTH_REQUIRED') {
    staffClearSession();
    if (typeof showLoginScreen === 'function') showLoginScreen('Your session has expired.');
    throw new StaffApiError('AUTH_REQUIRED', 'Session expired.');
  }

  throw new StaffApiError(err.code || 'SERVER_ERROR', err.message || 'An unexpected error occurred.', err.details);
}

class StaffApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code    = code;
    this.details = details || {};
  }
}

function staffApiErrorMessage(err) {
  if (!(err instanceof StaffApiError)) return err.message || 'Something went wrong.';
  switch (err.code) {
    case 'AUTH_REQUIRED':    return 'Session expired. Please log in again.';
    case 'FORBIDDEN':        return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':        return 'Record not found.';
    case 'CONFLICT':         return err.message || 'Conflict with current state.';
    case 'VALIDATION_ERROR': return err.message || 'Validation error — check the form.';
    case 'RATE_LIMITED':     return 'Too many attempts. Please wait and try again.';
    case 'NETWORK_ERROR':    return err.message;
    default:                 return err.message || 'An unexpected error occurred.';
  }
}
