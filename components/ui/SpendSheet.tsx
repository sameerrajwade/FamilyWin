/**
 * components/ui/SpendSheet.tsx — "Spend points" in Kid Mode (UX review
 * 2026-11-02: kids couldn't ask for a reward on a parent's phone).
 * Lists the family's rewards; the ones the kid can afford can be asked for
 * (a pending request a grown-up approves — it shows up in Approvals). The price
 * is locked at request time, exactly like the Rewards tab.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getActiveRewards, requestRedemption, type RewardDoc } from '@/lib/firebase';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

export function SpendSheet({ visible, onClose, familyId, kid, spendable, colors }: {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  kid: { id: string; displayName?: string };
  spendable: number;
  colors: any;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rewards, setRewards] = useState<RewardDoc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const first = (kid.displayName ?? 'You').split(' ')[0];

  useEffect(() => {
    if (!visible) return;
    getActiveRewards(familyId).then((r) => setRewards([...r].sort((a, b) => a.pointCost - b.pointCost))).catch(() => setRewards([]));
  }, [visible, familyId]);

  async function ask(r: RewardDoc) {
    if (busy) return;
    setBusy(r.id);
    try {
      await requestRedemption({ familyId, rewardId: r.id, memberId: kid.id, pointCost: r.pointCost, rewardTitle: r.title });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
      Alert.alert('Asked! 🎁', `A grown-up will see “${r.title}” in Approvals. Points are only spent when they say yes.`);
    } catch {
      Alert.alert('That didn’t work', 'Could not send the request. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Spend your points</Text>
          <Text style={styles.sub}>{first} has <Text style={{ fontFamily: FontFamily.black }}>{spendable}</Text> points to spend.</Text>
          {rewards === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.lg }} />
          ) : rewards.length === 0 ? (
            <Text style={styles.sub}>No rewards yet — ask a grown-up to add some.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {rewards.map((r) => {
                const can = spendable >= r.pointCost;
                return (
                  <View key={r.id} style={[styles.row, !can && { opacity: 0.5 }]}>
                    <EmojiIcon emoji={(r as any).icon ?? '🎁'} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.rCost}>{can ? `${r.pointCost} points` : `${r.pointCost - spendable} more points to go`}</Text>
                    </View>
                    {can && (
                      <TouchableOpacity style={styles.ask} onPress={() => ask(r)} disabled={!!busy}
                        accessibilityRole="button" accessibilityLabel={`Ask for ${r.title}`}>
                        {busy === r.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.askText}>Ask</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(10,8,20,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
    title: { fontSize: FontSize.xl, fontFamily: FontFamily.black, color: colors.text },
    sub: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.textSecondary },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    rCost: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
    ask: { backgroundColor: colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 9, minWidth: 64, alignItems: 'center' },
    askText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.sm },
    close: { alignSelf: 'center', paddingVertical: Spacing.sm },
    closeText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: colors.textSecondary },
  });
}
