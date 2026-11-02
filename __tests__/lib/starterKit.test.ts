import {
  packIdForAge, buildStarterKit, customStarterTasks,
  initialDiscoverState, discoverCardToShow, snoozeDiscover, resolveDiscover, DISCOVER_ITEMS,
} from '@/lib/starterKit';

describe('starter kit (G6)', () => {
  it('picks the age pack', () => {
    expect(packIdForAge(6)).toBe('ages-5-8');
    expect(packIdForAge(undefined)).toBe('ages-5-8');
    expect(packIdForAge(3)).toBe('ages-5-8');
    expect(packIdForAge(10)).toBe('ages-9-12');
    expect(packIdForAge(14)).toBe('teens');
  });

  it('gives each kid their OWN age-right tasks (managed kids only see their own)', () => {
    const { tasks } = buildStarterKit([{ id: 'vian', name: 'Vian', age: 10 }, { id: 'vayu', name: 'Vayu', age: 4 }]);
    const vian = tasks.filter((t) => t.assignedTo === 'vian');
    const vayu = tasks.filter((t) => t.assignedTo === 'vayu');
    expect(vian.map((t) => t.title)).toContain('Finish homework');
    expect(vayu.map((t) => t.title)).toContain('Brush my teeth');
    expect(vian.filter((t) => t.recurrence === 'daily')).toHaveLength(3);
    expect(vian.filter((t) => t.recurrence === 'weekly')).toHaveLength(1);
    expect(vayu).toHaveLength(3); // the 5-8 pack has no weekly task
  });

  it('adds two shared family tasks and four starter rewards; keys are unique', () => {
    const kit = buildStarterKit([{ id: 'k', name: 'K', age: 7 }]);
    expect(kit.tasks.filter((t) => t.assignedTo === null).map((t) => t.title)).toEqual(['Family dinner together', 'Weekend tidy-up']);
    expect(kit.rewards.map((r) => r.title)).toEqual(['30 min screen time', 'Favorite snack', 'Choose the family movie', 'Ice-cream trip']);
    const keys = kit.tasks.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a family with no kids yet still gets the shared tasks', () => {
    expect(buildStarterKit([]).tasks.every((t) => t.assignedTo === null)).toBe(true);
  });

  it('custom tasks: one per kid, or one shared', () => {
    const kids = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(customStarterTasks('  Water the plants ', true, kids).map((t) => t.assignedTo)).toEqual(['a', 'b']);
    expect(customStarterTasks('Water the plants', false, kids)[0].assignedTo).toBeNull();
    expect(customStarterTasks('   ', true, kids)).toEqual([]);
  });
});

describe('discover more (G6)', () => {
  const created = new Date('2026-11-01T12:00:00');
  const day = (n: number) => new Date(created.getTime() + n * 86_400_000);

  it('skipped features stay hidden in week 1 and come back from week 2, one at a time', () => {
    const s = initialDiscoverState(created);
    expect(discoverCardToShow(s, day(3))).toBeNull();
    expect(discoverCardToShow(s, day(7))?.key).toBe(DISCOVER_ITEMS[0].key);
  });

  it('"Not for us" never comes back', () => {
    const s = initialDiscoverState(created, DISCOVER_ITEMS.map((i) => i.key));
    expect(discoverCardToShow(s, day(30))).toBeNull();
  });

  it('"Not now" snoozes a week (week 3); set up / dismiss moves on to the next', () => {
    let s = initialDiscoverState(created);
    const first = DISCOVER_ITEMS[0].key;
    s = snoozeDiscover(s, first, day(7));
    expect(discoverCardToShow(s, day(8))?.key).toBe(DISCOVER_ITEMS[1].key);
    s = resolveDiscover(s, DISCOVER_ITEMS[1].key, 'done');
    expect(discoverCardToShow(s, day(8))?.key).toBe(DISCOVER_ITEMS[2].key);
    expect(discoverCardToShow({ [first]: s[first]! }, day(14))?.key).toBe(first);
  });

  it('families from before this feature see no cards', () => {
    expect(discoverCardToShow(undefined, day(100))).toBeNull();
  });
});

describe('expandForWhom (task packs "for whom")', () => {
  const { expandForWhom } = require('@/lib/starterKit');
  const rows = [{ title: 'Make my bed' }, { title: 'Brush my teeth' }];
  const kids = [{ id: 'vian' }, { id: 'vayu' }];
  it('"each kid" makes one assigned copy per kid', () => {
    const out = expandForWhom(rows, 'each', kids);
    expect(out).toHaveLength(4);
    expect(out.map((r: any) => r.assignedTo)).toEqual(['vian', 'vian', 'vayu', 'vayu']);
  });
  it('a single kid gets just their own copies', () => {
    expect(expandForWhom(rows, 'vayu', kids).map((r: any) => r.assignedTo)).toEqual(['vayu', 'vayu']);
  });
  it('"everyone" (or no kids yet) makes shared tasks', () => {
    expect(expandForWhom(rows, 'all', kids).every((r: any) => r.assignedTo === null)).toBe(true);
    expect(expandForWhom(rows, 'each', []).every((r: any) => r.assignedTo === null)).toBe(true);
  });
});
