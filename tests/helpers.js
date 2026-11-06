// Shared helpers for the Deckseer test suite: open the app from disk with the network mocked.
const path = require('path');
const { chromium } = require('playwright');
const APP = 'file://' + path.resolve(__dirname, '../deckseer.html');

async function openApp(opts = {}) {
  const browser = opts.browser || await chromium.launch();
  const context = opts.context || await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  // Nothing reaches the internet. Scryfall gets small canned answers; everything else fails like it would offline.
  await page.route(/^https?:/, route => {
    const url = route.request().url();
    if (opts.scryfall && /api\.scryfall\.com/.test(url)) {
      const body = opts.scryfall(url);
      if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"object":"error"}' });
    }
    return route.abort();
  });
  await page.goto(opts.url || APP);
  await page.waitForFunction(() => typeof window.$ === 'function' || document.readyState === 'complete');
  await page.waitForTimeout(300);
  return { browser, context, page };
}

let failures = 0, passes = 0;
function check(name, ok, extra) {
  if (ok) { passes++; console.log('  ✓ ' + name); }
  else { failures++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function summary() { return { passes, failures }; }
function crashed(msg) { failures++; console.log('  ✗ ' + msg); }
module.exports = { openApp, check, summary, crashed, APP };
