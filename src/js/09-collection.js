/* ---------------- collection ---------------- */
// One row per printing + finish + condition + list, so the same card can sit in several binders and conditions.
const num = v => v == null || v === "" ? null : Number(v);
const stamp = () => new Date().toISOString().slice(0, 10);
const keyOf = e => `${e.sid}|${e.foil ? "f" : "n"}|${e.cond || "NM"}|${e.list || "Collection"}`;
function unitVal(e, cur){
  cur = cur || prefs.cur;
  const v = cur === "eur" ? (e.foil ? (e.eurF ?? e.eur) : (e.eur ?? e.eurF)) : (e.foil ? (e.usdF ?? e.usd) : (e.usd ?? e.usdF));
  return Number(v) || 0;
}
const prevVal = (e, cur) => { const v = (cur || prefs.cur) === "eur" ? e.prevEur : e.prevUsd; return v == null ? null : v; };
(function loadColl(){
  for (const [, e] of store.get("bsw-coll", [])) {
    const n = Object.assign({cond: "NM", list: "Collection"}, e);
    if (n.usd === undefined && n.price != null) { if (n.foil) n.usdF = n.price; else n.usd = n.price; }
    delete n.price;
    const k = keyOf(n), ex = coll.get(k);
    coll.set(k, ex ? Object.assign(ex, {qty: ex.qty + n.qty}) : n);
  }
  if (!prefs.lists.includes("Collection")) prefs.lists.unshift("Collection");
  for (const e of coll.values()) if (!prefs.lists.includes(e.list)) prefs.lists.push(e.list);
  if (!prefs.lists.includes(prefs.list)) prefs.list = "Collection";
})();
let session = Object.assign({started: Date.now(), items: []}, store.get("bsw-sess", {}));
const saveSess = () => store.set("bsw-sess", session);
const hist = store.get("bsw-hist", []);

function entryFrom(p, foil, cond, list, qty){
  const now = Date.now();
  return {sid: p.id, name: p.name, set: p.set, setName: p.setName, number: p.number, rarity: p.rarity, lang: p.lang, foil, cond, list, qty,
    usd: num(p.usd), usdF: num(p.usdFoil), eur: num(p.eur), eurF: num(p.eurFoil), img: p.img, type: p.type || "", colors: p.colors || [], finishes: p.finishes, addedAt: now, updatedAt: now};
}
function putEntry(n){ const k = keyOf(n), ex = coll.get(k); coll.set(k, ex ? Object.assign({}, ex, {qty: ex.qty + n.qty, updatedAt: Date.now()}) : n); return k; }
function takeEntry(k, qty){ const c = coll.get(k); if (!c) return; if (c.qty - qty <= 0) coll.delete(k); else coll.set(k, Object.assign({}, c, {qty: c.qty - qty})); }

const undoStack = [];
let lastAdded = null;
function recordScan(key, e, qty){
  session.items.push({key, sid: e.sid, name: e.name, set: e.set, setName: e.setName, number: e.number, rarity: e.rarity, lang: e.lang, foil: e.foil, cond: e.cond, list: e.list, img: e.img, qty,
    usd: unitVal(e, "usd"), eur: unitVal(e, "eur"), t: Date.now()});
  if (session.items.length > 5000) session.items.shift();
  saveSess();
  return unitVal(e);
}
function celebrate(v){
  if (isValuable(v)) {
    sound("valuable"); $("cam").classList.add("valuable"); setTimeout(() => $("cam").classList.remove("valuable"), 1500);
    return ` Valuable: ${money(v)}. Set it aside!`;
  }
  sound("ok"); return "";
}
function addCurrent(auto){
  if (!current || current.added) return;
  hideHelp();
  const p = current.prints[current.sel], foil = current.foil, deck = activeDeck();
  if (deck) {
    const r = addToDeck(deck, p, foil, current.qty);
    if (!r.ok) { sound("check"); setStatus(r.msg, "err"); return; }
    const u = {deck: deck.id, name: p.name, sid: p.id, board: r.commander ? "commander" : r.board, foil: !!foil, qty: r.commander ? 1 : current.qty, commander: !!r.commander};
    if (prefs.deckAlsoColl) { const e = entryFrom(p, foil, current.cond || prefs.cond, prefs.list, u.qty); u.collKey = putEntry(e); recordScan(u.collKey, e, u.qty); saveColl(); }
    undoStack.push(u); if (undoStack.length > 200) undoStack.shift();
    lastAdded = {deck: deck.id, p, foil};
    if (current.rectified) learnLook(p, current.wins, current.flipped);
    current.added = true; renderAll(); renderCurrent();
    const extra = celebrate(priceOf(p, foil));
    const partnerNote = r.commander && deck.commanders.length === 1 && pairsWithAnother(deck.commanders[0]) ? " It can pair with a partner or background: use “Add a second commander” in the Decks tab." : "";
    setStatus(r.msg + partnerNote + extra, "ok");
    toast(r.commander ? `${p.name} is your commander` : `Added ${p.name} to ${deck.name}`, "Undo", undo);
    return;
  }
  const e = entryFrom(p, foil, current.cond || prefs.cond, prefs.list, current.qty);
  const key = putEntry(e);
  const v = recordScan(key, e, current.qty);
  undoStack.push({key, qty: current.qty}); if (undoStack.length > 200) undoStack.shift();
  lastAdded = {key, e};
  if (current.rectified) learnLook(p, current.wins, current.flipped);
  current.added = true; flashId = key; saveColl(); renderAll(); renderCurrent();
  const extra = celebrate(v);
  setStatus(`Added ${p.name} (${p.set})${foil ? " foil" : ""} to ${prefs.list}.${extra || (prefs.auto ? " Next card!" : " Press Space for the next one.")}`, "ok");
  toast(`Added ${p.name}${v ? " · " + money(v) : ""}`, "Undo", undo);
}
function addAnother(){
  if (!lastAdded) return;
  if (lastAdded.deck) {
    const d = deckById(lastAdded.deck); if (!d || needsCommander(d)) return;
    const r = addToDeck(d, lastAdded.p, lastAdded.foil, 1);
    const u = {deck: d.id, name: lastAdded.p.name, sid: lastAdded.p.id, board: r.board, foil: !!lastAdded.foil, qty: 1};
    if (prefs.deckAlsoColl) { const e = entryFrom(lastAdded.p, lastAdded.foil, prefs.cond, prefs.list, 1); u.collKey = putEntry(e); recordScan(u.collKey, e, 1); saveColl(); }
    undoStack.push(u); renderAll(); setStatus(r.msg + celebrate(priceOf(lastAdded.p, lastAdded.foil)), "ok");
    return;
  }
  const e = Object.assign({}, lastAdded.e, {qty: 1}); const key = putEntry(e);
  const v = recordScan(key, e, 1); undoStack.push({key, qty: 1});
  flashId = key; saveColl(); renderAll();
  const extra = celebrate(v), c = coll.get(key);
  setStatus(`Added another ${e.name}. You have ${c ? c.qty : 1} in ${e.list}.${extra}`, "ok");
}
function recondLast(cond){
  // condition changed right after adding: move that copy to the new condition
  const u = undoStack[undoStack.length - 1]; if (!u || !lastAdded || u.deck) return;
  const c = coll.get(u.key); if (!c) return;
  takeEntry(u.key, u.qty);
  const e = Object.assign({}, c, {cond, qty: u.qty}); const key = putEntry(e);
  u.key = key; lastAdded = {key, e: Object.assign({}, e)};
  const it = session.items[session.items.length - 1]; if (it) { it.key = key; it.cond = cond; saveSess(); }
  saveColl(); renderAll();
}
function undo(){
  // skip scans whose row was since moved or deleted by hand
  let u = undoStack.pop(); while (u && (u.deck ? !deckById(u.deck) : !coll.get(u.key))) u = undoStack.pop();
  if (!u) { toast("Nothing left to undo."); return; }
  if (u.deck) {
    const d = deckById(u.deck); takeFromDeck(d, u);
    if (u.collKey && coll.get(u.collKey)) { takeEntry(u.collKey, u.qty); const i = session.items.map(x => x.key).lastIndexOf(u.collKey); if (i >= 0) { session.items.splice(i, 1); saveSess(); } saveColl(); }
    if (current) current.added = false;
    renderAll(); renderCurrent(); setStatus(`Removed ${u.name} from ${d.name}.`, ""); $("toast").classList.add("hide");
    return;
  }
  const c = coll.get(u.key);
  takeEntry(u.key, u.qty);
  const i = session.items.map(x => x.key).lastIndexOf(u.key); if (i >= 0) { session.items.splice(i, 1); saveSess(); }
  if (current) current.added = false;
  saveColl(); renderAll(); renderCurrent(); setStatus(`Removed ${c.name}.`, ""); $("toast").classList.add("hide");
}

/* ----- this session ----- */
function renderSession(){
  const items = session.items;
  let n = 0, v = 0;
  for (const it of items) { const u = prefs.cur === "eur" ? it.eur : it.usd; n += it.qty; if (!(prefs.ign1 && u < 1)) v += (u || 0) * it.qty; }
  $("sessValue").textContent = money(v); $("sessCount").textContent = n.toLocaleString();
  const mins = Math.max(1, Math.round((Date.now() - session.started) / 60000));
  $("sessMeta").textContent = `${n.toLocaleString()} card${n === 1 ? "" : "s"} scanned${n ? ` in ${mins < 120 ? mins + " min" : Math.round(mins / 60) + " h"}` : ""}${prefs.ign1 ? " · under " + money(1) + " not counted" : ""}`;
  $("ign1Lbl").textContent = `Ignore cards under ${money(1)}`;
  const box = $("sessList");
  if (!items.length) { box.innerHTML = `<div class="empty"><strong>No cards scanned yet</strong>Each card you scan shows up here, newest first, so you can check them as you go and fix anything with one click.</div>`; return; }
  const start = Math.max(0, items.length - 300);
  let html = "";
  for (let i = items.length - 1; i >= start; i--) {
    const it = items[i], u = prefs.cur === "eur" ? it.eur : it.usd, val = isValuable(u);
    html += `<div class="srow ${val ? "val" : ""}">
      <img loading="lazy" src="${esc(it.img)}" alt="">
      <div class="nm"><b>${esc(it.name)}</b><small>${esc(it.set)} · ${esc(it.number)} · ${esc(it.cond)}${it.foil ? " · ★ Foil" : ""}${it.list !== "Collection" ? " · " + esc(it.list) : ""}</small></div>
      ${val ? '<span class="valtag">Valuable</span>' : "<span></span>"}
      <span class="num">${it.qty > 1 ? it.qty + "× " : ""}${u ? money(u) : "—"}</span>
      <span class="sacts">${coll.has(it.key) ? `<button class="edit-btn" type="button" data-sedit="${i}" title="Wrong printing or foil? Fix it" aria-label="Edit this scan">✎</button>` : ""}<button class="x" type="button" data-rm="${i}" aria-label="Remove this scan" title="Remove this scan">×</button></span>
    </div>`;
  }
  if (start > 0) html += `<div class="empty">Showing the latest 300 of ${items.length.toLocaleString()} scans.</div>`;
  box.innerHTML = html;
}
$("sessList").addEventListener("click", e => {
  const se = e.target.closest("[data-sedit]"); if (se) { const it = session.items[+se.dataset.sedit]; if (it && coll.has(it.key)) openEditor({kind: "coll", key: it.key}); return; }
  const b = e.target.closest("[data-rm]"); if (!b) return;
  const i = +b.dataset.rm, it = session.items[i]; if (!it) return;
  const before = coll.get(it.key) ? Object.assign({}, coll.get(it.key)) : null;
  takeEntry(it.key, it.qty); session.items.splice(i, 1); saveSess(); saveColl(); renderAll();
  toast(`Removed ${it.name}`, "Undo", () => {
    session.items.splice(i, 0, it); saveSess();
    const c = coll.get(it.key);
    if (c) coll.set(it.key, Object.assign({}, c, {qty: c.qty + it.qty})); else if (before) coll.set(it.key, Object.assign({}, before, {qty: it.qty}));
    saveColl(); renderAll();
  });
});
$("newSess").onclick = () => {
  const old = session; session = {started: Date.now(), items: []}; saveSess(); renderAll();
  if (old.items.length) toast("Started a new session. Your collection is unchanged.", "Undo", () => { session = old; saveSess(); renderAll(); });
};

/* ----- collection view ----- */
const selected = new Set();
let flashId = null, confirmClear = false;
// card type filter: a double-faced card counts as a land if either face is one (Mosswood Dreadknight's back isn't, Emeria's Call's is)
const BASIC_NAMES = /^(?:Snow-Covered )?(?:Plains|Island|Swamp|Mountain|Forest|Wastes)$/;
const typeOk = (c, f) => {
  if (!f) return true;
  const t = c.type || "", land = /\bLand\b/.test(t) || (!t && BASIC_NAMES.test(c.name)), basic = /\bBasic\b/.test(t) || (!t && BASIC_NAMES.test(c.name));
  if (f === "land") return land;
  if (f === "basic") return land && basic;
  if (f === "nonbasic") return land && !basic;
  if (f === "nonland") return !land;
  return new RegExp("\\b" + f + "\\b", "i").test(t);
};
const colorKey = e => !e.colors ? "" : e.colors.length === 0 ? "C" : e.colors.length > 1 ? "M" : e.colors[0];
function filteredRows(){
  const q = $("q").value.trim().toLowerCase();
  return [...coll].filter(([, c]) => (!prefs.fList || c.list === prefs.fList) && (!prefs.fRarity || c.rarity === prefs.fRarity) && (!prefs.fColor || colorKey(c) === prefs.fColor) && typeOk(c, prefs.fType)
    && (!q || c.name.toLowerCase().includes(q) || c.set.toLowerCase() === q || (c.setName || "").toLowerCase().includes(q) || (c.type || "").toLowerCase().includes(q)));
}
function sparkline(){
  const pts = hist.map(h => prefs.cur === "eur" ? h.eur : h.usd);
  if (pts.length < 2) return "";
  const W = 120, H = 28, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, i) => [i * W / (pts.length - 1), H - 2 - (v - lo) / span * (H - 4)]);
  const line = xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");
  const first = pts[0], last = pts[pts.length - 1], pct = first ? (last - first) / first * 100 : 0;
  return `<span class="spark" title="Collection value since ${esc(hist[0].d)}"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <polygon points="0,${H} ${line} ${W},${H}" fill="color-mix(in srgb, var(--accent) 16%, transparent)"></polygon>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.5"></polyline>
    <circle cx="${xy[xy.length - 1][0]}" cy="${xy[xy.length - 1][1]}" r="2.5" fill="var(--accent)"></circle></svg>
    <span class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%</span> since ${esc(hist[0].d)}</span>`;
}
/* ----- big card view: click a card in the collection ----- */
let collShown = [], viewId = null, viewBack = false;
const largeImg = u => String(u || "").replace("/small/", "/large/").replace("/normal/", "/large/");
function openViewer(id){
  const c = coll.get(id); if (!c) return;
  viewId = id; viewBack = false;
  renderViewer();
  const dlg = $("viewDlg"); if (!dlg.open) dlg.showModal();
}
function renderViewer(){
  const c = coll.get(viewId), dlg = $("viewDlg"); if (!c) { if (dlg.open) dlg.close(); return; }
  const i = collShown.indexOf(viewId), dfc = (c.name || "").includes(" // ");
  const front = largeImg(c.imgN || c.img), src = viewBack ? front.replace("/front/", "/back/") : front;
  const u = unitVal(c);
  dlg.innerHTML = `<div class="vw">
    <button type="button" class="vw-x" data-vw="close" aria-label="Close">✕</button>
    <div class="vw-pic"><img src="${esc(src)}" alt="${esc(c.name)}" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${esc(c.imgN || c.img)}'}"></div>
    <div class="vw-info">
      <h3>${esc(c.name)}</h3>
      <div class="cur-sub">${esc(c.setName || c.set || "")}${c.number ? " · #" + esc(c.number) : ""}${c.rarity ? " · " + esc(c.rarity) : ""}</div>
      <div class="vw-facts"><span><b>${u ? money(u) : "—"}</b> each${c.foil ? " (foil)" : ""}</span><span><b>${c.qty}</b> owned</span><span>${esc(c.cond || "")}</span>${c.list ? `<span>${esc(c.list)}</span>` : ""}</div>
      ${c.type ? `<div class="vw-type">${esc(c.type)}</div>` : ""}
      ${c.text ? `<div class="vw-text">${esc(c.text).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="vw-btns">
        ${dfc ? `<button class="btn" type="button" data-vw="flip">${viewBack ? "Show front" : "Flip to back"}</button>` : ""}
        <button class="btn" type="button" data-vw="edit">Change printing</button>
        <a class="btn" href="https://scryfall.com/search?q=${encodeURIComponent('!"' + c.name.split(" // ")[0] + '"')}" target="_blank" rel="noopener">Scryfall</a>
      </div>
      <div class="vw-nav"><button class="btn" type="button" data-vw="prev" ${i <= 0 ? "disabled" : ""} aria-label="Previous card">‹ Previous</button><span class="cur-sub">${i >= 0 ? `${i + 1} of ${collShown.length}` : ""}</span><button class="btn" type="button" data-vw="next" ${i < 0 || i >= collShown.length - 1 ? "disabled" : ""} aria-label="Next card">Next ›</button></div>
    </div></div>`;
}
$("viewDlg").addEventListener("click", e => {
  const dlg = $("viewDlg");
  if (e.target === dlg) return dlg.close();   // clicked the dark backdrop
  const b = e.target.closest("[data-vw]"); if (!b) return;
  const a = b.dataset.vw, i = collShown.indexOf(viewId);
  if (a === "close") return dlg.close();
  if (a === "flip") { viewBack = !viewBack; return renderViewer(); }
  if (a === "edit") { dlg.close(); return openEditor({kind: "coll", key: viewId}); }
  if (a === "prev" && i > 0) { viewId = collShown[i - 1]; viewBack = false; return renderViewer(); }
  if (a === "next" && i >= 0 && i < collShown.length - 1) { viewId = collShown[i + 1]; viewBack = false; return renderViewer(); }
});
$("viewDlg").addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") { e.preventDefault(); const b = $("viewDlg").querySelector('[data-vw="prev"]'); if (b && !b.disabled) b.click(); }
  if (e.key === "ArrowRight") { e.preventDefault(); const b = $("viewDlg").querySelector('[data-vw="next"]'); if (b && !b.disabled) b.click(); }
});
function renderColl(){
  let total = 0, value = 0;
  for (const c of coll.values()) { total += c.qty; value += c.qty * unitVal(c); }
  $("stTotal").textContent = total.toLocaleString(); $("stUnique").textContent = coll.size.toLocaleString(); $("stValue").textContent = money(value);
  $("stValueLbl").textContent = `Value (${prefs.cur.toUpperCase()})`;
  $("collCount").textContent = total.toLocaleString(); $("collCountTop").textContent = total.toLocaleString();
  const wrap = $("tableWrap");
  for (const k of selected) if (!coll.has(k)) selected.delete(k);
  renderBulk();
  if (!coll.size) {
    $("statsStrip").innerHTML = ""; $("movers").innerHTML = "";
    wrap.innerHTML = `<div class="empty"><strong>Your binder is empty</strong>
      <ol><li>Turn on the webcam and hold a card up anywhere in view. A green outline means it has found the card. Tilted or upside down is fine.</li>
      <li>Hold it still for a moment. It straightens the card, reads it and compares the picture.</li>
      <li>Swap in the next card. Use <b>Set lock</b> when you're going through one or more sets. It gets the printing right every time.</li></ol></div>`;
    return;
  }
  const rows = filteredRows(), s = prefs.sort;
  const chg = c => { const pv = prevVal(c); return pv == null ? 0 : (unitVal(c) - pv) * c.qty; };
  rows.sort(([, a], [, b]) => s === "name" ? a.name.localeCompare(b.name)
    : s === "set" ? a.set.localeCompare(b.set) || (parseInt(a.number) || 0) - (parseInt(b.number) || 0)
    : s === "value" ? unitVal(b) * b.qty - unitVal(a) * a.qty
    : s === "change" ? chg(b) - chg(a)
    : b.updatedAt - a.updatedAt);
  // stats for what's shown
  let n = 0, v = 0; const rar = {mythic: 0, rare: 0, uncommon: 0, common: 0}, col = {W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, C: 0};
  for (const [, c] of rows) { n += c.qty; v += c.qty * unitVal(c); if (rar[c.rarity] != null) rar[c.rarity] += c.qty; const k = colorKey(c); if (col[k] != null) col[k] += c.qty; }
  const pipC = {W: "var(--pip-w)", U: "var(--pip-u)", B: "var(--pip-b)", R: "var(--pip-r)", G: "var(--pip-g)", M: "linear-gradient(135deg,var(--pip-w),var(--pip-u),var(--pip-b),var(--pip-r),var(--pip-g))", C: "var(--sunk)"};
  $("statsStrip").innerHTML = `<span><b style="color:var(--ink)">${n.toLocaleString()}</b> cards · <b style="color:var(--ink)">${money(v)}</b></span>
    <span class="grp">${["mythic","rare","uncommon","common"].filter(r => rar[r]).map(r => `<span title="${r[0].toUpperCase() + r.slice(1)}"><span class="dot ${r}"></span>${rar[r]}</span>`).join("")}</span>
    <span class="grp">${Object.keys(col).filter(k => col[k]).map(k => `<span title="${({W:"White",U:"Blue",B:"Black",R:"Red",G:"Green",M:"Multicolor",C:"Colorless"})[k]}"><span class="pip" style="background:${pipC[k]}"></span>${col[k]}</span>`).join("")}</span>
    ${sparkline()}`;
  if (!rows.length) { wrap.innerHTML = `<div class="empty">No cards match these filters.</div>`; renderMovers(); return; }
  const showList = prefs.lists.length > 1;
  const shown = rows.slice(0, 500);
  const allSel = shown.every(([k]) => selected.has(k));
  wrap.innerHTML = `<table><thead><tr><th class="ck"><input type="checkbox" id="selAll" aria-label="Select all shown" ${allSel ? "checked" : ""}></th><th>Card</th><th>Set</th><th>Cond.</th>${showList ? "<th>List</th>" : ""}<th class="num">Price</th><th class="num">Qty</th></tr></thead><tbody>${
    (collShown = shown.map(([id]) => id), shown).map(([id, c]) => {
      const u = unitVal(c), pv = prevVal(c), d = pv == null ? 0 : u - pv;
      return `<tr data-id="${esc(id)}" class="${id === flashId ? "flash" : ""}">
      <td class="ck"><input type="checkbox" data-sel aria-label="Select ${esc(c.name)}" ${selected.has(id) ? "checked" : ""}></td>
      <td><div class="cn"><button type="button" class="cn-view" data-view title="See the card bigger" aria-label="See ${esc(c.name)} bigger"><img loading="lazy" src="${esc(c.img)}" alt=""><b>${esc(c.name)}</b></button>${c.lang && c.lang !== "en" ? ` <b class="lang">${esc(c.lang.toUpperCase())}</b>` : ""}<button class="edit-btn" type="button" data-edit title="Change printing, set or foil" aria-label="Edit ${esc(c.name)}">✎</button></div></td>
      <td class="nowrap"><span class="dot ${esc(c.rarity)}"></span><span class="chip">${esc(c.set)} · ${esc(c.number)}</span></td>
      <td class="nowrap"><span class="cond">${esc(c.cond)}</span>${c.foil ? ' <span class="foil" title="Foil">★ Foil</span>' : ""}</td>
      ${showList ? `<td>${esc(c.list)}</td>` : ""}
      <td class="num">${u ? money(u) : "—"}${Math.abs(d) >= 0.01 ? `<span class="chg ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${money(Math.abs(d))}</span>` : ""}</td>
      <td class="num"><span class="step"><button type="button" data-d="-1" aria-label="Remove one">−</button><span>${c.qty}</span><button type="button" data-d="1" aria-label="Add one">+</button></span></td>
    </tr>`; }).join("")}</tbody></table>${rows.length > 500 ? `<div class="empty">Showing 500 of ${rows.length.toLocaleString()}. Search or filter to find the rest.</div>` : ""}`;
  flashId = null;
  renderMovers();
}
function renderMovers(){
  const ch = [...coll.values()].map(c => { const pv = prevVal(c); return {c, d: pv == null ? 0 : (unitVal(c) - pv) * c.qty}; }).filter(x => Math.abs(x.d) >= 0.01);
  if (!ch.length) { $("movers").innerHTML = ""; return; }
  ch.sort((a, b) => b.d - a.d);
  const up = ch.filter(x => x.d > 0).slice(0, 5), dn = ch.filter(x => x.d < 0).reverse().slice(0, 5);
  const li = x => `<li>${esc(x.c.name)} <span class="chip">${esc(x.c.set)}</span> <span class="${x.d > 0 ? "up" : "down"}">${x.d > 0 ? "+" : "−"}${money(Math.abs(x.d))}</span></li>`;
  const when = prefs.lastRefresh ? new Date(prefs.lastRefresh).toLocaleDateString() : "";
  $("movers").innerHTML = `<div class="movers">
    <div><h3>Biggest gains${when ? " · updated " + esc(when) : ""}</h3>${up.length ? `<ol>${up.map(li).join("")}</ol>` : '<span class="cur-sub">None</span>'}</div>
    <div><h3>Biggest drops</h3>${dn.length ? `<ol>${dn.map(li).join("")}</ol>` : '<span class="cur-sub">None</span>'}</div></div>`;
}
$("tableWrap").addEventListener("click", e => {
  const vw = e.target.closest("[data-view]"); if (vw) return openViewer(vw.closest("tr").dataset.id);
  const ed = e.target.closest("[data-edit]"); if (ed) return openEditor({kind: "coll", key: ed.closest("tr").dataset.id});
  const b = e.target.closest("button[data-d]"); if (!b) return;
  const id = b.closest("tr").dataset.id, c = coll.get(id); if (!c) return;
  const n = c.qty + Number(b.dataset.d);
  if (n <= 0) { coll.delete(id); toast(`Removed ${c.name}`, "Undo", () => { coll.set(id, c); saveColl(); renderAll(); }); }
  else coll.set(id, Object.assign({}, c, {qty: n}));
  saveColl(); renderAll();
});
$("tableWrap").addEventListener("change", e => {
  if (e.target.id === "selAll") { for (const [k] of filteredRows().slice(0, 500)) e.target.checked ? selected.add(k) : selected.delete(k); renderColl(); renderExpScope(); return; }
  if (e.target.matches("[data-sel]")) { const k = e.target.closest("tr").dataset.id; e.target.checked ? selected.add(k) : selected.delete(k); renderBulk(); renderExpScope(); }
});
function renderBulk(){
  $("bulkBar").classList.toggle("hide", !selected.size);
  $("bulkCount").textContent = `${selected.size} selected`;
}
function bulkApply(fn, label){
  const backup = new Map(coll), keys = [...selected];
  for (const k of keys) { const c = coll.get(k); if (!c) continue; coll.delete(k); const r = fn(c); if (r) putEntry(r); }
  selected.clear(); saveColl(); renderAll();
  toast(label, "Undo", () => { coll.clear(); backup.forEach((v, k) => coll.set(k, v)); saveColl(); renderAll(); });
}
$("bulkCond").onchange = e => { const v = e.target.value; e.target.value = ""; if (v) bulkApply(c => Object.assign({}, c, {cond: v}), `Set ${selected.size} to ${v}`); };
$("bulkFoil").onchange = e => { const v = e.target.value; e.target.value = ""; if (v) bulkApply(c => Object.assign({}, c, {foil: v === "f"}), `Set ${selected.size} to ${v === "f" ? "foil" : "normal"}`); };
$("bulkList").onchange = e => { const v = e.target.value; e.target.value = ""; if (v) bulkApply(c => Object.assign({}, c, {list: v}), `Moved ${selected.size} to ${v}`); };
$("bulkDel").onclick = () => bulkApply(() => null, `Deleted ${selected.size} row${selected.size === 1 ? "" : "s"}`);
$("bulkNone").onclick = () => { selected.clear(); renderAll(); };

/* ----- lists, filters, tabs ----- */
function renderLists(){
  const opts = l => `<option value="${esc(l)}">${esc(l)}</option>`;
  $("listSel").innerHTML = `<optgroup label="Collection">${prefs.lists.map(l => `<option value="l:${esc(l)}">${esc(l)}</option>`).join("")}</optgroup>`
    + (decks.length ? `<optgroup label="Decks">${decks.map(d => `<option value="d:${esc(d.id)}">${esc(d.name)} (deck)</option>`).join("")}</optgroup>` : "");
  $("listSel").value = activeDeck() ? "d:" + prefs.deckId : "l:" + prefs.list;
  $("fList").innerHTML = `<option value="">All lists</option>` + prefs.lists.map(opts).join(""); $("fList").value = prefs.fList;
  $("fList").classList.toggle("hide", prefs.lists.length < 2);
  $("bulkList").innerHTML = `<option value="">Move to list…</option>` + prefs.lists.map(opts).join("");
}
$("listSel").onchange = e => {
  const v = e.target.value;
  if (v.startsWith("d:")) { prefs.deckView = v.slice(2); setScanTarget(v.slice(2)); }
  else { prefs.list = v.slice(2); setScanTarget(null); }
};
$("newListBtn").onclick = () => { $("newListWrap").hidden = !$("newListWrap").hidden; if (!$("newListWrap").hidden) $("newList").focus(); };
$("newList").addEventListener("keydown", e => {
  if (e.key === "Escape") { $("newListWrap").hidden = true; return; }
  if (e.key !== "Enter") return;
  e.preventDefault();
  const name = e.target.value.trim().replace(/\|/g, "/"); if (!name) return;
  if (!prefs.lists.includes(name)) prefs.lists.push(name);
  prefs.list = name; savePrefs(); e.target.value = ""; $("newListWrap").hidden = true;
  setScanTarget(null);
});
$("fList").onchange = e => { prefs.fList = e.target.value; savePrefs(); renderColl(); renderExpScope(); };
$("fRarity").value = prefs.fRarity; $("fRarity").onchange = e => { prefs.fRarity = e.target.value; savePrefs(); renderColl(); renderExpScope(); };
$("fColor").value = prefs.fColor; $("fColor").onchange = e => { prefs.fColor = e.target.value; savePrefs(); renderColl(); renderExpScope(); };
$("fType").value = prefs.fType || ""; $("fType").onchange = e => { prefs.fType = e.target.value; savePrefs(); renderColl(); renderExpScope(); };
$("q").oninput = () => { renderColl(); renderExpScope(); };
$("sort").value = prefs.sort; $("sort").onchange = e => { prefs.sort = e.target.value; savePrefs(); renderColl(); };
function setView(v){
  if (v === "decks") return showPage("builder");
  showPage(v === "collection" ? "collection" : "scanner");
}
$("tabSess").onclick = () => setView("session"); $("tabColl").onclick = () => setView("collection");
function renderAll(){ renderSession(); renderColl(); renderExpScope(); renderDeck(); }

$("clearAll").onclick = () => {
  if (!coll.size) return;
  if (!confirmClear) { confirmClear = true; $("clearAll").textContent = "Click again to delete everything"; setTimeout(() => { confirmClear = false; $("clearAll").textContent = "Clear collection"; }, 4000); return; }
  const backup = [...coll]; coll.clear(); saveColl(); renderAll(); confirmClear = false; $("clearAll").textContent = "Clear collection";
  toast("Collection cleared", "Undo", () => { backup.forEach(([k, v]) => coll.set(k, v)); saveColl(); renderAll(); });
};

/* ----- prices ----- */
function recordValue(){
  if (!coll.size) return;
  let usd = 0, eur = 0; for (const c of coll.values()) { usd += c.qty * unitVal(c, "usd"); eur += c.qty * unitVal(c, "eur"); }
  const d = stamp(), last = hist[hist.length - 1];
  if (last && last.d === d) Object.assign(last, {usd, eur}); else hist.push({d, usd, eur});
  while (hist.length > 730) hist.shift();
  store.set("bsw-hist", hist);
}
let refreshing = false;
async function refreshPrices(silent){
  if ((!coll.size && !decks.length) || refreshing) return;
  refreshing = true; const btn = $("refresh"); btn.disabled = true;
  const ids = [...new Set([...coll.values()].map(c => c.sid).concat(decks.flatMap(d => [...d.commanders, ...d.cards].map(c => c.sid))))];
  try {
    const fresh = new Map();
    for (let i = 0; i < ids.length; i += 75) {
      btn.textContent = `Updating ${Math.min(i + 75, ids.length)}/${ids.length}…`;
      const j = await sf("/cards/collection", {method: "POST", headers: {"Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify({identifiers: ids.slice(i, i + 75).map(id => ({id}))})});
      for (const c of j.data || []) fresh.set(c.id, slimCard(c));
    }
    for (const [k, c] of coll) {
      const p = fresh.get(c.sid); if (!p) continue;
      coll.set(k, Object.assign({}, c, {prevUsd: unitVal(c, "usd"), prevEur: unitVal(c, "eur"), usd: num(p.usd), usdF: num(p.usdFoil), eur: num(p.eur), eurF: num(p.eurFoil),
        type: p.type, colors: p.colors, finishes: p.finishes, rarity: p.rarity, img: c.img || p.img}));
    }
    for (const d of decks) for (const c of [...d.commanders, ...d.cards]) {
      const p = fresh.get(c.sid); if (!p) continue;
      Object.assign(c, {power: p.power || c.power || "", toughness: p.toughness || c.toughness || "", cost: p.cost || c.cost || "", imgN: c.imgN || p.imgN || "", usd: num(p.usd), usdF: num(p.usdFoil), eur: num(p.eur), eurF: num(p.eurFoil), legal: p.legal, ci: p.ci, cmc: p.cmc, type: p.type, text: p.text});
    }
    saveDecks();
    prefs.lastRefresh = Date.now(); savePrefs(); recordValue(); saveColl(); renderAll();
    if (!silent) toast("Prices updated. See the biggest gains and drops under Collection.");
  } catch (e) { if (!silent) toast("Couldn't reach Scryfall. Try again later."); }
  refreshing = false; btn.disabled = false; btn.textContent = "Refresh prices";
}
$("refresh").onclick = () => refreshPrices(false);

