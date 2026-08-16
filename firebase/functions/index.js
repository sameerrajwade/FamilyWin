/**
 * firebase/functions/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Cloud Function — Weekly Reset
 * Replaces the Supabase Edge Function (supabase/weekly-reset.ts)
 *
 * Runs every Monday at 00:01 UTC
 * 1. Aggregates last week's point_transactions per family member
 * 2. Ranks members, stores weekly_scores
 * 3. Sends FCM push notifications to all family members
 *
 * Deploy: firebase deploy --only functions
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { runMissedTaskSweep } = require('./sweep');

initializeApp();

const db = getFirestore();

// ─── SERVER-AUTHORITATIVE POINTS (Phase 1.8) ──────────────────────────────────
// Points for task completions are settled here, not by the client, so a modified
// client can't forge `source:'task'` transactions (firestore.rules blocks those
// for clients once this is live). The client (>= the 1.8 build) writes ONLY the
// completion doc, stamped `serverAward: true`, and this trigger mirrors it into a
// transaction using the task's authoritative pointValue. Older clients omit the
// flag and are ignored here (they still write their own tx) — this keeps the
// deploy overlap window safe from double-counting. See docs/POINT_INTEGRITY.md.

/** Points to deduct for a missed daily task (mirrors lib/pointsEngine.ts). */
function missedTaskPenaltyAmount(pointValue, mode) {
  if (mode === 'off' || !pointValue || pointValue <= 0) return 0;
  if (mode === 'full') return pointValue;
  return Math.max(1, Math.round(pointValue / 2));
}
function missedPenaltyMode(family) {
  const v = family && family.missedTaskPenalty;
  if (v === true) return 'half';
  if (v === 'half' || v === 'full') return v;
  return 'off';
}

const txCol = (familyId) =>
  db.collection('families').doc(familyId).collection('transactions');

// ─── SHARED SETTLE / REVERSE ──────────────────────────────────────────────────
// Extracted so create (immediate), update (Phase 4.3 approval pending→approved),
// and delete (undo / catch-up) all go through one authoritative code path.

/**
 * Write the single points transaction for a completion, from the task's
 * authoritative pointValue. Idempotent: no-op if a tx already references this
 * completion (so approve-after-create, or a re-fired trigger, never double-count).
 */
async function awardForCompletion(familyId, completionId, c) {
  const dup = await txCol(familyId).where('referenceId', '==', completionId).limit(1).get();
  if (!dup.empty) return;

  const taskSnap = await db
    .collection('families').doc(familyId).collection('tasks').doc(c.taskId).get();
  const pointValue = taskSnap.exists ? (taskSnap.data().pointValue || 0) : 0;
  const title = taskSnap.exists ? (taskSnap.data().title || 'Task') : 'Task';

  let delta;
  let reason;
  if (c.wasAutoFailed === true) {
    let penalty;
    if (c.penaltyKind === 'autofail') {
      // Auto-fail (task not done by its autoFailHour): full point value.
      penalty = pointValue;
    } else {
      // Missed-task penalty feature ('miss' / legacy): half|full|off setting.
      const familySnap = await db.collection('families').doc(familyId).get();
      const mode = missedPenaltyMode(familySnap.exists ? familySnap.data() : null);
      penalty = missedTaskPenaltyAmount(pointValue, mode);
    }
    if (penalty <= 0) return;
    delta = -penalty;
    reason = c.penaltyKind === 'autofail' ? `Auto-failed: ${title}` : `Missed: ${title}`;
  } else {
    if (pointValue <= 0) return;
    delta = pointValue;
    reason = c.completedLate ? `Completed (late): ${title}` : `Completed: ${title}`;
  }

  await txCol(familyId).add({
    familyId,
    memberId: c.memberId,
    delta,
    reason,
    source: 'task',
    referenceId: completionId,
    createdAt: Timestamp.now(),
  });
}

/**
 * Balance out any transactions referencing a completion (undo / catch-up / a
 * parent rejecting an already-approved completion). Idempotent: no-op if the
 * referencing transactions already net to zero.
 */
async function reverseForCompletion(familyId, completionId, c) {
  const refd = await txCol(familyId).where('referenceId', '==', completionId).get();
  if (refd.empty) return;
  const sum = refd.docs.reduce((s, d) => s + (d.data().delta || 0), 0);
  if (sum === 0) return; // already balanced

  const taskSnap = await db
    .collection('families').doc(familyId).collection('tasks').doc(c.taskId).get();
  const title = taskSnap.exists ? (taskSnap.data().title || 'Task') : 'Task';

  await txCol(familyId).add({
    familyId,
    memberId: c.memberId,
    delta: -sum,
    reason: sum > 0 ? `Undo: ${title}` : `Restored: ${title}`,
    source: 'task',
    referenceId: completionId,
    createdAt: Timestamp.now(),
  });
}

/**
 * Phase 4.3: a completion for a task that requires parent approval is created
 * with status:'pending' and settles points only once a parent approves. A
 * completion with no status (or 'approved') settles immediately as before —
 * fully backward compatible with pre-4.3 completions.
 */
function isAwardable(c) {
  return c.status !== 'pending' && c.status !== 'rejected';
}

// Award (or penalize) on completion create. Idempotent per completion id.
exports.onCompletionCreated = onDocumentCreated(
  'families/{familyId}/completions/{completionId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const c = snap.data();
    if (!c || c.serverAward !== true) return; // legacy/self-awarded — skip
    if (!isAwardable(c)) return; // Phase 4.3: awaiting parent approval
    const { familyId, completionId } = event.params;
    await awardForCompletion(familyId, completionId, c);
  },
);

// Phase 4.3: settle points when a parent approves a pending completion, and
// reverse them if a parent later rejects an approved one. Only reacts to a
// status transition so ordinary field touches don't re-award.
exports.onCompletionUpdated = onDocumentUpdated(
  'families/{familyId}/completions/{completionId}',
  async (event) => {
    const before = event.data && event.data.before && event.data.before.data();
    const after = event.data && event.data.after && event.data.after.data();
    if (!after || after.serverAward !== true) return;
    const { familyId, completionId } = event.params;

    const was = before ? before.status : undefined;
    const now = after.status;
    if (was === now) return; // no status change → nothing to do

    if (now === 'approved') {
      await awardForCompletion(familyId, completionId, after);
    } else if (now === 'rejected') {
      await reverseForCompletion(familyId, completionId, after);
    }
  },
);

// Reverse on completion delete (undo, or catch-up removing a miss). Idempotent:
// if the transactions referencing this completion already net to zero, do
// nothing; otherwise write the single balancing transaction.
exports.onCompletionDeleted = onDocumentDeleted(
  'families/{familyId}/completions/{completionId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const c = snap.data();
    if (!c || c.serverAward !== true) return;
    const { familyId, completionId } = event.params;
    await reverseForCompletion(familyId, completionId, c);
  },
);

// ─── WEEKLY RESET ─────────────────────────────────────────────────────────────
// Cron: every Monday at 00:01 UTC
// equiv: 0 0 * * 1  (Supabase cron was '1 0 * * 1')

exports.weeklyReset = onSchedule('1 0 * * 1', async (event) => {
  const now = new Date();

  // ── Calculate last week's Monday–Sunday ──────────────────────────────────
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - 7);
  lastMonday.setHours(0, 0, 0, 0);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);

  // weekId format: YYYY-WNN
  const startOfYear = new Date(lastMonday.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((lastMonday - startOfYear) / 86_400_000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  const weekId = `${lastMonday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  console.log(`Weekly reset: weekId=${weekId} | ${lastMonday.toISOString()} → ${lastSunday.toISOString()}`);

  // ── Process every family ──────────────────────────────────────────────────
  const familiesSnap = await db.collection('families').get();
  const results = [];

  for (const familyDoc of familiesSnap.docs) {
    const familyId = familyDoc.id;
    const familyData = familyDoc.data();

    try {
      // Fetch members
      const membersSnap = await db
        .collection('families').doc(familyId)
        .collection('members')
        .get();
      const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!members.length) continue;

      // Aggregate point transactions for the week
      const txSnap = await db
        .collection('families').doc(familyId)
        .collection('transactions')
        .where('createdAt', '>=', Timestamp.fromDate(lastMonday))
        .where('createdAt', '<=', Timestamp.fromDate(lastSunday))
        .get();

      const totals = {};
      for (const member of members) totals[member.id] = 0;
      for (const txDoc of txSnap.docs) {
        const { memberId, delta } = txDoc.data();
        if (totals[memberId] !== undefined) totals[memberId] += delta;
      }

      // Rank members
      const ranked = [...members]
        .sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
        .map((member, idx) => ({
          memberId: member.id,
          displayName: member.displayName,
          avatarEmoji: member.avatarEmoji,
          points: totals[member.id] ?? 0,
          rank: idx + 1,
          winner: idx === 0,
        }));

      // Write weekly score document
      await db
        .collection('families').doc(familyId)
        .collection('weeklyScores').doc(weekId)
        .set({
          weekId,
          weekStart: Timestamp.fromDate(lastMonday),
          weekEnd: Timestamp.fromDate(lastSunday),
          scores: ranked,
          processedAt: Timestamp.now(),
        });

      // ── Send FCM push to all members ─────────────────────────────────────
      const winner = ranked[0];

      // Fetch push tokens from notificationConfigs
      const configsSnap = await db
        .collection('families').doc(familyId)
        .collection('notificationConfigs')
        .where('enabled', '==', true)
        .get();

      const tokens = configsSnap.docs
        .map((d) => d.data().pushToken)
        .filter(Boolean);

      if (tokens.length > 0) {
        const message = {
          notification: {
            title: `🏆 ${familyData.name} Weekly Results!`,
            body: `${winner.avatarEmoji} ${winner.displayName} wins with ${winner.points} pts! New week starts now.`,
          },
          data: {
            screen: 'leaderboard',
            weekId,
            winnerId: winner.memberId,
          },
          android: {
            channelId: 'weekly-results',
            priority: 'high',
          },
          tokens,
        };

        const response = await getMessaging().sendEachForMulticast(message);
        console.log(`Family ${familyId}: sent ${response.successCount}/${tokens.length} notifications`);
      }

      results.push({ familyId, weekId, memberCount: members.length, winner: winner.displayName, winnerPoints: winner.points });
    } catch (err) {
      console.error(`Error processing family ${familyId}:`, err);
    }
  }

  console.log('Weekly reset complete:', JSON.stringify(results, null, 2));
  return null;
});

// ─── STREAK BONUS ─────────────────────────────────────────────────────────────
// Runs daily at 01:00 UTC — awards streak bonuses (7d / 14d / 30d)

exports.dailyStreakCheck = onSchedule('0 1 * * *', async (event) => {
  const STREAK_BONUSES = { 7: 50, 14: 100, 30: 250 };
  const familiesSnap = await db.collection('families').get();

  for (const familyDoc of familiesSnap.docs) {
    const familyId = familyDoc.id;
    const membersSnap = await db
      .collection('families').doc(familyId)
      .collection('members').get();

    for (const memberDoc of membersSnap.docs) {
      const memberId = memberDoc.id;

      // Calculate streak from last 35 days of completions
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 35);

      const completionsSnap = await db
        .collection('families').doc(familyId)
        .collection('completions')
        .where('memberId', '==', memberId)
        .where('completedAt', '>=', Timestamp.fromDate(cutoff))
        .where('wasAutoFailed', '==', false)
        .get();

      const daysWithCompletions = new Set(
        completionsSnap.docs.map((d) => {
          const date = d.data().completedAt.toDate();
          return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        }),
      );

      // Count consecutive days ending today
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 35; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (daysWithCompletions.has(key)) streak++;
        else break;
      }

      // Check if streak milestone hit today
      const bonus = STREAK_BONUSES[streak];
      if (!bonus) continue;

      // Avoid double-awarding: check if bonus already given for this streak length
      const alreadyAwarded = await db
        .collection('families').doc(familyId)
        .collection('transactions')
        .where('memberId', '==', memberId)
        .where('reason', '==', `🔥 ${streak}-day streak bonus!`)
        .limit(1)
        .get();

      if (!alreadyAwarded.empty) continue;

      await db.collection('families').doc(familyId)
        .collection('transactions').add({
          familyId,
          memberId,
          delta: bonus,
          reason: `🔥 ${streak}-day streak bonus!`,
          source: 'bonus',
          createdAt: Timestamp.now(),
        });

      console.log(`Streak bonus: family=${familyId} member=${memberId} streak=${streak} bonus=${bonus}`);
    }
  }
  return null;
});

// ─── TIMEZONE-AWARE MISSED-TASK SWEEP ────────────────────────────────────────
// Backstop for members who never open the app: penalizes daily tasks missed on a
// member's LOCAL (fully-elapsed) day, using their stored notificationConfigs
// timezone. The client applies the same penalty lazily on Home load; both write
// the same deterministic completion id `miss__{task}__{member}__{date}` and guard
// on existing completions, so they can never double-penalize. Hourly so each
// timezone's day-rollover is caught promptly; the existence guard makes repeated
// runs over the grace window cheap and idempotent. The sweep logic lives in
// sweep.js so it can be unit-tested directly against the emulator.
exports.missedTaskSweep = onSchedule('0 * * * *', async () => {
  const result = await runMissedTaskSweep(db, new Date());
  console.log('missedTaskSweep:', JSON.stringify(result));
  return null;
});

// ─── DELETE ACCOUNT (Play policy: in-app account deletion) ────────────────────
// Callable from the client. Server-authoritative so it can (a) cascade-delete a
// family the last account-holder is leaving, (b) delete Storage photos, and
// (c) delete the Auth user itself — none of which the client can/should do
// under our security rules.
//
// Rules:
//   • If the caller is the family's admin_parent AND no OTHER member has a
//     linked account (userId), the whole family + its photos are deleted
//     (this removes all managed-child data too — required for Play deletion).
//   • Otherwise only the caller's own member doc, notif config, and photo are
//     removed; the family and other members are left intact.
//   • The caller's /users/{uid} doc and Firebase Auth user are always deleted.
exports.deleteAccount = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const { familyId, memberId } = userSnap.exists ? userSnap.data() : {};

  if (familyId && memberId) {
    const familyRef = db.collection('families').doc(familyId);
    const membersSnap = await familyRef.collection('members').get();
    const myMember = membersSnap.docs.find((d) => d.id === memberId);
    const isAdmin = myMember && myMember.data().role === 'admin_parent';
    const otherAccountHolders = membersSnap.docs.filter(
      (d) => d.id !== memberId && d.data().userId,
    );

    const bucket = getStorage().bucket();
    if (isAdmin && otherAccountHolders.length === 0) {
      // Last account-holder → wipe the entire family and all its photos.
      await bucket.deleteFiles({ prefix: `member-photos/${familyId}/` }).catch(() => {});
      await db.recursiveDelete(familyRef);
      console.log(`deleteAccount: full family wipe family=${familyId} by uid=${uid}`);
    } else {
      // Co-parents/others remain → remove only this member's footprint.
      await bucket.file(`member-photos/${familyId}/${memberId}.jpg`).delete().catch(() => {});
      await familyRef.collection('members').doc(memberId).delete().catch(() => {});
      await familyRef.collection('notificationConfigs').doc(memberId).delete().catch(() => {});
      console.log(`deleteAccount: member-only removal family=${familyId} member=${memberId}`);
    }
  }

  await userRef.delete().catch(() => {});
  await getAuth().deleteUser(uid);
  return { ok: true };
});

// ─── JOIN FAMILY (invite-code hardening) ──────────────────────────────────────
// Server-authoritative join so we can (a) rate-limit brute-force guessing of the
// 6-char invite code, (b) enforce a family-size cap, and (c) keep families
// NON-listable by clients (the code lookup happens here with the admin SDK, so
// firestore.rules never has to allow non-members to query /families by code).
const JOIN_MAX_ATTEMPTS_PER_HOUR = 10;
const FAMILY_MAX_MEMBERS = 8;

exports.joinFamily = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const d = request.data || {};
  const code = String(d.inviteCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Enter a valid 6-character code.');
  }

  // (a) Rate limit — sliding 1h window of attempt timestamps per user.
  const rlRef = db.collection('joinRateLimits').doc(uid);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const prior = (await rlRef.get()).data();
  const attempts = ((prior && prior.attempts) || []).filter((t) => now - t < windowMs);
  if (attempts.length >= JOIN_MAX_ATTEMPTS_PER_HOUR) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
  }
  attempts.push(now);
  await rlRef.set({ attempts }, { merge: true });

  // One family per account.
  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.exists && userSnap.data().familyId) {
    throw new HttpsError('failed-precondition', 'You are already in a family.');
  }

  // Look up family by code (admin — bypasses rules).
  const q = await db.collection('families').where('inviteCode', '==', code).limit(1).get();
  if (q.empty) throw new HttpsError('not-found', 'No family found with that code.');
  const familyRef = q.docs[0].ref;

  // (b) Size cap.
  const membersSnap = await familyRef.collection('members').get();
  if (membersSnap.size >= FAMILY_MAX_MEMBERS) {
    throw new HttpsError('resource-exhausted', 'This family is full.');
  }

  // Create the member + link the user doc, atomically. Shape mirrors
  // lib/firebase.ts::createMember.
  //
  // ROLE IS SERVER-AUTHORITATIVE: everyone who joins via a code enters as a
  // 'child'. We deliberately do NOT trust a client-supplied role — otherwise a
  // kid could join as (or default to) 'parent' and approve their own tasks /
  // reward redemptions and grant themselves points. An existing parent promotes
  // a trusted adult from the Family screen (parent-gated). This is the
  // "parent-controlled" join model.
  const memberRef = familyRef.collection('members').doc();
  const age = Number(d.age);
  const memberData = {
    familyId: familyRef.id,
    userId: uid,
    displayName: String(d.displayName || '').slice(0, 40) || 'Member',
    role: 'child',
    avatarEmoji: String(d.avatarEmoji || '🦁'),
    ...(Number.isFinite(age) && age > 0 ? { age } : {}),
    createdAt: Timestamp.now(),
  };
  const batch = db.batch();
  batch.set(memberRef, memberData);
  batch.set(db.collection('users').doc(uid), { familyId: familyRef.id, memberId: memberRef.id });
  await batch.commit();

  return { ok: true, familyId: familyRef.id, memberId: memberRef.id };
});
