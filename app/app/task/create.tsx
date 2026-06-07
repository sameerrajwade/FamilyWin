import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Col, getActiveTasks, updateTask, deleteTask } from '@/lib/firebase';
import { detectTaskEmoji } from '@/lib/taskEmoji';
import { useAuthStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow, CATEGORY_ICONS, DIFFICULTY_POINTS } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import type { TaskCategory, TaskDifficulty, TaskRecurrence } from '@/types';

const CATEGORIES: TaskCategory[] = ['chores', 'homework', 'hygiene', 'behavior', 'extras'];
const DIFFICULTIES: TaskDifficulty[] = ['easy', 'medium', 'hard'];
const RECURRENCES: { value: TaskRecurrence; label: string }[] = [
  { value: 'daily', label: '🔄 Daily' },
  { value: 'weekly', label: '📅 Weekly' },
  { value: 'monthly', label: '🗓️ Monthly' },
  { value: 'once', label: '1️⃣ One-time' },
];

export default function CreateTaskScreen() {
  const { member, family } = useAuthStore();
  const { members } = useFamilyStore();
  const { colors } = useTheme();
  // Params: defaultAssignee pre-selects a member; taskId + taskData enable edit mode
  const { defaultAssignee, taskId, taskData } = useLocalSearchParams<{
    defaultAssignee?: string;
    taskId?: string;
    taskData?: string;
  }>();

  const isEditMode = !!taskId;
  const editData = taskData ? (() => { try { return JSON.parse(taskData); } catch { return null; } })() : null;

  const [title, setTitle] = useState(editData?.title ?? '');
  const [description, setDescription] = useState(editData?.description ?? '');
  const [category, setCategory] = useState<TaskCategory>(editData?.category ?? 'chores');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(editData?.difficulty ?? 'easy');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(editData?.recurrence ?? 'daily');
  const [assignedTo, setAssignedTo] = useState<string[]>(
    editData?.assignedTo
      ? (Array.isArray(editData.assignedTo) ? editData.assignedTo : [editData.assignedTo])
      : defaultAssignee ? [defaultAssignee] : [],
  );
  const [pointValue, setPointValue] = useState(editData?.pointValue ?? DIFFICULTY_POINTS.easy);
  const [customPoints, setCustomPoints] = useState(!!editData?.pointValue && editData.pointValue !== DIFFICULTY_POINTS[editData.difficulty ?? 'easy']);
  const [autoFailHour, setAutoFailHour] = useState(editData?.autoFailHour ?? 20);
  const [taskEmoji, setTaskEmoji] = useState<string>(
    editData?.taskEmoji ?? detectTaskEmoji(editData?.title ?? '', editData?.category ?? 'chores'),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Existing tasks for duplicate detection ───────────────────────────────
  const [existingTasks, setExistingTasks] = useState<{ id: string; title: string; assignedTo: any; category: string; difficulty: string; pointValue: number; recurrence: string }[]>([]);
  const [titleSuggestions, setTitleSuggestions] = useState<typeof existingTasks>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<typeof existingTasks[0] | null>(null);

  useEffect(() => {
    if (family?.id) {
      getActiveTasks(family.id).then((tasks) => setExistingTasks(tasks as any)).catch(() => {});
    }
  }, [family?.id]);

  // Update suggestions as user types
  useEffect(() => {
    const q = title.trim().toLowerCase();
    if (q.length < 2) { setTitleSuggestions([]); setDuplicateWarning(null); return; }
    const matches = existingTasks.filter((t) => t.title.toLowerCase().includes(q));
    setTitleSuggestions(matches.slice(0, 3));
    const exact = existingTasks.find((t) => t.title.toLowerCase() === q);
    setDuplicateWarning(exact ?? null);
  }, [title, existingTasks]);

  // Auto-detect emoji when title or category changes (unless manually overridden in edit mode)
  useEffect(() => {
    if (title.trim().length >= 2) {
      setTaskEmoji(detectTaskEmoji(title, category));
    }
  }, [title, category]);

  function applyExistingTask(task: typeof existingTasks[0]) {
    setTitle(task.title);
    setCategory(task.category as TaskCategory);
    setDifficulty(task.difficulty as TaskDifficulty);
    setPointValue(task.pointValue);
    setRecurrence(task.recurrence as TaskRecurrence);
    setTitleSuggestions([]);
    setDuplicateWarning(null);
    Haptics.selectionAsync();
  }

  function handleDifficultyChange(diff: TaskDifficulty) {
    setDifficulty(diff);
    if (!customPoints) setPointValue(DIFFICULTY_POINTS[diff]);
  }

  function toggleAssignee(memberId: string) {
    setAssignedTo((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a task title.');
      return;
    }
    if (!family?.id || !member?.id) return;

    try {
      setIsLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (isEditMode && taskId) {
        // Edit mode — update existing task, keep completions as-is
        await updateTask(family.id, taskId, {
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          category,
          difficulty,
          recurrence,
          assignedTo: assignedTo.length > 0 ? assignedTo : null,
          pointValue,
          autoFailHour,
          taskEmoji,
        });
      } else {
        // Create mode
        await Col.tasks(family.id).add({
          familyId: family.id,
          title: title.trim(),
          description: description.trim() || null,
          category,
          difficulty,
          recurrence,
          assignedTo: assignedTo.length > 0 ? assignedTo : null,
          pointValue,
          autoFailHour,
          taskEmoji,
          isActive: true,
          createdBy: member.id,
          createdAt: new Date(),
        });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      Alert.alert('Error', `Could not ${isEditMode ? 'update' : 'create'} task. Please try again.`);
      if (__DEV__) console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!family?.id || !taskId) return;
    Alert.alert(
      'Delete Task?',
      `"${title}" will be removed from the task list. Existing completions and points are preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await deleteTask(family!.id, taskId);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            } catch {
              Alert.alert('Error', 'Could not delete task. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{isEditMode ? 'Edit Task' : 'Create Task'}</Text>
            {isEditMode ? (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Delete this task"
                accessibilityRole="button"
              >
                <Text style={{ fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.danger }}>
                  {isDeleting ? '…' : '🗑️ Delete'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </View>

          <View style={styles.form}>
            {/* Title */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Task Title *</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                {/* Live emoji preview — updates as user types */}
                <View style={[styles.emojiPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 28 }}>{taskEmoji}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.inputFlex, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Clean your room"
                  placeholderTextColor={colors.textMuted}
                  maxLength={60}
                />
              </View>
              <Text style={[styles.emojiHint, { color: colors.textMuted }]}>
                ✨ Emoji auto-detected from your title
              </Text>

              {/* Existing task suggestions — prevents duplicates */}
              {titleSuggestions.length > 0 && !duplicateWarning && (
                <View style={styles.suggestBox}>
                  <Text style={styles.suggestLabel}>📋 Existing tasks — tap to reuse:</Text>
                  {titleSuggestions.map((t) => (
                    <TouchableOpacity key={t.id} style={styles.suggestRow} onPress={() => applyExistingTask(t)}>
                      <Text style={styles.suggestEmoji}>{CATEGORY_ICONS[t.category] ?? '📌'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestTitle}>{t.title}</Text>
                        <Text style={styles.suggestMeta}>{t.difficulty} · {t.pointValue}pts · {t.recurrence}</Text>
                      </View>
                      <Text style={styles.suggestReuse}>Reuse →</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Exact duplicate warning */}
              {duplicateWarning && (
                <View style={styles.duplicateBox}>
                  <Text style={styles.duplicateTitle}>⚠️ This task already exists!</Text>
                  <Text style={styles.duplicateText}>
                    "{duplicateWarning.title}" is already in your task list.{'\n'}
                    Instead of creating a duplicate, tap it below to reuse and just change who it's assigned to:
                  </Text>
                  <TouchableOpacity style={styles.duplicateBtn} onPress={() => applyExistingTask(duplicateWarning)}>
                    <Text style={styles.duplicateBtnText}>↩ Load existing task settings</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add more details..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, category === cat && styles.chipSelected]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={styles.chipEmoji}>{CATEGORY_ICONS[cat]}</Text>
                      <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Difficulty */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Difficulty & Points</Text>
              <View style={styles.difficultyRow}>
                {DIFFICULTIES.map((diff) => (
                  <TouchableOpacity
                    key={diff}
                    style={[styles.diffChip, difficulty === diff && styles.diffChipSelected]}
                    onPress={() => handleDifficultyChange(diff)}
                  >
                    <Text style={styles.diffEmoji}>
                      {diff === 'easy' ? '🟢' : diff === 'medium' ? '🟡' : '🔴'}
                    </Text>
                    <Text style={[styles.diffLabel, difficulty === diff && styles.diffLabelSelected]}>
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </Text>
                    <Text style={[styles.diffPoints, difficulty === diff && styles.diffPointsSelected]}>
                      {DIFFICULTY_POINTS[diff]} pts
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Recurrence */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Repeats</Text>
              <View style={styles.chipRow}>
                {RECURRENCES.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, recurrence === value && styles.chipSelected]}
                    onPress={() => setRecurrence(value)}
                  >
                    <Text style={[styles.chipText, recurrence === value && styles.chipTextSelected]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Assign To — multi-select (parents only) */}
            {isParent && members.length > 0 && (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Assign To (select multiple)</Text>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm }}>
                  Leave blank to assign to everyone
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {members.map((m) => {
                      const selected = assignedTo.includes(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() => toggleAssignee(m.id)}
                        >
                          <Text style={styles.chipEmoji}>{m.avatarEmoji}</Text>
                          <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                            {m.displayName.split(' ')[0]}
                          </Text>
                          {selected && <Text style={{ color: '#FFF', fontSize: 12 }}> ✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                {assignedTo.length > 0 && (
                  <TouchableOpacity onPress={() => setAssignedTo([])}>
                    <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 }}>
                      Clear — assign to everyone
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Custom Points */}
            <View style={styles.field}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
                <Text style={styles.label}>Points Value</Text>
                <TouchableOpacity onPress={() => setCustomPoints(!customPoints)}>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.primary, fontFamily: FontFamily.bold }}>
                    {customPoints ? '↩ Use difficulty preset' : '✏️ Customise'}
                  </Text>
                </TouchableOpacity>
              </View>
              {customPoints ? (
                <TextInput
                  style={styles.input}
                  value={String(pointValue)}
                  onChangeText={(t) => {
                    const num = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(num)) setPointValue(num);
                    else if (t === '') setPointValue(0);
                  }}
                  keyboardType="number-pad"
                  placeholder="Enter custom point value"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={4}
                />
              ) : (
                <View style={[styles.chip, styles.chipSelected, { alignSelf: 'flex-start' }]}>
                  <Text style={[styles.chipText, styles.chipTextSelected]}>⭐ {pointValue} pts</Text>
                </View>
              )}
            </View>

            {/* Auto-fail time */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Auto-fail if not done by</Text>
              <View style={styles.timeRow}>
                {[18, 19, 20, 21, 22].map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={[styles.timeChip, autoFailHour === hour && styles.chipSelected]}
                    onPress={() => setAutoFailHour(hour)}
                  >
                    <Text style={[styles.timeChipText, autoFailHour === hour && styles.chipTextSelected]}>
                      {hour > 12 ? `${hour - 12}PM` : `${hour}PM`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.createButton, isLoading && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={isLoading || isDeleting}
              activeOpacity={0.8}
              accessibilityLabel={isEditMode ? 'Save task changes' : 'Create task'}
              accessibilityRole="button"
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.createButtonText}>{isEditMode ? '✏️ Save Changes' : '✅ Create Task'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  form: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputFlex: { flex: 1 },
  emojiPreview: {
    width: 58,
    height: 58,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiHint: {
    fontSize: FontSize.xs - 1,
    fontFamily: FontFamily.regular,
    marginTop: 4,
    marginLeft: 2,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipEmoji: { fontSize: 16 },
  chipText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  diffChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  diffChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  diffEmoji: { fontSize: 24, marginBottom: 4 },
  diffLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  diffLabelSelected: { color: '#FFFFFF' },
  diffPoints: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  diffPointsSelected: { color: 'rgba(255,255,255,0.8)' },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  timeChip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  timeChipText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  suggestBox: { marginTop: Spacing.sm, backgroundColor: Colors.primary + '0C', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.primary + '33', overflow: 'hidden' },
  suggestLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: Colors.primary, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 4 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.primary + '22' },
  suggestEmoji: { fontSize: 20 },
  suggestTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.text },
  suggestMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  suggestReuse: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: Colors.primary },
  duplicateBox: { marginTop: Spacing.sm, backgroundColor: Colors.warning + '15', borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.warning + '55', padding: Spacing.md },
  duplicateTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.warning, marginBottom: 6 },
  duplicateText: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.text, lineHeight: 18, marginBottom: Spacing.sm },
  duplicateBtn: { backgroundColor: Colors.warning, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  duplicateBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: Spacing.md,
    ...Shadow.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  createButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
