// ═══════════════════════════════════════════════════════════════════════════════
//  STAFF AUTH — session storage, login, logout, refresh
// ═══════════════════════════════════════════════════════════════════════════════

const STAFF_SESSION_KEY = 'hk_staff_session';

// ─── SESSION STORAGE ──────────────────────────────────────────────────────────

function staffGetSession() {
  try { return JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}

function staffSetSession(s) {
  sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(s));
}

function staffClearSession() {
  sessionStorage.removeItem(STAFF_SESSION_KEY);
}

function isStaffAuthenticated() {
  const s = staffGetSession();
  if (!s || !s.sessionToken || !s.sessionExpiresAt) return false;
  return Math.floor(Date.now() / 1000) < s.sessionExpiresAt;
}

function staffGetCurrentUser() {
  return staffGetSession();
}

// ─── ACTIONS ──────────────────────────────────────────────────────────────────

async function staffLogin(email, password) {
  const data = await staffApiPost('staffLogin', { email, password });
  staffSetSession({
    sessionToken:     data.sessionToken,
    sessionExpiresAt: data.sessionExpiresAt,
    staffUserId:      data.staffUserId,
    email:            data.email,
    displayName:      data.displayName,
    role:             data.role,
    permissions:      data.permissions || [],
  });
  return data;
}

async function staffLogout() {
  try { await staffApiPost('staffLogout', {}); } catch (_) {}
  staffClearSession();
}

async function staffRefreshIfNeeded() {
  const s = staffGetSession();
  if (!s) return;
  const now    = Math.floor(Date.now() / 1000);
  const margin = 15 * 60; // refresh 15 min before expiry
  if (s.sessionExpiresAt - now < margin) {
    try {
      const data = await staffApiPost('staffRefreshSession', {});
      staffSetSession({ ...s, sessionToken: data.sessionToken, sessionExpiresAt: data.sessionExpiresAt });
    } catch (_) {}
  }
}

// Keep the active session alive while staff are working (checks every 5 min,
// only renews within 15 min of expiry). Prevents mid-task logout at the 6h cap.
setInterval(function () { staffRefreshIfNeeded(); }, 5 * 60 * 1000);
