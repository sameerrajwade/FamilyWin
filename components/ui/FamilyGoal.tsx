/**
 * components/ui/FamilyGoal.tsx — the family co-op goal (Phase B, Bet 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * One weekly target the WHOLE family earns toward together ("1,000 pts →
 * pizza night"). It turns siblings from rivals into teammates and gives the
 * kid who can't win the leaderboard a reason to keep going.
 *
 *   <FamilyGoalCard />   — live progress (or a parent prompt to set one)
 *   <FamilyGoalEditor /> — parent sheet to set target + reward
 * Weekly totals come from a single-field transactions listener (no index).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestore } from '@/lib/fb';
import { Col, setFamilyGoal, getCurrentWeekId } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { useTheme } from '@/lib/theme';
import { getCurrentWeekRange } from '@/lib/pointsEngine';
import { familyGoalProgress, suggestFamilyGoal } from '@/lib/familyGame';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { Confetti } from '@/components/ui/Animations';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

/** This week's (and optionally last week's) earned points per member, live. */
export function useFamilyWeekTotals(familyId: string | undefined, weekStartDay: number = 1) {
  const [thisWeek, setThisWeek] = useState<Record<string, number>>({});
  const [lastWeekTotal, setLastWeekTotal] = useState(0);
  useEffect(() => {
    if (!familyId) return;
    const { start } = getCurrentWeekRange(weekStartDay);
    const lastStart = new Date(start); lastStart.setDate(lastStart.getDate() - 7);
    return Col.transactions(familyId)
      .where('createdAt', '>=', firestore.Timestamp.fromDate(lastStart))
      .onSnapshot((snap) => {
        const totals: Record<string, number> = {};
        let last = 0;
        for (const d of snap.docs) {
          const x = d.data();
          if (x.source === 'redemption') continue; // spending isn't earning
          const when = x.createdAt?.toDate?.() as Date | undefined;
          if (!when) continue;
          if (when >= start) totals[x.memberId] = (totals[x.memberId] ?? 0) + (x.delta || 0);
          else last += Math.max(0, x.delta || 0);
        }
        setThisWeek(totals);
        setLastWeekTotal(last);
      }, () => {});
  }, [familyId, weekStartDay]);
  return { thisWeek, lastWeekTotal };
}

/** Shared state for the goal card + bar: progress, parent check, celebration. */
function useFamilyGoalState() {
  const { family, member } = useAuthStore();
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { thisWeek, lastWeekTotal } = useFamilyWeekTotals(family?.id, family?.weekStartDay ?? 1);
  const [celebrate, setCelebrate] = useState(false);
  const goal = family?.familyGoal ?? null;
  const p = goal ? familyGoalProgress(thisWeek, goal.target) : null;

  // Celebrate ONCE per week per device when the goal is reached.
  useEffect(() => {
    if (!p?.reached || !family?.id) return;
    const key = `family_goal_celebrated_${family.id}_${getCurrentWeekId()}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (seen) return;
      AsyncStorage.setItem(key, '1').catch(() => {});
      setCelebrate(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setCelebrate(false), 3200);
    }).catch(() => {});
  }, [p?.reached, family?.id]);

  return { goal, p, isParent, lastWeekTotal, celebrate };
}

/**
 * The thin (~28dp) goal line for the top of Today — visible every day without
 * pushing the task list down. Parents with no goal see a one-line "set one".
 */
export function FamilyGoalBar() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { goal, p, isParent, lastWeekTotal, celebrate } = useFamilyGoalState();
  const [editing, setEditing] = useState(false);
  if (!goal && !isParent) return null;

  return (
    <>
      <Confetti visible={celebrate} count={90} />
      <TouchableOpacity
        style={[styles.bar, { borderBottomColor: colors.border }]}
        onPress={() => isParent && setEditing(true)}
        activeOpacity={isParent ? 0.7 : 1}
        accessibilityRole={isParent ? 'button' : undefined}
        accessibilityLabel={goal ? `Family goal: ${p!.total} of ${p!.target} points for ${goal.reward}` : 'Set a family goal'}
      >
        <EmojiIcon emoji={p?.reached ? '🎉' : '🎯'} size={18} />
        {goal ? (
          <>
            <Text style={styles.barLabel} numberOfLines={1}>{goal.reward}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.fill, { width: `${Math.round(p!.progress * 100)}%`, backgroundColor: p!.reached ? colors.success : colors.primary }]} />
            </View>
            <Text style={[styles.barNums, { color: p!.reached ? colors.success : colors.textAccent }]}>{p!.total}/{p!.target}</Text>
          </>
        ) : (
          <Text style={[styles.barLabel, { color: colors.textAccent }]}>Set a family goal ›</Text>
        )}
      </TouchableOpacity>
      {isParent && (
        <FamilyGoalEditor visible={editing} onClose={() => setEditing(false)} suggested={suggestFamilyGoal(lastWeekTotal)} current={goal} />
      )}
    </>
  );
}

export function FamilyGoalCard({ compact }: { compact?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { goal, p, isParent, lastWeekTotal, celebrate } = useFamilyGoalState();
  const [editing, setEditing] = useState(false);

  if (!goal) {
    if (!isParent) return null;
    return (
      <>
        <TouchableOpacity style={[styles.card, styles.setupCard]} onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Set a family goal">
          <EmojiIcon emoji="🎯" size={34} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Set a family goal</Text>
            <Text style={styles.sub}>Everyone earns toward one shared reward — teammates, not just rivals.</Text>
          </View>
        </TouchableOpacity>
        <FamilyGoalEditor visible={editing} onClose={() => setEditing(false)} suggested={suggestFamilyGoal(lastWeekTotal)} />
      </>
    );
  }

  return (
    <>
      <Confetti visible={celebrate} count={90} />
      <TouchableOpacity
        style={[styles.card, p!.reached && { borderColor: colors.success, backgroundColor: colors.success + '12' }]}
        onPress={() => isParent && setEditing(true)}
        activeOpacity={isParent ? 0.85 : 1}
        accessibilityRole={isParent ? 'button' : undefined}
        accessibilityLabel={`Family goal: ${p!.total} of ${p!.target} points for ${goal.reward}`}
      >
        <View style={styles.row}>
          <EmojiIcon emoji={p!.reached ? '🎉' : '🎯'} size={compact ? 28 : 34} />
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>FAMILY GOAL</Text>
            <Text style={styles.title} numberOfLines={1}>{goal.reward}</Text>
          </View>
          <Text style={[styles.nums, { color: p!.reached ? colors.success : colors.primary }]}>
            {p!.total}<Text style={styles.numsOf}> / {p!.target}</Text>
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(p!.progress * 100)}%`, backgroundColor: p!.reached ? colors.success : colors.primary }]} />
        </View>
        <Text style={styles.sub}>
          {p!.reached ? 'You did it — together! Enjoy the reward 🎉' : `${p!.remaining} pts to go — everyone’s points count.`}
        </Text>
      </TouchableOpacity>
      {isParent && (
        <FamilyGoalEditor visible={editing} onClose={() => setEditing(false)} suggested={suggestFamilyGoal(lastWeekTotal)} current={goal} />
      )}
    </>
  );
}

const REWARD_IDEAS = ['🍕 Pizza night', '🎬 Movie night', '🍦 Ice cream trip', '🎳 Family outing', '🎮 Game night'];

export function FamilyGoalEditor({ visible, onClose, suggested, current }: {
  visible: boolean; onClose: () => void; suggested: number; current?: { target: number; reward: string } | null;
}) {
  const { family, setFamily } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [target, setTarget] = useState(String(current?.target ?? suggested));
  const [reward, setReward] = useState(current?.reward ?? REWARD_IDEAS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setTarget(String(current?.target ?? suggested)); setReward(current?.reward ?? REWARD_IDEAS[0]); }
  }, [visible]);

  async function save(goal: { target: number; reward: string } | null) {
    if (!family?.id) return;
    setSaving(true);
    try {
      await setFamilyGoal(family.id, goal);
      setFamily({ ...family, familyGoal: goal });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    const t = parseInt(target, 10);
    if (!t || t < 50) { Alert.alert('Pick a bigger target', 'Use at least 50 points.'); return; }
    if (!reward.trim()) { Alert.alert('Add a reward', 'What does the family get when you hit it?'); return; }
    save({ target: t, reward: reward.trim() });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Family goal this week</Text>
          <Text style={styles.sheetSub}>Everyone’s points add up — kids and parents. Suggested from last week: {suggested}.</Text>

          <Text style={styles.label}>Target points</Text>
          <TextInput style={styles.input} value={target} onChangeText={(v) => setTarget(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={5} />

          <Text style={styles.label}>Shared reward</Text>
          <TextInput style={styles.input} value={reward} onChangeText={setReward} maxLength={40} placeholder="e.g. Pizza night" placeholderTextColor={colors.textMuted} />
          <View style={styles.ideas}>
            {REWARD_IDEAS.map((r) => (
              <TouchableOpacity key={r} style={[styles.idea, reward === r && { borderColor: colors.primary, backgroundColor: colors.primary + '14' }]} onPress={() => setReward(r)}>
                <Text style={styles.ideaText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.btns}>
            {current ? (
              <TouchableOpacity style={styles.ghostBtn} onPress={() => save(null)} disabled={saving}><Text style={[styles.ghostText, { color: colors.textDanger }]}>Remove</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.ghostBtn} onPress={onClose} disabled={saving}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save goal</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 6, borderBottomWidth: 1 },
    barLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.extraBold, color: colors.text, maxWidth: '38%' },
    barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
    barNums: { fontSize: FontSize.xs, fontFamily: FontFamily.extraBold },
    card: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.primary + '33', padding: Spacing.md, gap: Spacing.sm, ...Shadow.sm },
    setupCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderStyle: 'dashed' },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    eyebrow: { fontSize: 10, fontFamily: FontFamily.extraBold, color: colors.textMuted, letterSpacing: 1 },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    sub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, lineHeight: 16 },
    nums: { fontSize: FontSize.xl, fontFamily: FontFamily.black ?? FontFamily.extraBold },
    numsOf: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textMuted },
    track: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 5 },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: Spacing.md },
    sheetTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center' },
    sheetSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: Spacing.md },
    label: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text, marginTop: Spacing.sm, marginBottom: 6 },
    input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.text, backgroundColor: colors.background },
    ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
    idea: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 6 },
    ideaText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: colors.text },
    btns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
    ghostBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
    ghostText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textSecondary },
    saveBtn: { flex: 1.5, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
    saveText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
  });
}
