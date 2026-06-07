import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Switch,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, ThemeMode } from '@/lib/theme';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

// ─── APPEARANCE SETTINGS CARD ─────────────────────────────────────────────────
// Drop this into the Settings screen

export function AppearanceSettings() {
  const { colors, themeMode, uiMode, isDark, isChildMode, setThemeMode, setUIMode } = useTheme();

  async function handleThemeMode(mode: ThemeMode) {
    await Haptics.selectionAsync();
    setThemeMode(mode);
  }

  async function handleChildModeToggle(val: boolean) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUIMode(val ? 'child' : 'adult');
  }

  const themeModes: { mode: ThemeMode; label: string; emoji: string }[] = [
    { mode: 'light', label: 'Light', emoji: '☀️' },
    { mode: 'dark', label: 'Dark', emoji: '🌙' },
    { mode: 'system', label: 'Auto', emoji: '📱' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>

      {/* Theme Mode */}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
            Currently {isDark ? 'dark' : 'light'} mode
          </Text>
        </View>
      </View>
      <View style={styles.themeRow}>
        {themeModes.map(({ mode, label, emoji }) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.themeChip,
              { borderColor: colors.border, backgroundColor: colors.background },
              themeMode === mode && { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
            ]}
            onPress={() => handleThemeMode(mode)}
          >
            <Text style={styles.themeEmoji}>{emoji}</Text>
            <Text style={[styles.themeLabel, { color: themeMode === mode ? colors.primary : colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Child Mode */}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>👧 Child Mode</Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
            {isChildMode ? 'Bigger text, mascot, celebrations' : 'Standard compact view'}
          </Text>
        </View>
        <Switch
          value={isChildMode}
          onValueChange={handleChildModeToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={isChildMode ? '#FFFFFF' : '#F3F4F6'}
        />
      </View>

      {isChildMode && (
        <View style={[styles.childModePreview, { backgroundColor: colors.primary + '11', borderColor: colors.primary + '44' }]}>
          <Text style={styles.childModePreviewText}>
            🌟 Child mode is ON — tasks are bigger, a mascot guides the experience, and completions trigger full celebrations!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardTitle: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowLeft: { flex: 1, marginRight: Spacing.sm },
  rowLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  rowSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  themeRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  themeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  themeEmoji: { fontSize: 22, marginBottom: 4 },
  themeLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  divider: { height: 1, marginHorizontal: Spacing.md },
  childModePreview: {
    margin: Spacing.md,
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1.5,
  },
  childModePreviewText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: '#6C63FF',
    lineHeight: 18,
  },
});
