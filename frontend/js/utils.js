// ═══════════════════════════════════════════════════════════════════════════════
//  UTILS — constants, validators, formatters
// ═══════════════════════════════════════════════════════════════════════════════

const GH_REGIONS = {
  'Greater Accra': ['Accra Metropolitan','Tema','Adenta','Ashaiman','Ga East','Ga West','Ga South','Ga Central','La Dade-Kotopon','Ledzokuku','Krowor','Ayawaso West','Ayawaso East','Ayawaso North','Okaikwei North','Ablekuma North','Ablekuma Central','Ablekuma West','Korle Klottey','Ningo-Prampram','Shai-Osudoku','Ada East','Ada West','Weija-Gbawe','Kpone-Katamanso'],
  'Ashanti': ['Kumasi Metropolitan','Obuasi Municipal','Ejisu','Bekwai','Mampong','Agona','Asokore Mampong','Suame','Bantama','Subin','Oforikrom','Old Tafo','Kwadaso','Nhyiaeso','Atwima Kwanwoma','Atwima Nwabiagya','Afigya Kwabre North','Afigya Kwabre South','Asante Akim Central','Asante Akim North','Asante Akim South','Bosome Freho','Bosomtwe','Ejura Sekyedumase','Juaben','Kwabre East','Offinso Municipal','Offinso North','Sekyere Central','Sekyere East','Sekyere South','Adansi North','Adansi South','Amansie Central','Amansie West'],
  'Eastern': ['Koforidua','Akropong','Nkawkaw','Mpraeso','Aburi','Kibi','Akim Oda','Asamankese','Somanya','Kade','Begoro','Donkorkrom','Akim Swedru','Asuogyaman','Atiwa East','Atiwa West','Ayensuano','Birim Central','Birim North','Birim South','Denkyembour','Fanteakwa North','Fanteakwa South','Kwaebibirem','Lower Manya Krobo','New Juaben North','New Juaben South','Nsawam Adoagyiri','Suhum','Upper Manya Krobo','Upper West Akim','Yilo Krobo'],
  'Volta': ['Ho','Keta','Hohoe','Kpando','Aflao','Sogakope','Adaklu','Afadzato South','Agotime-Ziope','Akatsi North','Akatsi South','Anloga','Central Tongu','Ho West','Ketu North','Ketu South','North Dayi','North Tongu','South Dayi','South Tongu'],
  'Northern': ['Tamale','Yendi','Savelugu','Tolon','Kumbungu','Nanton','Gushegu','Karaga','Saboba','Zabzugu','Tatale-Sanguli','Mion','Nanumba North','Nanumba South','Kpandai'],
  'North East': ['Nalerigu','Walewale','Gambaga','Bunkpurugu','Yunyoo','Chereponi'],
  'Upper West': ['Wa','Lawra','Nadowli','Jirapa','Lambussie','Nandom','Sissala East','Sissala West','Wa East','Wa West','Daffiama-Bussie-Issa'],
  'Upper East': ['Bolgatanga','Bawku','Navrongo','Zebilla','Paga','Binduri','Bongo','Builsa North','Builsa South','Garu','Kassena-Nankana East','Kassena-Nankana West','Nabdam','Pusiga','Talensi','Tempane'],
  'Oti': ['Dambai','Jasikan','Kadjebi','Krachi','Nkwanta','Biakoye','Guan','Krachi East','Krachi Nchumuru','Krachi West','Nkwanta North','Nkwanta South'],
  'Bono': ['Sunyani','Berekum','Dormaa','Wenchi','Techiman','Nkoranza','Kintampo','Atebubu','Sene','Pru','Tain','Banda','Jaman North','Jaman South','Berekum East','Berekum West','Dormaa Central','Dormaa East','Dormaa West'],
  'Bono East': ['Techiman Municipal','Techiman North','Nkoranza North','Nkoranza South','Kintampo North','Kintampo South','Atebubu-Amantin','Pru East','Pru West','Sene East','Sene West'],
  'Ahafo': ['Goaso','Bechem','Duayaw Nkwanta','Hwidiem','Kenyasi','Mim','Asunafo North','Asunafo South','Asutifi North','Asutifi South','Tano North','Tano South'],
  'Savannah': ['Damongo','Bole','Sawla','Salaga','Buipe','Daboya','Central Gonja','East Gonja','North East Gonja','North Gonja','West Gonja','Sawla-Tuna-Kalba'],
  'Western': ['Sekondi-Takoradi','Tarkwa','Prestea','Bogoso','Axim','Elubo','Half Assini','Ahanta West','Effia-Kwesimintsim','Ellembelle','Jomoro','Mpohor','Nzema East','Prestea-Huni Valley','Shama','Tarkwa-Nsuaem','Wassa Amenfi Central','Wassa Amenfi East','Wassa Amenfi West','Wassa East'],
  'Western North': ['Sefwi Wiawso','Bibiani','Juaboso','Bodi','Aowin','Bia East','Bia West','Bibiani-Anhwiaso-Bekwai','Sefwi Akontombra','Suaman'],
  'Central': ['Cape Coast','Winneba','Kasoa','Swedru','Dunkwa','Elmina','Moree','Abura-Asebu-Kwamankese','Agona East','Agona West','Ajumako-Enyan-Essiam','Asikuma-Odoben-Brakwa','Assin Central','Assin North','Assin South','Awutu Senya','Awutu Senya East','Effutu','Ekumfi','Gomoa Central','Gomoa East','Gomoa West','Komenda-Edina-Eguafo-Abrem','Mfantsiman','Twifo-Atti Morkwa','Upper Denkyira East','Upper Denkyira West'],
};

const SECTOR_DATA = {
  'Agriculture': {
    'Crop Farming': ['Farm Manager','Agronomist','Soil Scientist','Irrigation Specialist','Plant Breeder','Crop Scout','Seed Technologist','Precision Ag Specialist','Agricultural Engineer','Horticulturalist','Farm Laborer','Tractor Operator','Irrigation Technician','Storekeeper','Driver','Security Guard','Gardener','Accountant','Farm Administrator','Purchasing Agent','Sales Rep','Inventory Clerk','HR Officer'],
    'Livestock': ['Ranch Manager','Veterinary Surgeon','Animal Nutritionist','AI Technician','Livestock Geneticist','Animal Health Inspector','Herdsman','Poultry Attendant','Milker','Stable Hand','Feed Mill Operator','Livestock Hauler','Security Guard','Accountant','Procurement Officer','HR Coordinator'],
    'Aquaculture': ['Fish Farm Manager','Marine Biologist','Aquaculturist','Water Quality Technician','Fish Pathologist','Pond Attendant','Cage Technician','Net Repairer','Fish Feeder','Trawler Deckhand','Security Guard','Office Cleaner','Accountant','Exports Officer','HR Generalist'],
    'Forestry': ['Forest Manager','Forester','Forest Ranger','Silviculturist','Timber Cruiser','Log Grader','Arborist','Chainsaw Operator','Skidder Operator','Tree Climber','Logging Truck Driver','Security Guard','Accountant','HR Officer'],
  },
  'Non-Agriculture': {
    'Mining & Extractive': ['Mine Manager','Petroleum Engineer','Reservoir Engineer','Drilling Engineer','Geologist','Geophysicist','Metallurgist','Mine Surveyor','Roustabout','Roughneck','Heavy Equipment Operator','Drill Rig Operator','Crusher Operator','Maintenance Mechanic','Security Guard','Accountant','Procurement Manager','HR Business Partner','Logistics Coordinator'],
    'Manufacturing': ['Factory Manager','Production Manager','QA Manager','Food Technologist','Product Developer','Lab Technician','QC Inspector','Machine Engineer','Machine Operator','Packaging Hand','Warehouse Loader','Delivery Driver','Sanitation Worker','Accountant','Purchasing Officer','HR Officer'],
    'Construction': ['Project Manager','Site Manager','Civil Engineer','Structural Engineer','Quantity Surveyor','Architect','Land Surveyor','Safety Officer','Bricklayer','Carpenter','Electrician','Plumber','Crane Operator','Scaffolder','Painter','Tipper Driver','Site Security','Construction Accountant','HR Manager'],
    'ICT & Digital': ['CTO','IT Project Manager','Product Manager','Software Engineer','Full-stack Developer','Mobile Developer','UI/UX Designer','Data Scientist','Cybersecurity Specialist','Cloud Architect','Systems Admin','Network Engineer','IT Helpdesk','Hardware Repairer','Data Entry','Office Cleaner','IT Accountant','Digital Marketing Manager','IT Recruiter'],
    'Financial Services': ['Branch Manager','Operations Manager','Credit Manager','Loan Officer','Credit Analyst','Relationship Manager','Risk Officer','Mobile Money Coordinator','Bank Teller','Cashier','Armed Security','Office Cleaner','Accountant','Data Entry Clerk','HR Officer','Customer Service Executive'],
    'Healthcare': ['Hospital Administrator','Medical Director','Nursing Superintendent','Medical Doctor','Registered Nurse','Pharmacist','Lab Scientist','Radiographer','Physiotherapist','Ward Assistant','Pharmacy Technician','Ambulance Driver','Hospital Security','Sanitation Officer','Medical Accountant','Records Officer','HR Manager'],
    'Education': ['Principal','Registrar','Dean','Director of Studies','Teacher','Lecturer','Curriculum Developer','Educational Psychologist','Librarian','Lab Technician','Teaching Assistant','School Nurse','Bus Driver','Security Guard','Janitor','School Accountant','Admissions Officer','HR Manager'],
    'Hospitality & Tourism': ['Hotel GM','Front Office Manager','Executive Housekeeper','F&B Manager','Event Planner','Revenue Manager','Maintenance Engineer','Front Desk','Bellhop','Room Attendant','Laundry Worker','Security','Gardener','Shuttle Driver','Hotel Accountant','HR Manager'],
    'Retail & Trade': ['Store Manager','Floor Manager','Merchandise Manager','Branch Manager','Visual Merchandiser','Buyer','Loss Prevention','E-commerce Specialist','Sales Associate','Cashier','Shelf Stocker','Warehouse Picker','Delivery Driver','Security Guard','Store Cleaner','Retail Accountant','Inventory Manager','HR Coordinator'],
    'Logistics & Transport': ['Fleet Manager','Logistics Director','Warehouse Manager','Supply Chain Manager','Port Manager','Logistics Analyst','Customs Broker','Freight Forwarder','HGV Driver','Forklift Operator','Courier','Loader','Fleet Mechanic','Warehouse Security','Logistics Accountant','Documentation Specialist','Dispatcher'],
  },
};

// ─── REQUEST ID ───────────────────────────────────────────────────────────────

function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── VALIDATORS ───────────────────────────────────────────────────────────────

function validatePhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length === 10 && d.startsWith('0') || d.length === 12 && d.startsWith('233') || d.length === 9;
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateGhanaCard(value) {
  return /^GHA-\d{9}-\d$/i.test(String(value || '').trim());
}

function isYouthAge(dob) {
  if (!dob) return false;
  const birthDate = new Date(dob);
  const today     = new Date();
  const age       = today.getFullYear() - birthDate.getFullYear() -
    (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
  return age >= 15 && age <= 35;
}

// ─── FORMATTERS ───────────────────────────────────────────────────────────────

function formatPhoneDisplay(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('233')) return '0' + d.slice(3);
  if (d.length === 10 && d.startsWith('0'))   return d;
  if (d.length === 9)                          return '0' + d;
  return value;
}

function toTitleCase(str) {
  return String(str || '').trim().toLowerCase()
    .replace(/\b([a-z])/g, c => c.toUpperCase());
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function truncate(str, max) {
  return String(str || '').length > max ? String(str).slice(0, max - 1) + '…' : String(str || '');
}

// ─── DOM HELPERS ─────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function show(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
function hide(id) { const el = $(id); if (el) el.classList.add('hidden'); }
function toggle(id, condition) { condition ? show(id) : hide(id); }

function setHtml(id, html)  { const el = $(id); if (el) el.innerHTML  = html; }
function setText(id, text)  { const el = $(id); if (el) el.textContent = text; }
function setValue(id, val)  { const el = $(id); if (el) el.value       = val; }

function showStatus(id, message, type) {
  const el = $(id);
  if (!el) return;
  if (!message) { el.className = 'status-msg hidden'; el.textContent = ''; return; }
  el.className  = 'status-msg status-' + (type || 'info');
  el.textContent = message;
}

function populateSelect(selectId, options, placeholder) {
  const el = $(selectId);
  if (!el) return;
  el.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : '';
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = o.textContent = typeof opt === 'string' ? opt : opt.value;
    if (typeof opt !== 'string') o.textContent = opt.label;
    el.appendChild(o);
  });
}

// ─── REGION / DISTRICT ────────────────────────────────────────────────────────

function populateRegions(selectId) {
  populateSelect(selectId || 'region', Object.keys(GH_REGIONS), '— Select Region —');
}

function populateDistricts(region, selectId) {
  const districts = GH_REGIONS[region] || [];
  populateSelect(selectId || 'district', districts, '— Select District —');
}

// ─── SECTOR / INDUSTRY / ROLE ─────────────────────────────────────────────────

function populateSectors(selectId) {
  populateSelect(selectId || 'sector', Object.keys(SECTOR_DATA), '— Select Sector —');
}

function populateIndustries(sector, selectId) {
  const industries = sector ? Object.keys(SECTOR_DATA[sector] || {}) : [];
  populateSelect(selectId || 'industry', industries, '— Select Industry —');
}

function populateJobRoles(sector, industry, selectId) {
  const roles = (SECTOR_DATA[sector] || {})[industry] || [];
  populateSelect(selectId || 'jobRole', roles, '— Select Job Role —');
}

// ─── OFFLINE DETECTION ────────────────────────────────────────────────────────

function isOnline() { return navigator.onLine !== false; }
