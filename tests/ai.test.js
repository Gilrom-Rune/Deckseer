// AI picture recognition (Stage 2) with a tiny stand-in model and index in the real file format (tests/fixtures/ai).
// Needs onnxruntime-web 1.20.1 locally: `npm install` puts it in node_modules (or set ORT_WEB_DIR to its dist folder).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const { check } = require('./helpers');
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures', 'ai');
const ORT = process.env.ORT_WEB_DIR || path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

async function routeOrt(target) {
  await target.route(/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.20\.1\/dist\/(.+)$/, route => {
    const f = path.join(ORT, route.request().url().match(/dist\/([^?#]+)/)[1]);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  await target.route(/^https?:\/\/(?!localhost)(?!cdn\.jsdelivr\.net\/npm\/onnxruntime-web)/, r => r.abort());
}
const cardCap = (page, file, upsideDown) => page.evaluate(async ([file, flip]) => {
  const im = new Image(); im.src = file; await im.decode();
  const c = document.createElement('canvas'); c.width = 716; c.height = 1000; const g = c.getContext('2d');
  if (flip) { g.translate(716, 1000); g.rotate(Math.PI); }
  g.drawImage(im, 0, 0, 716, 1000);
  window._cap = {src: c, rect: {x: 0, y: 0, w: 716, h: 1000}, rectified: true};
  const ai = await aiMatch(window._cap); window._ai = ai;
  return {id: ai.best.id, name: ai.best.name, s: ai.best.s, flip: ai.best.flip, margin: ai.margin, top3: ai.cands.slice(0, 3).map(c => c.id)};
}, [file, upsideDown]);

module.exports = async function () {
  console.log('AI picture recognition');
  if (!fs.existsSync(path.join(ORT, 'ort.min.js'))) { console.log('  - skipped: onnxruntime-web not installed (run npm install)'); return; }
  // a website with the three files next to deckseer.html
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let f = /^\/(deckseer-embed\.onnx|deckseer-index\.(bin|json)|fixtures\/card-\d+\.png)$/.test(u) ? path.join(FIX, path.basename(u)) : path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch(); const context = await browser.newContext();
  await routeOrt(context);
  const page = await context.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + 'deckseer.html');
  await page.waitForFunction(() => typeof AI !== 'undefined' && (AI.state === 'ready' || AI.state === 'failed' || AI.state === 'missing'), null, { timeout: 30000 });
  const st = await page.evaluate(() => ({state: AI.state, err: AI.err, count: AI.meta && AI.meta.count, info: document.getElementById('aiPicInfo').textContent, saved: null}));
  check('on a website, the files next to the app are found and the model starts', st.state === 'ready' && st.count === 60, st);
  check('the options panel says it\'s ready', /Ready: 60 card pictures/.test(st.info), st.info);
  check('the files are kept in this browser', await page.evaluate(async () => !!(await idb.get('kv', 'ai:model')) && !!(await idb.get('kv', 'ai:index'))));

  const r1 = await cardCap(page, 'fixtures/card-7.png', false);
  check('a card picture is recognised as the right printing', r1.id === 'fx-0007' && r1.name === 'Card 3' && !r1.flip, r1);
  const r2 = await cardCap(page, 'fixtures/card-30.png', true);
  check('an upside-down card is recognised, and known to be upside down', r2.id === 'fx-0030' && r2.flip === true, r2);

  // choosing between two printings of the same card (fx-0006 and fx-0007 are both "Card 3")
  await cardCap(page, 'fixtures/card-7.png', false);
  const pp = await page.evaluate(async () => {
    const prints = [{id: 'fx-0006', name: 'Card 3', set: 'TST', number: '6', img: ''}, {id: 'fx-0007', name: 'Card 3', set: 'TST', number: '7', img: ''}];
    const sc = aiScorePrints(window._ai, prints), pick = await pickPrinting(prints, {set: '', number: ''}, null, window._ai);
    return {sc, pick};
  });
  check('the AI picks the right printing of a card', pp.pick.index === 1 && /AI/.test(pp.pick.why), pp);

  // name unreadable: presented from the AI, never added without the user's OK
  const pr = await page.evaluate(async () => {
    window.getPrints = async () => [{id: 'fx-0006', name: 'Card 3', set: 'TST', setName: 'Test', number: '6', rarity: 'common', lang: 'en', img: '', imgN: '', finishes: ['nonfoil']}, {id: 'fx-0007', name: 'Card 3', set: 'TST', setName: 'Test', number: '7', rarity: 'common', lang: 'en', img: '', imgN: '', finishes: ['nonfoil']}];
    prefs.add = true;
    const ok = await presentFromAi(window._ai, window._cap, [], Promise.resolve({text: ''}), scanSeq, "The name wasn't readable");
    for (let i = 0; i < 50 && !(current && current.name); i++) await new Promise(r => setTimeout(r, 100));   // the card is shown a moment later
    return {ok, name: current.name, sel: current.sel, added: current.added, why: current.why, alts: current.alts.map(a => a.name), status: document.getElementById('status') ? document.getElementById('status').textContent : ''};
  });
  check('an AI-only match is shown with the right card and printing', pr.ok && pr.name === 'Card 3' && pr.sel === 1, pr);
  check('an AI-only match waits for your OK (not added automatically)', pr.added === false, pr);
  check('other close cards are offered under "Not it?"', pr.alts.length >= 1 && !pr.alts.includes('Card 3'), pr.alts);
  check('two-faced names count as the same card, different cards don\'t', await page.evaluate(() => sameCard('Delver of Secrets // Insectile Aberration', 'Insectile Aberration') && sameCard('Lim-Dûl the Necromancer', 'lim-dul the necromancer') && !sameCard('Card 3', 'Card 30')));
  check('no page errors (website)', page.errors.length === 0, page.errors);

  // Remove
  await page.evaluate(() => document.getElementById('aiPicRemove').click()); await page.waitForTimeout(300);
  check('Remove switches it off and deletes the files', await page.evaluate(async () => AI.state === 'off' && !(await idb.get('kv', 'ai:model'))));
  await browser.close(); server.close();

  // Opened from a file: the user picks the three files
  const b2 = await chromium.launch(); const c2 = await b2.newContext(); await routeOrt(c2);
  const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('file://' + path.join(ROOT, 'deckseer.html'));
  await p2.waitForFunction(() => typeof AI !== 'undefined' && AI.state === 'missing', null, { timeout: 15000 });
  check('from a file, with nothing loaded, it explains how to load the files', /Click Load files/.test(await p2.textContent('#aiPicInfo')));
  // the wrong mix of files is refused with a reason
  const badBin = path.join(os.tmpdir(), 'deckseer-index.bin'); fs.writeFileSync(badBin, Buffer.alloc(1000));
  await p2.setInputFiles('#aiPicFiles', [path.join(FIX, 'deckseer-embed.onnx'), badBin, path.join(FIX, 'deckseer-index.json')]);
  await p2.waitForTimeout(500);
  check('files from different runs are refused, with the reason', /doesn't match deckseer-index\.json/.test(await p2.textContent('#toastMsg')));
  // files made before the rename (cardsight-…) still work
  const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-old-'));
  const oldFiles = ['embed.onnx', 'index.bin', 'index.json'].map(x => { const d = path.join(oldDir, 'cardsight-' + x); fs.copyFileSync(path.join(FIX, 'deckseer-' + x), d); return d; });
  await p2.setInputFiles('#aiPicFiles', oldFiles);
  await p2.waitForFunction(() => AI.state === 'ready' || AI.state === 'failed', null, { timeout: 30000 });
  check('from a file, picking the three files turns it on (old cardsight-… names too)', await p2.evaluate(() => AI.state === 'ready'), await p2.evaluate(() => AI.err));
  await p2.reload();
  await p2.waitForFunction(() => typeof AI !== 'undefined' && (AI.state === 'ready' || AI.state === 'failed' || AI.state === 'missing'), null, { timeout: 30000 });
  check('after a reload it starts again from the saved copy', await p2.evaluate(() => AI.state === 'ready'));
  check('no page errors (file)', e2.length === 0, e2);
  await b2.close();
};
