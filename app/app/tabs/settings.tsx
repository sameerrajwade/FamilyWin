/**
 * app/app/tabs/settings.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings HUB — a compact landing screen. Your profile sits on top; everything
 * else is grouped into tappable rows that push focused sub-screens:
 *   • Family & Members      → /app/family
 *   • Appearance            → /app/settings/appearance
 *   • Notifications         → /app/settings/notifications
 *   • Parental Controls     → /app/settings/parental   (parents only)
 *   • Help & Legal          → /app/settings/about
 * Account actions (log out, delete) stay inline at the bottom.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Modal, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  signOut, updateMemberProfile, uploadMemberPhoto, removeMemberPhoto, deleteMyAccount,
} from '@/lib/firebase';
import { pickPhotoUri } from '@/lib/photoPicker';
import { useAuthStore, useFamilyStore } from '@/store';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { BrandLogo } from '@/components/ui/BrandIcons';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { SettingsGroup, NavRow } from '@/components/ui/SettingsUI';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow, AVATAR_EMOJIS } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export default function SettingsScreen() {
  const { member, family, clearSession, requestTour } = useAuthStore();
  const { updateMember } = useFamilyStore();
  const { colors } = useTheme();

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(member?.avatarEmoji ?? '🦁');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [profilePhotoURL, setProfilePhotoURL] = useState<string | undefined>(member?.photoURL);


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

  // ── Account ──────────────────────────────────────────────────────────────

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
      router.replace('/auth/login');
    } catch (e: any) {
      setIsDeletingAccount(false);
      Alert.alert('Could not delete account', e?.message ?? 'Please try again in a moment.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Compact brand row — keeps the Lootboard logo but reclaims the top
            space (no big stacked tile/tagline, and no redundant "Settings"
            title since we're already on the Settings tab). */}
        <View style={styles.brandHeader}>
          <BrandLogo size={19} tagline={false} />
        </View>

        {/* ── Profile card ── */}
        <View style={styles.profileWrap}>
          <View style={[styles.profileCard, { backgroundColor: colors.surface, shadowColor: colors.text }]}>
            <View style={styles.avatarContainer}>
              <TouchableOpacity
                style={styles.avatarBtn}
                onPress={() => profilePhotoURL ? handlePickProfilePhoto() : setShowEmojiModal(true)}
                accessibilityLabel={profilePhotoURL ? 'Change profile photo' : 'Change avatar emoji'}
                accessibilityRole="button"
              >
                <Avatar emoji={selectedEmoji} photoURL={profilePhotoURL} size={72} memberId={member?.id} />
                <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                  {isUploadingPhoto
                    ? <ActivityIndicator color="#FFF" size="small" style={{ transform: [{ scale: 0.6 }] }} />
                    : <Icon name={profilePhotoURL ? 'camera' : 'pencil'} size={13} color="#FFF" />}
                </View>
              </TouchableOpacity>
              <View style={styles.avatarActions}>
                <TouchableOpacity
                  onPress={handlePickProfilePhoto}
                  style={[styles.avatarActionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
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
                  style={[styles.avatarActionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
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
            <TouchableOpacity
              style={styles.profileInfo}
              onPress={() => member?.id && router.push(`/app/member/${member.id}` as any)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="View my profile"
            >
              <Text style={[styles.profileName, { color: colors.text }]}>{member?.displayName}</Text>
              <Text style={[styles.profileRole, { color: colors.textSecondary }]}>{member?.role?.replace('_', ' ')}</Text>
              <Text style={[styles.profileFamily, { color: colors.textAccent }]}>{family?.name}</Text>
              <View style={styles.viewProfileRow}>
                <Text style={[styles.viewProfileText, { color: colors.textAccent }]}>View my profile</Text>
                <Icon name="chevron-forward" size={14} color={colors.primary} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Family & Members and the game rules moved to the Family tab —
            Settings is now just you + the app. */}

        {/* ── Preferences ── */}
        <SettingsGroup title="Preferences">
          <NavRow
            icon="color-palette-outline"
            label="Appearance"
            subtitle="Light, dark & child mode"
            onPress={() => router.push('/app/settings/appearance' as any)}
          />
          <NavRow
            icon="notifications-outline"
            label="Notifications"
            subtitle="Reminders and alerts"
            isLast
            onPress={() => router.push('/app/settings/notifications' as any)}
          />
        </SettingsGroup>

        {/* ── Support ── */}
        <SettingsGroup title="Support">
          <NavRow
            icon="help-circle-outline"
            label="Help & Legal"
            subtitle="FAQ, privacy, terms & share"
            onPress={() => router.push('/app/settings/about' as any)}
          />
          <NavRow
            icon="sparkles-outline"
            label="Replay walkthrough"
            subtitle="See the welcome tour again"
            isLast
            onPress={() => { requestTour(); router.push('/app/tabs' as any); }}
          />
        </SettingsGroup>

        {/* ── Account ── */}
        <SettingsGroup title="Account">
          <NavRow
            icon="log-out-outline"
            label="Log Out"
            danger
            onPress={handleLogout}
            right={null}
          />
          <NavRow
            icon="trash-outline"
            label={isDeletingAccount ? 'Deleting…' : 'Delete My Account'}
            subtitle={member?.role === 'admin_parent'
              ? 'Deletes your account — and the family if you are the last member'
              : 'Permanently deletes your account and profile'}
            danger
            isLast
            onPress={() => { if (!isDeletingAccount) confirmDeleteAccount(); }}
            right={null}
          />
        </SettingsGroup>

        <Text style={[styles.version, { color: colors.textMuted }]}>Lootboard v1.0.0 · Made with ❤️</Text>
      </ScrollView>

      {/* ── Avatar picker modal ── */}
      <Modal visible={showEmojiModal} animationType="slide" transparent onRequestClose={() => setShowEmojiModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Change Avatar</Text>
            <View style={{ alignItems: 'center', marginBottom: Spacing.sm }}>
              <Avatar emoji={selectedEmoji} size={84} showRing ringColor={colors.primary} />
            </View>
            <AvatarPicker value={selectedEmoji} onChange={setSelectedEmoji} layout="grid" size={48} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  brandHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  // Profile
  profileWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm },
  avatarContainer: { alignItems: 'center', gap: 6 },
  avatarBtn: { position: 'relative' },
  avatarEmoji: { fontSize: 56 },
  avatarPhoto: { width: 72, height: 72, borderRadius: 36 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarActions: { flexDirection: 'row', gap: 6 },
  avatarActionBtn: { borderRadius: BorderRadius.sm, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1 },
  avatarActionInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatarActionText: { fontSize: FontSize.xs - 1, fontFamily: FontFamily.semiBold },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  profileRole: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textTransform: 'capitalize', marginTop: 2 },
  profileFamily: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginTop: 2 },
  viewProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  viewProfileText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  version: { textAlign: 'center', fontSize: FontSize.xs, fontFamily: FontFamily.regular, paddingVertical: Spacing.xl },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, marginBottom: 4, textAlign: 'center' },
  selectedEmojiPreview: { fontSize: 64, textAlign: 'center', marginBottom: Spacing.md },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  emojiOption: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  emojiText: { fontSize: 30 },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  saveBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
});
