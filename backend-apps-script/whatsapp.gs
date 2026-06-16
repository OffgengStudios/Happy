// ═══════════════════════════════════════════════════════════════════════════════
//  WHATSAPP.GS — WhatsApp integration: webhook handler, message sending,
//                continuation links.
//
//  All functionality is gated behind the `enableWhatsApp` System_Config flag.
//  Signature verification for `receiveWhatsappWebhook` is performed by Code.gs
//  before this handler is called.
//
//  Inbound messages are forwarded here by the CV Parser FastAPI service, which
//  is the registered WhatsApp Business webhook endpoint with Meta.
// ═══════════════════════════════════════════════════════════════════════════════

var WA_API_VERSION       = 'v20.0';
var WA_GRAPH_BASE        = 'https://graph.facebook.com/' + WA_API_VERSION;
var WA_CONTINUATION_DAYS = 7;

// ─── PUBLIC ENTRY POINT ───────────────────────────────────────────────────────

/**
 * Called from routes.gs as the handler for action "receiveWhatsappWebhook".
 * Signature has already been verified by Code.gs.
 */
function handleWhatsappWebhook(payload, headers) {
  if (!_waEnabled()) {
    return successResponse('', { skipped: true, reason: 'WhatsApp integration is disabled.' });
  }

  var waMessageId = String(payload.waMessageId || '').trim();
  var from        = String(payload.from        || '').trim();
  var type        = String(payload.type        || 'text').trim();

  if (!waMessageId || !from) {
    return successResponse('', { skipped: true, reason: 'Missing waMessageId or from.' });
  }

  // Idempotency: skip duplicate webhook deliveries
  var cacheKey = 'wa_msg:' + hashValue(waMessageId);
  var cache    = CacheService.getScriptCache();
  if (cache.get(cacheKey)) {
    return successResponse('', { skipped: true, reason: 'Duplicate message.' });
  }
  cache.put(cacheKey, '1', 3600); // 1-hour dedup window

  appendAudit({
    participantId: '',
    actorType:     'integration',
    actorId:       'whatsapp',
    action:        EVENT.WHATSAPP_WEBHOOK_RECEIVED,
    entityType:    'whatsapp_message',
    entityId:      waMessageId,
    status:        'received',
    summary:       'WhatsApp ' + type + ' message received',
    metadata:      { type: type, from: from },
  });

  // Media CVs are processed by the CV Parser before forwarding here — skip them
  if (type === 'document' || type === 'image' || type === 'video' || type === 'audio') {
    return successResponse('', { processed: false, reason: 'Media handled by CV Parser.' });
  }

  // Find participant by normalised phone
  var normalised  = normalizePhone(from);
  var participant = _findParticipantByPhone(normalised);

  if (!participant) {
    _sendWhatsappMessage(from, _unknownSenderMessage());
    return successResponse('', { processed: true, participantFound: false });
  }

  if (!isMessagingAllowed(participant)) {
    return successResponse('', { processed: true, participantFound: true, messagingAllowed: false });
  }

  // Route intent
  var text = String((payload.text && payload.text.body) || payload.text || '').toLowerCase().trim();
  _handleTextIntent(from, text, participant);

  return successResponse('', { processed: true, participantFound: true, participantId: participant.participantId });
}

// ─── PUBLIC HELPERS ───────────────────────────────────────────────────────────

/**
 * Returns false if the participant's overallStatus is 'withdrawn' or 'archived'.
 * All outgoing messages should be gated through this check.
 */
function isMessagingAllowed(participant) {
  var status = String(participant.overallStatus || '').toLowerCase();
  return status !== 'withdrawn' && status !== 'archived';
}

/**
 * Creates a continuation token for the participant and sends the link via WhatsApp.
 * Purpose must be one of the valid token purposes in consent.gs.
 */
function sendContinuationLink(participantId, purpose) {
  if (!_waEnabled()) return false;

  purpose = purpose || 'whatsapp_continuation';

  var rowIndex = findParticipantRow({ participantId: participantId });
  if (rowIndex < 0) {
    console.warn('sendContinuationLink: participant not found: ' + participantId);
    return false;
  }

  var master      = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  var participant = rowToObject(
    HEADERS.MASTER,
    master.getRange(rowIndex, 1, 1, HEADERS.MASTER.length).getValues()[0]
  );

  if (!isMessagingAllowed(participant)) return false;

  var toPhone = String(participant.consentPhone || participant.telephone || '').trim();
  if (!toPhone) {
    console.warn('sendContinuationLink: no phone for participant: ' + participantId);
    return false;
  }

  var rawToken = createToken();
  var tokenId  = createTokenRecord(participantId, purpose, rawToken, WA_CONTINUATION_DAYS);
  var sysConfig = getSystemConfig();
  var frontendUrl = (sysConfig.candidateFrontendUrl || '').replace(/\/$/, '');
  var url = frontendUrl
    ? frontendUrl + '/?token=' + encodeURIComponent(rawToken)
    : '?token=' + encodeURIComponent(rawToken);

  var name    = String(participant.surname || participant.consentName || '').trim() || 'there';
  var message = _continuationMessage(name, url);

  appendAudit({
    participantId: participantId,
    actorType:     'system',
    actorId:       'whatsapp',
    action:        EVENT.TOKEN_CREATED,
    entityType:    'token',
    entityId:      tokenId,
    status:        'success',
    summary:       'Continuation token sent via WhatsApp',
    metadata:      { purpose: purpose, lifetimeDays: WA_CONTINUATION_DAYS },
  });

  return _sendWhatsappMessage(toPhone, message);
}

/**
 * Sends a plain-text WhatsApp message via the Meta Cloud API.
 * Returns true on success, false on failure.
 * Logs all outcomes to Audit_Log.
 */
function sendWhatsappMessage(toPhone, text) {
  return _sendWhatsappMessage(toPhone, text);
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

function _waEnabled() {
  var sc = getSystemConfig();
  return sc.enableWhatsApp === 'true' || sc.enableWhatsApp === true;
}

function _handleTextIntent(from, text, participant) {
  var participantId = participant.participantId;
  var name = String(participant.surname || participant.consentName || '').trim() || 'there';

  // Intent: explicit "continue" / "register" / "hello" / "hi"
  var CONTINUE_INTENTS = ['continue', 'register', 'resume', 'hello', 'hi', 'help', 'start'];
  var matched = CONTINUE_INTENTS.some(function(k) { return text.indexOf(k) >= 0; });

  if (matched || text === '') {
    var rawToken  = createToken();
    var tokenId   = createTokenRecord(participantId, 'whatsapp_continuation', rawToken, WA_CONTINUATION_DAYS);
    var sysConfig = getSystemConfig();
    var frontendUrl = (sysConfig.candidateFrontendUrl || '').replace(/\/$/, '');
    var url = frontendUrl
      ? frontendUrl + '/?token=' + encodeURIComponent(rawToken)
      : '?token=' + encodeURIComponent(rawToken);

    appendAudit({
      participantId: participantId,
      actorType:     'system',
      actorId:       'whatsapp',
      action:        EVENT.TOKEN_CREATED,
      entityType:    'token',
      entityId:      tokenId,
      status:        'success',
      summary:       'Continuation token sent via WhatsApp (text intent)',
      metadata:      { purpose: 'whatsapp_continuation', lifetimeDays: WA_CONTINUATION_DAYS },
    });

    _sendWhatsappMessage(from, _continuationMessage(name, url));
  } else {
    _sendWhatsappMessage(from, _defaultReplyMessage(name));
  }
}

function _sendWhatsappMessage(toPhone, text) {
  // .env names this WHATSAPP_ACCESS_TOKEN; accept either property name.
  var token     = getConfigOptional('WHATSAPP_ACCESS_TOKEN') || getConfigOptional('WHATSAPP_API_TOKEN');
  var phoneId   = getConfigOptional('WHATSAPP_PHONE_NUMBER_ID');

  if (!token || !phoneId) {
    console.warn('sendWhatsappMessage: WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured.');
    appendAudit({
      participantId: '',
      actorType:     'system',
      actorId:       'whatsapp',
      action:        EVENT.WHATSAPP_MESSAGE_FAILED,
      entityType:    'whatsapp_message',
      entityId:      '',
      status:        'failed',
      summary:       'WhatsApp not configured — message not sent',
      metadata:      { to: toPhone },
    });
    return false;
  }

  var url  = WA_GRAPH_BASE + '/' + phoneId + '/messages';
  var body = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                toPhone,
    type:              'text',
    text:              { preview_url: false, body: text },
  };

  try {
    var response = UrlFetchApp.fetch(url, {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify(body),
      headers:     { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });

    var code  = response.getResponseCode();
    var ok    = (code >= 200 && code < 300);

    appendAudit({
      participantId: '',
      actorType:     'system',
      actorId:       'whatsapp',
      action:        ok ? EVENT.WHATSAPP_MESSAGE_SENT : EVENT.WHATSAPP_MESSAGE_FAILED,
      entityType:    'whatsapp_message',
      entityId:      '',
      status:        ok ? 'success' : 'failed',
      summary:       ok ? 'Message sent' : 'Message send failed (HTTP ' + code + ')',
      metadata:      { to: toPhone, httpStatus: code },
    });

    return ok;
  } catch (err) {
    appendAudit({
      participantId: '',
      actorType:     'system',
      actorId:       'whatsapp',
      action:        EVENT.WHATSAPP_MESSAGE_FAILED,
      entityType:    'whatsapp_message',
      entityId:      '',
      status:        'failed',
      summary:       'Message send threw: ' + err.message,
      metadata:      { to: toPhone },
    });
    return false;
  }
}

function _findParticipantByPhone(normalizedPhone) {
  if (!normalizedPhone) return null;

  var master = getOrCreateSheet(SHEET.MASTER, HEADERS.MASTER);
  if (master.getLastRow() < 2) return null;

  var phoneIdx = HEADERS.MASTER.indexOf('participantPhoneNormalized');
  if (phoneIdx < 0) return null;

  var statusIdx = HEADERS.MASTER.indexOf('overallStatus');
  var rows = master.getRange(2, 1, master.getLastRow() - 1, HEADERS.MASTER.length).getValues();

  for (var r = 0; r < rows.length; r++) {
    var rowPhone = String(rows[r][phoneIdx] || '');
    var rowStatus = String(rows[r][statusIdx] || '');
    if (rowPhone === normalizedPhone && rowStatus !== 'archived') {
      return rowToObject(HEADERS.MASTER, rows[r]);
    }
  }
  return null;
}

function _continuationMessage(name, url) {
  return (
    'Hi ' + name + '! You can continue your Happy Kollekt registration using the link below.\n\n' +
    url + '\n\n' +
    'This link expires in ' + WA_CONTINUATION_DAYS + ' days. ' +
    'If you have questions, please contact your nearest registration centre.'
  );
}

function _defaultReplyMessage(name) {
  return (
    'Hi ' + name + '! To continue your registration, reply *CONTINUE* or *HELLO* ' +
    'and we will send you a secure link.'
  );
}

function _unknownSenderMessage() {
  return (
    'Hello! We could not find your registration in our system. ' +
    'Please visit a registration centre near you to get started.'
  );
}
