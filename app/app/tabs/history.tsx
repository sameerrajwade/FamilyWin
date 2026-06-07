import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import { Col, getFamilyMembers } from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import type { MemberDoc } from '@/lib/firebase';
import { getPointsColor, formatPoints, getWeekLabel, getCurrentWeekRange } from '@/lib/pointsEngine';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Avatar } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import type { TransactionDoc } from '@/lib/firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MAX_HEIGHT = 120;
type ViewMode = 'mine' | 'family';

export default function HistoryScreen() {
  const { member, family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ week: string; points: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [totalPoints, setTotalPoints] = useState(0);
  const [thisWeekPoints, setThisWeekPoints] = useState(0);

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { colors } = useTheme();

  const loadHistory = useCallback(async () => {
    if (!member?.id || !family?.id) return;
    try {
      // Note: Avoid orderBy+where composite queries (require Firestore index).
      // Fetch without orderBy and sort client-side instead.
      const baseQuery = viewMode === 'mine'
        ? Col.transactions(family.id).where('memberId', '==', member.id).limit(100)
        : Col.transactions(family.id).limit(100);

      const snap = await baseQuery.get();
      const txList = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as TransactionDoc)
        .sort((a, b) => {
          const aT = (a.createdAt as any)?.toDate?.()?.getTime?.() ?? 0;
          const bT = (b.createdAt as any)?.toDate?.()?.getTime?.() ?? 0;
          return bT - aT;
        })
        .slice(0, 50);
      setTransactions(txList);

      const total = txList.reduce((sum: number, tx: TransactionDoc) => sum + tx.delta, 0);
      setTotalPoints(total);

      const { start: weekStart } = getCurrentWeekRange();
      const thisWeek = txList
        .filter((tx: TransactionDoc) => tx.createdAt?.toDate() >= weekStart)
        .reduce((sum: number, tx: TransactionDoc) => sum + tx.delta, 0);
      setThisWeekPoints(thisWeek);

      // Build 6-week chart
      const weeks: { week: string; points: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monday = new Date();
        const day = monday.getDay();
        monday.setDate(monday.getDate() - ((day + 6) % 7) - i * 7);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const weekPts = txList
          .filter((tx: TransactionDoc) => {
            const d = tx.createdAt?.toDate();
            return d && d >= monday && d <= sunday;
          })
          .reduce((sum: number, tx: TransactionDoc) => sum + tx.delta, 0);

        weeks.push({ week: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), points: weekPts });
      }
      setWeeklyData(weeks);
    } catch (error) {
      if (__DEV__) console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [member?.id, family?.id, viewMode]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Load members so we can show names/emoji in family view
  useEffect(() => {
    if (family?.id && members.length === 0) {
      getFamilyMembers(family.id).then((list) => setMembers(list as any)).catch(() => {});
    }
  }, [family?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const maxBarValue = Math.max(...weeklyData.map((d) => Math.abs(d.points)), 1);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>📊 History</Text>
          {isParent && (
            <View style={[styles.toggleRow, { backgroundColor: colors.border }]}>
              <TouchableOpacity style={[styles.toggleBtn, viewMode === 'mine' && { backgroundColor: colors.primary }]} onPress={() => setViewMode('mine')}>
                <Text style={[styles.toggleText, { color: colors.textSecondary }, viewMode === 'mine' && { color: '#FFF' }]}>Mine</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, viewMode === 'family' && { backgroundColor: colors.primary }]} onPress={() => setViewMode('family')}>
                <Text style={[styles.toggleText, { color: colors.textSecondary }, viewMode === 'family' && { color: '#FFF' }]}>Family</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.primary + '44' }]}>
                <Text style={styles.statEmoji}>⭐</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{formatPoints(totalPoints)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>All Time</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.success + '44' }]}>
                <Text style={styles.statEmoji}>📅</Text>
                <Text style={[styles.statValue, { color: thisWeekPoints >= 0 ? colors.success : colors.danger }]}>
                  {thisWeekPoints >= 0 ? '+' : ''}{formatPoints(thisWeekPoints)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>This Week</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.warning + '44' }]}>
                <Text style={styles.statEmoji}>📝</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{transactions.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Events</Text>
              </View>
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>6-Week Points Trend</Text>
              <View style={styles.chartContainer}>
                {weeklyData.map((d, i) => {
                  const height = Math.max((Math.abs(d.points) / maxBarValue) * BAR_MAX_HEIGHT, 4);
                  const isPositive = d.points >= 0;
                  const isCurrent = i === weeklyData.length - 1;
                  return (
                    <View key={i} style={styles.barWrapper}>
                      <Text style={[styles.barValue, { color: colors.textSecondary }]}>{d.points !== 0 ? (isPositive ? '+' : '') + d.points : '—'}</Text>
                      <View style={[styles.barTrack, { backgroundColor: colors.border + '66' }]}>
                        <View style={[styles.bar, { height, backgroundColor: isCurrent ? colors.primary : (isPositive ? colors.success : colors.danger), opacity: isCurrent ? 1 : 0.65 }]} />
                      </View>
                      <Text style={[styles.barLabel, { color: colors.textMuted }, isCurrent && { color: colors.primary, fontFamily: FontFamily.bold }]}>{d.week}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
              {transactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>📭</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Complete tasks to start earning points!</Text>
                </View>
              ) : (
                transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} showMember={viewMode === 'family'} colors={colors} members={members} />)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TransactionRow({ tx, showMember, colors, members }: {
  tx: TransactionDoc;
  showMember: boolean;
  colors: any;
  members: MemberDoc[];
}) {
  const isPositive = tx.delta > 0;
  const sourceEmoji = ({
    task: '✅', discipline: isPositive ? '⭐' : '⚠️',
    bonus: '🎁', manual: '✏️', redemption: '🛍️',
  } as Record<string, string>)[tx.source] ?? '📌';

  const date = tx.createdAt?.toDate() ?? new Date();
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const txMember = showMember ? members.find((m) => m.id === tx.memberId) : null;

  return (
    <View style={[styles.txRow, { backgroundColor: colors.surface }]}>
      <View style={[styles.txIconBg, { backgroundColor: isPositive ? colors.success + '22' : colors.danger + '22' }]}>
        <Text style={styles.txIcon}>{sourceEmoji}</Text>
      </View>
      <View style={styles.txInfo}>
        {txMember && (
          <View style={styles.txMemberRow}>
            <Avatar emoji={txMember.avatarEmoji} photoURL={txMember.photoURL} size={16} />
            <Text style={[styles.txMemberName, { color: colors.primary }]}>
              {txMember.displayName.split(' ')[0]}
            </Text>
          </View>
        )}
        <Text style={[styles.txReason, { color: colors.text }]} numberOfLines={2}>{tx.reason}</Text>
        <Text style={[styles.txMeta, { color: colors.textSecondary }]}>{dateStr} · {timeStr}</Text>
      </View>
      <Text style={[styles.txDelta, { color: getPointsColor(tx.delta) }]}>
        {isPositive ? '+' : ''}{tx.delta}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  toggleRow: { flexDirection: 'row', borderRadius: 20, padding: 2 },
  toggleBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 20 },
  toggleText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', borderWidth: 1.5, ...Shadow.sm },
  statEmoji: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  statLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  chartCard: { marginHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg, ...Shadow.sm },
  chartTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, marginBottom: Spacing.md },
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: BAR_MAX_HEIGHT + 60 },
  barWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 9, fontFamily: FontFamily.semiBold, marginBottom: 4, textAlign: 'center' },
  barTrack: { width: '70%', justifyContent: 'flex-end', height: BAR_MAX_HEIGHT },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, fontFamily: FontFamily.regular, marginTop: 6, textAlign: 'center' },
  section: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, marginBottom: Spacing.sm },
  txRow: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.sm },
  txIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txIcon: { fontSize: 22 },
  txInfo: { flex: 1 },
  txMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  txMemberEmoji: { fontSize: 14 },
  txMemberName: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  txReason: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  txMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  txDelta: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, minWidth: 48, textAlign: 'right' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold },
  emptySubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 4, textAlign: 'center' },
});
