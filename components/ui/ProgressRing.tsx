/**
 * components/ui/ProgressRing.tsx — a circular progress ring (Phase E)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by the daily quest ring (E1) and the save-for-a-reward ring (E2).
 * `segments` are drawn end to end from 12 o'clock, each a 0..1 fraction of the
 * full circle with its own colour (e.g. approved purple, then pending amber).
 * Whatever is passed as children sits in the middle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

export interface RingSegment { value: number; color: string }

export function ProgressRing({ segments, size = 46, stroke = 5, children, accessibilityLabel }: {
  segments: RingSegment[];
  size?: number;
  stroke?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s, i) => {
    const len = Math.max(0, Math.min(1, s.value)) * c;
    const arc = len > 0 ? (
      <Circle
        key={i}
        cx={size / 2} cy={size / 2} r={r}
        stroke={s.color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset}
      />
    ) : null;
    offset += len;
    return arc;
  });

  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      {/* Rotated -90° so the first segment starts at 12 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {arcs}
      </Svg>
      <View style={styles.center} pointerEvents="none">{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
