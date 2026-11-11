/* ----- choices: when a card says "target" or "choose", you pick (or let it pick) in the side panel ----- */
let PT_PICK = null, ptDoDepth = 0, ptAsking = false;
// Does this action need you to choose something? (With "Make choices for me" on, nothing does.)
function ptNeedsPick(a){
  if (!a || ptAuto() || a._picked) return false;
  switch (a.t) {
    case "pump": return a.who === "pick";
    case "pickDo": case "sacUnless": case "becomecopy": case "attachTo": case "distribute": case "support": case "mentor": case "modular": case "putBack": case "landHand": case "sacYou": case "searchAuto": return true;
    case "discard": return !a.hand && !a.random;
    case "fromGrave": return !a.all;
    case "counter": return a.on === "target";
    case "untap": return a.on === "target";
    case "blink": return !!a.target;
    case "copy": return a.of === "target";
    case "explore": return a.on === "target";
    case "oppNone": return !!a.tgt && !ptOppTargets(a.tgt).length;
  }
  return false;
}
// What you can choose from, and how many
function ptPickSpec(a, p){
  const f = ptFind(p.srcUid), sc = f ? f.card : null, nm = p.srcName || (sc && sc.name) || "";
  const cre = c => (ptIsCreature(c) || c.faceDown) && c.att == null;
  const notSelf = c => !sc || c.uid !== sc.uid;
  const S = (title, cards, min, max, extra) => Object.assign({title, cards, min: Math.min(min, cards.length), max: Math.max(1, Math.min(max, cards.length || 1))}, extra || {});
  const other = /another|other/.test(a.label || "") || a.other;
  switch (a.t) {
    case "pump": return S(`${nm}: choose a creature (${a.label})`, PT.bf.filter(c => cre(c) && (!a.attacking || (PT.combat || []).includes(c.uid)) && (!other || notSelf(c))), 1, a.n || 1);
    case "pickDo": return S(`${nm}: choose your ${a.phrase} (${a.how})`, PT.bf.filter(c => !c.faceDown && trFits(a.phrase, c) && (!other || notSelf(c))), 1, a.n || 1);
    case "sacYou": { const list = PT.bf.filter(c => !(a.other && sc && c.uid === sc.uid) && trFits(a.phrase || "permanent", c)); return S(`${nm}: choose what to sacrifice (${a.n || 1})`, list, a.may ? 0 : (a.n || 1), a.n || 1, {skip: a.may ? "Don't sacrifice" : ""}); }
    case "sacUnless": return S(`${nm}: sacrifice a ${a.phrase}, or ${nm} itself`, PT.bf.filter(c => notSelf(c) && trFits(a.phrase, c)), 0, 1, {skip: `Sacrifice ${nm} instead`});
    case "discard": return S(`${nm}: choose ${a.n > 1 ? a.n + " cards" : "a card"} to discard`, PT.hand.slice(), a.n || 1, a.n || 1);
    case "putBack": return S(`${nm}: choose ${a.n} card${a.n > 1 ? "s" : ""} to put on the ${a.where} of your library`, PT.hand.slice(), a.n, a.n);
    case "fromGrave": {
      let list = PT.grave.filter(c => !(a.other && sc && c.uid === sc.uid) && (!a.phrase || trFits(a.phrase, c)) && (a.to !== "bf" || ptIsPermanentType(c)));
      if (a.filt) { const mv = a.filt.match(/mana value (\d+) or less/), pw = a.filt.match(/power (\d+) or less/); if (mv) list = list.filter(c => (c.cmc || 0) <= +mv[1]); if (pw) list = list.filter(c => ptPow(c) <= +pw[1]); }
      return S(`${nm}: choose from your graveyard → ${a.to === "bf" ? "battlefield" : "hand"}`, list, a.upTo ? 0 : 1, a.n || 1, {skip: "Nothing"});
    }
    case "searchAuto": {
      const fits = c => trFits(a.phrase, c) && (!a.filt || trFits("x with " + a.filt, c)), seen = new Set();
      const list = PT.lib.filter(c => fits(c) && !seen.has(c.name) && seen.add(c.name)).sort((x, y) => x.name.localeCompare(y.name));
      return S(`${nm}: search for ${a.label.replace(/^Search for /, "")}`, list, 0, a.n || 1, {skip: "Find nothing", lib: true, note: a.to === "split" ? "The first one you pick goes onto the battlefield tapped, the second into your hand." : ""});
    }
    case "landHand": return S(`${nm}: put a ${a.phrase} from your hand onto the battlefield`, PT.hand.filter(c => trFits(a.phrase, c)), 0, a.n || 1, {skip: "Don't"});
    case "counter": return S(`${nm}: choose a creature for ${a.label.replace(/ on a creature you pick$/, "")}`, PT.bf.filter(c => cre(c) && (!other || notSelf(c))), 1, 1);
    case "untap": return S(`${nm}: choose what to untap`, PT.bf.filter(c => c.tapped && (/land/.test(a.label) ? ptIsLand(c) : true)), 0, 1, {skip: "Nothing"});
    case "blink": return S(`${nm}: choose a creature to ${a.delay ? "exile until the end step" : "blink"}`, PT.bf.filter(c => cre(c) && (!/another/.test(p.eff || "") || notSelf(c))), 1, 1);
    case "copy": return S(`${nm}: choose what to copy`, PT.bf.filter(c => !c.faceDown && notSelf(c) && c.att == null), 1, 1);
    case "explore": return S(`${nm}: choose the creature that explores`, PT.bf.filter(cre), 1, 1);
    case "becomecopy": return S(`${nm}: choose a creature for it to copy`, PT.bf.filter(c => cre(c) && c.uid !== p.srcUid), 0, 1, {skip: "Enter as itself"});
    case "attachTo": {
      const t = sc ? ptFaceText(sc).toLowerCase() : "", land = /fortify|enchant (?:land|[a-z]+ land|forest|island|swamp|mountain|plains)/.test(t + " " + (sc ? sc.type : "").toLowerCase());
      return S(`${a.label || "Attach " + nm}: choose ${land ? "a land" : "a creature"}`, PT.bf.filter(c => notSelf(c) && c.att == null && (land ? ptIsLand(c) : cre(c)) && c.uid !== (sc && sc.att)), 0, 1, {skip: "Leave it unattached"});
    }
    case "distribute": return S(`${nm}: choose up to ${a.k} creatures to share ${a.n} +1/+1 counters`, PT.bf.filter(cre), 1, a.k);
    case "support": return S(`${nm}: choose up to ${a.n} other creatures (+1/+1 counter each)`, PT.bf.filter(c => cre(c) && notSelf(c)), 0, a.n, {skip: "None"});
    case "mentor": return S(`${nm}: mentor an attacker with less power`, PT.bf.filter(c => (PT.combat || []).includes(c.uid) && notSelf(c) && sc && ptPow(c) < ptPow(sc)), 0, 1, {skip: "None"});
    case "modular": return S(`${nm}: move its +1/+1 counters to an artifact creature`, PT.bf.filter(c => cre(c) && /\bArtifact\b/.test(ptFaceType(c))), 0, 1, {skip: "Nowhere"});
    case "crew": return S(`${a.label}: tap creatures with total power ${a.n} or more`, PT.bf.filter(c => cre(c) && notSelf(c) && !c.tapped), 1, 99, {power: a.n});
    case "oppNone": {
      const t = a.tgt, list = PT.bf.filter(c => !c.faceDown && c.att == null && trFits(t.phrase.replace(/\b(an opponent controls|you don't control|your opponents control)\b/, "").trim() || "permanent", c));
      return S(`${nm}: ${a.label.replace(/ \(none on this table\)/, "")}`, list, 0, t.n || 1, {skip: "Target the opponent's (not on this table)", note: "The opponent has no permanents here. Pick one of yours if you want to hit your own."});
    }
    case "costSac": return S(`${nm}: choose what to sacrifice to pay the cost`, PT.bf.filter(c => notSelf(c) && trFits(a.phrase, c)), a.n, a.n);
    case "costDiscard": return S(`${nm}: choose ${a.n > 1 ? a.n + " cards" : "a card"} to discard to pay the cost`, PT.hand.filter(c => notSelf(c) && (!a.phrase || trFits(a.phrase, c))), a.n, a.n);
  }
  return S(nm, [], 0, 1);
}
// Do the action with the cards you chose
function ptApplyPick(a, p, cards){
  const f = ptFind(p.srcUid), sc = f ? f.card : null, nm = p.srcName || (sc && sc.name) || "";
  const names = cards.map(c => c.name).join(", ");
  switch (a.t) {
    case "pump": cards.forEach(c => ptPump(c, a, p)); if (cards.length) ptLog(`${nm}: ${names} ${a.label}.`); break;
    case "pickDo": cards.forEach(c => { if (a.how === "bounce") ptMove(c.uid, "hand"); else if (a.how === "destroy") ptMove(c.uid, "grave"); else if (a.how === "exile") ptMove(c.uid, "exile"); else if (a.how === "tap") c.tapped = true; }); ptLog(`${nm}: ${a.how} ${names}.`); break;
    case "sacYou": case "costSac": cards.forEach(c => ptSacrifice(c.uid)); if (!cards.length) ptLog(`${nm}: didn't sacrifice.`); break;
    case "sacUnless": if (cards.length) ptSacrifice(cards[0].uid); else if (sc && f.zone === "bf") ptSacrifice(sc.uid); break;
    case "discard": case "costDiscard": cards.forEach(c => ptDiscard(c.uid, nm)); break;
    case "putBack": cards.forEach(c => { PT.hand.splice(PT.hand.indexOf(c), 1); if (a.where === "top") PT.lib.unshift(c); else PT.lib.push(c); }); ptLog(`${nm}: put ${cards.length} card${cards.length === 1 ? "" : "s"} on the ${a.where} of your library.`); break;
    case "fromGrave":
      for (const c of cards) { if (a.to === "bf") { ptMove(c.uid, "bf", {cast: false}); if (a.tapped) c.tapped = true; } else { PT.grave.splice(PT.grave.indexOf(c), 1); PT.hand.push(c); } }
      if (cards.length) { ptLog(`${nm}: returned ${names} to ${a.to === "bf" ? "the battlefield" : "your hand"}.`); p._it = ptFind(cards[0].uid); } else ptLog(`${nm}: returned nothing.`);
      break;
    case "searchAuto":
      cards.forEach((c, i) => {
        const to = a.to === "split" ? (i === 0 ? "bf" : "hand") : a.to;
        PT.lib.splice(PT.lib.indexOf(c), 1);
        if (to === "bf") { PT.lib.unshift(c); ptMove(c.uid, "bf", {cast: false}); if (a.tapped) c.tapped = true; } else if (to === "hand") PT.hand.push(c); else if (to === "grave") PT.grave.push(c); else PT.lib.unshift(c);
      });
      if (a.to === "top") { PT.lib = PT.lib.filter(c => !cards.includes(c)); ptLibShuffle(); PT.lib.unshift(...cards); } else ptLibShuffle();
      ptLog(cards.length ? `${nm}: searched for ${names}, then shuffled.` : `${nm}: searched and found nothing, then shuffled.`); break;
    case "landHand": cards.forEach(c => { ptMove(c.uid, "bf", {cast: false}); if (a.tapped) c.tapped = true; }); break;
    case "counter": cards.forEach(c => a.noMods ? ptCounter(c.uid, a.kind, ptAmt(a, p)) : ptAddCounters(c.uid, a.kind, ptAmt(a, p))); if (cards.length) ptLog(`${nm}: ${a.label.replace(/ on a creature you pick$/, "")} on ${names}.`); break;
    case "untap": cards.forEach(c => { c.tapped = false; }); if (cards.length) ptLog(`${nm}: untapped ${names}.`); break;
    case "blink": cards.forEach(c => ptBlink(c.uid, !!a.delay)); break;
    case "copy": cards.forEach(c => ptCopy(c.uid, (a.n || 1) * ptTokenMult(c))); break;
    case "explore": cards.forEach(c => ptExplore(c.uid, p)); break;
    case "becomecopy": if (sc) delete sc.cloning; if (cards[0]) ptBecomeCopy(p.srcUid, cards[0].uid); else ptLog(`${nm} entered as itself.`); break;
    case "attachTo": if (cards[0] && sc) { sc.att = cards[0].uid; ptLog(`${nm} attached to ${ptNameOf(cards[0])}.`); ptEmit("attach", sc); } break;
    case "distribute": for (let i = 0; i < a.n && cards.length; i++) ptAddCounters(cards[i % cards.length].uid, "p1p1", 1); ptLog(`${nm}: put ${a.n} +1/+1 counters on ${names}.`); break;
    case "support": cards.forEach(c => ptAddCounters(c.uid, "p1p1", 1)); break;
    case "mentor": cards.forEach(c => ptAddCounters(c.uid, "p1p1", 1)); if (cards.length) ptLog(`${nm} mentors ${names}.`); break;
    case "modular": { const k = (p.snap && p.snap.counters && p.snap.counters.p1p1) || 0; if (k && cards[0]) { ptAddCounters(cards[0].uid, "p1p1", k); ptLog(`${nm}: moved ${k} +1/+1 counters to ${cards[0].name}.`); } break; }
    case "crew": cards.forEach(c => { c.tapped = true; }); if (sc) { sc.eot = sc.eot || {p: 0, t: 0, kw: []}; sc.eot.cre = true; ptLog(`${nm} is crewed by ${names}.`); ptEmit("crewed", sc); } break;
    case "oppNone": {
      if (!cards.length) { ptLog(`${nm}: ${a.label}.`); break; }
      const t = a.tgt;
      for (const c of cards) {
        if (t.how === "destroy") { if (ptHasKw(c, "indestructible")) ptLog(`${c.name} is indestructible.`); else ptMove(c.uid, "grave"); }
        else if (t.how === "exile") ptMove(c.uid, "exile"); else if (t.how === "bounce") ptMove(c.uid, "hand"); else if (t.how === "tap") c.tapped = true;
        else if (t.how === "damage") { c.dmg = (c.dmg || 0) + ptAmt({n: t.n, x: t.x}, p) * ptMods().dmgX; if (sc && ptHasKw(sc, "deathtouch")) c.dt = true; }
      }
      ptLog(`${nm}: ${t.how} ${names} (your own).`); break;
    }
  }
}
// Open the chooser in the side panel
function ptOpenPick(a, p, opts = {}){
  const spec = ptPickSpec(a, p);
  PT_PICK = {a, p, spec, sel: [], restId: opts.restId || null, onDone: opts.onDone || null, done: false};
  if (!spec.cards.length && !spec.skip) { toast(`${p.srcName || "That"}: there's nothing to choose.`); return ptPickFinish([]); }
  ptRenderPick();
}
function ptRenderPick(){
  const v = PT_PICK; if (!v) return;
  const s = v.spec, n = v.sel.length, pw = s.power ? v.sel.reduce((t, u) => t + Math.max(0, ptPow((s.cards.find(c => c.uid === u) || {}))), 0) : 0;
  const ok = s.power ? pw >= s.power : n >= s.min && n <= s.max && n > 0;
  const ttl = s.title.split(": "), head = ttl.length > 1 ? ttl[0] : "Choose", ask = ttl.length > 1 ? ttl.slice(1).join(": ") : s.title;
  ptModal(head, `<p class="pt-pick-ask">${esc(ask[0].toUpperCase() + ask.slice(1))}</p>${s.note ? `<p class="cur-sub">${esc(s.note)}</p>` : ""}
    <p class="cur-sub">${s.power ? `Total power ${pw} of ${s.power}` : s.max > 1 ? `Choose ${s.min === s.max ? s.max : `up to ${s.max}`}` : "Choose one"} · click a card${s.lib ? " (your library is shuffled after)" : ""}.</p>
    <div class="ptd-grid pt-pick">${s.cards.map(c => { const on = v.sel.includes(c.uid);
      return `<button type="button" class="ptd-card pt-pick-card${on ? " on" : ""}" data-d="pick" data-uid="${c.uid}" aria-pressed="${on}"><span class="ptd-img">${ptFace(c)}</span><b>${esc(ptNameOf(c))}</b><small class="cur-sub">${[ptIsCreature(c) && !c.faceDown ? ptPT(c) : "", c.tapped ? "tapped" : "", c.token ? "token" : "", Object.keys(c.counters || {}).length ? Object.entries(c.counters).map(([k, x]) => `${x} ${ptCounterName(k)}`).join(", ") : ""].filter(Boolean).join(" · ") || "&nbsp;"}</small></button>`; }).join("") || `<div class="pt-stack-empty">Nothing fits.</div>`}</div>`,
    `<button class="btn ghost" type="button" data-d="pickauto" title="Let the playtester choose">Pick for me</button>${s.skip ? `<button class="btn ghost" type="button" data-d="pickskip">${esc(s.skip)}</button>` : ""}<span class="sp"></span><button class="btn primary" type="button" data-d="pickdone" ${ok ? "" : "disabled"}>${s.power ? "Crew" : "Done"}${n ? ` (${n})` : ""}</button>`);
  $("ptModal").dataset.pick = "1";
  // the same cards light up on the table, and you can click them there too
  const ids = new Set(s.cards.map(c => c.uid));
  document.querySelectorAll("#ptBf .ptc[data-uid]").forEach(el => { const u = +el.dataset.uid; el.classList.toggle("pickable", ids.has(u)); el.classList.toggle("picked", v.sel.includes(u)); });
}
function ptPickToggle(uid){
  const v = PT_PICK; if (!v) return;
  const i = v.sel.indexOf(uid);
  if (i >= 0) v.sel.splice(i, 1);
  else { if (v.spec.max === 1 && !v.spec.power) v.sel = []; if (v.sel.length < v.spec.max || v.spec.power) v.sel.push(uid); }
  ptRenderPick();
}
// Finish a choice: do it, then let the rest of the card's effect carry on
function ptPickFinish(uids, auto){
  const v = PT_PICK || {a: null}; PT_PICK = null;
  if (v.a) v.done = true;
  $("ptModal").dataset.pick = ""; ptCloseModal();
  if (!v.a) return;
  if (v.onDone) return v.onDone(uids, auto);
  ptDo(() => {
    if (auto) { const keep = prefs.ptAutoPick; prefs.ptAutoPick = true; try { ptResolve(Object.assign({}, v.p, {actions: [v.a]})); } finally { prefs.ptAutoPick = keep; } }
    else ptApplyPick(v.a, v.p, uids.map(u => (ptFind(u) || {}).card).filter(Boolean));
    const rest = v.restId && PT.trig.find(x => x.id === v.restId);
    if (rest) { rest.fresh = true; if (v.p._it) rest._it = v.p._it; }
  });
}
// Closing the chooser without deciding puts the choice back on the stack
function ptPickAbandon(){
  const v = PT_PICK; if (!v || v.done) return; PT_PICK = null;
  if (v.onDone) return;
  PT.trig.unshift({id: ++ptTrigId + "-pick", srcUid: v.p.srcUid, srcName: v.p.srcName, img: v.p.img, kind: v.p.kind || "ability", text: `Choose: ${v.a.label}`, actions: [v.a], eff: null, snap: v.p.snap, amount: v.p.amount, xVal: v.p.xVal});
}
// In Auto mode, when a trigger or spell is waiting only for your choice, open the chooser straight away
function ptMaybeAsk(){
  if (ptAsking || !PT || PT.phase !== "play" || ptMode() !== "auto" || ptAuto() || PT_PICK || !$("ptModal").hidden || (PT.chain && PT.chain.paused)) return;
  const choosey = a => ptNeedsPick(a) || ["scry", "dig", "search", "grave"].includes(a.t);
  const p = PT.trig.find(x => !x.conditional && !x.modes && !x.choice && x.actions.length && x.actions.some(choosey) && (x.eff == null || trCovered(x.eff, x.actions)));
  if (!p || PT.trig.indexOf(p) !== 0) return;
  ptAsking = true;
  try { ptDoPrompt(p.id); } finally { ptAsking = false; }
}

