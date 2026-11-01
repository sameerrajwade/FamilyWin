/**
 * lib/bounties.ts — bounties (Phase E4), Firestore side
 * ─────────────────────────────────────────────────────────────────────────────
 * A parent posts "first to wash the car +100" → anyone (but the poster) taps
 * "I did it!" → a parent approves → the points land.
 *
 *   status: open ──claim──▶ claimed ──approve──▶ done
 *                 ◀─reject / withdraw─┘
 *
 * Claiming runs in a transaction so two kids racing can't both hold it (the
 * security rules also only let a kid claim an OPEN bounty for themselves).
 * The award is a parent-written source:'bonus' transaction under a FIXED id
 * (familyGame.bountyTxId), so it can land at most once even if two parents
 * approve together. Pure rules (ordering, who can claim) live in
 * lib/familyGame so they're unit-tested.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { firestore } from '@/lib/fb';
import { Col } from '@/lib/firebase';
import { bountyTxId, type Bounty } from '@/lib/familyGame';

export class BountyTakenError extends Error {
  constructor() { super('Someone already claimed this bounty.'); this.name = 'BountyTakenError'; }
}

export interface BountyDoc extends Bounty {
  familyId: string;
  claimedAt?: Date | null;
  approvedBy?: string | null;
}

/** Live list of the family's bounties (single collection, no index needed). */
export function watchBounties(familyId: string, onChange: (b: BountyDoc[]) => void): () => void {
  return Col.bounties(familyId).onSnapshot(
    (snap) => {
      onChange(snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          familyId,
          title: x.title ?? 'Bounty',
          points: x.points ?? 0,
          emoji: x.emoji,
          status: x.status ?? 'open',
          createdBy: x.createdBy ?? '',
          claimedBy: x.claimedBy ?? null,
          createdAt: x.createdAt?.toDate?.() ?? null,
          claimedAt: x.claimedAt?.toDate?.() ?? null,
          completedAt: x.completedAt?.toDate?.() ?? null,
          approvedBy: x.approvedBy ?? null,
        };
      }));
    },
    () => onChange([]),
  );
}

/** Parent posts a new bounty. */
export async function postBounty(p: { familyId: string; title: string; points: number; emoji: string; createdBy: string }): Promise<string> {
  const ref = Col.bounties(p.familyId).doc();
  await ref.set({
    familyId: p.familyId,
    title: p.title.trim().slice(0, 60),
    points: Math.max(1, Math.round(p.points)),
    emoji: p.emoji,
    status: 'open',
    createdBy: p.createdBy,
    claimedBy: null,
    createdAt: firestore.Timestamp.now(),
  });
  return ref.id;
}

/** Claim an open bounty (kid → waits for a parent). Throws BountyTakenError if beaten to it. */
export async function claimBounty(p: { familyId: string; bountyId: string; memberId: string }): Promise<void> {
  const ref = Col.bounties(p.familyId).doc(p.bountyId);
  await firestore().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists() || (snap.data() as any).status !== 'open') throw new BountyTakenError();
    txn.update(ref, { status: 'claimed', claimedBy: p.memberId, claimedAt: firestore.Timestamp.now() });
  });
}

/** Back to open: a parent says "not yet", or the claimer withdraws. */
export async function releaseBounty(p: { familyId: string; bountyId: string }): Promise<void> {
  await Col.bounties(p.familyId).doc(p.bountyId).update({ status: 'open', claimedBy: null, claimedAt: null });
}

/**
 * Parent awards the bounty: to its claimer (approve), or straight to `memberId`
 * when a parent marks it done on a kid's behalf. Writes the fixed-id bonus
 * transaction and marks the bounty done, atomically. Returns the winner's id.
 */
export async function awardBounty(p: { familyId: string; bountyId: string; approvedBy: string; memberId?: string }): Promise<string> {
  const ref = Col.bounties(p.familyId).doc(p.bountyId);
  const txRef = Col.transactions(p.familyId).doc(bountyTxId(p.bountyId));
  return firestore().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error('This bounty was removed.');
    const b: any = snap.data();
    if (b.status === 'done') return b.claimedBy as string;
    const winner = p.memberId ?? b.claimedBy;
    if (!winner) throw new Error('Nobody has claimed this bounty yet.');
    if (p.memberId && b.status === 'claimed' && b.claimedBy && b.claimedBy !== p.memberId) throw new BountyTakenError();
    const already = await txn.get(txRef);
    const now = firestore.Timestamp.now();
    if (!already.exists()) {
      txn.set(txRef, {
        familyId: p.familyId,
        memberId: winner,
        delta: b.points ?? 0,
        reason: `🎯 Bounty: ${b.title ?? 'bounty'}`,
        source: 'bonus',
        referenceId: p.bountyId,
        createdAt: now,
      });
    }
    txn.update(ref, { status: 'done', claimedBy: winner, completedAt: now, approvedBy: p.approvedBy });
    return winner;
  });
}

/** Parent removes a bounty (open or claimed). A won bounty's points stay. */
export async function deleteBounty(p: { familyId: string; bountyId: string }): Promise<void> {
  await Col.bounties(p.familyId).doc(p.bountyId).delete();
}
