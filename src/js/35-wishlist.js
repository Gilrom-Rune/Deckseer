/* ================= Wishlist with price alerts ================= */
let wish = store.get("bsw-wish", []);
const saveWish = () => store.set("bsw-wish", wish);
function addWish(p){
  if (wish.some(w => w.name === p.name)) return toast(`${p.name} is already on your wishlist`);
  const price = num(p.usd);
  wish.unshift({id: p.id, name: p.name, set: p.set, img: p.img, imgN: p.imgN, price, start: price, target: price ? Math.floor(price * 0.8 * 100) / 100 : null, added: Date.now(), hit: false});
  saveWish(); renderWish(); toast(`Added ${p.name} to your wishlist${price ? ` (alert below ${money(Math.floor(price * 0.8 * 100) / 100, "usd")})` : ""}`);
}
async function addWishByName(name){
  try { const j = await sf(`/cards/named?exact=${encodeURIComponent(name.split(" // ")[0])}`); if (j && j.name) return addWish(slimCard(j)); } catch (e) {}
  toast("Couldn't reach Scryfall.");
}
async function checkWish(silent){
  if (!wish.length) return;
  const btn = $("wishCheck"); if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  let hits = 0;
  try {
    for (let i = 0; i < wish.length; i += 75) {
      const part = wish.slice(i, i + 75);
      const j = await sf("/cards/collection", {method: "POST", headers: {"Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify({identifiers: part.map(w => w.id ? {id: w.id} : {name: w.name})})});
      for (const c of j.data || []) {
        const w = wish.find(x => x.id === c.id || x.name === c.name); if (!w) continue;
        const p = num(c.prices && c.prices.usd); if (p == null) continue;
        w.was = w.price; w.price = p;
        const below = w.target != null && p <= w.target;
        if (below && !w.hit) hits++;
        w.hit = below;
      }
    }
    prefs.wishChecked = Date.now(); savePrefs(); saveWish();
    if (hits) toast(`${hits} wishlist card${hits > 1 ? "s are" : " is"} at or below your price. See Collection → Wishlist.`);
    else if (!silent) toast("Wishlist prices updated.");
  } catch (e) { console.warn(e); if (!silent) toast("Couldn't reach Scryfall."); }
  renderWish();
}
function renderWish(){
  const box = $("wishView"); if (!box) return;
  const hits = wish.filter(w => w.hit).length;
  const tab = $("collTabWish"); if (tab) tab.innerHTML = `Wishlist <span class="count">${wish.length}</span>${hits ? ` <span class="wish-dot" title="${hits} at your price">${hits}</span>` : ""}`;
  box.innerHTML = `<div class="sim-head"><h3>Wishlist</h3><span class="cur-sub">Cards you want, with the price you'd pay. Deckseer checks prices once a day when you open it and tells you when one drops to your price.</span></div>
    <div class="srch-bar"><button class="btn" type="button" id="wishCheck" ${wish.length ? "" : "disabled"}>Check prices now</button><span class="cur-sub">${prefs.wishChecked ? "Last checked " + new Date(prefs.wishChecked).toLocaleString() : "Not checked yet"}</span>
      <span class="cur-sub">Total at today's prices: <b>${money(wish.reduce((t, w) => t + (w.price || 0), 0), "usd")}</b></span></div>
    ${wish.length ? `<table class="dc-table wish-table"><thead><tr><th>Card</th><th>Now</th><th>Alert at or below</th><th></th><th></th></tr></thead><tbody>${wish.map((w, i) => `<tr class="${w.hit ? "hit" : ""}">
      <td><div class="cn"><img loading="lazy" src="${esc(w.img || "")}" alt=""><b>${esc(w.name)}</b></div></td>
      <td>${w.price != null ? money(w.price, "usd") : "—"}${w.was != null && w.price != null && Math.abs(w.price - w.was) >= 0.01 ? `<span class="chg ${w.price > w.was ? "down" : "up"}" title="${w.price > w.was ? "Went up" : "Went down"}">${w.price > w.was ? "▲" : "▼"} ${money(Math.abs(w.price - w.was), "usd")}</span>` : ""}</td>
      <td><span class="wish-tgt">$<input type="number" min="0" step="0.25" value="${w.target != null ? w.target : ""}" data-wtgt="${i}" aria-label="Alert price for ${esc(w.name)}"></span></td>
      <td>${w.hit ? `<b class="wish-ok">✓ At your price</b>` : ""}</td>
      <td class="nowrap"><a class="linkish" href="https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(w.name)}" target="_blank" rel="noopener">Buy</a> <button class="x" type="button" data-wrm="${i}" aria-label="Remove ${esc(w.name)}">×</button></td></tr>`).join("")}</tbody></table>`
      : `<p class="cur-sub">Nothing here yet. Add cards from Card search (♡ Wishlist) or from Deck check → Upgrades.</p>`}`;
}
$("wishView").addEventListener("click", e => {
  if (e.target.closest("#wishCheck")) return checkWish(false);
  const r = e.target.closest("[data-wrm]"); if (r) { const w = wish.splice(+r.dataset.wrm, 1)[0]; saveWish(); renderWish(); toast(`Removed ${w.name}`, "Undo", () => { wish.splice(+r.dataset.wrm, 0, w); saveWish(); renderWish(); }); }
});
$("wishView").addEventListener("change", e => {
  const t = e.target.closest("[data-wtgt]"); if (!t) return;
  const w = wish[+t.dataset.wtgt]; if (!w) return;
  w.target = t.value === "" ? null : Math.max(0, +t.value); w.hit = w.target != null && w.price != null && w.price <= w.target; saveWish(); renderWish();
});

