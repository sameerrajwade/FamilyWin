/**
 * app/app/approvals.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The parent's ONE inbox (UX review 2026-11-02): task claims waiting for an OK
 * (status:'pending' completions — points settle via onCompletionUpdated) AND
 * reward / pocket-money requests (pending redemptions). The Family-tab badge
 * counts both, so the badge never leads to a screen without the item.
 * "Send back" (was Reject) takes an optional quick reason the kid sees.
 *
 * Parent-gated. Opened from the Home banner that appears when approvals are
 * waiting. Points are NEVER set from the client here — the client only flips the
 * completion's status; the CF is the sole writer of the transaction.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import {
  getPendingCompletions, approveCompletion, approveCompletions, rejectCompletion,
  getActiveTasks, getFamilyMembers, Col, getActiveRewards, approveRedemption, rejectRedemption,
  type CompletionDoc, type TaskDoc, type MemberDoc, type RedemptionDoc,
} from '@/lib/firebase';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui';
import { checkSurprisePacks, type PackAward } from '@/lib/surprise';
import { sendKudos } from '@/lib/firebase';
import { StickerPicker } from '@/components/ui/Kudos';

interface PendingRow {
  completion: CompletionDoc;
  task?: TaskDoc;
  member?: MemberDoc;
}

interface RewardRow {
  redemption: RedemptionDoc;
  member?: MemberDoc;
  title: string;
  cost: number;
  isPayout: boolean;
}

// Quick "Send back" reasons (the kid sees the chosen one).
const CLAIM_REASONS = ['Not done yet', 'Needs a redo', 'Missing photo'];
const REWARD_REASONS = ['Not this week', 'Save up a bit more', 'Let’s talk about it'];

export default function ApprovalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { member, family } = useAuthStore();
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [rewardRows, setRewardRows] = useState<RewardRow[]>([]);
  // "Send back" sheet: which item, and the reason picked (optional).
  const [sendBack, setSendBack] = useState<{ kind: 'claim'; row: PendingRow } | { kind: 'reward'; row: RewardRow } | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Kudos (engagement 2026-11-01): right after an approval, offer a sticker.
  const [kudosFor, setKudosFor] = useState<{ memberId: string; name: string; taskTitle?: string; completionId: string } | null>(null);
  useEffect(() => {
    if (!kudosFor) return;
    const t = setTimeout(() => setKudosFor(null), 9000);
    return () => clearTimeout(t);
  }, [kudosFor]);

  const load = useCallback(async () => {
    if (!family?.id) { setRows([]); setLoading(false); return; }
    try {
      const [pending, tasks, members, rewards, redSnap] = await Promise.all([
        getPendingCompletions(family.id),
        getActiveTasks(family.id),
        getFamilyMembers(family.id),
        getActiveRewards(family.id),
        Col.redemptions(family.id).where('status', '==', 'pending').get(),
      ]);
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const memberById = new Map(members.map((m) => [m.id, m]));
      setRows(pending.map((c) => ({
        completion: c,
        task: taskById.get(c.taskId),
        member: memberById.get(c.memberId),
      })));
      setRewardRows(redSnap.docs.map((d: any) => {
        const r = { id: d.id, ...d.data() } as RedemptionDoc;
        const isPayout = (r as any).kind === 'payout';
        const reward = isPayout ? undefined : rewards.find((x) => x.id === r.rewardId);
        return {
          redemption: r,
          member: memberById.get(r.memberId),
          isPayout,
          // Charge the price LOCKED when the kid asked (legacy → today's price).
          cost: isPayout ? ((r as any).points ?? 0) : ((r as any).pointCost ?? reward?.pointCost ?? 0),
          title: isPayout ? '💸 Pocket money cash-out' : ((r as any).rewardTitle ?? reward?.title ?? 'Reward'),
        };
      }));
    } catch (e) {
      if (__DEV__) console.error('approvals load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [family?.id]);

  // Live: a kid's new claim (or another parent's decision) shows up without
  // leaving the screen — it used to load once and go stale.
  useEffect(() => {
    if (!family?.id) { load(); return; }
    const unsub = Col.completions(family.id).where('status', '==', 'pending').onSnapshot(
      () => { load(); },
      () => { load(); },
    );
    const unsubRed = Col.redemptions(family.id).where('status', '==', 'pending').onSnapshot(
      () => { load(); },
      () => {},
    );
    return () => { unsub(); unsubRed(); };
  }, [family?.id, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const decide = useCallback(async (row: PendingRow, approve: boolean, why?: string | null) => {
    if (!family?.id || !member?.id || busyId) return;
    const id = row.completion.id;
    setBusyId(id);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (approve) {
        await approveCompletion({ familyId: family.id, completionId: id, approvedBy: member.id });
      } else {
        await rejectCompletion({ familyId: family.id, completionId: id, approvedBy: member.id, reason: why ?? null });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRows((prev) => prev.filter((r) => r.completion.id !== id));
      if (approve) {
        grantPacks([row]);
        if (row.member) setKudosFor({ memberId: row.member.id, name: (row.member.displayName ?? '').split(' ')[0], taskTitle: row.task?.title, completionId: id });
      }
    } catch (e) {
      if (__DEV__) console.error('approval decision failed:', e);
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [family?.id, member?.id, busyId]);

  /**
   * Surprise packs (C8): approving may finish someone's day. Check each
   * (kid, day) once and tell the parent what landed; the kid gets the
   * tap-to-open reveal on their own screen.
   */
  async function grantPacks(approvedRows: PendingRow[]) {
    if (!family?.id) return;
    const seen = new Set<string>();
    const checks: Promise<PackAward[]>[] = [];
    for (const r of approvedRows) {
      const dateKey = r.completion.completedDate;
      if (!dateKey || !r.member) continue;
      const k = `${r.member.id}|${dateKey}`;
      if (seen.has(k)) continue;
      seen.add(k);
      checks.push(checkSurprisePacks({
        familyId: family.id,
        member: { id: r.member.id, isManaged: (r.member as any).isManaged },
        dateKey,
        weekStartDay: family.weekStartDay ?? 1,
      }));
    }
    const awards = (await Promise.all(checks)).flat();
    if (awards.length === 0) return;
    const nameOf = (id: string) => (approvedRows.find((r) => r.member?.id === id)?.member?.displayName ?? 'Someone').split(' ')[0];
    Alert.alert('🎁 Bonus chests!', awards
      .map((a) => `${nameOf(a.memberId)} +${a.points}${a.kind === 'weekly' ? ' (perfect week!)' : ''}`)
      .join('\n'));
  }

  const decideReward = useCallback(async (row: RewardRow, approve: boolean, why?: string | null) => {
    if (!family?.id || !member?.id || busyId) return;
    const id = row.redemption.id;
    setBusyId(id);
    try {
      if (approve) {
        await approveRedemption({
          familyId: family.id, redemptionId: id, memberId: row.redemption.memberId, pointCost: row.cost, approvedBy: member.id,
          ...(row.isPayout ? { reason: `Cashed out (${row.cost} pts)` } : {}),
        });
      } else {
        await rejectRedemption(family.id, id, member.id, why ?? undefined);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRewardRows((prev) => prev.filter((r) => r.redemption.id !== id));
    } catch {
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [family?.id, member?.id, busyId]);

  function confirmSendBack() {
    const sb = sendBack;
    setSendBack(null);
    if (!sb) return;
    if (sb.kind === 'claim') decide(sb.row, false, reason);
    else decideReward(sb.row, false, reason);
  }

  // Bet 1: kids claim through the day, a parent clears the queue in one tap.
  const [approvingAll, setApprovingAll] = useState(false);
  const approveAll = useCallback(() => {
    if (!family?.id || !member?.id || rows.length === 0) return;
    const byKid = new Map<string, number>();
    for (const r of rows) {
      const name = (r.member?.displayName ?? 'Someone').split(' ')[0];
      byKid.set(name, (byKid.get(name) ?? 0) + (r.task?.pointValue ?? r.completion.pointsAwarded ?? 0));
    }
    const summary = Array.from(byKid.entries()).map(([n, p]) => `${n} +${p}`).join(' · ');
    const withPhotos = rows.filter((r) => r.completion.proofPhotoURL).length;
    Alert.alert(
      `Approve all ${rows.length}?`,
      `${summary}${withPhotos ? `\n\nIncludes ${withPhotos} with a proof photo — scroll down first if you want to check them.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '✓ Approve all',
          onPress: async () => {
            setApprovingAll(true);
            try {
              const { approved, failed } = await approveCompletions({
                familyId: family.id, completionIds: rows.map((r) => r.completion.id), approvedBy: member.id,
              });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              if (failed > 0) Alert.alert('Some didn’t go through', `${approved} approved, ${failed} failed. Pull down to retry.`);
              const approvedRows = rows;
              await load();
              await grantPacks(approvedRows);
            } finally {
              setApprovingAll(false);
            }
          },
        },
      ],
    );
  }, [family?.id, member?.id, rows, load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Approvals" subtitle={(rows.length + rewardRows.length) ? `${(rows.length + rewardRows.length)} waiting` : undefined} />

      {isParent && rows.length > 1 && (
        <TouchableOpacity
          style={[styles.approveAllBtn, { backgroundColor: colors.success }]}
          onPress={approveAll}
          disabled={approvingAll || !!busyId}
          accessibilityRole="button"
          accessibilityLabel={`Approve all ${rows.length}`}
        >
          {approvingAll
            ? <ActivityIndicator color={'#1A1830'} />
            : <Text style={styles.approveAllText}>✓ Approve all {rows.length}</Text>}
        </TouchableOpacity>
      )}

      {kudosFor && family?.id && member?.id && (
        <View style={styles.kudosBar} pointerEvents="box-none">
          <Text style={styles.kudosText}>✓ Approved! Send {kudosFor.name} a sticker?</Text>
          <StickerPicker size={32} onPick={(emoji) => {
            const k = kudosFor; setKudosFor(null);
            sendKudos(family.id, { memberId: k.memberId, emoji, fromId: member.id, fromName: (member.displayName ?? 'A grown-up').split(' ')[0], taskTitle: k.taskTitle ?? null, completionId: k.completionId })
              .catch(() => Alert.alert('That didn’t work', 'Could not send the sticker. Please try again.'));
          }} />
        </View>
      )}
      {!isParent ? (
        <View style={styles.empty}>
          <Icon name="lock-closed" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Parents only</Text>
          <Text style={styles.emptySub}>Only a parent can review task approvals.</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : rows.length === 0 && rewardRows.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="checkmark-done-circle" size={56} color={colors.success} />
          <Text style={styles.emptyTitle}>Nothing to approve</Text>
          <Text style={styles.emptySub}>Task claims and reward requests that need your OK show up here.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <Text style={styles.intro}>
            Approve to award the points, or send it back with a quick note.
          </Text>
          {rows.length > 0 && rewardRows.length > 0 && <Text style={styles.section}>TASKS</Text>}
          {rows.map((row) => {
            const id = row.completion.id;
            const pts = row.task?.pointValue ?? row.completion.pointsAwarded ?? 0;
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Avatar emoji={row.member?.avatarEmoji ?? '🦁'} photoURL={row.member?.photoURL} size={40} memberId={row.member?.id} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle} numberOfLines={1}>{row.task?.title ?? 'Task'}</Text>
                    <Text style={styles.taskMeta}>
                      {row.member?.displayName?.split(' ')[0] ?? 'Someone'}  ·  +{pts} pts
                    </Text>
                  </View>
                </View>
                {row.completion.proofPhotoURL ? (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomPhoto(row.completion.proofPhotoURL!)}>
                    <Image source={{ uri: row.completion.proofPhotoURL }} style={styles.proofImg} resizeMode="cover" />
                    <Text style={[styles.proofHint, { color: colors.textMuted }]}>📸 Tap photo to enlarge</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.rejectBtn, { borderColor: colors.danger }]}
                    onPress={() => { setReason(null); setSendBack({ kind: 'claim', row }); }}
                    disabled={busyId === id}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Send back ${row.task?.title ?? 'task'} for ${row.member?.displayName ?? 'member'}`}
                  >
                    {busyId === id
                      ? <ActivityIndicator color={colors.danger} size="small" />
                      : <Text style={[styles.rejectBtnText, { color: colors.textDanger }]}>Send back</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveBtn, { backgroundColor: colors.success }]}
                    onPress={() => decide(row, true)}
                    disabled={busyId === id}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${row.task?.title ?? 'task'} for ${row.member?.displayName ?? 'member'}`}
                  >
                    {busyId === id
                      ? <ActivityIndicator color="#FFF" size="small" />
                      : <Text style={styles.approveBtnText}>Approve</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {rewardRows.length > 0 && <Text style={styles.section}>REWARD REQUESTS</Text>}
          {rewardRows.map((row) => {
            const id = row.redemption.id;
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Avatar emoji={row.member?.avatarEmoji ?? '🦁'} photoURL={row.member?.photoURL} size={40} memberId={row.member?.id} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle} numberOfLines={1}>{row.title}</Text>
                    <Text style={styles.taskMeta}>{row.member?.displayName?.split(' ')[0] ?? 'Someone'}  ·  {row.cost} pts</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.rejectBtn, { borderColor: colors.danger }]} disabled={busyId === id}
                    onPress={() => { setReason(null); setSendBack({ kind: 'reward', row }); }}
                    accessibilityRole="button" accessibilityLabel={`Not this time: ${row.title}`}>
                    <Text style={[styles.rejectBtnText, { color: colors.textDanger }]}>Not this time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.approveBtn, { backgroundColor: colors.success }]} disabled={busyId === id}
                    onPress={() => decideReward(row, true)}
                    accessibilityRole="button" accessibilityLabel={`Approve ${row.title} for ${row.member?.displayName ?? 'member'}`}>
                    {busyId === id ? <ActivityIndicator color="#1A1830" size="small" />
                      : <Text style={styles.approveBtnText}>{row.isPayout ? 'Mark paid' : 'Approve'}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <View style={{ height: kudosFor ? 140 : 0 }} />
        </ScrollView>
      )}

      {/* "Send back" sheet — optional quick reason the kid sees */}
      <Modal visible={!!sendBack} transparent animationType="fade" onRequestClose={() => setSendBack(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSendBack(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {sendBack?.kind === 'reward' ? 'Not this time' : 'Send it back'}
            </Text>
            <Text style={styles.sheetSub}>
              {sendBack?.kind === 'reward'
                ? `No points spent. Add a note for ${sendBack.row.member?.displayName?.split(' ')[0] ?? 'them'}?`
                : `No points yet — the task goes back on ${sendBack?.row.member?.displayName?.split(' ')[0] ?? 'their'}’s list. Add a note?`}
            </Text>
            <View style={styles.reasonWrap}>
              {(sendBack?.kind === 'reward' ? REWARD_REASONS : CLAIM_REASONS).map((r) => (
                <TouchableOpacity key={r} onPress={() => setReason(reason === r ? null : r)}
                  style={[styles.reasonChip, reason === r && { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}
                  accessibilityRole="radio" accessibilityState={{ selected: reason === r }}>
                  <Text style={[styles.reasonText, reason === r && { color: colors.textAccent }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.rejectBtn, { borderColor: colors.border }]} onPress={() => setSendBack(null)} accessibilityRole="button">
                <Text style={[styles.rejectBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.approveBtn, { backgroundColor: colors.primary }]} onPress={confirmSendBack} accessibilityRole="button">
                <Text style={[styles.approveBtnText, { color: '#FFFFFF' }]}>{sendBack?.kind === 'reward' ? 'Say not yet' : 'Send back'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Proof photo lightbox */}
      <Modal visible={!!zoomPhoto} transparent animationType="fade" onRequestClose={() => setZoomPhoto(null)}>
        <Pressable style={styles.lightbox} onPress={() => setZoomPhoto(null)}>
          {zoomPhoto && <Image source={{ uri: zoomPhoto }} style={styles.lightboxImg} resizeMode="contain" />}
          <Text style={styles.lightboxHint}>Tap to close</Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    approveAllBtn: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center', ...Shadow.sm },
    // Floats over the list (it used to push the next Approve button down ~80 px).
    kudosBar: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, bottom: Spacing.lg, zIndex: 10, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary + '40', gap: Spacing.sm, ...Shadow.md },
    section: { fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 1.2, color: colors.textAccent, marginTop: Spacing.sm, marginBottom: Spacing.xs ?? 4 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(10,8,20,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
    sheetTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.black, color: colors.text },
    sheetSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, lineHeight: 20 },
    reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 4 },
    reasonChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    reasonText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textSecondary },
    kudosText: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    approveAllText: { color: '#1A1830', fontSize: FontSize.md, fontFamily: FontFamily.extraBold },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
    backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.textAccent },
    headerTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.text },
    intro: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
    card: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    taskTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    taskMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textMuted, marginTop: 3 },
    proofImg: { width: '100%', height: 180, borderRadius: BorderRadius.md, marginTop: Spacing.md, backgroundColor: colors.background },
    proofHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: 4 },
    lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    lightboxImg: { width: '100%', height: '80%' },
    lightboxHint: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginTop: Spacing.md },
    actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    rejectBtn: { flex: 1, borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center' },
    rejectBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    approveBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center' },
    approveBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#1A1830' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: Spacing.sm },
    emptySub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}
