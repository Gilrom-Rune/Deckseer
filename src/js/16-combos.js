/* ---------------- combos (Commander Spellbook) ----------------
   Deckseer downloads Commander Spellbook's public combo database once (about 30 MB), keeps a compact copy
   on this PC, and finds combos itself. If the download isn't allowed, it hands the list to their site instead. */
const CSB_BULK = "https://json.commanderspellbook.com/variants.json.gz";
const CSB_SITE = "https://commanderspellbook.com/find-my-combos/";
const DRAFTSIM_SITE = "https://draftsim.com/mtg-combo-finder/";
const COMBO_CHUNK = 5000;
const comboState = {deck: null, coll: null};
let comboDb = null, comboMeta = null, comboDl = null, comboImgs = {};   // comboDl: {read, total, parsed, phase} while downloading
const nameKey = n => norm(String(n).split(" // ")[0]);

async function loadComboDb(){
  if (comboDb) return comboDb;
  comboMeta = comboMeta || await idb.get("kv", "combo:meta");
  if (!comboMeta || !comboMeta.chunks) return null;
  const parts = await Promise.all(Array.from({length: comboMeta.chunks}, (_, k) => idb.get("kv", "combo:" + k)));
  if (parts.some(p => !p)) return null;
  comboDb = parts.flat();
  comboImgs = (await idb.get("kv", "combo:imgs")) || {};
  for (const v of comboDb) v.keys = v.c.map(nameKey);
  return comboDb;
}
// Stream the big file: decompress, scan for each combo object, keep only what Deckseer needs.
async function downloadComboDb(onProgress){
  const res = await fetch(CSB_BULK, {cache: "no-store"});
  if (!res.ok) throw new Error("http " + res.status);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  let read = 0;
  const first = await reader.read();
  const gz = first.value && first.value[0] === 0x1f && first.value[1] === 0x8b;
  const raw = new ReadableStream({
    start(c){ if (first.value) { read += first.value.length; c.enqueue(first.value); } if (first.done) c.close(); },
    async pull(c){ const r = await reader.read(); if (r.done) { c.close(); return; } read += r.value.length; c.enqueue(r.value); }
  });
  const text = (gz ? raw.pipeThrough(new DecompressionStream("gzip")) : raw).pipeThrough(new TextDecoderStream()).getReader();
  const combos = [], descs = [], imgs = {};
  let depth = 0, inStr = false, esc = false, strStart = -1, lastStr = "", lastKey = "", inVariants = false, inObj = false, start = -1, pending = "", ts = "";
  const keep = v => {
    if (v.status && v.status !== "OK") return;
    const nm = u => (u && u.card && (u.card.name || u.card)) || (u && u.name) || "";
    const c = (v.uses || []).map(nm).filter(Boolean); if (!c.length) return;
    for (const u of v.uses || []) {
      const cd = (u && u.card) || {}, n = nm(u), key = n && nameKey(n);
      if (key && !imgs[key]) { const im = cd.imageUriFrontSmall || cd.imageUriFrontNormal || cd.imageUriFrontLarge || cd.imageUriFrontPng || ""; if (im) imgs[key] = im; }
    }
    const k = Math.floor(combos.length / COMBO_CHUNK), x = combos.length % COMBO_CHUNK;
    combos.push({id: String(v.id), c, k, x,
      t: (v.requires || []).map(r => (r.template && r.template.name) || r.name || "").filter(Boolean),
      p: (v.produces || []).map(p => (p.feature && p.feature.name) || p.name || "").filter(Boolean),
      i: typeof v.identity === "string" ? v.identity : "", pop: v.popularity || 0, b: v.bracketTag || "", m: v.manaNeeded || "",
      e: [v.easyPrerequisites, v.notablePrerequisites].filter(Boolean).join(" "), L: v.legalities && v.legalities.commander === false ? 0 : 1});
    descs.push(v.description || "");
  };
  let lastTick = 0;
  for (;;) {
    const {done, value} = await text.read(); if (done) break;
    const s = pending + value; let i = pending.length;
    for (; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      if (inStr) { if (esc) esc = false; else if (ch === 92) esc = true; else if (ch === 34) { inStr = false; if (depth === 1) { lastStr = s.slice(strStart, i); if (lastKey === "timestamp" && !ts) ts = lastStr; } } continue; }
      if (ch === 34) { inStr = true; if (depth === 1) strStart = i + 1; continue; }
      if (ch === 123 || ch === 91) {
        if (inVariants && depth === 2 && ch === 123) { inObj = true; start = i; }
        else if (depth === 1 && ch === 91 && lastKey === "variants") inVariants = true;
        depth++;
      } else if (ch === 125 || ch === 93) {
        depth--;
        if (inObj && depth === 2 && ch === 125) { try { keep(JSON.parse(s.slice(start, i + 1))); } catch (e) {} inObj = false; start = -1; }
        else if (inVariants && depth === 1) inVariants = false;
      } else if (ch === 58 && depth === 1) lastKey = lastStr;
    }
    const from = inObj ? start : (inStr && depth === 1 ? strStart : s.length);
    pending = s.slice(from); if (inObj) start -= from; if (inStr && depth === 1) strStart -= from;
    const now = Date.now(); if (now - lastTick > 250) { lastTick = now; onProgress && onProgress(read, total, combos.length); }
  }
  if (!combos.length) throw new Error("empty");
  const chunks = Math.ceil(combos.length / COMBO_CHUNK);
  for (let k = 0; k < chunks; k++) {
    await idb.put("kv", "combo:" + k, combos.slice(k * COMBO_CHUNK, (k + 1) * COMBO_CHUNK));
    await idb.put("kv", "cdesc:" + k, descs.slice(k * COMBO_CHUNK, (k + 1) * COMBO_CHUNK));
  }
  await idb.put("kv", "combo:imgs", imgs); comboImgs = imgs;
  comboMeta = {t: Date.now(), ts, n: combos.length, chunks, imgs: Object.keys(imgs).length};
  await idb.put("kv", "combo:meta", comboMeta);
  comboDb = combos; for (const v of comboDb) v.keys = v.c.map(nameKey);
  return comboDb;
}
async function stepsFor(list){
  const need = [...new Set(list.map(v => v.k))], got = {};
  await Promise.all(need.map(async k => { got[k] = (await idb.get("kv", "cdesc:" + k)) || []; }));
  for (const v of list) v.steps = (got[v.k] || [])[v.x] || "";
}
function comboSource(scope){
  if (scope === "deck") {
    const d = prefs.deckView && deckById(prefs.deckView); if (!d) return null;
    const commanders = d.commanders.map(c => c.name), main = d.cards.filter(c => c.board === "main").map(c => [c.name, c.qty]);
    return {label: d.name, deck: d, commanders, main, names: [...commanders, ...main.map(m => m[0])],
      text: (commanders.length ? "Commander\n" + commanders.map(n => "1 " + n).join("\n") + "\n\nDeck\n" : "") + main.map(([n, q]) => `${q} ${n}`).join("\n") + "\n"};
  }
  const rows = filteredRows().map(([, c]) => c), all = rows.length === coll.size;
  const names = [...new Set(rows.map(c => c.name))].sort();
  return {label: all ? "your whole collection" : "the cards shown", commanders: [], main: names.map(n => [n, 1]), names, text: names.map(n => "1 " + n).join("\n") + "\n"};
}
const comboSig = src => src ? src.commanders.join("|") + "#" + src.main.map(m => m.join(":")).join("|") : "";
const isInfinite = p => p.some(x => /infinite|win the game|wins the game|lose the game|loses the game/i.test(x));
const isWin = p => p.some(x => /win the game|wins the game|lose the game|loses the game/i.test(x));
function matchLocal(src){
  const have = new Set(src.names.map(nameKey));
  const d = src.deck, cmdId = d && d.format === "commander" && d.commanders.length ? identity(d) : null;
  const fitsColors = v => !cmdId || [...(v.i || "")].every(x => x === "C" || cmdId.has(x));
  const included = [], almost = [];
  for (const v of comboDb) {
    if (d && d.format === "commander" && !v.L) continue;
    let miss = 0, missName = "";
    for (let j = 0; j < v.keys.length; j++) if (!have.has(v.keys[j])) { miss++; missName = v.c[j]; if (miss > 1) break; }
    if (miss === 0) included.push(v); else if (miss === 1 && fitsColors(v)) almost.push(Object.assign({}, v, {missName}));
  }
  const order = (a, b) => (isInfinite(b.p) - isInfinite(a.p)) || (b.pop - a.pop);
  const view = v => ({id: v.id, k: v.k, cards: v.c, templates: v.t, produces: v.p, missing: v.missName ? [v.missName] : [], prereq: v.e, mana: v.m,
    infinite: isInfinite(v.p), wins: isWin(v.p), popularity: v.pop, bracket: v.b, steps: null, _src: v});
  // one combo can have several near-identical variants; show each card set once
  const dedupe = list => { const seen = new Set(); return list.filter(v => { const key = v.c.slice().sort().join("|") + "#" + v.t.join("|"); if (seen.has(key)) return false; seen.add(key); return true; }); };
  return {included: dedupe(included.sort(order)).map(view), almost: dedupe(almost.sort(order)).map(view)};
}
async function findCombos(scope){
  const src = comboSource(scope); if (!src || !src.names.length) { toast(scope === "deck" ? "Scan some cards into the deck first." : "Scan some cards first."); return; }
  const st = comboState[scope] = {sig: comboSig(src), status: "loading", tab: comboState[scope] && comboState[scope].tab};
  renderCombos(scope);
  if (await loadComboDb()) { st.data = matchLocal(src); st.status = "done"; if (!st.tab) st.tab = st.data.included.length ? "in" : "almost"; return renderCombos(scope); }
  st.status = "needdb"; renderCombos(scope);
}
async function getComboDb(scope){
  if (comboDl) return;
  comboDl = {read: 0, total: 0, parsed: 0}; renderCombos("deck"); renderCombos("coll");
  try {
    await downloadComboDb((read, total, parsed) => { Object.assign(comboDl, {read, total, parsed}); renderCombos("deck"); renderCombos("coll"); });
    comboDl = null; toast(`Combo database ready: ${comboMeta.n.toLocaleString()} combos saved on this PC.`);
    for (const sc of ["deck", "coll"]) if (comboState[sc]) findCombos(sc);
  } catch (e) {
    console.warn("combo database download failed", e);
    comboDl = null;
    for (const sc of ["deck", "coll"]) if (comboState[sc]) { comboState[sc].status = e instanceof TypeError ? "blocked" : "dlerror"; renderCombos(sc); }
  }
}
const mb = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + " MB";
function ownedImages(){
  const m = {};
  for (const c of coll.values()) if (c.img) m[nameKey(c.name)] = c.img;
  for (const d of decks) for (const c of [...d.commanders, ...d.cards]) if (c.img) m[nameKey(c.name)] = c.img;
  return m;
}
function comboImg(name, owned){
  const k = nameKey(name);
  return comboImgs[k] || owned[k] || "https://api.scryfall.com/cards/named?format=image&version=small&exact=" + encodeURIComponent(name.split(" // ")[0]);
}
function renderCombos(scope){
  const box = $(scope === "deck" ? "deckCombos" : "collCombos"); if (!box) return;
  const st = comboState[scope], src = comboSource(scope);
  const credit = `<a class="linkbtn" href="https://commanderspellbook.com/" target="_blank" rel="noopener">Combo data from Commander Spellbook ↗</a>`;
  if (!st) { box.innerHTML = scope === "deck" ? `<div class="combo-intro"><button class="btn" type="button" data-combo="find">Find combos in this deck</button><span class="cur-sub">Shows combos you already have and ones you're one card away from.</span></div>` : ""; return; }
  const stale = st.sig !== comboSig(src);
  let html = `<div class="combo-head"><h3>Combos in ${esc(src ? src.label : "")}</h3>${credit}<span class="sp"></span>${st.status === "done" ? `<button class="btn" type="button" data-combo="find">${stale ? "Check again (cards changed)" : "Check again"}</button>` : ""}${scope === "coll" ? `<button class="btn ghost" type="button" data-combo="close">Close</button>` : ""}</div>`;
  if (comboDl) {
    const pct = comboDl.total ? Math.min(100, comboDl.read / comboDl.total * 100) : 0;
    html += `<div class="combo-msg">Downloading the combo database… ${comboDl.total ? mb(comboDl.read) + " of " + mb(comboDl.total) : mb(comboDl.read)} · ${comboDl.parsed.toLocaleString()} combos read</div>
      <div class="pbar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="cur-sub">This happens once. Keep this page open; it takes about a minute.</div>`;
  } else if (st.status === "loading") html += `<div class="combo-msg"><span class="spin-inline"></span> Looking for combos…</div>`;
  else if (st.status === "needdb") html += `<div class="combo-msg">To find combos right here in Deckseer, it needs Commander Spellbook's combo database. It's a one-time download of about 30 MB, saved on this PC so every search after that is instant.</div>
      <div class="dx-row"><button class="btn primary" type="button" data-combo="getdb">Download combo database</button></div>`;
  else if (st.status === "blocked" || st.status === "dlerror") html += `<div class="combo-msg err">${st.status === "blocked" ? "Commander Spellbook's server didn't let Deckseer download the combo database." : "The combo database download didn't finish."} You can try again, or check this list on their site for now.</div>
      <div class="dx-row"><button class="btn" type="button" data-combo="getdb">Try the download again</button></div>` + siteButtons();
  else {
    const flt = v => !prefs.infOnly || v.infinite;
    const list = (st.tab === "almost" ? st.data.almost : st.data.included).filter(flt);
    const n1 = st.data.included.filter(flt).length, n2 = st.data.almost.filter(flt).length;
    html += `<div class="combo-tabs"><button type="button" class="ctab" aria-pressed="${st.tab !== "almost"}" data-combo="tab-in">You have these (${n1})</button><button type="button" class="ctab" aria-pressed="${st.tab === "almost"}" data-combo="tab-almost">One card away (${n2})</button>
      <label class="chk"><input type="checkbox" data-combo="inf" ${prefs.infOnly ? "checked" : ""}> Only infinite or game-winning combos</label></div>`;
    if (!list.length) html += `<div class="combo-msg">${st.tab === "almost" ? "No combos one card away" : "No complete combos found"}${prefs.infOnly ? " with infinite or game-winning results" : ""}.</div>`;
    const shown = list.slice(0, 150), owned = ownedImages();
    html += shown.map((v, idx) => `<div class="combo">
      <div class="combo-cards">${v.cards.map(c => { const miss = v.missing.includes(c); return `<a class="ctile ${miss ? "miss" : ""}" href="https://scryfall.com/search?q=${encodeURIComponent('!"' + c.split(" // ")[0] + '"')}" target="_blank" rel="noopener" title="${esc(c)}${miss ? " (you need this card)" : ""}">
          <span class="cimg"><img loading="lazy" src="${esc(comboImg(c, owned))}" alt="" onerror="this.parentNode.classList.add('noimg')"><em>${esc(c)}</em>${miss ? ([...coll.values()].some(e => e.name === c) ? '<b class="need own">In your collection</b>' : '<b class="need">Need</b>') : ""}</span>
          <span class="cname">${esc(c)}</span></a>`; }).join("")}${v.templates.map(t => `<div class="ctile tmpl" title="Any card that matches this"><span class="cimg"><em><span>Plus any</span><b>${esc(t)}</b></em></span></div>`).join("")}</div>
      ${v.wins ? '<span class="inf">★ Wins the game</span>' : v.infinite ? '<span class="inf">∞ Infinite</span>' : ""}
      <div class="combo-res"><b>Result:</b> ${esc(v.produces.join(", ") || "—")}</div>
      <details data-cidx="${idx}"><summary>How it works${v.mana ? " · needs " + esc(v.mana) : ""}</summary>${v.prereq ? `<p><b>Setup:</b> ${esc(v.prereq)}</p>` : ""}<p class="oracle">${v.steps == null ? "Loading…" : esc(v.steps)}</p></details>
      <a class="linkbtn" href="https://commanderspellbook.com/combo/${encodeURIComponent(v.id)}/" target="_blank" rel="noopener">Open on Commander Spellbook ↗</a>
    </div>`).join("") + (list.length > 150 ? `<div class="combo-msg">Showing the 150 most popular of ${list.length.toLocaleString()}.</div>` : "");
    st.shown = shown;
    if (comboMeta) html += `<div class="cur-sub">Combo database from ${esc(new Date(comboMeta.t).toLocaleDateString())} · ${comboMeta.n.toLocaleString()} combos · <button class="linkish" type="button" data-combo="getdb">Update it</button>${comboMeta.imgs ? "" : " to get faster card pictures"}</div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll("details[data-cidx]").forEach(det => det.addEventListener("toggle", async () => {
    const v = st.shown && st.shown[+det.dataset.cidx]; if (!det.open || !v || v.steps != null) return;
    await stepsFor([v._src]); v.steps = v._src.steps || "";
    det.querySelector(".oracle").textContent = v.steps || "No steps listed. Open it on Commander Spellbook for details.";
  }));
}
function siteButtons(){
  return `<div class="dx-row"><a class="btn" href="${CSB_SITE}" target="_blank" rel="noopener" data-combo="copy">Copy list &amp; open Commander Spellbook</a>
    <a class="btn" href="${DRAFTSIM_SITE}" target="_blank" rel="noopener" data-combo="copy">Copy list &amp; open Draftsim Combo Finder</a></div>`;
}
function comboClick(scope, e){
  const b = e.target.closest("[data-combo]"); if (!b) return;
  const a = b.dataset.combo, st = comboState[scope];
  if (a === "find") return findCombos(scope);
  if (a === "getdb") return getComboDb(scope);
  if (a === "close") { comboState[scope] = null; return renderCombos(scope); }
  if (a === "tab-in" || a === "tab-almost") { st.tab = a === "tab-in" ? "in" : "almost"; return renderCombos(scope); }
  if (a === "copy") {
    const src = comboSource(scope); if (!src) return;
    navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(src.text).then(() => toast("List copied. Paste it into the decklist box on their site."), () => toast("Couldn't copy automatically. Use “Copy deck list” and paste it there."))
      : toast("Couldn't copy automatically. Use “Copy deck list” and paste it there.");
  }
}
$("deckCombos").addEventListener("click", e => comboClick("deck", e));
$("deckCombos").addEventListener("change", e => { if (e.target.dataset.combo === "inf") { prefs.infOnly = e.target.checked; savePrefs(); renderCombos("deck"); } });
$("collCombos").addEventListener("click", e => comboClick("coll", e));
$("collCombos").addEventListener("change", e => { if (e.target.dataset.combo === "inf") { prefs.infOnly = e.target.checked; savePrefs(); renderCombos("coll"); } });
$("collComboBtn").onclick = () => { findCombos("coll"); setTimeout(() => $("collCombos").scrollIntoView({behavior: "smooth", block: "start"}), 50); };

