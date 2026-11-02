import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Pressable, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Sounds } from '@/lib/sounds';
import { router, useFocusEffect } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withDelay, interpolateColor } from 'react-native-reanimated';
import { useAuthStore, useTaskStore, useFamilyStore, usePointsStore } from '@/store';
import {
  getActiveTasks, getPeriodCompletions, completeTask as fbCompleteTask,
  undoTaskCompletion, recoverFailedTask,
  getCurrentWeekId, getTodayDateString, getCurrentMonthId,
  Col, deleteTask, getRecentCompletions, uploadCompletionProof,
  syncMissedPenalties, missedPenaltyMode, penaltyPauseActive, type CatchUpItem,
} from '@/lib/firebase';
import { pickPhotoUri } from '@/lib/photoPicker';
import { getCurrentWeekRange, getLevel, summarizeMemberPoints } from '@/lib/pointsEngine';
import { effectiveAssignee, isDueToday } from '@/lib/rotation';
import { resolveTaskEmoji } from '@/lib/taskEmoji';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { useReminderStatus } from '@/lib/reminderStatus';
import { findCompletionForPeriod, dayKey, familyPeriod } from '@/lib/completionMatch';
import { useKidMode } from '@/lib/kidMode';
import { isKid } from '@/lib/familyGame';
import { FamilyGoalBar } from '@/components/ui/FamilyGoal';
import { openTaskEditor } from '@/lib/taskNav';
import { checkSurprisePacks } from '@/lib/surprise';
import { SurprisePackReveal } from '@/components/ui/SurprisePack';
import { DailyQuestRing } from '@/components/ui/DailyQuestRing';
import { streakWithShields, activeDayKeys, STREAK_WINDOW_DAYS, SHIELD_MIN_ACTIVE_DAYS, SHIELD_CAP } from '@/lib/streakShield';
import { SavingGoalRow } from '@/components/ui/SavingGoal';
import { BountyBoard } from '@/components/ui/BountyBoard';
import { DiscoverCard } from '@/components/ui/DiscoverCard';
import { InviteNudge } from '@/components/ui/InviteNudge';
import { TwistBanner } from '@/components/ui/TwistBanner';
import { KudosToast } from '@/components/ui/Kudos';
import { twistForWeek, weekStartKeyOf, twistChipFor } from '@/lib/twists';
import { maybeAskForReview } from '@/lib/nudgeStore';
import { discoverCardToShow } from '@/lib/starterKit';
import { useMemberLevels } from '@/lib/memberLevels';
import { LevelUpReveal } from '@/components/ui/LevelPerks';
import { questProgress, questLabel, questExplainer } from '@/lib/surprisePacks';
import { ShareCardModal, shareContext, type ShareCardData } from '@/components/ui/ShareCard';
import { useTheme } from '@/lib/theme';
import { Confetti, PointBurst, SlideIn, ShimmerBox } from '@/components/ui/Animations';
import { Mascot, ChildTaskCard, CelebrationOverlay, StreakFlame } from '@/components/ui/ChildMode';
import { WelcomeTour } from '@/components/ui/WelcomeTour';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmptyState, Avatar } from '@/components/ui/index';
import { Icon } from '@/components/ui/Icon';
import { BrandBar } from '@/components/ui/Brand';
import { LinearGradient } from 'expo-linear-gradient';
// ProfileSwitcherBanner replaced by inline ProfileTabBar below
import { CATEGORY_COLORS, CATEGORY_ICONS, FontFamily, FontSize, Spacing, BorderRadius, Shadow, Gradients } from '@/constants/theme';

type TaskWithCompletion = {
  id: string; familyId: string; title: string; category: string;
  difficulty: 'easy' | 'medium' | 'hard'; recurrence: string;
  pointValue: number; autoFailHour?: number; isActive: boolean;
  assignedTo?: string | null; createdBy: string; requiresApproval?: boolean;
  completion: { id: string; wasAutoFailed: boolean; pointsAwarded: number; completedDate?: string | null; completedAt?: any; status?: 'pending' | 'approved' | 'rejected' } | null;
};

export default function HomeScreen() {
  const { member, family, actingAsMember, tourNonce } = useAuthStore();
  // effectiveMember = who we're doing tasks for (self or a managed child)
  const effectiveMember = actingAsMember ?? member;
  const { todaysTasks, setTodaysTasks, isLoadingTasks, setLoadingTasks, markTaskComplete } = useTaskStore();
  const { updateMemberPoints, members } = useFamilyStore();
  const kidProfiles = (members as any[]).filter(isKid);
  const { addTransaction } = usePointsStore();
  const reminderPermission = useReminderStatus((s) => s.permission);
  // One rule everywhere (Kid Mode, own phones): when the LOGGED-IN person is a
  // kid, their completion waits for a parent's OK. A parent tapping on a kid's
  // behalf is the parent doing it, so that stays instant.
  const needsParentOk = (task: { requiresApproval?: boolean }) => !!task.requiresApproval || !isParent;
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { colors, isDark, isChildMode, isTeenMode, fontSize } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastCompletedPoints, setLastCompletedPoints] = useState(0);
  const [pointBurstVisible, setPointBurstVisible] = useState(false);
  const [pointBurstKey, setPointBurstKey] = useState(0);
  const [weeklyPoints, setWeeklyPoints] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shields, setShields] = useState(0);
  const [showTour, setShowTour] = useState(false);
  const [lifetimePoints, setLifetimePoints] = useState(0);
  // Undo state — cleared after 5 seconds
  const [undoTask, setUndoTask] = useState<{ id: string; title: string; txId: string; completionId: string; points: number } | null>(null);
  // Optional missed-task penalty: daily tasks missed within the 2-day grace
  // window, catch-up-able to win the points back. Empty unless the feature is on.
  const [catchUpItems, setCatchUpItems] = useState<CatchUpItem[]>([]);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  // Guards against undoing the same completion twice (rapid taps, or toast+card
  // both firing) — the double-fire that produced phantom −pts. Keyed by completionId.
  const undoInFlightRef = useRef<Set<string>>(new Set());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the loading skeleton so it only shows on the FIRST load for a
  // profile — background reloads driven by the onSnapshot listeners must not
  // blank the task list into skeletons (that flicker read as the app
  // "constantly refreshing").
  const hasLoadedRef = useRef(false);

  const weekId = getCurrentWeekId();
  // Day N of 7 within the family's week (weekStartDay uses getDay(): 0=Sun,1=Mon).
  const weekProgress = (() => {
    const startDay = family?.weekStartDay ?? 1;
    const diff = ((new Date().getDay() - startDay) % 7 + 7) % 7;
    return { day: diff + 1, total: 7 };
  })();
  const dateString = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const todayStr = getTodayDateString();
  const twist = twistForWeek(weekStartKeyOf(todayStr, family?.weekStartDay ?? 1), family as any);
  const monthId = getCurrentMonthId();
  // The FAMILY week (its weekStartDay) — a weekly task done on any day of it is
  // done; also lists the stored week ids that overlap it (see completionMatch).
  const period = familyPeriod(new Date(), family?.weekStartDay ?? 1);
  const periodKey = `${period.weekIds.join(',')}|${period.monthId}|${period.todayStr}`;

  const loadTasks = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id) return;
    try {
      // Only show the full-screen skeleton on the very first load for this
      // profile. Listener-driven reloads refresh in place (no blank flash).
      if (!hasLoadedRef.current) setLoadingTasks(true);

      // Fetch tasks + every completion in the family week and this month
      // (single-field queries — no composite index needed).
      const [tasks, completions] = await Promise.all([
        getActiveTasks(family.id),
        getPeriodCompletions(family.id, period.weekIds, period.monthId),
      ]);

      // Recurrence-aware completion check (shared with Kid Mode — see
      // lib/completionMatch). No Firestore index required.
      const isCompleted = (taskId: string, recurrence: string) =>
        findCompletionForPeriod(completions, taskId, effectiveMember!.id, recurrence, period);

      // Join completions onto tasks — scoped to the active profile
      // When viewing another member's profile: show tasks assigned to them
      // When viewing own profile: show own tasks + unassigned (family/general) tasks
      const isViewingOther = effectiveMember.id !== member?.id;
      const now = new Date();
      const wsd = family?.weekStartDay ?? 1;
      const myTasks: TaskWithCompletion[] = tasks
        // Phase 5: hide tasks not due today (scheduledDays), and resolve the
        // rotation's current owner so a rotating chore shows for whoever's turn
        // it is right now (effectiveAssignee also handles fixed/array assignees).
        .filter((t) => isDueToday((t as any).scheduledDays, now))
        .filter((t) => {
          const owner = effectiveAssignee(t as any, now, wsd);
          if (owner == null) return !isViewingOther; // whole-family task
          return owner === effectiveMember.id;
        })
        .map((task) => {
          const c = isCompleted(task.id, task.recurrence);
          return { ...task, completion: c ? { id: c.id, wasAutoFailed: c.wasAutoFailed, pointsAwarded: c.pointsAwarded, completedDate: c.completedDate ?? dayKey(c.completedAt), completedAt: c.completedAt, status: c.status } : null };
        });

      // To-do first, then waiting for OK, then done — same order as Kid Mode,
      // so the next thing to do is always on top. (Stable: keeps task order within a group.)
      const rank = (t: TaskWithCompletion) => (!t.completion ? 0 : t.completion.status === 'pending' ? 1 : 2);
      myTasks.sort((a, b) => rank(a) - rank(b));
      setTodaysTasks(myTasks as any);

      // Phase 4.3: family-wide count of completions awaiting a parent's approval
      // (reuses the week's completions we already fetched → refreshes with the
      // same live listener). Only parents act on these.
      if (isParent) {
        setPendingApprovals(completions.filter((c) => c.status === 'pending').length);
      }

      // NOTE: weeklyPoints is intentionally NOT computed here. A dedicated
      // transactions onSnapshot listener (below) owns it and keeps it live with
      // the identical redemption-excluded sum. Re-querying it inside loadTasks
      // ran a full transactions read on every mount, snapshot tick, refresh and
      // undo for a value the listener already has — pure duplicate reads.
    } catch (error) {
      if (__DEV__) console.error('Failed to load tasks:', error);
    } finally {
      hasLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [family?.id, effectiveMember?.id, periodKey]);

  // Switching profiles should show the skeleton once for the new profile.
  useEffect(() => { hasLoadedRef.current = false; }, [effectiveMember?.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // First-run welcome tour — shown once for the account holder (not while acting
  // as a managed child). Persisted via AsyncStorage so it never repeats.
  useEffect(() => {
    if (!member?.id || actingAsMember) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem('lootboard_welcome_tour_v1');
        if (!cancelled && !seen) setShowTour(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [member?.id, actingAsMember]);

  // Explicit "replay walkthrough" request (Settings) — show regardless of the
  // one-time flag. tourNonce starts at 0, so this only fires on a real request.
  useEffect(() => {
    if (tourNonce > 0) setShowTour(true);
  }, [tourNonce]);

  const dismissTour = useCallback(() => {
    setShowTour(false);
    AsyncStorage.setItem('lootboard_welcome_tour_v1', '1').catch(() => {});
  }, []);

  // Streak — reads a BOUNDED 35-day completion window and recomputes when the
  // week's points move (a completion today can extend the streak). The window is
  // small and capped, so this stays cheap even long-term.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!family?.id || !effectiveMember?.id) return;
      try {
        const recent = await getRecentCompletions(family.id, effectiveMember.id, STREAK_WINDOW_DAYS);
        if (cancelled) return;
        const dates = recent
          .filter((c) => !c.wasAutoFailed && c.completedAt && (c as any).status !== 'rejected')
          .map((c) => c.completedAt!.toDate());
        // F2: shields cover a single missed day (same rule as the server bonus).
        const s = streakWithShields(activeDayKeys(dates), new Date(), family.weekStartDay ?? 1);
        setStreak(s.streak);
        setShields(s.shields);
      } catch (e) {
        if (__DEV__) console.error('streak load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [family?.id, effectiveMember?.id, weekId, weeklyPoints]);

  // ── Points, single source of truth ──────────────────────────────────────
  // ONE live listener over this member's transactions drives BOTH the spendable
  // bank (all-time earned − spent → the "Points to spend" hero, identical to the
  // Rewards vault) and earned-this-week (reward spends excluded → matches the
  // leaderboard). Computed via summarizeMemberPoints so every screen agrees.
  //
  // Deliberately a SINGLE-field query (memberId only): the previous weekly
  // listener filtered on memberId AND createdAt, which needs a composite index —
  // when that index is missing the listener silently dies (CLAUDE.md gotcha #2)
  // and the number survives only on optimistic local math, drifting high. A
  // single-field filter never needs an index, so this can't silently break.
  useEffect(() => {
    if (!family?.id || !effectiveMember?.id) return;
    const { start } = getCurrentWeekRange(family?.weekStartDay ?? 1);
    const unsub = Col.transactions(family.id)
      .where('memberId', '==', effectiveMember.id)
      .onSnapshot((snap) => {
        const txns = snap.docs.map((d) => {
          const data = d.data();
          return { delta: (data.delta as number) || 0, source: data.source as string, date: data.createdAt?.toDate?.() ?? null };
        });
        const { spendable, earnedThisWeek } = summarizeMemberPoints(txns, start);
        setLifetimePoints(spendable);
        setWeeklyPoints(earnedThisWeek);
      }, (err) => { if (__DEV__) console.error('points listener failed:', err); });
    return unsub;
  }, [family?.id, effectiveMember?.id, family?.weekStartDay, weekId]);

  // Missed-task penalty (optional): on profile/feature change, find daily tasks
  // missed within the grace window, lazily apply the half-point penalty for any
  // not yet penalized (idempotent), and surface the rest as catch-up-able. Kept
  // OFF the snapshot tick — it does writes — so it settles rather than loops.
  const penaltyMode = missedPenaltyMode(family);
  const syncCatchUp = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id || penaltyMode === 'off') {
      setCatchUpItems([]);
      return;
    }
    // Vacation/sick hold: while paused, apply no penalties and show no catch-up.
    if (penaltyPauseActive(family, effectiveMember)) {
      setCatchUpItems([]);
      return;
    }
    try {
      // Applies any pending miss penalties and returns what's still catch-up-able.
      const items = await syncMissedPenalties({ familyId: family.id, memberId: effectiveMember.id, mode: penaltyMode });
      setCatchUpItems(items);
    } catch (e) {
      if (__DEV__) console.error('catch-up sync failed:', e);
    }
  }, [family?.id, penaltyMode, effectiveMember?.id, family?.penaltyPausedUntil, effectiveMember?.penaltyPausedUntil]);

  useEffect(() => { syncCatchUp(); }, [syncCatchUp, weekId]);

  // Refresh the count when returning from the Catch-up screen.
  useFocusEffect(useCallback(() => { syncCatchUp(); }, [syncCatchUp]));

  // Live updates: subscribe to task + completion changes so new/edited tasks and
  // completions (by this member or others in the family) appear instantly without
  // a manual pull-to-refresh — mirrors the onSnapshot pattern used in leaderboard.tsx.
  useEffect(() => {
    if (!family?.id) return;
    const unsubTasks = Col.tasks(family.id)
      .where('isActive', '==', true)
      .onSnapshot(() => { loadTasks(); }, (err) => { if (__DEV__) console.error(err); });
    const unsubCompletions = Col.completions(family.id)
      .where('weekId', 'in', period.weekIds)
      .onSnapshot(() => { loadTasks(); }, (err) => { if (__DEV__) console.error(err); });
    return () => { unsubTasks(); unsubCompletions(); };
  }, [family?.id, periodKey, loadTasks]);

  // Members come from the shared family-wide listener in tabs/_layout.tsx
  // (Phase 4 read-min) — no per-focus getFamilyMembers refetch here.

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

  // Read-only when viewing another adult (non-managed) member
  const isReadOnly = !!actingAsMember && !actingAsMember.isManaged && actingAsMember.id !== member?.id;

  async function handleCompleteTask(task: TaskWithCompletion) {
    if (task.completion || !effectiveMember || !family) return;
    if (isReadOnly) return; // viewing another adult — no completing their tasks
    // No confirmation alert — one-tap UX with haptic feedback + undo toast
    await doCompleteTask(task);
  }

  // Phase 5 photo-proof: ask whether to snap or pick a photo, return its URI
  // (or null if cancelled). Android Alert caps at 3 buttons — exactly our count.
  function captureProofPhoto(): Promise<string | null> {
    return new Promise((resolve) => {
      Alert.alert('Add proof photo', 'Show it\'s done!', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: '📷 Take photo', onPress: async () => resolve(await pickPhotoUri('camera')) },
        { text: '🖼 Choose photo', onPress: async () => resolve(await pickPhotoUri('library')) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    });
  }

  async function doCompleteTask(task: TaskWithCompletion) {
    // Photo-proof tasks capture + upload a photo BEFORE the completion is written.
    // Cancelling the picker aborts the whole completion (no half state).
    let proofPhotoURL: string | undefined;
    if ((task as any).requiresPhoto) {
      const uri = await captureProofPhoto();
      if (!uri) return;
      setCompletingTaskId(task.id);
      try {
        proofPhotoURL = await uploadCompletionProof(uri, family!.id, effectiveMember!.id);
      } catch {
        setCompletingTaskId(null);
        Alert.alert('Photo not uploaded', 'Could not upload the photo. Please try again.');
        return;
      }
    }
    try {
      setCompletingTaskId(task.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Sounds.taskComplete();

      const tx = await fbCompleteTask({
        familyId: family!.id,
        taskId: task.id,
        memberId: effectiveMember!.id,   // points go to the active profile
        weekId,
        pointValue: task.pointValue,
        taskTitle: task.title,
        requiresApproval: needsParentOk(task),
        proofPhotoURL,
      });

      // An approval-required task — or ANY task a kid completes on their own
      // phone (same rule as Kid Mode) — is submitted, not awarded. No points
      // burst / undo toast / confetti; the card flips to "Awaiting approval"
      // and a parent settles the points (one-tap Approve all).
      if (needsParentOk(task)) {
        await loadTasks();
        return;
      }

      markTaskComplete(task.id, task.pointValue, tx.completionId);
      updateMemberPoints(effectiveMember!.id, task.pointValue);
      addTransaction(tx as any);

      setLastCompletedPoints(task.pointValue);
      // Optimistic bumps for instant feel. Safe from drift: the points listener
      // recomputes BOTH values absolutely from the full transaction snapshot on
      // the next tick, so it overwrites (never accumulates) these.
      setWeeklyPoints((p) => p + task.pointValue);
      setLifetimePoints((s) => s + task.pointValue);
      setPointBurstKey((k) => k + 1);
      setPointBurstVisible(true);
      setTimeout(() => setPointBurstVisible(false), 1200);

      // Show undo toast for 5 seconds
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoTask({ id: task.id, title: task.title, txId: tx.id, completionId: tx.completionId, points: task.pointValue });
      undoTimer.current = setTimeout(() => setUndoTask(null), 5000);

      const remaining = todaysTasks.filter((t: any) => !t.completion && t.id !== task.id);
      if (remaining.length === 0) {
        Sounds.allDone();
        // Celebratory haptic flourish for the "cleared the board" moment — a
        // success buzz followed by a heavier thump, distinct from a single tap.
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 140);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 300);
        if (!isTeenMode) setShowConfetti(true); // teen style: calmer, no burst
        setTimeout(() => { setShowConfetti(false); if (isChildMode) setShowCelebration(true); }, 2400);
        // G9: a happy moment — maybe ask the phone's grown-up for a rating.
        if (isParent && !actingAsMember && !isChildMode) setTimeout(() => maybeAskForReview(), 3000);
      }
      // Surprise packs (C8): a parent's completion may have finished the day.
      // The reveal itself plays from <SurprisePackReveal> when the pack lands.
      grantSurprisePacks(todayStr);
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('That didn’t work', 'Could not complete task. Please try again.');
    } finally {
      setCompletingTaskId(null);
    }
  }

  /** Parents only (kids' completions wait for approval; packs land then). */
  function grantSurprisePacks(dateKey: string) {
    if (!isParent || !family?.id || !effectiveMember) return;
    checkSurprisePacks({
      familyId: family.id,
      member: { id: effectiveMember.id, isManaged: (effectiveMember as any).isManaged },
      dateKey,
      weekStartDay: family.weekStartDay ?? 1,
    }).catch(() => {});
  }

  // Recover a task that was marked missed/auto-failed for today: reverses the
  // penalty and awards the points (via recoverFailedTask → CF). Lets a member
  // still earn a task they were penalized for, same day. The live transactions
  // listener updates the weekly total once the CF settles.
  async function handleRecoverTask(task: TaskWithCompletion) {
    if (!task.completion?.wasAutoFailed || !effectiveMember || !family || isReadOnly) return;
    try {
      setCompletingTaskId(task.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Sounds.taskComplete();
      await recoverFailedTask({
        familyId: family.id,
        taskId: task.id,
        memberId: effectiveMember.id,
        weekId,
        pointValue: task.pointValue,
        failedCompletionId: task.completion.id,
        requiresApproval: !isParent,
      });
      setLastCompletedPoints(task.pointValue);
      setPointBurstKey((k) => k + 1);
      setPointBurstVisible(true);
      setTimeout(() => setPointBurstVisible(false), 1200);
      await loadTasks();
      grantSurprisePacks(todayStr);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('That didn’t work', 'Could not update this task. Please try again.');
    } finally {
      setCompletingTaskId(null);
    }
  }

  // Shared undo used by BOTH the card "tap to undo" and the toast. Guarded against
  // double-fire, optimistically clears the card, and relies on the idempotent
  // undoTaskCompletion (which no-ops if the completion is already gone). Together
  // these kill the phantom-negative-points bug.
  async function performUndo(p: { taskId: string; completionId: string; points: number; title: string }) {
    if (!family || !effectiveMember) return;
    if (undoInFlightRef.current.has(p.completionId)) return;
    undoInFlightRef.current.add(p.completionId);
    // Optimistic: drop the completion locally so the card flips to incomplete
    // immediately and can't be re-undone while the write is in flight.
    setTodaysTasks((useTaskStore.getState().todaysTasks as any[]).map(
      (t) => t.id === p.taskId ? { ...t, completion: null } : t,
    ) as any);
    try {
      const res = await undoTaskCompletion({
        familyId: family.id,
        completionId: p.completionId,
        taskId: p.taskId,
        memberId: effectiveMember.id,
        pointsAwarded: p.points,
        taskTitle: p.title,
      });
      // Only adjust points if a completion was actually reversed — guards against
      // phantom-negative points when there was nothing live to undo.
      if (res.undone) {
        setWeeklyPoints((w) => w - res.pointsReversed);
        setLifetimePoints((s) => s - res.pointsReversed);
        updateMemberPoints(effectiveMember.id, -res.pointsReversed);
      }
      await loadTasks();
    } catch (e) {
      if (__DEV__) console.error('[Undo]', e);
      Alert.alert('That didn’t work', 'Could not undo this completion. Please try again.');
      await loadTasks(); // restore true state after a failed optimistic clear
    } finally {
      undoInFlightRef.current.delete(p.completionId);
    }
  }

  // Undo a completion from the task card itself (same-day only, by whoever completed it)
  function handleDeleteTask(task: TaskWithCompletion) {
    if (!family?.id) return;
    Alert.alert('Delete task?', `"${task.title}" will be removed from the list. Past history stays.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(family.id, task.id);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            loadTasks();
          } catch {
            Alert.alert('That didn’t work', 'Could not delete the task. Pull to refresh and try again.');
          }
        },
      },
    ]);
  }

  async function handleUndoTask(task: TaskWithCompletion) {
    if (!task.completion || isReadOnly || !family || !effectiveMember) return;
    if (task.completion.wasAutoFailed) return;
    // Derive "same day" straight from the completion timestamp (most authoritative —
    // the stored completedDate string should match, but comparing actual Date objects
    // sidesteps any string-format edge cases between when it was written vs now).
    const completedAtDate: Date | null = task.completion.completedAt?.toDate?.() ?? null;
    const now = new Date();
    const isSameDay = completedAtDate
      ? completedAtDate.getFullYear() === now.getFullYear()
        && completedAtDate.getMonth() === now.getMonth()
        && completedAtDate.getDate() === now.getDate()
      : true; // no timestamp on record — don't block, let the undo proceed
    if (!isSameDay) {
      Alert.alert('Can\'t Undo', 'Task completions can only be undone on the same day they were completed.');
      return;
    }
    Alert.alert('Undo this?', `Mark "${task.title}" as not done and remove the ${task.completion.pointsAwarded} points?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo', style: 'destructive', onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          await performUndo({
            taskId: task.id,
            completionId: task.completion!.id,
            points: task.completion!.pointsAwarded,
            title: task.title,
          });
        },
      },
    ]);
  }

  const completedCount = (todaysTasks as any[]).filter((t) => t.completion && !t.completion.wasAutoFailed).length;
  const totalCount = todaysTasks.length;
  const allDone = completedCount === totalCount && totalCount > 0;
  // E1 daily quest ring: progress toward today's surprise pack (approved only).
  const quest = questProgress(todaysTasks as any[]);
  // E2: the reward this profile is saving toward (live from the members cache).
  const savingForId = ((members as any[]).find((m) => m.id === effectiveMember?.id)?.savingForRewardId
    ?? (effectiveMember as any)?.savingForRewardId ?? null) as string | null;
  function celebrateAffordable() {
    setShowConfetti(true);
    Sounds.allDone();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => setShowConfetti(false), 2400);
  }
  // E3: level reads lifetime EARNED (reward spending excluded), app-wide store.
  const earnedPts = useMemberLevels((s) => s.earned[effectiveMember?.id ?? ''] ?? 0);
  const level = getLevel(earnedPts);

  const getMascotMood = (): 'celebrating' | 'happy' | 'waiting' => {
    if (allDone) return 'celebrating';
    if (completedCount > 0) return 'happy';
    return 'waiting';
  };
  const getMascotMessage = () => {
    const name = effectiveMember?.displayName?.split(' ')[0] ?? 'You';
    if (allDone) return `${actingAsMember ? name + ' is' : 'You\'re'} all done today! 🏆`;
    if (completedCount > 0) return `${completedCount} down, ${totalCount - completedCount} to go! 💪`;
    return `${totalCount} tasks today. Let's crush it! 🚀`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient colors={[colors.primary + '14', 'transparent']} style={styles.topWash} pointerEvents="none" />
      <Confetti visible={showConfetti} count={80} />
      <View style={styles.pointBurstContainer} pointerEvents="none">
        <PointBurst key={pointBurstKey} points={lastCompletedPoints} visible={pointBurstVisible} />
      </View>
      {/* Undo toast — shown for 5 seconds after task completion */}
      {undoTask && (
        <View style={[styles.undoToast, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="box-none">
          <Text style={[styles.undoText, { color: colors.text }]} numberOfLines={1}>
            ✅ <Text style={{ fontFamily: FontFamily.bold }}>{undoTask.title}</Text> done
          </Text>
          <TouchableOpacity
            style={[styles.undoBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!family?.id) return;
              clearTimeout(undoTimer.current!);
              const u = undoTask;
              setUndoTask(null);
              // Route through the same guarded, idempotent undo as the card. The
              // old path deleted the transaction directly, which the security
              // rules block (transactions are immutable) — so it silently failed.
              performUndo({ taskId: u.id, completionId: u.completionId, points: u.points, title: u.title });
            }}
            accessibilityLabel="Undo task completion"
            accessibilityRole="button"
          >
            <Text style={styles.undoBtnText}>↩ Undo</Text>
          </TouchableOpacity>
        </View>
      )}
      <CelebrationOverlay
        visible={showCelebration}
        memberName={effectiveMember?.displayName?.split(' ')[0] ?? 'Champion'}
        totalPoints={weeklyPoints}
        onDismiss={() => setShowCelebration(false)}
      />
      <WelcomeTour visible={showTour} role={member?.role} onClose={dismissTour} />
      <SurprisePackReveal familyId={family?.id} memberId={effectiveMember?.id} name={effectiveMember?.displayName?.split(' ')[0]} />
      {/* E3: plays once per device when this profile reaches a new level. */}
      <LevelUpReveal member={effectiveMember as any} perks={family?.levelPerks} />
      {/* Brand always sits on top, above the family profile switcher */}
      <BrandBar />
      {/* Profile strip: who we're looking at (parents switch here) + THAT
          profile's points and level on the right — replaces the big hero
          banner so today's tasks start near the top of the screen. */}
      <ProfileTabBar
        members={isParent && members.length > 1 ? members : []}
        self={member!}
        activeId={actingAsMember?.id ?? member?.id ?? ''}
        onSelect={(m) => {
          const { setActingAsMember } = useAuthStore.getState();
          setActingAsMember(m?.id === member?.id ? null : m);
        }}
        colors={colors}
        right={
          <TouchableOpacity
            style={[styles.scoreChip, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '33' }]}
            onPress={() => effectiveMember?.id && router.push(`/app/member/${effectiveMember.id}` as any)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${lifetimePoints} points to spend, level ${level.level} ${level.title}. Open profile`}
          >
            <Text style={[styles.scoreChipPts, { color: colors.textAccent }]}>{lifetimePoints}<Text style={[styles.scoreChipUnit, { color: colors.textSecondary }]}> pts</Text></Text>
            <Text style={[styles.scoreChipSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {level.emoji} Lv {level.level} · {weeklyPoints >= 0 ? '+' : ''}{weeklyPoints} wk
            </Text>
          </TouchableOpacity>
        }
      />
      {/* Family co-op goal — one thin line, always visible (Bet 3). */}
      <FamilyGoalBar />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        <SlideIn delay={0}>
          <View style={styles.header}>
            {quest.total > 0 && (
              <TouchableOpacity
                onPress={() => {
                  const e = questExplainer();
                  if (!quest.complete) { Alert.alert(e.title, e.body); return; }
                  // All dailies done → offer the "perfect day" share card.
                  const who = effectiveMember?.displayName?.split(' ')[0] ?? 'I';
                  Alert.alert('Perfect day 🎉', `Every daily task done — bonus chest earned.`, [
                    { text: 'Nice', style: 'cancel' },
                    { text: 'Share 🎉', onPress: () => setShareData({
                      icon: 'trophy', hero: '✅', theme: 'perfect', eyebrow: 'PERFECT DAY',
                      context: shareContext(),
                      title: `${who} finished every chore today!`,
                      subtitle: 'All daily tasks done → bonus chest unlocked.',
                      stats: [{ value: `${quest.total}/${quest.total}`, label: 'daily tasks' }, ...(streak > 0 ? [{ value: `${streak}`, label: 'day streak' }] : [])],
                      shareMessage: `${who} finished every chore today on Chore League! ✅`,
                    }) },
                  ]);
                }}
                accessibilityRole="button"
                accessibilityHint="Explains the bonus chest"
                hitSlop={6}
              >
                <DailyQuestRing progress={quest} />
              </TouchableOpacity>
            )}
            <View style={styles.headerLeft}>
              <Text numberOfLines={1} style={[styles.greeting, { color: colors.text, fontSize: fontSize(FontSize.xxl) }]}>
                {actingAsMember
                  ? `${effectiveMember?.displayName}'s tasks${isReadOnly ? ' 👁' : ''}`
                  : `Hey, ${member?.displayName?.split(' ')[0]}`}
              </Text>
              <Text numberOfLines={1} style={[styles.date, { color: quest.complete ? colors.textAccent : colors.textSecondary }]}>
                {questLabel(quest)}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {streak > 0 && <StreakFlame streak={streak} />}
              {shields > 0 && (
                <TouchableOpacity
                  style={[styles.shieldChip, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' }]}
                  onPress={() => Alert.alert(
                    `🛡 Streak shield${shields > 1 ? ` ×${shields}` : ''}`,
                    `A shield saves your streak if you miss a single day — it's used automatically.\n\nEarn one each week you're active on ${SHIELD_MIN_ACTIVE_DAYS}+ days (hold up to ${SHIELD_CAP}).`,
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`${shields} streak ${shields === 1 ? 'shield' : 'shields'}`}
                >
                  <EmojiIcon emoji="🛡" size={16} />
                  <Text style={[styles.shieldCount, { color: colors.textAccent }]}>{shields}</Text>
                </TouchableOpacity>
              )}
              {isParent && (
                <>
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: colors.primary }]}
                    onPress={() => router.push({ pathname: '/app/task/create' as any, params: actingAsMember ? { defaultAssignee: actingAsMember.id } : {} })}
                    accessibilityLabel="Create new task"
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Icon name="add" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: colors.danger + '18', borderWidth: 1.5, borderColor: colors.danger }]}
                    onPress={() => router.push({ pathname: '/app/discipline/log' as any, params: actingAsMember ? { memberId: actingAsMember.id } : {} })}
                    accessibilityLabel="Log a penalty"
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Icon name="warning" size={17} color={colors.danger} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </SlideIn>
        <SavingGoalRow
          familyId={family?.id}
          memberId={effectiveMember?.id}
          rewardId={savingForId}
          spendable={lifetimePoints}
          onAffordable={celebrateAffordable}
        />
        {/* Weekly twist + comeback boost (engagement, 2026-11-01) */}
        <TwistBanner memberId={effectiveMember?.id} dismissible showIntro style={styles.section} />
        {/* Kudos sticker from a grown-up (praise, never points) */}
        <KudosToast memberId={effectiveMember?.id} style={styles.section} />
        {isChildMode && (
          <SlideIn delay={100}>
            <View style={styles.mascotSection}>
              <Mascot mood={getMascotMood()} message={getMascotMessage()} />
            </View>
          </SlideIn>
        )}
        {isParent && pendingApprovals > 0 && (
          <View style={styles.section}>
            <SlideIn delay={120}>
              <TouchableOpacity
                style={[styles.catchUpCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '55' }]}
                onPress={() => router.push('/app/approvals' as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${pendingApprovals} completions awaiting approval`}
              >
                <Icon name="checkmark-done-circle-outline" size={22} color={colors.primary} />
                <Text style={[styles.catchUpTitle, { color: colors.text, flex: 1 }]}>
                  {pendingApprovals} {pendingApprovals === 1 ? 'claim' : 'claims'} waiting for your OK
                </Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </SlideIn>
          </View>
        )}

        {/* Reminders are always on — if the OS blocked notifications, say so
            here instead of failing silently (feedback: "I never get the reminder"). */}
        {reminderPermission === 'denied' && !actingAsMember && (
          <View style={styles.section}>
            <SlideIn delay={140}>
              <TouchableOpacity
                style={[styles.catchUpCard, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '4D' }]}
                onPress={() => router.push('/app/settings/notifications' as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Turn on reminders"
              >
                <Icon name="notifications-off-outline" size={22} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catchUpTitle, { color: colors.text }]}>Reminders can't reach you</Text>
                  <Text style={[styles.catchUpSub, { color: colors.textSecondary }]}>
                    Notifications are off for Chore League. Tap to turn them on.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </SlideIn>
          </View>
        )}

        <View style={styles.section}>
          {isLoadingTasks ? <LoadingSkeletons /> :
            todaysTasks.length === 0 ? (
              <SlideIn delay={250}>
                <EmptyState brandIcon="chest" title="No tasks today!" subtitle="Kick-start the week with a ready-made starter pack, or add your own." action={{ label: '📦 Browse starter packs', onPress: () => router.push('/app/task/packs' as any) }} />
                {isParent && (
                  <TouchableOpacity style={styles.emptyAltBtn} onPress={() => router.push('/app/task/create')} activeOpacity={0.7}>
                    <Text style={[styles.emptyAltBtnText, { color: colors.textAccent }]}>＋ Or create a single task</Text>
                  </TouchableOpacity>
                )}
              </SlideIn>
            ) : isChildMode ? (
              (todaysTasks as any[]).map((task, i) => (
                <ChildTaskCard key={task.id} task={task as any} onComplete={(t) => { handleCompleteTask(t as any); }} onUndo={(t: any) => handleUndoTask(t)} isCompleting={completingTaskId === task.id} index={i} />
              ))
            ) : (
              (todaysTasks as any[]).map((task, i) => {
                // The card must REMOUNT (not update in place) whenever it enters
                // or leaves a state the reanimated in-place update paints wrong —
                // approval status changes AND the failed↔done flip (feedback #9:
                // recovering a red-✗ task, or undoing that, left the row blank
                // until a tab switch). Normal todo↔done keeps a stable key, so
                // ordinary complete/undo still animate in place with no flicker.
                const cardKey = task.id
                  + (task.completion?.wasAutoFailed ? ':failed' : '')
                  + (task.completion?.status ? ':' + task.completion.status : '');
                return (
                  <SlideIn key={cardKey} delay={120 + i * 50}>
                    <AdultTaskCard twistChip={twistChipFor(twist, task as any, todayStr)} task={task} onComplete={handleCompleteTask} onUndo={handleUndoTask} onRecover={handleRecoverTask} onDelete={handleDeleteTask} isCompleting={completingTaskId === task.id} colors={colors} fontSize={fontSize} isReadOnly={isReadOnly} isParent={isParent} weekProgress={weekProgress} />
                  </SlideIn>
                );
              })
            )}
        </View>

        {/* G6: a feature skipped at setup, back one at a time from week 2 (parents). */}
        {isParent && !actingAsMember && <DiscoverCard style={styles.section} />}

        {/* G9: alone in the family? One gentle "better together" card (never with Discover). */}
        {isParent && !actingAsMember && !discoverCardToShow((family as any)?.discover) && <InviteNudge style={styles.section} />}

        {/* E4 bounties: "first to wash the car +100" — under today's tasks. */}
        <BountyBoard
          familyId={family?.id}
          actor={isReadOnly ? null : effectiveMember}
          viewerId={member?.id}
          canManage={isParent}
          needsOk={!isParent}
          members={members as any[]}
          style={styles.section}
        />

        {/* Secondary actions live BELOW the tasks as small side-by-side tiles,
            so they never push today's list off-screen. */}
        {(catchUpItems.length > 0 || (isParent && kidProfiles.length > 0)) && (
          <View style={[styles.section, styles.tileRow]}>
            {catchUpItems.length > 0 && (
              <TouchableOpacity
                style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/app/catch-up' as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${catchUpItems.length} tasks you can still catch up`}
              >
                <EmojiIcon emoji="⏰" size={26} />
                <Text style={[styles.tileTitle, { color: colors.text }]}>{catchUpItems.length} to catch up</Text>
                <Text style={[styles.tileSub, { color: colors.textSecondary }]}>Win the points back</Text>
              </TouchableOpacity>
            )}
            {isParent && kidProfiles.length > 0 && (() => {
              const selectedKid = actingAsMember && kidProfiles.find((k) => k.id === actingAsMember.id);
              const target = selectedKid ?? (kidProfiles.length === 1 ? kidProfiles[0] : null);
              return (
                <TouchableOpacity
                  style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    useKidMode.getState().enter((target ?? kidProfiles[0]).id);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    router.push('/app/kid-mode' as any);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Open Kid Mode"
                >
                  {target
                    ? <Avatar emoji={target.avatarEmoji} photoURL={target.photoURL} size={26} memberId={target.id} />
                    : <EmojiIcon emoji="👶" size={26} />}
                  <Text style={[styles.tileTitle, { color: colors.text }]} numberOfLines={1}>
                    Hand phone to {target ? (target.displayName ?? '').split(' ')[0] : 'a kid'}
                  </Text>
                  <Text style={[styles.tileSub, { color: colors.textSecondary }]}>Kid Mode</Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        )}
      </ScrollView>
      <ShareCardModal visible={!!shareData} data={shareData} onClose={() => setShareData(null)} />
    </SafeAreaView>
  );
}

function AdultTaskCard({ task, onComplete, onUndo, onRecover, onDelete, isCompleting, colors, fontSize, isReadOnly, isParent, streak, weekProgress, twistChip }: any) {
  // Phase 4.3: a completion awaiting parent approval — done-but-not-awarded.
  const isPending = task.completion?.status === 'pending';
  const isDone = !!task.completion && !task.completion.wasAutoFailed && !isPending;
  const isFailed = task.completion?.wasAutoFailed;
  const scale = useSharedValue(1);
  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [menuOpen, setMenuOpen] = useState(false);
  const canTapToUndo = isDone && !isReadOnly && !isCompleting;
  // A missed/auto-failed task can still be earned on the same day — tapping it
  // reverses the penalty and awards the points. (Feedback #1: the card used to
  // lock, leaving no way to mark it done.)
  const canRecover = isFailed && !isReadOnly && !isCompleting;
  const isDisabled = (isDone && !canTapToUndo) || (isFailed && !canRecover) || isPending || isCompleting || isReadOnly;
  const catColor = CATEGORY_COLORS[task.category] ?? colors.primary;
  const diffColor = task.difficulty === 'easy' ? colors.success : task.difficulty === 'medium' ? colors.warning : colors.danger;
  // Text on the pill uses the readable text tones (the fill/dot keep diffColor).
  const diffText = task.difficulty === 'easy' ? colors.textSuccess : task.difficulty === 'medium' ? colors.textWarning : colors.textDanger;

  function openEdit() {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openTaskEditor(task);
  }

  // Gamified recurrence pill — a live stat, not a grey label.
  const rec = task.recurrence;
  const recPill = rec === 'daily'
    ? { icon: '🔥', label: streak > 0 ? `${streak}` : 'Daily', color: colors.textWarning, tint: colors.warning }
    : rec === 'weekly'
    ? { icon: '📅', label: 'Weekly', color: colors.textAccent }
    : rec === 'monthly'
    ? { icon: '🗓️', label: 'Monthly', color: catColor }
    : { icon: '⚡', label: 'One-time', color: colors.info ?? catColor };

  return (
    <Animated.View style={cardAnim}>
      <Pressable
        android_disableSound
        style={[
          styles.taskCard,
          { backgroundColor: colors.surface },
          isDone && { backgroundColor: (colors.successLight ?? colors.surface) },
          isPending && { borderWidth: 1.5, borderColor: colors.warning, backgroundColor: (colors.warningLight ?? colors.surface) },
          // Missed-but-recoverable reads as 'still open' (amber), not a red failure.
          isFailed && { borderWidth: 1.5, borderColor: colors.warning, backgroundColor: colors.warning + '12' },
          isReadOnly && { opacity: 0.8 },
          Shadow.sm,
        ]}
        onPress={() => {
          if (isDisabled) return;
          if (isDone && canTapToUndo) onUndo?.(task);
          else if (canRecover) onRecover?.(task);
          else onComplete(task);
        }}
        onPressIn={() => { if (!isDisabled) scale.value = withSpring(0.97, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        // Long-press opens the parent action sheet (Edit / Delete) — keeps the
        // card face a clean tap-to-complete bar, no pencil or "tap to undo" text.
        onLongPress={() => { if (isParent && !isReadOnly) { Haptics.selectionAsync(); setMenuOpen(true); } }}
        accessibilityLabel={`${task.title}, ${task.difficulty}, ${task.pointValue} points, ${isDone ? (canTapToUndo ? 'completed, double tap to undo' : 'completed') : isFailed ? 'still open, tap to finish it' : 'tap to complete'}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, checked: isDone }}
      >
        <View style={styles.taskContent}>
          <View style={[styles.taskEmojiBubble, { backgroundColor: catColor + '22' }]}>
            <EmojiIcon emoji={resolveTaskEmoji(task)} size={30} />
          </View>
          <View style={styles.taskInfo}>
            <Text numberOfLines={1} style={[styles.taskTitle, { color: colors.text, fontSize: fontSize(FontSize.md) }, isDone && { opacity: 0.55, textDecorationLine: 'line-through' }]}>{task.title}</Text>
            <View style={styles.taskMeta}>
              <View style={[styles.diffPill, { backgroundColor: diffColor + '20' }]}>
                <View style={[styles.diffDot, { backgroundColor: diffColor }]} />
                <Text style={[styles.diffPillText, { color: diffText }]}>{task.difficulty}</Text>
              </View>
              <View style={[styles.recPill, { backgroundColor: ((recPill as any).tint ?? recPill.color) + '1F' }]}>
                <Text style={styles.recPillIcon}>{recPill.icon}</Text>
                <Text style={[styles.recPillText, { color: recPill.color }]}>{recPill.label}</Text>
              </View>
              {twistChip && !isDone ? (
                <View style={[styles.recPill, { backgroundColor: colors.primary + '1F' }]} accessibilityLabel={`Weekly twist: ${twistChip} points`}>
                  <Text style={styles.recPillIcon}>🎲</Text>
                  <Text style={[styles.recPillText, { color: colors.textAccent }]}>{twistChip}</Text>
                </View>
              ) : null}
              {task.rotation?.memberIds?.length ? (
                <View style={[styles.recPill, { backgroundColor: colors.accent + '1F' }]}>
                  <Text style={styles.recPillIcon}>🔄</Text>
                  <Text style={[styles.recPillText, { color: colors.accent }]}>Your turn</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.taskRight}>
            {isCompleting ? <ActivityIndicator color={colors.primary} size="small" /> :
              isDone ? <View style={[styles.statusIcon, { backgroundColor: colors.success }, Shadow.sm]}><Text style={styles.statusIconText}>✓</Text></View> :
              isPending ? <View style={[styles.pendingPill, { backgroundColor: colors.warning + '22', borderColor: colors.warning }]}><Text style={[styles.pendingPillText, { color: colors.textWarning }]}>⏳ Pending</Text></View> :
              isFailed ? <View style={[styles.statusIcon, { backgroundColor: colors.warning }]}><Text style={styles.statusIconText}>↻</Text></View> :
              isReadOnly ? <View style={[styles.statusIcon, { backgroundColor: colors.border }]}><Text style={{ fontSize: 16 }}>👁</Text></View> :
              <View style={[styles.rewardChip, { backgroundColor: colors.primary }, Shadow.sm]}>
                <Text style={styles.rewardChipText}>+{task.pointValue}</Text>
                <Text style={styles.rewardChipUnit}>pts</Text>
              </View>
            }
          </View>
        </View>
      </Pressable>

      {/* Task actions sheet (Edit / Delete) — opened by the ✏️ button */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={taskMenuStyles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={[taskMenuStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={taskMenuStyles.handle} />
            <Text style={[taskMenuStyles.title, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
            <TouchableOpacity style={taskMenuStyles.row} onPress={openEdit}>
              <Text style={taskMenuStyles.rowIcon}>✏️</Text>
              <Text style={[taskMenuStyles.rowText, { color: colors.text }]}>Edit task</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={taskMenuStyles.row}
              onPress={() => { setMenuOpen(false); onDelete?.(task); }}
            >
              <Text style={taskMenuStyles.rowIcon}>🗑️</Text>
              <Text style={[taskMenuStyles.rowText, { color: colors.textDanger }]}>Delete task</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[taskMenuStyles.row, taskMenuStyles.cancelRow, { borderTopColor: colors.border }]} onPress={() => setMenuOpen(false)}>
              <Text style={[taskMenuStyles.rowText, { color: colors.textSecondary, textAlign: 'center', width: '100%' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const taskMenuStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.md, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#00000022', alignSelf: 'center', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, textAlign: 'center', marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 15, paddingHorizontal: Spacing.md },
  rowIcon: { fontSize: 20 },
  rowText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  cancelRow: { borderTopWidth: 1, marginTop: 6, justifyContent: 'center' },
});

// ── Profile tab bar — shown for any parent when there are other members ──────
function ProfileTabBar({ members, self, activeId, onSelect, colors, right }: {
  members: any[];
  self: any;
  activeId: string;
  onSelect: (m: any) => void;
  colors: any;
  /** Pinned on the right of the strip — the active profile's score chip. */
  right?: React.ReactNode;
}) {
  // Show self first, then all other members
  const allProfiles = [self, ...members.filter((m) => m.id !== self.id)];
  return (
    <View style={[ptStyles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ptStyles.scroll} style={{ flex: 1 }}>
        {allProfiles.map((p) => {
          const active = p.id === activeId;
          const isOtherAdult = p.id !== self.id && !p.isManaged;
          return (
            <TouchableOpacity
              key={p.id}
              style={[ptStyles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              onPress={() => onSelect(p)}
              activeOpacity={0.7}
              accessibilityLabel={p.id === self.id ? 'View my tasks' : `View ${p.displayName}'s tasks${isOtherAdult ? ' (read-only)' : ''}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Avatar emoji={p.avatarEmoji} photoURL={(p as any).photoURL} size={32} memberId={p.id} />
              <Text style={[ptStyles.name, { color: active ? colors.primary : colors.textSecondary }]}>
                {p.id === self.id ? 'Me' : p.displayName.split(' ')[0]}
              </Text>
              {isOtherAdult && (
                <Text style={[ptStyles.viewBadge, { color: colors.textMuted }]}>👁</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {right ? <View style={ptStyles.right}>{right}</View> : null}
    </View>
  );
}
const ptStyles = StyleSheet.create({
  bar: { borderBottomWidth: 1, paddingTop: 4, flexDirection: 'row', alignItems: 'center' },
  right: { paddingRight: Spacing.md, paddingLeft: Spacing.xs, paddingBottom: 4 },
  scroll: { paddingHorizontal: Spacing.md, gap: 4 },
  tab: { alignItems: 'center', paddingHorizontal: Spacing.sm, paddingBottom: 8, paddingTop: 4, minWidth: 56, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  avatar: { fontSize: 26 },
  name: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, marginTop: 2 },
  viewBadge: { fontSize: 10, marginTop: 1 },
});

function LoadingSkeletons() {
  return (
    <View style={{ gap: Spacing.sm }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.taskCard, { backgroundColor: '#FFF', overflow: 'hidden' }, Shadow.sm]}>
          <View style={{ flexDirection: 'row', padding: Spacing.md, alignItems: 'center', gap: Spacing.sm }}>
            <ShimmerBox width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 8 }}><ShimmerBox width="80%" height={16} borderRadius={4} /><ShimmerBox width="50%" height={12} borderRadius={4} /></View>
            <ShimmerBox width={52} height={44} borderRadius={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  pointBurstContainer: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  brandRow: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 2 },
  actionPill: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, ...Shadow.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  shieldChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 3 },
  shieldCount: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  greeting: { fontFamily: FontFamily.extraBold },
  date: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 2 },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...Shadow.md },
  addButtonText: { fontSize: FontSize.xl, color: '#FFFFFF', lineHeight: 26 },
  penaltyButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  penaltyButtonText: { fontSize: 20, lineHeight: 24 },
  mascotSection: { alignItems: 'center', paddingVertical: Spacing.md },
  // Hero card — unified gradient stats panel
  hero: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.sm, borderRadius: BorderRadius.xl ?? BorderRadius.lg, padding: Spacing.md },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroPointsBlock: { flex: 1 },
  heroPointsRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroPointsNum: { fontFamily: FontFamily.black ?? FontFamily.extraBold, fontSize: 34, color: '#FFFFFF', lineHeight: 38 },
  heroPointsUnit: { fontFamily: FontFamily.extraBold, fontSize: FontSize.lg, color: 'rgba(255,255,255,0.85)', marginLeft: 6 },
  heroPointsLabel: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: -2 },
  heroPointsSub: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  heroTodayChip: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 66 },
  heroTodayNum: { fontFamily: FontFamily.extraBold, fontSize: FontSize.xl, color: '#FFFFFF' },
  heroTodayLabel: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  heroBarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  heroBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' },
  heroBarFill: { height: '100%', borderRadius: 4 },
  heroBarPct: { fontFamily: FontFamily.extraBold, fontSize: FontSize.xs, color: '#FFFFFF', minWidth: 34, textAlign: 'right' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: Spacing.sm },
  heroLevelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heroLevelEmoji: { fontSize: 26 },
  heroLevelInfo: { flex: 1 },
  heroLevelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  heroLevelTitle: { fontFamily: FontFamily.extraBold, fontSize: FontSize.sm, color: '#FFFFFF', flexShrink: 1 },
  heroLevelNext: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginLeft: Spacing.sm },
  heroLevelTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' },
  heroLevelFill: { height: '100%', borderRadius: 3 },
  progressBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.2)' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  section: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  emptyAltBtn: { alignItems: 'center', paddingVertical: Spacing.sm, marginTop: -Spacing.sm },
  emptyAltBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  taskCard: { borderRadius: 20, marginBottom: Spacing.sm, flexDirection: 'row', overflow: 'hidden' },
  taskContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md },
  taskEmojiBubble: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  taskEmoji: { fontSize: 26 },
  taskInfo: { flex: 1 },
  taskTitle: { fontFamily: FontFamily.extraBold },
  taskMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  diffPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  diffPillText: { fontSize: FontSize.xs, fontFamily: FontFamily.extraBold, textTransform: 'capitalize' },
  recPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 3, borderRadius: BorderRadius.full },
  recPillIcon: { fontSize: 11 },
  recPillText: { fontSize: 11, fontFamily: FontFamily.extraBold },
  taskRight: { marginLeft: Spacing.sm, alignItems: 'center', minWidth: 56 },
  rewardChip: { borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center', minWidth: 52 },
  rewardChipText: { fontFamily: FontFamily.black, fontSize: FontSize.md, color: '#FFFFFF', lineHeight: 20 },
  rewardChipUnit: { fontSize: 9, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.9)', marginTop: -2 },
  statusIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  statusIconText: { fontSize: FontSize.lg, color: '#FFFFFF', fontFamily: FontFamily.black },
  pendingPill: { borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pendingPillText: { fontFamily: FontFamily.bold, fontSize: FontSize.xs },
  // Undo toast
  undoToast: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: Spacing.sm, borderWidth: 1, zIndex: 200, ...Shadow.md },
  undoText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  undoBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, marginLeft: Spacing.sm },
  undoBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: '#FFF' },
  // Missed-task catch-up card
  catchUpCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.md },
  scoreChip: { borderRadius: BorderRadius.lg, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'flex-end', minWidth: 92 },
  scoreChipPts: { fontSize: FontSize.lg, fontFamily: FontFamily.black ?? FontFamily.extraBold, lineHeight: 22 },
  scoreChipUnit: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  scoreChipSub: { fontSize: 11, fontFamily: FontFamily.bold },
  tileRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.xl },
  tile: { flex: 1, borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, gap: 4 },
  tileTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, marginTop: 4 },
  tileSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold },
  catchUpTitle: { fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
  catchUpSub: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, marginTop: 2 },
  // Today's Tasks section header
  tasksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, marginTop: Spacing.xs },
  tasksHeaderTitle: { fontFamily: FontFamily.black, fontSize: FontSize.xl },
  tasksCountChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: BorderRadius.full },
  tasksCountText: { fontFamily: FontFamily.extraBold, fontSize: FontSize.xs },
  // Action hint — anchored BOTTOM-RIGHT: the emptiest corner of the card. Clear
  // of the right-side +pts chip / ✓ / ✗ (which are vertically centred) AND clear
  // of the title + difficulty/recurrence pills on the left (feedback #5 — the
  // hint used to sit behind the chip; top-left then clipped the title's 1st char).
  editHint: { position: 'absolute', bottom: 3, right: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, zIndex: 5 },
  editHintText: { fontSize: 9.5, fontFamily: FontFamily.semiBold },
  editBtn: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', zIndex: 6 },
  editBtnText: { fontSize: 14 },
});

