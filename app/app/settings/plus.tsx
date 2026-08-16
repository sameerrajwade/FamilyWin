/**
 * app/app/settings/plus.tsx
 * Lootboard Plus showcase. While MONETIZATION_ENABLED is false it leads with a
 * "free for everyone right now" banner, lists every Plus feature (so users learn
 * what's premium), and frames pricing as "when Plus launches" — so enabling paid
 * later is expected, not a surprise. When enabled, this becomes the upgrade page.
 */
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SettingsScaffold } from '@/components/ui/SettingsUI';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { Icon, IconName } from '@/components/ui/Icon';
import { FontFamily, FontSize, Spacing, BorderRadius, Colors, Shadow } from '@/constants/theme';
import { MONETIZATION_ENABLED, PLUS_FEATURES, PLUS_PRICING, FREE_LIMITS } from '@/constants/plans';

export default function PlusScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SettingsScaffold title="Lootboard Plus">
      {/* Status hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>{MONETIZATION_ENABLED ? '⭐' : '🎉'}</Text>
        <Text style={styles.heroTitle}>
          {MONETIZATION_ENABLED ? 'Unlock Lootboard Plus' : 'Plus is free for everyone'}
        </Text>
        <Text style={styles.heroSub}>
          {MONETIZATION_ENABLED
            ? 'Get the whole family competing with every premium feature.'
            : 'Every premium feature below is unlocked for your family right now — no charge. We’ll give you plenty of notice before Plus ever becomes paid.'}
        </Text>
        {!MONETIZATION_ENABLED && (
          <View style={styles.freePill}>
            <Icon name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.freePillText}>All features unlocked · $0</Text>
          </View>
        )}
      </View>

      {/* Feature list */}
      <Text style={styles.sectionLabel}>What’s in Plus</Text>
      <View style={styles.card}>
        {PLUS_FEATURES.map((f, i) => (
          <View key={f.key} style={[styles.featureRow, i < PLUS_FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={styles.featureIcon}>
              <Icon name={(f.icon + '-outline') as IconName} size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
            {!MONETIZATION_ENABLED && <Icon name="checkmark" size={18} color={colors.success} />}
          </View>
        ))}
      </View>

      {/* Free vs Plus */}
      <Text style={styles.sectionLabel}>Free vs Plus</Text>
      <View style={styles.card}>
        <View style={[styles.cmpRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <Text style={[styles.cmpCell, styles.cmpHeadLeft]}>Free</Text>
          <Text style={[styles.cmpCell, styles.cmpHeadRight]}>Plus</Text>
        </View>
        {[
          [`${FREE_LIMITS.maxMembers} members`, 'Unlimited members'],
          [`${FREE_LIMITS.maxActiveRewards} rewards`, 'Unlimited rewards'],
          [`${FREE_LIMITS.historyWeeks} weeks history`, 'Full history & trends'],
          ['Core game & leaderboard', 'Everything + themes, photo proof, insurance'],
        ].map((row, i, arr) => (
          <View key={i} style={[styles.cmpRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <Text style={[styles.cmpCell, { color: colors.textSecondary }]}>{row[0]}</Text>
            <Text style={[styles.cmpCell, { color: colors.text, fontFamily: FontFamily.semiBold }]}>{row[1]}</Text>
          </View>
        ))}
      </View>

      {/* Pricing framing */}
      <View style={styles.pricingBox}>
        <Text style={styles.pricingTitle}>
          {MONETIZATION_ENABLED ? 'Pricing' : 'When Plus launches'}
        </Text>
        <Text style={styles.pricingText}>
          {PLUS_PRICING.monthly} · {PLUS_PRICING.yearly} · {PLUS_PRICING.trialDays}-day free trial · one subscription covers the whole family.
        </Text>
        {!MONETIZATION_ENABLED && (
          <Text style={styles.pricingNote}>Right now it’s all free — nothing to pay, nothing to sign up for.</Text>
        )}
      </View>
    </SettingsScaffold>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    hero: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
    heroEmoji: { fontSize: 44, marginBottom: Spacing.sm },
    heroTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center' },
    heroSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },
    freePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md, backgroundColor: colors.success + '18', borderColor: colors.success + '55', borderWidth: 1, borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: 6 },
    freePillText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.success },
    sectionLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, textTransform: 'uppercase', letterSpacing: 1, color: colors.textSecondary, marginLeft: Spacing.lg + 4, marginBottom: Spacing.sm, marginTop: Spacing.sm },
    card: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: colors.surface, overflow: 'hidden', ...Shadow.sm },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
    featureIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '18' },
    featureTitle: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.text },
    featureDesc: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 1 },
    cmpRow: { flexDirection: 'row', paddingVertical: 11, paddingHorizontal: Spacing.md },
    cmpCell: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.regular },
    cmpHeadLeft: { fontFamily: FontFamily.bold, color: colors.textSecondary },
    cmpHeadRight: { fontFamily: FontFamily.extraBold, color: Colors.gold === '#FFD700' ? colors.text : colors.text },
    pricingBox: { marginHorizontal: Spacing.lg, marginBottom: Spacing.xl, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '2E' },
    pricingTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text, marginBottom: 4 },
    pricingText: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, lineHeight: 18 },
    pricingNote: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.success, marginTop: 6 },
  });
}
