import { View, StyleSheet } from 'react-native';

/**
 * Root index route.
 * ─────────────────────────────────────────────────────────────────────────────
 * Expo Router needs a matched screen at "/" the instant the app launches —
 * otherwise it briefly renders "Unmatched Route" while app/_layout.tsx
 * resolves fonts + auth state and calls router.replace() to the real
 * destination (splash, login, onboarding, or tabs).
 *
 * This screen is never seen for more than a flicker — it just needs to exist
 * so the navigator has something valid to show during that gap. Its background
 * MUST match app.json's "splash.backgroundColor" (#6C63FF) — the native splash
 * screen hides right as this mounts, and a mismatched color caused a brief
 * white flash between the native splash and the real first screen.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function Index() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#6C63FF',
  },
});
