const fs = require('fs');
const [,, dir] = process.argv;
const tree = JSON.parse(fs.readFileSync(dir + '/dl/tree.json', 'utf8')).tree.map((x) => x.path);
const names = JSON.parse(fs.readFileSync(dir + '/dl/names.json', 'utf8'));
const needed = JSON.parse(fs.readFileSync(dir + '/needed.json', 'utf8'));
const strip = (s) => s.replace(/\uFE0F/g, '');
const byStripped = {}; for (const k of Object.keys(names)) byStripped[strip(k)] = names[k];
const norm = (s) => s.toLowerCase().replace(/[’'"]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const pngs = tree.filter((p) => /\/3D\/[^/]+\.png$/.test(p));
const byFolder = {};
for (const p of pngs) {
  const folder = p.split('/')[1];
  const key = norm(folder);
  const isDefault = p.includes('/Default/3D/');
  const hasTone = /\/(Light|Medium|Dark|Medium-Light|Medium-Dark)\//.test(p);
  if (hasTone) continue;
  if (!byFolder[key] || isDefault) byFolder[key] = p;
}
const out = {}, miss = [];
for (const e of needed) {
  const n = names[e] || byStripped[strip(e)];
  const key = n ? norm(n.name) : null;
  const hit = key && byFolder[key];
  if (hit) out[e] = hit; else miss.push(e + ' ' + (n ? n.name : '?'));
}
fs.writeFileSync(dir + '/mapping.json', JSON.stringify(out, null, 1));
console.log('mapped', Object.keys(out).length, '/', needed.length);
console.log('MISSING:\n' + miss.join('\n'));
