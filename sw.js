/* Deckseer offline support.
   - The app itself: network first (so a new version shows up as soon as you're online), the saved copy when offline.
   - Libraries (OpenCV, Tesseract and its language data, the text-reader model, fonts): saved the first time, then used from the saved copy.
   - Card pictures from Scryfall: saved as you see them, up to IMG_MAX; the oldest are dropped.
   - Scryfall searches/prices, Commander Spellbook and the AI picture files are never cached here (the app keeps its own copies). */
const VERSION = "deckseer-v3";
const SHELL = VERSION + "-shell", LIBS = "deckseer-libs-v1", IMGS = "deckseer-imgs-v1";
const SHELL_FILES = ["./", "./deckseer.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/deckseer.ico", "./icons/favicon-32.png"];
const LIB_HOSTS = ["cdn.jsdelivr.net", "docs.opencv.org", "unpkg.com", "tessdata.projectnaptha.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];
const IMG_HOSTS = ["cards.scryfall.io", "svgs.scryfall.io"];
const IMG_MAX = 4000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("deckseer-v") && k !== SHELL && !k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});
// The page asks for this when you click "Reload" on the "new version" message.
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // the AI picture files (about 50 MB) are kept by the app itself, in IndexedDB: no second copy here
  if (url.origin === location.origin && /deckseer-(embed\.onnx|index\.bin|index\.json)$/.test(url.pathname)) return;
  if (url.origin === location.origin) return e.respondWith(networkFirst(req));
  if (LIB_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, LIBS));
  if (IMG_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, IMGS, IMG_MAX));
  // everything else (Scryfall API, Commander Spellbook, Claude) goes straight to the network
});

async function networkFirst(req){
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    return (await c.match(req, {ignoreSearch: true})) || (req.mode === "navigate" && await c.match("./deckseer.html")) || Response.error();
  }
}
async function cacheFirst(req, name, max){
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // opaque (no-CORS) answers are fine to keep for scripts; a failed answer is never kept
  if (res.ok || res.type === "opaque") {
    await c.put(req, res.clone());
    if (max) trim(c, max);
  }
  return res;
}
let trimming = false;
async function trim(c, max){
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]); }
  finally { trimming = false; }
}
