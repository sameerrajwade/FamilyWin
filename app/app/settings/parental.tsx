/**
 * app/app/settings/parental.tsx
 * Sub-screen (parents only): discipline log shortcut, missed-task penalty mode,
 * and the weekly reset day (admin only). Logic lifted from the old inline
 * Settings > Parental Controls / Weekly Reset sections.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, Switch, TextInput } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SettingsScaffold, SettingsGroup, NavRow, SettingsBlock } from '@/components/ui/SettingsUI';
import { firestore } from '@/lib/fb';
import { DEFAULT_ALLOWANCE_RATE } from '@/lib/pointsEngine';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { setMissedTaskPenalty, missedPenaltyMode, missedDeadlineHour, setMissedTaskDeadline, updateFamilyWeekStartDay, setFamilyPenaltyPause, PAUSE_INDEFINITE, setAllowanceSettings, setCompetitionMode, setLevelPerks, setAutoApproveUnder } from '@/lib/firebase';
import { LevelPerksEditor } from '@/components/ui/LevelPerks';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

const DAY_MS = 86_400_000;
/** G5: auto-approve limits offered in Game rules (0 = parent approves everything). */
const AUTO_APPROVE_CHOICES = [0, 10, 25, 50];
function addDays(n: number): Date { return new Date(Date.now() + n * DAY_MS); }

const WEEK_DAYS = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export default function ParentalControlsScreen() {
  const { member, family, setFamily } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [weekStartDay, setWeekStartDay] = useState(family?.weekStartDay ?? 1);
  // Virtual allowance (Phase 5 #3)
  const [allowanceOn, setAllowanceOn] = useState(!!family?.allowanceEnabled);
  const [rate, setRate] = useState(family?.allowancePointsPerUnit ?? DEFAULT_ALLOWANCE_RATE);
  const [customRate, setCustomRate] = useState('');
  const [currency, setCurrency] = useState(family?.allowanceCurrency ?? '$');

  async function saveAllowance(next: { allowanceEnabled?: boolean; allowancePointsPerUnit?: number; allowanceCurrency?: string }) {
    if (!family?.id) return;
    try {
      await setAllowanceSettings(family.id, next);
      setFamily({ ...family, ...next } as any);
      Haptics.selectionAsync();
    } catch { Alert.alert('That didn’t work', 'Could not update allowance settings.'); }
  }

  // Every parent is a co-admin (not just the family creator) — the weekly-reset
  // day is a family-wide setting any parent can change, matching the Firestore
  // rules that allow any parent to update the family doc.
  const isAdmin = member?.role === 'admin_parent' || member?.role === 'parent';

  async function handleSetMissedPenalty(mode: 'off' | 'half' | 'full') {
    if (!family?.id) return;
    const prev = missedPenaltyMode(family);
    if (mode === prev) return;
    await Haptics.selectionAsync();
    setFamily({ ...family, missedTaskPenalty: mode });
    try {
      await setMissedTaskPenalty(family.id, mode);
    } catch {
      setFamily({ ...family, missedTaskPenalty: prev });
      Alert.alert('That didn’t work', 'Could not update the missed-task penalty setting.');
    }
  }

  async function handleSetCompetition(mode: 'everyone' | 'kids') {
    if (!family?.id || (family.competitionMode ?? 'everyone') === mode) return;
    const prev = family.competitionMode;
    Haptics.selectionAsync().catch(() => {});
    setFamily({ ...family, competitionMode: mode });
    try {
      await setCompetitionMode(family.id, mode);
    } catch {
      setFamily({ ...family, competitionMode: prev });
      Alert.alert('That didn’t work', 'Could not update who competes.');
    }
  }

  async function handleSetAutoApprove(points: number) {
    if (!family?.id || (family.autoApproveUnder ?? 0) === points) return;
    const prev = family.autoApproveUnder;
    Haptics.selectionAsync().catch(() => {});
    setFamily({ ...family, autoApproveUnder: points });
    try {
      await setAutoApproveUnder(family.id, points);
    } catch {
      setFamily({ ...family, autoApproveUnder: prev });
      Alert.alert('That didn’t work', 'Could not update approvals.');
    }
  }

  async function handleSavePerks(next: Record<string, string>) {
    if (!family?.id) return;
    const prev = family.levelPerks;
    setFamily({ ...family, levelPerks: next });
    try {
      await setLevelPerks(family.id, next);
    } catch {
      setFamily({ ...family, levelPerks: prev });
      Alert.alert('That didn’t work', 'Could not save the level perks.');
    }
  }

  async function handleSetDeadline(hour: number) {
    if (!family?.id) return;
    const prev = missedDeadlineHour(family);
    if (hour === prev) return;
    await Haptics.selectionAsync();
    setFamily({ ...family, missedTaskDeadlineHour: hour });
    try {
      await setMissedTaskDeadline(family.id, hour);
    } catch {
      setFamily({ ...family, missedTaskDeadlineHour: prev });
      Alert.alert('That didn’t work', 'Could not update the deadline time.');
    }
  }

  async function handleSetFamilyPause(until: Date | null) {
    if (!family?.id) return;
    await Haptics.selectionAsync();
    const prev = family.penaltyPausedUntil ?? null;
    setFamily({ ...family, penaltyPausedUntil: until ? firestore.Timestamp.fromDate(until) : null });
    try {
      await setFamilyPenaltyPause(family.id, until);
    } catch {
      setFamily({ ...family, penaltyPausedUntil: prev });
      Alert.alert('That didn’t work', 'Could not update the pause.');
    }
  }

  async function handleWeekStartDayChange(day: number) {
    if (!family?.id) return;
    setWeekStartDay(day);
    await Haptics.selectionAsync();
    try {
      await updateFamilyWeekStartDay(family.id, day);
      setFamily({ ...family, weekStartDay: day });
    } catch {
      Alert.alert('That didn’t work', 'Could not update weekly reset day.');
      setWeekStartDay(family.weekStartDay ?? 1);
    }
  }

  const familyPausedUntil = family?.penaltyPausedUntil?.toDate?.() ?? null;
  const isFamilyPaused = !!familyPausedUntil && familyPausedUntil.getTime() > Date.now();
  const pauseIndefinite = !!familyPausedUntil && familyPausedUntil.getFullYear() >= 2900;
  const pauseEndLabel = pauseIndefinite
    ? 'until you resume'
    : familyPausedUntil ? `until ${familyPausedUntil.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';

  return (
    <SettingsScaffold title="Game rules">
      {/* Who competes — default everyone (healthy family competition). */}
      <SettingsGroup title="Who competes">
        <SettingsBlock isLast>
          {([
            { mode: 'everyone', label: 'Everyone competes', hint: 'Parents and kids all rank, share the podium and can win crowns.' },
            { mode: 'kids', label: 'Kids only', hint: 'Parents coach — not ranked, but their points still count toward the family goal.' },
          ] as const).map((o) => {
            const active = (family?.competitionMode ?? 'everyone') === o.mode;
            return (
              <TouchableOpacity
                key={o.mode}
                style={[styles.modeOption, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary + '10' }]}
                onPress={() => handleSetCompetition(o.mode)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.radio, { borderColor: active ? colors.primary : colors.border }]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockLabel, { color: colors.text, marginBottom: 2 }]}>{o.label}</Text>
                  <Text style={[styles.blockHint, { color: colors.textSecondary, marginBottom: 0 }]}>{o.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </SettingsBlock>
      </SettingsGroup>

      {/* G5 — approval trust levels: small claims don't need a parent's tap. */}
      <SettingsGroup title="Approvals">
        <SettingsBlock isLast>
          <Text style={[styles.blockLabel, { color: colors.text }]}>Auto-approve small tasks</Text>
          <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
            Kids' claims for tasks worth this much or less are approved straight away. Tasks you mark "needs approval" or "photo proof" always wait for you.
          </Text>
          <View style={styles.dayGrid}>
            {AUTO_APPROVE_CHOICES.map((n) => {
              const active = (family?.autoApproveUnder ?? 0) === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.dayChip, { backgroundColor: colors.background, borderColor: colors.border }, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => handleSetAutoApprove(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={n === 0 ? 'Approve every claim myself' : `Auto-approve tasks up to ${n} points`}
                >
                  <Text style={[styles.dayChipText, { color: active ? '#FFF' : colors.text }]}>{n === 0 ? 'Off' : `Up to ${n} pts`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="Points">
        <NavRow
          icon="alert-circle-outline"
          label="Add a penalty or bonus"
          subtitle="Award bonuses or apply penalties"
          isLast
          onPress={() => router.push('/app/discipline/log')}
        />
      </SettingsGroup>

      <SettingsGroup title="Missed-task penalty">
        <SettingsBlock isLast>
          <Text style={[styles.blockLabel, { color: colors.text }]}>Deduct points for missed tasks</Text>
          <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
            Points come off a daily task if it's not done that day. Mark it done up to 2 days later to win them back.
          </Text>
          <View style={styles.penaltyModeRow}>
            {([
              { mode: 'off' as const, label: 'Off' },
              { mode: 'half' as const, label: 'Half' },
              { mode: 'full' as const, label: 'Full' },
            ]).map((opt) => {
              const active = missedPenaltyMode(family) === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  style={[styles.penaltyModeChip, { borderColor: colors.border },
                    active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => handleSetMissedPenalty(opt.mode)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.penaltyModeText, { color: active ? '#FFF' : colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {missedPenaltyMode(family) !== 'off' && (
            <View style={styles.deadlineWrap}>
              <Text style={[styles.blockLabel, { color: colors.text }]}>Deadline each day</Text>
              <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
                A daily task can be completed until this time. Only after it passes (in each member's local time) does it count as missed.
              </Text>
              <View style={styles.hourRow}>
                {[17, 18, 19, 20, 21, 22, 23].map((h) => {
                  const active = missedDeadlineHour(family) === h;
                  const label = h === 12 ? '12PM' : h > 12 ? `${h - 12}PM` : `${h}AM`;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[styles.hourChip, { borderColor: colors.border },
                        active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => handleSetDeadline(h)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Set daily deadline to ${label}`}
                    >
                      <Text style={[styles.hourChipText, { color: active ? '#FFF' : colors.text }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="Vacation / hold">
        <SettingsBlock isLast>
          <Text style={[styles.blockLabel, { color: colors.text }]}>Pause penalties & reminders</Text>
          <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
            Going away, or someone's unwell? Pause for the whole family so missed tasks don't lose points and the daily reminder stops. You can still complete tasks and earn as normal.
          </Text>
          {isFamilyPaused ? (
            <View style={styles.pausedWrap}>
              <View style={[styles.pausedBadge, { backgroundColor: colors.warning + '1E', borderColor: colors.warning + '66' }]}>
                <Text style={[styles.pausedBadgeText, { color: colors.warning }]}>⏸ Paused {pauseEndLabel}</Text>
              </View>
              <TouchableOpacity
                style={[styles.resumeBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleSetFamilyPause(null)}
                accessibilityRole="button"
                accessibilityLabel="Resume penalties and reminders now"
              >
                <Text style={styles.resumeBtnText}>Resume now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pauseOptRow}>
              {[{ label: '3 days', days: 3 }, { label: '1 week', days: 7 }, { label: '2 weeks', days: 14 }].map((o) => (
                <TouchableOpacity
                  key={o.label}
                  style={[styles.pauseChip, { borderColor: colors.border }]}
                  onPress={() => handleSetFamilyPause(addDays(o.days))}
                  accessibilityRole="button"
                  accessibilityLabel={`Pause for ${o.label}`}
                >
                  <Text style={[styles.pauseChipText, { color: colors.text }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.pauseChip, { borderColor: colors.border }]}
                onPress={() => handleSetFamilyPause(PAUSE_INDEFINITE)}
                accessibilityRole="button"
                accessibilityLabel="Pause until I resume"
              >
                <Text style={[styles.pauseChipText, { color: colors.text }]}>Until I resume</Text>
              </TouchableOpacity>
            </View>
          )}
        </SettingsBlock>
      </SettingsGroup>

      {/* Virtual allowance (Phase 5 #3) */}
      <SettingsGroup title="Allowance">
        <SettingsBlock>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: Spacing.md }}>
              <Text style={[styles.blockLabel, { color: colors.text }]}>💰 Turn points into pocket money</Text>
              <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
                Kids see a cash value and can request a payout you approve. Purely virtual — no real money moves.
              </Text>
            </View>
            <Switch
              value={allowanceOn}
              onValueChange={(v) => { setAllowanceOn(v); saveAllowance({ allowanceEnabled: v }); }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </SettingsBlock>
        {allowanceOn && (
          <SettingsBlock isLast>
            <Text style={[styles.blockLabel, { color: colors.text }]}>Conversion rate</Text>
            <Text style={[styles.blockHint, { color: colors.textSecondary }]}>How many points equal one {currency}1.</Text>
            <View style={styles.dayGrid}>
              {[100, 200, 300, 500].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.dayChip, { backgroundColor: colors.background, borderColor: colors.border }, rate === r && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => { setRate(r); setCustomRate(''); saveAllowance({ allowancePointsPerUnit: r }); }}
                >
                  <Text style={[styles.dayChipText, { color: rate === r ? '#FFF' : colors.text }]}>{r} = {currency}1</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Any other rate — saved when the parent finishes typing. */}
            <View style={styles.customRateRow}>
              <Text style={[styles.blockHint, { color: colors.textSecondary, marginBottom: 0, marginTop: 0 }]}>Custom:</Text>
              <TextInput
                style={[styles.customRateInput, { color: colors.text, borderColor: ![100, 200, 300, 500].includes(rate) ? colors.primary : colors.border }]}
                value={customRate || (![100, 200, 300, 500].includes(rate) ? String(rate) : '')}
                onChangeText={(t) => setCustomRate(t.replace(/[^0-9]/g, ''))}
                onEndEditing={() => {
                  const n = parseInt(customRate, 10);
                  if (n >= 10 && n <= 100000) { setRate(n); saveAllowance({ allowancePointsPerUnit: n }); }
                  else if (customRate) Alert.alert('Pick a rate', 'Use between 10 and 100,000 points per 1.');
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="e.g. 250"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Custom points per one currency unit"
              />
              <Text style={[styles.blockHint, { color: colors.textSecondary, marginBottom: 0, marginTop: 0 }]}>pts = {currency}1</Text>
            </View>
            <Text style={[styles.blockLabel, { color: colors.text, marginTop: Spacing.md }]}>Currency</Text>
            <View style={styles.dayGrid}>
              {['$', '£', '€', '₹'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.dayChip, { backgroundColor: colors.background, borderColor: colors.border }, currency === c && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => { setCurrency(c); saveAllowance({ allowanceCurrency: c }); }}
                >
                  <Text style={[styles.dayChipText, { color: currency === c ? '#FFF' : colors.text }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsBlock>
        )}
      </SettingsGroup>

      {/* E3: real-world perks that unlock with each level (frames unlock on their own). */}
      <SettingsGroup title="Level perks">
        <SettingsBlock isLast>
          <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
            Levels climb with every point earned (spending doesn't lower them). Each level already unlocks a new avatar frame — add a real-world perk too if you like.
          </Text>
          <LevelPerksEditor perks={family?.levelPerks} onSave={handleSavePerks} />
        </SettingsBlock>
      </SettingsGroup>

      {isAdmin && (
        <SettingsGroup title="Weekly reset">
          <SettingsBlock isLast>
            <Text style={[styles.blockHint, { color: colors.textSecondary }]}>
              The week resets at midnight on the chosen day. Default: Monday.
            </Text>
            <View style={styles.dayGrid}>
              {WEEK_DAYS.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[
                    styles.dayChip,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    weekStartDay === d.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => handleWeekStartDayChange(d.value)}
                >
                  <Text style={[styles.dayChipText, { color: weekStartDay === d.value ? '#FFF' : colors.text }]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsBlock>
        </SettingsGroup>
      )}
    </SettingsScaffold>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    blockLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
    blockHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 4, marginBottom: Spacing.md, lineHeight: 18 },
    penaltyModeRow: { flexDirection: 'row', gap: Spacing.sm },
    penaltyModeChip: { flex: 1, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: 'center' },
    penaltyModeText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    deadlineWrap: { marginTop: Spacing.lg },
    modeOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    customRateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm },
    customRateInput: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: 10, paddingVertical: 6, minWidth: 90, fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    hourRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    hourChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: 'center' },
    hourChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    dayGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: 'center' },
    dayChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    pauseOptRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    pauseChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: 'center' },
    pauseChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    pausedWrap: { gap: Spacing.sm },
    pausedBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.md, borderWidth: 1.5 },
    pausedBadgeText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    resumeBtn: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: BorderRadius.md },
    resumeBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#FFF' },
  });
}
