// Adding cards to a deck without scanning: by name (with how many and where), and by pasting a list.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Add cards to a deck without scanning');
  const { browser, page } = await openApp();
  const r = await page.evaluate(async () => {
    const DB = {'sol ring': ['Artifact', '{1}'], 'lightning bolt': ['Instant', '{R}'], 'forest': ['Basic Land — Forest', ''], 'krenko, mob boss': ['Legendary Creature — Goblin Warrior', '{2}{R}{R}'], 'grizzly bears': ['Creature — Bear', '{1}{G}']};
    const sc = n => DB[n.toLowerCase()] && {object: 'card', id: 'id-' + n.toLowerCase(), name: n.replace(/\b\w/g, x => x.toUpperCase()).replace(/ Mob/, ' Mob'), set: 'tst', set_name: 'Test', collector_number: '1', rarity: 'rare', type_line: DB[n.toLowerCase()][0], mana_cost: DB[n.toLowerCase()][1], oracle_text: '', colors: [], color_identity: [], legalities: {}, finishes: ['nonfoil'], prices: {usd: '1'}, image_uris: {small: '', normal: ''}};
    window.sf = async (path, opts) => {
      if (/\/cards\/named/.test(path)) { const n = decodeURIComponent(path.split('exact=')[1]); const c = sc(n); if (!c) throw new Error('404'); return c; }
      if (/\/cards\/collection/.test(path)) { const ids = JSON.parse(opts.body).identifiers; return {data: ids.map(i => sc(i.name)).filter(Boolean)}; }
      throw new Error('offline');
    };
    const out = {};
    const d = newDeck('Goblins', 'commander'); saveDecks(); prefs.deckView = d.id; savePrefs(); showPage('builder'); renderDeck();
    const wait = async f => { for (let i = 0; i < 100 && !f(); i++) await new Promise(r => setTimeout(r, 30)); };
    // the header button opens the add window; a commander deck with no commander starts on "Commander"
    document.getElementById('deckAddHead').click();
    const dlg = document.getElementById('replDlg');
    out.open = dlg.open; out.board0 = document.getElementById('replBoard').value;
    await replaceWith('Krenko, Mob Boss'); await wait(() => !repl.busy);
    out.cmd = deckById(d.id).commanders.map(c => c.name);
    out.stillOpen = dlg.open; out.msg = dlg.querySelector('.repl-msg').textContent; out.board1 = document.getElementById('replBoard').value;
    // how many: 3 Sol Rings (a commander deck allows that here; Deck check flags it)
    const q = document.getElementById('replQty'); q.value = '3'; q.dispatchEvent(new Event('input', {bubbles: true}));
    await replaceWith('Sol Ring');
    out.sol = (deckById(d.id).cards.find(c => c.name === 'Sol Ring') || {}).qty;
    out.qtyReset = document.getElementById('replQty').value;
    // paste a list
    dlg.querySelector('[data-rp="pastemode"]').click();
    const t = document.getElementById('replPaste'); t.value = '4 Lightning Bolt\n10 Forest\n1 Not A Real Card'; t.dispatchEvent(new Event('input', {bubbles: true}));
    dlg.querySelector('[data-rp="paste"]').click(); await wait(() => !repl.busy && /Added/.test(repl.msg));
    const dd = deckById(d.id), qty = n => (dd.cards.find(c => c.name === n) || {}).qty;
    out.pasted = {bolt: qty('Lightning Bolt'), forest: qty('Forest')}; out.pasteMsg = repl.msg; out.left = document.getElementById('replPaste').value;
    // Undo from the toast takes the pasted cards back out
    document.getElementById('toastBtn').click();
    out.undone = !deckById(d.id).cards.some(c => c.name === 'Forest') && qty('Sol Ring') === 3;
    dlg.close();
    // a non-commander deck can add to the sideboard
    const d2 = newDeck('Modern', 'modern'); saveDecks(); prefs.deckView = d2.id; renderDeck();
    openReplace({deckId: d2.id, add: true});
    const b = document.getElementById('replBoard'); b.value = 'side'; b.dispatchEvent(new Event('change', {bubbles: true}));
    await replaceWith('Grizzly Bears');
    out.side = deckById(d2.id).cards.map(c => c.board + ':' + c.name);
    dlg.close();
    return out;
  });
  check('"＋ Add cards" opens the add window, on "Commander" for a deck without one', r.open && r.board0 === 'commander', r);
  check('picking a legendary creature makes it the commander', JSON.stringify(r.cmd) === '["Krenko, Mob Boss"]', r.cmd);
  check('the window stays open for the next card, now adding to the main deck', r.stillOpen && /Added Krenko, Mob Boss as your commander/.test(r.msg) && r.board1 === 'main', r);
  check('"How many" adds that many copies, then goes back to 1', r.sol === 3 && r.qtyReset === '1', r);
  check('"Paste a list" adds every card it finds', r.pasted.bolt === 4 && r.pasted.forest === 10, r.pasted);
  check('…and says which it couldn\'t find, leaving them in the box', /Added 14 cards/.test(r.pasteMsg) && /Not A Real Card/.test(r.pasteMsg) && /Not A Real Card/.test(r.left), [r.pasteMsg, r.left]);
  check('Undo takes the pasted cards back out', r.undone);
  check('other formats can add to the sideboard', JSON.stringify(r.side) === '["side:Grizzly Bears"]', r.side);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
