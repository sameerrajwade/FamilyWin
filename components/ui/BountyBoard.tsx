/**
 * components/ui/BountyBoard.tsx — the bounty board (Phase E4)
 * ─────────────────────────────────────────────────────────────────────────────
 * "First to wash the car +100." Shown under today's tasks (Today + Kid Mode).
 *   • Parents post bounties (composer), approve or say "not yet" to a claim,
 *     and remove bounties (long-press).
 *   • Everyone else taps "I did it!" on an open bounty → it's theirs, waiting
 *     for a parent's OK (they can take the claim back while it waits).
 *   • A parent marking it done on a kid's behalf (profile switched to the kid)
 *     awards it straight away, like completing a task for them.
 * Won bounties stay up for a day ("🏆 Vian won it"). Data: lib/bounties.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { Sounds } from '@/lib/sounds';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { detectTaskEmoji } from '@/lib/taskEmoji';
import { visibleBounties, canClaimBounty } from '@/lib/familyGame';
import {
  watchBounties, postBounty, claimBounty, releaseBounty, awardBounty, deleteBounty,
  BountyTakenError, type BountyDoc,
} from '@/lib/bounties';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

const POINT_CHOICES = [25, 50, 100, 200];

export function BountyBoard({
  familyId, actor, viewerId, canManage, needsOk, members, style, composeNonce = 0,
}: {
  /** Bump to open the "post a bounty" composer from outside (Today's + button). */
  composeNonce?: number;
  familyId?: string;
  /** Who would claim it: the profile on screen (a kid in Kid Mode). */
  actor?: { id: string; displayName?: string } | null;
  /** The signed-in person (their own posts can't be claimed by them). */
  viewerId?: string;
  /** Parent controls: post, approve, not yet, remove. Off in Kid Mode. */
  canManage: boolean;
  /** true → a claim waits for a parent; false → a parent awards it directly. */
  needsOk: boolean;
  members: { id: string; displayName?: string }[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [all, setAll] = useState<BountyDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  useEffect(() => { if (composeNonce > 0) setComposing(true); }, [composeNonce]);

  useEffect(() => {
    if (!familyId) return;
    return watchBounties(familyId, setAll);
  }, [familyId]);

  const list = visibleBounties(all);
  const first = (id?: string | null) => (members.find((m) => m.id === id)?.displayName ?? 'Someone').split(' ')[0];
  const actorIsViewer = !!actor && actor.id === viewerId;

  async function run(id: string, fn: () => Promise<unknown>, ok?: () => void) {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
      ok?.();
    } catch (e) {
      if (e instanceof BountyTakenError) Alert.alert('Too slow!', 'Someone else already claimed this bounty.');
      else Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function claim(b: BountyDoc) {
    if (!familyId || !actor) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (needsOk) {
      run(b.id, () => claimBounty({ familyId, bountyId: b.id, memberId: actor.id }), () => Sounds.taskComplete());
    } else {
      run(b.id, () => awardBounty({ familyId, bountyId: b.id, approvedBy: viewerId ?? actor.id, memberId: actor.id }), () => {
        Sounds.allDone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      });
    }
  }

  function approve(b: BountyDoc) {
    if (!familyId || !viewerId) return;
    run(b.id, () => awardBounty({ familyId, bountyId: b.id, approvedBy: viewerId }), () => {
      Sounds.allDone();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
  }

  function remove(b: BountyDoc) {
    if (!canManage || !familyId) return;
    Alert.alert('Remove bounty?', `"${b.title}" will come off the board.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(b.id, () => deleteBounty({ familyId, bountyId: b.id })) },
    ]);
  }

  if (!familyId) return null;
  if (list.length === 0 && !canManage) return null;
  const composer = canManage && viewerId ? (
    <BountyComposer
      visible={composing}
      onClose={() => setComposing(false)}
      onPost={async (title, points, emoji) => {
        await postBounty({ familyId, title, points, emoji, createdBy: viewerId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }}
      styles={styles}
      colors={colors}
    />
  ) : null;
  // No bounties yet → no empty box on Today (UX review); post from the + button.
  if (list.length === 0) return composer;

  return (
    <View style={style}>
      <View style={styles.headRow}>
        <EmojiIcon emoji="🎯" size={20} />
        <Text style={styles.head}>Bounties</Text>
        <View style={{ flex: 1 }} />
        {canManage && (
          <TouchableOpacity onPress={() => setComposing(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Post a bounty">
            <Text style={styles.postLink}>＋ Post a bounty</Text>
          </TouchableOpacity>
        )}
      </View>

      {list.length === 0 ? (
        <TouchableOpacity style={styles.emptyRow} onPress={() => setComposing(true)} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.emptyText}>First to finish wins — e.g. "Wash the car +100"</Text>
        </TouchableOpacity>
      ) : list.map((b) => {
        const isBusy = busy === b.id;
        const mine = !!actor && b.claimedBy === actor.id;
        return (
          <TouchableOpacity
            key={b.id}
            activeOpacity={1}
            onLongPress={canManage ? () => remove(b) : undefined}
            style={[styles.card, b.status === 'done' && styles.cardDone, b.status === 'claimed' && styles.cardClaimed]}
          >
            <EmojiIcon emoji={b.emoji || '🎯'} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>{b.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {b.status === 'open' && `+${b.points} pts · first to finish wins`}
                {b.status === 'claimed' && (mine ? `⏳ Waiting for a grown-up's OK · +${b.points}` : `⏳ ${first(b.claimedBy)} says it's done · +${b.points}`)}
                {b.status === 'done' && `🏆 ${first(b.claimedBy)} won +${b.points}`}
              </Text>
            </View>

            {isBusy ? <ActivityIndicator color={colors.primary} /> : (
              <>
                {b.status === 'open' && actor && canClaimBounty(b, actor.id) && (
                  <TouchableOpacity style={styles.claimBtn} onPress={() => claim(b)} accessibilityRole="button"
                    accessibilityLabel={`${actorIsViewer ? 'I did' : `${first(actor.id)} did`} ${b.title}`}>
                    <Text style={styles.claimText}>{actorIsViewer || needsOk ? 'I did it!' : `${first(actor.id)} did it`}</Text>
                  </TouchableOpacity>
                )}
                {b.status === 'claimed' && canManage && (
                  <View style={styles.decideRow}>
                    <TouchableOpacity style={styles.notYetBtn} onPress={() => run(b.id, () => releaseBounty({ familyId, bountyId: b.id }))}
                      accessibilityRole="button" accessibilityLabel={`Not yet: ${b.title}`}>
                      <Text style={styles.notYetText}>Not yet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => approve(b)}
                      accessibilityRole="button" accessibilityLabel={`Approve ${b.title} for ${first(b.claimedBy)}`}>
                      <Text style={styles.approveText}>✓ OK</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {b.status === 'claimed' && !canManage && mine && (
                  <TouchableOpacity style={styles.notYetBtn} onPress={() => run(b.id, () => releaseBounty({ familyId, bountyId: b.id }))}
                    accessibilityRole="button" accessibilityLabel={`Take back my claim on ${b.title}`}>
                    <Text style={styles.notYetText}>Undo</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </TouchableOpacity>
        );
      })}

      {composer}
    </View>
  );
}

function BountyComposer({ visible, onClose, onPost, styles, colors }: {
  visible: boolean; onClose: () => void;
  onPost: (title: string, points: number, emoji: string) => Promise<void>;
  styles: ReturnType<typeof createStyles>; colors: ThemeColors;
}) {
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(100);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const emoji = title.trim() ? detectTaskEmoji(title, 'chores') : '🎯';
  const finalPoints = custom ? parseInt(custom, 10) : points;
  const valid = title.trim().length >= 2 && Number.isFinite(finalPoints) && finalPoints > 0 && finalPoints <= 10000;

  function reset() { setTitle(''); setPoints(100); setCustom(''); }

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onPost(title, finalPoints, emoji);
      reset();
      onClose();
    } catch {
      Alert.alert('Could not post', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Post a bounty</Text>
          <Text style={styles.sheetSub}>The first person whose claim you OK wins the points.</Text>
          <View style={styles.inputRow}>
            <EmojiIcon emoji={emoji} size={30} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Wash the car"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={60}
              autoFocus
              accessibilityLabel="Bounty title"
            />
          </View>
          <Text style={styles.label}>Points</Text>
          <View style={styles.chips}>
            {POINT_CHOICES.map((p) => {
              const on = !custom && points === p;
              return (
                <TouchableOpacity key={p} style={[styles.chip, on && styles.chipOn]} onPress={() => { setPoints(p); setCustom(''); }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>+{p}</Text>
                </TouchableOpacity>
              );
            })}
            <TextInput
              value={custom}
              onChangeText={(t) => setCustom(t.replace(/[^0-9]/g, ''))}
              placeholder="Other"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[styles.chip, styles.customChip, !!custom && styles.chipOn]}
              maxLength={5}
              accessibilityLabel="Custom points"
            />
          </View>
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.postBtn, !valid && { opacity: 0.45 }]} onPress={submit} disabled={!valid || saving} accessibilityRole="button" accessibilityLabel="Post bounty">
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.postText}>🎯 Post +{Number.isFinite(finalPoints) ? finalPoints : 0}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
    head: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    postLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textAccent },
    emptyRow: { borderRadius: BorderRadius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, padding: Spacing.md },
    emptyText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary, textAlign: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.warning + '66', padding: Spacing.md, marginBottom: Spacing.sm },
    cardClaimed: { borderColor: colors.primary + '66' },
    cardDone: { borderColor: colors.border, opacity: 0.75 },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    meta: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold, color: colors.textSecondary, marginTop: 2 },
    claimBtn: { backgroundColor: colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    claimText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.sm },
    decideRow: { flexDirection: 'row', gap: 6 },
    notYetBtn: { borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: Spacing.sm, paddingVertical: 7 },
    notYetText: { color: colors.textSecondary, fontFamily: FontFamily.bold, fontSize: FontSize.xs },
    approveBtn: { backgroundColor: colors.success, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    approveText: { color: '#1A1830', fontFamily: FontFamily.extraBold, fontSize: FontSize.sm },
    sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
    sheetTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text },
    sheetSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, marginTop: Spacing.sm },
    input: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.text, paddingVertical: 12 },
    label: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: colors.textSecondary, marginTop: Spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: { borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    chipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    chipText: { fontFamily: FontFamily.bold, fontSize: FontSize.sm, color: colors.textSecondary },
    chipTextOn: { color: colors.textAccent },
    customChip: { minWidth: 76, fontFamily: FontFamily.bold, fontSize: FontSize.sm, color: colors.text },
    sheetActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    cancelBtn: { flex: 1, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
    cancelText: { fontFamily: FontFamily.bold, fontSize: FontSize.md, color: colors.textSecondary },
    postBtn: { flex: 2, borderRadius: BorderRadius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
    postText: { fontFamily: FontFamily.extraBold, fontSize: FontSize.md, color: '#FFFFFF' },
  });
}
