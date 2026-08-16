/**
 * components/ui/Plus.tsx
 * Shared Lootboard Plus UI: the PLUS badge (marks premium features) and the
 * "free for everyone right now" banner. Both no-op when SHOW_PLUS_MARKETING is
 * false, so hiding all Plus messaging is also a one-flag change.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { FontFamily, FontSize, Spacing, BorderRadius, Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { SHOW_PLUS_MARKETING } from '@/lib/entitlements';
import { MONETIZATION_ENABLED } from '@/constants/plans';

/** Small gold "PLUS" pill shown next to premium features. */
export function PlusBadge({ style }: { style?: any }) {
  const { colors } = useTheme();
  if (!SHOW_PLUS_MARKETING) return null;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: Colors.gold + '2A', borderColor: Colors.gold + '99' }, style]}>
      <Icon name="star" size={10} color={colors.text} />
      <Text style={[badgeStyles.text, { color: colors.text }]}>PLUS</Text>
    </View>
  );
}

/**
 * Banner announcing that Plus is free for everyone right now. Tappable → the
 * Plus screen. Rendered only while monetization is OFF (once paid, this is
 * replaced by real upsell placements).
 */
export function FreeForAllBanner() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!SHOW_PLUS_MARKETING || MONETIZATION_ENABLED) return null;
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => router.push('/app/settings/plus' as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Lootboard Plus is free for everyone right now"
    >
      <View style={styles.iconWrap}><Text style={styles.emoji}>🎉</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Lootboard Plus — free for everyone</Text>
        <Text style={styles.sub}>Every premium feature is unlocked right now. Tap to see what’s inside.</Text>
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 9, fontFamily: FontFamily.black, letterSpacing: 0.5 },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
      padding: Spacing.md, borderRadius: BorderRadius.lg,
      backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '55',
    },
    iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold + '2E' },
    emoji: { fontSize: 20 },
    title: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.text },
    sub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 1 },
  });
}
