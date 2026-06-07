import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sounds } from '@/lib/sounds';
import { addPointTransaction, getFamilyMembers } from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import type { MemberDoc } from '@/lib/firebase';

const QUICK_REASONS = [
  { label: '😤 Talked Back', delta: -15, type: 'penalty' },
  { label: '🕐 Not Following Schedule', delta: -10, type: 'penalty' },
  { label: '🗣️ Disrespectful', delta: -20, type: 'penalty' },
  { label: '🤝 Helped Without Being Asked', delta: +20, type: 'bonus' },
  { label: '⭐ Exceptional Behavior', delta: +30, type: 'bonus' },
  { label: '📖 Read for 30 Minutes', delta: +15, type: 'bonus' },
  { label: '🎯 Completed All Tasks Early', delta: +25, type: 'bonus' },
  { label: '😊 Great Attitude', delta: +10, type: 'bonus' },
];

export default function DisciplineLogScreen() {
  const { member, family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const { colors } = useTheme();

  const [selectedMember, setSelectedMember] = useState<MemberDoc | null>(null);
  const [reason, setReason] = useState('');
  const [pointDelta, setPointDelta] = useState<number>(10);
  const [isBonus, setIsBonus] = useState(false);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  useEffect(() => {
    if (!family?.id || members.length > 0) return;
    getFamilyMembers(family.id).then((list) => setMembers(list as any));
  }, [family?.id]);

  if (!isParent) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.blocked}>
          <Text style={styles.blockedEmoji}>🔒</Text>
          <Text style={[styles.blockedTitle, { color: colors.text }]}>Parents Only</Text>
          <Text style={[styles.blockedSubtitle, { color: colors.textSecondary }]}>Only parents can log discipline events.</Text>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function handleQuickReason(preset: typeof QUICK_REASONS[0]) {
    Haptics.selectionAsync();
    setReason(preset.label.replace(/^[^\s]+\s/, ''));
    setPointDelta(Math.abs(preset.delta));
    setIsBonus(preset.type === 'bonus');
  }

  async function handleSubmit() {
    if (!selectedMember) { Alert.alert('Select Member', 'Please select a family member.'); return; }
    if (!reason.trim()) { Alert.alert('Enter Reason', 'Please enter or select a reason.'); return; }
    if (!pointDelta || pointDelta <= 0) { Alert.alert('Enter Points', 'Please enter a valid point amount.'); return; }
    if (!family?.id || !member?.id) return;

    const finalDelta = isBonus ? Math.abs(pointDelta) : -Math.abs(pointDelta);
    const fullReason = note.trim()
      ? `${isBonus ? 'Bonus' : 'Penalty'}: ${reason.trim()} — ${note.trim()}`
      : `${isBonus ? 'Bonus' : 'Penalty'}: ${reason.trim()}`;

    Alert.alert(
      `${isBonus ? '🌟 Bonus' : '⚠️ Penalty'} for ${selectedMember.displayName}`,
      `${reason}\n\n${isBonus ? '+' : ''}${finalDelta} points${note ? `\n\nNote: ${note}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Log',
          onPress: async () => {
            try {
              setIsLoading(true);
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              await addPointTransaction({
                familyId: family.id,
                memberId: selectedMember.id,
                delta: finalDelta,
                reason: fullReason,
                source: 'discipline',
              });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (finalDelta < 0) Sounds.penalty(); else Sounds.levelUp();
              Alert.alert(
                'Logged! ✅',
                `${finalDelta > 0 ? '+' : ''}${finalDelta} points applied to ${selectedMember.displayName}`,
                [{ text: 'Done', onPress: () => router.back() }],
              );
            } catch (error) {
              Alert.alert('Error', 'Could not log discipline event.');
              if (__DEV__) console.error(error);
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  }

  const targetMembers = members.filter((m) => m.id !== member?.id);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.backText, { color: colors.primary }]}>← Back</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Log Discipline Event</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.content}>
            {/* Select Member */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>1. Select Family Member</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.memberRow}>
                  {targetMembers.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.memberChip, { backgroundColor: colors.surface, borderColor: colors.border },
                        selectedMember?.id === m.id && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
                      onPress={() => { setSelectedMember(m); Haptics.selectionAsync(); }}
                    >
                      <Text style={styles.memberEmoji}>{m.avatarEmoji}</Text>
                      <Text style={[styles.memberName, { color: selectedMember?.id === m.id ? colors.primary : colors.text }]}>
                        {m.displayName.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Type */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>2. Type</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity style={[styles.typeChip, { backgroundColor: colors.surface, borderColor: colors.border },
                  !isBonus && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                  onPress={() => setIsBonus(false)}>
                  <Text style={styles.typeEmoji}>⚠️</Text>
                  <Text style={[styles.typeLabel, { color: !isBonus ? '#FFF' : colors.text }]}>Penalty</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeChip, { backgroundColor: colors.surface, borderColor: colors.border },
                  isBonus && { backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => setIsBonus(true)}>
                  <Text style={styles.typeEmoji}>⭐</Text>
                  <Text style={[styles.typeLabel, { color: isBonus ? '#FFF' : colors.text }]}>Bonus</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Reasons */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>3. Quick Reasons</Text>
              <View style={styles.reasonGrid}>
                {QUICK_REASONS.filter((r) => (isBonus ? r.type === 'bonus' : r.type === 'penalty')).map((preset) => {
                  const isSelected = reason === preset.label.replace(/^[^\s]+\s/, '');
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.reasonChip, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}
                      onPress={() => handleQuickReason(preset)}
                    >
                      <Text style={[styles.reasonChipText, { color: colors.text }]}>{preset.label}</Text>
                      <Text style={[styles.reasonChipPoints, { color: isBonus ? colors.success : colors.danger }]}>
                        {preset.delta > 0 ? '+' : ''}{preset.delta} pts
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Custom Reason */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Or Custom Reason</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={reason}
                onChangeText={setReason}
                placeholder="Describe what happened..."
                placeholderTextColor={colors.textMuted}
                maxLength={100}
              />
            </View>

            {/* Points */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Points {isBonus ? 'Awarded' : 'Deducted'}</Text>
              <View style={styles.pointsRow}>
                {[5, 10, 15, 20, 25, 30, 50].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.pointsChip, { backgroundColor: colors.surface, borderColor: colors.border },
                      pointDelta === val && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => { setPointDelta(val); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.pointsChipText, { color: pointDelta === val ? '#FFF' : colors.text }]}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {reason.trim() && pointDelta > 0 && (
                <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: isBonus ? colors.success : colors.danger }]}>
                  <Text style={[styles.previewText, { color: colors.text }]}>
                    {selectedMember?.displayName ?? 'Member'} will {isBonus ? 'gain' : 'lose'}{' '}
                    <Text style={{ color: isBonus ? colors.success : colors.danger, fontFamily: FontFamily.extraBold }}>
                      {isBonus ? '+' : '-'}{pointDelta} pts
                    </Text>
                    {` for "${reason}"`}
                  </Text>
                </View>
              )}
            </View>

            {/* Note */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Additional Note (optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={note}
                onChangeText={setNote}
                placeholder="Add context for the family record..."
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={200}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: isBonus ? colors.success : colors.danger }, isLoading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.submitBtnText}>{isBonus ? '⭐ Award Bonus' : '⚠️ Apply Penalty'}</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  backText: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  headerTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  section: { marginBottom: Spacing.lg },
  sectionLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, marginBottom: Spacing.sm },
  memberRow: { flexDirection: 'row', gap: Spacing.sm },
  memberChip: { alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 2, minWidth: 70 },
  memberEmoji: { fontSize: 36, marginBottom: 4 },
  memberName: { fontSize: FontSize.xs, fontFamily: FontFamily.bold },
  typeRow: { flexDirection: 'row', gap: Spacing.md },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 2 },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reasonChip: { borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1.5 },
  reasonChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  reasonChipPoints: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, marginTop: 2 },
  input: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  pointsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pointsChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  pointsChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold },
  preview: { marginTop: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5 },
  previewText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 22 },
  submitBtn: { borderRadius: BorderRadius.md, paddingVertical: 18, alignItems: 'center', marginTop: Spacing.sm, ...Shadow.md },
  submitBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF', letterSpacing: 0.5 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  blockedEmoji: { fontSize: 64, marginBottom: Spacing.md },
  blockedTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  blockedSubtitle: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: 8 },
  backBtn: { marginTop: Spacing.xl, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: 14 },
  backBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
});
