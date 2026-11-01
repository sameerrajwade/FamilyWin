/**
 * jest.setup.ts
 * Global Jest setup — mocks all native modules that can't run in Node
 */

// Note: @testing-library/jest-native/extend-expect is loaded via
// setupFilesAfterFramework in package.json jest config.
// Here we only set up mocks (setupFiles runs before Jest framework).

// ─── React Native Reanimated ──────────────────────────────────────────────────
// The bundled `react-native-reanimated/mock` (v4) transitively loads
// react-native-worklets native code, which crashes in Node ("loadUnpackers").
// Hand-roll a lightweight mock covering the APIs the app uses — no worklets.
jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView, Image } = require('react-native');
  const passthrough = (v: any) => v;
  const noopEasingFactory = () => 0;
  const Easing = new Proxy({}, { get: () => (() => noopEasingFactory) });
  return {
    __esModule: true,
    default: {
      View, Text, ScrollView, Image,
      createAnimatedComponent: (c: any) => c,
      call: () => {},
    },
    View, Text, ScrollView, Image,
    createAnimatedComponent: (c: any) => c,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useDerivedValue: (fn: any) => ({ value: typeof fn === 'function' ? fn() : fn }),
    useAnimatedScrollHandler: () => () => {},
    withSpring: passthrough,
    withTiming: passthrough,
    withSequence: (...args: any[]) => args[0],
    withDelay: (_d: number, v: any) => v,
    withRepeat: (v: any) => v,
    cancelAnimation: () => {},
    interpolate: () => 0,
    interpolateColor: () => '#000000',
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    Easing,
    Layout: { springify: () => ({}), duration: () => ({}) },
    FadeIn: {}, FadeOut: {}, SlideInDown: {}, SlideInUp: {}, ZoomIn: {}, ZoomOut: {},
  };
});

// ─── Firebase ─────────────────────────────────────────────────────────────────
jest.mock('@react-native-firebase/app', () => ({
  default: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: null,
    onAuthStateChanged: jest.fn((cb) => { cb(null); return jest.fn(); }),
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    signInWithCredential: jest.fn(),
    GoogleAuthProvider: { credential: jest.fn() },
    AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  };
  const fn = jest.fn(() => mockAuth);
  (fn as any).GoogleAuthProvider = { credential: jest.fn() };
  return { default: fn, __esModule: true };
});

jest.mock('@react-native-firebase/firestore', () => {
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists: false, data: () => null, id: 'mock-id' }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    onSnapshot: jest.fn((cb) => { cb({ docs: [] }); return jest.fn(); }),
    id: 'mock-doc-id',
  };
  const mockCollectionRef = {
    doc: jest.fn(() => mockDocRef),
    add: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
    get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    onSnapshot: jest.fn((cb) => { cb({ docs: [] }); return jest.fn(); }),
  };
  const mockFirestore = jest.fn(() => ({
    collection: jest.fn(() => mockCollectionRef),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
  }));
  (mockFirestore as any).Timestamp = {
    now: jest.fn(() => ({ toDate: () => new Date(), seconds: Date.now() / 1000 })),
    fromDate: jest.fn((d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 })),
  };
  return { default: mockFirestore, __esModule: true };
});

jest.mock('@react-native-firebase/messaging', () => {
  const mockMessaging = jest.fn(() => ({
    getToken: jest.fn().mockResolvedValue('mock-fcm-token'),
    requestPermission: jest.fn().mockResolvedValue(1),
    setBackgroundMessageHandler: jest.fn(),
    onMessage: jest.fn(() => jest.fn()),
    AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  }));
  (mockMessaging as any).AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2 };
  return { default: mockMessaging, __esModule: true };
});

// ─── Google Sign-In ───────────────────────────────────────────────────────────
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ data: { idToken: 'mock-id-token' } }),
    signOut: jest.fn().mockResolvedValue(undefined),
    revokeAccess: jest.fn().mockResolvedValue(undefined),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' },
  isErrorWithCode: jest.fn(() => false),
}));

// ─── Expo modules ─────────────────────────────────────────────────────────────
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({ id: 'test-member-id' })),
    usePathname: jest.fn(() => '/'),
    useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })),
    // Run the effect once, like a focused screen; return its cleanup.
    useFocusEffect: jest.fn((cb: any) => { React.useEffect(cb, []); }),
    useSegments: jest.fn(() => []),
    Stack: { Screen: jest.fn() },
    Tabs: { Screen: jest.fn() },
    Link: 'Link',
    Redirect: () => null,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4, MAX: 5, DEFAULT: 3 },
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// ─── Expo Audio (sound effects) ───────────────────────────────────────────────
// lib/sounds.ts imports expo-audio at module load; its native module can't run
// in Node, so mock the two APIs we use. Returns a no-op AudioPlayer.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─── Firebase compat shim (lib/fb.ts) ─────────────────────────────────────────
// Screens/libs import the namespaced shim directly (e.g. `import { firestore }
// from '@/lib/fb'`), which pulls in the real @react-native-firebase modular
// native modules and crashes in Node ("NativeRNFBTurboApp is not registered").
// Mock the shim's namespaced factories with chainable no-op shapes so anything
// importing it loads. Tests that need real data mock '@/lib/firebase' on top.
jest.mock('@/lib/fb', () => {
  const makeCollection = () => {
    const col = {
      doc: jest.fn(() => makeDoc()),
      add: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
      get: jest.fn().mockResolvedValue({ docs: [], empty: true, forEach: () => {} }),
      where: jest.fn(() => col),
      orderBy: jest.fn(() => col),
      limit: jest.fn(() => col),
      onSnapshot: jest.fn((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
    };
    return col;
  };
  const makeDoc = () => ({
    get: jest.fn().mockResolvedValue({ exists: () => false, data: () => null, id: 'mock-id' }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    onSnapshot: jest.fn((cb: any) => { cb({ exists: () => false, data: () => null }); return jest.fn(); }),
    collection: jest.fn(() => makeCollection()),
    id: 'mock-doc-id',
  });
  const firestore: any = jest.fn(() => ({
    collection: jest.fn(() => makeCollection()),
    batch: jest.fn(() => ({
      set: jest.fn(), update: jest.fn(), delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
    runTransaction: jest.fn(),
  }));
  firestore.Timestamp = {
    now: jest.fn(() => ({ toDate: () => new Date(), seconds: Date.now() / 1000 })),
    fromDate: jest.fn((d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 })),
  };
  const auth = jest.fn(() => ({
    currentUser: null,
    signOut: jest.fn().mockResolvedValue(undefined),
    onAuthStateChanged: jest.fn((cb: any) => { cb(null); return jest.fn(); }),
  }));
  const storage = jest.fn(() => ({
    ref: jest.fn(() => ({
      putFile: jest.fn().mockResolvedValue(undefined),
      getDownloadURL: jest.fn().mockResolvedValue('https://example.com/photo.jpg'),
      delete: jest.fn().mockResolvedValue(undefined),
    })),
  }));
  const functions = jest.fn(() => ({
    httpsCallable: jest.fn(() => jest.fn().mockResolvedValue({ data: { ok: true } })),
  }));
  const analytics = jest.fn(() => ({ logEvent: jest.fn(), setUserId: jest.fn() }));
  const crashlytics = jest.fn(() => ({ log: jest.fn(), recordError: jest.fn(), setAttributes: jest.fn() }));
  const messaging: any = Object.assign(
    jest.fn(() => ({
      getToken: jest.fn().mockResolvedValue('mock-fcm-token'),
      onMessage: jest.fn(() => jest.fn()),
      requestPermission: jest.fn().mockResolvedValue(1),
    })),
    { AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 } },
  );
  return { firestore, auth, storage, functions, analytics, crashlytics, messaging, __esModule: true };
});

// ─── Theme (lib/theme.tsx) ────────────────────────────────────────────────────
// Screens/components call useTheme(), which throws outside a ThemeProvider.
// Provide a default light-theme context globally so unit tests don't each need
// to wrap in a provider. Tests that assert theme behavior can override this.
jest.mock('@/lib/theme', () => {
  const colors = {
    primary: '#6C63FF', primaryLight: '#9D97FF', primaryDark: '#4A42CC', accent: '#FF6B2C',
    success: '#00E676', successLight: '#B9F6CA', warning: '#FFAB00', warningLight: '#FFE082',
    danger: '#FF1744', dangerLight: '#FF8A80', background: '#F5F5FF', surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF', card: '#FFFFFF', text: '#1A1830', textSecondary: '#6B7280',
    textMuted: '#9CA3AF', border: '#E7E5F2', borderLight: '#F3F2FB', tabBar: '#FFFFFF',
    statusBar: 'dark', gold: '#FFD700', silver: '#B0BEC5', bronze: '#D4853B',
  };
  return {
    __esModule: true,
    ThemeProvider: ({ children }: any) => children,
    useTheme: jest.fn(() => ({
      colors,
      themeMode: 'light',
      uiMode: 'adult',
      isDark: false,
      isChildMode: false,
      setThemeMode: jest.fn(),
      setUIMode: jest.fn(),
      fontSize: (b: number) => b,
      spacing: (b: number) => b,
      iconSize: (b: number) => b,
    })),
  };
});

// ─── Async Storage ────────────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
}));

// ─── React Native Safe Area ───────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

// ─── React Native Screens ─────────────────────────────────────────────────────
jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
}));

// ─── React Native Gesture Handler ─────────────────────────────────────────────
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  PanGestureHandler: 'PanGestureHandler',
  TapGestureHandler: 'TapGestureHandler',
}));

// Note: beforeAll/afterAll moved to jest.setup.after.ts (setupFilesAfterEnv)
