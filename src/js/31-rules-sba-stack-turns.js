/* ----- state-based actions (rule 704): checked whenever something happens ----- */
function ptSBA(){
  if (!PT || PT.phase !== "play") return false;
  let changed = false;
  for (const c of PT.bf.slice()) {
    if (!PT.bf.includes(c)) continue;
    if ((ptIsCreature(c) || c.faceDown) && c.att == null && !PT.trig.some(x => x.srcUid === c.uid && x.kind === "clone") && !(PT.targeting && PT.targeting.kind === "becomecopy" && PT.targeting.uid === c.uid) && !c.cloning) {
      const s = ptStats(c);
      if (s) {
        if (s[1] <= 0) { ptLog(`${ptNameOf(c)} has 0 toughness and goes to the graveyard.`); ptMove(c.uid, "grave"); changed = true; continue; }
        if ((c.dmg || 0) > 0 && ((c.dmg || 0) >= s[1] || c.dt)) {
          if (ptHasKw(c, "indestructible")) { /* stays */ }
          else if (c.regen) { c.regen--; c.dmg = 0; c.dt = false; c.tapped = true; ptLog(`${c.name} regenerated.`); changed = true; continue; }
          else { ptLog(`${ptNameOf(c)} was dealt lethal damage and is destroyed.`); ptMove(c.uid, "grave"); changed = true; continue; }
        }
      }
    }
    if (c.pwSet && /\bPlaneswalker\b/.test(ptFaceType(c)) && !(c.counters.loyalty > 0)) { ptLog(`${c.name} has no loyalty counters left and goes to the graveyard.`); ptMove(c.uid, "grave"); changed = true; continue; }
    if (c.att != null && !PT.bf.some(h => h.uid === c.att)) {
      if (c.bestowed) { delete c.att; c.bestowed = false; [c.x, c.y] = ptPlace(c); ptLog(`${c.name} is no longer bestowed: it's a creature now.`); }
      else if (/\bAura\b/.test(ptFaceType(c))) { ptLog(`${c.name} isn't attached to anything, so it goes to the graveyard.`); ptMove(c.uid, "grave"); }
      else { delete c.att; [c.x, c.y] = ptPlace(c); ptLog(`${c.name} became unattached.`); }
      changed = true; continue;
    }
    if (ptIsSaga(c) && !c.faceDown && PT.trig.every(x => x.srcUid !== c.uid) && !PT_EV.some(x => x.uid === c.uid)) {
      const last = trChapters(c).reduce((m, x) => Math.max(m, x.n), 0);
      if (last && (c.counters.lore || 0) >= last) { ptLog(`${c.name}: the last chapter is done, so it's sacrificed.`); ptSacrifice(c.uid); changed = true; continue; }
    }
  }
  if (PT.opps) ptOppsCheck();
  if ((PT.life <= 0 || PT.poison >= 10) && PT.lostTurn !== PT.turn) { PT.lostTurn = PT.turn; toast(PT.life <= 0 ? "You're at 0 life: in a real game you'd lose here." : "You have 10 poison counters: in a real game you'd lose here."); ptLog(PT.life <= 0 ? "You're at 0 life (you'd lose here)." : "You have 10 poison counters (you'd lose here)."); }
  if (!PT.speed && PT.bf.some(c => !c.faceDown && ptKwPrinted(c).some(k => k.key === "start your engines!"))) { PT.speed = 1; ptLog("Start your engines! Your speed is 1."); }
  if (!PT.story && PT.bf.some(c => !c.faceDown && ptKwPrinted(c).some(k => k.key === "storied")) && PT.bf.filter(c => /\b(Artifact|Saga|Legendary)\b/.test(ptFaceType(c))).length >= 3) { PT.story = true; ptLog("You have an enduring story."); }
  // the legend rule: in Auto mode the newest one stays (Undo if you'd rather keep another)
  if (ptMode() === "auto" && ptAuto()) for (const grp of ptLegendGroups()) {
    const keep = grp.slice().sort((a, b) => b.z - a.z)[0];
    for (const c of grp) if (c !== keep) { ptLog(`Legend rule: kept the newest ${ptFaceName(keep)}; the other goes to the graveyard.`); ptMove(c.uid, "grave"); changed = true; }
  }
  return changed;
}

/* ----- entering the battlefield: "enters tapped", "enters with counters", loyalty, lore, attach auras ----- */
function ptUnless(cond, card){
  const c = String(cond || "").toLowerCase().trim();
  let m;
  if (/you have two or more opponents/.test(c)) return !!PT.isCmd;
  if (/it's your first, second, or third turn of the game/.test(c)) return PT.turn <= 3;
  if ((m = c.match(/you control (\w+) or fewer other lands/))) return PT.bf.filter(x => ptIsLand(x) && x.uid !== card.uid).length <= trNum(m[1]);
  if ((m = c.match(/you control (\w+) or more other lands/))) return PT.bf.filter(x => ptIsLand(x) && x.uid !== card.uid).length >= trNum(m[1]);
  if ((m = c.match(/you control (?:a|an) (.+)$/))) return PT.bf.some(x => x.uid !== card.uid && !x.faceDown && m[1].split(/,\s*(?:or\s+)?|\s+or\s+/).some(ph => trFits(ph.replace(/^(?:a|an)\s+/, ""), x)));
  if ((m = c.match(/you reveal (?:a|an) (.+?) card from your hand/))) return PT.hand.some(x => x.uid !== card.uid && trFits(m[1], x));
  const r = trEvalIf(c, {src: card}); return r === null ? true : r;
}
function ptEnterReplace(card, from){
  if (card.faceDown) return;
  const t = trLower(card, ptFaceText(card));
  let m;
  if ((m = t.match(/\bcardname enters tapped(?: unless ([^.]+))?/))) { if (!(m[1] && ptUnless(m[1], card))) { card.tapped = true; } }
  if ((m = t.match(/\bas cardname enters, you may reveal (?:a|an) ([a-z ,]+?) card from your hand\. if you don't, cardname enters tapped/))) { if (!PT.hand.some(x => x.uid !== card.uid && m[1].split(/,\s*(?:or\s+)?|\s+or\s+/).some(ph => trFits(ph, x)))) card.tapped = true; }
  if ((m = t.match(/\bas cardname enters, you may pay (\d+) life\. if you don't, (?:it|cardname) enters tapped/))) { PT.life -= +m[1]; ptLog(`${card.name}: paid ${m[1]} life so it enters untapped.`); ptEmit("loselife", null, {amount: +m[1]}); }
  for (const mm of t.matchAll(/\bcardname enters with (a|an|one|two|three|four|five|six|seven|eight|x|\d+|that many) (?:additional )?([+\-0-9/a-z]+?) counters? on it(?: for each ([^.]+))?/g)) {
    const kind = {"+1/+1": "p1p1", "-1/-1": "m1m1"}[mm[2]] || mm[2];
    let n = mm[1] === "x" ? ptGuessX(card) : trNum(mm[1]); if (mm[3]) n *= ptCount("the number of " + mm[3].replace(/ you control$/, "") + " you control", {src: card});
    if (n > 0) ptAddCounters(card.uid, kind, n);
  }
  const kws = ptKwPrinted(card), kv = k => { const x = kws.find(y => y.key === k); return x ? (parseInt(x.val) || (/^x/i.test(x.val) ? ptGuessX(card) : 1)) : 0; };
  if (kv("vanishing") && !card.counters.time) ptAddCounters(card.uid, "time", kv("vanishing"));
  if (kv("fading") && !card.counters.fade) ptAddCounters(card.uid, "fade", kv("fading"));
  if (kv("modular")) ptAddCounters(card.uid, "p1p1", kv("modular"));
  if (kv("graft")) ptAddCounters(card.uid, "p1p1", kv("graft"));
  if (kws.some(k => k.key === "ravenous")) { const x = ptGuessX(card); if (x) ptAddCounters(card.uid, "p1p1", x); }
  if (kv("bloodthirst") && PT.oppLostTurn === PT.turn) ptAddCounters(card.uid, "p1p1", kv("bloodthirst"));
  if (kws.some(k => k.key === "sunburst")) { const n = new Set((String(card.cost || "").match(/\{[WUBRG]\}/g) || [])).size; if (n) ptAddCounters(card.uid, ptIsCreature(card) ? "p1p1" : "charge", n); }
  if (kws.some(k => k.key === "living metal")) card.anim = card.anim || null;
  if (card.impendingN) { ptAddCounters(card.uid, "time", card.impendingN); delete card.impendingN; card.impending = true; }
  // planeswalkers enter with their loyalty; battles with their defense
  if (/\bPlaneswalker\b/.test(ptFaceType(card)) && !card.counters.loyalty) {
    const loy = parseInt(card.loyalty);
    if (!isNaN(loy)) { ptAddCounters(card.uid, "loyalty", loy); card.pwSet = true; }
    else ptFetchStats(card);
  }
  if (/\bBattle\b/.test(ptFaceType(card)) && card.defense && !card.counters.defense) ptAddCounters(card.uid, "defense", parseInt(card.defense) || 0);
  // Auras cast from your hand go on your best creature (or land), if they help
  if (from === "hand" && /\bAura\b/.test(ptFaceType(card)) && card.att == null && !card.bestowed) {
    if (ptAuto()) ptAutoAttach(card);
    else if (/^enchant /im.test(ptFaceText(card))) ptAddPrompt({srcUid: card.uid, srcName: card.name, img: card.img, kind: "etb", text: "Choose what it enchants.", actions: [{t: "attachTo", label: `Attach ${card.name}`}], eff: null, fresh: true});
  }
}
// Decks saved before loyalty was stored: look it up once
async function ptFetchStats(card){
  try {
    const j = await sf(`/cards/named?exact=${encodeURIComponent(card.name.split(" // ")[0])}`);
    const loy = j && (j.loyalty || (j.card_faces && j.card_faces[0] && j.card_faces[0].loyalty));
    if (!loy || !PT) return;
    for (const c of PT_ZONES.flatMap(z => PT[z])) if (c.name === card.name) c.loyalty = loy;
    const live = PT.bf.find(c => c.uid === card.uid);
    if (live && !live.counters.loyalty) { ptAddCounters(live.uid, "loyalty", parseInt(loy)); live.pwSet = true; ptRender(); }
  } catch (e) { /* offline: set loyalty by hand */ }
}
function ptAutoAttach(card){
  const t = ptFaceText(card).toLowerCase().replace(/\([^)]*\)/g, ""), ench = (t.match(/^enchant ([a-z ]+)$/m) || [])[1];
  if (!ench) return;
  const harmful = /enchanted (?:creature|permanent) (?:can't attack|can't block|doesn't untap|gets -|loses all abilities|can't be blocked by)|destroy enchanted|enchanted creature's controller|enchanted (?:creature|permanent) can't (?:attack|block|be)|exile enchanted/.test(t) && !/you control/.test(ench);
  if (harmful) { ptLog(`${card.name} would go on an opponent's ${ench} (none on this table): drag it onto one of yours if you want it there.`); return; }
  const list = PT.bf.filter(c => c.uid !== card.uid && c.att == null && !c.faceDown && trFits(ench.replace(/ you control$/, ""), c));
  const host = /land|forest|island|swamp|mountain|plains/.test(ench) ? list.sort((a, b) => (PT.bf.some(x => x.att === a.uid) - PT.bf.some(x => x.att === b.uid)) || (a.tapped - b.tapped))[0]
    : list.sort((a, b) => ptPow(b) - ptPow(a) || (b.z || 0) - (a.z || 0))[0];
  if (host) { card.att = host.uid; ptLog(`${card.name} enchants ${ptNameOf(host)}.`); }
}

/* ----- activating abilities ----- */
function ptCanPay(c, ab){
  const cost = ab.cost || {};
  if (cost.tap && c.tapped) return "It's already tapped.";
  if (cost.tap && ptIsCreature(c) && c.since === PT.turn && !ptHasKw(c, "haste") && ab.zone === "bf") return `${ptFaceName(c)} is summoning sick, so it can't use {T} abilities this turn.`;
  if (cost.untap && !c.tapped) return "It has to be tapped first ({Q}).";
  if (cost.remove && cost.remove.length) { const k = {"+1/+1": "p1p1", "-1/-1": "m1m1"}[cost.remove[1]] || cost.remove[1].replace(/ /g, "-"), need = cost.remove[0] === "all" || cost.remove[0] === "x" ? 1 : trNum(cost.remove[0]); if (((c.counters || {})[k] || 0) < need) return `It needs ${need} ${cost.remove[1]} counter${need > 1 ? "s" : ""}.`; }
  if (cost.sac && cost.sac.length && !PT.bf.some(x => x.uid !== c.uid && trFits(cost.sac[1], x))) return `You need a ${cost.sac[1]} to sacrifice.`;
  if (cost.discard && cost.discard.length && !PT.hand.filter(x => x.uid !== c.uid).length) return "You need a card in hand to discard.";
  if (cost.tapCre && cost.tapCre.length && PT.bf.filter(x => x.uid !== c.uid && !x.tapped && trFits(cost.tapCre[1], x)).length < trNum(cost.tapCre[0])) return `You need ${cost.tapCre[0]} untapped ${cost.tapCre[1]}.`;
  if (cost.exileGrave && cost.exileGrave.length && PT.grave.filter(x => x.uid !== c.uid && trFits(cost.exileGrave[1] || "card", x)).length < trNum(cost.exileGrave[0])) return `You need ${cost.exileGrave[0]} ${cost.exileGrave[1] || ""}cards in your graveyard.`;
  if (ab.kind === "loyalty") {
    if (c.pwTurn === PT.turn) return "A planeswalker can use one loyalty ability per turn.";
    if (typeof ab.loy === "number" && ab.loy < 0 && ((c.counters || {}).loyalty || 0) < -ab.loy) return "Not enough loyalty.";
  }
  if (ab.once && (c.used || {})[ab.label]) return "That ability can only be used once.";
  if (ab.oncePerTurn && (c.used || {})[ab.label] === PT.turn) return "That ability can only be used once each turn.";
  if (ab.boast && c.attackedTurn !== PT.turn) return "Boast: only if it attacked this turn.";
  if (ab.kind === "ninjutsu" && !(PT.combat || []).length) return "Ninjutsu needs an attacking creature (attack first).";
  return "";
}
function ptPayCosts(c, ab, nm){
  const cost = ab.cost || {}, paid = [];
  if (cost.mana) paid.push(cost.mana);
  if (cost.tap) { c.tapped = true; paid.push("{T}"); }
  if (cost.untap) { c.tapped = false; paid.push("{Q}"); }
  if (cost.life) { PT.life -= cost.life; ptEmit("loselife", null, {amount: cost.life}); paid.push(`${cost.life} life`); }
  if (cost.remove && cost.remove.length) { const k = {"+1/+1": "p1p1", "-1/-1": "m1m1"}[cost.remove[1]] || cost.remove[1].replace(/ /g, "-"); const n = cost.remove[0] === "all" ? (c.counters[k] || 0) : cost.remove[0] === "x" ? (c.counters[k] || 0) : trNum(cost.remove[0]); ptCounter(c.uid, k, -n); paid.push(`${n} ${cost.remove[1]} counter${n > 1 ? "s" : ""}`); ab._x = n; }
  if (cost.tapCre && cost.tapCre.length) { const list = PT.bf.filter(x => x.uid !== c.uid && !x.tapped && trFits(cost.tapCre[1], x)).sort((a, b) => ptPow(a) - ptPow(b)).slice(0, trNum(cost.tapCre[0])); list.forEach(x => { x.tapped = true; }); paid.push(`tapped ${list.map(x => x.name).join(", ")}`); }
  if (cost.returnLand && cost.returnLand.length) { const l = PT.bf.find(x => trFits(cost.returnLand[1], x)); if (l) { ptMove(l.uid, "hand"); paid.push(`returned ${l.name}`); } }
  if (ab._force && cost.discard && cost.discard.length) { ab._force.forEach(u => ptDiscard(u, nm)); }
  else if (cost.discard && cost.discard.length) { const n = cost.discard[0] === "your hand" ? 99 : trNum(cost.discard[0]); ptWorstCards(PT.hand.filter(x => x.uid !== c.uid && (!cost.discard[1] || trFits(cost.discard[1], x)))).slice(0, n).forEach(x => ptDiscard(x.uid, nm)); }
  if (cost.discardSelf) ptDiscard(c.uid, nm);
  if (cost.exileGrave && cost.exileGrave.length) { const ex = ptWorstCards(PT.grave.filter(x => x.uid !== c.uid && trFits(cost.exileGrave[1] || "card", x))).slice(0, trNum(cost.exileGrave[0])); ex.forEach(x => { PT.grave.splice(PT.grave.indexOf(x), 1); PT.exile.push(x); }); paid.push(`exiled ${ex.length} from your graveyard`); }
  if (cost.evidence) ptCollectEvidence(cost.evidence, nm);
  if (cost.blight) ptResolve2({t: "blight", n: cost.blight, label: ""}, {srcUid: c.uid, srcName: nm}, {src: ptFind(c.uid), done: []});
  if (cost.forage) ptResolve2({t: "forage", label: ""}, {srcUid: c.uid, srcName: nm}, {src: ptFind(c.uid), done: []});
  if (cost.exert) c.exerted = PT.turn;
  if (ab._force && cost.sac && cost.sac.length) { ab._sacPow = ab._force.reduce((t, u) => t + ptPow((ptFind(u) || {}).card || {}), 0); ab._force.forEach(u => ptSacrifice(u)); paid.push("sacrificed what you chose"); }
  else if (cost.sac && cost.sac.length) { const n = cost.sac[0] === "another" || cost.sac[0] === "a" || cost.sac[0] === "an" ? 1 : trNum(cost.sac[0]); const list = PT.bf.filter(x => x.uid !== c.uid && trFits(cost.sac[1].replace(/\bother\b/, ""), x)).sort((a, b) => ptValue(a) - ptValue(b)).slice(0, n); list.forEach(x => ptSacrifice(x.uid)); paid.push(`sacrificed ${list.map(x => x.name).join(", ")}`); ab._sacPow = list.reduce((t, x) => t + ptPow(x), 0); }
  if (cost.exileSelf) { const f = ptFind(c.uid); if (f) { PT[f.zone].splice(f.i, 1); PT.exile.push(c); } paid.push("exiled it"); }
  if (cost.sacSelf) { ptSacrifice(c.uid); paid.push("sacrificed it"); }
  return paid;
}
function ptActivate(uid, i){
  const f = ptFind(uid); if (!f) return;
  const c = f.card, ab = trActivated(c)[i]; if (!ab) return;
  const nm = ptFaceName(c), why = ptCanPay(c, ab);
  if (why) { PT._fail = why; return toast(why); }
  // the mana part of the cost is paid like a spell's (lands, rocks, the pool), when paying is automatic
  const manaCost = String((ab.cost || {}).mana || "");
  let manaPlan = null;
  if (ptAutoMana() && PT.phase === "play" && /\{(?!x\})[^}]+\}/i.test(manaCost)) {
    manaPlan = ptPlan(manaCost.replace(/\{x\}/gi, ""), {uid: c.uid, name: nm, type: "", text: ""});
    if (manaPlan.missing) { const msg = `Not enough mana for ${nm}'s ability (${ptManaTxt(manaCost)}): missing ${ptManaTxt(manaPlan.missing)}.`; PT._fail = msg; return toast(msg); }
  }
  // a cost where you choose (sacrifice another creature, discard a card): choose first, then it's activated
  const cs = ab.cost || {};
  if (!ptAuto() && !ab._force && ab.kind !== "loyalty") {
    const sacN = cs.sac && cs.sac.length ? (/^(a|an|another)$/.test(cs.sac[0]) ? 1 : trNum(cs.sac[0])) : 0, disN = cs.discard && cs.discard.length && cs.discard[0] !== "your hand" ? trNum(cs.discard[0]) : 0;
    if (sacN || disN) return ptOpenPick({t: sacN ? "costSac" : "costDiscard", n: sacN || disN, phrase: sacN ? cs.sac[1].replace(/\bother\b/, "").trim() : (cs.discard[1] || "").trim()}, {srcUid: c.uid, srcName: nm},
      {onDone: (uids, auto) => { if (!auto) ab._force = uids; try { ptActivate(uid, i); } finally { delete ab._force; } }});
  }
  let dialog = null, pickAfter = null;
  ptDo(() => {
    if (manaPlan) ptApplyPlan(manaPlan, `${nm}'s ability`);
    c.used = c.used || {};
    if (ab.once || ab.oncePerTurn) c.used[ab.label] = PT.turn;
    if (ab.kind === "loyalty") {
      c.pwTurn = PT.turn;
      const x = typeof ab.loy === "number" ? ab.loy : (ab.loy === "+X" ? ptGuessX(c) : -Math.min((c.counters.loyalty || 0), Math.max(0, ptGuessX(c))));
      if (x > 0) ptAddCounters(c.uid, "loyalty", x); else if (x < 0) ptCounter(c.uid, "loyalty", x);
      ptLog(`${nm}: ${ab.cost} loyalty (now ${c.counters.loyalty || 0}).`);
      if (typeof ab.loy !== "number") ab._x = Math.abs(x);
    }
    const paid = ab.kind === "loyalty" ? [] : ptPayCosts(c, ab, nm);
    if (ab.cost && /\{X\}/.test(ab.cost.mana || "")) { ab._x = ptGuessX({cost: ab.cost.mana}); ptLog(`${nm}: X = ${ab._x} (from your lands).`); }
    if (paid.length && ab.kind !== "mana") ptLog(`${nm}: paid ${paid.join(", ")}.`);
    const k = ab.kind;
    if (k === "mana") { const w = ab.actions[0] && ab.actions[0].what || "mana"; if (ptAutoMana()) ptAddMana(w, nm); ptLog(`${nm}: ${paid.length ? paid.join(", ") + " → " : ""}add ${ptManaTxt(w)}.`); return; }
    if (k === "equip" || k === "reconfigure" || k === "fortify") {
      if (!ptAuto()) { pickAfter = {a: {t: "attachTo", label: `${k === "fortify" ? "Fortify" : "Equip"} ${nm}`}, p: {srcUid: c.uid, srcName: nm, img: c.img}}; return; }
      const host = (k === "fortify" ? PT.bf.filter(x => ptIsLand(x) && x.uid !== c.uid) : PT.bf.filter(x => ptIsCreature(x) && x.uid !== c.uid && x.uid !== c.att && x.att == null && (!ab.cost || !/legendary/.test(String(ab.cost).toLowerCase()) || /\bLegendary\b/.test(x.type))))
        .sort((a, b) => ((PT.combat || []).includes(b.uid) - (PT.combat || []).includes(a.uid)) || ptPow(b) - ptPow(a))[0];
      if (!host) return ptLog(`${nm}: no creature to attach to.`);
      c.att = host.uid; ptLog(`${nm}: ${k === "reconfigure" ? "reconfigured onto" : "equipped to"} ${ptNameOf(host)}.`); ptEmit("attach", c); return;
    }
    if (k === "crew" && !ptAuto()) { pickAfter = {a: {t: "crew", n: ab.n || 1, label: `Crew ${ab.n || 1}`}, p: {srcUid: c.uid, srcName: nm, img: c.img}}; return; }
    if (k === "crew" || k === "saddle") {
      const need = ab.n || 1, pool = PT.bf.filter(x => x.uid !== c.uid && ptIsCreature(x) && !x.tapped && !(PT.combat || []).includes(x.uid)).sort((a, b) => (a.since === PT.turn ? 0 : 1) - (b.since === PT.turn ? 0 : 1) || ptPow(a) - ptPow(b));
      const pick = []; let pw = 0;
      for (const x of pool) { if (pw >= need) break; pick.push(x); pw += Math.max(0, ptPow(x)); }
      if (pw < need) { const big = pool.slice().sort((a, b) => ptPow(b) - ptPow(a)); pick.length = 0; pw = 0; for (const x of big) { if (pw >= need) break; pick.push(x); pw += Math.max(0, ptPow(x)); } }
      if (pw < need) return ptLog(`${nm}: not enough untapped power to ${k} (${pw} of ${need}).`);
      pick.forEach(x => { x.tapped = true; });
      if (k === "crew") { c.eot = c.eot || {p: 0, t: 0, kw: []}; c.eot.cre = true; ptLog(`${nm} is crewed by ${pick.map(x => x.name).join(", ")}: it's a creature until end of turn.`); ptEmit("crewed", c); }
      else { c.saddled = PT.turn; ptLog(`${nm} is saddled by ${pick.map(x => x.name).join(", ")}.`); ptEmit("saddled", c); }
      return;
    }
    if (k === "station") { const x = PT.bf.filter(y => y.uid !== c.uid && ptIsCreature(y) && !y.tapped).sort((a, b) => ptPow(b) - ptPow(a))[0]; if (!x) return ptLog(`${nm}: no untapped creature to station with.`); x.tapped = true; ptAddCounters(c.uid, "charge", Math.max(0, ptPow(x))); ptLog(`${nm}: stationed with ${x.name} (+${ptPow(x)} charge).`); return; }
    if (k === "level up") { ptCounter(c.uid, "level", 1); ptLog(`${nm}: level ${c.counters.level}.`); return; }
    if (k === "outlast") { c.tapped = true; ptAddCounters(c.uid, "p1p1", 1); ptLog(`${nm}: outlast.`); return; }
    if (k === "cycling" || k === "typecycling") {
      ptDiscard(c.uid, "cycling"); ptEmit("cycle", c);
      if (k === "cycling") ptDraw(1);
      else ptResolve2({t: "searchAuto", n: 1, phrase: ab.cyc, to: "hand", label: ""}, {srcUid: c.uid, srcName: nm}, {src: ptFind(c.uid), done: []});
      return;
    }
    if (k === "ninjutsu") {
      const back = PT.bf.filter(x => (PT.combat || []).includes(x.uid)).sort((a, b) => ptPow(a) - ptPow(b))[0];
      if (!back) return;
      PT.combat = PT.combat.filter(u => u !== back.uid); ptMove(back.uid, "hand");
      ptMove(c.uid, "bf", {cast: false}); c.tapped = true; PT.combat.push(c.uid);
      ptLog(`${nm}: ninjutsu, swapped in for ${back.name} (it's attacking).`); return;
    }
    if (k === "scavenge") { PT.grave.splice(PT.grave.indexOf(c), 1); PT.exile.push(c); const host = ptPickOwn({}, {srcUid: c.uid})[0]; if (host) ptAddCounters(host.uid, "p1p1", Math.max(0, parseInt(c.power) || 0)); ptLog(`${nm}: scavenged${host ? " onto " + host.name : ""}.`); return; }
    if (k === "embalm" || k === "eternalize" || k === "encore") {
      PT.grave.splice(PT.grave.indexOf(c), 1); PT.exile.push(c);
      const t = Object.assign({}, c, {uid: ++ptUid, token: true, copyOf: c.name, counters: {}, tapped: false, z: ++PT.z, since: PT.turn, att: undefined});
      if (k === "embalm") { t.colors = ["W"]; t.type = c.type.replace(/—/, "— Zombie"); }
      if (k === "eternalize") { t.colors = ["B"]; t.power = "4"; t.toughness = "4"; t.type = c.type.replace(/—/, "— Zombie"); }
      if (k === "encore") { t.haste = true; PT.delayed = (PT.delayed || []).concat({uid: t.uid, act: "sac", why: "Encore"}); }
      [t.x, t.y] = ptPlace(t); PT.bf.push(t); ptEmit("token", t); ptEmit("etb", t);
      ptLog(`${nm}: ${k} → a token copy${k === "eternalize" ? " (4/4 black Zombie)" : k === "embalm" ? " (white Zombie)" : " with haste, sacrificed at the end step"}.`); return;
    }
    if (k === "transmute") { ptDiscard(c.uid, "transmute"); dialog = {t: "search"}; ptLog(`${nm}: transmute: search for a card with mana value ${c.cmc || 0}.`); return; }
    if (k === "craft") { ptMove(c.uid, "exile"); ptMove(c.uid, "bf", {cast: false}); if (ptCanTransform(c)) c.back = true; ptLog(`${nm}: crafted (returned transformed).`); return; }
    if (k === "bloodrush") { ptDiscard(c.uid, "bloodrush"); const host = ptPickOwn({attacking: true}, {srcUid: c.uid})[0]; if (host) { host.eot = host.eot || {p: 0, t: 0, kw: []}; host.eot.p += parseInt(c.power) || 0; host.eot.t += parseInt(c.toughness) || 0; } ptLog(`${nm}: bloodrush${host ? " onto " + host.name : ""}.`); return; }
    if (/^(auto|transfigure)$/.test(k)) { ptLog(`${nm}: ${ab.label} (do by hand).`); return; }
    // the Incubator token: {2}: transform it into a Phyrexian artifact creature
    if (c.token && c.name === "Incubator" && /transform/.test(ab.eff || "")) { Object.assign(c, {name: "Phyrexian", type: "Token Artifact Creature — Phyrexian", power: "0", toughness: "0", text: ""}); ptLog("The Incubator transformed into a Phyrexian artifact creature."); return; }
    // everything else uses the stack
    ptAddPrompt({srcUid: c.uid, srcName: nm, img: c.back && c.img ? c.img.replace("/front/", "/back/") : c.img, kind: k === "loyalty" ? "loyalty" : "ability", text: ab.label, eff: ab.eff, actions: ab.actions, xExpr: ab.xExpr, xVal: ab._x != null ? ab._x : null, amount: ab._sacPow,
      modes: null, conditional: trConditional("x, " + (ab.eff || "")) || /\byou may\b(?! draw| put| create| gain)/.test(ab.eff || "") && /\bif you do\b/.test(ab.eff || ""), fresh: true});
    ptEmit("activate", c);
  });
  if (dialog) ptOpenDialog(dialog);
  if (pickAfter) ptOpenPick(pickAfter.a, pickAfter.p);
}
/* ----- instants and sorceries on the stack ----- */
// The text of the half you cast (split cards, adventures, aftermath), or the whole card
function ptSpellText(c){
  const t = String(c.text || "");
  if (c.castFace == null || !(c.name || "").includes(" // ") || !t.includes("\n\n")) return t;
  const face = t.split("\n\n")[c.castFace] || t;
  return face.split("\n").slice(1).join("\n") || face;
}
function ptAddSpellPrompt(snap, opts = {}){
  if (!PT || PT.muted[snap.name]) return;
  const live = ((snap.uid != null && ptFind(snap.uid)) || {}).card || snap;
  let text = ptSpellText(live);
  if (live.overloaded) text = text.replace(/\btarget\b/gi, "each");
  const name = live.castFace != null && (live.name || "").includes(" // ") ? live.name.split(" // ")[live.castFace] : ptFaceName(live);
  const base = {srcUid: snap.uid, srcName: name, img: snap.img, kind: opts.copy ? "copy" : "spell", text: (opts.why ? `${opts.why}: ` : "") + text.replace(/\([^)]*\)/g, "").trim(), evUid: snap.uid, fresh: true, xVal: live.xPaid != null ? live.xPaid : null};
  const modes = trModes(text);
  if (modes) {
    const lines = modes.lines.map(l => { const e = trLower(live, l); return {text: l, eff: e, actions: trActions(e, name)}; });
    if (live.entwined) { const eff = lines.map(l => l.eff).join(" "); return ptAddPrompt(Object.assign(base, {eff, actions: lines.flatMap(l => l.actions), conditional: lines.some(l => trConditional("x, " + l.eff))})); }
    if (live.spree && live.spree.length) { const pick = lines.filter((l, i) => live.spree.includes(i)); const eff = pick.map(l => l.eff).join(" "); return ptAddPrompt(Object.assign(base, {eff, actions: pick.flatMap(l => l.actions)})); }
    return ptAddPrompt(Object.assign(base, {modes: lines, pick: modes.pick, upTo: modes.upTo, chosen: [], actions: [], conditional: true, choice: true}));
  }
  const r = trResolveIfs(trLower(live, text), {src: live, p: base});
  const eff = r.text, acts = trActions(eff, name);
  const xExpr = (eff.match(/where x is ([^.]+)/) || [])[1] || null;
  const condl = r.unknown || trConditional("x, " + eff.replace(/\bif you do\b/g, ""));
  const kws = ptKwPrinted(live).map(k => k.key);
  let copies = 1;
  if (!opts.copy) {
    if (kws.includes("storm")) { const n = Math.max(0, (PT.castN || 1) - 1); copies += n; if (n) ptLog(`Storm: ${name} is copied ${n} time${n > 1 ? "s" : ""}.`); }
    if (live.paid && live.paid.casualty) copies++;
    if (live.paid && live.paid.replicate) copies += live.paid.replicate;
    if (kws.includes("paradigm") && !(PT.paradigm || []).some(x => x.name === live.name)) { PT.paradigm = (PT.paradigm || []).concat({name: live.name, text: live.text, img: live.img}); ptLog(`Paradigm: ${name} will be copied at the start of each of your main phases.`); }
  }
  for (let k = 0; k < copies; k++)
    ptAddPrompt(Object.assign({}, base, {kind: k ? "copy" : base.kind, extra: k > 0, eff, actions: acts, xExpr, conditional: condl}));
}
// When it chooses for you: the most useful modes first (tokens, damage, cards, counters; removal only when there's a target)
function ptBestMode(p){
  const val = m => m.actions.reduce((t, a) => t + (a.t === "token" ? 6 + (+((a.def || {}).power) || 0) * (a.n || 1) : a.t === "opp" ? 4 + (a.n || 0) : a.t === "draw" ? 4 * (a.n || 1) : a.t === "counter" ? 3 : a.t === "life" ? 1
    : a.t === "oppNone" ? (a.tgt && ptOppTargets(a.tgt).length ? 5 : 0) : a.t === "pump" ? 2 : 1), 0) + (m.actions.length && trCovered(m.eff, m.actions) ? 1 : -2);
  return p.modes.map((m, i) => ({i, v: val(m)})).filter(x => !p.chosen.includes(x.i)).sort((a, b) => b.v - a.v)[0];
}
// clicking a mode of a modal spell on the stack
function ptPickMode(id, i){
  const p = PT.trig.find(x => x.id === id); if (!p || !p.modes || !p.modes[i]) return;
  let dialog = null;
  ptDo(() => {
    const m = p.modes[i]; p.chosen.push(i);
    const sub = Object.assign({}, p, {id: ++ptTrigId + "-mode", modes: null, choice: false, eff: m.eff, actions: m.actions, text: `${p.srcName}: ${m.text}`, conditional: trConditional("x, " + m.eff), fresh: true});
    if (p.chosen.length >= Math.min(p.pick, p.modes.length) || !p.upTo && p.chosen.length >= p.pick) PT.trig.splice(PT.trig.indexOf(p), 1);
    PT.trig.unshift(sub);
    if (ptSimple(sub) || !sub.actions.some(a => ["scry", "dig", "search", "grave"].includes(a.t))) {
      PT.trig.splice(PT.trig.indexOf(sub), 1);
      dialog = ptResolve(sub); ptNoteResolved(sub, false);
      if (!sub.actions.length) PT.trig.unshift(Object.assign(sub, {id: ++ptTrigId + "-hand"}));
    }
    ptLog(`${p.srcName}: chose "${m.text.slice(0, 60)}${m.text.length > 60 ? "…" : ""}".`);
  });
  ptOpenDialog(dialog);
}

/* ----- more ways to cast (rule 702 alternative and additional costs) ----- */
const PT_WAYS2 = {overload: "Overload", bestow: "Bestow", suspend: "Suspend", foretell: "Foretell", plot: "Plot", warp: "Warp", offspring: "Offspring", squad: "Squad", prototype: "Prototype",
  impending: "Impending", mtmte: "More Than Meets the Eye", sneak: "Sneak", webslinging: "Web-slinging", spectacle: "Spectacle", surge: "Surge", prowl: "Prowl", freerunning: "Freerunning",
  bargain: "Bargain", gift: "Gift", casualty: "Casualty", buyback: "Buyback", entwine: "Entwine", escalate: "Escalate (all modes)", replicate: "Replicate", miracle: "Miracle",
  harmonize: "Harmonize", mayhem: "Mayhem", jumpstart: "Jump-start", retrace: "Retrace", aftermath: "Aftermath", face0: "Cast the first half", face1: "Cast the second half", adventure: "Adventure",
  fromexile: "Cast from exile", teamwork: "Teamwork", spree: "Spree (all modes)", tiered: "Tiered", disguise: "Disguise", morph: "Morph", cleave: "Cleave", awaken: "Awaken", conspire: "Conspire"};
Object.assign(PT_WAYS, PT_WAYS2);
const PT_WAY_DESC = {overload: "every “target” becomes “each”", bestow: "an Aura on your best creature; a creature again if that one leaves", suspend: "exile it with time counters; cast free when the last one comes off",
  foretell: "exile it now, cast it on a later turn", plot: "exile it now, cast it free on a later turn", warp: "cast it now, exiled at the end step; cast it again later", offspring: "a 1/1 token copy too",
  squad: "a token copy too", prototype: "the smaller, cheaper version", impending: "enters with time counters, not a creature until they're gone", mtmte: "cast converted (back face)",
  sneak: "return an unblocked attacker; it comes in attacking", webslinging: "return a tapped creature of yours", spectacle: "cheaper after the opponent lost life", surge: "cheaper after another spell",
  prowl: "cheaper after combat damage", freerunning: "cheaper after an Assassin or commander hit", bargain: "sacrifice an artifact, enchantment or token", gift: "the opponent gets the gift", casualty: "sacrifice a creature, copy the spell",
  buyback: "it returns to your hand", entwine: "do every mode", escalate: "do every mode", replicate: "one extra copy", miracle: "cast it for its miracle cost", harmonize: "cast from the graveyard, then exiled",
  mayhem: "cast it from the graveyard (discarded this turn)", jumpstart: "discard a card, cast from the graveyard, then exiled", retrace: "discard a land, cast from the graveyard", aftermath: "cast the second half from the graveyard, then exiled",
  face0: "", face1: "", adventure: "cast the adventure, then the card waits in exile", fromexile: "foretold, plotted, warped, suspended or adventure cards", teamwork: "tap creatures to pay", spree: "all the extra modes",
  tiered: "the top tier", disguise: "face down as a 2/2 with ward {2}", morph: "face down as a 2/2", cleave: "without the bracketed words", awaken: "a land becomes a 0/0 creature with counters", conspire: "tap two creatures, copy it"};
function ptCastWays2(c, zone){
  const out = [], text = ptFaceText(c), kws = ptKwPrinted(c).map(k => k.key), perm = ptIsPermanentType(c);
  const add = (k, cost) => out.push({k, cost: cost || ""});
  const val = k => ((ptKwPrinted(c).find(x => x.key === k) || {}).val || "");
  if (zone === "hand") {
    for (const k of ["overload", "bestow", "foretell", "plot", "warp", "offspring", "squad", "prototype", "sneak", "spectacle", "surge", "prowl", "freerunning", "bargain", "gift", "casualty", "buyback", "entwine", "escalate", "replicate", "teamwork", "disguise", "morph", "cleave", "awaken", "conspire"])
      if (kws.includes(k)) add(k, val(k));
    if (kws.includes("suspend")) add("suspend", val("suspend"));
    if (kws.includes("impending")) add("impending", val("impending"));
    if (kws.includes("more than meets the eye")) add("mtmte", val("more than meets the eye"));
    if (kws.includes("web-slinging")) add("webslinging", val("web-slinging"));
    if (kws.includes("miracle")) add("miracle", val("miracle"));
    if (kws.includes("spree")) add("spree");
    if (kws.includes("tiered")) add("tiered");
    if ((c.name || "").includes(" // ") && !perm && !kws.includes("aftermath")) { const n = c.name.split(" // "); add("face0", n[0]); add("face1", n[1]); }
    if ((c.name || "").includes(" // ") && /Adventure/.test(c.type || "")) add("adventure", c.name.split(" // ")[1]);
    if (kws.includes("aftermath")) add("face0", c.name.split(" // ")[0]);
  } else if (zone === "grave") {
    if (kws.includes("harmonize")) add("harmonize", val("harmonize"));
    if (kws.includes("mayhem") && (PT.discTurn || {})[c.uid] === PT.turn) add("mayhem", val("mayhem"));
    if (kws.includes("jump-start")) add("jumpstart");
    if (kws.includes("retrace")) add("retrace");
    if (kws.includes("aftermath")) add("aftermath", (c.name || "").split(" // ")[1] || "");
  } else if (zone === "exile") add("fromexile");
  return out;
}
function ptCastWay2(uid, way){
  const f = ptFind(uid); if (!f) return false; const c = f.card, perm = ptIsPermanentType(c), name = c.name;
  const cast = (how, extra) => { Object.assign(c, extra || {}); ptMove(uid, perm || c.bestowAura ? "bf" : "grave", {cast: true, how}); };
  const paid = k => { c.paid = Object.assign({}, c.paid, {[k]: k === "replicate" || k === "squad" ? 1 : true}); };
  const valOf = k => ((ptKwPrinted(c).find(x => x.key === k) || {}).val || "");
  switch (way) {
    case "overload": c.overloaded = true; cast("overload"); break;
    case "bestow": {
      ptMove(uid, "bf", {cast: true, how: "bestow"}); c.bestowed = true;
      const host = PT.bf.filter(x => x.uid !== uid && ptIsCreature(x)).sort((a, b) => ptPow(b) - ptPow(a))[0];
      if (host) { c.att = host.uid; ptLog(`${name} is bestowed on ${host.name}.`); } else { c.bestowed = false; ptLog(`${name}: no creature to bestow on, so it's a creature.`); }
      break;
    }
    case "suspend": { const n = parseInt(valOf("suspend")) || 3; PT.hand.splice(f.i, 1); PT.exile.push(c); c.counters = Object.assign({}, c.counters, {time: n}); c.suspended = true; ptLog(`${name} is suspended with ${n} time counters.`); break; }
    case "foretell": case "plot": PT.hand.splice(f.i, 1); PT.exile.push(c); c[way === "plot" ? "plotted" : "foretold"] = PT.turn; ptLog(`${name} was ${way === "plot" ? "plotted" : "foretold"}: cast it from exile on a later turn.`); break;
    case "warp": cast("warp", {warped: true}); PT.delayed = (PT.delayed || []).concat({uid, act: "exile", why: "Warp"}); break;
    case "offspring": case "squad": case "spectacle": case "surge": case "prowl": case "freerunning": case "bargain": case "gift": case "teamwork": case "replicate": case "conspire": case "cleave":
      paid(way); if (way === "conspire") { PT.bf.filter(x => ptIsCreature(x) && !x.tapped).slice(0, 2).forEach(x => { x.tapped = true; }); c.paid.replicate = 1; } cast(way); break;
    case "casualty": {
      const n = parseInt(valOf("casualty")) || 1, sac = PT.bf.filter(x => ptIsCreature(x) && ptPow(x) >= n).sort((a, b) => ptValue(a) - ptValue(b))[0];
      if (sac) { ptSacrifice(sac.uid); paid("casualty"); } else ptLog(`${name}: no creature with power ${n} or more for casualty.`);
      cast("casualty"); break;
    }
    case "buyback": cast("buyback"); if (!perm) { const g = PT.grave.indexOf(c); if (g >= 0) { PT.grave.splice(g, 1); PT.hand.push(c); ptLog(`${name} returns to your hand (buyback).`); } } break;
    case "entwine": case "escalate": case "spree": case "tiered": c.entwined = way !== "tiered"; cast(way); break;
    case "prototype": { const m = ptFaceText(c).match(/Prototype[^—\n]*—\s*(\d+)\/(\d+)/); if (m) c.proto = [+m[1], +m[2]]; cast("prototype"); break; }
    case "impending": { c.impendingN = parseInt(valOf("impending")) || 4; cast("impending"); break; }
    case "mtmte": cast("converted"); c.back = ptCanTransform(c); break;
    case "sneak": case "webslinging": {
      const back = way === "sneak" ? PT.bf.filter(x => (PT.combat || []).includes(x.uid)).sort((a, b) => ptPow(a) - ptPow(b))[0] : PT.bf.filter(x => ptIsCreature(x) && x.tapped).sort((a, b) => ptValue(a) - ptValue(b))[0];
      if (!back) { toast(way === "sneak" ? "Sneak needs an attacking creature to return." : "Web-slinging needs a tapped creature of yours to return."); return true; }
      if (PT.combat) PT.combat = PT.combat.filter(u => u !== back.uid);
      ptMove(back.uid, "hand"); cast(way);
      if (way === "sneak" && perm && ptIsCreature(c)) { c.tapped = true; (PT.combat = PT.combat || []).push(c.uid); }
      break;
    }
    case "miracle": cast("miracle"); break;
    case "disguise": case "morph": ptMove(uid, "bf", {faceDown: true}); if (way === "disguise") c.cloak = true; ptLog(`${name} was cast face down (${way}).`); break;
    case "awaken": {
      cast("awaken");
      const land = PT.bf.filter(x => ptIsLand(x) && !x.anim).sort((a, b) => a.tapped - b.tapped)[0], n = parseInt(valOf("awaken")) || 3;
      if (land) { land.anim = {p: 0, t: 0}; land.haste = true; ptAddCounters(land.uid, "p1p1", n); ptLog(`Awaken ${n}: ${land.name} is a 0/0 Elemental creature with haste and ${n} +1/+1 counters.`); }
      break;
    }
    case "harmonize": case "jumpstart": case "aftermath": {
      if (way === "jumpstart") { const d = ptWorstCards(PT.hand)[0]; if (d) ptDiscard(d.uid, "jump-start"); }
      if (way === "aftermath") c.castFace = 1;
      if (way === "harmonize") { const t = PT.bf.filter(x => ptIsCreature(x) && !x.tapped).sort((a, b) => ptPow(b) - ptPow(a))[0]; if (t) { t.tapped = true; ptLog(`Harmonize: tapped ${t.name} to help pay.`); } }
      ptMove(uid, perm ? "bf" : "exile", {cast: true, how: way}); break;
    }
    case "mayhem": ptMove(uid, perm ? "bf" : "grave", {cast: true, how: "mayhem"}); break;
    case "retrace": { const d = PT.hand.find(ptIsLand); if (d) ptDiscard(d.uid, "retrace"); ptMove(uid, perm ? "bf" : "grave", {cast: true, how: "retrace"}); break; }
    case "face0": case "face1": c.castFace = way === "face0" ? 0 : 1; cast(c.castFace ? (c.name.split(" // ")[1]) : (c.name.split(" // ")[0])); break;
    case "adventure": {
      c.castFace = 1; PT.hand.splice(f.i, 1); PT.exile.push(c); c.adventure = true;
      PT.castN++; ptLog(`Cast ${c.name.split(" // ")[1]} (adventure); ${c.name.split(" // ")[0]} waits in exile.`);
      ptEmit("cast", c, {nth: PT.castN, from: "hand", adventure: true}); break;
    }
    case "fromexile": {
      delete c.castFace;
      const free = c.plotted || c.suspended;
      ptMove(uid, perm ? "bf" : "grave", {cast: true, how: c.foretold ? "foretold" : c.plotted ? "plotted" : c.adventure ? "from adventure" : c.warped ? "warped" : "from exile"});
      if (free) ptLog(`${name} was cast without paying its mana cost.`);
      ["foretold", "plotted", "adventure", "warped", "suspended"].forEach(k => delete c[k]);
      break;
    }
    default: return false;
  }
  return true;
}

/* ----- turn steps the engine looks after ----- */
function ptCleanup(){
  for (const c of PT.bf) { delete c.eot; c.dmg = 0; c.dt = false; }
  for (const o of PT.opps || []) for (const b of o.board) { b.dmg = 0; b.dt = false; if (b.eot) { b.power = String((+b.power || 0) - b.eot.p); b.toughness = String((+b.toughness || 0) - b.eot.t); delete b.eot; } }
  PT.endCombat = [];
}
function ptUpkeepRules(){
  // suspend: a time counter comes off each suspended card; when the last one goes, cast it free (creatures get haste)
  for (const c of PT.exile.slice()) {
    if (!c.suspended) continue;
    const n = (c.counters.time || 0) - 1;
    if (n > 0) { c.counters.time = n; ptLog(`${c.name}: ${n} time counter${n > 1 ? "s" : ""} left (suspend).`); continue; }
    delete c.counters.time;
    ptAddPrompt({srcUid: c.uid, srcName: c.name, img: c.img, kind: "suspend", text: "Suspend: the last time counter is gone, so cast it without paying its mana cost.", actions: [{t: "castCard", uid: c.uid, how: "suspend", haste: true, label: `Cast ${c.name} free`}], fresh: true});
    delete c.suspended;
  }
}
function ptMainRules(){
  // Sagas get a lore counter at the start of your precombat main phase
  for (const c of PT.bf.slice()) if (ptIsSaga(c) && !c.faceDown && c.since !== PT.turn) ptAddCounters(c.uid, "lore", 1);
  for (const x of PT.paradigm || []) ptAddPrompt({srcUid: null, srcName: x.name, img: x.img, kind: "paradigm", text: `Paradigm: cast a copy of ${x.name} without paying its mana cost.`, actions: [{t: "paradigm", name: x.name, text: x.text, img: x.img, label: `Cast a copy of ${x.name}`}], fresh: true});
}
function ptEndStepRules(){
  if (PT.monarch) { ptLog("The monarch draws a card."); ptDraw(1); }
  for (const c of PT.bf) if (c.impending && (c.counters.time || 0) > 0) { ptCounter(c.uid, "time", -1); ptLog(`${c.name}: a time counter comes off (impending)${c.counters.time ? "" : ", it's a creature now"}.`); }
  // day and night: a turn with no spells makes it night, two or more spells make it day
  if (PT.bf.some(c => ptKwPrinted(c).some(k => k.key === "daybound and nightbound"))) {
    const was = PT.day || "day";
    PT.day = (PT.castN || 0) === 0 ? "night" : (PT.castN || 0) >= 2 ? "day" : was;
    if (PT.day !== was) { for (const c of PT.bf) if (ptCanTransform(c) && /daybound|nightbound/i.test(c.text || "")) c.back = PT.day === "night"; ptLog(`It becomes ${PT.day}.`); }
  }
}
// The rules lookup in Help: every keyword ability and keyword action, searchable
function ptRulesHtml(q){
  q = String(q || "").toLowerCase().trim();
  const kw = PT_KWDB.filter(k => !q || k[1].toLowerCase().includes(q) || (q.length > 3 && k[3].toLowerCase().includes(q))).slice(0, 60);
  const ka = PT_KADB.filter(k => !q || k[1].toLowerCase().includes(q) || (q.length > 3 && k[2].toLowerCase().includes(q))).slice(0, 40);
  const open = q && kw.length + ka.length <= 3 ? " open" : "";
  return `${kw.map(k => `<details class="pt-rule"${open}><summary><b>${esc(k[1])}</b><span class="mono">702.${k[0]}</span></summary><p>${esc(k[3])}</p></details>`).join("")}
    ${ka.length ? `<div class="pt-rule-sep">Keyword actions</div>${ka.map(k => `<details class="pt-rule"${open}><summary><b>${esc(k[1])}</b><span class="mono">701.${k[0]}</span></summary><p>${esc(k[2])}</p></details>`).join("")}` : ""}
    ${!kw.length && !ka.length ? `<p class="cur-sub">Nothing matches “${esc(q)}”.</p>` : ""}`;
}

