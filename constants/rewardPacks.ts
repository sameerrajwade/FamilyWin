/**
 * rewardPacks.ts — starter reward template packs (companion to taskPacks).
 * ─────────────────────────────────────────────────────────────────────────────
 * A rewards store with nothing to redeem is as dead as a task list with no tasks.
 * These packs let a parent stock the store in one tap. Point costs are baked in
 * (rewards have no difficulty to derive from); an emoji is stored per reward.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface PackReward {
  title: string;
  pointCost: number;
  icon: string;
}

export interface RewardPack {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  rewards: PackReward[];
}

export const REWARD_PACKS: RewardPack[] = [
  {
    id: 'screen-fun',
    emoji: '📱',
    name: 'Screen & Fun',
    blurb: 'Screen time and game perks',
    rewards: [
      { title: '30 min screen time', pointCost: 30, icon: '📱' },
      { title: '1 hour screen time', pointCost: 60, icon: '📱' },
      { title: 'Extra video-game time', pointCost: 50, icon: '🎮' },
      { title: 'Movie night pick', pointCost: 80, icon: '🍿' },
      { title: 'Stay up 30 min late', pointCost: 75, icon: '🌙' },
    ],
  },
  {
    id: 'treats',
    emoji: '🍦',
    name: 'Treats',
    blurb: 'Little edible rewards',
    rewards: [
      { title: 'Favorite snack', pointCost: 30, icon: '🍿' },
      { title: 'Pick the candy', pointCost: 40, icon: '🍬' },
      { title: 'Bake together', pointCost: 60, icon: '🧁' },
      { title: 'Choose dinner', pointCost: 100, icon: '🍽️' },
      { title: 'Ice-cream trip', pointCost: 150, icon: '🍦' },
    ],
  },
  {
    id: 'adventures',
    emoji: '🎡',
    name: 'Adventures',
    blurb: 'Bigger outings to save up for',
    rewards: [
      { title: 'Bike ride together', pointCost: 50, icon: '🚲' },
      { title: 'Park / playground trip', pointCost: 120, icon: '🛝' },
      { title: 'Day out with a parent', pointCost: 150, icon: '🎢' },
      { title: 'Friend sleepover', pointCost: 200, icon: '🎉' },
      { title: 'Zoo or museum day', pointCost: 250, icon: '🦁' },
    ],
  },
  {
    id: 'privileges',
    emoji: '🎟️',
    name: 'Privileges',
    blurb: 'Passes and picks',
    rewards: [
      { title: 'Skip one chore', pointCost: 60, icon: '🎟️' },
      { title: 'Later bedtime tonight', pointCost: 75, icon: '🌙' },
      { title: 'Choose the family movie', pointCost: 80, icon: '🎬' },
      { title: 'Pick the weekend activity', pointCost: 100, icon: '🗺️' },
      { title: 'No-chore day pass', pointCost: 150, icon: '🏖️' },
    ],
  },
];
