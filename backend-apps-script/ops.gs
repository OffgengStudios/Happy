// ═══════════════════════════════════════════════════════════════════════════════
//  OPS — scheduled maintenance (idempotency log purge, expired token sweep)
//  purgeExpiredIdempotency() and sweepExpiredTokens() are invoked from the hourly
//  trigger (see dqScanTriggerCallback) so no extra trigger needs installing.
// ═══════════════════════════════════════════════════════════════════════════════

// Deletes Idempotency_Log rows whose ttlExpiresAt has passed. Bottom-up delete to
// keep row indices valid. Returns the number of rows removed.
function purgeExpiredIdempotency() {
  var sheet = getOrCreateSheet(SHEET.IDEMPOTENCY_LOG, HEADERS.IDEMPOTENCY_LOG);
  if (sheet.getLastRow() < 2) return 0;

  var ttlIdx = HEADERS.IDEMPOTENCY_LOG.indexOf('ttlExpiresAt');
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.IDEMPOTENCY_LOG.length).getValues();
  var now    = Date.now();
  var removed = 0;

  for (var i = values.length - 1; i >= 0; i--) {
    var ttl = new Date(values[i][ttlIdx] || 0).getTime();
    if (ttl && ttl < now) { sheet.deleteRow(i + 2); removed++; }
  }
  return removed;
}

// Marks Token_Index rows expired when their expiry has passed (keeps status accurate
// even for tokens that were never re-presented).
function sweepExpiredTokens() {
  var sheet = getOrCreateSheet(SHEET.TOKEN_INDEX, HEADERS.TOKEN_INDEX);
  if (sheet.getLastRow() < 2) return 0;

  var idx = {};
  for (var i = 0; i < HEADERS.TOKEN_INDEX.length; i++) idx[HEADERS.TOKEN_INDEX[i]] = i;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.TOKEN_INDEX.length).getValues();
  var now  = new Date();
  var n    = 0;

  for (var r = 0; r < rows.length; r++) {
    if (String(rows[r][idx.status] || '') !== 'active') continue;
    var exp = rows[r][idx.expiresAt] ? new Date(rows[r][idx.expiresAt]) : null;
    if (exp && exp < now) { sheet.getRange(r + 2, idx.status + 1).setValue('expired'); n++; }
  }
  return n;
}

// Runs all hourly maintenance. Safe to call from any trigger.
function runHourlyMaintenance() {
  var purged  = 0, expired = 0;
  try { purged  = purgeExpiredIdempotency(); } catch (e) { console.error('purgeExpiredIdempotency: ' + e.message); }
  try { expired = sweepExpiredTokens();       } catch (e) { console.error('sweepExpiredTokens: ' + e.message); }
  return { idempotencyPurged: purged, tokensExpired: expired };
}
