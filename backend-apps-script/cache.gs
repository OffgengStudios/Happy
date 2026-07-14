// ═══════════════════════════════════════════════════════════════════════════════
//  CACHE — short-TTL caching of full-sheet reads to cut Google Sheets latency.
//
//  Dashboard list endpoints read an entire tab on every call (the slow part).
//  getCachedRecords() memoizes that read in CacheService for a few seconds.
//  Writers invalidate the relevant tab so lists stay fresh after a change:
//    - updateRow() auto-invalidates its sheet (covers most mutations)
//    - append-based creates call invalidateRecordsCache(SHEET.X) explicitly
// ═══════════════════════════════════════════════════════════════════════════════

var RECORDS_CACHE_TTL = 30;      // seconds (short — bounds staleness from other users)
var RECORDS_CACHE_MAX = 90000;   // CacheService per-value char limit is 100KB; stay under it

// Returns getRecords(sheet) for a tab, served from cache when available.
function getCachedRecords(sheetName, headers) {
  var cache = CacheService.getScriptCache();
  var key   = 'recs_v1_' + sheetName;
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch (_) {}

  var recs = getRecords(getOrCreateSheet(sheetName, headers), headers);
  try {
    var s = JSON.stringify(recs);
    if (s.length <= RECORDS_CACHE_MAX) cache.put(key, s, RECORDS_CACHE_TTL); // skip caching very large tabs
  } catch (_) {}
  return recs;
}

// Drops the cached read for a tab. Call after any write to that tab.
function invalidateRecordsCache(sheetName) {
  if (!sheetName) return;
  try { CacheService.getScriptCache().remove('recs_v1_' + sheetName); } catch (_) {}
}
