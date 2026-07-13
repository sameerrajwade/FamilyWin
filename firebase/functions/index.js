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
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');

initializeApp();

const db = getFirestore();

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
