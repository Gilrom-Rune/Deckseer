/* ----- mana: paying for spells by tapping the right lands, rocks and creatures ----- 
   A mana unit is a list of the ways it can be spent: [{c: "G"}, {c: "W", pain: 1}, {c: "R", only: "creature"}].
   PT.pool holds mana already made (rituals, Treasures, lands you tapped by hand). Clicking a card in your hand
   pays its cost from the pool first, then from untapped sources, choosing so every colour can be paid. */
const PT_WUBRG = ["W", "U", "B", "R", "G"];
const PT_BASIC_MANA = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: "C"};
const ptAutoMana = () => prefs.ptAutoMana !== false;
function ptCI(){
  if (PT._ci) return PT._ci;
  const d = (typeof decks !== "undefined" ? decks : []).find(x => x.id === PT.deckId);
  const ci = new Set(); for (const c of (d && d.commanders) || []) for (const x of c.ci || c.colors || []) ci.add(x);
  return PT._ci = ci.size ? PT_WUBRG.filter(x => ci.has(x)) : PT_WUBRG.slice();
}
// "{g} or {w}", "{c}{c}", "one mana of any color", "three mana of any one color", "{r}{r}{r}" → units
function ptManaUnits(what, extra = {}){
  { const fe = String(what || "").toLowerCase().match(/^(.+?) for each ([a-z ,'-]+?)(?: you control| on the battlefield)?$/);
    if (fe && PT) { const base = ptManaUnits(fe[1], extra), k = PT.bf.filter(c => !c.faceDown && trFits(fe[2], c)).length; return [].concat(...Array(k).fill(0).map(() => base.map(u => u.map(o => Object.assign({}, o))))); } }
  const w = String(what || "").toLowerCase(), words = {one: 1, two: 2, three: 3, four: 4, five: 5, x: 1};
  const any = /commander's color identity/.test(w) ? ptCI() : PT_WUBRG;
  const mk = list => list.map(c => Object.assign({c}, extra));
  let m;
  if ((m = w.match(/^(one|two|three|four|five) mana (?:of any (?:one )?colou?r|in any combination of colou?rs)/))) return Array.from({length: words[m[1]]}, () => mk(any));
  if ((m = w.match(/^(one|two|three) mana of any colou?r in your commander/))) return Array.from({length: words[m[1]]}, () => mk(any));
  if (/ or /.test(w) && !/\}\{/.test(w)) { const cs = [...w.matchAll(/\{([wubrgc])\}/g)].map(x => x[1].toUpperCase()); return cs.length ? [mk(cs)] : []; }
  const syms = [...w.matchAll(/\{([wubrgc])\}/g)].map(x => x[1].toUpperCase());
  return syms.map(c => mk([c]));
}
// What an untapped permanent can make, as one choice of units (abilities that each make one unit are merged)
function ptManaSource(c){
  if (c.faceDown || c.tapped) return null;
  if (ptIsCreature(c) && c.since === PT.turn && !c.haste && !ptHasKw(c, "haste")) return null;   // summoning sick
  const out = [];
  let abs = [];
  try { abs = trActivated(c).filter(a => a.kind === "mana" && a.actions[0] && a.actions[0].t === "mana"); } catch (e) { abs = []; }
  const singles = [], multis = [];
  for (const a of abs) {
    const cs = a.cost || {};
    if (!cs.tap || cs.sac.length || cs.discard.length || cs.tapCre.length || cs.remove.length || cs.exileGrave.length || cs.returnLand.length || cs.untap) continue;
    const lbl = String(a.label || "").toLowerCase(), pain = (lbl.match(/deals (\d+) damage to you/) || [])[1];
    // "Activate only if you control five or more lands" (Temple of the False God): only when that's true
    const line = ptFaceText(c).split("\n").map(l => l.toLowerCase()).find(l => l.startsWith(lbl.slice(0, Math.min(14, lbl.length)))) || lbl;
    const onlyIf = line.match(/activate only if ([^.]+)/);
    if (onlyIf && PT && trEvalIf(onlyIf[1], {src: {card: c}}) === false) continue;
    const only = /spend this mana only to cast (?:a |an )?creature spell/.test(lbl) ? "creature" : /spend this mana only to cast (?:an? )?(artifact|instant or sorcery|noncreature)/.test(lbl) ? lbl.match(/only to cast (?:an? )?([a-z ]+?) spell/)[1] : null;
    const units = ptManaUnits(a.actions[0].what, only ? {only} : {});
    if (!units.length) continue;
    if (pain) units.forEach(u => u.forEach(o => { if (o.c !== "C" || /\{c\}\{c\}/.test(lbl)) o.pain = +pain; }));
    const r = {units, sac: !!cs.sacSelf, mana: cs.mana || "", label: a.label};
    (units.length === 1 && !cs.mana && !cs.sacSelf ? singles : multis).push(r);
  }
  if (!abs.length && ptIsLand(c)) {   // basic land types: "({T}: Add {G}.)" is only reminder text
    const ty = ptFaceType(c), cs = Object.keys(PT_BASIC_MANA).filter(k => new RegExp("\\b" + k + "\\b").test(ty)).map(k => PT_BASIC_MANA[k]);
    if (cs.length) singles.push({units: [cs.map(x => ({c: x}))], sac: false, mana: ""});
  }
  if (singles.length) out.push({units: [[].concat(...singles.map(s => s.units[0]))], sac: false, mana: ""});
  out.push(...multis);
  if (!out.length) return null;
  // the best single way: the plain merged one, else one that makes the most
  const best = out.find(o => !o.sac && !o.mana) || out.slice().sort((a, b) => b.units.length - a.units.length)[0];
  return {card: c, units: best.units, sac: best.sac, mana: best.mana, alts: out};
}
// "{3}{G}{G}", "{X}{R}", "{2/W}", "{G/P}", "{G/U}" → pips
function ptCostPips(cost, x = 0){
  const pips = []; let generic = 0;
  for (const m of String(cost || "").split(" // ")[0].matchAll(/\{([^}]+)\}/g)) {
    const s = m[1].toUpperCase();
    if (/^\d+$/.test(s)) generic += +s;
    else if (s === "X") generic += x;
    else if (s === "S") generic += 1;
    else if (PT_WUBRG.includes(s) || s === "C") pips.push([s]);
    else if (/^[WUBRG]\/P$/.test(s)) pips.push([s[0], "life"]);
    else if (/^2\/[WUBRG]$/.test(s)) pips.push([s[2], "2"]);
    else if (/^[WUBRGC]\/[WUBRG]$/.test(s)) pips.push([s[0], s[2]]);
  }
  return {pips, generic};
}
const ptUnitFits = (o, need, spell) => (need === "*" || o.c === need) && (!o.only || ptOnlyOk(o.only, spell));
const ptOnlyOk = (only, spell) => !spell ? false : only === "creature" ? ptIsCreature(spell) || /\bCreature\b/.test(ptFaceType(spell)) : only === "noncreature" ? !/\bCreature\b/.test(ptFaceType(spell)) : new RegExp("\\b(" + only.split(" or ").join("|") + ")\\b", "i").test(ptFaceType(spell));
// Work out a payment. Returns {use: [{src|pool, unit, as}], tap: [cards], sac: [cards], pain, life, left: [units back to the pool]} or {missing}
function ptPlan(cost, spell, opts = {}){
  const {pips, generic} = ptCostPips(cost, opts.x || 0);
  const pool = (PT.pool || []).map((u, i) => ({pool: i, unit: u, score: 0}));
  const srcs = [];
  for (const c of PT.bf) {
    if (spell && c.uid === spell.uid) continue;
    const s = ptManaSource(c); if (!s) continue;
    const flex = Math.max(...s.units.map(u => u.length));   // how many colours one of its mana can be (Sol Ring's {C}{C} is as plain as a Wastes)
    s.score = (s.sac ? 50 : 0) + (s.mana ? 30 : 0) + (ptIsCreature(c) ? 8 : 0) + flex + (s.units.some(u => u.some(o => o.pain)) ? 3 : 0) + (s.units.some(u => u.some(o => o.only)) ? -2 : 0)
      + (s.units.length > 1 && s.units.length > generic ? 4 : 0);   // tapping Sol Ring for one generic wastes a {C}
    srcs.push(s);
  }
  srcs.sort((a, b) => a.score - b.score);
  // convoke: untapped creatures (even summoning sick) can pay generic or one pip of their colour
  const convoke = spell && ptKwPrinted(spell).some(k => k.key === "convoke") ? PT.bf.filter(c => ptIsCreature(c) && !c.tapped && !srcs.some(s => s.card === c) && c.uid !== spell.uid) : [];
  // every unit that could be spent, cheapest first
  const supply = [];
  pool.forEach(p => supply.push({kind: "pool", i: p.pool, unit: p.unit, score: -10}));
  // colourless-only mana is spent before mana that could have been a colour, so the colours stay for later spells
  srcs.forEach((s, si) => s.units.forEach((u, ui) => supply.push({kind: "src", si, ui, unit: u, score: s.score + ui * 0.01 + (u.every(o => o.c === "C") ? -0.5 : 0)})));
  convoke.forEach(c => supply.push({kind: "convoke", card: c, unit: (c.colors && c.colors.length ? c.colors : ["C"]).map(x => ({c: x})).concat([{c: "*", convoke: true}]), score: 100}));
  supply.sort((a, b) => a.score - b.score);
  // colored pips first (fewest ways to pay first), then generic
  const order = pips.map((p, i) => ({p, i, ways: supply.filter(s => s.unit.some(o => p.some(n => n.length === 1 && ptUnitFits(o, n, spell)))).length})).sort((a, b) => a.ways - b.ways);
  const used = new Set(), assign = []; let nodes = 0, best = null;
  const key = s => s.kind === "pool" ? "p" + s.i : s.kind === "src" ? "s" + s.si + ":" + s.ui : "v" + s.card.uid;
  const dfs = k => {
    if (++nodes > 20000 || best) return;
    if (k === order.length) {
      // generic: anything left, cheapest first; a multi-unit source already tapped is free to finish
      const tapped = new Set(assign.filter(a => a.s && a.s.kind === "src").map(a => a.s.si));
      const rest = supply.filter(s => !used.has(key(s)) && s.unit.some(o => !o.only || ptOnlyOk(o.only, spell))).sort((a, b) => ((a.kind === "src" && tapped.has(a.si)) ? -20 : a.score) - ((b.kind === "src" && tapped.has(b.si)) ? -20 : b.score));
      let g = generic; const gen = [];
      for (const s of rest) { if (g <= 0) break; const o = s.unit.find(o => !o.only || ptOnlyOk(o.only, spell)); gen.push({s, o}); if (s.kind === "src") tapped.add(s.si); g--; }
      if (g > 0) return;
      best = assign.concat(gen.map(x => ({s: x.s, o: x.o, as: "generic"})));
      return;
    }
    const {p} = order[k];
    for (const s of supply) {
      if (used.has(key(s))) continue;
      const o = s.unit.find(o => p.some(n => n.length === 1 && ptUnitFits(o, n, spell)));
      if (!o) continue;
      used.add(key(s)); assign.push({s, o, as: o.c}); dfs(k + 1); if (best) return; assign.pop(); used.delete(key(s));
    }
    if (p[1] === "life") { assign.push({life: 2}); dfs(k + 1); if (best) return; assign.pop(); }
  };
  dfs(0);
  // {2/W}: if that colour can't be found, it costs {2} instead
  if (!best && /\{2\/[WUBRG]\}/i.test(cost)) return ptPlan(String(cost).replace(/\{2\/[WUBRG]\}/gi, "{2}"), spell, opts);
  if (!best) {
    const have = supply.reduce((t, s) => t + 1, 0), need = pips.length + generic;
    const miss = []; const counts = {}; for (const {p} of order) { const c = p[0]; if (!supply.some(s => s.unit.some(o => p.some(n => n.length === 1 && ptUnitFits(o, n, spell))))) counts[c] = (counts[c] || 0) + 1; }
    for (const [c, n] of Object.entries(counts)) miss.push(`{${c}}`.repeat(n));
    return {missing: miss.join("") || (need > have ? `${need - have} more mana` : "the right colours"), have, need};
  }
  // what gets tapped / sacrificed, and leftovers from multi-mana sources go to the pool
  const tapSrc = new Map();
  for (const a of best) if (a.s && a.s.kind === "src") { if (!tapSrc.has(a.s.si)) tapSrc.set(a.s.si, new Set()); tapSrc.get(a.s.si).add(a.s.ui); }
  const left = [];
  for (const [si, uis] of tapSrc) srcs[si].units.forEach((u, ui) => { if (!uis.has(ui)) left.push(u.map(o => Object.assign({}, o, {from: srcs[si].card.name}))); });
  const painBy = new Map(); for (const a of best) if (a.s && a.s.kind === "src" && a.o && a.o.pain) painBy.set(a.s.si, Math.max(painBy.get(a.s.si) || 0, a.o.pain));
  const pain = [...painBy.values()].reduce((t, v) => t + v, 0);
  return {
    pool: best.filter(a => a.s && a.s.kind === "pool").map(a => a.s.i),
    tap: [...tapSrc.keys()].map(si => srcs[si]),
    convoke: best.filter(a => a.s && a.s.kind === "convoke").map(a => a.s.card),
    life: best.reduce((t, a) => t + (a.life || 0), 0), pain, left,
    paidWith: best.map(a => a.life ? "2 life" : a.s.kind === "pool" ? "floating mana" : a.s.kind === "convoke" ? a.s.card.name + " (convoke)" : srcs[a.s.si].card.name)
  };
}
// Carry out a plan: tap, sacrifice, lose life, spend the pool, float the leftovers
function ptApplyPlan(plan, what){
  PT.pool = (PT.pool || []).filter((u, i) => !plan.pool.includes(i));
  for (const s of plan.tap) { s.card.tapped = true; s.card.z = ++PT.z; }
  for (const c of plan.convoke) { c.tapped = true; ptEmit("tapconvoke", c); }
  for (const s of plan.tap) if (s.sac) ptSacrifice(s.card.uid);
  const loss = plan.pain + plan.life;
  if (loss) { PT.life -= loss; ptEmit("loselife", null, {amount: loss}); }
  if (plan.left.length) PT.pool.push(...plan.left);
  const names = [...new Set(plan.paidWith)];
  ptLog(`Paid for ${what} with ${names.join(", ") || "nothing"}${loss ? ` (lost ${loss} life)` : ""}${plan.left.length ? ` · ${plan.left.length} mana left floating` : ""}.`);
}
// The mana pool as real mana symbols: one coloured circle per mana (split when it can be more than one colour)
const PT_PIP_COL = {W: "#f8f2cf", U: "#3d8fd6", B: "#2b2523", R: "#e0533b", G: "#2f9a52", C: "#b9b2ab"};
function ptPipHtml(u, isNew){
  const cs = [...new Set(u.map(o => o.c))].filter(c => PT_PIP_COL[c]), only = u.some(o => o.only);
  const from = u[0] && u[0].from ? ` from ${u[0].from}` : "";
  const what = cs.length >= 5 ? "one mana of any colour" : cs.length > 1 ? cs.join(" or ") : cs[0] === "C" ? "colourless" : {W: "white", U: "blue", B: "black", R: "red", G: "green"}[cs[0]];
  const tip = `${what}${from}${only ? ` (only for ${u.find(o => o.only).only} spells)` : ""}`;
  if (cs.length === 1) return `<span class="mana-pip ${cs[0]}${only ? " only" : ""}${isNew ? " new" : ""}" title="${esc(tip)}"><i>${cs[0]}</i></span>`;
  const step = 360 / cs.length, bg = `conic-gradient(${cs.map((c, i) => `${PT_PIP_COL[c]} ${i * step}deg ${(i + 1) * step}deg`).join(",")})`;
  return `<span class="mana-pip multi${only ? " only" : ""}${isNew ? " new" : ""}" style="--c:${bg};background:${bg}" title="${esc(tip)}"><i>${cs.length >= 5 ? "★" : ""}</i></span>`;
}
let ptPoolSeen = 0;
function ptPoolHtml(){
  const pool = PT.pool || []; if (!pool.length) { ptPoolSeen = 0; return ""; }
  const fresh = pool.length > ptPoolSeen ? ptPoolSeen : pool.length; ptPoolSeen = pool.length;
  const order = {W: 0, U: 1, B: 2, R: 3, G: 4, C: 5};
  const list = pool.map((u, i) => ({u, i})).sort((a, b) => (a.u.length - b.u.length) || ((order[a.u[0].c] ?? 9) - (order[b.u[0].c] ?? 9)));
  return `<button type="button" class="pt-pool" data-pt="pool" title="Your mana pool: it's spent first when you cast something, and empties at the end of the turn. Click to empty it now." aria-label="Mana pool: ${pool.length} mana. Click to empty it."><span>Mana</span><span class="pt-pool-list">${list.map(x => ptPipHtml(x.u, x.i >= fresh)).join("")}</span>${pool.length > 6 ? `<span class="pt-pool-n">${pool.length}</span>` : ""}</button>`;
}
const ptPoolTxt = () => (PT.pool || []).map(u => u.length >= 5 ? "{any}" : u.length > 1 ? "{" + u.map(o => o.c).join("/") + "}" : "{" + u[0].c + "}").join("");
// Add mana to the pool: rituals, Treasures and lands you tap by hand
function ptAddMana(what, from){ const us = ptManaUnits(what, {from}); PT.pool = (PT.pool || []).concat(us); return us.length; }
function ptEmptyPool(){ if ((PT.pool || []).length) ptLog(`${PT.pool.length} unspent mana emptied from your pool.`); PT.pool = []; }
// What a card costs to cast this way: its mana cost, or the cost of the way (evoke, flashback…), plus commander tax
// How each way of casting is paid (rules 118.9 and 601.2f): an alternative cost replaces the mana cost, an additional
// cost is added to it, and cost reductions apply to either. Some "ways" aren't casting a spell at all (unearth, plot,
// foretelling, suspending), so reductions and commander tax don't apply to them.
const PT_WAY_ADD = new Set(["kicker", "multikicker", "offspring", "squad", "buyback", "entwine", "escalate", "replicate", "splice", "conspire", "jumpstart", "retrace", "teamwork"]);
const PT_WAY_NOSPELL = new Set(["unearth", "plot", "foretell", "suspend"]);
const PT_WAY_FACE = new Set(["face0", "face1", "adventure", "aftermath"]);
const ptManaPart = s => (String(s || "").match(/^\s*((?:\{[^}]+\})+)/) || [])[1] || "";
function ptCastCost(c, zone, way){
  const faces = (c.cost || "").split(" // ");
  let cost;
  if (!way || way.k === "cascade" || way.k === "fromexile") cost = c.castFace === 1 && faces[1] ? faces[1] : faces[0];
  else if (PT_WAY_FACE.has(way.k)) cost = way.k === "face0" ? faces[0] : faces[1] || faces[0];
  else if (PT_WAY_ADD.has(way.k)) cost = faces[0] + ptManaPart(way.cost);
  else cost = ptManaPart(way.cost) || (way.k === "madness" || way.k === "evoke" || way.k === "dash" || way.k === "blitz" || way.k === "emerge" ? "" : faces[0]);
  if (way && PT_WAY_NOSPELL.has(way.k)) return cost;
  if (zone === "cmd" && PT.tax[c.uid]) cost += `{${PT.tax[c.uid] * 2}}`;
  if (!/\{/.test(cost)) return cost;
  const cuts = ptCostCuts(c).cuts.slice();
  if (way && way.k === "emerge") { const s = ptEmergeSac(c); if (s) cuts.push({gen: s.cmc || 0, pips: []}); }
  return ptReduceCost(cost, cuts);
}
// Emerge: sacrifice a creature and pay the emerge cost minus its mana value. It picks the one that saves the most.
function ptEmergeSac(c){ return PT.bf.filter(x => ptIsCreature(x) && x.uid !== c.uid && !x.commander).sort((a, b) => (b.cmc || 0) - (a.cmc || 0) || ptValue(a) - ptValue(b))[0] || null; }
// Ways to cast from your hand that can make a card affordable when its normal cost isn't
const PT_WAY_GLOW = new Set(["evoke", "dash", "blitz", "emerge", "prototype", "disguise", "warp", "mtmte", "impending", "face0", "face1", "adventure"]);
// What a "choose a type" card named: what you set, else the deck's most common creature type (or card type, for Cloud Key)
function ptChosenOf(c){
  if (c.chosenType) return c.chosenType;
  if (!/choose artifact, creature/i.test(ptFaceText(c))) return ptChosenType() || "creature";
  const d = (typeof decks !== "undefined" ? decks : []).find(x => x.id === PT.deckId), n = {};
  for (const k of (d ? d.cards : []).filter(k => k.board === "main" && !/\bLand\b/.test(k.type || ""))) for (const t of ["artifact", "creature", "enchantment", "instant", "sorcery"]) if (new RegExp("\\b" + t + "\\b", "i").test((k.type || "").split(" // ")[0])) n[t] = (n[t] || 0) + (k.qty || 1);
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || "creature";
}
// The creature type a "choose a creature type" card names here: the deck's setting, else its most common type
function ptChosenType(){
  if (PT._type != null) return PT._type;
  const d = (typeof decks !== "undefined" ? decks : []).find(x => x.id === PT.deckId);
  let t = ""; try { t = d ? (d.fwType || fwDeckType(d.cards.filter(c => c.board === "main").concat(d.commanders))) : ""; } catch (e) { t = ""; }
  return PT._type = String(t || "").toLowerCase();
}
// Cost reductions for casting this spell (rule 601.2f): from your permanents ("Elemental spells you cast cost {1} less",
// "Each creature spell you cast costs {1} less", Urza's Incubator's chosen type, Morophon's {W}{U}{B}{R}{G}, "the first … each turn")
// and from the spell itself ("This spell costs {1} less to cast for each …", affinity). Returns {cuts: [{gen, pips}], why: [names]}.
function ptCostCuts(spell){
  const cuts = [], why = [];
  const fitsSpell = ph => {
    ph = String(ph || "").replace(/\b(?:each|the|a|an|other)\b/g, " ").replace(/\bof the chosen type\b/, "").replace(/\s+/g, " ").trim();
    if (!ph) return true;
    const alt = ph.replace(/,? and |, /g, " or ").replace(/\bspell\b/g, "");
    try { return trFits(alt.trim() || "card", spell); } catch (e) { return false; }
  };
  // "for each +1/+1 counter on Animar", "for each creature you control with a +1/+1 counter on it"
  const count = (expr, src) => {
    const e = String(expr).trim(); let m;
    if ((m = e.match(/^([+-]1\/[+-]1|[a-z]+) counters? on cardname$/))) return ((src.counters || {})[{"+1/+1": "p1p1", "-1/-1": "m1m1"}[m[1]] || m[1]] || 0);
    if (/\byou control\b/.test(e)) return PT.bf.filter(x => trFits(e, x)).length;
    try { return ptCount(e, {src: {card: src}}); } catch (er) { return 0; }
  };
  const chosenOk = (src) => {
    if (src && /choose artifact, creature, enchantment/i.test(src.text || "")) { const t = ptChosenOf(src); return new RegExp("\\b" + t + "\\b", "i").test((spell.type || "").split(" // ")[0]); }
    const t = src ? ptChosenOf(src) : ptChosenType(); return !t || new RegExp("\\b" + t + "s?\\b", "i").test(spell.type || "") || /\bchangeling\b/i.test(spell.text || ""); };
  const amount = sym => { const m = [...String(sym).matchAll(/\{([^}]+)\}/g)].map(x => x[1].toUpperCase()); return {gen: m.filter(x => /^\d+$/.test(x)).reduce((t, x) => t + +x, 0), pips: m.filter(x => /^[WUBRGC]$/.test(x))}; };
  for (const src of PT.bf) {
    if (src.faceDown || src.uid === spell.uid) continue;
    const lines = ptFaceText(src).split("\n").flatMap(l => trLower(src, l).split(/(?<=\.)\s+/));
    for (const ln of lines) {
      const m = ln.match(/\b(the first |each )?((?:[a-z-]+(?:,| and| or)? )*?)spells? (?:you cast )?(of the chosen type |that share a creature type with [^c]+? )?(?:you cast )?(?:with (mana value (\d+) or (greater|less)|[a-z ]+?) )?(?:each turn )?costs? ((?:\{[^}]+\})+) less to cast(?: for each ([^.]+))?/);
      if (!m || /\b(?:your opponents|an opponent|opponents)\b/.test(ln.slice(0, m.index + m[0].length)) || /\btarget\b/.test(m[2])) continue;
      if (/cardname/.test(m[2])) continue;   // its own reduction is read from the spell below
      if (m[1] === "the first " && (PT.castN || 0) > 0) continue;
      if (!fitsSpell(m[2])) continue;
      if (m[3] && /chosen type/.test(m[3]) && !chosenOk(src)) continue;
      if (m[5] && !(m[6] === "less" ? (spell.cmc || 0) <= +m[5] : (spell.cmc || 0) >= +m[5])) continue;
      if (m[4] && !m[5] && !fitsSpell("with " + m[4])) continue;
      let a = amount(m[7]); if (m[8]) { const k = count(m[8], src); a = {gen: a.gen * k, pips: [].concat(...Array(k).fill(a.pips))}; }
      if (!a.gen && !a.pips.length) continue;
      cuts.push(a); why.push(ptFaceName(src));
    }
  }
  // the spell's own: "This spell costs {1} less to cast for each creature you control", "… if you control a Dragon", affinity for artifacts
  const own = ptFaceText(spell).split("\n").map(l => trLower(spell, l)).join("\n");
  for (const m of own.matchAll(/\bcardname costs ((?:\{[^}]+\})+) less to cast(?: for each ([^.]+?)| if ([^.]+?))?(?:\.|$)/g)) {
    let a = amount(m[1]);
    if (m[2]) { const k = count(m[2], spell); a = {gen: a.gen * k, pips: []}; }
    else if (m[3]) { let ok = null; try { ok = trEvalIf(m[3], {src: spell}); } catch (e) { ok = null; } if (ok !== true) continue; }
    if (a.gen || a.pips.length) { cuts.push(a); why.push("its own text"); }
  }
  const wx = own.match(/\bcardname costs \{x\} less to cast,? where x is ([^.]+)/);
  if (wx) { let k = 0; try { k = ptCount(wx[1], {src: {card: spell}}); } catch (e) { k = 0; } if (k > 0) { cuts.push({gen: k, pips: []}); why.push("its own text"); } }
  const aff = (ptFaceText(spell).match(/(?:^|\n)Affinity for ([a-z ]+?)s?(?:\s*\(|\n|$)/i) || [])[1];
  if (aff) { const k = PT.bf.filter(x => trFits(aff.toLowerCase(), x)).length; if (k) { cuts.push({gen: k, pips: []}); why.push(`affinity (${k})`); } }
  return {cuts, why};
}
// Take reductions off a cost: generic first ({X} stays as chosen), coloured reductions remove a matching pip
function ptReduceCost(cost, cuts){
  if (!cuts.length) return cost;
  const syms = [...String(cost).matchAll(/\{([^}]+)\}/g)].map(x => x[1].toUpperCase());
  let gen = syms.filter(x => /^\d+$/.test(x)).reduce((t, x) => t + +x, 0);
  const rest = syms.filter(x => !/^\d+$/.test(x));
  for (const c of cuts) {
    gen = Math.max(0, gen - c.gen);
    for (const p of c.pips) { const i = rest.indexOf(p); if (i >= 0) rest.splice(i, 1); else { const h = rest.findIndex(x => x.includes(p) && x.includes("/")); if (h >= 0) rest.splice(h, 1); } }
  }
  const xs = rest.filter(x => x === "X"), others = rest.filter(x => x !== "X");
  return xs.map(x => "{X}").join("") + (gen ? `{${gen}}` : "") + others.map(x => `{${x}}`).join("") || "{0}";
}
// Can this card be cast right now (for the glow in your hand)?
function ptAffordable(c, zone){
  if (ptIsLand(c)) return zone === "hand" && ptLandOk();
  const cost = ptCastCost(c, zone); if (!/\{/.test(cost)) return true;
  if (!ptPlan(cost, c).missing) return true;
  return ptCastWays(c, zone).some(w => PT_WAY_GLOW.has(w.k) && (() => { const k = ptCastCost(c, zone, w); return !/\{/.test(k) || !ptPlan(k, c).missing; })());
}
function ptLandsThisTurn(){ return PT.landTurn === PT.turn ? PT.landN || 0 : 0; }
function ptLandDrops(){ let n = 1; for (const s of PT.bf) { if (s.faceDown) continue; const t = ptFaceText(s).toLowerCase(); const m = t.match(/you may play (an|one|two|three) additional lands?/); if (m) n += {an: 1, one: 1, two: 2, three: 3}[m[1]]; } return n; }
const ptLandOk = () => PT.phase === "play" && ptLandsThisTurn() < ptLandDrops();
// Cast from hand or command zone (or with a way like evoke), paying with mana first when that's switched on
function ptCastPaid(uid, wayKey, x){
  const f = ptFind(uid); if (!f) return;
  const c = f.card, zone = f.zone, cast = () => wayKey ? ptCastWay(uid, wayKey) : zone === "cmd" ? ptMove(uid, "bf") : ptPlay(uid);
  if (ptIsLand(c) && zone === "hand" && !wayKey) {
    if (!ptLandOk() && PT.phase === "play") return ptAskAnyway(`You've already played ${ptLandsThisTurn() === 1 ? "a land" : ptLandsThisTurn() + " lands"} this turn.`, "Play it anyway", () => ptDo(() => { ptNoteLand(); cast(); }));
    return ptDo(() => { ptNoteLand(); cast(); });
  }
  if (!ptAutoMana() || PT.phase !== "play") return ptDo(cast);
  const way = wayKey ? ptCastWays(c, zone).find(w => w.k === wayKey) : null;
  let cost = ptCastCost(c, zone, way);
  if (!/\{/.test(cost)) return ptDo(cast);
  if (/\{X\}/i.test(cost) && x == null) return ptAskX(c, cost, n => ptCastPaid(uid, wayKey, n));
  const plan = ptPlan(cost, c, {x: x || 0});
  if (plan.missing) return ptAskAnyway(`Not enough mana for ${esc(ptFaceName(c))} (${esc(ptManaTxt(cost.replace(/\{X\}/gi, `{${x || 0}}`)))}): you're missing ${esc(ptManaTxt(plan.missing))}.`, "Cast it anyway (without paying)", () => ptDo(cast));
  const cutBy = way && PT_WAY_NOSPELL.has(way.k) ? [] : ptCostCuts(c).why.slice();
  const emSac = way && way.k === "emerge" ? ptEmergeSac(c) : null;
  if (emSac) cutBy.push(`sacrificing ${emSac.name}`);
  ptDo(() => { if (emSac) { c.emerged = true; ptSacrifice(emSac.uid); } ptApplyPlan(plan, ptFaceName(c) + (x ? ` (X = ${x})` : "") + (cutBy.length ? ` (cost reduced by ${[...new Set(cutBy)].join(", ")})` : "")); if (x != null) c.xPaid = x; cast(); });
}
function ptNoteLand(){ if (PT.landTurn !== PT.turn) { PT.landTurn = PT.turn; PT.landN = 0; } PT.landN++; }
function ptAskAnyway(msg, yes, fn){
  PT._fail = String(msg).replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  ptModal("Hold on", `<p>${msg}</p>`, `<button class="btn ghost" type="button" data-d="close">Cancel</button><button class="btn primary" type="button" id="ptAnyway">${esc(yes)}</button>`);
  $("ptAnyway").onclick = () => { ptCloseModal(); fn(); };
}
function ptAskX(c, cost, fn){
  let max = 0; for (let x = 1; x <= 30; x++) { if (ptPlan(cost, c, {x}).missing) break; max = x; }
  ptModal(`Choose X for ${esc(ptFaceName(c))}`, `<p class="cur-sub">${esc(ptManaTxt(cost))}. With what you have, X can be up to <b>${max}</b>.</p>
    <label class="inline-field">X <input type="number" id="ptXval" min="0" max="99" value="${max}"></label>`,
    `<button class="btn ghost" type="button" data-d="close">Cancel</button><button class="btn primary" type="button" id="ptXgo">Cast</button>`);
  const go = () => { const v = Math.max(0, parseInt($("ptXval").value) || 0); ptCloseModal(); fn(v); };
  $("ptXgo").onclick = go; $("ptXval").addEventListener("keydown", e => { if (e.key === "Enter") go(); }); $("ptXval").select();
}

