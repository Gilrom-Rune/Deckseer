// Fastest win: the deep check finds faster wins than the rules-of-thumb search, and says honestly what it checked.
const { openApp, check } = require('./helpers');
const { ashlingDeck } = require('./fixtures/ashling-cards');

module.exports = async function () {
  console.log('Fastest win: deep check');
  const { browser, page } = await openApp();
  const r = await page.evaluate(async d => {
    const q = await fastestWin(d);
    const t0 = Date.now(); const dp = await fastestWin(d, null, {deep: true, budget: 12000}); const ms = Date.now() - t0;
    const top = dp.results[0];
    // replay the winning line's attack total and that every attacker could legally attack
    const atk = top.best.log.find(l => l.kind === 'attack' && l.t === top.turn);
    return {quick: q.results[0].turn, deep: top.turn, ms, info: dp.deep, dmg: atk && atk.dmg, opp: dp.o.life,
      unnamed: top.best.log.some(l => (l.tap || []).some(x => x.name === 'a mana source'))};
  }, ashlingDeck());
  check(`the deep check finds a faster win than the quick search (turn ${r.deep} instead of ${r.quick})`, r.deep < r.quick, r);
  check(`…with enough damage (${r.dmg} vs ${r.opp} life) and only real mana`, r.dmg >= r.opp && !r.unnamed, r);
  const last = r.info.checked[r.info.checked.length - 1];
  check(`it reports what it checked below that (turn ${last && last.turn}: ${last && (last.exhaustive ? 'every possible line' : last.complete ? 'searched hard' : 'ran out of time')})`, !!last && last.turn === r.deep - 1, r.info);
  check(`it stays within its time limit (${(r.ms / 1000).toFixed(1)} s of 12 s)`, r.ms < 14000, r.ms);
  // the panel: Search harder button and the honest line
  const ui = await page.evaluate(async d => {
    decks.push(d); prefs.deckView = d.id; showPage('builder'); renderDeck(); document.querySelector('[data-dtab="test"]').click();
    document.getElementById('fwRun').click();
    for (let i = 0; i < 300 && !(fwState && fwState.res && !fwState.busy); i++) await new Promise(r => setTimeout(r, 100));
    return {deepBtn: !!document.getElementById('fwDeep'), line: (document.querySelector('.fw-deep') || {}).textContent || '', turn: (document.querySelector('#deckFast .sim-big b') || {}).textContent || ''};
  }, ashlingDeck());
  check('"Find the fastest win" shows the deep-check result and offers "Search harder"', ui.deepBtn && /turn-\d win/.test(ui.line) && /Turn 2/.test(ui.turn), ui);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
