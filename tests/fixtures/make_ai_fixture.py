#!/usr/bin/env python3
"""Make a tiny stand-in for the Stage 2 files, in exactly the same format, for the test suite.
The 'model' is just a colour layout with a random projection: the plumbing is the same as the real one
(input image [n,3,312,224] -> fingerprint [n,256], normalised), only far smaller (about 0.5 MB).
Run:  pip install onnx onnxruntime numpy pillow  then  python tests/fixtures/make_ai_fixture.py"""
import json, os, random, sys
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
import onnxruntime as ort
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "stage2"))
import build_index as B

OUT = os.path.join(HERE, "ai")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(3)
# the stand-in model: 24x16 average pooling -> 3x13x14 = 546 numbers -> random 546x256 -> normalise
W = rng.normal(0, 1, (546, 256)).astype(np.float32)
nodes = [
    helper.make_node("AveragePool", ["image"], ["pooled"], kernel_shape=[24, 16], strides=[24, 16]),
    helper.make_node("Flatten", ["pooled"], ["flat"], axis=1),
    helper.make_node("MatMul", ["flat", "W"], ["proj"]),
    helper.make_node("ReduceL2", ["proj"], ["norm"], axes=[1], keepdims=1),
    helper.make_node("Div", ["proj", "norm"], ["fingerprint"]),
]
g = helper.make_graph(nodes, "standin",
    [helper.make_tensor_value_info("image", TensorProto.FLOAT, ["n", 3, B.IN_H, B.IN_W])],
    [helper.make_tensor_value_info("fingerprint", TensorProto.FLOAT, ["n", 256])],
    [numpy_helper.from_array(W, "W")])
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)]); m.ir_version = 8
onnx.checker.check_model(m)
onnx.save(m, os.path.join(OUT, "deckseer-embed.onnx"))

# made-up cards; pairs share a name, like two printings of one card
entries, images = B.selftest_cards(60, random.Random(5))
for i, e in enumerate(entries): e["id"] = f"fx-{i:04d}"
sess = ort.InferenceSession(os.path.join(OUT, "deckseer-embed.onnx"))
f = sess.run(None, {"image": np.stack([B.prepare(im) for im in images])})[0]
idx, scale = B.to_int8(f)
idx.tofile(os.path.join(OUT, "deckseer-index.bin"))
names = sorted({e["name"] for e in entries}); nix = {n: i for i, n in enumerate(names)}
meta = {"version": 1, "created": "fixture", "model": "standin", "count": len(entries), "dim": 256, "int8_scale": scale,
        "input": {"width": B.IN_W, "height": B.IN_H, "mean": B.MEAN, "std": B.STD, "layout": "NCHW float32 RGB"},
        "names": names, "name": [nix[e["name"]] for e in entries], "id": [e["id"] for e in entries],
        "set": [e["set"] for e in entries], "num": [e["num"] for e in entries], "face": [e["face"] for e in entries]}
json.dump(meta, open(os.path.join(OUT, "deckseer-index.json"), "w"), separators=(",", ":"))
for i in (0, 1, 7, 30): images[i].save(os.path.join(OUT, f"card-{i}.png"))
print("fixture written:", sorted(os.listdir(OUT)))
