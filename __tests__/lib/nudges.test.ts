import {
  inviteNudgeToShow, snoozeInvite, neverInvite, INVITE_MAX_DISMISSALS,
  countOpen, shouldAskForReview, recordReviewAnswer, REVIEW_MIN_OPENS,
} from '@/lib/nudges';

const DAY = 86_400_000;
const now = new Date('2026-11-01T18:00:00');
const longAgo = new Date(now.getTime() - 10 * DAY);
const mom = { role: 'admin_parent', userId: 'u1' };
const dad = { role: 'parent', userId: 'u2' };
const kid = { role: 'child', isManaged: true };

describe('invite nudge (G9)', () => {
  it('kids first, then the other grown-up, then nothing', () => {
    expect(inviteNudgeToShow([mom], {}, longAgo, now)).toBe('kid');
    expect(inviteNudgeToShow([mom, kid], {}, longAgo, now)).toBe('grownup');
    expect(inviteNudgeToShow([mom, dad, kid], {}, longAgo, now)).toBeNull();
  });

  it('stays quiet in the first hour so setup is not interrupted', () => {
    expect(inviteNudgeToShow([mom], {}, new Date(now.getTime() - 10 * 60_000), now)).toBeNull();
  });

  it('"Not now" hides it for a week; 3 of them and it stops for good', () => {
    let s = snoozeInvite({}, now);
    expect(inviteNudgeToShow([mom], s, longAgo, new Date(now.getTime() + 3 * DAY))).toBeNull();
    expect(inviteNudgeToShow([mom], s, longAgo, new Date(now.getTime() + 8 * DAY))).toBe('kid');
    for (let i = 1; i < INVITE_MAX_DISMISSALS; i++) s = snoozeInvite(s, now);
    expect(inviteNudgeToShow([mom], s, longAgo, new Date(now.getTime() + 60 * DAY))).toBeNull();
  });

  it('✕ means never', () => {
    expect(inviteNudgeToShow([mom], neverInvite({}), longAgo, now)).toBeNull();
  });
});

describe('review ask (G9)', () => {
  const opened = (n: number) => { let s = {}; for (let i = 0; i < n; i++) s = countOpen(s); return s; };

  it('waits for the 4th app open', () => {
    expect(shouldAskForReview(opened(REVIEW_MIN_OPENS - 1), now)).toBe(false);
    expect(shouldAskForReview(opened(REVIEW_MIN_OPENS), now)).toBe(true);
  });

  it('"Later" waits 30 days; 3 asks max', () => {
    let s = recordReviewAnswer(opened(5), 'later', now);
    expect(shouldAskForReview(s, new Date(now.getTime() + 10 * DAY))).toBe(false);
    expect(shouldAskForReview(s, new Date(now.getTime() + 31 * DAY))).toBe(true);
    s = recordReviewAnswer(s, 'later', now);
    s = recordReviewAnswer(s, 'later', now);
    expect(shouldAskForReview(s, new Date(now.getTime() + 365 * DAY))).toBe(false);
  });

  it('a yes or a "not really" ends the asks', () => {
    expect(shouldAskForReview(recordReviewAnswer(opened(5), 'love', now), new Date(now.getTime() + 365 * DAY))).toBe(false);
    expect(shouldAskForReview(recordReviewAnswer(opened(5), 'meh', now), new Date(now.getTime() + 365 * DAY))).toBe(false);
  });
});
