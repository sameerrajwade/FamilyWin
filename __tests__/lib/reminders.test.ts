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

describe('G4: every reminder is on by default, each type can be switched off', () => {
  const { notifPrefs, ensureReminders } = require('@/lib/notifications');
  const Notifications = require('expo-notifications');

  beforeEach(() => { Notifications.scheduleNotificationAsync.mockClear(); });
  const scheduledTypes = () => Notifications.scheduleNotificationAsync.mock.calls.map((c: any[]) => c[0].content.data.type);

  it('reads prefs: absent config or flag = on', () => {
    expect(notifPrefs(null)).toEqual({ morning: true, evening: true, report: true, overtaken: true, weekly: true, claims: true, twists: true });
    expect(notifPrefs({ eveningOff: true, overtakenOff: true })).toMatchObject({ evening: false, overtaken: false, morning: true });
  });

  it('a parent gets morning plan, evening check-in and the weekly report by default', async () => {
    await ensureReminders({ name: 'Sameer', isParent: true });
    expect(scheduledTypes().sort()).toEqual(['daily_reminder', 'morning_plan', 'parent_report']);
  });

  it('skips exactly the types switched off', async () => {
    await ensureReminders({ name: 'Sameer', isParent: true, off: { morning: true, report: true } });
    expect(scheduledTypes()).toEqual(['daily_reminder']);
  });

  it('a kid only ever gets the evening check-in, and can turn it off', async () => {
    await ensureReminders({ name: 'Vian', isParent: false });
    expect(scheduledTypes()).toEqual(['daily_reminder']);
    Notifications.scheduleNotificationAsync.mockClear();
    await ensureReminders({ name: 'Vian', isParent: false, off: { evening: true } });
    expect(scheduledTypes()).toEqual([]);
  });
});

describe('tapping a notification opens the right screen', () => {
  const { routeForPushData } = require('@/lib/notifications');
  it('server pushes and local reminders map to screens', () => {
    expect(routeForPushData({ screen: 'approvals' })).toBe('/app/approvals');
    expect(routeForPushData({ screen: 'tasks', twist: 'team-week' })).toBe('/app/tabs');
    expect(routeForPushData({ screen: 'leaderboard' })).toBe('/app/tabs/leaderboard');
    expect(routeForPushData({})).toBeNull();
    expect(routeForPushData(null)).toBeNull();
  });
});
