/**
 * lib/sounds.ts — Sound effects for FamilyWin
 * Tones generated with Python / sine waves; royalty-free.
 *
 * Usage:  import { Sounds } from '@/lib/sounds';
 *         Sounds.taskComplete();
 */

import { Audio } from 'expo-av';

const ASSETS: Record<string, any> = {
  task_complete: require('@/assets/sounds/task_complete.wav'),
  all_done:      require('@/assets/sounds/all_done.wav'),
  reward:        require('@/assets/sounds/reward.wav'),
  level_up:      require('@/assets/sounds/level_up.wav'),
  penalty:       require('@/assets/sounds/penalty.wav'),
};

async function play(key: string, volume = 0.7) {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
    const { sound } = await Audio.Sound.createAsync(ASSETS[key], {
      shouldPlay: true,
      volume,
    });
    sound.setOnPlaybackStatusUpdate((s) => {
      if ('didJustFinish' in s && s.didJustFinish) sound.unloadAsync().catch(() => {});
    });
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
