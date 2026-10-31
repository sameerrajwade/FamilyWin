/**
 * packs.tsx — starter task-pack picker (Roadmap 4.6).
 * Lets a parent seed a whole week of age-appropriate tasks in one tap. Tasks are
 * pre-selected; deselect any you don't want, then add the rest. Points come from
 * difficulty and emoji are auto-detected at apply-time.
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import { createTasksFromPack } from '@/lib/firebase';
import { detectTaskEmoji } from '@/lib/taskEmoji';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { TASK_PACKS } from '@/constants/taskPacks';
import type { PackTask } from '@/constants/taskPacks';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow, DIFFICULTY_POINTS } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

const key = (packId: string, i: number) => `${packId}:${i}`;
const recurrenceLabel: Record<string, string> = { daily: '🔄 daily', weekly: '📅 weekly', monthly: '🗓️ monthly', once: '1️⃣ once' };

export default function TaskPacksScreen() {
  const { family, member } = useAuthStore();
  const { colors } = useTheme();

  // Everything starts selected; we track only what the user turns OFF.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [applyingPack, setApplyingPack] = useState<string | null>(null);

  const toggle = (k: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
    Haptics.selectionAsync();
  };

  const selectedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pack of TASK_PACKS) {
      counts[pack.id] = pack.tasks.filter((_, i) => !deselected.has(key(pack.id, i))).length;
    }
    return counts;
  }, [deselected]);

  async function applyPack(packId: string, tasks: PackTask[]) {
    if (!family?.id || !member?.id) return;
    const rows = tasks
      .map((t, i) => ({ t, i }))
      .filter(({ i }) => !deselected.has(key(packId, i)))
      .map(({ t }) => ({
        title: t.title,
        category: t.category,
        difficulty: t.difficulty,
        recurrence: t.recurrence,
        pointValue: DIFFICULTY_POINTS[t.difficulty],
        taskEmoji: detectTaskEmoji(t.title, t.category),
      }));
    if (rows.length === 0) { Alert.alert('Nothing selected', 'Pick at least one task to add.'); return; }
    try {
      setApplyingPack(packId);
      await createTasksFromPack(family.id, member.id, rows);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Added! 🎉', `${rows.length} task${rows.length > 1 ? 's' : ''} added to your family.`, [
        { text: 'Great', onPress: () => router.back() },
      ]);
    } catch (e) {
      if (__DEV__) console.error('[Packs] apply failed', e);
      Alert.alert('Error', 'Could not add these tasks. Please try again.');
    } finally {
      setApplyingPack(null);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader variant="modal" title="Starter Packs" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Seed a full week of tasks in one tap. Tap any task to include or skip it — you can edit or delete them later.
        </Text>

        {TASK_PACKS.map((pack) => (
          <View key={pack.id} style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
            <View style={styles.cardHead}>
              <Text style={styles.packEmoji}>{pack.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.packName, { color: colors.text }]}>{pack.name}</Text>
                <Text style={[styles.packBlurb, { color: colors.textSecondary }]}>{pack.blurb}</Text>
              </View>
            </View>

            <View style={styles.taskList}>
              {pack.tasks.map((t, i) => {
                const k = key(pack.id, i);
                const on = !deselected.has(k);
                return (
                  <TouchableOpacity key={k} style={styles.taskRow} onPress={() => toggle(k)} activeOpacity={0.7}>
                    <View style={[styles.checkbox, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
                      {on && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <EmojiIcon emoji={detectTaskEmoji(t.title, t.category)} size={26} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: colors.text }, !on && { opacity: 0.4, textDecorationLine: 'line-through' }]} numberOfLines={1}>{t.title}</Text>
                      <Text style={[styles.taskMeta, { color: colors.textMuted }]}>
                        {DIFFICULTY_POINTS[t.difficulty]} pts · {recurrenceLabel[t.recurrence]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: selectedCount[pack.id] > 0 ? colors.primary : colors.border }]}
              onPress={() => applyPack(pack.id, pack.tasks)}
              disabled={applyingPack !== null || selectedCount[pack.id] === 0}
              activeOpacity={0.85}
            >
              {applyingPack === pack.id
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.addBtnText}>＋ Add {selectedCount[pack.id]} task{selectedCount[pack.id] === 1 ? '' : 's'}</Text>}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  back: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  headerTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 20, marginBottom: Spacing.lg },
  card: { borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  packEmoji: { fontSize: 34 },
  packName: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  packBlurb: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },
  taskList: { marginBottom: Spacing.sm },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFF', fontSize: 14, fontFamily: FontFamily.bold },
  taskEmoji: { fontSize: 20 },
  taskTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  taskMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },
  addBtn: { borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: '#FFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
});
