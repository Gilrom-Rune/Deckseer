/* ---------------- export, backup ---------------- */
const LANG_NAMES = {en:"English",ja:"Japanese",de:"German",fr:"French",it:"Italian",es:"Spanish",pt:"Portuguese",ru:"Russian",ko:"Korean",zhs:"Chinese Simplified",zht:"Chinese Traditional",ph:"Phyrexian"};
const COND_MOX = {NM:"Near Mint",LP:"Lightly Played",MP:"Moderately Played",HP:"Heavily Played",DMG:"Damaged"};
const COND_DBX = {NM:"Near Mint",LP:"Good (Lightly Played)",MP:"Played",HP:"Heavily Played",DMG:"Poor"};
const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = (head, rows) => [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
function exportScope(){
  if (prefs.view === "session") {
    const agg = new Map();
    for (const it of session.items) { const ex = agg.get(it.key); if (ex) ex.qty += it.qty; else agg.set(it.key, Object.assign({}, coll.get(it.key) || it, {qty: it.qty})); }
    return {rows: [...agg.values()], label: "this session", slug: "session"};
  }
  if (selected.size) return {rows: [...selected].map(k => coll.get(k)).filter(Boolean), label: `${selected.size} selected rows`, slug: "selection"};
  const rows = filteredRows().map(([, c]) => c);
  const all = rows.length === coll.size;
  return {rows, label: all ? "the whole collection" : "the cards shown", slug: all ? "collection" : (prefs.fList || "filtered").toLowerCase().replace(/[^a-z0-9]+/g, "-")};
}
function renderExpScope(){
  const sc = exportScope(); const n = sc.rows.reduce((t, c) => t + c.qty, 0);
  $("expScope").textContent = `Exports ${sc.label} (${n.toLocaleString()} card${n === 1 ? "" : "s"})`;
}
function download(name, text, type){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function buildExport(fmt, rows){
  rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name) || a.set.localeCompare(b.set));
  const when = c => new Date(c.updatedAt || c.addedAt || Date.now()).toISOString().slice(0, 19).replace("T", " ");
  if (fmt === "moxfield") return {ext: "csv", type: "text/csv", text: csv(
    ["Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number"],
    rows.map(c => [c.qty, 0, c.name, c.set.toLowerCase(), COND_MOX[c.cond] || "Near Mint", LANG_NAMES[c.lang] || "English", c.foil ? "foil" : "", c.list !== "Collection" ? c.list : "", when(c), c.number]))};
  if (fmt === "deckbox") return {ext: "csv", type: "text/csv", text: csv(
    ["Count","Tradelist Count","Name","Edition","Card Number","Condition","Language","Foil","Signed","Artist Proof","Altered Art","Misprint","Promo","Textless","My Price"],
    rows.map(c => [c.qty, 0, c.name, c.setName || c.set, c.number, COND_DBX[c.cond] || "Near Mint", LANG_NAMES[c.lang] || "English", c.foil ? "foil" : "", "", "", "", "", "", "", ""]))};
  if (fmt === "full") return {ext: "csv", type: "text/csv", text: csv(
    ["Quantity","Name","Set Code","Set Name","Collector Number","Foil","Condition","Language","Rarity","List","Price USD","Price EUR","Scryfall ID","Date Added"],
    rows.map(c => [c.qty, c.name, c.set, c.setName || "", c.number, c.foil ? "foil" : "normal", COND_MOX[c.cond] || "Near Mint", LANG_NAMES[c.lang] || "English", c.rarity || "", c.list || "Collection",
      unitVal(c, "usd").toFixed(2), unitVal(c, "eur").toFixed(2), c.sid, new Date(c.addedAt || Date.now()).toISOString().slice(0, 10)]))};
  if (fmt === "tcg") return {ext: "txt", type: "text/plain", text: rows.map(c => `${c.qty} ${c.name} [${c.set}]`).join("\n") + "\n"};
  return {ext: "txt", type: "text/plain", text: rows.map(c => `${c.qty} ${c.name} (${c.set}) ${c.number}${c.foil ? " *F*" : ""}`).join("\n") + "\n"};
}
$("expFmt").value = prefs.expFmt || "moxfield";
$("expFmt").onchange = e => { prefs.expFmt = e.target.value; savePrefs(); };
$("dlExport").onclick = () => {
  const sc = exportScope();
  if (!sc.rows.length) return toast(prefs.view === "session" ? "Scan some cards first." : "Nothing to export with these filters.");
  const out = buildExport($("expFmt").value, sc.rows);
  download(`deckseer-${sc.slug}-${stamp()}.${out.ext}`, out.text, out.type);
};
/* Backup holds everything that's yours. Card data, prices, pictures, combo data and the Picture library are left out:
   they come back from Scryfall / Commander Spellbook on their own. */
const BACKUP_KEYS = ["bsw-coll", "bsw-decks", "bsw-prefs", "bsw-sess", "bsw-hist", "bsw-wish", "bsw-game", "bsw-games", "bsw-gsetup"];
const vecB64 = v => { const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const b64Vec = s => { try { const b = Uint8Array.from(atob(s), c => c.charCodeAt(0)); return b.length === VEC_N * 4 ? new Float32Array(b.buffer) : null; } catch (e) { return null; } };
async function memDump(){
  // what the scanner has learned from your webcam: names per printing plus the looks themselves
  const meta = (await idb.get("kv", "memMeta")) || {}, looks = {}, learn = {};
  for (const [k, v] of await idb.entries("vecs")) {
    if (!v || v.length !== VEC_N) continue;
    if (k.startsWith("mem|")) looks[k.slice(4)] = vecB64(v);
    else if (k.startsWith("learn2|")) learn[k.slice(7)] = vecB64(v);
  }
  return {meta, looks, learn};
}
async function memLoad(mem, replace){
  if (!mem || typeof mem.meta !== "object") return 0;
  if (replace) for (const [k] of await idb.entries("vecs")) if (k.startsWith("mem|") || k.startsWith("learn2|")) await idb.del("vecs", k);
  const meta = replace ? {} : Object.assign({}, (await idb.get("kv", "memMeta")) || {});
  for (const [slotKey, s] of Object.entries(mem.looks || {})) { const v = b64Vec(s); if (v && mem.meta[slotKey.split("|")[0]]) await idb.put("vecs", "mem|" + slotKey, v); }
  for (const [id, s] of Object.entries(mem.learn || {})) { const v = b64Vec(s); if (v) await idb.put("vecs", "learn2|" + id, v); }
  for (const [id, m] of Object.entries(mem.meta)) if (m && m.name) meta[id] = replace || !meta[id] || (m.t || 0) > (meta[id].t || 0) ? m : meta[id];
  await idb.put("kv", "memMeta", meta);
  return Object.keys(mem.meta).length;
}
async function buildBackup(){
  const data = {app: "binder-scanner", version: 4, exported: new Date().toISOString(),
    // the version-3 fields stay at the top, so older Deckseer copies can still read the collection and decks
    coll: [...coll], lists: prefs.lists, hist, session, decks,
    wish, games, game, gsetup: gameSetup, prefs: Object.assign({}, prefs, {cam: ""})};
  data.mem = await memDump();
  return data;
}
$("backup").onclick = async () => {
  const data = await buildBackup();
  download(`deckseer-backup-${stamp()}.json`, JSON.stringify(data), "application/json");
  prefs.lastBackup = Date.now(); savePrefs();
  const n = Object.keys(data.mem.meta).length;
  toast(`Backed up ${coll.size.toLocaleString()} collection rows, ${decks.length} deck${decks.length === 1 ? "" : "s"}, ${wish.length} wishlist card${wish.length === 1 ? "" : "s"}, ${games.length} game${games.length === 1 ? "" : "s"}${n ? ` and ${n.toLocaleString()} learned cards` : ""}.`);
};
// Restore replaces what's in this browser with the backup, then reloads the page so every tab shows it.
// The state before the restore is kept in IndexedDB, so the Undo after the reload can put it all back.
async function applyBackup(data){
  const ls = {
    "bsw-coll": data.coll, "bsw-decks": Array.isArray(data.decks) ? data.decks : undefined,
    "bsw-hist": Array.isArray(data.hist) ? data.hist : undefined,
    "bsw-sess": data.session && Array.isArray(data.session.items) ? data.session : undefined,
    "bsw-wish": Array.isArray(data.wish) ? data.wish : undefined,
    "bsw-games": Array.isArray(data.games) ? data.games : undefined,
    "bsw-game": "game" in data ? data.game : undefined,
    "bsw-gsetup": data.gsetup && typeof data.gsetup === "object" ? data.gsetup : undefined
  };
  // preferences: take the backup's, but keep this PC's camera choice
  const p = Object.assign({}, data.prefs && typeof data.prefs === "object" ? data.prefs : prefs, {cam: prefs.cam});
  p.lists = Array.isArray(data.lists) && data.lists.length ? data.lists : (p.lists || ["Collection"]);
  if (!p.lists.includes(p.list)) p.list = p.lists[0];
  ls["bsw-prefs"] = p;
  for (const [k, v] of Object.entries(ls)) if (v !== undefined && !store.set(k, v)) throw new Error("This browser ran out of space while restoring.");
  if (data.mem) await memLoad(data.mem, true);
}
$("restore").onchange = async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  let data;
  try {
    data = JSON.parse(await f.text());
    if (!data || data.app !== "binder-scanner" || !Array.isArray(data.coll)) throw new Error("not a backup");
  } catch (err) { return toast("That file isn't a Deckseer backup."); }
  try {
    const before = await buildBackup(); before.raw = {};
    for (const k of BACKUP_KEYS) before.raw[k] = localStorage.getItem(k);
    await idb.put("kv", "undoRestore", {t: Date.now(), before});
    await applyBackup(data);
    const bits = [`${data.coll.length.toLocaleString()} collection rows`];
    if (Array.isArray(data.decks)) bits.push(`${data.decks.length} deck${data.decks.length === 1 ? "" : "s"}`);
    if (Array.isArray(data.wish)) bits.push(`${data.wish.length} wishlist card${data.wish.length === 1 ? "" : "s"}`);
    if (Array.isArray(data.games)) bits.push(`${data.games.length} game result${data.games.length === 1 ? "" : "s"}`);
    if (data.mem) bits.push(`${Object.keys(data.mem.meta || {}).length.toLocaleString()} learned cards`);
    sessionStorage.setItem("cs-restored", `Restored ${bits.join(", ")} from ${f.name}.${(data.version || 3) < 4 ? " (Older backup: wishlist, games and scan memory weren't in it, so they were left as they were.)" : ""}`);
    location.reload();
  } catch (err) { toast(err && err.message && /space/.test(err.message) ? err.message : "Restoring failed. Nothing you had was lost: reload the page."); }
};
async function undoRestore(){
  const u = await idb.get("kv", "undoRestore"); if (!u || !u.before) return toast("There's nothing to undo.");
  for (const [k, v] of Object.entries(u.before.raw || {})) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  await memLoad(u.before.mem, true);
  await idb.del("kv", "undoRestore");
  sessionStorage.setItem("cs-restored", "Undone: everything is back to how it was before the restore.");
  location.reload();
}
(() => {
  let msg = null; try { msg = sessionStorage.getItem("cs-restored"); sessionStorage.removeItem("cs-restored"); } catch (e) {}
  if (!msg) return;
  setTimeout(() => {
    toast(msg, /^Undone/.test(msg) ? "" : "Undo", undoRestore);
    clearTimeout(toastT); toastT = setTimeout(() => $("toast").classList.add("hide"), 15000);
  }, 300);
})();


/* ---------------- version and updates ---------------- */
const APP_VERSION = "2026.11.11.8";   // set by tools/bump-version.js, together with version.json
/* ---------------- installable app (when opened from a web address, not from a file) ---------------- */
(() => {
  if (!/^https?:$/.test(location.protocol)) return;   // file:// can't install or work offline: nothing to do
  let swReg = null;
  const link = document.createElement("link"); link.rel = "manifest"; link.href = "manifest.webmanifest"; document.head.appendChild(link);
  let prompt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); prompt = e; $("installApp").classList.remove("hide"); });
  window.addEventListener("appinstalled", () => { $("installApp").classList.add("hide"); toast("Deckseer is installed. Open it from the Start menu or desktop."); });
  $("installApp").onclick = async () => { if (!prompt) return; prompt.prompt(); await prompt.userChoice.catch(() => null); prompt = null; $("installApp").classList.add("hide"); };
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    const offer = w => {
      // a newer Deckseer has been downloaded: switch to it when the user says so (never in the middle of a scan)
      toast("A new version of Deckseer is ready.", "Reload", () => w.postMessage("skipWaiting"));
      clearTimeout(toastT);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
    swReg = reg;
  }).catch(() => {});
  // Is there a newer Deckseer? Checked at start, every 10 minutes, and when you come back to the window.
  // version.json is tiny; the page itself is only fetched again when you choose Reload.
  let lastCheck = 0, offered = false;
  const checkUpdate = async () => {
    if (offered || Date.now() - lastCheck < 60e3) return;
    lastCheck = Date.now();
    try {
      const r = await fetch("version.json?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) return;
      const v = (await r.json()).version;
      if (swReg) swReg.update().catch(() => {});
      if (!v || v === APP_VERSION) return;
      offered = true;
      toast(`A new version of Deckseer is ready (${v}).`, "Reload", () => { const w = swReg && swReg.waiting; if (w) w.postMessage("skipWaiting"); else location.reload(); });
      clearTimeout(toastT);   // stays until you choose
    } catch (e) { /* offline: try again later */ }
  };
  setTimeout(checkUpdate, 3000);
  setInterval(checkUpdate, 10 * 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  window.addEventListener("focus", checkUpdate);
  // reload only when an *update* takes over; the very first install takes over quietly
  let reloading = false; const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading || !hadController) return; reloading = true; location.reload(); });
})();


/* ---------------- the logo's eye: the pupil follows the pointer ---------------- */
(() => {
  const iris = document.getElementById("logoIris"); if (!iris) return;
  const eye = iris.closest("svg");
  let px = null, py = null, queued = false;
  const look = () => {
    queued = false;
    const r = eye.getBoundingClientRect(); if (!r.width) return;
    let ox = 0, oy = 0;
    if (px != null) {
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 180);           // looks fully to the side once the pointer is a little way off
      ox = dx / d * 10.5 * reach; oy = dy / d * 4.5 * reach;   // in the eye's own units: wide, not tall
    }
    iris.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px)`;
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(look); } };
  window.addEventListener("pointermove", e => { px = e.clientX; py = e.clientY; queue(); }, {passive: true});
  document.documentElement.addEventListener("pointerleave", () => { px = py = null; queue(); });
  window.addEventListener("blur", () => { px = py = null; queue(); });
})();

/* ---------------- misc ---------------- */
let toastT;
function toast(msg, btnText, fn){
  $("toastMsg").textContent = msg; const b = $("toastBtn");
  b.classList.toggle("hide", !btnText); b.textContent = btnText || ""; b.onclick = () => { $("toast").classList.add("hide"); fn && fn(); };
  $("toast").classList.remove("hide"); clearTimeout(toastT); toastT = setTimeout(() => $("toast").classList.add("hide"), 5000);
}
let actx = null;
// a cash register, made with Web Audio so there's no sound file:
// "ka" = the lever's two metal clacks and the drawer's thump; "ching" = a small bell struck once, with coins jingling as the drawer opens
function kaching(ac, t0){
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // the same jingle every time
  const out = ac.createGain(); out.gain.value = 0.8; out.connect(ac.destination);
  // a little room: a short decaying-noise reverb
  const rlen = Math.floor(ac.sampleRate * 0.5), ir = ac.createBuffer(2, rlen, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < rlen; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / rlen, 4); }
  const verb = ac.createConvolver(), wet = ac.createGain(); verb.buffer = ir; wet.gain.value = 0.18; verb.connect(wet).connect(out);
  const dry = ac.createGain(); dry.gain.value = 1; dry.connect(out); dry.connect(verb);
  const noise = (dur, shape) => { const n = Math.max(1, Math.floor(ac.sampleRate * dur)), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / n, shape); const src = ac.createBufferSource(); src.buffer = b; return src; };
  const filt = (type, f, q) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const tone = (f, at, amp, dec, type) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type || "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(amp, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + dec); o.connect(g).connect(dry); o.start(at); o.stop(at + dec + 0.02); };
  // ka: two clacks (a metal lever hitting its stop), each a click through two resonances
  for (const [at, amp] of [[0, 0.9], [0.045, 0.7]]) for (const [f, q] of [[3300, 9], [1250, 6], [5200, 12]]) {
    const n = noise(0.012, 2), bp = filt("bandpass", f * (1 + (rnd() - 0.5) * 0.06), q), g = ac.createGain(); g.gain.value = amp * (f === 1250 ? 0.8 : 0.55);
    n.connect(bp).connect(g).connect(dry); n.start(t0 + at);
  }
  // the drawer's thump
  { const o = ac.createOscillator(), g = ac.createGain(), at = t0 + 0.05; o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(55, at + 0.1); g.gain.setValueAtTime(0.45, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12); o.connect(g).connect(dry); o.start(at); o.stop(at + 0.14);
    const n = noise(0.08, 3), lp = filt("lowpass", 700, 0.7), g2 = ac.createGain(); g2.gain.value = 0.35; n.connect(lp).connect(g2).connect(dry); n.start(at); }
  // ching: the bell. Its strike, then pairs of close modes that beat against each other as it rings
  const bt = t0 + 0.12, f0 = 2350;
  { const n = noise(0.006, 1), hp = filt("highpass", 4000, 0.7), g = ac.createGain(); g.gain.value = 0.5; n.connect(hp).connect(g).connect(dry); n.start(bt); }
  for (const [r, amp, dec] of [[1, 0.22, 1.7], [1.0045, 0.17, 1.6], [2.42, 0.13, 1.0], [2.435, 0.09, 0.95], [4.1, 0.07, 0.55], [5.95, 0.05, 0.35], [8.3, 0.03, 0.2]]) tone(f0 * r, bt, amp, dec);
  // coins: little high pings scattered as the drawer settles
  for (let k = 0; k < 14; k++) {
    const at = bt + 0.03 + Math.pow(rnd(), 1.6) * 0.45, f = 4200 + rnd() * 4800;
    tone(f, at, 0.02 + rnd() * 0.035, 0.04 + rnd() * 0.09);
    tone(f * 1.51, at, 0.01 + rnd() * 0.015, 0.03 + rnd() * 0.05);
  }
}
function sound(kind){
  if (!prefs.sound) return;
  try { if (navigator.vibrate && isPhone()) navigator.vibrate(kind === "valuable" ? [40, 60, 40] : kind === "check" ? [15, 40, 15] : 30); } catch (e) {}
  try {
    actx = actx || new AudioContext(); if (actx.state === "suspended") actx.resume(); const t0 = actx.currentTime;
    if (kind === "valuable") { const own = store.get("bsw-kaching", null); if (own && own.url) { const a = new Audio(own.url); a.play().catch(() => kaching(actx, actx.currentTime)); return; } return kaching(actx, t0); }
    const notes = kind === "check" ? [[392, 0], [311, 0.13]] : [[880, 0]];
    for (const [f, at] of notes) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === "check" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.06, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.14);
      o.connect(g).connect(actx.destination); o.start(t0 + at); o.stop(t0 + at + 0.16);
    }
  } catch (e) {}
}
$("optAuto").checked = prefs.auto; $("optAdd").checked = prefs.add; $("optFoil").checked = prefs.foil; $("optSet").value = prefs.set;
$("optSound").checked = prefs.sound; $("optAlert").value = prefs.alertAt || ""; $("optCur").value = prefs.cur; $("optIgn1").checked = prefs.ign1;
$("optCond").innerHTML = condOpts(prefs.cond); $("bulkCond").innerHTML = `<option value="">Set condition…</option>` + condOpts("");
const syncCurUI = () => { $("alertSym").textContent = prefs.cur === "eur" ? "€" : "$"; };
$("optAuto").onchange = e => { prefs.auto = e.target.checked; savePrefs(); lastScanSig = null; };
$("optAdd").onchange = e => { prefs.add = e.target.checked; savePrefs(); };
$("optFoil").onchange = e => { prefs.foil = e.target.checked; savePrefs(); };
$("optSleeve").checked = !!prefs.sleeve;
$("optSleeve").onchange = e => {
  prefs.sleeve = e.target.checked; savePrefs(); sleeveExposure(prefs.sleeve);
  setStatus(prefs.sleeve ? "Sleeve mode on. Each scan takes a few quick frames to wipe out glare. Hold still for a moment." : "Sleeve mode off.", "ok");
};
// Many webcams let us darken exposure a little, which keeps sleeve glare from turning pure white
let savedExposure = null;
async function sleeveExposure(on){
  try {
    const track = stream && stream.getVideoTracks()[0]; if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities(), cur = track.getSettings();
    if (!caps.exposureCompensation) return;
    const {min, max} = caps.exposureCompensation;
    if (on) {
      if (savedExposure == null) savedExposure = cur.exposureCompensation ?? 0;
      await track.applyConstraints({advanced: [{exposureCompensation: Math.max(min, savedExposure - (max - min) * 0.15)}]});
    } else if (savedExposure != null) {
      await track.applyConstraints({advanced: [{exposureCompensation: savedExposure}]}); savedExposure = null;
    }
  } catch (e) { /* this webcam doesn't allow it; glare merging still works */ }
}
document.documentElement.classList.toggle("glow", prefs.glow !== false);
$("optGlow").checked = prefs.glow !== false;
document.documentElement.classList.toggle("bgfx", prefs.bgfx !== false);
$("optBgfx").checked = prefs.bgfx !== false;
$("optBgfx").onchange = e => { prefs.bgfx = e.target.checked; savePrefs(); document.documentElement.classList.toggle("bgfx", prefs.bgfx); };
$("optGlow").onchange = e => { prefs.glow = e.target.checked; savePrefs(); document.documentElement.classList.toggle("glow", prefs.glow); };
$("optSound").onchange = e => { prefs.sound = e.target.checked; savePrefs(); if (prefs.sound) sound("ok"); };
function renderOwnSnd(){ const own = store.get("bsw-kaching", null); $("optOwnInfo").innerHTML = own ? ` Playing <b>${esc(own.name)}</b> <button class="linkbtn" type="button" id="optOwnReset">use the built-in ka-ching</button>` : ""; $("optOwnSnd").textContent = own ? "🎵 Change sound…" : "🎵 Use my own sound…"; }
renderOwnSnd();
$("optOwnSnd").onclick = e => { e.preventDefault(); $("optOwnFile").click(); };
$("optOwnWrap").addEventListener("click", e => { if (e.target.id === "optOwnReset") { e.preventDefault(); localStorage.removeItem("bsw-kaching"); renderOwnSnd(); toast("Back to the built-in ka-ching"); } });
$("optOwnFile").onchange = e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(f.name)) return toast("That isn't a sound file. Pick an MP3, WAV or OGG.");
  if (f.size > 500 * 1024) return toast(`That file is ${Math.round(f.size / 1024)} KB. Pick one under 500 KB (a short sound effect).`);
  const rd = new FileReader();
  rd.onload = () => {
    const a = new Audio(rd.result);
    a.oncanplaythrough = () => { a.oncanplaythrough = null; if (!store.set("bsw-kaching", {name: f.name, url: rd.result})) return toast("Couldn't save it: the browser's storage is full."); renderOwnSnd(); a.play().catch(() => {}); toast(`Valuable cards now play ${f.name}`); };
    a.onerror = () => toast("This browser can't play that file. Try an MP3 or WAV.");
    a.load();
  };
  rd.readAsDataURL(f);
};
$("optHear").onclick = e => { e.preventDefault(); const was = prefs.sound; prefs.sound = true; sound("valuable"); prefs.sound = was; };
$("optAlert").oninput = e => { prefs.alertAt = Math.max(0, Number(e.target.value) || 0); savePrefs(); renderSession(); };
$("optCur").onchange = e => { prefs.cur = e.target.value; savePrefs(); syncCurUI(); renderAll(); renderCurrent(); };
$("optCond").onchange = e => { prefs.cond = e.target.value; savePrefs(); };
$("optIgn1").onchange = e => { prefs.ign1 = e.target.checked; savePrefs(); renderSession(); };
let setTimer;
$("optSet").oninput = e => { prefs.set = e.target.value.toUpperCase(); savePrefs(); clearTimeout(setTimer); if (ready && lockList().length) setTimer = setTimeout(prepareLocks, 700); };
$("scanNow").onclick = () => scan(false);
document.addEventListener("keydown", e => {
  const typing = e.target.matches("input[type=text],input[type=search],input[type=number],input[type=password],select,textarea");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === "Space") { e.preventDefault(); scan(false); }
  else if (k === "c" && claudeReady()) { e.preventDefault(); askClaude(); }
  else if (k === "r") { e.preventDefault(); addAnother(); }
  else if (k === "m") { e.preventDefault(); startVoice(); }
  else if (/^[1-5]$/.test(e.key) && current) { const c = CONDS[+e.key - 1][0]; current.cond = c; if (current.added) recondLast(c); renderCurrent(); setStatus(`Condition: ${CONDS[+e.key - 1][1]}.`, ""); }
  else if (e.key === "Enter" && current && !e.target.closest("button")) { e.preventDefault(); addCurrent(false); }
  else if (k === "f" && current) { const p = current.prints[current.sel]; if ((p.finishes.includes("foil") || p.finishes.includes("etched")) && p.finishes.includes("nonfoil")) { current.foil = !current.foil; renderCurrent(); } }
  else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && current) { e.preventDefault(); current.sel = (current.sel + (e.key === "ArrowRight" ? 1 : -1) + current.prints.length) % current.prints.length; current.why = "Picked by you"; current.added = false; fixFoil(); renderCurrent(); }
});

