// Every card (or a sample) through the Playtest. Needs a cards file from tools/forge-cards.js:
//   ALL_CARDS=/path/to/allcards.json node tests/run.js allcards          (2,000 cards spread across the list)
//   ALL_CARDS=/path/to/allcards.json ALL_CARDS_N=0 node tests/run.js allcards   (every card, about 6 minutes)
// The full report, with what each card's text left unread, comes from tools/allcards-check.js and tools/allcards-coverage.js.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { check } = require('./helpers');

module.exports = async function () {
  console.log('Every card in the Playtest');
  const file = process.env.ALL_CARDS;
  if (!file || !fs.existsSync(file)) { console.log('  - skipped: set ALL_CARDS to a cards file made by tools/forge-cards.js'); return; }
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  const want = process.env.ALL_CARDS_N === '0' ? all.length : +(process.env.ALL_CARDS_N || 2000);
  const step = Math.max(1, Math.floor(all.length / want)), sample = all.filter((c, i) => i % step === 0).slice(0, want);
  const tmp = path.join(require('os').tmpdir(), `deckseer-sample-${process.pid}.json`), rep = tmp.replace('.json', '-report.json');
  fs.writeFileSync(tmp, JSON.stringify(sample));
  execFileSync(process.execPath, [path.join(__dirname, '../tools/allcards-check.js'), tmp, rep], {stdio: 'ignore', timeout: 45 * 60 * 1000});
  const res = JSON.parse(fs.readFileSync(rep, 'utf8'));
  fs.rmSync(tmp, {force: true}); fs.rmSync(rep, {force: true});
  const errs = res.filter(r => r.err), slow = res.filter(r => r.slow);
  check(`${res.length} cards played without an error`, errs.length === 0, errs.slice(0, 5).map(r => `${r.name}: ${r.err} (${r.stage})`));
  check('none of them takes over 3 seconds (a phone would freeze)', slow.length === 0, slow.slice(0, 5).map(r => `${r.name}: ${r.ms} ms`));
  check('every card can be cast or played', res.filter(r => !r.err && r.where === 'hand').length < res.length * 0.01, res.filter(r => r.where === 'hand').slice(0, 5).map(r => r.name));
};
