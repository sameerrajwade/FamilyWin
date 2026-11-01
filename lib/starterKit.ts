/**
 * lib/starterKit.ts — easy family setup (Phase G6), PURE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. STARTER KIT — right after a new family adds its kids, one screen offers a
 *    ready-to-play game built from their ages: a few age-right tasks per kid
 *    (assigned to THAT kid — managed kids only see tasks assigned to them),
 *    two shared family tasks, and four starter rewards. Everything can be
 *    unticked, and the parent can add their own tasks.
 * 2. DISCOVER MORE — the advanced features (family goal, missed-task rules,
 *    allowance, level perks, Kid Mode) are listed once at the end of setup with
 *    "Skip for now"; skipped ones come back one at a time as a card on Today
 *    from week 2 ("Not now" snoozes another week → week 3).
 * No Firebase/React here; unit-tested. Applying the kit: lib/firebase
 * applyStarterKit.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { TASK_PACKS } from '@/constants/taskPacks';
import { REWARD_PACKS } from '@/constants/rewardPacks';
import { DIFFICULTY_POINTS } from '@/constants/theme';

export interface StarterKid { id: string; name: string; age?: number | null }

export interface StarterTask {
  key: string;                // stable id for the checklist
  title: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  recurrence: string;
  pointValue: number;
  assignedTo: string | null;  // a kid's id, or null = whole family
  forLabel: string;           // "Vian" / "Everyone"
}

export interface StarterReward { key: string; title: string; pointCost: number; icon: string }

/** Which age pack fits a kid. Unknown or under 9 → the gentle 5–8 pack. */
export function packIdForAge(age?: number | null): 'ages-5-8' | 'ages-9-12' | 'teens' {
  if (age != null && age >= 13) return 'teens';
  if (age != null && age >= 9) return 'ages-9-12';
  return 'ages-5-8';
}

const DAILY_PER_KID = 3;
const WEEKLY_PER_KID = 1;
const SHARED_TITLES = ['Family dinner together', 'Weekend tidy-up'];
const STARTER_REWARDS: [packId: string, title: string][] = [
  ['screen-fun', '30 min screen time'],
  ['treats', 'Favorite snack'],
  ['privileges', 'Choose the family movie'],
  ['treats', 'Ice-cream trip'],
];

export function buildStarterKit(kids: StarterKid[]): { tasks: StarterTask[]; rewards: StarterReward[] } {
  const tasks: StarterTask[] = [];
  for (const kid of kids) {
    const pack = TASK_PACKS.find((p) => p.id === packIdForAge(kid.age))!;
    const daily = pack.tasks.filter((t) => t.recurrence === 'daily').slice(0, DAILY_PER_KID);
    const weekly = pack.tasks.filter((t) => t.recurrence === 'weekly').slice(0, WEEKLY_PER_KID);
    for (const t of [...daily, ...weekly]) {
      tasks.push({
        key: `${kid.id}:${t.title}`, title: t.title, category: t.category, difficulty: t.difficulty,
        recurrence: t.recurrence, pointValue: DIFFICULTY_POINTS[t.difficulty], assignedTo: kid.id, forLabel: kid.name,
      });
    }
  }
  const family = TASK_PACKS.find((p) => p.id === 'whole-family')!;
  for (const title of SHARED_TITLES) {
    const t = family.tasks.find((x) => x.title === title);
    if (!t) continue;
    tasks.push({
      key: `all:${t.title}`, title: t.title, category: t.category, difficulty: t.difficulty,
      recurrence: t.recurrence, pointValue: DIFFICULTY_POINTS[t.difficulty], assignedTo: null, forLabel: 'Everyone',
    });
  }
  const rewards: StarterReward[] = [];
  for (const [packId, title] of STARTER_REWARDS) {
    const r = REWARD_PACKS.find((p) => p.id === packId)?.rewards.find((x) => x.title === title);
    if (r) rewards.push({ key: `${packId}:${r.title}`, title: r.title, pointCost: r.pointCost, icon: r.icon });
  }
  return { tasks, rewards };
}

/** A parent's own task: one copy per kid ("each kid") or one shared task. */
export function customStarterTasks(title: string, forEachKid: boolean, kids: StarterKid[]): StarterTask[] {
  const clean = title.trim().slice(0, 60);
  if (!clean) return [];
  const base = { title: clean, category: 'chores', difficulty: 'easy' as const, recurrence: 'daily', pointValue: DIFFICULTY_POINTS.easy };
  if (forEachKid && kids.length > 0) {
    return kids.map((k) => ({ ...base, key: `custom:${k.id}:${clean}`, assignedTo: k.id, forLabel: k.name }));
  }
  return [{ ...base, key: `custom:all:${clean}`, assignedTo: null, forLabel: 'Everyone' }];
}

/** Small tasks auto-approved for a family set up with the starter kit (G5). */
export const STARTER_AUTO_APPROVE = 10;

// ─── Discover more ───────────────────────────────────────────────────────────

export type DiscoverKey = 'goal' | 'rules' | 'allowance' | 'perks' | 'kidmode';

export interface DiscoverItem { key: DiscoverKey; emoji: string; title: string; blurb: string; route: string; cta: string }

export const DISCOVER_ITEMS: DiscoverItem[] = [
  { key: 'goal', emoji: '🎯', title: 'A family goal', blurb: 'One shared target everyone earns toward together — like a pizza night.', route: '/app/tabs/family', cta: 'Set a goal' },
  { key: 'kidmode', emoji: '🧸', title: 'Kid Mode', blurb: 'Hand your phone to a kid: they see only their tasks and claim them safely.', route: '/app/tabs/family', cta: 'See Kid Mode' },
  { key: 'perks', emoji: '🌟', title: 'Level perks', blurb: 'Real-world treats that unlock as each player levels up.', route: '/app/settings/parental', cta: 'Add perks' },
  { key: 'allowance', emoji: '💰', title: 'Pocket money', blurb: 'Show points as virtual cash and let kids request a payout you approve.', route: '/app/settings/parental', cta: 'Set up allowance' },
  { key: 'rules', emoji: '⏰', title: 'Missed-task rules', blurb: 'Optional: decide whether unfinished chores cost points, and the daily deadline.', route: '/app/settings/parental', cta: 'Open Game rules' },
];

export type DiscoverEntry = { status: 'later' | 'done' | 'no'; until?: number };
export type DiscoverState = Partial<Record<DiscoverKey, DiscoverEntry>>;

const DAY = 86_400_000;
export const DISCOVER_FIRST_SHOW_DAYS = 7; // week 2
export const DISCOVER_SNOOZE_DAYS = 7;     // "Not now" → a week later

/** End of setup: everything not opted out comes back from week 2. */
export function initialDiscoverState(familyCreatedAt: Date, notForUs: DiscoverKey[] = []): DiscoverState {
  const until = familyCreatedAt.getTime() + DISCOVER_FIRST_SHOW_DAYS * DAY;
  const out: DiscoverState = {};
  for (const it of DISCOVER_ITEMS) out[it.key] = notForUs.includes(it.key) ? { status: 'no' } : { status: 'later', until };
  return out;
}

/** The one card to show on Today right now (null = none). */
export function discoverCardToShow(state: DiscoverState | null | undefined, now: Date = new Date()): DiscoverItem | null {
  if (!state) return null;
  for (const it of DISCOVER_ITEMS) {
    const e = state[it.key];
    if (e?.status === 'later' && (e.until ?? 0) <= now.getTime()) return it;
  }
  return null;
}

export function snoozeDiscover(state: DiscoverState, key: DiscoverKey, now: Date = new Date()): DiscoverState {
  return { ...state, [key]: { status: 'later', until: now.getTime() + DISCOVER_SNOOZE_DAYS * DAY } };
}
export function resolveDiscover(state: DiscoverState, key: DiscoverKey, status: 'done' | 'no'): DiscoverState {
  return { ...state, [key]: { status } };
}
