/* ================= Game tracker: life, commander damage, poison, monarch, dice, turns, results ================= */
let game = store.get("bsw-game", null);
let games = store.get("bsw-games", []);
const saveGame = () => store.set("bsw-game", game);
let gameSetup = Object.assign({n: 4, life: 40, names: ["You", "Player 2", "Player 3", "Player 4", "Player 5", "Player 6"], decks: ["", "", "", "", "", ""]}, store.get("bsw-gsetup", {}));
let gameTick = null, gameRoll = "", gameAskWin = false;
function gameOut(p, i){ return p.life <= 0 || p.poison >= 10 || Object.values(p.cmd || {}).some(v => v >= 21) || p.conceded; }
function renderGame(){
  const box = $("gameView"); if (!box) return;
  clearInterval(gameTick); gameTick = null;
  if (!game) {
    const S = gameSetup;
    box.innerHTML = `<div class="sim-head"><h3>New game</h3><span class="cur-sub">Life, commander damage, poison, monarch and turns for everyone at the table.</span></div>
      <div class="gm-setup">
        <label class="field">Players <select id="gsN">${[2, 3, 4, 5, 6].map(n => `<option ${S.n === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="field">Starting life <select id="gsLife">${[40, 30, 25, 20].map(n => `<option ${S.life === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      <div class="gm-names">${Array.from({length: S.n}, (_, i) => `<div class="gm-name"><label class="field">Player ${i + 1} <input type="text" data-gsname="${i}" value="${esc(S.names[i] || "Player " + (i + 1))}" maxlength="24"></label>
        <label class="field">Deck <select data-gsdeck="${i}"><option value="">${i === 0 ? "Pick your deck (for stats)" : "Not tracked"}</option>${decks.map(d => `<option value="${esc(d.id)}" ${S.decks[i] === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label></div>`).join("")}</div>
      <button class="btn primary" type="button" id="gmStart">Start game</button>
      ${gameStatsHtml()}`;
    return;
  }
  const G = game, alive = G.players.map((p, i) => !gameOut(p, i));
  const secs = Math.floor((Date.now() - G.turnStart) / 1000), tot = Math.floor((Date.now() - G.startedAt) / 1000);
  const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  box.innerHTML = `<div class="gm-top">
      <div><b>Turn ${G.round}</b> · <span class="gm-active">${esc(G.players[G.active].name)}'s turn</span> · <span class="cur-sub" id="gmClock">${mmss(secs)} this turn · ${mmss(tot)} total</span></div>
      <div class="gm-tools">
        <button class="btn primary" type="button" data-gm="next">Next turn ›</button>
        <button class="btn" type="button" data-gm="d6">d6</button><button class="btn" type="button" data-gm="d20">d20</button><button class="btn" type="button" data-gm="coin">Coin</button><button class="btn" type="button" data-gm="who">Random player</button>
        <button class="btn" type="button" data-gm="end">End game</button>
      </div>
      ${gameRoll ? `<div class="gm-roll" role="status">${esc(gameRoll)}</div>` : ""}
    </div>
    ${gameAskWin ? `<div class="gm-win"><b>Who won?</b> ${G.players.map((p, i) => `<button class="btn ${alive[i] ? "primary" : ""}" type="button" data-gmwin="${i}">${esc(p.name)}</button>`).join("")} <button class="btn ghost" type="button" data-gmwin="-1">Nobody (draw)</button> <button class="btn ghost" type="button" data-gm="nowin">Keep playing</button></div>` : ""}
    <div class="gm-grid">${G.players.map((p, i) => `<div class="gm-p ${i === G.active ? "active" : ""} ${alive[i] ? "" : "out"}" style="--pc:var(--pip-${"wubrgc"[i % 6]})">
      <div class="gm-ph"><b>${esc(p.name)}</b>${p.deckName ? `<span class="cur-sub">${esc(p.deckName)}</span>` : ""}
        <span class="gm-tags">${G.monarch === i ? `<span class="gm-tag" title="Monarch">♛ Monarch</span>` : ""}${G.initiative === i ? `<span class="gm-tag" title="Initiative">⚑ Initiative</span>` : ""}${alive[i] ? "" : `<span class="gm-tag out">Out</span>`}</span></div>
      <div class="gm-life"><button type="button" data-gl="${i}" data-d="-5">−5</button><button type="button" data-gl="${i}" data-d="-1">−</button>
        <span class="gm-num">${p.life}${p.delta ? `<i class="gm-delta ${p.delta > 0 ? "up" : "down"}">${p.delta > 0 ? "+" : ""}${p.delta}</i>` : ""}</span>
        <button type="button" data-gl="${i}" data-d="1">+</button><button type="button" data-gl="${i}" data-d="5">+5</button></div>
      <div class="gm-row"><span>Poison</span><span class="step"><button type="button" data-gp="${i}" data-d="-1">−</button><span class="${p.poison >= 7 ? "warn" : ""}">${p.poison}</span><button type="button" data-gp="${i}" data-d="1">+</button></span></div>
      ${G.players.length > 1 ? `<div class="gm-cmd"><span class="cur-sub">Commander damage taken</span>${G.players.map((q, j) => j === i ? "" : `<div class="gm-row"><span>from ${esc(q.name)}</span><span class="step"><button type="button" data-gc="${i}" data-from="${j}" data-d="-1">−</button><span class="${(p.cmd[j] || 0) >= 15 ? "warn" : ""}">${p.cmd[j] || 0}</span><button type="button" data-gc="${i}" data-from="${j}" data-d="1">+</button></span></div>`).join("")}</div>` : ""}
      <div class="gm-btns"><button class="linkish" type="button" data-gmon="${i}">${G.monarch === i ? "Not monarch" : "Monarch"}</button><button class="linkish" type="button" data-ginit="${i}">${G.initiative === i ? "No initiative" : "Initiative"}</button><button class="linkish" type="button" data-gact="${i}">Make active</button></div>
    </div>`).join("")}</div>
    <p class="cur-sub">Commander damage also comes off that player's life. A player is out at 0 life, 10 poison or 21 damage from one commander. The game is saved, so closing the page doesn't lose it.</p>`;
  gameTick = setInterval(() => { const el = $("gmClock"); if (!el || !game || prefs.page !== "game") { clearInterval(gameTick); return; } const s2 = Math.floor((Date.now() - game.turnStart) / 1000), t2 = Math.floor((Date.now() - game.startedAt) / 1000); el.textContent = `${mmss(s2)} this turn · ${mmss(t2)} total`; }, 1000);
}
function gameStatsHtml(){
  if (!games.length) return `<h4 class="fw-h">Results</h4><p class="cur-sub">Finished games show up here, with win rates for each of your decks.</p>`;
  const by = {};
  for (const g of games) for (const p of g.players) if (p.deckId) { const s = by[p.deckId] = by[p.deckId] || {name: p.deckName, n: 0, w: 0, turns: []}; s.n++; if (g.winner === g.players.indexOf(p)) { s.w++; s.turns.push(g.turns); } }
  const rows = Object.entries(by).map(([id, s]) => `<tr><td>${esc((deckById(id) || {}).name || s.name || "Deleted deck")}</td><td>${s.n}</td><td>${s.w}</td><td>${Math.round(100 * s.w / s.n)}%</td><td>${s.turns.length ? (s.turns.reduce((a, b) => a + b, 0) / s.turns.length).toFixed(1) : "—"}</td></tr>`).join("");
  return `<h4 class="fw-h">Your decks in real games</h4>${rows ? `<table class="dc-table"><thead><tr><th>Deck</th><th>Games</th><th>Wins</th><th>Win rate</th><th>Avg. winning turn</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="cur-sub">Pick a deck for a player when you start a game to track it here.</p>`}
    <h4 class="fw-h">Recent games</h4><ul class="dc-list">${games.slice(0, 15).map((g, k) => `<li>${new Date(g.date).toLocaleDateString()} · ${g.players.length} players · ${g.turns} turn${g.turns === 1 ? "" : "s"} · ${g.winner >= 0 ? `<b>${esc(g.players[g.winner].name)}</b> won${g.players[g.winner].deckName ? ` with ${esc(g.players[g.winner].deckName)}` : ""}` : "draw"} <button class="linkbtn" type="button" data-grm="${k}">remove</button></li>`).join("")}</ul>`;
}
function gameDelta(p, d){ p.life += d; p.delta = (p.delta || 0) + d; clearTimeout(p._t); const ref = p; p._t = setTimeout(() => { ref.delta = 0; if (prefs.page === "game") renderGame(); }, 1500); }
$("gameView").addEventListener("change", e => {
  if (e.target.id === "gsN") { gameSetup.n = +e.target.value; store.set("bsw-gsetup", gameSetup); return renderGame(); }
  if (e.target.id === "gsLife") { gameSetup.life = +e.target.value; store.set("bsw-gsetup", gameSetup); }
  if (e.target.dataset.gsname != null) { gameSetup.names[+e.target.dataset.gsname] = e.target.value; store.set("bsw-gsetup", gameSetup); }
  if (e.target.dataset.gsdeck != null) { gameSetup.decks[+e.target.dataset.gsdeck] = e.target.value; store.set("bsw-gsetup", gameSetup); }
});
$("gameView").addEventListener("click", e => {
  const t = e.target;
  if (t.closest("#gmStart")) {
    const S = gameSetup;
    game = {players: Array.from({length: S.n}, (_, i) => ({name: S.names[i] || "Player " + (i + 1), life: S.life, poison: 0, cmd: {}, deckId: S.decks[i] || "", deckName: S.decks[i] && deckById(S.decks[i]) ? deckById(S.decks[i]).name : ""})), active: 0, round: 1, monarch: null, initiative: null, startedAt: Date.now(), turnStart: Date.now()};
    gameRoll = ""; saveGame(); return renderGame();
  }
  const rmg = t.closest("[data-grm]"); if (rmg) { games.splice(+rmg.dataset.grm, 1); store.set("bsw-games", games); return renderGame(); }
  if (!game) return;
  const G = game;
  const b = t.closest("[data-gl]"); if (b) { gameDelta(G.players[+b.dataset.gl], +b.dataset.d); saveGame(); return renderGame(); }
  const p = t.closest("[data-gp]"); if (p) { const pl = G.players[+p.dataset.gp]; pl.poison = Math.max(0, pl.poison + +p.dataset.d); saveGame(); return renderGame(); }
  const c = t.closest("[data-gc]"); if (c) { const pl = G.players[+c.dataset.gc], j = +c.dataset.from, d = +c.dataset.d; const nv = Math.max(0, (pl.cmd[j] || 0) + d); if (nv !== (pl.cmd[j] || 0)) { gameDelta(pl, -(nv - (pl.cmd[j] || 0))); pl.cmd[j] = nv; } saveGame(); return renderGame(); }
  const mo = t.closest("[data-gmon]"); if (mo) { const i = +mo.dataset.gmon; G.monarch = G.monarch === i ? null : i; saveGame(); return renderGame(); }
  const ini = t.closest("[data-ginit]"); if (ini) { const i = +ini.dataset.ginit; G.initiative = G.initiative === i ? null : i; saveGame(); return renderGame(); }
  const ac = t.closest("[data-gact]"); if (ac) { G.active = +ac.dataset.gact; G.turnStart = Date.now(); saveGame(); return renderGame(); }
  const w = t.closest("[data-gmwin]"); if (w) {
    const win = +w.dataset.gmwin;
    games.unshift({date: Date.now(), players: G.players.map(q => ({name: q.name, deckId: q.deckId, deckName: q.deckName})), winner: win, turns: G.round, mins: Math.round((Date.now() - G.startedAt) / 60000)});
    store.set("bsw-games", games); game = null; gameAskWin = false; saveGame(); toast(win >= 0 ? `${games[0].players[win].name === "You" ? "You win" : games[0].players[win].name + " wins"}. Saved to Results.` : "Saved as a draw."); return renderGame();
  }
  const a = t.closest("[data-gm]"); if (!a) return;
  const k = a.dataset.gm;
  if (k === "next") { const n = G.players.length; let i = G.active; for (let s = 0; s < n; s++) { i = (i + 1) % n; if (i === 0) G.round++; if (!gameOut(G.players[i], i)) break; } G.active = i; G.turnStart = Date.now(); if (G.players.filter((q, j) => !gameOut(q, j)).length <= 1) gameAskWin = true; }
  if (k === "d6") gameRoll = `d6: ${1 + Math.floor(Math.random() * 6)}`;
  if (k === "d20") gameRoll = `d20: ${1 + Math.floor(Math.random() * 20)}`;
  if (k === "coin") gameRoll = `Coin: ${Math.random() < 0.5 ? "Heads" : "Tails"}`;
  if (k === "who") gameRoll = `Random player: ${G.players[Math.floor(Math.random() * G.players.length)].name}`;
  if (k === "end") gameAskWin = true;
  if (k === "nowin") gameAskWin = false;
  saveGame(); renderGame();
});

(function splitPages(){
  // collection: its own page, full width
  $("collPage").append($("collView")); $("collView").classList.remove("hide");
  $("tabColl").hidden = true; $("tabSess").setAttribute("aria-selected", "true");
  const ct = document.createElement("nav"); ct.className = "deck-tabs coll-tabs"; ct.id = "collTabs"; ct.setAttribute("role", "tablist");
  ct.innerHTML = '<button type="button" role="tab" data-ctab="cards">My cards</button><button type="button" role="tab" data-ctab="wish" id="collTabWish">Wishlist</button>';
  $("collPage").prepend(ct);
  ct.addEventListener("click", e => { const b = e.target.closest("[data-ctab]"); if (!b) return; prefs.collTab = b.dataset.ctab; savePrefs(); applyCollTab(); });
  // deck page: Cards | Deck check | Test & fastest win | Combos | Export
  const panes = [["cards", "Cards", ["deckViewBar", "deckCards"]], ["check", "Deck check", ["deckCheck"]], ["test", "Test & fastest win", ["deckSim", "deckFast"]], ["combos", "Combos", ["deckCombos"]], ["export", "Export", ["deckExport"]]];
  const bar = document.createElement("nav"); bar.className = "deck-tabs"; bar.id = "deckTabs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Deck sections");
  bar.innerHTML = panes.map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}">${l}</button>`).join("");
  const after = $("deckBody"); after.after(bar);
  let at = bar;
  for (const [k, , ids] of panes) { const p = document.createElement("div"); p.className = "deck-pane"; p.dataset.pane = k; for (const id of ids) p.append($(id)); at.after(p); at = p; }
  bar.addEventListener("click", e => { const b = e.target.closest("[data-dtab]"); if (!b) return; prefs.deckTab = b.dataset.dtab; savePrefs(); applyDeckTab(); });
})();
function applyCollTab(){
  const w = prefs.collTab === "wish";
  for (const b of $("collTabs").querySelectorAll("[data-ctab]")) b.setAttribute("aria-selected", (b.dataset.ctab === "wish") === w);
  $("collView").hidden = w; $("expBar").hidden = w && $("expBar").parentNode === $("collPage"); $("wishView").hidden = !w;
  if (w) renderWish();
}
function applyDeckTab(){
  const d = prefs.deckView && deckById(prefs.deckView), has = !!(d && (d.cards.length + d.commanders.length));
  const tab = prefs.deckTab || "cards";
  $("deckTabs").hidden = !has;
  for (const b of $("deckTabs").querySelectorAll("[data-dtab]")) b.setAttribute("aria-selected", b.dataset.dtab === tab);
  for (const p of document.querySelectorAll(".deck-pane")) p.hidden = !has ? p.dataset.pane !== "cards" : p.dataset.pane !== tab;
}
renderWish();
if (wish.length && Date.now() - (prefs.wishChecked || 0) > 20 * 3600e3) setTimeout(() => checkWish(true), 4000);
setTimeout(() => aiInit(), 1200);
{ const v = document.getElementById("appVersion"); if (v) v.textContent = "Version " + APP_VERSION + "."; }
renderLists(); syncCurUI(); showPage(PAGES[prefs.page] && prefs.page !== "scanner" ? prefs.page : prefs.view === "collection" ? "collection" : "scanner"); renderAll(); syncAiUI();
(async () => {
  try {
    setStatus("Loading the card list and text reader (first time takes a few seconds)…", "", true);
    if (typeof Tesseract === "undefined") throw new Error("ocr-load");
    const [names] = await Promise.all([loadCatalog(), initOCR()]);
    buildIndex(names);
    ready = true;
    initPaddle();   // the improved reader loads in the background; scans work right away with Tesseract
    $("scanNow").disabled = !stream; syncAiUI();
    setStatus(stream ? "Hold a card inside the frame, name at the top." : `Ready. ${names.length.toLocaleString()} card names loaded. Turn on the webcam to start.`, "ok");
    tick();
    if (lockList().length) prepareLocks();
    recordValue();
    if ((coll.size || decks.length) && Date.now() - (prefs.lastRefresh || 0) > DAY) refreshPrices(true);   // keep prices fresh once a day
    cvLoad.then(ok => { if (!busy && stream) setStatus(ok ? "Card finder ready. Hold a card up anywhere in view." : "Couldn't load the card finder, so keep cards inside the frame.", ok ? "ok" : ""); });
  } catch (e) {
    console.error(e);
    setStatus(String(e && e.message) === "ocr-load" ? "Couldn't load the text reader. This page needs an internet connection." : "Couldn't load the card list from Scryfall. Check your internet connection and reload.", "err");
  }
})();
