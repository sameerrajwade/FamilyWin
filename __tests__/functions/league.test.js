/**
 * __tests__/functions/league.test.js — Phase G7 family vs family leagues.
 * Drives firebase/functions/league.js directly against the Firestore emulator
 * (like missedSweep.test.js): create / join / cap / leave, the fair score
 * (average per competing player), and season rollover keeping last season.
 *
 *   firebase emulators:exec --project demo-lootboard --only firestore,functions \
 *     "npx jest --config jest.functions.config.js"
 */
const path = require('path');
const admin = require(path.join(__dirname, '../../firebase/functions/node_modules/firebase-admin'));
const league = require(path.join(__dirname, '../../firebase/functions/league'));

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-lootboard' });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

// Mid–Season 1 (Oct 26 → Nov 23 2026) and early Season 2.
const S1 = new Date('2026-11-05T15:00:00Z');
const S2 = new Date('2026-11-25T15:00:00Z');

async function seedFamily(id, name, members, txns) {
  const ref = db.collection('families').doc(id);
  await ref.set({ name, competitionMode: 'everyone' });
  for (const m of members) await ref.collection('members').doc(m.id).set(m);
  for (const [i, t] of txns.entries()) {
    await ref.collection('transactions').doc(`${id}_t${i}`).set({ ...t, createdAt: Timestamp.fromDate(t.at) });
  }
}

describe('league scoring (pure)', () => {
  test('seasons line up with the app: Season 1 starts Mon 26 Oct 2026, 4 weeks', () => {
    const s = league.leagueSeason(S1);
    expect(s.number).toBe(1);
    expect(s.start.toISOString().slice(0, 10)).toBe('2026-10-26');
    expect(s.end.toISOString().slice(0, 10)).toBe('2026-11-23');
    expect(league.leagueSeason(S2).number).toBe(2);
  });
  test('the fair score is the average per competing player', () => {
    expect(league.familyScore(300, 3)).toEqual({ points: 300, players: 3, avgPoints: 100 });
    expect(league.familyScore(500, 6).avgPoints).toBe(83);
    expect(league.familyScore(40, 0)).toEqual({ points: 40, players: 1, avgPoints: 40 });
  });
  test('invite codes are 6 unambiguous characters', () => {
    expect(league.newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
});

describe('leagues against the emulator', () => {
  let leagueId, inviteCode;

  beforeAll(async () => {
    // Small family: 2 players, 200 pts → avg 100. Big family: 4 players, 300 pts → avg 75.
    await seedFamily('famSmall', 'The Rajwades', [
      { id: 'sDad', displayName: 'Sameer', role: 'admin_parent' },
      { id: 'sKid', displayName: 'Vian', role: 'child', isManaged: true },
    ], [
      { memberId: 'sKid', delta: 150, source: 'task', at: S1 },
      { memberId: 'sDad', delta: 50, source: 'task', at: S1 },
      { memberId: 'sKid', delta: -100, source: 'redemption', at: S1 }, // spending never counts
    ]);
    await seedFamily('famBig', 'The Patels', [
      { id: 'b1', displayName: 'A', role: 'admin_parent' },
      { id: 'b2', displayName: 'B', role: 'parent' },
      { id: 'b3', displayName: 'C', role: 'child', isManaged: true },
      { id: 'b4', displayName: 'D', role: 'child', isManaged: true },
    ], [{ memberId: 'b3', delta: 300, source: 'task', at: S1 }]);
  });

  test('a parent starts a league; their family gets a fair-score row', async () => {
    ({ leagueId, inviteCode } = await league.createLeague(db, { familyId: 'famSmall', name: 'Cousins Cup', now: S1 }));
    const l = (await db.collection('leagues').doc(leagueId).get()).data();
    expect(l.name).toBe('Cousins Cup');
    expect(l.familyIds).toEqual(['famSmall']);
    const fam = (await db.collection('families').doc('famSmall').get()).data();
    expect(fam.leagueIds).toEqual([leagueId]);
    const row = (await db.collection('leagues').doc(leagueId).collection('standings').doc('famSmall').get()).data();
    expect(row).toMatchObject({ familyName: 'The Rajwades', season: 1, points: 200, players: 2, avgPoints: 100 });
    expect(JSON.stringify(row)).not.toMatch(/Vian|Sameer/); // no member names leak
  });

  test('another family joins with the code; the smaller family still leads on average', async () => {
    const r = await league.joinLeague(db, { familyId: 'famBig', code: inviteCode.toLowerCase(), now: S1 });
    expect(r).toEqual({ leagueId, joined: true });
    const big = (await db.collection('leagues').doc(leagueId).collection('standings').doc('famBig').get()).data();
    expect(big).toMatchObject({ points: 300, players: 4, avgPoints: 75 });
    // joining twice is a no-op
    expect((await league.joinLeague(db, { familyId: 'famBig', code: inviteCode, now: S1 })).joined).toBe(false);
  });

  test('a bad code is rejected clearly', async () => {
    await expect(league.joinLeague(db, { familyId: 'famBig', code: 'ZZZZZZ' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(league.joinLeague(db, { familyId: 'famBig', code: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('a league holds at most 6 families', async () => {
    for (let i = 0; i < 4; i++) await db.collection('families').doc(`famX${i}`).set({ name: `X${i}` });
    for (let i = 0; i < 4; i++) await league.joinLeague(db, { familyId: `famX${i}`, code: inviteCode, now: S1 });
    await db.collection('families').doc('famTooMany').set({ name: 'Late' });
    await expect(league.joinLeague(db, { familyId: 'famTooMany', code: inviteCode, now: S1 })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  test('a new season keeps last season\'s result and starts the race again', async () => {
    await league.writeStandings(db, 'famSmall', S2);
    const row = (await db.collection('leagues').doc(leagueId).collection('standings').doc('famSmall').get()).data();
    expect(row.season).toBe(2);
    expect(row.points).toBe(0);
    expect(row.lastSeason).toEqual({ season: 1, points: 200, players: 2, avgPoints: 100 });
  });

  test('leaving removes the family and its row; the last family out closes the league', async () => {
    await league.leaveLeague(db, { familyId: 'famBig', leagueId });
    expect((await db.collection('leagues').doc(leagueId).collection('standings').doc('famBig').get()).exists).toBe(false);
    expect((await db.collection('families').doc('famBig').get()).data().leagueIds).toEqual([]);
    for (const f of ['famSmall', 'famX0', 'famX1', 'famX2', 'famX3']) await league.leaveLeague(db, { familyId: f, leagueId });
    expect((await db.collection('leagues').doc(leagueId).get()).exists).toBe(false);
  });
});
