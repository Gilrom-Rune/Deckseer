// Run before uploading a change:  node tools/bump-version.js
// Sets the version (APP_VERSION, in src/js/) and version.json to today's date plus a counter, e.g. 2026.11.07.2,
// then rebuilds deckseer.html.
// Open copies of Deckseer compare version.json with their own APP_VERSION and offer "Reload" when they differ.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), json = path.join(root, 'version.json');
const jsDir = path.join(root, 'src', 'js'), html = path.join(jsDir, fs.readdirSync(jsDir).find(f => /const APP_VERSION = /.test(fs.readFileSync(path.join(jsDir, f), 'utf8'))) || 'missing');
const d = new Date(), today = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
let cur = ''; try { cur = JSON.parse(fs.readFileSync(json, 'utf8')).version; } catch (e) {}
const n = cur.startsWith(today + '.') ? +cur.split('.').pop() + 1 : 1;
const v = `${today}.${n}`;
let s = fs.readFileSync(html, 'utf8');
if (!/const APP_VERSION = "[^"]*";/.test(s)) throw new Error('APP_VERSION not found in src/js/');
s = s.replace(/const APP_VERSION = "[^"]*";/, `const APP_VERSION = "${v}";`);
fs.writeFileSync(html, s);
fs.writeFileSync(json, JSON.stringify({version: v}) + '\n');
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')], {stdio: 'inherit'});
console.log('Deckseer version', v);
