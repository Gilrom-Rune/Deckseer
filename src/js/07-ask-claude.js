/* ---------------- Ask Claude (optional, uses the person's API key) ---------------- */
const AI_PROMPT = `This photo shows one Magic: The Gathering card held up to a webcam. Identify the exact printing. Look at everything: the name (it may be in another language, or in Tolkien runes such as Dwarvish), the artwork, the frame and border style, the set symbol, and the collector line in the bottom-left corner (set code, collector number, language).

Reply with only JSON, no other text:
{"name": the card's English Oracle name (front face only for double-faced cards; full "A // B" name for split and adventure cards), "set": the set code in capitals, "number": the collector number as a string, or "" if you can't tell, "lang": two-letter language code of the printed text, or "" if not a normal language, "foil": true if foil sheen is visible, "confidence": 0 to 1}
If there is no Magic card in the photo, reply {"name": ""}.`;
function claudeReady(){ return !!(prefs.aiKey && prefs.aiKey.length > 20); }
function syncAiUI(){
  const on = claudeReady();
  $("askAi").classList.toggle("hide", !on); $("askAi").disabled = !on || !stream || !ready;
  document.querySelectorAll(".aikey").forEach(el => el.classList.toggle("hide", !on));
  $("aiState").textContent = on ? "(on)" : "(off)";
}
$("libBuild").onclick = () => { if (lib.building) { lib.stop = true; $("libBuild").textContent = "Pausing…"; } else buildLibrary(); };
$("libDelete").onclick = () => { if (confirm("Delete the picture library? You can build it again later.")) deleteLibrary(); };
$("libScope").value = prefs.libScope || "recent";
$("libScope").onchange = e => { prefs.libScope = e.target.value; savePrefs(); libStatus(); };
lib.loaded = loadLibrary().then(() => { if (lib.meta) $("libScope").value = lib.meta.scope; libStatus(); });
$("aiKey").value = prefs.aiKey || ""; $("aiModel").value = prefs.aiModel || "claude-sonnet-5-5";
$("aiKey").addEventListener("change", e => { prefs.aiKey = e.target.value.trim(); savePrefs(); syncAiUI(); });
$("aiModel").addEventListener("change", e => { prefs.aiModel = e.target.value; savePrefs(); });
$("askAi").onclick = () => askClaude();
let aiBusy = false;
async function askClaude(){
  if (!claudeReady() || aiBusy || !guideRect || !stream) return;
  aiBusy = true; $("askAi").disabled = true;
  const seq = ++scanSeq;
  setStatus("Asking Claude to look at the card…", "", true);
  try {
    // a sharp crop of the card (plus a little margin) at a size Claude reads well
    const cap = await grab();
    const m = cap.rectified ? 0 : 0.05, r = cap.rect;
    const c = document.createElement("canvas"); c.height = 1100; c.width = Math.round(1100 * CARD_RATIO);
    c.getContext("2d").drawImage(cap.src, r.x - r.w * m, r.y - r.h * m, r.w * (1 + 2 * m), r.h * (1 + 2 * m), 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.9).split(",")[1];
    const wins = frameWindows(cap), shot = cardShot(cap);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"content-type": "application/json", "x-api-key": prefs.aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"},
      body: JSON.stringify({model: prefs.aiModel || "claude-sonnet-5-5", max_tokens: 400,
        messages: [{role: "user", content: [{type: "image", source: {type: "base64", media_type: "image/jpeg", data}}, {type: "text", text: AI_PROMPT}]}]})
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (j.error && j.error.message) || "";
      throw {ai: res.status === 401 ? "Claude rejected the API key. Check it in “Ask Claude about hard cards”."
        : /credit/i.test(msg) ? "Your Anthropic account is out of credit. Add some at console.anthropic.com."
        : res.status === 429 ? "Too many requests to Claude. Wait a moment and try again."
        : res.status === 404 ? "That Claude model isn't available on your account. Pick the other one in settings."
        : `Claude couldn't answer (${res.status}). Try again.`};
    }
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const m2 = text.match(/\{[\s\S]*\}/);
    const ans = m2 ? JSON.parse(m2[0]) : {};
    if (seq !== scanSeq) return;
    if (!ans.name) { setStatus("Claude didn't see a Magic card. Hold it inside the frame and try again.", "err"); return; }
    let card = null;
    if (ans.set && ans.number) card = await getBySetNumber(String(ans.set), String(ans.number)).catch(() => null);
    if (card && norm(card.name).indexOf(norm(String(ans.name)).split(" ")[0]) < 0 && norm(String(ans.name)).indexOf(norm(card.name).split(" ")[0]) < 0) card = null; // set/number disagrees with the name
    if (card) {
      let prints = await getPrints(card.name);
      let i = prints.findIndex(p => p.id === card.id);
      if (i < 0) { prints = [card].concat(prints); i = 0; }
      present({name: card.name, prints, sel: i, why: `Identified by Claude: ${card.set} #${card.number}`, info: {set: "", number: ""}, wins, shot, rectified: cap.rectified, foil: !!ans.foil || prefs.foil}, Number(ans.confidence) >= 0.8);
      return;
    }
    const name = NAMES.some(([, full]) => full === ans.name) ? ans.name : (matchName(String(ans.name))[0] || {}).name;
    if (!name) { setStatus(`Claude thinks it's “${ans.name}”, but Scryfall doesn't know that card.`, "err"); return; }
    const prints = await getPrints(name, !!(ans.lang && ans.lang !== "en"));
    const pick = await pickPrinting(prints, {set: String(ans.set || "").toUpperCase(), number: String(ans.number || "").toLowerCase().replace(/^0+/, "")}, wins);
    present({name, prints, sel: pick.index, why: `Claude: ${name}. ${pick.why}`, info: {set: "", number: ""}, wins, shot, rectified: cap.rectified, foil: !!ans.foil || prefs.foil}, pick.sure && Number(ans.confidence) >= 0.8);
  } catch (e) {
    console.error(e);
    setStatus(e && e.ai ? e.ai : e instanceof TypeError ? "Couldn't reach Claude or Scryfall. Check your internet connection." : "Claude's answer couldn't be read. Try again.", "err");
  } finally { aiBusy = false; syncAiUI(); }
}

