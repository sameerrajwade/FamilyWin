/**
 * app/app/settings/notifications.tsx
 * Sub-screen: reminder TIMES and quiet hours. Reminders themselves are always
 * on (no off switch) — a parent's morning "plan today" and everyone's evening
 * "check off what's done". If the OS has blocked notifications we say so and
 * link to system settings instead of pretending a toggle works.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert, Linking, Modal, StyleSheet } from 'react-native';
import { SettingsScaffold, SettingsGroup, NavRow } from '@/components/ui/SettingsUI';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { getNotifConfig, upsertNotifConfig } from '@/lib/firebase';
import {
  ensureReminders, ensureNotificationPermission, placeOutsideQuiet,
  DEFAULT_EVENING_REMINDER, DEFAULT_MORNING_REMINDER,
} from '@/lib/notifications';
import { useReminderStatus } from '@/lib/reminderStatus';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

function formatTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${minute.toString().padStart(2, '0')} ${period}`;
}

const MORNING_OPTIONS = ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00'];
const EVENING_OPTIONS = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

type Editing = 'morning' | 'evening' | null;

export default function NotificationsScreen() {
  const { member, family } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const { permission, setPermission } = useReminderStatus();

  const [eveningTime, setEveningTime] = useState(DEFAULT_EVENING_REMINDER);
  const [morningTime, setMorningTime] = useState(DEFAULT_MORNING_REMINDER);
  const [editing, setEditing] = useState<Editing>(null);
  // Phase 5 #5 — quiet hours
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');

  useEffect(() => {
    if (!member?.id || !family?.id) return;
    getNotifConfig(family.id, member.id).then((cfg: any) => {
      if (!cfg) return;
      setEveningTime(cfg.dailyReminderTime ?? DEFAULT_EVENING_REMINDER);
      setMorningTime(cfg.morningReminderTime ?? DEFAULT_MORNING_REMINDER);
      if (cfg.quietStart && cfg.quietEnd) {
        setQuietEnabled(true);
        setQuietStart(cfg.quietStart);
        setQuietEnd(cfg.quietEnd);
      }
    });
    ensureNotificationPermission(false).then(setPermission).catch(() => {});
  }, [member?.id, family?.id, setPermission]);

  /** Persist + reschedule with the given values (any omitted = current state). */
  async function apply(next: { morning?: string; evening?: string; quiet?: { start: string; end: string } | null }) {
    if (!member?.id || !family?.id) return;
    const morning = next.morning ?? morningTime;
    const evening = next.evening ?? eveningTime;
    const quiet = next.quiet === undefined ? (quietEnabled ? { start: quietStart, end: quietEnd } : null) : next.quiet;
    await upsertNotifConfig(family.id, member.id, {
      dailyReminderTime: evening,
      morningReminderTime: morning,
      quietStart: quiet?.start ?? null,
      quietEnd: quiet?.end ?? null,
    });
    const p = await ensureReminders({
      name: member.displayName, isParent, morning, evening,
      quiet: quiet ?? undefined, prompt: true, weekStartDay: family.weekStartDay ?? 1,
    });
    setPermission(p);
  }

  async function pickTime(t: string) {
    const which = editing;
    setEditing(null);
    if (which === 'morning') { setMorningTime(t); await apply({ morning: t }); }
    else if (which === 'evening') { setEveningTime(t); await apply({ evening: t }); }
  }

  function saveQuiet(enabled: boolean, start: string, end: string) {
    apply({ quiet: enabled ? { start, end } : null }).catch(() => {});
  }

  async function handleTurnOn() {
    const p = await ensureNotificationPermission(true);
    setPermission(p);
    if (p === 'granted') { await apply({}); return; }
    Alert.alert(
      'Notifications are blocked',
      'Turn on notifications for Lootboard in your phone settings so reminders can reach you.',
      [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
    );
  }

  // What will actually fire, after quiet hours shift a reminder out of the window.
  const qs = quietEnabled ? quietStart : null, qe = quietEnabled ? quietEnd : null;
  const effEvening = placeOutsideQuiet(eveningTime, 'evening', qs, qe);
  const effMorning = placeOutsideQuiet(morningTime, 'morning', qs, qe);

  return (
    <SettingsScaffold title="Notifications">
      {permission === 'denied' && (
        <TouchableOpacity
          style={[styles.blockedCard, { backgroundColor: colors.danger + '14', borderColor: colors.danger + '55' }]}
          onPress={handleTurnOn}
          accessibilityRole="button"
          accessibilityLabel="Turn on notifications"
        >
          <Text style={[styles.blockedTitle, { color: colors.textDanger }]}>🔕 Reminders can't reach you</Text>
          <Text style={[styles.blockedBody, { color: colors.text }]}>
            Notifications are turned off for Lootboard on this phone. Tap to turn them on.
          </Text>
        </TouchableOpacity>
      )}

      <SettingsGroup title="Daily reminders · always on">
        {isParent && (
          <NavRow
            icon="sunny-outline"
            label="Morning plan"
            subtitle={effMorning !== morningTime ? `Moved to ${formatTime(effMorning)} (quiet hours)` : "Nudge to add today's tasks"}
            onPress={() => setEditing('morning')}
            right={
              <View style={[styles.timeBtn, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.timeBtnText, { color: colors.textAccent }]}>{formatTime(morningTime)}</Text>
              </View>
            }
          />
        )}
        <NavRow
          icon="moon-outline"
          label="Evening check-in"
          subtitle={effEvening !== eveningTime ? `Moved to ${formatTime(effEvening)} (quiet hours)` : "Nudge to check off what's done"}
          isLast
          onPress={() => setEditing('evening')}
          right={
            <View style={[styles.timeBtn, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.timeBtnText, { color: colors.textAccent }]}>{formatTime(eveningTime)}</Text>
            </View>
          }
        />
      </SettingsGroup>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        Reminders keep the whole family on track, so they can't be switched off — just pick the times that suit you.
      </Text>

      {/* Quiet hours (Phase 5 #5) — moves reminders out of the window, never cancels them */}
      <SettingsGroup title="Quiet hours">
        <NavRow
          icon="bed-outline"
          label="Quiet hours"
          subtitle={quietEnabled ? `Nothing between ${formatTime(quietStart)} – ${formatTime(quietEnd)}` : 'Keep nights notification-free'}
          isLast={!quietEnabled}
          right={
            <Switch
              value={quietEnabled}
              onValueChange={(v) => { setQuietEnabled(v); saveQuiet(v, quietStart, quietEnd); }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFF"
              accessibilityLabel="Toggle quiet hours"
            />
          }
        />
        {quietEnabled && (
          <View style={styles.quietBlock}>
            <Text style={[styles.quietLabel, { color: colors.text }]}>Start</Text>
            <View style={styles.quietChips}>
              {['20:00', '21:00', '22:00', '23:00'].map((t) => (
                <TouchableOpacity key={t} style={[styles.quietChip, { borderColor: colors.border }, quietStart === t && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setQuietStart(t); saveQuiet(true, t, quietEnd); }}>
                  <Text style={[styles.quietChipText, { color: quietStart === t ? '#FFF' : colors.text }]}>{formatTime(t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.quietLabel, { color: colors.text, marginTop: Spacing.md }]}>End</Text>
            <View style={styles.quietChips}>
              {['06:00', '07:00', '08:00', '09:00'].map((t) => (
                <TouchableOpacity key={t} style={[styles.quietChip, { borderColor: colors.border }, quietEnd === t && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setQuietEnd(t); saveQuiet(true, quietStart, t); }}>
                  <Text style={[styles.quietChipText, { color: quietEnd === t ? '#FFF' : colors.text }]}>{formatTime(t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </SettingsGroup>

      <Modal visible={editing !== null} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editing === 'morning' ? 'Morning plan time' : 'Evening check-in time'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {editing === 'morning' ? "When should we nudge you to plan the day's tasks?" : 'When should we nudge everyone to check off their tasks?'}
            </Text>
            <View style={styles.timeGrid}>
              {(editing === 'morning' ? MORNING_OPTIONS : EVENING_OPTIONS).map((t) => {
                const active = (editing === 'morning' ? morningTime : eveningTime) === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeOption, { backgroundColor: colors.background, borderColor: colors.border }, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => pickTime(t)}
                  >
                    <Text style={[styles.timeOptionText, { color: colors.text }, active && { color: '#FFF' }]}>
                      {formatTime(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditing(null)}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SettingsScaffold>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    blockedCard: { borderWidth: 1.5, borderRadius: BorderRadius.lg, padding: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
    blockedTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, marginBottom: 4 },
    blockedBody: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 19 },
    caption: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, paddingHorizontal: Spacing.lg, marginTop: -Spacing.xs, marginBottom: Spacing.md, lineHeight: 16 },
    quietBlock: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, paddingTop: Spacing.xs },
    quietLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginBottom: Spacing.sm },
    quietChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    quietChip: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    quietChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    timeBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
    timeBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
    modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, marginBottom: 4, textAlign: 'center' },
    modalSubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center', marginBottom: Spacing.lg },
    timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', marginBottom: Spacing.lg },
    timeOption: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5 },
    timeOptionText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
    cancelBtn: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
    cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  });
}
