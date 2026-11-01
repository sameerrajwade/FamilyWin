/**
 * app/app/report.tsx — Weekly Parent Report (Phase B, Bet 2: "pay the parent back")
 * ─────────────────────────────────────────────────────────────────────────────
 * The parent runs the game; this is their payoff. A Sunday-evening summary of
 * what the app did FOR them: chores the kids handled, an honest estimate of the
 * time that saved, who improved, and who could use a cheer. Opened from the
 * weekly notification (lib/notifications ensureReminders) or Insights.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { firestore } from '@/lib/fb';
import { Col, getFamilyMembers } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { useTheme } from '@/lib/theme';
import { getCurrentWeekRange, getWeekLabel } from '@/lib/pointsEngine';
import { buildParentReport, formatMinutes, buildGameHealth, formatWait, STILL_ACTIVE_DAYS, type ParentReport, type ReportTx, type GameHealth } from '@/lib/familyGame';
import { useMemberLevels } from '@/lib/memberLevels';
import { useSeason } from '@/components/ui/Season';
import { SEASON_WEEKS } from '@/lib/seasons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Avatar } from '@/components/ui';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FamilyGoalCard } from '@/components/ui/FamilyGoal';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow, Gradients } from '@/constants/theme';

export default function ParentReportScreen() {
  const { family } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [report, setReport] = useState<ParentReport | null>(null);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weekLabel, setWeekLabel] = useState('');
  // F3: game health — this week's completions + the app-wide ledger + season.
  const [weekCompletions, setWeekCompletions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const ledger = useMemberLevels((s) => s.txns);
  const { season, rows: seasonRows } = useSeason();

  useEffect(() => {
    (async () => {
      if (!family?.id) return;
      try {
        const { start } = getCurrentWeekRange(family.weekStartDay ?? 1);
        const lastStart = new Date(start); lastStart.setDate(lastStart.getDate() - 7);
        setWeekLabel(getWeekLabel(start));
        const [txSnap, members, pendingSnap, weekCompSnap] = await Promise.all([
          // Single-field range query — no composite index needed.
          Col.transactions(family.id).where('createdAt', '>=', firestore.Timestamp.fromDate(lastStart)).get(),
          getFamilyMembers(family.id),
          Col.completions(family.id).where('status', '==', 'pending').get(),
          Col.completions(family.id).where('completedAt', '>=', firestore.Timestamp.fromDate(start)).get(),
        ]);
        setMembers(members as any[]);
        setWeekCompletions(weekCompSnap.docs.map((d) => {
          const c: any = d.data();
          return {
            memberId: c.memberId, status: c.status, wasAutoFailed: c.wasAutoFailed, approvedBy: c.approvedBy ?? null,
            completedAt: c.completedAt?.toDate?.() ?? null, approvedAt: c.approvedAt?.toDate?.() ?? null,
          };
        }));
        const thisWeek: ReportTx[] = [], lastWeek: ReportTx[] = [];
        for (const d of txSnap.docs) {
          const x = d.data();
          const date = x.createdAt?.toDate?.() ?? null;
          if (!date) continue;
          const tx = { memberId: x.memberId, delta: x.delta || 0, source: x.source, date };
          (date >= start ? thisWeek : lastWeek).push(tx);
        }
        setReport(buildParentReport(thisWeek, lastWeek, members as any));
        setPending(pendingSnap.size);
      } catch (e) {
        if (__DEV__) console.error('[ParentReport] load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [family?.id, family?.weekStartDay]);

  const choreDelta = report ? report.chores - report.lastWeekChores : 0;

  const health: GameHealth | null = useMemo(() => {
    if (!members.length) return null;
    const lastActiveByMember: Record<string, Date | null> = {};
    for (const t of ledger) {
      if (t.source !== 'task' || t.delta <= 0 || !t.date) continue;
      const prev = lastActiveByMember[t.memberId];
      if (!prev || t.date > prev) lastActiveByMember[t.memberId] = t.date;
    }
    return buildGameHealth({ completions: weekCompletions, members, seasonRows, lastActiveByMember });
  }, [members, weekCompletions, ledger, seasonRows]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Your family’s week" subtitle={weekLabel} />
      {loading || !report ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Text style={styles.heroEyebrow}>THIS WEEK, YOUR KIDS HANDLED</Text>
            <Text style={styles.heroBig}>{report.chores} chores</Text>
            <Text style={styles.heroLine}>
              ≈ {formatMinutes(report.minutesSaved)} of chores you didn’t have to do
            </Text>
            {report.lastWeekChores > 0 && (
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {choreDelta >= 0 ? `▲ ${choreDelta} more` : `▼ ${-choreDelta} fewer`} than last week
                </Text>
              </View>
            )}
          </LinearGradient>

          <View style={styles.tiles}>
            <Tile emoji="📅" value={`${report.activeDays}/7`} label="active days" styles={styles} />
            <Tile emoji="⭐" value={`${report.familyPoints}`} label="family points" styles={styles} />
            <Tile emoji="⏳" value={`${pending}`} label="waiting for you" styles={styles} onPress={pending > 0 ? () => router.push('/app/approvals' as any) : undefined} />
          </View>

          <FamilyGoalCard />

          {/* F3: is the game actually working for this family? */}
          {health && (
            <>
              <Text style={styles.section}>Is the game working?</Text>
              <View style={styles.tiles}>
                <Tile emoji="📅" value={`${health.parentActiveDays}/7`} label="days a parent checked in" styles={styles} />
                <Tile emoji="🙌" value={health.kidClaimedPct == null ? '—' : `${health.kidClaimedPct}%`} label="chores kids claimed themselves" styles={styles} />
                <Tile emoji="⏳" value={health.medianApprovalMins == null ? '—' : formatWait(health.medianApprovalMins)} label="typical wait for your OK" styles={styles} />
              </View>
              {health.lastPlace && (
                <View style={[styles.note, health.lastPlace.stillActive
                  ? { borderColor: colors.success + '55', backgroundColor: colors.success + '10' }
                  : { borderColor: colors.warning + '55', backgroundColor: colors.warning + '10' }]}>
                  <EmojiIcon emoji={health.lastPlace.stillActive ? '💪' : '💛'} size={30} />
                  <Text style={styles.noteText}>
                    <Text style={styles.noteStrong}>Season {season.number}, week {season.week} of {SEASON_WEEKS}: </Text>
                    {health.lastPlace.stillActive
                      ? `${health.lastPlace.name} is in last place this season but still playing — that's the game working.`
                      : health.lastPlace.daysSinceActive == null
                        ? `${health.lastPlace.name} is in last place and hasn't done a chore yet this season. An easy win could get them back in.`
                        : `${health.lastPlace.name} is in last place and hasn't done a chore in ${health.lastPlace.daysSinceActive} days (more than ${STILL_ACTIVE_DAYS}). An easy win could get them back in.`}
                  </Text>
                </View>
              )}
            </>
          )}

          <Text style={styles.section}>How each kid did</Text>
          {report.kids.length === 0 ? (
            <Text style={styles.muted}>Add a child profile to see their week here.</Text>
          ) : report.kids.map((k) => (
            <TouchableOpacity key={k.memberId} style={styles.kidRow} onPress={() => router.push(`/app/member/${k.memberId}` as any)} activeOpacity={0.8}>
              <Avatar emoji={k.avatarEmoji} photoURL={k.photoURL} size={44} memberId={k.memberId} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kidName}>{k.name}</Text>
                <Text style={styles.kidMeta}>{k.chores} chores · {k.points} pts</Text>
              </View>
              <Text style={[styles.kidChange, { color: k.changePct == null ? colors.textMuted : k.changePct >= 0 ? colors.success : colors.danger }]}>
                {k.changePct == null ? 'new' : `${k.changePct >= 0 ? '▲' : '▼'} ${Math.abs(k.changePct)}%`}
              </Text>
            </TouchableOpacity>
          ))}

          {(report.mostImproved || report.needsCheer) && <Text style={styles.section}>Worth a moment</Text>}
          {report.mostImproved && (
            <View style={[styles.note, { borderColor: colors.success + '55', backgroundColor: colors.success + '10' }]}>
              <EmojiIcon emoji="🌟" size={30} />
              <Text style={styles.noteText}>
                <Text style={styles.noteStrong}>{report.mostImproved.name} improved the most</Text> — up from {report.mostImproved.lastWeekPoints} to {report.mostImproved.points} pts. Tell them you noticed.
              </Text>
            </View>
          )}
          {report.needsCheer && report.needsCheer.memberId !== report.mostImproved?.memberId && (
            <View style={[styles.note, { borderColor: colors.warning + '55', backgroundColor: colors.warning + '10' }]}>
              <EmojiIcon emoji="💛" size={30} />
              <Text style={styles.noteText}>
                <Text style={styles.noteStrong}>Cheer on {report.needsCheer.name}</Text> — a quick “proud of you” or an easy win tomorrow goes a long way.
              </Text>
            </View>
          )}

          <Text style={styles.footnote}>Time saved is an estimate from each chore’s difficulty (easy ≈ 10 min, medium ≈ 20, hard ≈ 35).</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Tile({ emoji, value, label, styles, onPress }: { emoji: string; value: string; label: string; styles: any; onPress?: () => void }) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.tile} onPress={onPress} activeOpacity={0.8}>
      <EmojiIcon emoji={emoji} size={26} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Wrapper>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 60, gap: Spacing.md },
    hero: { borderRadius: 24, padding: Spacing.lg },
    heroEyebrow: { fontSize: 11, fontFamily: FontFamily.extraBold, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
    heroBig: { fontSize: 40, fontFamily: FontFamily.black ?? FontFamily.extraBold, color: '#FFFFFF', marginTop: 4 },
    heroLine: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFFFFF', marginTop: 2 },
    heroChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 5, marginTop: Spacing.md },
    heroChipText: { fontSize: FontSize.xs, fontFamily: FontFamily.extraBold, color: '#FFFFFF' },
    tiles: { flexDirection: 'row', gap: Spacing.sm },
    tile: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', gap: 2, ...Shadow.sm },
    tileValue: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: 4 },
    tileLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, textAlign: 'center' },
    section: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: Spacing.sm },
    muted: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textMuted },
    kidRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
    kidName: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    kidMeta: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 2 },
    kidChange: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold },
    note: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, borderRadius: BorderRadius.lg, padding: Spacing.md },
    noteText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.text, lineHeight: 19 },
    noteStrong: { fontFamily: FontFamily.extraBold },
    footnote: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textMuted, textAlign: 'center', marginTop: Spacing.md },
  });
}
