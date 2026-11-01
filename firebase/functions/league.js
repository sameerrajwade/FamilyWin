/**
 * firebase/functions/league.js — family vs family leagues (Phase G7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Families race each other over the same 4-week seasons the app uses. A parent
 * starts a league and shares its code; up to 6 families join. Other families
 * see only a family's NAME and SCORE — never kids' names or tasks.
 *
 *   leagues/{leagueId}                     { name, inviteCode, createdByFamily, familyIds[], createdAt }
 *   leagues/{leagueId}/standings/{familyId} { familyName, emoji, season, points, players, avgPoints,
 *                                            lastSeason?, updatedAt }
 *
 * The score is AVERAGE points earned per competing player this season (reward
 * spending excluded), so a family of 6 doesn't beat a family of 3 just by
 * size; the raw total is stored too. Standings are written ONLY here (admin
 * SDK): families can't read each other's ledgers, and must never be able to
 * write their own score. The firestore rules deny all client writes.
 *
 * Plain functions taking `db` (like sweep.js) so the emulator tests can drive
 * them directly; index.js wraps them as callables + the transaction trigger.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { competitors } = require('./game');

const LEAGUE_MAX_FAMILIES = 6;
const DAY = 86400000;
const SEASON_DAYS = 28;
// Same epoch as the app's lib/seasons (Season 1 = week of Mon 26 Oct 2026).
const SEASON_EPOCH_UTC = Date.UTC(2026, 9, 26);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

class LeagueError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** The league season containing `now` (UTC 4-week blocks from the epoch). */
function leagueSeason(now) {
  const idx = Math.floor((now.getTime() - SEASON_EPOCH_UTC) / (SEASON_DAYS * DAY));
  const start = SEASON_EPOCH_UTC + idx * SEASON_DAYS * DAY;
  return { number: idx + 1, start: new Date(start), end: new Date(start + SEASON_DAYS * DAY) };
}

/** Fair score: average points per competing player (at least 1 player). */
function familyScore(points, players) {
  const n = Math.max(1, players || 0);
  return { points, players: n, avgPoints: Math.round(points / n) };
}

function newInviteCode(rand = Math.random) {
  return Array.from({ length: 6 }, () => CODE_CHARS.charAt(Math.floor(rand() * CODE_CHARS.length))).join('');
}

function cleanName(name, fallback) {
  const s = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return s || fallback;
}

/** This season's score for one family (never includes members' names). */
async function computeFamilyStanding(db, familyId, now) {
  const famRef = db.collection('families').doc(familyId);
  const [famSnap, membersSnap] = await Promise.all([famRef.get(), famRef.collection('members').get()]);
  if (!famSnap.exists) return null;
  const fam = famSnap.data();
  const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const players = competitors(members, fam.competitionMode === 'kids' ? 'kids' : 'everyone');
  const ids = new Set(players.map((m) => m.id));
  const season = leagueSeason(now);
  const txSnap = await famRef.collection('transactions')
    .where('createdAt', '>=', Timestamp.fromDate(season.start))
    .where('createdAt', '<', Timestamp.fromDate(season.end))
    .get();
  let points = 0;
  for (const d of txSnap.docs) {
    const t = d.data();
    if (!ids.has(t.memberId) || t.source === 'redemption') continue;
    points += t.delta || 0;
  }
  return {
    familyName: cleanName(fam.name, 'A family'),
    emoji: '🏠',
    season: season.number,
    ...familyScore(points, ids.size),
  };
}

/**
 * Refresh this family's row in every league it belongs to. When a new season
 * has started, the finished season's numbers move to `lastSeason` first, so
 * the league can still crown last season's winner.
 */
async function writeStandings(db, familyId, now = new Date()) {
  const famSnap = await db.collection('families').doc(familyId).get();
  const leagueIds = (famSnap.exists && famSnap.data().leagueIds) || [];
  if (!leagueIds.length) return 0;
  const standing = await computeFamilyStanding(db, familyId, now);
  if (!standing) return 0;
  for (const leagueId of leagueIds) {
    const ref = db.collection('leagues').doc(leagueId).collection('standings').doc(familyId);
    const prev = (await ref.get()).data();
    let lastSeason = prev && prev.lastSeason ? prev.lastSeason : null;
    if (prev && prev.season < standing.season) {
      lastSeason = { season: prev.season, points: prev.points, players: prev.players, avgPoints: prev.avgPoints };
    }
    await ref.set({ ...standing, lastSeason, updatedAt: Timestamp.now() });
  }
  return leagueIds.length;
}

async function uniqueCode(db) {
  for (let i = 0; i < 8; i++) {
    const code = newInviteCode();
    const clash = await db.collection('leagues').where('inviteCode', '==', code).limit(1).get();
    if (clash.empty) return code;
  }
  throw new LeagueError('internal', 'Could not make a league code — try again.');
}

async function createLeague(db, { familyId, name, now = new Date() }) {
  const famRef = db.collection('families').doc(familyId);
  const fam = (await famRef.get()).data() || {};
  const code = await uniqueCode(db);
  const ref = db.collection('leagues').doc();
  await ref.set({
    name: cleanName(name, `${cleanName(fam.name, 'Our')} League`),
    inviteCode: code,
    createdByFamily: familyId,
    familyIds: [familyId],
    createdAt: Timestamp.now(),
  });
  await famRef.set({ leagueIds: FieldValue.arrayUnion(ref.id) }, { merge: true });
  await writeStandings(db, familyId, now);
  return { leagueId: ref.id, inviteCode: code };
}

async function joinLeague(db, { familyId, code, now = new Date() }) {
  const clean = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(clean)) throw new LeagueError('invalid-argument', 'Enter the 6-character league code.');
  const q = await db.collection('leagues').where('inviteCode', '==', clean).limit(1).get();
  if (q.empty) throw new LeagueError('not-found', 'No league found with that code.');
  const ref = q.docs[0].ref;
  const joined = await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const ids = snap.data().familyIds || [];
    if (ids.includes(familyId)) return false;
    if (ids.length >= LEAGUE_MAX_FAMILIES) throw new LeagueError('resource-exhausted', `This league is full (${LEAGUE_MAX_FAMILIES} families).`);
    txn.update(ref, { familyIds: FieldValue.arrayUnion(familyId) });
    return true;
  });
  await db.collection('families').doc(familyId).set({ leagueIds: FieldValue.arrayUnion(ref.id) }, { merge: true });
  await writeStandings(db, familyId, now);
  return { leagueId: ref.id, joined };
}

async function leaveLeague(db, { familyId, leagueId }) {
  const ref = db.collection('leagues').doc(leagueId);
  const snap = await ref.get();
  if (!snap.exists || !(snap.data().familyIds || []).includes(familyId)) {
    throw new LeagueError('not-found', 'Your family is not in that league.');
  }
  await ref.update({ familyIds: FieldValue.arrayRemove(familyId) });
  await ref.collection('standings').doc(familyId).delete();
  await db.collection('families').doc(familyId).set({ leagueIds: FieldValue.arrayRemove(leagueId) }, { merge: true });
  const left = ((await ref.get()).data().familyIds || []).length;
  if (left === 0) await db.recursiveDelete(ref); // last family out closes the league
  return { left };
}

module.exports = {
  LEAGUE_MAX_FAMILIES,
  LeagueError,
  leagueSeason,
  familyScore,
  newInviteCode,
  computeFamilyStanding,
  writeStandings,
  createLeague,
  joinLeague,
  leaveLeague,
};
