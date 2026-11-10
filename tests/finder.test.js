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

    // triggers the finder now follows: the end step, "you may pay {N}. If you do", "if you control …", Saga chapters
    FW_TYPE = 'creature';
    const mtn = Object.assign(fwCard(card('Mountain', 'Basic Land — Mountain', '', 0, '')), {qty: 30});
    const engine = Object.assign(fwCard(card('Burn Engine', 'Enchantment', '{R}', 1, 'At the beginning of your end step, Burn Engine deals 5 damage to each opponent.', ['R'])), {qty: 30});
    out.endTrig = (engine.trigs || []).map(t => t.conds.map(k => k.ev).join()).join();
    const we = fwSearch(plan, [mtn, engine], [], {life: 10, maxT: 6, beam: 30, wide: 6, ms: 3000});
    out.endTurn = we && we.won.t; out.endLogged = !!we && we.log.some(l => l.kind === 'trigger' && l.why === 'endstep');
    const dawn = fwCard(card('Dawn of Hope', 'Enchantment', '{1}{W}', 2, 'Whenever you gain life, you may pay {2}. If you do, draw a card.\n{3}{W}: Create a 1/1 white Soldier creature token with lifelink.', ['W']));
    out.dawn = (dawn.trigs || []).map(t => ({ev: t.conds[0].ev, pay: t.payTxt, acts: t.acts.map(a => a.t)}));
    const geist = fwCard(card('Apothecary Geist', 'Creature — Spirit', '{3}{W}', 4, 'Flying\nWhen Apothecary Geist enters, if you control another Spirit, you gain 3 life.', ['W'], {power: '2', toughness: '3'}));
    out.geist = (geist.trigs || []).map(t => t.ctl);
    const saga = fwCard(card('History of Benalia', 'Enchantment — Saga', '{1}{W}{W}', 3, '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.', ['W']));
    out.saga = {chapters: saga.chapters, trigs: (saga.trigs || []).map(t => t.conds[0].ev + t.conds[0].n)};
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
  check('end-step triggers are read', r.endTrig === 'endstep', r.endTrig);
  check(`…and count: 5 damage each end step wins on turn ${r.endTurn}`, r.endTurn === 2 && r.endLogged, [r.endTurn, r.endLogged]);
  check('"you may pay {2}. If you do, draw" is kept, with its cost', JSON.stringify(r.dawn) === '[{"ev":"gainlife","pay":"{2}","acts":["draw"]}]', r.dawn);
  check('"if you control another Spirit" is kept and checked', JSON.stringify(r.geist) === '[{"ph":"spirit","n":1,"other":true}]', r.geist);
  check('Saga chapters are read (I, II, III)', r.saga.chapters === 3 && r.saga.trigs.join() === 'lore1,lore2,lore3', r.saga);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
