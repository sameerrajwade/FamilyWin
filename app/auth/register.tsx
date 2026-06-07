import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { signUp } from '@/lib/firebase';
import { signInWithGoogle } from '@/lib/googleAuth';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleRegister() {
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    try {
      setIsLoading(true);
      await signUp(email.trim().toLowerCase(), password);
      // _layout.tsx auth listener routes new user to /auth/onboarding
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error?.message ?? 'Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setIsGoogleLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await signInWithGoogle();
      if (!result.success && !result.cancelled) {
        Alert.alert('Google Sign-In Failed', result.error ?? 'Please try again.');
      }
      // Success: _layout.tsx handles routing based on whether /users/{uid} exists
    } finally {
      setIsGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.logo}>🏆</Text>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join FamilyWin and start your family&apos;s journey</Text>
          </View>

          {/* ── Google button at top — most users will tap this ── */}
          <TouchableOpacity
            style={[styles.googleButton, isGoogleLoading && { opacity: 0.6 }]}
            onPress={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
            activeOpacity={0.85}
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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign up with email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Email/password form — UNCHANGED ── */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                onSubmitEditing={handleRegister}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, isLoading && { opacity: 0.6 }]}
              onPress={handleRegister}
              disabled={isLoading || isGoogleLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.primaryBtnText}>Create Account →</Text>
              }
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.replace('/auth/login')}>
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── STYLES — all original values preserved ──────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.lg },
  backBtn: { marginBottom: Spacing.md, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: Colors.primary },
  header: { alignItems: 'center', marginBottom: Spacing.lg },
  logo: { fontSize: 56, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: Colors.text },
  subtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  // Google button
  googleButton: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.surface,
    ...Shadow.sm,
  },
  googleButtonInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  googleIcon: { fontSize: 16, fontWeight: '800', color: '#4285F4', fontFamily: FontFamily.black },
  googleButtonText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: Colors.text },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textMuted, marginHorizontal: Spacing.sm },
  // Email form
  form: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg, ...Shadow.md },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md, fontFamily: FontFamily.regular, color: Colors.text, backgroundColor: Colors.background,
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md, backgroundColor: Colors.background,
  },
  passwordInput: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular, color: Colors.text },
  eyeBtn: { paddingHorizontal: Spacing.md, paddingVertical: 14, minWidth: 44, alignItems: 'center' },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm, ...Shadow.lg,
  },
  primaryBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF', letterSpacing: 0.5 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg },
  loginText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary },
  loginLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.primary },
});

