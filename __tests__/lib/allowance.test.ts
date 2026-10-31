import { pointsToCash, formatCash, pointsForOneUnit } from '@/lib/pointsEngine';

describe('virtual allowance helpers', () => {
  it('pointsToCash converts at the rate', () => {
    expect(pointsToCash(100, 100)).toBe(1);      // 100 pts = $1
    expect(pointsToCash(250, 100)).toBe(2.5);
    expect(pointsToCash(0, 100)).toBe(0);
    expect(pointsToCash(-50, 100)).toBe(0);       // never negative
    expect(pointsToCash(100, 0)).toBe(0);         // guard divide-by-zero
  });

  it('formatCash formats with 2 decimals + symbol', () => {
    expect(formatCash(1)).toBe('$1.00');
    expect(formatCash(2.5)).toBe('$2.50');
    expect(formatCash(3.5, '£')).toBe('£3.50');
    expect(formatCash(0)).toBe('$0.00');
  });

  it('pointsForOneUnit is at least 1', () => {
    expect(pointsForOneUnit(100)).toBe(100);
    expect(pointsForOneUnit(0)).toBe(1);
  });
});
