/**
 * lib/memberLevels.ts — everyone's lifetime level, app-wide (Phase E3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Frames show on every avatar (leaderboard, family list, profile strip…), so
 * each screen needs every member's level, not just its own. One family-wide
 * transactions listener (mounted in app/app/tabs/_layout, like the members
 * listener) sums each member's lifetimeEarned into this store; <Avatar
 * memberId> and the level chips read from it.
 *
 * Scale note: this reads the family's whole ledger once, then only changes
 * (served cache-first). Fine for a household; if ledgers grow into the many
 * thousands, move the running total onto the member doc via the Cloud Function.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { create } from 'zustand';
import { getLevel, lifetimeEarned } from '@/lib/pointsEngine';

interface MemberLevelsState {
  /** memberId → lifetime earned points (reward spending excluded). */
  earned: Record<string, number>;
  /** False until the first snapshot lands — don't treat "missing" as Lv 1 yet. */
  loaded: boolean;
  setFromTransactions: (txns: { memberId?: string; delta: number; source?: string }[]) => void;
  reset: () => void;
}

export const useMemberLevels = create<MemberLevelsState>()((set) => ({
  earned: {},
  loaded: false,
  setFromTransactions: (txns) => {
    const byMember: Record<string, { delta: number; source?: string }[]> = {};
    for (const t of txns) {
      if (!t.memberId) continue;
      (byMember[t.memberId] ??= []).push(t);
    }
    const earned: Record<string, number> = {};
    for (const [id, list] of Object.entries(byMember)) earned[id] = lifetimeEarned(list);
    set({ earned, loaded: true });
  },
  reset: () => set({ earned: {}, loaded: false }),
}));

/** A member's level number (1 when they have no points yet). */
export function useLevelOf(memberId?: string | null): number {
  return useMemberLevels((s) => (memberId ? getLevel(s.earned[memberId] ?? 0).level : 1));
}
