import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Sounds } from '@/lib/sounds';
import { router, useFocusEffect } from 'expo-router';
import { firestore } from '@/lib/fb';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, withDelay, interpolateColor } from 'react-native-reanimated';
import { useAuthStore, useTaskStore, useFamilyStore, usePointsStore } from '@/store';
import {
  getActiveTasks, getWeekCompletions, completeTask as fbCompleteTask,
  undoTaskCompletion,
  getCurrentWeekId, getTodayDateString, getCurrentMonthId,
  Col, getFamilyMembers, deleteTask, getRecentCompletions,
  syncMissedPenalties, missedPenaltyMode, type CatchUpItem,
} from '@/lib/firebase';
import { getCurrentWeekRange, dailyStreak, getLevel } from '@/lib/pointsEngine';
import { detectTaskEmoji } from '@/lib/taskEmoji';
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
  const { member, family, actingAsMember } = useAuthStore();
  // effectiveMember = who we're doing tasks for (self or a managed child)
  const effectiveMember = actingAsMember ?? member;
  const { todaysTasks, setTodaysTasks, isLoadingTasks, setLoadingTasks, markTaskComplete } = useTaskStore();
  const { updateMemberPoints, members, setMembers } = useFamilyStore();
  const { addTransaction } = usePointsStore();
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { colors, isDark, isChildMode, fontSize } = useTheme();

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
  const [showTour, setShowTour] = useState(false);
  const [lifetimePoints, setLifetimePoints] = useState(0);
  // Undo state — cleared after 5 seconds
  const [undoTask, setUndoTask] = useState<{ id: string; title: string; txId: string; completionId: string; points: number } | null>(null);
  // Optional missed-task penalty: daily tasks missed within the 2-day grace
  // window, catch-up-able to win the points back. Empty unless the feature is on.
  const [catchUpItems, setCatchUpItems] = useState<CatchUpItem[]>([]);
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
  const dateString = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const todayStr = getTodayDateString();
  const monthId = getCurrentMonthId();

  const loadTasks = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id) return;
    try {
      // Only show the full-screen skeleton on the very first load for this
      // profile. Listener-driven reloads refresh in place (no blank flash).
      if (!hasLoadedRef.current) setLoadingTasks(true);

      // Fetch tasks + this week's completions.
      // getWeekCompletions uses a single .where('weekId') — no composite index needed.
      const [tasks, completions] = await Promise.all([
        getActiveTasks(family.id),
        getWeekCompletions(family.id, weekId),
      ]);

      // Recurrence-aware completion check — no Firestore index required.
      //
      // KEY: use filter() not find(). A daily task completed yesterday AND today
      // will have TWO completions in the week. find() could return yesterday's,
      // which fails the "was it today?" check and wrongly marks the task incomplete.
      // filter() lets us check if ANY completion satisfies the recurrence window.
      function dateStr(ts: any): string | null {
        const d = ts?.toDate?.();
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      function monthStr(ts: any): string | null {
        const d = ts?.toDate?.();
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }

      function isCompleted(taskId: string, recurrence: string) {
        // All completions for this task + this member this week.
        // Phase 4.3: a REJECTED completion doesn't count as done — the task
        // returns to incomplete so it can be redone.
        const all = completions.filter(
          (c) => c.taskId === taskId && c.memberId === effectiveMember!.id && c.status !== 'rejected',
        );
        if (all.length === 0) return null;

        if (recurrence === 'daily') {
          // Was there ANY completion today?
          return all.find((c) =>
            c.completedDate ? c.completedDate === todayStr : dateStr(c.completedAt) === todayStr,
          ) ?? null;
        }

        if (recurrence === 'weekly') {
          return all.find((c) => c.weekId === weekId) ?? null;
        }

        if (recurrence === 'monthly') {
          return all.find((c) =>
            c.monthId ? c.monthId === monthId : monthStr(c.completedAt) === monthId,
          ) ?? null;
        }

        // 'once' or custom — any completion at all = done
        return all[0];
      }

      // Join completions onto tasks — scoped to the active profile
      // When viewing another member's profile: show tasks assigned to them
      // When viewing own profile: show own tasks + unassigned (family/general) tasks
      const isViewingOther = effectiveMember.id !== member?.id;
      const myTasks: TaskWithCompletion[] = tasks
        .filter((t) => {
          if (!t.assignedTo) {
            return !isViewingOther;
          }
          if (Array.isArray(t.assignedTo)) return (t.assignedTo as string[]).includes(effectiveMember.id);
          return t.assignedTo === effectiveMember.id;
        })
        .map((task) => {
          const c = isCompleted(task.id, task.recurrence);
          return { ...task, completion: c ? { id: c.id, wasAutoFailed: c.wasAutoFailed, pointsAwarded: c.pointsAwarded, completedDate: c.completedDate ?? dateStr(c.completedAt), completedAt: c.completedAt, status: c.status } : null };
        });

      setTodaysTasks(myTasks as any);

      // Phase 4.3: family-wide count of completions awaiting a parent's approval
      // (reuses the week's completions we already fetched → refreshes with the
      // same live listener). Only parents act on these.
      if (isParent) {
        setPendingApprovals(completions.filter((c) => c.status === 'pending').length);
      }

      // Weekly points for the active profile.
      // Use getCurrentWeekRange with family's chosen weekStartDay (not hardcoded Monday).
      // Use firestore.Timestamp.fromDate() — not { toDate: () => weekStart } which breaks.
      const { start: weekStart } = getCurrentWeekRange(family?.weekStartDay ?? 1);
      const txSnap = await Col.transactions(family.id)
        .where('memberId', '==', effectiveMember.id)
        .where('createdAt', '>=', firestore.Timestamp.fromDate(weekStart))
        .get();
      const wpts = txSnap.docs
        .filter((d) => d.data().source !== 'redemption')  // exclude reward spends from earned total
        .reduce((sum, d) => sum + (d.data().delta as number), 0);
      setWeeklyPoints(wpts);
    } catch (error) {
      if (__DEV__) console.error('Failed to load tasks:', error);
    } finally {
      hasLoadedRef.current = true;
      setLoadingTasks(false);
    }
  }, [family?.id, effectiveMember?.id, weekId]);

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

  const dismissTour = useCallback(() => {
    setShowTour(false);
    AsyncStorage.setItem('lootboard_welcome_tour_v1', '1').catch(() => {});
  }, []);

  // Streak + lifetime level — fetched on profile/week change only (NOT on every
  // snapshot tick), so the live listeners stay cheap and flicker-free. Streak
  // reads a 35-day completion window; level reads the member's lifetime points.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!family?.id || !effectiveMember?.id) return;
      try {
        const [recent, txSnap] = await Promise.all([
          getRecentCompletions(family.id, effectiveMember.id, 35),
          Col.transactions(family.id).where('memberId', '==', effectiveMember.id).get(),
        ]);
        if (cancelled) return;
        const dates = recent
          .filter((c) => !c.wasAutoFailed && c.completedAt)
          .map((c) => c.completedAt!.toDate());
        setStreak(dailyStreak(dates));
        const lifetime = txSnap.docs.reduce((sum, d) => sum + ((d.data().delta as number) || 0), 0);
        setLifetimePoints(lifetime);
      } catch (e) {
        if (__DEV__) console.error('streak/level load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [family?.id, effectiveMember?.id, weekId, weeklyPoints]);

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
    try {
      // Applies any pending miss penalties and returns what's still catch-up-able.
      const items = await syncMissedPenalties({ familyId: family.id, memberId: effectiveMember.id, mode: penaltyMode });
      setCatchUpItems(items);
    } catch (e) {
      if (__DEV__) console.error('catch-up sync failed:', e);
    }
  }, [family?.id, penaltyMode, effectiveMember?.id]);

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
      .where('weekId', '==', weekId)
      .onSnapshot(() => { loadTasks(); }, (err) => { if (__DEV__) console.error(err); });
    return () => { unsubTasks(); unsubCompletions(); };
  }, [family?.id, weekId, loadTasks]);

  // Live weekly total for the active profile. The onCompletionCreated/Updated
  // Cloud Functions settle points ASYNCHRONOUSLY (e.g. after a parent approves),
  // and that transaction write doesn't trip the tasks/completions listeners — so
  // without this the hero "N pts this week" stays stale until the next reload.
  useEffect(() => {
    if (!family?.id || !effectiveMember?.id) return;
    const { start } = getCurrentWeekRange(family?.weekStartDay ?? 1);
    const unsub = Col.transactions(family.id)
      .where('memberId', '==', effectiveMember.id)
      .where('createdAt', '>=', firestore.Timestamp.fromDate(start))
      .onSnapshot((snap) => {
        const wpts = snap.docs
          .filter((d) => d.data().source !== 'redemption')
          .reduce((sum, d) => sum + ((d.data().delta as number) || 0), 0);
        setWeeklyPoints(wpts);
      }, (err) => { if (__DEV__) console.error(err); });
    return unsub;
  }, [family?.id, effectiveMember?.id, family?.weekStartDay]);

  // Always reload members when home screen is focused — ensures profile tabs appear immediately
  useFocusEffect(useCallback(() => {
    if (family?.id) {
      getFamilyMembers(family.id).then((list) => setMembers(list as any)).catch(() => {});
    }
  }, [family?.id]));

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

  async function doCompleteTask(task: TaskWithCompletion) {
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
        requiresApproval: task.requiresApproval,
      });

      // Phase 4.3: an approval-required task is submitted, not awarded. No points
      // burst / undo toast / confetti — the card flips to "Awaiting approval" and
      // a parent settles the points from the approval queue.
      if (task.requiresApproval) {
        await loadTasks();
        return;
      }

      markTaskComplete(task.id, task.pointValue, tx.completionId);
      updateMemberPoints(effectiveMember!.id, task.pointValue);
      addTransaction(tx as any);

      setLastCompletedPoints(task.pointValue);
      setWeeklyPoints((p) => p + task.pointValue);
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
        setShowConfetti(true);
        setTimeout(() => { setShowConfetti(false); if (isChildMode) setShowCelebration(true); }, 2400);
      }
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Could not complete task. Please try again.');
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
        updateMemberPoints(effectiveMember.id, -res.pointsReversed);
      }
      await loadTasks();
    } catch (e) {
      if (__DEV__) console.error('[Undo]', e);
      Alert.alert('Error', 'Could not undo this completion. Please try again.');
      await loadTasks(); // restore true state after a failed optimistic clear
    } finally {
      undoInFlightRef.current.delete(p.completionId);
    }
  }

  // Undo a completion from the task card itself (same-day only, by whoever completed it)
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
    Alert.alert('Undo Completion?', `Mark "${task.title}" as not done and remove the ${task.completion.pointsAwarded} points?`, [
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
  const progressPct = totalCount > 0 ? completedCount / totalCount : 0;
  const level = getLevel(lifetimePoints);

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
      {/* Brand always sits on top, above the family profile switcher */}
      <BrandBar />
      {/* Profile tabs — visible to parents when family has other members */}
      {isParent && members.length > 1 && (
        <ProfileTabBar
          members={members}
          self={member!}
          activeId={actingAsMember?.id ?? member?.id ?? ''}
          onSelect={(m) => {
            const { setActingAsMember } = useAuthStore.getState();
            setActingAsMember(m?.id === member?.id ? null : m);
          }}
          colors={colors}
        />
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        <SlideIn delay={0}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text numberOfLines={1} style={[styles.greeting, { color: colors.text, fontSize: fontSize(FontSize.xxl) }]}>
                {actingAsMember
                  ? `${effectiveMember?.avatarEmoji} ${effectiveMember?.displayName}'s tasks${isReadOnly ? ' 👁' : ''}`
                  : `Hey, ${member?.displayName?.split(' ')[0]} ${member?.avatarEmoji}`}
              </Text>
              <Text style={[styles.date, { color: colors.textSecondary }]}>
                {allDone ? "All done — you're crushing it! 🎉" : totalCount > 0 ? `${completedCount} of ${totalCount} done today` : "Let's make today count 💪"}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {streak > 0 && <StreakFlame streak={streak} />}
              {isParent && (
                <>
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: colors.primary }]}
                    onPress={() => router.push({ pathname: '/app/task/create' as any, params: actingAsMember ? { defaultAssignee: actingAsMember.id } : {} })}
                    accessibilityLabel="Create new task"
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Icon name="add-circle" size={15} color="#FFFFFF" />
                    <Text style={styles.actionPillText}>Task</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: colors.danger + '18', borderWidth: 1.5, borderColor: colors.danger }]}
                    onPress={() => router.push({ pathname: '/app/discipline/log' as any, params: actingAsMember ? { memberId: actingAsMember.id } : {} })}
                    accessibilityLabel="Log a penalty"
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Icon name="warning" size={15} color={colors.danger} />
                    <Text style={[styles.actionPillText, { color: colors.danger }]}>Penalty</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </SlideIn>
        {isChildMode && (
          <SlideIn delay={100}>
            <View style={styles.mascotSection}>
              <Mascot mood={getMascotMood()} message={getMascotMessage()} />
            </View>
          </SlideIn>
        )}
        <SlideIn delay={130}>
          <StatsHero
            level={level}
            weeklyPoints={weeklyPoints}
            completedCount={completedCount}
            totalCount={totalCount}
            progressPct={progressPct}
            allDone={allDone}
          />
        </SlideIn>

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
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catchUpTitle, { color: colors.text }]}>
                    {pendingApprovals} {pendingApprovals === 1 ? 'task' : 'tasks'} awaiting your approval
                  </Text>
                  <Text style={[styles.catchUpSub, { color: colors.textSecondary }]}>
                    Review and approve to award the points.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </SlideIn>
          </View>
        )}

        {catchUpItems.length > 0 && (
          <View style={styles.section}>
            <SlideIn delay={150}>
              <TouchableOpacity
                style={[styles.catchUpCard, { backgroundColor: colors.warning + '14', borderColor: colors.warning + '55' }]}
                onPress={() => router.push('/app/catch-up' as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Catch up ${catchUpItems.length} missed tasks`}
              >
                <Icon name="time-outline" size={22} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catchUpTitle, { color: colors.text }]}>
                    Catch up {catchUpItems.length} missed {catchUpItems.length === 1 ? 'task' : 'tasks'}
                  </Text>
                  <Text style={[styles.catchUpSub, { color: colors.textSecondary }]}>
                    Mark them done within 2 days to win the points back.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </SlideIn>
          </View>
        )}

        <View style={styles.section}>
          <SlideIn delay={200}>
            <View style={styles.tasksHeader}>
              <Text style={[styles.tasksHeaderTitle, { color: colors.text }]}>Today's Tasks</Text>
              {totalCount > 0 && (
                <View style={[styles.tasksCountChip, { backgroundColor: allDone ? colors.success : colors.primary + '18' }]}>
                  <Text style={[styles.tasksCountText, { color: allDone ? '#FFFFFF' : colors.primary }]}>
                    {allDone ? '🎉 all done' : `${completedCount}/${totalCount} done`}
                  </Text>
                </View>
              )}
            </View>
          </SlideIn>
          {isLoadingTasks ? <LoadingSkeletons /> :
            todaysTasks.length === 0 ? (
              <SlideIn delay={250}>
                <EmptyState emoji="🌟" title="No tasks today!" subtitle="Kick-start the week with a ready-made starter pack, or add your own." action={{ label: '📦 Browse starter packs', onPress: () => router.push('/app/task/packs' as any) }} />
                {isParent && (
                  <TouchableOpacity style={styles.emptyAltBtn} onPress={() => router.push('/app/task/create')} activeOpacity={0.7}>
                    <Text style={[styles.emptyAltBtnText, { color: colors.primary }]}>＋ Or create a single task</Text>
                  </TouchableOpacity>
                )}
              </SlideIn>
            ) : isChildMode ? (
              (todaysTasks as any[]).map((task, i) => (
                <ChildTaskCard key={task.id} task={task as any} onComplete={(t) => { handleCompleteTask(t as any); }} onUndo={(t: any) => handleUndoTask(t)} isCompleting={completingTaskId === task.id} index={i} />
              ))
            ) : (
              (todaysTasks as any[]).map((task, i) => (
                // Include the approval status in the key so a card cleanly
                // REMOUNTS when a completion transitions pending→approved/rejected
                // (returning from the Approvals screen) — otherwise the in-place
                // reanimated update can leave the card content unpainted. Normal
                // tasks (no status) keep a stable key, so complete/undo still
                // animate in place with no flicker.
                <SlideIn key={task.id + (task.completion?.status ? ':' + task.completion.status : '')} delay={250 + i * 60}>
                  <AdultTaskCard task={task} onComplete={handleCompleteTask} onUndo={handleUndoTask} isCompleting={completingTaskId === task.id} colors={colors} fontSize={fontSize} isReadOnly={isReadOnly} isParent={isParent} />
                </SlideIn>
              ))
            )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AnimatedProgressBar({ progress, color }: { progress: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => { width.value = withTiming(progress * 100, { duration: 800 }); }, [progress]);
  const animStyle = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return <View style={styles.progressBarBg}><Animated.View style={[styles.progressBarFill, { backgroundColor: color }, animStyle]} /></View>;
}

// ── Hero card — one cohesive gradient panel fusing points, level, and today's ──
// progress. Replaces the two flat stacked cards for a designed, branded anchor.
function StatsHero({ level, weeklyPoints, completedCount, totalCount, progressPct, allDone }: {
  level: { level: number; title: string; emoji: string; progress: number; next: number | null };
  weeklyPoints: number;
  completedCount: number;
  totalCount: number;
  progressPct: number;
  allDone: boolean;
}) {
  const levelWidth = useSharedValue(0);
  const taskWidth = useSharedValue(0);
  useEffect(() => { levelWidth.value = withTiming(Math.round(level.progress * 100), { duration: 800 }); }, [level.progress]);
  useEffect(() => { taskWidth.value = withTiming(Math.round(progressPct * 100), { duration: 800 }); }, [progressPct]);
  const levelBarStyle = useAnimatedStyle(() => ({ width: `${levelWidth.value}%` as any }));
  const taskBarStyle = useAnimatedStyle(() => ({ width: `${taskWidth.value}%` as any }));

  return (
    <LinearGradient
      colors={[...Gradients.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, Shadow.md]}
    >
      {/* Top row — weekly points headline + today's tally */}
      <View style={styles.heroTopRow}>
        <View style={styles.heroPointsBlock}>
          <View style={styles.heroPointsRow}>
            <Text style={styles.heroPointsNum}>{weeklyPoints}</Text>
            <Text style={styles.heroPointsUnit}>pts</Text>
          </View>
          <Text style={styles.heroPointsLabel}>this week</Text>
        </View>
        <View style={styles.heroTodayChip}>
          <Text style={styles.heroTodayNum}>{allDone ? '✓' : `${completedCount}/${totalCount}`}</Text>
          <Text style={styles.heroTodayLabel}>{allDone ? 'all done' : 'today'}</Text>
        </View>
      </View>

      {/* Today's task progress bar */}
      <View style={styles.heroBarRow}>
        <View style={styles.heroBarTrack}>
          <Animated.View style={[styles.heroBarFill, { backgroundColor: '#FFFFFF' }, taskBarStyle]} />
        </View>
        <Text style={styles.heroBarPct}>{Math.round(progressPct * 100)}%</Text>
      </View>

      {/* Divider */}
      <View style={styles.heroDivider} />

      {/* Level row — emoji + title + XP bar to next level */}
      <View style={styles.heroLevelRow}>
        <Text style={styles.heroLevelEmoji}>{level.emoji}</Text>
        <View style={styles.heroLevelInfo}>
          <View style={styles.heroLevelTop}>
            <Text style={styles.heroLevelTitle} numberOfLines={1}>Lv {level.level} · {level.title}</Text>
            <Text style={styles.heroLevelNext}>{level.next != null ? `${level.next} to Lv ${level.level + 1}` : '⭐ Max'}</Text>
          </View>
          <View style={styles.heroLevelTrack}>
            <Animated.View style={[styles.heroLevelFill, { backgroundColor: Gradients.gold[0] }, levelBarStyle]} />
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

function AdultTaskCard({ task, onComplete, onUndo, isCompleting, colors, fontSize, isReadOnly, isParent }: any) {
  // Phase 4.3: a completion awaiting parent approval — done-but-not-awarded.
  const isPending = task.completion?.status === 'pending';
  const isDone = !!task.completion && !task.completion.wasAutoFailed && !isPending;
  const isFailed = task.completion?.wasAutoFailed;
  const scale = useSharedValue(1);
  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const canTapToUndo = isDone && !isReadOnly && !isCompleting;
  const isDisabled = (isDone && !canTapToUndo) || isFailed || isPending || isCompleting || isReadOnly;
  const catColor = CATEGORY_COLORS[task.category] ?? colors.primary;
  const diffColor = task.difficulty === 'easy' ? colors.success : task.difficulty === 'medium' ? colors.warning : colors.danger;
  return (
    <Animated.View style={cardAnim}>
      <Pressable
        android_disableSound
        style={[
          styles.taskCard,
          { backgroundColor: colors.surface },
          isDone && { backgroundColor: (colors.successLight ?? colors.surface) },
          isPending && { borderWidth: 1.5, borderColor: colors.warning, backgroundColor: (colors.warningLight ?? colors.surface) },
          isFailed && { borderWidth: 1.5, borderColor: colors.danger, backgroundColor: (colors.dangerLight ?? colors.surface) },
          isReadOnly && { opacity: 0.8 },
          Shadow.sm,
        ]}
        onPress={() => {
          if (isDisabled) return;
          if (isDone && canTapToUndo) onUndo?.(task);
          else onComplete(task);
        }}
        onPressIn={() => { if (!isDisabled) scale.value = withSpring(0.97, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        onLongPress={() => {
          if (!isParent) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push({
            pathname: '/app/task/create' as any,
            params: {
              taskId: task.id,
              taskData: JSON.stringify({
                title: task.title,
                description: task.description,
                category: task.category,
                difficulty: task.difficulty,
                recurrence: task.recurrence,
                assignedTo: task.assignedTo,
                pointValue: task.pointValue,
                autoFailHour: task.autoFailHour,
                taskEmoji: task.taskEmoji,
                requiresApproval: task.requiresApproval,
              }),
            },
          });
        }}
        accessibilityLabel={`${task.title}, ${task.difficulty}, ${task.pointValue} points, ${isDone ? (canTapToUndo ? 'completed, tap to undo' : 'completed') : isFailed ? 'auto-failed' : 'tap to complete'}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, checked: isDone }}
      >
        {isParent && !isDone && !isFailed && !isPending && (
          <View style={[styles.editHint, { backgroundColor: colors.background + 'DD' }]} pointerEvents="none">
            <Text style={[styles.editHintText, { color: colors.textMuted }]}>✎ hold to edit</Text>
          </View>
        )}
        {canTapToUndo && (
          <View style={[styles.editHint, { backgroundColor: colors.background + 'DD' }]} pointerEvents="none">
            <Text style={[styles.editHintText, { color: colors.textMuted }]}>↩ tap to undo</Text>
          </View>
        )}
        <View style={styles.taskContent}>
          <View style={[styles.taskEmojiBubble, { backgroundColor: catColor + '22' }]}>
            <Text style={styles.taskEmoji}>{detectTaskEmoji(task.title, task.category)}</Text>
          </View>
          <View style={styles.taskInfo}>
            <Text numberOfLines={1} style={[styles.taskTitle, { color: colors.text, fontSize: fontSize(FontSize.md) }, (isDone || isFailed) && { opacity: 0.55, textDecorationLine: 'line-through' }]}>{task.title}</Text>
            <View style={styles.taskMeta}>
              <View style={[styles.diffPill, { backgroundColor: diffColor + '20' }]}>
                <View style={[styles.diffDot, { backgroundColor: diffColor }]} />
                <Text style={[styles.diffPillText, { color: diffColor }]}>{task.difficulty}</Text>
              </View>
              <View style={[styles.recPill, { backgroundColor: colors.background }]}>
                <Text style={[styles.recPillText, { color: colors.textMuted }]}>
                  {task.recurrence === 'daily' ? '🔄 daily' : task.recurrence === 'weekly' ? '📅 weekly' : task.recurrence === 'monthly' ? '🗓️ monthly' : '1️⃣ once'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.taskRight}>
            {isCompleting ? <ActivityIndicator color={colors.primary} size="small" /> :
              isDone ? <View style={[styles.statusIcon, { backgroundColor: colors.success }, Shadow.sm]}><Text style={styles.statusIconText}>✓</Text></View> :
              isPending ? <View style={[styles.pendingPill, { backgroundColor: colors.warning + '22', borderColor: colors.warning }]}><Text style={[styles.pendingPillText, { color: colors.warning }]}>⏳ Pending</Text></View> :
              isFailed ? <View style={[styles.statusIcon, { backgroundColor: colors.danger }]}><Text style={styles.statusIconText}>✗</Text></View> :
              isReadOnly ? <View style={[styles.statusIcon, { backgroundColor: colors.border }]}><Text style={{ fontSize: 16 }}>👁</Text></View> :
              <View style={[styles.rewardChip, { backgroundColor: colors.primary }, Shadow.sm]}>
                <Text style={styles.rewardChipText}>+{task.pointValue}</Text>
                <Text style={styles.rewardChipUnit}>pts</Text>
              </View>
            }
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Profile tab bar — shown for any parent when there are other members ──────
function ProfileTabBar({ members, self, activeId, onSelect, colors }: {
  members: any[];
  self: any;
  activeId: string;
  onSelect: (m: any) => void;
  colors: any;
}) {
  // Show self first, then all other members
  const allProfiles = [self, ...members.filter((m) => m.id !== self.id)];
  return (
    <View style={[ptStyles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ptStyles.scroll}>
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
              <Avatar emoji={p.avatarEmoji} photoURL={(p as any).photoURL} size={32} />
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
    </View>
  );
}
const ptStyles = StyleSheet.create({
  bar: { borderBottomWidth: 1, paddingTop: 4 },
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
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, ...Shadow.sm },
  actionPillText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
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
  hero: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.sm, borderRadius: BorderRadius.xl ?? BorderRadius.lg, padding: Spacing.lg },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroPointsBlock: { flex: 1 },
  heroPointsRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroPointsNum: { fontFamily: FontFamily.black ?? FontFamily.extraBold, fontSize: 40, color: '#FFFFFF', lineHeight: 44 },
  heroPointsUnit: { fontFamily: FontFamily.extraBold, fontSize: FontSize.lg, color: 'rgba(255,255,255,0.85)', marginLeft: 6 },
  heroPointsLabel: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: -2 },
  heroTodayChip: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 66 },
  heroTodayNum: { fontFamily: FontFamily.extraBold, fontSize: FontSize.xl, color: '#FFFFFF' },
  heroTodayLabel: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  heroBarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  heroBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' },
  heroBarFill: { height: '100%', borderRadius: 4 },
  heroBarPct: { fontFamily: FontFamily.extraBold, fontSize: FontSize.xs, color: '#FFFFFF', minWidth: 34, textAlign: 'right' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: Spacing.md },
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
  recPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  recPillText: { fontSize: 10, fontFamily: FontFamily.bold, textTransform: 'capitalize' },
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
  catchUpTitle: { fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
  catchUpSub: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, marginTop: 2 },
  // Today's Tasks section header
  tasksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, marginTop: Spacing.xs },
  tasksHeaderTitle: { fontFamily: FontFamily.black, fontSize: FontSize.xl },
  tasksCountChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: BorderRadius.full },
  tasksCountText: { fontFamily: FontFamily.extraBold, fontSize: FontSize.xs },
  // Edit hint (long press)
  editHint: { position: 'absolute', top: 4, right: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  editHintText: { fontSize: 8, fontFamily: FontFamily.regular },
});

