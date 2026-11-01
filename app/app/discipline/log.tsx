import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sounds } from '@/lib/sounds';
import {
  addPointTransaction, getFamilyMembers,
  getActivePenalties, createPenalty, materializeStarterPresets,
} from '@/lib/firebase';
import { useAuthStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { STARTER_PENALTIES, STARTER_BONUSES } from '@/constants/presets';
import type { MemberDoc, PenaltyDoc } from '@/lib/firebase';

export default function DisciplineLogScreen() {
  const { member, family } = useAuthStore();
  const { members, setMembers } = useFamilyStore();
  const { colors } = useTheme();
  // Optional deep-link param: pre-select this member (from member profile / leaderboard row).
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();

  const [selectedMember, setSelectedMember] = useState<MemberDoc | null>(null);
  const [reason, setReason] = useState('');
  const [pointDelta, setPointDelta] = useState<number>(10);
  const [isBonus, setIsBonus] = useState(false);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [penalties, setPenalties] = useState<PenaltyDoc[]>([]);
  const [showAddPenalty, setShowAddPenalty] = useState(false);

  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';

  useEffect(() => {
    if (!family?.id) return;
    if (members.length === 0) getFamilyMembers(family.id).then((list) => setMembers(list as any));
    loadPenalties();
  }, [family?.id]);

  async function loadPenalties() {
    if (!family?.id) return;
    try {
      setPenalties(await getActivePenalties(family.id));
    } catch { /* non-fatal — fall back to defaults */ }
  }

  // Presets shown: the family's own list of each kind if it has one, else the
  // starter list. Everything is editable from Family → Penalties & bonuses
  // (long-press here jumps straight to that preset's editor).
  const ownPenalties = penalties.filter((p) => (p.kind ?? 'penalty') === 'penalty');
  const ownBonuses = penalties.filter((p) => p.kind === 'bonus');
  const penaltyPresets = ownPenalties.length > 0
    ? ownPenalties.map((p) => ({ id: p.id, title: p.title, points: p.points, emoji: p.emoji ?? '⚠️', custom: true }))
    : STARTER_PENALTIES.map((p) => ({ id: p.title, title: p.title, points: p.points, emoji: p.emoji, custom: false }));
  const bonusPresets = ownBonuses.length > 0
    ? ownBonuses.map((p) => ({ id: p.id, title: p.title, points: p.points, emoji: p.emoji ?? '⭐', custom: true }))
    : STARTER_BONUSES.map((p) => ({ id: p.title, title: p.title, points: p.points, emoji: p.emoji, custom: false }));

  function editPreset(p: { id: string; custom: boolean }) {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: '/app/manage/[kind]' as any, params: { kind: 'penalties', ...(p.custom ? { edit: p.id } : {}) } });
  }

  function applyPreset(title: string, points: number, bonus: boolean) {
    Haptics.selectionAsync();
    setReason(title);
    setPointDelta(points);
    setIsBonus(bonus);
  }

  async function handleAddPenalty(title: string, points: number, emoji: string) {
    if (!family?.id || !member?.id) return;
    // Keep the starters: the first custom penalty used to make them vanish.
    await materializeStarterPresets(family.id, 'penalty', STARTER_PENALTIES, member.id);
    await createPenalty({ familyId: family.id, title, points, emoji, createdBy: member.id });
    setShowAddPenalty(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    loadPenalties();
  }

  // Pre-select the member passed via deep link once members are loaded.
  useEffect(() => {
    if (memberId && !selectedMember && members.length > 0) {
      const m = members.find((mm) => mm.id === memberId);
      if (m) setSelectedMember(m as MemberDoc);
    }
  }, [memberId, members, selectedMember]);

  if (!isParent) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.blocked}>
          <Icon name="lock-closed" size={56} color={colors.textMuted} style={{ marginBottom: Spacing.md }} />
          <Text style={[styles.blockedTitle, { color: colors.text }]}>Parents Only</Text>
          <Text style={[styles.blockedSubtitle, { color: colors.textSecondary }]}>Only parents can log discipline events.</Text>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
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
          <ScreenHeader variant="modal" title="Log Discipline Event" />

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
                      <Avatar emoji={m.avatarEmoji} photoURL={m.photoURL} size={36} />
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
                  <Icon name="alert-circle" size={20} color={!isBonus ? '#FFF' : colors.danger} />
                  <Text style={[styles.typeLabel, { color: !isBonus ? '#FFF' : colors.text }]}>Penalty</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeChip, { backgroundColor: colors.surface, borderColor: colors.border },
                  isBonus && { backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => setIsBonus(true)}>
                  <Icon name="star" size={20} color={isBonus ? '#FFF' : colors.success} />
                  <Text style={[styles.typeLabel, { color: isBonus ? '#FFF' : colors.text }]}>Bonus</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Reasons — bonuses are built-in; penalties are your list */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                3. {isBonus ? 'Quick Bonuses' : 'Your Penalties'}
              </Text>
              {isBonus ? (
                <>
                  <View style={styles.reasonGrid}>
                    {bonusPresets.map((p) => {
                      const isSelected = reason === p.title && isBonus;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.reasonChip, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}
                          onPress={() => applyPreset(p.title, p.points, true)}
                          onLongPress={() => editPreset(p)}
                          delayLongPress={350}
                        >
                          <Text style={[styles.reasonChipText, { color: colors.text }]}>{p.emoji} {p.title}</Text>
                          <Text style={[styles.reasonChipPoints, { color: colors.success }]}>+{p.points} pts</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.penaltyHint, { color: colors.textMuted }]}>Long-press a bonus to edit it.</Text>
                </>
              ) : (
                <>
                  <View style={styles.reasonGrid}>
                    {penaltyPresets.map((p) => {
                      const isSelected = reason === p.title && !isBonus;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.reasonChip, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}
                          onPress={() => applyPreset(p.title, p.points, false)}
                          onLongPress={() => editPreset(p)}
                          delayLongPress={350}
                        >
                          <Text style={[styles.reasonChipText, { color: colors.text }]}>{p.emoji} {p.title}</Text>
                          <Text style={[styles.reasonChipPoints, { color: colors.textDanger }]}>-{p.points} pts</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.reasonChip, styles.addPenaltyChip, { borderColor: colors.primary }]}
                      onPress={() => setShowAddPenalty(true)}
                    >
                      <Icon name="add-circle" size={18} color={colors.primary} />
                      <Text style={[styles.reasonChipText, { color: colors.textAccent, marginTop: 2 }]}>Add penalty</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.penaltyHint, { color: colors.textMuted }]}>Long-press a penalty to edit or remove it.</Text>
                </>
              )}
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
                : (
                  <View style={styles.submitBtnInner}>
                    <Icon name={isBonus ? 'star' : 'alert-circle'} size={18} color="#FFF" />
                    <Text style={styles.submitBtnText}>{isBonus ? 'Award Bonus' : 'Apply Penalty'}</Text>
                  </View>
                )
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showAddPenalty && (
        <AddPenaltyModal
          colors={colors}
          onClose={() => setShowAddPenalty(false)}
          onCreate={handleAddPenalty}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Add Penalty modal ────────────────────────────────────────────────────────
function AddPenaltyModal({ colors, onClose, onCreate }: {
  colors: any; onClose: () => void; onCreate: (title: string, points: number, emoji: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(10);
  const [emoji, setEmoji] = useState('⚠️');
  const [saving, setSaving] = useState(false);
  const EMOJIS = ['⚠️', '😤', '🗣️', '🕐', '📵', '🧹', '💥', '🚫'];

  async function submit() {
    if (!title.trim()) { Alert.alert('Enter a name', 'Please name this penalty.'); return; }
    try { setSaving(true); await onCreate(title.trim(), points, emoji); }
    catch { Alert.alert('Error', 'Could not add penalty.'); setSaving(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Penalty ⚠️</Text>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Icon</Text>
            <View style={styles.emojiRow}>
              {EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiOpt, { borderColor: colors.border }, emoji === e && { borderColor: colors.primary, backgroundColor: colors.primary + '20' }]}
                  onPress={() => { setEmoji(e); Haptics.selectionAsync(); }}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Left room messy"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              autoFocus
            />

            <Text style={[styles.modalLabel, { color: colors.text }]}>Points deducted</Text>
            <View style={styles.pointsRow}>
              {[5, 10, 15, 20, 25, 30, 50].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.pointsChip, { backgroundColor: colors.surface, borderColor: colors.border }, points === val && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                  onPress={() => { setPoints(val); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.pointsChipText, { color: points === val ? '#FFF' : colors.text }]}>{val}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.danger }, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Add Penalty</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  typeLabel: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reasonChip: { borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1.5 },
  reasonChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  reasonChipPoints: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, marginTop: 2 },
  addPenaltyChip: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', minWidth: 110 },
  penaltyHint: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: Spacing.sm, fontStyle: 'italic' },
  input: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  pointsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pointsChip: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  pointsChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold },
  preview: { marginTop: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5 },
  previewText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 22 },
  submitBtn: { borderRadius: BorderRadius.md, paddingVertical: 18, alignItems: 'center', marginTop: Spacing.sm, ...Shadow.md },
  submitBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF', letterSpacing: 0.5 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  blockedTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.extraBold },
  blockedSubtitle: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: 8 },
  backBtn: { marginTop: Spacing.xl, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: 14 },
  backBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
  // Add-penalty modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, marginBottom: Spacing.md, textAlign: 'center' },
  modalLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginBottom: 6, marginTop: Spacing.sm },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emojiOpt: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  saveBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFF' },
});
