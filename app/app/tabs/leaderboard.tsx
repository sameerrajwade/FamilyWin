import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import { useAuthStore, useFamilyStore, usePointsStore } from '@/store';
import { Col, getFamilyMembers, getCurrentWeekId, getWeekCompletions, getMemberPersonalBest } from '@/lib/firebase';
import { buildLeaderboard, getWeekLabel, getCurrentWeekRange, getRankEmoji } from '@/lib/pointsEngine';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Avatar } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import type { LeaderboardEntry } from '@/lib/pointsEngine';

export default function LeaderboardScreen() {
  const { member: currentMember, family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const { weeklyTotals, setWeeklyTotals } = usePointsStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [personalBest, setPersonalBest] = useState<number>(0);
  const { colors } = useTheme();

  const weekId = getCurrentWeekId();
  const { start } = getCurrentWeekRange(family?.weekStartDay ?? 1);
  const weekLabel = getWeekLabel(start);

  const loadLeaderboard = useCallback(async () => {
    if (!family?.id || !currentMember?.id) return;
    try {
      const membersList = await getFamilyMembers(family.id);
      setMembers(membersList as any);

      const weekStart = new Date(start);
      const txSnap = await Col.transactions(family.id)
        .where('createdAt', '>=', firestore.Timestamp.fromDate(weekStart))
        .get();

      // Exclude 'redemption' transactions — those are reward spends and must NOT
      // reduce a member's leaderboard rank (earned points stay earned).
      const totals: Record<string, number> = {};
      for (const doc of txSnap.docs) {
        const d = doc.data();
        if (d.source === 'redemption') continue;
        totals[d.memberId] = (totals[d.memberId] ?? 0) + d.delta;
      }
      setWeeklyTotals(totals);

      const completions = await getWeekCompletions(family.id, weekId);
      const taskStats: Record<string, { completed: number; total: number }> = {};
      for (const c of completions) {
        if (!taskStats[c.memberId]) taskStats[c.memberId] = { completed: 0, total: 0 };
        taskStats[c.memberId].total++;
        if (!c.wasAutoFailed) taskStats[c.memberId].completed++;
      }

      const board = buildLeaderboard(totals, membersList as any, currentMember.id, taskStats, {});
      setLeaderboard(board);

      // Load personal best for current member
      const best = await getMemberPersonalBest(family.id, currentMember.id);
      // Also consider current week as potential best
      const currentWeekPoints = totals[currentMember.id] ?? 0;
      setPersonalBest(Math.max(best, currentWeekPoints));
    } catch (error) {
      if (__DEV__) console.error('Leaderboard load error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [family?.id, currentMember?.id, weekId]);

  useEffect(() => {
    loadLeaderboard();
    if (!family?.id) return;
    const unsubscribe = Col.transactions(family.id)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .onSnapshot(() => { loadLeaderboard(); }, (err) => { if (__DEV__) console.error(err); });
    return () => unsubscribe();
  }, [loadLeaderboard, family?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }, [loadLeaderboard]);

  const topThree = leaderboard.slice(0, 3);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>🏆 Leaderboard</Text>
            <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>{weekLabel}</Text>
          </View>
          <TouchableOpacity
            style={[styles.historyBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '44' }]}
            onPress={() => router.push('/app/tabs/history')}
          >
            <Text style={[styles.historyBtnText, { color: colors.primary }]}>📊 History</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            {/* Personal Best card — shown only to current user */}
            {personalBest > 0 && (
              <View style={[styles.personalBestCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
                <Text style={styles.personalBestEmoji}>🏅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personalBestLabel, { color: colors.textSecondary }]}>Your Personal Best</Text>
                  <Text style={[styles.personalBestValue, { color: colors.primary }]}>{personalBest} pts in a week</Text>
                </View>
              </View>
            )}

            {/* 1-member empty state */}
            {leaderboard.length <= 1 && (
              <View style={styles.emptyPodium}>
                <Text style={styles.emptyPodiumEmoji}>👨‍👩‍👧‍👦</Text>
                <Text style={[styles.emptyPodiumTitle, { color: colors.text }]}>Invite your family!</Text>
                <Text style={[styles.emptyPodiumSub, { color: colors.textSecondary }]}>
                  The leaderboard comes alive when more members join. Share your invite code from Settings.
                </Text>
              </View>
            )}

            {/* Podium */}
            {topThree.length >= 2 && (
              <View style={styles.podiumContainer}>
                {/* 2nd */}
                <View style={styles.podiumItem}>
                  <View style={styles.podiumAvatar}><Avatar emoji={topThree[1]?.avatarEmoji ?? '👤'} photoURL={topThree[1]?.photoURL} size={48} /></View>
                  <Text style={[styles.podiumName, { color: colors.text }]}>{topThree[1]?.displayName}</Text>
                  <Text style={[styles.podiumPoints, { color: colors.silver }]}>{topThree[1]?.points}</Text>
                  <Text style={[styles.podiumPtsLabel, { color: colors.textMuted }]}>pts</Text>
                  <View style={[styles.podiumBlock, { height: 54, backgroundColor: colors.silver }]}>
                    <Text style={styles.podiumRankText}>2</Text>
                  </View>
                </View>
                {/* 1st */}
                <View style={[styles.podiumItem, styles.podiumItemCurrent]}>
                  <Text style={styles.crownEmoji}>👑</Text>
                  <View style={styles.podiumAvatar}><Avatar emoji={topThree[0]?.avatarEmoji ?? '👤'} photoURL={topThree[0]?.photoURL} size={56} showRing ringColor={Colors.gold} /></View>
                  <Text style={[styles.podiumName, { color: colors.text }]}>{topThree[0]?.displayName}</Text>
                  <Text style={[styles.podiumPoints, { color: colors.gold }]}>{topThree[0]?.points}</Text>
                  <Text style={[styles.podiumPtsLabel, { color: colors.textMuted }]}>pts</Text>
                  <View style={[styles.podiumBlock, { height: 78, backgroundColor: colors.gold }]}>
                    <Text style={styles.podiumRankText}>1</Text>
                  </View>
                </View>
                {/* 3rd */}
                {topThree[2] && (
                  <View style={styles.podiumItem}>
                    <View style={styles.podiumAvatar}><Avatar emoji={topThree[2].avatarEmoji} photoURL={topThree[2].photoURL} size={48} /></View>
                    <Text style={[styles.podiumName, { color: colors.text }]}>{topThree[2].displayName}</Text>
                    <Text style={[styles.podiumPoints, { color: colors.bronze }]}>{topThree[2].points}</Text>
                    <Text style={[styles.podiumPtsLabel, { color: colors.textMuted }]}>pts</Text>
                    <View style={[styles.podiumBlock, { height: 40, backgroundColor: colors.bronze }]}>
                      <Text style={styles.podiumRankText}>3</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Full list */}
            <View style={styles.list}>
              {leaderboard.map((entry) => (
                <View
                  key={entry.memberId}
                  style={[styles.row, { backgroundColor: colors.surface }, entry.isCurrentUser && { borderWidth: 2, borderColor: colors.primary }]}
                  accessibilityLabel={`${entry.displayName}, rank ${entry.rank}, ${entry.points} points`}
                >
                  <Text style={[styles.rowRank, { color: colors.textSecondary }]}>{getRankEmoji(entry.rank)}</Text>
                  <Avatar emoji={entry.avatarEmoji} photoURL={entry.photoURL} size={40} />
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowName, { color: colors.text }]}>{entry.displayName}{entry.isCurrentUser ? ' (You)' : ''}</Text>
                    <Text style={[styles.rowStats, { color: colors.textSecondary }]}>
                      {entry.tasksCompleted}/{entry.tasksTotal} tasks
                      {entry.streak > 0 ? ` · 🔥 ${entry.streak}d` : ''}
                    </Text>
                  </View>
                  <View style={styles.rowPoints}>
                    <Text style={[styles.rowPointsValue, { color: colors.primary }]}>{entry.points}</Text>
                    <Text style={[styles.rowPointsLabel, { color: colors.textSecondary }]}>pts</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  historyBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, borderWidth: 1 },
  historyBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  weekLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 4 },
  podiumContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, justifyContent: 'center', gap: Spacing.sm },
  podiumItem: { flex: 1, alignItems: 'center' },
  podiumItemCurrent: { transform: [{ scale: 1.05 }] },
  crownEmoji: { fontSize: 24, marginBottom: 2 },
  podiumAvatar: { fontSize: 36, marginBottom: 4 },
  podiumName: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, marginBottom: 2 },
  podiumPoints: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  podiumPtsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginBottom: 4 },
  podiumBlock: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 },
  podiumRankText: { fontSize: 20 },
  personalBestCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, gap: Spacing.sm },
  personalBestEmoji: { fontSize: 28 },
  personalBestLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  personalBestValue: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold },
  emptyPodium: { alignItems: 'center', paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyPodiumEmoji: { fontSize: 56, marginBottom: Spacing.md },
  emptyPodiumTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, marginBottom: Spacing.sm },
  emptyPodiumSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  rowRank: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, width: 28 },
  rowAvatar: { fontSize: 30, marginRight: Spacing.sm },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  rowStats: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  rowPoints: { alignItems: 'flex-end' },
  rowPointsValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  rowPointsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold },
});
