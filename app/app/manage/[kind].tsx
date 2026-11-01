/**
 * app/app/manage/[kind].tsx — edit anything: tasks · rewards · penalties & bonuses
 * ─────────────────────────────────────────────────────────────────────────────
 * One list + edit-sheet pattern for everything a parent sets up. Reached from
 * Family → "Set up the game", or by long-pressing an item elsewhere (Rewards
 * card, discipline preset) which deep-links here with ?edit=<id>.
 * Items added from starter packs are ordinary family items, so they're fully
 * editable. Starter penalty/bonus presets are saved as the family's own list
 * on first edit (materializeStarterPresets) so none silently disappear.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Col, deleteTask, createReward, updateReward, deactivateReward,
  createPenalty, updatePenalty, deletePenalty, materializeStarterPresets,
  type TaskDoc, type RewardDoc, type PenaltyDoc,
} from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme } from '@/lib/theme';
import { resolveTaskEmoji } from '@/lib/taskEmoji';
import { rewardIcon } from '@/lib/rewardIcon';
import { openTaskEditor } from '@/lib/taskNav';
import { STARTER_PENALTIES, STARTER_BONUSES } from '@/constants/presets';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

type Kind = 'tasks' | 'rewards' | 'penalties';
const TITLES: Record<Kind, string> = { tasks: 'Tasks', rewards: 'Rewards', penalties: 'Penalties & bonuses' };

/** What the edit sheet is working on. id null = creating a new one. */
interface Draft {
  type: 'reward' | 'penalty' | 'bonus';
  id: string | null;
  title: string;
  points: string;
  extra: string; // reward description, or preset emoji
}

export default function ManageScreen() {
  const { kind: rawKind, edit } = useLocalSearchParams<{ kind: string; edit?: string }>();
  const kind: Kind = rawKind === 'rewards' || rawKind === 'penalties' ? rawKind : 'tasks';
  const { family, member } = useAuthStore();
  const { members } = useFamilyStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [rewards, setRewards] = useState<RewardDoc[]>([]);
  const [presets, setPresets] = useState<PenaltyDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deepLinked, setDeepLinked] = useState(false);

  useEffect(() => {
    if (!family?.id) return;
    const done = () => setLoaded(true);
    if (kind === 'tasks') {
      return Col.tasks(family.id).where('isActive', '==', true).onSnapshot((s) => {
        setTasks(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => a.title.localeCompare(b.title))); done();
      }, done);
    }
    if (kind === 'rewards') {
      return Col.rewards(family.id).where('isActive', '==', true).onSnapshot((s) => {
        setRewards(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => a.pointCost - b.pointCost)); done();
      }, done);
    }
    return Col.penalties(family.id).where('isActive', '==', true).onSnapshot((s) => {
      setPresets(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => a.points - b.points)); done();
    }, done);
  }, [family?.id, kind]);

  // Deep link (?edit=<id>) from a long-press elsewhere → open that item's editor once.
  useEffect(() => {
    if (!edit || deepLinked || !loaded) return;
    setDeepLinked(true);
    if (kind === 'rewards') { const r = rewards.find((x) => x.id === edit); if (r) openReward(r); }
    if (kind === 'penalties') { const p = presets.find((x) => x.id === edit); if (p) openPreset(p); }
    if (kind === 'tasks') { const t = tasks.find((x) => x.id === edit); if (t) openTaskEditor(t); }
  }, [edit, loaded, rewards, presets, tasks]);

  const assigneeName = (t: any) => {
    const id = t.rotation?.memberIds?.length ? null : (Array.isArray(t.assignedTo) ? t.assignedTo[0] : t.assignedTo);
    if (t.rotation?.memberIds?.length) return 'Rotates';
    if (!id) return 'Whole family';
    return (members as any[]).find((m) => m.id === id)?.displayName?.split(' ')[0] ?? 'Someone';
  };

  // ── Editors ──────────────────────────────────────────────────────────────
  function openReward(r: RewardDoc | null) {
    setDraft({ type: 'reward', id: r?.id ?? null, title: r?.title ?? '', points: r ? String(r.pointCost) : '', extra: r?.description ?? '' });
  }
  function openPreset(p: PenaltyDoc | null, type: 'penalty' | 'bonus' = p?.kind === 'bonus' ? 'bonus' : 'penalty') {
    setDraft({ type, id: p?.id ?? null, title: p?.title ?? '', points: p ? String(p.points) : '', extra: p?.emoji ?? '' });
  }
  /** Starter preset tapped: save the starter list as the family's own, then edit it. */
  async function openStarter(type: 'penalty' | 'bonus', title?: string) {
    if (!family?.id || !member?.id) return;
    try {
      await materializeStarterPresets(family.id, type, type === 'bonus' ? STARTER_BONUSES : STARTER_PENALTIES, member.id);
      const snap = await Col.penalties(family.id).where('isActive', '==', true).get();
      const own = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PenaltyDoc[];
      const match = title ? own.find((p) => (p.kind ?? 'penalty') === type && p.title === title) : null;
      openPreset(match ?? null, type);
    } catch {
      Alert.alert('Could not open', 'Please try again.');
    }
  }

  async function save() {
    if (!draft || !family?.id || !member?.id) return;
    const pts = parseInt(draft.points, 10);
    if (!draft.title.trim()) { Alert.alert('Add a name', 'Give it a short name.'); return; }
    if (!pts || pts <= 0) { Alert.alert('Add points', 'Enter a points value above 0.'); return; }
    setSaving(true);
    try {
      if (draft.type === 'reward') {
        if (draft.id) await updateReward(family.id, draft.id, { title: draft.title, pointCost: pts, description: draft.extra });
        else await createReward({ familyId: family.id, title: draft.title, pointCost: pts, description: draft.extra.trim() || undefined, createdBy: member.id });
      } else {
        if (draft.id) await updatePenalty(family.id, draft.id, { title: draft.title, points: pts, emoji: draft.extra.trim() || undefined });
        else {
          await materializeStarterPresets(family.id, draft.type, draft.type === 'bonus' ? STARTER_BONUSES : STARTER_PENALTIES, member.id);
          await createPenalty({ familyId: family.id, title: draft.title.trim(), points: pts, emoji: draft.extra.trim() || undefined, createdBy: member.id, kind: draft.type });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDraft(null);
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    if (!draft?.id || !family?.id) return;
    const what = draft.type === 'reward' ? 'reward' : draft.type;
    Alert.alert(`Remove this ${what}?`, `"${draft.title}" will be removed. Past history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            if (draft.type === 'reward') await deactivateReward(family.id, draft.id!);
            else await deletePenalty(family.id, draft.id!);
            setDraft(null);
          } catch { Alert.alert('Could not remove', 'Please try again.'); }
        },
      },
    ]);
  }

  function taskMenu(t: TaskDoc) {
    Alert.alert(t.title, undefined, [
      { text: 'Edit', onPress: () => openTaskEditor(t) },
      {
        text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete task?', `"${t.title}" will be removed from everyone's list. Past history stays.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => family?.id && deleteTask(family.id, t.id).catch(() => Alert.alert('Could not delete', 'Please try again.')) },
        ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // ── Rows ─────────────────────────────────────────────────────────────────
  const ownPenalties = presets.filter((p) => (p.kind ?? 'penalty') === 'penalty');
  const ownBonuses = presets.filter((p) => p.kind === 'bonus');

  const addAction = kind === 'tasks'
    ? () => router.push('/app/task/create' as any)
    : kind === 'rewards' ? () => openReward(null) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={TITLES[kind]}
        right={addAction ? (
          <TouchableOpacity onPress={addAction} accessibilityRole="button" accessibilityLabel={`Add ${kind === 'tasks' ? 'task' : 'reward'}`}>
            <Text style={styles.headerAdd}>＋ New</Text>
          </TouchableOpacity>
        ) : undefined}
      />
      {!loaded ? <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} /> : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.hint}>Tap to edit · long-press for more</Text>

          {kind === 'tasks' && (
            <>
              <View style={styles.group}>
                {tasks.length === 0 && <Text style={styles.empty}>No tasks yet.</Text>}
                {tasks.map((t: any, i) => (
                  <ItemRow key={t.id} emoji={resolveTaskEmoji(t)} title={t.title}
                    meta={`${t.recurrence} · ${assigneeName(t)}`} value={`+${t.pointValue}`} valueColor={colors.textAccent}
                    onPress={() => openTaskEditor(t)} onLongPress={() => taskMenu(t)} last={i === tasks.length - 1} styles={styles} />
                ))}
              </View>
              <PackLink label="Browse starter task packs" onPress={() => router.push('/app/task/packs' as any)} styles={styles} />
            </>
          )}

          {kind === 'rewards' && (
            <>
              <View style={styles.group}>
                {rewards.length === 0 && <Text style={styles.empty}>No rewards yet.</Text>}
                {rewards.map((r, i) => (
                  <ItemRow key={r.id} emoji={rewardIcon(r)} title={r.title} meta={r.description}
                    value={`${r.pointCost}`} valueColor={colors.textAccent}
                    onPress={() => openReward(r)} onLongPress={() => openReward(r)} last={i === rewards.length - 1} styles={styles} />
                ))}
              </View>
              <PackLink label="Browse reward packs" onPress={() => router.push('/app/reward/packs' as any)} styles={styles} />
            </>
          )}

          {kind === 'penalties' && (['penalty', 'bonus'] as const).map((type) => {
            const own = type === 'bonus' ? ownBonuses : ownPenalties;
            const starters = type === 'bonus' ? STARTER_BONUSES : STARTER_PENALTIES;
            const sign = type === 'bonus' ? '+' : '−';
            const color = type === 'bonus' ? colors.success : colors.textDanger;
            return (
              <View key={type} style={{ gap: Spacing.sm }}>
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>{type === 'bonus' ? 'Bonuses' : 'Penalties'}</Text>
                  <TouchableOpacity onPress={() => own.length ? openPreset(null, type) : openStarter(type)} accessibilityRole="button">
                    <Text style={styles.headerAdd}>＋ Add</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.group}>
                  {own.length > 0
                    ? own.map((p, i) => (
                      <ItemRow key={p.id} emoji={p.emoji ?? (type === 'bonus' ? '⭐' : '⚠️')} title={p.title}
                        value={`${sign}${p.points}`} valueColor={color}
                        onPress={() => openPreset(p, type)} onLongPress={() => openPreset(p, type)} last={i === own.length - 1} styles={styles} />
                    ))
                    : starters.map((s, i) => (
                      <ItemRow key={s.title} emoji={s.emoji} title={s.title} meta="Starter — tap to customize"
                        value={`${sign}${s.points}`} valueColor={color}
                        onPress={() => openStarter(type, s.title)} onLongPress={() => openStarter(type, s.title)} last={i === starters.length - 1} styles={styles} />
                    ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Edit sheet (rewards + presets; tasks use the full task editor) */}
      <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {draft?.id ? 'Edit' : 'New'} {draft?.type === 'reward' ? 'reward' : draft?.type}
            </Text>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={draft?.title ?? ''} onChangeText={(v) => setDraft((d) => d && { ...d, title: v })}
              placeholder={draft?.type === 'reward' ? '30 min video games' : draft?.type === 'bonus' ? 'Helped without being asked' : 'Talked back'}
              placeholderTextColor={colors.textMuted} maxLength={40} />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{draft?.type === 'reward' ? 'Cost (points)' : 'Points'}</Text>
                <TextInput style={styles.input} value={draft?.points ?? ''} onChangeText={(v) => setDraft((d) => d && { ...d, points: v.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad" maxLength={5} placeholder="50" placeholderTextColor={colors.textMuted} />
              </View>
              {draft?.type !== 'reward' && (
                <View style={{ width: 90 }}>
                  <Text style={styles.label}>Emoji</Text>
                  <TextInput style={[styles.input, { textAlign: 'center' }]} value={draft?.extra ?? ''} onChangeText={(v) => setDraft((d) => d && { ...d, extra: v })} maxLength={4} placeholder="⭐" placeholderTextColor={colors.textMuted} />
                </View>
              )}
            </View>
            {draft?.type === 'reward' && (
              <>
                <Text style={styles.label}>Description (optional)</Text>
                <TextInput style={styles.input} value={draft?.extra ?? ''} onChangeText={(v) => setDraft((d) => d && { ...d, extra: v })} maxLength={80} placeholder="Weekend only" placeholderTextColor={colors.textMuted} />
                {draft?.id ? <Text style={styles.note}>Requests already waiting keep the price they were made at.</Text> : null}
              </>
            )}
            <View style={styles.btns}>
              {draft?.id
                ? <TouchableOpacity style={styles.ghostBtn} onPress={remove} disabled={saving}><Text style={[styles.ghostText, { color: colors.textDanger }]}>Remove</Text></TouchableOpacity>
                : <TouchableOpacity style={styles.ghostBtn} onPress={() => setDraft(null)} disabled={saving}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>}
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ItemRow({ emoji, title, meta, value, valueColor, onPress, onLongPress, last, styles }: {
  emoji: string; title: string; meta?: string; value: string; valueColor: string;
  onPress: () => void; onLongPress: () => void; last?: boolean; styles: any;
}) {
  return (
    <TouchableOpacity style={[styles.row, !last && styles.divider]} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
      <View style={styles.rowIcon}><EmojiIcon emoji={emoji} size={26} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </TouchableOpacity>
  );
}

function PackLink({ label, onPress, styles }: { label: string; onPress: () => void; styles: any }) {
  return (
    <TouchableOpacity style={styles.packLink} onPress={onPress} accessibilityRole="button">
      <EmojiIcon emoji="🎁" size={20} />
      <Text style={styles.packText}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 48, gap: Spacing.md },
    hint: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textMuted },
    headerAdd: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.textAccent },
    group: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadow.sm },
    divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
    rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '12' },
    rowTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    rowMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 2, textTransform: 'none' },
    rowValue: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
    empty: { padding: Spacing.lg, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, textAlign: 'center' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
    section: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    packLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
    packText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: Spacing.md },
    sheetTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center', textTransform: 'capitalize' },
    label: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text, marginTop: Spacing.md, marginBottom: 6 },
    input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.text, backgroundColor: colors.background },
    note: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: Spacing.sm },
    btns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
    ghostBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
    ghostText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textSecondary },
    saveBtn: { flex: 1.5, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
    saveText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
  });
}
