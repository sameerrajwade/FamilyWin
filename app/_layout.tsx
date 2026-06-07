import { useEffect, useState, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import { getUserFamilyAndMember } from '@/lib/firebase';
import { configureGoogleSignIn } from '@/lib/googleAuth';
import { useAuthStore } from '@/store';
import { setupNotificationListeners } from '@/lib/notifications';
import { registerBackgroundTasks } from '@/lib/backgroundTasks';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { identifyUser } from '@/lib/analytics';

// ── Error Boundary — catches any unhandled JS errors to prevent white/red crash ──
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    if (__DEV__) console.error('[FamilyWin ErrorBoundary]', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.emoji}>😕</Text>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.msg}>FamilyWin ran into an unexpected error. Please restart the app.</Text>
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
            setPendingRoute('/app/tabs/');
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
        if (data?.screen === 'tasks') router.push('/app/tabs/');
      },
    );
    return cleanup;
  }, []);

  // Navigate only when BOTH fonts are loaded AND the navigation container is mounted.
  // useRootNavigationState().key is undefined until Expo Router's Stack is registered —
  // checking it guarantees we never call router.replace() on an unready navigator.
  useEffect(() => {
    if (fontsLoaded && pendingRoute && navigationState?.key) {
      router.replace(pendingRoute as any);
      setPendingRoute(null);
    }
  }, [fontsLoaded, pendingRoute, navigationState?.key]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
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
    </Stack>
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
