/**
 * lib/emailVerification.ts — new email/password accounts must verify their
 * email before they can set up or join a family (user request 2026-11-01).
 * PURE (unit-tested). Firebase sends the link email itself (sender "Chore
 * League"); app/auth/verify-email.tsx waits for the click.
 *
 * Who is gated: password sign-ins that are NOT verified and were created on or
 * after VERIFY_FROM. Google sign-ins are verified by Google; accounts that
 * existed before the rule (the families already playing) are never locked out.
 * The Firestore rules enforce the same thing for creating/joining a family.
 */
export const VERIFY_FROM = Date.UTC(2026, 10, 2); // 2026-11-02

export interface VerifiableUser {
  emailVerified?: boolean;
  providerData?: { providerId?: string }[];
  metadata?: { creationTime?: string | number | null } | null;
}

export function needsEmailVerification(user: VerifiableUser | null | undefined): boolean {
  if (!user || user.emailVerified) return false;
  const providers = (user.providerData ?? []).map((p) => p?.providerId);
  if (!providers.includes('password')) return false;
  const created = user.metadata?.creationTime;
  const ms = typeof created === 'number' ? created : created ? Date.parse(created) : NaN;
  if (Number.isFinite(ms) && ms < VERIFY_FROM) return false;
  return true;
}
