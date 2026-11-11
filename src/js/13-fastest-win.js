/* ---------------- fastest possible win ----------------
   The best case for this deck: you get to choose every card you draw. It searches turn by turn for the quickest
   way to win, either by putting a combo together (Commander Spellbook combos in the deck) or by damage (creatures,
   haste, double strike, burn, commander damage), planning lands, fast mana, rituals, ramp and card draw along the way.
   Like a goldfish game: nobody interacts, and colours are assumed to work out. */
// Mana a source makes, one entry per mana: "C" colourless, "R" red, "BR" red or black (one of), "WUBRG" any colour
let FW_CI = null;   // the commander's colour identity ("WUBRG" letters, "" for colourless); null when the deck has no commander
function fwUnits(addText){
  const t = String(addText || "").toLowerCase();
  const nWord = (t.match(/\b(one|two|three|four|five|x)\s+mana\b/) || [])[1];
  // Arcane Signet, Command Tower, Path of Ancestry: only the commander's colours (nothing at all with a colourless commander)
  if (/any colou?r in your commander'?s colou?r identity/.test(t)) return FW_CI == null ? Array(WORDNUM[nWord] || 1).fill("WUBRG") : FW_CI ? Array(WORDNUM[nWord] || 1).fill(FW_CI) : [];
  if (/any (?:one )?colou?r|any combination of colou?rs|any type|in any combination/.test(t) && !/\{[wubrgc]\}/.test(t.split(/ or | in any/)[0])) return Array(WORDNUM[nWord] || 1).fill("WUBRG");
  const syms = (t.match(/\{[wubrgc]\}/g) || []).map(x => x[1].toUpperCase());
  if (/\{[wubrgc]\}(?:,? or \{[wubrgc]\})+/.test(t) || /\bor\b/.test(t.split(".")[0]) && syms.length > 1) return [[...new Set(syms)].join("")];
  if (/in any combination of \{/.test(t)) { const set = [...new Set(syms)].join(""); return Array(WORDNUM[nWord] || syms.length || 1).fill(set); }
  return syms;
}
// A mana cost as coloured symbols plus generic: "{2}{R}{R}" → {cols: ["R", "R"], gen: 2}
function fwCost(c){
  const s = String(c.cost || "").split(" // ")[0];
  if (!s) return {cols: [], gen: c.cmc ?? 0};
  const cols = [], toks = s.match(/\{[^}]+\}/g) || []; let gen = 0;
  for (const tk of toks) { const v = tk.slice(1, -1).toUpperCase(); if (/^\d+$/.test(v)) gen += +v; else if (v === "X") continue; else if (/^2\//.test(v)) cols.push(v.slice(2)); else cols.push(v); }
  return {cols, gen};
}
// Pay a cost from the mana you have: coloured symbols first (a proper matching, so City of Brass isn't spent
// where Sol Ring's colourless would do), then generic from the least flexible mana. Returns what's left, or null.
function fwPay(pool, cost, extra, card, convokeFirst){
  const only = fwOnly, fits = u => !only(u) || (card && fwFits(only(u), card)), fb = u => (u.match(/\?([A-Z]+)/) || [])[1];
  const base = u => fits(u) ? u.split(/[!#@~^]/)[0] : fb(u) || "";   // Cavern of Souls: any colour for the chosen type, {C} for the rest
  const usable = u => fits(u) || !!fb(u);
  const can = (u, s) => { if (!usable(u)) return false; u = base(u); return s === "C" ? u === "C" : s.split("/").some(x => x === "P" || u.includes(x)); };
  const syms = cost.cols.filter(s => !/\/P$|^P$/.test(s));
  // spend the least useful mana first: restricted mana, then colourless, then single colours; creatures' mana last
  const flex = u => (u.includes("^") ? (convokeFirst ? -20 : 14) : 0) + (u.includes("@") ? 10 : 0) + (u.includes("~T") ? 6 : 0) + (u.includes("~=") ? -3 : 0) + (only(u) ? -5 : 0) + (base(u) === "C" ? 0 : base(u).length);   // floating mana first, Treasures and creatures last
  const order = pool.map((u, i) => i).filter(i => usable(pool[i])).sort((a, b) => flex(pool[a]) - flex(pool[b]));
  const match = new Array(pool.length).fill(-1);
  for (let si = 0; si < syms.length; si++) {
    const seen = new Set();
    const tryS = s => { for (const i of order) { if (seen.has(i) || !can(pool[i], syms[s])) continue; seen.add(i); if (match[i] < 0 || tryS(match[i])) { match[i] = s; return true; } } return false; };
    if (!tryS(si)) return null;
  }
  const free = order.filter(i => match[i] < 0), gen = cost.gen + (extra || 0);
  if (free.length < gen) return null;
  const used = new Set(free.slice(0, gen)); for (let i = 0; i < pool.length; i++) if (match[i] >= 0) used.add(i);
  return pool.filter((u, i) => !used.has(i));
}
// The spell type a restricted mana is for: "WUBRG!elemental?C$#12" → "elemental"
const fwOnly = u => (String(u).match(/!([^#@~^?$]+)/) || [])[1];
// Costs besides mana: "sacrifice a creature", "exile a blue card from your hand", "pay 1 life", "tap an untapped Elf you control"…
function fwReqs(cl){
  const out = [], N = w => w === "x" ? 1 : (WORDNUM[w] || parseInt(w) || 1);
  cl = String(cl || "").toLowerCase().replace(/\bbehold (a|an|one|two) ([a-z -]+?) and exile (?:it|them)\b/g, (m0, n, ph) => { out.push({k: "behold", n: N(n), ph, exile: true, txt: m0}); return ""; });
  for (let part of String(cl || "").toLowerCase().split(/,\s*(?:and\s+)?|\s+and\s+/)) {
    part = part.trim().replace(/\.$/, ""); let m;
    if (!part) continue;
    if ((m = part.match(/^pay (\d+) life/))) out.push({k: "life", n: +m[1], txt: part});
    else if ((m = part.match(/^sacrifice (a|an|one|two|three|four|five|x|\d+|another) ([a-z ,'-]+)$/))) out.push({k: "sac", n: m[1] === "another" ? 1 : N(m[1]), ph: m[2], txt: part});
    else if (/^discard your hand/.test(part)) out.push({k: "discard", n: 99, ph: "", txt: part});
    else if ((m = part.match(/^discard (a|an|one|two|three|x|\d+) ?([a-z ]*?)\s*cards?$/))) out.push({k: "discard", n: N(m[1]), ph: m[2].trim(), txt: part});
    else if ((m = part.match(/^exile (a|an|one|two|three|x|\d+) ?([a-z ]*?)\s*cards? from your hand$/))) out.push({k: "hand", n: N(m[1]), ph: m[2].trim(), txt: part});
    else if ((m = part.match(/^exile (a|an|one|two|three|four|five|six|seven|x|\d+) ?([a-z ]*?)\s*cards? from your graveyard$/))) out.push({k: "grave", n: N(m[1]), ph: m[2].trim(), txt: part});
    else if ((m = part.match(/^collect evidence (\d+)/))) out.push({k: "grave", n: Math.ceil(+m[1] / 2), ph: "", txt: part});
    else if ((m = part.match(/^tap (a|an|one|two|three|four|five|x|\d+) untapped ([a-z ]+?)(?: you control)?$/))) out.push({k: "tap", n: N(m[1]), ph: m[2], txt: part});
    else if ((m = part.match(/^return (a|an|one|two|three|\d+) ([a-z ]+?) you control to (?:its|their) owners?['’]?s? hands?$/))) out.push({k: "bounce", n: N(m[1]), ph: m[2], txt: part});
    else if ((m = part.match(/^reveal (a|an) ([a-z ]+?) card from your hand$/))) out.push({k: "reveal", n: 1, ph: m[2], txt: part});
    else if ((m = part.match(/^exile (a|an|one|two) ([a-z ]+?) you control$/))) out.push({k: "sac", n: N(m[1]), ph: m[2], exile: true, txt: part});
    else if ((m = part.match(/^behold (a|an|one|two) ([a-z -]+)$/))) out.push({k: "behold", n: N(m[1]), ph: m[2], txt: part});
  }
  return out;
}
// Does a card or permanent fit "blue card", "nonland", "Goblin", "artifact or creature", "two Mountains"…
function fwFits(ph, c){
  ph = String(ph || "").toLowerCase().replace(/\b(another|other|untapped|nontoken|you control|permanents?|cards?)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!ph) return true;
  const type = String(c.type || "").toLowerCase(), cols = c.cols || "C", col = {white: "W", blue: "U", black: "B", red: "R", green: "G"};
  return ph.split(/\s*(?:,|\bor\b|\band\/or\b)\s*/).filter(Boolean).some(alt => alt.split(" ").every(w0 => {
    const w = w0.replace(/(?<=[a-z]{3})s$/, "").replace(/^elve$/, "elf"); if (w === "a" || w === "an") return true;
    if (/^non-?/.test(w)) { const x = w.replace(/^non-?/, ""); return col[x] ? !cols.includes(col[x]) : !type.includes(x); }
    if (col[w]) return cols.includes(col[w]);
    if (w === "colorless") return cols === "C";
    if (w === "permanent") return !/\b(instant|sorcery)\b/.test(type);
    if (type.includes(w) || type.includes(w0)) return true;
    return !!c.changeling && /\b(creature|kindred|tribal)\b/.test(type) && !/^(creature|artifact|enchantment|land|planeswalker|instant|sorcery|battle|legendary|basic|snow|token|plain|island|swamp|mountain|forest|equipment|aura|vehicle)$/.test(w);
  }));
}
function fwCard(c, isCmd){
  const r = cardRole(c), t = (c.text || "").toLowerCase().replace(/\([^)]*\)/g, ""), type = (c.type || "").split(" // ")[0];
  const perm = !/\b(Instant|Sorcery)\b/.test(type);
  const f = {name: c.name, img: c.imgN || c.img || "", cmc: c.cmc ?? 0, land: r.land, perm, qty: isCmd ? 1 : (c.qty || 1), cmd: !!isCmd, type, cost: c.cost || "", pay: fwCost(c)};
  f.need = [...new Set(f.pay.cols.flatMap(s => s.split("/")).filter(x => /^[WUBRG]$/.test(x)))].join("");
  f.legend = /\bLegendary\b/.test(type) && /\b(Creature|Planeswalker)\b/.test(type); f.artifact = /\bArtifact\b/.test(type);
  f.cols = (c.colors || []).join("") || "C";
  f.changeling = /(^|\n)changeling\b|is every creature type/.test(t);
  // additional and alternative costs
  const addl = t.match(/as an additional cost to cast (?:this spell|[^,.]+?),\s*([^.]+)/);
  if (addl) f.reqs = fwReqs(addl[1]);
  const alt = t.match(/(?:^|\n|\. )(?:if ([^,.]+), )?you may ([^.]+?) rather than pay (?:this spell's|its|this card's) mana cost/);
  if (alt) f.alt = {pay: {cols: [], gen: 0}, reqs: fwReqs(alt[2]), cond: alt[1] || "", txt: alt[2]};
  const evk = t.match(/(?:^|\n)evoke(?:\s|—)+([^\n(]+)/);
  if (evk) { const cp = evk[1].trim(), mana = cp.match(/^(?:\{[^}]+\})+/); f.evoke = {pay: mana ? fwCost({cost: mana[0], cmc: 0}) : {cols: [], gen: 0}, reqs: mana ? [] : fwReqs(cp.replace(/^—\s*/, "")), evoke: true, txt: "evoke " + cp}; }
  let addM = t.match(/\badd ([^.]*)/);
  const gd = t.match(/((?:other )?[a-z -]*?)(?:creatures|[a-z]+s) you control have ["“]\{t\}: (add [^"”]+)["”]/) || t.match(/\beach ([a-z -]*?creature) you control has ["“]\{t\}: (add [^"”]+)["”]/);
  if (gd) {
    const units = fwUnits(gd[2].replace(/^add /, ""));
    const ph = (gd[0].match(/^(.*?) you control/) || [])[1].replace(/^each /, "").replace(/\bother\b/, "").trim();
    if (/\blands?\b/.test(ph) && units.length && units.every(u => u === "WUBRG")) f.landsAny = true;
    else if (units.length && units.length <= 3 && !/\b(artifacts?|enchantments?|planeswalkers?|permanents?)\b/.test(ph)) f.grantDork = {ph, units, other: /\bother\b/.test(gd[0])};
    if (addM && addM.index >= gd.index && addM.index < gd.index + gd[0].length) addM = t.slice(gd.index + gd[0].length).match(/\badd ([^.]*)/);
    if (addM) addM.index += gd.index + gd[0].length;
  }
  if (addM && !f.land && /\bsacrifice (?:a|an|another|one|two|three)\b[^\n]*:\s*$/.test(t.slice(Math.max(0, t.lastIndexOf("\n", addM.index) + 1), addM.index)) && !/\{t\}[^\n]*:\s*$/.test(t.slice(Math.max(0, t.lastIndexOf("\n", addM.index) + 1), addM.index))) addM = null;
  if (f.land) {
    let units = addM ? fwUnits(addM[1]) : [];
    for (const m of t.matchAll(/\badd ([^.]*)/g)) { const u2 = fwUnits(m[1]); const cols = x => new Set(x.join("").replace(/C/g, "")).size; if (u2.length && !/spend this mana only/.test(t.slice(m.index, m.index + 120)) && (cols(u2) > cols(units) || (cols(u2) === cols(units) && u2.length > units.length && cols(u2)))) units = u2; }
    if (!units.length && !/commander'?s colou?r identity/.test(t)) { const basics = Object.entries({Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"}).filter(([k]) => new RegExp("\\b" + k + "\\b").test(c.type || "")).map(([, v]) => v).join(""); units = [basics || "C"]; }
    const lo = t.match(/spend this mana only to cast (?:a |an )?([a-z ]+?) spells?(?: of the chosen type)?\b/);
    if (lo) {
      const ph = /of the chosen type/.test(t) ? (FW_TYPE || lo[1]) : lo[1], anyU = /add one mana of any colou?r\. spend this mana only/.test(t);
      const plain = (t.match(/\{t\}: add (\{[wubrgc]\})\./) || [])[1];   // Cavern of Souls also has "{T}: Add {C}." for everything else
      const noCounter = /spend this mana only[^.]*can't be countered/.test(t) ? "$" : "";
      units = (anyU ? ["WUBRG"] : units).map(u => u + "!" + ph + (plain ? "?" + plain[1].toUpperCase() : "") + noCounter);
    }
    f.units = units; f.yield = units.length; f.make = [...new Set(units.join("").replace(/C/g, ""))].join("");
    f.tapped = /enters tapped/.test(t) && !/unless|you may pay|you may reveal/.test(t);
    // "enters tapped unless you control a Forest" (Castle Garenbrig, check lands), "…two or fewer other lands" (fast lands), "…two or more other lands" (slow lands)
    let tu;
    if ((tu = t.match(/enters tapped unless you control (two|three|\d+) or (fewer|more) other lands/))) f.tapUnless = {lands: WORDNUM[tu[1]] || +tu[1], fewer: tu[2] === "fewer"};
    else if ((tu = t.match(/enters tapped unless you control (?:a|an) ([a-z ,-]+?)(?:\.|$)/m))) f.tapUnless = {ph: tu[1].replace(/\s*,?\s*\bor (?:a|an)\b\s*/g, " or ").replace(/,\s*(?:a|an)\s+/g, " or ").trim()};
    // "Activate only if you control five or more lands" (Temple of the False God): no mana until then
    const oi = t.match(/activate only if you control (two|three|four|five|six|seven|\d+) or more ([a-z]+?)s?\b/);
    if (oi) f.manaIf = {n: WORDNUM[oi[1]] || +oi[1], ph: oi[2]};
    return fwRules(f, c);   // lands' own triggers (Khalni Garden's Plant) and abilities
  }
  f.convoke = /(?:^|\n)convoke\b/.test(t);
  f.noCounter = /\bthis spell can't be countered\b/.test(t);
  const onlyFor = (t.match(/spend this mana only to cast ([a-z ,-]+?) spells/) || [])[1];
  if (addM && (c.cmc ?? 0) <= 6 && !/^(?:[a-z' ]+ — )?(?:when|whenever|at)\b/.test(t.slice(Math.max(0, t.lastIndexOf("\n", addM.index) + 1)))) {
    let units = fwUnits(addM[1]);
    const act = t.slice(Math.max(0, t.lastIndexOf("\n", addM.index)), addM.index).match(/\{(\d+)\}[^:]*:\s*$/);   // Signets: "{1}, {T}: Add {B}{R}"
    if (act && units.length > +act[1]) units = units.slice(+act[1]).map(() => [...new Set(units.join(""))].join(""));
    // mana that depends on what you control: Mox Amber (legends' colours), Mox Opal (three artifacts)
    if (/among legendary creatures and planeswalkers you control/.test(addM[1])) units = ["LEG"];
    else if (/three or more artifacts|metalcraft/.test(t)) units = ["OPAL"];
    if (/imprint|exile a nonartifact, nonland card from your hand/.test(t)) f.extra = 1;          // Chrome Mox
    if (/discard a land card/.test(t) && /\benter/.test(t)) { f.extra = 1; f.discardLand = true; }   // Mox Diamond
    if (onlyFor && units.length) { f.onlyFor = onlyFor; units = units.map(u => u + "!" + onlyFor); }
    const per = addM[1].match(/^(?:\{[wubrgc]\})+ for each ([a-z ,'-]+?) you control/);
    if (per) f.manaPer = per[1].replace(/s$/, "");   // The Notary Hobbits: one {C} for each Halfling
    if (units.length) {
      const sacs = /sacrifice [^:]*: add/.test(t) && !/\{t\}: add/.test(t.replace(/\{t\}, sacrifice[^:]*: add/, ""));
      if (!perm || sacs) f.burst = units; else if (/\bcreature\b/i.test(type)) f.dork = units; else f.rock = units;
      f.rockTapped = /enters tapped/.test(t);
      f.make = [...new Set(units.join("").replace(/C/g, ""))].join("");
    }
  }
  if (/\{t\}: for each colou?r among permanents you control, add one mana of that colou?r/.test(t) && f.cols !== "C") { const u = f.cols.split(""); if (/\bCreature\b/.test(type)) { f.dork = u; delete f.rock; } else { f.rock = u; delete f.dork; } }
  // Simian / Elvish Spirit Guide: exile it from your hand for mana; Lion's Eye Diamond throws away your hand
  const guide = t.match(/exile [^:]*?from your hand: add ([^.]*)/);
  if (guide) { const u = fwUnits(guide[1]); if (u.length) { f.burst = u; delete f.dork; delete f.rock; f.pay = {cols: [], gen: 0}; f.guide = true; f.perm = false; f.make = [...new Set(u.join("").replace(/C/g, ""))].join(""); } }
  if (/discard your hand,[^:]*: add/.test(t)) f.dumpHand = true;
  if (r.landRamp) { f.ramp = r.landRamp; f.rampTapped = /onto the battlefield tapped/.test(t); }
  // card draw that's yours: not "its controller may draw", not "each opponent draws"; delayed draws come next turn
  for (const sent of t.split(/(?<=\.)\s+|\n/)) {
    const m = sent.match(/\bdraws? (a|an|one|two|three|four|five|six|seven|x|\d+|up to (?:one|two|three)) (?:additional )?cards?/); if (!m) continue;
    if (/:/.test(sent.slice(0, m.index))) continue;
    if (/^\s*when[^,]*, if\b/.test(sent) || /\bif you control\b/.test(sent.slice(0, m.index))) continue;
    if (/\bfor each (?:permanent|creature) you control of that type\b/.test(sent)) { f.drawEach = FW_TYPE || "creature"; continue; }   // Distant Melody   // "when this enters, if you control…": only sometimes   // an activated ability ("{1}, {T}, sacrifice it: draw a card"), used later
    if (/\b(its controller|their controller|that player|each opponent|target opponent|an opponent|each other player|defending player)(?: may)?\s*$/.test(sent.slice(0, m.index))) continue;   // someone else draws
    const later = /at the beginning of (?:the next turn's|your next) upkeep/.test(sent);
    if (!later && (/^\s*(whenever|at the beginning of)\b/.test(sent) || /\b(whenever|at the beginning of)\b/.test(sent.slice(0, m.index)))) continue;   // an engine, not a one-off
    const n = WORDNUM[m[1].replace(/^up to /, "")] || parseInt(m[1]) || 1;
    if (later) f.drawLater = (f.drawLater || 0) + n; else f.draw = Math.max(f.draw || 0, n);
    if (!later && /^\s*when [^,]* enters\b/.test(sent)) f.etbDraw = true;
  }
  if (f.draw && /\b(?:each player discards their hand|discard your hand)\b/.test(t)) f.wheel = true;
  const dmp = t.match(/draw cards equal to the greatest power among ([a-z -]+?) you control/); if (dmp) f.drawMaxPow = dmp[1].replace(/\bnon-human\b/, "creature");
  // "Choose one —" spells: every mode is tried (Return of the Wildspeaker: draw, or +3/+3)
  if (!c._mode && !perm && /\bchoose one\b/.test(t)) {
    const bullets = String(c.text || "").split("\n").filter(l => /^\s*•/.test(l)).map(l => l.replace(/^\s*•\s*/, ""));
    if (bullets.length > 1) f.modes = bullets.map(b => Object.assign(fwCard(Object.assign({}, c, {text: b, _mode: true}), isCmd), {modeTxt: b.replace(/\.$/, "")}));
  }   // Wheel of Fortune: your hand goes first
  f.cascade = ptKwPrinted({name: c.name, text: c.text || "", back: false}).filter(k => k.key === "cascade").length;
  const disc = t.match(/\bdiscover (\d+)/); if (disc) f.discover = +disc[1];
  // counterspells need an opposing spell, and there isn't one here
  if (/\bcounter target\b/.test(t) && !perm) { f.counterOnly = true; delete f.draw; delete f.drawLater; }
  if (/search your library for (?:a|an|up to one) (?:[a-z ]+ )?card(?!s? with)/.test(t) && /(?:put|into) (?:it|that card) into your hand|put that card into your hand/.test(t) && !/basic land|land card/.test(t)) f.draw = Math.max(f.draw || 0, 1);
  const kws = ptKwPrinted({name: c.name, text: c.text || "", back: false}).map(k => k.key);
  if (/\bCreature\b/.test(type) && !f.guide) {
    f.power = r.power; f.haste = kws.includes("haste"); f.ds = kws.includes("double strike"); f.infect = kws.includes("infect");
    f.noAttack = kws.includes("defender") || /(?:^|\n|\. )(?:cardname|this creature|[^.\n]*?) can't attack(?! alone)(?! or block alone)/.test(t.replace(new RegExp(trEsc(c.name.toLowerCase()), "g"), "cardname")) && !/creatures? (?:your opponents control|an opponent controls|target)/.test(t);
  }
  // haste for others: "Creatures you control have haste", "Other Goblins you control have haste", "All creatures have haste", riot
  for (const g of t.matchAll(/(?:^|\n|\. )((?:all |each |other )*[a-z ,-]*?creatures?|(?:all |each |other )*[a-z-]+s)(?: you control| on the battlefield)?(?: get [+-]\d+\/[+-]\d+ and)? (?:have|has) ([^.\n]*)/g)) {
    if (/\b(target|until|equipped|enchanted|opponents?)\b/.test(g[1])) continue;
    if (/\bhaste\b|\briot\b/.test(g[2])) (f.giveHaste = f.giveHaste || []).push({ph: g[1].replace(/\b(all|each|other)\b/g, " ").trim(), other: /\bother\b/.test(g[1])});
  }
  // a lasting stat boost: "Creatures you control get +1/+1", "Other Elves you control get +1/+1"
  for (const g of t.matchAll(/(?:^|\n|\. )((?:other )?[a-z ,-]*?)(?: you control)? get \+(\d+)\/\+(\d+)(?![^.\n]*until end of turn)/g)) {
    if (/\b(target|equipped|enchanted|opponents?|when|whenever|if)\b/.test(g[1]) || !g[1].trim() || /:/.test(g[1])) continue;
    (f.anthem = f.anthem || []).push({ph: g[1].replace(/\bother\b/, "").trim(), other: /\bother\b/.test(g[1]), n: +g[2]});
  }
  // one-turn team boosts and haste: Craterhoof, Overrun, "creatures you control gain haste until end of turn"
  // X in the mana cost: the finder pays as much X as it can, and effects that use X use that number
  f.xn = (String(c.cost || "").split(" // ")[0].match(/\{x\}/gi) || []).length;
  if (f.xn && /\benters(?: the battlefield)? with x \+1\/\+1 counters/.test(t)) f.xEnters = true;   // Walking Ballista, Hangarback Walker
  const xMin = (t.match(/\bif x is (\d+) or (?:more|greater), creatures you control get/) || [])[1];   // Finale of Devastation
  const pump = t.match(/creatures you control (?:gain [a-z ,]+ and )?get \+(\d+|x)\/\+(?:\d+|x)(?: and gain [a-z ,]+)? until end of turn(?:, where x is ([^.]+))?/);
  if (pump) f.pump = {n: pump[1] === "x" ? 0 : +pump[1], x: pump[1] === "x" ? (pump[2] || (f.xn ? "X" : "the number of creatures you control")) : "", min: xMin ? +xMin : 0};
  if (/creatures you control (?:get [^.]*? and )?gain [a-z ,]*\bhaste\b[^.]*until end of turn|creatures you control (?:get [^.]*? and )?gain haste/.test(t)) f.teamHaste = xMin ? {min: +xMin} : true;
  if (/target creature (?:you control )?(?:gets [^.]*? and )?gains [a-z ,]*\bhaste\b/.test(t)) f.oneHaste = true;
  // Equipment that gives haste (Lightning Greaves, Swiftfoot Boots): equipping a new creature costs its equip cost
  if (/\bEquipment\b/.test(type) && /equipped creature (?:gets [^.]*? and )?(?:has|gains) [^.]*\bhaste\b/.test(t)) { const eq = (c.text || "").match(/Equip(?:\s*—\s*|\s+)\{(\d+)\}/i); f.equipHaste = eq ? +eq[1] : 0; }
  // Dash and blitz: an alternative cost that gives haste
  const dash = (c.text || "").match(/(?:^|\n)(Dash|Blitz) ((?:\{[^}]+\})+)/);
  if (dash) f.dash = {pay: fwCost({cost: dash[2], cmc: 0}), how: dash[1].toLowerCase()};
  const burn = t.match(/deals? (\d+) damage to (?:any target|each opponent|target player|target opponent|each player|target player or planeswalker)/) || t.match(/\beach opponent loses (\d+) life/);
  if (burn && !/^(?:[a-z' ]+ — )?(?:when|whenever|at)\b/.test(t.slice(Math.max(0, t.lastIndexOf("\n", burn.index) + 1))) && !/:/.test(t.slice(Math.max(0, t.lastIndexOf("\n", burn.index) + 1), burn.index))) f.burn = +burn[1];
  return fwRules(f, c);
}
function fwIdentity(d){
  if (!d || d.format !== "commander" || !d.commanders || !d.commanders.length) return null;
  const set = new Set(); for (const c of d.commanders) for (const k of (c.ci && c.ci.length ? c.ci : c.colors || [])) set.add(k);
  return "WUBRG".split("").filter(k => set.has(k)).join("");
}
let FW_TYPE = "";   // the creature type a "choose a creature type" card would name: the deck's most common one
function fwDeckType(cards){
  const n = {};
  // changelings are every type, so they don't tip the count (and their printed "Shapeshifter" isn't the deck's type)
  for (const c of cards) { const ty = String(c.type || ""); if (!/\bCreature\b/.test(ty) || /\bchangeling\b|is every creature type/i.test(c.text || "")) continue; const sub = (ty.split("—")[1] || "").trim(); for (const s of sub.split(/\s+/).filter(Boolean)) n[s] = (n[s] || 0) + (c.qty || 1); }
  return (Object.entries(n).sort((a, b) => b[1] - a[1])[0] || [""])[0].toLowerCase();
}
const FW_WIN = /win the game|wins the game|lose the game|loses the game|infinite damage|infinite (?:life ?loss|lifeloss)|infinite combat damage|infinite mill|infinite (?:power|toughness)|infinite (?:drain|lifelink)/i;
const fwCostTxt = p => p.cols.map(x => `{${x}}`).join("").replace(/^/, p.gen ? `{${p.gen}}` : "");
// What the shared card reader (the same one the playtester uses) finds on a card, in the finder's terms:
// triggered abilities, activated abilities with their costs, cost reducers, extra land drops
const FW_EVS = new Set(["etb", "cast", "landplay", "attack", "attackers", "combatdmg", "upkeep", "draw", "dies", "sac", "token", "discard", "combat", "attackalone", "endstep", "gainlife", "lore"]);
function fwRules(f, c){
  const keep = typeof PT !== "undefined" ? PT : null;
  try {
    PT = null;   // read the card on its own, not as part of an open playtest
    const card = {name: c.name, text: c.text || "", type: c.type || "", back: false, counters: {}, kw: {}, power: c.power, toughness: c.toughness, colors: c.colors || []};
    // triggers: only the ones whose wording the reader fully understands, with no "if" it can't check
    // "if it's / they're not a token" (The Notary Hobbits, Gruff Triplets): checked here, so the trigger is kept
    const notTok = ab => ab.eff != null && /^if (?:it's|it is|they're|they are|cardname is|cardname's) not (?:a )?tokens?, /.test(ab.eff) && !trConditional("x, " + ab.eff.replace(/^if [^,]+, /, ""));
    // "you may pay {2}. If you do, …" (Dawn of Hope, extort) and "you may sacrifice another creature. If you do, …": paid when it can be
    const ifDo = ab => {
      if (ab.eff == null) return null;
      let m = ab.eff.match(/^you may pay ((?:\{[0-9wubrgc]\})+)\. if you do, ([^]+)$/);
      if (m && !trConditional("x, " + m[2]) && !/\bif you do\b/.test(m[2])) return {pay: fwCost({cost: m[1].toUpperCase(), cmc: 0}), payTxt: m[1].toUpperCase()};
      m = ab.eff.match(/^you may sacrifice (?:another|an?) ([a-z ]+?)\. if you do, ([^]+)$/);
      if (m && !trConditional("x, " + m[2]) && !/\bif you do\b/.test(m[2]) && ab.actions[0] && ab.actions[0].t === "sacYou") return {sac: m[1].replace(/\b(?:or|and) (?:an?|another) /g, "or ")};
      // "you may discard a card. If you do, draw a card" (and the other way round): the rest only if the first part happened
      m = ab.eff.match(/^you may (?:discard|draw) (?:a|one|two|\d+) cards?\. if you do, ([^]+)$/);
      if (m && !trConditional("x, " + m[1]) && !/\bif you do\b/.test(m[1]) && ab.actions.length > 1 && ["discard", "draw"].includes(ab.actions[0].t)) return {first: true};
      // "if you control three or more artifacts / an Elf, …"
      m = ab.eff.match(/^if you control (another|an?|one|two|three|four|five|six|seven|\d+)(?: or more)? ([a-z ]+?), ([^]+)$/);
      if (m && !/\b(with|named|power|toughness|total|tapped|untapped|fewer|more|than)\b/.test(m[2]) && !trConditional("x, " + m[3])) return {ctl: {ph: m[2].replace(/s$/, ""), n: /^(an?|another)$/.test(m[1]) ? 1 : trNum(m[1]), other: m[1] === "another"}};
      return null;
    };
    f.trigs = trAbilities(card).filter(ab => !ab.check && !ab.choice && ab.conds.every(k => FW_EVS.has(k.ev)) && ab.actions.length
      && (notTok(ab) || ifDo(ab) || !(ab.eff != null && (ab.intervening || trConditional(ab.text))))).map(ab => Object.assign({conds: ab.conds, acts: ab.actions, may: ab.may, text: ab.text, notToken: notTok(ab)}, ifDo(ab) || {}));
    const textActs = e0 => {
      const e = String(e0 || ""), out = [];
      let m;
      if ((m = e.match(/deals damage to any target equal to the number of ([a-z ]+?) you control/))) out.push({t: "opp", countPh: m[1]});
      else if ((m = e.match(/deals (\d+) damage to (?:any target|each opponent|target opponent|target player|any other target)/))) out.push({t: "opp", n: +m[1]});
      if ((m = e.match(/put (?:a|up to one) land cards? from among them onto the battlefield( tapped)?/))) out.push({t: "searchAuto", phrase: "land", to: "bf", tapped: !!m[1], n: 1});
      if ((m = e.match(/search your library for an? ([a-z ]+?) card[^.]*\b(?:put|and put) (?:that card|it) on top/))) out.push({t: "tutorTop", ph: m[1]});
      if ((m = e.match(/put a \+1\/\+1 counter on (?:target|each) ([a-z ]+?) you control/))) out.push({t: "counter", kind: "p1p1", on: "pick", n: 1});
      if (/\bcast target (?:instant or sorcery|instant|sorcery) card from (?:a|your) graveyard without paying its mana cost/.test(e)) out.push({t: "castGy"});
      if (/\bchoose (?:one|two|three)\b/.test(e) && (m = e.match(/create an? (\d+)\/(\d+) ([a-z ]+?) creature token/))) { const nm = m[3].split(" ").filter(w => !/^(white|blue|black|red|green|colorless)$/.test(w)).map(w => w[0].toUpperCase() + w.slice(1)).join(" "); out.push({t: "token", n: 1, def: {name: nm, type: "Token Creature — " + nm, power: m[1], toughness: m[2], colors: [], text: ""}}); }
      return out;
    };
    for (const ab of trAbilities(card)) {
      if (ab.check || !ab.conds.every(k => FW_EVS.has(k.ev)) || f.trigs.some(x => x.text === ab.text)) continue;
      const extra = textActs(ab.eff);
      if (!extra.length || ab.intervening) continue;
      // keep what the reader did understand (draws with an "if you control eight or more lands" are left out)
      const keep = ab.actions.filter(a => !(a.t === "draw" && /\bif you control\b/.test(ab.eff)) && !["note", "choose"].includes(a.t));
      f.trigs.push({conds: ab.conds, acts: keep.filter(a => !extra.some(x => x.t === a.t)).concat(extra), may: ab.may, text: ab.text});
    }
    // "search your library for a card … put that card on top" (Flamekin Harbinger): it goes on top, not into your hand
    for (const tr of f.trigs) if (/\bon top\b/.test(tr.text.toLowerCase()) && tr.acts.some(a => a.t === "search")) { const ph = (tr.text.toLowerCase().match(/search your library for an? ([a-z ]+?) card/) || [])[1] || ""; tr.acts = tr.acts.map(a => a.t === "search" ? {t: "tutorTop", ph} : a); }
    // "where X is the number of colors among permanents you control" (Vivid)
    for (const tr of f.trigs) if (/where x is the number of colou?rs among permanents you control/i.test(tr.text)) tr.acts = tr.acts.map(a => Object.assign({}, a, {colorsX: true}));
    // a team pump the main reader already counts (Craterhoof Behemoth's "creatures you control … get +X/+X") isn't counted twice
    if (f.pump || f.teamHaste) for (const tr of f.trigs) if (tr.conds.every(k => k.ev === "etb" && k.who === "self")) tr.acts = tr.acts.filter(a => !(a.t === "pump" && (a.who === "all" || /creatures you control/.test(tr.text.toLowerCase()))));
    f.trigs = f.trigs.filter(tr => tr.acts.length);
    if (/\bSaga\b/.test(card.type)) { const ch = trChapters(card); if (ch.length) f.chapters = Math.max(...ch.map(x => x.n)); }   // its chapters, one each turn
    // the card's own "when this enters, draw / search" is already counted by the main reader
    const counted = tr => tr.conds.every(k => (k.ev === "etb" || k.ev === "cast") && k.who === "self") && tr.acts.every(a => ["draw", "searchAuto"].includes(a.t));
    if (f.draw || f.ramp || f.drawLater) { const cp = f.trigs.filter(tr => counted(tr) && tr.conds.every(k => k.ev === "etb")); if (cp.length) f.copyTrigs = cp; f.trigs = f.trigs.filter(tr => !counted(tr)); }
    if (!f.trigs.length) delete f.trigs;
    // activated abilities on the battlefield (mana abilities that only tap are already counted as mana)
    const acts = [];
    for (const ab of trActivated(card)) {
      if (ab.zone !== "bf" || ab.kind === "loyalty" || !ab.cost) continue;
      const cs = ab.cost;
      if (cs.untap || (cs.remove && cs.remove.length) || (cs.tapCre && cs.tapCre.length) || (cs.returnLand && cs.returnLand.length) || (cs.exileGrave && cs.exileGrave.length) || cs.exileSelf || cs.evidence || cs.blight || cs.forage) continue;
      if ((ab.kind === "mana" || ab.actions.every(a => a.t === "mana")) && cs.tap && (f.rock || f.dork || f.burst || f.land)) continue;
      if (ab.kind === "mana" && cs.tap && !(cs.sac && cs.sac.length) && !cs.sacSelf && !cs.mana && !cs.life) continue;   // plain tap-for-mana: already a mana source
      if (ab.kind !== "ability" && ab.kind !== "mana") continue;
      const effs = ab.kind === "mana" ? [{t: "mana", what: (ab.actions[0] || {}).what || "", label: "Add mana"}] : ab.actions;
      if (!effs.length || (ab.eff && !trCovered(ab.eff, ab.actions) && ab.kind !== "mana" && (/\b(target|sacrifice|destroy|exile)\b/.test(ab.eff.replace(/any target/g, "")) || !effs.some(a => ["draw", "token", "opp", "mana", "pump", "counter"].includes(a.t))))) continue;
      acts.push({label: ab.label, costText: ab.costText, tap: !!cs.tap, pay: fwCost({cost: cs.mana || "", cmc: 0}), sacSelf: !!cs.sacSelf, sac: cs.sac && cs.sac.length ? {n: /^(a|an|another)$/.test(cs.sac[0]) ? 1 : trNum(cs.sac[0]), ph: cs.sac[1].replace(/\bother\b/, "").trim()} : null,
        life: cs.life || 0, discard: cs.discard && cs.discard.length ? (cs.discard[0] === "your hand" ? 99 : trNum(cs.discard[0])) : 0, once: ab.once || ab.oncePerTurn, effs});
    }
    if (acts.length) f.acts = acts;
  } catch (e) { console.warn("fastest win: couldn't read", c.name, e); }
  finally { PT = keep; }
  const t = (c.text || "").toLowerCase().replace(/\([^)]*\)/g, "");
  // "Goblin spells you cast cost {1} less to cast", "Spells you cast cost {1} less"
  for (const m of t.matchAll(/(?:^|\n|\. )([a-z ,-]*?)spells? you cast costs? \{(\d+)\} less to cast/g)) if (!/opponent/.test(m[1])) (f.reduce = f.reduce || []).push({n: +m[2], ph: m[1].replace(/\b(each|other)\b/g, "").trim()});
  // evoke for other cards: Ashling, the Limitless ("Elemental permanent spells you cast from your hand gain evoke {4}")
  const ge = t.match(/([a-z ,-]+?) (?:permanent )?spells you cast(?: from your hand)? (?:gain|have) evoke ((?:\{[^}]+\})+)/);
  if (ge) f.grantEvoke = {ph: ge[1].replace(/\b(permanent|nonland)\b/g, "").trim(), pay: fwCost({cost: ge[2], cmc: 0}), txt: ge[2]};
  // "Creature spells (you cast) of the chosen type cost {1} less" (Herald's Horn, Urza's Incubator)
  for (const m of t.matchAll(/creature spells (?:you cast )?of the chosen type cost \{(\d+)\} less/g)) (f.reduce = f.reduce || []).push({n: +m[1], ph: FW_TYPE || "creature"});
  // Animar: less for each +1/+1 counter on it
  if (/cost \{1\} less to cast for each \+1\/\+1 counter on/.test(t) && f.reduce) f.reduce.forEach(r => { r.perCounter = true; });
  // Herald's Horn: each upkeep the top card goes to your hand when it's the chosen type (best case: it is)
  if (/at the beginning of your upkeep, look at the top card of your library\. if it's a creature card of the chosen type/.test(t)) f.upkeepCard = 1;
  // trigger doublers: Yarok (things entering), Twinflame Travelers / Elemental doublers (another Elemental's triggers)
  if (/if a permanent entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(t)) f.dbl = {etb: true};
  const dbl2 = t.match(/if a triggered ability of another ([a-z]+) you control triggers, it triggers an additional time/); if (dbl2) f.dbl = {ph: dbl2[1]};
  // modal "when this enters, choose two — … • Create a 4/4 … token" (Titan of Industry): the token mode is used
  const modal = t.match(/when [^\n]*? enters, choose (?:one|two|three)[^\n]*(?:\n•[^\n]*)*?\n• create an? (\d+)\/(\d+) ([a-z ]+?) creature token/);
  if (modal) { const nm = modal[3].split(" ").filter(w => !/^(white|blue|black|red|green|colorless)$/.test(w)).map(w => w[0].toUpperCase() + w.slice(1)).join(" "); (f.trigs = f.trigs || []).push({conds: [{ev: "etb", who: "self", phrase: "cardname"}], acts: [{t: "token", n: 1, def: {name: nm, type: "Token Creature — " + nm, power: modal[1], toughness: modal[2], colors: [], text: ""}}], text: `When it enters: create a ${modal[1]}/${modal[2]} ${nm} (the mode used)`}); }
  if (/whenever you create or sacrifice a token, each opponent loses (\d+|one) life/.test(t)) f.tokenDrain = 1;
  if (/reveal cards from the top of your library until you reveal x creature cards of the chosen type, where x is the number of creatures you control of (?:that|the chosen) type/.test(t)) f.summons = FW_TYPE || "creature";
  // extra land drops: "You may play an additional land on each of your turns"
  const xl = t.match(/you may play (an|two|three) additional lands? on each of your turns/); if (xl) f.extraLand = WORDNUM[xl[1]] || 1;
  // looting: "Draw two cards, then discard a card"; rummaging: "Discard a card, then draw a card"
  if (f.draw) {
    const after = t.match(/\bdraws? [^.]*?cards?,? then discards? (a|an|one|two|three|\d+) cards?/), first = t.match(/\bdiscards? (a|an|one|two|three|\d+) cards?,? then draws?/);
    if (after) f.discardAfter = WORDNUM[after[1]] || parseInt(after[1]) || 1;
    if (first) f.discardFirst = WORDNUM[first[1]] || parseInt(first[1]) || 1;
  }
  return f;
}
// Search for the fastest win with one plan (one combo, or damage). Beam search over turns, a few plays deep per turn.
// Run the search all at once (tests, small jobs)…
function fwSearch(plan, pool, cmds, o){ const g = fwSearchGen(plan, pool, cmds, o); let r; do { r = g.next(); } while (!r.done); return r.value; }
// …or in short slices, letting the page respond in between (phones freeze otherwise). o.stop() ends it early: the best win so far is kept.
async function fwSearchAsync(plan, pool, cmds, o){
  const g = fwSearchGen(plan, pool, cmds, o);
  for (;;) {
    o._yieldAt = Date.now() + 20;
    const r = g.next();
    if (r.done) return r.value;
    await new Promise(res => setTimeout(res, 0));
  }
}
function* fwSearchGen(plan, pool, cmds, o){
  const MAXT = o.maxT || 10, BEAM = o.beam || 50, WIDE = o.wide || 8, deadline = Date.now() + (o.ms || 1e9);
  const lands = pool.filter(c => c.land);
  const spells = pool.filter(c => !c.land);
  const pieces = plan.pieces ? new Set(plan.pieces) : null;
  // colours: the spells this plan wants most decide which lands come first
  const demand = {}; for (const c of (pieces ? pool.concat(cmds).filter(x => pieces.has(x.name)) : spells.concat(cmds))) for (const k of c.need || "") demand[k] = (demand[k] || 0) + (pieces ? 5 : 1);
  // srcs: mana sources ready each turn (one array of mana each); next: ones that are ready from next turn; mana: what's left this turn.
  // Each mana remembers where it came from: "G#12" from land/rock 12, "G@12" from creature 12 (so it can't attack if spent),
  // "WUBRG~T" is a Treasure (it stays until used), "WUBRG!elemental" can only pay for Elemental spells.
  const mk = () => ({gy: [], back: [], topCard: null, names: {}, treas: 0, clues: 0, monarch: false, castN: 0, casc: [], later: [], acq: Array.from({length: o.bonusCard ? 8 : 7}, () => ({t: 0, by: "open"})), hasteFx: [], anth: [], equips: [], perms: [], pid: 0, grave: 0, life: o.life, legCols: "", arts: 0, idle: [], doneT: {}, t: 0, srcs: [], next: [], mana: [], slots: o.bonusCard ? 8 : 7, used: 0, cnt: {}, board: [], opp: o.life, poison: 0, cmdDmg: 0, done: [], cmdOut: [], tax: {}, log: [], order: [], won: null, budget: 0, removed: false, countered: false});
  const clone = s => Object.assign({}, s, {gy: s.gy.slice(), back: s.back.slice(), casc: s.casc.slice(), later: s.later.slice(), acq: s.acq.slice(), hasteFx: s.hasteFx.slice(), anth: s.anth.slice(), equips: s.equips.map(e => Object.assign({}, e)), perms: s.perms.slice(), idle: s.idle.slice(), doneT: Object.assign({}, s.doneT), srcs: s.srcs.slice(), next: s.next.slice(), mana: s.mana.slice(), cnt: Object.assign({}, s.cnt), board: s.board.map(b => Object.assign({}, b)), done: s.done.slice(), cmdOut: s.cmdOut.slice(), tax: Object.assign({}, s.tax), log: s.log.slice(), order: s.order.slice()});
  const seenN = o.lib ? (() => { const m = new Map(); return (nm, k) => { let a = m.get(nm); if (!a) { a = []; let x = 0; for (const n0 of o.lib) { if (n0 === nm) x++; a.push(x); } m.set(nm, a); } return k <= 0 ? 0 : a[Math.min(k, a.length) - 1]; }; })() : null;
  const left = (s, c, fromLib) => c.cmd ? !s.cmdOut.includes(c.name) : !fromLib && s.back.includes(c.name) ? true : (s.cnt[c.name] || 0) < (seenN && !fromLib ? Math.min(c.qty, seenN(c.name, s.slots)) : c.qty);
  const live = (s, u) => u.startsWith("LEG") ? (s.legCols ? s.legCols + u.slice(3) : null) : u.startsWith("OPAL") ? (s.arts >= 3 ? "WUBRG" + u.slice(4) : null) : u;
  const tapSrc = (s, src) => { if (src.per) { const k = s.perms.filter(p => fwFits(src.per, p)).length, u = live(s, src[0]); if (u == null) { s.idle.push(src); return; } for (let i = 0; i < k; i++) s.mana.push(u); return; } if (src.cond && s.perms.filter(p => fwFits(src.cond.ph, p)).length < src.cond.n) { s.idle.push(src); return; } const got = src.map(u => live(s, u)); if (got.some(x => x == null)) { s.idle.push(src); return; } s.mana.push(...got); };
  // does a land with "enters tapped unless…" come in untapped right now?
  const landTapped = (s, l) => l.tapped || (l.tapUnless ? (l.tapUnless.lands != null ? (() => { const k = s.perms.filter(p => p.land || /\bLand\b/.test(p.type || "")).length - 1; return l.tapUnless.fewer ? k > l.tapUnless.lands : k < l.tapUnless.lands; })() : !s.perms.some(p => fwFits(l.tapUnless.ph, p))) : false);
  const wake = s => { const w = s.idle; s.idle = []; for (const src of w) tapSrc(s, src); };
  const taxOf = (s, c) => c.cmd ? 2 * (s.tax[c.name] || 0) : 0;
  const payCost = c => c.pay.gen + c.pay.cols.length;
  // a lore counter on a Saga: its chapter triggers, and after the last one it's sacrificed
  const loreUp = (s, p) => {
    if (!p) return; const k = (p.lore || 0) + 1; setPerm(s, p.id, {lore: k});
    fire(s, {ev: "lore", n: k, id: p.id, card: p});
    const now = s.perms.find(q => q.id === p.id);
    if (now && k >= (p.chapters || 1)) sacrifice(s, now, "its last chapter");
  };
  const setPerm = (s, id, ch) => { s.perms = s.perms.map(p => p.id === id ? Object.assign({}, p, ch) : p); };
  // a permanent arriving: remembered so costs can sacrifice, tap or return it, and so its triggers and abilities work
  const arrive = (s, c, extra) => { const p = Object.assign({id: ++s.pid, name: c.name, type: c.type, cols: c.cols || "C", changeling: c.changeling, token: !!c.token, trigs: c.trigs, copyTrigs: c.copyTrigs, acts: c.acts, reduce: c.reduce, extraLand: c.extraLand, grantEvoke: c.grantEvoke, grantDork: c.grantDork, landsAny: c.landsAny, dbl: c.dbl, tokenDrain: c.tokenDrain, upkeepCard: c.upkeepCard, chapters: c.chapters, ds: c.ds, ownHaste: !!c.haste, noAttack: c.noAttack, used: {}}, extra || {}); s.perms.push(p); s.names = Object.assign({}, s.names, {[p.id]: [p.name, /\bland\b/i.test(p.type || "")]}); return p.id; };   // names stay known after it leaves
  const srcOf = (units, id, cre) => { const a = units.map(u => u + (cre ? "@" : "#") + id); a.id = id; return a; };
  const leave = (s, id) => { s.perms = s.perms.filter(p => p.id !== id); s.srcs = s.srcs.filter(x => x.id !== id); s.next = s.next.filter(x => x.id !== id); s.idle = s.idle.filter(x => x.id !== id); s.board = s.board.filter(b => b.id !== id); s.hasteFx = s.hasteFx.filter(g => g.id !== id); s.anth = s.anth.filter(a => a.id !== id); };
  const condOK = (s, cond) => { const m = String(cond || "").match(/you control (?:a|an|two or more) ([a-z ]+)/); return !cond || (m ? s.perms.some(p => fwFits(m[1], p)) : true); };
  // cards you could still pitch or discard: what's left in the deck that fits
  const spare = (s, c, ph) => pool.reduce((t, x) => t + (fwFits(ph, x) ? Math.max(0, x.qty - (s.cnt[x.name] || 0) - (x.name === c.name ? 1 : 0)) : 0), 0);
  const reqOK = (s, c, reqs, fromLib) => {
    let free = s.slots - s.used - (c.cmd || fromLib ? 0 : 1) - (c.extra || 0);   // "discard a card, then draw" works with an empty hand too
    if (free < 0) return false;
    for (const r of reqs) {
      if (r.k === "life") { if (s.life - r.n < 1) return false; }
      else if (r.k === "sac" || r.k === "bounce") { if (s.perms.filter(p => fwFits(r.ph, p)).length < r.n) return false; }
      else if (r.k === "tap") { if (s.board.filter(b => !b.tapped && fwFits(r.ph, b)).length < r.n) return false; }
      else if (r.k === "grave") { if (s.grave < r.n) return false; }
      else if (r.k === "behold") {
        const onBf = s.perms.filter(p => fwFits(r.ph, p)).length, inHand = Math.min(spare(s, c, r.ph), Math.max(0, free));
        if (onBf + inHand < r.n) return false;
        if (r.exile) free -= Math.max(0, r.n - onBf);
      }
      else if (r.k === "discard" || r.k === "hand" || r.k === "reveal") {
        const n = r.n === 99 ? 0 : r.n;
        if (free < n || (r.ph && spare(s, c, r.ph) < n)) return false;
        if (r.k !== "reveal") free -= n;
      }
    }
    return true;
  };
  const value = p => (pieces && pieces.has(p.name) ? 1000 : 0) + (p.src || 0) * 10 + (p.power || 0) * 3 + (/\bland\b/i.test(p.type) ? 6 : 0) + (p.trigs || p.acts ? 8 : 0) - (p.token ? 4 : 0);
  // throw away n cards you don't need (looting, discard costs)
  const tossCards = (n, k) => { k = Math.min(k, Math.max(0, n.slots - n.used)); for (let i = 0; i < k; i++) n.order.push({name: null, t: n.t}); n.used += k; n.grave += k; return k; };
  const sacrifice = (n, p, why) => { leave(n, p.id); if (!p.token) { n.grave++; n.gy.push(p.name); } const reason = `${p.name} was sacrificed${why ? " (" + why + ")" : ""}`; fire(n, {ev: "sac", card: p, id: p.id, selfTrigs: p.trigs, reason}); if (/\bcreature\b/i.test(p.type)) fire(n, {ev: "dies", reason, card: p, id: p.id, selfTrigs: p.trigs}); };
  const payReqs = (n, c, reqs, notes) => {
    for (const r of reqs) {
      if (r.k === "life") { n.life -= r.n; notes.push(`pay ${r.n} life`); }
      else if (r.k === "sac" || r.k === "bounce") {
        const got = n.perms.filter(p => fwFits(r.ph, p)).sort((a, b) => value(a) - value(b)).slice(0, r.n);
        for (const p of got) {
          if (r.k === "bounce") { leave(n, p.id); if (n.cnt[p.name]) { n.cnt[p.name]--; n.slots++; n.acq.push({t: n.t, by: "returned to your hand"}); } }
          else if (r.exile) leave(n, p.id); else sacrifice(n, p, `to pay for ${c.name}`);
        }
        notes.push(`${r.k === "bounce" ? "return" : r.exile ? "exile" : "sacrifice"} ${got.map(p => p.name).join(", ")}`);
      }
      else if (r.k === "tap") { const got = n.board.filter(b => !b.tapped && fwFits(r.ph, b)).sort((a, b) => a.p - b.p).slice(0, r.n); got.forEach(b => { b.tapped = true; }); notes.push(`tap ${got.map(b => b.name).join(", ")}`); }
      else if (r.k === "grave") { n.grave -= r.n; n.gy.splice(0, r.n); notes.push(`exile ${r.n} from your graveyard`); }
      else if (r.k === "behold") {
        // use something on the battlefield that isn't doing much; otherwise a card from your hand
        const word = r.ph.replace(/^(?:a|an) /, "");
        const bf = n.perms.filter(p => fwFits(r.ph, p)).sort((a, b) => value(a) - value(b));
        for (let i = 0; i < r.n; i++) {
          const p = bf[i], cheap = p && value(p) < 10;
          const x = pool.filter(y => fwFits(r.ph, y) && (y.qty - (n.cnt[y.name] || 0) - (y.name === c.name ? 1 : 0)) > 0 && !(pieces && pieces.has(y.name))).sort((a, b) => a.cmc - b.cmc)[0];
          if (p && (cheap || !x || n.used >= n.slots - 1)) { if (r.exile) leave(n, p.id); notes.push(`behold ${p.name}${r.exile ? " and exile it" : ""}`); }
          else if (x) { if (r.exile) { n.cnt[x.name] = (n.cnt[x.name] || 0) + 1; n.order.push({name: x.name, t: n.t}); n.used++; } notes.push(`behold ${x.name} from your hand${r.exile ? " and exile it" : ""}`); }
          else notes.push(`behold a${/^[aeiou]/.test(word) ? "n" : ""} ${word}`);
        }
      }
      else if (r.k === "discard" || r.k === "hand") {
        if (r.n === 99) { const k = tossCards(n, 99); notes.push(`discard your hand (${k})`); continue; }
        const names = [];
        for (let i = 0; i < r.n; i++) {
          // the card you'd miss least: not a combo piece, not a land you'll still want, cheapest to lose
          const x = pool.filter(y => fwFits(r.ph, y) && (y.qty - (n.cnt[y.name] || 0) - (y.name === c.name ? 1 : 0)) > 0)
            .sort((a, b) => ((pieces && pieces.has(a.name)) - (pieces && pieces.has(b.name))) || (a.land - b.land) || (a.cmc - b.cmc))[0];
          if (x) { n.cnt[x.name] = (n.cnt[x.name] || 0) + 1; n.order.push({name: x.name, t: n.t}); names.push(x.name); } else n.order.push({name: null, t: n.t});
          n.used++; if (r.k === "discard") n.grave++;
        }
        notes.push(`${r.k === "hand" ? "exile" : "discard"} ${names.join(", ") || "a card"}${r.k === "hand" ? " from your hand" : ""}`);
      }
    }
  };
  const potential = s => s.srcs.reduce((t, x) => t + x.length, 0) + s.next.reduce((t, x) => t + x.length, 0) + s.treas;
  const baseU = u => u.split(/[!#@~]/)[0];
  const colorsHave = s => new Set(s.srcs.concat(s.next).flat().filter(u => !u.includes("!")).map(baseU).map(u => u === "LEG" ? s.legCols : u === "OPAL" ? (s.arts >= 3 ? "WUBRG" : "") : u).join("").replace(/C/g, "") + (s.treas ? "WUBRG" : ""));
  // who can attack: no summoning sickness (or haste from itself, another card, Equipment or a spell), not tapped, no defender
  const granted = (s, b) => s.hasteFx.some(g => !(g.other && g.id === b.id) && fwFits(g.ph, b));
  // a creature that tapped for mana (or for an ability) this turn can't attack
  const tappedForMana = (s, b) => s.srcs.some(x => x.id === b.id) && !s.mana.some(u => u.endsWith("@" + b.id));
  const canAtk = (s, b) => !b.tapped && !b.noAttack && (!b.sick || b.haste || o.allHaste || granted(s, b)) && !tappedForMana(s, b);
  const powerOf = (s, b) => Math.max(0, b.p + (b.tmp || 0) + s.anth.reduce((t, a) => t + (!(a.other && a.id === b.id) && fwFits(a.ph, b) ? a.n : 0), 0));
  const boardDmg = (s, all) => s.board.reduce((t, b) => t + ((all ? !b.noAttack : canAtk(s, b)) ? powerOf(s, b) * (b.ds ? 2 : 1) : 0), 0);
  const byName = new Map(pool.concat(cmds).map(c => [c.name, c]));
  // instants and sorceries in a combo only count when cast in the same turn as the rest comes together
  const comboDone = s => pieces && [...pieces].every(n => s.done.includes(n) && (byName.get(n).perm || s.doneT[n] === s.t)) && s.mana.length >= (plan.need || 0);
  const fmt = u => {
    const only = fwOnly(u[0] || ""), fb = ((u[0] || "").match(/\?([A-Z]+)/) || [])[1], b = u.map(baseU);
    const txt = !b.length ? "nothing" : b.every(x => x === "WUBRG") ? (b.length > 1 ? `${b.length} mana of any colour` : "one mana of any colour") : b.map(x => x === "C" ? "{C}" : x.length > 1 ? x.split("").map(y => `{${y}}`).join("/") : `{${x}}`).join("");
    return txt + (only ? ` (${only} spells only${fb ? `; {${fb}} for anything else` : ""})` : "");
  };
  // Chromatic Lantern: every land makes any colour (the mana already in your pool too)
  const isLandId = (s, id) => ((s.names || {})[id] || [])[1];
  const anyLands = s => {
    const fix = u => { const m = u.match(/^([A-Z]+)(.*)$/); return m && m[2].startsWith("#") && isLandId(s, +m[2].slice(1).replace(/\D.*$/, "")) ? "WUBRG" + m[2] : u; };
    const fixSrc = x => { if (!isLandId(s, x.id)) return x; const y = x.map(u => "WUBRG" + u.slice(u.indexOf("#"))); y.id = x.id; return y; };
    s.srcs = s.srcs.map(fixSrc); s.next = s.next.map(fixSrc); s.idle = s.idle.map(fixSrc); s.mana = s.mana.map(fix);
  };
  const grantSrcs = s => {
    if (s.perms.some(p => p.landsAny)) anyLands(s);
    const gs = s.perms.filter(p => p.grantDork); if (!gs.length) return;
    for (const b of s.board) {
      if (s.srcs.some(x => x.id === b.id) || s.next.some(x => x.id === b.id)) continue;
      const g = gs.find(p => !(p.grantDork.other && p.id === b.id) && fwFits(p.grantDork.ph, b)); if (!g) continue;
      const src = srcOf(g.grantDork.units, b.id, true);
      if (!b.sick || b.haste || granted(s, b)) { s.srcs.push(src); tapSrc(s, src); } else s.next.push(src);
    }
  };
  // which permanents (or Treasures, or floating mana) paid for something: the mana that was there before and isn't after
  const srcName = (s, u) => {
    let m = u.match(/[#@](\d+)$/);
    if (m) { const nm = (s.names || {})[+m[1]] || ["a mana source", false]; return {id: +m[1], name: nm[0], kind: u.includes("@") ? "creature" : nm[1] ? "land" : "rock", gone: !s.perms.some(q => q.id === +m[1])}; }
    if (u.includes("~T")) return {kind: "treasure", name: "Treasure"};
    m = u.match(/~=(.+)$/); return {kind: "pool", name: m ? m[1] : ""};
  };
  const spentOf = (s, before, after) => { const rest = after.slice(), out = []; for (const u of before) { const i = rest.indexOf(u); if (i >= 0) rest.splice(i, 1); else out.push(srcName(s, u)); } return out; };
  // a creature arriving (from a spell, a token or a copy)
  const addCreature = (n, c, pid, notes, opts = {}) => {
    const hasty = !!(c.haste || opts.haste) || granted(n, {id: pid, type: c.type, cols: c.cols, changeling: c.changeling, name: c.name});
    const b = {id: pid, p: c.power || 0, ds: c.ds, inf: c.infect, sick: true, haste: hasty, ownHaste: !!c.haste, noAttack: c.noAttack, cmd: c.cmd, name: c.name, type: c.type, cols: c.cols, changeling: c.changeling, token: !!opts.token, attNow: !!opts.attacking};
    n.board.push(b);
    return b;
  };
  // A trigger's or ability's effect, in finder terms. Returns a short note.
  const fwEff = (n, a, src, e) => {
    const amt = a.colorsX ? new Set(n.perms.map(p => p.cols || "").join("").replace(/C/g, "")).size : a.x || a.many ? (e && e.amount) || 1 : a.count ? 1 : (a.n || 1);
    const own = pid => n.board.find(b => b.id === pid);
    switch (a.t) {
      case "draw": { const k = a.count ? Math.max(1, n.perms.filter(p => fwFits(String(a.count).replace(/^the number of /, "").replace(/ you control$/, ""), p)).length) : amt; n.slots += k; for (let i = 0; i < k; i++) n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); return `draw ${k}`; }
      case "token": {
        let k = a.each ? n.perms.filter(p => fwFits(a.each.replace(/ you control$/, ""), p)).length : amt;
        const d = a.def || {};
        if (/^treasure$/i.test(d.name)) { n.treas += k; for (let i = 0; i < k; i++) n.mana.push("WUBRG~T"); return `${k} Treasure${k > 1 ? "s" : ""}`; }
        if (/^clue$/i.test(d.name)) { n.clues += k; return `${k} Clue${k > 1 ? "s" : ""}`; }
        if (!d.power) return `${k} ${d.name} token${k > 1 ? "s" : ""}`;
        for (let i = 0; i < k && i < 30; i++) {
          const tc = {name: d.name, type: d.type || "Token Creature", cols: (d.colors || []).join("") || "C", power: parseInt(d.power) || 0, haste: /haste/i.test(d.text || ""), token: true};
          const pid = arrive(n, tc, {power: tc.power}); addCreature(n, tc, pid, null, {token: true, attacking: a.attacking});
          fire(n, {ev: "etb", card: Object.assign({}, tc, {id: pid}), id: pid}); fire(n, {ev: "token", card: tc, id: pid});
        }
        return `${k} ${d.power}/${d.toughness} ${d.name}${k > 1 ? "s" : ""}${a.attacking ? " attacking" : ""}`;
      }
      case "copy": {
        const pick = a.of === "self" ? src.id : a.of === "it" && e ? e.id : (n.board.slice().sort((x, y) => y.p - x.p)[0] || {}).id;
        const b0 = n.board.find(b => b.id === pick), p0 = n.perms.find(q => q.id === pick) || (a.of === "it" && e && e.id === pick ? e.card : null);
        if (!b0 && !p0) return "";
        const base = Object.assign({}, p0 || {}, b0 || {}, {p: b0 ? b0.p : (p0.power || 0)});
        for (let i = 0; i < (a.n || 1); i++) {
          // a copy has everything the card has: start from the card itself (not just what's on the battlefield record)
          const full = byName.get(base.name) || {};
          const tc = Object.assign({}, full, {name: base.name, type: base.type || full.type, cols: base.cols || full.cols, changeling: base.changeling, power: a.set ? a.set[0] : base.p, ds: base.ds, haste: base.ownHaste || a.haste, noAttack: base.noAttack, token: true, cmd: false,
            trigs: (base.trigs || full.trigs || []).concat(base.copyTrigs || full.copyTrigs || []), copyTrigs: base.copyTrigs || full.copyTrigs, acts: base.acts || full.acts, reduce: base.reduce || full.reduce, grantEvoke: base.grantEvoke || full.grantEvoke});
          const pid = arrive(n, tc, {power: tc.power}); n._lastTok = pid;
          // its always-on abilities: haste for others (Maelstrom Wanderer), anthems, Yarok/Twinflame doubling (via arrive), mana
          if (tc.giveHaste) for (const g of tc.giveHaste) n.hasteFx.push({id: pid, ph: g.ph, other: g.other});
          if (tc.anthem) for (const an of tc.anthem) n.anth.push({id: pid, ph: an.ph, other: an.other, n: an.n});
          if (tc.legend) { for (const k2 of tc.cols || "") if (!n.legCols.includes(k2)) n.legCols += k2; }
          if (tc.artifact) n.arts++;
          if (tc.rock) { const s3 = srcOf(tc.rock, pid); if (tc.rockTapped) n.next.push(s3); else { n.srcs.push(s3); tapSrc(n, s3); } }
          if (tc.dork) { const s3 = srcOf(tc.dork, pid, true); if (tc.manaPer) s3.per = tc.manaPer; if (a.haste || tc.haste) { n.srcs.push(s3); tapSrc(n, s3); } else n.next.push(s3); }
          if (/\bcreature\b/i.test(tc.type || "")) addCreature(n, tc, pid, null, {token: true, haste: a.haste});
          fire(n, {ev: "etb", card: Object.assign({}, tc, {id: pid}), id: pid}); fire(n, {ev: "token", card: tc, id: pid});
        }
        return `token copy of ${base.name}${a.haste ? " with haste" : ""}`;
      }
      case "opp": case "drainSum": case "eachLose": { const k = a.countPh ? n.perms.filter(p => fwFits(a.countPh, p)).length : a.much && e && e.amount ? e.amount : amt; n.opp -= k; return `${k} to the opponent`; }
      case "life": { n.life += a.n > 0 ? amt : -amt; if (a.n > 0 && amt > 0 && !n._inGain) { n._inGain = true; fire(n, {ev: "gainlife", amount: amt}); n._inGain = false; } return ""; }
      case "counter": {
        if (a.kind !== "p1p1") return "";
        const k = amt, list = a.on === "self" ? [own(src.id)] : a.on === "it" && e ? [own(e.id)] : a.on === "all" ? n.board : a.on === "allOther" ? n.board.filter(b => b.id !== src.id) : a.on === "each" ? n.board.filter(b => fwFits(a.each, b)) : [n.board.slice().sort((x, y) => y.p - x.p)[0]];
        list.filter(Boolean).forEach(b => { b.p += k; }); return list.filter(Boolean).length ? `+${k}/+${k} counter${list.length > 1 ? "s" : ""}` : "";
      }
      case "pump": {
        const list = a.who === "self" ? [own(src.id)] : a.who === "it" && e ? [own(e.id)] : a.who === "all" ? n.board : a.who === "allOther" ? n.board.filter(b => b.id !== src.id) : a.who === "each" ? n.board.filter(b => fwFits(a.phrase, b) && !(a.other && b.id === src.id)) : a.who === "attacking" ? n.board.filter(b => b.atk) : a.who === "pick" ? [n.board.slice().sort((x, y) => y.p - x.p)[0]] : [];
        const k = a.count ? n.board.length : a.p || 0;
        list.filter(Boolean).forEach(b => { b.tmp = (b.tmp || 0) + k; if ((a.kws || []).includes("haste")) b.haste = true; });
        return list.filter(Boolean).length ? `+${k} power this turn${(a.kws || []).includes("haste") ? ", haste" : ""}` : "";
      }
      case "mana": { const u = fwUnits(a.what); n.mana.push(...u.map(x => x + "~=" + src.name)); return u.length ? `adds ${fmt(u)}` : ""; }
      case "untap": {
        if (a.on === "lands") { let k = 0; for (const x of n.srcs) if (n.perms.some(p => p.id === x.id && /\bland\b/i.test(p.type))) { n.mana.push(...x.map(u => live(n, u)).filter(Boolean)); k++; } return `untap ${k} lands`; }
        const land = n.srcs.find(x => n.perms.some(p => p.id === x.id && /\bland\b/i.test(p.type)) && !n.mana.some(u => u.endsWith("#" + x.id)));
        if (land && /land/.test(a.label || "")) { n.mana.push(...land); return "untap a land"; }
        return "";
      }
      case "searchAuto": {
        if (/\bland\b|basic|plains|island|swamp|mountain|forest/.test(a.phrase || "")) {
          const have = colorsHave(n), want = Object.keys(demand).sort((x, y) => demand[y] - demand[x]).find(x => !have.has(x)) || "C";
          const basic = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"}[want] || "Wastes";
          for (let i = 0; i < (a.to === "split" ? 1 : a.n || 1); i++) {
            if (a.to === "hand") { n.slots++; n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); continue; }
            const id = arrive(n, {name: basic, type: "Basic Land — " + basic, cols: "C"}, {src: 1}), s2 = srcOf([want], id);
            if (a.tapped) n.next.push(s2); else { n.srcs.push(s2); tapSrc(n, s2); }
          }
          if (a.to === "split") { n.slots++; n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); }
          return "fetch a land";
        }
        if (a.to === "hand" || a.to === "top") { n.slots++; n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); return "tutor a card"; }
        return "";
      }
      case "topif": {   // Risen Reef: the top card — a land goes onto the battlefield tapped, anything else goes to your hand
        const toHand = why => { n.slots++; n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); return why; };
        if (n.topCard) { const nm = n.topCard; n.topCard = null; n.topSet = false; n.back.push(nm); return `${nm} (the card you put on top) goes to your hand`; }
        if (n.topSet) { n.topSet = false; return toHand("the card you put on top isn't a land: it goes to your hand"); }
        if (o.lib) {   // a real library: the actual next card
          const nm = o.lib[n.slots]; if (!nm) return "";
          const card = pool.find(c => c.name === nm);
          if (card && card.land && /land/.test(a.phrase || "") && /bf/.test(a.yes || "")) {
            n.slots++; n.used++; n.cnt[nm] = (n.cnt[nm] || 0) + 1; n.order.push({name: nm, t: n.t});
            const lid = arrive(n, card, {src: card.yield}), ls = srcOf(card.units, lid); n.next.push(ls);
            fire(n, {ev: "etb", card: Object.assign({}, card, {id: lid}), id: lid});
            return `top card is ${nm}: onto the battlefield tapped`;
          }
          return toHand(`top card is ${nm}: it goes to your hand`);
        }
        // best case: a land while you still want more mana (fewer than 7 lands), otherwise a spell for your hand
        const landsOut = n.perms.filter(p => /\bland\b/i.test(p.type || "")).length;
        if (/land/.test(a.phrase || "") && /bf/.test(a.yes || "") && landsOut < 7) { fwEff(n, {t: "searchAuto", phrase: "land", to: "bf", tapped: /tapped/i.test(a.yes), n: 1}, src, e); return "top card is a land: onto the battlefield tapped"; }
        return toHand("top card isn't a land: it goes to your hand");
      }
      case "search": if (/top/.test((a.to || "") + " " + (a.label || ""))) return fwEff(n, {t: "tutorTop"}, src, e); n.slots++; n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); return "tutor a card";
      case "tutorTop": {
        // "search … then shuffle and put that card on top": the shuffle sends any card put on top earlier back into the library
        const again = n.topSet || n.topCard;
        n.topSet = true;
        if (o.lib) {   // a real library: the best fitting card still in it becomes the next card you get
          let pick = null, bv = -1;
          for (const c of pool) {
            if (c.land || (n.cnt[c.name] || 0) + n.back.filter(x => x === c.name).length >= c.qty || (a.ph && !fwFits(a.ph, c))) continue;
            const v = (pieces && pieces.has(c.name) ? 1000 : 0) + (c.power || 0) * 2 + (c.trigs ? 6 : 0) + (c.draw || 0) * 4 + (c.cascade ? 8 : 0);
            if (v > bv) { bv = v; pick = c.name; }
          }
          const old = n.topCard; n.topCard = pick;
          if (!pick) return "finds nothing to put on top";
          return old ? (old !== pick ? `shuffles ${old} back into the library and puts ${pick} on top (only one card stays on top)` : `shuffles, then puts ${pick} on top again (only one card stays on top)`) : `puts ${pick} on top of your library: your next card`;
        }
        return again ? "shuffles the card put on top earlier back in, and puts the one you want on top (still only one card on top)" : "puts the card you want on top of your library (no extra card: it becomes your next draw)";
      }
      case "dig": if (a.auto) { n.slots++; n.acq.push({t: n.t, by: src.name, log: n._logAt != null ? n._logAt : n.log.length}); return "take a card off the top"; } return "";
      case "discard": { const k = tossCards(n, a.hand ? 99 : amt); return k ? `discard ${k}` : ""; }
      case "sacYou": { const got = n.perms.filter(p => p.id !== src.id && fwFits(a.phrase || "permanent", p)).sort((x, y) => value(x) - value(y)).slice(0, amt); got.forEach(p => sacrifice(n, p, `${src.name}'s trigger`)); return got.length ? `sacrifice ${got.map(p => p.name).join(", ")}` : ""; }
      case "monarch": n.monarch = true; return "you become the monarch";
      case "delay": if (a.act === "sac" && n._lastTok) {
        const keepCost = a.unless ? (a.unless.match(/\{[^}]+\}/g) || []).join("").toUpperCase() : "";
        setPerm(n, n._lastTok, {temp: true, keepCost});
        return `it's sacrificed at end of turn${keepCost ? ` unless you pay ${keepCost}` : ""}`;
      } return "";
      case "fromGrave": {
        if (a.to !== "hand" || !n.gy.length) return "";
        const name = bestFromGy(n, () => true); if (!name) return "";
        n.gy.splice(n.gy.indexOf(name), 1); n.grave = Math.max(0, n.grave - 1); n.back.push(name);
        return `returns ${name} from your graveyard to your hand`;
      }
      case "castGy": {   // Impulsivity: cast an instant or sorcery from a graveyard for free
        const name = bestFromGy(n, c => !c.perm); if (!name) return "";
        n.casc.push({mv: 99, gy: name, how: "cast from the graveyard", from: src.name});
        return `casts ${name} from your graveyard for free`;
      }
    }
    return "";
  };
  // Triggers: every permanent's triggered abilities that this event sets off (and the card's own, for "when you cast this" / "when this dies")
  const fitsCond = (cond, e, src) => {
    if (cond.ev === "attackers") return e.ev === "attack" && e.first;
    if (cond.ev !== e.ev) return false;
    if (cond.nth && e.nth !== cond.nth) return false;
    if (cond.ev === "lore") return e.id === src.id && cond.n === e.n;
    if (["upkeep", "landplay", "draw", "discard", "combat", "endstep", "gainlife"].includes(cond.ev)) return true;
    const c = e.card; if (!c) return false;
    if (cond.ev === "token") return fwFits(cond.phrase || "", c);
    const pw = String(cond.phrase || "").match(/with power (\d+) or greater/);
    if (pw) { const p0 = c.p != null ? c.p : c.power || 0; if (p0 < +pw[1]) return false; cond = Object.assign({}, cond, {phrase: cond.phrase.replace(/ ?with power \d+ or greater/, "")}); }
    const self = e.id != null && e.id === src.id;
    if (cond.ev === "cast" && cond.who !== "self") return !self && fwFits((cond.phrase || "").replace(/\bspells?\b/g, "").trim(), c);
    if (cond.who === "self") return self;
    if (cond.who === "attached") return false;
    if (cond.who === "other" && self) return false;
    if (cond.who === "selfOrOther" && self) return true;
    if (cond.nontoken && c.token) return false;
    if (cond.tokenOnly && !c.token) return false;
    return fwFits((cond.phrase || "").replace(/\bcardname\b/g, ""), c);
  };
  function fire(n, e){
    if (n.budget <= 0) return;
    if ((e.ev === "token" || (e.ev === "sac" && e.card && e.card.token)) && n.perms.some(p => p.tokenDrain)) for (const p of n.perms.filter(q => q.tokenDrain)) { n.opp -= p.tokenDrain; n.log.push({t: n.t, kind: "trigger", name: p.name, note: `opponent loses ${p.tokenDrain}`, why: e.ev}); }
    const srcs = n.perms.filter(p => p.trigs).map(p => ({id: p.id, name: p.name, trigs: p.trigs, type: p.type, cols: p.cols, changeling: p.changeling}));
    if (e.selfTrigs && !srcs.some(x => x.id === e.id)) srcs.push({id: e.id, name: e.card.name, trigs: e.selfTrigs, type: e.card.type, cols: e.card.cols, changeling: e.card.changeling});
    // you order your triggers: "put a card on top" (Flamekin Harbinger) goes first so "look at the top card" (Risen Reef) finds it
    const topFirst = x => x.trigs.some(tr => tr.acts.some(q => q.t === "tutorTop")) ? 1 : 0;
    srcs.sort((x, y) => topFirst(y) - topFirst(x));
    const dbls = n.perms.filter(p => p.dbl);
    for (const src of srcs) for (const tr of src.trigs) {
      if (!tr.conds.some(k => fitsCond(k, e, src))) continue;
      if (tr.notToken && (n.perms.find(p => p.id === src.id) || e.card || {}).token) continue;   // a token copy doesn't copy itself again
      // Yarok: things entering make triggers happen twice; Twinflame Travelers: another Elemental's triggers happen twice
      const dl = dbls.filter(d => d.dbl.etb ? e.ev === "etb" : d.id !== src.id && fwFits(d.dbl.ph, src)), times = 1 + dl.length;
      for (let k = 0; k < times; k++) {
      if (--n.budget <= 0) return;
      // "you may pay {N}. If you do": only when the mana is there; "you may sacrifice another …": only with something to sacrifice
      let paid = null;
      if (tr.pay) { const after = fwPay(n.mana, tr.pay, 0); if (!after) continue; paid = spentOf(n, n.mana, after); n.mana = after; }
      if (tr.sac && !n.perms.some(p => p.id !== src.id && fwFits(tr.sac, p))) continue;
      if (tr.ctl && n.perms.filter(p => !(tr.ctl.other && p.id === src.id) && fwFits(tr.ctl.ph, p)).length < tr.ctl.n) continue;
      const at = n.log.length, keep = n._logAt; n.log.push({t: n.t, kind: "none"}); n._logAt = at;   // its line comes before anything it sets off
      const n0 = tr.first ? fwEff(n, tr.acts[0], src, e) : null;
      const notes = (paid ? [`paid ${tr.payTxt}`] : []).concat(tr.first ? (n0 ? [n0].concat(tr.acts.slice(1).map(a => fwEff(n, a, src, e))) : []) : tr.acts.map(a => fwEff(n, a, src, e))).filter(Boolean);
      n._logAt = keep;
      if (notes.length) n.log[at] = {t: n.t, kind: "trigger", name: src.name, note: notes.join(", ") + (k ? ` (again: ${dl[k - 1].name})` : ""), why: e.ev, whyTxt: e.reason, tap: paid || undefined};
      }
    }
  }
  // which of your permanents' cost reducers apply to this spell
  const counters = (s, p) => { const b = s.board.find(x => x.id === p.id); return b ? Math.max(0, b.p - (p.power || 0)) : 0; };
  const reduction = (s, c) => s.perms.reduce((t, p) => t + (p.reduce || []).reduce((t2, r) => t2 + (!r.ph || fwFits(r.ph, c) ? r.n * (r.perCounter ? counters(s, p) : 1) : 0), 0), 0);
  const withReduce = (pay, red) => red ? {cols: pay.cols, gen: Math.max(0, pay.gen - red)} : pay;
  const play = (s, c, after, op) => {
    op = op || {};
    if (c.xEnters && op.x) c = Object.assign({}, c, {power: op.x});   // "enters with X +1/+1 counters": an X/X
    const n = clone(s), pay = op.pay || c.pay, k = pay.gen + taxOf(s, c) + pay.cols.length;
    n.mana = after.slice(); n.budget = 60;   // its own copy: options can share the array they were priced against
    // the spell's own line goes first; anything its costs or effects set off (sacrifice triggers…) follows
    const logAt = n.log.length; n.log.push({t: n.t, kind: "none"});
    const pre = [];
    // a free spell skips only the mana cost: additional costs (behold and exile, sacrifice, discard…) are still paid
    if (op.free) { n.casc.shift(); if (op.fromGy) { const i = n.gy.indexOf(c.name); if (i >= 0) n.gy.splice(i, 1); n.grave = Math.max(0, n.grave - 1); } else n.cnt[c.name] = (n.cnt[c.name] || 0) + 1; payReqs(n, c, c.reqs || [], pre); }
    else payReqs(n, c, op.reqs || c.reqs || [], pre);
    if (op.free) { /* off the top of the library */ }
    else if (c.cmd) { n.cmdOut.push(c.name); n.tax[c.name] = (n.tax[c.name] || 0) + 1; }
    else if (n.back.includes(c.name)) { n.back.splice(n.back.indexOf(c.name), 1); n.cnt[c.name] = (n.cnt[c.name] || 0) + 1; n.order.push({name: c.name, t: n.t}); }   // a card you got back from the graveyard, or put on top and drew
    else { n.used++; n.cnt[c.name] = (n.cnt[c.name] || 0) + 1; n.order.push({name: c.name, t: n.t}); }
    const notes = [], tap = spentOf(s, s.mana, after);
    if (op.convoke && op.convoke.length) { const names = []; for (const id of op.convoke) { const b = n.board.find(x => x.id === id); if (b) { b.tapped = true; names.push(b.name); } } if (names.length) pre.push(`convoke: tap ${names.join(", ")}`); }
    // the opponent counters your first spell that costs 3 or more
    const uncounterable = c.noCounter || s.mana.some(u => u.includes("$") && !after.includes(u) && fwFits(fwOnly(u), c));   // Cavern of Souls
    if (o.oppCounter && !n.countered && !op.free && !c.land && (c.cmc || 0) >= 3 && !uncounterable) {
      n.countered = true; if (!c.cmd) { n.grave++; n.gy.push(c.name); }
      n.log[logAt] = {t: n.t, kind: c.cmd ? "commander" : "cast", name: c.name, img: c.img, tap, costs: pre, mana: fwCostTxt(op.pay || c.pay), how: op.how || "", note: "countered by the opponent"};
      return n;
    }
    // "whenever you cast…" triggers happen as it's cast
    if (!op.put) n.castN++; if (!op.put) fire(n, {ev: "cast", card: c, id: -1, nth: n.castN, selfTrigs: c.trigs ? c.trigs.filter(tr => tr.conds.some(k => k.ev === "cast" && k.who === "self")) : null});
    if (c.discardFirst) { const t0 = tossCards(n, c.discardFirst); if (t0) notes.push(`discard ${t0}`); }
    if (c.burst) { n.mana.push(...c.burst.map(u => u + "~=" + c.name)); notes.push(`adds ${fmt(c.burst)}`); if (c.dumpHand) { const t0 = tossCards(n, 99); notes.push(`discard your hand (${t0})`); } }
    // where it ends up: battlefield (remembered), graveyard, or exile
    const stays = c.perm && !c.burst && !op.evoke, evoked = op.evoke && c.perm;
    const pid = stays || evoked ? arrive(n, c, {src: (c.rock || c.dork || []).length, power: c.power || 0}) : null;
    if (!stays && !c.guide && !evoked) { n.grave++; if (!op.fromGy) n.gy.push(c.name); }   // cast from a graveyard (Impulsivity): exiled instead
    if (op.evoke) notes.push("evoked: sacrificed as it enters");
    if (c.extra) { n.used += c.extra; const l = c.discardLand && lands.find(x => left(n, x)); if (l) { n.cnt[l.name] = (n.cnt[l.name] || 0) + 1; n.order.push({name: l.name, t: n.t}); notes.push(`discard ${l.name}`); } else if (!c.discardLand) { n.order.push({name: null, t: n.t}); notes.push("imprint a card from your hand"); } }
    if (c.landsAny && stays) notes.push("your lands tap for any colour");
    if (c.grantDork && stays) notes.push(`your ${c.grantDork.ph} can tap for ${fmt(c.grantDork.units)} (not while summoning sick)`);
    if (c.artifact) n.arts++;
    if (c.legend) { for (const k2 of c.cols) if (!n.legCols.includes(k2)) n.legCols += k2; }
    if (c.rock) { const src = srcOf(c.rock, pid); if (c.manaPer) src.per = c.manaPer; if (c.rockTapped) n.next.push(src); else { n.srcs.push(src); tapSrc(n, src); } notes.push(c.rock[0] === "LEG" ? (n.legCols ? `taps for a colour of your legends` : "no mana until you control a legendary creature or planeswalker") : c.rock[0] === "OPAL" ? (n.arts >= 3 ? "taps for any colour" : "no mana until you control three artifacts") : `taps for ${fmt(c.rock)}${c.rockTapped ? " from next turn" : ""}`); }
    if (c.legend || c.artifact) wake(n);
    if (c.giveHaste && stays) for (const g of c.giveHaste) n.hasteFx.push({id: pid, ph: g.ph, other: g.other});
    if (c.anthem && stays) for (const a of c.anthem) n.anth.push({id: pid, ph: a.ph, other: a.other, n: a.n});
    if (c.equipHaste != null && stays) n.equips.push({id: pid, cost: c.equipHaste, name: c.name, on: null});
    const hasty = !!(c.haste || op.haste) || (c.power && granted(n, {id: pid, type: c.type, cols: c.cols, changeling: c.changeling, name: c.name}));
    if (c.dork && !op.evoke) {
      const src = srcOf(c.dork, pid, true); if (c.manaPer) src.per = c.manaPer;
      if (hasty) { n.srcs.push(src); tapSrc(n, src); notes.push(`taps for ${fmt(c.dork)} right away (haste)`); }
      else { n.next.push(src); notes.push(`taps for ${fmt(c.dork)} from next turn (summoning sick)`); }
    }
    if (c.ramp) {
      const have = colorsHave(n), want = Object.keys(demand).sort((a, b) => demand[b] - demand[a]).find(x => !have.has(x)) || Object.keys(demand).sort((a, b) => demand[b] - demand[a])[0] || "C";
      const basic = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"}[want] || "Wastes";
      for (let i = 0; i < c.ramp; i++) { const id = arrive(n, {name: basic, type: "Basic Land — " + basic, cols: "C"}, {src: 1}), src = srcOf([want], id); if (c.rampTapped) n.next.push(src); else { n.srcs.push(src); tapSrc(n, src); } }
      notes.push(`fetches ${c.ramp > 1 ? c.ramp + " basic lands" : "a basic land"}${c.rampTapped ? " (tapped)" : ""}`);
    }
    if (c.wheel) { const t0 = tossCards(n, 99); if (t0) notes.push(`discard your hand (${t0})`); }
    let drawN = c.drawEach ? n.perms.filter(p => fwFits(c.drawEach, p)).length : c.drawMaxPow ? Math.max(0, ...n.board.filter(b => fwFits(c.drawMaxPow, b)).map(b => powerOf(n, b))) : c.draw || 0;
    if (drawN && c.etbDraw && (stays || evoked)) drawN *= 1 + n.perms.filter(p => p.dbl && (p.dbl.etb || (p.name !== c.name && fwFits(p.dbl.ph, c)))).length;
    if (drawN) { n.slots += drawN; for (let i = 0; i < drawN; i++) n.acq.push({t: n.t, by: c.name, log: logAt}); notes.push(`draw ${drawN}`); }
    if (c.discardAfter) { const t0 = tossCards(n, c.discardAfter); notes.push(`then discard ${t0 || c.discardAfter}`); }
    if (c.drawLater) { for (let i = 0; i < c.drawLater; i++) n.later.push({by: c.name, log: logAt}); notes.push(`draw ${c.drawLater} next upkeep`); }
    if (c.power && !op.evoke) {
      const b = addCreature(n, c, pid, notes, {haste: op.haste});
      b.haste = hasty;
      const selfHaste = (c.giveHaste || []).some(g => !g.other && fwFits(g.ph, c));
      if (hasty) notes.push(c.haste || selfHaste ? "haste" : op.haste ? `${op.how}: haste` : "has haste from another card");
      // no haste of its own: move haste-giving Equipment onto it, if there's mana for the equip cost
      else if (!c.noAttack) for (const e of n.equips) {
        if (e.t === n.t) continue;
        const left2 = fwPay(n.mana, {cols: [], gen: e.cost}); if (!left2) continue;
        tap.push(...spentOf(n, n.mana, left2)); n.mana = left2; e.t = n.t; b.haste = true; notes.push(`equip ${e.name}${e.cost ? ` ({${e.cost}})` : ""}: haste`); break;
      }
      if (!b.haste && !c.noAttack && !c.dork) notes.push("summoning sick");
      if (c.noAttack) notes.push("can't attack");
    }
    if (c.pump && !(c.pump.min && (op.x || 0) < c.pump.min)) { const k2 = c.pump.x === "X" ? (op.x || 0) : c.pump.x ? n.board.length : c.pump.n; if (k2) { n.board.forEach(b => { b.tmp = (b.tmp || 0) + k2; }); notes.push(`creatures get +${k2}/+${k2} this turn`); } }
    if (c.teamHaste && !(c.teamHaste.min && (op.x || 0) < c.teamHaste.min)) { n.board.forEach(b => { b.haste = true; }); notes.push("your creatures gain haste"); }
    if (c.oneHaste) { const b = n.board.filter(x => x.sick && !x.haste && !x.noAttack).sort((a, b2) => powerOf(n, b2) - powerOf(n, a))[0]; if (b) { b.haste = true; notes.push(`${b.name} gains haste`); } }
    if (c.burn) { n.opp -= c.burn; notes.push(`${c.burn} damage`); }
    if (c.modeTxt) notes.unshift(`mode: ${c.modeTxt}`);
    if (pieces && pieces.has(c.name)) { if (!n.done.includes(c.name)) n.done.push(c.name); n.doneT[c.name] = n.t; }
    // its own cascades and discover go on the stack and resolve before anything else
    const newQ = [];
    if (c.summons) { const k = n.perms.filter(p => /\bcreature\b/i.test(p.type || "") && fwFits(c.summons, p)).length; for (let i = 0; i < k; i++) newQ.push({mv: 99, from: c.name, how: "put onto the battlefield", ph: c.summons, put: true}); if (k) notes.push(`${k} ${c.summons}${k > 1 ? "s" : ""} from your library onto the battlefield`); }
    for (let i = 0; i < (c.cascade || 0); i++) newQ.push({mv: (c.cmc || 0) - 1, from: c.name, how: "cascade"});
    if (c.discover) newQ.push({mv: c.discover, from: c.name, how: `discover ${c.discover}`});
    n.casc = newQ.concat(n.casc);
    if (c.cascade) notes.push(c.cascade > 1 ? `cascade ×${c.cascade}` : "cascade");
    const tx = taxOf(s, c), paid = op.free || c.guide ? null : {cols: pay.cols, gen: pay.gen + tx};
    n.log[logAt] = {t: n.t, kind: op.put ? "put" : op.free ? "free" : c.cmd ? "commander" : "cast", x: op.x, perm: stays, from: op.from, name: c.name, img: c.img, tap, costs: pre, mana: paid && paid.gen + paid.cols.length ? fwCostTxt(paid) : paid ? "{0}" : "",
      how: op.free ? op.how : c.guide ? "exile it from your hand" : [op.how, op.red ? `{${op.red}} less` : "", tx ? `includes {${tx}} commander tax` : ""].filter(Boolean).join(" · "), cost: op.free ? `free, ${op.how}` : c.guide ? "exile it from your hand" : (op.how ? (pay.gen + pay.cols.length ? fwCostTxt(pay) + " · " : "") + op.how : (op.red ? fwCostTxt(pay) + ` (${op.red} less)` : c.cost || String(k))) + (taxOf(s, c) ? ` +${taxOf(s, c)} tax` : ""), note: notes.join(", ")};
    // enters-the-battlefield triggers (its own and other cards')
    if (stays) fire(n, {ev: "etb", card: c, id: pid});
    if (stays && c.chapters) loreUp(n, n.perms.find(q => q.id === pid));   // a Saga: chapter I now
    if (evoked) { fire(n, {ev: "etb", card: c, id: pid}); const p = n.perms.find(q => q.id === pid); if (p) sacrifice(n, p, "evoke"); }
    grantSrcs(n);
    if (comboDone(n)) n.won = {t: n.t, how: "combo"};
    else if (n.opp <= 0) n.won = {t: n.t, how: "damage"};
    return n;
  };
  // using an activated ability of a permanent: pay every cost (tap, mana, sacrifice, life, discard), then the effect
  const actOK = (s, p, ab) => {
    if (ab.once && (p.used || {})[ab.label] === s.t) return false;
    if (ab.tap) { if (p.tapped) return false; const b = s.board.find(x => x.id === p.id); if (b && ((b.sick && !b.haste && !granted(s, b)) || b.tapped)) return false; if (s.srcs.some(x => x.id === p.id) && !s.mana.some(u => u.endsWith("#" + p.id) || u.endsWith("@" + p.id))) return false; }
    if (ab.sac && s.perms.filter(q => q.id !== p.id && fwFits(ab.sac.ph, q)).length < ab.sac.n) return false;
    if (ab.life && s.life - ab.life < 1) return false;
    if (ab.discard && ab.discard !== 99 && s.slots - s.used < ab.discard) return false;
    return true;
  };
  const activate = (s, p, ab, after) => {
    const n = clone(s); n.mana = after.slice(); n.budget = 60;
    const notes = [], tap = spentOf(s, s.mana, after), costs = [];
    const logAt = n.log.length; n.log.push(null);   // the ability's own line comes first: what its costs set off (a sacrifice → Ashling's copy) follows it
    if (ab.tap) tap.push({id: p.id, name: p.name, kind: "self"});
    if (ab.tap) { setPerm(n, p.id, {tapped: true}); const i = n.mana.findIndex(u => u.endsWith("#" + p.id) || u.endsWith("@" + p.id)); if (i >= 0) n.mana.splice(i, 1); const b = n.board.find(x => x.id === p.id); if (b) b.tapped = true; }
    if (ab.once) setPerm(n, p.id, {used: Object.assign({}, p.used, {[ab.label]: n.t})});
    if (ab.life) n.life -= ab.life;
    if (ab.discard) { const t0 = tossCards(n, ab.discard); notes.push(`discard ${t0}`); }
    if (ab.sac) { const got = n.perms.filter(q => q.id !== p.id && fwFits(ab.sac.ph, q)).sort((a, b) => value(a) - value(b)).slice(0, ab.sac.n); for (const q of got) if (n.mana.some(u => u.endsWith("@" + q.id))) notes.push(`tap ${q.name} for mana first (the mana stays after it's gone)`); got.forEach(q => sacrifice(n, q, `to ${p.name}`)); notes.push(`sacrifice ${got.map(q => q.name).join(", ")}`); }
    if (ab.sacSelf) { sacrifice(n, n.perms.find(q => q.id === p.id) || p, "for its own ability"); notes.push("sacrifice it"); }
    n._logAt = logAt; for (const a of ab.effs) { const r = fwEff(n, a, {id: p.id, name: p.name}, null); if (r) notes.push(r); } n._logAt = null;
    grantSrcs(n);
    n.log[logAt] = {t: n.t, kind: "ability", name: p.name, cost: ab.costText, mana: ab.pay.gen + ab.pay.cols.length ? fwCostTxt(ab.pay) : "", costs: notes.filter(x => /^(discard|sacrifice)/.test(x)).concat(ab.life ? [`pay ${ab.life} life`] : []), tap, note: notes.filter(x => !/^(discard|sacrifice)/.test(x)).join(", ")};
    if (comboDone(n)) n.won = {t: n.t, how: "combo"}; else if (n.opp <= 0) n.won = {t: n.t, how: "damage"};
    return n;
  };
  // which plays are worth trying from here (keeps the search small); each with the mana left after paying
  // the card in your graveyard worth most right now: a combo piece, then a pump or draw spell, then the biggest creature
  const bestFromGy = (n, ok) => {
    let best = null, bv = -1;
    for (const name of new Set(n.gy)) {
      const c = byName.get(name); if (!c || !ok(c)) continue;
      const v = (pieces && pieces.has(c.name) && !n.done.includes(c.name) ? 1000 : 0) + (c.pump ? 60 : 0) + (c.burst ? 40 + c.burst.length : 0) + (c.draw || 0) * 8 + (c.power || 0) * 3 + (c.trigs ? 5 : 0);
      if (v > bv) { bv = v; best = c.name; }
    }
    return best;
  };
  const cascadeHits = s => {
    const q = s.casc[0], pick = [];
    if (q.gy) { const c = byName.get(q.gy); return c && s.gy.includes(c.name) ? [{c, after: s.mana, op: {free: true, fromGy: true, how: `${q.how} by ${q.from}`, from: q.from}}] : []; }   // the caller drops the empty entry
    const fits = spells.filter(c => !c.cmd && left(s, c, true) && !c.counterOnly && (c.cmc || 0) <= q.mv && (!q.ph || (c.perm && c.power != null && /\bCreature\b/.test(c.type) && fwFits(q.ph, c))) && !c.guide
      && reqOK(s, c, c.reqs || [], true) && (!c.extra || s.used + c.extra <= s.slots) && (!c.discardLand || lands.some(l => left(s, l))));
    const add2 = list => { for (const c of list) if (!pick.includes(c)) pick.push(c); };
    if (pieces) add2(fits.filter(c => pieces.has(c.name) && !s.done.includes(c.name)));
    add2(fits.filter(c => c.cascade || c.discover).sort((a, b) => b.cmc - a.cmc).slice(0, 2));
    add2(fits.filter(c => c.power && !c.noAttack).sort((a, b) => (b.power * (b.haste || s.hasteFx.length ? 2 : 1)) - (a.power * (a.haste || s.hasteFx.length ? 2 : 1))).slice(0, 3));
    add2(fits.filter(c => c.burn).sort((a, b) => b.burn - a.burn).slice(0, 1));
    add2(fits.filter(c => c.rock || c.ramp || c.burst).slice(0, 2));
    add2(fits.filter(c => c.draw || c.giveHaste || c.pump || c.anthem || c.trigs).slice(0, 2));
    if (!pick.length) add2(fits.sort((a, b) => b.cmc - a.cmc).slice(0, 1));
    return pick.slice(0, 6).map(c => ({c, after: s.mana, op: {free: true, put: q.put, how: `${q.how} from ${q.from}`, from: q.from}}));
  };
  const choices = s => {
    if (s.casc.length) return cascadeHits(s);
    const out = [], add = list => { for (const x of list) if (!out.some(y => y.c === x.c && y.op.how === x.op.how && y.ab === x.ab)) out.push(x); };
    const cands = [];
    for (const c0 of spells.concat(cmds)) for (const c of c0.modes || [c0]) {
      if (!left(s, c) || !(c.cmd || s.used + (c.extra || 0) < s.slots)) continue;
      if (c.counterOnly) continue;
      if (c.discardLand && !lands.some(l => left(s, l))) continue;
      const red = reduction(s, c);
      const ops = [{pay: withReduce(c.pay, red), reqs: c.reqs || [], how: "", red: Math.min(red, c.pay.gen)}];
      const rd = p => ({pay: withReduce(p, red), red: Math.min(red, p.gen)});
      if (c.dash) ops.push(Object.assign(rd(c.dash.pay), {reqs: c.reqs || [], how: c.dash.how, haste: true}));
      if (c.alt && condOK(s, c.alt.cond)) ops.push(Object.assign(rd(c.alt.pay), {reqs: (c.reqs || []).concat(c.alt.reqs || []), how: c.alt.txt, evoke: c.alt.evoke}));
      if (c.evoke) ops.push(Object.assign(rd(c.evoke.pay), {reqs: (c.reqs || []).concat(c.evoke.reqs || []), how: c.evoke.txt.replace(/\{([a-z0-9])\}/g, (m, x) => "{" + x.toUpperCase() + "}"), evoke: true}));
      if (!c.cmd && c.perm && !c.land) for (const p of s.perms) if (p.grantEvoke && fwFits(p.grantEvoke.ph, c)) { ops.push(Object.assign(rd(p.grantEvoke.pay), {reqs: c.reqs || [], how: `evoke ${p.grantEvoke.txt} (from ${p.name})`, evoke: true})); break; }
      // convoke: each untapped creature (summoning sick or not) can pay {1} or one mana of its colour; tapped ones can't attack
      const cvk = c.convoke ? s.board.filter(b => !b.tapped && !s.srcs.some(x => x.id === b.id)).map(b => (/^[WUBRG]+$/.test(b.cols || "") ? b.cols : "N") + "^" + b.id) : [];
      for (let op of ops) {
        const tax = Math.max(0, taxOf(s, c) - (op.red ? Math.max(0, op.red - c.pay.gen) : 0));
        let after = fwPay(s.mana, op.pay, tax, c);
        if (after && c.xn && !op.free) {
          const X = Math.floor(after.filter(u => !fwOnly(u) || fwFits(fwOnly(u), c)).length / c.xn);
          const opX = Object.assign({}, op, {pay: {cols: op.pay.cols, gen: op.pay.gen + X * c.xn}, x: X});
          const a2 = fwPay(s.mana, opX.pay, tax, c);
          if (a2 && (X > 0 || !c.xEnters)) { after = a2; op = opX; } else if (c.xEnters) after = null;   // a 0/0 with X = 0 dies at once
        }
        if (after && reqOK(s, c, op.reqs)) cands.push({c, after, op});
        // the same spell with creatures tapped first: saves mana for more spells, but those creatures can't attack this turn
        const a2 = cvk.length && fwPay(s.mana.concat(cvk), op.pay, tax, c, true);
        if (a2 && reqOK(s, c, op.reqs)) {
          const used = cvk.filter(u => !a2.includes(u)).map(u => +u.split("^")[1]);
          if (used.length) cands.push({c, after: a2.filter(u => !u.includes("^")), op: Object.assign({}, op, {convoke: used, how: (op.how ? op.how + ", " : "") + "convoke"})});
        }
      }
    }
    // short of cards: drawing comes first, or the hand runs dry
    const drawVal = c => (c.draw || 0) - (c.discardAfter || 0) - (c.discardFirst || 0) + (c.drawLater || 0) * 0.6 - c.cmc / 2;
    if (s.used >= s.slots - 1) add(cands.filter(x => x.c.draw || x.c.drawLater || x.c.drawEach || x.c.drawMaxPow).sort((a, b) => drawVal(b.c) - drawVal(a.c)).slice(0, 2));
    if (pieces) {
      const permLeft = [...pieces].map(nm => byName.get(nm)).filter(c => c.perm && !s.done.includes(c.name));
      const permCost = permLeft.reduce((t, c) => t + c.pay.gen + c.pay.cols.length + taxOf(s, c), 0);
      add(cands.filter(x => pieces.has(x.c.name) && (x.c.perm ? !s.done.includes(x.c.name) : s.doneT[x.c.name] !== s.t && (!s.done.includes(x.c.name) || !x.c.perm) && x.after.length >= permCost)));
    }
    add(cands.filter(x => x.c.burst && x.c.burst.length > payCost(x.c)).sort((a, b) => (b.c.burst.length - payCost(b.c)) - (a.c.burst.length - payCost(a.c))).slice(0, 2));
    add(cands.filter(x => x.c.summons && s.board.filter(b => fwFits(x.c.summons, b)).length >= 2).slice(0, 1));   // Kindred Summons
    add(cands.filter(x => x.c.grantDork && s.board.filter(b => fwFits(x.c.grantDork.ph, b)).length >= 2).slice(0, 1));   // Cryptolith Rite with creatures out
    add(cands.filter(x => x.c.rock || x.c.ramp || x.c.dork).sort((a, b) => ((b.c.rock || b.c.dork || []).length + (b.c.ramp || 0) - b.c.cmc * 0.4 - (b.c.dork ? 0.2 : 0)) - ((a.c.rock || a.c.dork || []).length + (a.c.ramp || 0) - a.c.cmc * 0.4 - (a.c.dork ? 0.2 : 0))).slice(0, 3));
    if (s.perms.some(p => (p.trigs || []).some(tr => tr.conds.some(k => k.ev === "sac" || k.ev === "dies")))) add(cands.filter(x => x.op.evoke).sort((a, b) => (b.c.power || 0) - (a.c.power || 0)).slice(0, 3));
    add(cands.filter(x => x.op.evoke && (x.c.draw || x.c.trigs)).slice(0, 1));
    // engines: cards whose triggers or abilities do something (draw, mana, tokens, damage), and cost reducers
    add(cands.filter(x => (x.c.trigs || x.c.acts || x.c.reduce || x.c.extraLand || x.c.grantDork) && x.c.perm).sort((a, b) => a.c.cmc - b.c.cmc).slice(0, 3));
    if (!pieces) {
      const fast = x => x.c.haste || x.op.haste || s.hasteFx.length || s.equips.some(e => e.t !== s.t);
      const val = x => x.c.noAttack ? 0 : x.c.power * (x.c.ds ? 2 : 1) * (x.c.infect ? o.life / 10 : 1) * (fast(x) ? 1.6 : 1) / Math.max(1, x.c.cmc + taxOf(s, x.c));
      add(cands.filter(x => x.c.power && !x.c.noAttack).sort((a, b) => val(b) - val(a)).slice(0, 4));
      add(cands.filter(x => x.c.dash && x.op.haste).slice(0, 1));
      add(cands.filter(x => x.c.giveHaste || x.c.equipHaste != null || x.c.teamHaste || x.c.anthem).slice(0, 2));
      if (s.board.length) add(cands.filter(x => x.c.pump || x.c.oneHaste).slice(0, 2));
      add(cands.filter(x => x.c.burn).sort((a, b) => b.c.burn / Math.max(1, b.c.cmc) - a.c.burn / Math.max(1, a.c.cmc)).slice(0, 2));
    }
    // "Search harder": everything else you could cast is an option too, not only what the rules of thumb pick
    if (o.deep) add(cands.slice().sort((a, b) => (b.c.cmc || 0) - (a.c.cmc || 0)));
    // activated abilities of your permanents, and cracking Clues
    const acts = [];
    for (const p of s.perms) for (const ab of p.acts || []) {
      if (!actOK(s, p, ab)) continue;
      const after = fwPay(s.mana, ab.pay, 0); if (!after) continue;
      let good = ab.effs.some(a => ["draw", "opp", "drainSum", "token", "copy", "counter", "pump", "searchAuto", "untap"].includes(a.t));
      const mk2 = ab.effs.filter(a => a.t === "mana").flatMap(a => fwUnits(a.what));
      if (!good && mk2.length > ab.pay.gen + ab.pay.cols.length) {
        if (!ab.sac && !ab.sacSelf) good = true;
        else {
          // how many times it could be used (one creature each) — does that much mana cast something that can't be cast now?
          const uses = ab.sac ? Math.min(4, Math.floor(s.perms.filter(q => q.id !== p.id && fwFits(ab.sac.ph, q)).length / ab.sac.n)) : 1;
          const more = after.concat(Array.from({length: uses}, () => mk2).flat());
          good = spells.concat(cmds).some(c => left(s, c) && !c.counterOnly && (c.cmd || s.used < s.slots) && !fwPay(s.mana, c.pay, taxOf(s, c), c) && fwPay(more, c.pay, taxOf(s, c), c));
        }
      }
      if (o.deep && !good) good = true;   // "Search harder": try it anyway
      if (good) acts.push({c: {name: p.name}, ab, p, after, op: {how: "ability"}});
    }
    add(o.deep ? acts : acts.slice(0, 4));
    if (s.clues) { const after = fwPay(s.mana, {cols: [], gen: 2}, 0); if (after && s.used >= s.slots - 1) add([{c: {name: "Clue"}, clue: true, after, op: {how: "clue"}}]); }
    if (out.length > WIDE) o._wideCut = true;
    return out.slice(0, WIDE);
  };
  const doChoice = (n, x) => x.clue ? (() => { const m = clone(n); m.mana = x.after.slice(); m.clues--; m.budget = 60; m.slots++; m.acq.push({t: m.t, by: "Clue", log: m.log.length}); m.log.push({t: m.t, kind: "ability", name: "Clue", cost: "{2}, sacrifice it", mana: "{2}", costs: ["sacrifice the Clue"], tap: spentOf(n, n.mana, x.after), note: "draw 1"}); fire(m, {ev: "sac", card: {name: "Clue", type: "Token Artifact — Clue", token: true}, id: -2}); return m; })()
    : x.ab ? activate(n, x.p, x.ab, x.after) : play(n, x.c, x.after, x.op);
  const score = s => pieces ? s.done.length * 1000 + potential(s) * 25 + colorsHave(s).size * 12 + (s.slots - s.used) * 6 + s.mana.length
    : (o.life - Math.max(0, s.opp)) * 9 + s.poison * o.life + boardDmg(s, true) * 11 + potential(s) * 14 + colorsHave(s).size * 6 + (s.slots - s.used) * 4 + s.cmdDmg * 2 + s.perms.filter(p => p.trigs || p.acts).length * 5;
  let beam = [mk()], best = null;
  for (let t = 1; t <= MAXT && !best; t++) {
    const next = new Map();
    for (const s0 of beam) {
      const s = clone(s0); s.t = t; s.budget = 60;
      for (const d of s.later) { s.slots++; s.acq.push({t, by: d.by, log: d.log}); }
      s.later = [];
      s.srcs = s.srcs.concat(s.next); s.next = [];
      s.board.forEach(b => { b.sick = false; b.tapped = false; b.tmp = 0; b.atk = false; b.attNow = false; if (!b.dashed) b.haste = b.haste && b.ownHaste; });
      s.perms = s.perms.map(p => p.tapped ? Object.assign({}, p, {tapped: false}) : p);
      s.mana = []; s.idle = []; for (const src of s.srcs) tapSrc(s, src);   // everything untaps; mana doesn't carry over between turns
      for (let i = 0; i < s.treas; i++) s.mana.push("WUBRG~T");          // Treasures stay until you use them
      if (o.bonusMana) s.mana.push("C~=one extra mana");
      if (o.anyColor) s.mana = s.mana.map(u => { const i = u.search(/[!#@~]/); return "WUBRG" + (i < 0 ? "" : u.slice(i)); });
      s.castN = 0;
      fire(s, {ev: "upkeep"});
      for (const p of s.perms.filter(q => q.lore)) loreUp(s, p);   // Sagas: the next chapter, in your first main phase
      for (const p of s.perms) if (p.upkeepCard) { s.slots++; s.acq.push({t, by: p.name, log: s.log.length}); s.log.push({t, kind: "trigger", name: p.name, note: "the top card is the type you chose: it goes to your hand", why: "upkeep"}); }
      const top = s.topCard; s.topSet = false; s.topCard = null;
      if (!(t === 1 && !o.drawFirst)) { if (top) s.back.push(top); else { s.slots++; s.acq.push({t, by: "draw"}); } fire(s, {ev: "draw", nth: 1}); }
      // land drops for the turn (more with Exploration-style cards): ones that make a colour you still need first
      const drops = 1 + s.perms.reduce((x, p) => x + (p.extraLand || 0), 0);
      const starts = [];
      const s0land = o.deep ? {st: clone(s), played: null} : null;   // the turn before any land drop, to try the others from
      for (let d = 0; d < drops; d++) {
        const have = colorsHave(s);
        const landsLeft = lands.filter(l => left(s, l));
        const gain = l => [...new Set(l.units.join("").replace(/C/g, ""))].reduce((tt, k) => tt + (have.has(k) ? 0 : (demand[k] || 0)), 0);
        const land = landsLeft.slice().sort((a, b) => (gain(b) - gain(a)) || (b.yield - a.yield) || (a.tapped - b.tapped))[0];
        if (!land || s.used >= s.slots) break;
        if (s0land && d === 0) s0land.played = land.name;
        // when cards are tight, also try keeping that card for something else instead of the land drop
        if (d === 0 && s.slots - s.used <= 2) starts.push(clone(s));
        s.used++; s.cnt[land.name] = (s.cnt[land.name] || 0) + 1; s.order.push({name: land.name, t});
        const lid = arrive(s, land, {src: land.yield}), lsrc = srcOf(land.units, lid), lTap = landTapped(s, land);
        if (land.manaIf) lsrc.cond = land.manaIf;
        if (lTap) s.next.push(lsrc); else { s.srcs.push(lsrc); tapSrc(s, lsrc); }
        s.log.push({t, kind: "land", name: land.name, img: land.img, note: (lTap ? "enters tapped, " : "") + (land.manaIf ? `taps for ${fmt(land.units)} once you control ${land.manaIf.n} ${land.manaIf.ph}s` : land.yield > 1 && land.units.every(u => u === "C") ? `taps for {C}{C}` : `taps for ${fmt(land.units.slice(0, 1))}`) + (lTap ? " from next turn" : "")});
        fire(s, {ev: "landplay", card: land, id: lid}); fire(s, {ev: "etb", card: land, id: lid});
      }
      grantSrcs(s);
      starts.unshift(s);
      // "Search harder": each other land you could play instead (once per kind of land)
      if (o.deep && s0land) {
        const tried = new Set([s0land.played]);
        for (const l of lands.filter(x => left(s0land.st, x)).sort((a, b) => b.yield - a.yield)) {
          if (tried.has(l.name) || tried.size >= 5 || s0land.st.used >= s0land.st.slots) continue; tried.add(l.name);
          const alt = clone(s0land.st);
          alt.used++; alt.cnt[l.name] = (alt.cnt[l.name] || 0) + 1; alt.order.push({name: l.name, t});
          const lid = arrive(alt, l, {src: l.yield}), lsrc = srcOf(l.units, lid), lTap = landTapped(alt, l);
          if (l.manaIf) lsrc.cond = l.manaIf;
          if (lTap) alt.next.push(lsrc); else { alt.srcs.push(lsrc); tapSrc(alt, lsrc); }
          alt.log.push({t, kind: "land", name: l.name, img: l.img, note: (lTap ? "enters tapped, " : "") + `taps for ${fmt(l.units.slice(0, 1))}` + (lTap ? " from next turn" : "")});
          fire(alt, {ev: "landplay", card: l, id: lid}); fire(alt, {ev: "etb", card: l, id: lid}); grantSrcs(alt);
          starts.push(alt);
        }
      }
      // plays this turn (depth-first, a few deep)
      const seen = new Set();
      const dfs = function* (n, depth) {
        if (o._yieldAt && Date.now() > o._yieldAt) yield;   // a break for the page
        if (o.stopped && o.stopped()) { o._cut = true; return; }
        if (best && best.won.t <= t) return;
        if (n.won) { if (!best || n.won.t < best.won.t || n.order.length < best.order.length) best = n; return; }
        if (n.casc.length) {
          const hits = cascadeHits(n);
          if (!hits.length) { const m2 = clone(n); const q = m2.casc.shift(); m2.log.push({t, kind: "note", name: q.gy ? `${q.from}: nothing left to cast from the graveyard` : `${q.how} from ${q.from}: nothing cheap enough left`}); return yield* dfs(m2, depth); }
          for (const x of hits) yield* dfs(play(n, x.c, x.after, x.op), depth);
          return;
        }
        const key = [n.perms.length, n.grave, n.life, n.treas, n.clues, n.mana.slice().sort().join(""), n.srcs.length, potential(n), n.slots - n.used, n.board.length, boardDmg(n, true), n.opp, n.done.length, n.cmdOut.length, Object.keys(n.cnt).length, n.perms.filter(p => p.tapped).length].join(",");
        if (seen.has(key)) return; seen.add(key);
        // end the turn here: attack (attack triggers first, then damage, then combat-damage triggers)
        const e = clone(n); e.budget = 60;
        if (o.oppRemoval && !e.removed && t >= 3) {
          const big = e.board.filter(b => canAtk(e, b)).sort((a, b) => powerOf(e, b) - powerOf(e, a))[0];
          if (big && powerOf(e, big) >= 3) { e.removed = true; const p = e.perms.find(q => q.id === big.id); if (p) { e.log.push({t, kind: "note", name: `The opponent removes ${big.name} before it can attack`}); leave(e, big.id); if (!p.token) e.grave++; fire(e, {ev: "dies", card: p, id: p.id, selfTrigs: p.trigs, reason: `${big.name} was destroyed by the opponent`}); } }
        }
        if (e.board.some(b => canAtk(e, b))) fire(e, {ev: "combat"});   // "at the beginning of combat on your turn"
        const attackers = e.board.filter(b => canAtk(e, b));
        attackers.forEach((b, i) => { b.atk = true; fire(e, {ev: "attack", card: b, id: b.id, first: i === 0}); });
        if (attackers.length === 1) fire(e, {ev: "attackalone", card: attackers[0], id: attackers[0].id});
        let atk = 0;
        for (const b of e.board) if (b.atk || b.attNow) { const d = powerOf(e, b) * (b.ds ? 2 : 1); atk += d; if (b.inf) e.poison += d; else e.opp -= d; if (b.cmd) e.cmdDmg += d; }
        const held = e.board.filter(b => !b.noAttack && !b.tapped && (!b.sick || b.haste || granted(e, b)) && tappedForMana(e, b)).map(b => b.name);
        if (atk) e.log.push({t, kind: "attack", dmg: atk, held, who: e.board.filter(b => b.atk || b.attNow).map(b => ({name: b.name, p: powerOf(e, b) * (b.ds ? 2 : 1)})), note: e.poison >= 10 ? `${e.poison} poison` : `opponent at ${Math.max(0, e.opp)}`});
        for (const b of e.board) if ((b.atk || b.attNow) && powerOf(e, b) > 0) fire(e, {ev: "combatdmg", card: b, id: b.id});
        if (e.opp > 0 && e.poison < 10 && !(o.isCmd && e.cmdDmg >= 21)) for (const p of e.perms.filter(q => q.temp)) {
          // Ashling's copies: kept if the mana left over can pay for it ({W}{U}{B}{R}{G}), else sacrificed
          const after = p.keepCost ? fwPay(e.mana, fwCost({cost: p.keepCost, cmc: 0}), 0) : null;
          if (after) { const tap = spentOf(e, e.mana, after); e.mana = after; setPerm(e, p.id, {temp: false}); e.log.push({t, kind: "trigger", name: p.name, note: `kept: paid ${p.keepCost}`, tap, why: "end"}); continue; }
          e.log.push({t, kind: "trigger", name: p.name, note: "sacrificed at end of turn", why: "end"}); sacrifice(e, p, "its delayed end-of-turn sacrifice");
        }
        if (e.opp > 0 && e.poison < 10) fire(e, {ev: "endstep"});
        e.log.push({t, kind: "end", opp: Math.max(0, e.opp), poison: e.poison, life: e.life});
        if (e.opp <= 0 || e.poison >= 10 || (o.isCmd && e.cmdDmg >= 21)) { e.won = {t, how: e.poison >= 10 ? "poison" : e.cmdDmg >= 21 && e.opp > 0 ? "commander damage" : "damage"}; if (!best || t < best.won.t) best = e; return; }
        // what carries over: unused Treasures, and the monarch's end-step card
        e.treas = e.mana.filter(u => u.includes("~T")).length;
        if (e.monarch) e.later.push({by: "the monarch", log: null});
        const k2 = key + "|" + Math.max(0, e.opp);
        if (!next.has(k2) || score(next.get(k2)) < score(e)) next.set(k2, e);
        if (depth >= (o.deep ? 40 : 12)) { o._depthCut = true; return; }
        if (depth > 3 && Date.now() > deadline) { o._cut = true; return; }
        for (const x of choices(n)) yield* dfs(doChoice(n, x), depth + 1);
      };
      for (const st of starts) yield* dfs(st, 0);
      if (o.stopped && o.stopped()) break;
    }
    if (next.size > BEAM) o._beamCut = true;
    beam = [...next.values()].sort((a, b) => score(b) - score(a)).slice(0, BEAM);
  }
  return best;
}
// Turn the winning line into what you'd see: the opening hand, each draw, and what each draw spell drew.
// The cards you play are matched, in order, to the cards you get, in order (you can't play a card before you have it).
function fwExplain(best, o){
  const order = best.order, acq = best.acq || [];
  const at = i => i < order.length ? (order[i].name || null) : null;
  const hand = [], draws = [], spellDraws = {};
  acq.forEach((a, i) => {
    const nm = at(i);
    if (a.by === "open") hand.push(nm);
    else if (a.by === "draw") draws.push({t: a.t, name: nm});
    else if (a.log != null) (spellDraws[a.log] = spellDraws[a.log] || []).push(nm);
  });
  while (hand.length < 7) hand.push(null);
  for (let t = 1; t <= best.won.t; t++) if (!draws.some(d => d.t === t)) draws.push({t, name: undefined});
  return {hand, draws, spellDraws, extra: []};
}
// The deck read for the finder, and the ways it can win (damage, plus each winning combo it contains)
async function fwPlans(d, opts = {}){
  const isCmd = d.format === "commander";
  FW_TYPE = d.fwType || fwDeckType(d.cards.filter(c => c.board === "main").concat(d.commanders)); FW_CI = fwIdentity(d);
  const pool = d.cards.filter(c => c.board === "main").map(c => fwCard(c));
  const cmds = d.commanders.map(c => fwCard(c, true));
  const byName = new Map(pool.concat(cmds).map(c => [nameKey(c.name), c]));
  const plans = [{kind: "damage", label: "Damage"}];
  let comboNote = "";
  if (await loadComboDb()) {
    const src = comboSource("deck"), found = src ? matchLocal(src).included : [];
    for (const v of found) {
      if (!FW_WIN.test(v.produces.join(" | ")) || v.templates.length) continue;
      const cards = v.cards.map(n => byName.get(nameKey(n))); if (cards.some(x => !x)) continue;
      const need = (String(v.mana || "").match(/\{[^}X]+\}/g) || []).reduce((t, s0) => t + (/^\{\d+\}$/.test(s0) ? parseInt(s0.slice(1)) : 1), 0);
      plans.push({kind: "combo", label: v.cards.join(" + "), pieces: cards.map(c => c.name), need, produces: v.produces, cost: cards.reduce((t, c) => t + c.cmc, 0) + need, combo: v});
    }
    plans.sort((a, b) => (a.kind === "damage" ? -1 : b.kind === "damage" ? 1 : a.cost - b.cost));
    if (plans.length > (opts.maxPlans || 16)) plans.length = opts.maxPlans || 16;
  } else comboNote = "Combo database not downloaded yet (see Combos below), so only damage wins were checked.";
  const fo = prefs.fwOpts || {};
  const o = {life: isCmd ? 40 : 20, isCmd, drawFirst: isCmd, maxT: 10, beam: 120, wide: 11, ms: isPhone() ? 2500 : 6000, oppRemoval: fo.opp === "removal", oppCounter: fo.opp === "counter"};
  return {isCmd, pool, cmds, plans, comboNote, o};
}
async function fastestWin(d, onProgress, opts = {}){
  const {pool, cmds, plans, comboNote, o} = await fwPlans(d, opts.deep ? {maxPlans: 40} : {});
  const results = [];
  for (let i = 0; i < plans.length; i++) {
    const pl = plans[i];
    if (opts.stopped && opts.stopped()) break;
    const best = await fwSearchAsync(pl, pool, cmds, Object.assign({}, o, {stopped: opts.stopped}));
    if (best) results.push({plan: pl, best, turn: best.won.t, how: best.won.how});
    if (onProgress) onProgress(i + 1, plans.length + 4);
    await sleep(0);
  }
  results.sort((a, b) => a.turn - b.turn || a.best.order.length - b.best.order.length);
  // Search harder: is there a faster win? Each plan again, one turn sooner, trying every card, ability and land drop,
  // keeping many more positions. Stops at the time limit, and says whether it finished.
  let deep = null;
  if (opts.deep) {
    const budget = opts.budget || 30000, until = Date.now() + budget;
    deep = {checked: [], found: [], cut: false, budget, beam: opts.beam || 500};
    let target = (results[0] ? results[0].turn : (o.maxT || 10) + 1) - 1;
    while (target >= 1 && Date.now() < until) {
      let hit = null, cutThisTurn = false;
      for (let i = 0; i < plans.length; i++) {
        const left2 = until - Date.now(); if (left2 <= 0) { cutThisTurn = true; break; }
        const oo = Object.assign({}, o, {deep: true, beam: opts.beam || 500, wide: opts.wide || 26, maxT: target, ms: Math.max(700, Math.min(opts.planMs || 8000, left2 / (plans.length - i)))});
        if (opts.stopped && opts.stopped()) { cutThisTurn = true; break; }
        oo.stopped = opts.stopped;
        const b = await fwSearchAsync(plans[i], pool, cmds, oo);
        if (oo._cut) cutThisTurn = true;
        for (const k of ["_depthCut", "_wideCut", "_beamCut"]) if (oo[k]) deep[k] = true;
        if (onProgress) onProgress(i + 1, plans.length, `Looking for a turn-${target} win… ${i + 1}/${plans.length}`);
        await sleep(0);
        if (b) { hit = {plan: plans[i], best: b, turn: b.won.t, how: b.won.how, deep: true}; break; }
      }
      if (hit) { results.unshift(hit); deep.found.push(hit.turn); target = hit.turn - 1; continue; }
      deep.checked.push({turn: target, complete: !cutThisTurn, exhaustive: !cutThisTurn && !deep._depthCut && !deep._wideCut && !deep._beamCut});
      deep.cut = cutThisTurn;
      break;
    }
    if (target >= 1 && Date.now() >= until) deep.cut = true;
    results.sort((a, b) => a.turn - b.turn || a.best.order.length - b.best.order.length);
  }
  // play the best lines out in the Playtest's rules engine; a line that doesn't hold up goes behind ones that do
  const rejected = [];
  if (opts.check !== false) {
    if (onProgress) onProgress(plans.length, plans.length + 4, "Checking the win by playing it out…");
    for (const r of results.slice(0, 8)) {
      if (opts.stopped && opts.stopped()) break;
      r.check = fwReplay(d, r, o);
      await sleep(0);
      if (r.check.ok !== false) break;
      rejected.push({turn: r.turn, how: r.how, why: r.check.why});
    }
    results.sort((a, b) => ((a.check && a.check.ok === false) - (b.check && b.check.ok === false)) || a.turn - b.turn || a.best.order.length - b.best.order.length);
  }
  const win = results[0];
  if (win && win.plan.combo && win.plan.combo._src) { try { await stepsFor([win.plan.combo._src]); win.plan.steps = win.plan.combo._src.steps || ""; } catch (e) {} }
  // Why not faster: would one turn sooner work with a little more of something?
  const why = [];
  if (win && win.turn > 1) {
    const tries = [["bonusMana", "one more mana each turn"], ["anyColor", "mana of every colour (your colours didn't line up)"], ["allHaste", "haste for every creature (summoning sickness held it back)"], ["bonusCard", "one more card in your opening hand"]];
    let i = 0;
    for (const [k, txt] of tries) {
      if (opts.stopped && opts.stopped()) break;
      const b = await fwSearchAsync(win.plan, pool, cmds, Object.assign({}, o, {[k]: true, maxT: win.turn - 1, ms: isPhone() ? 600 : 1500, beam: 60, stopped: opts.stopped}));
      why.push({k, txt, turn: b ? b.won.t : null});
      if (onProgress) onProgress(plans.length + (++i), plans.length + 4);
      await sleep(0);
    }
  }
  return {results, o, comboNote, combosTried: plans.length - 1, why, deep, rejected};
}
