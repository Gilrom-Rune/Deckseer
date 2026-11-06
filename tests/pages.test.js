// Every page and deck section opens without errors (offline: Scryfall and the CDNs are unreachable).
const { openApp, check } = require('./helpers');

const c = (name, type, cost, cmc, text, colors, extra) => Object.assign({name, type, cost, cmc, text, colors, ci: colors, qty: 1, board: 'main', power: '', toughness: ''}, extra || {});
const DECK = {
  id: 'dTest', name: 'Test Elementals', format: 'commander', created: 1, updated: 1, fwType: '',
  commanders: [c('Omnath, Locus of Creation', 'Legendary Creature — Elemental', '{R}{G}{W}{U}', 4, 'When Omnath enters, draw a card.\nLandfall — Whenever a land you control enters, you gain 4 life if this is the first time this ability has resolved this turn.', ['R', 'G', 'W', 'U'], {power: '4', toughness: '4', qty: 1})],
  cards: [
    c('Forest', 'Basic Land — Forest', '', 0, '({T}: Add {G}.)', [], {qty: 12}),
    c('Island', 'Basic Land — Island', '', 0, '({T}: Add {U}.)', [], {qty: 8}),
    c('Mountain', 'Basic Land — Mountain', '', 0, '({T}: Add {R}.)', [], {qty: 8}),
    c('Plains', 'Basic Land — Plains', '', 0, '({T}: Add {W}.)', [], {qty: 6}),
    c('Command Tower', 'Land', '', 0, "{T}: Add one mana of any color in your commander's color identity.", []),
    c('Cavern of Souls', 'Land', '', 0, "As Cavern of Souls enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.", []),
    c('Arcane Signet', 'Artifact', '{2}', 2, "{T}: Add one mana of any color in your commander's color identity.", []),
    c('Sol Ring', 'Artifact', '{1}', 1, '{T}: Add {C}{C}.', []),
    c('Risen Reef', 'Creature — Elemental', '{1}{G}{U}', 3, 'Whenever Risen Reef or another Elemental you control enters, look at the top card of your library. If it\'s a land card, you may put it onto the battlefield tapped. If you don\'t put the card onto the battlefield, you may put it into your hand.', ['G', 'U'], {power: '1', toughness: '1'}),
    c('Llanowar Elves', 'Creature — Elf Druid', '{G}', 1, '{T}: Add {G}.', ['G'], {power: '1', toughness: '1'}),
    c('Chord of Calling', 'Instant', '{X}{G}{G}{G}', 3, 'Convoke\nSearch your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.', ['G']),
    c('Avenger of Zendikar', 'Creature — Elemental', '{5}{G}{G}', 7, 'When Avenger of Zendikar enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.', ['G'], {power: '5', toughness: '5'}),
    c('Craterhoof Behemoth', 'Creature — Beast', '{5}{G}{G}{G}', 8, 'Haste\nWhen Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.', ['G'], {power: '5', toughness: '5'}),
    c('Lightning Bolt', 'Instant', '{R}', 1, 'Lightning Bolt deals 3 damage to any target.', ['R'])
  ]
};

module.exports = async function () {
  console.log('Every page opens');
  const { browser, page } = await openApp();
  await page.evaluate(d => { localStorage.setItem('bsw-decks', JSON.stringify([d])); const p = JSON.parse(localStorage.getItem('bsw-prefs') || '{}'); p.deckView = d.id; localStorage.setItem('bsw-prefs', JSON.stringify(p)); }, DECK);
  await page.reload(); await page.waitForTimeout(500);
  const pages = await page.evaluate(() => Object.keys(PAGES));
  for (const p of pages) {
    const before = page.errors.length;
    await page.evaluate(p => showPage(p), p); await page.waitForTimeout(250);
    check(`page "${p}" opens`, page.errors.length === before, page.errors.slice(before));
  }
  await page.evaluate(() => showPage('builder')).catch(() => {});
  for (const tab of ['cards', 'check', 'test', 'combos', 'export']) {
    const before = page.errors.length;
    const ok = await page.evaluate(t => { const b = document.querySelector(`[data-dtab="${t}"]`); if (!b) return false; b.click(); return true; }, tab);
    await page.waitForTimeout(400);
    check(`deck section "${tab}" opens`, ok && page.errors.length === before, page.errors.slice(before));
  }
  for (const tab of ['cards', 'wish']) {
    const before = page.errors.length;
    await page.evaluate(t => { showPage('collection'); document.querySelector(`[data-ctab="${t}"]`).click(); }, tab); await page.waitForTimeout(200);
    check(`collection section "${tab}" opens`, page.errors.length === before, page.errors.slice(before));
  }
  // The finder's card report reads the test deck without errors and explains the new rules.
  const audit = await page.evaluate(d => { const html = fwAuditHtml(deckById(d)); const div = document.createElement('div'); div.innerHTML = html; return div.textContent; }, DECK.id);
  check('card report: Command Tower makes the commander\'s colours', /Command Tower[\s\S]{0,200}\{W\}\/\{U\}\/\{R\}\/\{G\}/.test(audit), audit.slice(audit.indexOf('Command Tower'), audit.indexOf('Command Tower') + 200));
  check('card report: Chord of Calling has convoke', /Chord of Calling[\s\S]{0,300}Convoke/.test(audit));
  // The whole fastest-win run on the test deck (damage plan only: the combo database can't download offline).
  const fw = await page.evaluate(async id => { const t0 = Date.now(); const r = await fastestWin(deckById(id)); return {ms: Date.now() - t0, r: JSON.stringify(r, (k, v) => k === 'log' || k === 'best' ? undefined : v).slice(0, 400), turn: (r.results || r || [])[0] && ((r.results || r)[0].turn)}; }, DECK.id);
  check(`fastest win runs on the test deck (turn ${fw.turn}, ${(fw.ms / 1000).toFixed(1)}s)`, fw.turn > 0 && fw.turn <= 10, fw);
  check('no page errors overall', page.errors.length === 0, page.errors);
  await browser.close();
};
