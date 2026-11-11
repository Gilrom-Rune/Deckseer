/* ---------------- boot ---------------- */
/* ---------------- the step-by-step guide ----------------
   Chapters of short steps. "Show me" goes to the right page and tab, opens the right settings, and makes the
   button or option glow. Where you stopped is remembered (prefs.guide). */
const GUIDE = [
  {t: "Getting started", steps: [
    {h: "Welcome to Deckseer", b: "Deckseer scans your Magic cards with a webcam, keeps your collection, builds and tests decks, finds combos, and tracks your games. This guide walks through everything, one step at a time. Press <b>Show me</b> on a step and Deckseer jumps to that spot and makes it glow. You can keep using the app while the guide is open."},
    {h: "Install it as an app", b: "Open Deckseer from its website (<b>gilrom-rune.github.io/Deckseer</b>) in Chrome or Edge and click <b>Install app</b>, or the install icon in the address bar. It gets its own window and an icon in the Start menu, works without internet, and <b>updates itself</b>. The Install button appears only on the website, when the browser offers it.", go: {page: "collection", ctab: "cards", el: "installApp"}},
    {h: "On a phone or tablet", b: "Deckseer works on phones too. <b>Android:</b> open the website in Chrome, then <b>⋮ → Install app</b>. <b>iPhone/iPad:</b> open it in Safari, then <b>Share → Add to Home Screen</b>. On a phone the pages are in the bar at the bottom. Each device keeps its own cards: move them with Backup and Restore."},
    {h: "Bring your cards across", b: "Coming from an older copy (Cardsight, or the downloaded file)? In the old copy click <b>Backup</b>. In this one click <b>Restore</b> and pick that file. Your collection, decks, wishlist, games and what the scanner has learned all come across.", go: {page: "collection", ctab: "cards", el: "restoreLbl"}},
    {h: "Back up now and then", b: "Everything you own is saved in this browser on this computer, and nowhere else. Click <b>Backup</b> every so often and keep the file somewhere safe (a USB stick, OneDrive, Google Drive). If the browser's data is ever cleared, <b>Restore</b> brings it all back.", go: {page: "collection", ctab: "cards", el: "backup"}}
  ]},
  {t: "Scanning cards", steps: [
    {h: "Turn on the webcam", b: "On the <b>Scanner</b> page click <b>Turn on webcam</b> and allow camera access. Any webcam works; a sharper one reads small text better.", go: {page: "scanner", el: "startCam"}},
    {h: "Hold a card up", b: "Hold the card flat against a plain background, filling most of the frame. When Deckseer finds it, a <b>green outline</b> appears. With <b>Auto-scan</b> on, it reads the card by itself and beeps when it's added. Otherwise press <b>Scan now</b> (or Space).", go: {page: "scanner", el: "optAuto"}},
    {h: "Scanning with a phone", b: "A phone uses its <b>back camera</b> (switch it in the Camera list). If it has a flashlight, a <b>🔦 Flashlight</b> button appears: tilt the card slightly if the light glares on it. The phone gives a short buzz when a card is added. Scanning is slower than on a PC, so good light helps a lot.", go: {page: "scanner", el: "startCam"}},
    {h: "Light", b: "Even light with no glare works best. In a dim room <b>Low light</b> (Auto, in <b>⚙ Settings → Scanning</b>) brightens the camera and averages a few frames. <b>Screen light</b> turns your screen into a soft white lamp.", go: {page: "scanner", el: "screenLight"}},
    {h: "⚙ Settings", b: "Everything you can switch on or off is in <b>⚙ Settings</b> (the cog at the top): <b>Scanning</b> (add automatically, also add to my collection, low light, prices), <b>Sounds</b> (the ka-ching and its price, or your own sound), <b>Look</b> (magical glow, lively background), and how cards are recognised (learning, Picture library, AI, Ask Claude).", go: {page: "scanner", el: "optAdd"}},
    {h: "Cards in sleeves", b: "Tick <b>Sleeved cards</b>. Deckseer then finds the card inside the sleeve and removes the plastic's glare by combining several frames.", go: {page: "scanner", el: "optSleeve"}},
    {h: "Going through one set? Use Set lock", b: "Type the set's code (like <b>MH3</b> or <b>HOC</b>) in <b>Set lock</b>. Scans get faster, it picks the right printing, and it can recognise cards by picture alone within that set.", go: {page: "scanner", el: "optSet"}},
    {h: "Check, fix and add", b: "When Deckseer is sure, it adds the card straight away. When it isn't, it shows <b>your photo next to its best match</b>. Pick the right printing, or the right card under <b>Not it?</b>, then press <b>Enter</b> to add. Foil? Tick foil before adding.", go: {page: "scanner", el: "sessView"}},
    {h: "When a card won't scan", b: "Type its name, or its set and number like <b>HOC 96</b>, in the box under the camera. The 🎤 button lets you say the name instead.", go: {page: "scanner", el: "find"}},
    {h: "Sorting into lists", b: "Cards go into a list such as <b>Collection</b>. Make more with <b>New list</b> (a trade binder, a box) and choose which one you're scanning into.", go: {page: "scanner", el: "newListBtn"}}
  ]},
  {t: "Make the scanner smarter (AI and Picture library)", steps: [
    {h: "How Deckseer recognises a card", b: "First it <b>reads the name</b> (two text readers, both ends of the card in case it's upside down). Then it <b>compares the picture</b> to confirm the name and choose the printing. When the name can't be read (foreign cards, foil glare, odd fonts), the picture tools below take over. You don't need them, but each one makes scanning more reliable."},
    {h: "AI picture recognition: what it is", b: "A small AI image model that has seen a picture of <b>every card face</b> (about 100,000). It recognises a card from its picture alone, even blurry or with glare, and picks the printing without downloading anything. It runs on your computer, with no internet needed once loaded. The model and its index (about 50 MB) are made once with the free <b>Stage 2 notebook</b> on Google Colab: the <b>⬇ Downloads</b> button at the top has a link that opens it, with the steps."},
    {h: "AI picture recognition: turn it on", b: "Click <b>⚙ Settings</b> at the top, open <b>AI picture recognition</b> and click <b>Load files</b>. Pick all three files together (hold Ctrl): <b>…-embed.onnx</b>, <b>…-index.bin</b> and <b>…-index.json</b>. After a few seconds it says <b>Ready: 102,926 card pictures</b>. Deckseer keeps its own copy, so you only do this once per computer. If the files are put next to Deckseer on the website, it finds them by itself.", go: {page: "scanner", el: "aiPicBox", open: true}},
    {h: "AI picture recognition: what you'll see", b: "When the name couldn't be read, the AI's best guess appears with its other close guesses under <b>Not it?</b>. A card found only by picture <b>always waits for your OK</b>. When it agrees with the text reader, the name counts as confirmed. And it chooses the printing by comparing every printing at once.", go: {page: "scanner", el: "aiPicBox", open: true}},
    {h: "Picture library", b: "The older, simpler picture matcher: Deckseer downloads a small picture of every card's artwork from Scryfall once and keeps a fingerprint of each (about 40 MB). Choose <b>Cards from 2015 on</b> (quicker) or <b>Every card</b>, then <b>Build picture library</b>. It takes 15–60 minutes; you can keep scanning, pause, or close the page and carry on later.", go: {page: "scanner", el: "libBox", open: true}},
    {h: "AI or Picture library?", b: "Use the <b>AI</b> if you have its files: it covers every card and is more accurate. The Picture library is a good fallback if you don't, and having both does no harm, because the scanner tries the AI first. Neither is in your backup, because both can be loaded or built again."},
    {h: "Learning from your scans", b: "Every card you confirm teaches Deckseer how it looks <b>through your webcam, in your light</b>: up to 3 looks per printing, kept on this computer. Scan the same card again and it's recognised straight away, even if the name can't be read. This is automatic. <b>Forget all</b> clears it.", go: {page: "scanner", el: "memBox", open: true}},
    {h: "Ask Claude about hard cards (optional)", b: "For the really stubborn ones: add an Anthropic API key here, then press <b>C</b> on a card it couldn't identify, and Claude looks at your photo. This costs a tiny amount per question on your Anthropic account. The key stays in this browser.", go: {page: "scanner", el: "aiBox", open: true}}
  ]},
  {t: "Your collection", steps: [
    {h: "The collection page", b: "Everything you've scanned, with prices. Search by name, type or set, filter by list, rarity and colour, and sort. Click a card for the <b>big viewer</b>; use ✎ to change the printing, condition or foil.", go: {page: "collection", ctab: "cards", el: "q"}},
    {h: "Find combos", b: "Shows combos you can already build from the cards shown, using Commander Spellbook's database (downloaded once, about 30 MB).", go: {page: "collection", ctab: "cards", el: "collComboBtn"}},
    {h: "Wishlist and price alerts", b: "Add cards you want, from Card search or a deck, with a target price. Deckseer checks prices once a day and tells you when one drops to your target.", go: {page: "collection", ctab: "wish", el: "wishView"}},
    {h: "Export", b: "Send your collection or this session to Moxfield, Archidekt, ManaBox, TCGplayer or a spreadsheet: pick the format, then <b>Export</b>.", go: {page: "collection", ctab: "cards", el: "expBar"}}
  ]},
  {t: "Building decks", steps: [
    {h: "Make a deck", b: "On <b>Deck builder</b> click <b>New deck</b>, name it and pick the format, or <b>Import a deck list</b> pasted from Moxfield, Archidekt or anywhere. For Commander, add your commander first.", go: {page: "builder", el: "deckNewBtn"}},
    {h: "Add cards", b: "<b>Scan cards into this deck</b> uses the webcam, and can add them to your collection too. Or click <b>＋ Add cards</b> to type card names (with how many, and main deck, sideboard or commander) or paste a whole list. The window stays open so you can add one card after another. You can also use <b>Replace</b> in the Cards tab, or send cards here from Card search.", go: {page: "builder", dtab: "cards", el: "deckScan", needDeck: true}},
    {h: "Rename a deck, or put it in your collection", b: "Click the deck's name (or <b>✎ Rename</b>) to change it at any time. <b>＋ Add to collection</b> shows how many of the deck's cards aren't in your collection and adds them, for imported decks or ones scanned without <b>Also add scanned cards to my collection</b>. Cards you already own aren't added twice, unless you choose <b>Add all, even ones I already own</b> (for a deck with its own copies).", go: {page: "builder", dtab: "cards", el: "deckColl", needDeck: true}},
    {h: "Deck check", b: "Four checks: <b>Mana base</b> (your odds of having the right colours), <b>Bracket</b> (Commander power level and Game Changers), <b>Price</b>, and <b>Upgrades</b>, which suggests cuts and better cards and can test each swap over thousands of games.", go: {page: "builder", dtab: "check", el: "deckCheck", needDeck: true}},
    {h: "Combos and export", b: "<b>Combos</b> lists every combo in the deck and the ones you're one or two cards away from. <b>Export</b> sends the deck to Moxfield, Archidekt and others.", go: {page: "builder", dtab: "combos", el: "deckCombos", needDeck: true}}
  ]},
  {t: "Testing a deck", steps: [
    {h: "Run 3,000 games", b: "In <b>Test & fastest win</b>, Deckseer plays your deck 3,000 times against an opponent, using your cards' real rules: colours, triggers, evoke and copies (like Ashling's), sacrifice outlets, combat with blockers and keywords, commander damage, tutors, Treasures and more. You get your win rate, the turn you usually win, mulligans, mana problems and suggestions.", go: {page: "builder", dtab: "test", el: "simRun", needDeck: true}},
    {h: "Choose your opponent", b: "Pick a <b>bracket</b> (1–5) and a style (Aggressive, Balanced, Defensive). Or <b>Your table</b>, which tunes the opponent to your own logged games with this deck (5 or more). Or <b>one of your decks</b>: enter your friends' decks and test against them.", go: {page: "builder", dtab: "test", el: "deckSim", needDeck: true}},
    {h: "Fastest possible win", b: "Finds the quickest way the deck can win if you drew perfectly, by combo or by damage, turn by turn, showing which lands to tap. <b>What would make it faster</b> shows what's holding the deck back, and <b>How the finder reads each card</b> lists how every card was understood.", go: {page: "builder", dtab: "test", el: "fwRun", needDeck: true}},
    {h: "Playtest", b: "<b>▶ Playtest</b> deals you a hand on a virtual table with a rules engine: draw, play lands, cast spells, attack, and see triggers resolve. Good for practising lines before a game.", go: {page: "builder", el: "deckPlay", needDeck: true}},
    {h: "Playtest: paying mana", b: "Click a card in your hand and Deckseer pays for it: mana in your pool first, then the lands, rocks and mana creatures that keep the most options open, plus commander tax. Cards you can afford right now <b>glow gold</b>. Rituals and Treasures go into your <b>mana pool</b> at the top. If you can't pay, it tells you what's missing and lets you cast it anyway. Dragging a card onto the table places it without paying.", go: {page: "builder", el: "deckPlay", needDeck: true}},
    {h: "Playtest: opponents and blocks", b: "The strip under the top bar shows your opponents (3 in Commander). Click one to aim at them; give them blockers with <b>+ Creature</b>, or use their <b>⋯</b> menu to let their board grow each turn. When you <b>Attack</b>, choose who each creature attacks; they block like a careful player and you can change the blocks. First strike, trample, deathtouch, flying, menace, lifelink and commander damage all count, and you win when every opponent is out.", go: {page: "builder", el: "deckPlay", needDeck: true}}
  ]},
  {t: "Card search", steps: [
    {h: "Search all of Magic", b: "Search every card with Scryfall's search. Type a name, or search like Scryfall does (for example <b>t:elemental c:rg</b>). Send any result to your collection, a deck or your wishlist.", go: {page: "search", el: "searchView"}}
  ]},
  {t: "Game tracker", steps: [
    {h: "Track a game", b: "On <b>Game</b>, choose 2–6 players, their life and their decks, then <b>Start</b>. Tap to change life; there's commander damage, poison, monarch, initiative, dice and a turn timer.", go: {page: "game", el: "gameView"}},
    {h: "Log the winner", b: "When the game ends, pick who won. Your results build real win rates per deck, and after 5 games with a deck, the 3,000-game test can be <b>tuned to your table</b> so its numbers match your real games.", go: {page: "game", el: "gameView"}}
  ]},
  {t: "Updates and help", steps: [
    {h: "Staying up to date", b: "When Deckseer is improved, the app updates itself. If it's open, a message says <b>A new version of Deckseer is ready</b>; click <b>Reload</b>. Your cards and decks are never touched by an update. The version number is at the bottom of the Collection page.", go: {page: "collection", ctab: "cards", el: "appVersion"}},
    {h: "You're set", b: "That's everything. You can open this guide any time with the <b>Guide</b> button at the top. Happy scanning!"}
  ]}
];
function guideState(){ return Object.assign({ch: 0, st: 0, done: {}}, prefs.guide || {}); }
function openGuide(ch, st){
  const g = guideState(); if (ch != null) { g.ch = ch; g.st = st || 0; }
  prefs.guide = g; savePrefs(); $("tour").hidden = false; renderGuide();
  setTimeout(() => { const b = $("tour").querySelector(".gd-next") || $("tour").querySelector("button"); if (b) b.focus(); }, 30);
}
function closeGuide(){ $("tour").hidden = true; document.querySelectorAll(".guide-hl").forEach(x => x.classList.remove("guide-hl")); }
function renderGuide(){
  const g = guideState(), ch = GUIDE[g.ch], step = ch.steps[g.st];
  const first = g.ch === 0 && g.st === 0, last = g.ch === GUIDE.length - 1 && g.st === ch.steps.length - 1;
  $("guideBody").innerHTML = `
    <label class="gd-chap">Chapter <select id="guideChap">${GUIDE.map((c, i) => `<option value="${i}" ${i === g.ch ? "selected" : ""}>${g.done[i] ? "✓ " : ""}${i + 1}. ${esc(c.t)}</option>`).join("")}</select></label>
    <div class="gd-dots" aria-hidden="true">${ch.steps.map((s, i) => `<i class="${i === g.st ? "on" : i < g.st ? "past" : ""}"></i>`).join("")}</div>
    <p class="gd-count">Step ${g.st + 1} of ${ch.steps.length}</p>
    <h3 class="gd-h">${esc(step.h)}</h3>
    <p class="gd-b">${step.b}</p>
    ${step.go ? `<button class="btn" type="button" id="guideShow">👁 Show me</button>` : ""}
    <p class="gd-msg" id="guideMsg" role="status"></p>
    <div class="gd-nav"><button class="btn ghost" type="button" id="guidePrev" ${first ? "disabled" : ""}>← Back</button>
      <button class="btn primary gd-next" type="button" id="guideNext">${last ? "Finish" : g.st === ch.steps.length - 1 ? "Next chapter →" : "Next →"}</button></div>`;
}
function guideMove(d){
  const g = guideState(); let {ch, st} = g;
  if (d > 0) { if (st < GUIDE[ch].steps.length - 1) st++; else { g.done[ch] = true; if (ch < GUIDE.length - 1) { ch++; st = 0; } else { prefs.guide = Object.assign(g, {ch: 0, st: 0}); savePrefs(); closeGuide(); return toast("Guide finished. Open it again any time with the Guide button."); } } }
  else { if (st > 0) st--; else if (ch > 0) { ch--; st = GUIDE[ch].steps.length - 1; } }
  prefs.guide = Object.assign(g, {ch, st}); savePrefs(); renderGuide();
  document.querySelectorAll(".guide-hl").forEach(x => x.classList.remove("guide-hl"));
}
/* ⚙ Settings: learning from scans, Picture library, AI picture recognition, Ask Claude, as tabs */
const SET_TABS = ["scanSet", "soundSet", "lookSet", "memBox", "libBox", "aiPicBox", "aiBox"];
function setTab(id){
  if (!SET_TABS.includes(id)) id = SET_TABS[0];
  prefs.setTab = id; savePrefs();
  for (const t of SET_TABS) { $(t).hidden = t !== id; const b = document.querySelector(`[data-settab="${t}"]`); b.setAttribute("aria-selected", t === id); b.tabIndex = t === id ? 0 : -1; }
}
function openSettings(tab, nonModal){
  const dlg = $("setDlg"); setTab(tab || prefs.setTab);
  if (!dlg.open) { if (nonModal) dlg.show(); else dlg.showModal(); }
}
function setSummary(){
  const st = id => ($(id).textContent || "").replace(/[()]/g, "").trim();
  $("setSummary").textContent = `Learning: ${st("memSummaryState") || "on"} · Picture library: ${st("libSummaryState") || "off"} · AI: ${st("aiPicState") || "off"}`;
}
document.addEventListener("click", e => {
  if (e.target.closest("#settingsOpen, #settingsOpen2")) return openSettings();
  if (e.target.closest("#setClose") || e.target === $("setDlg")) return $("setDlg").close();
  const t = e.target.closest("[data-settab]"); if (t) setTab(t.dataset.settab);
});
$("setDlg").addEventListener("keydown", e => {
  if (!e.target.closest(".set-tabs") || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const i = SET_TABS.indexOf(prefs.setTab), n = SET_TABS[(i + (e.key === "ArrowRight" ? 1 : SET_TABS.length - 1)) % SET_TABS.length];
  setTab(n); document.querySelector(`[data-settab="${n}"]`).focus(); e.preventDefault();
});
setTab(prefs.setTab); setSummary();
new MutationObserver(setSummary).observe($("setDlg").querySelector(".set-tabs"), {subtree: true, childList: true, characterData: true});
// go to the page and tab, open the settings it's in, scroll to it and make it glow
function guideShow(go){
  const msg = t => { const m = $("guideMsg"); if (m) m.textContent = t; };
  if (go.needDeck && !(prefs.deckView && deckById(prefs.deckView))) {
    if (decks.length) { prefs.deckView = decks[0].id; savePrefs(); }
    else { showPage("builder"); return msg("Make a deck first: click New deck on the Deck builder page, then press Show me again."); }
  }
  if (go.page) showPage(go.page);
  if (go.ctab) { prefs.collTab = go.ctab; savePrefs(); applyCollTab(); }
  if (go.page === "builder") { if (typeof renderDeck === "function") renderDeck(); if (go.dtab) { prefs.deckTab = go.dtab; savePrefs(); applyDeckTab(); } }
  setTimeout(() => {
    const el = $(go.el); if (!el) return msg("That part isn't on the screen right now.");
    const pane = el.closest(".set-pane"); if (pane) openSettings(pane.id, true);   // non-modal, so the guide stays usable
    for (let p = el; p; p = p.parentElement) { if (p.tagName === "DETAILS") p.open = true; }
    if (el.tagName === "DETAILS") el.open = true;
    if (!el.offsetParent && el.id !== "installApp") msg(el.id === "installApp" ? "" : "It's hidden right now.");
    if (el.id === "installApp" && el.classList.contains("hide")) msg(/^https?:$/.test(location.protocol) ? "The browser hasn't offered to install yet, or Deckseer is already installed. Look for the install icon at the right of the address bar." : "Install is only possible from the website, not from a downloaded file.");
    document.querySelectorAll(".guide-hl").forEach(x => x.classList.remove("guide-hl"));
    el.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
    el.classList.add("guide-hl");
    setTimeout(() => el.classList.remove("guide-hl"), 6000);
  }, 120);
}
document.addEventListener("click", e => {
  if (e.target.closest("#guideOpen") || e.target.closest("#introOpen") || e.target.closest("#introGuide")) { e.preventDefault(); return openGuide(); }
  if (!e.target.closest("#tour")) return;
  if (e.target.closest("#guideClose")) return closeGuide();
  if (e.target.closest("#guideNext")) return guideMove(1);
  if (e.target.closest("#guidePrev")) return guideMove(-1);
  if (e.target.closest("#guideShow")) { const g = guideState(); return guideShow(GUIDE[g.ch].steps[g.st].go); }
});
document.addEventListener("change", e => { if (e.target.id === "guideChap") { const g = guideState(); prefs.guide = Object.assign(g, {ch: +e.target.value, st: 0}); savePrefs(); renderGuide(); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("tour").hidden) closeGuide(); });

/* First-start popup: offers the two picture downloads. Shown once (prefs.seenSetup); the ⬇ Downloads button reopens it. */
function setupRender(){
  const d = $("setupDlg"); if (!d || !d.open) return;
  const libOn = libReady(), m = lib.meta;
  $("suLibDone").hidden = !libOn;
  $("suLibScope").value = m && !m.done ? m.scope : $("libScope").value;
  $("suLibScope").disabled = lib.building || !!(m && m.count && !m.done);
  const go = $("suLibGo");
  if (lib.building) { go.textContent = "Downloading… (pause)"; $("suLibInfo").textContent = $("libState").textContent; }
  else if (libOn) { go.textContent = m.scope === "recent" ? "Add older cards too" : "Update"; $("suLibInfo").textContent = $("libState").textContent; }
  else if (m && m.count) { go.textContent = "Resume"; $("suLibInfo").textContent = $("libState").textContent + " Press Resume to carry on."; }
  else go.textContent = "Download card pictures";
  go.classList.toggle("primary", !libOn);
  const aiOn = aiReady();
  $("suAiDone").hidden = !aiOn;
  $("suAiSteps").hidden = aiOn;
  $("suAiInfo").textContent = aiOn ? `Ready: ${AI.meta.count.toLocaleString()} card pictures. Nothing more to do.`
    : AI.state === "loading" ? "Loading the AI files…"
    : AI.state === "failed" ? `Those files didn't work: ${AI.err} Make them again with the notebook, or pick all three files again.`
    : "More accurate than the card pictures. It needs three files you make once, for free, with a Google Colab notebook (about an hour, mostly waiting):";
}
function openSetup(){
  const d = $("setupDlg"); if (!d || d.open) return;
  if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  setupRender();
}
function closeSetup(){ const d = $("setupDlg"); prefs.seenSetup = true; savePrefs(); if (d.open) d.close(); }
$("setupClose").onclick = closeSetup;
$("setupDlg").addEventListener("close", () => { if (!prefs.seenSetup) { prefs.seenSetup = true; savePrefs(); } });
$("setupOpen").onclick = openSetup;
$("suLibScope").onchange = e => { $("libScope").value = e.target.value; prefs.libScope = e.target.value; savePrefs(); libStatus(); };
$("suLibGo").onclick = () => { $("libScope").value = $("suLibScope").value; $("libBuild").click(); setTimeout(setupRender, 50); };
$("suAiFiles").onchange = e => { const fl = e.target.files; setupRender(); aiLoadPicked(fl).finally(() => { e.target.value = ""; setupRender(); }); };
$("suAiHow").onclick = () => { closeSetup(); openGuide(GUIDE.findIndex(c => /AI/.test(c.t)), 1); };
{ const ls = libStatus, as = aiStatus; libStatus = function(){ ls.apply(this, arguments); setupRender(); }; aiStatus = function(){ as.apply(this, arguments); setupRender(); }; }
// on first start, once what's already downloaded is known; not under test automation unless a test asks for it
if (!prefs.seenSetup && (!navigator.webdriver || window.DECKSEER_SETUP)) {
  Promise.resolve(lib.loaded).catch(() => {}).then(async () => {
    for (let i = 0; i < 40 && AI.state === "loading"; i++) await new Promise(r => setTimeout(r, 100));
    if (libReady() && aiReady()) { prefs.seenSetup = true; savePrefs(); return; }   // already has both
    openSetup();
  });
}
$("intro").hidden = !!prefs.seenIntro;
$("introClose").onclick = () => { prefs.seenIntro = true; savePrefs(); $("intro").hidden = true; };

