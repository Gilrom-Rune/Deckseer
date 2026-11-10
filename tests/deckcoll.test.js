// Renaming a deck, and putting an imported or scanned deck's cards into the collection.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Deck name and collection');
  const { browser, page } = await openApp();
  const r = await page.evaluate(async () => {
    const out = {};
    const card = (name, qty, extra) => Object.assign({sid: 'id-' + name, name, set: 'tst', setName: 'Test', number: '1', qty, board: 'main', foil: false, type: 'Creature', text: '', cmc: 2, ci: [], colors: [], legal: {}, img: '', finishes: ['nonfoil'], usd: 1, usdF: null, eur: null, eurF: null}, extra || {});
    coll.clear(); saveColl();
    const d = newDeck('Old name', 'casual');
    d.cards.push(card('Grizzly Bears', 3), card('Forest', 10), card('Shock', 2, {board: 'side'}));
    saveDecks();
    // you already own one Grizzly Bears (another printing, another list)
    putEntry({sid: 'other', name: 'Grizzly Bears', set: 'xyz', number: '9', foil: false, cond: 'NM', list: 'Binder', qty: 1, usd: 1, type: 'Creature', colors: []}); saveColl();
    prefs.deckView = d.id; savePrefs(); showPage('builder'); renderDeck();
    // rename: the button focuses the name box; a change renames everywhere
    document.getElementById('deckRename').click();
    out.focused = document.activeElement && document.activeElement.id === 'deckName';
    const inp = document.getElementById('deckName'); inp.value = '  New name  '; inp.dispatchEvent(new Event('change', {bubbles: true}));
    out.name = deckById(d.id).name;
    out.picker = [...document.getElementById('deckSel').options].some(o => o.textContent.includes('New name'));
    out.stored = JSON.parse(localStorage.getItem('bsw-decks')).some(x => x.name === 'New name');
    // the collection button counts what's missing: 2 Bears + 10 Forests + 2 Shocks
    out.badge = (document.querySelector('#deckColl .coll-n') || {}).textContent;
    document.getElementById('deckColl').click();
    out.box = (document.getElementById('deckCollBox') || {}).textContent || '';
    document.getElementById('deckCollMissing').click();
    const owned = n => [...coll.values()].filter(e => e.name === n).reduce((t, e) => t + e.qty, 0);
    out.after = {bears: owned('Grizzly Bears'), forest: owned('Forest'), shock: owned('Shock')};
    out.allIn = (document.getElementById('deckColl') || {}).textContent;
    out.savedColl = (JSON.parse(localStorage.getItem('bsw-coll') || '[]') || []).length;
    // undo puts the collection back
    document.getElementById('toastBtn').click();
    out.undone = {bears: owned('Grizzly Bears'), forest: owned('Forest')};
    // "add all anyway" adds every copy, even ones you own
    deckToColl(deckById(d.id), true);
    out.all = {bears: owned('Grizzly Bears'), forest: owned('Forest')};
    // stopping a scan without "also add to collection" offers it
    deckToColl(deckById(d.id), false);
    deckById(d.id).cards.push(card('Llanowar Elves', 1));
    prefs.deckAlsoColl = false; setScanTarget(d.id); renderDeck();
    document.getElementById('deckStop').click();
    out.offer = {msg: document.getElementById('toastMsg').textContent, btn: document.getElementById('toastBtn').textContent};
    document.getElementById('toastBtn').click();
    out.offerOpens = !!document.getElementById('deckCollBox');
    return out;
  });
  check('the Rename button puts you in the name box', r.focused, r);
  check('renaming a deck saves it everywhere', r.name === 'New name' && r.picker && r.stored, r);
  check(`"Add to collection" shows how many cards are missing (${r.badge})`, r.badge === '14', r.badge);
  check('it lists them', /14.*aren't in your collection/.test(r.box) && /2× Grizzly Bears/.test(r.box), r.box);
  check('only the missing copies are added', JSON.stringify(r.after) === '{"bears":3,"forest":10,"shock":2}', r.after);
  check('then it says they\'re all in', /In your collection/.test(r.allIn), r.allIn);
  check('Undo takes them back out', JSON.stringify(r.undone) === '{"bears":1,"forest":0}', r.undone);
  check('"Add all anyway" adds every copy', JSON.stringify(r.all) === '{"bears":4,"forest":10}', r.all);
  check('stopping a scan offers to add what\'s missing', /1 card isn't in your collection/.test(r.offer.msg) && r.offer.btn === 'Add to collection', r.offer);
  check('…and the offer opens the add panel', r.offerOpens);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
