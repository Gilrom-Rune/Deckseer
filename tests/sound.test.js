// The "valuable card" sound: a cash-register ka-ching, and a button to hear it.
const { openApp, check } = require('./helpers');

module.exports = async function () {
  console.log('Valuable card sound');
  const { browser, page } = await openApp();
  const r = await page.evaluate(async () => {
    const ac = new OfflineAudioContext(1, 44100 * 1.4, 44100); kaching(ac, 0);
    const d = (await ac.startRendering()).getChannelData(0);
    let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x));
    const rms = s => { let t = 0; const i0 = Math.floor(s * 44100); for (let i = i0; i < i0 + 2205; i++) t += d[i] * d[i]; return Math.sqrt(t / 2205); };
    let called = 0; const real = window.kaching; window.kaching = () => { called++; };
    const was = prefs.sound; prefs.sound = false; document.getElementById('optHear').click(); const after = prefs.sound; prefs.sound = was; window.kaching = real;
    return {peak, ka: rms(0.02), ching: rms(0.15), tail: rms(1.2), called, after, was};
  });
  check(`it makes a sound that doesn't clip (peak ${r.peak.toFixed(2)})`, r.peak > 0.2 && r.peak < 1, r);
  check('a "ka" then a ringing "ching" that fades out', r.ka > 0.01 && r.ching > r.tail * 10 && r.tail < 0.01, r);
  check('"Hear it" plays it even with sounds off, and leaves the setting alone', r.called === 1 && r.after === false, r);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
