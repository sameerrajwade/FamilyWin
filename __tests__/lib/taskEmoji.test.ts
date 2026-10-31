import { detectTaskEmoji, resolveTaskEmoji, ALL_TASK_EMOJI, CATEGORY_FALLBACK } from '@/lib/taskEmoji';
import { emojiImage } from '@/lib/emojiAssets';
import { AVATAR_EMOJIS } from '@/constants/theme';

describe('detectTaskEmoji', () => {
  it.each([
    ['Meditation', '🧘'],
    ['10 min meditation', '🧘'],
    ['Breathing exercise', '🧘'], // not stolen by "exercise"
    ['Quiet time', '🧘'],
    ['Prayer', '🙏'],
    ['Feed fish', '🐠'],
    ['Clean shoes', '👟'],
    ['Wash face', '🧴'],
    ['Brush your teeth', '🪥'],
    ['Drink water', '💧'],
    ['Go to bed', '😴'],
    ['Make a bed', '🛏️'],
    ['Walk the dog', '🐕'],
    ['Practice piano', '🎹'],
    ['Put away toys', '🧸'],
    ['Do homework', '📚'],
    ['Learning - 15 mins', '📚'], // was 🏠 fallback on device
    ['Piano lesson', '🎹'],       // specific activity beats generic "lesson"
    ['Swim lesson', '🏊'],
    ['Karate class', '🥋'],
    ['Art class', '🎨'],
  ])('%s → %s', (title, emoji) => {
    expect(detectTaskEmoji(title, 'chores')).toBe(emoji);
  });

  it('tolerates a one-letter typo on longer words', () => {
    expect(detectTaskEmoji('Meditaion', 'extras')).toBe('🧘');
    expect(detectTaskEmoji('Homwork', 'extras')).toBe('📚');
  });

  it('does not fuzzy-match short words', () => {
    // "zing" is one edit from "sing" but too short to trust.
    expect(detectTaskEmoji('zing', 'extras')).toBe(CATEGORY_FALLBACK.extras);
  });

  it('falls back to a neutral (non-cleaning) category icon', () => {
    expect(detectTaskEmoji('Zzqx', 'hygiene')).toBe('✨');
    expect(detectTaskEmoji('Zzqx', 'chores')).toBe('🏠');
    expect(detectTaskEmoji('Zzqx', 'unknown')).toBe('✅');
  });
});

describe('resolveTaskEmoji', () => {
  it('keeps a deliberately saved emoji', () => {
    expect(resolveTaskEmoji({ title: 'Meditation', category: 'extras', taskEmoji: '🌈' })).toBe('🌈');
  });

  it('re-detects when the saved emoji is a stale blind fallback', () => {
    expect(resolveTaskEmoji({ title: 'Meditation', category: 'hygiene', taskEmoji: '🧼' })).toBe('🧘');
    expect(resolveTaskEmoji({ title: 'Feed fish', category: 'chores', taskEmoji: '🧽' })).toBe('🐠');
  });

  it('detects when nothing is saved', () => {
    expect(resolveTaskEmoji({ title: 'Walk the dog', category: 'chores' })).toBe('🐕');
  });
});

describe('3D emoji coverage', () => {
  it('ships a 3D image for every task emoji', () => {
    expect(ALL_TASK_EMOJI.filter((e) => !emojiImage(e))).toEqual([]);
  });

  it('ships a 3D image for every avatar', () => {
    expect(AVATAR_EMOJIS.filter((e) => !emojiImage(e))).toEqual([]);
  });

  it('matches with or without the U+FE0F variation selector', () => {
    expect(emojiImage('🛏️')).toBeTruthy();
    expect(emojiImage('🛏')).toBeTruthy();
    expect(emojiImage('🫠')).toBeNull();
  });
});
