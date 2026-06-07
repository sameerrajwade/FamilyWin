/**
 * lib/googleAuth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Sign-In via @react-native-google-signin/google-signin + Firebase Auth
 *
 * Setup required (one-time, before first build):
 *  1. In Firebase Console → Authentication → Sign-in method → Enable Google
 *  2. Copy the Web Client ID from Firebase Console → Project Settings → General
 *     → Your apps → Web app → OAuth 2.0 client IDs
 *  3. Paste it as WEB_CLIENT_ID below
 *  4. In Google Cloud Console, add your app's SHA-1 fingerprint
 *     (run: cd android && ./gradlew signingReport)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';

// ── Replace this with your actual Web Client ID from Firebase Console ─────────
const WEB_CLIENT_ID = '939272773354-11lg42mo2i4uf42h2cga19ikrugd07mj.apps.googleusercontent.com';

let configured = false;

export function configureGoogleSignIn() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: true,
  });
  configured = true;
}

export type GoogleSignInResult =
  | { success: true; isNewUser: boolean }
  | { success: false; cancelled: boolean; error?: string };

/**
 * Trigger Google Sign-In flow and sign in to Firebase.
 * Returns whether the user is brand-new (needs onboarding) or returning.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  configureGoogleSignIn();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const signInResult = await GoogleSignin.signIn();
    const idToken = (signInResult as any)?.data?.idToken ?? (signInResult as any)?.idToken;
    if (!idToken) throw new Error('No idToken from Google Sign-In');
    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    const result = await auth().signInWithCredential(googleCredential);

    const isNewUser =
      result.additionalUserInfo?.isNewUser ?? false;

    return { success: true, isNewUser };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, cancelled: true };
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        return { success: false, cancelled: false, error: 'Sign-in already in progress' };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, cancelled: false, error: 'Google Play Services not available' };
      }
    }
    return {
      success: false,
      cancelled: false,
      error: error instanceof Error ? error.message : 'Google sign-in failed',
    };
  }
}

export async function signOutGoogle() {
  try {
    await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
  } catch {
    // Ignore if not signed in with Google
  }
}

