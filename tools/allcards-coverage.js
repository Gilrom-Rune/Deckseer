#!/usr/bin/env node
// How much card text the Playtest understands, across every card.
//   node tools/allcards-coverage.js <cards.json> [report.json]
// For each triggered ability, activated ability and instant/sorcery effect, it checks whether the actions read from
// the text cover all of it (trCovered). It prints the share understood and the most common wording left over.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [file, out] = process.argv.slice(2);
const cards = JSON.parse(fs.readFileSync(file, 'utf8'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route(/^https?:/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '../deckseer.html'));
  await page.waitForFunction(() => typeof trAbilities === 'function');
  const res = [];
  for (let i = 0; i < cards.length; i += 2000) {
    res.push(...await page.evaluate(batch => batch.map(card => {
      const r = {name: card.name, parts: 0, ok: 0, left: []};
      const note = (kind, eff, acts) => {
        if (eff == null) return;
        r.parts++;
        let ok = false; try { ok = trCovered(eff, acts); } catch (e) { r.err = String(e.message); }
        if (ok) { r.ok++; return; }
        // why: the first hard word, or a verb with more uses than actions read for it, with the words around it
        let e = String(eff || '').toLowerCase().replace(/\([^)]*\)/g, '');
        for (const a of acts) if (a.span) e = e.split(a.span).join(' ');
        e = trStripHandled(e).replace(/\bwhere x is [^.]+/g, ' ');
        const rest = acts.filter(a => !a.span); let why = '';
        const h = e.replace(/create (?:[^.]*?) for each [a-z ]+ you control/, '').match(TR_HARD);
        if (h) { const at = e.indexOf(h[0]); why = e.slice(Math.max(0, at - 0), at + 48); }
        else for (const [re, types] of TR_VERBS) { const n = (e.match(re) || []).length, have = rest.filter(a => types.includes(a.t)).length; if (n > have) { const m = e.match(re); const at = e.indexOf(m[0]); why = e.slice(at, at + 48); break; } }
        r.left.push({kind, eff: String(eff).slice(0, 220), why: why.trim()});
      };
      try {
        const c = ptMakeCard(card);
        for (const a of trAbilities(c)) if (a.modes) a.modes.forEach(m => note('trigger mode', m.eff, m.actions)); else note('trigger', a.eff, a.actions || []);
        for (const a of trActivated(c)) if (a.kind !== 'mana') note('activated', a.eff != null ? a.eff : null, a.actions || []);
        if (/\b(Instant|Sorcery)\b/.test((card.type || '').split(' // ')[0])) {
          const text = ptSpellText(c), modes = trModes(text);
          if (modes) modes.lines.forEach(l => { const e = trLower(c, l); note('mode', e, trActions(e, c.name)); });
          else { const e = trLower(c, text.replace(/\([^)]*\)/g, '').trim()); note('spell', e, trActions(e, c.name)); }
        }
      } catch (e) { r.err = String(e.message).slice(0, 200); }
      return r;
    }), cards.slice(i, i + 2000)));
  }
  await browser.close();
  const parts = res.reduce((t, r) => t + r.parts, 0), ok = res.reduce((t, r) => t + r.ok, 0);
  const full = res.filter(r => r.parts && r.ok === r.parts).length, any = res.filter(r => r.parts).length;
  console.log(`${res.length} cards. Abilities and spell effects: ${ok}/${parts} understood fully (${(100 * ok / parts).toFixed(1)}%). Cards with every part understood: ${full}/${any}. Errors: ${res.filter(r => r.err).length}.`);
  // the commonest leftovers, as patterns (numbers, names and colours made general)
  const norm = s => s.replace(/cardname/g, '~').replace(/\{[^}]+\}/g, '{M}').replace(/\b\d+\b/g, 'N').replace(/\b(white|blue|black|red|green)\b/g, 'COLOR');
  const head = s => norm(s).split(/[.]\s/)[0].split(/,\s/).slice(0, 2).join(', ').slice(0, 80);
  const g = {}; for (const r of res) for (const l of r.left) { const k = norm(l.why || '?').split(/[.,]/)[0].split(' ').slice(0, 5).join(' '); (g[k] = g[k] || []).push(r.name); }
  for (const [k, v] of Object.entries(g).sort((a, b) => b[1].length - a[1].length).slice(0, +(process.env.TOP || 60))) console.log(`${String(v.length).padStart(5)}  ${k}   (${v.slice(0, 2).join('; ')})`);
  if (out) fs.writeFileSync(out, JSON.stringify(res));
})();
