// The deck test's realism: colours, tapped lands, sacrifice outlets, activated abilities, tuning to your own games.
const { openApp, check } = require('./helpers');
const c = (name, type, cost, cmc, text, colors, extra) => Object.assign({name, type, cost, cmc, text, colors, ci: colors, qty: 1, board: 'main', power: '', toughness: ''}, extra || {});
const ASH = "Elemental permanent spells you cast from your hand have evoke {4}.\nWhenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of the next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.";
const simple = (landName, landType, landText, spell) => ({id: 'd-' + landName, name: landName, format: 'commander', created: 1, updated: 1, commanders: [],
  cards: [c(landName, landType, '', 0, landText, [], {qty: 38}), Object.assign(spell, {qty: 61})]});
const bear = c('Blue Bear', 'Creature — Bear', '{U}{U}', 2, '', ['U'], {power: '2', toughness: '2'});
const ashDeck = extra => ({id: 'dAsh', name: 'Ashling', format: 'commander', created: 1, updated: 1,
  commanders: [c('Ashling, the Limitless', 'Legendary Creature — Elemental Sorcerer', '{2}{R}', 3, ASH, ['R'], {ci: ['W', 'U', 'B', 'R', 'G'], power: '3', toughness: '3'})],
  cards: [c('Prismatic Vista', 'Land', '', 0, '{T}: Add one mana of any color.', [], {qty: 38}),
    c('Rock Elemental', 'Creature — Elemental', '{3}{G}{G}', 5, 'When this creature enters, draw a card.', ['G'], {power: '4', toughness: '4', qty: 30}),
    c('Opt', 'Instant', '{U}', 1, 'Scry 1.\nDraw a card.', ['U'], {qty: 31 - extra.reduce((s, x) => s + x.qty, 0)})].concat(extra)});
const altar = c("Ashnod's Altar", 'Artifact', '{3}', 3, 'Sacrifice a creature: Add {C}{C}.', [], {qty: 4});
const dud = c('Dud Artifact', 'Artifact', '{3}', 3, '', [], {qty: 4});
const library = c('Arcane Library', 'Artifact', '{2}', 2, '{2}, {T}: Draw a card.', [], {qty: 4});

module.exports = async function () {
  console.log('Deck test realism');
  const { browser, page } = await openApp();
  const run = (d, extra) => page.evaluate(([d, extra]) => {
    const S = simSeeded(99, () => simulateDeck(d, Object.assign({bracket: 3, speed: 'strong', style: 'balanced', games: 400}, extra || {})));
    const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
    return {wins: S.wins, gold: med(S.goldTurns), stuck: S.colorStuck, tapped: S.comp.tapped, sacs: S.outletSacs, abil: S.abilities, games: S.games, copies: S.copies};
  }, [d, extra]);

  const blueOnForests = await run(simple('Forest', 'Basic Land — Forest', '({T}: Add {G}.)', bear));
  const blueOnIslands = await run(simple('Island', 'Basic Land — Island', '({T}: Add {U}.)', bear));
  check('blue spells can\'t be cast off Forests (colours count)', blueOnForests.wins < blueOnIslands.wins / 4 && blueOnForests.stuck > blueOnIslands.stuck, [blueOnForests, blueOnIslands]);
  const tappedIsles = await run(simple('Tapped Isle', 'Land — Island', 'Tapped Isle enters tapped.\n{T}: Add {U}.', bear));
  check(`lands that enter tapped make the deck slower (${tappedIsles.wins} wins vs ${blueOnIslands.wins} of 400)`, tappedIsles.wins < blueOnIslands.wins * 0.85 && tappedIsles.tapped === 38, [tappedIsles, blueOnIslands]);

  const withDud = await run(ashDeck([dud]));
  const withAltar = await run(ashDeck([altar]));
  check('Ashnod\'s Altar is used: Elementals and copies are sacrificed to it for mana', withAltar.sacs > 0, withAltar);
  check(`the Altar's mana gets more Elementals evoked and copied than a do-nothing card in its place (${withAltar.copies} vs ${withDud.copies} copies)`, withAltar.copies > withDud.copies * 1.1, [withAltar, withDud]);
  check(`…and wins at least as often (${withAltar.wins} vs ${withDud.wins} of 400)`, withAltar.wins >= withDud.wins * 0.95, [withAltar, withDud]);
  const withLibrary = await run(ashDeck([library]));
  check('activated abilities like "{2}, {T}: Draw a card" are used', withLibrary.abil > 0, withLibrary);

  // Your table: 10 logged games with the deck, 6 won, usually over on turn 9
  const cal = await page.evaluate(d => {
    decks.push(d); games.length = 0;
    for (let i = 0; i < 10; i++) games.push({date: i, players: [{name: 'You', deckId: d.id}, {name: 'A'}, {name: 'B'}, {name: 'C'}], winner: i < 6 ? 0 : 1 + (i % 3), turns: 8 + (i % 3)});
    const T = tableGames(d), C = calibrateTable(d, 'balanced');
    const S = simSeeded(5, () => simulateDeck(d, {bracket: 'table', style: 'balanced', games: 1000, noGold: true}));
    return {n: T.n, rate: T.rate, turn: C && C.turn, sim: S.wins / S.games};
  }, ashDeck([]));
  check(`tuned to your table: the test wins about as often as your real games (${Math.round(cal.sim * 100)}% vs ${Math.round(cal.rate * 100)}% real)`, cal.n === 10 && Math.abs(cal.sim - cal.rate) <= 0.08, cal);

  // the screen: "Your table" needs 5 games, then tunes and says so
  const ui = await page.evaluate(async () => {
    const d = decks[decks.length - 1]; prefs.deckView = d.id; prefs.simOpts = {bracket: 'table', style: 'balanced'}; savePrefs();
    showPage('builder'); document.querySelector('[data-dtab="test"]').click(); renderSim();
    const opt = [...document.querySelectorAll('#simBracket option')].map(o => o.textContent).find(t => /Your table/.test(t));
    document.getElementById('simRun').click();
    for (let i = 0; i < 300 && !(simState && simState.S); i++) await new Promise(r => setTimeout(r, 100));
    return {opt, title: (document.querySelector('.sim-title') || {}).textContent || ''};
  });
  check('the opponent list offers "Your table" with the number of logged games', /Your table \(10 logged games\)/.test(ui.opt || ''), ui.opt);
  check('the results say they\'re tuned to your table', /tuned to your 10 logged games \(you won 60%/.test(ui.title), ui.title);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
