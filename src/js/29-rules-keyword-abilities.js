/* ----- keyword abilities as triggers, written out the way rule 702 defines them ----- */
// Each returns the trigger in plain words (it then goes through the same reader as printed triggers),
// or {cond, actions} for the few that need the table's own help.
const PT_KW_TRIG = {
  "prowess": () => "whenever you cast a noncreature spell, cardname gets +1/+1 until end of turn.",
  "exalted": () => "whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.",
  "battle cry": () => "whenever cardname attacks, each other attacking creature gets +1/+0 until end of turn.",
  "melee": () => "whenever cardname attacks, cardname gets +1/+1 until end of turn.",
  "dethrone": () => "whenever cardname attacks, if defending player has the most life or is tied for most life, put a +1/+1 counter on cardname.",
  "mentor": () => ({cond: "whenever cardname attacks", actions: [{t: "mentor", label: "+1/+1 counter on an attacker with less power"}]}),
  "training": () => ({cond: "whenever cardname attacks", check: "training", actions: [{t: "counter", n: 1, kind: "p1p1", on: "self", label: "+1/+1 counter on it (training)"}]}),
  "evolve": () => "whenever another creature you control enters, if that creature has greater power or toughness than cardname, put a +1/+1 counter on cardname.",
  "extort": () => "whenever you cast a spell, each opponent loses 1 life and you gain 1 life.",
  "afterlife": v => `when cardname dies, create ${trWord(v)} 1/1 white and black spirit creature token${+v > 1 ? "s" : ""} with flying.`,
  "fabricate": v => `when cardname enters, create ${trWord(v)} 1/1 colorless servo artifact creature token${+v > 1 ? "s" : ""}.`,   // the choice is yours; it makes the tokens (counters: right-click → counters)
  "modular": () => ({cond: "when cardname dies", actions: [{t: "modular", label: "Move its +1/+1 counters to an artifact creature"}]}),
  "renown": v => ({cond: "whenever cardname deals combat damage to a player", check: "renown", actions: [{t: "counter", n: +v || 1, kind: "p1p1", on: "self", label: `${v} +1/+1 counter${+v > 1 ? "s" : ""} (renowned)`}, {t: "flag", k: "renowned", on: "cardname", label: "It becomes renowned"}]}),
  "annihilator": v => ({cond: "whenever cardname attacks", actions: [{t: "oppNone", label: `Defending player sacrifices ${v} permanent${+v > 1 ? "s" : ""} (not tracked here)`}]}),
  "myriad": () => ({cond: "whenever cardname attacks", actions: [{t: "oppNone", label: "Myriad: copies attack your other opponents (there's only one here)"}]}),
  "mobilize": v => `whenever cardname attacks, create ${trWord(v)} 1/1 red warrior creature token${+v > 1 ? "s" : ""} that ${+v > 1 ? "are" : "is"} tapped and attacking. sacrifice ${+v > 1 ? "those tokens" : "that token"} at the beginning of the next end step.`,
  "firebending": v => ({cond: "whenever cardname attacks", actions: [{t: "mana", what: "{R}".repeat(Math.max(1, +v || 1)), label: `Add ${"{R}".repeat(Math.max(1, +v || 1))} (until end of combat)`}]}),
  "increment": () => "whenever you cast a spell, if the amount of mana spent to cast that spell is greater than cardname's power or cardname's toughness, put a +1/+1 counter on cardname.",
  "backup": v => `when cardname enters, put ${trWord(v)} +1/+1 counter${+v > 1 ? "s" : ""} on target creature.`,
  "riot": () => ({cond: "when cardname enters", actions: [{t: "riot", label: "Riot: haste now, or a +1/+1 counter"}]}),
  "living weapon": () => "when cardname enters, create a 0/0 black phyrexian germ creature token, then attach cardname to it.",
  "for mirrodin!": () => "when cardname enters, create a 2/2 red rebel creature token, then attach cardname to it.",
  "job select": () => "when cardname enters, create a 1/1 colorless hero creature token, then attach cardname to it.",
  "exploit": () => ({cond: "when cardname enters", may: true, choice: true, actions: [{t: "sacYou", n: 1, phrase: "creature", may: true, label: "You may sacrifice a creature (exploit)"}]}),
  "decayed": () => ({cond: "whenever cardname attacks", actions: [{t: "endCombatSac", label: "Sacrifice it at end of combat (decayed)"}]}),
  "vanishing": () => ({cond: "at the beginning of your upkeep", actions: [{t: "tick", kind: "time", sacAtZero: true, label: "Remove a time counter (sacrifice it when the last goes)"}]}),
  "fading": () => ({cond: "at the beginning of your upkeep", actions: [{t: "tick", kind: "fade", sacIfNone: true, label: "Remove a fade counter (sacrifice it if you can't)"}]}),
  "echo": () => ({cond: "at the beginning of your upkeep", check: "echo", actions: [{t: "note", label: "Pay its echo cost (assumed paid) or sacrifice it"}]}),
  "cumulative upkeep": () => ({cond: "at the beginning of your upkeep", actions: [{t: "counter", n: 1, kind: "age", on: "self", noMods: true, label: "Add an age counter, then pay the upkeep for each (assumed paid)"}]}),
  "soulshift": v => `when cardname dies, you may return target spirit card with mana value ${v} or less from your graveyard to your hand.`,
  "poisonous": v => ({cond: "whenever cardname deals combat damage to a player", actions: [{t: "poison", n: +v || 1, label: `Opponent gets ${v} poison counter${+v > 1 ? "s" : ""}`}]}),
  "ingest": () => ({cond: "whenever cardname deals combat damage to a player", actions: [{t: "oppNone", label: "That player exiles the top card of their library (not tracked)"}]}),
  "ravenous": () => "when cardname enters, if x is 5 or more, draw a card.",
  "offspring": () => ({cond: "when cardname enters", check: "offspring", actions: [{t: "copy", n: 1, of: "self", set: [1, 1], label: "Create a 1/1 token copy (offspring)"}]}),
  "squad": () => ({cond: "when cardname enters", check: "squad", actions: [{t: "copy", n: 1, of: "self", squad: true, label: "Create token copies for each time squad was paid"}]}),
  "hideaway": v => `when cardname enters, look at the top ${trWord(v || 4)} cards of your library, exile one of them face down, then put the rest on the bottom of your library in a random order.`,
  "champion": () => ({cond: "when cardname enters", choice: true, actions: [{t: "note", label: "Exile another creature you control until it leaves (do by hand), or sacrifice it"}]}),
  "unleash": () => ({cond: "when cardname enters", actions: [{t: "counter", n: 1, kind: "p1p1", on: "self", label: "Unleash: +1/+1 counter (it can't block)"}]}),
  "tribute": () => ({cond: "when cardname enters", actions: [{t: "note", label: "Tribute: the opponent chooses (handle by hand)"}]}),
  "enlist": () => ({cond: "whenever cardname attacks", choice: true, actions: [{t: "note", label: "Enlist: you may tap a creature to add its power (do by hand)"}]}),
  "haunt": () => ({cond: "when cardname dies", choice: true, actions: [{t: "note", label: "Haunt: exile it haunting a creature (do by hand)"}]}),
  "gravestorm": () => ({cond: "when you cast cardname", actions: [{t: "note", label: "Gravestorm: copy it for each permanent put into a graveyard this turn"}]}),
};
const trWord = v => ({1: "a", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"})[+v] || String(v || "a").toLowerCase();
// Keyword triggers for a card: one ability per instance printed or given ("Afterlife 2", "Prowess", "Mobilize 2"…)
function trKwAbilities(card, parse){
  const out = [];
  for (const k of ptKws(card).values()) {
    const fn = PT_KW_TRIG[k.key]; if (!fn) continue;
    const val = (String(k.val || "").match(/^(\d+|x)/i) || [])[1] || "1";
    const r = fn(val), name = (PT_KW_BY.get(k.key) || {}).name || k.key, shown = `${name}${/^\d/.test(k.val) ? " " + val : ""}${k.from !== "own" ? ` (from ${k.from})` : ""}: ${(PT_KW_BY.get(k.key) || {}).rule || ""}`.slice(0, 400);
    if (typeof r === "string") { const ab = parse(r, shown); if (ab) { ab.kw = k.key; out.push(ab); } }
    else {
      const conds = trConditions(r.cond.toLowerCase()); if (!conds.length) continue;
      out.push({text: shown, eff: null, conds, actions: r.actions, may: !!r.may, choice: !!r.choice, check: r.check, kw: k.key, intervening: false});
    }
  }
  return out;
}
// Saga chapters: "I — …", "II, III — …"
const PT_ROMAN = {I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7};
function trChapters(card){
  const out = [];
  for (const line of ptFaceText(card).split("\n")) {
    const m = line.match(/^((?:I|II|III|IV|V|VI|VII)(?:, (?:I|II|III|IV|V|VI|VII))*) — (.+)$/);
    if (m) for (const r of m[1].split(", ")) out.push({n: PT_ROMAN[r], text: m[2]});
  }
  return out;
}
const ptIsSaga = c => /\bSaga\b/.test(ptFaceType(c));

/* ----- activated abilities: "{2}, {T}, Sacrifice this: Draw a card.", loyalty "+1: …", Equip, Crew, Cycling… ----- */
const trActCache = new Map();
function trActivated(card){
  const speed = PT && (PT.speed || 0) >= 4 ? 1 : 0;
  const key = card.name + "|" + (card.back ? 1 : 0) + "|" + speed + "|" + ptFaceText(card);
  if (trActCache.has(key)) return trActCache.get(key);
  const out = [], nm = ptFaceName(card), pw = /\bPlaneswalker\b/.test(ptFaceType(card));
  for (const line0 of ptFaceText(card).split("\n")) {
    let line = line0.replace(/\([^)]*\)/g, "").trim(); if (!line) continue;
    let tag = "", m;
    if ((m = line.match(/^(Exhaust|Power-up|Boast|Channel|Forecast|Max speed|∞|Renew|Endure)\s*—\s*(.+)$/i))) { tag = m[1].toLowerCase(); line = m[2]; if (tag === "max speed" && !speed) continue; }
    const kwLine = line.match(/^(Equip|Reconfigure|Fortify|Level up|Outlast|Scavenge|Embalm|Eternalize|Encore|Unearth|Cycling|[A-Za-z]+cycling|Basic landcycling|Ninjutsu|Commander ninjutsu|Transmute|Crew|Saddle|Station|Craft with [^{]+?|Bloodrush|Transfigure|Auto|Plot|Foretell|Suspend \d+)\s*(?:—\s*)?(.*)$/i);
    if (kwLine && !/:/.test(kwLine[2].replace(/^\{[^}]*\}/, "")) ) {
      const k = kwLine[1].toLowerCase(), cost = kwLine[2].trim();
      const zone = /cycling|ninjutsu|transmute|bloodrush|plot|foretell|suspend/.test(k) ? "hand" : /scavenge|embalm|eternalize|encore|unearth/.test(k) ? "grave" : "bf";
      if (["plot", "foretell", "unearth"].includes(k) || /^suspend/.test(k)) continue;   // these are "cast another way"
      out.push({kind: k.replace(/^[a-z]+cycling$/, m0 => m0 === "cycling" ? "cycling" : "typecycling").replace(/^basic landcycling$/, "typecycling").replace(/^commander ninjutsu$/, "ninjutsu").replace(/^craft with .+/, "craft"),
        cyc: /cycling/.test(k) && k !== "cycling" ? k.replace(/cycling$/, "").trim() : "", n: parseInt(cost) || (k.match(/\d+/) || [])[0] | 0, cost, zone, text: line, label: `${kwLine[1]} ${cost}`.trim(), craft: (k.match(/^craft with (.+)/) || [])[1] || ""});
      continue;
    }
    // loyalty abilities: "+1: …", "−2: …", "0: …", "[+1]: …"
    if (pw && (m = line.match(/^\[?([+−-]?(?:\d+|X))\]?:\s*(.+)$/))) {
      const d = m[1].replace("−", "-"), eff = trLower(card, m[2]);
      out.push({kind: "loyalty", loy: /X/.test(d) ? (d.startsWith("-") ? "-X" : "+X") : parseInt(d), cost: m[1], eff, text: line, zone: "bf", actions: trActions(eff, nm), label: `${m[1]}: ${m[2]}`, xExpr: (eff.match(/where x is ([^.]+)/) || [])[1] || null});
      continue;
    }
    m = line.match(/^([^:"“]+?):\s*(.+)$/);
    if (!m) continue;
    const costT = m[1], costL = trLower(card, costT), effRaw = m[2];
    if (!/\{|sacrifice|discard|pay |remove|exile|tap |untap |return|collect evidence|blight|forage|exert/i.test(costT)) continue;
    if (/^(?:when|whenever|at|if|as long as)\b/i.test(costT)) continue;
    const eff = trLower(card, effRaw);
    const cost = {
      tap: /\{T\}/.test(costT), untap: /\{Q\}/.test(costT), mana: (costT.match(/\{[^}TQ]*\}/g) || []).join(""),
      sacSelf: /\bsacrifice cardname\b/.test(costL),
      sac: (costL.match(/\bsacrifice (a|an|another|two|three|\w+) ((?:other |nontoken |untapped )?[a-z -]+?)(?=,|$| and)/) || []).slice(1),
      life: +((costL.match(/\bpay (\d+) life/) || [])[1] || 0),
      discard: (costL.match(/\bdiscard (a|an|two|three|x|\d+|your hand) ?([a-z ]*?)cards?/) || []).slice(1), discardSelf: /\bdiscard cardname\b/.test(costL),
      remove: (costL.match(/\bremove (a|an|one|two|three|four|five|x|\d+|all) ([+\-0-9/a-z ]+?) counters? from (cardname|[a-z ]+? you control)/) || []).slice(1),
      exileSelf: /\bexile cardname\b/.test(costL) || /exile this card from your graveyard/.test(costL),
      exileGrave: (costL.match(/\bexile (a|an|one|two|three|four|five|six|seven|x|\d+) (?:other )?([a-z ]*?)cards? from your graveyard/) || []).slice(1),
      tapCre: (costL.match(/\btap (a|an|one|two|three|four|five|x|\d+) untapped ([a-z ]+?) you control/) || []).slice(1),
      returnLand: (costL.match(/\breturn (a|an) ([a-z ]+?) you control to its owner's hand/) || []).slice(1),
      evidence: +((costL.match(/collect evidence (\d+)/) || [])[1] || 0), blight: +((costL.match(/\bblight (\d+)/) || [])[1] || 0), forage: /\bforage\b/.test(costL), exert: /\bexert cardname\b/.test(costL),
    };
    const zone = cost.discardSelf || tag === "channel" || tag === "forecast" ? "hand" : cost.exileSelf && /graveyard/.test(costL + eff) || /activate only if cardname is in your graveyard|from your graveyard/.test(effRaw.toLowerCase()) && cost.exileSelf ? "grave" : "bf";
    const isMana = /^add\b/.test(eff) && !/\btarget\b/.test(eff);
    const once = tag === "exhaust" || tag === "power-up" || /activate (?:this ability )?only once\b(?! each)/.test(eff);
    const oncePerTurn = /activate (?:this ability )?only once each turn/.test(eff) || tag === "boast";
    const sorcery = /activate only as a sorcery/.test(eff);
    const clean = eff.replace(/\.?\s*activate (?:this ability )?only[^.]*\.?/g, ".").replace(/\s*\.\s*$/, ".");
    out.push({kind: isMana ? "mana" : "ability", tag, cost, costText: costT, eff: clean, actions: isMana ? [{t: "mana", what: (clean.match(/^add ([^.]+)/) || [])[1] || "", label: "Add mana"}] : trActions(clean, nm), zone, once, oncePerTurn, sorcery,
      boast: tag === "boast", text: line, label: `${costT}: ${effRaw.replace(/\s*Activate (?:this ability )?only[^.]*\./g, "").trim()}`, xExpr: (clean.match(/where x is ([^.]+)/) || [])[1] || null});
  }
  trActCache.set(key, out);
  return out;
}
// Card text in the reader's form: names → "cardname", "this creature" → "cardname", lower case
const trNameRe = new Map();
function trLower(card, s){
  const key = card.name;
  if (!trNameRe.has(key)) { const names = new Set([card.name]); for (const p0 of card.name.split(" // ")) for (const part of [p0, p0.replace(/^A-/, "")]) { names.add(part); if (part.includes(",")) names.add(part.split(",")[0]); } trNameRe.set(key, new RegExp("\\b(" + [...names].sort((a, b) => b.length - a.length).map(trEsc).join("|") + ")\\b", "gi")); }
  return String(s || "").replace(/\([^)]*\)/g, "").replace(trNameRe.get(key), "CARDNAME").replace(/\bthis (creature|permanent|artifact|enchantment|land|planeswalker|vehicle|card|spell|equipment|aura|saga|token|battle|class|case|room|spacecraft|planet|siege|kindred)\b/gi, "CARDNAME").toLowerCase()
    .replace(/enters the battlefield under your control/g, "enters").replace(/enters the battlefield/g, "enters").replace(/\s+/g, " ").trim();
}
