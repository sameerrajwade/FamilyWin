/**
 * app/app/approvals.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 4.3 task verification — the parent approval queue. Lists completions of
 * approval-required tasks that are waiting (status:'pending'). A parent Approves
 * (points settle via the onCompletionUpdated Cloud Function) or Rejects (no
 * points; the task returns to incomplete for the child).
 *
 * Parent-gated. Opened from the Home banner that appears when approvals are
 * waiting. Points are NEVER set from the client here — the client only flips the
 * completion's status; the CF is the sole writer of the transaction.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import {
  getPendingCompletions, approveCompletion, approveCompletions, rejectCompletion,
  getActiveTasks, getFamilyMembers,
  type CompletionDoc, type TaskDoc, type MemberDoc,
} from '@/lib/firebase';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui';

interface PendingRow {
  completion: CompletionDoc;
  task?: TaskDoc;
  member?: MemberDoc;
}

export default function ApprovalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { member, family } = useAuthStore();
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!family?.id) { setRows([]); setLoading(false); return; }
    try {
      const [pending, tasks, members] = await Promise.all([
        getPendingCompletions(family.id),
        getActiveTasks(family.id),
        getFamilyMembers(family.id),
      ]);
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const memberById = new Map(members.map((m) => [m.id, m]));
      setRows(pending.map((c) => ({
        completion: c,
        task: taskById.get(c.taskId),
        member: memberById.get(c.memberId),
      })));
    } catch (e) {
      if (__DEV__) console.error('approvals load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [family?.id]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (row: PendingRow, approve: boolean) => {
    if (!family?.id || !member?.id || busyId) return;
    const id = row.completion.id;
    setBusyId(id);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (approve) {
        await approveCompletion({ familyId: family.id, completionId: id, approvedBy: member.id });
      } else {
        await rejectCompletion({ familyId: family.id, completionId: id, approvedBy: member.id });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRows((prev) => prev.filter((r) => r.completion.id !== id));
    } catch (e) {
      if (__DEV__) console.error('approval decision failed:', e);
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [family?.id, member?.id, busyId]);

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
              await load();
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
      <ScreenHeader title="Approvals" subtitle={rows.length ? `${rows.length} waiting` : undefined} />

      {isParent && rows.length > 1 && (
        <TouchableOpacity
          style={[styles.approveAllBtn, { backgroundColor: colors.success }]}
          onPress={approveAll}
          disabled={approvingAll || !!busyId}
          accessibilityRole="button"
          accessibilityLabel={`Approve all ${rows.length}`}
        >
          {approvingAll
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.approveAllText}>✓ Approve all {rows.length}</Text>}
        </TouchableOpacity>
      )}

      {!isParent ? (
        <View style={styles.empty}>
          <Icon name="lock-closed" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Parents only</Text>
          <Text style={styles.emptySub}>Only a parent can review task approvals.</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="checkmark-done-circle" size={56} color={colors.success} />
          <Text style={styles.emptyTitle}>Nothing to approve</Text>
          <Text style={styles.emptySub}>Completions that need approval will show up here.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}>
          <Text style={styles.intro}>
            Approve to award the points, or reject to send the task back.
          </Text>
          {rows.map((row) => {
            const id = row.completion.id;
            const pts = row.task?.pointValue ?? row.completion.pointsAwarded ?? 0;
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Avatar emoji={row.member?.avatarEmoji ?? '🦁'} photoURL={row.member?.photoURL} size={40} />
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
                    onPress={() => decide(row, false)}
                    disabled={busyId === id}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Reject ${row.task?.title ?? 'task'} for ${row.member?.displayName ?? 'member'}`}
                  >
                    {busyId === id
                      ? <ActivityIndicator color={colors.danger} size="small" />
                      : <Text style={[styles.rejectBtnText, { color: colors.danger }]}>Reject</Text>}
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
        </ScrollView>
      )}

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
    approveAllText: { color: '#FFFFFF', fontSize: FontSize.md, fontFamily: FontFamily.extraBold },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
    backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.primary },
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
    approveBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFFFFF' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: Spacing.sm },
    emptySub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}
