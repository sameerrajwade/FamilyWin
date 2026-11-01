# 3D emoji assets (Microsoft Fluent Emoji, MIT)

`assets/emoji3d/*.png` + `lib/emojiAssets.ts` are GENERATED. Regenerate after
adding a new emoji to `lib/taskEmoji.ts`, `AVATAR_EMOJIS`, or the lists in
`needed.ts` (otherwise the new emoji falls back to the phone's flat glyph):

```bash
# 1. Which emoji are needed
npx tsx scripts/emoji3d/needed.ts scripts/emoji3d/needed.json
# 2. Download the Fluent repo index + an emoji-name list into scripts/emoji3d/dl/
mkdir -p scripts/emoji3d/dl
curl -sSfL -o scripts/emoji3d/dl/tree.json "https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1"
curl -sSfL -o scripts/emoji3d/dl/names.json "https://cdn.jsdelivr.net/npm/unicode-emoji-json@0.8.0/data-by-emoji.json"
# 3. Map emoji → Fluent 3D image (prints any MISSING to map by hand in mapping.json)
node scripts/emoji3d/map.js scripts/emoji3d
# 4. Download the PNGs (skips ones already in dl/png) and the LICENSE
node scripts/emoji3d/fetch.js scripts/emoji3d
# 5. Resize to 192px into assets/emoji3d and regenerate lib/emojiAssets.ts
node scripts/emoji3d/build.js scripts/emoji3d assets/emoji3d lib/emojiAssets.ts
```

`map.js` regenerates `mapping.json` from scratch — re-apply the hand-mapped
entries it reports as MISSING (🤗 → Hugging face, 🦸 → Woman superhero,
🧙 → Woman mage). `dl/` is a download cache; don't commit it.
