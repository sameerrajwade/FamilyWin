import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { signIn, sendPasswordReset } from '@/lib/firebase';
import { signInWithGoogle } from '@/lib/googleAuth';
import { useAuthStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Strings } from '@/constants/strings';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  // ── Forgot password ────────────────────────────────────────────────────────
  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Enter Your Email', 'Type your email address above, then tap "Forgot Password?".');
      return;
    }
    try {
      setIsForgotLoading(true);
      await sendPasswordReset(email.trim());
      Alert.alert('Email Sent ✉️', `We sent a password reset link to ${email.trim()}. Check your inbox.`);
    } catch {
      Alert.alert('Error', 'Could not send reset email. Make sure the email address is correct.');
    } finally {
      setIsForgotLoading(false);
    }
  }

  // ── Email / password login ─────────────────────────────────────────────────
  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      setIsLoading(true);
      await signIn(email.trim().toLowerCase(), password);
      // Auth state listener in _layout.tsx handles navigation
    } catch {
      Alert.alert('Login Failed', 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  // If the Google user has no /users/{uid} doc yet, _layout.tsx routes them to
  // onboarding automatically — no extra logic needed here.
  async function handleGoogleSignIn() {
    try {
      setIsGoogleLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await signInWithGoogle();
      if (!result.success && !result.cancelled) {
        Alert.alert('Google Sign-In Failed', result.error ?? 'Please try again.');
      }
      // Success: _layout.tsx onAuthStateChanged handles routing
    } finally {
      setIsGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header — UNCHANGED ── */}
          <View style={styles.header}>
            <Text style={styles.logo}>🏆</Text>
            <Text style={styles.appName}>{Strings.app.name}</Text>
            <Text style={styles.tagline}>{Strings.app.tagline}</Text>
          </View>

          {/* ── Form card — UNCHANGED ── */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>Welcome back!</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{Strings.auth.email}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{Strings.auth.password}</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={handleForgotPassword}
              disabled={isForgotLoading}
              accessibilityLabel="Forgot password — send reset email"
              accessibilityRole="button"
            >
              <Text style={styles.forgotPasswordText}>
                {isForgotLoading ? 'Sending…' : Strings.auth.forgotPassword}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading || isGoogleLoading}
              activeOpacity={0.8}
              accessibilityLabel="Sign in with email and password"
              accessibilityRole="button"
            >
              {isLoading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.primaryButtonText}>{Strings.auth.signIn}</Text>
              }
            </TouchableOpacity>

            {/* ── Divider — UNCHANGED ── */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* ── Google Sign-In button — NEW (matches existing secondary button style) ── */}
            <TouchableOpacity
              style={[styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading}
              activeOpacity={0.8}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <View style={styles.googleButtonInner}>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/auth/register')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>
                {Strings.auth.noAccount}{' '}
                <Text style={styles.linkText}>{Strings.auth.signUp}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── STYLES — all original StyleSheet values preserved ───────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  keyboardView: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xxl, marginTop: Spacing.xl },
  logo: { fontSize: 64, marginBottom: Spacing.sm },
  appName: { fontSize: FontSize.xxxl, fontFamily: FontFamily.black, color: Colors.primary, letterSpacing: -0.5 },
  tagline: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: Spacing.xs, letterSpacing: 1, textTransform: 'uppercase' },
  form: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, ...Shadow.md,
  },
  formTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, color: Colors.text, marginBottom: Spacing.lg },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.text, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md, fontFamily: FontFamily.regular, color: Colors.text, backgroundColor: Colors.background,
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: Colors.border, borderRadius: BorderRadius.md, backgroundColor: Colors.background,
  },
  passwordInput: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular, color: Colors.text },
  eyeButton: { paddingHorizontal: Spacing.md, paddingVertical: 14 },
  eyeIcon: { fontSize: 18 },
  forgotPassword: { alignSelf: 'flex-end', marginBottom: Spacing.md },
  forgotPasswordText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.primary },
  primaryButton: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.xs, ...Shadow.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFFFFF', letterSpacing: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textMuted, marginHorizontal: Spacing.sm },
  // ── Google button — new, matches secondary button aesthetic ──
  googleButton: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  googleButtonInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  googleIcon: { fontSize: 16, fontWeight: '800', color: '#4285F4', fontFamily: FontFamily.black },
  googleButtonText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: Colors.text },
  secondaryButton: { alignItems: 'center', paddingVertical: Spacing.sm },
  secondaryButtonText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary },
  linkText: { fontFamily: FontFamily.bold, color: Colors.primary },
});
