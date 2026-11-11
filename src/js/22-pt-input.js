/* ----- input: clicks, drags, right-clicks, keys ----- */
function ptDropAt(x, y){
  const el = document.elementFromPoint(x, y); const t = el && el.closest("[data-drop]");
  if (!t) return null;
  if (t.dataset.drop === "bf") return ptDrag && ptDrag.snap ? {to: "bf", x: ptDrag.snap[0], y: ptDrag.snap[1]} : {to: "bf"};
  return {to: t.dataset.drop};
}
// Where the dragged card would land: its top-left corner rounded to the nearest square
function ptSnapAt(clientX, clientY){
  const tb = $("ptTable"); if (!tb || !ptDrag) return null;
  const f = ptFind(ptDrag.uid); if (!f) return null;
  const g = ptGrid(), r = tb.getBoundingClientRect(), card = f.zone === "bf" ? f.card : {tapped: false}, [fw, fh] = ptFoot(card);
  const {cols, rows} = ptTableSize();
  const x = Math.round((clientX - r.left - ptDrag.ox * fw * g) / g), y = Math.round((clientY - r.top - ptDrag.oy * fh * g) / g);
  return [Math.max(0, Math.min(cols - fw, x)), Math.max(0, Math.min(rows - fh + 8, y)), fw, fh];
}
function ptApplyDrop(uid, drop, wholePile){
  if (!drop) return;
  const f = ptFind(uid), pile = wholePile && f && f.zone === "bf" ? ptPileOf(f.card) : null;
  ptDo(() => {
    if (pile && pile.length > 1 && drop.to === "bf" && drop.x != null) { pile.forEach(c => ptMove(c.uid, "bf", {x: drop.x, y: drop.y})); ptLog(`Moved a stack of ${pile.length} ${f.card.name}${f.card.token ? " tokens" : "s"}.`); return; }
    if (pile && pile.length > 1 && drop.to !== "bf" && f.card.token) { pile.forEach(c => drop.to === "libBottom" ? ptMove(c.uid, "lib", {bottom: true}) : ptMove(c.uid, drop.to)); return; }
    const fc = f && f.card;
    if (fc && drop.to === "bf" && drop.x != null) {
      const attachable = /\b(Equipment|Aura|Fortification)\b/.test(ptFaceType(fc)) || fc.bestowed;
      const [fw, fh] = ptFoot(fc), cx = drop.x + fw / 2, cy = drop.y + fh / 2;
      const host = attachable ? PT.bf.find(h => h.uid !== fc.uid && h.att == null && (ptIsCreature(h) || ptIsLand(h) && /enchant (?:land|[a-z]+ land|forest|island|swamp|mountain|plains)|fortification/i.test(fc.text + " " + fc.type) || /enchant (?:permanent|artifact|enchantment)/i.test(fc.text || "")) && cx >= h.x && cx <= h.x + ptFoot(h)[0] && cy >= h.y && cy <= h.y + ptFoot(h)[1]) : null;
      if (host) { if (f.zone !== "bf") ptMove(uid, "bf", {x: host.x, y: host.y}); fc.att = host.uid; ptLog(`${fc.name} attached to ${ptNameOf(host)}.`); ptEmit("attach", fc); return; }
      if (fc.att != null) { delete fc.att; ptLog(`Unattached ${fc.name}.`); }
    }
    if (drop.to === "bf" && f && f.zone === "hand" && ptIsLand(fc)) ptNoteLand();
    if (drop.to === "bf") ptMove(uid, "bf", drop.x != null ? {x: drop.x, y: drop.y} : {});
    else if (drop.to === "libBottom") ptMove(uid, "lib", {bottom: true});
    else ptMove(uid, drop.to);
  });
}
function ptClick(el){
  const uid = +el.dataset.uid, zone = el.dataset.zone;
  if (PT_PICK && PT_PICK.spec.cards.some(c => c.uid === uid)) return ptPickToggle(uid);
  if (PT.phase === "bottom" && zone === "hand") return ptDo(() => ptBottomPick(uid));
  if (zone === "bf") {
    if (PT.targeting) return ptApplyTarget(uid);
    if (PT_VIEW && PT_VIEW.kind === "attack") { const f = ptFind(uid); if (f && (ptIsCreature(f.card) || f.card.faceDown) && !f.card.tapped) { PT_VIEW.pick.has(uid) ? PT_VIEW.pick.delete(uid) : PT_VIEW.pick.add(uid); ptRenderAttack(); } return; }
    return ptDo(() => ptTapPick(uid));
  }
  if (zone === "hand") { if (PT.phase === "mull") return toast("Keep or mulligan first."); return ptCastPaid(uid); }
  if (zone === "cmd") return ptCastPaid(uid);
  if (zone === "lib") { if (PT.phase === "mull") return toast("Keep or mulligan first."); return ptDo(() => ptDraw(1)); }
  if (zone === "grave" || zone === "exile") return ptView(zone);
}
function ptInit(){
  const root = ptEl();
  root.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !PT) return;
    if (!e.target.closest("#ptMenu")) ptCloseMenu();
    if (e.target.closest(".ptc-badge, button, input, select, #ptModal")) return;
    const el = e.target.closest(".ptc[data-uid]"); if (!el) return;
    ptDrag = {uid: +el.dataset.uid, el, x: e.clientX, y: e.clientY, moved: false};
  });
  addEventListener("pointermove", e => {
    if (!PT) return;
    if (ptDrag) {
      if (!ptDrag.moved && Math.hypot(e.clientX - ptDrag.x, e.clientY - ptDrag.y) > 6) {
        ptDrag.moved = true;
        const r = ptDrag.el.getBoundingClientRect(), g = ptDrag.el.cloneNode(true);
        g.classList.add("pt-ghost"); g.style.width = r.width + "px"; g.style.height = r.height + "px"; ptDrag.dx = e.clientX - r.left; ptDrag.dy = e.clientY - r.top;
        ptDrag.ox = ptDrag.dx / r.width; ptDrag.oy = ptDrag.dy / r.height; $("ptPreview").hidden = true;
        document.body.appendChild(g); ptDrag.ghost = g; ptDrag.el.classList.add("pt-dragging"); root.classList.add("dragging");
      }
      if (ptDrag.moved) {
        ptDrag.ghost.style.transform = `translate(${e.clientX - ptDrag.dx}px,${e.clientY - ptDrag.dy}px)`;
        const t = document.elementFromPoint(e.clientX, e.clientY); const over = t && t.closest("[data-drop]");
        if (ptDrag.over !== over) { if (ptDrag.over) ptDrag.over.classList.remove("over"); if (over) over.classList.add("over"); ptDrag.over = over; }
        const snapEl = $("ptSnap");
        if (over && over.id === "ptTable") {
          const sn = ptSnapAt(e.clientX, e.clientY), g = ptGrid(); ptDrag.snap = sn;
          if (sn && snapEl) { snapEl.hidden = false; Object.assign(snapEl.style, {left: sn[0] * g + "px", top: sn[1] * g + "px", width: sn[2] * g + "px", height: sn[3] * g + "px"}); }
        } else { ptDrag.snap = null; if (snapEl) snapEl.hidden = true; }
      }
    }
    const h = e.target.closest && e.target.closest("#pt .ptc[data-uid], #pt [data-uid-view]");
    const uid = h ? +(h.dataset.uid || h.dataset.uidView) : null;
    if (!ptDrag) { ptLastX = e.clientX; if (uid !== ptHover) { ptHover = uid; ptPreview(uid, e.clientX); } }
  });
  // a sideways swipe on your hand scrolls it (touch-action: pan-x); the browser takes the touch over and cancels the drag
  addEventListener("pointercancel", () => {
    if (!ptDrag) return;
    if (ptDrag.ghost) ptDrag.ghost.remove(); if (ptDrag.over) ptDrag.over.classList.remove("over");
    ptDrag.el.classList.remove("pt-dragging"); root.classList.remove("dragging"); const sn = $("ptSnap"); if (sn) sn.hidden = true;
    ptDrag = null;
  });
  // the mouse wheel scrolls the hand sideways
  root.addEventListener("wheel", e => {
    const hc = e.target.closest && e.target.closest(".pt-hand-cards"); if (!hc || Math.abs(e.deltaX) > Math.abs(e.deltaY) || hc.scrollWidth <= hc.clientWidth) return;
    e.preventDefault(); hc.scrollLeft += e.deltaY;
  }, {passive: false});
  addEventListener("pointerup", e => {
    if (!ptDrag || !PT) return;
    const d = ptDrag;
    if (d.over) d.over.classList.remove("over");
    if (d.moved) { d.ghost.remove(); root.classList.remove("dragging"); d.el.classList.remove("pt-dragging"); const drop = ptDropAt(e.clientX, e.clientY); ptDrag = null; ptApplyDrop(d.uid, drop, !e.shiftKey); return; }
    ptDrag = null;
    ptClick(d.el);
  });
  root.addEventListener("contextmenu", e => {
    if (!PT) return;
    const b = e.target.closest(".ptc-badge");
    if (b) { e.preventDefault(); return ptDo(() => ptCounter(+b.dataset.uid, b.dataset.cnt, -1)); }
    const el = e.target.closest(".ptc[data-uid]"), lib = e.target.closest("[data-pile=lib]");
    if (lib) { e.preventDefault(); return ptLibMenu(e.clientX, e.clientY); }
    if (el) { e.preventDefault(); ptCardMenu(+el.dataset.uid, e.clientX, e.clientY); }
  });
  root.addEventListener("click", async e => {
    if (!PT) return;
    if (ptTrayClick(e)) return;
    const hs = e.target.closest("[data-hscroll]");
    if (hs) { const hc = $("ptHand").querySelector(".pt-hand-cards"); if (hc) hc.scrollBy({left: +hs.dataset.hscroll * Math.max(120, hc.clientWidth * 0.8), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); return; }
    if (ptOppClick(e)) return;
    const badge = e.target.closest(".ptc-badge"); if (badge) return ptDo(() => ptCounter(+badge.dataset.uid, badge.dataset.cnt, 1));
    const atk = e.target.closest("[data-atk]"); if (atk && PT_VIEW && PT_VIEW.kind === "attack") { const us = atk.dataset.atk.split(",").map(Number), on = us.every(u => PT_VIEW.pick.has(u)); us.forEach(u => on ? PT_VIEW.pick.delete(u) : PT_VIEW.pick.add(u)); return ptRenderAttack(); }
    if (e.target.closest("[data-atkgo]") && PT_VIEW && PT_VIEW.kind === "attack") return ptAttack();
    if (e.target.closest("[data-atkall]") && PT_VIEW && PT_VIEW.kind === "attack") { const sick = c => c.since === PT.turn && !c.haste && !ptHasKw(c, "haste"); PT.bf.filter(c => (ptIsCreature(c) || c.faceDown) && !c.tapped && !sick(c)).forEach(c => PT_VIEW.pick.add(c.uid)); return ptRenderAttack(); }
    if (e.target.closest("[data-atknone]") && PT_VIEW && PT_VIEW.kind === "attack") { PT_VIEW.pick.clear(); return ptRenderAttack(); }
    const lk = e.target.closest("[data-legkeep]");
    if (lk && PT_VIEW && PT_VIEW.kind === "legend") {
      const keep = +lk.dataset.legkeep, rest = PT_VIEW.uids.filter(u => u !== keep), nm = ptFaceName(ptFind(keep).card);
      ptCloseModal();
      return ptDo(() => { rest.forEach(u => ptMove(u, "grave")); ptLog(`Legend rule: kept one ${nm}, the other${rest.length > 1 ? "s" : ""} went to the graveyard.`); });
    }
    const life = e.target.closest("[data-life]");
    if (life) { const k = life.dataset.life, dlt = +life.dataset.d * (e.shiftKey ? 5 : 1); return ptDo(() => { PT[k] = Math.max(0, PT[k] + dlt); ptLog(`${{life: "Life", poison: "Poison", energy: "Energy", opp: "Opponent's life"}[k]} ${dlt > 0 ? "+" : ""}${dlt} → ${PT[k]}.`); if (k === "life") ptEmit(dlt > 0 ? "gainlife" : "loselife", null, {amount: Math.abs(dlt)}); }); }
    const a = e.target.closest("[data-pt]");
    if (a) {
      const act = a.dataset.pt;
      if (act === "close") { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); return closePlaytest(); }
      if (act === "full") { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (ptEl().requestFullscreen) ptEl().requestFullscreen().catch(() => toast("Full screen isn't available here. Press F11 instead.")); return; }
      if (act === "draw") { if (PT.phase === "mull") return toast("Keep or mulligan first."); return ptDo(() => ptDraw(1)); }
      if (act === "untap") { ptCloseMenu(); return ptDo(ptUntapAll); }
      if (act === "next") return ptDo(ptNextTurn);
      if (act === "shuffle") return ptDo(ptShuffle);
      if (act === "pool") return ptDo(() => { ptEmptyPool(); });
      if (act === "mill") return ptDo(() => ptMill(1));
      if (act === "undo") return ptUndo();
      if (act === "keep") return ptDo(ptKeep);
      if (act === "mulligan") return ptDo(ptMulligan);
      if (act === "restart") { ptCloseMenu(); const d = deckById(PT.deckId); if (d) { PT = ptNew(d); ptRender(); toast("New game: shuffled and drew 7."); } return; }
      if (act === "tokens") return ptTokenDialog();
      if (act === "dice") { const r = a.getBoundingClientRect(); return ptDice(r.left, r.bottom + 4); }
      if (act === "more") { const r = a.getBoundingClientRect(); ptMenuFor = {dice: true}; return ptMenu(r.right - 230, r.bottom + 4, `<div class="ptm-title">More</div><button type="button" data-m="roll" data-n="2">Flip a coin</button><button type="button" data-m="roll" data-n="6">Roll a d6</button><button type="button" data-m="roll" data-n="20">Roll a d20</button><div class="ptm-row"><span>Roll a d</span><input type="number" id="ptmDie" value="12" min="2" max="1000" aria-label="Sides"><button type="button" data-m="rolln">Roll</button></div><div class="ptm-sep"></div><button type="button" data-pt="untap">Untap all<kbd>U</kbd></button><button type="button" data-pt="showpoison">${PT.poison || PT.showPoison ? "Hide" : "Show"} poison counters</button><button type="button" data-pt="showenergy">${PT.energy || PT.showEnergy ? "Hide" : "Show"} energy</button><button type="button" data-pt="autopick">${ptAuto() ? "✓ " : ""}Make choices for me (targets, sacrifices, searches)</button><button type="button" data-pt="rules">Rules lookup…</button><div class="ptm-sep"></div><button type="button" data-pt="restart">New game</button>`); }
      if (act === "autopick") { ptCloseMenu(); prefs.ptAutoPick = !ptAuto(); savePrefs(); toast(ptAuto() ? "The playtester will pick targets, sacrifices and searches for you." : "You'll choose targets, sacrifices and searches yourself (each one has a Pick for me button)."); return ptRender(); }
      if (act === "rules") { ptCloseMenu(); return ptModal("Rules lookup", `<p class="cur-sub">Every keyword ability (702) and keyword action (701) from the Comprehensive Rules, effective September 25, 2026.</p><input type="search" class="pt-rule-q" placeholder="Search: persist, ward, connive…" aria-label="Search the rules" oninput="document.getElementById('ptRules').innerHTML = ptRulesHtml(this.value)"><div id="ptRules" class="pt-rules">${ptRulesHtml("")}</div>`); }
      if (act === "showpoison") { ptCloseMenu(); PT.showPoison = !(PT.poison || PT.showPoison); if (!PT.showPoison) PT.poison = 0; return ptRender(); }
      if (act === "showenergy") { ptCloseMenu(); PT.showEnergy = !(PT.energy || PT.showEnergy); if (!PT.showEnergy) PT.energy = 0; return ptRender(); }
      if (act === "attack") return ptAttackDialog();
      if (act === "endturn") return ptDo(ptEndTurn);
      if (act === "trig") {
        const next = {auto: "ask", ask: "off", off: "auto"}[ptMode()]; prefs.ptTrigMode = next; savePrefs();
        if (next === "off") { PT.trig = []; PT.targeting = null; }
        toast({auto: "Triggers: Auto. Simple ones happen by themselves; the rest wait in the tray.", ask: "Triggers: Ask. Every trigger waits in the tray for you.", off: "Trigger helper off."}[next]);
        return ptRender();
      }
      if (act === "scry") { const r = a.getBoundingClientRect(); return ptLibMenu(r.left, r.bottom + 4); }
      if (act === "search") return ptView("search");
      if (act === "look") { if (PT.phase === "mull") return toast("Keep or mulligan first."); return ptDigOpen(); }
      if (act === "help") return ptHelp();
    }
    // context menu actions
    const m = e.target.closest("[data-m]");
    if (m && ptMenuFor) {
      const act = m.dataset.m, f = ptMenuFor, N = () => Math.max(1, Math.min(99, parseInt(($("ptmN") || {}).value) || 1));
      if (f.lib) {
        ptCloseMenu();
        if (act === "drawn") return ptDo(() => ptDraw(N()));
        if (act === "scryn") return ptView("scry", N());
        if (act === "looktop") return ptDigOpen(N());
        if (act === "milln") return ptDo(() => ptMill(N()));
        if (act === "exiletop") { const n = N(); return ptDo(() => { const k = Math.min(n, PT.lib.length); PT.exile.push(...PT.lib.splice(0, k)); ptLog(`Exiled the top ${k} card${k === 1 ? "" : "s"}.`); }); }
        if (act === "playtop") { if (!PT.lib.length) return; return ptDo(() => ptMove(PT.lib[0].uid, "bf")); }
        if (act === "search") return ptView("search");
        if (act === "shuffle") return ptDo(ptShuffle);
        return;
      }
      if (f.dice) { if (act === "roll") { ptCloseMenu(); return ptRoll(+m.dataset.n); } if (act === "rolln") { const n = Math.max(2, parseInt($("ptmDie").value) || 6); ptCloseMenu(); return ptRoll(n); } return; }
      const uid = f.uid, fc = ptFind(uid); if (!fc) return ptCloseMenu();
      if (act === "cnt") { ptDo(() => ptCounter(uid, m.dataset.k, +m.dataset.d)); return ptCardMenu(uid, f.x, f.y); }
      if (act === "clearcnt") { ptDo(() => { fc.card.counters = {}; }); return ptCardMenu(uid, f.x, f.y); }
      if (act === "addcustom") {
        const name = ($("ptmCustom").value || "").trim().slice(0, 20); if (!name) return;
        const k = "x-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"); if (!PT_COUNTERS.some(x => x[0] === k)) PT_COUNTERS.push([k, name]);
        ptDo(() => ptCounter(uid, k, 1)); return ptCardMenu(uid, f.x, f.y);
      }
      if (act === "chooseType") { const f = ptFind(uid); ptCloseMenu(); if (!f) return; const v = prompt(`The type ${f.card.name} named:`, trCap(ptChosenOf(f.card))); if (v && v.trim()) ptDo(() => { f.card.chosenType = v.trim().toLowerCase().replace(/s$/, ""); ptLog(`${f.card.name}: chose ${trCap(f.card.chosenType)}.`); }); return; }
      if (act === "copy") { const n = Math.max(1, Math.min(50, parseInt($("ptmCopyN").value) || 1)); ptCloseMenu(); return ptDo(() => ptCopy(uid, n)); }
      ptCloseMenu();
      if (act === "act") { if (m.getAttribute("aria-disabled") === "true") return toast(m.title || "Can't use that right now."); return ptActivate(uid, +m.dataset.i); }
      if (act === "unattach") return ptDo(() => { delete fc.card.att; [fc.card.x, fc.card.y] = ptPlace(fc.card); ptLog(`Unattached ${fc.card.name}.`); });
      if (act === "attachpick") return ptDo(() => ptTarget({kind: "attach", uid, label: `Click the creature to attach ${fc.card.name} to`}));
      if (act === "tap") return ptDo(() => ptTap(uid));
      if (act === "tappile") { const st = ptPileOf(fc.card), to = !st.every(s => s.tapped); return ptDo(() => st.forEach(s => { s.tapped = to; })); }
      if (act === "tapstack") { const st = PT.bf.filter(o => o.name === fc.card.name), to = !st.every(s => s.tapped); return ptDo(() => st.forEach(s => s.tapped = to)); }
      if (act === "facedown") return ptDo(() => { fc.card.faceDown = !fc.card.faceDown; ptLog(fc.card.faceDown ? `Turned ${fc.card.name} face down.` : `Turned ${fc.card.name} face up.`); });
      if (act === "transform") return ptDo(() => { fc.card.back = !fc.card.back; ptLog(`Transformed ${fc.card.name}.`); });
      if (act === "play") return ptDo(() => fc.zone === "cmd" ? ptMove(uid, "bf") : ptPlay(uid));
      if (act === "playbf") return ptDo(() => ptMove(uid, "bf", {cast: false}));
      if (act === "playfd") return ptDo(() => ptMove(uid, "bf", {faceDown: true}));
      if (act === "remove") return ptDo(() => { PT.bf.splice(PT.bf.indexOf(fc.card), 1); ptLog(`Removed ${fc.card.name} token.`); });
      if (act === "sac") return ptDo(() => ptSacrifice(uid));
      if (act === "kw") { const k = m.dataset.k; ptDo(() => { fc.card.kw = Object.assign({}, fc.card.kw, {[k]: !(fc.card.kw && fc.card.kw[k])}); ptLog(`${fc.card.name} ${fc.card.kw[k] ? "gains" : "loses"} ${k}.`); }); return ptCardMenu(uid, f.x, f.y); }
      if (act === "way") { const way = m.dataset.way; ptCloseMenu(); return ptCastPaid(uid, way); }
      if (act === "move") { const to = m.dataset.to; return ptDo(() => to === "libBottom" ? ptMove(uid, "lib", {bottom: true}) : ptMove(uid, to)); }
      return;
    }
    // dialogs
    const dv = e.target.closest("[data-d]");
    if (dv) {
      const act = dv.dataset.d;
      if (act === "pick") return ptPickToggle(+dv.dataset.uid);
      if (act === "pickdone") return ptPickFinish(PT_PICK ? PT_PICK.sel.slice() : []);
      if (act === "pickskip") return ptPickFinish([]);
      if (act === "pickauto") return ptPickFinish([], true);
      if (act === "close") return ptCloseModal();
      if (act === "scrydone") {
        const v = PT_VIEW, top = PT.lib.slice(0, v.n);
        ptDo(() => {
          const keep = [], bottom = [], grave = [];
          for (const c of top) { const ch = v.choice[c.uid] || "top"; (ch === "bottom" ? bottom : ch === "grave" ? grave : keep).push(c); }
          PT.lib.splice(0, top.length, ...keep); PT.lib.push(...bottom); PT.grave.push(...grave);
          ptLog(`Scried ${top.length}: ${keep.length} on top, ${bottom.length} to the bottom${grave.length ? `, ${grave.length} to the graveyard` : ""}.`);
        });
        return ptCloseModal();
      }
      if (act === "done") {
        if (PT_VIEW && PT_VIEW.kind === "search") return ptSearchDone();
        return ptCloseModal();
      }
      if (act === "searchall") { PT_VIEW.showAll = !PT_VIEW.showAll; return ptRenderView(); }
    }
    const dg = e.target.closest("[data-dig]");
    if (dg && PT_VIEW && PT_VIEW.kind === "dig") {
      const act = dg.dataset.dig, uid = +dg.dataset.uid, v = PT_VIEW, max = Math.max(0, prefs.ptDigMax ?? 1);
      if (act === "done") return ptDigApply();
      if (act === "pick") {
        const i = v.picked.indexOf(uid);
        if (i >= 0) v.picked.splice(i, 1);
        else if (max > 0) { v.picked.push(uid); while (v.picked.length > max) v.picked.shift(); }
        else toast("Set “Pick up to” to 1 or more to pick cards.");
      }
      if (act === "left" || act === "right") { const i = v.order.indexOf(uid), j = i + (act === "left" ? -1 : 1); if (j >= 0 && j < v.order.length) [v.order[i], v.order[j]] = [v.order[j], v.order[i]]; }
      return ptRenderDig();
    }
    const vb = e.target.closest("[data-v]");
    if (vb && PT_VIEW) {
      const uid = +vb.dataset.uid, to = vb.dataset.v;
      if (PT_VIEW.kind === "scry") { PT_VIEW.choice[uid] = to; return ptRenderView(); }
      const v = PT_VIEW;
      if (v.kind === "search" && to === "top") { v.held = v.held || []; const i = v.held.indexOf(uid); if (i >= 0) v.held.splice(i, 1); else v.held.push(uid);
        if (v.to === "top" && v.max && v.max < 99 && v.held.length >= v.max) return ptSearchDone();
        return ptRenderView(); }
      if (v.held) v.held = v.held.filter(u => u !== uid);
      if (to === "play") { ptCloseModal(); return ptCastPaid(uid); }
      ptDo(() => { to === "libBottom" ? ptMove(uid, "lib", {bottom: true}) : ptMove(uid, to === "bfTapped" ? "bf" : to); if (to === "bfTapped") { const f = ptFind(uid); if (f) f.card.tapped = true; } });
      if (v.kind === "search") { v.got = (v.got || 0) + 1; if (v.max && v.max < 99 && v.got >= v.max && !(v.held || []).length) return ptSearchDone(); }
      return ptRenderView();
    }
    const pl = e.target.closest("[data-pile]");
    if (pl && !e.target.closest(".ptc, [data-drop=lib], [data-drop=libBottom]")) { const z = pl.dataset.pile; if (z === "lib") { if (PT.phase !== "mull") ptDo(() => ptDraw(1)); } else ptView(z); return; }
    const tc = e.target.closest("[data-tokc]"); if (tc) return ptCommonToken(+tc.dataset.tokc);
    const tf = e.target.closest("[data-tokf]"); if (tf) { const t = ptTokenFound[+tf.dataset.tokf], n = ptTokN(); ptDo(() => ptCreateToken(t, n)); return toast(`Created ${n} ${t.name} token${n === 1 ? "" : "s"}.`); }
  });
  root.addEventListener("submit", e => {
    e.preventDefault();
    if (ptOppSubmit(e)) return;
    if (e.target.id === "ptTokSearch") { const q = $("ptTokQ").value.trim(); if (q) ptSearchTokens(q); }
    if (e.target.id === "ptTokCustom") {
      const kind = $("ptcKind").value, col = $("ptcCol").value, isCre = /Creature/.test(kind);
      const def = {name: $("ptcName").value.trim() || "Token", type: `Token ${kind}`, power: isCre ? $("ptcP").value.trim() : "", toughness: isCre ? $("ptcT").value.trim() : "", colors: col ? [col] : [], text: $("ptcText").value.trim()};
      const n = ptTokN(); ptDo(() => ptCreateToken(def, n)); toast(`Created ${n} ${def.name} token${n === 1 ? "" : "s"}.`);
    }
  });
  root.addEventListener("input", e => {
    if (e.target.id === "ptdFind" && PT_VIEW) { PT_VIEW.q = e.target.value; ptRenderView(); }
    if (e.target.id === "ptCellSize") { prefs.ptGrid = +e.target.value; savePrefs(); ptRender(); }
  });
  root.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("pt-logbox")) { prefs.ptLogOpen = e.target.open; savePrefs(); } }, true);
  root.addEventListener("change", e => {
    if (e.target.id === "ptFreeMull") { prefs.ptFreeMull = e.target.checked; savePrefs(); }
    if (e.target.id === "ptDrawT1") { prefs.ptDrawT1 = e.target.checked; savePrefs(); }
    if (e.target.id === "ptOppNsel") { ptSetOppN(+e.target.value); return; }
    if (e.target.id === "ptAutoMana") { prefs.ptAutoMana = e.target.checked; savePrefs(); if (PT) ptRender(); }
    if (e.target.id === "ptdShuffle" && PT_VIEW) PT_VIEW.noShuffle = !e.target.checked;
    if (PT_VIEW && PT_VIEW.kind === "dig") {
      // redraw after the browser has finished with the field that changed
      const later = fn => setTimeout(() => { if (PT_VIEW && PT_VIEW.kind === "dig") fn(); }, 0);
      if (e.target.id === "digN") { const n = Math.max(1, Math.min(PT.lib.length || 1, parseInt(e.target.value) || 1)); prefs.ptLookN = n; savePrefs(); return later(() => ptDigOpen(n)); }
      if (e.target.id === "digMax") { prefs.ptDigMax = Math.max(0, parseInt(e.target.value) || 0); savePrefs(); const v = PT_VIEW; while (v.picked.length > prefs.ptDigMax) v.picked.shift(); return later(ptRenderDig); }
      if (e.target.id === "digSel") { prefs.ptDigSel = e.target.value; savePrefs(); return later(ptRenderDig); }
      if (e.target.id === "digRest") { prefs.ptDigRest = e.target.value; savePrefs(); return later(ptRenderDig); }
      if (e.target.id === "digReveal") { prefs.ptDigReveal = e.target.checked; savePrefs(); }
    }
    if (e.target.id === "ptmMore" && ptMenuFor && ptMenuFor.uid) {
      const k = e.target.value; if (!k) return;
      const uid = ptMenuFor.uid; ptDo(() => ptCounter(uid, k, 1)); ptCardMenu(uid, ptMenuFor.x, ptMenuFor.y);
    }
  });
  addEventListener("keydown", e => {
    if (!PT || ptEl().hidden) return;
    e.stopPropagation();   // the scanner's own shortcuts stay quiet while the table is open
    if (e.key === "Escape") { if (!$("ptMenu").hidden) return ptCloseMenu(); if (!$("ptModal").hidden) return ptCloseModal(); return; }
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return ptUndo(); }
    if (e.ctrlKey || e.metaKey || e.altKey || !$("ptModal").hidden) return;
    const k = e.key.toLowerCase(), hv = ptHover != null ? ptFind(ptHover) : null;
    if (k === "d") { e.preventDefault(); if (PT.phase !== "mull") ptDo(() => ptDraw(1)); }
    else if (k === "u") { e.preventDefault(); ptDo(ptUntapAll); }
    else if (k === "n") { e.preventDefault(); ptDo(ptNextTurn); }
    else if (k === "s") { e.preventDefault(); ptDo(ptShuffle); }
    else if (k === "k") { e.preventDefault(); ptTokenDialog(); }
    else if (k === "a") { e.preventDefault(); ptAttackDialog(); }
    else if (k === "e") { e.preventDefault(); ptDo(ptEndTurn); }
    else if (k === "t" && hv && hv.zone === "bf") { e.preventDefault(); ptDo(() => ptTapPick(ptHover)); }
    else if ((k === "+" || k === "=") && hv && hv.zone === "bf") { e.preventDefault(); ptDo(() => ptCounter(ptHover, "p1p1", 1)); }
    else if ((k === "-" || k === "_") && hv && hv.zone === "bf") { e.preventDefault(); ptDo(() => ptCounter(ptHover, "m1m1", 1)); }
    else if (k === "c" && hv && hv.zone === "bf") { e.preventDefault(); ptDo(() => ptCopy(ptHover, 1)); }
  }, true);
  addEventListener("resize", () => { if (PT && !ptEl().hidden) ptRender(); });
  document.addEventListener("fullscreenchange", () => { if (PT && !ptEl().hidden) setTimeout(ptRender, 50); });
}
ptInit();

