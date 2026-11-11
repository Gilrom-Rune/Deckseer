/* ---------------- decks ----------------
   A deck is its own list (separate from the collection, like Moxfield). For Commander decks the first card
   you scan or type becomes the commander; everything after goes into the deck. */
const DECK_FORMATS = [["commander", "Commander"], ["standard", "Standard"], ["pioneer", "Pioneer"], ["modern", "Modern"], ["legacy", "Legacy"], ["vintage", "Vintage"], ["pauper", "Pauper"], ["casual", "Casual / other"]];
const fmtName = f => (DECK_FORMATS.find(x => x[0] === f) || [f, f])[1];
let decks = store.get("bsw-decks", []);
const saveDecks = () => { if (!store.set("bsw-decks", decks)) toast("Couldn't save decks in this browser. Copy the deck list to keep it."); };
const deckById = id => decks.find(d => d.id === id);
const activeDeck = () => (prefs.deckId && deckById(prefs.deckId)) || null;
let wantSecondCommander = false, deckConfirmDel = false, deckCollOpen = false;
// which of a deck's cards aren't in your collection: compared by name, across every list and printing
function deckCollGap(d){
  const have = new Map(); for (const e of coll.values()) have.set(e.name, (have.get(e.name) || 0) + (e.qty || 0));
  const need = new Map(), first = new Map();
  for (const c of [...d.commanders, ...d.cards]) { need.set(c.name, (need.get(c.name) || 0) + (c.qty || 1)); if (!first.has(c.name)) first.set(c.name, c); }
  const missing = [];
  for (const [name, n] of need) { const k = n - (have.get(name) || 0); if (k > 0) missing.push({name, qty: k, card: first.get(name)}); }
  return {missing, nMissing: missing.reduce((t, m) => t + m.qty, 0), nAll: [...need.values()].reduce((t, n) => t + n, 0)};
}
// put a deck's cards into the collection: only the missing copies, or every card in it
function deckToColl(d, all){
  const list = prefs.list && prefs.list !== "Decks" ? prefs.list : "Collection", added = [];
  const asPrint = c => Object.assign({}, c, {id: c.sid, usdFoil: c.usdF, eurFoil: c.eurF});
  const put = (c, qty) => { if (qty <= 0) return; const e = entryFrom(asPrint(c), !!c.foil, prefs.cond, list, qty); added.push({key: putEntry(e), qty}); };
  if (all) for (const c of [...d.commanders, ...d.cards]) put(c, c.qty || 1);
  else for (const m of deckCollGap(d).missing) {
    // the missing copies, spread over the deck's own printings of that card
    let left = m.qty;
    for (const c of [...d.commanders, ...d.cards].filter(x => x.name === m.name)) { const k = Math.min(left, c.qty || 1); put(c, k); left -= k; if (!left) break; }
  }
  saveColl(); deckCollOpen = false; renderColl(); renderDeck();
  const n = added.reduce((t, a) => t + a.qty, 0);
  toast(n ? `Added ${n} card${n === 1 ? "" : "s"} from ${d.name} to ${list}` : "Nothing to add: they're all in your collection", n ? "Undo" : null, () => { added.forEach(a => takeEntry(a.key, a.qty)); saveColl(); renderColl(); renderDeck(); });
  return n;
}
// offered after importing a deck or scanning one without "Also add scanned cards to my collection"
function offerDeckColl(d, msg){
  const g = deckCollGap(d);
  if (!g.nMissing) return msg && toast(msg);
  toast(`${msg ? msg + " " : ""}${g.nMissing} card${g.nMissing === 1 ? " isn't" : "s aren't"} in your collection.`, "Add to collection", () => { prefs.deckView = d.id; deckCollOpen = true; savePrefs(); showPage("builder"); renderDeck(); });
}
/* ----- replace a card in a deck (or add one) by typing its name ----- */
let repl = null;
function openReplace(o){
  repl = Object.assign({q: "", busy: false, msg: "", ok: false, sel: 0, qty: 1, mode: "one", paste: ""}, o);
  if (repl.add) { const d = deckById(repl.deckId); repl.board = repl.board || (d && needsCommander(d) ? "commander" : d && d.format !== "commander" && prefs.deckBoard === "side" ? "side" : "main"); }
  renderReplace();
  const dlg = $("replDlg"); if (!dlg.open) dlg.showModal();
  setTimeout(() => { const i = $("replInput"); if (i) i.focus(); }, 30);
}
function replCard(){ const d = deckById(repl.deckId); if (!d || repl.add) return null; return repl.zone === "commander" ? d.commanders.find(c => c.sid === repl.sid) : d.cards.find(c => c.sid === repl.sid && c.board === repl.zone && !!c.foil === repl.foil); }
function replOptions(){
  const owned = new Set([...coll.values()].map(e => e.name));
  const list = repl.q.trim().length >= 2 ? suggest(repl.q) : [];
  // nothing typed yet: ideas from Deck check that do the same job (or fill a short one)
  let ideas = [];
  if (!list.length && !repl.q.trim()) { try { const d = deckById(repl.deckId); const A = dcAnalyze(d), cur = replCard(); const roles = cur ? dcRoles(cur, fwCard(cur)) : []; ideas = dcCandidates(d, A).filter(x => !roles.length || x.info.roles.some(r => roles.includes(r)) || x.fills.length).slice(0, 6).map(x => x.info.name); } catch (e) {} }
  return {names: list.length ? list : ideas, ideas: !list.length, owned};
}
function renderReplace(){
  const dlg = $("replDlg"), d = deckById(repl.deckId); if (!d) return dlg.close();
  const cur = replCard(), O = replOptions();
  repl.opts = O.names; if (repl.sel >= O.names.length) repl.sel = 0;
  dlg.innerHTML = `<form method="dialog" class="repl" onsubmit="return false">
    <div class="repl-head"><h3 id="replTitle">${cur ? `Replace <b>${esc(cur.name)}</b>` : `Add cards to ${esc(d.name)}`}</h3><button type="button" class="vw-x" data-rp="close" aria-label="Close">✕</button></div>
    ${cur && cur.qty > 1 ? `<p class="cur-sub">You have ${cur.qty} copies. One is replaced.</p>` : ""}
    ${repl.add ? `<div class="repl-tabs"><button class="btn sm" type="button" data-rp="one" aria-pressed="${repl.mode !== "paste"}">Search by name</button><button class="btn sm" type="button" data-rp="pastemode" aria-pressed="${repl.mode === "paste"}">Paste a list</button></div>
    <div class="repl-opts">${repl.mode !== "paste" ? `<label>How many <input type="number" id="replQty" min="1" max="99" value="${repl.qty}"></label>` : ""}
      <label>Into <select id="replBoard"><option value="main" ${repl.board === "main" ? "selected" : ""}>Main deck</option>${d.format !== "commander" ? `<option value="side" ${repl.board === "side" ? "selected" : ""}>Sideboard</option>` : ""}${d.format === "commander" && d.commanders.length < 2 && repl.mode !== "paste" ? `<option value="commander" ${repl.board === "commander" ? "selected" : ""}>Commander</option>` : ""}</select></label></div>` : ""}
    ${repl.add && repl.mode === "paste" ? `<textarea id="replPaste" placeholder="One card per line, like:&#10;1 Sol Ring&#10;4 Lightning Bolt&#10;10 Forest" aria-label="Cards to add" ${repl.busy ? "disabled" : ""}>${esc(repl.paste)}</textarea>
    <button class="btn primary" type="button" data-rp="paste" ${repl.busy ? "disabled" : ""}>Add these cards</button>
    <div class="repl-msg${repl.ok ? " ok" : ""}" role="status">${esc(repl.msg || "")}</div>
  </form>` : `
    <input type="search" id="replInput" autocomplete="off" placeholder="Type a card name" value="${esc(repl.q)}" aria-label="New card name" ${repl.busy ? "disabled" : ""}>
    ${O.names.length ? `<div class="repl-lbl cur-sub">${O.ideas ? "Ideas from Deck check" : "Matches"}</div><ul class="repl-list" role="listbox">${O.names.map((n, i) => `<li><button type="button" role="option" aria-selected="${i === repl.sel}" data-rpick="${esc(n)}">${esc(n)}${O.owned.has(n) ? ' <span class="dc-src own">In your collection</span>' : ""}</button></li>`).join("")}</ul>` : repl.q.trim().length >= 2 && ready ? `<p class="cur-sub">No card names match.</p>` : !ready ? `<p class="cur-sub">The card list is still loading. You can type the full name and press Enter.</p>` : ""}
    <div class="repl-msg${repl.ok ? " ok" : ""}" role="status">${repl.busy ? "Getting the card…" : esc(repl.msg || "")}</div>
  </form>`}`;
  const inp = $("replInput"); if (inp && document.activeElement !== inp && !repl.busy) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
async function replaceWith(name){
  const d = deckById(repl.deckId); if (!d || repl.busy) return;
  repl.busy = true; repl.msg = ""; renderReplace();
  let p = null;
  try {
    // the printing you own, if you have one; otherwise Scryfall's default printing
    const own = [...coll.values()].find(e => e.name === name);
    const j = own && own.sid ? await sf(`/cards/${own.sid}`).catch(() => null) : null;
    p = slimCard(j && j.name ? j : await sf(`/cards/named?exact=${encodeURIComponent(name.split(" // ")[0])}`));
  } catch (e) { console.warn(e); }
  repl.busy = false;
  if (!p || !p.name) { repl.msg = "Couldn't find that card. Check the name, or your internet connection."; return renderReplace(); }
  const snapshot = JSON.stringify(d), restore = () => { Object.assign(d, JSON.parse(snapshot)); saveDecks(); renderDeck(); };
  const cur = replCard();
  if (cur) {
    if (repl.zone === "commander") {
      const nc = deckCardFrom(p, false, 1, "commander");
      if (!canCommand(nc) && !/Background/.test(nc.type)) { repl.msg = `${p.name} can't be a commander.`; return renderReplace(); }
      d.commanders[d.commanders.indexOf(cur)] = nc;
    } else {
      const board = cur.board;
      if (cur.qty > 1) cur.qty -= 1; else d.cards.splice(d.cards.indexOf(cur), 1);
      const ex = d.cards.find(c => c.sid === p.id && c.board === board && !c.foil);
      if (ex) ex.qty += 1; else d.cards.push(deckCardFrom(p, false, 1, board));
    }
    toast(`Replaced ${cur.name} with ${p.name}`, "Undo", restore);
  } else {
    const qty = Math.max(1, Math.min(99, Math.floor(+repl.qty || 1)));
    let board = repl.board || "main", note = "";
    if (board === "commander") {
      const nc = deckCardFrom(p, false, 1, "commander");
      if (!canCommand(nc) && !/Background/.test(nc.type)) { repl.msg = `${p.name} can't be a commander. Choose "Main deck" to add it to the deck.`; repl.ok = false; return renderReplace(); }
      if (d.commanders.length >= 2) board = "main";
      else { d.commanders.push(nc); note = " as your commander"; }
    }
    const n = board === "commander" ? qty - 1 : qty;
    if (n > 0) { const b2 = board === "commander" ? "main" : board; const ex = d.cards.find(c => c.sid === p.id && c.board === b2 && !c.foil); if (ex) ex.qty += n; else d.cards.push(deckCardFrom(p, false, n, b2)); }
    const what = `${qty > 1 ? qty + "× " : ""}${p.name}${note || (board === "side" ? " to the sideboard" : "")}`;
    toast(`Added ${what}`, "Undo", restore);
    // stay open for the next card
    d.updated = Date.now(); saveDecks(); renderDeck(); renderCurrent();
    repl.q = ""; repl.sel = 0; repl.qty = 1; repl.msg = `Added ${what}. Type the next card, or close this window.`; repl.ok = true;
    if (board === "commander" || !needsCommander(d)) repl.board = repl.board === "commander" ? "main" : repl.board;
    return renderReplace();
  }
  d.updated = Date.now(); saveDecks(); $("replDlg").close(); renderDeck(); renderCurrent();
}
$("replDlg").addEventListener("input", e => {
  if (e.target.id === "replQty") { repl.qty = e.target.value; return; }
  if (e.target.id === "replPaste") { repl.paste = e.target.value; return; }
  if (e.target.id !== "replInput") return; repl.q = e.target.value; repl.sel = 0; repl.msg = ""; repl.ok = false; renderReplace();
});
$("replDlg").addEventListener("change", e => { if (e.target.id === "replBoard") repl.board = e.target.value; });
// "Paste a list": the same reader as Import a deck list, added to this deck
async function replAddPasted(){
  const d = deckById(repl.deckId); if (!d || repl.busy) return;
  const {cards, skipped} = parseDeckList(repl.paste || "");
  if (!cards.length) { repl.msg = "No cards found. Write one card per line, like “1 Sol Ring”."; repl.ok = false; return renderReplace(); }
  repl.busy = true; repl.msg = "Looking up the cards…"; repl.ok = false; renderReplace();
  try {
    const {found, missing, key} = await lookupCards(cards, (a, b) => { repl.msg = `Looking up the cards… ${a}/${b}`; renderReplace(); });
    const snapshot = JSON.stringify(d), restore = () => { Object.assign(d, JSON.parse(snapshot)); saveDecks(); renderDeck(); };
    let got = 0;
    for (const e of cards) {
      const p = found.get(key(e)); if (!p) continue;
      let board = repl.board === "side" && d.format !== "commander" ? "side" : "main";
      if (e.board === "side" && d.format !== "commander") board = "side";
      const foil = e.foil && (p.finishes.includes("foil") || p.finishes.includes("etched")) || !p.finishes.includes("nonfoil");
      if (e.board === "commander" && d.format === "commander" && d.commanders.length < 2 && !d.commanders.some(c => c.name === p.name)) { d.commanders.push(deckCardFrom(p, foil, 1, "commander")); got++; if (e.qty > 1) { d.cards.push(deckCardFrom(p, foil, e.qty - 1, "main")); got += e.qty - 1; } continue; }
      const ex = d.cards.find(c => c.sid === p.id && c.board === board && c.foil === foil);
      if (ex) ex.qty += e.qty; else d.cards.push(deckCardFrom(p, foil, e.qty, board));
      got += e.qty;
    }
    d.updated = Date.now(); saveDecks(); renderDeck(); renderCurrent();
    const notes = [`Added ${got} card${got === 1 ? "" : "s"}.`];
    if (missing.length) notes.push(`Couldn't find: ${missing.slice(0, 8).map(e => e.name).join(", ")}${missing.length > 8 ? "…" : ""}.`);
    if (skipped.length) notes.push(`Skipped ${skipped.length} line${skipped.length > 1 ? "s" : ""} that weren't cards.`);
    repl.msg = notes.join(" "); repl.ok = !missing.length; repl.paste = missing.map(e => `${e.qty} ${e.name}`).join("\n");
    if (got) toast(`Added ${got} card${got === 1 ? "" : "s"} to ${d.name}`, "Undo", restore);
  } catch (err) { console.warn(err); repl.msg = "Couldn't reach Scryfall to look the cards up. Check your internet connection and try again."; repl.ok = false; }
  repl.busy = false; renderReplace();
  const t = $("replPaste"); if (t) t.focus();
}
$("replDlg").addEventListener("keydown", e => {
  if (e.target.id !== "replInput") return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = (repl.opts || []).length; if (n) { repl.sel = (repl.sel + (e.key === "ArrowDown" ? 1 : n - 1)) % n; renderReplace(); } }
  if (e.key === "Enter") { e.preventDefault(); const pick = (repl.opts || [])[repl.sel] || repl.q.trim(); if (pick) replaceWith(pick); }
});
$("replDlg").addEventListener("click", e => {
  if (e.target === $("replDlg")) return $("replDlg").close();
  if (e.target.closest('[data-rp="close"]')) return $("replDlg").close();
  if (e.target.closest('[data-rp="one"]')) { repl.mode = "one"; repl.msg = ""; renderReplace(); const i = $("replInput"); if (i) i.focus(); return; }
  if (e.target.closest('[data-rp="pastemode"]')) { repl.mode = "paste"; repl.msg = ""; if (repl.board === "commander") repl.board = "main"; renderReplace(); const t = $("replPaste"); if (t) t.focus(); return; }
  if (e.target.closest('[data-rp="paste"]')) return replAddPasted();
  const b = e.target.closest("[data-rpick]"); if (b) replaceWith(b.dataset.rpick);
});
function deckCardFrom(p, foil, qty, board){
  return {sid: p.id, name: p.name, set: p.set, setName: p.setName, number: p.number, qty, board, foil: !!foil, type: p.type || "", text: p.text || "",
    cmc: p.cmc ?? null, ci: p.ci || [], colors: p.colors || [], legal: p.legal || {}, img: p.img, imgN: p.imgN || "", cost: p.cost || "", power: p.power || "", toughness: p.toughness || "", rarity: p.rarity, lang: p.lang, finishes: p.finishes || ["nonfoil"],
    usd: num(p.usd), usdF: num(p.usdFoil), eur: num(p.eur), eurF: num(p.eurFoil)};
}
const canCommand = c => (/Legendary/.test(c.type) && /Creature/.test(c.type.split(" // ")[0])) || /can be your commander/i.test(c.text || "");
const pairsWithAnother = c => /\bPartner\b|Friends forever|Choose a Background|Doctor's companion/i.test(c.text || "");
const isBasic = c => /\bBasic\b/.test(c.type) || /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(c.name);
const anyNumber = c => /A deck can have any number of cards named/i.test(c.text || "");
const needsCommander = d => d && d.format === "commander" && (d.commanders.length === 0 || wantSecondCommander);
const deckCount = d => d.commanders.length + d.cards.filter(c => c.board === "main").reduce((t, c) => t + c.qty, 0);
const sideCount = d => d.cards.filter(c => c.board === "side").reduce((t, c) => t + c.qty, 0);
const deckValue = d => [...d.commanders, ...d.cards].reduce((t, c) => t + unitVal(c) * (c.qty || 1), 0);
const identity = d => { const s = new Set(); for (const c of d.commanders) for (const x of c.ci || []) s.add(x); return s; };

function newDeck(name, format){
  const d = {id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || "New deck", format, commanders: [], cards: [], created: Date.now(), updated: Date.now()};
  decks.unshift(d); saveDecks(); return d;
}
function addToDeck(d, p, foil, qty){
  if (needsCommander(d)) {
    const c = deckCardFrom(p, foil, 1, "commander");
    const bgOk = wantSecondCommander && /Background/.test(c.type);
    if (!canCommand(c) && !bgOk) return {ok: false, msg: `${p.name} can't be a commander. Scan a legendary creature, or type your commander's name in the box under the camera.`};
    d.commanders.push(c); const second = wantSecondCommander; wantSecondCommander = false; d.updated = Date.now(); saveDecks();
    return {ok: true, commander: true, msg: second ? `${p.name} is your second commander. Now scan the rest of the deck.` : `${p.name} is your commander. Now scan the rest of the deck.`};
  }
  const board = d.format !== "commander" && prefs.deckBoard === "side" ? "side" : "main";
  const ex = d.cards.find(c => c.sid === p.id && c.board === board && c.foil === !!foil);
  if (ex) ex.qty += qty; else d.cards.push(deckCardFrom(p, foil, qty, board));
  d.updated = Date.now(); saveDecks();
  const n = board === "side" ? sideCount(d) : deckCount(d);
  return {ok: true, board, msg: `Added ${p.name} to ${board === "side" ? "the sideboard" : d.name} (${n}${board === "main" ? " / " + (d.format === "commander" ? 100 : 60) : ""}).`};
}
function takeFromDeck(d, u){
  if (u.commander) { const i = d.commanders.map(c => c.sid).lastIndexOf(u.sid); if (i >= 0) d.commanders.splice(i, 1); }
  else { const c = d.cards.find(x => x.sid === u.sid && x.board === u.board && x.foil === u.foil); if (c) { c.qty -= u.qty; if (c.qty <= 0) d.cards.splice(d.cards.indexOf(c), 1); } }
  d.updated = Date.now(); saveDecks();
}

/* ----- rules checks: what Moxfield would flag ----- */
function deckIssues(d){
  const issues = new Map(); const flag = (c, msg) => { const k = c.sid + "|" + c.board; if (!issues.has(k)) issues.set(k, []); issues.get(k).push(msg); };
  const fmt = d.format, byName = new Map();
  for (const c of [...d.commanders, ...d.cards]) byName.set(c.name, (byName.get(c.name) || 0) + (c.qty || 1));
  const ci = identity(d);
  for (const c of d.cards) {
    if (fmt === "casual") continue;
    const L = c.legal && c.legal[fmt];
    if (L && L !== "legal" && L !== "restricted") flag(c, L === "banned" ? `Banned in ${fmtName(fmt)}` : `Not legal in ${fmtName(fmt)}`);
    if (L === "restricted" && byName.get(c.name) > 1) flag(c, `Restricted in ${fmtName(fmt)}: only 1 copy`);
    if (isBasic(c) || anyNumber(c)) continue;
    if (fmt === "commander" && byName.get(c.name) > 1) flag(c, "Commander decks allow 1 copy of each card");
    if (fmt !== "commander" && byName.get(c.name) > 4) flag(c, "More than 4 copies");
  }
  if (fmt === "commander" && d.commanders.length) for (const c of d.cards) if ((c.ci || []).some(x => !ci.has(x))) flag(c, "Outside your commander's colors");
  for (const c of d.commanders) { const L = c.legal && c.legal.commander; if (L && L !== "legal") flag(Object.assign({}, c, {board: "commander"}), "Not legal as a commander"); }
  return issues;
}

/* ----- deck view ----- */
const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];
function mainType(c){
  const t = (c.type || "").split(" // ")[0];
  for (const k of ["Creature", "Planeswalker", "Battle", "Land", "Instant", "Sorcery", "Artifact", "Enchantment"]) if (t.includes(k)) return k;
  return "Other";
}
// Mana costs drawn with Deckseer's own gems: a gem per colored or colorless mana, a round badge for numbers and X
function costGems(cost){
  if (!cost) return "";
  const gem = (k, cls) => `<svg viewBox="0 0 16 18" class="mgem ${cls || ""}" aria-hidden="true"><use href="#gem" fill="var(--pip-${k.toLowerCase()})"/><use href="#gem-facets"/></svg>`;
  const sym = t => {
    if (/^[WUBRGC]$/.test(t)) return gem(t);
    if (/^[WUBRG]\/P$/.test(t)) return gem(t[0], "phy");                        // Phyrexian mana
    let m = t.match(/^([WUBRG])\/([WUBRG])$/); if (m) return `<span class="mhy">${gem(m[1])}${gem(m[2])}</span>`;   // hybrid
    m = t.match(/^(\d+)\/([WUBRG])$/); if (m) return `<span class="mhy"><span class="mnum">${m[1]}</span>${gem(m[2])}</span>`;
    return `<span class="mnum">${esc(t)}</span>`;                                 // 2, X, S and anything else
  };
  const faces = cost.split(" // ").map(f => (f.match(/\{([^}]+)\}/g) || []).map(x => sym(x.slice(1, -1))).join(""));
  return `<span class="mcost" role="img" aria-label="Mana cost ${esc(cost.replace(/[{}]/g, ""))}">${faces.join('<span class="msep">//</span>')}</span>`;
}
const gemSvg = col => `<svg viewBox="0 0 16 18" class="gem-sm" aria-hidden="true"><use href="#gem" fill="var(--pip-${col.toLowerCase()})"/><use href="#gem-facets"/></svg>`;
function renderDeckPicker(){
  const sel = $("deckSel");
  sel.innerHTML = decks.length ? decks.map(d => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(fmtName(d.format))}</option>`).join("") : `<option value="">No decks yet</option>`;
  const shown = prefs.deckView && deckById(prefs.deckView) ? prefs.deckView : (decks[0] && decks[0].id);
  prefs.deckView = shown || null; if (shown) sel.value = shown;
  $("deckCount").textContent = decks.length;
}
function renderDeck(){
  renderDeckPicker();
  const box = $("deckBody"), d = prefs.deckView && deckById(prefs.deckView);
  $("deckNewForm").hidden = !!d && !prefs.deckFormOpen;
  if (!d) { $("deckCards").innerHTML = ""; $("deckCombos").innerHTML = ""; $("deckSim").innerHTML = ""; $("deckViewBar").hidden = true; renderDeckStrip(); box.innerHTML = `<div class="empty"><strong>Build a deck by scanning it</strong>Name your deck and pick a format above. For Commander, you scan (or type) your commander first, then the other 99 cards. When you're done, copy the list into Moxfield or anywhere else.</div>`; $("deckExport").hidden = true; return; }
  $("deckExport").hidden = false;
  const scanning = prefs.deckId === d.id, issues = deckIssues(d), ci = identity(d);
  const total = deckCount(d), goal = d.format === "commander" ? 100 : 60, side = sideCount(d);
  const nonLand = d.cards.filter(c => c.board === "main" && mainType(c) !== "Land");
  const curve = [0, 0, 0, 0, 0, 0, 0, 0]; let cmcSum = 0, cmcN = 0;
  for (const c of [...nonLand, ...d.commanders]) { if (c.cmc == null) continue; const q = c.qty || 1; curve[Math.min(7, Math.floor(c.cmc))] += q; cmcSum += c.cmc * q; cmcN += q; }
  const peak = Math.max(1, ...curve);
  const nIssues = [...issues.values()].reduce((t, a) => t + a.length, 0);
  const countOk = d.format === "commander" ? total === 100 : d.format === "casual" ? true : total >= 60 && side <= 15;
  let html = `<div class="deck-head">
    <input class="deck-name" id="deckName" value="${esc(d.name)}" aria-label="Deck name" maxlength="60" title="Click to rename">
    <button class="btn ghost sm deck-rename" type="button" id="deckRename" title="Rename this deck">✎ Rename</button>
    <span class="fmt-badge">${esc(fmtName(d.format))}</span>
    ${d.format === "commander" && ci.size ? `<span class="ci">${["W","U","B","R","G"].filter(x => ci.has(x)).map(gemSvg).join("")}</span>` : ""}
    <span class="sp"></span>
    <button class="btn" type="button" id="deckPlay" title="Shuffle up and play this deck on a virtual table">▶ Playtest</button>
    ${scanning ? `<span class="scan-badge">● Scanning into this deck</span><button class="btn" type="button" id="deckScan">Go to scanner</button><button class="btn" type="button" id="deckStop">Stop</button>` : `<button class="btn primary" type="button" id="deckScan">Scan cards into this deck</button>`}
    <button class="btn" type="button" id="deckAddHead" title="Add cards by typing their names or pasting a list">＋ Add cards</button>
  </div>
  <div class="deck-stats">
    <span class="${countOk ? "" : "warnc"}"><b>${total}</b>${d.format === "casual" ? " cards" : " / " + goal}${d.format !== "commander" && side ? ` · sideboard <b>${side}</b>/15` : ""}</span>
    <span><b>${money(deckValue(d))}</b></span>
    <span>Avg. mana value <b>${cmcN ? (cmcSum / cmcN).toFixed(2) : "—"}</b></span>
    <span class="curve" title="Mana curve (spells)">${curve.map((n, i) => `<span class="bar" style="--h:${(n / peak * 100).toFixed(0)}%" title="${i === 7 ? "7+" : i}: ${n}"><i></i><small>${i === 7 ? "7+" : i}</small></span>`).join("")}</span>
    ${nIssues ? `<span class="warnc">⚠ ${nIssues} issue${nIssues === 1 ? "" : "s"}</span>` : (total ? `<span class="okc">✓ No rule problems</span>` : "")}
    <span class="sp"></span>
    ${(g => `<button class="btn ghost" type="button" id="deckColl" title="${g.nMissing ? `${g.nMissing} of its cards aren't in your collection` : "Every card is in your collection. Click to add all of them anyway"}">${g.nMissing ? `＋ Add to collection<span class="coll-n">${g.nMissing}</span>` : "✓ In your collection · add all?"}</button>`)(deckCollGap(d))}
    ${deckConfirmDel ? `<button class="btn danger-btn" type="button" id="deckDelYes">Delete “${esc(d.name)}”</button><button class="btn ghost" type="button" id="deckDelNo">Keep it</button>` : `<button class="btn ghost" type="button" id="deckDel">Delete deck</button>`}
  </div>`;
  if (deckCollOpen) {
    const g = deckCollGap(d), list = prefs.list && prefs.list !== "Decks" ? prefs.list : "Collection";
    html += `<div class="deck-coll" id="deckCollBox"><p>${g.nMissing ? `<b>${g.nMissing}</b> of this deck's ${g.nAll} cards aren't in your collection: ${esc(g.missing.slice(0, 12).map(m => (m.qty > 1 ? m.qty + "× " : "") + m.name).join(", "))}${g.missing.length > 12 ? "…" : ""}` : `Every card in this deck is already in your collection.`}</p>
      <p class="cur-sub">They go into <b>${esc(list)}</b>, condition ${esc(prefs.cond || "NM")}. Cards are matched by name, so copies you already own aren't added twice.</p>
      <div class="row">${g.nMissing ? `<button class="btn primary" type="button" id="deckCollMissing">Add the ${g.nMissing} missing</button>` : ""}<button class="btn" type="button" id="deckCollAll" title="For a deck with its own copies of every card">Add all ${g.nAll} cards, even ones I already own</button><button class="btn ghost" type="button" id="deckCollNo">Cancel</button></div></div>`;
  }
  if (d.format !== "commander" && scanning) html += `<div class="board-pick">Scanning into <label class="chk"><input type="radio" name="deckBoard" value="main" ${prefs.deckBoard !== "side" ? "checked" : ""}> Main deck</label><label class="chk"><input type="radio" name="deckBoard" value="side" ${prefs.deckBoard === "side" ? "checked" : ""}> Sideboard</label></div>`;
  if (d.format === "commander" && !d.commanders.length) {
    html += `<div class="step-banner"><b>Step 1 of 2: your commander.</b> ${scanning ? "Hold your commander up to the camera." : "Click “Scan into this deck”, then hold your commander up to the camera."} No webcam? Click <b>＋ Add cards</b> and type its name.</div>`;
  } else if (d.format === "commander" && total < 100) {
    html += `<div class="step-banner soft"><b>Step 2 of 2: the other ${100 - d.commanders.length} cards.</b> ${scanning ? "Scan each card. Basic lands: scan one, then press R for each extra copy." : "Click “Scan into this deck” to keep going."}${d.commanders.length === 1 && pairsWithAnother(d.commanders[0]) ? ` <button class="linkish" type="button" id="deckSecond">${wantSecondCommander ? "Waiting for your second commander…" : "Add a second commander (partner or background)"}</button>` : ""}</div>`;
  }
  const row = (c, zone) => {
    const iss = issues.get(c.sid + "|" + (zone === "commander" ? "commander" : c.board)) || [];
    const u = unitVal(c);
    return `<div class="drow ${iss.length ? "bad" : ""}" data-sid="${esc(c.sid)}" data-board="${zone}" data-foil="${c.foil ? 1 : 0}">
      ${zone === "commander" ? `<span class="qbadge">★</span>` : `<span class="step"><button type="button" data-dq="-1" aria-label="Remove one">−</button><span>${c.qty}</span><button type="button" data-dq="1" aria-label="Add one">+</button></span>`}
      <div class="nm"><b>${esc(c.name)}</b>${c.foil ? ' <span class="foil">★</span>' : ""}<small>${esc(c.set)} · ${esc(c.number)}${c.cost ? " · " + costGems(c.cost) : c.cmc != null && mainType(c) !== "Land" ? " · MV " + c.cmc : ""}${iss.length ? ` · <span class="warnc">⚠ ${esc(iss.join(". "))}</span>` : ""}</small></div>
      <span class="num">${u ? money(u * (c.qty || 1)) : "—"}</span>
      <span class="dacts">
        ${zone === "commander" ? `<button class="linkish" type="button" data-act="uncmd">Move to deck</button>`
          : d.format === "commander" ? (canCommand(c) && d.commanders.length < 2 ? `<button class="linkish" type="button" data-act="cmd">Make commander</button>` : "")
          : `<button class="linkish" type="button" data-act="${c.board === "main" ? "toSide" : "toMain"}">${c.board === "main" ? "To sideboard" : "To main"}</button>`}
        <button class="linkish" type="button" data-act="replace">Replace</button>
        <button class="x" type="button" data-act="rm" aria-label="Remove ${esc(c.name)}" title="Remove">×</button>
      </span>
    </div>`;
  };
  const tile = (c, zone) => {
    const iss = issues.get(c.sid + "|" + (zone === "commander" ? "commander" : c.board)) || [];
    const u = unitVal(c);
    return `<div class="dtile ${iss.length ? "bad" : ""}" data-sid="${esc(c.sid)}" data-board="${zone}" data-foil="${c.foil ? 1 : 0}">
      <button type="button" class="dpic" data-act="edit" title="${esc(c.name)}: click to change printing or foil">
        <img loading="lazy" src="${esc(bigImg(c))}" alt="${esc(c.name)}" onerror="this.parentNode.classList.add('noimg')"><em>${esc(c.name)}</em>
        ${c.foil ? '<span class="foilfx" aria-hidden="true"></span><span class="fbadge">★ Foil</span>' : ""}
        ${zone === "commander" ? '<span class="cbadge">Commander</span>' : (c.qty > 1 ? `<span class="qbig">×${c.qty}</span>` : "")}
        ${iss.length ? `<span class="wbadge" aria-hidden="true">⚠</span>` : ""}
      </button>
      <div class="dmeta"><span class="chip">${esc(c.set)} · ${esc(c.number)}${c.lang && c.lang !== "en" ? " · " + esc(c.lang.toUpperCase()) : ""}</span><span>${u ? money(u * (c.qty || 1)) : "—"}</span></div>
      ${iss.length ? `<div class="dwarn">⚠ ${esc(iss.join(". "))}</div>` : ""}
      <div class="dtools">
        ${zone === "commander" ? `<button class="linkish" type="button" data-act="uncmd">Move to deck</button>`
          : `<span class="step"><button type="button" data-dq="-1" aria-label="Remove one">−</button><span>${c.qty}</span><button type="button" data-dq="1" aria-label="Add one">+</button></span>`}
        <button class="linkish" type="button" data-act="edit">Edit</button>
        <button class="linkish" type="button" data-act="replace">Replace</button>
        ${zone === "commander" ? "" : d.format === "commander" ? (canCommand(c) && d.commanders.length < 2 ? `<button class="linkish" type="button" data-act="cmd">Make commander</button>` : "")
          : `<button class="linkish" type="button" data-act="${c.board === "main" ? "toSide" : "toMain"}">${c.board === "main" ? "To sideboard" : "To main"}</button>`}
        <button class="x" type="button" data-act="rm" aria-label="Remove ${esc(c.name)}" title="Remove">×</button>
      </div>
    </div>`;
  };
  box.innerHTML = html;
  // cards: grouped, as big pictures or a compact list
  const find = ($("deckFind").value || "").trim().toLowerCase();
  const pass = c => !find || c.name.toLowerCase().includes(find) || (c.type || "").toLowerCase().includes(find);
  const groups = deckGroups(d, prefs.deckGroup || "type").map(g => Object.assign(g, {cards: g.cards.filter(x => pass(x.c))})).filter(g => g.cards.length);
  const lay = ["pics", "stacks", "text", "list"].includes(prefs.deckLayout) ? prefs.deckLayout : "pics";
  $("deckViewBar").hidden = !(d.commanders.length || d.cards.length);
  const head = g => `<h3 class="dgroup-title">${esc(g.title)} (${g.cards.reduce((n, x) => n + (x.c.qty || 1), 0)})</h3>`;
  const issuesOf = (c, zone) => issues.get(c.sid + "|" + (zone === "commander" ? "commander" : c.board)) || [];
  const attrs = (c, zone) => `data-sid="${esc(c.sid)}" data-board="${zone}" data-foil="${c.foil ? 1 : 0}" data-act="edit" data-preview="${esc(bigImg(c))}"`;
  // Moxfield-style stacks: only each card's name bar shows; hover lifts the whole card
  const stackCard = (c, zone) => { const iss = issuesOf(c, zone); return `<button type="button" class="scard ${iss.length ? "bad" : ""}" ${attrs(c, zone)} title="${esc(c.name)}${iss.length ? " ⚠ " + esc(iss.join(". ")) : ""}">
      <img loading="lazy" src="${esc(bigImg(c))}" alt="${esc(c.name)}" onerror="this.parentNode.classList.add('noimg')"><em>${esc(c.name)}</em>
      ${c.foil ? '<span class="foilfx" aria-hidden="true"></span>' : ""}${(c.qty || 1) > 1 ? `<span class="sq">×${c.qty}</span>` : ""}${iss.length ? '<span class="sw">⚠</span>' : ""}</button>`; };
  // Moxfield-style text: quantity, name, cost; hover shows the card
  const costText = c => c.cost ? c.cost.replace(/\{([^}]*)\}/g, "$1").replace(/\/\//g, " // ") : (mainType(c) !== "Land" && c.cmc != null ? String(c.cmc) : "");
  const tline = (c, zone) => { const iss = issuesOf(c, zone), u = unitVal(c); return `<button type="button" class="tline ${iss.length ? "bad" : ""}" ${attrs(c, zone)}>
      <span class="tq">${zone === "commander" ? "★" : c.qty}</span><span class="tn">${esc(c.name)}${c.foil ? ' <span class="foil" title="Foil">★</span>' : ""}${iss.length ? ` <span class="warnc" title="${esc(iss.join(". "))}">⚠</span>` : ""}</span>
      <span class="tc">${c.cost ? costGems(c.cost) : esc(costText(c))}</span><span class="tp">${u ? money(u * (c.qty || 1)) : ""}</span></button>`; };
  let cards;
  if (lay === "pics") cards = `<div class="dsecs" style="--tile:${prefs.tileSize || 220}px">${groups.map(g => `<section class="dsec" style="--n:${g.cards.length}">${head(g)}<div class="dgrid">${g.cards.map(x => tile(x.c, x.zone)).join("")}</div></section>`).join("")}</div>`;
  else if (lay === "stacks") cards = `<div class="ssecs" style="--tile:${prefs.tileSize || 220}px">${groups.map(g => `<section class="ssec">${head(g)}<div class="stack">${g.cards.map(x => stackCard(x.c, x.zone)).join("")}</div></section>`).join("")}</div>`;
  else if (lay === "text") cards = `<div class="tcols">${groups.map(g => `<section class="tsec">${head(g)}${g.cards.map(x => tline(x.c, x.zone)).join("")}</section>`).join("")}</div>`;
  else cards = groups.map(g => head(g) + `<div class="dgroup">${g.cards.map(x => row(x.c, x.zone)).join("")}</div>`).join("");
  if (!cards && find) cards = `<div class="empty">No cards in this deck match “${esc(find)}”.</div>`;
  if (!d.commanders.length && !d.cards.length && d.format !== "commander") cards = `<div class="empty">${scanning ? "Scan your first card on the Scanner tab." : "Click “Scan cards into this deck” and start scanning."}</div>`;
  $("deckCards").innerHTML = cards;
  if (simState && simState.deckId === d.id && simState.sig !== simSig(d)) simState.stale = true;
  renderSim();
  if (fwState && fwState.res && fwState.deckId === (prefs.deckView || "") && fwState.sig !== simSig(deckById(prefs.deckView))) fwState.stale = true;
  renderFast(); renderDeckCheck(); if (typeof applyDeckTab === "function") applyDeckTab();
  renderCombos("deck");
  renderDeckExport();
  renderDeckStrip();
}
const bigImg = c => c.imgN || (c.img || "").replace("/small/", "/normal/");
function deckGroups(d, by){
  const out = [];
  if (d.commanders.length) out.push({title: d.commanders.length > 1 ? "Commanders" : "Commander", cards: d.commanders.map(c => ({c, zone: "commander"}))});
  const main = d.cards.filter(c => c.board === "main"), side = d.cards.filter(c => c.board === "side");
  const byMv = (a, b) => (a.cmc ?? 99) - (b.cmc ?? 99) || a.name.localeCompare(b.name), byName = (a, b) => a.name.localeCompare(b.name);
  const push = (title, list, sort) => { if (list.length) out.push({title, cards: list.sort(sort).map(c => ({c, zone: c.board}))}); };
  if (by === "none") push("All cards", main, byName);
  else if (by === "mv") {
    const spells = main.filter(c => mainType(c) !== "Land");
    for (let v = 0; v <= 7; v++) push(v === 7 ? "Mana value 7+" : "Mana value " + v, spells.filter(c => (v === 7 ? (c.cmc ?? 0) >= 7 : Math.floor(c.cmc ?? 0) === v)), byName);
    push("Lands", main.filter(c => mainType(c) === "Land"), byName);
  } else if (by === "color") {
    const nonLand = main.filter(c => mainType(c) !== "Land"), key = c => { const k = c.colors || []; return k.length === 0 ? "C" : k.length > 1 ? "M" : k[0]; };
    for (const [k, t] of [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["M", "Multicolor"], ["C", "Colorless"]]) push(t, nonLand.filter(c => key(c) === k), byMv);
    push("Lands", main.filter(c => mainType(c) === "Land"), byName);
  } else for (const t of TYPE_ORDER) push(t === "Other" ? "Other" : t === "Sorcery" ? "Sorceries" : t + "s", main.filter(c => mainType(c) === t), byMv);
  push("Sideboard", side, byName);
  return out;
}
function renderDeckStrip(){
  const d = activeDeck(), el = $("deckStrip"); if (!el) return;
  el.hidden = !d; if (!d) return;
  const goal = d.format === "commander" ? 100 : 60;
  el.innerHTML = `<span>Scanning into <b>${esc(d.name)}</b> · ${deckCount(d)} / ${goal}</span>${needsCommander(d) ? `<span class="warnc">${wantSecondCommander ? "Scan your second commander" : "Step 1: scan your commander first"}</span>` : ""}
    <span class="sp"></span><button class="linkish" type="button" data-strip="open">Open in deck builder</button><button class="linkish" type="button" data-strip="stop">Stop</button>`;
}
$("deckStrip").addEventListener("click", e => {
  const b = e.target.closest("[data-strip]"); if (!b) return;
  if (b.dataset.strip === "open") { prefs.deckView = prefs.deckId; showPage("builder"); }
  else setScanTarget(null);
});
// The collection has its own page; the export bar goes with whichever of the scanner or collection is showing
const expHome = {parent: $("expBar").parentNode, next: $("expBar").nextSibling};
const PAGES = {scanner: ["scanPage", "pgScan"], collection: ["collPage", "pgColl"], builder: ["builderPage", "pgBuild"], search: ["searchPage", "pgSearch"], game: ["gamePage", "pgGame"]};
function showPage(pg){
  prefs.page = PAGES[pg] ? pg : "scanner";
  for (const [k, [m, t]] of Object.entries(PAGES)) { $(m).hidden = k !== prefs.page; $(t).setAttribute("aria-selected", k === prefs.page); }
  if (prefs.page === "search") { savePrefs(); return renderSearch(); }
  if (prefs.page === "game") { savePrefs(); return renderGame(); }
  if (prefs.page === "scanner" || prefs.page === "collection") prefs.view = prefs.page === "collection" ? "collection" : "session";
  savePrefs();
  $("scanPage").hidden = prefs.page !== "scanner"; $("collPage").hidden = prefs.page !== "collection"; $("builderPage").hidden = prefs.page !== "builder";
  $("pgScan").setAttribute("aria-selected", prefs.page === "scanner"); $("pgColl").setAttribute("aria-selected", prefs.page === "collection"); $("pgBuild").setAttribute("aria-selected", prefs.page === "builder");
  $("sessView").classList.remove("hide"); $("collView").classList.remove("hide");
  if (prefs.page === "collection") $("collPage").append($("expBar")); else if ($("expBar").parentNode !== expHome.parent) expHome.parent.insertBefore($("expBar"), expHome.next);
  if (typeof renderExpScope === "function" && prefs.page !== "builder") renderExpScope();
  $("expBar").hidden = false;
  if (prefs.page === "builder") renderDeck(); else if (prefs.page === "collection") { renderColl(); if (typeof applyCollTab === "function") applyCollTab(); } else layoutGuide();
}
$("pgScan").onclick = () => showPage("scanner");
$("pgColl").onclick = () => showPage("collection");
$("pgSearch").onclick = () => showPage("search");
$("pgGame").onclick = () => showPage("game");
$("pgBuild").onclick = () => showPage("builder");
// view controls
$("deckViewBar").addEventListener("click", e => {
  const b = e.target.closest("[data-lay]"); if (!b) return;
  prefs.deckLayout = b.dataset.lay; savePrefs();
  $("deckViewBar").querySelectorAll("[data-lay]").forEach(x => x.setAttribute("aria-pressed", x.dataset.lay === prefs.deckLayout));
  $("tileSizeWrap").hidden = !["pics", "stacks"].includes(prefs.deckLayout); hideHover(); renderDeck();
});
$("tileSize").value = prefs.tileSize || 220;
$("tileSize").oninput = e => { prefs.tileSize = +e.target.value; savePrefs(); document.querySelectorAll(".dsecs,.ssecs").forEach(g => g.style.setProperty("--tile", prefs.tileSize + "px")); };
$("deckGroup").value = prefs.deckGroup || "type";
$("deckGroup").onchange = e => { prefs.deckGroup = e.target.value; savePrefs(); renderDeck(); };
$("deckFind").oninput = () => renderDeck();
$("deckViewBar").querySelectorAll("[data-lay]").forEach(x => x.setAttribute("aria-pressed", x.dataset.lay === (prefs.deckLayout || "pics")));
$("tileSizeWrap").hidden = !["pics", "stacks", undefined].includes(prefs.deckLayout);
// card picture that follows the mouse in the Text and Stacks layouts, like Moxfield
const canHover = matchMedia("(hover: hover)").matches;
function hideHover(){ $("hoverCard").hidden = true; }
$("deckCards").addEventListener("mouseover", e => {
  if (!canHover || prefs.deckLayout !== "text") return;
  const t = e.target.closest("[data-preview]"); if (!t) return;
  const h = $("hoverCard"); if (h.getAttribute("src") !== t.dataset.preview) h.src = t.dataset.preview; h.hidden = false;
});
$("deckCards").addEventListener("mousemove", e => {
  const h = $("hoverCard"); if (h.hidden) return;
  const w = 250, hh = w * 680 / 488, x = e.clientX + 24 + w > innerWidth ? e.clientX - w - 24 : e.clientX + 24;
  h.style.left = Math.max(8, x) + "px"; h.style.top = Math.max(8, Math.min(innerHeight - hh - 8, e.clientY - hh / 2)) + "px";
});
$("deckCards").addEventListener("mouseout", e => { const t = e.target.closest("[data-preview]"); if (t && !t.contains(e.relatedTarget)) hideHover(); });
$("deckCards").addEventListener("click", hideHover);
function targetLabel(){
  const d = activeDeck();
  if (!d) return "Add to " + prefs.list;
  return needsCommander(d) ? (wantSecondCommander ? "Set as second commander" : "Set as commander") : "Add to " + d.name;
}
function setScanTarget(deckId){
  prefs.deckId = deckId || null; savePrefs(); wantSecondCommander = false; deckConfirmDel = false;
  renderLists(); renderDeck(); renderCurrent();
  const d = activeDeck();
  setStatus(d ? (needsCommander(d) ? `Scanning into ${d.name}. Start with your commander.` : `Scanning into ${d.name}.`) : `Scanning into ${prefs.list}.`, "ok");
}
function deckClick(e){
  const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
  if (e.target.closest("#deckPlay")) return openPlaytest(d);
  if (e.target.closest("#deckScan")) { setScanTarget(d.id); return showPage("scanner"); }
  if (e.target.closest("#deckStop")) { setScanTarget(null); if (!prefs.deckAlsoColl) offerDeckColl(d, "Stopped scanning."); return; }
  if (e.target.closest("#deckAddHead")) return openReplace({deckId: d.id, add: true});
  if (e.target.closest("#deckRename")) { const i = $("deckName"); i.focus(); i.select(); return; }
  if (e.target.closest("#deckColl")) { deckCollOpen = !deckCollOpen; return renderDeck(); }
  if (e.target.closest("#deckCollNo")) { deckCollOpen = false; return renderDeck(); }
  if (e.target.closest("#deckCollMissing")) return deckToColl(d, false);
  if (e.target.closest("#deckCollAll")) return deckToColl(d, true);
  if (e.target.closest("#deckDel")) { deckConfirmDel = true; return renderDeck(); }
  if (e.target.closest("#deckDelNo")) { deckConfirmDel = false; return renderDeck(); }
  if (e.target.closest("#deckDelYes")) {
    const i = decks.indexOf(d); decks.splice(i, 1); deckConfirmDel = false; if (prefs.deckId === d.id) prefs.deckId = null; prefs.deckView = decks[0] ? decks[0].id : null;
    saveDecks(); savePrefs(); renderLists(); renderDeck(); renderCurrent();
    return toast(`Deleted ${d.name}`, "Undo", () => { decks.splice(i, 0, d); prefs.deckView = d.id; saveDecks(); savePrefs(); renderLists(); renderDeck(); });
  }
  if (e.target.closest("#deckSecond")) { wantSecondCommander = !wantSecondCommander; if (wantSecondCommander && prefs.deckId !== d.id) setScanTarget(d.id); renderDeck(); renderCurrent(); if (wantSecondCommander) setStatus("Scan or type your second commander.", ""); return; }
  const rowEl = e.target.closest("[data-sid]"); if (!rowEl) return;
  const sid = rowEl.dataset.sid, zone = rowEl.dataset.board, foil = rowEl.dataset.foil === "1";
  const card = zone === "commander" ? d.commanders.find(c => c.sid === sid) : d.cards.find(c => c.sid === sid && !!c.foil === foil && c.board === zone);
  if (!card) return;
  const q = e.target.closest("button[data-dq]"), act = e.target.closest("button[data-act]");
  if (act && act.dataset.act === "edit") return openEditor({kind: "deck", deckId: d.id, card, zone});
  if (act && act.dataset.act === "replace") return openReplace({deckId: d.id, sid, zone, foil});
  const snapshot = JSON.stringify(d);
  const restore = () => { Object.assign(d, JSON.parse(snapshot)); saveDecks(); renderDeck(); };
  if (q) { card.qty += Number(q.dataset.dq); if (card.qty <= 0) { d.cards.splice(d.cards.indexOf(card), 1); toast(`Removed ${card.name}`, "Undo", restore); } }
  else if (act) {
    const a = act.dataset.act;
    if (a === "rm") { if (zone === "commander") d.commanders.splice(d.commanders.indexOf(card), 1); else d.cards.splice(d.cards.indexOf(card), 1); toast(`Removed ${card.name}`, "Undo", restore); }
    if (a === "cmd") { card.qty -= 1; if (card.qty <= 0) d.cards.splice(d.cards.indexOf(card), 1); d.commanders.push(Object.assign({}, card, {qty: 1, board: "commander"})); }
    if (a === "uncmd") { d.commanders.splice(d.commanders.indexOf(card), 1); d.cards.push(Object.assign({}, card, {qty: 1, board: "main"})); }
    if (a === "toSide" || a === "toMain") {
      const to = a === "toSide" ? "side" : "main"; card.qty -= 1; if (card.qty <= 0) d.cards.splice(d.cards.indexOf(card), 1);
      const ex = d.cards.find(c => c.sid === card.sid && c.board === to && c.foil === card.foil); if (ex) ex.qty += 1; else d.cards.push(Object.assign({}, card, {qty: 1, board: to}));
    }
  }
  d.updated = Date.now(); saveDecks(); renderDeck(); renderCurrent();
}
$("deckBody").addEventListener("click", deckClick);
$("deckAddCard").addEventListener("click", () => { const d = prefs.deckView && deckById(prefs.deckView); if (d) openReplace({deckId: d.id, add: true}); });
$("deckCards").addEventListener("click", deckClick);
$("deckBody").addEventListener("change", e => {
  const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
  if (e.target.id === "deckName") { const old = d.name; d.name = e.target.value.trim() || "Untitled deck"; e.target.value = d.name; d.updated = Date.now(); saveDecks(); renderDeckPicker(); renderLists(); renderCurrent(); if (old !== d.name) toast(`Renamed to “${d.name}”`, "Undo", () => { d.name = old; saveDecks(); renderDeckPicker(); renderLists(); renderDeck(); renderCurrent(); }); }
  if (e.target.name === "deckBoard") { prefs.deckBoard = e.target.value; savePrefs(); setStatus(prefs.deckBoard === "side" ? "Scanning into the sideboard." : "Scanning into the main deck.", ""); }
});
$("deckBody").addEventListener("keydown", e => { if (e.target.id === "deckName" && (e.key === "Enter" || e.key === "Escape")) { if (e.key === "Escape") { const d = deckById(prefs.deckView); if (d) e.target.value = d.name; } e.target.blur(); } });
$("deckSel").onchange = e => { comboState.deck = null; deckCollOpen = false; prefs.deckView = e.target.value; prefs.deckFormOpen = false; deckConfirmDel = false; savePrefs(); renderDeck(); };
$("deckNewBtn").onclick = () => { prefs.deckFormOpen = true; $("deckNewForm").hidden = false; $("deckNewName").focus(); };
$("deckNewForm").addEventListener("submit", e => {
  e.preventDefault();
  const d = newDeck($("deckNewName").value.trim(), $("deckNewFmt").value);
  $("deckNewName").value = ""; prefs.deckFormOpen = false; prefs.deckView = d.id; savePrefs();
  setScanTarget(d.id); showPage("scanner");
});
