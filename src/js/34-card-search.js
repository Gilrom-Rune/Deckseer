/* ================= Card search (all of Magic, through Scryfall) ================= */
const srch = {q: "", text: "", type: "", colors: [], cmode: "id", mvMin: "", mvMax: "", fmt: "", order: "edhrec", results: [], total: 0, next: null, busy: false, msg: "", deck: ""};
function srchQuery(){
  const p = [];
  const q = srch.q.trim();
  if (q) p.push(q);
  if (srch.text.trim()) p.push(`o:"${srch.text.trim().replace(/"/g, "")}"`);
  if (srch.type.trim()) for (const w of srch.type.trim().split(/\s+/)) p.push(`t:${w}`);
  if (srch.colors.length) p.push(srch.cmode === "id" ? `id<=${srch.colors.join("")}` : srch.cmode === "exact" ? `c=${srch.colors.join("")}` : `c>=${srch.colors.join("")}`);
  if (srch.mvMin !== "") p.push(`mv>=${+srch.mvMin}`);
  if (srch.mvMax !== "") p.push(`mv<=${+srch.mvMax}`);
  if (srch.fmt) p.push(`f:${srch.fmt}`);
  return p.join(" ");
}
async function runSearch(more){
  const q = srchQuery();
  if (!q) { srch.msg = "Type a name or pick some filters first."; return renderSearch(); }
  srch.busy = true; srch.msg = ""; if (!more) { srch.results = []; srch.next = null; } renderSearch();
  try {
    let j;
    if (more && srch.next) { const r = await fetch(srch.next); j = await r.json(); }
    else j = await sf(`/cards/search?unique=cards&order=${srch.order}&q=${encodeURIComponent(q)}`);
    if (j.object === "error") { srch.msg = j.code === "not_found" ? "No cards match." : (j.details || "Scryfall didn't understand that search."); }
    else { srch.results = srch.results.concat((j.data || []).map(slimCard)); srch.total = j.total_cards || srch.results.length; srch.next = j.has_more ? j.next_page : null; }
  } catch (e) { console.warn(e); srch.msg = "Couldn't reach Scryfall. Check your internet connection."; }
  srch.busy = false; renderSearch();
}
function renderSearch(){
  const box = $("searchView"); if (!box) return;
  const owned = new Map(); for (const e of coll.values()) owned.set(e.name, (owned.get(e.name) || 0) + e.qty);
  const wished = new Set(wish.map(w => w.name));
  if (!srch.deck || !deckById(srch.deck)) srch.deck = prefs.deckView || (decks[0] && decks[0].id) || "";
  const cols = [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["C", "Colorless"]];
  const focus = document.activeElement && document.activeElement.id;
  box.innerHTML = `<div class="sim-head"><h3>Card search</h3><span class="cur-sub">Every Magic card, from Scryfall. Add what you find to your collection, a deck or your wishlist.</span></div>
    <form class="srch-form" id="srchForm" onsubmit="return false">
      <label class="field grow">Name or Scryfall search <input type="search" id="srQ" value="${esc(srch.q)}" placeholder="Llanowar, or t:elemental o:landfall" autocomplete="off"></label>
      <label class="field grow">Rules text contains <input type="search" id="srText" value="${esc(srch.text)}" placeholder="enters, draw a card"></label>
      <label class="field">Type <input type="text" id="srType" value="${esc(srch.type)}" placeholder="creature elemental" style="width:150px"></label>
      <div class="field"><span>Colours</span><div class="srch-cols">${cols.map(([k, n]) => `<button type="button" class="srch-col" data-scol="${k}" aria-pressed="${srch.colors.includes(k)}" title="${n}"><span class="dc-pip" style="background:var(--pip-${k.toLowerCase()})"></span>${k}</button>`).join("")}
        <select id="srCmode" aria-label="How colours match"><option value="id" ${srch.cmode === "id" ? "selected" : ""}>Fits these colours</option><option value="has" ${srch.cmode === "has" ? "selected" : ""}>Includes these</option><option value="exact" ${srch.cmode === "exact" ? "selected" : ""}>Exactly these</option></select></div></div>
      <label class="field">Mana value <span class="srch-mv"><input type="number" id="srMin" min="0" max="20" value="${esc(srch.mvMin)}" placeholder="min"> – <input type="number" id="srMax" min="0" max="20" value="${esc(srch.mvMax)}" placeholder="max"></span></label>
      <label class="field">Legal in <select id="srFmt"><option value="">Any format</option>${["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "brawl"].map(f => `<option value="${f}" ${srch.fmt === f ? "selected" : ""}>${f[0].toUpperCase() + f.slice(1)}</option>`).join("")}</select></label>
      <label class="field">Sort <select id="srOrder">${[["edhrec", "Most played"], ["name", "Name"], ["usd", "Price"], ["cmc", "Mana value"], ["released", "Newest"]].map(([v, l]) => `<option value="${v}" ${srch.order === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="btn primary" type="button" id="srGo" ${srch.busy ? "disabled" : ""}>${srch.busy ? "Searching…" : "Search"}</button>
    </form>
    ${srch.results.length ? `<div class="srch-bar"><span class="cur-sub">${srch.total.toLocaleString()} card${srch.total === 1 ? "" : "s"} · showing ${srch.results.length}</span>
      <label class="inline-field">Add to deck <select id="srDeck">${decks.map(d => `<option value="${esc(d.id)}" ${d.id === srch.deck ? "selected" : ""}>${esc(d.name)}</option>`).join("") || `<option value="">No decks yet</option>`}</select></label></div>` : ""}
    ${srch.msg ? `<p class="cur-sub">${esc(srch.msg)}</p>` : ""}
    <div class="srch-grid">${srch.results.map((p, i) => `<div class="srch-card">
      <img loading="lazy" src="${esc(p.imgN || p.img)}" alt="${esc(p.name)}" onerror="this.classList.add('noimg')">
      <div class="srch-meta"><b>${esc(p.name)}</b><span class="cur-sub">${p.usd ? money(+p.usd, "usd") : "—"}${owned.get(p.name) ? ` · <span class="own">you own ${owned.get(p.name)}</span>` : ""}</span></div>
      <div class="srch-acts"><button class="btn sm" type="button" data-sadd="coll" data-i="${i}">+ Collection</button><button class="btn sm" type="button" data-sadd="deck" data-i="${i}" ${decks.length ? "" : "disabled"}>+ Deck</button><button class="btn sm" type="button" data-sadd="wish" data-i="${i}" ${wished.has(p.name) ? "disabled" : ""}>${wished.has(p.name) ? "♥ Wished" : "♡ Wishlist"}</button></div>
    </div>`).join("")}</div>
    ${srch.next ? `<button class="btn" type="button" id="srMore" ${srch.busy ? "disabled" : ""}>Show more</button>` : ""}
    <p class="cur-sub">Tip: the name box understands Scryfall's search words too, like <span class="mono">t:elemental o:"enters"</span> or <span class="mono">is:gamechanger</span>.</p>`;
  if (focus && $(focus) && /^sr/.test(focus)) { const el = $(focus); el.focus(); if (el.setSelectionRange && el.type !== "number") try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
}
$("searchView").addEventListener("input", e => {
  const m = {srQ: "q", srText: "text", srType: "type", srMin: "mvMin", srMax: "mvMax"}[e.target.id]; if (m) srch[m] = e.target.value;
});
$("searchView").addEventListener("change", e => {
  const m = {srCmode: "cmode", srFmt: "fmt", srOrder: "order", srDeck: "deck"}[e.target.id]; if (m) srch[m] = e.target.value;
  if (e.target.id === "srOrder" && srch.results.length) runSearch();
});
$("searchView").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest("#srchForm") && e.target.tagName === "INPUT") { e.preventDefault(); runSearch(); } });
$("searchView").addEventListener("click", e => {
  if (e.target.closest("#srGo")) return runSearch();
  if (e.target.closest("#srMore")) return runSearch(true);
  const c = e.target.closest("[data-scol]"); if (c) { const k = c.dataset.scol; srch.colors = srch.colors.includes(k) ? srch.colors.filter(x => x !== k) : srch.colors.concat(k); return renderSearch(); }
  const a = e.target.closest("[data-sadd]"); if (!a) return;
  const p = srch.results[+a.dataset.i]; if (!p) return;
  if (a.dataset.sadd === "coll") { putEntry(entryFrom(p, false, prefs.cond, prefs.list === "Decks" ? "Collection" : prefs.list || "Collection", 1)); saveColl(); renderColl(); toast(`Added ${p.name} to your collection`); renderSearch(); }
  if (a.dataset.sadd === "deck") { const d = deckById(srch.deck); if (!d) return toast("Make a deck first."); const r = addToDeck(d, p, false, 1); toast(r.msg); if (prefs.page === "builder") renderDeck(); }
  if (a.dataset.sadd === "wish") { addWish(p); renderSearch(); }
});

