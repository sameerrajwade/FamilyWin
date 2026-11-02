#!/usr/bin/env node
/**
 * scripts/brand/render-icons.js — renders every app icon / splash / in-app
 * brand image from ONE source drawing (scripts/brand/chest-a.svgfrag, the
 * glossy crowned chest picked by the user on 2026-11-01, "icon A").
 *
 *   node scripts/brand/render-icons.js
 *
 * Uses headless Chrome (transparent background) — no image libraries needed.
 * Writes:
 *   assets/icon.png (1024, full-bleed)      assets/icon-512.png (Play listing)
 *   assets/icon-foreground.png / -background.png / -monochrome.png (adaptive)
 *   assets/splash.png (native splash logo)  assets/brand/chest-3d.png (in-app)
 *   android/app/src/main/res/mipmap-* launcher icons + drawable-* splash logos
 * Re-run after editing the drawing; then rebuild the APK.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const DEFS = fs.readFileSync(path.join(__dirname, 'chest-a.svgfrag'), 'utf8');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge not found');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-icons-'));

/** body = SVG content in a 0..120 viewBox; mask = 'none' | 'circle' | 'squircle'; css = extra filter */
function render(out, size, body, { mask = 'none', css = '' } = {}) {
  const radius = mask === 'circle' ? '50%' : mask === 'squircle' ? '22%' : '0';
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}
div{width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;${css}}svg{display:block}</style></head>
<body><div><svg width="${size}" height="${size}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${DEFS}</defs>${body}</svg></div></body></html>`;
  const page = path.join(TMP, 'p.html');
  fs.writeFileSync(page, html);
  const shot = path.join(TMP, 'shot.png');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${size},${size}`, `--screenshot=${shot}`, 'file:///' + page.replace(/\\/g, '/')], { stdio: 'ignore' });
  const dest = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(shot, dest);
  console.log('wrote', out, size);
}

// Compositions (all in the 0..120 drawing space)
const BG = '<rect width="120" height="120" fill="url(#pBg)"/>';
const scaled = (s, inner, cy = 60) => `<g transform="translate(60 ${cy}) scale(${s}) translate(-60 -60)">${inner}</g>`;
const HERO = '<use href="#heroA"/>';
const PLAIN = '<use href="#plainA"/>'; // chest + crown, no glow/sparkles (for small in-app sizes)
const FULL = BG + scaled(0.9, HERO, 61);
// Adaptive foreground: keep everything inside the 66/108 safe circle (~61%).
const FG = scaled(0.66, HERO, 62);

render('assets/icon.png', 1024, FULL);
render('assets/icon-512.png', 512, FULL);
render('assets/icon-background.png', 1024, BG);
render('assets/icon-foreground.png', 1024, FG);
render('assets/icon-monochrome.png', 1024, scaled(0.66, PLAIN, 62), { css: 'filter:brightness(0) invert(1)' });
render('assets/splash.png', 1024, scaled(0.62, HERO, 62));
render('assets/brand/chest-3d.png', 512, scaled(1.12, PLAIN, 57));

const RES = 'android/app/src/main/res';
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  for (const f of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_monochrome']) {
    const webp = path.join(ROOT, RES, `mipmap-${d}`, `${f}.webp`);
    if (fs.existsSync(webp)) fs.unlinkSync(webp); // replaced by PNG (same resource name)
  }
  render(`${RES}/mipmap-${d}/ic_launcher.png`, 48 * k, FULL, { mask: 'squircle' });
  render(`${RES}/mipmap-${d}/ic_launcher_round.png`, 48 * k, FULL, { mask: 'circle' });
  render(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, 108 * k, FG);
  render(`${RES}/mipmap-${d}/ic_launcher_background.png`, 108 * k, BG);
  render(`${RES}/mipmap-${d}/ic_launcher_monochrome.png`, 108 * k, scaled(0.66, PLAIN, 62), { css: 'filter:brightness(0) invert(1)' });
  // Android 12+ splash icon: 288dp box, only the centre ~2/3 circle shows.
  render(`${RES}/drawable-${d}/splashscreen_logo.png`, 288 * k, scaled(0.62, HERO, 62));
}
fs.rmSync(TMP, { recursive: true, force: true });
