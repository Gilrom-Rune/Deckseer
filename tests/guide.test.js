// The step-by-step guide: every step opens, and every "Show me" finds and highlights its target.
const { openApp, check } = require('./helpers');
const c = (name, type, cost, cmc, text, colors, extra) => Object.assign({name, type, cost, cmc, text, colors, ci: colors, qty: 1, board: 'main', power: '', toughness: ''}, extra || {});
const DECK = {id: 'dG', name: 'Guide deck', format: 'commander', created: 1, updated: 1, commanders: [c('Big Commander', 'Legendary Creature — Giant', '{2}{G}', 3, '', ['G'], {power: '4', toughness: '4'})],
  cards: [c('Forest', 'Basic Land — Forest', '', 0, '', [], {qty: 40}), c('Beast', 'Creature — Beast', '{2}{G}', 3, '', ['G'], {power: '3', toughness: '3', qty: 59})]};

module.exports = async function () {
  console.log('Guide');
  const { browser, page } = await openApp();
  await page.evaluate(d => { localStorage.setItem('bsw-decks', JSON.stringify([d])); }, DECK);
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#guideOpen');
  check('the Guide button opens the guide', await page.isVisible('#tour'));
  const total = await page.evaluate(() => GUIDE.reduce((s, ch) => s + ch.steps.length, 0));
  const misses = [], seen = [];
  for (let i = 0; i < total; i++) {
    const step = await page.evaluate(() => { const g = guideState(); return {ch: g.ch, st: g.st, h: document.querySelector('.gd-h').textContent, go: GUIDE[g.ch].steps[g.st].go || null}; });
    seen.push(step.h);
    if (step.go) {
      await page.click('#guideShow'); await page.waitForTimeout(250);
      const ok = await page.evaluate(id => { const el = document.getElementById(id); return !!el && el.classList.contains('guide-hl'); }, step.go.el);
      if (!ok) misses.push(`${step.h} → #${step.go.el}`);
    }
    if (i < total - 1) await page.click('#guideNext');
  }
  check(`all ${total} steps can be stepped through`, seen.length === total && new Set(seen).size === total, seen.length);
  check('every "Show me" finds and highlights its target', misses.length === 0, misses);
  // the AI and Picture library steps open their settings
  const opened = await page.evaluate(() => { const g = GUIDE.findIndex(c => /AI and Picture library/.test(c.t)); openGuide(g, 2); guideShow(GUIDE[g].steps[2].go); return new Promise(r => setTimeout(() => r({ai: document.getElementById('setDlg').open && !document.getElementById('aiPicBox').hidden}), 300)); });
  check('the AI step opens Settings on AI picture recognition', opened.ai, opened);
  // where you stopped is remembered; Finish closes it
  await page.click('#guideNext'); const before = await page.evaluate(() => guideState());
  await page.reload(); await page.waitForTimeout(400); await page.click('#guideOpen');
  const after = await page.evaluate(() => guideState());
  check('it reopens where you stopped', after.ch === before.ch && after.st === before.st, [before, after]);
  await page.keyboard.press('Escape');
  check('Esc closes it', !(await page.isVisible('#tour')));
  await page.evaluate(() => openGuide(GUIDE.length - 1, GUIDE[GUIDE.length - 1].steps.length - 1));
  await page.click('#guideNext');
  check('Finish closes it and marks chapters done', !(await page.isVisible('#tour')) && await page.evaluate(() => Object.keys(guideState().done).length >= 1));
  // phone width: fits the screen
  await page.setViewportSize({width: 390, height: 800}); await page.evaluate(() => openGuide(0, 0));
  const box = await page.locator('#tour').boundingBox();
  check('fits a phone screen', box.x >= 0 && box.x + box.width <= 390, box);
  check('the camera\'s own outline box (#guide) is untouched', await page.evaluate(() => document.getElementById('guide').closest('#cam') !== null));
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
