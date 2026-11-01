/**
 * constants/presets.ts
 * Starter penalty + bonus presets shown until a family saves its own list.
 * Shared by the discipline log (apply) and Family → Penalties & bonuses (edit).
 * Editing any starter "materializes" the whole starter list into the family's
 * own presets first (lib/firebase materializeStarterPresets), so the other
 * starters don't silently vanish when the first custom one is saved.
 */
export interface StarterPreset {
  title: string;
  points: number; // positive magnitude
  emoji: string;
}

export const STARTER_PENALTIES: StarterPreset[] = [
  { title: 'Talked back', points: 15, emoji: '😤' },
  { title: 'Not following schedule', points: 10, emoji: '🕐' },
  { title: 'Disrespectful', points: 20, emoji: '🗣️' },
];

export const STARTER_BONUSES: StarterPreset[] = [
  { title: 'Helped without being asked', points: 20, emoji: '🤝' },
  { title: 'Exceptional behavior', points: 30, emoji: '⭐' },
  { title: 'Read for 30 minutes', points: 15, emoji: '📖' },
  { title: 'Completed all tasks early', points: 25, emoji: '🎯' },
  { title: 'Great attitude', points: 10, emoji: '😊' },
];
