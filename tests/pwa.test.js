// Served from a web address, Deckseer installs and keeps working offline.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { check } = require('./helpers');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };

module.exports = async function () {
  console.log('Installable app (PWA)');
  let up = true;
  const server = http.createServer((req, res) => {
    if (!up) { req.socket.destroy(); return; }
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch(); const context = await browser.newContext();
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await context.route(/^https?:\/\/(?!localhost)/, r => r.abort());

  await page.goto(base);
  await page.waitForURL(/deckseer\.html/);
  const manifest = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); return l && (await fetch(l.href)).json(); });
  check('the page links a valid manifest', manifest && manifest.name === 'Deckseer' && manifest.icons.length === 3, manifest);
  for (const ic of manifest.icons) check('icon exists: ' + ic.src, fs.existsSync(path.join(ROOT, ic.src)));
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 });
  const ready = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active && r.active.state; });
  check('the service worker is running', ready === 'activated', ready);
  const reloads = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await page.reload(); await page.waitForTimeout(300);
  check('the first install does not reload the page by itself', reloads === 1);
  check('the page is controlled by the service worker', await page.evaluate(() => !!navigator.serviceWorker.controller));
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat());
  check('the app is saved for offline use', cached.some(u => u.endsWith('/deckseer.html')), cached);

  // Go offline (server down) and open the app again.
  up = false; await context.setOffline(true);
  await page.goto(base + 'deckseer.html'); await page.waitForTimeout(500);
  check('the app opens with no connection', await page.evaluate(() => !!document.getElementById('backup') && typeof coll !== 'undefined'));
  check('the install button is in the page (shown when Chrome offers install)', await page.evaluate(() => !!document.getElementById('installApp')));
  check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close();

  // Opened straight from a file, nothing service-worker related happens.
  const b2 = await chromium.launch(); const p2 = await b2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.route(/^https?:/, r => r.abort());
  await p2.goto('file://' + path.join(ROOT, 'deckseer.html')); await p2.waitForTimeout(400);
  check('from a file: no manifest link and no errors', await p2.evaluate(() => !document.querySelector('link[rel=manifest]')) && e2.length === 0, e2);
  await b2.close();
};
