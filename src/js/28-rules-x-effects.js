/* ----- X ----- */
// The playtester doesn't count mana, so X is guessed: everything your lands could make, minus the rest of the cost
function ptGuessX(c){
  if (!PT || !c) return 0;
  const cost = String(c.cost || "").split(" // ")[0], xs = (cost.match(/\{X\}/g) || []).length;
  const fixed = (cost.match(/\{[^}X]+\}/g) || []).reduce((t, s) => t + (/^\{\d+\}$/.test(s) ? parseInt(s.slice(1)) : 1), 0);
  const mana = PT.bf.filter(x => ptIsLand(x) || /\{T\}: Add/.test(ptFaceText(x))).length;
  return Math.max(0, Math.floor((mana - fixed) / Math.max(1, xs)));
}
function ptXOf(p){
  if (p.xVal != null) return p.xVal;
  if (p.xExpr) return ptCount(p.xExpr, {src: ptFind(p.srcUid), it: p.evUid != null ? ptFind(p.evUid) : null, p});
  if (p.amount != null && p.kind !== "spell") return p.amount;
  const f = ptFind(p.srcUid);
  return ptGuessX(f ? f.card : null);
}
// The amount an action works with: a number, X, "that much", or a count ("for each Elf you control")
function ptAmt(a, p){
  const ctx = {src: ptFind(p.srcUid), it: p.evUid != null ? ptFind(p.evUid) : null, p};
  if (p._it) ctx.it = p._it;
  let n = a.count ? ptCount(a.count, ctx) * (a.per || 1) : a.x ? ptXOf(p) : a.much && p.amount != null ? p.amount : a.n;
  if (a.neg) return -Math.max(0, n);
  return Math.max(0, n == null ? 1 : n);
}
/* ----- effects: more wording the table can carry out ----- */
// Who an effect means. Things that hurt with "target" go to the opponent's side (empty in a goldfish game);
// things that help with "target" are given to your best creature.
const TR_SUBJ = "(cardname|it|that creature|this creature|target creature you control|another target creature you control|up to one target creature you control|up to two target creatures you control|up to one other target creature|another target creature|up to one target creature|up to two target creatures|target attacking creature|target attacking or blocking creature|target creature an opponent controls|target creature you don't control|target creature|equipped creature|enchanted creature|each creature you control|each other creature you control|other creatures you control|creatures you control|each attacking creature|each other attacking creature|attacking creatures you control|attacking creatures|creatures your opponents control|each creature your opponents control|all creatures|each creature|(?:each |all |other )?(?:other )?[a-z-]+(?: [a-z-]+)? (?:creatures )?you control|the creature|those creatures|that token|those tokens)";
function trWho(s, good){
  s = String(s || "").trim();
  if (/^(cardname|this creature)$/.test(s)) return {who: "self"};
  if (/^(it|that creature|the creature|that token)$/.test(s)) return {who: "it"};
  if (/^(those creatures|those tokens)$/.test(s)) return {who: "made"};
  if (/^(equipped|enchanted) creature$/.test(s)) return {who: "host"};
  if (/opponents? control|you don't control|an opponent controls/.test(s)) return {who: "opp"};
  if (/^(?:target|another target|up to (?:one|two|three) (?:other )?target)/.test(s)) {
    const n = /up to two/.test(s) ? 2 : /up to three/.test(s) ? 3 : 1;
    if (/you control/.test(s) || good) return {who: "pick", n, other: /another|other/.test(s), attacking: /attacking/.test(s)};
    return {who: "opp"};
  }
  if (/^(each|all) creatures?$/.test(s) || /^all creatures$/.test(s)) return {who: "all", everyone: true};
  if (/^(each creature you control|creatures you control)$/.test(s)) return {who: "all"};
  if (/^(each other creature you control|other creatures you control)$/.test(s)) return {who: "allOther"};
  if (/^(each attacking creature|attacking creatures you control|attacking creatures)$/.test(s)) return {who: "attacking"};
  if (/^each other attacking creature$/.test(s)) return {who: "attackingOther"};
  const m = s.match(/^(?:each |all )?(other )?(.+?) you control$/);
  if (m) return {who: "each", phrase: m[2].replace(/\bcreatures\b/, "creature"), other: !!m[1]};
  return null;
}
const trKws = s => ptKwList(s);
function trActions2(e, selfName, have){
  const a = [];
  let m;
  const taken = [];   // spans already used, so one phrase isn't read twice
  const free = (i, len) => !taken.some(([s, t]) => i < t && s < i + len);
  const add = (x, mm) => { if (mm) { if (!free(mm.index, mm[0].length)) return; taken.push([mm.index, mm.index + mm[0].length]); x.i = mm.index; x.span = mm[0]; } a.push(x); };
  const N = w => w == null ? 1 : trNum(w);
  const isX = w => /^x$/i.test(String(w || "").trim());
  // pumps: "Target creature gets +3/+3 and gains trample until end of turn", "Creatures you control get +1/+0 until end of turn"
  const pumpRe = new RegExp("\\b" + TR_SUBJ + " (?:each )?gets? ([+-](?:\\d+|x))\\/([+-](?:\\d+|x))(?:,? and (?:gains?|ha(?:s|ve)) ([a-z ,]+?))? until end of turn(?: for each ([a-z ,]+?)(?=[.,;]|$)|,? where x is ([^.]+))?", "g");
  for (const mm of e.matchAll(pumpRe)) {
    const pp = mm[2], tt = mm[3], good = !/^-/.test(pp) || !/^-/.test(tt) && !/^-/.test(pp) ? !/^-/.test(tt) : false, w = trWho(mm[1], good && !/^-/.test(pp + tt));
    if (!w) continue;
    const xp = isX(pp.slice(1)), xt = isX(tt.slice(1)), kws = trKws(mm[4] || "");
    const sp = xp ? 0 : +pp, st = xt ? 0 : +tt;
    add(Object.assign({t: "pump", p: sp, tt: st, px: xp ? (pp[0] === "-" ? -1 : 1) : 0, tx: xt ? (tt[0] === "-" ? -1 : 1) : 0, kws, count: mm[5] ? "the number of " + mm[5] + (/you control|in your/.test(mm[5]) ? "" : " you control") : mm[6] || null,
      label: `${pp}/${tt}${kws.length ? " and " + kws.join(", ") : ""} until end of turn${w.who === "opp" ? " (to an opponent's creature)" : ""}`}, w), mm);
  }
  // the other order: "Creatures you control gain trample and get +X/+X until end of turn, where X is…" (Craterhoof Behemoth)
  const pumpRe2 = new RegExp("\\b" + TR_SUBJ + " (?:each )?gains? ([a-z ,]+?) and gets? ([+-](?:\\d+|x))\\/([+-](?:\\d+|x)) until end of turn(?: for each ([a-z ,]+?)(?=[.,;]|$)|,? where x is ([^.]+))?", "g");
  for (const mm of e.matchAll(pumpRe2)) {
    const pp = mm[3], tt = mm[4], good = !/^-/.test(pp) && !/^-/.test(tt), w = trWho(mm[1], good);
    if (!w) continue;
    const xp = isX(pp.slice(1)), xt = isX(tt.slice(1)), kws = trKws(mm[2] || "");
    add(Object.assign({t: "pump", p: xp ? 0 : +pp, tt: xt ? 0 : +tt, px: xp ? (pp[0] === "-" ? -1 : 1) : 0, tx: xt ? (tt[0] === "-" ? -1 : 1) : 0, kws, count: mm[5] ? "the number of " + mm[5] + (/you control|in your/.test(mm[5]) ? "" : " you control") : mm[6] || null,
      label: `${pp}/${tt}${kws.length ? " and " + kws.join(", ") : ""} until end of turn${w.who === "opp" ? " (to an opponent's creature)" : ""}`}, w), mm);
  }
  const gainRe = new RegExp("\\b" + TR_SUBJ + " (?:each )?(?:gains?|ha(?:s|ve)) ([a-z ,]+?) until end of turn", "g");
  for (const mm of e.matchAll(gainRe)) {
    const kws = trKws(mm[2]); if (!kws.length) continue;
    const w = trWho(mm[1], true); if (!w) continue;
    add(Object.assign({t: "pump", p: 0, tt: 0, kws, label: `Gains ${kws.join(", ")} until end of turn`}, w), mm);
  }
  // damage to creatures
  for (const mm of e.matchAll(/\bdeals? (\d+|x) damage to (each (?:other )?(?:non-?[a-z]+ |tapped |untapped |attacking |blocking )?creature(?: (?:and each (?:player|opponent|planeswalker)|with flying|without flying|you don't control|your opponents control|with power \d+ or less|that's attacking))?(?: and each (?:player|opponent|planeswalker))?|each creature and planeswalker(?: you don't control)?|each creature and each player|each other creature and each player|each player and each creature)/g)) {
    const scope = mm[2], opp = /you don't control|your opponents control/.test(scope), non = (scope.match(/\bnon-?([a-z]+) creature/) || [])[1];
    add({t: "dmgAll", n: N(mm[1]), x: isX(mm[1]), opp, other: /\bother\b/.test(scope), flying: /without flying/.test(scope) ? false : /with flying/.test(scope) ? true : null, pw: (scope.match(/power (\d+) or less/) || [])[1], players: /player/.test(scope), opps: /opponent/.test(scope) && !/control/.test(scope), non, tapped: /\btapped creature/.test(scope) ? true : /\buntapped creature/.test(scope) ? false : null,
      label: opp ? `${mm[1].toUpperCase()} damage to the opponent's creatures` : `${mm[1].toUpperCase()} damage to each${/other/.test(scope) ? " other" : ""} creature${/player/.test(scope) ? " and each player" : ""}`}, mm);
  }
  for (const mm of e.matchAll(/\bdeals? (\d+|x|damage equal to [^.]+?) (?:damage )?to (?:up to one |another )?target (creature|creature or planeswalker|planeswalker|attacking creature|blocking creature|attacking or blocking creature|creature an opponent controls|creature or planeswalker an opponent controls|creature you don't control|creature without flying|creature with flying|battle)(?! you control)/g))
    add({t: "oppNone", label: `Damage to ${/planeswalker|battle/.test(mm[2]) && !/creature/.test(mm[2]) ? "an opponent's " + mm[2] : "an opponent's creature"}`, what: "damage", tgt: /^\d+$|^x$/.test(mm[1]) ? {how: "damage", n: N(mm[1]), x: isX(mm[1]), phrase: /planeswalker/.test(mm[2]) && !/creature/.test(mm[2]) ? "planeswalker" : "creature"} : null}, mm);
  if ((m = e.match(/\bdeals? [^.]*?damage [^.]*?(?:among|to) (?:any number of |up to \w+ |one or two )?(?:other )?targets? ?(?:creatures?|permanents?)? (?:your opponents control|an opponent controls|you don't control)[^.]*/))) add({t: "oppNone", label: "Damage to the opponent's creatures (none on this table)", what: "damage"}, m);
  if ((m = e.match(/\beach of those creatures deals damage[^.]*/))) add({t: "oppNone", label: "Their creatures hit back (none here)", what: "damage"}, m);
  if ((m = e.match(/\bdeals? (\d+|x) damage to you\b/))) add({t: "life", n: -N(m[1]), x: isX(m[1]), label: `${m[1].toUpperCase()} damage to you`}, m);
  if ((m = e.match(/\bdeals? (\d+|x) damage to each player\b/))) add({t: "life", n: -N(m[1]), x: isX(m[1]), label: `${m[1].toUpperCase()} damage to you too`, note: "each player"}, Object.assign([m[0] + "\u0000"], {index: -1}));
  if ((m = e.match(/\b(?:you )?fights? (?:up to one )?(?:another )?target creature[^.]*|\btarget creature you control fights[^.]*/))) add({t: "oppNone", label: "Fight (no creature on the other side)", what: "fight"}, m);
  // destroy / exile / bounce everything
  for (const mm of e.matchAll(/\b(destroy|exile) (?:all|each) ((?:other )?[a-z ,/+\-0-9']*?(?:creatures?|artifacts?|enchantments?|planeswalkers?|lands?|permanents?|tokens?|battles?)(?: (?:with|that|you don't control|your opponents control|an opponent controls|of the chosen color)[a-z 0-9]*)?)(?=[.,;]|$| and (?!enchantments|artifacts|planeswalkers|lands))/g)) {
    if (/graveyard|library/.test(mm[2])) continue;
    add({t: "wipe", how: mm[1], phrase: mm[2], label: `${mm[1] === "destroy" ? "Destroy" : "Exile"} all ${mm[2]}`}, mm);
  }
  for (const mm of e.matchAll(/\bput all ([a-z ]*?creatures?|[a-z ]*?permanents?|[a-z ]*?artifacts?) on the (bottom|top) of their owners['’]? librar(?:y|ies)/g))
    add({t: "wipe", how: mm[2] === "top" ? "tucktop" : "tuck", phrase: mm[1], label: `Put all ${mm[1]} on the ${mm[2]} of the library`}, mm);
  for (const mm of e.matchAll(/\breturn (?:all|each) ((?:other |nonland )?[a-z ,]*?(?:creatures?|permanents?|artifacts?|enchantments?|lands?))((?: [a-z'’ ]*?)?) to (?:their|its) owners?['’]?s? hands?/g))
    add({t: "wipe", how: "bounce", phrase: mm[1] + mm[2], label: `Return all ${mm[1]}${mm[2]} to hand`}, mm);
  for (const mm of e.matchAll(/\b(destroy|exile|tap|untap) (?:(?:up to )?(one|two|three|x|\d+) )?(?:other |another )?target ([a-z ,'-]*?)(?=[.,;]|$| and | then| with | that | an opponent| you don't| it | if )((?: an opponent controls| you don't control| your opponents control| you control| you own)?)/g)) {
    if (mm[1] === "untap") continue;
    if (/\bcard\b|graveyard|spell/.test(mm[3])) { add({t: "oppNone", label: `${mm[1][0].toUpperCase() + mm[1].slice(1)} target ${mm[3]} (nothing there on this table)`, what: mm[1]}, mm); continue; }
    if (/you control|you own/.test(mm[4])) { add({t: "pickDo", how: mm[1], phrase: mm[3], n: N(mm[2]), label: `${mm[1][0].toUpperCase() + mm[1].slice(1)} your ${mm[3]}`}, mm); continue; }
    add({t: "oppNone", label: `${mm[1][0].toUpperCase() + mm[1].slice(1)} an opponent's ${mm[3].trim() || "permanent"}`, what: mm[1], tgt: {how: mm[1], phrase: mm[3].trim() || "permanent", n: N(mm[2])}}, mm);
  }
  for (const mm of e.matchAll(/\b(?:return|put) (?:up to (one|two|three|\d+) )?(?:other |another )?target ([a-z ,'-]*?(?:creature|permanent|artifact|enchantment|planeswalker|land|card|spell)s?)((?: an opponent controls| you don't control| you control| you own)?) (?:to its owner's hand|to their owners' hands|on (?:the )?(?:top|bottom) of (?:its|their) owners?['’]? librar(?:y|ies)|into its owner's library[^.]*)/g)) {
    if (/you control|you own/.test(mm[3])) { add({t: "pickDo", how: "bounce", phrase: mm[2], n: N(mm[1]), label: `Return your ${mm[2]} to your hand`}, mm); continue; }
    add({t: "oppNone", label: `Bounce an opponent's ${mm[2]}`, what: "bounce", tgt: /card|spell/.test(mm[2]) ? null : {how: /library/.test(mm[0]) ? "tuck" : "bounce", phrase: mm[2], n: N(mm[1])}}, mm);
  }
  if ((m = e.match(/\bcreatures your opponents control can't block(?: this turn)?/))) add({t: "oppAll", how: "noblock", label: "The opponents' creatures can't block this turn"}, m);
  if ((m = e.match(/\btarget creature (?:can't block|can't attack or block)(?: this turn)?(?=[.,]|$)/))) add({t: "oppNone", label: "An opponent's creature can't block this turn", what: "stop", tgt: {how: "noblock", phrase: "creature", n: 1}}, m);
  if ((m = e.match(/\btarget creature (?:can't block|doesn't untap|can't attack or block)[^.]*|\b(?:creatures your opponents control|target player|target opponent|each opponent|that player)[^.]*?can't (?:block|cast|gain life|attack)[^.]*/))) add({t: "oppNone", label: "Stops the opponent's creatures or plays (nothing to stop here)", what: "stop"}, m);
  if ((m = e.match(/\b(?:tap all creatures your opponents control|tap all creatures target player controls|creatures your opponents control (?:can't block|get -\d+\/-\d+)[^.]*)/))) { const sh = m[0].match(/get (-\d+)\/(-\d+)/); add({t: "oppAll", how: /can't block/.test(m[0]) ? "noblock" : sh ? "shrink" : "tap", p: sh ? +sh[1] : 0, tt: sh ? +sh[2] : 0, label: /can't block/.test(m[0]) ? "The opponents' creatures can't block this turn" : sh ? `The opponents' creatures get ${sh[1]}/${sh[2]}` : "Tap all the opponents' creatures"}, m); }
  // sacrifice and discard
  for (const mm of e.matchAll(/(?:^|[.,;] |\bthen |\band |\bto )(?:you )?(?:may )?(?:each player )?sacrifices? (a|an|one|two|three|x|\d+|another|that many) ((?:other |nontoken |non-[a-z]+ )*[a-z -]+?)(?=[.,;]|$| and | then| unless| of their| with | you control)(?! unless you pay)/g)) {
    if (/\bunless\b/.test(e.slice(mm.index + mm[0].length, mm.index + mm[0].length + 12))) continue;
    add({t: "sacYou", n: mm[1] === "another" ? 1 : N(mm[1]), other: mm[1] === "another" || /\bother\b/.test(mm[2]), phrase: mm[2].replace(/\bother\b/, "").trim(), may: /\bmay\b/.test(mm[0]), label: `Sacrifice ${mm[1] === "another" ? "another" : mm[1]} ${mm[2]}`}, mm);
  }
  if ((m = e.match(/\b(each opponent|target opponent|target player|each other player|defending player|that player|the defending player) (?:sacrifices|discards|mills|exiles|loses all|reveals)[^.]*(?:\. you (?:may )?(?:look at|choose) [^.]*)?(?:\. (?:that player|they) discards? [^.]*)?/))) {
    const sac = m[0].match(/\bsacrifices (a|an|one|two|that many) (creature|nonland permanent|permanent|creature or planeswalker)s?\b/);
    add({t: "oppNone", label: "The opponent " + m[0].replace(/^[a-z ]+? (sacrifices|discards|mills|exiles|loses all|reveals)/, "$1").split(". ")[0] + (sac ? "" : " (not tracked here)"), what: "opp", oppSac: sac ? {n: trNum(sac[1]) || 1, each: /^each/.test(m[1])} : null}, m);
  }
  if ((m = e.match(/\beach player (?:sacrifices|discards) /)) && !a.some(x => x.t === "sacYou")) {
    const mm = e.slice(m.index).match(/^each player (sacrifices|discards) (a|an|one|two|three|x|\d+) ([a-z ]+?)(?=[.,;]|$| and| of their)/);
    if (mm) add(mm[1] === "sacrifices" ? {t: "sacYou", n: N(mm[2]), phrase: mm[3], label: `You sacrifice ${mm[2]} ${mm[3]} too`} : {t: "discard", n: N(mm[2]), label: `You discard ${mm[2]} too`}, Object.assign(mm, {index: m.index}));
  }
  for (const mm of e.matchAll(/(?:^|[.,;] |\bthen |\band |\bmay )(?:you )?discards? (a|an|one|two|three|x|\d+|your hand|that many)( cards?)?( at random)?/g)) {
    if (/^(?:a|an) (?!card)/.test(mm[1] + (mm[2] || "")) && !mm[2]) continue;
    add({t: "discard", n: mm[1] === "your hand" ? 99 : N(mm[1]), hand: mm[1] === "your hand", random: !!mm[3], label: mm[1] === "your hand" ? "Discard your hand" : `Discard ${mm[1]}${mm[2] ? mm[2] : ""}${mm[3] || ""}`}, mm);
  }
  if ((m = e.match(/\b(?:its|their) controllers? (?:gains?|loses?|creates?|draws?|mills?|searches|may search|reveals?|puts?|investigates?|scry|returns?)[^.]*/))) add({t: "oppNone", label: "Its controller (the opponent) gets something back (not tracked)", what: "opp"}, m);
  if ((m = e.match(/\byou lose life equal to ([^.,;]+)/))) add({t: "life", n: -1, count: m[1], neg: true, label: `Lose life equal to ${m[1]}`}, m);
  if ((m = e.match(/\blook at the top (\w+) cards of your library,? then put them back in any order(?:\. you may shuffle)?/))) add({t: "lookBack", n: N(m[1]), label: `Look at the top ${m[1]} and order them`}, m);
  if ((m = e.match(/\bput (a|one|two|three|x|\d+) cards? from your hand on (?:the )?(top|bottom) of your library(?: in any order)?/))) add({t: "putBack", n: N(m[1]), where: m[2], label: `Put ${m[1]} card${N(m[1]) > 1 ? "s" : ""} from your hand on ${m[2]}`}, m);
  if ((m = e.match(/\bdistribute (\w+) \+1\/\+1 counters among (?:up to )?(one|two|three|one or two|\w+) target creatures?(?: you control)?/))) add({t: "distribute", n: N(m[1]), k: /two/.test(m[2]) ? 2 : N(m[2]), label: `Distribute ${m[1]} +1/+1 counters`}, m);
  if ((m = e.match(/\bsacrifice cardname unless you sacrifice (a|an) ([a-z ]+)/))) add({t: "sacUnless", phrase: m[2], label: `Sacrifice a ${m[2]} (or it)`}, m);
  if ((m = e.match(/\bcreate a number of (\d+)\/(\d+) ([a-z ]+?) creature tokens? equal to ([^.]+)/))) {
    const words = m[3].split(" "), colors = words.filter(w => TR_COLOR_WORD[w]).map(w => TR_COLOR_WORD[w]), nm = words.filter(w => !TR_COLOR_WORD[w] && w !== "colorless").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    add({t: "token", n: 1, count: m[4], def: {name: nm, type: `Token Creature — ${nm}`, power: m[1], toughness: m[2], colors, text: ""}, label: `Create ${m[1]}/${m[2]} ${nm}s equal to ${m[4]}`}, m);
  }
  if ((m = e.match(/\bexile the top card of (?:that player's|defending player's|each opponent's|target opponent's) library[^.]*(?:\. until end of turn, you may (?:cast|play) (?:that card|it|those cards)[^.]*)?/))) add({t: "oppNone", label: "Exile the top of the opponent's library (not tracked)", what: "opp"}, m);
  // spells and abilities with nothing to hit in a goldfish game
  if ((m = e.match(/\bcounter target (?:[a-z ]*?)(?:spell|ability)[^.]*/))) add({t: "oppNone", label: "Counter a spell (no opposing spell here)", what: "counter"}, m);
  if ((m = e.match(/\bgain control of (?:target|all|each)[^.]*/))) add({t: "oppNone", label: "Gain control (no opponent permanents here)", what: "steal"}, m);
  if ((m = e.match(/\bgoad (?:target|each|all|it|that)[^.]*/))) add({t: "oppNone", label: "Goad (no opponent creatures here)", what: "goad"}, m);
  if ((m = e.match(/\b(?:copy target (?:instant|sorcery|activated|triggered)[^.]*|copy that spell[^.]*)/))) add({t: "copySpell", label: "Copy the spell"}, m);
  // extra turns, the monarch, the initiative, dungeons, the Ring
  if ((m = e.match(/\btakes? (an|two|\d+) extra turns? after this one/))) add({t: "extraTurn", n: m[1] === "an" ? 1 : N(m[1]), label: "Take an extra turn"}, m);
  if ((m = e.match(/\byou become the monarch\b/))) add({t: "monarch", label: "Become the monarch"}, m);
  if ((m = e.match(/\byou take the initiative\b/))) add({t: "flagPT", k: "initiative", label: "Take the initiative"}, m);
  if ((m = e.match(/\bventure into the dungeon\b|\bthe ring tempts you\b|\bopen an attraction\b|\broll to visit your attractions\b|\btime travel\b|\bvote\b[^.]*|\bclash with an opponent\b|\bplaneswalk\b|\bassemble\b[^.]*|\bset in motion\b[^.]*|\bface a villainous choice\b[^.]*|\bfateseal \d+\b/)))
    add({t: "note", label: m[0][0].toUpperCase() + m[0].slice(1) + " (keep track by hand)"}, m);
  // mana
  for (const mm of e.matchAll(/\badd (((?:\{[wubrgcsx0-9/]+\})+)(?: or (?:\{[wubrgcsx0-9/]+\})+)*|one mana of any (?:one )?color|(?:one|two|three|x|that much) mana (?:of any (?:one )?color|in any combination of colors|of any type)[^.]*|an amount of [^.]+|x mana[^.]*|mana equal to [^.]*|\w+ mana of (?:any|that) [^.]*)/g))
    add({t: "mana", what: mm[1], label: `Add ${ptManaTxt(mm[1])}`}, mm);
  // graveyard to hand / battlefield
  for (const mm of e.matchAll(/\b(?:return|put) (?:up to (one|two|three|x|\d+) )?(?:(another|other) )?(?:target )?((?:[a-z-]+ )*?)(?:permanent )?cards? (?:with [^.]*? )?(?:and [^.]*? )?from your graveyard (?:to|onto|into) (the battlefield|your hand)( tapped)?(?: under your control)?/g)) {
    const words = mm[3].trim();
    if (/\bnamed\b/.test(words)) continue;
    const filt = (mm[0].match(/\bwith (mana value \d+ or less|power \d+ or less|mana value less than [^.]+?)(?= from)/) || [])[1];
    add({t: "fromGrave", n: N(mm[1]), upTo: !!mm[1], other: !!mm[2], phrase: words, filt, to: /battlefield/.test(mm[4]) ? "bf" : "hand", tapped: !!mm[5], label: `Return ${mm[1] ? "up to " + mm[1] : "a"} ${words || "card"}${filt ? " with " + filt : ""} from your graveyard to ${/battlefield/.test(mm[4]) ? "the battlefield" : "your hand"}`}, mm);
  }
  if ((m = e.match(/\breturn cardname from your graveyard to (the battlefield|your hand)( tapped)?/))) add({t: "selfFromGrave", to: /battlefield/.test(m[1]) ? "bf" : "hand", tapped: !!m[2], label: `Return ${selfName} from the graveyard`}, m);
  if ((m = e.match(/\breturn all ([a-z ,]*?)cards from your graveyard to (the battlefield|your hand)/))) add({t: "fromGrave", all: true, phrase: m[1].trim(), to: /battlefield/.test(m[2]) ? "bf" : "hand", label: `Return all ${m[1] || ""}cards from your graveyard`}, m);
  if ((m = e.match(/\bput (?:up to one )?target ([a-z ]*?)card from (?:a|your) graveyard onto the battlefield under your control/))) add({t: "fromGrave", n: 1, phrase: m[1], to: "bf", label: `Reanimate a ${m[1]}card`}, m);
  // searching that doesn't need a person: lands, and cards of a named type
  if ((m = e.match(/\bsearch your library for (?:up to (one|two|three|four|x|\d+) )?(a|an|one|two|three|x|\d+)? ?((?:basic |snow |nonbasic )?[a-z ,'/-]*?)(?: cards?)?( with [^,.]+?)?(?:, reveal (?:it|them|those cards|that card))?,? (?:and )?(?:put one onto the battlefield tapped and the other into your hand|put (?:it|them|that card|those cards|one of them|one) (onto the battlefield(?: tapped)?|into your hand|on top of your library|into your graveyard))(?:[^.]*?)(?:\.? then shuffle|\. shuffle|, then shuffle)?/))) {
    const ph = m[3].trim(), any = !ph || ph === "card";
    if (!any) {
      const split = /put one onto the battlefield tapped and the other into your hand/.test(m[0]);
      add({t: "searchAuto", n: m[1] ? N(m[1]) : N(m[2]), phrase: ph, filt: (m[4] || "").replace(/^ with /, ""), to: split ? "split" : /battlefield/.test(m[5]) ? "bf" : /hand/.test(m[5]) ? "hand" : /top/.test(m[5]) ? "top" : "grave", tapped: /tapped/.test(m[5] || "") || split,
        label: `Search for ${m[1] ? "up to " + m[1] : m[2] || "a"} ${ph}${m[4] || ""} → ${split ? "one to the battlefield tapped, one to hand" : (m[5] || "").replace(/^onto |^into |^on /, "")}`}, m);
    }
  }
  if ((m = e.match(/\byou may put (a|an|up to one|up to two|one) ((?:basic )?[a-z ]*?)land cards? from your hand onto the battlefield( tapped)?/))) add({t: "landHand", n: /two/.test(m[1]) ? 2 : 1, phrase: (m[2] + "land").trim(), tapped: !!m[3], label: `Put a ${m[2]}land from your hand onto the battlefield${m[3] || ""}`}, m);
  if ((m = e.match(/\byou may put (a|an) ([a-z ]+?) card from your hand onto the battlefield( tapped)?/)) && !/land/.test(m[2])) add({t: "landHand", n: 1, phrase: m[2], tapped: !!m[3], label: `Put a ${m[2]} from your hand onto the battlefield`}, m);
  // draw and life with counts
  if ((m = e.match(/\bdraws? (?:a card|cards) (?:for each ([^.,;]+)|equal to ([^.,;]+))/))) add({t: "draw", n: 1, count: m[1] ? "the number of " + m[1] : m[2], label: m[1] ? `Draw one per ${trSingular(m[1].split(" ")[0])}` : `Draw ${m[2]}`}, m);
  if ((m = e.match(/\b(?:you )?gain (?:(\d+|x) )?life (?:for each ([^.,;]+)|equal to ([^.,;]+))/))) add({t: "life", n: 1, per: m[1] ? N(m[1]) : 1, count: m[2] ? "the number of " + m[2] : m[3], label: m[2] ? `Gain ${m[1] || 1} life per ${trSingular(m[2].split(" ")[0])}` : `Gain life equal to ${m[3]}`}, m);
  if ((m = e.match(/\beach player loses (\d+|x) life/))) add({t: "life", n: -N(m[1]), x: isX(m[1]), label: `You lose ${m[1]} life too`}, m);
  if ((m = e.match(/\beach opponent loses (\d+|x) life and you gain (?:that much life|life equal to the life lost this way)/))) add({t: "drainSum", n: N(m[1]), x: isX(m[1]), label: `Drain ${m[1]}`}, m);
  if ((m = e.match(/\bdouble the number of ([+\-0-9/a-z ]+?) counters on (cardname|it|that creature|target creature(?: you control)?|each creature you control)/))) add({t: "doubleCtr", kind: {"+1/+1": "p1p1", "-1/-1": "m1m1"}[m[1]] || m[1], on: m[2], label: `Double the ${m[1]} counters`}, m);
  if ((m = e.match(/\bdouble (?:cardname's|target creature's|its) power/))) add({t: "pump", who: /target/.test(m[0]) ? "pick" : "self", doubleP: true, p: 0, tt: 0, kws: [], label: "Double its power until end of turn"}, m);
  if ((m = e.match(/\b(?:remove|heal) all damage (?:from|dealt to) ([^.]+)|\bdamage (?:dealt to|on) [^.]+? is healed/))) add({t: "heal", label: "Heal damage"}, m);
  if ((m = e.match(/\bregenerate (cardname|target creature|it)/))) add({t: "regen", on: m[1], label: "Regenerate (a shield)"}, m);
  // keyword actions (701) the table can do
  if ((m = e.match(/\bamass (?:([a-z]+) )?(\d+|x)\b/))) add({t: "amass", n: N(m[2]), x: isX(m[2]), type: m[1] && !/^\d/.test(m[1]) ? m[1][0].toUpperCase() + m[1].slice(1) : "Army", label: `Amass ${m[1] ? m[1] + " " : ""}${m[2]}`}, m);
  if ((m = e.match(/\bpopulate\b/))) add({t: "populate", label: "Populate"}, m);
  for (const mm of e.matchAll(/\b(cardname|it|target creature you control|that creature) connives\b/g)) add({t: "connive", on: mm[1], label: "Connive"}, mm);
  if ((m = e.match(/\badapt (\d+)/))) add({t: "adapt", n: +m[1], label: `Adapt ${m[1]}`}, m);
  if ((m = e.match(/\bmonstrosity (\d+|x)/))) add({t: "adapt", n: N(m[1]), x: isX(m[1]), monster: true, label: `Monstrosity ${m[1]}`}, m);
  if ((m = e.match(/\bbolster (\d+|x)/))) add({t: "bolster", n: N(m[1]), x: isX(m[1]), label: `Bolster ${m[1]}`}, m);
  if ((m = e.match(/\bsupport (\d+)/))) add({t: "support", n: +m[1], label: `Support ${m[1]}`}, m);
  if ((m = e.match(/\bmanifest dread\b/))) add({t: "manifest", dread: true, label: "Manifest dread"}, m);
  else if ((m = e.match(/\b(manifest|cloak) the top (?:(two|three|\d+) )?cards? of your library/))) add({t: "manifest", n: m[2] ? N(m[2]) : 1, cloak: m[1] === "cloak", label: `${m[1] === "cloak" ? "Cloak" : "Manifest"} the top card`}, m);
  if ((m = e.match(/\bincubate (\d+|x)/))) add({t: "incubate", n: N(m[1]), x: isX(m[1]), label: `Incubate ${m[1]}`}, m);
  for (const mm of e.matchAll(/\b(cardname|it|target creature you control|that creature) endures (\d+|x)/g)) add({t: "endure", on: mm[1], n: N(mm[2]), x: isX(mm[2]), label: `Endure ${mm[2]}`}, mm);
  if ((m = e.match(/\bforage\b/))) add({t: "forage", label: "Forage"}, m);
  if ((m = e.match(/\bsuspect (cardname|it|target creature|up to one target creature)/))) add({t: "flag", k: "suspected", on: m[1], label: "Suspect it (menace, can't block)"}, m);
  if ((m = e.match(/\brecruit\b/))) add({t: "recruit", label: "Recruit"}, m);
  if ((m = e.match(/\bblight (\d+)/))) add({t: "blight", n: +m[1], label: `Blight ${m[1]}`}, m);
  if ((m = e.match(/\bearthbend (\d+|x)/))) add({t: "earthbend", n: N(m[1]), x: isX(m[1]), label: `Earthbend ${m[1]}`}, m);
  if ((m = e.match(/\bairbend (?:up to one )?(?:other )?target [^.]*/))) add({t: "oppNone", label: "Airbend (no opposing permanent here)", what: "airbend"}, m);
  if ((m = e.match(/\bharness cardname\b/))) add({t: "flag", k: "harnessed", on: "cardname", label: "Harness it"}, m);
  if ((m = e.match(/\bcollect evidence (\d+)/))) add({t: "evidence", n: +m[1], label: `Collect evidence ${m[1]}`}, m);
  if ((m = e.match(/\bempower jace (\d+)/))) add({t: "note", label: `Empower Jace ${m[1]} (keep track by hand)`}, m);
  if ((m = e.match(/\blearn\b/))) add({t: "note", label: "Learn (discard-and-draw or a Lesson: do by hand)"}, m);
  if ((m = e.match(/\bexert (cardname|it)/))) add({t: "flag", k: "exerted", on: m[1], label: "Exert it (it won't untap next turn)"}, m);
  // tokens that come in attacking, and tokens attached to their Equipment (living weapon, For Mirrodin!, job select)
  if ((m = e.match(/\bcreate (?:a|an) (\d+)\/(\d+) ([a-z ]+?) creature token,? then attach cardname to it/))) {
    const words = m[3].split(" "), colors = words.filter(w => TR_COLOR_WORD[w]).map(w => TR_COLOR_WORD[w]), nm = words.filter(w => !TR_COLOR_WORD[w] && w !== "colorless").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    add({t: "attachTok", def: {name: nm, type: `Token Creature — ${nm}`, power: m[1], toughness: m[2], colors, text: ""}, label: `Create a ${m[1]}/${m[2]} ${nm} and attach it`}, m);
  }
  if ((m = e.match(/\bput cardname onto the battlefield attached to (?:target|a) creature[^.]*/))) add({t: "attachTo", label: "Attach it to a creature"}, m);
  if ((m = e.match(/\battach (cardname|it) to (?:target|up to one target|another target) creature(?: you control)?/))) add({t: "attachTo", label: "Attach it to a creature"}, m);
  // "you may cast target instant or sorcery card from a graveyard without paying its mana cost" (Impulsivity)
  if ((m = e.match(/\b(?:you may )?cast (?:target|up to one target) ([a-z ,]+?) card from (?:a|your) graveyard without paying its mana cost(?:\. if that (?:spell|card) would be put into (?:a|your) graveyard,? exile it instead)?/)))
    add({t: "castGy", phrase: m[1].replace(/\band\b/g, "or"), exile: /exile it instead/.test(m[0]), label: `Cast ${trA(m[1])} card from your graveyard for free`}, m);
  // impulse draw: "exile the top card of your library. You may play that card this turn / until the end of your next turn"
  if ((m = e.match(/\bexile the top (card|a card|two cards|three cards|four cards|five cards|x cards) of your library(?: face down)?\.? (?:(?:until (?:the )?end of (your next turn|turn|this turn)|until your next end step|this turn),? you may (?:play|cast) (?:that card|those cards|them|it|cards exiled this way|one of those cards)|you may (?:play|cast) (?:that card|those cards|it|them|one of those cards|cards exiled this way)(?: this turn| until (?:the )?end of (your next turn|turn)| until your next end step)?)/))) {
    const n0 = m[1] === "card" || m[1] === "a card" ? 1 : m[1] === "x cards" ? 1 : trNum(m[1].split(" ")[0]), next = /your next turn|next end step/.test(m[2] || m[3] || "") || /your next end step/.test(m[0]);
    add({t: "impulse", n: n0, x: m[1] === "x cards", next, label: `Exile the top ${n0 > 1 ? n0 + " cards" : "card"}; you may play ${n0 > 1 ? "them" : "it"} ${next ? "until the end of your next turn" : "this turn"}`}, m);
  }
  // things that need an opponent's spell or hand, which this table doesn't have
  if ((m = e.match(/\bcounter (?:target|that|up to one target|another target) (?:[a-z, ]+ )?(?:spell|ability)(?: [^.]*)?/))) add({t: "note", label: "Counter a spell (the opponents don't cast spells on this table)"}, m);
  if ((m = e.match(/\b(?:target|each) (?:opponent|player) reveals (?:their|his or her) hand[^.]*(?:\. you (?:may )?choose [^.]*)?(?:\. (?:that player|they) discards? [^.]*)?/))) add({t: "note", label: "Look at an opponent's hand (they have no cards on this table)"}, m);
  if ((m = e.match(/\b(?:target|each) opponent discards (?:a|one|two|three|that many|x) cards?(?: at random)?/))) add({t: "note", label: "An opponent discards (they have no cards on this table)"}, m);
  // "target player gains 3 life" (good, so it's you)
  if (!have.some(x => x.t === "life") && (m = e.match(/\b(?:target player|each player) gains (\d+|x) life\b/))) add({t: "life", n: N(m[1]), x: isX(m[1]), label: `Gain ${m[1]} life`}, m);
  // the card acting on itself: "return CARDNAME to its owner's hand", "sacrifice CARDNAME", "exile CARDNAME", "put CARDNAME on the bottom of its owner's library"
  if (!have.some(x => ["blink", "sacUnless", "delay"].includes(x.t))) {
    for (const mm of e.matchAll(/\b(?:you may )?(return cardname to (?:its owner's|your) hand|sacrifice cardname|exile cardname|put cardname on (?:the )?(top|bottom) of (?:its owner's|your) library|shuffle cardname into (?:its owner's|your) library)(?!:| unless| at the beginning| and return| then return|, then return)/g)) {
      const w = mm[1], to = /^return/.test(w) ? "hand" : /^sacrifice/.test(w) ? "sac" : /^exile/.test(w) ? "exile" : /^shuffle/.test(w) ? "shuffle" : mm[2] === "top" ? "top" : "bottom";
      add({t: "selfMove", to, label: {hand: "Return it to your hand", sac: "Sacrifice it", exile: "Exile it", top: "Put it on top of your library", bottom: "Put it on the bottom of your library", shuffle: "Shuffle it into your library"}[to]}, mm);
    }
  }
  // "CARDNAME deals damage equal to its power to any target / target creature"
  if ((m = e.match(/\b(?:cardname|it|that creature) deals damage equal to (?:its|cardname's) power to (any target|target creature or planeswalker|target creature|each opponent|target opponent|target player|that player|defending player|each creature)/)))
    add({t: "powDmg", to: m[1], label: `Damage equal to its power to ${m[1].replace(/^target /, "a ")}`}, m);
  return a;
}
// Modal spells and abilities: "Choose one —" with "•" modes (and Spree "+ {1} —" modes)
function trModes(text){
  const t = String(text || "");
  const m = t.match(/choose (one|two|three|one or both|one or more|any number|up to (?:one|two|three))(?: of them)?(?: that hasn't been chosen)? ?—/i);
  const spree = /^\+ \{/m.test(t);
  if (!m && !spree) return null;
  const lines = t.split("\n").filter(l => /^\s*[•+]/.test(l)).map(l => l.replace(/^\s*[•+]\s*(?:\{[^}]+\}(?:\{[^}]+\})*\s*—\s*)?/, "").trim());
  if (lines.length < 2) return null;
  const w = m ? m[1].toLowerCase() : "one or more";
  const pick = w === "two" ? 2 : w === "three" ? 3 : /one or both|one or more|any number/.test(w) ? 99 : 1;
  return {pick, lines, upTo: /^up to|any number|or more|or both/.test(w)};
}
