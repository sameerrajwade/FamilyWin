/**
 * firebase/functions/sweep.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Timezone-aware missed-task penalty sweep (Phase: auto-fail CF hardening).
 *
 * WHY THIS EXISTS
 * The missed-daily-task penalty is normally applied CLIENT-side, lazily, when a
 * member opens Home (lib/firebase.ts::syncMissedPenalties). That correctly uses
 * the viewer's LOCAL timezone, but it only covers members who actually open the
 * app. This server-side sweep is the backstop: it penalizes missed daily tasks
 * for EVERY member, in EACH member's own local timezone, even if they never open
 * the app.
 *
 * SAFE OVERLAP WITH THE CLIENT
 * Both the client and this sweep write the SAME deterministic completion doc id
 * `miss__{taskId}__{memberId}__{dateKey}`, and both guard on "any completion for
 * that task+member+day already exists". So a race writes ONE doc, not two, and
 * `onCompletionCreated` (which dedups the transaction by referenceId) never
 * double-penalizes. See docs/POINT_INTEGRITY.md.
 *
 * The logic lives here (taking `db` as a parameter, no app init) so it can be
 * driven directly against the emulator from a jest test — the emulator does not
 * fire onSchedule triggers on its own.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MISSED_TASK_GRACE_DAYS = 2; // mirrors lib/pointsEngine.ts
const DEFAULT_MISSED_DEADLINE_HOUR = 21; // 9 PM (mirrors lib/firebase.ts)

/** Points to deduct for a missed daily task (mirrors lib/pointsEngine.ts). */
function missedTaskPenaltyAmount(pointValue, mode) {
  if (mode === 'off' || !pointValue || pointValue <= 0) return 0;
  if (mode === 'full') return pointValue;
  return Math.max(1, Math.round(pointValue / 2));
}

/** Resolve a family's missed-penalty mode (legacy bool → 'half'). */
function missedPenaltyMode(family) {
  const v = family && family.missedTaskPenalty;
  if (v === true) return 'half';
  if (v === 'half' || v === 'full') return v;
  return 'off';
}

/** YYYY-MM-DD for `now` in the given IANA timezone. Falls back to UTC. */
function localDateKey(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (_e) {
    // Invalid/unknown timezone → treat as UTC so a bad config never throws.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Local date key (YYYY-MM-DD) AND local hour (0–23) for `now` in `timeZone`.
 * Falls back to UTC. Used to decide whether a member's deadline has passed today.
 */
function localParts(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t).value;
    let hour = parseInt(get('hour'), 10);
    if (!Number.isFinite(hour) || hour === 24) hour = 0; // some ICU builds emit '24' at midnight
    return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, hour };
  } catch (_e) {
    return { dateKey: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}

/** Clamp a stored deadline hour to 0–23, defaulting to 9 PM. */
function resolveDeadlineHour(family) {
  const h = family && family.missedTaskDeadlineHour;
  return typeof h === 'number' && h >= 0 && h <= 23 ? Math.round(h) : DEFAULT_MISSED_DEADLINE_HOUR;
}

/** The up-to-N calendar days strictly BEFORE `todayKey` (most recent first). */
function graceDaysBefore(todayKey, n = MISSED_TASK_GRACE_DAYS) {
  const [y, m, d] = todayKey.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, 12); // noon UTC — DST-safe date arithmetic
  const out = [];
  for (let i = 1; i <= n; i++) {
    const dt = new Date(base - i * 86_400_000);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
        dt.getUTCDate(),
      ).padStart(2, '0')}`,
    );
  }
  return out;
}

/** weekId (YYYY-WNN) for a date key — mirrors lib/firebase.ts::getWeekIdForDate. */
function weekIdForKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dateUTC = Date.UTC(y, m - 1, d);
  const startOfYearUTC = Date.UTC(y, 0, 1);
  const dayOfYear = Math.floor((dateUTC - startOfYearUTC) / 86_400_000);
  const jan1Dow = new Date(startOfYearUTC).getUTCDay();
  const weekNum = Math.ceil((dayOfYear + jan1Dow + 1) / 7);
  return `${y}-W${String(weekNum).padStart(2, '0')}`;
}

/** True if `task` is a daily task explicitly assigned to `memberId`. */
function isDailyAssignedTo(task, memberId) {
  if (task.recurrence !== 'daily' || task.isActive === false) return false;
  const a = task.assignedTo;
  return a === memberId || (Array.isArray(a) && a.includes(memberId));
}

/**
 * Is a penalty pause active — i.e. is the stored `penaltyPausedUntil` Timestamp
 * in the future? Used to honour the vacation/sick hold at both family and member
 * level so the sweep writes NO penalties while paused.
 */
function pausedActive(pausedUntil, now) {
  if (!pausedUntil) return false;
  const ms = typeof pausedUntil.toMillis === 'function'
    ? pausedUntil.toMillis()
    : (pausedUntil.toDate ? pausedUntil.toDate().getTime() : 0);
  return ms > now.getTime();
}

/**
 * Run the missed-task sweep once. Pure over the passed `db` + `now` so a test can
 * drive it deterministically (inject a fixed clock and per-member timezones).
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {Date} [now]
 * @returns {Promise<{familiesScanned:number, penaltiesWritten:number}>}
 */
async function runMissedTaskSweep(db, now = new Date()) {
  let penaltiesWritten = 0;
  const familiesSnap = await db.collection('families').get();

  for (const familyDoc of familiesSnap.docs) {
    const familyId = familyDoc.id;
    const mode = missedPenaltyMode(familyDoc.data());
    if (mode === 'off') continue; // feature disabled for this family
    // Vacation/sick hold at the family level → skip the whole family.
    if (pausedActive(familyDoc.data().penaltyPausedUntil, now)) continue;
    const deadlineHour = resolveDeadlineHour(familyDoc.data());

    const famRef = db.collection('families').doc(familyId);

    const [membersSnap, tasksSnap, configsSnap] = await Promise.all([
      famRef.collection('members').get(),
      famRef.collection('tasks').where('isActive', '==', true).get(),
      famRef.collection('notificationConfigs').get(),
    ]);

    const dailyTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!dailyTasks.some((t) => t.recurrence === 'daily')) continue;

    const tzByMember = {};
    configsSnap.docs.forEach((d) => {
      const tz = d.data().timezone;
      if (tz) tzByMember[d.id] = tz;
    });
    // Fallback for members with no stored timezone (e.g. managed kids created
    // before we stamped one): use ANY known family timezone before dropping to
    // UTC. UTC for a non-UTC family is exactly what penalized the current day
    // early (evenings roll into the next UTC day). See user feedback #1.
    const familyTz = Object.values(tzByMember)[0] || 'UTC';

    for (const memberDoc of membersSnap.docs) {
      const memberId = memberDoc.id;
      // Per-member vacation/sick hold → skip just this member.
      if (pausedActive(memberDoc.data().penaltyPausedUntil, now)) continue;
      const tz = tzByMember[memberId] || familyTz;

      const myTasks = dailyTasks.filter((t) => isDailyAssignedTo(t, memberId));
      if (!myTasks.length) continue;

      // A daily task is "missed" for a day only once that day's deadline hour has
      // passed in the member's LOCAL time. So we penalize the recent grace days
      // (their deadline is long gone) plus TODAY, but today only after the
      // deadline hour — never in the morning, never at UTC midnight.
      const { dateKey: todayKey, hour: localHour } = localParts(now, tz);
      const penalizeDays = graceDaysBefore(todayKey);
      if (localHour >= deadlineHour) penalizeDays.unshift(todayKey);

      for (const dateKey of penalizeDays) {
        // One read per (member, day): all that day's completions for this member.
        const daySnap = await famRef
          .collection('completions')
          .where('memberId', '==', memberId)
          .where('completedDate', '==', dateKey)
          .get();
        const dayComps = daySnap.docs.map((d) => d.data());

        for (const task of myTasks) {
          // A task can't be "missed" before it existed (in the member's tz).
          const createdKey = task.createdAt && task.createdAt.toDate
            ? localDateKey(task.createdAt.toDate(), tz)
            : '0000-00-00';
          if (createdKey > dateKey) continue;

          const forTask = dayComps.filter((c) => c.taskId === task.id);
          const donePositive = forTask.some(
            (c) => !c.wasAutoFailed && (c.pointsAwarded || 0) > 0,
          );
          const alreadyPenalized = forTask.some(
            (c) => c.wasAutoFailed || (c.pointsAwarded || 0) < 0,
          );
          if (donePositive || alreadyPenalized) continue;

          const penalty = missedTaskPenaltyAmount(task.pointValue, mode);
          if (penalty <= 0) continue;

          const [yy, mm] = dateKey.split('-');
          const ref = famRef
            .collection('completions')
            .doc(`miss__${task.id}__${memberId}__${dateKey}`);
          // create() (not set()) so a concurrent client write loses the race
          // cleanly instead of overwriting — either way exactly one doc exists.
          try {
            await ref.create({
              taskId: task.id,
              memberId,
              weekId: weekIdForKey(dateKey),
              completedDate: dateKey,
              monthId: `${yy}-${mm}`,
              completedAt: null,
              wasAutoFailed: true,
              pointsAwarded: -penalty, // display hint; onCompletionCreated recomputes
              serverAward: true,
              penaltyKind: 'miss',
              sweptBy: 'cf', // provenance — distinguishes server sweep from client
            });
            penaltiesWritten += 1;
          } catch (err) {
            // ALREADY_EXISTS (code 6) — the client (or a prior run) beat us. Fine.
            if (!err || err.code !== 6) throw err;
          }
        }
      }
    }
  }

  return { familiesScanned: familiesSnap.size, penaltiesWritten };
}

module.exports = {
  runMissedTaskSweep,
  // exported for unit tests
  localDateKey,
  localParts,
  resolveDeadlineHour,
  graceDaysBefore,
  weekIdForKey,
  missedTaskPenaltyAmount,
  missedPenaltyMode,
  isDailyAssignedTo,
  MISSED_TASK_GRACE_DAYS,
};
