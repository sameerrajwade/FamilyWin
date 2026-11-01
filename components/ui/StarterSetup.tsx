/**
 * components/ui/StarterSetup.tsx — easy family setup (Phase G6)
 * ─────────────────────────────────────────────────────────────────────────────
 * The last onboarding screens for a family that was just created:
 *   1. "Your game is ready" — the starter kit from the kids' ages (lib/starterKit):
 *      age-right tasks per kid, two shared tasks, four rewards. Untick anything,
 *      add your own, then start — or skip and set up by hand.
 *   2. "There's more when you're ready" — the advanced features with "Skip for
 *      now": each comes back as a card on Today from week 2, unless the parent
 *      marks it "Not for us".
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { useAuthStore } from '@/store';
import { applyStarterKit, setDiscoverState } from '@/lib/firebase';
import { detectTaskEmoji } from '@/lib/taskEmoji';
import {
  buildStarterKit, customStarterTasks, initialDiscoverState, DISCOVER_ITEMS, STARTER_AUTO_APPROVE,
  type StarterKid, type StarterTask, type DiscoverKey,
} from '@/lib/starterKit';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

const RECUR: Record<string, string> = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', once: 'once' };

export function StarterSetup({ familyId, createdBy, kids, onDone }: {
  familyId: string; createdBy: string; kids: StarterKid[]; onDone: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { family, setFamily } = useAuthStore();
  const kit = useMemo(() => buildStarterKit(kids), [kids]);
  const [stage, setStage] = useState<'kit' | 'discover'>('kit');
  const [tasks, setTasks] = useState<StarterTask[]>(kit.tasks);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [customTitle, setCustomTitle] = useState('');
  const [forEachKid, setForEachKid] = useState(kids.length > 0);
  const [notForUs, setNotForUs] = useState<Set<DiscoverKey>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) => {
    setOff((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    Haptics.selectionAsync().catch(() => {});
  };

  function addCustom() {
    const added = customStarterTasks(customTitle, forEachKid, kids).filter((t) => !tasks.some((x) => x.key === t.key));
    if (added.length === 0) return;
    setTasks((prev) => [...prev, ...added]);
    setCustomTitle('');
    Haptics.selectionAsync().catch(() => {});
  }

  async function startWithKit() {
    setBusy(true);
    try {
      await applyStarterKit({
        familyId, createdBy,
        tasks: tasks.filter((t) => !off.has(t.key)).map((t) => ({
          title: t.title, category: t.category, difficulty: t.difficulty, recurrence: t.recurrence,
          pointValue: t.pointValue, assignedTo: t.assignedTo, taskEmoji: detectTaskEmoji(t.title, t.category),
        })),
        rewards: kit.rewards.filter((r) => !off.has(r.key)).map(({ title, pointCost, icon }) => ({ title, pointCost, icon })),
        autoApproveUnder: STARTER_AUTO_APPROVE,
      });
      if (family) setFamily({ ...family, autoApproveUnder: STARTER_AUTO_APPROVE });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setStage('discover');
    } catch {
      Alert.alert('Could not set up', 'Please try again — or skip and add tasks yourself.');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    const state = initialDiscoverState(new Date(), Array.from(notForUs));
    try {
      await setDiscoverState(familyId, state);
      if (family) setFamily({ ...family, discover: state } as any);
    } catch { /* the reminders are a nicety — never block entering the app */ }
    setBusy(false);
    onDone();
  }

  if (stage === 'discover') {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <EmojiIcon emoji="✨" size={56} />
        <Text style={styles.title}>There's more when you're ready</Text>
        <Text style={styles.sub}>Keep it simple this week. We'll bring these back from week 2 — or set them up anytime in Family → Game rules.</Text>
        {DISCOVER_ITEMS.map((it) => {
          const no = notForUs.has(it.key);
          return (
            <View key={it.key} style={[styles.discoverRow, no && { opacity: 0.55 }]}>
              <EmojiIcon emoji={it.emoji} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{it.title}</Text>
                <Text style={styles.rowSub}>{it.blurb}</Text>
              </View>
              <TouchableOpacity
                style={[styles.chip, !no && styles.chipOn]}
                onPress={() => setNotForUs((prev) => { const n = new Set(prev); n.has(it.key) ? n.delete(it.key) : n.add(it.key); return n; })}
                accessibilityRole="button"
                accessibilityLabel={no ? `${it.title}: not for us. Tap to be reminded` : `${it.title}: remind me later. Tap if not for us`}
              >
                <Text style={[styles.chipText, !no && styles.chipTextOn]}>{no ? 'Not for us' : 'Remind me'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <TouchableOpacity style={styles.primary} onPress={finish} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Skip for now — start playing 🏆</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const groups = Array.from(new Set(tasks.map((t) => t.forLabel)));
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <EmojiIcon emoji="🚀" size={56} />
      <Text style={styles.title}>Your game is ready</Text>
      <Text style={styles.sub}>
        {kids.length ? 'We picked tasks to suit each kid\'s age. Untick anything you don\'t want, or add your own.' : 'Here\'s a starter set for the whole family. Untick anything you don\'t want, or add your own.'}
      </Text>

      {groups.map((label) => (
        <View key={label} style={styles.group}>
          <Text style={styles.groupTitle}>{label === 'Everyone' ? 'Everyone' : `For ${label}`}</Text>
          {tasks.filter((t) => t.forLabel === label).map((t) => (
            <CheckRow key={t.key} on={!off.has(t.key)} onPress={() => toggle(t.key)} emoji={detectTaskEmoji(t.title, t.category)}
              title={t.title} meta={`+${t.pointValue} · ${RECUR[t.recurrence] ?? t.recurrence}`} styles={styles} />
          ))}
        </View>
      ))}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Add your own</Text>
        <View style={styles.customRow}>
          <TextInput
            value={customTitle}
            onChangeText={setCustomTitle}
            onSubmitEditing={addCustom}
            placeholder="e.g. Water the plants"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            maxLength={60}
            accessibilityLabel="Your own task"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addCustom} accessibilityRole="button" accessibilityLabel="Add task">
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        </View>
        {kids.length > 0 && (
          <View style={styles.forRow}>
            {[true, false].map((each) => (
              <TouchableOpacity key={String(each)} style={[styles.chip, forEachKid === each && styles.chipOn]} onPress={() => setForEachKid(each)} accessibilityRole="radio" accessibilityState={{ selected: forEachKid === each }}>
                <Text style={[styles.chipText, forEachKid === each && styles.chipTextOn]}>{each ? 'Each kid' : 'Everyone'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Rewards to save for</Text>
        {kit.rewards.map((r) => (
          <CheckRow key={r.key} on={!off.has(r.key)} onPress={() => toggle(r.key)} emoji={r.icon} title={r.title} meta={`${r.pointCost} pts`} styles={styles} />
        ))}
      </View>

      <Text style={styles.note}>Small tasks (up to {STARTER_AUTO_APPROVE} pts) are approved automatically, so you're not tapping all day. Change it anytime in Game rules.</Text>

      <TouchableOpacity style={styles.primary} onPress={startWithKit} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Start with this setup</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => setStage('discover')} disabled={busy} accessibilityRole="button">
        <Text style={styles.secondaryText}>Skip — I'll set it up myself</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function CheckRow({ on, onPress, emoji, title, meta, styles }: {
  on: boolean; onPress: () => void; emoji: string; title: string; meta: string; styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity style={[styles.row, !on && { opacity: 0.45 }]} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={title}>
      <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
      <EmojiIcon emoji={emoji} size={26} />
      <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.rowMeta}>{meta}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl, alignItems: 'stretch', gap: Spacing.sm },
    title: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center', marginTop: Spacing.sm },
    sub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 19 },
    group: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.border, padding: Spacing.md, gap: 2 },
    groupTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold, color: colors.textAccent, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    tick: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: 13 },
    rowTitle: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.text },
    rowMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
    rowSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 1 },
    customRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    input: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 10, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.text },
    addBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10 },
    addText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.sm },
    forRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    chip: { borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: Spacing.md, paddingVertical: 6 },
    chipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    chipText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, color: colors.textSecondary },
    chipTextOn: { color: colors.textAccent },
    discoverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.border, padding: Spacing.md },
    note: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 17 },
    primary: { backgroundColor: colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.md },
    primaryText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
    secondary: { alignItems: 'center', paddingVertical: Spacing.md },
    secondaryText: { color: colors.textSecondary, fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  });
}
