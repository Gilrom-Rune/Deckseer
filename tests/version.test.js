// The version in deckseer.html and version.json must match (run `node tools/bump-version.js` before uploading).
const fs = require('fs'), path = require('path');
const { check } = require('./helpers');
module.exports = async function () {
  console.log('Version');
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'deckseer.html'), 'utf8').match(/const APP_VERSION = "([^"]*)";/);
  const json = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;
  check(`deckseer.html and version.json agree (${json})`, html && html[1] === json, [html && html[1], json]);
};
