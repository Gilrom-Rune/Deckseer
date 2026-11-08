#!/usr/bin/env node
// Play every card in the Playtest and report what breaks.
//   node tools/allcards-check.js <cards.json> [report.json] [--from N] [--count N] [--only "Name|Name"]
// cards.json comes from tools/forge-cards.js. For each card it: reads it, casts it (paying mana) onto a busy table with
// three opponents who have creatures, resolves everything (letting Deckseer choose), uses each activated ability,
// takes the next turn, attacks and ends the turn. Errors, freezes (over 3 s) and cards it can't cast are reported,
// along with how much of each card's text the rules engine understood.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const file = args[0], out = args[1] && !args[1].startsWith('--') ? args[1] : null;
const all = JSON.parse(fs.readFileSync(file, 'utf8'));
let cards = all;
if (opt('--only')) { const want = new Set(opt('--only').split('|')); cards = all.filter(c => want.has(c.name)); }
const from = +(opt('--from') || 0), count = +(opt('--count') || cards.length);
cards = cards.slice(from, from + count);
const APP = 'file://' + path.resolve(__dirname, '../deckseer.html');
const byName = n => all.find(c => c.name === n);
const BASE = ['Forest', 'Island', 'Mountain', 'Plains', 'Swamp', 'Grizzly Bears', 'Llanowar Elves', 'Sol Ring', 'Serra Angel', 'Shock', 'Divination', 'Pacifism', 'Bonesplitter', 'Lightning Bolt', 'Counterspell', 'Wrath of God', 'Rampant Growth', 'Dark Ritual']
  .map(byName).filter(Boolean);

async function harness(page){
  await page.evaluate(base => {
    const q = []; const realST = window.setTimeout;
    window.__q = q;
    window.setTimeout = (fn, ms, ...a) => { if (window.__capture && (!ms || ms < 50) && typeof fn === 'function') { q.push(() => fn(...a)); return 0; } return realST(fn, ms, ...a); };
    const realRender = ptRender;
    window.__realRender = realRender;
    const mk = (c, n) => Array.from({length: n}, () => Object.assign({}, c, {qty: 1, board: 'main'}));
    const lands = base.filter(c => /Basic Land/.test(c.type));
    const spells = base.filter(c => !/Basic Land/.test(c.type));
    const deck = {id: 'harness', name: 'Harness', format: 'commander', created: 1, updated: 1,
      commanders: [Object.assign({}, spells.find(c => c.name === 'Serra Angel'), {qty: 1, board: 'main'})],
      cards: lands.flatMap(c => mk(c, 1)).map(c => Object.assign(c, {qty: 8})).concat(spells.map(c => Object.assign({}, c, {qty: 2, board: 'main'})))};
    window.__deck = deck;
    const flush = () => { let k = 0; while (q.length && k++ < 200) q.shift()(); };
    const settle = (limit = 60) => {
      for (let i = 0; i < limit; i++) {
        flush();
        const modal = document.getElementById('ptModal');
        if (typeof PT_PICK !== 'undefined' && PT_PICK) { ptPickFinish([], true); continue; }
        if (!modal.hidden) {
          const b = modal.querySelector('#ptAnyway, #ptXgo, [data-blkgo], [data-atkgo], [data-legkeep]');
          if (b) { b.click(); continue; }
          if (PT_VIEW && PT_VIEW.kind === 'search') { ptSearchDone(); continue; }
          if (PT_VIEW && PT_VIEW.kind === 'scry') { const d = modal.querySelector('[data-d=scrydone]'); if (d) { d.click(); continue; } }
          if (PT_VIEW && PT_VIEW.kind === 'dig') { const d = modal.querySelector('[data-d=digdone], [data-dig=apply], .btn.primary'); if (d) { d.click(); if (!modal.hidden) ptCloseModal(); continue; } }
          ptCloseModal(); continue;
        }
        if (PT.trig.length) { const p = PT.trig[0]; if (p.modes) { ptPickMode(p.id, 0); if (PT.trig[0] === p) PT.trig.shift(); continue; } ptDoPrompt(p.id); if (PT.trig[0] === p) PT.trig.shift(); continue; }
        if (PT.targeting) { const t = PT.bf.find(c => c.uid !== (PT.targeting.uid || -1)) || null; if (t) ptApplyTarget(t.uid); PT.targeting = null; continue; }
        return i;
      }
      PT.trig = []; return limit;
    };
    window.__check = function (card){
      const r = {name: card.name}; let stage = 'read';
      const t0 = performance.now();
      window.__capture = true;
      ptRender = () => {};
      try {
        const probe = ptMakeCard(card);
        const abs = trAbilities(probe), acts = trActivated(probe);
        // how much of its text was understood: each triggered ability's effect is covered by the actions read from it
        r.trig = abs.length; r.act = acts.length;
        r.unclear = abs.filter(a => a.eff != null && !trCovered(a.eff, a.actions)).map(a => a.eff.slice(0, 160));
        stage = 'setup';
        PT = ptNew(window.__deck); PT.phase = 'play'; PT.turn = 5; PT.hand = []; PT.log = [];
        prefs.ptTrigMode = 'auto'; prefs.ptAutoPick = true; prefs.ptAutoMana = true;
        const take = n => { const i = PT.lib.findIndex(c => c.name === n); return i >= 0 ? PT.lib.splice(i, 1)[0] : null; };
        const put = n => { const c = take(n); if (!c) return; [c.x, c.y] = ptPlace(c); c.since = 1; c.z = ++PT.z; PT.bf.push(c); return c; };
        ['Forest', 'Island', 'Mountain', 'Plains', 'Swamp', 'Forest', 'Island', 'Mountain', 'Plains', 'Swamp', 'Grizzly Bears', 'Llanowar Elves', 'Sol Ring', 'Bonesplitter'].forEach(put);
        ['Shock', 'Divination', 'Rampant Growth'].forEach(n => { const c = take(n); if (c) PT.hand.push(c); });
        ['Grizzly Bears', 'Lightning Bolt', 'Pacifism'].forEach(n => { const c = take(n); if (c) PT.grave.push(c); });
        PT.opps[0].board.push(ptOppCre({name: 'Wall', power: 0, toughness: 4, text: 'Defender'}), ptOppCre({name: 'Drake', power: 3, toughness: 3, text: 'Flying'}));
        PT.opps[1].board.push(ptOppCre({name: 'Bear', power: 2, toughness: 2}));
        stage = 'cast';
        const me = ptMakeCard(card); PT.hand.push(me);
        if (card.cost) r.pay = ptPlan(card.cost.split(' // ')[0], me).missing ? 'missing' : 'ok';
        ptCastPaid(me.uid); settle();
        r.where = (ptFind(me.uid) || {}).zone || 'gone';
        stage = 'activate';
        const live = PT.bf.find(c => c.uid === me.uid);
        if (live) trActivated(live).slice(0, 5).forEach((ab, i) => { if (!PT.bf.includes(live)) return; if (!ptCanPay(live, ab)) { ptActivate(live.uid, i); settle(); } });
        stage = 'way';
        const inHand = PT.hand.find(c => c.uid === me.uid) || PT.grave.find(c => c.uid === me.uid);
        if (inHand) for (const w of ptCastWays(inHand, PT.hand.includes(inHand) ? 'hand' : 'grave').slice(0, 2)) { if (!ptFind(me.uid)) break; const z = ptFind(me.uid).zone; if (z !== 'hand' && z !== 'grave') break; ptCastPaid(me.uid, w.k); settle(); }
        stage = 'turn';
        ptNextTurn(); settle();
        stage = 'attack';
        ptAttackDialog(); settle(5);
        if (PT_VIEW && PT_VIEW.kind === 'attack') { PT.bf.filter(c => (ptIsCreature(c) || c.faceDown) && !c.tapped).forEach(c => PT_VIEW.pick.add(c.uid)); ptAttack(); settle(); }
        stage = 'end';
        ptEndTurn(); settle();
        stage = 'render';
        ptRender = window.__realRender; ptRender();
        if (!document.getElementById('ptModal').hidden) ptCloseModal();
      } catch (e) {
        r.err = String(e && e.message || e).slice(0, 200); r.stage = stage; r.stack = String(e && e.stack || '').split('\n').slice(1, 4).map(s => s.trim().replace(/\(?file:\/\/[^:]+:/, 'L').replace(/\)$/, '')).join(' | ');
      } finally {
        ptRender = window.__realRender; window.__capture = false; q.length = 0;
        if (!document.getElementById('ptModal').hidden) { try { ptCloseModal(); } catch (e) {} }
        if (typeof PT_PICK !== 'undefined') PT_PICK = null;
      }
      r.ms = Math.round(performance.now() - t0);
      return r;
    };
    document.getElementById('pt').hidden = false; document.body.classList.add('pt-open');
  }, BASE);
}

(async () => {
  const browser = await chromium.launch();
  let page, errors = [];
  const open = async () => {
    if (page) await page.close().catch(() => {});
    page = await browser.newPage({viewport: {width: 1400, height: 900}});
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, r => r.abort());
    await page.goto(APP); await page.waitForFunction(() => typeof ptNew === 'function');
    await harness(page);
  };
  await open();
  const results = []; const t0 = Date.now();
  const BATCH = 100;
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);
    let res;
    try {
      res = await Promise.race([
        page.evaluate(b => b.map(c => { const before = window.__pageErr || 0; return window.__check(c); }), batch),
        new Promise((_, rej) => setTimeout(() => rej(new Error('batch timeout')), 120000))]);
    } catch (e) {
      // something froze: run the batch one card at a time to find it
      res = [];
      for (const c of batch) {
        await open();
        try { res.push(await Promise.race([page.evaluate(c => window.__check(c), c), new Promise((_, rej) => setTimeout(() => rej(new Error('freeze')), 15000))])); }
        catch (e2) { res.push({name: c.name, err: 'froze (over 15 s)', stage: 'freeze'}); await open(); }
      }
    }
    for (const r of res) if (r.ms > 3000) { r.slow = true; }
    if (errors.length) { res.push({name: '(page errors in this batch)', err: errors.slice(0, 5).join(' || ')}); errors = []; }
    results.push(...res);
    if ((i / BATCH) % 10 === 0) process.stdout.write(`${Math.min(i + BATCH, cards.length)}/${cards.length} cards, ${results.filter(r => r.err).length} errors, ${Math.round((Date.now() - t0) / 1000)} s\n`);
  }
  await browser.close();
  const errs = results.filter(r => r.err), slow = results.filter(r => r.slow);
  const unclear = results.filter(r => r.unclear && r.unclear.length);
  console.log(`\n${results.length} cards: ${errs.length} errors, ${slow.length} slow, ${unclear.length} with text it only partly understood.`);
  const groups = {}; for (const r of errs) { const k = r.err.replace(/\d+/g, 'N').slice(0, 90) + ' @ ' + (r.stack || '').split(' | ')[0]; (groups[k] = groups[k] || []).push(r.name); }
  for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 40)) console.log(`${v.length}× ${k}\n    e.g. ${v.slice(0, 4).join('; ')}`);
  if (out) fs.writeFileSync(out, JSON.stringify(results));
})();
