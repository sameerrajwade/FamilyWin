#!/usr/bin/env node
/**
 * scripts/cleanup-bogus-penalties.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off maintenance: reverse the missed-task / auto-fail penalties that were
 * applied under the buggy timing (wrong timezone for managed kids + no deadline
 * hour + a full-point on-device auto-fail). See docs/PROGRESS.md iter 39 and the
 * user's feedback #1/#4.
 *
 * It finds every penalty transaction (source:'task', delta<0, reason starting
 * "Missed:" or "Auto-failed:") whose completion group still nets negative, and
 * for each writes ONE balancing +transaction stamped with the SAME createdAt, so
 * the penalty nets to zero in the exact week it landed in — correcting both the
 * all-time bank and each past week's totals.
 *
 * SAFETY: DRY RUN by default — prints a per-member tally and does NOTHING.
 * Add --apply to actually write the balancing transactions. Optional filters:
 *   --family=<familyId>   limit to one family (default: all families)
 *   --member=<memberId>   limit to one member
 *
 * AUTH: uses firebase-admin with Application Default Credentials. Run after:
 *   gcloud auth application-default login   (or set GOOGLE_APPLICATION_CREDENTIALS)
 * Example (dry run):
 *   node scripts/cleanup-bogus-penalties.js --family=<id>
 * Then, once the printed list looks right:
 *   node scripts/cleanup-bogus-penalties.js --family=<id> --apply
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const admin = require(path.join(__dirname, '../firebase/functions/node_modules/firebase-admin'));

const PROJECT_ID = 'familywin-35a97';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
const ONLY_FAMILY = getArg('family');
const ONLY_MEMBER = getArg('member');

const PENALTY_RE = /^(Missed|Auto-failed):/;

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

async function run() {
  const familyIds = ONLY_FAMILY
    ? [ONLY_FAMILY]
    : (await db.collection('families').get()).docs.map((d) => d.id);

  let grandPenalties = 0;
  let grandRestore = 0;

  for (const familyId of familyIds) {
    const txCol = db.collection('families').doc(familyId).collection('transactions');
    const snap = await txCol.get();

    // Group by referenceId (the completion) so we only reverse groups that still
    // net negative — never double-reverse an already-corrected one.
    const byRef = new Map(); // referenceId -> { net, penaltyDocs:[{id,data}] }
    const looseByMember = new Map(); // penalties with no referenceId (legacy) -> [{id,data}]

    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.source !== 'task') return;
      const isPenalty = (d.delta || 0) < 0 && PENALTY_RE.test(d.reason || '');
      if (d.referenceId) {
        const g = byRef.get(d.referenceId) || { net: 0, penaltyDocs: [] };
        g.net += d.delta || 0;
        if (isPenalty) g.penaltyDocs.push({ id: doc.id, data: d });
        byRef.set(d.referenceId, g);
      } else if (isPenalty) {
        const arr = looseByMember.get(d.memberId) || [];
        arr.push({ id: doc.id, data: d });
        looseByMember.set(d.memberId, arr);
      }
    });

    // Build the reversal set.
    const reversals = []; // { memberId, amount, createdAt, reason }
    for (const [, g] of byRef) {
      if (g.net >= 0) continue;           // already balanced/positive — skip
      for (const p of g.penaltyDocs) {
        reversals.push({
          memberId: p.data.memberId,
          amount: -(p.data.delta),        // positive magnitude to add back
          createdAt: p.data.createdAt,
          reason: `Restored (cleanup): ${(p.data.reason || '').replace(PENALTY_RE, '').trim()}`,
        });
      }
    }
    for (const [, arr] of looseByMember) {
      for (const p of arr) {
        reversals.push({
          memberId: p.data.memberId,
          amount: -(p.data.delta),
          createdAt: p.data.createdAt,
          reason: `Restored (cleanup): ${(p.data.reason || '').replace(PENALTY_RE, '').trim()}`,
        });
      }
    }

    const filtered = ONLY_MEMBER ? reversals.filter((r) => r.memberId === ONLY_MEMBER) : reversals;
    if (!filtered.length) { console.log(`family ${familyId}: no bogus penalties to reverse.`); continue; }

    // Per-member tally.
    const tally = {};
    filtered.forEach((r) => { tally[r.memberId] = (tally[r.memberId] || 0) + r.amount; });
    console.log(`\nfamily ${familyId}: ${filtered.length} penalty transactions to reverse`);
    Object.entries(tally).forEach(([m, amt]) => console.log(`   member ${m}: +${amt} pts restored across penalties`));
    grandPenalties += filtered.length;
    grandRestore += filtered.reduce((s, r) => s + r.amount, 0);

    if (APPLY) {
      let batch = db.batch();
      let n = 0;
      for (const r of filtered) {
        const ref = txCol.doc();
        batch.set(ref, {
          familyId,
          memberId: r.memberId,
          delta: r.amount,
          reason: r.reason,
          source: 'task',
          // No referenceId → these balancing txs are standalone (won't be picked
          // up as penalties by a re-run; PENALTY_RE won't match "Restored").
          createdAt: r.createdAt || Timestamp.now(),
          cleanup: true,
        });
        if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
      }
      if (n > 0) await batch.commit();
      console.log(`   ✅ applied ${filtered.length} reversals for family ${familyId}`);
    }
  }

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${grandPenalties} penalties, +${grandRestore} pts total would be restored.`);
  if (!APPLY) console.log('Re-run with --apply to write the balancing transactions.');
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
