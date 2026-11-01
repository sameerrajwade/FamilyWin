/**
 * components/ui/DiscoverCard.tsx — "Discover more" on Today (Phase G6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Features a new family skipped at setup come back here one at a time, from
 * week 2 (lib/starterKit discoverCardToShow). Parents only.
 *   Set it up → opens the right screen, never shown again
 *   Not now   → back in a week (week 3)
 *   ✕         → not for us, never shown again
 * Families from before G6 have no schedule, so they never see it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { setDiscoverState } from '@/lib/firebase';
import { discoverCardToShow, snoozeDiscover, resolveDiscover, type DiscoverState } from '@/lib/starterKit';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

export function DiscoverCard({ style }: { style?: any }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family, setFamily } = useAuthStore();
  const state = (family?.discover ?? null) as DiscoverState | null;
  const item = discoverCardToShow(state);
  if (!family?.id || !state || !item) return null;

  function save(next: DiscoverState) {
    setFamily({ ...family!, discover: next } as any);
    setDiscoverState(family!.id, next as any).catch(() => {});
  }

  return (
    <View style={[styles.card, style]} accessibilityLabel={`Discover: ${item.title}`}>
      <View style={styles.top}>
        <EmojiIcon emoji={item.emoji} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>WHEN YOU'RE READY</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.blurb}>{item.blurb}</Text>
        </View>
        <TouchableOpacity onPress={() => save(resolveDiscover(state!, item.key, 'no'))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${item.title}: not for us`}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.later} onPress={() => save(snoozeDiscover(state!, item.key))} accessibilityRole="button">
          <Text style={styles.laterText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.go}
          onPress={() => { save(resolveDiscover(state!, item.key, 'done')); router.push(item.route as any); }}
          accessibilityRole="button"
        >
          <Text style={styles.goText}>{item.cta}</Text>
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
