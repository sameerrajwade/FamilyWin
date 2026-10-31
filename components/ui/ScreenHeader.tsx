/**
 * components/ui/ScreenHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * THE header for every screen pushed on top of the tabs, so navigation feels
 * like one app: same position, same back affordance, same title treatment.
 *
 *   <ScreenHeader title="Approvals" />                       // ‹ Back
 *   <ScreenHeader title="New Task" variant="modal" />        // ✕ close
 *   <ScreenHeader title="Sam" right={<ShareButton />} />
 *
 * Back never dead-ends: if there's no history (opened from a notification or
 * deep link) it goes Home instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';
import { FontFamily, FontSize, Spacing } from '@/constants/theme';

interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** 'push' = ‹ Back (stack screens), 'modal' = ✕ (sheets / modals). */
  variant?: 'push' | 'modal';
  right?: ReactNode;
  /** Override the default back behaviour (e.g. confirm discarding a form). */
  onBack?: () => void;
}

export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/app/tabs' as any);
}

export function ScreenHeader({ title, subtitle, variant = 'push', right, onBack }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const isModal = variant === 'modal';
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        <TouchableOpacity
          onPress={onBack ?? goBackOrHome}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.backBtn, isModal && { backgroundColor: colors.border + '80' }]}
          accessibilityRole="button"
          accessibilityLabel={isModal ? 'Close' : 'Back'}
        >
          <Icon name={isModal ? 'close' : 'chevron-back'} size={isModal ? 20 : 24} color={isModal ? colors.text : colors.primary} />
          {!isModal && <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.center}>
        {title ? <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text> : null}
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 52 },
  side: { width: 84, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end' },
  backBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, minHeight: 36, minWidth: 36, justifyContent: 'center' },
  backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, marginLeft: -2 },
  center: { flex: 1, alignItems: 'center' },
  title: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  subtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginTop: 1 },
});
