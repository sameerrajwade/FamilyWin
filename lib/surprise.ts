/**
 * lib/surprise.ts — awarding surprise packs (Phase C8), Firestore side
 * ─────────────────────────────────────────────────────────────────────────────
 * Called from a PARENT's device right after something that can finish a day:
 * the parent completing a task (own, or on a managed kid's behalf), approving
 * claims, recovering/catching up a task. Kids never award (the security rules
 * only let parents write bonus transactions), so packs can't be forged.
 *
 * Each pack is written inside a Firestore transaction under a FIXED id
 * (lib/surprisePacks) — at most one per person per day / week, even if two
 * parents approve at the same moment. Kids see the reveal on their own screen
 * via components/ui/SurprisePack (it watches for new pack transactions).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { firestore } from '@/lib/fb';
import { Col, getActiveTasks, getWeekCompletions, getWeekIdForDate } from '@/lib/firebase';
import {
  rollPack, dailyPackId, weeklyPackId, weekDateKeys, tasksDueFor, isDayComplete,
  isPerfectWeek, parseDateKey, dateKeyOf,
} from '@/lib/surprisePacks';

export interface PackAward { memberId: string; kind: 'daily' | 'weekly'; points: number }

/** Write a pack once. Returns the points if THIS call awarded it, else null. */
async function awardOnce(familyId: string, memberId: string, id: string, kind: 'daily' | 'weekly', when: Date): Promise<number | null> {
  const ref = Col.transactions(familyId).doc(id);
  const points = rollPack(kind);
  return firestore().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (snap.exists()) return null;
    txn.set(ref, {
      familyId,
      memberId,
      delta: points,
      reason: kind === 'daily' ? '🎁 Surprise pack — every task done today!' : '🏆 Perfect-week surprise pack!',
      source: 'bonus',
      surprise: kind,
      referenceId: id,
      createdAt: firestore.Timestamp.fromDate(when),
    });
    return points;
  });
}

/**
 * Check one member for one day and award whatever they've earned. Safe to call
 * any number of times — already-awarded packs are skipped. Never throws (a pack
 * is a bonus; failing to award one must not break the action that called it).
 */
export async function checkSurprisePacks(params: {
  familyId: string;
  member: { id: string; isManaged?: boolean };
  dateKey: string; // the day that may have just been completed (YYYY-MM-DD)
  weekStartDay?: number;
}): Promise<PackAward[]> {
  const { familyId, member, dateKey } = params;
  const weekStartDay = params.weekStartDay ?? 1;
  const awards: PackAward[] = [];
  try {
    const day = parseDateKey(dateKey);
    const isToday = dateKey === dateKeyOf(new Date());
    const [tasks, completions] = await Promise.all([
      getActiveTasks(familyId),
      getWeekCompletions(familyId, getWeekIdForDate(day)),
    ]);
    const period = {
      todayStr: dateKey,
      weekId: getWeekIdForDate(day),
      monthId: dateKey.slice(0, 7),
    };
    const due = tasksDueFor(tasks as any[], member, day, weekStartDay);
    if (!isDayComplete(due, completions as any[], member.id, period)) return awards;

    // Stamp the pack on the day it was earned so it lands in that day's week.
    const when = isToday ? new Date() : day;
    const daily = await awardOnce(familyId, member.id, dailyPackId(member.id, dateKey), 'daily', when);
    if (daily != null) awards.push({ memberId: member.id, kind: 'daily', points: daily });

    // Perfect week? (single-field query on memberId — no composite index)
    const keys = weekDateKeys(day, weekStartDay);
    const snap = await Col.transactions(familyId).where('memberId', '==', member.id).get();
    const prefix = `surprise_day_${member.id}_`;
    const packDays = new Set(snap.docs.filter((d) => d.id.startsWith(prefix)).map((d) => d.id.slice(prefix.length)));
    if (isPerfectWeek(packDays, keys)) {
      const weekly = await awardOnce(familyId, member.id, weeklyPackId(member.id, keys[0]), 'weekly', when);
      if (weekly != null) awards.push({ memberId: member.id, kind: 'weekly', points: weekly });
    }
  } catch (e) {
    if (__DEV__) console.warn('[surprise] check failed', e);
  }
  return awards;
}
