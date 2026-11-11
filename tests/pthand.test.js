// The Playtest on a phone: your hand stays at the bottom, and it scrolls sideways easily.
const { chromium, devices } = require('playwright');
const { openApp, check } = require('./helpers');
const { ashlingDeck } = require('./fixtures/ashling-cards');

module.exports = async function () {
  console.log('Playtest hand on a phone');
  const browser = await chromium.launch(); const context = await browser.newContext({...devices['Pixel 7']});
  const { page } = await openApp({browser, context});
  await page.evaluate(d => { const s = document.getElementById('setupDlg'); if (s && s.open) s.close(); decks.push(d); openPlaytest(d); }, ashlingDeck());
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('[data-pt=keep]').click(); for (let i = 0; i < 6; i++) ptDraw(1); ptRender(); });
  await page.waitForTimeout(200);
  const r = await page.evaluate(async () => {
    const hand = () => document.getElementById('ptHand').getBoundingClientRect(), main = document.querySelector('.pt-main'), out = {vh: innerHeight};
    out.bottom0 = Math.round(hand().bottom); main.scrollTop = 500; await new Promise(r => setTimeout(r, 50)); out.bottom1 = Math.round(hand().bottom); out.tableScrolled = main.scrollTop > 0;
    out.arrows = document.getElementById('ptHand').classList.contains('scrolls') && document.querySelector('[data-hscroll="-1"]').disabled;
    document.querySelector('[data-hscroll="1"]').click(); await new Promise(r => setTimeout(r, 700));
    out.arrowScroll = document.querySelector('.pt-hand-cards').scrollLeft; ptRender(); out.kept = document.querySelector('.pt-hand-cards').scrollLeft;
    document.querySelector('.pt-hand-cards').scrollLeft = 0; main.scrollTop = 0;
    return out;
  });
  check(`the hand stays at the bottom while the table scrolls (${r.bottom1} of ${r.vh}px)`, r.bottom0 === r.vh && r.bottom1 === r.vh && r.tableScrolled, r);
  check('‹ › buttons appear when the hand is wider than the screen, and scroll it', r.arrows && r.arrowScroll > 100, r);
  check('the hand stays scrolled where you left it when the table redraws', r.kept === r.arrowScroll, r);
  // real touches: a sideways swipe on a card scrolls; dragging a card up still plays it
  const cdp = await context.newCDPSession(page);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y}]});
  const drag = async (x0, y0, x1, y1) => { await t('touchStart', x0, y0); for (let i = 1; i <= 20; i++) { await t('touchMove', x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20); await page.waitForTimeout(16); } await t('touchEnd'); await page.waitForTimeout(400); };
  const at = await page.evaluate(() => { const c = document.querySelector('.pt-hand-cards .ptc:nth-child(3)').getBoundingClientRect(), b = document.getElementById('ptBf').getBoundingClientRect(); return {x: c.x + c.width / 2, y: c.y + c.height / 2, ty: b.y + 80}; });
  const st = () => page.evaluate(() => ({scroll: Math.round(document.querySelector('.pt-hand-cards').scrollLeft), hand: PT.hand.length, bf: PT.bf.length, ghost: !!document.querySelector('.pt-ghost')}));
  await drag(at.x, at.y, at.x - 220, at.y + 4); const s1 = await st();
  check(`swiping sideways on a card scrolls the hand (${s1.scroll}px) instead of picking the card up`, s1.scroll > 100 && s1.hand === 13 && !s1.ghost, s1);
  await page.evaluate(() => { document.querySelector('.pt-hand-cards').scrollLeft = 0; }); await page.waitForTimeout(100);
  await drag(at.x, at.y, at.x + 8, at.ty); const s2 = await st();
  check('dragging a card up onto the table still plays it', s2.hand === 12 && s2.bf === 1 && !s2.ghost, s2);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
