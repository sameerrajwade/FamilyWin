// Prints the emoji the app needs a 3D image for → scripts/emoji3d/needed.json
// Run from the repo root:  npx tsx scripts/emoji3d/needed.ts scripts/emoji3d/needed.json
import { writeFileSync } from 'fs';
import { ALL_TASK_EMOJI } from '../../lib/taskEmoji';
import { AVATAR_EMOJIS } from '../../constants/theme';

const REWARD = ['📱', '🎮', '🍿', '🍦', '🍽️', '💵', '🌙', '🧸', '📚', '🎡', '🎟️', '🎉', '⚽', '🎁'];
const UI = ['🔥', '📅', '🗓️', '⚡', '🏆', '🥇', '🥈', '🥉', '💰', '💸', '🎯', '⭐', '🌟', '🔄', '📸', '🪙', '💎', '🛡️', '🏅', '👑', '✅'];
// Emoji the OLD detector may have saved on existing tasks (still rendered).
const LEGACY = ['☀️', '🎶', '🥞', '🦷', '🫧', '📌', '🙂', '👤'];

const all = Array.from(new Set([...ALL_TASK_EMOJI, ...AVATAR_EMOJIS, ...REWARD, ...UI, ...LEGACY]));
writeFileSync(process.argv[2] ?? 'scripts/emoji3d/needed.json', JSON.stringify(all));
console.log(all.length, 'emoji');
