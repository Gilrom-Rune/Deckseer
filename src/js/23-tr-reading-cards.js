/* ---------------- trigger helper: reading cards ----------------
   Finds triggered abilities in a card's rules text ("When…", "Whenever…", "At the beginning of…"), works out which
   table events set them off, and pulls out the simple effects it can do with one click. Anything it can't do is
   still shown as a reminder. This is pattern matching on card wording, not a rules engine. */
const TR_NUM = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: 1, "that many": 1};
const trNum = w => { w = String(w || "").toLowerCase().trim(); return TR_NUM[w] ?? (parseInt(w) || 1); };
const trEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TR_SING = {elves: "elf", dwarves: "dwarf", wolves: "wolf", faeries: "faerie", zombies: "zombie", allies: "ally", mercenaries: "mercenary", fungi: "fungus", sorceries: "sorcery", humans: "human"};
const trSingular = w => TR_SING[w] || (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const TR_COLOR_WORD = {white: "W", blue: "U", black: "B", red: "R", green: "G"};
const TR_NOT_SUBTYPE = new Set(["creature", "artifact", "enchantment", "land", "planeswalker", "instant", "sorcery", "battle", "legendary", "basic", "snow", "token", "permanent", "spell", "card", "nonland", "attacking", "tapped", "untapped", "plains", "island", "swamp", "mountain", "forest", "equipment", "aura", "vehicle", "saga"]);
// Does a card fit a phrase like "nontoken creature", "artifact or enchantment", "Elf", "instant or sorcery", "commander"?
function trFits(phrase, c){
  // "with power 2 or less" / "with power 4 or greater"
  const pw = (phrase || "").match(/with power (\d+) or (less|greater|more)/);
  if (pw) { const p = ptStats(c) ? ptPow(c) : parseInt(c.power); if (isNaN(p) || (pw[2] === "less" ? p > +pw[1] : p < +pw[1])) return false; }
  const mv = (phrase || "").match(/with (?:a )?mana value (\d+) or (less|greater|more)/);
  if (mv && (mv[2] === "less" ? (c.cmc || 0) > +mv[1] : (c.cmc || 0) < +mv[1])) return false;
  const mvx = (phrase || "").match(/with (?:a )?mana value (?:equal to )?(\d+)\b(?! or)/);
  if (mvx && (c.cmc || 0) !== +mvx[1]) return false;
  // "with flying", "without defender", "with a +1/+1 counter on it", "with toughness 2 or less"
  const kwq = (phrase || "").match(/\b(with|without) (flying|defender|haste|trample|vigilance|deathtouch|lifelink|reach|first strike|double strike|menace|hexproof|indestructible|flash|ward|prowess|infect|toxic)\b/);
  if (kwq) { let has = false; try { has = PT && PT.bf && PT.bf.includes(c) ? !!ptHasKw(c, kwq[2]) : new RegExp(`(?:^|\\n|,\\s*)${kwq[2]}\\b`, "i").test(ptFaceText(c)); } catch (e) { has = new RegExp(kwq[2], "i").test(c.text || ""); } if (has !== (kwq[1] === "with")) return false; }
  if (/\bwith (?:a|one or more) \+1\/\+1 counters? on (?:it|them)/.test(phrase || "") && !((c.counters || {}).p1p1 > 0)) return false;
  const tq = (phrase || "").match(/with toughness (\d+) or (less|greater|more)/);
  if (tq) { const t = ptStats(c) ? ptStats(c)[1] : parseInt(c.toughness); if (isNaN(t) || (tq[2] === "less" ? t > +tq[1] : t < +tq[1])) return false; }
  phrase = (phrase || "").replace(/\s+with\b.*$/, "").replace(/\b(you control|under your control|you own|one or more|another|other|an?|the|your|of|card|cards)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!phrase || /^(spell|permanent)s?$/.test(phrase)) return phrase !== "permanent" || !/\b(Instant|Sorcery)\b/.test(c.type || "");
  const type = (c.type || "").split(" // ")[0].toLowerCase(), words = type.replace(/[—-]/g, " ").split(/\s+/);
  return phrase.split(/\s*(?:,|\bor\b|\band\/or\b)\s*/).filter(Boolean).some(alt => alt.split(" ").every(w0 => {
    const w = trSingular(w0.replace(/[^a-z-]/g, ""));
    if (!w || w === "spell" || w === "token" || w === "nontoken") return true;
    if (w === "permanent") return !/\b(instant|sorcery)\b/.test(type);
    if (w === "nonland") return !words.includes("land");
    if (w === "noncreature") return !words.includes("creature");
    if (w === "nonartifact") return !words.includes("artifact");
    if (/^non-?[a-z]{3,}$/.test(w0)) return !words.includes(trSingular(w0.replace(/^non-?/, "")));
    if (w === "multicolored") return (c.colors || []).length > 1;
    if (w === "colorless") return !(c.colors || []).length;
    if (w === "historic") return words.includes("artifact") || words.includes("legendary") || words.includes("saga");
    if (w === "commander") return !!c.commander;
    if (TR_COLOR_WORD[w]) return (c.colors || []).includes(TR_COLOR_WORD[w]);
    if (words.includes(w) || words.includes(w0)) return true;
    // changelings are every creature type
    return /\bchangeling\b|is every creature type/i.test(c.text || "") && /\b(creature|kindred|tribal)\b/.test(type) && !TR_NOT_SUBTYPE.has(w);
  }));
}
// "When CARDNAME enters or attacks" → [{ev:"etb",who:"self"},{ev:"attack",who:"self"}]
function trConditions(cond){
  // "When Ivora enters and whenever it deals combat damage to a player"
  { const two = cond.match(/^(when(?:ever)? .+?) and (whenever .+)$/); if (two && !/^when(?:ever)? (?:you|a|an|one|each)\b.* and\b/.test(two[1])) { const a = trConditions(two[1]), b = trConditions(two[2].replace(/\b(?:it|they)\b/, "cardname")); if (a.length && b.length) return a.concat(b); } }
  const out = [], c = cond.replace(/^(when|whenever)\s+/, "");
  let m;
  if ((m = c.match(/^at the beginning of (.*)$/))) {
    const p = m[1];
    if (/upkeep/.test(p) && /(your|each)/.test(p)) out.push({ev: "upkeep"});
    else if (/end step/.test(p) && /(your|each|the)/.test(p)) out.push({ev: "endstep"});
    else if (/combat/.test(p) && /(your turn|each combat)/.test(p)) out.push({ev: "combat"});
    else if (/your draw step/.test(p)) out.push({ev: "drawstep"});
    else if (/your (precombat|first) main phase/.test(p)) out.push({ev: "main"});
    return out;
  }
  if (/^you cast (?:this spell|cardname)\b/.test(c)) return [{ev: "cast", who: "self"}];
  if ((m = c.match(/^you cast (?:(?:a|an|another|your first|your second)\s+)?(.*?)\s*spells?\b/))) {
    const nth = /your second/.test(c) ? 2 : /your first/.test(c) ? 1 : 0;
    return [{ev: "cast", who: "any", phrase: m[1], nth}];
  }
  if (/^you cast your commander/.test(c)) return [{ev: "cast", who: "any", phrase: "commander"}];
  if ((m = c.match(/^you draw (a|your second|your first) card/))) return [{ev: "draw", nth: m[1] === "your second" ? 2 : m[1] === "your first" ? 1 : 0}];
  if (/^you gain life/.test(c)) return [{ev: "gainlife"}];
  if (/^you lose life/.test(c)) return [{ev: "loselife"}];
  if ((m = c.match(/^you create (?:a|one or more) (.*?)\s*tokens?/))) return [{ev: "token", phrase: m[1], batch: /one or more/.test(c)}];
  if (/^you play a land/.test(c)) return [{ev: "landplay"}];
  if (/^you (?:discard|cycle or discard) (?:a|one or more|another) cards?/.test(c)) return [{ev: "discard"}].concat(/cycle/.test(c) ? [{ev: "cycle"}] : []);
  if (/^you cycle (?:a|another|this) card|^you cycle cardname/.test(c)) return [{ev: "cycle", who: /cardname|this card/.test(c) ? "self" : "any", phrase: ""}];
  if (/^you activate an ability/.test(c)) return [{ev: "activate"}];
  if ((m = c.match(/^one or more \+1\/\+1 counters are put on (cardname|(?:a|another) [a-z ]+? you control)/))) return [{ev: "ctr", who: m[1] === "cardname" ? "self" : /another/.test(m[1]) ? "other" : "any", phrase: m[1].replace(/^(?:a|another) /, "").replace(/ you control$/, ""), batch: true}];
  if ((m = c.match(/^(?:a|another) creature you control attacks alone|^cardname attacks alone/))) return [{ev: "attackalone", who: /^cardname/.test(c) ? "self" : "any", phrase: "creature"}];
  if (/^cardname becomes crewed/.test(c)) return [{ev: "crewed", who: "self"}];
  if (/^cardname becomes saddled/.test(c)) return [{ev: "saddled", who: "self"}];
  if (/^cardname becomes monstrous/.test(c)) return [{ev: "monstrous", who: "self"}];
  if (/^cardname becomes attached to|^cardname becomes equipped/.test(c)) return [{ev: "attach", who: "self"}];
  if (/^you attack\b/.test(c)) return [{ev: "attackers"}];
  if ((m = c.match(/^you sacrifice (?:(?:a|an|one or more|another)\s+)?(.*)$/))) {
    const ph = m[1], nontoken = /\bnontoken\b/.test(ph);
    return [{ev: "sac", who: /\banother\b/.test(c) ? "other" : "any", phrase: ph.replace(/\b(nontoken|tokens?)\b/g, " "), nontoken, tokenOnly: /\btokens?\b/.test(ph) && !nontoken, batch: /one or more/.test(c)}];
  }
  if (/^(?:an opponent|one or more opponents|each opponent) (?:loses life|lose life|is dealt damage)/.test(c)) return [{ev: "opploss"}];
  if (/^an opponent|^each opponent|^a player|^an? (?:opponent|player)/.test(c)) return out;
  // subject + verbs
  const verbRe = /\b(enters|enter|dies|die|attacks|attack|leaves the battlefield|leave the battlefield|deals combat damage to a player|deal combat damage to a player|deals combat damage to an opponent|is put into a graveyard from the battlefield|are put into a graveyard from the battlefield|is put into your graveyard from the battlefield|becomes tapped|blocks)\b/;
  const vm = c.match(verbRe); if (!vm) return out;
  const subject = c.slice(0, vm.index).trim(), rest = c.slice(vm.index);
  const evs = [];
  if (/combat damage to (?:a player|an opponent)/.test(rest)) evs.push("combatdmg");
  else {
    if (/\benters?\b/.test(rest)) evs.push("etb");
    if (/\bdies\b|\bdie\b|put into (?:a|your) graveyard from the battlefield/.test(rest)) evs.push("dies");
    if (/\battacks?\b/.test(rest)) evs.push("attack");
    if (/leaves? the battlefield/.test(rest)) evs.push("ltb");
  }
  if (!evs.length) return out;
  const batch = /one or more/.test(subject), nontoken = /\bnontoken\b/.test(subject), tokenOnly = /\btokens?\b/.test(subject) && !nontoken;
  let who, phrase = subject;
  if (/^cardname$/.test(subject)) who = "self";
  else if (/^cardname or (?:another|an?|one or more)\b/.test(subject)) { who = "selfOrOther"; phrase = subject.replace(/^cardname or /, ""); }
  else if (/^cardname and\b/.test(subject)) { who = "self"; }
  else if (/\banother\b|\bother\b/.test(subject)) who = "other";
  else if (/^(?:a|an|one or more|each)\b/.test(subject)) who = "any";
  else if (/^(?:enchanted|equipped) creature$/.test(subject)) who = "attached";
  else return out;
  // only things you control: in a goldfish game "a creature" means one of yours
  if (/\b(an opponent controls|your opponents control|you don't control)\b/.test(subject)) return out;
  for (const ev of evs) out.push({ev, who, phrase: phrase.replace(/\b(nontoken|tokens?)\b/g, " "), batch, nontoken, tokenOnly});
  return out;
}
// " with flying, vigilance, and "{T}: …" and equip {2}": a token's abilities, read up to the end of the sentence (quotes may hold periods)
function trWithClause(rest){
  if (!/^ with /.test(rest)) return {raw: "", clause: ""};
  let i = 6, q = false;
  for (; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '"') { q = !q; continue; }
    if (q) continue;
    if (ch === "." || ch === ";") break;
    if (/^ (?:equal to|for each|attached to|until|that's|that are|where x)\b/.test(rest.slice(i, i + 16))) break;
  }
  return {raw: rest.slice(0, i), clause: rest.slice(6, i).replace(/,\s*$/, "")};
}
// Simple effects it can carry out: a list of actions with a short label each
function trActions(eff, selfName){
  const a = [], e = eff.toLowerCase();
  let m;
  const label = s => s;
  // draw
  if ((m = e.match(/\b(?:you )?(?:may )?draws? (a|an|one|two|three|four|five|six|seven|x|\d+) cards?\b/)) && !/\b(?:each opponent|target opponent|that player) draws/.test(e)) a.push({t: "draw", n: trNum(m[1]), x: m[1] === "x", label: `Draw ${m[1] === "x" ? "X" : trNum(m[1])}`});
  // tokens (possibly several "create" clauses)
  const tokRe = /\bcreate (a number of|a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+|that many) (tapped )?(?:(\d+|x)\/(\d+|x) )?((?:[a-z'-]+(?:,| and)? )*?)(?:(artifact |enchantment )?creature )?tokens?(?: named ([a-z' -]+?))?(?=[.,;]| with | and | or | that | that's | for each| equal to| attached|$)/g;
  const cap = w => String(w).split(" ").map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(" ");
  while ((m = tokRe.exec(e))) {
    if (/\brole$/.test((m[5] || "").trim())) continue;   // Role tokens: read below
    { const w = trWithClause(e.slice(m.index + m[0].length)); m = Object.assign([...m], {index: m.index}); m[0] += w.raw; m[8] = w.clause || undefined; }
    const n = m[1] === "a number of" ? 1 : trNum(m[1]), words = (m[5] || "").replace(/,| and /g, " ").trim().split(/\s+/).filter(Boolean);
    if (/\bcopy\b/.test(m[0]) || /\bthat(?:'s| are) (?:a )?cop(?:y|ies)\b/.test(e.slice(m.index, m.index + 60))) continue;
    const colors = words.filter(w => TR_COLOR_WORD[w]).map(w => TR_COLOR_WORD[w]);
    const TYPES = ["artifact", "enchantment", "land"];
    const typeW = words.filter(w => TYPES.includes(w)).concat((m[6] || "").trim() ? [(m[6] || "").trim()] : []);
    const rest = words.filter(w => !TR_COLOR_WORD[w] && !TYPES.includes(w) && !["colorless", "legendary", "snow"].includes(w));
    const legendary = words.includes("legendary"), snow = words.includes("snow");
    const isCre = !!(m[3] || /creature tokens?\b/.test(m[0]));
    const nm = m[7] ? cap(m[7].trim()) : cap(rest.join(" ")) || (isCre ? "Creature" : "Token");
    const known = typeof PT_COMMON_TOKENS !== "undefined" && !m[7] ? PT_COMMON_TOKENS.find(t => t.name.toLowerCase() === nm.toLowerCase() && !isCre === !t.power) : null;
    const withTxt = (m[8] || "").replace(/"([^"]*)"/g, (x, q) => "\n" + q.replace(/\bcardname\b/g, nm).replace(/(^|\. |: )([a-z])/g, (y, p0, ch) => p0 + ch.toUpperCase()) + "\n").replace(/(^|\n)([a-z])/g, (x, p0, ch) => p0 + ch.toUpperCase()).replace(/(,? and |, )([a-z{])/g, (x, p0, ch) => "\n" + ch.toUpperCase()).replace(/,? and \n/g, "\n").replace(/^\s*,?\s*|\s*,?\s*$/g, "").replace(/\n\s*,?\s*/g, "\n").replace(/\{([a-z0-9])\}/gi, (x, c) => "{" + c.toUpperCase() + "}");
    const tline = `Token ${legendary ? "Legendary " : ""}${snow ? "Snow " : ""}${cap(typeW.join(" "))}${isCre ? (typeW.length ? " " : "") + "Creature" : typeW.length ? "" : "Artifact"} — ${cap(rest.join(" ")) || nm}`.replace(/\s+/g, " ").replace(/ Artifact — (Treasure|Clue|Food|Blood|Map|Gold|Powerstone|Junk|Incubator)/i, " Artifact — $1");
    const def = known && !m[3] ? Object.assign({}, known) : {name: nm, type: tline, power: m[3] && m[3] !== "x" ? m[3] : isCre ? (m[3] || (/power and toughness are each equal/.test(withTxt.toLowerCase()) ? "*" : "1")) : "", toughness: m[4] && m[4] !== "x" ? m[4] : isCre ? (m[4] || (/power and toughness are each equal/.test(withTxt.toLowerCase()) ? "*" : "1")) : "", colors, text: withTxt};
    if (m[2]) def.tapped = true;
    const after = e.slice(m.index + m[0].length), fe = after.match(/^ for each ([a-z ]+?) you control/), choice = /^ or an? /.test(after);
    const eq = m[1] === "a number of" ? (after.match(/^(?: with [a-z ,]+?)? equal to (?:the )?((?:number of )?[^.]+?)(?=\.|$)/) || [])[1] : null;
    const attacking = /^,? (?:that are |that's |which are )?(?:tapped and )?attacking/.test(after);
    if (attacking) def.tapped = true;
    const perOpp = /for each opponent,? (?:you )?$/.test(e.slice(Math.max(0, m.index - 30), m.index));
    const span = perOpp ? e.slice(e.lastIndexOf("for each opponent", m.index), m.index + m[0].length) : eq ? m[0] + after.slice(0, after.indexOf(eq) + eq.length) : m[8] && /"/.test(m[8]) ? m[0] : undefined;
    a.push({t: "token", n, x: m[1] === "x", count: eq || undefined, attacking, many: m[1] === "that many", each: fe ? fe[1] : null, perOpp, span, def, i: m.index, label: `Create ${eq ? "" : fe ? "one per " + trSingular(fe[1].split(" ").pop()) : n > 1 ? n + "×" : ""} ${def.power && def.power !== "*" ? def.power + "/" + def.toughness + " " : ""}${def.name}${eq ? "s (" + eq.replace(/^number of /, "one per ") + ")" : ""}${choice ? " (or the other choice)" : ""}`.replace(/\s+/g, " ")});
  }
  if ((m = e.match(/\bcreate your choice of (?:a|an) ([a-z]+) token,? (?:an? ([a-z]+) token,? )?or (?:a|an) ([a-z]+) token/))) {
    const opts = [m[1], m[2], m[3]].filter(Boolean), pick = opts.includes("treasure") ? "treasure" : opts[0], known = PT_COMMON_TOKENS.find(t => t.name.toLowerCase() === pick);
    if (known) a.push({t: "token", n: 1, def: Object.assign({}, known), i: m.index, span: m[0], label: `Create a ${cap(pick)} (your choice: ${opts.join(", ")})`});
  }
  // named legendary tokens: "create Beau, a legendary blue Ox creature token with …", "create Mowu, a legendary 3/3 green Dog creature token"
  if ((m = e.match(/\bcreate ((?:the )?[a-z'-]+(?: [a-z'-]+){0,2}), a legendary (?:(\d+|x)\/(\d+|x) )?((?:[a-z]+ ){0,6}?)(artifact (?:creature )?|creature )token\b/))) {
    { const w = trWithClause(e.slice(m.index + m[0].length)); m = Object.assign([...m], {index: m.index}); m[0] += w.raw; m[6] = w.clause || undefined; }
    const words = m[4].trim().split(/\s+/).filter(Boolean), colors = words.filter(w => TR_COLOR_WORD[w]).map(w => TR_COLOR_WORD[w]), sub = words.filter(w => !TR_COLOR_WORD[w] && w !== "colorless");
    const isCre = /creature/.test(m[5]);
    const txt = (m[6] || "").replace(/"([^"]*)"/g, (x, q) => q.replace(/\bcardname\b/g, cap(m[1])).replace(/^([a-z])/, c => c.toUpperCase())).replace(/^([a-z])/, c => c.toUpperCase());
    const cda = /power and toughness are each equal/.test(txt.toLowerCase());
    const kwTxt = (m[6] || "").replace(/"[^"]*"/g, "").replace(/(^|,? and |, )([a-z])/g, (x, p0, ch) => (p0 ? "\n" : "") + ch.toUpperCase()).replace(/\{([a-z0-9])\}/g, (x, c) => "{" + c.toUpperCase() + "}").trim();
    const quoted = [...(m[6] || "").matchAll(/"([^"]*)"/g)].map(q => q[1].replace(/^([a-z])/, c => c.toUpperCase())).join("\n");
    a.push({t: "token", n: 1, def: {name: cap(m[1]), type: `Token Legendary ${/artifact/.test(m[5]) ? "Artifact " : ""}${isCre ? "Creature " : ""}— ${cap(sub.join(" "))}`.replace(/  +/g, " ").replace(" — ", isCre || /artifact/.test(m[5]) ? " — " : " — "), power: isCre || /vehicle/.test(sub.join(" ")) ? (m[2] || (cda ? "*" : "1")) : "", toughness: isCre || /vehicle/.test(sub.join(" ")) ? (m[3] || (cda ? "*" : "1")) : "", colors, text: [quoted, kwTxt].filter(Boolean).join("\n") || txt}, i: m.index, span: m[0], label: `Create ${cap(m[1])}${m[2] ? ` (${m[2]}/${m[3]})` : ""}`});
  }
  // Role tokens (Auras): "create a Royal Role token attached to another target creature you control"
  if ((m = e.match(/\bcreate (?:a|an) ([a-z ]+?) role token attached to (it|cardname|that creature|target creature you control|another target creature you control|up to one target creature you control|target creature|up to one other target creature|target creature an opponent controls)\b/))) {
    a.push({t: "role", role: m[1].trim(), on: m[2], i: m.index, span: m[0], label: `Create a ${cap(m[1].trim())} Role on ${/opponent/.test(m[2]) ? "an opponent's creature" : /^(it|cardname|that creature)$/.test(m[2]) ? "it" : "your best creature"}`});
  }
  if ((m = e.match(/\bcreate (a|one|two|three|four|five|six|seven|x|\d+) tokens? that(?:'s| are) (?:a )?cop(?:y|ies) of (cardname|it|them|that creature|that card|target [^.]*)/))) {
    if (m[2] === "them") m = Object.assign([...m], {index: m.index}), m[2] = "cardname";
    const haste = /\b(?:the|that|those) tokens? (?:gains?|ha(?:s|ve)) haste\b|\bcopy of [^.]*? with haste\b|\bexcept it has haste\b/.test(e);
    const nonLegend = /\bexcept (?:the tokens? (?:aren't|isn't|are not|is not)|they're not|it's not|it isn't) legendary\b/.test(e);
    a.push({t: "copy", n: trNum(m[1]), of: m[2] === "cardname" ? "self" : m[2].startsWith("target") ? "target" : "it", haste, nonLegend, i: m.index, label: `Make ${trNum(m[1]) > 1 ? trNum(m[1]) + " token copies" : "a token copy"}${nonLegend ? " (not legendary)" : ""}${haste ? " with haste" : ""}`});
  }
  // "At the beginning of your next end step, sacrifice it (unless you pay…)" / "Exile it at the beginning of the next end step"
  if ((m = e.match(/\bat the beginning of (?:the |your )?next end step, (sacrifice|exile) (?:it|them|that token|those tokens|the token)( unless [^.]*)?/)) || (m = e.match(/\b(sacrifice|exile) (?:it|them|that token|those tokens|the token) at the beginning of (?:the |your )?next end step( unless [^.]*)?/)))
    a.push({t: "delay", act: m[1] === "exile" ? "exile" : "sac", unless: (m[2] || "").trim(), i: m.index, label: `${m[1] === "exile" ? "Exile" : "Sacrifice"} it at your next end step${m[2] ? " unless you pay" : ""}`});
  // life
  if ((m = e.match(/\b(?:you (?:may )?|you [a-z ,]+? and |(?:^|\. )(?:you )?(?:may )?)gain (\d+|x|that much) life(?! for each| equal)/))) a.push({t: "life", n: trNum(m[1]), x: m[1] === "x", much: m[1] === "that much", label: m[1] === "that much" ? "Gain that much life" : `Gain ${trNum(m[1])} life`});
  if ((m = e.match(/\b(?:you |you [a-z ,]+? and )lose (\d+|x) life/))) a.push({t: "life", n: -trNum(m[1]), x: m[1] === "x", label: `Lose ${trNum(m[1])} life`});
  if ((m = e.match(/\b(each opponent|target opponent|target player|that player|defending player) loses (\d+|x|that much) life/))) { const each = m[1] === "each opponent"; a.push({t: "opp", n: trNum(m[2]), x: m[2] === "x", much: m[2] === "that much", each, defending: /defending|that player/.test(m[1]), label: `${each ? "Each opponent" : "Opponent"} loses ${m[2] === "that much" ? "that much" : trNum(m[2])}`}); }
  else if ((m = e.match(/\bdeals? (\d+|x|that much) damage to (each opponent|target opponent|any target|target player|that player|target player or planeswalker|each player|defending player)/))) { const each = /^each/.test(m[2]); a.push({t: "opp", n: trNum(m[1]), x: m[1] === "x", much: m[1] === "that much", dmg: true, each, defending: /defending|that player/.test(m[2]), label: `${m[1] === "that much" ? "That much" : trNum(m[1])} damage to ${each ? "each opponent" : "an opponent"}`}); }
  // counters
  const cRe = /\bput (a|an|one|two|three|four|five|x|\d+) (\+1\/\+1|-1\/-1|loyalty|charge|lore|time|oil|shield|stun|quest|level|fade|age|verse|ki|study|blood|divinity|flood|growth|page) counters? on (cardname|it|him|her|that creature|this creature|each (?:other )?[a-z ]*?(?:creature )?you control|each of up to (?:one|two|three|four|five) (?:other )?target (?:[a-z]+ )?creatures?(?: you control)?|(?:another |up to one )?target (?:attacking |tapped |nonlegendary |[a-z]+ )?(?:artifact or )?creature(?: you control)?|another target [a-z]+ you control|target [a-z]+ you control|up to one target creature|each creature|target permanent|enchanted creature|equipped creature|a creature you control|each attacking creature|each [a-z]+ creature)/g;
  while ((m = cRe.exec(e))) {
    const kind = {"+1/+1": "p1p1", "-1/-1": "m1m1"}[m[2]] || m[2], on = m[3];
    let tgt = /^(cardname|this creature|him|her)$/.test(on) ? "self" : /^(it|that creature)$/.test(on) ? "it" : /^(enchanted|equipped) creature$/.test(on) ? "host" : /^each of up to/.test(on) ? "target" : /^each other creature you control$/.test(on) ? "allOther" : /^each creature( you control)?$/.test(on) ? "all" : /^each /.test(on) ? "each" : "target";
    const each = tgt === "each" ? on.replace(/^each (other )?/, "").replace(/ you control$/, "") : null;
    const tn = (on.match(/^each of up to (one|two|three|four|five)/) || [])[1];
    const nm = {p1p1: "+1/+1", m1m1: "−1/−1"}[kind] || kind[0].toUpperCase() + kind.slice(1);
    a.push({t: "counter", n: trNum(m[1]), x: m[1] === "x", kind, on: tgt, each, tn: tn ? trNum(tn) : 1, i: m.index, span: tn || /^(another|target [a-z]+ you control|a creature you control|enchanted|equipped|him|her)/.test(on) ? m[0] : undefined, label: `${trNum(m[1]) > 1 ? trNum(m[1]) + " " : ""}${nm} counter${trNum(m[1]) > 1 ? "s" : ""} on ${{self: selfName, it: "it", all: "each creature", allOther: "each other creature", target: (tn && trNum(tn) > 1) ? `up to ${trNum(tn)} creatures you pick` : "a creature you pick", host: "the creature it's attached to", each: "each " + each}[tgt]}`});
  }
  if (/\bproliferate\b/.test(e)) a.push({t: "proliferate", label: "Proliferate"});
  // library
  if ((m = e.match(/\bscry (\d+|x)\b/))) a.push({t: "scry", n: trNum(m[1]), x: m[1] === "x", label: `Scry ${trNum(m[1])}`});
  if ((m = e.match(/\bsurveil (\d+|x)\b/))) a.push({t: "scry", n: trNum(m[1]), x: m[1] === "x", surveil: true, label: `Surveil ${trNum(m[1])}`});
  if ((m = e.match(/\b(?:you )?mills? (a|one|two|three|four|five|x|\d+) cards?\b/)) && !/\b(?:target|each) (?:player|opponent) mills/.test(e)) a.push({t: "mill", n: trNum(m[1]), x: m[1] === "x", label: `Mill ${trNum(m[1])}`});
  if ((m = e.match(/\blook at the top (a|one|two|three|four|five|six|seven|x|\d+) cards? of your library/))) a.push({t: "dig", n: trNum(m[1]), label: `Look at the top ${trNum(m[1])}`});
  if ((m = e.match(/\bexile the top (card|a card|two cards|three cards|\w+ cards) of your library/))) a.push({t: "exiletop", n: m[1] === "card" || m[1] === "a card" ? 1 : trNum(m[1].split(" ")[0]), i: m.index, label: "Exile from the top"});
  if (/\bsearch your library\b/.test(e)) a.push(trSearch(e));
  if (/\breturn [^.]*from your graveyard\b/.test(e) || /\bfrom your graveyard to\b/.test(e)) a.push({t: "grave", label: "Open your graveyard", dialog: true});
  // untap / energy
  if ((m = e.match(/\buntap (cardname|it|that creature|all creatures you control|each creature you control|all lands you control|target [a-z ]+)/))) a.push({t: "untap", on: m[1] === "cardname" ? "self" : /^(it|that creature)$/.test(m[1]) ? "it" : /creatures/.test(m[1]) ? "creatures" : /lands/.test(m[1]) ? "lands" : "target", label: "Untap " + (m[1] === "cardname" ? selfName : m[1].replace(/^target /, "a "))});
  if ((m = e.match(/\byou get ((?:\{e\})+)/))) a.push({t: "energy", n: (m[1].match(/\{e\}/g) || []).length, label: `Get ${(m[1].match(/\{e\}/g) || []).length} energy`});
  if ((m = e.match(/\byou get an experience counter/))) a.push({t: "pcounter", kind: "experience", label: "Get an experience counter"});
  // blink: "exile target creature you control, then return it to the battlefield" (Ephemerate, Restoration Angel, Cloudshift)
  if ((m = e.match(/\bexile (?:up to one )?(?:another )?target ([a-z -]*?)(?:creature|permanent|artifact or creature|creature or artifact|nonland permanent)s?(?: you control| you own)?[^.]*?,? then return (?:it|that card|that creature|those cards|the exiled card)/))) a.push({t: "blink", target: true, i: m.index, label: "Blink a creature you pick"});
  else if ((m = e.match(/\bexile cardname,? then return (?:it|cardname)/))) a.push({t: "blink", on: "self", i: m.index, label: "Blink it"});
  else if ((m = e.match(/\bexile (?:up to one )?(?:another )?target [^.]*?\. return (?:that card|it|the exiled card) to the battlefield[^.]*?at the beginning of the next end step/))) a.push({t: "blink", target: true, delay: true, i: m.index, label: "Exile a creature you pick; it returns at the end step"});
  // "look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't…, put it into your hand." (Risen Reef, Coiling Oracle)
  if ((m = e.match(new RegExp(TR_TOPIF)))) {
    const yes = /battlefield/.test(m[3]) ? (/tapped/.test(m[3]) ? "bfTapped" : "bf") : "hand";
    const no = !m[4] ? "top" : /hand/.test(m[4]) ? "hand" : /bottom/.test(m[4]) ? "bottom" : /graveyard/.test(m[4]) ? "grave" : "top";
    const where = {bf: "battlefield", bfTapped: "battlefield tapped", hand: "hand", bottom: "bottom", grave: "graveyard", top: "stays on top"};
    a.push({t: "topif", phrase: m[1].trim(), yes, no, i: m.index, label: `Top card: ${m[1].trim()} → ${where[yes]}, else → ${where[no]}`});
  }
  // explore: a land goes to your hand, anything else gives a +1/+1 counter and stays on top
  for (const x of e.matchAll(/\b(cardname|it|that creature|target creature you control) explores\b/g)) a.push({t: "explore", on: x[1] === "cardname" ? "self" : x[1] === "target creature you control" ? "target" : "it", i: x.index, label: "Explore"});   // Jadelight Ranger explores twice
  if ((m = e.match(/\binvestigate(?: (twice|three times))?\b/))) a.push({t: "token", n: m[1] === "twice" ? 2 : m[1] === "three times" ? 3 : 1, def: {name: "Clue", type: "Token Artifact — Clue", colors: [], text: "{2}, Sacrifice this artifact: Draw a card."}, i: m.index, label: `Investigate${m[1] ? " " + m[1] : ""} (Clue)`});
  if ((m = e.match(/\bdiscover (\d+|x)\b/))) a.push({t: "discover", n: trNum(m[1]), i: m.index, label: `Discover ${trNum(m[1])}`});
  if ((m = e.match(/\btransform (cardname|it)\b/))) a.push({t: "transform", on: m[1] === "it" ? "it" : "self", label: `Transform ${selfName.split(" // ")[0]}`});
  if ((m = e.match(/\bshuffle your library\b/)) && !a.some(x => x.t === "search")) a.push({t: "shuffle", label: "Shuffle"});
  for (const x of a) if (x.i == null) { const k = e.indexOf(x.t === "draw" ? "draw" : x.t === "life" ? (x.n > 0 ? "gain" : "lose") : x.t === "opp" ? (/loses/.test(e) ? "loses" : "damage") : x.t === "scry" ? (x.surveil ? "surveil" : "scry") : x.t === "mill" ? "mill" : x.t === "dig" ? "look at" : x.t === "untap" ? "untap" : x.t === "energy" ? "you get" : x.t === "search" ? "search" : x.t === "grave" ? "graveyard" : x.t); x.i = k < 0 ? 999 : k; }
  // the newer kinds of effect (pumps, removal, sacrifice, discard, graveyard returns, searches, keyword actions…)
  const more = trActions2(e, selfName, a);
  if (more.length) {
    const spans = more.filter(x => x.span).map(x => [x.i, x.i + x.span.length]);
    for (let k = a.length - 1; k >= 0; k--) if (a[k].i != null && spans.some(([s0, s1]) => a[k].i >= s0 && a[k].i < s1)) a.splice(k, 1);
    if (more.some(x => x.t === "fromGrave" || x.t === "selfFromGrave")) for (let k = a.length - 1; k >= 0; k--) if (a[k].t === "grave") a.splice(k, 1);
    if (more.some(x => x.t === "searchAuto")) for (let k = a.length - 1; k >= 0; k--) if (a[k].t === "search" || a[k].t === "shuffle") a.splice(k, 1);
    if (more.some(x => x.t === "attachTok")) for (let k = a.length - 1; k >= 0; k--) if (a[k].t === "token" && /germ|rebel|hero/i.test(a[k].label)) a.splice(k, 1);
    a.push(...more);
  }
  // "look at the top N … put one (a creature card…) into your hand and the rest on the bottom": pick for you
  let dg = a.find(x => x.t === "dig");
  if ((m = e.match(/\b(?:look at|reveal) the top (\w+) cards? of your library\. (?:you may )?(?:reveal |put )?(a|an|one|up to one|up to two|two|any number of) ([a-z ,]*?)(?:cards? )?(?:of them |from among (?:them|those cards) )?(?:and put (?:it|them|that card|those cards) )?into your hand(?:,| and| then|\.)? ?(?:put )?the rest (on the bottom of your library[^.]*|into your graveyard)/))) {
    if (!dg) { dg = {t: "dig", n: trNum(m[1]), label: `Reveal the top ${m[1]}, take the best`}; a.push(dg); }
    Object.assign(dg, {auto: true, take: /two/.test(m[2]) ? 2 : /any number/.test(m[2]) ? 99 : 1, phrase: m[3].replace(/\b(of them|card|cards)\b/g, "").trim(), rest: /graveyard/.test(m[4]) ? "grave" : "bottom", span: m[0], i: m.index});
  }
  // keep them in the order the card says them ("scry 1, then draw a card")
  for (const x of a) if (x.i == null) { const k = e.indexOf(x.t === "draw" ? "draw" : x.t === "life" ? (x.n > 0 ? "gain" : "lose") : x.t === "opp" ? (/loses/.test(e) ? "loses" : "damage") : x.t === "scry" ? (/surveil/.test(x.label.toLowerCase()) ? "surveil" : "scry") : x.t === "mill" ? "mill" : x.t === "dig" ? "look at" : x.t === "untap" ? "untap" : x.t === "energy" ? "you get" : x.t === "search" ? "search" : x.t === "grave" ? "graveyard" : x.t); x.i = k < 0 ? 999 : k; }
  a.sort((p, q) => p.i - q.i);
  // abilities in quotes belong to the token (or emblem) being made, not to this effect
  const quoted = [...e.matchAll(/"[^"]*"/g)].filter(q => /\b(?:tokens?|emblem)\b[^."]*$/.test(e.slice(Math.max(0, q.index - 120), q.index))).map(q => [q.index, q.index + q[0].length]);
  if (quoted.length) for (let k = a.length - 1; k >= 0; k--) if (a[k].t !== "token" && a[k].i != null && quoted.some(([s0, s1]) => a[k].i > s0 && a[k].i < s1)) a.splice(k, 1);
  // "create a 0/0 Fractal token. Put three +1/+1 counters on it": the counters go on the new token, after it's made
  const tk = a.findIndex(x => x.t === "token"), ci = a.findIndex(x => x.t === "counter" && x.on === "it");
  if (tk >= 0 && ci >= 0 && (a[ci].i == null || a[tk].i == null || a[ci].i > a[tk].i || ci < tk)) { const c = a.splice(ci, 1)[0]; c.onMade = true; a.splice(a.indexOf(a.find(x => x.t === "token")) + 1, 0, c); }
  return a;
}
// All triggered abilities on a card (cached by name and text)
const trCache = new Map();
function trParseTrig(t, shown, card){
  if (!/^(when|whenever|at)\b/.test(t)) return null;
  // the condition ends at the first comma that leaves a sensible condition ("…an aura, equipment, or vehicle spell, draw…")
  let conds = [], eff = "";
  for (let at = t.indexOf(","); at > 0; at = t.indexOf(",", at + 1)) {
    const cnd = t.slice(0, at).trim(), cs = trConditions(cnd);
    if (cs.length && !(/\byou cast\b/.test(cnd) && !/\bspell|cardname\b/.test(cnd))) { conds = cs; eff = t.slice(at + 1).trim(); break; }
  }
  if (!conds.length) return null;
  const nm = card.name.split(" // ")[card.back ? 1 : 0] || card.name;
  return {text: shown, eff, conds, actions: trActions(eff, nm), may: /\byou may\b/.test(eff), intervening: /^if\b/.test(eff), xExpr: (eff.match(/where x is ([^.]+)/) || [])[1] || null};
}
function trAbilities(card){
  const text = ptFaceText(card), speed = PT && (PT.speed || 0) >= 4 ? 1 : 0, kwKey = PT && PT.bf ? ptKws(card).size + ":" + [...ptKws(card).keys()].join(",") : "";
  const key = card.name + "|" + (card.back ? 1 : 0) + "|" + speed + "|" + kwKey + "|" + text;
  if (trCache.has(key)) return trCache.get(key);
  const list = [];
  // "Choose one —" abilities: the "•" lines under it are its modes
  const lines0 = []; for (const l of text.split(/\n+/)) { if (/^\s*•/.test(l) && lines0.length && /—\s*$|•/.test(lines0[lines0.length - 1])) lines0[lines0.length - 1] += "\n" + l.trim(); else lines0.push(l); }
  for (let ab of lines0) {
    ab = ab.trim(); if (!ab) continue;
    if (card.name.split(" // ").includes(ab)) continue;   // face names in double-faced card text
    if (/^Max speed\s*—/i.test(ab)) { if (!speed) continue; ab = ab.replace(/^Max speed\s*—\s*/i, ""); }
    if (/^(?:I|II|III|IV|V|VI|VII)(?:, (?:I|II|III|IV|V|VI|VII))* — /.test(ab)) continue;   // saga chapters below
    const t = trLower(card, ab.replace(/^[A-Z][A-Za-z' ]+ — /, "").replace(/^[A-Z][^—\n]{0,70}? — (?=When|Whenever|At the beginning|As )/, ""));
    const r = trParseTrig(t, ab, card); if (!r) continue;
    const md = /\n\s*•/.test(ab) ? trModes(ab) : null;
    if (md) { const nm0 = ptFaceName(card); Object.assign(r, {modes: md.lines.map(l => { const e = trLower(card, l); return {text: l, eff: e, actions: trActions(e, nm0)}; }), pick: md.pick, upTo: md.upTo, actions: [], eff: null}); }
    list.push(r);
  }
  // keyword abilities that are triggers (prowess, afterlife, mobilize…), as rule 702 defines them
  list.push(...trKwAbilities(card, (t, shown) => trParseTrig(t, shown, card)));
  // saga chapters: each one triggers when its lore counter is added
  const nm = card.name.split(" // ")[card.back ? 1 : 0] || card.name;
  for (const ch of trChapters(card)) { const eff = trLower(card, ch.text); list.push({text: `Chapter ${Object.keys(PT_ROMAN)[ch.n - 1]} — ${ch.text}`, eff, conds: [{ev: "lore", who: "self", n: ch.n}], actions: trActions(eff, nm), may: /\byou may\b/.test(eff), intervening: /^if\b/.test(eff)}); }
  if (trCache.size > 3000) trCache.clear();
  trCache.set(key, list);
  return list;
}
// Did it understand every part of the effect? Each action word in the text needs an action it can do,
// and some words (sacrifice, destroy, choose…) always need a person.
const TR_VERBS = [[/\btransform\b/g, ["transform"]], [/\bdraws?\b/g, ["draw"]], [/\bcreates?\b/g, ["token", "copy"]], [/\bgains?\b(?= \d| x | life| that)/g, ["life"]], [/\blos(?:e|es)\b(?= \d| x | that)/g, ["life", "opp"]],
  [/\bdeals?\b/g, ["opp"]], [/\bput\b/g, ["counter"]], [/\b(?:scry|surveil)\b/g, ["scry"]], [/\bmills?\b/g, ["mill"]], [/\blook at\b/g, ["dig"]], [/\bexile\b/g, ["exiletop", "blink"]],
  [/\bsearch\b/g, ["search"]], [/\breturn\b/g, ["grave", "blink"]], [/\buntap\b/g, ["untap"]], [/\byou get\b/g, ["energy", "pcounter"]], [/\bproliferate\b/g, ["proliferate"]], [/\bshuffle\b/g, ["shuffle", "search"]]];
const TR_HARD = /\b(sacrifices?|destroy|discards?|tap (?:target|up to|an?|all|two|that)|add \{|add (?:one|two|three|x) mana|add an amount|choose|counter target|reveal|attach|fights?|becomes? the monarch|amass|connive|explore|venture|populate|goad|regenerate|exchange|gain control|copy target|cast|play|phase|double|distribute|for each)\b/;
const trA = w => (/^[aeiou]/i.test(w) ? "an " : "a ") + w;
const trCap = w => String(w || "").replace(/\b([a-z])/g, (m, x, i, all) => /\b(?:card|cards|with|or|and|of|the|mana|value|power|toughness|less|greater|named)$/.test(all.slice(i).split(" ")[0]) ? m : x.toUpperCase());
// "search your library for an Elemental card, reveal it, then shuffle and put that card on top": what to look for, how many, and where it goes
function trSearch(e){
  const out = {t: "search", label: "Search your library", dialog: true};
  const m = e.match(/\bsearch your library for (up to (one|two|three|four|five|x|\w+) |an? |one |two |three |any number of )?(?:([^.]*?) )?cards?\b(?: with [^,.]*?)?(?: and (?:put|reveal)[^.]*)?(?:[,.]|$)/);
  if (m) {
    const words = {one: 1, two: 2, three: 3, four: 4, five: 5};
    out.n = m[1] && /any number/.test(m[1]) ? 99 : words[m[2] || (m[1] || "").trim()] || 1;
    let what = (m[3] || "").replace(/^(?:a|an|basic|basic land|land) (?=card)/, "").trim();
    if (what && !/^(?:card|cards)$/.test(what)) out.what = what;
  }
  const rest = e.slice(e.indexOf("search your library"));
  const to = rest.match(/\b(?:put|puts) (?:it|that card|them|those cards|the cards?|one of them|that land|those lands|it or them)[^.]*?(into your hand|onto the battlefield(?: tapped)?|on top(?: of your library)?|into your graveyard|on the bottom)/);
  if (to) { out.to = /hand/.test(to[1]) ? "hand" : /battlefield/.test(to[1]) ? "bf" : /top/.test(to[1]) ? "top" : /graveyard/.test(to[1]) ? "grave" : "bottom"; if (/tapped/.test(to[1])) out.tapped = true; }
  const W = {hand: "into your hand", bf: "onto the battlefield" + (out.tapped ? " tapped" : ""), top: "on top after shuffling", grave: "into your graveyard", bottom: "on the bottom"};
  if (out.what || out.to) out.label = `Search for ${out.n > 1 && out.n < 99 ? out.n + " " + trCap(out.what || "card") : out.n === 99 ? "any number of " + trCap(out.what || "card") : trA(trCap(out.what || "card"))}${out.to ? " → " + W[out.to] : ""}`;
  return out;
}
const TR_TOPIF = String.raw`\b(?:look at|reveal) the top card of your library\.? (?:if it's|if it is|if that card is|if it's a|if it's an) (?:an? )?([a-z ]+?) card,? (you may )?(?:put it|put that card|reveal it and put it) (onto the battlefield(?: tapped)?|into your hand)\.?\s*(?:(?:if you don't put the card onto the battlefield|if you don't|otherwise),? (?:you may )?(?:put (?:it|that card|the card) )?(into your hand|on the bottom of your library|into your graveyard|on top of your library|back)?)?`;
// Parts of the text that are handled by a later step, so they don't count as "needs a person" now
const trStripHandled = e => e.replace(/\b(?:it|that creature|that permanent|those creatures|they) (?:doesn't|don't|does not|do not) untap during (?:its|their) controllers?'s? next untap step/g, " ").replace(/\bsacrifice [a-z ,'-]+? unless you sacrifice (?:a|an) [a-z ]+/g, " ").replace(/\bas an additional cost to cast (?:this spell|cardname),? (?:you may )?(?:pay x life|pay \d+ life|behold [^.]*|reveal [^.]*|tap [^.]*)?/g, " ").replace(/\b(?:and )?attacks? this combat if able\b|\bif able\b/g, " ").replace(/\buntil (?:an opponent becomes the monarch|cardname leaves the battlefield|your next turn)\b/g, " ").replace(/\bit's still a land\b|\bthis ability triggers only once each turn\b|\bactivate only (?:as a sorcery|once each turn)\b/g, " ").replace(new RegExp(TR_TOPIF, "g"), " ").replace(/\b(?:cardname|it|that creature) explores\b/g, " ").replace(/\binvestigate(?: twice| three times)?\b/g, " ").replace(/\b(?:at the beginning of (?:the |your )?next end step, )?(?:sacrifice|exile) (?:it|them|that token|those tokens|the token)(?: at the beginning of (?:the |your )?next end step)?(?: unless [^.]*)?/g, " ")
  .replace(/\b(?:the|that|those) tokens? (?:gains?|ha(?:s|ve)) haste(?: until end of turn)?/g, " ");
function trConditional(text){ return /\bif\b|\bunless\b|\binstead\b/i.test(trStripHandled(String(text || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/"[^"]*"/g, " ").replace(/^[^,]*,/, ""))); }   // reminder text doesn't count
function trCovered(eff, actions){
  let e = String(eff || "").toLowerCase().replace(/\([^)]*\)/g, "");
  for (const a of actions) if (a.span) e = e.split(a.span).join(" ");
  e = trStripHandled(e);
  e = e.replace(/\bwhere x is [^.]+/g, " ").replace(/\bthen shuffle\b|\bshuffle your library\b/g, (x) => actions.some(a => a.t === "searchAuto") ? " " : x);
  if (actions.some(a => a.t === "search")) e = e.replace(/,? (?:and )?reveal (?:it|them|that card|those cards|the chosen card)\b/g, " ");
  actions = actions.filter(a => !a.span);
  if (TR_HARD.test(e.replace(/create (?:[^.]*?) for each [a-z ]+ you control/, ""))) return false;
  for (const [re, types] of TR_VERBS) { const n = (e.match(re) || []).length, have = actions.filter(a => types.includes(a.t)).length; if (n > have) return false; }
  return true;
}

