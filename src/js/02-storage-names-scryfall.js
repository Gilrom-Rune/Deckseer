/* ---------------- storage ---------------- */
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } }
};
const prefs = Object.assign({auto:true, add:true, foil:false, set:"", sort:"recent", cam:"", cur:"usd", cond:"NM", sound:true, alertAt:5, ign1:false,
  list:"Collection", lists:["Collection"], view:"session", fList:"", fRarity:"", fColor:"", fType:""}, store.get("bsw-prefs", {}));
const savePrefs = () => store.set("bsw-prefs", prefs);
const coll = new Map();
const saveColl = () => { if (!store.set("bsw-coll", [...coll])) toast("Couldn't save to this browser. Export your collection to keep it."); };

/* ---------------- name matching ---------------- */
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
let NAMES = [];               // [normKey, fullName]
const TRI = new Map();        // trigram -> Set(index)
function trigrams(s){ const t = " " + s + " ", out = new Set(); for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3)); return out; }
function buildIndex(fullNames){
  NAMES = []; TRI.clear();
  const add = (key, full) => {
    const k = norm(key); if (k.length < 2) return;
    const idx = NAMES.push([k, full]) - 1;
    for (const g of trigrams(k)) { let s = TRI.get(g); if (!s) TRI.set(g, s = []); s.push(idx); }
  };
  for (const full of fullNames) {
    add(full, full);
    if (full.includes(" // ")) for (const part of full.split(" // ")) add(part, full);
  }
}
function lev(a, b){
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i-1] === b[j-1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const ratio = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
function matchName(raw){
  const s = norm(raw); if (s.length < 3) return [];
  const counts = new Map();
  for (const g of trigrams(s)) { const l = TRI.get(g); if (l) for (const i of l) counts.set(i, (counts.get(i) || 0) + 1); }
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 80);
  const scored = new Map();
  for (const [i] of top) {
    const [k, full] = NAMES[i];
    // OCR often adds junk after the name (mana symbols) — also compare the same-length prefix
    // the readers sometimes run words together or split them ("TeferisProtection"): also compare without spaces
    const sc = Math.max(ratio(s, k), ratio(s.slice(0, k.length), k) * 0.96, k.length >= 6 && s.startsWith(k) ? 0.97 : 0, ratio(s.replace(/ /g, ""), k.replace(/ /g, "")) * 0.97);
    if (!scored.has(full) || scored.get(full) < sc) scored.set(full, sc);
  }
  return [...scored].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, score]) => ({name, score}));
}

/* ---------------- collector line parsing ---------------- */
const LANG_CODES = "EN|JA|JP|DE|FR|IT|ES|SP|PT|RU|KO|KR|ZHS|ZHT|CS|CT|PH";
function parseInfo(raw){
  const t = String(raw).toUpperCase().replace(/[|]/g, "I");
  const out = {set:"", number:""};
  const sm = t.match(new RegExp("\\b([A-Z0-9]{3,5})\\s*[•·.*+\\-:,_]?\\s*(?:" + LANG_CODES + ")\\b"));
  if (sm && /[A-Z]/.test(sm[1])) out.set = sm[1];
  const nm = t.match(/\b0*(\d{1,4}[A-Z]?)\s*\/\s*\d{2,4}\b/) || t.match(/\b0*(\d{1,4})\s+[CURMSLT]\b/) || t.match(/^\s*[CURMSLT]?\s*0*(\d{1,4})\b/m);
  if (nm) out.number = nm[1].toLowerCase();
  return out;
}

/* ---------------- Scryfall ---------------- */
const SF = "https://api.scryfall.com";
let sfQueue = Promise.resolve();
function sf(path, opts){
  // Scryfall asks for ~10 requests/second max; space them out.
  const run = sfQueue.then(async () => {
    const r = await fetch(SF + path, Object.assign({headers:{Accept:"application/json"}}, opts));
    await sleep(110);
    if (!r.ok && r.status !== 404) throw new Error("Scryfall " + r.status);
    return r.json();
  });
  sfQueue = run.catch(() => {});
  return run;
}
async function loadCatalog(){
  const cached = store.get("bsw-names", null);
  if (cached && cached.list && Date.now() - cached.t < 7 * 864e5) return cached.list;
  try {
    const j = await sf("/catalog/card-names");
    store.set("bsw-names", {t: Date.now(), list: j.data});
    return j.data;
  } catch (e) {
    if (cached && cached.list) return cached.list;
    throw e;
  }
}
/* Persistent cache in IndexedDB: printings, set lists and picture fingerprints survive reloads */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("binder-scanner", 2);
    r.onupgradeneeded = () => { for (const st of ["kv", "vecs", "lib"]) if (!r.result.objectStoreNames.contains(st)) r.result.createObjectStore(st); };
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); }; r.onerror = () => rej(r.error);
    r.onblocked = () => { toast("Close other Deckseer tabs, then reload this one, to finish updating its storage."); res(null); };
  }).catch(() => null));
  const op = async (store, mode, fn) => {
    const db = await open(); if (!db) return undefined;
    return new Promise(res => {
      try { const tx = db.transaction(store, mode); const req = fn(tx.objectStore(store));
        tx.oncomplete = () => res(req && req.result); tx.onerror = tx.onabort = () => res(undefined); }
      catch (e) { res(undefined); }
    });
  };
  return {
    get: (st, k) => op(st, "readonly", o => o.get(k)),
    put: (st, k, v) => op(st, "readwrite", o => o.put(v, k)),
    del: (st, k) => op(st, "readwrite", o => o.delete(k)),
    async entries(st){
      const db = await open(); if (!db) return [];
      return new Promise(res => { try {
        const tx = db.transaction(st, "readonly"), o = tx.objectStore(st), ks = o.getAllKeys(), vs = o.getAll();
        tx.oncomplete = () => res(ks.result.map((k, i) => [k, vs.result[i]])); tx.onerror = () => res([]);
      } catch (e) { res([]); } });
    }
  };
})();
const DAY = 864e5;
async function cached(key, ttl, fetcher){
  const hit = await idb.get("kv", key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fetcher();
  idb.put("kv", key, {t: Date.now(), v});
  return v;
}
const printsCache = new Map();
async function getPrints(name, allLangs){
  const key = name + (allLangs ? "|all" : "");
  if (!printsCache.has(key)) printsCache.set(key, cached("p5:" + key, 3 * DAY, () => fetchPrints(name, allLangs)).catch(e => { printsCache.delete(key); throw e; }));
  return printsCache.get(key);
}
async function fetchPrints(name, allLangs){
  const q = encodeURIComponent(`!"${name}" game:paper${allLangs ? " lang:any" : ""}`);
  const j = await sf(`/cards/search?unique=prints&order=released&dir=desc&q=${q}`);
  let list = (j.data || []).map(slimCard);
  // keep English first so the default pick is an English printing
  if (allLangs) list = list.filter(p => p.lang === "en").concat(list.filter(p => p.lang !== "en"));
  return list;
}
async function getBySetNumber(set, num){
  const j = await sf(`/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(num.toLowerCase())}`);
  return j && j.object === "card" ? slimCard(j) : null;
}
function slimCard(c){
  const img = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {};
  return {
    id: c.id, name: c.name, set: (c.set || "").toUpperCase(), setName: c.set_name, number: c.collector_number,
    rarity: c.rarity, lang: c.lang || "en", finishes: c.finishes || ["nonfoil"],
    img: img.small || "", imgN: img.normal || img.small || "",
    usd: c.prices ? c.prices.usd : null, usdFoil: c.prices ? (c.prices.usd_foil || c.prices.usd_etched) : null,
    eur: c.prices ? c.prices.eur : null, eurFoil: c.prices ? (c.prices.eur_foil || c.prices.eur_etched) : null, released: c.released_at,
    type: c.type_line || (c.card_faces || []).map(f => f.type_line).join(" // "),
    text: c.oracle_text != null ? c.oracle_text : (c.card_faces || []).map(f => f.name + "\n" + (f.oracle_text || "")).join("\n\n"),
    cmc: c.cmc ?? (c.card_faces && c.card_faces[0] && c.card_faces[0].cmc) ?? null, ci: c.color_identity || [],
    power: c.power != null ? c.power : (c.card_faces && c.card_faces[0] && c.card_faces[0].power) || "", toughness: c.toughness != null ? c.toughness : (c.card_faces && c.card_faces[0] && c.card_faces[0].toughness) || "",
    cost: c.mana_cost != null ? c.mana_cost : (c.card_faces || []).map(f => f.mana_cost).filter(Boolean).join(" // "),
    loyalty: c.loyalty != null ? c.loyalty : (c.card_faces && c.card_faces[0] && c.card_faces[0].loyalty) || "", defense: c.defense != null ? c.defense : (c.card_faces && c.card_faces[0] && c.card_faces[0].defense) || "",
    printedName: c.printed_name || "", colors: c.colors || (c.card_faces && c.card_faces[0] && c.card_faces[0].colors) || [],
    legal: c.legalities ? Object.fromEntries(["standard","pioneer","modern","legacy","vintage","commander","pauper"].map(f => [f, c.legalities[f]])) : {}
  };
}
const priceOf = (p, foil, cur) => (cur || prefs.cur) === "eur"
  ? Number(foil ? (p.eurFoil ?? p.eur) : (p.eur ?? p.eurFoil)) || 0
  : Number(foil ? (p.usdFoil ?? p.usd) : (p.usd ?? p.usdFoil)) || 0;

