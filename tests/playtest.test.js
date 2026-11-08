// Playtest: card handling (searches, Risen Reef, Ashling's evoke), paying mana, and opponents with blocks and combat.
const { openApp, check } = require('./helpers');
const { ashlingDeck } = require('./fixtures/ashling-cards');

module.exports = async function () {
  console.log('Playtest');
  const { browser, page } = await openApp();
  await page.setViewportSize({width: 1440, height: 900});
  await page.evaluate(d => { localStorage.setItem('bsw-decks', JSON.stringify([d])); }, ashlingDeck());
  await page.reload(); await page.waitForTimeout(400);
  // a fresh table on turn 3 with nothing in hand; take(), put() and hand() move named cards about
  const fresh = (turn = 3) => page.evaluate(turn => {
    openPlaytest(decks[0]); PT.phase = 'play'; PT.turn = turn; PT.lib.push(...PT.hand.splice(0));
    window.take = n => { for (const z of ['lib', 'cmd', 'hand', 'grave']) { const i = PT[z].findIndex(c => c.name.startsWith(n)); if (i >= 0) return PT[z].splice(i, 1)[0]; } throw new Error('no ' + n); };
    window.put = n => { const c = take(n); [c.x, c.y] = ptPlace(c); c.since = 1; c.z = ++PT.z; PT.bf.push(c); return c; };
    window.hand = n => { const c = take(n); PT.hand.push(c); return c; };
    window.closeDrawer = () => { if (!document.getElementById('ptModal').hidden) ptCloseModal(); };
    ptRender();
  }, turn);

  // ---- card handling ----
  await fresh();
  const harb = await page.evaluate(() => {
    const c = hand('Flamekin Harbinger'); put('Mountain');
    ptCastPaid(c.uid);
    const a = trAbilities(c)[0].actions[0];
    return {what: a.what, to: a.to};
  });
  check('Flamekin Harbinger: its search looks for an Elemental and puts it on top', harb.what === 'elemental' && harb.to === 'top', harb);
  await page.waitForTimeout(200);
  await page.click('.pt-si-go'); await page.waitForTimeout(300);
  const shown = await page.evaluate(() => [...document.querySelectorAll('#ptModal .ptd-card b')].map(b => b.textContent));
  check('…the search shows only Elementals', shown.length > 3 && shown.every(n => !/Forest|Island|Mountain|Brushland|Sol Ring|Ritual/.test(n)), shown);
  const pickName = shown[0];
  await page.click('#ptModal .ptd-main'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({top: PT.lib[0].name, open: !document.getElementById('ptModal').hidden, log: PT.log.slice(0, 3)}));
  check('…and the card picked ends up on top after the shuffle', after.top === pickName && !after.open && /after shuffling/.test(after.log[0]) && /Shuffled/.test(after.log[1]), after);

  await fresh();
  const reef = await page.evaluate(() => {
    put('Ashling, the Limitless');
    // a nonland card on top: Risen Reef puts it into your hand
    const top = take('Impulsivity'); PT.lib.unshift(top);
    const r = hand('Risen Reef');
    ptDo(() => ptCastWay(r.uid, 'evoke'));
    return {hand: PT.hand.map(c => c.name), grave: PT.grave.map(c => c.name), bf: PT.bf.map(c => c.name + (c.token ? ' token' : '')), trig: PT.trig.map(t => t.text.slice(0, 60))};
  });
  check('Risen Reef: a nonland card on top goes into your hand', reef.hand.includes('Impulsivity'), reef);
  check('Ashling: the evoked creature is sacrificed by itself, and she makes a token copy of it', reef.grave.includes('Risen Reef') && reef.bf.includes('Risen Reef token'), reef);

  // ---- mana ----
  await fresh();
  const mana = await page.evaluate(() => {
    ['Forest', 'Forest', 'Island', 'Brushland', 'Ancient Ziggurat', 'Sol Ring', 'Birds of Paradise'].forEach(put);
    const out = {};
    const ritual = hand('Pyretic Ritual'), titan = hand('Titan of Industry'), wanderer = hand('Maelstrom');
    out.glow = (ptRender(), [...document.querySelectorAll('#ptHand .ptc.can-cast')].length);
    ptCastPaid(ritual.uid);
    out.tappedForRitual = PT.bf.filter(c => c.tapped).map(c => c.name).sort();
    out.pool = ptPoolTxt();
    ptCastPaid(wanderer.uid);
    out.poolAfter = ptPoolTxt();
    out.wandererOut = PT.bf.some(c => c.name.startsWith('Maelstrom'));
    out.paid = PT.log.find(l => /Paid for Maelstrom/.test(l)) || '';
    out.life = PT.life;
    return out;
  });
  check('cards you can afford glow in your hand', mana.glow === 3, mana);
  check('Pyretic Ritual is paid with Birds (the only red) and a Forest', JSON.stringify(mana.tappedForRitual) === JSON.stringify(['Birds of Paradise', 'Forest']), mana.tappedForRitual);
  check('…and its {R}{R}{R} goes into the mana pool', mana.pool === '{R}{R}{R}', mana.pool);
  check('Maelstrom Wanderer is paid using the pool first, then lands and Sol Ring', mana.wandererOut && /floating mana/.test(mana.paid) && /Sol Ring/.test(mana.paid) && mana.poolAfter === '', mana);
  check('no painland damage when it wasn\'t needed', mana.life === 40, mana.life);

  await fresh();
  const cant = await page.evaluate(() => {
    put('Forest');
    const t = hand('Titan of Industry');
    ptCastPaid(t.uid);
    return {modal: document.getElementById('ptModal').textContent, inHand: PT.hand.some(c => c.uid === t.uid)};
  });
  check('when you can\'t pay, it says what\'s missing and offers to cast it anyway', /missing/.test(cant.modal) && /Cast it anyway/.test(cant.modal) && cant.inHand, cant.modal.slice(0, 200));
  await page.click('#ptAnyway'); await page.waitForTimeout(200);
  check('…and Cast it anyway puts it on the table', await page.evaluate(() => PT.bf.some(c => c.name === 'Titan of Industry')));

  await fresh();
  const tax = await page.evaluate(() => {
    ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest'].forEach(put);
    const ash = PT.cmd[0]; PT.tax[ash.uid] = 1;   // cast once already
    const cost = ptCastCost(ash, 'cmd'), plan = ptPlan(cost, ash);
    ptCastPaid(ash.uid);
    return {cost, tapped: plan.tap.length, onBf: PT.bf.some(c => c.uid === ash.uid)};
  });
  check('commander tax is added to the cost ({2}{R} + {2})', tax.cost === '{2}{R}{2}' && tax.tapped === 5 && tax.onBf, tax);

  await fresh();
  const land = await page.evaluate(() => {
    const a = hand('Forest'), b = hand('Island');
    ptCastPaid(a.uid);
    ptCastPaid(b.uid);
    return {modal: document.getElementById('ptModal').textContent, second: PT.hand.some(c => c.uid === b.uid)};
  });
  check('a second land in one turn asks first', /already played a land/.test(land.modal) && land.second, land.modal.slice(0, 120));
  await page.evaluate(() => closeDrawer());

  await fresh();
  const tap = await page.evaluate(() => {
    const f = put('Forest'); ptDo(() => ptTapPick(f.uid));
    const pool1 = ptPoolTxt(); const g = hand('Flamekin Harbinger'); hand('Birds of Paradise');
    const harbPlan = ptPlan('{R}', g);
    ptDo(() => ptTapPick(f.uid));
    return {pool1, pool2: ptPoolTxt(), tapped: f.tapped, missing: harbPlan.missing};
  });
  check('tapping a land by hand puts its mana in the pool, untapping takes it back out', tap.pool1 === '{G}' && tap.pool2 === '' && !tap.tapped, tap);

  await fresh();
  const pips = await page.evaluate(() => {
    ['Forest', 'Island', 'Sol Ring', 'Birds of Paradise', 'Brushland', 'Ancient Ziggurat'].forEach(n => { const c = put(n); ptDo(() => ptTapPick(c.uid)); });
    ptRender();
    return [...document.querySelectorAll('#ptTop .pt-pool .mana-pip')].map(e => e.className.replace('mana-pip', '').replace(/\bnew\b/, '').trim() + (e.style.background ? ' split' : ''));
  });
  check('the mana pool shows coloured mana symbols (green, blue, colourless, split and any-colour ones)', pips.includes('G') && pips.includes('U') && pips.filter(x => x === 'C').length === 2 && pips.filter(x => /multi/.test(x)).length === 3 && pips.some(x => /only/.test(x)), pips);

  await fresh();
  const x = await page.evaluate(() => {
    ['Forest', 'Forest', 'Forest', 'Island'].forEach(put);
    const c = {uid: 999, name: 'Test X', type: 'Sorcery', cost: '{X}{G}', text: '', colors: ['G']};
    let max = 0; for (let k = 1; k < 10; k++) { if (ptPlan(c.cost, c, {x: k}).missing) break; max = k; }
    const conv = {uid: 998, name: 'Test Convoke', type: 'Instant', cost: '{3}{G}', text: 'Convoke', colors: ['G']};
    PT.bf.forEach(l => { l.tapped = true; });
    put('Birds of Paradise').tapped = true; const tok = ptMakeCard({name: 'Elf', type: 'Token Creature — Elf', power: '1', toughness: '1', colors: ['G']}, {token: true}); [tok.x, tok.y] = ptPlace(tok); PT.bf.push(tok);
    const t2 = ptMakeCard({name: 'Bear', type: 'Token Creature — Bear', power: '2', toughness: '2', colors: ['G']}, {token: true}); [t2.x, t2.y] = ptPlace(t2); PT.bf.push(t2);
    const t3 = ptMakeCard({name: 'Bird', type: 'Token Creature — Bird', power: '1', toughness: '1', colors: ['W']}, {token: true}); [t3.x, t3.y] = ptPlace(t3); PT.bf.push(t3);
    const t4 = ptMakeCard({name: 'Spirit', type: 'Token Creature — Spirit', power: '1', toughness: '1', colors: ['W']}, {token: true}); [t4.x, t4.y] = ptPlace(t4); PT.bf.push(t4);
    const p = ptPlan(conv.cost, conv);
    return {max, convoke: p.missing ? 'missing ' + p.missing : p.convoke.length};
  });
  check('X spells: it works out the biggest X you can pay', x.max === 3, x);
  check('convoke: untapped creatures help pay (a green one for {G})', x.convoke === 4, x);

  // ---- opponents ----
  await fresh(5);
  const opps = await page.evaluate(() => ({n: PT.opps.length, life: PT.opps.map(o => o.life), strip: document.querySelectorAll('#ptOpps .pt-opp').length}));
  check('a Commander game has 3 opponents at 40', opps.n === 3 && opps.life.every(l => l === 40) && opps.strip === 3, opps);
  const each = await page.evaluate(() => {
    ptHitOpp(3, 'test', 'each'); const a = PT.opps.map(o => o.life);
    PT.oppT = 1; ptHitOpp(5, 'test'); const b = PT.opps.map(o => o.life);
    const drain = trActions('each opponent loses 2 life and you gain life equal to the life lost this way.', 'X');
    ptDo(() => ptResolve({srcUid: null, srcName: 'Drain', actions: drain}));
    return {a, b, c: PT.opps.map(o => o.life), life: PT.life};
  });
  check('"each opponent" hits all of them', each.a.join() === '37,37,37', each);
  check('"target opponent" hits the one you aim at', each.b.join() === '37,32,37', each);
  check('a drain takes from each opponent and gains what they lost', each.c.join() === '35,30,35' && each.life === 46, each);

  // blocks
  await fresh(5);
  const blk = await page.evaluate(() => {
    const titan = put('Titan of Industry'), ash = put('Ashling, the Limitless'), animar = put('Animar'), twin = put('Twinflame');
    const o = PT.opps[0];
    o.board.push(ptOppCre({name: 'Wall', power: 0, toughness: 4, text: 'Defender'}), ptOppCre({name: 'Drake', power: 3, toughness: 3, text: 'Flying'}));
    PT.atkOpp = {};
    const r = {};
    r.flyBlock = ptCanBlock(o.board[0], twin);   // the Wall can't block a flyer
    r.flyDrake = ptCanBlock(o.board[1], twin);
    const res = ptAutoBlocks([titan, ash, animar].map(c => ({c, opp: 0})));
    r.ashBlockedBy = (res[ash.uid] || []).map(u => o.board.find(b => b.uid === u).name);
    r.titanBlocked = !!res[titan.uid];
    // nearly dead: now they chump the Titan
    o.life = 7;
    const res2 = ptAutoBlocks([titan, ash, animar].map(c => ({c, opp: 0})));
    r.chump = (res2[titan.uid] || []).length > 0;
    return r;
  });
  check('a creature without flying or reach can\'t block a flyer', blk.flyBlock === false && blk.flyDrake === true, blk);
  check('opponents make good blocks (the Drake kills Ashling and lives)', blk.ashBlockedBy.join() === 'Drake', blk);
  check('…don\'t throw creatures away when they\'re safe', !blk.titanBlocked, blk);
  check('…but chump block when the damage would kill them', blk.chump, blk);

  await fresh(5);
  const dmg = await page.evaluate(() => {
    const out = {};
    const mk = (name, power, toughness, text, colors = ['G']) => { const c = ptMakeCard({name, type: 'Creature — Test', power: String(power), toughness: String(toughness), text, colors}); [c.x, c.y] = ptPlace(c); c.since = 1; PT.bf.push(c); return c; };
    const o = PT.opps[0];
    // first strike: the 2/2 first striker kills the 2/2 blocker before it can hit back
    const fs = mk('Striker', 2, 2, 'First strike'); const b1 = ptOppCre({name: 'Bear', power: 2, toughness: 2}); o.board.push(b1);
    // trample: 6/6 trampler blocked by a 2/2 → 4 through
    const tr = mk('Trampler', 6, 6, 'Trample'); const b2 = ptOppCre({name: 'Elf', power: 1, toughness: 2}); o.board.push(b2);
    // deathtouch: a 1/1 deathtoucher kills the 5/5 that blocks it
    const dt = mk('Snake', 1, 1, 'Deathtouch'); const b3 = ptOppCre({name: 'Ogre', power: 5, toughness: 5}); o.board.push(b3);
    PT.combat = [fs.uid, tr.uid, dt.uid]; PT.atkOpp = {[fs.uid]: 0, [tr.uid]: 0, [dt.uid]: 0};
    ptDo(() => ptCombatDamage({[fs.uid]: [b1.uid], [tr.uid]: [b2.uid], [dt.uid]: [b3.uid]}));
    out.board = o.board.map(b => b.name); out.life = o.life;
    out.mine = PT.bf.map(c => c.name); out.grave = PT.grave.map(c => c.name);
    return out;
  });
  check('first strike: the blocker dies before it can hit back', !dmg.board.includes('Bear') && dmg.mine.includes('Striker'), dmg);
  check('trample: the extra damage goes to the player', dmg.life === 36, dmg);
  check('deathtouch: one damage kills the blocker (and the 1/1 dies too)', !dmg.board.includes('Ogre') && dmg.grave.includes('Snake'), dmg);

  await fresh(5);
  const menace = await page.evaluate(() => {
    const c = ptMakeCard({name: 'Brute', type: 'Creature — Test', power: '3', toughness: '3', text: 'Menace', colors: ['R']}); [c.x, c.y] = ptPlace(c); c.since = 1; PT.bf.push(c);
    const o = PT.opps[0]; const b = ptOppCre({name: 'Wall', power: 0, toughness: 5}); o.board.push(b);
    PT.combat = [c.uid]; PT.atkOpp = {[c.uid]: 0};
    ptDo(() => ptCombatDamage({[c.uid]: [b.uid]}));
    return o.life;
  });
  check('menace: one blocker alone can\'t stop it', menace === 37, menace);

  // commander damage, and winning
  await fresh(5);
  const cmd = await page.evaluate(() => {
    const ash = put('Ashling, the Limitless'); ash.commander = true; ash.power = '21'; ash.toughness = '21';
    PT.combat = [ash.uid]; PT.atkOpp = {[ash.uid]: 2};
    ptDo(() => ptCombatDamage({}));
    const o = PT.opps[2];
    return {cmd: o.cmd[ash.uid], out: !!o.out, won: PT.won, live: ptLiveOpps().length, aimed: PT.opps.indexOf(ptOppT())};
  });
  check('commander damage is counted per opponent, and 21 knocks them out', cmd.cmd === 21 && cmd.out && cmd.live === 2 && !cmd.won, cmd);
  const win = await page.evaluate(() => { ptHitOpp(40, 'test', 'each'); return {won: PT.won, log: PT.log[0]}; });
  check('you win when every opponent is out', win.won === 5 && /win on turn 5/.test(win.log), win);

  // the attack window through the buttons, with blocks
  await fresh(5);
  await page.evaluate(() => { put('Titan of Industry'); PT.opps[1].board.push(ptOppCre({name: 'Spider', power: 2, toughness: 4, text: 'Reach'})); ptRender(); });
  await page.click('[data-pt=attack]'); await page.waitForTimeout(200);
  await page.click('[data-atkto]'); await page.waitForTimeout(100);   // switch to Opponent 2
  const tgt = await page.evaluate(() => document.querySelector('[data-atkto]').textContent);
  check('in the attack window you can switch who a creature attacks', /Opp 2/.test(tgt), tgt);
  await page.click('[data-atkgo]'); await page.waitForTimeout(300);
  for (let i = 0; i < 5; i++) { if (await page.$('[data-blkgo]')) break; const go = await page.$('.pt-si-go'); if (!go) break; await go.click(); await page.waitForTimeout(250); }
  const blocksOpen = !!(await page.$('[data-blkgo]'));
  check('after attacking, the blocks window opens when they have blockers', blocksOpen);
  if (blocksOpen) { await page.click('[data-blkgo]'); await page.waitForTimeout(200); }
  const res = await page.evaluate(() => PT.opps.map(o => o.life));
  check('…and the damage lands on the opponent it attacked', res[1] === 33 && res[0] === 40, res);

  // their boards can grow by themselves
  await fresh(4);
  const grow = await page.evaluate(() => {
    PT.opps.forEach(o => { o.mode = 'typical'; });
    const r = Math.random; Math.random = () => 0.1;
    for (let t = 0; t < 4; t++) ptNextTurn();
    Math.random = r;
    return PT.opps.map(o => o.board.length);
  });
  check('an opponent set to "grow like a typical deck" plays creatures each turn', grow.every(n => n >= 3), grow);

  // ---- more cards: removal on their creatures, sweepers, impulse draw, modal triggers, self-copy loops ----
  await fresh(5);
  const more = await page.evaluate(() => {
    const out = {};
    const spell = (name, type, cost, text, extra) => Object.assign({uid: 0, name, type, cost, text, colors: ['R'], cmc: 2, counters: {}}, extra || {});
    const cast = card => { const c = ptMakeCard(card); PT.hand.push(c); prefs.ptAutoMana = false; ptCastPaid(c.uid); prefs.ptAutoMana = true; for (let i = 0; i < 10 && PT.trig.length; i++) ptDoPrompt(PT.trig[0].id); return c; };
    prefs.ptAutoPick = true;
    const o0 = PT.opps[0], o1 = PT.opps[1];
    o0.board.push(ptOppCre({name: 'Bear', power: 2, toughness: 2}), ptOppCre({name: 'Dragon', power: 5, toughness: 5, text: 'Flying'}));
    o1.board.push(ptOppCre({name: 'Elf', power: 1, toughness: 1}));
    cast(spell('Murder', 'Instant', '{1}{B}{B}', 'Destroy target creature.'));
    out.murder = o0.board.map(b => b.name);
    cast(spell('Shock', 'Instant', '{R}', 'Shock deals 2 damage to any target.'));
    out.shockLife = o0.life;
    cast(spell('Fire Bolt', 'Sorcery', '{R}', 'Fire Bolt deals 2 damage to target creature.'));
    out.bolt = o0.board.map(b => b.name).concat(o1.board.map(b => b.name));
    o0.board.push(ptOppCre({name: 'Bear', power: 2, toughness: 2})); o1.board.push(ptOppCre({name: 'Ogre', power: 4, toughness: 4}));
    cast(spell('Pyroclasm', 'Sorcery', '{1}{R}', 'Pyroclasm deals 2 damage to each creature.'));
    out.sweep = o0.board.map(b => b.name).concat(o1.board.map(b => b.name));
    cast(spell('Light Up the Stage', 'Sorcery', '{2}{R}', 'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.'));
    out.impulse = PT.exile.filter(c => c.impulse === PT.turn + 1).length;
    return out;
  });
  check('removal hits an opponent\'s creature (Murder kills the biggest threat)', JSON.stringify(more.murder) === '["Bear"]', more);
  check('"any target" burn still goes to the opponent', more.shockLife === 38, more);
  check('damage to a creature kills one it can kill', !more.bolt.includes('Bear') || !more.bolt.includes('Elf'), more);
  check('sweepers hit the opponents\' creatures too (Pyroclasm kills 2/2s, not the 4/4)', JSON.stringify(more.sweep) === '["Ogre"]', more);
  check('impulse draw exiles cards you can play until the end of your next turn', more.impulse === 2, more);

  await fresh(5);
  const loops = await page.evaluate(() => {
    const out = {};
    prefs.ptAutoPick = true;
    const mk = (name, type, text, pt) => { const c = ptMakeCard({name, type, text, cost: '', colors: ['G'], power: pt[0], toughness: pt[1]}); PT.hand.push(c); prefs.ptAutoMana = false; ptCastPaid(c.uid); prefs.ptAutoMana = true; for (let i = 0; i < 20 && PT.trig.length; i++) { const p = PT.trig[0]; if (p.modes) ptPickMode(p.id, 0); else ptDoPrompt(p.id); if (PT.trig[0] === p) PT.trig.shift(); } return c; };
    mk('Gruff Triplets', 'Creature — Satyr Warrior', 'Trample\nWhen Gruff Triplets enters, if it isn\'t a token, create two tokens that are copies of it.', ['3', '3']);
    out.triplets = PT.bf.filter(c => c.name === 'Gruff Triplets').length;
    mk('Wingmantle Chaplain', 'Creature — Human Cleric', 'Defender\nWhen Wingmantle Chaplain enters, create a 1/1 white Bird creature token with flying for each creature with defender you control.\nWhenever another creature you control with defender enters, create a 1/1 white Bird creature token with flying.', ['0', '3']);
    out.birds = PT.bf.filter(c => c.name === 'Bird').length;
    const ab = trAbilities(ptMakeCard({name: 'Charm Beast', type: 'Creature — Beast', text: 'When Charm Beast enters, choose one —\n• Draw a card.\n• You gain 3 life.'}));
    out.modes = ab[0] && ab[0].modes ? ab[0].modes.map(m => m.actions.map(a => a.t).join()) : null;
    const fencer = trAbilities(ptMakeCard({name: 'A-Celebrity Fencer', type: 'Creature — Human Warrior', text: 'Whenever another creature you control enters, put a +1/+1 counter on Celebrity Fencer.'}));
    out.alchemy = fencer[0] && fencer[0].actions.map(a => a.t + ':' + a.on).join();
    const kr = {name: "K'rrik", cost: '{4}{B/P}{B/P}{B/P}', type: 'Creature', text: '', colors: ['B']};
    ['Forest', 'Forest', 'Island', 'Mountain'].forEach(put);
    const plan = ptPlan(kr.cost, kr); out.phyrexian = plan.missing ? 'missing' : plan.life;
    return out;
  });
  check('"if it isn\'t a token": Gruff Triplets makes two copies, and the copies don\'t copy again', loops.triplets === 3, loops);
  check('"another creature with defender": Bird tokens (no defender) don\'t set it off', loops.birds === 1, loops);
  check('"choose one —" triggered abilities offer their modes', JSON.stringify(loops.modes) === '["draw","life"]', loops);
  check('Alchemy cards (A-…) know their own name', loops.alchemy === 'counter:self', loops);
  check('Phyrexian mana can be paid with life', loops.phyrexian === 6, loops);

  // ---- cost reductions from your other cards ----
  await fresh(4);
  const red = await page.evaluate(() => {
    const out = {};
    const on = (name, type, text, extra) => { const c = ptMakeCard(Object.assign({name, type, text, cost: '{2}', colors: []}, extra || {})); [c.x, c.y] = ptPlace(c); c.since = 1; PT.bf.push(c); return c; };
    const avenger = PT.lib.find(c => c.name === 'Avenger of Zendikar') || PT.hand.find(c => c.name === 'Avenger of Zendikar');
    const horn = on("Herald's Horn", 'Artifact', 'As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library.');
    out.horn = ptCastCost(avenger, 'hand');
    on('Goblin Warchief', 'Creature — Goblin Warrior', 'Goblin spells you cast cost {1} less to cast.\nGoblins you control have haste.', {power: '2', toughness: '2'});
    out.warchiefNotGoblin = ptCastCost(avenger, 'hand');
    on('Hidden Reducer', 'Enchantment', 'Each creature spell you cast costs {1} less to cast.');
    out.each = ptCastCost(avenger, 'hand');
    const animar = on('Animar, Soul of Elements', 'Legendary Creature — Elemental', 'Protection from white and from black\nWhenever you cast a creature spell, put a +1/+1 counter on Animar, Soul of Elements.\nCreature spells you cast cost {1} less to cast for each +1/+1 counter on Animar, Soul of Elements.', {power: '1', toughness: '1'});
    animar.counters = {p1p1: 2};
    out.animar = ptCastCost(avenger, 'hand');
    horn.chosenType = 'goblin';
    out.changed = ptCastCost(avenger, 'hand');
    const ash = PT.cmd[0]; PT.tax[ash.uid] = 1;
    out.tax = ptCastCost(ash, 'cmd');
    ['Forest', 'Forest', 'Forest', 'Forest'].forEach(n => { const c = PT.lib.find(x => x.name === n); if (c) { PT.lib.splice(PT.lib.indexOf(c), 1); [c.x, c.y] = ptPlace(c); PT.bf.push(c); } });
    for (const z of ['lib', 'hand']) { const i = PT[z].indexOf(avenger); if (i >= 0) PT[z].splice(i, 1); } PT.hand.push(avenger);
    ptRender(); out.glow = !!document.querySelector(`#ptHand .ptc.can-cast[data-uid="${avenger.uid}"]`);
    ptCastPaid(avenger.uid); out.paid = PT.log.find(l => /Paid for Avenger/.test(l)) || '';
    return out;
  });
  check('Herald\'s Horn takes {1} off your chosen type (Elemental)', red.horn === '{4}{G}{G}', red);
  check('Goblin Warchief doesn\'t help a non-Goblin', red.warchiefNotGoblin === '{4}{G}{G}', red);
  check('"Each creature spell you cast costs {1} less" counts too', red.each === '{3}{G}{G}', red);
  check('Animar takes {1} off per +1/+1 counter on it', red.animar === '{1}{G}{G}', red);
  check('changing the chosen type changes what it helps', red.changed === '{2}{G}{G}', red);
  check('reductions apply after commander tax ({2}{R} + {2} tax − 3)', red.tax === '{1}{R}', red);
  check('reduced spells glow when you can now afford them, and the log says what reduced the cost', red.glow && /cost reduced by/.test(red.paid) && /Animar/.test(red.paid), red);

  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
