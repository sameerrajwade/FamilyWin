/**
 * components/ui/Season.tsx — 4-week seasons (Phase F1)
 * ─────────────────────────────────────────────────────────────────────────────
 *   <SeasonCard>   Scores tab: "Season 1 · week 2 of 4 · 13 days left" and the
 *                  season standings (points earned this season, competitors).
 *   <SeasonBadges> Profile: medals left by finished seasons.
 *   useSeason()    Current season + standings + badges, from the app-wide
 *                  ledger (lib/memberLevels) — nothing extra is read or stored.
 * Rules live in lib/seasons.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { useMemberLevels } from '@/lib/memberLevels';
import { competitors } from '@/lib/familyGame';
import { seasonFor, seasonByNumber, seasonStandings, seasonBadges, SEASON_WEEKS } from '@/lib/seasons';
import { Avatar } from '@/components/ui';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

export function useSeason() {
  const { family } = useAuthStore();
  const { members } = useFamilyStore();
  const txns = useMemberLevels((s) => s.txns);
  const weekStartDay = family?.weekStartDay ?? 1;
  return useMemo(() => {
    const season = seasonFor(new Date(), weekStartDay);
    const players = competitors(members as any[], family?.competitionMode);
    const ids = players.map((m: any) => m.id);
    return {
      season,
      players,
      rows: seasonStandings(txns, ids, season),
      badges: seasonBadges(txns, ids, new Date(), weekStartDay),
    };
  }, [txns, members, weekStartDay, family?.competitionMode]);
}

export function SeasonCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { members } = useFamilyStore();
  const { season, rows } = useSeason();
  if (season.number < 1 || rows.length === 0) return null;
  const endLabel = new Date(season.end.getTime() - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const byId = new Map((members as any[]).map((m) => [m.id, m]));
  const anyPoints = rows.some((r) => r.points > 0);

  return (
    <View style={styles.card} accessibilityLabel={`Season ${season.number}, week ${season.week} of ${SEASON_WEEKS}`}>
      <View style={styles.head}>
        <EmojiIcon emoji="🏅" size={26} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Season {season.number}</Text>
          <Text style={styles.sub}>Week {season.week} of {SEASON_WEEKS} · ends {endLabel} · {season.daysLeft} {season.daysLeft === 1 ? 'day' : 'days'} left</Text>
        </View>
      </View>
      {/* Week dots: where we are in the season. */}
      <View style={styles.dots}>
        {Array.from({ length: SEASON_WEEKS }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i < season.week ? colors.primary : colors.border }]} />
        ))}
      </View>
      {!anyPoints ? (
        <Text style={styles.empty}>No season points yet — the first chore takes the lead.</Text>
      ) : rows.slice(0, 4).map((r) => {
        const m: any = byId.get(r.memberId);
        return (
          <View key={r.memberId} style={styles.row}>
            <Text style={styles.rank}>{r.rank === 1 && r.points > 0 ? '🥇' : r.rank}</Text>
            <Avatar emoji={m?.avatarEmoji} photoURL={m?.photoURL} size={30} memberId={r.memberId} />
            <Text style={styles.name} numberOfLines={1}>{(m?.displayName ?? 'Someone').split(' ')[0]}</Text>
            <Text style={styles.pts}>{r.points}<Text style={styles.ptsUnit}> pts</Text></Text>
          </View>
        );
      })}
      <Text style={styles.foot}>Top scorer after week {SEASON_WEEKS} wins the season medal 🥇 · earn points all {SEASON_WEEKS} weeks for 🏅</Text>
    </View>
  );
}

/**
 * Winner screen, first week of a new season only: crowns the season that just
 * ended (🥇 champion — ties share it) and names everyone who played all 4 weeks.
 */
export function SeasonEndCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family } = useAuthStore();
  const { members } = useFamilyStore();
  const txns = useMemberLevels((s) => s.txns);
  const { season, players } = useSeason();
  if (season.week !== 1 || season.number < 2) return null;
  const prev = seasonByNumber(season.number - 1, family?.weekStartDay ?? 1);
  const rows = seasonStandings(txns, players.map((m: any) => m.id), prev);
  const champs = rows.filter((r) => r.rank === 1 && r.points > 0);
  if (champs.length === 0) return null;
  const byId = new Map((members as any[]).map((m) => [m.id, m]));
  const name = (id: string) => ((byId.get(id) as any)?.displayName ?? 'Someone').split(' ')[0];
  const allWeeks = Object.entries(seasonBadges(txns, players.map((m: any) => m.id), new Date(), family?.weekStartDay ?? 1))
    .filter(([, list]) => list.some((b) => b.season === prev.number && b.kind === 'allweeks'))
    .map(([id]) => name(id));

  return (
    <View style={[styles.card, { borderColor: colors.primary + '66' }]} accessibilityLabel={`Season ${prev.number} champion ${champs.map((c) => name(c.memberId)).join(' and ')}`}>
      <View style={styles.head}>
        <EmojiIcon emoji="🥇" size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sub}>SEASON {prev.number} IS OVER</Text>
          <Text style={styles.title}>{champs.map((c) => name(c.memberId)).join(' & ')} won the season!</Text>
        </View>
      </View>
      <View style={[styles.row, { justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm }]}>
        {champs.slice(0, 3).map((c) => {
          const m: any = byId.get(c.memberId);
          return <Avatar key={c.memberId} emoji={m?.avatarEmoji} photoURL={m?.photoURL} size={56} memberId={c.memberId} />;
        })}
      </View>
      <Text style={[styles.empty, { textAlign: 'center' }]}>{champs[0].points} points across 4 weeks · Season {season.number} starts now</Text>
      {allWeeks.length > 0 && (
        <Text style={[styles.foot, { textAlign: 'center' }]}>🏅 Played all 4 weeks: {allWeeks.join(', ')}</Text>
      )}
    </View>
  );
}

export function SeasonBadges({ memberId }: { memberId?: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { badges } = useSeason();
  const mine = memberId ? badges[memberId] ?? [] : [];
  if (mine.length === 0) return null;
  return (
    <View style={styles.badgeCard}>
      <Text style={styles.badgeTitle}>Season badges</Text>
      {mine.map((b) => (
        <View key={`${b.season}-${b.kind}`} style={styles.badgeRow}>
          <EmojiIcon emoji={b.emoji} size={26} />
          <Text style={styles.badgeLabel}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: colors.primary + '33', ...Shadow.sm },
    head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    sub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 1 },
    dots: { flexDirection: 'row', gap: 6, marginVertical: Spacing.sm },
    dot: { flex: 1, height: 6, borderRadius: 3 },
    empty: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, paddingVertical: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
    rank: { width: 22, textAlign: 'center', fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.textMuted },
    name: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
    pts: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.textAccent },
    ptsUnit: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
    foot: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textMuted, marginTop: Spacing.sm },
    badgeCard: { alignSelf: 'stretch', marginHorizontal: Spacing.xl, marginTop: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.border, padding: Spacing.md },
    badgeTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text, marginBottom: Spacing.sm },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 3 },
    badgeLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
  });
}
