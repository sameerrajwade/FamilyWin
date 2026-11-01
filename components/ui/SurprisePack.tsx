/**
 * components/ui/SurprisePack.tsx — the surprise-pack reveal (Phase C8)
 * ─────────────────────────────────────────────────────────────────────────────
 * <SurprisePackReveal familyId memberId /> watches that member's transactions
 * for NEW surprise packs (ids `surprise_day_*` / `surprise_week_*`, written by
 * lib/surprise on a parent's device) and plays a tap-to-open gift reveal once
 * per pack per device. Packs older than 3 days are marked seen silently, so a
 * fresh install doesn't replay history.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, withRepeat } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Col } from '@/lib/firebase';
import { Sounds } from '@/lib/sounds';
import { useTheme } from '@/lib/theme';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { Confetti } from '@/components/ui/Animations';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

interface Pack { id: string; kind: 'daily' | 'weekly'; points: number }
const FRESH_MS = 3 * 86_400_000;

export function SurprisePackReveal({ familyId, memberId, name }: { familyId?: string; memberId?: string; name?: string }) {
  const [queue, setQueue] = useState<Pack[]>([]);
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!familyId || !memberId) return;
    const key = `surprise_seen_${memberId}`;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    AsyncStorage.getItem(key).then((raw) => {
      if (cancelled) return;
      seenRef.current = new Set(raw ? JSON.parse(raw) : []);
      unsub = Col.transactions(familyId).where('memberId', '==', memberId).onSnapshot((snap) => {
        const seen = seenRef.current!;
        const fresh: Pack[] = [];
        let changed = false;
        for (const d of snap.docs) {
          if (!d.id.startsWith('surprise_') || seen.has(d.id)) continue;
          const x = d.data();
          const when = x.createdAt?.toDate?.()?.getTime?.() ?? 0;
          seen.add(d.id); changed = true;
          if (Date.now() - when < FRESH_MS && (x.delta ?? 0) > 0) {
            fresh.push({ id: d.id, kind: x.surprise === 'weekly' ? 'weekly' : 'daily', points: x.delta });
          }
        }
        if (changed) AsyncStorage.setItem(key, JSON.stringify(Array.from(seen).slice(-200))).catch(() => {});
        // Weekly first — it's the bigger moment.
        if (fresh.length) setQueue((q) => [...q, ...fresh.sort((a) => (a.kind === 'weekly' ? -1 : 1))]);
      }, () => {});
    }).catch(() => {});
    return () => { cancelled = true; unsub?.(); };
  }, [familyId, memberId]);

  const current = queue[0] ?? null;
  return <RevealModal pack={current} name={name} onDone={() => setQueue((q) => q.slice(1))} />;
}

function RevealModal({ pack, name, onDone }: { pack: Pack | null; name?: string; onDone: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [opened, setOpened] = useState(false);
  const scale = useSharedValue(0.4);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (!pack) return;
    setOpened(false);
    scale.value = withSpring(1, { damping: 9, stiffness: 140 });
    wiggle.value = withRepeat(withSequence(withTiming(-8, { duration: 90 }), withTiming(8, { duration: 90 }), withTiming(0, { duration: 90 })), -1, false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [pack?.id]);

  const giftStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${wiggle.value}deg` }] }));

  function open() {
    wiggle.value = 0;
    scale.value = withSequence(withTiming(1.25, { duration: 140 }), withSpring(1));
    setOpened(true);
    Sounds.taskComplete();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  if (!pack) return null;
  const weekly = pack.kind === 'weekly';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.overlay}>
        <Confetti visible={opened} count={weekly ? 140 : 90} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{weekly ? 'PERFECT WEEK' : 'ALL TASKS DONE'}</Text>
          <Text style={styles.title}>{opened ? `+${pack.points} points!` : `${name ? name + ', a' : 'A'} surprise pack!`}</Text>
          <TouchableOpacity onPress={opened ? undefined : open} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={opened ? `${pack.points} bonus points` : 'Open your surprise pack'}>
            <Animated.View style={giftStyle}>
              <EmojiIcon emoji={opened ? (weekly ? '🏆' : '💰') : '🎁'} size={weekly ? 150 : 128} />
            </Animated.View>
          </TouchableOpacity>
          <Text style={styles.sub}>
            {opened
              ? (weekly ? 'You finished every day this week. Legendary!' : 'You finished every task today. Keep the streak going!')
              : 'Tap the gift to open it'}
          </Text>
          {opened && (
            <TouchableOpacity style={styles.btn} onPress={onDone} accessibilityRole="button">
              <Text style={styles.btnText}>Awesome!</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 28, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
    eyebrow: { fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 1.2, color: colors.textAccent },
    title: { fontSize: 26, fontFamily: FontFamily.black ?? FontFamily.extraBold, color: colors.text, textAlign: 'center' },
    sub: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: colors.textSecondary, textAlign: 'center' },
    btn: { backgroundColor: colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.xl, paddingVertical: 12, marginTop: Spacing.sm },
    btnText: { color: '#FFFFFF', fontFamily: FontFamily.extraBold, fontSize: FontSize.md },
  });
}
