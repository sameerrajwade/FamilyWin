/**
 * app/app/catch-up.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated "catch up" screen for the optional missed-task penalty. Lists daily
 * tasks the ACTIVE profile missed within the 2-day grace window, grouped by day.
 * Marking one done restores its points and reverses the miss penalty.
 *
 * Available to whoever's profile is active (self or a managed child) — not
 * parent-gated. Opened from the compact Home entry so Home never balloons with
 * one row per missed task.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import { syncMissedPenalties, completeTaskForDate, undoTaskCompletion, missedPenaltyMode, penaltyPauseActive, type CatchUpItem } from '@/lib/firebase';
import { missedTaskPenaltyAmount } from '@/lib/pointsEngine';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { checkSurprisePacks } from '@/lib/surprise';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';

/** "Yesterday" for the most recent past day, otherwise the weekday name. */
function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function CatchUpScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { member, actingAsMember, family } = useAuthStore();
  const effectiveMember = actingAsMember ?? member;
  const mode = missedPenaltyMode(family);

  const [items, setItems] = useState<CatchUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Tasks just marked done in THIS session, kept on-screen so a mis-tap can be
  // undone right here (feedback #8: "no way going back — the task is gone").
  // Maps `${taskId}::${dateKey}` → the created completion id used to reverse it.
  const [doneKeys, setDoneKeys] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id) { setItems([]); setLoading(false); return; }
    // Penalties paused (vacation/sick) → nothing to catch up, apply nothing.
    if (penaltyPauseActive(family, effectiveMember)) { setItems([]); setLoading(false); return; }
    try {
      const next = await syncMissedPenalties({ familyId: family.id, memberId: effectiveMember.id, mode });
      setItems(next);
    } catch (e) {
      if (__DEV__) console.error('catch-up load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [family?.id, effectiveMember?.id, mode]);

  useEffect(() => { load(); }, [load]);

  const markDone = useCallback(async (item: CatchUpItem) => {
    if (!family?.id || !effectiveMember?.id || busyKey) return;
    const key = `${item.task.id}::${item.dateKey}`;
    setBusyKey(key);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const { completionId } = await completeTaskForDate({
        familyId: family.id, memberId: effectiveMember.id,
        taskId: item.task.id, pointValue: item.task.pointValue,
        taskTitle: item.task.title, dateKey: item.dateKey,
        // Kid on their own phone → waits for a parent OK (same rule as Kid Mode).
        requiresApproval: !(member?.role === 'parent' || member?.role === 'admin_parent'),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Keep the row on screen in a "Done · Undo" state (don't remove it) so a
      // mistaken tap is recoverable right here.
      setDoneKeys((prev) => ({ ...prev, [key]: completionId }));
      // A parent catching up a past day may have finished it → surprise pack.
      if (member?.role === 'parent' || member?.role === 'admin_parent') {
        checkSurprisePacks({
          familyId: family.id,
          member: { id: effectiveMember.id, isManaged: (effectiveMember as any).isManaged },
          dateKey: item.dateKey,
          weekStartDay: family.weekStartDay ?? 1,
        }).catch(() => {});
      }
    } catch (e) {
      if (__DEV__) console.error('catch-up mark done failed:', e);
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [family?.id, effectiveMember?.id, busyKey, member?.role]);

  const undoDone = useCallback(async (item: CatchUpItem) => {
    if (!family?.id || !effectiveMember?.id || busyKey) return;
    const key = `${item.task.id}::${item.dateKey}`;
    const completionId = doneKeys[key];
    if (!completionId) return;
    setBusyKey(key);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await undoTaskCompletion({
        familyId: family.id, completionId,
        taskId: item.task.id, memberId: effectiveMember.id,
        pointsAwarded: item.task.pointValue, taskTitle: item.task.title,
      });
      // Return the row to its actionable state. (The task is missed again; the
      // penalty re-applies on the next load — consistent with never marking it.)
      setDoneKeys((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (e) {
      if (__DEV__) console.error('catch-up undo failed:', e);
      Alert.alert('Could not undo', 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [family?.id, effectiveMember?.id, busyKey, doneKeys]);

  // Group by day, most-recent first (items already come grouped by grace day).
  const days = Array.from(new Set(items.map((i) => i.dateKey)));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Catch up" />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="checkmark-done-circle" size={56} color={colors.success} />
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySub}>No missed tasks in the last 2 days for {effectiveMember?.displayName?.split(' ')[0] ?? 'this profile'}.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}>
          <Text style={styles.intro}>
            Missed a task? Mark it done to win the points back — reverses the penalty.
          </Text>
          {days.map((dateKey) => (
            <View key={dateKey} style={styles.dayGroup}>
              <Text style={styles.dayHeading}>{dayLabel(dateKey)}</Text>
              {items.filter((i) => i.dateKey === dateKey).map((item) => {
                const key = `${item.task.id}::${item.dateKey}`;
                const penalty = missedTaskPenaltyAmount(item.task.pointValue, mode);
                const isDone = key in doneKeys;
                return (
                  <View key={key} style={[styles.row, isDone && styles.rowDone]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle} numberOfLines={1}>{item.task.title}</Text>
                      <Text style={styles.taskMeta}>
                        {isDone
                          ? `✓ Caught up  ·  +${item.task.pointValue} pts back`
                          : `+${item.task.pointValue} pts${item.penalized ? `  ·  −${penalty} penalty` : ''}`}
                      </Text>
                    </View>
                    {isDone ? (
                      <TouchableOpacity
                        style={styles.undoBtn}
                        onPress={() => undoDone(item)}
                        disabled={!!busyKey}
                        activeOpacity={0.85}
                        accessibilityLabel={`Undo catch-up for ${item.task.title}`}
                      >
                        {busyKey === key
                          ? <ActivityIndicator color={colors.danger} size="small" />
                          : <Text style={styles.undoBtnText}>↩ Undo</Text>}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => markDone(item)}
                        disabled={!!busyKey}
                        activeOpacity={0.85}
                      >
                        {busyKey === key
                          ? <ActivityIndicator color="#FFF" size="small" />
                          : <Text style={styles.doneBtnText}>Mark done</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
    backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.textAccent },
    headerTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.text },
    intro: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
    dayGroup: { marginBottom: Spacing.lg },
    dayHeading: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
    rowDone: { backgroundColor: (colors.successLight ?? colors.surface), borderWidth: 1.5, borderColor: colors.success + '55' },
    taskTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    taskMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textMuted, marginTop: 3 },
    doneBtn: { backgroundColor: colors.success, borderRadius: BorderRadius.md, paddingHorizontal: 16, paddingVertical: 10, minWidth: 104, alignItems: 'center' },
    doneBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFFFFF' },
    undoBtn: { backgroundColor: colors.danger + '18', borderWidth: 1.5, borderColor: colors.danger + '55', borderRadius: BorderRadius.md, paddingHorizontal: 16, paddingVertical: 9, minWidth: 104, alignItems: 'center' },
    undoBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textDanger },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: Spacing.sm },
    emptySub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}
