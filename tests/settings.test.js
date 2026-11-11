// ⚙ Settings: learning from scans, Picture library, AI picture recognition and Ask Claude, as tabs in one window.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Settings window');
  const { browser, page } = await openApp();
  const r = await page.evaluate(async () => {
    const out = {}, dlg = document.getElementById('setDlg');
    // every on/off option lives in Settings, not on the pages
    out.moved = ['optAdd', 'optLow', 'optCur', 'optSound', 'optAlert', 'optHear', 'optOwnSnd', 'optGlow', 'optBgfx', 'deckAlsoColl'].filter(id => !dlg.contains(document.getElementById(id)));
    const inp = document.getElementById('deckAlsoColl'); inp.checked = true; inp.dispatchEvent(new Event('change'));
    out.deckInfo = document.getElementById('deckAlsoCollInfo').textContent; inp.checked = false; inp.dispatchEvent(new Event('change'));
    const s = document.getElementById('setupDlg'); if (s && s.open) s.close();
    out.inDlg = ['memBox', 'libBox', 'aiPicBox', 'aiBox'].every(id => dlg.contains(document.getElementById(id)));
    out.notOnScanner = !document.querySelector('.panel.opts #libBox');
    document.getElementById('settingsOpen').click();
    out.open = dlg.open;
    out.tabs = [...dlg.querySelectorAll('.set-tab .set-tl')].map(t => t.textContent.replace(/^\W+\s*/u, ''));
    dlg.querySelector('[data-settab="aiPicBox"]').click();
    out.shown = ['memBox', 'libBox', 'aiPicBox', 'aiBox'].filter(id => !document.getElementById(id).hidden);
    out.load = !!document.getElementById('aiPicFiles') && dlg.contains(document.getElementById('aiPicFiles'));
    out.state = document.getElementById('libSummaryState').closest('.set-tab') !== null;
    document.getElementById('setClose').click(); out.closed = !dlg.open;
    // it reopens on the tab you were on, and the scanner's button opens it too
    showPage('scanner'); document.getElementById('settingsOpen2').click();
    out.remembered = !document.getElementById('aiPicBox').hidden; dlg.close();
    out.summary = document.getElementById('setSummary').textContent;
    // the guide's "Show me" for the Picture library opens Settings on that tab
    guideShow({page: 'scanner', el: 'libBox'}); await new Promise(r => setTimeout(r, 300));
    out.guide = dlg.open && !document.getElementById('libBox').hidden; dlg.close();
    return out;
  });
  check('the three scanner sections (and Ask Claude) moved into the Settings window', r.inDlg && r.notOnScanner, r);
  check('every on/off option is in Settings', r.moved.length === 0, r.moved);
  check('the deck builder says where scanned cards go, with a link to the setting', /also go into your collection/.test(r.deckInfo), r.deckInfo);
  check('the ⚙ button opens it', r.open);
  check('one tab each', r.tabs.join('|') === 'Scanning|Sounds|Look|Learning from scans|Picture library|AI picture recognition|Ask Claude', r.tabs);
  check('a tab shows only its own settings, with its buttons working there', r.shown.join() === 'aiPicBox' && r.load, r);
  check('each tab shows its state (on, off, learning…)', r.state);
  check('it closes, and reopens on the same tab from the scanner\'s button', r.closed && r.remembered, r);
  check('the scanner shows a one-line summary', /Learning: .*Picture library: .*AI: /.test(r.summary), r.summary);
  check('the guide\'s "Show me" opens Settings on the right tab', r.guide);
  await page.setViewportSize({width: 390, height: 844});
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`on a phone the header still fits (${w}px wide)`, w <= 390, w);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
