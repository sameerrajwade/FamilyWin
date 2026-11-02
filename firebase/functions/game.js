/**
 * firebase/functions/game.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure game helpers shared by the Cloud Functions (no Firebase, no I/O), so they
 * can be unit-tested directly. These are JS ports of the client's lib/familyGame
 * + lib/pointsEngine logic, kept deliberately in step so the Sunday push and the
 * live "overtaken" push crown/rank exactly like the app does.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Kids are players: a managed profile or anyone with the child role. */
function isKid(m) {
  return !!(m && (m.isManaged || m.role === 'child'));
}

/**
 * Who RANKS on the leaderboard (family setting, default 'everyone'):
 *   'everyone' — parents and kids all rank.
 *   'kids'     — only kids rank; parents coach. A kid-less family (two parents
 *                trying it out) still falls back to everyone.
 */
function competitors(members, mode = 'everyone') {
  if (mode !== 'kids') return members;
  const kids = members.filter(isKid);
  return kids.length > 0 ? kids : members;
}

function firstName(name) {
  return String(name == null ? '' : name).trim().split(/\s+/)[0] || 'Someone';
}

/**
 * Rank members by this-week points, descending, ties sharing a rank — mirrors
 * lib/pointsEngine::buildLeaderboard. `members` are already the competitors.
 */
function buildRanked(totals, members) {
  const entries = members.map((m) => ({
    memberId: m.id,
    displayName: m.displayName || 'Unknown',
    avatarEmoji: m.avatarEmoji || '👤',
    points: totals[m.id] || 0,
    rank: 0,
  }));
  entries.sort((a, b) => b.points - a.points);
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].points < entries[i - 1].points) rank = i + 1;
    entries[i].rank = rank;
  }
  return entries;
}

/**
 * The fixed three-crown row, ported from lib/pointsEngine::computeCrowns:
 *   👑 Top Scorer   — rank 1 with a positive score
 *   📈 Most Improved — biggest positive delta vs lastWeekTotals (omit = no crown)
 *   🎯 Goal Crusher  — reached their own weekly points goal (0/absent = skip)
 * Unawarded slots return awardeeMemberId: null.
 */
function computeCrowns(entries, lastWeekTotals = {}, goals = {}) {
  const leader = entries.find((e) => e.rank === 1 && e.points > 0) || null;

  let improved = null;
  if (Object.keys(lastWeekTotals).length > 0) {
    for (const e of entries) {
      const delta = e.points - (lastWeekTotals[e.memberId] || 0);
      if (delta > 0 && (!improved || delta > improved.delta)) improved = { e, delta };
    }
  }

  const achievers = entries
    .filter((e) => (goals[e.memberId] || 0) > 0 && e.points >= goals[e.memberId])
    .sort((a, b) => (b.points - goals[b.memberId]) - (a.points - goals[a.memberId]));
  const goalWinner = achievers[0] || null;

  return [
    {
      kind: 'top', emoji: '👑', title: 'Top Scorer',
      awardeeMemberId: leader ? leader.memberId : null,
      awardeeName: leader ? firstName(leader.displayName) : null,
      detail: leader ? `${leader.points} pts` : null,
    },
    {
      kind: 'improved', emoji: '📈', title: 'Most Improved',
      awardeeMemberId: improved ? improved.e.memberId : null,
      awardeeName: improved ? firstName(improved.e.displayName) : null,
      detail: improved ? `+${improved.delta} vs last wk` : null,
    },
    {
      kind: 'goal', emoji: '🎯', title: 'Goal Crusher',
      awardeeMemberId: goalWinner ? goalWinner.memberId : null,
      awardeeName: goalWinner ? firstName(goalWinner.displayName) : null,
      detail: goalWinner ? `${goalWinner.points} / ${goals[goalWinner.memberId]}` : null,
    },
  ];
}

/**
 * One-line push body naming every AWARDED crown, e.g.
 *   "👑 Vian (320 pts) · 📈 Vayu (+140 vs last wk) · 🎯 Sameer"
 * Falls back to the plain winner line when only the top crown is awarded.
 */
function crownsSummary(crowns) {
  const awarded = crowns.filter((c) => c.awardeeMemberId);
  if (!awarded.length) return null;
  return awarded
    .map((c) => `${c.emoji} ${c.awardeeName}${c.detail ? ` (${c.detail})` : ''}`)
    .join(' · ');
}

/**
 * Phase D4 — detect who the actor just OVERTOOK on the live weekly leaderboard.
 * `newTotals` already includes the actor's new transaction; `delta` is that
 * transaction's signed points. Returns the memberIds the actor passed: members
 * who were AT OR ABOVE the actor before this delta and are now strictly below.
 * Empty for a non-positive delta, for a non-competing actor, or for a tx that
 * doesn't change any ordering.
 */
function detectOvertakes(actorId, newTotals, delta, competitorIds) {
  if (!(delta > 0)) return [];
  const competing = new Set(competitorIds);
  if (!competing.has(actorId)) return [];
  const actorNow = newTotals[actorId] || 0;
  const actorBefore = actorNow - delta;
  const passed = [];
  for (const id of competitorIds) {
    if (id === actorId) continue;
    const p = newTotals[id] || 0;
    // They were ahead of (or level with) the actor before, and are now behind.
    if (p >= actorBefore && p < actorNow) passed.push(id);
  }
  return passed;
}

// ─── Streak shield (Phase F2) — port of lib/streakShield.ts ──────────────────
// Same rules as the app: one shield per family week with ≥ 5 active days, hold
// at most 2, a shield covers a single missed day automatically, and TODAY never
// breaks a streak. Works on YYYY-MM-DD keys (already in the member's timezone),
// so the server and every device count the same streak.

const SHIELD_MIN_ACTIVE_DAYS = 5;
const SHIELD_CAP = 2;
const STREAK_WINDOW_DAYS = 42;

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function utcToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function streakWithShields(activeDayKeys, todayKey, weekStartDay = 1, windowDays = STREAK_WINDOW_DAYS) {
  const active = new Set(activeDayKeys);
  const DAY = 86400000;
  const todayMs = keyToUtc(todayKey);
  let ms = todayMs - (windowDays - 1) * DAY;
  let streak = 0, shields = 0, weekActive = 0;
  const shieldedDays = [];
  for (let i = 0; i < windowDays; i++, ms += DAY) {
    const key = utcToKey(ms);
    if (i > 0 && new Date(ms).getUTCDay() === weekStartDay) {
      if (weekActive >= SHIELD_MIN_ACTIVE_DAYS) shields = Math.min(SHIELD_CAP, shields + 1);
      weekActive = 0;
    }
    if (active.has(key)) { streak++; weekActive++; }
    else if (ms === todayMs) { /* today isn't over */ }
    else if (streak > 0 && shields > 0) { shields--; shieldedDays.push(key); }
    else streak = 0;
  }
  return { streak, shields, shieldedDays };
}

/** Milestones a streak has reached (e.g. 15 → [7, 14]); the caller pays each once. */
function reachedMilestones(streak, bonuses) {
  return Object.keys(bonuses).map(Number).filter((m) => streak >= m).sort((a, b) => a - b);
}

// ─── Approval trust levels (G5) ──────────────────────────────────────────────
/**
 * Should the server approve a kid's pending claim by itself? Yes when the
 * family set an auto-approve limit (family.autoApproveUnder, points) and the
 * task is worth > 0 and ≤ that limit — unless the parent asked to check this
 * task (requiresApproval / requiresPhoto) or the claim carries a proof photo.
 */
function shouldAutoApprove({ task, family, points, completion }) {
  const limit = Number(family && family.autoApproveUnder) || 0;
  if (limit <= 0 || !task) return false;
  if (!(points > 0) || points > limit) return false;
  if (task.requiresApproval === true || task.requiresPhoto === true) return false;
  if (completion && completion.proofPhotoURL) return false;
  return true;
}

/**
 * Claim push (UX review 2026-11-01): when a kid's claim waits for a parent,
 * tell the parents — but at most once per CLAIM_PUSH_GAP_MS per family, so a
 * kid ticking off five chores in a row makes one buzz, not five (the Family tab
 * badge carries the running count).
 */
const CLAIM_PUSH_GAP_MS = 10 * 60 * 1000;

function shouldSendClaimPush(lastSentMs, nowMs) {
  return !(typeof lastSentMs === 'number' && nowMs - lastSentMs < CLAIM_PUSH_GAP_MS);
}

function claimPushText(kidName, taskTitle, points) {
  const who = kidName ? kidName.split(' ')[0] : 'A kid';
  const what = taskTitle ? `"${taskTitle}"` : 'a task';
  return {
    title: `${who} finished ${what} ✅`,
    body: points > 0 ? `+${points} pts waiting for your OK — tap to approve.` : 'Waiting for your OK — tap to approve.',
  };
}

/** Parents (with their own login) who should hear about a claim. */
function claimRecipients(members) {
  return (members || []).filter((m) => !m.isManaged && (m.role === 'parent' || m.role === 'admin_parent'));
}

// ─── Weekly twists + comeback (engagement, user-approved 2026-11-01) ─────────
// Mirrored in lib/twists.ts for the app's banners — keep the two lists in step
// (__tests__/lib/twists.test.ts checks they match).
const TWISTS = [
  { id: 'double-chores', emoji: '🧹', title: 'Double chores', blurb: 'Chores pay double this week.', kind: 'category', category: 'chores', multiplier: 2 },
  { id: 'early-bird', emoji: '🌅', title: 'Early bird', blurb: 'Tasks done before 9am earn +5 points.', kind: 'early', beforeHour: 9, bonus: 5 },
  { id: 'homework-heroes', emoji: '📚', title: 'Homework heroes', blurb: 'Homework pays +50% this week.', kind: 'category', category: 'homework', multiplier: 1.5 },
  { id: 'team-week', emoji: '🤝', title: 'Team week', blurb: 'Kids vs grown-ups: team totals on Scores.', kind: 'team' },
  { id: 'weekend-warriors', emoji: '🏖️', title: 'Weekend warriors', blurb: 'Saturday and Sunday tasks pay +50%.', kind: 'weekend', multiplier: 1.5 },
  { id: 'healthy-habits', emoji: '🪥', title: 'Healthy habits', blurb: 'Hygiene tasks pay double this week.', kind: 'category', category: 'hygiene', multiplier: 2 },
  { id: 'kindness-week', emoji: '💛', title: 'Kindness week', blurb: 'Behavior tasks pay double this week.', kind: 'category', category: 'behavior', multiplier: 2 },
];

const DAY_MS = 86_400_000;
const keyToUTC = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));

/** The family-week start (YYYY-MM-DD) that contains local date `dateKey`. */
function weekStartKeyOf(dateKey, weekStartDay = 1) {
  const ms = keyToUTC(dateKey);
  const dow = new Date(ms).getUTCDay();
  const back = (dow - (weekStartDay ?? 1) + 7) % 7;
  return utcToKey(ms - back * DAY_MS);
}

/** This week's twist (null = twists off, or skipped this week). Rotates in order. */
function twistForWeek(weekStartKey, family) {
  if (!weekStartKey || (family && family.twistsOff === true)) return null;
  if (family && family.twistSkip && family.twistSkip[weekStartKey]) return null;
  const n = Math.floor(keyToUTC(weekStartKey) / (7 * DAY_MS));
  return TWISTS[((n % TWISTS.length) + TWISTS.length) % TWISTS.length];
}

/**
 * Extra points a twist adds to an award (0 = none).
 * ctx: { award, category, dateKey, localHour }
 */
function twistBonus(twist, ctx) {
  if (!twist || !(ctx.award > 0)) return 0;
  if (twist.kind === 'category') return ctx.category === twist.category ? Math.round(ctx.award * (twist.multiplier - 1)) : 0;
  if (twist.kind === 'weekend') {
    const dow = new Date(keyToUTC(ctx.dateKey)).getUTCDay();
    return dow === 0 || dow === 6 ? Math.round(ctx.award * (twist.multiplier - 1)) : 0;
  }
  if (twist.kind === 'early') return typeof ctx.localHour === 'number' && ctx.localHour < twist.beforeHour ? twist.bonus : 0;
  return 0; // team week: display only
}

/** Last week's last place among ≥2 players (ties all get it; none if everyone tied). */
function comebackIds(entries) {
  const ps = (entries || []).filter((e) => typeof e.points === 'number');
  if (ps.length < 2) return [];
  const max = Math.max(...ps.map((e) => e.points));
  const min = Math.min(...ps.map((e) => e.points));
  if (min === max) return [];
  return ps.filter((e) => e.points === min).map((e) => e.memberId);
}

/** Comeback boost: +10% of each award, at least 1, at most 5. */
function comebackBonus(award) {
  if (!(award > 0)) return 0;
  return Math.min(5, Math.max(1, Math.round(award * 0.1)));
}

/** Is the comeback boost live for this member on this local day? */
function comebackActive(family, memberId, dateKey) {
  const cb = family && family.comeback;
  if (!cb || family.comebackOff === true || !Array.isArray(cb.memberIds) || !cb.since) return false;
  if (!cb.memberIds.includes(memberId)) return false;
  const d = keyToUTC(dateKey) - keyToUTC(cb.since);
  return d >= 0 && d < 7 * DAY_MS;
}

/**
 * Weekly twist push (user request 2026-11-01): ONCE per family per week, on the
 * family's own week-start day (Mon for some, Sun/Sat for others), from 8am
 * family-local time. `local` = { dateKey, hour } in the family's timezone.
 * Returns the week key + twist to announce, or null.
 */
const TWIST_NOTICE_HOUR = 8;
function twistNoticeDue(family, local) {
  if (!family || !local || !local.dateKey) return null;
  const wsd = family.weekStartDay ?? 1;
  if (new Date(keyToUTC(local.dateKey)).getUTCDay() !== wsd) return null;
  if (!(local.hour >= TWIST_NOTICE_HOUR)) return null;
  const weekKey = weekStartKeyOf(local.dateKey, wsd);
  if (family.twistNotifiedWeek === weekKey) return null;
  const twist = twistForWeek(weekKey, family);
  return twist ? { weekKey, twist } : null;
}

// ─── Push etiquette (user decisions 2026-11-02) ──────────────────────────────
/** Max "frequent" server pushes per person per day (claims, results, passed-you). */
const DAILY_PUSH_CAP = 4;

/** Next push-counter state, or null when today's cap is reached. */
function pushBudget(cfg, todayKey, cap = DAILY_PUSH_CAP) {
  const count = cfg && cfg.pushDay === todayKey ? (cfg.pushCount || 0) : 0;
  if (count >= cap) return null;
  return { pushDay: todayKey, pushCount: count + 1 };
}

/**
 * "Someone took the lead" push: never to a kid under 10 (or a kid with no age
 * set), and at most once a day per person.
 */
function overtakenAllowed(member, cfg, todayKey) {
  if (!member) return false;
  const kid = member.isManaged === true || member.role === 'child';
  if (kid && !(typeof member.age === 'number' && member.age >= 10)) return false;
  if (cfg && cfg.lastOvertakenDay === todayKey) return false;
  return true;
}

/** Text for the kid when a parent decides their claim / reward request. */
function decisionPushText(kind, approved, title, extra) {
  const t = title || (kind === 'reward' ? 'your reward' : 'your task');
  if (kind === 'claim') {
    return approved
      ? { title: `✅ Approved: ${t}`, body: extra > 0 ? `+${extra} points are yours. Nice work!` : 'Nice work!' }
      : { title: `↩️ Sent back: ${t}`, body: extra ? `Note: ${extra}. Have another go!` : 'Have another go!' };
  }
  return approved
    ? { title: `🎁 Approved: ${t}`, body: 'Enjoy it — you earned it!' }
    : { title: `Not this time: ${t}`, body: extra ? `Note: ${extra}. Your points are still yours.` : 'Your points are still yours.' };
}

module.exports = {
  DAILY_PUSH_CAP,
  pushBudget,
  overtakenAllowed,
  decisionPushText,
  twistNoticeDue,
  TWIST_NOTICE_HOUR,
  TWISTS,
  weekStartKeyOf,
  twistForWeek,
  twistBonus,
  comebackIds,
  comebackBonus,
  comebackActive,
  shouldSendClaimPush,
  claimPushText,
  claimRecipients,
  CLAIM_PUSH_GAP_MS,
  shouldAutoApprove,
  isKid,
  competitors,
  buildRanked,
  computeCrowns,
  crownsSummary,
  detectOvertakes,
  streakWithShields,
  reachedMilestones,
  STREAK_WINDOW_DAYS,
};
