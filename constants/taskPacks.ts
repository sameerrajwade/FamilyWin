/**
 * taskPacks.ts — starter task template packs (Roadmap 4.6).
 * ─────────────────────────────────────────────────────────────────────────────
 * A brand-new family with zero tasks is a dead app — this is the single biggest
 * activation lever. These age-tuned packs let a parent seed a full week of tasks
 * in one tap. Point values are derived from difficulty at apply-time; emoji are
 * auto-detected, so packs stay declarative and small here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { TaskCategory, TaskDifficulty, TaskRecurrence } from '@/types';

export interface PackTask {
  title: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  recurrence: TaskRecurrence;
}

export interface TaskPack {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  tasks: PackTask[];
}

export const TASK_PACKS: TaskPack[] = [
  {
    id: 'ages-5-8',
    emoji: '🧸',
    name: 'Little Helpers',
    blurb: 'Ages 5–8 · gentle daily habits',
    tasks: [
      { title: 'Brush my teeth', category: 'hygiene', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Make my bed', category: 'chores', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Put my toys away', category: 'chores', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Get dressed by myself', category: 'hygiene', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Feed the pet', category: 'chores', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Read for 10 minutes', category: 'homework', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Use kind words', category: 'behavior', difficulty: 'easy', recurrence: 'daily' },
    ],
  },
  {
    id: 'ages-9-12',
    emoji: '🎒',
    name: 'Big Kids',
    blurb: 'Ages 9–12 · school-year routine',
    tasks: [
      { title: 'Finish homework', category: 'homework', difficulty: 'medium', recurrence: 'daily' },
      { title: 'Make my bed', category: 'chores', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Tidy my room', category: 'chores', difficulty: 'medium', recurrence: 'daily' },
      { title: 'Pack my school bag', category: 'homework', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Shower', category: 'hygiene', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Help with the dishes', category: 'chores', difficulty: 'medium', recurrence: 'daily' },
      { title: 'Take out the trash', category: 'chores', difficulty: 'easy', recurrence: 'weekly' },
      { title: 'Practice 20 minutes', category: 'extras', difficulty: 'medium', recurrence: 'daily' },
    ],
  },
  {
    id: 'teens',
    emoji: '🎧',
    name: 'Teen Pack',
    blurb: 'Ages 13+ · more responsibility',
    tasks: [
      { title: 'Study / homework', category: 'homework', difficulty: 'hard', recurrence: 'daily' },
      { title: 'Do my laundry', category: 'chores', difficulty: 'medium', recurrence: 'weekly' },
      { title: 'Wash the dishes', category: 'chores', difficulty: 'medium', recurrence: 'daily' },
      { title: 'Mow the lawn', category: 'chores', difficulty: 'hard', recurrence: 'weekly' },
      { title: 'Deep clean my room', category: 'chores', difficulty: 'medium', recurrence: 'weekly' },
      { title: 'Help cook dinner', category: 'chores', difficulty: 'medium', recurrence: 'weekly' },
      { title: 'Be ready on time', category: 'behavior', difficulty: 'easy', recurrence: 'daily' },
    ],
  },
  {
    id: 'whole-family',
    emoji: '👨‍👩‍👧‍👦',
    name: 'Whole Family',
    blurb: 'Shared habits everyone joins in on',
    tasks: [
      { title: 'Family dinner together', category: 'behavior', difficulty: 'easy', recurrence: 'daily' },
      { title: 'No phones at dinner', category: 'behavior', difficulty: 'easy', recurrence: 'daily' },
      { title: 'Weekend tidy-up', category: 'chores', difficulty: 'medium', recurrence: 'weekly' },
      { title: 'Family walk or outing', category: 'extras', difficulty: 'easy', recurrence: 'weekly' },
      { title: 'Plan the week together', category: 'behavior', difficulty: 'easy', recurrence: 'weekly' },
      { title: 'Share one thing we’re grateful for', category: 'behavior', difficulty: 'easy', recurrence: 'daily' },
    ],
  },
];
