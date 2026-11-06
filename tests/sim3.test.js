// Combat, Treasures, Clues, tutors, recursion, and one of your decks as the opponent.
const { openApp, check } = require('./helpers');
const c = (name, type, cost, cmc, text, colors, extra) => Object.assign({name, type, cost, cmc, text, colors, ci: colors, qty: 1, board: 'main', power: '', toughness: ''}, extra || {});
const forest = q => c('Forest', 'Basic Land — Forest', '', 0, '({T}: Add {G}.)', [], {qty: q});
const mk = (id, cards, cmd, format) => ({id, name: id, format: format || 'commander', created: 1, updated: 1, commanders: cmd || [], cards});
const beasts = (text, extra) => mk('beasts-' + text, [forest(38), c('Beast', 'Creature — Beast', '{2}{G}', 3, text, ['G'], Object.assign({power: '3', toughness: '3', qty: 61}, extra || {}))]);

module.exports = async function () {
  console.log('Combat, resources, tutors, opponents');
  const { browser, page } = await openApp();
  const run = (d, extra) => page.evaluate(([d, extra]) => {
    const S = simSeeded(31, () => simulateDeck(d, Object.assign({bracket: 3, speed: 'strong', style: 'balanced', games: 400, noGold: true}, extra || {})));
    return {wins: S.wins, blocked: S.blocked, attackers: S.attackers, died: S.died, cmdWins: S.cmdWins, poisonWins: S.poisonWins, treasures: S.treasures, tutors: S.tutors, rec: S.recursions, opp: S.opp.name};
  }, [d, extra]);

  const ground = await run(beasts(''));
  const fliers = await run(beasts('Flying'));
  check(`fliers get past blockers more often than ground creatures (blocked ${Math.round(fliers.blocked / fliers.attackers * 100)}% vs ${Math.round(ground.blocked / ground.attackers * 100)}%)`, fliers.blocked / fliers.attackers < ground.blocked / ground.attackers * 0.6 && fliers.wins > ground.wins, [fliers, ground]);
  const tramplers = await run(beasts('Trample'));
  check(`trample wins more than the same creatures without it (${tramplers.wins} vs ${ground.wins} of 400)`, tramplers.wins > ground.wins, [tramplers, ground]);
  const unblock = await run(beasts("This creature can't be blocked."));
  check('"can\'t be blocked" is never blocked', unblock.blocked === 0 && unblock.attackers > 0, unblock);
  check('blocked creatures can die in combat', ground.died > 0, ground);
  const infect = await run(beasts('Infect'));
  check('infect wins by poison', infect.poisonWins > 0 && infect.poisonWins === infect.wins, infect);
  const voltron = await run(mk('voltron', [forest(40), c('Pebble', 'Artifact', '{1}', 1, '', [], {qty: 59})],
    [c('Big Commander', 'Legendary Creature — Giant', '{2}{G}', 3, "Big Commander can't be blocked.", ['G'], {power: '11', toughness: '11'})]));
  check('a big commander wins by commander damage (21) before 40 life is gone', voltron.cmdWins > 0, voltron);

  const treas = await run(mk('treasure', [forest(38), c('Treasure Goblin', 'Creature — Goblin', '{1}{G}', 2, 'When this creature enters, create a Treasure token.', ['G'], {power: '1', toughness: '1', qty: 30}),
    c('Big Beast', 'Creature — Beast', '{5}{G}', 6, '', ['G'], {power: '6', toughness: '6', qty: 31})]));
  check('Treasures are made and spent', treas.treasures > 0, treas);
  const tut = await run(mk('tutor', [forest(38), c('Demonic Tutor', 'Sorcery', '{1}{G}', 2, 'Search your library for a card, put that card into your hand, then shuffle.', ['G'], {qty: 10}),
    c('Beast', 'Creature — Beast', '{2}{G}', 3, '', ['G'], {power: '3', toughness: '3', qty: 51})]));
  check('tutors find cards', tut.tutors > 0, tut);
  const rec = await run(mk('recursion', [forest(38), c('Raise Dead', 'Sorcery', '{G}', 1, 'Return target creature card from your graveyard to your hand.', ['G'], {qty: 10}),
    c('Eternal Witness', 'Creature — Human Shaman', '{1}{G}{G}', 3, 'When Eternal Witness enters, return target card from your graveyard to your hand.', ['G'], {power: '2', toughness: '1', qty: 10}),
    c('Beast', 'Creature — Beast', '{2}{G}', 3, '', ['G'], {power: '3', toughness: '3', qty: 41})]));
  check('graveyard recursion brings cards back', rec.rec > 0, rec);

  // one of your decks as the opponent: a fast flying deck is a tougher opponent than a slow pile of lands
  const fast = mk('Fast Fliers', [forest(36), c('Angel', 'Creature — Angel', '{1}{G}', 2, 'Flying', ['G'], {power: '3', toughness: '3', qty: 63})]);
  const slow = mk('Slow Pile', [forest(60), c('Big Thing', 'Creature — Thing', '{7}{G}', 8, '', ['G'], {power: '4', toughness: '4', qty: 39})]);
  const vs = await page.evaluate(([fast, slow, me]) => {
    decks.push(fast, slow, me);
    const o1 = deckOpponent(fast, true), o2 = deckOpponent(slow, true);
    const play = id => simSeeded(8, () => simulateDeck(me, {bracket: 'deck:' + id, style: 'balanced', games: 400, noGold: true}));
    const a = play(fast.id), b = play(slow.id);
    prefs.deckView = me.id; showPage('builder'); document.querySelector('[data-dtab="test"]').click(); renderSim();
    const opts = [...document.querySelectorAll('#simBracket option')].map(o => o.textContent);
    return {fastWin: o1.win, slowWin: o2.win, fly: o1.creatures.every(x => x.fly), vsFast: a.wins, vsSlow: b.wins, name: a.opp.name, opts};
  }, [fast, slow, beasts('')]);
  check(`a saved deck becomes an opponent with its own speed (fast deck wins unopposed on turn ${vs.fastWin}, slow one on turn ${vs.slowWin})`, vs.fastWin < vs.slowWin, vs);
  check('its real creatures block (the fast deck\'s are all fliers)', vs.fly, vs);
  check(`the fast deck is the tougher opponent (you win ${vs.vsFast} vs ${vs.vsSlow} of 400)`, vs.vsFast < vs.vsSlow && vs.name === 'Fast Fliers', vs);
  check('your other decks are listed as opponents', vs.opts.includes('vs Fast Fliers') && vs.opts.includes('vs Slow Pile'), vs.opts);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
