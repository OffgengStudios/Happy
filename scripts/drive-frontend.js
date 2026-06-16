// scripts/drive-frontend.js — drives the locally served frontend against the
// deployed Apps Script backend and saves screenshots to scripts/screenshots/.
'use strict';

const path = require('path');
const fs = require('fs');

(async () => {
  const { chromium } = require('playwright');

  const outDir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });

  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  console.log('1. Loading http://localhost:8123 …');
  await page.goto('http://localhost:8123', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, '01-entry.png') });

  console.log('2. Clicking "New participant" …');
  await page.click('text=New participant');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '02-consent.png'), fullPage: true });

  console.log('3. Filling consent form …');
  const phone = '024' + Math.floor(1000000 + Math.random() * 9000000);
  const fill = async (sel, val) => {
    if (await page.locator(sel).count()) await page.fill(sel, val);
    else console.log(`   (no element ${sel})`);
  };
  await fill('#consent-name', 'Ama Serwaa Test');
  await fill('#consent-phone', phone);
  await fill('#consent-email', `ama.${Date.now()}@happykollekt.test`);
  await fill('#consent-venue', 'Accra Local Test');

  await page.check('#consent-accepted');

  // Draw a signature stroke on the canvas if present
  const sig = page.locator('canvas#consent-sig');
  if (await sig.count()) {
    await sig.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await sig.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 30, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 60, { steps: 12 });
      await page.mouse.move(box.x + 300, box.y + 100, { steps: 12 });
      await page.mouse.up();
    }
  }
  // Verify the signature actually drew ink (non-blank pixels on the canvas)
  const inkPixels = await page.evaluate(() => {
    const c = document.getElementById('consent-sig');
    if (!c || !c.width) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  console.log(`   Signature ink pixels: ${inkPixels}`);
  if (inkPixels <= 0) throw new Error('Signature canvas is blank — drawing did not register');
  await page.screenshot({ path: path.join(outDir, '03-consent-filled.png'), fullPage: true });

  console.log('4. Submitting consent (phone ' + phone + ') …');
  page.on('response', r => {
    if (r.url().includes('script.google')) logs.push(`[net] ${r.status()} ${r.url().slice(0, 80)}`);
  });
  await page.click('#consent-submit');

  // Wait until the status leaves "Submitting…" (Apps Script + Drive can be slow)
  try {
    await page.waitForFunction(() => {
      const screen = document.getElementById('screen-consent');
      const el = document.getElementById('consent-status');
      const t = el ? el.textContent.trim() : '';
      return (screen && screen.classList.contains('hidden')) || (t && t !== 'Submitting…');
    }, { timeout: 90000 });
  } catch { console.log('   (no consent transition within 90s)'); }
  await page.screenshot({ path: path.join(outDir, '04-after-submit.png'), fullPage: true });

  const visibleAfterConsent = await page.$$eval('section[id^=screen-]', els =>
    els.filter(e => !e.classList.contains('hidden')).map(e => e.id));
  console.log('   Visible screen after consent:', visibleAfterConsent);

  if (visibleAfterConsent.includes('screen-participant-info')) {
    console.log('5. Filling participant information …');
    await page.selectOption('#pi-sex', { index: 1 });
    await fill('#pi-dob', '2002-03-14');
    await page.selectOption('#pi-region', 'Greater Accra');
    await page.waitForTimeout(300);
    await page.selectOption('#pi-district', 'Accra Metropolitan');
    await page.selectOption('#pi-educationLevel', { index: 1 });
    await page.selectOption('#pi-employmentStatus', { index: 1 });
    await page.screenshot({ path: path.join(outDir, '05-pi-filled.png'), fullPage: true });

    console.log('6. Saving participant information …');
    await page.click('#pi-submit');
    await page.waitForFunction(() => {
      const pi = document.getElementById('screen-participant-info');
      const st = document.getElementById('pi-status');
      return (pi && pi.classList.contains('hidden')) ||
             (st && st.textContent.trim() && st.textContent.trim() !== 'Saving…');
    }, { timeout: 90000 }).catch(() => console.log('   (no transition within 90s)'));
    await page.screenshot({ path: path.join(outDir, '06-after-pi-save.png'), fullPage: true });
  }

  const visible = await page.$$eval('section[id^=screen-]', els =>
    els.filter(e => !e.classList.contains('hidden')).map(e => e.id));
  console.log('\nFinal visible screen:', visible);
  const piStatus = await page.locator('#pi-status').textContent().catch(() => '');
  if (piStatus && piStatus.trim()) console.log('pi-status:', piStatus.trim());

  console.log('\nBrowser console:');
  for (const l of logs.slice(-15)) console.log('  ' + l);

  await browser.close();
  console.log('\nScreenshots written to scripts/screenshots/');
})().catch(e => { console.error('DRIVER FAILED:', e.message); process.exit(1); });
