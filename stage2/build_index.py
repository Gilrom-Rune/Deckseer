#!/usr/bin/env python3
"""
Deckseer Stage 2: build the picture-fingerprint model and the index of every printing.

What it makes (in --out, default ./deckseer-stage2):
  deckseer-embed.onnx   the model: a webcam picture of a card in, a 256-number fingerprint out
                         (MobileNetV3, ImageNet-pretrained, with the PCA step and normalising built in)
  deckseer-index.bin    int8 fingerprints, one row of DIM bytes per card face
  deckseer-index.json   what each row is (Scryfall id, name, set, number, face) plus how to prepare a picture
  selfcheck.txt          how often a distorted picture (glare, blur, tilt, dim light, sleeve) finds the right card

Run it in Google Colab (see the notebook next to this file) or on a PC with Python 3.10+:
  pip install torch torchvision timm onnx onnxscript onnxruntime requests pillow numpy tqdm
  python build_index.py                      # every English paper printing (about 100k faces; several hours the first time)
  python build_index.py --limit 2000         # a quick trial run
  python build_index.py --selftest           # no internet, no torch needed: checks the whole pipeline on made-up cards

Images are cached in --cache, so a stopped run carries on where it left off.
Card data and images come from Scryfall (https://scryfall.com/docs/api). Please keep the polite download speed.
"""
import argparse, io, json, math, os, random, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

# The picture the model sees. The app warps the card to 716x1000; it's shrunk to this size, as RGB.
IN_W, IN_H = 224, 312
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
UA = {"User-Agent": "DeckseerIndexBuilder/1.0", "Accept": "*/*"}


# ---------------------------------------------------------------- card list
def scryfall_cards(cache, langs):
    """Every paper printing from Scryfall's bulk data, one entry per face that has its own picture."""
    import requests
    path = os.path.join(cache, "default_cards.json")
    if not os.path.exists(path) or os.path.getmtime(path) < time.time() - 14 * 86400:
        url = bulk_url(requests)
        print("Downloading Scryfall card data (about 500 MB)...")
        with requests.get(url, headers=UA, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(path + ".part", "wb") as f:
                for chunk in r.iter_content(1 << 20): f.write(chunk)
        with open(path + ".part", "rb") as f: packed = f.read(2) == b"\x1f\x8b"
        if packed:   # a compressed file: unpack it
            import gzip, shutil
            with gzip.open(path + ".part", "rb") as src, open(path, "wb") as dst: shutil.copyfileobj(src, dst)
            os.remove(path + ".part")
        else:
            os.replace(path + ".part", path)
    # Scryfall's file is either one big list or one card per line
    with open(path, encoding="utf-8") as f:
        first = f.read(1); f.seek(0)
        cards = json.load(f) if first == "[" else [json.loads(l.strip().rstrip(",")) for l in f if l.strip() not in ("", "[", "]")]
    print(f"Read {len(cards):,} cards from Scryfall data.")
    return faces_of(cards, langs)


def _links(o):
    if isinstance(o, dict):
        for v in o.values(): yield from _links(v)
    elif isinstance(o, list):
        for v in o: yield from _links(v)
    elif isinstance(o, str) and o.startswith("http") and ".json" in o:
        yield o


def bulk_url(requests):
    """The link to Scryfall's 'Default Cards' file. Asks the list of all bulk files, with a few tries."""
    last = None
    for attempt in range(4):
        try:
            r = requests.get("https://api.scryfall.com/bulk-data", headers=UA, timeout=60)
            last = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.ok:
                for item in r.json().get("data", []):
                    if item.get("type") != "default_cards": continue
                    # the link has moved fields before ("download_uri"), so look for it anywhere in the entry
                    found = list(_links(item))
                    url = next((u for u in found if "data.scryfall" in u), found[0] if found else None)
                    if url: return url
                    last = "no download link in: " + json.dumps(item)[:300]
        except Exception as e:
            last = repr(e)
        time.sleep(2 + 3 * attempt)
    sys.exit("Couldn't get the card data link from Scryfall. What Scryfall said:\n  " + str(last) +
             "\nTry again in a few minutes. If it keeps happening, send this message to Claude.")


def faces_of(cards, langs):
    out = []
    for c in cards:
        if "paper" not in c.get("games", []) or (langs and c.get("lang") not in langs): continue
        if c.get("layout") in ("token", "double_faced_token", "emblem", "art_series", "vanguard", "scheme", "planar"): continue
        base = {"id": c["id"], "name": c["name"], "set": c.get("set", ""), "num": c.get("collector_number", ""), "lang": c.get("lang", "en")}
        if c.get("image_uris"):
            out.append(dict(base, face=0, url=c["image_uris"].get("normal")))
        else:   # double-faced cards: both sides, since either can be in front of the camera
            for i, fc in enumerate(c.get("card_faces") or []):
                if fc.get("image_uris"): out.append(dict(base, face=i, url=fc["image_uris"].get("normal"), name=fc.get("name", c["name"])))
    return [x for x in out if x["url"]]


# ---------------------------------------------------------------- images
_lock = threading.Lock(); _last = [0.0]
def fetch_image(entry, cache, min_gap=0.06):
    path = os.path.join(cache, "img", f"{entry['id']}_{entry['face']}.jpg")
    if os.path.exists(path): return path
    import requests
    for attempt in range(4):
        with _lock:   # a polite pace: about 15 pictures a second at most
            wait = _last[0] + min_gap - time.time()
            if wait > 0: time.sleep(wait)
            _last[0] = time.time()
        try:
            r = requests.get(entry["url"], headers=UA, timeout=30)
            if r.status_code == 200:
                im = Image.open(io.BytesIO(r.content)).convert("RGB")
                # kept at 1.5x the model's size: about 25 KB each (about 2.5 GB for every card) instead of 8 GB at full size
                im = im.resize((IN_W * 3 // 2, IN_H * 3 // 2), Image.LANCZOS)
                im.save(path + ".part.jpg", quality=90); os.replace(path + ".part.jpg", path)
                return path
            if r.status_code == 404: return None
        except Exception:
            pass
        time.sleep(2 ** attempt)
    return None


def prepare(im):
    """Exactly what the app must do with its warped 716x1000 card before running the model."""
    im = im.convert("RGB").resize((IN_W, IN_H), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32) / 255.0
    a = (a - np.array(MEAN, np.float32)) / np.array(STD, np.float32)
    return a.transpose(2, 0, 1)   # channels first


# ---------------------------------------------------------------- distortions for the self-check (what a webcam does to a card)
def distort(im, rng):
    w, h = im.size
    im = im.convert("RGB")
    # tilt: the corners are found a few pixels off
    d = 0.03
    quad = []
    for x, y in [(0, 0), (0, h), (w, h), (w, 0)]: quad += [x + rng.uniform(-d, d) * w, y + rng.uniform(-d, d) * h]
    im = im.transform((w, h), Image.QUAD, quad, Image.BILINEAR)
    if rng.random() < 0.6: im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 2.0)))     # focus
    if rng.random() < 0.5:                                                                     # dim light, colour cast
        im = ImageEnhance.Brightness(im).enhance(rng.uniform(0.45, 0.85))
        a = np.asarray(im, dtype=np.float32); a *= np.array([rng.uniform(0.9, 1.1), 1, rng.uniform(0.85, 1.05)], np.float32)
        a += np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(3, 10), a.shape)  # sensor grain
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if rng.random() < 0.5:                                                                     # glare from a lamp or a sleeve
        g = Image.new("L", (w, h), 0); dr = ImageDraw.Draw(g)
        cx, cy, r = rng.uniform(0.2, 0.8) * w, rng.uniform(0.2, 0.8) * h, rng.uniform(0.08, 0.25) * w
        dr.ellipse([cx - r, cy - r * 0.6, cx + r, cy + r * 0.6], fill=int(rng.uniform(120, 230)))
        g = g.filter(ImageFilter.GaussianBlur(r * 0.35))
        im = Image.composite(Image.new("RGB", (w, h), (255, 255, 255)), im, g)
    if rng.random() < 0.3:                                                                     # sleeve: a slight haze
        im = Image.blend(im, Image.new("RGB", (w, h), (235, 235, 240)), rng.uniform(0.05, 0.15))
    return im


# ---------------------------------------------------------------- the model
class TorchEmbedder:
    """MobileNetV3-Large (ImageNet) without its classifier: 1280 numbers per picture."""
    name = "mobilenetv3_large_100"
    def __init__(self, batch=64):
        import torch, timm
        self.torch = torch
        self.dev = "cuda" if torch.cuda.is_available() else "cpu"
        self.net = timm.create_model(self.name, pretrained=True, num_classes=0).eval().to(self.dev)
        self.batch = batch
    def __call__(self, arrays):
        torch = self.torch; out = []
        with torch.no_grad():
            for i in range(0, len(arrays), self.batch):
                x = torch.from_numpy(np.stack(arrays[i:i + self.batch])).to(self.dev)
                out.append(self.net(x).float().cpu().numpy())
        return np.concatenate(out)
    def export(self, path, pca_mean, pca_w):
        """The ONNX file includes the PCA step and the normalising, so the app only prepares the picture and compares."""
        torch = self.torch
        class Full(torch.nn.Module):
            def __init__(s, net):
                super().__init__(); s.net = net
                s.register_buffer("mean", torch.from_numpy(pca_mean.astype(np.float32)))
                s.register_buffer("w", torch.from_numpy(pca_w.T.astype(np.float32).copy()))
            def forward(s, x):
                f = (s.net(x) - s.mean) @ s.w
                return f / f.norm(dim=1, keepdim=True).clamp_min(1e-6)
        m = Full(self.net.cpu()).eval()
        save_onnx(torch, m, path)
        self.net.to(self.dev)


def save_onnx(torch, m, path):
    """Save the model as one .onnx file. Tries PyTorch's classic exporter first, then the newer one (needs onnxscript)."""
    args = dict(input_names=["image"], output_names=["fingerprint"], dynamic_axes={"image": {0: "n"}, "fingerprint": {0: "n"}}, opset_version=17)
    x = torch.zeros(1, 3, IN_H, IN_W)
    try:
        torch.onnx.export(m, x, path, dynamo=False, **args)
    except Exception as e1:
        print("Classic ONNX export didn't work (" + type(e1).__name__ + "), trying the newer exporter...")
        torch.onnx.export(m, x, path, dynamo=True, **args)
    # keep everything in one file (the newer exporter can put the weights in a separate .data file)
    if os.path.exists(path + ".data"):
        import onnx
        model = onnx.load(path); onnx.save(model, path, save_as_external_data=False); os.remove(path + ".data")


def check_onnx(path, arrays, expected):
    """The saved model must give the same fingerprints as the one used for the index."""
    try:
        import onnxruntime as ort
    except ImportError:
        return "skipped (onnxruntime not installed)"
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    got = sess.run(None, {"image": np.stack(arrays).astype(np.float32)})[0]
    diff = float(np.abs(got - expected).max())
    return f"{'matches' if diff < 1e-3 else 'DOES NOT MATCH: tell Claude'} (largest difference {diff:.6f})"


class PixelEmbedder:
    """Stand-in for --selftest when torch isn't installed: a tiny colour layout. Only checks the plumbing."""
    name = "pixel-selftest"
    def __call__(self, arrays):
        out = []
        for a in arrays:
            c, h, w = a.shape
            small = a[:, : h - h % 26, : w - w % 16].reshape(c, 26, (h - h % 26) // 26, 16, (w - w % 16) // 16).mean(axis=(2, 4))
            out.append(small.ravel())
        return np.array(out, np.float32)
    def export(self, path, pca_mean, pca_w):
        with open(path, "wb") as f: f.write(b"selftest: no model")


# ---------------------------------------------------------------- PCA, index, search
def fit_pca(x, dim):
    mean = x.mean(axis=0)
    _, _, vt = np.linalg.svd(x - mean, full_matrices=False)
    return mean, vt[:dim]


def project(x, mean, w):
    f = (x - mean) @ w.T
    return f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-6)


def to_int8(f):
    scale = 127.0 / max(np.percentile(np.abs(f), 99.99), 1e-6)
    return np.clip(np.round(f * scale), -127, 127).astype(np.int8), float(scale)


def search(index_i8, q, k=5):
    s = index_i8.astype(np.float32) @ q.T   # same ranking as the cosine similarity
    return np.argsort(-s, axis=0)[:k].T


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="deckseer-stage2")
    ap.add_argument("--cache", default="deckseer-cache")
    ap.add_argument("--langs", default="en", help="comma-separated Scryfall language codes, or 'all'")
    ap.add_argument("--limit", type=int, default=0, help="only this many faces (a trial run)")
    ap.add_argument("--dim", type=int, default=256, help="numbers per fingerprint")
    ap.add_argument("--pca-sample", type=int, default=20000)
    ap.add_argument("--check", type=int, default=500, help="cards used for the distortion self-check")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--selftest", action="store_true", help="made-up cards, no internet; checks the pipeline end to end")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); os.makedirs(os.path.join(a.cache, "img"), exist_ok=True)
    if not a.selftest:   # everything the last step needs, checked now rather than hours later
        import importlib.util
        missing = [m for m in ("torch", "timm", "onnx", "onnxscript", "onnxruntime", "requests") if importlib.util.find_spec(m) is None]
        if missing: sys.exit("Missing packages: " + " ".join(missing) + "\nRun:  pip install " + " ".join(missing) + "   (in Colab: run cell 2 again)")
    rng = random.Random(7)

    # 1. the cards and their pictures
    if a.selftest:
        entries, images = selftest_cards(a.limit or 400, rng)
        load = lambda i: images[i]
    else:
        langs = None if a.langs == "all" else set(a.langs.split(","))
        entries = scryfall_cards(a.cache, langs)
        if a.limit: entries = entries[: a.limit]
        print(f"{len(entries):,} card faces. Downloading pictures (cached in {a.cache})...")
        paths = [None] * len(entries)
        def job(i): paths[i] = fetch_image(entries[i], a.cache)
        done = 0
        with ThreadPoolExecutor(a.threads) as ex:
            for _ in ex.map(job, range(len(entries))):
                done += 1
                if done % 1000 == 0 or done == len(entries): print(f"  {done:,}/{len(entries):,}", flush=True)
        keep = [i for i, p in enumerate(paths) if p]
        entries = [entries[i] for i in keep]; paths = [paths[i] for i in keep]
        load = lambda i: Image.open(paths[i])
        print(f"{len(entries):,} pictures ready.")

    # 2. raw features for every picture
    try:
        emb = TorchEmbedder(a.batch)
    except ImportError:
        if not a.selftest: sys.exit("This needs torch and timm: pip install torch torchvision timm onnx onnxscript onnxruntime")
        emb = PixelEmbedder()
    print(f"Model: {emb.name}")
    # saved to the cache as they're made, so a failure in a later step doesn't mean making them all again
    import hashlib
    key = hashlib.sha1((emb.name + "|" + "|".join(f"{e['id']}_{e['face']}" for e in entries)).encode()).hexdigest()[:12]
    fpath = os.path.join(a.cache, f"fingerprints-{key}.npy")
    if os.path.exists(fpath) and not a.selftest:
        feats = np.load(fpath); print(f"  using the {len(feats):,} fingerprints saved last time")
    else:
        feats = []
        for i in range(0, len(entries), 512):
            feats.append(emb([prepare(load(j)) for j in range(i, min(i + 512, len(entries)))]))
            print(f"  fingerprints {min(i + 512, len(entries)):,}/{len(entries):,}", flush=True)
        feats = np.concatenate(feats)
        if not a.selftest: np.save(fpath, feats)

    # 3. PCA down to --dim numbers, normalised, stored as int8
    sample = feats[rng.sample(range(len(feats)), min(a.pca_sample, len(feats)))]
    dim = min(a.dim, sample.shape[0], sample.shape[1])
    mean, w = fit_pca(sample, dim)
    f = project(feats, mean, w)
    idx, scale = to_int8(f)
    idx.tofile(os.path.join(a.out, "deckseer-index.bin"))
    emb.export(os.path.join(a.out, "deckseer-embed.onnx"), mean, w)
    if isinstance(emb, TorchEmbedder):
        some = [prepare(load(i)) for i in range(min(8, len(entries)))]
        print("Model file check:", check_onnx(os.path.join(a.out, "deckseer-embed.onnx"), some, f[: len(some)]))
    names = sorted({e["name"] for e in entries}); nix = {n: i for i, n in enumerate(names)}
    meta = {
        "version": 1, "created": time.strftime("%Y-%m-%d"), "model": emb.name, "count": len(entries), "dim": dim, "int8_scale": scale,
        "input": {"width": IN_W, "height": IN_H, "mean": MEAN, "std": STD, "layout": "NCHW float32 RGB", "from": "the warped 716x1000 card, shrunk with bilinear filtering"},
        "how_to_compare": "score = dot(index_row_int8, fingerprint) / int8_scale  (cosine similarity, 1 = identical)",
        "names": names, "name": [nix[e["name"]] for e in entries],
        "id": [e["id"] for e in entries], "set": [e["set"] for e in entries], "num": [e["num"] for e in entries], "face": [e["face"] for e in entries],
    }
    with open(os.path.join(a.out, "deckseer-index.json"), "w", encoding="utf-8") as fh: json.dump(meta, fh, separators=(",", ":"))

    # 4. self-check: distorted pictures must find their own card
    check = rng.sample(range(len(entries)), min(a.check, len(entries)))
    q = project(emb([prepare(distort(load(i), rng)) for i in check]), mean, w)
    top = search(idx, q, 5)
    exact1 = np.mean([top[k][0] == i for k, i in enumerate(check)])
    exact5 = np.mean([i in top[k] for k, i in enumerate(check)])
    name1 = np.mean([entries[top[k][0]]["name"] == entries[i]["name"] for k, i in enumerate(check)])
    report = (f"Self-check on {len(check)} distorted pictures ({emb.name}, {dim} numbers, {len(entries):,} faces)\n"
              f"  right printing first:      {exact1:.1%}\n  right printing in top 5:   {exact5:.1%}\n  right card name first:     {name1:.1%}\n")
    print(report)
    with open(os.path.join(a.out, "selfcheck.txt"), "w") as fh: fh.write(report)
    sizes = {n: os.path.getsize(os.path.join(a.out, n)) for n in os.listdir(a.out)}
    for n, s in sorted(sizes.items()): print(f"  {n:24s} {s / 1e6:8.2f} MB")
    return exact1, name1


def selftest_cards(n, rng):
    """Made-up cards: a frame colour, an 'art' box with shapes, text-like bars. Several printings share a name."""
    entries, images = [], []
    for i in range(n):
        im = Image.new("RGB", (488, 680), tuple(rng.randrange(256) for _ in range(3)))
        d = ImageDraw.Draw(im)
        d.rectangle([30, 70, 458, 380], fill=tuple(rng.randrange(256) for _ in range(3)))
        for _ in range(6):
            x, y, r = rng.randrange(40, 440), rng.randrange(80, 370), rng.randrange(15, 80)
            d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(rng.randrange(256) for _ in range(3)))
        for k in range(5): d.rectangle([40, 420 + k * 40, rng.randrange(150, 440), 440 + k * 40], fill=(30, 30, 30))
        entries.append({"id": f"selftest-{i}", "name": f"Card {i // 2}", "set": "tst", "num": str(i), "face": 0, "url": ""})
        images.append(im)
    return entries, images


if __name__ == "__main__":
    main()
