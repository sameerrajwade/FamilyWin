// Jest stand-in for the 159 bundled Fluent 3D emoji PNGs (lib/emojiAssets.ts).
// Transforming each real image on a cold cache made screen tests time out;
// an RN image source is just an opaque asset id, so any number works.
module.exports = 1;
