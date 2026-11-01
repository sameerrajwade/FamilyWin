const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const m = JSON.parse(fs.readFileSync(dir + '/mapping.json', 'utf8'));
fs.mkdirSync(dir + '/dl/png', { recursive: true });
const base = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/';
(async () => {
  let ok = 0, fail = [];
  const entries = Object.entries(m);
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(entries.slice(i, i + 8).map(async ([e, p]) => {
      if (fs.existsSync(path.join(dir, 'dl/png', path.basename(p)))) { ok++; return; }
      const url = base + p.split('/').map(encodeURIComponent).join('/');
      for (let a = 0; a < 3; a++) {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(r.status);
          const out = path.join(dir, 'dl/png', path.basename(p));
          fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
          ok++; return;
        } catch (err) { if (a === 2) fail.push(e + ' ' + err.message); }
      }
    }));
  }
  const lic = await fetch(base + 'LICENSE');
  fs.writeFileSync(dir + '/dl/LICENSE', await lic.text());
  console.log('downloaded', ok, 'failed', fail.length, fail.join(', '));
})();
