/**
 * __tests__/lib/taskEmoji.test.ts
 * detectTaskEmoji — the shared per-task icon resolver used by BOTH the adult and
 * child task cards. Covers the normalization + prefix-matching fixes (the bugs
 * where "Make a Bed" → broom and "Drinking Water" → shower).
 */
import { detectTaskEmoji } from '@/lib/taskEmoji';

describe('detectTaskEmoji', () => {
  it('matches phrases despite filler words ("a", "your", "the")', () => {
    expect(detectTaskEmoji('Make a Bed', 'chores')).toBe('🛏️');
    expect(detectTaskEmoji('Make my bed', 'chores')).toBe('🛏️');
    expect(detectTaskEmoji('Brush your teeth', 'hygiene')).toBe('🦷');
    expect(detectTaskEmoji('Wash the dishes', 'chores')).toBe('🍽️');
  });

  it('matches single-word keywords by prefix ("drinking" → "drink")', () => {
    expect(detectTaskEmoji('Drinking Water', 'hygiene')).toBe('💧');
    expect(detectTaskEmoji('Drink water', 'hygiene')).toBe('💧');
    expect(detectTaskEmoji('Running', 'extras')).toBe('🏃');
    expect(detectTaskEmoji('Reading time', 'homework')).toBe('📖');
  });

  it('uses distinct icons for workout vs run', () => {
    expect(detectTaskEmoji('Workout', 'extras')).toBe('💪');
    expect(detectTaskEmoji('Morning run', 'extras')).toBe('🏃');
  });

  it('does not confuse watering plants with drinking water', () => {
    // watering plants → a plant icon (🌱/🪴), never the drink 💧
    expect(['🌱', '🪴']).toContain(detectTaskEmoji('Water the plants', 'chores'));
    expect(detectTaskEmoji('Drink water', 'hygiene')).toBe('💧');
  });

  it('keeps "go to bed" as sleep, not the bed-making chore', () => {
    expect(detectTaskEmoji('Go to bed', 'hygiene')).toBe('😴');
    expect(detectTaskEmoji('Bedtime', 'hygiene')).toBe('😴');
  });

  it('does not mid-word false-match (run ≠ brunch, take ≠ takeout theft)', () => {
    // "brunch" must not hit the run 🏃 icon
    expect(detectTaskEmoji('Make brunch', 'chores')).not.toBe('🏃');
    // "take out the trash" still resolves to trash, not something from "take"
    expect(detectTaskEmoji('Take out the trash', 'chores')).toBe('🗑️');
  });

  it('the same title+category is deterministic (adult and child cards agree)', () => {
    const a = detectTaskEmoji('Make a Bed', 'chores');
    const b = detectTaskEmoji('Make a Bed', 'chores');
    expect(a).toBe(b);
  });

  it('falls back to a NEUTRAL category icon when nothing matches (not a shower)', () => {
    const hygiene = detectTaskEmoji('Zzzxyq', 'hygiene');
    expect(hygiene).toBe('🧼'); // neutral soap, not 🚿
    expect(detectTaskEmoji('Zzzxyq', 'chores')).toBe('🧽');
    expect(detectTaskEmoji('Zzzxyq', 'nonsense')).toBe('📌');
  });
});
