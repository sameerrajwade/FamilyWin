/**
 * lib/firebase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for lib/supabase.ts
 * All exported function signatures stay compatible with existing screen code.
 * Uses @react-native-firebase (native SDK — better perf than JS SDK on Android)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Timestamp } from '@react-native-firebase/firestore';
import { firestore, auth, storage, functions } from '@/lib/fb';
import { missedTaskPenaltyAmount, graceWindowDays, type MissedPenaltyMode } from '@/lib/pointsEngine';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

// ─── OFFLINE PERSISTENCE ──────────────────────────────────────────────────────
// Enable Firestore disk cache so the app works offline (reads from local cache,
// writes are queued and synced when connection is restored).
// Must be called once before any Firestore reads/writes.
try {
  firestore().settings({ persistence: true });
} catch {
  // settings() throws if called after first Firestore call — safe to ignore
}

// ─── RE-EXPORT AUTH so screens can import from one place ─────────────────────
export { auth };
export const db = firestore;

// ─── COLLECTION PATHS ────────────────────────────────────────────────────────
// Mirrors the Supabase table structure as Firestore subcollections.
//
//  /families/{familyId}
//    /members/{memberId}
//    /tasks/{taskId}
//    /completions/{completionId}
//    /transactions/{transactionId}
//    /rewards/{rewardId}
//    /redemptions/{redemptionId}
//    /weeklyScores/{weekId}
//    /notificationConfigs/{memberId}
//
//  /users/{uid}   ← top-level lookup: uid → { familyId, memberId }

export const Col = {
  users: () => firestore().collection('users'),
  families: () => firestore().collection('families'),
  members: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('members'),
  tasks: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('tasks'),
  completions: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('completions'),
  transactions: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('transactions'),
  rewards: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('rewards'),
  redemptions: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('redemptions'),
  penalties: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('penalties'),
  weeklyScores: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('weeklyScores'),
  notifConfigs: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('notificationConfigs'),
};

// ─── WEEK HELPERS (unchanged from supabase.ts) ───────────────────────────────

export function getWeekIdForDate(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getCurrentWeekId(): string {
  return getWeekIdForDate(new Date());
}

export function getWeekStart(weekId: string): Date {
  const [year, week] = weekId.split('-W').map(Number);
  const jan1 = new Date(year, 0, 1);
  const daysToMonday = (1 - jan1.getDay() + 7) % 7;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToMonday);
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (week - 1) * 7);
  return start;
}

export function generateInviteCode(): string {
  // Exclude ambiguous chars: 0/O, 1/I/L to avoid confusion when reading aloud
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join('');
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string) {
  return auth().createUserWithEmailAndPassword(email, password);
}

export async function signIn(email: string, password: string) {
  return auth().signInWithEmailAndPassword(email, password);
}

export async function signOut() {
  return auth().signOut();
}

/**
 * Permanently delete the signed-in user's account (Play policy requirement).
 * Delegates to the `deleteAccount` Cloud Function, which cascade-deletes the
 * family/photos/member docs and the Auth user server-side (the client can't do
 * this under our security rules). After it returns, the onAuthStateChanged
 * listener in _layout.tsx sees the user gone and routes back to auth.
 */
export async function deleteMyAccount(): Promise<void> {
  await functions().httpsCallable('deleteAccount')();
  // Auth user is already deleted server-side; make sure the local session clears.
  try { await auth().signOut(); } catch { /* already signed out */ }
}

export function getSession() {
  return auth().currentUser;
}

// ─── FAMILY HELPERS ───────────────────────────────────────────────────────────

export interface FamilyDoc {
  id: string;
  name: string;
  inviteCode: string;
  weekStartDay: number;
  // opt-in: a missed daily task deducts half or the full point value (reversible
  // within a 2-day grace window). Absent = 'off'. (Legacy boolean true is read
  // as 'half' by the client for backward-compat.)
  missedTaskPenalty?: 'off' | 'half' | 'full' | boolean;
  // Monetization (Lootboard Plus). Absent = free tier. Server-validated later
  // (RevenueCat webhook → Cloud Function); the client never trusts a
  // client-written plan. While constants/plans.ts MONETIZATION_ENABLED is false,
  // entitlement checks treat everyone as Plus (free-for-all) regardless of this.
  plan?: 'free' | 'plus';
  planExpiresAt?: Timestamp | null;
  createdAt: Timestamp;
}

export interface MemberDoc {
  id: string;
  familyId: string;
  userId: string;           // empty string '' for managed (phone-free) members
  displayName: string;
  role: 'admin_parent' | 'parent' | 'child';
  avatarEmoji: string;
  photoURL?: string;        // Firebase Storage download URL for profile photo
  age?: number;
  isManaged?: boolean;      // true = parent-created profile, no Firebase Auth account
  weeklyGoal?: number | null; // personal weekly points target (🎯 Goal Crusher crown); null/absent = none
  createdAt: Timestamp;
}

/** Create a new family and return the family doc */
export async function createFamily(name: string): Promise<FamilyDoc> {
  const inviteCode = generateInviteCode();
  const ref = Col.families().doc();
  const data: Omit<FamilyDoc, 'id'> = {
    name,
    inviteCode,
    weekStartDay: 1, // Monday
    createdAt: firestore.Timestamp.now(),
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

/** Look up a family by 6-char invite code */
/**
 * Join a family by invite code via the server-authoritative `joinFamily` Cloud
 * Function (rate-limited, size-capped). Replaces the old client-side
 * getFamilyByInviteCode + createMember pair. Re-hydrates typed family/member
 * docs afterward (now that the caller is a member, rules allow the reads).
 */
export async function joinFamily(
  uid: string,
  // `role` is accepted for backwards-compat but IGNORED — the joinFamily Cloud
  // Function always creates a 'child' (parent-controlled join). A parent
  // promotes trusted adults later from the Family screen.
  params: { inviteCode: string; displayName: string; role?: MemberDoc['role']; avatarEmoji: string; age?: number },
): Promise<{ family: FamilyDoc; member: MemberDoc }> {
  await functions().httpsCallable('joinFamily')({
    inviteCode: params.inviteCode,
    displayName: params.displayName,
    avatarEmoji: params.avatarEmoji,
    ...(params.age != null ? { age: params.age } : {}),
  });
  const result = await getUserFamilyAndMember(uid);
  if (!result) throw new Error('Joined but could not load family.');
  return result;
}

export async function getFamilyByInviteCode(code: string): Promise<FamilyDoc> {
  const snap = await Col.families()
    .where('inviteCode', '==', code.toUpperCase())
    .limit(1)
    .get();
  if (snap.empty) throw new Error('No family found with that invite code.');
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<FamilyDoc, 'id'>) };
}

/** Create a member inside a family and link uid → family in /users */
export async function createMember(params: {
  familyId: string;
  userId: string;
  displayName: string;
  role: MemberDoc['role'];
  avatarEmoji: string;
  age?: number;
}): Promise<MemberDoc> {
  const ref = Col.members(params.familyId).doc();
  // Firestore rejects `undefined` — only include age if provided
  const data: Omit<MemberDoc, 'id'> = {
    familyId: params.familyId,
    userId: params.userId,
    displayName: params.displayName,
    role: params.role,
    avatarEmoji: params.avatarEmoji,
    ...(params.age != null ? { age: params.age } : {}),
    createdAt: firestore.Timestamp.now(),
  } as Omit<MemberDoc, 'id'>;
  const batch = firestore().batch();
  batch.set(ref, data);
  batch.set(Col.users().doc(params.userId), {
    familyId: params.familyId,
    memberId: ref.id,
  });
  await batch.commit();
  return { id: ref.id, ...data };
}

/**
 * Create a managed child profile — no Firebase Auth account required.
 * Only writes the member doc (no /users lookup entry).
 */
export async function createManagedMember(params: {
  familyId: string;
  displayName: string;
  avatarEmoji: string;
  age?: number;
}): Promise<MemberDoc> {
  const ref = Col.members(params.familyId).doc();
  const data: Omit<MemberDoc, 'id'> = {
    familyId: params.familyId,
    userId: '',
    displayName: params.displayName,
    role: 'child',
    avatarEmoji: params.avatarEmoji,
    ...(params.age != null ? { age: params.age } : {}),
    isManaged: true,
    createdAt: firestore.Timestamp.now(),
  } as Omit<MemberDoc, 'id'>;
  await ref.set(data);
  return { id: ref.id, ...data };
}

/** Update a member's display name, avatar, age, or photoURL */
export async function updateMemberProfile(
  familyId: string,
  memberId: string,
  updates: { displayName?: string; avatarEmoji?: string; age?: number; photoURL?: string },
): Promise<void> {
  await Col.members(familyId).doc(memberId).update(updates);
}

/**
 * Upload a profile photo to Firebase Storage and persist the download URL
 * to the member document. Returns the public download URL.
 *
 * @param localUri  Local file URI from expo-image-picker (e.g. file:///...)
 * @param familyId  Firestore family ID
 * @param memberId  Firestore member ID
 */
export async function uploadMemberPhoto(
  localUri: string,
  familyId: string,
  memberId: string,
): Promise<string> {
  // Normalise ANY picked URI (file://, or content:// from the Google Photos /
  // MediaStore picker) into a real, compressed JPEG file on disk. expo-image-
  // manipulator reads content:// via ContentResolver and always writes a plain
  // file:// path, which the native Firebase SDK's putFile() can upload reliably.
  //
  // This replaces the old fetch()->blob()->ref.put(blob) path: on Android + the
  // native RN-Firebase SDK, Blob support is unreliable and content:// blobs come
  // back empty, so uploads silently produced 0-byte files. putFile(path) is the
  // native SDK's supported primitive. Resize to 512px also cuts Storage cost.
  const ref = storage().ref(`member-photos/${familyId}/${memberId}.jpg`);

  // Turn WHATEVER the picker returned into an app-owned, compressed file:// JPEG.
  //
  // Android's ACTION_GET_CONTENT (routed to the system Photo Picker on 13+) hands
  // back a `content://media/picker/…` URI. Confirmed on-device, BOTH Expo file
  // APIs choke on it: FileSystem.copyAsync → ERR_UNEXPECTED, and
  // ImageManipulator.manipulateAsync → ERR_IMAGE_DECODE. React Native's own
  // fetch(), however, resolves content:// through the ContentResolver at the
  // native networking layer, so it reads the bytes where Expo can't. We fetch →
  // blob → base64 → write a REAL file:// we own, then compress + putFile that.
  const compress = async (uri: string) => {
    const m = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    return m.uri;
  };

  const errors: string[] = [];
  let localFile: string | null = localUri.startsWith('file://') ? localUri : null;

  // Strategy 1 (content://) — read bytes via fetch, persist as an owned file://.
  if (!localFile) {
    try {
      const res = await fetch(localUri);
      const blob = await res.blob();
      if (!blob || (blob as any).size === 0) throw new Error('empty blob');
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('reader failed'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
      if (!base64) throw new Error('no base64');
      const dest = `${FileSystem.cacheDirectory}upload_${memberId}_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
      localFile = dest;
    } catch (e: any) {
      errors.push(`fetch: ${e?.code ?? e?.message ?? e}`);
    }
  }

  // Strategy 2 (content://) — FileSystem.copyAsync as a fallback.
  if (!localFile) {
    try {
      const dest = `${FileSystem.cacheDirectory}upload_${memberId}_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: localUri, to: dest });
      localFile = dest;
    } catch (e: any) {
      errors.push(`copy: ${e?.code ?? e?.message ?? e}`);
    }
  }

  // Strategy 3 (content://) — LAST RESORT: hand the raw content:// URI straight
  // to putFile. @react-native-firebase/storage v20's native putFile reads the
  // stream via Android's ContentResolver, and a SAF ACTION_GET_CONTENT result
  // carries an implicit read grant to our process — so this can succeed even
  // when every Expo file API (fetch/copy/manipulate) failed to bridge it to a
  // file://. No client-side compression on this path (we couldn't decode it),
  // which is an acceptable trade for a working upload; Storage-side resize is a
  // Phase 3 concern. Only reached when Strategies 1 & 2 both failed.
  if (!localFile) {
    try {
      await ref.putFile(localUri, { contentType: 'image/jpeg' });
      const directURL = await ref.getDownloadURL();
      await Col.members(familyId).doc(memberId).update({ photoURL: directURL });
      return directURL;
    } catch (e: any) {
      const code = e?.code ?? '';
      const native = e?.nativeErrorMessage ?? e?.message ?? String(e);
      errors.push(`putFile(content): ${code} ${native}`);
    }
  }

  if (!localFile) {
    throw new Error(`Couldn't read the selected image — ${errors.join(' | ')}`);
  }

  // Compress the owned file (≤512px jpeg) to cut Storage cost; upload as-is if that fails.
  let uploadUri = localFile;
  try {
    uploadUri = await compress(localFile);
  } catch { /* upload the full-size file rather than fail the whole flow */ }

  // Upload the resolved file://. Surface the real Firebase code on failure.
  try {
    await ref.putFile(uploadUri, { contentType: 'image/jpeg' });
  } catch (e: any) {
    const code = e?.code ?? '';
    const native = e?.nativeErrorMessage ?? e?.message ?? String(e);
    throw new Error(`Upload failed [${code}] ${native}`);
  }

  const downloadURL = await ref.getDownloadURL();
  await Col.members(familyId).doc(memberId).update({ photoURL: downloadURL });
  return downloadURL;
}

/**
 * Bulk-create rewards from a starter pack in one batched write. Mirrors
 * createTasksFromPack — stocks an empty rewards store in a single tap.
 */
export async function createRewardsFromPack(
  familyId: string,
  createdBy: string,
  rows: { title: string; pointCost: number; icon: string }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const batch = firestore().batch();
  for (const r of rows) {
    const ref = Col.rewards(familyId).doc();
    batch.set(ref, {
      familyId,
      title: r.title,
      pointCost: r.pointCost,
      icon: r.icon,
      createdBy,
      isActive: true,
      createdAt: firestore.Timestamp.now(),
    });
  }
  await batch.commit();
  return rows.length;
}

/**
 * Bulk-create tasks from a starter pack in one batched write (Roadmap 4.6).
 * Callers pass fully-resolved rows (points + emoji already computed) so this
 * layer stays free of UI/theme constants. Returns how many were created.
 */
export async function createTasksFromPack(
  familyId: string,
  createdBy: string,
  rows: { title: string; category: string; difficulty: string; recurrence: string; pointValue: number; taskEmoji: string }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const batch = firestore().batch();
  for (const r of rows) {
    const ref = Col.tasks(familyId).doc();
    batch.set(ref, {
      familyId,
      title: r.title,
      description: null,
      category: r.category,
      difficulty: r.difficulty,
      recurrence: r.recurrence,
      assignedTo: null,          // pack tasks default to the whole family
      pointValue: r.pointValue,
      autoFailHour: 20,
      taskEmoji: r.taskEmoji,
      isActive: true,
      createdBy,
      createdAt: firestore.Timestamp.now(),
    });
  }
  await batch.commit();
  return rows.length;
}

/**
 * Set (or clear) a member's personal weekly points goal. Beating your own goal
 * earns the 🎯 Goal Crusher crown (pointsEngine.computeCrowns) — the core of the
 * "losing-child" fix so every member has something winnable. Pass null to clear.
 */
export async function setMemberWeeklyGoal(
  familyId: string,
  memberId: string,
  goal: number | null,
): Promise<void> {
  await Col.members(familyId).doc(memberId).update({ weeklyGoal: goal });
}

/**
 * Remove a member's profile photo — deletes from Storage and clears the URL.
 */
export async function removeMemberPhoto(familyId: string, memberId: string): Promise<void> {
  try {
    await storage().ref(`member-photos/${familyId}/${memberId}.jpg`).delete();
  } catch { /* file may not exist — safe to ignore */ }
  await Col.members(familyId).doc(memberId).update({ photoURL: null });
}

/** Fetch all members of a family */
export async function getFamilyMembers(familyId: string): Promise<MemberDoc[]> {
  const snap = await Col.members(familyId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemberDoc, 'id'>) }));
}

/** Get the family + member for the current uid (used on app start) */
export async function getUserFamilyAndMember(uid: string): Promise<{
  family: FamilyDoc;
  member: MemberDoc;
} | null> {
  const userSnap = await Col.users().doc(uid).get();
  if (!userSnap.exists()) return null;
  const { familyId, memberId } = userSnap.data() as { familyId: string; memberId: string };

  const [familySnap, memberSnap] = await Promise.all([
    Col.families().doc(familyId).get(),
    Col.members(familyId).doc(memberId).get(),
  ]);

  if (!familySnap.exists() || !memberSnap.exists()) return null;

  return {
    family: { id: familySnap.id, ...(familySnap.data() as Omit<FamilyDoc, 'id'>) },
    member: { id: memberSnap.id, ...(memberSnap.data() as Omit<MemberDoc, 'id'>) },
  };
}

// ─── TASK HELPERS ─────────────────────────────────────────────────────────────

export interface TaskDoc {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once' | 'custom';
  assignedTo?: string | null;
  pointValue: number;
  autoFailHour?: number;
  taskEmoji?: string;
  isActive: boolean;
  /** Phase 4.3: when true, a child's completion is held for parent approval
   *  before points are awarded. Absent/false = points settle immediately. */
  requiresApproval?: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

export interface CompletionDoc {
  id: string;
  taskId: string;
  memberId: string;
  weekId: string;
  /** YYYY-MM-DD in local time — used to detect daily task resets */
  completedDate?: string;
  /** YYYY-MM in local time — used to detect monthly task resets */
  monthId?: string;
  completedAt?: Timestamp | null;
  wasAutoFailed: boolean;
  pointsAwarded: number;
  /** Phase 1.8: marks completions whose points are settled by the Cloud Function. */
  serverAward?: boolean;
  /** True for grace-window catch-up completions (affects the CF's tx reason). */
  completedLate?: boolean;
  /** For wasAutoFailed completions: which penalty the CF should apply. */
  penaltyKind?: 'autofail' | 'miss';
  /** Phase 4.3 task verification: 'pending' holds points until a parent
   *  approves; 'approved'/absent settles them; 'rejected' voids the award.
   *  Points are settled by the onCompletionUpdated Cloud Function. */
  status?: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Timestamp | null;
}

export interface TransactionDoc {
  id: string;
  familyId: string;
  memberId: string;
  delta: number;
  reason: string;
  /** 'redemption' = reward spend; excluded from leaderboard earned-points total */
  source: 'task' | 'discipline' | 'bonus' | 'manual' | 'redemption';
  referenceId?: string;
  createdAt: Timestamp;
}

/** Fetch all active tasks for a family */
export async function getActiveTasks(familyId: string): Promise<TaskDoc[]> {
  const snap = await Col.tasks(familyId).where('isActive', '==', true).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskDoc, 'id'>) }));
}

/** Fetch all completions for a specific week */
export async function getWeekCompletions(
  familyId: string,
  weekId: string,
): Promise<CompletionDoc[]> {
  const snap = await Col.completions(familyId).where('weekId', '==', weekId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompletionDoc, 'id'>) }));
}

/** YYYY-MM-DD in device local time */
export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM in device local time */
export function getCurrentMonthId(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Mark a task complete — writes completion + transaction atomically */
export async function completeTask(params: {
  familyId: string;
  taskId: string;
  memberId: string;
  weekId: string;
  pointValue: number;
  taskTitle: string;
  /** Phase 4.3: when true, the completion lands as 'pending' and points are
   *  awarded only after a parent approves it. */
  requiresApproval?: boolean;
}): Promise<TransactionDoc & { completionId: string }> {
  // Phase 1.8: the client writes ONLY the completion (stamped serverAward:true).
  // The onCompletionCreated Cloud Function settles the points transaction from
  // the task's authoritative pointValue — clients can no longer forge task
  // points. Completion still writes offline; points settle on reconnect.
  // Phase 4.3: a task that requiresApproval lands 'pending' — the CF holds the
  // award until a parent approves (onCompletionUpdated).
  const completionRef = Col.completions(params.familyId).doc();
  await completionRef.set({
    taskId: params.taskId,
    memberId: params.memberId,
    weekId: params.weekId,
    completedDate: getTodayDateString(),
    monthId: getCurrentMonthId(),
    completedAt: firestore.Timestamp.now(),
    wasAutoFailed: false,
    pointsAwarded: params.pointValue, // display hint; server recomputes the tx
    serverAward: true,
    ...(params.requiresApproval ? { status: 'pending' as const } : {}),
  });

  // Return shape preserved for callers (toast + undo). No client tx id exists now
  // — the CF creates it — so `id` mirrors the completion id (unused by undo).
  const txData = {
    familyId: params.familyId,
    memberId: params.memberId,
    delta: params.pointValue,
    reason: `Completed: ${params.taskTitle}`,
    source: 'task' as const,
    referenceId: params.taskId,
    createdAt: firestore.Timestamp.now(),
  };
  return { id: completionRef.id, completionId: completionRef.id, ...txData };
}

/**
 * Undo a task completion — removes the completion record and reverses the
 * points transaction it created. Only allowed same-day (enforced by caller/UI).
 * Restores the task to "pending" for that week.
 */
export async function undoTaskCompletion(params: {
  familyId: string;
  completionId: string;
  taskId: string;
  memberId: string;
  pointsAwarded: number;
  taskTitle: string;
}): Promise<{ undone: boolean; pointsReversed: number }> {
  const { familyId, completionId, taskId, memberId } = params;

  // Resolve the LIVE positive completion to reverse. The passed completionId can
  // be empty (optimistic store value) or a stale/cached id, in which case a
  // direct get() misses and the undo silently no-ops — the "undo needs 2 taps"
  // bug. Fall back to querying today's positive completion for this task+member.
  let ref = Col.completions(familyId).doc(completionId || '__none__');
  let snap = completionId ? await ref.get() : null;
  let data: any = snap && snap.exists() ? snap.data() : null;

  if (!data || data.wasAutoFailed || (data.pointsAwarded ?? 0) <= 0) {
    const todayKey = getTodayDateString();
    const q = await Col.completions(familyId)
      .where('taskId', '==', taskId)
      .where('memberId', '==', memberId)
      .where('completedDate', '==', todayKey)
      .get();
    const live = q.docs.find((d) => {
      const dd = d.data() as any;
      return !dd.wasAutoFailed && (dd.pointsAwarded ?? 0) > 0;
    });
    // IDEMPOTENT GUARD: nothing live to undo (already undone / concurrent tap).
    // Prevents the phantom-negative-points bug (writing a reversal with no
    // matching completion).
    if (!live) return { undone: false, pointsReversed: 0 };
    ref = Col.completions(familyId).doc(live.id);
    data = live.data();
  }

  const reversed = data.pointsAwarded ?? 0; // the points the CF will hand back
  // Phase 1.8: just delete the completion — onCompletionDeleted reverses the
  // points transaction server-side. (Only serverAward completions are reversed
  // by the CF; older completions still carry their own client tx, unaffected.)
  await ref.delete();
  return { undone: true, pointsReversed: reversed };
}

// ─── TASK VERIFICATION / PARENT APPROVAL (Phase 4.3) ─────────────────────────

/**
 * Completions awaiting parent approval (status:'pending'). Parents see these in
 * the approval queue. Uses a single-field equality query (no composite index).
 */
export async function getPendingCompletions(familyId: string): Promise<CompletionDoc[]> {
  const snap = await Col.completions(familyId).where('status', '==', 'pending').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompletionDoc, 'id'>) }));
}

/**
 * Approve a pending completion. Points settle server-side via the
 * onCompletionUpdated Cloud Function — the client only flips the status (rules
 * allow a parent to change status/approver fields only). Idempotent client-side.
 */
export async function approveCompletion(params: {
  familyId: string;
  completionId: string;
  approvedBy: string;
}): Promise<void> {
  await Col.completions(params.familyId).doc(params.completionId).update({
    status: 'approved',
    approvedBy: params.approvedBy,
    approvedAt: firestore.Timestamp.now(),
  });
}

/**
 * Reject a pending completion (task not actually done to standard). No points
 * are awarded; if the completion had somehow been approved first, the CF
 * reverses it. The task returns to incomplete for that day.
 */
export async function rejectCompletion(params: {
  familyId: string;
  completionId: string;
  approvedBy: string;
}): Promise<void> {
  await Col.completions(params.familyId).doc(params.completionId).update({
    status: 'rejected',
    approvedBy: params.approvedBy,
    approvedAt: firestore.Timestamp.now(),
  });
}

// ─── MISSED-TASK PENALTY + GRACE-WINDOW CATCH-UP (optional feature) ───────────

/** Set the missed-task penalty mode for a family (parents only via rules). */
export async function setMissedTaskPenalty(familyId: string, mode: 'off' | 'half' | 'full'): Promise<void> {
  await Col.families().doc(familyId).update({ missedTaskPenalty: mode });
}

/** Normalize the family's missed-task penalty setting to a mode (handles the legacy boolean). */
export function missedPenaltyMode(family: { missedTaskPenalty?: 'off' | 'half' | 'full' | boolean } | null | undefined): 'off' | 'half' | 'full' {
  const v = family?.missedTaskPenalty;
  if (v === true) return 'half';        // legacy boolean
  if (v === 'half' || v === 'full') return v;
  return 'off';
}

export interface CatchUpItem {
  task: TaskDoc;
  dateKey: string;   // YYYY-MM-DD the task was missed
  penalized: boolean; // true if the half-point miss penalty has already been applied for that day
}

/**
 * Daily tasks a member missed within the grace window (still catch-up-able).
 * `graceDays` comes from graceWindowDays() (≤2 recent days, excluding today).
 * Uses per-day equality queries so no composite index is needed.
 */
export async function getMissedCatchUpTasks(params: {
  familyId: string;
  memberId: string;
  graceDays: string[];
}): Promise<CatchUpItem[]> {
  const { familyId, memberId, graceDays } = params;
  if (!graceDays.length) return [];

  // Only daily tasks EXPLICITLY assigned to this member. Unassigned "family"
  // tasks aren't auto-penalized (it's unclear who owed them, and penalizing every
  // member for one shared task would be wrong) — assign a task to a member to
  // bring it into their missed-task accounting.
  const dailyTasks = (await getActiveTasks(familyId)).filter(
    (t) => t.recurrence === 'daily' && (
      t.assignedTo === memberId ||
      (Array.isArray(t.assignedTo) && (t.assignedTo as string[]).includes(memberId))
    ),
  );
  if (!dailyTasks.length) return [];

  const items: CatchUpItem[] = [];
  for (const dateKey of graceDays) {
    const snap = await Col.completions(familyId)
      .where('memberId', '==', memberId)
      .where('completedDate', '==', dateKey)
      .get();
    const dayComps = snap.docs.map((d) => d.data() as CompletionDoc);

    for (const task of dailyTasks) {
      // A task can't be "missed" on a day before it existed.
      const createdKey = task.createdAt ? isoDateKey(task.createdAt.toDate()) : '0000-00-00';
      if (createdKey > dateKey) continue;

      const forTask = dayComps.filter((c) => c.taskId === task.id);
      const donePositive = forTask.some((c) => !c.wasAutoFailed && (c.pointsAwarded ?? 0) > 0);
      if (donePositive) continue; // already completed that day

      const penalized = forTask.some((c) => c.wasAutoFailed || (c.pointsAwarded ?? 0) < 0);
      items.push({ task, dateKey, penalized });
    }
  }
  return items;
}

function isoDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Apply the half-point miss penalty for one daily task on one past day. Writes a
 * missed-completion marker + a negative transaction. Idempotent: a no-op if ANY
 * completion (positive or penalty) already exists for that task+member+day, so
 * calling it from multiple devices/loads can't double-penalize.
 *
 * Client-side + lazy (on Home load, in the viewer's local timezone) rather than
 * a UTC Cloud Function, which would fire mid-afternoon for non-UTC users and
 * penalize a day that isn't over locally. FUTURE: a timezone-aware CF sweep to
 * also cover members who never open the app.
 */
export async function applyMissedTaskPenalty(params: {
  familyId: string;
  memberId: string;
  taskId: string;
  pointValue: number;
  taskTitle: string;
  penaltyAmount: number; // positive magnitude; stored as a negative delta
  dateKey: string; // YYYY-MM-DD
}): Promise<void> {
  const { familyId, memberId, taskId, penaltyAmount, dateKey } = params;
  if (penaltyAmount <= 0) return;
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekId = getWeekIdForDate(new Date(y, m - 1, d, 12, 0, 0));

  const existing = await Col.completions(familyId)
    .where('taskId', '==', taskId)
    .where('memberId', '==', memberId)
    .where('completedDate', '==', dateKey)
    .limit(1)
    .get();
  if (!existing.empty) return; // already completed or already penalized that day

  // Deterministic doc IDs keyed on (task, member, day) so a race between two
  // devices that both pass the guard above writes the SAME two docs (one
  // penalty) instead of duplicating the -half transaction.
  // Phase 1.8: write ONLY the miss completion (deterministic id keeps the
  // cross-device race writing one doc). onCompletionCreated sees wasAutoFailed
  // and writes the −penalty transaction, recomputed from the task server-side.
  const key = `${taskId}__${memberId}__${dateKey}`;
  await Col.completions(familyId).doc(`miss__${key}`).set({
    taskId,
    memberId,
    weekId,
    completedDate: dateKey,
    monthId: `${y}-${String(m).padStart(2, '0')}`,
    completedAt: null,
    wasAutoFailed: true,
    pointsAwarded: -penaltyAmount, // display hint; server recomputes the tx
    serverAward: true,
    penaltyKind: 'miss',
  });
}

/**
 * Retroactively mark a daily task complete for a past (grace-window) day. If a
 * miss penalty was already applied for that day, it is reversed (points added
 * back) before awarding the task's points. Idempotent: a no-op if the task is
 * already positively completed for that day.
 */
export async function completeTaskForDate(params: {
  familyId: string;
  taskId: string;
  memberId: string;
  pointValue: number;
  taskTitle: string;
  dateKey: string; // YYYY-MM-DD
}): Promise<void> {
  const { familyId, taskId, memberId, pointValue, dateKey } = params;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const weekId = getWeekIdForDate(dateObj);
  const monthId = `${y}-${String(m).padStart(2, '0')}`;

  const snap = await Col.completions(familyId)
    .where('taskId', '==', taskId)
    .where('memberId', '==', memberId)
    .where('completedDate', '==', dateKey)
    .get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CompletionDoc, 'id'>) }));

  // Idempotent: already positively completed for that day.
  if (docs.some((c) => !c.wasAutoFailed && (c.pointsAwarded ?? 0) > 0)) return;

  const batch = firestore().batch();

  // Phase 1.8: reverse any miss penalty for that day by DELETING the miss
  // completion — onCompletionDeleted adds the deducted points back. Then create
  // the late completion; onCompletionCreated awards +pointValue (serverAward +
  // completedLate). No client-written transactions.
  const missed = docs.find((c) => c.wasAutoFailed || (c.pointsAwarded ?? 0) < 0);
  if (missed) batch.delete(Col.completions(familyId).doc(missed.id));

  const completionRef = Col.completions(familyId).doc();
  batch.set(completionRef, {
    taskId,
    memberId,
    weekId,
    completedDate: dateKey,
    monthId,
    completedAt: firestore.Timestamp.now(),
    wasAutoFailed: false,
    pointsAwarded: pointValue, // display hint; server recomputes the tx
    serverAward: true,
    completedLate: true,
  });

  await batch.commit();
}

/**
 * Apply any pending miss penalties for a member across the grace window and
 * return the current catch-up-able items. Shared by the Home lazy sweep and the
 * dedicated Catch-up screen so both apply + list consistently. No-op when off.
 */
export async function syncMissedPenalties(params: {
  familyId: string;
  memberId: string;
  mode: MissedPenaltyMode;
}): Promise<CatchUpItem[]> {
  const { familyId, memberId, mode } = params;
  if (mode === 'off') return [];
  const graceDays = graceWindowDays();
  let items = await getMissedCatchUpTasks({ familyId, memberId, graceDays });
  const toPenalize = items.filter((i) => !i.penalized);
  if (toPenalize.length) {
    await Promise.all(toPenalize.map((i) => applyMissedTaskPenalty({
      familyId, memberId,
      taskId: i.task.id, pointValue: i.task.pointValue, taskTitle: i.task.title,
      penaltyAmount: missedTaskPenaltyAmount(i.task.pointValue, mode), dateKey: i.dateKey,
    })));
    items = await getMissedCatchUpTasks({ familyId, memberId, graceDays });
  }
  return items;
}

/** Get all transactions for a member this week */
export async function getWeeklyPoints(
  familyId: string,
  memberId: string,
  weekId: string,
): Promise<number> {
  const weekStart = getWeekStart(weekId);
  const snap = await Col.transactions(familyId)
    .where('memberId', '==', memberId)
    .where('createdAt', '>=', firestore.Timestamp.fromDate(weekStart))
    .get();
  return snap.docs.reduce((sum, d) => sum + (d.data().delta as number), 0);
}

/** Add a point transaction (used for discipline events, bonuses, etc.) */
export async function addPointTransaction(params: {
  familyId: string;
  memberId: string;
  delta: number;
  reason: string;
  source: TransactionDoc['source'];
  referenceId?: string;
}): Promise<TransactionDoc> {
  const ref = Col.transactions(params.familyId).doc();
  const data = {
    ...params,
    createdAt: firestore.Timestamp.now(),
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

// ─── REWARD HELPERS ──────────────────────────────────────────────────────────

export interface RewardDoc {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  pointCost: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

export interface RedemptionDoc {
  id: string;
  rewardId: string;
  familyId: string;
  memberId: string;
  status: 'pending' | 'approved' | 'rejected';
  redeemedAt: Timestamp;
  approvedBy?: string;
}

export async function getActiveRewards(familyId: string): Promise<RewardDoc[]> {
  // No orderBy — avoids composite index requirement. Sort client-side by pointCost.
  const snap = await Col.rewards(familyId)
    .where('isActive', '==', true)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<RewardDoc, 'id'>) }))
    .sort((a, b) => a.pointCost - b.pointCost);
}

export async function createReward(params: {
  familyId: string;
  title: string;
  description?: string;
  pointCost: number;
  createdBy: string;
}): Promise<void> {
  // Spread undefined optional fields crash Firestore — build explicitly
  await Col.rewards(params.familyId).add({
    familyId: params.familyId,
    title: params.title,
    ...(params.description ? { description: params.description } : {}),
    pointCost: params.pointCost,
    createdBy: params.createdBy,
    isActive: true,
    createdAt: firestore.Timestamp.now(),
  });
}

// ─── PENALTY HELPERS ─────────────────────────────────────────────────────────
// Parent-defined penalty presets (the customizable "negative rewards" list).
// Applying one writes a source:'discipline' negative transaction — the same
// audited path the discipline log uses. Distinct from the missed-task
// half/full auto-deduction, which is a per-family setting on the task path.

export interface PenaltyDoc {
  id: string;
  familyId: string;
  title: string;
  /** Positive magnitude of points to deduct (the transaction delta is -points). */
  points: number;
  emoji?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

/** Active parent-defined penalty presets, cheapest first. */
export async function getActivePenalties(familyId: string): Promise<PenaltyDoc[]> {
  const snap = await Col.penalties(familyId).where('isActive', '==', true).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PenaltyDoc, 'id'>) }))
    .sort((a, b) => a.points - b.points);
}

export async function createPenalty(params: {
  familyId: string;
  title: string;
  points: number;
  emoji?: string;
  createdBy: string;
}): Promise<void> {
  await Col.penalties(params.familyId).add({
    familyId: params.familyId,
    title: params.title,
    points: Math.abs(params.points),
    ...(params.emoji ? { emoji: params.emoji } : {}),
    createdBy: params.createdBy,
    isActive: true,
    createdAt: firestore.Timestamp.now(),
  });
}

/** Soft-delete a penalty preset (keeps it out of the picker, preserves history). */
export async function deletePenalty(familyId: string, penaltyId: string): Promise<void> {
  await Col.penalties(familyId).doc(penaltyId).update({ isActive: false });
}

export async function requestRedemption(params: {
  familyId: string;
  rewardId: string;
  memberId: string;
}): Promise<void> {
  await Col.redemptions(params.familyId).add({
    rewardId: params.rewardId,
    familyId: params.familyId,
    memberId: params.memberId,
    status: 'pending',
    redeemedAt: firestore.Timestamp.now(),
  });
}

export async function approveRedemption(params: {
  familyId: string;
  redemptionId: string;
  memberId: string;
  pointCost: number;
  approvedBy: string;
}): Promise<void> {
  const batch = firestore().batch();

  // Update redemption status
  batch.update(Col.redemptions(params.familyId).doc(params.redemptionId), {
    status: 'approved',
    approvedBy: params.approvedBy,
  });

  // Deduct points — source='redemption' so leaderboard can exclude it
  const txRef = Col.transactions(params.familyId).doc();
  batch.set(txRef, {
    familyId: params.familyId,
    memberId: params.memberId,
    delta: -params.pointCost,
    reason: 'Reward redeemed',
    source: 'redemption',
    referenceId: params.redemptionId,
    createdAt: firestore.Timestamp.now(),
  });

  await batch.commit();
}

/** Update the family's weekly reset day (0=Sunday … 6=Saturday) */
export async function updateFamilyWeekStartDay(familyId: string, day: number): Promise<void> {
  await Col.families().doc(familyId).update({ weekStartDay: day });
}

/**
 * Fetch completions for one member from the last `dayWindow` days.
 * Used for recurrence-aware completion checking:
 *   daily  → filter by completedDate === today
 *   weekly → filter by weekId === currentWeekId
 *   monthly → filter by monthId === currentMonthId
 *   once   → any result = done forever
 */
export async function getRecentCompletions(
  familyId: string,
  memberId: string,
  dayWindow = 35,
): Promise<CompletionDoc[]> {
  const since = new Date();
  since.setDate(since.getDate() - dayWindow);
  const snap = await Col.completions(familyId)
    .where('memberId', '==', memberId)
    .where('completedAt', '>=', firestore.Timestamp.fromDate(since))
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompletionDoc, 'id'>) }));
}

// ─── NOTIFICATION CONFIG ─────────────────────────────────────────────────────

export async function upsertNotifConfig(
  familyId: string,
  memberId: string,
  data: { enabled?: boolean; dailyReminderTime?: string; pushToken?: string; timezone?: string },
) {
  await Col.notifConfigs(familyId).doc(memberId).set(data, { merge: true });
}

export async function getNotifConfig(familyId: string, memberId: string) {
  const snap = await Col.notifConfigs(familyId).doc(memberId).get();
  return snap.exists() ? snap.data() : null;
}

// ─── PASSWORD RESET ──────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string): Promise<void> {
  await auth().sendPasswordResetEmail(email.trim().toLowerCase());
}

// ─── TASK MANAGEMENT ─────────────────────────────────────────────────────────

/** Update an existing task's fields. Completions are preserved as-is. */
export async function updateTask(
  familyId: string,
  taskId: string,
  updates: Partial<Pick<TaskDoc, 'title' | 'description' | 'category' | 'difficulty' | 'recurrence' | 'assignedTo' | 'pointValue' | 'autoFailHour' | 'taskEmoji' | 'requiresApproval'>>,
): Promise<void> {
  await Col.tasks(familyId).doc(taskId).update(updates);
}

/** Soft-delete a task by marking isActive = false. Historical completions are preserved. */
export async function deleteTask(familyId: string, taskId: string): Promise<void> {
  await Col.tasks(familyId).doc(taskId).update({ isActive: false });
}

// ─── REWARD REJECTION ────────────────────────────────────────────────────────

/** Reject a pending redemption with an optional reason. Does NOT deduct points. */
export async function rejectRedemption(
  familyId: string,
  redemptionId: string,
  rejectedBy: string,
  reason?: string,
): Promise<void> {
  await Col.redemptions(familyId).doc(redemptionId).update({
    status: 'rejected',
    rejectedBy,
    ...(reason ? { rejectionReason: reason } : {}),
  });
}

// ─── MEMBER REMOVAL ──────────────────────────────────────────────────────────

/** Remove a managed child member from the family. */
export async function removeManagedMember(
  familyId: string,
  memberId: string,
): Promise<void> {
  await Col.members(familyId).doc(memberId).delete();
}

// ─── PERSONAL BEST ───────────────────────────────────────────────────────────

/** Get the best single-week point total for a member across all recorded weeks.
 *  Reads /weeklyScores — populated by Cloud Function. Falls back to current transactions. */
export async function getMemberPersonalBest(
  familyId: string,
  memberId: string,
): Promise<number> {
  try {
    const snap = await Col.weeklyScores(familyId).get();
    let best = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const scores: { memberId: string; points: number }[] = data.scores ?? [];
      const entry = scores.find((s) => s.memberId === memberId);
      if (entry && entry.points > best) best = entry.points;
    }
    return best;
  } catch {
    return 0;
  }
}
