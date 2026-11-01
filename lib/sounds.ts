/**
 * lib/sounds.ts — Sound effects for Chore League
 * Tones generated with Python / sine waves; royalty-free.
 *
 * Usage:  import { Sounds } from '@/lib/sounds';
 *         Sounds.taskComplete();
 *
 * Migrated expo-av → expo-audio (SDK 54 removed expo-av). expo-audio's
 * createAudioPlayer is synchronous and returns an AudioPlayer we play once and
 * then release when playback finishes, so we never leak native players.
 */

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const ASSETS: Record<string, any> = {
  task_complete: require('@/assets/sounds/task_complete.wav'),
  all_done:      require('@/assets/sounds/all_done.wav'),
  reward:        require('@/assets/sounds/reward.wav'),
  level_up:      require('@/assets/sounds/level_up.wav'),
  penalty:       require('@/assets/sounds/penalty.wav'),
};

// Set the audio mode once (best-effort) so effects still play with the ringer
// muted is NOT desired — keep the default (respect the silent switch).
let audioModeSet = false;

function play(key: string, volume = 0.7) {
  try {
    if (!audioModeSet) {
      audioModeSet = true;
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
    }
    const player = createAudioPlayer(ASSETS[key]);
    player.volume = volume;
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status?.didJustFinish) {
        try { sub?.remove?.(); } catch { /* noop */ }
        try { player.remove(); } catch { /* noop */ }
      }
    });
    player.play();
  } catch {
    // Non-critical — never crash over a sound
  }
}

export const Sounds = {
  /** Short double-ding when a task is ticked ✅ */
  taskComplete:   () => play('task_complete'),

  /** Triumphant 4-note fanfare when ALL tasks are done 🎉 */
  allDone:        () => play('all_done'),

  /** Coin pickup when a reward is redeemed 🎁 */
  rewardRedeemed: () => play('reward'),

  /** Ascending scale when a reward is approved / level up 🏆 */
  rewardApproved: () => play('level_up'),
  levelUp:        () => play('level_up'),

  /** Low descending buzz when a penalty is logged ⚠️ */
  penalty:        () => play('penalty'),
};
