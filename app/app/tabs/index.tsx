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
import firestore from '@react-native-firebase/firestore';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useAuthStore, useTaskStore, useFamilyStore, usePointsStore } from '@/store';
import {
  getActiveTasks, getWeekCompletions, completeTask as fbCompleteTask,
  undoTaskCompletion,
  getCurrentWeekId, getTodayDateString, getCurrentMonthId,
  Col, getFamilyMembers, deleteTask,
} from '@/lib/firebase';
import { getCurrentWeekRange } from '@/lib/pointsEngine';
import { useTheme } from '@/lib/theme';
import { Confetti, PointBurst, SlideIn, ShimmerBox } from '@/components/ui/Animations';
import { Mascot, ChildTaskCard, CelebrationOverlay, StreakFlame } from '@/components/ui/ChildMode';
import { EmptyState, SectionHeader, PointsChip, Avatar } from '@/components/ui/index';
// ProfileSwitcherBanner replaced by inline ProfileTabBar below
import { CATEGORY_COLORS, CATEGORY_ICONS, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

type TaskWithCompletion = {
  id: string; familyId: string; title: string; category: string;
  difficulty: 'easy' | 'medium' | 'hard'; recurrence: string;
  pointValue: number; autoFailHour?: number; isActive: boolean;
  assignedTo?: string | null; createdBy: string;
  completion: { id: string; wasAutoFailed: boolean; pointsAwarded: number; completedDate?: string | null; completedAt?: any } | null;
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
  const [streak] = useState(0);
  // Undo state — cleared after 5 seconds
  const [undoTask, setUndoTask] = useState<{ id: string; title: string; txId: string; points: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekId = getCurrentWeekId();
  const dateString = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const todayStr = getTodayDateString();
  const monthId = getCurrentMonthId();

  const loadTasks = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id) return;
    try {
      setLoadingTasks(true);

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
        // All completions for this task + this member this week
        const all = completions.filter(
          (c) => c.taskId === taskId && c.memberId === effectiveMember.id,
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
          return { ...task, completion: c ? { id: c.id, wasAutoFailed: c.wasAutoFailed, pointsAwarded: c.pointsAwarded, completedDate: c.completedDate ?? dateStr(c.completedAt), completedAt: c.completedAt } : null };
        });

      setTodaysTasks(myTasks as any);

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
      setLoadingTasks(false);
    }
  }, [family?.id, effectiveMember?.id, weekId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

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
      });

      markTaskComplete(task.id, task.pointValue);
      updateMemberPoints(effectiveMember!.id, task.pointValue);
      addTransaction(tx as any);

      setLastCompletedPoints(task.pointValue);
      setWeeklyPoints((p) => p + task.pointValue);
      setPointBurstKey((k) => k + 1);
      setPointBurstVisible(true);
      setTimeout(() => setPointBurstVisible(false), 1200);

      // Show undo toast for 5 seconds
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoTask({ id: task.id, title: task.title, txId: tx.id, points: task.pointValue });
      undoTimer.current = setTimeout(() => setUndoTask(null), 5000);

      const remaining = todaysTasks.filter((t: any) => !t.completion && t.id !== task.id);
      if (remaining.length === 0) {
        Sounds.allDone();
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
          try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await undoTaskCompletion({
              familyId: family.id,
              completionId: task.completion!.id,
              taskId: task.id,
              memberId: effectiveMember.id,
              pointsAwarded: task.completion!.pointsAwarded,
              taskTitle: task.title,
            });
            setWeeklyPoints((p) => p - task.completion!.pointsAwarded);
            updateMemberPoints(effectiveMember.id, -task.completion!.pointsAwarded);
            await loadTasks();
          } catch (e) {
            if (__DEV__) console.error('[Undo Task]', e);
            Alert.alert('Error', 'Could not undo this completion. Please try again.');
          }
        },
      },
    ]);
  }

  const completedCount = (todaysTasks as any[]).filter((t) => t.completion && !t.completion.wasAutoFailed).length;
  const totalCount = todaysTasks.length;
  const allDone = completedCount === totalCount && totalCount > 0;
  const progressPct = totalCount > 0 ? completedCount / totalCount : 0;

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
            onPress={async () => {
              if (!family?.id) return;
              clearTimeout(undoTimer.current!);
              setUndoTask(null);
              // Reverse: delete the transaction and completion — simple soft undo
              try {
                await Col.transactions(family.id).doc(undoTask.txId).delete();
                // Reload tasks to show the task as incomplete again
                setWeeklyPoints((p) => p - undoTask.points);
                updateMemberPoints(effectiveMember!.id, -undoTask.points);
                loadTasks();
              } catch { /* silent — task stays complete if undo fails */ }
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
              <Text style={[styles.greeting, { color: colors.text, fontSize: fontSize(FontSize.xxl) }]}>
                {actingAsMember
                  ? `${effectiveMember?.avatarEmoji} ${effectiveMember?.displayName}'s tasks${isReadOnly ? ' 👁' : ''}`
                  : `Hey, ${member?.displayName?.split(' ')[0]} ${member?.avatarEmoji}`}
              </Text>
              <Text style={[styles.date, { color: colors.textSecondary }]}>{dateString}</Text>
            </View>
            <View style={styles.headerRight}>
              {streak > 0 && <StreakFlame streak={streak} />}
              {isParent && (
                <TouchableOpacity
                  style={[styles.penaltyButton, { backgroundColor: colors.warning + '22', borderColor: colors.warning + '66' }]}
                  onPress={() => router.push('/app/discipline/log')}
                  accessibilityLabel="Log discipline event"
                  accessibilityRole="button"
                >
                  <Text style={styles.penaltyButtonText}>⚠️</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push({ pathname: '/app/task/create' as any, params: actingAsMember ? { defaultAssignee: actingAsMember.id } : {} })}
                accessibilityLabel="Create new task"
                accessibilityRole="button"
              >
                <Text style={styles.addButtonText}>＋</Text>
              </TouchableOpacity>
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
        <SlideIn delay={150}>
          <View style={[styles.progressCard, { backgroundColor: colors.surface }, Shadow.sm]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressTitle, { color: colors.text, fontSize: fontSize(FontSize.sm) }]}>
                {allDone ? '🎉 All tasks done!' : `${completedCount} of ${totalCount} tasks done`}
              </Text>
              <View style={styles.progressRight}>
                <Text style={[styles.progressPercent, { color: colors.primary }]}>{Math.round(progressPct * 100)}%</Text>
                <PointsChip points={weeklyPoints} size="sm" />
              </View>
            </View>
            <AnimatedProgressBar progress={progressPct} color={colors.primary} />
          </View>
        </SlideIn>
        <View style={styles.section}>
          <SlideIn delay={200}><SectionHeader title="Today's Tasks" /></SlideIn>
          {isLoadingTasks ? <LoadingSkeletons /> :
            todaysTasks.length === 0 ? (
              <SlideIn delay={250}>
                <EmptyState emoji="🌟" title="No tasks today!" subtitle="Enjoy your free day or tap + to add some tasks." action={{ label: '+ Add Task', onPress: () => router.push('/app/task/create') }} />
              </SlideIn>
            ) : isChildMode ? (
              (todaysTasks as any[]).map((task, i) => (
                <ChildTaskCard key={task.id} task={task as any} onComplete={(t) => { handleCompleteTask(t as any); }} onUndo={(t: any) => handleUndoTask(t)} isCompleting={completingTaskId === task.id} index={i} />
              ))
            ) : (
              (todaysTasks as any[]).map((task, i) => (
                <SlideIn key={task.id} delay={250 + i * 60}>
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

function AdultTaskCard({ task, onComplete, onUndo, isCompleting, colors, fontSize, isReadOnly, isParent }: any) {
  const isDone = !!task.completion && !task.completion.wasAutoFailed;
  const isFailed = task.completion?.wasAutoFailed;
  const scale = useSharedValue(1);
  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const canTapToUndo = isDone && !isReadOnly && !isCompleting;
  const isDisabled = (isDone && !canTapToUndo) || isFailed || isCompleting || isReadOnly;
  return (
    <Animated.View style={cardAnim}>
      <Pressable
        android_disableSound
        style={[styles.taskCard, { backgroundColor: colors.surface }, isDone && styles.taskCardDone, isFailed && { borderWidth: 1.5, borderColor: colors.danger }, isReadOnly && { opacity: 0.75 }, Shadow.sm]}
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
              }),
            },
          });
        }}
        accessibilityLabel={`${task.title}, ${task.difficulty}, ${task.pointValue} points, ${isDone ? (canTapToUndo ? 'completed, tap to undo' : 'completed') : isFailed ? 'auto-failed' : 'tap to complete'}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, checked: isDone }}
      >
        <View style={[styles.taskCategoryBar, { backgroundColor: CATEGORY_COLORS[task.category] ?? colors.primary }]} />
        {isParent && !isDone && !isFailed && (
          <View style={[styles.editHint, { backgroundColor: colors.background + 'AA' }]} pointerEvents="none">
            <Text style={[styles.editHintText, { color: colors.textMuted }]}>hold to edit</Text>
          </View>
        )}
        {canTapToUndo && (
          <View style={[styles.editHint, { backgroundColor: colors.background + 'AA' }]} pointerEvents="none">
            <Text style={[styles.editHintText, { color: colors.textMuted }]}>tap to undo</Text>
          </View>
        )}
        <View style={styles.taskContent}>
          <Text style={styles.taskEmoji}>{task.taskEmoji ?? CATEGORY_ICONS[task.category] ?? '📌'}</Text>
          <View style={styles.taskInfo}>
            <Text style={[styles.taskTitle, { color: colors.text, fontSize: fontSize(FontSize.md) }, (isDone || isFailed) && { opacity: 0.5, textDecorationLine: 'line-through' }]}>{task.title}</Text>
            <View style={styles.taskMeta}>
              <Text style={[styles.taskDifficulty, { color: colors.textSecondary }]}>
                {task.difficulty === 'easy' ? '🟢' : task.difficulty === 'medium' ? '🟡' : '🔴'} {task.difficulty}
              </Text>
              <Text style={[styles.recurrenceBadge, { color: colors.textMuted }]}>
                {'  ·  '}
                {task.recurrence === 'daily' ? '🔄 daily' : task.recurrence === 'weekly' ? '📅 weekly' : task.recurrence === 'monthly' ? '🗓️ monthly' : '1️⃣ once'}
              </Text>
            </View>
          </View>
          <View style={styles.taskRight}>
            {isCompleting ? <ActivityIndicator color={colors.primary} size="small" /> :
              isDone ? <View style={[styles.statusIcon, { backgroundColor: colors.success }]}><Text style={styles.statusIconText}>✓</Text></View> :
              isFailed ? <View style={[styles.statusIcon, { backgroundColor: colors.danger }]}><Text style={styles.statusIconText}>✗</Text></View> :
              isReadOnly ? <View style={[styles.statusIcon, { backgroundColor: colors.border }]}><Text style={{ fontSize: 16 }}>👁</Text></View> :
              <View style={[styles.pointsBadge, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.pointsText, { color: colors.primary, fontSize: fontSize(FontSize.md) }]}>+{task.pointValue}</Text>
                <Text style={[styles.pointsLabel, { color: colors.primary }]}>pts</Text>
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
  pointBurstContainer: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', zIndex: 100 },
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
  progressCard: { marginHorizontal: Spacing.lg, marginVertical: Spacing.sm, borderRadius: BorderRadius.lg, padding: Spacing.md },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  progressTitle: { fontFamily: FontFamily.semiBold, flex: 1 },
  progressRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progressPercent: { fontFamily: FontFamily.extraBold, fontSize: FontSize.sm },
  progressBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.2)' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  section: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  taskCard: { borderRadius: BorderRadius.lg, marginBottom: Spacing.sm, flexDirection: 'row', overflow: 'hidden' },
  taskCardDone: { opacity: 0.65 },
  taskCategoryBar: { width: 5 },
  taskContent: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  taskEmoji: { fontSize: 28, marginRight: Spacing.sm },
  taskInfo: { flex: 1 },
  taskTitle: { fontFamily: FontFamily.bold },
  taskMeta: { flexDirection: 'row', marginTop: 4 },
  taskDifficulty: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, textTransform: 'capitalize' },
  taskRight: { marginLeft: Spacing.sm, alignItems: 'center', minWidth: 55 },
  pointsBadge: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, alignItems: 'center' },
  pointsText: { fontFamily: FontFamily.extraBold },
  pointsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold },
  statusIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusIconText: { fontSize: FontSize.lg, color: '#FFFFFF', fontFamily: FontFamily.bold },
  // Undo toast
  undoToast: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: Spacing.sm, borderWidth: 1, zIndex: 200, ...Shadow.md },
  undoText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  undoBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, marginLeft: Spacing.sm },
  undoBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: '#FFF' },
  // Recurrence badge
  recurrenceBadge: { fontSize: 9, fontFamily: FontFamily.semiBold, marginTop: 3, textTransform: 'capitalize' },
  // Edit hint (long press)
  editHint: { position: 'absolute', top: 4, right: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  editHintText: { fontSize: 8, fontFamily: FontFamily.regular },
});

