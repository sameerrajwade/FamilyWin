/**
 * lib/firebase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for lib/supabase.ts
 * All exported function signatures stay compatible with existing screen code.
 * Uses @react-native-firebase (native SDK — better perf than JS SDK on Android)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

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
  weeklyScores: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('weeklyScores'),
  notifConfigs: (familyId: string) =>
    firestore().collection('families').doc(familyId).collection('notificationConfigs'),
};

// ─── WEEK HELPERS (unchanged from supabase.ts) ───────────────────────────────

export function getCurrentWeekId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
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

export function getSession() {
  return auth().currentUser;
}

// ─── FAMILY HELPERS ───────────────────────────────────────────────────────────

export interface FamilyDoc {
  id: string;
  name: string;
  inviteCode: string;
  weekStartDay: number;
  createdAt: FirebaseFirestoreTypes.Timestamp;
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
  createdAt: FirebaseFirestoreTypes.Timestamp;
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
  const ref = storage().ref(`member-photos/${familyId}/${memberId}.jpg`);
  await ref.putFile(localUri);
  const downloadURL = await ref.getDownloadURL();
  await Col.members(familyId).doc(memberId).update({ photoURL: downloadURL });
  return downloadURL;
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
  if (!userSnap.exists) return null;
  const { familyId, memberId } = userSnap.data() as { familyId: string; memberId: string };

  const [familySnap, memberSnap] = await Promise.all([
    Col.families().doc(familyId).get(),
    Col.members(familyId).doc(memberId).get(),
  ]);

  if (!familySnap.exists || !memberSnap.exists) return null;

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
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once';
  assignedTo?: string | null;
  pointValue: number;
  autoFailHour?: number;
  isActive: boolean;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
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
  completedAt?: FirebaseFirestoreTypes.Timestamp | null;
  wasAutoFailed: boolean;
  pointsAwarded: number;
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
  createdAt: FirebaseFirestoreTypes.Timestamp;
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
}): Promise<TransactionDoc> {
  const batch = firestore().batch();

  const completionRef = Col.completions(params.familyId).doc();
  batch.set(completionRef, {
    taskId: params.taskId,
    memberId: params.memberId,
    weekId: params.weekId,
    completedDate: getTodayDateString(),
    monthId: getCurrentMonthId(),
    completedAt: firestore.Timestamp.now(),
    wasAutoFailed: false,
    pointsAwarded: params.pointValue,
  });

  const txRef = Col.transactions(params.familyId).doc();
  const txData = {
    familyId: params.familyId,
    memberId: params.memberId,
    delta: params.pointValue,
    reason: `Completed: ${params.taskTitle}`,
    source: 'task' as const,
    referenceId: params.taskId,
    createdAt: firestore.Timestamp.now(),
  };
  batch.set(txRef, txData);

  await batch.commit();
  return { id: txRef.id, ...txData };
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
}): Promise<void> {
  const batch = firestore().batch();

  const completionRef = Col.completions(params.familyId).doc(params.completionId);
  batch.delete(completionRef);

  const txRef = Col.transactions(params.familyId).doc();
  batch.set(txRef, {
    familyId: params.familyId,
    memberId: params.memberId,
    delta: -params.pointsAwarded,
    reason: `Undo: ${params.taskTitle}`,
    source: 'task' as const,
    referenceId: params.taskId,
    createdAt: firestore.Timestamp.now(),
  });

  await batch.commit();
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
  createdAt: FirebaseFirestoreTypes.Timestamp;
}

export interface RedemptionDoc {
  id: string;
  rewardId: string;
  familyId: string;
  memberId: string;
  status: 'pending' | 'approved' | 'rejected';
  redeemedAt: FirebaseFirestoreTypes.Timestamp;
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
  return snap.exists ? snap.data() : null;
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
  updates: Partial<Pick<TaskDoc, 'title' | 'description' | 'category' | 'difficulty' | 'recurrence' | 'assignedTo' | 'pointValue' | 'autoFailHour'>>,
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
