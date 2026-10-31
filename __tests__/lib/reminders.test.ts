import { placeOutsideQuiet, reportWeekday } from '@/lib/notifications';

describe('reportWeekday (Parent Report fires on the last day of the family week)', () => {
  it('maps the week start to the expo weekday of the week\'s last day', () => {
    expect(reportWeekday(1)).toBe(1); // Mon-start week ends Sunday → expo 1
    expect(reportWeekday(0)).toBe(7); // Sun-start week ends Saturday → expo 7
    expect(reportWeekday(6)).toBe(6); // Sat-start week ends Friday → expo 6
  });
});

describe('placeOutsideQuiet (always-on reminders are moved, never cancelled)', () => {
  it('leaves a reminder outside quiet hours alone', () => {
    expect(placeOutsideQuiet('20:00', 'evening', '22:00', '07:00')).toBe('20:00');
    expect(placeOutsideQuiet('08:00', 'morning', '22:00', '07:00')).toBe('08:00');
  });

  it('leaves it alone when there are no quiet hours', () => {
    expect(placeOutsideQuiet('22:30', 'evening', null, null)).toBe('22:30');
  });

  it('moves an evening reminder to 30 min before quiet starts', () => {
    expect(placeOutsideQuiet('22:00', 'evening', '21:00', '07:00')).toBe('20:30');
    expect(placeOutsideQuiet('21:00', 'evening', '21:00', '07:00')).toBe('20:30');
  });

  it('moves a morning reminder to when quiet ends', () => {
    expect(placeOutsideQuiet('06:30', 'morning', '22:00', '07:00')).toBe('07:00');
  });

  it('wraps across midnight correctly', () => {
    expect(placeOutsideQuiet('22:00', 'evening', '00:15', '06:00')).toBe('22:00');
    expect(placeOutsideQuiet('00:30', 'evening', '00:15', '06:00')).toBe('23:45');
  });
});
