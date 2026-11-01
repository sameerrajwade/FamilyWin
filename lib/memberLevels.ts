/**
 * lib/memberLevels.ts — the family ledger + everyone's lifetime level, app-wide
 * ─────────────────────────────────────────────────────────────────────────────
 * Frames show on every avatar (leaderboard, family list, profile strip…), so
 * each screen needs every member's level, not just its own (Phase E3). Seasons,
 * season badges and the report's game-health numbers (Phase F) need the whole
 * ledger too. One family-wide transactions listener (mounted in
 * app/app/tabs/_layout, like the members listener) feeds this store:
 *   earned — memberId → lifetimeEarned (levels / frames)
 *   txns   — the compact ledger {memberId, delta, source, date}
 *
 * Scale note: this reads the family's whole ledger once, then only changes
 * (served cache-first). Fine for a household; if ledgers grow into the many
 * thousands, move the running totals onto the member doc via a Cloud Function.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { create } from 'zustand';
import { getLevel, lifetimeEarned } from '@/lib/pointsEngine';
import type { LedgerTx } from '@/lib/seasons';

interface MemberLevelsState {
  /** memberId → lifetime earned points (reward spending excluded). */
  earned: Record<string, number>;
  /** The family ledger, compact (seasons, badges, report health). */
  txns: LedgerTx[];
  /** False until the first snapshot lands — don't treat "missing" as Lv 1 yet. */
  loaded: boolean;
  setFromTransactions: (txns: { memberId?: string; delta: number; source?: string; createdAt?: any }[]) => void;
  reset: () => void;
}

export const useMemberLevels = create<MemberLevelsState>()((set) => ({
  earned: {},
  txns: [],
  loaded: false,
  setFromTransactions: (raw) => {
    const byMember: Record<string, { delta: number; source?: string }[]> = {};
    const txns: LedgerTx[] = [];
    for (const t of raw) {
      if (!t.memberId) continue;
      (byMember[t.memberId] ??= []).push(t);
      txns.push({ memberId: t.memberId, delta: t.delta || 0, source: t.source, date: t.createdAt?.toDate?.() ?? null });
    }
    const earned: Record<string, number> = {};
    for (const [id, list] of Object.entries(byMember)) earned[id] = lifetimeEarned(list);
    set({ earned, txns, loaded: true });
  },
  reset: () => set({ earned: {}, txns: [], loaded: false }),
}));

/** A member's level number (1 when they have no points yet). */
export function useLevelOf(memberId?: string | null): number {
  return useMemberLevels((s) => (memberId ? getLevel(s.earned[memberId] ?? 0).level : 1));
}
