/**
 * reward/packs.tsx — starter reward-pack picker (companion to task/packs).
 * Stocks the rewards store with age-neutral presets in one tap. Rewards are
 * pre-selected; deselect any you don't want, then add the rest.
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import { createRewardsFromPack } from '@/lib/firebase';
import { REWARD_PACKS } from '@/constants/rewardPacks';
import type { PackReward } from '@/constants/rewardPacks';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

const key = (packId: string, i: number) => `${packId}:${i}`;

export default function RewardPacksScreen() {
  const { family, member } = useAuthStore();
  const { colors } = useTheme();

  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [applyingPack, setApplyingPack] = useState<string | null>(null);

  const toggle = (k: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
    Haptics.selectionAsync();
  };

  const selectedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pack of REWARD_PACKS) {
      counts[pack.id] = pack.rewards.filter((_, i) => !deselected.has(key(pack.id, i))).length;
    }
    return counts;
  }, [deselected]);

  async function applyPack(packId: string, rewards: PackReward[]) {
    if (!family?.id || !member?.id) return;
    const rows = rewards
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !deselected.has(key(packId, i)))
      .map(({ r }) => ({ title: r.title, pointCost: r.pointCost, icon: r.icon }));
    if (rows.length === 0) { Alert.alert('Nothing selected', 'Pick at least one reward to add.'); return; }
    try {
      setApplyingPack(packId);
      await createRewardsFromPack(family.id, member.id, rows);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Added! 🎉', `${rows.length} reward${rows.length > 1 ? 's' : ''} added to your store.`, [
        { text: 'Great', onPress: () => router.back() },
      ]);
    } catch (e) {
      if (__DEV__) console.error('[RewardPacks] apply failed', e);
      Alert.alert('Error', 'Could not add these rewards. Please try again.');
    } finally {
      setApplyingPack(null);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.back, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Reward Packs</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Stock your rewards store in one tap. Tap any reward to include or skip it — you can edit or delete them later.
        </Text>

        {REWARD_PACKS.map((pack) => (
          <View key={pack.id} style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
            <View style={styles.cardHead}>
              <Text style={styles.packEmoji}>{pack.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.packName, { color: colors.text }]}>{pack.name}</Text>
                <Text style={[styles.packBlurb, { color: colors.textSecondary }]}>{pack.blurb}</Text>
              </View>
            </View>

            <View style={styles.list}>
              {pack.rewards.map((r, i) => {
                const k = key(pack.id, i);
                const on = !deselected.has(k);
                return (
                  <TouchableOpacity key={k} style={styles.row} onPress={() => toggle(k)} activeOpacity={0.7}>
                    <View style={[styles.checkbox, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
                      {on && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.rewardIcon}>{r.icon}</Text>
                    <Text style={[styles.rewardTitle, { color: colors.text }, !on && { opacity: 0.4, textDecorationLine: 'line-through' }]} numberOfLines={1}>{r.title}</Text>
                    <Text style={[styles.rewardCost, { color: colors.primary }]}>{r.pointCost} pts</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: selectedCount[pack.id] > 0 ? colors.primary : colors.border }]}
              onPress={() => applyPack(pack.id, pack.rewards)}
              disabled={applyingPack !== null || selectedCount[pack.id] === 0}
              activeOpacity={0.85}
            >
              {applyingPack === pack.id
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.addBtnText}>＋ Add {selectedCount[pack.id]} reward{selectedCount[pack.id] === 1 ? '' : 's'}</Text>}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  back: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  headerTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 20, marginBottom: Spacing.lg },
  card: { borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  packEmoji: { fontSize: 34 },
  packName: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold },
  packBlurb: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },
  list: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFF', fontSize: 14, fontFamily: FontFamily.bold },
  rewardIcon: { fontSize: 20 },
  rewardTitle: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  rewardCost: { fontSize: FontSize.sm, fontFamily: FontFamily.extraBold },
  addBtn: { borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: '#FFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
});
