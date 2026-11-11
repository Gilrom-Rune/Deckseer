/* ---------------- OCR ---------------- */
// Three readers, each set up once: the name bar, the name bar read upside down, and the collector line. They run at the same time.
let nameWorker = null, flipWorker = null, infoWorker = null;
const NAME_PARAMS = {tessedit_pageseg_mode: "7", preserve_interword_spaces: "1", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÆæáéíóúâûàöü ',-"};
async function initOCR(){
  [nameWorker, flipWorker, infoWorker] = await Promise.all([Tesseract.createWorker("eng", 1), Tesseract.createWorker("eng", 1), Tesseract.createWorker("eng", 1)]);
  await Promise.all([
    nameWorker.setParameters(NAME_PARAMS), flipWorker.setParameters(NAME_PARAMS),
    infoWorker.setParameters({tessedit_pageseg_mode: "6", preserve_interword_spaces: "1", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•·.* -"})
  ]);
}
async function ocr(worker, canvas){
  const {data} = await worker.recognize(canvas);
  return {text: (data.text || "").trim(), conf: data.confidence || 0};
}
// Tested on simulated webcam name bars: plain 0–1 input and a tight crop around the letters read best.
const PADDLE_NORM = false, PADDLE_TIGHT = true;
/* ---------------- second text reader (PaddleOCR) ----------------
   A neural text reader trained on photos of text, which copes better than Tesseract with the stylized card fonts,
   blur and glare. It reads Latin-alphabet names including accents (English, French, German, Spanish, Italian,
   Portuguese cards). It runs alongside Tesseract and the name that matches a real card better wins.
   Downloaded once (about 9 MB) and kept in this browser; if it can't load, Tesseract carries on alone.
   Model: PaddleOCR latin PP-OCRv3 (Apache-2.0), via Kazuhito00/PaddleOCR-ONNX-Sample. */
const PADDLE = {
  ort: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js",
  wasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/",
  model: "https://cdn.jsdelivr.net/gh/Kazuhito00/PaddleOCR-ONNX-Sample@05666adf8a3274017552cb3cac552cb1e134fb66/ppocr_onnx/model/rec_model/latin_PP-OCRv3_rec_infer.onnx",
  sha256: "561bae8b0dcf2db7694d1f78c6438517c898d456701ab2e5598c03b50258702f",
  key: "ocr:latin-v3"
};
const PADDLE_CHARS = [..." !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_`abcdefghijklmnopqrstuvwxyz{}\u00a1\u00a3\u00a7\u00aa\u00ab\u00ad\u00b0\u00b2\u00b3\u00b4\u00b5\u00b7\u00ba\u00bb\u00bf\u00c0\u00c1\u00c2\u00c4\u00c5\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d2\u00d3\u00d4\u00d5\u00d6\u00da\u00dc\u00dd\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u0105\u0106\u0107\u010c\u010d\u0110\u0111\u0119\u0131\u0141\u0142\u014d\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0292\u03b2\u03b4\u03b5\u0437\u1e60\u2018\u20ac\u2122", " "];
let paddle = null, paddleState = "off", paddleQueue = Promise.resolve();
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.crossOrigin = "anonymous"; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); }); }
async function sha256hex(buf){
  if (!(window.crypto && crypto.subtle)) return null;
  const h = await crypto.subtle.digest("SHA-256", buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function initPaddle(){
  if (paddle || paddleState === "loading") return;
  paddleState = "loading"; readerStatus();
  try {
    if (!window.ort) await loadScript(PADDLE.ort);
    ort.env.wasm.wasmPaths = PADDLE.wasm;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    let buf = await idb.get("kv", PADDLE.key);
    if (!buf) {
      const r = await fetch(PADDLE.model); if (!r.ok) throw new Error("model " + r.status);
      buf = await r.arrayBuffer();
      const h = await sha256hex(buf); if (h && h !== PADDLE.sha256) throw new Error("model checksum mismatch");
      idb.put("kv", PADDLE.key, buf);
    }
    const session = await ort.InferenceSession.create(new Uint8Array(buf), {executionProviders: ["wasm"], graphOptimizationLevel: "all"});
    paddle = {session, input: session.inputNames[0], output: session.outputNames[0]};
    paddleState = "ready";
  } catch (e) { console.warn("Second text reader unavailable:", e); paddle = null; paddleState = "failed"; }
  readerStatus();
}
// keep only the rows that hold the text, so the letters fill the reader's 48-pixel line height
function textBand(g, w, h){
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) { let dark = 0; for (let x = 0; x < w; x++) if (g[y * w + x] < 128) dark++; rows[y] = dark / w; }
  let y0 = -1, y1 = -1; for (let y = 0; y < h; y++) if (rows[y] > 0.02) { if (y0 < 0) y0 = y; y1 = y; }
  if (y0 < 0 || y1 - y0 < 8) return [0, h];
  const pad = Math.max(2, Math.round((y1 - y0) * 0.12));
  return [Math.max(0, y0 - pad), Math.min(h, y1 + pad + 1)];
}
// canvas: the grayscale, contrast-stretched name strip from grabZone (dark text on light)
function paddleRead(canvas){
  const run = paddleQueue.then(async () => {
    if (!paddle) return null;
    const W = canvas.width, H = canvas.height, px = canvas.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, W, H).data;
    const g = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) g[i] = px[i * 4];
    const [y0, y1] = PADDLE_TIGHT ? textBand(g, W, H) : [0, H];
    const bh = y1 - y0, nw = Math.max(16, Math.min(1600, Math.round(W * 48 / bh)));
    const c = document.createElement("canvas"); c.width = nw; c.height = 48;
    const cg = c.getContext("2d", {willReadFrequently: true}); cg.imageSmoothingQuality = "high";
    cg.drawImage(canvas, 0, y0, W, bh, 0, 0, nw, 48);
    const d = cg.getImageData(0, 0, nw, 48).data, n = nw * 48, x = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { const v = PADDLE_NORM ? d[i * 4] / 127.5 - 1 : d[i * 4] / 255; x[i] = x[n + i] = x[2 * n + i] = v; }
    const out = (await paddle.session.run({[paddle.input]: new ort.Tensor("float32", x, [1, 3, 48, nw])}))[paddle.output];
    const [, T, C] = out.dims, p = out.data; let text = "", sum = 0, cnt = 0, prev = -1;
    for (let t = 0; t < T; t++) {
      let bi = 0, bv = -1; for (let k = 0; k < C; k++) { const v = p[t * C + k]; if (v > bv) { bv = v; bi = k; } }
      if (bi !== 0 && bi !== prev) { text += PADDLE_CHARS[bi - 1] || ""; sum += bv; cnt++; }
      prev = bi;
    }
    return {text: text.trim(), conf: cnt ? sum / cnt * 100 : 0, by: "paddle"};
  });
  paddleQueue = run.catch(() => {});
  return run;
}
// Read the name bar with both readers and keep whichever names a real card more clearly
async function readName(worker, canvas){
  const tP = ocr(worker, canvas).catch(() => ({text: "", conf: 0}));
  const pP = paddle ? paddleRead(canvas).catch(() => null) : Promise.resolve(null);
  const [t, p] = await Promise.all([tP, pP]);
  if (!p || !p.text) return t;
  const mt = matchName(t.text)[0], mp = matchName(p.text)[0];
  return (mp ? mp.score : 0) > (mt ? mt.score : 0) + 0.01 ? p : t;
}
function readerStatus(){
  const el = $("readerState"); if (!el) return;
  el.textContent = {off: "", loading: "Loading the improved text reader (one-time, about 9 MB)…", ready: "Improved text reader on.", failed: "Improved text reader couldn't load, so only the basic reader is used. It will try again next time."}[paddleState] || "";
}


