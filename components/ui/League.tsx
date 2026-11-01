/**
 * components/ui/League.tsx — family vs family on screen (Phase G7)
 * ─────────────────────────────────────────────────────────────────────────────
 *   useFamilyLeague() — the family's league (live) + this season's table.
 *   <LeagueTable>     — families ranked by average points per player.
 *   <LeagueCard>      — compact version for the Scores tab; for a parent with no
 *                       league yet, a one-line "Challenge another family".
 * Other families appear as name + score only. Data: lib/leagues.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { watchLeague, rankLeague, seasonChampions, type League, type RankedRow } from '@/lib/leagues';
import { seasonFor, SEASON_WEEKS } from '@/lib/seasons';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

export function useFamilyLeague() {
  const { family } = useAuthStore();
  const leagueId = family?.leagueIds?.[0] ?? null;
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(!!leagueId);

  useEffect(() => {
    setLeague(null);
    if (!leagueId) { setLoading(false); return; }
    setLoading(true);
    return watchLeague(leagueId, (l) => { setLeague(l); setLoading(false); });
  }, [leagueId]);

  // Leagues run on Monday-start seasons for everyone, whatever each family's week.
  const season = seasonFor(new Date(), 1);
  const rows = useMemo(() => (league ? rankLeague(league.rows, season.number) : []), [league, season.number]);
  const lastChampions = useMemo(
    () => (league && season.week === 1 && season.number > 1 ? seasonChampions(league.rows, season.number - 1) : []),
    [league, season.week, season.number],
  );
  return { leagueId, league, rows, season, lastChampions, loading, myFamilyId: family?.id };
}

export function LeagueTable({ rows, myFamilyId, limit }: { rows: RankedRow[]; myFamilyId?: string; limit?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shown = limit ? rows.slice(0, limit) : rows;
  const mine = rows.find((r) => r.familyId === myFamilyId);
  return (
    <View>
      {shown.map((r) => <LeagueRowView key={r.familyId} r={r} me={r.familyId === myFamilyId} styles={styles} />)}
      {limit && mine && !shown.includes(mine) && <LeagueRowView r={mine} me styles={styles} />}
    </View>
  );
}

function LeagueRowView({ r, me, styles }: { r: RankedRow; me: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.row, me && styles.rowMe]} accessibilityLabel={`${r.rank}. ${r.familyName}${me ? ' (your family)' : ''}, ${r.avgPoints} points per player`}>
      <Text style={styles.rank}>{r.rank === 1 && r.avgPoints > 0 ? '🥇' : r.rank}</Text>
      <EmojiIcon emoji={r.emoji || '🏠'} size={26} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{r.familyName}{me ? ' (you)' : ''}</Text>
        <Text style={styles.sub}>{r.points} pts · {r.players} {r.players === 1 ? 'player' : 'players'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.avg}>{r.avgPoints}</Text>
        <Text style={styles.avgUnit}>per player</Text>
      </View>
    </View>
  );
}

/** Scores tab: the league at a glance, or (parents) an invitation to start one. */
export function LeagueCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { member } = useAuthStore();
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { leagueId, league, rows, season, lastChampions, myFamilyId } = useFamilyLeague();

  if (!leagueId) {
    if (!isParent) return null;
    return (
      <TouchableOpacity style={styles.cta} onPress={() => router.push('/app/league' as any)} activeOpacity={0.85} accessibilityRole="button">
        <EmojiIcon emoji="🏆" size={26} />
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaTitle}>Challenge another family</Text>
          <Text style={styles.ctaSub}>Start a league with cousins or friends — a 4-week season, family vs family.</Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </TouchableOpacity>
    );
  }
  if (!league) return null;

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push('/app/league' as any)} activeOpacity={0.9} accessibilityRole="button">
      <View style={styles.head}>
        <EmojiIcon emoji="🏆" size={26} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{league.name}</Text>
          <Text style={styles.headSub}>Family league · Season {season.number}, week {season.week} of {SEASON_WEEKS}</Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </View>
      {lastChampions.length > 0 && (
        <Text style={styles.champ}>🥇 Season {season.number - 1} winner: {lastChampions.map((c) => c.familyName).join(' & ')}</Text>
      )}
      <LeagueTable rows={rows} myFamilyId={myFamilyId} limit={3} />
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: colors.accent + '44', ...Shadow.sm },
    head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    headSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 1 },
    champ: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent, marginBottom: Spacing.sm },
    chev: { fontSize: 24, fontFamily: FontFamily.bold, color: colors.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: 6, borderRadius: BorderRadius.md },
    rowMe: { backgroundColor: colors.primary + '14' },
    rank: { width: 24, textAlign: 'center', fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.textMuted },
    name: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
    sub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 1 },
    avg: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.textAccent },
    avgUnit: { fontSize: 10, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
    cta: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, padding: Spacing.md },
    ctaTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    ctaSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  });
}
