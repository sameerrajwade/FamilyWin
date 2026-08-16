/**
 * app/app/settings/parental.tsx
 * Sub-screen (parents only): discipline log shortcut, missed-task penalty mode,
 * and the weekly reset day (admin only). Logic lifted from the old inline
 * Settings > Parental Controls / Weekly Reset sections.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SettingsScaffold, SettingsGroup, NavRow, SettingsBlock } from '@/components/ui/SettingsUI';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { setMissedTaskPenalty, missedPenaltyMode, updateFamilyWeekStartDay } from '@/lib/firebase';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

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

  const isAdmin = member?.role === 'admin_parent';

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
      Alert.alert('Error', 'Could not update the missed-task penalty setting.');
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
      Alert.alert('Error', 'Could not update weekly reset day.');
      setWeekStartDay(family.weekStartDay ?? 1);
    }
  }

  return (
    <SettingsScaffold title="Parental Controls">
      <SettingsGroup title="Points">
        <NavRow
          icon="alert-circle-outline"
          label="Log Discipline Event"
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
    dayGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: 'center' },
    dayChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  });
}
