// Backup saves everything that's yours; Restore brings it all back (and can be undone).
const fs = require('fs');
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Backup and restore');
  const { browser, context, page } = await openApp();

  // Put some of everything into the browser, then reload so the app reads it.
  await page.evaluate(async () => {
    const card = {name: 'Sol Ring', set: 'cmm', number: '1', qty: 2, cond: 'NM', list: 'Collection', usd: 1.5};
    localStorage.setItem('bsw-coll', JSON.stringify([['k1', card]]));
    localStorage.setItem('bsw-decks', JSON.stringify([{id: 'd1', name: 'Ashling', format: 'commander', commanders: [], cards: [], created: 1, updated: 1}]));
    localStorage.setItem('bsw-wish', JSON.stringify([{name: 'Mana Crypt', target: 100}]));
    localStorage.setItem('bsw-games', JSON.stringify([{t: 1, players: [{name: 'You'}], winner: 0}]));
    localStorage.setItem('bsw-gsetup', JSON.stringify({n: 3, life: 30, names: ['You', 'Sam', 'Jo'], decks: ['', '', '']}));
    localStorage.setItem('bsw-sess', JSON.stringify({started: 5, items: [{name: 'Sol Ring'}]}));
    const p = JSON.parse(localStorage.getItem('bsw-prefs') || '{}'); p.cond = 'LP'; p.cam = 'camera-123';
    localStorage.setItem('bsw-prefs', JSON.stringify(p));
    const v = new Float32Array(VEC_N); for (let i = 0; i < v.length; i++) v[i] = Math.sin(i);
    await idb.put('vecs', 'mem|abc|0', v); await idb.put('vecs', 'learn2|abc', v);
    await idb.put('kv', 'memMeta', {abc: {name: 'Sol Ring', set: 'cmm', number: '1', t: 1, n: 1}});
  });
  await page.reload(); await page.waitForTimeout(500);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backup').click())]);
  const file = await dl.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('backup is version 4', data.version === 4, data.version);
  check('backup has the collection', data.coll.length === 1 && data.coll[0][1].name === 'Sol Ring');
  check('backup has decks', data.decks.length === 1);
  check('backup has the wishlist', data.wish && data.wish[0].name === 'Mana Crypt');
  check('backup has game results', data.games && data.games.length === 1);
  check('backup has game setup', data.gsetup && data.gsetup.n === 3);
  check('backup has the scan session', data.session.items.length === 1);
  check('backup has preferences, without the camera', data.prefs.cond === 'LP' && data.prefs.cam === '');
  check('backup has scan memory', data.mem && data.mem.meta.abc && data.mem.looks['abc|0'] && data.mem.learn.abc);

  // Wipe everything (like a brand-new install), then restore.
  await page.evaluate(async () => {
    localStorage.clear();
    for (const [k] of await idb.entries('vecs')) await idb.del('vecs', k);
    await idb.del('kv', 'memMeta');
    localStorage.setItem('bsw-prefs', JSON.stringify({cam: 'new-pc-camera'}));
  });
  await page.reload(); await page.waitForTimeout(400);
  await Promise.all([page.waitForNavigation(), page.setInputFiles('#restore', file)]);
  await page.waitForTimeout(800);
  const after = await page.evaluate(async () => {
    const v = await idb.get('vecs', 'mem|abc|0');
    return { coll: coll.size, decks: decks.length, wish: wish.length, games: games.length, gsetupN: gameSetup.n,
      sess: session.items.length, cond: prefs.cond, cam: prefs.cam, memNames: Object.keys(memMeta), vecOk: !!v && Math.abs(v[1] - Math.sin(1)) < 1e-6,
      learned: learned.has('abc'), toast: document.getElementById('toastMsg').textContent, toastBtn: document.getElementById('toastBtn').textContent };
  });
  check('restore brings back the collection', after.coll === 1, after);
  check('restore brings back decks, wishlist, games, setup, session', after.decks === 1 && after.wish === 1 && after.games === 1 && after.gsetupN === 3 && after.sess === 1, after);
  check('restore brings back preferences but keeps this PC\'s camera', after.cond === 'LP' && after.cam === 'new-pc-camera', after);
  check('restore brings back scan memory exactly', after.memNames.includes('abc') && after.vecOk && after.learned, after);
  check('restore shows what it restored, with Undo', /Restored 1 collection rows/.test(after.toast) && after.toastBtn === 'Undo', after.toast);

  // Undo puts the empty state back.
  await Promise.all([page.waitForNavigation(), page.evaluate(() => document.getElementById('toastBtn').click())]);
  await page.waitForTimeout(800);
  const undone = await page.evaluate(async () => ({ coll: coll.size, wish: wish.length, mem: Object.keys(memMeta).length, cam: prefs.cam,
    vec: !!(await idb.get('vecs', 'mem|abc|0')), toast: document.getElementById('toastMsg').textContent }));
  check('undo puts everything back as before the restore', undone.coll === 0 && undone.wish === 0 && undone.mem === 0 && !undone.vec && undone.cam === 'new-pc-camera', undone);

  // An old (version 3) backup still restores and leaves newer things alone.
  await page.evaluate(() => localStorage.setItem('bsw-wish', JSON.stringify([{name: 'Keep me'}])));
  const old = {app: 'binder-scanner', version: 3, exported: '', coll: [['k2', {name: 'Island', set: 'unf', number: '1', qty: 4, list: 'Collection'}]], lists: ['Collection'], hist: [], session: {started: 1, items: []}, decks: []};
  const oldFile = require('path').join(require('os').tmpdir(), 'cs-old-backup.json'); fs.writeFileSync(oldFile, JSON.stringify(old));
  await page.reload(); await page.waitForTimeout(300);
  await Promise.all([page.waitForNavigation(), page.setInputFiles('#restore', oldFile)]);
  await page.waitForTimeout(600);
  const v3 = await page.evaluate(() => ({ coll: [...coll.values()].map(e => e.name), wish: wish.map(w => w.name), toast: document.getElementById('toastMsg').textContent }));
  check('old version-3 backups still restore', v3.coll.join() === 'Island', v3);
  check('old backups leave the wishlist alone', v3.wish.join() === 'Keep me', v3);

  // A file that isn't a backup changes nothing.
  const bad = require('path').join(require('os').tmpdir(), 'cs-bad.json'); fs.writeFileSync(bad, '{"hello":1}');
  await page.setInputFiles('#restore', bad); await page.waitForTimeout(300);
  check('a wrong file is refused', /isn't a Deckseer backup/.test(await page.textContent('#toastMsg')));
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
