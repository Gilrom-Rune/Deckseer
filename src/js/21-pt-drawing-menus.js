/* ----- drawing the table ----- */
const PT_COLOR = {W: "#e9e1c4", U: "#5c94c9", B: "#4a423f", R: "#c9563f", G: "#4f8f5b"};
function ptFace(c, cls){
  if (c.faceDown) return `<div class="ptc-back ${cls || ""}"><span>Face down</span></div>`;
  const img = c.back ? c.img.replace("/front/", "/back/") : c.img;
  if (img) return `<img src="${esc(img)}" alt="${esc(c.name)}" draggable="false" loading="lazy" onerror="this.onerror=null;this.removeAttribute('src');this.classList.add('noimg')">`;
  const cols = c.colors && c.colors.length ? c.colors.map(x => PT_COLOR[x] || "#9aa3ad") : ["#a7adb5"];
  const bg = cols.length > 1 ? `linear-gradient(135deg,${cols.join(",")})` : cols[0];
  const pt = ptIsCreature(c) && (c.power || c.toughness) ? `<b class="tt-pt">${esc(c.power)}/${esc(c.toughness)}</b>` : "";
  return `<div class="ptc-tile" style="--tile:${bg}"><b class="tt-name">${esc(c.name)}</b><span class="tt-art"></span><small class="tt-type">${esc((c.type || "").replace(/^Token /, ""))}</small>${c.text ? `<small class="tt-text">${esc(c.text)}</small>` : ""}${pt}</div>`;
}
function ptCardHtml(c, zone, extra){
  const counters = Object.entries(c.counters || {}).map(([k, v]) => `<button type="button" class="ptc-badge k-${k}" data-cnt="${esc(k)}" data-uid="${c.uid}" title="${esc(ptCounterName(k))} counters: click to add, right-click to remove">${k === "p1p1" ? "+" + v : k === "m1m1" ? "−" + v : `${esc(ptCounterShort(k))} ${v}`}</button>`).join("");
  const showPT = zone === "bf" && ptIsCreature(c) && !c.faceDown && (ptPT(c) !== `${c.power}/${c.toughness}` || !!c.dmg);
  return `<div class="ptc${c.tapped ? " tapped" : ""}${c.token ? " is-token" : ""}${extra || ""}" data-uid="${c.uid}" data-zone="${zone}">
    <div class="ptc-in">${ptFace(c)}</div>
    ${counters ? `<div class="ptc-badges">${counters}</div>` : ""}
    ${c.token ? `<span class="ptc-tok">Token</span>` : ""}${c.commander ? `<span class="ptc-cmd" title="Commander">★</span>` : ""}
    ${showPT ? `<span class="ptc-pt${c.eot && (c.eot.p || c.eot.t) ? " pumped" : ""}">${esc(ptPT(c))}${c.dmg ? `<em title="Damage this turn">−${c.dmg}</em>` : ""}</span>` : ""}
    ${zone === "bf" && c.eot && c.eot.cre ? `<span class="ptc-flag" title="A creature until end of turn">Crewed</span>` : ""}${zone === "bf" && c.monarchCrown ? "" : ""}
  </div>`;
}
const ptCounterName = k => (PT_COUNTERS.find(x => x[0] === k) || [k, k])[1];
const ptCounterShort = k => { const n = ptCounterName(k); return n.length > 7 ? n.slice(0, 6) + "." : n; };
function ptRender(){
  if (!PT) return;
  const root = ptEl(), g = ptGrid(); root.style.setProperty("--g", g + "px");
  const lifeCtl = (key, label, icon) => `<div class="pt-stat" title="${label}: click − / +, Shift-click for 5"><span class="pt-ico">${icon}</span><button type="button" data-life="${key}" data-d="-1" aria-label="${label} down">−</button><b data-lifeval="${key}">${PT[key]}</b><button type="button" data-life="${key}" data-d="1" aria-label="${label} up">+</button><small>${label}</small></div>`;
  $("ptTop").innerHTML = `
    <div class="pt-title"><b>${esc(PT.name)}</b><span class="pt-turn">${PT.phase === "play" ? `Turn ${PT.turn}` : "Opening hand"}</span></div>
    ${lifeCtl("life", "Life", "♥")}${PT.poison || PT.showPoison ? lifeCtl("poison", "Poison", "☠") : ""}${PT.energy || PT.showEnergy ? lifeCtl("energy", "Energy", "ϟ") : ""}
    ${ptPoolHtml()}${PT.speed ? `<span class="pt-chip" title="Your speed (goes up once a turn when the opponent loses life on your turn)">Speed ${PT.speed}</span>` : ""}${PT.monarch ? `<span class="pt-chip" title="You're the monarch: draw at your end step">👑 Monarch</span>` : ""}${PT.day ? `<span class="pt-chip">${PT.day === "night" ? "☾ Night" : "☀ Day"}</span>` : ""}${PT.extraTurns ? `<span class="pt-chip">+${PT.extraTurns} extra turn${PT.extraTurns > 1 ? "s" : ""}</span>` : ""}${PT.story ? `<span class="pt-chip" title="You have an enduring story">Storied</span>` : ""}
    <span class="sp"></span>
    <div class="pt-actions">
      <button class="btn" type="button" data-pt="draw" title="Draw a card (D)">Draw</button>
      <button class="btn" type="button" data-pt="attack" title="Choose attackers (A)">Attack</button>
      <button class="btn" type="button" data-pt="endturn" title="End step: end-of-turn triggers (E)">End turn</button>
      <button class="btn primary" type="button" data-pt="next" title="End step, untap, upkeep, draw (N)">Next turn</button>
      <button class="btn" type="button" data-pt="tokens" title="Create tokens (K)">Tokens</button>
      <button class="btn ghost pt-trig-sw" type="button" data-pt="trig" aria-pressed="${ptMode() !== "off"}" title="Trigger helper. Auto: simple triggers happen by themselves. Ask: every trigger waits in the tray. Off: no help. Click to switch.">⚡ ${{auto: "Auto", ask: "Ask", off: "Off"}[ptMode()]}</button>
      <button class="btn ghost" type="button" data-pt="undo" title="Undo (Ctrl+Z)" ${PT.undo.length ? "" : "disabled"}>Undo</button>
      <button class="btn ghost" type="button" data-pt="more" title="Dice, new game">⋯</button>
      <button class="btn ghost" type="button" data-pt="full" title="Use the whole screen for the table">⛶</button>
      <button class="btn ghost" type="button" data-pt="help" title="How it works">?</button>
      <button class="btn ghost pt-x" type="button" data-pt="close" aria-label="Close playtest">✕</button>
    </div>`;
  $("ptOpps").innerHTML = ptOppsHtml();
  // battlefield: one table ruled in squares; cards sit on exact squares
  const {cols, rows} = ptTableSize();
  const sameName = new Map(); for (const c of PT.bf) sameName.set(c.name, (sameName.get(c.name) || 0) + 1);
  $("ptBf").innerHTML = `<div class="pt-table" id="ptTable" data-drop="bf" style="width:${cols * g}px;height:${rows * g}px">
    <div class="pt-snap" id="ptSnap" hidden></div>
    ${(() => { const piles = new Map(), pk = c => ptPileKey(c) + "|" + c.x + "," + c.y;
      for (const c of PT.bf) if (ptPileKey(c)) { const k = pk(c); if (!piles.has(k)) piles.set(k, []); piles.get(k).push(c); }
      const top = new Map(); for (const [k, l] of piles) { ptPileSort(l); top.set(k, Math.max(...l.map(o => o.z || 0))); }
      const hosts = new Map(); for (const c of PT.bf) if (c.att != null && PT.bf.some(h => h.uid === c.att)) { if (!hosts.has(c.att)) hosts.set(c.att, []); hosts.get(c.att).push(c); }
      return PT.bf.slice().sort((a, b) => a.z - b.z).map(c => { const [fw, fh] = ptFoot(c);
        const k = ptPileKey(c) ? pk(c) : null, pile = k ? piles.get(k) : null, idx = pile ? pile.indexOf(c) : 0, n = pile ? pile.length : 1;
        const off = n > 1 ? Math.min(idx, 4) * 3 : 0, zi = n > 1 ? top.get(k) - (n - 1 - idx) : c.z;
        const under = pile && idx < n - 1;
        let L = c.x * g + off, T = c.y * g + off, Z = zi * 4;
        const host = hosts.has(c.att) ? PT.bf.find(h => h.uid === c.att) : null;
        if (host) { const k = hosts.get(c.att).indexOf(c); L = host.x * g + (k + 1) * Math.round(g * 0.9); T = host.y * g - (k + 1) * Math.round(g * 0.75); Z = host.z * 4 - 1 - k; }
        return `<div class="pt-at${under ? " under" : ""}${n > 1 ? " in-pile" : ""}${host ? " attached" : ""}" style="left:${L}px;top:${T}px;width:${fw * g}px;height:${fh * g}px;z-index:${Z}">${ptCardHtml(c, "bf")}${n > 1 && idx === n - 1 && c.token ? `<span class="pt-pile-n" title="${n} in this stack">×${n}</span>` : ""}</div>`; }).join(""); })()}
    ${PT.bf.length ? "" : `<div class="pt-table-hint">Click cards in your hand to play them, or drag them anywhere on the table. They snap to the squares.</div>`}
  </div><div class="pt-float" id="ptPreview" hidden></div>`;
  // left: command zone + library
  const pile = (zone, label, cards, faceUp) => {
    const top = faceUp ? cards[cards.length - 1] : cards[0];
    return `<div class="pt-pile" data-drop="${zone}" data-pile="${zone}">
      <div class="pt-pile-head"><span>${label}</span><b>${cards.length}</b></div>
      <div class="pt-pile-card">${top ? (faceUp ? ptCardHtml(top, zone) : `<div class="ptc" data-uid="${top.uid}" data-zone="${zone}"><div class="ptc-in"><div class="ptc-back"><span>Deckseer</span></div></div></div>`) : `<div class="pt-empty">Empty</div>`}</div>
      ${zone === "lib" ? `<div class="pt-libdrop"><span data-drop="lib">Top</span><span data-drop="libBottom">Bottom</span></div>` : ""}
    </div>`;
  };
  $("ptLeft").innerHTML = `
    ${PT.isCmd || PT.cmd.length ? `<div class="pt-pile pt-cmdzone" data-drop="cmd"><div class="pt-pile-head"><span>Command zone</span></div>
      <div class="pt-cmds">${PT.cmd.length ? PT.cmd.map(c => `<div class="pt-cmdcard">${ptCardHtml(c, "cmd")}<small>${PT.tax[c.uid] ? `Tax +${PT.tax[c.uid] * 2}` : "Click to cast"}</small></div>`).join("") : `<div class="pt-empty">Empty</div>`}</div></div>` : ""}
    ${pile("lib", "Library", PT.lib, false)}
    <div class="pt-libbtns"><button type="button" class="linkish" data-pt="shuffle">Shuffle</button><button type="button" class="linkish" data-pt="scry">Scry</button><button type="button" class="linkish" data-pt="look">Look at top</button><button type="button" class="linkish" data-pt="search">Search</button><button type="button" class="linkish" data-pt="mill">Mill</button></div>
    <div class="pt-piles2">${pile("grave", "Graveyard", PT.grave, true)}${pile("exile", "Exile", PT.exile, true)}</div>`;
  $("ptStackBox").innerHTML = ptStackHtml();
  // hand
  const banner = PT.phase === "mull" ? `<div class="pt-banner"><span>${PT.mull ? `Mulligan ${PT.mull}. ` : ""}Keep this hand?</span><button class="btn primary" type="button" data-pt="keep">Keep</button><button class="btn" type="button" data-pt="mulligan">Mulligan</button>${PT.isCmd ? `<label class="chk"><input type="checkbox" id="ptFreeMull" ${prefs.ptFreeMull !== false ? "checked" : ""}> First mulligan is free</label>` : ""}</div>`
    : PT.phase === "bottom" ? `<div class="pt-banner warn"><span>Click ${PT.toBottom} card${PT.toBottom === 1 ? "" : "s"} in your hand to put on the bottom of your library.</span></div>` : "";
  const glow = ptAutoMana() && PT.phase === "play", can = c => glow && ptAffordable(c, "hand") ? " can-cast" : "";
  const keepX = ($("ptHand").querySelector(".pt-hand-cards") || {}).scrollLeft || 0;   // the hand stays scrolled where you left it
  $("ptHand").innerHTML = `${banner}<div class="pt-hand-head"><span>Hand</span><b>${PT.hand.length}</b>${glow ? `<small class="pt-hand-note">Cards you can cast now glow. Clicking one pays for it.</small>` : ""}<span class="pt-hscroll"><button type="button" data-hscroll="-1" aria-label="Scroll your hand left">‹</button><button type="button" data-hscroll="1" aria-label="Scroll your hand right">›</button></span></div><div class="pt-hand-cards" data-drop="hand" style="--n:${PT.hand.length}">${PT.hand.map(c => ptCardHtml(c, "hand", can(c))).join("") || `<div class="pt-empty">No cards in hand</div>`}</div>`;
  const hc = $("ptHand").querySelector(".pt-hand-cards"); if (hc) { hc.scrollLeft = keepX; ptHandArrows(hc); hc.onscroll = () => ptHandArrows(hc); }
  if (ptHover != null && !ptFind(ptHover)) ptHover = null;
  ptPreview(ptHover, ptLastX);
}
// the ‹ › buttons: shown only when the hand is wider than the screen, each greyed out at its end
function ptHandArrows(hc){
  const max = hc.scrollWidth - hc.clientWidth, box = $("ptHand");
  box.classList.toggle("scrolls", max > 4);
  const [l, r] = box.querySelectorAll("[data-hscroll]");
  if (l) l.disabled = hc.scrollLeft <= 2; if (r) r.disabled = hc.scrollLeft >= max - 2;
}
let ptLastX = null;
function ptPreview(uid, px){
  const box = $("ptPreview"); if (!box) return;
  const f = uid != null && !ptDrag ? ptFind(uid) : null;
  if (!f || (f.zone === "lib" && !PT_VIEW)) { box.hidden = true; return; }
  const c = f.card, cs = Object.entries(c.counters || {});
  box.innerHTML = `<div class="pt-preview-card">${c.faceDown ? `${ptFace(Object.assign({}, c, {faceDown: false}))}<span class="pt-fd">Face down to others</span>` : ptFace(c)}</div>
    ${(() => { if (c.faceDown) return ""; const kws = [...ptKws(c).values()]; const acts = trActivated(c);
      return (kws.length ? `<div class="pt-kws">${kws.map(k => `<span class="pt-kw">${esc((PT_KW_BY.get(k.key) || {}).name || k.key)}${k.val && /^\d/.test(k.val) ? " " + esc(k.val.split(/\s/)[0]) : ""}${k.from !== "own" ? ` <i>${esc(k.from)}</i>` : ""}</span>`).join("")}</div>` : "")
        + kws.filter(k => PT_KW_BY.has(k.key) && !["flying", "haste", "vigilance", "trample", "reach", "lifelink", "deathtouch", "first strike", "menace", "flash", "defender", "indestructible", "hexproof"].includes(k.key)).slice(0, 2).map(k => `<p class="pt-kw-rule">${esc((PT_KW_BY.get(k.key).rule.match(/“[^”]+”/g) || [PT_KW_BY.get(k.key).rule])[0].slice(0, 220))}</p>`).join("")
        + (acts.length && f.zone === "bf" ? `<p class="pt-kw-rule">Right-click to use: ${esc(acts.filter(a => a.zone === "bf").map(a => a.label.split(":")[0]).slice(0, 4).join(" · "))}</p>` : ""); })()}
    <div class="pt-preview-meta"><b>${esc(c.name)}${c.token ? " (token)" : ""}</b>${ptIsCreature(c) && (c.power || c.toughness) ? `<span>${esc(ptPT(c))}</span>` : ""}${cs.length ? `<span>${cs.map(([k, v]) => `${v} ${esc(ptCounterName(k))}`).join(" · ")}</span>` : ""}</div>`;
  box.hidden = false;
  // keep the big picture on the side away from the pointer
  const wrap = $("ptBf").getBoundingClientRect();
  box.classList.toggle("left", px != null && px > wrap.left + wrap.width * 0.55);
}
/* ----- menus and dialogs ----- */
function ptMenu(x, y, html){
  const m = $("ptMenu"); m.innerHTML = html; m.hidden = false;
  const r = m.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  m.style.left = Math.max(6, Math.min(x, W - r.width - 6)) + "px"; m.style.top = Math.max(6, Math.min(y, H - r.height - 6)) + "px";
}
function ptCloseMenu(){ $("ptMenu").hidden = true; ptMenuFor = null; }
function ptCardMenu(uid, x, y){
  const f = ptFind(uid); if (!f) return; const c = f.card, z = f.zone; ptMenuFor = {uid, x, y};
  const it = (act, label, key) => `<button type="button" data-m="${act}">${label}${key ? `<kbd>${key}</kbd>` : ""}</button>`;
  const moves = [["hand", "Hand"], ["lib", "Top of library"], ["libBottom", "Bottom of library"], ["grave", "Graveyard"], ["exile", "Exile"]].filter(([k]) => k !== z);
  if (c.commander && z !== "cmd") moves.push(["cmd", "Command zone"]);
  let h = `<div class="ptm-title">${esc(c.faceDown ? "Face-down card" : c.name)}${c.token ? " · token" : ""}</div>`;
  const abil = c.faceDown ? [] : trActivated(c).map((ab, i) => ({ab, i})).filter(x => x.ab.zone === z);
  if (abil.length) h += `<div class="ptm-sep">Abilities</div>${abil.map(({ab, i}) => { const why = PT.phase === "play" ? ptCanPay(c, ab) : "Keep your hand first."; return `<button type="button" class="ptm-abil" data-m="act" data-i="${i}" ${why ? `aria-disabled="true" title="${esc(why)}"` : `title="${esc(ab.text)}"`}><span>${esc(ab.label.length > 90 ? ab.label.slice(0, 88) + "…" : ab.label)}</span>${why ? `<small>${esc(why)}</small>` : ""}</button>`; }).join("")}`;
  if (z === "bf" && (/\b(Equipment|Aura|Fortification)\b/.test(ptFaceType(c)) || c.att != null)) h += `<div class="ptm-ways">${c.att != null ? `<button type="button" data-m="unattach">Unattach</button>` : ""}<button type="button" data-m="attachpick">Attach to… (click it)</button></div>`;
  if (z === "bf" && /\bchoose (?:a creature type|artifact, creature)/i.test(ptFaceText(c))) h += it("chooseType", `Chosen type: ${esc(trCap(ptChosenOf(c)))} (change)`);
  if (z === "bf") {
    const same = PT.bf.filter(o => o.name === c.name);
    h += it("tap", c.tapped ? "Untap" : "Tap", "T");
    const pile = ptPileOf(c);
    if (pile.length > 1) h += it("tappile", `${pile.every(s => s.tapped) ? "Untap" : "Tap"} this stack (${pile.length})`);
    if (same.length > 1 && same.length !== pile.length) h += it("tapstack", `${same.every(s => s.tapped) ? "Untap" : "Tap"} all ${same.length} ${esc(c.name)}`);
    h += `<div class="ptm-sep">Counters</div><div class="ptm-counters">${PT_COUNTERS.slice(0, 9).map(([k, n]) => `<div class="ptm-cnt"><span>${n}</span><button type="button" data-m="cnt" data-k="${k}" data-d="-1" aria-label="Remove ${n} counter">−</button><b>${c.counters[k] || 0}</b><button type="button" data-m="cnt" data-k="${k}" data-d="1" aria-label="Add ${n} counter">+</button></div>`).join("")}
      ${Object.keys(c.counters).filter(k => !PT_COUNTERS.slice(0, 9).some(x => x[0] === k)).map(k => `<div class="ptm-cnt"><span>${esc(ptCounterName(k))}</span><button type="button" data-m="cnt" data-k="${esc(k)}" data-d="-1">−</button><b>${c.counters[k]}</b><button type="button" data-m="cnt" data-k="${esc(k)}" data-d="1">+</button></div>`).join("")}</div>
      <div class="ptm-row"><select id="ptmMore" aria-label="Other counter"><option value="">Other counter…</option>${PT_COUNTERS.slice(9).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select>${Object.keys(c.counters).length ? `<button type="button" class="linkish" data-m="clearcnt">Clear all</button>` : ""}</div>
      <div class="ptm-row"><input type="text" id="ptmCustom" maxlength="20" placeholder="Custom counter" aria-label="Custom counter name"><button type="button" data-m="addcustom">Add</button></div>
      <div class="ptm-sep">Copies and faces</div>
      <div class="ptm-row"><button type="button" data-m="copy">Make token copy</button><input type="number" id="ptmCopyN" value="1" min="1" max="50" aria-label="How many copies"></div>
      ${it("facedown", c.faceDown ? "Turn face up" : "Turn face down")}${ptCanTransform(c) ? it("transform", c.back ? "Transform to front" : "Transform to back") : ""}`;
  } else if (z === "hand") {
    h += it("play", ptIsPermanentType(c) ? "Play to battlefield" : "Cast (to graveyard)") + it("playbf", "Put onto battlefield (not cast)") + it("playfd", "Play face down");
    h += ptWaysHtml(c, "hand");
  } else if (z === "cmd") {
    h += it("play", `Cast${PT.tax[c.uid] ? ` (tax +${PT.tax[c.uid] * 2})` : ""}`);
  } else {
    h += it("playbf", "Put onto battlefield");
    if (z === "grave") h += ptWaysHtml(c, "grave");
    if (z === "exile") h += ptWaysHtml(c, "exile");
  }
  h += `<div class="ptm-sep">Move to</div><div class="ptm-moves">${moves.map(([k, n]) => `<button type="button" data-m="move" data-to="${k}">${n}</button>`).join("")}</div>`;
  if (z === "bf" && ptIsCreature(c)) {
    const own = k => { const f = ptHasKw(Object.assign({}, c, {kw: {}}), k); return f; };
    h += `<div class="ptm-sep">Abilities</div><div class="ptm-ways">${["persist", "undying"].map(k => { const f = own(k);
      return f ? `<span class="ptm-has" title="${f === "own" ? "Printed on the card" : "From " + esc(f)}">✓ ${k[0].toUpperCase() + k.slice(1)}${f !== "own" ? ` (${esc(f)})` : ""}</span>`
        : `<button type="button" data-m="kw" data-k="${k}" aria-pressed="${!!(c.kw && c.kw[k])}">${c.kw && c.kw[k] ? "✓ " : "+ "}${k[0].toUpperCase() + k.slice(1)}</button>`; }).join("")}</div>`;
  }
  if (z === "bf") h += it("sac", "Sacrifice");
  if (c.token && z === "bf") h += it("remove", "Remove token");
  ptMenu(x, y, h);
}
function ptWaysHtml(c, zone){
  const own = ptCastWays(c, zone), seen = new Set(own.map(w => w.k));
  const all = zone === "hand" ? (ptIsPermanentType(c) && !ptIsLand(c) ? ["evoke", "dash", "blitz", "kicker", "emerge", "cascade"] : ptIsLand(c) ? [] : ["kicker", "madness", "cascade"]) : ["flashback", "escape", "unearth", "disturb"];
  const desc = {evoke: "enters, then sacrificed", dash: "haste, back to hand at end step", blitz: "haste, sacrificed at end step, draw when it dies", kicker: "kicked", emerge: "sacrifice a creature too",
    madness: "discarded and cast", cascade: "cast it, and it has cascade (Yidris, other effects)", flashback: "cast, then exiled", escape: "cast from the graveyard", unearth: "haste, exiled at end step", disturb: "cast transformed, exiled if it would die"};
  const extra = all.filter(k => !seen.has(k));
  if (zone === "exile") extra.length = 0;
  if (!own.length && !extra.length) return "";
  return `<div class="ptm-sep">Cast another way</div>
    ${own.map(w => { const real = PT.phase === "play" && !PT_WAY_FACE.has(w.k) && /\{/.test(w.cost || "") ? ptCastCost(c, zone, w) : null, shown = PT_WAY_ADD.has(w.k) ? "+" + (w.cost || "") : w.cost; return `<button type="button" data-m="way" data-way="${w.k}" class="ptm-way"><span><b>${PT_WAYS[w.k] || w.k}</b>${w.cost ? ` <span class="mono">${esc(shown)}</span>` : ""}${real && real !== ptManaPart(w.cost) ? ` <span class="mono" title="What you'd pay now, with cost reductions${PT_WAY_ADD.has(w.k) ? " (mana cost plus this)" : ""}">→ ${esc(ptManaTxt(real))}</span>` : ""}${w.why ? ` <small>from ${esc(w.why)}</small>` : ""}</span><small>${esc(desc[w.k] || PT_WAY_DESC[w.k] || "")}</small></button>`; }).join("")}
    ${extra.length ? `<div class="ptm-ways">${extra.map(k => `<button type="button" data-m="way" data-way="${k}" title="${esc(desc[k] || "")}">${PT_WAYS[k]}</button>`).join("")}</div>` : ""}`;
}
function ptLibMenu(x, y){
  ptMenuFor = {lib: true, x, y};
  ptMenu(x, y, `<div class="ptm-title">Library · ${PT.lib.length} cards</div>
    <div class="ptm-row"><button type="button" data-m="drawn">Draw</button><input type="number" id="ptmN" value="1" min="1" max="99" aria-label="How many"><span class="cur-sub">cards</span></div>
    <button type="button" data-m="scryn">Scry that many</button><button type="button" data-m="looktop">Look at that many (pick, rest to bottom…)</button><button type="button" data-m="milln">Mill that many</button><button type="button" data-m="exiletop">Exile that many</button>
    <button type="button" data-m="playtop">Put the top card onto the battlefield</button>
    <div class="ptm-sep"></div><button type="button" data-m="search">Search library…</button><button type="button" data-m="shuffle">Shuffle<kbd>S</kbd></button>`);
}
// Everything you open (scry, look at the top, search, tokens, attack, legend rule, graveyard, help) shows in the side panel,
// in place of the stack, so the table stays in view. Close it to get the stack back.
function ptModal(title, body, foot){
  const m = $("ptModal"); m.hidden = false; $("ptSide").classList.add("drawer-open");
  m.innerHTML = `<div class="ptd" role="region" aria-label="${esc(title)}"><div class="ptd-head"><button class="ptd-back" type="button" data-d="close" aria-label="Back to the stack">‹</button><h3>${esc(title)}</h3><button class="btn ghost ptd-x" type="button" data-d="close" aria-label="Close">✕</button></div><div class="ptd-body">${body}</div>${foot ? `<div class="ptd-foot">${foot}</div>` : ""}</div>`;
}
function ptCloseModal(){ const m = $("ptModal"); if (!m) return;
  if (PT && PT_VIEW && PT_VIEW.kind === "blocks" && !PT_VIEW.done && (PT.combat || []).length && !PT.trig.some(x => x.kind === "combatdmg")) { PT.trig.push({id: ++ptTrigId + "-dmg", srcUid: null, srcName: "Combat damage", img: "", kind: "combatdmg", text: "Blockers, then combat damage.", actions: [{t: "combat", label: "Blocks and damage"}]}); setTimeout(ptRender, 0); } if (PT_PICK && !PT_PICK.done) { ptPickAbandon(); setTimeout(ptRender, 0); } m.hidden = true; m.innerHTML = ""; $("ptSide").classList.remove("drawer-open"); PT_VIEW = null;
  document.querySelectorAll("#ptBf .ptc.attacking, #ptBf .ptc.pickable").forEach(el => el.classList.remove("attacking", "pickable", "picked")); }
let PT_VIEW = null;   // what the open card list dialog is showing
// A list of cards with buttons: used for graveyard, exile, searching, looking at the top and scrying
function ptView(kind, n){
  PT_VIEW = {kind, n, choice: {}};
  ptRenderView();
}
// "Look at the top X": pick some, send the picked ones one way and the rest another, as the card says
const PT_DIG_SEL = [["hand", "Into your hand"], ["top", "On top of your library"], ["bf", "Onto the battlefield"], ["grave", "Into the graveyard"], ["exile", "Into exile"], ["bottom", "On the bottom"]];
const PT_DIG_REST = [["bottomRandom", "On the bottom in a random order"], ["bottom", "On the bottom in this order"], ["grave", "Into the graveyard"], ["exile", "Into exile"], ["top", "Back on top in this order"], ["hand", "Into your hand"]];
function ptDigOpen(n){
  n = Math.max(1, Math.min(PT.lib.length || 1, n || prefs.ptLookN || 3));
  PT_VIEW = {kind: "dig", n, picked: [], order: PT.lib.slice(0, n).map(c => c.uid)};
  ptRenderDig();
}
function ptRenderDig(){
  const v = PT_VIEW, byUid = new Map(PT.lib.map(c => [c.uid, c]));
  const cards = v.order.map(u => byUid.get(u)).filter(Boolean), max = Math.max(0, prefs.ptDigMax ?? 1);
  const selTo = prefs.ptDigSel || "hand", restTo = prefs.ptDigRest || "bottomRandom";
  const opt = (list, cur) => list.map(([k, n]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${n}</option>`).join("");
  const body = `<div class="dig-bar">
      <label class="inline-field">Look at the top <input type="number" id="digN" min="1" max="${Math.max(1, PT.lib.length)}" value="${v.n}"> cards</label>
      <label class="inline-field">Pick up to <input type="number" id="digMax" min="0" max="${v.n}" value="${max}"></label>
      <span class="cur-sub">${max ? `Click ${max === 1 ? "the card" : "the cards"} you want.` : "Picking nothing: every card goes where “the rest” go."} The leftmost card is the top of your library.</span>
    </div>
    <div class="ptd-grid dig-grid">${cards.map((c, i) => { const pi = v.picked.indexOf(c.uid);
      return `<div class="ptd-card dig-card${pi >= 0 ? " picked" : ""}"><button type="button" class="ptd-img dig-pick" data-dig="pick" data-uid="${c.uid}" data-uid-view="${c.uid}" aria-pressed="${pi >= 0}" title="${pi >= 0 ? "Picked: click to unpick" : "Click to pick"}">${ptFace(c)}${pi >= 0 ? `<span class="dig-num">${max > 1 ? pi + 1 : "✓"}</span>` : ""}</button>
        <b>${esc(c.name)}</b>
        <div class="ptd-acts"><button type="button" data-dig="left" data-uid="${c.uid}" ${i ? "" : "disabled"} aria-label="Move left">◀</button><span class="dig-pos">${i + 1}</span><button type="button" data-dig="right" data-uid="${c.uid}" ${i < cards.length - 1 ? "" : "disabled"} aria-label="Move right">▶</button></div></div>`; }).join("") || `<div class="pt-empty">Your library is empty.</div>`}</div>
    <div class="dig-dest">
      <label class="field">Picked ${v.picked.length === 1 ? "card goes" : "cards go"} <select id="digSel">${opt(PT_DIG_SEL, selTo)}</select></label>
      <label class="field">The rest go <select id="digRest">${opt(PT_DIG_REST, restTo)}</select></label>
      <label class="chk"><input type="checkbox" id="digReveal" ${prefs.ptDigReveal ? "checked" : ""}> Say what I picked in the log (reveal)</label>
    </div>`;
  ptModal(`Look at the top ${v.n}`, body, `<span class="cur-sub">${v.picked.length} picked · ${cards.length - v.picked.length} left over</span><button class="btn ghost" type="button" data-d="close">Cancel</button><button class="btn primary" type="button" data-dig="done">Done</button>`);
}
function ptDigApply(){
  const v = PT_VIEW, byUid = new Map(PT.lib.map(c => [c.uid, c]));
  const cards = v.order.map(u => byUid.get(u)).filter(Boolean);
  const picked = cards.filter(c => v.picked.includes(c.uid)), rest = cards.filter(c => !v.picked.includes(c.uid));
  const selTo = prefs.ptDigSel || "hand", restTo = prefs.ptDigRest || "bottomRandom";
  ptDo(() => {
    for (const c of cards) PT.lib.splice(PT.lib.indexOf(c), 1);
    const send = (list, to) => {
      if (!list.length) return;
      if (to === "top") PT.lib.unshift(...list);
      else if (to === "bottom") PT.lib.push(...list);
      else if (to === "bottomRandom") PT.lib.push(...shuffle(list.slice()));
      else if (to === "bf") for (const c of list) { PT.lib.unshift(c); ptMove(c.uid, "bf"); PT.log.shift(); }
      else PT[to].push(...list);
    };
    // whatever goes back on top ends up above the rest: put the rest first, then the picked cards
    send(rest, restTo); send(picked, selTo);
    const where = {hand: "into hand", top: "on top", bf: "onto the battlefield", grave: "into the graveyard", exile: "into exile", bottom: "on the bottom", bottomRandom: "on the bottom in a random order"};
    const names = prefs.ptDigReveal && picked.length ? ` (${picked.map(c => c.name).join(", ")})` : "";
    ptLog(`Looked at the top ${cards.length}: ${picked.length ? `${picked.length} ${where[selTo]}${names}` : "picked none"}${rest.length ? `, ${rest.length} ${where[restTo]}` : ""}.`);
  });
  ptCloseModal();
}
// Finish a library search: shuffle (when ticked), then whatever was set aside goes on top, in the order picked
function ptSearchDone(){
  const v = PT_VIEW, shuf = ($("ptdShuffle") || {checked: true}).checked, held = (v && v.held || []).slice();
  ptDo(() => {
    if (shuf) ptShuffle();
    for (const u of held.slice().reverse()) { const i = PT.lib.findIndex(c => c.uid === u); if (i >= 0) PT.lib.unshift(PT.lib.splice(i, 1)[0]); }
    if (held.length) ptLog(`Put ${held.map(u => PT.lib.find(c => c.uid === u).name).join(", ")} on top of the library${shuf ? " after shuffling" : ""}.`);
  });
  ptCloseModal();
}
function ptRenderView(){
  const v = PT_VIEW; if (!v) return;
  if (v.kind === "dig") return ptRenderDig();
  const zone = v.kind === "grave" ? "grave" : v.kind === "exile" ? "exile" : "lib";
  let list = PT[zone].slice(); if (zone !== "lib") list.reverse();
  if (v.kind === "scry" || v.kind === "look") list = list.slice(0, v.n);
  const all = list.length;
  if (v.kind === "search" && v.what && !v.showAll) list = list.filter(c => trFits(v.what, c));
  const q = (v.q || "").toLowerCase(); if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.type || "").toLowerCase().includes(q));
  const title = {grave: "Graveyard", exile: "Exile", search: "Search your library", scry: `Scry ${v.n}`, look: `Top ${v.n} of your library`}[v.kind];
  const acts = v.kind === "scry" ? [["top", "Keep on top"], ["bottom", "Bottom"], ["grave", "Graveyard"]]
    : [["hand", "Hand"], ["bf", "Battlefield"], ...(zone !== "grave" ? [["grave", "Graveyard"]] : []), ...(zone !== "exile" ? [["exile", "Exile"]] : []), ...(zone !== "lib" ? [["lib", "Library top"]] : [["libBottom", "Bottom"]])];
  if (v.kind === "exile" && PT.phase === "play") acts.unshift(["play", "Play", true]);
  if (v.kind === "search") {
    acts.splice(acts.findIndex(x => x[0] === "libBottom"), 0, ["top", "Top"]);
    if (v.to) { const want = {hand: "hand", bf: v.tapped ? "bfTapped" : "bf", top: "top", grave: "grave", bottom: "libBottom"}[v.to]; const lbl = {hand: "Into your hand", bf: "Onto the battlefield", bfTapped: "Onto the battlefield tapped", top: "On top (after the shuffle)", grave: "Into your graveyard", libBottom: "On the bottom"}[want];
      const i = acts.findIndex(x => x[0] === (want === "bfTapped" ? "bf" : want)); if (i >= 0) acts.splice(i, 1); acts.unshift([want, lbl, true]); }
  }
  const held = v.held || [];
  const body = `${v.kind === "search" || list.length > 12 ? `<input type="search" class="ptd-find" id="ptdFind" placeholder="Find by name or type" value="${esc(v.q || "")}">` : ""}
    ${v.kind === "search" && (v.what || v.to) ? `<p class="cur-sub pt-search-for">${v.src ? `<b>${esc(v.src)}</b>: ` : ""}looking for ${v.max > 1 && v.max < 99 ? `up to ${v.max} <b>${esc(trCap(v.what || "card"))}</b> cards` : v.max === 99 ? `any number of <b>${esc(trCap(v.what || "card"))}</b> cards` : `${/^[aeiou]/i.test(v.what || "card") ? "an" : "a"} <b>${esc(trCap(v.what || "card"))}</b>${v.what ? " card" : ""}`}${v.to ? `, which goes <b>${{hand: "into your hand", bf: "onto the battlefield" + (v.tapped ? " tapped" : ""), top: "on top of your library after the shuffle", grave: "into your graveyard", bottom: "on the bottom"}[v.to]}</b>` : ""}.
      ${v.what ? `<button type="button" class="linkish" data-d="searchall">${v.showAll ? `Show only ${esc(trCap(v.what))} cards` : `Show all ${all} cards`}</button>` : ""}</p>` : ""}
    ${held.length ? `<p class="cur-sub">Goes on top after the shuffle: <b>${held.map(u => esc((PT.lib.find(c => c.uid === u) || {}).name || "")).join(", ")}</b></p>` : ""}
    ${v.kind === "scry" ? `<p class="cur-sub">Top of the library is first. Choose where each card goes, then press Done. Cards kept on top stay in this order.</p>` : ""}
    <div class="ptd-grid">${list.map(c => `<div class="ptd-card${v.choice[c.uid] ? " chosen-" + v.choice[c.uid] : ""}"><div class="ptd-img" data-uid-view="${c.uid}">${ptFace(c)}</div><b>${esc(c.name)}</b>
      <div class="ptd-acts">${acts.map(([k, n, main]) => `<button type="button" data-v="${k}" data-uid="${c.uid}"${main ? ` class="ptd-main"` : ""} aria-pressed="${v.kind === "scry" ? (v.choice[c.uid] || "top") === k : v.kind === "search" && k === "top" ? held.includes(c.uid) : false}">${n}</button>`).join("")}</div></div>`).join("") || `<div class="pt-empty">${q ? "No matches." : v.kind === "search" && v.what && !v.showAll ? `No ${esc(trCap(v.what))} cards in your library.` : "Nothing here."}</div>`}</div>`;
  const foot = v.kind === "scry" ? `<button class="btn primary" type="button" data-d="scrydone">Done</button>`
    : v.kind === "search" ? `<label class="chk"><input type="checkbox" id="ptdShuffle" ${v.noShuffle ? "" : "checked"}> Shuffle when done</label><button class="btn primary" type="button" data-d="done">Done</button>`
    : `<button class="btn primary" type="button" data-d="done">Done</button>`;
  const focusFind = document.activeElement && document.activeElement.id === "ptdFind";
  ptModal(title, body, foot);
  if (focusFind) { const f = $("ptdFind"); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
}
async function ptDeckTokens(){
  const d = deckById(PT.deckId); if (!d) return [];
  if (ptTokenCache.has(d.id)) return ptTokenCache.get(d.id);
  const ids = [...new Set([...d.commanders, ...d.cards].map(c => c.sid).filter(Boolean))], tokIds = new Set();
  for (let i = 0; i < ids.length; i += 75) {
    const j = await sf("/cards/collection", {method: "POST", headers: {"Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify({identifiers: ids.slice(i, i + 75).map(id => ({id}))})});
    for (const c of j.data || []) for (const p of c.all_parts || []) if (p.component === "token" && p.id !== c.id) tokIds.add(p.id);
  }
  const toks = [], list = [...tokIds];
  for (let i = 0; i < list.length; i += 75) {
    const j = await sf("/cards/collection", {method: "POST", headers: {"Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify({identifiers: list.slice(i, i + 75).map(id => ({id}))})});
    for (const c of j.data || []) toks.push(slimCard(c));
  }
  const uniq = [...new Map(toks.map(t => [t.name + "|" + t.power + "|" + t.toughness + "|" + (t.colors || []).join(""), t])).values()].sort((a, b) => a.name.localeCompare(b.name));
  ptTokenCache.set(d.id, uniq); return uniq;
}
let ptTokenFound = [];
function ptTokenDialog(){
  const n = `<label class="inline-field">How many <input type="number" id="ptTokN" value="1" min="1" max="99"></label>`;
  ptModal("Create tokens", `
    <div class="ptd-tokbar">${n}<span class="cur-sub">Click a token to put it onto the battlefield.</span></div>
    <h4>Tokens this deck makes</h4><div class="ptd-toks" id="ptTokDeck"><div class="cur-sub">Looking up your deck's tokens on Scryfall…</div></div>
    <h4>Common tokens</h4><div class="ptd-chips">${PT_COMMON_TOKENS.map((t, i) => `<button type="button" class="ptd-chip" data-tokc="${i}"><b>${esc(t.name)}</b>${t.power ? `<span>${t.power}/${t.toughness}</span>` : ""}</button>`).join("")}</div>
    <h4>Find any token</h4><form class="ptd-search" id="ptTokSearch"><input type="search" id="ptTokQ" placeholder="e.g. Elemental, Insect, Monk" aria-label="Token name or type"><button class="btn" type="submit">Search</button></form>
    <div class="ptd-toks" id="ptTokRes"></div>
    <h4>Make your own</h4><form class="ptd-custom" id="ptTokCustom">
      <label class="field grow">Name <input type="text" id="ptcName" maxlength="40" placeholder="Wurm" required></label>
      <label class="field">Kind <select id="ptcKind"><option>Creature</option><option>Artifact</option><option>Artifact Creature</option><option>Enchantment</option><option>Enchantment Creature</option><option>Land</option></select></label>
      <label class="field">Power <input type="text" id="ptcP" maxlength="3" value="1"></label><label class="field">Toughness <input type="text" id="ptcT" maxlength="3" value="1"></label>
      <label class="field">Color <select id="ptcCol"><option value="">Colorless</option><option value="W">White</option><option value="U">Blue</option><option value="B">Black</option><option value="R">Red</option><option value="G">Green</option></select></label>
      <label class="field grow">Text <input type="text" id="ptcText" maxlength="80" placeholder="Flying, haste"></label>
      <button class="btn primary" type="submit">Create</button></form>`);
  ptDeckTokens().then(list => {
    const box = $("ptTokDeck"); if (!box) return;
    ptTokenFound = list.slice();
    box.innerHTML = list.length ? list.map((t, i) => `<button type="button" class="ptd-tok" data-tokf="${i}" title="${esc(t.name)}">${ptFace(ptMakeCard(t))}<small>${esc(t.name)}${t.power ? ` ${esc(t.power)}/${esc(t.toughness)}` : ""}</small></button>`).join("") : `<div class="cur-sub">No tokens are listed for the cards in this deck.</div>`;
  }).catch(() => { const box = $("ptTokDeck"); if (box) box.innerHTML = `<div class="cur-sub">Couldn't reach Scryfall. Use the common tokens or make your own.</div>`; });
}
const ptTokN = () => Math.max(1, Math.min(99, parseInt(($("ptTokN") || {}).value) || 1));
async function ptCommonToken(i){
  const def = PT_COMMON_TOKENS[i], n = ptTokN();
  // try for the real token picture; fall back to a drawn tile when offline
  let card = Object.assign({}, def);
  try {
    const q = `t:token !"${def.name}"${def.power ? ` pow=${def.power} tou=${def.toughness}` : ""}${def.colors.length ? ` c=${def.colors.join("")}` : " c=c"}`;
    const j = await sf(`/cards/search?unique=cards&order=released&dir=desc&include_extras=true&q=${encodeURIComponent(q)}`);
    if (j && j.data && j.data[0]) card = slimCard(j.data[0]);
  } catch (e) {}
  ptDo(() => ptCreateToken(card, n)); toast(`Created ${n} ${def.name} token${n === 1 ? "" : "s"}.`);
}
async function ptSearchTokens(q){
  const box = $("ptTokRes"); box.innerHTML = `<div class="cur-sub">Searching…</div>`;
  try {
    const j = await sf(`/cards/search?unique=cards&order=name&include_extras=true&q=${encodeURIComponent(`t:token (${q})`)}`);
    const list = (j.data || []).slice(0, 40).map(slimCard);
    const base = ptTokenFound.length; ptTokenFound = ptTokenFound.concat(list);
    box.innerHTML = list.length ? list.map((t, i) => `<button type="button" class="ptd-tok" data-tokf="${base + i}" title="${esc(t.name)}">${ptFace(ptMakeCard(t))}<small>${esc(t.name)}${t.power ? ` ${esc(t.power)}/${esc(t.toughness)}` : ""}</small></button>`).join("") : `<div class="cur-sub">No tokens found for “${esc(q)}”.</div>`;
  } catch (e) { box.innerHTML = `<div class="cur-sub">Couldn't reach Scryfall.</div>`; }
}
function ptDice(x, y){
  ptMenuFor = {dice: true};
  ptMenu(x, y, `<div class="ptm-title">Dice</div><button type="button" data-m="roll" data-n="2">Flip a coin</button><button type="button" data-m="roll" data-n="6">Roll a d6</button><button type="button" data-m="roll" data-n="20">Roll a d20</button><div class="ptm-row"><span>Roll a d</span><input type="number" id="ptmDie" value="12" min="2" max="1000" aria-label="Sides"><button type="button" data-m="rolln">Roll</button></div>`);
}
function ptRoll(n){
  const v = 1 + Math.floor(Math.random() * n);
  const msg = n === 2 ? `Coin flip: ${v === 1 ? "heads" : "tails"}.` : `Rolled a d${n}: ${v}.`;
  ptDo(() => ptLog(msg)); toast(msg);
}
function ptHelp(){
  ptModal("How the playtest works", `<div class="pt-help">
    <p><b>Click</b> a card on the battlefield to tap or untap it. <b>Click</b> a card in your hand to play it: permanents land in the right row, instants and sorceries go to the graveyard.</p>
    <p>Matching tokens stack in one spot, 10 to a stack (the count shows on top); more start a new stack beside it. Dragging a stack moves the whole stack; hold <kbd>Shift</kbd> while dragging to take just the top one. Right-click a stack to tap or untap all of it.</p>
    <p><b>Mana.</b> Click a card in your hand (or your commander) and Deckseer pays for it: it uses mana in your pool first, then taps the lands, mana rocks and mana creatures that leave you the most options (painlands only when needed, Treasures last, convoke creatures if the card has convoke), and adds commander tax. Cards you can afford right now glow gold. If you can't pay, it says what's missing and lets you cast it anyway. Rituals, Treasures and lands you tap by hand go into your <b>mana pool</b> (shown at the top), which empties at the end of the turn. Dragging a card onto the table puts it there without paying. Turn this off in ⋯ → Settings.</p>
    <p><b>Drag</b> any card to a grid square, your hand, the graveyard, exile, the command zone, or the top or bottom of your library. Cards snap to the squares wherever you drop them, and you can overlap them (an Aura on a creature, say).</p>
    <p><b>Right-click</b> a card for counters, token copies, face down, transform and moving it. Right-click the library to draw, scry, look at, mill or exile several cards, or search it.</p>
    <p>Click a counter on a card to add one, right-click it to remove one. Tokens that leave the battlefield stop existing.</p>
    <p><b>⚡ Trigger helper.</b> When something happens that one of your cards cares about (a card enters, you cast a spell, a creature dies, your upkeep or end step, you gain life, you attack…), the helper steps in. In <b>Auto</b> mode the simple ones just happen (draw, tokens, life, counters, damage to your opponent, mill) and a green note says what it did. Anything with a choice, a target or an “if” waits in the tray: <b>Do it</b> carries out the parts it understands, the rest is a reminder to do by hand. <b>Ask</b> mode puts every trigger in the tray. Click the ⚡ button to switch. It reads the card's wording, so now and then it asks when a condition isn't met: just Skip. Mute stops a card asking for the rest of the game.</p>
    <p>It also knows the usual rules-changers on your table: token and counter doublers (Doubling Season, Parallel Lives, Hardened Scales, Winding Constrictor), life and damage doublers (Boon Reflection, Torbran, Fiery Emancipation), extra triggers (Panharmonicon, Yarok, Teysa, Drivnod, Isshin, Veyran), stat boosts and abilities other cards give (anthems, lords, haste, vigilance, lifelink, double strike), blinking and rebound (Ephemerate), clones, cascade, discover and afterlife.</p>
    <p><b>Rules engine.</b> All 195 keyword abilities and 71 keyword actions from the Comprehensive Rules are recognised (hover a card to see its keywords; ⋯ → Rules lookup to read any of them). In Auto mode these happen on their own: keyword triggers (prowess, exalted, afterlife, mobilize, evolve, training, extort and the rest), instants and sorceries (removal, wipes, pumps, burn, card draw, tutors for lands and typed cards, reanimation, extra turns, modal spells: click the mode), sagas, planeswalker loyalty, Equipment and Auras (drag one onto a creature to attach it), vehicles, and the state-based actions: 0 toughness, lethal damage, legend rule, auras falling off, poison. Right-click a permanent to use its abilities (mana rocks, Clues, Treasures, equip, crew, loyalty…). When a card needs you to choose (a target, what to sacrifice, discard, return or search for, what to equip or crew with, what a Clone copies), the choices open in the side panel: click the cards and press Done, or press <b>Pick for me</b>. Close the panel to decide later: the choice waits on the stack. To have every choice made for you, turn on ⋯ → Make choices for me. The opponent is only a life total here, so anything aimed at their permanents or spells is noted and skipped. Mana isn't counted: costs are assumed paid, and X is your land count minus the rest of the cost.</p>
    <p><b>Opponents.</b> The strip under the top bar shows each opponent (3 in Commander; change it in ⋯ → Settings) with their life, poison and commander damage. Click a name to aim at that opponent: "target opponent" and "any target" effects hit them, "each opponent" effects hit everyone. Give them creatures with <b>+ Creature</b> (quick ones, your own, or a real card), or use their ⋯ menu to let their board grow each turn like a typical deck or like one of your decks. Your removal and sweepers hit their creatures (the biggest threat first, from the opponent you're aiming at), and "each opponent sacrifices" takes their least useful one. An opponent is out at 0 life, 10 poison or 21 damage from one commander, and you win when they're all out.</p>
    <p><b>Attack</b> taps your attackers and sets off attack triggers. Choose who each creature attacks. Your opponents then block the way a careful player would (good blocks, safe blocks, and chump blocks only to stay alive), and you can change any block. Damage follows the rules: first strike and double strike, trample, deathtouch, lifelink, menace, flying and reach, infect and toxic. <b>Next turn</b> runs your end step, untap, upkeep and draw in order.</p>
    <p class="keys"><span><kbd>D</kbd> draw</span><span><kbd>U</kbd> untap all</span><span><kbd>N</kbd> next turn</span><span><kbd>S</kbd> shuffle</span><span><kbd>K</kbd> tokens</span><span><kbd>A</kbd> attack</span><span><kbd>E</kbd> end turn</span><span><kbd>T</kbd> tap card under the pointer</span><span><kbd>+</kbd>/<kbd>−</kbd> +1/+1 counter on it</span><span><kbd>C</kbd> copy it</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span><span><kbd>Esc</kbd> close</span></p>
    <label class="inline-field">Opponents <select id="ptOppNsel">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${PT && PT.opps && PT.opps.length === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label class="chk"><input type="checkbox" id="ptAutoMana" ${ptAutoMana() ? "checked" : ""}> Pay mana automatically (clicking a card taps the right lands; cards you can afford glow)</label>
    <label class="chk"><input type="checkbox" id="ptDrawT1" ${prefs.ptDrawT1 ? "checked" : ""}> Draw a card on turn 1 (you're on the draw)</label>
    <label class="inline-field">Card size <input type="range" id="ptCellSize" min="12" max="30" step="1" value="${ptGrid()}"></label>
  </div>`);
}
function openPlaytest(d){
  if (!d || !(d.cards.length + d.commanders.length)) return toast("Add some cards to this deck first.");
  PT = ptNew(d); ptHover = null; ptResolved = []; ptAutoRecent = [];
  ptEl().hidden = false; document.body.classList.add("pt-open");
  ptRender();
}
function closePlaytest(){ ptEl().hidden = true; document.body.classList.remove("pt-open"); ptCloseMenu(); ptCloseModal(); PT = null; }

