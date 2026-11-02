/**
 * app/app/settings/notifications.tsx
 * Sub-screen: which reminders you get, their TIMES, and quiet hours. Every type
 * is ON by default (a parent's morning plan, everyone's evening check-in, the
 * weekly Parent Report, "someone passed you", Sunday results) and each one can
 * be switched off here (G4). If the OS has blocked notifications we say so and
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
  notifPrefs, NOTIF_OFF_FIELD, type NotifType,
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
  // G4: which reminder types are on (all on by default).
  const [prefs, setPrefs] = useState<Record<NotifType, boolean>>(notifPrefs(null));

  useEffect(() => {
    if (!member?.id || !family?.id) return;
    getNotifConfig(family.id, member.id).then((cfg: any) => {
      if (!cfg) return;
      setPrefs(notifPrefs(cfg));
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
  async function apply(next: {
    morning?: string; evening?: string; quiet?: { start: string; end: string } | null;
    prefs?: Record<NotifType, boolean>;
  }) {
    if (!member?.id || !family?.id) return;
    const morning = next.morning ?? morningTime;
    const evening = next.evening ?? eveningTime;
    const quiet = next.quiet === undefined ? (quietEnabled ? { start: quietStart, end: quietEnd } : null) : next.quiet;
    const on = next.prefs ?? prefs;
    const offFields: Record<string, boolean> = {};
    (Object.keys(NOTIF_OFF_FIELD) as NotifType[]).forEach((t) => { offFields[NOTIF_OFF_FIELD[t]] = !on[t]; });
    await upsertNotifConfig(family.id, member.id, {
      dailyReminderTime: evening,
      morningReminderTime: morning,
      quietStart: quiet?.start ?? null,
      quietEnd: quiet?.end ?? null,
      ...offFields,
    });
    const p = await ensureReminders({
      name: member.displayName, isParent, morning, evening,
      quiet: quiet ?? undefined, prompt: true, weekStartDay: family.weekStartDay ?? 1,
      off: { morning: !on.morning, evening: !on.evening, report: !on.report },
    });
    setPermission(p);
  }

  function toggle(type: NotifType, value: boolean) {
    const next = { ...prefs, [type]: value };
    setPrefs(next);
    apply({ prefs: next }).catch(() => {
      setPrefs(prefs);
      Alert.alert('Could not save', 'Please try again.');
    });
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
      'Turn on notifications for Chore League in your phone settings so reminders can reach you.',
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
            Notifications are turned off for Chore League on this phone. Tap to turn them on.
          </Text>
        </TouchableOpacity>
      )}

      <SettingsGroup title="Reminders">
        {isParent && (
          <NavRow
            icon="sunny-outline"
            label="Morning plan"
            subtitle={!prefs.morning ? 'Off' : effMorning !== morningTime ? `Moved to ${formatTime(effMorning)} (quiet hours)` : "Nudge to add today's tasks"}
            onPress={prefs.morning ? () => setEditing('morning') : undefined}
            right={<TimeAndSwitch on={prefs.morning} time={morningTime} onToggle={(v) => toggle('morning', v)} label="Morning plan" styles={styles} colors={colors} />}
          />
        )}
        <NavRow
          icon="moon-outline"
          label="Evening check-in"
          subtitle={!prefs.evening ? 'Off' : effEvening !== eveningTime ? `Moved to ${formatTime(effEvening)} (quiet hours)` : "Nudge to check off what's done"}
          onPress={prefs.evening ? () => setEditing('evening') : undefined}
          right={<TimeAndSwitch on={prefs.evening} time={eveningTime} onToggle={(v) => toggle('evening', v)} label="Evening check-in" styles={styles} colors={colors} />}
        />
        {isParent && (
          <NavRow
            icon="stats-chart-outline"
            label="Weekly Parent Report"
            subtitle="Your family's week, on its last evening"
            right={<TimeAndSwitch on={prefs.report} onToggle={(v) => toggle('report', v)} label="Weekly Parent Report" styles={styles} colors={colors} />}
          />
        )}
        {isParent && (
          <NavRow
            icon="checkmark-done-outline"
            label="Kids' claims"
            subtitle="When a kid finishes a task that needs your OK"
            right={<TimeAndSwitch on={prefs.claims} onToggle={(v) => toggle('claims', v)} label="Kids' claims" styles={styles} colors={colors} />}
          />
        )}
        <NavRow
          icon="trending-up-outline"
          label="Someone takes the lead"
          subtitle="Once a day at most · never for kids under 10"
          right={<TimeAndSwitch on={prefs.overtaken} onToggle={(v) => toggle('overtaken', v)} label="Someone takes the lead" styles={styles} colors={colors} />}
        />
        <NavRow
          icon="sparkles-outline"
          label="Weekly twist"
          subtitle="Once a week, the morning your family's week starts"
          right={<TimeAndSwitch on={prefs.twists} onToggle={(v) => toggle('twists', v)} label="Weekly twist" styles={styles} colors={colors} />}
        />
        <NavRow
          icon="trophy-outline"
          label="Sunday results"
          subtitle="Who won the week and every crown"
          isLast
          right={<TimeAndSwitch on={prefs.weekly} onToggle={(v) => toggle('weekly', v)} label="Sunday results" styles={styles} colors={colors} />}
        />
      </SettingsGroup>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        All on by default. Turn off any you don't want — the game still works, you'll just get fewer nudges.
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

/** A reminder row's right side: its time chip (when it has one and is on) + an on/off switch. */
function TimeAndSwitch({ on, time, onToggle, label, styles, colors }: {
  on: boolean; time?: string; onToggle: (v: boolean) => void; label: string;
  styles: ReturnType<typeof createStyles>; colors: ThemeColors;
}) {
  return (
    <View style={styles.rightRow}>
      {time && on && (
        <View style={[styles.timeBtn, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.timeBtnText, { color: colors.textAccent }]}>{formatTime(time)}</Text>
        </View>
      )}
      <Switch
        value={on}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
        accessibilityLabel={`${label} reminder`}
      />
    </View>
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
    rightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
