/**
 * __tests__/lib/firebase.test.ts
 * Tests for Firebase helper functions — all Firestore calls are mocked.
 * Tests the business logic wrappers around Firebase SDK.
 */

// Mock firestore before importing firebase helpers
const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockDocRef = (id = 'mock-id') => ({
  id,
  get: jest.fn().mockResolvedValue({ exists: true, id, data: () => ({ name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: { toDate: () => new Date() } }) }),
  set: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
});

const mockCollRef = () => ({
  doc: jest.fn(() => mockDocRef()),
  add: jest.fn().mockResolvedValue({ id: 'new-id' }),
  get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
});

jest.mock('@react-native-firebase/firestore', () => {
  const mockFirestore = jest.fn(() => ({
    collection: jest.fn((path: string) => {
      const ref = mockCollRef();
      if (path === 'families') {
        ref.doc = jest.fn(() => ({
          ...mockDocRef('f1'),
          collection: jest.fn(() => mockCollRef()),
        }));
      }
      return ref;
    }),
    batch: jest.fn(() => mockBatch),
  }));
  (mockFirestore as any).Timestamp = {
    now: jest.fn(() => ({ toDate: () => new Date(), seconds: 1000 })),
    fromDate: jest.fn((d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 })),
  };
  return { default: mockFirestore, __esModule: true };
});

jest.mock('@react-native-firebase/auth', () => ({
  default: jest.fn(() => ({ currentUser: null })),
  __esModule: true,
}));

import {
  getCurrentWeekId,
  getWeekStart,
  generateInviteCode,
} from '@/lib/firebase';

// ─── getCurrentWeekId ─────────────────────────────────────────────────────────
describe('getCurrentWeekId', () => {
  it('returns a string matching YYYY-WNN format', () => {
    const id = getCurrentWeekId();
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns the current year', () => {
    const id = getCurrentWeekId();
    expect(id.startsWith(new Date().getFullYear().toString())).toBe(true);
  });

  it('week number is between 1 and 53', () => {
    const id = getCurrentWeekId();
    const weekNum = parseInt(id.split('-W')[1], 10);
    expect(weekNum).toBeGreaterThanOrEqual(1);
    expect(weekNum).toBeLessThanOrEqual(53);
  });

  it('is consistent when called twice in same test', () => {
    expect(getCurrentWeekId()).toBe(getCurrentWeekId());
  });
});

// ─── getWeekStart ─────────────────────────────────────────────────────────────
describe('getWeekStart', () => {
  it('returns a Date object', () => {
    const d = getWeekStart('2024-W02');
    expect(d).toBeInstanceOf(Date);
  });

  it('returns the Monday of the specified week', () => {
    const d = getWeekStart('2024-W02');
    expect(d.getDay()).toBe(1); // Monday
  });

  it('returns correct date for week 1 of 2024', () => {
    const d = getWeekStart('2024-W01');
    expect(d.getFullYear()).toBe(2024);
  });
});

// ─── generateInviteCode ───────────────────────────────────────────────────────
describe('generateInviteCode', () => {
  it('returns a 6-character string', () => {
    expect(generateInviteCode()).toHaveLength(6);
  });

  it('contains only uppercase letters and digits', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('generates different codes on successive calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 10 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
