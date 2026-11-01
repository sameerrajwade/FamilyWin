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
import { router } from 'expo-router';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

// `accent` is a colour-token name (see constants/theme via useTheme) used to tint
// each card's hero circle, so the tour feels designed rather than a flat list.
// `route` (optional) makes a card actionable — a "Take me there" button that
// closes the tour and lands on the real screen it describes, so the walkthrough
// isn't a dead slideshow (feedback #6). `cta` overrides that button's label.
interface Slide { emoji: string; title: string; body: string; accent: string; route?: string; cta?: string }

const PARENT_SLIDES: Slide[] = [
  { emoji: '🏆', accent: 'gold', title: 'Welcome to Chore League', body: 'Chores become a friendly competition. Everyone earns points for what they finish — and whoever\'s ahead when the week resets wins.' },
  { emoji: '✅', accent: 'success', title: 'Just tap to complete', body: 'Tap a task card to mark it done — points land instantly, with a little celebration. Tapped by mistake? Tap again to undo.', route: '/app/tabs', cta: 'Show me my tasks' },
  { emoji: '👨‍👩‍👧', accent: 'primary', title: 'One phone, whole family', body: 'No phone for the kids? Tap a family member at the top to switch into their profile and complete tasks for them.' },
  { emoji: '➕', accent: 'accent', title: 'Add tasks & rewards', body: 'Use Task to add chores and Rewards to add prizes worth saving for. Long-press any task to edit it.', route: '/app/task/create', cta: 'Add a task now' },
  { emoji: '⏰', accent: 'warning', title: 'Busy day? No problem', body: 'Unfinished chores just stay open — there\'s a 2-day window to catch up and still earn them. Want misses to cost points? That\'s optional, in Family → Game rules.', route: '/app/settings/parental', cta: 'Open Game rules' },
  { emoji: '🎁', accent: 'primary', title: 'Scores, rewards & go', body: 'Crowns and standings update live on Scores, and kids spend points on prizes in Rewards. That\'s it — may the best win!', route: '/app/tabs/rewards', cta: 'Go to Rewards' },
];

const CHILD_SLIDES: Slide[] = [
  { emoji: '🏆', accent: 'gold', title: 'Welcome to Chore League', body: 'This is where your chores earn points. Do tasks, stack up points, and try to win the week!' },
  { emoji: '✅', accent: 'success', title: 'Tap to complete', body: 'Finished a task? Tap its card and the points are yours — watch the confetti fly!', route: '/app/tabs', cta: 'Show me my tasks' },
  { emoji: '🔥', accent: 'warning', title: 'Build a streak', body: 'Do something every day to grow your streak and earn bonus points along the way.' },
  { emoji: '🎁', accent: 'primary', title: 'Climb & win', body: 'Check Scores to see if you\'re in the lead, and Rewards for prizes you can unlock with your points.', route: '/app/tabs/rewards', cta: 'Go to Rewards' },
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
  const activeRoute = slides[index]?.route;

  function goTo(route: string) {
    // Close the tour first (persists the seen flag via the caller), then land on
    // the real screen the card is describing.
    onClose();
    setTimeout(() => { try { router.push(route as any); } catch { /* route registers at runtime */ } }, 60);
  }

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

  function back() {
    if (index === 0) return;
    const to = index - 1;
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
            {slides.map((s, i) => {
              const accent = (colors as unknown as Record<string, string>)[s.accent] ?? colors.primary;
              return (
                <View key={i} style={[styles.slide, { width: CARD_W }]}>
                  <View style={[styles.hero, { backgroundColor: accent + '22' }]}>
                    <Text style={styles.emoji}>{s.emoji}</Text>
                  </View>
                  <Text style={styles.title}>{s.title}</Text>
                  <Text style={styles.body}>{s.body}</Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : null]} />
            ))}
          </View>

          {activeRoute && (
            <TouchableOpacity
              style={[styles.jump, { borderColor: colors.primary }]}
              onPress={() => goTo(activeRoute)}
              activeOpacity={0.8}
            >
              <Text style={[styles.jumpText, { color: colors.textAccent }]}>{slides[index].cta ?? 'Take me there'} →</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cta} onPress={next} activeOpacity={0.85}>
            <Text style={styles.ctaText}>{isLast ? "Let's go! 🚀" : 'Next'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.back}
            onPress={back}
            disabled={index === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backText, index === 0 && { opacity: 0 }]}>‹ Back</Text>
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
    hero: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
    emoji: { fontSize: 56 },
    title: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: colors.text, textAlign: 'center', marginBottom: Spacing.sm },
    body: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, minHeight: 88 },
    dots: { flexDirection: 'row', gap: 7, marginTop: Spacing.lg, marginBottom: Spacing.lg },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primary, width: 20 },
    cta: { backgroundColor: colors.primary, borderRadius: BorderRadius.full ?? 999, paddingVertical: 13, paddingHorizontal: 40, minWidth: 160, alignItems: 'center' },
    ctaText: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFFFFF' },
    jump: { borderWidth: 1.5, borderRadius: BorderRadius.full ?? 999, paddingVertical: 10, paddingHorizontal: 28, minWidth: 160, alignItems: 'center', marginBottom: Spacing.sm },
    jumpText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
    back: { marginTop: Spacing.md, padding: 6 },
    backText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textMuted },
  });
}
