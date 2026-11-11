/* ---------------- picture matching ----------------
   Each card becomes a small color fingerprint of the whole card plus a sharper one of just the artwork.
   The art counts most, because every card shares the same frame layout. Colors are normalized per channel,
   so webcam white balance and brightness matter less. */
const FP_W = 60, FP_H = 84;
const FULL_W = 20, FULL_H = 28, FULL_N = FULL_W * FULL_H * 3;
const ART = {x: 0.08, y: 0.11, w: 0.84, h: 0.45}, ART_W = 24, ART_H = 18, ART_N = ART_W * ART_H * 3;
const VEC_N = FULL_N + ART_N, ART_WEIGHT = 0.6;
let visualBroken = false;
const fpC = document.createElement("canvas"); fpC.width = FP_W; fpC.height = FP_H;
const fpG = fpC.getContext("2d", {willReadFrequently: true}); fpG.imageSmoothingQuality = "high";
const fullC = document.createElement("canvas"); fullC.width = FULL_W; fullC.height = FULL_H;
const fullG = fullC.getContext("2d", {willReadFrequently: true}); fullG.imageSmoothingQuality = "high";
const artC = document.createElement("canvas"); artC.width = ART_W; artC.height = ART_H;
const artG = artC.getContext("2d", {willReadFrequently: true}); artG.imageSmoothingQuality = "high";
function zNorm(px, out, offset, n, skipGlare){
  // px: RGBA; writes n*3 z-normalized values (per channel) into out at offset, scaled so dot product = correlation.
  // With skipGlare, blown-out pixels (sleeve glare) count as "no information" instead of as white.
  let use = null, cnt = n;
  if (skipGlare) {
    use = new Uint8Array(n); cnt = 0;
    for (let i = 0; i < n; i++) if (Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) <= 242) { use[i] = 1; cnt++; }
    if (cnt < 10) { use = null; cnt = n; }
  }
  const m = [0, 0, 0], s = [0, 0, 0];
  for (let i = 0; i < n; i++) if (!use || use[i]) for (let c = 0; c < 3; c++) m[c] += px[i * 4 + c];
  for (let c = 0; c < 3; c++) m[c] /= cnt;
  for (let i = 0; i < n; i++) if (!use || use[i]) for (let c = 0; c < 3; c++) { const d = px[i * 4 + c] - m[c]; s[c] += d * d; }
  for (let c = 0; c < 3; c++) s[c] = Math.sqrt(s[c] / cnt) || 1;
  const k = 1 / Math.sqrt(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[offset + i * 3 + c] = use && !use[i] ? 0 : (px[i * 4 + c] - m[c]) / s[c] * k;
}
function fingerprint(src, sx, sy, sw, sh, skipGlare){
  fpG.drawImage(src, sx, sy, sw, sh, 0, 0, FP_W, FP_H);
  fullG.drawImage(fpC, 0, 0, FULL_W, FULL_H);
  artG.drawImage(fpC, ART.x * FP_W, ART.y * FP_H, ART.w * FP_W, ART.h * FP_H, 0, 0, ART_W, ART_H);
  const v = new Float32Array(VEC_N);
  zNorm(fullG.getImageData(0, 0, FULL_W, FULL_H).data, v, 0, FULL_W * FULL_H, skipGlare);
  zNorm(artG.getImageData(0, 0, ART_W, ART_H).data, v, FULL_N, ART_W * ART_H, skipGlare);
  return v;
}
function simScore(a, b){
  let f = 0, r = 0;
  for (let i = 0; i < FULL_N; i++) f += a[i] * b[i];
  for (let i = FULL_N; i < VEC_N; i++) r += a[i] * b[i];
  return (1 - ART_WEIGHT) * f + ART_WEIGHT * r;
}
// Query fingerprints from a capture: a few tight crops (and upside down) of a straightened card,
// or many shifted/scaled crops of the guide box when the card's edges weren't found.
function frameWindows(cap){
  const out = [], R = cap.rect;
  if (cap.rectified) {
    for (const flip of [false, true]) {
      const src = flip ? flipped(cap).src : cap.src;
      // a sleeve whose card edge wasn't found leaves a margin around the card: try deeper crops too
      const insets = cap.sleeve && !cap.inner ? [0, 0.015, 0.03, 0.045, 0.06] : [0, 0.015, 0.03];
      for (const ins of insets) out.push({v: fingerprint(src, R.w * ins, R.h * ins, R.w * (1 - 2 * ins), R.h * (1 - 2 * ins), !!cap.sleeve), flip});
    }
  } else {
    for (const sc of [0.92, 0.97, 1.02, 1.07]) for (const dx of [-0.04, 0, 0.04]) for (const dy of [-0.03, 0, 0.03]) {
      const w = R.w * sc, h = R.h * sc;
      out.push({v: fingerprint(cap.src, R.x + (R.w - w) / 2 + dx * R.w, R.y + (R.h - h) / 2 + dy * R.h, w, h), flip: false});
    }
  }
  return out;
}
const refCache = new Map();
const savedVecs = new Map(), learned = new Map();
const vecsLoaded = idb.entries("vecs").then(list => {
  for (const [k, v] of list) {
    if (!v || v.length !== VEC_N) continue;
    if (k.startsWith("learn2|")) learned.set(k.slice(7), v); else if (k.startsWith("v2|")) savedVecs.set(k.slice(3), v);
  }
});
function refVec(url){
  if (!url) return Promise.resolve(null);
  if (!refCache.has(url) && savedVecs.has(url)) refCache.set(url, Promise.resolve(savedVecs.get(url)));
  if (!refCache.has(url)) refCache.set(url, new Promise(res => {
    const im = new Image(); im.crossOrigin = "anonymous"; im.decoding = "async";
    im.onload = () => {
      try {
        const v = fingerprint(im, 0, 0, im.naturalWidth, im.naturalHeight);
        savedVecs.set(url, v); idb.put("vecs", "v2|" + url, v);
        res(v);
      } catch (e) { visualBroken = true; res(null); }
    };
    im.onerror = () => { refCache.delete(url); res(null); };
    im.src = url;
  }));
  return refCache.get(url);
}
// Remember how a printing looks through *your* webcam, so duplicates match even better next time.
// Each confirmed scan is kept (up to 3 different looks per printing: different light, sleeve, angle), with the card's
// name, so later scans of the same card are recognised straight from memory, even if the name can't be read.
const memLooks = new Map();   // printing id → [vectors]
let memMeta = {};             // printing id → {name, set, number, img, t, n}
const MEM_MAX_CARDS = 5000, MEM_LOOKS = 3;
const memLoaded = Promise.all([vecsLoaded, idb.get("kv", "memMeta")]).then(async ([, meta]) => {
  memMeta = meta && typeof meta === "object" ? meta : {};
  for (const [k, v] of await idb.entries("vecs")) {
    if (!k.startsWith("mem|") || !v || v.length !== VEC_N) continue;
    const [, id] = k.split("|"); if (!memMeta[id]) continue;
    (memLooks.get(id) || memLooks.set(id, []).get(id)).push(v);
  }
  renderMemInfo();
});
const saveMemMeta = () => idb.put("kv", "memMeta", memMeta);
async function learnLook(card, wins, flippedCap){
  if (!wins || !wins.length || !card) return;
  const ref = await refVec(card.img); if (!ref) return;
  let best = null, bs = -2;
  for (const w of wins) { if (!!w.flip !== !!flippedCap) continue; const s = simScore(w.v, ref); if (s > bs) { bs = s; best = w.v; } }
  if (!best || bs <= 0.45) return;   // the photo doesn't look like Scryfall's picture of this printing: don't learn it
  learned.set(card.id, best); idb.put("vecs", "learn2|" + card.id, best);
  await memLoaded;
  const looks = memLooks.get(card.id) || [];
  // a new look only if it's really different from the ones already kept (otherwise refresh the closest)
  let near = -1, ns = -2; looks.forEach((v, i) => { const s = simScore(best, v); if (s > ns) { ns = s; near = i; } });
  let slot;
  if (looks.length && ns > 0.95) slot = near;
  else if (looks.length < MEM_LOOKS) slot = looks.length;
  else slot = ((memMeta[card.id] && memMeta[card.id].n) || 0) % MEM_LOOKS;
  looks[slot] = best; memLooks.set(card.id, looks);
  const m = memMeta[card.id] || {name: card.name, set: card.set, number: card.number, img: card.img, n: 0};
  m.t = Date.now(); m.n = (m.n || 0) + 1; memMeta[card.id] = m;
  idb.put("vecs", `mem|${card.id}|${slot}`, best);
  // keep the memory a sensible size: forget the cards scanned longest ago
  const ids = Object.keys(memMeta);
  if (ids.length > MEM_MAX_CARDS) for (const id of ids.sort((a, b) => memMeta[a].t - memMeta[b].t).slice(0, ids.length - MEM_MAX_CARDS)) forgetCard(id, true);
  saveMemMeta(); renderMemInfo();
}
function forgetCard(id, quiet){
  const n = (memLooks.get(id) || []).length;
  for (let i = 0; i < Math.max(n, MEM_LOOKS); i++) idb.del("vecs", `mem|${id}|${i}`);
  memLooks.delete(id); delete memMeta[id]; learned.delete(id); idb.del("vecs", "learn2|" + id);
  if (!quiet) { saveMemMeta(); renderMemInfo(); }
}
// Which card is this, going only by what you've scanned before? Best printing per name, and how far ahead of the next name it is.
function memoryMatch(wins){
  if (!memLooks.size || !wins || !wins.length) return null;
  const byName = new Map();
  for (const [id, vs] of memLooks) {
    const m = memMeta[id]; if (!m) continue;
    let s = -2, flip = false;
    for (const v of vs) for (const w of wins) { const x = simScore(w.v, v); if (x > s) { s = x; flip = !!w.flip; } }
    const cur = byName.get(m.name);
    if (!cur || s > cur.s) byName.set(m.name, {id, name: m.name, s, flip, set: m.set});
  }
  const list = [...byName.values()].sort((a, b) => b.s - a.s);
  if (!list.length) return null;
  return Object.assign({}, list[0], {margin: list[0].s - (list[1] ? list[1].s : 0), next: list[1] || null});
}
function renderMemInfo(){
  const el = $("memInfo"); if (!el) return;
  const cards = Object.keys(memMeta).length, looks = [...memLooks.values()].reduce((t, v) => t + v.length, 0);
  el.innerHTML = cards ? `Learned <b>${cards.toLocaleString()}</b> card${cards === 1 ? "" : "s"} from your scans (${looks.toLocaleString()} looks). <button class="linkbtn" type="button" id="memForget">Forget all</button>` : "Nothing learned yet. Every card you confirm teaches it how that card looks through your webcam.";
  const st = $("memSummaryState"); if (st) st.textContent = cards ? `(${cards.toLocaleString()} cards)` : "(learning)";
}
async function presentMem(mem, cap, wins, infoP, seq, why){
  if (mem.flip && cap.rectified) { cap = flipped(cap); wins = wins.map(w => ({v: w.v, flip: !w.flip})); }
  setStatus(`Recognised ${mem.name} from your earlier scans. Getting its printings…`, "", true);
  const [infoR, prints0] = await Promise.all([infoP.catch(() => ({text: ""})), getPrints(mem.name).catch(() => [])]);
  if (seq !== scanSeq) return false;
  let prints = prints0, i = prints.findIndex(p => p.id === mem.id);
  const info = parseInfo(infoR.text || "");
  if (i < 0 && prints.length) i = (await pickPrinting(prints, info, wins)).index;
  if (!prints.length) { setStatus(`Recognised ${mem.name}, but couldn't get its printings from Scryfall.`, "err"); return true; }
  flashHit();
  present({name: mem.name, alts: mem.next && mem.next.s > mem.s - 0.15 ? [{name: mem.next.name, score: mem.next.s}] : [], prints, sel: i, why: `${why} (${Math.round(mem.s * 100)}%) · the printing you scanned before`, info, wins, shot: cardShot(cap), rectified: cap.rectified, flipped: !!cap.flipped, cap}, mem.s >= 0.8 && mem.margin >= 0.1);
  return true;
}
/* ---------------- picture library ----------------
   A one-time download that fingerprints the artwork of every card printed (one entry per unique artwork),
   so a card can be identified from its picture alone: foreign-language cards, heavy foils, odd fonts, worn names.
   Each entry is a compact version of the scanner's fingerprint (whole card 10×14 + art 12×9, in color), stored as
   bytes in this browser's database. A scan compares against all of them in a fraction of a second, then re-checks
   the closest few at full detail. */
const LIB_FW = 10, LIB_FH = 14, LIB_AW = 12, LIB_AH = 9;
const LIB_FN = LIB_FW * LIB_FH * 3, LIB_AN = LIB_AW * LIB_AH * 3, LIB_N = LIB_FN + LIB_AN;
const LIB_SCOPES = {recent: {label: "Cards from 2015 on", q: "game:paper year>=2015"}, all: {label: "Every card", q: "game:paper"}};
// shrink one fingerprint part by averaging 2×2 blocks, then make it unit length again
function halve(v, off, w, h, out, oOff){
  const w2 = w >> 1, h2 = h >> 1; let ss = 0;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < 3; c++) {
    const a = (i, j) => v[off + ((y * 2 + j) * w + (x * 2 + i)) * 3 + c];
    const s = a(0, 0) + a(1, 0) + a(0, 1) + a(1, 1); out[oOff + (y * w2 + x) * 3 + c] = s; ss += s * s;
  }
  const k = 1 / (Math.sqrt(ss) || 1), n = w2 * h2 * 3;
  for (let i = 0; i < n; i++) out[oOff + i] *= k;
}
function compactFP(v){ const out = new Float32Array(LIB_N); halve(v, 0, FULL_W, FULL_H, out, 0); halve(v, FULL_N, ART_W, ART_H, out, LIB_FN); return out; }
// bytes for storage: each value is a unit-vector component; scale so a typical value lands around ±40
function quantize(c, bytes, off){
  const kf = Math.sqrt(LIB_FN) * 40, ka = Math.sqrt(LIB_AN) * 40; let nf = 0, na = 0;
  for (let i = 0; i < LIB_N; i++) { const q = Math.max(-127, Math.min(127, Math.round(c[i] * (i < LIB_FN ? kf : ka)))); bytes[off + i] = q; if (i < LIB_FN) nf += q * q; else na += q * q; }
  return [Math.sqrt(nf) || 1, Math.sqrt(na) || 1];
}
const lib = {n: 0, vec: null, nrm: null, ids: [], names: [], imgs: [], meta: null, building: false, stop: false, loaded: null};
const libReady = () => lib.n > 0 && lib.meta && lib.meta.done;
async function loadLibrary(){
  const meta = await idb.get("lib", "meta"); lib.meta = meta || null;
  if (!meta || !meta.pages) return;
  const chunks = [];
  for (let p = 0; p < meta.pages; p++) { const ch = await idb.get("lib", "chunk:" + p); if (ch && ch.vec) chunks.push(ch); }
  const n = chunks.reduce((s, c) => s + c.ids.length, 0);
  const vec = new Int8Array(n * LIB_N), nrm = new Float32Array(n * 2); let at = 0;
  lib.ids = []; lib.names = []; lib.imgs = [];
  for (const c of chunks) {
    vec.set(new Int8Array(c.vec), at * LIB_N); nrm.set(new Float32Array(c.nrm), at * 2);
    lib.ids.push(...c.ids); lib.names.push(...c.names); lib.imgs.push(...c.imgs); at += c.ids.length;
  }
  Object.assign(lib, {n, vec, nrm});
}
// one picture's fingerprint, without caching it (the library keeps its own compact copy)
function imageVec(url){
  return new Promise(res => {
    const im = new Image(); im.crossOrigin = "anonymous"; im.decoding = "async";
    const t = setTimeout(() => { im.src = ""; res(null); }, 15000);
    im.onload = () => { clearTimeout(t); try { res(fingerprint(im, 0, 0, im.naturalWidth, im.naturalHeight)); } catch (e) { res(null); } };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = url;
  });
}
function libStatus(){
  const m = lib.meta, el = $("libState"); if (!el) return;
  const btn = $("libBuild"), del = $("libDelete"), scope = $("libScope");
  if (lib.building) {
    const total = m && m.total ? m.total : 0, done = m ? m.count : 0;
    const rate = lib.rate || 0, left = rate && total > done ? Math.ceil((total - done) / rate / 60) : null;
    el.textContent = `Building: ${done.toLocaleString()}${total ? ` of about ${total.toLocaleString()}` : ""} pictures${left ? ` · about ${left} min left` : ""}. You can keep scanning.`;
    btn.textContent = "Pause"; scope.disabled = true; del.hidden = true;
    $("libBar").hidden = false; $("libBar").value = total ? done / total : 0;
  } else if (libReady()) {
    el.textContent = `Ready: ${lib.n.toLocaleString()} pictures (${LIB_SCOPES[m.scope].label.toLowerCase()}). Cards are recognized from their art when the name can't be read.`;
    btn.textContent = m.scope === "recent" ? "Add older cards" : "Update"; scope.disabled = false; del.hidden = false; $("libBar").hidden = true;
  } else if (m && m.count) {
    el.textContent = `Paused at ${m.count.toLocaleString()}${m.total ? ` of about ${m.total.toLocaleString()}` : ""} pictures.`;
    btn.textContent = "Resume"; scope.disabled = true; del.hidden = false; $("libBar").hidden = false; $("libBar").value = m.total ? m.count / m.total : 0;
  } else {
    el.textContent = "Not built yet. A one-time download lets Deckseer recognize cards from their picture alone, including foreign-language cards, foils and odd fonts.";
    btn.textContent = "Build picture library"; scope.disabled = false; del.hidden = true; $("libBar").hidden = true;
  }
  $("libSummaryState").textContent = lib.building ? "(building…)" : libReady() ? `(${lib.n.toLocaleString()} pictures)` : m && m.count ? "(paused)" : "(off)";
}
async function buildLibrary(){
  if (lib.building) return;
  let m = lib.meta;
  const scope = $("libScope").value;
  // finished "recent" library and the person now wants everything: start over with the full scope
  if (!m || (m.done && (m.scope !== scope || scope === "all"))) {
    m = {scope, next: `/cards/search?unique=art&order=released&dir=desc&include_multilingual=true&q=${encodeURIComponent(LIB_SCOPES[scope].q)}`, pages: 0, count: 0, total: 0, done: false, started: Date.now()};
    if (lib.meta && lib.meta.pages) { await clearLibraryChunks(lib.meta.pages); }
    Object.assign(lib, {n: 0, vec: null, nrm: null, ids: [], names: [], imgs: []});
  }
  lib.meta = m; lib.building = true; lib.stop = false; lib.rate = 0; libStatus();
  const t0 = Date.now(), c0 = m.count;
  try {
    while (m.next && !lib.stop) {
      const j = await sf(m.next);
      if (!j || j.object === "error") throw new Error("Scryfall search failed");
      if (j.total_cards) m.total = j.total_cards;
      const cards = (j.data || []).map(c => {
        const iu = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {};
        return {id: c.id, name: c.name, img: iu.small || ""};
      }).filter(c => c.img);
      const vecs = new Array(cards.length); let qi = 0;
      await Promise.all(Array.from({length: 8}, async () => { while (qi < cards.length) { const i = qi++; vecs[i] = await imageVec(cards[i].img); } }));
      const keep = cards.map((c, i) => [c, vecs[i]]).filter(x => x[1]);
      const bytes = new Int8Array(keep.length * LIB_N), nrm = new Float32Array(keep.length * 2);
      keep.forEach(([c, v], i) => { const [a, b] = quantize(compactFP(v), bytes, i * LIB_N); nrm[i * 2] = a; nrm[i * 2 + 1] = b; });
      const chunk = {ids: keep.map(x => x[0].id), names: keep.map(x => x[0].name), imgs: keep.map(x => x[0].img), vec: bytes.buffer, nrm: nrm.buffer};
      await idb.put("lib", "chunk:" + m.pages, chunk);
      appendToLibrary(chunk);
      m.pages++; m.count += cards.length;
      m.next = j.has_more && j.next_page ? j.next_page.replace(SF, "") : null;
      if (!m.next) m.done = true;
      await idb.put("lib", "meta", m);
      lib.rate = (m.count - c0) / Math.max(1, (Date.now() - t0) / 1000);
      libStatus();
    }
    if (m.done) toast(`Picture library ready: ${lib.n.toLocaleString()} pictures.`);
  } catch (e) {
    console.error(e); toast("The picture library download stopped (connection problem). Press Resume to carry on.");
  } finally { lib.building = false; libStatus(); }
}
function appendToLibrary(c){
  const k = c.ids.length, n = lib.n + k;
  if (!lib.vec || lib.vec.length < n * LIB_N) {   // grow in big steps instead of copying everything every page
    const cap = Math.max(n, Math.ceil((lib.vec ? lib.vec.length / LIB_N : 0) * 1.6), 4096);
    const vec = new Int8Array(cap * LIB_N), nrm = new Float32Array(cap * 2);
    if (lib.vec) { vec.set(lib.vec.subarray(0, lib.n * LIB_N)); nrm.set(lib.nrm.subarray(0, lib.n * 2)); }
    lib.vec = vec; lib.nrm = nrm;
  }
  lib.vec.set(new Int8Array(c.vec), lib.n * LIB_N); lib.nrm.set(new Float32Array(c.nrm), lib.n * 2);
  lib.ids.push(...c.ids); lib.names.push(...c.names); lib.imgs.push(...c.imgs);
  lib.n = n;
}
async function clearLibraryChunks(pages){ for (let p = 0; p < pages; p++) await idb.del("lib", "chunk:" + p); }
async function deleteLibrary(){
  if (lib.building) { lib.stop = true; while (lib.building) await sleep(100); }
  if (lib.meta) await clearLibraryChunks(lib.meta.pages || 0);
  await idb.del("lib", "meta");
  Object.assign(lib, {n: 0, vec: null, nrm: null, ids: [], names: [], imgs: [], meta: null});
  libStatus(); toast("Picture library deleted.");
}
// Search the library with this scan's fingerprints. Two passes: art only for everything, then the whole compact
// fingerprint for the best 400, then the full-detail fingerprint (the card's own picture) for the closest few.
// The name the text reader saw, even half-read, nudges close calls.
async function libraryMatch(wins, readText){
  if (!libReady() || !wins || !wins.length) return null;
  const qs = (wins.length > 8 ? wins.filter((_, i) => i % 9 === 4) : wins).map(w => ({c: compactFP(w.v), flip: w.flip}));
  const N = lib.n, V = lib.vec, NR = lib.nrm;
  // pass 1: art only, straight-on crop of each orientation
  const firsts = [qs.find(q => !q.flip), qs.find(q => q.flip)].filter(Boolean);
  const K1 = Math.min(400, N), top = new Float32Array(K1).fill(-9), topI = new Int32Array(K1).fill(-1); let minAt = 0;
  for (let e = 0; e < N; e++) {
    const base = e * LIB_N + LIB_FN; let best = -9;
    for (const q of firsts) { let s = 0; for (let i = 0; i < LIB_AN; i++) s += q.c[LIB_FN + i] * V[base + i]; if (s > best) best = s; }
    best /= NR[e * 2 + 1];
    if (best > top[minAt]) { top[minAt] = best; topI[minAt] = e; minAt = 0; for (let i = 1; i < K1; i++) if (top[i] < top[minAt]) minAt = i; }
  }
  // pass 2: whole compact fingerprint, every crop
  const cands = [];
  for (let k = 0; k < K1; k++) {
    const e = topI[k]; if (e < 0) continue;
    let best = -9, flip = false;
    for (const q of qs) {
      let f = 0, a = 0; const b = e * LIB_N;
      for (let i = 0; i < LIB_FN; i++) f += q.c[i] * V[b + i];
      for (let i = LIB_FN; i < LIB_N; i++) a += q.c[i] * V[b + i];
      const s = (1 - ART_WEIGHT) * f / NR[e * 2] + ART_WEIGHT * a / NR[e * 2 + 1];
      if (s > best) { best = s; flip = q.flip; }
    }
    cands.push({e, s: best, flip});
  }
  cands.sort((a, b) => b.s - a.s);
  // pass 3: full detail for the closest 8 distinct names
  const seen = new Set(), short = [];
  for (const c of cands) { const nm = lib.names[c.e]; if (seen.has(nm)) continue; seen.add(nm); short.push(c); if (short.length >= 8) break; }
  const txt = norm(readText || "");
  const scored = await Promise.all(short.map(async c => {
    const id = lib.ids[c.e], ref = await refVec(lib.imgs[c.e]), lv = learned.get(id);
    let up = -1, fl = -1;
    for (const w of wins) { const s = Math.max(ref ? simScore(w.v, ref) : -1, lv ? simScore(w.v, lv) : -1); if (w.flip) fl = Math.max(fl, s); else up = Math.max(up, s); }
    const pic = Math.max(up, fl, ref || lv ? -1 : c.s * 0.9);
    const nk = norm(lib.names[c.e]);
    const tx = txt.length >= 3 ? Math.max(ratio(txt, nk), ratio(txt.slice(0, nk.length), nk)) : 0;
    return {name: lib.names[c.e], id, img: lib.imgs[c.e], pic, text: tx, score: pic + 0.15 * Math.max(0, tx - 0.35), flip: fl - up >= 0.08};
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]; if (!best) return null;
  const margin = best.score - (scored[1] ? scored[1].score : -1);
  return {best, cands: scored, margin, sure: best.pic >= 0.66 && margin >= 0.08};
}
async function visualMatch(cands, wins){
  if (!wins || !wins.length || visualBroken || !cands.length) return null;
  const refs = await Promise.all(cands.map(p => refVec(p.img)));
  const scores = refs.map((r, ci) => {
    const lv = learned.get(cands[ci].id);
    if (!r && !lv) return -1;
    let up = -1, fl = -1;
    for (const w of wins) {
      const s = Math.max(r ? simScore(w.v, r) : -1, lv ? simScore(w.v, lv) : -1);
      if (w.flip) { if (s > fl) fl = s; } else if (s > up) up = s;
    }
    // cards are almost always held the right way up: only flip when the flipped view is clearly better
    cands[ci]._flip = fl - up >= 0.08;
    return Math.max(up, fl);
  });
  let bi = -1; scores.forEach((s, i) => { if (bi < 0 || s > scores[bi]) bi = i; });
  if (bi < 0 || scores[bi] < 0) return null;
  const second = cands.length > 1 ? Math.max(-1, ...scores.filter((_, i) => i !== bi)) : -1;
  const score = scores[bi];
  return {index: bi, score, margin: score - second, flip: !!cands[bi]._flip,
    confident: cands.length === 1 ? score >= 0.45 : score >= 0.65 && score - second >= 0.08, scores};
}
const setCache = new Map();
function getSetCards(code){
  code = code.toLowerCase();
  if (!setCache.has(code)) setCache.set(code, cached("s5:" + code, 3 * DAY, () => fetchSet(code)).catch(e => { setCache.delete(code); throw e; }));
  return setCache.get(code);
}
async function fetchSet(code){
  let list = [], path = `/cards/search?unique=prints&order=set&q=${encodeURIComponent(`e:${code} game:paper lang:any`)}`;
  for (let page = 0; path && page < 8; page++) {
    const j = await sf(path);
    if (j.object === "error") break;
    list = list.concat((j.data || []).map(slimCard));
    path = j.has_more && j.next_page ? j.next_page.replace(SF, "") : null;
  }
  return list;
}
// One picture per collector number: the English printing when there is one, otherwise whatever language exists.
const poolCache = new Map();
async function getSetPool(code){
  code = code.toLowerCase();
  if (poolCache.has(code)) return poolCache.get(code);
  const cards = await getSetCards(code), by = new Map();
  for (const c of cards) { const k = c.number; const ex = by.get(k); if (!ex || (ex.lang !== "en" && c.lang === "en")) by.set(k, c); }
  const pool = [...by.values()];
  poolCache.set(code, pool);
  return pool;
}
// When a Set lock is entered, download every card picture in that set ahead of time.
const setReady = new Map();   // code -> true once all pictures are fingerprinted
const lockList = () => (prefs.set || "").toUpperCase().split(/[\s,;+]+/).filter(c => /^[A-Z0-9]{2,6}$/.test(c));
const locksReady = () => { const ls = lockList(); return ls.length > 0 && ls.every(c => setReady.get(c.toLowerCase())); };
async function lockPool(){ return (await Promise.all(lockList().map(getSetPool))).flat(); }
let lockGen = 0;
async function prepareLocks(){ const gen = ++lockGen; for (const c of lockList()) { if (gen !== lockGen) return; await prepareSet(c); } }
let prepToken = 0;
async function prepareSet(code){
  code = (code || "").toLowerCase(); const token = ++prepToken;
  if (!code || setReady.get(code)) return;
  try {
    await vecsLoaded;
    const cards = await getSetPool(code);
    if (token !== prepToken) return;
    if (!cards.length) { if (!busy) setStatus(`Scryfall has no set with the code ${code.toUpperCase()}.`, "err"); return; }
    let done = 0; const queue = cards.slice();
    const say = () => { if (!busy && token === prepToken && done < cards.length) setStatus(`Getting ${code.toUpperCase()} ready for instant scans: ${done}/${cards.length} pictures`, "", true); };
    say();
    await Promise.all(Array.from({length: 8}, async () => { while (queue.length && token === prepToken) { await refVec(queue.shift().img); done++; if (done % 10 === 0) say(); } }));
    if (token !== prepToken) return;
    setReady.set(code, true);
    if (!busy) setStatus(`${code.toUpperCase()} is ready. Cards from this set scan by picture alone.`, "ok");
  } catch (e) { if (!busy) setStatus("Couldn't load that set from Scryfall. Check the code and your connection.", "err"); }
}
function cardShot(cap){
  const c = document.createElement("canvas"); c.height = 280; c.width = Math.round(280 * CARD_RATIO);
  const R = cap.rect;
  c.getContext("2d").drawImage(cap.src, R.x, R.y, R.w, R.h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

