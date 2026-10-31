import { isInQuietHours } from '@/lib/notifications';

describe('isInQuietHours', () => {
  it('no window = never quiet', () => {
    expect(isInQuietHours('23:30', null, null)).toBe(false);
    expect(isInQuietHours('23:30', '22:00', undefined)).toBe(false);
  });

  it('overnight window (22:00 → 07:00) wraps past midnight', () => {
    expect(isInQuietHours('23:30', '22:00', '07:00')).toBe(true);
    expect(isInQuietHours('02:00', '22:00', '07:00')).toBe(true);
    expect(isInQuietHours('06:59', '22:00', '07:00')).toBe(true);
    expect(isInQuietHours('07:00', '22:00', '07:00')).toBe(false); // end exclusive
    expect(isInQuietHours('20:00', '22:00', '07:00')).toBe(false);
    expect(isInQuietHours('12:00', '22:00', '07:00')).toBe(false);
  });

  it('same-day window (13:00 → 15:00)', () => {
    expect(isInQuietHours('14:00', '13:00', '15:00')).toBe(true);
    expect(isInQuietHours('12:59', '13:00', '15:00')).toBe(false);
    expect(isInQuietHours('15:00', '13:00', '15:00')).toBe(false);
  });
});
