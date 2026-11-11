const PT_KW_SPECIAL = {"landwalk": "(?:non)?(?:basic )?(?:snow )?[a-z]*walk", "daybound and nightbound": "daybound|nightbound", "cycling": "(?:[a-z]+ ?)?cycling",
  "umbra armor": "umbra armor|totem armor", "∞ (infinity)": "∞", "start your engines!": "start your engines!?", "for mirrodin!": "for mirrodin!?"};
const PT_KW_RE = PT_KWDB.slice().sort((a, b) => b[1].length - a[1].length).map(([n, name, kind, rule]) => {
  const key = name.toLowerCase();
  return {n, name, kind, rule, key, re: new RegExp("^(?:" + (PT_KW_SPECIAL[key] || trEsc(key)) + ")(?=$|[\\s{—–:\\d-])", "i")};
});
const PT_KW_BY = new Map(PT_KW_RE.map(k => [k.key, k]));
const ptKwFind = s => { s = String(s || "").trim(); for (const k of PT_KW_RE) { const m = s.match(k.re); if (m) return {k, val: s.slice(m[0].length).trim()}; } return null; };
// a keyword's parameter: a number, a cost, "from red", "for artifacts", "— cost"…
const PT_KW_VAL_OK = /^$|^(?:\d+|x)\b|^[{—–-]|^(?:from|with|for|of|to)\b/i;
const PT_KW_FREE = new Set(["enchant", "partner", "companion", "landwalk", "affinity", "hexproof", "protection", "cycling", "ward", "equip", "fortify", "splice", "offering", "champion", "bands with other"]);
const ptKwCache = new Map();
// Keywords printed on the face that's up: "Flying, vigilance", "Equip {2}", "Ward—Pay 3 life.", "Exhaust — {3}: …"
function ptKwPrinted(c){
  const text = ptFaceText(c);
  if (ptKwCache.has(text)) return ptKwCache.get(text);
  const out = [];
  for (let line of text.split("\n")) {
    line = line.replace(/\([^)]*\)/g, "").trim(); if (!line) continue;
    const pieces = line.replace(/\.$/, "").split(/,\s*|;\s*/).map(s => s.trim()).filter(Boolean);
    const hits = pieces.map(ptKwFind);
    const ok = h => h && (PT_KW_VAL_OK.test(h.val) || PT_KW_FREE.has(h.k.key));
    const push = h => out.push({n: h.k.n, key: h.k.key, name: h.k.name, val: h.val});
    if (pieces.length > 1 && hits.every(ok)) hits.forEach(push);
    else if (ok(hits[0]) && (pieces.length === 1 || /^[{—–]/.test(hits[0].val) || /^\d/.test(hits[0].val))) push(hits[0]);
  }
  ptKwCache.set(text, out);
  return out;
}
// "flying, vigilance, and lifelink" → ["flying", "vigilance", "lifelink"]
function ptKwList(s){
  const out = [];
  for (const part of String(s || "").toLowerCase().replace(/["“”][^"“”]*["“”]/g, " ").split(/,\s*(?:and\s+)?|\s+and\s+|\s+or\s+/)) {
    const h = ptKwFind(part.trim().replace(/\.$/, "")); if (h && (PT_KW_VAL_OK.test(h.val) || PT_KW_FREE.has(h.k.key))) out.push(h.k.key);
  }
  return out;
}
// What an Aura or Equipment gives the creature it's attached to
function ptAttachBonus(a){
  const t = ptFaceText(a).replace(/\([^)]*\)/g, "");
  // "Equipped creature gets +X/+1, where X is the number of artifacts you control" / "+1/+1 for each …"
  const xm = t.match(/(?:equipped|enchanted) creature gets ([+-](?:\d+|x))\/([+-](?:\d+|x))(?: for each ([^.,\n]+)|,? where x is ([^.\n]+))/i);
  if (xm) {
    let k = 0; try { k = ptCount((xm[3] || xm[4]).toLowerCase(), {src: {card: a}}); } catch (e) { k = 0; }
    const v = s => /x/i.test(s) ? (s[0] === "-" ? -k : k) : xm[3] ? +s * k : +s;
    const rest = t.match(/(?:equipped|enchanted) creature (?:gets [^.\n]*? and )?(?:has|gains) ([^.\n]+)/i);
    return {p: v(xm[1]), t: v(xm[2]), kws: rest ? ptKwList(rest[1]) : []};
  }
  const m = t.match(/(?:equipped|enchanted|fortified) (?:creature|permanent|land)(?: gets ([+-]\d+)\/([+-]\d+))?(?: and)? (?:has|gains|have) ([^.\n]+)/i) || t.match(/(?:equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+)/i);
  return {p: m && m[1] ? +m[1] : 0, t: m && m[2] ? +m[2] : 0, kws: m && m[3] ? ptKwList(m[3]) : []};
}
// Every keyword a card has right now: printed, counters (flying counter…), until end of turn, its equipment and auras,
// and the ones other permanents give ("Creatures you control have haste", "Other Elves you control have deathtouch")
function ptKws(c){
  const out = new Map(), add = (key, from, val) => { if (key && !out.has(key)) out.set(key, {key, from, val: val || ""}); };
  if (!c) return out;
  if (c.faceDown) { if (c.cloak) add("ward", "cloak", "{2}"); return out; }
  for (const k of ptKwPrinted(c)) add(k.key, "own", k.val);
  for (const k of Object.keys(c.kw || {})) if (c.kw[k]) add(k, "you");
  for (const k of Object.keys(c.counters || {})) { const kk = k.replace(/-/g, " "); if (PT_KW_BY.has(kk) && kk !== "level up") add(kk, "counter"); }
  if (c.haste) add("haste", "effect");
  for (const k of (c.eot && c.eot.kw) || []) add(k, "until end of turn");
  if (!PT) return out;
  const live = PT.bf.includes(c);
  if (live || c.snap || PT.bf.some(b => b.uid === c.uid)) {
    const cre = ptIsCreature(c);
    for (const g of ptMods().grants) {
      if (g.src === c.uid && g.other) continue;
      if (g.cre && !cre) continue;
      if (g.tokOnly && !c.token) continue;
      if (g.nontoken && c.token) continue;
      if (g.attacking && !(PT.combat || []).includes(c.uid)) continue;
      if (g.phrase && !trFits(g.phrase, c)) continue;
      g.kws.forEach(k => add(k, g.srcName));
    }
  }
  if (live) for (const a of PT.bf) if (a.att === c.uid && !a.faceDown) ptAttachBonus(a).kws.forEach(k => add(k, ptFaceName(a)));
  return out;
}

/* ----- power and toughness ----- */
const ptSelfPumpCache = new Map();
function ptStats(c){
  if (!c) return null;
  let p = parseInt(c.power), t = parseInt(c.toughness);
  if (c.proto) [p, t] = c.proto;
  if (c.anim) { p = c.anim.p; t = c.anim.t; }
  if (c.faceDown) { p = 2; t = 2; }
  if (c.eot && c.eot.set) [p, t] = c.eot.set;
  if (isNaN(p) || isNaN(t)) {
    // characteristic-defining power ("*"): Tarmogoyf-style counts are guessed from what the table can see
    const cd = ptCdaPT(c); if (!cd) return null; [p, t] = cd;
  }
  const cs = c.counters || {}, d = (cs.p1p1 || 0) - (cs.m1m1 || 0), [ap, at] = ptAnthemOf(c);
  p += d + ap; t += d + at;
  if (c.eot) { p += c.eot.p || 0; t += c.eot.t || 0; }
  { const ft = ptFaceText(c), key = c.name + "|" + ft; let own = ptSelfPumpCache.get(key);
    if (own === undefined) { own = /\bfor each\b/.test(ft) ? trLower(c, ft).match(/\b(?:cardname|this token|this creature) gets ([+-]\d+)\/([+-]\d+) for each ([^.]+)/) : null; if (ptSelfPumpCache.size > 2000) ptSelfPumpCache.clear(); ptSelfPumpCache.set(key, own); }
    if (own && PT) { let k = 0; try { k = ptCount(own[3], {src: {card: c}}); } catch (e) { k = 0; } p += +own[1] * k; t += +own[2] * k; } }
  if (PT && PT.bf.includes(c)) for (const a of PT.bf) if (a.att === c.uid && !a.faceDown) { const b = ptAttachBonus(a); p += b.p; t += b.t; }
  return [p, t];
}
// "Its power and toughness are each equal to the number of creatures you control" and friends
function ptCdaPT(c){
  const t = ptFaceText(c).toLowerCase();
  let m = t.match(/(?:its )?power (?:and toughness are each|is) equal to ([^.]+)/);
  if (!m) return null;
  const n = ptCount(m[1].replace(/\s*(?:plus|\+) \d+$/, ""), {src: c});
  const both = /power and toughness are each/.test(m[0]);
  const tt = both ? n : parseInt(c.toughness);
  const plus = (m[1].match(/(?:plus|\+) (\d+)$/) || [])[1];
  return [n + (plus ? +plus : 0), isNaN(tt) ? n : tt + (both && plus ? +plus : 0)];
}
const ptPow = c => { const s = ptStats(c); return s ? s[0] : 0; };
const ptTou = c => { const s = ptStats(c); return s ? s[1] : 0; };

/* ----- counting: "the number of Elves you control", "cards in your hand", "its power"… ----- */
function ptCount(expr, ctx){
  if (!PT) return 0;
  let e = String(expr || "").toLowerCase().trim().replace(/[.,;]$/, "").replace(/^(?:the )?/, "");
  e = e.replace(/^number of /, "");   // every pattern below reads the same with or without "the number of"
  if (/^(?:life lost this way|damage dealt this way)$/.test(e)) return PT.lastLost || 0;   // a drain: what the opponents lost just before
  if (/^(?:number of )?opponents you have$/.test(e)) return PT.opps ? ptLiveOpps().length : 1;
  if (/^(?:number of )?differently named lands you control$/.test(e)) return new Set(PT.bf.filter(c => ptIsLand(c) && !c.faceDown).map(c => c.name)).size;
  if (/^(?:number of )?colors among permanents you control$/.test(e)) return new Set(PT.bf.filter(c => !c.faceDown).flatMap(c => c.colors || [])).size;
  { const nm = e.match(/^(?:number of )?(other )?creatures you control named (.+)$/); if (nm) { const srcC = ctx && ctx.src ? (ctx.src.card || ctx.src) : null; const name = nm[2] === "cardname" && srcC ? srcC.name : nm[2]; return PT.bf.filter(c => ptIsCreature(c) && c.name.toLowerCase() === String(name).toLowerCase() && !(nm[1] && srcC && c.uid === srcC.uid)).length; } }
  const src = ctx && ctx.src ? (ctx.src.card || ctx.src) : null, it = ctx && ctx.it ? (ctx.it.card || ctx.it) : null, p = ctx && ctx.p;
  let m;
  if (/^(?:x|that much|that many)$/.test(e)) return p && p.amount != null ? p.amount : 1;
  if ((m = e.match(/^(\d+)$/))) return +m[1];
  if ((m = e.match(/^twice (.+)$/))) return 2 * ptCount(m[1], ctx);
  if ((m = e.match(/^half (.+?)(?:, rounded (up|down))?$/))) { const v = ptCount(m[1], ctx) / 2; return m[2] === "up" ? Math.ceil(v) : Math.floor(v); }
  if ((m = e.match(/^(.+?) plus (\d+|one|two|three)$/))) return ptCount(m[1], ctx) + trNum(m[2]);
  if ((m = e.match(/^(.+?) minus (\d+|one|two|three)$/))) return Math.max(0, ptCount(m[1], ctx) - trNum(m[2]));
  if (/^your life total$/.test(e)) return PT.life;
  if (/^(?:your|the) speed$/.test(e)) return PT.speed || 0;
  if (/^(?:the number of )?cards in your hand$/.test(e)) return PT.hand.length;
  if (/^(?:the number of )?cards in your library$/.test(e)) return PT.lib.length;
  if (/^(?:the number of )?opponents you have$/.test(e)) return 1;
  if (/^(?:the number of )?(?:spells|other spells) you've cast (?:before it )?this turn$/.test(e)) return Math.max(0, (PT.castN || 0) - (/other|before/.test(e) ? 1 : 0));
  if ((m = e.match(/^(?:its|cardname's|that creature's|this creature's|the sacrificed creature's|the exiled card's|that card's|equipped creature's|enchanted creature's) (power|toughness|mana value)$/))) {
    const who = /^(?:its|that|the)/.test(e) ? (it || src) : /equipped|enchanted/.test(e) ? (src && src.att != null ? (ptFind(src.att) || {}).card : null) : src;
    if (!who) return 0; return m[1] === "power" ? ptPow(who) : m[1] === "toughness" ? ptTou(who) : (who.cmc || 0);
  }
  if ((m = e.match(/^(?:the )?greatest (power|toughness|mana value) among (.+?) you control$/))) {
    const list = PT.bf.filter(c => trFits(m[2], c)); return list.reduce((mx, c) => Math.max(mx, m[1] === "power" ? ptPow(c) : m[1] === "toughness" ? ptTou(c) : (c.cmc || 0)), 0);
  }
  if ((m = e.match(/^(?:the )?total power of (.+?) you control$/))) return PT.bf.filter(c => trFits(m[1], c) && ptIsCreature(c)).reduce((t, c) => t + Math.max(0, ptPow(c)), 0);
  if ((m = e.match(/^your devotion to ((?:white|blue|black|red|green)(?: and (?:white|blue|black|red|green))?)$/))) {
    const cols = m[1].split(" and ").map(w => TR_COLOR_WORD[w]);
    return PT.bf.reduce((t, c) => t + (String(c.cost || "").match(/\{[^}]+\}/g) || []).filter(s => cols.some(k => s.includes(k))).length, 0);
  }
  if ((m = e.match(/^(?:the number of )?(?:([a-z ,-]+?) )?cards? in your graveyard$/))) return PT.grave.filter(c => !m[1] || trFits(m[1], c)).length;
  if ((m = e.match(/^(?:the number of )?card types among cards in your graveyard$/))) return ptCardTypes(PT.grave);
  if ((m = e.match(/^(?:the number of )?(?:basic land types|colors) among (.+?) you control$/))) {
    if (/colors/.test(e)) return new Set(PT.bf.filter(c => trFits(m[1], c)).flatMap(c => c.colors || [])).size;
    return new Set(PT.bf.filter(c => trFits(m[1], c)).flatMap(c => (ptFaceType(c).match(/\b(Plains|Island|Swamp|Mountain|Forest)\b/g) || []))).size;
  }
  if ((m = e.match(/^(?:the number of )?(.+?) counters on (cardname|it|that creature|this creature)$/))) {
    const who = m[2] === "cardname" || m[2] === "this creature" ? src : (it || src), k = {"+1/+1": "p1p1", "-1/-1": "m1m1"}[m[1]] || m[1];
    return who && who.counters ? (who.counters[k] || 0) : 0;
  }
  if ((m = e.match(/^(?:the number of )?(.+?) (?:you control|on the battlefield)$/))) {
    let ph = m[1].replace(/^(?:other )/, "");
    const other = /^other /.test(m[1]);
    const tapped = /\buntapped\b/.test(ph) ? false : /\btapped\b/.test(ph) ? true : null;
    ph = ph.replace(/\b(?:un)?tapped\b/g, " ").replace(/\battacking\b/g, " ").trim();
    return PT.bf.filter(c => !(other && src && c.uid === src.uid) && (tapped === null || !!c.tapped === tapped) && (!/attacking/.test(m[1]) || (PT.combat || []).includes(c.uid)) && trFits(ph, c)).length;
  }
  if ((m = e.match(/^(?:the number of )?(.+?) (?:you've cast|that entered|that died) this turn$/))) return /cast/.test(e) ? (PT.castN || 0) : /died/.test(e) ? (PT.diedN || 0) : 0;
  return 0;
}
const ptCardTypes = list => new Set(list.flatMap(c => (ptFaceType(c).split("—")[0].match(/\b(Artifact|Battle|Creature|Enchantment|Instant|Kindred|Land|Planeswalker|Sorcery|Tribal)\b/g) || []))).size;

/* ----- "if …" conditions the table can check ----- */
// returns true / false, or null when it can't tell (then a person decides)
function trEvalIf(cond, ctx){
  if (!PT) return null;
  let c = String(cond || "").toLowerCase().trim().replace(/^if\s+/, "").replace(/[.,]$/, "");
  const src = ctx && ctx.src ? (ctx.src.card || ctx.src) : null, ev = ctx && ctx.e ? ctx.e.snap : null;
  let m;
  const cnt = w => w === "no" ? 0 : trNum(w);
  if ((m = c.match(/^(.+?) and (.+)$/)) && !/\bor\b/.test(c)) { const a = trEvalIf(m[1], ctx), b = trEvalIf(m[2], ctx); return a === false || b === false ? false : a === null || b === null ? null : true; }
  if (/^(?:it|this spell|cardname) was kicked/.test(c)) return !!(src && src.kicked);
  if (/^(?:it|this spell|cardname) was(?:n't| not) kicked/.test(c)) return !(src && src.kicked);
  if (/^(?:its|the|this spell's|cardname's) (offspring|gift|bargain|squad|spectacle|surge|prowl|freerunning) cost was paid|^(?:it|this spell) was bargained|^the gift was promised/.test(c)) return !!(src && (src.paid || {})[(c.match(/offspring|gift|bargain|squad|spectacle|surge|prowl|freerunning/) || [])[0]]);
  if (/^(?:it|cardname) (?:was cast|entered) from your hand/.test(c)) return !!(src && src.fromHand);
  if (/^(?:it|cardname|this creature|this permanent|they) (?:isn't|is not|wasn't|was not|aren't|are not) (?:a )?tokens?/.test(c) || /^(?:they're|it's) not (?:a )?tokens?/.test(c)) return !(src && src.token);
  if (/^(?:it|cardname|this creature|this permanent) (?:is|was) a token/.test(c)) return !!(src && src.token);
  if (/^you cast it|^it was cast|^cardname was cast/.test(c)) return !!(src && src.wasCast);
  if (/^you didn't cast it|^it wasn't cast/.test(c)) return !(src && src.wasCast);
  if (/^it's your turn|^it is your turn/.test(c)) return true;
  if (/^it's not your turn|^it isn't your turn|^it is not your turn/.test(c)) return false;
  if (/^you attacked(?: with (?:a|one or more) creatures?)? this turn/.test(c)) return PT.attackedTurn === PT.turn;
  if (/^(?:a|another) creature died this turn/.test(c)) return PT.diedTurn === PT.turn;
  if (/^you gained life this turn/.test(c)) return PT.gainedTurn === PT.turn;
  if (/^(?:an opponent|one or more opponents) lost life this turn/.test(c)) return PT.oppLostTurn === PT.turn;
  if (/^an opponent was dealt damage this turn/.test(c)) return PT.oppLostTurn === PT.turn;
  if ((m = c.match(/^you(?:'ve)? cast (another|two or more|three or more|\w+ or more) spells? this turn/))) return (PT.castN || 0) >= (m[1] === "another" ? 2 : cnt(m[1].split(" ")[0]));
  if (/^you're the monarch|^you are the monarch/.test(c)) return !!PT.monarch;
  if (/^you have the initiative/.test(c)) return !!PT.initiative;
  if (/^you have an enduring story/.test(c)) return !!PT.story;
  if ((m = c.match(/^your speed is (\d+)/))) return (PT.speed || 0) >= +m[1];
  if ((m = c.match(/^you have (\d+|\w+) or (more|less|fewer) life/))) return m[2] === "more" ? PT.life >= cnt(m[1]) : PT.life <= cnt(m[1]);
  if ((m = c.match(/^you have at least (\d+|\w+) life/))) return PT.life >= cnt(m[1]);
  if ((m = c.match(/^you have (no|one or more|\w+ or more|\w+ or fewer) cards? in (?:your )?hand/))) { const n = PT.hand.length; return m[1] === "no" ? n === 0 : /fewer/.test(m[1]) ? n <= cnt(m[1].split(" ")[0]) : n >= cnt(m[1].split(" ")[0]); }
  if ((m = c.match(/^(?:there are )?(\w+) or more cards (?:are )?in your graveyard/))) return PT.grave.length >= cnt(m[1]);
  if ((m = c.match(/^there are (\w+) or more card types among cards in your graveyard|^(\w+) or more card types among cards in your graveyard/))) return ptCardTypes(PT.grave) >= cnt(m[1] || m[2]);
  if (/^you have more life than (?:an|each) opponent|^an opponent has less life than you/.test(c)) { const l = ptLiveOpps().map(o => o.life); return l.length ? PT.life > (/each opponent/.test(c) ? Math.max(...l) : Math.min(...l)) : false; }
  if (/^an opponent has more life than you|^you have less life than an opponent/.test(c)) return ptLiveOpps().some(o => o.life > PT.life);
  if (/^defending player has the most life or is tied for most life|^(?:an opponent|that player) has the most life/.test(c)) return ptLiveOpps().some(o => o.life >= PT.life);
  if (/^you control your commander|^you control a commander/.test(c)) return PT.bf.some(x => x.commander);
  if ((m = c.match(/^you control (a|an|another|one or more|two or more|three or more|four or more|five or more|six or more|seven or more|eight or more|\d+ or more|no|exactly \w+) (.+?)(?: other than cardname)?$/))) {
    const other = m[1] === "another" || /\bother\b/.test(m[2]), ph = m[2].replace(/\bother\b/g, " ").replace(/\s+with (?!power|mana value).*$/, "").trim();
    if (/\bor\b|\band\b/.test(ph) && /,/.test(ph)) return null;
    const n = PT.bf.filter(x => !(other && src && x.uid === src.uid) && !x.faceDown && trFits(ph, x)).length;
    if (m[1] === "no") return n === 0;
    if (/^exactly/.test(m[1])) return n === cnt(m[1].split(" ")[1]);
    return n >= (["a", "an", "another", "one or more"].includes(m[1]) ? 1 : cnt(m[1].split(" ")[0]));
  }
  if ((m = c.match(/^you don't control (?:a|an|any) (.+)$/))) return !PT.bf.some(x => !x.faceDown && trFits(m[1], x));
  if (/^(?:that creature|it) has greater power or toughness than cardname/.test(c) && ev && src) return ptPow(ev) > ptPow(src) || ptTou(ev) > ptTou(src);
  if (/^the amount of mana spent to cast that spell is greater than cardname's power or (?:cardname's )?toughness/.test(c) && ev && src) return (ev.cmc || 0) > ptPow(src) || (ev.cmc || 0) > ptTou(src);
  if (/^cardname (?:isn't|is not) renowned/.test(c)) return !(src && src.renowned);
  if (/^it doesn't have the same name as another creature you control or a creature card in your graveyard/.test(c) && ev) return !PT.bf.some(x => x.uid !== ev.uid && ptIsCreature(x) && x.name === ev.name) && !PT.grave.some(x => ptIsCreature(x) && x.name === ev.name);
  if (/^cardname is in the command zone or on the battlefield/.test(c)) return !!src && (PT.cmd.some(x => x.uid === src.uid) || PT.bf.some(x => x.uid === src.uid));
  if (/^cardname is (?:untapped)/.test(c)) return !(src && src.tapped);
  if (/^cardname is tapped/.test(c)) return !!(src && src.tapped);
  if (/^cardname is a creature|^it's a creature/.test(c)) return !!(src && ptIsCreature(src));
  if (/^cardname came under your control since the beginning of your last upkeep/.test(c)) return !!(src && src.since === PT.turn - 1);
  if ((m = c.match(/^x is (\d+) or (?:more|greater)/))) return (ctx && ctx.p ? ptXOf(ctx.p) : 0) >= +m[1];
  if ((m = c.match(/^(?:it|that card|the revealed card|that creature|the card) (?:is|was) (?:a|an) (.+?)(?: card)?$/)) && ev) return trFits(m[1], ev);
  if (/^you control (?:the )?(?:most|more) /.test(c) || /^an opponent controls/.test(c)) return /^an opponent controls/.test(c) ? false : true;   // the opponent here has no permanents
  return null;
}
// Strip a leading "if …," the table can check. Returns {ok: true/false/null, rest, cond}
function trIfClause(eff, ctx){
  const m = String(eff || "").match(/^if ([^,]+?), (.*)$/s);
  if (!m) return {ok: null, rest: eff, cond: ""};
  return {ok: trEvalIf(m[1], ctx), rest: m[2], cond: m[1]};
}
// "…. If you control an Elf, draw a card." inside a spell or effect: keep the parts whose condition holds, drop the rest
function trResolveIfs(text, ctx){
  let unknown = false;
  const out = String(text || "").split(/(?<=\.)\s+/).map(s => {
    const m = s.match(/^(?:then )?if ([^,]+?), (.*)$/s);
    if (!m) return s;
    if (/\binstead\b/.test(m[2])) { const r = trEvalIf(m[1], ctx); if (r === false) return ""; if (r === true) return "\u0001" + m[2].replace(/\s*instead\.?$/, "."); unknown = true; return s; }
    const r = trEvalIf(m[1], ctx);
    if (r === true) return m[2]; if (r === false) return "";
    unknown = true; return s;
  });
  // "Create a token that's a copy… If this spell was kicked, create five of those tokens instead."
  for (let i = 1; i < out.length; i++) if (out[i].startsWith("\u0001")) {
    const rep = out[i].slice(1), many = rep.match(/^create (\w+) of those tokens/);
    out[i - 1] = many ? out[i - 1].replace(/\bcreate (?:a|an|one) (token|tokens)\b/, `create ${many[1]} tokens`) : rep; out[i] = "";
  }
  const text2 = out.join(" ").replace(/\s+/g, " ").trim();
  return {text: text2, unknown};
}

