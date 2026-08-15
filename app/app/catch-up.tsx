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
import { syncMissedPenalties, completeTaskForDate, missedPenaltyMode, type CatchUpItem } from '@/lib/firebase';
import { missedTaskPenaltyAmount } from '@/lib/pointsEngine';
import { useTheme, type ThemeColors } from '@/lib/theme';
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

  const load = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id) { setItems([]); setLoading(false); return; }
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
      await completeTaskForDate({
        familyId: family.id, memberId: effectiveMember.id,
        taskId: item.task.id, pointValue: item.task.pointValue,
        taskTitle: item.task.title, dateKey: item.dateKey,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setItems((prev) => prev.filter((i) => !(i.task.id === item.task.id && i.dateKey === item.dateKey)));
    } catch (e) {
      if (__DEV__) console.error('catch-up mark done failed:', e);
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [family?.id, effectiveMember?.id, busyKey]);

  // Group by day, most-recent first (items already come grouped by grace day).
  const days = Array.from(new Set(items.map((i) => i.dateKey)));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn}>
          <Icon name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Catch up</Text>
        <View style={{ width: 60 }} />
      </View>

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
                return (
                  <View key={key} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle} numberOfLines={1}>{item.task.title}</Text>
                      <Text style={styles.taskMeta}>
                        +{item.task.pointValue} pts{item.penalized ? `  ·  −${penalty} penalty` : ''}
                      </Text>
                    </View>
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
    backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.primary },
    headerTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.text },
    intro: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
    dayGroup: { marginBottom: Spacing.lg },
    dayHeading: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
    taskTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    taskMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textMuted, marginTop: 3 },
    doneBtn: { backgroundColor: colors.success, borderRadius: BorderRadius.md, paddingHorizontal: 16, paddingVertical: 10, minWidth: 104, alignItems: 'center' },
    doneBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFFFFF' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: Spacing.sm },
    emptySub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}
