import { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Alert, Linking, InteractionManager, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { firestore } from '@/lib/fb';
import * as ImagePicker from 'expo-image-picker';
import { pickPhotoUri } from '@/lib/photoPicker';
import * as Haptics from 'expo-haptics';
import { Col, getCurrentWeekId, getWeekStart, uploadMemberPhoto, removeMemberPhoto, setMemberWeeklyGoal, setMemberPenaltyPause, resetMemberPoints, PAUSE_INDEFINITE } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { getCompletionRate, getRankEmoji, calculateStreak, getCurrentWeekRange, getLevel } from '@/lib/pointsEngine';
import { useMemberLevels } from '@/lib/memberLevels';
import { LevelLadder } from '@/components/ui/LevelPerks';
import { SeasonBadges } from '@/components/ui/Season';
import { streakWithShields, activeDayKeys } from '@/lib/streakShield';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Avatar } from '@/components/ui';
import { weeklyTrend } from '@/lib/familyGame';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCard';
import type { MemberDoc, TransactionDoc, CompletionDoc } from '@/lib/firebase';

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family, member: viewerMember } = useAuthStore();
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [completions, setCompletions] = useState<CompletionDoc[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState(0);
  const [allTimePoints, setAllTimePoints] = useState(0);
  // E3: the level reads lifetime EARNED from the app-wide store, so spending
  // points on a reward never lowers it (allTimePoints stays the bank balance).
  const earnedPts = useMemberLevels((s) => s.earned[id ?? ''] ?? 0);
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  // Guards against the picker being launched multiple times concurrently —
  // tapping repeatedly while the (slow-to-appear) picker is opening used to
  // queue up several launches that all surfaced later, stacked on top of
  // each other. One in-flight launch at a time, full stop.
  const pickerBusyRef = useRef(false);
  const canEditPhoto = viewerMember?.role === 'admin_parent' || viewerMember?.role === 'parent';
  // Parents can adjust another member's points (bonus/penalty) — but not their own.
  const canAdjustPoints =
    (viewerMember?.role === 'admin_parent' || viewerMember?.role === 'parent') &&
    id !== viewerMember?.id;

  async function handleChangePhoto() {
    if (!family?.id || !member?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // NOTE: Android's Alert.alert reliably renders at most 3 buttons — a 4th
    // (e.g. "Remove Photo") gets silently dropped or misrouted. Chain two
    // simple 2-button alerts instead so every action is reachable.
    // IMPORTANT: defer the actual picker launch with
    // InteractionManager.runAfterInteractions(). Calling pickAndUpload()
    // synchronously inside onPress launches the native image-picker activity
    // while the Alert dialog is still mid-dismiss-animation — Android queues
    // that launch and only "wakes it up" when the app regains foreground
    // (matches the symptom: picker only appears after backgrounding/reopening
    // the app). runAfterInteractions waits for the dismiss animation to
    // actually finish — event-driven, not a fixed delay, so it can't stack.
    const sourceButtons = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Camera', onPress: () => InteractionManager.runAfterInteractions(() => pickAndUpload('camera')) },
      { text: 'Photo Library', onPress: () => InteractionManager.runAfterInteractions(() => pickAndUpload('library')) },
    ];
    if (member.photoURL) {
      Alert.alert('Profile photo', `Update or remove the photo for ${member.displayName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove Photo', style: 'destructive', onPress: doRemovePhoto },
        { text: 'Change Photo', onPress: () => Alert.alert('Change Photo', 'Choose a source', sourceButtons) },
      ]);
    } else {
      Alert.alert('Add Profile Photo', `Choose a source for ${member.displayName}'s photo`, sourceButtons);
    }
  }

  async function pickAndUpload(source: 'library' | 'camera') {
    // Ignore taps while a picker launch is already in flight — repeated taps
    // (e.g. because the picker takes a moment to appear) used to queue up
    // multiple launches that all surfaced later, stacked on top of each other.
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      // react-native-image-picker returns an app-owned file:// (see lib/photoPicker),
      // sidestepping the Android 13 content:// unreadable-URI problem entirely.
      const uri = await pickPhotoUri(source);
      if (!uri) return; // cancelled

      setIsUploadingPhoto(true);
      const url = await uploadMemberPhoto(uri, family!.id, member!.id);
      setMember((prev) => (prev ? { ...prev, photoURL: url } : prev));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const detail = err?.code || err?.message || String(err);
      Alert.alert('Upload didn’t work', `Could not upload photo.\n\n(${detail})`);
    } finally {
      setIsUploadingPhoto(false);
      pickerBusyRef.current = false;
    }
  }

  async function doRemovePhoto() {
    if (!family?.id || !member?.id) return;
    try {
      setIsUploadingPhoto(true);
      await removeMemberPhoto(family.id, member.id);
      setMember((prev) => (prev ? { ...prev, photoURL: undefined } : prev));
    } catch (err: any) {
      if (__DEV__) console.error('[Member Photo Remove]', err);
      Alert.alert('Failed', 'Could not remove photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  useEffect(() => {
    if (!id || !family?.id) return;
    async function load() {
      try {
        // Single-field queries, sorted on the device: no composite index to
        // silently fail (CLAUDE.md gotcha #2), and ALL of the member's
        // transactions — the old limit(30) made all-time points and level
        // wrong for anyone with a longer history.
        const [memberSnap, txSnap, completionSnap] = await Promise.all([
          Col.members(family!.id).doc(id).get(),
          Col.transactions(family!.id).where('memberId', '==', id).get(),
          Col.completions(family!.id).where('memberId', '==', id).get(),
        ]);

        if (memberSnap.exists()) {
          setMember({ id: memberSnap.id, ...memberSnap.data() } as MemberDoc);
        }

        const ms = (ts: any) => ts?.toDate?.()?.getTime?.() ?? 0;
        const txList = (txSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as TransactionDoc[])
          .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
        const compList = (completionSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CompletionDoc[])
          .sort((a, b) => ms(b.completedAt) - ms(a.completedAt));

        setTransactions(txList);
        setCompletions(compList);

        const allTime = txList.reduce((s, t) => s + t.delta, 0);
        setAllTimePoints(allTime);

        const { start: weekStart } = getCurrentWeekRange();
        const weekly = txList
          .filter((t) => t.createdAt?.toDate() >= weekStart)
          .reduce((s, t) => s + t.delta, 0);
        setWeeklyPoints(weekly);

        // Calculate streak from completions
        const streakDays = calcStreakFromCompletions(compList, family?.weekStartDay ?? 1);
        setStreak(streakDays);
      } catch (e) {
        if (__DEV__) console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id, family?.id]);

  const currentGoal = (member as any)?.weeklyGoal as number | undefined;

  function openGoalModal() {
    setGoalInput(currentGoal ? String(currentGoal) : '');
    setShowGoalModal(true);
  }

  async function saveGoal(clear = false) {
    if (!family?.id || !id) return;
    const value = clear ? null : parseInt(goalInput, 10);
    if (!clear && (!value || value <= 0)) {
      Alert.alert('Invalid goal', 'Enter a points target above zero.');
      return;
    }
    try {
      setSavingGoal(true);
      await setMemberWeeklyGoal(family.id, id, value);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMember((prev) => (prev ? ({ ...prev, weeklyGoal: value } as any) : prev));
      setShowGoalModal(false);
    } catch (e) {
      if (__DEV__) console.error('[Goal] save failed', e);
      Alert.alert('That didn’t work', 'Could not save the goal. Please try again.');
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleSetMemberPause(until: Date | null) {
    if (!family?.id || !id) return;
    await Haptics.selectionAsync().catch(() => {});
    setMember((prev) => (prev ? ({ ...prev, penaltyPausedUntil: until ? firestore.Timestamp.fromDate(until) : null } as any) : prev));
    try {
      await setMemberPenaltyPause(family.id, id, until);
    } catch {
      Alert.alert('That didn’t work', 'Could not update the pause. Please try again.');
    }
  }

  function handleResetPoints() {
    if (!family?.id || !id) return;
    const first = member?.displayName?.split(' ')[0] ?? 'this member';
    Alert.alert(
      'Reset points?',
      `This sets ${first}'s all-time points to zero. It can't be undone. Their score for the current week isn't affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to 0', style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              // Stamp the balancing tx just before this week starts → zeroes the
              // all-time bank without touching the current week's competition.
              const { start } = getCurrentWeekRange(family?.weekStartDay ?? 1);
              await resetMemberPoints(family.id, id, new Date(start.getTime() - 1000));
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setAllTimePoints(0);
              Alert.alert('Done', `${first}'s points were reset to zero.`);
            } catch {
              Alert.alert('That didn’t work', 'Could not reset points. Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  const memberPausedUntil = (member as any)?.penaltyPausedUntil?.toDate?.() ?? null;
  const isMemberPaused = !!memberPausedUntil && memberPausedUntil.getTime() > Date.now();
  const memberPauseIndef = !!memberPausedUntil && memberPausedUntil.getFullYear() >= 2900;
  const memberPauseLabel = memberPauseIndef
    ? 'until you resume'
    : memberPausedUntil ? `until ${memberPausedUntil.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';

  const weekId = getCurrentWeekId();
  const thisWeekCompletions = completions.filter((c) => c.weekId === weekId);
  const completed = thisWeekCompletions.filter((c) => !c.wasAutoFailed).length;
  const failed = thisWeekCompletions.filter((c) => c.wasAutoFailed).length;
  const completionRate = getCompletionRate(completed, thisWeekCompletions.length);

  // ── Share cards (Phase 2): recap / streak / level, built from this profile ──
  const firstName = (member?.displayName ?? 'They').split(' ')[0];
  function shareRecap() {
    setShareData({
      icon: 'coin',
      eyebrow: 'MY WEEK ON CHORE LEAGUE',
      title: `${firstName}'s week`,
      subtitle: 'Chores done, points earned.',
      stats: [
        { value: `${weeklyPoints >= 0 ? '+' : ''}${weeklyPoints}`, label: 'this week' },
        { value: `${completionRate}%`, label: 'done' },
        ...(streak > 0 ? [{ value: `${streak}`, label: 'day streak' }] : []),
      ],
      shareMessage: `${firstName} earned ${weeklyPoints} points this week on Chore League! 🏆`,
    });
  }
  function shareStreak() {
    setShareData({
      icon: 'medal',
      eyebrow: 'ON A ROLL',
      title: `${firstName} is on a ${streak}-day streak!`,
      subtitle: 'One task at a time.',
      stats: [{ value: `${streak}`, label: 'days in a row' }],
      shareMessage: `${firstName} is on a ${streak}-day streak on Chore League! 🔥`,
    });
  }
  function shareLevel() {
    const lv = getLevel(earnedPts);
    setShareData({
      icon: 'shield',
      eyebrow: 'LEVEL UP',
      title: `${firstName} reached Level ${lv.level}!`,
      subtitle: lv.title,
      stats: [{ value: `${allTimePoints}`, label: 'all-time pts' }],
      shareMessage: `${firstName} just hit Level ${lv.level} (${lv.title}) on Chore League! ⭐`,
    });
  }

  // Nested so these presentational helpers capture the themed `styles`.
  function StatBox({ label, value, color, emoji }: { label: string; value: string; color: string; emoji: string }) {
    return (
      <View style={styles.statBox}>
        <Text style={styles.statEmoji}>{emoji}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    );
  }

  function WeekStat({ label, value, color, showSign }: { label: string; value: number; color: string; showSign?: boolean }) {
    return (
      <View style={styles.weekStat}>
        <Text style={[styles.weekStatValue, { color }]}>{showSign && value > 0 ? '+' : ''}{value}</Text>
        <Text style={styles.weekStatLabel}>{label}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader
          right={!isLoading ? (
            <TouchableOpacity onPress={shareRecap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Share this week">
              <Text style={[styles.backText, { color: colors.textAccent }]}>Share ↗</Text>
            </TouchableOpacity>
          ) : undefined}
        />

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            <View style={styles.hero}>
              <TouchableOpacity
                activeOpacity={canEditPhoto ? 0.7 : 1}
                onPress={canEditPhoto ? handleChangePhoto : undefined}
                style={styles.avatarWrap}
              >
                <Avatar emoji={member?.avatarEmoji} photoURL={member?.photoURL} size={96} showRing ringColor={colors.primary} memberId={member?.id} />
                {canEditPhoto && (
                  <View style={styles.editBadge}>
                    {isUploadingPhoto ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={styles.editBadgeText}>✏️</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.heroName}>{member?.displayName}</Text>
              <Text style={styles.heroRole}>
                {member?.isManaged ? '👶 Managed Child' : member?.role?.replace('_', ' ')}
              </Text>

              {/* Lifetime level — climbs forever, never resets with the week (4.1) */}
              {(() => {
                const lv = getLevel(earnedPts);
                return (
                  <TouchableOpacity style={styles.levelCard} activeOpacity={0.85} onPress={shareLevel} accessibilityRole="button" accessibilityLabel={`Share level ${lv.level}`}>
                    <View style={styles.levelTop}>
                      <Text style={styles.levelTitle}>{lv.emoji} Lv {lv.level} · {lv.title}</Text>
                      <Text style={styles.levelPts}>
                        {lv.next != null ? `${lv.next} to next` : 'Max level'}
                      </Text>
                    </View>
                    <View style={styles.levelTrack}>
                      <View style={[styles.levelFill, { width: `${Math.round(lv.progress * 100)}%` }]} />
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {/* E3: what each level unlocks — frames + the family's perks. */}
              <LevelLadder earned={earnedPts} perks={family?.levelPerks} />
              {/* F1: medals from finished seasons (renders nothing until one ends). */}
              <SeasonBadges memberId={id} />

              {streak > 0 && (
                <TouchableOpacity style={styles.streakBadge} activeOpacity={0.85} onPress={shareStreak} accessibilityRole="button" accessibilityLabel={`Share ${streak} day streak`}>
                  <Text style={styles.streakText}>🔥 {streak} day streak</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.statsRow}>
              <StatBox label="This Week" value={`${weeklyPoints >= 0 ? '+' : ''}${weeklyPoints}`} color={weeklyPoints >= 0 ? colors.success : colors.danger} emoji="📅" />
              <StatBox label="All Time" value={`${allTimePoints}`} color={colors.primary} emoji="⭐" />
              <StatBox label="Done Rate" value={`${completionRate}%`} color={colors.warning} emoji="✅" />
            </View>

            {/* Weekly goal — beating it earns the 🎯 Goal Crusher crown (4.2) */}
            {(currentGoal && currentGoal > 0) ? (
              <View style={styles.section}>
                <TouchableOpacity
                  activeOpacity={canEditPhoto ? 0.8 : 1}
                  onPress={canEditPhoto ? openGoalModal : undefined}
                  style={[styles.goalCard, weeklyPoints >= currentGoal && styles.goalCardMet]}
                >
                  <View style={styles.goalHeader}>
                    <Text style={styles.goalTitle}>🎯 Weekly Goal</Text>
                    <Text style={styles.goalNumbers}>
                      <Text style={{ color: colors.textAccent, fontFamily: FontFamily.extraBold }}>{weeklyPoints}</Text>
                      <Text style={{ color: colors.textSecondary }}> / {currentGoal} pts</Text>
                    </Text>
                  </View>
                  <View style={styles.goalTrack}>
                    <View style={[styles.goalFill, { width: `${Math.min(100, (weeklyPoints / currentGoal) * 100)}%` }]} />
                  </View>
                  <Text style={styles.goalHint}>
                    {weeklyPoints >= currentGoal
                      ? '🏆 Goal crushed — crown earned!'
                      : `${currentGoal - weeklyPoints} pts to go${canEditPhoto ? '  ·  tap to edit' : ''}`}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : canEditPhoto ? (
              <View style={styles.section}>
                <TouchableOpacity style={styles.goalSetBtn} onPress={openGoalModal} activeOpacity={0.85}>
                  <Text style={styles.goalSetBtnText}>🎯  Set a weekly goal</Text>
                </TouchableOpacity>
                <Text style={styles.adjustHint}>Give {member?.displayName?.split(' ')[0] ?? 'them'} a personal target to beat</Text>
              </View>
            ) : null}

            {canAdjustPoints && (
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => router.push(`/app/discipline/log?memberId=${id}`)}
                  accessibilityLabel={`Adjust points for ${member?.displayName}`}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                >
                  <Text style={styles.adjustBtnText}>⚖️  Adjust points</Text>
                </TouchableOpacity>
                <Text style={styles.adjustHint}>Give a bonus or log a penalty</Text>
              </View>
            )}

            {/* Per-member vacation/sick pause — parents only, any member */}
            {canEditPhoto && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pause penalties</Text>
                <Text style={styles.adjustHint}>
                  Hold missed-task penalties for {member?.displayName?.split(' ')[0] ?? 'this member'} during a vacation or sick day. They can still earn as normal.
                </Text>
                {isMemberPaused ? (
                  <View style={styles.pauseRow}>
                    <View style={styles.pausedBadge}>
                      <Text style={styles.pausedBadgeText}>⏸ Paused {memberPauseLabel}</Text>
                    </View>
                    <TouchableOpacity style={styles.resumeBtn} onPress={() => handleSetMemberPause(null)} accessibilityRole="button" accessibilityLabel="Resume penalties now">
                      <Text style={styles.resumeBtnText}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.pauseRow}>
                    {[{ label: '3 days', days: 3 }, { label: '1 week', days: 7 }].map((o) => (
                      <TouchableOpacity key={o.label} style={styles.pauseChip} onPress={() => handleSetMemberPause(new Date(Date.now() + o.days * 86400000))} accessibilityRole="button" accessibilityLabel={`Pause for ${o.label}`}>
                        <Text style={styles.pauseChipText}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.pauseChip} onPress={() => handleSetMemberPause(PAUSE_INDEFINITE)} accessibilityRole="button" accessibilityLabel="Pause until I resume">
                      <Text style={styles.pauseChipText}>Until I resume</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Reset points — any parent, on any profile INCLUDING their own
                (destructive). Gated on canEditPhoto (parent) rather than
                canAdjustPoints so a parent can reset their OWN messed-up bank. */}
            {canEditPhoto && (
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={handleResetPoints}
                  disabled={busy}
                  accessibilityLabel={`Reset ${member?.displayName}'s points to zero`}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                >
                  {busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.resetBtnText}>↺  Reset points to zero</Text>}
                </TouchableOpacity>
                <Text style={styles.adjustHint}>Start fresh — clears the all-time bank. Can't be undone.</Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>This Week</Text>
              <View style={styles.weekCard}>
                <WeekStat label="Completed" value={completed} color={colors.success} />
                <View style={styles.weekDivider} />
                <WeekStat label="Not done" value={failed} color={colors.warning} />
                <View style={styles.weekDivider} />
                <WeekStat label="Points" value={weeklyPoints} color={colors.primary} showSign />
              </View>
            </View>

            {/* Long-term progress (moved here from the old Insights tab). */}
            {(() => {
              const bars = weeklyTrend(
                transactions.map((t) => ({ delta: t.delta, source: t.source, date: (t.createdAt as any)?.toDate?.() ?? null })),
                family?.weekStartDay ?? 1,
              );
              const max = Math.max(1, ...bars.map((b) => Math.abs(b.points)));
              return (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Last 6 weeks</Text>
                  <View style={styles.trendCard}>
                    {bars.map((b, i) => (
                      <View key={i} style={styles.trendCol}>
                        <Text style={styles.trendVal}>{b.points}</Text>
                        <View style={styles.trendTrack}>
                          <View style={[styles.trendBar, {
                            height: `${Math.max(4, Math.round((Math.abs(b.points) / max) * 100))}%`,
                            backgroundColor: b.points < 0 ? colors.warning : i === bars.length - 1 ? colors.primary : colors.primary + '66',
                          }]} />
                        </View>
                        <Text style={styles.trendLabel}>{i === bars.length - 1 ? 'Now' : `${b.start.getMonth() + 1}/${b.start.getDate()}`}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {(showAllActivity ? transactions : transactions.slice(0, 5)).map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={[styles.txDot, { backgroundColor: tx.delta >= 0 ? colors.success : colors.danger }]} />
                  <View style={styles.txInfo}>
                    <Text style={styles.txReason} numberOfLines={1}>{tx.reason}</Text>
                    <Text style={styles.txDate}>{tx.createdAt?.toDate().toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.txDelta, { color: tx.delta >= 0 ? colors.success : colors.danger }]}>
                    {tx.delta >= 0 ? '+' : ''}{tx.delta}
                  </Text>
                </View>
              ))}
              {transactions.length > 5 && (
                <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowAllActivity((v) => !v)} accessibilityRole="button">
                  <Text style={styles.seeAllText}>{showAllActivity ? 'Show less' : `See all ${transactions.length} activities`}</Text>
                </TouchableOpacity>
              )}
              {transactions.length === 0 && (
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: Spacing.lg }}>No activity yet</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Branded share cards (recap / streak / level) */}
      <ShareCardModal visible={!!shareData} data={shareData} onClose={() => setShareData(null)} />

      {/* Weekly goal setter */}
      {showGoalModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowGoalModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>🎯 Weekly Goal</Text>
                <Text style={styles.modalSub}>
                  Set a personal points target for {member?.displayName?.split(' ')[0] ?? 'this member'} this week. Beating it earns the Goal Crusher crown.
                </Text>
                <View style={styles.presetRow}>
                  {[100, 200, 300, 500].map((v) => (
                    <TouchableOpacity key={v} style={styles.presetChip} onPress={() => setGoalInput(String(v))}>
                      <Text style={styles.presetChipText}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.goalInput}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="number-pad"
                  placeholder="e.g. 250"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Weekly points goal"
                />
                <View style={styles.modalBtns}>
                  {currentGoal ? (
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => saveGoal(true)} disabled={savingGoal}>
                      <Text style={[styles.modalBtnText, { color: colors.textDanger }]}>Clear</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setShowGoalModal(false)} disabled={savingGoal}>
                      <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={() => saveGoal(false)} disabled={savingGoal}>
                    {savingGoal ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Save goal</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

/** Same streak as Home: shield-aware, and today never breaks it (lib/streakShield). */
function calcStreakFromCompletions(completions: CompletionDoc[], weekStartDay: number): number {
  const dates = completions
    .filter((c) => !c.wasAutoFailed && c.completedAt && (c as any).status !== 'rejected')
    .map((c) => c.completedAt!.toDate());
  return streakWithShields(activeDayKeys(dates), new Date(), weekStartDay).streak;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: Spacing.lg, paddingBottom: 0 },
  backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.textAccent },
  hero: { alignItems: 'center', padding: Spacing.xl },
  avatarWrap: { position: 'relative', marginBottom: Spacing.sm },
  avatarEmojiWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  avatarImage: { width: 96, height: 96, borderRadius: 48, ...Shadow.sm },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  editBadgeText: { fontSize: 14 },
  heroEmoji: { fontSize: 56 },
  heroName: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: colors.text },
  heroRole: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textTransform: 'capitalize', marginTop: 4 },
  levelCard: { marginTop: Spacing.md, alignSelf: 'stretch', marginHorizontal: Spacing.xl, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: colors.primary + '2E', ...Shadow.sm },
  levelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  levelTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.text },
  levelPts: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
  levelTrack: { height: 8, borderRadius: 5, backgroundColor: colors.primary + '1A', overflow: 'hidden' },
  levelFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  streakBadge: { marginTop: Spacing.sm, backgroundColor: colors.warning + '22', borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1.5, borderColor: colors.warning + '66' },
  streakText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.warning },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.sm },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  statLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: colors.text, marginBottom: Spacing.sm },
  adjustBtn: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary + '55', ...Shadow.sm },
  adjustBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textAccent },
  adjustHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  pauseRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: Spacing.sm, alignItems: 'center' },
  pauseChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  pauseChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
  pausedBadge: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: colors.warning + '66', backgroundColor: colors.warning + '1E' },
  pausedBadgeText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.warning },
  resumeBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: BorderRadius.md, backgroundColor: colors.primary },
  resumeBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },
  resetBtn: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.danger + '55', ...Shadow.sm },
  resetBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textDanger },
  // Weekly goal
  goalCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: colors.primary + '33', ...Shadow.sm },
  goalCardMet: { borderColor: colors.gold + '88', backgroundColor: colors.gold + '12' },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  goalTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
  goalNumbers: { fontSize: FontSize.sm },
  goalTrack: { height: 9, borderRadius: 5, backgroundColor: colors.primary + '1A', overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  goalHint: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 8 },
  goalSetBtn: { backgroundColor: colors.surface, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary + '55', ...Shadow.sm },
  goalSetBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textAccent },
  // Goal modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginBottom: 4 },
  modalSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
  presetRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  presetChip: { flex: 1, backgroundColor: colors.primary + '12', borderColor: colors.primary + '44', borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  presetChipText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textAccent },
  goalInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: colors.text, backgroundColor: colors.background, marginBottom: Spacing.md },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm },
  modalBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  modalBtnGhost: { borderWidth: 1.5, borderColor: colors.border },
  modalBtnPrimary: { backgroundColor: colors.primary },
  modalBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  weekCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
  trendCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 8, ...Shadow.sm },
  trendCol: { flex: 1, alignItems: 'center' },
  trendVal: { fontSize: 11, fontFamily: FontFamily.bold, color: colors.textSecondary, marginBottom: 4 },
  trendTrack: { height: 90, width: '70%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', borderRadius: 6 },
  trendLabel: { fontSize: 11, fontFamily: FontFamily.semiBold, color: colors.textMuted, marginTop: 6 },
  weekStat: { flex: 1, alignItems: 'center' },
  weekStatValue: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  weekStatLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  weekDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.sm },
  txDot: { width: 10, height: 10, borderRadius: 5 },
  txInfo: { flex: 1 },
  txReason: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.text },
  txDate: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  txDelta: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, minWidth: 44, textAlign: 'right' },
  seeAllBtn: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  seeAllText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent },
  });
}
