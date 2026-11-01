/**
 * app/app/tabs/family.tsx — the Family tab: PEOPLE + THE GAME in one place
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the old Insights tab. Everything a parent needs to run the family
 * game lives here (Settings is now just "you + the app"):
 *   • To-dos: claims waiting for approval, the weekly report, Kid Mode
 *   • Members → each person's profile (history + 6-week trend live there)
 *   • Set up the game: editable Tasks · Rewards · Penalties & bonuses
 *   • Game rules: who competes, penalties, pause, allowance, weekly reset
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Col } from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme } from '@/lib/theme';
import { useKidMode } from '@/lib/kidMode';
import { isKid, competitors } from '@/lib/familyGame';
import { getLevel } from '@/lib/pointsEngine';
import { useMemberLevels } from '@/lib/memberLevels';
import { BrandBar } from '@/components/ui/Brand';
import { Avatar } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FamilyGoalCard, useFamilyWeekTotals } from '@/components/ui/FamilyGoal';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

export default function FamilyTab() {
  const { member, family } = useAuthStore();
  const { members } = useFamilyStore();
  // E3: lifetime level per member (title under each name).
  const earnedMap = useMemberLevels((s) => s.earned);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { thisWeek } = useFamilyWeekTotals(family?.id, family?.weekStartDay ?? 1);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!family?.id || !isParent) return;
    return Col.completions(family.id).where('status', '==', 'pending')
      .onSnapshot((snap) => setPending(snap.size), () => {});
  }, [family?.id, isParent]);

  const kids = (members as any[]).filter(isKid);
  const players = new Set(competitors(members as any[], family?.competitionMode).map((m: any) => m.id));
  // Kids first, then parents; within each, most points this week first.
  const people = [...(members as any[])].sort((a, b) =>
    (Number(isKid(b)) - Number(isKid(a))) || ((thisWeek[b.id] ?? 0) - (thisWeek[a.id] ?? 0)));

  function openKidMode() {
    if (kids.length === 0) return;
    useKidMode.getState().enter(kids[0].id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push('/app/kid-mode' as any);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BrandBar />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{family?.name ?? 'Family'}</Text>
          <Text style={styles.subtitle}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>
        </View>

        {isParent && (
          <View style={styles.group}>
            <Row icon="checkmark-done-circle-outline" label={pending > 0 ? `${pending} ${pending === 1 ? 'claim' : 'claims'} waiting for your OK` : 'Approvals'}
              sub={pending > 0 ? 'Approve them all in one tap' : 'Nothing waiting right now'}
              badge={pending > 0 ? String(pending) : undefined}
              onPress={() => router.push('/app/approvals' as any)} styles={styles} colors={colors} />
            <Row icon="stats-chart-outline" label="This week’s report" sub="Chores handled, time saved, who to cheer on"
              onPress={() => router.push('/app/report' as any)} styles={styles} colors={colors} />
            <Row icon="trophy-outline" label="Family league" sub={family?.leagueIds?.length ? 'Your family vs other families this season' : 'Challenge cousins or friends — family vs family'}
              onPress={() => router.push('/app/league' as any)} styles={styles} colors={colors} />
            {kids.length > 0 && (
              <Row icon="phone-portrait-outline" label="Kid Mode" sub="Hand the phone over; kids claim their own tasks"
                onPress={openKidMode} styles={styles} colors={colors} last />
            )}
          </View>
        )}

        <FamilyGoalCard />

        <Text style={styles.section}>Members</Text>
        <View style={styles.group}>
          {people.map((m: any, i: number) => (
            <TouchableOpacity key={m.id} style={[styles.member, i < people.length - 1 && styles.divider]}
              onPress={() => router.push(`/app/member/${m.id}` as any)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`Open ${m.displayName}'s profile`}>
              <Avatar emoji={m.avatarEmoji} photoURL={m.photoURL} size={42} memberId={m.id} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.displayName}{m.id === member?.id ? ' (you)' : ''}</Text>
                <Text style={styles.memberMeta}>
                  {isKid(m) ? 'Player' : players.has(m.id) ? 'Parent · competing' : 'Coach'}
                  {` · Lv ${getLevel(earnedMap[m.id] ?? 0).level} ${getLevel(earnedMap[m.id] ?? 0).title}`}
                </Text>
              </View>
              <Text style={styles.memberPts}>{thisWeek[m.id] ?? 0}<Text style={styles.memberPtsUnit}> pts</Text></Text>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
        {isParent && (
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/app/family' as any)} accessibilityRole="button">
            <Icon name="person-add-outline" size={18} color={colors.textAccent} />
            <Text style={styles.link}>Add a child, invite a parent, roles</Text>
          </TouchableOpacity>
        )}

        {isParent && (
          <>
            <Text style={styles.section}>Set up the game</Text>
            <View style={styles.tiles}>
              <Tile emoji="✅" label="Tasks" onPress={() => router.push('/app/manage/tasks' as any)} styles={styles} />
              <Tile emoji="🎁" label="Rewards" onPress={() => router.push('/app/manage/rewards' as any)} styles={styles} />
              <Tile emoji="⚖️" label="Penalties & bonuses" onPress={() => router.push('/app/manage/penalties' as any)} styles={styles} fallback="⭐" />
            </View>
            <View style={styles.group}>
              <Row icon="options-outline" label="Game rules" sub="Who competes, penalties, pause, allowance, week start"
                onPress={() => router.push('/app/settings/parental' as any)} styles={styles} colors={colors} />
              <Row icon="time-outline" label="Points history" sub="Every point earned and spent, 6-week trend"
                onPress={() => router.push('/app/tabs/history' as any)} styles={styles} colors={colors} last />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, sub, onPress, badge, last, styles, colors }: {
  icon: IconName; label: string; sub?: string; onPress: () => void; badge?: string; last?: boolean; styles: any; colors: any;
}) {
  return (
    <TouchableOpacity style={[styles.row, !last && styles.divider]} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.rowIcon}><Icon name={icon} size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function Tile({ emoji, label, onPress, styles, fallback }: { emoji: string; label: string; onPress: () => void; styles: any; fallback?: string }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Edit ${label}`}>
      <EmojiIcon emoji={fallback ?? emoji} size={30} />
      <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.tileSub}>View & edit</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 48, gap: Spacing.md },
    header: { paddingTop: Spacing.sm },
    title: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: colors.text },
    subtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 2 },
    section: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: Spacing.sm, marginBottom: -Spacing.xs },
    group: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, ...Shadow.sm, overflow: 'hidden' },
    divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
    rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '14' },
    rowLabel: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    rowSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 },
    badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
    badgeText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.xs },
    member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
    memberName: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
    memberMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 2 },
    memberPts: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, color: colors.textAccent },
    memberPtsUnit: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: colors.textSecondary },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginTop: -Spacing.xs },
    link: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent },
    tiles: { flexDirection: 'row', gap: Spacing.sm },
    tile: { flex: 1, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4, ...Shadow.sm },
    tileLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.text, marginTop: 4 },
    tileSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
  });
}
