/**
 * Brand.tsx — Lootboard brand identity (Champion / trophy direction).
 *
 * `LootboardMark`  — the standalone gold trophy glyph (SVG, scales crisply).
 * `BrandLockup`    — mark + "Lootboard" wordmark, themed. Use in screen headers.
 *
 * The mark is pure vector (react-native-svg) so it is razor-sharp from a 24px
 * header glyph up to the 512px Play Store icon. Colours: gold cup + a purple
 * victory star, matching the app's Purple + Gold system (constants/theme.ts).
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { FontFamily, Spacing } from '@/constants/theme';

export function LootboardMark({ size = 28 }: { size?: number }) {
  // Unique gradient ids per instance so multiple marks on one screen don't clash.
  const uid = React.useId().replace(/[:]/g, '');
  const gold = `lbGold${uid}`;
  const gold2 = `lbGold2${uid}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Defs>
        <LinearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFEBAF" />
          <Stop offset="0.5" stopColor="#FFC24B" />
          <Stop offset="1" stopColor="#EF9A1B" />
        </LinearGradient>
        <LinearGradient id={gold2} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F3AD3C" />
          <Stop offset="1" stopColor="#D67F12" />
        </LinearGradient>
      </Defs>
      {/* handles */}
      <Path d="M30,34 C17,34 17,51 32,53" fill="none" stroke={`url(#${gold})`} strokeWidth={5.2} strokeLinecap="round" />
      <Path d="M66,34 C79,34 79,51 64,53" fill="none" stroke={`url(#${gold})`} strokeWidth={5.2} strokeLinecap="round" />
      {/* stem + base */}
      <Rect x={43.4} y={58} width={9.2} height={11} fill={`url(#${gold2})`} />
      <Rect x={38.5} y={67.5} width={19} height={5.4} rx={2.7} fill={`url(#${gold})`} />
      <Rect x={32.5} y={73} width={31} height={7.2} rx={3.4} fill={`url(#${gold2})`} />
      {/* rim + cup */}
      <Rect x={23.5} y={23.5} width={49} height={8.4} rx={4.2} fill={`url(#${gold})`} />
      <Path d="M30,31 H66 C66,49.5 58,60.5 48,60.5 C38,60.5 30,49.5 30,31 Z" fill={`url(#${gold})`} />
      {/* victory star */}
      <G x={48} y={42.4}>
        <Path d="M0,-8 L1.9,-2.6 L7.7,-2.6 L3,1 L4.8,6.9 L0,3.2 L-4.8,6.9 L-3,1 L-7.7,-2.6 L-1.9,-2.6 Z" fill="#4A42CC" />
      </G>
    </Svg>
  );
}

type LockupSize = 'sm' | 'md' | 'lg';

export function BrandLockup({ size = 'md', style }: { size?: LockupSize; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const cfg: Record<LockupSize, { mark: number; font: number }> = {
    sm: { mark: 24, font: 17 },
    md: { mark: 28, font: 20 },
    lg: { mark: 36, font: 27 },
  };
  const { mark, font } = cfg[size];
  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="header"
      accessibilityLabel="Lootboard"
    >
      <LootboardMark size={mark} />
      <Text style={[styles.word, { fontSize: font, color: colors.text }]}>
        Loot<Text style={{ color: colors.primary }}>board</Text>
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
