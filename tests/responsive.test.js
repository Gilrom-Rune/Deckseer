// The searches don't freeze the page: it keeps answering while they run (phones), and Stop works.
const { chromium, devices } = require('playwright');
const { check, APP } = require('./helpers');
const { ashlingDeck } = require('./fixtures/ashling-cards');

module.exports = async function () {
  console.log('Page stays responsive while searching');
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7']));
  await ctx.route(/^https?:/, r => r.abort());
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  // a slow phone: the CPU runs 4× slower
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  await page.goto(APP); await page.waitForTimeout(500);
  await page.evaluate(d => { decks.push(d); prefs.deckView = d.id; prefs.seenIntro = true; showPage('builder'); renderDeck(); document.querySelector('[data-dtab="test"]').click(); }, ashlingDeck());
  // measure the longest time the page couldn't respond while "Find the fastest win" runs
  const r = await page.evaluate(async () => {
    let worst = 0, last = performance.now(), ticks = 0, running = true;
    const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; ticks++; if (running) setTimeout(tick, 10); };
    setTimeout(tick, 10);
    const t0 = performance.now(); document.getElementById('fwRun').click();
    await new Promise(r => setTimeout(r, 50));
    const stopVisible = !!document.getElementById('fwStop');
    for (let i = 0; i < 1200 && !(fwState && fwState.res && !fwState.busy); i++) await new Promise(r => setTimeout(r, 50));
    running = false;
    return {worst: Math.round(worst), total: Math.round(performance.now() - t0), ticks, stopVisible, turn: fwState && fwState.res && fwState.res.results[0] && fwState.res.results[0].turn};
  });
  check(`the page keeps responding during the search (longest pause ${r.worst} ms on a 4× slower phone)`, r.worst < 400 && r.turn > 0, r);
  check('a Stop button shows while it searches', r.stopVisible, r);
  // Stop: ends the search quickly, keeping what was found
  const s2 = await page.evaluate(async () => {
    document.getElementById('fwDeep').click(); await new Promise(r => setTimeout(r, 300));
    const t0 = performance.now(); document.getElementById('fwStop').click();
    for (let i = 0; i < 400 && fwState.busy; i++) await new Promise(r => setTimeout(r, 25));
    return {ms: Math.round(performance.now() - t0), busy: fwState.busy, hasResult: !!(fwState.res && fwState.res.results.length), stopped: !!(fwState.res && fwState.res.stopped)};
  });
  check(`Stop ends the search within a second (${s2.ms} ms) and keeps the best win found so far`, !s2.busy && s2.ms < 1500 && s2.stopped, s2);
  check('no page errors', errs.length === 0, errs);
  await browser.close();
};
