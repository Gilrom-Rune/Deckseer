#!/usr/bin/env node
// Builds deckseer.html from the pieces in src/:  node tools/build.js   (the tests run it first)
//   src/page/1-head.html  <!doctype>, <head>, ending with <style>
//   src/css/*.css         the stylesheet, in file-name order
//   src/page/2-body.html  </style></head><body>: the page's markup and dialogs, ending with <script>
//   src/js/*.js           the app, in file-name order (one script: later files can use anything from earlier ones)
//   src/page/3-end.html   </script></body></html>
// deckseer.html stays one self-contained file (that's what people download and what GitHub Pages serves), so
// edit src/ and build; never edit deckseer.html by hand. If it was edited directly, the build stops instead of
// overwriting those edits (move them into src/, or pass --force to throw them away).
//   --check  only says whether deckseer.html is up to date with src/ (exit code 1 if not)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'src'), out = path.join(root, 'deckseer.html'), stamp = path.join(src, '.last-build');
const list = dir => fs.readdirSync(path.join(src, dir)).filter(f => !f.startsWith('.')).sort().map(f => path.join(dir, f));
const order = () => ['page/1-head.html', ...list('css'), 'page/2-body.html', ...list('js'), 'page/3-end.html'];
const build = () => order().map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
module.exports = {build, order};
if (require.main === module) {
  const args = process.argv.slice(2), html = build(), cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (args.includes('--check')) { const ok = cur === html; console.log(ok ? 'deckseer.html is up to date with src/' : 'deckseer.html differs from src/: run node tools/build.js'); process.exit(ok ? 0 : 1); }
  if (cur === html) { fs.writeFileSync(stamp, sha(html) + '\n'); process.exit(0); }
  const last = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : '';
  if (cur && last && sha(cur) !== last && !args.includes('--force')) {
    console.error('deckseer.html was changed directly since the last build. Move those changes into src/ (or run with --force to discard them).');
    process.exit(1);
  }
  fs.writeFileSync(out, html); fs.writeFileSync(stamp, sha(html) + '\n');
  console.log(`Built deckseer.html from ${order().length} files (${(html.length / 1024).toFixed(0)} KB).`);
}
