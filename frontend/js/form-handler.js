// ═══════════════════════════════════════════════════════════════════════════════
//  FORM HANDLER — submission logic, validation, signature canvas, offline queue
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CANVAS SIGNATURE ────────────────────────────────────────────────────────

const _sig = {
  ctx:     null,
  drawing: false,
  signed:  false,
};

function initSignatureCanvas() {
  const canvas = $('consent-sig');
  if (!canvas) return;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr  = window.devicePixelRatio || 1;
    const w    = Math.round(rect.width  * dpr);
    const h    = Math.round(rect.height * dpr);
    if (canvas.width === w && canvas.height === h && _sig.ctx) return;
    const prev = _sig.signed && canvas.width ? canvas.toDataURL() : '';
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
    _sig.ctx = ctx;
    if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = prev; }
  };

  const point = e => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches?.[0] || e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  // The canvas starts inside a display:none screen (rect width 0), so the
  // context must be (re)created lazily once it actually has layout.
  const startStroke = e => {
    e.preventDefault();
    if (!_sig.ctx) resize();
    if (!_sig.ctx) return;
    _sig.drawing = true;
    _sig.signed  = true;
    const p = point(e);
    _sig.ctx.beginPath();
    _sig.ctx.moveTo(p.x, p.y);
  };

  canvas.addEventListener('mousedown',  startStroke);
  canvas.addEventListener('mousemove',  e => { if (!_sig.drawing || !_sig.ctx) return; const p = point(e); _sig.ctx.lineTo(p.x, p.y); _sig.ctx.stroke(); });
  canvas.addEventListener('mouseup',    ()  => { _sig.drawing = false; _sig.ctx?.closePath(); });
  canvas.addEventListener('mouseleave', ()  => { _sig.drawing = false; _sig.ctx?.closePath(); });
  canvas.addEventListener('touchstart', startStroke, { passive: false });
  canvas.addEventListener('touchmove',  e => { if (!_sig.drawing || !_sig.ctx) return; e.preventDefault(); const p = point(e); _sig.ctx.lineTo(p.x, p.y); _sig.ctx.stroke(); }, { passive: false });
  canvas.addEventListener('touchend',   ()  => { _sig.drawing = false; _sig.ctx?.closePath(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  setTimeout(resize, 50);

  $('clear-sig')?.addEventListener('click', () => {
    if (_sig.ctx) _sig.ctx.clearRect(0, 0, canvas.width, canvas.height);
    _sig.signed = false;
  });
}

function getSignatureDataUrl() {
  const canvas = $('consent-sig');
  if (!canvas || !_sig.signed) return '';
  return canvas.toDataURL('image/png');
}

// ─── CONSENT SUBMISSION ───────────────────────────────────────────────────────

async function handleConsentSubmit(e) {
  e.preventDefault();
  showStatus('consent-status', '', '');

  const name      = $('consent-name')?.value.trim()  || '';
  const phone     = $('consent-phone')?.value.trim() || '';
  const email     = $('consent-email')?.value.trim() || '';
  const venue     = $('consent-venue')?.value.trim() || '';
  const language  = $('consent-language')?.value    || 'en';
  const accepted  = $('consent-accepted')?.checked;
  const signature = getSignatureDataUrl();

  if (!name || !phone)  { showStatus('consent-status', 'Name and phone are required.', 'error'); return; }
  if (!validatePhone(phone)) { showStatus('consent-status', 'Please enter a valid Ghana phone number.', 'error'); return; }
  if (email && !validateEmail(email)) { showStatus('consent-status', 'Please enter a valid email address.', 'error'); return; }
  if (!accepted)        { showStatus('consent-status', 'You must accept to participate.', 'error'); return; }
  if (!_sig.signed)     { showStatus('consent-status', 'Please sign the form.', 'error'); return; }

  setSubmitting('consent-submit', true);
  showStatus('consent-status', 'Submitting…', 'info');

  try {
    const data = await apiInitConsent({ name, phone, email, venue, language, accepted: true, signature });
    // The continuation token is only ever returned inside the URL (never as a raw field).
    const continuationUrl = data.continuationUrl || data.registrationUrl || '';
    setToken(continuationUrl ? _extractTokenFromUrl(continuationUrl) || '' : '');
    if (data.token) setToken(data.token);

    showStatus('consent-status', '', '');
    // Navigate to participant information stage
    const participant = { participantId: data.participantId, currentStage: 'participant_information',
      consentName: name, consentPhone: phone, consentEmail: email };
    setParticipant(participant);
    routeToStage('participant_information', participant);
  } catch (err) {
    showStatus('consent-status', apiErrorMessage(err), 'error');
  } finally {
    setSubmitting('consent-submit', false);
  }
}

// registrationUrl may be relative ("?token=…") when candidateFrontendUrl is
// not configured on the backend, so plain new URL() would throw.
function _extractTokenFromUrl(url) {
  const m = String(url || '').match(/[?&]token=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// ─── PARTICIPANT INFO SUBMISSION ──────────────────────────────────────────────

async function handleParticipantInfoSubmit(e) {
  e.preventDefault();
  showStatus('pi-status', '', '');

  const token = getToken();
  if (!token) { showScreen('screen-token-invalid'); return; }

  const payload = collectParticipantInfoFields();
  const missing = validateParticipantInfoFields(payload);
  if (missing.length) {
    showStatus('pi-status', 'Please complete: ' + missing.join(', '), 'error');
    $('pi-' + missing[0].toLowerCase().replace(/\s/g, ''))?.focus();
    return;
  }

  payload.token = token;
  const requestId = generateRequestId();
  setSubmitting('pi-submit', true);
  showStatus('pi-status', 'Saving…', 'info');

  try {
    const data = await apiSaveParticipantInfo(payload, requestId);
    const updated = Object.assign({}, getParticipant(), payload, {
      currentStage: data.currentStage,
      participantInfoStatus: data.participantInfoStatus,
    });
    setParticipant(updated);
    const next = data.currentStage || 'participant_information';
    if (next === 'participant_information') {
      // Still on this stage (partial save) — keep the typed values on screen.
      showStatus('pi-status', 'Progress saved. Complete the remaining required fields to continue.', 'warn');
    } else {
      showStatus('pi-status', '', '');
      routeToStage(next, updated);
    }
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') {
      enqueueOffline('saveParticipantInfo', Object.assign({}, payload, { requestId }));
      showStatus('pi-status', 'Saved offline. Will sync when connection is restored.', 'warn');
    } else {
      showStatus('pi-status', apiErrorMessage(err), 'error');
    }
  } finally {
    setSubmitting('pi-submit', false);
  }
}

function collectParticipantInfoFields() {
  const ids = ['surname','firstName','otherNames','sex','dob','telephone','email',
    'ghanaCardId','voterId','idType','region','district','community','locationStatus',
    'educationLevel','employmentStatus','currentOccupation','monthlyIncome','incomeFrequency',
    'sector','industry','jobRole','jobType','disabilityStatus','disabilitySpecify',
    'refugeeStatus','nationality','displacementStatus','nationalityOrigin'];
  const out = {};
  ids.forEach(id => {
    const el = $('pi-' + id);
    if (el) out[id] = el.value || '';
  });
  return out;
}

function validateParticipantInfoFields(payload) {
  const required = [
    ['surname',          'Surname'],
    ['firstName',        'First Name'],
    ['sex',              'Sex'],
    ['dob',              'Date of Birth'],
    ['telephone',        'Phone Number'],
    ['region',           'Region'],
    ['educationLevel',   'Education Level'],
    ['employmentStatus', 'Employment Status'],
  ];
  const missing = [];
  required.forEach(([field, label]) => {
    if (!String(payload[field] || '').trim()) missing.push(label);
  });
  if (payload.telephone && !validatePhone(payload.telephone)) missing.push('Valid Phone Number');
  if (payload.email && !validateEmail(payload.email)) missing.push('Valid Email');
  return missing;
}

// ─── CAPACITY BUILDING SUBMISSION ─────────────────────────────────────────────

async function handleCapacityBuildingSubmit(e) {
  e.preventDefault();
  showStatus('cb-status', '', '');

  const token = getToken();
  if (!token) { showScreen('screen-token-invalid'); return; }

  const trainedByPartner = $('cb-trainedByPartner')?.value || '';

  const payload = { token };
  if (trainedByPartner === 'Yes') {
    const cbFields = ['trainingStartDate','trainingEndDate','trainingLocation','trainingMode',
      'virtualPlatform','trainerType','trainingPartner','completionStatus','certificateIssued',
      'modules','digitalSkills','wishTraining','previousTrainings','previousTrainingDesc'];
    cbFields.forEach(f => {
      const el = $('cb-' + f);
      if (el) payload[f] = el.value || '';
    });
  }
  payload.trainedByPartner = trainedByPartner;

  const requestId = generateRequestId();
  setSubmitting('cb-submit', true);
  showStatus('cb-status', 'Saving…', 'info');

  try {
    const data = await apiSubmitCapacityBuilding(payload, requestId);
    const updated = Object.assign({}, getParticipant(), { currentStage: data.currentStage || 'cv_upload' });
    setParticipant(updated);
    routeToStage(data.currentStage || 'cv_upload', updated);
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') {
      enqueueOffline('submitCapacityBuilding', Object.assign({}, payload, { requestId }));
      showStatus('cb-status', 'Saved offline. Will sync when connection is restored.', 'warn');
    } else {
      showStatus('cb-status', apiErrorMessage(err), 'error');
    }
  } finally {
    setSubmitting('cb-submit', false);
  }
}

// ─── CV UPLOAD ────────────────────────────────────────────────────────────────

async function handleCvFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const allowed = ['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'];
  if (!allowed.includes(file.type)) {
    showStatus('cv-status', 'Only PDF or Word documents (.pdf, .docx) are accepted.', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showStatus('cv-status', 'File must be smaller than 10 MB.', 'error');
    e.target.value = '';
    return;
  }

  // Show selected file name
  setText('cv-file-name', file.name);
  show('cv-file-selected');

  // Upload to Drive via Google Drive API (Drive Picker flow in production).
  // In this implementation the file is uploaded directly using fetch + Drive REST API.
  showStatus('cv-status', 'Uploading to Drive…', 'info');
  setSubmitting('cv-submit', true);

  try {
    const driveFileId = await uploadFileToDrive(file);
    await handleCvMetadataSubmit(driveFileId, file);
  } catch (err) {
    showStatus('cv-status', apiErrorMessage(err), 'error');
    setSubmitting('cv-submit', false);
  }
}

async function uploadFileToDrive(file) {
  // Uploads file to the Drive folder configured on the backend.
  // Uses the Drive Files API v3 multipart upload.
  // The access token must be available (Google Sign-In or service account).
  // In the GitHub Pages flow the user authorises via Google Identity Services.
  const token = await getDriveAccessToken();
  const metadata = JSON.stringify({ name: file.name, mimeType: file.type });
  const form     = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form }
  );
  if (!res.ok) throw new ApiError('INTEGRATION_ERROR', 'Failed to upload file to Drive.');
  const json = await res.json();
  if (!json.id) throw new ApiError('INTEGRATION_ERROR', 'Drive did not return a file ID.');

  // Share file with the configured folder (handled server-side via CV_UPLOAD_FOLDER_ID)
  return json.id;
}

async function handleCvMetadataSubmit(driveFileId, file) {
  const token = getToken();
  if (!token) { showScreen('screen-token-invalid'); return; }

  const requestId = generateRequestId();
  try {
    const data = await apiUploadCvMetadata({
      token,
      driveFileId,
      fileName:      file.name,
      fileType:      file.type,
      fileSizeBytes: file.size,
    }, requestId);

    const updated = Object.assign({}, getParticipant(), {
      currentStage: data.currentStage || 'cv_parsing',
      cvStatus:     'uploaded',
    });
    setParticipant(updated);
    showStatus('cv-status', 'CV uploaded successfully. Our team will be in touch.', 'success');
    setTimeout(() => routeToStage(updated.currentStage, updated), 1500);
  } catch (err) {
    showStatus('cv-status', apiErrorMessage(err), 'error');
  } finally {
    setSubmitting('cv-submit', false);
  }
}

// CV skip — participant defers CV
async function handleCvSkip() {
  const token = getToken();
  if (!token) return;
  const updated = Object.assign({}, getParticipant(), { cvStatus: 'deferred' });
  setParticipant(updated);
  routeToStage('cv_upload', updated);
}

// ─── GOOGLE DRIVE ACCESS TOKEN ────────────────────────────────────────────────

async function getDriveAccessToken() {
  // Uses Google Identity Services (GIS) token client.
  // If already authenticated return the cached token.
  if (window._driveAccessToken && window._driveTokenExpiry > Date.now()) {
    return window._driveAccessToken;
  }
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new ApiError('INTEGRATION_ERROR', 'Google sign-in is not available. Please reload the page.'));
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: (typeof GOOGLE_CLIENT_ID !== 'undefined' && GOOGLE_CLIENT_ID) || (document.querySelector('meta[name="google-client-id"]') || {}).content || '',
      scope:     'https://www.googleapis.com/auth/drive.file',
      callback:  resp => {
        if (resp.error) { reject(new ApiError('INTEGRATION_ERROR', 'Google sign-in failed: ' + resp.error)); return; }
        window._driveAccessToken  = resp.access_token;
        window._driveTokenExpiry  = Date.now() + (resp.expires_in || 3600) * 1000;
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

// ─── WITHDRAWAL ───────────────────────────────────────────────────────────────

async function handleWithdraw() {
  if (!confirm('Are you sure you want to withdraw your consent? This cannot be undone.')) return;
  const token = getToken();
  const participant = getParticipant();
  if (!token || !participant?.participantId) { showScreen('screen-token-invalid'); return; }

  try {
    await apiWithdrawConsent({ token, participantId: participant.participantId });
    clearToken();
    clearParticipant();
    showScreen('screen-withdrawn');
  } catch (err) {
    alert(apiErrorMessage(err));
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function setSubmitting(buttonId, busy) {
  const btn = $(buttonId);
  if (!btn) return;
  btn.disabled = busy;
  const label  = btn.dataset.label || btn.textContent;
  if (busy) { btn.dataset.label = label; btn.textContent = 'Please wait…'; }
  else      { btn.textContent = btn.dataset.label || label; }
}

// ─── CASCADING DROPDOWNS ─────────────────────────────────────────────────────

function onRegionChange(selectId) {
  const region = $(selectId || 'pi-region')?.value || '';
  populateDistricts(region, 'pi-district');
  setValue('pi-district', '');
}

function onSectorChange(selectId) {
  const sector = $(selectId || 'pi-sector')?.value || '';
  populateIndustries(sector, 'pi-industry');
  setValue('pi-industry', '');
  setValue('pi-jobRole', '');
}

function onIndustryChange(selectId) {
  const sector   = $('pi-sector')?.value   || '';
  const industry = $(selectId || 'pi-industry')?.value || '';
  populateJobRoles(sector, industry, 'pi-jobRole');
  setValue('pi-jobRole', '');
}

// Adapts the Sector & Job section to employment status: employed/trainee answer
// about CURRENT work (+ occupation field); unemployed/student answer about the
// work they WANT (occupation hidden). Falls back to neutral labels when unset.
function onEmploymentStatusChange() {
  const status = ($('pi-employmentStatus')?.value || '').trim();

  const MODES = {
    'Employed full-time': 'current',
    'Employed part-time': 'current',
    'Self-employed':      'current',
    'Apprentice / Trainee': 'trade',
    'Unemployed':         'interest',
    'Student':            'interest',
  };
  const mode = MODES[status] || 'neutral';

  const CFG = {
    current:  { title: 'Your Current Work',     hint: 'Tell us about the work you currently do.',
                sector: 'Sector you work in', industry: 'Industry', role: 'Your role / job',
                occ: true, occLabel: 'Job title / occupation' },
    trade:    { title: 'Your Trade & Work',     hint: 'Tell us about your trade or the work you are training in.',
                sector: 'Sector of your trade', industry: 'Industry', role: 'Trade / role',
                occ: true, occLabel: 'Current trade / occupation' },
    interest: { title: 'Work Interest',         hint: (status === 'Student' ? 'Tell us the kind of work you would like after your studies.' : 'Tell us the kind of work you are looking for.'),
                sector: 'Sector you want to work in', industry: 'Industry of interest', role: 'Role you are seeking',
                occ: false, occLabel: '' },
    neutral:  { title: 'Sector & Job Interest', hint: '',
                sector: 'Sector', industry: 'Industry', role: 'Job Role', occ: false, occLabel: '' },
  };
  const c = CFG[mode];

  setText('pi-sector-section-title', c.title);
  setText('pi-sector-label',   c.sector);
  setText('pi-industry-label', c.industry);
  setText('pi-jobRole-label',  c.role);

  const hint = $('pi-sector-hint');
  if (hint) { hint.textContent = c.hint; toggle('pi-sector-hint', !!c.hint); }

  toggle('pi-occupation-group', c.occ);
  if (c.occ && c.occLabel) setText('pi-currentOccupation-label', c.occLabel);
}

// ─── ONLINE/OFFLINE BANNER ───────────────────────────────────────────────────

function updateOnlineBanner() {
  toggle('banner-offline', !isOnline());
  if (isOnline()) hide('banner-online');
}

// "Back online" flashes only on an actual reconnect, then auto-hides.
window.addEventListener('online', () => {
  hide('banner-offline');
  show('banner-online');
  setTimeout(() => hide('banner-online'), 4000);
});
window.addEventListener('offline', updateOnlineBanner);

// ─── INITIALIZATION ───────────────────────────────────────────────────────────

async function initApp() {
  updateOnlineBanner();
  populateRegions('pi-region');
  populateSectors('pi-sector');
  onEmploymentStatusChange(); // set initial Sector/Job section state

  // Attach submit handlers
  $('consent-form')?.addEventListener('submit', handleConsentSubmit);
  $('pi-form')?.addEventListener('submit', handleParticipantInfoSubmit);
  $('cb-form')?.addEventListener('submit', handleCapacityBuildingSubmit);

  // Cascading dropdowns
  $('pi-region')?.addEventListener('change',   () => onRegionChange('pi-region'));
  $('pi-sector')?.addEventListener('change',   () => onSectorChange('pi-sector'));
  $('pi-industry')?.addEventListener('change', () => onIndustryChange('pi-industry'));

  // CV file input
  $('cv-file-input')?.addEventListener('change', handleCvFileSelected);
  $('cv-skip-btn')?.addEventListener('click', handleCvSkip);

  // Signature canvas
  initSignatureCanvas();

  // Withdraw button
  $('withdraw-btn')?.addEventListener('click', handleWithdraw);

  // Try to flush any offline submissions
  if (isOnline()) {
    const flushed = await flushOfflineQueue().catch(() => 0);
    if (flushed > 0) showStatus('global-status', flushed + ' pending submission(s) synced.', 'success');
  }

  // Token flow
  const urlToken = extractTokenFromUrl();
  if (urlToken) {
    setToken(urlToken);
    await resolveTokenAndRoute(urlToken);
    return;
  }

  // Existing session
  const stored = getToken();
  if (stored) {
    await resolveTokenAndRoute(stored);
    return;
  }

  // No token — show entry/consent choice
  showScreen('screen-entry');
}

async function resolveTokenAndRoute(token) {
  showStatus('global-status', 'Loading your profile…', 'info');
  try {
    const data = await apiGetParticipantByToken(token);
    // Backend returns { participant: { participantId, currentStage, allowedActions, profile } }.
    // Flatten profile into a single participant object for the screen prefill helpers.
    const wrap        = data.participant || {};
    const participant = Object.assign({}, wrap.profile || {}, {
      participantId:  wrap.participantId,
      currentStage:   wrap.currentStage,
      allowedActions: wrap.allowedActions || [],
    });
    setParticipant(participant);
    showStatus('global-status', '', '');
    routeToStage(participant.currentStage || 'participant_information', participant);
  } catch (err) {
    clearToken();
    clearParticipant();
    if (err.code === 'TOKEN_INVALID') {
      showScreen('screen-token-invalid');
    } else {
      showStatus('global-status', apiErrorMessage(err), 'error');
      showScreen('screen-entry');
    }
  }
}

document.addEventListener('DOMContentLoaded', initApp);
