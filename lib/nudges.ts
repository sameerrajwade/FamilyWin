/**
 * lib/nudges.ts — the few gentle asks before launch (Phase G9), PURE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. INVITE NUDGE — a parent alone in the family (no kid profile yet, or no
 *    second grown-up) sees ONE small card on Today: "add your first kid" or
 *    "invite the other grown-up". "Not now" hides it for a week; after 3
 *    "Not now"s (or ✕) it never comes back. Nothing shows in the first hour,
 *    so brand-new families finish setup in peace.
 * 2. REVIEW ASK — "Enjoying Chore League?" only right after a happy moment
 *    (a perfect day, a won week, an approved reward), only from the 4th app
 *    open, at most 3 times ever, 30+ days apart, and never again once they
 *    said yes (→ store review) or "not really" (→ we ask for feedback instead).
 * No Firebase/React here; unit-tested. State lives per device (AsyncStorage)
 * in lib/nudgeStore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DAY = 86_400_000;

// ─── Invite nudge ────────────────────────────────────────────────────────────

export type InviteKind = 'kid' | 'grownup';
export interface InviteNudgeState { until?: number; dismissals?: number; never?: boolean }
export interface NudgeMember { role?: string; isManaged?: boolean; userId?: string | null }

export const INVITE_SNOOZE_DAYS = 7;
export const INVITE_MAX_DISMISSALS = 3;
const FIRST_HOUR = 3_600_000;

/** Which invite card to show (null = none). Kids first — they're the players. */
export function inviteNudgeToShow(
  members: NudgeMember[], state: InviteNudgeState | null | undefined,
  familyCreatedAt: Date | null | undefined, now: Date = new Date(),
): InviteKind | null {
  const s = state ?? {};
  if (s.never || (s.dismissals ?? 0) >= INVITE_MAX_DISMISSALS) return null;
  if ((s.until ?? 0) > now.getTime()) return null;
  if (familyCreatedAt && now.getTime() - familyCreatedAt.getTime() < FIRST_HOUR) return null;
  const kids = members.filter((m) => m.isManaged || m.role === 'child');
  const grownups = members.filter((m) => !m.isManaged && (m.role === 'parent' || m.role === 'admin_parent'));
  if (kids.length === 0) return 'kid';
  if (grownups.length < 2) return 'grownup';
  return null;
}

export function snoozeInvite(state: InviteNudgeState | null | undefined, now: Date = new Date()): InviteNudgeState {
  const dismissals = (state?.dismissals ?? 0) + 1;
  return { ...state, dismissals, until: now.getTime() + INVITE_SNOOZE_DAYS * DAY };
}

export function neverInvite(state: InviteNudgeState | null | undefined): InviteNudgeState {
  return { ...state, never: true };
}

// ─── Review ask ──────────────────────────────────────────────────────────────

export interface ReviewState { opens?: number; asks?: number; lastAskAt?: number; done?: boolean }

export const REVIEW_MIN_OPENS = 4;
export const REVIEW_MAX_ASKS = 3;
export const REVIEW_GAP_DAYS = 30;

export function countOpen(state: ReviewState | null | undefined): ReviewState {
  return { ...state, opens: (state?.opens ?? 0) + 1 };
}

/** Ask now? Only call this at a happy moment. */
export function shouldAskForReview(state: ReviewState | null | undefined, now: Date = new Date()): boolean {
  const s = state ?? {};
  if (s.done) return false;
  if ((s.opens ?? 0) < REVIEW_MIN_OPENS) return false;
  if ((s.asks ?? 0) >= REVIEW_MAX_ASKS) return false;
  if (s.lastAskAt && now.getTime() - s.lastAskAt < REVIEW_GAP_DAYS * DAY) return false;
  return true;
}

/** 'love' → store review, 'meh' → feedback email; both end the asks. 'later' counts one ask. */
export function recordReviewAnswer(state: ReviewState | null | undefined, answer: 'love' | 'meh' | 'later', now: Date = new Date()): ReviewState {
  const s = { ...state, asks: (state?.asks ?? 0) + 1, lastAskAt: now.getTime() };
  return answer === 'later' ? s : { ...s, done: true };
}
