/* ----- checking a found win by playing it out in the Playtest's rules engine -----
   The finder has its own quick model of the game. To be sure a line can really happen, it's replayed in the Playtest:
   same opening hand, the same cards drawn in the same order, each land played, each spell cast the same way and paid
   for with real mana, each ability used, triggers resolved, the same attacks. If a step can't be done (not enough
   mana, a second land drop the rules don't allow, a card that isn't there), or the opponent isn't dead at the end,
   the line didn't hold up. Returns {ok, turn, how, steps: [{t, txt, ok, why}], why}. */
function fwReplay(d, win, o){
  const best = win.best, steps = [];
  const keep = {PT, render: ptRender, st: window.setTimeout, stB: window.setTimeout.bind(window), shuffle: ptShuffle, view: PT_VIEW, pick: typeof PT_PICK !== "undefined" ? PT_PICK : null,
    prefs: {ptTrigMode: prefs.ptTrigMode, ptAutoPick: prefs.ptAutoPick, ptAutoMana: prefs.ptAutoMana, ptDrawT1: prefs.ptDrawT1, ptOppN: prefs.ptOppN}};
  const q = [];
  window.setTimeout = (fn, ms, ...a) => { if ((!ms || ms < 50) && typeof fn === "function") { q.push(() => fn(...a)); return 0; } return keep.stB(fn, ms, ...a); };
  ptRender = () => {};
  const modal = () => document.getElementById("ptModal");
  const settle = () => {
    for (let i = 0; i < 80; i++) {
      let k = 0; while (q.length && k++ < 200) q.shift()();
      if (typeof PT_PICK !== "undefined" && PT_PICK) { ptPickFinish([], true); continue; }
      const m = modal();
      if (PT_VIEW && PT_VIEW.kind === "attack" && m && !m.hidden) return;   // the attack window waits for the attackers
      if (m && !m.hidden) {
        const b = m.querySelector("#ptXgo, [data-blkgo], [data-legkeep]");
        if (b) { b.click(); continue; }
        if (PT_VIEW && PT_VIEW.kind === "search") {
          // take the next planned card that fits (the planned cards are in order at the top of the library)
          // a search that puts a card on top takes the next planned card; others take one that isn't planned for later (so the planned draws stay put)
          const v = PT_VIEW, fits = c => !v.what || trFits(v.what, c);
          const planned = new Set(PT.lib.slice(0, plannedLeft()).map(c => c.uid));
          const pick = v.to === "top" ? PT.lib.find(fits) : (PT.lib.find(c => fits(c) && !planned.has(c.uid)) || PT.lib.find(fits));
          if (pick) {
            if (v.to === "top") v.held = [pick.uid];
            else { const to = v.to === "bf" ? "bf" : v.to === "grave" ? "grave" : v.to === "bottom" ? "lib" : "hand"; ptDo(() => { ptMove(pick.uid, to, to === "lib" ? {bottom: true} : {}); if (v.tapped) pick.tapped = true; }); }
          }
          ptSearchDone(); continue;
        }
        const d0 = m.querySelector("[data-d=scrydone], [data-d=digdone], [data-dig=apply]"); if (d0) { d0.click(); if (!m.hidden) ptCloseModal(); continue; }
        ptCloseModal(); continue;
      }
      if (PT.trig.length) { const p0 = PT.trig[0]; if (p0.modes) { const b = ptBestMode(p0); if (b) ptPickMode(p0.id, b.i); else PT.trig.shift(); continue; } ptDoPrompt(p0.id); if (PT.trig[0] === p0) PT.trig.shift(); continue; }
      if (PT.targeting) { PT.targeting = null; continue; }
      return;
    }
  };
  const step = (t, txt, ok, why) => { steps.push({t, txt, ok, why: why || ""}); return ok; };
  let plannedLeft = () => 0, planHand = [], planSeq = [];   // how many cards at the top of the library are still the planned draws
  let result = null;
  try {
    prefs.ptTrigMode = "auto"; prefs.ptAutoPick = true; prefs.ptAutoMana = true; prefs.ptDrawT1 = !!o.drawFirst; prefs.ptOppN = 1;
    PT = ptNew(d); PT._noShuffle = true;   // you choose your draws here, so shuffles keep the planned order
    PT.opps = [ptOppMake(0, 1, o.isCmd)]; PT.opps[0].life = o.life || PT.opps[0].life; PT.oppT = 0; ptOppSync();
    // the same cards in the same order: the opening hand, then every card it got, in the order it got them
    const ex = fwExplain(best, o), all = PT.lib.concat(PT.hand); PT.hand = []; PT.lib = [];
    const take = nm => { const i = nm ? all.findIndex(c => c.name === nm) : -1; return i >= 0 ? all.splice(i, 1)[0] : null; };
    const seq = []; (best.acq || []).forEach((a, i) => { if (a.by !== "open") seq.push(i < best.order.length ? best.order[i].name : null); });
    planHand = ex.hand.slice(); planSeq = (best.acq || []).filter(a => a.by !== "open").map((a, k) => `${seq[k] || "(any card)"} (turn ${a.t}, ${a.by === "draw" ? "draw" : "from " + a.by})`);
    // a card cast for free off the top (cascade, discover) has to be on top when that happens
    const free = (best.log || []).filter(e => e && e.kind === "free" && e.name).map(e => e.name);
    const needed = new Set(ex.hand.filter(Boolean).concat(seq.filter(Boolean), free));
    const filler = () => { const i = all.findIndex(c => !needed.has(c.name) && !/\bLand\b/.test(c.type || "")); const j = i >= 0 ? i : all.findIndex(c => !needed.has(c.name)); return j >= 0 ? all.splice(j, 1)[0] : all.shift(); };
    for (const nm of ex.hand) { const c = take(nm) || filler(); if (c) PT.hand.push(c); }
    for (const nm of seq) { const c = take(nm) || filler(); if (c) PT.lib.push(c); }
    const plannedUids = new Set(PT.lib.map(c => c.uid));
    plannedLeft = () => PT.lib.filter(c => plannedUids.has(c.uid)).length && PT.lib.findIndex(c => !plannedUids.has(c.uid)) < 0 ? PT.lib.length : Math.max(0, PT.lib.findIndex(c => !plannedUids.has(c.uid)));
    PT.lib.push(...all);
    PT.phase = "play"; PT.turn = 1; PT.log = [];
    if (o.drawFirst && PT.lib.length) PT.hand.push(PT.lib.shift());
    const byT = t => (best.log || []).filter(e => e && e.t === t);
    const wonT = best.won ? best.won.t : 1;
    const findIn = (zones, nm) => { for (const z of zones) { const c = PT[z].find(x => x.name === nm || ptFaceName(x) === nm); if (c) return c; } return null; };
    const wayOf = how => { const h = String(how || "").toLowerCase(); return /^evoke/.test(h) ? "evoke" : /^dash/.test(h) ? "dash" : /^blitz/.test(h) ? "blitz" : /^flashback/.test(h) ? "flashback" : /^escape/.test(h) ? "escape" : /^madness/.test(h) ? "madness" : h ? "alt" : null; };
    let failed = false;
    for (let t = 1; t <= wonT && !failed; t++) {
      if (t > 1) { ptNextTurn(); settle(); }
      for (const e of byT(t)) {
        if (failed) break;
        PT._fail = "";
        if (e.kind === "land") {
          const c = findIn(["hand"], e.name);
          if (!c) { failed = !step(t, `Play ${e.name}`, false, "it isn't in your hand"); break; }
          ptCastPaid(c.uid); settle();
          if (!PT.bf.includes(c)) { if (!modal().hidden) ptCloseModal(); failed = !step(t, `Play ${e.name}`, false, PT._fail || "it couldn't be played"); break; }
          step(t, `Play ${e.name}`, true);
        } else if (e.kind === "cast" || e.kind === "commander") {
          if (e.note && /countered/.test(e.note)) continue;
          const c = findIn(e.kind === "commander" ? ["cmd", "hand"] : ["hand", "grave", "exile", "cmd"], e.name);
          if (!c) { failed = !step(t, `Cast ${e.name}`, false, "it isn't in your hand"); break; }
          const zone = (ptFind(c.uid) || {}).zone, way = wayOf(e.how);
          // free cards from the top go there just before (cascade reveals until it finds one)
          const later = byT(t).slice(byT(t).indexOf(e) + 1).filter(x => x.kind === "free" && x.name);
          for (const fx of later.reverse()) { const i = PT.lib.findIndex(x => x.name === fx.name); if (i > 0) PT.lib.unshift(PT.lib.splice(i, 1)[0]); }
          if (way === "alt") { ptDo(() => ptPlay(c.uid)); settle(); step(t, `Cast ${e.name} (${e.how})`, true, "its alternative cost wasn't checked"); continue; }
          const w = way && ptCastWays(c, zone).some(x => x.k === way) ? way : null;
          if (way && !w) { failed = !step(t, `Cast ${e.name} (${e.how})`, false, `the Playtest doesn't see a way to ${way} it`); break; }
          // X: what the line paid for it (e.x), else nothing — the finder doesn't spend mana on X
          const hasX = /\{x\}/i.test(String(c.cost || "").split(" // ")[0]);
          ptCastPaid(c.uid, w || undefined, hasX ? (e.x || 0) : undefined); settle();
          const now = (ptFind(c.uid) || {}).zone;
          if (now === zone && !(PT_WAY_NOSPELL && w && PT_WAY_NOSPELL.has(w))) { if (!modal().hidden) ptCloseModal(); failed = !step(t, `Cast ${e.name}${e.how ? ` (${e.how})` : ""}`, false, PT._fail || "it couldn't be cast"); break; }
          step(t, `Cast ${e.name}${e.how ? ` (${e.how})` : ""}`, true);
        } else if (e.kind === "ability") {
          if (e.name === "Clue") { const clue = PT.bf.find(x => x.token && /Clue/.test(x.name)); if (!clue) { failed = !step(t, "Crack a Clue", false, "there's no Clue"); break; } const i = trActivated(clue).findIndex(a => /draw/i.test(a.label)); ptActivate(clue.uid, i); settle(); step(t, "Crack a Clue", !PT._fail, PT._fail); if (PT._fail) failed = true; continue; }
          const srcs = PT.bf.filter(x => x.name === e.name || ptFaceName(x) === e.name);
          let done = false;
          for (const c of srcs) {
            const list = trActivated(c), i = list.findIndex(a => a.zone === "bf" && (a.costText === e.cost || String(a.label || "").startsWith(e.cost || "\u0000")));
            if (i < 0) continue;
            // sacrifice what the line sacrificed ("sacrifice Plant"), not whatever looks least useful
            const ab = list[i], sacTxt = ((e.costs || []).find(x => /^sacrifice /.test(x)) || "").replace(/^sacrifice /, "");
            const force = [];
            // names can hold commas ("Ashling, the Limitless"): take the longest names that appear, in the order written
            let rest = sacTxt;
            while (rest) {
              const q = PT.bf.filter(x => x.uid !== c.uid && !force.includes(x.uid) && rest.startsWith(x.name) && (!ab.cost.sac || !ab.cost.sac[1] || trFits(ab.cost.sac[1].replace(/\bother\b/, ""), x))).sort((a, b) => b.name.length - a.name.length)[0];
              if (!q) break; force.push(q.uid); rest = rest.slice(q.name.length).replace(/^,\s*/, "");
            }
            if (force.length && ab.cost && ab.cost.sac && ab.cost.sac.length) ab._force = force;
            PT._fail = ""; try { ptActivate(c.uid, i); } finally { delete ab._force; } settle();
            if (!PT._fail) { done = true; break; }
          }
          if (!done) { failed = !step(t, `${e.name}: ${e.cost || "ability"}`, false, PT._fail || (srcs.length ? "that ability couldn't be used" : `${e.name} isn't on the battlefield`)); break; }
          step(t, `${e.name}: ${e.cost || "ability"}`, true);
        } else if (e.kind === "attack") {
          ptAttackDialog(); settle();
          if (PT_VIEW && PT_VIEW.kind === "attack") {
            const want = (e.who || []).map(w => w.name), pick = new Set();
            for (const nm of want) { const c = PT.bf.find(x => (x.name === nm || ptFaceName(x) === nm) && !pick.has(x.uid) && !x.tapped && (ptIsCreature(x) || x.faceDown)); if (c) pick.add(c.uid); }
            PT_VIEW.pick = pick; Object.keys(PT_VIEW.to || {}).forEach(u => { PT_VIEW.to[u] = 0; });
            const short = want.length - pick.size;
            if (!pick.size) { ptCloseModal(); const there = PT.bf.filter(x => ptIsCreature(x)).map(x => x.name + (x.tapped ? " (tapped)" : ptSick(x) ? " (summoning sick)" : "")); failed = !step(t, `Attack with ${want.join(", ")}`, false, `none of them could attack${there.length ? `; your creatures: ${there.join(", ")}` : "; you have no creatures"}`); break; }
            const before = PT.opps[0].life;
            ptAttack(); settle();
            const dealt = before - PT.opps[0].life;
            step(t, `Attack with ${want.join(", ")}`, dealt >= (e.dmg || 0) || PT.opps[0].out, dealt < (e.dmg || 0) && !PT.opps[0].out ? `it dealt ${dealt}, not ${e.dmg}${short ? ` (${short} of them couldn't attack)` : ""}` : "");
          } else { const want = (e.who || []).map(w => w.name), there = PT.bf.filter(x => ptIsCreature(x)).map(x => x.name + (x.tapped ? " (tapped)" : ptSick(x) ? " (summoning sick)" : "")); failed = !step(t, `Attack with ${want.join(", ")}`, false, `none of them could attack${there.length ? `; your creatures: ${there.join(", ")}` : "; you have no creatures"}`); break; }
        }
      }
      if (!failed && (t < wonT || !(PT.opps[0].out || PT.opps[0].life <= 0))) { ptEndTurn(); settle(); }   // the last turn too: end-step triggers can finish it
    }
    const opp = PT.opps[0];
    // something the Playtest left for you to do by hand earlier makes a failure inconclusive: the finder may be right
    const byHand = PT.log.slice().reverse().filter(l => /\bby hand\b|keep track by hand|not tracked/.test(l)).map(l => l.replace(/^T\d+ · /, "").replace(/[.:]\s*(?:done|finish the rest|keep track) by hand.*$|\(keep track by hand\)\.?$/i, "").trim());
    const unsure = byHand.length ? ` (the Playtest couldn't carry out: ${[...new Set(byHand)].slice(0, 3).join("; ")})` : "";
    if (failed) { const f = steps.find(x => !x.ok); result = {ok: byHand.length ? null : false, why: `Turn ${f.t}: ${f.txt}: ${f.why}${unsure}`, manual: byHand}; }
    else if (win.how === "combo") {
      const pieces = (win.plan && win.plan.pieces) || [], missing = pieces.filter(nm => !PT.bf.some(x => x.name === nm) && !PT.cmd.some(x => x.name === nm && false));
      result = missing.length ? {ok: false, why: `Turn ${wonT}: the combo isn't together (${missing.join(", ")} not on the battlefield)`} : {ok: true, why: "every combo piece is on the battlefield (the loop itself isn't played out)"};
    } else result = opp.out || opp.life <= 0 ? {ok: true, why: byHand.length ? `parts were done by hand in the Playtest: ${[...new Set(byHand)].slice(0, 3).join("; ")}` : "", manual: byHand} : {ok: byHand.length ? null : false, why: `Turn ${wonT}: played out, the opponent was still at ${opp.life}${opp.poison ? ` (${opp.poison} poison)` : ""}${unsure}`, manual: byHand};
    if (!steps.some(x => !x.ok)) steps.forEach(x => { if (x.ok == null) x.ok = true; });
    result.log = PT.log.slice(0, 80).reverse();
    result.planned = {hand: planHand, draws: planSeq};
  } catch (err) { console.warn("replay", err); result = {ok: null, why: "couldn't replay it (" + (err && err.message || err) + ")"}; }
  finally {
    PT = keep.PT; ptRender = keep.render; window.setTimeout = keep.st; PT_VIEW = keep.view; if (typeof PT_PICK !== "undefined") PT_PICK = keep.pick;
    Object.assign(prefs, keep.prefs); for (const k of Object.keys(keep.prefs)) if (keep.prefs[k] === undefined) delete prefs[k];
    const m = modal(); if (m && !m.hidden && !PT) { m.hidden = true; m.innerHTML = ""; }
  }
  return Object.assign({turn: best.won ? best.won.t : null, how: win.how, steps}, result);
}
// Realistic: the same search, but the cards come from a shuffled library in order (no picking your draws)
async function fwRealistic(d, games, onProgress){
  const {pool, cmds, plans, o} = await fwPlans(d);
  const plans4 = plans.slice(0, 4);
  const names = pool.flatMap(c => Array(c.qty).fill(c.name));
  const turns = [], use = {};
  for (let g = 0; g < games; g++) {
    const lib = names.slice(); for (let i = lib.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lib[i], lib[j]] = [lib[j], lib[i]]; }
    let best = null, bestS = null;
    for (const pl of plans4) { const b = await fwSearchAsync(pl, pool, cmds, Object.assign({}, o, {lib, beam: 25, wide: 7, ms: 500, maxT: best ? best - 1 : 10})); if (b) { best = b.won.t; bestS = b; } if (best && best <= 2) break; }
    turns.push(best);
    if (bestS) for (const x of new Set(bestS.order.map(y => y.name).filter(Boolean))) use[x] = (use[x] || 0) + 1;
    if (onProgress) onProgress(g + 1, games);
    await sleep(0);
  }
  return {turns, games, use, opp: (prefs.fwOpts || {}).opp || "none"};
}
let fwState = null;
// What the finder understood on a card, in plain words (for checking it against the real card)
function fwDescribe(f){
  const out = [], u = x => fmtUnits(x), only = x => { const v = (x || [])[0] || "", o = fwOnly(v), fb = (v.match(/\?([A-Z]+)/) || [])[1]; return o ? [v, o + " spells only" + (fb ? `; {${fb}} for anything else` : "") + (v.includes("$") ? "; those spells can't be countered" : "")] : null; };
  const fmtUnits = list => { const b = (list || []).map(x => x.split(/[!#@~^]/)[0]); return !b.length ? "nothing" : b.every(x => x === "WUBRG") ? (b.length > 1 ? b.length + " of any colour" : "any colour") : b.map(x => x === "C" ? "{C}" : x.length > 1 ? x.split("").map(y => `{${y}}`).join("/") : `{${x}}`).join(""); };
  if (f.land) out.push(["mana", `Land: taps for ${f.units && f.units.length ? u(f.units) : "nothing"}${only(f.units) ? ` (${only(f.units)[1]} spells only)` : ""}${f.tapped ? ", enters tapped" : ""}`]);
  if (f.rock) out.push(["mana", `Taps for ${f.rock[0] === "LEG" ? "a colour of your legends" : f.rock[0] === "OPAL" ? "any colour with 3 artifacts" : u(f.rock)}${f.rockTapped ? " (enters tapped)" : ""}`]);
  if (f.dork) out.push(["mana", `Creature that taps for ${u(f.dork)}${only(f.dork) ? ` (${only(f.dork)[1]} spells only)` : ""}`]);
  if (f.convoke) out.push(["cost", "Convoke: your untapped creatures can help pay (each pays {1} or one mana of its colour), even summoning-sick ones"]);
  if (f.noCounter) out.push(["cost", "Can't be countered"]);
  if (f.burst) out.push(["mana", f.guide ? `Exile from hand: ${u(f.burst)}` : `One-time mana: ${u(f.burst)}`]);
  if (f.grantDork) out.push(["mana", `Your ${f.grantDork.ph} tap for ${u(f.grantDork.units)}`]);
  if (f.landsAny) out.push(["mana", "Your lands tap for any colour"]);
  if (f.ramp) out.push(["mana", `Puts ${f.ramp} land${f.ramp > 1 ? "s" : ""} onto the battlefield`]);
  for (const r of f.reqs || []) out.push(["cost", "Extra cost: " + r.txt]);
  if (f.alt) out.push(["cost", "Other way to cast: " + f.alt.txt]);
  if (f.evoke) out.push(["cost", "Evoke: " + f.evoke.txt.replace(/^evoke /, "")]);
  if (f.dash) out.push(["cost", `${f.dash.how}: ${fwCostTxt(f.dash.pay)}`]);
  if (f.extra) out.push(["cost", f.discardLand ? "Discard a land as it enters" : "Exile a card from your hand as it enters"]);
  if (f.draw) out.push(["card", `Draws ${f.draw}${f.discardAfter ? `, then discards ${f.discardAfter}` : ""}${f.etbDraw ? " (when it enters)" : ""}`]);
  if (f.discardFirst) out.push(["card", `Discards ${f.discardFirst} first`]);
  if (f.drawEach) out.push(["card", `Draws one per ${f.drawEach} you control`]);
  if (f.drawLater) out.push(["card", `Draws ${f.drawLater} next upkeep`]);
  if (f.upkeepCard) out.push(["card", "Each upkeep: the top card to your hand (best case)"]);
  if (f.wheel) out.push(["card", "Discards your hand first"]);
  if (f.power != null && /\bCreature\b/.test(f.type)) out.push(["body", `${f.power} power${f.haste ? ", haste" : ""}${f.ds ? ", double strike" : ""}${f.infect ? ", infect" : ""}${f.noAttack ? ", can't attack" : ""}`]);
  for (const g of f.giveHaste || []) out.push(["body", `Gives ${g.other ? "other " : ""}${g.ph} haste`]);
  for (const a of f.anthem || []) out.push(["body", `${a.other ? "Other " : ""}${a.ph} get +${a.n}/+${a.n}`]);
  if (f.pump) out.push(["body", `Creatures get +${f.pump.x ? "X" : f.pump.n} this turn`]);
  if (f.teamHaste) out.push(["body", "Creatures gain haste this turn"]);
  if (f.equipHaste != null) out.push(["body", `Equipment: haste (equip {${f.equipHaste}})`]);
  if (f.burn) out.push(["dmg", `${f.burn} damage to the opponent`]);
  for (const r of f.reduce || []) out.push(["static", `${r.ph ? r.ph[0].toUpperCase() + r.ph.slice(1) + " spells" : "Spells"} cost {${r.n}} less${r.perCounter ? " per +1/+1 counter" : ""}`]);
  if (f.extraLand) out.push(["static", `${f.extraLand} extra land drop${f.extraLand > 1 ? "s" : ""} each turn`]);
  if (f.grantEvoke) out.push(["static", `${f.grantEvoke.ph} spells get evoke ${f.grantEvoke.txt}`]);
  if (f.dbl) out.push(["static", f.dbl.etb ? "Enter triggers happen twice" : `Other ${f.dbl.ph}s' triggers happen twice`]);
  if (f.cascade) out.push(["static", f.cascade > 1 ? `Cascade ×${f.cascade}` : "Cascade"]);
  if (f.discover) out.push(["static", `Discover ${f.discover}`]);
  for (const tr of f.trigs || []) out.push(["trig", "Trigger: " + (/ is a triggered ability/.test(tr.text) ? tr.text.split(":")[0] : tr.text).replace(/\s*\([^)]*\)/g, "")]);
  for (const ab of f.acts || []) out.push(["act", "Ability: " + ab.label]);
  if (f.tokenDrain) out.push(["dmg", "Each token made or sacrificed: opponent loses 1"]);
  if (f.summons) out.push(["card", `Puts one ${f.summons} from your library onto the battlefield per ${f.summons} you control`]);
  if (f.modes) out.push(["card", `Modes: tries each (${f.modes.length})`]);
  if (f.drawMaxPow) out.push(["card", "Draws equal to your biggest creature's power"]);
  if (f.counterOnly) out.push(["off", "Counterspell: not used (the opponent casts nothing)"]);
  return out;
}
function fwAuditHtml(d){
  FW_TYPE = d.fwType || fwDeckType(d.cards.filter(c => c.board === "main").concat(d.commanders)); FW_CI = fwIdentity(d);
  const list = d.commanders.map(c => [c, true]).concat(d.cards.filter(c => c.board === "main").map(c => [c, false]));
  const rows = [], seen = new Set();
  let unread = 0;
  for (const [c, cmd] of list) {
    if (seen.has(c.name)) continue; seen.add(c.name);
    let f; try { f = fwCard(c, cmd); } catch (e) { f = null; }
    const parts = f ? fwDescribe(f) : [];
    const vanilla = !String(c.text || "").replace(/\([^)]*\)/g, "").trim() || (f && f.land && /^basic\b/i.test(c.type || ""));
    if (!parts.length && !vanilla) unread++;
    rows.push({name: c.name, cmd, parts, none: !parts.length && !vanilla, text: c.text || ""});
  }
  rows.sort((a, b) => (b.none - a.none) || (b.cmd - a.cmd) || a.name.localeCompare(b.name));
  const report = rows.map(r => `${r.name}: ${r.parts.length ? r.parts.map(p => p[1]).join(" | ") : r.none ? "NOT USED BY THE FINDER" : "basic"}`).join("\n");
  return `<details class="fw-audit"><summary><b>How the finder reads each card</b> <span class="cur-sub">${rows.length} cards${unread ? ` · ${unread} it doesn't use` : ""}</span></summary>
    <p class="cur-sub"><label class="inline-field">When a card says "choose a creature type", use <select id="fwType"><option value="">Most common (${esc(fwDeckType(d.cards.filter(c => c.board === "main").concat(d.commanders)) || "none")})</option>${[...new Set(d.cards.concat(d.commanders).filter(c => /\bCreature\b/.test(c.type || "")).flatMap(c => ((c.type || "").split("—")[1] || "").trim().split(/\s+/)).filter(Boolean))].sort().map(t => `<option value="${esc(t.toLowerCase())}" ${d.fwType === t.toLowerCase() ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></p>
    <p class="cur-sub">Compare these with the real cards. Anything wrong or missing here is something the fastest-win search gets wrong. <button class="btn" type="button" id="fwCopyAudit">Copy as text</button></p>
    <ul class="fw-aud">${rows.map(r => `<li${r.none ? ' class="none"' : ""}><b title="${esc(r.text)}">${esc(r.name)}${r.cmd ? ' <span class="cur-sub">commander</span>' : ""}</b><span>${r.parts.length ? r.parts.map(p => `<i class="fw-chip ${p[0]}">${esc(p[1])}</i>`).join("") : r.none ? '<i class="fw-chip off">Not used by the finder</i>' : '<i class="fw-chip">Basic land</i>'}</span></li>`).join("")}</ul>
    <textarea id="fwAuditTxt" hidden>${esc(report)}</textarea></details>`;
}
// "Tap Mountain ×2, Sol Ring · sacrifice a Treasure · mana from Dark Ritual"
function fwTapTxt(list, tapped){
  const tapN = new Map(), rest = new Map(), other = [];
  let treas = 0;
  for (const x of list || []) {
    if (x.kind === "treasure") { treas++; continue; }
    if (x.gone && x.kind === "creature") { const s = `floating mana from ${x.name}`; if (!other.includes(s)) other.push(s); continue; }
    if (x.kind === "pool") { const s = x.name ? `mana from ${x.name}` : "floating mana"; if (!other.includes(s)) other.push(s); continue; }
    const key = x.id;
    if (tapped.has(key) && !(tapN.get(x.name) || new Set()).has(key)) { rest.set(x.name, true); continue; }
    tapped.add(key);
    if (!tapN.has(x.name)) tapN.set(x.name, new Set());
    tapN.get(x.name).add(key);
  }
  const parts = [];
  if (tapN.size) parts.push("Tap " + [...tapN].map(([nm, ids]) => `<b>${esc(nm)}</b>${ids.size > 1 ? ` ×${ids.size}` : ""}`).join(", "));
  if (rest.size) parts.push("rest of " + [...rest.keys()].map(nm => `<b>${esc(nm)}</b>'s mana`).join(", "));
  if (treas) parts.push(`sacrifice ${treas > 1 ? treas + " Treasures" : "a Treasure"}`);
  parts.push(...other.map(esc));
  return parts.join(" · ");
}
const FW_KIND = {land: ["Land", "land"], cast: ["Cast", "cast"], commander: ["Commander", "cast"], free: ["↳ Free cast", "free"], put: ["↳ Put in", "free"], trigger: ["↳ Trigger", "trig"], ability: ["Activate", "act"], attack: ["Attack", "atk"]};
function fwTurnHtml(top, ex, cardImg, t){
  const log = top.best.log, plays = log.filter(l => l && l.t === t), dr = ex.draws.find(x => x.t === t), end = plays.find(l => l.kind === "end");
  const tapped = new Set();
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : "";
  const gems = s => esc(s || "").replace(/(?:\{[0-9WUBRGCX/P]+\})+/g, m => costGems(m));   // {G}{G} → mana symbols
  const row = l => {
    if (l.kind === "end" || l.kind === "none") return "";
    if (l.kind === "note") return `<li class="fw-st note"><span></span><span class="fw-span">${esc(l.name)}</span></li>`;
    const [lbl, cls] = FW_KIND[l.kind] || ["", ""];
    let name = "", pay = "", res = "";
    if (l.kind === "attack") {
      name = (l.who || []).map(w => `${esc(w.name)} <span class="cur-sub">${w.p}</span>`).join("<br>") || "Your creatures";
      pay = `<span class="cur-sub">—</span>`;
      res = `<b>${l.dmg} damage</b> · ${esc(cap(l.note))}` + (l.held && l.held.length ? `<div class="cur-sub">Not attacking (tapped for mana): ${esc([...new Set(l.held)].join(", "))}</div>` : "");
    } else if (l.kind === "land") {
      name = `<b>${esc(l.name)}</b>`; pay = `<span class="cur-sub">Your land for the turn</span>`; res = gems(cap(l.note));
    } else if (l.kind === "trigger") {
      name = `<b>${esc(l.name)}</b>`; pay = l.whyTxt ? `<span class="cur-sub">${esc(l.whyTxt)}</span>` : `<span class="cur-sub">${l.why === "cast" ? "You cast a spell" : l.why === "etb" ? "Something entered" : l.why === "landplay" ? "Land played" : l.why === "attack" ? "Attacking" : l.why === "combatdmg" ? "Combat damage" : l.why === "sac" || l.why === "dies" ? "Something was sacrificed" : l.why === "end" ? "End step" : l.why === "upkeep" ? "Upkeep" : l.why === "token" ? "A token was made" : "Automatic"}</span>`; res = gems(cap(l.note));
    } else {
      name = `<b>${esc(l.name)}</b>` + ((l.kind === "free" || l.kind === "put") && l.how ? `<div class="cur-sub">${esc(cap(l.how))}</div>` : "");
      const mana = l.mana ? costGems(l.mana) : "", tap = fwTapTxt(l.tap, tapped);
      const lines = [];
      if (l.kind === "free" || l.kind === "put") lines.push(`<span class="cur-sub">No mana</span>`);
      else if (mana || (l.how && l.kind !== "free" && l.kind !== "put")) lines.push([mana, l.how && l.kind !== "free" && l.kind !== "put" ? `<span class="cur-sub">${esc(l.how)}</span>` : ""].filter(Boolean).join(" "));
      if (tap) lines.push(`<span class="fw-tap">${tap}</span>`);
      if (l.costs && l.costs.length) lines.push(`<span class="fw-also">Also: ${esc(l.costs.join(", "))}</span>`);
      if (!lines.length && l.kind === "ability" && l.cost) lines.push(`<span class="mono">${esc(l.cost)}</span>`);
      pay = lines.map(x => `<div>${x}</div>`).join("");
      res = gems(cap(l.note)) || `<span class="cur-sub">${l.perm || l.kind === "ability" ? "Done" : "Resolves"}</span>`;
    }
    const drew = ex.spellDraws[log.indexOf(l)];
    return `<li class="fw-st ${cls}"><span class="fw-badge ${cls}">${lbl}</span><div class="fw-c"><span class="fw-ml">Play</span><div class="fw-v">${name}</div></div><div class="fw-c${l.kind === "attack" || l.kind === "land" || l.kind === "trigger" ? " fw-opt" : ""}"><span class="fw-ml">Pay with</span><div class="fw-v">${pay}</div></div><div class="fw-c"><span class="fw-ml">What happens</span><div class="fw-v">${res}</div></div></li>`
      + (drew ? `<li class="fw-st drew"><span></span><div class="fw-span"><span class="fw-lbl">${esc(l.name)} drew</span><div class="fw-row">${drew.map(nm => cardImg(nm, true)).join("")}</div></div></li>` : "");
  };
  const won = t === top.turn;
  return `<li class="fw-turn${won ? " won" : ""}">
    <div class="fw-side"><div class="fw-tn">Turn ${t}</div>${dr && dr.name !== undefined ? `<span class="fw-lbl">Draw</span>${cardImg(dr.name, true)}` : `<span class="fw-lbl">No draw</span>`}</div>
    <div class="fw-main">
      <ul class="fw-steps2">${plays.map(row).join("") || `<li class="fw-st note"><span></span><span class="fw-span">Nothing needed this turn</span></li>`}</ul>
      <div class="fw-end">${won ? `<b class="fw-winline">★ ${top.plan.kind === "combo" ? `Combo assembled: ${esc((top.plan.produces || ["win"])[0])}` : top.how === "poison" ? "Opponent has 10 poison" : top.how === "commander damage" ? "21 commander damage" : "Opponent is dead"}</b>` : end ? `End of turn · opponent at <b>${end.opp}</b>${end.poison ? ` · ${end.poison} poison` : ""}` : ""}</div>
    </div></li>`;
}
function renderFast(){
  const box = $("deckFast"); const d = prefs.deckView && deckById(prefs.deckView);
  if (!box) return;
  if (!d || !(d.cards.length + d.commanders.length)) { box.innerHTML = ""; return; }
  const st = fwState && fwState.deckId === d.id ? fwState : null;
  const cardImg = (name, small) => { if (!name) return `<div class="fw-card any"><span>Any card</span></div>`; const c = [...d.commanders, ...d.cards].find(x => x.name === name) || {};
    return `<div class="fw-card${small ? " sm" : ""}" title="${esc(name)}">${c.imgN || c.img ? `<img src="${esc(c.imgN || c.img)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(name)}</span>`}<b>${esc(name)}</b></div>`; };
  let html = `<div class="sim-head"><h3>Fastest possible win</h3><span class="cur-sub">The best case: you get to choose every card you draw. It finds the quickest win and shows the hand and draws that get you there.</span></div>
    <div class="sim-controls"><button class="btn primary" type="button" id="fwRun" ${st && st.busy ? "disabled" : ""}>${st && st.busy ? `Searching… ${st.done || 0}/${st.total || "?"}` : st && st.res ? "Search again" : "Find the fastest win"}</button>
    <label class="inline-field">Opponent <select id="fwOpp">${[["none", "Never interacts"], ["removal", "Removes your best attacker once"], ["counter", "Counters your first 3+ mana spell"]].map(([v, l]) => `<option value="${v}" ${((prefs.fwOpts || {}).opp || "none") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    ${st && st.busy ? `<button class="btn" type="button" id="fwStop" title="Stop and keep the best win found so far">■ Stop</button>` : ""}
    ${st && st.res && !st.busy ? `<button class="btn" type="button" id="fwDeep" title="Look again for a faster win, much more thoroughly: up to a minute.">🔎 Search harder</button>` : ""}
    <button class="btn" type="button" id="fwReal" ${st && (st.busy || st.realBusy) ? "disabled" : ""}>${st && st.realBusy ? `Playing games… ${st.realDone || 0}/${st.realTotal || "?"}` : "How fast in real games?"}</button>
    ${st && st.stale && st.res ? `<span class="cur-sub">The deck changed since this search.</span>` : ""}</div>`;
  if (st && st.real) {
    const T = st.real, won = T.turns.filter(x => x != null), maxT = 10, by = t => Math.round(100 * T.turns.filter(x => x != null && x <= t).length / T.games);
    const med = won.length ? won.slice().sort((a, b) => a - b)[Math.floor(won.length / 2)] : null;
    html += `<div class="fw-real"><div class="fw-real-head"><b>Real games: ${T.games} shuffled hands, no picking your draws</b><span class="cur-sub">${T.opp === "none" ? "Opponent never interacts" : T.opp === "removal" ? "Opponent removes your best attacker once" : "Opponent counters your first 3+ mana spell"} · you keep every opening hand</span></div>
      <div class="fw-real-stats"><div><b>${med ? "Turn " + med : "—"}</b><span>usual win turn</span></div><div><b>${by(med || 6)}%</b><span>win by turn ${med || 6}</span></div><div><b>${100 - by(maxT)}%</b><span>no win by turn ${maxT}</span></div></div>
      <div class="fw-bars">${Array.from({length: maxT}, (_, i) => i + 1).map(t => { const p = by(t); return `<div class="fw-bar"><span style="height:${Math.max(2, p)}%"></span><b>${p}%</b><i>T${t}</i></div>`; }).join("")}</div>
      <p class="cur-sub">Bars: the share of games won by each turn. The best case above is the ceiling; this is closer to what to expect.</p></div>`;
  }
  if (st && st.res) {
    const R = st.res, top = R.results[0];
    if (!top && R.stopped) html += `<p class="cur-sub">Stopped before a win was found. Press <b>Find the fastest win</b> to search again.</p>`;
    else if (!top) html += `<p class="cur-sub">No win found within ${R.o.maxT} turns, even with perfect draws. ${R.comboNote}</p>`;
    else {
      const ex = fwExplain(top.best, R.o), how = top.plan.kind === "combo" ? `Combo: ${top.plan.label}` : top.how === "commander damage" ? "Commander damage" : top.how === "poison" ? "Poison counters" : "Damage";
      const D = R.deep;
      if (D) {
        const last = D.checked[D.checked.length - 1];
        html += `<p class="fw-deep ${D.found.length ? "yes" : ""}">${D.found.length ? `🔎 Searching harder found a faster win: <b>turn ${top.turn}</b>. ` : ""}${last ? (last.exhaustive ? `Checked every possible line for a turn-${last.turn} win (every card, ability, land drop and order): none exists. <b>Turn ${top.turn} is the fastest possible.</b>` : last.complete ? `Searched hard for a turn-${last.turn} win (every card, ability and land drop, ${D._beamCut ? "keeping the ${D.beam || 500} most promising positions each turn" : "many lines"}${D._depthCut ? ", up to 40 plays a turn" : ""}): none found. Turn ${top.turn} is the fastest found, though not every possible line could be checked.` : (R.stopped ? `Stopped while checking for a turn-${last.turn} win: one might still exist.` : `Checked for a turn-${last.turn} win but ran out of time (${Math.round(D.budget / 1000)} s) before finishing: one might still exist.`)) : top.turn <= 1 ? "Turn 1 can't be beaten." : `Ran out of time (${Math.round(D.budget / 1000)} s) before finishing.`}</p>`;
      }
      // checked by playing it out in the Playtest's rules engine
      const C = top.check;
      if (C) html += `<p class="fw-check ${C.ok === true ? "ok" : C.ok === false ? "bad" : "unsure"}">${C.ok === true ? `✓ <b>Checked:</b> played out step by step in the Playtest (real mana, real triggers), this line works.${C.why ? ` <span class="cur-sub">Note: ${esc(C.why)}.</span>` : ""}`
        : C.ok === false ? `⚠ <b>This line didn't hold up</b> when played out in the Playtest, and no line that does was found: ${esc(C.why)}. Treat it as a guess.`
        : `ⓘ <b>Partly checked:</b> played out in the Playtest up to a point. ${esc(C.why)}.`}${C.steps && C.steps.length ? ` <button type="button" class="linkish" data-fwsteps="1">${prefs.fwSteps ? "Hide" : "Show"} the played-out steps</button>` : ""}</p>${prefs.fwSteps && C.steps ? `<ol class="fw-steps">${C.steps.map(x => `<li class="${x.ok === false ? "bad" : ""}">Turn ${x.t}: ${esc(x.txt)}${x.ok === false ? ` ✗ <em>${esc(x.why)}</em>` : x.why ? ` <span class="cur-sub">(${esc(x.why)})</span>` : " ✓"}</li>`).join("")}</ol>` : ""}`;
      if ((R.rejected || []).length) html += `<p class="fw-check rejected">✗ ${R.rejected.length === 1 ? "A faster line was" : `${R.rejected.length} faster lines were`} found but didn't hold up when played out, so ${R.rejected.length === 1 ? "it isn't" : "they aren't"} shown: ${R.rejected.slice(0, 3).map(r => `<span>turn ${r.turn} (${esc(r.why)})</span>`).join("; ")}.</p>`;
      html += `<div class="sim-big"><div><b>Turn ${top.turn}</b><span>fastest possible win</span></div><div class="fw-how"><b>${esc(how)}</b><span>${top.plan.kind === "combo" ? esc((top.plan.produces || []).slice(0, 3).join(" · ")) : `opponent starts at ${R.o.life} life`}</span></div></div>
        <h4 class="fw-h">Best opening hand</h4><div class="fw-row">${ex.hand.map(n => cardImg(n)).join("")}</div>
        <h4 class="fw-h">Turn by turn</h4>
        <div class="fw-cols" aria-hidden="true"><span></span><span>Play</span><span>Pay with</span><span>What happens</span></div>
        <ol class="fw-turns">${Array.from({length: top.turn}, (_, i) => fwTurnHtml(top, ex, cardImg, i + 1)).join("")}</ol>
        ${R.why && R.why.length ? `<h4 class="fw-h">What would make it faster</h4><ul class="fw-why">${R.why.map(w => `<li class="${w.turn ? "yes" : "no"}">${w.turn ? `<b>Turn ${w.turn}</b> with ${esc(w.txt)}` : `Not ${esc(w.txt.replace(/ \(.*\)$/, ""))}: still turn ${top.turn}`}</li>`).join("")}</ul><p class="cur-sub">Each line asks: would a win come a turn sooner with a little more of this? A "yes" points at what the deck is short on.</p>` : ""}
        ${top.plan.steps ? `<h4 class="fw-h">How the combo works</h4><div class="fw-steps">${esc(top.plan.steps).replace(/\n/g, "<br>")}</div>` : ""}

        ${R.results.length > 1 ? `<h4 class="fw-h">Other fast routes</h4><ul class="fw-alt">${R.results.slice(1, 6).map(r => `<li><b>Turn ${r.turn}</b> · ${esc(r.plan.kind === "combo" ? "Combo: " + r.plan.label : r.how === "commander damage" ? "Commander damage" : "Damage")}</li>`).join("")}</ul>` : ""}
        <p class="cur-sub fw-note">Assumes perfect draws, ${R.o.drawFirst ? "a draw on turn 1 (multiplayer Commander)" : "you're on the play"}, and one opponent at ${R.o.life} life who never interacts. Every cost is paid in full (exact colours, additional costs, discards, sacrifices, tapping), and triggered and activated abilities are used (landfall, prowess, tokens, Treasures, Clues, “draw, then discard”, cost reducers, extra land drops). Triggers that depend on an “if” or on a choice by the opponent aren't counted. ${R.combosTried ? `Checked ${R.combosTried} winning combo${R.combosTried > 1 ? "s" : ""} in the deck plus damage.` : ""} ${esc(R.comboNote)}${simState && simState.deckId === d.id && simState.S && median(simState.S.goldTurns) ? ` In normal shuffled games this deck wins around turn ${median(simState.S.goldTurns)}.` : ""}</p>`;
    }
  }
  try { html += fwAuditHtml(d); } catch (e) { console.warn("card check", e); }
  box.innerHTML = html;
}
$("deckFast").addEventListener("change", e => {
  if (e.target.id === "fwOpp") { prefs.fwOpts = Object.assign({}, prefs.fwOpts, {opp: e.target.value}); savePrefs(); toast("Search again to use the new opponent."); }
  if (e.target.id === "fwType") { const d = prefs.deckView && deckById(prefs.deckView); if (d) { d.fwType = e.target.value || ""; saveDecks(); renderFast(); } }
});
$("deckFast").addEventListener("click", async e => {
  if (e.target.closest("#fwCopyAudit")) { const t = $("fwAuditTxt"); if (t) { try { await navigator.clipboard.writeText(t.value); toast("Copied: paste it to Claude to check."); } catch (err) { toast("Couldn't copy."); } } return; }
  if (e.target.closest("#fwReal")) {
    const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
    if (d.cards.filter(c => c.board === "main").reduce((t, c) => t + (c.qty || 1), 0) < 7) return toast("Add at least 7 cards to the main deck first.");
    fwState = Object.assign(fwState && fwState.deckId === d.id ? fwState : {deckId: d.id}, {realBusy: true, realDone: 0, realTotal: 30});
    renderFast();
    try { const real = await fwRealistic(d, 30, (i, n) => { fwState.realDone = i; fwState.realTotal = n; const b = $("fwReal"); if (b) b.textContent = `Playing games… ${i}/${n}`; }); fwState.real = real; }
    catch (err) { console.warn(err); toast("Couldn't finish the games."); }
    fwState.realBusy = false; renderFast(); return;
  }
  if (e.target.closest("#fwStop")) { if (fwState) { fwState.stop = true; const b = $("fwStop"); if (b) { b.disabled = true; b.textContent = "Stopping…"; } } return; }
  if (e.target.closest("[data-fwsteps]")) { prefs.fwSteps = !prefs.fwSteps; savePrefs(); return renderFast(); }
  const deepRun = !!e.target.closest("#fwDeep");
  if (!e.target.closest("#fwRun") && !deepRun) return;
  const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
  if (d.cards.filter(c => c.board === "main").reduce((t, c) => t + (c.qty || 1), 0) < 7) return toast("Add at least 7 cards to the main deck first.");
  fwState = {deckId: d.id, busy: true, done: 0, total: 0, res: fwState && fwState.deckId === d.id ? fwState.res : null};
  renderFast();
  try {
    // the normal search always checks for a faster win too (about 12 s); "Search harder" goes much further (up to a minute)
    const res = await fastestWin(d, (i, n, txt) => { fwState.done = i; fwState.total = n; const b = $("fwRun"); if (b) b.textContent = txt || `Searching… ${i}/${n}`; },
      Object.assign(deepRun ? {deep: true, budget: isPhone() ? 30000 : 60000, beam: 1500, wide: 40, planMs: 20000} : {deep: true, budget: isPhone() ? 6000 : 12000}, {stopped: () => !!(fwState && fwState.stop)}));
    if (fwState && fwState.stop) res.stopped = true;
    fwState = {deckId: d.id, res, busy: false, sig: simSig(d), real: fwState && fwState.real};
    if (res.stopped) toast(res.results.length ? "Stopped. Showing the fastest win found so far." : "Stopped before a win was found.");
  } catch (err) { console.warn(err); fwState = {deckId: d.id, busy: false}; toast("Couldn't finish the search."); }
  renderFast();
});

