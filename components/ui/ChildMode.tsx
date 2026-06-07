import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import type { TaskWithCompletion } from '@/types';

const { width: W } = Dimensions.get('window');

// ─── MASCOT COMPONENT ─────────────────────────────────────────────────────────
// Animated mascot star that bounces and reacts to events

interface MascotProps {
  mood: 'happy' | 'excited' | 'waiting' | 'celebrating';
  message?: string;
}

export function Mascot({ mood, message }: MascotProps) {
  const bounce = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  const MASCOT_EMOJIS = {
    happy: '⭐',
    excited: '🌟',
    waiting: '😊',
    celebrating: '🎉',
  };

  useEffect(() => {
    if (mood === 'celebrating') {
      // Spin and scale burst
      scale.value = withSequence(
        withSpring(1.5, { damping: 5, stiffness: 300 }),
        withSpring(1, { damping: 10 }),
      );
      rotate.value = withSequence(
        withTiming(360, { duration: 600, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
      );
    } else if (mood === 'excited') {
      // Fast bounce
      bounce.value = withRepeat(
        withSequence(
          withTiming(-16, { duration: 300, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }),
        ),
        -1,
        false,
      );
    } else {
      // Gentle float
      bounce.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    }
  }, [mood]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bounce.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.mascotContainer}>
      <Animated.Text style={[styles.mascotEmoji, animStyle]}>
        {MASCOT_EMOJIS[mood]}
      </Animated.Text>
      {message ? (
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>{message}</Text>
          <View style={styles.speechTail} />
        </View>
      ) : null}
    </View>
  );
}

// ─── CHILD TASK CARD ──────────────────────────────────────────────────────────
// Large, colorful, emoji-heavy task card for children

interface ChildTaskCardProps {
  task: TaskWithCompletion;
  onComplete: (task: TaskWithCompletion) => void;
  onUndo?: (task: TaskWithCompletion) => void;
  isCompleting?: boolean;
  index: number;
}

export function ChildTaskCard({ task, onComplete, onUndo, isCompleting, index }: ChildTaskCardProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(0);
  const isDone = !!task.completion && !task.completion.was_auto_failed;
  const isFailed = task.completion?.was_auto_failed;

  useEffect(() => {
    scale.value = withDelay(
      index * 100,
      withSpring(1, { damping: 14, stiffness: 150 }),
    );
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const categoryConfig: Record<string, { emoji: string; bg: string }> = {
    chores: { emoji: '🧹', bg: '#E3F2FD' },
    homework: { emoji: '📚', bg: '#F3E5F5' },
    hygiene: { emoji: '🚿', bg: '#E0F7FA' },
    behavior: { emoji: '⭐', bg: '#FFF8E1' },
    extras: { emoji: '🎯', bg: '#E8F5E9' },
  };

  const config = categoryConfig[task.category] ?? { emoji: '📌', bg: '#F5F5F5' };

  return (
    <Animated.View style={[styles.childCard, { backgroundColor: config.bg }, cardStyle]}>
      <TouchableOpacity
        style={styles.childCardInner}
        onPress={() => {
          if (isCompleting) return;
          if (isDone && !isFailed) { onUndo?.(task); return; }
          if (!isDone && !isFailed) onComplete(task);
        }}
        disabled={isFailed || isCompleting}
        activeOpacity={0.8}
      >
        {/* Big emoji + title */}
        <View style={styles.childCardTop}>
          <Text style={styles.childCardEmoji}>{config.emoji}</Text>
          <View style={styles.childCardInfo}>
            <Text style={[styles.childCardTitle, isDone && styles.childCardTitleDone]}>
              {task.title}
            </Text>
            <View style={styles.childCardPoints}>
              <Text style={styles.childCardPointsText}>
                {isDone ? '✅ Done! (tap to undo)' : isFailed ? '❌ Missed' : `🏅 +${task.point_value} pts`}
              </Text>
            </View>
          </View>
        </View>

        {/* Big action button */}
        {!isDone && !isFailed && (
          <TouchableOpacity
            style={[styles.childCompleteBtn, { backgroundColor: colors.primary }]}
            onPress={() => onComplete(task)}
            activeOpacity={0.85}
          >
            <Text style={styles.childCompleteBtnText}>
              {isCompleting ? '⏳' : '✓ Done!'}
            </Text>
          </TouchableOpacity>
        )}

        {isDone && (
          <View style={[styles.childDoneBadge, { backgroundColor: colors.success }]}>
            <Text style={styles.childDoneBadgeText}>✓ Completed!</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── CELEBRATION OVERLAY ──────────────────────────────────────────────────────
// Full-screen celebration shown when all tasks are done

interface CelebrationOverlayProps {
  visible: boolean;
  memberName: string;
  totalPoints: number;
  onDismiss: () => void;
}

export function CelebrationOverlay({ visible, memberName, totalPoints, onDismiss }: CelebrationOverlayProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const starScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 10, stiffness: 120 });
      starScale.value = withDelay(300, withSpring(1, { damping: 6, stiffness: 200 }));
    } else {
      opacity.value = withTiming(0, { duration: 300 });
      scale.value = withTiming(0.8, { duration: 300 });
      starScale.value = withTiming(0);
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const starStyle = useAnimatedStyle(() => ({ transform: [{ scale: starScale.value }] }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.celebrationOverlay, overlayStyle]}>
      <Animated.View style={[styles.celebrationCard, cardStyle]}>
        <Animated.Text style={[styles.celebrationStar, starStyle]}>🏆</Animated.Text>
        <Text style={styles.celebrationTitle}>Amazing, {memberName}!</Text>
        <Text style={styles.celebrationSubtitle}>All tasks done today! 🎉</Text>
        <View style={styles.celebrationPoints}>
          <Text style={styles.celebrationPointsValue}>+{totalPoints}</Text>
          <Text style={styles.celebrationPointsLabel}>points earned today!</Text>
        </View>
        <TouchableOpacity style={styles.celebrationBtn} onPress={onDismiss} activeOpacity={0.85}>
          <Text style={styles.celebrationBtnText}>Woohoo! 🎊</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── PROGRESS RING ────────────────────────────────────────────────────────────

interface ProgressRingProps {
  progress: number; // 0–1
  size?: number;
  strokeWidth?: number;
  color?: string;
  children?: React.ReactNode;
}

export function ProgressRing({ progress, size = 80, strokeWidth = 8, color = '#6C63FF', children }: ProgressRingProps) {
  const animProgress = useSharedValue(0);

  useEffect(() => {
    animProgress.value = withTiming(progress, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animStyle = useAnimatedStyle(() => ({
    strokeDashoffset: circumference * (1 - animProgress.value),
  } as any));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {children}
      </Animated.View>
      {/* SVG-like circular ring using border */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: color + '22',
        position: 'absolute',
      }} />
      {/* Filled arc approximated with rotating view */}
      <Animated.View style={[{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: color,
        borderTopColor: 'transparent', borderRightColor: 'transparent',
        position: 'absolute',
        transform: [{ rotate: `${progress * 360 - 90}deg` }],
      }]} />
    </View>
  );
}

// ─── STREAK FLAME ─────────────────────────────────────────────────────────────

interface StreakFlameProps {
  streak: number;
}

export function StreakFlame({ streak }: StreakFlameProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (streak === 0) return null;

  return (
    <View style={styles.streakContainer}>
      <Animated.Text style={[styles.streakFlame, animStyle]}>🔥</Animated.Text>
      <Text style={styles.streakCount}>{streak}</Text>
    </View>
  );
}

// ─── WEEKLY WIN BANNER ────────────────────────────────────────────────────────

interface WeeklyWinBannerProps {
  winnerName: string;
  winnerEmoji: string;
  points: number;
  onDismiss: () => void;
}

export function WeeklyWinBanner({ winnerName, winnerEmoji, points, onDismiss }: WeeklyWinBannerProps) {
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 14, stiffness: 120 });
    opacity.value = withTiming(1, { duration: 300 });

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      translateY.value = withTiming(-120, { duration: 400 });
      opacity.value = withTiming(0, { duration: 400 });
      setTimeout(onDismiss, 400);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.winBanner, animStyle]}>
      <Text style={styles.winBannerEmoji}>{winnerEmoji}</Text>
      <View style={styles.winBannerInfo}>
        <Text style={styles.winBannerTitle}>🏆 {winnerName} wins this week!</Text>
        <Text style={styles.winBannerSubtitle}>{points} points · New week starts now</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={styles.winBannerClose}>
        <Text style={styles.winBannerCloseText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Mascot
  mascotContainer: { alignItems: 'center', marginVertical: 8 },
  mascotEmoji: { fontSize: 64 },
  speechBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxWidth: W * 0.7,
  },
  speechText: { fontSize: 14, fontFamily: 'Nunito-Bold', color: '#1A1A2E', textAlign: 'center' },
  speechTail: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },

  // Child task card
  childCard: { borderRadius: 20, marginBottom: 12, overflow: 'hidden' },
  childCardInner: { padding: 16 },
  childCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  childCardEmoji: { fontSize: 48, marginRight: 12 },
  childCardInfo: { flex: 1 },
  childCardTitle: { fontSize: 20, fontFamily: 'Nunito-ExtraBold', color: '#1A1A2E', lineHeight: 26 },
  childCardTitleDone: { textDecorationLine: 'line-through', opacity: 0.6 },
  childCardPoints: { marginTop: 4 },
  childCardPointsText: { fontSize: 16, fontFamily: 'Nunito-Bold', color: '#6B7280' },
  childCompleteBtn: {
    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  childCompleteBtnText: { fontSize: 20, fontFamily: 'Nunito-Black', color: '#FFFFFF', letterSpacing: 0.5 },
  childDoneBadge: { borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  childDoneBadgeText: { fontSize: 18, fontFamily: 'Nunito-Bold', color: '#FFFFFF' },

  // Celebration overlay
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  celebrationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    width: W * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
  },
  celebrationStar: { fontSize: 80, marginBottom: 16 },
  celebrationTitle: { fontSize: 28, fontFamily: 'Nunito-Black', color: '#1A1A2E', textAlign: 'center' },
  celebrationSubtitle: { fontSize: 18, fontFamily: 'Nunito-Regular', color: '#6B7280', marginTop: 8, textAlign: 'center' },
  celebrationPoints: { marginTop: 24, alignItems: 'center' },
  celebrationPointsValue: { fontSize: 56, fontFamily: 'Nunito-Black', color: '#6C63FF' },
  celebrationPointsLabel: { fontSize: 16, fontFamily: 'Nunito-SemiBold', color: '#6B7280' },
  celebrationBtn: {
    marginTop: 28, backgroundColor: '#6C63FF', borderRadius: 20,
    paddingHorizontal: 40, paddingVertical: 16,
    shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  celebrationBtnText: { fontSize: 20, fontFamily: 'Nunito-Black', color: '#FFFFFF', letterSpacing: 0.5 },

  // Streak
  streakContainer: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakFlame: { fontSize: 20 },
  streakCount: { fontSize: 16, fontFamily: 'Nunito-ExtraBold', color: '#FFB347' },

  // Win banner
  winBanner: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 52,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  winBannerEmoji: { fontSize: 36, marginRight: 12 },
  winBannerInfo: { flex: 1 },
  winBannerTitle: { fontSize: 15, fontFamily: 'Nunito-ExtraBold', color: '#1A1A2E' },
  winBannerSubtitle: { fontSize: 12, fontFamily: 'Nunito-Regular', color: '#4A4A4A', marginTop: 2 },
  winBannerClose: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  winBannerCloseText: { fontSize: 18, color: '#1A1A2E', fontFamily: 'Nunito-Bold' },
});
