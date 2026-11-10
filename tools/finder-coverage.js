#!/usr/bin/env node
// What the fastest-win finder misses, across every card.
//   node tools/finder-coverage.js <cards.json> [report.json]
// For each card it reads the card with the finder's reader (fwCard) and with the Playtest's (trAbilities, trActivated),
// then lists the triggered and activated abilities the Playtest understands fully but the finder drops, grouped by why.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [file, out] = process.argv.slice(2);
const cards = JSON.parse(fs.readFileSync(file, 'utf8'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route(/^https?:/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '../deckseer.html'));
  await page.waitForFunction(() => typeof fwCard === 'function');
  const res = [];
  for (let i = 0; i < cards.length; i += 2000) {
    res.push(...await page.evaluate(batch => batch.map(card => {
      const r = {name: card.name, dropped: []};
      try {
        FW_TYPE = "creature"; FW_CI = null;
        const f = fwCard(Object.assign({qty: 1, board: 'main'}, card));
        const c = {name: card.name, text: card.text || '', type: card.type || '', back: false, counters: {}, kw: {}, power: card.power, toughness: card.toughness, colors: card.colors || []};
        const keptTxt = new Set((f.trigs || []).concat(f.copyTrigs || []).map(t => t.text));
        for (const ab of trAbilities(c)) {
          if (!ab.actions.length || (ab.eff != null && !trCovered(ab.eff, ab.actions))) continue;   // the Playtest doesn't fully read it either
          if (keptTxt.has(ab.text)) continue;
          // already counted another way (draw, ramp, pump, burn…)
          if (ab.conds.every(k => k.ev === 'etb' && k.who === 'self') && ab.actions.every(a => (a.t === 'draw' && (f.draw || f.etbDraw)) || (a.t === 'searchAuto' && f.ramp) || (a.t === 'pump' && f.pump) || (a.t === 'opp' && f.burn))) continue;
          const why = ab.check ? 'keyword with its own condition' : ab.choice ? 'a choice (modes or "choose")' : !ab.conds.every(k => FW_EVS.has(k.ev)) ? `event the finder doesn't follow: ${ab.conds.map(k => k.ev).filter(e => !FW_EVS.has(e)).join(', ')}` : (ab.intervening || trConditional(ab.text)) ? 'has an "if"' : 'dropped';
          r.dropped.push({kind: 'trigger', why, text: ab.text.slice(0, 140), acts: ab.actions.map(a => a.t)});
        }
        const keptAct = new Set((f.acts || []).map(a => a.label));
        for (const ab of trActivated(c)) {
          if (ab.zone !== 'bf' || ab.kind === 'loyalty' || !(ab.actions || []).length || keptAct.has(ab.label)) continue;
          if (ab.kind === 'mana' && (f.rock || f.dork || f.land || f.burst)) continue;
          if (ab.eff && !trCovered(ab.eff, ab.actions)) continue;
          const cs = ab.cost || {};
          const why = cs.untap ? 'untap symbol cost' : cs.remove && cs.remove.length ? 'remove-counters cost' : cs.tapCre && cs.tapCre.length ? 'tap-creatures cost' : cs.exileGrave && cs.exileGrave.length ? 'exile-from-graveyard cost' : ab.kind !== 'ability' && ab.kind !== 'mana' ? `keyword ability: ${ab.kind}` : 'dropped';
          r.dropped.push({kind: 'activated', why, text: String(ab.label || '').slice(0, 140), acts: ab.actions.map(a => a.t)});
        }
      } catch (e) { r.err = String(e.message).slice(0, 160); }
      return r;
    }), cards.slice(i, i + 2000)));
  }
  await browser.close();
  const all = res.flatMap(r => r.dropped.map(d => Object.assign({card: r.name}, d)));
  console.log(`${res.length} cards: ${res.filter(r => r.err).length} errors; ${res.filter(r => r.dropped.length).length} cards with abilities the Playtest reads but the finder drops (${all.length} abilities).`);
  const g = {}; for (const d of all) { const k = d.kind + ': ' + d.why + ' [' + d.acts.join(',') + ']'; (g[k] = g[k] || []).push(d.card); }
  for (const [k, v] of Object.entries(g).sort((a, b) => b[1].length - a[1].length).slice(0, +(process.env.TOP || 40))) console.log(`${String(v.length).padStart(5)}  ${k}   (${v.slice(0, 3).join('; ')})`);
  for (const r of res.filter(r => r.err).slice(0, 10)) console.log('ERR', r.name, r.err);
  if (out) fs.writeFileSync(out, JSON.stringify(res));
})();
