// ═══════════════════════════════════════════════════════════════════════════════
//  CODE.GS — Apps Script entry points (doPost / doGet)
// ═══════════════════════════════════════════════════════════════════════════════

var JSON_MIME = ContentService.MimeType.JSON;

// ─── POST (all actions) ───────────────────────────────────────────────────────

function doPost(e) {
  var requestId = '';
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _jsonResponse(errorResponse('', 'VALIDATION_ERROR', 'Empty request body.'));
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (_) {
      return _jsonResponse(errorResponse('', 'VALIDATION_ERROR', 'Request body is not valid JSON.'));
    }

    var action       = String(body.action       || '').trim();
    requestId        = String(body.requestId    || '').trim();
    var sessionToken = String(body.sessionToken || '').trim();
    var payload      = body.payload || {};
    var reqHeaders   = (e && e.headers) ? e.headers : {};

    if (!action) {
      return _jsonResponse(errorResponse(requestId, 'VALIDATION_ERROR', 'action is required.'));
    }

    var handler = ACTION_MAP[action];
    if (!handler) {
      return _jsonResponse(errorResponse(requestId, 'VALIDATION_ERROR', 'Unknown action: ' + action));
    }

    // Integration actions: verify shared secret before dispatch.
    // (Custom HTTP headers don't reach Apps Script reliably — payload fallback is the norm.)
    var PARSER_ACTIONS = ['receiveCvParserResult', 'listQueuedCvRecords', 'fetchCvFile', 'exportSheetData'];
    if (PARSER_ACTIONS.indexOf(action) >= 0) {
      var incomingSecret = reqHeaders['X-Integration-Secret'] || reqHeaders['x-integration-secret'] || payload.integrationSecret || '';
      var expectedSecret = getConfig('CV_PARSER_INTEGRATION_SECRET');
      if (!_constantTimeEqual(incomingSecret, expectedSecret)) {
        redactedLog(action, requestId, '', 'failed', 'Invalid integration secret');
        return _jsonResponse(errorResponse(requestId, 'FORBIDDEN', 'Invalid integration secret.'));
      }
    }

    // WhatsApp webhook: verify HMAC signature
    if (action === 'receiveWhatsappWebhook') {
      var waSignature = reqHeaders['X-Hub-Signature-256'] || reqHeaders['x-hub-signature-256'] || '';
      if (!_verifyWhatsappSignature(e.postData.contents, waSignature)) {
        redactedLog(action, requestId, '', 'failed', 'Invalid WhatsApp webhook signature');
        return _jsonResponse(errorResponse(requestId, 'FORBIDDEN', 'Invalid webhook signature.'));
      }
    }

    var context = { headers: reqHeaders, rawBody: e.postData.contents };
    var result  = handler(payload, sessionToken, requestId, context);
    return _jsonResponse(result);

  } catch (err) {
    var code    = err.code    || 'SERVER_ERROR';
    var message = err.message || 'An unexpected error occurred.';
    // Never expose raw stack traces or internal details
    if (code === 'SERVER_ERROR') {
      console.error('doPost SERVER_ERROR [' + requestId + ']: ' + message);
      message = 'An unexpected server error occurred.';
    }
    return _jsonResponse(errorResponse(requestId, code, message, err.details || {}));
  }
}

// ─── GET (health check + WhatsApp challenge) ─────────────────────────────────

function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    // WhatsApp webhook verification handshake (Phase 8)
    if (p['hub.mode'] === 'subscribe') {
      var waSecret     = getConfigOptional('WHATSAPP_WEBHOOK_SECRET');
      var enableWA     = (getSystemConfig().enableWhatsApp === 'true');
      if (enableWA && waSecret && p['hub.verify_token'] === waSecret) {
        return ContentService.createTextOutput(p['hub.challenge']);
      }
      return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
    }

    return _jsonResponse(successResponse('', {
      status:  'OK',
      version: BACKEND_VERSION,
      env:     getConfigOptional('ENVIRONMENT') || 'unknown',
    }));
  } catch (err) {
    return _jsonResponse(errorResponse('', 'SERVER_ERROR', 'Health check failed.'));
  }
}

// ─── BOOTSTRAP (run once manually from Apps Script editor) ───────────────────

function runBootstrap() {
  bootstrapSchema();
  Logger.log('Schema bootstrapped. Version: ' + BACKEND_VERSION);
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(JSON_MIME);
}

function _verifyWhatsappSignature(rawBody, signatureHeader) {
  try {
    var secret    = getConfigOptional('WHATSAPP_WEBHOOK_SECRET');
    if (!secret) return false;
    var expected  = 'sha256=' + bytesToHex(Utilities.computeHmacSha256Signature(rawBody, secret));
    return _constantTimeEqual(String(signatureHeader || ''), expected);
  } catch (_) {
    return false;
  }
}
