/**
 * app/app/league.tsx — Family league (Phase G7: family vs family)
 * ─────────────────────────────────────────────────────────────────────────────
 * Not in a league: a parent starts one (and shares the code) or joins with a
 * code from another family. In a league: this season's table (average points
 * per player, so family size doesn't decide it), last season's winner in a new
 * season's first week, the invite code to share, and Leave.
 * Other families only ever see your family's name and score. Up to 6 families.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { createLeague, joinLeague, leaveLeague, LEAGUE_MAX_FAMILIES } from '@/lib/leagues';
import { SEASON_WEEKS } from '@/lib/seasons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { LeagueTable, useFamilyLeague } from '@/components/ui/League';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

function errMessage(e: any): string {
  const m = String(e?.message ?? '');
  // RN Firebase prefixes "[functions/<code>] " — show just the friendly part.
  return m.replace(/^\[[^\]]+\]\s*/, '') || 'Something went wrong — please try again.';
}

export default function LeagueScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family, member, setFamily } = useAuthStore();
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { leagueId, league, rows, season, lastChampions, loading, myFamilyId } = useFamilyLeague();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | 'leave' | null>(null);

  function rememberLeague(id: string | null) {
    if (!family) return;
    setFamily({ ...family, leagueIds: id ? [id] : [] } as any);
  }

  async function onCreate() {
    setBusy('create');
    try {
      const r = await createLeague(name.trim() || `${family?.name ?? 'Our'} League`);
      rememberLeague(r.leagueId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not start the league', errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onJoin() {
    setBusy('join');
    try {
      const r = await joinLeague(code.trim().toUpperCase());
      rememberLeague(r.leagueId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not join', errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function onLeave() {
    if (!leagueId) return;
    Alert.alert('Leave the league?', 'Your family\'s score is removed from the table. You can join again later with the code.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          setBusy('leave');
          try { await leaveLeague(leagueId); rememberLeague(null); }
          catch (e) { Alert.alert('Could not leave', errMessage(e)); }
          finally { setBusy(null); }
        },
      },
    ]);
  }

  function onShare() {
    if (!league) return;
    Share.share({
      message: `Join our family league "${league.name}" on Chore League! 🏆\n\nIt's family vs family over a 4-week season — open Family → Family league and enter code: ${league.inviteCode}`,
    }).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Family league" subtitle={league ? `Season ${season.number} · week ${season.week} of ${SEASON_WEEKS}` : 'Family vs family'} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : league ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.leagueName}>{league.name}</Text>
            <Text style={styles.muted}>{league.familyIds.length} of {LEAGUE_MAX_FAMILIES} families · ranked by average points per player</Text>
            {lastChampions.length > 0 && (
              <Text style={styles.champ}>🥇 Season {season.number - 1} winner: {lastChampions.map((c) => c.familyName).join(' & ')}</Text>
            )}
            <View style={{ marginTop: Spacing.sm }}>
              <LeagueTable rows={rows} myFamilyId={myFamilyId} />
            </View>
            {rows.length < 2 && <Text style={styles.muted}>Share the code below — the race starts when another family joins.</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>League code</Text>
            <Text style={styles.code} selectable>{league.inviteCode}</Text>
            <Text style={styles.muted}>Other families see only your family name and score — never kids' names or tasks.</Text>
            {isParent && league.familyIds.length < LEAGUE_MAX_FAMILIES && (
              <TouchableOpacity style={styles.primary} onPress={onShare} accessibilityRole="button">
                <Text style={styles.primaryText}>📤 Invite a family</Text>
              </TouchableOpacity>
            )}
          </View>

          {isParent && (
            <TouchableOpacity style={styles.leave} onPress={onLeave} disabled={!!busy} accessibilityRole="button">
              {busy === 'leave' ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.leaveText}>Leave league</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : !isParent ? (
        <View style={styles.empty}>
          <EmojiIcon emoji="🏆" size={64} />
          <Text style={styles.emptyTitle}>No league yet</Text>
          <Text style={styles.muted}>Ask a parent to start a family league — then your family can race your cousins or friends.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <EmojiIcon emoji="🏆" size={56} />
            <Text style={styles.heroTitle}>Family vs family</Text>
            <Text style={styles.heroSub}>
              Race up to {LEAGUE_MAX_FAMILIES - 1} other families over a 4-week season. It's fair: families are ranked by average points per player, so size doesn't decide it. Others only see your family name and score.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Start a league</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={`e.g. ${family?.name ?? 'Cousins'} Cup`}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={40}
              accessibilityLabel="League name"
            />
            <TouchableOpacity style={styles.primary} onPress={onCreate} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Start a league">
              {busy === 'create' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Start a league</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Got a code from another family?</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="6-character code"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.codeInput]}
              maxLength={6}
              autoCapitalize="characters"
              accessibilityLabel="League code"
            />
            <TouchableOpacity style={[styles.primary, code.length !== 6 && { opacity: 0.45 }]} onPress={onJoin} disabled={!!busy || code.length !== 6} accessibilityRole="button" accessibilityLabel="Join league">
              {busy === 'join' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Join league</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 60, gap: Spacing.md },
    hero: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    heroTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: colors.text },
    heroSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
    card: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.sm, ...Shadow.sm },
    leagueName: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text },
    champ: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent },
    label: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.text },
    muted: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, lineHeight: 17 },
    code: { fontSize: 30, fontFamily: FontFamily.extraBold, color: colors.textAccent, letterSpacing: 6, textAlign: 'center' },
    input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.text },
    codeInput: { letterSpacing: 4, textAlign: 'center', fontFamily: FontFamily.extraBold },
    primary: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
    primaryText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
    leave: { alignItems: 'center', paddingVertical: Spacing.md },
    leaveText: { color: colors.textDanger, fontFamily: FontFamily.bold, fontSize: FontSize.sm },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.xl },
    emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text },
  });
}
