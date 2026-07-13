/**
 * Firebase App Check (Play Integrity) — attests that Firestore/Storage/Functions
 * traffic comes from our genuine, signed app, blocking scraping/abuse from
 * modified clients or bare API keys.
 *
 * IMPORTANT: this only WIRES the client. Enforcement is a separate switch in the
 * Firebase console (App Check → each service → Enforce). Until enforcement is on,
 * requests with missing/invalid App Check tokens are still allowed — so shipping
 * this is safe and cannot break existing calls. Enforce ONLY after confirming
 * real devices are producing valid tokens (and after registering a debug token
 * for debug builds), or the app locks itself out.
 */
import appCheck from '@react-native-firebase/app-check';

let initialized = false;

export async function setupAppCheck(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const provider = appCheck().newReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: {
        // Debug builds can't pass Play Integrity (not installed from Play), so
        // use the debug provider in dev; production uses Play Integrity.
        provider: __DEV__ ? 'debug' : 'playIntegrity',
      },
      apple: {
        provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
      },
    });
    await appCheck().initializeAppCheck({
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    if (__DEV__) console.log('[AppCheck] initialized');
  } catch (e) {
    // Never let App Check setup break app startup — it's monitor-only until
    // enforcement is enabled server-side.
    if (__DEV__) console.warn('[AppCheck] init failed (non-fatal):', e);
  }
}
