/**
 * app/auth/verify-email.tsx — "Check your email" (user request 2026-11-01).
 * A new email/password account can't set up or join a family until the email
 * is verified (lib/emailVerification + Firestore rules). Firebase sends the
 * link email (sender "Chore League"); this screen waits for the click:
 *   • checks again automatically whenever the app comes back to the front
 *   • "I've verified it" checks right now
 *   • "Resend the email" (60 s cool-down) · "Use a different email" signs out
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { auth } from '@/lib/fb';
import { signOut } from '@/lib/firebase';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const email = auth().currentUser?.email ?? 'your email';
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S); // the sign-up just sent one
  const busy = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const check = useCallback(async (manual: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (manual) setChecking(true);
    try {
      const u = await auth().reloadCurrentUser();
      if (u?.emailVerified) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace('/auth/onboarding');
      } else if (manual) {
        Alert.alert('Not verified yet', `Open the email we sent to ${email} and tap the link, then come back here.`);
      }
    } catch {
      if (manual) Alert.alert('Couldn’t check', 'Check your connection and try again.');
    } finally {
      busy.current = false;
      if (manual) setChecking(false);
    }
  }, [email]);

  // Coming back from the mail app → check without a tap.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(false); });
    return () => sub.remove();
  }, [check]);

  async function resend() {
    if (cooldown > 0) return;
    try {
      await auth().sendEmailVerification();
      setCooldown(RESEND_COOLDOWN_S);
      Alert.alert('Email sent', `We sent a new link to ${email}. It can take a minute — check Spam too.`);
    } catch {
      Alert.alert('Couldn’t send', 'Too many tries — wait a few minutes and try again.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <EmojiIcon emoji="📬" size={96} />
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.text}>
          We sent a link to <Text style={styles.email}>{email}</Text>. Tap it to activate your Chore League account, then come back here.
        </Text>
        <Text style={styles.hint}>It comes from Chore League. Can’t find it? Check Spam or Promotions.</Text>

        <TouchableOpacity style={styles.primary} onPress={() => check(true)} disabled={checking} activeOpacity={0.85} accessibilityRole="button">
          {checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>I’ve verified it</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={resend} disabled={cooldown > 0} accessibilityRole="button" style={styles.linkBtn}>
          <Text style={[styles.link, cooldown > 0 && { color: colors.textMuted }]}>
            {cooldown > 0 ? `Resend the email in ${cooldown}s` : 'Resend the email'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => signOut().catch(() => {})} accessibilityRole="button" style={styles.linkBtn}>
          <Text style={styles.linkMuted}>Use a different email</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
    title: { fontSize: FontSize.xxl, fontFamily: FontFamily.black, color: colors.text, marginTop: Spacing.md, textAlign: 'center' },
    text: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.text, textAlign: 'center', lineHeight: 22 },
    email: { fontFamily: FontFamily.extraBold, color: colors.textAccent },
    hint: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center' },
    primary: { alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.lg },
    primaryText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
    linkBtn: { paddingVertical: 8 },
    link: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textAccent },
    linkMuted: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
  });
}
