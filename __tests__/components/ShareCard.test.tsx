import { render } from '@testing-library/react-native';
import { ShareCardBody, familyLabel, shareContext, standingsRows } from '@/components/ui/ShareCard';

describe('share cards', () => {
  it('names the family once, whatever the family called itself', () => {
    expect(familyLabel('Rajwade')).toBe('The Rajwade family');
    expect(familyLabel('Rajwade Family')).toBe('Rajwade Family');
    expect(familyLabel('')).toBe('Our family');
    expect(shareContext('Rajwade', 'Oct 27 – Nov 2')).toBe('The Rajwade family · Oct 27 – Nov 2');
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
        context: 'The Rajwade family · Oct 27 – Nov 2',
        title: "I'm leading our family's chore race!",
        standings: [{ name: 'Vian', points: 120, highlight: true }, { name: 'Vayu', points: 90 }],
      }} />,
    );
    expect(getByText('The Rajwade family · Oct 27 – Nov 2')).toBeTruthy();
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
