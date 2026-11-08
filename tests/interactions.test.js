// The fastest-win finder with real cards from the Ashling Elementals deck: how they work together.
const { openApp, check } = require('./helpers');
const { ASHLING, CARDS, ashlingDeck } = require('./fixtures/ashling-cards');

module.exports = async function () {
  console.log('Card interactions (Ashling deck)');
  const { browser, page } = await openApp();
  const run = (pool, cmds, extra) => page.evaluate(([pool, cmds, extra]) => {
    FW_TYPE = 'elemental'; FW_CI = 'WUBRG';
    const P = pool.map(c => fwCard(c)), C = cmds.map(c => fwCard(c, true));
    const b = fwSearch({kind: 'damage', label: 'Damage'}, P, C, Object.assign({life: 40, isCmd: true, maxT: 10, beam: 120, wide: 12, ms: 15000}, extra || {}));
    return b && {turn: b.won.t, log: b.log.map(l => ({t: l.t, kind: l.kind, name: l.name || '', how: l.how || '', note: l.note || '', costs: l.costs || [], tap: (l.tap || []).map(x => x.name)}))};
  }, [pool, cmds, extra]);

  // reading
  const read = await page.evaluate(([s, i]) => { FW_TYPE = 'elemental'; return {summons: fwCard(s).summons, imp: JSON.stringify(fwCard(i).trigs || [])}; }, [CARDS.summons, CARDS.impulsivity]);
  check('Kindred Summons is read with today\'s wording ("…of the chosen type")', read.summons === 'elemental', read);
  check('Impulsivity\'s "cast an instant or sorcery from a graveyard for free" is read', /castGy/.test(read.imp), read.imp);

  // the whole deck
  const deck = ashlingDeck();
  const r = await run(deck.cards, deck.commanders);
  check(`the finder finds a win with the Ashling deck (turn ${r && r.turn})`, !!r, r);
  const all = r.log;
  check('every mana it spends comes from a real, named source (no leaked mana between options)', all.every(l => !l.tap.includes('a mana source')), all.filter(l => l.tap.includes('a mana source')));
  // every card cast "from the graveyard" really went there earlier in the game
  const gyOk = all.every((l, i) => !/cast from the graveyard/.test(l.how) || all.slice(0, i).some(m => m.name === l.name && (m.kind === 'cast' || /evoke/.test(m.how))));
  check('a card is only cast from the graveyard after it really went there', gyOk, all.filter(l => /graveyard/.test(l.how)));
  // log order: a sacrifice cost's line comes before the Ashling trigger it sets off
  const order = all.every((l, i) => !(l.kind === 'trigger' && /token copy of/.test(l.note) && all[i + 1] && all[i + 1].kind === 'ability' && all[i + 1].costs.some(c => new RegExp('sacrifice ' + l.note.match(/token copy of (.+?) with/)[1]).test(c))));
  check('the turn table lists a sacrifice before the copy it causes', order, all.filter(l => l.kind === 'ability' || /token copy/.test(l.note)).map(l => l.kind + ' ' + l.name + ' ' + l.note + ' ' + l.costs.join(';')));

  // Maelstrom Wanderer evoked with Ashling: its copy gives the other creatures haste
  const lands = [CARDS.ziggurat, CARDS.cavern, Object.assign({}, CARDS.avengerLand, {qty: 30})];
  const w = await run(lands.concat([CARDS.wanderer, CARDS.titan, CARDS.avenger, CARDS.cavalier, CARDS.solRing, CARDS.birds]), [ASHLING]);
  const hasted = w && w.log.filter(l => /haste from another card/.test(l.note));
  check('a token copy of Maelstrom Wanderer gives your other creatures haste', w && w.log.some(l => /token copy of Maelstrom Wanderer/.test(l.note)) && hasted.length > 0, w && w.log.map(l => l.t + ' ' + l.kind + ' ' + l.name + ' ' + l.note));

  // Greenwarden only returns what's really in the graveyard
  const gw = await run(lands.concat([CARDS.greenwarden, CARDS.solRing]), []);
  const gwLines = gw ? gw.log.filter(l => l.name === 'Greenwarden of Murasa' && l.kind === 'trigger') : [];
  check('Greenwarden returns nothing when the graveyard is empty (no free card)', gwLines.every(l => !/returns/.test(l.note)), gwLines);
  const gw2 = await run(lands.concat([CARDS.greenwarden, CARDS.ritual, CARDS.solRing, CARDS.wildspeaker]), [ASHLING]);
  const ret = gw2 ? gw2.log.filter(l => /returns .* from your graveyard/.test(l.note)) : [];
  // evoked with Ashling: the token copy's trigger can return the original Greenwarden itself (a real loop)
  const loop = await run(lands.concat([CARDS.greenwarden, CARDS.solRing, CARDS.birds]), [ASHLING]);
  check('evoked Greenwarden: Ashling\'s copy returns the original from the graveyard', !!loop && loop.log.some(l => /returns Greenwarden of Murasa from your graveyard/.test(l.note)), loop && loop.log.filter(l => /Greenwarden/.test(l.name + l.note)).map(l => l.t + ' ' + l.kind + ' ' + l.note));
  check('Greenwarden returns a card that really went to the graveyard', ret.every(l => { const nm = l.note.match(/returns (.+) from your graveyard/)[1]; return gw2.log.some(m => m.name === nm && m.kind === 'cast'); }), ret);
  // Flamekin Harbinger: "search … then shuffle and put that card on top" — a second trigger shuffles the first card away
  const harb = await page.evaluate(([C, A]) => {
    FW_TYPE = 'elemental'; FW_CI = 'WUBRG';
    const pool = [Object.assign({}, C.avengerLand, {qty: 30}), C.island, C.mountain, C.twinflame, C.harbinger, C.titan, C.avenger, C.wanderer, C.reef, C.solRing].map(c => fwCard(c)), cmds = [fwCard(A, true)];
    const lib = ['Forest', 'Mountain', 'Island', 'Twinflame Travelers', 'Forest', 'Flamekin Harbinger', 'Risen Reef', 'Sol Ring', 'Forest', 'Forest', 'Island', 'Mountain'].concat(Array(20).fill('Forest')).concat(['Titan of Industry', 'Avenger of Zendikar', 'Maelstrom Wanderer']);
    const notes = mode => { const b = fwSearch({kind: 'damage', label: 'Damage'}, pool, cmds, Object.assign({life: 40, isCmd: true, maxT: 10, beam: 80, wide: 10, ms: 8000}, mode === 'real' ? {lib} : {})); return b ? b.log.map(l => (l.name || '') + ' :: ' + (l.note || '')) : []; };
    return {real: notes('real'), best: notes('best')};
  }, [CARDS, ASHLING]);
  const realH = harb.real.filter(x => /^Flamekin Harbinger :: .*on top/.test(x));
  check('realistic games: Harbinger puts one real card on top; any further trigger says it shuffled and only one card stays on top', realH.length >= 1 && /puts .+ on top of your library: your next card/.test(realH[0]) && realH.slice(1).every(x => /shuffles/.test(x) && /only one card stays on top/.test(x) || /your next card/.test(x)), realH);
  // straight from the effect: two triggers in a row in a real game leave one card on top
  const twice = await page.evaluate(([C, A]) => {
    FW_TYPE = 'elemental'; FW_CI = 'WUBRG';
    const pool = [Object.assign({}, C.avengerLand, {qty: 30}), C.island, C.mountain, C.twinflame, C.harbinger, C.titan, C.avenger, C.wanderer, C.reef, C.solRing].map(c => fwCard(c)), cmds = [fwCard(A, true)];
    const lib = ['Forest', 'Mountain', 'Island', 'Twinflame Travelers', 'Forest', 'Flamekin Harbinger', 'Forest', 'Sol Ring', 'Forest', 'Forest', 'Island', 'Mountain'].concat(Array(20).fill('Forest')).concat(['Titan of Industry', 'Avenger of Zendikar', 'Maelstrom Wanderer', 'Risen Reef']);
    const b = fwSearch({kind: 'damage', label: 'Damage'}, pool, cmds, {life: 40, isCmd: true, maxT: 10, beam: 80, wide: 10, ms: 8000, lib});
    return b ? b.log.filter(l => l.name === 'Flamekin Harbinger' && /on top/.test(l.note || '')).map(l => 'T' + l.t + ' ' + l.note) : [];
  }, [CARDS, ASHLING]);
  check('with Twinflame out, Harbinger\'s second trigger shuffles and still leaves only one card on top', twice.length >= 2 && /shuffles/.test(twice[1]) && /only one card stays on top/.test(twice[1]), twice);
  const bestH = harb.best.filter(x => /^Flamekin Harbinger :: /.test(x));
  check('fastest win: a second Harbinger trigger never stacks a second chosen card on top', bestH.slice(1).every(x => !/^Flamekin Harbinger :: puts the card you want on top/.test(x) || false) || bestH.length < 2, bestH);
  const reef = harb.real.filter(x => /^Risen Reef :: .*(top|hand)/.test(x));
  check('realistic games: Risen Reef looks at the real top card (never "the best one")', reef.every(x => /top card is [A-Z]|the card you put on top|goes to your hand$/.test(x) && !/top card isn't a land/.test(x)), reef);

  // the buttons themselves, the way the app runs them, on the fuller deck (Risen Reef, Yarok, Twinflame, two Omnaths…)
  const buttons = await page.evaluate(async d => {
    const out = {};
    try { const r = await fastestWin(d); out.fastest = r.results[0] && r.results[0].turn; } catch (e) { out.fastestErr = String(e.stack || e).slice(0, 300); }
    try { const r = await fwRealistic(d, 12); out.real = r.games; } catch (e) { out.realErr = String(e.stack || e).slice(0, 300); }
    return out;
  }, ashlingDeck());
  check(`"Find fastest win" runs on the full deck without crashing (turn ${buttons.fastest})`, buttons.fastest > 0 && !buttons.fastestErr, buttons);
  check('"Play realistic games" runs on the full deck without crashing', buttons.real === 12 && !buttons.realErr, buttons);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
