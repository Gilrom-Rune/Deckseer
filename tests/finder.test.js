// The fastest-win finder reads mana rules correctly: Arcane Signet / Command Tower, Cavern of Souls, convoke.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Fastest-win finder');
  const { browser, page } = await openApp();
  const r = await page.evaluate(() => {
    const out = {};
    const card = (name, type, cost, cmc, text, colors, extra) => Object.assign({name, type, cost, cmc, text, colors: colors || [], ci: colors || [], qty: 1, board: 'main'}, extra || {});
    const signet = card('Arcane Signet', 'Artifact', '{2}', 2, "{T}: Add one mana of any color in your commander's color identity.");
    const tower = card('Command Tower', 'Land', '', 0, "{T}: Add one mana of any color in your commander's color identity.");
    const deckWith = (ci, format) => ({format: format || 'commander', commanders: ci == null ? [] : [card('Cmdr', 'Legendary Creature — Elemental', '', 3, '', ci, {ci})], cards: []});
    FW_CI = fwIdentity(deckWith(['R', 'G'])); out.signetRG = fwCard(signet).rock; out.towerRG = fwCard(tower).units;
    FW_CI = fwIdentity(deckWith([])); out.signetC = fwCard(signet).rock || null; out.towerC = fwCard(tower).units;
    FW_CI = fwIdentity(deckWith(null, 'standard')); out.towerNone = fwCard(tower).units;
    FW_CI = null;

    // Cavern of Souls with Elemental chosen
    FW_TYPE = 'elemental';
    const cav = fwCard(card('Cavern of Souls', 'Land', '', 0, "As Cavern of Souls enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered."));
    out.cavUnits = cav.units;
    const ele = fwCard(card('Risen Reef', 'Creature — Elemental', '{1}{G}{U}', 3, 'x', ['G', 'U']));
    const bear = fwCard(card('Grizzly Bears', 'Creature — Bear', '{1}{G}', 2, '', ['G']));
    const rock = fwCard(card('Mind Stone', 'Artifact', '{2}', 2, '{T}: Add {C}.'));
    const pool = u => [u + '#1', 'G#2'];
    out.cavPaysElementalColour = !!fwPay(['WUBRG!elemental?C$#1', 'G#2', 'C#3'], ele.pay, 0, ele);
    out.cavPaysGenericForOthers = !!fwPay(pool('WUBRG!elemental?C$'), bear.pay, 0, bear) && !!fwPay(['WUBRG!elemental?C$#1', 'C#2'], rock.pay, 0, rock);
    out.cavNoColourForOthers = !fwPay(['WUBRG!elemental?C$#1', 'C#2'], bear.pay, 0, bear);
    out.cavText = fwDescribe(cav).map(x => x[1]).join(' | ');
    out.carnage = fwCard(card('Carnage Tyrant', 'Creature — Dinosaur', '{4}{G}{G}', 6, "This spell can't be countered.\nTrample, hexproof", ['G'])).noCounter;

    // Convoke: a deck of Forests and 1-drops with a convoke finisher
    const forest = Object.assign(fwCard(card('Forest', 'Basic Land — Forest', '', 0, '')), {qty: 30});
    const elf = Object.assign(fwCard(card('Elvish Mystic Bear', 'Creature — Elf', '{G}', 1, '', ['G'], {power: '1'})), {qty: 30});
    const mk = convoke => fwCard(card('Big Finisher', 'Creature — Wurm', '{6}{G}{G}', 8, (convoke ? 'Convoke\n' : '') + 'Haste, trample', ['G'], {power: '20'}));
    const fin1 = mk(true), fin0 = mk(false);
    out.convokeRead = fin1.convoke && !fin0.convoke;
    const o = {life: 40, maxT: 10, beam: 60, wide: 10, ms: 4000};
    const plan = {kind: 'damage', label: 'Damage'};
    const w1 = fwSearch(plan, [forest, elf, fin1], [], o), w0 = fwSearch(plan, [forest, elf, fin0], [], o);
    out.turnWith = w1 && w1.won.t; out.turnWithout = w0 && w0.won.t;
    out.convokeLogged = !!w1 && w1.log.some(l => /convoke/.test((l.costs || []).join(' ') + ' ' + (l.how || '')));
    // a convoke creature tapped for the spell doesn't also attack that turn
    const line = w1 && w1.log.find(l => /convoke/.test(l.how || ''));
    out.convokeLine = line && {how: line.how, costs: line.costs, t: line.t};
    return out;
  });
  check('Arcane Signet makes only the commander\'s colours', JSON.stringify(r.signetRG) === '["RG"]', r.signetRG);
  check('Command Tower makes only the commander\'s colours', JSON.stringify(r.towerRG) === '["RG"]', r.towerRG);
  check('with a colourless commander they make nothing', !r.signetC && JSON.stringify(r.towerC) === '[]', [r.signetC, r.towerC]);
  check('without a commander they stay "any colour"', JSON.stringify(r.towerNone) === '["WUBRG"]', r.towerNone);
  check('Cavern of Souls: any colour for the chosen type, {C} otherwise, uncounterable', JSON.stringify(r.cavUnits) === '["WUBRG!elemental?C$"]', r.cavUnits);
  check('Cavern pays coloured costs of Elementals', r.cavPaysElementalColour);
  check('Cavern pays generic costs of anything', r.cavPaysGenericForOthers);
  check('Cavern can\'t pay coloured costs of non-Elementals', r.cavNoColourForOthers);
  check('the card report explains Cavern', /elemental spells only; \{C\} for anything else; those spells can't be countered/.test(r.cavText), r.cavText);
  check('"This spell can\'t be countered" is read', r.carnage === true);
  check('convoke is read', r.convokeRead);
  check(`convoke makes the win faster (turn ${r.turnWith} instead of ${r.turnWithout})`, r.turnWith && r.turnWithout && r.turnWith < r.turnWithout, [r.turnWith, r.turnWithout]);
  check('the turn table says which creatures convoked', r.convokeLogged, r.convokeLine);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
