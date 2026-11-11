/* ----- choosing for you: targets, sacrifices, discards, searches ----- */
const ptAuto = () => prefs.ptAutoPick === true;   // off: you make the choices (targets, sacrifices, searches…)
const ptManaTxt = s => String(s || "").replace(/\{[a-z0-9/]+\}/gi, x => x.toUpperCase());
const ptValue = c => (c.commander ? 1000 : 0) + (c.token ? 0 : 20) + (c.cmc || 0) * 3 + (ptIsCreature(c) ? Math.max(0, ptPow(c)) : 0) + (ptIsLand(c) ? 8 : 0);
const ptHasEtb = c => trAbilities(c).some(ab => ab.conds.some(k => k.ev === "etb" && (k.who === "self" || k.who === "selfOrOther")));
// your creatures for a helpful "target creature": attackers first in combat, then the biggest
function ptPickOwn(a, p, filter){
  const src = ptFind(p.srcUid);
  let list = PT.bf.filter(c => (ptIsCreature(c) || c.faceDown) && c.att == null);
  if (a.attacking) list = list.filter(c => (PT.combat || []).includes(c.uid));
  if (a.other && src) list = list.filter(c => c.uid !== src.card.uid);
  if (filter) list = list.filter(filter);
  if (PT.combat && PT.combat.length) { const att = list.filter(c => PT.combat.includes(c.uid)); if (att.length) list = att; }
  list.sort((x, y) => ptPow(y) - ptPow(x) || (y.z || 0) - (x.z || 0));
  return list.slice(0, a.n || 1);
}
// lands: the basic type your hand and commander need most and you have least of
const PT_LAND_COLOR = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"};
function ptLandScore(c){
  const need = {}; for (const x of PT.hand.concat(PT.cmd, PT.bf.filter(b => !ptIsLand(b)))) for (const s of String(x.cost || "").match(/\{[WUBRG]\}/g) || []) need[s[1]] = (need[s[1]] || 0) + 1;
  const have = {}; for (const l of PT.bf.filter(ptIsLand)) for (const t of ptFaceType(l).match(/\b(Plains|Island|Swamp|Mountain|Forest)\b/g) || []) have[PT_LAND_COLOR[t]] = (have[PT_LAND_COLOR[t]] || 0) + 1;
  const cols = (ptFaceType(c).match(/\b(Plains|Island|Swamp|Mountain|Forest)\b/g) || []).map(t => PT_LAND_COLOR[t]);
  if (!PT._cols) PT._cols = new Set(PT_ZONES.flatMap(z => PT[z]).filter(x => !ptIsLand(x)).flatMap(x => (String(x.cost || "").match(/\{[WUBRG]\}/g) || []).map(s => s[1]).concat(x.colors || [])));
  return cols.reduce((s, k) => s + (need[k] || 0) * 3 - (have[k] || 0) * 2 + (PT._cols.has(k) ? 4 : -8), 0) + cols.length;
}
// the "best" card: a land if you're short on lands, otherwise the biggest thing you could cast soon
function ptBestCard(list){
  const lands = PT.bf.filter(ptIsLand).length, handLands = PT.hand.filter(ptIsLand).length;
  const score = c => ptIsLand(c) ? (lands + handLands < 5 ? 50 + ptLandScore(c) : 5 + ptLandScore(c) / 10) : 30 + Math.min(c.cmc || 0, lands + 2) * 4 - Math.max(0, (c.cmc || 0) - lands - 2) * 6;
  return list.slice().sort((a, b) => score(b) - score(a));
}
// what to throw away: extra lands late, otherwise the card you'll cast last
function ptWorstCards(list){
  const lands = PT.bf.filter(ptIsLand).length;
  const score = c => ptIsLand(c) ? (lands >= 5 ? 0 : 40) : 30 - Math.max(0, (c.cmc || 0) - lands - 1) * 8 + (c.cmc || 0);
  return list.slice().sort((a, b) => score(a) - score(b));
}
function ptDiscard(uid, why){
  const f = ptFind(uid); if (!f || f.zone !== "hand") return;
  PT.hand.splice(f.i, 1); PT.grave.push(f.card); PT.discTurn = PT.discTurn || {}; PT.discTurn[uid] = PT.turn;
  ptLog(`Discarded ${f.card.name}${why ? ` (${why})` : ""}.`); ptEmit("discard", f.card);
}
// automatic scry / surveil: keep what you need on top
function ptAutoScry(n, surveil){
  const top = PT.lib.splice(0, Math.min(n, PT.lib.length)), lands = PT.bf.filter(ptIsLand).length + PT.hand.filter(ptIsLand).length;
  const keep = [], away = [];
  for (const c of top) (ptIsLand(c) ? lands < 5 : (c.cmc || 0) <= lands + 1) ? keep.push(c) : away.push(c);
  PT.lib.unshift(...keep);
  if (surveil) PT.grave.push(...away); else PT.lib.push(...away);
  ptLog(`${surveil ? "Surveil" : "Scry"} ${n}: kept ${keep.length} on top${away.length ? `, ${away.length} to the ${surveil ? "graveyard" : "bottom"} (${away.map(c => c.name).join(", ")})` : ""}.`);
}
// targets of an effect: the creatures it means right now (or [] when it hits the opponent's side)
function ptTargets(a, p, ctx){
  const src = ctx.src, it = ctx.it, sc = src && src.zone === "bf" ? src.card : null;
  const cre = c => (ptIsCreature(c) || c.faceDown) && c.att == null;
  switch (a.who || (a.on === "self" ? "self" : a.on === "it" ? "it" : null)) {
    case "self": return sc ? [sc] : [];
    case "it": return it && it.zone === "bf" ? [it.card] : sc ? [sc] : [];
    case "made": return (ctx.made || []).map(u => PT.bf.find(c => c.uid === u)).filter(Boolean);
    case "host": return sc && sc.att != null ? PT.bf.filter(c => c.uid === sc.att) : [];
    case "pick":
      if (!ptAuto()) { ptTarget({kind: "act", a, p: {srcUid: p.srcUid, srcName: p.srcName, evUid: p.evUid, amount: p.amount, xVal: ptXOf(p)}, label: `Click a creature: ${a.label}`}); return null; }
      return ptPickOwn(a, p);
    case "all": return PT.bf.filter(cre);
    case "allOther": return PT.bf.filter(c => cre(c) && !(sc && c.uid === sc.uid));
    case "attacking": return PT.bf.filter(c => (PT.combat || []).includes(c.uid));
    case "attackingOther": return PT.bf.filter(c => (PT.combat || []).includes(c.uid) && !(sc && c.uid === sc.uid));
    case "each": return PT.bf.filter(c => !(a.other && sc && c.uid === sc.uid) && !c.faceDown && trFits(a.phrase, c));
    case "opp": return [];
  }
  return [];
}
function ptPump(c, a, p){
  c.eot = c.eot || {p: 0, t: 0, kw: []};
  const amt = a.count || a.px || a.tx ? ptAmt(Object.assign({}, a, {x: !!(a.px || a.tx) && !a.count}), p) : 1;
  if (a.doubleP) c.eot.p += Math.max(0, ptPow(c));
  if (a.count && !a.px && !a.tx) { c.eot.p += a.p * amt; c.eot.t += a.tt * amt; }
  else { c.eot.p += a.p + (a.px || 0) * amt; c.eot.t += a.tt + (a.tx || 0) * amt; }
  for (const k of a.kws || []) if (!c.eot.kw.includes(k)) c.eot.kw.push(k);
}
// Carry out the newer kinds of action. Returns true when it handled the action.
function ptResolve2(a, p, ctx){
  const src = ctx.src, sc = src ? src.card : null, done = ctx.done, nm = p.srcName;
  const n = ptAmt(a, p);
  switch (a.t) {
    case "pump": {
      if (a.who === "opp") { const x = ptOppTargets({phrase: "creature"}, {dmg: -Math.min(0, a.tt || 0)})[0]; if (x && (a.p || a.tt)) ptHitOppCre(x, "shrink", nm, 0, {p: a.p || 0, t: a.tt || 0}); else ptLog(`${nm}: ${a.label}.`); break; }
      const list = ptTargets(a, p, ctx); if (list === null) break;
      list.forEach(c => ptPump(c, a, p));
      if (list.length) ptLog(`${nm}: ${list.length > 3 ? list.length + " creatures" : list.map(ptNameOf).join(", ")} ${a.label.replace(/^Gains/, "gain")}.`);
      break;
    }
    case "dmgAll": {
      const m = ptMods(), dmg = n * m.dmgX, dt = sc && ptHasKw(sc, "deathtouch");
      const fits = c => (!a.non || !new RegExp("\\b" + a.non + "\\b", "i").test(c.type || "")) && (a.tapped == null || !!c.tapped === a.tapped);
      if (!a.opp) for (const c of PT.bf.filter(x => (ptIsCreature(x) || x.faceDown) && x.att == null)) {
        if (a.other && sc && c.uid === sc.uid) continue;
        if (!fits(c)) continue;
        if (a.flying === true && !ptHasKw(c, "flying")) continue;
        if (a.flying === false && ptHasKw(c, "flying")) continue;
        if (a.pw && ptPow(c) > +a.pw) continue;
        c.dmg = (c.dmg || 0) + dmg; if (dt) c.dt = true;
        if (sc && ptHasKw(sc, "wither") || sc && ptHasKw(sc, "infect")) ptAddCounters(c.uid, "m1m1", dmg);
      }
      // and the opponents' creatures
      for (const o of PT.opps || []) for (const b of o.board.slice()) {
        if (!fits(b) || a.flying === true && !ptOkw(b, "flying") || a.flying === false && ptOkw(b, "flying") || a.pw && (+b.power || 0) > +a.pw) continue;
        ptHitOppCre({o, b}, "damage", nm, dmg, {dt});
      }
      if (a.players) { PT.life -= dmg; ptEmit("loselife", null, {amount: dmg}); ptDealOpp(n, nm, sc, true, "each"); }
      else if (a.opps) ptDealOpp(n, nm, sc, true, "each");
      ptOppsCheck();
      ptLog(`${nm}: ${a.label}.`);
      break;
    }
    case "wipe": {
      const ph = a.phrase.replace(/\b(other|each|all)\b/g, " ").replace(/\band\b/g, "or").replace(/\s+/g, " ").trim();
      if (/\bcreatures?\b|\bpermanents?\b/.test(ph) && !/\byou control\b/.test(ph) && PT.opps) { let k2 = 0; for (const o of PT.opps) for (const b of o.board.slice()) { if (a.how === "destroy" && ptOkw(b, "indestructible")) continue; o.board.splice(o.board.indexOf(b), 1); k2++; } if (k2) ptLog(`${nm}: ${k2} of the opponents' creatures ${a.how === "bounce" ? "returned to hand" : a.how === "exile" ? "exiled" : "destroyed"}.`); }
      if (/you don't control|your opponents control|an opponent controls|of the chosen color/.test(ph)) { ptLog(`${nm}: ${a.label} (none of yours).`); break; }
      const hit = PT.bf.filter(c => !(/\bother\b/.test(a.phrase) && sc && c.uid === sc.uid) && c.att == null && trFits(ph.replace(/ (?:you control|on the battlefield)$/, ""), c));
      let k = 0;
      for (const c of hit) {
        if (a.how === "destroy") { if (ptHasKw(c, "indestructible")) continue; if (c.regen) { c.regen--; c.tapped = true; continue; } ptMove(c.uid, "grave"); }
        else if (a.how === "exile") ptMove(c.uid, "exile"); else if (a.how === "tuck" || a.how === "tucktop") ptMove(c.uid, "lib", {bottom: a.how === "tuck"}); else ptMove(c.uid, "hand");
        k++;
      }
      ptLog(`${nm}: ${a.label}: ${k} of yours ${a.how === "bounce" ? "returned" : a.how === "exile" ? "exiled" : /tuck/.test(a.how) ? "put into the library" : "destroyed"}.`);
      break;
    }
    case "pickDo": {
      if (!ptAuto()) { ptTarget({kind: "act", a, p: {srcUid: p.srcUid, srcName: nm}, label: `Click your ${a.phrase}: ${a.label}`}); break; }
      let list = PT.bf.filter(c => !c.faceDown && trFits(a.phrase, c) && !(sc && c.uid === sc.uid && /another|other/.test(a.label)));
      list = a.how === "bounce" ? list.filter(c => !c.token).sort((x, y) => (ptHasEtb(y) - ptHasEtb(x)) || (y.cmc || 0) - (x.cmc || 0)) : list.sort((x, y) => ptValue(x) - ptValue(y));
      for (const c of list.slice(0, a.n || 1)) { if (a.how === "bounce") ptMove(c.uid, "hand"); else if (a.how === "destroy") ptMove(c.uid, "grave"); else if (a.how === "exile") ptMove(c.uid, "exile"); else if (a.how === "tap") c.tapped = true; ptLog(`${nm}: picked ${c.name} (${a.how}).`); }
      break;
    }
    case "sacYou": {
      let list = PT.bf.filter(c => !(a.other && sc && c.uid === sc.uid) && trFits(a.phrase || "permanent", c));
      list = list.sort((x, y) => ptValue(x) - ptValue(y)).slice(0, n);
      if (!list.length) { ptLog(`${nm}: nothing to sacrifice.`); break; }
      list.forEach(c => ptSacrifice(c.uid));
      p.result = "sacrificed " + list.map(c => c.name).join(", ");
      break;
    }
    case "discard": {
      if (!PT.hand.length) { ptLog(`${nm}: no cards to discard.`); break; }
      const pick = a.hand ? PT.hand.slice() : a.random ? shuffle(PT.hand.slice()).slice(0, n) : ptWorstCards(PT.hand).slice(0, n);
      pick.forEach(c => ptDiscard(c.uid, nm)); ctx.discarded = pick;
      p.result = "discarded " + pick.map(c => c.name).join(", ");
      break;
    }
    case "oppNone": {
      if (a.oppSac && PT.opps) {   // "each opponent sacrifices a creature": they give up their least useful one
        const who = a.oppSac.each ? ptLiveOpps() : [ptOppT()];
        let k2 = 0;
        for (const o of who) for (let k = 0; k < a.oppSac.n && o.board.length; k++) { const b = o.board.slice().sort((x, y) => ((+x.power || 0) + (+x.toughness || 0)) - ((+y.power || 0) + (+y.toughness || 0)))[0]; o.board.splice(o.board.indexOf(b), 1); k2++; ptLog(`${nm}: ${o.name} sacrifices ${b.name}.`); }
        if (!k2) ptLog(`${nm}: ${a.label} (they have no creatures).`);
        break;
      }
      const t = a.tgt;
      if (t && t.how) {
        const dmg = t.how === "damage" ? ptAmt({n: t.n, x: t.x}, p) * ptMods().dmgX : 0, dt = !!(sc && ptHasKw(sc, "deathtouch"));
        const list = ptOppTargets(t, {dmg, dt}).slice(0, Math.max(1, t.n && t.how !== "damage" ? t.n : 1));
        if (list.length) { list.forEach(x => ptHitOppCre(x, t.how, nm, dmg, {dt})); ptOppsCheck(); break; }
      }
      ptLog(`${nm}: ${a.label}${t && t.how ? " (no opponent has one to hit)" : ""}.`); break;
    }
    case "note": ptLog(`${nm}: ${a.label}.`); break;
    case "castGy": {
      // the best one there: a mana ritual or card draw first, then the most expensive
      const list = PT.grave.filter(c => trFits(a.phrase, c) && !(sc && c.uid === sc.uid));
      const score = c => (/\badd \{/i.test(c.text || "") ? 100 : 0) + (/\bdraw/i.test(c.text || "") ? 50 : 0) + (c.cmc || 0);
      const pick = list.sort((x, y) => score(y) - score(x))[0];
      if (!pick) { ptLog(`${nm}: no ${a.phrase} card in your graveyard to cast.`); break; }
      ptLog(`${nm}: cast ${pick.name} from your graveyard for free.`);
      ptMove(pick.uid, ptIsPermanentType(pick) ? "bf" : "exile", {cast: true, how: "from the graveyard"});
      break;
    }
    case "role": {
      if (/opponent/.test(a.on)) { const x = ptOppTargets({phrase: "creature"})[0]; ptLog(`${nm}: a ${trCap(a.role)} Role goes on ${x ? x.o.name + "'s " + x.b.name : "an opponent's creature"} (tracked by hand).`); break; }
      const host = /^(it|cardname|that creature)$/.test(a.on) ? (ctx.it && ctx.it.zone === "bf" ? ctx.it.card : sc && PT.bf.includes(sc) ? sc : null)
        : PT.bf.filter(c => ptIsCreature(c) && !(/another|other/.test(a.on) && sc && c.uid === sc.uid)).sort((x, y) => ptPow(y) - ptPow(x))[0];
      if (!host) { ptLog(`${nm}: no creature for the ${trCap(a.role)} Role.`); break; }
      const ROLE = {royal: "Enchanted creature gets +1/+1 and has ward {1}.", monster: "Enchanted creature gets +1/+1 and has trample.", wicked: "Enchanted creature gets +2/+1.\nWhen this Aura is put into a graveyard from the battlefield, each opponent loses 1 life.",
        "young hero": "Enchanted creature has \"Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.\"", sorcerer: "Enchanted creature gets +1/+1 and has \"Whenever this creature attacks, scry 1.\"",
        virtuous: "Enchanted creature gets +1/+1 for each enchantment you control.", cursed: "Enchanted creature has base power and toughness 1/1.", huntsman: "Enchanted creature gets +1/+1 and has \"{T}: Add {G}.\""};
      const r = trCap(a.role), t = ptMakeCard({name: `${r} Role`, type: "Token Enchantment — Aura Role", text: ROLE[a.role] || "Enchanted creature gets +1/+1.", colors: []}, {token: true});
      [t.x, t.y] = ptPlace(t); t.z = ++PT.z; t.since = PT.turn; t.att = host.uid;
      // a creature can only have one Role from you: a new one replaces the old
      for (const o of PT.bf.filter(o => o.att === host.uid && /\bRole\b/.test(o.type || ""))) ptMove(o.uid, "grave");
      PT.bf.push(t); ptEmit("token", t); ptEmit("etb", t);
      ptLog(`${nm}: a ${r} Role on ${ptNameOf(host)}.`); break;
    }
    case "oppAll": {
      for (const o of PT.opps || []) for (const b of o.board.slice()) {
        if (a.how === "tap") b.tapped = true; else if (a.how === "noblock") b.noBlock = PT.turn; else ptHitOppCre({o, b}, "shrink", nm, 0, {p: a.p, t: a.tt});
      }
      ptLog(`${nm}: ${a.label}.`); break;
    }
    case "impulse": {
      const k = Math.min(n || 1, PT.lib.length), got = PT.lib.splice(0, k);
      got.forEach(c => { c.impulse = PT.turn + (a.next ? 1 : 0); PT.exile.push(c); });
      ptLog(`${nm}: exiled ${got.map(c => c.name).join(", ") || "nothing (the library is empty)"}${got.length ? `: you may play ${got.length > 1 ? "them" : "it"} ${a.next ? "until the end of your next turn" : "this turn"} (click Exile → Play)` : ""}.`);
      break;
    }
    case "selfMove": {
      if (!src || src.zone !== "bf" && a.to !== "exile" && a.to !== "hand") { ptLog(`${nm}: ${a.label} (it isn't on the battlefield).`); break; }
      const u = sc.uid;
      if (a.to === "sac") { if (src.zone === "bf") ptSacrifice(u); }
      else if (a.to === "hand") ptMove(u, "hand"); else if (a.to === "exile") ptMove(u, "exile");
      else if (a.to === "top" || a.to === "bottom") ptMove(u, "lib", {bottom: a.to === "bottom"});
      else if (a.to === "shuffle") { ptMove(u, "lib", {bottom: true}); ptShuffle(); }
      ptLog(`${nm}: ${a.label.toLowerCase()}.`); break;
    }
    case "powDmg": {
      const it = ctx.it, who = (it && it.card) || sc, pw = who ? Math.max(0, ptPow(who)) : 0;
      if (!pw) { ptLog(`${nm}: it has no power, so no damage.`); break; }
      if (/^(any target|each opponent|target opponent|target player|that player|defending player)$/.test(a.to)) {
        const x = a.to === "any target" ? ptOppTargets({phrase: "creature"}, {dmg: pw}).find(y => pw >= (+y.b.toughness || 0) && ((+y.b.power || 0) >= 4 || ptOkw(y.b, "deathtouch"))) : null;
        if (x) ptHitOppCre(x, "damage", nm, pw * ptMods().dmgX); else ptDealOpp(pw, nm, who, true, a.to === "each opponent" ? "each" : undefined);
      } else if (a.to === "each creature") { for (const o of PT.opps) for (const b of o.board.slice()) ptHitOppCre({o, b}, "damage", nm, pw); }
      else { const x = ptOppTargets({phrase: "creature"}, {dmg: pw})[0]; if (x) ptHitOppCre(x, "damage", nm, pw * ptMods().dmgX); else ptLog(`${nm}: no creature to hit.`); }
      ptOppsCheck(); break;
    }
    case "copySpell": {
      const last = PT.lastSpell;
      if (!last) { ptLog(`${nm}: there's no spell to copy.`); break; }
      ptAddSpellPrompt(last, {copy: true, why: nm});
      break;
    }
    case "mana": PT.manaLog = a.what; if (ptAutoMana()) ptAddMana(a.what, nm); ptLog(`${nm}: add ${ptManaTxt(a.what)}.`); break;
    case "extraTurn": PT.extraTurns = (PT.extraTurns || 0) + (a.n || 1); ptLog(`${nm}: you'll take an extra turn after this one.`); break;
    case "monarch": if (!PT.monarch) { PT.monarch = true; ptLog("You became the monarch: draw a card at the beginning of your end step."); } break;
    case "flagPT": PT[a.k] = true; ptLog(`${nm}: ${a.label}.`); break;
    case "fromGrave": {
      let list = PT.grave.filter(c => !(a.other && sc && c.uid === sc.uid) && (!a.phrase || trFits(a.phrase, c)) && (a.to !== "bf" || ptIsPermanentType(c)));
      if (a.filt) { const mv = a.filt.match(/mana value (\d+) or less/), pw = a.filt.match(/power (\d+) or less/); if (mv) list = list.filter(c => (c.cmc || 0) <= +mv[1]); if (pw) list = list.filter(c => ptPow(c) <= +pw[1]); }
      list = a.all ? list : ptBestCard(list).sort((x, y) => (y.cmc || 0) - (x.cmc || 0)).slice(0, n || 1);
      if (!list.length) { ptLog(`${nm}: nothing fitting in your graveyard.`); p.result = "nothing to return"; break; }
      for (const c of list) { if (a.to === "bf") { ptMove(c.uid, "bf", {cast: false}); if (a.tapped) c.tapped = true; } else { PT.grave.splice(PT.grave.indexOf(c), 1); PT.hand.push(c); } }
      ptLog(`${nm}: returned ${list.map(c => c.name).join(", ")} to ${a.to === "bf" ? "the battlefield" : "your hand"}.`); p.result = list.map(c => c.name).join(", ");
      p._it = ptFind(list[0].uid);
      break;
    }
    case "selfFromGrave": {
      const f = src && src.zone === "grave" ? src : null; if (!f) break;
      if (a.to === "bf") { ptMove(f.card.uid, "bf", {cast: false}); if (a.tapped) f.card.tapped = true; } else { PT.grave.splice(PT.grave.indexOf(f.card), 1); PT.hand.push(f.card); }
      ptLog(`${nm}: returned from the graveyard.`); break;
    }
    case "searchAuto": {
      const fits = c => trFits(a.phrase, c) && (!a.filt || trFits("x with " + a.filt, c));
      let list = PT.lib.filter(fits);
      const landish = /\bland\b|plains|island|swamp|mountain|forest|basic/.test(a.phrase);
      list = landish ? list.slice().sort((x, y) => ptLandScore(y) - ptLandScore(x) || (/Basic/.test(y.type) - /Basic/.test(x.type))) : ptBestCard(list);
      const got = [];
      for (const c of list) { if (got.length >= (n || 1)) break; if (landish && got.some(g => g.name === c.name) && list.some(o => !got.includes(o) && o.name !== c.name && !got.some(g => g.name === o.name))) continue; got.push(c); }
      if (got.length < (n || 1)) for (const c of list) { if (got.length >= (n || 1)) break; if (!got.includes(c)) got.push(c); }
      got.forEach((c, i) => {
        const to = a.to === "split" ? (i === 0 ? "bf" : "hand") : a.to;
        PT.lib.splice(PT.lib.indexOf(c), 1);
        if (to === "bf") { PT.lib.unshift(c); ptMove(c.uid, "bf", {cast: false}); if (a.tapped) c.tapped = true; }
        else if (to === "hand") PT.hand.push(c); else if (to === "grave") PT.grave.push(c); else PT.lib.unshift(c);
      });
      if (a.to !== "top") ptLibShuffle(); else { const t = got; PT.lib = PT.lib.filter(c => !t.includes(c)); ptLibShuffle(); PT.lib.unshift(...t); }
      ptLog(got.length ? `${nm}: searched for ${got.map(c => c.name).join(", ")}.` : `${nm}: searched, found nothing that fits.`);
      p.result = got.length ? got.map(c => c.name).join(", ") : "found nothing";
      break;
    }
    case "landHand": {
      const list = ptBestCard(PT.hand.filter(c => trFits(a.phrase, c))).slice(0, a.n || 1);
      if (!list.length) { ptLog(`${nm}: no ${a.phrase} in hand.`); break; }
      list.forEach(c => { ptMove(c.uid, "bf", {cast: false}); if (a.tapped) c.tapped = true; });
      ptLog(`${nm}: put ${list.map(c => c.name).join(", ")} onto the battlefield.`); break;
    }
    case "lookBack": {
      const top = PT.lib.splice(0, Math.min(a.n, PT.lib.length)), lands = PT.bf.filter(ptIsLand).length + PT.hand.filter(ptIsLand).length;
      const good = ptBestCard(top);
      if (good.length && !good.some(c => ptIsLand(c) ? lands < 5 : (c.cmc || 0) <= lands + 1)) { PT.lib.push(...good); ptLibShuffle(); ptLog(`${nm}: nothing useful on top, so shuffled.`); }
      else { PT.lib.unshift(...good); ptLog(`${nm}: looked at ${top.length} and put the best on top.`); }
      break;
    }
    case "putBack": {
      const put = ptWorstCards(PT.hand).slice(0, a.n);
      put.forEach(c => { PT.hand.splice(PT.hand.indexOf(c), 1); if (a.where === "top") PT.lib.unshift(c); else PT.lib.push(c); });
      ptLog(`${nm}: put ${put.length} card${put.length === 1 ? "" : "s"} from your hand on the ${a.where} of your library.`); break;
    }
    case "distribute": {
      const list = ptPickOwn({n: a.k}, p); if (!list.length) break;
      for (let i = 0; i < a.n; i++) ptAddCounters(list[i % list.length].uid, "p1p1", 1);
      ptLog(`${nm}: distributed ${a.n} +1/+1 counters on ${list.map(c => c.name).join(", ")}.`); break;
    }
    case "sacUnless": {
      const other = PT.bf.filter(c => (!sc || c.uid !== sc.uid) && trFits(a.phrase, c)).sort((x, y) => ptValue(x) - ptValue(y))[0];
      if (other) ptSacrifice(other.uid); else if (sc) ptSacrifice(sc.uid);
      ptLog(`${nm}: sacrificed ${other ? other.name : "itself"}.`); break;
    }
    case "drainSum": { const lost = ptDealOpp(n, nm, sc, false, "each"); ptGain(lost, nm); break; }
    case "eachLose": { PT.life -= n; ptEmit("loselife", null, {amount: n}); ptDealOpp(n, nm, sc, false, "each"); ptLog(`${nm}: each player loses ${n}.`); break; }
    case "doubleCtr": {
      const list = /each/.test(a.on) ? PT.bf.filter(ptIsCreature) : ptTargets({who: /target/.test(a.on) ? "pick" : /cardname/.test(a.on) ? "self" : "it"}, p, ctx) || [];
      list.forEach(c => { const k = (c.counters || {})[a.kind] || 0; if (k) ptAddCounters(c.uid, a.kind, k); });
      ptLog(`${nm}: doubled the counters.`); break;
    }
    case "heal": PT.bf.forEach(c => { c.dmg = 0; c.dt = false; }); ptLog(`${nm}: damage healed.`); break;
    case "regen": { const list = /target/.test(a.on) ? ptPickOwn({}, p) : sc ? [sc] : []; list.forEach(c => { c.regen = (c.regen || 0) + 1; }); ptLog(`${nm}: regeneration shield.`); break; }
    case "amass": {
      let army = PT.bf.find(c => /\bArmy\b/.test(ptFaceType(c)));
      if (!army) { ptCreateToken({name: `${a.type === "Army" ? "Zombie" : a.type} Army`, type: `Token Creature — ${a.type === "Army" ? "Zombie" : a.type} Army`, power: "0", toughness: "0", colors: ["B"], text: ""}, 1); army = PT.bf[PT.bf.length - 1]; }
      ptAddCounters(army.uid, "p1p1", n); ptLog(`${nm}: amass ${n}.`); break;
    }
    case "populate": {
      const tok = PT.bf.filter(c => c.token && ptIsCreature(c)).sort((x, y) => ptPow(y) - ptPow(x))[0];
      if (tok) ptCopy(tok.uid, 1 * ptTokenMult(tok)); else ptLog(`${nm}: no creature token to populate.`); break;
    }
    case "connive": case "recruit": {
      ptDraw(1);
      const d = ptWorstCards(PT.hand)[0];
      if (d) { ptDiscard(d.uid, a.t); if (!ptIsLand(d)) { if (a.t === "connive") { const who = (a.on === "cardname" ? sc : (ctx.it || src || {}).card) || sc; if (who && PT.bf.includes(who)) ptAddCounters(who.uid, "p1p1", 1); } else ptCreateToken({name: "Human Soldier", type: "Token Creature — Human Soldier", power: "1", toughness: "1", colors: ["W"]}, 1 * ptTokenMult({type: "Creature"})); } }
      break;
    }
    case "adapt": { if (!sc) break; if (a.monster || !(sc.counters.p1p1 > 0)) { ptAddCounters(sc.uid, "p1p1", n); if (a.monster) { sc.monstrous = true; ptEmit("monstrous", sc); } } ptLog(`${nm}: ${a.label}.`); break; }
    case "bolster": { const c = PT.bf.filter(ptIsCreature).sort((x, y) => ptTou(x) - ptTou(y))[0]; if (c) ptAddCounters(c.uid, "p1p1", n); ptLog(`${nm}: bolster ${n}${c ? " on " + c.name : ""}.`); break; }
    case "support": { ptPickOwn({n: a.n, other: true}, p).forEach(c => ptAddCounters(c.uid, "p1p1", 1)); ptLog(`${nm}: support ${a.n}.`); break; }
    case "manifest": {
      if (a.dread) {
        const two = PT.lib.splice(0, 2); if (!two.length) break;
        const pick = two.slice().sort((x, y) => ptIsCreature(y) - ptIsCreature(x))[0];
        PT.grave.push(...two.filter(c => c !== pick)); PT.lib.unshift(pick); ptMove(pick.uid, "bf", {faceDown: true, cast: false});
        ptLog(`${nm}: manifested dread (${two.length > 1 ? "the other card went to the graveyard" : "one card"}).`); break;
      }
      for (let i = 0; i < (a.n || 1) && PT.lib.length; i++) { const c = PT.lib[0]; ptMove(c.uid, "bf", {faceDown: true, cast: false}); if (a.cloak) c.cloak = true; }
      ptLog(`${nm}: ${a.cloak ? "cloaked" : "manifested"} the top card (a 2/2 face down).`); break;
    }
    case "incubate": {
      ptCreateToken({name: "Incubator", type: "Token Artifact — Incubator", colors: [], text: "{2}: Transform this artifact."}, 1);
      const t = PT.bf[PT.bf.length - 1]; ptAddCounters(t.uid, "p1p1", n); ptLog(`${nm}: incubate ${n}.`); break;
    }
    case "endure": {
      // endure N: +1/+1 counters, or an N/N white Spirit token. It makes the token (you can undo and add counters instead).
      if (n > 0) { ptCreateToken({name: "Spirit", type: "Token Creature — Spirit", power: String(n), toughness: String(n), colors: ["W"], text: ""}, ptTokenMult({type: "Token Creature — Spirit"})); }
      ptLog(`${nm}: endure ${n} (made a ${n}/${n} Spirit token).`); break;
    }
    case "forage": {
      if (PT.grave.length >= 3) { const ex = ptWorstCards(PT.grave).slice(0, 3); ex.forEach(c => { PT.grave.splice(PT.grave.indexOf(c), 1); PT.exile.push(c); }); ptLog(`${nm}: foraged (exiled ${ex.map(c => c.name).join(", ")}).`); }
      else { const food = PT.bf.find(c => /\bFood\b/.test(c.type)); if (food) ptSacrifice(food.uid); ptLog(`${nm}: foraged${food ? " (sacrificed a Food)" : " (couldn't)"}.`); }
      break;
    }
    case "flag": { const who = a.on === "cardname" ? sc : a.on && /target/.test(a.on) ? ptPickOwn({}, p)[0] : ((ctx.it || src || {}).card || sc); if (who) { who[a.k] = a.k === "exerted" ? PT.turn : true; } ptLog(`${nm}: ${a.label}.`); break; }
    case "blight": { const c = PT.bf.filter(x => ptIsCreature(x)).sort((x, y) => (x.token ? 0 : 1) - (y.token ? 0 : 1) || ptTou(y) - ptTou(x))[0]; if (c) ptAddCounters(c.uid, "m1m1", a.n); ptLog(`${nm}: blight ${a.n}${c ? " on " + c.name : ""}.`); break; }
    case "earthbend": {
      const land = PT.bf.filter(c => ptIsLand(c) && !c.anim && c.att == null).sort((x, y) => (x.tapped ? 1 : 0) - (y.tapped ? 1 : 0))[0];
      if (!land) { ptLog(`${nm}: no land to earthbend.`); break; }
      land.anim = {p: 0, t: 0}; land.haste = true; land.earth = true; ptAddCounters(land.uid, "p1p1", n);
      ptLog(`${nm}: earthbend ${n}: ${land.name} is a 0/0 creature with haste and ${n} +1/+1 counters.`); break;
    }
    case "evidence": ptCollectEvidence(a.n, nm); break;
    case "attachTok": {
      const k = 1 * ptTokenMult(a.def); ptCreateToken(a.def, k);
      const t = PT.bf[PT.bf.length - 1]; if (sc && PT.bf.includes(sc) && t) { sc.att = t.uid; ptLog(`${nm} is attached to the ${a.def.name}.`); }
      break;
    }
    case "attachTo": { const host = ptPickOwn({other: true}, p)[0]; if (sc && host) { sc.att = host.uid; ptLog(`${nm} attached to ${host.name}.`); } break; }
    case "mentor": {
      if (!sc) break; const mine = ptPow(sc);
      const c = PT.bf.filter(x => (PT.combat || []).includes(x.uid) && x.uid !== sc.uid && ptPow(x) < mine).sort((x, y) => ptPow(y) - ptPow(x))[0];
      if (c) { ptAddCounters(c.uid, "p1p1", 1); ptLog(`${nm} mentors ${c.name}.`); } else ptLog(`${nm}: no attacker with less power to mentor.`);
      break;
    }
    case "modular": {
      const k = (p.snap && p.snap.counters && p.snap.counters.p1p1) || 0;
      const c = PT.bf.filter(x => ptIsCreature(x) && /\bArtifact\b/.test(ptFaceType(x))).sort((x, y) => ptPow(y) - ptPow(x))[0];
      if (k && c) { ptAddCounters(c.uid, "p1p1", k); ptLog(`${nm}: modular moved ${k} +1/+1 counter${k > 1 ? "s" : ""} to ${c.name}.`); } else ptLog(`${nm}: modular had nowhere to go.`);
      break;
    }
    case "riot": {
      if (!sc) break;
      if (PT.attackedTurn !== PT.turn) { sc.haste = true; ptLog(`${nm}: riot → haste.`); p.result = "haste"; }
      else { ptAddCounters(sc.uid, "p1p1", 1); ptLog(`${nm}: riot → +1/+1 counter.`); p.result = "+1/+1 counter"; }
      break;
    }
    case "endCombatSac": if (sc) { PT.endCombat = (PT.endCombat || []).concat(sc.uid); } break;
    case "tick": {
      if (!sc) break;
      const had = sc.counters[a.kind] || 0;
      if (!had) { if (a.sacIfNone) { ptLog(`${nm}: no ${a.kind} counters left, it's sacrificed.`); ptSacrifice(sc.uid); } break; }
      ptCounter(sc.uid, a.kind, -1);
      if (a.sacAtZero && had === 1) { ptLog(`${nm}: the last time counter was removed, it's sacrificed.`); ptSacrifice(sc.uid); }
      break;
    }
    case "poison": ptPoisonOpp(n, p.evUid != null && PT.atkOpp && PT.atkOpp[p.evUid] != null ? PT.atkOpp[p.evUid] : undefined); break;
    case "castCard": { const f = ptFind(a.uid); if (f && (f.zone === "hand" || f.zone === "exile" || f.zone === "grave")) { ptMove(a.uid, ptIsPermanentType(f.card) ? "bf" : "grave", {cast: true, how: a.how}); if (a.haste && ptIsCreature(f.card)) f.card.haste = true; } break; }
    case "paradigm": { const f = PT.exile.find(c => c.name === a.name) || PT.grave.find(c => c.name === a.name) || PT.lib.find(c => c.name === a.name); ptAddSpellPrompt(f ? ptSnap(f) : {name: a.name, text: a.text, type: "Sorcery", img: a.img, uid: -1}, {copy: true, why: "Paradigm"}); break; }
    default: return false;
  }
  return true;
}
function ptCollectEvidence(n, why){
  let need = n; const list = PT.grave.slice().sort((a, b) => (b.cmc || 0) - (a.cmc || 0)), ex = [];
  for (const c of list) { if (need <= 0) break; if ((c.cmc || 0) > 0) { ex.push(c); need -= c.cmc; } }
  ex.forEach(c => { PT.grave.splice(PT.grave.indexOf(c), 1); PT.exile.push(c); });
  ptLog(`${why}: collected evidence ${n}${ex.length ? ` (exiled ${ex.map(c => c.name).join(", ")})` : ""}.`);
  return need <= 0;
}

