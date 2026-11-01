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

module.exports = {
  isKid,
  competitors,
  buildRanked,
  computeCrowns,
  crownsSummary,
  detectOvertakes,
};
