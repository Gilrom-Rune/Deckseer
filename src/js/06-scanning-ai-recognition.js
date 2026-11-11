/* ---------------- scanning ---------------- */
let ready = false, current = null, scanSeq = 0;
function setStatus(txt, kind, spinning){
  $("statusTxt").textContent = txt; $("status").className = "status" + (kind ? " " + kind : ""); $("spin").classList.toggle("hide", !spinning);
}
// Which end of the card holds the real name? Better name match wins; if they're close, the reader's own confidence decides
// (upside-down text reads as low-confidence gibberish even when it happens to resemble a card name).
function pickFlipped(up, upR, fl, flR){
  const a = up ? up.score : 0, b = fl ? fl.score : 0;
  if (a < 0.62) return b >= 0.75 && (flR.conf || 0) >= (upR.conf || 0);   // upright unreadable, other end clearly a name
  return b >= 0.9 && b - a >= 0.25 && (flR.conf || 0) > (upR.conf || 0) + 10; // only flip a readable card on overwhelming evidence
}
/* ---------------- AI picture recognition (Stage 2) ----------------
   A small image model (MobileNetV3, made by stage2/build_index.py) turns the straightened card into 256 numbers.
   The index holds the same 256 numbers for every printing (about 100k card faces, int8). The closest rows are the best guesses.
   Files: deckseer-embed.onnx, deckseer-index.bin, deckseer-index.json. On a website they're found next to deckseer.html;
   opened from a file, the user picks them once. Either way they're kept in IndexedDB ("ai:model", "ai:index", "ai:meta").
   Not in Backup: they can be loaded again from the same files. */
const AI_FILES = {model: "deckseer-embed.onnx", index: "deckseer-index.bin", meta: "deckseer-index.json"};
const AI_FILES_OLD = {model: "cardsight-embed.onnx", index: "cardsight-index.bin", meta: "cardsight-index.json"};   // made before the app was renamed
// How sure is sure. Set on synthetic tests only (the Stage 2 self-check: 70% right name first, 52% right printing first).
// Check them against real scans and raise or lower. A card found only by the AI is never added without your OK.
const AI_MIN = 0.45;          // below this, the AI's guess isn't shown at all
const AI_SURE = 0.75;         // with AI_MARGIN: the AI may override a misread name, or confirm a doubtful one
const AI_MARGIN = 0.08;       // how far ahead of the next card name the best one must be
const AI_PRINT_MARGIN = 0.05; // how far ahead of the next printing (of the same card) the best one must be to settle it
const AI = {state: "off", session: null, meta: null, index: null, byId: null, err: "", loading: null};
const aiReady = () => AI.state === "ready";
const aiName = r => AI.meta.names[AI.meta.name[r]];
// "Delver of Secrets" and "Delver of Secrets // Insectile Aberration" are the same card
const cardFaces = n => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(" // ").map(x => x.trim());
const sameCard = (a, b) => { if (!a || !b) return false; const fb = cardFaces(b); return cardFaces(a).some(x => fb.includes(x)); };

async function aiFiles(){
  const [model, index, meta] = await Promise.all([idb.get("kv", "ai:model"), idb.get("kv", "ai:index"), idb.get("kv", "ai:meta")]);
  if (model && index && meta) return {model, index, meta};
  // on a website: the files next to the app
  if (/^https?:$/.test(location.protocol)) {
    try {
      // the files may still have the app's old name (cardsight-…)
      let names = AI_FILES, rm = await fetch(AI_FILES.meta, {cache: "no-store"});
      if (!rm.ok) { names = AI_FILES_OLD; rm = await fetch(names.meta, {cache: "no-store"}); }
      if (!rm.ok) return null;
      const meta2 = await rm.json();
      const [a, b] = await Promise.all([names.model, names.index].map(async f => { const r = await fetch(f, {cache: "no-store"}); if (!r.ok) throw new Error(f + " " + r.status); return r.arrayBuffer(); }));
      await aiStore(a, b, meta2);
      return {model: a, index: b, meta: meta2};
    } catch (e) { console.warn("AI picture files not loaded from the website:", e); return null; }
  }
  return null;
}
async function aiStore(model, index, meta){
  await idb.put("kv", "ai:model", model); await idb.put("kv", "ai:index", index); await idb.put("kv", "ai:meta", meta);
}
function aiCheckFiles(model, index, meta){
  if (!meta || !Array.isArray(meta.id) || !meta.dim || !meta.count || !meta.input) return "deckseer-index.json isn't the right kind of file.";
  if (index.byteLength !== meta.count * meta.dim) return `deckseer-index.bin doesn't match deckseer-index.json (${index.byteLength.toLocaleString()} bytes, expected ${(meta.count * meta.dim).toLocaleString()}). Use the three files from the same run.`;
  if (model.byteLength < 1000) return "deckseer-embed.onnx is too small to be the model.";
  return "";
}
function aiInit(){
  if (AI.loading) return AI.loading;
  return AI.loading = (async () => {
    AI.state = "loading"; AI.err = ""; aiStatus();
    try {
      const f = await aiFiles();
      if (!f) { AI.state = "missing"; return; }
      const bad = aiCheckFiles(f.model, f.index, f.meta); if (bad) throw new Error(bad);
      if (!window.ort) await loadScript(PADDLE.ort);
      ort.env.wasm.wasmPaths = PADDLE.wasm;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      AI.session = await ort.InferenceSession.create(new Uint8Array(f.model), {executionProviders: ["wasm"], graphOptimizationLevel: "all"});
      AI.meta = f.meta; AI.index = new Int8Array(f.index);
      AI.byId = new Map(); f.meta.id.forEach((id, r) => (AI.byId.get(id) || AI.byId.set(id, []).get(id)).push(r));
      AI.state = "ready";
    } catch (e) {
      console.warn("AI picture recognition unavailable:", e);
      AI.state = "failed"; AI.err = e && e.message ? e.message : String(e); AI.session = null;
    } finally { AI.loading = null; aiStatus(); }
  })();
}
// The picture the model expects: the straightened card shrunk to 224x312, RGB, normalised, channels first
function aiTensor(caps){
  const {width: W, height: H, mean, std} = AI.meta.input, plane = W * H;
  const data = new Float32Array(caps.length * 3 * plane);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", {willReadFrequently: true}); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  caps.forEach((cap, k) => {
    const R = cap.rect; g.clearRect(0, 0, W, H); g.drawImage(cap.src, R.x, R.y, R.w, R.h, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, o = k * 3 * plane;
    for (let i = 0; i < plane; i++) for (let ch = 0; ch < 3; ch++) data[o + ch * plane + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  });
  return new ort.Tensor("float32", data, [caps.length, 3, H, W]);
}
function aiScore(q, r){ const D = AI.meta.dim, idx = AI.index, o = r * D; let s = 0; for (let j = 0; j < D; j++) s += idx[o + j] * q[j]; return s / AI.meta.int8_scale; }
// What the AI thinks this card is: the closest card faces, best per name, and the fingerprints (to score any printing later)
async function aiMatch(cap){
  if (!aiReady() || !cap) return null;
  const caps = cap.rectified ? [cap, flipped(cap)] : [cap];
  const out = await AI.session.run({[AI.session.inputNames[0]]: aiTensor(caps)});
  const t = out[AI.session.outputNames[0]], D = AI.meta.dim;
  const qs = caps.map((c, k) => ({v: t.data.slice(k * D, (k + 1) * D), flip: k === 1}));
  // one pass over the index, keeping the 40 best rows
  const K = 40, top = []; let floor = -Infinity;
  const N = AI.meta.count, idx = AI.index, inv = 1 / AI.meta.int8_scale;
  for (let r = 0; r < N; r++) {
    const o = r * D;
    for (const q of qs) {
      let s = 0; const v = q.v; for (let j = 0; j < D; j++) s += idx[o + j] * v[j]; s *= inv;
      if (s > floor || top.length < K) {
        top.push({r, s, flip: q.flip}); top.sort((a, b) => b.s - a.s);
        if (top.length > K) top.length = K;
        floor = top[top.length - 1].s;
      }
    }
  }
  const seen = new Map();
  for (const x of top) { if (seen.has(x.r)) continue; seen.set(x.r, x); }
  const cands = [...seen.values()].map(x => ({r: x.r, s: x.s, flip: x.flip, id: AI.meta.id[x.r], name: aiName(x.r), set: AI.meta.set[x.r], number: AI.meta.num[x.r], face: AI.meta.face[x.r]}));
  const names = []; for (const c of cands) if (!names.some(n => sameCard(n.name, c.name))) names.push(c);
  const best = names[0] || null, margin = best ? best.s - (names[1] ? names[1].s : 0) : 0;
  return {qs, cands, names, best, margin, sure: !!best && best.s >= AI_SURE && margin >= AI_MARGIN};
}
// Score given printings (Scryfall ids) with the fingerprints from aiMatch: best face, either way up
function aiScorePrints(ai, prints){
  if (!ai || !aiReady()) return null;
  const list = prints.map((p, i) => {
    const rows = AI.byId.get(p.id) || []; let s = -2, flip = false;
    for (const r of rows) for (const q of ai.qs) { const x = aiScore(q.v, r); if (x > s) { s = x; flip = q.flip; } }
    return {i, s, flip};
  }).filter(x => x.s > -2).sort((a, b) => b.s - a.s);
  if (!list.length) return null;
  return {index: list[0].i, s: list[0].s, flip: list[0].flip, margin: list[0].s - (list[1] ? list[1].s : 0), known: list.length};
}
// A card's printings from the AI's guess: by name, or (a back face's name) by its Scryfall id
async function aiPrints(hit){
  let prints = await getPrints(hit.name, true).catch(() => []);
  if (!prints.length) { try { const c = await sf(`/cards/${hit.id}`); if (c && c.name) prints = await getPrints(c.name, true); } catch (e) { /* none */ } }
  return prints;
}
async function presentFromAi(ai, cap, wins, infoP, seq, reason, extraAlts){
  const hit = ai.best;
  if (hit.flip && cap.rectified) { cap = flipped(cap); wins = wins.map(w => ({v: w.v, flip: !w.flip})); }
  setStatus(`Looks like ${hit.name}. Comparing printings…`, "", true);
  const [infoR, prints] = await Promise.all([infoP.catch(() => ({text: ""})), aiPrints(hit)]);
  if (seq !== scanSeq) return false;
  if (!prints.length) { setStatus(`Looks like ${hit.name}, but Scryfall has no paper printings for it.`, "err"); return true; }
  const info = parseInfo(infoR.text || "");
  const pick = await pickPrinting(prints, info, wins, ai);
  if (seq !== scanSeq) return false;
  const pct = Math.round(hit.s * 100), cardName = prints[pick.index].name || hit.name;
  const alts = (extraAlts || []).concat(ai.names.slice(1, 5).map(c => ({name: c.name, score: c.s}))).filter((a, i, arr) => !sameCard(a.name, cardName) && arr.findIndex(b => sameCard(b.name, a.name)) === i);
  const diag = [{why: `${reason}, so the AI picture model matched it: ${hit.name} is the closest of ${AI.meta.count.toLocaleString()} card pictures (${pct}%)${ai.sure ? "" : ", but not a sure match"}.`, fix: "If it's wrong, pick the right card under “Not it?” or type the name."}];
  flashHit();
  // a card found only by picture always waits for your OK
  present({name: cardName, alts, prints, sel: pick.index, why: `AI picture match (${pct}%) · ${pick.why}`, info, wins, ai, diag, shot: cardShot(cap), rectified: cap.rectified, flipped: !!cap.flipped, cap}, false, true);
  return true;
}
function aiStatus(){
  const el = $("aiPicInfo"), st = $("aiPicState"); if (!el) return;
  const del = $("aiPicRemove");
  if (AI.state === "ready") {
    el.innerHTML = `Ready: <b>${AI.meta.count.toLocaleString()}</b> card pictures (made ${esc(AI.meta.created || "")}). Used to recognise cards whose name can't be read, to confirm doubtful names, and to choose the printing.`;
    st.textContent = "(on)"; del.hidden = false;
  } else if (AI.state === "loading") { el.textContent = "Loading the AI picture model…"; st.textContent = "(loading)"; del.hidden = true; }
  else if (AI.state === "failed") { el.textContent = `Couldn't start the AI picture model: ${AI.err}`; st.textContent = "(problem)"; del.hidden = false; }
  else {
    el.textContent = /^https?:$/.test(location.protocol)
      ? "Not set up. Click Load files and pick the three files made by the Stage 2 notebook, all at once (…-embed.onnx, …-index.bin, …-index.json). Or put them next to deckseer.html on the website and reload."
      : "Not set up. Click Load files and pick the three files made by the Stage 2 notebook, all at once: …-embed.onnx, …-index.bin and …-index.json (named deckseer-… or, if made earlier, cardsight-…).";
    st.textContent = "(off)"; del.hidden = true;
  }
}
async function aiLoadPicked(fileList){
  const files = [...(fileList || [])], pick = n => files.find(f => f.name.toLowerCase() === n) || files.find(f => f.name.toLowerCase() === n.replace("deckseer", "cardsight")) || files.find(f => f.name.toLowerCase().endsWith(n.slice(n.lastIndexOf("."))));
  const fm = pick(AI_FILES.model), fi = pick(AI_FILES.index), fj = pick(AI_FILES.meta);
  if (!fm || !fi || !fj) return toast("Pick all three files together: deckseer-embed.onnx, deckseer-index.bin and deckseer-index.json.");
  let meta;
  try { meta = JSON.parse(await fj.text()); } catch (e) { return toast("deckseer-index.json couldn't be read."); }
  const [model, index] = await Promise.all([fm.arrayBuffer(), fi.arrayBuffer()]);
  const bad = aiCheckFiles(model, index, meta); if (bad) return toast(bad);
  $("aiPicInfo").textContent = "Saving the files in this browser…";
  await aiStore(model, index, meta);
  AI.state = "off"; await aiInit();
  if (aiReady()) toast(`AI picture recognition is on: ${AI.meta.count.toLocaleString()} card pictures.`);
}
document.addEventListener("change", e => { if (e.target.id === "aiPicFiles") { const fl = e.target.files; aiLoadPicked(fl).finally(() => { e.target.value = ""; }); } });
document.addEventListener("click", async e => {
  if (!e.target.closest("#aiPicRemove")) return;
  for (const k of ["ai:model", "ai:index", "ai:meta"]) await idb.del("kv", k);
  Object.assign(AI, {state: "off", session: null, meta: null, index: null, byId: null, err: ""});
  aiStatus(); toast("AI picture files removed from this browser.");
});

async function scan(auto){
  if (busy || !ready || !guideRect) return false;
  busy = true; const seq = ++scanSeq;
  setStatus("Reading…", "", true);
  try {
    // freeze this moment: find and straighten the card, then take its picture, name strip and collector line
    let cap = await grab();
    if (cap.quad) drawOutline(cap.quad);
    const wins = frameWindows(cap);
    // the AI picture model works alongside the text readers
    const aiP = aiReady() ? aiMatch(cap).catch(e => { console.warn("AI picture match failed:", e); return null; }) : Promise.resolve(null);
    const locks = lockList(), lock = locks.join(" + ");
    // what your earlier scans say this is (only for a straightened card: a guessed crop isn't reliable enough)
    const mem = cap.rectified ? memoryMatch(wins) : null;
    const memFits = m => m && (!locks.length || locks.some(l => String(m.set || "").toUpperCase() === l.toUpperCase()));
    let nameC = grabZone(cap, NAME_ZONE, 90), infoC = grabZone(cap, INFO_ZONE, 80);
    // start both readers right away, in parallel
    let nameP = readName(nameWorker, nameC), infoP = ocr(infoWorker, infoC);
    infoP.catch(() => {});
    // A straightened card may be upside down: always read the other end too, at the same time, and keep whichever makes sense
    const capF = cap.rectified ? flipped(cap) : null, nameFC = capF ? grabZone(capF, NAME_ZONE, 90) : null;
    const nameFP = capF ? readName(flipWorker, nameFC) : null;
    if (nameFP) nameFP.catch(() => {});

    // Fastest path: a card you've scanned before that clearly matches its remembered look skips text reading
    if (memFits(mem) && mem.s >= 0.86 && mem.margin >= 0.1) return await presentMem(mem, cap, wins, infoP, seq, "Recognised from your earlier scans");
    // Fast path: with a Set lock whose pictures are ready, a clear picture match skips text reading entirely
    if (locks.length && locksReady()) {
      const setCards = await lockPool();
      const vis = await visualMatch(setCards, wins);
      if (seq !== scanSeq) return false;
      if (vis && vis.score >= 0.72 && vis.margin >= 0.1) {
        if (vis.flip && cap.rectified) cap = flipped(cap);
        const hit = setCards[vis.index];
        const prints = await getPrints(hit.name).catch(() => []);
        let list = prints, i = list.findIndex(p => p.id === hit.id);
        if (i < 0) { list = [hit].concat(list); i = 0; }
        flashHit();
        present({name: hit.name, prints: list, sel: i, why: `Matched by picture in ${lock} (${Math.round(vis.score * 100)}%)`, info: {set: "", number: ""}, wins, shot: cardShot(cap), rectified: cap.rectified, flipped: !!cap.flipped, cap}, true);
        return true;
      }
    }

    let nameR = await nameP;
    let matches = matchName(nameR.text);
    if (nameFP) {
      const rF = await nameFP.catch(() => ({text: "", conf: 0})), mF = matchName(rF.text);
      if (pickFlipped(matches[0], nameR, mF[0], rF)) {
        cap = capF; nameC = nameFC; nameR = rF; matches = mF;
        infoC = grabZone(cap, INFO_ZONE, 80); infoP = ocr(infoWorker, infoC); infoP.catch(() => {});
      }
    }
    $("peekRow").classList.remove("hide"); const pk = $("peek"); pk.width = nameC.width; pk.height = nameC.height; pk.getContext("2d").drawImage(nameC, 0, 0);
    const shot = cardShot(cap);
    const best = matches[0];

    if (!best || best.score < 0.62) {
      // Name unreadable: a card you've scanned before can still be recognised by its look
      if (memFits(mem) && mem.s >= 0.72 && mem.margin >= 0.07) return await presentMem(mem, cap, wins, infoP, seq, "Name unreadable, but recognised from your earlier scans");
      // Name unreadable (runes, foreign text, odd fonts): identify by picture within the locked set
      if (lock) {
        setStatus(`Name unreadable. Comparing the picture with every ${lock} card…`, "", true);
        const setCards = await lockPool();
        if (seq !== scanSeq) return false;
        const vis = await visualMatch(setCards, wins);
        if (vis && vis.score >= 0.5) {
          const hit = setCards[vis.index];
          let prints = await getPrints(hit.name);
          let i = prints.findIndex(p => p.id === hit.id);
          if (i < 0) { prints = [hit].concat(prints); i = 0; }
          const sure = vis.confident && vis.score >= 0.65;
          flashHit();
          present({name: hit.name, alts: [], prints, sel: i, diag: sure ? [] : [{why: `The name wasn't readable, so it matched by picture. ${hit.name} is the closest ${lock} card (${Math.round(vis.score * 100)}%) but not a sure match.`, fix: "If it's wrong, type the name below or pick the right printing."}], why: sure ? `Matched by picture in ${lock} (${Math.round(vis.score * 100)}%)` : `Closest picture in ${lock} — check it`, info: {set: "", number: ""}, wins, shot: vis.flip && cap.rectified ? cardShot(flipped(cap)) : shot, rectified: cap.rectified, flipped: !!(vis.flip && cap.rectified), cap: vis.flip && cap.rectified ? flipped(cap) : cap}, sure);
          return true;
        }
      }
      const aiU = await aiP;
      if (seq !== scanSeq) return false;
      if (aiU && aiU.best && aiU.best.s >= AI_MIN) return await presentFromAi(aiU, cap, wins, infoP, seq, "The name wasn't readable");
      if (libReady()) {
        setStatus(`Name unreadable. Looking for the picture among ${lib.n.toLocaleString()} cards…`, "", true);
        const lm = await libraryMatch(wins, nameR.text);
        if (seq !== scanSeq) return false;
        if (lm && lm.best.pic >= 0.5) return await presentFromLibrary(lm, cap, wins, infoP, seq, "The name wasn't readable");
      }
      const help = diagnoseFailure(cap, nameC, nameR, matches, lock);
      if (!auto || cap.rectified) showHelp(auto ? "Having trouble with this card:" : "Why it couldn't identify this card:", help);
      const glare = nameC.glare > 0.05;
      const hint = glare ? (prefs.sleeve ? "Glare on the sleeve. Tilt the card a little, or move the light off to the side." : "There's glare on the name. Tilt the card a little away from the light.")
        : !cap.rectified && CV ? "Couldn't see the card's edges. Hold it against a plainer background and keep all four corners in view."
        : "Move the card a bit closer and hold it still.";
      setStatus(auto ? (glare ? hint : "Waiting for a card…")
        : `Couldn't identify this card${nameR.text ? ` (read “${nameR.text.slice(0, 30)}”)` : ""}. ${hint} ${claudeReady() ? "Or press C to ask Claude." : "Or type it in below."}`, auto && !glare ? "" : "err");
      lastShot = {wins, shot, rectified: cap.rectified};
      return false;
    }
    let nameSure0 = best.score >= 0.8 && (!matches[1] || matches[1].score < best.score - 0.08 || matches[1].name === best.name), picAgrees = false;
    const memAgrees = mem && mem.name === best.name && mem.s >= 0.65;
    if (memAgrees) picAgrees = true;
    // the name was misread, but this is clearly a card you've scanned before
    else if (!nameSure0 && memFits(mem) && mem.s >= 0.8 && mem.margin >= 0.1) return await presentMem(mem, cap, wins, infoP, seq, `The name read as “${(nameR.text || "").replace(/\s+/g, " ").trim().slice(0, 30)}”, but it's clearly a card from your earlier scans`);
    const ai = await aiP;
    if (seq !== scanSeq) return false;
    if (ai && ai.best && ai.best.s >= AI_MIN && sameCard(ai.best.name, best.name)) picAgrees = true;
    else if (!nameSure0 && !picAgrees && ai && ai.sure && !ai.names.slice(0, 3).some(n => sameCard(n.name, best.name)))
      return await presentFromAi(ai, cap, wins, infoP, seq, `The name read as “${(nameR.text || "").replace(/\s+/g, " ").trim().slice(0, 30)}”, but the picture clearly matches`, [{name: best.name, score: best.score}]);
    if (!nameSure0 && !picAgrees && libReady()) {
      const lm = await libraryMatch(wins, nameR.text);
      if (seq !== scanSeq) return false;
      if (lm) {
        const same = lm.cands.find(c => c.name === best.name);
        if (lm.best.name === best.name && lm.best.pic >= 0.55) picAgrees = true;
        else if (lm.sure && lm.best.name !== best.name && !(same && same.pic >= lm.best.pic - 0.05))
          return await presentFromLibrary(lm, cap, wins, infoP, seq, `The name read as “${(nameR.text || "").replace(/\s+/g, " ").trim().slice(0, 30)}”, but the picture clearly matches`, [{name: best.name, score: best.score}]);
      }
    }
    flashHit();
    setStatus(`Found ${best.name}. Comparing printings…`, "", true);
    const [infoR, prints] = await Promise.all([infoP.catch(() => ({text: ""})), getPrints(best.name)]);
    const info = parseInfo(infoR.text);
    if (seq !== scanSeq) return false;
    if (!prints.length) { setStatus(`Found ${best.name}, but Scryfall has no paper printings for it.`, "err"); return true; }
    const pick = await pickPrinting(prints, info, wins, ai);
    if (seq !== scanSeq) return false;
    // the printing: if the collector line didn't settle it, the one you've scanned before is the best guess
    if (memAgrees && !pick.sure) { const mi = prints.findIndex(p => p.id === mem.id); if (mi >= 0) { pick.index = mi; pick.why = "the printing you scanned before"; pick.sure = mem.s >= 0.8; } }
    const nameSure = nameSure0 || picAgrees;
    const diag = [];
    if (!nameSure) diag.push({why: `The name read as “${(nameR.text || "").replace(/\s+/g, " ").trim().slice(0, 40)}”, a ${Math.round(best.score * 100)}% match for ${best.name}${matches[1] && matches[1].name !== best.name ? ` (it could also be ${matches[1].name})` : ""}.`,
      fix: sharpness(nameC) < BLURRY ? "The name is a bit blurry: hold still or slightly farther back. Or pick the right card under “Not it?”." : "Pick the right card under “Not it?”, or rescan with the name bar clear of glare and fingers."});
    if (!pick.sure && prints.length > 1) {
      const raw = (infoR.text || "").replace(/\s+/g, " ").trim();
      diag.push({why: info.set || info.number ? `It read the bottom-left collector line as “${raw.slice(0, 30)}”, but that didn't settle which of the ${prints.length} printings this is.` : `It couldn't read the set code and number in the bottom-left corner, and ${prints.length} printings share this name.`,
        fix: "Click your printing below (your photo is next to it), bring the card closer so that tiny text is readable, or set a Set lock for the set you're sorting."});
    }
    present({name: best.name, alts: matches.slice(1).filter(m => m.score >= 0.55), prints, sel: pick.index, why: picAgrees && !nameSure0 ? pick.why + (memAgrees ? " · name confirmed by your earlier scans" : " · name confirmed by picture") : pick.why, info, ai, wins, shot, rectified: cap.rectified, flipped: !!cap.flipped, cap, diag}, nameSure && pick.sure, !nameSure);
    return true;
  } catch (e) {
    console.error(e);
    setStatus(e && /Scryfall|fetch|Network/i.test(String(e.message || e)) ? "Couldn't reach Scryfall. Check your internet connection." : "Something went wrong reading that card. Try again.", "err");
    return false;
  } finally { busy = false; }
}
async function presentFromLibrary(lm, cap, wins, infoP, seq, reason, extraAlts){
  const hit = lm.best;
  if (hit.flip && cap.rectified) { cap = flipped(cap); wins = wins.map(w => ({v: w.v, flip: !w.flip})); }
  setStatus(`Looks like ${hit.name}. Comparing printings…`, "", true);
  const [infoR, prints0] = await Promise.all([infoP.catch(() => ({text: ""})), getPrints(hit.name, true).catch(() => [])]);
  if (seq !== scanSeq) return false;
  let prints = prints0;
  if (!prints.length) { setStatus(`Looks like ${hit.name}, but Scryfall has no paper printings for it.`, "err"); return true; }
  const info = parseInfo(infoR.text || "");
  const pick = await pickPrinting(prints, info, wins);
  if (seq !== scanSeq) return false;
  const sure = lm.sure && hit.pic >= 0.66;
  const alts = (extraAlts || []).concat(lm.cands.slice(1, 4).map(c => ({name: c.name, score: c.score}))).filter((a, i, arr) => a.name !== hit.name && arr.findIndex(b => b.name === a.name) === i);
  const diag = sure ? [] : [{why: `${reason}, so it matched by picture: ${hit.name} is the closest of ${lib.n.toLocaleString()} cards (${Math.round(hit.pic * 100)}%) but not a sure match.`, fix: "If it's wrong, pick the right card under “Not it?” or type the name below."}];
  flashHit();
  present({name: hit.name, alts, prints, sel: pick.index, why: `${sure ? "Matched by picture" : "Closest picture — check it"} (${Math.round(hit.pic * 100)}%) · ${pick.why}`, info, wins, shot: cardShot(cap), rectified: cap.rectified, flipped: !!cap.flipped, cap, diag}, sure && pick.sure, !sure);
  return true;
}
function flashHit(){ $("guide").classList.add("hit"); setTimeout(() => $("guide").classList.remove("hit"), 600); }
let lastShot = null;
// Show your photo the same way up as the card it was identified as (safety net for wrong flips)
async function orientShot(cur){
  try {
    const cap = cur.cap; if (!cap || !cap.rectified || !cur.prints || !cur.prints[cur.sel]) return;
    const ref = await refVec(cur.prints[cur.sel].img); if (!ref) return;
    const R = cap.rect, other = flipped(cap);
    const keep = simScore(fingerprint(cap.src, 0, 0, R.w, R.h), ref), turn = simScore(fingerprint(other.src, 0, 0, R.w, R.h), ref);
    if (turn - keep > 0.05) { cur.cap = other; cur.flipped = !cur.flipped; cur.shot = cardShot(other); }
  } catch (e) { /* keep the photo as captured */ }
}
async function present(c, sure, nameUnsure){
  const cur = Object.assign({foil: prefs.foil, qty: 1, added: false, alts: []}, c);
  await orientShot(cur);
  current = cur;
  lastShot = {wins: cur.wins, shot: cur.shot, rectified: cur.rectified, ai: cur.ai || null};
  fixFoil();
  if (sure) hideHelp(); else showHelp("Not sure about this one:", cur.diag || []);
  if (sure && prefs.add) addCurrent(true);
  else { sound("check"); renderCurrent(); setStatus(nameUnsure ? "Check the card name, then press Enter to add." : "Check the printing (your card is shown next to it), then press Enter to add.", ""); }
}
async function pickPrinting(prints, info, wins, ai){
  const locks = lockList(), lock = locks.length > 0;
  const lc = s => s.toLowerCase();
  if (info.number && info.set) {
    const i = prints.findIndex(p => lc(p.number) === info.number && p.set === info.set);
    if (i >= 0) return {index: i, sure: true, why: "Read set and number from the card"};
  }
  // narrow down with whatever text we could read, then let the picture decide
  let cands = prints, basis = "";
  if (info.number) { const c = prints.filter(p => lc(p.number) === info.number); if (c.length) { cands = c; basis = "number"; } }
  if (cands === prints && info.set) { const c = prints.filter(p => p.set === info.set); if (c.length) { cands = c; basis = "set"; } }
  if (lock) { const c = cands.filter(p => locks.includes(p.set)); if (c.length) { cands = c; basis = basis || "lock"; } }
  const label = {number: "Read collector number from the card", set: "Read set code from the card", lock: "From your locked set"}[basis];
  if (cands.length === 1) return {index: prints.indexOf(cands[0]), sure: true, why: label || "Only one printing exists"};
  // the AI picture model: every printing at once, no downloads
  const aiPick = aiScorePrints(ai, cands);
  if (aiPick && aiPick.margin >= AI_PRINT_MARGIN && aiPick.s >= AI_MIN)
    return {index: prints.indexOf(cands[aiPick.index]), sure: true, why: `Printing matched by the AI picture model (${Math.round(aiPick.s * 100)}%)`};
  const vis = await visualMatch(cands.slice(0, 120), wins);
  if (aiPick && aiPick.s >= AI_MIN && !(vis && vis.confident))
    return {index: prints.indexOf(cands[aiPick.index]), sure: false, why: `Closest picture of ${cands.length} printings (AI) — check it`};
  if (vis) {
    const p = cands[vis.index];
    return {index: prints.indexOf(p), sure: vis.confident,
      why: vis.confident ? `Matched by picture (${Math.round(vis.score * 100)}%)` : `Closest picture of ${cands.length} printings — check it`};
  }
  return {index: prints.indexOf(cands[0]), sure: basis === "lock", why: basis === "lock" ? label : `Newest of ${cands.length} printings — check it`};
}
function fixFoil(){
  if (!current) return;
  const p = current.prints[current.sel];
  if (!p.finishes.includes("nonfoil")) current.foil = true;
  else if (!p.finishes.includes("foil") && !p.finishes.includes("etched")) current.foil = false;
}

const CONDS = [["NM","Near Mint"],["LP","Lightly Played"],["MP","Moderately Played"],["HP","Heavily Played"],["DMG","Damaged"]];
const FORMATS = [["standard","Standard"],["pioneer","Pioneer"],["modern","Modern"],["legacy","Legacy"],["vintage","Vintage"],["commander","Commander"],["pauper","Pauper"]];
const condOpts = sel => CONDS.map(([c, n]) => `<option value="${c}" ${c === sel ? "selected" : ""}>${n}</option>`).join("");
const isValuable = v => prefs.alertAt > 0 && v >= prefs.alertAt;
// The scanner's left side (camera, current card) stays in view while the session list scrolls. When it's taller than
// the screen (all printings showing), it scrolls with the page until its bottom is in view, then stays: the Add button
// is never pushed out of reach.
(() => {
  const el = document.querySelector("main > .left, .left"); if (!el || typeof ResizeObserver === "undefined") return;
  const fit = () => { const h = el.offsetHeight; el.style.top = Math.min(12, innerHeight - h - 12) + "px"; };
  new ResizeObserver(fit).observe(el); addEventListener("resize", fit); fit();
})();
const PRINTS_FIRST = 12;
function printsShown(i){
  const all = current.showAllPrints || current.prints.length <= PRINTS_FIRST + 2;
  printsShown.hidden = !all;
  return all || i < PRINTS_FIRST || i === current.sel;
}
function renderCurrent(){
  const el = $("current");
  if (!current) { el.innerHTML = `<div class="cur-empty">The last card you scan shows up here so you can check its printing.</div>`; return; }
  const p = current.prints[current.sel];
  const canFoil = p.finishes.includes("foil") || p.finishes.includes("etched"), canNon = p.finishes.includes("nonfoil");
  const val = priceOf(p, current.foil), usd = priceOf(p, current.foil, "usd"), eur = priceOf(p, current.foil, "eur");
  if (!current.cond) current.cond = prefs.cond;
  el.innerHTML = `
    <div class="cur-head">
      <div class="pair">
        <figure><img src="${esc(p.imgN)}" alt="${esc(p.name)} from ${esc(p.setName)}"><figcaption>Scryfall</figcaption></figure>
        ${current.shot ? `<figure><img src="${current.shot}" alt="Your card from the webcam"><figcaption>Your card</figcaption></figure>` : ""}
      </div>
      <div class="cur-info">
        <div class="cur-name">${esc(p.name)} ${costGems(p.cost)}</div>
        ${p.printedName && p.printedName !== p.name ? `<div class="cur-sub">Printed as “${esc(p.printedName)}”</div>` : ""}
        <div class="cur-sub"><span class="dot ${esc(p.rarity)}"></span>${esc(p.setName)} <span class="chip">${esc(p.set)} · ${esc(p.number)}</span>${p.lang !== "en" ? ` <b class="lang">${esc(p.lang.toUpperCase())}</b>` : ""}</div>
        <div class="cur-price">${val ? money(val) : "No price"}${current.foil ? ' <span class="foil">★ Foil</span>' : ""}${isValuable(val) ? '<span class="valbadge">Valuable</span>' : ""}</div>
        <div class="prices2">TCGplayer ${usd ? money(usd, "usd") : "—"} · Cardmarket ${eur ? money(eur, "eur") : "—"}</div>
        <div class="${current.why.includes("check") ? "flag" : "cur-sub"}">${esc(current.why)}</div>
        ${current.alts.length ? `<div class="alts"><span class="cur-sub">Not it?</span>${current.alts.map(a => `<button type="button" data-alt="${esc(a.name)}">${esc(a.name)}</button>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="prints-head"><span>${current.prints.length} printing${current.prints.length > 1 ? "s" : ""}${current.allLangs ? " in all languages" : ""}</span>${current.allLangs ? "<span>English first, then newest</span>" : `<button type="button" class="more-langs" id="moreLangs">Show other languages</button>`}</div>
    <div class="prints" id="prints">${current.prints.map((q, i) => (printsShown(i) ? `
      <button type="button" class="pr ${i === current.sel ? "sel" : ""}" data-i="${i}" title="${esc(q.setName)} #${esc(q.number)} (${esc((q.released || "").slice(0,4))})">
        <img loading="lazy" src="${esc(q.img)}" alt=""><span>${esc(q.set)} ${esc(q.number)}${q.lang !== "en" ? `<b class="lang">${esc(q.lang.toUpperCase())}</b>` : ""}</span><span>${priceOf(q, current.foil) ? money(priceOf(q, current.foil)) : "—"}</span>
      </button>` : "")).join("")}</div>
    ${printsShown.hidden ? `<button type="button" class="linkbtn prints-all" id="showAllPrints">Show all ${current.prints.length} printings</button>` : ""}
    <div class="cur-actions">
      <button class="btn primary" type="button" id="addBtn" ${current.added ? "disabled" : ""}>${current.added ? "Added" : esc(targetLabel())} <kbd>Enter</kbd></button>
      ${current.added ? `<button class="btn" type="button" id="againBtn">Add another <kbd>R</kbd></button>` : ""}
      <label class="chk">Qty <input class="qty" type="number" min="1" max="99" id="curQty" value="${current.qty}"></label>
      <label class="chk"><input type="checkbox" id="curFoil" ${current.foil ? "checked" : ""} ${canFoil && canNon ? "" : "disabled"}> Foil</label>
      <select id="curCond" aria-label="Condition">${condOpts(current.cond)}</select>
    </div>
    ${p.type || p.text ? `<details class="details" id="curDetails" ${prefs.showText ? "open" : ""}>
      <summary>Card text and legality</summary>
      <div class="cur-sub">${esc(p.type)}</div>
      <div class="oracle">${esc(p.text || "")}</div>
      <div class="legal">${FORMATS.map(([f, n]) => `<span class="${p.legal && p.legal[f] === "legal" ? "ok" : p.legal && p.legal[f] === "restricted" ? "ok" : "no"}" title="${esc((p.legal && p.legal[f]) || "unknown").replace("_", " ")}">${n}${p.legal && p.legal[f] === "restricted" ? " (1)" : ""}</span>`).join("")}</div>
    </details>` : ""}`;
  const sel = el.querySelector(".pr.sel"); if (sel) sel.scrollIntoView({block: "nearest"});
  const det = el.querySelector("#curDetails"); if (det) det.addEventListener("toggle", () => { prefs.showText = det.open; savePrefs(); });
}
$("current").addEventListener("click", async e => {
  if (e.target.closest("#showAllPrints") && current) { current.showAllPrints = true; return renderCurrent(); }
  const pr = e.target.closest(".pr");
  if (pr && current) { current.sel = +pr.dataset.i; current.why = "Picked by you"; fixFoil(); current.added = false; renderCurrent(); return; }
  if (e.target.closest("#addBtn")) { addCurrent(false); return; }
  if (e.target.closest("#againBtn")) { addAnother(); return; }
  if (e.target.closest("#moreLangs") && current) {
    setStatus("Loading other languages…", "", true);
    try {
      const keepId = current.prints[current.sel].id;
      const prints = await getPrints(current.name, true);
      const i = prints.findIndex(p => p.id === keepId);
      Object.assign(current, {prints, sel: i >= 0 ? i : 0, allLangs: true});
      renderCurrent(); setStatus(`${prints.length} printings. Click yours, then press Enter.`, "");
    } catch (err) { setStatus("Couldn't reach Scryfall. Check your internet connection.", "err"); }
    return;
  }
  const alt = e.target.closest("button[data-alt]");
  if (alt && current) {
    setStatus("Looking up printings…", "", true);
    try {
      const prints = await getPrints(alt.dataset.alt);
      const pick = await pickPrinting(prints, current.info, current.wins, current.ai);
      current = Object.assign(current, {name: alt.dataset.alt, alts: [], prints, sel: pick.index, why: pick.why, added: false});
      fixFoil(); renderCurrent(); setStatus("Press Enter to add.", "");
    } catch (err) { setStatus("Couldn't reach Scryfall. Check your internet connection.", "err"); }
  }
});
$("current").addEventListener("change", e => {
  if (!current) return;
  if (e.target.id === "curFoil") { current.foil = e.target.checked; renderCurrent(); }
  if (e.target.id === "curQty") current.qty = Math.max(1, Math.min(99, parseInt(e.target.value) || 1));
  if (e.target.id === "curCond") { current.cond = e.target.value; if (current.added) recondLast(current.cond); }
});

