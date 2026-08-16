/**
 * app/app/settings/notifications.tsx
 * Sub-screen: enable/disable notifications and set the daily reminder time.
 * Logic lifted verbatim from the old inline Settings > Notifications section.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert, Linking, Modal, StyleSheet } from 'react-native';
import { SettingsScaffold, SettingsGroup, NavRow } from '@/components/ui/SettingsUI';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { getNotifConfig, upsertNotifConfig } from '@/lib/firebase';
import { requestNotificationPermissions, scheduleDailyReminder } from '@/lib/notifications';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

function formatTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${minute.toString().padStart(2, '0')} ${period}`;
}

export default function NotificationsScreen() {
  const { member, family } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [showTimeModal, setShowTimeModal] = useState(false);

  useEffect(() => {
    if (!member?.id || !family?.id) return;
    getNotifConfig(family.id, member.id).then((cfg) => {
      if (cfg) {
        setNotificationsEnabled(cfg.enabled ?? true);
        setReminderTime(cfg.dailyReminderTime ?? '20:00');
      }
    });
  }, [member?.id, family?.id]);

  async function handleToggleNotifications(value: boolean) {
    setNotificationsEnabled(value);
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        setNotificationsEnabled(false);
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device Settings to receive task reminders.',
          [{ text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
        );
        return;
      }
    }
    if (!member?.id || !family?.id) return;
    await upsertNotifConfig(family.id, member.id, { enabled: value });
  }

  async function handleSaveReminderTime(time: string) {
    if (!member?.id || !family?.id) return;
    setReminderTime(time);
    setShowTimeModal(false);
    await upsertNotifConfig(family.id, member.id, { dailyReminderTime: time });
    const [hour, minute] = time.split(':').map(Number);
    await scheduleDailyReminder(hour, minute, member.displayName, 1);
    Alert.alert('Saved! ⏰', `Daily reminder set for ${formatTime(time)}`);
  }

  return (
    <SettingsScaffold title="Notifications">
      <SettingsGroup title="Reminders">
        <NavRow
          icon="notifications-outline"
          label="Enable Notifications"
          subtitle="Task reminders and alerts"
          isLast={!notificationsEnabled}
          right={
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFF"
              accessibilityLabel="Toggle notifications"
            />
          }
        />
        {notificationsEnabled && (
          <NavRow
            icon="time-outline"
            label="Daily Reminder Time"
            subtitle={`Reminders at ${formatTime(reminderTime)}`}
            isLast
            onPress={() => setShowTimeModal(true)}
            right={
              <View style={[styles.timeBtn, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.timeBtnText, { color: colors.primary }]}>{formatTime(reminderTime)}</Text>
              </View>
            }
          />
        )}
      </SettingsGroup>

      <Modal visible={showTimeModal} animationType="slide" transparent onRequestClose={() => setShowTimeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Set Reminder Time</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>When should we remind you about tasks?</Text>
            <View style={styles.timeGrid}>
              {['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeOption, { backgroundColor: colors.background, borderColor: colors.border }, reminderTime === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => handleSaveReminderTime(t)}
                >
                  <Text style={[styles.timeOptionText, { color: colors.text }, reminderTime === t && { color: '#FFF' }]}>
                    {formatTime(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowTimeModal(false)}>
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
