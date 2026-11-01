/**
 * components/ui/LevelPerks.tsx — level unlocks UI (Phase E3)
 * ─────────────────────────────────────────────────────────────────────────────
 *   <LevelPerksEditor>  Game rules: a parent writes a real-world perk per level
 *                       ("Lv 4 · Star → Pick the Friday movie"). Saved when they
 *                       finish typing a row.
 *   <LevelLadder>       Profile: every level with its frame, title and perk,
 *                       unlocked ✓ or how many points to go.
 *   <LevelUpReveal>     Today + Kid Mode: plays once per device when this
 *                       person's level goes up, showing what they unlocked.
 * Rules (frames, perks, ladder) live in lib/levelUnlocks.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { Sounds } from '@/lib/sounds';
import { getLevel } from '@/lib/pointsEngine';
import { levelLadder, unlocksBetween, cleanPerks, type LevelPerks, type LevelStep } from '@/lib/levelUnlocks';
import { useMemberLevels } from '@/lib/memberLevels';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { Avatar } from '@/components/ui';
import { Confetti } from '@/components/ui/Animations';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

// ─── Game rules editor ───────────────────────────────────────────────────────

export function LevelPerksEditor({ perks, onSave }: { perks: LevelPerks; onSave: (next: Record<string, string>) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ladder = levelLadder(1, perks);
  const [draft, setDraft] = useState<Record<string, string>>({ ...(perks ?? {}) });

  useEffect(() => { setDraft({ ...(perks ?? {}) }); }, [JSON.stringify(perks ?? {})]);

  function commit() {
    const next = cleanPerks(draft);
    if (JSON.stringify(next) !== JSON.stringify(cleanPerks({ ...(perks ?? {}) }))) onSave(next);
  }

  return (
    <View>
      {ladder.map((s) => (
        <View key={s.level} style={styles.editRow}>
          <EmojiIcon emoji={s.emoji} size={26} />
          <View style={{ flex: 1 }}>
            <Text style={styles.editTitle}>Lv {s.level} · {s.title} <Text style={styles.editPts}>{s.floor} pts</Text></Text>
            <TextInput
              value={draft[String(s.level)] ?? ''}
              onChangeText={(t) => setDraft((d) => ({ ...d, [String(s.level)]: t }))}
              onEndEditing={commit}
              placeholder={s.level === 3 ? 'e.g. Pick the Friday movie' : s.level === 5 ? 'e.g. Stay up 30 min late' : 'Optional perk'}
              placeholderTextColor={colors.textMuted}
              style={styles.editInput}
              maxLength={60}
              accessibilityLabel={`Perk for level ${s.level} ${s.title}`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Profile ladder ──────────────────────────────────────────────────────────

export function LevelLadder({ earned, perks }: { earned: number; perks: LevelPerks }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const lv = getLevel(earned);
  const ladder = levelLadder(lv.level, perks);
  return (
    <View style={styles.ladder}>
      <Text style={styles.ladderTitle}>Level unlocks</Text>
      {ladder.map((s) => (
        <View key={s.level} style={[styles.ladderRow, !s.unlocked && { opacity: 0.55 }]}>
          <EmojiIcon emoji={s.emoji} size={24} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ladderName}>Lv {s.level} · {s.title}</Text>
            <Text style={styles.ladderSub} numberOfLines={2}>
              {[s.frame?.name, s.perk ? `🎁 ${s.perk}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={[styles.ladderState, { color: s.unlocked ? colors.success : colors.textSecondary }]}>
            {s.unlocked ? '✓' : `${Math.max(0, s.floor - earned)} to go`}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Level-up reveal ─────────────────────────────────────────────────────────

/**
 * Watches one member's level (from the app-wide store). The first time it sees
 * them on a device it just remembers the level; after that, a higher level
 * plays the reveal once (AsyncStorage `level_seen_<memberId>`).
 */
export function LevelUpReveal({ member, perks }: {
  member?: { id: string; displayName?: string; avatarEmoji?: string; photoURL?: string } | null;
  perks: LevelPerks;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loaded = useMemberLevels((s) => s.loaded);
  const earned = useMemberLevels((s) => (member ? s.earned[member.id] ?? 0 : 0));
  const level = getLevel(earned).level;
  const [reveal, setReveal] = useState<{ to: number; steps: LevelStep[] } | null>(null);

  useEffect(() => {
    if (!loaded || !member?.id) return;
    const key = `level_seen_${member.id}`;
    let cancelled = false;
    AsyncStorage.getItem(key).then((raw) => {
      if (cancelled) return;
      const seen = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(seen)) { AsyncStorage.setItem(key, String(level)).catch(() => {}); return; }
      if (level > seen) {
        AsyncStorage.setItem(key, String(level)).catch(() => {});
        setReveal({ to: level, steps: unlocksBetween(seen, level, perks) });
        Sounds.allDone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (level < seen) {
        // Penalties can dip a level; remember the lower one so climbing back
        // past it celebrates again only for genuinely new ground.
        AsyncStorage.setItem(key, String(Math.max(level, 1))).catch(() => {});
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loaded, member?.id, level]);

  if (!reveal || !member) return null;
  const top = reveal.steps[reveal.steps.length - 1];
  const first = (member.displayName ?? '').split(' ')[0];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setReveal(null)}>
      <View style={styles.overlay}>
        <Confetti visible count={110} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LEVEL UP!</Text>
          <Avatar emoji={member.avatarEmoji} photoURL={member.photoURL} size={96} memberId={member.id} />
          <Text style={styles.title}>{first ? `${first} is now` : 'You are now'} Lv {reveal.to}</Text>
          {top && <Text style={styles.subtitle}>{top.emoji} {top.title}</Text>}
          <View style={styles.unlockList}>
            {reveal.steps.map((s) => (
              <View key={s.level} style={styles.unlockRow}>
                {s.frame && <Text style={styles.unlockText}>✨ {s.frame.name}</Text>}
                {s.perk ? <Text style={[styles.unlockText, styles.unlockPerk]}>🎁 {s.perk}</Text> : null}
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => setReveal(null)} accessibilityRole="button">
            <Text style={styles.btnText}>Awesome!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    editRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    editTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
    editPts: { fontFamily: FontFamily.regular, color: colors.textMuted, fontSize: FontSize.xs },
    editInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, marginTop: 4, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.text },
    ladder: { alignSelf: 'stretch', marginHorizontal: Spacing.xl, marginTop: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.border, padding: Spacing.md },
    ladderTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text, marginBottom: Spacing.sm },
    ladderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
    ladderName: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
    ladderSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 1 },
    ladderState: { fontSize: FontSize.xs, fontFamily: FontFamily.extraBold },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 28, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
    eyebrow: { fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 1.2, color: colors.textAccent },
    title: { fontSize: 26, fontFamily: FontFamily.black ?? FontFamily.extraBold, color: colors.text, textAlign: 'center', marginTop: Spacing.sm },
    subtitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: colors.textSecondary },
    unlockList: { alignSelf: 'stretch', gap: 4, marginTop: Spacing.sm },
    unlockRow: { gap: 2 },
    unlockText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.text, textAlign: 'center' },
    unlockPerk: { color: colors.textAccent, fontFamily: FontFamily.extraBold },
    btn: { backgroundColor: colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.xl, paddingVertical: 12, marginTop: Spacing.md },
    btnText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
  });
}

