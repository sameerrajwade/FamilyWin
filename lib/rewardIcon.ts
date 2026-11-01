/**
 * lib/rewardIcon.ts
 * Shared by the Rewards tab and Family → Rewards so a reward shows the same
 * 3D icon everywhere.
 */
import type { RewardDoc } from '@/lib/firebase';

// Pick a fitting emoji for a reward. Uses an explicit `icon` field if the reward
// has one, otherwise infers from keywords in the title, falling back to 🎁.
export function rewardIcon(reward: RewardDoc): string {
  const explicit = (reward as any).icon;
  if (explicit) return explicit;
  const t = (reward.title ?? '').toLowerCase();
  const map: [RegExp, string][] = [
    [/screen|tablet|phone|ipad|device/, '📱'],
    [/game|xbox|playstation|ps5|nintendo|switch|roblox|minecraft/, '🎮'],
    [/tv|movie|netflix|show|cinema|film/, '🍿'],
    [/ice ?cream|dessert|candy|sweet|chocolate|treat/, '🍦'],
    [/dinner|meal|food|pizza|restaurant|lunch|snack/, '🍽️'],
    [/money|cash|allowance|dollar|\$/, '💵'],
    [/late|bedtime|stay up|sleep in/, '🌙'],
    [/toy|lego/, '🧸'],
    [/book|story|read/, '📚'],
    [/outing|trip|park|zoo|beach|out/, '🎡'],
    [/skip|chore|day off|pass/, '🎟️'],
    [/friend|sleepover|party/, '🎉'],
    [/sport|bike|ball|swim|scooter/, '⚽'],
  ];
  for (const [re, emoji] of map) if (re.test(t)) return emoji;
  return '🎁';
}
