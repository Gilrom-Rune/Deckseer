// The 3,000-game deck test plays your cards' rules: Ashling's evoke and copies, Elemental triggers, landfall, doublers.
const { openApp, check } = require('./helpers');
const c = (name, type, cost, cmc, text, colors, extra) => Object.assign({name, type, cost, cmc, text, colors, ci: colors, qty: 1, board: 'main', power: '', toughness: ''}, extra || {});
const ASHLING_TEXT = "Elemental permanent spells you cast from your hand have evoke {4}.\nWhenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of the next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.";
const deck = ashText => ({
  id: 'dSim', name: 'Ashling test', format: 'commander', created: 1, updated: 1,
  commanders: [c('Ashling, the Limitless', 'Legendary Creature — Elemental Sorcerer', '{2}{R}', 3, ashText, ['R'], {ci: ['W', 'U', 'B', 'R', 'G'], power: '3', toughness: '3'})],
  cards: [
    c('Forest', 'Basic Land — Forest', '', 0, '', [], {qty: 13}), c('Island', 'Basic Land — Island', '', 0, '', [], {qty: 9}), c('Mountain', 'Basic Land — Mountain', '', 0, '', [], {qty: 9}), c('Plains', 'Basic Land — Plains', '', 0, '', [], {qty: 4}), c('Swamp', 'Basic Land — Swamp', '', 0, '', [], {qty: 3}),
    c('Risen Reef', 'Creature — Elemental', '{1}{G}{U}', 3, "Whenever Risen Reef or another Elemental you control enters, look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, you may put it into your hand.", ['G', 'U'], {power: '1', toughness: '1'}),
    c('Mulldrifter', 'Creature — Elemental', '{4}{U}', 5, "Flying\nWhen Mulldrifter enters, draw two cards.\nEvoke {2}{U}", ['U'], {power: '2', toughness: '2', qty: 4}),
    c('Omnath, Locus of Rage', 'Legendary Creature — Elemental', '{3}{R}{R}{G}{G}', 7, "Landfall — Whenever a land you control enters, create a 5/5 red and green Elemental creature token.\nWhenever Omnath, Locus of Rage or another Elemental you control dies, Omnath deals 3 damage to any target.", ['R', 'G'], {power: '5', toughness: '5'}),
    c('Avenger of Zendikar', 'Creature — Elemental', '{5}{G}{G}', 7, "When Avenger of Zendikar enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.", ['G'], {power: '5', toughness: '5'}),
    c('Big Elemental', 'Creature — Elemental', '{5}{G}{G}', 7, "Trample", ['G'], {power: '7', toughness: '7', qty: 12}),
    c('Wood Elemental Scout', 'Creature — Elemental', '{2}{G}', 3, "When this creature enters, draw a card.", ['G'], {power: '2', toughness: '2', qty: 10}),
    c('Arcane Signet', 'Artifact', '{2}', 2, "{T}: Add one mana of any color in your commander's color identity.", [], {qty: 1}),
    c('Sol Ring', 'Artifact', '{1}', 1, '{T}: Add {C}{C}.', [], {qty: 1}),
    c('Cultivate', 'Sorcery', '{2}{G}', 3, 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', ['G'], {qty: 4}),
    c('Lightning Bolt', 'Instant', '{R}', 1, 'Lightning Bolt deals 3 damage to any target.', ['R'], {qty: 5}),
    c('Opt', 'Instant', '{U}', 1, 'Scry 1.\nDraw a card.', ['U'], {qty: 21})
  ]
});

module.exports = async function () {
  console.log('3,000-game deck test');
  const { browser, page } = await openApp();
  const r = await page.evaluate(([withText, without]) => {
    Math.random = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const opts = {bracket: 3, speed: 'strong', style: 'balanced', games: 600};
    const t0 = performance.now(); const A = simulateDeck(withText, opts); const ms = performance.now() - t0;
    const B = simulateDeck(without, opts);
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return {ms: Math.round(ms), A: {wins: A.wins, gold: med(A.goldTurns), evokes: A.evokes, copies: A.copies, kept: A.kept, trigs: A.trigs}, B: {wins: B.wins, gold: med(B.goldTurns), evokes: B.evokes, copies: B.copies}};
  }, [deck(ASHLING_TEXT), deck('')]);
  check('Ashling\'s evoke {4} is used', r.A.evokes > 0, r.A);
  check('each evoked Elemental comes back as a token copy', r.A.copies >= r.A.evokes * 0.9, r.A);
  check('some copies are kept by paying {W}{U}{B}{R}{G}', r.A.kept > 0, r.A);
  check('Elemental and landfall triggers happen', r.A.trigs > 1000, r.A.trigs);
  check('without Ashling\'s abilities, only Mulldrifter\'s own evoke and no copies', r.B.copies === 0 && r.B.evokes < r.A.evokes, r.B);
  console.log(`    with Ashling: ${r.A.wins}/600 wins, ${r.A.evokes} evokes, ${r.A.copies} copies, ${r.A.kept} kept · without: ${r.B.wins}/600 wins, ${r.B.evokes} evokes`);
  check(`Ashling's abilities make the deck faster (median unopposed win turn ${r.A.gold} vs ${r.B.gold})`, r.A.gold <= r.B.gold, [r.A, r.B]);
  check(`it stays quick (${r.ms} ms for 600 games + 600 unopposed)`, r.ms < 15000, r.ms);
  // the fastest-win finder also pays {W}{U}{B}{R}{G} to keep a copy when it has the mana
  const fw = await page.evaluate(async d => {
    const {pool, cmds, o} = await fwPlans(d);
    let kept = 0, sacked = 0, turn = null;
    for (const seed of [1, 2, 3]) {
      Math.random = (() => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
      const b = fwSearch({kind: 'damage', label: 'Damage'}, pool, cmds, Object.assign({}, o, {ms: 2500}));
      if (!b) continue; turn = turn == null ? b.won.t : Math.min(turn, b.won.t);
      kept += b.log.filter(l => /kept: paid \{W\}\{U\}\{B\}\{R\}\{G\}/.test(l.note || '')).length;
      sacked += b.log.filter(l => /sacrificed at end of turn/.test(l.note || '')).length;
    }
    return {kept, sacked, turn};
  }, deck(ASHLING_TEXT));
  check(`the fastest-win finder runs on the Ashling deck (turn ${fw.turn})`, fw.turn > 0, fw);
  console.log(`    finder: copies kept by paying ${fw.kept}, let go ${fw.sacked}`);
  const keep = await page.evaluate(() => {
    const C = (name, type, cost, cmc, text, extra) => Object.assign({name, type, cost, cmc, text, colors: [], qty: 1, board: 'main', power: '', toughness: ''}, extra || {});
    FW_TYPE = 'elemental'; FW_CI = 'WUBRG';
    const ash = fwCard(C('Ashling, the Limitless', 'Legendary Creature — Elemental Sorcerer', '{2}{R}', 3, document.body.dataset.x || "Elemental permanent spells you cast from your hand have evoke {4}.\nWhenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of the next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.", {colors: ['R'], power: '3'}), true);
    const mine = Object.assign(fwCard(C('Gemstone Mine', 'Land', '', 0, '{T}: Add one mana of any color.')), {qty: 40});
    const big = Object.assign(fwCard(C('Huge Elemental', 'Creature — Elemental', '{8}{G}{G}', 10, 'Trample', {colors: ['G'], power: '9'})), {qty: 20});
    const b = fwSearch({kind: 'damage', label: 'Damage'}, [mine, big], [ash], {life: 120, maxT: 14, beam: 60, wide: 10, ms: 6000});
    return b ? b.log.filter(l => l.why === 'end').map(l => l.t + ':' + l.note) : [];
  });
  check('the finder pays {W}{U}{B}{R}{G} to keep a copy once it has the mana, and lets it go before', keep.some(n => /kept: paid/.test(n)) && keep.some(n => /sacrificed/.test(n)) && +keep.find(n => /kept/.test(n)).split(':')[0] >= 9, keep);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
