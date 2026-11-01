import { useEffect, useState, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  withSequence, withDelay, withRepeat, Easing,
} from 'react-native-reanimated';
import { Stack, router, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '@/lib/fb';
import { getUserFamilyAndMember } from '@/lib/firebase';
import { configureGoogleSignIn } from '@/lib/googleAuth';
import { setupAppCheck } from '@/lib/appCheck';
import { useAuthStore } from '@/store';
import { setupNotificationListeners } from '@/lib/notifications';
import { registerBackgroundTasks } from '@/lib/backgroundTasks';
import { LinearGradient } from 'expo-linear-gradient';
import { ChestMark } from '@/components/ui/BrandIcons';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { identifyUser } from '@/lib/analytics';
import { crashlytics } from '@/lib/fb';

// ── Error Boundary — catches any unhandled JS errors to prevent white/red crash ──
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (__DEV__) console.error('[Chore League ErrorBoundary]', error);
    // Report to Crashlytics so we're not launching blind. Non-fatal record +
    // the React component stack as context. Guarded so a missing native module
    // (e.g. Expo Go / dev) never turns the error screen into a second crash.
    try {
      crashlytics().log(`ErrorBoundary: ${info?.componentStack ?? ''}`);
      crashlytics().recordError(error);
    } catch { /* crashlytics unavailable — swallow */ }
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.emoji}>😕</Text>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.msg}>Chore League ran into an unexpected error. Please restart the app.</Text>
          <TouchableOpacity style={ebStyles.btn} onPress={() => this.setState({ hasError: false })}>
            <Text style={ebStyles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const ebStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F8F9FF' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginBottom: 8 },
  msg: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: { backgroundColor: '#6C63FF', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

SplashScreen.preventAutoHideAsync();

// ─────────────────────────────────────────────────────────────────────────────
// Branded animated splash — sub-components avoid hooks-in-loops rule
// ─────────────────────────────────────────────────────────────────────────────

/** One floating background orb */
function FloatingOrb({ size, color, top, left, delay }: {
  size: number; color: string; top: number | string; left: number | string; delay: number;
}) {
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 800 }));
    y.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(-18, { duration: 2400 + delay % 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0,   { duration: 2400 + delay % 600, easing: Easing.inOut(Easing.ease) }),
      ), -1,
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    position: 'absolute', top: top as any, left: left as any,
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: color,
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  return <Animated.View style={style} />;
}

/** One sparkle particle bursting outward from the trophy */
function SparkleParticle({ angle, dist, delay, emoji }: {
  angle: number; dist: number; delay: number; emoji: string;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.2);
  useEffect(() => {
    opacity.value = withDelay(delay, withSequence(
      withTiming(1, { duration: 180 }),
      withDelay(200, withTiming(0, { duration: 450 })),
    ));
    scale.value = withDelay(delay, withSequence(
      withSpring(1.1, { damping: 7, stiffness: 220 }),
      withDelay(200, withTiming(0, { duration: 350 })),
    ));
    tx.value = withDelay(delay, withTiming(Math.cos(angle) * dist, { duration: 700, easing: Easing.out(Easing.quad) }));
    ty.value = withDelay(delay, withTiming(Math.sin(angle) * dist, { duration: 700, easing: Easing.out(Easing.quad) }));
  }, []);
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    opacity: opacity.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  return <Animated.Text style={[style, { fontSize: 22 }]}>{emoji}</Animated.Text>;
}

/** One star in the staggered bottom row */
function StarItem({ emoji, delay }: { emoji: string; delay: number }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    scale.value   = withDelay(delay, withSpring(1, { damping: 8, stiffness: 200 }));
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ scale: scale.value }],
  }));
  return <Animated.Text style={[style, { fontSize: 22, marginHorizontal: 5 }]}>{emoji}</Animated.Text>;
}

const SPARKLES = [
  { emoji: '✨', angle: 0 },
  { emoji: '⭐', angle: Math.PI / 3 },
  { emoji: '✨', angle: (2 * Math.PI) / 3 },
  { emoji: '🌟', angle: Math.PI },
  { emoji: '✨', angle: (4 * Math.PI) / 3 },
  { emoji: '⭐', angle: (5 * Math.PI) / 3 },
  { emoji: '💫', angle: Math.PI / 6 },
  { emoji: '✨', angle: (7 * Math.PI) / 6 },
];

const BOTTOM_STARS = ['🏅','⭐','💰','⭐','🏅'];

function AnimatedSplash({ isExiting }: { isExiting: boolean }) {
  // ── Container exit: zoom-fade out ─────────────────────────────────────────
  const containerOpacity = useSharedValue(1);
  const containerScale   = useSharedValue(1);

  useEffect(() => {
    if (isExiting) {
      containerOpacity.value = withTiming(0, { duration: 500, easing: Easing.in(Easing.ease) });
      containerScale.value   = withTiming(1.1, { duration: 500, easing: Easing.in(Easing.ease) });
    }
  }, [isExiting]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  // ── Glow pulse behind trophy ───────────────────────────────────────────────
  const glowScale   = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  useEffect(() => {
    glowOpacity.value = withDelay(350, withTiming(0.18, { duration: 400 }));
    glowScale.value   = withDelay(350, withRepeat(withSequence(
      withTiming(1.35, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      withTiming(1.0,  { duration: 1100, easing: Easing.inOut(Easing.ease) }),
    ), -1));
  }, []);
  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.14)',
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  // ── Trophy: drop from above + wobble rotation ──────────────────────────────
  const trophyY      = useSharedValue(-180);
  const trophyScale  = useSharedValue(0.4);
  const trophyRot    = useSharedValue(-20);
  const trophyShine  = useSharedValue(1);
  useEffect(() => {
    trophyY.value     = withSpring(0,  { damping: 9, stiffness: 90, mass: 1.1 });
    trophyScale.value = withSpring(1,  { damping: 9, stiffness: 110 });
    trophyRot.value   = withSequence(
      withSpring(12,  { damping: 5, stiffness: 250 }),
      withSpring(-8,  { damping: 6, stiffness: 250 }),
      withSpring(4,   { damping: 8, stiffness: 250 }),
      withSpring(0,   { damping: 10, stiffness: 200 }),
    );
    // Subtle continuous shimmer bounce after landing
    trophyShine.value = withDelay(700, withRepeat(withSequence(
      withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      withTiming(1.0,  { duration: 900, easing: Easing.inOut(Easing.ease) }),
    ), -1));
  }, []);
  const trophyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: trophyY.value },
      { scale: trophyScale.value * trophyShine.value },
      { rotate: `${trophyRot.value}deg` },
    ],
  }));

  // ── Title: slides up + scales in ──────────────────────────────────────────
  const titleOpacity = useSharedValue(0);
  const titleY       = useSharedValue(28);
  const titleScale   = useSharedValue(0.82);
  useEffect(() => {
    titleOpacity.value = withDelay(480, withTiming(1, { duration: 420 }));
    titleY.value       = withDelay(480, withSpring(0, { damping: 13, stiffness: 100 }));
    titleScale.value   = withDelay(480, withSpring(1, { damping: 13, stiffness: 100 }));
  }, []);
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }, { scale: titleScale.value }],
  }));

  // ── Tagline typewriter-style fade ─────────────────────────────────────────
  const tagOpacity = useSharedValue(0);
  const tagY       = useSharedValue(12);
  useEffect(() => {
    tagOpacity.value = withDelay(750, withTiming(1, { duration: 450 }));
    tagY.value       = withDelay(750, withSpring(0, { damping: 14 }));
  }, []);
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value, transform: [{ translateY: tagY.value }],
  }));

  // ── Thin accent line under tagline ────────────────────────────────────────
  const lineWidth   = useSharedValue(0);
  const lineOpacity = useSharedValue(0);
  useEffect(() => {
    lineOpacity.value = withDelay(900, withTiming(1, { duration: 300 }));
    lineWidth.value   = withDelay(900, withTiming(120, { duration: 500, easing: Easing.out(Easing.ease) }));
  }, []);
  const lineStyle = useAnimatedStyle(() => ({
    width: lineWidth.value, opacity: lineOpacity.value,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, containerStyle]}>
    <LinearGradient colors={['#4A42CC', '#6C63FF', '#8B84FF']} style={splashStyles.container}>
      {/* Background floating orbs */}
      <FloatingOrb size={180} color="rgba(255,255,255,0.06)" top="5%"  left="-8%"  delay={0}   />
      <FloatingOrb size={130} color="rgba(255,101,132,0.18)" top="12%" left="65%"  delay={200} />
      <FloatingOrb size={220} color="rgba(255,255,255,0.04)" top="60%" left="-12%" delay={100} />
      <FloatingOrb size={100} color="rgba(255,179,71,0.14)"  top="70%" left="72%"  delay={400} />

      {/* Pulsing glow behind trophy */}
      <Animated.View style={glowStyle} />

      {/* Trophy + sparkle burst */}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {SPARKLES.map((s, i) => (
          <SparkleParticle
            key={i}
            emoji={s.emoji}
            angle={s.angle}
            dist={72 + (i % 3) * 18}
            delay={420 + i * 30}
          />
        ))}
        <Animated.View style={trophyStyle}><ChestMark size={104} /></Animated.View>
      </View>

      {/* Chore League title */}
      <Animated.View style={titleStyle}>
        <Text style={splashStyles.title}>Chore League</Text>
      </Animated.View>

      {/* Accent line */}
      <Animated.View style={[splashStyles.accentLine, lineStyle]} />

      {/* Tagline */}
      <Animated.View style={tagStyle}>
        <Text style={splashStyles.tagline}>Your family's weekly showdown. 🎯</Text>
      </Animated.View>

      {/* Staggered bottom star row */}
      <View style={splashStyles.starsRow}>
        {BOTTOM_STARS.map((s, i) => (
          <StarItem key={i} emoji={s} delay={1000 + i * 90} />
        ))}
      </View>
    </LinearGradient>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  trophy: { fontSize: 96, textAlign: 'center' },
  title: {
    fontSize: 44, color: '#FFFFFF', textAlign: 'center',
    marginTop: 20, letterSpacing: 1.5,
    fontFamily: 'Nunito-Black',
    textShadowColor: 'rgba(0,0,0,0.20)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  accentLine: {
    height: 2, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginTop: 10,
  },
  tagline: {
    fontSize: 16, color: 'rgba(255,255,255,0.85)', textAlign: 'center',
    marginTop: 12, fontFamily: 'Nunito-SemiBold', letterSpacing: 0.4,
  },
  starsRow: { flexDirection: 'row', marginTop: 36, alignItems: 'center' },
});

function InnerLayout() {
  const { setUser, setMember, setFamily, setLoading, setHydrated } = useAuthStore();
  const { isDark } = useTheme();
  const navigationState = useRootNavigationState();
  // pendingRoute: auth state fires before Expo Router navigation container is ready
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    'Nunito-Regular': require('@/assets/fonts/Nunito-Regular.ttf'),
    'Nunito-SemiBold': require('@/assets/fonts/Nunito-SemiBold.ttf'),
    'Nunito-Bold': require('@/assets/fonts/Nunito-Bold.ttf'),
    'Nunito-ExtraBold': require('@/assets/fonts/Nunito-ExtraBold.ttf'),
    'Nunito-Black': require('@/assets/fonts/Nunito-Black.ttf'),
  });

  useEffect(() => {
    // Attest app integrity (App Check) before Firebase traffic. Monitor-only
    // until enforcement is enabled server-side, so it's safe on every build.
    setupAppCheck();
    // Configure Google Sign-In on app launch
    configureGoogleSignIn();
    // Register background auto-fail task
    registerBackgroundTasks();

    // ── Firebase auth state listener (replaces supabase.auth.onAuthStateChange)
    const unsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });

        try {
          const result = await getUserFamilyAndMember(firebaseUser.uid);
          if (result) {
            // Existing user with a family — go straight to app
            setFamily(result.family);
            setMember(result.member);
            setLoading(false);
            setHydrated(true);
            setPendingRoute('/app/tabs');
            // Identify user in Analytics + Crashlytics
            identifyUser(firebaseUser.uid, result.member.displayName, result.family.id);
          } else {
            // New user (or Google user with no family yet) — go to onboarding
            setLoading(false);
            setHydrated(true);
            setPendingRoute('/auth/onboarding');
          }
        } catch {
          setLoading(false);
          setHydrated(true);
          setPendingRoute('/auth/onboarding');
        }
      } else {
        setUser(null);
        setMember(null);
        setFamily(null);
        setLoading(false);
        setHydrated(true);
        const onboardingDone = await AsyncStorage.getItem('onboarding_done');
        setPendingRoute(onboardingDone ? '/auth/login' : '/auth/splash');
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const cleanup = setupNotificationListeners(
      (notification) => {
        if (__DEV__) console.log('Notification:', notification.request.content.title);
      },
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.screen === 'leaderboard') router.push('/app/tabs/leaderboard');
        if (data?.screen === 'tasks') router.push('/app/tabs');
        if (data?.screen === 'report') router.push('/app/report' as any);
      },
    );
    return cleanup;
  }, []);

  // Navigate only when BOTH fonts are loaded AND the navigation container is mounted.
  // useRootNavigationState().key is undefined until Expo Router's Stack is registered —
  // checking it guarantees we never call router.replace() on an unready navigator.
  const [hasNavigated, setHasNavigated] = useState(false);
  // Keep splash mounted a little longer so the exit animation can play out
  const [showSplash, setShowSplash]     = useState(true);

  useEffect(() => {
    if (fontsLoaded && pendingRoute && navigationState?.key) {
      router.replace(pendingRoute as any);
      setPendingRoute(null);
      setHasNavigated(true);
      // Unmount splash overlay after exit animation (500ms) completes
      setTimeout(() => setShowSplash(false), 520);
    }
  }, [fontsLoaded, pendingRoute, navigationState?.key]);

  // Keep the native splash up until fonts are ready AND the first real route has
  // been navigated to — hiding it earlier (e.g. on fontsLoaded alone) leaves a gap
  // where a blank/default-background screen flashes before navigation completes.
  useEffect(() => {
    if (fontsLoaded && hasNavigated) SplashScreen.hideAsync();
  }, [fontsLoaded, hasNavigated]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="auth/splash" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="auth/onboarding" />
        <Stack.Screen name="app/tabs" />
        <Stack.Screen name="app/task/create" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="app/discipline/log" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="app/member/[id]" />
        <Stack.Screen name="app/catch-up" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
      {/* Branded animated splash overlay — shown until exit animation completes */}
      {showSplash && <AnimatedSplash isExiting={hasNavigated} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <InnerLayout />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
