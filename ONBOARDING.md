# FamilyWin — Developer Onboarding Guide

Step-by-step setup, from a fresh clone to a running app on your phone. This
assumes basic familiarity with React Native / Expo and Android development —
if not, each step links to the relevant official docs.

---

## Prerequisites

- **Node.js** 18+ and npm
- **Android Studio** (for the Android SDK, emulator, and Gradle builds) —
  https://developer.android.com/studio
- **A Google account** to create the Firebase project
- **An Android phone** with USB debugging enabled, *or* an emulator
- (Optional, for releases) **Java keytool** — bundled with Android Studio's JDK

---

## Step 1 — Clone & Install

```bash
git clone https://github.com/<your-org>/FamilyWin.git
cd FamilyWin
npm install
```

---

## Step 2 — Create the Firebase Project (BLOCKING — do this first)

The app cannot run without a Firebase backend. Follow these in order:

1. Go to https://console.firebase.google.com → **Add project**
2. **Add an Android app** to the project — package name **must be**
   `com.familywin.app` (matches `app.json`)
3. **Authentication** → Sign-in method → enable **Email/Password**
4. **Authentication** → Sign-in method → enable **Google** → copy the
   generated **Web Client ID**
5. **Firestore Database** → Create database → **Production mode**
6. **Storage** → Get started (used for member profile photos)
7. Download **`google-services.json`** from Project Settings → place it in:
   - the project root, **and**
   - `android/app/`
   (Both copies are required — Expo prebuild reads the root copy, Gradle
   reads the `android/app/` copy.)

> See **FIREBASE_SETUP.md** for click-by-click console screenshots and the
> exact list of Firestore indexes to create.

---

## Step 3 — Wire Up Google Sign-In

Open `lib/googleAuth.ts` and replace the placeholder on line 20:

```typescript
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID...apps.googleusercontent.com';
```

with the **Web Client ID** you copied in Step 2.4. Google Sign-In will not
work until this is set — and you'll need to register your **SHA-1
fingerprint** (debug *and* release builds have different ones):

```bash
cd android && ./gradlew signingReport
```

Copy the SHA-1 values into Firebase Console → Project Settings → Your apps →
Add fingerprint.

---

## Step 4 — Deploy Firestore Rules, Indexes & Cloud Functions

```bash
# Install the Firebase CLI if you don't have it
npm install -g firebase-tools
firebase login

# From the project root:
firebase deploy --only firestore:rules
firebase deploy --only functions
```

Create the Firestore composite indexes listed in `FIREBASE_SETUP.md` (the app
will also print direct "create this index" links in the logs the first time
each query runs — click them, they auto-fill the right configuration).

> ⚠️ If something that should work (e.g. undoing a task) fails with no
> client-side error, **check the Firestore rules first** — a rule that's too
> strict will silently reject the write. See ARCHITECTURE.md §4 for a real
> example of this exact bug.

---

## Step 5 — Generate the Native Android Project

```bash
npx expo prebuild --platform android
# or, after changing native config (app.json, plugins, etc.):
npx expo prebuild --platform android --clean
```

> `--clean` **wipes the entire `android/` folder** and regenerates it. Don't
> hand-edit files there expecting them to survive.

---

## Step 6 — Run It

**Option A — Android Studio (recommended for first run):**
1. Open the `android/` folder in Android Studio
2. Let Gradle sync finish (first sync downloads ~1GB, takes 10–20 minutes —
   this is normal)
3. Connect your phone (USB debugging enabled) or start an emulator
4. Press **Run ▶**

**Option B — Command line:**
```bash
cd android
./gradlew assembleDebug
# APK lands in android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Step 7 — Building a Signed Release

1. Generate a keystore (one-time):
   ```bash
   keytool -genkey -v -keystore familywin-release.keystore \
     -alias familywin -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add the signing config to `android/app/build.gradle` (references env vars,
   never hardcoded values):
   ```groovy
   release {
       storeFile file('familywin-release.keystore')
       storePassword System.getenv("FAMILYWIN_KEYSTORE_PASSWORD")
       keyAlias 'familywin'
       keyPassword System.getenv("FAMILYWIN_KEY_PASSWORD")
   }
   ```
3. Set the env vars **for your shell session only** (never commit them, never
   write them into a script file):
   ```bash
   # bash
   export FAMILYWIN_KEYSTORE_PASSWORD='...'
   export FAMILYWIN_KEY_PASSWORD='...'
   # Windows cmd
   set FAMILYWIN_KEYSTORE_PASSWORD=...
   set FAMILYWIN_KEY_PASSWORD=...
   ```
4. Build:
   ```bash
   cd android && ./gradlew assembleRelease --offline
   ```
5. **Verify before installing** — Gradle can leave a *stale* APK in the
   output directory if signing fails partway through, making it look like the
   build succeeded. Always check the log for `BUILD SUCCESSFUL`, and ideally
   confirm the APK's JS bundle contains your latest changes:
   ```python
   import zipfile
   z = zipfile.ZipFile('android/app/build/outputs/apk/release/app-release.apk')
   data = z.read('assets/index.android.bundle')
   print(b'some-recent-unique-string-from-your-change' in data)
   ```

---

## Step 8 — Publishing to the Play Store

1. Create a Google Play Console account ($25 one-time fee)
2. Prepare assets: app icon (512×512), feature graphic (1024×500), at least
   2 screenshots
3. Write a privacy policy (e.g. via the free tier of termly.io) and host it
   somewhere with a stable URL
4. Upload the signed AAB (`./gradlew bundleRelease`) → Internal testing track
   → promote to Production once verified

---

## Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| White flash on cold start | Splash background color mismatch | Ensure `app.json` → `splash.backgroundColor` matches the background color in `app/index.tsx` |
| "Unmatched Route" briefly shown | Missing root index route | Confirm `app/index.tsx` exists and redirects appropriately |
| Photo picker does nothing | `expo-image-picker` array-vs-enum mismatch, or > 3 Alert buttons, or stacked picker launches | See ARCHITECTURE.md §7 — use the enum form, chain 2–3 button alerts, and guard with an in-flight lock instead of `setTimeout` |
| A write "does nothing" with no error | Firestore security rule silently denies it | Check `firebase/firestore.rules` for the collection in question |
| Background auto-fail task unreliable on Android 12+ | Battery optimization | Ask users to whitelist FamilyWin in phone battery settings |
| First Gradle sync is very slow | Downloading ~1GB of dependencies | Normal — only happens once |
| `assembleRelease` "succeeds" but app behaves like the old version | Stale APK left over from a prior failed signing step | Re-run, confirm `BUILD SUCCESSFUL` in the log, and verify the bundle contents before installing |

---

## Where to Go Next

- **README.md** — product overview, screenshots, tech stack summary
- **ARCHITECTURE.md** — data model, security rules, state management, business
  rules, and a running list of "gotchas" worth knowing before you touch
  certain code paths
- **CLAUDE.md** — conventions and context for AI pair-programming in this repo
