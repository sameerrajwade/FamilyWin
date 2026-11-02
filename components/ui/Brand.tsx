/**
 * Brand.tsx — Chore League brand identity (Treasure-chest direction).
 *
 * `LootboardMark`  — the standalone brand glyph. Now the gold TREASURE CHEST
 *                    (see components/ui/BrandIcons.tsx — the single source of
 *                    truth for the icon family). Kept as a thin alias so the
 *                    existing `BrandBar` / `BrandLockup` call sites across the
 *                    tab screens pick up the approved mark with no edits.
 * `BrandLockup`    — mark + two-tone "Chore League" wordmark, themed. Screen headers.
 *
 * The mark is pure vector (react-native-svg) so it is razor-sharp from a 24px
 * header glyph up to the 512px Play Store icon.
 */
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, Spacing } from '@/constants/theme';
import { ChestMark, Brand } from '@/components/ui/BrandIcons';

export function LootboardMark({ size = 28 }: { size?: number }) {
  // The sparkle reads as clutter at tiny header sizes — only show it ≥40px.
  return <ChestMark size={size} sparkle={size >= 40} />;
}

type LockupSize = 'sm' | 'md' | 'lg';

export function BrandLockup({ size = 'md', style }: { size?: LockupSize; style?: StyleProp<ViewStyle> }) {
  const { isDark } = useTheme();
  const cfg: Record<LockupSize, { mark: number; font: number }> = {
    sm: { mark: 24, font: 17 },
    md: { mark: 28, font: 20 },
    lg: { mark: 36, font: 27 },
  };
  const { mark, font } = cfg[size];
  const loot = isDark ? Brand.purpleLight : Brand.purple;
  const board = isDark ? Brand.goldLid : Brand.goldDeep; // gold "League" (user pick 2026-11-01)
  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="header"
      accessibilityLabel="Chore League"
    >
      <LootboardMark size={mark} />
      <Text style={[styles.word, { fontSize: font }]}>
        <Text style={{ color: loot }}>Chore</Text><Text style={{ color: board }}> League</Text>
      </Text>
    </View>
  );
}

/**
 * weekCountdownLabel — days until the week is decided (Sunday midnight).
 * Sunday itself is the final day. Kept compact for the app-bar chip.
 */
export function weekCountdownLabel(): string {
  const d = new Date().getDay(); // 0 = Sunday
  const n = d === 0 ? 0 : 7 - d;
  return n === 0 ? 'Final day!' : `${n} day${n > 1 ? 's' : ''} left`;
}

/**
 * WeekCountdownChip — gold "🏆 N days left" pill. Lives on the right of the
 * BrandBar so the highlighted app-bar carries the win-the-week stakes on every
 * screen. Gold reads on both themes; text brightens in dark mode.
 */
export function WeekCountdownChip() {
  const { isDark } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: isDark ? 'rgba(255,193,75,0.18)' : 'rgba(255,193,75,0.20)' }]}>
      <Text style={styles.chipTrophy}>🏆</Text>
      <Text style={[styles.chipText, { color: isDark ? '#FFCF6B' : '#9A6A05' }]}>{weekCountdownLabel()}</Text>
    </View>
  );
}

/**
 * BrandBar — pinned top app-bar carrying the brand. Render as the FIRST child of a
 * screen's SafeAreaView so the brand always sits above per-screen chrome (e.g. the
 * family profile switcher). Lockup on the left, week-countdown chip on the right.
 * Pass `showCountdown={false}` on screens where the stakes chip would be noise.
 */
export function BrandBar({ style, showCountdown = true }: { style?: StyleProp<ViewStyle>; showCountdown?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }, style]}>
      <BrandLockup size="sm" />
      {showCountdown && (
        <>
          <View style={{ flex: 1 }} />
          <Text style={[styles.barDate, { color: colors.textMuted }]}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          <WeekCountdownChip />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  word: { fontFamily: FontFamily.black, letterSpacing: -0.5 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipTrophy: { fontSize: 13 },
  chipText: { fontSize: 12.5, fontFamily: FontFamily.extraBold, letterSpacing: -0.2 },
  barDate: { fontSize: 12.5, fontFamily: FontFamily.bold, marginRight: 8 },
});
