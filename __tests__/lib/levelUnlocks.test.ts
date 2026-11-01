import { frameFor, perkFor, levelLadder, unlocksBetween, cleanPerks, MAX_LEVEL } from '@/lib/levelUnlocks';
import { lifetimeEarned, getLevel } from '@/lib/pointsEngine';

describe('lifetimeEarned (level source)', () => {
  it('counts tasks, bonuses and penalties but not reward spending', () => {
    const txns = [
      { delta: 100, source: 'task' }, { delta: 20, source: 'bonus' },
      { delta: -10, source: 'discipline' }, { delta: -80, source: 'redemption' },
    ];
    expect(lifetimeEarned(txns)).toBe(110);
  });
  it('redeeming a reward never lowers the level', () => {
    const earned = [{ delta: 450, source: 'task' }];
    const afterSpend = [...earned, { delta: -400, source: 'redemption' }];
    expect(getLevel(lifetimeEarned(afterSpend)).level).toBe(getLevel(lifetimeEarned(earned)).level);
  });
  it('never goes below zero', () => {
    expect(lifetimeEarned([{ delta: -50, source: 'discipline' }])).toBe(0);
  });
});

describe('frameFor', () => {
  it('has no frame at level 1', () => {
    expect(frameFor(1)).toBeNull();
    expect(frameFor(undefined)).toBeNull();
  });
  it('goes bronze → silver → gold', () => {
    expect(frameFor(2)?.color).toBe('bronze');
    expect(frameFor(3)?.color).toBe('silver');
    expect(frameFor(4)?.color).toBe('gold');
  });
  it('adds the level badge from Lv 4 up', () => {
    expect(frameFor(3)?.badge).toBeUndefined();
    expect(frameFor(4)?.badge).toBe('🌟');
    expect(frameFor(MAX_LEVEL)?.badge).toBe('💎');
  });
  it('clamps levels above the max', () => {
    expect(frameFor(99)?.level).toBe(MAX_LEVEL);
  });
});

describe('perks and the ladder', () => {
  const perks = { '3': '  Pick the Friday movie ', '5': 'Stay up 30 min late' };

  it('reads a trimmed perk, empty when none', () => {
    expect(perkFor(perks, 3)).toBe('Pick the Friday movie');
    expect(perkFor(perks, 4)).toBe('');
    expect(perkFor(null, 3)).toBe('');
  });
  it('lists Lv 2..max and marks what is unlocked', () => {
    const ladder = levelLadder(4, perks);
    expect(ladder[0].level).toBe(2);
    expect(ladder).toHaveLength(MAX_LEVEL - 1);
    expect(ladder.filter((s) => s.unlocked).map((s) => s.level)).toEqual([2, 3, 4]);
    expect(ladder.find((s) => s.level === 5)?.perk).toBe('Stay up 30 min late');
  });
  it('a jump of two levels reveals both unlocks', () => {
    expect(unlocksBetween(2, 4, perks).map((s) => s.level)).toEqual([3, 4]);
    expect(unlocksBetween(4, 4, perks)).toEqual([]);
  });
  it('cleans parent edits before saving', () => {
    expect(cleanPerks({ '1': 'x', '3': '  Movie  ', '4': '   ', '12': 'y', abc: 'z' })).toEqual({ '3': 'Movie' });
    expect(cleanPerks({ '2': 'a'.repeat(80) })['2']).toHaveLength(60);
  });
});
