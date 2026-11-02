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
import { useFocusEffect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sounds } from '@/lib/sounds';
import { SlideIn, ScalePress } from '@/components/ui/Animations';
import { Col, getActiveRewards, requestRedemption, approveRedemption, rejectRedemption, createReward, deactivateReward, getFamilyMembers, requestPayout, setSavingFor } from '@/lib/firebase';
import { SavingGoalCard } from '@/components/ui/SavingGoal';
import { pointsToCash, formatCash, pointsForOneUnit, DEFAULT_ALLOWANCE_RATE } from '@/lib/pointsEngine';
import { ShareCardModal, shareContext, type ShareCardData } from '@/components/ui/ShareCard';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { rewardIcon } from '@/lib/rewardIcon';
import { useAuthStore, usePointsStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { BrandBar } from '@/components/ui/Brand';
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
    rewardTitle?: string; rewardCost?: number; memberName?: string; memberEmoji?: string; memberPhotoURL?: string; isPayout?: boolean;
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
  const [showAllRedemptions, setShowAllRedemptions] = useState(false);

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  // Members come from the shared listener in tabs/_layout.tsx (Phase 4 read-min).

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
          const matchedMember = allMembers.find((m) => m.id === red.memberId);
          // A payout (cash-out) has no reward — label it with its cash value.
          const isPayout = red.kind === 'payout';
          const matchedReward = isPayout ? undefined : rewardsList.find((r) => r.id === red.rewardId);
          return {
            ...red,
            isPayout,
            rewardTitle: isPayout ? `💸 Cash out ${formatCash(red.cashAmount ?? 0, red.currency ?? '$')}` : (red.rewardTitle ?? matchedReward?.title ?? 'Reward'),
            // Charge the price LOCKED when the kid asked; only legacy requests
            // (made before the lock) fall back to today's price.
            rewardCost: isPayout ? (red.points ?? 0) : (red.pointCost ?? matchedReward?.pointCost ?? 0),
            memberName: matchedMember?.displayName,
            memberEmoji: matchedMember?.avatarEmoji,
            memberPhotoURL: matchedMember?.photoURL,
          };
        });
        setPendingRedemptions(pendingList);
      }
    } catch (error) {
      if (__DEV__) console.error('Rewards loadData error:', error);
      Alert.alert('Couldn’t load', 'Could not load rewards. Please pull down to refresh.');
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

  // E2 save for a reward: the pinned reward comes from the live members cache
  // (so a pin made on another device shows here); local state makes taps instant.
  const liveMember = members.find((m: any) => m.id === effectiveMember?.id) as any;
  const [savingOverride, setSavingOverride] = useState<{ memberId: string; rewardId: string | null } | null>(null);
  const savingForId = savingOverride && savingOverride.memberId === effectiveMember?.id
    ? savingOverride.rewardId
    : (liveMember?.savingForRewardId ?? (effectiveMember as any)?.savingForRewardId ?? null);
  const savingReward = rewards.find((r) => r.id === savingForId) ?? null;

  async function toggleSaving(reward: RewardDoc) {
    if (!family?.id || !effectiveMember?.id) return;
    const next = savingForId === reward.id ? null : reward.id;
    setSavingOverride({ memberId: effectiveMember.id, rewardId: next });
    Haptics.selectionAsync().catch(() => {});
    try {
      await setSavingFor(family.id, effectiveMember.id, next);
    } catch {
      setSavingOverride(null);
      Alert.alert('That didn’t work', 'Could not save that. Please try again.');
    }
  }

  // Virtual allowance (Phase 5 #3)
  const allowanceOn = !!family?.allowanceEnabled;
  const rate = family?.allowancePointsPerUnit ?? DEFAULT_ALLOWANCE_RATE;
  const currency = family?.allowanceCurrency ?? '$';
  const cashValue = pointsToCash(spendablePoints, rate);
  const canCashOut = allowanceOn && spendablePoints >= pointsForOneUnit(rate);

  async function handleCashOut() {
    if (!effectiveMember?.id || !family?.id) return;
    const name = actingAsMember ? actingAsMember.displayName.split(' ')[0] : 'You';
    Alert.alert(
      `Cash out ${formatCash(cashValue, currency)}?`,
      `${name} will request ${spendablePoints} pts (${formatCash(cashValue, currency)}). A parent approves it, then the points are spent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request payout',
          onPress: async () => {
            try {
              await requestPayout({ familyId: family.id, memberId: effectiveMember.id, points: spendablePoints, cashAmount: cashValue, currency });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Payout requested 💸', 'A parent will approve it from the Rewards screen.');
              loadData();
            } catch { Alert.alert('That didn’t work', 'Could not request the payout.'); }
          },
        },
      ],
    );
  }

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
                pointCost: reward.pointCost,
                rewardTitle: reward.title,
              });
              Alert.alert('Request sent 🎉', 'A parent will approve your reward soon.');
              loadData();
            } catch {
              Alert.alert('That didn’t work', 'Could not submit redemption request.');
            } finally {
              setRedeemingId(null);
            }
          },
        },
      ],
    );
  }



  async function handleApprove(redemptionId: string, memberId: string, pointCost: number, memberName?: string, rewardTitle?: string, isPayout?: boolean) {
    if (!family?.id || !member?.id) return;
    Alert.alert(
      isPayout ? 'Approve payout?' : 'Approve Reward?',
      isPayout
        ? `Mark ${rewardTitle} as paid to ${memberName ?? 'them'}? This spends ${pointCost} pts.`
        : `Approve "${rewardTitle}" for ${memberName ?? 'member'}? This deducts ${pointCost} pts from their balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPayout ? '✓ Mark paid' : '✓ Approve',
          onPress: async () => {
            try {
              await approveRedemption({
                familyId: family!.id, redemptionId, memberId, pointCost, approvedBy: member!.id,
                ...(isPayout ? { reason: `Cashed out (${pointCost} pts)` } : {}),
              });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Sounds.rewardApproved();
              loadData();
              const who = (memberName ?? 'They').split(' ')[0];
              if (isPayout) {
                Alert.alert('Paid out 💸', `${who}'s ${rewardTitle?.replace('💸 ', '')} is done.`);
              } else {
                Alert.alert('Reward approved! 🎉', `${who} unlocked "${rewardTitle}".`, [
                  { text: 'Not now', style: 'cancel' },
                  {
                    text: 'Share 🎉',
                    onPress: () => setShareData({
                      icon: 'coin',
                      hero: '🎁',
                      theme: 'reward',
                      eyebrow: 'REWARD UNLOCKED',
                      context: shareContext(family?.name),
                      title: `${who} earned "${rewardTitle}"!`,
                      subtitle: 'Chores done → points earned → reward unlocked.',
                      stats: [{ value: `${pointCost}`, label: 'points spent' }],
                      shareMessage: `${who} just redeemed "${rewardTitle}" on Chore League! 🎁`,
                    }),
                  },
                ]);
              }
            } catch {
              Alert.alert('That didn’t work', 'Could not approve.');
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
      Alert.alert('That didn’t work', 'Could not reject redemption.');
    }
  }

  const profileName = actingAsMember
    ? `${actingAsMember.avatarEmoji} ${actingAsMember.displayName.split(' ')[0]}`
    : `${member?.avatarEmoji ?? ''} You`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>

      {/* Brand always sits on top, above the family profile switcher */}
      <BrandBar />
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
          <View style={styles.headerTopRow}>
            {/* Tab name intentionally omitted — the bottom "Rewards" tab + the
                Points Vault below already identify this screen. */}
            <View style={{ flex: 1 }} />
            {isParent && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowCreateModal(true)}
                accessibilityLabel="Add a reward"
                accessibilityRole="button"
              >
                <Text style={styles.addBtnText}>＋ Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Primary: all-time bank balance (for spending) — full width */}
          <View style={[styles.pointsCard, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
              <View style={styles.pointsRow}>
                <View>
                  <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>
                    💰 {actingAsMember ? `${actingAsMember.displayName.split(' ')[0]}'s` : 'Your'} Points Vault
                  </Text>
                  <Text style={[styles.pointsBig, { color: colors.textAccent }]}>
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
                    📅 This week: <Text style={{ color: colors.textAccent, fontFamily: FontFamily.bold }}>{weekPoints} pts</Text>
                  </Text>
                  {bankBalance !== null && bankBalance !== weekPoints && (
                    <Text style={[styles.pointsBreakdownItem, { color: colors.textSecondary }]}>
                      💰 All-time: <Text style={{ color: colors.textAccent, fontFamily: FontFamily.bold }}>{bankBalance} pts</Text>
                    </Text>
                  )}
                </View>
              </View>
              {allowanceOn && (
                <View style={[styles.cashRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.cashValue, { color: colors.textSuccess }]}>
                    ≈ {formatCash(cashValue, currency)}
                    <Text style={[styles.pointsHint, { color: colors.textMuted }]}>  ({rate} pts = {currency}1)</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.cashOutBtn, { backgroundColor: canCashOut ? colors.success : colors.border }]}
                    onPress={handleCashOut}
                    disabled={!canCashOut}
                    accessibilityRole="button"
                    accessibilityLabel="Cash out points"
                  >
                    <Text style={[styles.cashOutText, { color: canCashOut ? '#FFF' : colors.textMuted }]}>💸 Cash out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          {savingReward && (
            <SavingGoalCard
              reward={savingReward}
              spendable={spendablePoints}
              name={actingAsMember ? actingAsMember.displayName.split(' ')[0] : undefined}
              onUnpin={() => toggleSaving(savingReward)}
            />
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            {/* Rewards grid */}
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Available Rewards</Text>
                {isParent && rewards.length > 0 && (
                  <TouchableOpacity onPress={() => router.push('/app/reward/packs' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.packsLink, { color: colors.textAccent }]}>🎁 Packs</Text>
                  </TouchableOpacity>
                )}
              </View>
              {rewards.length === 0 ? (
                <View>
                  <EmptyState
                    emoji="🎁"
                    title="No rewards yet"
                    subtitle={isParent ? 'Add a ready-made reward pack, or create your own.' : 'Ask a parent to add rewards'}
                    colors={colors}
                  />
                  {isParent && (
                    <TouchableOpacity
                      style={[styles.packsCta, { backgroundColor: colors.primary }]}
                      onPress={() => router.push('/app/reward/packs' as any)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.packsCtaText}>🎁 Browse reward packs</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.rewardsGrid}>
                  {rewards.map((reward, index) => (
                    <SlideIn key={reward.id} delay={100 + index * 100} from="bottom">
                      <ScalePress onPress={() => {}} style={undefined}>
                        <RewardCard
                          reward={reward}
                          spendablePoints={spendablePoints}
                          isRedeeming={redeemingId === reward.id}
                          onRedeem={() => handleRedeem(reward)}
                          isSaving={savingForId === reward.id}
                          onToggleSave={() => toggleSaving(reward)}
                          isParent={isParent}
                          onRemove={() => router.push({ pathname: '/app/manage/[kind]' as any, params: { kind: 'rewards', edit: reward.id } })}
                          colors={colors}
                        />
                      </ScalePress>
                    </SlideIn>
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
                    <Avatar emoji={r.memberEmoji ?? '👤'} photoURL={r.memberPhotoURL} size={28} memberId={r.memberId} />
                    <View style={styles.historyInfo}>
                      <Text style={[styles.historyTitle, { color: colors.text }]}>{r.memberName} wants</Text>
                      <Text style={[styles.historySubtitle, { color: colors.textSecondary }]}>
                        {r.rewardTitle} · {r.rewardCost} pts
                      </Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleApprove(r.id, r.memberId, r.rewardCost ?? 0, r.memberName, r.rewardTitle, r.isPayout)}
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
                {(showAllRedemptions ? redemptions : redemptions.slice(0, 5)).map((r) => (
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
                        <Text style={[styles.historySubtitle, { color: colors.textDanger, marginTop: 2 }]}>
                          "{(r as any).rejectionReason}"
                        </Text>
                      ) : null}
                    </View>
                    <StatusBadge status={r.status} />
                  </View>
                ))}
                {redemptions.length > 5 && (
                  <TouchableOpacity style={[styles.seeAllBtn, { borderColor: colors.border }]} onPress={() => setShowAllRedemptions((v) => !v)} accessibilityRole="button">
                    <Text style={[styles.seeAllText, { color: colors.textAccent }]}>
                      {showAllRedemptions ? 'Show less' : `See all ${redemptions.length}`}
                    </Text>
                  </TouchableOpacity>
                )}
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
                <Text style={[styles.modalTitle, { color: colors.text }]}>Not this time?</Text>
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

      {/* Branded reward-unlocked share card */}
      <ShareCardModal visible={!!shareData} data={shareData} onClose={() => setShareData(null)} />
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
              <Avatar emoji={p.avatarEmoji} photoURL={(p as any).photoURL} size={28} memberId={p.id} />
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



function RewardCard({ reward, spendablePoints, isRedeeming, onRedeem, isSaving, onToggleSave, isParent, onRemove, colors }: {
  reward: RewardDoc; spendablePoints: number; isRedeeming: boolean;
  onRedeem: () => void; isSaving?: boolean; onToggleSave?: () => void;
  isParent?: boolean; onRemove?: () => void; colors: any;
}) {
  const canAfford = spendablePoints >= reward.pointCost;
  const remaining = Math.max(0, reward.pointCost - spendablePoints);
  // Clamp to 0–1: a negative balance (e.g. after a penalty) must not render as a
  // full or overflowing bar.
  const progress = reward.pointCost > 0 ? Math.max(0, Math.min(1, spendablePoints / reward.pointCost)) : 1;
  return (
    <View style={[styles.rewardCard, { backgroundColor: colors.surface }, !canAfford && styles.rewardCardDisabled]}>
      <View style={styles.rewardTop}>
        <View style={[styles.rewardIconBox, { backgroundColor: colors.primary + '18' }]}>
          <EmojiIcon emoji={rewardIcon(reward)} size={32} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rewardTitle, { color: colors.text }]}>{reward.title}</Text>
          {reward.description ? (
            <Text style={[styles.rewardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{reward.description}</Text>
          ) : null}
        </View>
        <View style={styles.rewardCostRow}>
          <Text style={[styles.rewardCostValue, { color: canAfford ? colors.primary : colors.text }]}>
            {reward.pointCost}
          </Text>
          <Text style={[styles.rewardCostLabel, { color: colors.textSecondary }]}>pts</Text>
        </View>
      </View>

      {/* Progress-to-afford: a motivating "N pts to go" bar until it's earned */}
      {!canAfford && (
        <View style={styles.affordWrap}>
          <View style={[styles.affordTrack, { backgroundColor: colors.primary + '1A' }]}>
            <View style={[styles.affordFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.affordLabel, { color: colors.textSecondary }]}>
            <Text style={{ color: colors.textAccent, fontFamily: FontFamily.extraBold }}>{remaining}</Text> pts to go
          </Text>
        </View>
      )}

      <View style={styles.rewardFooter}>
        <ScalePress onPress={onRedeem} disabled={!canAfford || isRedeeming} style={{ flex: 1 }}>
          <View style={[styles.redeemBtn, { backgroundColor: canAfford ? colors.primary : colors.primary + '22' }]}>
            {isRedeeming
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={[styles.redeemBtnText, { color: canAfford ? '#FFF' : colors.primary }]}>{canAfford ? 'Redeem 🎁' : `Keep earning`}</Text>
            }
          </View>
        </ScalePress>
        {onToggleSave && (
          <TouchableOpacity
            style={[styles.removeBtn, isSaving
              ? { backgroundColor: colors.primary + '18', borderColor: colors.primary }
              : { borderColor: colors.primary + '55' }]}
            onPress={onToggleSave}
            accessibilityLabel={isSaving ? `Stop saving for ${reward.title}` : `Save for ${reward.title}`}
            accessibilityRole="button"
            accessibilityState={{ selected: !!isSaving }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[styles.removeBtnText, { color: colors.textAccent }]}>{isSaving ? '📌 Saving' : '📌 Save'}</Text>
          </TouchableOpacity>
        )}
        {isParent && onRemove && (
          <TouchableOpacity
            style={[styles.removeBtn, { borderColor: colors.primary + '55' }]}
            onPress={onRemove}
            accessibilityLabel={`Edit ${reward.title}`}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[styles.removeBtnText, { color: colors.textAccent }]}>✏️ Edit</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { colors } = useTheme();
  const configs: Record<string, { bg: string; color: string; label: string }> = {
    pending:  { bg: colors.warning + '22', color: colors.textWarning, label: 'Pending' },
    approved: { bg: colors.success + '22', color: colors.textSuccess, label: 'Approved' },
    rejected: { bg: colors.danger + '22',  color: colors.textDanger,  label: 'Rejected' },
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
    if (!title.trim()) { Alert.alert('Add a title', 'Please enter a reward title.'); return; }
    const cost = parseInt(pointCost, 10);
    if (!cost || cost <= 0) { Alert.alert('Invalid Points', 'Please enter a valid point cost.'); return; }
    try {
      setIsLoading(true);
      const { deduped } = await createReward({
        familyId,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        pointCost: cost,
        createdBy: memberId,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (deduped) {
        // A reward with this name already existed — we updated it instead of
        // stacking a duplicate. Tell the parent so the "nothing new appeared"
        // isn't confusing.
        Alert.alert('Reward updated', `"${title.trim()}" already existed, so its cost and details were updated instead of adding a duplicate.`);
      }
      onCreated();
    } catch (err) {
      if (__DEV__) console.error('createReward error:', err);
      Alert.alert('That didn’t work', 'Could not create reward. Please try again.');
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
                    <Text style={[styles.presetText, { color: colors.textAccent }]}>{p.label}</Text>
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

  brandRow: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 2 },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.lg },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  pointsCard: { borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5 },
  pointsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pointsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginBottom: 2 },
  pointsBig: { fontSize: 32, fontFamily: FontFamily.extraBold },
  pointsSuffix: { fontSize: FontSize.md, fontFamily: FontFamily.regular },
  pointsHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  cashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.md },
  cashValue: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  cashOutBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 9 },
  cashOutText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  pointsBreakdown: { alignItems: 'flex-end', gap: 4 },
  pointsBreakdownItem: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },

  addBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 9 },
  addBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },

  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, marginBottom: Spacing.sm },
  packsLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  packsCta: { borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center', marginHorizontal: Spacing.xl, marginTop: Spacing.sm, ...Shadow.md },
  packsCtaText: { color: '#FFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },

  rewardsGrid: { gap: Spacing.sm },
  rewardCard: { borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
  rewardCardDisabled: { opacity: 0.9 },
  rewardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rewardIconBox: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  rewardIcon: { fontSize: 24 },
  rewardTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, marginBottom: 2 },
  rewardDesc: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  rewardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  rewardCostRow: { alignItems: 'center', minWidth: 44 },
  rewardCostValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  rewardCostLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginTop: -2 },
  affordWrap: { marginTop: Spacing.sm },
  affordTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  affordFill: { height: '100%', borderRadius: 4 },
  affordLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginTop: 5 },
  redeemBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, alignItems: 'center' },
  redeemBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },
  removeBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginLeft: Spacing.sm },
  removeBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },

  historyRow: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.sm },
  pendingRow: { borderWidth: 1.5, borderColor: Colors.warning + '66' },
  historyEmoji: { fontSize: 28 },
  historyInfo: { flex: 1 },
  historyTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  historySubtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  approveBtn: { backgroundColor: Colors.success, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, minWidth: 80, alignItems: 'center' },
  approveBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: '#1A1830' },

  statusBadge: { borderRadius: 20, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  seeAllBtn: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  seeAllText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },

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
