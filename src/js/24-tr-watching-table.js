/* ---------------- trigger helper: watching the table ----------------
   Table actions raise events (a card enters, you cast a spell, a creature dies, your upkeep starts…). After each
   action, every card on the battlefield (and the card the event is about) is checked for abilities that fit. Each
   one becomes a prompt in the trigger tray: Do it (for the simple parts it understands), Skip, or Mute that card. */
let PT_EV = [];
const ptMode = () => prefs.ptTrigMode || (prefs.ptTrig === false ? "off" : "auto");   // auto | ask | off
const PT_STEP_EVENTS = new Set(["upkeep", "endstep", "combat", "drawstep", "main", "gainlife", "loselife", "landplay", "draw", "opploss", "discard", "activate"]);
function ptSnap(c){ return {snap: true, cost: c.cost, att: c.att, paid: c.paid, xPaid: c.xPaid, castFace: c.castFace, overloaded: c.overloaded, entwined: c.entwined, loyalty: c.loyalty, renowned: c.renowned, eot: c.eot, uid: c.uid, name: c.name, type: c.type, colors: c.colors, cmc: c.cmc, back: !!c.back, token: !!c.token, commander: !!c.commander, power: c.power, toughness: c.toughness, text: c.text, img: c.img, blitz: !!c.blitz, kicked: !!c.kicked, counters: Object.assign({}, c.counters || {}), kw: Object.assign({}, c.kw || {})}; }
function ptEmit(ev, card, extra){
  if (!PT || PT.phase !== "play" || ptMode() === "off") return;
  if (card && card.faceDown) return;
  PT_EV.push(Object.assign({ev, uid: card ? card.uid : null, snap: card ? ptSnap(card) : null}, extra || {}));
}
const PT_KIND = {etb: "Enters", cast: "Cast", dies: "Dies", ltb: "Leaves", attack: "Attacks", attackers: "Attack", combatdmg: "Combat damage", upkeep: "Upkeep", endstep: "End step",
  combat: "Beginning of combat", lore: "Chapter", ability: "Ability", loyalty: "Loyalty", copy: "Copy", ctr: "Counters", discard: "Discard", cycle: "Cycle", attackalone: "Attacks alone", suspend: "Suspend", paradigm: "Paradigm", storm: "Storm", miracle: "Miracle", activate: "Activated", crewed: "Crewed", monstrous: "Monstrous", drawstep: "Draw step", main: "Main phase", draw: "Draw", gainlife: "Life gained", loselife: "Life lost", token: "Token made", landplay: "Land played", spell: "Spell",
  sac: "Sacrificed", evoke: "Evoke", delayed: "End step", blitz: "Blitz", persist: "Persist", undying: "Undying", opploss: "Opponent lost life",
  rebound: "Rebound", cascade: "Cascade", clone: "Enters as a copy", commander: "Commander"};
// A double-faced card's text for the face that's up (Eirdu on the front, Isilu once transformed)
function ptFaceText(c){
  const t = String(c.text || "");
  if (!(c.name || "").includes(" // ") || !t.includes("\n\n")) return t;
  const faces = t.split("\n\n");
  return c.back ? faces.slice(1).join("\n\n") : faces[0];
}
// Does a card have persist / undying: printed on it, given by a card on the battlefield (Mikaeus, Cauldron-style "creatures you control have persist"), or switched on by hand
function ptHasKw(c, kw){
  const k = ptKws(c).get(kw); if (!k) return null;
  if ((kw === "persist" || kw === "undying") && k.from === "counter") return null;
  return k.from === "own" ? "own" : k.from === "you" ? "you" : k.from;
}
function ptCondFits(cond, e, src){
  if (e.selfOnly && !(cond.who === "self" || cond.who === "selfOrOther")) return false;
  if (cond.ev === "lore") return e.ev === "lore" && e.uid === src.uid && e.n === cond.n;
  if (cond.ev === "ctr" && e.ev === "ctr" && cond.who === "self") return e.uid === src.uid;
  if (cond.ev === "attackers") return e.ev === "attack" && e.first;
  if (cond.ev !== e.ev) return false;
  if (cond.nth && e.nth !== cond.nth) return false;
  if (PT_STEP_EVENTS.has(cond.ev)) return true;
  const c = e.snap; if (!c) return false;
  if (cond.ev === "token") return trFits(cond.phrase || "", c);
  // a spell you cast is on the stack, not the battlefield, so it can't trigger its own "whenever you cast" ability
  if (cond.ev === "cast" && cond.who !== "self") return c.uid !== src.uid && trFits(cond.phrase || "", c);
  const self = c.uid === src.uid;
  if (cond.who === "self") return self;
  if (cond.who === "attached") return src.att != null ? c.uid === src.att : !!e.first;   // the creature it's attached to
  if (cond.who === "other" && self) return false;
  if (cond.who === "selfOrOther" && self) return true;
  if (cond.nontoken && c.token) return false;
  if (cond.tokenOnly && !c.token) return false;
  return trFits(cond.phrase, c);
}
let ptTrigId = 0;
// Simple: every part is something it can do without asking (no window to open, no target to pick, no "if")
function ptSimple(p){
  if (p.modes || p.choice) return false;
  if (p.actions.some(ptNeedsPick)) return false;
  if (!p.actions.length || p.conditional) return false;
  if (p.evoke) return !PT.trig.some(x => x !== p && x.srcUid === p.srcUid);   // let its own enter triggers go first
  if (p.kind === "delayed") return !p.unless;
  if (p.eff != null && !trCovered(p.eff, p.actions)) return false;   // it only understood part of it
  const auto = ptAuto();
  return p.actions.every(a => {
    if (a.t === "scry") return auto;
    if (a.t === "dig") return auto && a.auto;
    if (["search", "grave", "becomecopy"].includes(a.t)) return auto && a.t === "becomecopy";
    if (a.t === "sacYou" && a.may) return false;
    if (a.target || a.on === "target" || a.who === "pick" || (a.t === "copy" && a.of === "target") || a.t === "pickDo") return auto;
    return true;
  });
}
let ptAutoRecent = [], ptAutoTimer = null;
function ptRunTriggers(){
  if (!PT || ptMode() === "off") { PT_EV = []; return; }
  let guard = 0, autoN = 0;
  const auto = ptMode() === "auto" && !(PT.chain && PT.chain.paused), done = [];
  while (guard++ < 600) {
    if (!PT_EV.length) {
      if (ptSBA()) continue;   // state-based actions first (rule 704): what dies can set off more triggers
      // Auto: do the oldest new simple trigger; whatever it does can set off more triggers, so go round again
      const p = auto ? PT.trig.find(x => x.fresh && (ptSimple(x) || ptPartial(x))) : null;
      if (!p) break;
      if (autoN >= 80) { PT.chain = {paused: true, ran: (PT.chain && PT.chain.ran || 0) + autoN}; break; }   // a big (maybe endless) chain: pause and ask
      if (PT.won && p.actions.every(a => ["opp", "life"].includes(a.t))) { PT.trig = PT.trig.filter(x => !(x.fresh && x.actions.every(a => ["opp", "life"].includes(a.t)))); ptLog("The combo loops: your opponent is out of life."); break; }
      PT.trig.splice(PT.trig.indexOf(p), 1); autoN++;
      const part = !ptSimple(p);
      ptResolve(p); ptNoteResolved(p, true);
      if (part) ptAddPrompt(Object.assign({}, p, {id: ++ptTrigId + "-rest", actions: [], fresh: false, partial: true, text: `Done automatically: ${p.actions.map(a => a.label).join(", ")}. Finish the rest by hand: ${p.text}`})); done.push(`${p.srcName}: ${p.result || p.actions.map(a => a.label).join(", ")}`);
      continue;
    }
    const evs = PT_EV; PT_EV = [];
    const once = new Set();
    for (const e of evs) {
      if (e.ev === "cast" && e.snap) {
        const cas = ptCascades(e);
        cas.forEach((why, k) => ptAddPrompt({srcUid: e.uid, srcName: e.snap.name, img: e.snap.img, kind: "cascade", text: `Cascade${cas.length > 1 ? ` (${k + 1} of ${cas.length})` : ""}${why !== "own" ? ` from ${why}` : ""}: exile cards from the top until a nonland card with lower mana value, cast it free, the rest go to the bottom in a random order.`,
          actions: [{t: "cascade", mv: e.snap.cmc ?? 0, label: `Cascade (mana value under ${e.snap.cmc ?? 0})`}], fresh: true}));
      }
      // a commander that goes to the graveyard or exile can go back to the command zone
      if (e.ev === "ltb" && e.snap && e.snap.commander && (e.to === "grave" || e.to === "exile"))
        ptAddPrompt({srcUid: e.uid, srcName: e.snap.name, img: e.snap.img, kind: "commander", text: `Your commander went to ${e.to === "grave" ? "the graveyard" : "exile"}. Move it to the command zone?`, actions: [{t: "tocmd", uid: e.uid, label: "Move to the command zone"}], conditional: true, fresh: true});
      if (e.ev === "etb" && !e.selfOnly && e.snap && /\benter(?:s)? as a copy of\b/i.test(ptFaceText(e.snap)))
        ptAddPrompt({srcUid: e.uid, srcName: e.snap.name, img: e.snap.img, kind: "clone", text: "It can enter as a copy of a creature: click the one to copy. Its enter abilities then trigger.", actions: [{t: "becomecopy", label: "Pick what it copies"}], conditional: false, fresh: true});
      // evoke: the sacrifice comes after the card's own enter triggers
      if (e.ev === "evokeSac") { ptAddPrompt({srcUid: e.uid, srcName: e.snap.name, img: e.snap.img, kind: "evoke", text: "Evoked: sacrifice it as it enters.", actions: [{t: "sacrifice", label: `Sacrifice ${e.snap.name}`}], evoke: true, fresh: true}); continue; }
      // persist / undying: back it comes, unless it already had that kind of counter (tokens stay gone)
      if (e.ev === "dies" && e.snap && !e.snap.token) for (const kw of ["persist", "undying"]) {
        const from = ptHasKw(e.snap, kw); if (!from) continue;
        const cnt = kw === "persist" ? "m1m1" : "p1p1";
        if ((e.snap.counters || {})[cnt]) { ptLog(`${e.snap.name} had a ${kw === "persist" ? "−1/−1" : "+1/+1"} counter, so ${kw} doesn't bring it back.`); continue; }
        ptAddPrompt({srcUid: e.uid, srcName: e.snap.name, img: e.snap.img, kind: kw, text: `${kw === "persist" ? "Persist" : "Undying"}${from !== "own" ? ` (from ${from})` : ""}: return it to the battlefield with a ${kw === "persist" ? "−1/−1" : "+1/+1"} counter on it.`,
          actions: [{t: "returnBf", counter: cnt, label: `Return with a ${kw === "persist" ? "−1/−1" : "+1/+1"} counter`}], evUid: e.uid, fresh: true});
      }
      if (e.ev === "dies" && e.snap && e.snap.blitz) ptAddPrompt({srcUid: e.uid, srcName: e.snap.name, img: e.snap.img, kind: "blitz", text: "Blitz: when it dies, draw a card.", actions: [{t: "draw", n: 1, label: "Draw 1"}], fresh: true});
      // an instant or sorcery you cast: offer to resolve its own text
      if (e.ev === "cast" && e.snap && (/\b(Instant|Sorcery)\b/.test(ptFaceType(e.snap)) || e.adventure) && !PT.muted[e.snap.name]) ptAddSpellPrompt(e.snap);
      const sources = PT.bf.slice();
      if (e.uid != null && !sources.some(s => s.uid === e.uid)) { const f = ptFind(e.uid); if (f) sources.push(f.card); else if (e.snap) sources.push(e.snap); }
      for (const src of sources) {
        const faceName = (src.name || "").includes(" // ") ? src.name.split(" // ")[src.back ? 1 : 0] : src.name;
        if (src.faceDown || PT.muted[src.name] || PT.muted[faceName]) continue;
        const abs = trAbilities(src);
        abs.forEach((ab, ai) => ab.conds.forEach((cond, ci) => {
          // abilities of cards elsewhere only count for their own "when this dies / leaves / is cast"
          const onBf = PT.bf.some(b => b.uid === src.uid);
          // a card that just left the battlefield "looks back in time" (rule 603.10a): its own leave/die/sacrifice abilities see it go,
          // including "whenever you sacrifice a nontoken Elemental" on Ashling when Ashling herself is the one sacrificed
          if (!onBf && !(src.uid === e.uid && (((cond.who === "self" || cond.who === "selfOrOther") && ["dies", "ltb", "cast", "cycle", "discard"].includes(cond.ev)) || (cond.who === "any" && ["dies", "ltb", "sac"].includes(cond.ev))))) return;
          if (!ptCondFits(cond, e, src)) return;
          const key = src.uid + ":" + ai;
          if ((cond.batch || cond.ev === "attackers" || cond.who === "attached") && once.has(key)) return;
          once.add(key);
          // "if it was kicked / blitzed / evoked / dashed": the table knows, so check it instead of asking
          let condl = ab.intervening || (ab.kw ? (ab.eff == null ? !!ab.choice : trConditional("x, " + ab.eff)) : trConditional(ab.text));
          const was = (ab.eff || "").match(/^if (?:it|cardname) was (kicked|blitzed|evoked|dashed)\b/);
          if (was) {
            const flag = {kicked: "kicked", blitzed: "blitz", evoked: "evoked", dashed: "dash"}[was[1]], live = (ptFind(src.uid) || {}).card || src;
            if (!live[flag]) return;
            condl = trConditional(ab.text.replace(/,\s*if (?:it|[^,]+?) was (?:kicked|blitzed|evoked|dashed)[^,]*,/i, ","));
          }
          // keyword triggers with their own condition (training, renown, echo, offspring, squad)
          if (ab.check) {
            const live = (ptFind(src.uid) || {}).card || src;
            if (ab.check === "training" && !(PT.combat || []).some(u => u !== src.uid && ptPow(PT.bf.find(x => x.uid === u) || {}) > ptPow(live))) return;
            if (ab.check === "renown" && live.renowned) return;
            if (ab.check === "echo" && live.since !== PT.turn - 1) return;
            if ((ab.check === "offspring" || ab.check === "squad") && !(live.paid || {})[ab.check]) return;
          }
          let acts = ab.actions, effNow = ab.eff;
          if (ab.intervening && ab.eff) {
            const r = trIfClause(ab.eff, {src: (ptFind(src.uid) || {}).card || src, e});
            if (r.ok === false) { ptLog(`${faceName}: “if ${r.cond}” isn't true, so it doesn't trigger.`); return; }
            if (r.ok === true) { effNow = r.rest; acts = trActions(r.rest, faceName); condl = trConditional("x, " + r.rest); }
          } else if (ab.eff && condl) {
            const r = trResolveIfs(ab.eff, {src: (ptFind(src.uid) || {}).card || src, e});
            if (!r.unknown && r.text !== ab.eff) { effNow = r.text; acts = trActions(r.text, faceName); condl = trConditional("x, " + r.text.replace(/\bif you do\b/g, "")); }
          }
          // "You may pay {1}. If you do, …": mana isn't counted, so it's paid (but transforming stays your call)
          const pay = String(effNow || "").match(/^you may pay ((?:\{[^}]+\})+)\.? if you do,? (.+)$/s);
          if (pay && !/\btransform\b/.test(pay[2])) { effNow = pay[2]; acts = trActions(effNow, faceName); condl = trConditional("x, " + effNow); }
          if (ab.choice) condl = true;
          // "This ability triggers only once each turn"
          if (/only once each turn/i.test(ab.text)) { const k = src.uid + ":" + ai; PT.onceTurn = PT.onceTurn || {}; if (PT.onceTurn[k] === PT.turn) return; PT.onceTurn[k] = PT.turn; }
          const mods = ptMods(), ty = (e.snap && e.snap.type || "").split(" // ")[0];
          let copies = 1 + (e.ev === "etb" && /\b(Artifact|Creature)\b/.test(ty) ? mods.etbArtCre : 0) + (e.ev === "etb" && !/\b(Instant|Sorcery)\b/.test(ty) ? mods.etbPerm : 0)
            + (e.ev === "dies" && /\bCreature\b/.test(ty) ? mods.dies : 0) + ((e.ev === "attack" || (cond.ev === "attackers")) ? mods.attack : 0)
            + (e.ev === "cast" && /\b(Instant|Sorcery)\b/.test(ty) ? mods.spellCast : 0)
            + mods.srcX.filter(d => !(d.other && d.uid === src.uid) && trFits(d.phrase, src)).length;
          for (let k = 0; k < copies; k++)
          ptAddPrompt(Object.assign({srcUid: src.uid, srcName: faceName, extra: k > 0, img: src.back && src.img ? src.img.replace("/front/", "/back/") : src.img, kind: cond.ev, text: ab.text, actions: acts, eff: effNow, may: ab.may, evUid: e.uid, evName: e.snap ? e.snap.name : "", amount: e.amount, auto: true,
            xExpr: ab.xExpr, snap: cond.ev === "dies" ? e.snap : undefined, conditional: condl, fresh: true}, ab.modes ? {modes: ab.modes, pick: ab.pick, upTo: ab.upTo, chosen: [], actions: [], eff: null, choice: true, conditional: true} : {}));
        }));
      }
    }
  }
  PT.trig.forEach(x => { delete x.fresh; });
  if (!PT.trig.length && PT.chain) PT.chain = null;   // chain finished
  if (done.length) ptAutoRecent = done.concat(ptAutoRecent).slice(0, 8);
}

// A trigger it understands only part of, with nothing to choose: Auto does that part and leaves the rest for you
function ptPartial(p){
  if (p.partial || p.modes || p.choice || p.conditional || !p.actions.length || p.eff == null || p.actions.some(ptNeedsPick)) return false;
  if (p.actions.some(a => ["scry", "dig", "search", "grave", "becomecopy"].includes(a.t) && !(a.t === "scry" || a.auto))) return false;
  if (!ptAuto() && p.actions.some(a => a.who === "pick" || a.on === "target" || a.t === "pickDo")) return false;
  return !trCovered(p.eff, p.actions);
}
function ptAddPrompt(p){
  // "Create a Treasure token. Then you may discard a card. If you do, draw a card.": the part before the choice happens
  // on its own, and only the choice waits on the stack
  if (p.fresh && p.conditional && !p.modes && !p.choice && !p._split && p.eff && (p.actions || []).length && !/\b(?:instead|this way|that card|those cards)\b/.test(p.eff)) {
    const sents = String(p.eff).split(/(?<=\.)\s+|,? then (?=you may\b|if\b)/).filter(x => x.trim());
    const k = sents.findIndex(x => /\byou may\b/.test(x) || trConditional("x, " + x));
    if (k > 0) {
      const lead = sents.slice(0, k).join(" "), rest = sents.slice(k).join(" ");
      const la = trActions(lead, p.srcName), ra = trActions(rest, p.srcName);
      if (la.length && trCovered(lead, la) && !la.some(ptNeedsPick)) {
        ptAddPrompt(Object.assign({}, p, {_split: true, eff: lead, actions: la, conditional: false, may: false}));
        return ptAddPrompt(Object.assign({}, p, {_split: true, eff: rest, actions: ra, conditional: true, text: `${p.srcName}, then: ${rest.replace(/^then /, "")}`}));
      }
    }
  }
  if (PT.trig.length >= 1500) { PT.chain = Object.assign(PT.chain || {}, {capped: (PT.chain && PT.chain.capped || 0) + 1}); return; }   // runaway safety net, shown in the stack
  PT.trig.push(Object.assign({id: ++ptTrigId + "-" + Date.now() % 1e6}, p));
}
// Carry out a prompt's simple actions; returns the dialog to open afterwards (scry, look, search, graveyard)
function ptResolve(p){
  let dialog = null, made = [];
  const src = ptFind(p.srcUid), it = p.evUid != null ? ptFind(p.evUid) : null;
  const done = [], ctx = {src, it, done, made: []};
  for (const a0 of p.actions) {
    if (ptNeedsPick(a0)) {
      // stop here and let you choose; whatever comes after waits on the stack and carries on once you've picked
      const rest = p.actions.slice(p.actions.indexOf(a0) + 1);
      const restId = rest.length ? ++ptTrigId + "-after" : null;
      if (rest.length) PT.trig.unshift(Object.assign({}, p, {id: restId, actions: rest, eff: null, text: "Then: " + rest.map(x => x.label).join(", "), may: false, conditional: false, fresh: false}));
      dialog = {t: "pick", a: a0, p, restId};
      if (a0.t === "becomecopy" && src) src.card.cloning = true;   // it's a copy as it enters: no 0/0 check while you choose
      break;
    }
    const a = a0.x || a0.count ? Object.assign({}, a0, {n: ptAmt(a0, p)}) : a0;
    if (ptResolve2(a, p, ctx)) continue;
    if (a.t === "draw") { ptDraw(a.n); done.push(a.label); }
    else if (a.t === "token") {
      let n = a.each ? PT.bf.filter(c => trFits(a.each, c)).length : p.amount && a.many ? p.amount : a.n;
      if (a.perOpp) n *= Math.max(1, PT.opps ? ptLiveOpps().length : 1);
      n *= ptTokenMult(a.def);
      if (n > 0) { ptCreateToken(a.def, n); ptTokenArt(a.def); const mk = PT.bf.slice(-n); ctx.made = mk.map(t => t.uid); made = ctx.made; if (a.def.tapped) mk.forEach(t => t.tapped = true); if (a.attacking && PT.combat) mk.forEach(t => PT.combat.push(t.uid)); }
      done.push(a.label);
    }
    else if (a.t === "copy") {
      let of = a.of === "self" ? src : a.of === "it" ? it : null;
      // in a card's own "enters" ability, "a copy of it" means something else it found (a card it exiled…): cards that copy themselves name themselves
      if (a.of === "it" && of && p.kind === "etb" && of.card.uid === p.srcUid && /\b(?:exile|return|search|reveal|choose)\b[^.]*\.\s*create [^.]*cop(?:y|ies) of it\b/.test(p.eff || p.text || "")) { ptLog(`${p.srcName}: the token copy is of the card it found — make it by hand (right-click → Token copy).`); of = null; done.push(a.label); continue; }
      // a sacrificed or dead card is copied from where it is now (Ashling, Feldon…)
      const nCopy = a.squad ? ((of && of.card.paid && of.card.paid.squad) || 1) : a.n;
      if (of) { made = ptCopy(of.card.uid, nCopy * ptTokenMult(of.card)) || []; made.forEach(u => { const t = PT.bf.find(c => c.uid === u); if (!t) return; if (a.haste) t.haste = true; if (a.nonLegend) t.type = String(t.type || "").replace(/\bLegendary /g, ""); if (a.set) { t.power = String(a.set[0]); t.toughness = String(a.set[1]); } delete t.paid; }); ctx.made = made; }
      else if (a.of === "target" && ptAuto()) { const pick = PT.bf.filter(c => ptIsCreature(c) && !c.token && (!src || c.uid !== src.card.uid)).sort((x, y) => (y.cmc || 0) - (x.cmc || 0))[0]; if (pick) { made = ptCopy(pick.uid, a.n * ptTokenMult(pick)) || []; ctx.made = made; } }
      else if (a.of === "target") ptTarget({kind: "copy", n: a.n, label: "Click the permanent to copy"});
      done.push(a.label);
    }
    else if (a.t === "delay") {
      const ids = made.length ? made : it ? [it.card.uid] : src ? [src.card.uid] : [];
      PT.delayed = (PT.delayed || []).concat(ids.map(u => ({uid: u, act: a.act, unless: a.unless, why: p.srcName})));
      done.push(a.label);
    }
    else if (a.t === "sacrifice") { const u = a.uid != null ? a.uid : p.srcUid; if (ptFind(u) && ptFind(u).zone === "bf") ptSacrifice(u); done.push(a.label); }
    else if (a.t === "returnBf") {
      const f = ptFind(p.evUid);
      if (f && f.zone === "grave") { ptMove(p.evUid, "bf", {cast: false}); const k = ptAddCounters(p.evUid, a.counter, 1); ptLog(`${f.card.name} returned with ${k} ${a.counter === "m1m1" ? "−1/−1" : "+1/+1"} counter${k > 1 ? "s" : ""}.`); }
      else ptLog(`${p.srcName} isn't in the graveyard any more, so it doesn't come back.`);
      done.push(a.label);
    }
    else if (a.t === "transform") {
      const f = a.on === "it" ? it : src;
      if (f && f.zone === "bf" && ptCanTransform(f.card)) { f.card.back = !f.card.back; ptLog(`Transformed ${f.card.name.split(" // ")[f.card.back ? 1 : 0] || f.card.name}.`); }
      done.push(a.label);
    }
    else if (a.t === "tohand") { const u = a.uid; if (ptFind(u) && ptFind(u).zone === "bf") ptMove(u, "hand"); done.push(a.label); }
    else if (a.t === "toexile") { const u = a.uid; if (ptFind(u) && ptFind(u).zone === "bf") ptMove(u, "exile"); done.push(a.label); }
    else if (a.t === "life") {
      if (!a.n && !a.much) { done.push(a.label); continue; }
      const n = a.much && p.amount ? p.amount : Math.abs(a.n);
      if (a.n > 0) ptGain(n, p.srcName); else { PT.life -= n; ptLog(`Lost ${n} life (${p.srcName}).`); ptEmit("loselife", null, {amount: n}); }
      done.push(a.label);
    }
    else if (a.t === "opp") { const ev = p.evUid != null && PT.atkOpp && PT.atkOpp[p.evUid] != null ? PT.atkOpp[p.evUid] : undefined; ptDealOpp(a.much && p.amount ? p.amount : a.n, p.srcName, src ? src.card : null, a.dmg, a.each ? "each" : a.defending && ev != null ? ev : undefined); done.push(a.label); }
    else if (a.t === "blink") {
      if (a.on === "self" && src && src.zone === "bf") ptBlink(src.card.uid, false);
      else if (ptAuto()) { const pick = PT.bf.filter(c => ptIsCreature(c) && !c.token && (!src || c.uid !== src.card.uid || !/another/.test(p.eff || ""))).sort((x, y) => (ptHasEtb(y) - ptHasEtb(x)) || (y.cmc || 0) - (x.cmc || 0))[0]; if (pick) { ptBlink(pick.uid, !!a.delay); p.result = `blinked ${pick.name}`; } }
      else ptTarget({kind: "blink", delay: !!a.delay, label: a.delay ? "Click a creature to exile (it returns at the end step)" : "Click a creature to blink (exile and return it)"});
      done.push(a.label);
    }
    else if (a.t === "discover") { ptReveal(a.n, false, `Discover ${a.n}`); done.push(a.label); }
    else if (a.t === "topif") {
      const top = PT.lib[0];
      if (!top) { ptLog(`${p.srcName}: your library is empty.`); p.result = "library empty"; }
      else {
        const hit = trFits(a.phrase, top), dest = hit ? a.yes : a.no;
        const say = {bf: "battlefield", bfTapped: "battlefield tapped", hand: "hand", bottom: "bottom of library", grave: "graveyard", top: "stays on top"}[dest];
        if (dest === "bf" || dest === "bfTapped") { ptMove(top.uid, "bf", {cast: false}); if (dest === "bfTapped") top.tapped = true; }
        else if (dest === "hand") { PT.lib.shift(); PT.hand.push(top); }
        else if (dest === "bottom") { PT.lib.push(PT.lib.shift()); }
        else if (dest === "grave") { PT.grave.push(PT.lib.shift()); }
        p.result = `${top.name} → ${say}`;
        ptLog(`${p.srcName}: the top card was ${top.name} (${hit ? "a " + a.phrase : "not a " + a.phrase}) → ${say}.`);
      }
      done.push(a.label);
    }
    else if (a.t === "explore") {
      const who = a.on === "self" ? src : a.on === "it" ? (it || src) : null;
      if (a.on === "target" && ptAuto()) { const pick = ptPickOwn({}, p)[0]; if (pick) ptExplore(pick.uid, p); }
      else if (a.on === "target") ptTarget({kind: "explore", label: "Click the creature that explores"});
      else if (who && who.zone === "bf") ptExplore(who.card.uid, p);
      done.push(a.label);
    }
    else if (a.t === "cascade") { ptReveal.last = null; ptReveal(a.mv, true, "Cascade"); p.result = ptReveal.last ? `cast ${ptReveal.last} free` : "found nothing"; done.push(a.label); }
    else if (a.t === "tocmd") { const f = ptFind(a.uid); if (f && (f.zone === "grave" || f.zone === "exile")) { ptMove(a.uid, "cmd"); } done.push(a.label); }
    else if (a.t === "recast") { const f = ptFind(a.uid); if (f && f.zone === "exile") ptMove(a.uid, "grave", {cast: true, how: "rebound"}); done.push(a.label); }
    else if (a.t === "becomecopy") {
      const pick = ptAuto() ? PT.bf.filter(c => ptIsCreature(c) && c.uid !== p.srcUid && !c.faceDown).sort((x, y) => (y.cmc || 0) - (x.cmc || 0) || ptPow(y) - ptPow(x))[0] : null;
      if (pick) { ptBecomeCopy(p.srcUid, pick.uid); p.result = `copied ${pick.name}`; } else ptTarget({kind: "becomecopy", uid: p.srcUid, label: `Click the creature ${p.srcName} copies`});
      done.push(a.label);
    }
    else if (a.t === "fromexile") { const f = ptFind(a.uid); if (f && f.zone === "exile") ptMove(a.uid, "bf", {cast: false}); done.push(a.label); }
    else if (a.t === "counter") {
      const targets = a.on === "self" ? (src && src.zone === "bf" ? [src.card] : []) : a.onMade && ctx.made && ctx.made.length ? ctx.made.map(u => PT.bf.find(c => c.uid === u)).filter(Boolean) : a.on === "it" ? (it && it.zone === "bf" ? [it.card] : src && src.zone === "bf" ? [src.card] : [])
        : a.on === "all" ? PT.bf.filter(ptIsCreature) : a.on === "allOther" ? PT.bf.filter(c => ptIsCreature(c) && c.uid !== p.srcUid) : a.on === "each" ? PT.bf.filter(c => trFits(a.each, c))
        : a.on === "host" ? (src && src.card.att != null ? PT.bf.filter(c => c.uid === src.card.att) : [])
        : a.on === "target" && (a.tn || 1) > 1 && ptAuto() ? PT.bf.filter(c => ptIsCreature(c) && c.uid !== p.srcUid).sort((x, y) => ptPow(y) - ptPow(x)).slice(0, a.tn) : null;
      const tg = targets || (ptAuto() ? (a.kind === "m1m1" ? [] : ptPickOwn({other: /another/.test(p.eff || "")}, p)) : null);
      if (tg) { tg.forEach(c => a.noMods ? ptCounter(c.uid, a.kind, a.n) : ptAddCounters(c.uid, a.kind, a.n)); ptLog(`${p.srcName}: ${a.label}${!targets && tg[0] ? ` (on ${tg[0].name})` : ""}.`); }
      else { ptTarget({kind: "counter", counter: a.kind, n: a.n, label: `Click a creature to put ${a.n > 1 ? a.n + " " : "a "}${ptCounterName(a.kind)} counter${a.n > 1 ? "s" : ""} on it`}); done.push(a.label); }   // (when done, it's logged above)
    }
    else if (a.t === "proliferate") { PT.bf.forEach(c => Object.keys(c.counters).forEach(k => { if (k !== "m1m1") ptAddCounters(c.uid, k, 1); })); ptLog("Proliferated (added one of each counter already there)."); done.push(a.label); }
    else if (a.t === "mill") { ptMill(a.n); done.push(a.label); }
    else if (a.t === "exiletop") { const k = Math.min(a.n, PT.lib.length); PT.exile.push(...PT.lib.splice(0, k)); ptLog(`Exiled the top ${k} card${k === 1 ? "" : "s"} (${p.srcName}).`); done.push(a.label); }
    else if (a.t === "untap") {
      const list = a.on === "self" ? (src ? [src.card] : []) : a.on === "it" ? (it ? [it.card] : []) : a.on === "creatures" ? PT.bf.filter(ptIsCreature) : a.on === "lands" ? PT.bf.filter(ptIsLand) : null;
      if (list) list.forEach(c => c.tapped = false);
      else if (ptAuto()) { const want = /land/.test(a.label) ? ptIsLand : c => ptIsCreature(c); const pick = PT.bf.filter(c => c.tapped && want(c)).sort((x, y) => (y.cmc || 0) - (x.cmc || 0))[0]; if (pick) { pick.tapped = false; ptLog(`${p.srcName}: untapped ${pick.name}.`); } }
      else ptTarget({kind: "untap", label: "Click the permanent to untap"});
      done.push(a.label);
    }
    else if (a.t === "energy") { PT.energy += a.n; done.push(a.label); }
    else if (a.t === "pcounter") { PT.exp = (PT.exp || 0) + 1; ptLog(`Experience counters: ${PT.exp}.`); done.push(a.label); }
    else if (a.t === "shuffle") { ptShuffle(); done.push(a.label); }
    else if (a.t === "combat") setTimeout(ptBlocksOrDamage, 0);
    else if (a.t === "scry" && ptAuto()) { ptAutoScry(a.n, a.surveil || /surveil/i.test(a.label)); done.push(a.label); }
    else if (a.t === "dig" && a.auto && ptAuto()) {
      const top = PT.lib.splice(0, Math.min(a.n, PT.lib.length)), fits = top.filter(c => !a.phrase || trFits(a.phrase, c));
      const take = ptBestCard(fits).slice(0, a.take);
      PT.hand.push(...take); const rest = top.filter(c => !take.includes(c));
      if (a.rest === "grave") PT.grave.push(...rest); else PT.lib.push(...shuffle(rest));
      ptLog(`${p.srcName}: looked at ${top.length}, took ${take.map(c => c.name).join(", ") || "nothing"}${rest.length ? `, ${rest.length} to the ${a.rest === "grave" ? "graveyard" : "bottom"}` : ""}.`);
      p.result = take.length ? "took " + take.map(c => c.name).join(", ") : "took nothing"; done.push(a.label);
    }
    else if (["scry", "dig", "search", "grave"].includes(a.t)) {
      // a window opens: whatever comes after it waits as a follow-up prompt, so "scry 1, then draw" happens in order
      dialog = Object.assign({}, a, {src: p.srcName});
      const rest = p.actions.slice(p.actions.indexOf(a0) + 1);
      if (rest.length) PT.trig.unshift(Object.assign({}, p, {id: ++ptTrigId + "-then", actions: rest, text: "Then: " + rest.map(x => x.label).join(", "), may: false}));
      break;
    }
  }
  if (done.length) ptLog(`${p.srcName}: ${done.join(", ")}.`);
  return dialog;
}
function ptTarget(t){ PT.targeting = t; }
function ptOpenDialog(a){
  if (!a) return;
  if (a.t === "pick") return ptOpenPick(a.a, a.p, {restId: a.restId});
  if (a.t === "scry") ptView("scry", a.n);
  else if (a.t === "dig") ptDigOpen(a.n);
  else if (a.t === "search") { ptView("search"); if (a.what || a.to) { Object.assign(PT_VIEW, {what: a.what, to: a.to, tapped: a.tapped, max: a.n || 1, src: a.src || ""}); ptRenderView(); } }
  else if (a.t === "grave") ptView("grave");
}
function ptDoPrompt(id){
  const p = PT.trig.find(x => x.id === id); if (!p) return;
  let dialog = null;
  ptDo(() => { PT.trig.splice(PT.trig.indexOf(p), 1); dialog = ptResolve(p); ptNoteResolved(p, false); if (!p.actions.length) ptLog(`${p.srcName}: done by hand.`); });
  ptOpenDialog(dialog);
}
function ptDoAll(){
  let dialog = null, n = 0;
  ptDo(() => {
    for (const p of PT.trig.slice()) {
      if (!p.actions.length || p.modes || p.actions.some(a => ["scry", "dig", "search", "grave"].includes(a.t) || ptNeedsPick(a) || (a.t === "counter" && a.on === "target"))) continue;
      PT.trig.splice(PT.trig.indexOf(p), 1); ptResolve(p); ptNoteResolved(p, false); n++;
    }
  });
  if (!n) toast("The ones left need you: do them one at a time.");
  ptOpenDialog(dialog);
}
const ptTokenArtCache = new Map();
async function ptTokenArt(def){
  const key = [def.name, def.power, def.toughness, (def.colors || []).join("")].join("|");
  let url = ptTokenArtCache.get(key);
  if (url === undefined) {
    ptTokenArtCache.set(key, null);
    try {
      const q = `t:token !"${def.name}"${def.power ? ` pow=${def.power} tou=${def.toughness}` : ""}${def.colors && def.colors.length ? ` c=${def.colors.join("")}` : ""}`;
      const j = await sf(`/cards/search?unique=cards&order=released&dir=desc&include_extras=true&q=${encodeURIComponent(q)}`);
      const c = j && j.data && j.data[0] ? slimCard(j.data[0]) : null; url = c ? c.imgN : null;
    } catch (e) { url = null; }
    ptTokenArtCache.set(key, url);
  }
  if (!url || !PT) return;
  let changed = false;
  for (const t of PT.bf) if (t.token && !t.img && t.name === def.name && String(t.power) === String(def.power || "")) { t.img = url; changed = true; }
  if (changed) ptRender();
}
// The stack: what's waiting (top resolves next), then what just resolved, then the game log
let ptResolved = [];
function ptStackHtml(){
  const list = PT.trig || [], tg = PT.targeting, off = ptMode() === "off";
  const thumb = (img, cls) => img ? `<img class="${cls}" src="${esc(img)}" alt="" loading="lazy">` : `<span class="${cls} noimg"></span>`;
  const SHOW = 30, items = list.slice(0, SHOW).map((p, i) => {
    const manual = !p.actions.length && !p.modes;
    return `<div class="pt-si${i === 0 ? " top" : ""}">
      ${thumb(p.img, "pt-si-img")}
      <div class="pt-si-body">
        <div class="pt-si-title"><b>${esc(p.srcName)}</b><span class="pt-si-kind">${esc(PT_KIND[p.kind] || p.kind)}</span></div>
        ${p.modes ? `<div class="pt-si-modes">${p.modes.map((m, mi) => p.chosen.includes(mi) ? "" : `<button type="button" data-tr="mode" data-id="${p.id}" data-i="${mi}" title="${esc(m.text)}">${esc(m.text.length > 70 ? m.text.slice(0, 68) + "…" : m.text)}</button>`).join("")}<small>${p.pick >= 99 ? "Choose any" : `Choose ${p.pick}`}${p.chosen.length ? ` · ${p.chosen.length} chosen` : ""}</small></div>`
          : manual ? `<div class="pt-si-what manual">${p.partial ? "Finish by hand" : "Do this by hand"}</div>` : `<div class="pt-si-what">${p.actions.map(a => `<span>${esc(a.label)}</span>`).join("")}</div>`}
        ${p.text && !p.modes ? `<div class="pt-si-text" title="${esc(p.text)}">${esc(p.text)}</div>` : ""}
      </div>
      <div class="pt-si-acts">
        <button type="button" class="pt-si-go" data-tr="do" data-id="${p.id}" title="${manual ? "Done" : p.may ? "Resolve (optional)" : "Resolve"}" aria-label="${manual ? "Done" : "Resolve"} ${esc(p.srcName)}">${manual ? "✓" : "▶"}</button>
        <button type="button" class="pt-si-skip" data-tr="skip" data-id="${p.id}" title="Skip" aria-label="Skip ${esc(p.srcName)}">✕</button>
        <button type="button" class="pt-si-mute" data-tr="mute" data-id="${p.id}" title="Mute ${esc(p.srcName)} for this game" aria-label="Mute ${esc(p.srcName)}">🔕</button>
      </div></div>`; }).join("");
  const res = []; for (const r of ptResolved) { const k = r.name + "|" + r.what + "|" + !!r.auto + "|" + !!r.skipped, ex = res.find(x => x.k === k); if (ex) ex.n++; else res.push(Object.assign({k, n: 1}, r)); }
  res.length = Math.min(res.length, 10);
  return `<div class="pt-stack">
    <div class="pt-stack-head"><b>Stack</b><span class="pt-stack-n">${list.length}</span><span class="sp"></span>
      ${list.length > 1 ? `<button type="button" class="linkish" data-tr="all">Resolve simple</button><button type="button" class="linkish" data-tr="skipall">Skip all</button>` : ""}</div>
    ${tg ? `<div class="pt-target"><span>🎯 ${esc(tg.label)}</span><button type="button" class="linkish" data-tr="untarget">Cancel</button></div>` : ""}
    ${PT.chain && (PT.chain.paused || PT.chain.capped) ? `<div class="pt-chain" role="status"><b>♾ Big chain</b><span>${PT.chain.paused ? `Auto did ${PT.chain.ran} triggers in a row and paused so you can check it isn't an endless loop.` : ""}${PT.chain.capped ? ` ${PT.chain.capped} more triggers didn't fit on the stack.` : ""}</span>
      <div><button type="button" class="btn primary" data-tr="chaingo">Keep going</button><button type="button" class="btn ghost" data-tr="chainstop">Stop the chain</button></div></div>` : ""}
    <div class="pt-si-list">${items || `<div class="pt-stack-empty">${off ? "Trigger helper is off (⚡ in the top bar)." : "The stack is empty."}</div>`}</div>
    ${list.length > SHOW ? `<div class="pt-stack-more">+${list.length - SHOW} more waiting below</div>` : ""}
    ${list.length ? `<div class="pt-stack-hint">Top item resolves next.</div>` : ""}
    ${res.length ? `<div class="pt-res-head"><span>Just resolved</span><button type="button" class="linkish" data-tr="clearres">Clear</button></div>
      <ul class="pt-res">${res.map(r => `<li class="${r.skipped ? "skipped" : ""}">${thumb(r.img, "pt-res-img")}<span><b>${esc(r.name)}</b> ${esc(r.what)}</span><span class="pt-res-meta">${r.n > 1 ? `<em>×${r.n}</em>` : ""}${r.auto ? `<i title="Done automatically">⚡</i>` : ""}</span></li>`).join("")}</ul>` : ""}
    <details class="pt-logbox" ${prefs.ptLogOpen ? "open" : ""}><summary>Game log</summary><ol>${PT.log.slice(0, 40).map(l => `<li>${esc(l)}</li>`).join("")}</ol></details>
  </div>`;
}
function ptNoteResolved(p, auto, skipped){
  ptResolved.unshift({name: p.srcName, img: p.img, what: skipped ? "skipped" : p.result ? p.result : p.actions.length ? p.actions.map(a => a.label).join(", ") : "done by hand", auto, skipped});
  if (ptResolved.length > 40) ptResolved.length = 40;
}
// the old floating tray is gone: the stack lives in the side panel
function ptTrayHtml(){
  if (ptMode() === "off") return "";
  const list = PT.trig || [], tg = PT.targeting;
  const sig = ptAutoRecent.join("|"), fresh = sig !== ptTrayHtml.last; ptTrayHtml.last = sig;
  const note = ptAutoRecent.length ? `<div class="pt-auto${fresh ? " fresh" : ""}" role="status"><b>⚡ Done automatically</b><ul>${ptAutoRecent.map(t => `<li>${esc(t)}</li>`).join("")}</ul><small>Undo takes it all back.</small></div>` : "";
  if (!list.length && !tg) return note;
  const collapsed = !!prefs.ptTrayMin;
  return `${note}<div class="pt-tray${collapsed ? " min" : ""}" role="region" aria-label="Triggers">
    <div class="pt-tray-head"><b>⚡ Triggers</b><span class="pt-tray-n">${list.length}</span><span class="sp"></span>
      ${list.length > 1 ? `<button type="button" class="linkish" data-tr="all">Do all simple</button><button type="button" class="linkish" data-tr="skipall">Skip all</button>` : ""}
      <button type="button" class="pt-tray-min" data-tr="min" aria-label="${collapsed ? "Show" : "Hide"} triggers">${collapsed ? "▴" : "▾"}</button></div>
    ${tg ? `<div class="pt-target"><span>🎯 ${esc(tg.label)}</span><button type="button" class="linkish" data-tr="untarget">Cancel</button></div>` : ""}
    ${collapsed ? "" : `<div class="pt-tray-list">${list.map(p => {
      const simple = p.actions.filter(a => !a.dialog);
      return `<div class="pt-tp">
        <div class="pt-tp-head">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="pt-tp-noimg"></span>`}<div><b>${esc(p.srcName)}</b><small>${esc(PT_KIND[p.kind] || p.kind)}${p.evName && p.evName !== p.srcName ? ` · ${esc(p.evName)}` : ""}</small></div></div>
        <p class="pt-tp-text" title="${esc(p.text || "")}">${esc((p.text || "").length > 190 ? p.text.slice(0, 187) + "…" : p.text || "")}</p>
        ${p.actions.length ? `<div class="pt-tp-chips">${p.actions.map(a => `<span class="chip">${esc(a.label)}</span>`).join("")}</div>` : `<div class="pt-tp-manual">Do this one by hand, then press Done.</div>`}
        <div class="pt-tp-acts">
          <button type="button" class="btn primary" data-tr="do" data-id="${p.id}">${p.actions.length ? (p.may ? "Do it (optional)" : "Do it") : "Done"}</button>
          <button type="button" class="btn ghost" data-tr="skip" data-id="${p.id}">Skip</button>
          <button type="button" class="linkish pt-tp-mute" data-tr="mute" data-id="${p.id}" title="Stop asking about ${esc(p.srcName)} this game">Mute</button>
        </div></div>`; }).join("")}</div>`}
  </div>`;
}
function ptTrayClick(e){
  const b = e.target.closest("[data-tr]"); if (!b || !PT) return false;
  const act = b.dataset.tr, id = b.dataset.id, p = id && PT.trig.find(x => x.id === id);
  if (act === "do") { if (p && p.modes) { if (p.chosen.length) ptDo(() => { PT.trig.splice(PT.trig.indexOf(p), 1); }); else toast("Pick a mode first."); } else ptDoPrompt(id); }
  else if (act === "mode") ptPickMode(id, +b.dataset.i);
  else if (act === "skip" && p) ptDo(() => { PT.trig.splice(PT.trig.indexOf(p), 1); ptNoteResolved(p, false, true); ptLog(`Skipped ${p.srcName}'s trigger.`); });
  else if (act === "clearres") { ptResolved = []; ptRender(); }
  else if (act === "mute" && p) ptDo(() => { PT.muted[p.srcName] = true; PT.trig = PT.trig.filter(x => x.srcName !== p.srcName); ptLog(`Muted ${p.srcName} for this game.`); });
  else if (act === "all") ptDoAll();
  else if (act === "skipall") ptDo(() => { ptLog(`Skipped ${PT.trig.length} triggers.`); PT.trig = []; PT.chain = null; });
  else if (act === "chaingo") ptDo(() => { PT.chain = {ran: PT.chain ? PT.chain.ran : 0}; PT.trig.forEach(x => { if (ptSimple(x)) x.fresh = true; }); });
  else if (act === "chainstop") ptDo(() => { ptLog(`Stopped the chain: cleared ${PT.trig.length} waiting triggers.`); PT.trig = []; PT.chain = null; });
  else if (act === "untarget") ptDo(() => { PT.targeting = null; });
  else if (act === "min") { prefs.ptTrayMin = !prefs.ptTrayMin; savePrefs(); ptRender(); }
  return true;
}
// clicking a card while a trigger is waiting for a target
function ptApplyTarget(uid){
  const t = PT.targeting, f = ptFind(uid); if (!t || !f || f.zone !== "bf") return false;
  ptDo(() => {
    if (t.kind === "counter") { const k = ptAddCounters(uid, t.counter, t.n); ptLog(`Put ${k} ${ptCounterName(t.counter)} counter${k > 1 ? "s" : ""} on ${f.card.name}.`); }
    else if (t.kind === "blink") ptBlink(uid, t.delay);
    else if (t.kind === "explore") ptExplore(uid);
    else if (t.kind === "becomecopy") { if (uid === t.uid) return; ptBecomeCopy(t.uid, uid); }
    else if (t.kind === "untap") { f.card.tapped = false; ptLog(`Untapped ${f.card.name}.`); }
    else if (t.kind === "copy") ptCopy(uid, t.n || 1);
    else if (t.kind === "act") { const a = t.a, pp = Object.assign({actions: []}, t.p); if (a.t === "pump") ptPump(f.card, a, pp); else if (a.t === "pickDo") { if (a.how === "bounce") ptMove(uid, "hand"); else if (a.how === "destroy") ptMove(uid, "grave"); else if (a.how === "exile") ptMove(uid, "exile"); else if (a.how === "tap") f.card.tapped = true; } ptLog(`${pp.srcName}: ${a.label} → ${f.card.name}.`); }
    else if (t.kind === "attach") { if (uid !== t.uid) { const eq = ptFind(t.uid); if (eq) { eq.card.att = uid; ptLog(`${eq.card.name} attached to ${f.card.name}.`); ptEmit("attach", eq.card); } } }
    PT.targeting = null;
  });
  return true;
}
