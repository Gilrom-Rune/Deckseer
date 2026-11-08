#!/usr/bin/env node
// Turn Forge's card scripts (https://github.com/Card-Forge/forge, forge-gui/res/cardsfolder) into Deckseer card objects,
// for testing the Playtest against every card. The result is not part of Deckseer and isn't committed.
//   node tools/forge-cards.js <cardsfolder> <out.json>
// Get the folder with:
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/Card-Forge/forge.git
//   cd forge && git sparse-checkout set forge-gui/res/cardsfolder
const fs = require('fs'), path = require('path');
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node tools/forge-cards.js <cardsfolder> <out.json>'); process.exit(1); }

const SUPER = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Ongoing', 'Elite', 'Host']);
const TYPES = new Set(['Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment', 'Instant', 'Kindred', 'Tribal', 'Land', 'Phenomenon', 'Plane', 'Planeswalker', 'Scheme', 'Sorcery', 'Vanguard']);
// "Legendary Creature Elemental Sorcerer" → "Legendary Creature — Elemental Sorcerer"
function typeLine(t){
  const w = String(t || '').trim().split(/\s+/); let i = 0;
  while (i < w.length && (SUPER.has(w[i]) || TYPES.has(w[i]))) i++;
  return w.slice(0, i).join(' ') + (i < w.length ? ' — ' + w.slice(i).join(' ') : '');
}
// Forge mana: "2 R", "W U" (two pips), "WU" (hybrid), "2W", "WP" (Phyrexian), "X", "C", "S", "no cost"
function cost(m){
  if (!m || /no cost/i.test(m)) return '';
  return m.trim().split(/\s+/).map(s => {
    if (/^\d+$/.test(s) || /^[WUBRGCXSYZ]$/.test(s)) return `{${s}}`;
    if (/^[WUBRG]P$/.test(s)) return `{${s[0]}/P}`;
    if (/^2[WUBRG]$/.test(s)) return `{2/${s[1]}}`;
    if (/^[WUBRGC][WUBRG]$/.test(s)) return `{${s[0]}/${s[1]}}`;
    if (/^[WUBRG][WUBRG]P$/.test(s)) return `{${s[0]}/${s[1]}/P}`;
    return `{${s}}`;
  }).join('');
}
const mv = c => [...c.matchAll(/\{([^}]+)\}/g)].reduce((t, [, s]) => t + (/^\d+$/.test(s) ? +s : /^[XYZ]$/.test(s) ? 0 : s.startsWith('2/') ? 2 : 1), 0);
const COLOR_WORD = {white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G'};
const colorsOf = (c, colorLine) => {
  if (colorLine) return colorLine.split(',').map(x => COLOR_WORD[x.trim().toLowerCase()]).filter(Boolean);
  return ['W', 'U', 'B', 'R', 'G'].filter(x => new RegExp(`\\{(?:[^}]*\\/)?${x}(?:\\/[^}]*)?\\}`).test(c));
};
// Forge writes loyalty abilities as "[+1]: …"; printed cards say "+1: …" (with a real minus sign)
const oracle = s => String(s || '').replace(/\\n/g, '\n').replace(/^\[([+−-]?)(\d+|X)\]:/gm, (m, sg, n) => `${sg === '-' ? '−' : sg}${n}:`);
function face(block){
  const f = {};
  for (const line of block.split(/\r?\n/)) { const m = line.match(/^(Name|ManaCost|Types|PT|Loyalty|Defense|Oracle|Color|AlternateMode):(.*)$/); if (m && f[m[1]] == null) f[m[1]] = m[2].trim(); }
  const [p, t] = (f.PT || '').split('/');
  const c = cost(f.ManaCost);
  return {name: f.Name, cost: c, type: typeLine(f.Types), text: oracle(f.Oracle), power: p ?? '', toughness: t ?? '', loyalty: f.Loyalty || '', defense: f.Defense || '', colors: colorsOf(c, f.Color), mode: f.AlternateMode || ''};
}
const cards = [];
for (const sub of fs.readdirSync(dir)) {
  const d = path.join(dir, sub); if (!fs.statSync(d).isDirectory()) continue;
  for (const file of fs.readdirSync(d)) {
    if (!file.endsWith('.txt')) continue;
    const raw = fs.readFileSync(path.join(d, file), 'utf8');
    const faces = raw.split(/\r?\n\s*ALTERNATE\s*\r?\n/).map(face).filter(f => f.name);
    if (!faces.length) continue;
    const a = faces[0], mode = a.mode;
    if (/^(Token|Planar|Scheme)/i.test(a.type) || /\bToken\b/.test(a.type) || /^(Plane|Scheme|Phenomenon|Vanguard|Conspiracy|Dungeon)\b/.test(a.type.replace(/^Ongoing /, ''))) continue;
    let card;
    if (faces.length > 1 && /^(Split|Modal|DoubleFaced|Transform|Adventure|Omen|Flip|Meld|Specialize)/i.test(mode)) {
      const b = faces[1], both = /^(Split|Modal|Adventure|Omen)/i.test(mode);
      card = {name: `${a.name} // ${b.name}`, type: `${a.type} // ${b.type}`, cost: both ? [a.cost, b.cost].filter(Boolean).join(' // ') : a.cost,
        text: `${a.name}\n${a.text}\n\n${b.name}\n${b.text}`, power: a.power, toughness: a.toughness, loyalty: a.loyalty, defense: a.defense,
        colors: [...new Set(a.colors.concat(both ? b.colors : []))], layout: mode.toLowerCase()};
    } else card = Object.assign({}, a, {layout: 'normal'});
    delete card.mode;
    card.cmc = mv(card.cost.split(' // ')[0]);
    card.ci = [...new Set(card.colors.concat(['W', 'U', 'B', 'R', 'G'].filter(x => new RegExp(`\\{(?:[^}]*\\/)?${x}(?:\\/[^}]*)?\\}`).test(card.text))))];
    cards.push(card);
  }
}
cards.sort((x, y) => x.name.localeCompare(y.name));
fs.writeFileSync(out, JSON.stringify(cards));
console.log(`${cards.length} cards → ${out}`);
