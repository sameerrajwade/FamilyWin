/**
 * jest.setup.ts
 * Global Jest setup — mocks all native modules that can't run in Node
 */

// Note: @testing-library/jest-native/extend-expect is loaded via
// setupFilesAfterFramework in package.json jest config.
// Here we only set up mocks (setupFiles runs before Jest framework).

// ─── React Native Reanimated ──────────────────────────────────────────────────
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
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
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'test-member-id' })),
  usePathname: jest.fn(() => '/'),
  Stack: { Screen: jest.fn() },
  Tabs: { Screen: jest.fn() },
  Link: 'Link',
}));

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
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

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
