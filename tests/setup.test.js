// The first-start popup that offers the card pictures and the AI files.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Start-up downloads popup');
  const { browser, context, page } = await openApp();
  check('not shown under test automation by default', !(await page.evaluate(() => document.getElementById('setupDlg').open)));
  await context.addInitScript(() => { window.DECKSEER_SETUP = true; });
  await page.reload(); await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({open: document.getElementById('setupDlg').open, nb: document.getElementById('suAiNb').href, lib: document.getElementById('suLibGo').textContent}));
  check('it opens on first start', st.open, st);
  check('it links to the notebook in Google Colab', st.nb === 'https://colab.research.google.com/github/Gilrom-Rune/Deckseer/blob/main/stage2/Deckseer_Stage2_Index.ipynb', st.nb);
  check('it offers the card pictures', st.lib === 'Download card pictures', st.lib);
  // the Colab link points at a notebook that really is in the repository
  check('the linked notebook exists', require('fs').existsSync(require('path').resolve(__dirname, '../stage2/Deckseer_Stage2_Index.ipynb')));
  // Download card pictures starts the Picture library, with the chosen cards
  const started = await page.evaluate(async () => {
    let called = null; const real = buildLibrary;
    buildLibrary = async () => { called = document.getElementById('libScope').value; };
    document.getElementById('suLibScope').value = 'all'; document.getElementById('suLibScope').dispatchEvent(new Event('change'));
    document.getElementById('suLibGo').click(); await new Promise(r => setTimeout(r, 100));
    buildLibrary = real; return called;
  });
  check('Download card pictures builds the Picture library with the chosen cards', started === 'all', started);
  await page.click('#setupClose');
  check('Done for now closes it', !(await page.evaluate(() => document.getElementById('setupDlg').open)));
  await page.reload(); await page.waitForTimeout(800);
  check('it isn\'t shown again on the next start', !(await page.evaluate(() => document.getElementById('setupDlg').open)));
  await page.click('#setupOpen');
  check('the Downloads button opens it again', await page.evaluate(() => document.getElementById('setupDlg').open));
  await page.click('#suAiHow'); await page.waitForTimeout(300);
  const g = await page.evaluate(() => ({tour: !document.getElementById('tour').hidden, h: document.querySelector('.gd-h').textContent, dlg: document.getElementById('setupDlg').open}));
  check('Show me how opens the guide at the AI steps', g.tour && /AI picture recognition/.test(g.h) && !g.dlg, g);
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('bsw-prefs') || '{}'); delete p.seenSetup; localStorage.setItem('bsw-prefs', JSON.stringify(p)); });
  await page.reload(); await page.waitForTimeout(800);
  check('shown again after the setting is cleared', await page.evaluate(() => document.getElementById('setupDlg').open));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('…and stays closed', await page.evaluate(() => !document.getElementById('setupDlg').open && JSON.parse(localStorage.getItem('bsw-prefs')).seenSetup === true));
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
