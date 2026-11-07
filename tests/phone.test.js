// Deckseer on a phone: nothing scrolls sideways, a bottom bar for the pages, the playtest fits, the back camera,
// the flashlight, a buzz when a card is added. And on a PC none of that changes.
const fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const { check, APP } = require('./helpers');
const src = fs.readFileSync(path.join(__dirname, 'sim.test.js'), 'utf8');
const DECK_CODE = src.slice(src.indexOf('const c = ('), src.indexOf('module.exports'));

// a stand-in camera: a real video track from a canvas, that says it has a flashlight and faces backwards
const FAKE_CAM = () => {
  window._gum = []; window._torch = [];
  navigator.mediaDevices.getUserMedia = async constraints => {
    window._gum.push(constraints);
    const c = document.createElement('canvas'); c.width = 640; c.height = 480; c.getContext('2d').fillRect(0, 0, 640, 480);
    const st = c.captureStream(5), tr = st.getVideoTracks()[0];
    const facing = constraints.video && constraints.video.facingMode ? 'environment' : 'user';
    tr.getCapabilities = () => ({torch: true});
    tr.getSettings = () => ({deviceId: 'fake', facingMode: facing, width: 640, height: 480});
    tr.applyConstraints = async x => { window._torch.push(x); };
    return st;
  };
  navigator.mediaDevices.enumerateDevices = async () => [{kind: 'videoinput', deviceId: 'fake', label: 'Fake camera'}];
  window._buzz = []; navigator.vibrate = p => { window._buzz.push(p); return true; };
};

module.exports = async function () {
  console.log('Phone');
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7']));
  await ctx.route(/^https?:/, r => r.abort());
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(FAKE_CAM);
  await page.goto(APP); await page.waitForTimeout(400);
  await page.evaluate(code => { eval(code + '; window._d = deck(ASHLING_TEXT);'); localStorage.setItem('bsw-decks', JSON.stringify([window._d])); const p = JSON.parse(localStorage.getItem('bsw-prefs') || '{}'); p.deckView = window._d.id; p.seenIntro = true; localStorage.setItem('bsw-prefs', JSON.stringify(p)); }, DECK_CODE);
  await page.reload(); await page.waitForTimeout(500);

  // nothing pushes any page sideways
  const wide = [];
  const measure = async label => { const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 412) wide.push(`${label}: ${w}px`); };
  for (const pg of ['scanner', 'collection', 'search', 'game']) { await page.evaluate(pg => showPage(pg), pg); await page.waitForTimeout(150); await measure(pg); }
  await page.evaluate(() => { showPage('builder'); renderDeck(); });
  for (const t of ['cards', 'check', 'test', 'combos', 'export']) {
    await page.evaluate(t => document.querySelector(`[data-dtab="${t}"]`).click(), t); await page.waitForTimeout(200);
    if (t === 'check') for (const k of ['mana', 'bracket', 'price', 'upgrades']) { await page.evaluate(k => { const b = document.querySelector(`[data-dctab="${k}"]`); b && b.click(); }, k); await page.waitForTimeout(200); await measure('check/' + k); }
    else await measure(t);
  }
  check('no page scrolls sideways on a phone (the mana table scrolls inside itself)', wide.length === 0, wide);

  // the bottom bar
  const nav = await page.evaluate(() => { const n = document.querySelector('.pagetabs'), r = n.getBoundingClientRect(); return {fixed: getComputedStyle(n).position, bottom: Math.round(innerHeight - r.bottom), labels: [...n.querySelectorAll('button')].map(b => getComputedStyle(b, '::after').content.replace(/"/g, ''))}; });
  check('the pages are a bar at the bottom with short labels', nav.fixed === 'fixed' && nav.bottom <= 1 && nav.labels.join() === 'Scan,Cards,Decks,Search,Game', nav);
  await page.click('#pgColl'); check('tapping a page in the bar opens it', await page.evaluate(() => prefs.page === 'collection'));

  // playtest: the piles strip shows and the table starts below it
  await page.evaluate(() => { showPage('builder'); document.querySelector('[data-dtab="cards"]').click(); document.getElementById('deckPlay').click(); });
  await page.waitForTimeout(1000);
  const pt = await page.evaluate(() => { const l = document.querySelector('.pt-left').getBoundingClientRect(), bf = document.querySelector('.pt-bf').getBoundingClientRect(), cz = document.querySelector('.pt-cmdzone').getBoundingClientRect(); return {left: Math.round(l.height), gap: Math.round(bf.top - l.bottom), cz: Math.round(cz.height)}; });
  check('playtest: the command zone and library are visible, not covered by the table', pt.left > 120 && pt.left < 320 && pt.gap >= -1 && pt.cz < 300, pt);
  await page.evaluate(() => { const x = document.querySelector('[data-pt="close"], #ptClose, .pt-close'); if (x) x.click(); else document.getElementById('pt').hidden = true; });

  // the camera: back camera, flashlight, no screen light
  await page.evaluate(() => showPage('scanner'));
  await page.click('#startCam'); await page.waitForTimeout(600);
  const cam = await page.evaluate(() => ({asked: JSON.stringify(window._gum[0] && window._gum[0].video), torch: !document.getElementById('torchBtn').hidden, screenLight: !document.getElementById('screenLight').hidden}));
  check('a phone asks for the back camera', /environment/.test(cam.asked), cam);
  check('the 🔦 Flashlight button shows when the camera has one', cam.torch, cam);
  check('the screen light is hidden for the back camera (it faces away from the screen)', !cam.screenLight, cam);
  await page.click('#torchBtn'); await page.waitForTimeout(200);
  const t1 = await page.evaluate(() => ({calls: JSON.stringify(window._torch), pressed: document.getElementById('torchBtn').getAttribute('aria-pressed')}));
  check('tapping it turns the flashlight on', /"torch":true/.test(t1.calls) && t1.pressed === 'true', t1);
  await page.evaluate(() => { prefs.sound = true; sound('add'); });
  check('the phone buzzes when a card is added', await page.evaluate(() => window._buzz.length > 0));
  check('no page errors on the phone', errs.length === 0, errs);
  await browser.close();

  // the same on a PC: the top tabs, the front camera as before, no flashlight, no buzz
  const b2 = await chromium.launch(); const c2 = await b2.newContext({viewport: {width: 1280, height: 800}}); await c2.route(/^https?:/, r => r.abort());
  const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message)); await p2.addInitScript(FAKE_CAM);
  await p2.goto(APP); await p2.waitForTimeout(400);
  const pc = await p2.evaluate(() => ({fixed: getComputedStyle(document.querySelector('.pagetabs')).position, label: document.querySelector('#pgBuild .tl') && getComputedStyle(document.querySelector('#pgBuild .tl')).display}));
  check('on a PC the page tabs stay at the top with full names', pc.fixed !== 'fixed' && pc.label !== 'none', pc);
  await p2.click('#startCam'); await p2.waitForTimeout(500);
  const pcam = await p2.evaluate(() => ({asked: JSON.stringify(window._gum[0] && window._gum[0].video), screenLight: !document.getElementById('screenLight').hidden}));
  check('on a PC the webcam is asked for as before, and the screen light stays', !/environment/.test(pcam.asked) && pcam.screenLight, pcam);
  await p2.evaluate(() => { prefs.sound = true; sound('add'); });
  check('a PC doesn\'t try to buzz', await p2.evaluate(() => window._buzz.length === 0));
  check('no page errors on the PC', e2.length === 0, e2);
  await b2.close();
};
