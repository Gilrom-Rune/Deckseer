/* ---------------- import a deck list (Moxfield, Archidekt, Arena, MTGO, plain text) ---------------- */
const SECTION_RE = /^(?:\/\/\s*)?(commanders?|companion|deck|main ?(?:deck|board)?|sideboard|side|maybe ?board|maybe|considering|tokens?|attractions|stickers)\b[^a-z]*$/i;
function parseDeckList(text){
  const out = [], skipped = []; let section = null, sawBlankAfterCards = false, cardsSoFar = 0;
  const lines = String(text).replace(/\r/g, "").split("\n");
  for (let raw of lines) {
    let line = raw.trim();
    if (!line) { if (cardsSoFar) sawBlankAfterCards = true; continue; }
    if (/^SIDEBOARD:?$/i.test(line)) { section = "side"; continue; }
    const sec = line.match(SECTION_RE);
    if (sec) { const w = sec[1].toLowerCase(); section = /^command/.test(w) ? "commander" : /^side/.test(w) ? "side" : /^(deck|main)/.test(w) ? "main" : /^companion/.test(w) ? "side" : "skip"; sawBlankAfterCards = false; continue; }
    if (/^(\/\/|#)/.test(line) || /^name\s/i.test(line) || /^about$/i.test(line)) continue;
    // strip tags and markers sites add: Archidekt [Ramp], Moxfield #tags, TappedOut *CMDR*, foil markers
    let foil = false, cmdr = false;
    if (/\*CMDR\*/i.test(line)) { cmdr = true; line = line.replace(/\*CMDR\*/ig, ""); }
    if (/\*[FE]\*|\(foil\)|\[foil\]|\bfoil$/i.test(line)) { foil = true; line = line.replace(/\*[FE]\*|\(foil\)|\[foil\]|\bfoil$/ig, ""); }
    line = line.replace(/\s\[[^\]]*\]/g, "").replace(/\s\^[^^]*\^/g, "").replace(/\s#\S.*$/, "").replace(/\s\*[A-Z]+\*/g, "").trim();
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i) || [null, "1", line];
    let qty = Math.max(1, Math.min(250, parseInt(m[1], 10) || 1)), rest = m[2].trim(), set = "", number = "";
    const sm = rest.match(/^(.*?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9★†\-]+))?\s*$/) || rest.match(/^(.*?)\s+\[([A-Za-z0-9]{2,6})(?::([A-Za-z0-9\-]+))?\]\s*$/);
    if (sm) { rest = sm[1].trim(); set = sm[2].toLowerCase(); number = (sm[3] || "").toLowerCase(); }
    rest = rest.replace(/\s+\/\/?\s+/g, " // ").replace(/\s{2,}/g, " ").trim();
    if (!rest || /^https?:/i.test(rest)) { skipped.push(raw.trim()); continue; }
    if (section === "skip") continue;
    out.push({qty, name: rest, set, number, foil, board: cmdr ? "commander" : section || "main", afterBlank: sawBlankAfterCards && !section});
    cardsSoFar++;
  }
  return {cards: out, skipped};
}
async function lookupCards(entries, progress){
  const found = new Map(), key = e => e.set && e.number ? e.set + "|" + e.number : "n|" + e.name.toLowerCase();
  const want = [...new Map(entries.map(e => [key(e), e])).values()];
  const ask = async list => {
    const missing = [];
    for (let i = 0; i < list.length; i += 75) {
      if (progress) progress(Math.min(found.size + i, want.length), want.length);
      const part = list.slice(i, i + 75);
      const j = await sf("/cards/collection", {method: "POST", headers: {"Content-Type": "application/json", Accept: "application/json"},
        body: JSON.stringify({identifiers: part.map(e => e.byName || !(e.set && e.number) ? {name: e.byName ? e.name.split(" // ")[0] : e.name} : {set: e.set, collector_number: e.number})})});
      const got = j.data || [];
      for (const e of part) {
        const nm = e.name.toLowerCase(), front = nm.split(" // ")[0];
        const c = got.find(c => !e.byName && e.set && e.number ? c.set === e.set && String(c.collector_number).toLowerCase() === e.number
          : c.name.toLowerCase() === nm || c.name.toLowerCase().split(" // ")[0] === front || (c.card_faces || []).some(f => f.name.toLowerCase() === front));
        if (c) found.set(key(e), slimCard(c)); else missing.push(e);
      }
    }
    return missing;
  };
  let miss = await ask(want);
  if (miss.length) miss = await ask(miss.map(e => Object.assign({}, e, {byName: true})));   // printing not found: any printing by name
  return {found, missing: miss, key};
}
async function importDeck(){
  const text = $("deckImpText").value, msg = $("deckImpMsg");
  if (/^\s*https?:\/\/\S+\s*$/.test(text)) { msg.textContent = "That's a link. Moxfield doesn't let other sites read decks from a link, so open the deck, choose Export, copy the list text and paste that here instead."; return; }
  const {cards, skipped} = parseDeckList(text);
  if (!cards.length) { msg.textContent = "No cards found. Paste the deck list text, one card per line, like “1 Sol Ring”."; return; }
  const btn = $("deckImpGo"); btn.disabled = true;
  try {
    const {found, missing, key} = await lookupCards(cards, (a, b) => { msg.textContent = `Looking up cards on Scryfall… ${a}/${b}`; });
    const total = cards.reduce((t, c) => t + c.qty, 0);
    let fmt = $("deckImpFmt").value;
    if (fmt === "auto") fmt = cards.some(c => c.board === "commander") || total >= 90 ? "commander" : "casual";
    const name = $("deckImpName").value.trim() || (cards.find(c => c.board === "commander") || {}).name || "Imported deck";
    const d = newDeck(name, fmt);
    // Arena and MTGO put the commander after a blank line at the end: use that if it's one or two possible commanders
    if (fmt === "commander" && !cards.some(c => c.board === "commander")) {
      const tail = cards.filter(c => c.afterBlank);
      if (tail.length && tail.length <= 2 && tail.every(c => { const p = found.get(key(c)); return p && canCommand(p); })) tail.forEach(c => c.board = "commander");
    }
    for (const e of cards) {
      const p = found.get(key(e)); if (!p) continue;
      let board = e.board;
      if (board === "commander" && fmt !== "commander") board = "main";
      if (board === "side" && fmt === "commander") board = "main";
      if (fmt !== "commander" && e.afterBlank && board === "main") board = "side";
      const foil = e.foil && (p.finishes.includes("foil") || p.finishes.includes("etched")) || !p.finishes.includes("nonfoil");
      if (board === "commander") { if (d.commanders.length < 2) { d.commanders.push(deckCardFrom(p, foil, 1, "commander")); if (e.qty > 1) d.cards.push(deckCardFrom(p, foil, e.qty - 1, "main")); continue; } board = "main"; }
      const ex = d.cards.find(c => c.sid === p.id && c.board === board && c.foil === foil);
      if (ex) ex.qty += e.qty; else d.cards.push(deckCardFrom(p, foil, e.qty, board));
    }
    d.updated = Date.now(); saveDecks();
    prefs.deckView = d.id; prefs.deckFormOpen = false; savePrefs();
    const got = deckCount(d) + sideCount(d);
    const notes = [];
    if (missing.length) notes.push(`Couldn't find ${missing.length === 1 ? "1 card" : missing.length + " cards"}: ${missing.slice(0, 8).map(e => e.name).join(", ")}${missing.length > 8 ? "…" : ""}. Check the spelling, or add ${missing.length === 1 ? "it" : "them"} by scanning.`);
    if (skipped.length) notes.push(`Skipped ${skipped.length} line${skipped.length > 1 ? "s" : ""} that weren't cards.`);
    if (fmt === "commander" && !d.commanders.length) notes.push("No commander was marked in the list: find your commander below and click “Make commander”.");
    $("deckImpText").value = ""; $("deckImpName").value = "";
    $("deckImpForm").hidden = !notes.length;
    renderDeckPicker(); renderLists(); renderDeck();
    msg.textContent = notes.join(" ");
    offerDeckColl(d, `Imported “${name}” with ${got} card${got === 1 ? "" : "s"}.`);
  } catch (e) {
    console.error(e); msg.textContent = "Couldn't reach Scryfall to look the cards up. Check your internet connection and try again.";
  } finally { btn.disabled = false; }
}
$("deckImpBtn").onclick = () => { const f = $("deckImpForm"); f.hidden = !f.hidden; $("deckImpMsg").textContent = ""; if (!f.hidden) $("deckImpText").focus(); };
$("deckImpCancel").onclick = () => { $("deckImpForm").hidden = true; };
$("deckImpForm").addEventListener("submit", e => { e.preventDefault(); importDeck(); });
$("deckAlsoColl").checked = !!prefs.deckAlsoColl;
const deckAlsoInfo = () => { $("deckAlsoCollInfo").textContent = prefs.deckAlsoColl ? "Scanned cards also go into your collection ⚙" : "Scanned cards go into the deck only ⚙"; };
deckAlsoInfo();
$("deckAlsoColl").onchange = e => { prefs.deckAlsoColl = e.target.checked; savePrefs(); deckAlsoInfo(); };
$("deckAlsoCollInfo").onclick = () => openSettings("scanSet");

/* ---------------- card editor: fix a misscan by picking the right printing, set or finish ---------------- */
let edit = null;
const finishesOf = p => p.finishes && p.finishes.length ? p.finishes : ["nonfoil"];
function asPrinting(c){   // a deck card or collection row as a printing, for when Scryfall can't be reached
  return {id: c.sid, name: c.name, set: c.set, setName: c.setName || c.set, number: c.number, rarity: c.rarity, lang: c.lang || "en", finishes: c.finishes || ["nonfoil", "foil"],
    img: c.img, imgN: bigImg(c), usd: c.usd, usdFoil: c.usdF, eur: c.eur, eurFoil: c.eurF, type: c.type, text: c.text, cmc: c.cmc, ci: c.ci, colors: c.colors, legal: c.legal, released: ""};
}
async function openEditor(target){
  let card;
  if (target.kind === "deck") card = target.card;
  else { card = coll.get(target.key); if (!card) return; }
  edit = Object.assign({}, target, {name: card.name, origSid: card.sid, foil: !!card.foil, qty: card.qty || 1, cond: card.cond || "NM", prints: [asPrinting(card)], sel: 0, loading: true, allLangs: false});
  $("edTitle").textContent = card.name;
  $("edQtyRow").hidden = target.kind === "deck" && target.zone === "commander";
  $("edCondRow").hidden = target.kind === "deck";
  $("edCond").innerHTML = condOpts(edit.cond);
  $("edNote").textContent = target.kind === "deck" ? "Changes this card in the deck only." : "Changes this card in your collection.";
  $("edRemove").hidden = target.kind !== "deck";
  renderEditor();
  const dlg = $("editDlg"); if (!dlg.open) dlg.showModal();
  await loadEditorPrints(false);
}
async function loadEditorPrints(allLangs){
  if (!edit) return;
  edit.loading = true; renderEditor();
  try {
    const prints = await getPrints(edit.name, allLangs);
    if (!edit) return;
    const keepId = edit.prints[edit.sel] ? edit.prints[edit.sel].id : edit.origSid;
    let list = prints.slice(), i = list.findIndex(p => p.id === keepId);
    if (i < 0) { list = [edit.prints[edit.sel] || edit.prints[0]].concat(list); i = 0; }
    Object.assign(edit, {prints: list, sel: i, allLangs, loading: false, failed: false});
  } catch (e) { if (edit) Object.assign(edit, {loading: false, failed: true}); }
  renderEditor();
}
function renderEditor(){
  if (!edit) return;
  const p = edit.prints[edit.sel], fins = finishesOf(p);
  const canFoil = fins.includes("foil") || fins.includes("etched"), canNormal = fins.includes("nonfoil");
  if (edit.foil && !canFoil) edit.foil = false; if (!edit.foil && !canNormal) edit.foil = true;
  $("edImg").src = p.imgN || p.img || ""; $("edImg").alt = `${p.name}, ${p.setName}`;
  $("edFoilFx").hidden = !edit.foil;
  const price = priceOf(p, edit.foil);
  $("edSub").innerHTML = `<b>${esc(p.setName)}</b> <span class="chip">${esc(p.set)} · ${esc(p.number)}</span>${p.lang && p.lang !== "en" ? ` <b class="lang">${esc(p.lang.toUpperCase())}</b>` : ""}${p.released ? " · " + esc(p.released.slice(0, 4)) : ""} · ${price ? money(price) : "no price"}${p.id !== edit.origSid ? ' · <span class="okc">changed</span>' : ""}`;
  $("edFinish").innerHTML = `<button type="button" data-fin="n" aria-pressed="${!edit.foil}" ${canNormal ? "" : "disabled"}>Normal</button><button type="button" data-fin="f" aria-pressed="${edit.foil}" ${canFoil ? "" : "disabled"}>${fins.includes("etched") && !fins.includes("foil") ? "Etched foil" : "Foil"}</button>`;
  $("edQty").value = edit.qty;
  $("edLangs").hidden = edit.allLangs;
  $("edCount").textContent = edit.loading ? "Loading printings…" : edit.failed ? "Couldn't load other printings. Check your internet connection." : `${edit.prints.length} printing${edit.prints.length === 1 ? "" : "s"}${edit.allLangs ? " in all languages" : ""}. Pick the one you have:`;
  $("edPrints").innerHTML = edit.prints.map((q, i) => `<button type="button" class="pr ${i === edit.sel ? "sel" : ""}" data-i="${i}" title="${esc(q.setName)} #${esc(q.number)}${q.released ? " (" + esc(q.released.slice(0, 4)) + ")" : ""}">
      <img loading="lazy" src="${esc(q.img)}" alt=""><span>${esc(q.set)} ${esc(q.number)}${q.lang && q.lang !== "en" ? `<b class="lang">${esc(q.lang.toUpperCase())}</b>` : ""}</span><span>${priceOf(q, edit.foil) ? money(priceOf(q, edit.foil)) : "—"}</span></button>`).join("");
  const sel = $("edPrints").querySelector(".pr.sel"); if (sel) sel.scrollIntoView({block: "nearest"});
}
$("edPrints").addEventListener("click", e => { const b = e.target.closest(".pr"); if (!b || !edit) return; edit.sel = +b.dataset.i; renderEditor(); });
$("edFinish").addEventListener("click", e => { const b = e.target.closest("[data-fin]"); if (!b || b.disabled || !edit) return; edit.foil = b.dataset.fin === "f"; renderEditor(); });
$("edLangs").onclick = () => loadEditorPrints(true);
$("edQty").onchange = e => { if (edit) edit.qty = Math.max(1, Math.min(99, parseInt(e.target.value) || 1)); };
$("edCond").onchange = e => { if (edit) edit.cond = e.target.value; };
$("editDlg").addEventListener("close", () => {
  const ed = edit, how = $("editDlg").returnValue; edit = null; if (!ed) return;
  if (how === "save") applyEdit(ed);
  else if (how === "remove" && ed.kind === "deck") {
    const d = deckById(ed.deckId); if (!d) return;
    const before = JSON.stringify(d), list = ed.zone === "commander" ? d.commanders : d.cards, i = list.indexOf(ed.card);
    if (i >= 0) list.splice(i, 1);
    d.updated = Date.now(); saveDecks(); renderDeck(); renderCurrent();
    toast(`Removed ${ed.card.name} from ${d.name}`, "Undo", () => { Object.assign(d, JSON.parse(before)); saveDecks(); renderDeck(); });
  }
});
function printingFields(p){
  return {sid: p.id, name: p.name, set: p.set, setName: p.setName, number: p.number, rarity: p.rarity, lang: p.lang, img: p.img, imgN: p.imgN || "", finishes: p.finishes,
    usd: num(p.usd), usdF: num(p.usdFoil), eur: num(p.eur), eurF: num(p.eurFoil),
    ...(p.cost != null ? {cost: p.cost} : {}), ...(p.power ? {power: p.power, toughness: p.toughness} : {}), ...(p.type ? {type: p.type} : {}), ...(p.text != null ? {text: p.text} : {}), ...(p.cmc != null ? {cmc: p.cmc} : {}), ...(p.ci ? {ci: p.ci} : {}), ...(p.colors ? {colors: p.colors} : {}), ...(p.legal && Object.keys(p.legal).length ? {legal: p.legal} : {})};
}
function applyEdit(ed){
  const p = ed.prints[ed.sel]; if (!p) return;
  if (ed.kind === "deck") {
    const d = deckById(ed.deckId); if (!d) return;
    const before = JSON.stringify(d);
    Object.assign(ed.card, printingFields(p), {foil: ed.foil}, ed.zone === "commander" ? {} : {qty: ed.qty});
    // merge with an identical card already in the same part of the deck
    if (ed.zone !== "commander") {
      const twin = d.cards.find(c => c !== ed.card && c.sid === ed.card.sid && c.board === ed.card.board && !!c.foil === !!ed.card.foil);
      if (twin) { twin.qty += ed.card.qty; d.cards.splice(d.cards.indexOf(ed.card), 1); }
    }
    d.updated = Date.now(); saveDecks(); renderDeck(); renderCurrent();
    toast(`Updated ${p.name}: ${p.set} #${p.number}${ed.foil ? ", foil" : ""}`, "Undo", () => { Object.assign(d, JSON.parse(before)); saveDecks(); renderDeck(); });
    return;
  }
  const old = coll.get(ed.key); if (!old) return;
  const snapColl = [...coll], snapSess = JSON.stringify(session.items);
  coll.delete(ed.key);
  const e2 = Object.assign({}, old, printingFields(p), {foil: ed.foil, qty: ed.qty, cond: ed.cond, updatedAt: Date.now()});
  const nk = putEntry(e2);
  for (const it of session.items) if (it.key === ed.key) Object.assign(it, {key: nk, sid: p.id, name: p.name, set: p.set, setName: p.setName, number: p.number, rarity: p.rarity, lang: p.lang, img: p.img, foil: ed.foil, cond: ed.cond, usd: unitVal(e2, "usd"), eur: unitVal(e2, "eur")});
  for (const u of undoStack) if (u.key === ed.key) u.key = nk;
  saveColl(); saveSess(); flashId = nk; renderAll();
  toast(`Updated ${p.name}: ${p.set} #${p.number}${ed.foil ? ", foil" : ""}`, "Undo", () => {
    coll.clear(); snapColl.forEach(([k, v]) => coll.set(k, v)); session.items = JSON.parse(snapSess); saveColl(); saveSess(); renderAll();
  });
}

/* ----- deck export: text for Moxfield and other sites, plus links ----- */
function deckText(d, fmt, withSet){
  const line = c => `${c.qty || 1} ${c.name}${withSet && c.set ? ` (${c.set}) ${c.number}` : ""}${withSet && c.foil ? " *F*" : ""}`;
  const simple = c => `${c.qty || 1} ${c.name}`;
  const byName = arr => arr.slice().sort((a, b) => a.name.localeCompare(b.name));
  const cmd = d.commanders, main = byName(d.cards.filter(c => c.board === "main")), side = byName(d.cards.filter(c => c.board === "side"));
  const xml = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  if (fmt === "arena" || fmt === "arenaGame") {      // Commander / Deck / Sideboard headings; the game itself only knows its own set codes
    const ln = fmt === "arenaGame" ? simple : line, parts = [];
    if (cmd.length) parts.push("Commander\n" + cmd.map(ln).join("\n"));
    parts.push("Deck\n" + main.map(ln).join("\n"));
    if (side.length) parts.push("Sideboard\n" + side.map(ln).join("\n"));
    return parts.join("\n\n") + "\n";
  }
  if (fmt === "tappedout") {                        // 1x quantities, *CMDR* marks the commander, SB: marks sideboard cards
    const tl = c => `${c.qty || 1}x ${c.name}${withSet && c.set ? ` (${c.set.toLowerCase()})` : ""}${withSet && c.foil ? " *F*" : ""}`;
    return [...cmd.map(c => tl(c) + " *CMDR*"), ...main.map(tl), ...side.map(c => "SB: " + tl(c))].join("\n") + "\n";
  }
  if (fmt === "plain") return [...cmd, ...main].map(simple).join("\n") + (side.length ? "\n\n" + side.map(simple).join("\n") : "") + "\n";
  if (fmt === "cod") {                              // Cockatrice deck file
    const z = (name, list) => list.length ? `  <zone name="${name}">\n${list.map(c => `    <card number="${c.qty || 1}" name="${xml(c.name)}"/>`).join("\n")}\n  </zone>\n` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>\n<cockatrice_deck version="1">\n  <deckname>${xml(d.name)}</deckname>\n  <comments>${xml(fmtName(d.format) + " deck made with Deckseer")}</comments>\n${z("main", [...cmd, ...main])}${z("side", side)}</cockatrice_deck>\n`;
  }
  if (fmt === "dck") {                              // Forge deck file
    const fl = c => `${c.qty || 1} ${c.name}${withSet && c.set ? "|" + c.set : ""}`;
    return `[metadata]\nName=${d.name}\n` + (cmd.length ? `[Commander]\n${cmd.map(fl).join("\n")}\n` : "") + `[Main]\n${main.map(fl).join("\n")}\n` + (side.length ? `[Sideboard]\n${side.map(fl).join("\n")}\n` : "");
  }
  // Moxfield and most deckbuilders: commander first so it's in the deck; SIDEBOARD: before sideboard cards
  return [...cmd, ...main].map(line).join("\n") + (side.length ? "\n\nSIDEBOARD:\n" + side.map(line).join("\n") : "") + "\n";
}
// Where a deck can go. Websites: copy the list and open the site. Apps: copy (or save a file) and follow the steps.
const SEND_TARGETS = [
  {id: "moxfield", name: "Moxfield", kind: "site", url: "https://moxfield.com/", fmt: "moxfield", sets: true,
    steps: ["Click “Copy & open Moxfield”.", "In Moxfield, create a new deck and choose Import.", "Paste (Ctrl+V) and import.", "Commander deck? Open your commander's card menu and choose “Set as Commander”."]},
  {id: "archidekt", name: "Archidekt", kind: "site", url: "https://archidekt.com/", fmt: "arena", sets: true,
    steps: ["Click “Copy & open Archidekt”.", "Create a new deck, then open Import.", "Paste (Ctrl+V). The Commander heading puts your commander in place."]},
  {id: "tappedout", name: "TappedOut", kind: "site", url: "https://tappedout.net/", fmt: "tappedout", sets: false,
    steps: ["Click “Copy & open TappedOut”.", "Create a new deck and paste into the decklist box.", "Your commander is already marked with *CMDR*."]},
  {id: "goldfish", name: "MTGGoldfish", kind: "site", url: "https://www.mtggoldfish.com/", fmt: "plain", sets: false,
    steps: ["Click “Copy & open MTGGoldfish”.", "Start a new deck and choose to import or paste a list.", "Paste (Ctrl+V). Sideboard cards come after the blank line."]},
  {id: "deckstats", name: "Deckstats", kind: "site", url: "https://deckstats.net/", fmt: "arena", sets: false,
    steps: ["Click “Copy & open Deckstats”.", "Open the deck builder and paste the list into its text import."]},
  {id: "manabox", name: "ManaBox app", kind: "app", fmt: "moxfield", sets: true,
    steps: ["Click “Copy list”.", "Send it to your phone (for example, email or message it to yourself) and copy it there.", "In ManaBox: Decks → New deck → Import, and paste."]},
  {id: "arena", name: "MTG Arena", kind: "app", fmt: "arenaGame", sets: false,
    steps: ["Click “Copy list”.", "In MTG Arena: Decks → Import. Arena reads the list from your clipboard.", "Only cards available on Arena come through; the rest are skipped."]},
  {id: "mtgo", name: "MTGO", kind: "file", ext: "txt", fmt: "plain", sets: false,
    steps: ["Click “Download file”.", "In Magic Online: Collection → Import, and pick the downloaded .txt file."]},
  {id: "cockatrice", name: "Cockatrice", kind: "file", ext: "cod", fmt: "cod", sets: false,
    steps: ["Click “Download file”.", "In Cockatrice: Deck Editor → Load deck, and pick the .cod file."]},
  {id: "forge", name: "Forge", kind: "file", ext: "dck", fmt: "dck", sets: true,
    steps: ["Click “Download file”.", "In Forge's deck editor, import it, or put the .dck file in Forge's decks folder (Constructed or Commander)."]},
  {id: "plain", name: "Anywhere else", kind: "app", fmt: "plain", sets: false,
    steps: ["Click “Copy list” and paste it anywhere: a message to a friend, a forum post, a store's buylist.", "It's just quantities and names, which almost every site understands."]}
];
const sendTarget = () => SEND_TARGETS.find(t => t.id === prefs.sendTo) || SEND_TARGETS[0];
const edhrecSlug = name => name.split(" // ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’,.!?:]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function renderDeckExport(){
  const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
  const t = sendTarget(), withSet = t.sets && prefs.deckExpSet !== false;
  $("sendGrid").innerHTML = SEND_TARGETS.map(x => `<button type="button" class="send-btn" data-send="${x.id}" aria-pressed="${x.id === t.id}"><b>${esc(x.name)}</b><small>${x.kind === "site" ? "Website" : x.kind === "file" ? "Download a file" : "Copy and paste"}</small></button>`).join("");
  $("dxSetWrap").hidden = !t.sets; $("dxSet").checked = prefs.deckExpSet !== false;
  $("dxText").value = (d.commanders.length || d.cards.length) ? deckText(d, t.fmt, withSet) : "";
  $("dxHint").innerHTML = t.steps.map(x => `<li>${esc(x)}</li>`).join("");
  const go = $("dxGo");
  if (t.kind === "site") { go.hidden = false; go.textContent = `Copy & open ${t.name}`; go.href = t.url; }
  else if (t.kind === "file") { go.hidden = false; go.textContent = `Download for ${t.name}`; go.href = "#"; }
  else go.hidden = true;
  $("dxDl").textContent = `Download .${t.ext || "txt"} file`; $("dxDl").hidden = t.kind === "file";
  $("dxCopy").textContent = t.kind === "site" ? "Copy list only" : "Copy list"; $("dxCopy").classList.toggle("primary", t.kind === "app");
  const names = [...new Set([...d.commanders, ...d.cards].map(c => c.name.split(" // ")[0]))];
  $("dxScry").href = names.length ? "https://scryfall.com/search?unique=cards&as=grid&q=" + encodeURIComponent(names.map(n => `!"${n}"`).join(" or ")) : "https://scryfall.com/";
  const cmdSlug = d.commanders.length ? d.commanders.map(c => edhrecSlug(c.name)).sort().join("-") : "";
  $("dxEdh").hidden = !cmdSlug; if (cmdSlug) $("dxEdh").href = "https://edhrec.com/commanders/" + cmdSlug;
}
$("sendGrid").addEventListener("click", e => { const b = e.target.closest("[data-send]"); if (!b) return; prefs.sendTo = b.dataset.send; savePrefs(); renderDeckExport(); });
$("dxSet").onchange = e => { prefs.deckExpSet = e.target.checked; savePrefs(); renderDeckExport(); };
function copyDeck(){
  const t = $("dxText").value; if (!t) { toast("Scan some cards into the deck first."); return Promise.resolve(false); }
  const fallback = () => { const det = $("dxText").closest("details"); if (det) det.open = true; $("dxText").focus(); $("dxText").select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} toast(ok ? "Deck list copied" : "Press Ctrl+C to copy the selected list"); return ok; };
  return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t).then(() => { toast(`Deck list copied for ${sendTarget().name}. Paste it with Ctrl+V.`); return true; }, fallback) : Promise.resolve(fallback());
}
function downloadDeck(){
  const d = prefs.deckView && deckById(prefs.deckView), text = $("dxText").value, t = sendTarget(); if (!d || !text) return toast("Scan some cards into the deck first.");
  const ext = t.ext || "txt", type = ext === "cod" ? "application/xml" : "text/plain";
  download(`${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck"}.${ext}`, text, type);
  toast(`Saved ${ext.toUpperCase()} file for ${t.name}.`);
}
$("dxCopy").onclick = () => copyDeck();
$("dxGo").addEventListener("click", e => { const t = sendTarget(); if (t.kind === "file") { e.preventDefault(); downloadDeck(); } else copyDeck(); });
$("dxDl").onclick = downloadDeck;

