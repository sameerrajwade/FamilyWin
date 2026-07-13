import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Alert, Linking, InteractionManager, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Col, getCurrentWeekId, getWeekStart, uploadMemberPhoto, removeMemberPhoto, setMemberWeeklyGoal } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { getCompletionRate, getRankEmoji, calculateStreak, getCurrentWeekRange, getLevel } from '@/lib/pointsEngine';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import type { MemberDoc, TransactionDoc, CompletionDoc } from '@/lib/firebase';

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { family, member: viewerMember } = useAuthStore();
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [completions, setCompletions] = useState<CompletionDoc[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState(0);
  const [allTimePoints, setAllTimePoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
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
      Alert.alert('Profile Photo', `Update or remove the photo for ${member.displayName}?`, [
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
      let uri: string | null | undefined;

      // FACT, confirmed via on-device adb logcat: Android's new system Photo
      // Picker (com.google.android.photopicker) launches as a TRANSLUCENT
      // overlay activity that — on this device's OS build — fails to
      // composite its own content. ActivityTaskManager logs it as genuinely
      // "Displayed", yet nothing renders until the app is backgrounded and
      // foregrounded (forcing Android to redraw the stack). This is an
      // OS-level compositor bug outside our control, and expo-image-picker
      // always prefers this Photo Picker on Android 13+ with no opt-out.
      // Fix: bypass it on Android by firing a classic ACTION_GET_CONTENT
      // intent — the pre-2023 Storage Access Framework chooser, an opaque
      // full-screen activity that never touches the buggy code path. SAF
      // manages its own per-URI access grants, so no READ_MEDIA_IMAGES
      // permission dance is needed for this path.
      if (source === 'library' && Platform.OS === 'android') {
        // ACTION_OPEN_DOCUMENT, not GET_CONTENT — GET_CONTENT is hijacked by the
        // Android 13+ Photo Picker, whose content://media/picker/… URIs are
        // unopenable downstream ("No content provider"). OPEN_DOCUMENT opens
        // DocumentsUI and returns a readable …/documents URI. flags:1 =
        // FLAG_GRANT_READ_URI_PERMISSION.
        const safResult = await IntentLauncher.startActivityAsync('android.intent.action.OPEN_DOCUMENT', {
          type: 'image/*',
          category: 'android.intent.category.OPENABLE',
          flags: 1,
        });
        if (safResult.resultCode !== -1 /* Activity.RESULT_OK */ || !safResult.data) return;
        uri = safResult.data;
      } else {
        let permission;
        if (source === 'camera') {
          permission = await ImagePicker.requestCameraPermissionsAsync();
        } else {
          permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        }
        if (!permission.granted) {
          if (permission.canAskAgain === false) {
            Alert.alert('Permission Needed', 'Please enable access in Settings to change the photo.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
          } else {
            Alert.alert('Permission Needed', 'Permission is required to select a photo.');
          }
          return;
        }

        // IMPORTANT — second transition gotcha: requestCameraPermissionsAsync /
        // requestMediaLibraryPermissionsAsync ALSO opens a system dialog/activity.
        // Once permission has already been granted (exactly the "it remembers"
        // symptom — repeat taps skip the prompt), that await resolves almost
        // immediately, and launching the picker Activity right after means
        // Android is still mid-transition from the *previous* screen change
        // (the Alert dismiss). InteractionManager.runAfterInteractions's
        // "interaction complete" signal is known to be unreliable for this
        // exact native transition timing on Android — a small fixed delay is
        // the documented workaround for this specific expo-image-picker +
        // Alert combination, so we wait briefly before actually launching.
        await new Promise((resolve) => setTimeout(resolve, 500));

        const result = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });

        if (result.canceled) return;
        uri = result.assets?.[0]?.uri;
      }

      if (!uri) {
        Alert.alert('No Photo', 'No photo was selected.');
        return;
      }

      setIsUploadingPhoto(true);
      const url = await uploadMemberPhoto(uri, family!.id, member!.id);
      setMember((prev) => (prev ? { ...prev, photoURL: url } : prev));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const detail = err?.code || err?.message || String(err);
      Alert.alert('Upload Failed', `Could not upload photo.\n\n(${detail})`);
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
        const [memberSnap, txSnap, completionSnap] = await Promise.all([
          Col.members(family!.id).doc(id).get(),
          Col.transactions(family!.id)
            .where('memberId', '==', id)
            .orderBy('createdAt', 'desc')
            .limit(30)
            .get(),
          Col.completions(family!.id)
            .where('memberId', '==', id)
            .orderBy('completedAt', 'desc')
            .get(),
        ]);

        if (memberSnap.exists) {
          setMember({ id: memberSnap.id, ...memberSnap.data() } as MemberDoc);
        }

        const txList = txSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as TransactionDoc[];
        const compList = completionSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CompletionDoc[];

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
        const streakDays = calcStreakFromCompletions(compList);
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
      Alert.alert('Error', 'Could not save the goal. Please try again.');
    } finally {
      setSavingGoal(false);
    }
  }

  const weekId = getCurrentWeekId();
  const thisWeekCompletions = completions.filter((c) => c.weekId === weekId);
  const completed = thisWeekCompletions.filter((c) => !c.wasAutoFailed).length;
  const failed = thisWeekCompletions.filter((c) => c.wasAutoFailed).length;
  const completionRate = getCompletionRate(completed, thisWeekCompletions.length);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            <View style={styles.hero}>
              <TouchableOpacity
                activeOpacity={canEditPhoto ? 0.7 : 1}
                onPress={canEditPhoto ? handleChangePhoto : undefined}
                style={styles.avatarWrap}
              >
                {member?.photoURL ? (
                  <Image source={{ uri: member.photoURL }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarEmojiWrap}>
                    <Text style={styles.heroEmoji}>{member?.avatarEmoji}</Text>
                  </View>
                )}
                {canEditPhoto && (
                  <View style={styles.editBadge}>
                    {isUploadingPhoto ? (
                      <ActivityIndicator size="small" color={Colors.surface} />
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
                const lv = getLevel(allTimePoints);
                return (
                  <View style={styles.levelCard}>
                    <View style={styles.levelTop}>
                      <Text style={styles.levelTitle}>{lv.emoji} Lv {lv.level} · {lv.title}</Text>
                      <Text style={styles.levelPts}>
                        {lv.next != null ? `${lv.next} to next` : 'Max level'}
                      </Text>
                    </View>
                    <View style={styles.levelTrack}>
                      <View style={[styles.levelFill, { width: `${Math.round(lv.progress * 100)}%` }]} />
                    </View>
                  </View>
                );
              })()}

              {streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakText}>🔥 {streak} day streak</Text>
                </View>
              )}
            </View>

            <View style={styles.statsRow}>
              <StatBox label="This Week" value={`${weeklyPoints >= 0 ? '+' : ''}${weeklyPoints}`} color={weeklyPoints >= 0 ? Colors.success : Colors.danger} emoji="📅" />
              <StatBox label="All Time" value={`${allTimePoints}`} color={Colors.primary} emoji="⭐" />
              <StatBox label="Done Rate" value={`${completionRate}%`} color={Colors.warning} emoji="✅" />
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
                      <Text style={{ color: Colors.primary, fontFamily: FontFamily.extraBold }}>{weeklyPoints}</Text>
                      <Text style={{ color: Colors.textSecondary }}> / {currentGoal} pts</Text>
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

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>This Week</Text>
              <View style={styles.weekCard}>
                <WeekStat label="Completed" value={completed} color={Colors.success} />
                <View style={styles.weekDivider} />
                <WeekStat label="Auto-Failed" value={failed} color={Colors.danger} />
                <View style={styles.weekDivider} />
                <WeekStat label="Points" value={weeklyPoints} color={Colors.primary} showSign />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {transactions.slice(0, 10).map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={[styles.txDot, { backgroundColor: tx.delta >= 0 ? Colors.success : Colors.danger }]} />
                  <View style={styles.txInfo}>
                    <Text style={styles.txReason} numberOfLines={1}>{tx.reason}</Text>
                    <Text style={styles.txDate}>{tx.createdAt?.toDate().toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.txDelta, { color: tx.delta >= 0 ? Colors.success : Colors.danger }]}>
                    {tx.delta >= 0 ? '+' : ''}{tx.delta}
                  </Text>
                </View>
              ))}
              {transactions.length === 0 && (
                <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg }}>No activity yet</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

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
                  placeholderTextColor={Colors.textMuted}
                  accessibilityLabel="Weekly points goal"
                />
                <View style={styles.modalBtns}>
                  {currentGoal ? (
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => saveGoal(true)} disabled={savingGoal}>
                      <Text style={[styles.modalBtnText, { color: Colors.danger }]}>Clear</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setShowGoalModal(false)} disabled={savingGoal}>
                      <Text style={[styles.modalBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
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

function calcStreakFromCompletions(completions: CompletionDoc[]): number {
  const dates = completions
    .filter((c) => !c.wasAutoFailed && c.completedAt)
    .map((c) => c.completedAt!.toDate().toDateString())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < dates.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    if (dates[i] === expected.toDateString()) streak++;
    else break;
  }
  return streak;
}

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingBottom: 0 },
  backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: Colors.primary },
  hero: { alignItems: 'center', padding: Spacing.xl },
  avatarWrap: { position: 'relative', marginBottom: Spacing.sm },
  avatarEmojiWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  avatarImage: { width: 96, height: 96, borderRadius: 48, ...Shadow.sm },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surface },
  editBadgeText: { fontSize: 14 },
  heroEmoji: { fontSize: 56 },
  heroName: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: Colors.text },
  heroRole: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 4 },
  levelCard: { marginTop: Spacing.md, alignSelf: 'stretch', marginHorizontal: Spacing.xl, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '2E', ...Shadow.sm },
  levelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  levelTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: Colors.text },
  levelPts: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: Colors.textSecondary },
  levelTrack: { height: 8, borderRadius: 5, backgroundColor: Colors.primary + '1A', overflow: 'hidden' },
  levelFill: { height: '100%', borderRadius: 5, backgroundColor: Colors.primary },
  streakBadge: { marginTop: Spacing.sm, backgroundColor: Colors.warning + '22', borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1.5, borderColor: Colors.warning + '66' },
  streakText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.warning },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.sm },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  statLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: Colors.text, marginBottom: Spacing.sm },
  adjustBtn: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary + '55', ...Shadow.sm },
  adjustBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.primary },
  adjustHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textMuted, textAlign: 'center', marginTop: 6 },
  // Weekly goal
  goalCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '33', ...Shadow.sm },
  goalCardMet: { borderColor: Colors.gold + '88', backgroundColor: Colors.gold + '12' },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  goalTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.text },
  goalNumbers: { fontSize: FontSize.sm },
  goalTrack: { height: 9, borderRadius: 5, backgroundColor: Colors.primary + '1A', overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 5, backgroundColor: Colors.primary },
  goalHint: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: Colors.textSecondary, marginTop: 8 },
  goalSetBtn: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary + '55', ...Shadow.sm },
  goalSetBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.primary },
  // Goal modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
  presetRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  presetChip: { flex: 1, backgroundColor: Colors.primary + '12', borderColor: Colors.primary + '44', borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  presetChipText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.primary },
  goalInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: Colors.text, backgroundColor: Colors.background, marginBottom: Spacing.md },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm },
  modalBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  modalBtnGhost: { borderWidth: 1.5, borderColor: Colors.border },
  modalBtnPrimary: { backgroundColor: Colors.primary },
  modalBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  weekCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
  weekStat: { flex: 1, alignItems: 'center' },
  weekStatValue: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  weekStatLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2 },
  weekDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.sm },
  txDot: { width: 10, height: 10, borderRadius: 5 },
  txInfo: { flex: 1 },
  txReason: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.text },
  txDate: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2 },
  txDelta: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, minWidth: 44, textAlign: 'right' },
});
