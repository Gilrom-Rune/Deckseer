// The collection's card type filter: only lands, basics, nonbasics, everything but lands, creatures…
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Collection: card type filter');
  const { browser, page } = await openApp();
  const r = await page.evaluate(() => {
    coll.clear();
    const add = (name, type) => putEntry({sid: 'id-' + name, name, set: 'tst', number: '1', foil: false, cond: 'NM', list: 'Collection', qty: 1, usd: 1, type, colors: []});
    add('Forest', 'Basic Land — Forest'); add('Snow-Covered Island', 'Basic Snow Land — Island'); add('Command Tower', 'Land');
    add('Emeria\'s Call // Emeria, Shattered Skyclave', 'Sorcery // Land'); add('Grizzly Bears', 'Creature — Bear'); add('Sol Ring', 'Artifact');
    add('Plains', '');   // an old entry saved before types were kept
    saveColl(); showPage('collection'); setView && setView('coll');
    const sel = document.getElementById('fType'), out = {};
    for (const v of ['land', 'basic', 'nonbasic', 'nonland', 'creature', 'sorcery', '']) { sel.value = v; sel.dispatchEvent(new Event('change')); out[v || 'all'] = filteredRows().map(([, c]) => c.name.split(' //')[0]).sort().join(', '); }
    sel.value = 'land'; sel.dispatchEvent(new Event('change'));
    out.saved = JSON.parse(localStorage.getItem('bsw-prefs')).fType;
    out.shown = document.getElementById('tableWrap').textContent.includes('Command Tower') && !document.getElementById('tableWrap').textContent.includes('Grizzly Bears');
    return out;
  });
  check('"Lands" shows only lands (double-faced ones too)', r.land === "Command Tower, Emeria's Call, Forest, Plains, Snow-Covered Island", r.land);
  check('"Basic lands" and "Nonbasic lands"', r.basic === 'Forest, Plains, Snow-Covered Island' && r.nonbasic === "Command Tower, Emeria's Call", [r.basic, r.nonbasic]);
  check('"Everything but lands"', r.nonland === 'Grizzly Bears, Sol Ring', r.nonland);
  check('other types', r.creature === 'Grizzly Bears' && r.sorcery === "Emeria's Call", [r.creature, r.sorcery]);
  check('"All card types" shows everything', r.all.split(', ').length === 7, r.all);
  check('the table shows the filtered cards, and the choice is remembered', r.shown && r.saved === 'land', r);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
