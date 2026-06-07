import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ViewStyle, TextStyle, Image,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

// ─── BUTTON ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label, onPress, variant = 'primary', size = 'md',
  disabled, loading, icon, fullWidth, style,
}: ButtonProps) {
  const { colors, isChildMode, fontSize, spacing } = useTheme();
  const scale = useSharedValue(1);

  const bgColors: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.surface,
    danger: colors.danger,
    success: colors.success,
    ghost: 'transparent',
  };

  const textColors: Record<ButtonVariant, string> = {
    primary: '#FFFFFF',
    secondary: colors.text,
    danger: '#FFFFFF',
    success: '#FFFFFF',
    ghost: colors.primary,
  };

  const paddings: Record<ButtonSize, { h: number; v: number }> = {
    sm: { h: 14, v: 8 },
    md: { h: 20, v: isChildMode ? 16 : 13 },
    lg: { h: 28, v: isChildMode ? 20 : 16 },
  };

  const fontSizes: Record<ButtonSize, number> = {
    sm: fontSize(FontSize.xs),
    md: fontSize(FontSize.md),
    lg: fontSize(FontSize.lg),
  };

  function handlePressIn() {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }

  async function handlePress() {
    await Haptics.impactAsync(
      size === 'lg'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    onPress();
  }

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pad = paddings[size];

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, animStyle]}>
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: bgColors[variant],
            paddingHorizontal: pad.h,
            paddingVertical: pad.v,
            borderWidth: variant === 'secondary' ? 1.5 : 0,
            borderColor: variant === 'secondary' ? colors.border : 'transparent',
            opacity: disabled || loading ? 0.6 : 1,
          },
          variant === 'primary' && Shadow.lg,
          style,
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
      >
        {loading ? (
          <ActivityIndicator color={textColors[variant]} size="small" />
        ) : (
          <View style={styles.buttonInner}>
            {icon ? <Text style={[styles.buttonIcon, { fontSize: fontSizes[size] + 2 }]}>{icon}</Text> : null}
            <Text style={[styles.buttonLabel, { color: textColors[variant], fontSize: fontSizes[size] }]}>
              {label}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  onPress?: () => void;
  noPadding?: boolean;
}

export function Card({ children, style, elevated, onPress, noPadding }: CardProps) {
  const { colors } = useTheme();
  const content = (
    <View style={[
      styles.card,
      { backgroundColor: elevated ? colors.surfaceElevated : colors.surface },
      elevated ? Shadow.md : Shadow.sm,
      noPadding ? {} : { padding: Spacing.md },
      style,
    ]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ─── BADGE ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: string;
}

export function Badge({ label, variant = 'primary', size = 'md', icon }: BadgeProps) {
  const { colors } = useTheme();

  const configs: Record<BadgeVariant, { bg: string; text: string }> = {
    primary: { bg: colors.primary + '22', text: colors.primary },
    success: { bg: colors.successLight, text: colors.success },
    warning: { bg: colors.warningLight, text: colors.warning },
    danger: { bg: colors.dangerLight, text: colors.danger },
    neutral: { bg: colors.border, text: colors.textSecondary },
  };

  const config = configs[variant];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, paddingVertical: size === 'sm' ? 3 : 5 }]}>
      {icon ? <Text style={{ fontSize: size === 'sm' ? 10 : 12, marginRight: 3 }}>{icon}</Text> : null}
      <Text style={[styles.badgeText, { color: config.text, fontSize: size === 'sm' ? FontSize.xs - 1 : FontSize.xs }]}>
        {label}
      </Text>
    </View>
  );
}

// ─── AVATAR ──────────────────────────────────────────────────────────────────

interface AvatarProps {
  emoji: string;
  size?: number;
  showRing?: boolean;
  ringColor?: string;
  /** Firebase Storage download URL — shows a real photo instead of emoji */
  photoURL?: string;
}

export function Avatar({ emoji, size = 44, showRing, ringColor, photoURL }: AvatarProps) {
  const { colors } = useTheme();
  return (
    <View style={[
      styles.avatar,
      {
        width: size, height: size, borderRadius: size / 2,
        borderWidth: showRing ? 2.5 : 0,
        borderColor: ringColor ?? colors.primary,
        backgroundColor: colors.background,
        overflow: 'hidden',
      },
    ]}>
      {photoURL ? (
        <Image
          source={{ uri: photoURL }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
      )}
    </View>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ emoji, title, subtitle, action }: EmptyStateProps) {
  const { colors, fontSize, isChildMode } = useTheme();
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyEmoji, isChildMode && { fontSize: 72 }]}>{emoji}</Text>
      <Text style={[styles.emptyTitle, { color: colors.text, fontSize: fontSize(FontSize.lg) }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary, fontSize: fontSize(FontSize.sm) }]}>
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: Spacing.lg }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const { colors, fontSize } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize(FontSize.lg) }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={styles.sectionAction}>
          <Text style={[styles.sectionActionText, { color: colors.primary }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── DIVIDER ─────────────────────────────────────────────────────────────────

export function Divider({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }, style]} />;
}

// ─── POINTS CHIP ─────────────────────────────────────────────────────────────

interface PointsChipProps {
  points: number;
  size?: 'sm' | 'md' | 'lg';
}

export function PointsChip({ points, size = 'md' }: PointsChipProps) {
  const { colors } = useTheme();
  const isPositive = points >= 0;
  const bg = isPositive ? colors.successLight : colors.dangerLight;
  const textColor = isPositive ? colors.success : colors.danger;
  const sizes = { sm: FontSize.xs, md: FontSize.md, lg: FontSize.xl };

  return (
    <View style={[styles.pointsChip, { backgroundColor: bg }]}>
      <Text style={[styles.pointsChipText, { color: textColor, fontSize: sizes[size] }]}>
        {isPositive ? '+' : ''}{points} pts
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  button: { borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buttonIcon: { },
  buttonLabel: { fontFamily: FontFamily.bold, letterSpacing: 0.3 },
  card: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm,
    alignSelf: 'flex-start',
  },
  badgeText: { fontFamily: FontFamily.bold },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.lg },
  emptyEmoji: { fontSize: 56, marginBottom: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.bold, textAlign: 'center' },
  emptySubtitle: { fontFamily: FontFamily.regular, textAlign: 'center', marginTop: 6, lineHeight: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontFamily: FontFamily.bold },
  sectionSubtitle: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, marginTop: 2 },
  sectionAction: { padding: Spacing.xs, minHeight: 44, justifyContent: 'center' },
  sectionActionText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  divider: { height: 1, marginVertical: Spacing.sm },
  pointsChip: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  pointsChipText: { fontFamily: FontFamily.extraBold },
});
