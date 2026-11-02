/**
 * app/app/family.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Family management screen — members, add/remove kids, roles, invite code.
 * Pushed from the Settings hub (Settings → Family & Members); no longer a bottom
 * tab, so it carries its own back button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Modal, TextInput, ActivityIndicator, Image, Linking,
  InteractionManager, Platform,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  getFamilyMembers, createManagedMember, updateMemberProfile, uploadMemberPhoto, removeMemberPhoto,
  switchFamilyByCode,
} from '@/lib/firebase';
import { firestore } from '@/lib/fb';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow, AVATAR_EMOJIS } from '@/constants/theme';
import { APP_STORE_URL } from '@/constants/strings';
import { pickPhotoUri as pickPhotoViaRNIP } from '@/lib/photoPicker';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCard';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import type { MemberDoc } from '@/lib/firebase';

export default function FamilyScreen() {
  const { member, family, user, setMember, setFamily, setActingAsMember } = useAuthStore();
  const { members, setMembers, updateMember } = useFamilyStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState<MemberDoc | null>(null);
  const [showEditMember, setShowEditMember] = useState<MemberDoc | null>(null);
  const [showSwitchFamily, setShowSwitchFamily] = useState(false);
  const [showInviteCard, setShowInviteCard] = useState(false);

  // Every parent has FULL family-admin access (add/promote/demote/edit members,
  // weekly reset, etc.) — not just the family creator (admin_parent). A parent
  // who joins later is a co-admin, matching the Firestore rules which already
  // grant every parent capability to both 'parent' and 'admin_parent'.
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const isAdmin = isParent;

  const loadMembers = useCallback(async () => {
    if (!family?.id) return;
    const list = await getFamilyMembers(family.id);
    setMembers(list as any);
  }, [family?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMembers();
    setRefreshing(false);
  }, [loadMembers]);

  const inviteCard: ShareCardData | null = family?.inviteCode ? {
    icon: 'chest',
    eyebrow: 'JOIN OUR FAMILY',
    title: `Join ${family.name} on Chore League`,
    subtitle: 'Download the app and enter this code',
    stats: [{ value: family.inviteCode, label: 'invite code' }],
    shareMessage: `Join our family on Chore League! 🏆\n\nInvite code: ${family.inviteCode}\n\nGet the app: ${APP_STORE_URL}\n\nComplete tasks, earn points, and win the week!`,
  } : null;

  async function handleShareInvite() {
    if (!family?.inviteCode) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowInviteCard(true);
  }

  async function handleCopyCode() {
    if (!family?.inviteCode) return;
    await Clipboard.setStringAsync(family.inviteCode);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Copied! 📋', `Invite code "${family.inviteCode}" copied.`);
  }

  async function handleChangeRole(target: MemberDoc, newRole: MemberDoc['role']) {
    if (!family?.id) return;
    try {
      await firestore()
        .collection('families').doc(family.id)
        .collection('members').doc(target.id)
        .update({ role: newRole });
      updateMember(target.id, { role: newRole });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRoleModal(null);
      Alert.alert('Role updated ✅', `${target.displayName} is now ${newRole.replace('_', ' ')}.`);
    } catch {
      Alert.alert('That didn’t work', 'Could not update role.');
    }
  }

  async function handleRemoveMember(target: MemberDoc) {
    Alert.alert(
      `Remove ${target.displayName}?`,
      'This will remove them from the family. Their task history remains.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await firestore()
                .collection('families').doc(family!.id)
                .collection('members').doc(target.id)
                .delete();
              setMembers(members.filter((m) => m.id !== target.id) as any);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch {
              Alert.alert('That didn’t work', 'Could not remove member.');
            }
          },
        },
      ],
    );
  }

  async function handleSwitchFamily(code: string) {
    if (!user?.id || !member) throw new Error('Not signed in.');
    const { family: newFamily, member: newMember } = await switchFamilyByCode(user.id, {
      inviteCode: code.trim().toUpperCase(),
      displayName: member.displayName,
      avatarEmoji: member.avatarEmoji,
      ...(member.age != null ? { age: member.age } : {}),
    });
    setActingAsMember(null);
    setFamily(newFamily);
    setMember(newMember);
    try { setMembers((await getFamilyMembers(newFamily.id)) as any); } catch { /* home reloads */ }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSwitchFamily(false);
    router.replace('/app/tabs');
  }

  const parents = members.filter((m) => !m.isManaged && (m.role === 'parent' || m.role === 'admin_parent'));
  const children = members.filter((m) => m.isManaged || m.role === 'child');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <ScreenHeader />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <EmojiIcon emoji="👨‍👩‍👧" size={30} />
              <Text style={[styles.headerTitle, { color: colors.text }]}>{family?.name ?? 'Family'}</Text>
            </View>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{members.length} members</Text>
          </View>
        </View>

        {/* Invite card */}
        <View style={[styles.inviteCard, { backgroundColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inviteLabel}>Invite Code</Text>
            <Text style={styles.inviteCode}>{family?.inviteCode}</Text>
            <Text style={styles.inviteHint}>Share so others with phones can join</Text>
          </View>
          <View style={styles.inviteBtns}>
            <TouchableOpacity style={styles.inviteIconBtn} onPress={handleCopyCode}>
              <Icon name="copy-outline" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.inviteIconBtn} onPress={handleShareInvite}>
              <Icon name="share-social" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Parents / Adults */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ADULTS</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {parents.map((m, i) => (
              <MemberRow
                key={m.id}
                member={m}
                isSelf={m.id === member?.id}
                isAdmin={isAdmin}
                isLast={i === parents.length - 1}
                onRolePress={() => isAdmin && m.id !== member?.id ? setShowRoleModal(m) : null}
                onRemove={() => handleRemoveMember(m)}
                onEdit={m.id === member?.id ? () => setShowEditMember(m) : undefined}
                colors={colors}
              />
            ))}
          </View>
        </View>

        {/* Children */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CHILDREN</Text>
            {isParent && (
              <TouchableOpacity onPress={() => setShowAddChild(true)}>
                <Text style={[styles.addChildLink, { color: colors.textAccent }]}>+ Add Child</Text>
              </TouchableOpacity>
            )}
          </View>
          {children.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={styles.emptyChildRow} onPress={() => setShowAddChild(true)}>
                <Text style={styles.emptyChildEmoji}>👶</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.emptyChildTitle, { color: colors.textAccent }]}>Add a child profile</Text>
                  <Text style={[styles.emptyChildSub, { color: colors.textSecondary }]}>Kids don't need a phone — switch to their profile on the Tasks tab</Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {children.map((m, i) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isSelf={false}
                  isAdmin={isAdmin}
                  isLast={i === children.length - 1}
                  // A self-joined child has an account (not managed) and can be
                  // promoted to parent by an admin. Managed profiles (no account)
                  // stay children — they're controlled from the parent's phone.
                  onRolePress={isAdmin && !m.isManaged ? () => setShowRoleModal(m) : null}
                  onRemove={() => handleRemoveMember(m)}
                  onEdit={isAdmin ? () => setShowEditMember(m) : undefined}
                  colors={colors}
                />
              ))}
              {isParent && (
                <TouchableOpacity
                  style={[styles.addAnotherRow, { borderTopColor: colors.border }]}
                  onPress={() => setShowAddChild(true)}
                >
                  <Icon name="add-circle" size={18} color={colors.primary} />
                  <Text style={[styles.addAnotherText, { color: colors.textAccent }]}>Add Another Child</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Switch family — for the "two parents made two households" case.
            Only account-holders (not managed children) reach this screen. */}
        {!member?.isManaged && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>WRONG HOUSEHOLD?</Text>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={styles.switchRow}
                onPress={() => setShowSwitchFamily(true)}
                accessibilityRole="button"
                accessibilityLabel="Switch to another family"
              >
                <Icon name="swap-horizontal" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchTitle, { color: colors.text }]}>Switch to another family</Text>
                  <Text style={[styles.switchSub, { color: colors.textSecondary }]}>
                    Joined the wrong household, or made a duplicate? Move to a family with their invite code.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add Child Modal */}
      {showAddChild && (
        <AddChildModal
          familyId={family?.id ?? ''}
          onClose={() => setShowAddChild(false)}
          onAdded={(child) => {
            setMembers([...members, child] as any);
            setShowAddChild(false);
          }}
        />
      )}

      {/* Role Change Modal */}
      {showRoleModal && (
        <RoleModal
          target={showRoleModal}
          onClose={() => setShowRoleModal(null)}
          onSelect={(role) => handleChangeRole(showRoleModal, role)}
          colors={colors}
        />
      )}

      {/* Branded invite share card */}
      <ShareCardModal visible={showInviteCard} data={inviteCard} onClose={() => setShowInviteCard(false)} />

      {/* Switch Family Modal */}
      {showSwitchFamily && (
        <SwitchFamilyModal
          currentFamilyName={family?.name ?? 'your current family'}
          onClose={() => setShowSwitchFamily(false)}
          onSubmit={handleSwitchFamily}
          colors={colors}
        />
      )}

      {/* Edit Member Modal */}
      {showEditMember && (
        <EditMemberModal
          familyId={family?.id ?? ''}
          member={showEditMember}
          onClose={() => setShowEditMember(null)}
          onSaved={(updates) => {
            updateMember(showEditMember.id, updates as any);
            setShowEditMember(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Member row ────────────────────────────────────────────────────────────────
function MemberRow({ member, isSelf, isAdmin, isLast, onRolePress, onRemove, onEdit, colors }: {
  member: MemberDoc; isSelf: boolean; isAdmin: boolean; isLast: boolean;
  onRolePress: (() => void) | null; onRemove: () => void; onEdit?: (() => void); colors: any;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const roleLabel = member.isManaged ? '👶 Managed child' : member.role.replace('_', ' ');
  const roleColor = member.role === 'admin_parent' ? colors.primary : member.role === 'parent' ? colors.success : colors.textMuted;

  return (
    <TouchableOpacity
      style={[styles.memberRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
      onPress={() => router.push(`/app/member/${member.id}` as any)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`View ${member.displayName}'s profile`}
    >
      <Avatar emoji={member.avatarEmoji} photoURL={member.photoURL} size={44} memberId={member.id} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, { color: colors.text }]}>
          {member.displayName}{isSelf ? ' (You)' : ''}
        </Text>
        <Text style={[styles.memberRole, { color: roleColor }]}>{roleLabel}</Text>
      </View>
      <View style={styles.memberActions}>
        {onEdit && (
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '44' }]} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${member.displayName}`}>
            <Text style={[styles.actionChipText, { color: colors.textAccent }]}>Edit</Text>
          </TouchableOpacity>
        )}
        {isAdmin && !isSelf && !member.isManaged && onRolePress && (
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '44' }]} onPress={onRolePress} accessibilityRole="button" accessibilityLabel={`Change role for ${member.displayName}`}>
            <Text style={[styles.actionChipText, { color: colors.textAccent }]}>Role</Text>
          </TouchableOpacity>
        )}
        {isAdmin && !isSelf && (
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '44' }]} onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${member.displayName}`}>
            <Text style={[styles.actionChipText, { color: colors.textDanger }]}>Remove</Text>
          </TouchableOpacity>
        )}
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ── Shared photo picker helper ────────────────────────────────────────────────
// Module-level lock: guards against the picker being launched multiple times
// concurrently. Repeated taps while the (sometimes slow-to-appear) picker is
// opening used to queue up several launches that all surfaced later, stacked
// on top of each other. Only one in-flight launch at a time.
let pickerBusy = false;

// FACT, confirmed via on-device adb logcat across multiple builds: Android's
// new system Photo Picker (com.google.android.photopicker) launches as a
// TRANSLUCENT overlay activity that — on this device's OS build — fails to
// composite its own content. ActivityTaskManager logs it as genuinely
// "Displayed" (the window exists and is on top, no stacking conflict), yet
// the screen shows nothing but a flicker until the app is backgrounded and
// foregrounded, which forces Android to redraw the whole stack. This is an
// OS-level compositor bug — confirmed to persist even with `allowsEditing`
// removed (which rules out the chained-cropper theory) — and is outside our
// app's control. expo-image-picker always prefers this Photo Picker on
// Android 13+ with no opt-out flag. The fix: bypass it entirely on Android
// by firing a classic ACTION_GET_CONTENT intent — the pre-2023 Storage
// Access Framework chooser, which launches as a normal OPAQUE full-screen
// activity and never touches the buggy translucent-compositing code path.
async function pickImageFromGallerySAF(): Promise<string | null> {
  // ACTION_OPEN_DOCUMENT (not GET_CONTENT): GET_CONTENT gets hijacked by the
  // Android 13+ system Photo Picker, whose content://media/picker/… URIs are
  // unopenable downstream ("No content provider" — confirmed on device across
  // fetch, Expo copy, AND native putFile). OPEN_DOCUMENT opens DocumentsUI
  // instead and returns a content://…/documents URI that ContentResolver +
  // putFile CAN read. flags:1 = FLAG_GRANT_READ_URI_PERMISSION.
  const result = await IntentLauncher.startActivityAsync('android.intent.action.OPEN_DOCUMENT', {
    type: 'image/*',
    category: 'android.intent.category.OPENABLE',
    flags: 1,
  });
  // Activity.RESULT_OK === -1
  if (result.resultCode !== -1 || !result.data) return null;
  return result.data;
}

async function pickPhotoUri(source: 'library' | 'camera'): Promise<string | null> {
  if (pickerBusy) return null;
  pickerBusy = true;
  try {
    // Delegates to react-native-image-picker (see lib/photoPicker) which returns
    // an app-owned file:// — fixes the Android 13 content:// upload failure.
    return await pickPhotoViaRNIP(source);
  } finally {
    pickerBusy = false;
  }
}

function choosePhotoSource(title: string, cb: (source: 'library' | 'camera') => void) {
  // IMPORTANT: don't call cb() synchronously inside onPress. The native Alert
  // dialog is still mid-dismiss-animation at that point, and launching the
  // image-picker activity while Android is tearing down the dialog causes the
  // launch to get silently queued — it only "wakes up" when the app regains
  // foreground (e.g. after the user backgrounds and reopens the app). Defer
  // with InteractionManager.runAfterInteractions(), which waits for the
  // dismiss animation/interaction to actually finish (event-driven, not a
  // fixed delay — so unlike setTimeout it can't queue up multiple launches).
  Alert.alert(title, 'Choose a source', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Camera', onPress: () => InteractionManager.runAfterInteractions(() => cb('camera')) },
    { text: 'Photo Library', onPress: () => InteractionManager.runAfterInteractions(() => cb('library')) },
  ]);
}

// ── Add child modal ───────────────────────────────────────────────────────────
function AddChildModal({ familyId, onClose, onAdded }: {
  familyId: string; onClose: () => void; onAdded: (child: MemberDoc) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [emoji, setEmoji] = useState('🐼');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // FACT, confirmed via on-device logcat: this <Modal> is rendered as an
  // Android Dialog window (ReactModalHost) that stays mounted/visible while
  // choosePhotoSource/pickPhotoUri runs. The system image-picker Activity DOES
  // launch and DOES get displayed (logcat: "Displayed ...photopicker...
  // MainActivity +54ms") — but this Modal's window keeps redrawing ON TOP of
  // it (logcat: "ReactModalHost: Updating existing dialog" ~2s later),
  // hiding the picker until the app is backgrounded and the Modal's window
  // disappears with it. Fix: hide this Modal (visible={false}) for the
  // duration of the picker launch, then restore it when picking finishes.
  const [modalVisible, setModalVisible] = useState(true);

  function handlePickPhoto() {
    choosePhotoSource("Child's Photo", async (source) => {
      setModalVisible(false);
      try {
        const uri = await pickPhotoUri(source);
        if (uri) setPhotoUri(uri);
      } finally {
        setModalVisible(true);
      }
    });
  }

  async function handleAdd() {
    if (!name.trim()) { Alert.alert('Add a name', 'Please enter a name.'); return; }
    try {
      setIsLoading(true);
      const child = await createManagedMember({
        familyId,
        displayName: name.trim(),
        avatarEmoji: emoji,
        age: age ? parseInt(age, 10) : undefined,
      });
      let finalChild = child;
      if (photoUri) {
        try {
          const url = await uploadMemberPhoto(photoUri, familyId, child.id);
          finalChild = { ...child, photoURL: url };
        } catch (e) {
          if (__DEV__) console.error('[Add Child Photo Upload]', e);
        }
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded(finalChild);
    } catch {
      Alert.alert('That didn’t work', 'Could not add child profile.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal visible={modalVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Add Child Profile 👶</Text>
          <Text style={styles.modalSub}>No phone needed — you switch to their profile to complete tasks on their behalf.</Text>

          <Text style={styles.fieldLabel}>Photo (optional)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md }}>
            <TouchableOpacity onPress={handlePickPhoto} style={styles.photoPreviewWrap}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreviewImg} />
              ) : (
                <View style={styles.photoPreviewEmpty}><Text style={{ fontSize: 26 }}>{emoji}</Text></View>
              )}
              <View style={styles.photoPreviewBadge}><Icon name="pencil" size={11} color="#FFF" /></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickPhoto}>
              <Text style={[styles.addChildLink, { color: colors.textAccent }]}>{photoUri ? 'Change Photo' : 'Add Photo'}</Text>
            </TouchableOpacity>
            {photoUri && (
              <TouchableOpacity onPress={() => setPhotoUri(null)}>
                <Text style={[styles.addChildLink, { color: colors.textDanger }]}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.fieldLabel}>Or Pick a Backup Avatar</Text>
          <AvatarPicker value={emoji} onChange={setEmoji} />

          <Text style={styles.fieldLabel}>Child's Name *</Text>
          <TextInput
            style={styles.modalInput}
            value={name} onChangeText={setName}
            placeholder="e.g. Tommy, Emma..."
            placeholderTextColor={colors.textMuted}
            maxLength={20} autoFocus
          />
          <Text style={styles.fieldLabel}>Age (optional)</Text>
          <TextInput
            style={styles.modalInput}
            value={age} onChangeText={setAge}
            placeholder="e.g. 8"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad" maxLength={2}
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, isLoading && { opacity: 0.6 }]} onPress={handleAdd} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Add Child ✓</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Edit member modal (name, age, photo, avatar) ──────────────────────────────
function EditMemberModal({ familyId, member, onClose, onSaved }: {
  familyId: string; member: MemberDoc; onClose: () => void; onSaved: (updates: Partial<MemberDoc>) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(member.displayName);
  const [age, setAge] = useState(member.age != null ? String(member.age) : '');
  const [emoji, setEmoji] = useState(member.avatarEmoji);
  const [photoURL, setPhotoURL] = useState<string | null | undefined>(member.photoURL);
  const [isSaving, setIsSaving] = useState(false);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);
  // See AddChildModal above for the full explanation (confirmed via on-device
  // logcat): this <Modal>'s Android Dialog window stays on top of the system
  // image picker, hiding it. Hide the Modal while the picker is open.
  const [modalVisible, setModalVisible] = useState(true);

  function handlePickPhoto() {
    choosePhotoSource('Profile Photo', async (source) => {
      setModalVisible(false);
      let uri: string | null = null;
      try {
        uri = await pickPhotoUri(source);
      } finally {
        setModalVisible(true);
      }
      if (!uri) return;
      try {
        setIsPhotoBusy(true);
        const url = await uploadMemberPhoto(uri, familyId, member.id);
        setPhotoURL(url);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        if (__DEV__) console.error('[Edit Member Photo Upload]', e);
        Alert.alert('Upload didn’t work', 'Could not upload the photo. Please try again.');
      } finally {
        setIsPhotoBusy(false);
      }
    });
  }

  async function handleRemovePhoto() {
    try {
      setIsPhotoBusy(true);
      await removeMemberPhoto(familyId, member.id);
      setPhotoURL(null);
    } catch {
      Alert.alert('That didn’t work', 'Could not remove the photo.');
    } finally {
      setIsPhotoBusy(false);
    }
  }

  function handleChangePhotoPress() {
    if (photoURL) {
      Alert.alert('Profile photo', `Update or remove the photo for ${member.displayName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove Photo', style: 'destructive', onPress: handleRemovePhoto },
        { text: 'Change Photo', onPress: handlePickPhoto },
      ]);
    } else {
      handlePickPhoto();
    }
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Add a name', 'Please enter a name.'); return; }
    try {
      setIsSaving(true);
      const updates: { displayName?: string; avatarEmoji?: string; age?: number; photoURL?: string } = {
        displayName: name.trim(),
        avatarEmoji: emoji,
      };
      const parsedAge = age ? parseInt(age, 10) : undefined;
      if (parsedAge !== undefined) updates.age = parsedAge;
      await updateMemberProfile(familyId, member.id, updates);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved({ displayName: name.trim(), avatarEmoji: emoji, age: parsedAge, photoURL: photoURL ?? undefined });
    } catch {
      Alert.alert('That didn’t work', 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={modalVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Profile ✏️</Text>
          <Text style={styles.modalSub}>Update {member.displayName}'s name, age, and photo.</Text>

          <Text style={styles.fieldLabel}>Photo</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md }}>
            <TouchableOpacity onPress={handleChangePhotoPress} style={styles.photoPreviewWrap} disabled={isPhotoBusy}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.photoPreviewImg} />
              ) : (
                <View style={styles.photoPreviewEmpty}><Text style={{ fontSize: 26 }}>{emoji}</Text></View>
              )}
              <View style={styles.photoPreviewBadge}>
                {isPhotoBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="pencil" size={11} color="#FFF" />}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleChangePhotoPress} disabled={isPhotoBusy}>
              <Text style={[styles.addChildLink, { color: colors.textAccent }]}>{photoURL ? 'Change Photo' : 'Add Photo'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Pick Avatar</Text>
          <AvatarPicker value={emoji} onChange={setEmoji} />

          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={styles.modalInput}
            value={name} onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.textMuted}
            maxLength={20}
          />
          <Text style={styles.fieldLabel}>Age (optional)</Text>
          <TextInput
            style={styles.modalInput}
            value={age} onChangeText={setAge}
            placeholder="e.g. 8"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad" maxLength={2}
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, isSaving && { opacity: 0.6 }]} onPress={handleSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save ✓</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Role change modal ─────────────────────────────────────────────────────────
function RoleModal({ target, onClose, onSelect, colors }: {
  target: MemberDoc; onClose: () => void; onSelect: (r: MemberDoc['role']) => void; colors: any;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ROLES: { role: MemberDoc['role']; label: string; desc: string; emoji: string }[] = [
    { role: 'child', label: 'Child', desc: 'Completes tasks & redeems rewards — no approvals or settings', emoji: '🧒' },
    { role: 'parent', label: 'Parent', desc: 'Can create tasks, approve rewards, log penalties', emoji: '👩‍💼' },
    { role: 'admin_parent', label: 'Family Admin', desc: 'Full control — can manage roles and all settings', emoji: '👑' },
  ];
  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.text }]}>Change Role for {target.displayName}</Text>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.role}
              style={[styles.roleRow, { borderColor: colors.border }, target.role === r.role && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
              onPress={() => onSelect(r.role)}
            >
              <Text style={{ fontSize: 28 }}>{r.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleLabel, { color: colors.text }]}>{r.label}</Text>
                <Text style={[styles.roleDesc, { color: colors.textSecondary }]}>{r.desc}</Text>
              </View>
              {target.role === r.role && <Text style={{ color: colors.textAccent, fontFamily: FontFamily.black }}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.cancelBtn, { marginTop: Spacing.md }]} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Switch family modal ──────────────────────────────────────────────────────
function SwitchFamilyModal({ currentFamilyName, onClose, onSubmit, colors }: {
  currentFamilyName: string;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void>;
  colors: any;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (code.trim().length < 6) { setError('Enter the full 6-character invite code.'); return; }
    try {
      setBusy(true);
      setError(null);
      await onSubmit(code);
      // On success the parent navigates away; nothing more to do here.
    } catch (e: any) {
      setError(e?.message ?? 'Could not switch family. Check the code and try again.');
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.text }]}>Switch to another family</Text>
          <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
            Enter the invite code of the family you want to move to.
          </Text>

          <View style={[styles.switchWarn, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' }]}>
            <Text style={[styles.switchWarnText, { color: colors.text }]}>
              You'll leave <Text style={{ fontFamily: FontFamily.bold }}>{currentFamilyName}</Text> and join the new
              family as a member — a parent there can give you parent access. Your points and history stay with your
              old family.
            </Text>
          </View>

          <TextInput
            style={[styles.modalInput, styles.codeInput]}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={6}
            editable={!busy}
          />
          {error && <Text style={[styles.errorText, { color: colors.textDanger }]}>{error}</Text>}

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={handleConfirm} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Switch family</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  headerSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 2 },
  disciplineBtn: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  disciplineBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  // Invite card
  inviteCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderRadius: BorderRadius.xl, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', ...Shadow.md },
  inviteLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  inviteCode: { fontSize: 25, fontFamily: FontFamily.black, color: '#FFF', letterSpacing: 4 },
  inviteHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  inviteBtns: { gap: Spacing.sm },
  inviteIconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  // Sections
  section: { marginBottom: Spacing.md, paddingHorizontal: Spacing.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  card: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadow.sm },
  addChildLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  // Member rows
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  memberEmoji: { fontSize: 32 },
  memberName: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  memberRole: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, textTransform: 'capitalize', marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 6 },
  actionChip: { borderWidth: 1, borderRadius: BorderRadius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  actionChipText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  // Empty child
  emptyChildRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  emptyChildEmoji: { fontSize: 32 },
  emptyChildTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  emptyChildSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  addAnotherRow: { borderTopWidth: 1, padding: Spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  addAnotherText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, marginBottom: 4 },
  modalSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.text, marginBottom: 6, marginTop: Spacing.sm },
  modalInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.text, backgroundColor: colors.background },
  photoPreviewWrap: { width: 60, height: 60, borderRadius: 30 },
  photoPreviewImg: { width: 60, height: 60, borderRadius: 30 },
  photoPreviewEmpty: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  photoPreviewBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  emojiOpt: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  emojiOptSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textSecondary },
  saveBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  roleLabel: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  roleDesc: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  // Switch family
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  switchTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  switchSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2, lineHeight: 17 },
  switchWarn: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  switchWarnText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 19 },
  codeInput: { fontSize: 26, fontFamily: FontFamily.extraBold, textAlign: 'center', letterSpacing: 6 },
  errorText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginTop: Spacing.sm },
  });
}
