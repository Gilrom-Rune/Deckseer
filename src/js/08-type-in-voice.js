/* ---------------- type-in lookup ---------------- */
let suggItems = [], suggOn = 0;
function suggest(q){
  const s = norm(q);
  if (!ready || s.length < 2 || /^[a-z0-9]{2,6}\s*[ #/]\s*\d/i.test(q.trim())) return [];
  const starts = [], has = [], seen = new Set();
  for (const [k, full] of NAMES) {
    if (seen.has(full)) continue;
    if (k.startsWith(s)) { starts.push(full); seen.add(full); }
    else if (has.length < 30 && k.includes(s)) { has.push(full); seen.add(full); }
    if (starts.length >= 10) break;
  }
  if (starts.length + has.length < 3) for (const m of matchName(q)) if (m.score > 0.5 && !seen.has(m.name)) { has.push(m.name); seen.add(m.name); }
  return starts.sort((a, b) => a.length - b.length).concat(has).slice(0, 10);
}
function renderSugg(){
  const ul = $("sugg");
  ul.classList.toggle("hide", !suggItems.length);
  ul.innerHTML = suggItems.map((n, i) => `<li role="option" data-i="${i}" class="${i === suggOn ? "on" : ""}" aria-selected="${i === suggOn}">${esc(n)}</li>`).join("");
}
$("find").addEventListener("input", e => { suggItems = suggest(e.target.value); suggOn = 0; renderSugg(); });
$("find").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!suggItems.length) return; e.preventDefault(); suggOn = (suggOn + (e.key === "ArrowDown" ? 1 : -1) + suggItems.length) % suggItems.length; renderSugg(); }
  else if (e.key === "Enter") { e.preventDefault(); lookup(suggItems[suggOn] || e.target.value); }
  else if (e.key === "Escape") { suggItems = []; renderSugg(); }
});
$("find").addEventListener("blur", () => setTimeout(() => { suggItems = []; renderSugg(); }, 150));
$("sugg").addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); lookup(suggItems[+li.dataset.i]); } });

async function lookup(text){
  text = String(text || "").trim(); if (!text || !ready) return;
  suggItems = []; renderSugg();
  setStatus("Looking it up…", "", true);
  try {
    const sn = text.match(/^([a-z0-9]{2,6})\s*[ #/]\s*0*([0-9]+[a-z★†]*)$/i);
    if (sn) {
      const card = await getBySetNumber(sn[1], sn[2]);
      if (!card) { setStatus(`Scryfall has no card ${sn[1].toUpperCase()} #${sn[2]}. Check the set code and number.`, "err"); return; }
      let prints = await getPrints(card.name);
      let i = prints.findIndex(p => p.id === card.id);
      if (i < 0) { prints = [card].concat(prints); i = 0; }
      current = {name: card.name, alts: [], prints, sel: i, why: `${card.set} #${card.number}, as you typed it`, foil: prefs.foil, qty: 1, info: {set: "", number: ""}, added: false, shot: lastShot && lastShot.shot};
    } else {
      const name = NAMES.some(([, full]) => full === text) ? text : (matchName(text)[0] || {}).name;
      if (!name) { setStatus(`No card named “${text}”.`, "err"); return; }
      const prints = await getPrints(name);
      if (!prints.length) { setStatus(`Scryfall has no paper printings of ${name}.`, "err"); return; }
      const pick = await pickPrinting(prints, {set: "", number: ""}, lastShot && lastShot.wins, lastShot && lastShot.ai);
      current = {name, alts: [], prints, sel: pick.index, why: pick.sure ? pick.why : "Click your printing below — check it", foil: prefs.foil, qty: 1, info: {set: "", number: ""}, added: false, wins: lastShot && lastShot.wins, shot: lastShot && lastShot.shot, rectified: lastShot && lastShot.rectified};
    }
    fixFoil(); renderCurrent();
    $("find").value = "";
    setStatus("Press Enter to add it, or click a different printing first.", "");
    $("find").blur();
  } catch (e) { setStatus("Couldn't reach Scryfall. Check your internet connection.", "err"); }
}

/* ---------------- voice: say a card and Deckseer finds it ----------------
   Uses the browser's own speech recognition (Chrome and Edge). The browser turns speech into text;
   Deckseer only receives the text and matches it against every card name. */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, voiceSugg = [], voiceBusy = false;
const NUM_WORDS = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30};
const ORDINALS = {one: 0, first: 0, "1": 0, two: 1, second: 1, "2": 1, to: 1, too: 1, three: 2, third: 2, "3": 2};
// "four lightning bolt foil" → {qty: 4, name: "lightning bolt", foil: true}; also tries the phrase without a quantity
function parseSpoken(t){
  let s = " " + String(t).toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ") + " ";
  const foil = /\b(foil|foiled|shiny)\b/.test(s); s = s.replace(/\b(foil|foiled|shiny)\b/g, " ");
  s = s.replace(/\b(please|add|and add|copies of|copy of|copies|of the card)\b/g, " ").replace(/\s+/g, " ").trim();
  const full = s; let qty = 1, name = s;
  let m = s.match(/^(\d{1,2})\s*x?\s+(.+)$/) || s.match(/^(.+?)\s+x\s*(\d{1,2})$/);
  if (m) { const a = /^\d/.test(m[1]); qty = +(a ? m[1] : m[2]); name = a ? m[2] : m[1]; }
  else { m = s.match(/^([a-z]+)\s+(.+)$/); if (m && NUM_WORDS[m[1]] && !/^(a|an)$/.test(m[1]) ) { qty = NUM_WORDS[m[1]]; name = m[2]; } }
  return {qty: Math.max(1, Math.min(99, qty)), name, full, foil};
}
function voiceStatus(heard, interim){
  const el = $("voiceHeard"); el.hidden = !heard && !listening;
  el.innerHTML = listening && !heard ? `<span class="rec-dot"></span> Listening… say a card name${$("voiceKeep").checked ? " (say “stop” to finish)" : ""}` : heard ? `${listening ? '<span class="rec-dot"></span> ' : ""}Heard: <b>${esc(heard)}</b>${interim ? "…" : ""}` : "";
}
function setVoiceUI(on){
  listening = on; $("micBtn").setAttribute("aria-pressed", on); $("micBtn").classList.toggle("on", on);
  $("micBtn").title = on ? "Stop listening" : "Say a card name (M)"; voiceStatus("");
}
function startVoice(){
  if (!SpeechRec) { toast("Voice needs Chrome or Edge on a computer with a microphone."); return; }
  if (listening) return stopVoice();
  rec = new SpeechRec(); rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = $("voiceKeep").checked;
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r.isFinal) { voiceStatus(r[0].transcript, true); continue; }
      const alts = []; for (let k = 0; k < r.length; k++) alts.push(r[k].transcript);
      voiceStatus(alts[0]); handleSpeech(alts);
    }
  };
  rec.onerror = e => {
    const msg = {"not-allowed": "Microphone access was blocked. Click the mic icon in the address bar and allow it.", "service-not-allowed": "Microphone access was blocked. Click the mic icon in the address bar and allow it.",
      "network": "Voice needs an internet connection: your browser turns speech into text online.", "audio-capture": "No microphone found. Plug one in or check your sound settings.", "no-speech": ""}[e.error];
    if (msg) { setStatus(msg, "err"); stopVoice(); }
  };
  rec.onend = () => { if (listening && $("voiceKeep").checked) { try { rec.start(); return; } catch (err) {} } setVoiceUI(false); };
  try { rec.start(); setVoiceUI(true); } catch (err) { toast("Couldn't start the microphone. Try again."); }
}
function stopVoice(){ listening = false; try { rec && rec.stop(); } catch (e) {} setVoiceUI(false); }
async function handleSpeech(alts){
  const said = alts.map(a => a.toLowerCase().trim().replace(/[.!?]/g, ""));
  const any = re => said.some(a => re.test(a));
  // commands
  if (any(/^(stop|stop listening|that's all|done)$/)) { stopVoice(); setStatus("Stopped listening.", ""); return; }
  if (any(/^(undo|oops|take that back|remove that|remove it)$/)) { undo(); return; }
  if (voiceSugg.length) { for (const a of said) if (a in ORDINALS && voiceSugg[ORDINALS[a]]) { const pick = voiceSugg[ORDINALS[a]]; voiceSugg = []; renderVoiceSugg(); return voiceFind(pick.name, pick.qty, pick.foil, said[0], true); } }
  if (current && !current.added && any(/^(add|add it|yes|yeah|confirm|that's it|correct)$/)) { addCurrent(false); return; }
  if (current && any(/^(foil|make it foil)$/)) { current.foil = true; fixFoil(); renderCurrent(); return; }
  if (current && current.added && any(/^(again|another|one more|another one)$/)) { addAnother(); return; }
  if (!ready) { setStatus("Still loading the card list. Try again in a moment.", ""); return; }
  // card names: try every alternative, with and without a leading quantity, keep the best match
  let best = null; const pool = new Map();
  for (const a of alts) {
    const p = parseSpoken(a);
    for (const [text, qty] of [[p.name, p.qty], [p.full, 1]]) {
      if (!text || text.length < 2) continue;
      const ms = matchName(text);
      ms.forEach(m => { const ex = pool.get(m.name); if (!ex || ex.score < m.score) pool.set(m.name, {name: m.name, score: m.score, qty, foil: p.foil}); });
      if (ms[0] && (!best || ms[0].score > best.score)) best = {name: ms[0].name, score: ms[0].score, qty, foil: p.foil};
    }
  }
  const ranked = [...pool.values()].sort((x, y) => y.score - x.score);
  const second = ranked.find(r => r.name !== (best && best.name));
  if (best && best.score >= 0.82 && (!second || second.score < best.score - 0.06)) { voiceSugg = []; renderVoiceSugg(); return voiceFind(best.name, best.qty, best.foil, alts[0], $("voiceKeep").checked); }
  if (ranked.length && ranked[0].score >= 0.5) {
    voiceSugg = ranked.slice(0, 3); renderVoiceSugg();
    sound("check"); setStatus(`Not sure which card you said. Say “one”, “two” or “three”, or click one.`, "");
    return;
  }
  sound("check"); setStatus(`Didn't catch a card name in “${alts[0]}”. Try again, a little slower.`, "err");
}
function renderVoiceSugg(){
  const el = $("voiceSugg"); el.hidden = !voiceSugg.length;
  el.innerHTML = voiceSugg.map((s, i) => `<button type="button" class="vsugg" data-vs="${i}"><span class="vnum">${i + 1}</span>${s.qty > 1 ? s.qty + "× " : ""}${esc(s.name)}${s.foil ? " ★" : ""}</button>`).join("");
}
$("voiceSugg").addEventListener("click", e => { const b = e.target.closest("[data-vs]"); if (!b) return; const s = voiceSugg[+b.dataset.vs]; voiceSugg = []; renderVoiceSugg(); voiceFind(s.name, s.qty, s.foil, s.name, $("voiceKeep").checked); });
async function voiceFind(name, qty, foil, heard, autoAdd){
  if (voiceBusy) return; voiceBusy = true;
  setStatus(`Looking up ${name}…`, "", true);
  try {
    const prints = await getPrints(name);
    if (!prints.length) { setStatus(`Scryfall has no paper printings of ${name}.`, "err"); return; }
    const pick = await pickPrinting(prints, {set: "", number: ""}, null);   // no photo to compare: Set lock or newest printing
    await present({name, prints, sel: pick.index, qty, foil: foil || prefs.foil, why: `Heard “${heard}”. ${pick.sure ? pick.why : "Pick your printing below if it's a different one."}`, info: {set: "", number: ""}, alts: [],
      diag: []}, false);
    if (autoAdd && current && !current.added) addCurrent(true);   // hands-free: add right away (fix the printing later with ✎ if needed)
    if (!autoAdd) setStatus(`Found ${name}. Say “add” or press Enter to add it${prints.length > 1 ? ", or pick your printing first" : ""}.`, "ok");
  } catch (e) { setStatus("Couldn't reach Scryfall. Check your internet connection.", "err"); }
  finally { voiceBusy = false; }
}
$("micBtn").onclick = startVoice;
$("voiceKeep").checked = !!prefs.voiceKeep;
$("voiceKeep").onchange = e => { prefs.voiceKeep = e.target.checked; savePrefs(); if (listening) { stopVoice(); startVoice(); } };
if (!SpeechRec) { $("micBtn").disabled = true; $("micBtn").title = "Voice needs Chrome or Edge"; $("voiceKeepWrap").hidden = true; }

