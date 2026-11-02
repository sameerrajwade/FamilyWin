/**
 * components/ui/TwistBanner.tsx — this week's twist + comeback boost
 * (engagement, user-approved 2026-11-01).
 *
 * Quiet by design (user feedback: the always-on banner made Today noisy and
 * never said what "Team week" meant):
 *   • Once per week, the first time Today opens in a new twist week, a pop-up
 *     explains the twist in plain words with an example (TWIST_HOW).
 *   • Today then shows ONE compact line with an ✕. Closing it hides the line
 *     for the rest of that week (per device). Tapping it reopens the pop-up.
 *   • Scores keeps the compact line (no ✕) — that's where team-week totals live.
 * A parent can skip the week's twist from the pop-up.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { getTodayDateString, setEngagementSettings } from '@/lib/firebase';
import { twistForWeek, weekStartKeyOf, comebackActive, teamTotals, rotationTwist, TWIST_HOW } from '@/lib/twists';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

const INTRO_KEY = (week: string) => `twist_intro_${week}`;
const HIDE_KEY = (week: string) => `twist_hide_${week}`;

export function TwistBanner({ memberId, totals, dismissible = false, showIntro = false, hideLine = false, style }: {
  /** Whose comeback boost to show (the profile being viewed). */
  memberId?: string | null;
  /** This week's earned totals — enables the team-week score line. */
  totals?: Record<string, number>;
  /** Today: the line has an ✕ that hides it for the rest of the week. */
  dismissible?: boolean;
  /** Today: pop the explanation once at the start of each twist week. */
  showIntro?: boolean;
  /** Another card holds Today's single promo slot → no line (pop-up still works). */
  hideLine?: boolean;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family, member, setFamily } = useAuthStore();
  const { members } = useFamilyStore();
  const today = getTodayDateString();
  const weekKey = weekStartKeyOf(today, family?.weekStartDay ?? 1);
  const twist = twistForWeek(weekKey, family as any);
  const boosted = !!memberId && comebackActive(family as any, memberId, today);
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  const [hidden, setHidden] = useState<boolean | null>(dismissible ? null : false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    AsyncStorage.getItem(HIDE_KEY(weekKey)).then((v) => setHidden(v === '1')).catch(() => setHidden(false));
  }, [dismissible, weekKey]);

  // Once-a-week explanation pop-up (Today only).
  useEffect(() => {
    if (!showIntro || !twist) return;
    let cancelled = false;
    AsyncStorage.getItem(INTRO_KEY(weekKey)).then((v) => {
      if (cancelled || v === '1') return;
      setOpen(true);
      AsyncStorage.setItem(INTRO_KEY(weekKey), '1').catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showIntro, twist?.id, weekKey]);

  if (!family?.id || (!twist && !boosted)) return null;

  const team = twist?.kind === 'team' ? teamTotals(members as any[], totals ?? {}) : null;
  const nextWeekKey = new Date(Date.parse(weekKey) + 7 * 86_400_000).toISOString().slice(0, 10);
  const next = rotationTwist(nextWeekKey);
  const how = twist ? TWIST_HOW[twist.id] : undefined;

  function hide() {
    setHidden(true);
    AsyncStorage.setItem(HIDE_KEY(weekKey), '1').catch(() => {});
  }

  function skipWeek() {
    setOpen(false);
    setFamily({ ...family!, twistSkip: { ...((family as any).twistSkip ?? {}), [weekKey]: true } } as any);
    setEngagementSettings(family!.id, { skipWeek: weekKey }).catch(() => Alert.alert('That didn’t work', 'Could not skip the twist. Please try again.'));
  }

  const line = twist ? `${twist.title}` : 'Comeback boost';
  const sub = twist
    ? (team && totals ? `Kids ${team.kids} · Grown-ups ${team.grownups}` : 'Tap to see how it works')
    : '+10% on every task this week';

  return (
    <>
      {hidden === false && !hideLine && (
        <View style={[styles.line, style]}>
          <TouchableOpacity style={styles.lineMain} onPress={() => setOpen(true)} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel={`This week's twist: ${line}. Tap to see how it works.`}>
            <EmojiIcon emoji={twist ? twist.emoji : '🚀'} size={26} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={1}>
                {twist ? 'This week: ' : ''}{line}{twist && boosted ? '  ·  🚀 boost' : ''}
              </Text>
              <Text style={styles.lineSub} numberOfLines={1}>{sub}</Text>
            </View>
          </TouchableOpacity>
          {dismissible && (
            <TouchableOpacity onPress={hide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide this week's twist">
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {twist && (
              <>
                <EmojiIcon emoji={twist.emoji} size={64} />
                <Text style={styles.eyebrow}>THIS WEEK’S TWIST</Text>
                <Text style={styles.title}>{twist.title}</Text>
                <Text style={styles.body}>{how?.how ?? twist.blurb}</Text>
                {how?.example ? <Text style={styles.example}>{how.example}</Text> : null}
                {team && (
                  <Text style={styles.team}>
                    Right now: Kids {team.kids} · Grown-ups {team.grownups}
                    {team.kids === team.grownups ? '' : team.kids > team.grownups ? ' — kids lead!' : ' — grown-ups lead!'}
                  </Text>
                )}
              </>
            )}
            {boosted && (
              <Text style={[styles.body, { marginTop: Spacing.sm }]}>
                🚀 <Text style={{ fontFamily: FontFamily.extraBold }}>Comeback boost:</Text> a fresh start, so every task pays +10% this week (up to +5 each).
              </Text>
            )}
            {twist && <Text style={styles.next}>Next week: {next.emoji} {next.title}</Text>}
            <TouchableOpacity style={styles.ok} onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.okText}>Got it</Text>
            </TouchableOpacity>
            {twist && isParent && (
              <TouchableOpacity onPress={skipWeek} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.skip}>Skip this week’s twist</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    lineMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    lineTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.text },
    lineSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
    close: { fontSize: 16, fontFamily: FontFamily.bold, color: colors.textMuted, paddingHorizontal: 4 },
    backdrop: { flex: 1, backgroundColor: 'rgba(10,8,20,0.6)', justifyContent: 'center', padding: Spacing.lg },
    sheet: { backgroundColor: colors.surface, borderRadius: BorderRadius.xl ?? 24, padding: Spacing.lg, alignItems: 'center', gap: 6 },
    eyebrow: { fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 1.2, color: colors.textAccent, marginTop: Spacing.sm },
    title: { fontSize: FontSize.xl, fontFamily: FontFamily.black, color: colors.text, textAlign: 'center' },
    body: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.text, textAlign: 'center', lineHeight: 22 },
    example: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    team: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.textAccent, textAlign: 'center', marginTop: 4 },
    next: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textMuted, marginTop: Spacing.sm },
    ok: { alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.sm },
    okText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
    skip: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textSecondary, marginTop: 6 },
  });
}
