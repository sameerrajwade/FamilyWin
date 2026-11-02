/**
 * app/app/settings/about.tsx
 * Sub-screen: Help & Legal — FAQ, privacy & terms summaries, contact, share,
 * and app version. Static, self-contained content.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Share, Linking, StyleSheet } from 'react-native';
import { SettingsScaffold, SettingsGroup, NavRow } from '@/components/ui/SettingsUI';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';
import { APP_STORE_URL, SUPPORT_EMAIL } from '@/constants/strings';
import { FontFamily, FontSize, Spacing } from '@/constants/theme';



const FAQ: { q: string; a: string }[] = [
  { q: 'How do points work?', a: 'Each task is worth points by difficulty — Easy 10, Medium 25, Hard 50. Complete tasks to earn them. The member with the most points when the week resets wins the week.' },
  { q: 'When does the week reset?', a: 'At midnight on your chosen reset day (Monday by default). Any parent can change it in Family → Game rules.' },
  { q: 'Do children need their own phone?', a: 'No. A parent adds a child profile and switches to it from the Tasks tab to complete tasks on the child\'s behalf. Older kids can also join with their own phone using the family invite code.' },
  { q: 'How do rewards work?', a: 'Parents add rewards with a point cost. A member requests one, a parent approves it, and the points are deducted on approval. Points saved in the Vault carry across weeks.' },
  { q: 'What is the missed-task penalty?', a: 'Optional. When on, points come off a daily task that isn\'t done that day — but you can mark it done up to 2 days later on the Catch-up screen to win them back.' },
];

const PRIVACY_POINTS = [
  'Accounts are created and controlled by parents/guardians. Children do not sign in.',
  'We collect only what runs the app: account email, family/profile info you enter, and the tasks, points and rewards you create.',
  'No location, contacts, messages, or payment data. No advertising identifiers, ever.',
  'Data is stored on Google Firebase acting as our processor, and is never sold or shared for advertising.',
  'You can delete your account and its data anytime from Settings → Account.',
];

const TERMS_POINTS = [
  'Chore League is provided as-is to help families track chores and rewards for personal, non-commercial use.',
  'You are responsible for the accounts and profiles you create and for supervising children\'s use.',
  'Points and rewards have no monetary value and cannot be exchanged for cash.',
  'We may update the app and these terms over time; continued use means you accept the current version.',
];

export default function AboutScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <SettingsScaffold title="Help & Legal">
      <SettingsGroup title="FAQ">
        {FAQ.map((item, i) => {
          const open = openFaq === i;
          return (
            <View key={i} style={[i < FAQ.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={styles.faqQRow}
                onPress={() => setOpenFaq(open ? null : i)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Text style={[styles.faqQ, { color: colors.text }]}>{item.q}</Text>
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {open && <Text style={[styles.faqA, { color: colors.textSecondary }]}>{item.a}</Text>}
            </View>
          );
        })}
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <View style={styles.legalBlock}>
          {PRIVACY_POINTS.map((p, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: colors.textAccent }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{p}</Text>
            </View>
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup title="Terms of Use">
        <View style={styles.legalBlock}>
          {TERMS_POINTS.map((p, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: colors.textAccent }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{p}</Text>
            </View>
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup title="Support">
        <NavRow
          icon="mail-outline"
          label="Contact Support"
          subtitle={SUPPORT_EMAIL}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Chore%20League%20Support`)}
        />
        <NavRow
          icon="share-social-outline"
          label="Share Chore League"
          subtitle="Invite friends & family to try it"
          isLast
          onPress={() =>
            Share.share({
              message:
                '🏆 We use Chore League to turn chores into a fun family competition!\n\nKids earn points for completing tasks and win rewards. Download it free:\n' + APP_STORE_URL,
              title: 'Try Chore League — Family Chore Tracker',
            })
          }
        />
      </SettingsGroup>

      <Text style={[styles.version, { color: colors.textMuted }]}>Chore League v1.0.0 · Made with ❤️</Text>
    </SettingsScaffold>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    faqQRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, gap: Spacing.sm },
    faqQ: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
    faqA: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 20, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, marginTop: -2 },
    legalBlock: { padding: Spacing.md, gap: Spacing.sm },
    bulletRow: { flexDirection: 'row', gap: 8 },
    bulletDot: { fontSize: FontSize.md, fontFamily: FontFamily.bold, lineHeight: 20 },
    bulletText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 20 },
    version: { textAlign: 'center', fontSize: FontSize.xs, fontFamily: FontFamily.regular, paddingVertical: Spacing.xl },
  });
}
