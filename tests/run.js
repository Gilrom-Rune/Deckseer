// Run every *.test.js in this folder:  node tests/run.js   (or: node tests/run.js backup)
const fs = require('fs'), path = require('path');
const { summary, crashed } = require('./helpers');
// deckseer.html is built from src/: build it first, so the tests always run what's in src/
require('child_process').execFileSync(process.execPath, [path.join(__dirname, '../tools/build.js')], {stdio: 'inherit'});
(async () => {
  const only = process.argv[2];
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only || f.includes(only))).sort()) {
    try { await require(path.join(__dirname, f))(); } catch (e) { crashed(f + ' crashed: ' + (e.stack || e)); }
  }
  const s = summary(); console.log(`\n${s.passes} passed, ${s.failures} failed`); process.exit(s.failures ? 1 : 0);   // exit even if a crashed test left a browser open
})();
