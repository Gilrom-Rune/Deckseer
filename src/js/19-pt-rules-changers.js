/* ----- the table's rules-changers: doublers, extra triggers, stat boosts ----- */
let ptModsCache = {key: "", val: null};
function ptMods(){
  const key = PT.bf.map(c => c.uid + c.name + (c.back ? "b" : "") + (c.faceDown ? "f" : "") + (c.att != null ? "a" + c.att : "")).join(",") + "|" + (PT.combat || []).join(".");
  if (ptModsCache.key === key && ptModsCache.val) return ptModsCache.val;
  const m = {tokenX: 1, creTokenX: 1, ctrPlus: 0, ctrPlusAny: 0, ctrX: 1, ctrXcre: 1, lifeX: 1, dmgX: 1, torbran: 0,
    etbArtCre: 0, etbPerm: 0, dies: 0, attack: 0, spellCast: 0, srcX: [], anthems: [], grants: [], who: {}};
  const note = (k, s) => { (m.who[k] = m.who[k] || []).push(s.name.split(" // ")[s.back ? 1 : 0] || s.name); };
  for (const s of PT.bf) {
    if (s.faceDown) continue;
    const t = ptFaceText(s).toLowerCase().replace(/\([^)]*\)/g, "");
    if (/would create one or more tokens[^.]*twice that many/.test(t)) { m.tokenX *= 2; note("tokens", s); }                       // Doubling Season, Anointed Procession, Mondrak
    else if (/would create one or more creature tokens[^.]*twice that many/.test(t)) { m.creTokenX *= 2; note("tokens", s); }       // Parallel Lives
    if (/one or more \+1\/\+1 counters would be put on a creature you control, that many plus one/.test(t)) { m.ctrPlus++; note("counters", s); }   // Hardened Scales
    if (/one or more counters would be put on an artifact or creature you control, that many plus one/.test(t)) { m.ctrPlusAny++; note("counters", s); } // Winding Constrictor
    if (/would put one or more counters on a permanent[^.]*twice that many/.test(t)) { m.ctrX *= 2; note("counters", s); }          // Doubling Season
    if (/one or more \+1\/\+1 counters would be put on (?:a|another) creature you control, twice that many/.test(t)) { m.ctrXcre *= 2; note("counters", s); } // Corpsejack Menace
    if (/if you would gain life, you gain twice that much life/.test(t)) { m.lifeX *= 2; note("life", s); }                       // Boon Reflection, Rhox Faithmender
    if (/deals? triple that damage|three times that much damage/.test(t)) { m.dmgX *= 3; note("damage", s); }                    // Fiery Emancipation
    else if (/deals? double that damage/.test(t)) { m.dmgX *= 2; note("damage", s); }                                              // Furnace of Rath, Dictate of the Twin Gods
    if (/red source you control would deal damage to an opponent[^.]*plus 2/.test(t)) { m.torbran += 2; note("damage", s); }     // Torbran
    const extra = (re, k) => { if (re.test(t)) { m[k]++; note("extra", s); } };
    extra(/an artifact or creature entering(?: the battlefield)? causes a triggered ability[^.]*additional time/, "etbArtCre");          // Panharmonicon
    extra(/a permanent entering(?: the battlefield)? causes a triggered ability[^.]*additional time/, "etbPerm");                        // Yarok
    extra(/a creature dying causes a triggered ability[^.]*additional time/, "dies");                                                   // Teysa Karlov, Drivnod
    extra(/a creature attacking causes a triggered ability[^.]*additional time/, "attack");                                             // Isshin
    extra(/(?:casting or copying|casting|copying) an instant or sorcery spell causes a triggered ability[^.]*additional time/, "spellCast"); // Veyran
    // doublers that care whose ability it is: Twinflame Travelers (another Elemental), Annie Joins Up (legendary creature or planeswalker),
    // Delney (creature with power 2 or less), Harmonic Prodigy (Shaman or another Wizard)
    for (const d of t.matchAll(/\bif (?:a|an) (?:triggered )?ability of (.*?) triggers, (?:it|that ability) triggers an additional time/g)) {
      if (/chosen type/.test(d[1])) continue;   // Roaming Throne: the table doesn't know which type you chose
      m.srcX.push({uid: s.uid, other: /\banother\b/.test(d[1]), phrase: d[1].replace(/\b(?:a|an|another|other)\b/g, " ").replace(/\s+/g, " ").trim()});
      note("extra", s);
    }
    // stat boosts that last ("Creatures you control get +1/+1", "Other Elves you control get +1/+1")
    for (const a of t.matchAll(/(?:^|\n|\. )([^.\n]*?)creatures?( tokens?)? you control get ([+-]\d+)\/([+-]\d+)(?! until)/g)) {
      if (/\btarget\b|\bequipped\b|\benchanted\b|\bwhenever\b|\bwhen\b|\bat the beginning\b|:/.test(a[1])) continue;
      if (/until end of turn/.test(t.slice(a.index, t.indexOf(".", a.index + 1) + 1 || undefined))) continue;   // a one-off pump, not a lasting boost
      const tokOnly = !!a[2], pp = +a[3], tt = +a[4];   // "Creature tokens you control get +1/+1" only boosts tokens
      m.anthems.push({src: s.uid, tokOnly, p: pp, t: tt, other: /\bother\b/.test(a[1]), nontoken: /\bnontoken\b/.test(a[1]), phrase: a[1].replace(/\b(each|all|other|another|nontoken)\b/g, " ").replace(/\s+/g, " ").trim()});
    }
  }
  for (const s of PT.bf) {
    if (s.faceDown) continue;
    const t = ptFaceText(s).toLowerCase().replace(/\([^)]*\)/g, ""), nm = ptFaceName(s);
    for (const g of t.matchAll(/(?:^|\n|\. )([^.\n]*?) you control (?:get [+-]\d+\/[+-]\d+ and )?(?:have|has) ([^.\n]+)/g)) {
      const subj = g[1].trim();
      if (/\b(target|until|whenever|when|if|as long as|equipped|enchanted)\b/.test(subj) || !subj) continue;
      const kws = ptKwList(g[2]); if (!kws.length) continue;
      m.grants.push({src: s.uid, srcName: nm, kws, other: /\bother\b/.test(subj), tokOnly: /\btokens?\b/.test(subj) && !/\bnontoken\b/.test(subj), nontoken: /\bnontoken\b/.test(subj),
        attacking: /\battacking\b/.test(subj), cre: /\bcreatures?\b/.test(subj),
        phrase: subj.replace(/\b(each|all|other|another|nontoken|attacking|tokens?)\b/g, " ").replace(/\bcreature\b/g, "creatures").replace(/\s+/g, " ").trim()});
    }
  }
  ptModsCache = {key, val: m};
  return m;
}
function ptAnthemOf(c){
  if (!PT || !PT.bf.includes(c) || !ptIsCreature(c)) return [0, 0];
  let p = 0, t = 0;
  for (const a of ptMods().anthems) { if (a.other && a.src === c.uid) continue; if (a.nontoken && c.token) continue; if (a.tokOnly && !c.token) continue; if (a.phrase && !trFits(a.phrase, c)) continue; p += a.p; t += a.t; }
  return [p, t];
}
// Gaining life goes through life doublers and tells "whenever you gain life" cards how much
function ptGain(n, why){
  if (n <= 0) return 0;
  n *= ptMods().lifeX; PT.life += n; PT.gainedTurn = PT.turn;
  ptLog(`Gained ${n} life${why ? ` (${why})` : ""}.`); ptEmit("gainlife", null, {amount: n});
  return n;
}
// Damage to the opponent goes through Torbran and damage doublers; life loss doesn't
function ptDealOpp(n, why, srcCard, isDamage, who){
  if (n <= 0) return 0;
  if (isDamage) { const m = ptMods(); if (srcCard && (srcCard.colors || []).includes("R")) n += m.torbran; n *= m.dmgX; }
  const k = who === "each" ? ptLiveOpps().length : 1;
  ptHitOpp(n, why, who); PT.lastLost = n * k; return n * k;
}
// Counters from effects go through Hardened Scales, Winding Constrictor, Doubling Season…
function ptAddCounters(uid, kind, n){
  const f = ptFind(uid); if (!f || n <= 0) return 0;
  const c = f.card, m = ptMods(), cre = ptIsCreature(c), art = /\bArtifact\b/.test((c.type || "").split(" // ")[0]);
  if (cre || art) n += m.ctrPlusAny;
  if (kind === "p1p1" && cre) { n += m.ctrPlus; n *= m.ctrXcre; }
  n *= m.ctrX;
  const before = (c.counters || {})[kind] || 0;
  for (let i = 0; i < n; i++) ptCounter(uid, kind, 1);
  if (kind === "lore") for (let k = before + 1; k <= ((c.counters || {}).lore || 0); k++) ptEmit("lore", c, {n: k});
  if (kind === "p1p1" && n > 0 && f.zone === "bf") ptEmit("ctr", c, {amount: n});
  return n;
}
const ptTokenMult = def => { const m = ptMods(); return m.tokenX * (/\bCreature\b/.test(def.type || "") ? m.creTokenX : 1); };
// Every cascade a spell has: its own ("Cascade, cascade" counts twice) plus ones other cards give it
function ptCascades(e){
  const out = [], c = e.snap, own = ptFaceText(c).replace(/\([^)]*\)/g, "");
  for (const line of own.split("\n")) { const kws = line.split(/,\s*/).map(x => x.trim().toLowerCase()); if (kws.every(k => /^[a-z' -]+( \d+)?$/.test(k))) kws.forEach(k => { if (k === "cascade") out.push("own"); }); }
  for (const s of PT.bf) {
    if (s.faceDown || s.uid === c.uid) continue;
    const t = ptFaceText(s).toLowerCase().replace(/\([^)]*\)/g, ""), nm = s.name.split(" // ")[s.back ? 1 : 0] || s.name;
    if (/the first spell you cast each turn has cascade/.test(t) && e.nth === 1) out.push(nm);                                 // Maelstrom Nexus
    if (/the first spell you cast from exile each turn has cascade/.test(t) && e.from === "exile" && e.exileNth === 1) out.push(nm);  // Wild-Magic Sorcerer
    for (const m of t.matchAll(/(?:^|\n|\. )([^.\n"“]*?)spells you cast((?: from your hand)?(?: with mana value (\d+) or greater)?(?: from your hand)?) (?:have|has|gain) ["“]?(cascade(?:, cascade)*)/g)) {
      if (/this turn/.test(t.slice(m.index, m.index + m[0].length + 20))) continue;   // Yidris-style "this turn": use Cast another way → Cascade
      if (/from your hand/.test(m[2]) && e.from !== "hand") continue;
      if (m[3] && (c.cmc ?? 0) < +m[3]) continue;
      if (m[1].trim() && !trFits(m[1].trim(), c)) continue;
      for (let k = 0; k < (m[4].match(/cascade/g) || []).length; k++) out.push(nm);                                             // Imoti, Zhulodok ("Cascade, cascade")
    }
  }
  return out;
}
// Cascade / discover: exile from the top until a nonland card cheap enough, cast it free, the rest to the bottom at random
function ptReveal(limit, strict, why){
  const out = []; let hit = null;
  while (PT.lib.length) { const c = PT.lib.shift(); if (!ptIsLand(c) && (strict ? (c.cmc ?? 99) < limit : (c.cmc ?? 99) <= limit)) { hit = c; break; } out.push(c); }
  if (strict && PT.bf.some(s => /as you cascade, you may put a land card from among the exiled cards onto the battlefield tapped/i.test(ptFaceText(s)))) {
    const li = out.findIndex(ptIsLand);
    if (li >= 0) { const land = out.splice(li, 1)[0]; PT.exile.push(land); ptMove(land.uid, "bf", {cast: false}); land.tapped = true; ptLog(`Averna: put ${land.name} onto the battlefield tapped.`); }
  }
  PT.lib.push(...shuffle(out));
  if (!hit) { ptLog(`${why}: no card cheap enough was found (${out.length} put on the bottom).`); return; }
  PT.exile.push(hit);
  ptLog(`${why}: revealed ${out.length + 1} cards and cast ${hit.name} for free.`);
  ptReveal.last = hit.name;
  ptMove(hit.uid, ptIsPermanentType(hit) ? "bf" : "grave", {cast: true, how: why.toLowerCase()});
}

