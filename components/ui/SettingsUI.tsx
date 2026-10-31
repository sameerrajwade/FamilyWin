/**
 * components/ui/SettingsUI.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared building blocks for the Settings hub and its sub-screens. Keeping these
 * in one place means every settings screen shares the same back-header, section
 * grouping and tappable-row look (see the catch-up screen for the header pattern
 * these mirror).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Icon, IconName } from '@/components/ui/Icon';

/** Full-screen sub-page shell: themed background, back header, scroll body. */
export function SettingsScaffold({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={title} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Labelled group of rows rendered inside a single rounded card. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

/**
 * A tappable settings row: leading icon, label + optional subtitle, and either a
 * chevron (navigation) or a custom `right` node. Pass `onPress` to navigate/act.
 */
export function NavRow({
  icon, iconColor, label, subtitle, onPress, right, danger, isLast,
}: {
  icon?: IconName;
  iconColor?: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tint = danger ? colors.danger : (iconColor ?? colors.primary);
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
      {...(onPress ? { onPress, activeOpacity: 0.6, accessibilityRole: 'button', accessibilityLabel: label } : {})}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: tint + '18' }]}>
          <Icon name={icon} size={19} color={tint} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? right : (onPress ? <Icon name="chevron-forward" size={20} color={colors.textMuted} /> : null)}
    </Wrapper>
  );
}

/** Free-form block inside a group card (used for segmented controls, grids). */
export function SettingsBlock({ children, isLast }: { children: React.ReactNode; isLast?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.block, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      {children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
    backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.primary },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.text },
    group: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
    groupTitle: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, marginLeft: 4, color: colors.textSecondary },
    groupCard: { borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: colors.surface, ...Shadow.sm },
    row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
    rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rowText: { flex: 1 },
    rowLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
    rowSubtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2, color: colors.textSecondary },
    block: { padding: Spacing.md },
  });
}
