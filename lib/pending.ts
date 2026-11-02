/**
 * lib/pending.ts — ONE source for "waiting for a parent" counts (UX review
 * 2026-11-02: the Family badge, the Family row and the Today card used to show
 * three different numbers). The two live listeners live in tabs/_layout; every
 * screen reads the same totals from here.
 */
import { create } from 'zustand';

interface PendingState {
  claims: number;   // task claims waiting for an OK
  rewards: number;  // reward / pocket-money requests
  set: (p: { claims?: number; rewards?: number }) => void;
}

export const usePending = create<PendingState>((set) => ({
  claims: 0,
  rewards: 0,
  set: (p) => set(p),
}));

/** "2 tasks · 1 reward waiting for your OK" */
export function pendingLabel(claims: number, rewards: number): string {
  const parts: string[] = [];
  if (claims) parts.push(`${claims} ${claims === 1 ? 'task' : 'tasks'}`);
  if (rewards) parts.push(`${rewards} ${rewards === 1 ? 'reward' : 'rewards'}`);
  return parts.length ? `${parts.join(' · ')} waiting for your OK` : 'Nothing waiting right now';
}
