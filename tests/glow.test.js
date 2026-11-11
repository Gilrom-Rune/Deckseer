// The magical blue-and-white glow: on by default, can be turned off, and remembered.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Magical glow');
  const { browser, page } = await openApp();
  const r = await page.evaluate(() => {
    const out = {}, html = document.documentElement;
    out.on = html.classList.contains('glow');
    const panel = document.querySelector('.panel'); out.panelGlow = getComputedStyle(panel).boxShadow;
    out.edge = getComputedStyle(document.body, '::after').boxShadow;
    out.edgeClicks = getComputedStyle(document.body, '::after').pointerEvents;
    const box = document.getElementById('optGlow'); box.checked = false; box.dispatchEvent(new Event('change'));
    out.off = !html.classList.contains('glow'); out.saved = JSON.parse(localStorage.getItem('bsw-prefs')).glow;
    out.panelOff = getComputedStyle(panel).boxShadow;
    box.checked = true; box.dispatchEvent(new Event('change'));
    return out;
  });
  check('it\'s on by default', r.on);
  check('panels glow blue and white', /rgba\(60, 145, 255|rgba\(95, 175, 255/.test(r.panelGlow) && /255, 255, 255|215, 236, 255/.test(r.panelGlow), r.panelGlow);
  check('the edges of the screen glow, without blocking clicks', r.edge !== 'none' && r.edgeClicks === 'none', r);
  check('"✨ Magical glow" turns it off, and that\'s remembered', r.off && r.saved === false && !/145, 255/.test(r.panelOff), r);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
