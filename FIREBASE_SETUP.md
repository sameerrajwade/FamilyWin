# FamilyWin — Firebase Setup Guide
## From Zero to Android Studio in 8 Steps

---

## Step 1: Create Firebase Project

1. Go to **console.firebase.google.com** → **Add project**
2. Name it: `FamilyWin`
3. Enable Google Analytics → Continue
4. Choose your Analytics account → **Create project**

---

## Step 2: Add Android App to Firebase

1. In Firebase Console → click the **Android icon** (Add app)
2. Android package name: `com.familywin.app`
3. App nickname: `FamilyWin Android`
4. For SHA-1 (debug): run this in your project root:
   ```bash
   cd android && ./gradlew signingReport
   ```
   Copy the `SHA1` value from the `debug` variant
5. Click **Register app**
6. **Download `google-services.json`** → place it in the **root** of your project (same level as `package.json`)
7. Skip the "Add Firebase SDK" steps — already in `package.json`

---

## Step 3: Enable Authentication Methods

In Firebase Console → **Authentication** → **Sign-in method**:

### Email/Password
1. Click **Email/Password** → Enable → Save

### Google Sign-In
1. Click **Google** → Enable
2. Set project public-facing name: `FamilyWin`
3. Choose support email
4. Save

### Get Web Client ID (for Google Sign-In)
1. Firebase Console → **Project Settings** (gear icon) → **General**
2. Scroll to **Your apps** → find your web app (or create one)
3. Copy the **Web client ID** (ends in `.apps.googleusercontent.com`)
4. Open `lib/googleAuth.ts` and replace:
   ```typescript
   const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID_FROM_FIREBASE_CONSOLE.apps.googleusercontent.com';
   ```
   with your actual ID

---

## Step 4: Set Up Firestore Database

1. Firebase Console → **Firestore Database** → **Create database**
2. Choose **Production mode** (rules are already written)
3. Select region closest to your users (e.g., `us-central1`)
4. Click **Done**

### Deploy Security Rules
```bash
npm install -g firebase-tools
firebase login
firebase init firestore  # choose your project, accept defaults
```
Then copy `firebase/firestore.rules` to the project root as `firestore.rules`, then:
```bash
firebase deploy --only firestore:rules
```

### Create Required Indexes
Run these in Firebase Console → Firestore → **Indexes** → **Add index**:

| Collection | Fields | Query scope |
|---|---|---|
| `families/{id}/transactions` | `memberId ASC`, `createdAt ASC` | Collection |
| `families/{id}/transactions` | `createdAt ASC` | Collection |
| `families/{id}/completions` | `memberId ASC`, `weekId ASC` | Collection |
| `families/{id}/completions` | `memberId ASC`, `completedAt ASC`, `wasAutoFailed ASC` | Collection |

---

## Step 5: Enable FCM (Push Notifications)

1. Firebase Console → **Cloud Messaging** → already enabled by default
2. Android does **not** require additional setup — FCM works automatically with `google-services.json`
3. For notification icons: place a `notification-icon.png` (96×96 white on transparent) in `assets/`

---

## Step 6: Deploy Cloud Functions

```bash
cd firebase/functions
npm install

cd ../..
firebase init functions  # choose JavaScript, use existing index.js

firebase deploy --only functions
```

This deploys two functions:
- `weeklyReset` — runs every Monday 00:01 UTC
- `dailyStreakCheck` — runs every day at 01:00 UTC

---

## Step 7: Generate Android Studio Project

```bash
# Install dependencies
npm install

# Generate native android/ folder
npx expo prebuild --platform android

# Open in Android Studio
npx expo run:android
# OR: open the android/ folder directly in Android Studio
```

> **Important**: After `prebuild`, the `android/` folder is generated. You can now open it in Android Studio and work entirely from there.

### Verify google-services.json placement
After prebuild, Android Studio expects `google-services.json` in:
```
android/app/google-services.json
```
Expo copies it automatically from the root if `"googleServicesFile": "./google-services.json"` is in `app.json`. ✅

---

## Step 8: Build and Publish

### Debug APK (for testing)
In Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**

### Release AAB (for Play Store)
1. **Build → Generate Signed Bundle/APK**
2. Choose **Android App Bundle**
3. Create a new keystore (save the password securely — you need it forever)
4. Build release AAB
5. Upload to **Google Play Console** → Production

---

## Environment Checklist

```
✅ google-services.json in project root
✅ WEB_CLIENT_ID set in lib/googleAuth.ts
✅ SHA-1 fingerprint registered in Firebase Console
✅ Firestore security rules deployed
✅ Firestore indexes created
✅ Cloud Functions deployed
✅ Email/Password auth enabled
✅ Google auth enabled
```

---

## Firestore Data Structure Reference

```
/users/{uid}
  familyId: string
  memberId: string

/families/{familyId}
  name: string
  inviteCode: string          ← 6-char, e.g. "ABC123"
  weekStartDay: 1             ← Monday

  /members/{memberId}
    userId: string
    displayName: string
    role: "admin_parent" | "parent" | "child"
    avatarEmoji: string
    age?: number

  /tasks/{taskId}
    title: string
    category: "chores" | "homework" | "hygiene" | "behavior" | "extras"
    difficulty: "easy" | "medium" | "hard"
    pointValue: 10 | 25 | 50
    recurrence: "daily" | "weekly" | "once"
    assignedTo?: memberId | null    ← null = anyone
    autoFailHour?: 18-22
    isActive: boolean

  /completions/{id}
    taskId, memberId, weekId      ← e.g. "2025-W21"
    completedAt?: Timestamp | null
    wasAutoFailed: boolean
    pointsAwarded: number

  /transactions/{id}
    memberId, delta, reason
    source: "task" | "discipline" | "bonus" | "manual"
    createdAt: Timestamp

  /rewards/{rewardId}
    title, pointCost, isActive

  /redemptions/{id}
    rewardId, memberId
    status: "pending" | "approved" | "rejected"

  /weeklyScores/{weekId}          ← written by Cloud Function only
    scores: [{ memberId, points, rank, winner }]

  /notificationConfigs/{memberId}
    enabled: boolean
    dailyReminderTime: "20:00"
    pushToken: string             ← FCM token
    timezone: string
```

---

## Migrating Existing Supabase Data (if any)

If you have data in Supabase you want to migrate:

1. Export from Supabase: Dashboard → Table Editor → Export CSV for each table
2. Write a one-time Node.js migration script using the Firebase Admin SDK:
   ```js
   const admin = require('firebase-admin');
   const serviceAccount = require('./serviceAccountKey.json');
   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
   const db = admin.firestore();
   // Read CSV, write to Firestore subcollections
   ```
3. Download `serviceAccountKey.json`: Firebase Console → Project Settings → Service Accounts → Generate new private key
