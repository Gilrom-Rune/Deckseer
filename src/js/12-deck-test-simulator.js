/* ---------------- deck test: fast simulated games ----------------
   Your deck is played for real (shuffle, mulligans, lands, ramp, draw, commander, attacks, removal); each card's
   job is read from its rules text, and its rules with the fastest-win reader (fwCard): triggers (enters, landfall, dies,
   sacrifice, cast), token copies, evoke (its own or given, like Ashling's), Yarok/Twinflame doublers, cost reducers,
   extra land drops and cascade. The opponent is a model of a typical deck for the chosen bracket and style:
   it wins around that bracket's turn range and interacts with your board. Results are estimates, not a rules engine. */
const BRACKETS = {
  1: {name: "Exhibition", win: 11.5, sd: 2.0, min: 9, inter: 0.06, wipe: 0.03},
  2: {name: "Core", win: 10.5, sd: 1.8, min: 8, inter: 0.10, wipe: 0.05},
  3: {name: "Upgraded", win: 8.5, sd: 1.6, min: 6, inter: 0.16, wipe: 0.07},
  4: {name: "Optimized", win: 6.5, sd: 1.3, min: 4, inter: 0.24, wipe: 0.08},
  5: {name: "cEDH", win: 4.5, sd: 1.1, min: 2, inter: 0.35, wipe: 0.05}
};
const SPEEDS = {   // 60-card formats: no brackets, so pick how fast the opponent is
  casual: {name: "Casual", win: 8.5, sd: 1.6, min: 5, inter: 0.12, wipe: 0.04},
  strong: {name: "Strong", win: 6, sd: 1.1, min: 4, inter: 0.28, wipe: 0.06},
  competitive: {name: "Competitive", win: 4.5, sd: 0.9, min: 3, inter: 0.4, wipe: 0.06}
};
const STYLES = {
  aggressive: {name: "Aggressive", shift: -1.2, inter: 0.6, wipe: 0.5, block: 0.85, slowBy: 0.6},
  balanced: {name: "Balanced", shift: 0, inter: 1, wipe: 1, block: 0.7, slowBy: 0.45},
  defensive: {name: "Defensive", shift: 1.8, inter: 1.7, wipe: 2, block: 0.55, slowBy: 0.35}
};
const WORDNUM = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, x: 2};
// What a card does in a game, read from its type and rules text
function cardRole(c){
  const t = (c.text || "").toLowerCase().replace(/\(.*?\)/g, ""), type = mainType(c), cmc = c.cmc ?? 3;
  const r = {name: c.name, cmc, type, land: type === "Land", power: 0, mana: 0, dork: false, landRamp: 0, draw: 0, engine: 0, removal: false, counter: false, wipe: false, haste: /\bhaste\b/.test(t)};
  if (r.land) return r;
  const add = t.match(/\badd ((?:\{[^}]+\})+|one mana|two mana|three mana|an amount)/);
  if (add && cmc <= 4) { r.mana = add[1].startsWith("{") ? (add[1].match(/\{/g) || []).length : (WORDNUM[add[1].split(" ")[0]] || 1); r.dork = type === "Creature"; }
  const lr = t.match(/search your library for (up to (one|two|three) )?(a |an )?(basic )?(land|forest|plains|island|swamp|mountain)/);
  if (lr && /onto the battlefield/.test(t)) r.landRamp = /put one onto the battlefield/.test(t) ? 1 : (WORDNUM[lr[2]] || 1);
  const dm = t.match(/draws? (a|an|one|two|three|four|five|x|\d+) cards?/);
  if (dm) { const n = WORDNUM[dm[1]] || parseInt(dm[1]) || 1; if (/\b(whenever|at the beginning of)\b[^.]*draws? /.test(t)) r.engine = 0.5; else r.draw = n; }
  r.wipe = /\b(destroy|exile) all (creatures|nonland permanents|other creatures)|all creatures get -\d|deals? \d+ damage to each creature|each creature .*?(gets|deals)/.test(t);
  r.counter = /\bcounter target (spell|creature spell|noncreature spell)/.test(t);
  r.removal = !r.wipe && (r.counter || /\b(destroy|exile) target (creature|permanent|nonland permanent|artifact or creature|creature or planeswalker)|deals? (\d+|x) damage to (any target|target creature)|return target (creature|nonland permanent)[^.]*owner's hand|target (player|opponent) sacrifices a creature|fights? target creature/.test(t));
  if (type === "Creature" || /\bvehicle\b/.test((c.type || "").toLowerCase())) { const p = parseInt(c.power); r.power = isNaN(p) ? Math.max(1, Math.round(cmc)) : p; }
  return r;
}
function shuffle(a){ for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function gauss(){ let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
// Who you're playing against: a bracket or speed model, or "your table" (tuned to your logged games with this deck)
function simOpponent(d, opts){
  const isCmd = d.format === "commander", pick = isCmd ? opts.bracket : opts.speed;
  if (typeof pick === "string" && pick.startsWith("deck:")) { const od = deckById(pick.slice(5)); if (od) return deckOpponent(od, isCmd); }
  if ((isCmd ? opts.bracket : opts.speed) === "table") {
    const cal = d.simCal && d.simCal.opp;
    if (cal) return Object.assign({name: "your table"}, cal);
    return isCmd ? BRACKETS[3] : SPEEDS.strong;   // not calibrated yet: a middle opponent
  }
  return isCmd ? BRACKETS[opts.bracket] || BRACKETS[3] : SPEEDS[opts.speed] || SPEEDS.strong;
}
// One of your saved decks as the opponent: how fast it wins (its own unopposed games), how much removal and how many
// wipes it runs, and its real creatures as blockers. Remembered per deck version.
const deckOppCache = new Map();
function deckOpponent(od, isCmd){
  const key = od.id + "|" + JSON.stringify([od.commanders.map(c => c.name), od.cards.map(c => [c.name, c.qty, c.board])]);
  if (deckOppCache.has(key)) return deckOppCache.get(key);
  const S = simSeeded(4242, () => simulateDeck(od, {bracket: 3, speed: "strong", style: "balanced", games: 300, goldOnly: true}));
  const turns = S ? S.goldTurns.slice().sort((a, b) => a - b) : [];
  const mean = turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : 10;
  const sd = turns.length > 1 ? Math.sqrt(turns.reduce((s, t) => s + (t - mean) ** 2, 0) / turns.length) : 2;
  const main = od.cards.filter(c => c.board === "main"), n = main.reduce((s, c) => s + (c.qty || 1), 0) || 1;
  const roles = main.map(c => [cardRole(c), c.qty || 1]);
  const removal = roles.reduce((s, [r, q]) => s + (r.removal || r.counter ? q : 0), 0), wipes = roles.reduce((s, [r, q]) => s + (r.wipe ? q : 0), 0);
  const creatures = [];
  for (const c of main.concat(od.commanders)) if (/\bCreature\b/.test(c.type || "")) {
    const t = (c.text || "").toLowerCase(), kw = (() => { try { return ptKwPrinted({name: c.name, text: c.text || "", back: false}).map(k => k.key); } catch (e) { return []; } })();
    const p = parseInt(c.power), tg = parseInt(c.toughness);
    for (let i = 0; i < (c.qty || 1); i++) creatures.push({p: isNaN(p) ? 2 : p, t: isNaN(tg) ? 2 : tg, fly: kw.includes("flying"), reach: kw.includes("reach"), dt: kw.includes("deathtouch"), cmc: c.cmc ?? 3});
  }
  const o = {name: od.name, win: turns.length ? turns[Math.floor(turns.length / 2)] : 10, sd: Math.max(1, Math.min(2.5, sd)), min: Math.max(2, (turns[0] || 6)),
    // removal and wipes per card drawn, turned into a chance per turn (about one card a turn, a third of it aimed at you in a 4-player game)
    inter: Math.min(0.5, removal / n * (isCmd ? 1.2 : 2)), wipe: Math.min(0.2, wipes / n * (isCmd ? 1.5 : 2.5)), creatures: creatures.length ? creatures : null, crDensity: creatures.length / n};
  deckOppCache.set(key, o);
  return o;
}
// Your real games with this deck (from the Game tab)
function tableGames(d){
  const list = games.filter(g => g.players.some(p => p.deckId === d.id));
  const wins = list.filter(g => g.players[g.winner] && g.players[g.winner].deckId === d.id).length;
  const turns = list.map(g => g.turns).filter(t => t > 0).sort((a, b) => a - b);
  const pods = list.map(g => g.players.length);
  return {n: list.length, wins, rate: list.length ? wins / list.length : 0, turn: turns.length ? turns[Math.floor(turns.length / 2)] : null,
    sd: turns.length > 1 ? Math.sqrt(turns.reduce((s, t, _, a) => s + (t - a.reduce((x, y) => x + y, 0) / a.length) ** 2, 0) / turns.length) : 1.5,
    pod: pods.length ? Math.round(pods.reduce((a, b) => a + b, 0) / pods.length) : 4};
}
const TABLE_MIN_GAMES = 5;
// the same random numbers each run, so calibration doesn't wobble
function simSeeded(seed, fn){ const keep = Math.random; let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; try { return fn(); } finally { Math.random = keep; } }
// Tune the opponent so this deck wins in the simulation as often as it does at your table: games end around the turn yours
// do, and the opponent's speed is nudged until the win rates match. Kept on the deck (simCal) so later tests, and the
// Upgrades swap tests, all play against the same tuned table.
function calibrateTable(d, style){
  const T = tableGames(d); if (T.n < TABLE_MIN_GAMES) return null;
  const isCmd = d.format === "commander", base = isCmd ? BRACKETS[3] : SPEEDS.strong;
  const turn = T.turn || base.win, mk = shift => ({win: turn + shift, sd: Math.max(1, Math.min(2.5, T.sd)), min: Math.max(2, Math.round(turn - 3)), inter: base.inter, wipe: base.wipe});
  const target = Math.min(0.95, Math.max(0.03, T.rate));
  let lo = -6, hi = 6, best = 0;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const S = simSeeded(777 + i, () => simulateDeck(Object.assign({}, d, {simCal: {opp: mk(mid)}}), {bracket: "table", speed: "table", style, games: 500, noGold: true}));
    if (!S) return null;
    best = mid;
    if (S.wins / S.games < target) lo = mid; else hi = mid;
  }
  d.simCal = {opp: mk(best), n: T.n, wins: T.wins, rate: T.rate, turn, pod: T.pod, style, at: Date.now()};
  return d.simCal;
}
function simulateDeck(d, opts){
  const isCmd = d.format === "commander", life = isCmd ? 40 : 20, games = opts.games || 3000, MAXT = 16;
  const opp = simOpponent(d, opts), st = STYLES[opts.style] || STYLES.balanced;
  // Each card is read twice: its rough job (cardRole) and its rules (the fastest-win reader: mana with colours, lands that
  // enter tapped, triggers, evoke, copies, doublers, cost reducers, extra land drops, cascade, activated abilities).
  FW_TYPE = d.fwType || fwDeckType(d.cards.filter(c => c.board === "main").concat(d.commanders)); FW_CI = fwIdentity(d);
  const KEEP_ANY = fwCost({cost: "{W}{U}{B}{R}{G}", cmc: 0});
  const simCard = (c, cmd) => {
    const r = cardRole(c); let f = {};
    try { f = fwCard(c, cmd); } catch (e) { f = {}; }
    const type = (c.type || "").split(" // ")[0];
    const outlet = (f.acts || []).find(a => a.sac && !a.tap && !(a.pay.gen + a.pay.cols.length) && a.effs.length && a.effs.every(x => x.t === "mana"));
    if (outlet && !(f.rock || f.dork)) r.mana = 0;   // Ashnod's Altar makes mana only by sacrificing: it isn't a mana rock
    const t0 = (c.text || "").toLowerCase().replace(/\([^)]*\)/g, "");
    let kw = []; try { kw = ptKwPrinted({name: c.name, text: c.text || "", back: false}).map(k => k.key); } catch (e) { kw = []; }
    const tough = parseInt(c.toughness);
    // tutors ("search your library for a creature card, put it into your hand"; "… on top"), and the graveyard: regrowth and reanimation
    const tut = t0.match(/search your library for (?:a|an|up to one) ((?:[a-z]+ )*?)card[^.]*?(?:put (?:that card|it) into your hand|put (?:that card|it) on top|put (?:that card|it) onto the battlefield)/);
    const grows = !(f.trigs || []).some(tr => tr.acts.some(a => a.t === "fromGrave"));
    const regrow = grows && t0.match(/return (?:target|up to one target|a) ((?:[a-z]+ )*?)card from your graveyard to your hand/);
    const rean = grows && (t0.match(/(?:return|put) target ((?:[a-z]+ )*?)creature card from (?:a|your) graveyard (?:to|onto) the battlefield/) || (/return enchanted creature card to the battlefield/.test(t0) ? [0, ""] : null));
    Object.assign(r, {kw: {fly: kw.includes("flying"), trample: kw.includes("trample"), menace: kw.includes("menace"), dt: kw.includes("deathtouch"), ds: kw.includes("double strike"), infect: kw.includes("infect"),
      unblock: /(?:^|\n|\. )(?:cardname|this creature|[^.\n]*?) can't be blocked(?! except| by)/.test(t0.replace(new RegExp(trEsc(c.name.toLowerCase()), "g"), "cardname")) && !/creatures? (?:you control|target)/.test(t0)},
      tough: isNaN(tough) ? Math.max(1, r.power || 1) : tough,
      tutor: tut ? {ph: tut[1].trim(), top: /on top/.test(tut[0]), bf: /onto the battlefield/.test(tut[0])} : null,
      regrow: regrow ? {ph: regrow[1].trim()} : null, rean: rean ? {ph: (rean[1] || "").trim()} : null});
    if (tut && r.draw && !tut[0].includes("draw")) r.draw = 0;   // a tutor isn't a draw: it's handled as a tutor
    return Object.assign(r, {f, type, cols: f.cols || "C", changeling: !!f.changeling, perm: !/\b(Instant|Sorcery)\b/.test(type), creature: /\bCreature\b/.test(type),
      etbDraw: f.etbDraw ? (f.draw || 0) : 0, pay: f.pay || {cols: [], gen: r.cmc || 0}, legend: !!f.legend, artifact: !!f.artifact,
      landfall: (f.trigs || []).some(tr => tr.conds.some(k => k.ev === "etb" && /\bland\b/.test(String(k.phrase || "")))),
      outlet: outlet ? {ph: outlet.sac.ph, units: outlet.effs.flatMap(x => fwUnits(x.what))} : null,
      acts: (f.acts || []).filter(a => !a.sacSelf && !a.sac && !(a.effs || []).some(x => x.t === "mana") && a.effs.some(x => ["draw", "token", "opp", "counter", "searchAuto"].includes(x.t)))});
  };
  const library0 = []; for (const c of d.cards.filter(x => x.board === "main")) { const r = simCard(c, false); for (let i = 0; i < (c.qty || 1); i++) library0.push(r); }
  const cmdrs = d.commanders.map(c => simCard(c, true));
  // which colours the deck asks for (to fetch the right basic land)
  const demand = {}; for (const c of library0.concat(cmdrs)) for (const s0 of c.pay.cols || []) for (const k of String(s0).split("/")) if (/^[WUBRG]$/.test(k)) demand[k] = (demand[k] || 0) + 1;
  const S = {games, kept7: 0, mulls: 0, land3: 0, land4: 0, screw: 0, flood: 0, cmdTurns: [], manaAvail: Array(MAXT + 1).fill(0), manaUsed: Array(MAXT + 1).fill(0),
    wins: 0, losses: 0, long: 0, winTurn: Array(MAXT + 2).fill(0), lossTurn: Array(MAXT + 2).fill(0), goldTurns: [], evokes: 0, copies: 0, kept: 0, trigs: 0, colorStuck: 0, outletSacs: 0, abilities: 0,
    treasures: 0, tutors: 0, recursions: 0, blocked: 0, attackers: 0, died: 0, cmdWins: 0, poisonWins: 0};
  if (library0.length < 7) return null;
  const fits = (cond, ev, x, srcId) => {
    if (cond.ev !== ev) return false;
    const self = x.id === srcId;
    if (cond.who === "self") return self;
    if (cond.who === "other" && self) return false;
    if (cond.who === "selfOrOther" && self) return true;
    if (!["any", "other", "selfOrOther"].includes(cond.who)) return false;
    if (cond.nontoken && x.token) return false;
    if (cond.tokenOnly && !x.token) return false;
    return fwFits(String(cond.phrase || "").replace(/\bcardname\b/g, ""), x.c);
  };
  const addPays = (a, b) => ({cols: a.cols.concat(b.cols), gen: a.gen + b.gen});
  const run = (versus) => {
    const lib = shuffle(library0.slice());
    let hand, m = 0;
    for (;;) {
      shuffle(lib); hand = lib.slice(0, 7); const lands = hand.filter(c => c.land).length;
      if ((lands >= 2 && lands <= 5) || m >= 3) break;
      m++;
    }
    const bottom = Math.max(0, m - (isCmd ? 1 : 0));
    let deck = lib.slice(7);
    for (let i = 0; i < bottom; i++) {
      const lands = hand.filter(c => c.land);
      let idx = lands.length >= 4 ? hand.indexOf(lands[0]) : hand.reduce((bi, c, k) => (!c.land && (bi < 0 || c.cmc > hand[bi].cmc)) ? k : bi, -1);
      if (idx < 0) idx = 0; deck.push(hand.splice(idx, 1)[0]);
    }
    const onPlay = Math.random() < 0.5;
    let engines = 0, engineAcc = 0, oppLife = life, cmdIn = cmdrs.map(() => true), cmdCasts = cmdrs.map(() => 0), cmdTurn = 0;
    let perms = [], srcs = [], pool = [], nextId = 0, budget = 0, t = 0, keepNeed = 0;
    let grave = [], treasures = 0, clues = 0, poison = 0, cmdDmg = {}, oppBoard = [];
    let oppWin = versus ? Math.max(opp.min, opp.win + st.shift + gauss() * opp.sd) : 99, delay = 0;
    const landCount = () => perms.reduce((s, p) => s + (p.c.land ? 1 : 0), 0);
    const draw = n => { for (let k = 0; k < n && deck.length; k++) hand.push(deck.shift()); };
    const hasteFor = x => perms.some(p => p.c.f.giveHaste && p.c.f.giveHaste.some(g => !(g.other && p.id === x.id) && fwFits(g.ph, x.c)));
    // mana: every source's units, tagged by where they came from; lands and rocks "#id", creatures "@id", floating "~="
    const live = u => u === "LEG" ? [...new Set(perms.filter(p => p.c.legend).map(p => p.c.cols).join("").replace(/C/g, ""))].join("") || null : u === "OPAL" ? (perms.filter(p => p.c.artifact).length >= 3 ? "WUBRG" : null) : u;
    const tag = (units, src) => units.map(live).filter(Boolean).map(u => u + (src.cre ? "@" : "#") + src.id);
    const addSource = (x, units, cre, now) => { if (!units || !units.length) return; const s = {id: x.id, units, cre}; srcs.push(s); if (now) pool.push(...tag(units, s)); };
    const float = units => pool.push(...units.map(u => u + "~=f"));
    // the colour of basic land a "search for a basic land" card fetches: one the deck needs and doesn't make yet
    const basicFor = () => {
      const have = new Set(pool.concat(srcs.flatMap(s => s.units)).join("").replace(/[^WUBRG]/g, ""));
      const want = Object.keys(demand).sort((a, b) => demand[b] - demand[a]);
      return want.find(k => !have.has(k)) || want[0] || "C";
    };
    const putLand = (l, tapped) => { const x = enter(l, {}); addSource(x, l.f.units && l.f.units.length ? l.f.units : ["C"], false, !tapped && !l.f.tapped); return x; };
    const fetchBasic = tapped => { const k = basicFor(); const li = deck.findIndex(q => q.land && /\bBasic\b/.test(q.type)); if (li >= 0) deck.splice(li, 1); const b = {name: "Basic land", type: "Basic Land", land: true, f: {units: [k]}, cols: "C"}; putLand(b, tapped); };
    // the card a tutor or recursion picks: the one that does the most for this deck, preferring what you can cast soon
    const worth = c => (c.creature ? (c.power || 0) / 2 : 0) + (c.etbDraw || 0) + (c.f.trigs ? 2 : 0) + (c.outlet ? 3 : 0) + (c.f.dbl ? 3 : 0) + (c.f.grantEvoke ? 3 : 0) + (c.mana ? 2 : 0) + (c.draw || 0) * 0.7
      - (c.cmc > srcs.length + 2 ? 1.5 : 0);
    const bestOf = (list, ph, creatureOnly) => { let bi = -1, bv = -1e9; list.forEach((c, i) => { if (c.land || (creatureOnly && !c.creature) || (ph && !fwFits(ph, c))) return; const v = worth(c); if (v > bv) { bv = v; bi = i; } }); return bi; };
    const tutor = tu => { const i = bestOf(deck, tu.ph.replace(/\b(a|an)\b/g, "").trim(), /creature/.test(tu.ph)); if (i < 0) return; const c = deck.splice(i, 1)[0]; S.tutors++; if (tu.bf && c.perm) enter(c, {}); else if (tu.top) deck.unshift(c); else hand.push(c); };
    const regrow = ph => { const i = bestOf(grave, ph, /creature/.test(ph || "")); if (i < 0) return; S.recursions++; hand.push(grave.splice(i, 1)[0]); };
    const reanimate = ph => { const i = bestOf(grave, ph, true); if (i < 0) return; S.recursions++; enter(grave.splice(i, 1)[0], {}); };
    const act = (a, src, x, tr, k) => {
      switch (a.t) {
        case "draw": draw(a.n || 1); break;
        case "opp": if (!a.x) oppLife -= a.n || 0; break;
        case "topif": {
          const top = deck[0]; if (!top) break;
          if (top.land && /bf/.test(a.yes || "")) { deck.shift(); putLand(top, /tapped/i.test(a.yes || "")); } else if (/hand/.test(a.no || "") || /hand/.test(a.yes || "")) draw(1);
          break;
        }
        case "searchAuto": if (/land/.test(a.phrase || "") && a.to === "bf") for (let i = 0; i < (a.n || 1); i++) { const li = deck.findIndex(c => c.land); if (li < 0) break; putLand(deck.splice(li, 1)[0], a.tapped); } break;
        case "fromGrave": if (/hand/.test(a.to || "")) regrow(""); else reanimate(""); break;
        case "token": {
          const def = a.def || {}, p = parseInt(def.power) || 0;
          const n = a.each ? (/\bland/.test(a.each) ? landCount() : perms.filter(q => fwFits(a.each, q.c)).length) : (a.x ? 2 : a.n || 1);   // "X" tokens: counted as 2
          if (/^treasure$/i.test(def.name || "")) { treasures += n; S.treasures += n; for (let i = 0; i < n; i++) pool.push("WUBRG~T"); break; }
          if (/^clue$/i.test(def.name || "")) { clues += n; break; }
          if (/^(food|blood|map|gold|powerstone)$/i.test(def.name || "")) break;
          const tc = {name: def.name || "Token", type: def.type || "Token Creature", cols: (def.colors || []).join("") || "C", f: {}, power: p, creature: /Creature/.test(def.type || "Creature"), perm: true, pay: {cols: [], gen: 0}};
          for (let i = 0; i < Math.min(n, 30); i++) enter(tc, {token: true, quiet: i >= 3});
          break;
        }
        case "counter": if (a.kind === "p1p1") { const on = a.on === "each" ? perms.filter(q => q.creature && fwFits(a.each || "creature", q.c)) : perms.filter(q => q.creature).sort((p1, p2) => p2.power - p1.power).slice(0, 1); on.forEach(q => { q.power += a.n || 1; }); } break;
        case "copy": {
          if (!x || !x.c.perm || x.c.land) break;
          const keep = tr.acts.slice(k + 1).find(q => q.t === "delay" && q.act === "sac");
          const keepPay = keep && keep.unless ? fwCost({cost: (keep.unless.match(/\{[^}]+\}/g) || []).join("").toUpperCase(), cmc: 0}) : null;
          S.copies++;
          enter(x.c, {token: true, haste: !!a.haste, temp: !!keep, keepPay});
          break;
        }
      }
    };
    const fire = (ev, x) => {
      if (budget-- <= 0) return;
      for (const p of perms.slice()) {
        for (const tr of p.c.f.trigs || []) {
          if (!tr.conds.some(k => fits(k, ev, x, p.id))) continue;
          let times = 1;
          if (ev === "etb") times += perms.filter(q => q.c.f.dbl && q.c.f.dbl.etb).length;
          times += perms.filter(q => q.c.f.dbl && q.c.f.dbl.ph && q.id !== p.id && fwFits(q.c.f.dbl.ph, p.c)).length;
          for (let i = 0; i < times; i++) { S.trigs++; tr.acts.forEach((a, k) => act(a, p, x, tr, k)); }
        }
      }
    };
    const enter = (c, o) => {
      const x = {id: ++nextId, c, token: !!o.token, temp: !!o.temp, keepPay: o.keepPay || null, cmd: o.cmd, creature: !!c.creature, power: c.creature ? (c.power || 0) : 0, tough: c.tough || Math.max(1, c.power || 1), kw: c.kw || {}, sick: true, haste: !!(o.haste || c.haste)};
      if (c.land) { perms.push(x); if (!o.quiet) fire("etb", x); return x; }
      if (c.perm) perms.push(x);
      x.haste = x.haste || hasteFor(x);
      if (c.perm && c.f.rock && c.f.rock.length) { addSource(x, c.f.rock, false, !c.f.rockTapped); x.manaSrc = true; }
      else if (c.perm && c.f.dork && c.f.dork.length) { addSource(x, c.f.dork, true, x.haste); x.manaSrc = true; }
      if (c.f.ramp) for (let i = 0; i < c.f.ramp; i++) fetchBasic(!!c.f.rampTapped);
      else if (c.landRamp) for (let i = 0; i < c.landRamp; i++) fetchBasic(true);
      if (c.etbDraw) draw(c.etbDraw);
      if (c.perm && !o.token) { if (c.tutor) tutor(c.tutor); if (c.regrow) regrow(c.regrow.ph); if (c.rean) reanimate(c.rean.ph); }
      if (!o.quiet && c.perm) fire("etb", x);
      return x;
    };
    const leave = x => {
      perms = perms.filter(p => p !== x);
      if (!x.token && x.cmd == null && !x.c.land && x.c.perm) grave.push(x.c);
      if (srcs.some(s => s.id === x.id)) { srcs = srcs.filter(s => s.id !== x.id); const tg = new RegExp("[#@]" + x.id + "$"); pool = pool.filter(u => !tg.test(u)); }
      if (x.cmd != null) cmdIn[x.cmd] = true;
    };
    // a sacrifice outlet you control that turns this creature into mana (Ashnod's Altar, Phyrexian Altar)
    const outletFor = x => x.creature ? perms.find(p => p.c.outlet && p !== x && fwFits(p.c.outlet.ph, x.c)) : null;
    const sacrifice = (x, viaOutlet) => { const o = viaOutlet && outletFor(x); leave(x); if (o) { float(o.c.outlet.units); S.outletSacs++; } fire("sac", x); if (x.creature) fire("dies", x); };
    const destroy = x => { leave(x); if (x.creature) fire("dies", x); };
    const reduced = (c, payObj) => { let red = 0; for (const p of perms) for (const r of p.c.f.reduce || []) if (fwFits(r.ph, c)) red += r.n; return red ? {cols: payObj.cols, gen: Math.max(0, payObj.gen - red)} : payObj; };
    const evokePay = c => {
      if (!c.perm || c.land) return null;
      let best = c.f.evoke ? c.f.evoke.pay : null;
      for (const p of perms) { const g = p.c.f.grantEvoke; if (g && fwFits(g.ph, c) && (!best || g.pay.gen + g.pay.cols.length < best.gen + best.cols.length)) best = g.pay; }
      return best;
    };
    // can you pay this now, keeping enough back for the copies you mean to keep?
    const afford = (payObj, extra, c) => {
      const need = payObj.gen + payObj.cols.length + (extra || 0); if (pool.length < need) return null;
      const after = fwPay(pool, payObj, extra || 0, c); if (!after) return null;
      if (keepNeed && !fwPay(after, keepPayFor(keepNeed), 0)) return null;
      return after;
    };
    const keepPayFor = n => { let p = {cols: [], gen: 0}; for (let i = 0; i < n; i++) p = addPays(p, KEEP_ANY); return p; };
    const copier = c => perms.some(p => (p.c.f.trigs || []).some(tr => tr.conds.some(k => k.ev === "sac" && (k.who === "any" || k.who === "other") && fwFits(String(k.phrase || ""), c)) && tr.acts.some(a => a.t === "copy")));
    const etbValue = c => c.etbDraw || c.landRamp || c.f.ramp || (c.f.trigs || []).some(tr => tr.conds.some(k => k.ev === "etb" && (k.who === "self" || k.who === "selfOrOther")))
      || perms.some(p => (p.c.f.trigs || []).some(tr => tr.conds.some(k => k.ev === "etb" && k.who !== "self" && fwFits(String(k.phrase || ""), c))));
    const cascadeFrom = c => {
      for (let n = 0; n < (c.f.cascade || 0); n++) {
        const i = deck.findIndex(q => !q.land && q.cmc < c.cmc); if (i < 0) break;
        const hit = deck.splice(i, 1)[0]; deck.push(...deck.splice(0, i)); play(hit, "free");
      }
    };
    const play = (c, how) => {
      if (how !== "free") hand.splice(hand.indexOf(c), 1);
      fire("cast", {id: -1, c});
      if (c.f.cascade) cascadeFrom(c);
      if (c.f.burst && c.f.burst.length && !c.perm) float(c.f.burst);   // rituals
      if (!c.perm) {
        if (c.draw) draw(c.draw);
        if (c.tutor) tutor(c.tutor); if (c.regrow) regrow(c.regrow.ph); if (c.rean) reanimate(c.rean.ph);
        if (how !== "free") grave.push(c);
        if (c.f.ramp) for (let i = 0; i < c.f.ramp; i++) fetchBasic(!!c.f.rampTapped); else if (c.landRamp) for (let i = 0; i < c.landRamp; i++) fetchBasic(true);
        engines += c.engine;
        if (versus && c.removal && !c.counter && oppBoard.length && Math.random() < 0.5) { oppBoard.sort((a, b) => b.p - a.p); oppBoard.shift(); }   // their best blocker
        else if (versus && (c.removal || c.counter)) delay += (c.counter && opp.win < 7 ? 0.8 : st.slowBy);
        if (versus && c.wipe) { delay += st.slowBy * 2.5; oppBoard = []; perms.filter(p => p.creature).forEach(destroy); }
        return;
      }
      const x = enter(c, {});
      if (!c.etbDraw && c.draw && !c.creature) draw(c.draw);
      engines += c.engine;
      if (versus && (c.removal || c.counter)) delay += st.slowBy * 0.5;
      if (how === "evoke") { S.evokes++; sacrifice(x, true); }   // with an Altar out: sacrificed to it for mana as it enters
    };
    // Combat: your creatures attack; the opponent blocks with its creatures. Flying (only fliers and reach block it), menace (two
    // blockers), "can't be blocked", trample (the excess goes through), deathtouch, double strike, infect, and commander damage.
    const combat = versus => {
      const atk = perms.filter(p => p.creature && !p.manaSrc && (!p.sick || p.haste) && p.power > 0).sort((a, b) => b.power - a.power);
      S.attackers += atk.length;
      const free = versus ? oppBoard.slice() : [];
      const incoming = atk.reduce((s, a) => s + a.power * (a.kw.ds ? 2 : 1), 0);
      const lethal = incoming >= oppLife;
      const deadAtk = [];
      for (const a of atk) {
        const mult = a.kw.ds ? 2 : 1;
        let blk = null;
        if (free.length && !a.kw.unblock) {
          const can = free.filter(b => !a.kw.fly || b.fly || b.reach);
          if (can.length >= (a.kw.menace ? 2 : 1)) {
            // a block that kills the attacker and survives; else a trade on a big attacker; else a chump block if the damage would be lethal
            const good = can.find(b => (b.p >= a.tough || b.dt) && b.t > a.power * mult && !a.kw.dt);
            const trade = can.find(b => b.p >= a.tough || b.dt);
            const chump = lethal || a.power >= 6 || (isCmd && a.cmd != null && (cmdDmg[a.cmd] || 0) + a.power >= 21) ? can.sort((x, y) => x.p - y.p)[0] : null;
            blk = good || (a.power >= 3 && trade) || chump || null;
            if (blk && a.kw.menace) { const second = can.find(b => b !== blk); if (!second) blk = null; else { free.splice(free.indexOf(second), 1); } }
          }
        }
        let dmg = a.power * mult;
        if (blk) {
          free.splice(free.indexOf(blk), 1); S.blocked++;
          const lethalToBlk = a.kw.dt ? 1 : blk.t;
          dmg = a.kw.trample ? Math.max(0, a.power * mult - lethalToBlk) : 0;
          if (a.power * mult >= lethalToBlk) oppBoard.splice(oppBoard.indexOf(blk), 1);
          if (blk.p >= a.tough || blk.dt) deadAtk.push(a);
        }
        if (!dmg) continue;
        if (a.kw.infect) poison += dmg; else oppLife -= dmg;
        if (a.cmd != null && !a.kw.infect) cmdDmg[a.cmd] = (cmdDmg[a.cmd] || 0) + dmg;
      }
      for (const a of deadAtk) { S.died++; destroy(a); }
    };
    // one main phase: commander, then the best play you can pay for, again and again
    const mainPhase = () => {
      cmdrs.forEach((c, i) => {
        if (!cmdIn[i]) return;
        const after = afford(reduced(c, c.pay), 2 * cmdCasts[i], c); if (!after) return;
        pool = after; cmdIn[i] = false; cmdCasts[i]++; if (!cmdTurn) cmdTurn = t; fire("cast", {id: -1, c}); enter(c, {cmd: i});
      });
      for (let guard = 0; guard < 30; guard++) {
        const opts2 = [];
        for (const c of hand) {
          if (c.land) continue;
          if (c.wipe && (!versus || t < 5 || perms.filter(p => p.creature).reduce((s, p) => s + p.power, 0) >= 6)) continue;
          const full = reduced(c, c.pay), fullAfter = afford(full, 0, c), ev0 = evokePay(c), ev = ev0 ? reduced(c, ev0) : null, cp = ev && c.creature && copier(c);
          const evAfter = ev ? afford(ev, 0, c) : null, cost = p => p.gen + p.cols.length;
          if (fullAfter) {
            if (cp && evAfter && fwPay(evAfter, keepPayFor(keepNeed + 1), 0) && cost(ev) < cost(full) + 3) opts2.push({c, how: "evoke", after: evAfter, cost: cost(ev), keep: 1, pri: 5});
            else opts2.push({c, how: "cast", after: fullAfter, cost: cost(full), pri: ((c.mana || c.landRamp) ? 3 : 0) + ((c.draw || c.engine) ? 2 : 0) + (c.f.trigs || c.f.dbl || c.f.grantEvoke || c.outlet ? 1 : 0)
              + (c.outlet && perms.some(p => (p.c.f.trigs || []).some(tr => tr.conds.some(k => k.ev === "sac")) || p.c.f.grantEvoke) ? 3 : 0)});   // an altar is worth much more with Ashling out
          } else if (evAfter && (cp || etbValue(c))) opts2.push({c, how: "evoke", after: evAfter, cost: cost(ev), keep: cp && fwPay(evAfter, keepPayFor(keepNeed + 1), 0) ? 1 : 0, pri: cp ? 4 : 2});
        }
        if (!opts2.length) break;
        opts2.sort((a, b) => b.pri - a.pri || b.cost - a.cost);
        const o = opts2[0]; pool = o.after; keepNeed += o.keep || 0; play(o.c, o.how);
      }
      // Clues: {2} each for a card
      while (clues > 0 && hand.filter(c => !c.land).length < 3) { const after = afford({cols: [], gen: 2}, 0, null); if (!after) break; pool = after; clues--; draw(1); }
      // activated abilities with what's left (once each per turn): "{2}, {T}: draw a card", "{3}: create a token"…
      for (const p of perms) for (const ab of p.c.acts || []) {
        if (p.used || (ab.tap && p.creature && p.sick && !p.haste)) continue;
        const after = afford(ab.pay, 0, null); if (!after) continue;
        pool = after; p.used = true; S.abilities++;
        ab.effs.forEach((a, k) => act(a, p, null, {acts: ab.effs}, k));
      }
    };
    for (t = 1; t <= MAXT; t++) {
      budget = 400; keepNeed = 0;
      if (!(t === 1 && onPlay)) draw(1);
      engineAcc += engines; while (engineAcc >= 1 && deck.length) { hand.push(deck.shift()); engineAcc -= 1; }
      perms.forEach(p => { p.sick = false; p.used = false; });
      pool = srcs.flatMap(s => tag(s.units, s)).concat(Array(treasures).fill("WUBRG~T"));   // everything untaps; Treasures wait to be used
      // landfall first: a creature that triggers on lands is cast before the land drop when it can be
      const lf = hand.filter(c => c.landfall && !c.land).map(c => ({c, after: afford(reduced(c, c.pay), 0, c)})).filter(x => x.after).sort((a, b) => b.c.cmc - a.c.cmc)[0];
      if (lf) { pool = lf.after; play(lf.c, "cast"); }
      // land drops: an untapped land when this turn needs its mana, a tapped one when it doesn't
      const drops = 1 + perms.reduce((s, p) => s + (p.c.f.extraLand || 0), 0);
      for (let k = 0; k < drops; k++) {
        const ls = hand.filter(c => c.land); if (!ls.length) break;
        const tappedL = ls.filter(l => l.f.tapped), openL = ls.filter(l => !l.f.tapped);
        let pick = openL[0] || tappedL[0];
        if (tappedL.length && openL.length) {
          const extra = tag(openL[0].f.units || ["C"], {id: 0, cre: false});
          const needs = hand.some(c => !c.land && !afford(reduced(c, c.pay), 0, c) && fwPay(pool.concat(extra), reduced(c, c.pay), 0, c));
          if (!needs) pick = tappedL[0];
        }
        hand.splice(hand.indexOf(pick), 1); putLand(pick, false);
      }
      const avail = pool.length;
      if (t <= 6 && hand.some(c => !c.land && c.cmc <= avail && !afford(reduced(c, c.pay), 0, c)) && !hand.some(c => !c.land && afford(reduced(c, c.pay), 0, c))) S.colorStuck++;
      mainPhase();
      if (t === 3 && landCount() >= 3) S.land3++;
      if (t === 4) { if (landCount() >= 4) S.land4++; if (landCount() <= 2) S.screw++; }
      if (t === 7 && landCount() >= 8 && hand.filter(c => !c.land).length <= 1) S.flood++;
      // attack
      treasures = pool.filter(u => u.includes("~T")).length;
      combat(versus);
      if (oppLife <= 0 || poison >= 10 || (isCmd && Object.values(cmdDmg).some(v => v >= 21))) {
        S.manaAvail[t] += avail; S.manaUsed[t] += avail - Math.min(avail, pool.length);
        if (oppLife > 0) { if (poison >= 10) S.poisonWins++; else S.cmdWins++; }
        return {win: true, t, m, cmdTurn};
      }
      // second main phase: copies you can't keep go to a sacrifice outlet for mana, then that mana is spent
      for (const p of perms.filter(q => q.temp && q.creature)) if (outletFor(p) && !(p.keepPay && fwPay(pool, keepPayFor(keepNeed), 0))) { keepNeed = Math.max(0, keepNeed - 1); sacrifice(p, true); }
      mainPhase();
      S.manaAvail[t] += avail; S.manaUsed[t] += avail - Math.min(avail, pool.filter(u => !u.includes("~=")).length);
      // end step: Ashling's copies are kept if you can pay ({W}{U}{B}{R}{G}, colours checked), else sacrificed
      for (const p of perms.filter(q => q.temp)) {
        const after = p.keepPay ? fwPay(pool, p.keepPay, 0) : null;
        if (after) { pool = after; p.temp = false; S.kept++; } else sacrifice(p, false);
      }
      perms.forEach(p => { p.haste = p.haste && (p.c.haste || hasteFor(p)); });
      treasures = pool.filter(u => u.includes("~T")).length;
      if (oppLife <= 0) return {win: true, t, m, cmdTurn};
      if (versus) {
        const myTurnEnds = onPlay ? t : t - 0.5;
        if (myTurnEnds >= oppWin + Math.min(3, delay)) return {win: false, t, m, cmdTurn};
        const cre = perms.filter(p => p.creature);
        if (t >= 3 && cre.length && Math.random() < opp.inter * st.inter) destroy(cre.reduce((b, x) => x.power > b.power ? x : b));
        if (t >= 5 && (cre.length || oppBoard.length) && Math.random() < opp.wipe * st.wipe) { perms.filter(p => p.creature).forEach(destroy); oppBoard = []; }
        // their creatures, which block yours: their real ones when the opponent is one of your decks
        if (Math.random() < (opp.crDensity != null ? Math.min(0.9, opp.crDensity * 2.2) : 0.5) * st.block && oppBoard.length < 6) {
          // a creature it could have cast by now (about one land a turn, a little ramp later on)
          if (opp.creatures) { const can = opp.creatures.filter(x => x.cmc <= t + Math.floor(t / 4)); if (can.length) oppBoard.push(Object.assign({}, can[Math.floor(Math.random() * can.length)])); }
          else { const sz = Math.max(1, Math.min(7, 1 + Math.floor(t / 2) + Math.round(gauss()))); oppBoard.push({p: sz, t: Math.max(1, sz + Math.round(gauss())), fly: Math.random() < 0.2, reach: Math.random() < 0.1, dt: Math.random() < 0.08}); }
        }
        if (oppLife <= 0) return {win: true, t, m, cmdTurn};
      }
    }
    return {win: null, t: MAXT, m, cmdTurn};
  };
  for (let g = 0; g < (opts.goldOnly ? 0 : games); g++) {
    const r = run(true);
    if (r.m === 0) S.kept7++; S.mulls += r.m; if (r.cmdTurn) S.cmdTurns.push(r.cmdTurn);
    if (r.win === true) { S.wins++; S.winTurn[r.t]++; } else if (r.win === false) { S.losses++; S.lossTurn[r.t]++; } else S.long++;
  }
  if (!opts.noGold) {
    const keep = Object.assign({}, S, {manaAvail: S.manaAvail.slice(), manaUsed: S.manaUsed.slice()});
    for (let g = 0; g < (opts.goldOnly ? games : Math.min(1000, games)); g++) { const r = run(false); if (r.win) S.goldTurns.push(r.t); }
    for (const k of ["land3", "land4", "screw", "flood", "manaAvail", "manaUsed", "evokes", "copies", "kept", "trigs", "colorStuck", "outletSacs", "abilities", "treasures", "tutors", "recursions", "blocked", "attackers", "died", "cmdWins", "poisonWins"]) S[k] = keep[k];
  }
  const comp = {lands: 0, ramp: 0, draw: 0, removal: 0, wipes: 0, creatures: 0, mvSum: 0, mvN: 0, tapped: 0};
  for (const c of library0) {
    if (c.land) { comp.lands++; if (c.f.tapped) comp.tapped++; continue; }
    comp.mvSum += c.cmc; comp.mvN++;
    if (c.mana || c.landRamp) comp.ramp++; if (c.draw || c.engine) comp.draw++; if (c.removal || c.counter) comp.removal++; if (c.wipe) comp.wipes++; if (c.power && !c.mana) comp.creatures++;
  }
  S.comp = comp; S.isCmd = isCmd; S.opp = opp; S.style = st; S.deckSize = library0.length + cmdrs.length;
  return S;
}
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
function simTips(S){
  const tips = [], g = S.games, c = S.comp;
  if (pct(S.screw, g) >= 20) tips.push(`You're stuck on 2 lands at turn 4 in ${pct(S.screw, g)}% of games. Add ${S.isCmd ? "2–3 lands or cheap ramp" : "1–2 lands"}.`);
  if (pct(S.flood, g) >= 15) tips.push(`You flood out (8+ lands, almost no spells) in ${pct(S.flood, g)}% of games by turn 7. Swap a land or two for card draw or mana sinks.`);
  if (S.isCmd && S.cmdTurns.length && median(S.cmdTurns) > (c.mvN ? Math.round(c.mvSum / c.mvN) + 3 : 6)) tips.push(`Your commander usually arrives on turn ${median(S.cmdTurns)}. More 2-mana ramp gets it out sooner.`);
  const few = (n, what) => n ? `Only ${n} ${what}` : `No ${what}`;
  const landMin = S.isCmd ? 34 : Math.round(S.deckSize * 0.36);
  if (c.lands < landMin && pct(S.screw, g) < 20) tips.push(`${c.lands} lands is on the low side (most ${S.isCmd ? "Commander decks run 35–38" : "60-card decks run 22–26"}).`);
  if (S.isCmd && c.ramp < 8) tips.push(`${few(c.ramp, "ramp cards")}. Most Commander decks want 8–12.`);
  if (S.isCmd && c.draw < 8) tips.push(`${few(c.draw, "card-draw cards")}. Most Commander decks want 8–12 so they don't run out of gas.`);
  if (c.removal < (S.isCmd ? 7 : 4)) tips.push(`${few(c.removal, "removal or counter spells")}. Interaction slows down faster opponents, especially aggressive ones.`);
  if (S.isCmd && c.wipes < 2 && S.style.name === "Aggressive") tips.push("Against aggressive decks, 2–3 board wipes help you reset when you fall behind.");
  const gold = median(S.goldTurns);
  if (gold && S.opp && gold > S.opp.win + 1) tips.push(`Unopposed, your deck wins around turn ${gold}, slower than this opponent. Add stronger threats or a finisher.`);
  if (!tips.length) tips.push("No obvious weak spots against this opponent. Nice deck!");
  return tips;
}
function renderSim(){
  const box = $("deckSim"); const d = prefs.deckView && deckById(prefs.deckView);
  if (!d || !(d.cards.length + d.commanders.length)) { box.innerHTML = ""; return; }
  const isCmd = d.format === "commander";
  const o = Object.assign({bracket: 3, speed: "strong", style: "balanced"}, prefs.simOpts || {});
  const res = simState && simState.deckId === d.id ? simState : null;
  let html = `<div class="sim-head"><h3>Test this deck</h3><span class="cur-sub">Plays thousands of quick simulated games against a typical opponent.</span></div>
    <div class="sim-controls">
      ${isCmd ? `<label class="inline-field">Opponent bracket <select id="simBracket">${Object.entries(BRACKETS).map(([k, b]) => `<option value="${k}" ${String(k) === String(o.bracket) ? "selected" : ""}>${k} · ${b.name}</option>`).join("")}${tableOpt(d, o.bracket)}</select></label>`
              : `<label class="inline-field">Opponent <select id="simSpeed">${Object.entries(SPEEDS).map(([k, b]) => `<option value="${k}" ${k === o.speed ? "selected" : ""}>${b.name}</option>`).join("")}${tableOpt(d, o.speed)}</select></label>`}
      <div class="seg" role="group" aria-label="Opponent's style">${Object.entries(STYLES).map(([k, s]) => `<button type="button" data-style="${k}" aria-pressed="${k === o.style}">${s.name}</button>`).join("")}</div>
      <button class="btn primary" type="button" id="simRun">${res ? "Run again" : "Run 3,000 games"}</button>
    </div>`;
  if (res && res.stale) html += `<div class="cur-sub">Your deck or settings changed since this test. Run it again for fresh numbers.</div>`;
  if (res && res.S) {
    const S = res.S, g = S.games, winP = pct(S.wins, g), lossP = pct(S.losses, g);
    const bar = (v, good) => `<span class="sbar"><i style="width:${Math.max(2, v)}%" class="${good === null ? "" : good ? "g" : "b"}"></i></span>`;
    const rowp = (label, v, good, note) => `<div class="srow2"><span>${esc(label)}</span>${bar(v, good)}<b>${v}%</b>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
    const cmdMed = median(S.cmdTurns), gold = median(S.goldTurns);
    const ends = (arr) => { let n = 0, s = 0; arr.forEach((v, i) => { n += v; s += v * i; }); return n ? Math.round(s / n) : null; };
    const pickO = S.isCmd ? res.opts.bracket : res.opts.speed, cal = pickO === "table" && d.simCal, vsDeck = typeof pickO === "string" && pickO.startsWith("deck:");
    html += `<div class="sim-title">${cal ? `Your deck vs your table, tuned to your ${cal.n} logged games (you won ${Math.round(cal.rate * 100)}% of them; they usually ended on turn ${cal.turn})`
      : vsDeck ? `Your deck vs ${esc(S.opp.name)} (your saved deck: its speed, removal, wipes and creatures)`
      : `Your deck vs a typical ${S.isCmd ? `Bracket ${res.opts.bracket} (${S.opp.name})` : S.opp.name.toLowerCase()} deck`} playing ${S.style.name.toLowerCase()} · ${g.toLocaleString()} games</div>
      <div class="sim-big"><div><b class="${winP >= 50 ? "okc" : winP >= 35 ? "" : "warnc"}">${winP}%</b><span>you win</span></div><div><b>${lossP}%</b><span>they win</span></div>
        ${S.long ? `<div><b>${pct(S.long, g)}%</b><span>still going at turn 16</span></div>` : ""}
        <div><b>${ends(S.winTurn) ?? "—"}</b><span>turn you usually win</span></div><div><b>${ends(S.lossTurn) ?? "—"}</b><span>turn you usually lose</span></div>
        <div><b>${gold ?? "—"}</b><span>your win turn with no opponent</span></div></div>
      <div class="sim-grid">
        ${rowp("Keep your opening 7", pct(S.kept7, g), pct(S.kept7, g) >= 75, `${(S.mulls / g).toFixed(2)} mulligans per game`)}
        ${rowp("3 lands by turn 3", pct(S.land3, g), pct(S.land3, g) >= 75)}
        ${rowp("4 lands by turn 4", pct(S.land4, g), pct(S.land4, g) >= 60)}
        ${rowp("Stuck on 2 lands at turn 4", pct(S.screw, g), pct(S.screw, g) < 15)}
        ${rowp("Flooded by turn 7", pct(S.flood, g), pct(S.flood, g) < 12)}
        ${S.isCmd && d.commanders.length ? rowp("Commander cast by turn 4", pct(S.cmdTurns.filter(x => x <= 4).length, g), null, cmdMed ? `usually turn ${cmdMed}` : "") : ""}
        ${rowp("Mana used on turns 1–6", pct(S.manaUsed.slice(1, 7).reduce((a, b) => a + b, 0), S.manaAvail.slice(1, 7).reduce((a, b) => a + b, 0)), null, "how much of your mana you could spend")}
      </div>
      ${(() => {
        const bits = [];
        if (S.evokes) bits.push(`${(S.evokes / g).toFixed(1)} evoked`);
        if (S.copies) bits.push(`${(S.copies / g).toFixed(1)} token copies made (${(S.kept / g).toFixed(1)} kept by paying for them)`);
        if (S.outletSacs) bits.push(`${(S.outletSacs / g).toFixed(1)} sacrificed to an altar for mana`);
        if (S.abilities) bits.push(`${(S.abilities / g).toFixed(1)} activated abilities used`);
        if (S.treasures) bits.push(`${(S.treasures / g).toFixed(1)} Treasures made`);
        if (S.tutors) bits.push(`${(S.tutors / g).toFixed(1)} cards tutored`);
        if (S.recursions) bits.push(`${(S.recursions / g).toFixed(1)} cards brought back from the graveyard`);
        if (S.attackers) bits.push(`${Math.round(S.blocked / S.attackers * 100)}% of your attackers blocked, ${(S.died / g).toFixed(1)} of your creatures lost in combat`);
        if (S.cmdWins) bits.push(`${pct(S.cmdWins, S.wins)}% of wins by commander damage`);
        if (S.poisonWins) bits.push(`${pct(S.poisonWins, S.wins)}% of wins by poison`);
        if (S.trigs) bits.push(`${Math.round(S.trigs / g)} triggers`);
        const stuck = S.colorStuck / g;
        return (bits.length ? `<p class="cur-sub">Your cards' rules in these games, per game on average: ${bits.join(", ")}.</p>` : "")
          + (stuck >= 0.05 ? `<p class="cur-sub">Wrong colours: on ${(stuck).toFixed(1)} of your first 6 turns per game you had enough mana but not the right colours for anything in hand.</p>` : "");
      })()}
      ${simChart(S)}
      <div class="sim-cols">
        <div><h4>What's in the deck</h4><table class="sim-table"><tbody>
          ${[["Lands", S.comp.lands, S.isCmd ? "35–38" : "22–26"], ["Ramp", S.comp.ramp, S.isCmd ? "8–12" : "—"], ["Card draw", S.comp.draw, S.isCmd ? "8–12" : "3+"], ["Removal and counters", S.comp.removal, S.isCmd ? "8–12" : "4–8"], ["Board wipes", S.comp.wipes, S.isCmd ? "2–4" : "0–3"], ["Creatures", S.comp.creatures, "—"]]
            .map(([n, v, rec]) => `<tr><td>${n}</td><td class="num"><b>${v}</b></td><td class="cur-sub">${rec === "—" ? "" : "common: " + rec}</td></tr>`).join("")}
          ${S.comp.tapped ? `<tr><td>Lands that enter tapped</td><td class="num"><b>${S.comp.tapped}</b></td><td class="cur-sub">of ${S.comp.lands}</td></tr>` : ""}
          <tr><td>Average mana value</td><td class="num"><b>${S.comp.mvN ? (S.comp.mvSum / S.comp.mvN).toFixed(2) : "—"}</b></td><td class="cur-sub">spells only</td></tr>
        </tbody></table></div>
        <div><h4>Suggestions</h4><ul class="sim-tips">${simTips(S).map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>
      </div>
      <p class="cur-sub sim-note">These are estimates. Deckseer plays your deck by your cards' rules: lands (with their colours, and tapped ones a turn late), ramp, draw, removal, wipes and creatures, plus triggers (enters, landfall, dies, sacrifice), token copies, evoke (like Ashling's), sacrifice outlets like Ashnod's Altar, activated abilities, Treasures and Clues, tutors, graveyard recursion, trigger doublers, cost reducers, extra land drops and cascade. Combat has blockers, flying, menace, trample, deathtouch, double strike, infect and commander damage, against ${vsDeck ? "a model built from that deck (its speed, interaction and creatures; it doesn't play its cards turn by turn)" : `a model of a typical ${S.isCmd ? "deck in that bracket" : "opponent"} rather than a real decklist`}. Combos and politics aren't modeled. Use it to compare versions of your deck.</p>`;
  }
  box.innerHTML = html;
}
// "Your table": the opponent tuned to your own logged games with this deck
function tableOpt(d, cur){
  const T = tableGames(d), others = decks.filter(x => x.id !== d.id && x.format === d.format && x.cards.length);
  return `<option value="table" ${cur === "table" ? "selected" : ""}>Your table (${T.n} logged game${T.n === 1 ? "" : "s"}${T.n < TABLE_MIN_GAMES ? `, needs ${TABLE_MIN_GAMES}` : ""})</option>`
    + (others.length ? `<optgroup label="One of your decks">${others.map(x => `<option value="deck:${x.id}" ${cur === "deck:" + x.id ? "selected" : ""}>vs ${esc(x.name)}</option>`).join("")}</optgroup>` : "");
}
function simChart(S){
  const W = 560, H = 120, n = 16, max = Math.max(1, ...S.winTurn.slice(1, n + 1), ...S.lossTurn.slice(1, n + 1)), bw = W / n;
  let bars = "";
  for (let t = 1; t <= n; t++) {
    const w = S.winTurn[t] / max * (H - 24), l = S.lossTurn[t] / max * (H - 24), x = (t - 1) * bw;
    bars += `<rect x="${x + bw * 0.12}" y="${H - 16 - w}" width="${bw * 0.36}" height="${w}" fill="var(--ok)" rx="2"><title>Turn ${t}: you win ${S.winTurn[t]} games</title></rect>`
      + `<rect x="${x + bw * 0.52}" y="${H - 16 - l}" width="${bw * 0.36}" height="${l}" fill="var(--danger)" rx="2"><title>Turn ${t}: they win ${S.lossTurn[t]} games</title></rect>`
      + `<text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle" font-size="10" fill="var(--muted)">${t}</text>`;
  }
  return `<div class="sim-chart"><div class="sim-legend"><span><i style="background:var(--ok)"></i>You win</span><span><i style="background:var(--danger)"></i>They win</span><span class="cur-sub">by turn</span></div>
    <div class="sim-svg"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="When games end, by turn">${bars}<line x1="0" y1="${H - 16}" x2="${W}" y2="${H - 16}" stroke="var(--line)"/></svg></div></div>`;
}
let simState = null;
const simSig = d => JSON.stringify([d.commanders.map(c => c.sid), d.cards.map(c => [c.sid, c.qty, c.board]), prefs.simOpts]);
$("deckSim").addEventListener("click", e => {
  const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
  const sb = e.target.closest("[data-style]");
  if (sb) { prefs.simOpts = Object.assign({}, prefs.simOpts, {style: sb.dataset.style}); savePrefs(); if (simState) simState.stale = true; return renderSim(); }
  if (e.target.closest("#simRun")) {
    const opts = Object.assign({bracket: 3, speed: "strong", style: "balanced", games: 3000}, prefs.simOpts || {});
    const table = (d.format === "commander" ? opts.bracket : opts.speed) === "table";
    if (table) {
      const T = tableGames(d);
      if (T.n < TABLE_MIN_GAMES) return toast(`Log at least ${TABLE_MIN_GAMES} games with this deck in the Game tab first (${T.n} so far). Pick it as your deck when you start a game.`);
    }
    $("simRun").disabled = true; $("simRun").textContent = table ? "Tuning to your table…" : "Playing…";
    setTimeout(() => {   // let the button update before the games run
      if (table) { const T = tableGames(d); if (!d.simCal || d.simCal.n !== T.n || d.simCal.wins !== T.wins || d.simCal.style !== opts.style) { calibrateTable(d, opts.style); saveDecks(); } }
      const S = simulateDeck(d, opts);
      simState = {deckId: d.id, S, opts, sig: simSig(d), stale: false};
      if (!S) toast("Add at least 7 cards to the main deck to test it.");
      renderSim();
    }, 30);
  }
});
$("deckSim").addEventListener("change", e => {
  if (e.target.id === "simBracket") prefs.simOpts = Object.assign({}, prefs.simOpts, {bracket: /^(table|deck:)/.test(e.target.value) ? e.target.value : +e.target.value});
  if (e.target.id === "simSpeed") prefs.simOpts = Object.assign({}, prefs.simOpts, {speed: e.target.value});
  savePrefs(); if (simState) simState.stale = true; renderSim();
});

