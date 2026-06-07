/**
 * app/app/member/add-child.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal screen — parent creates a managed child profile (no phone / Auth account
 * needed).  After saving, the child appears in the leaderboard, can be assigned
 * tasks, and the parent can "act as" them from the Home screen to mark tasks
 * done on their behalf.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { createManagedMember } from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow, AVATAR_EMOJIS } from '@/constants/theme';

export default function AddChildScreen() {
  const { family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();

  const [displayName, setDisplayName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🦊');
  const [age, setAge] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSave() {
    if (!displayName.trim()) {
      Alert.alert('Missing Name', "Please enter the child's name.");
      return;
    }
    if (!family?.id) return;

    try {
      setIsLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const newMember = await createManagedMember({
        familyId: family.id,
        displayName: displayName.trim(),
        avatarEmoji: selectedEmoji,
        age: age ? parseInt(age, 10) : undefined,
      });

      // Update local members list so leaderboard / switcher reflects change immediately
      setMembers([...members, newMember as any]);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '👶 Child Added!',
        `${displayName.trim()} has been added to your family.\n\nYou can now switch to their profile from the Home screen to complete tasks on their behalf.`,
        [{ text: 'Great!', onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not add child. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Handle bar (modal presentation) */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.emoji}>👶</Text>
            <Text style={styles.title}>Add a Child Profile</Text>
            <Text style={styles.subtitle}>
              No phone needed — you can complete tasks on their behalf from your Home screen.
            </Text>
          </View>

          {/* Avatar picker */}
          <Text style={styles.label}>Pick an Avatar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
            <View style={styles.emojiRow}>
              {AVATAR_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiOption, selectedEmoji === emoji && styles.emojiSelected]}
                  onPress={() => { setSelectedEmoji(emoji); Haptics.selectionAsync(); }}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Name */}
          <Text style={styles.label}>{"Child's Name"}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Tommy, Emma..."
            placeholderTextColor={Colors.textMuted}
            maxLength={20}
            autoFocus
          />

          {/* Age */}
          <Text style={styles.label}>Age (optional)</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder="e.g. 8"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={2}
          />

          {/* Live preview card */}
          {displayName.trim() ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewAvatar}>{selectedEmoji}</Text>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName}>{displayName.trim()}</Text>
                <Text style={styles.previewRole}>
                  👶 Managed child{age ? ` • Age ${age}` : ''}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Info box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>How this works</Text>
            <Text style={styles.infoText}>
              • {displayName.trim() || 'The child'} will appear on the leaderboard and can be assigned tasks.{'\n'}
              • From the Home screen, tap the profile banner to switch to their view.{'\n'}
              • When you mark a task done in their view, points go to them.{'\n'}
              • If they get a phone later, they can claim this profile by joining with your invite code.
            </Text>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, isLoading && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.saveBtnText}>Add {displayName.trim() || 'Child'} to Family 🎉</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.lg },
  emoji: { fontSize: 56 },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold, color: Colors.text, marginTop: Spacing.sm, textAlign: 'center' },
  subtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: 6 },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.text, marginTop: Spacing.md, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md, fontFamily: FontFamily.regular, color: Colors.text,
    backgroundColor: Colors.surface,
  },
  emojiScroll: { marginBottom: Spacing.xs },
  emojiRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  emojiOption: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.border,
  },
  emojiSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  emojiText: { fontSize: 28 },
  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginTop: Spacing.md,
    borderWidth: 2, borderColor: Colors.primary + '44', ...Shadow.sm,
  },
  previewAvatar: { fontSize: 40 },
  previewInfo: {},
  previewName: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, color: Colors.text },
  previewRole: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2 },
  infoBox: {
    backgroundColor: Colors.primary + '0F', borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.primary + '33',
  },
  infoTitle: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: Colors.primary, marginBottom: 6 },
  infoText: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.text, lineHeight: 20 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.xl, ...Shadow.lg,
  },
  saveBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF', letterSpacing: 0.5 },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.xs },
  cancelBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: Colors.textSecondary },
});

