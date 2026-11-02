import { render, act } from '@testing-library/react-native';
import { CountUp } from '@/components/ui/Animations';

describe('CountUp (podium points)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ends on the real value without any other re-render (podium used to stay at 0)', () => {
    const { getByText } = render(<CountUp value={185} duration={300} suffix=" pts" />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(getByText('185 pts')).toBeTruthy();
  });

  it('follows a new value (points change while the tab is open)', () => {
    const { getByText, rerender } = render(<CountUp value={50} duration={200} />);
    act(() => { jest.advanceTimersByTime(500); });
    rerender(<CountUp value={75} duration={200} />);
    act(() => { jest.advanceTimersByTime(500); });
    expect(getByText('75')).toBeTruthy();
  });
});
