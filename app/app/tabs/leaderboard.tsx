import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { firestore } from '@/lib/fb';
import { useAuthStore, useFamilyStore, usePointsStore } from '@/store';
import { Col, getFamilyMembers, getCurrentWeekId, getWeekCompletions, getMemberPersonalBest } from '@/lib/firebase';
import { buildLeaderboard, computeCrowns, getWeekLabel, getCurrentWeekRange } from '@/lib/pointsEngine';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow, Gradients } from '@/constants/theme';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { BrandBar } from '@/components/ui/Brand';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { SlideIn, CountUp, ScalePress, RankChangeBadge } from '@/components/ui/Animations';
import type { LeaderboardEntry, CrownSlot } from '@/lib/pointsEngine';

export default function LeaderboardScreen() {
  const { member: currentMember, family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const { weeklyTotals, setWeeklyTotals } = usePointsStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [crowns, setCrowns] = useState<CrownSlot[]>([]);
  const [lastWeekChampion, setLastWeekChampion] = useState<string | null>(null);
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

      // Three-crowns row: needs LAST week's earned totals (for "most improved")
      // and any per-member weekly goals (for "goal crusher"). Both degrade
      // gracefully — a fresh family with no history simply shows unawarded slots.
      const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(start); prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
      const prevSnap = await Col.transactions(family.id)
        .where('createdAt', '>=', firestore.Timestamp.fromDate(prevStart))
        .where('createdAt', '<=', firestore.Timestamp.fromDate(prevEnd))
        .get();
      const lastWeekTotals: Record<string, number> = {};
      for (const doc of prevSnap.docs) {
        const d = doc.data();
        if (d.source === 'redemption') continue;
        lastWeekTotals[d.memberId] = (lastWeekTotals[d.memberId] ?? 0) + d.delta;
      }
      const goals: Record<string, number> = {};
      for (const m of membersList as any[]) {
        const g = (m as any).weeklyGoal;
        if (typeof g === 'number' && g > 0) goals[m.id] = g;
      }
      setCrowns(computeCrowns(board, lastWeekTotals, goals));

      // Last week's champion (for the Winner Board entry banner). Highest positive total.
      const lwTop = Object.entries(lastWeekTotals).sort((a, b) => b[1] - a[1])[0];
      if (lwTop && lwTop[1] > 0) {
        const champ = (membersList as any[]).find((m) => m.id === lwTop[0]);
        setLastWeekChampion(champ ? champ.displayName.split(' ')[0] : null);
      } else {
        setLastWeekChampion(null);
      }

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

  // Reload when the tab regains focus — a goal set on a member profile doesn't
  // emit a transaction, so the crowns row would otherwise show stale goal data
  // until the next points change. Focus-reload keeps 🎯 Goal Crusher current.
  useFocusEffect(useCallback(() => { loadLeaderboard(); }, [loadLeaderboard]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }, [loadLeaderboard]);

  const topThree = leaderboard.slice(0, 3);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <BrandBar />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Leaderboard</Text>
            <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>{weekLabel}</Text>
          </View>
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

            {/* Last week's champion — entry to the Winner Board takeover */}
            {lastWeekChampion && (
              <SlideIn delay={40} from="bottom">
                <TouchableOpacity
                  style={[styles.winnerBanner, { backgroundColor: Colors.gold + '1E', borderColor: Colors.gold + '66' }]}
                  onPress={() => router.push('/app/winner' as any)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`View last week's champion, ${lastWeekChampion}`}
                >
                  <Text style={styles.winnerBannerEmoji}>🏆</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.winnerBannerTitle, { color: colors.text }]}>Last week's champion</Text>
                    <Text style={[styles.winnerBannerSub, { color: colors.textSecondary }]}>{lastWeekChampion} took the crown — tap to relive it</Text>
                  </View>
                  <Icon name="chevron-forward" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </SlideIn>
            )}

            {/* Three-crowns row — rewards more than raw points (Roadmap 1.1/4.2) */}
            {leaderboard.length >= 2 && (
              <SlideIn delay={80} from="bottom">
                <CrownsRow crowns={crowns} colors={colors} />
              </SlideIn>
            )}

            {/* Podium — premium gradient pedestals, tallest in the middle */}
            {topThree.length >= 2 && (
              <SlideIn delay={100} from="bottom"><View style={styles.podiumContainer}>
                {topThree[1] && <PodiumColumn entry={topThree[1]} rank={2} colors={colors} />}
                {topThree[0] && <PodiumColumn entry={topThree[0]} rank={1} colors={colors} />}
                {topThree[2] && <PodiumColumn entry={topThree[2]} rank={3} colors={colors} />}
              </View></SlideIn>
            )}

            {/* Full list */}
            <View style={styles.list}>
              {leaderboard.map((entry, index) => (
                <SlideIn key={entry.memberId} delay={200 + index * 100} from="bottom">
                  <ScalePress onPress={() => router.push(`/app/member/${entry.memberId}`)} style={undefined}>
                    <View
                      style={[styles.row, { backgroundColor: colors.surface }, entry.isCurrentUser && { borderWidth: 2, borderColor: colors.primary }]}
                      accessibilityLabel={`${entry.displayName}, rank ${entry.rank}, ${entry.points} points`}
                    >
                      {entry.rank <= 3 ? (
                        <View style={[styles.rankMedal, { backgroundColor: entry.rank === 1 ? Colors.gold : entry.rank === 2 ? '#B0BEC5' : Colors.bronze }]}>
                          <Text style={styles.rankMedalText}>{entry.rank}</Text>
                        </View>
                      ) : (
                        <Text style={[styles.rowRankNum, { color: colors.textMuted }]}>{entry.rank}</Text>
                      )}
                      <Avatar emoji={entry.avatarEmoji} photoURL={entry.photoURL} size={40} />
                      <View style={styles.rowInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.rowName, { color: colors.text }]}>{entry.displayName}{entry.isCurrentUser ? ' (You)' : ''}</Text>
                          {(entry as any).previousRank != null && (
                            <RankChangeBadge previousRank={(entry as any).previousRank} currentRank={entry.rank} />
                          )}
                        </View>
                        <Text style={[styles.rowStats, { color: colors.textSecondary }]}>
                          {entry.tasksCompleted}/{entry.tasksTotal} tasks
                          {entry.streak > 0 ? ` · 🔥 ${entry.streak}d` : ''}
                        </Text>
                      </View>
                      <View style={styles.rowPoints}>
                        <CountUp value={entry.points} style={[styles.rowPointsValue, { color: colors.primary }]} />
                        <Text style={[styles.rowPointsLabel, { color: colors.textSecondary }]}>pts</Text>
                      </View>
                    </View>
                  </ScalePress>
                </SlideIn>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Podium column — premium gradient pedestal ───────────────────────────────
const PODIUM_CFG: Record<1 | 2 | 3, { grad: readonly [string, string]; height: number; avatar: number; ring: string }> = {
  1: { grad: Gradients.gold, height: 110, avatar: 66, ring: Colors.gold },
  2: { grad: Gradients.silver, height: 80, avatar: 52, ring: '#8595AC' },
  3: { grad: Gradients.bronze, height: 56, avatar: 52, ring: Colors.bronze },
};

function PodiumColumn({ entry, rank, colors }: { entry: LeaderboardEntry; rank: 1 | 2 | 3; colors: any }) {
  const cfg = PODIUM_CFG[rank];
  return (
    <View style={[styles.podiumItem, rank === 1 && styles.podiumItemFirst]}>
      {rank === 1 && <Text style={styles.crownEmoji}>👑</Text>}
      <Avatar emoji={entry.avatarEmoji ?? '👤'} photoURL={entry.photoURL} size={cfg.avatar} showRing ringColor={cfg.ring} />
      <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>{entry.displayName}</Text>
      <View style={styles.podiumPtsRow}>
        <CountUp value={entry.points} style={[styles.podiumPoints, { color: colors.text }]} />
        <Text style={[styles.podiumPtsLabel, { color: colors.textMuted }]}> pts</Text>
      </View>
      <LinearGradient
        colors={[...cfg.grad]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.podiumBlock, { height: cfg.height }, Shadow.md]}
      >
        <View style={styles.podiumRankBadge}>
          <Text style={styles.podiumRankNum}>{rank}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

// ── Three-crowns row ────────────────────────────────────────────────────────
// A fixed 👑 / 📈 / 🎯 trio. Awarded slots show the member; unawarded slots read
// as "up for grabs" so the row looks intentional even early in the week.
// Per-crown accent: `tint` drives the background wash, `ink` is a readable
// border/label colour that holds contrast in BOTH light and dark mode (plain
// gold text is unreadable on white, so 'top' uses a darker gold ink).
const CROWN_ACCENT: Record<CrownSlot['kind'], { tint: string; ink: string }> = {
  top:      { tint: '#FFD700', ink: '#C98A00' },
  improved: { tint: '#43D98F', ink: '#1E9E63' },
  goal:     { tint: '#6C63FF', ink: '#5A4FD6' },
};

function CrownsRow({ crowns, colors }: { crowns: CrownSlot[]; colors: any }) {
  return (
    <View style={crownStyles.row}>
      {crowns.map((c) => {
        const awarded = !!c.awardeeMemberId;
        const accent = CROWN_ACCENT[c.kind];
        return (
          <View
            key={c.kind}
            style={[
              crownStyles.card,
              awarded
                ? { backgroundColor: accent.tint + '24', borderColor: accent.ink, borderStyle: 'solid' }
                : { backgroundColor: colors.surface, borderColor: colors.primary + '33', borderStyle: 'dashed' },
              awarded && Shadow.sm,
            ]}
          >
            <Text style={[crownStyles.emoji, !awarded && { opacity: 0.8 }]}>{c.emoji}</Text>
            <Text
              style={[crownStyles.title, { color: awarded ? accent.ink : colors.textSecondary }]}
              numberOfLines={1}
            >{c.title}</Text>
            {awarded ? (
              <>
                <Text style={[crownStyles.name, { color: colors.text }]} numberOfLines={1}>{c.awardeeName}</Text>
                <Text style={[crownStyles.detail, { color: accent.ink }]} numberOfLines={1}>{c.detail}</Text>
              </>
            ) : (
              <Text style={[crownStyles.upForGrabs, { color: colors.primary }]} numberOfLines={1}>up for grabs</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
const crownStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  card: { flex: 1, borderRadius: BorderRadius.lg, borderWidth: 1.5, paddingVertical: Spacing.sm, paddingHorizontal: 6, alignItems: 'center' },
  emoji: { fontSize: 22, marginBottom: 2 },
  title: { fontSize: 9.5, fontFamily: FontFamily.bold, textTransform: 'uppercase', letterSpacing: 0.3 },
  name: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, marginTop: 3 },
  detail: { fontSize: 10, fontFamily: FontFamily.bold, marginTop: 1 },
  upForGrabs: { fontSize: 10, fontFamily: FontFamily.regular, marginTop: 5, fontStyle: 'italic' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandRow: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 2 },
  winnerBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.md },
  winnerBannerEmoji: { fontSize: 26 },
  winnerBannerTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold },
  winnerBannerSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },
  winnerBannerChevron: { fontSize: 26, fontFamily: FontFamily.bold },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  historyBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, borderWidth: 1 },
  historyBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  weekLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 4 },
  podiumContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, justifyContent: 'center', gap: 10 },
  podiumItem: { flex: 1, alignItems: 'center' },
  podiumItemFirst: { zIndex: 2 },
  crownEmoji: { fontSize: 28, marginBottom: 4 },
  podiumName: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, marginTop: 8, maxWidth: '100%' },
  podiumPtsRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2, marginBottom: 8 },
  podiumPoints: { fontSize: FontSize.lg, fontFamily: FontFamily.black },
  podiumPtsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  podiumBlock: { width: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 10 },
  podiumRankBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  podiumRankNum: { fontSize: 18, fontFamily: FontFamily.black, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
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
  rankMedal: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 2, ...Shadow.sm },
  rankMedalText: { fontSize: FontSize.sm, fontFamily: FontFamily.black, color: '#FFFFFF' },
  rowRankNum: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, width: 28, textAlign: 'center' },
  rowAvatar: { fontSize: 30, marginRight: Spacing.sm },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  rowStats: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  rowPoints: { alignItems: 'flex-end' },
  rowPointsValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  rowPointsLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold },
});
