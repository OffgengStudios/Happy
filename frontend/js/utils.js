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
    'Crop Farming': ['Farm Manager','Agronomist','Soil Scientist','Irrigation Specialist','Plant Breeder','Crop Scout','Seed Technologist','Horticulturalist','Agricultural Engineer','Farm Laborer','Tractor Operator','Irrigation Technician','Storekeeper','Driver','Gardener','Farm Administrator','Other'],
    'Livestock & Poultry': ['Ranch Manager','Veterinary Surgeon','Animal Nutritionist','AI Technician','Animal Health Inspector','Herdsman','Poultry Attendant','Piggery Attendant','Milker','Feed Mill Operator','Livestock Hauler','Farm Hand','Other'],
    'Aquaculture & Fisheries': ['Fish Farm Manager','Aquaculturist','Water Quality Technician','Fish Pathologist','Pond Attendant','Cage Technician','Net Repairer','Fish Feeder','Fishmonger','Boat Crew','Other'],
    'Forestry & Agroforestry': ['Forest Manager','Forester','Forest Ranger','Silviculturist','Arborist','Chainsaw Operator','Tree Nursery Attendant','Tree Climber','Logging Truck Driver','Other'],
    'Agro-Processing': ['Processing Plant Manager','Food Technologist','Quality Control Officer','Mill Operator','Cassava/Gari Processor','Oil Press Operator','Packaging Hand','Machine Operator','Cold Storage Technician','Other'],
    'Agribusiness & Trade': ['Agribusiness Manager','Commodity Buyer','Produce Aggregator','Market Trader','Input Dealer (seeds/agrochemicals)','Sales Agent','Warehouse Keeper','Logistics Coordinator','Other'],
    'Agricultural Services': ['Extension Officer','Mechanization Service Provider','Spraying Service Operator','Veterinary Service Provider','Agro-Equipment Technician','Cooperative Coordinator','Other'],
  },
  'Non-Agriculture': {
    'Mining & Extractive': ['Mine Manager','Geologist','Mine Surveyor','Metallurgist','Heavy Equipment Operator','Drill Rig Operator','Crusher Operator','Maintenance Mechanic','Small-scale Miner','Security Guard','Other'],
    'Energy & Utilities': ['Energy Manager','Electrical Engineer','Solar Installer','Power Line Technician','Water Treatment Operator','Meter Reader','Plant Technician','Other'],
    'Manufacturing': ['Factory Manager','Production Supervisor','QA/QC Officer','Product Developer','Machine Engineer','Machine Operator','Welder/Fabricator','Packaging Hand','Warehouse Loader','Other'],
    'Construction & Built Environment': ['Project Manager','Site Manager','Civil Engineer','Quantity Surveyor','Architect','Land Surveyor','Safety Officer','Mason/Bricklayer','Carpenter','Electrician','Plumber','Steel Bender','Tiler','Painter','Crane Operator','Other'],
    'ICT & Digital': ['IT Manager','Software Developer','Mobile App Developer','UI/UX Designer','Data Analyst','Cybersecurity Officer','Network Engineer','Systems Administrator','IT Support/Helpdesk','Hardware Technician','Graphic Designer','Social Media Manager','Data Entry Clerk','Other'],
    'Telecommunications': ['Telecom Engineer','Network Technician','Field Maintenance Technician','Call Centre Agent','Mobile Money Agent','Sales Representative','Other'],
    'Financial Services': ['Branch Manager','Credit/Loan Officer','Credit Analyst','Relationship Manager','Risk Officer','Bank Teller','Mobile Money Coordinator','Microfinance Officer','Insurance Agent','Cashier','Other'],
    'Professional Services': ['Accountant','Auditor','Lawyer','Legal Assistant','Management Consultant','HR Officer','Administrative Assistant','Procurement Officer','Secretary/Receptionist','Other'],
    'Healthcare': ['Hospital Administrator','Medical Doctor','Registered Nurse','Midwife','Pharmacist','Pharmacy Technician','Lab Scientist','Radiographer','Physiotherapist','Community Health Worker','Ward Assistant','Other'],
    'Education & Training': ['Head Teacher','Teacher','Lecturer','Tutor','Curriculum Developer','Vocational Instructor','Teaching Assistant','Librarian','School Administrator','Other'],
    'Hospitality & Tourism': ['Hotel Manager','Front Office Manager','Chef/Cook','F&B Supervisor','Event Planner','Tour Guide','Front Desk Officer','Room Attendant','Waiter/Waitress','Bartender','Other'],
    'Food Service & Catering': ['Catering Manager','Chef','Cook','Baker','Pastry Chef','Caterer','Kitchen Assistant','Food Vendor','Server','Other'],
    'Retail & Trade': ['Store Manager','Floor Supervisor','Merchandiser','Buyer','E-commerce Specialist','Sales Associate','Shopkeeper','Cashier','Shelf Stocker','Market Trader','Other'],
    'Logistics & Transport': ['Fleet Manager','Warehouse Manager','Supply Chain Officer','Logistics Analyst','Customs Broker','Freight Forwarder','Truck/HGV Driver','Taxi/Ride-hail Driver','Dispatch Rider','Forklift Operator','Courier','Loader','Dispatcher','Other'],
    'Automotive & Repairs': ['Workshop Manager','Auto Mechanic','Auto Electrician','Panel Beater','Vulcanizer','Spray Painter','Motorcycle Mechanic','Electronics Repair Technician','Other'],
    'Creative Arts & Media': ['Creative Director','Journalist','Content Creator','Photographer','Videographer','Video Editor','Animator','Musician','Actor/Performer','Radio/TV Presenter','Graphic Artist','Other'],
    'Fashion & Textiles': ['Fashion Designer','Tailor/Seamstress','Pattern Maker','Textile Printer','Shoemaker','Bead/Craft Maker','Boutique Operator','Other'],
    'Beauty & Wellness': ['Salon Manager','Hairdresser','Barber','Beautician/Make-up Artist','Nail Technician','Spa Therapist','Cosmetologist','Other'],
    'Real Estate & Property': ['Real Estate Manager','Estate Agent','Property Valuer','Facilities Manager','Caretaker','Leasing Officer','Other'],
    'Security Services': ['Security Manager','Security Supervisor','Security Guard','Loss Prevention Officer','CCTV Operator','Other'],
    'Public Sector & Governance': ['Civil Servant','Administrative Officer','Local Government Officer','Records Officer','Policy Analyst','Community Development Officer','Other'],
    'NGO & Development': ['Programme Manager','Project Officer','M&E Officer','Field Coordinator','Community Mobilizer','Social Worker','Grants Officer','Other'],
    'Sports & Recreation': ['Sports Coach','Fitness Trainer','Referee/Official','Sports Administrator','Recreation Attendant','Other'],
    'Cleaning & Facility Services': ['Facilities Supervisor','Cleaner/Janitor','Sanitation Worker','Laundry Operator','Groundskeeper','Pest Control Technician','Other'],
    'Skilled Trades & Crafts': ['Welder','Fitter/Machinist','Mason','Carpenter','Electrician','Plumber','Tiler','Upholsterer','Blacksmith','Other'],
    'Other / Informal': ['Self-employed/Own Business','Petty Trader','Artisan','Apprentice','Casual Labourer','Household/Domestic Worker','Other'],
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
