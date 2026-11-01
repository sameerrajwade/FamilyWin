/**
 * winner.tsx — Weekly Champion takeover (Roadmap 1.4).
 * ─────────────────────────────────────────────────────────────────────────────
 * The emotional payoff of the whole app: who won the week. Shown as a full-screen
 * celebration — confetti, trophy, the champion, the final podium, a few stat
 * tiles, and a share brag (the organic growth loop) + a "start new week" CTA.
 *
 * Data: computed CLIENT-SIDE from last week's transactions so it works whether or
 * not the weeklyReset Cloud Function has run yet. Ties → shared win. A week with
 * no activity → a gentle "no champion" state rather than a crash.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { firestore } from '@/lib/fb';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import { Col, getFamilyMembers } from '@/lib/firebase';
import { buildLeaderboard, computeCrowns, getCurrentWeekRange, getWeekLabel } from '@/lib/pointsEngine';
import type { LeaderboardEntry, CrownSlot } from '@/lib/pointsEngine';
import { competitors } from '@/lib/familyGame';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui';
import { BrandLockup } from '@/components/ui/Brand';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCard';
import { Confetti } from '@/components/ui/Animations';

export default function WinnerScreen() {
  const { family, member } = useAuthStore();
  const { colors, isDark } = useTheme();

  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [crowns, setCrowns] = useState<CrownSlot[]>([]);
  const [tasksDone, setTasksDone] = useState<Record<string, number>>({});
  const [weekLabel, setWeekLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  useEffect(() => {
    (async () => {
      if (!family?.id || !member?.id) return;
      try {
        // Last week's window = this week's start shifted back 7 days.
        const { start } = getCurrentWeekRange(family.weekStartDay ?? 1);
        const lastStart = new Date(start); lastStart.setDate(lastStart.getDate() - 7);
        const lastEnd = new Date(start); lastEnd.setMilliseconds(lastEnd.getMilliseconds() - 1);
        setWeekLabel(getWeekLabel(lastStart));

        // Two weeks back: last week is the one being crowned; the week before it
        // is the baseline for 📈 Most Improved.
        const prevStart = new Date(lastStart); prevStart.setDate(prevStart.getDate() - 7);
        const snap = await Col.transactions(family.id)
          .where('createdAt', '>=', firestore.Timestamp.fromDate(prevStart))
          .where('createdAt', '<=', firestore.Timestamp.fromDate(lastEnd))
          .get();

        const totals: Record<string, number> = {};
        const baseline: Record<string, number> = {};
        const taskCounts: Record<string, number> = {};
        for (const doc of snap.docs) {
          const d = doc.data();
          if (d.source === 'redemption') continue;
          const when = d.createdAt?.toDate?.() as Date | undefined;
          if (when && when < lastStart) { baseline[d.memberId] = (baseline[d.memberId] ?? 0) + d.delta; continue; }
          totals[d.memberId] = (totals[d.memberId] ?? 0) + d.delta;
          if (d.source === 'task' && d.delta > 0) taskCounts[d.memberId] = (taskCounts[d.memberId] ?? 0) + 1;
        }

        // Crowned players follow the family's competition mode (default:
        // everyone; 'kids' = parents coach).
        const members = await getFamilyMembers(family.id);
        const players = competitors(members as any[], family.competitionMode);
        const lb = buildLeaderboard(totals, players as any, member.id, {}, {});
        const goals: Record<string, number> = {};
        for (const m of players as any[]) if (typeof m.weeklyGoal === 'number' && m.weeklyGoal > 0) goals[m.id] = m.weeklyGoal;
        setBoard(lb);
        setCrowns(computeCrowns(lb, baseline, goals));
        setTasksDone(taskCounts);
      } catch (e) {
        if (__DEV__) console.error('[Winner] load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [family?.id, member?.id, family?.competitionMode]);

  // Champions = everyone tied at rank 1 with a positive score.
  const champions = board.filter((e) => e.rank === 1 && e.points > 0);
  const hasWinner = champions.length > 0;
  const runnerUpPoints = board.find((e) => e.rank > 1)?.points ?? 0;
  const margin = hasWinner ? champions[0].points - runnerUpPoints : 0;

  useEffect(() => {
    if (!loading && hasWinner) {
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const t = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(t);
    }
  }, [loading, hasWinner]);

  const championNames = champions.map((c) => c.displayName.split(' ')[0]).join(' & ');

  // The branded share-card spec for this week's win (Phase 2 share cards).
  const winCard: ShareCardData | null = hasWinner ? {
    icon: 'podium',
    eyebrow: champions.length > 1 ? 'CO-CHAMPIONS' : 'WIN OF THE WEEK',
    title: champions.length > 1 ? `${championNames} tied the crown!` : `${championNames} won the week!`,
    subtitle: weekLabel,
    stats: [
      { value: `${champions[0].points}`, label: 'points' },
      ...(margin > 0 ? [{ value: `+${margin}`, label: 'margin' }] : []),
    ],
    shareMessage: `🏆 ${championNames} ${champions.length > 1 ? 'are' : 'is'} our family champion this week with ${champions[0].points} points on Lootboard! Chores in, champions out. 🎉`,
  } : null;

  function handleShare() {
    if (!hasWinner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowShareCard(true);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Confetti visible={showConfetti} count={110} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <BrandLockup size="sm" />
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close" hitSlop={12}>
            <Text style={[styles.close, { color: colors.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
        ) : !hasWinner ? (
          <View style={styles.noWinner}>
            <Text style={styles.noWinnerEmoji}>🌱</Text>
            <Text style={[styles.noWinnerTitle, { color: colors.text }]}>A fresh week awaits</Text>
            <Text style={[styles.noWinnerSub, { color: colors.textSecondary }]}>
              No points were earned last week, so there's no champion yet. Complete tasks this week to claim the crown!
            </Text>
          </View>
        ) : (
          <>
            {/* Champion hero — the shareable card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: Colors.gold + '66' }, Shadow.lg]}>
              <Text style={styles.trophy}>🏆</Text>
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>CHAMPION OF THE WEEK</Text>
              <Text style={[styles.weekLabel, { color: colors.textMuted }]}>{weekLabel}</Text>

              <View style={styles.championRow}>
                {champions.slice(0, 3).map((c) => (
                  <View key={c.memberId} style={styles.championItem}>
                    <Avatar emoji={c.avatarEmoji} photoURL={c.photoURL} size={88} showRing ringColor={Colors.gold} />
                    <Text style={[styles.championName, { color: colors.text }]} numberOfLines={1}>{c.displayName.split(' ')[0]}</Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.championPoints, { color: Colors.gold }]}>{champions[0].points}</Text>
              <Text style={[styles.championPtsLabel, { color: colors.textSecondary }]}>points</Text>

              {/* Stat tiles */}
              <View style={styles.tiles}>
                <StatTile emoji="✅" value={String(tasksDone[champions[0].memberId] ?? 0)} label="tasks done" colors={colors} />
                <StatTile emoji="📈" value={margin > 0 ? `+${margin}` : '—'} label="winning margin" colors={colors} />
                <StatTile emoji="🔥" value={champions[0].streak > 0 ? `${champions[0].streak}d` : '—'} label="streak" colors={colors} />
              </View>
            </View>

            {/* Bet 3 — more than one way to win: every crown gets its moment. */}
            {crowns.some((c) => c.awardeeMemberId) && (
              <View style={styles.podiumSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>This week’s crowns</Text>
                {crowns.map((c) => (
                  <View key={c.kind} style={[styles.standRow, { backgroundColor: colors.surface }, c.awardeeMemberId && { borderColor: Colors.gold + '66', borderWidth: 1.5 }]}>
                    <EmojiIcon emoji={c.kind === 'top' ? '👑' : c.kind === 'improved' ? '🚀' : '🎯'} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.standName, { color: colors.text }]}>{c.title}</Text>
                      <Text style={[styles.crownDetail, { color: colors.textSecondary }]}>
                        {c.awardeeName ? `${c.awardeeName} · ${c.detail}` : 'Up for grabs next week'}
                      </Text>
                    </View>
                    {c.awardeeMemberId && <Avatar emoji={c.awardeeEmoji} photoURL={c.awardeePhotoURL} size={40} showRing ringColor={Colors.gold} />}
                  </View>
                ))}
              </View>
            )}

            {/* Final podium (top 3) */}
            {board.length >= 2 && (
              <View style={styles.podiumSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Final Standings</Text>
                {board.slice(0, 5).map((e) => (
                  <View key={e.memberId} style={[styles.standRow, { backgroundColor: colors.surface }, e.rank === 1 && { borderColor: Colors.gold + '88', borderWidth: 1.5 }]}>
                    <Text style={[styles.standRank, { color: e.rank === 1 ? Colors.gold : colors.textSecondary }]}>
                      {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`}
                    </Text>
                    <Avatar emoji={e.avatarEmoji} photoURL={e.photoURL} size={36} />
                    <Text style={[styles.standName, { color: colors.text }]} numberOfLines={1}>
                      {e.displayName}{e.isCurrentUser ? ' (You)' : ''}
                    </Text>
                    <Text style={[styles.standPts, { color: colors.textAccent }]}>{e.points}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Actions */}
            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.primary }]} onPress={handleShare} activeOpacity={0.85}>
              <Text style={styles.shareBtnText}>📤 Share the win</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.startBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={[styles.startBtnText, { color: colors.textSecondary }]}>Start a new week →</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <ShareCardModal visible={showShareCard} data={winCard} onClose={() => setShowShareCard(false)} />
    </SafeAreaView>
  );
}

function StatTile({ emoji, value, label, colors }: { emoji: string; value: string; label: string; colors: any }) {
  return (
    <View style={[styles.tile, { backgroundColor: colors.background }]}>
      <Text style={styles.tileEmoji}>{emoji}</Text>
      <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  close: { fontSize: 22, fontFamily: FontFamily.bold },

  card: { borderRadius: 28, borderWidth: 2, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.lg },
  trophy: { fontSize: 64, marginBottom: Spacing.sm },
  eyebrow: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, letterSpacing: 1.5 },
  weekLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2, marginBottom: Spacing.md },
  championRow: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'center', marginBottom: Spacing.sm },
  championItem: { alignItems: 'center', gap: 6 },
  championName: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold },
  championPoints: { fontSize: 56, fontFamily: FontFamily.black, marginTop: Spacing.sm },
  championPtsLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginTop: -6 },

  tiles: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, alignSelf: 'stretch' },
  tile: { flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  tileEmoji: { fontSize: 20, marginBottom: 4 },
  tileValue: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  tileLabel: { fontSize: 10, fontFamily: FontFamily.regular, marginTop: 2 },

  podiumSection: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, marginBottom: Spacing.sm },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg, padding: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm, borderColor: 'transparent', borderWidth: 1.5, ...Shadow.sm },
  standRank: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, width: 34 },
  standName: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.bold },
  standPts: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  crownDetail: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, marginTop: 2 },

  shareBtn: { borderRadius: BorderRadius.full, paddingVertical: 16, alignItems: 'center', ...Shadow.md, marginBottom: Spacing.sm },
  shareBtnText: { color: '#FFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
  startBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  startBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },

  noWinner: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.lg },
  noWinnerEmoji: { fontSize: 64, marginBottom: Spacing.md },
  noWinnerTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, marginBottom: Spacing.sm },
  noWinnerSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 21 },
});
