/**
 * lib/levelUnlocks.ts — what each level unlocks (Phase E3), PURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Levels (lib/pointsEngine LEVEL_TIERS, from lifetimeEarned) now unlock things:
 *   • an avatar FRAME drawn by <Avatar memberId> everywhere in the app
 *     (bronze → silver → gold → brand purple/pink), plus the level's own 3D
 *     badge from Lv 4 up;
 *   • the level TITLE (Helper, Star, Champion…) shown with the name;
 *   • an optional real-world PERK a parent writes per level in Game rules
 *     (family.levelPerks, e.g. { "4": "Pick the Friday movie" }).
 * Frame colours are design-system tokens (Colors.bronze/silver/gold/primary/
 * accent) — no new colours. No Firebase/React here; unit-tested.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { LEVEL_TIERS } from '@/lib/pointsEngine';

export type FrameColor = 'bronze' | 'silver' | 'gold' | 'primary' | 'accent';

export interface LevelFrame {
  level: number;
  name: string;          // "Gold frame"
  color: FrameColor;
  /** Ring width as a fraction of the avatar size. */
  weight: number;
  /** 3D emoji badge on the avatar's corner (Lv 4+). */
  badge?: string;
}

const FRAMES: Record<number, Omit<LevelFrame, 'level'>> = {
  2: { name: 'Bronze frame', color: 'bronze', weight: 0.06 },
  3: { name: 'Silver frame', color: 'silver', weight: 0.065 },
  4: { name: 'Gold frame', color: 'gold', weight: 0.07 },
  5: { name: 'Gold frame + flame badge', color: 'gold', weight: 0.075 },
  6: { name: 'Champion purple frame', color: 'primary', weight: 0.08 },
  7: { name: 'Hero frame', color: 'accent', weight: 0.08 },
  8: { name: 'Legend gold frame', color: 'gold', weight: 0.09 },
  9: { name: 'Mythic frame', color: 'primary', weight: 0.09 },
};

export const MAX_LEVEL = LEVEL_TIERS.length;

/** The frame for a level (null at Lv 1 / unknown). Badges start at Lv 4. */
export function frameFor(level: number | null | undefined): LevelFrame | null {
  if (!level) return null;
  const lv = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL);
  const f = FRAMES[lv];
  if (!f) return null;
  const badge = lv >= 4 ? LEVEL_TIERS[lv - 1].emoji : undefined;
  return { level: lv, ...f, ...(badge ? { badge } : {}) };
}

export type LevelPerks = Record<string, string> | null | undefined;

/** A parent's perk text for a level, trimmed; '' when none. */
export function perkFor(perks: LevelPerks, level: number): string {
  return (perks?.[String(level)] ?? '').trim();
}

export interface LevelStep {
  level: number;
  title: string;
  emoji: string;
  floor: number;         // lifetime earned points needed
  frame: LevelFrame | null;
  perk: string;          // '' when the parent set none
  unlocked: boolean;
}

/** The whole ladder (Lv 2 → max) for the profile, marked unlocked or not. */
export function levelLadder(currentLevel: number, perks: LevelPerks): LevelStep[] {
  return LEVEL_TIERS.slice(1).map((t, i) => {
    const level = i + 2;
    return {
      level, title: t.title, emoji: t.emoji, floor: t.floor,
      frame: frameFor(level), perk: perkFor(perks, level),
      unlocked: currentLevel >= level,
    };
  });
}

/** Everything gained going from `fromLevel` to `toLevel` (for the level-up reveal). */
export function unlocksBetween(fromLevel: number, toLevel: number, perks: LevelPerks): LevelStep[] {
  return levelLadder(toLevel, perks).filter((s) => s.level > fromLevel && s.level <= toLevel);
}

/**
 * Clean a parent's perk edits before saving: trims, caps length, drops empty
 * entries and levels outside 2..max.
 */
export function cleanPerks(perks: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(perks)) {
    const lv = Number(k);
    const text = (v ?? '').trim().slice(0, 60);
    if (Number.isInteger(lv) && lv >= 2 && lv <= MAX_LEVEL && text) out[String(lv)] = text;
  }
  return out;
}
