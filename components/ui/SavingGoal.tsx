/**
 * components/ui/SavingGoal.tsx — "save for a reward" (Phase E2)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member pins one reward on the Rewards tab (member.savingForRewardId) and
 * then sees how close they are:
 *   <SavingGoalCard> — ring + "N pts to go" at the top of the Rewards tab.
 *   <SavingGoalRow>  — one compact line on Today that listens to the pinned
 *                      reward and fires onAffordable ONCE per device per
 *                      reward when the balance reaches its price.
 * Progress maths lives in lib/familyGame::savingProgress.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Col, type RewardDoc } from '@/lib/firebase';
import { savingProgress } from '@/lib/familyGame';
import { rewardIcon } from '@/lib/rewardIcon';
import { useTheme } from '@/lib/theme';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

export function SavingGoalCard({ reward, spendable, name, onUnpin }: {
  reward: RewardDoc; spendable: number; name?: string; onUnpin?: () => void;
}) {
  const { colors } = useTheme();
  const s = savingProgress(spendable, reward.pointCost);
  const ringColor = s.affordable ? colors.success : colors.primary;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: ringColor + '55' }]}>
      <ProgressRing size={68} stroke={7} segments={[{ value: s.progress, color: ringColor }]}
        accessibilityLabel={`${s.pct} percent saved for ${reward.title}`}>
        <EmojiIcon emoji={rewardIcon(reward)} size={30} />
      </ProgressRing>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color: colors.textAccent }]}>
          {name ? `${name.toUpperCase()} IS SAVING FOR` : 'SAVING FOR'}
        </Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{reward.title}</Text>
        <Text style={[styles.sub, { color: s.affordable ? colors.success : colors.textSecondary }]}>
          {s.affordable ? '🎉 Ready to redeem!' : `${s.pct}% · ${s.remaining} pts to go`}
        </Text>
      </View>
      {onUnpin && (
        <TouchableOpacity onPress={onUnpin} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Stop saving for ${reward.title}`}>
          <Text style={[styles.unpin, { color: colors.textMuted }]}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Today's compact line. Renders nothing until a reward is pinned. */
export function SavingGoalRow({ familyId, memberId, rewardId, spendable, onAffordable, navigate = true, style }: {
  familyId?: string; memberId?: string; rewardId?: string | null; spendable: number;
  onAffordable?: (reward: RewardDoc) => void;
  /** false in Kid Mode, which must not leave its locked screen. */
  navigate?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [reward, setReward] = useState<RewardDoc | null>(null);
  const celebrated = useRef<string | null>(null);

  useEffect(() => {
    setReward(null);
    if (!familyId || !rewardId) return;
    const unsub = Col.rewards(familyId).doc(rewardId).onSnapshot(
      (d) => {
        // v26: DocumentSnapshot.exists is a METHOD (see lib/fb.ts header).
        const data = d.exists() ? d.data() : null;
        // A removed (inactive) reward stops showing rather than nagging forever.
        setReward(data && data.isActive !== false ? ({ id: d.id, ...data } as RewardDoc) : null);
      },
      () => setReward(null),
    );
    return () => unsub();
  }, [familyId, rewardId]);

  const s = reward ? savingProgress(spendable, reward.pointCost) : null;

  useEffect(() => {
    if (!reward || !s?.affordable || !memberId || !onAffordable) return;
    const key = `saving_celebrated_${memberId}_${reward.id}`;
    if (celebrated.current === key) return;
    celebrated.current = key;
    AsyncStorage.getItem(key).then((v) => {
      if (v) return;
      AsyncStorage.setItem(key, '1').catch(() => {});
      onAffordable(reward);
    }).catch(() => {});
  }, [reward?.id, s?.affordable, memberId]);

  if (!reward || !s) return null;
  const ringColor = s.affordable ? colors.success : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: ringColor + '12', borderColor: ringColor + '40' }, style]}
      onPress={navigate ? () => router.push('/app/tabs/rewards' as any) : undefined}
      disabled={!navigate}
      activeOpacity={0.85}
      accessibilityRole={navigate ? 'button' : 'text'}
      accessibilityLabel={s.affordable ? `You can get ${reward.title} now. Open rewards` : `Saving for ${reward.title}, ${s.pct} percent. Open rewards`}
    >
      <ProgressRing size={30} stroke={4} segments={[{ value: s.progress, color: ringColor }]}>
        <EmojiIcon emoji={rewardIcon(reward)} size={14} />
      </ProgressRing>
      <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
        {s.affordable
          ? <>🎉 <Text style={{ fontFamily: FontFamily.extraBold }}>{reward.title}</Text> is yours — redeem it!</>
          : <>Saving for <Text style={{ fontFamily: FontFamily.extraBold }}>{reward.title}</Text> · {s.pct}%</>}
      </Text>
      {!s.affordable && <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{s.remaining} to go</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.md, marginTop: Spacing.md },
  eyebrow: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 1 },
  title: { fontSize: FontSize.lg, fontFamily: FontFamily.extraBold, marginTop: 1 },
  sub: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, marginTop: 2 },
  unpin: { fontSize: 18, fontFamily: FontFamily.bold, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1 },
  rowText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold },
  rowSub: { fontSize: FontSize.xs, fontFamily: FontFamily.semiBold },
});
