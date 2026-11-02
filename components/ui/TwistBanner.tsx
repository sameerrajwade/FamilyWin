/**
 * components/ui/TwistBanner.tsx — this week's twist + comeback boost
 * (engagement, user-approved 2026-11-01). Shown on Today and Scores.
 *   🎲 Weekly twist: Double chores — Chores pay double this week.
 *   🚀 Comeback boost: +10% on every task this week (only for that player)
 * A parent can tap the twist to skip it for this week. Team week also shows
 * the kids-vs-grown-ups totals (pass `totals`).
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { getTodayDateString, setEngagementSettings } from '@/lib/firebase';
import { twistForWeek, weekStartKeyOf, comebackActive, teamTotals, rotationTwist } from '@/lib/twists';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

export function TwistBanner({ memberId, totals, style }: {
  /** Whose comeback boost to show (the profile being viewed). */
  memberId?: string | null;
  /** This week's earned totals — enables the team-week score line. */
  totals?: Record<string, number>;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family, member, setFamily } = useAuthStore();
  const { members } = useFamilyStore();
  const today = getTodayDateString();
  const weekKey = weekStartKeyOf(today, family?.weekStartDay ?? 1);
  const twist = twistForWeek(weekKey, family as any);
  const boosted = !!memberId && comebackActive(family as any, memberId, today);
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  if (!family?.id || (!twist && !boosted)) return null;

  const team = twist?.kind === 'team' && totals ? teamTotals(members as any[], totals) : null;
  const nextWeekKey = weekStartKeyOf(new Date(Date.parse(weekKey) + 7 * 86_400_000).toISOString().slice(0, 10), family.weekStartDay ?? 1);

  function onTwistPress() {
    if (!twist) return;
    const next = rotationTwist(nextWeekKey);
    if (!isParent) { Alert.alert(`${twist.emoji} ${twist.title}`, `${twist.blurb}\n\nNext week: ${next.emoji} ${next.title}.`); return; }
    Alert.alert(`${twist.emoji} ${twist.title}`, `${twist.blurb}\n\nNext week: ${next.emoji} ${next.title}.\nSwitch twists off any time in Game rules.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Skip this week',
        onPress: () => {
          setFamily({ ...family!, twistSkip: { ...((family as any).twistSkip ?? {}), [weekKey]: true } } as any);
          setEngagementSettings(family!.id, { skipWeek: weekKey }).catch(() => Alert.alert('That didn’t work', 'Could not skip the twist. Please try again.'));
        },
      },
    ]);
  }

  return (
    <View style={[styles.wrap, style]}>
      {twist && (
        <TouchableOpacity style={styles.row} onPress={onTwistPress} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={`This week's twist: ${twist.title}. ${twist.blurb}`}>
          <EmojiIcon emoji={twist.emoji} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>THIS WEEK’S TWIST</Text>
            <Text style={styles.title}>{twist.title}</Text>
            <Text style={styles.blurb}>{twist.blurb}</Text>
            {team && (
              <Text style={styles.team}>Kids {team.kids} · Grown-ups {team.grownups}{team.kids === team.grownups ? '' : team.kids > team.grownups ? ' — kids lead!' : ' — grown-ups lead!'}</Text>
            )}
          </View>
        </TouchableOpacity>
      )}
      {boosted && (
        <View style={[styles.row, twist && styles.divider]} accessibilityLabel="Comeback boost: plus 10 percent on every task this week">
          <EmojiIcon emoji="🚀" size={30} />
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>COMEBACK BOOST</Text>
            <Text style={styles.blurb}>+10% on every task this week (up to +5 each). Time to climb!</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.primary + '40', paddingHorizontal: Spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    eyebrow: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 1, color: colors.textAccent },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    blurb: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, lineHeight: 18 },
    team: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.textAccent, marginTop: 2 },
  });
}
