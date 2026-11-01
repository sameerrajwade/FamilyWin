const fs = require('fs'), path = require('path'), sharp = require('sharp');
const [,, dir, outDir, libFile] = process.argv;
const m = JSON.parse(fs.readFileSync(dir + '/mapping.json', 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const slug = (e) => 'u' + Array.from(e.replace(/\uFE0F/g, '')).map((c) => c.codePointAt(0).toString(16)).join('_');
(async () => {
  const lines = [];
  for (const [e, p] of Object.entries(m)) {
    const s = slug(e);
    await sharp(path.join(dir, 'dl/png', path.basename(p))).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(path.join(outDir, s + '.png'));
    lines.push(`  ${JSON.stringify(e.replace(/\uFE0F/g, ''))}: require('../assets/emoji3d/${s}.png'),`);
  }
  fs.copyFileSync(dir + '/dl/LICENSE', path.join(outDir, 'LICENSE'));
  const src = `/**
 * lib/emojiAssets.ts — GENERATED (scripts/emoji3d — see README). Do not hand-edit.
 * ─────────────────────────────────────────────────────────────────────────────
 * Bundled Microsoft Fluent 3D emoji (MIT, see assets/emoji3d/LICENSE) for every
 * emoji the app shows as an icon — task icons, avatars, rewards and game UI —
 * so they look identical (and premium) on every phone brand instead of falling
 * back to each OEM's native emoji font.
 *
 * Keys have the U+FE0F variation selector stripped; use emojiImage() to look up.
 */
import type { ImageSourcePropType } from 'react-native';

const EMOJI_3D: Record<string, ImageSourcePropType> = {
${lines.join('\n')}
};

/** The bundled 3D image for an emoji, or null if we don't ship one. */
export function emojiImage(emoji: string | null | undefined): ImageSourcePropType | null {
  if (!emoji) return null;
  return EMOJI_3D[emoji.replace(/\uFE0F/g, '')] ?? null;
}

export const EMOJI_3D_KEYS = Object.keys(EMOJI_3D);
`;
  fs.writeFileSync(libFile, src);
  console.log('built', lines.length);
})();
