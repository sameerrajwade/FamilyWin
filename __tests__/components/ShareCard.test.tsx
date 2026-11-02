import { render } from '@testing-library/react-native';
import { ShareCardBody, shareContext, standingsRows } from '@/components/ui/ShareCard';

describe('share cards', () => {
  it('never names the family (privacy) — just the game and the week', () => {
    expect(shareContext('Oct 27 – Nov 2')).toBe('The family chore game · Oct 27 – Nov 2');
    expect(shareContext()).toBe('The family chore game');
  });

  it('shows the top 3 only, never the whole family', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ memberId: n, displayName: `${n} Rajwade`, points: 100 - i }));
    const rows = standingsRows(many, 'A');
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    const { queryByText } = render(<ShareCardBody data={{ icon: 'podium', title: 'x', standings: many.map((m) => ({ name: m.displayName, points: m.points })) }} />);
    expect(queryByText('D Rajwade')).toBeNull();
  });

  it('standings use first names and mark who the card is about', () => {
    const rows = standingsRows([
      { memberId: 'a', displayName: 'Vian Rajwade', avatarEmoji: '🦁', points: 120 },
      { memberId: 'b', displayName: 'Vayu', avatarEmoji: '🐼', points: 90 },
    ], 'a');
    expect(rows).toEqual([
      { name: 'Vian', points: 120, emoji: '🦁', highlight: true },
      { name: 'Vayu', points: 90, emoji: '🐼', highlight: false },
    ]);
  });

  it('says what the game is, shows what is being led, and ends with the challenge', () => {
    const { getByText } = render(
      <ShareCardBody data={{
        icon: 'podium', hero: '🏆', theme: 'race', eyebrow: 'LIVE STANDINGS',
        context: 'The family chore game · Oct 27 – Nov 2',
        title: "I'm leading our family's chore race!",
        standings: [{ name: 'Vian', points: 120, highlight: true }, { name: 'Vayu', points: 90 }],
      }} />,
    );
    expect(getByText('The family chore game · Oct 27 – Nov 2')).toBeTruthy();
    expect(getByText("I'm leading our family's chore race!")).toBeTruthy();
    expect(getByText('120 pts')).toBeTruthy();
    expect(getByText('Vayu')).toBeTruthy();
    expect(getByText('Think your family can beat us?')).toBeTruthy();
  });

  it('falls back to "the family chore game" when no context is given', () => {
    const { getByText } = render(<ShareCardBody data={{ icon: 'chest', title: 'Hi' }} />);
    expect(getByText('The family chore game')).toBeTruthy();
  });
});
