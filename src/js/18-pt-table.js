/* ---------------- playtest table ----------------
   A goldfish table for one deck: library, hand, a grid battlefield (creatures / other permanents / lands),
   graveyard, exile and command zone. Drag cards anywhere, click to tap, right-click for everything else.
   Every action can be undone. Nothing here changes the deck itself. */
// The battlefield is one big table ruled in small squares. Every card covers exactly 5×7 squares (7×5 when tapped)
// and snaps to the lines wherever it's dropped. Cards played with a click land in tidy lanes: creatures at the top,
// other permanents in the middle, lands at the bottom.
const PT_CW = 5, PT_CH = 7, PT_LANE = 8, PT_STEP = 7;
const PT_LANES = {creature: [1, 1 + PT_LANE], other: [1 + PT_LANE * 2], land: [1 + PT_LANE * 3, 1 + PT_LANE * 4]};
const PT_MIN_ROWS = 1 + PT_LANE * 5;
const PT_COUNTERS = [["p1p1", "+1/+1"], ["m1m1", "−1/−1"], ["loyalty", "Loyalty"], ["charge", "Charge"], ["shield", "Shield"], ["stun", "Stun"],
  ["lore", "Lore"], ["time", "Time"], ["oil", "Oil"], ["fade", "Fade"], ["quest", "Quest"], ["level", "Level"], ["flying", "Flying"], ["deathtouch", "Deathtouch"], ["lifelink", "Lifelink"]];
const PT_COMMON_TOKENS = [
  {name: "Treasure", type: "Token Artifact — Treasure", colors: [], text: "{T}, Sacrifice this artifact: Add one mana of any color."}, {name: "Clue", type: "Token Artifact — Clue", colors: [], text: "{2}, Sacrifice this artifact: Draw a card."},
  {name: "Food", type: "Token Artifact — Food", colors: [], text: "{2}, {T}, Sacrifice this artifact: You gain 3 life."}, {name: "Blood", type: "Token Artifact — Blood", colors: [], text: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card."},
  {name: "Map", type: "Token Artifact — Map", colors: [], text: "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery."}, {name: "Gold", type: "Token Artifact — Gold", colors: [], text: "Sacrifice this artifact: Add one mana of any color."},
  {name: "Soldier", type: "Token Creature — Soldier", power: "1", toughness: "1", colors: ["W"]}, {name: "Spirit", type: "Token Creature — Spirit", power: "1", toughness: "1", colors: ["W"], text: "Flying"},
  {name: "Human", type: "Token Creature — Human", power: "1", toughness: "1", colors: ["W"]}, {name: "Thopter", type: "Token Artifact Creature — Thopter", power: "1", toughness: "1", colors: [], text: "Flying"},
  {name: "Zombie", type: "Token Creature — Zombie", power: "2", toughness: "2", colors: ["B"]}, {name: "Goblin", type: "Token Creature — Goblin", power: "1", toughness: "1", colors: ["R"]},
  {name: "Saproling", type: "Token Creature — Saproling", power: "1", toughness: "1", colors: ["G"]}, {name: "Beast", type: "Token Creature — Beast", power: "3", toughness: "3", colors: ["G"]},
  {name: "Elf Warrior", type: "Token Creature — Elf Warrior", power: "1", toughness: "1", colors: ["G"]}, {name: "Squirrel", type: "Token Creature — Squirrel", power: "1", toughness: "1", colors: ["G"]},
  {name: "Angel", type: "Token Creature — Angel", power: "4", toughness: "4", colors: ["W"], text: "Flying"}, {name: "Dragon", type: "Token Creature — Dragon", power: "5", toughness: "5", colors: ["R"], text: "Flying"}
];
let PT = null, ptUid = 0, ptHover = null, ptDrag = null, ptMenuFor = null;
const ptTokenCache = new Map();
const ptEl = () => $("pt");
function ptMakeCard(c, extra){
  return Object.assign({uid: ++ptUid, sid: c.sid || c.id || "", name: c.name, img: c.imgN ? c.imgN : bigImg(c), type: c.type || "", text: c.text || "", cmc: c.cmc ?? 0,
    power: c.power ?? "", toughness: c.toughness ?? "", colors: c.colors || [], cost: c.cost || "", loyalty: c.loyalty ?? "", defense: c.defense ?? "", token: false, tapped: false, counters: {}, faceDown: false, back: false}, extra || {});
}
const ptIsLand = c => /\bLand\b/.test((c.type || "").split(" // ")[0]);
const ptIsCreature = c => !!c && c.att == null && ((/\bCreature\b/.test(ptFaceType(c)) && !(c.impending && c.counters && c.counters.time > 0)) || !!c.anim || !!(c.eot && c.eot.cre));
const ptIsPermanentType = c => !/\b(Instant|Sorcery)\b/.test((c.type || "").split(" // ")[0]);
const ptCanTransform = c => (c.type || "").includes(" // ") && /\/front\//.test(c.img || "");
function ptNew(d){
  const lib = [];
  for (const c of d.cards.filter(x => x.board === "main")) for (let i = 0; i < (c.qty || 1); i++) lib.push(ptMakeCard(c));
  const cmd = d.commanders.map(c => ptMakeCard(c, {commander: true}));
  const st = {deckId: d.id, name: d.name, isCmd: d.format === "commander", turn: 0, life: d.format === "commander" ? 40 : 20, poison: 0, energy: 0,
    lib: shuffle(lib), hand: [], grave: [], exile: [], cmd, bf: [], mull: 0, phase: "mull", toBottom: 0, tax: {}, log: [], undo: [], z: 0,
    opp: d.format === "commander" ? 40 : 20, oppT: 0, trig: [], muted: {}, targeting: null, castN: 0, drawN: 0, endDone: 0, exp: 0};
  const on = ptOppN(st.isCmd); st.opps = Array.from({length: on}, (_, i) => ptOppMake(i, on, st.isCmd));
  for (let i = 0; i < 7 && st.lib.length; i++) st.hand.push(st.lib.shift());
  st.log.unshift("New game. Opening hand drawn: keep it or take a mulligan.");
  return st;
}
const PT_ZONES = ["lib", "hand", "grave", "exile", "cmd", "bf"];
function ptFind(uid){ for (const z of PT_ZONES) { const i = PT[z].findIndex(c => c.uid === uid); if (i >= 0) return {zone: z, i, card: PT[z][i]}; } return null; }
function ptSnapshot(){ const {undo, ...rest} = PT; PT.undo.push(JSON.stringify(rest)); if (PT.undo.length > 80) PT.undo.shift(); }
function ptUndo(){ if (!PT.undo.length) return toast("Nothing to undo."); const u = PT.undo; PT = Object.assign(JSON.parse(u.pop()), {undo: u}); ptRender(); }
function ptLog(msg){ PT.log.unshift((PT.turn ? `T${PT.turn} · ` : "") + msg); if (PT.log.length > 120) PT.log.length = 120; }
function ptDo(fn){
  ptDoDepth++;
  try { ptSnapshot(); PT_EV = []; fn(); ptRunTriggers(); if (ptMode() === "off") for (let i = 0; i < 20 && ptSBA(); i++); ptRender(); ptLegendCheck(); }
  finally { ptDoDepth--; }
  if (!ptDoDepth) setTimeout(ptMaybeAsk, 0);   // a choice waiting at the top of the stack opens by itself
}
const ptNameOf = c => c.faceDown ? "a face-down card" : c.name + (c.token ? " token" : "");
const ptGrid = () => Math.max(10, Math.min(34, innerWidth < 600 ? Math.min(prefs.ptGrid || 18, 13) : prefs.ptGrid || 18));
const ptFoot = c => c.tapped ? [PT_CH, PT_CW] : [PT_CW, PT_CH];   // squares a card covers: [wide, tall]
function ptTableSize(){
  const g = ptGrid(), box = $("ptBf"), w = box ? box.clientWidth - 2 : 1000, h = box ? box.clientHeight - 2 : 700;
  let cols = Math.max(Math.floor(w / g), PT_STEP * 6 + 1), rows = Math.max(Math.floor(h / g), PT_MIN_ROWS);
  for (const c of PT.bf) { const [fw, fh] = ptFoot(c); cols = Math.max(cols, c.x + fw + 1); rows = Math.max(rows, c.y + fh + 1); }
  return {cols, rows};
}
const ptOverlaps = (x, y, fw, fh, ignore) => PT.bf.some(o => { if ((ignore && ignore.has(o)) || o.att != null) return false; const [ow, oh] = ptFoot(o); return x < o.x + ow && o.x < x + fw && y < o.y + oh && o.y < y + fh; });
const PT_PILE = 10;
const ptTokKey = c => [c.name, c.power, c.toughness].join("|");
// what piles up: matching tokens, and same-name lands (not land creatures)
const ptIsPileLand = c => !c.token && !c.faceDown && ptIsLand(c) && !ptIsCreature(c);
const ptPileKey = c => c.att != null || PT.bf.some(o => o.att === c.uid) ? null : c.token ? "T|" + ptTokKey(c) : ptIsPileLand(c) ? "L|" + c.name : null;
// land piles keep tapped lands at the bottom so the untapped ones are on top, ready to tap
const ptPileSort = list => list.sort((a, b) => (ptIsPileLand(a) ? (b.tapped ? 1 : 0) - (a.tapped ? 1 : 0) : 0) || a.z - b.z);
// the other cards in the same stack as this one (same spot, same kind), bottom first
const ptPileOf = c => { const k = c && ptPileKey(c); return k && c.x != null ? ptPileSort(PT.bf.filter(o => o.x === c.x && o.y === c.y && ptPileKey(o) === k)) : (c ? [c] : []); };
// clicking a land pile taps the next untapped land in it (or untaps one when they're all tapped)
function ptTapPick(uid){
  const f = ptFind(uid); if (!f || f.zone !== "bf") return;
  if (ptAutoMana() && PT.phase === "play") {
    const pile = ptIsPileLand(f.card) ? ptPileOf(f.card) : [f.card], up = pile.filter(c => !c.tapped), c = up.length ? up[up.length - 1] : pile[pile.length - 1];
    const src = !c.tapped ? ptManaSource(c) : null;
    if (src && !src.sac && !src.mana) { c.tapped = true; c.z = ++PT.z; const us = src.units.map(u => u.map(o => Object.assign({}, o, {from: c.name}))); PT.pool = (PT.pool || []).concat(us); ptLog(`Tapped ${c.name} for mana.`); return; }
    if (c.tapped) { const i = (PT.pool || []).findIndex(u => u[0] && u[0].from === c.name); if (i >= 0) { PT.pool.splice(i, 1); c.tapped = false; ptLog(`Untapped ${c.name} (its mana left the pool).`); return; } }
  }
  const pile = ptIsPileLand(f.card) ? ptPileOf(f.card) : [f.card];
  if (pile.length < 2) return ptTap(uid);
  const up = pile.filter(c => !c.tapped);
  if (up.length) up[up.length - 1].tapped = true; else pile[pile.length - 1].tapped = false;
}
function ptPlace(card){
  const {cols} = ptTableSize(), [fw, fh] = ptFoot(card);
  const lanes = ptIsLand(card) && !ptIsCreature(card) ? PT_LANES.land : ptIsCreature(card) ? PT_LANES.creature : PT_LANES.other;
  // matching tokens pile up in one spot, 10 to a stack; the 11th starts a new stack right next to the last one
  if (ptPileKey(card)) {
    const key = ptPileKey(card), piles = new Map();
    for (const o of PT.bf) if (o !== card && o.x != null && ptPileKey(o) === key) { const k = o.x + "," + o.y; if (!piles.has(k)) piles.set(k, []); piles.get(k).push(o); }
    let open = null, last = null;
    for (const list of piles.values()) {
      const z = Math.max(...list.map(o => o.z || 0)), a = {x: list[0].x, y: list[0].y, z};
      if (!last || z > last.z) last = a;
      if (list.length < PT_PILE && (!open || z > open.z)) open = a;
    }
    if (open) return [open.x, open.y];
    if (last) {
      for (let x = last.x + PT_STEP; x + fw <= cols; x += PT_STEP) if (!ptOverlaps(x, last.y, fw, fh)) return [x, last.y];
      const li = lanes.indexOf(last.y), next = li >= 0 ? lanes.slice(li + 1) : [];
      for (const y of next.concat([last.y + PT_LANE, last.y + PT_LANE * 2])) for (let x = 1; x + fw <= cols; x += PT_STEP) if (!ptOverlaps(x, y, fw, fh)) return [x, y];
    }
  }
  for (const y of lanes) for (let x = 1; x + fw <= cols; x += PT_STEP) if (!ptOverlaps(x, y, fw, fh)) return [x, y];
  for (let y = 1; y < PT_MIN_ROWS + 40; y += PT_LANE) for (let x = 1; x + fw <= cols; x += PT_STEP) if (!ptOverlaps(x, y, fw, fh)) return [x, y];
  return [1, lanes[0]];
}
function ptClean(card){ card.tapped = false; card.counters = {}; card.faceDown = false; card.back = false; delete card.x; delete card.y;
  for (const k of ["evoked", "blitz", "dash", "unearthed", "disturbed", "kicked", "haste", "kw", "att", "eot", "dmg", "dt", "regen", "used", "pwTurn", "pwSet", "saddled", "renowned", "monstrous", "suspected", "anim", "cloak", "impending", "bestowed", "exerted", "proto", "paid", "overloaded", "entwined", "castFace", "attackedTurn", "harnessed", "earth", "fromHand", "wasCast", "emerged"]) delete card[k];
  if (card.orig) { Object.assign(card, card.orig); delete card.orig; } }
// Move a card between zones. opts: {x, y} squares on the battlefield, {bottom} for the library, {faceDown}
function ptMove(uid, to, opts = {}){
  const f = ptFind(uid); if (!f) return;
  const card = f.card, from = f.zone;
  // unearthed cards, and disturbed ones going to the graveyard, are exiled instead
  if (from === "bf" && to !== "bf" && to !== "exile" && (card.unearthed || (card.disturbed && to === "grave"))) { to = "exile"; ptLog(`${card.name} is exiled instead (${card.unearthed ? "unearth" : "disturb"}).`); }
  if (from === to && to !== "bf" && to !== "lib") return;
  PT[from].splice(f.i, 1);
  if (from === "bf" && to !== "bf") { const wasCre = ptIsCreature(card) || card.faceDown; ptEmit("ltb", card, {to}); if (to === "grave" && wasCre) { ptEmit("dies", card); PT.diedTurn = PT.turn; PT.diedN = (PT.diedTurn === PT.turn ? PT.diedN || 0 : 0) + 1; } }
  const earthBack = from === "bf" && to !== "bf" && card.earth && (to === "grave" || to === "exile");
  if (card.token && to !== "bf") { ptLog(`${card.name} token left the battlefield and stopped existing.`); return; }
  if (from === "bf" && to !== "bf") ptClean(card);
  if (earthBack) { ptLog(`${card.name} returns to the battlefield tapped (earthbend).`); card.tapped = true; card.z = ++PT.z; [card.x, card.y] = ptPlace(card); card.since = PT.turn; PT.bf.push(card); ptEmit("etb", card); return; }
  const castIt = opts.cast != null ? opts.cast : (from === "hand" || from === "cmd");
  if (to === "bf") {
    if (from !== "bf") { card.tapped = false; card.faceDown = !!opts.faceDown; }
    let x = opts.x, y = opts.y; if (x == null) [x, y] = ptPlace(card);
    card.x = Math.max(0, x); card.y = Math.max(0, y); card.z = ++PT.z;
    if (from !== "bf") card.since = PT.turn;
    if (from === "cmd") { PT.tax[card.uid] = (PT.tax[card.uid] || 0) + 1; ptLog(`Cast ${card.name} from the command zone${PT.tax[card.uid] > 1 ? ` (tax was +${(PT.tax[card.uid] - 1) * 2})` : ""}.`); }
    else if (from !== "bf") ptLog(`${from === "hand" ? "Played" : "Put"} ${ptNameOf(card)}${from !== "hand" ? ` from ${ptZoneName(from)}` : ""} onto the battlefield.`);
    PT.bf.push(card);
    if (from !== "bf") {
      card.fromHand = from === "hand";
      ptEnterReplace(card, from);
      if (ptIsSaga(card) && !card.faceDown) ptAddCounters(card.uid, "lore", 1);
      if (ptIsLand(card) && from === "hand") ptEmit("landplay", card);
      else if (castIt && !card.faceDown) { card.wasCast = true; PT.castN++; if (from === "exile") PT.exileCastN = (PT.exileCastN || 0) + 1; ptEmit("cast", card, {nth: PT.castN, from, exileNth: from === "exile" ? PT.exileCastN : 0}); }
      ptEmit("etb", card);
    }
    return;
  }
  if (to === "lib") { if (opts.bottom) PT.lib.push(card); else PT.lib.unshift(card); ptLog(`Put ${card.name} on the ${opts.bottom ? "bottom" : "top"} of the library.`); return; }
  PT[to].push(card);
  if (to === "grave" && from === "hand" && castIt && !ptIsPermanentType(card) && /(?:^|\n)Rebound\b/.test(ptFaceText(card))) {
    to = "exile"; PT.rebound = (PT.rebound || []).concat(card.uid); PT.grave.pop(); PT.exile.push(card);
  }
  if ((to === "grave" || to === "exile") && (from === "hand" || opts.cast) && !ptIsPermanentType(card) && castIt) { ptLog(`Cast ${card.castFace != null && card.name.includes(" // ") ? card.name.split(" // ")[card.castFace] : card.name}${opts.how ? ` (${opts.how})` : ""}.`); PT.lastSpell = ptSnap(card); PT.castN++; if (from === "exile") PT.exileCastN = (PT.exileCastN || 0) + 1; ptEmit("cast", card, {nth: PT.castN, from, exileNth: from === "exile" ? PT.exileCastN : 0}); }
  else { ptLog(`${card.name}: ${ptZoneName(from)} → ${ptZoneName(to)}.`); if (from === "hand" && to === "grave") { PT.discTurn = PT.discTurn || {}; PT.discTurn[card.uid] = PT.turn; ptEmit("discard", card); } }
}
const ptZoneName = z => ({lib: "library", hand: "hand", grave: "graveyard", exile: "exile", cmd: "command zone", bf: "battlefield"})[z] || z;
// Playing from hand with a click: permanents go to the battlefield, instants and sorceries resolve into the graveyard
function ptPlay(uid){ const f = ptFind(uid); if (!f) return; ptMove(uid, ptIsPermanentType(f.card) ? "bf" : "grave", {cast: true}); }
function ptDraw(n = 1){
  let k = 0; for (; k < n && PT.lib.length; k++) {
    const c = PT.lib.shift(); PT.hand.push(c); PT.drawN++; ptEmit("draw", c, {nth: PT.drawN});
    if (PT.drawN === 1 && PT.phase === "play" && ptMode() !== "off" && ptKwPrinted(c).some(x => x.key === "miracle"))
      ptAddPrompt({srcUid: c.uid, srcName: c.name, img: c.img, kind: "miracle", text: `Miracle: it's the first card you drew this turn, so cast it for its miracle cost (${(ptKwPrinted(c).find(x => x.key === "miracle") || {}).val || ""}).`, actions: [{t: "castCard", uid: c.uid, how: "miracle", label: `Cast ${c.name} (miracle)`}], fresh: true});
  }
  if (k) ptLog(k === 1 ? "Drew a card." : `Drew ${k} cards.`);
  if (k < n) { ptLog("The library is empty."); toast("Your library is empty."); }
}
function ptMill(n = 1){ let k = 0; for (; k < n && PT.lib.length; k++) PT.grave.push(PT.lib.shift()); ptLog(`Milled ${k} card${k === 1 ? "" : "s"}.`); }
// shuffling your library (a replay of a planned line keeps the planned order: PT._noShuffle)
const ptLibShuffle = () => { if (!PT._noShuffle) shuffle(PT.lib); };
function ptShuffle(){ ptLibShuffle(); ptLog(PT._noShuffle ? "Shuffled the library (the planned draws stay in order)." : "Shuffled the library."); }
function ptUntapAll(){ let n = 0; PT.bf.forEach(c => { if (c.tapped) { c.tapped = false; n++; } }); ptLog(n ? `Untapped ${n} permanent${n === 1 ? "" : "s"}.` : "Nothing to untap."); }
function ptNextTurn(){
  if (PT.phase !== "play") return toast("Keep your opening hand first.");
  if (PT.endDone !== PT.turn) ptEndTurn();   // end-step triggers of the turn that's finishing come first
  ptResolved = []; ptAutoRecent = [];
  ptCleanup();
  const extra = (PT.extraTurns || 0) > 0; if (extra) PT.extraTurns--;
  PT.turn++;
  PT.bf.forEach(c => {
    if (c.exerted && c.exerted === PT.turn - 1) { delete c.exerted; return; }   // exerted: it doesn't untap this time
    if (c.counters && c.counters.stun && c.tapped) { ptCounter(c.uid, "stun", -1); ptLog(`${c.name}: a stun counter comes off instead of untapping.`); return; }
    c.tapped = false; if (!c.dash && !c.blitz && !c.unearthed && !c.earth && !c.anim) delete c.haste;
  });
  PT.castN = 0; PT.drawN = 0; PT.exileCastN = 0;
  ptLog(`${extra ? "Extra turn! " : ""}Turn ${PT.turn}: untapped.`);
  if (!extra) { ptOppsFix(); for (const o of PT.opps) for (const b of o.board) b.tapped = false; ptOppGrow(); }
  ptEmit("upkeep"); ptUpkeepRules();
  for (const u of PT.rebound || []) { const f = ptFind(u); if (f && f.zone === "exile") ptAddPrompt({srcUid: u, srcName: f.card.name, img: f.card.img, kind: "rebound", text: "Rebound: cast it again from exile without paying its mana cost.", actions: [{t: "recast", uid: u, label: `Cast ${f.card.name} again`}], fresh: true}); }
  PT.rebound = [];
  ptDraw(1); ptEmit("drawstep"); ptEmit("main"); ptMainRules();
}
function ptMulligan(){
  PT.lib.push(...PT.hand.splice(0)); shuffle(PT.lib); PT.mull++;
  for (let i = 0; i < 7 && PT.lib.length; i++) PT.hand.push(PT.lib.shift());
  ptLog(`Mulligan ${PT.mull}: new 7.`);
}
function ptKeep(){
  const free = PT.isCmd && prefs.ptFreeMull !== false ? 1 : 0;
  PT.toBottom = Math.max(0, PT.mull - free);
  if (PT.toBottom) { PT.phase = "bottom"; ptLog(`Kept. Choose ${PT.toBottom} card${PT.toBottom === 1 ? "" : "s"} to put on the bottom.`); }
  else ptStart("Kept the opening hand.");
}
function ptStart(msg){
  PT.phase = "play"; PT.turn = 1;
  if (prefs.ptDrawT1) { if (PT.lib.length) PT.hand.push(PT.lib.shift()); ptLog(msg + " Turn 1: drew a card."); }
  else ptLog(msg + " Turn 1 (on the play, no draw).");
}
function ptBottomPick(uid){
  const f = ptFind(uid); if (!f || f.zone !== "hand") return;
  PT.hand.splice(f.i, 1); PT.lib.push(f.card); PT.toBottom--;
  if (PT.toBottom <= 0) ptStart("Put the cards on the bottom.");
}
// Blink: exile it and bring it straight back (or at the end step) — it's a new object, so enter triggers go off again
// Explore: reveal the top card; a land goes to your hand, anything else gives a +1/+1 counter and stays on top
function ptExplore(uid, p){
  const f = ptFind(uid), top = PT.lib[0]; if (!f) return;
  if (!top) { ptLog(`${f.card.name} explores: your library is empty.`); return; }
  if (ptIsLand(top)) { PT.lib.shift(); PT.hand.push(top); ptLog(`${f.card.name} explores: ${top.name} (land) → hand.`); if (p) p.result = `${top.name} → hand`; }
  else { const k = ptAddCounters(uid, "p1p1", 1); ptLog(`${f.card.name} explores: ${top.name} (not a land) stays on top, ${k} +1/+1 counter${k > 1 ? "s" : ""}.`); if (p) p.result = `${top.name} stays on top, +1/+1`; }
  ptEmit("explore", f.card);
}
function ptBlink(uid, delay){
  const f = ptFind(uid); if (!f || f.zone !== "bf") return;
  const tok = f.card.token, nm = f.card.name;
  ptMove(uid, "exile");
  if (tok) return;   // a token that leaves stops existing
  if (delay) { PT.delayed = (PT.delayed || []).concat({uid, act: "return", why: "Blink"}); ptLog(`${nm} is exiled until the end step.`); }
  else { ptMove(uid, "bf", {cast: false}); ptLog(`Blinked ${nm}.`); }
}
// Clone / Spark Double: it becomes a copy as it enters, so the copied card's enter abilities trigger
function ptBecomeCopy(cloneUid, ofUid){
  const c = ptFind(cloneUid), o = ptFind(ofUid); if (!c || !o || c.zone !== "bf") return;
  const card = c.card, src = o.card, ownText = ptFaceText(card);
  card.orig = card.orig || {name: card.name, type: card.type, text: card.text, img: card.img, power: card.power, toughness: card.toughness, colors: card.colors, cmc: card.cmc};
  Object.assign(card, {name: src.name, type: src.type, text: src.text, img: src.back ? src.img.replace("/front/", "/back/") : src.img, power: src.power, toughness: src.toughness, colors: src.colors, cmc: src.cmc});
  if (/additional \+1\/\+1 counter/i.test(ownText) && ptIsCreature(card)) ptAddCounters(cloneUid, "p1p1", 1);
  if (/isn't legendary/i.test(ownText)) card.type = (card.type || "").replace(/\bLegendary /g, "");
  ptLog(`${card.orig.name} entered as a copy of ${src.name}.`);
  ptEmit("etb", card, {selfOnly: true});
}
// The legend rule: two legendary permanents with the same name → you keep one, the rest go to the graveyard
// (that's not a sacrifice, but they do die). Mirror Gallery and Mirror Box turn it off.
const ptFaceName = c => (c.name || "").includes(" // ") ? c.name.split(" // ")[c.back ? 1 : 0] : c.name;
const ptFaceType = c => (c.type || "").split(" // ")[(c.name || "").includes(" // ") && c.back ? 1 : 0] || c.type || "";
function ptLegendGroups(){
  if (PT.bf.some(s => !s.faceDown && /legend rule["”]? doesn't apply/i.test(ptFaceText(s)))) return [];
  const g = new Map();
  for (const c of PT.bf) { if (c.faceDown || !/\bLegendary\b/.test(ptFaceType(c))) continue; const n = ptFaceName(c); if (!g.has(n)) g.set(n, []); g.get(n).push(c); }
  return [...g.values()].filter(x => x.length > 1);
}
function ptLegendCheck(){
  if (!PT || !$("ptModal").hidden) return;
  const grp = ptLegendGroups()[0]; if (!grp) return;
  PT_VIEW = {kind: "legend", uids: grp.map(c => c.uid)};
  const nm = ptFaceName(grp[0]);
  ptModal("Legend rule", `<p>You control ${grp.length} legendary permanents named <b>${esc(nm)}</b>. Choose the one to keep; the other${grp.length > 2 ? "s go" : " goes"} to the graveyard. (That's not a sacrifice, but they do die, so death triggers happen.)</p>
    <div class="ptd-grid">${grp.slice().sort((a, b) => b.z - a.z).map((c, i) => `<div class="ptd-card"><div class="ptd-img" data-uid-view="${c.uid}">${ptFace(c)}</div><b>${esc(nm)}</b>
      <small class="cur-sub">${[i === 0 ? "newest" : "", c.commander ? "your commander" : "", c.orig ? `copy (${esc(c.orig.name)})` : "", c.token ? "token" : ""].filter(Boolean).join(" · ")}</small>
      <small class="cur-sub">${esc(ptPT(c) || "")}${Object.keys(c.counters || {}).length ? " · " + Object.entries(c.counters).map(([k, v]) => `${v} ${esc(ptCounterName(k))}`).join(", ") : ""}${c.tapped ? " · tapped" : ""}</small>
      <div class="ptd-acts"><button type="button" class="btn primary" data-legkeep="${c.uid}">Keep this one</button></div></div>`).join("")}</div>`, "");
}
// Sacrificing is its own event (Ashling, Korvold, Mazirek…), then the card dies like any other
function ptSacrifice(uid){
  const f = ptFind(uid); if (!f || f.zone !== "bf") return;
  ptEmit("sac", f.card); ptLog(`Sacrificed ${f.card.name}${f.card.token ? " token" : ""}.`);
  ptMove(uid, "grave");
}
// Ways to cast a card besides paying its normal cost: its own keywords, plus evoke given by cards like Ashling
const PT_WAYS = {cascade: "Cascade", evoke: "Evoke", dash: "Dash", blitz: "Blitz", kicker: "Kicked", flashback: "Flashback", escape: "Escape", unearth: "Unearth", disturb: "Disturb", emerge: "Emerge", madness: "Madness"};
function ptCastWays(c, zone){
  if (zone === "exile") return ptCastWays2(c, "exile");
  const out = [], seen = new Set(), text = c.text || "";
  const add = (k, cost, why) => { if (seen.has(k)) return; seen.add(k); out.push({k, cost, why}); };
  for (const m of text.matchAll(/^(Evoke|Dash|Blitz|Kicker|Multikicker|Flashback|Escape|Unearth|Disturb|Emerge|Madness)\b[ —–-]*([^\n(]*)/gm)) {
    const k = m[1].toLowerCase().replace("multikicker", "kicker"), fromGrave = ["flashback", "escape", "unearth", "disturb"].includes(k);
    if ((zone === "grave") === fromGrave) add(k, m[2].trim());
  }
  if (zone === "hand" && ptIsPermanentType(c) && !ptIsLand(c)) for (const s of PT.bf) {
    const g = ptFaceText(s).match(/(?:^|\n)([^\n.]*?)spells you cast(?: from your hand)? (?:have|gain) evoke (\{[^ ]+?\})/i);
    if (g && trFits(g[1].toLowerCase().replace(/\bpermanent\b/, ""), c)) add("evoke", g[2], s.name);
  }
  for (const w of ptCastWays2(c, zone)) add(w.k, w.cost);
  return out;
}
function ptCastWay(uid, way){
  if (ptCastWay2(uid, way)) return;
  const f = ptFind(uid); if (!f) return; const c = f.card, perm = ptIsPermanentType(c), name = c.name;
  const toBf = (extra) => { ptMove(uid, "bf", {cast: true}); Object.assign(c, extra || {}); };
  if (way === "evoke") {
    toBf({evoked: true}); ptLog(`${name} was cast for its evoke cost.`);
    if (ptMode() === "off") ptSacrifice(uid); else ptEmit("evokeSac", c);
  } else if (way === "dash") { toBf({dash: true, haste: true}); PT.delayed = (PT.delayed || []).concat({uid, act: "hand", why: "Dash"}); ptLog(`${name} was dashed: it has haste and returns to your hand at the end step.`); }
  else if (way === "blitz") { toBf({blitz: true, haste: true}); PT.delayed = (PT.delayed || []).concat({uid, act: "sac", why: "Blitz"}); ptLog(`${name} was blitzed: haste, sacrificed at the end step, draw a card when it dies.`); }
  else if (way === "kicker") { c.kicked = true; perm ? ptMove(uid, "bf", {cast: true, how: "kicked"}) : ptMove(uid, "grave", {cast: true, how: "kicked"}); ptLog(`${name} was kicked.`); }
  else if (way === "emerge" || way === "madness") { perm ? ptMove(uid, "bf", {cast: true}) : ptMove(uid, "grave", {cast: true, how: way}); ptLog(`${name} was cast with ${way}${way === "emerge" && !c.emerged ? " (sacrifice the creature yourself: right-click it → Sacrifice)" : ""}.`); }
  else if (way === "flashback") ptMove(uid, "exile", {cast: true, how: "flashback"});
  else if (way === "cascade") {
    ptPlay(uid);
    ptAddPrompt({srcUid: uid, srcName: name, img: c.img, kind: "cascade", text: "Cascade (given by another effect): exile cards from the top until a nonland card with lower mana value, cast it free, the rest go to the bottom in a random order.", actions: [{t: "cascade", mv: c.cmc ?? 0, label: `Cascade (mana value under ${c.cmc ?? 0})`}], fresh: true});
  }
  else if (way === "escape") { perm ? toBf() : ptMove(uid, "exile", {cast: true, how: "escape"}); ptLog(`${name} escaped${perm ? "" : " and was exiled"}.`); }
  else if (way === "unearth") { ptMove(uid, "bf", {cast: false}); Object.assign(c, {unearthed: true, haste: true}); PT.delayed = (PT.delayed || []).concat({uid, act: "exile", why: "Unearth"}); ptLog(`${name} was unearthed: haste, exiled at the end step.`); }
  else if (way === "disturb") { ptMove(uid, "bf", {cast: true}); Object.assign(c, {disturbed: true, back: ptCanTransform(c)}); ptLog(`${name} was cast with disturb${c.back ? ", transformed" : ""}.`); }
}
// "At the beginning of the next end step…" follow-ups (dash, blitz, unearth, Ashling's copies…)
function ptRunDelayed(){
  const due = PT.delayed || []; PT.delayed = [];
  for (const d of due) {
    const f = ptFind(d.uid); if (!f || f.zone !== (d.act === "return" ? "exile" : "bf")) continue;
    const nm = f.card.name + (f.card.token ? " token" : "");
    const label = {hand: `Return ${nm} to your hand`, sac: `Sacrifice ${nm}`, exile: `Exile ${nm}`, return: `Return ${nm} to the battlefield`}[d.act];
    const act = {hand: "tohand", sac: "sacrifice", exile: "toexile", return: "fromexile"}[d.act];
    if (ptMode() === "off" && !d.unless) { ptDo0(() => ptResolve({srcUid: d.uid, srcName: d.why, actions: [{t: act, uid: d.uid, label}]})); continue; }
    ptAddPrompt({srcUid: d.uid, srcName: d.why || nm, img: f.card.img, kind: "delayed", text: `${d.why}: ${label.toLowerCase()} at the end step${d.unless ? ` ${d.unless}` : ""}.`, actions: [{t: act, uid: d.uid, label}], unless: d.unless, conditional: !!d.unless, fresh: true});
  }
}
const ptDo0 = fn => fn();
function ptTap(uid){ const f = ptFind(uid); if (!f || f.zone !== "bf") return; f.card.tapped = !f.card.tapped; f.card.z = ++PT.z; }
function ptCounter(uid, kind, delta){
  const f = ptFind(uid); if (!f) return; const c = f.card;
  // +1/+1 and −1/−1 counters cancel out, as the rules say
  if (kind === "p1p1" && delta > 0 && c.counters.m1m1) { c.counters.m1m1--; if (!c.counters.m1m1) delete c.counters.m1m1; return; }
  if (kind === "m1m1" && delta > 0 && c.counters.p1p1) { c.counters.p1p1--; if (!c.counters.p1p1) delete c.counters.p1p1; return; }
  const v = (c.counters[kind] || 0) + delta; if (v <= 0) delete c.counters[kind]; else c.counters[kind] = v;
}
function ptCopy(uid, n = 1){
  const f = ptFind(uid); if (!f) return []; const src = f.card, made = [];
  for (let i = 0; i < n; i++) {
    const t = Object.assign({}, src, {uid: ++ptUid, token: true, copyOf: src.name, tapped: false, counters: {}, faceDown: false, commander: false, back: src.back, z: ++PT.z, wasCast: false, fromHand: false,
      evoked: false, blitz: false, dash: false, unearthed: false, disturbed: false, kicked: false, haste: false});
    [t.x, t.y] = ptPlace(t);   // copies fan out together in the next free spot of the right lane
    t.since = PT.turn; PT.bf.push(t); ptEmit("token", t); ptEmit("etb", t); made.push(t.uid);
  }
  ptLog(`Made ${n === 1 ? "a token copy" : n + " token copies"} of ${src.name}.`);
  return made;
}
function ptCreateToken(def, n = 1){
  for (let i = 0; i < n; i++) {
    const t = ptMakeCard(def, {token: true});
    [t.x, t.y] = ptPlace(t); t.z = ++PT.z; t.since = PT.turn; PT.bf.push(t); ptEmit("token", t); ptEmit("etb", t);
  }
  ptLog(`Created ${n === 1 ? "a" : n} ${def.name} token${n === 1 ? "" : "s"}.`);
}
const ptPT = c => { const st = ptStats(c); if (!st) return c.power || c.toughness ? `${c.power}/${c.toughness}` : ""; return `${st[0]}/${st[1]}`; };


