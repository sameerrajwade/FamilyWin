import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Col, getCurrentWeekId, getWeekStart, uploadMemberPhoto, removeMemberPhoto } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { getCompletionRate, getRankEmoji, calculateStreak, getCurrentWeekRange } from '@/lib/pointsEngine';
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
  const canEditPhoto = viewerMember?.role === 'admin_parent' || viewerMember?.role === 'parent';

  async function handleChangePhoto() {
    if (!family?.id || !member?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // NOTE: Android's Alert.alert reliably renders at most 3 buttons — a 4th
    // (e.g. "Remove Photo") gets silently dropped or misrouted. Chain two
    // simple 2-button alerts instead so every action is reachable.
    // NOTE: Launching the image picker immediately inside an Alert's onPress can
    // race with the Alert dialog's dismiss animation on Android — the picker
    // Activity sometimes silently fails to open (especially on repeat attempts
    // a minute or more after the first). A short delay lets the dialog fully
    // close before we launch the picker.
    const sourceButtons = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Camera', onPress: () => setTimeout(() => pickAndUpload('camera'), 350) },
      { text: 'Photo Library', onPress: () => setTimeout(() => pickAndUpload('library'), 350) },
    ];
    if (member.photoURL) {
      Alert.alert('Profile Photo', `Update or remove the photo for ${member.displayName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove Photo', style: 'destructive', onPress: doRemovePhoto },
        { text: 'Change Photo', onPress: () => setTimeout(() => Alert.alert('Change Photo', 'Choose a source', sourceButtons), 250) },
      ]);
    } else {
      Alert.alert('Add Profile Photo', `Choose a source for ${member.displayName}'s photo`, sourceButtons);
    }
  }

  async function pickAndUpload(source: 'library' | 'camera') {
    try {
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

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('No Photo', 'No photo was selected.');
        return;
      }

      setIsUploadingPhoto(true);
      const url = await uploadMemberPhoto(asset.uri, family!.id, member!.id);
      setMember((prev) => (prev ? { ...prev, photoURL: url } : prev));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (__DEV__) console.error('[Member Photo Upload]', err);
      const detail = err?.code || err?.message || String(err);
      Alert.alert('Upload Failed', `Could not upload photo.\n\n(${detail})`);
    } finally {
      setIsUploadingPhoto(false);
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
  streakBadge: { marginTop: Spacing.sm, backgroundColor: Colors.warning + '22', borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1.5, borderColor: Colors.warning + '66' },
  streakText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.warning },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.sm },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  statLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: Colors.text, marginBottom: Spacing.sm },
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
