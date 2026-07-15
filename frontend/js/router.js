// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTER — maps participant stage to visible UI sections
// ═══════════════════════════════════════════════════════════════════════════════

const SCREENS = [
  'screen-entry',
  'screen-lookup',
  'screen-consent',
  'screen-participant-info',
  'screen-capacity-building',
  'screen-cv-upload',
  'screen-awaiting',
  'screen-complete',
  'screen-withdrawn',
  'screen-token-invalid',
];

function showScreen(id) {
  SCREENS.forEach(s => hide(s));
  show(id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── ROUTE FROM STAGE ─────────────────────────────────────────────────────────

function routeToStage(stage, participant) {
  switch (stage) {
    case 'consent':
      showScreen('screen-consent');
      break;

    case 'participant_information':
      showScreen('screen-participant-info');
      prefillParticipantInfoScreen(participant);
      break;

    case 'capacity_building':
      showScreen('screen-capacity-building');
      prefillCapacityScreen(participant);
      break;

    case 'cv_upload':
      showScreen('screen-cv-upload');
      renderCvUploadStatus(participant);
      break;

    case 'cv_parsing':
      showScreen('screen-awaiting');
      setText('awaiting-message', 'Your CV is being reviewed. We will be in touch soon.');
      break;

    case 'job_matching':
    case 'job_placement':
    case 'outcome_tracking':
      showScreen('screen-awaiting');
      setText('awaiting-message', 'Your profile is complete. Our team will contact you about next steps.');
      break;

    case 'completed':
      showScreen('screen-complete');
      renderCompleteScreen(participant);
      break;

    case 'withdrawn':
      showScreen('screen-withdrawn');
      break;

    case 'archived':
      showScreen('screen-awaiting');
      setText('awaiting-message', 'This record is no longer active. Please contact your field officer.');
      break;

    default:
      showScreen('screen-entry');
  }
}

// ─── PREFILL HELPERS ─────────────────────────────────────────────────────────

function prefillParticipantInfoScreen(p) {
  if (!p) return;
  // Consent captures "First [Other…] Surname" as one field.
  const nameTokens = (p.consentName || '').trim().split(/\s+/).filter(Boolean);
  const fields = {
    'pi-surname':          p.surname      || (nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : ''),
    'pi-firstName':        p.firstName    || (nameTokens[0] || ''),
    'pi-otherNames':       p.otherNames   || nameTokens.slice(1, -1).join(' '),
    'pi-telephone':        p.telephone    || p.consentPhone || '',
    'pi-email':            p.email        || p.consentEmail || '',
    'pi-dob':              p.dob          || '',
    'pi-sex':              p.sex          || '',
    'pi-educationLevel':   p.educationLevel  || '',
    'pi-employmentStatus': p.employmentStatus || '',
    'pi-currentOccupation': p.currentOccupation || '',
    'pi-community':          p.community          || '',
    'pi-locationStatus':     p.locationStatus     || '',
    'pi-monthlyIncome':      p.monthlyIncome      || '',
    'pi-incomeFrequency':    p.incomeFrequency    || '',
    'pi-workCommunity':      p.workCommunity      || '',
    'pi-workLocationStatus': p.workLocationStatus || '',
    'pi-displacementStatus': p.displacementStatus || '',
    'pi-nationality':        p.nationality        || '',
    'pi-refugeeStatus':      p.refugeeStatus      || '',
    'pi-disabilityStatus':   p.disabilityStatus   || '',
    'pi-disabilitySpecify':  p.disabilitySpecify  || '',
  };
  Object.entries(fields).forEach(([id, val]) => setValue(id, val));

  // Cascading region → district
  if (p.region) {
    setValue('pi-region', p.region);
    populateDistricts(p.region, 'pi-district');
    if (p.district) setValue('pi-district', p.district);
  }
  if (p.workRegion) {
    setValue('pi-workRegion', p.workRegion);
    populateDistricts(p.workRegion, 'pi-workDistrict');
    if (p.workDistrict) setValue('pi-workDistrict', p.workDistrict);
  }
  if (typeof onRefugeeChange === 'function') onRefugeeChange();

  // Cascading sector → industry → jobRole
  if (p.sector) {
    setValue('pi-sector', p.sector);
    populateIndustries(p.sector, 'pi-industry');
    if (p.industry) {
      setValue('pi-industry', p.industry);
      populateJobRoles(p.sector, p.industry, 'pi-jobRole');
      if (p.jobRole) setValue('pi-jobRole', p.jobRole);
    }
  }

  // Show participant ID
  if (p.participantId) setText('pi-participant-id', p.participantId);

  // Adapt the Sector & Job section to the (possibly pre-filled) employment status.
  if (typeof onEmploymentStatusChange === 'function') onEmploymentStatusChange();
}

function prefillCapacityScreen(p) {
  if (!p) return;
  const fields = {
    'cb-trainedByPartner': p.trainedByPartner || '',
    'cb-trainingStartDate': p.trainingStartDate || '',
    'cb-trainingEndDate':  p.trainingEndDate   || '',
    'cb-trainingLocation': p.trainingLocation  || '',
    'cb-trainingMode':     p.trainingMode       || '',
    'cb-trainerType':      p.trainerType        || '',
    'cb-trainingPartner':  p.trainingPartner    || '',
    'cb-completionStatus': p.completionStatus   || '',
    'cb-certificateIssued': p.certificateIssued || '',
    'cb-digitalSkills':    p.digitalSkills      || '',
  };
  Object.entries(fields).forEach(([id, val]) => setValue(id, val));
}

function renderCvUploadStatus(p) {
  if (!p) return;
  const status = p.cvStatus || 'not_started';
  const msgEl  = $('cv-status-message');
  if (!msgEl) return;
  const messages = {
    'not_started': 'Upload your CV to help us match you with the right opportunities.',
    'deferred':    'You have indicated you will provide your CV later. You can upload it here when ready.',
    'uploaded':    'Your CV has been received and is being processed.',
    'parsed':      'Your CV has been successfully reviewed.',
    'failed':      'There was a problem processing your CV. Please try uploading again.',
  };
  msgEl.textContent = messages[status] || messages.not_started;
  toggle('cv-already-uploaded', ['uploaded', 'parsed', 'reviewed'].includes(status));
  toggle('cv-upload-form', !['uploaded'].includes(status));
}

function renderCompleteScreen(p) {
  if (!p) return;
  const name = [p.firstName, p.surname].filter(Boolean).join(' ') || p.consentName || '';
  if (name) setText('complete-name', name);
  if (p.participantId) setText('complete-participant-id', p.participantId);
}
