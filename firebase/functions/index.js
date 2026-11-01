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

// Deploy marker: Phase F2 — dailyStreakCheck counts streaks with shields in each
// member's own timezone (2026-11-01). Earlier: Phase D points-lock, crowns, overtaken.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { runMissedTaskSweep, localDateKey } = require('./sweep');
const {
  competitors, buildRanked, computeCrowns, crownsSummary, detectOvertakes,
  streakWithShields, reachedMilestones, STREAK_WINDOW_DAYS, shouldAutoApprove,
} = require('./game');
const league = require('./league');

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

/**
 * The timestamp a completion's transaction should carry. Normal (same-day)
 * completions use now, so they count toward the current week. But a BACK-DATED
 * completion — a miss/auto-fail penalty or a late catch-up — belongs to the day
 * it happened on, not today: stamping it "now" would (wrongly) drop last week's
 * catch-up points/penalties into the CURRENT week's competition. So for those we
 * stamp noon UTC of the completion's own `completedDate`, landing the tx in that
 * day's week (it then only affects the all-time/lifetime total). See PROGRESS
 * iter 39 + the user's feedback #2.
 */
function txCreatedAt(c) {
  const backDated = c && (c.completedLate === true || c.wasAutoFailed === true);
  if (backDated && typeof c.completedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.completedDate)) {
    const [y, m, d] = c.completedDate.split('-').map(Number);
    return Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  }
  return Timestamp.now();
}

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
    // Phase D2 — fairness lock: a pending claim freezes the task's point value
    // at claim time (stampLockedPoints, below). If present we award THAT, so a
    // parent editing the task's points while a claim waits never changes what the
    // approval pays out. Absent (immediate award, or a pre-D2 pending claim) →
    // the current task value, exactly as before. lockedPoints is written only by
    // the server (admin SDK), never trusted from the client, so this keeps the
    // Phase 1.8 point-integrity guarantee intact.
    const award = typeof c.lockedPoints === 'number' ? c.lockedPoints : pointValue;
    if (award <= 0) return;
    delta = award;
    reason = c.completedLate ? `Completed (late): ${title}` : `Completed: ${title}`;
  }

  await txCol(familyId).add({
    familyId,
    memberId: c.memberId,
    delta,
    reason,
    source: 'task',
    referenceId: completionId,
    createdAt: txCreatedAt(c),
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
    // Match the day of the tx being reversed so the reversal nets to zero within
    // the SAME week (a back-dated catch-up/penalty and its undo both land in that
    // day's week, never split across weeks).
    createdAt: txCreatedAt(c),
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

/**
 * Phase D2 — freeze a pending AWARD claim's point value at claim time. Reads the
 * task's current pointValue (server-authoritative) and merges it onto the
 * completion as `lockedPoints`, so awardForCompletion pays that out on approval
 * regardless of any later edit to the task. Only for positive claims (penalties
 * recompute from the family's penalty mode and need no lock). Merging status
 * stays 'pending', so onCompletionUpdated (which only reacts to a status change)
 * does not re-fire an award.
 */
async function stampLockedPoints(familyId, completionId, c) {
  const familyRef = db.collection('families').doc(familyId);
  const [taskSnap, familySnap] = await Promise.all([
    familyRef.collection('tasks').doc(c.taskId).get(),
    familyRef.get(),
  ]);
  const task = taskSnap.exists ? taskSnap.data() : null;
  const pointValue = task ? (task.pointValue || 0) : 0;
  const update = { lockedPoints: pointValue };
  // G5 — approval trust levels: a small task (≤ the family's auto-approve
  // limit) that the parent hasn't marked "needs approval" / "photo proof" is
  // approved here, by the server — kids still can't self-approve (rules). The
  // status flip fires onCompletionUpdated, which pays the locked points.
  if (shouldAutoApprove({ task, family: familySnap.exists ? familySnap.data() : null, points: pointValue, completion: c })) {
    update.status = 'approved';
    update.approvedBy = 'auto';
    update.approvedAt = Timestamp.now();
  }
  await familyRef.collection('completions').doc(completionId).set(update, { merge: true });
}

// Award (or penalize) on completion create. Idempotent per completion id.
exports.onCompletionCreated = onDocumentCreated(
  'families/{familyId}/completions/{completionId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const c = snap.data();
    if (!c || c.serverAward !== true) return; // legacy/self-awarded — skip
    const { familyId, completionId } = event.params;
    if (!isAwardable(c)) {
      // Phase 4.3: awaiting parent approval → don't settle yet. Phase D2: but
      // DO freeze the task's point value now so a later edit can't change the
      // approved payout (positive claims only; absent lockedPoints means pre-D2).
      if (c.status === 'pending' && c.wasAutoFailed !== true && typeof c.lockedPoints !== 'number') {
        await stampLockedPoints(familyId, completionId, c);
      }
      return;
    }
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

// ─── LIVE "YOU GOT OVERTAKEN" PUSH (Phase D4) ────────────────────────────────
// When a member earns points and climbs past someone on THIS week's leaderboard,
// nudge the people they passed so the race stays live. Fires on every
// transaction create (including the CF's own award tx), but does real work only
// for a fresh, positive, this-week transaction by a competing member — and only
// notifies members who were ahead and are now behind. Sends no transaction of
// its own, so it can never loop.

/** The UTC week window [start, end) containing `now`, honoring weekStartDay. */
function weekRangeUTC(weekStartDay, now) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (day.getUTCDay() - (weekStartDay || 1) + 7) % 7;
  const start = new Date(day); start.setUTCDate(day.getUTCDate() - back);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

exports.onTransactionCreated = onDocumentCreated(
  'families/{familyId}/transactions/{txId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const tx = snap.data();
    if (!tx) return;

    // G7: any points change (up or down) refreshes this family's fair score
    // in every league it's in. Writes only under leagues/ — never a new
    // transaction — so this can't loop. Never let it break the overtaken push.
    try {
      await league.writeStandings(db, event.params.familyId, new Date());
    } catch (err) {
      console.error(`league standings update failed family=${event.params.familyId}:`, err && err.message);
    }

    const delta = tx.delta || 0;
    if (delta <= 0) return; // only climbing moves someone up

    // Live only: a back-dated catch-up/penalty tx (stamped on a past day) is
    // history, not a live overtake — skip anything not from roughly "now".
    const when = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate() : new Date();
    const ageMs = Date.now() - when.getTime();
    if (ageMs > 2 * 24 * 60 * 60 * 1000 || ageMs < -60 * 60 * 1000) return;

    const { familyId } = event.params;
    const actorId = tx.memberId;
    if (!actorId) return;

    const familySnap = await db.collection('families').doc(familyId).get();
    if (!familySnap.exists) return;
    const familyData = familySnap.data();

    const membersSnap = await db
      .collection('families').doc(familyId).collection('members').get();
    const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const mode = familyData.competitionMode === 'kids' ? 'kids' : 'everyone';
    const players = competitors(members, mode);
    const competitorIds = players.map((m) => m.id);
    if (!competitorIds.includes(actorId)) return; // actor coaches, doesn't race

    // This week's earned totals (reward spending excluded), including this tx.
    const { start, end } = weekRangeUTC(familyData.weekStartDay, when);
    const weekSnap = await db
      .collection('families').doc(familyId).collection('transactions')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<', Timestamp.fromDate(end))
      .get();
    const totals = {};
    for (const id of competitorIds) totals[id] = 0;
    for (const d of weekSnap.docs) {
      const t = d.data();
      if (totals[t.memberId] === undefined) continue;
      if (t.source === 'redemption') continue;
      totals[t.memberId] += t.delta || 0;
    }

    const passed = detectOvertakes(actorId, totals, delta, competitorIds);
    if (!passed.length) return;

    const actor = members.find((m) => m.id === actorId);
    const actorName = (actor && actor.displayName ? actor.displayName : 'Someone').split(' ')[0];
    const actorNow = totals[actorId] || 0;

    // Notify each passed member on their own device (if they allow push).
    for (const memberId of passed) {
      const cfg = await db
        .collection('families').doc(familyId)
        .collection('notificationConfigs').doc(memberId).get();
      if (!cfg.exists) continue;
      const c = cfg.data();
      // G4: each person can switch this push off in Settings → Notifications.
      if (c.enabled === false || c.overtakenOff === true || !c.pushToken) continue;
      const theirPoints = totals[memberId] || 0;
      const gap = actorNow - theirPoints;
      try {
        await getMessaging().send({
          notification: {
            title: `${actorName} just passed you!`,
            body: gap <= 0
              ? `You're tied — do a task to pull back ahead.`
              : `${actorName} is ${gap} pt${gap === 1 ? '' : 's'} ahead. Do a task to retake the lead!`,
          },
          data: { screen: 'leaderboard', actorId, memberId },
          android: { channelId: 'alerts', priority: 'high' },
          token: c.pushToken,
        });
      } catch (err) {
        console.error(`overtaken push failed family=${familyId} member=${memberId}:`, err && err.message);
      }
    }
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

      // Aggregate transactions over the LAST TWO weeks: the crowned week
      // (lastMonday→lastSunday) plus the week before it, which is the baseline
      // for the 📈 Most Improved crown. Reward spending is excluded so totals
      // match the leaderboard's "earned" number.
      const prevMonday = new Date(lastMonday);
      prevMonday.setDate(lastMonday.getDate() - 7);
      const txSnap = await db
        .collection('families').doc(familyId)
        .collection('transactions')
        .where('createdAt', '>=', Timestamp.fromDate(prevMonday))
        .where('createdAt', '<=', Timestamp.fromDate(lastSunday))
        .get();

      const totals = {};
      const baseline = {};
      for (const member of members) { totals[member.id] = 0; baseline[member.id] = 0; }
      for (const txDoc of txSnap.docs) {
        const { memberId, delta, source } = txDoc.data();
        if (totals[memberId] === undefined) continue;
        if (source === 'redemption') continue;
        const when = txDoc.data().createdAt && txDoc.data().createdAt.toDate();
        if (when && when < lastMonday) baseline[memberId] += delta;
        else totals[memberId] += delta;
      }

      // Rank + crown only the members who COMPETE (Phase D3 — competitionMode).
      // In 'kids' mode parents coach and don't rank; a kid-less family still
      // falls back to everyone (see game.competitors).
      const mode = familyData.competitionMode === 'kids' ? 'kids' : 'everyone';
      const players = competitors(members, mode);
      const entries = buildRanked(totals, players);
      const goals = {};
      for (const m of players) if (typeof m.weeklyGoal === 'number' && m.weeklyGoal > 0) goals[m.id] = m.weeklyGoal;
      const crowns = computeCrowns(entries, baseline, goals);

      const ranked = entries.map((e) => ({
        memberId: e.memberId,
        displayName: e.displayName,
        avatarEmoji: e.avatarEmoji,
        points: e.points,
        rank: e.rank,
        winner: e.rank === 1 && e.points > 0,
      }));

      // Write weekly score document (now carries the crown row too).
      await db
        .collection('families').doc(familyId)
        .collection('weeklyScores').doc(weekId)
        .set({
          weekId,
          weekStart: Timestamp.fromDate(lastMonday),
          weekEnd: Timestamp.fromDate(lastSunday),
          scores: ranked,
          crowns,
          processedAt: Timestamp.now(),
        });

      // ── Send FCM push to all members ─────────────────────────────────────
      const winner = ranked.find((r) => r.winner) || null;
      const summary = crownsSummary(crowns); // names every awarded crown

      // Fetch push tokens from notificationConfigs
      const configsSnap = await db
        .collection('families').doc(familyId)
        .collection('notificationConfigs')
        .where('enabled', '==', true)
        .get();

      const tokens = configsSnap.docs
        .filter((d) => d.data().weeklyResultsOff !== true) // G4: per-person off switch
        .map((d) => d.data().pushToken)
        .filter(Boolean);

      // Body names every crown this week, not just the top scorer. With no
      // points earned at all, invite everyone into the fresh week instead.
      const body = summary
        ? `${summary}. New week starts now!`
        : 'A fresh week is up for grabs — first points win it!';

      if (tokens.length > 0) {
        const message = {
          notification: {
            title: `🏆 ${familyData.name} — weekly results!`,
            body,
          },
          data: {
            screen: 'leaderboard',
            weekId,
            winnerId: winner ? winner.memberId : '',
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

      results.push({ familyId, weekId, memberCount: members.length, winner: winner ? winner.displayName : null, winnerPoints: winner ? winner.points : 0 });
    } catch (err) {
      console.error(`Error processing family ${familyId}:`, err);
    }
  }

  console.log('Weekly reset complete:', JSON.stringify(results, null, 2));
  return null;
});

// ─── STREAK BONUS ─────────────────────────────────────────────────────────────
// Runs daily at 01:00 UTC — awards streak bonuses (7d / 14d / 30d).
//
// Phase F2 rewrite: the streak is counted exactly like the app counts it
// (game.streakWithShields — streak shields, "today isn't over"), on days in each
// member's OWN timezone. The old version counted UTC days ending on the UTC day
// that had just begun at 01:00, so for a US family the streak read 0 almost
// every run and the bonuses effectively never paid. A milestone is now paid once
// the streak has REACHED it (not only on the exact day), still at most once per
// member per milestone (same reason-string dedupe as before).

exports.dailyStreakCheck = onSchedule('0 1 * * *', async () => {
  const STREAK_BONUSES = { 7: 50, 14: 100, 30: 250 };
  const now = new Date();
  const familiesSnap = await db.collection('families').get();

  for (const familyDoc of familiesSnap.docs) {
    const familyId = familyDoc.id;
    const familyRef = db.collection('families').doc(familyId);
    try {
      const [membersSnap, configsSnap, recentSnap] = await Promise.all([
        familyRef.collection('members').get(),
        familyRef.collection('notificationConfigs').get(),
        // ONE single-field range query per family (no composite index needed).
        familyRef.collection('completions')
          .where('completedAt', '>=', Timestamp.fromMillis(now.getTime() - (STREAK_WINDOW_DAYS + 1) * 86400000))
          .get(),
      ]);

      const tzByMember = {};
      configsSnap.docs.forEach((d) => { if (d.data().timezone) tzByMember[d.id] = d.data().timezone; });
      const familyTz = Object.values(tzByMember)[0] || 'UTC';
      const weekStartDay = familyDoc.data().weekStartDay ?? 1;

      for (const memberDoc of membersSnap.docs) {
        const memberId = memberDoc.id;
        const tz = tzByMember[memberId] || familyTz;
        const dayKeys = recentSnap.docs
          .map((d) => d.data())
          .filter((c) => c.memberId === memberId && c.completedAt && c.wasAutoFailed !== true && c.status !== 'rejected')
          .map((c) => localDateKey(c.completedAt.toDate(), tz));
        const { streak } = streakWithShields(dayKeys, localDateKey(now, tz), weekStartDay);

        for (const milestone of reachedMilestones(streak, STREAK_BONUSES)) {
          const reason = `🔥 ${milestone}-day streak bonus!`;
          const alreadyAwarded = await familyRef.collection('transactions')
            .where('memberId', '==', memberId)
            .where('reason', '==', reason)
            .limit(1)
            .get();
          if (!alreadyAwarded.empty) continue;

          await familyRef.collection('transactions').add({
            familyId,
            memberId,
            delta: STREAK_BONUSES[milestone],
            reason,
            source: 'bonus',
            createdAt: Timestamp.now(),
          });
          console.log(`Streak bonus: family=${familyId} member=${memberId} streak=${streak} milestone=${milestone}`);
        }
      }
    } catch (err) {
      console.error(`dailyStreakCheck failed for family ${familyId}:`, err);
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

// ─── FAMILY VS FAMILY LEAGUES (Phase G7) ─────────────────────────────────────
// Parent-only callables; the logic + data shape live in league.js. A parent of
// the caller's own family starts / joins / leaves on the family's behalf.

async function requireParentFamily(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const user = (await db.collection('users').doc(uid).get()).data();
  if (!user || !user.familyId || !user.memberId) throw new HttpsError('failed-precondition', 'Join a family first.');
  const me = (await db.collection('families').doc(user.familyId).collection('members').doc(user.memberId).get()).data();
  if (!me || (me.role !== 'parent' && me.role !== 'admin_parent')) {
    throw new HttpsError('permission-denied', 'Only a parent can manage leagues.');
  }
  return { uid, familyId: user.familyId };
}

function asHttpsError(err) {
  if (err instanceof HttpsError) return err;
  if (err instanceof league.LeagueError) return new HttpsError(err.code, err.message);
  console.error('league call failed:', err);
  return new HttpsError('internal', 'Something went wrong — please try again.');
}

exports.createLeague = onCall(async (request) => {
  const { familyId } = await requireParentFamily(request);
  try {
    return await league.createLeague(db, { familyId, name: (request.data || {}).name });
  } catch (err) { throw asHttpsError(err); }
});

exports.joinLeague = onCall(async (request) => {
  const { uid, familyId } = await requireParentFamily(request);
  // Same sliding-window brute-force guard as joinFamily, kept separately.
  const rlRef = db.collection('joinRateLimits').doc(`league_${uid}`);
  const now = Date.now();
  const prior = (await rlRef.get()).data();
  const attempts = ((prior && prior.attempts) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (attempts.length >= JOIN_MAX_ATTEMPTS_PER_HOUR) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
  }
  attempts.push(now);
  await rlRef.set({ attempts }, { merge: true });
  try {
    return await league.joinLeague(db, { familyId, code: (request.data || {}).inviteCode });
  } catch (err) { throw asHttpsError(err); }
});

exports.leaveLeague = onCall(async (request) => {
  const { familyId } = await requireParentFamily(request);
  try {
    return await league.leaveLeague(db, { familyId, leagueId: String((request.data || {}).leagueId || '') });
  } catch (err) { throw asHttpsError(err); }
});
