import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withSequence, withTiming, withDelay, withRepeat, Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';

const { width: W } = Dimensions.get('window');

interface Slide {
  emoji: string;
  title: string;
  subtitle: string;
  bg: string;
  accent: string;
  features: string[];
}

const SLIDES: Slide[] = [
  {
    emoji: '🏆',
    title: 'Welcome to\nFamilyWin!',
    subtitle: 'Turn everyday chores into an exciting family competition',
    bg: '#6C63FF',
    accent: '#FFFFFF',
    features: ['📋 Assign tasks', '⭐ Earn points', '🏅 Win the week'],
  },
  {
    emoji: '✅',
    title: 'Tasks &\nPoints',
    subtitle: 'Complete tasks to earn points. Miss them and lose points automatically.',
    bg: '#43D98F',
    accent: '#FFFFFF',
    features: ['🔄 Daily & weekly tasks', '⚠️ Auto-fail at deadline', '🔥 Build streaks'],
  },
  {
    emoji: '🥇',
    title: 'Family\nLeaderboard',
    subtitle: 'See who\'s winning in real time. The top scorer wins the week!',
    bg: '#FFB347',
    accent: '#FFFFFF',
    features: ['📊 Live leaderboard', '🏆 Weekly winner', '📱 Push notifications'],
  },
  {
    emoji: '🎁',
    title: 'Rewards\nStore',
    subtitle: 'Spend your points on rewards that parents create — screen time, treats and more!',
    bg: '#FF6584',
    accent: '#FFFFFF',
    features: ['🛍️ Custom rewards', '✅ Parent approval', '💰 Points economy'],
  },
];

export default function SplashOnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  async function handleFinish() {
    await AsyncStorage.setItem('onboarding_done', 'true');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/auth/register');
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      Haptics.selectionAsync();
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      setCurrentIndex(next);
    } else {
      handleFinish();
    }
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    setCurrentIndex(idx);
  }

  const slide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: slide.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((s, i) => (
          <SlideView key={i} slide={s} isActive={i === currentIndex} />
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === currentIndex ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                width: i === currentIndex ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
        <Text style={[styles.nextBtnText, { color: slide.bg }]}>
          {isLast ? "Let's Start! 🚀" : 'Next →'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function SlideView({ slide, isActive }: { slide: Slide; isActive: boolean }) {
  const emojiScale = useSharedValue(isActive ? 1 : 0.8);
  const emojiY = useSharedValue(0);

  React.useEffect(() => {
    if (isActive) {
      emojiScale.value = withSpring(1, { damping: 10, stiffness: 120 });
      emojiY.value = withRepeat(
        withSequence(
          withTiming(-12, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    }
  }, [isActive]);

  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emojiScale.value }, { translateY: emojiY.value }],
  }));

  return (
    <View style={styles.slide}>
      <Animated.Text style={[styles.slideEmoji, emojiStyle]}>{slide.emoji}</Animated.Text>
      <Text style={styles.slideTitle}>{slide.title}</Text>
      <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>

      <View style={styles.featureList}>
        {slide.features.map((f, i) => (
          <Animated.View
            key={i}
            style={[
              styles.featureChip,
              { opacity: isActive ? 1 : 0 },
            ]}
          >
            <Text style={styles.featureText}>{f}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: { position: 'absolute', top: 60, right: Spacing.lg, zIndex: 10, padding: Spacing.sm },
  skipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: 'rgba(255,255,255,0.8)' },
  scrollView: { flex: 1 },
  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  slideEmoji: { fontSize: 100, marginBottom: Spacing.xl },
  slideTitle: {
    fontSize: 36,
    fontFamily: FontFamily.black,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: Spacing.md,
  },
  slideSubtitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: Spacing.xl,
  },
  featureList: { gap: Spacing.sm, width: '100%' },
  featureChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  featureText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: Spacing.lg,
  },
  dot: { height: 8, borderRadius: 4 },
  nextBtn: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    paddingVertical: 18,
    alignItems: 'center',
    ...Shadow.lg,
  },
  nextBtnText: { fontSize: FontSize.lg, fontFamily: FontFamily.black, letterSpacing: 0.5 },
});
