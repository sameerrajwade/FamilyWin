import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { firestore } from '@/lib/fb';
import { Col, getFamilyMembers } from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import type { MemberDoc } from '@/lib/firebase';
import { getPointsColor, formatPoints, getWeekLabel, getCurrentWeekRange, computeInsights } from '@/lib/pointsEngine';
import type { InsightCard } from '@/lib/pointsEngine';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Avatar } from '@/components/ui';
import { BrandBar } from '@/components/ui/Brand';
import { useTheme } from '@/lib/theme';
import { router } from 'expo-router';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import type { TransactionDoc } from '@/lib/firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MAX_HEIGHT = 120;
type ViewMode = 'mine' | 'family';

// Distinct, high-contrast per-member colours for the family contribution view —
// readable in both light and dark mode. Assigned by member order.
const MEMBER_COLORS = ['#6C63FF', '#43D98F', '#FF6B2C', '#00B8D4', '#FF5C8A', '#FFB300', '#8E5BFF', '#00C48C'];

type MemberContribution = {
  memberId: string; name: string; emoji: string; photoURL?: string;
  color: string; total: number; weeks: number[];
};

export default function HistoryScreen() {
  const { member, family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ week: string; points: number }[]>([]);
  const [familyBreakdown, setFamilyBreakdown] = useState<MemberContribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [totalPoints, setTotalPoints] = useState(0);
  const [thisWeekPoints, setThisWeekPoints] = useState(0);
  const [tasksThisWeek, setTasksThisWeek] = useState(0);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  // Recent Activity is capped to a short list by default so it doesn't scroll
  // forever; "See all" expands it to the full loaded window.
  const [showAllActivity, setShowAllActivity] = useState(false);

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { colors } = useTheme();

  const loadHistory = useCallback(async () => {
    if (!member?.id || !family?.id) return;
    try {
      // Note: Avoid orderBy+where composite queries (require Firestore index).
      // Fetch without orderBy and sort client-side instead. Limit is generous
      // (500) so the This-Week and 6-week SUMS below are computed from the full
      // window, not a truncated slice — the old limit(100)→slice(50) quietly
      // made those totals wrong for an active family.
      const baseQuery = viewMode === 'mine'
        ? Col.transactions(family.id).where('memberId', '==', member.id).limit(500)
        : Col.transactions(family.id).limit(500);

      const snap = await baseQuery.get();
      const txList = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as TransactionDoc)
        .sort((a, b) => {
          const aT = (a.createdAt as any)?.toDate?.()?.getTime?.() ?? 0;
          const bT = (b.createdAt as any)?.toDate?.()?.getTime?.() ?? 0;
          return bT - aT;
        });
      setTransactions(txList);

      const total = txList.reduce((sum: number, tx: TransactionDoc) => sum + tx.delta, 0);
      setTotalPoints(total);

      const { start: weekStart } = getCurrentWeekRange(family.weekStartDay ?? 1);
      const thisWeek = txList
        .filter((tx: TransactionDoc) => tx.createdAt?.toDate() >= weekStart)
        .reduce((sum: number, tx: TransactionDoc) => sum + tx.delta, 0);
      setThisWeekPoints(thisWeek);

      // Tasks actually completed this week — a real momentum number, unlike the
      // old "Events" tile (which just counted rows in a capped list).
      const doneThisWeek = txList.filter(
        (tx: TransactionDoc) => tx.source === 'task' && tx.delta > 0 && (tx.createdAt?.toDate() ?? new Date(0)) >= weekStart,
      ).length;
      setTasksThisWeek(doneThisWeek);

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

      // Family view: per-member contribution over the last 4 weeks, so you can
      // see at a glance WHO is driving the family's points.
      if (viewMode === 'family') {
        const bounds: { start: Date; end: Date }[] = [];
        for (let i = 3; i >= 0; i--) {
          const mon = new Date();
          mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - i * 7);
          mon.setHours(0, 0, 0, 0);
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
          bounds.push({ start: mon, end: sun });
        }
        const byMember = new Map<string, number[]>();
        for (const tx of txList) {
          const d = tx.createdAt?.toDate?.();
          if (!d) continue;
          const wi = bounds.findIndex((b) => d >= b.start && d <= b.end);
          if (wi < 0) continue;
          if (!byMember.has(tx.memberId)) byMember.set(tx.memberId, [0, 0, 0, 0]);
          byMember.get(tx.memberId)![wi] += tx.delta;
        }
        const breakdown: MemberContribution[] = Array.from(byMember.entries())
          .map(([mid, wk]) => {
            const m = members.find((mm) => mm.id === mid);
            return {
              memberId: mid, name: m?.displayName ?? 'Member', emoji: m?.avatarEmoji ?? '🙂',
              photoURL: (m as any)?.photoURL, color: '', total: wk.reduce((a, b) => a + b, 0), weeks: wk,
            };
          })
          .sort((a, b) => b.total - a.total)
          .map((c, i) => ({ ...c, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
        setFamilyBreakdown(breakdown);
      } else {
        setFamilyBreakdown([]);
      }

      // Plain-language insight cards derived from the same transaction log.
      setInsights(computeInsights(
        txList.map((tx) => ({
          delta: tx.delta,
          source: tx.source,
          reason: (tx as any).reason,
          date: tx.createdAt?.toDate?.() ?? new Date(),
        })),
        weeks,
        weekStart,
      ));
    } catch (error) {
      if (__DEV__) console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [member?.id, family?.id, viewMode, members]);

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
  const maxContribTotal = Math.max(...familyBreakdown.map((x) => Math.abs(x.total)), 1);
  const maxContribWeek = Math.max(...familyBreakdown.flatMap((x) => x.weeks.map((w) => Math.abs(w))), 1);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <BrandBar />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}>
        <View style={styles.header}>
          {/* Tab name intentionally omitted — bottom "Insights" tab identifies it. */}
          <View style={{ flex: 1 }} />
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

        {/* Bet 2 — the parent's weekly payoff, one tap from Insights. */}
        {isParent && (
          <TouchableOpacity
            style={[styles.reportCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '44' }]}
            onPress={() => router.push('/app/report' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open your family's weekly report"
          >
            <EmojiIcon emoji="🏆" size={34} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.reportTitle, { color: colors.text }]}>Your family’s week</Text>
              <Text style={[styles.reportSub, { color: colors.textSecondary }]}>Chores handled, time saved, and who to cheer on.</Text>
            </View>
            <Text style={[styles.reportChevron, { color: colors.textMuted }]}>›</Text>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            {/* Calm KPI row — one hairline border, colour carried by the values */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.statEmoji}>⭐</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{formatPoints(totalPoints)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>All Time</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.statEmoji}>📊</Text>
                <Text style={[styles.statValue, { color: thisWeekPoints >= 0 ? colors.success : colors.danger }]}>
                  {thisWeekPoints >= 0 ? '+' : ''}{formatPoints(thisWeekPoints)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Net This Week</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.statEmoji}>✅</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{tasksThisWeek}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tasks Done</Text>
              </View>
            </View>
            {/* One-line explainer — the #1 source of "why is this number different
                from Home?" confusion. Net = earned − penalties − reward spending. */}
            <Text style={[styles.kpiCaption, { color: colors.textMuted }]}>
              Net This Week = points earned minus penalties and reward spending — not the same as the “earned this week” on Home.
            </Text>

            {/* ONE lead highlight instead of a 3-card strip — the single most
                relevant plain-language insight, full-width so the screen reads
                as fewer, clearer modules (chart + activity carry the rest). */}
            {insights.length > 0 && (() => {
              const c = insights[0];
              const toneColor = c.tone === 'good' ? colors.success : c.tone === 'bad' ? colors.danger : colors.primary;
              return (
                <View style={styles.highlightWrap}>
                  <View style={[styles.highlightCard, { backgroundColor: toneColor + '12', borderColor: toneColor + '33' }]}>
                    <Text style={styles.highlightEmoji}>{c.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.highlightTitle, { color: colors.text }]} numberOfLines={2}>{c.title}</Text>
                      <Text style={[styles.highlightDetail, { color: colors.textSecondary }]} numberOfLines={2}>{c.detail}</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

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
                      <Text style={[styles.barLabel, { color: colors.textMuted }, isCurrent && { color: colors.textAccent, fontFamily: FontFamily.bold }]}>{d.week}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {viewMode === 'family' && familyBreakdown.length > 0 && (
              <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Who's contributing · last 4 weeks</Text>
                {familyBreakdown.map((m) => (
                  <View key={m.memberId} style={styles.contribRow}>
                    <View style={styles.contribHead}>
                      <View style={[styles.contribDot, { backgroundColor: m.color }]} />
                      <Text style={[styles.contribName, { color: colors.text }]} numberOfLines={1}>{m.emoji}  {m.name}</Text>
                      <Text style={[styles.contribTotal, { color: m.color }]}>{m.total >= 0 ? '+' : ''}{m.total}</Text>
                    </View>
                    <View style={styles.contribBottom}>
                      <View style={[styles.contribBarTrack, { backgroundColor: colors.border + '66' }]}>
                        <View style={[styles.contribBarFill, { width: `${Math.max((Math.abs(m.total) / maxContribTotal) * 100, 3)}%`, backgroundColor: m.color }]} />
                      </View>
                      <View style={styles.contribTrend}>
                        {m.weeks.map((w, i) => (
                          <View
                            key={i}
                            style={[styles.contribTrendBar, {
                              height: Math.max((Math.abs(w) / maxContribWeek) * 22, 2),
                              backgroundColor: m.color, opacity: i === 3 ? 1 : 0.45,
                            }]}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
                <Text style={[styles.contribHint, { color: colors.textMuted }]}>Trend = last 4 weeks · brightest bar = this week</Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
              {transactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>📭</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Complete tasks to start earning points!</Text>
                </View>
              ) : (
                <>
                  {(showAllActivity ? transactions : transactions.slice(0, 5)).map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} showMember={viewMode === 'family'} colors={colors} members={members} />
                  ))}
                  {transactions.length > 5 && (
                    <TouchableOpacity
                      style={[styles.seeAllBtn, { borderColor: colors.border }]}
                      onPress={() => setShowAllActivity((v) => !v)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.seeAllText, { color: colors.textAccent }]}>
                        {showAllActivity ? 'Show less' : `See all ${transactions.length} activities`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
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
            <Avatar emoji={txMember.avatarEmoji} photoURL={txMember.photoURL} size={16} memberId={txMember.id} />
            <Text style={[styles.txMemberName, { color: colors.textAccent }]}>
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
  brandRow: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  toggleRow: { flexDirection: 'row', borderRadius: 20, padding: 2 },
  toggleBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 20 },
  toggleText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.sm },
  reportCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.md },
  reportTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold },
  reportSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginTop: 2 },
  reportChevron: { fontSize: 28, fontFamily: FontFamily.bold },
  kpiCaption: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, lineHeight: 15 },
  seeAllBtn: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  seeAllText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  statCard: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', borderWidth: 1, ...Shadow.sm },
  statEmoji: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold },
  statLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  highlightWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  highlightCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md },
  highlightEmoji: { fontSize: 26 },
  highlightTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, marginBottom: 2 },
  highlightDetail: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, lineHeight: 16 },
  chartCard: { marginHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg, ...Shadow.sm },
  contribRow: { marginBottom: Spacing.md },
  contribHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  contribDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  contribName: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  contribTotal: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, marginLeft: 8 },
  contribBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  contribBarTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  contribBarFill: { height: '100%', borderRadius: 5, minWidth: 6 },
  contribTrend: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 24, width: 58 },
  contribTrendBar: { flex: 1, borderRadius: 2, minHeight: 2 },
  contribHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2, fontStyle: 'italic' },
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
