// The scanner page scrolls as one page: no box inside it scrolls by itself (it used to be the printings picker).
const { chromium, devices } = require('playwright');
const { check, APP } = require('./helpers');

module.exports = async function () {
  console.log('Scanner page scrolling');
  const browser = await chromium.launch();
  for (const [label, opt] of [['PC', {viewport: {width: 1366, height: 768}}], ['phone', devices['Pixel 7']]]) {
    const ctx = await browser.newContext(opt); await ctx.route(/^https?:/, r => r.abort());
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(APP); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      prefs.seenIntro = true; document.getElementById('intro').hidden = true;
      const pr = []; for (let i = 0; i < 30; i++) pr.push({id: 'p' + i, name: 'Sol Ring', set: 'S' + i, setName: 'Set ' + i, number: String(i), rarity: 'uncommon', lang: 'en', finishes: ['nonfoil'], img: '', imgN: '', usd: '1.00'});
      const items = []; for (let i = 0; i < 30; i++) { const k = 's' + i, e = {name: 'Card ' + i, set: 'CMM', setName: 'X', number: String(i), qty: 1, cond: 'NM', list: 'Collection', usd: '1.00', rarity: 'rare', lang: 'en', finishes: ['nonfoil'], img: '', imgN: ''}; coll.set(k, e); items.push({key: k, qty: 1, name: e.name, t: 1}); }
      session.items = items; renderAll();
      prefs.add = false; await present({name: 'Sol Ring', prints: pr, sel: 20, why: 'x', info: {set: '', number: ''}, wins: [], shot: '', rectified: false, alts: []}, false, false);
      const scrollers = () => [...document.querySelectorAll('#scanPage *')].filter(x => { const cs = getComputedStyle(x); return /(auto|scroll)/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 2; }).map(x => x.className);
      const shown = () => [...document.querySelectorAll('#prints .pr')].map(b => +b.dataset.i);
      const before = {scrollers: scrollers(), shown: shown(), btn: (document.getElementById('showAllPrints') || {}).textContent};
      document.getElementById('showAllPrints').click();
      return {before, after: {shown: shown().length, btn: !!document.getElementById('showAllPrints'), scrollers: scrollers()}};
    });
    check(`${label}: nothing on the scanner page scrolls by itself`, r.before.scrollers.length === 0 && r.after.scrollers.length === 0, r);
    check(`${label}: 12 printings show at first, plus the selected one, with "Show all 30 printings"`, r.before.shown.length === 13 && r.before.shown.includes(20) && /Show all 30 printings/.test(r.before.btn), r.before);
    check(`${label}: "Show all" shows every printing in the page`, r.after.shown === 30 && !r.after.btn, r.after);
    // with every printing showing, the Add button comes into view where it sits on the page (not only at the very bottom)
    const add = await page.evaluate(async () => {
      const items = []; for (let i = 0; i < 80; i++) { const k = 'x' + i, e = {name: 'More ' + i, set: 'CMM', setName: 'X', number: String(i), qty: 1, cond: 'NM', list: 'Collection', usd: '1.00', rarity: 'rare', lang: 'en', finishes: ['nonfoil'], img: '', imgN: ''}; coll.set(k, e); items.push({key: k, qty: 1, name: e.name, t: 1}); }
      session.items = session.items.concat(items); renderAll();
      await new Promise(r => setTimeout(r, 150)); scrollTo(0, 0);
      const pos = document.getElementById('addBtn').getBoundingClientRect().top + scrollY, H = innerHeight;
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 50) { scrollTo(0, y); await new Promise(r => requestAnimationFrame(r)); const r = document.getElementById('addBtn').getBoundingClientRect(); if (r.top >= 0 && r.bottom <= H) return {first: y, pos: Math.round(pos), H}; }
      return {first: null};
    });
    check(`${label}: with all printings showing, the Add button is reached by scrolling to it (at ${add.first}px, it sits at ${add.pos}px)`, add.first != null && add.first <= Math.max(0, add.pos - add.H) + 300, add);
    check(`${label}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }
  await browser.close();
};
