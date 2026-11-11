// deckseer.html is built from src/ (tools/build.js). The committed file must match what's in src/.
const { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
const { check } = require('./helpers');
module.exports = async function () {
  console.log('Build');
  const { build, order } = require('../tools/build.js');
  const html = fs.readFileSync(path.join(__dirname, '../deckseer.html'), 'utf8');
  check(`deckseer.html matches the ${order().length} files in src/`, build() === html);
  check('it is still one self-contained page (one inline script, one stylesheet)', (html.match(/<script>/g) || []).length === 1 && (html.match(/<style>/g) || []).length === 1);
};
