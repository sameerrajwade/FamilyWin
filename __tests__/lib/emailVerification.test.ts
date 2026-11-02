import { needsEmailVerification, VERIFY_FROM } from '@/lib/emailVerification';

const pw = [{ providerId: 'password' }];
const after = new Date(VERIFY_FROM + 3600_000).toUTCString();

describe('email verification gate', () => {
  it('a new, unverified email/password account must verify', () => {
    expect(needsEmailVerification({ emailVerified: false, providerData: pw, metadata: { creationTime: after } })).toBe(true);
  });
  it('verified accounts and Google sign-ins go straight in', () => {
    expect(needsEmailVerification({ emailVerified: true, providerData: pw, metadata: { creationTime: after } })).toBe(false);
    expect(needsEmailVerification({ emailVerified: false, providerData: [{ providerId: 'google.com' }], metadata: { creationTime: after } })).toBe(false);
  });
  it('families already playing before the rule are never locked out', () => {
    expect(needsEmailVerification({ emailVerified: false, providerData: pw, metadata: { creationTime: 'Sat, 01 Nov 2026 12:00:00 GMT' } })).toBe(false);
  });
  it('signed out → nothing to gate', () => {
    expect(needsEmailVerification(null)).toBe(false);
  });
});
