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
  // your own sound: a short WAV picked with the file box
  const n = 4410, buf = Buffer.alloc(44 + n * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(44100, 24); buf.writeUInt32LE(88200, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 10) * 8000), 44 + i * 2);
  await page.evaluate(() => { window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src.slice(0, 20)); return Promise.resolve(); }; });
  await page.setInputFiles('#optOwnFile', {name: 'my-kaching.wav', mimeType: 'audio/wav', buffer: buf});
  await page.waitForFunction(() => !!localStorage.getItem('bsw-kaching'), null, {timeout: 5000}).catch(() => {});
  const own = await page.evaluate(() => {
    const before = window.__plays.length; let synth = 0; const real = window.kaching; window.kaching = () => { synth++; };
    prefs.sound = true; sound('valuable'); window.kaching = real;
    const info = document.getElementById('optOwnInfo').textContent;
    document.getElementById('optOwnReset').click();
    return {saved: (JSON.parse(localStorage.getItem('bsw-kaching') || 'null') || {}).name, played: window.__plays.length - before, synth, info, reset: localStorage.getItem('bsw-kaching') === null, btn: document.getElementById('optOwnSnd').textContent};
  });
  check('"Use my own sound" plays the file you pick for valuable cards', own.played === 1 && own.synth === 0 && /my-kaching\.wav/.test(own.info), own);
  check('…and you can go back to the built-in ka-ching', own.reset && /Use my own sound/.test(own.btn), own);
  check('no page errors', page.errors.length === 0, page.errors);
  await browser.close();
};
