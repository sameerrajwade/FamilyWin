/**
 * rewards.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Rewards Store — parents create rewards, members redeem them.
 *
 * POINTS DESIGN:
 *   • "This week" points = sum of transactions from weekStart → now
 *     (same number shown on Leaderboard/Tasks — loaded from Zustand weeklyTotals)
 *   • "All-time bank" = sum of ALL transactions ever (earned - spent on rewards)
 *     (lets kids save up across weeks for expensive rewards)
 *   • Points NEVER reset to 0. The leaderboard just filters by weekStart.
 *   • "Can afford" check uses all-time bank balance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sounds } from '@/lib/sounds';
import { Col, getActiveRewards, requestRedemption, approveRedemption, rejectRedemption, createReward, getFamilyMembers } from '@/lib/firebase';
import { useAuthStore, usePointsStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import type { RewardDoc, RedemptionDoc } from '@/lib/firebase';

export default function RewardsScreen() {
  const { member, family, actingAsMember } = useAuthStore();
  const effectiveMember = actingAsMember ?? member;

  const { weeklyTotals, setWeeklyTotals } = usePointsStore();
  const { members, setMembers } = useFamilyStore();
  const { colors } = useTheme();

  const [rewards, setRewards] = useState<RewardDoc[]>([]);
  const [redemptions, setRedemptions] = useState<(RedemptionDoc & { rewardTitle?: string })[]>([]);
  const [pendingRedemptions, setPendingRedemptions] = useState<(RedemptionDoc & {
    rewardTitle?: string; rewardCost?: number; memberName?: string; memberEmoji?: string; memberPhotoURL?: string;
  })[]>([]);

  // weekPoints: from Zustand (fast, same as leaderboard)
  // bankBalance: all-time balance from Firestore (for "can afford" and savings)
  const weekPoints = weeklyTotals[effectiveMember?.id ?? ''] ?? 0;
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; memberName?: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  // Reload members when screen is focused
  useFocusEffect(useCallback(() => {
    if (family?.id) {
      getFamilyMembers(family.id).then((list) => setMembers(list as any)).catch(() => {});
    }
  }, [family?.id]));

  const loadData = useCallback(async () => {
    if (!family?.id || !effectiveMember?.id) return;
    try {
      // ── 1. Rewards list ──────────────────────────────────────────────────
      const rewardsList = await getActiveRewards(family.id);
      setRewards(rewardsList);

      // ── 2. All-time bank balance (earned - spent) ─────────────────────────
      // Sum ALL transactions for this member, positive (earned) + negative (spent)
      try {
        const txSnap = await Col.transactions(family.id)
          .where('memberId', '==', effectiveMember.id)
          .get();
        const allTimeBalance = txSnap.docs.reduce(
          (sum, d) => sum + ((d.data().delta as number) ?? 0), 0,
        );
        setBankBalance(allTimeBalance);

        // Also update Zustand weeklyTotals for this member from a fresh weekly query
        const now = new Date();
        const weekStart = new Date(now);
        // Monday of current week
        const day = weekStart.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        weekStart.setDate(weekStart.getDate() + diff);
        weekStart.setHours(0, 0, 0, 0);

        // Exclude redemptions from the "this week" total so it matches the leaderboard
        const weeklyTotal = txSnap.docs
          .filter((d) => {
            const data = d.data();
            const ts = data.createdAt?.toDate?.();
            return ts && ts >= weekStart && data.source !== 'redemption';
          })
          .reduce((sum, d) => sum + ((d.data().delta as number) ?? 0), 0);

        setWeeklyTotals({ ...weeklyTotals, [effectiveMember.id]: weeklyTotal });
      } catch (txErr) {
        // Points query failed — weeklyTotals from Zustand still shown as fallback
        if (__DEV__) console.warn('Points query failed:', txErr);
      }

      // ── 3. Redemption history for this profile ────────────────────────────
      const myRedSnap = await Col.redemptions(family.id)
        .where('memberId', '==', effectiveMember.id)
        .get();
      const myRed = myRedSnap.docs
        .map((d) => {
          const red = { id: d.id, ...d.data() } as RedemptionDoc;
          const matchedReward = rewardsList.find((r) => r.id === red.rewardId);
          return { ...red, rewardTitle: matchedReward?.title ?? 'Reward' };
        })
        .sort((a, b) => {
          const aT = (a.redeemedAt as any)?.toDate?.()?.getTime?.() ?? 0;
          const bT = (b.redeemedAt as any)?.toDate?.()?.getTime?.() ?? 0;
          return bT - aT;
        });
      setRedemptions(myRed);

      // ── 4. Pending approvals (parents only — all family members) ──────────
      if (isParent) {
        const pendingSnap = await Col.redemptions(family.id)
          .where('status', '==', 'pending')
          .get();
        // Batch-fetch all members once (not one-by-one) to avoid N+1 reads
        const allMembers = members.length > 0 ? members : await getFamilyMembers(family.id);
        const pendingList = pendingSnap.docs.map((d) => {
          const red = { id: d.id, ...d.data() } as RedemptionDoc;
          const matchedReward = rewardsList.find((r) => r.id === red.rewardId);
          const matchedMember = allMembers.find((m) => m.id === red.memberId);
          return {
            ...red,
            rewardTitle: matchedReward?.title ?? 'Reward',
            rewardCost: matchedReward?.pointCost ?? 0,
            memberName: matchedMember?.displayName,
            memberEmoji: matchedMember?.avatarEmoji,
            memberPhotoURL: matchedMember?.photoURL,
          };
        });
        setPendingRedemptions(pendingList);
      }
    } catch (error) {
      if (__DEV__) console.error('Rewards loadData error:', error);
      Alert.alert('Load Error', 'Could not load rewards. Please pull down to refresh.');
    } finally {
      setIsLoading(false);
    }
  }, [family?.id, effectiveMember?.id, isParent]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Points to use for "can afford" check:
  // Prefer all-time bank balance; fall back to this week's points from Zustand
  const spendablePoints = bankBalance !== null ? bankBalance : weekPoints;

  async function handleRedeem(reward: RewardDoc) {
    if (!effectiveMember?.id || !family?.id) return;
    if (spendablePoints < reward.pointCost) {
      const name = actingAsMember ? actingAsMember.displayName.split(' ')[0] : 'You';
      Alert.alert(
        'Not Enough Points',
        `${name} need${actingAsMember ? 's' : ''} ${reward.pointCost - spendablePoints} more points to redeem "${reward.title}".`,
      );
      return;
    }
    const whoLabel = actingAsMember ? ` for ${actingAsMember.displayName}` : '';
    Alert.alert(
      `Redeem "${reward.title}"?${whoLabel}`,
      `This costs ${reward.pointCost} pts. A parent will approve it soon.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request 🎁',
          onPress: async () => {
            try {
              setRedeemingId(reward.id);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Sounds.rewardRedeemed();
              await requestRedemption({
                familyId: family.id,
                rewardId: reward.id,
                memberId: effectiveMember.id,
              });
              Alert.alert('Request Sent! 🎉', 'A parent will approve your reward soon.');
              loadData();
            } catch {
              Alert.alert('Error', 'Could not submit redemption request.');
            } finally {
              setRedeemingId(null);
            }
          },
        },
      ],
    );
  }

  async function handleApprove(redemptionId: string, memberId: string, pointCost: number, memberName?: string, rewardTitle?: string) {
    if (!family?.id || !member?.id) return;
    Alert.alert(
      'Approve Reward?',
      `Approve "${rewardTitle}" for ${memberName ?? 'member'}? This deducts ${pointCost} pts from their balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '✓ Approve',
          onPress: async () => {
            try {
              await approveRedemption({
                familyId: family!.id, redemptionId, memberId, pointCost, approvedBy: member!.id,
              });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Sounds.rewardApproved();
              loadData();
            } catch {
              Alert.alert('Error', 'Could not approve redemption.');
            }
          },
        },
      ],
    );
  }

  function handleReject(redemptionId: string, memberName?: string) {
    setRejectReason('');
    setRejectModal({ id: redemptionId, memberName });
  }

  async function confirmReject() {
    if (!family?.id || !member?.id || !rejectModal) return;
    try {
      await rejectRedemption(family.id, rejectModal.id, member.id, rejectReason.trim() || undefined);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setRejectModal(null);
      loadData();
    } catch {
      Alert.alert('Error', 'Could not reject redemption.');
    }
  }

  const profileName = actingAsMember
    ? `${actingAsMember.avatarEmoji} ${actingAsMember.displayName.split(' ')[0]}`
    : `${member?.avatarEmoji ?? ''} You`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>

      {/* Profile tab bar — parents with managed children */}
      {isParent && members.some((m) => m.isManaged) && (
        <ProfileTabBar
          members={members}
          self={member!}
          activeId={actingAsMember?.id ?? member?.id ?? ''}
          onSelect={(m) => {
            useAuthStore.getState().setActingAsMember(m?.id === member?.id ? null : m);
          }}
          colors={colors}
        />
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Header — points summary */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>🎁 Rewards Store</Text>
            {/* Primary: all-time bank balance (for spending) */}
            <View style={[styles.pointsCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
              <View style={styles.pointsRow}>
                <View>
                  <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>
                    {actingAsMember ? `${actingAsMember.displayName.split(' ')[0]}'s` : 'Your'} Points
                  </Text>
                  <Text style={[styles.pointsBig, { color: colors.primary }]}>
                    {bankBalance !== null ? bankBalance : weekPoints}
                    <Text style={[styles.pointsSuffix, { color: colors.textSecondary }]}> pts</Text>
                  </Text>
                  {bankBalance === null && (
                    <Text style={[styles.pointsHint, { color: colors.textMuted }]}>
                      (loading balance…)
                    </Text>
                  )}
                </View>
                <View style={styles.pointsBreakdown}>
                  <Text style={[styles.pointsBreakdownItem, { color: colors.textSecondary }]}>
                    📅 This week: <Text style={{ color: colors.primary, fontFamily: FontFamily.bold }}>{weekPoints} pts</Text>
                  </Text>
                  {bankBalance !== null && bankBalance !== weekPoints && (
                    <Text style={[styles.pointsBreakdownItem, { color: colors.textSecondary }]}>
                      💰 All-time: <Text style={{ color: colors.primary, fontFamily: FontFamily.bold }}>{bankBalance} pts</Text>
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>
          {isParent && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.addBtnText}>＋ Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            {/* Rewards grid */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Available Rewards</Text>
              {rewards.length === 0 ? (
                <EmptyState
                  emoji="🎁"
                  title="No rewards yet"
                  subtitle={isParent ? 'Tap + Add to create your first reward' : 'Ask a parent to add rewards'}
                  colors={colors}
                />
              ) : (
                <View style={styles.rewardsGrid}>
                  {rewards.map((reward) => (
                    <RewardCard
                      key={reward.id}
                      reward={reward}
                      spendablePoints={spendablePoints}
                      isRedeeming={redeemingId === reward.id}
                      onRedeem={() => handleRedeem(reward)}
                      colors={colors}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Pending approvals — parents only */}
            {isParent && pendingRedemptions.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  ⏳ Pending Approvals ({pendingRedemptions.length})
                </Text>
                {pendingRedemptions.map((r) => (
                  <View key={r.id} style={[styles.historyRow, styles.pendingRow, { backgroundColor: colors.surface }]}>
                    <Avatar emoji={r.memberEmoji ?? '👤'} photoURL={r.memberPhotoURL} size={28} />
                    <View style={styles.historyInfo}>
                      <Text style={[styles.historyTitle, { color: colors.text }]}>{r.memberName} wants</Text>
                      <Text style={[styles.historySubtitle, { color: colors.textSecondary }]}>
                        {r.rewardTitle} · {r.rewardCost} pts
                      </Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleApprove(r.id, r.memberId, r.rewardCost ?? 0, r.memberName, r.rewardTitle)}
                        accessibilityLabel={`Approve ${r.rewardTitle} for ${r.memberName}`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.approveBtnText}>✓ Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: colors.danger }]}
                        onPress={() => handleReject(r.id, r.memberName)}
                        accessibilityLabel={`Reject ${r.rewardTitle} for ${r.memberName}`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.approveBtnText}>✗ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Redemption history */}
            {redemptions.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {actingAsMember ? `${actingAsMember.displayName.split(' ')[0]}'s History` : 'My Redemption History'}
                </Text>
                {redemptions.slice(0, 8).map((r) => (
                  <View key={r.id} style={[styles.historyRow, { backgroundColor: colors.surface }]}>
                    <Text style={styles.historyEmoji}>
                      {r.status === 'approved' ? '✅' : r.status === 'rejected' ? '❌' : '⏳'}
                    </Text>
                    <View style={styles.historyInfo}>
                      <Text style={[styles.historyTitle, { color: colors.text }]}>{r.rewardTitle}</Text>
                      <Text style={[styles.historySubtitle, { color: colors.textSecondary }]}>
                        {(r.redeemedAt as any)?.toDate?.()?.toLocaleDateString?.() ?? ''}
                      </Text>
                      {r.status === 'rejected' && (r as any).rejectionReason ? (
                        <Text style={[styles.historySubtitle, { color: colors.danger, marginTop: 2 }]}>
                          "{(r as any).rejectionReason}"
                        </Text>
                      ) : null}
                    </View>
                    <StatusBadge status={r.status} />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Reject reason modal ── */}
      {rejectModal && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setRejectModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
                <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Reject Request ❌</Text>
                <Text style={[{ fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginBottom: Spacing.md }]}>
                  Optional: tell {rejectModal.memberName ?? 'the member'} why this was rejected.
                </Text>
                <TextInput
                  style={[{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: Spacing.md, fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.text, backgroundColor: colors.background, minHeight: 80, textAlignVertical: 'top' }]}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="e.g. Let's save up for something bigger first..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={200}
                  accessibilityLabel="Rejection reason"
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setRejectModal(null)}>
                    <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.danger }]} onPress={confirmReject}>
                    <Text style={styles.primaryBtnText}>✗ Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {showCreateModal && (
        <CreateRewardModal
          familyId={family?.id ?? ''}
          memberId={member?.id ?? ''}
          colors={colors}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadData(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Profile Tab Bar ──────────────────────────────────────────────────────────

function ProfileTabBar({ members, self, activeId, onSelect, colors }: {
  members: any[]; self: any; activeId: string;
  onSelect: (m: any) => void; colors: any;
}) {
  const allProfiles = [self, ...members.filter((m: any) => m.isManaged && m.id !== self.id)];
  if (allProfiles.length < 2) return null;
  return (
    <View style={[ptStyles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {allProfiles.map((p) => {
          const active = p.id === activeId;
          return (
            <TouchableOpacity
              key={p.id}
              style={[ptStyles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              onPress={() => onSelect(p)}
            >
              <Avatar emoji={p.avatarEmoji} photoURL={(p as any).photoURL} size={28} />
              <Text style={[ptStyles.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                {p.id === self.id ? 'Me' : p.displayName.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const ptStyles = StyleSheet.create({
  bar: { borderBottomWidth: 1, paddingHorizontal: Spacing.md },
  tab: { alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8, marginRight: 4 },
  tabLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginTop: 2 },
});

// ─── Reward Card ──────────────────────────────────────────────────────────────

function RewardCard({ reward, spendablePoints, isRedeeming, onRedeem, colors }: {
  reward: RewardDoc; spendablePoints: number; isRedeeming: boolean;
  onRedeem: () => void; colors: any;
}) {
  const canAfford = spendablePoints >= reward.pointCost;
  return (
    <View style={[styles.rewardCard, { backgroundColor: colors.surface }, !canAfford && styles.rewardCardDisabled]}>
      <Text style={[styles.rewardTitle, { color: colors.text }]}>{reward.title}</Text>
      {reward.description ? (
        <Text style={[styles.rewardDesc, { color: colors.textSecondary }]}>{reward.description}</Text>
      ) : null}
      <View style={styles.rewardFooter}>
        <View style={styles.rewardCostRow}>
          <Text style={[styles.rewardCostValue, { color: canAfford ? colors.primary : colors.danger }]}>
            {reward.pointCost}
          </Text>
          <Text style={[styles.rewardCostLabel, { color: colors.textSecondary }]}> pts</Text>
        </View>
        <Pressable
          android_disableSound
          style={[styles.redeemBtn, { backgroundColor: canAfford ? colors.primary : colors.textMuted }]}
          onPress={onRedeem}
          disabled={!canAfford || isRedeeming}
        >
          {isRedeeming
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={styles.redeemBtnText}>{canAfford ? 'Redeem 🎁' : 'Need More'}</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { colors } = useTheme();
  const configs: Record<string, { bg: string; color: string; label: string }> = {
    pending:  { bg: colors.warning + '22', color: colors.warning, label: 'Pending' },
    approved: { bg: colors.success + '22', color: colors.success, label: 'Approved' },
    rejected: { bg: colors.danger + '22',  color: colors.danger,  label: 'Rejected' },
  };
  const cfg = configs[status] ?? { bg: colors.border, color: colors.textMuted, label: status };
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Create Reward Modal ──────────────────────────────────────────────────────

function CreateRewardModal({ familyId, memberId, colors, onClose, onCreated }: {
  familyId: string; memberId: string; colors: any;
  onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pointCost, setPointCost] = useState('50');
  const [isLoading, setIsLoading] = useState(false);

  const QUICK_PRESETS = [
    { label: '30min Screen Time', cost: '30' },
    { label: 'Stay Up Late', cost: '75' },
    { label: 'Choose Dinner', cost: '100' },
    { label: 'Skip One Chore', cost: '60' },
    { label: 'Movie Night Pick', cost: '80' },
    { label: 'No Bedtime Story Tonight', cost: '20' },
    { label: 'Ice Cream Trip', cost: '150' },
  ];

  async function handleCreate() {
    if (!title.trim()) { Alert.alert('Missing Title', 'Please enter a reward title.'); return; }
    const cost = parseInt(pointCost, 10);
    if (!cost || cost <= 0) { Alert.alert('Invalid Points', 'Please enter a valid point cost.'); return; }
    try {
      setIsLoading(true);
      await createReward({
        familyId,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        pointCost: cost,
        createdBy: memberId,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated();
    } catch (err) {
      if (__DEV__) console.error('createReward error:', err);
      Alert.alert('Error', 'Could not create reward. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Reward 🎁</Text>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Quick Presets</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {QUICK_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.preset, { borderColor: colors.primary + '44', backgroundColor: colors.primary + '12' }]}
                    onPress={() => { setTitle(p.label); setPointCost(p.cost); }}
                  >
                    <Text style={[styles.presetText, { color: colors.primary }]}>{p.label}</Text>
                    <Text style={[styles.presetCost, { color: colors.textSecondary }]}>{p.cost} pts</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Reward Title *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. 30 min extra screen time"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.modalLabel, { color: colors.text }]}>Description (optional)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Any conditions or details..."
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.modalLabel, { color: colors.text }]}>Point Cost *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={pointCost}
              onChangeText={setPointCost}
              keyboardType="number-pad"
              placeholder="50"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, isLoading && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={isLoading}
              >
                {isLoading
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={styles.primaryBtnText}>Create ✓</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ emoji, title, subtitle, colors }: {
  emoji: string; title: string; subtitle: string; colors: any;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.lg, gap: Spacing.sm },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, marginBottom: Spacing.sm },
  pointsCard: { borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5 },
  pointsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pointsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginBottom: 2 },
  pointsBig: { fontSize: 32, fontFamily: FontFamily.extraBold },
  pointsSuffix: { fontSize: FontSize.md, fontFamily: FontFamily.regular },
  pointsHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  pointsBreakdown: { alignItems: 'flex-end', gap: 4 },
  pointsBreakdownItem: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },

  addBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, alignSelf: 'flex-start', marginTop: Spacing.xl + 4 },
  addBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },

  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, marginBottom: Spacing.sm },

  rewardsGrid: { gap: Spacing.sm },
  rewardCard: { borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
  rewardCardDisabled: { opacity: 0.55 },
  rewardTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, marginBottom: 4 },
  rewardDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginBottom: Spacing.sm },
  rewardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  rewardCostRow: { flexDirection: 'row', alignItems: 'baseline' },
  rewardCostValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  rewardCostLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  redeemBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  redeemBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },

  historyRow: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.sm },
  pendingRow: { borderWidth: 1.5, borderColor: Colors.warning + '66' },
  historyEmoji: { fontSize: 28 },
  historyInfo: { flex: 1 },
  historyTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  historySubtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  approveBtn: { backgroundColor: Colors.success, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, minWidth: 80, alignItems: 'center' },
  approveBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: '#FFF' },

  statusBadge: { borderRadius: 20, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, marginBottom: 4 },
  emptySubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center', paddingHorizontal: Spacing.lg },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, marginBottom: Spacing.md },
  modalLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginBottom: 6, marginTop: Spacing.sm },
  modalInput: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular, marginBottom: 4 },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  primaryBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
  preset: { borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', minWidth: 100 },
  presetText: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, textAlign: 'center' },
  presetCost: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
});
