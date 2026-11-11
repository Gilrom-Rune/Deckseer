/* ----- opponents: life, poison, commander damage, and the creatures that block -----
   A Commander game has 3 opponents (1 otherwise; ⋯ → Settings changes it). Each has a life total, poison counters,
   commander damage taken, and a board of creatures that can block. Their creatures are added by hand, or the board
   grows by itself each turn like a typical deck (or like one of your decks). "Each opponent" effects hit them all;
   "target opponent" and "any target" hit the one you're aiming at (click an opponent to aim at them). */
const PT_OPP_TYPICAL = [
  [2, {name: "Bear", power: 2, toughness: 2}], [2, {name: "Wall", power: 0, toughness: 4, text: "Defender"}], [2, {name: "Elf", power: 1, toughness: 1}],
  [3, {name: "Knight", power: 2, toughness: 3, text: "First strike"}], [3, {name: "Spider", power: 2, toughness: 4, text: "Reach"}], [3, {name: "Bird", power: 2, toughness: 2, text: "Flying"}],
  [4, {name: "Drake", power: 3, toughness: 3, text: "Flying"}], [4, {name: "Ogre", power: 4, toughness: 4}], [4, {name: "Assassin", power: 2, toughness: 2, text: "Deathtouch"}],
  [5, {name: "Angel", power: 4, toughness: 4, text: "Flying, vigilance"}], [5, {name: "Treefolk", power: 3, toughness: 6, text: "Reach"}],
  [6, {name: "Wurm", power: 6, toughness: 6, text: "Trample"}], [6, {name: "Dragon", power: 5, toughness: 5, text: "Flying"}], [7, {name: "Titan", power: 7, toughness: 7, text: "Indestructible"}]];
const PT_OPP_QUICK = [{name: "Soldier", power: 1, toughness: 1}, {name: "Bear", power: 2, toughness: 2}, {name: "Wall", power: 0, toughness: 4, text: "Defender"}, {name: "Knight", power: 2, toughness: 2, text: "First strike"},
  {name: "Spider", power: 2, toughness: 4, text: "Reach"}, {name: "Bird", power: 1, toughness: 1, text: "Flying"}, {name: "Drake", power: 3, toughness: 3, text: "Flying"}, {name: "Ogre", power: 4, toughness: 4},
  {name: "Assassin", power: 1, toughness: 1, text: "Deathtouch"}, {name: "Angel", power: 4, toughness: 4, text: "Flying"}, {name: "Wurm", power: 6, toughness: 6, text: "Trample"}, {name: "God", power: 6, toughness: 6, text: "Indestructible"}];
const PT_OPP_KWS = ["Flying", "Reach", "First strike", "Double strike", "Deathtouch", "Indestructible", "Defender", "Trample", "Lifelink", "Vigilance"];
const ptOppN = isCmd => Math.max(1, Math.min(5, +prefs.ptOppN || (isCmd ? 3 : 1)));
function ptOppMake(i, n, isCmd){ return {name: n > 1 ? `Opponent ${i + 1}` : "Opponent", life: isCmd ? 40 : 20, poison: 0, cmd: {}, board: [], out: 0, mode: prefs.ptOppMode || "hand"}; }
function ptOppsFix(){   // an older game (or an undo from one) without opponents
  if (!PT.opps) { PT.opps = [Object.assign(ptOppMake(0, 1, PT.isCmd), {life: PT.opp != null ? PT.opp : PT.isCmd ? 40 : 20, poison: PT.oppPoison || 0, cmd: PT.cmdDmg || {}})]; PT.oppT = 0; }
}
const ptLiveOpps = () => PT.opps.filter(o => !o.out);
function ptOppT(){ ptOppsFix(); const o = PT.opps[PT.oppT]; if (!o || o.out) { const i = PT.opps.findIndex(x => !x.out); if (i >= 0) PT.oppT = i; } return PT.opps[PT.oppT] || PT.opps[0]; }
const ptOppSync = () => { PT.opp = Math.max(0, ptOppT().life); };
const ptOkw = (o, k) => new RegExp(`(?:^|\\n|,\\s*)${k}\\b`, "i").test(o.text || "");
function ptOppCre(def){
  return {uid: ++ptUid, name: def.name, power: String(def.power ?? 0), toughness: String(def.toughness ?? 1), text: def.text || "", type: def.type || "Creature",
    colors: def.colors || [], img: def.img || "", token: !def.img, dmg: 0, since: PT.turn};
}
// Damage and life loss to opponents: "each" (every opponent still in), an opponent's number, or the one you're aiming at
function ptHitOpp(n, why, who){
  ptOppsFix();
  const list = who === "each" ? ptLiveOpps() : [typeof who === "number" ? PT.opps[who] : ptOppT()].filter(o => o && !o.out);
  if (!list.length) return;
  for (const o of list) {
    const was = o.life; o.life = Math.max(0, o.life - n);
    if (n > 0 && was > 0) ptEmit("opploss", null, {amount: n});
    ptLog(`${o.name} ${why === "combat" ? "is dealt" : "takes"} ${n}${why && why !== "combat" ? ` (${why})` : why === "combat" ? " combat damage" : ""}. ${o.name} at ${o.life}.`);
  }
  if (n > 0) { PT.oppLostTurn = PT.turn; if (PT.speed && PT.speed < 4 && PT.speedTurn !== PT.turn) { PT.speed++; PT.speedTurn = PT.turn; ptLog(`Your speed goes up to ${PT.speed}${PT.speed === 4 ? " (max speed!)" : ""}.`); } }
  ptOppsCheck();
}
function ptPoisonOpp(n, who){
  ptOppsFix();
  const list = who === "each" ? ptLiveOpps() : [typeof who === "number" ? PT.opps[who] : ptOppT()].filter(o => o && !o.out);
  for (const o of list) { o.poison += n; ptLog(`${o.name} gets ${n} poison counter${n > 1 ? "s" : ""} (${o.poison} total).`); }
  ptOppsCheck();
}
// An opponent is out at 0 life, 10 poison or 21 damage from one commander; you win when they're all out
function ptOppsCheck(){
  if (!PT || !PT.opps) return;
  for (const o of PT.opps) {
    if (o.out) continue;
    const why = o.life <= 0 ? "is at 0 life" : o.poison >= 10 ? "has 10 poison counters" : Object.values(o.cmd || {}).some(v => v >= 21) ? "has taken 21 commander damage" : "";
    if (!why) continue;
    o.out = PT.turn || 1; ptLog(`${o.name} ${why} and is out of the game.`);
    if (PT.opps.length > 1 && ptLiveOpps().length) toast(`${o.name} ${why}: out of the game.`);
  }
  if (!PT.won && PT.opps.every(o => o.out)) {
    PT.won = PT.turn || 1;
    const msg = PT.opps.length > 1 ? `Every opponent is out: you win on turn ${PT.won}!` : `Your opponent is out: you win on turn ${PT.won}!`;
    toast(msg); ptLog(msg);
  }
  ptOppSync();
}
// Their turns happen between yours: when a board grows by itself, each opponent may add a creature
function ptOppGrow(){
  for (const o of ptLiveOpps()) {
    if (!o.mode || o.mode === "hand" || o.board.length >= 7 || PT.turn < 2) continue;
    let pool;
    if (o.mode === "typical") pool = PT_OPP_TYPICAL.filter(([t]) => t <= PT.turn).map(x => x[1]);
    else { const d = (typeof decks !== "undefined" ? decks : []).find(x => x.id === o.mode); pool = d ? d.cards.concat(d.commanders || []).filter(c => /\bCreature\b/.test((c.type || "").split(" // ")[0]) && (c.cmc || 0) <= PT.turn && (c.power || c.toughness)) : []; }
    if (!pool.length || Math.random() > 0.7) continue;
    // bigger things become likelier as the game goes on
    const w = pool.map(c => 1 + (c.cmc != null ? c.cmc : (PT_OPP_TYPICAL.find(x => x[1] === c) || [0])[0]));
    let r = Math.random() * w.reduce((t, v) => t + v, 0), k = 0; while (k < pool.length - 1 && (r -= w[k]) > 0) k++;
    const pick = pool[k], cr = ptOppCre(Object.assign({}, pick, pick.id || pick.sid ? {img: pick.imgN || bigImg(pick)} : {}));
    o.board.push(cr); ptLog(`${o.name} played ${cr.name} (${cr.power}/${cr.toughness}${cr.text ? ", " + cr.text.split("\n")[0].slice(0, 40) : ""}).`);
  }
}

/* ----- combat: attack the opponent you choose, they block, damage in first-strike and regular steps ----- */
const ptSick = c => c.since === PT.turn && !c.haste && !ptHasKw(c, "haste");
const ptCantAttack = c => ptHasKw(c, "defender") || (/\bcan't attack\b/i.test(ptFaceText(c)) && !/can't attack or block alone/i.test(ptFaceText(c)));
const ptAtkOpp = c => PT.atkOpp && PT.atkOpp[c.uid] != null && PT.opps[PT.atkOpp[c.uid]] && !PT.opps[PT.atkOpp[c.uid]].out ? PT.atkOpp[c.uid] : PT.opps.indexOf(ptOppT());
function ptAttackDialog(){
  if (PT.phase !== "play") return toast("Keep your opening hand first.");
  ptOppsFix();
  if (!ptLiveOpps().length) return toast("Every opponent is already out.");
  ptDo(() => { ptEmit("combat"); ptLog("Beginning of combat."); });
  const cs = PT.bf.filter(c => (ptIsCreature(c) || c.faceDown) && !c.tapped);
  const t = PT.opps.indexOf(ptOppT());
  PT_VIEW = {kind: "attack", pick: new Set(cs.filter(c => !ptSick(c) && !ptCantAttack(c) && (ptCombatOf(c) > 0 || ptFaceText(c).match(/whenever [^.]*attacks/i))).map(c => c.uid)), to: Object.fromEntries(cs.map(c => [c.uid, t]))};
  ptRenderAttack();
}
function ptRenderAttack(){
  const v = PT_VIEW, cs = PT.bf.filter(c => (ptIsCreature(c) || c.faceDown) && !c.tapped);
  const live = PT.opps.map((o, i) => [o, i]).filter(([o]) => !o.out), multi = live.length > 1;
  const pw = c => ptCombatOf(c), sum = {};
  cs.filter(c => v.pick.has(c.uid)).forEach(c => { const i = v.to[c.uid] ?? PT.oppT; sum[i] = (sum[i] || 0) + pw(c); });
  const short = o => o.name.replace(/^Opponent /, "Opp ");
  const rows = []; { const seen = new Set();
    for (const c of cs) { if (seen.has(c.uid)) continue; const grp = c.token ? cs.filter(o => o.token && ptTokKey(o) === ptTokKey(c) && ptSick(o) === ptSick(c) && (v.to[o.uid] ?? PT.oppT) === (v.to[c.uid] ?? PT.oppT)) : [c]; grp.forEach(o => seen.add(o.uid)); rows.push(grp); } }
  ptModal("Attack", `<p class="cur-sub">Tick your attackers here or click them on the table${multi ? `, and choose who each one attacks (click the name on the right to switch)` : ""}. They tap (unless they have vigilance) and attack triggers go on the stack. Then ${PT.opps.some(o => o.board.length) ? "your opponents choose blockers (you can change them) and " : ""}combat damage is dealt.</p>
    ${multi ? `<div class="atk-to"><span class="cur-sub">Everyone attacks:</span>${live.map(([o, i]) => `<button type="button" class="linkish" data-atktoall="${i}">${esc(o.name)} (${o.life})</button>`).join("")}</div>` : ""}
    <div class="atk-list">${rows.map(grp => { const c = grp[0], on = grp.every(o => v.pick.has(o.uid)), some = !on && grp.some(o => v.pick.has(o.uid)), dmg = grp.reduce((t, o) => t + pw(o), 0), ti = v.to[c.uid] ?? PT.oppT;
      return `<div class="atk-wrap"><button type="button" class="atk-row${on ? " on" : some ? " some" : ""}" data-atk="${grp.map(o => o.uid).join(",")}" data-uid-view="${c.uid}" aria-pressed="${on}">
      <span class="atk-box">${on ? "⚔" : ""}</span>${c.faceDown || !c.img ? `<span class="pt-si-img noimg"></span>` : `<img class="pt-si-img" src="${esc(c.back ? c.img.replace("/front/", "/back/") : c.img)}" alt="" loading="lazy">`}
      <span class="atk-name"><b>${esc(c.faceDown ? "Face-down creature" : ptFaceName(c))}${grp.length > 1 ? ` <em class="atk-n">×${grp.length}</em>` : ""}</b>${ptSick(c) ? `<small>summoning sick</small>` : ptCantAttack(c) ? `<small>can't attack</small>` : ""}</span>
      <span class="atk-pw">${esc(ptPT(c) || (c.faceDown ? "2/2" : ""))}<small>${dmg} dmg</small></span></button>${multi ? `<button type="button" class="atk-tgt" data-atkto="${grp.map(o => o.uid).join(",")}" title="Who it attacks: click to switch">→ ${esc(short(PT.opps[ti]))}</button>` : ""}</div>`; }).join("") || `<div class="pt-stack-empty">No untapped creatures.</div>`}</div>
    ${cs.length > 1 ? `<div class="atk-quick"><button type="button" class="linkish" data-atkall="1">All that can attack</button><button type="button" class="linkish" data-atknone="1">None</button></div>` : ""}`,
    `<span class="cur-sub atk-sum">${v.pick.size} attacking · ${Object.keys(sum).length ? Object.entries(sum).map(([i, d]) => `<b>${d}</b> at ${esc(short(PT.opps[i]))} (${PT.opps[i].life})`).join(", ") : "no damage"}</span><button class="btn ghost" type="button" data-d="close">Cancel</button><button class="btn primary" type="button" data-atkgo="1" ${v.pick.size ? "" : "disabled"}>Attack</button>`);
  document.querySelectorAll("#ptBf .ptc[data-uid]").forEach(el => el.classList.toggle("attacking", v.pick.has(+el.dataset.uid)));
}
function ptAttack(){
  const v = PT_VIEW, att = PT.bf.filter(c => v.pick.has(c.uid));
  ptCloseModal();
  ptDo(() => {
    PT.atkOpp = {}; att.forEach(c => { PT.atkOpp[c.uid] = v.to[c.uid] ?? PT.oppT; });
    att.forEach((c, i) => { if (!ptHasKw(c, "vigilance")) c.tapped = true; ptEmit("attack", c, {first: i === 0}); });
    const by = {}; att.forEach(c => { const n = PT.opps[PT.atkOpp[c.uid]].name; (by[n] = by[n] || []).push(c.faceDown ? "a face-down creature" : c.name); });
    ptLog(`Attacked ${Object.entries(by).map(([n, l]) => `${n} with ${l.join(", ")}`).join("; ")}.`);
    PT.combat = att.map(c => c.uid); PT.attackedTurn = PT.turn; att.forEach(c => { c.attackedTurn = PT.turn; });
    if (att.length === 1) ptEmit("attackalone", att[0]);
  });
  // damage waits until the attack triggers are dealt with (Krenko's counter makes him hit harder)
  if (ptMode() !== "off" && PT.trig.length) { PT.trig.push({id: ++ptTrigId + "-dmg", srcUid: null, srcName: "Combat damage", img: "", kind: "combatdmg", text: "Blockers, then combat damage. Resolve attack triggers first.", actions: [{t: "combat", label: "Blocks and damage"}]}); ptRender(); }
  else ptBlocksOrDamage();
}
// One attacker's damage to a player: power (with counters and boosts), double strike, Torbran, damage doublers
function ptCombatOf(c){
  const base = Math.max(0, parseInt(ptPT(c) || (c.faceDown ? "2" : "0")) || 0), m = ptMods();
  if (!base) return 0;
  const hits = ptHasKw(c, "double strike") ? 2 : 1;
  return hits * (base + ((c.colors || []).includes("R") ? m.torbran : 0)) * m.dmgX;
}
const PT_COLOR_WORD = {white: "W", blue: "U", black: "B", red: "R", green: "G"};
// Can this opponent's creature block that attacker of yours?
function ptCanBlock(b, a){
  if (!b || b.tapped || b.noBlock === PT.turn || /\bcan't block\b/i.test(b.text || "")) return false;
  const at = a.faceDown ? "" : ptFaceText(a);
  if (/\bcan't be blocked\b(?!\s+(?:by|except))/i.test(at) && !/\bcan't be blocked\b[^.]*\bas long as\b/i.test(at)) return false;
  if (ptHasKw(a, "shadow") || ptHasKw(a, "horsemanship")) return false;
  if (ptHasKw(a, "flying") && !ptOkw(b, "flying") && !ptOkw(b, "reach")) return false;
  if (ptHasKw(a, "skulk") && (+b.power || 0) > ptPow(a)) return false;
  let m;
  if ((m = at.match(/can't be blocked by creatures with power (\d+) or less/i)) && (+b.power || 0) <= +m[1]) return false;
  if ((m = at.match(/can't be blocked by creatures with power (\d+) or greater/i)) && (+b.power || 0) >= +m[1]) return false;
  if ((m = at.match(/protection from ([a-z, ]+?)(?:\.|\n|$)/i))) { const cols = m[1].toLowerCase().split(/,? and |, | or /).map(w => PT_COLOR_WORD[w.trim()]).filter(Boolean); if ((b.colors || []).some(x => cols.includes(x)) || /everything|creatures/.test(m[1])) return false; }
  if (ptHasKw(a, "fear") && !/\bArtifact\b/.test(b.type || "") && !(b.colors || []).includes("B")) return false;
  if (ptHasKw(a, "intimidate") && !/\bArtifact\b/.test(b.type || "") && !(b.colors || []).some(x => (a.colors || []).includes(x))) return false;
  return true;
}
// How the opponents block: good blocks (kill it and live), safe blocks (live), fair trades, and chump blocks only to stay alive
function ptAutoBlocks(atks){
  const res = {};
  const pw = a => ptPow(a), tg = a => ((ptStats(a) || [0, 1])[1]) - (a.dmg || 0);
  const fsA = a => ptHasKw(a, "first strike") || ptHasKw(a, "double strike"), fsB = b => ptOkw(b, "first strike") || ptOkw(b, "double strike");
  const kills = (b, a) => (+b.power || 0) > 0 && ((+b.power || 0) >= tg(a) || ptOkw(b, "deathtouch")) && !ptHasKw(a, "indestructible");
  const dies = (b, a) => pw(a) > 0 && (pw(a) >= (+b.toughness || 0) - (b.dmg || 0) || ptHasKw(a, "deathtouch")) && !ptOkw(b, "indestructible");
  const killsReal = (b, a) => kills(b, a) && !(fsA(a) && !fsB(b) && dies(b, a));
  const diesReal = (b, a) => dies(b, a) && !(fsB(b) && !fsA(a) && kills(b, a));
  const val = b => (+b.power || 0) + (+b.toughness || 0);
  PT.opps.forEach((o, oi) => {
    if (o.out) return;
    const mine = atks.filter(x => x.opp === oi).map(x => x.c); if (!mine.length) return;
    const free = o.board.filter(b => !b.tapped), used = new Set();
    const order = mine.slice().sort((x, y) => ptCombatOf(y) - ptCombatOf(x));
    const cands = a => free.filter(b => !used.has(b.uid) && ptCanBlock(b, a)).sort((x, y) => val(x) - val(y));
    const pass = kind => { for (const a of order) {
      if (res[a.uid] || ptHasKw(a, "menace")) continue;
      const pick = cands(a).filter(b => kind === "good" ? killsReal(b, a) && !diesReal(b, a) : kind === "safe" ? !diesReal(b, a) && (ptHasKw(a, "trample") ? (+b.toughness || 0) >= pw(a) : true) : killsReal(b, a) && val(b) <= pw(a) + tg(a));
      if (pick.length) { res[a.uid] = [pick[0].uid]; used.add(pick[0].uid); }
    } };
    // would what's left kill them? Then chump block the biggest hits
    const lethal = () => {
      let dmg = 0, poison = 0; const cmd = Object.assign({}, o.cmd);
      for (const a of mine) {
        let d = ptCombatOf(a); const bl = res[a.uid];
        if (bl) { if (!ptHasKw(a, "trample")) continue; d = Math.max(0, d - bl.reduce((t, u) => { const b = o.board.find(x => x.uid === u); return t + (ptHasKw(a, "deathtouch") ? 1 : Math.max(0, (+b.toughness || 0) - (b.dmg || 0))); }, 0)); }
        if (ptHasKw(a, "infect")) poison += d; else dmg += d;
        const tox = ptKws(a).get("toxic"); if (tox && d > 0) poison += parseInt(tox.val) || 1;
        if (a.commander && !ptHasKw(a, "infect")) cmd[a.uid] = (cmd[a.uid] || 0) + d;
      }
      return o.life - dmg <= 0 || o.poison + poison >= 10 || Object.values(cmd).some(v => v >= 21);
    };
    pass("good");
    for (const a of order) {
      if (!lethal()) break;
      if (res[a.uid]) continue;
      const need = ptHasKw(a, "menace") ? 2 : 1, cs = cands(a).sort((x, y) => (ptHasKw(a, "trample") ? (+y.toughness || 0) - (+x.toughness || 0) : 0) || val(x) - val(y));
      if (cs.length < need) continue;
      res[a.uid] = cs.slice(0, need).map(b => b.uid); res[a.uid].forEach(u => used.add(u));
    }
    pass("safe"); pass("trade");
  });
  return res;
}
// Removal and other harm can hit the opponents' creatures: which of theirs fit, best target first
function ptOppTargets(tgt, opts = {}){
  if (!PT || !PT.opps) return [];
  const ph0 = String(tgt.phrase || "creature");
  if (/\byou control\b/.test(ph0) && !/\b(?:don't|an opponent|opponents?) control/.test(ph0)) return [];
  const ph = ph0.replace(/\b(?:an opponent controls|you don't control|your opponents control|defending player controls|that player controls|target opponent controls)\b/g, "").replace(/\s+/g, " ").trim() || "creature";
  if (/^(?:player|opponent|spell|card)/.test(ph) || /\b(?:land|artifact|enchantment|planeswalker|battle)\b/.test(ph) && !/\b(?:creature|permanent)\b/.test(ph)) return [];
  const aim = PT.opps.indexOf(ptOppT()), out = [];
  PT.opps.forEach((o, oi) => { if (o.out) return; for (const b of o.board) { let ok = false; try { ok = trFits(ph.replace(/\bnonland permanent\b|\bpermanent\b/, "creature"), Object.assign({colors: []}, b)); } catch (e) { ok = /creature|permanent/.test(ph); } if (ok) out.push({o, oi, b}); } });
  const kw = (b, k) => ptOkw(b, k) ? 1 : 0;
  const score = x => (x.oi === aim ? 100 : 0) + (+x.b.power || 0) * 2 + (+x.b.toughness || 0) + 3 * (kw(x.b, "flying") + kw(x.b, "deathtouch") + kw(x.b, "double strike")) + (x.b.img ? 2 : 0);
  const n = opts.dmg || 0, dies = x => n > 0 && (n >= (+x.b.toughness || 0) - (x.b.dmg || 0) || opts.dt) && !ptOkw(x.b, "indestructible");
  return out.sort((a, b) => (dies(b) - dies(a)) || score(b) - score(a));
}
// Do it to one of their creatures: destroy, exile, bounce, tap, damage, or −N/−N until end of turn
function ptHitOppCre(x, how, nm, n = 0, extra = {}){
  const {o, b} = x, gone = why => { o.board.splice(o.board.indexOf(b), 1); ptLog(`${nm}: ${o.name}'s ${b.name} ${why}.`); };
  if (how === "destroy") { if (ptOkw(b, "indestructible")) return ptLog(`${nm}: ${o.name}'s ${b.name} is indestructible.`); return gone("is destroyed"); }
  if (how === "exile") return gone("is exiled");
  if (how === "bounce") return gone("goes back to its owner's hand");
  if (how === "tuck" || how === "tucktop") return gone("goes into its owner's library");
  if (how === "tap") { b.tapped = true; return ptLog(`${nm}: ${o.name}'s ${b.name} is tapped.`); }
  if (how === "noblock") { b.noBlock = PT.turn; return ptLog(`${nm}: ${o.name}'s ${b.name} can't block this turn.`); }
  if (how === "damage") { b.dmg = (b.dmg || 0) + n; if (extra.dt) b.dt = true; ptLog(`${nm}: ${n} damage to ${o.name}'s ${b.name}.`); if (((b.dmg >= (+b.toughness || 0)) || b.dt) && !ptOkw(b, "indestructible")) gone("dies"); return; }
  if (how === "shrink") { b.eot = b.eot || {p: 0, t: 0}; b.eot.p += extra.p || 0; b.eot.t += extra.t || 0; b.power = String((+b.power || 0) + (extra.p || 0)); b.toughness = String((+b.toughness || 0) + (extra.t || 0)); ptLog(`${nm}: ${o.name}'s ${b.name} gets ${extra.p >= 0 ? "+" : ""}${extra.p}/${extra.t >= 0 ? "+" : ""}${extra.t} until end of turn.`); if ((+b.toughness || 0) <= 0 || ((b.dmg || 0) >= (+b.toughness || 0) && b.dmg > 0)) gone("dies"); }
}
function ptBlocksOrDamage(){
  const atks = (PT.combat || []).map(u => PT.bf.find(c => c.uid === u)).filter(Boolean);
  if (!atks.length) { PT.combat = null; return; }
  const can = atks.some(a => (PT.opps[ptAtkOpp(a)] || {board: []}).board.some(b => ptCanBlock(b, a)));
  if (!can) return ptDo(() => ptCombatDamage({}));
  PT_VIEW = {kind: "blocks", blocks: ptAutoBlocks(atks.map(c => ({c, opp: ptAtkOpp(c)})))};
  ptRenderBlocks();
}
// What would happen in one fight, for the blocks list
function ptFightText(a, bs){
  const o = PT.opps[ptAtkOpp(a)];
  if (!bs.length) return `Unblocked: <b>${ptCombatOf(a)}</b> damage to ${esc(o.name)}.`;
  if (ptHasKw(a, "menace") && bs.length < 2) return `Menace: one creature can't block it alone, so it's <b>unblocked</b>.`;
  const pw = ptPow(a), dt = ptHasKw(a, "deathtouch"), tg = ((ptStats(a) || [0, 1])[1]) - (a.dmg || 0);
  let left = pw; const dead = [];
  for (const b of bs) { const need = dt ? 1 : Math.max(0, (+b.toughness || 0) - (b.dmg || 0)); if (left >= need && need >= 0 && !ptOkw(b, "indestructible") && left > 0) dead.push(b.name); left -= need; }
  const back = bs.reduce((t, b) => t + (+b.power || 0), 0), backDt = bs.some(b => ptOkw(b, "deathtouch"));
  const fsWin = (ptHasKw(a, "first strike") || ptHasKw(a, "double strike")) && dead.length === bs.length && !bs.some(b => ptOkw(b, "first strike") || ptOkw(b, "double strike"));
  const aDies = !fsWin && back > 0 && (back >= tg || backDt) && !ptHasKw(a, "indestructible");
  const tr = ptHasKw(a, "trample") && left > 0 ? ` ${left} tramples over.` : "";
  return `${dead.length ? `${esc(dead.join(" and "))} ${dead.length > 1 ? "die" : "dies"}.` : "The blocker survives."} ${aDies ? `<b>${esc(ptFaceName(a))} dies.</b>` : `${esc(ptFaceName(a))} survives.`}${tr}`;
}
function ptRenderBlocks(){
  const v = PT_VIEW, atks = (PT.combat || []).map(u => PT.bf.find(c => c.uid === u)).filter(Boolean);
  ptModal("Blocks", `<p class="cur-sub">Your opponents blocked the way a careful player would. Click their creatures to change who blocks what, then deal the damage.</p>
    <div class="blk-list">${atks.map(a => { const o = PT.opps[ptAtkOpp(a)], mine = v.blocks[a.uid] || [], can = o.board.filter(b => ptCanBlock(b, a));
      return `<div class="blk-row"><div class="blk-atk">${a.faceDown || !a.img ? `<span class="pt-si-img noimg"></span>` : `<img class="pt-si-img" src="${esc(a.back ? a.img.replace("/front/", "/back/") : a.img)}" alt="" loading="lazy">`}<b>${esc(a.faceDown ? "Face-down creature" : ptFaceName(a))}</b> <span class="cur-sub">${esc(ptPT(a) || "")} → ${esc(o.name)}</span></div>
        <div class="blk-opts">${can.length ? can.map(b => `<button type="button" class="blk-b" data-blk="${a.uid}:${b.uid}" aria-pressed="${mine.includes(b.uid)}">${esc(b.name)} <b>${esc(b.power)}/${esc(b.toughness)}</b>${b.text ? ` <small>${esc(b.text.split("\n")[0].slice(0, 30))}</small>` : ""}</button>`).join("") : `<span class="cur-sub">Nothing ${esc(o.name)} has can block it.</span>`}</div>
        <small class="blk-out">${ptFightText(a, mine.map(u => o.board.find(b => b.uid === u)).filter(Boolean))}</small></div>`; }).join("")}</div>`,
    `<button class="btn ghost" type="button" data-blknone="1">No blocks</button><button class="btn primary" type="button" data-blkgo="1">Deal combat damage</button>`);
}
// Combat damage (rule 510): a first-strike step when anything has first or double strike, then the regular step
function ptCombatDamage(blocks){
  blocks = blocks || {};
  const att = (PT.combat || []).map(u => PT.bf.find(c => c.uid === u)).filter(Boolean); PT.combat = null;
  const oppOf = a => PT.opps[ptAtkOpp(a)];
  const blockedBy = a => { const bl = (blocks[a.uid] || []).map(u => oppOf(a).board.find(b => b.uid === u)).filter(Boolean); return ptHasKw(a, "menace") && bl.length < 2 ? [] : bl; };
  const isBlocked = new Set(att.filter(a => blockedBy(a).length).map(a => a.uid));
  const fsA = a => ptHasKw(a, "first strike") || ptHasKw(a, "double strike"), fsB = b => ptOkw(b, "first strike") || ptOkw(b, "double strike");
  const dsA = a => ptHasKw(a, "double strike"), dsB = b => ptOkw(b, "double strike");
  const anyFirst = att.some(fsA) || att.some(a => blockedBy(a).some(fsB));
  const m = ptMods(), toPlayer = [], dead = new Set();
  let link = 0;
  for (const step of anyFirst ? [1, 2] : [2]) {
    const hitsA = a => step === 1 ? fsA(a) : (!fsA(a) || dsA(a)), hitsB = b => step === 1 ? fsB(b) : (!fsB(b) || dsB(b));
    for (const a of att) {
      if (!PT.bf.includes(a)) continue;
      const bs = blockedBy(a).filter(b => !dead.has(b.uid)), o = oppOf(a);
      if (hitsA(a)) {
        let p = Math.max(0, ptPow(a) || (a.faceDown ? 2 : 0));
        if (isBlocked.has(a.uid)) {
          for (let k = 0; k < bs.length && p > 0; k++) {
            const b = bs[k], need = ptHasKw(a, "deathtouch") ? 1 : Math.max(0, (+b.toughness || 0) - (b.dmg || 0));
            const give = k === bs.length - 1 && !ptHasKw(a, "trample") ? p : Math.min(p, need);
            if (give > 0) { b.dmg = (b.dmg || 0) + give; if (ptHasKw(a, "deathtouch")) b.dt = true; if (ptHasKw(a, "lifelink")) link += give; p -= give; }
          }
          if (p > 0 && ptHasKw(a, "trample")) toPlayer.push({a, o, n: (p + ((a.colors || []).includes("R") ? m.torbran : 0)) * m.dmgX});
        } else if (p > 0) toPlayer.push({a, o, n: (p + ((a.colors || []).includes("R") ? m.torbran : 0)) * m.dmgX});
      }
      for (const b of bs) if (hitsB(b) && (+b.power || 0) > 0) { a.dmg = (a.dmg || 0) + (+b.power || 0); if (ptOkw(b, "deathtouch")) a.dt = true; }
    }
    // after each step: their creatures with lethal damage die, and so do yours (state-based actions)
    for (const o of PT.opps) for (const b of o.board.slice()) if ((b.dmg || 0) > 0 && ((b.dmg || 0) >= (+b.toughness || 0) || b.dt) && !ptOkw(b, "indestructible")) { o.board.splice(o.board.indexOf(b), 1); dead.add(b.uid); ptLog(`${o.name}'s ${b.name} dies.`); }
    for (let i = 0; i < 20 && ptSBA(); i++);
  }
  // damage to players, in attack order
  const byOpp = new Map();
  toPlayer.forEach(({a, o, n}, i) => {
    if (o.out) return;
    const r = byOpp.get(o) || {dmg: 0, poison: 0}; byOpp.set(o, r);
    if (ptHasKw(a, "infect")) r.poison += n; else r.dmg += n;
    const tox = ptKws(a).get("toxic"); if (tox && n > 0) r.poison += parseInt(tox.val) || 1;
    if (ptHasKw(a, "lifelink")) link += n;
    if (a.commander && !ptHasKw(a, "infect")) { o.cmd[a.uid] = (o.cmd[a.uid] || 0) + n; if (o.cmd[a.uid] >= 21) toast(`${a.name} has dealt ${o.cmd[a.uid]} commander damage to ${o.name}: that's lethal.`); }
    if (n > 0) ptEmit("combatdmg", a, {amount: n, first: i === 0, opp: PT.opps.indexOf(o)});
  });
  for (const [o, r] of byOpp) { if (r.dmg) ptHitOpp(r.dmg, "combat", PT.opps.indexOf(o)); if (r.poison) ptPoisonOpp(r.poison, PT.opps.indexOf(o)); }
  if (!toPlayer.length && att.length) ptLog("No combat damage reached a player.");
  if (link) ptGain(link, "lifelink");
  for (const u of PT.endCombat || []) if (ptFind(u) && ptFind(u).zone === "bf") ptSacrifice(u);
  PT.endCombat = [];
  ptOppsCheck();
}
// The opponents strip under the top bar
function ptOppsHtml(){
  ptOppsFix();
  const t = PT.opps.indexOf(ptOppT());
  return PT.opps.map((o, i) => `<div class="pt-opp${i === t && !o.out ? " aimed" : ""}${o.out ? " out" : ""}" data-opp="${i}">
    <div class="po-head">
      <button type="button" class="po-name" data-oppt="${i}" title="${o.out ? "Out of the game" : i === t ? "You're aiming at this opponent: target opponent and any target effects hit them" : "Click to aim at this opponent"}">${i === t && !o.out ? "🎯 " : ""}${esc(o.name)}</button>
      <span class="po-life"><button type="button" data-olife="${i}" data-d="-1" aria-label="${esc(o.name)} life down">−</button><b title="Life">${o.life}</b><button type="button" data-olife="${i}" data-d="1" aria-label="${esc(o.name)} life up">+</button></span>
      ${o.poison ? `<span class="po-tag" title="Poison counters (10 and they're out)">☠ ${o.poison}</span>` : ""}
      ${Object.entries(o.cmd || {}).filter(([, v]) => v > 0).map(([u, v]) => `<span class="po-tag" title="Commander damage from ${esc(((ptFind(+u) || {}).card || {}).name || "your commander")} (21 and they're out)">★ ${v}</span>`).join("")}
      ${o.out ? `<span class="po-tag out">Out</span>` : ""}
      <button type="button" class="po-more" data-oppmenu="${i}" title="Name, board, poison" aria-label="${esc(o.name)} options">⋯</button>
    </div>
    <div class="po-board">${o.board.map(b => `<span class="po-cre${b.dmg ? " hurt" : ""}" title="${esc(b.name + (b.text ? ": " + b.text : ""))}">${esc(b.name)} <b>${esc(b.power)}/${esc(b.toughness)}</b>${b.text ? `<small>${esc(b.text.split("\n")[0].slice(0, 24))}</small>` : ""}<button type="button" data-oppkill="${i}:${b.uid}" title="Remove it (destroyed, exiled…)" aria-label="Remove ${esc(b.name)}">×</button></span>`).join("")}
      ${o.out ? "" : `<button type="button" class="po-add" data-oppadd="${i}" title="Give this opponent a creature that can block">+ Creature</button>`}${!o.board.length && o.mode && o.mode !== "hand" && !o.out ? `<small class="po-mode">${o.mode === "typical" ? "grows each turn" : "plays from a deck"}</small>` : ""}</div>
  </div>`).join("");
}
function ptOppMenu(i, x, y){
  const o = PT.opps[i], ds = (typeof decks !== "undefined" ? decks : []).filter(d => d.cards.some(c => /\bCreature\b/.test(c.type || "")));
  ptMenuFor = {opp: i};
  ptMenu(x, y, `<div class="ptm-title">${esc(o.name)}</div>
    <button type="button" data-om="rename">Rename</button>
    <button type="button" data-om="poison">Give a poison counter</button>
    ${o.out ? `<button type="button" data-om="back">Bring back into the game</button>` : `<button type="button" data-om="outnow">Out of the game (concede)</button>`}
    <div class="ptm-title">Their creatures</div>
    <button type="button" data-om="mode" data-mode="hand" aria-pressed="${!o.mode || o.mode === "hand"}">${!o.mode || o.mode === "hand" ? "✓ " : ""}Only what I add</button>
    <button type="button" data-om="mode" data-mode="typical" aria-pressed="${o.mode === "typical"}">${o.mode === "typical" ? "✓ " : ""}Grow like a typical deck</button>
    ${ds.map(d => `<button type="button" data-om="mode" data-mode="${esc(d.id)}" aria-pressed="${o.mode === d.id}">${o.mode === d.id ? "✓ " : ""}Play creatures from ${esc(d.name)}</button>`).join("")}
    ${o.board.length ? `<button type="button" data-om="wipe">Remove all their creatures</button>` : ""}`);
}
function ptOppAdd(i){
  const o = PT.opps[i];
  PT_VIEW = {kind: "oppadd", i};
  ptModal(`A creature for ${esc(o.name)}`, `<p class="cur-sub">Their creatures can block your attackers. Add as many as you like.</p>
    <h4>Quick</h4><div class="po-quick">${PT_OPP_QUICK.map((q, k) => `<button type="button" class="btn" data-oppq="${k}">${esc(q.name)} ${q.power}/${q.toughness}${q.text ? ` <small>${esc(q.text)}</small>` : ""}</button>`).join("")}</div>
    <h4>Your own</h4><form class="po-custom" id="ptOppCustom">
      <label class="inline-field">Name <input id="pocN" value="Creature" maxlength="40"></label>
      <label class="inline-field">Power <input type="number" id="pocP" value="2" min="0" max="99"></label>
      <label class="inline-field">Toughness <input type="number" id="pocT" value="2" min="0" max="99"></label>
      <div class="po-kws">${PT_OPP_KWS.map(k => `<label class="chk"><input type="checkbox" value="${k}"> ${k}</label>`).join("")}</div>
      <button class="btn primary" type="submit">Add it</button></form>
    <h4>A real card</h4><form class="ptd-search" id="ptOppFind"><input type="search" id="pofQ" placeholder="Creature name, e.g. Baleful Strix" aria-label="Creature name"><button class="btn" type="submit">Find</button></form>
    <div class="ptd-toks" id="pofRes"></div>`, `<button class="btn primary" type="button" data-d="close">Done</button>`);
}
let ptOppFound = [];
async function ptOppSearch(q){
  const box = $("pofRes"); box.innerHTML = `<div class="cur-sub">Searching…</div>`;
  try {
    const j = await sf(`/cards/search?unique=cards&order=edhrec&q=${encodeURIComponent(`t:creature (${q})`)}`);
    ptOppFound = (j.data || []).slice(0, 24).map(slimCard);
    box.innerHTML = ptOppFound.length ? ptOppFound.map((t, k) => `<button type="button" class="ptd-tok" data-oppf="${k}" title="${esc(t.name)}">${ptFace(ptMakeCard(t))}<small>${esc(t.name)} ${esc(t.power || "")}/${esc(t.toughness || "")}</small></button>`).join("") : `<div class="cur-sub">No creatures found.</div>`;
  } catch (e) { box.innerHTML = `<div class="cur-sub">Couldn't reach Scryfall.</div>`; }
}
function ptOppGive(i, def){ ptDo(() => { const o = PT.opps[i], cr = ptOppCre(def); o.board.push(cr); ptLog(`${o.name} has ${cr.name} (${cr.power}/${cr.toughness}).`); }); toast(`${PT.opps[i].name}: ${def.name} added.`); }
// clicks in the opponents strip, its menu and the blocks list
function ptOppClick(e){
  let el;
  if ((el = e.target.closest("[data-oppt]"))) { const i = +el.dataset.oppt; if (PT.opps[i].out) return true; PT.oppT = i; ptOppSync(); ptRender(); if (PT_VIEW && PT_VIEW.kind === "attack") ptRenderAttack(); return true; }
  if ((el = e.target.closest("[data-olife]"))) { const i = +el.dataset.olife, d = +el.dataset.d * (e.shiftKey ? 5 : 1); ptDo(() => { const o = PT.opps[i]; o.life = Math.max(0, o.life + d); if (d < 0 && !o.out) { PT.oppLostTurn = PT.turn; } ptLog(`${o.name}'s life ${d > 0 ? "+" : "−"}${Math.abs(d)} → ${o.life}.`); ptOppsCheck(); }); return true; }
  if ((el = e.target.closest("[data-oppadd]"))) { ptOppAdd(+el.dataset.oppadd); return true; }
  if ((el = e.target.closest("[data-oppkill]"))) { const [i, u] = el.dataset.oppkill.split(":").map(Number); ptDo(() => { const o = PT.opps[i], k = o.board.findIndex(b => b.uid === u); if (k >= 0) { ptLog(`${o.name}'s ${o.board[k].name} is gone.`); o.board.splice(k, 1); } }); return true; }
  if ((el = e.target.closest("[data-oppmenu]"))) { const r = el.getBoundingClientRect(); ptOppMenu(+el.dataset.oppmenu, Math.min(r.left, innerWidth - 250), r.bottom + 4); return true; }
  if ((el = e.target.closest("[data-om]")) && ptMenuFor && ptMenuFor.opp != null) {
    const i = ptMenuFor.opp, o = PT.opps[i], k = el.dataset.om; ptCloseMenu();
    if (k === "rename") { const n = prompt("Name for this opponent", o.name); if (n && n.trim()) ptDo(() => { o.name = n.trim().slice(0, 30); }); }
    else if (k === "poison") ptDo(() => ptPoisonOpp(1, i));
    else if (k === "outnow") ptDo(() => { o.out = PT.turn || 1; ptLog(`${o.name} is out of the game.`); ptOppsCheck(); });
    else if (k === "back") ptDo(() => { o.out = 0; if (o.life <= 0) o.life = 1; if (PT.won && ptLiveOpps().length) PT.won = 0; ptLog(`${o.name} is back in the game.`); ptOppSync(); });
    else if (k === "mode") { o.mode = el.dataset.mode; prefs.ptOppMode = o.mode === "typical" || o.mode === "hand" ? o.mode : prefs.ptOppMode; savePrefs(); ptRender(); toast(o.mode === "hand" ? `${o.name} only has the creatures you add.` : `${o.name}'s board now grows each turn.`); }
    else if (k === "wipe") ptDo(() => { o.board = []; ptLog(`${o.name}'s creatures are gone.`); });
    return true;
  }
  if ((el = e.target.closest("[data-oppq]")) && PT_VIEW && PT_VIEW.kind === "oppadd") { ptOppGive(PT_VIEW.i, PT_OPP_QUICK[+el.dataset.oppq]); return true; }
  if ((el = e.target.closest("[data-oppf]")) && PT_VIEW && PT_VIEW.kind === "oppadd") { const t = ptOppFound[+el.dataset.oppf]; ptOppGive(PT_VIEW.i, Object.assign({}, t, {img: bigImg(t)})); return true; }
  if ((el = e.target.closest("[data-blk]")) && PT_VIEW && PT_VIEW.kind === "blocks") {
    const [a, b] = el.dataset.blk.split(":").map(Number), bl = PT_VIEW.blocks;
    const had = (bl[a] || []).includes(b);
    for (const k of Object.keys(bl)) bl[k] = bl[k].filter(u => u !== b);
    if (!had) bl[a] = (bl[a] || []).concat(b);
    ptRenderBlocks(); return true;
  }
  if (e.target.closest("[data-blknone]") && PT_VIEW && PT_VIEW.kind === "blocks") { PT_VIEW.blocks = {}; ptRenderBlocks(); return true; }
  if (e.target.closest("[data-blkgo]") && PT_VIEW && PT_VIEW.kind === "blocks") { const bl = PT_VIEW.blocks; PT_VIEW.done = true; ptCloseModal(); ptDo(() => ptCombatDamage(bl)); return true; }
  if ((el = e.target.closest("[data-atkto]")) && PT_VIEW && PT_VIEW.kind === "attack") {
    const us = el.dataset.atkto.split(",").map(Number), live = PT.opps.map((o, i) => i).filter(i => !PT.opps[i].out);
    const cur = PT_VIEW.to[us[0]] ?? PT.oppT, nx = live[(live.indexOf(cur) + 1) % live.length];
    us.forEach(u => { PT_VIEW.to[u] = nx; }); ptRenderAttack(); return true;
  }
  if ((el = e.target.closest("[data-atktoall]")) && PT_VIEW && PT_VIEW.kind === "attack") { const i = +el.dataset.atktoall; Object.keys(PT_VIEW.to).forEach(u => { PT_VIEW.to[u] = i; }); ptRenderAttack(); return true; }
  return false;
}
function ptOppSubmit(e){
  if (e.target.id === "ptOppCustom" && PT_VIEW && PT_VIEW.kind === "oppadd") {
    const kws = [...e.target.querySelectorAll(".po-kws input:checked")].map(x => x.value);
    ptOppGive(PT_VIEW.i, {name: ($("pocN").value || "Creature").trim().slice(0, 40), power: Math.max(0, parseInt($("pocP").value) || 0), toughness: Math.max(0, parseInt($("pocT").value) || 0), text: kws.join(", ")});
    return true;
  }
  if (e.target.id === "ptOppFind") { const q = $("pofQ").value.trim(); if (q) ptOppSearch(q); return true; }
  return false;
}
// the number of opponents (⋯ → Settings): more are added, extra ones at the end are removed
function ptSetOppN(n){
  prefs.ptOppN = n; savePrefs(); if (!PT) return;
  ptDo(() => {
    ptOppsFix();
    while (PT.opps.length < n) PT.opps.push(ptOppMake(PT.opps.length, n, PT.isCmd));
    if (PT.opps.length > n) PT.opps.length = n;
    PT.opps.forEach((o, i) => { if (/^Opponent( \d+)?$/.test(o.name)) o.name = n > 1 ? `Opponent ${i + 1}` : "Opponent"; });
    if (PT.oppT >= n) PT.oppT = 0; ptOppSync();
  });
}
function ptEndTurn(){ if (PT.phase !== "play") return; if (PT.endDone === PT.turn) return toast("Already at the end step. Press Next turn."); PT.endDone = PT.turn; ptEmptyPool(); ptLog(`End of turn ${PT.turn}.`); ptEmit("endstep"); ptEndStepRules(); ptRunDelayed(); }

