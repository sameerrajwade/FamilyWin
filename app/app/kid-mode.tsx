/**
 * app/app/kid-mode.tsx — Kid Mode (Phase B, Bet 1: "flip who nags whom")
 * ─────────────────────────────────────────────────────────────────────────────
 * A parent hands their phone to a kid. The kid sees ONLY their own tasks for
 * today and taps "I did it!". Each claim lands as PENDING; points arrive when a
 * parent approves (one-swipe "Approve all" on the Approvals screen). So the
 * kids chase the parent to approve — instead of the parent chasing the kids.
 *
 * Locked in: Android back is swallowed, the mode survives app restarts
 * (lib/kidMode, persisted), and leaving needs a grown-up times-table answer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput,
  BackHandler, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useFamilyStore } from '@/store';
import { useKidMode } from '@/lib/kidMode';
import {
  Col, completeTask, withdrawPendingClaim, uploadCompletionProof,
  getCurrentWeekId, getTodayDateString, getCurrentMonthId,
  type TaskDoc, type CompletionDoc,
} from '@/lib/firebase';
import { findCompletionForPeriod } from '@/lib/completionMatch';
import { effectiveAssignee, isDueToday } from '@/lib/rotation';
import { getCurrentWeekRange, summarizeMemberPoints } from '@/lib/pointsEngine';
import { isKid, makeGateQuestion } from '@/lib/familyGame';
import { resolveTaskEmoji } from '@/lib/taskEmoji';
import { pickPhotoUri } from '@/lib/photoPicker';
import { Sounds } from '@/lib/sounds';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { Confetti } from '@/components/ui/Animations';
import { SurprisePackReveal } from '@/components/ui/SurprisePack';
import { SavingGoalRow } from '@/components/ui/SavingGoal';
import { BrandLogo } from '@/components/ui/BrandIcons';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow, Gradients } from '@/constants/theme';

type KidTask = TaskDoc & { completion: CompletionDoc | null };

export default function KidModeScreen() {
  const { family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const { kidId, switchKid, exit } = useKidMode();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Kids only — never parents, whatever the competition mode.
  const kids = useMemo(() => (members as any[]).filter(isKid), [members]);
  const kid = kids.find((k: any) => k.id === kidId) ?? kids[0] ?? null;

  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [completions, setCompletions] = useState<CompletionDoc[]>([]);
  const [spendable, setSpendable] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  const weekId = getCurrentWeekId();
  const period = { todayStr: getTodayDateString(), weekId, monthId: getCurrentMonthId() };

  // Kids can't back out of Kid Mode — only the grown-up gate exits.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Own members listener: after an app restart straight into Kid Mode the
  // tabs' shared listener may not have populated the store yet.
  useEffect(() => {
    if (!family?.id) return;
    return Col.members(family.id).onSnapshot((snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any);
    }, () => {});
  }, [family?.id, setMembers]);

  // Live tasks + this week's completions (approvals made on another phone
  // show up here instantly as "✓ Done!").
  useEffect(() => {
    if (!family?.id) return;
    const unsubTasks = Col.tasks(family.id).where('isActive', '==', true).onSnapshot((snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoaded(true);
    }, () => setLoaded(true));
    const unsubComps = Col.completions(family.id).where('weekId', '==', weekId).onSnapshot((snap) => {
      setCompletions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    }, () => {});
    return () => { unsubTasks(); unsubComps(); };
  }, [family?.id, weekId]);

  // The kid's spendable bank (same single-field listener as Home).
  useEffect(() => {
    if (!family?.id || !kid?.id) return;
    const { start } = getCurrentWeekRange(family.weekStartDay ?? 1);
    return Col.transactions(family.id).where('memberId', '==', kid.id).onSnapshot((snap) => {
      const txns = snap.docs.map((d) => {
        const x = d.data();
        return { delta: (x.delta as number) || 0, source: x.source as string, date: x.createdAt?.toDate?.() ?? null };
      });
      setSpendable(summarizeMemberPoints(txns, start).spendable);
    }, () => {});
  }, [family?.id, family?.weekStartDay, kid?.id]);

  const kidTasks: KidTask[] = useMemo(() => {
    if (!kid) return [];
    const now = new Date();
    const wsd = family?.weekStartDay ?? 1;
    return tasks
      .filter((t) => isDueToday((t as any).scheduledDays, now))
      .filter((t) => {
        const owner = effectiveAssignee(t as any, now, wsd);
        return owner == null || owner === kid.id;
      })
      .map((t) => ({ ...t, completion: findCompletionForPeriod(completions, t.id, kid.id, t.recurrence, period) }))
      // To-do first, then waiting, then done — the next thing to do is on top.
      .sort((a, b) => rank(a) - rank(b));
  }, [tasks, completions, kid?.id, family?.weekStartDay, period.todayStr]);

  const waitingPts = kidTasks.filter((t) => t.completion?.status === 'pending').reduce((s, t) => s + t.pointValue, 0);
  const doneCount = kidTasks.filter((t) => t.completion && !t.completion.wasAutoFailed).length;
  const allDone = kidTasks.length > 0 && doneCount === kidTasks.length;

  const claim = useCallback(async (task: KidTask) => {
    if (!family?.id || !kid || busyTaskId) return;
    let proofPhotoURL: string | undefined;
    if ((task as any).requiresPhoto) {
      const uri = await pickPhotoUri('camera');
      if (!uri) return;
      setBusyTaskId(task.id);
      try { proofPhotoURL = await uploadCompletionProof(uri, family.id, kid.id); }
      catch { setBusyTaskId(null); Alert.alert('Photo didn’t upload', 'Try again in a moment.'); return; }
    }
    setBusyTaskId(task.id);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Sounds.taskComplete();
      await completeTask({
        familyId: family.id, taskId: task.id, memberId: kid.id, weekId,
        pointValue: task.pointValue, taskTitle: task.title,
        requiresApproval: true, proofPhotoURL,
      });
      setConfetti(true);
      setTimeout(() => setConfetti(false), 1800);
      setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
      setTimeout(() => setCheer(null), 2600);
    } catch {
      Alert.alert('Hmm, that didn’t save', 'Ask a grown-up to check the internet and try again.');
    } finally {
      setBusyTaskId(null);
    }
  }, [family?.id, kid?.id, busyTaskId, weekId]);

  const withdraw = useCallback((task: KidTask) => {
    if (!family?.id || !task.completion) return;
    Alert.alert('Not done yet?', `Take back "${task.title}"?`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Take it back', style: 'destructive', onPress: () => withdrawPendingClaim(family.id, task.completion!.id).catch(() => {}) },
    ]);
  }, [family?.id]);

  function leave() {
    setGateOpen(false);
    exit();
    if (router.canGoBack()) router.back();
    else router.replace('/app/tabs' as any);
  }

  if (!kid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <EmojiIcon emoji="👶" size={72} />
          <Text style={styles.emptyTitle}>No kid profiles yet</Text>
          <Text style={styles.emptySub}>Add a child from Settings → Family first.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={leave}><Text style={styles.primaryBtnText}>Back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const first = (kid.displayName ?? '').split(' ')[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Confetti visible={confetti} count={70} />
      {/* Packs land when a grown-up approves — the kid opens it right here. */}
      <SurprisePackReveal familyId={family?.id} memberId={kid.id} name={first} />

      <View style={styles.topBar}>
        <BrandLogo size={16} tagline={false} />
        <TouchableOpacity style={styles.lockBtn} onPress={() => setGateOpen(true)} accessibilityRole="button" accessibilityLabel="Grown-ups: exit Kid Mode">
          <Text style={styles.lockText}>🔒 Grown-ups</Text>
        </TouchableOpacity>
      </View>

      {kids.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kidRow}>
          {kids.map((k: any) => {
            const on = k.id === kid.id;
            return (
              <TouchableOpacity key={k.id} onPress={() => { switchKid(k.id); Haptics.selectionAsync().catch(() => {}); }} style={[styles.kidChip, on && styles.kidChipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Avatar emoji={k.avatarEmoji} photoURL={k.photoURL} size={34} showRing={on} ringColor={colors.primary} />
                <Text style={[styles.kidChipText, on && { color: colors.textAccent }]}>{(k.displayName ?? '').split(' ')[0]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <Avatar emoji={kid.avatarEmoji} photoURL={kid.photoURL} size={64} showRing ringColor="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroHi}>Hi {first}! 👋</Text>
              <Text style={styles.heroSub}>
                {allDone ? 'You did everything today. Legend!' : `${kidTasks.length - doneCount} to go today`}
              </Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroNum}>{spendable}</Text>
              <Text style={styles.heroLabel}>points to spend</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroNum}>{waitingPts > 0 ? `+${waitingPts}` : '0'}</Text>
              <Text style={styles.heroLabel}>waiting for OK</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroNum}>{doneCount}/{kidTasks.length}</Text>
              <Text style={styles.heroLabel}>done today</Text>
            </View>
          </View>
        </LinearGradient>

        {/* E2: what this kid is saving for (a grown-up pins it on Rewards). */}
        <SavingGoalRow
          familyId={family?.id}
          memberId={kid.id}
          rewardId={kid.savingForRewardId ?? null}
          spendable={spendable}
          navigate={false}
          style={{ marginHorizontal: 0, marginTop: Spacing.md, marginBottom: 0 }}
          onAffordable={() => {
            setConfetti(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setTimeout(() => setConfetti(false), 1800);
          }}
        />

        {waitingPts > 0 && (
          <View style={styles.nudge}>
            <EmojiIcon emoji="⏳" size={26} />
            <Text style={styles.nudgeText}>Ask a grown-up to approve your tasks to get your <Text style={{ fontFamily: FontFamily.extraBold }}>+{waitingPts} points</Text>!</Text>
          </View>
        )}

        {!loaded ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : kidTasks.length === 0 ? (
          <View style={styles.center}>
            <EmojiIcon emoji="🎉" size={72} />
            <Text style={styles.emptyTitle}>No tasks today</Text>
            <Text style={styles.emptySub}>Enjoy your free time!</Text>
          </View>
        ) : (
          kidTasks.map((task) => {
            const state = taskState(task);
            const busy = busyTaskId === task.id;
            return (
              <View key={task.id} style={[styles.card, state === 'done' && styles.cardDone]}>
                <View style={styles.cardIcon}><EmojiIcon emoji={resolveTaskEmoji(task as any)} size={44} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, state === 'done' && { opacity: 0.6 }]} numberOfLines={2}>{task.title}</Text>
                  <Text style={styles.cardPts}>+{task.pointValue} points{(task as any).requiresPhoto ? '  ·  📸 photo' : ''}</Text>
                </View>
                {state === 'todo' && (
                  <TouchableOpacity style={styles.didItBtn} onPress={() => claim(task)} disabled={!!busyTaskId} accessibilityRole="button" accessibilityLabel={`I did ${task.title}`}>
                    {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.didItText}>I did it!</Text>}
                  </TouchableOpacity>
                )}
                {state === 'waiting' && (
                  <TouchableOpacity style={styles.waitingPill} onPress={() => withdraw(task)} accessibilityRole="button" accessibilityLabel={`${task.title} is waiting for a grown-up`}>
                    <Text style={styles.waitingText}>⏳ Waiting</Text>
                  </TouchableOpacity>
                )}
                {state === 'done' && (
                  <View style={styles.donePill}><Text style={styles.doneText}>✓ Done!</Text></View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {cheer && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{cheer}</Text>
        </View>
      )}

      <GrownUpGate visible={gateOpen} onCancel={() => setGateOpen(false)} onPass={leave} colors={colors} />
    </SafeAreaView>
  );
}

const CHEERS = [
  'Awesome! ⭐ Now ask a grown-up to approve.',
  'Nice work! 🙌 Your points are on the way.',
  'Boom! 💥 One more done.',
  'You’re on fire! 🔥',
];

function taskState(t: KidTask): 'todo' | 'waiting' | 'done' {
  if (!t.completion || t.completion.wasAutoFailed) return 'todo';
  return t.completion.status === 'pending' ? 'waiting' : 'done';
}
function rank(t: KidTask): number {
  return { todo: 0, waiting: 1, done: 2 }[taskState(t)];
}

// ─── Grown-up gate ───────────────────────────────────────────────────────────
function GrownUpGate({ visible, onCancel, onPass, colors }: { visible: boolean; onCancel: () => void; onPass: () => void; colors: any }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [q, setQ] = useState(makeGateQuestion());
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => { if (visible) { setQ(makeGateQuestion()); setAnswer(''); setWrong(false); } }, [visible]);

  function check() {
    if (parseInt(answer, 10) === q.answer) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onPass(); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setWrong(true); setAnswer(''); setQ(makeGateQuestion());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.gateOverlay}>
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Grown-ups only</Text>
          <Text style={styles.gateSub}>To leave Kid Mode, answer:</Text>
          <Text style={styles.gateQ}>{q.a} × {q.b} = ?</Text>
          <TextInput
            style={styles.gateInput}
            value={answer}
            onChangeText={(t) => { setAnswer(t.replace(/[^0-9]/g, '')); setWrong(false); }}
            keyboardType="number-pad"
            maxLength={3}
            autoFocus
            onSubmitEditing={check}
            accessibilityLabel="Answer"
          />
          {wrong && <Text style={styles.gateWrong}>Not quite — try this one.</Text>}
          <View style={styles.gateBtns}>
            <TouchableOpacity style={styles.gateCancel} onPress={onCancel}><Text style={styles.gateCancelText}>Stay</Text></TouchableOpacity>
            <TouchableOpacity style={styles.gateOk} onPress={check}><Text style={styles.gateOkText}>Exit Kid Mode</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
    lockBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full, backgroundColor: colors.border + '80' },
    lockText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: colors.textSecondary },
    kidRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.sm },
    kidChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14, paddingLeft: 4, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    kidChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
    kidChipText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60 },
    hero: { borderRadius: 24, padding: Spacing.lg, marginBottom: Spacing.md },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    heroHi: { fontSize: 28, fontFamily: FontFamily.black ?? FontFamily.extraBold, color: '#FFFFFF' },
    heroSub: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
    heroStats: { flexDirection: 'row', marginTop: Spacing.lg, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: BorderRadius.lg, paddingVertical: Spacing.md },
    heroStat: { flex: 1, alignItems: 'center' },
    heroNum: { fontSize: 24, fontFamily: FontFamily.black ?? FontFamily.extraBold, color: '#FFFFFF' },
    heroLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    nudge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.warning + '1C', borderColor: colors.warning + '55', borderWidth: 1.5, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md },
    nudgeText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.text, lineHeight: 19 },
    card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: colors.surface, borderRadius: 20, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
    cardDone: { backgroundColor: colors.success + '14' },
    cardIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '12' },
    cardTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.text },
    cardPts: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent, marginTop: 2 },
    didItBtn: { backgroundColor: colors.success, borderRadius: BorderRadius.full, paddingHorizontal: 18, paddingVertical: 12, minWidth: 96, alignItems: 'center' },
    didItText: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: '#FFFFFF' },
    waitingPill: { backgroundColor: colors.warning + '22', borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 10 },
    waitingText: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.warning },
    donePill: { backgroundColor: colors.success, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 10 },
    doneText: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: '#FFFFFF' },
    emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text },
    emptySub: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center' },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.lg, paddingVertical: 12, marginTop: Spacing.md },
    primaryBtnText: { color: '#FFF', fontFamily: FontFamily.bold, fontSize: FontSize.md },
    toast: { position: 'absolute', bottom: 40, left: Spacing.lg, right: Spacing.lg, backgroundColor: colors.text, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center' },
    toastText: { color: colors.background, fontFamily: FontFamily.extraBold, fontSize: FontSize.md, textAlign: 'center' },
    gateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    gateCard: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 24, padding: Spacing.lg, alignItems: 'center' },
    gateTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text },
    gateSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 4 },
    gateQ: { fontSize: 34, fontFamily: FontFamily.black ?? FontFamily.extraBold, color: colors.textAccent, marginVertical: Spacing.md },
    gateInput: { width: 120, borderWidth: 2, borderColor: colors.border, borderRadius: BorderRadius.md, fontSize: 26, fontFamily: FontFamily.extraBold, textAlign: 'center', paddingVertical: 8, color: colors.text },
    gateWrong: { color: colors.textDanger, fontFamily: FontFamily.semiBold, fontSize: FontSize.sm, marginTop: Spacing.sm },
    gateBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, width: '100%' },
    gateCancel: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center' },
    gateCancelText: { fontFamily: FontFamily.bold, color: colors.textSecondary, fontSize: FontSize.md },
    gateOk: { flex: 1.4, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center' },
    gateOkText: { fontFamily: FontFamily.bold, color: '#FFF', fontSize: FontSize.md },
  });
}
