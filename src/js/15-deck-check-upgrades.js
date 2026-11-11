/* ---------------- deck check: mana base, bracket, price, cuts and adds ---------------- */
// chance of drawing at least k of K "hits" in n cards from a deck of N (hypergeometric)
function hyperAtLeast(N, K, n, k){
  if (k <= 0) return 1; if (K < k || n < k) return 0;
  const lc = (a, b) => { if (b < 0 || b > a) return -Infinity; let s = 0; for (let i = 1; i <= b; i++) s += Math.log(a - b + i) - Math.log(i); return s; };
  let p = 0; const tot = lc(N, n);
  for (let x = k; x <= Math.min(K, n); x++) p += Math.exp(lc(K, x) + lc(N - K, n - x) - tot);
  return Math.min(1, p);
}
// Game Changers: Scryfall's live list (cached for two weeks), or a built-in copy
const DC_GC_FALLBACK = ["Ad Nauseam", "Ancient Tomb", "Aura Shards", "Bolas's Citadel", "Braids, Cabal Minion", "Chrome Mox", "Coalition Victory", "Consecrated Sphinx", "Crop Rotation", "Cyclonic Rift", "Deflecting Swat", "Demonic Tutor", "Drannith Magistrate", "Enlightened Tutor", "Expropriate", "Field of the Dead", "Fierce Guardianship", "Food Chain", "Force of Will", "Gaea's Cradle", "Gamble", "Gifts Ungiven", "Glacial Chasm", "Grand Arbiter Augustin IV", "Grim Monolith", "Humility", "Imperial Seal", "Intuition", "Jeska's Will", "Lion's Eye Diamond", "Mana Vault", "Mishra's Workshop", "Mox Diamond", "Mystical Tutor", "Narset, Parter of Veils", "Natural Order", "Necropotence", "Notion Thief", "Opposition Agent", "Orcish Bowmasters", "Panoptic Mirror", "Rhystic Study", "Seedborn Muse", "Serra's Sanctum", "Smothering Tithe", "Survival of the Fittest", "Sway of the Stars", "Teferi's Protection", "Tergrid, God of Fright", "Thassa's Oracle", "The One Ring", "The Tabernacle at Pendrell Vale", "Underworld Breach", "Vampiric Tutor", "Worldly Tutor"];
let dcGC = null;
async function dcGameChangers(){
  if (dcGC) return dcGC;
  const c = store.get("bsw-gc", null);
  if (c && c.names && Date.now() - c.t < 14 * 864e5) return (dcGC = {names: new Set(c.names), live: true});
  try {
    const names = []; let url = "https://api.scryfall.com/cards/search?q=" + encodeURIComponent("is:gamechanger") + "&unique=cards";
    while (url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const j = await r.json(); names.push(...j.data.map(x => x.name)); url = j.has_more ? j.next_page : null; }
    if (names.length) { store.set("bsw-gc", {t: Date.now(), names}); return (dcGC = {names: new Set(names), live: true}); }
  } catch (e) { console.warn("game changers", e); }
  return (dcGC = {names: new Set(DC_GC_FALLBACK), live: false});
}
let dcState = {tab: "mana", deckId: null, gc: null};
function dcMana(d){
  const isCmd = d.format === "commander";
  const main = d.cards.filter(c => c.board === "main");
  const N = main.reduce((t, c) => t + (c.qty || 1), 0) + (isCmd ? 0 : 0);
  const cols = ["W", "U", "B", "R", "G"], nameC = {W: "White", U: "Blue", B: "Black", R: "Red", G: "Green"};
  const pips = {}, need = {}, src = {}; let lands = 0, tapped = 0, rocks = 0, cmcSum = 0, spells = 0;
  const hungry = [];
  for (const c of main.concat(d.commanders)) {
    const q = c.qty || 1, f = fwCard(c, d.commanders.includes(c));
    if (f.land) { lands += q; if (f.tapped) tapped += q; }
    else { spells += q; cmcSum += (c.cmc || 0) * q; }
    const units = f.land ? f.units : f.rock || f.dork || [];
    if ((f.rock || f.dork) && !f.land) rocks += q;
    if (!d.commanders.includes(c)) for (const k of cols) if ((units || []).some(u => u.split(/[!#@~]/)[0].includes(k) || u.startsWith("LEG"))) src[k] = (src[k] || 0) + q * ((units || []).some(u => u.includes("!")) ? 0.5 : 1);
    if (!f.land) {
      const per = {};
      for (const s of String(c.cost || "").match(/\{[^}]+\}/g) || []) { const x = s.slice(1, -1); const ks = x.split("/").filter(y => cols.includes(y)); for (const k of ks) { per[k] = (per[k] || 0) + 1 / ks.length; } }
      for (const k in per) { pips[k] = (pips[k] || 0) + per[k] * q; need[k] = (need[k] || 0) + q; }
      for (const k in per) if (per[k] >= 2) hungry.push({name: c.name, k, n: Math.floor(per[k]), cmc: c.cmc || 0});
    }
  }
  const draws = t => 7 + t - (isCmd ? 0 : 1);
  const rows = cols.filter(k => pips[k]).map(k => {
    const K = Math.round(src[k] || 0);
    return {k, name: nameC[k], pips: Math.round(pips[k] * 10) / 10, cards: need[k], sources: src[k] || 0, t2: hyperAtLeast(N, K, draws(2), 1), t3: hyperAtLeast(N, K, draws(3), 1)};
  });
  const hung = hungry.map(h => ({...h, p: hyperAtLeast(N, Math.round(src[h.k] || 0), draws(Math.max(1, Math.round(h.cmc))), h.n)})).sort((a, b) => a.p - b.p).slice(0, 6);
  const avg = spells ? cmcSum / spells : 0;
  const wantLands = isCmd ? Math.round(31 + avg * 1.6 - rocks * 0.4) : Math.round((N * 0.4) + (avg - 2.5) * 1.5);
  const tips = [];
  for (const r of rows) if (r.t3 < 0.85) tips.push(`${r.name}: only ${Math.round(r.t3 * 100)}% to have a ${r.name.toLowerCase()} source by turn 3 (${Math.round(r.sources)} sources). Add ${r.name.toLowerCase()}-producing lands or rocks.`);
  if (lands < wantLands - 2) tips.push(`${lands} lands is light for an average mana value of ${avg.toFixed(1)}${rocks ? ` and ${rocks} mana rocks/creatures` : ""}: about ${wantLands} is usual.`);
  if (lands > wantLands + 3) tips.push(`${lands} lands is a lot for an average mana value of ${avg.toFixed(1)}: about ${wantLands} is usual. A couple could become card draw.`);
  if (tapped > Math.max(3, lands * 0.2)) tips.push(`${tapped} lands enter tapped. That's a turn lost now and then: swap a few for ones that enter untapped.`);
  for (const h of hung) if (h.p < 0.6) tips.push(`${h.name} needs ${h.n} ${nameC[h.k].toLowerCase()} mana: ${Math.round(h.p * 100)}% to have it by turn ${Math.max(1, Math.round(h.cmc))}.`);
  return {rows, hung, lands, tapped, rocks, avg, wantLands, tips, N};
}
async function dcBracket(d){
  const gc = await dcGameChangers();
  const all = d.cards.filter(c => c.board === "main").concat(d.commanders);
  const t = c => String(c.text || "").toLowerCase();
  const gcs = all.filter(c => gc.names.has(c.name) || gc.names.has(c.name.split(" // ")[0]));
  const mld = all.filter(c => /destroy all lands|destroy all nonbasic lands|each player sacrifices (?:all|x|\w+) lands|exile all lands|lands don't untap|lands your opponents control don't untap/.test(t(c)));
  const turns = all.filter(c => /takes? an extra turn/.test(t(c)));
  const tutors = all.filter(c => /search your library for (?:a|an|up to one) (?![a-z ]*\b(?:basic )?land\b)[^.]*card/.test(t(c)) && !/basic land|land card/.test(t(c)));
  let twoCard = [];
  try { if (await loadComboDb()) { const src = comboSource("deck"); twoCard = (src ? matchLocal(src).included : []).filter(v => v.cards.length === 2 && /infinite|win the game/i.test(v.produces.join(" "))); } } catch (e) {}
  let b = 2; const why = [];
  if (gcs.length) { b = Math.max(b, gcs.length > 3 ? 4 : 3); why.push(`${gcs.length} Game Changer${gcs.length > 1 ? "s" : ""}${gcs.length > 3 ? " (more than 3)" : " (1–3 allowed from bracket 3)"}`); }
  if (mld.length) { b = 4; why.push("mass land destruction (bracket 4+)"); }
  if (twoCard.length) { b = Math.max(b, 3); why.push(`${twoCard.length} two-card combo${twoCard.length > 1 ? "s" : ""} (bracket 3 allows them only late in the game; early ones are bracket 4)`); }
  if (turns.length > 1) { b = Math.max(b, 3); why.push(`${turns.length} extra-turn cards (chaining them is bracket 4)`); }
  if (tutors.length > 3) { b = Math.max(b, 3); why.push(`${tutors.length} tutors (brackets 1–2 expect few)`); }
  if (!why.length) why.push("no Game Changers, mass land destruction, two-card combos or extra-turn chains");
  return {b, why, gcs, mld, turns, tutors, twoCard, live: gc.live};
}
function dcPrice(d){
  const cur = prefs.cur;
  const owned = new Map(); for (const e of coll.values()) owned.set(e.name, (owned.get(e.name) || 0) + (e.qty || 0));
  const rows = d.cards.filter(c => c.board === "main" && !/^Basic\b/.test(c.type || "")).concat(d.commanders).map(c => { const p = priceOf(c, c.foil) || 0, q = c.qty || 1, own = Math.min(q, owned.get(c.name) || 0); return {name: c.name, p, q, own, miss: q - own}; });
  const total = rows.reduce((t, r) => t + r.p * r.q, 0), missing = rows.reduce((t, r) => t + r.p * r.miss, 0);
  // cheaper cards in your collection that do the same job
  const deckNames = new Set(rows.map(r => r.name)), ci = identity(d);
  const job = c => { const r = cardRole(c); return r.land ? "" : r.mana || r.landRamp ? "ramp" : r.draw || r.engine ? "card draw" : r.wipe ? "board wipe" : r.removal ? (r.counter ? "counterspell" : "removal") : ""; };
  const pool = [...coll.values()].filter(e => !deckNames.has(e.name) && (!ci.size || (e.ci || e.colors || []).every(x => ci.has(x))));
  const swaps = [];
  for (const r of rows.filter(r => r.p >= 5).sort((a, b) => b.p - a.p).slice(0, 12)) {
    const c = d.cards.find(x => x.name === r.name) || d.commanders.find(x => x.name === r.name); const j = c && job(c); if (!j) continue;
    const alt = pool.filter(e => job(e) === j && (e.cmc || 0) <= (c.cmc || 0) + 1 && unitVal(e, cur) < r.p / 2).sort((a, b) => (a.cmc || 0) - (b.cmc || 0))[0];
    if (alt) swaps.push({from: r.name, to: alt.name, job: j, save: r.p - unitVal(alt, cur)});
  }
  return {rows: rows.sort((a, b) => b.p * b.q - a.p * a.q), total, missing, swaps, cur};
}
/* ----- upgrades: every card's job, how well it fits the deck, and tested swaps ----- */
const DC_ROLES = {ramp: "Ramp", draw: "Card draw", removal: "Removal", wipe: "Board wipe", protect: "Protection & counters", tutor: "Tutor", engine: "Engine", finisher: "Finisher", threat: "Threat", theme: "Theme"};
function dcRoles(c, f){
  const r = cardRole(c), t = String(c.text || "").toLowerCase(), out = [];
  if (f.land) return ["land"];
  if (f.rock || f.dork || f.ramp || r.mana || r.landRamp || f.grantDork || f.landsAny || f.extraLand || (f.burst && !f.guide && f.perm) || (f.reduce && f.reduce.some(x => /creature|elemental|spell/.test(x.ph || "spell")))) out.push("ramp");
  if (f.draw || f.drawEach || f.drawMaxPow || f.drawLater || f.upkeepCard || r.draw || r.engine || (f.trigs || []).some(tr => tr.acts.some(a => a.t === "draw" || a.t === "topif")) || (f.acts || []).some(ab => ab.effs.some(a => a.t === "draw"))) out.push("draw");
  if (r.wipe) out.push("wipe");
  else if ((r.removal && !r.counter) || /\b(?:destroy|exile) target (?:creature|artifact|enchantment|permanent|nonland permanent|planeswalker)/.test(t)) out.push("removal");
  if (r.counter || /\b(?:creatures|permanents) you control (?:gain|have) (?:hexproof|indestructible|protection)|target (?:creature|permanent) you control gains (?:hexproof|indestructible|protection)|\bphase out\b|counter target/.test(t)) out.push("protect");
  if (/search your library for (?:a|an|up to one) (?![a-z ]*\bland\b)[^.]*card/.test(t) && !/basic land/.test(t)) out.push("tutor");
  if (f.dbl || f.grantEvoke || f.summons || f.reduce || f.tokenDrain || (f.trigs || []).length >= 1 && /\b(whenever|at the beginning)\b/.test(t)) out.push("engine");
  if ((f.power || 0) >= 6 || (f.burn || 0) >= 4 || f.pump || f.teamHaste || (f.anthem || []).length || (f.trigs || []).some(tr => tr.acts.some(a => a.t === "opp" && (a.countPh || (a.n || 0) >= 3)))) out.push("finisher");
  if (/deals? (?:x|\d+) damage (?:divided as you choose among any number of targets|to (?:any target|target player|each opponent|target opponent))/.test(t) && !out.includes("finisher")) out.push("finisher");
  if (/\bequipped creature gets \+\d|\bequipped creature (?:has|gains)/.test(t)) out.push("finisher");
  if (/\bCreature\b/.test(c.type || "") && ((f.power || 0) >= 3 || f.haste || f.ds) && !out.includes("finisher")) out.push("threat");
  if (FW_TYPE && /\bCreature\b/.test(c.type || "") && fwFits(FW_TYPE, f)) out.push("theme");
  return out;
}
const DC_TARGETS = {commander: {ramp: 10, draw: 10, removal: 8, wipe: 2, protect: 4}, other: {ramp: 4, draw: 4, removal: 6, wipe: 1, protect: 3}};
// Do two cards work together? (A's trigger, reducer or grant cares about B, sacrifice outlets and fodder, tokens and token payoffs, landfall and ramp)
function dcLinks(a, b){
  if (a.name === b.name) return 0;
  let w = 0;
  const specific = ph => { ph = String(ph || "").replace(/\b(a|an|another|other|you control|cardname|nontoken|token|spells?|permanents?)\b/g, " ").trim(); return ph && !/^(creature|land|card)$/.test(ph) ? ph : ""; };
  for (const tr of a.f.trigs || []) for (const k of tr.conds) {
    if (k.who === "self") continue;
    if (k.ev === "landplay" || (k.ev === "etb" && /\bland\b/.test(k.phrase || ""))) { if (b.roles.includes("ramp") || b.f.land) w += b.f.land ? 0 : 1; continue; }
    if (k.ev === "token") { if (b.makesTokens) w += 1; continue; }
    if (["etb", "cast", "dies", "sac", "attack"].includes(k.ev)) { const ph = specific(k.phrase); if (ph && fwFits(ph.replace(/with power \d+ or greater/, ""), b.f) && (!/power (\d+)/.test(k.phrase || "") || (b.f.power || 0) >= +(String(k.phrase).match(/power (\d+)/) || [0, 0])[1])) w += 1.5; else if (!ph && /\bCreature\b/.test(b.c.type || "") && ["dies", "sac"].includes(k.ev)) w += 0.5; }
  }
  for (const r of a.f.reduce || []) if (r.ph && specific(r.ph) && fwFits(r.ph, b.f)) w += 1;
  if (a.f.grantEvoke && fwFits(a.f.grantEvoke.ph, b.f)) w += 1;
  if (a.f.dbl && (a.f.dbl.etb ? (b.f.trigs || []).some(tr => tr.conds.some(k => k.ev === "etb")) : fwFits(a.f.dbl.ph, b.f) && (b.f.trigs || []).length)) w += 1.5;
  if (a.f.grantDork && fwFits(a.f.grantDork.ph, b.f)) w += 0.5;
  if (a.sacOutlet && (b.makesTokens || (b.f.trigs || []).some(tr => tr.conds.some(k => (k.ev === "dies" || k.ev === "sac") && k.who === "self")) || b.f.evoke)) w += 1;
  if (a.f.tokenDrain && b.makesTokens) w += 1;
  if (a.f.summons && fwFits(a.f.summons, b.f)) w += 0.5;
  if ((a.f.trigs || []).some(tr => tr.acts.some(x => x.t === "tutorTop")) && (b.f.trigs || []).some(tr => tr.acts.some(x => x.t === "topif"))) w += 2;
  return w;
}
function dcCardInfo(c, cmd){
  const f = fwCard(c, cmd), t = String(c.text || "").toLowerCase();
  return {name: c.name, c, f, cmd, roles: dcRoles(c, f), cmc: c.cmc || 0,
    makesTokens: /\bcreate\b[^.]*\btokens?\b/.test(t),
    sacOutlet: /sacrifice (?:a|an|another) (?:creature|elemental|permanent|artifact)[^:]*:/.test(t) || (f.reqs || []).some(r => r.k === "sac")};
}
function dcAnalyze(d){
  const main = d.cards.filter(c => c.board === "main");
  FW_TYPE = d.fwType || fwDeckType(main.concat(d.commanders));
  const cards = d.commanders.map(c => dcCardInfo(c, true)).concat(main.map(c => dcCardInfo(c, false)));
  // how well each card fits: links both ways with every other card
  for (const a of cards) { a.syn = 0; a.partners = []; }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j], w = dcLinks(a, b) + dcLinks(b, a);
    if (w > 0) { a.syn += w; b.syn += w; a.partners.push([b.name, w]); b.partners.push([a.name, w]); }
  }
  for (const a of cards) a.partners.sort((x, y) => y[1] - x[1]);
  // winning combos in the deck: their pieces are never cut
  const pieces = new Set();
  try { const src = comboSource("deck"); if (comboDb && src) for (const v of matchLocal(src).included) if (/infinite|win the game/i.test(v.produces.join(" "))) v.cards.forEach(n => pieces.add(n)); } catch (e) {}
  const T = DC_TARGETS[d.format === "commander" ? "commander" : "other"];
  const count = {}; for (const a of cards) if (!a.cmd) for (const r of a.roles) count[r] = (count[r] || 0) + (a.c.qty || 1);
  const keep = new Set(d.keep || []);
  return {cards, count, T, pieces, keep};
}
function dcCuts(d, A){
  const st = fwState && fwState.deckId === d.id ? fwState : null, use = st && st.real && st.real.use;
  const out = [];
  for (const a of A.cards) {
    if (a.cmd || a.f.land || A.keep.has(a.name) || A.pieces.has(a.name)) continue;
    const why = [], roles = a.roles.filter(r => DC_ROLES[r]);
    const short = roles.filter(r => A.T[r] && (A.count[r] || 0) <= A.T[r]);
    if (short.length) continue;   // it fills a job the deck is short on (or exactly at target)
    let score = 0;
    const over = roles.filter(r => A.T[r] && (A.count[r] || 0) > A.T[r]);
    if (over.length) { score += 3; why.push(over.map(r => `${DC_ROLES[r]}: you have ${A.count[r]} (about ${A.T[r]} is plenty)`).join("; ")); }
    if (!roles.length) { score += 3; why.push("no clear job in this deck"); }
    else if (!over.length && roles.every(r => !A.T[r])) why.push(roles.map(r => DC_ROLES[r]).join(", "));
    score -= Math.min(8, a.syn) * 1.2;
    if (a.syn < 1) why.push("works with almost nothing else in the deck");
    if (a.cmc >= 6) { score += (a.cmc - 5) * 0.8; why.push(`costs ${a.cmc}`); }
    if (use) { const u = use[a.name] || 0; if (!u) { score += 1.5; why.push(`never in a winning line in ${st.real.games} test games`); } else score -= Math.min(3, u / 3); }
    if (score <= 0 && !(use && !use[a.name])) continue;
    out.push({a, why, score});
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 10);
}
// candidates for the deck: your collection, plus (when searched) the most-played cards on Scryfall that fit
function dcCandidates(d, A){
  const ci = identity(d), deckNames = new Set(A.cards.map(a => a.name)), seen = new Set();
  const pool = [...coll.values()].map(e => ({c: e, src: "own"})).concat((dcState.scry && dcState.scry.id === d.id ? dcState.scry.cards : []).map(c => ({c, src: "scry"})));
  const out = [];
  for (const {c, src} of pool) {
    if (deckNames.has(c.name) || seen.has(c.name) || !c.text && !c.type) continue; seen.add(c.name);
    const cols = c.ci || c.colors || []; if (ci.size && cols.some(x => !ci.has(x))) continue;
    if (d.format === "commander" && c.legal && c.legal.commander && c.legal.commander !== "legal") continue;
    const info = dcCardInfo(c, false); if (info.f.land) continue;
    let syn = 0; const partners = [];
    for (const b of A.cards) { const w = dcLinks(info, b) + dcLinks(b, info); if (w > 0) { syn += w; partners.push([b.name, w]); } }
    partners.sort((x, y) => y[1] - x[1]);
    const fills = info.roles.filter(r => A.T[r] && (A.count[r] || 0) < A.T[r]);
    const need = fills.reduce((t, r) => t + (A.T[r] - (A.count[r] || 0)), 0);
    const score = need * 2.5 + Math.min(10, syn) * 1.5 + (info.roles.includes("theme") ? 2 : 0) - info.cmc * 0.6 + (src === "own" ? 2 : 0);
    if (!fills.length && syn < 2) continue;
    out.push({info, src, syn, partners, fills, score});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 14);
}
// Scryfall: the most-played cards in your colours for each job you're short on (and your creature type)
async function dcSearchScryfall(d, A){
  const ci = [...identity(d)].join("") || "wubrg";
  const q = {ramp: '(o:"add {" or o:"search your library for a basic land" or o:"search your library for up to two basic land")', draw: 'o:"draw"', removal: '(o:"destroy target" or o:"exile target")', wipe: '(o:"destroy all" or o:"exile all")', protect: '(o:"hexproof" or o:"indestructible" or o:"counter target spell")'};
  const want = Object.keys(q).filter(r => (A.count[r] || 0) < A.T[r]);
  const queries = want.map(r => q[r]); if (FW_TYPE) queries.push(`t:${FW_TYPE}`);
  const cards = [];
  for (const qq of queries) {
    const url = "https://api.scryfall.com/cards/search?order=edhrec&q=" + encodeURIComponent(`${qq} id<=${ci} ${d.format === "commander" ? "f:commander" : ""} -t:land`);
    const r = await fetch(url); if (!r.ok) continue; const j = await r.json();
    for (const x of (j.data || []).slice(0, 30)) {
      const faces = x.card_faces || [];
      cards.push({name: x.name, type: x.type_line || "", text: x.oracle_text || faces.map(y => y.oracle_text || "").join("\n\n"), cost: x.mana_cost || (faces[0] || {}).mana_cost || "", cmc: x.cmc || 0, colors: x.colors || (faces[0] || {}).colors || [], ci: x.color_identity || [], power: x.power || (faces[0] || {}).power || "", toughness: x.toughness || "", legal: x.legalities || {}, usd: x.prices && x.prices.usd, eur: x.prices && x.prices.eur, img: (x.image_uris || (faces[0] || {}).image_uris || {}).small || ""});
    }
    await sleep(120);   // Scryfall asks for a short pause between requests
  }
  return cards;
}
// Paired testing: the same shuffled games with the deck as it is and with the swap, so only the card differs
async function dcTestSwaps(d, swaps, onProgress){
  const G = 24, names = d.cards.filter(c => c.board === "main").flatMap(c => Array(c.qty || 1).fill(c.name));
  const shuffled = () => { const l = names.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
  const libsFor = cut => Array.from({length: G}, () => { const l = shuffled(), i = l.indexOf(cut); if (i >= 0) { l.splice(i, 1); l.splice(Math.floor(Math.random() * 10), 0, cut); } return l; });
  const seeded = (seed, fn) => { const keep = Math.random; let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; try { return fn(); } finally { Math.random = keep; } };
  const so = Object.assign({bracket: 3, speed: "strong", style: "balanced"}, prefs.simOpts || {}, {games: 3000, noGold: true});
  const play = async (dd, libs2) => {
    const {pool, cmds, plans, o} = await fwPlans(dd); const plans4 = plans.slice(0, 3); const turns = [];
    for (const lib of libs2) { let best = null; for (const pl of plans4) { const b = await fwSearchAsync(pl, pool, cmds, Object.assign({}, o, {lib, beam: 20, wide: 7, ms: 350, maxT: best ? best - 1 : 10})); if (b) best = b.won.t; } turns.push(best == null ? 12 : best); await sleep(0); }
    const S = seeded(12345, () => simulateDeck(dd, so));
    return {turn: turns.reduce((t, x) => t + x, 0) / turns.length, win: S.wins / S.games};
  };
  const steps = swaps.length * 2; let k = 0;
  const res = [];
  for (const sw of swaps) {
    const libs = libsFor(sw.cut);
    const base = await play(d, libs); if (onProgress) onProgress(++k, steps);
    const add = Object.assign({}, sw.add, {qty: 1, board: "main", sid: "test-" + sw.add.name});
    const cards = []; let done = false;
    for (const c of d.cards) { if (!done && c.board === "main" && c.name === sw.cut) { done = true; if ((c.qty || 1) > 1) cards.push(Object.assign({}, c, {qty: c.qty - 1})); continue; } cards.push(c); }
    cards.push(add);
    const dd = Object.assign({}, d, {cards});
    const libs2 = libs.map(l => { const i = l.indexOf(sw.cut); if (i < 0) return l; const m = l.slice(); m[i] = add.name; return m; });
    const r = await play(dd, libs2);
    const dT = r.turn - base.turn, dW = r.win - base.win;
    res.push({cut: sw.cut, add: add.name, src: sw.src, turnBefore: base.turn, turnAfter: r.turn, winBefore: base.win, winAfter: r.win, verdict: dT <= -0.3 || dW >= 0.02 ? (dT >= 0.3 || dW <= -0.02 ? "mixed" : "better") : dT >= 0.3 || dW <= -0.02 ? "worse" : "same"});
    if (onProgress) onProgress(++k, steps);
  }
  return {res, bracket: so.bracket, isCmd: d.format === "commander", speed: so.speed};
}
function dcUpgradesHtml(d){
  const A = dcAnalyze(d), cuts = dcCuts(d, A), adds = dcCandidates(d, A);
  const roleRows = Object.keys(DC_TARGETS.commander).map(r => { const n = A.count[r] || 0, T = A.T[r]; return `<tr><td>${DC_ROLES[r]}</td><td>${n}</td><td>${T}</td><td class="${n < T - 1 ? "bad" : ""}">${n < T ? `short by ${T - n}` : n > T + 2 ? "more than enough" : "good"}</td></tr>`; }).join("");
  const chips = a => a.roles.filter(r => DC_ROLES[r]).map(r => `<i class="fw-chip ${r === "theme" ? "trig" : r === "ramp" ? "mana" : r === "removal" || r === "wipe" ? "dmg" : r === "protect" ? "cost" : ""}">${DC_ROLES[r]}</i>`).join("");
  const partners = p => p.length ? `works with ${p.slice(0, 4).map(x => esc(x[0])).join(", ")}${p.length > 4 ? ` and ${p.length - 4} more` : ""}` : "works with nothing else here";
  const swaps = dcPairs(cuts, adds, A);
  const T = dcState.test && dcState.test.id === d.id ? dcState.test : null;
  const kept = [...A.keep];
  return `<h4 class="fw-h">Jobs in this deck</h4>
    <table class="dc-table"><thead><tr><th>Job</th><th>Cards</th><th>Usual</th><th></th></tr></thead><tbody>${roleRows}
      <tr><td>Theme (${esc(FW_TYPE || "none")})</td><td>${A.count.theme || 0}</td><td>—</td><td></td></tr><tr><td>Engines</td><td>${A.count.engine || 0}</td><td>—</td><td></td></tr><tr><td>Finishers</td><td>${A.count.finisher || 0}</td><td>—</td><td></td></tr><tr><td>Threats</td><td>${A.count.threat || 0}</td><td>—</td><td></td></tr></tbody></table>
    <p class="cur-sub">"Usual" is a common Commander guideline, not a rule. A card is never suggested as a cut while its job is at or below the usual amount, or while it's a combo piece, your commander, or kept by you.</p>
    <div class="dc-two"><div><h4 class="fw-h">Cards to think about cutting</h4>
      ${cuts.length ? `<ul class="dc-up">${cuts.map(x => `<li><div><b>${esc(x.a.name)}</b>${chips(x.a)}</div><div class="cur-sub">${esc(x.why.join(" · "))}</div><div class="cur-sub">${partners(x.a.partners)}</div><button class="btn sm" type="button" data-keep="${esc(x.a.name)}">Keep it</button></li>`).join("")}</ul>` : `<p class="cur-sub">Nothing stands out: every card has a job the deck needs or works with the rest.</p>`}
      ${kept.length ? `<p class="cur-sub">You're keeping: ${kept.map(n => `${esc(n)} <button class="linkbtn" type="button" data-unkeep="${esc(n)}">undo</button>`).join(", ")}</p>` : ""}
    </div><div><h4 class="fw-h">Upgrade options</h4>
      ${adds.length ? `<ul class="dc-up">${adds.map(x => `<li><div><b>${esc(x.info.name)}</b>${chips(x.info)} <span class="dc-src ${x.src}">${x.src === "own" ? "In your collection" : `Not owned${x.info.c.usd ? " · " + money(+x.info.c.usd, "usd") : ""}`}</span>${x.src !== "own" ? (wish.some(w => w.name === x.info.name) ? ` <span class="cur-sub">♥ on wishlist</span>` : ` <button class="btn sm" type="button" data-wishname="${esc(x.info.name)}">♡ Wishlist</button>`) : ""}</div><div class="cur-sub">${x.fills.length ? `fills: ${x.fills.map(r => `${DC_ROLES[r]} (you have ${A.count[r] || 0} of ${A.T[r]})`).join(", ")}` : "fits your theme"}</div><div class="cur-sub">${partners(x.partners)}</div></li>`).join("")}</ul>` : `<p class="cur-sub">Nothing found in your collection.</p>`}
      <button class="btn" type="button" id="dcScry" ${dcState.scryBusy ? "disabled" : ""}>${dcState.scryBusy ? "Searching Scryfall…" : dcState.scry && dcState.scry.id === d.id ? "Searched all cards ✓" : "Also search all cards (Scryfall)"}</button>
    </div></div>
    <h4 class="fw-h">Test swaps</h4>
    ${swaps.length ? `<p class="cur-sub">Plays the same games with your deck and with each swap, so only the card differs: once with no interaction (how fast you win) and once against a ${d.format === "commander" ? `bracket ${(prefs.simOpts || {}).bracket || 3}` : "typical"} opponent from Test this deck (how often you win). Takes a minute or two.</p>
      <ul class="dc-list">${swaps.map(s => `<li>Cut <b>${esc(s.cut)}</b> → add <b>${esc(s.add.name)}</b></li>`).join("")}</ul>
      <button class="btn primary" type="button" id="dcTest" ${dcState.testBusy ? "disabled" : ""}>${dcState.testBusy ? `Testing… ${dcState.testDone || 0}/${dcState.testTotal || "?"}` : "Test these swaps"}</button>` : `<p class="cur-sub">No swaps to test yet.</p>`}
    ${T ? `<table class="dc-table"><thead><tr><th>Swap</th><th>Win turn when you draw it</th><th>Wins vs ${T.isCmd ? "bracket " + T.bracket : "opponent"}</th><th>Result</th></tr></thead><tbody>${T.res.map(r => `<tr><td>${esc(r.cut)} → ${esc(r.add)}</td><td>${r.turnBefore.toFixed(1)} → ${r.turnAfter.toFixed(1)}</td><td>${Math.round(r.winBefore * 100)}% → ${Math.round(r.winAfter * 100)}%</td><td class="dc-v ${r.verdict}">${{better: "Better", worse: "Worse", same: "No clear change", mixed: "Mixed"}[r.verdict]}</td></tr>`).join("")}</tbody></table>
      <p class="cur-sub">Win turn: 24 shuffled games where the card is in your first 10 cards, so the test measures the card itself (no win by turn 10 counts as 12). Wins: 3,000 games against the simulator's opponent, played with the same dice for both decks so only the card makes a difference. "Better" needs at least 0.3 turns faster or 2% more wins. One card in a big deck usually moves things only a little.</p>` : ""}`;
}
// pair each upgrade with the cut that best makes room (same job if that job is over-full, otherwise the weakest card)
function dcPairs(cuts, adds, A){
  const used = new Set(), out = [];
  for (const x of adds.slice(0, 6)) {
    const same = cuts.find(c => !used.has(c.a.name) && c.a.roles.some(r => x.info.roles.includes(r)));
    const pick = same || cuts.find(c => !used.has(c.a.name));
    if (!pick) break;
    used.add(pick.a.name); out.push({cut: pick.a.name, add: x.info.c, src: x.src});
    if (out.length >= 5) break;
  }
  return out;
}

async function renderDeckCheck(){
  const box = $("deckCheck"); const d = prefs.deckView && deckById(prefs.deckView);
  if (!box) return;
  if (!d || !(d.cards.length + d.commanders.length)) { box.innerHTML = ""; return; }
  const tab = prefs.dcTab || "mana", pct = x => Math.round(x * 100) + "%";
  const tabs = [["mana", "Mana base"], ["bracket", "Bracket"], ["price", "Price"], ["cuts", "Upgrades"]];
  let body = "";
  try {
    if (tab === "mana") {
      const m = dcMana(d);
      body = `<div class="dc-stats"><div><b>${m.lands}</b><span>lands (about ${m.wantLands} usual)</span></div><div><b>${m.rocks}</b><span>mana rocks & creatures</span></div><div><b>${m.tapped}</b><span>enter tapped</span></div><div><b>${m.avg.toFixed(2)}</b><span>average mana value</span></div></div>
        <table class="dc-table"><thead><tr><th>Colour</th><th>Spells needing it</th><th>Symbols</th><th>Sources</th><th>Have one by turn 2</th><th>By turn 3</th></tr></thead><tbody>
        ${m.rows.map(r => `<tr><td><span class="dc-pip" style="background:var(--pip-${r.k.toLowerCase()})"></span>${r.name}</td><td>${r.cards}</td><td>${r.pips}</td><td>${Math.round(r.sources)}</td><td class="${r.t2 < 0.75 ? "bad" : ""}">${pct(r.t2)}</td><td class="${r.t3 < 0.85 ? "bad" : ""}">${pct(r.t3)}</td></tr>`).join("")}</tbody></table>
        ${m.hung.length ? `<h4 class="fw-h">Hardest to cast on time</h4><ul class="dc-list">${m.hung.map(h => `<li><b>${esc(h.name)}</b> needs ${h.n} ${h.k === "U" ? "blue" : ({W: "white", B: "black", R: "red", G: "green"})[h.k]} by turn ${Math.max(1, Math.round(h.cmc))}: <span class="${h.p < 0.6 ? "bad" : ""}">${pct(h.p)}</span></li>`).join("")}</ul>` : ""}
        <h4 class="fw-h">Suggestions</h4><ul class="dc-list">${m.tips.length ? m.tips.map(x => `<li>${esc(x)}</li>`).join("") : "<li>The mana base looks healthy for these colours.</li>"}</ul>
        <p class="cur-sub">Sources: lands, mana rocks and mana creatures that make the colour (mana that only pays for some spells counts as half). Percentages are the chance of having at least one in your opening hand plus draws.</p>`;
    } else if (tab === "bracket") {
      if (!dcState.br || dcState.brId !== d.id + ":" + d.cards.length) { box.innerHTML = dcShell(tabs, tab, `<p class="cur-sub">Checking…</p>`); dcState.br = await dcBracket(d); dcState.brId = d.id + ":" + d.cards.length; }
      const B = dcState.br;
      body = `<div class="dc-stats"><div><b>Bracket ${B.b}${B.b === 2 ? " or 1" : ""}</b><span>${["", "Exhibition", "Core", "Upgraded", "Optimized", "cEDH"][B.b]}${B.b >= 4 ? " (5 if built for cEDH)" : ""}</span></div></div>
        <ul class="dc-list">${B.why.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        ${[["Game Changers", B.gcs], ["Mass land destruction", B.mld], ["Extra turns", B.turns], ["Tutors", B.tutors]].filter(([, l]) => l.length).map(([h, l]) => `<h4 class="fw-h">${h} (${l.length})</h4><div class="dc-chips">${l.map(c => `<i class="fw-chip">${esc(c.name)}</i>`).join("")}</div>`).join("")}
        ${B.twoCard.length ? `<h4 class="fw-h">Two-card combos (${B.twoCard.length})</h4><ul class="dc-list">${B.twoCard.slice(0, 8).map(v => `<li>${esc(v.cards.join(" + "))}</li>`).join("")}</ul>` : ""}
        <p class="cur-sub">Based on the Commander Brackets rules: Game Changers, mass land destruction, chained extra turns and two-card combos. ${B.live ? "Game Changers list from Scryfall." : "Couldn't reach Scryfall, so a built-in Game Changers list was used; it may be out of date."} Bracket 1 vs 2 depends on the deck's theme, which can't be read from the cards.</p>`;
    } else if (tab === "price") {
      const P = dcPrice(d);
      body = `<div class="dc-stats"><div><b>${money(P.total)}</b><span>whole deck</span></div><div><b>${money(P.missing)}</b><span>cards you don't own yet</span></div></div>
        <h4 class="fw-h">Most expensive</h4><table class="dc-table"><thead><tr><th>Card</th><th>Each</th><th>You own</th></tr></thead><tbody>${P.rows.slice(0, 15).map(r => `<tr><td>${esc(r.name)}${r.q > 1 ? ` ×${r.q}` : ""}</td><td>${r.p ? money(r.p) : "—"}</td><td>${r.own >= r.q ? "✓" : r.own ? r.own + " of " + r.q : "—"}</td></tr>`).join("")}</tbody></table>
        ${P.rows.some(r => r.miss) ? `<h4 class="fw-h">Still to get</h4><ul class="dc-list">${P.rows.filter(r => r.miss).slice(0, 20).map(r => `<li>${esc(r.name)}${r.miss > 1 ? ` ×${r.miss}` : ""} <span class="cur-sub">${r.p ? money(r.p * r.miss) : "no price"}</span></li>`).join("")}</ul>` : ""}
        <h4 class="fw-h">Cheaper swaps from your collection</h4>${P.swaps.length ? `<ul class="dc-list">${P.swaps.map(s => `<li><b>${esc(s.to)}</b> for <b>${esc(s.from)}</b> <span class="cur-sub">same job (${s.job}), saves about ${money(s.save)}</span></li>`).join("")}</ul>` : `<p class="cur-sub">None found: nothing in your collection does the same job for less.</p>`}
        <p class="cur-sub">Prices from Scryfall as of the last refresh (Collection → Refresh prices).</p>`;
    } else {
      body = dcUpgradesHtml(d);
    }
  } catch (e) { console.warn("deck check", e); body = `<p class="cur-sub">Couldn't check this deck.</p>`; }
  box.innerHTML = dcShell(tabs, tab, body);
}
function dcShell(tabs, tab, body){
  return `<div class="sim-head"><h3>Deck check</h3><span class="cur-sub">Mana base, Commander bracket, price, and what to cut or add.</span></div>
    <div class="combo-tabs">${tabs.map(([k, l]) => `<button type="button" class="ctab" aria-pressed="${k === tab}" data-dctab="${k}">${l}</button>`).join("")}</div>${body}`;
}
$("deckCheck").addEventListener("click", async e => {
  const d = prefs.deckView && deckById(prefs.deckView); if (!d) return;
  const b = e.target.closest("[data-dctab]"); if (b) { prefs.dcTab = b.dataset.dctab; savePrefs(); return renderDeckCheck(); }
  const wn = e.target.closest("[data-wishname]"); if (wn) { await addWishByName(wn.dataset.wishname); return renderDeckCheck(); }
  const k = e.target.closest("[data-keep]"); if (k) { d.keep = [...new Set((d.keep || []).concat(k.dataset.keep))]; saveDecks(); return renderDeckCheck(); }
  const u = e.target.closest("[data-unkeep]"); if (u) { d.keep = (d.keep || []).filter(n => n !== u.dataset.unkeep); saveDecks(); return renderDeckCheck(); }
  if (e.target.closest("#dcScry")) {
    dcState.scryBusy = true; renderDeckCheck();
    try { const cards = await dcSearchScryfall(d, dcAnalyze(d)); dcState.scry = {id: d.id, cards}; if (!cards.length) toast("Couldn't reach Scryfall."); } catch (err) { console.warn(err); toast("Couldn't reach Scryfall."); }
    dcState.scryBusy = false; return renderDeckCheck();
  }
  if (e.target.closest("#dcTest")) {
    const A = dcAnalyze(d), swaps = dcPairs(dcCuts(d, A), dcCandidates(d, A), A); if (!swaps.length) return;
    dcState.testBusy = true; dcState.testDone = 0; dcState.testTotal = swaps.length * 2; renderDeckCheck();
    try { const T = await dcTestSwaps(d, swaps, (i, n) => { dcState.testDone = i; dcState.testTotal = n; const btn = $("dcTest"); if (btn) btn.textContent = `Testing… ${i}/${n}`; }); dcState.test = Object.assign(T, {id: d.id}); }
    catch (err) { console.warn(err); toast("Couldn't finish the test."); }
    dcState.testBusy = false; return renderDeckCheck();
  }
});

