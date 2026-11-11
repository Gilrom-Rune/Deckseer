/* ---------------- camera ---------------- */
const video = $("video");
let stream = null, guideRect = null;
const work = document.createElement("canvas");
async function listCams(){
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    $("camSel").innerHTML = devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || "Camera " + (i + 1))}</option>`).join("") || "<option>No camera found</option>";
    const cur = stream && stream.getVideoTracks()[0] && stream.getVideoTracks()[0].getSettings().deviceId;
    if (cur) $("camSel").value = cur;
  } catch (e) {}
}
async function startCam(deviceId){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus("This browser can't use a webcam. Open the file in Chrome, Edge or Firefox.", "err"); return; }
  if (stream) stream.getTracks().forEach(t => t.stop());
  try {
    // on a phone or tablet, the camera on the back (it can be switched in the Camera list)
    const back = !deviceId && isPhone() ? {facingMode: {ideal: "environment"}} : {};
    stream = await navigator.mediaDevices.getUserMedia({audio:false, video: Object.assign({width:{ideal:1920}, height:{ideal:1080}}, back, deviceId ? {deviceId:{exact:deviceId}} : {})});
  } catch (e) {
    setStatus(e && e.name === "NotAllowedError" ? "Webcam access was blocked. Click the camera icon in the address bar, allow it, then try again." : "Couldn't start the webcam. Check that no other app is using it.", "err");
    return;
  }
  video.srcObject = stream; await video.play().catch(() => {});
  $("idle").classList.add("hide"); ["guide","zName","zInfo"].forEach(id => $(id).classList.remove("hide"));
  $("scanNow").disabled = !ready; syncAiUI();
  const s = stream.getVideoTracks()[0].getSettings(); prefs.cam = s.deviceId || ""; savePrefs();
  torchSetup();
  await listCams(); layoutGuide(); savedExposure = null; lowCamSaved = null; roomLum = null; if (prefs.sleeve) sleeveExposure(true); if (lowLight()) lowLightCamera(true);
  if (ready) setStatus(CV ? (prefs.auto ? "Hold a card up to the camera. A green outline means it's found the card." : "Hold a card up and press Space.") : (prefs.auto ? "Hold a card inside the frame, name at the top." : "Hold a card in the frame and press Space."));
}
$("startCam").onclick = () => startCam(prefs.cam || undefined);
document.addEventListener("click", e => { if (e.target.closest("#memForget")) { for (const id of Object.keys(memMeta)) forgetCard(id, true); saveMemMeta(); renderMemInfo(); toast("Forgot everything learned from your scans."); } });
// phones and tablets: a touch screen and no mouse
function isPhone(){ return matchMedia("(pointer:coarse)").matches && !matchMedia("(pointer:fine)").matches; }
// the phone's flashlight, when the camera has one (Android Chrome; not iPhone)
let torchOn = false;
function torchSetup(){
  const tr = stream && stream.getVideoTracks()[0], caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
  const has = !!caps.torch; $("torchBtn").hidden = !has; torchOn = false; $("torchBtn").setAttribute("aria-pressed", false);
  // a back camera points away from the screen, so the screen light can't help it
  const facing = tr && tr.getSettings ? tr.getSettings().facingMode : "";
  $("screenLight").hidden = facing === "environment";
}
async function torch(on){
  const tr = stream && stream.getVideoTracks()[0]; if (!tr) return;
  try { await tr.applyConstraints({advanced: [{torch: on}]}); torchOn = on; $("torchBtn").setAttribute("aria-pressed", on); setStatus(on ? "Flashlight on. If there's glare, tilt the card a little." : "Flashlight off.", ""); }
  catch (e) { setStatus("Couldn't turn on the flashlight on this phone.", "err"); }
}
$("torchBtn").onclick = () => torch(!torchOn);
function screenLight(on){
  document.body.classList.toggle("lit", on);
  $("screenLight").setAttribute("aria-pressed", on);
  let x = $("litOff");
  if (on && !x) { x = document.createElement("button"); x.id = "litOff"; x.type = "button"; x.className = "btn lit-off"; x.textContent = "Turn off screen light (Esc)"; x.onclick = () => screenLight(false); document.body.append(x); }
  if (!on && x) x.remove();
  if (on) setStatus("Screen light on. Turn your screen brightness all the way up and hold the card close to the camera.", "ok");
  setTimeout(layoutGuide, 50);
}
$("screenLight").onclick = () => screenLight(!document.body.classList.contains("lit"));
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("lit")) screenLight(false); });
$("optLow").value = prefs.lowLight || "auto";
$("optLow").onchange = e => { const was = lowLight(); prefs.lowLight = e.target.value; savePrefs(); if (lowLight() !== was) lowLightChanged(); else { const el = $("lowBadge"); if (el) el.hidden = !lowLight(); } setStatus(prefs.lowLight === "on" ? "Low light mode on." : prefs.lowLight === "off" ? "Low light mode off." : "Low light mode turns on by itself when the room is dark.", "ok"); };
$("camSel").onchange = e => startCam(e.target.value);

function layoutGuide(){
  if (!video.videoWidth) return;
  const box = $("cam").getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.min(box.width / vw, box.height / vh);
  const dispW = vw * scale, dispH = vh * scale, offX = (box.width - dispW) / 2, offY = (box.height - dispH) / 2;
  // guide in video pixels: card-shaped, 86% of frame height
  const gh = vh * 0.86, gw = gh * CARD_RATIO;
  guideRect = {x: (vw - gw) / 2, y: (vh - gh) / 2, w: gw, h: gh};
  const place = (el, r) => Object.assign(el.style, {left: offX + r.x * scale + "px", top: offY + r.y * scale + "px", width: r.w * scale + "px", height: r.h * scale + "px"});
  place($("guide"), guideRect);
  place($("zName"), zoneRect(NAME_ZONE)); place($("zInfo"), zoneRect(INFO_ZONE));
}
const zoneRect = z => ({x: guideRect.x + z.x * guideRect.w, y: guideRect.y + z.y * guideRect.h, w: z.w * guideRect.w, h: z.h * guideRect.h});
window.addEventListener("resize", layoutGuide);
video.addEventListener("loadedmetadata", layoutGuide);

/* ---------------- finding the card (OpenCV) ----------------
   Looks for the card's outline anywhere in view, then straightens it into a flat, upright card image,
   so tilt, rotation and position stop mattering. Falls back to the guide box if it can't find edges. */
const CARD_W = 716, CARD_H = 1000;
let CV = null;
const cvLoad = new Promise(resolve => {
  const urls = ["https://docs.opencv.org/4.10.0/opencv.js", "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js"];
  let settled = false;
  const fin = m => { if (settled) return; settled = true; resolve(m && m.Mat ? {cv: m} : null); };
  setTimeout(() => fin(null), 45000);
  const tryUrl = i => {
    if (i >= urls.length) return fin(null);
    const el = document.createElement("script"); el.async = true; el.src = urls[i];
    el.onerror = () => { el.remove(); tryUrl(i + 1); };
    el.onload = () => {
      const c = window.cv;
      if (!c) return tryUrl(i + 1);
      if (c.Mat) return fin(c);
      if (typeof c.then === "function") { try { c.then(m => fin(m && m.Mat ? m : window.cv)); } catch (e) {} }
      else if (typeof c === "function") { try { const r = c(); if (r && typeof r.then === "function") r.then(m => fin(m)); else if (r && r.Mat) fin(r); } catch (e) {} }
      else c.onRuntimeInitialized = () => fin(window.cv);
      const poll = setInterval(() => { if (settled) return clearInterval(poll); if (window.cv && window.cv.Mat) { clearInterval(poll); fin(window.cv); } }, 150);
    };
    document.head.appendChild(el);
  };
  tryUrl(0);
}).then(r => { CV = r && r.cv; if (CV) $("cam").classList.add("free"); return !!CV; });

function orderQuad(pts){
  const by = f => pts.reduce((a, b) => f(b) < f(a) ? b : a);
  const tl = by(p => p.x + p.y), br = by(p => -(p.x + p.y)), tr = by(p => p.y - p.x), bl = by(p => p.x - p.y);
  return [tl, tr, br, bl];
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function quadArea(q){ let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
// How much of a quad side lies on detected edges (a thumb over one edge still leaves most of it)
function edgeSupport(ed, cols, rows, a, b){
  let hit = 0; const n = 40;
  for (let k = 0; k < n; k++) {
    const t = 0.05 + 0.9 * k / (n - 1), x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
    if (x >= 0 && x < cols && y >= 0 && y < rows && ed[y * cols + x]) hit++;
  }
  return hit / n;
}
const FIND_DEFAULT = {canny: [40, 120], dilate: 2, minArea: 0.05, maxArea: 0.92, minR: 0.62, maxR: 0.82, minSup: 0.45, avgSup: 0.7};
const FIND_SLEEVE = Object.assign({}, FIND_DEFAULT, {canny: [30, 90]});       // sleeve plastic softens edges
const FIND_INNER = {canny: [25, 75], dilate: 1, minArea: 0.70, maxArea: 0.985, minR: 0.66, maxR: 0.77, minSup: 0.35, avgSup: 0.55};
function findCard(canvas, o){
  if (!CV) return null;
  o = o || FIND_DEFAULT;
  const src = CV.imread(canvas), gray = new CV.Mat(), edges = new CV.Mat(), contours = new CV.MatVector(), hier = new CV.Mat();
  const kernel = CV.getStructuringElement(CV.MORPH_RECT, new CV.Size(3, 3));
  let best = null;
  try {
    CV.cvtColor(src, gray, CV.COLOR_RGBA2GRAY);
    if (o.dark) CV.equalizeHist(gray, gray);
    CV.GaussianBlur(gray, gray, new CV.Size(5, 5), 0);
    CV.Canny(gray, edges, o.canny[0], o.canny[1]);
    CV.dilate(edges, edges, kernel, new CV.Point(-1, -1), o.dilate);
    CV.findContours(edges, contours, hier, CV.RETR_LIST, CV.CHAIN_APPROX_SIMPLE);
    const ed = edges.data, cols = edges.cols, rows = edges.rows, frameArea = cols * rows;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = CV.contourArea(cnt);
      if (area < frameArea * o.minArea || area > frameArea * o.maxArea) { cnt.delete(); continue; }
      // Corners of the outline's convex hull; a thumb adds an extra bump, so try every 4 of them
      const hull = new CV.Mat(); CV.convexHull(cnt, hull, false, true);
      const hullArea = CV.contourArea(hull), peri = CV.arcLength(hull, true);
      let V = null;
      for (const eps of [0.01, 0.015, 0.02, 0.03, 0.04]) {
        const ap = new CV.Mat(); CV.approxPolyDP(hull, ap, eps * peri, true);
        if (ap.rows <= 9) { const d = ap.data32S; V = []; for (let k = 0; k < ap.rows; k++) V.push({x: d[k * 2], y: d[k * 2 + 1]}); ap.delete(); break; }
        ap.delete();
      }
      hull.delete(); cnt.delete();
      if (!V || V.length < 4) continue;
      const n = V.length;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
        const q = orderQuad([V[a], V[b], V[c], V[d]]);
        const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
        if (h <= w) continue;                                   // cards are held upright
        const r = w / h; if (r < o.minR || r > o.maxR) continue;    // a real card is 0.716
        const qa = quadArea(q); if (qa < 0.55 * hullArea || qa < frameArea * o.minArea || qa > frameArea * o.maxArea) continue;
        let sum = 0, min = 1;
        for (let k = 0; k < 4; k++) { const sp = edgeSupport(ed, cols, rows, q[k], q[(k + 1) % 4]); sum += sp; if (sp < min) min = sp; }
        const sup = sum / 4;
        if (min < o.minSup || sup < o.avgSup) continue;
        const score = qa * sup * sup * (1 - Math.abs(r - CARD_RATIO) * 2);
        if (!best || score > best.score) best = {q, score};
      }
    }
  } finally { src.delete(); gray.delete(); edges.delete(); contours.delete(); hier.delete(); kernel.delete(); }
  return best;
}
function warpCard(frame, q){
  const src = CV.imread(frame), out = new CV.Mat();
  const from = CV.matFromArray(4, 1, CV.CV_32FC2, q.flatMap(p => [p.x, p.y]));
  const to = CV.matFromArray(4, 1, CV.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);
  const M = CV.getPerspectiveTransform(from, to);
  try {
    CV.warpPerspective(src, out, M, new CV.Size(CARD_W, CARD_H), CV.INTER_LINEAR, CV.BORDER_REPLICATE, new CV.Scalar());
    const c = document.createElement("canvas"); CV.imshow(c, out); return c;
  } finally { src.delete(); out.delete(); from.delete(); to.delete(); M.delete(); }
}
const detC = document.createElement("canvas");
function detectIn(source, sw, sh, targetW, opts){
  const k = targetW / sw; detC.width = targetW; detC.height = Math.round(sh * k);
  detC.getContext("2d", {willReadFrequently: true}).drawImage(source, 0, 0, detC.width, detC.height);
  const base = opts || (prefs.sleeve ? FIND_SLEEVE : FIND_DEFAULT);
  let f = findCard(detC, lowLight() && !opts ? Object.assign({}, base, {dark: true, canny: [base.canny[0] * 0.8, base.canny[1] * 0.85]}) : base);
  if (!f && lowLight() && !opts) f = findCard(detC, base);   // equalizing can also bring out background clutter: try the plain way too
  if (f) f.q = f.q.map(p => ({x: p.x / k, y: p.y / k}));
  return f;
}
// Freeze one frame: either the straightened card, or the guide box as a fallback.
function capture(){
  const vw = video.videoWidth, vh = video.videoHeight;
  const frame = document.createElement("canvas"); frame.width = vw; frame.height = vh;
  frame.getContext("2d").drawImage(video, 0, 0);
  if (CV) {
    try {
      const f = detectIn(frame, vw, vh, 800);
      if (f) return {src: warpCard(frame, f.q), rect: {x: 0, y: 0, w: CARD_W, h: CARD_H}, rectified: true, quad: f.q};
    } catch (e) { console.warn("card finding failed", e); }
  }
  return {src: frame, rect: guideRect, rectified: false};
}
// The card inside a sleeve: the largest card-shaped outline covering 70–98% of the straightened sleeve
function findInner(card){
  const f = detectIn(card, card.width, card.height, 358, FIND_INNER);
  return f ? f.q : null;
}
// Average each pixel over the frames where it isn't blown out by glare; glare that moves even a little disappears
function mergeCards(cards){
  const W = CARD_W, H = CARD_H, n = W * H;
  const datas = cards.map(c => c.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, W, H).data);
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const og = out.getContext("2d"), od = og.createImageData(W, H), o = od.data;
  for (let i = 0; i < n; i++) {
    const p = i * 4; let r = 0, g = 0, b = 0, c = 0, mr = 255, mg = 255, mb = 255;
    for (const d of datas) {
      const R = d[p], G = d[p + 1], B = d[p + 2];
      if (R < mr) mr = R; if (G < mg) mg = G; if (B < mb) mb = B;
      if (Math.min(R, G, B) <= 235) { r += R; g += G; b += B; c++; }
    }
    if (c) { o[p] = r / c; o[p + 1] = g / c; o[p + 2] = b / c; } else { o[p] = mr; o[p + 1] = mg; o[p + 2] = mb; }
    o[p + 3] = 255;
  }
  og.putImageData(od, 0, 0);
  return out;
}
async function captureSleeved(frames){
  const caps = [];
  for (let i = 0; i < frames; i++) { if (i) await sleep(70); const c = capture(); if (c.rectified) caps.push(c); }
  if (!caps.length) return capture();
  let card = caps.length > 1 ? mergeCards(caps.map(c => c.src)) : caps[0].src, inner = false;
  try { const iq = findInner(card); if (iq) { card = warpCard(card, iq); inner = true; } } catch (e) { console.warn("inner card search failed", e); }
  return {src: card, rect: {x: 0, y: 0, w: CARD_W, h: CARD_H}, rectified: true, quad: caps[caps.length - 1].quad, sleeve: true, inner, frames: caps.length};
}
async function captureStacked(frames){
  const caps = [];
  for (let i = 0; i < frames; i++) { if (i) await sleep(60); const c = capture(); if (c.rectified) caps.push(c); }
  if (caps.length < 2) return caps[0] || capture();
  return Object.assign({}, caps[caps.length - 1], {src: mergeCards(caps.map(c => c.src)), frames: caps.length, low: true});
}
const grab = () => prefs.sleeve ? captureSleeved(lowLight() ? 6 : 4) : lowLight() ? captureStacked(5) : Promise.resolve(capture());
function flipped(cap){
  const c = document.createElement("canvas"); c.width = cap.src.width; c.height = cap.src.height;
  const g = c.getContext("2d"); g.translate(c.width, c.height); g.rotate(Math.PI); g.drawImage(cap.src, 0, 0);
  return Object.assign({}, cap, {src: c, flipped: !cap.flipped});
}

function grabZone(cap, z, targetH){
  const R = cap.rect, r = {x: R.x + z.x * R.w, y: R.y + z.y * R.h, w: z.w * R.w, h: z.h * R.h};
  // pad the crop a little; more when we're guessing from the guide box
  const loose = !cap.rectified || (cap.sleeve && !cap.inner);
  const padX = r.w * (loose ? (cap.sleeve ? 0.05 : 0.04) : 0.02), padY = r.h * (loose ? (cap.sleeve ? 0.35 : 0.25) : 0.15);
  const W = cap.src.width || video.videoWidth, H = cap.src.height || video.videoHeight;
  const sx = Math.max(0, r.x - padX), sy = Math.max(0, r.y - padY), sw = Math.min(W - sx, r.w + padX * 2), sh = Math.min(H - sy, r.h + padY * 2);
  const scale = Math.max(1, targetH / sh);
  const c = document.createElement("canvas"); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  const g = c.getContext("2d", {willReadFrequently: true});
  g.imageSmoothingQuality = "high";
  g.drawImage(cap.src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  // grayscale + contrast stretch; invert light-on-dark text; measure glare
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  let sum = 0, hot = 0; const n = px.length / 4, gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) { const v = 0.299 * px[i*4] + 0.587 * px[i*4+1] + 0.114 * px[i*4+2]; gray[i] = v; sum += v; if (px[i*4] > 245 && px[i*4+1] > 245 && px[i*4+2] > 245) hot++; }
  if (lowLight() && !cap.frames) {   // a single dark frame is grainy: a light 3×3 average keeps letters and drops speckles
    const w = c.width, hh = c.height, sm = new Uint8ClampedArray(n);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      let s = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < hh && xx >= 0 && xx < w) { s += gray[yy * w + xx]; k++; } }
      sm[y * w + x] = s / k;
    }
    gray.set(sm);
  }
  const sorted = Array.from(gray).sort((a, b) => a - b), lo = sorted[Math.floor(n * 0.02)], hi = sorted[Math.floor(n * 0.98)];
  const invert = sum / n < 110, span = Math.max(30, hi - lo);
  for (let i = 0; i < n; i++) { let v = (gray[i] - lo) * 255 / span; v = Math.max(0, Math.min(255, v)); if (invert) v = 255 - v; px[i*4] = px[i*4+1] = px[i*4+2] = v; }
  g.putImageData(d, 0, 0);
  c.glare = hot / n;
  c.lum = sum / n;
  return c;
}

// How crisp the text is: the steepest edges relative to full contrast. Calibrated on simulated name bars:
// in focus ≥ 0.20, clearly blurry ≤ 0.19, so below 0.17 counts as blurry.
function sharpness(canvas){
  const w = canvas.width, h = canvas.height, d = canvas.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, w, h).data;
  const hist = new Uint32Array(511); let n = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = (y * w + x) * 4, v = d[i];
    hist[Math.abs(d[i + 4] - v) + Math.abs(d[i + w * 4] - v)]++; n++;
  }
  let acc = 0, target = n * 0.99;
  for (let k = 0; k < 511; k++) { acc += hist[k]; if (acc >= target) return k / 255; }
  return 1;
}
const BLURRY = 0.17;

/* ---------- live scan checks: what's in the way of a good scan, before it even tries ---------- */
const chkC = document.createElement("canvas"); chkC.width = 72; chkC.height = 100;
const chkG = chkC.getContext("2d", {willReadFrequently: true});
let chkPrev = null, chkTick = 0, liveStats = null;
function measureLive(q){
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!q) return {found: false};
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const top = dist(q[0], q[1]), bot = dist(q[3], q[2]), left = dist(q[0], q[3]), right = dist(q[1], q[2]);
  const minX = Math.max(0, Math.min(...xs)), minY = Math.max(0, Math.min(...ys)), maxX = Math.min(vw, Math.max(...xs)), maxY = Math.min(vh, Math.max(...ys));
  chkG.drawImage(video, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), 0, 0, 72, 100);
  const px = chkG.getImageData(0, 0, 72, 100).data, gray = new Float32Array(7200);
  let sum = 0, hot = 0;
  for (let i = 0; i < 7200; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; gray[i] = 0.299 * r + 0.587 * g + 0.114 * b; sum += gray[i]; if (r > 245 && g > 245 && b > 245) hot++; }
  let motion = 0; if (chkPrev) { for (let i = 0; i < 7200; i++) motion += Math.abs(gray[i] - chkPrev[i]); motion /= 7200; }
  chkPrev = gray;
  const m = vw * 0.012;
  return {found: true, rel: h / vh, cut: Math.min(...xs) < m || Math.min(...ys) < m || Math.max(...xs) > vw - m || Math.max(...ys) > vh - m,
    skew: Math.max(top / bot, bot / top, left / right, right / left), lum: sum / 7200, glare: hot / 7200, motion};
}
function liveProblems(st){
  if (!st) return [];
  if (!st.found) return [{k: "card", msg: "Can't see the card's edges. Hold it in front of a plain background that contrasts with its border (white paper behind a black border works well), with all four corners in view."}];
  const out = [];
  if (st.cut) out.push({k: "dist", msg: "Part of the card is out of view. Move it toward the middle or a little farther away."});
  else if (st.rel < 0.4) out.push({k: "dist", msg: `Bring the card closer. It fills only ${Math.round(st.rel * 100)}% of the height of the view; aim for about half or more.`});
  if (st.skew > 1.2) out.push({k: "angle", msg: "The card is tilted. Hold it flat, facing the camera straight on."});
  if (st.lum < 55) out.push({k: "light", msg: "It's too dark. Add light or turn the card toward a lamp."});
  else if (st.lum > 215) out.push({k: "light", msg: "The card looks washed out. Move it out of direct light."});
  if (st.glare > 0.025) out.push({k: "glare", msg: prefs.sleeve ? "Glare on the sleeve. Tilt the card a little, or move the light off to the side." : "Glare on the card. Tilt it a little away from the light."});
  if (st.motion > 10) out.push({k: "still", msg: "Hold still for a moment."});
  return out;
}
function renderChecks(st){
  const box = $("checks"); box.hidden = !(CV && stream && prefs.page !== "builder");
  if (box.hidden) return;
  const probs = liveProblems(st), bad = new Set(probs.map(p => p.k));
  const chip = (k, label) => { const unknown = !st || (!st.found && k !== "card"); const ok = !unknown && !bad.has(k);
    return `<span class="chip2 ${unknown ? "unk" : ok ? "ok" : "warn"}" title="${esc(label)}">${unknown ? "·" : ok ? "✓" : "!"} ${esc(label)}</span>`; };
  $("chips").innerHTML = chip("card", "Card found") + chip("dist", "Distance") + chip("angle", "Angle") + chip("light", "Light") + chip("glare", "Glare") + chip("still", "Steady");
  $("checkTip").textContent = probs.length ? probs[0].msg : st && st.found ? (prefs.auto ? "Looks good. Hold still and it scans." : "Looks good. Press Space to scan.") : "";
  $("checkTip").className = "check-tip" + (probs.length ? " warn" : " ok");
}

/* ---------- explain a failed or unsure scan ---------- */
function showHelp(title, items){
  const el = $("scanHelp");
  if (!items || !items.length) { el.hidden = true; return; }
  el.innerHTML = `<b>${esc(title)}</b><ul>${items.map(it => `<li><span class="why">${esc(it.why)}</span>${it.fix ? ` <span class="fix">${esc(it.fix)}</span>` : ""}</li>`).join("")}</ul>`;
  el.hidden = false;
}
const hideHelp = () => { $("scanHelp").hidden = true; };
function diagnoseFailure(cap, nameC, nameR, matches, lock){
  const items = [];
  if (CV && !cap.rectified) items.push({why: "It couldn't find the card's edges, so it guessed where the card was.", fix: "Use a plain background that contrasts with the card's border and keep all four corners in view."});
  const st = cap.quad ? measureLive(cap.quad) : null;
  if (st && st.found) {
    if (st.rel < 0.4) items.push({why: `The card is small in the picture (${Math.round(st.rel * 100)}% of the view's height), so the name is only a few pixels tall.`, fix: "Bring it closer to the camera."});
    if (st.skew > 1.2) items.push({why: "The card is tilted, which squashes the text.", fix: "Hold it flat, facing the camera."});
    if (st.lum < 55) items.push({why: "The picture is too dark to read.", fix: `Add light, face the card toward a lamp, or press 💡 Screen light${lowLight() ? "" : ", and set Low light to On"}.`});
  }
  const sharp = sharpness(nameC);
  if (sharp < BLURRY) items.push({why: `The name is blurry (sharpness ${Math.round(sharp * 100)}; clear text is usually 20 or more).`, fix: "Hold the card still, or a little farther away so the webcam can focus."});
  if (nameC.glare > 0.05) items.push({why: `Glare covers part of the name (${Math.round(nameC.glare * 100)}% of the name bar is blown out).`, fix: prefs.sleeve ? "Tilt the card or move the light to the side; sleeves reflect a lot." : "Tilt the card slightly away from the light."});
  const txt = (nameR.text || "").replace(/\s+/g, " ").trim();
  if (!txt || txt.replace(/[^A-Za-z]/g, "").length < 3) items.push({why: "It couldn't read any text where the name should be.", fix: "That happens with non-English, Dwarvish or unusual showcase frames, or when art or a finger covers the name. " + (lock ? "" : "Set a Set lock to match by picture, or ") + "type the name in the box below" + (claudeReady() ? ", or press C to ask Claude." : ".")});
  else {
    const near = matches[0];
    items.push({why: `It read the name as “${txt.slice(0, 40)}”${near ? `, which is only a ${Math.round(near.score * 100)}% match for “${near.name}”` : ", which doesn't match any card"}.`,
      fix: "If that looks close, the name may be partly hidden or cut off. If it's a non-English card, type its English name below or use Set lock."});
  }
  if (lock) items.push({why: `It also compared the picture against every ${lock} card and none was a clear match.`, fix: "Check the card really is from that set, or clear the Set lock."});
  return items;
}
const THUMB_W = 32, THUMB_H = 18;
const thumbC = document.createElement("canvas"); thumbC.width = THUMB_W; thumbC.height = THUMB_H;
const thumbG = thumbC.getContext("2d", {willReadFrequently: true});
function signature(){
  thumbG.drawImage(video, 0, 0, THUMB_W, THUMB_H);
  const d = thumbG.getImageData(0, 0, THUMB_W, THUMB_H).data, out = new Float32Array(THUMB_W * THUMB_H);
  for (let i = 0; i < out.length; i++) out[i] = (d[i*4] + d[i*4+1] + d[i*4+2]) / 3;
  return out;
}
const sigDiff = (a, b) => { if (!a || !b) return 255; let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
let prevSig = null, lastScanSig = null, steady = 0, busy = false, retries = 0, liveQuad = null;
/* ---------- low light: brighter webcam settings, frames averaged together, stronger contrast ---------- */
let roomLum = null, lowOn = false, lowCamSaved = null;
const lowLight = () => (prefs.lowLight || "auto") === "on" || ((prefs.lowLight || "auto") === "auto" && lowOn);
function trackLum(sig){
  let s = 0; for (let i = 0; i < sig.length; i++) s += sig[i];
  const m = s / sig.length; roomLum = roomLum == null ? m : roomLum * 0.9 + m * 0.1;
  // switch with a gap so it doesn't flicker on and off: on below 70, off above 95
  const was = lowLight();
  if (!lowOn && roomLum < 70) lowOn = true; else if (lowOn && roomLum > 95) lowOn = false;
  if (lowLight() !== was) lowLightChanged();
}
function lowLightChanged(){
  const on = lowLight();
  lowLightCamera(on);
  const el = $("lowBadge"); if (el) el.hidden = !on;
  if ((prefs.lowLight || "auto") === "auto") setStatus(on ? "It's dark, so low light mode is on: brighter camera, several frames averaged per scan. A lamp or 💡 Screen light helps most." : "Light is good again. Low light mode is off.", on ? "" : "ok");
}
// Brighter webcam settings when the camera allows them (many do: exposure, brightness, gain)
async function lowLightCamera(on){
  try {
    const track = stream && stream.getVideoTracks()[0]; if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities(), cur = track.getSettings();
    if (on) {
      if (lowCamSaved) return;
      lowCamSaved = {};
      const adv = {};
      const up = (k, frac) => { if (!caps[k] || caps[k].max == null || cur[k] == null) return; lowCamSaved[k] = cur[k]; adv[k] = Math.min(caps[k].max, cur[k] + (caps[k].max - caps[k].min) * frac); };
      if (!prefs.sleeve) up("exposureCompensation", 0.2);   // sleeves: brighter means more glare, so leave exposure alone
      up("brightness", 0.12);
      if (caps.exposureMode && caps.exposureMode.includes("continuous") && cur.exposureMode !== "continuous") { lowCamSaved.exposureMode = cur.exposureMode; adv.exposureMode = "continuous"; }
      if (caps.torch) { lowCamSaved.torch = !!cur.torch; adv.torch = true; }
      if (Object.keys(adv).length) await track.applyConstraints({advanced: [adv]});
    } else if (lowCamSaved) {
      const back = lowCamSaved; lowCamSaved = null;
      if (Object.keys(back).length) await track.applyConstraints({advanced: [back]});
    }
  } catch (e) { /* this webcam doesn't allow it; frame averaging still works */ }
}
function drawOutline(q){
  const ov = $("overlay"), box = $("cam").getBoundingClientRect();
  if (ov.width !== Math.round(box.width) || ov.height !== Math.round(box.height)) { ov.width = Math.round(box.width); ov.height = Math.round(box.height); }
  const g = ov.getContext("2d"); g.clearRect(0, 0, ov.width, ov.height);
  $("guide").classList.toggle("found", !!q);
  if (!q || !video.videoWidth) return;
  const sc = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
  const ox = (box.width - video.videoWidth * sc) / 2, oy = (box.height - video.videoHeight * sc) / 2;
  g.beginPath(); q.forEach((p, i) => g[i ? "lineTo" : "moveTo"](ox + p.x * sc, oy + p.y * sc)); g.closePath();
  g.lineWidth = 3; g.strokeStyle = "#5fd18e"; g.stroke();
}
let lumTick = 0;
async function tick(){
  const live = stream && guideRect && video.readyState >= 2 && document.visibilityState === "visible";
  if (live && CV) { try { const f = detectIn(video, video.videoWidth, video.videoHeight, 480); liveQuad = f && f.q;
    if (++chkTick % 3 === 0 && prefs.page !== "builder") { liveStats = measureLive(liveQuad); renderChecks(liveStats); } drawOutline(liveQuad); } catch (e) { liveQuad = null; } }
  if (live && !(ready && prefs.auto && !busy) && ++lumTick % 5 === 0) trackLum(signature());
  if (live && ready && prefs.auto && !busy && prefs.page !== "builder" && document.activeElement !== $("find")) {
    const sig = signature(); trackLum(sig);
    const motion = sigDiff(sig, prevSig); prevSig = sig;
    steady = motion < (lowLight() ? 9 : 5) ? steady + 1 : 0;   // a dark picture is grainy, so it moves a little even when still
    const changed = sigDiff(sig, lastScanSig) > 12;
    if (changed) retries = 2;   // a new card gets a couple of extra tries if the first read fails
    if (steady >= 2 && (changed || retries > 0)) {
      if (!changed) retries--;
      lastScanSig = sig;
      scan(true).then(ok => { if (ok) retries = 0; });
    }
  }
  setTimeout(tick, 100);
}

