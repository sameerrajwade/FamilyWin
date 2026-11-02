/**
 * components/ui/InviteNudge.tsx — "better together" card on Today (Phase G9)
 * ─────────────────────────────────────────────────────────────────────────────
 * A parent alone in the family sees ONE small card (lib/nudges
 * inviteNudgeToShow): add the first kid, or invite the other grown-up with the
 * family code (opens the branded invite share card). Parents only.
 *   Not now → back in a week; after 3 it stops for good
 *   ✕       → never again
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { useNudges } from '@/lib/nudgeStore';
import { inviteNudgeToShow } from '@/lib/nudges';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

const COPY = {
  kid: {
    emoji: '🧒', title: 'Add your first player',
    blurb: 'Kids don’t need a phone or an email — add them in a few seconds and the race begins.',
    cta: 'Add a kid', route: '/app/member/add-child',
  },
  grownup: {
    emoji: '🤝', title: 'Better with two grown-ups',
    blurb: 'Send your family code so the other parent can approve chores and join the race.',
    cta: 'Share family code', route: '/app/family?invite=1',
  },
} as const;

export function InviteNudge({ style }: { style?: any }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family } = useAuthStore();
  const { members } = useFamilyStore();
  const { invite, firstSeenAt, snoozeInvite, neverInvite } = useNudges();
  const kind = inviteNudgeToShow(members as any[], invite, firstSeenAt ? new Date(firstSeenAt) : null);
  if (!family?.id || !kind) return null;
  const c = COPY[kind];

  return (
    <View style={[styles.card, style]} accessibilityLabel={c.title}>
      <View style={styles.top}>
        <EmojiIcon emoji={c.emoji} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>BETTER TOGETHER</Text>
          <Text style={styles.title}>{c.title}</Text>
          <Text style={styles.blurb}>{c.blurb}</Text>
        </View>
        <TouchableOpacity onPress={neverInvite} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${c.title}: don't show again`}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.later} onPress={snoozeInvite} accessibilityRole="button">
          <Text style={styles.laterText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.go} onPress={() => router.push(c.route as any)} accessibilityRole="button">
          <Text style={styles.goText}>{c.cta}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.primary + '40', padding: Spacing.md },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    eyebrow: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 1, color: colors.textAccent },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: 1 },
    blurb: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    close: { fontSize: 18, fontFamily: FontFamily.bold, color: colors.textMuted, paddingHorizontal: 4 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
    later: { borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    laterText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textSecondary },
    go: { backgroundColor: colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    goText: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: '#FFFFFF' },
  });
}
