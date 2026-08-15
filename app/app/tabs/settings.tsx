/**
 * app/app/tabs/settings.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings screen — profile, notifications, theme, family management,
 * managed children (NEW), parental controls, sign out.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, Alert, Modal, Linking, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';

// FACT, confirmed via on-device adb logcat (see family.tsx pickImageFromGallerySAF
// for the full evidence trail): Android's new system Photo Picker renders as a
// translucent overlay activity that fails to composite on this device's OS
// build — "Displayed" per ActivityTaskManager, yet blank until app-switch forces
// a redraw. expo-image-picker always prefers it on Android 13+ with no opt-out.
// Bypass it on Android via the classic opaque ACTION_GET_CONTENT/SAF chooser,
// which manages its own access grants (no READ_MEDIA_IMAGES permission needed).
async function pickImageFromGallerySAF(): Promise<string | null> {
  // ACTION_OPEN_DOCUMENT, not GET_CONTENT — GET_CONTENT routes to the Android
  // 13+ Photo Picker whose content://media/picker/… URIs are unreadable
  // downstream. OPEN_DOCUMENT opens DocumentsUI and returns a readable
  // …/documents URI. flags:1 = FLAG_GRANT_READ_URI_PERMISSION.
  const result = await IntentLauncher.startActivityAsync('android.intent.action.OPEN_DOCUMENT', {
    type: 'image/*',
    category: 'android.intent.category.OPENABLE',
    flags: 1,
  });
  if (result.resultCode !== -1 /* Activity.RESULT_OK */ || !result.data) return null;
  return result.data;
}
import { Share } from 'react-native';
import {
  signOut, getFamilyMembers, updateMemberProfile,
  upsertNotifConfig, getNotifConfig, updateFamilyWeekStartDay,
  createManagedMember, removeManagedMember,
  uploadMemberPhoto, removeMemberPhoto, deleteMyAccount,
  setMissedTaskPenalty,
} from '@/lib/firebase';
import { pickPhotoUri } from '@/lib/photoPicker';
import { useAuthStore, useFamilyStore } from '@/store';
import { AppearanceSettings } from '@/components/ui/AppearanceSettings';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { requestNotificationPermissions, scheduleDailyReminder } from '@/lib/notifications';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow, AVATAR_EMOJIS } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

const WEEK_DAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export default function SettingsScreen() {
  const { member, family, setFamily, clearSession } = useAuthStore();
  const { members, setMembers, updateMember } = useFamilyStore();
  const { colors } = useTheme();

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(member?.avatarEmoji ?? '🦁');
  const [isSaving, setIsSaving] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState(family?.weekStartDay ?? 1);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childEmoji, setChildEmoji] = useState('🐼');
  const [childPhotoUri, setChildPhotoUri] = useState<string | null>(null);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [profilePhotoURL, setProfilePhotoURL] = useState<string | undefined>(member?.photoURL);
  const CHILD_EMOJIS = ['🐼', '🦊', '🐸', '🦁', '🐯', '🐨', '🐻', '🐮', '🐷', '🐙', '🦋', '🐬'];

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const managedChildren = members.filter((m) => m.isManaged);

  // ── Load data on mount ────────────────────────────────────────────────────

  useEffect(() => {
    if (!member?.id || !family?.id) return;

    // Load notification config
    getNotifConfig(family.id, member.id).then((cfg) => {
      if (cfg) {
        setNotificationsEnabled(cfg.enabled ?? true);
        setReminderTime(cfg.dailyReminderTime ?? '20:00');
      }
    });

    // Load family members (to show managed children list)
    if (members.length === 0) {
      getFamilyMembers(family.id).then((list) => setMembers(list as any));
    }
  }, [member?.id, family?.id]);

  // ── Notifications ──────────────────────────────────────────────────────────

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

  // ── Profile photo ──────────────────────────────────────────────────────────

  async function handlePickProfilePhoto() {
    if (!member?.id || !family?.id) return;

    Alert.alert('Change Profile Photo', 'Choose an option', [
      {
        text: '📷 Camera',
        onPress: async () => {
          try {
            const uri = await pickPhotoUri('camera');
            if (uri) await doUploadPhoto(uri);
          } catch (err) {
            if (__DEV__) console.error('[Camera]', err);
            Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
          }
        },
      },
      {
        text: '🖼️ Photo Library',
        onPress: async () => {
          try {
            const uri = await pickPhotoUri('library');
            if (uri) await doUploadPhoto(uri);
          } catch (err) {
            if (__DEV__) console.error('[Photo Library]', err);
            Alert.alert('Library Error', 'Could not open your photo library. Please try again.');
          }
        },
      },
      ...(profilePhotoURL ? [{
        text: '🗑️ Remove Photo',
        style: 'destructive' as const,
        onPress: async () => {
          try {
            setIsUploadingPhoto(true);
            await removeMemberPhoto(family!.id, member!.id);
            setProfilePhotoURL(undefined);
            updateMember(member!.id, { photoURL: undefined } as any);
          } catch {
            Alert.alert('Error', 'Could not remove photo.');
          } finally {
            setIsUploadingPhoto(false);
          }
        },
      }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function doUploadPhoto(uri: string) {
    if (!member?.id || !family?.id) return;
    try {
      setIsUploadingPhoto(true);
      const url = await uploadMemberPhoto(uri, family.id, member.id);
      setProfilePhotoURL(url);
      updateMember(member.id, { photoURL: url } as any);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (__DEV__) console.error('[Photo Upload]', err);
      const detail = err?.code || err?.message || String(err);
      Alert.alert('Upload Failed', `Could not upload photo.\n\n(${detail})`);
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────

  async function handleUpdateEmoji() {
    if (!member?.id || !family?.id) return;
    try {
      setIsSaving(true);
      await updateMemberProfile(family.id, member.id, { avatarEmoji: selectedEmoji });
      updateMember(member.id, { avatarEmoji: selectedEmoji });
      setShowEmojiModal(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not update avatar. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Invite code ────────────────────────────────────────────────────────────

  async function handleCopyInviteCode() {
    if (!family?.inviteCode) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Invite Code 📋',
      `Share code: ${family.inviteCode}`,
      [
        { text: 'Copy', onPress: () => Clipboard.setStringAsync(family!.inviteCode) },
        {
          text: '📤 Share',
          onPress: () => Share.share({
            message: `Join our family on Lootboard! 🏆\n\nDownload Lootboard and enter invite code: ${family!.inviteCode}\n\nComplete tasks, earn points, and win the week!`,
            title: 'Join Lootboard',
          }),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  // ── Sign out ───────────────────────────────────────────────────────────────

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clearSession();
          router.replace('/auth/login');
        },
      },
    ]);
  }

  // ── Delete account (Play policy: in-app account deletion) ───────────────────

  function confirmDeleteAccount() {
    const isAdmin = member?.role === 'admin_parent';
    Alert.alert(
      'Delete My Account?',
      isAdmin
        ? 'This permanently deletes your account. If you are the last account-holder, your whole family — all members, tasks, points and photos — is deleted too.\n\nThis cannot be undone.'
        : 'This permanently deletes your account and your profile.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: reallyDeleteAccount },
      ],
    );
  }

  async function reallyDeleteAccount() {
    try {
      setIsDeletingAccount(true);
      await deleteMyAccount();
      clearSession();
      // onAuthStateChanged in _layout also fires, but route explicitly too.
      router.replace('/auth/login');
    } catch (e: any) {
      setIsDeletingAccount(false);
      Alert.alert('Could not delete account', e?.message ?? 'Please try again in a moment.');
    }
  }

  // ── Weekly reset day ───────────────────────────────────────────────────────

  async function handleToggleMissedPenalty(value: boolean) {
    if (!family?.id) return;
    await Haptics.selectionAsync();
    // Optimistic — reflect immediately, roll back on failure
    setFamily({ ...family, missedTaskPenalty: value });
    try {
      await setMissedTaskPenalty(family.id, value);
    } catch {
      setFamily({ ...family, missedTaskPenalty: !value });
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

  // ── Add managed child ──────────────────────────────────────────────────────

  async function handleAddChild() {
    if (!childName.trim()) { Alert.alert('Missing Name', 'Please enter a name for the child.'); return; }
    if (!family?.id) return;
    try {
      setIsAddingChild(true);
      const newChild = await createManagedMember({
        familyId: family.id,
        displayName: childName.trim(),
        avatarEmoji: childEmoji,
        age: childAge ? parseInt(childAge, 10) : undefined,
      });
      // Upload child photo if one was selected
      if (childPhotoUri) {
        try {
          await uploadMemberPhoto(childPhotoUri, family.id, newChild.id);
          (newChild as any).photoURL = 'pending'; // will load fresh from Firestore
        } catch { /* photo upload failure is non-fatal */ }
      }
      setMembers([...members, newChild as any]);
      setChildName('');
      setChildAge('');
      setChildEmoji('🐼');
      setChildPhotoUri(null);
      setShowAddChildModal(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Child Added! 🎉', `${newChild.displayName} is now part of the family. Switch to their profile on the Home screen to complete tasks on their behalf.`);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not add child profile.');
    } finally {
      setIsAddingChild(false);
    }
  }

  // ── Remove managed child ───────────────────────────────────────────────────

  function handleRemoveChild(childId: string, name: string) {
    Alert.alert(
      `Remove ${name}?`,
      'This will remove them from the family. Their task history will remain in records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (family?.id) await removeManagedMember(family.id, childId);
              setMembers(members.filter((m) => m.id !== childId));
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch {
              Alert.alert('Error', 'Could not remove child profile. Please try again.');
            }
          },
        },
      ],
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatTime(time: string): string {
    const [hour, minute] = time.split(':').map(Number);
    const period = hour >= 12 ? 'PM' : 'AM';
    const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h}:${minute.toString().padStart(2, '0')} ${period}`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        {/* ── My Profile ── */}
        <SettingsSection title="My Profile">
          <View style={styles.profileCard}>
            {/* Avatar — shows real photo if available, otherwise emoji */}
            <View style={styles.avatarContainer}>
              <TouchableOpacity
                style={styles.avatarBtn}
                onPress={() => profilePhotoURL ? handlePickProfilePhoto() : setShowEmojiModal(true)}
                accessibilityLabel={profilePhotoURL ? 'Change profile photo' : 'Change avatar emoji'}
                accessibilityRole="button"
              >
                {profilePhotoURL ? (
                  <Image
                    source={{ uri: profilePhotoURL }}
                    style={styles.avatarPhoto}
                  />
                ) : (
                  <Text style={styles.avatarEmoji}>{selectedEmoji}</Text>
                )}
                {isUploadingPhoto ? (
                  <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                    <ActivityIndicator color="#FFF" size="small" style={{ transform: [{ scale: 0.6 }] }} />
                  </View>
                ) : (
                  <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                    <Icon name={profilePhotoURL ? 'camera' : 'pencil'} size={13} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
              {/* Photo / emoji toggle buttons */}
              <View style={styles.avatarActions}>
                <TouchableOpacity
                  onPress={handlePickProfilePhoto}
                  style={[styles.avatarActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  accessibilityLabel="Change profile photo"
                  accessibilityRole="button"
                >
                  <View style={styles.avatarActionInner}>
                    <Icon name="camera" size={14} color={colors.text} />
                    <Text style={[styles.avatarActionText, { color: colors.text }]}>Photo</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowEmojiModal(true)}
                  style={[styles.avatarActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  accessibilityLabel="Change emoji avatar"
                  accessibilityRole="button"
                >
                  <View style={styles.avatarActionInner}>
                    <Icon name="happy-outline" size={14} color={colors.text} />
                    <Text style={[styles.avatarActionText, { color: colors.text }]}>Emoji</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>{member?.displayName}</Text>
              <Text style={[styles.profileRole, { color: colors.textSecondary }]}>{member?.role?.replace('_', ' ')}</Text>
              <Text style={[styles.profileFamily, { color: colors.primary }]}>{family?.name}</Text>
            </View>
          </View>
        </SettingsSection>

        {/* ── Appearance ── */}
        <SettingsSection title="Appearance">
          <AppearanceSettings />
        </SettingsSection>

        {/* ── Notifications ── */}
        <SettingsSection title="Notifications">
          <SettingsRow
            label="Enable Notifications"
            subtitle="Receive task reminders and alerts"
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
            <SettingsRow
              label="Daily Reminder Time"
              subtitle={`Reminders at ${formatTime(reminderTime)}`}
              right={
                <TouchableOpacity
                style={[styles.timeBtn, { backgroundColor: colors.primary + '20' }]}
                onPress={() => setShowTimeModal(true)}
                accessibilityLabel={`Change reminder time, currently ${formatTime(reminderTime)}`}
                accessibilityRole="button"
              >
                  <Text style={[styles.timeBtnText, { color: colors.primary }]}>{formatTime(reminderTime)}</Text>
                </TouchableOpacity>
              }
            />
          )}
        </SettingsSection>

        {/* ── Managed Children (parents only) ── */}
        {isParent && (
          <SettingsSection title="Managed Children">
            <View style={[styles.managedHint, { backgroundColor: colors.primary + '0F', borderColor: colors.primary + '33' }]}>
              <Text style={[styles.managedHintText, { color: colors.text }]}>
                👶 Children added here don&apos;t need their own phone. Switch to their profile from the Home screen to complete tasks on their behalf.
              </Text>
            </View>

            {managedChildren.length === 0 ? (
              <View style={styles.noChildrenRow}>
                <Text style={[styles.noChildrenText, { color: colors.textMuted }]}>No managed children yet</Text>
              </View>
            ) : (
              managedChildren.map((child) => (
                <View key={child.id} style={[styles.childRow, { borderTopColor: colors.border }]}>
                  <Avatar emoji={child.avatarEmoji} photoURL={child.photoURL} size={44} />
                  <View style={styles.childInfo}>
                    <Text style={[styles.childName, { color: colors.text }]}>{child.displayName}</Text>
                    <Text style={[styles.childMeta, { color: colors.textSecondary }]}>
                      👶 Managed{child.age ? ` · Age ${child.age}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.removeBtn, { backgroundColor: colors.danger + '15' }]}
                    onPress={() => handleRemoveChild(child.id, child.displayName)}
                    accessibilityLabel={`Remove ${child.displayName}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.removeBtnText, { color: colors.danger }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity
              style={[styles.addChildRow, { borderTopColor: colors.border }]}
              onPress={() => setShowAddChildModal(true)}
              accessibilityLabel="Add a child profile"
              accessibilityRole="button"
            >
              <Icon name="add-circle" size={24} color={colors.primary} style={styles.addChildIcon} />
              <Text style={[styles.addChildLabel, { color: colors.primary }]}>Add a Child Profile</Text>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </SettingsSection>
        )}

        {/* ── Family ── */}
        <SettingsSection title="Family">
          <SettingsRow
            label="Family Name"
            subtitle={family?.name ?? '—'}
            right={null}
          />
          <SettingsRow
            label="Invite Code"
            subtitle="Share to add family members with phones"
            right={
              <TouchableOpacity
                style={[styles.codeBtn, { backgroundColor: colors.primary + '15' }]}
                onPress={handleCopyInviteCode}
                accessibilityLabel={`Copy invite code ${family?.inviteCode}`}
                accessibilityRole="button"
              >
                <Text style={[styles.codeBtnText, { color: colors.primary }]}>{family?.inviteCode}</Text>
                <Icon name="copy-outline" size={15} color={colors.primary} style={styles.codeCopyIcon} />
              </TouchableOpacity>
            }
          />
          {/* All members list */}
          <View style={[styles.memberListHeader, { borderTopColor: colors.border }]}>
            <Text style={[styles.memberListTitle, { color: colors.textSecondary }]}>All Members ({members.length})</Text>
          </View>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.memberRow}
              onPress={() => router.push(`/app/member/${m.id}`)}
              accessibilityLabel={`View ${m.displayName}'s profile`}
              accessibilityRole="button"
            >
              <Avatar emoji={m.avatarEmoji} photoURL={m.photoURL} size={40} />
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text }]}>{m.displayName}</Text>
                <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
                  {m.isManaged ? '👶 Managed' : m.role.replace('_', ' ')}
                </Text>
              </View>
              {m.id === member?.id && <Text style={[styles.youBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>You</Text>}
            </TouchableOpacity>
          ))}
        </SettingsSection>

        {/* ── Weekly Reset Day (admin_parent only) ── */}
        {isParent && member?.role === 'admin_parent' && (
          <SettingsSection title="Weekly Reset">
            <View style={{ padding: Spacing.md }}>
              <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
                The week resets at midnight on the chosen day. Default: Monday.
              </Text>
              <View style={styles.dayGrid}>
                {WEEK_DAYS.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[
                      styles.dayChip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
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
            </View>
          </SettingsSection>
        )}

        {/* ── Parental Controls (parents only) ── */}
        {isParent && (
          <SettingsSection title="Parental Controls">
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push('/app/discipline/log')}
            >
              <Icon name="alert-circle" size={24} color={colors.primary} style={styles.actionIcon} />
              <View style={styles.actionInfo}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Log Discipline Event</Text>
                <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Award bonuses or apply penalties</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <SettingsRow
              label="Deduct points for missed tasks"
              subtitle="Half a task's points come off if it's not done that day. You can still mark it done up to 2 days later to win them back."
              right={
                <Switch
                  value={!!family?.missedTaskPenalty}
                  onValueChange={handleToggleMissedPenalty}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFF"
                />
              }
            />
          </SettingsSection>
        )}

        {/* ── Share App ── */}
        <SettingsSection title="Share Lootboard">
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() =>
              Share.share({
                message:
                  '🏆 We use Lootboard to turn chores into a fun family competition!\n\nKids earn points for completing tasks and win rewards. Download it free:\nhttps://play.google.com/store/apps/details?id=com.familywin.app',
                title: 'Try Lootboard — Family Chore Tracker',
              })
            }
          >
            <Icon name="share-social" size={24} color={colors.primary} style={styles.actionIcon} />
            <View style={styles.actionInfo}>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Share This App</Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Invite friends & family to try Lootboard</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </SettingsSection>

        {/* ── Account ── */}
        <SettingsSection title="Account">
          <TouchableOpacity style={[styles.actionRow, { borderTopColor: colors.border }]} onPress={handleLogout}>
            <Icon name="log-out-outline" size={24} color={colors.danger} style={styles.actionIcon} />
            <Text style={[styles.actionLabel, { color: colors.danger }]}>Log Out</Text>
          </TouchableOpacity>
        </SettingsSection>

        {/* ── Danger Zone (any account holder can delete their own account) ── */}
        <SettingsSection title="Danger Zone">
          <TouchableOpacity
            style={styles.actionRow}
            disabled={isDeletingAccount}
            onPress={confirmDeleteAccount}
          >
            <Icon name="trash-outline" size={24} color={colors.danger} style={styles.actionIcon} />
            <View style={styles.actionInfo}>
              <Text style={[styles.actionLabel, { color: colors.danger }]}>
                {isDeletingAccount ? 'Deleting…' : 'Delete My Account'}
              </Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>
                {member?.role === 'admin_parent'
                  ? 'Deletes your account — and the whole family if you are the last member'
                  : 'Permanently deletes your account and profile'}
              </Text>
            </View>
          </TouchableOpacity>
        </SettingsSection>

        <Text style={[styles.version, { color: colors.textMuted }]}>Lootboard v1.0.0 · Made with ❤️</Text>
      </ScrollView>

      {/* ── Avatar picker modal ── */}
      <Modal visible={showEmojiModal} animationType="slide" transparent onRequestClose={() => setShowEmojiModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Change Avatar</Text>
            <Text style={styles.selectedEmojiPreview}>{selectedEmoji}</Text>
            <View style={styles.emojiGrid}>
              {AVATAR_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiOption, { borderColor: colors.border }, selectedEmoji === emoji && { borderColor: colors.primary, backgroundColor: colors.primary + '20' }]}
                  onPress={() => { setSelectedEmoji(emoji); Haptics.selectionAsync(); }}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowEmojiModal(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleUpdateEmoji} disabled={isSaving}>
                <Text style={styles.saveBtnText}>{isSaving ? 'Saving…' : 'Save Avatar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Child modal ── */}
      <Modal visible={showAddChildModal} animationType="slide" transparent onRequestClose={() => setShowAddChildModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Child Profile 👶</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                No phone needed — you switch to their profile on the Home screen.
              </Text>

              {/* Child photo picker */}
              <View style={styles.childPhotoRow}>
                <TouchableOpacity
                  style={[styles.childPhotoBox, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={async () => {
                    try {
                      const uri = await pickPhotoUri('library');
                      if (uri) setChildPhotoUri(uri);
                    } catch (err) {
                      if (__DEV__) console.error('[Child Photo Picker]', err);
                      Alert.alert('Error', 'Could not open your photo library. Please try again.');
                    }
                  }}
                  accessibilityLabel="Add child profile photo"
                  accessibilityRole="button"
                >
                  {childPhotoUri ? (
                    <Image source={{ uri: childPhotoUri }} style={styles.childPhotoImg} />
                  ) : (
                    <>
                      <Text style={{ fontSize: 28, marginBottom: 4 }}>{childEmoji}</Text>
                      <Text style={[styles.childPhotoHint, { color: colors.textSecondary }]}>📷 Add Photo</Text>
                    </>
                  )}
                </TouchableOpacity>
                {childPhotoUri && (
                  <TouchableOpacity onPress={() => setChildPhotoUri(null)} style={styles.removePhotoBtn}>
                    <Text style={[styles.removePhotoBtnText, { color: colors.danger }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[styles.modalFieldLabel, { color: colors.text }]}>Pick Avatar Emoji</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CHILD_EMOJIS.map((em) => (
                    <TouchableOpacity
                      key={em}
                      style={[styles.emojiOption, { borderColor: colors.border }, childEmoji === em && { borderColor: colors.primary, backgroundColor: colors.primary + '20' }]}
                      onPress={() => { setChildEmoji(em); Haptics.selectionAsync(); }}
                    >
                      <Text style={styles.emojiText}>{em}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.modalFieldLabel, { color: colors.text }]}>Child's Name *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={childName}
                onChangeText={setChildName}
                placeholder="e.g. Tommy, Emma..."
                placeholderTextColor={colors.textMuted}
                maxLength={20}
                accessibilityLabel="Child's name"
              />

              <Text style={[styles.modalFieldLabel, { color: colors.text }]}>Age (optional)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={childAge}
                onChangeText={setChildAge}
                placeholder="e.g. 8"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Child's age"
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setShowAddChildModal(false)}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }, isAddingChild && { opacity: 0.6 }]}
                  onPress={handleAddChild}
                  disabled={isAddingChild}
                  accessibilityLabel="Add child profile"
                  accessibilityRole="button"
                >
                  {isAddingChild
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.saveBtnText}>➕ Add Child</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Time picker modal ── */}
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
    </SafeAreaView>
  );
}

// ─── Reusable components ──────────────────────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: colors.text }]}>{children}</View>
    </View>
  );
}

function SettingsRow({ label, subtitle, right }: { label: string; subtitle?: string; right: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.settingsRow, { borderBottomColor: colors.border }]}>
      <View style={styles.settingsRowLeft}>
        <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.settingsRowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ─── Styles — ALL colors resolved at runtime via colors.* from useTheme() ────
// No hardcoded Colors.* here so dark mode works correctly.

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  section: { marginBottom: Spacing.md, paddingHorizontal: Spacing.lg },
  sectionTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, marginLeft: 4 },
  sectionCard: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadow.sm },
  settingsRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1 },
  settingsRowLeft: { flex: 1, marginRight: Spacing.sm },
  settingsRowLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  settingsRowSubtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  // Profile
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  avatarContainer: { alignItems: 'center', gap: 6 },
  avatarBtn: { position: 'relative' },
  avatarEmoji: { fontSize: 56 },
  avatarPhoto: { width: 72, height: 72, borderRadius: 36 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  editBadgeText: { fontSize: 11 },
  avatarActions: { flexDirection: 'row', gap: 6 },
  avatarActionBtn: { borderRadius: BorderRadius.sm, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1 },
  avatarActionInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatarActionText: { fontSize: FontSize.xs - 1, fontFamily: FontFamily.semiBold },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  profileRole: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textTransform: 'capitalize', marginTop: 2 },
  profileFamily: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginTop: 2 },
  // Child photo picker
  childPhotoRow: { alignItems: 'center', marginBottom: Spacing.sm },
  childPhotoBox: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  childPhotoImg: { width: 84, height: 84, borderRadius: 42 },
  childPhotoHint: { fontSize: FontSize.xs - 1, fontFamily: FontFamily.regular },
  removePhotoBtn: { marginTop: 4 },
  removePhotoBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold },
  // Managed children
  managedHint: { margin: Spacing.md, borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1 },
  managedHintText: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, lineHeight: 18 },
  noChildrenRow: { padding: Spacing.md, paddingTop: 0 },
  noChildrenText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  childRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, gap: Spacing.sm },
  childAvatar: { fontSize: 32 },
  childInfo: { flex: 1 },
  childName: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  childMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  removeBtn: { borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  removeBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  addChildRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1 },
  addChildIcon: { width: 26, textAlign: 'center' },
  addChildLabel: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  // Buttons
  timeBtn: { borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  timeBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  codeBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.black, letterSpacing: 2 },
  codeCopyIcon: { marginLeft: 6 },
  // Member list
  memberListHeader: { padding: Spacing.md, paddingBottom: 4, borderTopWidth: 1 },
  memberListTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  memberEmoji: { fontSize: 28 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  memberRole: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, textTransform: 'capitalize' },
  youBadge: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  // Action rows
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  dangerRow: { borderTopWidth: 1 },
  actionIcon: { width: 26, textAlign: 'center' },
  actionInfo: { flex: 1 },
  actionLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  actionSubtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  version: { textAlign: 'center', fontSize: FontSize.xs, fontFamily: FontFamily.regular, paddingVertical: Spacing.xl },
  sectionHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginBottom: Spacing.md, lineHeight: 18 },
  dayGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: 'center' },
  dayChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center', marginBottom: Spacing.lg },
  modalFieldLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginBottom: 6, marginTop: Spacing.sm },
  modalInput: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular, marginBottom: 4 },
  selectedEmojiPreview: { fontSize: 64, textAlign: 'center', marginBottom: Spacing.md },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  emojiOption: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  emojiText: { fontSize: 30 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', marginBottom: Spacing.lg },
  timeOption: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5 },
  timeOptionText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  saveBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
});

