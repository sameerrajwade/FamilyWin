import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Share, Image, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';

// See app/app/tabs/family.tsx (pickImageFromGallerySAF) for the full,
// logcat-confirmed explanation: Android's new system Photo Picker fails to
// composite on this device's OS build (genuinely "Displayed" yet blank until
// app-switch). Bypass it on Android via the classic opaque ACTION_GET_CONTENT
// SAF chooser, which manages its own access grants.
async function pickImageFromGallerySAF(): Promise<string | null> {
  const result = await IntentLauncher.startActivityAsync('android.intent.action.GET_CONTENT', {
    type: 'image/*',
    category: 'android.intent.category.OPENABLE',
  });
  if (result.resultCode !== -1 /* Activity.RESULT_OK */ || !result.data) return null;
  return result.data;
}
import { auth } from '@/lib/fb';
import {
  createFamily, joinFamily, createMember, createManagedMember,
  getFamilyMembers, upsertNotifConfig, uploadMemberPhoto, type FamilyDoc,
} from '@/lib/firebase';
import { ensureReminders, DEFAULT_EVENING_REMINDER, DEFAULT_MORNING_REMINDER } from '@/lib/notifications';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { useAuthStore, useFamilyStore } from '@/store';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow, AVATAR_EMOJIS } from '@/constants/theme';
import { useTheme, type ThemeColors } from '@/lib/theme';

type OnboardStep = 'choice' | 'profile' | 'family_name' | 'join_code' | 'done' | 'add_children';
type FlowType = 'create' | 'join';

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, setMember, setFamily } = useAuthStore();
  const { setMembers, members: storeMembers } = useFamilyStore();
  const [step, setStep] = useState<OnboardStep>('choice');
  const [flow, setFlow] = useState<FlowType>('create');
  const [displayName, setDisplayName] = useState(
    // Pre-fill from Google display name if available
    auth().currentUser?.displayName?.split(' ')[0] ?? '',
  );
  const [selectedEmoji, setSelectedEmoji] = useState('🦁');
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [childPhotoUri, setChildPhotoUri] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [createdFamilyId, setCreatedFamilyId] = useState('');
  // Add children state
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childEmoji, setChildEmoji] = useState('🐼');
  const [addedChildren, setAddedChildren] = useState<{ name: string; emoji: string }[]>([]);
  const [isAddingChild, setIsAddingChild] = useState(false);

  const uid = user?.id ?? auth().currentUser?.uid ?? '';

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  async function pickPhoto(setUri: (uri: string | null) => void) {
    try {
      let uri: string | null | undefined;

      if (Platform.OS === 'android') {
        uri = await pickImageFromGallerySAF();
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          if (permission.canAskAgain === false) {
            Alert.alert('Permission Needed', 'Please enable photo access in Settings to add a profile photo.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
          } else {
            Alert.alert('Permission Needed', 'Permission is required to select a photo.');
          }
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
        });
        if (result.canceled) return;
        uri = result.assets?.[0]?.uri;
      }

      if (!uri) {
        Alert.alert('No Photo', 'No photo was selected.');
        return;
      }
      setUri(uri);
      Haptics.selectionAsync();
    } catch (err: any) {
      if (__DEV__) console.error('[Onboarding Photo Pick]', err);
      Alert.alert('Error', 'Could not open the photo picker.');
    }
  }

  function handleChoiceCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlow('create');
    setStep('profile');
  }

  function handleChoiceJoin() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlow('join');
    setStep('profile');
  }

  function handleProfileNext() {
    if (!displayName.trim()) {
      Alert.alert('Missing Name', 'Please enter your display name.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(flow === 'create' ? 'family_name' : 'join_code');
  }

  async function handleCreateFamily() {
    if (!familyName.trim()) { Alert.alert('Missing Name', 'Please enter your family name.'); return; }
    if (!uid) return;
    try {
      setIsLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const family = await createFamily(familyName.trim() + ' Family');
      const member = await createMember({
        familyId: family.id,
        userId: uid,
        displayName: displayName.trim(),
        role: 'admin_parent',
        avatarEmoji: selectedEmoji,
        age: age ? parseInt(age, 10) : undefined,
      });
      await upsertNotifConfig(family.id, member.id, {
        enabled: true,
        dailyReminderTime: DEFAULT_EVENING_REMINDER,
        morningReminderTime: DEFAULT_MORNING_REMINDER,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      // Ask for notification permission and schedule the always-on reminders
      // now, so the family is nudged to plan + check off tasks from day one.
      ensureReminders({
        name: displayName.trim(),
        isParent: member.role === 'parent' || member.role === 'admin_parent',
        prompt: true,
      }).catch(() => {});

      if (profilePhotoUri) {
        try {
          const url = await uploadMemberPhoto(profilePhotoUri, family.id, member.id);
          (member as any).photoURL = url;
        } catch (e) {
          if (__DEV__) console.error('[Onboarding Photo Upload]', e);
          // Surface the failure instead of silently dropping the photo — this is
          // why a photo picked during onboarding sometimes "disappeared" and had
          // to be re-added in Settings. The account/profile is already created,
          // so keep going; just tell the user their photo didn't save.
          Alert.alert('Photo not saved', 'Your profile is ready, but the photo upload didn\'t go through. You can add it anytime from Settings → your profile.');
        }
      }

      setGeneratedCode(family.inviteCode);
      setCreatedFamilyId(family.id);
      setFamily(family);
      setMember(member);
      setStep('done');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not create family.');
    } finally {
      setIsLoading(false);
    }
  }

  // Pre-load all family members into the store before entering the app
  // This ensures profile tabs appear immediately without waiting for async fetch
  async function goToApp() {
    try {
      if (createdFamilyId) {
        const allMembers = await getFamilyMembers(createdFamilyId);
        setMembers(allMembers as any);
      }
    } catch { /* silently ignore — home screen will reload anyway */ }
    router.replace('/app/tabs');
  }

  async function handleAddChild() {
    if (!childName.trim()) { Alert.alert('Missing Name', 'Please enter a name for the child.'); return; }
    if (!createdFamilyId) return;
    try {
      setIsAddingChild(true);
      const newChild = await createManagedMember({
        familyId: createdFamilyId,
        displayName: childName.trim(),
        avatarEmoji: childEmoji,
        age: childAge ? parseInt(childAge, 10) : undefined,
      });
      if (childPhotoUri) {
        try {
          const url = await uploadMemberPhoto(childPhotoUri, createdFamilyId, newChild.id);
          (newChild as any).photoURL = url;
        } catch (e) { if (__DEV__) console.error('[Onboarding Child Photo Upload]', e); }
      }
      // Immediately update Zustand store so home screen sees the child without a refetch
      const updatedMembers = [...useFamilyStore.getState().members, newChild];
      setMembers(updatedMembers as any);
      setAddedChildren((prev) => [...prev, { name: childName.trim(), emoji: childEmoji }]);
      setChildName('');
      setChildAge('');
      setChildEmoji('🐼');
      setChildPhotoUri(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not add child profile.');
    } finally {
      setIsAddingChild(false);
    }
  }

  async function handleJoinFamily() {
    if (!inviteCode.trim() || inviteCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-character invite code.');
      return;
    }
    if (!uid) return;
    try {
      setIsLoading(true);
      // NOTE: role is intentionally NOT sent — joinFamily always creates a
      // 'child'; a parent promotes trusted adults later (parent-controlled join).
      const { family, member } = await joinFamily(uid, {
        inviteCode: inviteCode.trim().toUpperCase(),
        displayName: displayName.trim(),
        avatarEmoji: selectedEmoji,
        age: age ? parseInt(age, 10) : undefined,
      });
      await upsertNotifConfig(family.id, member.id, {
        enabled: true,
        dailyReminderTime: DEFAULT_EVENING_REMINDER,
        morningReminderTime: DEFAULT_MORNING_REMINDER,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      // Ask for notification permission and schedule the always-on reminders
      // now, so the family is nudged to plan + check off tasks from day one.
      ensureReminders({
        name: displayName.trim(),
        isParent: member.role === 'parent' || member.role === 'admin_parent',
        prompt: true,
      }).catch(() => {});

      if (profilePhotoUri) {
        try {
          const url = await uploadMemberPhoto(profilePhotoUri, family.id, member.id);
          (member as any).photoURL = url;
        } catch (e) {
          if (__DEV__) console.error('[Onboarding Photo Upload]', e);
          // Surface the failure instead of silently dropping the photo — this is
          // why a photo picked during onboarding sometimes "disappeared" and had
          // to be re-added in Settings. The account/profile is already created,
          // so keep going; just tell the user their photo didn't save.
          Alert.alert('Photo not saved', 'Your profile is ready, but the photo upload didn\'t go through. You can add it anytime from Settings → your profile.');
        }
      }

      setFamily(family);
      setMember(member);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/app/tabs');
    } catch (error: any) {
      Alert.alert('Invalid Code', 'Could not find a family with that invite code.');
    } finally {
      setIsLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // Nested so it captures the themed `styles`.
  function StepHeader({ step, total, onBack }: { step: number; total: number; onBack: () => void }) {
    return (
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={onBack} style={styles.stepBackBtn}>
          <Text style={styles.stepBackText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.stepDots}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.dot, i < step && styles.dotActive]} />
          ))}
        </View>
      </View>
    );
  }

  if (step === 'choice') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.stepEmoji}>👨‍👩‍👧‍👦</Text>
          <Text style={styles.stepTitle}>Welcome to Lootboard!</Text>
          <Text style={styles.stepSubtitle}>Set up your family to get started</Text>
          <TouchableOpacity style={styles.choiceCard} onPress={handleChoiceCreate} activeOpacity={0.85}>
            <Text style={styles.choiceEmoji}>🏠</Text>
            <View style={styles.choiceInfo}>
              <Text style={styles.choiceTitle}>Create a New Family</Text>
              <Text style={styles.choiceDesc}>Start fresh — you&apos;ll get an invite code to share</Text>
            </View>
            <Text style={styles.choiceArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.choiceCard, styles.choiceCardSecondary]} onPress={handleChoiceJoin} activeOpacity={0.85}>
            <Text style={styles.choiceEmoji}>🔗</Text>
            <View style={styles.choiceInfo}>
              <Text style={styles.choiceTitle}>Join Existing Family</Text>
              <Text style={styles.choiceDesc}>Enter an invite code from your family admin</Text>
            </View>
            <Text style={styles.choiceArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'profile') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <StepHeader step={1} total={2} onBack={() => setStep('choice')} />
          <Text style={styles.stepTitle}>Your Profile</Text>
          <Text style={styles.stepSubtitle}>How should your family see you?</Text>
          <Text style={styles.label}>Profile Photo (optional)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm }}>
            <TouchableOpacity onPress={() => pickPhoto(setProfilePhotoUri)} activeOpacity={0.8}>
              {profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={{ width: 64, height: 64, borderRadius: 32 }} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.primary + '44', borderStyle: 'dashed' }}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => pickPhoto(setProfilePhotoUri)} activeOpacity={0.7}>
              <Text style={{ color: colors.textAccent, fontFamily: FontFamily.semiBold, fontSize: FontSize.sm }}>
                {profilePhotoUri ? 'Change Photo' : 'Add Photo'}
              </Text>
            </TouchableOpacity>
            {profilePhotoUri && (
              <TouchableOpacity onPress={() => setProfilePhotoUri(null)} activeOpacity={0.7}>
                <Text style={{ color: colors.textDanger, fontFamily: FontFamily.semiBold, fontSize: FontSize.sm }}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.label}>{profilePhotoUri ? 'Or Pick a Backup Avatar' : 'Pick Your Avatar'}</Text>
          <AvatarPicker value={selectedEmoji} onChange={setSelectedEmoji} />
          <Text style={styles.label}>Display Name</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="e.g. Dad, Mom, Tommy..." placeholderTextColor={colors.textMuted} maxLength={20} />
          {flow === 'join' && (
            <View style={[styles.joinRoleNote, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
              <Text style={styles.joinRoleNoteEmoji}>👋</Text>
              <Text style={[styles.joinRoleNoteText, { color: colors.textSecondary }]}>
                You'll join as a family member. A parent can give you parent access later from the Family screen.
              </Text>
            </View>
          )}
          <Text style={styles.label}>Age (optional)</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="Your age" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={3} />
          {displayName.trim() ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
              <View>
                <Text style={styles.previewName}>{displayName}</Text>
                <Text style={styles.previewRole}>{flow === 'join' ? 'Family member' : 'Admin Parent'}</Text>
              </View>
            </View>
          ) : null}
          <TouchableOpacity style={styles.primaryBtn} onPress={handleProfileNext} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Continue →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'family_name') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <StepHeader step={2} total={2} onBack={() => setStep('profile')} />
          <Text style={styles.stepTitle}>Name Your Family</Text>
          <Text style={styles.stepSubtitle}>This is what everyone in your household will see</Text>
          <Text style={styles.label}>Family Name</Text>
          <TextInput style={styles.input} value={familyName} onChangeText={setFamilyName} placeholder="e.g. The Smiths" placeholderTextColor={colors.textMuted} maxLength={30} autoFocus />
          <Text style={styles.hint}>{"We'll add \"Family\" at the end automatically"}</Text>
          {familyName.trim() ? (
            <View style={styles.familyPreview}>
              <Text style={styles.familyPreviewEmoji}>🏠</Text>
              <Text style={styles.familyPreviewName}>{familyName.trim()} Family</Text>
            </View>
          ) : null}
          <TouchableOpacity style={[styles.primaryBtn, isLoading && { opacity: 0.6 }]} onPress={handleCreateFamily} disabled={isLoading} activeOpacity={0.85}>
            {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>🚀 Create My Family!</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'join_code') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <StepHeader step={2} total={2} onBack={() => setStep('profile')} />
          <Text style={styles.stepTitle}>Enter Invite Code</Text>
          <Text style={styles.stepSubtitle}>Ask your family admin for the 6-character code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={inviteCode} onChangeText={(t) => setInviteCode(t.toUpperCase())}
            placeholder="ABC123" placeholderTextColor={colors.textMuted}
            autoCapitalize="characters" maxLength={6} autoFocus
          />
          <TouchableOpacity style={[styles.primaryBtn, isLoading && { opacity: 0.6 }]} onPress={handleJoinFamily} disabled={isLoading} activeOpacity={0.85}>
            {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>🔗 Join Family!</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.stepEmoji, { textAlign: 'center' }]}>🎉</Text>
          <Text style={styles.stepTitle}>Family Created!</Text>
          <Text style={styles.stepSubtitle}>Your family is ready. Share the invite code or add children now.</Text>
          <View style={styles.inviteCodeCard}>
            <Text style={styles.inviteCodeLabel}>Invite Code (for adults with phones)</Text>
            <Text style={styles.inviteCode}>{generatedCode}</Text>
            <Text style={styles.inviteCodeHint}>Share this so your spouse or older kids can join</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accent, marginTop: Spacing.md }]}
              onPress={() => Share.share({
                message: `Join our family on Lootboard! 🏆\n\nDownload Lootboard and enter invite code: ${generatedCode}\n\nComplete tasks, earn points, and win the week!`,
              })}
            >
              <Text style={styles.primaryBtnText}>📤 Share Invite Code</Text>
            </TouchableOpacity>
          </View>

          {/* Add Children now */}
          <TouchableOpacity
            style={[styles.addChildCta]}
            onPress={() => setStep('add_children')}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 28 }}>👶</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textAccent }}>Add Child Profiles</Text>
              <Text style={{ fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 }}>Kids don't need a phone — you complete tasks on their behalf</Text>
            </View>
            <Text style={{ fontSize: FontSize.lg, color: colors.textAccent }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.md }]} onPress={goToApp} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Skip — Go to App 🏆</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'add_children') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <StepHeader step={3} total={3} onBack={() => setStep('done')} />
          <Text style={styles.stepTitle}>Add Child Profiles</Text>
          <Text style={styles.stepSubtitle}>Children don't need a phone — you switch to their profile on the Home screen to complete tasks for them.</Text>

          {/* Already added */}
          {addedChildren.map((c, i) => (
            <View key={i} style={styles.addedChildRow}>
              <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
              <Text style={{ fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text, flex: 1 }}>{c.name}</Text>
              <Text style={{ fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.success }}>✓ Added</Text>
            </View>
          ))}

          {/* Add another */}
          <Text style={styles.label}>Photo (optional)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm }}>
            <TouchableOpacity onPress={() => pickPhoto(setChildPhotoUri)} activeOpacity={0.8}>
              {childPhotoUri ? (
                <Image source={{ uri: childPhotoUri }} style={{ width: 64, height: 64, borderRadius: 32 }} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.primary + '44', borderStyle: 'dashed' }}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => pickPhoto(setChildPhotoUri)} activeOpacity={0.7}>
              <Text style={{ color: colors.textAccent, fontFamily: FontFamily.semiBold, fontSize: FontSize.sm }}>
                {childPhotoUri ? 'Change Photo' : 'Add Photo'}
              </Text>
            </TouchableOpacity>
            {childPhotoUri && (
              <TouchableOpacity onPress={() => setChildPhotoUri(null)} activeOpacity={0.7}>
                <Text style={{ color: colors.textDanger, fontFamily: FontFamily.semiBold, fontSize: FontSize.sm }}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.label}>{childPhotoUri ? 'Or Pick a Backup Avatar' : 'Pick Avatar'}</Text>
          <AvatarPicker value={childEmoji} onChange={setChildEmoji} />
          <Text style={styles.label}>Child's Name *</Text>
          <TextInput style={styles.input} value={childName} onChangeText={setChildName} placeholder="e.g. Tommy, Emma..." placeholderTextColor={colors.textMuted} maxLength={20} />
          <Text style={styles.label}>Age (optional)</Text>
          <TextInput style={styles.input} value={childAge} onChangeText={setChildAge} placeholder="e.g. 8" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={2} />

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.success }, isAddingChild && { opacity: 0.6 }]}
            onPress={handleAddChild}
            disabled={isAddingChild}
          >
            {isAddingChild
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.primaryBtnText}>➕ Add This Child</Text>}
          </TouchableOpacity>

          {addedChildren.length > 0 && (
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.sm }]} onPress={goToApp} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Done — Go to App 🏆</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ marginTop: Spacing.md, alignItems: 'center' }} onPress={goToApp}>
            <Text style={{ fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textMuted }}>Skip — I'll add children later</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  scrollContent: { flexGrow: 1, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  stepEmoji: { fontSize: 56, marginBottom: Spacing.md },
  stepTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center', marginBottom: Spacing.xs },
  stepSubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  stepBackBtn: { minHeight: 44, justifyContent: 'center' },
  stepBackText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.textAccent },
  stepDots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.text, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md,
    fontFamily: FontFamily.regular, color: colors.text, backgroundColor: colors.surface,
  },
  codeInput: { fontSize: 32, fontFamily: FontFamily.extraBold, textAlign: 'center', letterSpacing: 8, paddingVertical: Spacing.lg },
  hint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textMuted, marginTop: 4 },
  emojiScroll: { marginBottom: Spacing.md },
  emojiRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  emojiOption: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  emojiSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight + '33' },
  emojiText: { fontSize: 28 },
  joinRoleNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  joinRoleNoteEmoji: { fontSize: 22 },
  joinRoleNoteText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 19 },
  previewCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.sm, borderWidth: 2, borderColor: colors.primary + '44' },
  previewEmoji: { fontSize: 40 },
  previewName: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: colors.text },
  previewRole: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary, textTransform: 'capitalize' },
  familyPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.primaryLight + '22', borderRadius: BorderRadius.lg, padding: Spacing.md, marginVertical: Spacing.md, borderWidth: 1.5, borderColor: colors.primary + '44' },
  familyPreviewEmoji: { fontSize: 28 },
  familyPreviewName: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: colors.textAccent },
  inviteCodeCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', width: '100%', marginVertical: Spacing.xl, ...Shadow.lg, borderWidth: 2, borderColor: colors.primary + '44' },
  inviteCodeLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginBottom: Spacing.sm },
  inviteCode: { fontSize: 42, fontFamily: FontFamily.black, color: colors.textAccent, letterSpacing: 8 },
  inviteCodeHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg, width: '100%', marginBottom: Spacing.md, ...Shadow.md, borderWidth: 1.5, borderColor: colors.border },
  choiceCardSecondary: { borderColor: colors.accent + '66' },
  choiceEmoji: { fontSize: 36 },
  choiceInfo: { flex: 1 },
  choiceTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.text },
  choiceDesc: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  choiceArrow: { fontSize: FontSize.xl, color: colors.textAccent },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.lg, width: '100%', ...Shadow.lg },
  primaryBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF', letterSpacing: 0.5 },
  addChildCta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: colors.primary + '10', borderRadius: BorderRadius.lg, padding: Spacing.md, marginTop: Spacing.md, borderWidth: 2, borderColor: colors.primary + '44' },
  addedChildRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: colors.success + '10', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.success + '44' },
  });
}

