/**
 * components/ui/WelcomeTour.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * First-run welcome tour — a short, skippable, swipeable set of cards shown once
 * (persisted via an AsyncStorage flag by the caller) the first time a member
 * lands on Home. Parents get the full tour; children get a trimmed version.
 *
 * Deliberately dependency-free (a paged ScrollView, no coach-mark library) so it
 * stays robust on the New Architecture build.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, Dimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

interface Slide { emoji: string; title: string; body: string }

const PARENT_SLIDES: Slide[] = [
  { emoji: '🏆', title: 'Welcome to Lootboard', body: "Your family's weekly points showdown. Finish tasks, climb the leaderboard, and win the week." },
  { emoji: '✅', title: 'Just tap to complete', body: 'Tap a task card to mark it done — points land instantly. Tap it again to undo.' },
  { emoji: '👨‍👩‍👧', title: 'One phone, whole family', body: 'Tap a family member at the top to do tasks for a child who doesn\'t have their own phone.' },
  { emoji: '➕', title: 'Add tasks & penalties', body: 'Use the Task button to add chores, and Penalty to log a slip-up. Long-press a task to edit it.' },
  { emoji: '🎁', title: 'Scores & rewards', body: 'See crowns and standings on Scores, and set up prizes kids can redeem on Rewards.' },
  { emoji: '⚙️', title: "You're all set!", body: 'Family, approvals, and settings live under Settings. Have fun and may the best win!' },
];

const CHILD_SLIDES: Slide[] = [
  { emoji: '🏆', title: 'Welcome to Lootboard', body: 'Do your tasks, earn points, and try to win the week!' },
  { emoji: '✅', title: 'Tap to complete', body: 'Tap a task card when you finish it — the points are yours!' },
  { emoji: '🎁', title: 'Climb & win', body: 'Check Scores to see if you\'re winning, and Rewards for prizes to unlock.' },
];

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = Math.min(SCREEN_W - 48, 420);

export function WelcomeTour({ visible, role, onClose }: {
  visible: boolean;
  role?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const slides = role === 'child' ? CHILD_SLIDES : PARENT_SLIDES;
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === slides.length - 1;

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
    if (i !== index) setIndex(i);
  }

  function next() {
    if (isLast) { onClose(); return; }
    const to = index + 1;
    scrollRef.current?.scrollTo({ x: to * CARD_W, animated: true });
    setIndex(to);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { width: CARD_W }]}>
          <TouchableOpacity style={styles.skip} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            style={{ width: CARD_W }}
          >
            {slides.map((s, i) => (
              <View key={i} style={[styles.slide, { width: CARD_W }]}>
                <Text style={styles.emoji}>{s.emoji}</Text>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : null]} />
            ))}
          </View>

          <TouchableOpacity style={styles.cta} onPress={next} activeOpacity={0.85}>
            <Text style={styles.ctaText}>{isLast ? "Let's go! 🚀" : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    sheet: { backgroundColor: colors.surface, borderRadius: BorderRadius.xl ?? 24, paddingTop: Spacing.xl, paddingBottom: Spacing.lg, alignItems: 'center', ...Shadow.lg },
    skip: { position: 'absolute', top: Spacing.md, right: Spacing.md, zIndex: 2, padding: 4 },
    skipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textMuted },
    slide: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
    emoji: { fontSize: 64, marginBottom: Spacing.lg },
    title: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center', marginBottom: Spacing.sm },
    body: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, minHeight: 66 },
    dots: { flexDirection: 'row', gap: 7, marginTop: Spacing.lg, marginBottom: Spacing.lg },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primary, width: 20 },
    cta: { backgroundColor: colors.primary, borderRadius: BorderRadius.full ?? 999, paddingVertical: 13, paddingHorizontal: 40, minWidth: 160, alignItems: 'center' },
    ctaText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFFFFF' },
  });
}
