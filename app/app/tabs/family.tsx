/**
 * app/app/tabs/family.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Family management screen — members, add/remove kids, roles, invite code,
 * discipline log shortcut. Replaces the buried Settings > Family section.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Modal, TextInput, Share, ActivityIndicator, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  getFamilyMembers, createManagedMember, updateMemberProfile, uploadMemberPhoto, removeMemberPhoto,
} from '@/lib/firebase';
import firestore from '@react-native-firebase/firestore';
import { useAuthStore, useFamilyStore } from '@/store';
import { useTheme } from '@/lib/theme';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow, AVATAR_EMOJIS } from '@/constants/theme';
import { Avatar } from '@/components/ui';
import type { MemberDoc } from '@/lib/firebase';

export default function FamilyScreen() {
  const { member, family } = useAuthStore();
  const { members, setMembers, updateMember } = useFamilyStore();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState<MemberDoc | null>(null);
  const [showEditMember, setShowEditMember] = useState<MemberDoc | null>(null);

  const isAdmin = member?.role === 'admin_parent';
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

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

  async function handleShareInvite() {
    if (!family?.inviteCode) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Share.share({
      message: `Join our family on FamilyWin! 🏆\n\nDownload FamilyWin and enter invite code: ${family.inviteCode}\n\nComplete tasks, earn points, and win the week!`,
      title: 'Join FamilyWin',
    });
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
      Alert.alert('Role Updated ✅', `${target.displayName} is now ${newRole.replace('_', ' ')}.`);
    } catch {
      Alert.alert('Error', 'Could not update role.');
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
              Alert.alert('Error', 'Could not remove member.');
            }
          },
        },
      ],
    );
  }

  const parents = members.filter((m) => !m.isManaged && (m.role === 'parent' || m.role === 'admin_parent'));
  const children = members.filter((m) => m.isManaged || m.role === 'child');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>👨‍👩‍👧 {family?.name ?? 'Family'}</Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{members.length} members</Text>
          </View>
          {isParent && (
            <TouchableOpacity
              style={[styles.disciplineBtn, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '55' }]}
              onPress={() => router.push('/app/discipline/log')}
            >
              <Text style={[styles.disciplineBtnText, { color: colors.warning }]}>⚠️ Penalty/Bonus</Text>
            </TouchableOpacity>
          )}
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
              <Text style={styles.inviteIconText}>📋</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inviteIconBtn} onPress={handleShareInvite}>
              <Text style={styles.inviteIconText}>📤</Text>
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
                <Text style={[styles.addChildLink, { color: colors.primary }]}>+ Add Child</Text>
              </TouchableOpacity>
            )}
          </View>
          {children.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={styles.emptyChildRow} onPress={() => setShowAddChild(true)}>
                <Text style={styles.emptyChildEmoji}>👶</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.emptyChildTitle, { color: colors.primary }]}>Add a child profile</Text>
                  <Text style={[styles.emptyChildSub, { color: colors.textSecondary }]}>Kids don't need a phone — switch to their profile on the Tasks tab</Text>
                </View>
                <Text style={{ color: colors.primary, fontSize: 18 }}>→</Text>
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
                  onRolePress={null}
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
                  <Text style={[styles.addAnotherText, { color: colors.primary }]}>➕ Add Another Child</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
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
  const roleLabel = member.isManaged ? '👶 Managed child' : member.role.replace('_', ' ');
  const roleColor = member.role === 'admin_parent' ? colors.primary : member.role === 'parent' ? colors.success : colors.textMuted;

  const Wrapper: any = onEdit ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[styles.memberRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
      {...(onEdit ? { onPress: onEdit, activeOpacity: 0.6 } : {})}
    >
      <Avatar emoji={member.avatarEmoji} photoURL={member.photoURL} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, { color: colors.text }]}>
          {member.displayName}{isSelf ? ' (You)' : ''}
        </Text>
        <Text style={[styles.memberRole, { color: roleColor }]}>{roleLabel}</Text>
      </View>
      <View style={styles.memberActions}>
        {onEdit && (
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '44' }]} onPress={onEdit}>
            <Text style={[styles.actionChipText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
        )}
        {isAdmin && !isSelf && !member.isManaged && onRolePress && (
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '44' }]} onPress={onRolePress}>
            <Text style={[styles.actionChipText, { color: colors.primary }]}>Role</Text>
          </TouchableOpacity>
        )}
        {isAdmin && !isSelf && (
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '44' }]} onPress={onRemove}>
            <Text style={[styles.actionChipText, { color: Colors.danger }]}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </Wrapper>
  );
}

// ── Shared photo picker helper ────────────────────────────────────────────────
// Module-level lock: guards against the picker being launched multiple times
// concurrently. Repeated taps while the (sometimes slow-to-appear) picker is
// opening used to queue up several launches that all surfaced later, stacked
// on top of each other. Only one in-flight launch at a time.
let pickerBusy = false;

async function pickPhotoUri(source: 'library' | 'camera'): Promise<string | null> {
  if (pickerBusy) return null;
  pickerBusy = true;
  try {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    if (permission.canAskAgain === false) {
      Alert.alert('Permission Needed', 'Please enable photo access in Settings to choose a photo.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    } else {
      Alert.alert('Permission Needed', 'Permission is required to select a photo.');
    }
    return null;
  }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  return asset?.uri ?? null;
  } finally {
    pickerBusy = false;
  }
}

function choosePhotoSource(title: string, cb: (source: 'library' | 'camera') => void) {
  Alert.alert(title, 'Choose a source', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Camera', onPress: () => cb('camera') },
    { text: 'Photo Library', onPress: () => cb('library') },
  ]);
}

// ── Add child modal ───────────────────────────────────────────────────────────
function AddChildModal({ familyId, onClose, onAdded }: {
  familyId: string; onClose: () => void; onAdded: (child: MemberDoc) => void;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [emoji, setEmoji] = useState('🐼');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handlePickPhoto() {
    choosePhotoSource("Child's Photo", async (source) => {
      const uri = await pickPhotoUri(source);
      if (uri) setPhotoUri(uri);
    });
  }

  async function handleAdd() {
    if (!name.trim()) { Alert.alert('Missing Name', 'Please enter a name.'); return; }
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
      Alert.alert('Error', 'Could not add child profile.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: Colors.surface }]}>
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
              <View style={styles.photoPreviewBadge}><Text style={{ fontSize: 12 }}>✏️</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickPhoto}>
              <Text style={[styles.addChildLink, { color: Colors.primary }]}>{photoUri ? 'Change Photo' : 'Add Photo'}</Text>
            </TouchableOpacity>
            {photoUri && (
              <TouchableOpacity onPress={() => setPhotoUri(null)}>
                <Text style={[styles.addChildLink, { color: Colors.danger }]}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.fieldLabel}>Or Pick a Backup Avatar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {['🐼', '🦊', '🐸', '🦁', '🐯', '🐨', '🐻', '🐮', '🐷', '🐙', '🦋', '🐬', '🦄', '🐧', '🦅'].map((em) => (
                <TouchableOpacity
                  key={em}
                  style={[styles.emojiOpt, emoji === em && styles.emojiOptSelected]}
                  onPress={() => { setEmoji(em); Haptics.selectionAsync(); }}
                >
                  <Text style={{ fontSize: 26 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.fieldLabel}>Child's Name *</Text>
          <TextInput
            style={styles.modalInput}
            value={name} onChangeText={setName}
            placeholder="e.g. Tommy, Emma..."
            placeholderTextColor={Colors.textMuted}
            maxLength={20} autoFocus
          />
          <Text style={styles.fieldLabel}>Age (optional)</Text>
          <TextInput
            style={styles.modalInput}
            value={age} onChangeText={setAge}
            placeholder="e.g. 8"
            placeholderTextColor={Colors.textMuted}
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
  const [name, setName] = useState(member.displayName);
  const [age, setAge] = useState(member.age != null ? String(member.age) : '');
  const [emoji, setEmoji] = useState(member.avatarEmoji);
  const [photoURL, setPhotoURL] = useState<string | null | undefined>(member.photoURL);
  const [isSaving, setIsSaving] = useState(false);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);

  function handlePickPhoto() {
    choosePhotoSource('Profile Photo', async (source) => {
      const uri = await pickPhotoUri(source);
      if (!uri) return;
      try {
        setIsPhotoBusy(true);
        const url = await uploadMemberPhoto(uri, familyId, member.id);
        setPhotoURL(url);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        if (__DEV__) console.error('[Edit Member Photo Upload]', e);
        Alert.alert('Upload Failed', 'Could not upload the photo. Please try again.');
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
      Alert.alert('Error', 'Could not remove the photo.');
    } finally {
      setIsPhotoBusy(false);
    }
  }

  function handleChangePhotoPress() {
    if (photoURL) {
      Alert.alert('Profile Photo', `Update or remove the photo for ${member.displayName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove Photo', style: 'destructive', onPress: handleRemovePhoto },
        { text: 'Change Photo', onPress: handlePickPhoto },
      ]);
    } else {
      handlePickPhoto();
    }
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Missing Name', 'Please enter a name.'); return; }
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
      Alert.alert('Error', 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: Colors.surface }]}>
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
                {isPhotoBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 12 }}>✏️</Text>}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleChangePhotoPress} disabled={isPhotoBusy}>
              <Text style={[styles.addChildLink, { color: Colors.primary }]}>{photoURL ? 'Change Photo' : 'Add Photo'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Pick Avatar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {['🐼', '🦊', '🐸', '🦁', '🐯', '🐨', '🐻', '🐮', '🐷', '🐙', '🦋', '🐬', '🦄', '🐧', '🦅'].map((em) => (
                <TouchableOpacity
                  key={em}
                  style={[styles.emojiOpt, emoji === em && styles.emojiOptSelected]}
                  onPress={() => { setEmoji(em); Haptics.selectionAsync(); }}
                >
                  <Text style={{ fontSize: 26 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={styles.modalInput}
            value={name} onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={Colors.textMuted}
            maxLength={20}
          />
          <Text style={styles.fieldLabel}>Age (optional)</Text>
          <TextInput
            style={styles.modalInput}
            value={age} onChangeText={setAge}
            placeholder="e.g. 8"
            placeholderTextColor={Colors.textMuted}
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
  const ROLES: { role: MemberDoc['role']; label: string; desc: string; emoji: string }[] = [
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
              {target.role === r.role && <Text style={{ color: colors.primary, fontFamily: FontFamily.black }}>✓</Text>}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg },
  headerTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  headerSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 2 },
  disciplineBtn: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  disciplineBtnText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  // Invite card
  inviteCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderRadius: BorderRadius.xl, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', ...Shadow.md },
  inviteLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  inviteCode: { fontSize: 32, fontFamily: FontFamily.black, color: '#FFF', letterSpacing: 6 },
  inviteHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  inviteBtns: { gap: Spacing.sm },
  inviteIconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  inviteIconText: { fontSize: 20 },
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
  addAnotherRow: { borderTopWidth: 1, padding: Spacing.md, alignItems: 'center' },
  addAnotherText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.text, marginBottom: 6, marginTop: Spacing.sm },
  modalInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular, color: Colors.text, backgroundColor: Colors.background },
  photoPreviewWrap: { width: 60, height: 60, borderRadius: 30 },
  photoPreviewImg: { width: 60, height: 60, borderRadius: 30 },
  photoPreviewEmpty: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  photoPreviewBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surface },
  emojiOpt: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emojiOptSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.textSecondary },
  saveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  roleLabel: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  roleDesc: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
});
